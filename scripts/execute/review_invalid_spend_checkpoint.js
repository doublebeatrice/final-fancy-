const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUSINESS_DATE = getArg('--business-date') || process.env.BUSINESS_DATE || '2026-06-02';
const CURRENT_DATE = getArg('--current-date') || process.env.CURRENT_DATE || new Date().toISOString().slice(0, 10);
const CHECKPOINT_ARG = getArg('--checkpoint') || process.env.INVALID_SPEND_CHECKPOINT || '';
const EXPLICIT_CHECKPOINT_DATE = getArg('--checkpoint-date') || process.env.CHECKPOINT_DATE || '';
const CHECKPOINT_DATE = resolveCheckpointDate(BUSINESS_DATE, {
  checkpoint: CHECKPOINT_ARG,
  checkpointDate: EXPLICIT_CHECKPOINT_DATE,
  currentDate: CURRENT_DATE,
}) || new Date().toISOString().slice(0, 10);
const OUT_FILE = getArg('--out') || path.join(ROOT, 'data', 'tasks', `invalid_spend_checkpoint_${BUSINESS_DATE}_asof_${CHECKPOINT_DATE}.json`);
const OUT_MD = OUT_FILE.replace(/\.json$/i, '.md');
const FETCH_MISSING = process.argv.includes('--fetch-missing') || process.env.INVALID_SPEND_FETCH_MISSING === '1';
const ALLOW_FUTURE_FETCH = process.env.INVALID_SPEND_ALLOW_FUTURE_FETCH === '1';
const HARD_REGEX = /zero_order|no_order|severe_acos|extreme_acos/i;
const LOW_EFFICIENCY_KINDS = ['kw', 'auto', 'manual', 'sbKw', 'sbTarget'];

const BASELINE_GROUP = {
  source: 'user_shared_group_table_2026-06-02',
  owner: 'Huang Chengzhe',
  ownerAdShare: 0.1088,
  ownerAcos: 0.1998,
  ownerGrossMargin: 0.3251,
  sjAdShare: 0.0932,
  sjAcos: 0.1766,
  sjGrossMargin: 0.3436,
};

function getArg(name) {
  const raw = process.argv.find(arg => arg === name || arg.startsWith(`${name}=`));
  if (!raw) return '';
  if (raw === name) return '1';
  return raw.slice(name.length + 1);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function pctDelta(previous, current) {
  const prev = num(previous);
  const cur = num(current);
  if (!prev && !cur) return 0;
  if (!prev) return cur > 0 ? 1 : 0;
  return (cur - prev) / Math.abs(prev);
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '';
  return `${(num(value) * 100).toFixed(1)}%`;
}

function addDays(ymd, days) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveNextCheckpointDate(businessDate, currentDate = '') {
  const checkpoint3d = addDays(businessDate, 3);
  const checkpoint7d = addDays(businessDate, 7);
  const today = text(currentDate) || checkpoint3d;
  return dateCmp(today, checkpoint7d) >= 0 ? checkpoint7d : checkpoint3d;
}

function resolveCheckpointDate(businessDate, { checkpoint = '', checkpointDate = '', currentDate = '' } = {}) {
  const explicitDate = text(checkpointDate);
  if (explicitDate) return explicitDate;

  const value = text(checkpoint).toLowerCase();
  if (!value) return '';
  if (value === '3' || value === '3d') return addDays(businessDate, 3);
  if (value === '7' || value === '7d') return addDays(businessDate, 7);
  if (value === 'next' || value === 'auto') return resolveNextCheckpointDate(businessDate, currentDate);
  if (value === 'final') return addDays(businessDate, 7);
  throw new Error(`Unknown --checkpoint value "${checkpoint}". Use 3d, 7d, next, auto, or final.`);
}

function dateCmp(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function checkpointReadiness({ businessDate, checkpointDate, checkpoint3Ok, checkpoint7Ok, checkpoint30Ok }) {
  const due3 = dateCmp(checkpointDate, addDays(businessDate, 3)) >= 0;
  const due7 = dateCmp(checkpointDate, addDays(businessDate, 7)) >= 0;
  const missing = [];
  if (due3 && !checkpoint3Ok) missing.push('3d');
  if (due7 && !checkpoint7Ok) missing.push('7d');
  return {
    checkpoint3dDue: due3,
    checkpoint7dDue: due7,
    checkpoint3dHasData: !!checkpoint3Ok,
    checkpoint7dHasData: !!checkpoint7Ok,
    checkpoint30dHasData: !!checkpoint30Ok,
    status: !due3
      ? 'not_due'
      : missing.length
        ? `missing_${missing.join('_and_')}_data`
        : 'ready_for_review',
  };
}

function entityKey(entityType, id) {
  return `${entityType || ''}|${id || ''}`;
}

function inferSku(row = {}) {
  const explicitSku = text(row.sku).toUpperCase();
  if (explicitSku && !explicitSku.startsWith('LOWEFF::')) return explicitSku;
  const haystack = `${row.campaignName || ''} ${row.groupName || ''}`;
  const match = haystack.match(/(?:_|-|\b)([a-z]{2,4}\d{3,5})(?:\b|_|-|\s|$)/i);
  return match ? match[1].toUpperCase() : `lowEff::${row.kind || row.entityType || 'unknown'}::${row.entityId || row.id || 'unknown'}`;
}

function usableSku(value) {
  const sku = text(value).toUpperCase();
  return sku && !sku.startsWith('LOWEFF::') ? sku : '';
}

function actionLog() {
  const file = path.join(ROOT, 'data', 'adjustments', `adjustments_${BUSINESS_DATE}.json`);
  const rows = readJson(file, []);
  return Array.isArray(rows)
    ? rows.filter(row => row.businessDate === BUSINESS_DATE && row.meta?.source === 'full_lower_layer_low_efficiency_recheck')
    : [];
}

function summarizeAdjustments(rows) {
  const success = new Map();
  const failed = new Map();
  for (const row of rows) {
    const key = entityKey(row.entityType, row.entityId);
    if (row.outcome === 'api_success') success.set(key, row);
    if (row.outcome === 'api_failed') failed.set(key, row);
  }
  const successByType = {};
  const successActionByType = {};
  for (const row of success.values()) {
    successByType[row.entityType] = (successByType[row.entityType] || 0) + 1;
    const actionKey = `${row.entityType}|${row.actionType || 'unknown'}`;
    successActionByType[actionKey] = (successActionByType[actionKey] || 0) + 1;
  }
  const unresolved = [];
  for (const [key, row] of failed.entries()) {
    if (!success.has(key)) {
      unresolved.push({
        entityType: row.entityType,
        entityId: row.entityId,
        sku: row.sku || '',
        actionType: row.actionType || '',
        beforeValue: row.beforeValue ?? null,
        afterValue: row.afterValue ?? null,
        message: row.meta?.apiMessage || row.meta?.error || '',
      });
    }
  }
  return {
    rawRecords: rows.length,
    uniqueSuccess: success.size,
    successByType,
    successActionByType,
    unresolvedFailures: unresolved,
    successKeys: [...success.keys()],
  };
}

function loadScanRows() {
  const out = [];
  for (const kind of LOW_EFFICIENCY_KINDS) {
    const file = path.join(ROOT, 'data', 'snapshots', `full_low_efficiency_recheck_${kind}_${BUSINESS_DATE}.json`);
    const scan = readJson(file, null);
    if (!scan) continue;
    for (const row of scan.remaining || []) {
      out.push({ ...row, kind, scanFile: path.relative(ROOT, file).replace(/\\/g, '/') });
    }
  }
  return out;
}

function loadCheckpointLowEfficiencyScan(checkpointDate) {
  const sources = [];
  const rows = [];
  for (const kind of LOW_EFFICIENCY_KINDS) {
    const file = path.join(ROOT, 'data', 'snapshots', `full_low_efficiency_recheck_${kind}_${checkpointDate}.json`);
    const scan = readJson(file, null);
    const ok = !!scan && Array.isArray(scan.remaining);
    sources.push({
      kind,
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      ok,
    });
    if (!ok) continue;
    for (const row of scan.remaining || []) {
      rows.push({ ...row, kind, scanFile: path.relative(ROOT, file).replace(/\\/g, '/') });
    }
  }
  return {
    checkpointDate,
    ok: sources.every(source => source.ok),
    sources,
    rows,
    commands: lowEfficiencyScanCommands(checkpointDate),
  };
}

function lowEfficiencyScanCommands(checkpointDate) {
  const dataStart = addDays(checkpointDate, -29);
  return [
    `npm run chrome:ready`,
    `$env:BUSINESS_DATE='${checkpointDate}'; $env:DATA_END='${checkpointDate}'; $env:DATA_START='${dataStart}'`,
    ...LOW_EFFICIENCY_KINDS.map(kind => `node scripts\\execute\\recheck_low_efficiency_lower_layer.js --kind=${kind}`),
  ];
}

function reasonText(row = {}) {
  return [
    row.decision?.reasonCode,
    row.decision?.reason,
    row.hit?.reason,
    row.hit?.kind,
  ].map(text).filter(Boolean).join(' ');
}

function protectedGrayRows(scanRows, successKeys) {
  return scanRows
    .filter(row => !successKeys.has(entityKey(row.entityType, row.id)))
    .filter(row => {
      const hard = HARD_REGEX.test(reasonText(row));
      const w3 = row.windows?.['3'] || {};
      const w7 = row.windows?.['7'] || {};
      const w30 = row.windows?.['30'] || {};
      const recentOrders = num(w3.orders) > 0 || num(w7.orders) > 0;
      const longWindowEfficient = num(w30.orders) > 0 && num(w30.acos) > 0 && num(w30.acos) <= 0.25;
      return !hard && (recentOrders || longWindowEfficient);
    })
    .map(row => ({
      sku: inferSku(row),
      kind: row.kind,
      entityType: row.entityType,
      entityId: row.id,
      text: row.text,
      campaignName: row.campaignName,
      impressions3: round(row.windows?.['3']?.impressions, 0),
      clicks3: round(row.windows?.['3']?.clicks, 0),
      spend3: round(row.windows?.['3']?.spend),
      orders3: num(row.windows?.['3']?.orders),
      acos3: row.windows?.['3']?.acos ?? null,
      impressions7: round(row.windows?.['7']?.impressions, 0),
      clicks7: round(row.windows?.['7']?.clicks, 0),
      spend7: round(row.windows?.['7']?.spend),
      orders7: num(row.windows?.['7']?.orders),
      acos7: row.windows?.['7']?.acos ?? null,
      impressions30: round(row.windows?.['30']?.impressions, 0),
      clicks30: round(row.windows?.['30']?.clicks, 0),
      spend30: round(row.windows?.['30']?.spend),
      orders30: num(row.windows?.['30']?.orders),
      acos30: row.windows?.['30']?.acos ?? null,
      reasonCode: row.decision?.reasonCode || '',
    }))
    .sort((a, b) => b.spend7 - a.spend7)
    .slice(0, 30);
}

function hardResidualRows(scanRows, successKeys) {
  return scanRows
    .filter(row => !successKeys.has(entityKey(row.entityType, row.id)))
    .filter(row => HARD_REGEX.test(reasonText(row)))
    .map(row => ({
      sku: inferSku(row),
      kind: row.kind,
      entityType: row.entityType,
      entityId: row.id,
      text: row.text,
      campaignName: row.campaignName,
      currentBid: row.bid,
      proposedBid: row.decision?.suggestedBid ?? row.proposedBid ?? null,
      proposedAction: row.decision?.actionType || row.proposedAction || '',
      signal: row.hit?.reason || row.decision?.reason || '',
      reasonCode: row.decision?.reasonCode || '',
    }))
    .sort((a, b) => text(a.sku).localeCompare(text(b.sku)));
}

function loadQueueRows() {
  const file = path.join(ROOT, 'data', 'actions', `invalid_spend_hard_stop_queue_${BUSINESS_DATE}.json`);
  const queue = readJson(file, {});
  return Array.isArray(queue.rows) ? queue.rows : [];
}

function loadRootCauseReview() {
  const file = path.join(ROOT, 'data', 'tasks', `invalid_spend_root_cause_review_${BUSINESS_DATE}.json`);
  const data = readJson(file, null);
  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    ok: !!data,
    data: data || {},
  };
}

function loadCheckpointReport(checkpointDate) {
  const file = path.join(ROOT, 'data', 'tasks', `invalid_spend_checkpoint_${BUSINESS_DATE}_asof_${checkpointDate}.json`);
  const data = readJson(file, null);
  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    ok: !!data,
    data: data || {},
  };
}

function uniqueSkus(rows = []) {
  return [...new Set(rows.map(row => usableSku(row.sku)).filter(Boolean))].sort();
}

function buildRootCauseSegments({ queueRows = [], protectedRows = [], rootCauseReview = {}, rootCauseFile = '', rootCauseOk = false } = {}) {
  const marketRows = queueRows.filter(row => {
    const bucket = text(row.marketBucket);
    return bucket && bucket !== 'unclassified_low_efficiency_tail';
  });
  const badHabitRows = queueRows.filter(row => {
    const bucket = text(row.marketBucket);
    return !bucket || bucket === 'unclassified_low_efficiency_tail';
  });
  const protectedReviewRows = Array.isArray(rootCauseReview.protectedExploration) && rootCauseReview.protectedExploration.length
    ? rootCauseReview.protectedExploration
    : protectedRows;
  const protectedLevelRows = new Map();
  for (const row of protectedReviewRows) {
    const level = text(row.reviewLevel) || 'protected_exploration';
    const bucket = protectedLevelRows.get(level) || [];
    bucket.push(row);
    protectedLevelRows.set(level, bucket);
  }

  const segments = [
    {
      key: 'bad_habit_only',
      label: 'Bad habit only',
      rows: badHabitRows.length,
      skus: uniqueSkus(badHabitRows),
      rule: 'spend should fall without needing market reopen',
    },
    {
      key: 'market_misjudgment_plus_bad_habit',
      label: 'Market misjudgment plus bad habit',
      rows: marketRows.length,
      skus: uniqueSkus(marketRows),
      rule: 'spend should fall; reopen only with fresh market proof plus exact term or ASIN conversion',
    },
    {
      key: 'protected_exploration',
      label: 'Protected exploration',
      rows: protectedReviewRows.length,
      skus: uniqueSkus(protectedReviewRows),
      rule: 'clicks and orders should not collapse; control only renewed hard waste',
    },
  ];
  const protectedReviewLevels = [...protectedLevelRows.entries()]
    .map(([key, rows]) => ({
      key,
      rows: rows.length,
      skus: uniqueSkus(rows),
    }))
    .sort((a, b) => b.rows - a.rows || a.key.localeCompare(b.key));
  return {
    sourceFile: rootCauseFile,
    sourceOk: rootCauseOk,
    segments,
    protectedReviewLevels,
  };
}

function rootCauseSegmentMetrics(rows, segments = []) {
  return segments.map(segment => ({
    key: segment.key,
    label: segment.label,
    rows: segment.rows,
    skuCount: segment.skus.length,
    rule: segment.rule,
    metrics: metricFromRows(rows, new Set(segment.skus)),
  }));
}

function summarizeImpactedSkus(successRows, queueRows) {
  const queueByKey = new Map(queueRows.map(row => [entityKey(row.entityType, row.entityId), row]));
  const bySku = new Map();
  for (const row of successRows) {
    if (row.outcome !== 'api_success') continue;
    const matched = queueByKey.get(entityKey(row.entityType, row.entityId)) || {};
    const sku = usableSku(row.sku) || usableSku(matched.sku) || inferSku(matched);
    const bucket = bySku.get(sku) || {
      sku,
      actions: 0,
      bidDown: 0,
      pause: 0,
      representedSpend30: 0,
      representedClicks30: 0,
      representedOrders30: 0,
      examples: [],
    };
    bucket.actions += 1;
    if (row.actionType === 'pause') bucket.pause += 1;
    else bucket.bidDown += 1;
    bucket.representedSpend30 += num(matched.spend30);
    bucket.representedClicks30 += num(matched.clicks30);
    bucket.representedOrders30 += num(matched.orders30);
    if (bucket.examples.length < 2) bucket.examples.push(text(matched.text || row.entityName));
    bySku.set(sku, bucket);
  }
  return [...bySku.values()]
    .map(row => ({
      ...row,
      representedSpend30: round(row.representedSpend30),
      representedClicks30: round(row.representedClicks30, 0),
      representedOrders30: round(row.representedOrders30, 0),
    }))
    .sort((a, b) => b.representedSpend30 - a.representedSpend30 || b.actions - a.actions)
    .slice(0, 40);
}

function loadAdSkuSummary(day, date) {
  const file = path.join(ROOT, 'data', 'snapshots', `ad_sku_summary_ALL_${day}d_${date}.json`);
  const data = readJson(file, null);
  if (!data || !Array.isArray(data.rows)) return { file: path.relative(ROOT, file).replace(/\\/g, '/'), ok: false, rows: [] };
  return { file: path.relative(ROOT, file).replace(/\\/g, '/'), ok: true, rows: data.rows };
}

function adSkuSummaryPath(day, date) {
  return `data/snapshots/ad_sku_summary_ALL_${day}d_${date}.json`;
}

function adSkuSummaryFetchCommand(day, date) {
  return `node scripts\\execute\\fetch_ad_sku_summary.js 4 ${day} "" ${adSkuSummaryPath(day, date).replace(/\//g, '\\')}`;
}

function dataRequirements({ readiness, checkpointDate, checkpoint3Ok, checkpoint7Ok, checkpoint30Ok }) {
  const required = [];
  const optional = [];
  if (readiness.checkpoint3dDue && !checkpoint3Ok) {
    required.push({
      day: 3,
      file: adSkuSummaryPath(3, checkpointDate),
      command: adSkuSummaryFetchCommand(3, checkpointDate),
    });
  }
  if (readiness.checkpoint7dDue && !checkpoint7Ok) {
    required.push({
      day: 7,
      file: adSkuSummaryPath(7, checkpointDate),
      command: adSkuSummaryFetchCommand(7, checkpointDate),
    });
  }
  if (!checkpoint30Ok) {
    optional.push({
      day: 30,
      file: adSkuSummaryPath(30, checkpointDate),
      command: adSkuSummaryFetchCommand(30, checkpointDate),
      reason: 'useful for checkpoint context, not required for the 3d/7d outcome verdict',
    });
  }
  return {
    required,
    optional,
    commands: [
      ...(required.length ? ['npm run chrome:ready'] : []),
      ...required.map(item => item.command),
    ],
  };
}

function canFetchCheckpoint(checkpointDate, currentDate = CURRENT_DATE, { allowFuture = ALLOW_FUTURE_FETCH } = {}) {
  return allowFuture || dateCmp(checkpointDate, currentDate) <= 0;
}

function runCommand(command, args, { allowFailure = false, runner = spawnSync, env = {} } = {}) {
  const result = runner(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  const status = Number(result.status ?? 0);
  if (status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${status}`);
  }
  return { command, args, status };
}

function fetchMissingData(report, options = {}) {
  const currentDate = options.currentDate || CURRENT_DATE;
  const required = report?.dataRequirements?.required || [];
  const protectedScanRequired = report?.readiness?.checkpoint3dDue && report?.protectedRowAudit?.status === 'pending_data';
  if (!required.length && !protectedScanRequired) {
    return { status: 'not_needed', currentDate, commands: [] };
  }
  if (!canFetchCheckpoint(report.checkpointDate, currentDate, options)) {
    return {
      status: 'future_checkpoint_refused',
      currentDate,
      checkpointDate: report.checkpointDate,
      reason: 'refusing to fetch future-dated checkpoint data',
      commands: report.dataRequirements.commands || [],
    };
  }

  const runner = options.runner || spawnSync;
  const commands = [];
  commands.push(runCommand('npm', ['run', 'chrome:ready'], { runner, allowFailure: true }));
  for (const item of required) {
    commands.push(runCommand('node', [
      'scripts\\execute\\fetch_ad_sku_summary.js',
      '4',
      String(item.day),
      '',
      item.file.replace(/\//g, path.sep),
    ], { runner }));
  }
  if (protectedScanRequired) {
    const scanEnv = {
      BUSINESS_DATE: report.checkpointDate,
      DATA_END: report.checkpointDate,
      DATA_START: addDays(report.checkpointDate, -29),
    };
    for (const kind of LOW_EFFICIENCY_KINDS) {
      commands.push(runCommand('node', [
        'scripts\\execute\\recheck_low_efficiency_lower_layer.js',
        `--kind=${kind}`,
      ], { runner, env: scanEnv }));
    }
  }
  return {
    status: commands.every(item => item.status === 0 || item.command === 'npm') ? 'fetched' : 'fetch_attempted',
    currentDate,
    checkpointDate: report.checkpointDate,
    commands,
  };
}

function firstMetric(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') return num(row[name]);
  }
  return 0;
}

function metricFromRows(rows, skus) {
  const want = new Set([...skus].map(sku => text(sku).toUpperCase()));
  const selected = rows.filter(row => want.has(text(row.sku || row.SKU).toUpperCase()));
  const total = selected.reduce((acc, row) => {
    acc.skus += 1;
    acc.impressions += firstMetric(row, ['impressions', '30_impressions', '7_impressions', '3_impressions']);
    acc.clicks += firstMetric(row, ['clicks', '30_clicks', '7_clicks', '3_clicks']);
    acc.cost += firstMetric(row, ['cost', '30_cost', '7_cost', '3_cost']);
    acc.orders += firstMetric(row, ['orders', '30_orders', '7_orders', '3_orders']);
    acc.sales += firstMetric(row, ['sales', '30_sales', '7_sales', '3_sales']);
    acc.prevImpressions += firstMetric(row, ['impressions_prev', '30_impressions_prev', '7_impressions_prev', '3_impressions_prev']);
    acc.prevClicks += firstMetric(row, ['clicks_prev', '30_clicks_prev', '7_clicks_prev', '3_clicks_prev']);
    acc.prevCost += firstMetric(row, ['cost_prev', '30_cost_prev', '7_cost_prev', '3_cost_prev']);
    acc.prevOrders += firstMetric(row, ['orders_prev', '30_orders_prev', '7_orders_prev', '3_orders_prev']);
    acc.prevSales += firstMetric(row, ['sales_prev', '30_sales_prev', '7_sales_prev', '3_sales_prev']);
    return acc;
  }, {
    skus: 0,
    impressions: 0,
    clicks: 0,
    cost: 0,
    orders: 0,
    sales: 0,
    prevImpressions: 0,
    prevClicks: 0,
    prevCost: 0,
    prevOrders: 0,
    prevSales: 0,
  });
  total.acos = total.sales > 0 ? round(total.cost / total.sales, 4) : null;
  total.cpc = total.clicks > 0 ? round(total.cost / total.clicks, 4) : null;
  total.prevAcos = total.prevSales > 0 ? round(total.prevCost / total.prevSales, 4) : null;
  total.prevCpc = total.prevClicks > 0 ? round(total.prevCost / total.prevClicks, 4) : null;
  return {
    ...total,
    impressions: round(total.impressions, 0),
    clicks: round(total.clicks, 0),
    cost: round(total.cost),
    orders: round(total.orders, 0),
    sales: round(total.sales),
    prevImpressions: round(total.prevImpressions, 0),
    prevClicks: round(total.prevClicks, 0),
    prevCost: round(total.prevCost),
    prevOrders: round(total.prevOrders, 0),
    prevSales: round(total.prevSales),
    delta: {
      impressionsPct: round(pctDelta(total.prevImpressions, total.impressions), 4),
      clicksPct: round(pctDelta(total.prevClicks, total.clicks), 4),
      costPct: round(pctDelta(total.prevCost, total.cost), 4),
      ordersPct: round(pctDelta(total.prevOrders, total.orders), 4),
      salesPct: round(pctDelta(total.prevSales, total.sales), 4),
      acosPct: total.prevAcos !== null && total.acos !== null ? round(pctDelta(total.prevAcos, total.acos), 4) : null,
    },
  };
}

function reviewWindowKey(readiness, metrics) {
  if (readiness.checkpoint7dDue && metrics.checkpoint7d?.ok) return 'checkpoint7d';
  if (readiness.checkpoint3dDue && metrics.checkpoint3d?.ok) return 'checkpoint3d';
  return '';
}

function assessWindowOutcome({ readiness, metrics, hardResiduals }) {
  const windowKey = reviewWindowKey(readiness, metrics);
  if (!windowKey) {
    return {
      verdict: 'pending_data',
      window: '',
      status: readiness.status,
      reasons: ['checkpoint data is not ready yet'],
      hardResidualOk: hardResiduals.length <= 1,
    };
  }

  const tracked = metrics[windowKey].trackedSkus || {};
  const protectedMetric = metrics[windowKey].protectedSkus || {};
  const hasPreviousWindow = tracked.prevCost > 0 || tracked.prevClicks > 0 || tracked.prevOrders > 0 || tracked.prevSales > 0;
  if (!hasPreviousWindow) {
    return {
      verdict: 'pending_data',
      window: windowKey.replace('checkpoint', ''),
      status: 'missing_previous_window',
      reasons: ['checkpoint rows are present but previous-window metrics are missing'],
      hardResidualOk: hardResiduals.length <= 1,
    };
  }

  const spendControlled = tracked.delta.costPct <= -0.05;
  const acosImproved = tracked.acos !== null && tracked.prevAcos !== null &&
    (tracked.acos <= tracked.prevAcos - 0.02 || tracked.delta.acosPct <= -0.05);
  const trackedOrdersOk = num(tracked.prevOrders) <= 0 || num(tracked.orders) >= Math.max(1, num(tracked.prevOrders) * 0.6);
  const protectedImpressionsOk = num(protectedMetric.prevImpressions) <= 0 ||
    num(protectedMetric.impressions) >= num(protectedMetric.prevImpressions) * 0.5;
  const protectedClicksOk = num(protectedMetric.prevClicks) <= 0 ||
    num(protectedMetric.clicks) >= num(protectedMetric.prevClicks) * 0.5;
  const protectedOrdersOk = num(protectedMetric.prevOrders) <= 0 ||
    num(protectedMetric.orders) >= Math.max(1, num(protectedMetric.prevOrders) * 0.5);
  const protectedNoHarm = protectedImpressionsOk && protectedClicksOk && protectedOrdersOk;
  const hardResidualOk = hardResiduals.length <= 1;
  const reasons = [];
  if (spendControlled) reasons.push('tracked SKU ad cost decreased at least 5% versus previous window');
  if (acosImproved) reasons.push('tracked SKU ACOS improved versus previous window');
  if (!trackedOrdersOk) reasons.push('tracked SKU ad orders dropped sharply');
  if (!protectedImpressionsOk) reasons.push('protected gray traffic impressions dropped more than 50%');
  if (!protectedClicksOk) reasons.push('protected gray traffic clicks dropped more than 50%');
  if (!protectedOrdersOk) reasons.push('protected gray traffic orders dropped more than 50%');
  if (!hardResidualOk) reasons.push('hard residual candidates exceed backend-blocked tolerance');

  let verdict = 'no_clear_improvement';
  if (!trackedOrdersOk || !protectedNoHarm) verdict = 'possible_misfire_review';
  else if (spendControlled && (acosImproved || tracked.delta.ordersPct >= -0.1) && hardResidualOk) verdict = 'cost_control_without_obvious_harm';
  else if (tracked.delta.costPct > 0.1 && tracked.delta.acosPct !== null && tracked.delta.acosPct > 0.1) verdict = 'worse_after_control';

  return {
    verdict,
    window: windowKey.replace('checkpoint', ''),
    status: 'evaluated',
    spendControlled,
    acosImproved,
    trackedOrdersOk,
    protectedNoHarm,
    protectedImpressionsOk,
    protectedClicksOk,
    protectedOrdersOk,
    hardResidualOk,
    reasons,
    trackedDelta: tracked.delta,
    protectedDelta: protectedMetric.delta,
  };
}

function hasPreviousMetric(metric = {}) {
  return num(metric.prevCost) > 0 || num(metric.prevClicks) > 0 || num(metric.prevOrders) > 0 || num(metric.prevSales) > 0;
}

function nextActionForRootCauseVerdict(verdict) {
  const actions = {
    pending_previous_window: 'wait_for_previous_window_metrics_before_deciding',
    habit_spend_controlled: 'keep_current_stop_loss; no_market_reopen_needed',
    habit_control_overcut_review: 'review_row_level_orders_before_any_more_cuts',
    habit_spend_not_controlled: 'rerun_bad_habit_layers_only_and_cut_regenerated_hard_waste',
    habit_no_clear_control: 'keep_monitoring_and_do_not_expand_cuts_without_new_hard_waste',
    market_spend_reduced_watch_orders_no_auto_reopen: 'review_exact_row_evidence; do_not_reopen_generic_market_bucket',
    market_spend_reduced_reopen_blocked: 'keep_market_reopen_blocked_until_fresh_market_proof_plus_exact_conversion',
    market_spend_not_controlled: 'inspect_top_market_buckets_with_product_time_machine_before_any_reopen',
    market_no_clear_control: 'hold_market_bucket_and_wait_for_clearer_3d_7d_signal',
    protected_possible_misfire_review: 'check_protected_rows_for_narrow_reopen_or_bid_restore_before_any_more_cuts',
    protected_no_obvious_harm: 'keep_protection_and_continue_checkpoint_monitoring',
    segment_no_clear_change: 'monitor_segment_without_new_action',
  };
  return actions[verdict] || 'manual_review_required';
}

function assessRootCauseSegment(segment = {}) {
  const metric = segment.metrics || {};
  if (!hasPreviousMetric(metric)) {
    return {
      key: segment.key,
      label: segment.label,
      verdict: 'pending_previous_window',
      nextAction: nextActionForRootCauseVerdict('pending_previous_window'),
      reasons: ['previous-window segment metrics are missing'],
      delta: metric.delta || {},
    };
  }

  const costControlled = metric.delta?.costPct <= -0.05;
  const costIncreased = metric.delta?.costPct > 0.1;
  const impressionsCollapsed = num(metric.prevImpressions) > 0 && num(metric.impressions) < num(metric.prevImpressions) * 0.5;
  const ordersCollapsed = num(metric.prevOrders) > 0 && num(metric.orders) < Math.max(1, num(metric.prevOrders) * 0.6);
  const clicksCollapsed = num(metric.prevClicks) > 0 && num(metric.clicks) < num(metric.prevClicks) * 0.5;
  const reasons = [];
  if (costControlled) reasons.push('segment cost decreased at least 5% versus previous window');
  if (costIncreased) reasons.push('segment cost increased more than 10% versus previous window');
  if (impressionsCollapsed) reasons.push('segment impressions dropped below 50% of previous window');
  if (ordersCollapsed) reasons.push('segment orders dropped below 60% of previous window');
  if (clicksCollapsed) reasons.push('segment clicks dropped below 50% of previous window');

  let verdict = 'segment_no_clear_change';
  if (segment.key === 'bad_habit_only') {
    if (ordersCollapsed) verdict = 'habit_control_overcut_review';
    else if (costControlled) verdict = 'habit_spend_controlled';
    else if (costIncreased) verdict = 'habit_spend_not_controlled';
    else verdict = 'habit_no_clear_control';
  } else if (segment.key === 'market_misjudgment_plus_bad_habit') {
    if (costControlled && ordersCollapsed) verdict = 'market_spend_reduced_watch_orders_no_auto_reopen';
    else if (costControlled) verdict = 'market_spend_reduced_reopen_blocked';
    else if (costIncreased) verdict = 'market_spend_not_controlled';
    else verdict = 'market_no_clear_control';
  } else if (segment.key === 'protected_exploration') {
    if (ordersCollapsed || clicksCollapsed || impressionsCollapsed) verdict = 'protected_possible_misfire_review';
    else verdict = 'protected_no_obvious_harm';
  }

  return {
    key: segment.key,
    label: segment.label,
    verdict,
    nextAction: nextActionForRootCauseVerdict(verdict),
    costControlled,
    costIncreased,
    impressionsCollapsed,
    ordersCollapsed,
    clicksCollapsed,
    reasons,
    delta: metric.delta || {},
  };
}

function assessRootCauseSegmentOutcomes({ readiness, metrics }) {
  const windowKey = reviewWindowKey(readiness, metrics);
  if (!windowKey) {
    return {
      status: 'pending_data',
      window: '',
      verdicts: [],
      reasons: ['checkpoint data is not ready yet'],
    };
  }
  const verdicts = (metrics[windowKey].rootCauseSegments || []).map(assessRootCauseSegment);
  return {
    status: verdicts.length ? 'evaluated' : 'missing_segments',
    window: windowKey.replace('checkpoint', ''),
    verdicts,
    reasons: verdicts.length ? [] : ['root-cause segment metrics are missing'],
  };
}

function flatProtectedMetric(row = {}, windowDays = '7') {
  return {
    impressions: num(row[`impressions${windowDays}`]),
    clicks: num(row[`clicks${windowDays}`]),
    spend: num(row[`spend${windowDays}`]),
    orders: num(row[`orders${windowDays}`]),
    acos: row[`acos${windowDays}`] ?? null,
  };
}

function scanWindowMetric(row = {}, windowDays = '7') {
  const metric = row.windows?.[windowDays] || {};
  return {
    impressions: num(metric.impressions),
    clicks: num(metric.clicks),
    spend: round(metric.spend),
    orders: num(metric.orders),
    acos: metric.acos ?? null,
  };
}

function collapseFlags(baseline = {}, current = {}) {
  return {
    impressionsCollapsed: num(baseline.impressions) > 0 && num(current.impressions) < num(baseline.impressions) * 0.5,
    clicksCollapsed: num(baseline.clicks) > 0 && num(current.clicks) < num(baseline.clicks) * 0.5,
    ordersCollapsed: num(baseline.orders) > 0 && num(current.orders) < Math.max(1, num(baseline.orders) * 0.5),
  };
}

function buildProtectedRowAudit({ readiness, protectedRows = [], checkpointScan = {} } = {}) {
  const due = !!(readiness?.checkpoint3dDue || readiness?.checkpoint7dDue);
  const windowDays = readiness?.checkpoint7dDue ? '7' : '3';
  if (!due) {
    return {
      status: 'pending_not_due',
      windowDays,
      sourceOk: !!checkpointScan.ok,
      sourceFiles: checkpointScan.sources || [],
      commands: checkpointScan.commands || [],
      rows: [],
      summary: { tracked: protectedRows.length, inLowEfficiencyPool: 0, needsReview: 0 },
      reasons: ['protected row recheck is not due yet'],
    };
  }
  if (!checkpointScan.ok) {
    return {
      status: 'pending_data',
      windowDays,
      sourceOk: false,
      sourceFiles: checkpointScan.sources || [],
      commands: checkpointScan.commands || [],
      rows: protectedRows.map(row => ({
        sku: row.sku,
        entityType: row.entityType,
        entityId: row.entityId,
        kind: row.kind,
        text: row.text,
        status: 'pending_scan',
        baseline: flatProtectedMetric(row, windowDays),
        current: {},
        verdict: 'pending_scan_data',
        nextAction: 'run_checkpoint_low_efficiency_recheck_before_final_judgment',
      })),
      summary: { tracked: protectedRows.length, inLowEfficiencyPool: 0, needsReview: 0 },
      reasons: ['checkpoint low-efficiency scan files are missing or incomplete'],
    };
  }

  const scanByKey = new Map((checkpointScan.rows || []).map(row => [entityKey(row.entityType, row.id), row]));
  const rows = protectedRows.map(row => {
    const key = entityKey(row.entityType, row.entityId);
    const currentRow = scanByKey.get(key);
    const baseline = flatProtectedMetric(row, windowDays);
    if (!currentRow) {
      return {
        sku: row.sku,
        entityType: row.entityType,
        entityId: row.entityId,
        kind: row.kind,
        text: row.text,
        status: 'passed',
        baseline,
        current: {},
        verdict: 'no_current_low_eff_signal',
        nextAction: 'keep_protected_row_under_normal_monitoring',
      };
    }
    const current = scanWindowMetric(currentRow, windowDays);
    const flags = collapseFlags(baseline, current);
    const renewedHardWaste = HARD_REGEX.test(reasonText(currentRow));
    const collapse = flags.impressionsCollapsed || flags.clicksCollapsed || flags.ordersCollapsed;
    const status = renewedHardWaste || collapse ? 'needs_review' : 'passed';
    const verdict = renewedHardWaste
      ? 'renewed_hard_waste'
      : collapse
        ? 'possible_misfire_review'
        : 'still_low_eff_but_not_collapsed';
    return {
      sku: row.sku,
      entityType: row.entityType,
      entityId: row.entityId,
      kind: row.kind,
      text: row.text,
      status,
      baseline,
      current,
      verdict,
      reasonCode: currentRow.decision?.reasonCode || '',
      signal: reasonText(currentRow),
      ...flags,
      nextAction: status === 'needs_review'
        ? 'review_this_exact_row_before_any_more_cuts_or_reopen_only_if_it_was_overcut'
        : 'keep_protected_row_under_normal_monitoring',
    };
  });
  const needsReview = rows.filter(row => row.status === 'needs_review').length;
  const inLowEfficiencyPool = rows.filter(row => row.verdict !== 'no_current_low_eff_signal').length;
  return {
    status: needsReview ? 'needs_review' : 'passed',
    windowDays,
    sourceOk: true,
    sourceFiles: checkpointScan.sources || [],
    commands: checkpointScan.commands || [],
    rows,
    summary: {
      tracked: rows.length,
      inLowEfficiencyPool,
      needsReview,
    },
    reasons: needsReview
      ? [`${needsReview} protected rows need exact-row review`]
      : ['no protected row-level misfire detected in checkpoint low-efficiency scans'],
  };
}

function buildMarketEvidenceAudit(rootCauseReview = {}) {
  const plan = Array.isArray(rootCauseReview.marketEvidencePlan) ? rootCauseReview.marketEvidencePlan : [];
  if (!plan.length) {
    return {
      status: 'pending_data',
      requiredBuckets: 0,
      readyBuckets: 0,
      missingBuckets: 0,
      needsReviewBuckets: 0,
      rows: [],
      reasons: ['market evidence plan is missing'],
    };
  }
  const missing = plan.filter(row => row.evidenceStatus === 'required_missing' || !row.evidenceStatus);
  const needsReview = plan.filter(row => /needs_review|rejected|conflict/i.test(row.evidenceStatus || ''));
  const ready = plan.filter(row => /^evidence_ready/.test(row.evidenceStatus || '') || row.evidenceStatus === 'reopen_blocked_verified');
  return {
    status: needsReview.length ? 'needs_review' : (missing.length ? 'pending_data' : 'passed'),
    requiredBuckets: plan.length,
    readyBuckets: ready.length,
    missingBuckets: missing.length,
    needsReviewBuckets: needsReview.length,
    rows: plan,
    reasons: missing.length
      ? [`${missing.length} market-misjudged buckets still need selection evidence`]
      : needsReview.length
        ? [`${needsReview.length} market evidence buckets need review`]
        : ['market evidence is ready for all market-misjudged buckets'],
  };
}

function completionGate(key, status, evidence, nextAction = '') {
  return { key, status, evidence, nextAction };
}

function riskyRootCauseVerdicts(rootCauseOutcome = {}) {
  const risky = new Set([
    'habit_control_overcut_review',
    'habit_spend_not_controlled',
    'market_spend_not_controlled',
    'protected_possible_misfire_review',
    'pending_previous_window',
  ]);
  return (rootCauseOutcome.verdicts || []).filter(row => risky.has(row.verdict));
}

function scheduled3dCheckpointGate({ readiness, scheduled3dCheckpoint = {} }) {
  if (!readiness.checkpoint7dDue) {
    return completionGate(
      'scheduled_3d_checkpoint_review',
      'pending_not_due',
      '7d checkpoint is not due yet',
      'run_scheduled_3d_checkpoint_first',
    );
  }
  if (!scheduled3dCheckpoint.ok) {
    return completionGate(
      'scheduled_3d_checkpoint_review',
      'pending_data',
      `scheduled 3d checkpoint report missing: ${scheduled3dCheckpoint.file || ''}`,
      'run_checkpoint_3d_and_fetch_missing_data',
    );
  }
  const report = scheduled3dCheckpoint.data || {};
  const has3dData = !!report.readiness?.checkpoint3dHasData;
  const rootReady = report.rootCauseOutcome?.status === 'evaluated';
  const riskyVerdicts = riskyRootCauseVerdicts(report.rootCauseOutcome);
  const possibleMisfire = report.outcome?.verdict === 'possible_misfire_review';
  if (!has3dData || !rootReady) {
    return completionGate(
      'scheduled_3d_checkpoint_review',
      'pending_data',
      `scheduled 3d data=${has3dData}; segment verdict status=${report.rootCauseOutcome?.status || 'missing'}`,
      'complete_scheduled_3d_checkpoint_before_final_judgment',
    );
  }
  if (possibleMisfire || riskyVerdicts.length) {
    return completionGate(
      'scheduled_3d_checkpoint_review',
      'needs_review',
      `possibleMisfire=${possibleMisfire}; risky segment verdicts=${riskyVerdicts.length}`,
      'review_scheduled_3d_misfire_before_final_judgment',
    );
  }
  return completionGate(
    'scheduled_3d_checkpoint_review',
    'passed',
    'scheduled 3d checkpoint has data and no risky segment verdicts',
    'use_7d_checkpoint_for_final_verification',
  );
}

function protectedRowAuditGate({ readiness, protectedRowAudit = {} }) {
  if (!readiness.checkpoint3dDue) {
    return completionGate(
      'protected_row_recheck',
      'pending_not_due',
      'protected row-level recheck is not due yet',
      'run_at_3d_checkpoint',
    );
  }
  if (protectedRowAudit.status === 'passed') {
    return completionGate(
      'protected_row_recheck',
      'passed',
      `${protectedRowAudit.summary?.tracked || 0} protected rows checked; ${protectedRowAudit.summary?.needsReview || 0} need review`,
      'keep_exact_row_guardrails',
    );
  }
  if (protectedRowAudit.status === 'needs_review') {
    return completionGate(
      'protected_row_recheck',
      'needs_review',
      `${protectedRowAudit.summary?.needsReview || 0} protected rows need review`,
      'review_protected_exact_rows_before_claiming_no_misfire',
    );
  }
  return completionGate(
    'protected_row_recheck',
    'pending_data',
    'checkpoint low-efficiency scans missing or incomplete',
    'run_checkpoint_low_efficiency_recheck_for_all_layers',
  );
}

function marketEvidenceGate(marketEvidenceAudit = {}) {
  if (marketEvidenceAudit.status === 'passed') {
    return completionGate(
      'market_evidence_review',
      'passed',
      `${marketEvidenceAudit.readyBuckets || 0}/${marketEvidenceAudit.requiredBuckets || 0} market buckets ready`,
      'keep_market_reopen_boundaries',
    );
  }
  if (marketEvidenceAudit.status === 'needs_review') {
    return completionGate(
      'market_evidence_review',
      'needs_review',
      `${marketEvidenceAudit.needsReviewBuckets || 0} market buckets need evidence review`,
      'review_market_evidence_before_reopen',
    );
  }
  return completionGate(
    'market_evidence_review',
    'pending_data',
    `${marketEvidenceAudit.missingBuckets || 0}/${marketEvidenceAudit.requiredBuckets || 0} market buckets missing evidence`,
    'collect_product_time_machine_keyword_conversion_and_aba_evidence',
  );
}

function assessCompletionAudit({ readiness, outcome, rootCauseOutcome, adjustmentSummary, hardResiduals, rootCauseSegments, scheduled3dCheckpoint, protectedRowAudit, marketEvidenceAudit }) {
  const gates = [];
  const landedActions = num(adjustmentSummary?.uniqueSuccess);
  const hardResidualCount = (hardResiduals || []).length;
  const hardStopStatus = landedActions > 0 && hardResidualCount <= 1
    ? 'passed_with_known_backend_exception'
    : 'incomplete';
  gates.push(completionGate(
    'hard_stop_landed',
    hardStopStatus,
    `${landedActions} landed actions; ${hardResidualCount} hard residual rows`,
    hardStopStatus === 'incomplete' ? 'finish_or_explain_remaining_hard_stop_rows' : 'monitor_known_backend_blocked_residual',
  ));

  const segmentReady = !!rootCauseSegments?.sourceOk && (rootCauseSegments?.segments || []).length >= 3;
  gates.push(completionGate(
    'root_cause_split_ready',
    segmentReady ? 'passed' : 'incomplete',
    `${(rootCauseSegments?.segments || []).length} root-cause segments; source available=${!!rootCauseSegments?.sourceOk}`,
    segmentReady ? 'use_segment_verdicts_for_checkpoint' : 'generate_root_cause_review_before_final_judgment',
  ));

  gates.push(completionGate(
    'checkpoint_3d_data',
    readiness.checkpoint3dDue
      ? (readiness.checkpoint3dHasData ? 'passed' : 'pending_data')
      : 'pending_not_due',
    `3d due=${readiness.checkpoint3dDue}; data=${readiness.checkpoint3dHasData}`,
    readiness.checkpoint3dHasData ? 'evaluate_3d_segment_verdicts' : 'fetch_3d_ad_sku_summary_on_or_after_checkpoint_date',
  ));

  gates.push(completionGate(
    'checkpoint_7d_data',
    readiness.checkpoint7dDue
      ? (readiness.checkpoint7dHasData ? 'passed' : 'pending_data')
      : 'pending_not_due',
    `7d due=${readiness.checkpoint7dDue}; data=${readiness.checkpoint7dHasData}`,
    readiness.checkpoint7dHasData ? 'evaluate_final_7d_result' : 'fetch_7d_ad_sku_summary_on_or_after_checkpoint_date',
  ));

  const scheduled3dGate = scheduled3dCheckpointGate({ readiness, scheduled3dCheckpoint });
  gates.push(scheduled3dGate);

  const protectedRowGate = protectedRowAuditGate({ readiness, protectedRowAudit });
  gates.push(protectedRowGate);

  const marketEvidenceReviewGate = marketEvidenceGate(marketEvidenceAudit);
  gates.push(marketEvidenceReviewGate);

  const rootCauseReady = rootCauseOutcome?.status === 'evaluated';
  const riskyVerdicts = riskyRootCauseVerdicts(rootCauseOutcome);
  gates.push(completionGate(
    'root_cause_segment_verdicts',
    rootCauseReady
      ? (riskyVerdicts.length ? 'needs_review' : 'passed')
      : 'pending_data',
    rootCauseReady
      ? `${riskyVerdicts.length} risky segment verdicts`
      : `segment verdict status=${rootCauseOutcome?.status || 'missing'}`,
    riskyVerdicts.length ? 'review_risky_segment_before_claiming_improvement' : 'keep_segment_boundaries',
  ));

  const outcomePass = outcome?.verdict === 'cost_control_without_obvious_harm';
  gates.push(completionGate(
    'improvement_without_obvious_harm',
    outcome?.status === 'evaluated'
      ? (outcomePass ? 'passed' : 'needs_review')
      : 'pending_data',
    `overall verdict=${outcome?.verdict || 'missing'}; status=${outcome?.status || 'missing'}`,
    outcomePass ? 'hold_current_control_until_next_checkpoint' : 'do_not_mark_goal_complete',
  ));

  const finalVerified = readiness.checkpoint3dHasData && readiness.checkpoint7dHasData &&
    scheduled3dGate.status === 'passed' && protectedRowGate.status === 'passed' &&
    marketEvidenceReviewGate.status === 'passed' &&
    outcomePass && rootCauseReady && !riskyVerdicts.length;
  const hasReviewGate = gates.some(gate => gate.status === 'needs_review' || gate.status === 'incomplete');
  return {
    status: finalVerified ? 'complete_candidate_verified' : (hasReviewGate ? 'needs_review' : 'pending_checkpoint_data'),
    finalVerified,
    gates,
    reasons: finalVerified
      ? ['3d and 7d data are present, protected rows are rechecked, market evidence is ready, and improvement without obvious harm is verified']
      : ['final proof requires both 3d and 7d data, protected row recheck, market evidence review, overall improvement, and no risky root-cause segment verdicts'],
  };
}

function buildReport() {
  const adjustments = actionLog();
  const adjustmentSummary = summarizeAdjustments(adjustments);
  const successKeys = new Set(adjustmentSummary.successKeys);
  const scanRows = loadScanRows();
  const queueRows = loadQueueRows();
  const impactedSkus = summarizeImpactedSkus(adjustments, queueRows);
  const protectedRows = protectedGrayRows(scanRows, successKeys);
  const hardResiduals = hardResidualRows(scanRows, successKeys);
  const rootCauseReview = loadRootCauseReview();
  const rootCauseSegments = buildRootCauseSegments({
    queueRows,
    protectedRows,
    rootCauseReview: rootCauseReview.data,
    rootCauseFile: rootCauseReview.file,
    rootCauseOk: rootCauseReview.ok,
  });
  const marketEvidenceAudit = buildMarketEvidenceAudit(rootCauseReview.data);
  const trackedSkus = new Set([
    ...impactedSkus.map(row => row.sku),
    ...protectedRows.map(row => row.sku),
    ...hardResiduals.map(row => row.sku),
  ]);
  const baseline30 = loadAdSkuSummary(30, BUSINESS_DATE);
  const checkpoint3 = loadAdSkuSummary(3, CHECKPOINT_DATE);
  const checkpoint7 = loadAdSkuSummary(7, CHECKPOINT_DATE);
  const checkpoint30 = loadAdSkuSummary(30, CHECKPOINT_DATE);
  const checkpointLowEfficiencyScan = loadCheckpointLowEfficiencyScan(CHECKPOINT_DATE);
  const targetDates = {
    checkpoint3d: addDays(BUSINESS_DATE, 3),
    checkpoint7d: addDays(BUSINESS_DATE, 7),
  };
  const scheduled3dCheckpoint = loadCheckpointReport(targetDates.checkpoint3d);
  const readiness = checkpointReadiness({
    businessDate: BUSINESS_DATE,
    checkpointDate: CHECKPOINT_DATE,
    checkpoint3Ok: checkpoint3.ok,
    checkpoint7Ok: checkpoint7.ok,
    checkpoint30Ok: checkpoint30.ok,
  });
  const protectedRowAudit = buildProtectedRowAudit({
    readiness,
    protectedRows,
    checkpointScan: checkpointLowEfficiencyScan,
  });
  const requirements = dataRequirements({
    readiness,
    checkpointDate: CHECKPOINT_DATE,
    checkpoint3Ok: checkpoint3.ok,
    checkpoint7Ok: checkpoint7.ok,
    checkpoint30Ok: checkpoint30.ok,
  });
  const metrics = {
    baseline30d: {
      sourceFile: baseline30.file,
      ok: baseline30.ok,
      trackedSkus: metricFromRows(baseline30.rows, trackedSkus),
      protectedSkus: metricFromRows(baseline30.rows, new Set(protectedRows.map(row => row.sku))),
      impactedSkus: metricFromRows(baseline30.rows, new Set(impactedSkus.map(row => row.sku))),
      rootCauseSegments: rootCauseSegmentMetrics(baseline30.rows, rootCauseSegments.segments),
    },
    checkpoint3d: {
      sourceFile: checkpoint3.file,
      ok: checkpoint3.ok,
      trackedSkus: metricFromRows(checkpoint3.rows, trackedSkus),
      protectedSkus: metricFromRows(checkpoint3.rows, new Set(protectedRows.map(row => row.sku))),
      rootCauseSegments: rootCauseSegmentMetrics(checkpoint3.rows, rootCauseSegments.segments),
    },
    checkpoint7d: {
      sourceFile: checkpoint7.file,
      ok: checkpoint7.ok,
      trackedSkus: metricFromRows(checkpoint7.rows, trackedSkus),
      protectedSkus: metricFromRows(checkpoint7.rows, new Set(protectedRows.map(row => row.sku))),
      rootCauseSegments: rootCauseSegmentMetrics(checkpoint7.rows, rootCauseSegments.segments),
    },
    checkpoint30d: {
      sourceFile: checkpoint30.file,
      ok: checkpoint30.ok,
      trackedSkus: metricFromRows(checkpoint30.rows, trackedSkus),
      protectedSkus: metricFromRows(checkpoint30.rows, new Set(protectedRows.map(row => row.sku))),
      rootCauseSegments: rootCauseSegmentMetrics(checkpoint30.rows, rootCauseSegments.segments),
    },
  };
  const outcome = assessWindowOutcome({ readiness, metrics, hardResiduals });
  const rootCauseOutcome = assessRootCauseSegmentOutcomes({ readiness, metrics });
  const completionAudit = assessCompletionAudit({
    readiness,
    outcome,
    rootCauseOutcome,
    adjustmentSummary,
    hardResiduals,
    rootCauseSegments,
    scheduled3dCheckpoint,
    protectedRowAudit,
    marketEvidenceAudit,
  });
  return {
    generatedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    checkpointDate: CHECKPOINT_DATE,
    targetDates,
    baselineGroup: BASELINE_GROUP,
    readiness,
    dataRequirements: requirements,
    adjustmentSummary: {
      rawRecords: adjustmentSummary.rawRecords,
      uniqueSuccess: adjustmentSummary.uniqueSuccess,
      successByType: adjustmentSummary.successByType,
      successActionByType: adjustmentSummary.successActionByType,
      unresolvedFailures: adjustmentSummary.unresolvedFailures,
    },
    hardResiduals,
    impactedSkus,
    protectedGrayRows: protectedRows,
    protectedRowAudit,
    marketEvidenceAudit,
    rootCauseSegments,
    metrics,
    outcome,
    rootCauseOutcome,
    completionAudit,
    reviewRules: [
      '3d: hard residual candidates should stay near zero except backend-blocked rows.',
      '3d: protected gray rows must keep meaningful impressions/clicks and should not lose all recent orders.',
      '3d/7d: protected row entity IDs should be rechecked in same-day low-efficiency scans before claiming no misfire.',
      '7d: owner ad share and ACOS should move toward SJ average without a sharp display/click/order collapse.',
      '7d: if hard candidates regenerate, cut the regenerating layer only: auto loose/substitutes, broad/phrase KW, ASIN-expanded, or SBV/SB keyword.',
      'Reopen market-misjudged buckets only after the market evidence review is ready: Product Time Machine proof plus exact term or ASIN conversion.',
    ],
  };
}

function writeMarkdown(report, file) {
  const lines = [
    `# Invalid Spend Checkpoint - ${report.businessDate} as of ${report.checkpointDate}`,
    '',
    `Status: ${report.readiness.status}`,
    `3d target: ${report.targetDates.checkpoint3d}; 7d target: ${report.targetDates.checkpoint7d}`,
    '',
    '## Execution Baseline',
    '',
    `- Landed actions: ${report.adjustmentSummary.uniqueSuccess}`,
    `- Unresolved failures: ${report.adjustmentSummary.unresolvedFailures.length}`,
    `- Hard residual candidates: ${report.hardResiduals.length}`,
    `- Protected gray rows tracked: ${report.protectedGrayRows.length}`,
    '',
    '## Group Baseline',
    '',
    `- Huang Chengzhe ad share ${pct(report.baselineGroup.ownerAdShare)}, ACOS ${pct(report.baselineGroup.ownerAcos)}, gross margin ${pct(report.baselineGroup.ownerGrossMargin)}.`,
    `- SJ average ad share ${pct(report.baselineGroup.sjAdShare)}, ACOS ${pct(report.baselineGroup.sjAcos)}, gross margin ${pct(report.baselineGroup.sjGrossMargin)}.`,
    '',
    '## Data Readiness',
    '',
    `- 3d due: ${report.readiness.checkpoint3dDue}; data: ${report.readiness.checkpoint3dHasData}; file: ${report.metrics.checkpoint3d.sourceFile}`,
    `- 7d due: ${report.readiness.checkpoint7dDue}; data: ${report.readiness.checkpoint7dHasData}; file: ${report.metrics.checkpoint7d.sourceFile}`,
    `- 30d data for checkpoint date: ${report.readiness.checkpoint30dHasData}; file: ${report.metrics.checkpoint30d.sourceFile}`,
    '',
    '## Data Requirements',
    '',
  ];
  if (!report.dataRequirements.required.length) {
    lines.push('- Required files: none for the current checkpoint state.');
  } else {
    lines.push('| Day | Required file | Fetch command |', '|---:|---|---|');
    for (const item of report.dataRequirements.required) {
      lines.push(`| ${item.day} | ${item.file} | \`${item.command}\` |`);
    }
  }
  if (report.dataRequirements.optional.length) {
    lines.push('', 'Optional context files:', '');
    for (const item of report.dataRequirements.optional) {
      lines.push(`- ${item.file}: \`${item.command}\` (${item.reason})`);
    }
  }
  if (report.dataRequirements.commands.length) {
    lines.push('', 'Run before rechecking:', '', '```powershell');
    for (const command of report.dataRequirements.commands) lines.push(command);
    lines.push('```');
  }
  if (report.readiness.checkpoint3dDue) {
    lines.push('', 'Protected row-level recheck files:', '');
    lines.push('| Layer | File | Ready |', '|---|---|---:|');
    for (const source of report.protectedRowAudit.sourceFiles || []) {
      lines.push(`| ${source.kind} | ${source.file} | ${source.ok} |`);
    }
    if (report.protectedRowAudit.status === 'pending_data') {
      lines.push('', 'Run protected row recheck before final judgment:', '', '```powershell');
      for (const command of report.protectedRowAudit.commands || []) lines.push(command);
      lines.push('```');
    }
  }
  if (report.fetchMissing) {
    lines.push('', '## Fetch Missing Attempt', '');
    lines.push(`- Status: ${report.fetchMissing.status}`);
    lines.push(`- Current date: ${report.fetchMissing.currentDate || ''}`);
    if (report.fetchMissing.reason) lines.push(`- Reason: ${report.fetchMissing.reason}`);
    if ((report.fetchMissing.commands || []).length) {
      lines.push('- Commands:');
      for (const item of report.fetchMissing.commands) {
        if (typeof item === 'string') lines.push(`  - ${item}`);
        else lines.push(`  - ${item.command} ${(item.args || []).join(' ')} => ${item.status}`);
      }
    }
  }
  lines.push(
    '',
    '## Outcome Verdict',
    '',
    `- Verdict: ${report.outcome.verdict}`,
    `- Window: ${report.outcome.window || 'none'}`,
    `- Status: ${report.outcome.status}`,
    `- Hard residual within tolerance: ${report.outcome.hardResidualOk}`,
    `- Reasons: ${(report.outcome.reasons || []).join('; ') || 'none'}`,
    '',
    '## Completion Audit',
    '',
    `- Status: ${report.completionAudit.status}`,
    `- Final verified: ${report.completionAudit.finalVerified}`,
    `- Reasons: ${(report.completionAudit.reasons || []).join('; ') || 'none'}`,
    '',
    '| Gate | Status | Evidence | Next action |',
    '|---|---|---|---|',
  );
  for (const gate of report.completionAudit.gates || []) {
    lines.push(`| ${gate.key} | ${gate.status} | ${gate.evidence} | ${gate.nextAction} |`);
  }
  lines.push(
    '',
    '## Root-Cause Segment Metrics',
    '',
    `- Source: ${report.rootCauseSegments.sourceFile || 'queue-derived'}; available: ${report.rootCauseSegments.sourceOk}`,
    '',
    '| Window | Segment | SKUs | Impressions | Clicks | Cost | Orders | ACOS | Impression delta | Click delta | Cost delta | Order delta | Rule |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  );
  for (const [windowKey, label] of [
    ['baseline30d', 'Baseline 30d'],
    ['checkpoint3d', 'Checkpoint 3d'],
    ['checkpoint7d', 'Checkpoint 7d'],
    ['checkpoint30d', 'Checkpoint 30d'],
  ]) {
    const windowMetric = report.metrics[windowKey];
    if (!windowMetric?.ok) continue;
    for (const segment of windowMetric.rootCauseSegments || []) {
      const metric = segment.metrics || {};
      lines.push(`| ${label} | ${segment.label} | ${segment.skuCount} | ${metric.impressions ?? 0} | ${metric.clicks ?? 0} | ${metric.cost ?? 0} | ${metric.orders ?? 0} | ${pct(metric.acos)} | ${pct(metric.delta?.impressionsPct)} | ${pct(metric.delta?.clicksPct)} | ${pct(metric.delta?.costPct)} | ${pct(metric.delta?.ordersPct)} | ${segment.rule} |`);
    }
  }
  if (!report.rootCauseSegments.protectedReviewLevels.length) {
    lines.push('| Protected levels | none | 0 | | | | | | | | | | |');
  } else {
    lines.push('', 'Protected review levels:', '');
    for (const row of report.rootCauseSegments.protectedReviewLevels) {
      lines.push(`- ${row.key}: ${row.rows} rows, ${row.skus.length} SKUs`);
    }
  }
  lines.push('', '## Root-Cause Segment Verdicts', '');
  lines.push(`- Status: ${report.rootCauseOutcome.status}`);
  lines.push(`- Window: ${report.rootCauseOutcome.window || 'none'}`);
  if ((report.rootCauseOutcome.reasons || []).length) {
    lines.push(`- Reasons: ${report.rootCauseOutcome.reasons.join('; ')}`);
  }
  if ((report.rootCauseOutcome.verdicts || []).length) {
    lines.push('', '| Segment | Verdict | Impression delta | Click delta | Cost delta | Order delta | Next action | Reasons |', '|---|---|---:|---:|---:|---:|---|---|');
    for (const row of report.rootCauseOutcome.verdicts) {
      lines.push(`| ${row.label} | ${row.verdict} | ${pct(row.delta?.impressionsPct)} | ${pct(row.delta?.clicksPct)} | ${pct(row.delta?.costPct)} | ${pct(row.delta?.ordersPct)} | ${row.nextAction} | ${(row.reasons || []).join('; ') || 'none'} |`);
    }
  }
  lines.push('', '## Market Evidence Review', '');
  lines.push(`- Status: ${report.marketEvidenceAudit.status}`);
  lines.push(`- Summary: required ${report.marketEvidenceAudit.requiredBuckets}; ready ${report.marketEvidenceAudit.readyBuckets}; missing ${report.marketEvidenceAudit.missingBuckets}; needs review ${report.marketEvidenceAudit.needsReviewBuckets}`);
  lines.push(`- Reasons: ${(report.marketEvidenceAudit.reasons || []).join('; ') || 'none'}`);
  const marketRows = (report.marketEvidenceAudit.rows || []).slice(0, 12);
  if (marketRows.length) {
    lines.push('', '| Market bucket | Status | Verdict | 30d spend | Top SKUs | Seed terms | Evidence notes | Reopen boundary |', '|---|---|---|---:|---|---|---|---|');
    for (const row of marketRows) {
      lines.push(`| ${row.marketBucket} | ${row.evidenceStatus || ''} | ${row.marketVerdict || ''} | ${row.spend30 ?? ''} | ${(row.topSkus || []).join(', ')} | ${(row.topTerms || []).join('; ') || String(row.marketBucket || '').replace(/_/g, ' ')} | ${(row.evidenceReasons || []).join('; ') || 'ok'} | ${row.reopenBoundary || row.reopenGate || ''} |`);
    }
    lines.push('', 'Market evidence commands:', '');
    for (const row of marketRows) {
      lines.push(`- ${row.marketBucket}:`);
      for (const command of row.commands || []) lines.push(`  - \`${command}\``);
    }
  }
  lines.push('', '## Protected Row Recheck', '');
  lines.push(`- Status: ${report.protectedRowAudit.status}`);
  lines.push(`- Window days: ${report.protectedRowAudit.windowDays}`);
  lines.push(`- Summary: tracked ${report.protectedRowAudit.summary?.tracked || 0}; in low-efficiency pool ${report.protectedRowAudit.summary?.inLowEfficiencyPool || 0}; needs review ${report.protectedRowAudit.summary?.needsReview || 0}`);
  lines.push(`- Reasons: ${(report.protectedRowAudit.reasons || []).join('; ') || 'none'}`);
  const protectedAuditRows = (report.protectedRowAudit.rows || []).filter(row => row.status !== 'passed').slice(0, 30);
  if (protectedAuditRows.length) {
    lines.push('', '| SKU | Layer | Entity | Traffic | Status | Verdict | Base impr | Cur impr | Base clicks | Cur clicks | Base orders | Cur orders | Next action |', '|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|');
    for (const row of protectedAuditRows) {
      lines.push(`| ${row.sku} | ${row.kind} | ${row.entityId} | ${row.text} | ${row.status} | ${row.verdict} | ${row.baseline?.impressions ?? ''} | ${row.current?.impressions ?? ''} | ${row.baseline?.clicks ?? ''} | ${row.current?.clicks ?? ''} | ${row.baseline?.orders ?? ''} | ${row.current?.orders ?? ''} | ${row.nextAction} |`);
    }
  } else {
    lines.push('', '| SKU | Layer | Entity | Traffic | Status | Verdict |', '|---|---|---|---|---|---|');
    lines.push('| none | | | | | |');
  }
  lines.push(
    '',
    '## Hard Residuals',
    '',
    '| SKU | Kind | Entity | Traffic | Campaign | Action | Signal |',
    '|---|---|---|---|---|---|---|',
  );
  for (const row of report.hardResiduals.slice(0, 20)) {
    lines.push(`| ${row.sku} | ${row.kind} | ${row.entityId} | ${row.text} | ${row.campaignName} | ${row.proposedAction} ${row.currentBid}->${row.proposedBid ?? ''} | ${row.signal} |`);
  }
  if (!report.hardResiduals.length) lines.push('| none | | | | | | |');
  lines.push('', '## Top Impacted SKUs', '', '| SKU | Actions | Bid-down | Pause | Represented 30d spend | Clicks | Orders | Examples |', '|---|---:|---:|---:|---:|---:|---:|---|');
  for (const row of report.impactedSkus.slice(0, 20)) {
    lines.push(`| ${row.sku} | ${row.actions} | ${row.bidDown} | ${row.pause} | ${row.representedSpend30} | ${row.representedClicks30} | ${row.representedOrders30} | ${row.examples.join('; ')} |`);
  }
  lines.push('', '## Protected Gray Rows', '', '| SKU | Layer | Traffic | Impr7 | Clicks7 | Spend7 | Orders7 | ACOS7 | Impr30 | Clicks30 | Spend30 | Orders30 | ACOS30 |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of report.protectedGrayRows.slice(0, 20)) {
    lines.push(`| ${row.sku} | ${row.kind} | ${row.text} | ${row.impressions7} | ${row.clicks7} | ${row.spend7} | ${row.orders7} | ${pct(row.acos7)} | ${row.impressions30} | ${row.clicks30} | ${row.spend30} | ${row.orders30} | ${pct(row.acos30)} |`);
  }
  lines.push('', '## Review Rules', '');
  for (const rule of report.reviewRules) lines.push(`- ${rule}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  let report = buildReport();
  let fetchResult = null;
  if (FETCH_MISSING) {
    fetchResult = fetchMissingData(report);
    if (fetchResult.status === 'fetched') report = buildReport();
    report.fetchMissing = fetchResult;
  }
  writeJson(OUT_FILE, report);
  writeMarkdown(report, OUT_MD);
  console.log(JSON.stringify({
    outputFile: path.relative(ROOT, OUT_FILE).replace(/\\/g, '/'),
    markdownFile: path.relative(ROOT, OUT_MD).replace(/\\/g, '/'),
    status: report.readiness.status,
    landedActions: report.adjustmentSummary.uniqueSuccess,
    unresolvedFailures: report.adjustmentSummary.unresolvedFailures.length,
    hardResidualCandidates: report.hardResiduals.length,
    protectedGrayRows: report.protectedGrayRows.length,
    checkpoint3d: report.targetDates.checkpoint3d,
    checkpoint7d: report.targetDates.checkpoint7d,
    fetchMissing: fetchResult?.status || null,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  addDays,
  adSkuSummaryFetchCommand,
  adSkuSummaryPath,
  buildProtectedRowAudit,
  assessWindowOutcome,
  buildMarketEvidenceAudit,
  assessRootCauseSegment,
  assessRootCauseSegmentOutcomes,
  assessCompletionAudit,
  buildReport,
  buildRootCauseSegments,
  canFetchCheckpoint,
  checkpointReadiness,
  dataRequirements,
  fetchMissingData,
  inferSku,
  metricFromRows,
  nextActionForRootCauseVerdict,
  pctDelta,
  marketEvidenceGate,
  protectedRowAuditGate,
  resolveCheckpointDate,
  resolveNextCheckpointDate,
  rootCauseSegmentMetrics,
  runCommand,
  scheduled3dCheckpointGate,
  summarizeAdjustments,
  summarizeImpactedSkus,
  hardResidualRows,
  protectedGrayRows,
};
