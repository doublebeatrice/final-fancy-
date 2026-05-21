const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyDryRunFeedbackToPlan,
  buildWriteExecutionPlan,
  runAgentWriteExecution,
} = require('../scripts/run_agent_write_execution');

const timeContext = {
  runAt: '2026-05-19T12:30:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'agent-write-execution-test',
};

{
  const plan = buildWriteExecutionPlan({
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'bid',
        entityType: 'keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d ACOS high'],
      }, {
        sku: 'HIGH1',
        actionType: 'copy_edit',
        entityType: 'listing',
        approvedBy: 'codex',
        actionSource: ['codex'],
        impact: { top50Sku: true },
      }],
    },
    actionSchemaFile: 'data\\snapshots\\action_schema_2026-05-19_codex.json',
    snapshotFile: 'data\\snapshots\\latest_snapshot.json',
    timeContext,
  });

  assert.strictEqual(plan.summary.eligibleActions, 1);
  assert.strictEqual(plan.summary.approvalNeededActions, 1);
  assert.strictEqual(plan.summary.blockedActions, 0);
  assert.strictEqual(plan.canExecute, true);
  assert.ok(plan.approvalNeeded.some(item => item.mode === 'escalate'));
  assert.ok(plan.dryRunCommand.includes('--dry-run'));
  assert.ok(plan.executeCommand.includes('--execute'));
}

{
  const plan = buildWriteExecutionPlan({
    ledger: {
      actions: [{
        sku: 'REV1',
        actionType: 'review',
        entityType: 'campaign',
        authorization: {
          mode: 'escalate',
          riskLevel: 'medium',
          blocks: ['unsupported_or_unclassified_action_surface'],
          requirements: ['classify_surface_before_execution'],
        },
      }],
    },
    snapshotFile: 'data\\snapshots\\latest_snapshot.json',
    timeContext,
  });

  assert.strictEqual(plan.summary.readOnlyActions, 1);
  assert.strictEqual(plan.summary.approvalNeededActions, 0);
  assert.strictEqual(plan.approvalNeeded.length, 0);
}

{
  const plan = buildWriteExecutionPlan({
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'bid',
        entityType: 'keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d ACOS high'],
      }, {
        sku: 'HIGH1',
        actionType: 'copy_edit',
        entityType: 'listing',
        approvedBy: 'codex',
        actionSource: ['codex'],
        impact: { top50Sku: true },
      }],
    },
    snapshotFile: 'data\\snapshots\\latest_snapshot.json',
    timeContext,
  });

  assert.strictEqual(plan.summary.eligibleActions, 1);
  assert.strictEqual(plan.summary.approvalNeededActions, 1);
  assert.strictEqual(plan.summary.blockedActions, 1);
  assert.ok(plan.blockers.some(item => item.reason === 'missing_action_schema_file'));
}

{
  const plan = buildWriteExecutionPlan({
    ledger: {
      actions: [{
        sku: 'DONE1',
        actionType: 'pause',
        entityType: 'sbKeyword',
        id: 'sb-done',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['expired season no-order waste'],
      }, {
        sku: 'NEXT1',
        actionType: 'pause',
        entityType: 'sbKeyword',
        id: 'sb-next',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['expired season no-order waste'],
      }, {
        sku: 'GM3940',
        actionType: 'bid',
        entityType: 'autoTarget',
        id: 'auto-up',
        currentBid: 0.22,
        suggestedBid: 0.25,
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['new product low delivery'],
      }],
    },
    adjustments: [{
      sku: 'DONE1',
      actionType: 'pause',
      entityType: 'sbKeyword',
      entityId: 'sb-done',
      outcome: 'success',
      dryRun: false,
      businessDate: '2026-05-20',
      localDate: '2026-05-21',
      runAt: '2026-05-20T20:50:00.000Z',
    }],
    actionSchemaFile: 'data\\snapshots\\action_schema_2026-05-20_codex.json',
    snapshotFile: 'data\\snapshots\\latest_snapshot.json',
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      localDate: '2026-05-21',
      dataDate: '2026-05-19',
    },
    today: '2026-05-21',
  });

  assert.strictEqual(plan.summary.totalActions, 3);
  assert.strictEqual(plan.summary.landedActions, 1);
  assert.strictEqual(plan.summary.remainingActions, 2);
  assert.strictEqual(plan.summary.eligibleActions, 1);
  assert.strictEqual(plan.summary.approvalNeededActions, 1);
  assert.ok(plan.alreadyLanded.some(item => item.sku === 'DONE1'));
  assert.ok(!plan.eligible.some(item => item.sku === 'DONE1'));
}

{
  const plan = buildWriteExecutionPlan({
    ledger: {
      actions: [{
        sku: 'BADID',
        actionType: 'pause',
        entityType: 'keyword',
        id: 'missing-keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['expired no-order waste'],
      }, {
        sku: 'OUTSIDE',
        actionType: 'pause',
        entityType: 'keyword',
        id: 'outside-keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['expired no-order waste'],
      }, {
        sku: 'KEEP',
        actionType: 'pause',
        entityType: 'keyword',
        id: 'keep-keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['expired no-order waste'],
      }],
    },
    actionSchemaFile: 'data\\snapshots\\action_schema_2026-05-20_codex.json',
    snapshotFile: 'data\\snapshots\\latest_snapshot.json',
    timeContext,
  });

  const filtered = applyDryRunFeedbackToPlan(plan, {
    aiValidationErrors: [{ sku: 'BADID', entityType: 'keyword', id: 'missing-keyword', reason: 'entity id not found in context' }],
    outOfScopeSkuList: ['OUTSIDE'],
  });

  assert.strictEqual(filtered.summary.eligibleActions, 1);
  assert.strictEqual(filtered.summary.dryRunBlockedActions, 2);
  assert.strictEqual(filtered.summary.blockedActions, 2);
  assert.strictEqual(filtered.eligible[0].sku, 'KEEP');
  assert.ok(filtered.dryRunBlocked.some(item => item.blocks.includes('dry_run_validation_error')));
  assert.ok(filtered.dryRunBlocked.some(item => item.blocks.includes('out_of_operation_scope')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-write-execution-'));
  const outFile = path.join(tmpDir, 'write_execution.json');
  const calls = [];
  const result = runAgentWriteExecution({
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'pause',
        entityType: 'productAd',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d spend no orders'],
      }],
    },
    actionSchemaFile: path.join(tmpDir, 'action_schema.json'),
    snapshotFile: path.join(tmpDir, 'latest_snapshot.json'),
    outFile,
    timeContext,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[adjustment-log] appended 1 records';
    },
  });

  assert.strictEqual(result.mode, 'dry-run');
  assert.strictEqual(result.summary.eligibleActions, 1);
  assert.strictEqual(result.summary.executedStages, 1);
  assert.strictEqual(result.summary.failedStages, 0);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].args.includes('--dry-run'));
  assert.ok(!calls[0].args.includes('--execute'));
  assert.ok(fs.existsSync(outFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-write-execution-live-'));
  const result = runAgentWriteExecution({
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'budget',
        entityType: 'campaign',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['budget recover approved'],
      }],
    },
    actionSchemaFile: path.join(tmpDir, 'action_schema.json'),
    snapshotFile: path.join(tmpDir, 'latest_snapshot.json'),
    execute: true,
    timeContext,
    execFileSync: () => '',
  });

  assert.strictEqual(result.mode, 'execute');
  assert.strictEqual(result.summary.executedStages, 2);
  assert.ok(result.stages.some(stage => stage.name === 'dry_run' && stage.ok));
  assert.ok(result.stages.some(stage => stage.name === 'execute_verify_note' && stage.ok));
  assert.ok(result.results[0].ok);
  assert.ok(result.results[0].summary.includes('低风险写入链路已完成'));
}

console.log('agent_write_execution tests passed');
