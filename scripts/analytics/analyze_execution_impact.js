const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(PROJECT_ROOT, 'data', 'snapshots');
const HISTORY_FILE = path.join(PROJECT_ROOT, 'data', 'adjustment_history.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'attribution');
const DEFAULT_HORIZONS = [1, 3, 7, 14, 30];

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function ymd(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromFilename(name) {
  const match = String(name || '').match(/20\d{2}-\d{2}-\d{2}/);
  return match ? parseDate(match[0]) : null;
}

function dayDiff(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function pctDelta(before, after) {
  if (!before && !after) return 0;
  if (!before) return after > 0 ? 1 : 0;
  return (after - before) / Math.abs(before);
}

function readMetric(card = {}) {
  const ad30 = card.adStats?.['30d'] || {};
  const ad7 = card.adStats?.['7d'] || {};
  const sb30 = card.sbStats?.['30d'] || {};
  const sb7 = card.sbStats?.['7d'] || {};
  const price = num(card.price || card.listing?.price);
  const profitRate = num(card.profitRate);
  const sales7 = num(card.unitsSold_7d) * price;
  const sales30 = num(card.unitsSold_30d) * price;
  const adSpend7 = num(ad7.spend) + num(sb7.spend);
  const adSpend30 = num(ad30.spend) + num(sb30.spend);
  const grossProfit7 = sales7 * profitRate;
  const grossProfit30 = sales30 * profitRate;
  return {
    units3: num(card.unitsSold_3d),
    units7: num(card.unitsSold_7d),
    units30: num(card.unitsSold_30d),
    invDays: num(card.invDays),
    price,
    sales7,
    sales30,
    profitRate,
    grossProfit7,
    grossProfit30,
    contributionProfit7: grossProfit7 - adSpend7,
    contributionProfit30: grossProfit30 - adSpend30,
    adSpend7,
    adOrders7: num(ad7.orders) + num(sb7.orders),
    adClicks7: num(ad7.clicks) + num(sb7.clicks),
    adImpressions7: num(ad7.impressions) + num(sb7.impressions),
    adAcos7: num(ad7.acos),
    adSpend30,
    adOrders30: num(ad30.orders) + num(sb30.orders),
    adClicks30: num(ad30.clicks) + num(sb30.clicks),
    adImpressions30: num(ad30.impressions) + num(sb30.impressions),
    adAcos30: num(ad30.acos),
    sbSpend30: num(sb30.spend),
    sbOrders30: num(sb30.orders),
  };
}

function loadSnapshots(snapshotDir = SNAPSHOT_DIR) {
  if (!fs.existsSync(snapshotDir)) return [];
  const snapshots = [];
  for (const name of fs.readdirSync(snapshotDir)) {
    if (!name.endsWith('.json')) continue;
    if (!/(snapshot|latest)/i.test(name)) continue;
    const file = path.join(snapshotDir, name);
    const data = readJson(file);
    if (!data || !Array.isArray(data.productCards)) continue;
    const date = parseDate(data.exportedAt) || dateFromFilename(name);
    if (!date) continue;
    const bySku = new Map();
    for (const card of data.productCards) {
      const sku = cleanText(card.sku);
      if (!sku) continue;
      bySku.set(sku, readMetric(card));
    }
    snapshots.push({
      file,
      name,
      date,
      ymd: ymd(date),
      productCount: bySku.size,
      bySku,
    });
  }
  return snapshots.sort((a, b) => a.date - b.date);
}

function normalizeEvent(raw = {}, sourceFile = '') {
  const action = raw.action || {};
  const learning = raw.learning || action.learning || {};
  const sku = cleanText(raw.sku || action.sku);
  if (!sku) return null;
  const date = parseDate(raw.date || raw.executedAt || raw.generatedAt) || dateFromFilename(sourceFile);
  if (!date) return null;
  const currentBid = num(raw.currentBid ?? action.currentBid ?? raw.fromBid);
  const suggestedBid = num(raw.suggestedBid ?? action.suggestedBid ?? raw.toBid);
  const actionType = cleanText(action.actionType || raw.actionType || (suggestedBid === 0 && currentBid > 0 ? 'pause' : (suggestedBid || currentBid ? 'bid' : 'unknown')));
  const direction = cleanText(action.direction || raw.direction || (suggestedBid > currentBid ? 'up' : (suggestedBid < currentBid ? 'down' : 'same')));
  return {
    sku,
    date: ymd(date),
    dateObj: date,
    sourceFile: sourceFile ? path.basename(sourceFile) : 'adjustment_history.json',
    finalStatus: raw.finalStatus || raw.apiStatus || raw.outcome || 'history',
    entityType: cleanText(raw.entityType || action.entityType || 'unknown'),
    actionType,
    direction,
    riskLevel: cleanText(raw.riskLevel || action.riskLevel || ''),
    actionSource: Array.isArray(raw.actionSource || action.actionSource)
      ? (raw.actionSource || action.actionSource).join('+')
      : cleanText(raw.actionSource || action.actionSource || raw.source || action.source || ''),
    hypothesis: cleanText(raw.hypothesis || learning.hypothesis || action.hypothesis),
    baselineQuality: cleanText(raw.baselineQuality || learning.baselineQuality || ''),
    dataQualityWarnings: Array.isArray(raw.dataQualityWarnings || learning.dataQualityWarnings)
      ? (raw.dataQualityWarnings || learning.dataQualityWarnings)
      : [],
    attributionWeight: num(raw.attributionWeight ?? learning.attributionWeight ?? (learning.baselineQuality === 'complete' ? 1 : 0.35)),
    expectedEffect: raw.expectedEffect || learning.expectedEffect || {},
    measurementWindowDays: raw.measurementWindowDays || learning.measurementWindowDays || [],
    learning,
    fromBid: currentBid || null,
    toBid: suggestedBid || null,
    reason: cleanText(raw.reason || action.reason || raw.errorReason),
  };
}

function loadExecutionEvents(snapshotDir = SNAPSHOT_DIR, historyFile = HISTORY_FILE) {
  const events = [];
  if (fs.existsSync(snapshotDir)) {
    for (const name of fs.readdirSync(snapshotDir)) {
      if (!/^execution_verify_.*\.json$/i.test(name)) continue;
      const file = path.join(snapshotDir, name);
      const data = readJson(file, {});
      for (const raw of data.events || []) {
        if (!['success', 'created_pending_visibility'].includes(String(raw.finalStatus || ''))) continue;
        const event = normalizeEvent(raw, file);
        if (event) events.push(event);
      }
    }
  }
  const history = readJson(historyFile, []);
  if (Array.isArray(history)) {
    for (const raw of history) {
      const event = normalizeEvent(raw, historyFile);
      if (event) events.push(event);
    }
  }
  const seen = new Set();
  return events.filter(event => {
    const key = [event.sku, event.date, event.entityType, event.actionType, event.direction, event.fromBid, event.toBid, event.reason].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.dateObj - b.dateObj);
}

function nearestBefore(snapshots, event) {
  return [...snapshots].reverse().find(snapshot => snapshot.date <= event.dateObj && snapshot.bySku.has(event.sku)) || null;
}

function nearestAfter(snapshots, event, horizonDays) {
  return snapshots.find(snapshot => {
    const days = dayDiff(event.dateObj, snapshot.date);
    return days >= horizonDays && snapshot.bySku.has(event.sku);
  }) || null;
}

function compareMetrics(before, after) {
  if (!before || !after) return null;
  const incrementalSales30 = after.sales30 - before.sales30;
  const incrementalSpend30 = after.adSpend30 - before.adSpend30;
  const incrementalGrossProfit30 = after.grossProfit30 - before.grossProfit30;
  const incrementalContributionProfit30 = after.contributionProfit30 - before.contributionProfit30;
  const spendToSalesDeltaRatio = incrementalSales30 > 0 && incrementalSpend30 > 0
    ? incrementalSpend30 / incrementalSales30
    : (incrementalSpend30 > 0 ? 99 : 0);
  const conversionLiftVsSpendLift = pctDelta(before.adOrders30, after.adOrders30) - pctDelta(before.adSpend30, after.adSpend30);
  return {
    units7Delta: after.units7 - before.units7,
    units30Delta: after.units30 - before.units30,
    invDaysDelta: after.invDays - before.invDays,
    sales7Delta: after.sales7 - before.sales7,
    sales30Delta: incrementalSales30,
    grossProfit30Delta: incrementalGrossProfit30,
    contributionProfit30Delta: incrementalContributionProfit30,
    adSpend30Delta: after.adSpend30 - before.adSpend30,
    adOrders30Delta: after.adOrders30 - before.adOrders30,
    adAcos30Delta: after.adAcos30 - before.adAcos30,
    adClicks30Delta: after.adClicks30 - before.adClicks30,
    adImpressions30Delta: after.adImpressions30 - before.adImpressions30,
    sales30PctDelta: pctDelta(before.sales30, after.sales30),
    grossProfit30PctDelta: pctDelta(before.grossProfit30, after.grossProfit30),
    contributionProfit30PctDelta: pctDelta(before.contributionProfit30, after.contributionProfit30),
    units30PctDelta: pctDelta(before.units30, after.units30),
    adSpend30PctDelta: pctDelta(before.adSpend30, after.adSpend30),
    adOrders30PctDelta: pctDelta(before.adOrders30, after.adOrders30),
    adAcos30PctDelta: pctDelta(before.adAcos30, after.adAcos30),
    spendToSalesDeltaRatio,
    conversionLiftVsSpendLift,
  };
}

function impactScore(delta) {
  if (!delta) return 0;
  return (
    delta.units30PctDelta * 0.35 +
    delta.adOrders30PctDelta * 0.25 -
    delta.adSpend30PctDelta * 0.15 -
    delta.adAcos30PctDelta * 0.20 -
    Math.max(0, delta.invDaysDelta / 100) * 0.05
  );
}

function classifyImpact(event, delta) {
  if (!delta) return 'pending';
  const score = impactScore(delta);
  if (event.direction === 'down' || event.actionType === 'pause') {
    if (delta.adSpend30Delta < 0 && delta.units30PctDelta > -0.15) return 'cost_saved_without_sales_drop';
    if (delta.units30PctDelta < -0.25) return 'sales_drop_after_cut';
  }
  if (event.direction === 'up' || event.actionType === 'create' || event.actionType === 'enable') {
    if (delta.adSpend30Delta > 0 && delta.contributionProfit30Delta < 0) return 'spend_up_profit_down';
    if (delta.units30PctDelta > 0.15 && delta.adAcos30PctDelta <= 0.15) return 'growth_with_controlled_acos';
    if (delta.adSpend30PctDelta > 0.30 && delta.adOrders30PctDelta <= 0) return 'spend_up_without_orders';
    if (delta.adSpend30PctDelta > 0.20 && delta.conversionLiftVsSpendLift < -0.15) return 'spend_growth_outpacing_conversion';
  }
  if (score >= 0.15) return 'positive';
  if (score <= -0.15) return 'negative';
  return 'neutral';
}

function analyze({ horizons = DEFAULT_HORIZONS } = {}) {
  const snapshots = loadSnapshots();
  const events = loadExecutionEvents();
  const records = [];
  for (const event of events) {
    const beforeSnapshot = nearestBefore(snapshots, event);
    for (const horizon of horizons) {
      const afterSnapshot = nearestAfter(snapshots, event, horizon);
      const before = beforeSnapshot?.bySku.get(event.sku) || null;
      const after = afterSnapshot?.bySku.get(event.sku) || null;
      const delta = compareMetrics(before, after);
      records.push({
        ...event,
        horizonDays: horizon,
        beforeSnapshot: beforeSnapshot?.name || '',
        afterSnapshot: afterSnapshot?.name || '',
        observedDays: afterSnapshot ? dayDiff(event.dateObj, afterSnapshot.date) : null,
        before,
        after,
        delta,
        impact: classifyImpact(event, delta),
        resultLabel: delta ? classifyImpact(event, delta) : 'pending',
        impactScore: Number(impactScore(delta).toFixed(4)),
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    executionEventCount: events.length,
    horizons,
    records,
    summary: summarize(records),
  };
}

function summarize(records) {
  const summary = {};
  for (const record of records) {
    const key = [
      record.horizonDays + 'd',
      record.entityType,
      record.actionType,
      record.direction,
      record.riskLevel || 'unknown_risk',
      record.baselineQuality || 'unknown_baseline',
      record.impact,
    ].join('|');
    if (!summary[key]) {
      summary[key] = {
        horizonDays: record.horizonDays,
        entityType: record.entityType,
        actionType: record.actionType,
        direction: record.direction,
        riskLevel: record.riskLevel || 'unknown_risk',
        baselineQuality: record.baselineQuality || 'unknown_baseline',
        impact: record.impact,
        count: 0,
        avgImpactScore: 0,
        avgUnits30PctDelta: 0,
        avgAdSpend30PctDelta: 0,
        avgAdOrders30PctDelta: 0,
        avgAdAcos30PctDelta: 0,
        avgSales30PctDelta: 0,
        avgContributionProfit30Delta: 0,
        avgSpendToSalesDeltaRatio: 0,
      };
    }
    const bucket = summary[key];
    bucket.count += 1;
    bucket.avgImpactScore += record.impactScore;
    if (record.delta) {
      bucket.avgUnits30PctDelta += record.delta.units30PctDelta;
      bucket.avgAdSpend30PctDelta += record.delta.adSpend30PctDelta;
      bucket.avgAdOrders30PctDelta += record.delta.adOrders30PctDelta;
      bucket.avgAdAcos30PctDelta += record.delta.adAcos30PctDelta;
      bucket.avgSales30PctDelta += record.delta.sales30PctDelta;
      bucket.avgContributionProfit30Delta += record.delta.contributionProfit30Delta;
      bucket.avgSpendToSalesDeltaRatio += record.delta.spendToSalesDeltaRatio;
    }
  }
  return Object.values(summary)
    .map(bucket => ({
      ...bucket,
      avgImpactScore: Number((bucket.avgImpactScore / bucket.count).toFixed(4)),
      avgUnits30PctDelta: Number((bucket.avgUnits30PctDelta / bucket.count).toFixed(4)),
      avgAdSpend30PctDelta: Number((bucket.avgAdSpend30PctDelta / bucket.count).toFixed(4)),
      avgAdOrders30PctDelta: Number((bucket.avgAdOrders30PctDelta / bucket.count).toFixed(4)),
      avgAdAcos30PctDelta: Number((bucket.avgAdAcos30PctDelta / bucket.count).toFixed(4)),
      avgSales30PctDelta: Number((bucket.avgSales30PctDelta / bucket.count).toFixed(4)),
      avgContributionProfit30Delta: Number((bucket.avgContributionProfit30Delta / bucket.count).toFixed(2)),
      avgSpendToSalesDeltaRatio: Number((bucket.avgSpendToSalesDeltaRatio / bucket.count).toFixed(4)),
    }))
    .sort((a, b) => b.count - a.count || b.avgImpactScore - a.avgImpactScore);
}

function pct(value) {
  return `${(num(value) * 100).toFixed(1)}%`;
}

function writeMarkdown(report, file) {
  const ready = report.records.filter(record => record.delta);
  const pending = report.records.length - ready.length;
  const lines = [
    '# Execution Impact Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Snapshots: ${report.snapshotCount}`,
    `Execution events: ${report.executionEventCount}`,
    `Comparable records: ${ready.length}`,
    `Pending records: ${pending}`,
    '',
    '## Top Buckets',
    '',
    '| Horizon | Entity | Action | Direction | Risk | Baseline | Impact | Count | Score | Sales30 | Spend30 | Orders30 | ACOS30 | Profit$ | Spend/Sales Delta |',
    '|---:|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.summary.slice(0, 30)) {
    lines.push([
      `${row.horizonDays}d`,
      row.entityType,
      row.actionType,
      row.direction,
      row.riskLevel,
      row.baselineQuality,
      row.impact,
      row.count,
      row.avgImpactScore,
      pct(row.avgSales30PctDelta),
      pct(row.avgAdSpend30PctDelta),
      pct(row.avgAdOrders30PctDelta),
      pct(row.avgAdAcos30PctDelta),
      row.avgContributionProfit30Delta,
      row.avgSpendToSalesDeltaRatio,
    ].join('|').replace(/^/, '|').replace(/$/, '|'));
  }
  lines.push('', '## Recent Comparable Examples', '');
  for (const record of ready.slice(-30).reverse()) {
    lines.push(`- ${record.date} ${record.sku} ${record.entityType}/${record.actionType}/${record.direction} ${record.horizonDays}d -> ${record.impact}, baseline=${record.baselineQuality || 'unknown'}, weight=${record.attributionWeight || 0}, score=${record.impactScore}, sales30=${pct(record.delta.sales30PctDelta)}, spend30=${pct(record.delta.adSpend30PctDelta)}, orders30=${pct(record.delta.adOrders30PctDelta)}, acos30=${pct(record.delta.adAcos30PctDelta)}, contributionProfit30Delta=${record.delta.contributionProfit30Delta.toFixed(2)}, spendToSalesDeltaRatio=${record.delta.spendToSalesDeltaRatio.toFixed(4)}`);
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : OUTPUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const report = analyze();
  const jsonFile = path.join(outDir, 'execution_impact_report.json');
  const mdFile = path.join(outDir, 'execution_impact_report.md');
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf8');
  writeMarkdown(report, mdFile);
  console.log(`wrote ${jsonFile}`);
  console.log(`wrote ${mdFile}`);
  console.log(`events=${report.executionEventCount} snapshots=${report.snapshotCount} records=${report.records.length}`);
}

if (require.main === module) main();

module.exports = {
  analyze,
  loadExecutionEvents,
  loadSnapshots,
  compareMetrics,
  classifyImpact,
};
