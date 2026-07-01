const fs = require('fs');
const path = require('path');
const { runWeixinClawbotReminders } = require('./run_weixin_clawbot_reminders');
const { runWeixinClawbotSchedule } = require('./run_weixin_clawbot_schedule');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG_FILE = path.join(ROOT, 'config', 'weixin_clawbot.local.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');
const DEFAULT_TASK_NAME = 'AdOpsWeixinClawbotReminders';

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || DEFAULT_CONFIG_FILE,
    today: get('--today') || process.env.WEIXIN_CLAWBOT_TODAY || '',
    outDir: get('--out-dir') || process.env.WEIXIN_CLAWBOT_DOCTOR_OUT_DIR || DEFAULT_OUT_DIR,
    taskName: get('--task-name') || process.env.WEIXIN_CLAWBOT_TASK_NAME || DEFAULT_TASK_NAME,
    time: get('--time') || process.env.WEIXIN_CLAWBOT_TASK_TIME || '09:30',
    nodeExe: get('--node') || process.env.WEIXIN_CLAWBOT_NODE || process.execPath,
  };
}

function configBlockers(config = {}, configFile = '') {
  const blockers = [];
  if (!fs.existsSync(configFile)) blockers.push('missing_config');
  if (!text(config.token)) blockers.push('missing_token');
  if (!text(config.toUserId)) blockers.push('missing_to_user_id');
  if (!text(config.contextToken)) blockers.push('missing_context_token');
  if (config.dryRun === true) blockers.push('dry_run_enabled');
  return blockers;
}

function nextStepsFor(blockers = []) {
  const steps = [];
  if (blockers.includes('missing_config')) steps.push('run setup init');
  if (blockers.includes('missing_token')) steps.push('run login setup');
  if (blockers.includes('missing_to_user_id') || blockers.includes('missing_context_token')) {
    steps.push('send one Weixin message to the bot account');
    steps.push('run capture-recipient setup');
  }
  if (blockers.includes('dry_run_enabled')) steps.push('disable dry-run in local config');
  if (blockers.includes('reminder_dry_run_failed')) steps.push('fix reminder source files');
  if (blockers.includes('node_path_missing') || blockers.includes('schedule_preview_failed')) steps.push('fix scheduler node path');
  if (!steps.length) {
    steps.push('run live reminder send');
    steps.push('install daily schedule after confirming Weixin receipt');
  }
  return [...new Set(steps)];
}

async function safeCheck(fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function runWeixinClawbotDoctor(options = {}) {
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  const today = text(options.today) || new Date().toISOString().slice(0, 10);
  const nodeExe = options.nodeExe || process.execPath;
  const config = readJson(configFile, {});
  const checks = {};

  checks.config = {
    ok: fs.existsSync(configFile),
    configFile,
  };
  checks.nodePath = {
    ok: fs.existsSync(nodeExe),
    exists: fs.existsSync(nodeExe),
    nodeExe,
  };

  checks.reminderDryRun = await safeCheck(() => runWeixinClawbotReminders({
    configFile,
    today,
    dryRun: true,
    outFile: path.join(outDir, `weixin_clawbot_doctor_${today}.json`),
    textFile: path.join(outDir, `weixin_clawbot_doctor_${today}.md`),
    stateFile: path.join(outDir, 'weixin_clawbot_doctor_state.json'),
  }));

  checks.schedulePreview = await safeCheck(() => runWeixinClawbotSchedule({
    taskName: options.taskName || DEFAULT_TASK_NAME,
    time: options.time || '09:30',
    configFile,
    nodeExe,
  }));

  const blockers = configBlockers(config, configFile);
  if (!checks.nodePath.ok) blockers.push('node_path_missing');
  if (!checks.reminderDryRun.ok) blockers.push('reminder_dry_run_failed');
  if (!checks.schedulePreview.ok) blockers.push('schedule_preview_failed');

  return {
    ok: true,
    readyToSend: blockers.length === 0,
    blockers: [...new Set(blockers)],
    nextSteps: nextStepsFor(blockers),
    checks,
  };
}

async function main() {
  const result = await runWeixinClawbotDoctor(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  configBlockers,
  nextStepsFor,
  parseArgs,
  runWeixinClawbotDoctor,
};
