const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BUSINESS_DATE = getArg('--business-date') || process.env.BUSINESS_DATE || '2026-06-02';
const OUT_FILE = getArg('--out') || path.join(ROOT, 'data', 'tasks', `invalid_spend_root_cause_review_${BUSINESS_DATE}.json`);
const OUT_MD = OUT_FILE.replace(/\.json$/i, '.md');
const OUT_SKU_ACTION_MAP = getArg('--sku-action-map') || path.join(ROOT, 'data', 'tasks', `invalid_spend_sku_market_habit_action_map_${BUSINESS_DATE}.md`);

function getArg(name) {
  const raw = process.argv.find(arg => arg === name || arg.startsWith(`${name}=`));
  if (!raw) return '';
  if (raw === name) return '1';
  return raw.slice(name.length + 1);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '';
  return `${(num(value) * 100).toFixed(1)}%`;
}

function inferSku(row = {}) {
  const explicitSku = text(row.sku).toUpperCase();
  if (explicitSku) return explicitSku;
  const haystack = `${row.campaignName || ''} ${row.groupName || ''}`;
  const match = haystack.match(/(?:_|-|\b)([a-z]{2,4}\d{3,5})(?:\b|_|-|\s|$)/i);
  if (match) return match[1].toUpperCase();
  if (row.kind || row.entityType || row.adGroupId || row.entityId) {
    return `UNMAPPED_${text(row.kind || row.entityType).toUpperCase() || 'ROW'}::${row.adGroupId || row.entityId || 'UNKNOWN'}`;
  }
  return 'UNKNOWN';
}

function classifyQueueRow(row = {}) {
  const marketBucket = text(row.marketBucket);
  const habit = text(row.habit);
  const hasMarketMisjudgment = !!marketBucket && marketBucket !== 'unclassified_low_efficiency_tail';
  const rootCause = hasMarketMisjudgment ? 'market_misjudgment_plus_bad_habit' : 'bad_habit_only';
  const reopenPolicy = hasMarketMisjudgment
    ? 'do_not_reopen_without_fresh_market_and_exact_conversion_proof'
    : 'reopen_only_after_recent_conversion_proof';
  const nextAction = hasMarketMisjudgment
    ? 'hold_generic_or_expanded_lane_until_market_fit_is_reproven'
    : 'keep_stop_loss_and_reopen_only_if_recent_conversion_returns';
  return {
    rootCause,
    habit: habit || 'unclassified_habit',
    marketBucket: marketBucket || 'unclassified_low_efficiency_tail',
    reopenPolicy,
    nextAction,
  };
}

function summarizeRows(rows, classify) {
  const byRootCause = new Map();
  const byHabit = new Map();
  const byMarketBucket = new Map();
  const bySku = new Map();

  for (const row of rows) {
    const cls = classify(row);
    addBucket(byRootCause, cls.rootCause, row, cls);
    addBucket(byHabit, cls.habit, row, cls);
    addBucket(byMarketBucket, cls.marketBucket, row, cls);
    addBucket(bySku, inferSku(row), row, cls);
  }

  return {
    byRootCause: sortedBuckets(byRootCause),
    byHabit: sortedBuckets(byHabit),
    byMarketBucket: sortedBuckets(byMarketBucket),
    topSkus: sortedBuckets(bySku).slice(0, 30),
  };
}

function addBucket(map, key, row, cls = {}) {
  const bucket = map.get(key) || {
    key,
    rows: 0,
    bidDown: 0,
    pause: 0,
    spend30: 0,
    clicks30: 0,
    orders30: 0,
    skus: new Set(),
    examples: [],
    rootCauses: new Set(),
    marketBuckets: new Set(),
    habits: new Set(),
  };
  bucket.rows += 1;
  if (row.actionType === 'pause') bucket.pause += 1;
  else bucket.bidDown += 1;
  bucket.spend30 += num(row.spend30);
  bucket.clicks30 += num(row.clicks30);
  bucket.orders30 += num(row.orders30);
  const sku = inferSku(row);
  if (sku) bucket.skus.add(sku);
  const traffic = text(row.text || row.campaignName);
  if (traffic && bucket.examples.length < 3) bucket.examples.push(traffic);
  if (cls.rootCause) bucket.rootCauses.add(cls.rootCause);
  if (cls.marketBucket) bucket.marketBuckets.add(cls.marketBucket);
  if (cls.habit) bucket.habits.add(cls.habit);
  map.set(key, bucket);
}

function sortedBuckets(map) {
  return [...map.values()]
    .map(bucket => ({
      key: bucket.key,
      rows: bucket.rows,
      bidDown: bucket.bidDown,
      pause: bucket.pause,
      spend30: round(bucket.spend30),
      clicks30: round(bucket.clicks30, 0),
      orders30: round(bucket.orders30, 0),
      skuCount: bucket.skus.size,
      examples: bucket.examples,
      rootCauses: [...bucket.rootCauses],
      marketBuckets: [...bucket.marketBuckets],
      habits: [...bucket.habits],
    }))
    .sort((a, b) => b.spend30 - a.spend30 || b.rows - a.rows || a.key.localeCompare(b.key));
}

function classifyProtectedExploration(row = {}) {
  const orders3 = num(row.orders3);
  const orders7 = num(row.orders7);
  const orders30 = num(row.orders30);
  const spend3 = num(row.spend3);
  const spend7 = num(row.spend7);
  const acos7 = row.acos7 === null || row.acos7 === undefined ? null : num(row.acos7);
  const acos30 = row.acos30 === null || row.acos30 === undefined ? null : num(row.acos30);
  const longWindowEfficient = orders30 > 0 && acos30 !== null && acos30 <= 0.25;
  const recentOrders = orders3 > 0 || orders7 > 0;
  const recentZeroOrderSpend = orders3 <= 0 && spend3 >= 5;

  if (recentZeroOrderSpend && recentOrders) {
    return {
      reviewLevel: 'fragile_watch_3d_zero_order',
      protectionReason: '7d_or_30d_conversion_support_exists_but_latest_3d_has_meaningful_zero_order_spend',
      checkpointTrigger: 'if_next_3d_is_zero_order_again_and_7d_remains_high_acos_or_zero_order_then_control_bid_only',
    };
  }
  if (recentOrders && longWindowEfficient) {
    return {
      reviewLevel: 'protect_recent_and_30d',
      protectionReason: 'recent_orders_and_30d_acos_support_normal_exploration',
      checkpointTrigger: 'hold_unless_orders_collapse_or_row_returns_to_hard_zero_order_waste',
    };
  }
  if (recentOrders) {
    return {
      reviewLevel: 'protect_recent_orders',
      protectionReason: 'recent_orders_exist_even_if_acos_is_high',
      checkpointTrigger: 'hold_unless_3d_and_7d_orders_collapse_with_meaningful_spend',
    };
  }
  if (longWindowEfficient) {
    return {
      reviewLevel: 'watch_30d_efficient_only',
      protectionReason: '30d_conversion_economics_are_still_healthy',
      checkpointTrigger: 'control_bid_only_if_next_3d_and_7d_are_both_zero_order_with_meaningful_spend',
    };
  }
  if ((acos7 !== null && acos7 >= 0.45) || (acos30 !== null && acos30 >= 0.3)) {
    return {
      reviewLevel: 'fragile_watch_high_acos',
      protectionReason: 'conversion_exists_but_efficiency_is_weak',
      checkpointTrigger: 'do_not_pause_immediately; require_next_window_zero_order_or_sharp_order_drop',
    };
  }
  return {
    reviewLevel: 'protect_default',
    protectionReason: 'not_hard_waste_under_current_guardrails',
    checkpointTrigger: 'monitor_only_until_checkpoint_confirms_renewed_hard_waste',
  };
}

function protectedExplorationRows(checkpoint = {}) {
  return (checkpoint.protectedGrayRows || []).map(row => {
    const review = classifyProtectedExploration(row);
    return {
      sku: inferSku(row),
      kind: row.kind,
      entityType: row.entityType,
      entityId: row.entityId,
      text: row.text,
      campaignName: row.campaignName,
      impressions3: round(row.impressions3, 0),
      clicks3: round(row.clicks3, 0),
      spend3: round(row.spend3),
      orders3: num(row.orders3),
      acos3: row.acos3 ?? null,
      impressions7: round(row.impressions7, 0),
      clicks7: round(row.clicks7, 0),
      spend7: round(row.spend7),
      orders7: num(row.orders7),
      acos7: row.acos7 ?? null,
      impressions30: round(row.impressions30, 0),
      clicks30: round(row.clicks30, 0),
      spend30: round(row.spend30),
      orders30: num(row.orders30),
      acos30: row.acos30 ?? null,
      rootCause: 'protected_exploration',
      nextAction: 'monitor_only_until_3d_7d_checkpoint_confirms_new_waste',
      guardrail: 'do_not_pause_or_deepen_cut_while_recent_or_30d_conversion_support_remains',
      ...review,
    };
  });
}

function hardResidualRows(checkpoint = {}) {
  return (checkpoint.hardResiduals || []).map(row => ({
    ...row,
    rootCause: 'backend_blocked_hard_waste',
    nextAction: 'retry_after_backend_system_adjustment_cooldown_or_verify_it_left_the_low_efficiency_pool',
  }));
}

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = text(row[field]) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, rows]) => ({ key, rows }))
    .sort((a, b) => b.rows - a.rows || a.key.localeCompare(b.key));
}

function shortList(values = [], limit = 4) {
  return values.filter(Boolean).slice(0, limit).join(', ');
}

function actionByMarketVerdict(verdict) {
  if (verdict === 'market_fit_not_proven') return 'do_not_reopen_market_bucket';
  if (verdict === 'market_exists_but_broad_intent_competitive') return 'exact_or_phrase_only_after_sku_fit';
  if (verdict === 'niche_market_exists_but_current_lane_too_broad') return 'exact_fit_only_no_generic_reopen';
  return 'hold_reopen_until_exact_conversion_proof';
}

function habitBoundary(habit) {
  const rules = {
    auto_loose_or_substitutes_uncontrolled: 'recheck auto loose/substitutes first; keep exact rows separate',
    auto_zero_order_not_closed: 'keep auto zero-order stop-loss active at 3d/7d',
    asin_or_manual_expansion_unverified: 'block ASIN-expanded/manual target reopen without ASIN conversion',
    kw_zero_order_or_high_acos_not_stopped: 'do not reopen keyword rows without recent exact conversion',
    sbv_or_sb_keyword_spend_not_closed: 'hold SB/SBV generic keywords until exact proof returns',
    phrase_kw_not_stopped_at_7_15d: 'watch phrase rows at 7d/15d and cut regenerated waste',
    broad_kw_too_wide: 'do not use broad as recovery lane; exact/phrase only',
  };
  return rules[habit] || 'keep narrow stop-loss and monitor regenerated hard waste';
}

function buildSkuActionMap({ classifiedRows = [], protectedRows = [], marketEvidencePlan = [] } = {}) {
  const marketByBucket = new Map(marketEvidencePlan.map(row => [row.marketBucket, row]));
  const bySku = new Map();
  for (const row of classifiedRows) {
    const sku = inferSku(row);
    const bucket = bySku.get(sku) || {
      sku,
      rows: 0,
      bidDown: 0,
      pause: 0,
      spend30: 0,
      clicks30: 0,
      orders30: 0,
      rootCauses: new Set(),
      marketBuckets: new Set(),
      marketVerdicts: new Set(),
      habits: new Set(),
      examples: [],
      boundaries: new Set(),
    };
    bucket.rows += 1;
    if (row.actionType === 'pause') bucket.pause += 1;
    else bucket.bidDown += 1;
    bucket.spend30 += num(row.spend30);
    bucket.clicks30 += num(row.clicks30);
    bucket.orders30 += num(row.orders30);
    bucket.rootCauses.add(row.rootCause);
    bucket.habits.add(row.habit);
    if (row.marketBucket && row.marketBucket !== 'unclassified_low_efficiency_tail') {
      const market = marketByBucket.get(row.marketBucket) || {};
      bucket.marketBuckets.add(row.marketBucket);
      if (market.marketVerdict) bucket.marketVerdicts.add(market.marketVerdict);
      if (market.reopenBoundary) bucket.boundaries.add(market.reopenBoundary);
    } else {
      bucket.boundaries.add(habitBoundary(row.habit));
    }
    const traffic = text(row.text || row.campaignName);
    if (traffic && bucket.examples.length < 3) bucket.examples.push(traffic);
    bySku.set(sku, bucket);
  }

  const protectedBySku = new Map();
  for (const row of protectedRows) {
    const sku = inferSku(row);
    const bucket = protectedBySku.get(sku) || [];
    bucket.push(row);
    protectedBySku.set(sku, bucket);
  }

  return [...bySku.values()]
    .map(row => {
      const rootCauses = [...row.rootCauses];
      const marketVerdicts = [...row.marketVerdicts];
      const mainMarketVerdict = marketVerdicts.includes('market_fit_not_proven')
        ? 'market_fit_not_proven'
        : (marketVerdicts.includes('market_exists_but_broad_intent_competitive')
          ? 'market_exists_but_broad_intent_competitive'
          : (marketVerdicts[0] || 'none'));
      const protectedRowsForSku = protectedBySku.get(row.sku) || [];
      const route = rootCauses.includes('market_misjudgment_plus_bad_habit')
        ? actionByMarketVerdict(mainMarketVerdict)
        : 'bad_habit_stop_loss_monitor_regeneration';
      return {
        sku: row.sku,
        rows: row.rows,
        bidDown: row.bidDown,
        pause: row.pause,
        spend30: round(row.spend30),
        clicks30: round(row.clicks30, 0),
        orders30: round(row.orders30, 0),
        rootMix: rootCauses.join(', '),
        route,
        marketBuckets: shortList([...row.marketBuckets]),
        marketVerdicts: shortList(marketVerdicts),
        habits: shortList([...row.habits], 5),
        examples: row.examples,
        boundaries: shortList([...row.boundaries], 2),
        protectedRows: protectedRowsForSku.length,
        protectedExamples: protectedRowsForSku.slice(0, 2).map(item => `${item.kind}:${item.text}`),
      };
    })
    .sort((a, b) => b.spend30 - a.spend30 || b.rows - a.rows || a.sku.localeCompare(b.sku));
}

function quoteTerms(terms = []) {
  return terms.filter(Boolean).join(', ');
}

const MARKET_EVIDENCE_KINDS = ['ptm', 'conversion', 'aba'];

function marketEvidenceFilePath(businessDate, marketBucket, kind) {
  return path.join(ROOT, 'data', 'snapshots', `invalid_spend_market_evidence_${businessDate}_${marketBucket}_${kind}.json`);
}

function defaultReadEvidence(file) {
  if (!fs.existsSync(file)) return { exists: false, data: null };
  return { exists: true, data: readJson(file, null) };
}

function summarizeEvidenceDoc(doc = {}) {
  return {
    ok: doc.ok === true,
    rowCount: num(doc.rowCount),
    total: num(doc.total),
    missingCount: num(doc.coverage?.missingCount),
    freshness: doc.period?.freshness || '',
    period: doc.period?.weekDate || doc.period?.uTime || doc.period?.timePieceValue || '',
    operatorSummary: doc.operatorSummary || {},
  };
}

function nestedCount(source = {}, group, key) {
  return num(source?.operatorSummary?.[group]?.[key]);
}

function kindSummary(files = [], kind) {
  return (files.find(item => item.kind === kind) || {}).summary || {};
}

function deriveMarketVerdict(row = {}) {
  const files = row.evidenceFiles || [];
  const ptm = kindSummary(files, 'ptm');
  const conversion = kindSummary(files, 'conversion');
  const aba = kindSummary(files, 'aba');
  const ptmResearch = nestedCount(ptm, 'byRecommendedUse', 'research_only');
  const ptmRows = num(ptm.rowCount);
  const conversionRows = num(conversion.rowCount);
  const abaRows = num(aba.rowCount);
  const abaHighCompetition = nestedCount(aba, 'byCompetitionTier', 'high');
  const abaMediumCompetition = nestedCount(aba, 'byCompetitionTier', 'medium');
  const lowCost = nestedCount(conversion, 'byCostRisk', 'low');
  const highCost = nestedCount(conversion, 'byCostRisk', 'high');
  const candidateExact = nestedCount(conversion, 'byRecommendedUse', 'candidate_exact_or_phrase');
  const lowBidOnly = nestedCount(conversion, 'byRecommendedUse', 'low_bid_test_or_cross_check')
    + nestedCount(conversion, 'byRecommendedUse', 'observe_or_low_bid_test')
    + nestedCount(conversion, 'byRecommendedUse', 'cross_check_before_spend');
  const abaHold = nestedCount(aba, 'byRecommendedUse', 'hold_or_research_only')
    + nestedCount(aba, 'byRecommendedUse', 'research_only');
  const reasons = [];
  if (conversionRows <= 0) reasons.push('conversion_cost_layer_missing_or_zero');
  if (abaRows <= 0) reasons.push('aba_demand_layer_missing_or_zero');
  if (ptmRows > 0 && ptmResearch >= ptmRows * 0.5) reasons.push('ptm_research_only_dominates');
  if (abaRows > 0 && abaHighCompetition >= abaMediumCompetition) reasons.push('aba_high_competition_pressure');
  if (abaRows > 0 && abaHold >= abaRows * 0.4) reasons.push('aba_hold_or_research_share_high');
  if (lowCost > 0) reasons.push('some_low_cost_niche_terms_exist');
  if (highCost > 0) reasons.push('some_high_cost_terms_exist');
  if (candidateExact > 0) reasons.push('exact_or_phrase_candidate_exists');
  if (lowBidOnly > candidateExact) reasons.push('market_support_is_low_bid_or_cross_check_only');

  if (conversionRows <= 0 || abaRows <= 0) {
    return {
      marketVerdict: 'market_fit_not_proven',
      marketConfidence: 'high',
      marketDecision: 'keep_market_reopen_blocked',
      combinedFailureMode: 'market_fit_unproven_plus_spend_not_stopped',
      reopenBoundary: 'do_not_reopen_until_market_demand_cost_layer_and_own_exact_conversion_are_proven',
      marketVerdictReasons: reasons,
    };
  }
  if (row.marketBucket === 'wedding_broad_intent_competition_gap') {
    return {
      marketVerdict: 'market_exists_but_broad_intent_competitive',
      marketConfidence: 'medium',
      marketDecision: 'exact_or_phrase_only_after_sku_fit',
      combinedFailureMode: 'broad_intent_market_plus_generic_lane_kept_spending',
      reopenBoundary: 'block_generic_reopen; allow_only_exact_or_phrase_terms_with_own_conversion_or_clear_sku_fit',
      marketVerdictReasons: reasons,
    };
  }
  if (candidateExact > 0 || lowCost > 0) {
    return {
      marketVerdict: 'niche_market_exists_but_current_lane_too_broad',
      marketConfidence: 'medium',
      marketDecision: 'protect_exact_fit_only_no_generic_reopen',
      combinedFailureMode: 'niche_market_signal_plus_broad_or_expanded_lane_uncontrolled',
      reopenBoundary: 'block_auto_loose_substitutes_generic_broad_and_expanded_asin; exact_only_after_own_conversion_proof',
      marketVerdictReasons: reasons,
    };
  }
  return {
    marketVerdict: 'weak_or_scattered_market_signal',
    marketConfidence: 'medium',
    marketDecision: 'keep_reopen_blocked_pending_exact_proof',
    combinedFailureMode: 'scattered_market_signal_plus_low_efficiency_tail_not_stopped',
    reopenBoundary: 'no_reopen_without_exact_term_or_asin_conversion_and_recent_checkpoint_recovery',
    marketVerdictReasons: reasons,
  };
}

function marketEvidenceStatusForFiles(row = {}, { businessDate = BUSINESS_DATE, readEvidence = defaultReadEvidence } = {}) {
  const files = MARKET_EVIDENCE_KINDS.map(kind => {
    const file = marketEvidenceFilePath(businessDate, row.marketBucket, kind);
    const loaded = readEvidence(file, kind, row) || {};
    return {
      kind,
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      exists: !!loaded.exists,
      summary: loaded.exists ? summarizeEvidenceDoc(loaded.data || {}) : {},
    };
  });
  const missing = files.filter(item => !item.exists);
  const failed = files.filter(item => item.exists && item.summary.ok !== true);
  const zeroRows = files.filter(item => item.exists && item.summary.ok === true && item.summary.rowCount <= 0);
  const partialCoverage = files.filter(item => item.exists && item.summary.ok === true && item.summary.missingCount > 0);
  const evidenceReasons = [];
  if (missing.length) evidenceReasons.push(`missing files: ${missing.map(item => item.kind).join(', ')}`);
  if (failed.length) evidenceReasons.push(`failed files: ${failed.map(item => item.kind).join(', ')}`);
  if (zeroRows.length) evidenceReasons.push(`zero-row evidence: ${zeroRows.map(item => item.kind).join(', ')}`);
  if (partialCoverage.length) evidenceReasons.push(`partial coverage: ${partialCoverage.map(item => `${item.kind}:${item.summary.missingCount}`).join(', ')}`);

  let evidenceStatus = 'evidence_ready';
  if (missing.length) evidenceStatus = 'required_missing';
  else if (failed.length) evidenceStatus = 'needs_review';
  else if (zeroRows.length || partialCoverage.length) evidenceStatus = 'evidence_ready_with_gaps';

  return {
    evidenceStatus,
    evidenceFiles: files,
    evidenceSummary: {
      requiredFiles: files.length,
      presentFiles: files.filter(item => item.exists).length,
      okFiles: files.filter(item => item.summary.ok === true).length,
      zeroRowFiles: zeroRows.length,
      partialCoverageFiles: partialCoverage.length,
    },
    evidenceReasons,
    ...deriveMarketVerdict({ ...row, evidenceFiles: files }),
  };
}

function attachMarketEvidenceStatus(plan = [], options = {}) {
  return plan.map(row => ({ ...row, ...marketEvidenceStatusForFiles(row, options) }));
}

function isAutoBucketLabel(value) {
  return /^(close-match|loose-match|substitutes|complements)$/i.test(text(value));
}

function marketEvidenceSeeds(rows = []) {
  const byBucket = new Map();
  for (const row of rows) {
    const bucketKey = text(row.marketBucket);
    if (!bucketKey || bucketKey === 'unclassified_low_efficiency_tail') continue;
    const bucket = byBucket.get(bucketKey) || {
      marketBucket: bucketKey,
      rows: 0,
      spend30: 0,
      clicks30: 0,
      orders30: 0,
      skus: new Map(),
      terms: new Map(),
      asinTargets: new Map(),
    };
    bucket.rows += 1;
    bucket.spend30 += num(row.spend30);
    bucket.clicks30 += num(row.clicks30);
    bucket.orders30 += num(row.orders30);
    const sku = inferSku(row);
    if (sku) bucket.skus.set(sku, (bucket.skus.get(sku) || 0) + num(row.spend30));
    const traffic = text(row.text);
    if (traffic && !/^asin/i.test(traffic) && !isAutoBucketLabel(traffic)) {
      bucket.terms.set(traffic, (bucket.terms.get(traffic) || 0) + num(row.spend30));
    }
    const asinMatch = traffic.match(/B[A-Z0-9]{9}/i);
    if (asinMatch) bucket.asinTargets.set(asinMatch[0].toUpperCase(), (bucket.asinTargets.get(asinMatch[0].toUpperCase()) || 0) + num(row.spend30));
    byBucket.set(bucketKey, bucket);
  }
  return [...byBucket.values()]
    .map(bucket => {
      const topTerms = [...bucket.terms.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(([term]) => term);
      const topSkus = [...bucket.skus.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([sku]) => sku);
      const topAsins = [...bucket.asinTargets.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(([asin]) => asin);
      const seedTerms = topTerms.length ? topTerms : [bucket.marketBucket.replace(/_/g, ' ')];
      return {
        ...bucket,
        spend30: round(bucket.spend30),
        clicks30: round(bucket.clicks30, 0),
        orders30: round(bucket.orders30, 0),
        topSkus,
        topTerms,
        topAsins,
        evidenceStatus: 'required_missing',
        requiredEvidence: [
          'Product Time Machine traffic ownership and bought-history fit',
          'keyword conversion economics or explicit missing-cost gap',
          'ABA/search demand or seasonality where relevant',
          'own exact term or ASIN conversion proof before any reopen',
        ],
        commands: [
          `npm run ops:selection:product-time-machine -- --search-keywords "${quoteTerms(seedTerms)}"`,
          `npm run ops:selection:keyword-conversion -- --keywords "${quoteTerms(seedTerms)}"`,
          `npm run ops:selection:aba-search-terms -- --keywords "${quoteTerms(seedTerms)}"`,
        ],
        reopenGate: 'blocked_until_market_evidence_plus_exact_conversion',
      };
    })
    .sort((a, b) => b.spend30 - a.spend30 || b.rows - a.rows || a.marketBucket.localeCompare(b.marketBucket));
}

function buildReview({ businessDate = BUSINESS_DATE } = {}) {
  const queueFile = path.join(ROOT, 'data', 'actions', `invalid_spend_hard_stop_queue_${businessDate}.json`);
  const checkpointFile = path.join(ROOT, 'data', 'tasks', `invalid_spend_checkpoint_${businessDate}_asof_${businessDate}.json`);
  const queue = readJson(queueFile, {});
  const checkpoint = readJson(checkpointFile, {});
  const rows = Array.isArray(queue.rows) ? queue.rows : [];
  const classifiedRows = rows.map(row => ({ ...row, ...classifyQueueRow(row) }));
  const protectedRows = protectedExplorationRows(checkpoint);
  const residuals = hardResidualRows(checkpoint);
  const summary = summarizeRows(classifiedRows, classifyQueueRow);
  const marketMisjudgmentRows = classifiedRows.filter(row => row.rootCause === 'market_misjudgment_plus_bad_habit');
  const badHabitOnlyRows = classifiedRows.filter(row => row.rootCause === 'bad_habit_only');
  const marketEvidencePlan = attachMarketEvidenceStatus(marketEvidenceSeeds(marketMisjudgmentRows), { businessDate });
  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    sourceFiles: {
      queue: path.relative(ROOT, queueFile).replace(/\\/g, '/'),
      checkpoint: path.relative(ROOT, checkpointFile).replace(/\\/g, '/'),
    },
    totals: {
      hardStopRows: classifiedRows.length,
      protectedExplorationRows: protectedRows.length,
      hardResidualRows: residuals.length,
      marketMisjudgmentRows: marketMisjudgmentRows.length,
      badHabitOnlyRows: badHabitOnlyRows.length,
    },
    summary,
    marketEvidencePlan,
    skuActionMap: buildSkuActionMap({ classifiedRows, protectedRows, marketEvidencePlan }),
    protectedExploration: protectedRows,
    protectedReviewLevels: countBy(protectedRows, 'reviewLevel'),
    hardResiduals: residuals,
    topMarketMisjudgmentSkus: summarizeRows(marketMisjudgmentRows, classifyQueueRow).topSkus.slice(0, 15),
    topBadHabitOnlySkus: summarizeRows(badHabitOnlyRows, classifyQueueRow).topSkus.slice(0, 15),
    actionBoundaries: [
      {
        class: 'backend_blocked_hard_waste',
        action: 'retry narrowly after cooldown; do not broaden the cut because one row is blocked',
      },
      {
        class: 'bad_habit_only',
        action: 'keep the stop-loss result; reopen only after recent conversion proof at the same row or exact traffic lane',
      },
      {
        class: 'market_misjudgment_plus_bad_habit',
        action: 'do not auto-reopen generic, broad, loose, substitutes, ASIN-expanded, or SBV/SB lanes; require fresh market proof plus exact term or ASIN conversion',
      },
      {
        class: 'protected_exploration',
        action: 'monitor 3d/7d display, click, and order trend; cut only if the protected row itself turns into renewed hard waste',
      },
    ],
  };
}

function writeSkuActionMap(report, file) {
  const rows = report.skuActionMap || [];
  const protectedRows = report.protectedExploration || [];
  const marketRows = rows.filter(row => row.rootMix.includes('market_misjudgment_plus_bad_habit'));
  const habitRows = rows.filter(row => !row.rootMix.includes('market_misjudgment_plus_bad_habit'));
  const lines = [
    `# ${report.businessDate} SKU Market/Habit Action Map`,
    '',
    '## Purpose',
    '',
    'This file maps invalid-spend controls back to SKU, bad habit, market verdict, and reopen boundary.',
    'Use it for 3d/7d review. It is not permission to reopen broad, loose, substitutes, expanded ASIN, or generic SB/SBV traffic.',
    '',
    '## Current State',
    '',
    `- Hard stop rows: ${report.totals.hardStopRows}`,
    `- Market misjudgment plus bad habit rows: ${report.totals.marketMisjudgmentRows}`,
    `- Bad habit only rows: ${report.totals.badHabitOnlyRows}`,
    `- Protected exploration rows: ${report.totals.protectedExplorationRows}`,
    `- Backend-blocked hard residual rows: ${report.totals.hardResidualRows}`,
    '',
    '## Highest Priority Market/Habit SKUs',
    '',
    '| SKU | 30d spend | Rows | Route | Market verdicts | Market buckets | Habits | Examples | Reopen boundary | Protected rows |',
    '|---|---:|---:|---|---|---|---|---|---|---:|',
  ];
  for (const row of marketRows.slice(0, 25)) {
    lines.push(`| ${row.sku} | ${row.spend30} | ${row.rows} | ${row.route} | ${row.marketVerdicts || 'none'} | ${row.marketBuckets || 'none'} | ${row.habits} | ${row.examples.join('; ')} | ${row.boundaries} | ${row.protectedRows} |`);
  }
  lines.push(
    '',
    '## Highest Priority Bad-Habit-Only SKUs',
    '',
    '| SKU | 30d spend | Rows | Route | Habits | Examples | Boundary | Protected rows |',
    '|---|---:|---:|---|---|---|---|---:|',
  );
  for (const row of habitRows.slice(0, 25)) {
    lines.push(`| ${row.sku} | ${row.spend30} | ${row.rows} | ${row.route} | ${row.habits} | ${row.examples.join('; ')} | ${row.boundaries} | ${row.protectedRows} |`);
  }
  lines.push(
    '',
    '## Market Bucket Reopen Boundaries',
    '',
    '| Market bucket | Verdict | 30d spend | Top SKUs | Boundary |',
    '|---|---|---:|---|---|',
  );
  for (const row of report.marketEvidencePlan || []) {
    lines.push(`| ${row.marketBucket} | ${row.marketVerdict || ''} | ${row.spend30} | ${row.topSkus.join(', ')} | ${row.reopenBoundary || row.reopenGate} |`);
  }
  lines.push(
    '',
    '## Protected Exploration Rows',
    '',
    '| SKU | Layer | Traffic | Review level | Spend7 | Orders7 | ACOS7 | Spend30 | Orders30 | ACOS30 | Trigger |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  );
  for (const row of protectedRows.slice(0, 30)) {
    lines.push(`| ${row.sku} | ${row.kind} | ${row.text} | ${row.reviewLevel} | ${row.spend7} | ${row.orders7} | ${pct(row.acos7)} | ${row.spend30} | ${row.orders30} | ${pct(row.acos30)} | ${row.checkpointTrigger} |`);
  }
  lines.push(
    '',
    '## Checkpoint Use',
    '',
    '- At 3d, first confirm bad-habit-only spend has not regenerated in the same lower-layer habit.',
    '- At 3d/7d, keep market-misjudged buckets blocked unless exact term or ASIN conversion plus market proof both exist.',
    '- Protected rows are the anti-misfire set: if their impressions, clicks, or orders collapse, review exact-row restore before any broader cut.',
    '- The goal is not complete until checkpoint completion audit reports `complete_candidate_verified`.',
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function writeMarkdown(report, file) {
  const lines = [
    `# Invalid Spend Root-Cause Review - ${report.businessDate}`,
    '',
    '## Totals',
    '',
    `- Hard stop rows: ${report.totals.hardStopRows}`,
    `- Market misjudgment plus bad habit rows: ${report.totals.marketMisjudgmentRows}`,
    `- Bad habit only rows: ${report.totals.badHabitOnlyRows}`,
    `- Protected exploration rows: ${report.totals.protectedExplorationRows}`,
    `- Backend-blocked hard residual rows: ${report.totals.hardResidualRows}`,
    '',
    '## Root Cause Split',
    '',
    '| Root cause | Rows | Bid-down | Pause | 30d spend | Clicks | Orders | SKU count |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.summary.byRootCause) {
    lines.push(`| ${row.key} | ${row.rows} | ${row.bidDown} | ${row.pause} | ${row.spend30} | ${row.clicks30} | ${row.orders30} | ${row.skuCount} |`);
  }
  lines.push('', '## Habit Buckets', '', '| Habit | Rows | 30d spend | Clicks | Orders | Examples |', '|---|---:|---:|---:|---:|---|');
  for (const row of report.summary.byHabit.slice(0, 15)) {
    lines.push(`| ${row.key} | ${row.rows} | ${row.spend30} | ${row.clicks30} | ${row.orders30} | ${row.examples.join('; ')} |`);
  }
  lines.push('', '## Market Misjudgment Buckets', '', '| Market bucket | Rows | 30d spend | Clicks | Orders | Examples |', '|---|---:|---:|---:|---:|---|');
  for (const row of report.summary.byMarketBucket.filter(item => item.key !== 'unclassified_low_efficiency_tail').slice(0, 15)) {
    lines.push(`| ${row.key} | ${row.rows} | ${row.spend30} | ${row.clicks30} | ${row.orders30} | ${row.examples.join('; ')} |`);
  }
  lines.push('', '## Top Market-Misjudged SKUs', '', '| SKU | Rows | 30d spend | Root causes | Market buckets | Habits | Examples |', '|---|---:|---:|---|---|---|---|');
  for (const row of report.topMarketMisjudgmentSkus) {
    lines.push(`| ${row.key} | ${row.rows} | ${row.spend30} | ${row.rootCauses.join(', ')} | ${row.marketBuckets.join(', ')} | ${row.habits.join(', ')} | ${row.examples.join('; ')} |`);
  }
  lines.push('', '## Market Evidence Plan', '', '| Market bucket | Status | Verdict | Rows | 30d spend | Top SKUs | Seed terms | Evidence notes | Reopen boundary |', '|---|---|---|---:|---:|---|---|---|---|');
  for (const row of report.marketEvidencePlan) {
    lines.push(`| ${row.marketBucket} | ${row.evidenceStatus} | ${row.marketVerdict || ''} | ${row.rows} | ${row.spend30} | ${row.topSkus.join(', ')} | ${row.topTerms.join('; ') || row.marketBucket.replace(/_/g, ' ')} | ${(row.evidenceReasons || []).join('; ') || 'ok'} | ${row.reopenBoundary || row.reopenGate} |`);
  }
  lines.push('', 'Market evidence commands:', '');
  for (const row of report.marketEvidencePlan.slice(0, 10)) {
    lines.push(`- ${row.marketBucket}:`);
    for (const command of row.commands) lines.push(`  - \`${command}\``);
  }
  lines.push('', '## Protected Review Levels', '', '| Review level | Rows |', '|---|---:|');
  for (const row of report.protectedReviewLevels) {
    lines.push(`| ${row.key} | ${row.rows} |`);
  }
  lines.push('', '## Protected Exploration Guardrail', '', '| SKU | Layer | Traffic | Level | Impr7 | Clicks7 | Spend7 | Orders7 | ACOS7 | Impr30 | Clicks30 | Spend30 | Orders30 | ACOS30 | Trigger |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const row of report.protectedExploration.slice(0, 20)) {
    lines.push(`| ${row.sku} | ${row.kind} | ${row.text} | ${row.reviewLevel} | ${row.impressions7} | ${row.clicks7} | ${row.spend7} | ${row.orders7} | ${pct(row.acos7)} | ${row.impressions30} | ${row.clicks30} | ${row.spend30} | ${row.orders30} | ${pct(row.acos30)} | ${row.checkpointTrigger} |`);
  }
  lines.push('', '## Hard Residuals', '', '| SKU | Layer | Entity | Traffic | Action | Signal | Next action |', '|---|---|---|---|---|---|---|');
  for (const row of report.hardResiduals) {
    lines.push(`| ${row.sku} | ${row.kind} | ${row.entityId} | ${row.text} | ${row.proposedAction || ''} ${row.currentBid ?? ''}->${row.proposedBid ?? ''} | ${row.signal || ''} | ${row.nextAction} |`);
  }
  if (!report.hardResiduals.length) lines.push('| none | | | | | | |');
  lines.push('', '## Action Boundaries', '');
  for (const row of report.actionBoundaries) {
    lines.push(`- ${row.class}: ${row.action}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const report = buildReview();
  writeJson(OUT_FILE, report);
  writeMarkdown(report, OUT_MD);
  writeSkuActionMap(report, OUT_SKU_ACTION_MAP);
  console.log(JSON.stringify({
    outputFile: path.relative(ROOT, OUT_FILE).replace(/\\/g, '/'),
    markdownFile: path.relative(ROOT, OUT_MD).replace(/\\/g, '/'),
    skuActionMapFile: path.relative(ROOT, OUT_SKU_ACTION_MAP).replace(/\\/g, '/'),
    totals: report.totals,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  attachMarketEvidenceStatus,
  buildReview,
  classifyQueueRow,
  classifyProtectedExploration,
  deriveMarketVerdict,
  hardResidualRows,
  inferSku,
  isAutoBucketLabel,
  buildSkuActionMap,
  marketEvidenceStatusForFiles,
  marketEvidenceSeeds,
  protectedExplorationRows,
  summarizeRows,
};
