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
assert.strictEqual(isRowInAllowedOperationScope({ ...openedUsRow, saleStatus: '发货限制安排跟卖' }), true);
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

{
  const scope = analyzeAllowedOperationScope({
    productCards: [{ sku: 'MH0525' }],
    productAdRows: [
      {
        sku: 'MH0525',
        asin: 'B09KLVT7NB',
        siteId: 4,
        skuInvData: {
          sku: 'MH0525',
          asin: 'B09KLVT7NB',
          sale_status: '发货限制安排跟卖',
          ful_date: '2022-01-16',
        },
      },
    ],
  });
  assert.strictEqual(scope.summary.allowedScopeSkuCount, 1);
  assert.ok(scope.allowedSkuSet.has('MH0525'));
}

{
  const scope = analyzeAllowedOperationScope({
    productCards: [{ sku: 'MH0525' }],
    inventoryScopeRows: [
      { ...openedUsRow, sku: 'MH0525', saleStatus: '停售' },
    ],
  });

  const scoped = applyAllowedOperationScope({
    rawPlan: [
      { sku: 'MH0525', operatorRequested: true, actions: [{ id: 'kw1' }] },
    ],
    plan: [
      {
        sku: 'MH0525',
        actions: [{
          id: 'kw1',
          canAutoExecute: true,
          decisionStage: 'ai_approved',
          approvedBy: 'codex',
          actionSource: ['codex'],
          forceExecute: true,
        }],
      },
    ],
    review: [],
    skipped: [],
    errors: [],
  }, scope);

  assert.deepStrictEqual(scoped.plan.map(item => item.sku), ['MH0525']);
  assert.strictEqual(scoped.scope.outOfScopeSkus, 0);
  assert.strictEqual(scoped.scope.operatorRequestedOverrideSkus, 1);
}

console.log('operation_scope tests passed');
