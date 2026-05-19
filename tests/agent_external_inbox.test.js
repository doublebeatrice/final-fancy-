const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildDueReviewQueue,
  buildExternalInbox,
  parseExternalRequest,
} = require('../src/agent_external_inbox');
const { buildAgentLedger } = require('../src/agent_control_plane');
const { runExternalTaskInbox } = require('../scripts/run_external_task_inbox');
const { runAgentReviewQueue } = require('../scripts/run_agent_review_queue');

const timeContext = {
  runAt: '2026-05-19T09:00:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'external-inbox-test',
};

{
  const task = parseExternalRequest('开发问 HAY0218 为什么没流量，能不能推，下午给个运营口径回复', timeContext);

  assert.strictEqual(task.source, 'external_request');
  assert.strictEqual(task.lane, 'external_inbox');
  assert.strictEqual(task.kind, 'developer_product_inquiry');
  assert.strictEqual(task.subject.sku, 'HAY0218');
  assert.strictEqual(task.priority, 'P1');
  assert.strictEqual(task.replyExpectation, 'operator_ready_reply');
  assert.ok(task.evidenceRequirements.includes('ad_backend_sku_summary'));
  assert.ok(task.evidenceRequirements.includes('inventory_health'));
  assert.ok(task.evidenceRequirements.includes('selection_market_evidence'));
  assert.ok(task.nextCheckpoint.includes('2026-05-20'));
}

{
  const task = parseExternalRequest('这个词 nurse gifts for women 能不能加广告？看下转化和竞争', timeContext);

  assert.strictEqual(task.kind, 'keyword_question');
  assert.strictEqual(task.subject.keyword, 'nurse gifts for women');
  assert.ok(task.evidenceRequirements.includes('selection_keyword_conversion'));
  assert.ok(task.evidenceRequirements.includes('selection_aba_search_terms'));
  assert.ok(task.evidenceRequirements.includes('sku_ad_proof'));
}

{
  const task = parseExternalRequest('帮我看这个 ASIN：https://www.amazon.com/dp/B0ABCDEF12 listing 能不能优化标题', timeContext);

  assert.strictEqual(task.kind, 'listing_copy_review');
  assert.strictEqual(task.subject.asin, 'B0ABCDEF12');
  assert.ok(task.evidenceRequirements.includes('amazon_listing_front'));
  assert.ok(task.evidenceRequirements.includes('sellerinventory_origin_data'));
  assert.ok(task.authorizationHint.includes('listing_copy_boundary'));
}

{
  const inbox = buildExternalInbox([
    '老板问今天为什么销售掉，先看总盘',
    { text: '库存问 DN1655 滞销要不要清', requestedBy: 'inventory' },
  ], timeContext);

  assert.strictEqual(inbox.summary.total, 2);
  assert.strictEqual(inbox.summary.byKind.kpi_or_sales_drop_review, 1);
  assert.strictEqual(inbox.summary.byKind.inventory_review, 1);
  assert.strictEqual(inbox.tasks[0].priority, 'P0');
  assert.strictEqual(inbox.tasks[1].requestedBy, 'inventory');
}

{
  const ledger = buildAgentLedger({
    timeContext,
    tasks: [
      {
        source: 'effect_review',
        kind: 'effect_review',
        title: 'SE5608 3日效果复查',
        subject: { sku: 'SE5608', entityId: 'campaign-1' },
        status: 'waiting_review',
        dueDate: '2026-05-19',
        reviewPlan: { metrics: ['orders', 'spend', 'acos'], rollbackIf: 'spend rises without orders' },
        reviewOf: { sourceTaskId: 'daily::SE5608', actionType: 'budget', entityType: 'campaign' },
      },
      {
        source: 'effect_review',
        kind: 'effect_review',
        title: 'LATE 7日效果复查',
        subject: { sku: 'LATE' },
        status: 'waiting_review',
        dueDate: '2026-05-26',
        reviewPlan: { metrics: ['orders'] },
      },
      {
        source: 'effect_review',
        kind: 'effect_review',
        title: 'CLOSED 已关闭',
        subject: { sku: 'CLOSED' },
        status: 'closed',
        dueDate: '2026-05-18',
      },
    ],
    actions: [],
  });

  const queue = buildDueReviewQueue(ledger, { today: '2026-05-19' });
  assert.strictEqual(queue.summary.due, 1);
  assert.strictEqual(queue.summary.upcoming, 1);
  assert.strictEqual(queue.due[0].subject.sku, 'SE5608');
  assert.ok(queue.due[0].checklist.includes('拉取广告后台最新 SKU/实体表现'));
  assert.ok(queue.due[0].checklist.includes('对比 reviewPlan 指标：orders, spend, acos'));
  assert.ok(queue.due[0].rollbackIf.includes('spend rises without orders'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'external-inbox-'));
  const inputFile = path.join(tmpDir, 'messages.txt');
  const outFile = path.join(tmpDir, 'inbox.json');
  fs.writeFileSync(inputFile, [
    '开发问 HAY0218 为什么没流量，能不能推',
    '这个词 nurse gifts for women 能不能加广告？',
  ].join('\n'), 'utf8');

  const inbox = runExternalTaskInbox({ inputFile, outFile, timeContext });
  assert.strictEqual(inbox.summary.total, 2);
  assert.ok(fs.existsSync(outFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.tasks[0].lane, 'external_inbox');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-queue-'));
  const ledgerFile = path.join(tmpDir, 'ledger.json');
  const outFile = path.join(tmpDir, 'review_queue.json');
  fs.writeFileSync(ledgerFile, JSON.stringify({
    businessDate: '2026-05-19',
    nextOpenTasks: [{
      source: 'effect_review',
      lane: 'effect_review',
      kind: 'effect_review',
      title: 'SE5608 1日效果复查',
      status: 'waiting_review',
      dueDate: '2026-05-19',
      subject: { sku: 'SE5608' },
      reviewPlan: { metrics: ['orders'] },
    }],
  }, null, 2), 'utf8');

  const queue = runAgentReviewQueue({ ledgerFile, outFile, today: '2026-05-19' });
  assert.strictEqual(queue.summary.due, 1);
  assert.ok(fs.existsSync(outFile));
}

console.log('agent_external_inbox tests passed');
