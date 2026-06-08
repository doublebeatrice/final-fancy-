const fs = require('fs');
const path = require('path');
const {
  PROPERTY_CONFIGS,
  resolveSku,
  rowMetrics,
  rowTerm,
} = require('../../src/high_efficiency_filter');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_BUSINESS_DATE = new Date().toISOString().slice(0, 10);

const ENTITY_BY_PROPERTY = {
  1: { entityType: 'keyword', idField: 'keywordId', cardKey: 'keywords', rowSet: 'kwRows' },
  2: { entityType: 'autoTarget', idField: 'targetId', cardKey: 'autoTargets', rowSet: 'autoRows' },
  3: { entityType: 'manualTarget', idField: 'targetId', cardKey: 'autoTargets', rowSet: 'targetRows' },
  4: { entityType: 'sbKeyword', idField: 'keywordId', cardKey: 'sponsoredBrands', rowSet: 'sbRows' },
  6: { entityType: 'sbTarget', idField: 'targetId', cardKey: 'sponsoredBrands', rowSet: 'sbRows' },
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value || '').trim();
}

function roundBid(value) {
  return Number(Math.max(0.05, value).toFixed(2));
}

function stateEnabled(value) {
  const normalized = text(value).toLowerCase();
  return normalized === '1' || normalized === 'enabled' || normalized === 'enable' || normalized === 'active';
}

function rate(value) {
  const n = num(value);
  if (!n) return 0;
  return n > 1 ? n / 100 : n;
}

function stockTotal(card = {}) {
  return ['stockFul', 'stockRes', 'stockInb', 'stockInbAir', 'stockPlan']
    .reduce((sum, key) => sum + num(card[key]), 0);
}

function productProfit(card = {}) {
  const net = rate(card.netProfit);
  const busy = rate(card.busyNetProfit);
  const shelf = rate(card.profitRate);
  const sea = rate(card.seaProfitRate);
  return { net, busy, shelf, sea, effective: Math.max(net, shelf, busy) };
}

function flattenRows(highEfficiency = {}) {
  const rows = [];
  for (const [property, config] of Object.entries(ENTITY_BY_PROPERTY)) {
    const propertyRows = highEfficiency.byProperty?.[property]?.rows || [];
    for (const raw of propertyRows) {
      const sku = resolveSku(raw);
      const id = text(raw[config.idField] || raw.id);
      if (!sku || !id) continue;
      rows.push({
        ...raw,
        sku,
        __entityType: config.entityType,
        __idField: config.idField,
        __entityId: id,
        __cardKey: config.cardKey,
        __rowSet: config.rowSet,
        __adProperty: String(property),
        __adPropertyLabel: PROPERTY_CONFIGS[property]?.label || raw.__adPropertyLabel || '',
      });
    }
  }
  return rows;
}

function statsFromRow(row = {}) {
  const metrics = rowMetrics(row);
  const sales = metrics.sales;
  const spend = metrics.spend;
  const clicks = metrics.clicks;
  const impressions = metrics.impressions;
  const orders = metrics.orders;
  const acos = sales > 0 ? spend / sales : num(row.ACOS ?? row.acos);
  return {
    ...metrics,
    acos,
    cpc: num(row.CPC ?? row.cpc),
    ctr: num(row.CTR ?? row.ctr),
    conversionRate: num(row.ConversionRate ?? row.conversionRate),
    impressions,
    clicks,
    orders,
    spend,
    sales,
  };
}

function actionFactorFor({ row, card }) {
  const currentBid = num(row.bid);
  const stats = statsFromRow(row);
  const invDays = num(card.invDays);
  const totalStock = stockTotal(card);
  const profit = productProfit(card);
  const highReturn = Number(card.productLabels?.is_high_return_rate || 0) === 1;
  const term = rowTerm(row);
  const reasons = [];

  if (!currentBid) return { decision: 'hold', reason: 'missing_current_bid', stats, currentBid };
  if (!stateEnabled(row.state) || !stateEnabled(row.campaignState) || !stateEnabled(row.groupState ?? 1)) {
    return { decision: 'hold', reason: 'inactive_parent_or_entity', stats, currentBid };
  }
  if (invDays <= 0 || totalStock <= 0) return { decision: 'hold', reason: 'inventory_not_ready', stats, currentBid };
  if (invDays < 20) return { decision: 'inventory_protect', reason: 'efficient_but_inventory_tight', stats, currentBid };
  if (highReturn && profit.effective < 0.12) return { decision: 'hold', reason: 'high_return_low_profit', stats, currentBid };
  if (profit.net < 0 && profit.busy < 0) return { decision: 'hold', reason: 'negative_net_and_busy_profit', stats, currentBid };
  if (stats.orders <= 0) return { decision: 'diagnose', reason: 'no_order_in_high_pool_row', stats, currentBid };
  if (stats.sales <= 0 || stats.acos <= 0) return { decision: 'diagnose', reason: 'missing_sales_or_acos', stats, currentBid };

  const strongInventory = invDays >= 45 && totalStock >= 40;
  const okInventory = invDays >= 30 && totalStock >= 25;
  const borderInventory = invDays >= 20 && totalStock >= 20;
  const strongProfit = profit.net >= 0.15 && profit.busy >= 0.12;
  const okProfit = profit.effective >= 0.10 && profit.busy >= 0.04;
  const weakProfit = profit.effective < 0.08 || profit.busy <= 0;
  const strongConversion = stats.orders >= 4 && stats.acos <= 0.08 && stats.conversionRate >= 0.08;
  const okConversion = stats.orders >= 2 && stats.acos <= 0.12 && stats.conversionRate >= 0.05;
  const weakButPositive = stats.orders >= 1 && stats.acos <= 0.15;

  if (strongInventory && strongProfit && strongConversion) {
    reasons.push('strong_conversion', 'inventory_room', 'profit_room');
    return { decision: 'strong_bid_up', factor: 1.3, maxStep: 0.08, minStep: 0.03, riskLevel: 'traffic_push', allowLargeBidChange: true, reasons, stats, currentBid, term };
  }
  if (okInventory && okProfit && okConversion) {
    reasons.push('good_conversion', 'inventory_ok', 'profit_ok');
    return { decision: 'standard_bid_up', factor: 1.18, maxStep: 0.05, minStep: 0.02, riskLevel: 'high_efficiency_controlled_bid_up', reasons, stats, currentBid, term };
  }
  if (borderInventory && !weakProfit && weakButPositive) {
    reasons.push('positive_conversion', 'borderline_inventory_or_profit');
    return { decision: 'small_bid_up', factor: 1.1, maxStep: 0.03, minStep: 0.01, riskLevel: 'high_efficiency_small_bid_up', reasons, stats, currentBid, term };
  }
  if (weakProfit && weakButPositive) {
    return { decision: 'diagnose', reason: 'profit_guardrail_blocks_scale', stats, currentBid, term };
  }
  return { decision: 'diagnose', reason: 'conversion_inventory_profit_not_enough_for_bid_up', stats, currentBid, term };
}

function suggestedBid(currentBid, tier) {
  const raw = currentBid * tier.factor;
  let next = roundBid(raw);
  if (next - currentBid > tier.maxStep) next = roundBid(currentBid + tier.maxStep);
  if (next <= currentBid && tier.minStep) next = roundBid(currentBid + tier.minStep);
  return next > currentBid ? next : null;
}

function bidUpGoal(tier = {}) {
  const from = Math.max(0, Math.round(num(tier.stats?.orders)));
  return {
    metric: 'orders',
    from,
    to: Math.max(from + 1, Math.ceil(from * 1.1)),
    deadlineDays: 7,
    hardFloor: Math.max(0, Math.floor(from * 0.7)),
  };
}

function bidUpKillSwitch(goal = {}) {
  return {
    metric: 'orders',
    condition: `orders below ${goal.hardFloor} by day 7 or spend rises without order growth`,
    rollbackIf: `orders below ${goal.hardFloor} by day 7 or spend rises without order growth`,
  };
}

function normalizeMatchType(value) {
  if (value === 1 || value === '1') return 'exact';
  if (value === 2 || value === '2') return 'phrase';
  if (value === 3 || value === '3') return 'broad';
  return text(value);
}

function rowToEntity(row = {}) {
  const stats = statsFromRow(row);
  const common = {
    id: row.__entityId,
    text: rowTerm(row),
    label: rowTerm(row),
    bid: num(row.bid),
    state: row.state,
    campaignState: row.campaignState,
    groupState: row.groupState,
    campaignId: text(row.campaignId),
    adGroupId: text(row.adGroupId),
    accountId: row.accountId,
    siteId: row.siteId || 4,
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    updatedAt: row.updatedAt || '',
    operatedAt: row.operatedAt || '',
    onCooldown: false,
    stats7d: stats,
    stats30d: stats,
  };
  if (row.__entityType === 'keyword') {
    return { ...common, matchType: normalizeMatchType(row.matchType) };
  }
  if (row.__entityType === 'autoTarget') {
    return { ...common, targetType: 'auto', text: row.type || common.text, label: row.type || common.label };
  }
  if (row.__entityType === 'manualTarget') {
    return { ...common, targetType: 'manual', text: row.type || common.text, label: row.type || common.label };
  }
  if (row.__entityType === 'sbKeyword') {
    return { ...common, entityType: 'sbKeyword', matchType: normalizeMatchType(row.matchType), rawProperty: '4', adFormat: row.adFormat || '' };
  }
  if (row.__entityType === 'sbTarget') {
    return { ...common, entityType: 'sbTarget', rawProperty: '6', adFormat: row.adFormat || '', text: row.keywordText || row.type || common.text };
  }
  return common;
}

function enrichSnapshot(snapshot, executableRows) {
  const cloned = JSON.parse(JSON.stringify(snapshot));
  const cardBySku = new Map((cloned.productCards || []).map(card => [text(card.sku).toUpperCase(), card]));
  const rowSets = { kwRows: [], autoRows: [], targetRows: [], sbRows: [] };
  for (const row of executableRows) {
    const rowForState = { ...row, sku: row.sku };
    rowSets[row.__rowSet].push(rowForState);
    const card = cardBySku.get(row.sku);
    if (!card) continue;
    if (!Array.isArray(card.campaigns)) card.campaigns = [];
    let campaign = card.campaigns.find(item => String(item.campaignId || '') === String(row.campaignId || ''));
    if (!campaign) {
      campaign = {
        campaignId: String(row.campaignId || ''),
        name: row.campaignName || '',
        campaignName: row.campaignName || '',
        accountId: row.accountId,
        siteId: row.siteId || 4,
        adGroupId: row.adGroupId,
        state: row.campaignState,
        campaignState: row.campaignState,
        groupState: row.groupState,
        budget: num(row.budget ?? row.dailyBudget),
        placementTop: row.placementTop || '',
        placementPage: row.placementPage || '',
        placementProductPage: row.placementPage || '',
        placementRestOfSearch: row.placementRestOfSearch || '',
        keywords: [],
        autoTargets: [],
        productAds: [],
        sbCampaign: null,
        sponsoredBrands: [],
      };
      card.campaigns.push(campaign);
    }
    if (!campaign.keywords) campaign.keywords = [];
    if (!campaign.autoTargets) campaign.autoTargets = [];
    if (!campaign.sponsoredBrands) campaign.sponsoredBrands = [];
    const entity = rowToEntity(row);
    if (row.__entityType === 'keyword') {
      if (!campaign.keywords.some(item => String(item.id) === String(entity.id))) campaign.keywords.push(entity);
    } else if (row.__entityType === 'autoTarget' || row.__entityType === 'manualTarget') {
      if (!campaign.autoTargets.some(item => String(item.id) === String(entity.id))) campaign.autoTargets.push(entity);
    } else if (row.__entityType === 'sbKeyword' || row.__entityType === 'sbTarget') {
      if (!campaign.sponsoredBrands.some(item => String(item.id) === String(entity.id))) campaign.sponsoredBrands.push(entity);
    }
  }
  cloned.kwRows = rowSets.kwRows;
  cloned.autoRows = rowSets.autoRows;
  cloned.targetRows = rowSets.targetRows;
  cloned.sbRows = rowSets.sbRows;
  cloned.__highEfficiencyBidSchema = {
    generatedAt: new Date().toISOString(),
    injectedRows: executableRows.length,
  };
  return cloned;
}

function buildHighEfficiencyBidSchema({
  highEfficiency,
  snapshot,
  businessDate = DEFAULT_BUSINESS_DATE,
  maxActionsPerSku = 3,
} = {}) {
  const cards = snapshot.productCards || [];
  const cardBySku = new Map(cards.map(card => [text(card.sku).toUpperCase(), card]));
  const rawRows = flattenRows(highEfficiency);
  const rowsBySku = new Map();
  for (const row of rawRows) {
    if (!rowsBySku.has(row.sku)) rowsBySku.set(row.sku, []);
    rowsBySku.get(row.sku).push(row);
  }

  const schema = [];
  const selectedRows = [];
  const review = [];
  const summary = {
    highEfficiencyRows: rawRows.length,
    skuCount: rowsBySku.size,
    actionSkus: 0,
    actionRows: 0,
    decisions: {},
    reviewReasons: {},
  };

  for (const [sku, rows] of rowsBySku.entries()) {
    const card = cardBySku.get(sku);
    if (!card) {
      summary.reviewReasons.product_card_missing = (summary.reviewReasons.product_card_missing || 0) + rows.length;
      review.push({ sku, reason: 'product_card_missing', rows: rows.length });
      continue;
    }
    const candidates = [];
    for (const row of rows) {
      const tier = actionFactorFor({ row, card });
      summary.decisions[tier.decision] = (summary.decisions[tier.decision] || 0) + 1;
      if (!tier.factor) {
        const reason = tier.reason || tier.decision;
        summary.reviewReasons[reason] = (summary.reviewReasons[reason] || 0) + 1;
        review.push({ sku, entityType: row.__entityType, id: row.__entityId, term: rowTerm(row), decision: tier.decision, reason });
        continue;
      }
      const nextBid = suggestedBid(tier.currentBid, tier);
      if (!nextBid) {
        summary.reviewReasons.no_bid_delta = (summary.reviewReasons.no_bid_delta || 0) + 1;
        review.push({ sku, entityType: row.__entityType, id: row.__entityId, term: rowTerm(row), decision: 'hold', reason: 'no_bid_delta' });
        continue;
      }
      candidates.push({ row, tier, nextBid });
    }
    candidates.sort((a, b) =>
      b.tier.stats.orders - a.tier.stats.orders ||
      a.tier.stats.acos - b.tier.stats.acos ||
      b.tier.stats.sales - a.tier.stats.sales
    );
    const chosen = candidates.slice(0, maxActionsPerSku);
    if (!chosen.length) continue;
    selectedRows.push(...chosen.map(item => item.row));
    schema.push({
      sku,
      asin: card.asin || '',
      summary: `High-efficiency bid lift: ${chosen.length} proven row(s), tiered by conversion, inventory, and profit.`,
      actions: chosen.map(({ row, tier, nextBid }) => {
        const goal = bidUpGoal(tier);
        const killSwitch = bidUpKillSwitch(goal);
        return {
          id: row.__entityId,
          entityType: row.__entityType,
          actionType: 'bid',
          currentBid: tier.currentBid,
          suggestedBid: nextBid,
          campaignId: text(row.campaignId),
          adGroupId: text(row.adGroupId),
          campaignName: row.campaignName || '',
          groupName: row.groupName || '',
          text: rowTerm(row),
          reason: `high_efficiency_${tier.decision}: ${tier.reasons.join('+')}; orders7=${tier.stats.orders}; acos7=${tier.stats.acos.toFixed(4)}; invDays=${num(card.invDays)}; netProfit=${productProfit(card).net.toFixed(4)}; busyNetProfit=${productProfit(card).busy.toFixed(4)}.`,
          evidence: [
            `source=/keyword/findAllNew property=${row.__adProperty}`,
            `term=${rowTerm(row) || row.type || ''}`,
            `orders7=${tier.stats.orders}`,
            `sales7=${tier.stats.sales.toFixed(2)}`,
            `spend7=${tier.stats.spend.toFixed(2)}`,
            `acos7=${tier.stats.acos.toFixed(4)}`,
            `conversionRate=${tier.stats.conversionRate.toFixed(4)}`,
            `invDays=${num(card.invDays)}`,
            `stockTotal=${stockTotal(card)}`,
            `netProfit=${productProfit(card).net.toFixed(4)}`,
            `busyNetProfit=${productProfit(card).busy.toFixed(4)}`,
          ],
          confidence: tier.decision === 'strong_bid_up' ? 0.82 : tier.decision === 'standard_bid_up' ? 0.74 : 0.66,
          riskLevel: tier.riskLevel,
          allowLargeBidChange: tier.allowLargeBidChange === true,
          decisionStage: 'ai_approved',
          approvedBy: 'codex',
          actionSource: ['codex'],
          requiresAiDecision: false,
          source: 'codex_high_efficiency_bid_schema',
          expectedEffect: {
            impressions: 'up',
            clicks: 'up_controlled',
            spend: 'up_controlled',
            orders: 'up_or_watch',
            acos: 'hold_or_watch',
          },
          goal,
          killSwitch,
          reviewPlan: {
            checkpoints: ['1d', '3d', '7d'],
            checkAfterDays: [1, 3, 7],
            goal,
            killSwitch,
            rollbackIf: 'spend rises without order growth or ACOS exceeds SKU profit room',
          },
        };
      }),
    });
  }

  summary.actionSkus = schema.length;
  summary.actionRows = schema.reduce((sum, item) => sum + item.actions.length, 0);
  return {
    schema,
    selectedRows,
    review,
    summary,
    businessDate,
  };
}

function main() {
  const highFile = process.argv[2] || path.join(ROOT, 'data', 'tasks', `high_efficiency_rows_${DEFAULT_BUSINESS_DATE}_review.json`);
  const snapshotFile = process.argv[3] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const schemaFile = process.argv[4] || path.join(ROOT, 'data', 'snapshots', `high_efficiency_bid_schema_${DEFAULT_BUSINESS_DATE}.json`);
  const enrichedSnapshotFile = process.argv[5] || path.join(ROOT, 'data', 'snapshots', `high_efficiency_execution_snapshot_${DEFAULT_BUSINESS_DATE}.json`);
  const reviewFile = process.argv[6] || path.join(ROOT, 'data', 'tasks', `high_efficiency_bid_review_${DEFAULT_BUSINESS_DATE}.json`);
  const businessDate = process.argv[7] || DEFAULT_BUSINESS_DATE;

  const highEfficiency = readJson(highFile);
  const snapshot = readJson(snapshotFile);
  const result = buildHighEfficiencyBidSchema({ highEfficiency, snapshot, businessDate });
  const enriched = enrichSnapshot(snapshot, result.selectedRows);
  writeJson(schemaFile, result.schema);
  writeJson(enrichedSnapshotFile, enriched);
  writeJson(reviewFile, {
    generatedAt: new Date().toISOString(),
    highFile: path.resolve(highFile),
    snapshotFile: path.resolve(snapshotFile),
    schemaFile: path.resolve(schemaFile),
    enrichedSnapshotFile: path.resolve(enrichedSnapshotFile),
    businessDate,
    summary: result.summary,
    review: result.review,
  });
  console.log(JSON.stringify({
    schemaFile,
    enrichedSnapshotFile,
    reviewFile,
    ...result.summary,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  actionFactorFor,
  buildHighEfficiencyBidSchema,
  enrichSnapshot,
  flattenRows,
  suggestedBid,
};
