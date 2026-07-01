const fs = require('fs');
const path = require('path');
const { buildAgentLedger } = require('./agent_control_plane');

const ROOT = path.join(__dirname, '..');
const OLD_PRODUCT_LIFECYCLES = new Set(['old_product', 'old_product_unknown_age']);
const REVERSIBLE_AD_ACTIONS = new Set(['bid', 'bid_down', 'pause', 'enable', 'budget', 'placement']);
const REVERSIBLE_AD_ENTITIES = new Set(['keyword', 'target', 'productad', 'campaign', 'adgroup', 'sbkeyword', 'sbtarget', 'autotarget', 'manualtarget']);
const MARKET_EVIDENCE_COMMANDS = {
  selection_keyword_research: {
    label: 'Amazon front-search competitor check',
    script: 'ops:selection:keyword-research',
    arg: '--terms',
  },
  selection_product_time_machine: {
    label: 'Product Time Machine competitor traffic map',
    script: 'ops:selection:product-time-machine',
    arg: '--search-keywords',
  },
  selection_aba_search_terms: {
    label: 'ABA search-term market demand',
    script: 'ops:selection:aba-search-terms',
    arg: '--search-terms',
  },
  selection_keyword_conversion_rate: {
    label: 'keyword conversion economics',
    script: 'ops:selection:keyword-conversion',
    arg: '--keywords',
  },
  selection_keyword_seasonality: {
    label: 'keyword seasonality and trend',
    script: 'ops:selection:keyword-seasonality',
    arg: '--search-terms',
  },
};
const GENERIC_MARKET_TERMS = new Set([
  'fiesta',
  'gift',
  'gifts',
  'nurse',
  'women',
  'men',
  'woman',
  'man',
  'party',
  'bulk',
]);
const PRODUCT_INTENT_WORDS = [
  'bag',
  'bags',
  'bear',
  'bears',
  'mat',
  'mats',
  'sign',
  'signs',
  'decorations',
  'decor',
  'keychain',
  'keychains',
  'chains',
  'containers',
  'pans',
  'whistle',
  'favors',
  'supplies',
  'counter',
  'furniture',
  'shower',
  'coach',
  'retirement',
  'fathers',
  'christian',
];

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function unique(items = []) {
  return [...new Set(items.map(text).filter(Boolean))];
}

function termKey(value) {
  return lower(value)
    .replace(/[\[\]"']/g, '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function usefulTerm(value) {
  const normalized = termKey(value);
  if (!normalized || normalized.length < 3) return '';
  if (!/[a-z]/.test(normalized)) return '';
  if (/^\d+$/.test(normalized)) return '';
  if (/\bunknown\b/.test(normalized)) return '';
  if (normalized.split(/\s+/).length > 6) return '';
  return normalized;
}

function marketSeedScore(term = '', index = 0) {
  const normalized = usefulTerm(term);
  if (!normalized) return -999;
  const words = normalized.split(/\s+/).filter(Boolean);
  let score = words.length * 2;
  if (words.length === 1) score -= 20;
  if (GENERIC_MARKET_TERMS.has(normalized)) score -= 40;
  if (/^(fiesta|nurse|women|men)\s+gifts?$/.test(normalized)) score -= 18;
  if (words.some(word => PRODUCT_INTENT_WORDS.includes(word))) score += 10;
  if (/\b(for|with|off|from)\b/.test(normalized)) score += 3;
  if (/\b(gifts?|favors?|decorations?|supplies)\b/.test(normalized) && words.length >= 3) score += 4;
  if (/^(nurse|women|men)\s+fiesta$/.test(normalized)) score -= 18;
  return score - (index * 0.01);
}

function collectMarketSeedTerms(row = {}, limit = 5) {
  const candidates = [];
  const add = value => {
    const normalized = usefulTerm(value);
    if (!normalized || candidates.some(item => item.term === normalized)) return;
    candidates.push({
      term: normalized,
      index: candidates.length,
    });
  };
  for (const term of row.marketAnalysis?.terms || []) add(term);
  for (const evidence of row.marketAnalysis?.evidence || []) add(evidence.term);
  for (const evidence of row.marketAnalysis?.operatingIntelligence?.evidenceRows || []) add(evidence.term);
  for (const model of row.marketAnalysis?.operatingIntelligence?.opportunityModels || []) add(model.term);
  add(row.productType);
  if (row.nodePlan?.label && row.productType) add(`${row.nodePlan.label} ${row.productType}`);
  const scored = candidates
    .map(item => ({
      ...item,
      score: marketSeedScore(item.term, item.index),
    }))
    .filter(item => item.score > -20)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const strongEnough = scored.filter(item => item.score >= 0);
  return (strongEnough.length >= 3 ? strongEnough : scored)
    .slice(0, limit)
    .map(item => item.term);
}

function psQuote(value) {
  return `"${String(value ?? '').replace(/"/g, '\\"')}"`;
}

function signalSet(row = {}) {
  return new Set([
    ...(row.marketAnalysis?.riskSignals || []),
    ...(row.marketAnalysis?.operatingIntelligence?.riskSignals || []),
  ].map(lower).filter(Boolean));
}

function opportunityKeys(row = {}) {
  return (row.marketAnalysis?.operatingIntelligence?.opportunityModels || [])
    .map(model => lower(model.key))
    .filter(Boolean);
}

function marketSignalItems(row = {}) {
  return [
    ...(row.marketAnalysis?.riskSignals || []),
    ...(row.marketAnalysis?.operatingIntelligence?.riskSignals || []),
  ].map(signal => ({
    key: lower(signal),
    source: 'risk_signal',
  })).filter(item => item.key);
}

function opportunityItems(row = {}) {
  return (row.marketAnalysis?.operatingIntelligence?.opportunityModels || [])
    .map(model => ({
      key: lower(model.key),
      term: text(model.term || model.keyword || model.searchTerm),
      source: 'opportunity_model',
    }))
    .filter(item => item.key);
}

function uniqueChangeItems(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = [item.key || '', item.term || '', item.source || ''].join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildMarketChangeEvidence(row = {}) {
  const recommendedOperatingUse = text(row.marketAnalysis?.operatingIntelligence?.recommendedOperatingUse);
  const signals = marketSignalItems(row);
  const models = opportunityItems(row);
  const allItems = [...signals, ...models];
  const keywordKeys = new Set([
    'market_shift',
    'keyword_demand_shift',
    'old_keyword_decline',
    'new_keyword_cluster_emerging',
    'new_spec_emerging',
    'new_price_band_emerging',
  ]);
  const competitorKeys = new Set([
    'competitor_ad_pressure_high',
    'top_asin_concentration_high',
    'review_threshold_high',
    'competitor_traffic_map',
    'front_competitor_validated',
  ]);
  const receiverKeys = new Set([
    'product_review_upgrade_path',
    'listing_quality_gap_path',
    'listing_quality_gap',
    'review_upgrade_opportunity',
  ]);
  return {
    recommendedOperatingUse,
    keywordChanges: uniqueChangeItems(allItems.filter(item => keywordKeys.has(item.key))),
    competitorChanges: uniqueChangeItems(allItems.filter(item => competitorKeys.has(item.key))),
    receiverChanges: uniqueChangeItems(allItems.filter(item => receiverKeys.has(item.key))),
  };
}

function marketCoverage(row = {}) {
  const market = row.marketAnalysis || {};
  const intelligence = market.operatingIntelligence || {};
  const sourceCoverage = intelligence.sourceCoverage || {};
  const coverage = market.coverage || {};
  return {
    terms: num(sourceCoverage.terms ?? coverage.requested),
    totalMatches: num(sourceCoverage.totalMatches),
    sourceCount: num(sourceCoverage.sourceCount),
    keywordResearch: num(sourceCoverage.keywordResearch ?? coverage.keywordResearchMatched),
    productTimeMachine: num(sourceCoverage.productTimeMachine ?? coverage.productTimeMachineMatched),
    aba: num(sourceCoverage.aba ?? coverage.abaMatched),
    conversion: num(sourceCoverage.conversion ?? coverage.keywordConversionMatched),
    seasonality: num(sourceCoverage.seasonality ?? coverage.seasonalityMatched),
  };
}

function missingMarketEvidence(row = {}) {
  const intelligenceMissing = row.marketAnalysis?.operatingIntelligence?.missingEvidence || [];
  if (intelligenceMissing.length) return unique(intelligenceMissing);
  const coverage = marketCoverage(row);
  const missing = [];
  if (!coverage.keywordResearch) missing.push('selection_keyword_research');
  if (!coverage.productTimeMachine) missing.push('selection_product_time_machine');
  if (!coverage.aba) missing.push('selection_aba_search_terms');
  if (!coverage.conversion) missing.push('selection_keyword_conversion_rate');
  if (!coverage.seasonality) missing.push('selection_keyword_seasonality');
  return missing;
}

function buildMarketEvidenceCommands({ sku = '', terms = [], missingEvidence = [] } = {}) {
  const joinedTerms = terms.join(',');
  return missingEvidence
    .filter(layer => MARKET_EVIDENCE_COMMANDS[layer])
    .map(layer => {
      const command = MARKET_EVIDENCE_COMMANDS[layer];
      const skuPart = layer === 'selection_keyword_research' && sku ? ` -- --sku ${psQuote(sku)} ${command.arg} ${psQuote(joinedTerms)}` : ` -- ${command.arg} ${psQuote(joinedTerms)}`;
      return {
        layer,
        label: command.label,
        command: `npm run ${command.script}${skuPart}`,
        evidenceBoundary: 'read_only_market_evidence',
      };
    });
}

function assessMarketRelation(row = {}) {
  const market = row.marketAnalysis || {};
  const intelligence = market.operatingIntelligence || {};
  const signals = signalSet(row);
  const models = opportunityKeys(row);
  const ready = market.readyForDecisionSupport === true || intelligence.readyForDecisionSupport === true;
  const recommendedUse = lower(intelligence.recommendedOperatingUse || '');
  const marketShift = recommendedUse.includes('market_shift') ||
    recommendedUse.includes('keyword_shift') ||
    recommendedUse.includes('reseed') ||
    signals.has('market_shift') ||
    signals.has('keyword_demand_shift') ||
    signals.has('old_keyword_decline') ||
    signals.has('new_keyword_cluster_emerging') ||
    signals.has('new_spec_emerging') ||
    signals.has('new_price_band_emerging') ||
    models.includes('keyword_demand_shift') ||
    models.includes('old_keyword_decline') ||
    models.includes('new_keyword_cluster_emerging') ||
    models.includes('new_spec_emerging') ||
    models.includes('new_price_band_emerging') ||
    models.includes('market_shift');

  if (!ready) {
    return {
      key: 'market_unknown_missing_evidence',
      label: 'market evidence missing',
      marketState: 'unknown',
      ourRelativeState: 'unknown',
      actionBoundary: 'evidence_only',
      confidence: 'low',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['market evidence is required before old-product maintenance actions'],
    };
  }

  if (
    signals.has('market_demand_low') ||
    signals.has('market_conversion_weak') ||
    signals.has('market_cost_high')
  ) {
    return {
      key: 'market_down_or_weak',
      label: 'market down or weak',
      marketState: 'down_or_weak',
      ourRelativeState: 'not_actionable_for_growth',
      actionBoundary: 'control_or_clearance_review',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['market demand, conversion, or cost evidence is weak'],
    };
  }

  if (
    signals.has('competitor_ad_pressure_high') ||
    signals.has('top_asin_concentration_high') ||
    signals.has('review_threshold_high') ||
    models.includes('competitor_traffic_map')
  ) {
    return {
      key: 'competitor_pressure',
      label: 'competitor pressure',
      marketState: 'active_with_competitor_pressure',
      ourRelativeState: 'underperforming_vs_market',
      actionBoundary: 'manual_confirm_required',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['market exists, but competitor traffic, review, or concentration pressure must be handled'],
    };
  }

  if (marketShift) {
    return {
      key: 'market_shift',
      label: 'market shifted to new terms, specs, or price band',
      marketState: 'shifted_to_new_terms_or_specs',
      ourRelativeState: 'old_position_losing_fit',
      actionBoundary: 'reseed_market_and_repair_first',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['market evidence indicates old terms, old scenarios, specs, or price band are shifting; reseed market evidence and receiver fit before traffic scale'],
    };
  }

  if (
    recommendedUse.includes('repair') ||
    signals.has('product_review_upgrade_path') ||
    signals.has('listing_quality_gap_path') ||
    models.includes('listing_quality_gap') ||
    models.includes('review_upgrade_opportunity')
  ) {
    return {
      key: 'market_shift_or_receiver_gap',
      label: 'market shifted or receiver gap',
      marketState: 'active_but_receiver_sensitive',
      ourRelativeState: 'receiver_gap_likely',
      actionBoundary: 'repair_first',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['market evidence points to product/listing receiver repair before traffic scale'],
    };
  }

  if (models.includes('trend_or_new_market')) {
    return {
      key: 'market_growing_self_down',
      label: 'market growing while SKU is down',
      marketState: 'growing_or_new',
      ourRelativeState: 'underperforming_vs_market',
      actionBoundary: 'manual_confirm_required',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['trend or new-market evidence exists while SKU is in old-product decline'],
    };
  }

  if (
    models.includes('low_monopoly_market') ||
    models.includes('low_supply_market') ||
    models.includes('conversion_economics_usable') ||
    models.includes('front_competitor_validated')
  ) {
    return {
      key: 'market_stable_or_growing_self_down',
      label: 'market stable or usable while SKU is down',
      marketState: 'stable_or_usable',
      ourRelativeState: 'underperforming_vs_market',
      actionBoundary: 'manual_confirm_required',
      confidence: 'medium',
      missingEvidence: missingMarketEvidence(row),
      reasons: ['usable market evidence exists; internal breakpoint and traffic asset coverage must be checked'],
    };
  }

  return {
    key: 'market_unclear_operator_review',
    label: 'market unclear after partial evidence',
    marketState: 'unclear',
    ourRelativeState: 'unknown',
    actionBoundary: 'operator_review',
    confidence: 'low',
    missingEvidence: missingMarketEvidence(row),
    reasons: ['market evidence is present but does not yet support a clear operating route'],
  };
}

function assessReceiver(row = {}) {
  const signals = signalSet(row);
  const invDays = num(row.invDays, 0);
  const fulRes = num(row.fulRes, 0);
  const profitRate = num(row.profitRate, 0);
  const ad30 = row.ad30 || {};
  const reasons = [];
  const inventoryOk = fulRes > 0 && (invDays === 0 || invDays >= 21);
  const profitOk = profitRate >= 0.1;
  const adProof = num(ad30.orders) > 0 || num(row.ad7?.orders) > 0;

  if (!inventoryOk) reasons.push('inventory_receiver_not_ready');
  if (!profitOk) reasons.push('profit_room_not_ready');
  if (signals.has('listing_quality_gap_path') || signals.has('product_review_upgrade_path')) reasons.push('listing_or_review_receiver_gap');

  let status = 'can_receive';
  if (!inventoryOk || !profitOk) status = 'blocked';
  else if (reasons.length) status = 'repair_first';
  else if (!adProof) status = 'weak_ad_proof';

  return {
    status,
    inventoryOk,
    profitOk,
    adProof,
    reasons,
  };
}

function normalizeActions(actions = []) {
  return (Array.isArray(actions) ? actions : [])
    .filter(action => action && typeof action === 'object')
    .map(action => ({
      ...action,
      plannedClicks: num(action.plannedClicks ?? action.estimatedClicks, 0),
    }));
}

function isReversibleAdAction(action = {}) {
  const entityType = lower(action.entityType);
  const actionType = lower(action.actionType || action.type);
  return REVERSIBLE_AD_ACTIONS.has(actionType) && REVERSIBLE_AD_ENTITIES.has(entityType);
}

function estimateCoverage(row = {}, actions = []) {
  const currentOrders = num(row.units30d, num(row.ad30?.orders, 0));
  const yoy = row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? null : num(row.yoyUnitsPct, null);
  let lastYearEquivalentOrders = null;
  const historicalBaselineRequired = yoy !== null && yoy <= -0.95 && currentOrders <= 0;
  if (yoy !== null && yoy > -0.95 && yoy < 0 && currentOrders > 0) {
    lastYearEquivalentOrders = currentOrders / (1 + yoy);
  }
  const targetOrderGap = historicalBaselineRequired
    ? null
    : (lastYearEquivalentOrders !== null
    ? Math.max(0, lastYearEquivalentOrders - currentOrders)
    : 0);
  const adClicks = num(row.ad30?.clicks, 0);
  const adOrders = num(row.ad30?.orders, 0);
  const fallbackUnits = currentOrders > 0 ? currentOrders : 0;
  const cvr = adClicks > 0
    ? (adOrders > 0 ? adOrders / adClicks : (fallbackUnits > 0 ? Math.min(0.2, fallbackUnits / adClicks) : 0))
    : 0;
  const requiredClickGap = targetOrderGap !== null && targetOrderGap > 0 && cvr > 0 ? targetOrderGap / cvr : null;
  const plannedClickPool = normalizeActions(actions).reduce((sum, action) => sum + num(action.plannedClicks), 0);
  const coverageRatio = requiredClickGap && requiredClickGap > 0 ? plannedClickPool / requiredClickGap : 0;
  const conclusion = historicalBaselineRequired
    ? 'historical_baseline_required'
    : (targetOrderGap <= 0
    ? 'no_yoy_gap'
    : (requiredClickGap === null ? 'evidence_insufficient_for_click_gap' : (coverageRatio >= 0.5 ? 'coverage_possible' : 'coverage_insufficient')));

  return {
    targetOrderGap: targetOrderGap === null ? null : round(targetOrderGap, 1),
    currentOrders: round(currentOrders, 1),
    lastYearEquivalentOrders: lastYearEquivalentOrders === null ? null : round(lastYearEquivalentOrders, 1),
    observedAdClicks30d: round(adClicks, 0),
    observedAdOrders30d: round(adOrders, 0),
    observedAdCvr30d: cvr > 0 ? round(cvr, 4) : null,
    requiredClickGap: requiredClickGap === null ? null : round(requiredClickGap, 0),
    plannedClickPool: round(plannedClickPool, 0),
    coverageRatio: round(coverageRatio, 4),
    conclusion,
    label: conclusion === 'coverage_insufficient' ? '覆盖不足' : conclusion,
  };
}

function actionBid(action = {}) {
  return num(
    action.suggestedBid ??
    action.newBid ??
    action.bid ??
    action.currentBid,
    0
  );
}

function estimateActionEconomics(row = {}, actions = []) {
  const normalized = normalizeActions(actions);
  const estimatedSpend = normalized.reduce((sum, action) => {
    const explicitSpend = action.estimatedSpend ?? action.plannedSpend;
    if (explicitSpend !== undefined && explicitSpend !== null && explicitSpend !== '') {
      return sum + num(explicitSpend, 0);
    }
    return sum + (num(action.plannedClicks, 0) * actionBid(action));
  }, 0);
  const current30dSales = num(row.ad30?.sales, 0);
  const current30dEstimatedProfit = current30dSales * num(row.profitRate, 0);
  const spendToProfitRatio = current30dEstimatedProfit > 0 ? estimatedSpend / current30dEstimatedProfit : null;
  const reasons = [];
  let level = 'none';
  if (estimatedSpend > 0 && current30dEstimatedProfit <= 0) {
    level = 'high';
    reasons.push('estimated_spend_without_current_profit_pool');
  } else if (spendToProfitRatio !== null && spendToProfitRatio >= 0.5) {
    level = 'high';
    reasons.push('estimated_spend_near_or_above_current_profit_pool');
  } else if (spendToProfitRatio !== null && spendToProfitRatio >= 0.2) {
    level = 'medium';
    reasons.push('estimated_spend_material_vs_current_profit_pool');
  } else if (estimatedSpend > 0) {
    level = 'low';
    reasons.push('estimated_spend_small_vs_current_profit_pool');
  }
  return {
    estimatedSpend: round(estimatedSpend, 2),
    current30dSales: round(current30dSales, 2),
    current30dEstimatedProfit: round(current30dEstimatedProfit, 2),
    spendToProfitRatio: spendToProfitRatio === null ? null : round(spendToProfitRatio, 4),
    profitRisk: {
      level,
      reasons,
    },
  };
}

function enabledState(value) {
  const raw = lower(value);
  return value === true || raw === '1' || raw === 'enabled' || raw === 'enable' || raw === 'active';
}

function disabledState(value) {
  const raw = lower(value);
  return value === false || raw === '0' || raw === 'paused' || raw === 'pause' || raw === 'disabled' || raw === 'inactive';
}

function numberClose(a, b, tolerance = 0.0001) {
  const left = num(a, null);
  const right = num(b, null);
  if (left === null || right === null) return true;
  return Math.abs(left - right) <= tolerance;
}

function firstPresent(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
}

function readbackMatchesAction(action = {}, readback = {}) {
  const reasons = [];
  const actionType = lower(action.actionType || action.type);
  if (['bid', 'bid_down'].includes(actionType)) {
    const expected = firstPresent(action, ['suggestedBid', 'newBid', 'targetBid', 'bid']);
    const actual = firstPresent(readback, ['bid', 'currentBid']);
    if (expected !== undefined && actual !== undefined && !numberClose(actual, expected)) {
      reasons.push('bid_readback_mismatch');
    }
  }
  if (actionType === 'budget') {
    const expected = firstPresent(action, ['suggestedBudget', 'newBudget', 'targetBudget', 'budget', 'dailyBudget']);
    const actual = firstPresent(readback, ['budget', 'dailyBudget']);
    if (expected !== undefined && actual !== undefined && !numberClose(actual, expected)) {
      reasons.push('budget_readback_mismatch');
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function readbackChildState(action = {}, readback = {}) {
  const actionType = lower(action.actionType || action.type);
  const state = firstPresent(readback, ['state', 'servingState', 'enabled']);
  if (actionType === 'pause') {
    return {
      ok: state !== undefined && disabledState(state),
      reason: state === undefined ? 'child_state_missing' : 'child_state_not_paused',
    };
  }
  if (['enable', 'bid', 'bid_down', 'budget', 'placement'].includes(actionType)) {
    return {
      ok: state !== undefined && enabledState(state),
      reason: state === undefined ? 'child_state_missing' : 'child_state_not_enabled',
    };
  }
  return {
    ok: state === undefined || enabledState(state),
    reason: state === undefined ? '' : 'child_state_not_enabled',
  };
}

function landingEvidenceForAction(action = {}) {
  const explicitStatus = lower(action.landingStatus || action.landedStatus || action.readbackStatus || action.status);
  const readback = action.readback || action.liveReadback || action.landingReadback || action.landingEvidence?.readback || null;
  const hasReadback = readback && typeof readback === 'object';
  const explicitLanded = ['landed', 'landed_verified', 'readback_verified', 'success'].includes(explicitStatus) ||
    action.landed === true ||
    action.readbackVerified === true ||
    action.landingVerified === true;
  const parentOk = !hasReadback || (
    (readback.campaignState === undefined || enabledState(readback.campaignState)) &&
    (readback.groupState === undefined || enabledState(readback.groupState)) &&
    (readback.adGroupState === undefined || enabledState(readback.adGroupState))
  );
  const childState = hasReadback ? readbackChildState(action, readback) : { ok: false, reason: 'missing_readback' };
  const childOk = childState.ok;
  const valueMatch = hasReadback ? readbackMatchesAction(action, readback) : { ok: false, reasons: ['missing_readback'] };
  const reasons = [
    explicitLanded ? '' : 'landing_status_not_verified',
    hasReadback ? '' : 'missing_readback',
    parentOk ? '' : 'parent_state_not_enabled',
    childOk ? '' : childState.reason,
    ...valueMatch.reasons,
  ].filter(Boolean);
  const status = explicitLanded && hasReadback && parentOk && childOk && valueMatch.ok
    ? 'landed_verified'
    : 'pending_live_readback';
  return {
    status,
    requiresLiveReadback: status !== 'landed_verified',
    readback: hasReadback ? readback : null,
    reasons,
  };
}

function approvalRecords(input = {}) {
  const records = [];
  for (const key of ['approvals', 'approvedCandidates', 'items', 'candidates']) {
    if (Array.isArray(input[key])) records.push(...input[key]);
  }
  if (input.approval && typeof input.approval === 'object') records.push(input.approval);
  return records.filter(record => record && typeof record === 'object');
}

function approvalIndex(input = {}) {
  const index = new Map();
  for (const record of approvalRecords(input)) {
    const candidateId = text(record.candidateId || record.id);
    const sku = text(record.sku).toUpperCase();
    const approved = record.approved === true ||
      ['approved', 'manual_approved', 'confirmed'].includes(lower(record.status || record.decisionStage || record.approvalState));
    const normalized = {
      ...record,
      approved,
      approvedBy: text(record.approvedBy || record.actor || ''),
      actions: normalizeActions(record.actions || record.approvedActions),
    };
    if (candidateId) index.set(`candidate:${candidateId}`, normalized);
    if (sku) index.set(`sku:${sku}`, normalized);
  }
  return index;
}

function lookupApproval(index, candidate = {}) {
  return index.get(`candidate:${candidate.candidateId}`) || index.get(`sku:${text(candidate.sku).toUpperCase()}`) || null;
}

function actionRouteFor(row = {}, marketRelation = {}, receiver = {}) {
  if (marketRelation.key === 'market_unknown_missing_evidence') {
    return {
      route: 'evidence_hold',
      intensity: 'none',
      actionType: 'fetch_market_evidence',
      actionBoundary: 'evidence_only',
      measure: 'Fill front-search, Product Time Machine, ABA, keyword conversion, and seasonality evidence before any execution.',
    };
  }
  if (marketRelation.key === 'market_down_or_weak') {
    return {
      route: 'profit_control_or_clearance_review',
      intensity: 'low_or_stop_loss',
      actionType: 'control',
      actionBoundary: 'manual_confirm_required',
      measure: 'Do not force recovery; protect proven lanes, control weak spend, and review clearance/profit route.',
    };
  }
  if (marketRelation.key === 'market_shift') {
    return {
      route: 'reseed_market_then_repair',
      intensity: 'none_to_low',
      actionType: 'market_reseed_and_receiver_repair',
      actionBoundary: 'reseed_market_and_repair_first',
      measure: 'Map new keywords, specs, price bands, and competitor receivers; repair listing/product fit before any traffic recovery.',
    };
  }
  if (receiver.status === 'blocked') {
    return {
      route: 'repair_then_push',
      intensity: 'none_to_low',
      actionType: 'receiver_repair',
      actionBoundary: 'repair_first',
      measure: 'Repair inventory/profit receiver before adding traffic.',
    };
  }
  if (receiver.status === 'repair_first' || marketRelation.key === 'market_shift_or_receiver_gap') {
    return {
      route: 'repair_then_push',
      intensity: 'low',
      actionType: 'listing_or_product_repair',
      actionBoundary: 'repair_first',
      measure: 'Repair listing/product/review fit, then re-check traffic assets.',
    };
  }
  if (marketRelation.key === 'competitor_pressure') {
    return {
      route: 'controlled_push',
      intensity: receiver.adProof ? 'medium' : 'low',
      actionType: 'competitor_countermeasure',
      actionBoundary: 'manual_confirm_required',
      measure: 'Protect proven lanes, compare competitor price/review/listing, and only expand narrow validated entries.',
    };
  }
  if (marketRelation.key === 'market_growing_self_down' || marketRelation.key === 'market_stable_or_growing_self_down') {
    return {
      route: receiver.adProof ? 'controlled_push' : 'repair_then_push',
      intensity: receiver.adProof ? 'medium' : 'low',
      actionType: 'recover_validated_traffic_assets',
      actionBoundary: 'manual_confirm_required',
      measure: 'Live-read lower ad layers, protect winners, and propose reversible bid/budget/structure actions for operator approval.',
    };
  }
  return {
    route: 'evidence_hold',
    intensity: 'none',
    actionType: 'operator_review',
    actionBoundary: marketRelation.actionBoundary || 'operator_review',
    measure: 'Do not execute until market relation and receiver route are clear.',
  };
}

function candidateIdFor(date, row = {}) {
  return `old_product_maintenance::${dateOnly(date)}::${text(row.sku).toUpperCase()}`;
}

function candidateScore(row = {}, marketRelation = {}, receiver = {}) {
  const currentUnits = num(row.units30d, 0);
  const adClicks = num(row.ad30?.clicks, 0);
  const fulRes = num(row.fulRes, 0);
  const yoy = num(row.yoyUnitsPct, 0);
  const yoyLoss = Math.abs(Math.min(0, num(row.yoyUnitsPct, 0))) * 100;
  const orderWeight = Math.min(30, currentUnits / 2);
  const profitWeight = num(row.profitRate, 0) >= 0.1 ? 12 : -10;
  const inventoryWeight = num(row.invDays, 0) >= 30 ? 8 : 0;
  const marketWeight = {
    market_growing_self_down: 22,
    market_stable_or_growing_self_down: 18,
    competitor_pressure: 16,
    market_shift: 10,
    market_shift_or_receiver_gap: 8,
    market_unknown_missing_evidence: -4,
    market_down_or_weak: -8,
  }[marketRelation.key] || 0;
  const receiverWeight = receiver.status === 'can_receive' ? 8 : (receiver.status === 'blocked' ? -12 : 0);
  const noCurrentBaselinePenalty = currentUnits <= 0 && yoy <= -0.95 ? -55 : 0;
  const noTrafficPenalty = adClicks <= 0 ? -8 : 0;
  const noInventoryPenalty = fulRes <= 0 ? -28 : 0;
  return round(yoyLoss + orderWeight + profitWeight + inventoryWeight + marketWeight + receiverWeight + noCurrentBaselinePenalty + noTrafficPenalty + noInventoryPenalty, 1);
}

function priorityFor(score) {
  if (score >= 70) return 'P0';
  if (score >= 45) return 'P1';
  return 'P2';
}

function isOldProductDecline(row = {}) {
  const lifecycle = text(row.lifecycle);
  const yoy = row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? null : num(row.yoyUnitsPct, null);
  return OLD_PRODUCT_LIFECYCLES.has(lifecycle) &&
    (row.verdict === 'old_product_recovery_check' || (yoy !== null && yoy <= -0.25));
}

function roughCandidateScore(row = {}) {
  const currentUnits = num(row.units30d, 0);
  const adClicks = num(row.ad30?.clicks, 0);
  const fulRes = num(row.fulRes, 0);
  const profitRate = num(row.profitRate, 0);
  const yoy = row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? null : num(row.yoyUnitsPct, null);
  const computableYoyGap = yoy !== null && yoy > -0.95 && yoy < 0 && currentUnits > 0;
  return (
    (computableYoyGap ? Math.abs(yoy) * 80 : 0) +
    Math.min(40, currentUnits) +
    (fulRes > 0 ? 18 : -30) +
    (adClicks > 0 ? Math.min(18, adClicks / 8) : -8) +
    (profitRate >= 0.1 ? 12 : -10)
  );
}

function buildExecutionGate(candidate = {}, approval = null) {
  const reasons = [];
  const actionBoundary = candidate.route?.actionBoundary || candidate.marketRelation?.actionBoundary || '';
  if (candidate.marketRelation.key === 'market_unknown_missing_evidence') reasons.push('market_evidence_missing');
  if (candidate.marketRelation.key === 'market_unclear_operator_review' || actionBoundary === 'operator_review') reasons.push('market_relation_unclear_before_ad_execution');
  if (actionBoundary === 'reseed_market_and_repair_first') reasons.push('market_reseed_required_before_ad_execution');
  if (actionBoundary === 'repair_first') reasons.push('receiver_repair_required_before_ad_execution');
  if (candidate.receiver.status === 'blocked') reasons.push('receiver_blocked');
  if (candidate.coverage.conclusion === 'coverage_insufficient') reasons.push('coverage_insufficient');
  if (!approval?.approved) reasons.push('pending_operator_confirmation');
  if (approval?.approved && !approval.approvedBy) reasons.push('approved_by_missing');

  const approvedActions = approval?.approved ? normalizeActions(approval.actions) : [];
  const unsafeActions = approvedActions.filter(action => !isReversibleAdAction(action));
  if (approvedActions.length && unsafeActions.length) reasons.push('non_reversible_or_unsupported_action_present');

  const ready = approval?.approved === true &&
    !!approval.approvedBy &&
    candidate.marketRelation.key !== 'market_unknown_missing_evidence' &&
    candidate.marketRelation.key !== 'market_unclear_operator_review' &&
    !['operator_review', 'repair_first', 'reseed_market_and_repair_first', 'evidence_only'].includes(actionBoundary) &&
    candidate.receiver.status !== 'blocked' &&
    approvedActions.length > 0 &&
    unsafeActions.length === 0;

  return {
    status: ready ? 'manual_confirmed_ready_for_downstream_execute' : 'blocked_or_pending',
    readyForDownstreamExecute: ready,
    approvalState: approval?.approved ? 'manual_confirmed' : 'pending_operator_confirmation',
    approvedBy: approval?.approvedBy || '',
    reasons: unique(reasons),
    approvedActionCount: approvedActions.length,
  };
}

function suggestedActionsForRow(row = {}) {
  const actions =
    (Array.isArray(row.suggestedActions) && row.suggestedActions) ||
    (Array.isArray(row.proposedActions) && row.proposedActions) ||
    (Array.isArray(row.recommendedActions) && row.recommendedActions) ||
    [];
  return normalizeActions(actions).map(action => {
    const reversibleAdAction = isReversibleAdAction(action);
    return {
      ...action,
      reversibleAdAction,
      executionBoundary: reversibleAdAction
        ? 'operator_confirmation_required_reversible_ad'
        : 'manual_or_approval_chain_only',
    };
  });
}

function confirmationLabelForCandidate(candidate = {}) {
  if (candidate.marketRelation?.key === 'market_unknown_missing_evidence') return '市场证据不足';
  if (
    candidate.receiver?.status === 'blocked' ||
    candidate.route?.actionBoundary === 'repair_first' ||
    candidate.route?.actionBoundary === 'reseed_market_and_repair_first'
  ) {
    return '承接不足禁止放量';
  }
  if (candidate.coverage?.conclusion === 'coverage_insufficient') return '覆盖不足';
  if (
    candidate.marketRelation?.key === 'market_down_or_weak' ||
    candidate.marketRelation?.key === 'market_unclear_operator_review' ||
    candidate.route?.route === 'evidence_hold' ||
    candidate.coverage?.conclusion === 'no_yoy_gap' ||
    candidate.coverage?.conclusion === 'historical_baseline_required'
  ) {
    return '只观察';
  }
  return '建议执行';
}

function declineClassificationForCandidate(candidate = {}) {
  const marketKey = candidate.marketRelation?.key || '';
  const receiverStatus = candidate.receiver?.status || '';
  if (marketKey === 'market_unknown_missing_evidence') {
    return {
      type: 'market_evidence_missing',
      label: 'market evidence missing',
      primaryDriver: 'market_evidence',
      actionBoundary: 'evidence_only',
    };
  }
  if (marketKey === 'market_shift') {
    return {
      type: 'market_shift',
      label: 'market shifted',
      primaryDriver: 'market',
      actionBoundary: 'reseed_market_and_repair_first',
    };
  }
  if (receiverStatus === 'blocked' || receiverStatus === 'repair_first' || marketKey === 'market_shift_or_receiver_gap') {
    return {
      type: 'receiver_gap',
      label: 'internal receiver gap',
      primaryDriver: 'receiver',
      actionBoundary: 'repair_first',
    };
  }
  if (marketKey === 'competitor_pressure') {
    return {
      type: 'competitor_pressure',
      label: 'competitor pressure',
      primaryDriver: 'competitor',
      actionBoundary: 'manual_confirm_required',
    };
  }
  if (marketKey === 'market_down_or_weak') {
    return {
      type: 'market_down',
      label: 'market down or weak',
      primaryDriver: 'market',
      actionBoundary: 'control_or_clearance_review',
    };
  }
  if (marketKey === 'market_growing_self_down') {
    return {
      type: 'self_down_market_growing',
      label: 'market growing while SKU is down',
      primaryDriver: 'internal_breakpoint',
      actionBoundary: 'manual_confirm_required',
    };
  }
  if (marketKey === 'market_stable_or_growing_self_down') {
    return {
      type: 'self_down_market_stable',
      label: 'market stable or usable while SKU is down',
      primaryDriver: 'internal_breakpoint',
      actionBoundary: 'manual_confirm_required',
    };
  }
  return {
    type: 'unclear',
    label: 'unclear',
    primaryDriver: 'unknown',
    actionBoundary: candidate.route?.actionBoundary || candidate.marketRelation?.actionBoundary || 'operator_review',
  };
}

function buildConfirmationSheet(candidate = {}) {
  return {
    candidateId: text(candidate.candidateId),
    businessDate: text(candidate.businessDate),
    sku: text(candidate.sku).toUpperCase(),
    asin: text(candidate.asin).toUpperCase(),
    lifecycle: text(candidate.lifecycle),
    priority: text(candidate.priority),
    score: num(candidate.score),
    conclusionKey: text(candidate.decision),
    conclusionLabel: confirmationLabelForCandidate(candidate),
    declineClassification: candidate.declineClassification || declineClassificationForCandidate(candidate),
    evidenceBoundary: text(candidate.evidenceBoundary),
    operatingSnapshot: {
      units7d: candidate.current?.units7d ?? 0,
      units30d: candidate.current?.units30d ?? 0,
      yoyUnitsPct: candidate.current?.yoyUnitsPct ?? null,
      profitRate: candidate.current?.profitRate ?? 0,
      invDays: candidate.current?.invDays ?? 0,
      fulRes: candidate.current?.fulRes ?? 0,
      ad7: candidate.current?.ad7 || {},
      ad30: candidate.current?.ad30 || {},
    },
    market: {
      key: text(candidate.marketRelation?.key),
      label: text(candidate.marketRelation?.label),
      marketState: text(candidate.marketRelation?.marketState),
      ourRelativeState: text(candidate.marketRelation?.ourRelativeState),
      actionBoundary: text(candidate.marketRelation?.actionBoundary),
      confidence: text(candidate.marketRelation?.confidence),
      reasons: candidate.marketRelation?.reasons || [],
      missingEvidence: candidate.marketRelation?.missingEvidence || [],
      seedTerms: candidate.marketSeedTerms || [],
      changeEvidence: candidate.marketChangeEvidence || {},
    },
    receiver: candidate.receiver || {},
    coverage: candidate.coverage || {},
    recommendation: {
      route: text(candidate.route?.route),
      intensity: text(candidate.route?.intensity),
      actionType: text(candidate.route?.actionType),
      actionBoundary: text(candidate.route?.actionBoundary),
      measure: text(candidate.route?.measure),
    },
    suggestedActions: candidate.suggestedActions || [],
    actionEconomics: candidate.actionEconomics || {},
    checkpoints: candidate.checkpoints || [],
    approvalTemplate: candidate.approvalTemplate || {},
    gate: candidate.executionGate || {},
  };
}

function buildCandidateConfirmationList(candidates = []) {
  const items = candidates.map(candidate => candidate.confirmationSheet || buildConfirmationSheet(candidate));
  const byConclusion = {};
  for (const item of items) {
    byConclusion[item.conclusionLabel] = (byConclusion[item.conclusionLabel] || 0) + 1;
  }
  return {
    summary: {
      total: items.length,
      byConclusion,
    },
    items,
  };
}

function isDeepDivePriority(candidate = {}) {
  return candidate.priority === 'P0' || candidate.priority === 'P1';
}

function deferCandidate(candidate = {}, reason = 'priority_below_p1') {
  return {
    candidateId: candidate.candidateId,
    businessDate: candidate.businessDate,
    sku: candidate.sku,
    asin: candidate.asin,
    priority: candidate.priority,
    score: candidate.score,
    conclusionLabel: confirmationLabelForCandidate(candidate),
    marketRelation: candidate.marketRelation?.key || '',
    receiverStatus: candidate.receiver?.status || '',
    coverageConclusion: candidate.coverage?.conclusion || '',
    reasons: unique([
      reason,
      candidate.priority === 'P2' ? 'priority_below_p1' : '',
      candidate.receiver?.status === 'blocked' ? 'receiver_blocked' : '',
      candidate.coverage?.conclusion === 'historical_baseline_required' ? 'historical_baseline_required' : '',
    ]),
    nextStep: 'Keep in old-product backlog; do not spend market-evidence or execution capacity until it rises to P0/P1 or the operator explicitly pulls it forward.',
  };
}

function canQueuePendingAction(candidate = {}) {
  return candidate.marketRelation?.key !== 'market_unknown_missing_evidence' &&
    candidate.marketRelation?.key !== 'market_down_or_weak' &&
    candidate.marketRelation?.key !== 'market_unclear_operator_review' &&
    candidate.receiver?.status !== 'blocked' &&
    candidate.route?.actionBoundary !== 'repair_first' &&
    candidate.route?.actionBoundary !== 'reseed_market_and_repair_first';
}

function buildPendingConfirmationActions(candidates = []) {
  const items = [];
  for (const candidate of candidates) {
    if (!canQueuePendingAction(candidate)) continue;
    for (const action of candidate.suggestedActions || []) {
      if (!action.reversibleAdAction) continue;
      items.push({
        candidateId: candidate.candidateId,
        businessDate: candidate.businessDate,
        sku: candidate.sku,
        asin: candidate.asin,
        priority: candidate.priority,
        conclusionLabel: confirmationLabelForCandidate(candidate),
        coverageConclusion: candidate.coverage?.label || candidate.coverage?.conclusion || '',
        route: candidate.route?.route || '',
        intensity: candidate.route?.intensity || '',
        action,
        executionBoundary: 'operator_confirmation_required_reversible_ad',
        requiresOperatorApproval: true,
        willNotExecuteWithoutApproval: true,
        approvalTemplate: {
          ...candidate.approvalTemplate,
          actions: [action],
        },
      });
    }
  }
  return {
    summary: {
      total: items.length,
      reversibleAdActions: items.length,
    },
    items,
  };
}

function buildManualSuggestionQueue(candidates = []) {
  const items = [];
  for (const candidate of candidates) {
    if (candidate.marketRelation?.key === 'market_unknown_missing_evidence') continue;
    for (const action of candidate.suggestedActions || []) {
      if (action.reversibleAdAction) continue;
      items.push({
        candidateId: candidate.candidateId,
        businessDate: candidate.businessDate,
        sku: candidate.sku,
        asin: candidate.asin,
        priority: candidate.priority,
        conclusionLabel: confirmationLabelForCandidate(candidate),
        action,
        executionBoundary: 'manual_or_approval_chain_only',
        notInApprovedActionSchema: true,
        reason: 'Non-reversible or unsupported old-product action must stay in the matching manual/approval chain.',
      });
    }
    if (
      !(candidate.suggestedActions || []).some(action => !action.reversibleAdAction) &&
      ['repair_first', 'reseed_market_and_repair_first', 'control_or_clearance_review'].includes(candidate.route?.actionBoundary)
    ) {
      items.push({
        candidateId: candidate.candidateId,
        businessDate: candidate.businessDate,
        sku: candidate.sku,
        asin: candidate.asin,
        priority: candidate.priority,
        conclusionLabel: confirmationLabelForCandidate(candidate),
        action: {
          id: `${candidate.candidateId}::manual_route`,
          entityType: 'operating_route',
          actionType: candidate.route?.actionType || 'manual_review',
          measure: candidate.route?.measure || '',
        },
        executionBoundary: 'manual_or_approval_chain_only',
        notInApprovedActionSchema: true,
        reason: 'Route requires market reseed, receiver repair, clearance, price, listing, inventory, or operator review before ad execution.',
      });
    }
  }
  return {
    summary: {
      total: items.length,
    },
    items,
  };
}

function buildCandidate(row = {}, context = {}) {
  const marketRelation = assessMarketRelation(row);
  const marketChangeEvidence = buildMarketChangeEvidence(row);
  const receiver = assessReceiver(row);
  const route = actionRouteFor(row, marketRelation, receiver);
  const marketSeedTerms = collectMarketSeedTerms(row);
  const marketEvidenceRequest = buildMarketEvidenceRequest({
    candidateId: candidateIdFor(context.businessDate, row),
    sku: text(row.sku).toUpperCase(),
    asin: text(row.asin).toUpperCase(),
    priority: '',
    marketRelation,
    marketChangeEvidence,
    terms: marketSeedTerms,
    businessDate: context.businessDate,
  });
  const approval = lookupApproval(context.approvalIndex, {
    candidateId: candidateIdFor(context.businessDate, row),
    sku: row.sku,
  });
  const approvedActions = approval?.approved ? normalizeActions(approval.actions) : [];
  const suggestedActions = suggestedActionsForRow(row);
  const approvedSizingActions = approvedActions.filter(isReversibleAdAction);
  const suggestedSizingActions = suggestedActions.filter(action => action.reversibleAdAction);
  const sizingActions = approvedSizingActions.length ? approvedSizingActions : suggestedSizingActions;
  const coverage = estimateCoverage(row, sizingActions);
  const actionEconomics = estimateActionEconomics(row, sizingActions);
  const score = candidateScore(row, marketRelation, receiver);
  const candidate = {
    candidateId: candidateIdFor(context.businessDate, row),
    businessDate: context.businessDate,
    sku: text(row.sku).toUpperCase(),
    asin: text(row.asin).toUpperCase(),
    lifecycle: text(row.lifecycle),
    priority: priorityFor(score),
    score,
    evidenceBoundary: 'daily local snapshot + all SKU operating review + selection market evidence when present; GBrain is method memory only',
    current: {
      units7d: num(row.units7d),
      units30d: num(row.units30d),
      yoyUnitsPct: row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? null : round(row.yoyUnitsPct, 4),
      profitRate: round(row.profitRate, 4),
      invDays: round(row.invDays, 1),
      fulRes: round(row.fulRes, 0),
      ad7: row.ad7 || {},
      ad30: row.ad30 || {},
    },
    marketRelation,
    marketChangeEvidence,
    marketSeedTerms,
    marketEvidenceRequest,
    receiver,
    route,
    coverage,
    suggestedActions,
    actionEconomics,
    decision: '',
    checkpoints: [
      { day: 3, date: addDays(context.businessDate, 3), metrics: ['market_relative_yoy_gap', 'orders', 'netProfit', 'spend', 'acos'] },
      { day: 7, date: addDays(context.businessDate, 7), metrics: ['market_relative_yoy_gap', 'orders', 'netProfit', 'spend', 'acos'] },
    ],
    approvalTemplate: {
      candidateId: candidateIdFor(context.businessDate, row),
      sku: text(row.sku).toUpperCase(),
      approved: false,
      approvedBy: '',
      actions: [],
    },
  };
  candidate.marketEvidenceRequest.priority = candidate.priority;
  candidate.executionGate = buildExecutionGate(candidate, approval);
  candidate.decision = decisionForCandidate(candidate);
  candidate.declineClassification = declineClassificationForCandidate(candidate);
  candidate.confirmationSheet = buildConfirmationSheet(candidate);
  return candidate;
}

function buildMarketEvidenceRequest(input = {}) {
  const missingEvidence = unique(input.marketRelation?.missingEvidence || []);
  const terms = unique(input.terms || []).slice(0, 5);
  const hasTerms = terms.length > 0;
  return {
    requestId: `${input.candidateId || input.sku}::market_evidence`,
    candidateId: text(input.candidateId),
    businessDate: text(input.businessDate),
    sku: text(input.sku).toUpperCase(),
    asin: text(input.asin).toUpperCase(),
    priority: text(input.priority),
    status: missingEvidence.length ? (hasTerms ? 'ready_to_fetch' : 'needs_seed_terms') : 'not_required',
    actionBoundary: 'read_only_market_evidence',
    terms,
    missingEvidence,
    commands: hasTerms ? buildMarketEvidenceCommands({ sku: input.sku, terms, missingEvidence }) : [],
    nextUse: 'After these reports exist, rebuild the all-SKU review or rerun old-product maintenance; do not execute ads directly from selection evidence.',
  };
}

function decisionForCandidate(candidate = {}) {
  if (candidate.marketRelation.key === 'market_unknown_missing_evidence') return 'market_evidence_required';
  if (candidate.receiver.status === 'blocked') return 'receiver_not_ready_no_traffic_scale';
  if (candidate.marketRelation.key === 'market_shift') return 'market_shift_reseed_required';
  if (candidate.route.actionBoundary === 'repair_first') return 'repair_first_no_ad_scale';
  if (candidate.executionGate.approvalState !== 'manual_confirmed') return 'manual_confirmation_required';
  if (candidate.executionGate.readyForDownstreamExecute && candidate.coverage.conclusion === 'coverage_insufficient') {
    return 'confirmed_action_handoff_ready_coverage_insufficient';
  }
  if (candidate.executionGate.readyForDownstreamExecute) return 'confirmed_action_handoff_ready';
  return 'manual_confirmation_incomplete';
}

function selectRows(allSkuReview = {}, maxCandidates = 20) {
  const rows = Array.isArray(allSkuReview.rows) ? allSkuReview.rows : [];
  return rows
    .filter(isOldProductDecline)
    .map(row => ({ row, roughScore: roughCandidateScore(row) }))
    .sort((a, b) =>
      num(b.roughScore) - num(a.roughScore) ||
      Math.abs(Math.min(0, num(b.row.yoyUnitsPct, 0))) - Math.abs(Math.min(0, num(a.row.yoyUnitsPct, 0))) ||
      num(b.row.units30d) - num(a.row.units30d) ||
      text(a.row.sku).localeCompare(text(b.row.sku))
    )
    .map(item => item.row)
    .slice(0, maxCandidates);
}

function buildApprovedActionSchema(candidates = []) {
  return candidates
    .filter(candidate => candidate.executionGate?.readyForDownstreamExecute)
    .flatMap(candidate => {
      const approvalActions = normalizeActions(candidate.executionGate?.approvedActions || []);
      return approvalActions.map(action => {
        const actionEconomics = estimateActionEconomics({
          ad30: { sales: candidate.current?.ad30?.sales },
          profitRate: candidate.current?.profitRate,
        }, [action]);
        const landingEvidence = landingEvidenceForAction(action);
        return {
          ...action,
          candidateId: action.candidateId || candidate.candidateId,
          businessDate: action.businessDate || candidate.businessDate,
          priority: action.priority || candidate.priority,
          sku: action.sku || candidate.sku,
          asin: action.asin || candidate.asin,
          decisionStage: action.decisionStage || 'manual_approved',
          approvedBy: action.approvedBy || candidate.executionGate.approvedBy,
          actionSource: unique([...(Array.isArray(action.actionSource) ? action.actionSource : []), 'manual', 'old_product_maintenance']),
          requiresAiDecision: false,
          estimatedSpend: actionEconomics.estimatedSpend,
          profitRisk: actionEconomics.profitRisk,
          coverageConclusion: candidate.coverage?.label || candidate.coverage?.conclusion || '',
          landingEvidence,
          currentMetrics: action.currentMetrics || {
            orders: candidate.current?.ad7?.orders,
            spend: candidate.current?.ad7?.spend,
            sales: candidate.current?.ad7?.sales,
            acos: candidate.current?.ad7?.acos,
            clicks: candidate.current?.ad7?.clicks,
            impressions: candidate.current?.ad7?.impressions,
          },
          reviewPlan: action.reviewPlan || {
            checkAfterDays: [3, 7],
            metrics: ['orders', 'spend', 'acos', 'netProfit', 'market_relative_yoy_gap'],
            requiresMarketRelativeImprovement: true,
            requiresProfitImprovement: true,
            rollbackIf: 'old-product relative YoY gap does not improve or profit worsens by day 7',
          },
        };
      });
    });
}

function commandArg(value) {
  const raw = text(value);
  return raw.includes(' ') ? `"${raw}"` : raw;
}

function defaultApprovedActionSchemaFile(date) {
  return path.join(ROOT, 'data', 'snapshots', `action_schema_${dateOnly(date)}_old_product_approved.json`);
}

function defaultSnapshotFile() {
  return path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
}

function buildApprovedExecutionHandoff(approvedActionSchema = [], context = {}) {
  const businessDate = dateOnly(context.businessDate || new Date());
  const generatedAt = context.generatedAt || new Date().toISOString();
  const schemaFile = context.approvedActionsOutFile || defaultApprovedActionSchemaFile(businessDate);
  const snapshotFile = context.snapshotFile || defaultSnapshotFile();
  const blockers = [];
  const depositStatus = context.depositStatus || null;
  if (depositStatus && text(depositStatus.status) !== 'complete') {
    blockers.push('daily_deposit_not_complete');
  }

  const items = approvedActionSchema.map(action => {
    const landed = action.landingEvidence?.status === 'landed_verified';
    const executionState = blockers.length
      ? 'approved_blocked_by_data_prerequisites'
      : (landed ? 'landed_verified_watchlist_eligible' : 'approved_pending_live_readback');
    return {
      candidateId: text(action.candidateId),
      businessDate: text(action.businessDate || businessDate),
      sku: text(action.sku).toUpperCase(),
      asin: text(action.asin).toUpperCase(),
      actionId: text(action.id || action.entityId),
      entityType: text(action.entityType),
      actionType: text(action.actionType || action.type),
      approvedBy: text(action.approvedBy),
      executionState,
      landingEvidenceStatus: text(action.landingEvidence?.status || 'pending_live_readback'),
      dryRunRequired: true,
      liveExecuteRequiresOperatorGo: true,
      readbackRequired: action.landingEvidence?.status !== 'landed_verified',
      noEffectReviewUntilLanded: action.landingEvidence?.status !== 'landed_verified',
      watchlistEligible: landed,
      coverageConclusion: text(action.coverageConclusion),
      estimatedSpend: action.estimatedSpend ?? null,
      profitRisk: action.profitRisk || null,
    };
  });

  const pendingLiveReadback = items.filter(item => item.landingEvidenceStatus !== 'landed_verified').length;
  const watchlistEligible = items.filter(item => item.watchlistEligible).length;
  const status = items.length === 0
    ? 'no_approved_actions'
    : (blockers.length
      ? 'blocked_by_data_prerequisites'
      : (pendingLiveReadback > 0 ? 'awaiting_dry_run_execute_and_live_readback' : 'landed_verified_watchlist_eligible'));
  const dryRunCommand = items.length
    ? `node scripts\\execute\\run_actions.js ${commandArg(schemaFile)} --snapshot ${commandArg(snapshotFile)} --dry-run`
    : '';
  const liveExecuteCommand = items.length
    ? `node scripts\\execute\\run_actions.js ${commandArg(schemaFile)} --snapshot ${commandArg(snapshotFile)} --execute`
    : '';

  return {
    schemaVersion: 1,
    generatedAt,
    businessDate,
    dataDate: text(context.dataDate || ''),
    source: 'old_product_maintenance',
    mode: 'semi_auto',
    policy: {
      executionBoundary: 'operator_approved_reversible_ad_actions_only',
      dryRunRequired: true,
      liveExecuteRequiresOperatorGo: true,
      readbackRequired: true,
      noEffectReviewUntilLanded: true,
      watchlistEligibleOnlyAfter: 'landed_verified',
      fullAutomationEligibleOnlyAfter: 'market_relative_yoy_gap_and_profit_both_improve',
    },
    summary: {
      total: items.length,
      pendingLiveReadback,
      watchlistEligible,
      status,
      blockers,
    },
    executionPlan: {
      schemaFile,
      snapshotFile,
      dryRunCommand,
      liveExecuteCommand,
      liveExecuteBlocked: blockers.length > 0,
      blockedReason: blockers[0] || '',
      readbackRequired: true,
      watchlistEligibleOnlyAfter: 'landed_verified',
    },
    items,
  };
}

function buildMarketEvidenceQueue(candidates = []) {
  const items = candidates
    .map(candidate => candidate.marketEvidenceRequest)
    .filter(item => item && item.status !== 'not_required')
    .sort((a, b) => {
      const priorityRank = { P0: 0, P1: 1, P2: 2 };
      return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        a.sku.localeCompare(b.sku);
    });
  const byStatus = {};
  const missingEvidenceCounts = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    for (const layer of item.missingEvidence || []) {
      missingEvidenceCounts[layer] = (missingEvidenceCounts[layer] || 0) + 1;
    }
  }
  return {
    summary: {
      total: items.length,
      readyToFetch: items.filter(item => item.status === 'ready_to_fetch').length,
      needsSeedTerms: items.filter(item => item.status === 'needs_seed_terms').length,
      byStatus,
      missingEvidenceCounts,
    },
    items,
  };
}

function buildReviewTasksForApproved(candidates = [], timeContext = {}) {
  const actions = buildApprovedActionSchema(candidates)
    .filter(action => action.landingEvidence?.status === 'landed_verified')
    .map(action => ({
      ...action,
      sourceTaskId: action.sourceTaskId || action.candidateId || action.id || '',
      reviewPlan: {
        ...(action.reviewPlan || {}),
        checkAfterDays: [3, 7],
        metrics: ['market_relative_yoy_gap', 'orders', 'netProfit', 'spend', 'acos'],
        requiresMarketRelativeImprovement: true,
        requiresProfitImprovement: true,
        rollbackIf: action.reviewPlan?.rollbackIf || 'market-relative old-product YoY gap does not improve or profit worsens by day 7',
      },
    }));
  const ledger = buildAgentLedger({ actions, timeContext });
  return ledger.reviewTasks || [];
}

function describeAction(action = {}) {
  return [
    text(action.entityType || 'ad_entity'),
    text(action.actionType || 'action'),
    text(action.id || action.entityId || ''),
  ].filter(Boolean).join(' ');
}

function buildWatchlistItemsForApproved(candidates = [], timeContext = {}) {
  const businessDate = dateOnly(timeContext.businessDate || timeContext.runAt || new Date());
  return buildApprovedActionSchema(candidates)
    .filter(action => action.landingEvidence?.status === 'landed_verified')
    .map(action => {
      const day3 = addDays(businessDate, 3);
      const day7 = addDays(businessDate, 7);
      const actionSummary = `Old-product maintenance landed ${describeAction(action)}; coverage ${text(action.coverageConclusion || 'unknown')}; review market-relative YoY gap and profit before scaling or automation.`;
      return {
        sku: text(action.sku).toUpperCase(),
        asin: text(action.asin).toUpperCase(),
        status: 'watching',
        priority: text(action.priority || 'P2'),
        source: 'old_product_maintenance',
        candidateId: text(action.candidateId),
        actionId: text(action.id || action.entityId),
        phase: 'landed_waiting_3d_7d_review',
        openedAt: businessDate,
        nextCheckDate: day3,
        stageTargets: [
          {
            by: day3,
            target: '3-day validation: reread SKU, changed ad row, parent campaign/ad group state, impressions, clicks, spend, orders, ACOS, and market-relative YoY gap direction.',
          },
          {
            by: day7,
            target: '7-day validation: decide keep, rollback, or repair only after market-relative YoY gap improves and profit improves together.',
          },
        ],
        lastAction: {
          date: businessDate,
          summary: actionSummary,
          verified: true,
          evidenceBoundary: 'landed_verified requires live readback of changed row and parent state',
          readback: action.landingEvidence?.readback || null,
        },
        nextChecks: [
          `${day3}: confirm landed row state, bid/budget, parent states, delivery, clicks, spend, orders, ACOS, and market-relative YoY gap direction.`,
          `${day7}: judge whether old-product relative YoY decline improved and profit improved; do not upgrade this lane toward full automation unless both are true.`,
        ],
        closeConditions: [
          '3-day review records live row state, parent state, delivery, spend, orders, ACOS, and coverage verdict.',
          '7-day review records market-relative YoY gap result and profit result; both must improve before the action can count toward full-auto readiness.',
          'If profit worsens or market-relative YoY gap does not improve, stop scaling and review market relation, receiver, and traffic direction.',
        ],
        rollbackIf: action.reviewPlan?.rollbackIf || 'market-relative old-product YoY gap does not improve or profit worsens by day 7',
      };
    });
}

function automationCycleKey(result = {}) {
  return text(result.week || result.cycle || result.reviewWeek || dateOnly(result.currentAsOf || result.reviewDate || result.today));
}

function automationActionType(result = {}) {
  return text(
    result.actionType ||
    result.type ||
    result.action?.actionType ||
    result.reviewOf?.actionType ||
    result.automationActionType ||
    ''
  );
}

function resultReasons(result = {}) {
  return new Set((Array.isArray(result.reasons) ? result.reasons : []).map(lower).filter(Boolean));
}

function hasMetric(source = {}, keys = []) {
  return keys.some(key => source[key] !== undefined && source[key] !== null && source[key] !== '');
}

function resultHasOldProductOperatingEvidence(result = {}) {
  const reasons = resultReasons(result);
  const baseline = result.baseline || {};
  const current = result.current || result.currentMetrics || {};
  const inventory = result.inventory || result.inventoryRisk || {};
  const adSpendReviewed = reasons.has('old_product_ad_spend_reviewed') ||
    result.adSpendReviewed === true ||
    result.spendReviewed === true ||
    hasMetric(baseline, ['spend', 'acos']) ||
    hasMetric(current, ['spend', 'acos']);
  const conversionReviewed = reasons.has('old_product_conversion_reviewed') ||
    result.conversionReviewed === true ||
    result.cvrReviewed === true ||
    hasMetric(baseline, ['orders', 'clicks', 'cvr', 'conversionRate']) ||
    hasMetric(current, ['orders', 'clicks', 'cvr', 'conversionRate']);
  const inventoryRiskReviewed = reasons.has('old_product_inventory_risk_reviewed') ||
    result.inventoryRiskReviewed === true ||
    hasMetric(inventory, ['riskLevel', 'invDays', 'fulRes', 'fba', 'stock']) ||
    hasMetric(current, ['invDays', 'fulRes', 'fba', 'stock']);
  return adSpendReviewed && conversionReviewed && inventoryRiskReviewed;
}

function resultPassesAutomationBar(result = {}) {
  if (result.oldProductMaintenance !== true && lower(result.source) !== 'old_product_maintenance') return false;
  const marketRelative = result.marketRelative || {};
  const profit = result.profit || {};
  const yoyImproved = result.relativeYoyGapImproved === true ||
    marketRelative.yoyGapImproved === true ||
    marketRelative.relativeGapImproved === true;
  const marketAttributionClear = result.marketAttributionClear === true ||
    result.marketBaselineAvailable === true ||
    result.marketBaselineEvidence === true ||
    marketRelative.attributionClear === true ||
    marketRelative.marketBaselineAvailable === true ||
    marketRelative.baselineAvailable === true ||
    marketRelative.baselineEvidence === true ||
    ['clear', 'verified', 'market_relative_verified', 'baseline_verified'].includes(lower(marketRelative.attribution || marketRelative.attributionStatus || result.marketAttribution));
  const profitImproved = result.profitImproved === true ||
    profit.improved === true ||
    profit.unitProfitQualityImproved === true;
  return yoyImproved && marketAttributionClear && profitImproved && resultHasOldProductOperatingEvidence(result);
}

function resultHasUnclearMarketAttribution(result = {}) {
  if (result.oldProductMaintenance !== true && lower(result.source) !== 'old_product_maintenance') return false;
  const marketRelative = result.marketRelative || {};
  const yoyImproved = result.relativeYoyGapImproved === true ||
    marketRelative.yoyGapImproved === true ||
    marketRelative.relativeGapImproved === true;
  if (!yoyImproved) return false;
  return !(
    result.marketAttributionClear === true ||
    result.marketBaselineAvailable === true ||
    result.marketBaselineEvidence === true ||
    marketRelative.attributionClear === true ||
    marketRelative.marketBaselineAvailable === true ||
    marketRelative.baselineAvailable === true ||
    marketRelative.baselineEvidence === true ||
    ['clear', 'verified', 'market_relative_verified', 'baseline_verified'].includes(lower(marketRelative.attribution || marketRelative.attributionStatus || result.marketAttribution))
  );
}

function resultMissingAutomationActionType(result = {}) {
  if (result.oldProductMaintenance !== true && lower(result.source) !== 'old_product_maintenance') return false;
  return !automationActionType(result);
}

function automationReadinessForResults(results = [], options = {}) {
  const minSamples = num(options.minSamples, 10);
  const minWeeklyCycles = num(options.minWeeklyCycles, 2);
  const passed = results.filter(resultPassesAutomationBar);
  const cycles = unique(passed.map(automationCycleKey));
  const blockers = [];
  if (results.some(resultHasUnclearMarketAttribution)) blockers.push('market_attribution_unclear');
  if (results.some(result => (
    (result.oldProductMaintenance === true || lower(result.source) === 'old_product_maintenance') &&
    !resultHasOldProductOperatingEvidence(result)
  ))) {
    blockers.push('old_product_operating_evidence_missing');
  }
  if (results.some(resultMissingAutomationActionType)) blockers.push('action_type_missing');
  if (passed.length < minSamples) blockers.push('sample_size_below_threshold');
  if (cycles.length < minWeeklyCycles) blockers.push('weekly_cycle_threshold_not_met');
  return {
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? 'full_auto_candidate' : 'keep_semi_auto',
    passedSamples: passed.length,
    requiredSamples: minSamples,
    passedWeeklyCycles: cycles.length,
    requiredWeeklyCycles: minWeeklyCycles,
    blockers,
  };
}

function evaluateFullAutomationReadiness(effectResults = [], options = {}) {
  const results = Array.isArray(effectResults) ? effectResults : [];
  const base = automationReadinessForResults(results, options);
  const actionTypes = unique(results.map(automationActionType).filter(Boolean));
  const actionTypeReadiness = {};
  for (const actionType of actionTypes) {
    actionTypeReadiness[actionType] = automationReadinessForResults(
      results.filter(result => automationActionType(result) === actionType),
      options
    );
  }
  const eligibleActionTypes = actionTypes.filter(actionType => actionTypeReadiness[actionType]?.eligible);
  const typedStatus = actionTypes.length && eligibleActionTypes.length
    ? (eligibleActionTypes.length === actionTypes.length ? 'full_auto_candidate' : 'partial_full_auto_candidate')
    : base.status;
  return {
    ...base,
    eligible: actionTypes.length ? eligibleActionTypes.length > 0 : base.eligible,
    status: actionTypes.length ? typedStatus : base.status,
    eligibleActionTypes,
    actionTypeReadiness,
  };
}

function summarizeCandidates(candidates = []) {
  const byDecision = {};
  const byMarketRelation = {};
  const byApprovalState = {};
  const byDeclineClassification = {};
  for (const candidate of candidates) {
    byDecision[candidate.decision] = (byDecision[candidate.decision] || 0) + 1;
    byMarketRelation[candidate.marketRelation.key] = (byMarketRelation[candidate.marketRelation.key] || 0) + 1;
    byApprovalState[candidate.executionGate.approvalState] = (byApprovalState[candidate.executionGate.approvalState] || 0) + 1;
    const declineType = candidate.declineClassification?.type || 'unknown';
    byDeclineClassification[declineType] = (byDeclineClassification[declineType] || 0) + 1;
  }
  return {
    candidates: candidates.length,
    readyForDownstreamExecute: candidates.filter(candidate => candidate.executionGate.readyForDownstreamExecute).length,
    marketEvidenceMissing: candidates.filter(candidate => candidate.marketRelation.key === 'market_unknown_missing_evidence').length,
    coverageInsufficient: candidates.filter(candidate => candidate.coverage.conclusion === 'coverage_insufficient').length,
    receiverBlocked: candidates.filter(candidate => candidate.receiver.status === 'blocked').length,
    byDecision,
    byMarketRelation,
    byApprovalState,
    byDeclineClassification,
  };
}

function buildOldProductMaintenancePlan(input = {}) {
  const businessDate = dateOnly(input.businessDate || input.date || new Date());
  const dataDate = dateOnly(input.dataDate || input.allSkuReview?.dataDate || businessDate);
  const maxCandidates = num(input.maxCandidates, 20);
  const approval = input.approval || {};
  const approvals = approvalIndex(approval);
  const allSkuReview = input.allSkuReview || {};
  const selectedRows = selectRows(allSkuReview, maxCandidates);
  const candidatePool = selectedRows
    .map(row => buildCandidate(row, { businessDate, dataDate, approvalIndex: approvals }))
    .sort((a, b) => num(b.score) - num(a.score) || a.sku.localeCompare(b.sku));
  const candidates = candidatePool.filter(isDeepDivePriority);
  const deprioritizedCandidates = candidatePool
    .filter(candidate => !isDeepDivePriority(candidate))
    .map(candidate => deferCandidate(candidate));
  for (const candidate of candidates) {
    const record = lookupApproval(approvals, candidate);
    if (record?.approved) {
      candidate.executionGate.approvedActions = normalizeActions(record.actions);
    }
  }
  const approvedActionSchema = buildApprovedActionSchema(candidates);
  const marketEvidenceQueue = buildMarketEvidenceQueue(candidates);
  const candidateConfirmationList = buildCandidateConfirmationList(candidates);
  const pendingConfirmationActions = buildPendingConfirmationActions(candidates);
  const manualSuggestionQueue = buildManualSuggestionQueue(candidates);
  const approvedExecutionHandoff = buildApprovedExecutionHandoff(approvedActionSchema, {
    businessDate,
    dataDate,
    generatedAt: input.generatedAt,
    depositStatus: input.depositStatus || null,
    approvedActionsOutFile: input.approvedActionsOutFile,
    snapshotFile: input.snapshotFile,
  });
  const reviewTasks = buildReviewTasksForApproved(candidates, {
    runAt: input.generatedAt || new Date().toISOString(),
    businessDate,
    dataDate,
    sourceRunId: `old_product_maintenance_${businessDate}`,
  });
  const watchlistItems = buildWatchlistItemsForApproved(candidates, {
    runAt: input.generatedAt || new Date().toISOString(),
    businessDate,
    dataDate,
  });
  const automationReadiness = evaluateFullAutomationReadiness(input.effectResults || [], input.automationThresholds || {});
  const depositStatus = input.depositStatus || null;
  const dataPrerequisites = {
    allSkuReview: (Array.isArray(allSkuReview.rows) && allSkuReview.rows.length > 0) ? 'ready' : 'missing_or_empty',
    dailyDeposit: depositStatus ? text(depositStatus.status || 'unknown') : 'not_checked',
    blockers: [],
  };
  if (dataPrerequisites.allSkuReview !== 'ready') dataPrerequisites.blockers.push('all_sku_review_missing_or_empty');
  if (depositStatus && text(depositStatus.status) !== 'complete') dataPrerequisites.blockers.push('daily_deposit_not_complete');

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    businessDate,
    dataDate,
    mode: 'semi_auto',
    evidenceBoundary: 'GBrain method memory only; daily decisions require current/local all-SKU, market evidence, and approved action evidence.',
    dataPrerequisites,
    summary: {
      ...summarizeCandidates(candidates),
      selectedFromRows: Array.isArray(allSkuReview.rows) ? allSkuReview.rows.length : 0,
      prescreenedOldProductRows: candidatePool.length,
      deepDivePriorities: ['P0', 'P1'],
      deprioritizedCandidates: deprioritizedCandidates.length,
      maxCandidates,
      approvedActionRows: approvedActionSchema.length,
      confirmationSheets: candidateConfirmationList.summary.total,
      pendingConfirmationActions: pendingConfirmationActions.summary.total,
      manualSuggestionItems: manualSuggestionQueue.summary.total,
      executionHandoffItems: approvedExecutionHandoff.summary.total,
      reviewTasks: reviewTasks.length,
      watchlistItems: watchlistItems.length,
      marketEvidenceQueue: marketEvidenceQueue.summary,
      automationReadiness: automationReadiness.status,
    },
    candidates,
    deprioritizedCandidates,
    candidateConfirmationList,
    pendingConfirmationActions,
    manualSuggestionQueue,
    marketEvidenceQueue,
    approvedActionSchema,
    approvedExecutionHandoff,
    reviewTasks,
    watchlistItems,
    automationReadiness,
  };
}

function buildWatchlistDelta(plan = {}) {
  return {
    schemaVersion: 1,
    updatedAt: dateOnly(plan.businessDate || new Date()),
    generatedAt: plan.generatedAt || new Date().toISOString(),
    source: 'old_product_maintenance',
    policy: {
      mode: 'semi_auto',
      entryRule: 'Only landed_verified old-product actions enter this watchlist delta.',
      closeRule: 'Close only after 3-day and 7-day reviews record market-relative YoY gap and profit result.',
    },
    items: plan.watchlistItems || [],
  };
}

function watchlistItemKey(item = {}) {
  const source = text(item.source || 'watchlist');
  if (item.candidateId || item.actionId) {
    return [source, text(item.candidateId), text(item.actionId)].join('::');
  }
  return [source, text(item.sku).toUpperCase(), text(item.phase || item.nextCheckDate)].join('::');
}

function mergeWatchlistDelta(currentWatchlist = {}, delta = {}) {
  const deltaItems = Array.isArray(delta.items) ? delta.items : [];
  const baseItems = Array.isArray(currentWatchlist.items) ? currentWatchlist.items : [];
  const items = [...baseItems];
  const indexByKey = new Map(items.map((item, index) => [watchlistItemKey(item), index]));
  let added = 0;
  let updated = 0;
  for (const item of deltaItems) {
    const key = watchlistItemKey(item);
    if (indexByKey.has(key)) {
      const index = indexByKey.get(key);
      items[index] = { ...items[index], ...item };
      updated += 1;
    } else {
      indexByKey.set(key, items.length);
      items.push(item);
      added += 1;
    }
  }
  return {
    watchlist: {
      schemaVersion: currentWatchlist.schemaVersion || 1,
      ...currentWatchlist,
      updatedAt: delta.updatedAt || dateOnly(new Date()),
      items,
    },
    summary: {
      status: deltaItems.length ? 'updated' : 'no_landed_items',
      added,
      updated,
      skipped: 0,
      total: deltaItems.length,
    },
  };
}

function mergeWatchlistDeltaFile(file, delta = {}) {
  if (!file) return { status: 'not_requested', added: 0, updated: 0, total: 0 };
  const deltaItems = Array.isArray(delta.items) ? delta.items : [];
  if (!deltaItems.length) return { status: 'no_landed_items', added: 0, updated: 0, total: 0 };
  let current = { schemaVersion: 1, items: [] };
  if (fs.existsSync(file)) {
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (error) {
      return {
        status: 'watchlist_parse_failed',
        added: 0,
        updated: 0,
        total: deltaItems.length,
        error: error.message,
      };
    }
  }
  const result = mergeWatchlistDelta(current, delta);
  writeJson(file, result.watchlist);
  return result.summary;
}

function renderOldProductMaintenanceMarkdown(plan = {}) {
  const lines = [];
  lines.push(`# Old Product Maintenance ${plan.businessDate || ''}`);
  lines.push('');
  lines.push(`Mode: ${plan.mode || 'semi_auto'}`);
  lines.push(`Evidence boundary: ${plan.evidenceBoundary || ''}`);
  lines.push(`Daily deposit: ${plan.dataPrerequisites?.dailyDeposit || 'not_checked'}`);
  lines.push(`Candidates: ${plan.summary?.candidates || 0}; confirmation sheets: ${plan.summary?.confirmationSheets || 0}; pending confirmation actions: ${plan.summary?.pendingConfirmationActions || 0}; ready for downstream execute: ${plan.summary?.readyForDownstreamExecute || 0}; market missing: ${plan.summary?.marketEvidenceMissing || 0}; coverage insufficient: ${plan.summary?.coverageInsufficient || 0}; watchlist items: ${plan.summary?.watchlistItems || 0}`);
  lines.push(`Execution handoff: ${plan.approvedExecutionHandoff?.summary?.status || 'no_approved_actions'}; items ${plan.approvedExecutionHandoff?.summary?.total || 0}; pending readback ${plan.approvedExecutionHandoff?.summary?.pendingLiveReadback || 0}; blockers ${(plan.approvedExecutionHandoff?.summary?.blockers || []).join(', ') || 'none'}`);
  lines.push('');
  for (const candidate of plan.candidates || []) {
    lines.push(`## ${candidate.priority} ${candidate.sku} ${candidate.asin}`);
    lines.push(`Operator conclusion: ${candidate.confirmationSheet?.conclusionLabel || confirmationLabelForCandidate(candidate)}`);
    lines.push(`Decision: ${candidate.decision}`);
    lines.push(`Market relation: ${candidate.marketRelation.key} (${candidate.marketRelation.marketState}/${candidate.marketRelation.ourRelativeState})`);
    lines.push(`Receiver: ${candidate.receiver.status}; route: ${candidate.route.route}; intensity: ${candidate.route.intensity}`);
    lines.push(`Coverage: ${candidate.coverage.label}; order gap ${candidate.coverage.targetOrderGap}; required clicks ${candidate.coverage.requiredClickGap ?? 'unknown'}; planned clicks ${candidate.coverage.plannedClickPool}; ratio ${candidate.coverage.coverageRatio}`);
    lines.push(`Action economics: estimated spend ${candidate.actionEconomics?.estimatedSpend ?? 0}; current 30d profit pool ${candidate.actionEconomics?.current30dEstimatedProfit ?? 0}; profit risk ${candidate.actionEconomics?.profitRisk?.level || 'none'}`);
    lines.push(`Gate: ${candidate.executionGate.status}; approval ${candidate.executionGate.approvalState}; reasons ${candidate.executionGate.reasons.join(', ') || 'none'}`);
    lines.push(`Measure: ${candidate.route.measure}`);
    if (candidate.marketRelation.missingEvidence?.length) {
      lines.push(`Missing market evidence: ${candidate.marketRelation.missingEvidence.join(', ')}`);
    }
    if (candidate.marketEvidenceRequest?.terms?.length) {
      lines.push(`Market seed terms: ${candidate.marketEvidenceRequest.terms.join(', ')}`);
    }
    if (candidate.marketEvidenceRequest?.commands?.length) {
      lines.push('Market evidence commands:');
      for (const command of candidate.marketEvidenceRequest.commands) {
        lines.push(`- ${command.layer}: \`${command.command}\``);
      }
    }
    if (candidate.suggestedActions?.length) {
      lines.push('Suggested actions for operator confirmation:');
      for (const action of candidate.suggestedActions) {
        lines.push(`- ${action.executionBoundary}: ${action.entityType || ''} ${action.actionType || ''} ${action.id || ''}`.trim());
      }
    }
    lines.push(`Approval template: candidateId=${candidate.candidateId}; approved=false; approvedBy=; actions=[]`);
    lines.push('');
  }
  const queueSummary = plan.marketEvidenceQueue?.summary || {};
  lines.push(`Market evidence queue: total ${queueSummary.total || 0}; readyToFetch ${queueSummary.readyToFetch || 0}; needsSeedTerms ${queueSummary.needsSeedTerms || 0}`);
  lines.push(`Automation readiness: ${plan.automationReadiness?.status || 'keep_semi_auto'}; blockers ${(plan.automationReadiness?.blockers || []).join(', ') || 'none'}`);
  return lines.join('\n');
}

function defaultAllSkuReviewFile(date, root = ROOT) {
  return path.join(root, 'data', 'tasks', `all_sku_operating_review_${dateOnly(date)}.json`);
}

function runOldProductMaintenance(options = {}) {
  const businessDate = dateOnly(options.businessDate || options.date || new Date());
  const allSkuReviewFile = options.allSkuReviewFile || defaultAllSkuReviewFile(businessDate, options.root || ROOT);
  const allSkuReview = options.allSkuReview || readJson(allSkuReviewFile, {});
  const approval = options.approval || readJson(options.approvalFile, {});
  const depositStatus = options.depositStatus || readJson(options.depositStatusFile, null);
  const effectResults = options.effectResults || readJson(options.effectResultsFile, []);
  const plan = buildOldProductMaintenancePlan({
    businessDate,
    dataDate: options.dataDate,
    allSkuReview,
    approval,
    depositStatus,
    effectResults: Array.isArray(effectResults) ? effectResults : effectResults.results,
    maxCandidates: options.maxCandidates,
    generatedAt: options.generatedAt,
    approvedActionsOutFile: options.approvedActionsOutFile,
    snapshotFile: options.snapshotFile,
  });
  const outFile = options.outFile || path.join(options.root || ROOT, 'data', 'tasks', `old_product_maintenance_${businessDate}.json`);
  const markdownFile = options.markdownFile || path.join(options.root || ROOT, 'data', 'tasks', `old_product_maintenance_${businessDate}.md`);
  writeJson(outFile, plan);
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, renderOldProductMaintenanceMarkdown(plan), 'utf8');
  if (options.approvedActionsOutFile && plan.approvedActionSchema.length) {
    writeJson(options.approvedActionsOutFile, plan.approvedActionSchema);
  }
  if (options.marketEvidenceQueueOutFile) {
    writeJson(options.marketEvidenceQueueOutFile, plan.marketEvidenceQueue);
  }
  if (options.candidateConfirmationOutFile) {
    writeJson(options.candidateConfirmationOutFile, plan.candidateConfirmationList);
  }
  if (options.pendingConfirmationActionsOutFile) {
    writeJson(options.pendingConfirmationActionsOutFile, plan.pendingConfirmationActions);
  }
  if (options.manualSuggestionQueueOutFile) {
    writeJson(options.manualSuggestionQueueOutFile, plan.manualSuggestionQueue);
  }
  if (options.watchlistOutFile) {
    writeJson(options.watchlistOutFile, buildWatchlistDelta(plan));
  }
  const watchlistDelta = buildWatchlistDelta(plan);
  const skuWatchlistMerge = mergeWatchlistDeltaFile(options.skuWatchlistFile, watchlistDelta);
  if (options.executionHandoffOutFile) {
    writeJson(options.executionHandoffOutFile, plan.approvedExecutionHandoff);
  }
  return {
    plan,
    files: {
      outFile,
      markdownFile,
      approvedActionsOutFile: options.approvedActionsOutFile || '',
      marketEvidenceQueueOutFile: options.marketEvidenceQueueOutFile || '',
      candidateConfirmationOutFile: options.candidateConfirmationOutFile || '',
      pendingConfirmationActionsOutFile: options.pendingConfirmationActionsOutFile || '',
      manualSuggestionQueueOutFile: options.manualSuggestionQueueOutFile || '',
      watchlistOutFile: options.watchlistOutFile || '',
      skuWatchlistFile: options.skuWatchlistFile || '',
      skuWatchlistMergeStatus: skuWatchlistMerge.status,
      skuWatchlistMerge,
      executionHandoffOutFile: options.executionHandoffOutFile || '',
    },
  };
}

module.exports = {
  assessMarketRelation,
  assessReceiver,
  buildApprovedExecutionHandoff,
  buildCandidateConfirmationList,
  buildOldProductMaintenancePlan,
  buildExecutionGate,
  buildMarketEvidenceQueue,
  buildManualSuggestionQueue,
  buildPendingConfirmationActions,
  buildWatchlistDelta,
  buildWatchlistItemsForApproved,
  mergeWatchlistDelta,
  mergeWatchlistDeltaFile,
  estimateCoverage,
  evaluateFullAutomationReadiness,
  isOldProductDecline,
  renderOldProductMaintenanceMarkdown,
  runOldProductMaintenance,
  selectRows,
};
