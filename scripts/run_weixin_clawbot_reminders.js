const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createWeixinClawbotClient } = require('../src/weixin_clawbot_http');
const {
  buildSkuReviewDigest,
  renderSkuReviewText,
} = require('../src/sku_review_digest');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function todayOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function defaultFile(prefix, today, ext) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${todayOnly(today)}.${ext}`);
}

function defaultStateFile() {
  return path.join(DEFAULT_OUT_DIR, 'weixin_clawbot_reminders_state.json');
}

function stableReminderKey(digest = {}) {
  const payload = {
    today: digest.today,
    items: (digest.items || []).map(item => ({
      sku: item.sku,
      priority: item.priority,
      dueDate: item.dueDate,
      sources: item.sources,
      checks: (item.checks || []).slice(0, 2),
    })),
  };
  const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `sku_review:${digest.today}:${hash}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const dryRun = args.includes('--dry-run') || process.env.WEIXIN_CLAWBOT_DRY_RUN === '1';
  const force = args.includes('--force') || process.env.WEIXIN_CLAWBOT_FORCE === '1';
  const parsed = {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || '',
    today: get('--today') || process.env.WEIXIN_CLAWBOT_TODAY || '',
    watchlistFile: get('--watchlist') || process.env.WEIXIN_CLAWBOT_WATCHLIST || '',
    reviewQueueFile: get('--review-queue') || process.env.WEIXIN_CLAWBOT_REVIEW_QUEUE || '',
    outFile: get('--out') || process.env.WEIXIN_CLAWBOT_OUT || '',
    textFile: get('--text-out') || process.env.WEIXIN_CLAWBOT_TEXT_OUT || '',
    stateFile: get('--state') || process.env.WEIXIN_CLAWBOT_STATE || '',
    toUserId: get('--to-user-id') || process.env.WEIXIN_CLAWBOT_TO_USER_ID || '',
    contextToken: get('--context-token') || process.env.WEIXIN_CLAWBOT_CONTEXT_TOKEN || '',
    token: get('--token') || process.env.WEIXIN_CLAWBOT_TOKEN || '',
    baseUrl: get('--base-url') || process.env.WEIXIN_CLAWBOT_BASE_URL || '',
  };
  if (dryRun) parsed.dryRun = true;
  if (force) parsed.force = true;
  return parsed;
}

function loadConfig(options = {}) {
  return {
    ...readJson(options.configFile, {}),
    ...nonEmptyOptions(options),
  };
}

function nonEmptyOptions(options = {}) {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && value === '') return false;
    return true;
  }));
}

async function runWeixinClawbotReminders(options = {}, injected = {}) {
  const config = loadConfig(options);
  const today = todayOnly(config.today);
  const digest = buildSkuReviewDigest({
    today,
    root: ROOT,
    watchlistFile: config.watchlistFile,
    reviewQueueFile: config.reviewQueueFile,
  });
  const messageText = renderSkuReviewText(digest, {
    botName: config.botName,
    operatorName: config.operatorName,
  });
  const outFile = config.outFile || defaultFile('weixin_clawbot_sku_review', today, 'json');
  const textFile = config.textFile || defaultFile('weixin_clawbot_sku_review', today, 'md');
  const stateFile = config.stateFile || defaultStateFile();
  const reminderKey = stableReminderKey(digest);

  writeJson(outFile, digest);
  writeText(textFile, messageText);

  if (!digest.items.length) {
    return {
      ok: true,
      dryRun: Boolean(config.dryRun),
      sent: false,
      skipped: true,
      skipReason: 'no_due_items',
      today,
      reminderKey,
      outFile,
      textFile,
      stateFile,
      summary: digest.summary,
      text: messageText,
    };
  }

  const state = readJson(stateFile, { sent: {} });
  if (!config.force && state.sent?.[reminderKey]) {
    return {
      ok: true,
      dryRun: Boolean(config.dryRun),
      sent: false,
      skipped: true,
      skipReason: 'already_sent',
      today,
      reminderKey,
      outFile,
      textFile,
      stateFile,
      summary: digest.summary,
      text: messageText,
    };
  }

  if (config.dryRun) {
    return {
      ok: true,
      dryRun: true,
      sent: false,
      skipped: false,
      today,
      reminderKey,
      outFile,
      textFile,
      stateFile,
      summary: digest.summary,
      text: messageText,
    };
  }

  if (!text(config.token)) throw new Error('WEIXIN_CLAWBOT_TOKEN or --token is required when not using --dry-run');
  if (!text(config.toUserId)) throw new Error('WEIXIN_CLAWBOT_TO_USER_ID or --to-user-id is required when not using --dry-run');

  const client = injected.client || createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
  await client.sendText({
    toUserId: config.toUserId,
    contextToken: config.contextToken,
    text: messageText,
  });

  const nextState = {
    ...state,
    sent: {
      ...(state.sent || {}),
      [reminderKey]: {
        sentAt: new Date().toISOString(),
        today,
        due: digest.summary.due,
        overdue: digest.summary.overdue,
      },
    },
  };
  writeJson(stateFile, nextState);

  return {
    ok: true,
    dryRun: false,
    sent: true,
    skipped: false,
    today,
    reminderKey,
    outFile,
    textFile,
    stateFile,
    summary: digest.summary,
    text: messageText,
  };
}

async function main() {
  const result = await runWeixinClawbotReminders(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: result.ok,
    dryRun: result.dryRun,
    sent: result.sent,
    skipped: result.skipped,
    skipReason: result.skipReason,
    today: result.today,
    reminderKey: result.reminderKey,
    outFile: result.outFile,
    textFile: result.textFile,
    stateFile: result.stateFile,
    summary: result.summary,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  nonEmptyOptions,
  parseArgs,
  runWeixinClawbotReminders,
  stableReminderKey,
};
