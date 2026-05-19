const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildEffectReviewReport,
  evaluateReviewTask,
  evidenceKeyForTask,
} = require('../src/agent_effect_review');
const { runAgentEffectReview } = require('../scripts/run_agent_effect_review');

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
  const result = evaluateReviewTask(task, {
    baseline: { spend: 10, orders: 0, acos: 0 },
    current: { spend: 18, orders: 0, acos: 0 },
  });

  assert.strictEqual(result.verdict, 'rollback_review');
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
  const result = evaluateReviewTask(task, {
    baseline: { spend: 12, orders: 1, acos: 0.42 },
    current: { spend: 15, orders: 3, acos: 0.31 },
  });

  assert.strictEqual(result.verdict, 'close_success');
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
  const result = evaluateReviewTask(task, {
    baseline: { spend: 12, orders: 1, acos: 0.35 },
    current: { spend: 14, orders: 3, acos: 0.31 },
    inventory: { sellableDays: 12 },
    profit: { profitRate: 0.16 },
    riskSignals: ['inventory_tight', 'acos_above_profit_rate'],
  });

  assert.strictEqual(result.verdict, 'continue_watch');
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
  const result = evaluateReviewTask(task, {
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
  });

  assert.strictEqual(result.verdict, 'continue_watch');
  assert.strictEqual(result.status, 'waiting_review');
  assert.ok(result.reasons.includes('market_guardrail_risk'));
  assert.ok(result.riskSignals.includes('market_conversion_weak'));
}

{
  const task = {
    taskId: 'review-3',
    title: 'HAY0218 1日效果复查',
    subject: { sku: 'HAY0218' },
    reviewPlan: { metrics: ['orders', 'spend'] },
  };
  const result = evaluateReviewTask(task, {
    baseline: { spend: 10, orders: 1 },
    current: { spend: 11, orders: 1 },
  });

  assert.strictEqual(result.verdict, 'continue_watch');
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
      SE5608: { baseline: { spend: 10, orders: 0 }, current: { spend: 18, orders: 0 } },
      QAA3143: { baseline: { orders: 1 }, current: { orders: 2 } },
    },
    today: '2026-05-19',
  });

  assert.strictEqual(report.summary.total, 2);
  assert.strictEqual(report.summary.byVerdict.rollback_review, 1);
  assert.strictEqual(report.summary.byVerdict.close_success, 1);
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
    SE5608: { baseline: { spend: 10, orders: 0 }, current: { spend: 16, orders: 0 } },
  }), 'utf8');

  const report = runAgentEffectReview({ queueFile, evidenceFile, outFile, today: '2026-05-19' });
  assert.strictEqual(report.summary.byVerdict.rollback_review, 1);
  assert.ok(fs.existsSync(outFile));
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
        rows: [{ sku: 'SE5608', cost: 18, orders: 0, sales: 0 }],
      }), 'utf8');
      return 'ok';
    },
  });

  assert.strictEqual(report.summary.byVerdict.rollback_review, 1);
}

console.log('agent_effect_review tests passed');
