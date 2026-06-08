const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');
const { buildOpsTimeContext } = require('../src/ops_time');
const { runAgentUnattendedSchedulerAudit } = require('./run_agent_unattended_scheduler_audit');
const { runAgentReadinessAudit } = require('./run_agent_readiness_audit');
const { runAgentUnattendedScheduleInstall } = require('./run_agent_unattended_schedule_install');
const { runAgentGoalAudit } = require('./run_agent_goal_audit');
const { runBossDailyPaper } = require('./run_agent_boss_daily_paper');
const { runGoalFinalAudit } = require('./run_goal_final_audit');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join(ROOT, 'data', 'agent');
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function readJson(file, fallback = null) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function psSingle(value) {
  return `'${text(value).replace(/'/g, "''")}'`;
}

function defaultAgentFile(prefix, date, ext = 'json', agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `${prefix}_${date}.${ext}`);
}

function parseTaskTime(value = '') {
  const raw = text(value);
  if (!raw) return 0;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (mdy) {
    const [, month, day, year, hour = '0', minute = '0', second = '0'] = mdy;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (!Number.isNaN(date.getTime()) && Number(year) >= 2000) return date.getTime();
    return 0;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() < 2000) return 0;
  return parsed.getTime();
}

function taskResultOkOrRunning(task = {}) {
  const state = text(task.state).toLowerCase();
  const result = text(task.lastTaskResult);
  if (state === 'running' || result === '267009') return true;
  if (!result) return true;
  const parsed = Number(result);
  return Number.isFinite(parsed) && parsed === 0;
}

function naturalScheduledTaskRun(task = {}, options = {}) {
  const lastRunMs = parseTaskTime(task.lastRunTime);
  const nextRunMs = parseTaskTime(task.nextRunTime);
  const toleranceMs = Math.max(1, Number(options.naturalScheduleToleranceMinutes || 15)) * 60 * 1000;
  const expectedPreviousNaturalRunMs = nextRunMs > 0 ? nextRunMs - DAY_MS : 0;
  const nextAnchoredObserved = lastRunMs > 0 &&
    expectedPreviousNaturalRunMs > 0 &&
    Math.abs(lastRunMs - expectedPreviousNaturalRunMs) <= toleranceMs;
  let runningStartTimeObserved = false;
  const scheduledStartTime = text(options.scheduledStartTime);
  const startMatch = scheduledStartTime.match(/^(\d{1,2}):(\d{2})$/);
  const running = text(task.state).toLowerCase() === 'running' || text(task.lastTaskResult) === '267009';
  if (!nextAnchoredObserved && options.allowRunningStartTimeProof === true && lastRunMs > 0 && startMatch && running) {
    const lastRun = new Date(lastRunMs);
    const scheduledMs = new Date(
      lastRun.getFullYear(),
      lastRun.getMonth(),
      lastRun.getDate(),
      Number(startMatch[1]),
      Number(startMatch[2]),
      0
    ).getTime();
    runningStartTimeObserved = Math.abs(lastRunMs - scheduledMs) <= toleranceMs;
  }
  return {
    observed: nextAnchoredObserved || runningStartTimeObserved,
    proofMode: nextAnchoredObserved ? 'next_run_anchor' : (runningStartTimeObserved ? 'running_start_time' : 'not_observed'),
    expectedPreviousNaturalRun: expectedPreviousNaturalRunMs ? new Date(expectedPreviousNaturalRunMs).toISOString() : '',
    toleranceMinutes: Math.round(toleranceMs / 60000),
  };
}

function completionAuditTaskRuntimeProof(task = {}, options = {}) {
  const natural = naturalScheduledTaskRun(task, options);
  const ready = task.ok === true &&
    ['ready', 'running'].includes(text(task.state).toLowerCase()) &&
    task.triggerEnabled !== false &&
    natural.observed === true &&
    taskResultOkOrRunning(task);
  return {
    ready,
    naturalScheduledRunObserved: natural.observed,
    proofMode: natural.proofMode,
    expectedPreviousNaturalRun: natural.expectedPreviousNaturalRun,
    toleranceMinutes: natural.toleranceMinutes,
    taskState: text(task.state),
    lastRunTime: text(task.lastRunTime),
    nextRunTime: text(task.nextRunTime),
    lastTaskResult: text(task.lastTaskResult),
  };
}

function buildDefaultScheduleCommand(agentDir = 'data\\agent') {
  return `npm run ops:agent:unattended-supervisor -- --out-dir ${agentDir} --execute --execute-if-ready`;
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(text(value));
  } catch (error) {
    return null;
  }
}

function runPowerShell(script, options = {}) {
  const execFileSync = options.execFileSync || defaultExecFileSync;
  const stdout = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseJsonMaybe(stdout) || { ok: true, stdout: text(stdout) };
}

function buildWaitForTaskScript(taskName = 'AdOpsAgentUnattendedSupervisor', timeoutSeconds = 5400) {
  const seconds = Math.max(0, Number(timeoutSeconds || 0));
  return [
    "$ErrorActionPreference = 'Stop'",
    `$taskName = ${psSingle(taskName)}`,
    `$deadline = (Get-Date).AddSeconds(${seconds})`,
    'do {',
    '  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
    '  $state = [string]$task.State',
    '  if ($state -ne "Running") { break }',
    '  Start-Sleep -Seconds 10',
    '} while ((Get-Date) -lt $deadline)',
    '$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
    '$info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue',
    '$timedOut = ([string]$task.State -eq "Running")',
    '[pscustomobject]@{',
    '  ok = $true',
    '  taskName = $task.TaskName',
    '  state = [string]$task.State',
    '  timedOut = [bool]$timedOut',
    '  nextRunTime = if ($info) { [string]$info.NextRunTime } else { "" }',
    '  lastRunTime = if ($info) { [string]$info.LastRunTime } else { "" }',
    '  lastTaskResult = if ($info) { [string]$info.LastTaskResult } else { "" }',
    '} | ConvertTo-Json -Compress',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    today: get('--today') || process.env.AGENT_TODAY || '',
    now: get('--now') || process.env.AGENT_NOW || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    agentDir: get('--agent-dir') || get('--out-dir') || process.env.AGENT_OUT_DIR || DEFAULT_AGENT_DIR,
    heartbeatDir: get('--heartbeat-dir') || process.env.AGENT_UNATTENDED_HEARTBEAT_DIR || '',
    scheduleCommand: get('--schedule-command') || process.env.AGENT_UNATTENDED_SCHEDULE_COMMAND || '',
    scheduleInstallFile: get('--schedule-install') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_OUT || '',
    outFile: get('--out') || process.env.AGENT_COMPLETION_AUDIT_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_COMPLETION_AUDIT_MD_OUT || '',
    schedulerOutFile: get('--scheduler-out') || process.env.AGENT_COMPLETION_SCHEDULER_OUT || '',
    schedulerMarkdownFile: get('--scheduler-md-out') || process.env.AGENT_COMPLETION_SCHEDULER_MD_OUT || '',
    readinessOutFile: get('--readiness-out') || process.env.AGENT_COMPLETION_READINESS_OUT || '',
    readinessMarkdownFile: get('--readiness-md-out') || process.env.AGENT_COMPLETION_READINESS_MD_OUT || '',
    goalAuditOutFile: get('--goal-audit-out') || process.env.AGENT_GOAL_AUDIT_OUT || '',
    goalAuditMarkdownFile: get('--goal-audit-md-out') || process.env.AGENT_GOAL_AUDIT_MD_OUT || '',
    scheduleInstallMarkdownFile: get('--schedule-install-md-out') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_MD_OUT || '',
    naturalScheduleToleranceMinutes: Number(get('--natural-schedule-tolerance-minutes') || process.env.AGENT_NATURAL_SCHEDULE_TOLERANCE_MINUTES || 15),
    waitForSupervisor: !args.includes('--skip-wait-for-supervisor') && process.env.AGENT_COMPLETION_SKIP_WAIT_FOR_SUPERVISOR !== '1',
    waitForSupervisorTimeoutSeconds: Number(get('--wait-for-supervisor-timeout-seconds') || process.env.AGENT_COMPLETION_WAIT_FOR_SUPERVISOR_TIMEOUT_SECONDS || 5400),
    supervisorTaskName: get('--supervisor-task-name') || process.env.AGENT_UNATTENDED_TASK_NAME || 'AdOpsAgentUnattendedSupervisor',
    refreshScheduleInstall: !args.includes('--skip-refresh-schedule-install') && process.env.AGENT_COMPLETION_SKIP_REFRESH_SCHEDULE_INSTALL !== '1',
    scheduledTaskInvocation: args.includes('--scheduled-task-invocation') || process.env.AGENT_SCHEDULED_TASK_INVOCATION === '1',
    scheduledTaskName: get('--scheduled-task-name') || process.env.AGENT_SCHEDULED_TASK_NAME || '',
    generateGoalAudit: !args.includes('--skip-goal-audit') && process.env.AGENT_COMPLETION_SKIP_GOAL_AUDIT !== '1',
    generateGoalFinal: args.includes('--goal-final') || process.env.AGENT_COMPLETION_GOAL_FINAL === '1',
    requireGoalFinalComplete: args.includes('--require-goal-final-complete') || process.env.AGENT_COMPLETION_REQUIRE_GOAL_FINAL_COMPLETE === '1',
    goalFinalToday: get('--goal-final-today') || process.env.AGENT_GOAL_FINAL_TODAY || '',
  };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent completion audit - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Scheduler completion: ${report.summary?.schedulerOk === true}`);
  lines.push(`- Readiness completion: ${report.summary?.readinessOk === true}`);
  lines.push(`- Completion audit schedule ready: ${report.summary?.completionAuditScheduleReady === true}`);
  lines.push(`- Completion audit task runtime ready: ${report.summary?.completionAuditTaskRuntimeReady === true}`);
  lines.push(`- Scheduled task invocation: ${report.summary?.scheduledTaskInvocationOk === true}`);
  lines.push(`- Natural scheduled runtime ready: ${report.summary?.naturalScheduledRuntimeReady === true}`);
  lines.push(`- Goal audit: ${report.summary?.goalAuditOk === true}`);
  lines.push(`- GOAL-FINAL audit: ${report.summary?.goalFinalAuditStatus || 'skipped'} (${report.summary?.goalFinalCurrentStreak || 0}/${report.summary?.goalFinalRequiredBusinessDays || 3})`);
  lines.push(`- Business date: ${report.businessDate || ''}`);
  lines.push(`- Local date: ${report.localDate || ''}`);
  lines.push(`- Supervisor wait: ${report.supervisorWait?.skipped === true ? 'skipped' : `${report.supervisorWait?.state || ''}${report.supervisorWait?.timedOut ? ' timeout' : ''}`}`);
  lines.push('');
  lines.push('## Files');
  for (const [key, value] of Object.entries(report.files || {})) {
    if (value) lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## Issues');
  if (!report.issues?.length) {
    lines.push('- none');
  } else {
    for (const item of report.issues) {
      lines.push(`- [${item.severity || 'blocker'}] ${item.id || item}: ${item.title || item.id || item}`);
      if (item.nextAction) lines.push(`  - next: ${item.nextAction}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function runAgentCompletionAudit(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_completion_audit_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const goalFinalDate = dateOnly(options.goalFinalToday || options.today || timeContext.localDate || businessDate);
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const relativeAgentDir = path.isAbsolute(agentDir) ? path.relative(ROOT, agentDir) : agentDir;
  const heartbeatDir = options.heartbeatDir || agentDir;
  const scheduleCommand = text(options.scheduleCommand || buildDefaultScheduleCommand(relativeAgentDir || 'data\\agent'));
  const scheduleInstallFile = options.scheduleInstallFile || defaultAgentFile('unattended_schedule_install', businessDate, 'json', agentDir);
  const schedulerOutFile = options.schedulerOutFile || defaultAgentFile('unattended_scheduler_completion_audit', businessDate, 'json', agentDir);
  const schedulerMarkdownFile = options.schedulerMarkdownFile || defaultAgentFile('unattended_scheduler_completion_audit', businessDate, 'md', agentDir);
  const readinessOutFile = options.readinessOutFile || defaultAgentFile('agent_readiness_completion_audit', businessDate, 'json', agentDir);
  const readinessMarkdownFile = options.readinessMarkdownFile || defaultAgentFile('agent_readiness_completion_audit', businessDate, 'md', agentDir);
  const goalAuditOutFile = options.goalAuditOutFile || defaultAgentFile('agent_goal_audit', businessDate, 'json', agentDir);
  const goalAuditMarkdownFile = options.goalAuditMarkdownFile || defaultAgentFile('agent_goal_audit', businessDate, 'md', agentDir);
  const scheduleInstallMarkdownFile = options.scheduleInstallMarkdownFile || defaultAgentFile('unattended_schedule_install', businessDate, 'md', agentDir);
  let supervisorWait = {
    skipped: options.waitForSupervisor === false,
  };
  if (options.waitForSupervisor !== false) {
    try {
      supervisorWait = runPowerShell(buildWaitForTaskScript(
        options.supervisorTaskName || 'AdOpsAgentUnattendedSupervisor',
        options.waitForSupervisorTimeoutSeconds || 5400
      ), options);
    } catch (error) {
      supervisorWait = {
        ok: false,
        taskName: text(options.supervisorTaskName || 'AdOpsAgentUnattendedSupervisor'),
        error: text(error.stderr || error.stdout || error.message),
      };
    }
  }
  let scheduleInstall = {
    refreshed: false,
    skipped: options.refreshScheduleInstall === false,
  };
  if (options.refreshScheduleInstall !== false) {
    try {
      scheduleInstall = runAgentUnattendedScheduleInstall({
        ...options,
        timeContext,
        today: businessDate,
        agentDir,
        execute: true,
        executeIfReady: true,
        install: false,
        verifyInstalled: true,
        outFile: scheduleInstallFile,
        markdownFile: scheduleInstallMarkdownFile,
      });
      scheduleInstall.refreshed = true;
    } catch (error) {
      scheduleInstall = {
        refreshed: false,
        ok: false,
        status: 'failed',
        error: text(error.message || error),
      };
    }
  } else {
    scheduleInstall = {
      ...(readJson(scheduleInstallFile, {}) || {}),
      refreshed: false,
      skipped: true,
    };
  }

  const scheduler = runAgentUnattendedSchedulerAudit({
    ...options,
    timeContext,
    today: businessDate,
    heartbeatDir,
    scheduleCommand,
    scheduleInstallFile,
    outFile: schedulerOutFile,
    markdownFile: schedulerMarkdownFile,
    requireSchedule: true,
    requireLiveExecute: true,
    requireNaturalScheduledRun: true,
    naturalScheduleToleranceMinutes: options.naturalScheduleToleranceMinutes || 15,
  });
  const readiness = runAgentReadinessAudit({
    ...options,
    timeContext,
    today: businessDate,
    agentDir,
    schedulerAuditFile: schedulerOutFile,
    scheduleInstallFile,
    outFile: readinessOutFile,
    markdownFile: readinessMarkdownFile,
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    requireNaturalScheduledRun: true,
    naturalScheduleToleranceMinutes: options.naturalScheduleToleranceMinutes || 15,
  });
  const issues = [
    ...(scheduler.issues || []),
    ...((readiness.checks || [])
      .filter(item => item.status === 'fail')
      .map(item => ({
        id: item.id,
        severity: 'blocker',
        title: item.title,
        evidence: item.evidence,
        nextAction: item.nextAction,
      }))),
  ];
  if (supervisorWait.ok === false) {
    issues.unshift({
      id: 'supervisor_wait_failed',
      severity: 'blocker',
      title: 'Completion audit could not verify supervisor task state before strict audit',
      evidence: [supervisorWait.error],
      nextAction: 'Ensure the completion audit task runs with permission to read Windows Task Scheduler.',
    });
  } else if (supervisorWait.timedOut === true) {
    issues.unshift({
      id: 'supervisor_wait_timed_out',
      severity: 'blocker',
      title: 'Supervisor task was still running when completion audit timeout expired',
      evidence: [`taskName=${supervisorWait.taskName}`, `state=${supervisorWait.state}`],
      nextAction: 'Increase the completion audit delay or timeout, then rerun completion audit after supervisor exits.',
    });
  }
  if (scheduleInstall.ok === false) {
    issues.unshift({
      id: 'completion_schedule_install_refresh_failed',
      severity: 'blocker',
      title: 'Completion audit could not refresh installed scheduled task state',
      evidence: [scheduleInstall.error || `status=${text(scheduleInstall.status)}`],
      nextAction: 'Repair schedule-install verification so completion audit can read final Task Scheduler lastRunTime and lastTaskResult.',
    });
  }
  const completionAuditTaskRuntime = completionAuditTaskRuntimeProof(scheduleInstall.completionAuditTask || {}, {
    naturalScheduleToleranceMinutes: options.naturalScheduleToleranceMinutes || 15,
    scheduledStartTime: scheduleInstall.plan?.schedule?.completionAudit?.startTime,
    allowRunningStartTimeProof: true,
  });
  const expectedCompletionTaskName = text(scheduleInstall.completionAuditTask?.taskName || scheduleInstall.plan?.schedule?.completionAudit?.taskName || 'AdOpsAgentCompletionAudit');
  const invocation = {
    scheduledTaskInvocation: options.scheduledTaskInvocation === true,
    scheduledTaskName: text(options.scheduledTaskName || ''),
    expectedTaskName: expectedCompletionTaskName,
  };
  invocation.ok = invocation.scheduledTaskInvocation === true &&
    invocation.scheduledTaskName === expectedCompletionTaskName;
  if (invocation.ok !== true) {
    issues.unshift({
      id: 'completion_audit_not_scheduled_task_invocation',
      severity: 'blocker',
      title: 'Completion audit report was not produced by the scheduled completion audit task',
      evidence: [
        `scheduledTaskInvocation=${invocation.scheduledTaskInvocation}`,
        `scheduledTaskName=${invocation.scheduledTaskName}`,
        `expectedTaskName=${invocation.expectedTaskName}`,
      ],
      nextAction: 'Let AdOpsAgentCompletionAudit produce the final completion report through Windows Task Scheduler; manual reruns are diagnostics only.',
    });
  }
  if (completionAuditTaskRuntime.ready !== true) {
    issues.unshift({
      id: 'completion_audit_task_runtime_not_proven',
      severity: 'blocker',
      title: 'Completion audit scheduled task has not produced its own natural trigger run',
      evidence: [
        `taskState=${completionAuditTaskRuntime.taskState}`,
        `lastRunTime=${completionAuditTaskRuntime.lastRunTime}`,
        `nextRunTime=${completionAuditTaskRuntime.nextRunTime}`,
        `lastTaskResult=${completionAuditTaskRuntime.lastTaskResult}`,
        `naturalScheduledRunObserved=${completionAuditTaskRuntime.naturalScheduledRunObserved}`,
        `proofMode=${completionAuditTaskRuntime.proofMode}`,
        `expectedPreviousNaturalRun=${completionAuditTaskRuntime.expectedPreviousNaturalRun}`,
        `toleranceMinutes=${completionAuditTaskRuntime.toleranceMinutes}`,
      ],
      nextAction: 'Keep AdOpsAgentCompletionAudit installed; after it runs naturally, rerun completion audit only if the scheduled task did not write the report itself.',
    });
  }
  const outFile = options.outFile || defaultAgentFile('agent_completion_audit', businessDate, 'json', agentDir);
  const markdownFile = options.markdownFile || defaultAgentFile('agent_completion_audit', businessDate, 'md', agentDir);
  const report = {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate,
    localDate: text(timeContext.localDate || ''),
    dataDate: dateOnly(timeContext.dataDate || businessDate),
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
    status: 'not_ready',
    ok: false,
    summary: {
      schedulerOk: scheduler.ok === true,
      schedulerStatus: text(scheduler.status),
      readinessOk: readiness.ok === true,
      readinessStatus: text(readiness.status),
      completionAuditScheduleReady: readiness.summary?.completionAuditScheduleReady === true,
      completionAuditTaskRuntimeReady: completionAuditTaskRuntime.ready === true,
      scheduledTaskInvocationOk: invocation.ok === true,
      naturalScheduledRuntimeReady: readiness.summary?.naturalScheduledRuntimeReady === true,
      failedChecks: (readiness.checks || []).filter(item => item.status === 'fail').length,
      schedulerBlockers: Number(scheduler.summary?.blockers || 0),
      supervisorWaitOk: supervisorWait.skipped === true || supervisorWait.ok === true,
      supervisorWaitTimedOut: supervisorWait.timedOut === true,
      scheduleInstallRefreshed: scheduleInstall.refreshed === true,
      goalAuditOk: false,
      goalAuditStatus: '',
      goalFinalAuditOk: false,
      goalFinalAuditStatus: 'skipped',
      goalFinalCurrentStreak: 0,
      goalFinalRequiredBusinessDays: 3,
    },
    files: {
      schedulerOutFile,
      schedulerMarkdownFile,
      readinessOutFile,
      readinessMarkdownFile,
      scheduleInstallFile,
      scheduleInstallMarkdownFile,
      goalAuditOutFile,
      goalAuditMarkdownFile,
      outFile,
      markdownFile,
    },
    scheduler: {
      ok: scheduler.ok,
      status: scheduler.status,
      summary: scheduler.summary,
      issues: scheduler.issues,
    },
    readiness: {
      ok: readiness.ok,
      status: readiness.status,
      summary: readiness.summary,
      failedChecks: (readiness.checks || []).filter(item => item.status === 'fail').map(item => item.id),
      warningChecks: (readiness.checks || []).filter(item => item.status === 'warning').map(item => item.id),
    },
    supervisorWait,
    invocation,
    completionAuditTaskRuntime,
    scheduleInstall: {
      refreshed: scheduleInstall.refreshed === true,
      ok: scheduleInstall.ok === true,
      status: text(scheduleInstall.status || ''),
      installedTask: scheduleInstall.installedTask || null,
      completionAuditTask: scheduleInstall.completionAuditTask || null,
      issues: (scheduleInstall.issues || []).map(item => text(item.id)).filter(Boolean),
    },
    issues,
  };
  report.ok = scheduler.ok === true && readiness.ok === true && !report.issues.some(item => item.severity === 'blocker');
  report.status = report.ok ? 'complete_ready' : 'not_ready';
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));

  if (options.generateGoalAudit !== false) {
    try {
      const goalAudit = runAgentGoalAudit({
        timeContext,
        today: businessDate,
        agentDir,
        supervisorFile: defaultAgentFile('unattended_supervisor', businessDate, 'json', agentDir),
        readinessFile: readinessOutFile,
        completionFile: outFile,
        scheduleInstallFile,
        learningMemoryFile: defaultAgentFile('learning_memory', businessDate, 'json', agentDir),
        correctionRiskFile: defaultAgentFile('correction_risk', businessDate, 'json', agentDir),
        unattendedGateFile: defaultAgentFile('unattended_gate', businessDate, 'json', agentDir),
        outFile: goalAuditOutFile,
        markdownFile: goalAuditMarkdownFile,
      });
      report.goalAudit = {
        generated: true,
        ok: goalAudit.ok === true,
        status: text(goalAudit.status || ''),
        summary: goalAudit.summary || {},
        pendingRequirements: (goalAudit.requirements || []).filter(item => item.status === 'pending').map(item => item.id),
        failedRequirements: (goalAudit.requirements || []).filter(item => item.status === 'fail').map(item => item.id),
        files: {
          outFile: text(goalAudit.files?.outFile || ''),
          markdownFile: text(goalAudit.files?.markdownFile || ''),
        },
      };
      report.files.goalAuditFile = report.goalAudit.files.outFile;
      report.files.goalAuditMarkdownFile = report.goalAudit.files.markdownFile;
      report.summary.goalAuditOk = goalAudit.ok === true;
      report.summary.goalAuditStatus = text(goalAudit.status || '');
      if (goalAudit.ok !== true) {
        report.issues.push({
          id: 'goal_audit_not_complete',
          severity: 'blocker',
          title: 'Full agent goal audit is not complete',
          evidence: [
            `status=${text(goalAudit.status)}`,
            `pending=${report.goalAudit.pendingRequirements.join(',')}`,
            `failed=${report.goalAudit.failedRequirements.join(',')}`,
          ],
          nextAction: 'Use agent_goal_audit_<date>.json to close remaining objective-level requirements before marking the full goal complete.',
        });
      }
    } catch (error) {
      report.goalAudit = {
        generated: false,
        ok: false,
        status: 'failed',
        error: text(error.message || error),
      };
      report.summary.goalAuditOk = false;
      report.summary.goalAuditStatus = 'failed';
      report.issues.push({
        id: 'goal_audit_failed',
        severity: 'blocker',
        title: 'Full agent goal audit failed to run',
        evidence: [report.goalAudit.error],
        nextAction: 'Repair goal-audit generation so final unattended completion has objective-level proof.',
      });
    }
  } else {
    report.goalAudit = { generated: false, skipped: true };
    report.summary.goalAuditStatus = 'skipped';
  }

  if (options.generateGoalFinal === true) {
    try {
      const bossPaperRunner = options.bossPaperRunner || runBossDailyPaper;
      const goalFinalAuditRunner = options.goalFinalAuditRunner || runGoalFinalAudit;
      const bossPaper = bossPaperRunner({ today: goalFinalDate, agentDir });
      const goalFinalAudit = goalFinalAuditRunner({ today: goalFinalDate, agentDir });
      const bossPaperStatus = text(bossPaper.verification?.status || '');
      const bossPaperGuardStatus = text(bossPaper.guard?.status || '');
      report.goalFinal = {
        generated: true,
        today: goalFinalDate,
        bossPaperStatus,
        bossPaperGuardStatus,
        auditOk: goalFinalAudit.ok === true,
        auditStatus: text(goalFinalAudit.status || ''),
        currentStreak: Number(goalFinalAudit.summary?.currentStreak || 0),
        requiredBusinessDays: Number(goalFinalAudit.summary?.requiredBusinessDays || 3),
        neededPassDays: Number(goalFinalAudit.summary?.neededPassDays || 0),
        earliestCompletionDate: text(goalFinalAudit.summary?.earliestCompletionDate || ''),
        blockers: goalFinalAudit.goalFinal?.blockers || [],
        files: {
          bossPaperFile: text(bossPaper.files?.paperFile || ''),
          bossPaperJsonFile: text(bossPaper.files?.jsonFile || ''),
          auditFile: text(goalFinalAudit.files?.jsonFile || ''),
          auditMarkdownFile: text(goalFinalAudit.files?.markdownFile || ''),
        },
      };
      report.files.bossPaperFile = report.goalFinal.files.bossPaperFile;
      report.files.bossPaperJsonFile = report.goalFinal.files.bossPaperJsonFile;
      report.files.goalFinalAuditFile = report.goalFinal.files.auditFile;
      report.files.goalFinalAuditMarkdownFile = report.goalFinal.files.auditMarkdownFile;
      report.summary.goalFinalAuditOk = goalFinalAudit.ok === true;
      report.summary.goalFinalAuditStatus = report.goalFinal.auditStatus;
      report.summary.goalFinalCurrentStreak = report.goalFinal.currentStreak;
      report.summary.goalFinalRequiredBusinessDays = report.goalFinal.requiredBusinessDays;
      if (bossPaperStatus !== 'pass' || bossPaperGuardStatus !== 'pass') {
        report.issues.push({
          id: 'goal_final_boss_paper_not_pass',
          severity: 'blocker',
          title: 'GOAL-FINAL boss paper did not pass current guards',
          evidence: [`bossPaperStatus=${bossPaperStatus}`, `bossPaperGuardStatus=${bossPaperGuardStatus}`],
          nextAction: 'Repair the boss-paper evidence chain before counting this business day toward GOAL-FINAL.',
        });
      }
      if (options.requireGoalFinalComplete === true && goalFinalAudit.ok !== true) {
        report.issues.push({
          id: 'goal_final_not_complete',
          severity: 'blocker',
          title: 'GOAL-FINAL consecutive-day requirement is not complete',
          evidence: [
            `status=${report.goalFinal.auditStatus}`,
            `streak=${report.goalFinal.currentStreak}/${report.goalFinal.requiredBusinessDays}`,
            `earliestCompletionDate=${report.goalFinal.earliestCompletionDate}`,
          ],
          nextAction: 'Keep producing real boss papers on the next required business days until GOAL-FINAL audit reports complete.',
        });
      }
    } catch (error) {
      report.goalFinal = {
        generated: false,
        ok: false,
        status: 'failed',
        today: goalFinalDate,
        error: text(error.message || error),
      };
      report.summary.goalFinalAuditOk = false;
      report.summary.goalFinalAuditStatus = 'failed';
      report.issues.push({
        id: 'goal_final_audit_failed',
        severity: 'blocker',
        title: 'GOAL-FINAL boss-paper/audit generation failed',
        evidence: [report.goalFinal.error],
        nextAction: 'Repair GOAL-FINAL generation so scheduled completion audit produces boss paper and goal_final_audit artifacts.',
      });
    }
  } else {
    report.goalFinal = { generated: false, skipped: true };
  }
  report.ok = scheduler.ok === true && readiness.ok === true && !report.issues.some(item => item.severity === 'blocker');
  report.status = report.ok ? 'complete_ready' : 'not_ready';
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  return report;
}

function main() {
  const report = runAgentCompletionAudit(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    summary: report.summary,
    files: report.files,
    issues: report.issues,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildDefaultScheduleCommand,
  parseArgs,
  renderMarkdown,
  runAgentCompletionAudit,
};
