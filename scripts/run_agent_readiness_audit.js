const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join(ROOT, 'data', 'agent');
const CAPABILITY_FILE = path.join(ROOT, 'src', 'capabilities', 'registry', 'capabilities.json');
const PACKAGE_FILE = path.join(ROOT, 'package.json');
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

function hasAll(value = '', needles = []) {
  const raw = text(value);
  return needles.every(needle => raw.includes(needle));
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasCommandOption(value = '', name = '') {
  const raw = text(value);
  return new RegExp('(^|[\\s"\\\'`])' + escapeRegExp(name) + '(?=$|[\\s="\\\'`])').test(raw);
}

function hasCommandOptionValue(value = '', name = '', expected = '') {
  const raw = text(value);
  return new RegExp(
    '(^|[\\s"\\\'`])' +
    escapeRegExp(name) +
    '(?:["\\\'`])?(?:\\s+|=)(?:["\\\'`])?' +
    escapeRegExp(expected) +
    '(?=$|[\\s"\\\'`])'
  ).test(raw);
}

function timeOfDayMinutes(value = '') {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return -1;
  return hour * 60 + minute;
}

function installedSupervisorEntrypoint(installed = {}) {
  const execute = text(installed.actionExecute || '').toLowerCase();
  const args = text(installed.actionArguments || '');
  return args.includes('ops:agent:unattended-supervisor') ||
    args.includes('run_agent_unattended_supervisor.js') ||
    (execute.endsWith('node.exe') && args.includes('run_agent_unattended_supervisor'));
}

function installedCompletionAuditEntrypoint(installed = {}) {
  const execute = text(installed.actionExecute || '').toLowerCase();
  const args = text(installed.actionArguments || '').toLowerCase();
  return args.includes('ops:agent:completion-audit') ||
    args.includes('run_agent_completion_audit.js') ||
    (execute.endsWith('node.exe') && args.includes('run_agent_completion_audit'));
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

function reportTime(value = '') {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function installTime(scheduleInstall = {}, scheduler = {}) {
  return reportTime(scheduleInstall.generatedAt || scheduler.summary?.scheduleInstallGeneratedAt || '');
}

function isRunAfterInstall(lastRunMs = 0, installMs = 0) {
  return !installMs || (lastRunMs > 0 && lastRunMs + 60 * 1000 >= installMs);
}

function taskResultOk(value = '') {
  const raw = text(value);
  if (!raw) return true;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed === 0;
}

function installedTaskRunning(installed = {}) {
  return text(installed.state).toLowerCase() === 'running' || text(installed.lastTaskResult) === '267009';
}

function naturalScheduledRun(installed = {}, options = {}) {
  const lastRunMs = parseTaskTime(installed.lastRunTime);
  const nextRunMs = parseTaskTime(installed.nextRunTime);
  const toleranceMs = Math.max(1, Number(options.naturalScheduleToleranceMinutes || 15)) * 60 * 1000;
  const expectedPreviousNaturalRunMs = nextRunMs > 0 ? nextRunMs - DAY_MS : 0;
  const nextAnchoredObserved = lastRunMs > 0 &&
    expectedPreviousNaturalRunMs > 0 &&
    Math.abs(lastRunMs - expectedPreviousNaturalRunMs) <= toleranceMs;
  let runningStartTimeObserved = false;
  const scheduledStartTime = text(options.scheduledStartTime);
  const startMatch = scheduledStartTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!nextAnchoredObserved && options.allowRunningStartTimeProof === true && lastRunMs > 0 && startMatch && installedTaskRunning(installed)) {
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

function makeCheck(id, status, title, evidence = [], nextAction = '') {
  return {
    id,
    status,
    title,
    evidence: list(evidence),
    nextAction: text(nextAction),
  };
}

function packageScripts() {
  return readJson(PACKAGE_FILE, {})?.scripts || {};
}

function capabilityIds() {
  const items = readJson(CAPABILITY_FILE, []);
  return new Set(Array.isArray(items) ? items.map(item => text(item.capabilityId)).filter(Boolean) : []);
}

function buildChecks(reports = {}, files = {}, options = {}) {
  const checks = [];
  const supervisor = reports.supervisor || {};
  const closedLoop = supervisor.closedLoop || reports.closedLoop?.summary || {};
  const scheduler = reports.schedulerAudit || {};
  const install = reports.scheduleInstall || {};
  const gate = reports.unattendedGate || {};
  const learning = reports.learningMemory || {};
  const scripts = packageScripts();
  const capabilities = capabilityIds();
  const naturalOnlySchedulerBlockers = (scheduler.issues || [])
    .filter(item => item.severity === 'blocker')
    .every(item => ['scheduled_task_last_run_not_natural_trigger', 'natural_scheduled_run_not_yet_observed'].includes(text(item.id)));
  const schedulerBlockersForLiveSchedule = naturalOnlySchedulerBlockers ? 0 : number(scheduler.summary?.blockers);

  const closedLoopReady = supervisor.ok === true &&
    closedLoop.closedLoop === true &&
    number(closedLoop.commandFailed) === 0 &&
    number(closedLoop.writeFailed) === 0 &&
    number(closedLoop.writeBlocked) === 0 &&
    closedLoop.artifactVerificationOk === true;
  checks.push(makeCheck(
    'agent_closed_loop_control_plane',
    closedLoopReady ? 'pass' : 'fail',
    'Agent closed-loop control plane is producing verified artifacts',
    [
      relative(files.supervisorFile),
      `supervisorOk=${supervisor.ok === true}`,
      `closedLoop=${closedLoop.closedLoop === true}`,
      `commandFailed=${number(closedLoop.commandFailed)}`,
      `writeFailed=${number(closedLoop.writeFailed)}`,
      `writeBlocked=${number(closedLoop.writeBlocked)}`,
      `artifactVerificationOk=${closedLoop.artifactVerificationOk === true}`,
    ],
    'Run ops:agent:unattended-supervisor and repair failed closed-loop stages.'
  ));

  const installed = install.installedTask || {};
  const installedArgs = text(installed.actionArguments);
  const liveScheduleReady = install.ok === true &&
    ['ready', 'running'].includes(text(installed.state).toLowerCase()) &&
    installed.triggerEnabled !== false &&
    installedSupervisorEntrypoint(installed) &&
    hasAll(installedArgs, ['--execute', '--execute-if-ready']) &&
    (scheduler.ok === true || naturalOnlySchedulerBlockers) &&
    scheduler.summary?.scheduleUsesSupervisor === true &&
    scheduler.summary?.scheduleLiveExecuteArmed === true &&
    schedulerBlockersForLiveSchedule === 0;
  checks.push(makeCheck(
    'live_unattended_schedule',
    liveScheduleReady ? 'pass' : 'fail',
    'Production schedule is live-armed through unattended supervisor',
    [
      relative(files.scheduleInstallFile),
      relative(files.schedulerAuditFile),
      `installOk=${install.ok === true}`,
      `taskState=${text(installed.state)}`,
      `triggerEnabled=${installed.triggerEnabled !== false}`,
      `actionArguments=${installedArgs}`,
      `scheduleUsesSupervisor=${scheduler.summary?.scheduleUsesSupervisor === true}`,
      `scheduleLiveExecuteArmed=${scheduler.summary?.scheduleLiveExecuteArmed === true}`,
      `schedulerBlockers=${number(scheduler.summary?.blockers)}`,
      `schedulerBlockersForLiveSchedule=${schedulerBlockersForLiveSchedule}`,
    ],
    'Generate a live-armed schedule plan, install it, and run scheduler audit with --require-live-execute.'
  ));

  const completion = install.completionAuditTask || {};
  const completionPlan = install.plan?.schedule?.completionAudit || {};
  const completionArgs = text(completion.actionArguments);
  const expectedCompletionTaskName = text(completionPlan.taskName || 'AdOpsAgentCompletionAudit');
  const completionInvocationMarkerReady = (
    completionArgs.includes('AGENT_SCHEDULED_TASK_INVOCATION=1') &&
    completionArgs.includes(`AGENT_SCHEDULED_TASK_NAME=${expectedCompletionTaskName}`)
  ) || (
    hasCommandOption(completionArgs, '--scheduled-task-invocation') &&
    hasCommandOptionValue(completionArgs, '--scheduled-task-name', expectedCompletionTaskName)
  );
  const completionGoalFinalReady = completionArgs.includes('AGENT_COMPLETION_GOAL_FINAL=1') ||
    hasCommandOption(completionArgs, '--goal-final');
  const completionNextMs = parseTaskTime(completion.nextRunTime);
  const supervisorNextMs = parseTaskTime(installed.nextRunTime);
  const completionStartMinute = timeOfDayMinutes(completionPlan.startTime);
  const supervisorStartMinute = timeOfDayMinutes(install.plan?.schedule?.startTime);
  const planCompletionAfterSupervisor = completionStartMinute >= 0 &&
    supervisorStartMinute >= 0 &&
    completionStartMinute > supervisorStartMinute;
  const completionAfterSupervisor = completionNextMs > 0 &&
    (supervisorNextMs <= 0 || completionNextMs > supervisorNextMs || (installedTaskRunning(completion) && planCompletionAfterSupervisor));
  const completionAuditScheduleReady = install.ok === true &&
    completionPlan.enabled === true &&
    completion.ok === true &&
    text(completion.taskName) === text(completionPlan.taskName || 'AdOpsAgentCompletionAudit') &&
    ['ready', 'running'].includes(text(completion.state).toLowerCase()) &&
    completion.triggerEnabled !== false &&
    text(completion.runLevel).toLowerCase() === 'highest' &&
    installedCompletionAuditEntrypoint(completion) &&
    completionInvocationMarkerReady &&
    completionGoalFinalReady &&
    completionNextMs > 0 &&
    completionAfterSupervisor &&
    !hasCommandOption(completionArgs, '--today');
  checks.push(makeCheck(
    'post_trigger_completion_audit_schedule',
    completionAuditScheduleReady ? 'pass' : 'fail',
    'Post-trigger completion audit is installed as its own unattended scheduled task',
    [
      relative(files.scheduleInstallFile),
      `installOk=${install.ok === true}`,
      `planCompletionEnabled=${completionPlan.enabled === true}`,
      `taskName=${text(completion.taskName)}`,
      `expectedTaskName=${text(completionPlan.taskName || 'AdOpsAgentCompletionAudit')}`,
      `taskOk=${completion.ok === true}`,
      `taskState=${text(completion.state)}`,
      `triggerEnabled=${completion.triggerEnabled !== false}`,
      `runLevel=${text(completion.runLevel)}`,
      `nextRunTime=${text(completion.nextRunTime)}`,
      `supervisorNextRunTime=${text(installed.nextRunTime)}`,
      `completionAfterSupervisor=${completionAfterSupervisor}`,
      `planCompletionAfterSupervisor=${planCompletionAfterSupervisor}`,
      `entrypointOk=${installedCompletionAuditEntrypoint(completion)}`,
      `invocationMarkerReady=${completionInvocationMarkerReady}`,
      `goalFinalReady=${completionGoalFinalReady}`,
      `pinsToday=${hasCommandOption(completionArgs, '--today')}`,
      `actionArguments=${completionArgs}`,
    ],
    'Install or repair AdOpsAgentCompletionAudit so it runs completion audit with --goal-final and produces natural-trigger GOAL-FINAL proof.'
  ));

  const completionNatural = naturalScheduledRun(completion, {
    ...options,
    scheduledStartTime: completionPlan.startTime,
    allowRunningStartTimeProof: true,
  });
  const completionRunning = installedTaskRunning(completion);
  const scheduleInstallMs = installTime(install, scheduler);
  const completionLastRunMs = parseTaskTime(completion.lastRunTime);
  const completionNextRunMs = parseTaskTime(completion.nextRunTime);
  const completionRunAfterInstall = isRunAfterInstall(completionLastRunMs, scheduleInstallMs);
  const completionRuntimePending = scheduleInstallMs > 0 &&
    !completionRunAfterInstall &&
    completionNextRunMs > reportTime(options.generatedAt || scheduler.generatedAt || '');
  const completionRuntimeOk = completion.ok === true &&
    ['ready', 'running'].includes(text(completion.state).toLowerCase()) &&
    completion.triggerEnabled !== false &&
    completionRunAfterInstall &&
    completionNatural.observed === true &&
    (completionRunning || taskResultOk(completion.lastTaskResult));
  const completionRuntimeStatus = completionRuntimeOk
    ? 'pass'
    : (completionRuntimePending ? 'warning' : (options.requireNaturalScheduledRun === true ? 'fail' : 'warning'));
  checks.push(makeCheck(
    'post_trigger_completion_audit_runtime_proof',
    completionRuntimeStatus,
    completionRuntimeOk
      ? 'Post-trigger completion audit task has produced a natural scheduled run'
      : 'Post-trigger completion audit task natural runtime is not yet proven',
    [
      relative(files.scheduleInstallFile),
      `taskOk=${completion.ok === true}`,
      `taskState=${text(completion.state)}`,
      `triggerEnabled=${completion.triggerEnabled !== false}`,
      `nextRunTime=${text(completion.nextRunTime)}`,
      `lastRunTime=${text(completion.lastRunTime)}`,
      `lastTaskResult=${text(completion.lastTaskResult)}`,
      `installGeneratedAt=${text(install.generatedAt || scheduler.summary?.scheduleInstallGeneratedAt || '')}`,
      `runAfterInstall=${completionRunAfterInstall}`,
      `completionAuditNaturalRunObserved=${completionNatural.observed}`,
      `proofMode=${completionNatural.proofMode}`,
      `scheduledStartTime=${text(completionPlan.startTime)}`,
      `expectedPreviousNaturalRun=${completionNatural.expectedPreviousNaturalRun}`,
      `toleranceMinutes=${completionNatural.toleranceMinutes}`,
    ],
    completionRuntimeOk
      ? 'Keep completion audit runtime proof under the strict final audit.'
      : 'After AdOpsAgentCompletionAudit runs naturally, confirm it wrote agent_completion_audit_<date>.json without relying on a manual rerun.'
  ));

  const liveSupervisorArmed = supervisor.ok === true &&
    supervisor.mode === 'execute_if_ready' &&
    supervisor.requested?.execute === true &&
    supervisor.requested?.executeIfReady === true &&
    supervisor.effective?.executeIfReady === true;
  checks.push(makeCheck(
    'live_supervisor_double_arm',
    liveSupervisorArmed ? 'pass' : 'fail',
    'Supervisor run is double-armed while still honoring the gate',
    [
      relative(files.supervisorFile),
      `mode=${text(supervisor.mode)}`,
      `requestedExecute=${supervisor.requested?.execute === true}`,
      `requestedExecuteIfReady=${supervisor.requested?.executeIfReady === true}`,
      `effectiveExecuteIfReady=${supervisor.effective?.executeIfReady === true}`,
    ],
    'Run supervisor with both --execute and --execute-if-ready plus prior learning continuity.'
  ));

  const gateDecision = text(gate.decision || closedLoop.unattendedGateDecision);
  const gateBlockers = gate.summary?.blockers !== undefined
    ? number(gate.summary?.blockers)
    : number(closedLoop.unattendedGateBlockerCount);
  const gateReady = gateBlockers === 0 && ['execute_allowed', 'no_actions'].includes(gateDecision);
  checks.push(makeCheck(
    'unattended_execute_gate',
    gateReady ? (gateDecision === 'no_actions' ? 'warning' : 'pass') : 'fail',
    gateDecision === 'no_actions'
      ? 'Unattended gate is healthy and found no eligible actions'
      : 'Unattended gate can decide whether live writes may land',
    [
      relative(files.unattendedGateFile),
      `decision=${gateDecision}`,
      `blockers=${gateBlockers}`,
      `eligibleActions=${number(gate.summary?.eligibleActions)}`,
    ],
    gateReady
      ? 'Continue the next evidence loop; no eligible action should be treated as a failure.'
      : 'Resolve unattended gate blockers before trusting live execution.'
  ));

  const learningReady = learning.status && learning.status !== 'blocked_constraints' &&
    number(learning.summary?.blockers) === 0 &&
    list(learning.nextRunBrief?.mustReadBeforeDecision).length > 0;
  checks.push(makeCheck(
    'long_term_learning_memory',
    learningReady ? (learning.status === 'active_watch' ? 'warning' : 'pass') : 'fail',
    'Long-term learning memory is machine-readable and feeds next-run constraints',
    [
      relative(files.learningMemoryFile),
      `status=${text(learning.status)}`,
      `constraints=${number(learning.summary?.constraints)}`,
      `blockers=${number(learning.summary?.blockers)}`,
      `warnings=${number(learning.summary?.warnings)}`,
      `mustReadCount=${list(learning.nextRunBrief?.mustReadBeforeDecision).length}`,
    ],
    learningReady
      ? 'Treat active_watch items as next-run constraints, not as optional notes.'
      : 'Generate learning memory and resolve blocker constraints before self-driving decisions.'
  ));

  const correctionCapabilityReady = !!scripts['ops:agent:correction-risk'] &&
    capabilities.has('agent.correction_risk.audit') &&
    list(learning.nextRunBrief?.doNotApplyWhen).length > 0;
  const correctionLessons = number(learning.summary?.corrections);
  const correctionStatus = correctionCapabilityReady
    ? (options.requireCorrectionLesson === true && correctionLessons < 1 ? 'fail' : (correctionLessons > 0 ? 'pass' : 'warning'))
    : 'fail';
  checks.push(makeCheck(
    'operator_correction_risk_system',
    correctionStatus,
    'Operator corrections trigger risk audit and reusable learning constraints',
    [
      `script=${scripts['ops:agent:correction-risk'] || ''}`,
      `capabilityRegistered=${capabilities.has('agent.correction_risk.audit')}`,
      `learningCorrections=${correctionLessons}`,
      relative(files.learningMemoryFile),
    ],
    correctionStatus === 'pass'
      ? 'Keep correction lessons in learning memory before reusing affected rules.'
      : 'Run correction-risk for operator corrections and regenerate learning memory.'
  ));

  const doNotApply = list(learning.nextRunBrief?.doNotApplyWhen);
  const evidenceBeforeReuse = list(learning.nextRunBrief?.evidenceBeforeReuse);
  const riskRoutingReady = doNotApply.some(item => /risk level is the only reason/i.test(item)) &&
    evidenceBeforeReuse.some(item => /route_supported_operating_action|route supported operating action|execution_design/i.test(item));
  checks.push(makeCheck(
    'risk_is_routing_not_refusal',
    riskRoutingReady ? 'pass' : (options.requireRiskRoutingLesson === true ? 'fail' : 'warning'),
    'Risk is encoded as execution routing, not a reason for inaction',
    [
      `doNotApplyHit=${riskRoutingReady}`,
      relative(files.learningMemoryFile),
    ],
    'Keep the risk-as-inaction correction active so supported operating actions route to evidence, schema, dry-run, execute, or explicit unsupported-gap tasks.'
  ));

  const coverageDoNotApplyReady = doNotApply.some(item =>
    /coverage sufficiency has not been answered before action landing details/i.test(item)
  );
  const coverageEvidenceReady = evidenceBeforeReuse.some(item =>
    /coverage[_\s-]?ratio/i.test(item)
  );
  const coverageSufficiencyReady = coverageDoNotApplyReady && coverageEvidenceReady && correctionLessons > 0;
  checks.push(makeCheck(
    'coverage_sufficiency_correction_memory',
    coverageSufficiencyReady ? 'pass' : (options.requireCoverageSufficiencyLesson === true ? 'fail' : 'warning'),
    'Coverage sufficiency correction is active before growth actions are summarized',
    [
      `doNotApplyHit=${coverageDoNotApplyReady}`,
      `evidenceHit=${coverageEvidenceReady}`,
      `learningCorrections=${correctionLessons}`,
      relative(files.learningMemoryFile),
    ],
    coverageSufficiencyReady
      ? 'Keep coverage answers ordered as sufficiency, target gap, click gap, action coverage ratio, missing layers, then action landing.'
      : 'Regenerate learning memory from the coverage-underreach correction before answering growth, YoY recovery, or coverage questions.'
  ));

  const priorLearningReady = closedLoop.priorLearningMemoryApplied === true &&
    number(closedLoop.priorLearningBlockers) === 0;
  checks.push(makeCheck(
    'prior_learning_continuity',
    priorLearningReady ? (number(closedLoop.priorLearningWarnings) > 0 ? 'warning' : 'pass') : 'fail',
    'Supervisor applied prior learning before current decisions',
    [
      `priorLearningMemoryApplied=${closedLoop.priorLearningMemoryApplied === true}`,
      `priorLearningConstraintTasks=${number(closedLoop.priorLearningConstraintTasks)}`,
      `priorLearningBlockers=${number(closedLoop.priorLearningBlockers)}`,
      `priorLearningWarnings=${number(closedLoop.priorLearningWarnings)}`,
    ],
    priorLearningReady
      ? 'Carry prior warnings as watch constraints and keep learning continuity.'
      : 'Generate or provide prior learning memory before live unattended execution.'
  ));

  const schedulerLatestHeartbeatMs = reportTime(scheduler.summary?.latestHeartbeatGeneratedAt || '');
  const heartbeatPendingPostInstall = scheduleInstallMs > 0 &&
    number(scheduler.summary?.postInstallHeartbeatCount) === 0 &&
    (!schedulerLatestHeartbeatMs || schedulerLatestHeartbeatMs + 60 * 1000 < scheduleInstallMs);
  const heartbeatReady = scheduler.summary?.latestHeartbeatOk === true &&
    number(scheduler.summary?.consecutiveFailures) === 0 &&
    number(scheduler.summary?.heartbeatCount) > 0;
  const heartbeatStatus = heartbeatReady ? 'pass' : (heartbeatPendingPostInstall ? 'warning' : 'fail');
  checks.push(makeCheck(
    'scheduler_heartbeat_continuity',
    heartbeatStatus,
    heartbeatPendingPostInstall
      ? 'Scheduler is installed and waiting for the first post-install heartbeat'
      : 'Scheduler heartbeat proves recurring unattended supervision is observable',
    [
      relative(files.schedulerAuditFile),
      `heartbeatCount=${number(scheduler.summary?.heartbeatCount)}`,
      `latestHeartbeatOk=${scheduler.summary?.latestHeartbeatOk === true}`,
      `consecutiveFailures=${number(scheduler.summary?.consecutiveFailures)}`,
      `postInstallHeartbeatCount=${number(scheduler.summary?.postInstallHeartbeatCount)}`,
      `scheduleInstallGeneratedAt=${text(install.generatedAt || scheduler.summary?.scheduleInstallGeneratedAt || '')}`,
      `nextRunTime=${text(installed.nextRunTime)}`,
    ],
    heartbeatPendingPostInstall
      ? 'After the next scheduled run, rerun scheduler/readiness audit and require a fresh post-install heartbeat.'
      : 'Repair scheduler heartbeat and verify installed task next run time.'
  ));

  const nowMs = reportTime(options.generatedAt || supervisor.generatedAt || scheduler.generatedAt || '');
  const latestHeartbeatMs = reportTime(supervisor.generatedAt || scheduler.summary?.latestHeartbeatGeneratedAt || '');
  const lastRunMs = parseTaskTime(installed.lastRunTime);
  const nextRunMs = parseTaskTime(installed.nextRunTime);
  const supervisorRunAfterInstall = isRunAfterInstall(lastRunMs, scheduleInstallMs);
  const runObserved = lastRunMs > 0 && supervisorRunAfterInstall && (!nowMs || lastRunMs <= nowMs + 5 * 60 * 1000);
  const heartbeatAfterLastRun = runObserved ? latestHeartbeatMs + 5 * 60 * 1000 >= lastRunMs : null;
  const installedReady = ['ready', 'running'].includes(text(installed.state).toLowerCase()) && installed.triggerEnabled !== false;
  const running = installedTaskRunning(installed);
  const lastResultOk = runObserved ? (running ? null : taskResultOk(installed.lastTaskResult)) : null;
  const runtimeStatus = !installedReady
    ? 'fail'
    : (runObserved
      ? (running ? 'warning' : (lastResultOk && heartbeatAfterLastRun ? 'pass' : 'fail'))
      : (nextRunMs > 0 && nowMs && nextRunMs <= nowMs ? 'fail' : 'warning'));
  checks.push(makeCheck(
    'scheduled_task_runtime_proof',
    runtimeStatus,
    runtimeStatus === 'warning'
      ? 'Installed scheduled task is ready but the first real run is not yet observed'
      : 'Installed scheduled task runtime is tied to supervisor heartbeat',
    [
      relative(files.scheduleInstallFile),
      `taskState=${text(installed.state)}`,
      `triggerEnabled=${installed.triggerEnabled !== false}`,
      `nextRunTime=${text(installed.nextRunTime)}`,
      `lastRunTime=${text(installed.lastRunTime)}`,
      `lastTaskResult=${text(installed.lastTaskResult)}`,
      `installGeneratedAt=${text(install.generatedAt || scheduler.summary?.scheduleInstallGeneratedAt || '')}`,
      `runAfterInstall=${supervisorRunAfterInstall}`,
      `scheduledTaskRunObserved=${runObserved}`,
      `latestHeartbeatAfterLastRun=${heartbeatAfterLastRun}`,
    ],
    runtimeStatus === 'pass'
      ? 'Keep scheduler audit watching every run for heartbeat continuity.'
      : (runtimeStatus === 'warning'
        ? 'After the next scheduled time, rerun scheduler/readiness audit; it must show a clean last run and a newer supervisor heartbeat.'
        : 'Repair scheduled task runtime or heartbeat output before treating unattended production as proven.')
  ));

  const natural = naturalScheduledRun(installed, options);
  const naturalObserved = scheduler.summary?.naturalScheduledRunObserved === true || (supervisorRunAfterInstall && natural.observed);
  const naturalPendingPostInstall = scheduleInstallMs > 0 && !supervisorRunAfterInstall && nextRunMs > nowMs;
  const naturalStatus = naturalObserved
    ? 'pass'
    : (naturalPendingPostInstall ? 'warning' : (options.requireNaturalScheduledRun === true ? 'fail' : 'warning'));
  checks.push(makeCheck(
    'natural_scheduled_trigger_proof',
    naturalStatus,
    naturalObserved
      ? 'Installed task has produced a natural daily trigger run'
      : 'Installed task natural daily trigger is not yet proven',
    [
      relative(files.scheduleInstallFile),
      relative(files.schedulerAuditFile),
      `nextRunTime=${text(installed.nextRunTime)}`,
      `lastRunTime=${text(installed.lastRunTime)}`,
      `installGeneratedAt=${text(install.generatedAt || scheduler.summary?.scheduleInstallGeneratedAt || '')}`,
      `runAfterInstall=${supervisorRunAfterInstall}`,
      `naturalScheduledRunObserved=${naturalObserved}`,
      `expectedPreviousNaturalRun=${text(scheduler.summary?.expectedPreviousNaturalRun || natural.expectedPreviousNaturalRun)}`,
      `toleranceMinutes=${number(scheduler.summary?.naturalScheduleToleranceMinutes || natural.toleranceMinutes)}`,
    ],
    naturalObserved
      ? 'Keep natural trigger proof under scheduler audit so recurring unattended operation remains observable.'
      : 'After the next configured trigger time, rerun scheduler/readiness audit with --require-natural-scheduled-run.'
  ));

  return checks;
}

function buildAgentReadinessAudit(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const files = {
    supervisorFile: options.supervisorFile || defaultAgentFile('unattended_supervisor', businessDate, 'json', agentDir),
    schedulerAuditFile: options.schedulerAuditFile || defaultAgentFile('unattended_scheduler_audit', businessDate, 'json', agentDir),
    scheduleInstallFile: options.scheduleInstallFile || defaultAgentFile('unattended_schedule_install', businessDate, 'json', agentDir),
    unattendedGateFile: options.unattendedGateFile || defaultAgentFile('unattended_gate', businessDate, 'json', agentDir),
    learningMemoryFile: options.learningMemoryFile || defaultAgentFile('learning_memory', businessDate, 'json', agentDir),
    closedLoopFile: options.closedLoopFile || defaultAgentFile('agent_closed_loop', businessDate, 'json', agentDir),
  };
  const reports = {
    supervisor: readJson(files.supervisorFile, {}),
    schedulerAudit: readJson(files.schedulerAuditFile, {}),
    scheduleInstall: readJson(files.scheduleInstallFile, {}),
    unattendedGate: readJson(files.unattendedGateFile, {}),
    learningMemory: readJson(files.learningMemoryFile, {}),
    closedLoop: readJson(files.closedLoopFile, {}),
  };
  const checks = buildChecks(reports, files, { ...options, generatedAt });
  const failed = checks.filter(item => item.status === 'fail');
  const warnings = checks.filter(item => item.status === 'warning');
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId: text(timeContext.sourceRunId || options.sourceRunId || ''),
    status: failed.length ? 'not_ready' : (warnings.length ? 'ready_with_warnings' : 'ready'),
    ok: failed.length === 0,
    summary: {
      checks: checks.length,
      passed: checks.filter(item => item.status === 'pass').length,
      warnings: warnings.length,
      failed: failed.length,
      liveScheduleReady: checks.find(item => item.id === 'live_unattended_schedule')?.status === 'pass',
      completionAuditScheduleReady: checks.find(item => item.id === 'post_trigger_completion_audit_schedule')?.status === 'pass',
      completionAuditRuntimeReady: checks.find(item => item.id === 'post_trigger_completion_audit_runtime_proof')?.status === 'pass',
      learningReady: checks.find(item => item.id === 'long_term_learning_memory')?.status !== 'fail',
      correctionReady: checks.find(item => item.id === 'operator_correction_risk_system')?.status !== 'fail',
      coverageSufficiencyReady: checks.find(item => item.id === 'coverage_sufficiency_correction_memory')?.status === 'pass',
      scheduledRuntimeReady: checks.find(item => item.id === 'scheduled_task_runtime_proof')?.status === 'pass',
      naturalScheduledRuntimeReady: checks.find(item => item.id === 'natural_scheduled_trigger_proof')?.status === 'pass',
    },
    files,
    checks,
  };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# Agent readiness audit - ${report.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- Checks: ${report.summary?.checks || 0}`);
  lines.push(`- Passed: ${report.summary?.passed || 0}`);
  lines.push(`- Warnings: ${report.summary?.warnings || 0}`);
  lines.push(`- Failed: ${report.summary?.failed || 0}`);
  lines.push('');
  lines.push('## Checks');
  for (const item of report.checks || []) {
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
    outFile: get('--out') || process.env.AGENT_READINESS_AUDIT_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_READINESS_AUDIT_MD_OUT || '',
    supervisorFile: get('--supervisor') || '',
    schedulerAuditFile: get('--scheduler-audit') || '',
    scheduleInstallFile: get('--schedule-install') || '',
    unattendedGateFile: get('--gate') || '',
    learningMemoryFile: get('--learning-memory') || '',
    closedLoopFile: get('--closed-loop') || '',
    requireCorrectionLesson: args.includes('--require-correction-lesson') || process.env.AGENT_REQUIRE_CORRECTION_LESSON === '1',
    requireRiskRoutingLesson: args.includes('--require-risk-routing-lesson') || process.env.AGENT_REQUIRE_RISK_ROUTING_LESSON === '1',
    requireCoverageSufficiencyLesson: args.includes('--require-coverage-sufficiency-lesson') || process.env.AGENT_REQUIRE_COVERAGE_SUFFICIENCY_LESSON === '1',
    requireNaturalScheduledRun: args.includes('--require-natural-scheduled-run') || process.env.AGENT_REQUIRE_NATURAL_SCHEDULED_RUN === '1',
    naturalScheduleToleranceMinutes: Number(get('--natural-schedule-tolerance-minutes') || process.env.AGENT_NATURAL_SCHEDULE_TOLERANCE_MINUTES || 15),
  };
}

function runAgentReadinessAudit(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_readiness_audit_${Date.now()}`,
  });
  const businessDate = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const report = buildAgentReadinessAudit({ ...options, agentDir }, timeContext);
  const outFile = options.outFile || defaultAgentFile('agent_readiness_audit', businessDate, 'json', agentDir);
  const markdownFile = options.markdownFile || defaultAgentFile('agent_readiness_audit', businessDate, 'md', agentDir);
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
  const report = runAgentReadinessAudit(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    businessDate: report.businessDate,
    summary: report.summary,
    files: {
      outFile: report.files.outFile,
      markdownFile: report.files.markdownFile,
    },
    failedChecks: report.checks.filter(item => item.status === 'fail').map(item => item.id),
    warningChecks: report.checks.filter(item => item.status === 'warning').map(item => item.id),
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
  buildAgentReadinessAudit,
  buildChecks,
  parseArgs,
  renderMarkdown,
  runAgentReadinessAudit,
};
