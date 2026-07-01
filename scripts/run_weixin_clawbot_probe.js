const fs = require('fs');
const { createWeixinClawbotClient } = require('../src/weixin_clawbot_http');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(',').map(text).filter(Boolean);
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function nonEmptyOptions(options = {}) {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && value === '') return false;
    return true;
  }));
}

function loadConfig(options = {}) {
  return {
    ...readJson(options.configFile, {}),
    ...nonEmptyOptions(options),
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || '',
    action: get('--action') || process.env.WEIXIN_CLAWBOT_ACTION || 'get-updates',
    token: get('--token') || process.env.WEIXIN_CLAWBOT_TOKEN || '',
    baseUrl: get('--base-url') || process.env.WEIXIN_CLAWBOT_BASE_URL || '',
    botType: get('--bot-type') || process.env.WEIXIN_CLAWBOT_BOT_TYPE || '3',
    qrcode: get('--qrcode') || process.env.WEIXIN_CLAWBOT_QRCODE || '',
    verifyCode: get('--verify-code') || process.env.WEIXIN_CLAWBOT_VERIFY_CODE || '',
    cursor: get('--cursor') || process.env.WEIXIN_CLAWBOT_CURSOR || '',
    localTokenList: get('--local-token-list') || process.env.WEIXIN_CLAWBOT_LOCAL_TOKEN_LIST || '',
    toUserId: get('--to-user-id') || process.env.WEIXIN_CLAWBOT_TO_USER_ID || '',
    contextToken: get('--context-token') || process.env.WEIXIN_CLAWBOT_CONTEXT_TOKEN || '',
    text: get('--text') || process.env.WEIXIN_CLAWBOT_TEXT || '',
  };
}

function normalizeMessage(message = {}) {
  return {
    messageId: message.message_id || '',
    fromUserId: text(message.from_user_id),
    toUserId: text(message.to_user_id),
    contextToken: text(message.context_token),
    createTimeMs: message.create_time_ms || 0,
    text: (message.item_list || [])
      .map(item => text(item.text_item?.text))
      .filter(Boolean)
      .join('\n'),
  };
}

async function runWeixinClawbotProbe(options = {}, injected = {}) {
  const config = loadConfig(options);
  const client = injected.client || createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
  const action = text(config.action || 'get-updates');

  if (action === 'login-start') {
    const result = await client.startLogin({
      botType: text(config.botType || '3'),
      localTokenList: list(config.localTokenList),
    });
    return {
      ok: true,
      action,
      qrcode: result.qrcode || '',
      qrcodeUrl: result.qrcode_img_content || result.qrcodeUrl || '',
      rawStatus: result.status || '',
    };
  }

  if (action === 'login-poll') {
    if (!text(config.qrcode)) throw new Error('--qrcode is required for login-poll');
    const result = await client.pollLogin({
      qrcode: config.qrcode,
      verifyCode: config.verifyCode,
    });
    return {
      ok: true,
      action,
      ...result,
    };
  }

  if (action === 'get-updates') {
    const result = await client.getUpdates({ cursor: config.cursor });
    const messages = (result.msgs || []).map(normalizeMessage);
    return {
      ok: true,
      action,
      ret: result.ret,
      messageCount: messages.length,
      nextCursor: text(result.get_updates_buf),
      longpollingTimeoutMs: result.longpolling_timeout_ms || 0,
      messages,
    };
  }

  if (action === 'send-text') {
    if (!text(config.toUserId)) throw new Error('--to-user-id is required for send-text');
    if (!text(config.text)) throw new Error('--text is required for send-text');
    await client.sendText({
      toUserId: config.toUserId,
      contextToken: config.contextToken,
      text: config.text,
    });
    return {
      ok: true,
      action,
      sent: true,
      toUserId: config.toUserId,
    };
  }

  throw new Error(`unsupported action: ${action}`);
}

async function main() {
  const result = await runWeixinClawbotProbe(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  nonEmptyOptions,
  normalizeMessage,
  parseArgs,
  runWeixinClawbotProbe,
};
