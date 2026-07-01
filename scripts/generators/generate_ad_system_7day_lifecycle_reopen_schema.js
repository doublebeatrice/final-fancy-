const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');

function argsMap(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else out[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function num(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function skuKey(value) {
  return text(value).toUpperCase();
}

function enabled(value) {
  const t = text(value).toLowerCase();
  return t === '' || t === '1' || t === 'enabled' || t === 'enable' || t === 'active' || t === 'ad_status_live' || t === 'eligible';
}

function paused(value) {
  const t = text(value).toLowerCase();
  return t === '2' || /paused|disabled|ended|archived/.test(t);
}

function stat(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend ?? s.Spend),
    orders: num(s.orders ?? s.Orders),
    sales: num(s.sales ?? s.Sales),
    clicks: num(s.clicks ?? s.Clicks),
    impressions: num(s.impressions ?? s.Impressions),
    acos: num(s.acos ?? s.ACOS),
  };
}

function acosFor(stats) {
  if (stats.acos > 0) return stats.acos;
  if (stats.sales > 0) return stats.spend / stats.sales;
  return stats.spend > 0 ? 99 : 0;
}

function entityId(row) {
  return text(row.id || row.keywordId || row.keyword_id || row.targetId || row.target_id || row.adId || row.ad_id);
}

function labelFor(row) {
  return text(row.text || row.keywordText || row.targetText || row.targetingExpression || row.expression || row.asin || row.targetType || row.entityType);
}

function ymd(value) {
  return text(value).slice(0, 10);
}

function poolStats(row) {
  return {
    spend: num(row.Spend ?? row.spend),
    orders: num(row.Orders ?? row.orders),
    sales: num(row.Sales ?? row.sales),
    clicks: num(row.Clicks ?? row.clicks),
    impressions: num(row.Impressions ?? row.impressions),
    acos: num(row.ACOS ?? row.acos),
  };
}

function rowsOfCampaign(campaign, channel) {
  const base = {
    campaignId: text(campaign.campaignId),
    adGroupId: text(campaign.adGroupId),
    campaignName: text(campaign.name || campaign.campaignName),
    groupName: text(campaign.groupName || campaign.adGroupName),
    campaignState: campaign.campaignState ?? campaign.state ?? '',
    groupState: campaign.groupState ?? '',
  };
  const rows = [];
  if (channel === 'SP') {
    for (const row of campaign.keywords || []) rows.push({ ...row, ...base, entityType: 'keyword' });
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, ...base, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget' });
    }
  } else {
    for (const row of campaign.sponsoredBrands || []) {
      rows.push({ ...row, ...base, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword' });
    }
  }
  return rows;
}

function candidateScore(row) {
  const s30 = stat(row, '30d');
  const s7 = stat(row, '7d');
  return s30.orders * 100 + s7.orders * 150 + s30.clicks + s30.spend * 2 - acosFor(s30) * 10;
}

function isReopenCandidate(row, date) {
  if (!['keyword', 'autoTarget', 'manualTarget', 'sbKeyword', 'sbTarget'].includes(row.entityType)) return false;
  if (!entityId(row) || !(num(row.bid) > 0)) return false;
  if (!paused(row.state)) return false;
  if (!enabled(row.campaignState) || !enabled(row.groupState)) return false;
  if (row.onCooldown || ymd(row.updatedAt || row.operatedAt || row.lastAdvUpdatedDate || row.manualAdjustTheTime) === date) return false;

  const s30 = stat(row, '30d');
  const s7 = stat(row, '7d');
  const a30 = acosFor(s30);
  const a7 = acosFor(s7);
  return (s30.orders >= 1 && a30 > 0 && a30 <= 0.24) || (s7.orders >= 1 && a7 > 0 && a7 <= 0.2);
}

function buildAction(card, row, poolRow, channel, date) {
  const s30 = stat(row, '30d');
  const s7 = stat(row, '7d');
  const pool = poolStats(poolRow);
  const id = entityId(row);
  const label = labelFor(row);
  return {
    id,
    entityType: row.entityType,
    actionType: 'enable',
    currentState: text(row.state) || 'paused',
    text: label,
    label,
    currentBid: num(row.bid),
    campaignId: text(row.campaignId || poolRow.campaignId),
    adGroupId: text(row.adGroupId || poolRow.adGroupId),
    campaignName: text(row.campaignName || poolRow.campaignName || poolRow.name),
    groupName: text(row.groupName || poolRow.groupName),
    reason: 'ad_system_7day_lifecycle_reopen: bid-only clearing had no enabled writable lower-layer entity; reopen one historically converting paused lower-layer entity using ad-system-only metrics.',
    hypothesis: 'A single historical converter can make the seven-day untouched row measurable again without changing budget, listing, inventory, price, or creating ads.',
    expectedEffect: { impressions: 'recover', clicks: 'recover', spend: 'watch', orders: 'watch', acos: 'keep_near_historical_band' },
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      metrics: ['impressions', 'clicks', 'spend', 'orders', 'ACOS'],
      goal: { metric: 'orders', from: 0, to: 1, deadlineDays: 7, hardFloor: 0 },
      rollbackIf: 'If the reopened row spends 7 days without orders, or search terms are irrelevant, pause it again or cut bid back through the normal lower-layer process.',
    },
    goal: { metric: 'orders', from: 0, to: 1, deadlineDays: 7, hardFloor: 0 },
    measurementWindowDays: [1, 3, 7],
    evidence: [
      'data_boundary=ad_system_only_for_ad_decision; lifecycle reopen rule applies only after live seven-day pool still has residual rows.',
      `current_live_pool channel=${channel} sku=${text(poolRow.sku)} campaignId=${text(poolRow.campaignId)} adGroupId=${text(poolRow.adGroupId)} spend=${pool.spend.toFixed(2)} clicks=${pool.clicks.toFixed(0)} orders=${pool.orders.toFixed(0)} acos=${acosFor(pool).toFixed(4)} manualAdjust=${text(poolRow.manualAdjustTheTime)} lastUpdate=${text(poolRow.lastAdvUpdatedDate || poolRow.updated_at)}`,
      `${row.entityType} ${id} "${label}": state=${text(row.state)} -> enabled, bid=${num(row.bid).toFixed(2)}, parent campaignState=${text(row.campaignState)}, groupState=${text(row.groupState)}, updatedAt=${text(row.updatedAt)}.`,
      `${row.entityType} 30d spend=${s30.spend.toFixed(2)} clicks=${s30.clicks.toFixed(0)} orders=${s30.orders.toFixed(0)} acos=${acosFor(s30).toFixed(4)}; 7d spend=${s7.spend.toFixed(2)} clicks=${s7.clicks.toFixed(0)} orders=${s7.orders.toFixed(0)} acos=${acosFor(s7).toFixed(4)}.`,
      'guardrail=no budget change, no bid change, no create, no listing/price/inventory action.',
    ],
    confidence: 0.74,
    riskLevel: 'ad_system_7day_lifecycle_reopen',
    expectationClass: 'repair_visibility',
    source: 'codex',
    actionSource: ['codex', 'ad_system_7day_lifecycle_reopen'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    canAutoExecute: true,
    candidateSource: `ad_system_7day_lifecycle_reopen:${channel}:${text(poolRow.campaignId)}:${text(poolRow.adGroupId)}`,
    businessDate: date,
  };
}

function generate(snapshot, pool, options = {}) {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const scope = analyzeAllowedOperationScope(snapshot);
  const bySku = new Map((snapshot.productCards || []).map(card => [skuKey(card.sku), card]));
  const plansBySku = new Map();
  const used = new Set();
  const report = {
    generatedAt: new Date().toISOString(),
    date,
    dataBoundary: 'ad_system_only_for_ad_decision_with_operation_scope_guardrail',
    inputCounts: { spRows: (pool.spRows || []).length, sbRows: (pool.sbRows || []).length },
    planned: [],
    skipped: [],
  };

  function skip(channel, row, reason, extra = {}) {
    report.skipped.push({
      channel,
      sku: text(row.sku),
      campaignId: text(row.campaignId),
      adGroupId: text(row.adGroupId),
      campaignName: text(row.campaignName || row.name),
      reason,
      ...extra,
    });
  }

  function addPlan(sku, asin, action, channel) {
    const key = `${action.entityType}:${action.id}`;
    if (used.has(key)) return false;
    used.add(key);
    if (!plansBySku.has(sku)) {
      plansBySku.set(sku, {
        sku,
        asin: asin || '',
        summary: `Seven-day untouched lifecycle reopen for ${sku}: reopen one proven paused lower-layer entity only.`,
        actions: [],
      });
    }
    plansBySku.get(sku).actions.push(action);
    report.planned.push({
      channel,
      sku,
      entityType: action.entityType,
      id: action.id,
      campaignId: action.campaignId,
      adGroupId: action.adGroupId,
      label: action.label,
      currentBid: action.currentBid,
      campaignName: action.campaignName,
      riskLevel: action.riskLevel,
    });
    return true;
  }

  for (const row of pool.spRows || []) {
    const sku = skuKey(row.sku);
    if (!scope.allowedSkuSet.has(sku)) {
      skip('SP', row, 'sku_out_of_allowed_operation_scope');
      continue;
    }
    const card = bySku.get(sku);
    if (!card) {
      skip('SP', row, 'sku_not_in_snapshot_product_cards');
      continue;
    }
    const campaigns = (card.campaigns || []).filter(campaign =>
      text(campaign.campaignId) === text(row.campaignId) &&
      (!text(row.adGroupId) || text(campaign.adGroupId) === text(row.adGroupId))
    );
    const candidates = campaigns.flatMap(campaign => rowsOfCampaign(campaign, 'SP'))
      .filter(candidate => isReopenCandidate(candidate, date))
      .sort((a, b) => candidateScore(b) - candidateScore(a));
    if (!candidates.length) {
      skip('SP', row, 'no_safe_lifecycle_reopen_candidate');
      continue;
    }
    const action = buildAction(card, candidates[0], row, 'SP', date);
    if (!addPlan(sku, card.asin || row.asin || '', action, 'SP')) skip('SP', row, 'duplicate_reopen_entity_already_planned');
  }

  for (const row of pool.sbRows || []) {
    const matches = [];
    const campaignId = text(row.campaignId);
    for (const card of snapshot.productCards || []) {
      const sku = skuKey(card.sku);
      if (!scope.allowedSkuSet.has(sku)) continue;
      for (const campaign of card.campaigns || []) {
        if (text(campaign.campaignId) !== campaignId) continue;
        const candidates = rowsOfCampaign(campaign, 'SB')
          .filter(candidate => isReopenCandidate(candidate, date))
          .sort((a, b) => candidateScore(b) - candidateScore(a));
        if (candidates.length) matches.push({ card, action: buildAction(card, candidates[0], row, 'SB', date), score: candidateScore(candidates[0]) });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    if (!matches.length) {
      skip('SB', row, 'no_safe_lifecycle_reopen_candidate_or_out_of_scope');
      continue;
    }
    const best = matches[0];
    if (!addPlan(skuKey(best.card.sku), best.card.asin || '', best.action, 'SB')) skip('SB', row, 'duplicate_reopen_entity_already_planned');
  }

  const plans = [...plansBySku.values()].filter(plan => plan.actions.length);
  report.summary = report.planned.reduce((acc, item) => {
    acc.actions += 1;
    acc.skus.add(item.sku);
    acc.byChannel[item.channel] = (acc.byChannel[item.channel] || 0) + 1;
    acc.byType[item.entityType] = (acc.byType[item.entityType] || 0) + 1;
    return acc;
  }, { actions: 0, skus: new Set(), byChannel: {}, byType: {} });
  report.summary.skus = report.summary.skus.size;
  report.skippedSummary = report.skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
  return { plans, report };
}

function main() {
  const args = argsMap(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const date = args.date || new Date().toISOString().slice(0, 10);
  const snapshotFile = path.resolve(root, args.snapshot || path.join('data', 'snapshots', 'latest_snapshot.json'));
  const poolFile = path.resolve(root, args.pool || path.join('data', 'snapshots', 'system_7day_unadjusted.json'));
  const outFile = path.resolve(root, args.out || path.join('data', 'snapshots', `ad_system_7day_lifecycle_reopen_schema_${date}.json`));
  const reportFile = path.resolve(root, args.report || path.join('data', 'tasks', `ad_system_7day_lifecycle_reopen_report_${date}.json`));

  const snapshot = readJson(snapshotFile);
  const pool = readJson(poolFile);
  const { plans, report } = generate(snapshot, pool, { date });
  report.sourceSnapshot = snapshotFile;
  report.sourcePool = poolFile;
  writeJson(outFile, plans);
  writeJson(reportFile, report);
  console.log(JSON.stringify({ schema: outFile, report: reportFile, summary: report.summary, skippedSummary: report.skippedSummary }, null, 2));
}

if (require.main === module) main();

module.exports = { generate };
