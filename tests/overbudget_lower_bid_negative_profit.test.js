const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildOverbudgetAdgroupLowerBidPlans } = require('../scripts/execute/generate_overbudget_adgroup_lower_bid_schema');

const tmpDir = path.join(__dirname, '..', 'data', 'tmp_tests');
fs.mkdirSync(tmpDir, { recursive: true });

const snapshotFile = path.join(tmpDir, 'negative_profit_overbudget_snapshot.json');
const outFile = path.join(tmpDir, 'negative_profit_overbudget_actions.json');

const snapshot = {
  overBudgetRows: [{
    __overBudgetSource: 'SP',
    sku: 'SIJ2012',
    asin: 'B0CHDSG76N',
    campaignId: '510905342436109',
    adGroupId: '436163515542228',
    campaignName: 'kw_food storage box_sij2012',
    groupName: 'kw_food storage box_sij2012',
    state: 1,
    campaignState: 1,
    groupState: 1,
    dailyBudget: '2.00',
    Spend: '21.52',
    Sales: '109.98',
    Orders: '2',
    Clicks: '34',
  }],
  productCards: [{
    sku: 'SIJ2012',
    asin: 'B0CHDSG76N',
    price: 54.99,
    profitRate: -0.2979,
    netProfit: 0.1548,
    busyNetProfit: 0.1142,
    sellableDays_30d: 47,
    unitsSold_7d: 8,
    unitsSold_30d: 22,
    campaigns: [{
      campaignId: '510905342436109',
      adGroupId: '436163515542228',
      campaignState: 1,
      groupState: 1,
      keywords: [{
        id: '423520514605853',
        text: 'fish tubs',
        bid: 0.7,
        state: 1,
        stats7d: {
          spend: 12.55,
          orders: 2,
          clicks: 17,
          impressions: 2812,
        },
        stats30d: {
          spend: 19.47,
          orders: 2,
          clicks: 29,
          impressions: 5750,
        },
      }],
      autoTargets: [],
    }],
  }],
};

fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2), 'utf8');

const positiveReferenceProfitPlans = buildOverbudgetAdgroupLowerBidPlans({
  snapshot,
  history: [],
  limit: 10,
  businessDate: '2099-01-01',
});

assert.strictEqual(positiveReferenceProfitPlans.length, 1);
assert.strictEqual(positiveReferenceProfitPlans[0].actions[0].riskLevel, 'overbudget_adgroup_profit_pressure_bid_down');
assert.strictEqual(positiveReferenceProfitPlans[0].actions[0].suggestedBid, 0.67);
assert.deepStrictEqual(positiveReferenceProfitPlans[0].actions[0].goal, {
  metric: 'netProfit',
  from: 0.1548,
  to: 0.1648,
  deadlineDays: 7,
  hardFloor: 0.1348,
});

snapshot.productCards[0].netProfit = -0.05;
snapshot.productCards[0].busyNetProfit = -0.08;

const plans = buildOverbudgetAdgroupLowerBidPlans({
  snapshot,
  history: [],
  limit: 10,
  businessDate: '2099-01-01',
});

fs.writeFileSync(outFile, JSON.stringify(plans, null, 2), 'utf8');
assert.strictEqual(plans.length, 1);
assert.strictEqual(plans[0].sku, 'SIJ2012');
assert.strictEqual(plans[0].actions.length, 1);

const action = plans[0].actions[0];
assert.strictEqual(action.entityType, 'keyword');
assert.strictEqual(action.id, '423520514605853');
assert.strictEqual(action.currentBid, 0.7);
assert.strictEqual(action.suggestedBid, 0.64);
assert.strictEqual(action.riskLevel, 'overbudget_adgroup_negative_profit_bid_down');
assert.deepStrictEqual(action.goal, {
  metric: 'netProfit',
  from: -0.05,
  to: -0.04,
  deadlineDays: 7,
  hardFloor: -0.07,
});
assert.ok(action.reason.includes('negative_profit'));
assert.ok(action.evidence.some(item => item.includes('referenceNetProfit=-5.0%')));

const minBudgetPressureSnapshot = {
  overBudgetRows: [{
    __overBudgetSource: 'SP',
    sku: 'GM3940',
    asin: 'B0GMNWKS7S',
    campaignId: '204237230581347',
    adGroupId: '376938094945250',
    campaignName: 'auto_bible verse necklace_gm3940',
    groupName: 'auto_bible verse necklace_gm3940',
    state: 1,
    campaignState: 1,
    groupState: 1,
    dailyBudget: '1.00',
    Spend: '12.74',
    Sales: '11.99',
    Orders: '1',
    Clicks: '40',
  }],
  productCards: [{
    sku: 'GM3940',
    asin: 'B0GMNWKS7S',
    price: 11.99,
    netProfit: 0.2189,
    profitRate: 0.2658,
    invDays: 33,
    unitsSold_7d: 75,
    unitsSold_30d: 81,
    campaigns: [{
      campaignId: '204237230581347',
      adGroupId: '376938094945250',
      campaignState: 1,
      groupState: 1,
      keywords: [],
      autoTargets: [{
        id: '334692236143050',
        targetType: 'auto',
        bid: 0.2,
        state: 1,
        stats7d: { spend: 0, orders: 0, clicks: 0, impressions: 21 },
        stats30d: { spend: 5.01, orders: 0, clicks: 16, impressions: 1036 },
      }],
    }],
  }],
};

const minBudgetPressurePlans = buildOverbudgetAdgroupLowerBidPlans({
  snapshot: minBudgetPressureSnapshot,
  history: [],
  limit: 10,
  businessDate: '2099-01-01',
});

assert.strictEqual(minBudgetPressurePlans.length, 1);
assert.strictEqual(minBudgetPressurePlans[0].actions[0].riskLevel, 'overbudget_adgroup_min_budget_profit_pressure_bid_down');
assert.strictEqual(minBudgetPressurePlans[0].actions[0].suggestedBid, 0.18);

console.log('overbudget lower bid negative profit tests passed');
