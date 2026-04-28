const assert = require('assert');
const {
  analyzeAllowedOperationScope,
  applyAllowedOperationScope,
  isRowInAllowedOperationScope,
} = require('../src/operation_scope');

const openedUsRow = {
  sku: 'dn1655',
  asin: 'B0TEST1655',
  salesChannel: 'Amazon.com',
  saleStatus: '正常销售',
  fuldate: '2026-04-01',
};

assert.strictEqual(isRowInAllowedOperationScope(openedUsRow), true);
assert.strictEqual(isRowInAllowedOperationScope({ ...openedUsRow, saleStatus: '停售' }), false);
assert.strictEqual(isRowInAllowedOperationScope({ ...openedUsRow, salesChannel: 'Amazon.de' }), false);
assert.strictEqual(isRowInAllowedOperationScope({ ...openedUsRow, fuldate: '', opendate: '' }), false);

{
  const scope = analyzeAllowedOperationScope({
    productCards: [{ sku: 'DN1655' }, { sku: 'DN9999' }],
    inventoryScopeRows: [
      openedUsRow,
      { ...openedUsRow, sku: 'DN1656', salesChannel: 'Amazon.co.uk', saleStatus: '保留页面', fuldate: '', opendate: '2026-04-02' },
      { ...openedUsRow, sku: 'DN9999', saleStatus: '停售' },
    ],
  });
  assert.strictEqual(scope.summary.allowedScopeSkuCount, 2);
  assert.ok(scope.allowedSkuSet.has('DN1655'));
  assert.ok(scope.allowedSkuSet.has('DN1656'));

  const scoped = applyAllowedOperationScope({
    rawPlan: [
      { sku: 'DN1655', actions: [{ id: 'kw1' }] },
      { sku: 'DN9999', actions: [{ id: 'kw2' }] },
    ],
    plan: [
      { sku: 'DN1655', actions: [{ id: 'kw1', canAutoExecute: true }] },
      { sku: 'DN9999', actions: [{ id: 'kw2', canAutoExecute: true }] },
      { sku: 'DN8888', actions: [] },
    ],
    review: [{ sku: 'DN9999', action: { id: 'review1' } }],
    skipped: [],
    errors: [],
  }, scope);

  assert.deepStrictEqual(scoped.plan.map(item => item.sku), ['DN1655', 'DN8888']);
  assert.strictEqual(scoped.scope.outOfScopeSkus, 1);
  assert.deepStrictEqual(scoped.scope.outOfScopeSkuList, ['DN9999']);
  assert.strictEqual(scoped.review.length, 0);
}

{
  const scope = analyzeAllowedOperationScope({
    productCards: [{ sku: 'DN1655' }],
    invMap: {
      DN1655: openedUsRow,
    },
  });
  assert.strictEqual(scope.summary.source, 'invMap_fallback');
  assert.strictEqual(scope.summary.allowedScopeSkuCount, 1);
}

console.log('operation_scope tests passed');
