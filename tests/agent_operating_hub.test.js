const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildExecutionPlan,
  buildOperatingHub,
  classifyWorkItem,
  mergeAgentWorkSources,
} = require('../src/agent_operating_hub');
const { runAgentOperatingHub } = require('../scripts/run_agent_operating_hub');

const timeContext = {
  runAt: '2026-05-19T10:30:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'operating-hub-test',
};

{
  const item = classifyWorkItem({
    lane: 'external_inbox',
    status: 'new',
    priority: 'P1',
    title: '开发问 SE5608 能不能继续推',
    subject: { sku: 'SE5608' },
    evidenceRequirements: ['selection_market_evidence', 'inventory_health'],
  }, { today: '2026-05-19' });

  assert.strictEqual(item.autonomyMode, 'gather_evidence');
  assert.ok(item.requiredCapabilities.includes('selection::market_evidence::keyword-conversion::read'));
  assert.ok(item.requiredCapabilities.includes('selection::market_evidence::aba-search-terms::read'));
  assert.ok(item.nextStep.includes('选品'));
  assert.ok(item.executionPlan.commands.some(command => command.command.includes('ops:selection:keyword-conversion')));
  assert.ok(item.executionPlan.commands.some(command => command.command.includes('ops:selection:aba-search-terms')));
}

{
  const plan = buildExecutionPlan({
    lane: 'effect_review',
    kind: 'effect_review',
    status: 'waiting_review',
    dueDate: '2026-05-19',
    subject: { sku: 'SE5608' },
    reviewPlan: {
      metrics: ['orders', 'inventory', 'profit', 'market'],
      marketTerms: ['american flag bucket hat'],
    },
  }, {
    today: '2026-05-19',
    reviewFile: 'data\\agent\\review_queue_2026-05-19.json',
  });

  assert.strictEqual(plan.mode, 'run_review');
  assert.strictEqual(plan.commands.length, 1);
  assert.ok(plan.commands[0].command.includes('npm run ops:agent:review-effect'));
  assert.ok(plan.commands[0].command.includes('--queue data\\agent\\review_queue_2026-05-19.json'));
  assert.ok(plan.commands[0].command.includes('--collect-evidence'));
  assert.ok(plan.commands[0].command.includes('--inventory-report'));
  assert.ok(plan.commands[0].command.includes('--profit-report'));
  assert.ok(plan.commands[0].command.includes('--keyword-conversion-report'));
  assert.ok(plan.commands[0].command.includes('--aba-report'));
}

{
  const item = classifyWorkItem({
    lane: 'effect_review',
    status: 'waiting_review',
    dueDate: '2026-05-19',
    priority: 'P2',
    title: 'SE5608 1日效果复查',
    subject: { sku: 'SE5608' },
  }, { today: '2026-05-19' });

  assert.strictEqual(item.workType, 'due_effect_review');
  assert.strictEqual(item.autonomyMode, 'run_review');
  assert.strictEqual(item.priority, 'P0');
  assert.ok(item.nextStep.includes('拉取最新广告'));
}

{
  const merged = mergeAgentWorkSources({
    ledger: {
      nextOpenTasks: [
        { taskId: 'daily-1', lane: 'daily_ops', status: 'new', priority: 'P0', title: '低效清理', subject: { sku: 'LOW1' } },
        { taskId: 'closed-1', lane: 'daily_ops', status: 'closed', priority: 'P0', title: '关闭任务' },
      ],
    },
    externalInbox: {
      tasks: [
        { taskId: 'ext-1', lane: 'external_inbox', status: 'new', priority: 'P1', title: '开发问 HAY0218', subject: { sku: 'HAY0218' } },
      ],
    },
    reviewQueue: {
      due: [
        { taskId: 'review-1', lane: 'effect_review', status: 'waiting_review', dueDate: '2026-05-19', title: 'SE5608 复查', subject: { sku: 'SE5608' } },
      ],
      upcoming: [
        { taskId: 'review-2', lane: 'effect_review', status: 'waiting_review', dueDate: '2026-05-22', title: 'QAA3143 复查', subject: { sku: 'QAA3143' } },
      ],
    },
    capabilityRegistry: {
      tasks: [
        { taskId: 'cap-1', lane: 'capability_registry', status: 'new', priority: 'P0', title: '写入回查补齐', subject: { entityId: 'capability-1' } },
      ],
    },
  }, { today: '2026-05-19' });

  assert.strictEqual(merged.length, 5);
  assert.deepStrictEqual(merged.map(item => item.workType).slice(0, 4), [
    'due_effect_review',
    'daily_ops',
    'capability_setup',
    'external_request',
  ]);
  assert(!merged.some(item => item.title === '关闭任务'));
}

{
  const hub = buildOperatingHub({
    timeContext,
    sourceFiles: {
      reviewFile: 'data\\agent\\review_queue_2026-05-19.json',
    },
    ledger: {
      nextOpenTasks: [
        { taskId: 'daily-1', lane: 'daily_ops', status: 'new', priority: 'P0', title: '低效清理', subject: { sku: 'LOW1' } },
      ],
    },
    externalInbox: {
      tasks: [
        { taskId: 'ext-1', lane: 'external_inbox', status: 'new', priority: 'P1', title: '开发问 HAY0218', subject: { sku: 'HAY0218' } },
      ],
    },
    reviewQueue: {
      due: [
        { taskId: 'review-1', lane: 'effect_review', status: 'waiting_review', dueDate: '2026-05-19', title: 'SE5608 复查', subject: { sku: 'SE5608' } },
      ],
      upcoming: [],
    },
    capabilityRegistry: {
      tasks: [
        { taskId: 'cap-1', lane: 'capability_registry', status: 'new', priority: 'P0', title: '写入回查补齐', subject: { entityId: 'capability-1' } },
      ],
    },
  });

  assert.strictEqual(hub.summary.total, 4);
  assert.strictEqual(hub.summary.byWorkType.due_effect_review, 1);
  assert.strictEqual(hub.summary.byAutonomyMode.run_review, 1);
  assert.strictEqual(hub.summary.requiresEscalation, 0);
  assert.strictEqual(hub.todayQueue[0].workType, 'due_effect_review');
  assert.ok(hub.todayQueue[0].executionPlan.commands[0].command.includes('review_queue_2026-05-19.json'));
  assert.strictEqual(hub.todayQueue[1].workType, 'daily_ops');
  assert.strictEqual(hub.todayQueue[2].workType, 'capability_setup');
  assert.strictEqual(hub.todayQueue[3].workType, 'external_request');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-'));
  const ledgerFile = path.join(tmpDir, 'ledger.json');
  const inboxFile = path.join(tmpDir, 'inbox.json');
  const reviewFile = path.join(tmpDir, 'reviews.json');
  const capabilityFile = path.join(tmpDir, 'capabilities.json');
  const outFile = path.join(tmpDir, 'hub.json');
  fs.writeFileSync(ledgerFile, JSON.stringify({ nextOpenTasks: [{ taskId: 'daily-1', lane: 'daily_ops', status: 'new', priority: 'P0', title: '低效清理' }] }), 'utf8');
  fs.writeFileSync(inboxFile, JSON.stringify({ tasks: [{ taskId: 'ext-1', lane: 'external_inbox', status: 'new', priority: 'P1', title: '开发诉求' }] }), 'utf8');
  fs.writeFileSync(reviewFile, JSON.stringify({ due: [{ taskId: 'review-1', lane: 'effect_review', status: 'waiting_review', dueDate: '2026-05-19', title: '复查' }], upcoming: [] }), 'utf8');
  fs.writeFileSync(capabilityFile, JSON.stringify({ tasks: [] }), 'utf8');

  const hub = runAgentOperatingHub({
    ledgerFile,
    inboxFile,
    reviewFile,
    capabilityFile,
    outFile,
    today: '2026-05-19',
    timeContext,
  });

  assert.strictEqual(hub.summary.total, 3);
  assert.ok(fs.existsSync(outFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.todayQueue[0].workType, 'due_effect_review');
}

console.log('agent_operating_hub tests passed');
