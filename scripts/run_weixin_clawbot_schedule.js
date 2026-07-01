const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_TASK_NAME = 'AdOpsWeixinClawbotReminders';
const DEFAULT_REPLIES_TASK_NAME = 'AdOpsWeixinClawbotReplies';
const DEFAULT_CONFIG_FILE = path.join(ROOT, 'config', 'weixin_clawbot.local.json');
const DEFAULT_LOG_FILE = path.join(ROOT, 'data', 'logs', 'weixin_clawbot_reminders_task.log');
const DEFAULT_WRAPPER_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_reminders_task.ps1');
const DEFAULT_REPLIES_WRAPPER_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_replies_task.ps1');
const DEFAULT_VBS_WRAPPER_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_reminders_task.vbs');
const DEFAULT_REPLIES_VBS_WRAPPER_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_replies_task.vbs');

function text(value) {
  return String(value ?? '').trim();
}

function quoteCmd(value) {
  return `"${text(value).replace(/"/g, '\\"')}"`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    taskName: get('--task-name') || process.env.WEIXIN_CLAWBOT_TASK_NAME || DEFAULT_TASK_NAME,
    repliesTaskName: get('--replies-task-name') || process.env.WEIXIN_CLAWBOT_REPLIES_TASK_NAME || DEFAULT_REPLIES_TASK_NAME,
    time: get('--time') || process.env.WEIXIN_CLAWBOT_TASK_TIME || '09:30',
    repliesIntervalMinutes: Number(get('--replies-interval-minutes') || process.env.WEIXIN_CLAWBOT_REPLIES_INTERVAL_MINUTES || 1),
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || DEFAULT_CONFIG_FILE,
    cwd: get('--cwd') || process.env.WEIXIN_CLAWBOT_CWD || ROOT,
    nodeExe: get('--node') || process.env.WEIXIN_CLAWBOT_NODE || process.execPath,
    logFile: get('--log') || process.env.WEIXIN_CLAWBOT_LOG || DEFAULT_LOG_FILE,
    wrapperFile: get('--wrapper') || process.env.WEIXIN_CLAWBOT_WRAPPER || DEFAULT_WRAPPER_FILE,
    repliesWrapperFile: get('--replies-wrapper') || process.env.WEIXIN_CLAWBOT_REPLIES_WRAPPER || DEFAULT_REPLIES_WRAPPER_FILE,
    vbsWrapperFile: get('--vbs-wrapper') || process.env.WEIXIN_CLAWBOT_VBS_WRAPPER || DEFAULT_VBS_WRAPPER_FILE,
    repliesVbsWrapperFile: get('--replies-vbs-wrapper') || process.env.WEIXIN_CLAWBOT_REPLIES_VBS_WRAPPER || DEFAULT_REPLIES_VBS_WRAPPER_FILE,
    install: args.includes('--install') || process.env.WEIXIN_CLAWBOT_INSTALL === '1',
  };
}

function buildTaskCommand(options = {}) {
  const vbsWrapperFile = options.vbsWrapperFile || DEFAULT_VBS_WRAPPER_FILE;
  return `wscript.exe ${quoteCmd(vbsWrapperFile)}`;
}

function quoteVbs(value) {
  return text(value).replace(/"/g, '""');
}

function buildVbsLauncherScript(options = {}) {
  const wrapperFile = options.wrapperFile || DEFAULT_WRAPPER_FILE;
  const command = `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${quoteVbs(wrapperFile)}""`;
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run "${command}", 0, False`,
  ].join('\r\n');
}

function buildWrapperScript(options = {}) {
  const cwd = options.cwd || ROOT;
  const nodeExe = options.nodeExe || process.execPath;
  const reminderScriptFile = path.join(ROOT, 'scripts', 'run_weixin_clawbot_reminders.js');
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const logFile = options.logFile || DEFAULT_LOG_FILE;
  return [
    '$ErrorActionPreference = "Stop"',
    `$logFile = ${quotePowerShell(logFile)}`,
    'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null',
    `Set-Location -LiteralPath ${quotePowerShell(cwd)}`,
    `& ${quotePowerShell(nodeExe)} ${quotePowerShell(reminderScriptFile)} --config ${quotePowerShell(configFile)} >> $logFile 2>&1`,
  ].join('\r\n');
}

function buildRepliesWrapperScript(options = {}) {
  const cwd = options.cwd || ROOT;
  const nodeExe = options.nodeExe || process.execPath;
  const repliesScriptFile = path.join(ROOT, 'scripts', 'run_weixin_clawbot_replies.js');
  const codexGatewayScriptFile = path.join(ROOT, 'scripts', 'run_weixin_codex_gateway.js');
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const logFile = options.logFile || DEFAULT_LOG_FILE;
  return [
    '$ErrorActionPreference = "Stop"',
    `$logFile = ${quotePowerShell(logFile)}`,
    'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null',
    `Set-Location -LiteralPath ${quotePowerShell(cwd)}`,
    `& ${quotePowerShell(nodeExe)} ${quotePowerShell(repliesScriptFile)} --config ${quotePowerShell(configFile)} --ack >> $logFile 2>&1`,
    `& ${quotePowerShell(nodeExe)} ${quotePowerShell(codexGatewayScriptFile)} --config ${quotePowerShell(configFile)} --send-result >> $logFile 2>&1`,
  ].join('\r\n');
}

function quotePowerShell(value) {
  return `'${text(value).replace(/'/g, "''")}'`;
}

function buildSchtasksArgs(options = {}) {
  const taskName = options.taskName || DEFAULT_TASK_NAME;
  const time = options.time || '09:30';
  return [
    '/Create',
    '/TN', taskName,
    '/SC', 'DAILY',
    '/ST', time,
    '/TR', buildTaskCommand(options),
    '/F',
  ];
}

function buildRepliesSchtasksArgs(options = {}) {
  const taskName = options.repliesTaskName || DEFAULT_REPLIES_TASK_NAME;
  const interval = Math.max(1, Number(options.repliesIntervalMinutes || 1));
  return [
    '/Create',
    '/TN', taskName,
    '/SC', 'MINUTE',
    '/MO', String(interval),
    '/TR', buildTaskCommand({ vbsWrapperFile: options.repliesVbsWrapperFile || DEFAULT_REPLIES_VBS_WRAPPER_FILE }),
    '/F',
  ];
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function reminderConfigReady(config = {}) {
  return Boolean(text(config.token) && text(config.toUserId));
}

async function runWeixinClawbotSchedule(options = {}, injected = {}) {
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  if (options.install && !fs.existsSync(configFile)) {
    throw new Error(`config file does not exist: ${configFile}`);
  }
  if (options.install) {
    const config = readJson(configFile, {});
    if (!reminderConfigReady(config)) {
      throw new Error(`weixin reminder config is not ready: ${configFile}`);
    }
    if (config.dryRun === true) {
      throw new Error(`weixin reminder config is still dry-run: ${configFile}`);
    }
  }
  const taskCommand = buildTaskCommand(options);
  const wrapperFile = options.wrapperFile || DEFAULT_WRAPPER_FILE;
  const wrapperScript = buildWrapperScript(options);
  const vbsWrapperFile = options.vbsWrapperFile || DEFAULT_VBS_WRAPPER_FILE;
  const vbsLauncherScript = buildVbsLauncherScript({ wrapperFile });
  const schtasksArgs = buildSchtasksArgs(options);
  const repliesWrapperFile = options.repliesWrapperFile || DEFAULT_REPLIES_WRAPPER_FILE;
  const repliesVbsWrapperFile = options.repliesVbsWrapperFile || DEFAULT_REPLIES_VBS_WRAPPER_FILE;
  const repliesTaskCommand = buildTaskCommand({ vbsWrapperFile: repliesVbsWrapperFile });
  const repliesWrapperScript = buildRepliesWrapperScript(options);
  const repliesVbsLauncherScript = buildVbsLauncherScript({ wrapperFile: repliesWrapperFile });
  const repliesSchtasksArgs = buildRepliesSchtasksArgs(options);
  const repliesTask = {
    taskName: options.repliesTaskName || DEFAULT_REPLIES_TASK_NAME,
    intervalMinutes: Math.max(1, Number(options.repliesIntervalMinutes || 1)),
    taskCommand: repliesTaskCommand,
    wrapperFile: repliesWrapperFile,
    wrapperScript: repliesWrapperScript,
    vbsWrapperFile: repliesVbsWrapperFile,
    vbsLauncherScript: repliesVbsLauncherScript,
    schtasksArgs: repliesSchtasksArgs,
  };
  if (!options.install) {
    return {
      ok: true,
      installed: false,
      taskName: options.taskName || DEFAULT_TASK_NAME,
      time: options.time || '09:30',
      taskCommand,
      wrapperFile,
      wrapperScript,
      vbsWrapperFile,
      vbsLauncherScript,
      schtasksArgs,
      repliesTask,
    };
  }
  fs.mkdirSync(path.dirname(wrapperFile), { recursive: true });
  fs.writeFileSync(wrapperFile, wrapperScript, 'utf8');
  fs.mkdirSync(path.dirname(vbsWrapperFile), { recursive: true });
  fs.writeFileSync(vbsWrapperFile, vbsLauncherScript, 'utf8');
  fs.mkdirSync(path.dirname(repliesWrapperFile), { recursive: true });
  fs.writeFileSync(repliesWrapperFile, repliesWrapperScript, 'utf8');
  fs.mkdirSync(path.dirname(repliesVbsWrapperFile), { recursive: true });
  fs.writeFileSync(repliesVbsWrapperFile, repliesVbsLauncherScript, 'utf8');
  const spawnSync = injected.spawnSync || childProcess.spawnSync;
  const result = spawnSync('schtasks', schtasksArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`schtasks failed: ${result.stderr || result.stdout || result.status}`);
  }
  const repliesResult = spawnSync('schtasks', repliesSchtasksArgs, { encoding: 'utf8' });
  if (repliesResult.status !== 0) {
    throw new Error(`replies schtasks failed: ${repliesResult.stderr || repliesResult.stdout || repliesResult.status}`);
  }
  return {
    ok: true,
    installed: true,
    taskName: options.taskName || DEFAULT_TASK_NAME,
    time: options.time || '09:30',
    taskCommand,
    wrapperFile,
    wrapperScript,
    vbsWrapperFile,
    vbsLauncherScript,
    schtasksArgs,
    repliesTask,
    stdout: result.stdout || '',
    repliesStdout: repliesResult.stdout || '',
  };
}

async function main() {
  const result = await runWeixinClawbotSchedule(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_TASK_NAME,
  DEFAULT_REPLIES_TASK_NAME,
  buildRepliesSchtasksArgs,
  buildRepliesWrapperScript,
  buildSchtasksArgs,
  buildTaskCommand,
  buildVbsLauncherScript,
  buildWrapperScript,
  reminderConfigReady,
  parseArgs,
  runWeixinClawbotSchedule,
};
