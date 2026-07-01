const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_BASE_URL,
  buildSendTextBody,
  createWeixinClawbotClient,
  normalizeQrStatus,
} = require('../src/weixin_clawbot_http');
const {
  buildSkuReviewDigest,
  renderSkuReviewText,
} = require('../src/sku_review_digest');

async function main() {
{
  const body = buildSendTextBody({
    toUserId: 'operator@im.wechat',
    text: 'SKU review due: MF6328',
    contextToken: 'ctx-1',
    clientId: 'fixed-client-id',
  });

  assert.strictEqual(body.msg.to_user_id, 'operator@im.wechat');
  assert.strictEqual(body.msg.client_id, 'fixed-client-id');
  assert.strictEqual(body.msg.message_type, 2);
  assert.strictEqual(body.msg.message_state, 2);
  assert.strictEqual(body.msg.context_token, 'ctx-1');
  assert.deepStrictEqual(body.msg.item_list, [{
    type: 1,
    text_item: { text: 'SKU review due: MF6328' },
  }]);
}

{
  const requests = [];
  const client = createWeixinClawbotClient({
    token: 'secret-token',
    randomUin: () => '123456',
    fetchImpl: async (url, request) => {
      requests.push({ url, request });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ret: 0 }),
      };
    },
  });

  await client.sendText({
    toUserId: 'operator@im.wechat',
    text: 'ping',
    contextToken: 'ctx-1',
    clientId: 'client-1',
  });

  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].url, `${DEFAULT_BASE_URL}/ilink/bot/sendmessage`);
  assert.strictEqual(requests[0].request.method, 'POST');
  assert.strictEqual(requests[0].request.headers.AuthorizationType, 'ilink_bot_token');
  assert.strictEqual(requests[0].request.headers.Authorization, 'Bearer secret-token');
  assert.strictEqual(requests[0].request.headers['X-WECHAT-UIN'], Buffer.from('123456').toString('base64'));
  assert.strictEqual(JSON.parse(requests[0].request.body).msg.to_user_id, 'operator@im.wechat');
}

{
  assert.deepStrictEqual(normalizeQrStatus({ status: 'confirmed', bot_token: 't', ilink_bot_id: 'bot@im.bot', baseurl: 'https://x' }), {
    status: 'confirmed',
    connected: true,
    token: 't',
    accountId: 'bot@im.bot',
    baseUrl: 'https://x',
    userId: '',
    needsVerifyCode: false,
  });
  assert.strictEqual(normalizeQrStatus({ status: 'need_verifycode' }).needsVerifyCode, true);
  assert.strictEqual(normalizeQrStatus({ status: 'expired' }).connected, false);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-review-digest-'));
  const watchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue.json');
  fs.writeFileSync(watchlistFile, JSON.stringify({
    items: [{
      sku: 'MF6328',
      status: 'watching',
      priority: 'P1',
      productIdentity: 'Pool floats',
      nextCheckDate: '2026-06-07',
      lastAction: { summary: 'Trimmed weak generic traffic' },
      nextChecks: ['Check 7d orders and ACOS'],
      closeConditions: ['Narrow terms produce orders'],
    }, {
      sku: 'FUTURE1',
      status: 'watching',
      priority: 'P2',
      nextCheckDate: '2026-06-12',
    }],
  }), 'utf8');
  fs.writeFileSync(reviewQueueFile, JSON.stringify({
    due: [{
      taskId: 'review-mf6328',
      priority: 'P1',
      subject: { sku: 'MF6328' },
      dueDate: '2026-06-08',
      checklist: ['Compare baseline and current window'],
      rollbackIf: 'spend rises without orders',
    }, {
      taskId: 'review-beu0541',
      priority: 'P1',
      subject: { sku: 'BEU0541' },
      dueDate: '2026-06-08',
      checklist: ['Check 1d impressions'],
    }],
  }), 'utf8');

  const digest = buildSkuReviewDigest({
    today: '2026-06-08',
    watchlistFile,
    reviewQueueFile,
  });

  assert.strictEqual(digest.summary.due, 2);
  assert.strictEqual(digest.summary.overdue, 1);
  assert.deepStrictEqual(digest.items.map(item => item.sku), ['MF6328', 'BEU0541']);
  assert.strictEqual(digest.items[0].sources.includes('watchlist'), true);
  assert.strictEqual(digest.items[0].sources.includes('review_queue'), true);

  const text = renderSkuReviewText(digest, { botName: '小哆', operatorName: '哆布' });
  assert.ok(text.includes('小哆'));
  assert.ok(text.includes('哆布'));
  assert.ok(text.includes('今天要复查 2 个 SKU'));
  assert.ok(text.includes('1. 【P1】MF6328'));
  assert.ok(text.includes('先看：Pool floats'));
  assert.ok(text.includes('要做：'));
  assert.ok(text.includes('  - Check 7d orders and ACOS'));
  assert.ok(text.includes('回复小哆'));
  assert.ok(text.includes('MF6328'));
  assert.ok(text.includes('BEU0541'));
  assert.ok(text.includes('Check 7d orders and ACOS'));
  assert.ok(!text.includes('product:'));
  assert.ok(!text.includes('check:'));
  for (const line of text.split('\n')) {
    assert.ok(line.length <= 110, `line is too long: ${line}`);
  }
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-review-followup-'));
  const watchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue.json');
  const taskFollowupDir = path.join(tmpDir, 'tasks');
  fs.mkdirSync(taskFollowupDir, { recursive: true });
  fs.writeFileSync(watchlistFile, JSON.stringify({ items: [] }), 'utf8');
  fs.writeFileSync(reviewQueueFile, JSON.stringify({ due: [] }), 'utf8');
  fs.writeFileSync(path.join(taskFollowupDir, 'kei1148_ad_test_followup_2026-06-09.json'), JSON.stringify({
    subject: { sku: 'KEI1148', asin: 'B0FVDZLF3G' },
    priority: 'P1',
    diagnosis: 'Small-step dog toy keyword and ASIN test',
    followUps: [{
      dueDate: '2026-06-12',
      status: 'waiting_review',
      check: ['Read added keyword rows and same-SKU orders'],
      successSignal: 'KEI1148 same-SKU order',
      failureCondition: 'added rows spend >= 5 USD with 0 same-SKU order',
      actionIfFail: 'lower or pause tested rows',
    }, {
      dueDate: '2026-06-16',
      status: 'waiting_review',
      check: ['7d stop or keep decision'],
    }],
  }), 'utf8');

  const digest = buildSkuReviewDigest({
    today: '2026-06-12',
    watchlistFile,
    reviewQueueFile,
    taskFollowupDir,
  });

  assert.strictEqual(digest.summary.due, 1);
  assert.deepStrictEqual(digest.items.map(item => item.sku), ['KEI1148']);
  assert.strictEqual(digest.items[0].sources.includes('task_followup'), true);
  assert.ok(digest.items[0].checks.includes('Read added keyword rows and same-SKU orders'));
  assert.strictEqual(digest.items[0].rollbackIf, 'added rows spend >= 5 USD with 0 same-SKU order');
}

console.log('weixin_clawbot_http tests passed');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
