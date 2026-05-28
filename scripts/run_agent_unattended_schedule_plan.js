const fs = require('fs');
const path = require('path');
const { normalizeAgentTask } = require('../src/agent_control_plane');
const { buildOpsTimeContext } = require('../src/ops_time');
const { parseNpmRunCommand } = require('./run_agent_command_runner');
const { commandIssues } = require('./run_agent_unattended_scheduler_audit');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join('data', 'agent');
const DEFAULT_TASK_NAME = 'AdOpsAgentUnattendedSupervisor';
const DEFAULT_COMPLETION_TASK_NAME = 'AdOpsAgentCompletionAudit';
const DEFAULT_START_TIME = '09:30';
const DEFAULT_COMPLETION_AUDIT_DELAY_MINUTES = 20;
const DEFAULT_NATURAL_SCHEDULE_TOLERANCE_MINUTES = 15;

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

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function addMinutesToTime(value, minutes) {
  const raw = isValidStartTime(value) ? value : DEFAULT_START_TIME;
  const [hour, minute] = raw.split(':').map(Number);
  const total = (((hour * 60 + minute + Number(minutes || 0)) % 1440) + 1440) % 1440;
  const nextHour = String(Math.floor(total / 60)).padStart(2, '0');
  const nextMinute = String(total % 60).padStart(2, '0');
  return `${nextHour}:${nextMinute}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function commandArg(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/[\s"]/.test(raw)) return `"${raw.replace(/"/g, '\\"')}"`;
  return raw;
}

function buildNpmCommand(script, args = []) {
  const cleaned = args.map(text).filter(Boolean);
  return ['npm', 'run', script, '--', ...cleaned.map(commandArg)].join(' ');
}

function buildNpmActionArgument(script, args = []) {
  const cleaned = args.map(text).filter(Boolean);
  return ['run', script, '--', ...cleaned.map(commandArg)].join(' ');
}

function cmdQuote(value) {
  return `"${text(value).replace(/"/g, '\\"')}"`;
}

function buildCmdActionArgument(scriptFile, args = [], options = {}) {
  const nodePath = text(options.nodePath || process.execPath);
  const logFile = path.join(ROOT, options.logFile || path.join('data', 'agent', 'unattended_supervisor_task.log'));
  const cleaned = [cmdQuote(nodePath), cmdQuote(path.join(ROOT, scriptFile)), ...args.map(commandArg)].join(' ');
  return `/d /s /c "${cleaned} >> ${cmdQuote(logFile)} 2>&1"`;
}

function isValidStartTime(value) {
  const raw = text(value);
  if (!/^\d{2}:\d{2}$/.test(raw)) return false;
  const [hour, minute] = raw.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function psSingle(value) {
  return `'${text(value).replace(/'/g, "''")}'`;
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
    source: 'unattended_schedule_plan',
    kind: 'schedule_plan_gap',
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
    rawInput: `unattended_schedule_plan:${issue.id}`,
  }, context);
}

function defaultPriorLearningFile(today, agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `learning_memory_${addDays(today, -1)}.json`);
}

function supervisorArgs(options = {}, context = {}, mode = 'schedule') {
  const args = [];
  const agentDir = text(options.agentDir || DEFAULT_AGENT_DIR);
  if (mode === 'run_now' || options.pinToday === true) args.push('--today', context.businessDate);
  args.push('--out-dir', agentDir);
  if (mode === 'run_now' || options.includePriorLearningInSchedule === true) {
    args.push('--prior-learning-memory', options.priorLearningMemoryFile || defaultPriorLearningFile(context.businessDate, agentDir));
  }
  if (options.execute === true) args.push('--execute');
  if (options.executeIfReady === true) args.push('--execute-if-ready');
  if (options.allowMissingPriorLearning === true) args.push('--allow-missing-prior-learning');
  return args;
}

function completionAuditArgs(options = {}, context = {}, mode = 'schedule') {
  const args = [];
  const agentDir = text(options.agentDir || DEFAULT_AGENT_DIR);
  if (mode === 'run_now' || options.pinToday === true) args.push('--today', context.businessDate);
  args.push('--out-dir', agentDir);
  const toleranceMinutes = Number(options.naturalScheduleToleranceMinutes || DEFAULT_NATURAL_SCHEDULE_TOLERANCE_MINUTES);
  args.push('--natural-schedule-tolerance-minutes', String(toleranceMinutes));
  if (mode === 'schedule') {
    args.push('--scheduled-task-invocation', '--scheduled-task-name', text(options.completionAuditTaskName || DEFAULT_COMPLETION_TASK_NAME));
  }
  return args;
}

function buildCommands(options = {}, context = {}) {
  const scheduleArgs = supervisorArgs(options, context, 'schedule');
  const runNowArgs = supervisorArgs(options, context, 'run_now');
  const completionArgs = completionAuditArgs(options, context, 'schedule');
  const completionRunNowArgs = completionAuditArgs(options, context, 'run_now');
  const scheduleCommand = buildNpmCommand('ops:agent:unattended-supervisor', scheduleArgs);
  const runNowCommand = buildNpmCommand('ops:agent:unattended-supervisor', runNowArgs);
  const completionAuditCommand = buildNpmCommand('ops:agent:completion-audit', completionArgs);
  const completionAuditRunNowCommand = buildNpmCommand('ops:agent:completion-audit', completionRunNowArgs);
  const auditOut = path.join(options.agentDir || DEFAULT_AGENT_DIR, `unattended_scheduler_audit_${context.businessDate}.json`);
  const scheduleInstallOut = path.join(options.agentDir || DEFAULT_AGENT_DIR, `unattended_schedule_install_${context.businessDate}.json`);
  const auditCommand = buildNpmCommand('ops:agent:unattended-scheduler-audit', [
    '--heartbeat-dir',
    options.agentDir || DEFAULT_AGENT_DIR,
    '--schedule-command',
    scheduleCommand,
    '--schedule-install',
    scheduleInstallOut,
    '--require-schedule',
    ...(options.execute === true && options.executeIfReady === true ? ['--require-live-execute'] : []),
    '--today',
    context.businessDate,
    '--out',
    auditOut,
  ]);
  return {
    scheduleCommand,
    runNowCommand,
    completionAuditCommand,
    completionAuditRunNowCommand,
    schedulerAuditCommand: auditCommand,
    windowsTaskAction: {
      execute: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      arguments: buildCmdActionArgument(path.join('scripts', 'run_agent_unattended_supervisor.js'), scheduleArgs),
      workingDirectory: ROOT,
    },
    windowsCompletionAuditAction: {
      execute: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      arguments: buildCmdActionArgument(path.join('scripts', 'run_agent_completion_audit.js'), completionArgs, {
        logFile: path.join('data', 'agent', 'unattended_completion_audit_task.log'),
      }),
      workingDirectory: ROOT,
    },
  };
}

function registerTaskScript({ taskName = '', startTime = '', action = {}, description = '' } = {}) {
  return [
    `$action = New-ScheduledTaskAction -Execute ${psSingle(action.execute)} -Argument ${psSingle(action.arguments)} -WorkingDirectory ${psSingle(action.workingDirectory || ROOT)}`,
    `$trigger = New-ScheduledTaskTrigger -Daily -At ${psSingle(startTime)}`,
    `$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest`,
    `Register-ScheduledTask -TaskName ${psSingle(taskName)} -Action $action -Trigger $trigger -Principal $principal -Description ${psSingle(description)} -Force`,
  ];
}

function buildRegisterScript(options = {}, commands = {}) {
  const startTime = text(options.startTime || DEFAULT_START_TIME);
  const taskName = text(options.taskName || DEFAULT_TASK_NAME);
  return registerTaskScript({
    taskName,
    startTime,
    action: commands.windowsTaskAction || {},
    description: 'Ad ops unattended supervisor; writes heartbeat and enforces safety gates.',
  });
}

function buildCompletionRegisterScript(options = {}, commands = {}) {
  return registerTaskScript({
    taskName: text(options.completionAuditTaskName || DEFAULT_COMPLETION_TASK_NAME),
    startTime: text(options.completionAuditStartTime || addMinutesToTime(options.startTime || DEFAULT_START_TIME, options.completionAuditDelayMinutes || DEFAULT_COMPLETION_AUDIT_DELAY_MINUTES)),
    action: commands.windowsCompletionAuditAction || {},
    description: 'Ad ops post-trigger completion audit; verifies natural scheduled run proof.',
  });
}

function validatePlan(options = {}, commands = {}) {
  const issues = [];
  if (!isValidStartTime(options.startTime || DEFAULT_START_TIME)) {
    addIssue(issues, {
      id: 'invalid_start_time',
      title: 'Scheduled start time must use HH:mm 24-hour format',
      evidence: [options.startTime],
      nextAction: 'Use a value like 09:30 for --start-time.',
    });
  }
  if (options.executeIfReady === true && options.execute !== true) {
    addIssue(issues, {
      id: 'execute_if_ready_without_execute',
      title: 'Schedule plan requests execute-if-ready without execute',
      evidence: ['--execute-if-ready'],
      nextAction: 'Use both --execute and --execute-if-ready for live unattended writes, or remove execute-if-ready for dry-run supervision.',
    });
  }
  if (options.execute === true && options.executeIfReady === true && options.allowMissingPriorLearning === true) {
    addIssue(issues, {
      id: 'live_schedule_allows_missing_prior_learning',
      title: 'Live schedule weakens learning continuity',
      evidence: ['--allow-missing-prior-learning'],
      nextAction: 'Do not put --allow-missing-prior-learning in a recurring live unattended schedule.',
    });
  }
  if (options.pinToday === true) {
    addIssue(issues, {
      id: 'schedule_pins_business_date',
      severity: 'warning',
      title: 'Recurring schedule command pins a business date',
      evidence: [commands.scheduleCommand],
      nextAction: 'Use date pinning only for one-off verification; recurring production schedules should let the supervisor derive the business date.',
    });
  }
  for (const item of commandIssues(commands.scheduleCommand, { requireSchedule: true })) {
    issues.push(item);
  }
  const scheduleParsed = parseNpmRunCommand(commands.scheduleCommand);
  if (!scheduleParsed.ok) {
    addIssue(issues, {
      id: 'schedule_command_not_allowlisted',
      title: 'Schedule command is not accepted by the command allowlist',
      evidence: [scheduleParsed.reason, commands.scheduleCommand],
      nextAction: 'Use npm run ops:agent:unattended-supervisor as the scheduled entrypoint.',
    });
  }
  const auditParsed = parseNpmRunCommand(commands.schedulerAuditCommand);
  if (!auditParsed.ok) {
    addIssue(issues, {
      id: 'scheduler_audit_command_not_allowlisted',
      title: 'Scheduler audit command is not accepted by the command allowlist',
      evidence: [auditParsed.reason, commands.schedulerAuditCommand],
      nextAction: 'Use npm run ops:agent:unattended-scheduler-audit for the schedule health audit.',
    });
  }
  const completionParsed = parseNpmRunCommand(commands.completionAuditCommand);
  if (!completionParsed.ok) {
    addIssue(issues, {
      id: 'completion_audit_command_not_allowlisted',
      title: 'Completion audit command is not accepted by the command allowlist',
      evidence: [completionParsed.reason, commands.completionAuditCommand],
      nextAction: 'Use npm run ops:agent:completion-audit for post-trigger completion verification.',
    });
  }
  return issues;
}

function buildUnattendedSchedulePlan(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const agentDir = text(options.agentDir || DEFAULT_AGENT_DIR);
  const context = {
    businessDate,
    dataDate,
    runAt: generatedAt,
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
  };
  const normalized = {
    ...options,
    agentDir,
    taskName: text(options.taskName || DEFAULT_TASK_NAME),
    completionAuditTaskName: text(options.completionAuditTaskName || DEFAULT_COMPLETION_TASK_NAME),
    startTime: text(options.startTime || DEFAULT_START_TIME),
    completionAuditDelayMinutes: Number(options.completionAuditDelayMinutes || DEFAULT_COMPLETION_AUDIT_DELAY_MINUTES),
    completionAuditStartTime: text(options.completionAuditStartTime || addMinutesToTime(options.startTime || DEFAULT_START_TIME, options.completionAuditDelayMinutes || DEFAULT_COMPLETION_AUDIT_DELAY_MINUTES)),
    naturalScheduleToleranceMinutes: Number(options.naturalScheduleToleranceMinutes || DEFAULT_NATURAL_SCHEDULE_TOLERANCE_MINUTES),
    priorLearningMemoryFile: text(options.priorLearningMemoryFile || defaultPriorLearningFile(businessDate, agentDir)),
  };
  const commands = buildCommands(normalized, context);
  const registerScript = buildRegisterScript(normalized, commands);
  const completionRegisterScript = buildCompletionRegisterScript(normalized, commands);
  const issues = validatePlan(normalized, commands);
  const blockers = issues.filter(item => item.severity === 'blocker');
  const warnings = issues.filter(item => item.severity === 'warning');
  const liveRequested = normalized.execute === true && normalized.executeIfReady === true;
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId: context.sourceRunId,
    status: blockers.length ? 'blocked' : (warnings.length ? 'ready_with_warnings' : 'ready'),
    ok: blockers.length === 0,
    mode: normalized.executeIfReady === true && normalized.execute !== true ? 'invalid' : (liveRequested ? 'execute_if_ready' : 'dry_run'),
    requested: {
      execute: normalized.execute === true,
      executeIfReady: normalized.executeIfReady === true,
      allowMissingPriorLearning: normalized.allowMissingPriorLearning === true,
      pinToday: normalized.pinToday === true,
    },
    schedule: {
      taskName: normalized.taskName,
      frequency: 'daily',
      startTime: normalized.startTime,
      workingDirectory: ROOT,
      heartbeatDir: agentDir,
      usesSupervisor: /ops:agent:unattended-supervisor/.test(commands.scheduleCommand),
      doubleArmRequired: true,
      completionAudit: {
        enabled: true,
        taskName: normalized.completionAuditTaskName,
        startTime: normalized.completionAuditStartTime,
        delayMinutes: normalized.completionAuditDelayMinutes,
        naturalScheduleToleranceMinutes: normalized.naturalScheduleToleranceMinutes,
        command: commands.completionAuditCommand,
      },
    },
    priorLearning: {
      requiredForLiveExecute: true,
      scheduleUsesSupervisorDefaultPreviousDay: normalized.includePriorLearningInSchedule !== true,
      defaultFileForRunNow: normalized.priorLearningMemoryFile,
      includePriorLearningInSchedule: normalized.includePriorLearningInSchedule === true,
    },
    commands,
    scheduler: {
      platform: 'windows_task_scheduler',
      registerScript,
      completionRegisterScript,
      installBehavior: 'plan_only_not_executed',
    },
    issues,
    tasks: issues.map(item => taskForIssue(item, context)),
  };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent unattended schedule plan - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Mode: ${report.mode || 'dry_run'}`);
  lines.push(`- Task: ${report.schedule?.taskName || ''}`);
  lines.push(`- Start time: ${report.schedule?.startTime || ''}`);
  lines.push(`- Uses supervisor: ${report.schedule?.usesSupervisor === true}`);
  lines.push(`- Plan only: ${report.scheduler?.installBehavior === 'plan_only_not_executed'}`);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  lines.push('Scheduled command:');
  lines.push('```powershell');
  lines.push(report.commands?.scheduleCommand || '');
  lines.push('```');
  lines.push('');
  lines.push('Run now command:');
  lines.push('```powershell');
  lines.push(report.commands?.runNowCommand || '');
  lines.push('```');
  lines.push('');
  lines.push('Scheduler audit command:');
  lines.push('```powershell');
  lines.push(report.commands?.schedulerAuditCommand || '');
  lines.push('```');
  lines.push('');
  lines.push('Completion audit command:');
  lines.push('```powershell');
  lines.push(report.commands?.completionAuditCommand || '');
  lines.push('```');
  lines.push('');
  lines.push('Windows Task Scheduler registration script:');
  lines.push('```powershell');
  for (const line of report.scheduler?.registerScript || []) lines.push(line);
  lines.push('```');
  lines.push('');
  lines.push('Windows Task Scheduler completion audit registration script:');
  lines.push('```powershell');
  for (const line of report.scheduler?.completionRegisterScript || []) lines.push(line);
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
    outFile: get('--out') || process.env.AGENT_UNATTENDED_SCHEDULE_PLAN_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_UNATTENDED_SCHEDULE_PLAN_MD_OUT || '',
    taskName: get('--task-name') || process.env.AGENT_UNATTENDED_TASK_NAME || DEFAULT_TASK_NAME,
    completionAuditTaskName: get('--completion-audit-task-name') || process.env.AGENT_COMPLETION_AUDIT_TASK_NAME || DEFAULT_COMPLETION_TASK_NAME,
    startTime: get('--start-time') || process.env.AGENT_UNATTENDED_START_TIME || DEFAULT_START_TIME,
    completionAuditStartTime: get('--completion-audit-start-time') || process.env.AGENT_COMPLETION_AUDIT_START_TIME || '',
    completionAuditDelayMinutes: Number(get('--completion-audit-delay-minutes') || process.env.AGENT_COMPLETION_AUDIT_DELAY_MINUTES || DEFAULT_COMPLETION_AUDIT_DELAY_MINUTES),
    naturalScheduleToleranceMinutes: Number(get('--natural-schedule-tolerance-minutes') || process.env.AGENT_NATURAL_SCHEDULE_TOLERANCE_MINUTES || DEFAULT_NATURAL_SCHEDULE_TOLERANCE_MINUTES),
    priorLearningMemoryFile: get('--prior-learning-memory') || process.env.AGENT_PRIOR_LEARNING_MEMORY_FILE || '',
    execute: args.includes('--execute') || process.env.AGENT_WRITE_EXECUTE === '1',
    executeIfReady: args.includes('--execute-if-ready') || process.env.AGENT_EXECUTE_IF_READY === '1',
    allowMissingPriorLearning: args.includes('--allow-missing-prior-learning') || process.env.AGENT_ALLOW_MISSING_PRIOR_LEARNING === '1',
    pinToday: args.includes('--pin-today') || process.env.AGENT_UNATTENDED_PIN_TODAY === '1',
    includePriorLearningInSchedule: args.includes('--include-prior-learning-in-schedule') || process.env.AGENT_UNATTENDED_INCLUDE_PRIOR_LEARNING === '1',
  };
}

function runAgentUnattendedSchedulePlan(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_unattended_schedule_plan_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const agentDir = text(options.agentDir || DEFAULT_AGENT_DIR);
  const report = buildUnattendedSchedulePlan({ ...options, agentDir }, timeContext);
  const outFile = options.outFile || path.join(agentDir, `unattended_schedule_plan_${businessDate}.json`);
  const markdownFile = options.markdownFile || path.join(agentDir, `unattended_schedule_plan_${businessDate}.md`);
  report.files = { outFile, markdownFile };
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  return report;
}

function main() {
  const report = runAgentUnattendedSchedulePlan(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    mode: report.mode,
    schedule: report.schedule,
    commands: report.commands,
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
  buildCommands,
  buildUnattendedSchedulePlan,
  parseArgs,
  renderMarkdown,
  runAgentUnattendedSchedulePlan,
  validatePlan,
};
