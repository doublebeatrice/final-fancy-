const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildUnattendedGate,
  renderUnattendedGateMarkdown,
} = require('../src/agent_unattended_gate');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');
const { runAgentUnattendedGate } = require('../scripts/run_agent_unattended_gate');
const { runAgentWriteExecution } = require('../scripts/run_agent_write_execution');
const { runAgentClosedLoop } = require('../scripts/run_agent_closed_loop');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-unattended-gate-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function buildFixture(tmpDir, options = {}) {
  const actionSchemaFile = path.join(tmpDir, 'action_schema.json');
  const snapshotFile = path.join(tmpDir, 'latest_snapshot.json');
  const writeExecutionFile = path.join(tmpDir, 'write_execution_2026-05-25.json');
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-25.json');
  const autonomyAuditFile = path.join(tmpDir, 'autonomy_audit_2026-05-25.json');
  const learningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-25.json');
  const ledger = options.ledger || {
    actions: [{
      sku: 'LOW1',
      actionType: 'pause',
      entityType: 'productAd',
      id: 'pa-1',
      approvedBy: 'codex',
      actionSource: ['codex'],
      evidence: ['7d spend no orders'],
    }],
  };
  writeJson(actionSchemaFile, ledger.actions);
  writeJson(snapshotFile, { businessDate: '2026-05-25', productCards: [{ sku: 'LOW1' }] });
  const writeExecution = runAgentWriteExecution({
    ledger,
    actionSchemaFile,
    snapshotFile,
    outFile: writeExecutionFile,
    timeContext,
    dryRunFeedback: {},
    execFileSync: () => '[dry-run] ok',
  });
  writeJson(closedLoopFile, {
    closedLoop: true,
    businessDate: '2026-05-25',
    dataDate: '2026-05-25',
    summary: {
      artifactVerificationOk: true,
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      dailyClosureStatus: 'needs_recovery',
      kpiRecoveryNextActionsReady: true,
      snapshotStale: false,
      dataLagDays: 0,
    },
  });
  writeJson(autonomyAuditFile, options.autonomyAudit || {
    status: 'ready_with_warnings',
    summary: { blockerCount: 0, failCount: 0 },
    checks: [
      { id: 'write_execution_gate', status: 'warning', title: 'dry-run mode' },
      { id: 'daily_recovery_loop', status: 'warning', title: 'recovery mode' },
    ],
  });
  writeJson(learningMemoryFile, options.learningMemory || {
    status: 'active_watch',
    summary: { blockers: 0, warnings: 2 },
    nextRunBrief: { mustReadBeforeDecision: [] },
  });
  return { actionSchemaFile, snapshotFile, writeExecutionFile, closedLoopFile, autonomyAuditFile, learningMemoryFile, ledger, writeExecution, dryRunFeedback: {} };
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-ready-'));
  const fixture = buildFixture(tmpDir);
  const gate = buildUnattendedGate(fixture, timeContext);
  assert.strictEqual(gate.decision, 'execute_allowed');
  assert.strictEqual(gate.canAutoExecute, true);
  assert.strictEqual(gate.summary.eligibleActions, 1);
  assert.strictEqual(gate.issues.length, 0);
  assert.match(renderUnattendedGateMarkdown(gate), /execute_allowed/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-blocked-learning-'));
  const fixture = buildFixture(tmpDir, {
    learningMemory: {
      status: 'blocked_constraints',
      summary: { blockers: 1, warnings: 0 },
      nextRunBrief: { doNotApplyWhen: ['same rule has an unresolved correction audit'] },
    },
  });
  const gate = buildUnattendedGate(fixture, timeContext);
  assert.strictEqual(gate.decision, 'execute_blocked');
  assert.ok(gate.issues.some(issue => issue.id === 'learning_memory_has_blockers'));
  assert.ok(gate.tasks.some(task => task.kind === 'unattended_execute_blocker'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-blocked-approval-'));
  const fixture = buildFixture(tmpDir, {
    ledger: {
      actions: [{
        sku: 'HIGH1',
        actionType: 'copy_edit',
        entityType: 'listing',
        approvedBy: 'codex',
        actionSource: ['codex'],
        impact: { top50Sku: true },
      }],
    },
  });
  const gate = buildUnattendedGate(fixture, timeContext);
  assert.strictEqual(gate.decision, 'execute_blocked');
  assert.ok(gate.issues.some(issue => issue.id === 'approval_needed_actions_present'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-no-actions-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-25.json');
  const autonomyAuditFile = path.join(tmpDir, 'autonomy_audit_2026-05-25.json');
  const learningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-25.json');
  const writeExecutionFile = path.join(tmpDir, 'write_execution_2026-05-25.json');
  writeJson(closedLoopFile, {
    closedLoop: true,
    summary: {
      artifactVerificationOk: true,
      commandFailed: 0,
      writeFailed: 0,
      dailyClosureStatus: 'needs_recovery',
      kpiRecoveryNextActionsReady: true,
      snapshotStale: false,
      dataLagDays: 1,
    },
  });
  writeJson(autonomyAuditFile, {
    status: 'ready_with_warnings',
    summary: { blockerCount: 0, failCount: 0 },
    checks: [
      { id: 'data_freshness', status: 'warning', title: 'Data is usable with freshness warning', evidence: ['dataLagDays=1'] },
    ],
  });
  writeJson(learningMemoryFile, {
    status: 'active_watch',
    summary: { blockers: 0, warnings: 1 },
    nextRunBrief: { mustReadBeforeDecision: [] },
  });
  writeJson(writeExecutionFile, {
    mode: 'skipped',
    plan: {
      summary: { totalActions: 0, eligibleActions: 0, blockedActions: 0 },
    },
    summary: { failedStages: 0 },
  });
  const gate = buildUnattendedGate({
    closedLoopFile,
    autonomyAuditFile,
    learningMemoryFile,
    writeExecutionFile,
  }, timeContext);
  assert.strictEqual(gate.decision, 'no_actions');
  assert.strictEqual(gate.summary.blockers, 0);
  assert.ok(gate.warnings.some(issue => issue.id === 'autonomy_warning:data_freshness'));
  assert.ok(gate.warnings.some(issue => issue.id === 'no_eligible_actions'));
  assert.ok(!gate.issues.some(issue => issue.id === 'action_schema_missing'));
  assert.ok(!gate.issues.some(issue => issue.id === 'snapshot_missing'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-execute-'));
  const fixture = buildFixture(tmpDir);
  const outFile = path.join(tmpDir, 'unattended_gate.json');
  const markdownFile = path.join(tmpDir, 'unattended_gate.md');
  const executionOutFile = path.join(tmpDir, 'write_execution_execute.json');
  const calls = [];
  const gate = runAgentUnattendedGate({
    ...fixture,
    outFile,
    markdownFile,
    executionOutFile,
    executeIfReady: true,
    timeContext,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  });
  assert.strictEqual(gate.decision, 'execute_allowed');
  assert.ok(gate.execution);
  assert.strictEqual(gate.execution.mode, 'execute');
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[1].args.includes('--execute'));
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:unattended-gate -- --closed-loop data\\agent\\agent_closed_loop_2026-05-25.json --autonomy-audit data\\agent\\autonomy_audit_2026-05-25.json --learning-memory data\\agent\\learning_memory_2026-05-25.json --write-execution data\\agent\\write_execution_2026-05-25.json --today 2026-05-25 --out data\\agent\\unattended_gate_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:unattended-gate');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_unattended_gate.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-closed-loop-'));
  const result = runAgentClosedLoop({
    timeContext,
    outDir: tmpDir,
    generateDashboard: false,
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'pause',
        entityType: 'productAd',
        id: 'pa-1',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d spend no orders'],
      }],
    },
    actionSchemaFile: path.join(tmpDir, 'action_schema.json'),
    snapshotFile: path.join(tmpDir, 'latest_snapshot.json'),
    dryRunFeedback: {},
    snapshot: {
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      productCards: [{ sku: 'LOW1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: () => '[run_actions] ok',
  });
  assert.ok(result.files.unattendedGateFile.endsWith('unattended_gate_2026-05-25.json'));
  assert.ok(fs.existsSync(result.files.unattendedGateFile));
  assert.ok(result.summary.unattendedGateDecision);
  assert.strictEqual(typeof result.summary.unattendedExecuteAllowed, 'boolean');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-closed-loop-execute-request-'));
  const actionSchemaFile = path.join(tmpDir, 'action_schema.json');
  const snapshotFile = path.join(tmpDir, 'latest_snapshot.json');
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const actions = [{
    sku: 'LOW1',
    actionType: 'pause',
    entityType: 'productAd',
    id: 'pa-1',
    approvedBy: 'codex',
    actionSource: ['codex'],
    evidence: ['7d spend no orders'],
  }];
  writeJson(actionSchemaFile, actions);
  writeJson(snapshotFile, { businessDate: '2026-05-25', productCards: [{ sku: 'LOW1' }] });
  writeJson(learningFile, { time: { businessDate: '2026-05-25', dataDate: '2026-05-25' }, carryForward: { openQuestions: [] } });
  const calls = [];
  const result = runAgentClosedLoop({
    timeContext,
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    verifyDailyClosureArtifacts: () => ({ ok: true, errors: [] }),
    execute: true,
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: { actions },
    actionSchemaFile,
    snapshotFile,
    learningFile,
    dryRunFeedback: {},
    snapshot: {
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      productCards: [{ sku: 'LOW1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  });
  assert.strictEqual(result.summary.executeRequested, true);
  assert.strictEqual(result.summary.executeIfReady, false);
  assert.strictEqual(result.summary.unattendedExecuteAllowed, true);
  assert.strictEqual(result.summary.unattendedExecuted, false);
  assert.ok(calls.length >= 1);
  assert.ok(calls.every(call => !call.args.includes('--execute')), 'closed-loop --execute must not bypass unattended gate');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-closed-loop-execute-if-ready-without-execute-'));
  const actionSchemaFile = path.join(tmpDir, 'action_schema.json');
  const snapshotFile = path.join(tmpDir, 'latest_snapshot.json');
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const actions = [{
    sku: 'LOW1',
    actionType: 'pause',
    entityType: 'productAd',
    id: 'pa-1',
    approvedBy: 'codex',
    actionSource: ['codex'],
    evidence: ['7d spend no orders'],
  }];
  writeJson(actionSchemaFile, actions);
  writeJson(snapshotFile, { businessDate: '2026-05-25', productCards: [{ sku: 'LOW1' }] });
  writeJson(learningFile, { time: { businessDate: '2026-05-25', dataDate: '2026-05-25' }, carryForward: { openQuestions: [] } });
  const calls = [];
  const result = runAgentClosedLoop({
    timeContext,
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    verifyDailyClosureArtifacts: () => ({ ok: true, errors: [] }),
    executeIfReady: true,
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: { actions },
    actionSchemaFile,
    snapshotFile,
    learningFile,
    dryRunFeedback: {},
    snapshot: {
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      productCards: [{ sku: 'LOW1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  });
  assert.strictEqual(result.summary.executeRequested, false);
  assert.strictEqual(result.summary.executeIfReadyRequested, true);
  assert.strictEqual(result.summary.executeIfReady, false);
  assert.strictEqual(result.summary.unattendedExecuteAllowed, true);
  assert.strictEqual(result.summary.unattendedExecuted, false);
  assert.ok(calls.every(call => !call.args.includes('--execute')), 'closed-loop --execute-if-ready alone must not execute');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-closed-loop-execute-if-ready-'));
  const actionSchemaFile = path.join(tmpDir, 'action_schema.json');
  const snapshotFile = path.join(tmpDir, 'latest_snapshot.json');
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const executionOutFile = path.join(tmpDir, 'unattended_write_execution.json');
  const actions = [{
    sku: 'LOW1',
    actionType: 'pause',
    entityType: 'productAd',
    id: 'pa-1',
    approvedBy: 'codex',
    actionSource: ['codex'],
    evidence: ['7d spend no orders'],
  }];
  writeJson(actionSchemaFile, actions);
  writeJson(snapshotFile, { businessDate: '2026-05-25', productCards: [{ sku: 'LOW1' }] });
  writeJson(learningFile, { time: { businessDate: '2026-05-25', dataDate: '2026-05-25' }, carryForward: { openQuestions: [] } });
  const calls = [];
  const result = runAgentClosedLoop({
    timeContext,
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    verifyDailyClosureArtifacts: () => ({ ok: true, errors: [] }),
    execute: true,
    executeIfReady: true,
    unattendedExecutionOutFile: executionOutFile,
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: { actions },
    actionSchemaFile,
    snapshotFile,
    learningFile,
    dryRunFeedback: {},
    snapshot: {
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      productCards: [{ sku: 'LOW1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  });
  assert.strictEqual(result.summary.executeRequested, true);
  assert.strictEqual(result.summary.executeIfReady, true);
  assert.strictEqual(result.summary.unattendedExecuted, true);
  assert.ok(calls.some(call => call.args.includes('--execute')));
  assert.ok(fs.existsSync(executionOutFile));
}

console.log('agent_unattended_gate tests passed');
