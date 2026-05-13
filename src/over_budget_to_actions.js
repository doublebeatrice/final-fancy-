const {
  bucketOverBudgetRows,
  num,
  buildSkuStateMap,
  getSkuState,
  isEnabledState,
  preferredProfitRate,
} = require('./over_budget_policy');

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function approvalBlock(actor = 'claude') {
  return {
    approvedBy: actor,
    decisionStage: 'ai_approved',
    actionSource: [actor],
    requiresAiDecision: false,
    canAutoExecute: true,
  };
}

function isEnabledStateRow(value) {
  const text = String(value ?? '').toLowerCase();
  return text === '1' || text === '2' || text === 'enabled' || text === 'enable' || text === 'active';
}

function indexCoreEntitiesByCampaign(snapshot = {}) {
  const index = new Map();
  const pushEntity = (campaignId, entity) => {
    if (!campaignId) return;
    const key = String(campaignId);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entity);
  };
  for (const row of snapshot.kwRows || []) {
    if (!isEnabledStateRow(row.state) || !isEnabledStateRow(row.campaignState) || !isEnabledStateRow(row.groupState)) continue;
    const id = String(row.keywordId || row.id || '');
    if (!id) continue;
    pushEntity(row.campaignId, {
      id,
      entityType: 'keyword',
      text: row.keywordText || row.text || '',
      bid: num(row.bid),
      matchType: row.matchType,
      orders7: num(row.orders7 ?? row.Orders),
      clicks7: num(row.clicks7 ?? row.Clicks),
      spend7: num(row.Spend),
      sales7: num(row.Sales),
    });
  }
  for (const row of snapshot.autoRows || []) {
    if (!isEnabledStateRow(row.state) || !isEnabledStateRow(row.campaignState) || !isEnabledStateRow(row.groupState)) continue;
    const id = String(row.targetId || row.id || '');
    if (!id) continue;
    pushEntity(row.campaignId, {
      id,
      entityType: 'autoTarget',
      text: row.expressionType || row.targetingType || 'auto',
      bid: num(row.bid),
      orders7: num(row.orders7 ?? row.Orders),
      clicks7: num(row.clicks7 ?? row.Clicks),
      spend7: num(row.Spend),
      sales7: num(row.Sales),
    });
  }
  for (const row of snapshot.targetRows || []) {
    if (!isEnabledStateRow(row.state) || !isEnabledStateRow(row.campaignState) || !isEnabledStateRow(row.groupState)) continue;
    const id = String(row.targetId || row.id || '');
    if (!id) continue;
    pushEntity(row.campaignId, {
      id,
      entityType: 'manualTarget',
      text: row.expressionValue || row.expressionType || 'target',
      bid: num(row.bid),
      orders7: num(row.orders7 ?? row.Orders),
      clicks7: num(row.clicks7 ?? row.Clicks),
      spend7: num(row.Spend),
      sales7: num(row.Sales),
    });
  }
  return index;
}

function pickCoreEntity(entities = []) {
  if (!entities.length) return null;
  const withOrders = entities
    .filter(e => e.orders7 >= 1 && e.bid > 0.10 && e.bid < 2.50)
    .sort((a, b) => b.orders7 - a.orders7 || b.sales7 - a.sales7);
  if (withOrders[0]) return withOrders[0];
  const withClicks = entities
    .filter(e => e.clicks7 >= 5 && e.bid > 0.10 && e.bid < 2.50)
    .sort((a, b) => b.clicks7 - a.clicks7);
  return withClicks[0] || null;
}

function coreBidBump(currentBid) {
  const cur = num(currentBid);
  if (cur <= 0) return 0;
  const step = cur <= 0.50 ? 0.03 : cur <= 1.00 ? 0.05 : 0.07;
  return Number((cur + step).toFixed(2));
}

function aggressiveLift(currentBudget) {
  const current = num(currentBudget);
  if (current <= 0) return 0;
  if (current <= 1) return roundMoney(Math.max(3, current + 4));
  if (current <= 5) return roundMoney(Math.min(current * 2, current + 6));
  if (current <= 10) return roundMoney(Math.min(current * 1.8, current + 8));
  if (current <= 30) return roundMoney(Math.min(current * 1.6, current + 16));
  if (current <= 80) return roundMoney(Math.min(current * 1.5, current + 30));
  return roundMoney(Math.min(current * 1.4, current + 50));
}

function controlledLift(currentBudget) {
  const current = num(currentBudget);
  if (current <= 0) return 0;
  if (current <= 1) return roundMoney(Math.max(3, current + 2));
  if (current <= 5) return roundMoney(Math.max(current + 1, current * 1.25));
  if (current <= 30) return roundMoney(Math.min(current * 1.25, current + 12));
  if (current <= 80) return roundMoney(Math.min(current * 1.20, current + 20));
  return roundMoney(Math.min(current * 1.15, current + 30));
}

function seasonalLift(currentBudget) {
  const current = num(currentBudget);
  if (current <= 0) return 0;
  if (current <= 5) return roundMoney(Math.min(current * 1.8, current + 5));
  if (current <= 20) return roundMoney(Math.min(current * 1.5, current + 10));
  if (current <= 80) return roundMoney(Math.min(current * 1.4, current + 25));
  return roundMoney(Math.min(current * 1.3, current + 40));
}

function pctChange(from, to) {
  if (!from) return '∞';
  return `${(((to - from) / from) * 100).toFixed(0)}%`;
}

function fmtAcos(acos, sales) {
  if (sales <= 0) return 'no_sales';
  return `${(acos * 100).toFixed(1)}%`;
}

function fmtProfit(profitRate) {
  if (!Number.isFinite(profitRate)) return 'NA';
  return `${(profitRate * 100).toFixed(1)}%`;
}

function evidenceFor(entry) {
  return [
    `over_budget_rows=${entry.rows}`,
    `campaign spend=${entry.spend.toFixed(2)} sales=${entry.sales.toFixed(2)} orders=${entry.orders} clicks=${entry.clicks}`,
    `acos=${fmtAcos(entry.acos, entry.sales)} profitRate=${fmtProfit(entry.profitRate)}`,
    `invDays=${entry.invDays} absoluteInventory=${entry.absoluteInventory} units7=${entry.units7} units30=${entry.units30}`,
    `adGroupCount=${entry.adGroupCount} adCount=${entry.adCount} positionTypes=${(entry.positionTypes || []).join('|') || 'NA'}`,
    `cappedHours=${entry.cappedHours == null ? 'unknown' : entry.cappedHours} capSince=${entry.capSince || 'unknown'}`,
  ];
}

function buildAggressiveAction(entry, actor) {
  const suggested = aggressiveLift(entry.currentBudget);
  if (!(suggested > entry.currentBudget)) return null;
  return {
    entityType: 'campaign',
    actionType: 'budget',
    id: String(entry.campaignId),
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    currentBudget: entry.currentBudget,
    suggestedBudget: suggested,
    allowLargeBudgetChange: true,
    riskLevel: 'over_budget_aggressive_budget_expansion',
    confidence: 0.78,
    ...approvalBlock(actor),
    reason: `Over-budget campaign converting strongly with profit room and inventory backing. Lift budget ${entry.currentBudget} -> ${suggested} (${pctChange(entry.currentBudget, suggested)}). Orders ${entry.orders}, ACOS ${fmtAcos(entry.acos, entry.sales)}, profit ${fmtProfit(entry.profitRate)}, invDays ${entry.invDays}, absStock ${entry.absoluteInventory}.`,
    hypothesis: 'Removing the budget cap on a profit-positive, inventory-backed campaign should produce roughly proportional order growth without pushing ACOS above profit room.',
    expectedEffect: { impressions: 'up_strong', clicks: 'up_strong', orders: 'up_strong', spend: 'up_strong', acos: 'watch_inside_profit_room' },
    reviewPlan: {
      windows: [1, 3, 7],
      metrics: ['impressions', 'clicks', 'orders', 'acos', 'spend', 'invDays'],
      escalationPlan: 'if 3d ACOS breaks profit room or invDays tightens, roll back to controlled lift; if orders fail to scale by 3d, revert to prior budget.',
    },
    evidence: evidenceFor(entry),
  };
}

function buildControlledAction(entry, actor) {
  const suggested = controlledLift(entry.currentBudget);
  if (!(suggested > entry.currentBudget)) return null;
  return {
    entityType: 'campaign',
    actionType: 'budget',
    id: String(entry.campaignId),
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    currentBudget: entry.currentBudget,
    suggestedBudget: suggested,
    allowLargeBudgetChange: entry.currentBudget <= 1,
    riskLevel: entry.currentBudget <= 1 ? 'over_budget_min_budget_repair' : 'over_budget_controlled_budget_up',
    confidence: 0.75,
    ...approvalBlock(actor),
    reason: `Over-budget campaign converting inside profit room. Controlled lift ${entry.currentBudget} -> ${suggested} (${pctChange(entry.currentBudget, suggested)}). Orders ${entry.orders}, ACOS ${fmtAcos(entry.acos, entry.sales)}, profit ${fmtProfit(entry.profitRate)}, invDays ${entry.invDays}.`,
    hypothesis: 'A controlled budget lift on a converting capped campaign should recover profitable demand without changing structure.',
    expectedEffect: { impressions: 'up_modest', clicks: 'up_modest', orders: 'up_modest', spend: 'up_modest', acos: 'watch' },
    reviewPlan: {
      windows: [3, 7],
      metrics: ['clicks', 'orders', 'acos', 'spend'],
      escalationPlan: 'if 7d ACOS rises above profit room without order growth, revert to prior budget.',
    },
    evidence: evidenceFor(entry),
  };
}

function buildSeasonalAction(entry, actor) {
  const suggested = seasonalLift(entry.currentBudget);
  if (!(suggested > entry.currentBudget)) return null;
  return {
    entityType: 'campaign',
    actionType: 'budget',
    id: String(entry.campaignId),
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    currentBudget: entry.currentBudget,
    suggestedBudget: suggested,
    allowLargeBudgetChange: true,
    riskLevel: 'seasonal_overbudget_sell_through_budget_up',
    confidence: 0.72,
    ...approvalBlock(actor),
    reason: `Seasonal over-budget sell-through. Lift budget ${entry.currentBudget} -> ${suggested} (${pctChange(entry.currentBudget, suggested)}) to capture demand window. Orders ${entry.orders}, ACOS ${fmtAcos(entry.acos, entry.sales)}, absStock ${entry.absoluteInventory}, invDays ${entry.invDays}.`,
    hypothesis: 'Seasonal demand window plus high absolute inventory justifies aggressive sell-through; campaign-level budget should not bottleneck the window.',
    expectedEffect: { impressions: 'up_strong', clicks: 'up_strong', orders: 'up_strong', spend: 'up_strong', acos: 'watch_for_seasonal_room' },
    reviewPlan: {
      windows: [1, 3, 7],
      metrics: ['impressions', 'clicks', 'orders', 'acos', 'spend', 'units7'],
      escalationPlan: 'if 3d sell-through fails to materialize or ACOS breaks the seasonal ceiling, revert lift.',
    },
    evidence: evidenceFor(entry),
  };
}

function buildLowerLayerReview(entry, actor) {
  return {
    entityType: 'skuCandidate',
    actionType: 'review',
    id: `over_budget_lower_layer::${entry.campaignId}`,
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    campaignName: entry.campaignName,
    riskLevel: 'overbudget_lower_layer_cost_control',
    confidence: 0.68,
    ...approvalBlock(actor),
    reason: `Over-budget waste on weak lower-layer traffic. Review productAd pause / keyword bid down for campaign ${entry.campaignName} (${entry.campaignId}). Orders ${entry.orders}, spend ${entry.spend.toFixed(2)}, clicks ${entry.clicks}, ACOS ${fmtAcos(entry.acos, entry.sales)}, profit ${fmtProfit(entry.profitRate)}, invDays ${entry.invDays}. Blockers: ${(entry.blockers || []).join('|') || 'none'}.`,
    evidence: evidenceFor(entry),
    nextSteps: 'inspect lower-layer entities (keywords / auto target / manual target / productAd) in this campaign; bid-down inefficient receivers; pause productAds with zero-order spend; do not lower campaign budget by default.',
  };
}

function buildAutoPauseActions(snapshot = {}, options = {}) {
  const actor = options.actor || 'claude';
  const cooldownAdIds = options.cooldownAdIds instanceof Set
    ? options.cooldownAdIds
    : new Set((options.cooldownAdIds || []).map(String));
  const limit = Number(options.limit ?? 30);

  const rows = Array.isArray(snapshot.overBudgetRows) ? snapshot.overBudgetRows : [];
  const skuStateMap = buildSkuStateMap(snapshot);
  const seenAdIds = new Set();
  const candidates = [];
  const stats = {
    rows: rows.length,
    notSp: 0,
    notEnabled: 0,
    notAllowedSku: 0,
    onCooldownAd: 0,
    insufficientSignal: 0,
    invTooTight: 0,
    clearanceProtect: 0,
    duplicate: 0,
    kept: 0,
  };

  for (const row of rows) {
    if (row.__overBudgetSource && row.__overBudgetSource !== 'SP') { stats.notSp++; continue; }
    if (!isEnabledState(row.state) || !isEnabledState(row.campaignState) || !isEnabledState(row.groupState)) { stats.notEnabled++; continue; }
    const adId = String(row.adId || '');
    if (!adId) { stats.insufficientSignal++; continue; }
    if (cooldownAdIds.has(adId)) { stats.onCooldownAd++; continue; }
    if (seenAdIds.has(adId)) { stats.duplicate++; continue; }
    const card = getSkuState(skuStateMap, row.sku);
    if (!card) { stats.notAllowedSku++; continue; }

    const orders = num(row.Orders);
    const clicks = num(row.Clicks);
    const spend = num(row.Spend);

    if (!(orders === 0 && clicks >= 20 && spend >= 5)) { stats.insufficientSignal++; continue; }

    const invDays = num(card.invDays);
    if (invDays > 0 && invDays < 30) { stats.invTooTight++; continue; }

    const profitRate = preferredProfitRate(card);
    if (Number.isFinite(profitRate) && profitRate < -0.05) { stats.clearanceProtect++; continue; }

    seenAdIds.add(adId);
    candidates.push({
      adId,
      campaignId: String(row.campaignId || ''),
      adGroupId: String(row.adGroupId || ''),
      campaignName: row.campaignName || '',
      groupName: row.groupName || '',
      sku: row.sku,
      asin: row.asin,
      profitRate,
      invDays,
      units7: num(card.unitsSold_7d),
      units30: num(card.unitsSold_30d),
      orders,
      clicks,
      spend,
      sales: num(row.Sales),
      score: spend + clicks * 0.2 + (Number.isFinite(profitRate) && profitRate < 0 ? 5 : 0),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, limit);

  const items = selected.map(c => {
    stats.kept++;
    return {
      sku: c.sku,
      asin: c.asin,
      summary: `[over_budget:auto_pause] productAd ${c.adId} | ${c.campaignName || c.campaignId} | ${c.clicks} clicks / 0 orders / $${c.spend.toFixed(2)}`,
      actions: [{
        entityType: 'productAd',
        actionType: 'pause',
        id: c.adId,
        campaignId: c.campaignId,
        adGroupId: c.adGroupId,
        campaignName: c.campaignName,
        groupName: c.groupName,
        riskLevel: 'over_budget_no_order_pause',
        confidence: 0.82,
        ...approvalBlock(actor),
        reason: `Over-budget productAd has 0 orders, ${c.clicks} clicks, $${c.spend.toFixed(2)} spend. SKU profit ${fmtProfit(c.profitRate)}, invDays ${c.invDays}. Pausing this product ad keeps capped budget for converters in the same campaign. SKU is not in clearance (profit ≥ -5%) and inventory is not tight (invDays ≥ 30).`,
        hypothesis: 'Pausing a zero-order, click-burning productAd inside an over-budget campaign frees capped spend for converting entities in the same campaign without harming SKU sales.',
        expectedEffect: { impressions: 'down', clicks: 'down', spend: 'down', orders_same_sku: 'flat_or_up_via_other_paths' },
        reviewPlan: {
          windows: [3, 7],
          metrics: ['sku_units7', 'campaign_orders', 'campaign_acos', 'spend'],
          escalationPlan: 'if 7d SKU units drop without compensating non-ad sales, re-enable; otherwise leave paused.',
        },
        evidence: [
          `over_budget productAd=${c.adId} campaign=${c.campaignId}`,
          `7d clicks=${c.clicks} orders=${c.orders} spend=${c.spend.toFixed(2)} sales=${c.sales.toFixed(2)}`,
          `sku profitRate=${fmtProfit(c.profitRate)} invDays=${c.invDays} units7=${c.units7} units30=${c.units30}`,
          `safety_gates_passed=zero_order|enough_clicks|enough_spend|inv_not_tight|profit_above_clearance`,
        ],
      }],
    };
  });

  return {
    items,
    stats,
    candidateCount: candidates.length,
  };
}

function buildReviewAction(entry, actor) {
  return {
    entityType: 'skuCandidate',
    actionType: 'review',
    id: `over_budget_review::${entry.campaignId}`,
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    campaignName: entry.campaignName,
    riskLevel: 'overbudget_review_required',
    confidence: 0.5,
    ...approvalBlock(actor),
    reason: `Over-budget campaign missing safe basis for execution. Blockers: ${(entry.blockers || []).join('|') || 'unknown'}. Orders ${entry.orders}, spend ${entry.spend.toFixed(2)}, ACOS ${fmtAcos(entry.acos, entry.sales)}, profit ${fmtProfit(entry.profitRate)}, invDays ${entry.invDays}.`,
    evidence: evidenceFor(entry),
  };
}

function buildPlanItem(entry, action, extraActions = []) {
  if (!action) return null;
  const actions = [action, ...extraActions.filter(Boolean)];
  return {
    sku: entry.sku,
    asin: entry.asin,
    summary: `[over_budget:${entry.lane}] ${entry.campaignName || entry.campaignId} ${action.actionType === 'budget' ? `${entry.currentBudget}→${action.suggestedBudget}` : 'review lower-layer'}${actions.length > 1 ? ` + core ${actions[1].entityType} bid +${(actions[1].suggestedBid - actions[1].currentBid).toFixed(2)}` : ''}`,
    actions,
  };
}

function buildCoreBidActionForCampaign(entry, coreEntityIndex, actor) {
  if (!coreEntityIndex) return null;
  const candidates = coreEntityIndex.get(String(entry.campaignId)) || [];
  const core = pickCoreEntity(candidates);
  if (!core) return null;
  const suggested = coreBidBump(core.bid);
  if (!(suggested > core.bid)) return null;
  return {
    entityType: core.entityType,
    actionType: 'bid',
    id: core.id,
    text: core.text,
    label: core.text,
    matchType: core.matchType,
    campaignId: String(entry.campaignId),
    adGroupId: entry.adGroupId,
    currentBid: core.bid,
    suggestedBid: suggested,
    riskLevel: 'over_budget_aggressive_core_bid_up',
    confidence: 0.7,
    ...approvalBlock(actor),
    reason: `Pair with aggressive budget lift on capped converting campaign. Top ${core.entityType} 7d: ${core.orders7}ord/${core.clicks7}clk/$${core.spend7.toFixed(2)}. Lift bid ${core.bid}→${suggested} so the new budget actually buys impressions for this proven entity rather than diluting across the long tail.`,
    hypothesis: 'A small bid bump on the campaign\'s strongest converter ensures the new budget headroom is captured by proven traffic instead of the long tail.',
    expectedEffect: { impressions: 'up', clicks: 'up', orders: 'up', acos: 'watch' },
    reviewPlan: {
      windows: [3, 7],
      metrics: ['clicks', 'orders', 'acos', 'spend'],
      escalationPlan: 'if 7d ACOS rises with no order growth, revert the bid bump (keep new budget if budget action still converts).',
    },
    evidence: [
      `paired_with_campaign=${entry.campaignId}`,
      `core_entity_type=${core.entityType} id=${core.id} text=${core.text || 'NA'}`,
      `core_7d orders=${core.orders7} clicks=${core.clicks7} spend=${core.spend7.toFixed(2)} sales=${core.sales7.toFixed(2)}`,
      `lift=${core.bid}→${suggested}`,
    ],
  };
}

function dedupeCampaignIds(planItems = []) {
  const seenCampaignBudget = new Set();
  const seenAdIds = new Set();
  const out = [];
  for (const item of planItems) {
    const action = (item.actions || [])[0];
    if (!action) continue;
    const actionType = String(action.actionType || '');
    const entityType = String(action.entityType || '');
    const cid = String(action.campaignId || action.id || '');
    if (actionType === 'pause' && entityType === 'productAd') {
      const adId = String(action.id || '');
      if (seenAdIds.has(adId)) continue;
      seenAdIds.add(adId);
      out.push(item);
      continue;
    }
    if (actionType === 'budget' && entityType === 'campaign') {
      if (seenCampaignBudget.has(cid)) continue;
      seenCampaignBudget.add(cid);
      out.push(item);
      continue;
    }
    out.push(item);
  }
  return out;
}

function budgetItemScore(item) {
  const action = (item.actions || [])[0];
  if (!action) return 0;
  const spend = num(action.evidence && action.evidence.find && (() => {
    const ev = (action.evidence || []).find(e => /campaign spend=/i.test(e));
    if (!ev) return 0;
    const m = ev.match(/spend=([\d.]+)/);
    return m ? Number(m[1]) : 0;
  })());
  const sales = (() => {
    const ev = (action.evidence || []).find(e => /sales=/i.test(e));
    if (!ev) return 0;
    const m = ev.match(/sales=([\d.]+)/);
    return m ? Number(m[1]) : 0;
  })();
  const orders = (() => {
    const ev = (action.evidence || []).find(e => /orders=/i.test(e));
    if (!ev) return 0;
    const m = ev.match(/orders=(\d+)/);
    return m ? Number(m[1]) : 0;
  })();
  return spend + sales * 0.5 + orders * 5;
}

function dedupeBudgetItemsBySku(planItems = [], actor = 'claude') {
  const bySku = new Map();
  const passThrough = [];
  for (const item of planItems) {
    const action = (item.actions || [])[0];
    if (!action) { passThrough.push(item); continue; }
    const isBudgetLift = action.actionType === 'budget' && action.entityType === 'campaign'
      && Number.isFinite(action.suggestedBudget) && Number.isFinite(action.currentBudget)
      && action.suggestedBudget > action.currentBudget;
    if (!isBudgetLift) { passThrough.push(item); continue; }
    const sku = String(item.sku || '').trim().toUpperCase();
    if (!sku) { passThrough.push(item); continue; }
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(item);
  }
  const winners = [];
  const demoted = [];
  for (const [sku, items] of bySku) {
    if (items.length === 1) { winners.push(items[0]); continue; }
    const ranked = items
      .map(item => ({ item, score: budgetItemScore(item) }))
      .sort((a, b) => b.score - a.score);
    winners.push(ranked[0].item);
    for (const { item } of ranked.slice(1)) {
      const primary = (item.actions || [])[0] || {};
      const demotedAction = {
        entityType: 'skuCandidate',
        actionType: 'review',
        id: `over_budget_sku_dedupe::${primary.campaignId || primary.id}`,
        campaignId: String(primary.campaignId || ''),
        adGroupId: primary.adGroupId || '',
        campaignName: primary.campaignName || '',
        riskLevel: 'overbudget_review_required',
        confidence: 0.55,
        ...approvalBlock(actor),
        reason: `SKU ${sku} has multiple over-budget campaigns; budget lift concentrated on the strongest converter (${ranked[0].item.actions[0].campaignName || ranked[0].item.actions[0].campaignId}). Review this campaign manually before duplicating the lift.`,
        evidence: [
          `dedupe_reason=sku_has_multi_overbudget_campaigns`,
          `sku=${sku}`,
          `winner_campaign=${ranked[0].item.actions[0].campaignId} winner_score=${ranked[0].score.toFixed(2)}`,
          `this_campaign=${primary.campaignId} this_score=${budgetItemScore(item).toFixed(2)}`,
          ...(primary.evidence || []).slice(0, 3),
        ],
      };
      demoted.push({
        sku: item.sku,
        asin: item.asin,
        summary: `[over_budget:sku_dedupe] ${primary.campaignName || primary.campaignId} demoted to review (winner: ${ranked[0].item.actions[0].campaignName || ranked[0].item.actions[0].campaignId})`,
        actions: [demotedAction],
      });
    }
  }
  return { items: [...passThrough, ...winners, ...demoted], demotedCount: demoted.length };
}

function applyAccountBudgetCap(planItems = [], options = {}) {
  const cap = Number(options.maxDailyBudgetIncreaseUsd ?? 0);
  if (!cap || cap <= 0) {
    return { items: planItems, totalLiftRequested: 0, totalLiftApproved: 0, capExceededDemoted: 0, cap: 0 };
  }
  const actor = options.actor || 'claude';
  const passThrough = [];
  const lifters = [];
  for (const item of planItems) {
    const action = (item.actions || [])[0];
    const isLift = action && action.actionType === 'budget' && action.entityType === 'campaign'
      && Number.isFinite(action.suggestedBudget) && Number.isFinite(action.currentBudget)
      && action.suggestedBudget > action.currentBudget;
    if (!isLift) { passThrough.push(item); continue; }
    const delta = action.suggestedBudget - action.currentBudget;
    lifters.push({ item, delta, score: budgetItemScore(item) });
  }

  const totalLiftRequested = lifters.reduce((sum, x) => sum + x.delta, 0);
  if (totalLiftRequested <= cap) {
    return {
      items: planItems,
      totalLiftRequested: Number(totalLiftRequested.toFixed(2)),
      totalLiftApproved: Number(totalLiftRequested.toFixed(2)),
      capExceededDemoted: 0,
      cap,
    };
  }

  lifters.sort((a, b) => b.score - a.score);
  const approved = [];
  const demoted = [];
  let running = 0;
  for (const candidate of lifters) {
    if (running + candidate.delta <= cap) {
      approved.push(candidate.item);
      running += candidate.delta;
    } else {
      const primary = (candidate.item.actions || [])[0] || {};
      const demotedAction = {
        entityType: 'skuCandidate',
        actionType: 'review',
        id: `over_budget_account_cap::${primary.campaignId || primary.id}`,
        campaignId: String(primary.campaignId || ''),
        adGroupId: primary.adGroupId || '',
        campaignName: primary.campaignName || '',
        riskLevel: 'overbudget_review_required',
        confidence: 0.5,
        ...approvalBlock(actor),
        reason: `Account daily budget lift cap reached ($${cap.toFixed(2)}). This campaign would have been lifted ${primary.currentBudget}→${primary.suggestedBudget} (Δ$${candidate.delta.toFixed(2)}). Reviewing manually so the operator can override or wait until tomorrow.`,
        evidence: [
          `dedupe_reason=account_daily_budget_cap`,
          `cap_usd=${cap.toFixed(2)}`,
          `requested_total_lift=${totalLiftRequested.toFixed(2)}`,
          `this_campaign_delta=${candidate.delta.toFixed(2)}`,
          `this_campaign_score=${candidate.score.toFixed(2)}`,
          ...(primary.evidence || []).slice(0, 2),
        ],
      };
      demoted.push({
        sku: candidate.item.sku,
        asin: candidate.item.asin,
        summary: `[over_budget:account_cap] ${primary.campaignName || primary.campaignId} demoted to review (cap $${cap.toFixed(2)} reached at $${running.toFixed(2)})`,
        actions: [demotedAction],
      });
    }
  }

  return {
    items: [...passThrough, ...approved, ...demoted],
    totalLiftRequested: Number(totalLiftRequested.toFixed(2)),
    totalLiftApproved: Number(running.toFixed(2)),
    capExceededDemoted: demoted.length,
    cap,
  };
}

function buildOverBudgetPlanItems(snapshot = {}, options = {}) {
  const actor = options.actor || 'claude';
  const limit = options.limit || {};
  const aggressiveLimit = Number(limit.aggressive ?? 8);
  const controlledLimit = Number(limit.controlled ?? 12);
  const seasonalLimit = Number(limit.seasonal ?? 6);
  const lowerLayerLimit = Number(limit.lowerLayer ?? 12);
  const reviewLimit = Number(limit.review ?? 8);
  const autoPauseLimit = Number(limit.autoPause ?? 30);
  const excludeCampaignIds = new Set((options.excludeCampaignIds || []).map(String));
  const pairCoreBidUp = options.pairCoreBidUp !== false;
  const includeAutoPause = options.includeAutoPause !== false;
  const result = bucketOverBudgetRows(snapshot, {
    cooldownSkus: options.cooldownSkus,
    cooldownCampaignIds: options.cooldownCampaignIds,
    cooldown: options.cooldown,
    currentDate: options.currentDate,
    capSinceAnnotations: options.capSinceAnnotations,
  });
  const coreEntityIndex = pairCoreBidUp ? indexCoreEntitiesByCampaign(snapshot) : null;

  const autoPauseResult = includeAutoPause
    ? buildAutoPauseActions(snapshot, {
        actor,
        cooldownAdIds: options.cooldownAdIds,
        limit: autoPauseLimit,
      })
    : { items: [], stats: null, candidateCount: 0 };
  const autoPauseCampaignIds = new Set(
    autoPauseResult.items.flatMap(item => (item.actions || []).map(a => String(a.campaignId || '')))
  );

  function take(lane, max, builder, pairBid = false) {
    const entries = (result.buckets[lane] || [])
      .filter(entry => !excludeCampaignIds.has(String(entry.campaignId)))
      .slice(0, max);
    const items = entries.map(entry => {
      const primary = builder(entry, actor);
      if (!primary) return null;
      const extras = [];
      if (pairBid && coreEntityIndex) {
        const coreAction = buildCoreBidActionForCampaign(entry, coreEntityIndex, actor);
        if (coreAction) extras.push(coreAction);
      }
      return buildPlanItem(entry, primary, extras);
    }).filter(Boolean);
    return items;
  }

  const aggressive = take('aggressive_budget_expansion', aggressiveLimit, buildAggressiveAction, true);
  const controlled = take('controlled_budget_up', controlledLimit, buildControlledAction);
  const seasonal = take('seasonal_sell_through', seasonalLimit, buildSeasonalAction, true);
  const lowerLayerRaw = take('lower_layer_cost_control', lowerLayerLimit, buildLowerLayerReview);
  const lowerLayer = lowerLayerRaw.filter(item => {
    const cid = String((item.actions[0] || {}).campaignId || '');
    return !autoPauseCampaignIds.has(cid);
  });
  const review = take('review', reviewLimit, buildReviewAction);

  const dedupedSku = options.dedupeBySku === false
    ? { items: [...aggressive, ...controlled, ...seasonal], demotedCount: 0 }
    : dedupeBudgetItemsBySku([...aggressive, ...controlled, ...seasonal], actor);

  const cappedBudget = applyAccountBudgetCap(dedupedSku.items, {
    maxDailyBudgetIncreaseUsd: options.maxDailyBudgetIncreaseUsd ?? Number(process.env.OVER_BUDGET_MAX_DAILY_LIFT_USD || 0),
    actor,
  });

  const combined = dedupeCampaignIds([
    ...cappedBudget.items,
    ...autoPauseResult.items,
    ...lowerLayer,
    ...review,
  ]);

  const coreBidPaired = combined.reduce((sum, item) => sum + ((item.actions || []).length > 1 ? 1 : 0), 0);

  return {
    items: combined,
    counts: {
      aggressive: aggressive.length,
      controlled: controlled.length,
      seasonal: seasonal.length,
      autoPause: autoPauseResult.items.length,
      lowerLayer: lowerLayer.length,
      review: review.length,
      skuDedupedDemoted: dedupedSku.demotedCount,
      accountCapDemoted: cappedBudget.capExceededDemoted,
      total: combined.length,
      coreBidPaired,
    },
    bucketCounts: result.counts,
    filtered: result.filtered,
    campaignsClassified: result.campaignsClassified,
    autoPauseStats: autoPauseResult.stats,
    autoPauseCandidateCount: autoPauseResult.candidateCount,
    accountCap: {
      cap: cappedBudget.cap,
      totalLiftRequested: cappedBudget.totalLiftRequested,
      totalLiftApproved: cappedBudget.totalLiftApproved,
    },
  };
}

module.exports = {
  buildOverBudgetPlanItems,
  buildAutoPauseActions,
  budgetItemScore,
  dedupeBudgetItemsBySku,
  applyAccountBudgetCap,
  aggressiveLift,
  controlledLift,
  seasonalLift,
  indexCoreEntitiesByCampaign,
  pickCoreEntity,
  coreBidBump,
};
