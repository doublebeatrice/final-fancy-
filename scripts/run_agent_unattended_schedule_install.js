const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');
const { normalizeAgentTask } = require('../src/agent_control_plane');
const { buildOpsTimeContext } = require('../src/ops_time');
const { buildUnattendedSchedulePlan } = require('./run_agent_unattended_schedule_plan');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join('data', 'agent');

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

function psSingle(value) {
  return `'${text(value).replace(/'/g, "''")}'`;
}

function readJson(file, fallback = null) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function addIssue(list, input = {}) {
  list.push({
    id: text(input.id),
    severity: text(input.severity || 'blocker'),
    title: text(input.title || input.id),
    evidence: (input.evidence || []).map(text).filter(Boolean),
    nextAction: text(input.nextAction || ''),
  });
}

function taskForIssue(issue = {}, context = {}) {
  return normalizeAgentTask({
    source: 'unattended_schedule_install',
    kind: 'schedule_install_gap',
    status: 'new',
    priority: issue.severity === 'blocker' ? 'P0' : 'P1',
    title: issue.title,
    description: issue.nextAction,
    evidence: issue.evidence,
    evidenceRequirements: [issue.id],
    subject: { entityId: issue.id },
    businessDate: context.businessDate,
    dataDate: context.dataDate,
    dueDate: context.businessDate,
    sourceRunId: context.sourceRunId,
    rawInput: `unattended_schedule_install:${issue.id}`,
  }, context);
}

function loadOrBuildPlan(options = {}, timeContext = {}) {
  const fromFile = readJson(options.planFile || '', null);
  if (fromFile) return fromFile;
  return buildUnattendedSchedulePlan(options, timeContext);
}

function buildInstallScript(plan = {}) {
  const taskName = text(plan.schedule?.taskName || 'AdOpsAgentUnattendedSupervisor');
  const startTime = text(plan.schedule?.startTime || '09:30');
  const action = plan.commands?.windowsTaskAction || {};
  const description = 'Ad ops unattended supervisor; writes heartbeat and enforces safety gates.';
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$action = New-ScheduledTaskAction -Execute ${psSingle(action.execute || 'npm.cmd')} -Argument ${psSingle(action.arguments || '')} -WorkingDirectory ${psSingle(action.workingDirectory || ROOT)}`,
    `$trigger = New-ScheduledTaskTrigger -Daily -At ${psSingle(startTime)}`,
    `$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest`,
    `Register-ScheduledTask -TaskName ${psSingle(taskName)} -Action $action -Trigger $trigger -Principal $principal -Description ${psSingle(description)} -Force | Out-Null`,
  ];
  if (plan.schedule?.completionAudit?.enabled === true && plan.commands?.windowsCompletionAuditAction) {
    const completion = plan.schedule.completionAudit || {};
    const completionAction = plan.commands.windowsCompletionAuditAction || {};
    lines.push(`$completionAction = New-ScheduledTaskAction -Execute ${psSingle(completionAction.execute || 'npm.cmd')} -Argument ${psSingle(completionAction.arguments || '')} -WorkingDirectory ${psSingle(completionAction.workingDirectory || ROOT)}`);
    lines.push(`$completionTrigger = New-ScheduledTaskTrigger -Daily -At ${psSingle(completion.startTime || '09:50')}`);
    lines.push(`Register-ScheduledTask -TaskName ${psSingle(completion.taskName || 'AdOpsAgentCompletionAudit')} -Action $completionAction -Trigger $completionTrigger -Principal $principal -Description ${psSingle('Ad ops post-trigger completion audit; verifies natural scheduled run proof.')} -Force | Out-Null`);
  }
  lines.push(...buildVerifyScript(plan, { includeErrorPreference: false }));
  return lines.join('\n');
}

function buildVerifyScript(plan = {}, options = {}) {
  const taskName = text(options.taskName || plan.schedule?.taskName || 'AdOpsAgentUnattendedSupervisor');
  const lines = [];
  if (options.includeErrorPreference !== false) lines.push("$ErrorActionPreference = 'Stop'");
  lines.push(`$task = Get-ScheduledTask -TaskName ${psSingle(taskName)} -ErrorAction Stop`);
  lines.push(`$info = Get-ScheduledTaskInfo -TaskName ${psSingle(taskName)} -ErrorAction SilentlyContinue`);
  lines.push('$action = @($task.Actions)[0]');
  lines.push('$trigger = @($task.Triggers)[0]');
  lines.push('[pscustomobject]@{');
  lines.push('  ok = $true');
  lines.push('  taskName = $task.TaskName');
  lines.push('  taskPath = $task.TaskPath');
  lines.push('  state = [string]$task.State');
  lines.push('  actionExecute = [string]$action.Execute');
  lines.push('  actionArguments = [string]$action.Arguments');
  lines.push('  actionWorkingDirectory = [string]$action.WorkingDirectory');
  lines.push('  triggerEnabled = [bool]$trigger.Enabled');
  lines.push('  runLevel = [string]$task.Principal.RunLevel');
  lines.push('  logonType = [string]$task.Principal.LogonType');
  lines.push('  nextRunTime = if ($info) { [string]$info.NextRunTime } else { "" }');
  lines.push('  lastRunTime = if ($info) { [string]$info.LastRunTime } else { "" }');
  lines.push('  lastTaskResult = if ($info) { [string]$info.LastTaskResult } else { "" }');
  lines.push('} | ConvertTo-Json -Compress');
  return lines;
}

function buildRunNowScript(plan = {}, options = {}) {
  const taskName = text(plan.schedule?.taskName || 'AdOpsAgentUnattendedSupervisor');
  const timeoutSeconds = Math.max(30, Number(options.timeoutSeconds || 900));
  return [
    "$ErrorActionPreference = 'Stop'",
    `$taskName = ${psSingle(taskName)}`,
    `$deadline = (Get-Date).AddSeconds(${timeoutSeconds})`,
    '$before = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue',
    '$beforeLastRun = if ($before) { [string]$before.LastRunTime } else { "" }',
    'Start-ScheduledTask -TaskName $taskName',
    'do {',
    '  Start-Sleep -Seconds 5',
    '  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
    '  $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue',
    '  $state = [string]$task.State',
    '  $lastRun = if ($info) { [string]$info.LastRunTime } else { "" }',
    '  $observed = ($lastRun -and $lastRun -ne $beforeLastRun)',
    '} while ($state -eq "Running" -and (Get-Date) -lt $deadline)',
    '$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
    '$info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue',
    '$action = @($task.Actions)[0]',
    '$trigger = @($task.Triggers)[0]',
    '$timedOut = ([string]$task.State -eq "Running")',
    '[pscustomobject]@{',
    '  ok = $true',
    '  runNowRequested = $true',
    '  runNowTimedOut = [bool]$timedOut',
    '  taskName = $task.TaskName',
    '  taskPath = $task.TaskPath',
    '  state = [string]$task.State',
    '  actionExecute = [string]$action.Execute',
    '  actionArguments = [string]$action.Arguments',
    '  actionWorkingDirectory = [string]$action.WorkingDirectory',
    '  triggerEnabled = [bool]$trigger.Enabled',
    '  runLevel = [string]$task.Principal.RunLevel',
    '  logonType = [string]$task.Principal.LogonType',
    '  nextRunTime = if ($info) { [string]$info.NextRunTime } else { "" }',
    '  lastRunTime = if ($info) { [string]$info.LastRunTime } else { "" }',
    '  lastTaskResult = if ($info) { [string]$info.LastTaskResult } else { "" }',
    '} | ConvertTo-Json -Compress',
  ].join('\n');
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(text(value));
  } catch (error) {
    return null;
  }
}

function taskResultOk(value = '') {
  const raw = text(value);
  if (!raw) return true;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed === 0;
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

function verifyInstalledTask(plan = {}, installed = {}) {
  const isCompletion = text(installed.taskName) === text(plan.schedule?.completionAudit?.taskName);
  const expected = isCompletion ? (plan.commands?.windowsCompletionAuditAction || {}) : (plan.commands?.windowsTaskAction || {});
  const expectedTaskName = isCompletion ? text(plan.schedule?.completionAudit?.taskName) : text(plan.schedule?.taskName);
  const issues = [];
  if (installed.ok !== true) {
    addIssue(issues, {
      id: 'scheduled_task_verify_failed',
      title: 'Scheduled task verification did not return ok=true',
      evidence: [JSON.stringify(installed).slice(0, 500)],
      nextAction: 'Re-run installation or inspect Windows Task Scheduler for the agent task.',
    });
    return issues;
  }
  if (text(installed.taskName) !== expectedTaskName) {
    addIssue(issues, {
      id: 'scheduled_task_name_mismatch',
      title: 'Installed scheduled task name does not match the plan',
      evidence: [`expected=${expectedTaskName}`, `actual=${text(installed.taskName)}`],
      nextAction: 'Install the generated plan again with the intended task name.',
    });
  }
  if (text(installed.actionExecute).toLowerCase() !== text(expected.execute).toLowerCase()) {
    addIssue(issues, {
      id: 'scheduled_task_execute_mismatch',
      title: 'Installed scheduled task executable does not match the plan',
      evidence: [`expected=${text(expected.execute)}`, `actual=${text(installed.actionExecute)}`],
      nextAction: 'Replace the scheduled task with the generated supervisor action.',
    });
  }
  if (text(installed.actionArguments) !== text(expected.arguments)) {
    addIssue(issues, {
      id: 'scheduled_task_arguments_mismatch',
      title: 'Installed scheduled task arguments do not match the plan',
      evidence: [`expected=${text(expected.arguments)}`, `actual=${text(installed.actionArguments)}`],
      nextAction: 'Replace the scheduled task; do not hand-edit arguments because that can bypass supervisor gates.',
    });
  }
  if (text(installed.actionWorkingDirectory) && text(installed.actionWorkingDirectory) !== text(expected.workingDirectory)) {
    addIssue(issues, {
      id: 'scheduled_task_workdir_mismatch',
      title: 'Installed scheduled task working directory does not match the plan',
      evidence: [`expected=${text(expected.workingDirectory)}`, `actual=${text(installed.actionWorkingDirectory)}`],
      nextAction: 'Replace the scheduled task with the generated working directory.',
    });
  }
  if (installed.triggerEnabled === false) {
    addIssue(issues, {
      id: 'scheduled_task_trigger_disabled',
      title: 'Installed scheduled task trigger is disabled',
      nextAction: 'Enable the daily trigger or reinstall the generated task.',
    });
  }
  if (text(installed.runLevel).toLowerCase() !== 'highest') {
    addIssue(issues, {
      id: 'scheduled_task_runlevel_not_highest',
      title: 'Installed scheduled task does not run with highest privileges',
      evidence: [`runLevel=${text(installed.runLevel)}`],
      nextAction: 'Reinstall the generated task so the supervisor can verify Task Scheduler state during unattended runs.',
    });
  }
  return issues;
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent unattended schedule install - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Mode: ${report.mode || 'dry_run'}`);
  lines.push(`- Install requested: ${report.requested?.install === true}`);
  lines.push(`- Verify requested: ${report.requested?.verifyInstalled === true}`);
  lines.push(`- Task: ${report.plan?.schedule?.taskName || ''}`);
  lines.push(`- Start time: ${report.plan?.schedule?.startTime || ''}`);
  lines.push(`- Installed state: ${report.installedTask?.state || ''}`);
  lines.push(`- Completion audit task: ${report.completionAuditTask?.taskName || ''}`);
  lines.push(`- Completion audit state: ${report.completionAuditTask?.state || ''}`);
  lines.push('');
  lines.push('## Command');
  lines.push('```powershell');
  lines.push(report.plan?.commands?.scheduleCommand || '');
  lines.push('```');
  lines.push('');
  lines.push('## Issues');
  if (!report.issues?.length) {
    lines.push('- none');
  } else {
    for (const item of report.issues) {
      lines.push(`- [${item.severity}] ${item.id}: ${item.title}`);
      if (item.nextAction) lines.push(`  - next: ${item.nextAction}`);
    }
  }
  return `${lines.join('\n')}\n`;
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
    planFile: get('--plan') || process.env.AGENT_UNATTENDED_SCHEDULE_PLAN_FILE || '',
    outFile: get('--out') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_MD_OUT || '',
    taskName: get('--task-name') || process.env.AGENT_UNATTENDED_TASK_NAME || '',
    startTime: get('--start-time') || process.env.AGENT_UNATTENDED_START_TIME || '',
    priorLearningMemoryFile: get('--prior-learning-memory') || process.env.AGENT_PRIOR_LEARNING_MEMORY_FILE || '',
    execute: args.includes('--execute') || process.env.AGENT_WRITE_EXECUTE === '1',
    executeIfReady: args.includes('--execute-if-ready') || process.env.AGENT_EXECUTE_IF_READY === '1',
    allowMissingPriorLearning: args.includes('--allow-missing-prior-learning') || process.env.AGENT_ALLOW_MISSING_PRIOR_LEARNING === '1',
    pinToday: args.includes('--pin-today') || process.env.AGENT_UNATTENDED_PIN_TODAY === '1',
    includePriorLearningInSchedule: args.includes('--include-prior-learning-in-schedule') || process.env.AGENT_UNATTENDED_INCLUDE_PRIOR_LEARNING === '1',
    install: args.includes('--install') || process.env.AGENT_UNATTENDED_INSTALL === '1',
    verifyInstalled: args.includes('--verify-installed') || process.env.AGENT_UNATTENDED_VERIFY_INSTALLED === '1',
    runNow: args.includes('--run-now') || process.env.AGENT_UNATTENDED_RUN_NOW === '1',
    runNowTimeoutSeconds: Number(get('--run-now-timeout-seconds') || process.env.AGENT_UNATTENDED_RUN_NOW_TIMEOUT_SECONDS || 900),
  };
}

function runAgentUnattendedScheduleInstall(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_unattended_schedule_install_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(timeContext.dataDate || businessDate);
  const agentDir = text(options.agentDir || DEFAULT_AGENT_DIR);
  const context = {
    businessDate,
    dataDate,
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
    runAt: text(timeContext.runAt || new Date().toISOString()),
  };
  const plan = loadOrBuildPlan({ ...options, agentDir }, timeContext);
  const issues = [...(plan.issues || [])];
  if (plan.ok !== true) {
    addIssue(issues, {
      id: 'schedule_plan_not_ready',
      title: 'Schedule plan is not ready for installation',
      evidence: [`planStatus=${text(plan.status)}`],
      nextAction: 'Fix schedule plan blockers before installing the OS-level task.',
    });
  }
  let installedTask = null;
  let completionAuditTask = null;
  let installError = '';
  const shouldVerify = options.install === true || options.verifyInstalled === true || options.runNow === true;
  const canTouchScheduler = plan.ok === true && !issues.some(item => item.severity === 'blocker');
  if (options.install === true && canTouchScheduler) {
    try {
      installedTask = runPowerShell(buildInstallScript(plan), options);
    } catch (error) {
      installError = text(error.stderr || error.stdout || error.message);
      addIssue(issues, {
        id: 'scheduled_task_install_failed',
        title: 'Scheduled task installation failed',
        evidence: [installError],
        nextAction: 'Inspect PowerShell/Task Scheduler permissions and retry with the generated plan.',
      });
    }
  } else if (options.install === true) {
    addIssue(issues, {
      id: 'scheduled_task_install_skipped',
      title: 'Scheduled task installation was skipped because the plan has blockers',
      nextAction: 'Fix schedule plan blockers before retrying --install.',
    });
  }
  if (options.runNow === true && !installError && canTouchScheduler) {
    try {
      installedTask = runPowerShell(buildRunNowScript(plan, { timeoutSeconds: options.runNowTimeoutSeconds }), options);
      if (installedTask.runNowTimedOut === true) {
        addIssue(issues, {
          id: 'scheduled_task_run_now_timeout',
          title: 'Scheduled task run-now verification timed out',
          evidence: [`timeoutSeconds=${Number(options.runNowTimeoutSeconds || 900)}`],
          nextAction: 'Inspect Windows Task Scheduler state and supervisor output before trusting unattended runtime.',
        });
      }
      if (installedTask.runNowTimedOut !== true && !taskResultOk(installedTask.lastTaskResult)) {
        addIssue(issues, {
          id: 'scheduled_task_run_now_nonzero_result',
          title: 'Scheduled task run-now completed with a nonzero result',
          evidence: [`lastTaskResult=${text(installedTask.lastTaskResult)}`],
          nextAction: 'Inspect unattended supervisor output and repair blockers before trusting the scheduled runtime path.',
        });
      }
    } catch (error) {
      addIssue(issues, {
        id: 'scheduled_task_run_now_failed',
        title: 'Scheduled task run-now verification failed',
        evidence: [text(error.stderr || error.stdout || error.message)],
        nextAction: 'Repair the installed task or permissions before trusting unattended runtime.',
      });
    }
  }
  if (shouldVerify && !installedTask && !installError && canTouchScheduler) {
    try {
      installedTask = runPowerShell(buildVerifyScript(plan).join('\n'), options);
    } catch (error) {
      addIssue(issues, {
        id: 'scheduled_task_not_found',
        title: 'Scheduled task was not found or could not be read',
        evidence: [text(error.stderr || error.stdout || error.message)],
        nextAction: 'Install the generated plan or verify the task name in Windows Task Scheduler.',
      });
    }
  }
  if (installedTask) {
    issues.push(...verifyInstalledTask(plan, installedTask));
  }
  if ((options.install === true || options.verifyInstalled === true) && plan.schedule?.completionAudit?.enabled === true && canTouchScheduler) {
    try {
      completionAuditTask = runPowerShell(buildVerifyScript(plan, {
        taskName: plan.schedule.completionAudit.taskName,
      }).join('\n'), options);
      issues.push(...verifyInstalledTask(plan, completionAuditTask));
    } catch (error) {
      addIssue(issues, {
        id: 'completion_audit_task_not_found',
        title: 'Completion audit scheduled task was not found or could not be read',
        evidence: [text(error.stderr || error.stdout || error.message)],
        nextAction: 'Install the generated plan so the post-trigger completion audit runs automatically after the supervisor task.',
      });
    }
  }
  const blockers = issues.filter(item => item.severity === 'blocker');
  const warnings = issues.filter(item => item.severity === 'warning');
  const status = blockers.length
    ? 'blocked'
    : (options.install === true ? 'installed' : (warnings.length ? 'ready_with_warnings' : 'ready'));
  const report = {
    generatedAt: context.runAt,
    businessDate,
    dataDate,
    sourceRunId: context.sourceRunId,
    status,
    ok: blockers.length === 0,
    mode: options.install === true ? 'install' : (options.runNow === true ? 'run_now' : (options.verifyInstalled === true ? 'verify_installed' : 'dry_run')),
    requested: {
      install: options.install === true,
      verifyInstalled: options.verifyInstalled === true,
      runNow: options.runNow === true,
    },
    plan,
    installedTask,
    completionAuditTask,
    installError,
    issues,
    tasks: issues.map(item => taskForIssue(item, context)),
  };
  const outFile = options.outFile || path.join(agentDir, `unattended_schedule_install_${businessDate}.json`);
  const markdownFile = options.markdownFile || path.join(agentDir, `unattended_schedule_install_${businessDate}.md`);
  report.files = { outFile, markdownFile, planFile: text(options.planFile || plan.files?.outFile || '') };
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  return report;
}

function main() {
  const report = runAgentUnattendedScheduleInstall(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    mode: report.mode,
    requested: report.requested,
    taskName: report.plan?.schedule?.taskName || '',
    installedTask: report.installedTask,
    completionAuditTask: report.completionAuditTask,
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
  buildInstallScript,
  buildRunNowScript,
  buildVerifyScript,
  parseArgs,
  renderMarkdown,
  runAgentUnattendedScheduleInstall,
  verifyInstalledTask,
};
