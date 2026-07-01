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

function writeRiskAsInactionLesson(correctionDir) {
  writeJson(path.join(correctionDir, 'risk_as_inaction.json'), {
    lessonId: 'risk_as_inaction',
    status: 'active_correction',
    scope: { appliesTo: ['agent_operating_behavior', 'risk_as_inaction_excuse'] },
    lesson: 'Risk is routing, not refusal.',
    immediateControls: ['risk_level_must_not_be_used_as_do_nothing_reason'],
    doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
    requiredEvidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
  });
}

function writeCoverageSufficiencyLesson(correctionDir) {
  writeJson(path.join(correctionDir, 'coverage_sufficiency.json'), {
    lessonId: 'coverage_sufficiency',
    status: 'active_correction',
    surface: 'coverage_sufficiency',
    scope: { appliesTo: ['coverage_sufficiency', 'coverage_underreach'] },
    lesson: 'Coverage sufficiency must be answered before action landing details.',
    doNotApplyWhen: ['coverage sufficiency has not been answered before action landing details'],
    requiredEvidenceBeforeReuse: ['coverage_ratio'],
  });
}

function writeCoverageSkuLesson(dir) {
  writeJson(path.join(dir, 'coverage_sufficiency_sku_lesson.json'), {
    id: 'coverage_sufficiency_sku_lesson',
    status: 'active',
    lesson: 'Coverage sufficiency must be answered before action landing details.',
    doNotApplyWhen: ['coverage sufficiency has not been answered before action landing details'],
    transferableTo: ['coverage_ratio'],
  });
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
    generateDashboard: false,
    closureVerification: { ok: true, errors: [] },
    verifyDailyClosureArtifacts: () => ({ ok: true, errors: [] }),
    hub: { businessDate: '2026-05-25', dataDate: '2026-05-25', summary: { total: 0 }, todayQueue: [] },
    ledger: { actions },
    actionSchemaFile,
    snapshotFile,
    learningFile,
    correctionDir: path.join(tmpDir, 'missing_corrections'),
    skuLessonDir: path.join(tmpDir, 'missing_sku_lessons'),
    generateSchedulerAudit: false,
    generateBossDailyPaper: false,
    disableTrendAnomalyCheck: true,
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
    '--command-timeout-ms',
    '45000',
  ]);
  assert.strictEqual(parsed.priorLearningMemoryFile, 'data/agent/learning_memory_2026-05-24.json');
  assert.strictEqual(parsed.execute, true);
  assert.strictEqual(parsed.executeIfReady, true);
  assert.strictEqual(parsed.commandTimeoutMs, 45000);
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
    generateDashboard: false,
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
    generateDashboard: false,
    priorLearningMemoryFile,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      return '[run_actions] ok';
    },
  }));
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.priorLearning.exists, true);
  assert.strictEqual(report.effective.executeIfReady, true);
  assert.strictEqual(report.closedLoop.unattendedExecuted, false);
  assert.ok(report.issues.some(item => item.id === 'unattended_gate_has_blockers'));
  assert.ok(!calls.some(call => call.args.includes('--execute')));
  assert.ok(fs.existsSync(report.files.outFile));
  assert.ok(fs.existsSync(report.files.markdownFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-no-actions-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const skuLessonDir = path.join(tmpDir, 'sku_lessons');
  writeCoverageSkuLesson(skuLessonDir);
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
    skuLessonDir,
    generateReadinessAudit: false,
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
  const skuLessonDir = path.join(tmpDir, 'sku_lessons');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeRiskAsInactionLesson(correctionDir);
  writeCoverageSkuLesson(skuLessonDir);
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
      actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
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
    skuLessonDir,
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
  assert.strictEqual(report.readinessAudit.summary.coverageSufficiencyReady, true);
  assert.ok(fs.existsSync(report.files.readinessAuditFile));
  assert.ok(fs.existsSync(report.files.readinessAuditMarkdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(report.files.outFile, 'utf8')).readinessAudit.generated, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-coverage-readiness-fail-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const correctionDir = path.join(tmpDir, 'corrections');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeRiskAsInactionLesson(correctionDir);
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
      actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
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
  assert.strictEqual(report.readinessAudit.ok, false);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.readinessAudit.summary.coverageSufficiencyReady, false);
  assert.ok(report.readinessAudit.failedChecks.includes('coverage_sufficiency_correction_memory'));
  assert.ok(report.issues.some(item => item.id === 'readiness_audit_failed'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-scheduler-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const correctionDir = path.join(tmpDir, 'corrections');
  const skuLessonDir = path.join(tmpDir, 'sku_lessons');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeRiskAsInactionLesson(correctionDir);
  writeCoverageSkuLesson(skuLessonDir);
  let schedulerVerifyCalls = 0;
  const options = lowRiskOptions(tmpDir, {
    execute: true,
    executeIfReady: true,
    priorLearningMemoryFile,
    correctionDir,
    skuLessonDir,
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
          actionExecute: 'powershell.exe',
          actionArguments: isCompletion
            ? `-NoProfile -ExecutionPolicy Bypass -Command "$env:AGENT_TODAY=(Get-Date).ToString('yyyy-MM-dd'); & '${process.execPath}' '${path.join(root, 'scripts', 'run_agent_completion_audit.js')}' '--out-dir' '${tmpDir}' '--natural-schedule-tolerance-minutes' '15' '--goal-final' '--scheduled-task-invocation' '--scheduled-task-name' 'AdOpsAgentCompletionAudit' >> '${path.join(root, 'data', 'agent', 'unattended_completion_audit_task.log')}' 2>&1"`
            : `-NoProfile -ExecutionPolicy Bypass -Command "$env:AGENT_TODAY=(Get-Date).ToString('yyyy-MM-dd'); & '${process.execPath}' '${path.join(root, 'scripts', 'run_agent_unattended_supervisor.js')}' '--out-dir' '${tmpDir}' '--execute' '--execute-if-ready' '--command-timeout-ms' '30000' >> '${path.join(root, 'data', 'agent', 'unattended_supervisor_task.log')}' 2>&1"`,
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

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-heartbeat-first-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  let earlyHeartbeat = null;
  const report = runAgentUnattendedSupervisor({
    timeContext,
    today: '2026-05-25',
    outDir: tmpDir,
    priorLearningMemoryFile,
    generateSchedulerAudit: false,
    generateReadinessAudit: false,
    runClosedLoop: () => {
      earlyHeartbeat = JSON.parse(fs.readFileSync(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), 'utf8'));
      return {
        businessDate: '2026-05-25',
        dataDate: '2026-05-25',
        summary: {
          closedLoop: true,
          dailyClosureStatus: 'complete',
          commandFailed: 0,
          writeFailed: 0,
          writeBlocked: 0,
          artifactVerificationOk: true,
          autonomyStatus: 'ready',
          autonomyBlockerCount: 0,
          learningMemoryReady: true,
          learningMemoryStatus: 'ready',
          unattendedGateDecision: 'no_actions',
          unattendedExecuted: false,
        },
        files: {},
      };
    },
  });
  assert.strictEqual(earlyHeartbeat.status, 'in_progress');
  assert.strictEqual(earlyHeartbeat.stage, 'closed_loop');
  assert.strictEqual(earlyHeartbeat.ok, false);
  assert.strictEqual(report.status, 'complete');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-boss-paper-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  const paperFile = path.join(tmpDir, 'daily_paper_2026-05-25.md');
  const jsonFile = path.join(tmpDir, 'boss_daily_paper_2026-05-25.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  const report = runAgentUnattendedSupervisor({
    timeContext,
    today: '2026-05-25',
    outDir: tmpDir,
    priorLearningMemoryFile,
    generateSchedulerAudit: false,
    generateReadinessAudit: false,
    generateBossDailyPaper: true,
    runClosedLoop: () => ({
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      summary: {
        closedLoop: true,
        dailyClosureStatus: 'complete',
        commandFailed: 0,
        writeFailed: 0,
        writeBlocked: 0,
        artifactVerificationOk: true,
        autonomyStatus: 'ready',
        autonomyBlockerCount: 0,
        learningMemoryReady: true,
        learningMemoryStatus: 'ready',
        unattendedGateDecision: 'no_actions',
        unattendedExecuted: false,
      },
      files: {},
    }),
    runBossDailyPaper: ({ today, agentDir }) => {
      assert.strictEqual(today, '2026-05-25');
      assert.strictEqual(agentDir, tmpDir);
      fs.writeFileSync(paperFile, '# daily paper 2026-05-25\n\n## 5. \\u4efb\\u52a1\\u8ddf\\u8fdb\\u88c5\\u7f6e\n- status: complete\n', 'utf8');
      writeJson(jsonFile, {
        today,
        files: { paperFile, jsonFile },
        verification: { status: 'pass' },
        taskFollowup: { status: 'complete' },
      });
      return {
        today,
        files: { paperFile, jsonFile },
        verification: { status: 'pass' },
        taskFollowup: { status: 'complete' },
      };
    },
  });
  assert.strictEqual(report.bossDailyPaper.generated, true);
  assert.strictEqual(report.bossDailyPaper.status, 'pass');
  assert.strictEqual(report.bossDailyPaper.taskFollowupStatus, 'complete');
  assert.strictEqual(report.files.bossDailyPaperFile, paperFile);
  assert.strictEqual(report.files.bossDailyPaperJsonFile, jsonFile);
  assert.ok(fs.existsSync(report.files.bossDailyPaperFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-reuse-closed-loop-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  writeJson(path.join(tmpDir, 'agent_closed_loop_2026-05-25.json'), {
    businessDate: '2026-05-25',
    dataDate: '2026-05-25',
    summary: {
      closedLoop: true,
      dailyClosureStatus: 'complete',
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      artifactVerificationOk: true,
      autonomyStatus: 'ready',
      autonomyBlockerCount: 0,
      learningMemoryReady: true,
      learningMemoryStatus: 'ready',
      priorLearningConstraintTasks: 7,
      priorLearningBlockers: 7,
      priorLearningWarnings: 7,
      unattendedGateDecision: 'no_actions',
      unattendedExecuted: false,
    },
    files: {},
  });
  let called = false;
  const report = runAgentUnattendedSupervisor({
    timeContext,
    today: '2026-05-25',
    outDir: tmpDir,
    priorLearningMemoryFile,
    generateBossDailyPaper: false,
    generateSchedulerAudit: false,
    generateReadinessAudit: false,
    runClosedLoop: undefined,
  });
  assert.strictEqual(called, false);
  assert.strictEqual(report.closedLoop.reused, true);
  assert.strictEqual(report.closedLoop.priorLearningConstraintTasks, 0);
  assert.strictEqual(report.closedLoop.priorLearningBlockers, 0);
  assert.strictEqual(report.closedLoop.priorLearningWarnings, 0);
  assert.strictEqual(report.status, 'complete');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-supervisor-next-prompt-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-24.json');
  writeJson(priorLearningMemoryFile, {
    status: 'ready',
    summary: { constraints: 0, blockers: 0, warnings: 0 },
    nextRunBrief: { mustReadBeforeDecision: [] },
    tasks: [],
  });
  const report = runAgentUnattendedSupervisor({
    timeContext,
    today: '2026-05-25',
    outDir: tmpDir,
    priorLearningMemoryFile,
    execute: true,
    executeIfReady: true,
    generateSchedulerAudit: false,
    generateReadinessAudit: false,
    runClosedLoop: () => ({
      businessDate: '2026-05-25',
      dataDate: '2026-05-25',
      summary: {
        closedLoop: false,
        dailyClosureStatus: 'needs_attention',
        commandFailed: 2,
        writeFailed: 0,
        writeBlocked: 0,
        artifactVerificationOk: false,
        autonomyStatus: 'not_ready',
        autonomyBlockerCount: 1,
        learningMemoryReady: true,
        learningMemoryStatus: 'blocked_constraints',
        priorLearningBlockers: 1,
        unattendedGateDecision: 'execute_blocked',
        unattendedGateBlockerCount: 1,
        unattendedExecuted: false,
      },
      files: {
        closedLoopFile: path.join(tmpDir, 'agent_closed_loop_2026-05-25.json'),
      },
    }),
  });
  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.files.nextAgentPromptFile);
  assert.ok(fs.existsSync(report.files.nextAgentPromptFile));
  const prompt = fs.readFileSync(report.files.nextAgentPromptFile, 'utf8');
  assert.ok(prompt.includes('closed_loop_stage_failed'));
  assert.ok(prompt.includes('npm run ops:agent:unattended-supervisor'));
}

console.log('agent_unattended_supervisor tests passed');
