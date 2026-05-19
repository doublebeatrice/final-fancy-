const assert = require('assert');

const {
  PROPERTY_CONFIGS,
  buildHighEfficiencyPayload,
  summarizeHighEfficiencyRows,
} = require('../src/high_efficiency_filter');

const payload = buildHighEfficiencyPayload({
  property: '1',
  siteId: 4,
  startYmd: '2026-05-12',
  endYmd: '2026-05-18',
  page: 3,
  limit: 500,
});

assert.strictEqual(payload.siteId, 4);
assert.deepStrictEqual(payload.userName, ['HJ17', 'HJ171', 'HJ172']);
assert.strictEqual(payload.level, 'seller_num');
assert.strictEqual(payload.publicAdv, '2');
assert.strictEqual(payload.coreMark, '0');
assert.strictEqual(payload.lowCost, 2);
assert.strictEqual(payload.isHigh, '1');
assert.strictEqual(payload.state, '4');
assert.strictEqual(payload.property, '1');
assert.strictEqual(payload.page, 3);
assert.strictEqual(payload.limit, 500);
assert.deepStrictEqual(payload.filterArray, { campaignState: '1' });
assert.ok(Array.isArray(payload.timeRange));
assert.strictEqual(payload.timeRange.length, 2);
assert.ok(payload.timeRange[1] > payload.timeRange[0]);

const sbPayload = buildHighEfficiencyPayload({
  property: '4',
  siteId: 4,
  startYmd: '2026-05-12',
  endYmd: '2026-05-18',
});

assert.strictEqual(sbPayload.state, '1');
assert.strictEqual(sbPayload.property, '4');
assert.ok(PROPERTY_CONFIGS['6']);

const summary = summarizeHighEfficiencyRows([
  { sku: 'ABC1234', campaignId: 'c1', adGroupId: 'g1', keywordText: 'nurse gifts', spend: 12, orders: 4, sales: 80, impressions: 1000, clicks: 40 },
  { SKU: 'ABC1234', campaignId: 'c2', adGroupId: 'g2', targetText: 'B0TEST0001', Spend: 8, Orders: 2, Sales: 40, Impressions: 500, Clicks: 20 },
  { campaignName: 'kw xyz7890 graduation gifts', campaignId: 'c3', adGroupId: 'g3', keyword: 'graduation gifts', cost: 5, order: 1, sales: 20 },
]);

assert.strictEqual(summary.totalRows, 3);
assert.strictEqual(summary.skus.length, 2);
assert.strictEqual(summary.bySku.ABC1234.rows, 2);
assert.strictEqual(summary.bySku.ABC1234.orders, 6);
assert.strictEqual(summary.bySku.XYZ7890.rows, 1);
assert.ok(summary.bySku.ABC1234.bestTerms.includes('nurse gifts'));

console.log('high_efficiency_filter tests passed');
