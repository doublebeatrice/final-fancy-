const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runWeixinClawbotSetup } = require('../scripts/run_weixin_clawbot_setup');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-setup-'));
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');

  const init = await runWeixinClawbotSetup({ action: 'init', configFile });
  assert.strictEqual(init.ok, true);
  assert.strictEqual(init.action, 'init');
  assert.strictEqual(init.exists, true);
  assert.ok(fs.existsSync(configFile));

  const initialized = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.strictEqual(initialized.dryRun, true);
  assert.strictEqual(initialized.token, '');
  assert.strictEqual(initialized.botName, '小哆');
  assert.strictEqual(initialized.operatorName, '哆布');

  const login = await runWeixinClawbotSetup({
    action: 'apply-login',
    configFile,
    token: 'secret-token',
    baseUrl: 'https://redirect.example',
    accountId: 'bot@im.bot',
  });
  assert.strictEqual(login.ready.token, true);
  assert.strictEqual(login.redacted.token, 'sec...ken');
  const withLogin = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.strictEqual(withLogin.token, 'secret-token');
  assert.strictEqual(withLogin.baseUrl, 'https://redirect.example');
  assert.strictEqual(withLogin.accountId, 'bot@im.bot');

  const recipient = await runWeixinClawbotSetup({
    action: 'apply-recipient',
    configFile,
    toUserId: 'operator@im.wechat',
    contextToken: 'ctx-1',
  });
  assert.strictEqual(recipient.ready.toUserId, true);
  assert.strictEqual(recipient.ready.contextToken, true);
  const withRecipient = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.strictEqual(withRecipient.toUserId, 'operator@im.wechat');
  assert.strictEqual(withRecipient.contextToken, 'ctx-1');

  const status = await runWeixinClawbotSetup({ action: 'status', configFile });
  assert.strictEqual(status.readyToSend, false);
  assert.strictEqual(status.ready.token, true);
  assert.strictEqual(status.ready.toUserId, true);
  assert.strictEqual(status.redacted.token, 'sec...ken');
  assert.ok(status.nextSteps.includes('disable dry-run in local config'));

  const liveConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  liveConfig.dryRun = false;
  fs.writeFileSync(configFile, JSON.stringify(liveConfig), 'utf8');
  const liveStatus = await runWeixinClawbotSetup({ action: 'status', configFile });
  assert.strictEqual(liveStatus.readyToSend, true);
  assert.ok(liveStatus.nextSteps.includes('run live reminder send'));

  const blankConfig = path.join(tmpDir, 'blank.local.json');
  await runWeixinClawbotSetup({ action: 'init', configFile: blankConfig });
  const blankStatus = await runWeixinClawbotSetup({ action: 'status', configFile: blankConfig });
  assert.strictEqual(blankStatus.readyToSend, false);
  assert.ok(blankStatus.nextSteps.includes('run login setup'));

  const fromJsonConfig = path.join(tmpDir, 'from_json.local.json');
  const loginJsonFile = path.join(tmpDir, 'login.json');
  const updatesJsonFile = path.join(tmpDir, 'updates.json');
  fs.writeFileSync(loginJsonFile, JSON.stringify({
    token: 'json-token',
    baseUrl: 'https://json-base.example',
    accountId: 'json-bot@im.bot',
  }), 'utf8');
  fs.writeFileSync(updatesJsonFile, JSON.stringify({
    messages: [{
      fromUserId: 'json-operator@im.wechat',
      contextToken: 'json-ctx',
    }],
  }), 'utf8');

  await runWeixinClawbotSetup({ action: 'init', configFile: fromJsonConfig });
  await runWeixinClawbotSetup({ action: 'apply-login', configFile: fromJsonConfig, fromJson: loginJsonFile });
  await runWeixinClawbotSetup({ action: 'apply-recipient', configFile: fromJsonConfig, fromJson: updatesJsonFile });
  const fromJson = JSON.parse(fs.readFileSync(fromJsonConfig, 'utf8'));
  assert.strictEqual(fromJson.token, 'json-token');
  assert.strictEqual(fromJson.baseUrl, 'https://json-base.example');
  assert.strictEqual(fromJson.accountId, 'json-bot@im.bot');
  assert.strictEqual(fromJson.toUserId, 'json-operator@im.wechat');
  assert.strictEqual(fromJson.contextToken, 'json-ctx');

  const autoConfig = path.join(tmpDir, 'auto.local.json');
  const calls = [];
  const autoClient = {
    startLogin: async options => {
      calls.push(['startLogin', options]);
      return { qrcode: 'qr-auto', qrcode_img_content: 'https://qr.example/auto' };
    },
    pollLogin: async options => {
      calls.push(['pollLogin', options]);
      return {
        status: 'confirmed',
        connected: true,
        token: 'auto-token',
        accountId: 'auto-bot@im.bot',
        baseUrl: 'https://auto-base.example',
      };
    },
    getUpdates: async options => {
      calls.push(['getUpdates', options]);
      return {
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [{
          from_user_id: 'auto-operator@im.wechat',
          context_token: 'auto-ctx',
          item_list: [{ type: 1, text_item: { text: 'hello' } }],
        }],
      };
    },
  };

  const autoLogin = await runWeixinClawbotSetup({
    action: 'login',
    configFile: autoConfig,
    maxPolls: 1,
  }, { client: autoClient, sleep: async () => {} });
  assert.strictEqual(autoLogin.connected, true);
  assert.strictEqual(autoLogin.qrcodeUrl, 'https://qr.example/auto');
  const qrEvents = [];
  await runWeixinClawbotSetup({
    action: 'login',
    configFile: autoConfig,
    maxPolls: 1,
  }, { client: autoClient, sleep: async () => {}, onQrCode: event => qrEvents.push(event) });
  assert.strictEqual(qrEvents.length, 1);
  assert.strictEqual(qrEvents[0].qrcode, 'qr-auto');
  assert.strictEqual(qrEvents[0].qrcodeUrl, 'https://qr.example/auto');
  let auto = JSON.parse(fs.readFileSync(autoConfig, 'utf8'));
  assert.strictEqual(auto.token, 'auto-token');
  assert.strictEqual(auto.baseUrl, 'https://auto-base.example');

  const autoRecipient = await runWeixinClawbotSetup({
    action: 'capture-recipient',
    configFile: autoConfig,
    maxPolls: 1,
  }, { client: autoClient, sleep: async () => {} });
  assert.strictEqual(autoRecipient.captured, true);
  auto = JSON.parse(fs.readFileSync(autoConfig, 'utf8'));
  assert.strictEqual(auto.toUserId, 'auto-operator@im.wechat');
  assert.strictEqual(auto.contextToken, 'auto-ctx');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
