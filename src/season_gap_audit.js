function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasActiveSeason(task = {}) {
  return (task.facts?.seasonWindows || []).some(window => ['preheat', 'peak'].includes(window.phase));
}

function hasStructureGap(task = {}) {
  return (task.mergedSignals || []).includes('ad_structure_missing') ||
    (task.possibleSignals || []).some(signal => signal.type === 'ad_structure_missing');
}

function classifySeasonRisk(task = {}) {
  const sales = task.facts?.sales || {};
  const inventory = task.facts?.inventory || {};
  const sellableDays = num(inventory.sellableDays);
  const units30d = num(sales.units30d);
  const profitRate = num(sales.profitRate);
  const activeSeason = hasActiveSeason(task);
  if (!activeSeason) return null;

  if (sellableDays >= 180 && units30d <= 2) return 'critical_stale_season';
  if (sellableDays >= 90 && units30d <= 8 && hasStructureGap(task) && profitRate >= 0.12) return 'season_structure_stale_risk';
  if (sellableDays >= 120 && units30d <= 5) return 'season_stale_watch';
  if (sellableDays > 0 && sellableDays < 21 && units30d >= 20) return 'inventory_tight_no_scale';
  return null;
}

function classifySeasonEdgeWatch(task = {}) {
  const sales = task.facts?.sales || {};
  const inventory = task.facts?.inventory || {};
  const sellableDays = num(inventory.sellableDays);
  const units30d = num(sales.units30d);
  const activeSeason = hasActiveSeason(task);
  if (!activeSeason || classifySeasonRisk(task)) return null;

  const watchReasons = [];
  if (sellableDays >= 150 && units30d >= 3 && units30d <= 4) {
    watchReasons.push('stale_near_critical: sellableDays>=150 and units30d 3-4');
  }
  if (sellableDays >= 120 && units30d >= 6 && units30d <= 8) {
    watchReasons.push('stale_threshold_edge: sellableDays>=120 and units30d 6-8');
  }
  if (sellableDays >= 90 && units30d <= 10 && hasStructureGap(task)) {
    watchReasons.push('structure_gap_watch: sellableDays>=90, units30d<=10, structure gap');
  }
  if (sellableDays >= 21 && sellableDays <= 30 && units30d >= 20) {
    watchReasons.push('inventory_tight_edge: sellableDays 21-30 and units30d>=20');
  }
  if (!watchReasons.length) return null;

  let watchType = 'season_structure_edge_watch';
  if (watchReasons.some(reason => reason.startsWith('inventory_tight_edge'))) watchType = 'inventory_tight_edge_watch';
  else if (watchReasons.some(reason => reason.startsWith('stale_threshold_edge'))) watchType = 'season_stale_threshold_edge';
  else if (watchReasons.some(reason => reason.startsWith('stale_near_critical'))) watchType = 'critical_stale_edge_watch';

  return { watchType, watchReasons };
}

function boundaryFields() {
  return {
    identityReviewRequired: true,
    identityEvidenceRequired: ['amazon_title', 'amazon_bullets', 'amazon_specs'],
    seasonMappingBoundary: 'season_entry_not_listing_identity',
  };
}

function byKey(items = [], key) {
  const counts = items.reduce((acc, item) => {
    const value = item[key];
    if (value) acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function mapRiskItem(task, riskType) {
  const sales = task.facts?.sales || {};
  const ads = task.facts?.ads || {};
  const inventory = task.facts?.inventory || {};
  const suppressed = task.priority === 'Low Priority' &&
    (task.riskNotes || []).includes('daily_board_main_task_limit_exceeded');
  const score =
    (riskType === 'critical_stale_season' ? 100 : riskType === 'season_structure_stale_risk' ? 86 : riskType === 'season_stale_watch' ? 72 : 45) +
    Math.min(30, Math.floor(num(inventory.sellableDays) / 60)) -
    Math.min(20, num(sales.units30d) * 2) +
    (hasStructureGap(task) ? 12 : 0) +
    (suppressed ? 10 : 0);
  return {
    sku: task.sku,
    asin: task.asin,
    priority: task.priority,
    primaryTaskType: task.primaryTaskType,
    suggestedAction: riskType === 'inventory_tight_no_scale'
      ? 'hold_scale_and_check_replenishment'
      : (hasStructureGap(task) ? 'review_low_budget_season_structure_gap' : 'review_stale_inventory_sell_through_plan'),
    riskType,
    score,
    suppressedByMainTaskLimit: suppressed,
    seasonWindows: task.facts?.seasonWindows || [],
    units30d: num(sales.units30d),
    units7d: num(sales.units7d),
    profitRate: num(sales.profitRate),
    sellableDays: num(inventory.sellableDays),
    adSpend7d: num(ads.d7?.spend),
    adOrders7d: num(ads.d7?.orders),
    signals: task.mergedSignals || [],
    riskNotes: task.riskNotes || [],
    ...boundaryFields(),
  };
}

function mapEdgeWatchItem(task, edgeWatch) {
  const sales = task.facts?.sales || {};
  const ads = task.facts?.ads || {};
  const inventory = task.facts?.inventory || {};
  const score =
    (edgeWatch.watchType === 'inventory_tight_edge_watch' ? 70 : edgeWatch.watchType === 'critical_stale_edge_watch' ? 68 : 60) +
    Math.min(20, Math.floor(num(inventory.sellableDays) / 90)) +
    (hasStructureGap(task) ? 8 : 0);
  return {
    sku: task.sku,
    asin: task.asin,
    priority: task.priority,
    primaryTaskType: task.primaryTaskType,
    suggestedAction: 'review_edge_watch_listing_identity_before_action',
    watchType: edgeWatch.watchType,
    watchReasons: edgeWatch.watchReasons,
    score,
    seasonWindows: task.facts?.seasonWindows || [],
    units30d: num(sales.units30d),
    units7d: num(sales.units7d),
    profitRate: num(sales.profitRate),
    sellableDays: num(inventory.sellableDays),
    adSpend7d: num(ads.d7?.spend),
    adOrders7d: num(ads.d7?.orders),
    signals: task.mergedSignals || [],
    riskNotes: task.riskNotes || [],
    ...boundaryFields(),
  };
}

function buildSeasonGapAudit(board = {}, options = {}) {
  const limit = Number(options.limit || 80);
  const edgeWatchLimit = Number(options.edgeWatchLimit || options.limit || 80);
  const tasks = board.tasks || [];
  const items = tasks
    .map(task => {
      const riskType = classifySeasonRisk(task);
      if (!riskType) return null;
      return mapRiskItem(task, riskType);
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.sellableDays - a.sellableDays || a.units30d - b.units30d);
  const edgeWatchItems = tasks
    .map(task => {
      const edgeWatch = classifySeasonEdgeWatch(task);
      if (!edgeWatch) return null;
      return mapEdgeWatchItem(task, edgeWatch);
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.sellableDays - a.sellableDays || a.units30d - b.units30d);

  return {
    generatedAt: new Date().toISOString(),
    businessDate: board.time?.businessDate || null,
    dataDate: board.time?.dataDate || null,
    siteTimezone: board.time?.siteTimezone || null,
    sourceRunId: board.time?.sourceRunId || null,
    summary: {
      auditedTasks: tasks.length,
      activeSeasonTasks: tasks.filter(hasActiveSeason).length,
      riskItems: items.length,
      edgeWatchItems: edgeWatchItems.length,
      suppressedRiskItems: items.filter(item => item.suppressedByMainTaskLimit).length,
      byRiskType: byKey(items, 'riskType'),
      byEdgeWatchType: byKey(edgeWatchItems, 'watchType'),
    },
    items: items.slice(0, limit),
    edgeWatchItems: edgeWatchItems.slice(0, edgeWatchLimit),
  };
}

module.exports = {
  buildSeasonGapAudit,
  classifySeasonEdgeWatch,
  classifySeasonRisk,
};
