const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeReplyMessage,
  parseArgs,
  runWeixinClawbotReplies,
} = require('../scripts/run_weixin_clawbot_replies');

async function main() {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parseArgs([
    'node',
    'scripts/run_weixin_clawbot_replies.js',
  ]), 'cursor'), false);
  assert.strictEqual(parseArgs([
    'node',
    'scripts/run_weixin_clawbot_replies.js',
    '--cursor', 'manual-cursor',
  ]).cursor, 'manual-cursor');

  assert.deepStrictEqual(normalizeReplyMessage({
    message_id: 'm1',
    from_user_id: 'operator@im.wechat',
    to_user_id: 'bot@im.bot',
    context_token: 'ctx-1',
    create_time_ms: 1780917000000,
    item_list: [{ type: 1, text_item: { text: 'QQ1764 已看，先查广告' } }],
  }), {
    messageId: 'm1',
    fromUserId: 'operator@im.wechat',
    toUserId: 'bot@im.bot',
    contextToken: 'ctx-1',
    createTimeMs: 1780917000000,
    text: 'QQ1764 已看，先查广告',
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-replies-'));
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  const inboxFile = path.join(tmpDir, 'inbox.json');
  const cursorFile = path.join(tmpDir, 'cursor.txt');
  fs.writeFileSync(configFile, JSON.stringify({
    token: 'secret-token',
    toUserId: 'operator@im.wechat',
    contextToken: 'ctx-config',
  }), 'utf8');

  const sends = [];
  const client = {
    getUpdates: async options => {
      assert.strictEqual(options.cursor, '');
      return {
        get_updates_buf: 'next-cursor',
        msgs: [{
          message_id: 'm1',
          from_user_id: 'operator@im.wechat',
          to_user_id: 'bot@im.bot',
          context_token: 'ctx-1',
          create_time_ms: 1780917000000,
          item_list: [{ type: 1, text_item: { text: 'QQ1764 已看，先查广告' } }],
        }, {
          message_id: 'empty',
          from_user_id: 'operator@im.wechat',
          item_list: [],
        }],
      };
    },
    sendText: async message => {
      sends.push(message);
      return { ret: 0 };
    },
  };

  const result = await runWeixinClawbotReplies({
    configFile,
    inboxFile,
    cursorFile,
    ack: true,
    botName: '小哆',
    operatorName: '哆布',
  }, { client });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.received, 1);
  assert.strictEqual(result.ackSent, true);
  assert.strictEqual(result.nextCursor, 'next-cursor');
  assert.strictEqual(fs.readFileSync(cursorFile, 'utf8'), 'next-cursor');
  const inbox = JSON.parse(fs.readFileSync(inboxFile, 'utf8'));
  assert.strictEqual(inbox.messages.length, 1);
  assert.strictEqual(inbox.messages[0].fromName, '哆布');
  assert.strictEqual(inbox.messages[0].text, 'QQ1764 已看，先查广告');
  assert.strictEqual(sends.length, 1);
  assert.ok(sends[0].text.includes('小哆收到'));
  assert.ok(sends[0].text.includes('哆布'));

  const duplicate = await runWeixinClawbotReplies({
    configFile,
    inboxFile,
    cursorFile,
    cursor: '',
    ack: true,
    botName: '小哆',
    operatorName: '哆布',
  }, { client });
  assert.strictEqual(duplicate.received, 0);
  assert.strictEqual(sends.length, 1);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
