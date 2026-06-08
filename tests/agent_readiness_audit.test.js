const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAgentReadinessAudit,
  parseArgs,
  renderMarkdown,
  runAgentReadinessAudit,
} = require('../scripts/run_agent_readiness_audit');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-readiness-audit-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function fixture(tmpDir, overrides = {}) {
  const files = {
    supervisorFile: path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'),
    schedulerAuditFile: path.join(tmpDir, 'unattended_scheduler_audit_2026-05-25.json'),
    scheduleInstallFile: path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json'),
    unattendedGateFile: path.join(tmpDir, 'unattended_gate_2026-05-25.json'),
    learningMemoryFile: path.join(tmpDir, 'learning_memory_2026-05-25.json'),
    closedLoopFile: path.join(tmpDir, 'agent_closed_loop_2026-05-25.json'),
  };
  const supervisor = {
    ok: true,
    status: 'needs_recovery',
    mode: 'execute_if_ready',
    requested: { execute: true, executeIfReady: true },
    effective: { execute: true, executeIfReady: true },
    closedLoop: {
      closedLoop: true,
      dailyClosureStatus: 'needs_recovery',
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      artifactVerificationOk: true,
      learningMemoryStatus: 'active_watch',
      unattendedGateDecision: 'no_actions',
      unattendedGateBlockerCount: 0,
      priorLearningMemoryApplied: true,
      priorLearningConstraintTasks: 4,
      priorLearningBlockers: 0,
      priorLearningWarnings: 2,
    },
    issues: [{ id: 'unattended_live_no_actions', severity: 'warning' }],
  };
  const schedulerAudit = {
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
  };
  const scheduleInstall = {
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
      state: 'Ready',
      triggerEnabled: true,
      actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '11/30/1999 00:00:00',
      lastTaskResult: '267011',
    },
    completionAuditTask: {
      ok: true,
      taskName: 'AdOpsAgentCompletionAudit',
      state: 'Ready',
      triggerEnabled: true,
      runLevel: 'Highest',
      actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
      nextRunTime: '05/26/2026 09:50:50',
      lastRunTime: '11/30/1999 00:00:00',
      lastTaskResult: '267011',
    },
  };
  const unattendedGate = {
    decision: 'no_actions',
    summary: { blockers: 0, eligibleActions: 0 },
  };
  const learningMemory = {
    status: 'active_watch',
    summary: { constraints: 16, blockers: 0, warnings: 12, corrections: 1 },
    nextRunBrief: {
      mustReadBeforeDecision: ['data/learning/daily_learning_2026-05-25.json'],
      doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
      evidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
    },
  };
  const closedLoop = { summary: { closedLoop: true } };
  writeJson(files.supervisorFile, { ...supervisor, ...(overrides.supervisor || {}) });
  writeJson(files.schedulerAuditFile, { ...schedulerAudit, ...(overrides.schedulerAudit || {}) });
  writeJson(files.scheduleInstallFile, { ...scheduleInstall, ...(overrides.scheduleInstall || {}) });
  writeJson(files.unattendedGateFile, { ...unattendedGate, ...(overrides.unattendedGate || {}) });
  writeJson(files.learningMemoryFile, { ...learningMemory, ...(overrides.learningMemory || {}) });
  writeJson(files.closedLoopFile, { ...closedLoop, ...(overrides.closedLoop || {}) });
  return files;
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_readiness_audit.js',
    '--today',
    '2026-05-25',
    '--require-correction-lesson',
    '--require-risk-routing-lesson',
    '--require-natural-scheduled-run',
  ]);
  assert.strictEqual(parsed.today, '2026-05-25');
  assert.strictEqual(parsed.requireCorrectionLesson, true);
  assert.strictEqual(parsed.requireRiskRoutingLesson, true);
  assert.strictEqual(parsed.requireNaturalScheduledRun, true);
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:readiness-audit -- --today 2026-05-25 --out data\\agent\\agent_readiness_audit_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:readiness-audit');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_readiness_audit.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-ready-'));
  const files = fixture(tmpDir);
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready_with_warnings');
  assert.strictEqual(report.summary.liveScheduleReady, true);
  assert.strictEqual(report.summary.completionAuditScheduleReady, true);
  assert.strictEqual(report.summary.completionAuditRuntimeReady, false);
  assert.strictEqual(report.summary.learningReady, true);
  assert.strictEqual(report.summary.correctionReady, true);
  assert.strictEqual(report.summary.scheduledRuntimeReady, false);
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, false);
  assert.ok(report.checks.some(item => item.id === 'live_unattended_schedule' && item.status === 'pass'));
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_schedule' && item.status === 'pass'));
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_runtime_proof' && item.status === 'warning'));
  assert.ok(report.checks.some(item => item.id === 'scheduled_task_runtime_proof' && item.status === 'warning'));
  assert.ok(report.checks.some(item => item.id === 'natural_scheduled_trigger_proof' && item.status === 'warning'));
  assert.ok(report.checks.some(item => item.id === 'unattended_execute_gate' && item.status === 'warning'));
  assert.ok(report.checks.some(item => item.id === 'risk_is_routing_not_refusal' && item.status === 'pass'));
  assert.match(renderMarkdown(report), /Agent readiness audit/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-completion-task-fail-'));
  const files = fixture(tmpDir, {
    scheduleInstall: {
      completionAuditTask: null,
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.strictEqual(report.summary.completionAuditScheduleReady, false);
  assert.strictEqual(report.summary.completionAuditRuntimeReady, false);
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_schedule' && item.status === 'fail'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-completion-no-goal-final-'));
  const files = fixture(tmpDir, {
    scheduleInstall: {
      completionAuditTask: {
        actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  }, timeContext);
  const check = report.checks.find(item => item.id === 'post_trigger_completion_audit_schedule');
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.summary.completionAuditScheduleReady, false);
  assert.strictEqual(check.status, 'fail');
  assert.ok(check.evidence.includes('goalFinalReady=false'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-runtime-pass-'));
  const files = fixture(tmpDir, {
    supervisor: {
      generatedAt: '2026-05-25T07:50:00.000Z',
    },
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 07:45:00',
        lastTaskResult: '0',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.scheduledRuntimeReady, true);
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, false);
  assert.ok(report.checks.some(item => item.id === 'scheduled_task_runtime_proof' && item.status === 'pass'));
  assert.ok(report.checks.some(item => item.id === 'natural_scheduled_trigger_proof' && item.status === 'warning'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-natural-pass-'));
  const files = fixture(tmpDir, {
    supervisor: {
      generatedAt: '2026-05-25T02:00:00.000Z',
    },
    schedulerAudit: {
      summary: {
        blockers: 0,
        warnings: 0,
        heartbeatCount: 1,
        latestHeartbeatOk: true,
        consecutiveFailures: 0,
        scheduleUsesSupervisor: true,
        scheduleLiveExecuteArmed: true,
        naturalScheduledRunObserved: true,
        expectedPreviousNaturalRun: '2026-05-25T01:30:30.000Z',
        naturalScheduleToleranceMinutes: 15,
      },
    },
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 09:30:30',
        lastTaskResult: '0',
      },
      completionAuditTask: {
        ok: true,
        taskName: 'AdOpsAgentCompletionAudit',
        state: 'Ready',
        triggerEnabled: true,
        runLevel: 'Highest',
        actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
        nextRunTime: '05/26/2026 09:50:50',
        lastRunTime: '05/25/2026 09:50:50',
        lastTaskResult: '0',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.scheduledRuntimeReady, true);
  assert.strictEqual(report.summary.completionAuditRuntimeReady, true);
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, true);
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_runtime_proof' && item.status === 'pass'));
  assert.ok(report.checks.some(item => item.id === 'natural_scheduled_trigger_proof' && item.status === 'pass'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-completion-natural-required-fail-'));
  const files = fixture(tmpDir, {
    supervisor: {
      generatedAt: '2026-05-25T02:00:00.000Z',
    },
    schedulerAudit: {
      summary: {
        blockers: 0,
        warnings: 0,
        heartbeatCount: 1,
        latestHeartbeatOk: true,
        consecutiveFailures: 0,
        scheduleUsesSupervisor: true,
        scheduleLiveExecuteArmed: true,
        naturalScheduledRunObserved: true,
        expectedPreviousNaturalRun: '2026-05-25T01:30:30.000Z',
        naturalScheduleToleranceMinutes: 15,
      },
    },
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 09:30:30',
        lastTaskResult: '0',
      },
      completionAuditTask: {
        ok: true,
        taskName: 'AdOpsAgentCompletionAudit',
        state: 'Ready',
        triggerEnabled: true,
        runLevel: 'Highest',
        actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
        nextRunTime: '05/26/2026 09:50:50',
        lastRunTime: '11/30/1999 00:00:00',
        lastTaskResult: '267011',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, true);
  assert.strictEqual(report.summary.completionAuditRuntimeReady, false);
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_runtime_proof' && item.status === 'fail'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-completion-running-pass-'));
  const files = fixture(tmpDir, {
    supervisor: {
      generatedAt: '2026-05-25T02:00:00.000Z',
    },
    schedulerAudit: {
      summary: {
        blockers: 0,
        warnings: 0,
        heartbeatCount: 1,
        latestHeartbeatOk: true,
        consecutiveFailures: 0,
        scheduleUsesSupervisor: true,
        scheduleLiveExecuteArmed: true,
        naturalScheduledRunObserved: true,
        expectedPreviousNaturalRun: '2026-05-25T01:30:30.000Z',
        naturalScheduleToleranceMinutes: 15,
      },
    },
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 09:30:30',
        lastTaskResult: '0',
      },
      completionAuditTask: {
        ok: true,
        taskName: 'AdOpsAgentCompletionAudit',
        state: 'Running',
        triggerEnabled: true,
        runLevel: 'Highest',
        actionArguments: 'run ops:agent:completion-audit -- --out-dir data\\agent --natural-schedule-tolerance-minutes 15 --goal-final --scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit',
        nextRunTime: '05/25/2026 09:50:50',
        lastRunTime: '05/25/2026 09:50:50',
        lastTaskResult: '267009',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.completionAuditRuntimeReady, true);
  assert.ok(report.checks.some(item => item.id === 'post_trigger_completion_audit_runtime_proof' && item.status === 'pass'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-natural-required-fail-'));
  const files = fixture(tmpDir, {
    supervisor: {
      generatedAt: '2026-05-25T07:50:00.000Z',
    },
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 07:45:00',
        lastTaskResult: '0',
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.strictEqual(report.summary.scheduledRuntimeReady, true);
  assert.strictEqual(report.summary.naturalScheduledRuntimeReady, false);
  assert.ok(report.checks.some(item => item.id === 'natural_scheduled_trigger_proof' && item.status === 'fail'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-live-fail-'));
  const files = fixture(tmpDir, {
    scheduleInstall: {
      installedTask: {
        state: 'Ready',
        triggerEnabled: true,
        actionArguments: 'run ops:agent:unattended-supervisor -- --out-dir data\\agent',
      },
    },
    schedulerAudit: {
      summary: {
        blockers: 0,
        heartbeatCount: 1,
        latestHeartbeatOk: true,
        consecutiveFailures: 0,
        scheduleUsesSupervisor: true,
        scheduleLiveExecuteArmed: false,
      },
    },
  });
  const report = buildAgentReadinessAudit({
    ...files,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.ok(report.checks.some(item => item.id === 'live_unattended_schedule' && item.status === 'fail'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-readiness-run-'));
  const files = fixture(tmpDir);
  const outFile = path.join(tmpDir, 'agent_readiness_audit.json');
  const markdownFile = path.join(tmpDir, 'agent_readiness_audit.md');
  const report = runAgentReadinessAudit({
    ...files,
    outFile,
    markdownFile,
    timeContext,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
  });
  assert.strictEqual(report.ok, true);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')).files.outFile, outFile);
}

console.log('agent_readiness_audit tests passed');
