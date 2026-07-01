const assert = require('assert');

const {
  buildPlanFromArgs,
  removeBlockedKeywords,
  sensitiveBlockedTerms,
  validateCliPlan,
} = require('../src/sbv_create_flow');

{
  const blocked = sensitiveBlockedTerms({
    'flip flops bulk': {
      flip: {
        flag: '',
        reason: '',
        siteName: 'ALL',
      },
    },
    'blocked term': {
      brand: {
        flag: 'blocked',
        reason: 'trademark',
      },
    },
  });
  assert.deepStrictEqual(blocked, ['blocked term']);
}

{
  const plan = {
    keywords: [
      { keywordText: 'flip flops bulk', bid: 0.72 },
      { keywordText: 'blocked term', bid: 0.72 },
    ],
  };
  const filtered = removeBlockedKeywords(plan, [['blocked term']]);
  assert.deepStrictEqual(filtered.plan.keywords.map(row => row.keywordText), ['flip flops bulk']);
  assert.deepStrictEqual(filtered.removed.map(row => row.keywordText), ['blocked term']);
}

{
  const plan = buildPlanFromArgs({
    sku: 'HUA0165',
    asin: 'B0C8M4Z2NL',
    accountId: '600',
    siteId: '4',
    budget: '10',
    bid: '0.72',
    keywords: 'flip flops bulk, bulk flip flops, disposable flip flops',
  });
  assert.strictEqual(plan.sku, 'HUA0165');
  assert.strictEqual(plan.asin, 'B0C8M4Z2NL');
  assert.strictEqual(plan.accountId, 600);
  assert.strictEqual(plan.siteId, 4);
  assert.strictEqual(plan.dailyBudget, 10);
  assert.strictEqual(plan.defaultBid, 0.72);
  assert.strictEqual(plan.coreTerm, 'flip flops bulk');
  assert.strictEqual(plan.campaignName, 'sbvkw_broad_flip flops bulk_hua0165');
  assert.deepStrictEqual(plan.keywords.map(row => row.keywordText), [
    'flip flops bulk',
    'bulk flip flops',
    'disposable flip flops',
  ]);
}

{
  const errors = validateCliPlan(buildPlanFromArgs({
    sku: 'HUA0165',
    asin: 'B0C8M4Z2NL',
    accountId: '600',
    siteId: '4',
    budget: '10',
    bid: '0.72',
    keywords: 'flip flops bulk, bulk flip flops',
  }));
  assert.ok(errors.includes('at least 3 keywords are required'));
}

console.log('sbv create flow tests passed');
