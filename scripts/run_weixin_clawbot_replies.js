const fs = require('fs');
const path = require('path');
const { createWeixinClawbotClient } = require('../src/weixin_clawbot_http');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG_FILE = path.join(ROOT, 'config', 'weixin_clawbot.local.json');
const DEFAULT_INBOX_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_replies_inbox.json');
const DEFAULT_CURSOR_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_replies_cursor.txt');

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

function readText(file, fallback = '') {
  if (!file || !fs.existsSync(file)) return fallback;
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
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
    ...(Object.prototype.hasOwnProperty.call(options, 'cursor') ? { cursor: options.cursor } : {}),
  };
}

function normalizeReplyMessage(message = {}) {
  return {
    messageId: text(message.message_id),
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

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const parsed = {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || DEFAULT_CONFIG_FILE,
    inboxFile: get('--inbox') || process.env.WEIXIN_CLAWBOT_INBOX || DEFAULT_INBOX_FILE,
    cursorFile: get('--cursor-file') || process.env.WEIXIN_CLAWBOT_CURSOR_FILE || DEFAULT_CURSOR_FILE,
    token: get('--token') || process.env.WEIXIN_CLAWBOT_TOKEN || '',
    baseUrl: get('--base-url') || process.env.WEIXIN_CLAWBOT_BASE_URL || '',
    toUserId: get('--to-user-id') || process.env.WEIXIN_CLAWBOT_TO_USER_ID || '',
    contextToken: get('--context-token') || process.env.WEIXIN_CLAWBOT_CONTEXT_TOKEN || '',
    botName: get('--bot-name') || process.env.WEIXIN_CLAWBOT_BOT_NAME || '小哆',
    operatorName: get('--operator-name') || process.env.WEIXIN_CLAWBOT_OPERATOR_NAME || '哆布',
    ack: args.includes('--ack') || process.env.WEIXIN_CLAWBOT_ACK === '1',
  };
  const cursor = get('--cursor') || process.env.WEIXIN_CLAWBOT_CURSOR || '';
  if (cursor) parsed.cursor = cursor;
  return parsed;
}

async function runWeixinClawbotReplies(options = {}, injected = {}) {
  const config = loadConfig(options);
  const inboxFile = config.inboxFile || DEFAULT_INBOX_FILE;
  const cursorFile = config.cursorFile || DEFAULT_CURSOR_FILE;
  const cursor = Object.prototype.hasOwnProperty.call(config, 'cursor')
    ? text(config.cursor)
    : text(readText(cursorFile));
  if (!text(config.token)) throw new Error('WEIXIN_CLAWBOT_TOKEN or --token is required');

  const client = injected.client || createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
  const updates = await client.getUpdates({ cursor });
  const nextCursor = text(updates.get_updates_buf || cursor);
  const inbox = readJson(inboxFile, { messages: [] });
  const seen = new Set((inbox.messages || []).map(message => text(message.messageId)).filter(Boolean));
  const messages = (updates.msgs || [])
    .map(normalizeReplyMessage)
    .filter(message => message.text)
    .filter(message => !text(config.toUserId) || message.fromUserId === text(config.toUserId))
    .filter(message => !message.messageId || !seen.has(message.messageId))
    .map(message => ({
      ...message,
      fromName: text(config.operatorName || '哆布'),
      capturedAt: new Date().toISOString(),
      handled: false,
    }));

  if (messages.length) {
    writeJson(inboxFile, {
      ...inbox,
      messages: [...(inbox.messages || []), ...messages],
    });
  } else if (!fs.existsSync(inboxFile)) {
    writeJson(inboxFile, { messages: [] });
  }
  writeText(cursorFile, nextCursor);

  let ackSent = false;
  if (config.ack && messages.length && text(config.toUserId)) {
    await client.sendText({
      toUserId: config.toUserId,
      contextToken: messages[0].contextToken || config.contextToken,
      text: `${text(config.botName || '小哆')}收到啦，${text(config.operatorName || '哆布')}。我会交给 Codex 做只读处理；涉及广告/库存/价格/listing 写入的，会先拦住。`,
    });
    ackSent = true;
  }

  return {
    ok: true,
    received: messages.length,
    ackSent,
    inboxFile,
    cursorFile,
    nextCursor,
    messages,
  };
}

async function main() {
  const result = await runWeixinClawbotReplies(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: result.ok,
    received: result.received,
    ackSent: result.ackSent,
    inboxFile: result.inboxFile,
    cursorFile: result.cursorFile,
    nextCursor: result.nextCursor,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  normalizeReplyMessage,
  parseArgs,
  runWeixinClawbotReplies,
};
