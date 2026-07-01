const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join(ROOT, 'data', 'agent');

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

function defaultAgentFile(prefix, date, ext = 'json', agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `${prefix}_${date}.${ext}`);
}

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function packageScripts() {
  return readJson(path.join(ROOT, 'package.json'), {})?.scripts || {};
}

function makeRequirement(id, status, title, evidence = [], nextAction = '') {
  return {
    id,
    status,
    title,
    evidence: list(evidence),
    nextAction: text(nextAction),
  };
}

function checkStatus(checks = [], id = '') {
  return text(checks.find(item => item.id === id)?.status || '');
}

function riskRoutingReady(learning = {}, correctionRisk = {}) {
  const doNotApply = list(learning.nextRunBrief?.doNotApplyWhen);
  const evidenceBeforeReuse = list(learning.nextRunBrief?.evidenceBeforeReuse);
  const correctionSignals = list(correctionRisk.correction?.signals);
  const correctionControls = list(correctionRisk.audit?.immediateControls);
  const learningRuleReady = doNotApply.some(item => /risk level is the only reason/i.test(item)) &&
    evidenceBeforeReuse.some(item => /route_supported_operating_action|execution_design/i.test(item));
  const correctionRiskReady = correctionSignals.includes('risk_as_inaction_excuse') &&
    correctionControls.includes('risk_level_must_not_be_used_as_do_nothing_reason');
  return learningRuleReady && (correctionRiskReady || Number(learning.summary?.corrections || 0) > 0);
}

function coverageSufficiencyReady(learning = {}, readiness = {}) {
  const doNotApply = list(learning.nextRunBrief?.doNotApplyWhen);
  const evidenceBeforeReuse = list(learning.nextRunBrief?.evidenceBeforeReuse);
  const readinessSummaryReady = readiness.summary?.coverageSufficiencyReady === true;
  const readinessCheckReady = (Array.isArray(readiness.checks) ? readiness.checks : [])
    .some(item => item.id === 'coverage_sufficiency_correction_memory' && item.status === 'pass');
  return (readinessSummaryReady || readinessCheckReady) &&
    doNotApply.some(item => /coverage sufficiency has not been answered before action landing details/i.test(item)) &&
    evidenceBeforeReuse.some(item => /coverage[_\s-]?ratio/i.test(item));
}

function buildGoalAudit(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const files = {
    supervisorFile: options.supervisorFile || defaultAgentFile('unattended_supervisor', businessDate, 'json', agentDir),
    readinessFile: options.readinessFile || defaultAgentFile('agent_readiness_audit', businessDate, 'json', agentDir),
    completionFile: options.completionFile || defaultAgentFile('agent_completion_audit', businessDate, 'json', agentDir),
    scheduleInstallFile: options.scheduleInstallFile || defaultAgentFile('unattended_schedule_install', businessDate, 'json', agentDir),
    learningMemoryFile: options.learningMemoryFile || defaultAgentFile('learning_memory', businessDate, 'json', agentDir),
    correctionRiskFile: options.correctionRiskFile || defaultAgentFile('correction_risk', businessDate, 'json', agentDir),
    unattendedGateFile: options.unattendedGateFile || defaultAgentFile('unattended_gate', businessDate, 'json', agentDir),
  };
  const reports = {
    supervisor: readJson(files.supervisorFile, {}),
    readiness: readJson(files.readinessFile, {}),
    completion: readJson(files.completionFile, {}),
    scheduleInstall: readJson(files.scheduleInstallFile, {}),
    learningMemory: readJson(files.learningMemoryFile, {}),
    correctionRisk: readJson(files.correctionRiskFile, {}),
    unattendedGate: readJson(files.unattendedGateFile, {}),
  };
  const scripts = packageScripts();
  const readinessChecks = Array.isArray(reports.readiness.checks) ? reports.readiness.checks : [];
  const supervisorSummary = reports.supervisor.closedLoop || {};
  const completionSummary = reports.completion.summary || {};
  const install = reports.scheduleInstall || {};
  const learning = reports.learningMemory || {};
  const correctionRisk = reports.correctionRisk || {};

  const requirements = [];
  const requiredScripts = [
    'ops:agent:hub',
    'ops:agent:closed-loop',
    'ops:agent:unattended-supervisor',
    'ops:agent:unattended-schedule-plan',
    'ops:agent:unattended-schedule-install',
    'ops:agent:readiness-audit',
    'ops:agent:completion-audit',
    'ops:agent:learning-memory',
    'ops:agent:correction-risk',
  ];
  const missingScripts = requiredScripts.filter(name => !scripts[name]);
  const closedLoopReady = reports.supervisor.ok === true &&
    supervisorSummary.closedLoop === true &&
    number(supervisorSummary.commandFailed) === 0 &&
    number(supervisorSummary.writeFailed) === 0 &&
    number(supervisorSummary.writeBlocked) === 0 &&
    supervisorSummary.artifactVerificationOk === true &&
    checkStatus(readinessChecks, 'agent_closed_loop_control_plane') !== 'fail' &&
    missingScripts.length === 0;
  requirements.push(makeRequirement(
    'agent_control_plane',
    closedLoopReady ? 'pass' : 'fail',
    'Agent control plane closes the daily loop with verified artifacts',
    [
      relative(files.supervisorFile),
      relative(files.readinessFile),
      `missingScripts=${missingScripts.join(',')}`,
      `supervisorOk=${reports.supervisor.ok === true}`,
      `closedLoop=${supervisorSummary.closedLoop === true}`,
      `artifactVerificationOk=${supervisorSummary.artifactVerificationOk === true}`,
    ],
    'Repair closed-loop artifacts or missing package scripts before claiming agentization.'
  ));

  const liveScheduleReady = reports.readiness.summary?.liveScheduleReady === true &&
    reports.readiness.summary?.scheduledRuntimeReady === true &&
    install.ok === true &&
    install.installedTask?.triggerEnabled !== false &&
    text(install.installedTask?.actionArguments).includes('--execute') &&
    text(install.installedTask?.actionArguments).includes('--execute-if-ready');
  requirements.push(makeRequirement(
    'live_unattended_schedule',
    liveScheduleReady ? 'pass' : 'fail',
    'Production unattended schedule is installed, live-armed, and observable',
    [
      relative(files.scheduleInstallFile),
      `readinessLiveScheduleReady=${reports.readiness.summary?.liveScheduleReady === true}`,
      `scheduledRuntimeReady=${reports.readiness.summary?.scheduledRuntimeReady === true}`,
      `scheduleInstallOk=${install.ok === true}`,
      `lastTaskResult=${text(install.installedTask?.lastTaskResult)}`,
      `nextRunTime=${text(install.installedTask?.nextRunTime)}`,
    ],
    'Reinstall or verify the generated Windows scheduled task and run readiness audit.'
  ));

  const completionReady = reports.completion.ok === true &&
    completionSummary.schedulerOk === true &&
    completionSummary.readinessOk === true &&
    completionSummary.completionAuditTaskRuntimeReady === true &&
    completionSummary.scheduledTaskInvocationOk === true &&
    completionSummary.naturalScheduledRuntimeReady === true;
  const completionPending = reports.completion.status === 'not_ready' &&
    (completionSummary.completionAuditTaskRuntimeReady === false ||
      completionSummary.scheduledTaskInvocationOk === false ||
      completionSummary.naturalScheduledRuntimeReady === false);
  requirements.push(makeRequirement(
    'natural_unattended_completion',
    completionReady ? 'pass' : (completionPending ? 'pending' : 'fail'),
    'Final completion proof comes from natural scheduled supervisor and completion-audit tasks',
    [
      relative(files.completionFile),
      `completionOk=${reports.completion.ok === true}`,
      `completionStatus=${text(reports.completion.status)}`,
      `completionAuditTaskRuntimeReady=${completionSummary.completionAuditTaskRuntimeReady === true}`,
      `scheduledTaskInvocationOk=${completionSummary.scheduledTaskInvocationOk === true}`,
      `naturalScheduledRuntimeReady=${completionSummary.naturalScheduledRuntimeReady === true}`,
    ],
    'Keep AdOpsAgentUnattendedSupervisor and AdOpsAgentCompletionAudit installed; final proof requires the next natural scheduled trigger.'
  ));

  const learningReady = learning.status === 'active_watch' &&
    number(learning.summary?.constraints) > 0 &&
    number(learning.summary?.blockers) === 0 &&
    list(learning.nextRunBrief?.mustReadBeforeDecision).length > 0 &&
    list(learning.nextRunBrief?.evidenceBeforeReuse).length > 0 &&
    supervisorSummary.priorLearningMemoryApplied === true;
  requirements.push(makeRequirement(
    'long_term_learning_loop',
    learningReady ? 'pass' : 'fail',
    'Long-term learning is machine-readable and applied to the next run',
    [
      relative(files.learningMemoryFile),
      `learningStatus=${text(learning.status)}`,
      `constraints=${number(learning.summary?.constraints)}`,
      `blockers=${number(learning.summary?.blockers)}`,
      `mustRead=${list(learning.nextRunBrief?.mustReadBeforeDecision).length}`,
      `evidenceBeforeReuse=${list(learning.nextRunBrief?.evidenceBeforeReuse).length}`,
      `priorLearningMemoryApplied=${supervisorSummary.priorLearningMemoryApplied === true}`,
    ],
    'Regenerate learning memory and ensure the supervisor applies prior learning before decisions.'
  ));

  const correctionReady = reports.readiness.summary?.correctionReady === true &&
    number(learning.summary?.corrections) > 0 &&
    text(correctionRisk.audit?.severity || correctionRisk.summary?.severity) !== '' &&
    list(correctionRisk.tasks).length > 0;
  requirements.push(makeRequirement(
    'operator_correction_system',
    correctionReady ? 'pass' : 'fail',
    'Operator corrections create risk audit tasks and reusable learning patches',
    [
      relative(files.correctionRiskFile),
      `readinessCorrectionReady=${reports.readiness.summary?.correctionReady === true}`,
      `learningCorrections=${number(learning.summary?.corrections)}`,
      `correctionSeverity=${text(correctionRisk.audit?.severity || correctionRisk.summary?.severity)}`,
      `correctionTasks=${list(correctionRisk.tasks).length}`,
    ],
    'Run correction-risk for the operator correction and regenerate learning memory.'
  ));

  const riskReady = riskRoutingReady(learning, correctionRisk);
  requirements.push(makeRequirement(
    'risk_is_routing_not_refusal',
    riskReady ? 'pass' : 'fail',
    'Risk is encoded as execution routing, not a reason to skip supported work',
    [
      relative(files.learningMemoryFile),
      relative(files.correctionRiskFile),
      `riskAsInactionSignal=${list(correctionRisk.correction?.signals).includes('risk_as_inaction_excuse')}`,
      `riskControl=${list(correctionRisk.audit?.immediateControls).includes('risk_level_must_not_be_used_as_do_nothing_reason')}`,
    ],
    'Keep the risk-as-inaction correction active and require evidence/boundary/dry-run/execute or explicit unsupported-gap tasks.'
  ));

  const coverageReady = coverageSufficiencyReady(learning, reports.readiness);
  requirements.push(makeRequirement(
    'coverage_sufficiency_first',
    coverageReady ? 'pass' : 'fail',
    'Growth and YoY recovery answers must prove coverage sufficiency before action landing',
    [
      relative(files.learningMemoryFile),
      relative(files.readinessFile),
      `readinessCoverageSufficiencyReady=${reports.readiness.summary?.coverageSufficiencyReady === true}`,
      `coverageReadinessCheck=${checkStatus(readinessChecks, 'coverage_sufficiency_correction_memory')}`,
    ],
    'Regenerate learning memory from coverage-underreach corrections and rerun readiness audit with --require-coverage-sufficiency-lesson.'
  ));

  const failed = requirements.filter(item => item.status === 'fail');
  const pending = requirements.filter(item => item.status === 'pending');
  const status = failed.length ? 'not_ready' : (pending.length ? 'pending_natural_trigger' : 'complete_ready');
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
    ok: failed.length === 0 && pending.length === 0,
    status,
    summary: {
      requirements: requirements.length,
      passed: requirements.filter(item => item.status === 'pass').length,
      pending: pending.length,
      failed: failed.length,
      agentized: requirements.find(item => item.id === 'agent_control_plane')?.status === 'pass',
      unattendedScheduleReady: requirements.find(item => item.id === 'live_unattended_schedule')?.status === 'pass',
      naturalCompletionReady: requirements.find(item => item.id === 'natural_unattended_completion')?.status === 'pass',
      longTermLearningReady: requirements.find(item => item.id === 'long_term_learning_loop')?.status === 'pass',
      correctionSystemReady: requirements.find(item => item.id === 'operator_correction_system')?.status === 'pass',
      riskRoutingReady: requirements.find(item => item.id === 'risk_is_routing_not_refusal')?.status === 'pass',
      coverageSufficiencyReady: requirements.find(item => item.id === 'coverage_sufficiency_first')?.status === 'pass',
    },
    files,
    requirements,
  };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent goal audit - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Passed: ${report.summary?.passed || 0}`);
  lines.push(`- Pending: ${report.summary?.pending || 0}`);
  lines.push(`- Failed: ${report.summary?.failed || 0}`);
  lines.push('');
  lines.push('## Requirements');
  for (const item of report.requirements || []) {
    lines.push(`- [${item.status}] ${item.id}: ${item.title}`);
    if (item.nextAction) lines.push(`  - next: ${item.nextAction}`);
    for (const evidence of item.evidence || []) lines.push(`  - evidence: ${evidence}`);
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
    outFile: get('--out') || process.env.AGENT_GOAL_AUDIT_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_GOAL_AUDIT_MD_OUT || '',
    supervisorFile: get('--supervisor') || '',
    readinessFile: get('--readiness') || '',
    completionFile: get('--completion') || '',
    scheduleInstallFile: get('--schedule-install') || '',
    learningMemoryFile: get('--learning-memory') || '',
    correctionRiskFile: get('--correction-risk') || '',
    unattendedGateFile: get('--gate') || '',
  };
}

function runAgentGoalAudit(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_goal_audit_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const report = buildGoalAudit({ ...options, agentDir }, timeContext);
  const outFile = options.outFile || defaultAgentFile('agent_goal_audit', businessDate, 'json', agentDir);
  const markdownFile = options.markdownFile || defaultAgentFile('agent_goal_audit', businessDate, 'md', agentDir);
  report.files = {
    ...report.files,
    outFile,
    markdownFile,
  };
  writeJson(outFile, report);
  writeText(markdownFile, renderMarkdown(report));
  return report;
}

function main() {
  const report = runAgentGoalAudit(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    summary: report.summary,
    files: {
      outFile: report.files.outFile,
      markdownFile: report.files.markdownFile,
    },
    pendingRequirements: report.requirements.filter(item => item.status === 'pending').map(item => item.id),
    failedRequirements: report.requirements.filter(item => item.status === 'fail').map(item => item.id),
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
  buildGoalAudit,
  parseArgs,
  renderMarkdown,
  runAgentGoalAudit,
};
