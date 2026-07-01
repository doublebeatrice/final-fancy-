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

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function todayOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function defaultFile(prefix, today, ext) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${todayOnly(today)}.${ext}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || '',
    today: get('--today') || process.env.WEIXIN_CLAWBOT_TODAY || '',
    watchlistFile: get('--watchlist') || process.env.WEIXIN_CLAWBOT_WATCHLIST || '',
    reviewQueueFile: get('--review-queue') || process.env.WEIXIN_CLAWBOT_REVIEW_QUEUE || '',
    outFile: get('--out') || process.env.WEIXIN_CLAWBOT_OUT || '',
    textFile: get('--text-out') || process.env.WEIXIN_CLAWBOT_TEXT_OUT || '',
    toUserId: get('--to-user-id') || process.env.WEIXIN_CLAWBOT_TO_USER_ID || '',
    contextToken: get('--context-token') || process.env.WEIXIN_CLAWBOT_CONTEXT_TOKEN || '',
    token: get('--token') || process.env.WEIXIN_CLAWBOT_TOKEN || '',
    baseUrl: get('--base-url') || process.env.WEIXIN_CLAWBOT_BASE_URL || '',
    dryRun: args.includes('--dry-run') || process.env.WEIXIN_CLAWBOT_DRY_RUN === '1',
  };
}

async function runWeixinClawbotSpike(options = {}) {
  const config = {
    ...readJson(options.configFile, {}),
    ...options,
  };
  const today = todayOnly(config.today);
  const digest = buildSkuReviewDigest({
    today,
    root: ROOT,
    watchlistFile: config.watchlistFile,
    reviewQueueFile: config.reviewQueueFile,
  });
  const messageText = renderSkuReviewText(digest);
  const outFile = config.outFile || defaultFile('weixin_clawbot_sku_review', today, 'json');
  const textFile = config.textFile || defaultFile('weixin_clawbot_sku_review', today, 'md');
  writeFile(outFile, JSON.stringify(digest, null, 2));
  writeFile(textFile, messageText);

  if (config.dryRun) {
    return {
      ok: true,
      dryRun: true,
      sent: false,
      today,
      outFile,
      textFile,
      summary: digest.summary,
      text: messageText,
    };
  }

  if (!text(config.token)) throw new Error('WEIXIN_CLAWBOT_TOKEN or --token is required when not using --dry-run');
  if (!text(config.toUserId)) throw new Error('WEIXIN_CLAWBOT_TO_USER_ID or --to-user-id is required when not using --dry-run');

  const client = createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
  await client.sendText({
    toUserId: config.toUserId,
    contextToken: config.contextToken,
    text: messageText,
  });
  return {
    ok: true,
    dryRun: false,
    sent: true,
    today,
    outFile,
    textFile,
    summary: digest.summary,
    text: messageText,
  };
}

async function main() {
  const result = await runWeixinClawbotSpike(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: result.ok,
    dryRun: result.dryRun,
    sent: result.sent,
    today: result.today,
    outFile: result.outFile,
    textFile: result.textFile,
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
  parseArgs,
  runWeixinClawbotSpike,
};
