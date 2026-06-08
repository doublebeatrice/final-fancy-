const assert = require('assert');
const {
  actionFactorFor,
  buildHighEfficiencyBidSchema,
  enrichSnapshot,
  suggestedBid,
} = require('../scripts/execute/generate_high_efficiency_bid_schema');

const baseCard = {
  sku: 'ABC1234',
  asin: 'B0TEST1234',
  invDays: 60,
  stockFul: 80,
  stockRes: 10,
  stockInb: 20,
  price: 19.99,
  profitRate: 0.16,
  netProfit: 0.18,
  busyNetProfit: 0.15,
  seaProfitRate: 0.35,
  productLabels: {},
  campaigns: [],
};

function highRow(overrides = {}) {
  return {
    keywordId: 'kw1',
    keywordText: 'test keyword',
    campaignName: 'kw_test_abc1234',
    groupName: 'kw_test_abc1234',
    campaignId: 'camp1',
    adGroupId: 'group1',
    accountId: 100,
    siteId: 4,
    state: 1,
    campaignState: 1,
    groupState: 1,
    bid: '0.20',
    Spend: '4.00',
    Orders: '4',
    Sales: '80.00',
    Clicks: '20',
    Impressions: '1000',
    ACOS: '0.05',
    ConversionRate: '0.20',
    __adProperty: '1',
    __adPropertyLabel: 'spKeyword',
    ...overrides,
  };
}

{
  const tier = actionFactorFor({ row: highRow(), card: baseCard });
  assert.strictEqual(tier.decision, 'strong_bid_up');
  assert.strictEqual(tier.allowLargeBidChange, true);
  assert.strictEqual(suggestedBid(0.2, tier), 0.26);
}

{
  const tier = actionFactorFor({ row: highRow(), card: { ...baseCard, invDays: 12 } });
  assert.strictEqual(tier.decision, 'inventory_protect');
}

{
  const tier = actionFactorFor({ row: highRow(), card: { ...baseCard, netProfit: -0.02, busyNetProfit: -0.01 } });
  assert.strictEqual(tier.decision, 'hold');
  assert.strictEqual(tier.reason, 'negative_net_and_busy_profit');
}

{
  const highEfficiency = {
    byProperty: {
      1: { rows: [highRow()] },
    },
  };
  const snapshot = {
    productCards: [baseCard],
    inventoryScopeRows: [{
      sku: 'ABC1234',
      asin: 'B0TEST1234',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      fuldate: '2025-01-01',
    }],
    invMap: {},
  };
  const result = buildHighEfficiencyBidSchema({ highEfficiency, snapshot, businessDate: '2026-05-19' });
  assert.strictEqual(result.summary.actionRows, 1);
  assert.strictEqual(result.schema[0].actions[0].entityType, 'keyword');
  assert.strictEqual(result.schema[0].actions[0].decisionStage, 'ai_approved');
  assert.deepStrictEqual(result.schema[0].actions[0].goal, {
    metric: 'orders',
    from: 4,
    to: 5,
    deadlineDays: 7,
    hardFloor: 2,
  });
  assert.strictEqual(result.schema[0].actions[0].reviewPlan.goal.metric, 'orders');
  assert.ok(result.schema[0].actions[0].killSwitch.rollbackIf.includes('orders below 2'));

  const enriched = enrichSnapshot(snapshot, result.selectedRows);
  assert.strictEqual(enriched.kwRows.length, 1);
  assert.strictEqual(enriched.productCards[0].campaigns[0].keywords.length, 1);
}

console.log('high_efficiency_bid_schema tests passed');
