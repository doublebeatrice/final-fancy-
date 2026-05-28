const fs = require('fs');
const path = require('path');
const {
  buildSelfTestOptions,
  runAgentClosedLoop,
} = require('./run_agent_closed_loop');
const { runAgentReadinessAudit } = require('./run_agent_readiness_audit');
const { runAgentUnattendedScheduleInstall } = require('./run_agent_unattended_schedule_install');
const { runAgentUnattendedSchedulerAudit } = require('./run_agent_unattended_scheduler_audit');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

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

function defaultAgentFile(prefix, date, ext = 'json') {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${date}.${ext}`);
}

function previousLearningMemoryFile(today) {
  return defaultAgentFile('learning_memory', addDays(today, -1));
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
    outDir: get('--out-dir') || process.env.AGENT_OUT_DIR || '',
    outFile: get('--out') || process.env.AGENT_UNATTENDED_SUPERVISOR_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_UNATTENDED_SUPERVISOR_MD_OUT || '',
    priorLearningMemoryFile: get('--prior-learning-memory') || get('--learning-memory-in') || process.env.AGENT_PRIOR_LEARNING_MEMORY_FILE || '',
    ledgerFile: get('--ledger') || process.env.AGENT_LEDGER_FILE || '',
    inboxFile: get('--inbox') || process.env.AGENT_INBOX_FILE || '',
    reviewFile: get('--reviews') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    capabilityFile: get('--capabilities') || process.env.AGENT_CAPABILITY_REGISTRY_FILE || '',
    actionSchemaFile: get('--actions') || get('--action-schema') || process.env.ACTION_SCHEMA_FILE || '',
    snapshotFile: get('--snapshot') || process.env.PANEL_SNAPSHOT_FILE || '',
    learningFile: get('--learning') || process.env.AGENT_DAILY_LEARNING_FILE || '',
    execute: args.includes('--execute') || process.env.AGENT_WRITE_EXECUTE === '1',
    executeIfReady: args.includes('--execute-if-ready') || process.env.AGENT_EXECUTE_IF_READY === '1',
    allowMissingPriorLearning: args.includes('--allow-missing-prior-learning') || process.env.AGENT_ALLOW_MISSING_PRIOR_LEARNING === '1',
    generateDashboard: !args.includes('--skip-dashboard') && process.env.AGENT_SKIP_DASHBOARD !== '1',
    generateAutonomyAudit: !args.includes('--skip-autonomy-audit') && process.env.AGENT_SKIP_AUTONOMY_AUDIT !== '1',
    generateSchedulerAudit: !args.includes('--skip-scheduler-audit') && process.env.AGENT_SKIP_SCHEDULER_AUDIT !== '1',
    generateReadinessAudit: !args.includes('--skip-readiness-audit') && process.env.AGENT_SKIP_READINESS_AUDIT !== '1',
    readinessAuditFile: get('--readiness-audit-out') || process.env.AGENT_READINESS_AUDIT_OUT || '',
    readinessAuditMarkdownFile: get('--readiness-audit-md-out') || process.env.AGENT_READINESS_AUDIT_MD_OUT || '',
    schedulerAuditFile: get('--scheduler-audit') || process.env.AGENT_UNATTENDED_SCHEDULER_AUDIT_OUT || '',
    schedulerAuditMarkdownFile: get('--scheduler-audit-md-out') || process.env.AGENT_UNATTENDED_SCHEDULER_AUDIT_MD_OUT || '',
    scheduleInstallFile: get('--schedule-install') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_OUT || '',
    scheduleInstallMarkdownFile: get('--schedule-install-md-out') || process.env.AGENT_UNATTENDED_SCHEDULE_INSTALL_MD_OUT || '',
    scheduleCommand: get('--schedule-command') || process.env.AGENT_UNATTENDED_SCHEDULE_COMMAND || '',
    selfTest: args.includes('--self-test'),
  };
}

function issue(id, severity, title, evidence = [], nextAction = '') {
  return {
    id,
    severity,
    title,
    evidence: evidence.map(text).filter(Boolean),
    nextAction,
  };
}

function summarizeClosedLoop(report = {}) {
  const summary = report.summary || {};
  return {
    closedLoop: summary.closedLoop === true,
    dailyClosureStatus: text(summary.dailyClosureStatus || ''),
    commandFailed: Number(summary.commandFailed || 0),
    writeFailed: Number(summary.writeFailed || 0),
    writeBlocked: Number(summary.writeBlocked || 0),
    artifactVerificationOk: summary.artifactVerificationOk === true,
    autonomyStatus: text(summary.autonomyStatus || ''),
    autonomyBlockerCount: Number(summary.autonomyBlockerCount || 0),
    learningMemoryReady: summary.learningMemoryReady === true,
    learningMemoryStatus: text(summary.learningMemoryStatus || ''),
    learningMemoryConstraintCount: Number(summary.learningMemoryConstraintCount || 0),
    unattendedGateDecision: text(summary.unattendedGateDecision || ''),
    unattendedExecuteAllowed: summary.unattendedExecuteAllowed === true,
    unattendedGateBlockerCount: Number(summary.unattendedGateBlockerCount || 0),
    unattendedExecuted: summary.unattendedExecuted === true,
    priorLearningMemoryApplied: summary.priorLearningMemoryApplied === true,
    priorLearningConstraintTasks: Number(summary.priorLearningConstraintTasks || 0),
    priorLearningBlockers: Number(summary.priorLearningBlockers || 0),
    priorLearningWarnings: Number(summary.priorLearningWarnings || 0),
  };
}

function buildIssues({ closedLoop = {}, priorLearning = {}, requested = {}, effective = {} } = {}) {
  const summary = summarizeClosedLoop(closedLoop);
  const issues = [];
  const liveRequested = requested.execute === true && requested.executeIfReady === true;
  if (priorLearning.required && !priorLearning.exists) {
    issues.push(issue(
      'prior_learning_memory_missing',
      liveRequested ? 'blocker' : 'warning',
      'Prior learning memory is missing',
      [priorLearning.file],
      'Generate or point to the previous learning_memory file before trusting unattended live execution.'
    ));
  }
  if (liveRequested && effective.executeIfReady !== true) {
    issues.push(issue(
      'live_execute_not_armed',
      'blocker',
      'Live unattended execute request was not armed',
      [`execute=${requested.execute}`, `executeIfReady=${requested.executeIfReady}`, `priorLearningExists=${priorLearning.exists}`],
      'Live unattended execute requires --execute, --execute-if-ready, and learning continuity unless explicitly bootstrapped.'
    ));
  }
  if (summary.commandFailed > 0 || summary.writeFailed > 0 || summary.writeBlocked > 0) {
    issues.push(issue(
      'closed_loop_stage_failed',
      'blocker',
      'Closed-loop has failed or blocked stages',
      [`commandFailed=${summary.commandFailed}`, `writeFailed=${summary.writeFailed}`, `writeBlocked=${summary.writeBlocked}`],
      'Repair failed stages before scheduling the next unattended live run.'
    ));
  }
  if (summary.artifactVerificationOk === false) {
    issues.push(issue(
      'artifact_verification_failed',
      'blocker',
      'Artifact verification failed',
      [],
      'Fix closure artifacts before treating the run as unattended-ready.'
    ));
  }
  if (summary.autonomyStatus === 'not_ready' || summary.autonomyBlockerCount > 0) {
    issues.push(issue(
      'autonomy_audit_blocked',
      'blocker',
      'Autonomy audit is not ready',
      [`autonomyStatus=${summary.autonomyStatus}`, `autonomyBlockerCount=${summary.autonomyBlockerCount}`],
      'Resolve autonomy audit blockers before unattended continuation.'
    ));
  }
  if (summary.learningMemoryReady === false || summary.learningMemoryStatus === 'blocked_constraints') {
    issues.push(issue(
      'learning_memory_blocked',
      'blocker',
      'Learning memory is missing or blocked',
      [`learningMemoryReady=${summary.learningMemoryReady}`, `learningMemoryStatus=${summary.learningMemoryStatus}`],
      'Resolve active learning or correction constraints before live unattended execution.'
    ));
  }
  if (summary.priorLearningBlockers > 0) {
    issues.push(issue(
      'prior_learning_has_blockers',
      'blocker',
      'Prior learning memory has blocker constraints',
      [`priorLearningBlockers=${summary.priorLearningBlockers}`],
      'Close prior learning blockers before reusing affected rules.'
    ));
  }
  if (liveRequested && summary.unattendedExecuteAllowed === true && summary.unattendedExecuted !== true) {
    issues.push(issue(
      'unattended_execute_not_completed',
      'blocker',
      'Live unattended execute did not complete',
      [`gate=${summary.unattendedGateDecision}`, `allowed=${summary.unattendedExecuteAllowed}`, `executed=${summary.unattendedExecuted}`],
      'Inspect unattended gate and write execution output before retrying.'
    ));
  } else if (liveRequested && summary.unattendedGateDecision === 'no_actions') {
    issues.push(issue(
      'unattended_live_no_actions',
      'warning',
      'Live unattended run found no eligible actions',
      [`gate=${summary.unattendedGateDecision}`, `eligibleActions=0`],
      'This is a normal no-op run; continue the next evidence loop instead of treating it as failed execution.'
    ));
  } else if (summary.unattendedGateBlockerCount > 0) {
    issues.push(issue(
      'unattended_gate_has_blockers',
      liveRequested ? 'blocker' : 'warning',
      'Unattended gate has blockers',
      [`unattendedGateBlockerCount=${summary.unattendedGateBlockerCount}`],
      'Resolve unattended gate blockers before allowing execute-if-ready.'
    ));
  }
  return issues;
}

function supervisorStatus(issues = [], closedLoop = {}, requested = {}) {
  const blockers = issues.filter(item => item.severity === 'blocker');
  const summary = summarizeClosedLoop(closedLoop);
  if (blockers.length) return 'blocked';
  if (requested.execute === true && requested.executeIfReady === true && summary.unattendedExecuted === true) return 'executed';
  if (summary.unattendedGateDecision === 'execute_allowed') return 'ready';
  if (summary.dailyClosureStatus) return summary.dailyClosureStatus;
  return summary.closedLoop ? 'ready' : 'needs_attention';
}

function summarizeReadinessAudit(report = {}) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  return {
    generated: true,
    ok: report.ok === true,
    status: text(report.status || ''),
    summary: report.summary || {},
    failedChecks: checks.filter(item => item.status === 'fail').map(item => text(item.id)).filter(Boolean),
    warningChecks: checks.filter(item => item.status === 'warning').map(item => text(item.id)).filter(Boolean),
    files: {
      outFile: text(report.files?.outFile || ''),
      markdownFile: text(report.files?.markdownFile || ''),
    },
  };
}

function commandArg(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/[\s"]/.test(raw)) return `"${raw.replace(/"/g, '\\"')}"`;
  return raw;
}

function defaultScheduleCommand({ outDir = '', requested = {} } = {}) {
  const args = ['--out-dir', outDir];
  if (requested.execute === true) args.push('--execute');
  if (requested.executeIfReady === true) args.push('--execute-if-ready');
  return ['npm', 'run', 'ops:agent:unattended-supervisor', '--', ...args.map(commandArg)].join(' ');
}

function summarizeSchedulerAudit(report = {}) {
  return {
    generated: true,
    ok: report.ok === true,
    status: text(report.status || ''),
    summary: report.summary || {},
    issues: (report.issues || []).map(item => text(item.id)).filter(Boolean),
    files: {
      outFile: text(report.files?.outFile || ''),
      markdownFile: text(report.files?.markdownFile || ''),
    },
  };
}

function summarizeScheduleInstall(report = {}) {
  return {
    generated: true,
    ok: report.ok === true,
    status: text(report.status || ''),
    mode: text(report.mode || ''),
    installedTask: report.installedTask || null,
    issues: (report.issues || []).map(item => text(item.id)).filter(Boolean),
    files: {
      outFile: text(report.files?.outFile || ''),
      markdownFile: text(report.files?.markdownFile || ''),
    },
  };
}

function schedulerAuditFiles({ options = {}, today = '', outDir = '' } = {}) {
  return {
    scheduleInstallFile: options.scheduleInstallFile || path.join(outDir, `unattended_schedule_install_${today}.json`),
    scheduleInstallMarkdownFile: options.scheduleInstallMarkdownFile || path.join(outDir, `unattended_schedule_install_${today}.md`),
    schedulerAuditFile: options.schedulerAuditFile || path.join(outDir, `unattended_scheduler_audit_${today}.json`),
    schedulerAuditMarkdownFile: options.schedulerAuditMarkdownFile || path.join(outDir, `unattended_scheduler_audit_${today}.md`),
  };
}

function readinessAuditOptions({ options = {}, report = {}, timeContext = {}, today = '', outDir = '', outFile = '' } = {}) {
  const readinessOutFile = options.readinessAuditFile || path.join(outDir, `agent_readiness_audit_${today}.json`);
  const readinessMarkdownFile = options.readinessAuditMarkdownFile || path.join(outDir, `agent_readiness_audit_${today}.md`);
  return {
    timeContext,
    today,
    site: options.site || 'Amazon.com',
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
    agentDir: outDir,
    supervisorFile: outFile,
    schedulerAuditFile: report.files?.schedulerAuditFile || options.schedulerAuditFile || path.join(outDir, `unattended_scheduler_audit_${today}.json`),
    scheduleInstallFile: report.files?.scheduleInstallFile || options.scheduleInstallFile || path.join(outDir, `unattended_schedule_install_${today}.json`),
    unattendedGateFile: report.files?.unattendedGateFile || '',
    learningMemoryFile: report.files?.learningMemoryFile || '',
    closedLoopFile: report.files?.closedLoopFile || '',
    requireCorrectionLesson: true,
    requireRiskRoutingLesson: true,
    outFile: readinessOutFile,
    markdownFile: readinessMarkdownFile,
  };
}

function runSupervisorSchedulerAudit({ options = {}, report = {}, timeContext = {}, today = '', outDir = '', requested = {} } = {}) {
  const files = schedulerAuditFiles({ options, today, outDir });
  const scheduleCommand = text(options.scheduleCommand || defaultScheduleCommand({ outDir, requested }));
  const scheduleInstall = runAgentUnattendedScheduleInstall({
    ...options,
    timeContext,
    today,
    agentDir: outDir,
    execute: requested.execute === true,
    executeIfReady: requested.executeIfReady === true,
    install: false,
    verifyInstalled: true,
    outFile: files.scheduleInstallFile,
    markdownFile: files.scheduleInstallMarkdownFile,
  });
  report.scheduleInstall = summarizeScheduleInstall(scheduleInstall);
  report.files.scheduleInstallFile = report.scheduleInstall.files.outFile;
  report.files.scheduleInstallMarkdownFile = report.scheduleInstall.files.markdownFile;
  const schedulerAudit = runAgentUnattendedSchedulerAudit({
    ...options,
    timeContext,
    today,
    heartbeatDir: outDir,
    scheduleCommand,
    scheduleInstallFile: report.files.scheduleInstallFile,
    requireSchedule: true,
    requireLiveExecute: requested.execute === true && requested.executeIfReady === true,
    outFile: files.schedulerAuditFile,
    markdownFile: files.schedulerAuditMarkdownFile,
  });
  report.schedulerAudit = summarizeSchedulerAudit(schedulerAudit);
  report.files.schedulerAuditFile = report.schedulerAudit.files.outFile;
  report.files.schedulerAuditMarkdownFile = report.schedulerAudit.files.markdownFile;
  if (schedulerAudit.ok !== true && requested.execute === true && requested.executeIfReady === true) {
    report.issues.push(issue(
      'scheduler_health_audit_failed',
      'blocker',
      'Scheduler health audit is not ready',
      [`status=${text(schedulerAudit.status)}`, `issues=${report.schedulerAudit.issues.join(',')}`],
      'Repair installed schedule or heartbeat continuity before trusting live unattended production.'
    ));
  }
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent unattended supervisor - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Mode: ${report.mode || 'dry-run'}`);
  lines.push(`- Prior learning: ${report.priorLearning?.exists ? 'present' : 'missing'} (${report.priorLearning?.file || ''})`);
  lines.push(`- Closed loop: ${report.closedLoop?.closedLoop === true}`);
  lines.push(`- Autonomy: ${report.closedLoop?.autonomyStatus || ''}`);
  lines.push(`- Learning memory: ${report.closedLoop?.learningMemoryStatus || ''}`);
  lines.push(`- Gate: ${report.closedLoop?.unattendedGateDecision || ''}`);
  lines.push(`- Executed: ${report.closedLoop?.unattendedExecuted === true}`);
  if (report.readinessAudit) {
    lines.push(`- Readiness audit: ${report.readinessAudit.generated === true ? report.readinessAudit.status || 'generated' : 'not generated'}`);
  }
  if (report.schedulerAudit) {
    lines.push(`- Scheduler audit: ${report.schedulerAudit.generated === true ? report.schedulerAudit.status || 'generated' : 'not generated'}`);
  }
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
  lines.push('');
  lines.push('## Files');
  for (const [key, value] of Object.entries(report.files || {})) {
    if (value) lines.push(`- ${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function runAgentUnattendedSupervisor(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_unattended_supervisor_${Date.now()}`,
  });
  const today = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  const outFile = options.outFile || path.join(outDir, `unattended_supervisor_${today}.json`);
  const markdownFile = options.markdownFile || path.join(outDir, `unattended_supervisor_${today}.md`);
  const priorFile = options.priorLearningMemoryFile || previousLearningMemoryFile(today);
  const priorExists = !!priorFile && fs.existsSync(priorFile);
  const priorRequired = options.selfTest !== true && options.allowMissingPriorLearning !== true;
  const requested = {
    execute: options.execute === true,
    executeIfReady: options.executeIfReady === true,
  };
  const effective = {
    execute: requested.execute,
    executeIfReady: requested.execute && requested.executeIfReady && (priorExists || !priorRequired),
  };
  const baseOptions = {
    ...options,
    timeContext,
    today,
    outDir,
    priorLearningMemoryFile: priorFile,
    execute: effective.execute,
    executeIfReady: effective.executeIfReady,
  };
  const closedLoopOptions = options.selfTest === true
    ? buildSelfTestOptions(baseOptions)
    : baseOptions;
  const closedLoop = runAgentClosedLoop(closedLoopOptions);
  const priorLearning = {
    file: priorFile,
    exists: priorExists,
    required: priorRequired,
    status: text(readJson(priorFile, {}).status || ''),
  };
  const issues = buildIssues({ closedLoop, priorLearning, requested, effective });
  const status = supervisorStatus(issues, closedLoop, requested);
  const report = {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate: closedLoop.businessDate || today,
    dataDate: closedLoop.dataDate || dateOnly(timeContext.dataDate || today),
    sourceRunId: text(timeContext.sourceRunId || ''),
    status,
    ok: !issues.some(item => item.severity === 'blocker'),
    mode: requested.execute && requested.executeIfReady ? 'execute_if_ready' : 'dry_run',
    requested,
    effective,
    priorLearning,
    closedLoop: summarizeClosedLoop(closedLoop),
    issues,
    files: {
      outFile,
      markdownFile,
      closedLoopFile: closedLoop.files?.closedLoopFile || '',
      handoffFile: closedLoop.files?.handoffOutFile || '',
      autonomyAuditFile: closedLoop.files?.autonomyAuditFile || '',
      learningMemoryFile: closedLoop.files?.learningMemoryFile || '',
      unattendedGateFile: closedLoop.files?.unattendedGateFile || '',
      unattendedExecutionFile: closedLoop.files?.unattendedExecutionFile || '',
      priorLearningMemoryFile: priorFile,
    },
    closedLoopReport: closedLoop,
  };
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  if (options.generateSchedulerAudit !== false) {
    try {
      runSupervisorSchedulerAudit({
        options,
        report,
        timeContext,
        today,
        outDir,
        requested,
      });
    } catch (error) {
      report.schedulerAudit = {
        generated: false,
        ok: false,
        status: 'failed',
        error: text(error.message || error),
      };
      if (requested.execute === true && requested.executeIfReady === true) {
        report.issues.push(issue(
          'scheduler_health_audit_failed',
          'blocker',
          'Scheduler health audit failed to run',
          [report.schedulerAudit.error],
          'Repair scheduled-task verification before trusting live unattended production.'
        ));
      }
    }
    report.ok = !report.issues.some(item => item.severity === 'blocker');
    report.status = supervisorStatus(report.issues, closedLoop, requested);
    writeJson(outFile, report);
    writeText(markdownFile, renderMarkdown(report));
  } else {
    report.schedulerAudit = { generated: false, skipped: true };
    writeJson(outFile, report);
    writeText(markdownFile, renderMarkdown(report));
  }
  if (options.generateReadinessAudit !== false) {
    try {
      const readiness = runAgentReadinessAudit(readinessAuditOptions({
        options,
        report,
        timeContext,
        today,
        outDir,
        outFile,
      }));
      report.readinessAudit = summarizeReadinessAudit(readiness);
      report.files.readinessAuditFile = report.readinessAudit.files.outFile;
      report.files.readinessAuditMarkdownFile = report.readinessAudit.files.markdownFile;
    } catch (error) {
      report.readinessAudit = {
        generated: false,
        ok: false,
        status: 'failed',
        error: text(error.message || error),
      };
    }
    writeJson(outFile, report);
    writeText(markdownFile, renderMarkdown(report));
  } else {
    report.readinessAudit = { generated: false, skipped: true };
    writeJson(outFile, report);
    writeText(markdownFile, renderMarkdown(report));
  }
  return report;
}

function main() {
  const report = runAgentUnattendedSupervisor(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    mode: report.mode,
    requested: report.requested,
    effective: report.effective,
    closedLoop: report.closedLoop,
    files: report.files,
    schedulerAudit: report.schedulerAudit,
    scheduleInstall: report.scheduleInstall,
    readinessAudit: report.readinessAudit,
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
  buildIssues,
  parseArgs,
  renderMarkdown,
  runAgentUnattendedSupervisor,
  supervisorStatus,
};
