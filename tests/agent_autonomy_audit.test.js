const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAutonomyAudit,
  renderAutonomyAuditMarkdown,
} = require('../src/agent_autonomy_audit');
const { parseExternalRequest } = require('../src/agent_external_inbox');
const { classifyWorkItem } = require('../src/agent_operating_hub');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');
const { runAgentAutonomyAudit } = require('../scripts/run_agent_autonomy_audit');
const { runAgentClosedLoop } = require('../scripts/run_agent_closed_loop');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-autonomy-audit-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function buildFixture(tmpDir, overrides = {}) {
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-25.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-25.md');
  const commandResultsFile = path.join(tmpDir, 'command_results_2026-05-25.json');
  const writeExecutionFile = path.join(tmpDir, 'write_execution_2026-05-25.json');
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const learningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-25.json');
  const writeMode = overrides.writeMode || 'execute';
  writeJson(commandResultsFile, { summary: { failed: 0, executed: 1 }, results: [] });
  writeJson(writeExecutionFile, { mode: writeMode, summary: { failedStages: 0, blockedActions: 0, dryRunBlockedActions: 0 } });
  fs.writeFileSync(handoffFile, '# handoff\n', 'utf8');
  if (overrides.learning !== false) {
    writeJson(learningFile, { businessDate: '2026-05-25', decisions: { carryForward: [] } });
  }
  if (overrides.learningMemory !== false) {
    writeJson(learningMemoryFile, { businessDate: '2026-05-25', nextRunBrief: { mustReadBeforeDecision: [learningFile] } });
  }
  writeJson(closedLoopFile, {
    closedLoop: true,
    businessDate: '2026-05-25',
    dataDate: '2026-05-25',
    summary: {
      artifactVerificationOk: true,
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      writeMode,
      dataFreshnessStatus: 'same_day',
      dataLagDays: 0,
      snapshotStale: false,
      dailyClosureStatus: overrides.dailyClosureStatus || 'needs_recovery',
      kpiRecoveryNextActionsReady: true,
      kpiStatus: 'off_track',
    },
    files: {
      handoffOutFile: handoffFile,
      commandResultsFile,
      writeExecutionFile,
    },
  });
  return { closedLoopFile, handoffFile, commandResultsFile, writeExecutionFile, learningFile, learningMemoryFile };
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-autonomy-ready-'));
  const fixture = buildFixture(tmpDir);
  const audit = buildAutonomyAudit({
    ...fixture,
    today: '2026-05-25',
  }, timeContext);
  assert.strictEqual(audit.status, 'ready_with_recovery');
  assert.strictEqual(audit.summary.autonomousReady, true);
  assert.ok(audit.checks.some(check => check.id === 'daily_recovery_loop' && check.status === 'warning'));
  assert.ok(audit.checks.some(check => check.id === 'long_term_learning' && check.status === 'pass'));
  assert.ok(audit.tasks.some(task => task.subject.entityId === 'daily_recovery_loop'));
  assert.match(renderAutonomyAuditMarkdown(audit), /ready_with_recovery/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-autonomy-missing-learning-'));
  const fixture = buildFixture(tmpDir, { writeMode: 'dry-run', learning: false, learningMemory: false });
  const audit = buildAutonomyAudit({
    ...fixture,
    today: '2026-05-25',
  }, timeContext);
  assert.strictEqual(audit.status, 'not_ready');
  assert.strictEqual(audit.summary.autonomousReady, false);
  assert.ok(audit.checks.some(check => check.id === 'write_execution_gate' && check.status === 'warning'));
  assert.ok(audit.checks.some(check => check.id === 'long_term_learning' && check.status === 'fail'));
  assert.ok(audit.tasks.some(task => task.subject.entityId === 'long_term_learning' && task.priority === 'P0'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-autonomy-run-'));
  const fixture = buildFixture(tmpDir);
  const outFile = path.join(tmpDir, 'autonomy_audit.json');
  const markdownFile = path.join(tmpDir, 'autonomy_audit.md');
  const audit = runAgentAutonomyAudit({
    ...fixture,
    outFile,
    markdownFile,
    timeContext,
  });
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')).files.outFile, outFile);
  assert.strictEqual(audit.files.markdownFile, markdownFile);
}

{
  const task = parseExternalRequest('现在 agent 化够不够自驱，能不能无人值守', timeContext);
  assert.strictEqual(task.kind, 'agent_autonomy_review');
  assert.ok(task.evidenceRequirements.includes('agent_autonomy_audit'));
  const classified = classifyWorkItem(task, { today: '2026-05-25' });
  assert.ok(classified.requiredCapabilities.includes('agent::autonomy::audit::read'));
  assert.ok(classified.executionPlan.commands.some(command => command.command.includes('ops:agent:autonomy-audit')));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:autonomy-audit -- --closed-loop data\\agent\\agent_closed_loop_2026-05-25.json --today 2026-05-25 --out data\\agent\\autonomy_audit_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:autonomy-audit');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_autonomy_audit.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-autonomy-closed-loop-'));
  const result = runAgentClosedLoop({
    disableTrendAnomalyCheck: true,
    timeContext,
    outDir: tmpDir,
    generateDashboard: false,
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    snapshot: {
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      productCards: [{ sku: 'AUTO1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: () => '',
  });
  assert.ok(result.files.autonomyAuditFile.endsWith('autonomy_audit_2026-05-25.json'));
  assert.ok(fs.existsSync(result.files.autonomyAuditFile));
  assert.ok(result.files.learningMemoryFile.endsWith('learning_memory_2026-05-25.json'));
  assert.ok(fs.existsSync(result.files.learningMemoryFile));
  assert.ok(result.summary.autonomyStatus);
  assert.strictEqual(result.summary.learningMemoryReady, true);
  assert.strictEqual(result.autonomyAudit.summary.dailyClosureStatus, result.summary.dailyClosureStatus);
}

console.log('agent_autonomy_audit tests passed');
