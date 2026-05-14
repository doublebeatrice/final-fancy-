const assert = require('assert');
const {
  cooldownAssessment,
  isTrafficIncreasingAction,
  overBudgetWarningAssessment,
  refundGateAssessment,
} = require('../src/ai_decision');

{
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'create' }), true);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'enable' }), true);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'bid', currentBid: 0.5, suggestedBid: 0.6 }), true);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'bid', currentBid: 0.5, suggestedBid: 0.4 }), false);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'budget', currentBudget: 10, suggestedBudget: 15 }), true);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'budget', currentBudget: 10, suggestedBudget: 8 }), false);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'placement', currentPlacementPercent: 50, suggestedPlacementPercent: 100 }), true);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'pause' }), false);
  assert.strictEqual(isTrafficIncreasingAction({ actionType: 'review' }), false);
}

{
  const productClean = { sku: 'A1', productLabels: { is_high_return_rate: 0 }, profitRate: 0.05 };
  assert.strictEqual(refundGateAssessment(productClean, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7 }).ok, true);

  const productHighReturnGoodProfit = { sku: 'A2', productLabels: { is_high_return_rate: 1 }, profitRate: 0.25 };
  assert.strictEqual(refundGateAssessment(productHighReturnGoodProfit, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7 }).ok, true,
    'high return but healthy profit should not block');

  const productHighReturnLowProfit = { sku: 'A3', productLabels: { is_high_return_rate: 1 }, profitRate: 0.05 };
  const blocked = refundGateAssessment(productHighReturnLowProfit, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7 });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.reason, 'high_return_low_profit_blocks_traffic_push');
  assert.ok(blocked.evidence.some(e => e.startsWith('is_high_return_rate')));

  assert.strictEqual(refundGateAssessment(productHighReturnLowProfit, { actionType: 'bid', currentBid: 0.7, suggestedBid: 0.5 }).ok, true,
    'bid-down on high-return SKU is not blocked');
  assert.strictEqual(refundGateAssessment(productHighReturnLowProfit, { actionType: 'pause' }).ok, true);
}

{
  const today = '2026-05-14';
  const productNoHistory = { sku: 'X1', history: [] };
  assert.strictEqual(cooldownAssessment(productNoHistory, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7, businessDate: today, id: 'kw1' }).ok, true);

  const productWithRecentPush = {
    sku: 'X2',
    history: [
      { sku: 'X2', entityId: 'kw1', actionType: 'bid', direction: 'up', runAt: '2026-05-14T03:00:00Z' },
    ],
  };
  const cooldown = cooldownAssessment(productWithRecentPush, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7, businessDate: today, id: 'kw1', entityType: 'keyword' });
  assert.strictEqual(cooldown.ok, false);
  assert.strictEqual(cooldown.reason, 'same_sku_traffic_push_within_cooldown');

  const productOldPush = {
    sku: 'X3',
    history: [
      { sku: 'X3', entityId: 'kw9', actionType: 'bid', direction: 'up', runAt: '2026-05-10T03:00:00Z' },
    ],
  };
  assert.strictEqual(
    cooldownAssessment(productOldPush, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7, businessDate: today, id: 'kw9', entityType: 'keyword' }).ok,
    true,
    'cooldown elapsed should allow push'
  );

  const productPushDifferentEntity = {
    sku: 'X4',
    history: [
      { sku: 'X4', entityId: 'kw-other', actionType: 'bid', direction: 'up', runAt: '2026-05-14T03:00:00Z' },
    ],
  };
  assert.strictEqual(
    cooldownAssessment(productPushDifferentEntity, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7, businessDate: today, id: 'kw-this', entityType: 'keyword' }).ok,
    true,
    'different entity is not blocked even on same SKU'
  );

  assert.strictEqual(
    cooldownAssessment(productWithRecentPush, { actionType: 'bid', currentBid: 0.7, suggestedBid: 0.5, businessDate: today, id: 'kw1' }).ok,
    true,
    'down action is not blocked by cooldown'
  );
  assert.strictEqual(cooldownAssessment(productWithRecentPush, { actionType: 'pause', businessDate: today, id: 'kw1' }).ok, true);
}

{
  const productNoOverBudget = { sku: 'B1', operatingContext: {} };
  assert.strictEqual(overBudgetWarningAssessment(productNoOverBudget, { actionType: 'budget', currentBudget: 10, suggestedBudget: 20 }).ok, true);

  const productOverBudgetNoOrders = {
    sku: 'B2',
    operatingContext: { overBudget: { recentSpend: 50, recentOrders: 0, acos: null } },
  };
  const blocked = overBudgetWarningAssessment(productOverBudgetNoOrders, { actionType: 'budget', currentBudget: 10, suggestedBudget: 20 });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.reason, 'over_budget_inefficient_blocks_budget_up');

  const productOverBudgetHighAcos = {
    sku: 'B3',
    operatingContext: { overBudget: { recentSpend: 50, recentOrders: 1, acos: 0.6 } },
  };
  assert.strictEqual(overBudgetWarningAssessment(productOverBudgetHighAcos, { actionType: 'budget', currentBudget: 10, suggestedBudget: 20 }).ok, false);

  const productOverBudgetHealthy = {
    sku: 'B4',
    operatingContext: { overBudget: { recentSpend: 50, recentOrders: 5, acos: 0.18 } },
  };
  assert.strictEqual(overBudgetWarningAssessment(productOverBudgetHealthy, { actionType: 'budget', currentBudget: 10, suggestedBudget: 20 }).ok, true);

  assert.strictEqual(overBudgetWarningAssessment(productOverBudgetNoOrders, { actionType: 'budget', currentBudget: 20, suggestedBudget: 10 }).ok, true,
    'budget-down is not blocked');
  assert.strictEqual(overBudgetWarningAssessment(productOverBudgetNoOrders, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7 }).ok, true,
    'bid action is not handled by overbudget gate');
}

console.log('ai_decision_retro_guards tests passed');
