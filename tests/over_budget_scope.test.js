const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  bucketOverBudgetRows,
  classifyOverBudgetLane,
  isOverBudgetRiskLevel,
  actionTargetsOverBudget,
  summarizeOverBudgetCoverage,
  isInSeasonWindow,
  activeSeasonalThemes,
  hasSeasonalSellThroughSignal,
} = require('../src/over_budget_policy');
const {
  buildOverBudgetPlanItems,
  buildAutoPauseActions,
  aggressiveLift,
  controlledLift,
  seasonalLift,
  indexCoreEntitiesByCampaign,
  pickCoreEntity,
  coreBidBump,
  dedupeBudgetItemsBySku,
  applyAccountBudgetCap,
  budgetItemScore,
} = require('../src/over_budget_to_actions');
const {
  updateHistoryFromSnapshot,
  annotateCapSince,
  readHistory,
} = require('../src/over_budget_history');

function makeCard(sku, overrides = {}) {
  return {
    sku,
    asin: `B0${sku}`,
    profitRate: 0.25,
    invDays: 60,
    unitsSold_7d: 10,
    unitsSold_30d: 40,
    fulFillable: 200,
    reserved: 0,
    stockFul: 0,
    stockRes: 0,
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  return {
    sku: 'AAA',
    asin: 'B0AAA',
    campaignId: 'c1',
    campaignName: 'asin_test',
    adGroupId: 'ag1',
    groupName: 'group1',
    adId: 'ad1',
    state: 1,
    campaignState: 1,
    groupState: 1,
    servingStatus: 'AD_STATUS_LIVE',
    servingStatusDetail: '',
    servingStatusTitle: 'ELIGIBLE;',
    __overBudgetSource: 'SP',
    dailyBudget: 10,
    Spend: 8,
    Sales: 50,
    Orders: 3,
    Clicks: 40,
    positionType: 'productAd',
    ...overrides,
  };
}

// Test 1: aggressive lane — strong conversion, healthy profit, plenty of stock
{
  const snapshot = {
    productCards: [makeCard('AAA', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
    ],
  };
  const { buckets, counts } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  assert.strictEqual(buckets.aggressive_budget_expansion.length, 1, `aggressive lane should pick up strong-profit campaign, got counts ${JSON.stringify(counts)}`);
  assert.strictEqual(buckets.aggressive_budget_expansion[0].lane, 'aggressive_budget_expansion');
}

// Test 2: controlled lane — orders + acceptable ACOS but not aggressive-strong
{
  const snapshot = {
    productCards: [makeCard('BBB', { profitRate: 0.16, invDays: 40 })],
    overBudgetRows: [
      makeRow({ sku: 'BBB', asin: 'B0BBB', campaignId: 'c2', Spend: 8, Sales: 60, Orders: 3, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  assert.strictEqual(buckets.controlled_budget_up.length, 1, 'controlled lane should pick up modest-profit converter');
}

// Test 3: lower-layer lane — zero orders with significant spend
{
  const snapshot = {
    productCards: [makeCard('CCC', { profitRate: 0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'CCC', asin: 'B0CCC', campaignId: 'c3', Spend: 20, Sales: 0, Orders: 0, Clicks: 60, dailyBudget: 10 }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  assert.strictEqual(buckets.lower_layer_cost_control.length, 1, 'lower-layer lane should catch no-order spend');
  assert.ok(buckets.lower_layer_cost_control[0].blockers.includes('no_order_spend'));
}

// Test 4: lower-layer lane — negative profit
{
  const snapshot = {
    productCards: [makeCard('DDD', { profitRate: -0.05, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'DDD', asin: 'B0DDD', campaignId: 'c4', Spend: 12, Sales: 60, Orders: 2, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  assert.strictEqual(buckets.lower_layer_cost_control.length, 1, 'lower-layer lane should catch negative profit');
  assert.ok(buckets.lower_layer_cost_control[0].blockers.includes('negative_profit'));
}

// Test 5: review lane — tight inventory blocks budget lift
{
  const snapshot = {
    productCards: [makeCard('EEE', { profitRate: 0.20, invDays: 5, fulFillable: 10 })],
    overBudgetRows: [
      makeRow({ sku: 'EEE', asin: 'B0EEE', campaignId: 'c5', Spend: 8, Sales: 50, Orders: 2, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  assert.strictEqual(buckets.review.length, 1, 'review lane should fire when inventory is tight');
  assert.ok(buckets.review[0].blockers.includes('inventory_tight'));
}

// Test 6: seasonal lane — mother's day window, high stock, healthy ACOS
{
  const snapshot = {
    productCards: [makeCard('FFF', {
      profitRate: 0.15,
      invDays: 80,
      unitsSold_7d: 15,
      unitsSold_30d: 50,
      fulFillable: 400,
    })],
    overBudgetRows: [
      makeRow({
        sku: 'FFF', asin: 'B0FFF', campaignId: 'c6',
        campaignName: 'mom mothers day gift',
        Spend: 10, Sales: 80, Orders: 5, Clicks: 50, dailyBudget: 10,
      }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-05-05') });
  assert.strictEqual(buckets.seasonal_sell_through.length, 1, 'seasonal lane should catch mothers-day capped sell-through');
}

// Test 7: filter — not enabled
{
  const snapshot = {
    productCards: [makeCard('GGG')],
    overBudgetRows: [makeRow({ sku: 'GGG', asin: 'B0GGG', campaignId: 'c7', state: 0 })],
  };
  const { filtered, counts } = bucketOverBudgetRows(snapshot);
  assert.strictEqual(filtered.notEnabled, 1);
  assert.strictEqual(Object.values(counts).reduce((a, b) => a + b, 0), 0);
}

// Test 8: filter — not SP source
{
  const snapshot = {
    productCards: [makeCard('HHH')],
    overBudgetRows: [makeRow({ sku: 'HHH', asin: 'B0HHH', campaignId: 'c8', __overBudgetSource: 'SB' })],
  };
  const { filtered } = bucketOverBudgetRows(snapshot);
  assert.strictEqual(filtered.notSp, 1);
}

// Test 9: filter — cooldown (sku-scoped legacy alias)
{
  const snapshot = {
    productCards: [makeCard('III')],
    overBudgetRows: [makeRow({ sku: 'III', asin: 'B0III', campaignId: 'c9' })],
  };
  const { filtered } = bucketOverBudgetRows(snapshot, { cooldown: new Set(['III']) });
  assert.strictEqual(filtered.onCooldownSku, 1);
}

// Test 9b: cooldownCampaignIds takes precedence over SKU cooldown
{
  const snapshot = {
    productCards: [makeCard('III2')],
    overBudgetRows: [makeRow({ sku: 'III2', asin: 'B0III2', campaignId: 'camp-skip' })],
  };
  const { filtered } = bucketOverBudgetRows(snapshot, {
    cooldownCampaignIds: new Set(['camp-skip']),
  });
  assert.strictEqual(filtered.onCooldownCampaign, 1);
}

// Test 10: filter — SKU not in product cards
{
  const snapshot = {
    productCards: [],
    overBudgetRows: [makeRow({ sku: 'JJJ' })],
  };
  const { filtered } = bucketOverBudgetRows(snapshot);
  assert.strictEqual(filtered.notAllowedSku, 1);
}

// Test 11: aggregation — multiple rows for same campaign
{
  const snapshot = {
    productCards: [makeCard('KKK', { profitRate: 0.30, invDays: 60, fulFillable: 400 })],
    overBudgetRows: [
      makeRow({ sku: 'KKK', asin: 'B0KKK', campaignId: 'cK', adId: 'ad1', Spend: 10, Sales: 60, Orders: 4, Clicks: 40, dailyBudget: 10 }),
      makeRow({ sku: 'KKK', asin: 'B0KKK', campaignId: 'cK', adId: 'ad2', Spend: 12, Sales: 80, Orders: 5, Clicks: 50, dailyBudget: 10 }),
    ],
  };
  const { buckets } = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-06-15') });
  const lanes = ['aggressive_budget_expansion', 'controlled_budget_up'];
  const entry = lanes.flatMap(l => buckets[l]).find(e => e.campaignId === 'cK');
  assert.ok(entry, 'aggregated entry should exist');
  assert.strictEqual(entry.spend, 22);
  assert.strictEqual(entry.orders, 9);
  assert.strictEqual(entry.adCount, 2);
}

// Test 12: classifyOverBudgetLane — direct unit
{
  const result = classifyOverBudgetLane({
    campaign: {
      sku: 'AAA',
      profitRate: 0.30,
      invDays: 60,
      absoluteInventory: 300,
      orders: 12,
      spend: 30,
      sales: 200,
      clicks: 120,
    },
    currentDate: new Date('2026-06-15'),
  });
  assert.strictEqual(result.lane, 'aggressive_budget_expansion');
}

// Test 13: isOverBudgetRiskLevel
assert.ok(isOverBudgetRiskLevel('over_budget_controlled_budget_up'));
assert.ok(isOverBudgetRiskLevel('overbudget_lower_layer_cost_control'));
assert.ok(isOverBudgetRiskLevel('seasonal_overbudget_sell_through_budget_up'));
assert.strictEqual(isOverBudgetRiskLevel('low'), false);
assert.strictEqual(isOverBudgetRiskLevel(''), false);

// Test 14: actionTargetsOverBudget — by riskLevel
assert.ok(actionTargetsOverBudget({ riskLevel: 'over_budget_controlled_budget_up' }, new Set()));
// by actionSource
assert.ok(actionTargetsOverBudget({ actionSource: ['overbudget_seasonal_sellthrough'] }, new Set()));
// by campaignId match
assert.ok(actionTargetsOverBudget({ campaignId: 'c1' }, new Set(['c1'])));
// negative
assert.strictEqual(actionTargetsOverBudget({ riskLevel: 'low', actionSource: ['claude'] }, new Set(['c1'])), false);

// Test 15: summarizeOverBudgetCoverage — warning when missing
{
  const snapshot = {
    productCards: [makeCard('LLL', { profitRate: 0.20, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'LLL', asin: 'B0LLL', campaignId: 'cL', Spend: 12, Sales: 80, Orders: 4, Clicks: 40, dailyBudget: 10 }),
    ],
  };
  const planActions = [{ riskLevel: 'low', actionType: 'bid', actionSource: ['claude'] }];
  const coverage = summarizeOverBudgetCoverage(snapshot, planActions);
  assert.strictEqual(coverage.warning, 'overBudget_action_missing_from_schema', 'should warn when schema misses over_budget');
  assert.strictEqual(coverage.actionableCampaigns, 1);
  assert.strictEqual(coverage.matchedActionCount, 0);
}

// Test 16: summarizeOverBudgetCoverage — no warning when matched
{
  const snapshot = {
    productCards: [makeCard('MMM', { profitRate: 0.20, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'MMM', asin: 'B0MMM', campaignId: 'cM', Spend: 12, Sales: 80, Orders: 4, Clicks: 40, dailyBudget: 10 }),
    ],
  };
  const planActions = [{
    riskLevel: 'over_budget_controlled_budget_up',
    actionType: 'budget',
    campaignId: 'cM',
    actionSource: ['claude'],
  }];
  const coverage = summarizeOverBudgetCoverage(snapshot, planActions);
  assert.strictEqual(coverage.warning, '');
  assert.strictEqual(coverage.matchedActionCount, 1);
  assert.strictEqual(coverage.matchedCampaignCount, 1);
}

// Test 17: summarizeOverBudgetCoverage — no warning when no over-budget rows
{
  const snapshot = { productCards: [], overBudgetRows: [] };
  const coverage = summarizeOverBudgetCoverage(snapshot, []);
  assert.strictEqual(coverage.warning, '');
  assert.strictEqual(coverage.snapshotRows, 0);
}

// Test 18: summarizeOverBudgetCoverage — no warning when only review lane (nothing actionable)
{
  const snapshot = {
    productCards: [makeCard('NNN', { profitRate: 0.20, invDays: 3, fulFillable: 5 })],
    overBudgetRows: [
      makeRow({ sku: 'NNN', asin: 'B0NNN', campaignId: 'cN', Spend: 10, Sales: 50, Orders: 2, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const coverage = summarizeOverBudgetCoverage(snapshot, []);
  assert.strictEqual(coverage.actionableCampaigns, 0);
  assert.strictEqual(coverage.warning, '', 'no warning when only review-lane entries exist');
}

// Test 19: buildOverBudgetPlanItems — wires lanes to action shapes with approval block
{
  const snapshot = {
    productCards: [
      makeCard('PPP', { profitRate: 0.30, invDays: 60, fulFillable: 300 }),
      makeCard('QQQ', { profitRate: 0.16, invDays: 40 }),
      makeCard('RRR', { profitRate: 0.20, invDays: 60 }),
    ],
    overBudgetRows: [
      makeRow({ sku: 'PPP', asin: 'B0PPP', campaignId: 'cP', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
      makeRow({ sku: 'QQQ', asin: 'B0QQQ', campaignId: 'cQ', Spend: 8, Sales: 60, Orders: 3, Clicks: 30, dailyBudget: 10 }),
      makeRow({ sku: 'RRR', asin: 'B0RRR', campaignId: 'cR', Spend: 20, Sales: 0, Orders: 0, Clicks: 60, dailyBudget: 10 }),
    ],
  };
  const { items, counts } = buildOverBudgetPlanItems(snapshot, { actor: 'claude' });
  assert.ok(counts.aggressive >= 1, 'should generate at least one aggressive item');
  assert.ok(counts.controlled >= 1, 'should generate at least one controlled item');
  // RRR is now auto-paused (Orders=0, Clicks=60, Spend=20, invDays=60 -> safe pause)
  assert.ok(counts.autoPause + counts.lowerLayer >= 1, 'should cover lower-layer signal via auto-pause or review');
  for (const item of items) {
    for (const action of item.actions) {
      assert.strictEqual(action.approvedBy, 'claude');
      assert.strictEqual(action.decisionStage, 'ai_approved');
      assert.deepStrictEqual(action.actionSource, ['claude']);
      assert.strictEqual(action.requiresAiDecision, false);
      assert.strictEqual(action.canAutoExecute, true);
      assert.ok(Array.isArray(action.evidence) && action.evidence.length >= 3);
      if (action.actionType === 'budget') {
        assert.ok(action.suggestedBudget > action.currentBudget, 'budget lift must be positive');
      }
    }
  }
}

// Test 20: buildOverBudgetPlanItems — excludes campaigns already in schema
{
  const snapshot = {
    productCards: [makeCard('SSS', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'SSS', asin: 'B0SSS', campaignId: 'cS', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
    ],
  };
  const before = buildOverBudgetPlanItems(snapshot, { actor: 'claude' });
  assert.ok(before.counts.total >= 1);
  const after = buildOverBudgetPlanItems(snapshot, { actor: 'claude', excludeCampaignIds: ['cS'] });
  assert.strictEqual(after.counts.total, 0, 'excluded campaign should not appear in items');
}

// Test 21: aggressiveLift hits 30-80% band for mid-large budgets
{
  // $10 → ~+80% ; $20 → ~+60% ; $40 → ~+50% ; $80 → ~+38% ; $150 → ~+33%
  const cases = [[10, 0.50, 0.85], [20, 0.40, 0.65], [40, 0.30, 0.60], [80, 0.30, 0.45], [150, 0.25, 0.45]];
  for (const [b, lo, hi] of cases) {
    const lifted = aggressiveLift(b);
    const pct = (lifted - b) / b;
    assert.ok(pct >= lo && pct <= hi, `aggressiveLift(${b}) = ${lifted} (${(pct * 100).toFixed(0)}%) outside ${lo * 100}-${hi * 100}%`);
  }
}

// Test 22: controlledLift stays in 15-25% band for mid-large budgets
{
  const cases = [[10, 0.20, 0.30], [20, 0.20, 0.30], [40, 0.15, 0.30], [80, 0.15, 0.25], [150, 0.10, 0.25]];
  for (const [b, lo, hi] of cases) {
    const lifted = controlledLift(b);
    const pct = (lifted - b) / b;
    assert.ok(pct >= lo && pct <= hi, `controlledLift(${b}) = ${lifted} (${(pct * 100).toFixed(0)}%) outside ${lo * 100}-${hi * 100}%`);
  }
}

// Test 23: seasonalLift hits 30-80% band for mid budgets
{
  const cases = [[10, 0.45, 0.60], [20, 0.45, 0.60], [40, 0.30, 0.45], [80, 0.25, 0.45]];
  for (const [b, lo, hi] of cases) {
    const lifted = seasonalLift(b);
    const pct = (lifted - b) / b;
    assert.ok(pct >= lo && pct <= hi, `seasonalLift(${b}) = ${lifted} (${(pct * 100).toFixed(0)}%) outside ${lo * 100}-${hi * 100}%`);
  }
}

// Test 24: pickCoreEntity prefers order-bearing entities
{
  const picked = pickCoreEntity([
    { id: '1', entityType: 'keyword', text: 'a', bid: 0.50, orders7: 0, clicks7: 100, spend7: 30, sales7: 0 },
    { id: '2', entityType: 'keyword', text: 'b', bid: 0.40, orders7: 5, clicks7: 50, spend7: 20, sales7: 200 },
    { id: '3', entityType: 'keyword', text: 'c', bid: 0.45, orders7: 8, clicks7: 80, spend7: 30, sales7: 400 },
  ]);
  assert.strictEqual(picked.id, '3', 'should pick highest-order entity');
}

// Test 25: pickCoreEntity falls back to clicks when no orders
{
  const picked = pickCoreEntity([
    { id: '1', entityType: 'keyword', text: 'a', bid: 0.50, orders7: 0, clicks7: 100, spend7: 30, sales7: 0 },
    { id: '2', entityType: 'keyword', text: 'b', bid: 0.40, orders7: 0, clicks7: 50, spend7: 20, sales7: 0 },
  ]);
  assert.strictEqual(picked.id, '1', 'should fall back to most-clicks entity');
}

// Test 26: pickCoreEntity rejects out-of-band bids
{
  const picked = pickCoreEntity([
    { id: '1', entityType: 'keyword', text: 'a', bid: 0.05, orders7: 10, clicks7: 100, spend7: 30, sales7: 500 },
    { id: '2', entityType: 'keyword', text: 'b', bid: 3.50, orders7: 5, clicks7: 50, spend7: 20, sales7: 200 },
    { id: '3', entityType: 'keyword', text: 'c', bid: 0.40, orders7: 2, clicks7: 30, spend7: 10, sales7: 60 },
  ]);
  assert.strictEqual(picked.id, '3', 'should skip bids outside [0.10, 2.50]');
}

// Test 27: coreBidBump step size scales with bid level
assert.strictEqual(coreBidBump(0.40), 0.43);
assert.strictEqual(coreBidBump(0.70), 0.75);
assert.strictEqual(coreBidBump(1.50), 1.57);

// Test 28: indexCoreEntitiesByCampaign collects kw/auto/manual rows
{
  const snap = {
    kwRows: [
      { campaignId: 'c1', keywordId: 'kw1', bid: '0.40', orders7: 5, clicks7: 50, Spend: '20', Sales: '200', state: 1, campaignState: 1, groupState: 1 },
      { campaignId: 'c1', keywordId: 'kw2', bid: '0.30', orders7: 0, clicks7: 10, Spend: '5', Sales: '0', state: 0, campaignState: 1, groupState: 1 },
    ],
    autoRows: [
      { campaignId: 'c1', targetId: 't1', bid: '0.35', orders7: 2, clicks7: 25, Spend: '8', Sales: '90', state: 1, campaignState: 1, groupState: 1 },
    ],
    targetRows: [
      { campaignId: 'c2', targetId: 't2', bid: '0.50', orders7: 1, clicks7: 10, Spend: '4', Sales: '40', state: 1, campaignState: 1, groupState: 1 },
    ],
  };
  const index = indexCoreEntitiesByCampaign(snap);
  assert.strictEqual(index.get('c1').length, 2, 'c1 should have 2 enabled entities (disabled kw filtered)');
  assert.strictEqual(index.get('c2').length, 1);
}

// Test 29: aggressive plan items pair core bid bump when entity exists
{
  const snapshot = {
    productCards: [makeCard('CORE', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'CORE', asin: 'B0CORE', campaignId: 'campX', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
    ],
    kwRows: [
      { campaignId: 'campX', keywordId: 'kwTop', bid: '0.50', orders7: 8, clicks7: 80, Spend: '30', Sales: '300', state: 1, campaignState: 1, groupState: 1, keywordText: 'top term', matchType: 'exact' },
    ],
  };
  const result = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-06-15') });
  const aggressiveItem = result.items.find(item => (item.actions[0] || {}).riskLevel === 'over_budget_aggressive_budget_expansion');
  assert.ok(aggressiveItem, 'should produce aggressive item');
  assert.strictEqual(aggressiveItem.actions.length, 2, 'aggressive should carry budget + core bid actions');
  const bidAction = aggressiveItem.actions[1];
  assert.strictEqual(bidAction.actionType, 'bid');
  assert.strictEqual(bidAction.id, 'kwTop');
  assert.ok(bidAction.suggestedBid > bidAction.currentBid);
  assert.strictEqual(bidAction.riskLevel, 'over_budget_aggressive_core_bid_up');
  assert.ok(result.counts.coreBidPaired >= 1);
}

// Test 30: aggressive without paired bid still passes when no eligible entity
{
  const snapshot = {
    productCards: [makeCard('NCRE', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'NCRE', asin: 'B0NCRE', campaignId: 'campY', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
    ],
    kwRows: [],
    autoRows: [],
    targetRows: [],
  };
  const result = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-06-15') });
  const aggressiveItem = result.items.find(item => (item.actions[0] || {}).riskLevel === 'over_budget_aggressive_budget_expansion');
  assert.ok(aggressiveItem);
  assert.strictEqual(aggressiveItem.actions.length, 1, 'should not invent paired bid when no eligible entity');
}

// Test 31: pairCoreBidUp=false disables pairing
{
  const snapshot = {
    productCards: [makeCard('OPT', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [
      makeRow({ sku: 'OPT', asin: 'B0OPT', campaignId: 'campZ', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
    ],
    kwRows: [
      { campaignId: 'campZ', keywordId: 'kw', bid: '0.50', orders7: 8, clicks7: 80, Spend: '30', Sales: '300', state: 1, campaignState: 1, groupState: 1 },
    ],
  };
  const result = buildOverBudgetPlanItems(snapshot, { actor: 'claude', pairCoreBidUp: false, currentDate: new Date('2026-06-15') });
  const item = result.items.find(i => (i.actions[0] || {}).riskLevel === 'over_budget_aggressive_budget_expansion');
  assert.strictEqual(item.actions.length, 1);
}

// Test 32: buildAutoPauseActions — happy path
{
  const snapshot = {
    productCards: [makeCard('PAU1', { profitRate: 0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'PAU1', asin: 'B0PAU1', campaignId: 'cP', adId: 'adP1', Spend: 10, Sales: 0, Orders: 0, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { items, stats } = buildAutoPauseActions(snapshot, { actor: 'claude' });
  assert.strictEqual(items.length, 1, 'should auto-pause clean candidate');
  const action = items[0].actions[0];
  assert.strictEqual(action.actionType, 'pause');
  assert.strictEqual(action.entityType, 'productAd');
  assert.strictEqual(action.id, 'adP1');
  assert.strictEqual(action.riskLevel, 'over_budget_no_order_pause');
  assert.strictEqual(action.approvedBy, 'claude');
  assert.strictEqual(stats.kept, 1);
}

// Test 33: buildAutoPauseActions — tight inventory protects from pause
{
  const snapshot = {
    productCards: [makeCard('PAU2', { profitRate: 0.20, invDays: 7 })],
    overBudgetRows: [
      makeRow({ sku: 'PAU2', asin: 'B0PAU2', campaignId: 'cP2', adId: 'adP2', Spend: 10, Sales: 0, Orders: 0, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { items, stats } = buildAutoPauseActions(snapshot, { actor: 'claude' });
  assert.strictEqual(items.length, 0, 'tight inventory should not be auto-paused');
  assert.strictEqual(stats.invTooTight, 1);
}

// Test 34: buildAutoPauseActions — clearance SKU protected (profit very negative)
{
  const snapshot = {
    productCards: [makeCard('PAU3', { profitRate: -0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'PAU3', asin: 'B0PAU3', campaignId: 'cP3', adId: 'adP3', Spend: 10, Sales: 0, Orders: 0, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { items, stats } = buildAutoPauseActions(snapshot, { actor: 'claude' });
  assert.strictEqual(items.length, 0, 'clearance SKU should not be auto-paused');
  assert.strictEqual(stats.clearanceProtect, 1);
}

// Test 35: buildAutoPauseActions — insufficient signal (clicks < 20)
{
  const snapshot = {
    productCards: [makeCard('PAU4', { profitRate: 0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'PAU4', asin: 'B0PAU4', campaignId: 'cP4', adId: 'adP4', Spend: 6, Sales: 0, Orders: 0, Clicks: 15, dailyBudget: 10 }),
    ],
  };
  const { items, stats } = buildAutoPauseActions(snapshot, { actor: 'claude' });
  assert.strictEqual(items.length, 0);
  assert.strictEqual(stats.insufficientSignal, 1);
}

// Test 36: buildAutoPauseActions — cooldown adId blocks pause
{
  const snapshot = {
    productCards: [makeCard('PAU5', { profitRate: 0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'PAU5', asin: 'B0PAU5', campaignId: 'cP5', adId: 'adP5', Spend: 10, Sales: 0, Orders: 0, Clicks: 30, dailyBudget: 10 }),
    ],
  };
  const { items, stats } = buildAutoPauseActions(snapshot, { actor: 'claude', cooldownAdIds: new Set(['adP5']) });
  assert.strictEqual(items.length, 0);
  assert.strictEqual(stats.onCooldownAd, 1);
}

// Test 37: buildOverBudgetPlanItems integrates auto-pause and removes overlapping lower-layer review
{
  const snapshot = {
    productCards: [makeCard('INT1', { profitRate: 0.20, invDays: 60 })],
    overBudgetRows: [
      makeRow({ sku: 'INT1', asin: 'B0INT1', campaignId: 'cI1', adId: 'adI1', Spend: 20, Sales: 0, Orders: 0, Clicks: 60, dailyBudget: 10 }),
    ],
  };
  const result = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-06-15') });
  assert.ok(result.counts.autoPause >= 1, 'should produce auto-pause');
  assert.strictEqual(result.counts.lowerLayer, 0, 'lower-layer review removed when auto-pause covers same campaign');
  const pauseItem = result.items.find(i => i.actions[0].actionType === 'pause');
  assert.ok(pauseItem);
}

// Test 38: dedupeBudgetItemsBySku — same SKU two budget lifts → keep top score, demote rest
{
  const items = [
    {
      sku: 'DUP1', asin: 'B0DUP1',
      summary: 'lift A',
      actions: [{
        actionType: 'budget', entityType: 'campaign',
        id: 'cA', campaignId: 'cA', currentBudget: 10, suggestedBudget: 18,
        evidence: ['campaign spend=20.00 sales=120.00 orders=4 clicks=40'],
      }],
    },
    {
      sku: 'DUP1', asin: 'B0DUP1',
      summary: 'lift B',
      actions: [{
        actionType: 'budget', entityType: 'campaign',
        id: 'cB', campaignId: 'cB', currentBudget: 10, suggestedBudget: 16,
        evidence: ['campaign spend=8.00 sales=40.00 orders=2 clicks=20'],
      }],
    },
  ];
  const { items: out, demotedCount } = dedupeBudgetItemsBySku(items, 'claude');
  assert.strictEqual(demotedCount, 1, 'one campaign demoted');
  const winners = out.filter(x => x.actions[0].actionType === 'budget');
  assert.strictEqual(winners.length, 1);
  assert.strictEqual(winners[0].actions[0].campaignId, 'cA', 'higher-score campaign wins');
  const reviews = out.filter(x => x.actions[0].actionType === 'review');
  assert.strictEqual(reviews.length, 1);
  assert.ok(reviews[0].actions[0].evidence.some(e => e.includes('sku_has_multi_overbudget')));
}

// Test 39: dedupeBudgetItemsBySku — single SKU lift untouched
{
  const items = [{
    sku: 'SOLO', asin: 'B0SOLO',
    actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cS', campaignId: 'cS', currentBudget: 10, suggestedBudget: 18, evidence: [] }],
  }];
  const { items: out, demotedCount } = dedupeBudgetItemsBySku(items, 'claude');
  assert.strictEqual(demotedCount, 0);
  assert.strictEqual(out.length, 1);
}

// Test 40: dedupeBySku=false bypasses dedupe
{
  const snapshot = {
    productCards: [
      { sku: 'M1', asin: 'B0M1', profitRate: 0.30, invDays: 60, fulFillable: 300, unitsSold_7d: 10, unitsSold_30d: 40 },
    ],
    overBudgetRows: [
      makeRow({ sku: 'M1', asin: 'B0M1', campaignId: 'cM1A', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
      makeRow({ sku: 'M1', asin: 'B0M1', campaignId: 'cM1B', Spend: 25, Sales: 180, Orders: 10, Clicks: 110, dailyBudget: 10 }),
    ],
  };
  const dedup = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-06-15'), maxDailyBudgetIncreaseUsd: 0 });
  const noDedup = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-06-15'), maxDailyBudgetIncreaseUsd: 0, dedupeBySku: false });
  // dedup should demote one of the two same-SKU lifts
  const dedupBudgets = dedup.items.filter(i => i.actions[0].actionType === 'budget' && i.actions[0].suggestedBudget > i.actions[0].currentBudget);
  const noDedupBudgets = noDedup.items.filter(i => i.actions[0].actionType === 'budget' && i.actions[0].suggestedBudget > i.actions[0].currentBudget);
  assert.strictEqual(dedupBudgets.length, 1);
  assert.strictEqual(noDedupBudgets.length, 2);
}

// Test 41: applyAccountBudgetCap — under cap → unchanged
{
  const items = [
    { sku: 'A', actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cA', campaignId: 'cA', currentBudget: 10, suggestedBudget: 16, evidence: [] }] },
    { sku: 'B', actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cB', campaignId: 'cB', currentBudget: 20, suggestedBudget: 30, evidence: [] }] },
  ];
  const result = applyAccountBudgetCap(items, { maxDailyBudgetIncreaseUsd: 100 });
  assert.strictEqual(result.capExceededDemoted, 0);
  assert.strictEqual(result.totalLiftRequested, 16);
  assert.strictEqual(result.totalLiftApproved, 16);
}

// Test 42: applyAccountBudgetCap — exceed cap → highest-score wins, lowest demoted
{
  const items = [
    { sku: 'X', actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cX', campaignId: 'cX', currentBudget: 10, suggestedBudget: 18, evidence: ['campaign spend=50.00 sales=300.00 orders=15 clicks=150'] }] },
    { sku: 'Y', actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cY', campaignId: 'cY', currentBudget: 10, suggestedBudget: 16, evidence: ['campaign spend=10.00 sales=50.00 orders=2 clicks=30'] }] },
  ];
  const result = applyAccountBudgetCap(items, { maxDailyBudgetIncreaseUsd: 8, actor: 'claude' });
  assert.strictEqual(result.capExceededDemoted, 1);
  const lifts = result.items.filter(i => i.actions[0].actionType === 'budget' && i.actions[0].suggestedBudget > i.actions[0].currentBudget);
  assert.strictEqual(lifts.length, 1);
  assert.strictEqual(lifts[0].actions[0].campaignId, 'cX', 'higher-score lift survives cap');
  const reviews = result.items.filter(i => i.actions[0].actionType === 'review');
  assert.strictEqual(reviews.length, 1);
  assert.ok(reviews[0].actions[0].evidence.some(e => e.includes('account_daily_budget_cap')));
}

// Test 43: applyAccountBudgetCap — cap=0 means disabled (no demotion)
{
  const items = [
    { sku: 'A', actions: [{ actionType: 'budget', entityType: 'campaign', id: 'cA', campaignId: 'cA', currentBudget: 10, suggestedBudget: 16, evidence: [] }] },
  ];
  const result = applyAccountBudgetCap(items, { maxDailyBudgetIncreaseUsd: 0 });
  assert.strictEqual(result.capExceededDemoted, 0);
  assert.strictEqual(result.cap, 0);
}

// Test 44: budgetItemScore parses evidence
{
  const score = budgetItemScore({ actions: [{ evidence: ['campaign spend=30.00 sales=200.00 orders=12 clicks=120'] }] });
  // 30 + 200*0.5 + 12*5 = 190
  assert.ok(score === 190, `expected 190, got ${score}`);
}

// Test 45: isInSeasonWindow handles fathers_day window (5/15-6/25)
assert.strictEqual(isInSeasonWindow('fathers_day', new Date('2026-06-10')), true);
assert.strictEqual(isInSeasonWindow('fathers_day', new Date('2026-07-15')), false);
assert.strictEqual(isInSeasonWindow('fathers_day', new Date('2026-04-10')), false);

// Test 46: isInSeasonWindow handles year-wrapping new_year (12/20-1/15)
assert.strictEqual(isInSeasonWindow('new_year', new Date('2026-12-25')), true);
assert.strictEqual(isInSeasonWindow('new_year', new Date('2026-01-05')), true);
assert.strictEqual(isInSeasonWindow('new_year', new Date('2026-06-15')), false);

// Test 47: isInSeasonWindow handles halloween (9/1-11/5)
assert.strictEqual(isInSeasonWindow('halloween', new Date('2026-10-15')), true);
assert.strictEqual(isInSeasonWindow('halloween', new Date('2026-11-30')), false);

// Test 48: activeSeasonalThemes returns currently-active themes
{
  const active = activeSeasonalThemes(new Date('2026-06-10'));
  assert.ok(active.includes('fathers_day'));
  assert.ok(active.includes('graduation'));
  // mothers_day window ended 5/20
  assert.ok(!active.includes('mothers_day'));
}

// Test 49: hasSeasonalSellThroughSignal recognizes father's day campaign in window
{
  const ok = hasSeasonalSellThroughSignal(
    { sku: 'DAD1', asin: 'B0DAD1' },
    { campaignName: "fathers day mug for dad", groupName: 'fathers day', text: '' },
    new Date('2026-06-10'),
  );
  assert.strictEqual(ok, true);
}

// Test 50: hasSeasonalSellThroughSignal rejects out-of-window father's day match
{
  const ok = hasSeasonalSellThroughSignal(
    { sku: 'DAD1', asin: 'B0DAD1' },
    { campaignName: "fathers day mug for dad", groupName: 'fathers day', text: '' },
    new Date('2026-08-15'),
  );
  assert.strictEqual(ok, false, 'no father day signal outside window');
}

// Test 51: cap_since history — first observation
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'over_budget_history_'));
  const file = path.join(tmpDir, 'h.json');
  const snapshot = {
    exportedAt: '2026-05-12T01:00:00Z',
    overBudgetRows: [makeRow({ sku: 'CS1', asin: 'B0CS1', campaignId: 'cFresh' })],
  };
  const history = updateHistoryFromSnapshot(snapshot, { file });
  assert.strictEqual(Object.keys(history.campaigns).length, 1);
  assert.strictEqual(history.campaigns.cFresh.capSince, '2026-05-12T01:00:00Z');
  assert.strictEqual(history.campaigns.cFresh.firstSeenAt, '2026-05-12T01:00:00Z');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 52: cap_since history — second observation within stale window keeps capSince
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'over_budget_history_'));
  const file = path.join(tmpDir, 'h.json');
  updateHistoryFromSnapshot({
    exportedAt: '2026-05-11T01:00:00Z',
    overBudgetRows: [makeRow({ sku: 'CS2', asin: 'B0CS2', campaignId: 'cContinue' })],
  }, { file });
  const history2 = updateHistoryFromSnapshot({
    exportedAt: '2026-05-12T01:00:00Z',
    overBudgetRows: [makeRow({ sku: 'CS2', asin: 'B0CS2', campaignId: 'cContinue' })],
  }, { file });
  assert.strictEqual(history2.campaigns.cContinue.capSince, '2026-05-11T01:00:00Z', 'capSince preserved across continuous observations');
  assert.strictEqual(history2.campaigns.cContinue.lastSeenAt, '2026-05-12T01:00:00Z');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 53: cap_since history — gap longer than staleHours resets capSince
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'over_budget_history_'));
  const file = path.join(tmpDir, 'h.json');
  updateHistoryFromSnapshot({
    exportedAt: '2026-05-09T01:00:00Z',
    overBudgetRows: [makeRow({ sku: 'CS3', asin: 'B0CS3', campaignId: 'cReset' })],
  }, { file, staleHours: 36 });
  // 3 days later - way past staleHours - should reset cap_since
  const history2 = updateHistoryFromSnapshot({
    exportedAt: '2026-05-12T01:00:00Z',
    overBudgetRows: [makeRow({ sku: 'CS3', asin: 'B0CS3', campaignId: 'cReset' })],
  }, { file, staleHours: 36 });
  assert.strictEqual(history2.campaigns.cReset.capSince, '2026-05-12T01:00:00Z', 'gap should reset capSince');
  assert.strictEqual(history2.campaigns.cReset.firstSeenAt, '2026-05-09T01:00:00Z', 'firstSeenAt unchanged');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 54: annotateCapSince yields cappedHours
{
  const history = {
    campaigns: {
      cA: { capSince: '2026-05-10T01:00:00Z', lastSeenAt: '2026-05-12T01:00:00Z', firstSeenAt: '2026-05-10T01:00:00Z' },
    },
  };
  const ann = annotateCapSince({}, { history, referenceTime: '2026-05-12T01:00:00Z' });
  assert.strictEqual(ann.get('cA').cappedHours, 48);
  assert.strictEqual(ann.get('cA').capSince, '2026-05-10T01:00:00Z');
}

// Test 55: bucketOverBudgetRows accepts capSinceAnnotations
{
  const snapshot = {
    productCards: [makeCard('CSAA', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [makeRow({ sku: 'CSAA', asin: 'B0CSAA', campaignId: 'cAnn', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 })],
  };
  const annotations = new Map([['cAnn', { capSince: '2026-05-10T01:00:00Z', cappedHours: 48 }]]);
  const result = bucketOverBudgetRows(snapshot, { currentDate: new Date('2026-05-12T01:00:00Z'), capSinceAnnotations: annotations });
  const e = result.buckets.aggressive_budget_expansion[0];
  assert.strictEqual(e.cappedHours, 48);
  assert.strictEqual(e.capSince, '2026-05-10T01:00:00Z');
}

// Test 56: cappedHours flows into evidence string
{
  const snapshot = {
    productCards: [makeCard('EVID', { profitRate: 0.30, invDays: 60, fulFillable: 300 })],
    overBudgetRows: [makeRow({ sku: 'EVID', asin: 'B0EVID', campaignId: 'cEv', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 })],
  };
  const annotations = new Map([['cEv', { capSince: '2026-05-10T01:00:00Z', cappedHours: 48 }]]);
  const { items } = buildOverBudgetPlanItems(snapshot, { actor: 'claude', currentDate: new Date('2026-05-12T01:00:00Z'), capSinceAnnotations: annotations });
  const aggressive = items.find(i => (i.actions[0] || {}).riskLevel === 'over_budget_aggressive_budget_expansion');
  assert.ok(aggressive);
  assert.ok(aggressive.actions[0].evidence.some(e => e.includes('cappedHours=48')));
}

// Test 57: e2e — ensure full pipeline works with all features on, no regression
{
  const snapshot = {
    productCards: [
      makeCard('EZ1', { profitRate: 0.30, invDays: 60, fulFillable: 300 }),
      makeCard('EZ2', { profitRate: 0.16, invDays: 40 }),
      makeCard('EZ3', { profitRate: 0.20, invDays: 60 }),
    ],
    overBudgetRows: [
      makeRow({ sku: 'EZ1', asin: 'B0EZ1', campaignId: 'cE1', Spend: 30, Sales: 200, Orders: 12, Clicks: 120, dailyBudget: 10 }),
      makeRow({ sku: 'EZ2', asin: 'B0EZ2', campaignId: 'cE2', Spend: 8, Sales: 60, Orders: 3, Clicks: 30, dailyBudget: 10 }),
      makeRow({ sku: 'EZ3', asin: 'B0EZ3', campaignId: 'cE3', adId: 'adE3', Spend: 20, Sales: 0, Orders: 0, Clicks: 60, dailyBudget: 10 }),
    ],
    kwRows: [
      { campaignId: 'cE1', keywordId: 'kwE1', bid: '0.50', orders7: 8, clicks7: 80, Spend: '30', Sales: '300', state: 1, campaignState: 1, groupState: 1 },
    ],
  };
  const result = buildOverBudgetPlanItems(snapshot, {
    actor: 'claude',
    currentDate: new Date('2026-06-15'),
    maxDailyBudgetIncreaseUsd: 1000,
  });
  // expect: aggressive (EZ1 + paired core bid), controlled (EZ2), auto-pause (EZ3)
  const types = result.items.map(i => `${i.actions[0].actionType}:${i.actions[0].entityType}`);
  assert.ok(types.includes('budget:campaign'), 'should have budget lift');
  assert.ok(types.includes('pause:productAd'), 'should have auto-pause');
  // aggressive should pair core bid
  const agg = result.items.find(i => (i.actions[0] || {}).riskLevel === 'over_budget_aggressive_budget_expansion');
  assert.ok(agg && agg.actions.length === 2);
}

console.log('over_budget_scope tests passed');
