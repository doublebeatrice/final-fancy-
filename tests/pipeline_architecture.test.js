const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStageRegistry } = require('../src/pipeline/stage_registry');
const { createRunContext } = require('../src/pipeline/run_context');
const { runStage } = require('../src/pipeline/run_stage');
const { buildTaskCards } = require('../src/briefs/build_task_cards');
const { buildAiDecisionBrief } = require('../src/briefs/build_ai_decision_brief');
const { capabilityList, printCapabilityList, routeAction } = require('../src/capabilities/orchestrator/capability_router');
const { assertActionTerminology } = require('../src/capabilities/orchestrator/permission_gate');
const { validateActionTerminology } = require('../scripts/run_today_ops');

async function main() {
  const registry = createStageRegistry();
  for (const name of [
    'preflight',
    'snapshot',
    'daily_task_pool',
    'proactive_operating_audit',
    'season_title_dry_run',
    'low_efficiency_candidates',
    'high_efficiency_rows',
    'ad_structure_opportunities',
    'sku_ad_form_summary',
    'schema_validate',
    'dry_run',
    'execute_verify_note',
    'daily_learning',
    'report',
  ]) {
    assert.strictEqual(registry.has(name), true, `${name} must be registered`);
  }

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-stage-'));
  const manifestFile = path.join(tmp, 'manifest.json');
  const summaryFile = path.join(tmp, 'summary.json');
  const manifest = { steps: [], outputFiles: { manifestFile, summaryFile } };
  const context = createRunContext({
    manifest,
    manifestFile,
    summaryFile,
    buildSummary: value => ({ steps: value.steps }),
  });
  await runStage(context, registry.get('daily_task_pool'), async () => ({
    status: 'partial',
    inputs: ['snapshot'],
    outputs: { taskCardsJson: 'task_cards.json' },
    blocked_reason: '',
    missing_data: ['profitRate'],
    next_retry_at: '2026-05-22T10:30:00.000Z',
  }));
  const step = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).steps[0];
  assert.strictEqual(step.status, 'partial');
  assert.deepStrictEqual(step.inputs, ['snapshot']);
  assert.strictEqual(step.outputs.taskCardsJson, 'task_cards.json');
  assert.strictEqual(step.blocked_reason, '');
  assert.deepStrictEqual(step.missing_data, ['profitRate']);
  assert.strictEqual(step.next_retry_at, '2026-05-22T10:30:00.000Z');
  assert.ok(Number.isFinite(step.durationMs));
}

{
  const pool = {
    generatedAt: '2026-05-22T00:00:00.000Z',
    time: { businessDate: '2026-05-22', sourceRunId: 'brief-test' },
    summary: { total: 2 },
    candidateContexts: [
      {
        contextId: 'ctx-1',
        sku: 'P0SKU',
        asin: 'B0P0SKU001',
        site: 'Amazon.com',
        sourceRunId: 'brief-test',
        deterministicPriorityHint: 95,
        possibleSignals: [{ type: 'profit_bleeding', reason: '7d spend with zero orders', executableHint: true }],
        dataMissing: [],
        facts: {
          sales: { units7d: 0, units30d: 1, profitRate: 0.1 },
          ads: { d7: { spend: 8, orders: 0, acos: 0 }, d30: { spend: 20, orders: 1, acos: 0.8 } },
          inventory: { sellableDays: 120 },
          productStructure: { productType: 'gift', isSeasonal: false },
        },
      },
      {
        contextId: 'ctx-2',
        sku: 'MISSSKU',
        asin: 'B0MISSSKU1',
        site: 'Amazon.com',
        sourceRunId: 'brief-test',
        deterministicPriorityHint: 20,
        possibleSignals: [{ type: 'review_required', reason: 'missing required data: profitRate', reviewHint: true, hardBlockHint: true }],
        dataMissing: ['profitRate'],
        facts: {},
        guardrailInputs: { hasCriticalMissingData: true },
      },
    ],
  };
  const cards = buildTaskCards(pool);
  assert.ok(cards.layers.P0.length >= 1);
  assert.ok(cards.layers['Data Missing'].length >= 1);
  const brief = buildAiDecisionBrief(cards);
  assert.ok(brief.tasks.P0.length <= 10);
  assert.ok(brief.tasks.P1.length <= 20);
  assert.strictEqual(typeof brief.tasks.P2.count, 'number');
  const briefText = JSON.stringify(brief);
  assert.ok(!briefText.includes('productCards'));
  assert.ok(!briefText.includes('kwRows'));
}

{
  const capabilities = capabilityList();
  assert.ok(capabilities.some(item => item.capabilityId === 'adv.keyword.update_bid'));
  assert.ok(capabilities.some(item => item.capabilityId === 'inventory.price.submit_application'));
  assert.ok(printCapabilityList().includes('adv.campaign.update_budget'));
}

{
  const bidRoute = routeAction({ entityType: 'keyword', actionType: 'bid' });
  assert.strictEqual(bidRoute.actionKind, 'bid_action');
  assert.strictEqual(bidRoute.capabilityId, 'adv.keyword.update_bid');
  const priceRoute = routeAction({ entityType: 'sku', actionType: 'price' });
  assert.strictEqual(priceRoute.actionKind, 'price_action');
  assert.strictEqual(priceRoute.capabilityId, 'inventory.price.submit_application');
  assert.strictEqual(assertActionTerminology({ entityType: 'sku', actionType: 'bid' }).ok, false);

  const terminology = validateActionTerminology({
    plan: [{ sku: 'SKU1', actions: [{ entityType: 'keyword', actionType: 'bid', id: 'kw1' }] }],
    review: [{ sku: 'SKU2', action: { entityType: 'sku', actionType: 'bid', id: 'SKU2' } }],
    skipped: [],
  });
  assert.strictEqual(terminology.ok, false);
  assert.strictEqual(terminology.failures.length, 1);
}

console.log('pipeline_architecture.test.js passed');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
