const assert = require('assert');
const { decisionAttribution, actionBreakdown, finalRunLanding } = require('../src/daily_learning');
const { normalizeAdjustmentRecord } = require('../src/adjustment_log');

const timeContext = { runAt: '2026-05-11T00:00:00Z', businessDate: '2026-05-11', sourceRunId: 'test-run' };

const records = [
  normalizeAdjustmentRecord({ sku: 'A1', action: { actionType: 'bid', entityType: 'keyword', id: 'k1', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'api_success_landed' }, timeContext),
  normalizeAdjustmentRecord({ sku: 'A2', action: { actionType: 'bid', entityType: 'keyword', id: 'k2', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'failed' }, timeContext),
  normalizeAdjustmentRecord({ sku: 'B1', action: { actionType: 'budget', entityType: 'campaign', id: 'c1', approvedBy: 'claude', actionSource: ['claude'] }, outcome: 'landed' }, timeContext),
  normalizeAdjustmentRecord({ sku: 'B2', action: { actionType: 'bid', entityType: 'keyword', id: 'k3', approvedBy: 'claude', actionSource: ['claude'] }, dryRun: true, outcome: 'dry_run_planned' }, timeContext),
  normalizeAdjustmentRecord({ sku: 'C1', action: { actionType: 'pause', entityType: 'productAd', id: 'p1', approvedBy: 'manual', actionSource: ['manual'] }, outcome: 'success' }, timeContext),
  normalizeAdjustmentRecord({ sku: 'D1', action: { actionType: 'bid', entityType: 'keyword', id: 'k4' }, outcome: 'success' }, timeContext),
];

{
  const attribution = decisionAttribution(records);
  assert.deepStrictEqual(attribution.codex, { plannedActions: 2, landedSuccess: 1, landedFailed: 1, dryRunPlanned: 0, unknown: 0 });
  assert.deepStrictEqual(attribution.claude, { plannedActions: 2, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 1, unknown: 0 });
  assert.deepStrictEqual(attribution.manual, { plannedActions: 1, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 0, unknown: 0 });
  assert.deepStrictEqual(attribution.unattributed, { plannedActions: 1, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 0, unknown: 0 });
}

{
  const breakdown = actionBreakdown(records);
  assert.strictEqual(breakdown.landed.success, 4);
  assert.strictEqual(breakdown.landed.failed, 1);
  assert.strictEqual(breakdown.landed.planned, 1);
}

{
  const mixedRuns = [
    normalizeAdjustmentRecord({ sku: 'OLD', action: { actionType: 'pause', entityType: 'campaign', id: 'old', approvedBy: 'claude', actionSource: ['claude'] }, outcome: 'failed' }, { ...timeContext, sourceRunId: 'old-run' }),
    normalizeAdjustmentRecord({ sku: 'NEW', action: { actionType: 'pause', entityType: 'campaign', id: 'new', approvedBy: 'claude', actionSource: ['claude'] }, outcome: 'success' }, { ...timeContext, sourceRunId: 'final-run' }),
    normalizeAdjustmentRecord({ sku: 'REVIEW', action: { actionType: 'review', entityType: 'campaign', id: 'review', approvedBy: 'claude', actionSource: ['claude'] }, outcome: 'manual_review' }, { ...timeContext, sourceRunId: 'final-run' }),
  ];
  assert.deepStrictEqual(finalRunLanding(mixedRuns, 'final-run'), {
    sourceRunId: 'final-run',
    total: 2,
    success: 1,
    failed: 0,
    planned: 0,
    manualReview: 1,
    unknown: 0,
  });
}

{
  const empty = decisionAttribution([]);
  assert.deepStrictEqual(empty, {});
}

{
  const record = records[0];
  assert.strictEqual(record.approvedBy, 'codex');
  assert.deepStrictEqual(record.actionSource, ['codex']);
}

{
  const claudeOnlyRecord = normalizeAdjustmentRecord({
    sku: 'CLAUDE-ONLY',
    action: { actionType: 'bid', entityType: 'keyword', id: 'kX', approvedBy: 'claude', actionSource: 'claude' },
    outcome: 'success',
  }, timeContext);
  assert.strictEqual(claudeOnlyRecord.approvedBy, 'claude');
  assert.deepStrictEqual(claudeOnlyRecord.actionSource, ['claude']);
}

console.log('decision_attribution tests passed');
