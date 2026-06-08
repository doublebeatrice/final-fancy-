const assert = require('assert');
const { validateAndNormalizePlan } = require('../src/ai_decision');

const context = {
  products: [
    {
      sku: 'RHO1540',
      asin: 'B000000000',
      price: 11.99,
      profitRate: 0.2519,
      invDays: 8,
      unitsSold_7d: 4,
      unitsSold_30d: 19,
      adStats: { '7d': { spend: 6, orders: 2 }, '30d': { spend: 22, orders: 7 } },
      sbStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      adjustableAds: [],
    },
  ],
};

const approval = {
  decisionStage: 'ai_approved',
  approvedBy: 'codex',
  actionSource: ['codex'],
  goal: { metric: 'netProfit', from: 6, to: 7, deadlineDays: 7, hardFloor: 4 },
  killSwitch: { metric: 'netProfit', condition: 'netProfit falls below hardFloor by day 7' },
};

{
  const validated = validateAndNormalizePlan([
    {
      sku: 'RHO1540',
      summary: 'raise price to protect inventory',
      actions: [
        {
          entityType: 'sku',
          id: 'RHO1540',
          actionType: 'price',
          currentPrice: 11.99,
          suggestedPrice: 12.99,
          site: 'Amazon.com',
          remark: '可卖低 涨价',
          priceIntent: 'inventory_protection',
          adCoupling: {
            direction: 'down',
            reason: 'low inventory, keep traffic controlled',
            allowedAdActions: ['lower_bid', 'hold'],
            blockedAdActions: ['raise_bid'],
            checkAfterDays: [1, 3, 7],
          },
          evidence: ['invDays=8', 'price test approved'],
          riskLevel: 'low',
          ...approval,
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  const action = validated.plan[0].actions[0];
  assert.strictEqual(action.entityType, 'sku');
  assert.strictEqual(action.actionType, 'price');
  assert.strictEqual(action.canAutoExecute, true);
  assert.strictEqual(action.direction, 'up');
  assert.strictEqual(action.verifySource, 'inventoryRows');
  assert.strictEqual(action.verifyField, 'today_price_apply');
  assert.strictEqual(action.expected.value, 12.99);
  assert.strictEqual(action.learning.baseline.currentPrice, 11.99);
  assert.strictEqual(action.learning.baseline.suggestedPrice, 12.99);
  assert.strictEqual(action.adCoupling.direction, 'down');
}

{
  const validated = validateAndNormalizePlan([
    {
      sku: 'RHO1540',
      summary: 'raise price and normalize target cents',
      actions: [
        {
          entityType: 'sku',
          id: 'RHO1540',
          actionType: 'price',
          currentPrice: 11.99,
          suggestedPrice: 12.5,
          site: 'Amazon.com',
          remark: 'inventory protection price raise',
          priceIntent: 'inventory_protection',
          adCoupling: {
            direction: 'down',
            reason: 'low inventory, keep traffic controlled',
          },
          evidence: ['invDays=8', 'operator requires .99 price endings'],
          riskLevel: 'low',
          ...approval,
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  const action = validated.plan[0].actions[0];
  assert.strictEqual(action.suggestedPrice, 12.99);
  assert.strictEqual(action.expected.value, 12.99);
  assert.strictEqual(action.learning.baseline.suggestedPrice, 12.99);
  assert.ok(action.priceValidationWarnings.includes('price_target_normalized_to_99'));
}

{
  const validated = validateAndNormalizePlan([
    {
      sku: 'RHO1540',
      summary: 'raise price but forgot ad coupling',
      actions: [
        {
          entityType: 'sku',
          id: 'RHO1540',
          actionType: 'price',
          currentPrice: 11.99,
          suggestedPrice: 12.99,
          site: 'Amazon.com',
          remark: '涨价',
          priceIntent: 'inventory_protection',
          evidence: ['invDays=8'],
          riskLevel: 'low',
          ...approval,
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.review[0].action.actionType, 'review');
  assert.ok(validated.review[0].action.reason.includes('missing_ad_coupling'));
}

console.log('ai_decision_price tests passed');
