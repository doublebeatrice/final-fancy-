const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'Low Priority', 'Data Missing']);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').trim();
}

function signalTypes(context = {}) {
  return (context.possibleSignals || []).map(signal => signal.type);
}

function hasSignal(context, type) {
  return signalTypes(context).includes(type);
}

function hasSeasonOpportunity(context = {}) {
  return (context.facts?.seasonWindows || []).some(window => ['preheat', 'peak'].includes(window.phase));
}

function hasActionableSeasonStructureGap(context = {}) {
  const sales = context.facts?.sales || {};
  const ads = context.facts?.ads || {};
  const inv = context.facts?.inventory || {};
  return hasSignal(context, 'ad_structure_missing') &&
    hasSeasonOpportunity(context) &&
    num(inv.sellableDays) >= 30 &&
    num(sales.profitRate) >= 0.12 &&
    (num(ads.d7?.orders) > 0 || num(sales.units30d) > 0 || num(ads.d7?.spend) >= 5);
}

function adStructureLooksMeaningful(context = {}) {
  const sales = context.facts?.sales || {};
  const ads = context.facts?.ads || {};
  const inv = context.facts?.inventory || {};
  const structure = context.facts?.productStructure || {};
  return structure.lifecycle === 'new' ||
    num(sales.units7d) > num(ads.d7?.orders) ||
    num(sales.units30d) > num(ads.d30?.orders) ||
    hasSeasonOpportunity(context) ||
    (num(inv.sellableDays) >= 30 && num(sales.profitRate) >= 0.18) ||
    num(sales.units30d) >= 3 ||
    num(sales.yoyUnitsPct, 0) > 0;
}

function sevenDayLooksMeaningful(context = {}) {
  const sales = context.facts?.sales || {};
  const ads = context.facts?.ads || {};
  const inv = context.facts?.inventory || {};
  return num(ads.d30?.spend) >= 3 ||
    num(sales.units30d) >= 2 ||
    num(inv.sellableDays) >= 120 ||
    num(sales.profitRate) < 0.12 ||
    hasSeasonOpportunity(context);
}

function factsSummary(context = {}) {
  const sales = context.facts?.sales || {};
  const ads = context.facts?.ads || {};
  const inv = context.facts?.inventory || {};
  const seasons = (context.facts?.seasonWindows || []).map(window => `${window.label}:${window.phase}`).join(', ') || 'none';
  return [
    `7d spend=${num(ads.d7?.spend).toFixed(2)}, 7d orders=${num(ads.d7?.orders)}`,
    `30d units=${num(sales.units30d)}, profit=${(num(sales.profitRate) * 100).toFixed(1)}%`,
    `sellableDays=${num(inv.sellableDays)}`,
    `seasonWindows=${seasons}`,
    `signals=${signalTypes(context).join(',') || 'none'}`,
  ];
}

function makeDecision(context, fields) {
  const priority = VALID_PRIORITIES.has(fields.priority) ? fields.priority : 'P2';
  const suggestedAction = fields.suggestedAction || 'review';
  return {
    sku: context.sku,
    asin: context.asin,
    priority,
    priorityReason: fields.priorityReason || '',
    primaryTaskType: fields.primaryTaskType || 'review_required',
    suggestedAction,
    decisionStage: fields.decisionStage || 'candidate',
    candidateSource: fields.candidateSource || 'rule_generator',
    candidateActionType: fields.candidateActionType || suggestedAction,
    candidateReason: fields.candidateReason || fields.priorityReason || fields.decisionSummary || '',
    requiresAiDecision: fields.requiresAiDecision !== false,
    approvedBy: fields.approvedBy ?? null,
    boardExecutableHint: fields.boardExecutableHint === true || fields.taskBoardSuggestedExecutable === true,
    reviewRequired: fields.reviewRequired !== false,
    riskNotes: fields.riskNotes || [],
    dataMissing: context.dataMissing || [],
    confidence: Math.max(0, Math.min(1, num(fields.confidence, 0.35))),
    decisionSummary: fields.decisionSummary || '',
    factsConsidered: factsSummary(context),
    source: fields.source || 'provisional_local_ai_policy',
  };
}

function provisionalLocalDecision(context = {}) {
  if ((context.dataMissing || []).length) {
    return makeDecision(context, {
      priority: 'Data Missing',
      primaryTaskType: 'review_required',
      suggestedAction: 'fill_missing_data',
      boardExecutableHint: false,
      reviewRequired: true,
      confidence: 0.95,
      priorityReason: `critical data missing: ${context.dataMissing.join(', ')}`,
      decisionSummary: 'Cannot make an executable operating decision until required fields are present.',
      riskNotes: ['data_missing_blocks_execution', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'reserved_page_watch')) {
    return makeDecision(context, {
      priority: 'P0',
      primaryTaskType: 'reserved_page_watch',
      suggestedAction: 'manual_review_reserved_page_do_not_create_or_scale',
      boardExecutableHint: false,
      reviewRequired: true,
      confidence: 0.9,
      priorityReason: 'reserved page has over-season or listing-fit risk',
      decisionSummary: 'Treat this as a page/watch decision, not an ad build opportunity.',
      riskNotes: ['reserved_page_hard_guardrail', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'profit_bleeding')) {
    return makeDecision(context, {
      priority: 'P0',
      primaryTaskType: 'profit_bleeding',
      suggestedAction: 'reduce_or_pause_loss_making_ads_via_existing_dry_run_execute_flow',
      boardExecutableHint: true,
      reviewRequired: false,
      confidence: 0.76,
      priorityReason: 'recent ad spend has no orders while margin is weak',
      decisionSummary: 'Stop or reduce waste before considering expansion.',
      riskNotes: ['verify_entity_level_before_execution', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'stale_inventory_risk')) {
    const sales = context.facts?.sales || {};
    const inv = context.facts?.inventory || {};
    const severe = num(inv.sellableDays) >= 180 && num(sales.units30d) <= 1;
    return makeDecision(context, {
      priority: severe ? 'P0' : 'P2',
      primaryTaskType: 'stale_inventory_risk',
      suggestedAction: 'review_clearance_price_listing_or_low_budget_sell_through_plan',
      boardExecutableHint: true,
      reviewRequired: false,
      confidence: 0.7,
      priorityReason: severe ? 'severe inventory pressure with almost no recent sales' : 'inventory pressure exists but is not an emergency without stronger evidence',
      decisionSummary: 'Inventory risk deserves daily attention before pure traffic expansion.',
      riskNotes: ['check_margin_before_discounting', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'inventory_tight')) {
    return makeDecision(context, {
      priority: 'P1',
      primaryTaskType: 'inventory_tight',
      suggestedAction: 'control_spend_or_review_price_until_inventory_recovers',
      boardExecutableHint: false,
      reviewRequired: true,
      confidence: 0.68,
      priorityReason: 'active demand with tight sellable days',
      decisionSummary: 'Avoid extra traffic until inventory and price posture are checked.',
      riskNotes: ['inventory_tight_no_scale', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'season_peak') || hasSignal(context, 'season_preheat')) {
    const structureGap = hasActionableSeasonStructureGap(context);
    return makeDecision(context, {
      priority: (hasSignal(context, 'season_peak') || structureGap) ? 'P1' : 'P2',
      primaryTaskType: hasSignal(context, 'season_peak') ? 'season_peak' : 'season_preheat',
      suggestedAction: structureGap ? 'fix_seasonal_structure_gap_in_dry_run' : 'review_season_window_inventory_and_ad_structure_before_adjusting',
      boardExecutableHint: structureGap || (context.possibleSignals || []).some(signal => ['season_peak', 'season_preheat'].includes(signal.type) && signal.executableHint),
      reviewRequired: !(structureGap || (context.possibleSignals || []).some(signal => ['season_peak', 'season_preheat'].includes(signal.type) && signal.executableHint)),
      confidence: structureGap ? 0.7 : 0.62,
      priorityReason: structureGap ? 'current season window plus ad structure gap has sales/inventory evidence' : 'current season window is relevant, but operating fit still needs evidence',
      decisionSummary: structureGap ? 'Do not let active seasonal products be suppressed behind generic daily task limits.' : 'Season timing is a signal for attention, not automatic expansion.',
      riskNotes: structureGap ? ['season_structure_gap_must_not_be_suppressed', 'verify_seed_listing_fit_before_execution', 'provisional_local_policy_not_external_ai'] : ['season_signal_requires_listing_inventory_check', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'ad_structure_missing')) {
    const meaningful = adStructureLooksMeaningful(context);
    return makeDecision(context, {
      priority: meaningful ? 'P1' : 'Low Priority',
      primaryTaskType: 'ad_structure_missing',
      suggestedAction: meaningful ? 'review_low_budget_structure_gap_in_dry_run' : 'summarize_only_no_daily_action',
      boardExecutableHint: meaningful && (context.possibleSignals || []).some(signal => signal.type === 'ad_structure_missing' && signal.executableHint),
      reviewRequired: !meaningful,
      confidence: meaningful ? 0.58 : 0.64,
      priorityReason: meaningful ? 'structure gap has demand/season/inventory evidence' : 'structure gap lacks enough demand or timing evidence today',
      decisionSummary: meaningful ? 'Potential coverage opportunity, but still validate through dry-run.' : 'Do not let missing structure become a mechanical task.',
      riskNotes: ['ad_structure_is_input_signal_not_final_rule', 'provisional_local_policy_not_external_ai'],
    });
  }

  if (hasSignal(context, 'seven_day_unadjusted')) {
    const meaningful = sevenDayLooksMeaningful(context);
    return makeDecision(context, {
      priority: meaningful ? 'P2' : 'Low Priority',
      primaryTaskType: 'seven_day_unadjusted',
      suggestedAction: meaningful ? 'review_recent_performance_before_adjusting' : 'summarize_only_no_daily_action',
      boardExecutableHint: false,
      reviewRequired: true,
      confidence: meaningful ? 0.52 : 0.68,
      priorityReason: meaningful ? '7-day review has supporting spend/sales/inventory/season signal' : '7-day stale age alone is not enough for today',
      decisionSummary: 'Seven days since adjustment is only a prompt for review, not a task by itself.',
      riskNotes: ['seven_day_unadjusted_is_input_signal_not_final_rule', 'provisional_local_policy_not_external_ai'],
    });
  }

  return makeDecision(context, {
    priority: 'Low Priority',
    primaryTaskType: 'observe',
    suggestedAction: 'observe',
    boardExecutableHint: false,
    reviewRequired: false,
    confidence: 0.5,
    priorityReason: 'no strong daily operating signal',
    decisionSummary: 'No daily action recommended from current context.',
    riskNotes: ['provisional_local_policy_not_external_ai'],
  });
}

function loadExternalDecisionMap(decisions = []) {
  const map = new Map();
  for (const decision of decisions || []) {
    const key = text(decision.sku) || text(decision.asin);
    if (key) map.set(key, decision);
  }
  return map;
}

function normalizeExternalDecision(context, external = {}) {
  return makeDecision(context, {
    priority: external.priority,
    priorityReason: external.priorityReason,
    primaryTaskType: external.primaryTaskType,
    suggestedAction: external.suggestedAction,
    decisionStage: external.decisionStage,
    candidateSource: external.candidateSource,
    candidateActionType: external.candidateActionType,
    candidateReason: external.candidateReason,
    requiresAiDecision: external.requiresAiDecision,
    approvedBy: external.approvedBy,
    boardExecutableHint: external.boardExecutableHint === true || external.taskBoardSuggestedExecutable === true,
    reviewRequired: external.reviewRequired !== false,
    riskNotes: Array.isArray(external.riskNotes) ? external.riskNotes : [],
    confidence: external.confidence,
    decisionSummary: external.decisionSummary,
    source: external.source || 'external_ai_decision',
  });
}

function decideCandidateContexts(contexts = [], options = {}) {
  const externalMap = loadExternalDecisionMap(options.externalDecisions || []);
  return contexts.map(context => {
    const external = externalMap.get(context.sku) || externalMap.get(context.asin);
    return external ? normalizeExternalDecision(context, external) : provisionalLocalDecision(context);
  });
}

module.exports = {
  decideCandidateContexts,
  provisionalLocalDecision,
};
