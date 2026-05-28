const fs = require('fs');
const path = require('path');
const { normalizeAgentTask } = require('../src/agent_control_plane');
const { buildOpsTimeContext } = require('../src/ops_time');

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

function readJson(file, fallback = {}) {
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

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
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
    heartbeatDir: get('--heartbeat-dir') || process.env.AGENT_UNATTENDED_HEARTBEAT_DIR || '',
    scheduleCommand: get('--schedule-command') || process.env.AGENT_UNATTENDED_SCHEDULE_COMMAND || '',
    scheduleFile: get('--schedule-file') || process.env.AGENT_UNATTENDED_SCHEDULE_FILE || '',
    scheduleInstallFile: get('--schedule-install') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_OUT || '',
    outFile: get('--out') || process.env.AGENT_UNATTENDED_SCHEDULER_AUDIT_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_UNATTENDED_SCHEDULER_AUDIT_MD_OUT || '',
    maxAgeHours: Number(get('--max-age-hours') || process.env.AGENT_UNATTENDED_MAX_HEARTBEAT_AGE_HOURS || 30),
    maxConsecutiveFailures: Number(get('--max-consecutive-failures') || process.env.AGENT_UNATTENDED_MAX_CONSECUTIVE_FAILURES || 2),
    requireSchedule: args.includes('--require-schedule') || process.env.AGENT_UNATTENDED_REQUIRE_SCHEDULE === '1',
    requireLiveExecute: args.includes('--require-live-execute') || process.env.AGENT_UNATTENDED_REQUIRE_LIVE_EXECUTE === '1',
    requireInstalledTask: args.includes('--require-installed-task') || process.env.AGENT_UNATTENDED_REQUIRE_INSTALLED_TASK === '1',
    requireNaturalScheduledRun: args.includes('--require-natural-scheduled-run') || process.env.AGENT_UNATTENDED_REQUIRE_NATURAL_SCHEDULED_RUN === '1',
    naturalScheduleToleranceMinutes: Number(get('--natural-schedule-tolerance-minutes') || process.env.AGENT_UNATTENDED_NATURAL_SCHEDULE_TOLERANCE_MINUTES || 15),
  };
}

function listHeartbeatFiles(dir = DEFAULT_AGENT_DIR) {
  try {
    return fs.readdirSync(dir)
      .filter(name => /^unattended_supervisor_\d{4}-\d{2}-\d{2}\.json$/i.test(name))
      .map(name => path.join(dir, name));
  } catch (error) {
    return [];
  }
}

function generatedTime(report = {}) {
  const date = new Date(text(report.generatedAt || `${report.businessDate || ''}T00:00:00.000Z`));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function loadHeartbeats(dir = DEFAULT_AGENT_DIR) {
  return listHeartbeatFiles(dir)
    .map(file => ({ file, report: readJson(file, {}) }))
    .filter(item => item.report && Object.keys(item.report).length)
    .sort((a, b) => generatedTime(b.report) - generatedTime(a.report));
}

function scheduleCommandFromFile(file = '') {
  const raw = readJson(file, null);
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return text(
    raw.commands?.scheduleCommand ||
    raw.schedule?.command ||
    raw.command ||
    raw.scheduleCommand ||
    raw.action ||
    raw.exec ||
    ''
  );
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

function latestHeartbeatTime(heartbeats = []) {
  return heartbeats.length ? generatedTime(heartbeats[0].report || {}) : 0;
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

function commandIssues(command = '', options = {}) {
  const issues = [];
  const value = text(command);
  if (!value) {
    if (options.requireSchedule) {
      addIssue(issues, {
        id: 'schedule_command_missing',
        title: 'Scheduled command proof is missing',
        nextAction: 'Record the production scheduled command or provide --schedule-command/--schedule-file for audit.',
      });
    } else {
      addIssue(issues, {
        id: 'schedule_command_not_provided',
        severity: 'warning',
        title: 'Scheduled command proof was not provided',
        nextAction: 'Provide --schedule-command or --schedule-file so the audit can verify the production entrypoint.',
      });
    }
    return issues;
  }
  if (!/ops:agent:unattended-supervisor/.test(value)) {
    addIssue(issues, {
      id: 'schedule_not_using_supervisor',
      title: 'Scheduled command does not use unattended supervisor',
      evidence: [value],
      nextAction: 'Schedule ops:agent:unattended-supervisor instead of lower-level agent commands.',
    });
  }
  if (/ops:agent:closed-loop/.test(value)) {
    addIssue(issues, {
      id: 'schedule_bypasses_supervisor',
      title: 'Scheduled command calls closed-loop directly',
      evidence: [value],
      nextAction: 'Move the scheduled entrypoint to ops:agent:unattended-supervisor so heartbeat and safety gates are enforced.',
    });
  }
  if (/--execute-if-ready/.test(value) && !/(^|\s)--execute(\s|$)/.test(value)) {
    addIssue(issues, {
      id: 'schedule_execute_if_ready_without_execute',
      title: 'Scheduled command requests execute-if-ready without execute',
      evidence: [value],
      nextAction: 'Use both --execute and --execute-if-ready for live unattended writes, or remove execute-if-ready for dry-run supervision.',
    });
  }
  if (options.requireLiveExecute === true && (!/(^|\s)--execute(\s|$)/.test(value) || !/(^|\s)--execute-if-ready(\s|$)/.test(value))) {
    addIssue(issues, {
      id: 'schedule_live_execute_not_armed',
      title: 'Scheduled command is not armed for live unattended execution',
      evidence: [value],
      nextAction: 'Use ops:agent:unattended-supervisor with both --execute and --execute-if-ready; the unattended gate still decides whether any write can land.',
    });
  }
  return issues;
}

function consecutiveFailures(heartbeats = []) {
  let count = 0;
  for (const item of heartbeats) {
    const report = item.report || {};
    if (report.ok === true && !['blocked', 'failed'].includes(text(report.status))) break;
    count += 1;
  }
  return count;
}

function heartbeatIssues(heartbeats = [], nowMs = Date.now(), options = {}) {
  const issues = [];
  const latest = heartbeats[0] || null;
  if (!latest) {
    addIssue(issues, {
      id: 'heartbeat_missing',
      title: 'No unattended supervisor heartbeat found',
      nextAction: 'Run ops:agent:unattended-supervisor and make the scheduler write heartbeat files every business day.',
    });
    return issues;
  }
  const generatedAt = generatedTime(latest.report);
  const ageHours = generatedAt ? (nowMs - generatedAt) / 36e5 : Infinity;
  if (!Number.isFinite(ageHours) || ageHours > Number(options.maxAgeHours || 30)) {
    addIssue(issues, {
      id: 'heartbeat_stale',
      title: 'Latest unattended supervisor heartbeat is stale',
      evidence: [`ageHours=${Number.isFinite(ageHours) ? ageHours.toFixed(2) : 'unknown'}`, `maxAgeHours=${options.maxAgeHours || 30}`, relative(latest.file)],
      nextAction: 'Confirm the scheduled supervisor ran today and refresh the heartbeat.',
    });
  }
  if (latest.report.ok !== true || ['blocked', 'failed'].includes(text(latest.report.status))) {
    addIssue(issues, {
      id: 'latest_heartbeat_not_ok',
      title: 'Latest unattended supervisor heartbeat is not OK',
      evidence: [`ok=${latest.report.ok === true}`, `status=${text(latest.report.status)}`, relative(latest.file)],
      nextAction: 'Open the latest supervisor issues and close blockers before the next scheduled run.',
    });
  }
  if (latest.report.priorLearning?.required === true && latest.report.priorLearning?.exists !== true) {
    addIssue(issues, {
      id: 'latest_prior_learning_missing',
      title: 'Latest heartbeat lacks required prior learning memory',
      evidence: [text(latest.report.priorLearning?.file), relative(latest.file)],
      nextAction: 'Generate or link prior learning memory before allowing unattended live execution.',
    });
  }
  const failCount = consecutiveFailures(heartbeats);
  if (failCount > Number(options.maxConsecutiveFailures || 2)) {
    addIssue(issues, {
      id: 'consecutive_unattended_failures',
      title: 'Unattended supervisor has repeated failures',
      evidence: [`consecutiveFailures=${failCount}`, `maxConsecutiveFailures=${options.maxConsecutiveFailures || 2}`],
      nextAction: 'Stop live unattended execution and repair the recurring blocker before resuming schedule.',
    });
  }
  return issues;
}

function taskResultOk(value = '') {
  const raw = text(value);
  if (!raw) return true;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed === 0;
}

function taskRunning(installed = {}) {
  return text(installed.state).toLowerCase() === 'running' || text(installed.lastTaskResult) === '267009';
}

function naturalScheduledRun(installed = {}, options = {}) {
  const lastRunMs = parseTaskTime(installed.lastRunTime);
  const nextRunMs = parseTaskTime(installed.nextRunTime);
  const toleranceMs = Math.max(1, Number(options.naturalScheduleToleranceMinutes || 15)) * 60 * 1000;
  const expectedPreviousNaturalRunMs = nextRunMs > 0 ? nextRunMs - DAY_MS : 0;
  const observed = lastRunMs > 0 &&
    expectedPreviousNaturalRunMs > 0 &&
    Math.abs(lastRunMs - expectedPreviousNaturalRunMs) <= toleranceMs;
  return {
    observed,
    expectedPreviousNaturalRunMs,
    expectedPreviousNaturalRun: expectedPreviousNaturalRunMs ? new Date(expectedPreviousNaturalRunMs).toISOString() : '',
    toleranceMinutes: Math.round(toleranceMs / 60000),
  };
}

function installedTaskSummary(scheduleInstall = {}, heartbeats = [], nowMs = Date.now(), options = {}) {
  const installed = scheduleInstall.installedTask || {};
  const lastRunMs = parseTaskTime(installed.lastRunTime);
  const nextRunMs = parseTaskTime(installed.nextRunTime);
  const latestMs = latestHeartbeatTime(heartbeats);
  const runObserved = lastRunMs > 0 && lastRunMs <= nowMs + 5 * 60 * 1000;
  const heartbeatAfterLastRun = runObserved ? latestMs + 5 * 60 * 1000 >= lastRunMs : null;
  const natural = naturalScheduledRun(installed, options);
  return {
    scheduleInstallFileProvided: !!text(options.scheduleInstallFile || ''),
    scheduleInstallOk: scheduleInstall.ok === true,
    installedTaskReady: installed.ok === true && ['ready', 'running'].includes(text(installed.state).toLowerCase()) && installed.triggerEnabled !== false,
    installedTaskState: text(installed.state || ''),
    installedTriggerEnabled: installed.triggerEnabled === undefined ? null : installed.triggerEnabled !== false,
    installedNextRunTime: text(installed.nextRunTime || ''),
    installedLastRunTime: text(installed.lastRunTime || ''),
    installedLastTaskResult: text(installed.lastTaskResult || ''),
    scheduledTaskRunObserved: runObserved,
    scheduledTaskLastResultOk: runObserved ? (taskRunning(installed) ? null : taskResultOk(installed.lastTaskResult)) : null,
    latestHeartbeatAfterLastRun: heartbeatAfterLastRun,
    naturalScheduledRunObserved: natural.observed,
    expectedPreviousNaturalRun: natural.expectedPreviousNaturalRun,
    naturalScheduleToleranceMinutes: natural.toleranceMinutes,
    latestHeartbeatGeneratedAt: text(heartbeats[0]?.report?.generatedAt || ''),
    nextRunDue: nextRunMs > 0 && nextRunMs <= nowMs,
  };
}

function installedTaskIssues(scheduleInstall = {}, heartbeats = [], nowMs = Date.now(), options = {}) {
  const issues = [];
  const scheduleInstallFile = text(options.scheduleInstallFile || '');
  if (!scheduleInstallFile) {
    if (options.requireInstalledTask === true) {
      addIssue(issues, {
        id: 'schedule_install_report_missing',
        title: 'Installed scheduled task proof is missing',
        nextAction: 'Run unattended-schedule-install with --verify-installed and pass --schedule-install to scheduler audit.',
      });
    }
    return issues;
  }
  if (!scheduleInstall || !Object.keys(scheduleInstall).length) {
    addIssue(issues, {
      id: 'schedule_install_report_unreadable',
      title: 'Installed scheduled task report could not be read',
      evidence: [scheduleInstallFile],
      nextAction: 'Regenerate unattended_schedule_install with --verify-installed before trusting scheduler health.',
    });
    return issues;
  }
  if (scheduleInstall.ok !== true) {
    addIssue(issues, {
      id: 'schedule_install_report_not_ok',
      title: 'Installed scheduled task report is not OK',
      evidence: [`ok=${scheduleInstall.ok === true}`, `status=${text(scheduleInstall.status)}`, scheduleInstallFile],
      nextAction: 'Fix schedule installation blockers before trusting unattended production runs.',
    });
  }
  const installed = scheduleInstall.installedTask || {};
  if (installed.ok !== true) {
    addIssue(issues, {
      id: 'installed_task_verify_not_ok',
      title: 'Installed scheduled task verification is not OK',
      evidence: [JSON.stringify(installed).slice(0, 500)],
      nextAction: 'Verify or reinstall the generated Windows Task Scheduler entry.',
    });
    return issues;
  }
  if (text(installed.state).toLowerCase() !== 'ready' && !taskRunning(installed)) {
    addIssue(issues, {
      id: 'installed_task_not_ready',
      title: 'Installed scheduled task is not Ready',
      evidence: [`state=${text(installed.state)}`],
      nextAction: 'Repair the scheduled task state before relying on unattended operation.',
    });
  } else if (taskRunning(installed)) {
    addIssue(issues, {
      id: 'scheduled_task_currently_running',
      severity: 'warning',
      title: 'Installed scheduled task is currently running',
      evidence: [`state=${text(installed.state)}`, `lastTaskResult=${text(installed.lastTaskResult)}`],
      nextAction: 'Run scheduler audit again after the task exits to verify final lastTaskResult and heartbeat continuity.',
    });
  }
  if (installed.triggerEnabled === false) {
    addIssue(issues, {
      id: 'installed_task_trigger_disabled',
      title: 'Installed scheduled task trigger is disabled',
      nextAction: 'Enable the daily trigger or reinstall the generated task.',
    });
  }
  const lastRunMs = parseTaskTime(installed.lastRunTime);
  const nextRunMs = parseTaskTime(installed.nextRunTime);
  const runObserved = lastRunMs > 0 && lastRunMs <= nowMs + 5 * 60 * 1000;
  const latestMs = latestHeartbeatTime(heartbeats);
  const natural = naturalScheduledRun(installed, options);
  if (runObserved) {
    if (!taskRunning(installed) && !taskResultOk(installed.lastTaskResult)) {
      addIssue(issues, {
        id: 'scheduled_task_last_result_failed',
        title: 'Installed scheduled task last run did not exit cleanly',
        evidence: [`lastRunTime=${text(installed.lastRunTime)}`, `lastTaskResult=${text(installed.lastTaskResult)}`],
        nextAction: 'Inspect the scheduled task output and repair the supervisor run before the next unattended cycle.',
      });
    }
    if (!latestMs || latestMs + 5 * 60 * 1000 < lastRunMs) {
      addIssue(issues, {
        id: 'scheduled_run_missing_heartbeat',
        severity: taskRunning(installed) ? 'warning' : 'blocker',
        title: 'Scheduled task ran but no newer supervisor heartbeat was written',
        evidence: [
          `lastRunTime=${text(installed.lastRunTime)}`,
          `latestHeartbeat=${text(heartbeats[0]?.report?.generatedAt || '')}`,
        ],
        nextAction: 'Verify the task working directory and supervisor output path; scheduled runs must write the daily heartbeat.',
      });
    }
    if (!natural.observed) {
      addIssue(issues, {
        id: 'scheduled_task_last_run_not_natural_trigger',
        severity: options.requireNaturalScheduledRun === true ? 'blocker' : 'warning',
        title: 'Installed scheduled task last run was not the natural daily trigger',
        evidence: [
          `lastRunTime=${text(installed.lastRunTime)}`,
          `nextRunTime=${text(installed.nextRunTime)}`,
          `expectedPreviousNaturalRun=${natural.expectedPreviousNaturalRun}`,
          `toleranceMinutes=${natural.toleranceMinutes}`,
        ],
        nextAction: 'Keep the task installed; after the next natural trigger, rerun scheduler audit and require natural scheduled run proof.',
      });
    }
  } else if (nextRunMs > 0 && nextRunMs <= nowMs) {
    addIssue(issues, {
      id: 'scheduled_task_due_without_run',
      title: 'Installed scheduled task is due but no valid last run is recorded',
      evidence: [`nextRunTime=${text(installed.nextRunTime)}`, `lastRunTime=${text(installed.lastRunTime)}`],
      nextAction: 'Open Windows Task Scheduler history and run supervisor manually if the due run was missed.',
    });
  } else {
    addIssue(issues, {
      id: options.requireNaturalScheduledRun === true ? 'natural_scheduled_run_not_yet_observed' : 'scheduled_task_run_not_yet_observed',
      severity: options.requireNaturalScheduledRun === true ? 'blocker' : 'warning',
      title: 'Installed scheduled task has not produced a real scheduled run yet',
      evidence: [`nextRunTime=${text(installed.nextRunTime)}`, `lastRunTime=${text(installed.lastRunTime)}`],
      nextAction: 'Keep the scheduler audit active; after the next scheduled time it must show a clean last run and a newer supervisor heartbeat.',
    });
  }
  return issues;
}

function taskForIssue(issue = {}, context = {}) {
  return normalizeAgentTask({
    source: 'unattended_scheduler_audit',
    kind: 'scheduler_health_gap',
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
    rawInput: `unattended_scheduler_audit:${issue.id}`,
  }, context);
}

function buildSchedulerAudit(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const heartbeatDir = options.heartbeatDir || DEFAULT_AGENT_DIR;
  const heartbeats = options.heartbeats || loadHeartbeats(heartbeatDir);
  const scheduleCommand = text(options.scheduleCommand || scheduleCommandFromFile(options.scheduleFile || ''));
  const scheduleInstall = options.scheduleInstall || readJson(options.scheduleInstallFile || '', {});
  const nowMs = new Date(generatedAt).getTime();
  const issues = [
    ...commandIssues(scheduleCommand, options),
    ...heartbeatIssues(heartbeats, Number.isFinite(nowMs) ? nowMs : Date.now(), options),
    ...installedTaskIssues(scheduleInstall, heartbeats, Number.isFinite(nowMs) ? nowMs : Date.now(), options),
  ];
  const blockers = issues.filter(item => item.severity === 'blocker');
  const warnings = issues.filter(item => item.severity === 'warning');
  const latest = heartbeats[0] || {};
  const context = { businessDate, dataDate, runAt: generatedAt, sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || '') };
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId: context.sourceRunId,
    status: blockers.length ? 'blocked' : (warnings.length ? 'ready_with_warnings' : 'ready'),
    ok: blockers.length === 0,
    summary: {
      blockers: blockers.length,
      warnings: warnings.length,
      heartbeatCount: heartbeats.length,
      latestHeartbeatFile: latest.file || '',
      latestHeartbeatStatus: text(latest.report?.status || ''),
      latestHeartbeatOk: latest.report?.ok === true,
      consecutiveFailures: consecutiveFailures(heartbeats),
      scheduleCommandProvided: !!scheduleCommand,
      scheduleUsesSupervisor: /ops:agent:unattended-supervisor/.test(scheduleCommand),
      scheduleLiveExecuteArmed: /(^|\s)--execute(\s|$)/.test(scheduleCommand) && /(^|\s)--execute-if-ready(\s|$)/.test(scheduleCommand),
      ...installedTaskSummary(scheduleInstall, heartbeats, Number.isFinite(nowMs) ? nowMs : Date.now(), options),
    },
    schedule: {
      command: scheduleCommand,
      file: text(options.scheduleFile || ''),
      installFile: text(options.scheduleInstallFile || ''),
      requireSchedule: options.requireSchedule === true,
      requireLiveExecute: options.requireLiveExecute === true,
      requireInstalledTask: options.requireInstalledTask === true,
      requireNaturalScheduledRun: options.requireNaturalScheduledRun === true,
    },
    installedTask: scheduleInstall.installedTask || null,
    latestHeartbeat: latest.report || null,
    heartbeats: heartbeats.map(item => ({
      file: item.file,
      generatedAt: text(item.report?.generatedAt || ''),
      businessDate: text(item.report?.businessDate || ''),
      status: text(item.report?.status || ''),
      ok: item.report?.ok === true,
      mode: text(item.report?.mode || ''),
    })),
    issues,
    tasks: issues.map(item => taskForIssue(item, context)),
  };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent unattended scheduler audit - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Heartbeats: ${report.summary?.heartbeatCount || 0}`);
  lines.push(`- Latest heartbeat: ${report.summary?.latestHeartbeatFile || ''}`);
  lines.push(`- Schedule uses supervisor: ${report.summary?.scheduleUsesSupervisor === true}`);
  lines.push(`- Schedule live execute armed: ${report.summary?.scheduleLiveExecuteArmed === true}`);
  lines.push(`- Consecutive failures: ${report.summary?.consecutiveFailures || 0}`);
  lines.push(`- Installed task ready: ${report.summary?.installedTaskReady === true}`);
  lines.push(`- Scheduled run observed: ${report.summary?.scheduledTaskRunObserved === true}`);
  lines.push(`- Natural scheduled run observed: ${report.summary?.naturalScheduledRunObserved === true}`);
  lines.push(`- Latest heartbeat after last run: ${report.summary?.latestHeartbeatAfterLastRun === true}`);
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

function runAgentUnattendedSchedulerAudit(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_unattended_scheduler_audit_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const report = buildSchedulerAudit(options, timeContext);
  const outFile = options.outFile || path.join(options.heartbeatDir || DEFAULT_AGENT_DIR, `unattended_scheduler_audit_${businessDate}.json`);
  const markdownFile = options.markdownFile || path.join(options.heartbeatDir || DEFAULT_AGENT_DIR, `unattended_scheduler_audit_${businessDate}.md`);
  report.files = { outFile, markdownFile };
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  return report;
}

function main() {
  const report = runAgentUnattendedSchedulerAudit(parseArgs(process.argv));
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
  buildSchedulerAudit,
  commandIssues,
  heartbeatIssues,
  loadHeartbeats,
  parseArgs,
  renderMarkdown,
  runAgentUnattendedSchedulerAudit,
  installedTaskIssues,
  installedTaskSummary,
};
