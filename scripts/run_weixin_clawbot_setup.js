const fs = require('fs');
const path = require('path');
const { createWeixinClawbotClient } = require('../src/weixin_clawbot_http');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG_FILE = path.join(ROOT, 'config', 'weixin_clawbot.local.json');
const DEFAULT_CONFIG = {
  baseUrl: 'https://ilinkai.weixin.qq.com',
  token: '',
  accountId: '',
  toUserId: '',
  contextToken: '',
  dryRun: true,
  botName: '小哆',
  operatorName: '哆布',
  watchlistFile: 'data/tasks/sku_watchlist.json',
  reviewQueueFile: '',
  outFile: '',
  textFile: '',
  stateFile: 'data/agent/weixin_clawbot_reminders_state.json',
};

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

function redact(value) {
  const raw = text(value);
  if (!raw) return '';
  if (raw.length <= 8) return `${raw.slice(0, 2)}...`;
  return `${raw.slice(0, 3)}...${raw.slice(-3)}`;
}

function readiness(config = {}) {
  const ready = {
    token: Boolean(text(config.token)),
    toUserId: Boolean(text(config.toUserId)),
    contextToken: Boolean(text(config.contextToken)),
    liveMode: config.dryRun !== true,
  };
  const readyToSend = ready.token && ready.toUserId && ready.liveMode;
  return {
    ready,
    readyToSend,
    redacted: {
      token: redact(config.token),
      accountId: text(config.accountId),
      toUserId: text(config.toUserId),
      contextToken: redact(config.contextToken),
      baseUrl: text(config.baseUrl || DEFAULT_CONFIG.baseUrl),
    },
    nextSteps: nextStepsFor(ready),
  };
}

function nextStepsFor(ready = {}) {
  if (!ready.token) {
    return [
      'run login setup',
      'scan the qrcodeUrl printed by setup',
    ];
  }
  if (!ready.toUserId) {
    return [
      'send one Weixin message to the bot account',
      'run capture-recipient setup',
    ];
  }
  if (!ready.liveMode) {
    return [
      'disable dry-run in local config',
      'run doctor check',
    ];
  }
  return [
    'run dry-run reminder',
    'run live reminder send',
    'preview or install daily schedule',
  ];
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    action: get('--action') || process.env.WEIXIN_CLAWBOT_SETUP_ACTION || 'status',
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || DEFAULT_CONFIG_FILE,
    token: get('--token') || process.env.WEIXIN_CLAWBOT_TOKEN || '',
    baseUrl: get('--base-url') || process.env.WEIXIN_CLAWBOT_BASE_URL || '',
    accountId: get('--account-id') || process.env.WEIXIN_CLAWBOT_ACCOUNT_ID || '',
    toUserId: get('--to-user-id') || process.env.WEIXIN_CLAWBOT_TO_USER_ID || '',
    contextToken: get('--context-token') || process.env.WEIXIN_CLAWBOT_CONTEXT_TOKEN || '',
    fromJson: get('--from-json') || process.env.WEIXIN_CLAWBOT_FROM_JSON || '',
    botType: get('--bot-type') || process.env.WEIXIN_CLAWBOT_BOT_TYPE || '3',
    maxPolls: Number(get('--max-polls') || process.env.WEIXIN_CLAWBOT_MAX_POLLS || 24),
    pollIntervalMs: Number(get('--poll-interval-ms') || process.env.WEIXIN_CLAWBOT_POLL_INTERVAL_MS || 5000),
    cursor: get('--cursor') || process.env.WEIXIN_CLAWBOT_CURSOR || '',
    force: args.includes('--force') || process.env.WEIXIN_CLAWBOT_FORCE === '1',
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildClient(config = {}) {
  return createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
}

async function runWeixinClawbotSetup(options = {}, injected = {}) {
  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const action = text(options.action || 'status');
  const existing = readJson(configFile, {});
  let next = { ...DEFAULT_CONFIG, ...existing };
  const wait = injected.sleep || sleep;
  const client = injected.client || buildClient(next);
  const onQrCode = injected.onQrCode || (() => {});

  if (action === 'init') {
    if (fs.existsSync(configFile) && !options.force) {
      return {
        ok: true,
        action,
        exists: true,
        configFile,
        ...readiness(next),
      };
    }
    writeJson(configFile, next);
    return {
      ok: true,
      action,
      exists: true,
      configFile,
      ...readiness(next),
    };
  }

  if (action === 'apply-login') {
    const source = readJson(options.fromJson, {});
    const token = text(options.token || source.token || source.botToken);
    const baseUrl = text(options.baseUrl || source.baseUrl);
    const accountId = text(options.accountId || source.accountId);
    if (token) next.token = token;
    if (baseUrl) next.baseUrl = baseUrl;
    if (accountId) next.accountId = accountId;
    writeJson(configFile, next);
    return {
      ok: true,
      action,
      configFile,
      ...readiness(next),
    };
  }

  if (action === 'apply-recipient') {
    const source = readJson(options.fromJson, {});
    const firstMessage = Array.isArray(source.messages) ? source.messages[0] : {};
    const toUserId = text(options.toUserId || firstMessage.fromUserId || firstMessage.from_user_id);
    const contextToken = text(options.contextToken || firstMessage.contextToken || firstMessage.context_token);
    if (toUserId) next.toUserId = toUserId;
    if (contextToken) next.contextToken = contextToken;
    writeJson(configFile, next);
    return {
      ok: true,
      action,
      configFile,
      ...readiness(next),
    };
  }

  if (action === 'login') {
    const start = await client.startLogin({
      botType: text(options.botType || '3'),
      localTokenList: next.token ? [next.token] : [],
    });
    const qrcode = text(start.qrcode);
    const qrcodeUrl = text(start.qrcode_img_content || start.qrcodeUrl);
    onQrCode({ qrcode, qrcodeUrl });
    let lastStatus = null;
    const maxPolls = Math.max(1, Number(options.maxPolls || 24));
    const intervalMs = Math.max(0, Number(options.pollIntervalMs || 5000));
    for (let index = 0; index < maxPolls; index += 1) {
      lastStatus = await client.pollLogin({ qrcode });
      if (lastStatus.connected) {
        next.token = text(lastStatus.token || lastStatus.botToken);
        next.baseUrl = text(lastStatus.baseUrl || next.baseUrl || DEFAULT_CONFIG.baseUrl);
        next.accountId = text(lastStatus.accountId || next.accountId);
        writeJson(configFile, next);
        return {
          ok: true,
          action,
          connected: true,
          qrcode,
          qrcodeUrl,
          status: lastStatus.status,
          configFile,
          ...readiness(next),
        };
      }
      if (['expired', 'verify_code_blocked', 'binded_redirect'].includes(text(lastStatus.status))) break;
      if (index < maxPolls - 1) await wait(intervalMs);
    }
    return {
      ok: true,
      action,
      connected: false,
      qrcode,
      qrcodeUrl,
      status: lastStatus?.status || '',
      configFile,
      ...readiness(next),
    };
  }

  if (action === 'capture-recipient') {
    const maxPolls = Math.max(1, Number(options.maxPolls || 12));
    const intervalMs = Math.max(0, Number(options.pollIntervalMs || 5000));
    let cursor = text(options.cursor);
    let last = null;
    for (let index = 0; index < maxPolls; index += 1) {
      last = await client.getUpdates({ cursor });
      cursor = text(last.get_updates_buf || cursor);
      const messages = Array.isArray(last.msgs) ? last.msgs : [];
      const first = messages.find(message => text(message.from_user_id) && text(message.context_token));
      if (first) {
        next.toUserId = text(first.from_user_id);
        next.contextToken = text(first.context_token);
        writeJson(configFile, next);
        return {
          ok: true,
          action,
          captured: true,
          cursor,
          messageCount: messages.length,
          configFile,
          ...readiness(next),
        };
      }
      if (index < maxPolls - 1) await wait(intervalMs);
    }
    return {
      ok: true,
      action,
      captured: false,
      cursor,
      messageCount: Array.isArray(last?.msgs) ? last.msgs.length : 0,
      configFile,
      ...readiness(next),
    };
  }

  if (action === 'status') {
    return {
      ok: true,
      action,
      exists: fs.existsSync(configFile),
      configFile,
      ...readiness(next),
    };
  }

  throw new Error(`unsupported action: ${action}`);
}

async function main() {
  const result = await runWeixinClawbotSetup(parseArgs(process.argv), {
    onQrCode: event => {
      if (!event.qrcodeUrl) return;
      process.stderr.write(`Weixin QR URL: ${event.qrcodeUrl}\n`);
      process.stderr.write(`qrcode: ${event.qrcode}\n`);
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_FILE,
  buildClient,
  parseArgs,
  nextStepsFor,
  readiness,
  redact,
  runWeixinClawbotSetup,
  sleep,
};
