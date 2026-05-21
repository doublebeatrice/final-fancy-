const assert = require('assert');
const {
  buildSeasonGapAudit,
  classifySeasonEdgeWatch,
} = require('../src/season_gap_audit');

const baseTask = {
  asin: 'ASIN',
  priority: 'P2',
  primaryTaskType: 'season_peak',
  suggestedAction: 'review',
  facts: {
    sales: { units7d: 0, units30d: 0, profitRate: 0.2 },
    ads: { d7: { spend: 0, orders: 0 } },
    inventory: { sellableDays: 0 },
    seasonWindows: [{ key: 'wedding', label: 'Wedding Season', phase: 'peak' }],
  },
  possibleSignals: [],
  mergedSignals: [],
  riskNotes: [],
};

function task(overrides) {
  return {
    ...baseTask,
    ...overrides,
    facts: {
      ...baseTask.facts,
      ...(overrides.facts || {}),
      sales: { ...baseTask.facts.sales, ...(overrides.facts?.sales || {}) },
      ads: { ...baseTask.facts.ads, ...(overrides.facts?.ads || {}) },
      inventory: { ...baseTask.facts.inventory, ...(overrides.facts?.inventory || {}) },
      seasonWindows: overrides.facts?.seasonWindows || baseTask.facts.seasonWindows,
    },
  };
}

const hardRisk = task({
  sku: 'HARD1',
  facts: {
    sales: { units30d: 1, units7d: 0, profitRate: 0.1 },
    inventory: { sellableDays: 240 },
  },
});

const staleEdge = task({
  sku: 'EDGE_STALE',
  facts: {
    sales: { units30d: 8, units7d: 2, profitRate: 0.18 },
    inventory: { sellableDays: 260 },
  },
});

const inventoryEdge = task({
  sku: 'EDGE_INV',
  facts: {
    sales: { units30d: 45, units7d: 10, profitRate: 0.25 },
    inventory: { sellableDays: 28 },
  },
});

const offSeason = task({
  sku: 'OFF_SEASON',
  facts: {
    seasonWindows: [{ key: 'wedding', label: 'Wedding Season', phase: 'tail' }],
    sales: { units30d: 0 },
    inventory: { sellableDays: 999 },
  },
});

assert.strictEqual(classifySeasonEdgeWatch(hardRisk), null);
assert.strictEqual(classifySeasonEdgeWatch(staleEdge).watchType, 'season_stale_threshold_edge');
assert.strictEqual(classifySeasonEdgeWatch(inventoryEdge).watchType, 'inventory_tight_edge_watch');
assert.strictEqual(classifySeasonEdgeWatch(offSeason), null);

const audit = buildSeasonGapAudit({
  time: {
    businessDate: '2026-05-20',
    dataDate: '2026-05-19',
    siteTimezone: 'America/Los_Angeles',
    sourceRunId: 'season_gap_test',
  },
  tasks: [hardRisk, staleEdge, inventoryEdge, offSeason],
}, { edgeWatchLimit: 10 });

assert.strictEqual(audit.summary.riskItems, 1);
assert.strictEqual(audit.summary.edgeWatchItems, 2);
assert.deepStrictEqual(audit.summary.byEdgeWatchType, {
  inventory_tight_edge_watch: 1,
  season_stale_threshold_edge: 1,
});
assert.strictEqual(audit.items[0].identityReviewRequired, true);
assert.strictEqual(audit.items[0].seasonMappingBoundary, 'season_entry_not_listing_identity');
assert(audit.edgeWatchItems.every(item => item.identityReviewRequired === true));
assert(audit.edgeWatchItems.every(item => item.suggestedAction === 'review_edge_watch_listing_identity_before_action'));

console.log('season_gap_audit tests passed');
