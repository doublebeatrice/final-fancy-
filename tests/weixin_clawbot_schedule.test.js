const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildTaskCommand, runWeixinClawbotSchedule } = require('../scripts/run_weixin_clawbot_schedule');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-schedule-'));
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  const wrapperFile = path.join(tmpDir, 'weixin_clawbot_reminders_task.ps1');
  const repliesWrapperFile = path.join(tmpDir, 'weixin_clawbot_replies_task.ps1');
  const vbsWrapperFile = path.join(tmpDir, 'weixin_clawbot_reminders_task.vbs');
  const repliesVbsWrapperFile = path.join(tmpDir, 'weixin_clawbot_replies_task.vbs');
  fs.writeFileSync(configFile, JSON.stringify({ token: 't', toUserId: 'u' }), 'utf8');
  const incompleteConfigFile = path.join(tmpDir, 'incomplete.local.json');
  fs.writeFileSync(incompleteConfigFile, JSON.stringify({ token: '', toUserId: '' }), 'utf8');
  const dryRunConfigFile = path.join(tmpDir, 'dryrun.local.json');
  fs.writeFileSync(dryRunConfigFile, JSON.stringify({ token: 't', toUserId: 'u', dryRun: true }), 'utf8');

  const plan = await runWeixinClawbotSchedule({
    taskName: 'AdOpsWeixinReminderTest',
    time: '09:35',
    configFile,
    wrapperFile,
    repliesWrapperFile,
    vbsWrapperFile,
    repliesVbsWrapperFile,
    cwd: 'D:\\ad-ops-workbench',
    nodeExe: 'C:\\node\\node.exe',
  });

  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.installed, false);
  assert.ok(plan.taskCommand.includes(vbsWrapperFile));
  assert.ok(plan.taskCommand.startsWith('wscript.exe'));
  assert.ok(plan.taskCommand.length <= 261);
  assert.ok(plan.wrapperScript.includes('run_weixin_clawbot_reminders.js'));
  assert.ok(plan.vbsLauncherScript.includes('-WindowStyle Hidden'));
  assert.ok(plan.vbsLauncherScript.includes(wrapperFile));
  assert.ok(!plan.vbsLauncherScript.includes('CODEX_HOME'));
  assert.ok(!plan.wrapperScript.includes('run_weixin_clawbot_replies.js'));
  assert.ok(plan.wrapperScript.includes(configFile));
  assert.ok(plan.repliesTask.taskCommand.includes(repliesVbsWrapperFile));
  assert.ok(plan.repliesTask.taskCommand.startsWith('wscript.exe'));
  assert.ok(plan.repliesTask.wrapperScript.includes('run_weixin_clawbot_replies.js'));
  assert.ok(plan.repliesTask.wrapperScript.includes('run_weixin_codex_gateway.js'));
  assert.ok(plan.repliesTask.vbsLauncherScript.includes('-WindowStyle Hidden'));
  assert.ok(plan.repliesTask.vbsLauncherScript.includes(repliesWrapperFile));
  assert.ok(!plan.repliesTask.vbsLauncherScript.includes('CODEX_HOME'));
  assert.ok(plan.repliesTask.wrapperScript.includes('--ack'));
  assert.ok(plan.repliesTask.wrapperScript.includes('--send-result'));
  assert.strictEqual(plan.repliesTask.intervalMinutes, 1);
  assert.ok(plan.repliesTask.schtasksArgs.includes('/MO'));
  assert.ok(plan.repliesTask.schtasksArgs.includes('1'));
  assert.deepStrictEqual(plan.schtasksArgs.slice(0, 4), ['/Create', '/TN', 'AdOpsWeixinReminderTest', '/SC']);
  assert.ok(buildTaskCommand({ vbsWrapperFile }).length <= 261);

  const calls = [];
  const installed = await runWeixinClawbotSchedule({
    taskName: 'AdOpsWeixinReminderTest',
    time: '09:35',
    configFile,
    wrapperFile,
    repliesWrapperFile,
    vbsWrapperFile,
    repliesVbsWrapperFile,
    cwd: 'D:\\ad-ops-workbench',
    nodeExe: 'C:\\node\\node.exe',
    install: true,
  }, {
    spawnSync: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: 'SUCCESS', stderr: '' };
    },
  });

  assert.strictEqual(installed.installed, true);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].command, 'schtasks');
  assert.strictEqual(calls[1].command, 'schtasks');
  assert.ok(calls[0].args.includes('/F'));
  assert.ok(calls[1].args.includes('MINUTE'));
  assert.ok(fs.existsSync(wrapperFile));
  assert.ok(fs.existsSync(repliesWrapperFile));
  assert.ok(fs.existsSync(vbsWrapperFile));
  assert.ok(fs.existsSync(repliesVbsWrapperFile));
  assert.ok(fs.readFileSync(wrapperFile, 'utf8').includes('run_weixin_clawbot_reminders.js'));
  assert.ok(fs.readFileSync(repliesWrapperFile, 'utf8').includes('run_weixin_clawbot_replies.js'));
  assert.ok(fs.readFileSync(repliesWrapperFile, 'utf8').includes('run_weixin_codex_gateway.js'));
  assert.ok(fs.readFileSync(vbsWrapperFile, 'utf8').includes('-WindowStyle Hidden'));
  assert.ok(fs.readFileSync(repliesVbsWrapperFile, 'utf8').includes('-WindowStyle Hidden'));

  let blocked = false;
  try {
    await runWeixinClawbotSchedule({
      taskName: 'AdOpsWeixinReminderTest',
      time: '09:35',
      configFile: incompleteConfigFile,
      install: true,
    }, {
      spawnSync: () => ({ status: 0, stdout: 'SHOULD_NOT_RUN', stderr: '' }),
    });
  } catch (error) {
    blocked = /not ready/.test(error.message);
  }
  assert.strictEqual(blocked, true);

  let dryRunBlocked = false;
  try {
    await runWeixinClawbotSchedule({
      taskName: 'AdOpsWeixinReminderTest',
      time: '09:35',
      configFile: dryRunConfigFile,
      install: true,
    }, {
      spawnSync: () => ({ status: 0, stdout: 'SHOULD_NOT_RUN', stderr: '' }),
    });
  } catch (error) {
    dryRunBlocked = /dry-run/.test(error.message);
  }
  assert.strictEqual(dryRunBlocked, true);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
