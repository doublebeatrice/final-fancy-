const assert = require('assert');
const {
  assessOverBudgetAdjustmentObjective,
  assessSeasonalSellThroughOpportunity,
  buildSkuStateMap,
  computeSeasonalBudgetLift,
  computeSeasonalCloseMatchBid,
  getSkuState,
  hasListingPayload,
  isEnabledState,
  projectSkuState,
} = require('../src/over_budget_policy');

assert.strictEqual(isEnabledState(1), true);
assert.strictEqual(isEnabledState(2), true);
assert.strictEqual(isEnabledState('ENABLED'), true);
assert.strictEqual(isEnabledState('paused'), false);
assert.strictEqual(isEnabledState(0), false);

const projected = projectSkuState({
  sku: 'abc123',
  asin: 'B0TEST',
  profitRate: 0.23,
  invDays: 45,
  unitsSold_7d: 8,
  unitsSold_30d: 20,
  listing: { title: 'Should not be used by over-budget policy' },
  productProfile: { productType: 'gift' },
  campaigns: [{ campaignId: 'c1', keywords: [{ id: 'kw1', state: 2 }] }],
});

assert.strictEqual(projected.sku, 'abc123');
assert.strictEqual(projected.profitRate, 0.23);
assert.strictEqual(projected.invDays, 45);
assert.deepStrictEqual(projected.campaigns, [{ campaignId: 'c1', keywords: [{ id: 'kw1', state: 2 }] }]);
assert.strictEqual(hasListingPayload(projected), false);

const map = buildSkuStateMap({
  invMap: {
    ABC123: {
      sku: 'ABC123',
      asin: 'B0INV',
      profitRate: 0.31,
      invDays: 90,
      unitsSold_7d: 7,
      unitsSold_30d: 30,
    },
  },
  productCards: [
    {
      sku: 'abc123',
      profitRate: 0.2,
      invDays: 10,
      listing: { title: 'listing should stay out' },
      campaigns: [{ campaignId: 'c2' }],
    },
  ],
});

const state = getSkuState(map, 'abc123');
assert.strictEqual(state.asin, 'B0INV');
assert.strictEqual(state.profitRate, 0.31);
assert.strictEqual(state.invDays, 90);
assert.deepStrictEqual(state.campaigns, [{ campaignId: 'c2' }]);
assert.strictEqual(hasListingPayload(state), false);

const seasonalDecision = assessSeasonalSellThroughOpportunity({
  card: {
    sku: 'AE3311',
    profitRate: 0.0827,
    invDays: 72,
    fulFillable: 81,
    unitsSold_7d: 38,
    unitsSold_30d: 38,
  },
  group: {
    campaignName: 'god mother gifts for women-ae3311-system-a',
    groupName: 'god mother gifts for women-ae3311-system-a',
    orders: 6,
    sales: 86.94,
    spend: 16.73,
    clicks: 31,
    currentBudget: 6,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(seasonalDecision.shouldLift, true);
assert.strictEqual(seasonalDecision.reasonCode, 'seasonal_sell_through_profit_max');
assert.strictEqual(computeSeasonalBudgetLift(6), 8);
assert.strictEqual(computeSeasonalBudgetLift(3), 4.5);
assert.strictEqual(computeSeasonalCloseMatchBid(0.55), 0.6);

const overBudgetObjective = assessOverBudgetAdjustmentObjective({
  card: {
    sku: 'AE3311',
    profitRate: 0.0827,
    invDays: 72,
    fulFillable: 81,
    unitsSold_7d: 38,
    unitsSold_30d: 38,
  },
  group: {
    campaignName: 'god mother gifts for women-ae3311-system-a',
    groupName: 'god mother gifts for women-ae3311-system-a',
    orders: 6,
    sales: 86.94,
    spend: 16.73,
    clicks: 31,
    currentBudget: 6,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(overBudgetObjective.objective, 'profit_max_adjustment');
assert.strictEqual(overBudgetObjective.mustClearOverBudget, false);
assert.strictEqual(overBudgetObjective.primaryAction, 'controlled_budget_and_relevant_bid_up');

const lowProfitWasteObjective = assessOverBudgetAdjustmentObjective({
  card: {
    sku: 'LOSS01',
    profitRate: -0.04,
    invDays: 42,
    fulFillable: 40,
    unitsSold_7d: 2,
    unitsSold_30d: 18,
  },
  group: {
    campaignName: 'generic loss01 system',
    groupName: 'generic loss01 system',
    orders: 0,
    sales: 0,
    spend: 14,
    clicks: 31,
    currentBudget: 8,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(lowProfitWasteObjective.objective, 'profit_max_adjustment');
assert.strictEqual(lowProfitWasteObjective.mustClearOverBudget, false);
assert.strictEqual(lowProfitWasteObjective.primaryAction, 'lower_layer_bid_down_or_pause');
assert.ok(lowProfitWasteObjective.reasons.includes('low_or_negative_profit'));
assert.ok(lowProfitWasteObjective.reasons.includes('no_orders'));

const staleLowInventoryDecision = assessSeasonalSellThroughOpportunity({
  card: {
    sku: 'ABC123',
    profitRate: 0.08,
    invDays: 8,
    fulFillable: 8,
    unitsSold_7d: 2,
    unitsSold_30d: 20,
  },
  group: {
    campaignName: 'generic campaign',
    groupName: 'generic group',
    orders: 0,
    sales: 0,
    spend: 12,
    clicks: 30,
    currentBudget: 5,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(staleLowInventoryDecision.shouldLift, false);
assert.ok(staleLowInventoryDecision.blockers.includes('no_seasonal_signal'));
assert.ok(staleLowInventoryDecision.blockers.includes('no_orders'));
assert.ok(staleLowInventoryDecision.blockers.includes('absolute_inventory_not_high'));

const genericSeasonalDecision = assessSeasonalSellThroughOpportunity({
  card: {
    sku: 'GENERIC1',
    isSeasonal: true,
    profitRate: 0.08,
    invDays: 80,
    fulFillable: 120,
    unitsSold_7d: 20,
    unitsSold_30d: 50,
  },
  group: {
    campaignName: 'auto_kitchen widget_generic1',
    groupName: 'auto_kitchen widget_generic1',
    orders: 6,
    sales: 90,
    spend: 15,
    clicks: 30,
    currentBudget: 6,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(genericSeasonalDecision.shouldLift, false);
assert.ok(genericSeasonalDecision.blockers.includes('no_seasonal_signal'));

const themeTailDecision = assessSeasonalSellThroughOpportunity({
  card: {
    sku: 'GM3201',
    profitRate: -0.08,
    invDays: 68,
    fulFillable: 120,
    unitsSold_7d: 12,
    unitsSold_30d: 24,
    lifecycleSeason: {
      seasonPhase: 'season_tail',
      activeThemes: ['nurse_week'],
      hasConversion: true,
    },
  },
  group: {
    campaignName: 'auto_lab technician gifts_gm3201',
    groupName: 'auto_lab technician gifts_gm3201',
    orders: 4,
    sales: 79.96,
    spend: 12,
    clicks: 28,
    currentBudget: 6,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(themeTailDecision.shouldLift, true);
assert.strictEqual(themeTailDecision.reasonCode, 'seasonal_sell_through_profit_max');

const staleThemeMismatchDecision = assessSeasonalSellThroughOpportunity({
  card: {
    sku: 'BADTHEME',
    profitRate: -0.08,
    invDays: 80,
    fulFillable: 140,
    unitsSold_7d: 20,
    unitsSold_30d: 40,
    lifecycleSeason: {
      seasonPhase: 'season_tail',
      activeThemes: ['nurse_week'],
      hasConversion: true,
    },
  },
  group: {
    campaignName: 'auto_plain_storage_box_badtheme',
    groupName: 'auto_plain_storage_box_badtheme',
    orders: 5,
    sales: 100,
    spend: 14,
    clicks: 30,
    currentBudget: 6,
  },
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(staleThemeMismatchDecision.shouldLift, false);
assert.ok(staleThemeMismatchDecision.blockers.includes('no_seasonal_signal'));

console.log('over_budget_policy tests passed');
