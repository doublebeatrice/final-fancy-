const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractActionSchemaScope,
  filterSnapshotForActionSchema,
  shouldUseFastActionScope,
} = require('../src/execution_scope');

function writeSchema(raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-scope-'));
  const file = path.join(dir, 'schema.json');
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  return file;
}

const schemaFile = writeSchema([
  {
    sku: 'FAST1',
    actions: [
      {
        entityType: 'keyword',
        id: 'kw-fast',
        campaignId: 'camp-fast',
        adGroupId: 'group-fast',
        actionType: 'bid',
      },
      {
        entityType: 'campaign',
        id: 'camp-fast',
        actionType: 'budget',
      },
    ],
  },
]);

{
  const scope = extractActionSchemaScope(schemaFile);
  assert.deepStrictEqual(scope.skus, ['FAST1']);
  assert.ok(scope.entityIds.has('kw-fast'));
  assert.ok(scope.campaignIds.has('camp-fast'));
  assert.ok(scope.adGroupIds.has('group-fast'));
  assert.strictEqual(shouldUseFastActionScope({ actionSchemaFile: schemaFile, fastScope: true }), true);
  assert.strictEqual(shouldUseFastActionScope({ actionSchemaFile: schemaFile, fastScope: false }), false);
}

{
  const snapshot = {
    productCards: [
      {
        sku: 'FAST1',
        asin: 'B0FAST0001',
        listing: { title: 'Cruise Ducks Party Favors', bullets: ['Rubber ducks for cruise exchange'] },
        productProfile: { productType: 'rubber ducks', occasion: ['cruise'] },
        createContext: { keywordSeeds: ['cruise ducks'] },
      },
      { sku: 'SLOW2', asin: 'B0SLOW0002', listing: { title: 'Unrelated product' } },
    ],
    kwRows: [
      { sku: 'FAST1', keywordId: 'kw-fast', campaignId: 'camp-fast', adGroupId: 'group-fast' },
      { sku: 'SLOW2', keywordId: 'kw-slow', campaignId: 'camp-slow', adGroupId: 'group-slow' },
      { keywordId: 'kw-row-without-sku', campaignId: 'camp-fast', adGroupId: 'group-fast' },
    ],
    autoRows: [
      { sku: 'SLOW2', targetId: 'target-slow', campaignId: 'camp-slow', adGroupId: 'group-slow' },
    ],
    targetRows: [],
    productAdRows: [
      { sku: 'FAST1', adId: 'ad-fast', campaignId: 'camp-fast', adGroupId: 'group-fast' },
      { sku: 'SLOW2', adId: 'ad-slow', campaignId: 'camp-slow', adGroupId: 'group-slow' },
    ],
    sbRows: [
      { sku: 'SLOW2', keywordId: 'sb-slow', campaignId: 'sb-camp-slow' },
    ],
    sbCampaignRows: [
      { sku: 'FAST1', campaignId: 'camp-fast' },
      { sku: 'SLOW2', campaignId: 'sb-camp-slow' },
    ],
    sp7DayUntouchedRows: [
      { sku: 'FAST1', campaignId: 'camp-fast', adGroupId: 'group-fast' },
      { sku: 'SLOW2', campaignId: 'camp-slow', adGroupId: 'group-slow' },
    ],
    sb7DayUntouchedRows: [
      { sku: 'SLOW2', campaignId: 'sb-camp-slow' },
    ],
    inventoryScopeRows: [
      { sku: 'FAST1', salesChannel: 'Amazon.com', saleStatus: '正常销售', fuldate: '2026-05-01' },
      { sku: 'SLOW2', salesChannel: 'Amazon.com', saleStatus: '正常销售', fuldate: '2026-05-01' },
    ],
    invMap: {
      FAST1: { sku: 'FAST1', salesChannel: 'Amazon.com', saleStatus: '正常销售', fuldate: '2026-05-01' },
      SLOW2: { sku: 'SLOW2', salesChannel: 'Amazon.com', saleStatus: '正常销售', fuldate: '2026-05-01' },
    },
    sevenDayUntouchedMeta: {
      sp: { count: 2, entityLevel: 'productAd', sample: { sku: 'SLOW2', campaignId: 'camp-slow' }, sampleKeys: ['sku', 'campaignId'] },
      sb: { count: 1, entityLevel: 'campaign', sample: { sku: 'SLOW2', campaignId: 'sb-camp-slow' }, sampleKeys: ['sku', 'campaignId'] },
    },
    sellerSalesRows: [{ seller: 'total' }],
  };

  const filtered = filterSnapshotForActionSchema(snapshot, { actionSchemaFile: schemaFile, fastScope: true });
  assert.deepStrictEqual(filtered.productCards.map(card => card.sku), ['FAST1']);
  assert.strictEqual(filtered.productCards[0].listing.title, 'Cruise Ducks Party Favors');
  assert.strictEqual(filtered.productCards[0].productProfile.productType, 'rubber ducks');
  assert.deepStrictEqual(filtered.productCards[0].createContext.keywordSeeds, ['cruise ducks']);
  assert.deepStrictEqual(filtered.kwRows.map(row => row.keywordId).sort(), ['kw-fast', 'kw-row-without-sku']);
  assert.deepStrictEqual(filtered.autoRows, []);
  assert.deepStrictEqual(filtered.productAdRows.map(row => row.adId), ['ad-fast']);
  assert.deepStrictEqual(filtered.sbCampaignRows.map(row => row.campaignId), ['camp-fast']);
  assert.deepStrictEqual(filtered.sp7DayUntouchedRows.map(row => row.sku), ['FAST1']);
  assert.deepStrictEqual(filtered.sb7DayUntouchedRows, []);
  assert.strictEqual(filtered.sevenDayUntouchedMeta.sp.count, 1);
  assert.strictEqual(filtered.sevenDayUntouchedMeta.sp.sample.sku, 'FAST1');
  assert.strictEqual(filtered.sevenDayUntouchedMeta.sb.count, 0);
  assert.deepStrictEqual(filtered.sevenDayUntouchedMeta.sb.sample, {});
  assert.deepStrictEqual(filtered.inventoryScopeRows.map(row => row.sku), ['FAST1']);
  assert.deepStrictEqual(Object.keys(filtered.invMap), ['FAST1']);
  assert.deepStrictEqual(filtered.sellerSalesRows, [{ seller: 'total' }]);
  assert.deepStrictEqual(filtered.__fastActionScope, {
    enabled: true,
    schemaSkuCount: 1,
    retainedProductCards: 1,
    originalProductCards: 2,
  });
}

{
  const snapshot = { productCards: [{ sku: 'FAST1' }, { sku: 'SLOW2' }] };
  const filtered = filterSnapshotForActionSchema(snapshot, { actionSchemaFile: schemaFile, fastScope: false });
  assert.deepStrictEqual(filtered.productCards.map(card => card.sku), ['FAST1', 'SLOW2']);
  assert.strictEqual(filtered.__fastActionScope, undefined);
}

console.log('execution_scope.test.js passed');
