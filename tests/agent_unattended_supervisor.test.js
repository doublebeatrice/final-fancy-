const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  runAgentUnattendedSupervisor,
} = require('../scripts/run_agent_unattended_supervisor');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-unattended-supervisor-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function lowRiskOptions(tmpDir, overrides = {}) {
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
  writeJson(snapshotFile, {
    businessDate: '2026-05-25',
    dataDate: '2026-05-25',
    productCards: [{ sku: 'LOW1' }],
    sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
  });
  writeJson(learningFile, {
    time: { businessDate: '2026-05-25', dataDate: '2026-05-25' },
    carryForward: { openQuestions: [] },
  });
  return {
    timeContext,
    today: '2026-05-25',
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    verifyDailyClosureArtifacts: () => ({ ok: true, errors: [] }),
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: { actions },
    actionSchemaFile,
    snapshotFile,
    learningFile,
    correctionDir: path.join(tmpDir, 'missing_corrections'),
    skuLessonDir: path.join(tmpDir, 'missing_sku_lessons'),
    generateSchedulerAudit: false,
    dryRunFeedback: {},
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    ...overrides,
  };
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_unattended_supervisor.js',
    '--prior-learning-memory',
    'data/agent/learning_memory_2026-05-24.json',
    '--execute',
    '--execute-if-ready',
  ]);
  assert.strictEqual(parsed.priorLearningMemoryFile, 'data/agent/learning_memory_2026-05-24.json');
  assert.strictEqual(parsed.execute, true);
  assert.strictEqual(parsed.executeIfReady, true);
  assert.strictEqual(parsed.generateSchedulerAudit, true);
  assert.strictEqual(parsed.generateReadinessAudit, true);
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_unattended_supervisor.js',
    '--skip-scheduler-audit',
    '--skip-readiness-audit',
    '--readiness-audit-out',
    'data/agent/readiness.json',
    '--readiness-audit-md-out',
    'data/agent/readiness.md',
    '--schedule-command',
    'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
  ]);
  assert.strictEqual(parsed.generateSchedulerAudit, false);
  assert.strictEqual(parsed.generateReadinessAudit, false);
  assert.strictEqual(parsed.readinessAuditFile, 'data/agent/readiness.json');
  assert.strictEqual(parsed.readinessAuditMarkdownFile, 'data/agent/readiness.md');
  assert.ok(parsed.scheduleCommand.includes('ops:agent:unattended-supervisor'));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:unattended-supervisor -- --prior-learning-memory data\\agent\\learning_memory_2026-05-24.json --today 2026-05-25 --out data\\agent\\unattended_supervisor_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:unattended-supervisor');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_unattended_supervisor.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-missing-prior-'));
  const calls = [];
  const report = runAgentUnattendedSupervisor(lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile: path.join(tmpDir, 'missing_learning_memory.json'),
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  }));
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.effective.executeIfReady, false);
  assert.ok(report.issues.some(item => item.id === 'prior_learning_memory_missing' && item.severity === 'blocker'));
  assert.ok(report.issues.some(item => item.id === 'live_execute_not_armed'));
  assert.strictEqual(report.closedLoop.unattendedExecuted, false);
  assert.ok(calls.every(call => !call.args.includes('--execute')));
  assert.ok(fs.existsSync(report.files.outFile));
  assert.ok(fs.existsSync(report.files.markdownFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-execute-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  const calls = [];
  const report = runAgentUnattendedSupervisor(lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  }));
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'executed');
  assert.strictEqual(report.priorLearning.exists, true);
  assert.strictEqual(report.effective.executeIfReady, true);
  assert.strictEqual(report.closedLoop.unattendedExecuted, true);
  assert.ok(calls.some(call => call.args.includes('--execute')));
  assert.ok(fs.existsSync(report.files.outFile));
  assert.ok(fs.existsSync(report.files.markdownFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-no-actions-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  const options = lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile,
    execFileSync: () => {
      throw new Error('no eligible action should not execute run_actions');
    },
  });
  writeJson(options.actionSchemaFile, []);
  options.ledger = { actions: [] };
  options.hub.learningContext = {
    applied: true,
    status: 'ready',
    sourceFile: priorLearningMemoryFile,
    blockers: 0,
    warnings: 0,
    taskCount: 0,
    mustReadBeforeDecision: ['prior-learning-fixture'],
    doNotApplyWhen: [],
    evidenceBeforeReuse: [],
  };
  const report = runAgentUnattendedSupervisor(options);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.mode, 'execute_if_ready');
  assert.strictEqual(report.effective.executeIfReady, true);
  assert.strictEqual(report.closedLoop.unattendedGateDecision, 'no_actions');
  assert.strictEqual(report.closedLoop.unattendedExecuted, false);
  assert.ok(!report.issues.some(item => item.id === 'unattended_execute_not_completed'));
  assert.ok(report.issues.some(item => item.id === 'unattended_live_no_actions' && item.severity === 'warning'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-readiness-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const correctionDir = path.join(tmpDir, 'corrections');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeJson(path.join(correctionDir, 'risk_as_inaction.json'), {
    lessonId: 'risk_as_inaction',
    status: 'active_correction',
    scope: { appliesTo: ['agent_operating_behavior', 'risk_as_inaction_excuse'] },
    lesson: 'Risk is routing, not refusal.',
    immediateControls: ['risk_level_must_not_be_used_as_do_nothing_reason'],
    doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
    requiredEvidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
  });
  writeJson(path.join(tmpDir, 'unattended_scheduler_audit_2026-05-25.json'), {
    ok: true,
    status: 'ready',
    summary: {
      blockers: 0,
      warnings: 0,
      heartbeatCount: 1,
      latestHeartbeatOk: true,
      consecutiveFailures: 0,
      scheduleUsesSupervisor: true,
      scheduleLiveExecuteArmed: true,
    },
  });
  writeJson(path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json'), {
    ok: true,
    status: 'ready',
    plan: {
      schedule: {
        completionAudit: {
          enabled: true,
          taskName: 'AdOpsAgentCompletionAudit',
        },
      },
    },
    installedTask: {
      state: 'Ready',
      triggerEnabled: true,
      actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
      nextRunTime: '05/26/2026 09:30:30',
      runLevel: 'Highest',
    },
    completionAuditTask: {
      ok: true,
      taskName: 'AdOpsAgentCompletionAudit',
      state: 'Ready',
      triggerEnabled: true,
      runLevel: 'Highest',
      actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
      nextRunTime: '05/26/2026 09:50:50',
      lastRunTime: '11/30/1999 00:00:00',
      lastTaskResult: '267011',
    },
  });
  const options = lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile,
    correctionDir,
    execFileSync: () => {
      throw new Error('no eligible action should not execute run_actions');
    },
  });
  writeJson(options.actionSchemaFile, []);
  options.ledger = { actions: [] };
  options.hub.learningContext = {
    applied: true,
    status: 'ready',
    sourceFile: priorLearningMemoryFile,
    blockers: 0,
    warnings: 0,
    taskCount: 0,
    mustReadBeforeDecision: ['prior-learning-fixture'],
    doNotApplyWhen: [],
    evidenceBeforeReuse: [],
  };
  const report = runAgentUnattendedSupervisor(options);
  assert.strictEqual(report.readinessAudit.generated, true);
  assert.strictEqual(report.readinessAudit.ok, true);
  assert.strictEqual(report.readinessAudit.status, 'ready_with_warnings');
  assert.ok(fs.existsSync(report.files.readinessAuditFile));
  assert.ok(fs.existsSync(report.files.readinessAuditMarkdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(report.files.outFile, 'utf8')).readinessAudit.generated, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-scheduler-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const correctionDir = path.join(tmpDir, 'corrections');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeJson(path.join(correctionDir, 'risk_as_inaction.json'), {
    lessonId: 'risk_as_inaction',
    status: 'active_correction',
    scope: { appliesTo: ['agent_operating_behavior', 'risk_as_inaction_excuse'] },
    lesson: 'Risk is routing, not refusal.',
    immediateControls: ['risk_level_must_not_be_used_as_do_nothing_reason'],
    doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
    requiredEvidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
  });
  let schedulerVerifyCalls = 0;
  const options = lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile,
    correctionDir,
    generateSchedulerAudit: true,
    execFileSync: (bin) => {
      if (bin.toLowerCase().includes('powershell')) {
        schedulerVerifyCalls += 1;
        const root = path.join(__dirname, '..');
        const isCompletion = schedulerVerifyCalls > 1;
        return JSON.stringify({
          ok: true,
          taskName: isCompletion ? 'AdOpsAgentCompletionAudit' : 'AdOpsAgentUnattendedSupervisor',
          taskPath: '\\',
          state: 'Ready',
          actionExecute: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
          actionArguments: isCompletion
            ? `/d /s /c "\"${process.execPath}\" \"${path.join(root, 'scripts', 'run_agent_completion_audit.js')}\" --out-dir ${tmpDir} --natural-schedule-tolerance-minutes 15 --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit >> \"${path.join(root, 'data', 'agent', 'unattended_completion_audit_task.log')}\" 2>&1"`
            : `/d /s /c "\"${process.execPath}\" \"${path.join(root, 'scripts', 'run_agent_unattended_supervisor.js')}\" --out-dir ${tmpDir} --execute --execute-if-ready >> \"${path.join(root, 'data', 'agent', 'unattended_supervisor_task.log')}\" 2>&1"`,
          actionWorkingDirectory: path.join(__dirname, '..'),
          triggerEnabled: true,
          runLevel: 'Highest',
          nextRunTime: isCompletion ? '05/26/2026 09:50:50' : '05/26/2026 09:30:30',
          lastRunTime: '11/30/1999 00:00:00',
          lastTaskResult: '267011',
        });
      }
      throw new Error('no eligible action should not execute run_actions');
    },
  });
  writeJson(options.actionSchemaFile, []);
  options.ledger = { actions: [] };
  options.hub.learningContext = {
    applied: true,
    status: 'ready',
    sourceFile: priorLearningMemoryFile,
    blockers: 0,
    warnings: 0,
    taskCount: 0,
    mustReadBeforeDecision: ['prior-learning-fixture'],
    doNotApplyWhen: [],
    evidenceBeforeReuse: [],
  };
  const report = runAgentUnattendedSupervisor(options);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.scheduleInstall.generated, true);
  assert.strictEqual(report.scheduleInstall.ok, true);
  assert.strictEqual(report.schedulerAudit.generated, true);
  assert.strictEqual(report.schedulerAudit.ok, true);
  assert.ok(report.schedulerAudit.issues.includes('scheduled_task_run_not_yet_observed'));
  assert.strictEqual(report.readinessAudit.generated, true);
  assert.strictEqual(report.readinessAudit.ok, true);
  assert.ok(report.readinessAudit.warningChecks.includes('scheduled_task_runtime_proof'));
  assert.ok(fs.existsSync(report.files.scheduleInstallFile));
  assert.ok(fs.existsSync(report.files.schedulerAuditFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-skip-readiness-'));
  const report = runAgentUnattendedSupervisor(lowRiskOptions(tmpDir, {
    generateReadinessAudit: false,
  }));
  assert.deepStrictEqual(report.readinessAudit, { generated: false, skipped: true });
  assert.strictEqual(JSON.parse(fs.readFileSync(report.files.outFile, 'utf8')).readinessAudit.skipped, true);
  assert.ok(!fs.existsSync(path.join(tmpDir, 'agent_readiness_audit_2026-05-25.json')));
}

console.log('agent_unattended_supervisor tests passed');
