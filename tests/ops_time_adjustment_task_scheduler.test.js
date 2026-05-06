const assert = require('assert');
const { buildOpsTimeContext, attachTimeToPlan } = require('../src/ops_time');
const { normalizeAdjustmentRecord, recordsFromPlan } = require('../src/adjustment_log');
const { buildDailyTaskPool } = require('../src/task_scheduler');
const { buildDailyTaskBoard } = require('../src/task_board');
const { buildSeasonGapAudit } = require('../src/season_gap_audit');

const time = buildOpsTimeContext({
  now: new Date('2026-05-04T08:30:00.000Z'),
  site: 'Amazon.com',
  sourceRunId: 'test_run',
});

assert.strictEqual(time.businessDate, '2026-05-04');
assert.strictEqual(time.dataDate, '2026-05-03');
assert.strictEqual(time.siteTimezone, 'America/Los_Angeles');

const plan = attachTimeToPlan([
  {
    sku: 'SKU1',
    asin: 'ASIN1',
    actions: [{ actionType: 'bid', entityType: 'keyword', id: 'k1', currentBid: 0.5, suggestedBid: 0.4, direction: 'down', reason: 'test' }],
  },
], time);
assert.strictEqual(plan[0].actions[0].runAt, time.runAt);
assert.strictEqual(plan[0].actions[0].businessDate, time.businessDate);
assert.strictEqual(plan[0].actions[0].sourceRunId, 'test_run');

const records = recordsFromPlan(plan, time, { dryRun: true });
assert.strictEqual(records.length, 1);
assert.strictEqual(records[0].beforeValue, 0.5);
assert.strictEqual(records[0].afterValue, 0.4);
assert.strictEqual(records[0].outcome, 'dry_run_planned');

const normalized = normalizeAdjustmentRecord({
  sku: 'SKU2',
  action: { actionType: 'pause', entityType: 'campaign', id: 'c1', reason: 'stop waste' },
}, time);
assert.strictEqual(normalized.beforeValue, 'enabled');
assert.strictEqual(normalized.afterValue, 'paused');

const snapshot = {
  productCards: [
    {
      sku: 'RES1',
      asin: 'A1',
      salesChannel: 'Amazon.com',
      saleStatus: '保留页面',
      reserved: true,
      profitRate: 0.2,
      invDays: 200,
      unitsSold_7d: 0,
      unitsSold_30d: 0,
      adStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      sbStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      productProfile: { productType: 'decor', occasion: ['mothers day'], listingTitle: 'Mothers Day Decor' },
      createContext: { coverage: { hasSpAuto: false, hasSpKeyword: false, hasSpManual: false } },
      salesHistory: { summary: { seasonStage: 'tail' }, rows: [] },
    },
  ],
};

const offseasonTime = buildOpsTimeContext({
  now: new Date('2026-06-25T08:30:00.000Z'),
  site: 'Amazon.com',
  sourceRunId: 'offseason_test_run',
});
const pool = buildDailyTaskPool({ snapshot, timeContext: offseasonTime, adjustments: [] });
assert(pool.candidateContexts.some(item => item.possibleSignals.some(signal => signal.type === 'reserved_page_watch')));
const board = buildDailyTaskBoard(pool);
assert(board.summary.boardTaskCount <= pool.tasks.length);
assert(board.tasks.every(task => task.primaryTaskType));
assert(!board.tasks.some(task => task.sku === 'RES1' && task.primaryTaskType === 'ad_structure_missing' && task.boardExecutableHint));
const unsafeAiBoard = buildDailyTaskBoard(pool, {
  externalDecisions: [{
    sku: 'RES1',
    priority: 'P1',
    primaryTaskType: 'ad_structure_missing',
    suggestedAction: 'create_or_scale_ads',
    boardExecutableHint: true,
    reviewRequired: false,
    confidence: 0.9,
    priorityReason: 'external AI unsafe test',
    decisionSummary: 'unsafe',
    source: 'external_ai_decision',
  }],
});
const unsafe = unsafeAiBoard.tasks.find(task => task.sku === 'RES1');
assert.strictEqual(unsafe.boardExecutableHint, false);
assert.strictEqual(unsafe.reviewRequired, true);
assert(unsafe.guardrailBlocks.includes('reserved_overseason_page_cannot_create_or_scale_ads'));

const cooled = buildDailyTaskPool({
  snapshot: {
    productCards: [{
      sku: 'SKU1',
      asin: 'A2',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      profitRate: 0.1,
      invDays: 100,
      unitsSold_7d: 0,
      unitsSold_30d: 0,
      adStats: { '7d': { spend: 10, orders: 0 }, '30d': { spend: 15, orders: 0 } },
      sbStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      productProfile: { productType: 'decor', occasion: [] },
      createContext: { coverage: { hasSpAuto: true, hasSpKeyword: true, hasSpManual: true } },
    }],
  },
  timeContext: time,
  adjustments: [{ sku: 'SKU1', runAt: '2026-05-02T08:30:00.000Z', actionType: 'bid', direction: 'down' }],
});
const cooledBoard = buildDailyTaskBoard(cooled);
const bleeding = cooledBoard.tasks.find(task => task.primaryTaskType === 'profit_bleeding');
assert(bleeding);
assert.strictEqual(bleeding.boardExecutableHint, false);
assert.strictEqual(bleeding.reviewRequired, true);
assert(bleeding.guardrailBlocks.some(block => block.includes('cooldown_active')));

const godmotherTime = buildOpsTimeContext({
  now: new Date('2026-05-06T08:30:00.000Z'),
  site: 'Amazon.com',
  sourceRunId: 'godmother_test_run',
});
const godmotherPool = buildDailyTaskPool({
  snapshot: {
    productCards: [{
      sku: 'AE1079',
      asin: 'B0BD3NQ9QN',
      salesChannel: 'Amazon.com',
      saleStatus: 'normal',
      profitRate: 0.1942,
      invDays: 280,
      unitsSold_7d: 4,
      unitsSold_30d: 6,
      adStats: { '7d': { spend: 23.3, orders: 6 }, '30d': { spend: 59.72, orders: 14 } },
      sbStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      listing: null,
      productProfile: {
        productType: 'unknown',
        productTypes: [],
        targetAudience: ['nurse'],
        occasion: ['fiesta'],
        seasonality: ['Q2'],
        visualTheme: ['nurse', 'fiesta'],
        positioning: 'nurse fiesta',
        listingTitle: '',
        categoryPath: '',
        hasImages: false,
      },
      createContext: {
        keywordSeeds: [
          "mother's day gifts for godmother",
          'godmother gift box',
          'godmother gifts',
          'godmother coffee cup',
        ],
        coverage: { hasSpAuto: false, hasSpKeyword: false, hasSpManual: true },
      },
    }],
  },
  timeContext: godmotherTime,
  adjustments: [],
});
const godmotherBoard = buildDailyTaskBoard(godmotherPool);
const godmotherTask = godmotherBoard.tasks.find(task => task.sku === 'AE1079');
assert(godmotherTask.facts.seasonWindows.some(window => window.key === 'mothers_day' && window.phase === 'peak'));
assert.strictEqual(godmotherTask.priority, 'P1');
assert.strictEqual(godmotherTask.boardExecutableHint, true);
assert.strictEqual(godmotherTask.executable, undefined);
assert.strictEqual(godmotherTask.suggestedAction, 'fix_seasonal_structure_gap_in_dry_run');
const godmotherAudit = buildSeasonGapAudit(godmotherBoard);
assert(godmotherAudit.items.some(item => item.sku === 'AE1079' && item.riskType === 'season_structure_stale_risk'));

const noisyContexts = Array.from({ length: 120 }, (_, index) => ({
  contextId: `t${index}`,
  sku: `SKU${index}`,
  asin: `ASIN${index}`,
  site: 'Amazon.com',
  groupKey: `SKU${index}::ASIN${index}`,
  runAt: time.runAt,
  businessDate: time.businessDate,
  dataDate: time.dataDate,
  siteTimezone: time.siteTimezone,
  sourceRunId: time.sourceRunId,
  facts: {
    sales: { units7d: 0, units30d: 0, profitRate: index % 3 === 0 ? 0.2 : 0.1 },
    ads: { d7: { spend: 0, orders: 0 }, d30: { spend: 0, orders: 0 } },
    inventory: { sellableDays: 40 },
    productStructure: { lifecycle: 'opened', isReservedPage: false },
    seasonWindows: [],
  },
  possibleSignals: [{ type: index % 3 === 0 ? 'seven_day_unadjusted' : 'ad_structure_missing', reason: 'synthetic', priorityHint: 25 }],
  deterministicPriorityHint: 25,
  dataMissing: [],
  cooldowns: [],
  guardrailInputs: { reservedPage: false, listingOverseason: false, matchedOffseason: false, hasCriticalMissingData: false },
}));
const noisyBoard = buildDailyTaskBoard({ generatedAt: time.runAt, time, summary: { total: noisyContexts.length }, candidateContexts: noisyContexts });
assert(noisyBoard.summary.mainTaskCount <= 80);
assert((noisyBoard.summary.suppressedRuleCounts.seven_day_unadjusted || 0) > 0);
assert((noisyBoard.summary.suppressedRuleCounts.ad_structure_missing || 0) > 0);

console.log('ops_time_adjustment_task_scheduler tests passed');
