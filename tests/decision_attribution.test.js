const assert = require('assert');
const { buildLearningRecord, decisionAttribution, actionBreakdown, finalRunLanding, allDayLanding, classifyOutcome } = require('../src/daily_learning');
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
  assert.deepStrictEqual(attribution.codex, { plannedActions: 2, landedSuccess: 1, landedFailed: 1, dryRunPlanned: 0, manualReview: 0, skipped: 0, unknown: 0 });
  assert.deepStrictEqual(attribution.claude, { plannedActions: 2, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 1, manualReview: 0, skipped: 0, unknown: 0 });
  assert.deepStrictEqual(attribution.manual, { plannedActions: 1, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 0, manualReview: 0, skipped: 0, unknown: 0 });
  assert.deepStrictEqual(attribution.unattributed, { plannedActions: 1, landedSuccess: 1, landedFailed: 0, dryRunPlanned: 0, manualReview: 0, skipped: 0, unknown: 0 });
}

{
  const breakdown = actionBreakdown(records);
  assert.strictEqual(breakdown.landed.success, 4);
  assert.strictEqual(breakdown.landed.failed, 1);
  assert.strictEqual(breakdown.landed.planned, 1);
  assert.strictEqual(breakdown.landed.manualReview, 0);
  assert.strictEqual(breakdown.landed.skipped, 0);
  assert.strictEqual(breakdown.landed.unknown, 0);
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
    skipped: 0,
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

{
  assert.strictEqual(classifyOutcome({ outcome: 'success' }), 'success');
  assert.strictEqual(classifyOutcome({ outcome: 'api_success_landed' }), 'success');
  assert.strictEqual(classifyOutcome({ outcome: 'application_submitted' }), 'success');
  assert.strictEqual(classifyOutcome({ outcome: 'manual_review' }), 'manualReview');
  assert.strictEqual(classifyOutcome({ outcome: 'skipped_invalid_state' }), 'skipped');
  assert.strictEqual(classifyOutcome({ outcome: 'cancelled' }), 'skipped');
  assert.strictEqual(classifyOutcome({ outcome: 'failed' }), 'failed');
  assert.strictEqual(classifyOutcome({ outcome: 'dry_run_planned' }), 'planned');
  assert.strictEqual(classifyOutcome({ outcome: '', dryRun: true }), 'planned');
  assert.strictEqual(classifyOutcome({ outcome: '' }), 'unknown');
}

{
  const multiRun = [
    normalizeAdjustmentRecord({ sku: 'S1', action: { actionType: 'bid', entityType: 'keyword', id: 'k1', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'success' }, { ...timeContext, sourceRunId: 'run-a', businessDate: '2026-05-11' }),
    normalizeAdjustmentRecord({ sku: 'S2', action: { actionType: 'bid', entityType: 'keyword', id: 'k2', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'success' }, { ...timeContext, sourceRunId: 'run-a', businessDate: '2026-05-11' }),
    normalizeAdjustmentRecord({ sku: 'S3', action: { actionType: 'bid', entityType: 'keyword', id: 'k3', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'success' }, { ...timeContext, sourceRunId: 'run-b', businessDate: '2026-05-11' }),
    normalizeAdjustmentRecord({ sku: 'S4', action: { actionType: 'review', entityType: 'campaign', id: 'c4', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'manual_review' }, { ...timeContext, sourceRunId: 'run-c', businessDate: '2026-05-11' }),
    normalizeAdjustmentRecord({ sku: 'S5', action: { actionType: 'pause', entityType: 'productAd', id: 'p5', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'skipped_invalid_state' }, { ...timeContext, sourceRunId: 'run-c', businessDate: '2026-05-11' }),
    normalizeAdjustmentRecord({ sku: 'YESTERDAY', action: { actionType: 'bid', entityType: 'keyword', id: 'kY', approvedBy: 'codex', actionSource: ['codex'] }, outcome: 'success' }, { ...timeContext, sourceRunId: 'old-run', businessDate: '2026-05-10' }),
  ];
  const allDay = allDayLanding(multiRun, '2026-05-11');
  assert.strictEqual(allDay.total, 5, 'must filter out other businessDate records');
  assert.strictEqual(allDay.runs, 3);
  assert.strictEqual(allDay.success, 3);
  assert.strictEqual(allDay.manualReview, 1);
  assert.strictEqual(allDay.skipped, 1);
  assert.strictEqual(allDay.bestRunId, 'run-a');
  assert.strictEqual(allDay.bestRunSuccess, 2);

  const allRecords = allDayLanding(multiRun);
  assert.strictEqual(allRecords.total, 6, 'no businessDate filter returns everything');
}

{
  const record = buildLearningRecord({
    timeContext,
    snapshot: {
      productCards: [{ sku: 'SKU-1' }],
    },
    taskPool: {},
    manifest: {
      runId: 'quality-run',
      dataQuality: {
        baselineQuality: 'incomplete',
        productCards: 1,
        adRowsTotal: 0,
        sellerSalesRows: 0,
        listingFetchAttempted: 10,
        listingFetchSuccess: 1,
        listingFetchSkipped: 9,
        listingCoverage: 0.1,
        warnings: ['ads_rows_missing', 'listing_coverage_low'],
      },
      actionQuality: {
        status: 'no_action_plan',
        warnings: ['no_planned_actions'],
      },
      runQuality: {
        status: 'blocked',
        warnings: ['ads_rows_missing', 'no_planned_actions'],
      },
      schemaValidation: { planActionCount: 0, executableSkus: 0, errorCount: 0 },
      steps: [{ name: 'execute_verify_note', status: 'skipped' }],
      outputFiles: {},
    },
    adjustmentRecords: [],
  });
  assert.strictEqual(record.dataQuality.baselineQuality, 'incomplete');
  assert.strictEqual(record.dataQuality.adRowsTotal, 0);
  assert.strictEqual(record.dataQuality.listingCoverage, 0.1);
  assert.ok(record.dataQuality.warnings.includes('ads_rows_missing'));
  assert.ok(record.dataQuality.warnings.includes('listing_coverage_low'));
  assert.strictEqual(record.decisions.actionQuality.status, 'no_action_plan');
  assert.strictEqual(record.decisions.runQuality.status, 'blocked');
}

console.log('decision_attribution tests passed');
