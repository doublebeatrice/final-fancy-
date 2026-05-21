const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../scripts/execute/generate_kpi_recovery_dryrun_decisions');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-dryrun-decisions-'));
  const adjustments = path.join(tmpDir, 'adjustments.json');
  const conflicts = path.join(tmpDir, 'conflicts.json');
  const outFile = path.join(tmpDir, 'decisions.json');
  const mdFile = path.join(tmpDir, 'decisions.md');
  const nextActionsFile = path.join(tmpDir, 'next_actions.md');
  writeJson(adjustments, [
    {
      sku: 'DONE1',
      entityType: 'keyword',
      entityId: '1',
      entityName: 'done keyword',
      beforeValue: 0.2,
      afterValue: 0.23,
      reason: 'high_efficiency_small_bid_up: orders7=3; acos7=0.0400; invDays=80; netProfit=0.2000; busyNetProfit=0.1800.',
      businessDate: '2026-05-20',
      sourceRunId: 'dry-1',
      dryRun: true,
    },
    {
      sku: 'DONE1',
      entityType: 'keyword',
      entityId: '1',
      outcome: 'api_success',
      businessDate: '2026-05-20',
      dryRun: false,
    },
    {
      sku: 'REC1',
      entityType: 'keyword',
      entityId: '2',
      entityName: 'repeat keyword',
      beforeValue: 0.2,
      afterValue: 0.23,
      reason: 'high_efficiency_standard_bid_up: orders7=3; acos7=0.0500; invDays=60; netProfit=0.1800; busyNetProfit=0.1200.',
      businessDate: '2026-05-20',
      sourceRunId: 'dry-1',
      dryRun: true,
    },
    {
      sku: 'BLOCK1',
      entityType: 'keyword',
      entityId: '3',
      entityName: 'tight inventory keyword',
      beforeValue: 0.2,
      afterValue: 0.23,
      reason: 'high_efficiency_small_bid_up: orders7=1; acos7=0.0200; invDays=20; netProfit=0.1800; busyNetProfit=0.1200.',
      businessDate: '2026-05-20',
      sourceRunId: 'dry-1',
      dryRun: true,
    },
    {
      sku: 'MIX1',
      entityType: 'keyword',
      entityId: '4',
      entityName: 'mixed keyword',
      beforeValue: 0.2,
      afterValue: 0.23,
      reason: 'high_efficiency_small_bid_up: orders7=1; acos7=0.0200; invDays=80; netProfit=0.1800; busyNetProfit=0.1200.',
      businessDate: '2026-05-20',
      sourceRunId: 'dry-1',
      dryRun: true,
    },
    {
      sku: 'lowEff::keyword::9',
      entityType: 'keyword',
      entityId: '9',
      entityName: 'waste keyword',
      beforeValue: 0.6,
      afterValue: 0.5,
      reason: '[low_efficiency_pool:cooldown_override] waste cleanup',
      businessDate: '2026-05-20',
      sourceRunId: 'low_efficiency_2026-05-20_1',
      outcome: 'api_success',
      dryRun: false,
    },
  ]);
  writeJson(conflicts, {
    sameNameReverseDifferentEntity: [{ sku: 'MIX1' }],
  });

  const result = run({
    date: '2026-05-20',
    runId: 'dry-1',
    adjustmentFile: adjustments,
    conflictFile: conflicts,
    outFile,
    markdownFile: mdFile,
    nextActionsFile,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.nextActionsFile, nextActionsFile);
  assert.strictEqual(result.summary.total, 4);
  assert.strictEqual(result.summary.byDecision.executed, 1);
  assert.strictEqual(result.summary.byDecision.autonomous_recommendation, 1);
  assert.strictEqual(result.summary.byDecision.blocked, 1);
  assert.strictEqual(result.summary.byDecision.approval_needed, 1);
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(report.liveLowEfficiency.success, 1);
  assert.strictEqual(report.items.find(item => item.sku === 'REC1').decision, 'autonomous_recommendation');
  assert.ok(fs.readFileSync(mdFile, 'utf8').includes('autonomous_recommendation'));
  const nextActions = fs.readFileSync(nextActionsFile, 'utf8');
  assert.ok(nextActions.includes('## Account Gate'));
  assert.ok(nextActions.includes('## Already Landed'));
  assert.ok(nextActions.includes('## High-Priority Watch Pool'));
  assert.ok(nextActions.includes('## Blocked Pool'));
  assert.ok(nextActions.includes('## True Approval Needed'));
  assert.ok(nextActions.includes('DONE1'));
  assert.ok(nextActions.includes('REC1'));
  assert.ok(nextActions.includes('BLOCK1'));
  assert.ok(nextActions.includes('MIX1'));
  assert.ok(nextActions.includes('Low-efficiency live stop-loss landed: success 1'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-next-actions-write-'));
  const adjustments = path.join(tmpDir, 'adjustments.json');
  const conflicts = path.join(tmpDir, 'conflicts.json');
  const writeExecutionFile = path.join(tmpDir, 'write_execution.json');
  const approvalReviewFile = path.join(tmpDir, 'approval_review.json');
  const outFile = path.join(tmpDir, 'decisions.json');
  const mdFile = path.join(tmpDir, 'decisions.md');
  const nextActionsFile = path.join(tmpDir, 'next_actions.md');
  writeJson(adjustments, []);
  writeJson(conflicts, {});
  writeJson(writeExecutionFile, {
    plan: {
      alreadyLanded: [
        { sku: 'DONE2', entityType: 'sbKeyword', actionType: 'pause', key: 'DONE2::sbKeyword::pause::1' },
      ],
      dryRunBlocked: [
        {
          sku: 'BLOCK2',
          entityType: 'keyword',
          actionType: 'pause',
          blocks: ['dry_run_validation_error'],
          reason: 'entity id not found in context',
        },
      ],
      approvalNeeded: [
        {
          sku: 'APPROVE2',
          entityType: 'campaign',
          actionType: 'budget',
          mode: 'escalate',
          riskLevel: 'medium',
          blocks: ['unsupported_or_unclassified_action_surface'],
        },
      ],
    },
  });
  writeJson(approvalReviewFile, {
    summary: {
      total: 4,
      recommendApprove: 1,
      approvalNeeded: 1,
      hold: 1,
      blocked: 1,
    },
    items: [
      {
        sku: 'REC_APPROVE',
        entityType: 'campaign',
        actionType: 'budget',
        campaignName: 'profitable campaign',
        id: 'c1',
        current: 10,
        suggested: 12.5,
        decision: 'recommend_approve',
        reasonCode: 'controlled_profitable_budget_lift',
        operatorAction: 'approve one controlled lift',
        metrics: { orders: 10, acos: 0.12, profitRate: 0.25, invDays: 60, units7: 20 },
      },
      {
        sku: 'TRUE_APPROVE',
        entityType: 'keyword',
        actionType: 'bid',
        campaignName: 'strategic keyword',
        id: 'k1',
        current: 0.3,
        suggested: 0.35,
        decision: 'approval_needed',
        reasonCode: 'small_new_product_bid_test',
        operatorAction: 'confirm route before bid lift',
        metrics: { orders: 0, acos: null, profitRate: 0.2, invDays: 55, units7: 3 },
      },
      {
        sku: 'HOLD1',
        entityType: 'campaign',
        actionType: 'budget',
        campaignName: 'tight inventory campaign',
        id: 'c2',
        current: 10,
        suggested: 12.5,
        decision: 'hold',
        reasonCode: 'inventory_tight_before_budget_lift',
        operatorAction: 'hold budget lift',
        metrics: { orders: 9, acos: 0.1, profitRate: 0.24, invDays: 12, units7: 8 },
      },
      {
        sku: 'BLOCK_REVIEW',
        entityType: 'autoTarget',
        actionType: 'bid',
        campaignName: 'no unit auto',
        id: 'a1',
        current: 0.3,
        suggested: 0.35,
        decision: 'blocked',
        reasonCode: 'no_recent_units_and_inventory_not_deep',
        operatorAction: 'repair listing/traffic evidence first',
        metrics: { orders: 0, acos: null, profitRate: 0.2, invDays: 20, units7: 0 },
      },
    ],
  });

  const result = run({
    date: '2026-05-20',
    adjustmentFile: adjustments,
    conflictFile: conflicts,
    writeExecutionFile,
    kpiApprovalReviewFile: approvalReviewFile,
    outFile,
    markdownFile: mdFile,
    nextActionsFile,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.total, 0);
  assert.deepStrictEqual(result.summary.nextActions, {
    alreadyLanded: 1,
    watch: 0,
    blocked: 1,
    approvalNeeded: 1,
    recommendApprove: 1,
    hold: 1,
    approvalReviewBlocked: 1,
  });
  const nextActions = fs.readFileSync(nextActionsFile, 'utf8');
  assert.ok(nextActions.includes('DONE2'));
  assert.ok(nextActions.includes('BLOCK2'));
  assert.ok(nextActions.includes('## Recommended Approval'));
  assert.ok(nextActions.includes('REC_APPROVE'));
  assert.ok(nextActions.includes('## True Approval Needed'));
  assert.ok(nextActions.includes('TRUE_APPROVE'));
  assert.ok(!nextActions.includes('APPROVE2 | campaign'));
  assert.ok(nextActions.includes('## Hold'));
  assert.ok(nextActions.includes('HOLD1'));
  assert.ok(nextActions.includes('## Approval Review Blocked'));
  assert.ok(nextActions.includes('BLOCK_REVIEW'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-dryrun-business-date-'));
  const adjustments = path.join(tmpDir, 'adjustments_2026-05-20.json');
  const checkpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-21.json');
  const outFile = path.join(tmpDir, 'decisions.json');
  const mdFile = path.join(tmpDir, 'decisions.md');
  const nextActionsFile = path.join(tmpDir, 'next_actions.md');
  writeJson(adjustments, [
    {
      sku: 'REC_BIZ',
      entityType: 'keyword',
      entityId: 'biz-1',
      entityName: 'business date keyword',
      beforeValue: 0.2,
      afterValue: 0.23,
      reason: 'high_efficiency_standard_bid_up: orders7=3; acos7=0.0500; invDays=60; netProfit=0.1800; busyNetProfit=0.1200.',
      businessDate: '2026-05-20',
      sourceRunId: 'dry-business-date',
      runAt: '2026-05-21T00:10:00.000Z',
      dryRun: true,
    },
  ]);
  writeJson(checkpointFile, {
    date: '2026-05-21',
    businessDate: '2026-05-20',
    dataDate: '2026-05-19',
    kpiGate: { targetBusinessDate: '2026-05-20' },
  });

  const result = run({
    date: '2026-05-21',
    adjustmentFile: adjustments,
    kpiCheckpointFile: checkpointFile,
    outFile,
    markdownFile: mdFile,
    nextActionsFile,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.total, 1);
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(report.businessDate, '2026-05-20');
  assert.strictEqual(report.items[0].sku, 'REC_BIZ');
}

console.log('kpi_recovery_dryrun_decisions tests passed');
