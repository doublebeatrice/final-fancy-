const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runWeixinClawbotDoctor } = require('../scripts/run_weixin_clawbot_doctor');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-clawbot-doctor-'));
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  const watchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue.json');
  fs.writeFileSync(watchlistFile, JSON.stringify({
    items: [{
      sku: 'MF6328',
      status: 'watching',
      priority: 'P1',
      nextCheckDate: '2026-06-08',
      nextChecks: ['Check 7d orders and ACOS'],
    }],
  }), 'utf8');
  fs.writeFileSync(reviewQueueFile, JSON.stringify({ due: [] }), 'utf8');

  fs.writeFileSync(configFile, JSON.stringify({
    token: '',
    toUserId: '',
    contextToken: '',
    watchlistFile,
    reviewQueueFile,
  }), 'utf8');

  const incomplete = await runWeixinClawbotDoctor({
    today: '2026-06-08',
    configFile,
    outDir: tmpDir,
    taskName: 'AdOpsWeixinDoctorTest',
  });

  assert.strictEqual(incomplete.ok, true);
  assert.strictEqual(incomplete.readyToSend, false);
  assert.ok(incomplete.blockers.includes('missing_token'));
  assert.ok(incomplete.blockers.includes('missing_to_user_id'));
  assert.strictEqual(incomplete.checks.reminderDryRun.ok, true);
  assert.strictEqual(incomplete.checks.schedulePreview.ok, true);
  assert.ok(incomplete.nextSteps.includes('run login setup'));

  fs.writeFileSync(configFile, JSON.stringify({
    token: 'secret-token',
    toUserId: 'operator@im.wechat',
    contextToken: 'ctx',
    dryRun: true,
    watchlistFile,
    reviewQueueFile,
  }), 'utf8');

  const dryRunConfigured = await runWeixinClawbotDoctor({
    today: '2026-06-08',
    configFile,
    outDir: tmpDir,
    taskName: 'AdOpsWeixinDoctorTest',
  });

  assert.strictEqual(dryRunConfigured.readyToSend, false);
  assert.ok(dryRunConfigured.blockers.includes('dry_run_enabled'));
  assert.ok(dryRunConfigured.nextSteps.includes('disable dry-run in local config'));

  fs.writeFileSync(configFile, JSON.stringify({
    token: 'secret-token',
    toUserId: 'operator@im.wechat',
    contextToken: 'ctx',
    dryRun: false,
    watchlistFile,
    reviewQueueFile,
  }), 'utf8');

  const ready = await runWeixinClawbotDoctor({
    today: '2026-06-08',
    configFile,
    outDir: tmpDir,
    taskName: 'AdOpsWeixinDoctorTest',
  });

  assert.strictEqual(ready.readyToSend, true);
  assert.deepStrictEqual(ready.blockers, []);
  assert.ok(ready.nextSteps.includes('run live reminder send'));
  assert.strictEqual(ready.checks.nodePath.exists, true);
  assert.strictEqual(ready.checks.reminderDryRun.summary.due, 1);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
