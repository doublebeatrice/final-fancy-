const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  runWeixinClawbotReminders,
} = require('../scripts/run_weixin_clawbot_reminders');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-reminders-'));
  const watchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue.json');
  const stateFile = path.join(tmpDir, 'state.json');
  const outFile = path.join(tmpDir, 'digest.json');
  const textFile = path.join(tmpDir, 'digest.md');
  fs.writeFileSync(watchlistFile, JSON.stringify({
    items: [{
      sku: 'MF6328',
      status: 'watching',
      priority: 'P1',
      productIdentity: 'Pool floats',
      nextCheckDate: '2026-06-08',
      nextChecks: ['Check 7d orders and ACOS'],
    }],
  }), 'utf8');
  fs.writeFileSync(reviewQueueFile, JSON.stringify({ due: [] }), 'utf8');

  const sends = [];
  const client = {
    sendText: async message => {
      sends.push(message);
      return { ret: 0 };
    },
  };

  const dryRun = await runWeixinClawbotReminders({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
    stateFile,
    outFile,
    textFile,
    dryRun: true,
    toUserId: 'operator@im.wechat',
    token: 'secret-token',
  }, { client });

  assert.strictEqual(dryRun.sent, false);
  assert.strictEqual(dryRun.skipped, false);
  assert.strictEqual(sends.length, 0);
  assert.ok(!fs.existsSync(stateFile), 'dry run must not mark reminders sent');

  const first = await runWeixinClawbotReminders({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
    stateFile,
    outFile,
    textFile,
    toUserId: 'operator@im.wechat',
    token: 'secret-token',
    contextToken: 'ctx',
  }, { client });

  assert.strictEqual(first.sent, true);
  assert.strictEqual(first.skipped, false);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].toUserId, 'operator@im.wechat');
  assert.strictEqual(sends[0].contextToken, 'ctx');
  assert.ok(sends[0].text.includes('MF6328'));
  assert.ok(fs.existsSync(stateFile));

  const duplicate = await runWeixinClawbotReminders({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
    stateFile,
    outFile,
    textFile,
    toUserId: 'operator@im.wechat',
    token: 'secret-token',
  }, { client });

  assert.strictEqual(duplicate.sent, false);
  assert.strictEqual(duplicate.skipped, true);
  assert.strictEqual(duplicate.skipReason, 'already_sent');
  assert.strictEqual(sends.length, 1);

  const forced = await runWeixinClawbotReminders({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
    stateFile,
    outFile,
    textFile,
    toUserId: 'operator@im.wechat',
    token: 'secret-token',
    force: true,
  }, { client });

  assert.strictEqual(forced.sent, true);
  assert.strictEqual(forced.skipped, false);
  assert.strictEqual(sends.length, 2);

  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  const configStateFile = path.join(tmpDir, 'state-from-config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    token: 'config-token',
    toUserId: 'operator-from-config@im.wechat',
    contextToken: 'ctx-from-config',
  }), 'utf8');
  const parsed = parseArgs([
    'node',
    'scripts/run_weixin_clawbot_reminders.js',
    '--config', configFile,
    '--today', '2026-06-08',
    '--watchlist', watchlistFile,
    '--review-queue', reviewQueueFile,
    '--state', configStateFile,
    '--out', outFile,
    '--text-out', textFile,
  ]);
  const fromConfig = await runWeixinClawbotReminders(parsed, { client });
  assert.strictEqual(fromConfig.sent, true);
  assert.strictEqual(sends[2].toUserId, 'operator-from-config@im.wechat');
  assert.strictEqual(sends[2].contextToken, 'ctx-from-config');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
