const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assessAuthorization,
  buildAgentLedger,
  buildReviewTasks,
  normalizeAgentTask,
  transitionAgentTask,
} = require('../src/agent_control_plane');
const { runAgentControlPlane } = require('../scripts/run_agent_control_plane');

const timeContext = {
  runAt: '2026-05-19T08:30:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'agent-test-run',
};

{
  const task = normalizeAgentTask({
    source: 'external_request',
    kind: 'developer_product_inquiry',
    title: '开发问 HAY0218 为什么没流量',
    description: '请判断能不能推，并给开发可直接发送的回复。',
    subject: { sku: 'HAY0218', asin: 'B0HAY0218' },
    requestedBy: 'operator',
    priority: 'P1',
  }, timeContext);

  assert.strictEqual(task.status, 'new');
  assert.strictEqual(task.lane, 'external_inbox');
  assert.strictEqual(task.kind, 'developer_product_inquiry');
  assert.strictEqual(task.subject.sku, 'HAY0218');
  assert.strictEqual(task.businessDate, '2026-05-19');
  assert.ok(task.taskId.startsWith('external_request::developer_product_inquiry::HAY0218::'));

  const started = transitionAgentTask(task, {
    type: 'start',
    actor: 'codex',
    at: '2026-05-19T08:40:00.000Z',
    note: '开始拉取广告、库存、选品证据。',
  });
  assert.strictEqual(started.status, 'in_progress');
  assert.strictEqual(started.history.length, 1);
  assert.strictEqual(started.history[0].fromStatus, 'new');
  assert.strictEqual(started.history[0].toStatus, 'in_progress');

  const waiting = transitionAgentTask(started, {
    type: 'schedule_review',
    actor: 'codex',
    at: '2026-05-19T09:10:00.000Z',
    dueDate: '2026-05-22',
    note: '预算恢复后三天复查订单和 ACOS。',
  });
  assert.strictEqual(waiting.status, 'waiting_review');
  assert.strictEqual(waiting.dueDate, '2026-05-22');

  assert.throws(() => transitionAgentTask(waiting, {
    type: 'close',
    actor: 'codex',
  }), /close event requires conclusion/);

  const closed = transitionAgentTask(waiting, {
    type: 'close',
    actor: 'codex',
    at: '2026-05-22T09:00:00.000Z',
    conclusion: '三天复查订单恢复，ACOS 未恶化，任务关闭。',
  });
  assert.strictEqual(closed.status, 'closed');
  assert.strictEqual(closed.conclusion, '三天复查订单恢复，ACOS 未恶化，任务关闭。');
}

{
  const lowRiskAdAction = {
    actionType: 'pause',
    entityType: 'productAd',
    approvedBy: 'codex',
    actionSource: ['codex'],
    evidence: ['7d spend > 5 and 0 orders', '30d no conversion'],
    reviewPlan: { checkAfterDays: [1, 3], rollbackIf: 'orders recover on paused traffic path' },
  };
  const auth = assessAuthorization(lowRiskAdAction);
  assert.strictEqual(auth.mode, 'auto_execute');
  assert.strictEqual(auth.riskLevel, 'low');
  assert.strictEqual(auth.dryRunRequired, true);
  assert.strictEqual(auth.verificationRequired, true);
  assert.deepStrictEqual(auth.blocks, []);

  const missingApproval = assessAuthorization({
    ...lowRiskAdAction,
    approvedBy: undefined,
    actionSource: ['generator_candidate'],
  });
  assert.strictEqual(missingApproval.mode, 'blocked');
  assert.ok(missingApproval.blocks.includes('missing_ai_or_manual_approval'));
  assert.ok(missingApproval.blocks.includes('generator_candidate_cannot_execute'));

  const highImpact = assessAuthorization({
    actionType: 'copy_edit',
    entityType: 'listing',
    approvedBy: 'codex',
    actionSource: ['codex'],
    impact: { top50Sku: true },
    evidence: ['season title dry-run'],
  });
  assert.strictEqual(highImpact.mode, 'escalate');
  assert.strictEqual(highImpact.riskLevel, 'high');
  assert.ok(highImpact.blocks.includes('top50_or_high_impact_listing_requires_boundary_release'));

  const readOnly = assessAuthorization({
    actionType: 'fetch',
    entityType: 'selection_keyword_conversion',
    evidence: [],
  });
  assert.strictEqual(readOnly.mode, 'auto_read');
  assert.strictEqual(readOnly.riskLevel, 'none');
}

{
  const reviews = buildReviewTasks({
    sourceTaskId: 'daily::overbudget::SE5608',
    action: {
      sku: 'SE5608',
      asin: 'B0SE5608',
      actionType: 'budget',
      entityType: 'campaign',
      id: 'campaign-1',
      approvedBy: 'codex',
      reviewPlan: {
        checkAfterDays: [1, 3, 7],
        metrics: ['orders', 'spend', 'acos'],
        rollbackIf: 'spend rises without orders by day 7',
      },
    },
    timeContext,
  });

  assert.deepStrictEqual(reviews.map(item => item.dueDate), ['2026-05-20', '2026-05-22', '2026-05-26']);
  assert.strictEqual(reviews[0].status, 'waiting_review');
  assert.strictEqual(reviews[0].lane, 'effect_review');
  assert.strictEqual(reviews[0].subject.sku, 'SE5608');
  assert.strictEqual(reviews[0].reviewOf.sourceTaskId, 'daily::overbudget::SE5608');
  assert.deepStrictEqual(reviews[0].reviewPlan.metrics, ['orders', 'spend', 'acos']);
}

{
  const reviews = buildReviewTasks({
    sourceTaskId: 'daily::bid::SE5608',
    action: {
      sku: 'SE5608',
      actionType: 'bid',
      entityType: 'keyword',
      currentMetrics: {
        spend: '10.5',
        orders: '1',
        sales: '25',
        acos: '0.42',
        clicks: '9',
        impressions: '1200',
        ignored: 'not-a-review-metric',
      },
      reviewPlan: {
        checkAfterDays: [3],
        metrics: ['orders', 'spend', 'acos'],
      },
    },
    timeContext,
  });

  assert.deepStrictEqual(reviews[0].reviewPlan.baseline, {
    spend: 10.5,
    orders: 1,
    sales: 25,
    acos: 0.42,
    clicks: 9,
    impressions: 1200,
  });
}

{
  const ledger = buildAgentLedger({
    timeContext,
    tasks: [
      { source: 'daily_ops', kind: 'low_efficiency_cleanup', title: '低效清理', subject: { sku: 'LOW1' }, priority: 'P0' },
      { source: 'external_request', kind: 'keyword_question', title: '这个词能不能加', subject: { keyword: 'nurse gifts' }, priority: 'P1' },
    ],
    actions: [
      {
        sku: 'LOW1',
        actionType: 'bid',
        entityType: 'keyword',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d high ACOS'],
        reviewPlan: { checkAfterDays: [3] },
      },
      {
        sku: 'HIGH1',
        actionType: 'create',
        entityType: 'campaign',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['developer request only'],
      },
    ],
  });

  assert.strictEqual(ledger.summary.taskCount, 2);
  assert.strictEqual(ledger.summary.actionCount, 2);
  assert.strictEqual(ledger.summary.byLane.daily_ops, 1);
  assert.strictEqual(ledger.summary.byLane.external_inbox, 1);
  assert.strictEqual(ledger.summary.authorization.auto_execute, 1);
  assert.strictEqual(ledger.summary.authorization.escalate, 1);
  assert.strictEqual(ledger.reviewTasks.length, 1);
  assert.strictEqual(ledger.reviewTasks[0].subject.sku, 'LOW1');
  assert.strictEqual(ledger.nextOpenTasks.length, 3);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-plane-'));
  const tasksFile = path.join(tmpDir, 'tasks.json');
  const actionsFile = path.join(tmpDir, 'actions.json');
  const outFile = path.join(tmpDir, 'ledger.json');
  fs.writeFileSync(tasksFile, JSON.stringify([
    { source: 'external_request', kind: 'listing_question', title: '这个标题能不能改', subject: { sku: 'TITLE1' } },
  ], null, 2), 'utf8');
  fs.writeFileSync(actionsFile, JSON.stringify([
    { sku: 'TITLE1', actionType: 'fetch', entityType: 'sellerinventory_listing', evidence: ['operator asked'] },
  ], null, 2), 'utf8');

  const result = runAgentControlPlane({
    tasksFile,
    actionsFile,
    outFile,
    timeContext,
  });

  assert.strictEqual(result.summary.taskCount, 1);
  assert.strictEqual(result.summary.authorization.auto_read, 1);
  assert.ok(fs.existsSync(outFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.summary.nextOpenTaskCount, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-plane-schema-'));
  const actionsFile = path.join(tmpDir, 'action_schema.json');
  const outFile = path.join(tmpDir, 'ledger.json');
  fs.writeFileSync(actionsFile, JSON.stringify([
    {
      sku: 'SCHEMA1',
      asin: 'B0SCHEMA1',
      actions: [{
        actionType: 'pause',
        entityType: 'productAd',
        id: 'pa-1',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d waste'],
      }],
    },
  ], null, 2), 'utf8');

  const result = runAgentControlPlane({
    actionsFile,
    outFile,
    timeContext,
  });

  assert.strictEqual(result.summary.actionCount, 1);
  assert.strictEqual(result.summary.authorization.auto_execute, 1);
  assert.strictEqual(result.actions[0].sku, 'SCHEMA1');
  assert.strictEqual(result.actions[0].asin, 'B0SCHEMA1');
}

console.log('agent_control_plane tests passed');
