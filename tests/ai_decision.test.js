const assert = require('assert');
const { buildProductContexts, validateAndNormalizePlan, loadExternalActionSchema } = require('../src/ai_decision');
const fs = require('fs');
const path = require('path');

const cards = [
  {
    sku: 'SKU-1',
    asin: 'ASIN-1',
    invDays: 20,
    unitsSold_30d: 20,
    unitsSold_7d: 5,
    adStats: { '30d': { orders: 3, spend: 12 } },
    sbStats: { '30d': { orders: 1, spend: 4 } },
    campaigns: [
      {
        keywords: [
          {
            id: 'kw-1',
            text: 'test keyword',
            matchType: 'EXACT',
            bid: 0.5,
            stats7d: { spend: 5, orders: 1, clicks: 10 },
            stats30d: { spend: 12, orders: 3, clicks: 30 },
          },
        ],
        autoTargets: [
          {
            id: 'at-1',
            targetType: 'auto',
            bid: 0.4,
            stats7d: { spend: 3, orders: 0, clicks: 8 },
            stats30d: { spend: 7, orders: 1, clicks: 24 },
          },
        ],
        sponsoredBrands: [
          {
            id: 'sbk-1',
            entityType: 'sbKeyword',
            text: 'sb keyword',
            matchType: 'BROAD',
            bid: 0.6,
            stats7d: { spend: 2, orders: 1, clicks: 5 },
            stats30d: { spend: 5, orders: 2, clicks: 16 },
          },
        ],
      },
    ],
  },
];

const rowsByType = {
  keyword: [{ sku: 'SKU-1', keywordId: 'kw-1', campaignId: 'c1', adGroupId: 'g1', accountId: 1, siteId: 4 }],
  autoTarget: [{ sku: 'SKU-1', targetId: 'at-1', campaignId: 'c1', adGroupId: 'g1', accountId: 1, siteId: 4 }],
  manualTarget: [],
  sbKeyword: [{ sku: 'SKU-1', keywordId: 'sbk-1', campaignId: 'sbc1', adGroupId: 'sbg1', matchType: 'BROAD', accountId: 1, siteId: 4 }],
  sbTarget: [],
};

{
  const { products } = buildProductContexts(
    cards,
    rowsByType,
    [{ sku: 'SKU-1', campaignId: 'c1', adGroupId: 'g1', Spend: '10', Orders: '1' }],
    [{ sku: 'SKU-1', campaignId: 'sbc1', Spend: '8', Orders: '1' }],
    []
  );
  assert.strictEqual(products.length, 1);
  const product = products[0];
  const keyword = product.adjustableAds.find(item => item.id === 'kw-1');
  const autoTarget = product.adjustableAds.find(item => item.id === 'at-1');
  const sbKeyword = product.adjustableAds.find(item => item.id === 'sbk-1');
  assert.ok(keyword.sourceSignals.includes('sp_7day_untouched'));
  assert.ok(autoTarget.sourceSignals.includes('sp_7day_untouched'));
  assert.ok(sbKeyword.sourceSignals.includes('sb_7day_untouched'));
}

{
  const context = buildProductContexts(cards, rowsByType, [], [], []).products
    ? { products: buildProductContexts(cards, rowsByType, [], [], []).products }
    : null;
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'test',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'low risk raise',
          evidence: ['7d orders=1'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan.length, 1);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.errors.length, 0);
}

{
  const context = { products: buildProductContexts([
    {
      ...cards[0],
      unitsSold_30d: 120,
      adStats: { '30d': { orders: 20, spend: 40 } },
    },
  ], rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'test',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'pause',
          reason: 'strong pause',
          evidence: ['high volume'],
          confidence: 0.9,
          riskLevel: 'high',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan[0].actions.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.review[0].action.actionType, 'review');
}

{
  const tmpFile = path.join(__dirname, '__tmp_action_schema.json');
  fs.writeFileSync(tmpFile, JSON.stringify([
    {
      sku: 'SKU-1',
      summary: 'external schema',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'codex decision',
          evidence: ['external action schema'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], null, 2));

  const loaded = loadExternalActionSchema({
    cards,
    rowsByType,
    sp7DayRows: [],
    sb7DayRows: [],
    history: [],
    sevenDayMeta: {},
    actionSchemaFile: tmpFile,
  });

  assert.strictEqual(loaded.decisionSource, 'external_action_schema');
  assert.strictEqual(loaded.plan.length >= 1, true);
  fs.unlinkSync(tmpFile);
}

console.log('ai_decision tests passed');
