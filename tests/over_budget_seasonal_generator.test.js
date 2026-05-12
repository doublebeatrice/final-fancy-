const assert = require('assert');
const { buildSeasonalSellThroughPlans } = require('../scripts/execute/generate_overbudget_seasonal_sellthrough_schema');

const snapshot = {
  overBudgetRows: [{
    __overBudgetSource: 'SP',
    sku: 'AE3311',
    asin: 'B0CJM5MSJZ',
    campaignId: '295282411525603',
    adGroupId: '362962526446406',
    adId: '335520561876207',
    accountId: 195,
    campaignName: 'god mother gifts for women-ae3311-system-a',
    groupName: 'god mother gifts for women-ae3311-system-a',
    positionType: 'auto',
    state: 1,
    campaignState: 1,
    groupState: 1,
    dailyBudget: '6.00',
    Spend: '16.73',
    Sales: '86.94',
    Orders: '6',
    Clicks: '31',
    ACOS: '0.192431',
  }],
  productCards: [{
    sku: 'AE3311',
    asin: 'B0CJM5MSJZ',
    profitRate: 0.0827,
    sellableDays_30d: 72,
    fulFillable: 81,
    unitsSold_7d: 38,
    unitsSold_30d: 38,
  }],
};

const adGroupReports = [{
  campaignId: '295282411525603',
  adGroupId: '362962526446406',
  targetRows: [{
    targetId: '317392606314211',
    type: 'queryHighRelMatches',
    state: 1,
    campaignState: 1,
    groupState: 1,
    bid: '0.55',
    Spend: '14.81',
    Sales: '86.94',
    Orders: '6',
    Clicks: '27',
    ACOS: '0.170347',
  }, {
    targetId: '321066675190983',
    type: 'queryBroadRelMatches',
    state: 1,
    campaignState: 1,
    groupState: 1,
    bid: '0.40',
    Spend: '1.92',
    Sales: '0',
    Orders: '0',
    Clicks: '4',
    ACOS: '0',
  }],
}];

const plans = buildSeasonalSellThroughPlans({
  snapshot,
  adGroupReports,
  currentDate: new Date('2026-05-09T00:00:00+08:00'),
});

assert.strictEqual(plans.length, 1);
assert.strictEqual(plans[0].sku, 'AE3311');

const actions = plans[0].actions;
assert.strictEqual(actions.length, 2);

const budget = actions.find(action => action.entityType === 'campaign');
assert.strictEqual(budget.actionType, 'budget');
assert.strictEqual(budget.currentBudget, 6);
assert.strictEqual(budget.suggestedBudget, 8);
assert.strictEqual(budget.riskLevel, 'seasonal_overbudget_sell_through_budget_up');
assert.ok(budget.reason.includes('not a requirement to clear over-budget to zero'));
assert.ok(budget.evidence[0].includes('objective=profit_max_adjustment'));
assert.ok(budget.evidence[0].includes('mustClearOverBudget=false'));

const closeMatch = actions.find(action => action.entityType === 'autoTarget');
assert.strictEqual(closeMatch.actionType, 'bid');
assert.strictEqual(closeMatch.id, '317392606314211');
assert.strictEqual(closeMatch.currentBid, 0.55);
assert.strictEqual(closeMatch.suggestedBid, 0.6);
assert.ok(closeMatch.reason.includes('Close match'));
assert.ok(closeMatch.reason.includes('ad-layer quality'));

assert.strictEqual(actions.some(action => action.id === '321066675190983'), false);

console.log('over_budget_seasonal_generator tests passed');
