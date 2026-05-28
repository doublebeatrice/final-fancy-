const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildUnattendedSchedulePlan,
  parseArgs,
  runAgentUnattendedSchedulePlan,
} = require('../scripts/run_agent_unattended_schedule_plan');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-unattended-schedule-plan-test',
};

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_unattended_schedule_plan.js',
    '--today',
    '2026-05-25',
    '--task-name',
    'AdOpsDaily',
    '--start-time',
    '10:15',
    '--execute',
    '--execute-if-ready',
  ]);
  assert.strictEqual(parsed.today, '2026-05-25');
  assert.strictEqual(parsed.taskName, 'AdOpsDaily');
  assert.strictEqual(parsed.startTime, '10:15');
  assert.strictEqual(parsed.execute, true);
  assert.strictEqual(parsed.executeIfReady, true);
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:unattended-schedule-plan -- --today 2026-05-25 --out data\\agent\\unattended_schedule_plan_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:unattended-schedule-plan');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_unattended_schedule_plan.js')));
}

{
  const report = buildUnattendedSchedulePlan({
    today: '2026-05-25',
    agentDir: 'data\\agent',
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready');
  assert.strictEqual(report.mode, 'dry_run');
  assert.ok(report.commands.scheduleCommand.includes('ops:agent:unattended-supervisor'));
  assert.ok(!report.commands.scheduleCommand.includes('ops:agent:closed-loop'));
  assert.ok(!report.commands.scheduleCommand.includes('--execute'));
  assert.ok(!report.commands.scheduleCommand.includes('--today'));
  assert.ok(report.commands.runNowCommand.includes('--today 2026-05-25'));
  assert.ok(report.commands.runNowCommand.includes('learning_memory_2026-05-24.json'));
  assert.ok(report.commands.schedulerAuditCommand.includes('ops:agent:unattended-scheduler-audit'));
  assert.ok(report.commands.completionAuditCommand.includes('ops:agent:completion-audit'));
  assert.ok(report.commands.completionAuditCommand.includes('--natural-schedule-tolerance-minutes 15'));
  assert.ok(report.commands.completionAuditRunNowCommand.includes('--today 2026-05-25'));
  assert.ok(report.commands.completionAuditRunNowCommand.includes('--natural-schedule-tolerance-minutes 15'));
  assert.ok(report.commands.schedulerAuditCommand.includes('--schedule-install'));
  assert.ok(report.commands.schedulerAuditCommand.includes('unattended_schedule_install_2026-05-25.json'));
  assert.strictEqual(report.commands.windowsTaskAction.execute, process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe');
  assert.ok(report.commands.windowsTaskAction.arguments.includes('run_agent_unattended_supervisor.js'));
  assert.ok(report.commands.windowsTaskAction.arguments.includes('unattended_supervisor_task.log'));
  assert.ok(report.commands.windowsCompletionAuditAction.arguments.includes('run_agent_completion_audit.js'));
  assert.ok(report.commands.windowsCompletionAuditAction.arguments.includes('unattended_completion_audit_task.log'));
  assert.ok(report.commands.windowsCompletionAuditAction.arguments.includes('--natural-schedule-tolerance-minutes 15'));
  assert.ok(report.commands.windowsCompletionAuditAction.arguments.includes('--scheduled-task-invocation'));
  assert.ok(report.commands.windowsCompletionAuditAction.arguments.includes('--scheduled-task-name AdOpsAgentCompletionAudit'));
  assert.strictEqual(report.schedule.completionAudit.taskName, 'AdOpsAgentCompletionAudit');
  assert.strictEqual(report.schedule.completionAudit.startTime, '09:50');
  assert.strictEqual(report.schedule.completionAudit.naturalScheduleToleranceMinutes, 15);
  assert.ok(report.scheduler.registerScript.some(line => line.includes('Register-ScheduledTask')));
  assert.ok(report.scheduler.completionRegisterScript.some(line => line.includes('AdOpsAgentCompletionAudit')));
  assert.ok(report.scheduler.registerScript.some(line => line.includes('-RunLevel Highest')));
  assert.strictEqual(parseNpmRunCommand(report.commands.scheduleCommand).ok, true);
  assert.strictEqual(parseNpmRunCommand(report.commands.schedulerAuditCommand).ok, true);
  assert.strictEqual(parseNpmRunCommand(report.commands.completionAuditCommand).ok, true);
}

{
  const report = buildUnattendedSchedulePlan({
    today: '2026-05-25',
    agentDir: 'data\\agent',
    execute: true,
    executeIfReady: true,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.mode, 'execute_if_ready');
  assert.ok(report.commands.scheduleCommand.includes('--execute'));
  assert.ok(report.commands.scheduleCommand.includes('--execute-if-ready'));
  assert.ok(report.commands.schedulerAuditCommand.includes('--require-live-execute'));
  assert.ok(report.commands.schedulerAuditCommand.includes('--schedule-install'));
  assert.ok(report.priorLearning.defaultFileForRunNow.endsWith(path.join('data\\agent', 'learning_memory_2026-05-24.json')) || report.priorLearning.defaultFileForRunNow.includes('learning_memory_2026-05-24.json'));
  assert.ok(report.commands.runNowCommand.includes('--prior-learning-memory'));
}

{
  const report = buildUnattendedSchedulePlan({
    today: '2026-05-25',
    executeIfReady: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.mode, 'invalid');
  assert.ok(report.issues.some(item => item.id === 'execute_if_ready_without_execute'));
  assert.ok(report.issues.some(item => item.id === 'schedule_execute_if_ready_without_execute'));
  assert.ok(report.tasks.some(task => task.kind === 'schedule_plan_gap' && task.priority === 'P0'));
}

{
  const report = buildUnattendedSchedulePlan({
    today: '2026-05-25',
    execute: true,
    executeIfReady: true,
    allowMissingPriorLearning: true,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some(item => item.id === 'live_schedule_allows_missing_prior_learning'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-plan-'));
  const outFile = path.join(tmpDir, 'plan.json');
  const markdownFile = path.join(tmpDir, 'plan.md');
  const report = runAgentUnattendedSchedulePlan({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    outFile,
    markdownFile,
  });
  assert.strictEqual(report.ok, true);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
}

console.log('agent_unattended_schedule_plan tests passed');
