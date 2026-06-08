const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildDefaultScheduleCommand,
  parseArgs,
  runAgentCompletionAudit,
} = require('../scripts/run_agent_completion_audit');
const { buildUnattendedSchedulePlan } = require('../scripts/run_agent_unattended_schedule_plan');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T10:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-completion-audit-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function seedCompletionFiles(tmpDir, overrides = {}) {
  writeJson(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: overrides.heartbeatGeneratedAt || '2026-05-25T02:00:00.000Z',
    businessDate: '2026-05-25',
    status: 'needs_recovery',
    ok: true,
    mode: 'execute_if_ready',
    requested: { execute: true, executeIfReady: true },
    effective: { execute: true, executeIfReady: true },
    priorLearning: { required: true, exists: true, file: 'data/agent/learning_memory_2026-05-24.json' },
    closedLoop: {
      closedLoop: true,
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      artifactVerificationOk: true,
      unattendedGateDecision: 'no_actions',
      unattendedGateBlockerCount: 0,
      priorLearningMemoryApplied: true,
      priorLearningConstraintTasks: 2,
      priorLearningBlockers: 0,
      priorLearningWarnings: 0,
    },
  });
  writeJson(path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json'), {
    ok: true,
    status: 'ready',
    plan: {
      schedule: {
        startTime: '09:30',
        completionAudit: {
          enabled: true,
          taskName: 'AdOpsAgentCompletionAudit',
          startTime: '09:50',
        },
      },
    },
    installedTask: {
      ok: true,
      taskName: 'AdOpsAgentUnattendedSupervisor',
      state: 'Ready',
      actionExecute: 'C:\\Windows\\system32\\cmd.exe',
      actionArguments: 'run_agent_unattended_supervisor.js --out-dir data\\agent --execute --execute-if-ready',
      actionWorkingDirectory: 'D:\\ad-ops-workbench',
      triggerEnabled: true,
      runLevel: 'Highest',
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: overrides.lastRunTime || '05/25/2026 09:30:30',
      lastTaskResult: overrides.lastTaskResult || '0',
    },
    completionAuditTask: {
      ok: true,
      taskName: 'AdOpsAgentCompletionAudit',
      state: 'Ready',
      actionExecute: 'C:\\Windows\\system32\\cmd.exe',
      actionArguments: 'run_agent_completion_audit.js --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
      actionWorkingDirectory: 'D:\\ad-ops-workbench',
      triggerEnabled: true,
      runLevel: 'Highest',
      nextRunTime: '05/26/2026 09:50:50',
      lastRunTime: overrides.completionAuditLastRunTime || '05/25/2026 09:50:50',
      lastTaskResult: overrides.completionAuditLastTaskResult || '0',
    },
  });
  writeJson(path.join(tmpDir, 'unattended_gate_2026-05-25.json'), {
    decision: 'no_actions',
    summary: { blockers: 0, eligibleActions: 0 },
  });
  writeJson(path.join(tmpDir, 'learning_memory_2026-05-25.json'), {
    status: 'active_watch',
    summary: { constraints: 4, blockers: 0, warnings: 1, corrections: 1 },
    nextRunBrief: {
      mustReadBeforeDecision: ['data/learning/daily_learning_2026-05-25.json'],
      doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
      evidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
    },
  });
  writeJson(path.join(tmpDir, 'correction_risk_2026-05-25.json'), {
    correction: { signals: ['risk_as_inaction_excuse'] },
    audit: {
      severity: 'high',
      immediateControls: ['risk_level_must_not_be_used_as_do_nothing_reason'],
    },
    tasks: [{ kind: 'execution_path_repair' }],
  });
  writeJson(path.join(tmpDir, 'agent_closed_loop_2026-05-25.json'), {
    summary: { closedLoop: true },
  });
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_completion_audit.js',
    '--today',
    '2026-05-25',
    '--out-dir',
    'data\\agent',
  ]);
  assert.strictEqual(parsed.today, '2026-05-25');
  assert.strictEqual(parsed.agentDir, 'data\\agent');
  assert.strictEqual(parsed.waitForSupervisor, true);
}

{
  assert.ok(buildDefaultScheduleCommand('data\\agent').includes('ops:agent:unattended-supervisor'));
  const parsed = parseNpmRunCommand('npm run ops:agent:completion-audit -- --today 2026-05-25 --out-dir data\\agent');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:completion-audit');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_completion_audit.js')));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:completion-audit -- --today 2026-05-25 --goal-final --require-goal-final-complete');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:completion-audit');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-pass-'));
  seedCompletionFiles(tmpDir);
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'complete_ready');
  assert.strictEqual(report.summary.schedulerOk, true);
  assert.strictEqual(report.summary.readinessOk, true);
  assert.strictEqual(report.summary.completionAuditScheduleReady, true);
  assert.strictEqual(report.summary.completionAuditTaskRuntimeReady, true);
  assert.strictEqual(report.summary.scheduledTaskInvocationOk, true);
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, true);
  assert.strictEqual(report.summary.goalAuditOk, true);
  assert.strictEqual(report.goalAudit.ok, true);
  assert.match(fs.readFileSync(path.join(tmpDir, 'agent_completion_audit_2026-05-25.md'), 'utf8'), /Completion audit schedule ready: true/);
  assert.match(fs.readFileSync(path.join(tmpDir, 'agent_completion_audit_2026-05-25.md'), 'utf8'), /Completion audit task runtime ready: true/);
  assert.match(fs.readFileSync(path.join(tmpDir, 'agent_completion_audit_2026-05-25.md'), 'utf8'), /Scheduled task invocation: true/);
  assert.strictEqual(report.localDate, '');
  assert.ok(fs.existsSync(path.join(tmpDir, 'agent_completion_audit_2026-05-25.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'agent_goal_audit_2026-05-25.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'agent_readiness_completion_audit_2026-05-25.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'unattended_scheduler_completion_audit_2026-05-25.json')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-goal-final-'));
  seedCompletionFiles(tmpDir);
  const report = runAgentCompletionAudit({
    timeContext: { ...timeContext, localDate: '2026-05-25' },
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
    generateGoalFinal: true,
    bossPaperRunner: () => ({
      verification: { status: 'pass' },
      guard: { status: 'pass' },
      files: {
        paperFile: path.join(tmpDir, '每日结果纸_2026-05-25.md'),
        jsonFile: path.join(tmpDir, 'boss_daily_paper_2026-05-25.json'),
      },
    }),
    goalFinalAuditRunner: () => ({
      ok: false,
      status: 'pending',
      summary: { currentStreak: 1, requiredBusinessDays: 3, neededPassDays: 2, earliestCompletionDate: '2026-05-27' },
      goalFinal: { blockers: [{ date: '2026-05-24', reason: 'missing_boss_daily_paper' }] },
      files: {
        jsonFile: path.join(tmpDir, 'goal_final_audit_2026-05-25.json'),
        markdownFile: path.join(tmpDir, 'goal_final_audit_2026-05-25.md'),
      },
    }),
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.goalFinalAuditStatus, 'pending');
  assert.strictEqual(report.summary.goalFinalCurrentStreak, 1);
  assert.ok(report.files.goalFinalAuditFile.endsWith('goal_final_audit_2026-05-25.json'));
  assert.match(fs.readFileSync(path.join(tmpDir, 'agent_completion_audit_2026-05-25.md'), 'utf8'), /GOAL-FINAL audit: pending \(1\/3\)/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-goal-final-required-'));
  seedCompletionFiles(tmpDir);
  const report = runAgentCompletionAudit({
    timeContext: { ...timeContext, localDate: '2026-05-25' },
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
    generateGoalFinal: true,
    requireGoalFinalComplete: true,
    bossPaperRunner: () => ({ verification: { status: 'pass' }, guard: { status: 'pass' }, files: {} }),
    goalFinalAuditRunner: () => ({
      ok: false,
      status: 'pending',
      summary: { currentStreak: 2, requiredBusinessDays: 3, neededPassDays: 1, earliestCompletionDate: '2026-05-26' },
      goalFinal: { blockers: [{ date: '2026-05-23', reason: 'missing_boss_daily_paper' }] },
      files: {},
    }),
  });
  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some(item => item.id === 'goal_final_not_complete'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-manual-fail-'));
  seedCompletionFiles(tmpDir);
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
  });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.summary.scheduledTaskInvocationOk, false);
  assert.ok(report.issues.some(item => item.id === 'completion_audit_not_scheduled_task_invocation'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-self-runtime-fail-'));
  seedCompletionFiles(tmpDir, {
    completionAuditLastRunTime: '11/30/1999 00:00:00',
    completionAuditLastTaskResult: '267011',
  });
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
  });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.summary.completionAuditTaskRuntimeReady, false);
  assert.ok(report.issues.some(item => item.id === 'completion_audit_task_runtime_not_proven'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-self-running-pass-'));
  seedCompletionFiles(tmpDir, {
    completionAuditLastRunTime: '05/25/2026 09:50:50',
    completionAuditLastTaskResult: '267009',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  const scheduleInstall = JSON.parse(fs.readFileSync(scheduleInstallFile, 'utf8'));
  scheduleInstall.completionAuditTask.state = 'Running';
  scheduleInstall.completionAuditTask.nextRunTime = '05/25/2026 09:50:50';
  writeJson(scheduleInstallFile, scheduleInstall);
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.completionAuditTaskRuntimeReady, true);
  assert.strictEqual(report.completionAuditTaskRuntime.proofMode, 'running_start_time');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-fail-'));
  seedCompletionFiles(tmpDir, {
    lastRunTime: '05/25/2026 07:45:00',
    heartbeatGeneratedAt: '2026-05-25T07:50:00.000Z',
  });
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
  });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_last_run_not_natural_trigger'));
  assert.ok(report.readiness.failedChecks.includes('natural_scheduled_trigger_proof'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-wait-fail-'));
  seedCompletionFiles(tmpDir);
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: true,
    refreshScheduleInstall: false,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
    execFileSync: () => {
      throw new Error('task scheduler unavailable');
    },
  });
  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some(item => item.id === 'supervisor_wait_failed'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-completion-refresh-install-'));
  seedCompletionFiles(tmpDir);
  const plan = buildUnattendedSchedulePlan({
    today: '2026-05-25',
    agentDir: tmpDir,
    execute: true,
    executeIfReady: true,
  }, timeContext);
  const calls = [];
  const report = runAgentCompletionAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    heartbeatDir: tmpDir,
    waitForSupervisor: false,
    refreshScheduleInstall: true,
    scheduledTaskInvocation: true,
    scheduledTaskName: 'AdOpsAgentCompletionAudit',
    execFileSync: (bin, args) => {
      calls.push(args.join(' '));
      return JSON.stringify({
        ok: true,
        taskName: calls.length === 1 ? 'AdOpsAgentUnattendedSupervisor' : 'AdOpsAgentCompletionAudit',
        state: 'Ready',
        actionExecute: calls.length === 1 ? plan.commands.windowsTaskAction.execute : plan.commands.windowsCompletionAuditAction.execute,
        actionArguments: calls.length === 1
          ? plan.commands.windowsTaskAction.arguments
          : plan.commands.windowsCompletionAuditAction.arguments,
        actionWorkingDirectory: calls.length === 1 ? plan.commands.windowsTaskAction.workingDirectory : plan.commands.windowsCompletionAuditAction.workingDirectory,
        triggerEnabled: true,
        runLevel: 'Highest',
        nextRunTime: calls.length === 1 ? '05/26/2026 09:30:30' : '05/26/2026 09:50:50',
        lastRunTime: calls.length === 1 ? '05/25/2026 09:30:30' : '05/25/2026 09:50:50',
        lastTaskResult: '0',
      });
    },
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.scheduleInstallRefreshed, true);
  assert.strictEqual(report.summary.completionAuditTaskRuntimeReady, true);
  assert.strictEqual(report.summary.scheduledTaskInvocationOk, true);
  assert.strictEqual(report.scheduleInstall.refreshed, true);
  assert.strictEqual(report.scheduleInstall.installedTask.lastTaskResult, '0');
  assert.ok(calls.length >= 2);
}

console.log('agent_completion_audit tests passed');
