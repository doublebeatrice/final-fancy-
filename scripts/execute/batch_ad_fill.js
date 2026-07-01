'use strict';

// Batch ad-fill orchestrator. One command turns a spec (a set of SKUs + their
// words) into all the missing ad lanes, reusing the canonical single-create flows
// so payloads are identical to a manual create. The point is operator speed:
// "全体补 B2B 自动组+关键词组+缺的 SBV" becomes one command, ~1 min for the SP lanes.
//
//   node scripts/execute/batch_ad_fill.js --spec soccer_line --lanes b2b-auto,b2b-keyword [--execute]
//   node scripts/execute/batch_ad_fill.js --spec soccer_line --lanes sbv [--execute]
//   node scripts/execute/batch_ad_fill.js --spec soccer_line --lanes all [--execute]
//
// Lanes: b2b-auto | b2b-keyword | sbv | all. Existing same-lane structure is
// auto-skipped (the create flow's duplicate guard reports duplicate_structure,
// which we treat as "already filled, skip" — NOT a failure). Default is dry-run.
//
// SBV is gated on Amazon's async asset ingest: if the video is not yet in the
// Amazon library by ASIN, this triggers the OSS->Amazon sync (uploadAsset) and
// reports "pending ingest" instead of failing — the hourly recheck builds it once
// the asset lands. See reference_sbv_asset_sync_chain.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { runSpCreateFlow } = require('../../src/sp_create_flow');
const { runSbvCreateFlow, buildPlanFromArgs } = require('../../src/sbv_create_flow');
const { openAdvWs } = require('../../src/adv_backend');

const ROOT = path.join(__dirname, '..', '..');
const SPEC_DIR = path.join(ROOT, 'data', 'specs');
const ACTIONS_DIR = path.join(ROOT, 'data', 'actions');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, inline] = a.slice(2).split('=');
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inline !== undefined) { out[key] = inline; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function loadSpec(name) {
  const file = name.endsWith('.json') ? name : path.join(SPEC_DIR, `ad_fill_${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function todayYmd() { return new Date().toISOString().slice(0, 10); }

// Map a create-flow result to a compact action-sheet row.
function rowFromSp(sku, lane, res) {
  const e = res.execution || {};
  const reason = e.reason || '';
  const skipped = reason === 'duplicate_structure';
  return {
    sku, lane,
    status: skipped ? 'skipped(已有)' : (res.ok && e.createOk ? 'created' : (res.dryRun ? 'dry-run' : 'failed')),
    campaignId: e.createMeta?.campaignId || '',
    adGroupId: e.createMeta?.adGroupId || '',
    name: res.plan?.campaignName || res.built?.campaignName || '',
    detail: skipped ? (e.message || '').slice(0, 80) : (e.error || e.note || reason || '').slice(0, 80),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = !!args.execute;
  const spec = loadSpec(String(args.spec || 'soccer_line'));
  const lanesArg = String(args.lanes || 'b2b-auto,b2b-keyword').toLowerCase();
  const lanes = lanesArg === 'all'
    ? ['b2b-auto', 'b2b-keyword', 'sbv']
    : lanesArg.split(',').map(s => s.trim()).filter(Boolean);
  const d = spec.defaults || {};
  const siteId = spec.siteId || 4;
  const startedAt = Date.now();
  const rows = [];
  const sbvNotes = [];

  for (const item of spec.skus) {
    const sku = item.sku;

    if (lanes.includes('b2b-auto')) {
      const argv = ['--sku', sku, '--mode', 'auto', '--b2b', '--bid', String(d.b2bAutoBid ?? 0.7),
        '--budget', String(d.b2bBudget ?? 3), '--core-term', item.coreTerm, '--site-id', String(siteId)];
      if (execute) argv.push('--execute');
      rows.push(rowFromSp(sku, 'b2b-auto', await runSpCreateFlow(argv)));
    }

    if (lanes.includes('b2b-keyword')) {
      const argv = ['--sku', sku, '--mode', 'keyword', '--b2b', '--bid', String(d.b2bKwBid ?? 0.7),
        '--budget', String(d.b2bBudget ?? 3), '--core-term', item.coreTerm,
        '--keywords', (item.b2bKeywords || []).join(','), '--site-id', String(siteId)];
      if (execute) argv.push('--execute');
      rows.push(rowFromSp(sku, 'b2b-keyword', await runSpCreateFlow(argv)));
    }

    if (lanes.includes('sbv') && item.sbv) {
      // Gate on Amazon asset availability first. sync_sbv_asset dry-run reports
      // whether the asset is already in the Amazon library by ASIN.
      let landed = false;
      try {
        const probe = execFileSync('node', [path.join('scripts', 'execute', 'sync_sbv_asset.js'), '--sku', sku],
          { cwd: ROOT, encoding: 'utf8' });
        const j = JSON.parse(probe);
        landed = !!(j.before && j.before.matched);
        if (!landed && execute) {
          // Not in library yet — trigger the OSS->Amazon sync so ingest starts.
          execFileSync('node', [path.join('scripts', 'execute', 'sync_sbv_asset.js'), '--sku', sku, '--execute'],
            { cwd: ROOT, encoding: 'utf8' });
        }
      } catch (e) { sbvNotes.push(`${sku}: asset probe failed: ${String(e.message).slice(0, 100)}`); }

      if (landed) {
        const sbvArgs = {
          sku, coreTerm: item.sbv.coreTerm, keywords: item.sbv.keywords.join(','),
          bid: String(d.sbvBid ?? 1.0), budget: String(d.sbvBudget ?? 10), siteId: String(siteId),
        };
        const plan = buildPlanFromArgs(sbvArgs);
        const r = await runSbvCreateFlow({ args: sbvArgs, plan, execute, date: todayYmd() });
        const ex = r.out.execution || {};
        rows.push({
          sku, lane: 'sbv',
          status: r.out.ok ? (execute ? 'created' : 'dry-run') : `skipped(${ex.reason || 'n/a'})`,
          campaignId: ex.createMeta?.campaignId || '', adGroupId: ex.createMeta?.adGroupId || '',
          name: r.out.plan?.plan?.campaignName || '', detail: (ex.reason || '').slice(0, 80),
        });
      } else {
        rows.push({ sku, lane: 'sbv', status: 'pending-amazon-ingest', campaignId: '', adGroupId: '', name: '',
          detail: '视频已uploadAsset受理,等Amazon异步入库后由每时回读自动建' });
      }
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  const summary = {
    spec: spec.name, lanes, dryRun: !execute, elapsedSeconds: elapsed,
    counts: {
      created: rows.filter(r => r.status === 'created').length,
      skipped: rows.filter(r => r.status.startsWith('skipped')).length,
      pending: rows.filter(r => r.status.startsWith('pending')).length,
      failed: rows.filter(r => r.status === 'failed').length,
      dryRun: rows.filter(r => r.status === 'dry-run').length,
    },
    rows, sbvNotes,
  };
  const outFile = path.join(ACTIONS_DIR, `batch_ad_fill_${spec.name}_${todayYmd()}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');
  summary.artifact = outFile;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
