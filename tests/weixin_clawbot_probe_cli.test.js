const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  runWeixinClawbotProbe,
} = require('../scripts/run_weixin_clawbot_probe');

async function main() {
  const calls = [];
  const client = {
    startLogin: async options => {
      calls.push(['startLogin', options]);
      return { qrcode_img_content: 'https://qr.example/login', qrcode: 'qr-token' };
    },
    pollLogin: async options => {
      calls.push(['pollLogin', options]);
      return { connected: true, token: 'bot-token', accountId: 'bot@im.bot', baseUrl: 'https://base.example' };
    },
    getUpdates: async options => {
      calls.push(['getUpdates', options]);
      return { ret: 0, msgs: [{ from_user_id: 'operator@im.wechat', context_token: 'ctx' }], get_updates_buf: 'next-cursor' };
    },
    sendText: async options => {
      calls.push(['sendText', options]);
      return { ret: 0 };
    },
  };

  const loginStart = await runWeixinClawbotProbe({ action: 'login-start', botType: '3' }, { client });
  assert.strictEqual(loginStart.qrcodeUrl, 'https://qr.example/login');
  assert.deepStrictEqual(calls[0], ['startLogin', { botType: '3', localTokenList: [] }]);

  const loginPoll = await runWeixinClawbotProbe({ action: 'login-poll', qrcode: 'qr-token' }, { client });
  assert.strictEqual(loginPoll.connected, true);
  assert.strictEqual(loginPoll.token, 'bot-token');

  const updates = await runWeixinClawbotProbe({ action: 'get-updates', cursor: 'old-cursor' }, { client });
  assert.strictEqual(updates.messageCount, 1);
  assert.strictEqual(updates.nextCursor, 'next-cursor');
  assert.strictEqual(updates.messages[0].fromUserId, 'operator@im.wechat');
  assert.strictEqual(updates.messages[0].contextToken, 'ctx');

  const send = await runWeixinClawbotProbe({
    action: 'send-text',
    toUserId: 'operator@im.wechat',
    text: 'pong',
    contextToken: 'ctx',
  }, { client });
  assert.strictEqual(send.sent, true);
  assert.strictEqual(calls[3][1].text, 'pong');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-probe-'));
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  fs.writeFileSync(configFile, JSON.stringify({
    token: 'config-token',
    toUserId: 'operator-from-config@im.wechat',
    contextToken: 'ctx-from-config',
    text: 'from config',
  }), 'utf8');
  const parsed = parseArgs([
    'node',
    'scripts/run_weixin_clawbot_probe.js',
    '--config', configFile,
    '--action', 'send-text',
  ]);
  const fromConfig = await runWeixinClawbotProbe(parsed, { client });
  assert.strictEqual(fromConfig.sent, true);
  assert.strictEqual(calls[4][1].toUserId, 'operator-from-config@im.wechat');
  assert.strictEqual(calls[4][1].contextToken, 'ctx-from-config');
  assert.strictEqual(calls[4][1].text, 'from config');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
