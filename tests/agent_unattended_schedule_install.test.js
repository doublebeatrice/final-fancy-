const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildInstallScript,
  buildRunNowScript,
  buildVerifyScript,
  parseArgs,
  runAgentUnattendedScheduleInstall,
  verifyInstalledTask,
} = require('../scripts/run_agent_unattended_schedule_install');
const { buildUnattendedSchedulePlan } = require('../scripts/run_agent_unattended_schedule_plan');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-unattended-schedule-install-test',
};

const plan = buildUnattendedSchedulePlan({
  today: '2026-05-25',
  agentDir: 'data\\agent',
}, timeContext);

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_unattended_schedule_install.js',
    '--plan',
    'data\\agent\\unattended_schedule_plan_2026-05-25.json',
    '--install',
    '--verify-installed',
    '--run-now',
    '--run-now-timeout-seconds',
    '120',
    '--command-timeout-ms',
    '7000',
  ]);
  assert.strictEqual(parsed.planFile, 'data\\agent\\unattended_schedule_plan_2026-05-25.json');
  assert.strictEqual(parsed.install, true);
  assert.strictEqual(parsed.verifyInstalled, true);
  assert.strictEqual(parsed.runNow, true);
  assert.strictEqual(parsed.runNowTimeoutSeconds, 120);
  assert.strictEqual(parsed.commandTimeoutMs, 7000);
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:unattended-schedule-install -- --plan data\\agent\\unattended_schedule_plan_2026-05-25.json --verify-installed --out data\\agent\\unattended_schedule_install_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:unattended-schedule-install');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_unattended_schedule_install.js')));
}

{
  const installScript = buildInstallScript(plan);
  assert.ok(installScript.includes('Register-ScheduledTask'));
  assert.ok(installScript.includes('AdOpsAgentCompletionAudit'));
  assert.ok(installScript.includes('-Force'));
  assert.ok(installScript.includes('ConvertTo-Json'));
  const verifyScript = buildVerifyScript(plan).join('\n');
  assert.ok(verifyScript.includes('Get-ScheduledTask'));
  assert.ok(verifyScript.includes('actionArguments'));
  const runNowScript = buildRunNowScript(plan, { timeoutSeconds: 60 });
  assert.ok(runNowScript.includes('Start-ScheduledTask'));
  assert.ok(runNowScript.includes('runNowTimedOut'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-dry-'));
  const outFile = path.join(tmpDir, 'install.json');
  const markdownFile = path.join(tmpDir, 'install.md');
  let calls = 0;
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    agentDir: 'data\\agent',
    outFile,
    markdownFile,
    execFileSync: () => {
      calls += 1;
      throw new Error('should not touch scheduler in dry-run mode');
    },
  });
  assert.strictEqual(calls, 0);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'ready');
  assert.strictEqual(report.mode, 'dry_run');
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-live-'));
  const outFile = path.join(tmpDir, 'install.json');
  const markdownFile = path.join(tmpDir, 'install.md');
  const calls = [];
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    agentDir: 'data\\agent',
    outFile,
    markdownFile,
    install: true,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      assert.strictEqual(bin, 'powershell.exe');
      const command = args.join(' ');
      if (calls.length === 1) {
        assert.ok(command.includes('Register-ScheduledTask'));
        return JSON.stringify({
          ok: true,
          taskName: plan.schedule.taskName,
          state: 'Ready',
          actionExecute: plan.commands.windowsTaskAction.execute,
          actionArguments: plan.commands.windowsTaskAction.arguments,
          actionWorkingDirectory: plan.commands.windowsTaskAction.workingDirectory,
          triggerEnabled: true,
          runLevel: 'Highest',
        });
      }
      assert.ok(command.includes('AdOpsAgentCompletionAudit'));
      return JSON.stringify({
        ok: true,
        taskName: plan.schedule.completionAudit.taskName,
        state: 'Ready',
        actionExecute: plan.commands.windowsCompletionAuditAction.execute,
        actionArguments: plan.commands.windowsCompletionAuditAction.arguments,
        actionWorkingDirectory: plan.commands.windowsCompletionAuditAction.workingDirectory,
        triggerEnabled: true,
        runLevel: 'Highest',
      });
    },
  });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'installed');
  assert.strictEqual(report.installedTask.actionArguments, plan.commands.windowsTaskAction.arguments);
  assert.strictEqual(report.completionAuditTask.actionArguments, plan.commands.windowsCompletionAuditAction.arguments);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-run-now-'));
  const outFile = path.join(tmpDir, 'install.json');
  const markdownFile = path.join(tmpDir, 'install.md');
  const calls = [];
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    agentDir: 'data\\agent',
    outFile,
    markdownFile,
    runNow: true,
    runNowTimeoutSeconds: 60,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      assert.strictEqual(bin, 'powershell.exe');
      assert.ok(args.join(' ').includes('Start-ScheduledTask'));
      return JSON.stringify({
        ok: true,
        runNowRequested: true,
        runNowTimedOut: false,
        taskName: plan.schedule.taskName,
        state: 'Ready',
        actionExecute: plan.commands.windowsTaskAction.execute,
        actionArguments: plan.commands.windowsTaskAction.arguments,
        actionWorkingDirectory: plan.commands.windowsTaskAction.workingDirectory,
        triggerEnabled: true,
        runLevel: 'Highest',
        nextRunTime: '05/26/2026 09:30:30',
        lastRunTime: '05/25/2026 08:05:00',
        lastTaskResult: '0',
      });
    },
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.mode, 'run_now');
  assert.strictEqual(report.requested.runNow, true);
  assert.strictEqual(report.installedTask.runNowRequested, true);
  assert.strictEqual(report.installedTask.lastTaskResult, '0');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-run-now-nonzero-'));
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    agentDir: 'data\\agent',
    outFile: path.join(tmpDir, 'install.json'),
    runNow: true,
    execFileSync: () => JSON.stringify({
      ok: true,
      runNowRequested: true,
      runNowTimedOut: false,
      taskName: plan.schedule.taskName,
      state: 'Ready',
      actionExecute: plan.commands.windowsTaskAction.execute,
      actionArguments: plan.commands.windowsTaskAction.arguments,
      actionWorkingDirectory: plan.commands.windowsTaskAction.workingDirectory,
      triggerEnabled: true,
      runLevel: 'Highest',
      nextRunTime: '05/26/2026 09:30:30',
      lastRunTime: '05/25/2026 08:05:00',
      lastTaskResult: '1',
    }),
  });
  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_run_now_nonzero_result'));
}

{
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    dryRunSchedule: true,
    executeIfReady: true,
    install: true,
    execFileSync: () => {
      throw new Error('invalid plan must not be installed');
    },
    outFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-invalid-')), 'install.json'),
  });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some(item => item.id === 'schedule_plan_not_ready'));
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_install_skipped'));
}

{
  const issues = verifyInstalledTask(plan, {
    ok: true,
    taskName: plan.schedule.taskName,
    actionExecute: plan.commands.windowsTaskAction.execute,
    actionArguments: 'run ops:agent:closed-loop -- --execute-if-ready',
    actionWorkingDirectory: plan.commands.windowsTaskAction.workingDirectory,
    triggerEnabled: true,
    runLevel: 'Highest',
  });
  assert.ok(issues.some(item => item.id === 'scheduled_task_arguments_mismatch'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-unattended-schedule-install-mismatch-'));
  const report = runAgentUnattendedScheduleInstall({
    timeContext,
    today: '2026-05-25',
    agentDir: 'data\\agent',
    verifyInstalled: true,
    outFile: path.join(tmpDir, 'install.json'),
    execFileSync: () => JSON.stringify({
      ok: true,
      taskName: plan.schedule.taskName,
      state: 'Ready',
      actionExecute: plan.commands.windowsTaskAction.execute,
      actionArguments: 'run ops:agent:closed-loop -- --execute-if-ready',
      actionWorkingDirectory: plan.commands.windowsTaskAction.workingDirectory,
      triggerEnabled: true,
      runLevel: 'Highest',
    }),
  });
  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some(item => item.id === 'scheduled_task_arguments_mismatch'));
  assert.ok(report.tasks.some(task => task.kind === 'schedule_install_gap' && task.priority === 'P0'));
}

console.log('agent_unattended_schedule_install tests passed');
