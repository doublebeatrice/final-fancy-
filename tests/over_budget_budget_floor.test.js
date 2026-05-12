const assert = require('assert');
const { buildOverBudgetControlledPlans } = require('../scripts/generators/generate_over_budget_schema');
const { buildOverBudgetBadConversionPlans } = require('../scripts/generators/generate_over_budget_bad_conversion_schema');

const baseSnapshot = {
  productCards: [{
    sku: 'FLOOR1',
    asin: 'B0FLOOR1',
    netProfit: 0.2,
    busyNetProfit: 0.18,
    profitRate: 0.11,
    invDays: 60,
    unitsSold_7d: 6,
    unitsSold_30d: 20,
    fulFillable: 50,
  }],
  invMap: {},
  overBudgetRows: [{
    __overBudgetSource: 'SP',
    state: 'enabled',
    campaignState: 'enabled',
    groupState: 'enabled',
    sku: 'FLOOR1',
    asin: 'B0FLOOR1',
    campaignId: 111,
    adGroupId: 222,
    campaignName: 'auto_floor_profit',
    groupName: 'auto_floor_profit',
    dailyBudget: '1.00',
    Spend: '2.00',
    Sales: '20.00',
    Orders: '1',
    Clicks: '8',
    ACOS: '0.1',
    positionType: 'auto',
  }],
};

const liftPlans = buildOverBudgetControlledPlans(baseSnapshot, { limit: 10 });
assert.strictEqual(liftPlans.length, 1);
assert.strictEqual(liftPlans[0].actions[0].currentBudget, 1);
assert.ok(
  liftPlans[0].actions[0].suggestedBudget >= 3,
  `expected low-budget profitable over-budget campaign to lift to at least 3, got ${liftPlans[0].actions[0].suggestedBudget}`,
);

const badSnapshot = JSON.parse(JSON.stringify(baseSnapshot));
badSnapshot.overBudgetRows[0].Spend = '15.00';
badSnapshot.overBudgetRows[0].Sales = '0.00';
badSnapshot.overBudgetRows[0].Orders = '0';
badSnapshot.overBudgetRows[0].Clicks = '30';
badSnapshot.overBudgetRows[0].dailyBudget = '4.00';

const badPlans = buildOverBudgetBadConversionPlans(badSnapshot, {
  limit: 10,
  businessDate: '2026-05-09',
  allowCampaignBudgetDown: true,
  alreadyAdjusted: new Set(),
});
assert.ok(
  badPlans.every(plan => plan.actions.every(action => !(action.entityType === 'campaign' && action.actionType === 'budget'))),
  'bad-conversion over-budget handling should not use campaign budget-down; adjust product ad or bid layer instead',
);

console.log('over_budget_budget_floor tests passed');
