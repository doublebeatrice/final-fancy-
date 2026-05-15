#!/usr/bin/env node
// Lean low-efficiency runner. Skips snapshot, schema, validation, daily_learning,
// audits, listing, inventory, overBudget, 7day_untouched. Just:
//   1. seed kwCapture in the extension panel
//   2. fetch 5 ad types × 4 windows = 20 low-efficiency pools
//   3. classify + PATCH locally allowed actions
//   4. append to adjustments_<date>.json

const fs = require('fs');
const path = require('path');
const { createPanelWs, today, SNAPSHOTS_DIR } = require('../../src/adjust_lib');
const {
  decideFromPoolMembership,
  scanLowEfficiencyPools,
  normalizeLowEfficiencyRow,
  buildWriterRequest,
} = require('../../src/low_efficiency_decision');
const { appendAdjustmentRecords } = require('../../src/adjustment_log');

const ROOT = path.join(__dirname, '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const COOLDOWN_DAYS = Number(process.env.LOW_EFFICIENCY_COOLDOWN_DAYS || 14);

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function withPanelWs(handler) {
  const ws = await createPanelWs();
  await new Promise(resolve => ws.on('open', resolve));
  const evalInPanel = (expression, awaitPromise = false) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const onMsg = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', onMsg);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const inner = response.result?.exceptionDetails;
      if (inner) return reject(new Error(inner.exception?.description || inner.text));
      resolve(response.result?.result?.value);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: !!awaitPromise } }));
  });
  try {
    return await handler(evalInPanel);
  } finally {
    ws.close();
  }
}

const KIND_TO_NORMALIZER = {
  kw: 'spKeyword',
  auto: 'spAuto',
  manual: 'spTarget',
  sbKw: 'sbKeyword',
  sbTarget: 'sbTarget',
};

function poolEntryToEntity(kind, entry) {
  const row = {
    [kind === 'kw' || kind === 'sbKw' ? 'keywordId' : 'targetId']: entry.id,
    keywordText: entry.keywordText,
    matchType: entry.matchType,
    campaignId: entry.campaignId,
    adGroupId: entry.adGroupId,
    accountId: entry.accountId,
    siteId: entry.siteId || 4,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    state: entry.state ?? 1,
    campaignState: entry.campaignState ?? 1,
    groupState: entry.groupState ?? 1,
    bid: entry.bid,
    updatedAt: entry.updatedAt,
    operatedAt: entry.operatedAt,
  };
  const w = entry.windows || {};
  return normalizeLowEfficiencyRow(KIND_TO_NORMALIZER[kind], row, {
    metrics: {
      30: w['30'] || {},
      15: w['15'] || {},
      7: w['7'] || {},
      3: w['3'] || {},
    },
  });
}

async function patchInPanel(evalInPanel, request) {
  const expression = `execAdWrite(${JSON.stringify(request.url)}, ${JSON.stringify(request.body)})`;
  return evalInPanel(expression, true);
}

async function main() {
  const startedAt = Date.now();
  log(`mode=${DRY_RUN ? 'dry-run' : 'EXECUTE'} cooldownDays=${COOLDOWN_DAYS}`);

  let pools;
  await withPanelWs(async (evalInPanel) => {
    log('triggering runLowEfficiencyOnly() in panel…');
    pools = await evalInPanel('runLowEfficiencyOnly().then(r => JSON.parse(JSON.stringify(r)))', true);
  });
  const total = Object.values(pools || {}).reduce((a, r) => a + (r?.length || 0), 0);
  log(`pools fetched: ${total} rows (kw=${pools?.kw?.length || 0} auto=${pools?.auto?.length || 0} manual=${pools?.manual?.length || 0} sbKw=${pools?.sbKw?.length || 0} sbTarget=${pools?.sbTarget?.length || 0})`);

  const fakeSnapshot = { lowEfficiencyRows: pools };
  const scan = scanLowEfficiencyPools(fakeSnapshot, { now: new Date(), cooldownDays: COOLDOWN_DAYS });
  log(`decisions: actionable=${scan.summary.totals.actionable} hold=${scan.summary.totals.hold} skip=${scan.summary.totals.skip}`);

  const actionables = [];
  for (const [kind, decisions] of Object.entries(scan.results)) {
    for (const { entry, decision } of decisions) {
      if (decision.actionType !== 'bid' && decision.actionType !== 'pause') continue;
      actionables.push({ kind, entry, decision });
    }
  }

  if (!actionables.length) {
    log('nothing to execute today. done.');
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(`total runtime: ${elapsed}s`);
    return;
  }

  log('actionable detail:');
  actionables.forEach((a, i) => {
    const e = a.entry;
    const text = e.keywordText || '(target)';
    const action = a.decision.actionType === 'bid'
      ? `${e.bid} → ${a.decision.suggestedBid}`
      : 'PAUSE';
    log(`  ${i + 1}. [${a.kind}] id=${e.id} text="${text}" pattern=${a.decision.pattern} ${action}`);
  });

  const executions = [];
  if (!DRY_RUN) {
    await withPanelWs(async (evalInPanel) => {
      for (const { kind, entry, decision } of actionables) {
        const entity = poolEntryToEntity(kind, entry);
        const request = buildWriterRequest(entity, decision);
        try {
          const result = await patchInPanel(evalInPanel, request);
          const data = result || {};
          const successList = Array.isArray(data?.data?.success) ? data.data.success : [];
          const errorList = Array.isArray(data?.data?.error) ? data.data.error : [];
          const ok = Number(data.code) === 200 && successList.length > 0 && errorList.length === 0;
          log(`  PATCH ${request.url} id=${entry.id}: ${ok ? 'ok' : 'failed'} ${JSON.stringify(result || {}).slice(0, 200)}`);
          executions.push({ kind, entry, decision, request, result, ok });
        } catch (err) {
          log(`  PATCH ${request.url} id=${entry.id}: error ${err.message}`);
          executions.push({ kind, entry, decision, request, error: err.message, ok: false });
        }
      }
    });
  }

  const businessDate = today;
  const records = actionables.map(({ kind, entry, decision }, i) => {
    const exec = executions[i] || {};
    const text = entry.keywordText || '';
    const ENTITY_TYPE = { kw: 'keyword', auto: 'autoTarget', manual: 'manualTarget', sbKw: 'sbKeyword', sbTarget: 'sbTarget' };
    return {
      sku: entry.sku || `lowEff::${kind}::${entry.id}`,
      asin: '',
      site: 'Amazon.com',
      action: {
        entityType: ENTITY_TYPE[kind],
        actionType: decision.actionType,
        id: entry.id,
        text,
        campaignId: entry.campaignId,
        adGroupId: entry.adGroupId,
        currentBid: Number(entry.bid) || 0,
        suggestedBid: decision.suggestedBid || null,
        reason: `[low_efficiency_pool:${decision.pattern}:${decision.reasonCode}] ${decision.reason}`,
        approvedBy: 'claude',
        decisionStage: 'ai_approved',
        actionSource: ['claude'],
      },
      outcome: DRY_RUN ? 'dry_run_planned' : (exec.ok ? 'api_success' : 'api_failed'),
      dryRun: DRY_RUN,
      reason: exec.error || '',
    };
  });

  const timeContext = {
    runAt: new Date().toISOString(),
    businessDate,
    sourceRunId: `low_efficiency_${businessDate}_${Date.now()}`,
  };
  if (DRY_RUN) {
    log('dry-run: skipping adjustments log write.');
  } else {
    const result = appendAdjustmentRecords(records.map(r => ({ ...r, runAt: timeContext.runAt, businessDate: timeContext.businessDate, sourceRunId: timeContext.sourceRunId })), { timeContext });
    log(`adjustments appended to ${result.file} (${result.count} records)`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const apiOk = executions.filter(e => e.ok).length;
  const apiFail = executions.filter(e => !e.ok && !DRY_RUN).length;
  log(`done. actionable=${actionables.length} api_ok=${apiOk} api_failed=${apiFail} total_runtime=${elapsed}s`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
