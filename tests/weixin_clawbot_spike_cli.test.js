const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runWeixinClawbotSpike } = require('../scripts/run_weixin_clawbot_spike');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-spike-'));
  const watchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue.json');
  const outFile = path.join(tmpDir, 'digest.json');
  const textFile = path.join(tmpDir, 'digest.md');
  fs.writeFileSync(watchlistFile, JSON.stringify({
    items: [{
      sku: 'HAI4870',
      status: 'watching',
      priority: 'P1',
      nextCheckDate: '2026-06-08',
      nextChecks: ['Check 3d clicks and search terms'],
    }],
  }), 'utf8');
  fs.writeFileSync(reviewQueueFile, JSON.stringify({ due: [] }), 'utf8');

  const result = await runWeixinClawbotSpike({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
    outFile,
    textFile,
    dryRun: true,
    toUserId: 'operator@im.wechat',
    token: 'secret-token',
    contextToken: 'ctx',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.sent, false);
  assert.ok(result.text.includes('HAI4870'));
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(textFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')).items[0].sku, 'HAI4870');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
