const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSchedulerAudit,
  parseArgs,
  runAgentUnattendedSchedulerAudit,
} = require('../scripts/run_agent_unattended_scheduler_audit');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-unattended-scheduler-audit-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function heartbeat(file, overrides = {}) {
  writeJson(file, {
    generatedAt: '2026-05-25T07:30:00.000Z',
    businessDate: '2026-05-25',
    status: 'ready',
    ok: true,
    mode: 'dry_run',
    priorLearning: { required: true, exists: true, file: 'data/agent/learning_memory_2026-05-24.json' },
    closedLoop: { unattendedGateDecision: 'execute_allowed', unattendedExecuted: false },
    ...overrides,
  });
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_unattended_scheduler_audit.js',
    '--heartbeat-dir',
    'data/agent',
    '--schedule-command',
    'npm run ops:agent:unattended-supervisor -- --today 2026-05-25',
    '--schedule-install',
    'data/agent/unattended_schedule_install_2026-05-25.json',
    '--require-schedule',
    '--require-live-execute',
    '--require-installed-task',
  ]);
  assert.strictEqual(parsed.heartbeatDir, 'data/agent');
  assert.strictEqual(parsed.scheduleInstallFile, 'data/agent/unattended_schedule_install_2026-05-25.json');
  assert.strictEqual(parsed.requireSchedule, true);
  assert.strictEqual(parsed.requireLiveExecute, true);
  assert.strictEqual(parsed.requireInstalledTask, true);
  assert.strictEqual(parsed.requireNaturalScheduledRun, false);
  assert.ok(parsed.scheduleCommand.includes('ops:agent:unattended-supervisor'));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:unattended-scheduler-audit -- --heartbeat-dir data\\agent --schedule-command "npm run ops:agent:unattended-supervisor -- --today 2026-05-25" --out data\\agent\\unattended_scheduler_audit_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:unattended-scheduler-audit');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_unattended_scheduler_audit.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-ready-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'));
  const report = runAgentUnattendedSchedulerAudit({
    timeContext,
    today: '2026-05-25',
    heartbeatDir: tmpDir,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --today 2026-05-25 --out-dir data\\agent',
    requireSchedule: true,
    outFile: path.join(tmpDir, 'audit.json'),
    markdownFile: path.join(tmpDir, 'audit.md'),
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready');
  assert.strictEqual(report.summary.heartbeatCount, 1);
  assert.strictEqual(report.summary.scheduleUsesSupervisor, true);
  assert.strictEqual(report.summary.scheduleLiveExecuteArmed, false);
  assert.ok(fs.existsSync(report.files.outFile));
  assert.ok(fs.existsSync(report.files.markdownFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-live-required-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    mode: 'execute_if_ready',
    closedLoop: { unattendedGateDecision: 'no_actions', unattendedExecuted: false },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready');
  assert.strictEqual(report.summary.scheduleUsesSupervisor, true);
  assert.strictEqual(report.summary.scheduleLiveExecuteArmed, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-live-missing-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'));
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent',
    requireSchedule: true,
    requireLiveExecute: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.summary.scheduleLiveExecuteArmed, false);
  assert.ok(report.issues.some(item => item.id === 'schedule_live_execute_not_armed'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-plan-file-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'));
  const planFile = path.join(tmpDir, 'unattended_schedule_plan_2026-05-25.json');
  writeJson(planFile, {
    commands: {
      scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleFile: planFile,
    requireSchedule: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.summary.scheduleUsesSupervisor, true);
  assert.ok(report.schedule.command.includes('ops:agent:unattended-supervisor'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-install-watch-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-25T07:40:00.000Z',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  writeJson(scheduleInstallFile, {
    ok: true,
    status: 'ready',
    installedTask: {
      ok: true,
      state: 'Ready',
      triggerEnabled: true,
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '11/30/1999 00:00:00',
      lastTaskResult: '267011',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleInstallFile,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready_with_warnings');
  assert.strictEqual(report.summary.installedTaskReady, true);
  assert.strictEqual(report.summary.scheduledTaskRunObserved, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_run_not_yet_observed' && item.severity === 'warning'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-install-ran-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-25T07:50:00.000Z',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  writeJson(scheduleInstallFile, {
    ok: true,
    status: 'ready',
    installedTask: {
      ok: true,
      state: 'Ready',
      triggerEnabled: true,
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '05/25/2026 07:45:00',
      lastTaskResult: '0',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleInstallFile,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready_with_warnings');
  assert.strictEqual(report.summary.scheduledTaskRunObserved, true);
  assert.strictEqual(report.summary.scheduledTaskLastResultOk, true);
  assert.strictEqual(report.summary.latestHeartbeatAfterLastRun, true);
  assert.strictEqual(report.summary.naturalScheduledRunObserved, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_last_run_not_natural_trigger' && item.severity === 'warning'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-natural-ran-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-25T02:00:00.000Z',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  writeJson(scheduleInstallFile, {
    ok: true,
    status: 'ready',
    installedTask: {
      ok: true,
      state: 'Ready',
      triggerEnabled: true,
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '05/25/2026 09:30:30',
      lastTaskResult: '0',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleInstallFile,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready');
  assert.strictEqual(report.summary.scheduledTaskRunObserved, true);
  assert.strictEqual(report.summary.naturalScheduledRunObserved, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-natural-required-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-25T07:50:00.000Z',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  writeJson(scheduleInstallFile, {
    ok: true,
    status: 'ready',
    installedTask: {
      ok: true,
      state: 'Ready',
      triggerEnabled: true,
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '05/25/2026 07:45:00',
      lastTaskResult: '0',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleInstallFile,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
    requireNaturalScheduledRun: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.summary.naturalScheduledRunObserved, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_last_run_not_natural_trigger' && item.severity === 'blocker'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-install-failed-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-24T07:30:00.000Z',
  });
  const scheduleInstallFile = path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json');
  writeJson(scheduleInstallFile, {
    ok: true,
    status: 'ready',
    installedTask: {
      ok: true,
      state: 'Ready',
      triggerEnabled: true,
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '05/25/2026 07:45:00',
      lastTaskResult: '1',
    },
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleInstallFile,
    scheduleCommand: 'npm run ops:agent:unattended-supervisor -- --out-dir data\\agent --execute --execute-if-ready',
    requireSchedule: true,
    requireLiveExecute: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_last_result_failed'));
  assert.ok(report.issues.some(item => item.id === 'scheduled_run_missing_heartbeat'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-scheduler-blocked-'));
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'), {
    generatedAt: '2026-05-25T06:30:00.000Z',
    status: 'blocked',
    ok: false,
    priorLearning: { required: true, exists: false, file: 'missing.json' },
  });
  heartbeat(path.join(tmpDir, 'unattended_supervisor_2026-05-24.json'), {
    generatedAt: '2026-05-24T07:30:00.000Z',
    status: 'blocked',
    ok: false,
  });
  const report = buildSchedulerAudit({
    heartbeatDir: tmpDir,
    scheduleCommand: 'npm run ops:agent:closed-loop -- --execute-if-ready',
    requireSchedule: true,
    maxAgeHours: 1,
    maxConsecutiveFailures: 1,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some(item => item.id === 'schedule_not_using_supervisor'));
  assert.ok(report.issues.some(item => item.id === 'schedule_bypasses_supervisor'));
  assert.ok(report.issues.some(item => item.id === 'schedule_execute_if_ready_without_execute'));
  assert.ok(report.issues.some(item => item.id === 'heartbeat_stale'));
  assert.ok(report.issues.some(item => item.id === 'latest_heartbeat_not_ok'));
  assert.ok(report.issues.some(item => item.id === 'latest_prior_learning_missing'));
  assert.ok(report.issues.some(item => item.id === 'consecutive_unattended_failures'));
  assert.ok(report.tasks.some(task => task.kind === 'scheduler_health_gap' && task.priority === 'P0'));
}

console.log('agent_unattended_scheduler_audit tests passed');
