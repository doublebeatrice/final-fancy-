const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildEffectReviewReport,
  evaluateReviewTask,
  evidenceKeyForTask,
} = require('../src/agent_effect_review');
const { buildAgentLedger } = require('../src/agent_control_plane');
const { runAgentEffectReview } = require('../scripts/run_agent_effect_review');
const { runAgentLearningMemory } = require('../scripts/run_agent_learning_memory');
const { runAgentReviewQueue } = require('../scripts/run_agent_review_queue');

function withWindow(evidence, baselineAsOf = '2026-05-16', currentAsOf = '2026-05-19') {
  return {
    ...evidence,
    baselineAsOf,
    currentAsOf,
  };
}

{
  const task = {
    taskId: 'review-1',
    title: 'SE5608 3日效果复查',
    subject: { sku: 'SE5608' },
    reviewPlan: {
      metrics: ['orders', 'spend', 'acos'],
      rollbackIf: 'spend rises without orders by day 7',
    },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 10, orders: 0, acos: 0 },
    current: { spend: 18, orders: 0, acos: 0 },
  }));

  assert.strictEqual(result.verdict, 'goal_missed');
  assert.strictEqual(result.status, 'needs_action');
  assert.ok(result.reasons.includes('spend_rises_without_orders'));
}

{
  const task = {
    taskId: 'review-2',
    title: 'QAA3143 1日效果复查',
    subject: { sku: 'QAA3143' },
    reviewPlan: { metrics: ['orders', 'acos'] },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 12, orders: 1, acos: 0.42 },
    current: { spend: 15, orders: 3, acos: 0.31 },
  }));

  assert.strictEqual(result.verdict, 'goal_met');
  assert.strictEqual(result.status, 'closed_recommended');
  assert.ok(result.reasons.includes('orders_improved'));
}

{
  const task = {
    taskId: 'review-guardrail',
    title: 'SE5608 3日效果复查',
    subject: { sku: 'SE5608' },
    reviewPlan: { metrics: ['orders', 'acos', 'inventory', 'profit'] },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 12, orders: 1, acos: 0.35 },
    current: { spend: 14, orders: 3, acos: 0.31 },
    inventory: { sellableDays: 12 },
    profit: { profitRate: 0.16 },
    riskSignals: ['inventory_tight', 'acos_above_profit_rate'],
  }));

  assert.strictEqual(result.verdict, 'goal_partial');
  assert.strictEqual(result.status, 'waiting_review');
  assert.ok(result.reasons.includes('orders_improved'));
  assert.ok(result.reasons.includes('business_guardrail_risk'));
  assert.ok(result.riskSignals.includes('inventory_tight'));
}

{
  const task = {
    taskId: 'review-market',
    title: 'SE5608 市场证据复查',
    subject: { sku: 'SE5608' },
    reviewPlan: { metrics: ['orders', 'market'] },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 12, orders: 1, acos: 0.35 },
    current: { spend: 14, orders: 3, acos: 0.31 },
    market: {
      terms: [{
        term: 'american flag bucket hat',
        keywordConversion: { marketQuality: 'weak', costRisk: 'high' },
        abaSearchTerm: { demandTier: 'low', competitionTier: 'high' },
      }],
    },
    riskSignals: ['market_conversion_weak', 'market_competition_high'],
  }));

  assert.strictEqual(result.verdict, 'goal_partial');
  assert.strictEqual(result.status, 'waiting_review');
  assert.ok(result.reasons.includes('market_guardrail_risk'));
  assert.ok(result.riskSignals.includes('market_conversion_weak'));
}

{
  const task = {
    taskId: 'review-early',
    title: 'SE6599 1日效果复查',
    subject: { sku: 'SE6599' },
    reviewPlan: { metrics: ['orders', 'acos'], checkAfterDay: 1 },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 12, orders: 1, acos: 0.42 },
    current: { spend: 15, orders: 3, acos: 0.31 },
  }));

  assert.strictEqual(result.verdict, 'early_window');
  assert.strictEqual(result.status, 'waiting_review');
  assert.ok(result.reasons.includes('early_review_window'));
}

{
  const task = {
    taskId: 'review-3',
    title: 'HAY0218 1日效果复查',
    subject: { sku: 'HAY0218' },
    reviewPlan: { metrics: ['orders', 'spend'] },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { spend: 10, orders: 1 },
    current: { spend: 11, orders: 1 },
  }));

  assert.strictEqual(result.verdict, 'goal_partial');
  assert.strictEqual(result.status, 'waiting_review');
}

{
  const task = { taskId: 'review-4', subject: { sku: 'MISS1' }, reviewPlan: { metrics: ['orders'] } };
  const result = evaluateReviewTask(task, {});
  assert.strictEqual(result.verdict, 'needs_data');
  assert.strictEqual(result.status, 'blocked');
}

{
  assert.strictEqual(evidenceKeyForTask({ subject: { sku: 'SKU1' } }), 'SKU1');
  assert.strictEqual(evidenceKeyForTask({ subject: { asin: 'B0ABCDEF12' } }), 'B0ABCDEF12');
}

{
  const report = buildEffectReviewReport({
    queue: {
      due: [
        { taskId: 'review-1', subject: { sku: 'SE5608' }, reviewPlan: { rollbackIf: 'spend rises without orders' } },
        { taskId: 'review-2', subject: { sku: 'QAA3143' }, reviewPlan: { metrics: ['orders'] } },
      ],
    },
    evidence: {
      SE5608: withWindow({ baseline: { spend: 10, orders: 0 }, current: { spend: 18, orders: 0 } }),
      QAA3143: withWindow({ baseline: { orders: 1 }, current: { orders: 2 } }),
    },
    today: '2026-05-19',
  });

  assert.strictEqual(report.summary.total, 2);
  assert.strictEqual(report.summary.byVerdict.goal_missed, 1);
  assert.strictEqual(report.summary.byVerdict.goal_met, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-effect-review-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const evidenceFile = path.join(tmpDir, 'evidence.json');
  const outFile = path.join(tmpDir, 'review_report.json');
  fs.writeFileSync(queueFile, JSON.stringify({
    due: [{ taskId: 'review-1', subject: { sku: 'SE5608' }, reviewPlan: { rollbackIf: 'spend rises without orders' } }],
  }), 'utf8');
  fs.writeFileSync(evidenceFile, JSON.stringify({
    SE5608: withWindow({ baseline: { spend: 10, orders: 0 }, current: { spend: 16, orders: 0 } }),
  }), 'utf8');

  const report = runAgentEffectReview({ queueFile, evidenceFile, outFile, today: '2026-05-19' });
  assert.strictEqual(report.summary.byVerdict.goal_missed, 1);
  assert.ok(fs.existsSync(outFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-effect-review-missing-queue-'));
  assert.throws(
    () => runAgentEffectReview({
      queueFile: path.join(tmpDir, 'missing_queue.json'),
      outFile: path.join(tmpDir, 'review_report.json'),
      today: '2026-05-19',
    }),
    /review queue file not found/
  );
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-effect-review-auto-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const outFile = path.join(tmpDir, 'review_report.json');
  fs.writeFileSync(queueFile, JSON.stringify({
    due: [{
      taskId: 'review-1',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 0 },
        baselineAsOf: '2026-05-16',
        rollbackIf: 'spend rises without orders',
      },
    }],
  }), 'utf8');

  const report = runAgentEffectReview({
    queueFile,
    outFile,
    collectEvidence: true,
    evidenceOutFile: path.join(tmpDir, 'evidence.json'),
    evidenceSourceDir: tmpDir,
    today: '2026-05-19',
    execFileSync: (bin, args) => {
      fs.writeFileSync(args[args.length - 1], JSON.stringify({
        ok: true,
        exportedAt: '2026-05-19',
        rows: [{ sku: 'SE5608', cost: 18, orders: 0, sales: 0 }],
      }), 'utf8');
      return 'ok';
    },
  });

  assert.strictEqual(report.summary.byVerdict.goal_missed, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-effect-review-fallback-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const outFile = path.join(tmpDir, 'review_report.json');
  fs.writeFileSync(queueFile, JSON.stringify({
    due: [{
      taskId: 'review-fallback',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 0 },
        baselineAsOf: '2026-05-16',
        rollbackIf: 'spend rises without orders',
      },
    }],
  }), 'utf8');

  const report = runAgentEffectReview({
    queueFile,
    outFile,
    collectEvidence: true,
    evidenceOutFile: path.join(tmpDir, 'evidence.json'),
    evidenceSourceDir: tmpDir,
    today: '2026-05-19',
    adSkuSummaryReport: {
      ok: true,
      exportedAt: '2026-05-19',
      rows: [{ sku: 'SE5608', cost: 18, orders: 0, sales: 0 }],
    },
    execFileSync: () => {
      throw new Error('browser unavailable');
    },
  });

  assert.strictEqual(report.summary.byVerdict.goal_missed, 1);
}

{
  const task = {
    taskId: 'review-same-window',
    subject: { sku: 'SAME1' },
    reviewPlan: { metrics: ['orders'] },
  };
  const result = evaluateReviewTask(task, withWindow({
    baseline: { orders: 1 },
    current: { orders: 3 },
  }, '2026-05-19', '2026-05-19'));

  assert.strictEqual(result.verdict, 'needs_data');
  assert.strictEqual(result.status, 'blocked');
  assert.ok(result.reasons.includes('same_window_baseline_and_current'));
}

{
  const report = buildEffectReviewReport({
    queue: {
      due: [
        { taskId: 'review-stale', subject: { sku: 'STALE1' }, reviewPlan: { metrics: ['orders'] } },
      ],
    },
    evidence: {
      STALE1: withWindow({
        baseline: { orders: 1 },
        current: { orders: 3 },
      }, '2026-05-16', '2026-05-20'),
    },
    today: '2026-05-25',
  });

  assert.strictEqual(report.summary.byVerdict.goal_partial, 1);
  assert.strictEqual(report.summary.staleDowngraded, 1);
  assert.ok(report.results[0].reasons.includes('current_metrics_stale'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-effect-review-writeback-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const ledgerFile = path.join(tmpDir, 'ledger.json');
  const lessonDir = path.join(tmpDir, 'sku_lessons');
  const outFile = path.join(tmpDir, 'review_report.json');
  const nextDayQueueFile = path.join(tmpDir, 'review_queue_next_day.json');
  const tasks = [
    {
      taskId: 'review-met',
      source: 'effect_review',
      lane: 'effect_review',
      kind: 'effect_review',
      status: 'waiting_review',
      title: 'MET effect review',
      subject: { sku: 'MET1' },
      dueDate: '2026-05-19',
      businessDate: '2026-05-18',
      dataDate: '2026-05-18',
      reviewPlan: { metrics: ['orders'] },
    },
    {
      taskId: 'review-missed',
      source: 'effect_review',
      lane: 'effect_review',
      kind: 'effect_review',
      status: 'waiting_review',
      title: 'MISS effect review',
      subject: { sku: 'MISS2' },
      dueDate: '2026-05-19',
      businessDate: '2026-05-18',
      dataDate: '2026-05-18',
      reviewPlan: { rollbackIf: 'spend rises without orders' },
    },
    {
      taskId: 'review-partial',
      source: 'effect_review',
      lane: 'effect_review',
      kind: 'effect_review',
      status: 'waiting_review',
      title: 'PART effect review',
      subject: { sku: 'PART1' },
      dueDate: '2026-05-19',
      businessDate: '2026-05-18',
      dataDate: '2026-05-18',
      reviewPlan: { metrics: ['orders'] },
    },
  ];
  fs.writeFileSync(queueFile, JSON.stringify({ due: tasks }), 'utf8');
  fs.writeFileSync(ledgerFile, JSON.stringify({
    generatedAt: '2026-05-19T00:00:00.000Z',
    businessDate: '2026-05-19',
    tasks: [],
    reviewTasks: tasks,
    nextOpenTasks: tasks,
  }), 'utf8');

  const report = runAgentEffectReview({
    queueFile,
    outFile,
    ledgerFile,
    ledgerOutFile: ledgerFile,
    skuLessonDir: lessonDir,
    writeBack: true,
    today: '2026-05-19',
    evidence: {
      MET1: withWindow({ baseline: { orders: 1 }, current: { orders: 3 } }),
      MISS2: withWindow({ baseline: { spend: 10, orders: 0 }, current: { spend: 18, orders: 0 } }),
      PART1: withWindow({ baseline: { orders: 1 }, current: { orders: 1 } }),
    },
  });

  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const nextOpenIds = new Set((ledger.nextOpenTasks || []).map(task => task.taskId));
  assert.strictEqual(report.writeBack.ledgerSummary.closed, 1);
  assert.strictEqual(report.writeBack.ledgerSummary.followupTasks, 1);
  assert.ok(!nextOpenIds.has('review-met'));
  assert.ok(nextOpenIds.has('review-partial'));
  assert.ok([...nextOpenIds].some(id => id.startsWith('effect_review::direction_change::review-missed')));

  const lessonFiles = fs.readdirSync(lessonDir).filter(name => name.endsWith('.json'));
  assert.strictEqual(lessonFiles.length, 3);
  const lesson = JSON.parse(fs.readFileSync(path.join(lessonDir, lessonFiles[0]), 'utf8'));
  assert.ok(lesson.condition);
  assert.ok(lesson.apply);

  const nextQueue = runAgentReviewQueue({
    ledgerFile,
    outFile: nextDayQueueFile,
    today: '2026-05-20',
  });
  const nextDueIds = new Set((nextQueue.due || []).map(task => task.taskId));
  assert.ok(!nextDueIds.has('review-met'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-action-lifecycle-e2e-'));
  const ledgerFile = path.join(tmpDir, 'agent_ledger_2026-05-28.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue_2026-05-31.json');
  const effectReviewFile = path.join(tmpDir, 'effect_review_2026-05-31.json');
  const lessonDir = path.join(tmpDir, 'sku_lessons');
  const learningMemoryFile = path.join(tmpDir, 'learning_memory_2026-06-01.json');
  const action = {
    sourceTaskId: 'generated-action::LC1001::kw-life',
    sku: 'LC1001',
    asin: 'B0LC100001',
    id: 'kw-life',
    entityType: 'keyword',
    actionType: 'bid',
    approvedBy: 'codex',
    actionSource: ['codex'],
    evidence: ['market term matched product identity', 'existing keyword had low delivery'],
    goal: { metric: 'orders', from: 0, to: 1, deadlineDays: 3, hardFloor: 0 },
    killSwitch: { condition: 'spend rises without orders by day 3', rollbackIf: 'spend rises without orders by day 3' },
    reviewPlan: {
      checkAfterDays: [3],
      rollbackIf: 'spend rises without orders by day 3',
      baseline: { orders: 0, spend: 2, sales: 0 },
    },
  };
  const ledger = buildAgentLedger({
    timeContext: {
      runAt: '2026-05-28T08:00:00.000Z',
      businessDate: '2026-05-28',
      dataDate: '2026-05-28',
      sourceRunId: 'agent-action-lifecycle-e2e',
    },
    actions: [action],
  });
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), 'utf8');

  assert.strictEqual(ledger.summary.actionCount, 1);
  assert.strictEqual(ledger.reviewTasks.length, 1);
  assert.deepStrictEqual(ledger.reviewTasks[0].reviewPlan.goal, action.goal);

  const queue = runAgentReviewQueue({
    ledgerFile,
    outFile: reviewQueueFile,
    today: '2026-05-31',
  });
  assert.strictEqual(queue.due.length, 1);

  const report = runAgentEffectReview({
    queueFile: reviewQueueFile,
    outFile: effectReviewFile,
    ledgerFile,
    ledgerOutFile: ledgerFile,
    skuLessonDir: lessonDir,
    writeBack: true,
    today: '2026-05-31',
    evidence: {
      LC1001: withWindow(
        { baseline: { orders: 0, spend: 2, sales: 0 }, current: { orders: 2, spend: 8, sales: 36 } },
        '2026-05-28',
        '2026-05-31'
      ),
    },
  });
  assert.strictEqual(report.summary.byVerdict.goal_met, 1);
  assert.strictEqual(report.writeBack.ledgerSummary.closed, 1);

  const updatedLedger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.strictEqual(updatedLedger.summary.effectReviewWriteBack.closed, 1);
  assert.strictEqual(updatedLedger.nextOpenTasks.some(task => task.taskId === queue.due[0].taskId), false);

  const lessonFiles = fs.readdirSync(lessonDir).filter(name => name.endsWith('.json'));
  assert.strictEqual(lessonFiles.length, 1);
  const memory = runAgentLearningMemory({
    timeContext: {
      runAt: '2026-06-01T08:00:00.000Z',
      businessDate: '2026-06-01',
      dataDate: '2026-05-31',
      sourceRunId: 'agent-action-lifecycle-e2e-next-run',
    },
    correctionDir: path.join(tmpDir, 'empty_corrections'),
    skuLessonDir: lessonDir,
    outFile: learningMemoryFile,
  });
  assert.strictEqual(memory.summary.skuLessons, 1);
  assert.strictEqual(memory.skuLessons[0].scope.sku, 'LC1001');
  assert.ok(memory.constraints.some(item => item.id.startsWith('sku_lesson:')));
}

console.log('agent_effect_review tests passed');
