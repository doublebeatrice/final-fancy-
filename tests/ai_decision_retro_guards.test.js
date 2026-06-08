const assert = require('assert');
const {
  cooldownAssessment,
  correctionGateHighReturnNoTrafficPush,
  correctionGateOverbudgetBudgetUp,
  correctionGateSameSkuCooldown,
  isTrafficIncreasingAction,
  lowEfficiencyAssessment,
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

  const correctionGate = correctionGateHighReturnNoTrafficPush(productHighReturnLowProfit, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7 });
  assert.strictEqual(correctionGate.ok, false);
  assert.strictEqual(correctionGate.lessonId, 'correction_gate_high_return_low_profit_no_traffic_push');
  assert.ok(correctionGate.reason.startsWith('rule:correction:high_return_low_profit_no_traffic_push'));
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

  const correctionGate = correctionGateSameSkuCooldown(productWithRecentPush, { actionType: 'bid', currentBid: 0.5, suggestedBid: 0.7, businessDate: today, id: 'kw1', entityType: 'keyword' });
  assert.strictEqual(correctionGate.ok, false);
  assert.strictEqual(correctionGate.lessonId, 'correction_gate_same_sku_traffic_push_cooldown');
  assert.ok(correctionGate.reason.startsWith('rule:correction:same_sku_traffic_push_cooldown'));
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

  const correctionGate = correctionGateOverbudgetBudgetUp(productOverBudgetNoOrders, { actionType: 'budget', currentBudget: 10, suggestedBudget: 20 });
  assert.strictEqual(correctionGate.ok, false);
  assert.strictEqual(correctionGate.lessonId, 'correction_gate_overbudget_inefficient_no_budget_up');
  assert.ok(correctionGate.reason.startsWith('rule:correction:overbudget_inefficient_no_budget_up'));
}

{
  const recentLastAdjust = '2026-05-30 10:00:00';
  const oldLastAdjust = '2026-04-01 10:00:00';
  const product = { sku: 'L1' };

  const insideWindow = lowEfficiencyAssessment(product,
    { campaignState: 1, groupState: 1, state: 1, currentBid: 1.0, matchType: 'BROAD', stats30d: { clicks: 20, spend: 8, orders: 0 } },
    { actionType: 'bid', entityType: 'keyword', id: 'k1', currentBid: 1.0, suggestedBid: 0.85, lastAdjustedAt: recentLastAdjust, businessDate: '2026-05-14' });
  assert.strictEqual(insideWindow.ok, false);
  assert.strictEqual(insideWindow.reason, 'adjustment_window_not_elapsed');

  const elapsed = lowEfficiencyAssessment(product,
    { campaignState: 1, groupState: 1, state: 1, currentBid: 1.0, matchType: 'BROAD', stats30d: { clicks: 20, spend: 8, orders: 0 } },
    { actionType: 'bid', entityType: 'keyword', id: 'k1', currentBid: 1.0, suggestedBid: 0.85, lastAdjustedAt: oldLastAdjust, businessDate: '2026-05-14' });
  assert.strictEqual(elapsed.ok, true);

  const improved = lowEfficiencyAssessment(product,
    {
      campaignState: 1, groupState: 1, state: 1, currentBid: 0.75, matchType: 'BROAD',
      stats30d: { clicks: 34, spend: 19.24, orders: 1, sales: 56.99, acos: 0.34 },
      stats15d: { clicks: 12, spend: 5.2, orders: 1, sales: 56.99, acos: 0.09 },
      stats7d: { clicks: 5, spend: 1.6, orders: 1, sales: 56.99, acos: 0.03 },
      stats3d: { clicks: 2, spend: 0.5, orders: 1, sales: 56.99, acos: 0.01 },
    },
    { actionType: 'bid', entityType: 'keyword', id: 'k2', currentBid: 0.75, suggestedBid: 0.6, lastAdjustedAt: oldLastAdjust, businessDate: '2026-05-14' });
  assert.strictEqual(improved.ok, false);
  assert.strictEqual(improved.reason, 'recent_trend_improved');

  const bidUp = lowEfficiencyAssessment(product,
    { campaignState: 1, groupState: 1, state: 1, currentBid: 1.0, matchType: 'BROAD' },
    { actionType: 'bid', entityType: 'keyword', id: 'k3', currentBid: 1.0, suggestedBid: 1.2, lastAdjustedAt: recentLastAdjust, businessDate: '2026-05-14' });
  assert.strictEqual(bidUp.ok, true, 'bid-up is not handled by low-efficiency gate');

  const wrongEntity = lowEfficiencyAssessment(product,
    { campaignState: 1, groupState: 1, state: 1, currentBudget: 20 },
    { actionType: 'budget', entityType: 'campaign', id: 'c1', currentBudget: 20, suggestedBudget: 10, lastAdjustedAt: recentLastAdjust, businessDate: '2026-05-14' });
  assert.strictEqual(wrongEntity.ok, true, 'budget action is outside scope');

  const noTimestamp = lowEfficiencyAssessment(product,
    { campaignState: 1, groupState: 1, state: 1, currentBid: 1.0, matchType: 'BROAD' },
    { actionType: 'bid', entityType: 'keyword', id: 'k4', currentBid: 1.0, suggestedBid: 0.85 });
  assert.strictEqual(noTimestamp.ok, true, 'no timestamp means we cannot judge — let other gates speak');
}

console.log('ai_decision_retro_guards tests passed');
