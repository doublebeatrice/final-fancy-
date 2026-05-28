function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, fallback = null) {
  const n = num(value, fallback);
  if (n === null || n === undefined) return fallback;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function unique(items = []) {
  return [...new Set(items.map(text).filter(Boolean))];
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,\n;]+/).map(text).filter(Boolean);
}

function termKey(value) {
  return lower(value)
    .replace(/[\[\]"']/g, '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value) {
  return termKey(value).split(/\s+/).filter(Boolean);
}

function firstValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function firstNumber(row = {}, keys = [], fallback = null) {
  return num(firstValue(row, keys), fallback);
}

function firstPct(row = {}, keys = [], fallback = null) {
  return pct(firstValue(row, keys), fallback);
}

function countBy(rows = [], field) {
  return rows.reduce((acc, row) => {
    const key = text(row[field] || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function clamp(value, min = 0, max = 1) {
  const n = num(value, 0);
  return Math.max(min, Math.min(max, n));
}

function termLayerCount(row = {}) {
  return [
    row.keywordResearch,
    row.abaSearchTerm,
    row.keywordSeasonality,
    row.productTimeMachine && row.productTimeMachine.length,
    row.keywordConversion,
  ].filter(Boolean).length;
}

function keywordResearchCounts(row = {}) {
  const research = row.keywordResearch || {};
  return {
    directCompetitors: num(research.directCompetitors, 0),
    sceneCompetitors: num(research.sceneCompetitors, 0),
    trafficBridgeCompetitors: num(research.trafficBridgeCompetitors, 0),
    excluded: num(research.excluded, 0),
  };
}

function productTimeMachineRows(row = {}) {
  if (Array.isArray(row.productTimeMachine)) return row.productTimeMachine;
  if (row.productTimeMachine) return [row.productTimeMachine];
  return [];
}

function safeSourceRows(source = {}) {
  return source && typeof source.rows === 'object' && source.rows !== null ? source.rows : {};
}

function safeQueryRows(source = {}) {
  return source && typeof source.queryRows === 'object' && source.queryRows !== null ? source.queryRows : {};
}

function termsFromSource(source = {}, key = '') {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source.rows)) {
    return source.rows.map(row => {
      if (!row || typeof row !== 'object') return '';
      if (key === 'productTimeMachine') return termKey(row.searchKeyword || row.keyword || row.searchTerm || row.term);
      if (key === 'keywordConversion') return termKey(row.keyword || row.searchTerm || row.term);
      if (key === 'abaSearchTerms' || key === 'keywordSeasonality') return termKey(row.searchTerm || row.keyword || row.term);
      if (key === 'extendedSelection') return termKey(row.asin || row.keyword || row.searchTerm || row.term);
      return termKey(row.term || row.searchTerm || row.keyword);
    }).filter(Boolean);
  }
  return Object.keys(safeSourceRows(source)).map(termKey).filter(Boolean);
}

function deriveTerms(options = {}) {
  const explicit = list(options.terms || options.searchTerms || options.keywords);
  const terms = [...explicit.map(termKey).filter(Boolean)];
  for (const row of Array.isArray(options.evidenceRows) ? options.evidenceRows : []) {
    const term = termKey(row.term || row.searchTerm || row.keyword);
    if (term) terms.push(term);
  }
  const selectionReports = options.selectionReports || {};
  for (const source of [
    ['keywordResearch', selectionReports.keywordResearch],
    ['keywordConversion', selectionReports.keywordConversion],
    ['abaSearchTerms', selectionReports.abaSearchTerms],
    ['keywordSeasonality', selectionReports.keywordSeasonality],
    ['productTimeMachine', selectionReports.productTimeMachine],
  ]) {
    const [key, report] = source;
    for (const term of termsFromSource(report, key)) terms.push(term);
    for (const key of Object.keys(safeQueryRows(report))) terms.push(termKey(key));
  }
  return unique(terms);
}

function evidenceRowsFromSelectionReports(options = {}) {
  const selectionReports = options.selectionReports || {};
  const keywordResearch = selectionReports.keywordResearch || {};
  const keywordConversion = selectionReports.keywordConversion || {};
  const abaSearchTerms = selectionReports.abaSearchTerms || {};
  const keywordSeasonality = selectionReports.keywordSeasonality || {};
  const productTimeMachine = selectionReports.productTimeMachine || {};
  return deriveTerms(options).map(term => ({
    term,
    keywordResearch: safeSourceRows(keywordResearch)[term] || null,
    keywordConversion: safeSourceRows(keywordConversion)[term] || null,
    abaSearchTerm: safeSourceRows(abaSearchTerms)[term] || safeQueryRows(abaSearchTerms)[term] || null,
    keywordSeasonality: safeSourceRows(keywordSeasonality)[term] || null,
    productTimeMachine: safeSourceRows(productTimeMachine)[term] || [],
  }));
}

function avg(values = []) {
  const clean = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + Number(value), 0) / clean.length;
}

function productTimeMachineSummary(evidenceRows = []) {
  const rows = evidenceRows.flatMap(productTimeMachineRows);
  const trafficMix = countBy(rows, 'trafficMix');
  const demandTier = countBy(rows, 'demandTier');
  const topAsins = rows
    .filter(row => row.asin)
    .sort((a, b) =>
      num(b.boughtInPastMonthLowerBound, 0) - num(a.boughtInPastMonthLowerBound, 0) ||
      num(b.trafficTerms?.total, 0) - num(a.trafficTerms?.total, 0)
    )
    .slice(0, 8)
    .map(row => ({
      asin: text(row.asin),
      keyword: text(row.searchKeyword),
      demandTier: text(row.demandTier),
      trafficMix: text(row.trafficMix),
      boughtInPastMonthLowerBound: num(row.boughtInPastMonthLowerBound, 0),
      organicFlowShare: num(row.organicFlowShare, null),
      aoVal: num(row.aoVal, null),
      trafficTerms: row.trafficTerms || {},
    }));
  return {
    rowCount: rows.length,
    byTrafficMix: trafficMix,
    byDemandTier: demandTier,
    avgPrice: avg(rows.map(row => num(row.price, null))),
    avgReviewCount: avg(rows.map(row => num(row.reviewCount, null))),
    avgAoVal: avg(rows.map(row => num(row.aoVal, null))),
    topAsins,
  };
}

function sourceCoverage(evidenceRows = []) {
  const coverage = {
    terms: evidenceRows.length,
    keywordResearch: 0,
    aba: 0,
    seasonality: 0,
    productTimeMachine: 0,
    conversion: 0,
  };
  for (const row of evidenceRows) {
    if (row.keywordResearch) coverage.keywordResearch += 1;
    if (row.abaSearchTerm) coverage.aba += 1;
    if (row.keywordSeasonality) coverage.seasonality += 1;
    if (productTimeMachineRows(row).length) coverage.productTimeMachine += 1;
    if (row.keywordConversion) coverage.conversion += 1;
  }
  coverage.totalMatches = coverage.keywordResearch + coverage.aba + coverage.seasonality + coverage.productTimeMachine + coverage.conversion;
  coverage.sourceCount = ['keywordResearch', 'aba', 'seasonality', 'productTimeMachine', 'conversion']
    .filter(key => coverage[key] > 0).length;
  return coverage;
}

function addModel(models, model) {
  if (!model.key) return;
  const existing = models.find(item => item.key === model.key && item.term === model.term);
  if (existing) {
    existing.score = Math.max(existing.score, model.score);
    existing.evidence = unique([...(existing.evidence || []), ...(model.evidence || [])]);
    return;
  }
  models.push({
    key: model.key,
    label: model.label || model.key,
    term: model.term || '',
    score: clamp(model.score ?? 0.5),
    meaning: text(model.meaning),
    evidence: unique(model.evidence || []),
    actionBoundary: model.actionBoundary || 'read_only_evidence',
  });
}

function buildOpportunityModels(evidenceRows = [], options = {}) {
  const models = [];
  const profile = options.productProfile || {};
  const productType = text(profile.productType || profile.positioning || options.card?.saleStatus);
  for (const row of evidenceRows) {
    const term = termKey(row.term);
    const aba = row.abaSearchTerm || {};
    const seasonality = row.keywordSeasonality || {};
    const conversion = row.keywordConversion || {};
    const research = keywordResearchCounts(row);
    const ptmRows = productTimeMachineRows(row);
    const ptmHighDemand = ptmRows.filter(item => item.demandTier === 'high').length;
    const ptmAdLed = ptmRows.filter(item => ['ad_led', 'ad_augmented'].includes(item.trafficMix)).length;
    const rank = firstNumber(aba, ['rank', 'abaRank', 'searchRank']);
    const searchVolume = firstNumber(aba, ['searchVolume', 'monthlySearchVolume']);
    const aoValue = firstNumber(aba, ['aoValue', 'aoVal', 'ao']);
    const brandMonopoly = firstPct(aba, ['brandMonopoly', 'brandMonopolyRate', 'brandMonopolyCoefficient']);
    const sellerMonopoly = firstPct(aba, ['sellerMonopoly', 'sellerMonopolyRate', 'sellerMonopolyCoefficient']);
    const clickShare = firstPct(aba, ['totalClickShare', 'top3ClickShare', 'clickConcentration']);
    const conversionShare = firstPct(aba, ['totalConversionShare', 'top3ConversionShare', 'conversionConcentration']);
    const productCount = firstNumber(aba, ['productCount', 'sellingProductCount', 'totalProducts', 'asinCount']);
    const supplyDemand = firstNumber(aba, ['supplyDemand', 'supplyDemandIndex', 'supplyDemandRatio']);
    const newProductShare = firstPct(aba, ['newProductShare', 'newAsinShare']);
    const newProductSalesShare = firstPct(aba, ['newProductSalesShare', 'newProductSalesRatio']);
    const avgPrice = firstNumber(aba, ['avgPrice', 'averagePrice', 'productAveragePrice']);
    const avgRating = firstNumber(aba, ['avgRating', 'averageRating']);
    const avgReviewCount = firstNumber(aba, ['avgReviewCount', 'averageReviewCount', 'reviewAvg']);
    const aPlusRate = firstPct(aba, ['aPlusRate', 'aPlusShare']);
    const videoRate = firstPct(aba, ['videoRate', 'videoShare']);
    const fbmShare = firstPct(aba, ['fbmShare', 'fbmRate']);
    const chinaSellerShare = firstPct(aba, ['chinaSellerShare', 'cnSellerShare']);
    const amazonSelfShare = firstPct(aba, ['amazonSelfShare', 'amazonShare']);
    const keywordType = lower(aba.keywordType || aba.type);
    const marketCycle = lower(aba.marketCycle || seasonality.seasonalityType);
    const googleDirection = lower(seasonality.googleTrend?.direction);
    const conversionQuality = lower(conversion.marketQuality);

    if (research.directCompetitors + research.sceneCompetitors + research.trafficBridgeCompetitors > 0) {
      addModel(models, {
        key: 'front_competitor_validated',
        label: 'front-search competitor evidence',
        term,
        score: Math.min(1, 0.45 + (research.directCompetitors * 0.18) + (research.sceneCompetitors * 0.1)),
        meaning: 'Amazon front-search has buyer-intent competitors or bridge products for this direction.',
        evidence: [
          `direct=${research.directCompetitors}`,
          `scene=${research.sceneCompetitors}`,
          `bridge=${research.trafficBridgeCompetitors}`,
        ],
      });
    }

    if (rank !== null && rank <= 100000 && (aoValue === null || aoValue <= 0.2) && (brandMonopoly === null || brandMonopoly <= 0.5) && (clickShare === null || clickShare <= 0.5)) {
      addModel(models, {
        key: 'low_monopoly_market',
        label: 'low-monopoly market',
        term,
        score: 0.82,
        meaning: 'Demand is visible while ad pressure or top-brand concentration is not excessive.',
        evidence: [`rank=${rank}`, aoValue !== null ? `ao=${aoValue}` : '', brandMonopoly !== null ? `brandMonopoly=${brandMonopoly}` : '', clickShare !== null ? `topClickShare=${clickShare}` : ''],
      });
    }

    if ((rank !== null && rank <= 400000 && productCount !== null && productCount <= 1000) || (supplyDemand !== null && supplyDemand <= 0.05 && searchVolume !== null && searchVolume > 0)) {
      addModel(models, {
        key: 'low_supply_market',
        label: 'low-supply market',
        term,
        score: productCount !== null && productCount <= 1000 ? 0.76 : 0.66,
        meaning: 'Demand-to-supply shape may be more open than broad markets.',
        evidence: [rank !== null ? `rank=${rank}` : '', productCount !== null ? `productCount=${productCount}` : '', supplyDemand !== null ? `supplyDemand=${supplyDemand}` : ''],
      });
    }

    if ((newProductShare !== null && newProductShare >= 0.15) || (newProductSalesShare !== null && newProductSalesShare >= 0.15)) {
      addModel(models, {
        key: 'new_product_survival',
        label: 'new-product survival room',
        term,
        score: Math.max(newProductShare || 0, newProductSalesShare || 0),
        meaning: 'Recent listings have measurable share, so a new or refreshed SKU may have room to prove itself.',
        evidence: [newProductShare !== null ? `newProductShare=${newProductShare}` : '', newProductSalesShare !== null ? `newProductSalesShare=${newProductSalesShare}` : ''],
      });
    }

    if (marketCycle.includes('season') || marketCycle.includes('strong_seasonal') || num(seasonality.quarterRatio, 0) >= 1.8) {
      addModel(models, {
        key: 'seasonal_window',
        label: 'seasonal or event-window market',
        term,
        score: Math.min(1, Math.max(0.55, num(seasonality.quarterRatio, 1) / 3)),
        meaning: 'Timing matters; judge preheat, peak, tail, and clearance separately.',
        evidence: [seasonality.seasonalityType ? `seasonality=${seasonality.seasonalityType}` : '', seasonality.peakQuarter ? `peak=${seasonality.peakQuarter}` : '', seasonality.quarterRatio ? `quarterRatio=${seasonality.quarterRatio}` : ''],
      });
    }

    if (keywordType.includes('rising') || keywordType.includes('new') || googleDirection === 'rising' || marketCycle.includes('growth')) {
      addModel(models, {
        key: 'trend_or_new_market',
        label: 'trend or new market',
        term,
        score: 0.7,
        meaning: 'The direction deserves follow-up because demand may be expanding or newly visible.',
        evidence: [keywordType ? `keywordType=${keywordType}` : '', googleDirection ? `googleTrend=${googleDirection}` : '', marketCycle ? `marketCycle=${marketCycle}` : ''],
      });
    }

    if ((avgPrice !== null && avgPrice >= 30) || avg(ptmRows.map(item => num(item.price, null))) >= 30) {
      addModel(models, {
        key: 'price_room',
        label: 'price-room market',
        term,
        score: 0.62,
        meaning: 'Average price is high enough to review margin and product differentiation before spend.',
        evidence: [avgPrice !== null ? `avgPrice=${avgPrice}` : '', ptmRows.length ? `ptmAvgPrice=${avg(ptmRows.map(item => num(item.price, null)))?.toFixed(2)}` : ''],
      });
    }

    if ((aPlusRate !== null && aPlusRate <= 0.4) || (videoRate !== null && videoRate <= 0.3)) {
      addModel(models, {
        key: 'listing_quality_gap',
        label: 'listing-quality gap',
        term,
        score: 0.65,
        meaning: 'Competitor listing maturity is not uniformly high; page quality can be a product/listing lever.',
        evidence: [aPlusRate !== null ? `aPlusRate=${aPlusRate}` : '', videoRate !== null ? `videoRate=${videoRate}` : ''],
        actionBoundary: 'listing_repair_or_product_fit_before_ad_scale',
      });
    }

    if (avgRating !== null && avgRating < 3.7 && (searchVolume === null || searchVolume >= 10000 || num(aba.estimatedOrders, 0) >= 1000)) {
      addModel(models, {
        key: 'review_upgrade_opportunity',
        label: 'review-upgrade opportunity',
        term,
        score: 0.68,
        meaning: 'Sales/demand exists but rating is weak, so product improvement may matter more than ad pressure.',
        evidence: [`avgRating=${avgRating}`, searchVolume !== null ? `searchVolume=${searchVolume}` : '', aba.estimatedOrders ? `estimatedOrders=${aba.estimatedOrders}` : ''],
        actionBoundary: 'product_repair_first',
      });
    }

    if ((fbmShare !== null && fbmShare >= 0.4) || (chinaSellerShare !== null && chinaSellerShare <= 0.3) || (amazonSelfShare !== null && amazonSelfShare <= 0.1)) {
      addModel(models, {
        key: 'seller_type_opening',
        label: 'seller-type opening',
        term,
        score: 0.58,
        meaning: 'Seller mix suggests a possible entry angle, especially for differentiated or local-style products.',
        evidence: [fbmShare !== null ? `fbmShare=${fbmShare}` : '', chinaSellerShare !== null ? `chinaSellerShare=${chinaSellerShare}` : '', amazonSelfShare !== null ? `amazonSelfShare=${amazonSelfShare}` : ''],
      });
    }

    if (words(term).length >= 3) {
      addModel(models, {
        key: 'long_tail_precision',
        label: 'long-tail precision',
        term,
        score: 0.55,
        meaning: 'The term is specific enough to use as a precise validation lane if product fit is real.',
        evidence: [`wordCount=${words(term).length}`, productType ? `productType=${productType}` : ''],
      });
    }

    if (ptmRows.length) {
      addModel(models, {
        key: 'competitor_traffic_map',
        label: 'competitor traffic map',
        term,
        score: Math.min(1, 0.5 + ptmHighDemand * 0.08 + ptmAdLed * 0.05),
        meaning: 'Product Time Machine gives competitor demand, organic rank, and traffic-structure evidence.',
        evidence: [`rows=${ptmRows.length}`, `highDemand=${ptmHighDemand}`, `adLedOrAugmented=${ptmAdLed}`],
      });
    }

    if (conversionQuality.includes('usable') || conversionQuality.includes('strong')) {
      addModel(models, {
        key: 'conversion_economics_usable',
        label: 'usable conversion economics',
        term,
        score: conversion.costRisk === 'low' ? 0.72 : 0.6,
        meaning: 'Keyword conversion economics are usable enough for controlled validation, subject to SKU fit.',
        evidence: [`marketQuality=${conversion.marketQuality}`, conversion.costRisk ? `costRisk=${conversion.costRisk}` : ''],
      });
    }
  }
  return models.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function riskSignalsForModels(models = [], evidenceRows = []) {
  const signals = [];
  const coverage = sourceCoverage(evidenceRows);
  if (coverage.terms > 0 && coverage.keywordResearch === 0) signals.push('front_search_competitor_gap');
  if (coverage.terms > 0 && coverage.productTimeMachine === 0) signals.push('competitor_traffic_map_gap');
  if (coverage.sourceCount < 3) signals.push('selection_stack_partial');
  for (const row of evidenceRows) {
    const aba = row.abaSearchTerm || {};
    const ptmRows = productTimeMachineRows(row);
    const clickShare = firstPct(aba, ['totalClickShare', 'top3ClickShare', 'clickConcentration']);
    const conversionShare = firstPct(aba, ['totalConversionShare', 'top3ConversionShare', 'conversionConcentration']);
    const avgReviewCount = firstNumber(aba, ['avgReviewCount', 'averageReviewCount', 'reviewAvg']);
    const avgRating = firstNumber(aba, ['avgRating', 'averageRating']);
    if ((clickShare !== null && clickShare >= 0.6) || (conversionShare !== null && conversionShare >= 0.6)) signals.push('top_asin_concentration_high');
    if (avgReviewCount !== null && avgReviewCount >= 1000 && avgRating !== null && avgRating >= 4.4) signals.push('review_threshold_high');
    if (ptmRows.some(item => item.trafficMix === 'ad_led' || num(item.aoVal, 0) >= 1)) signals.push('competitor_ad_pressure_high');
  }
  if (models.some(model => model.key === 'review_upgrade_opportunity')) signals.push('product_review_upgrade_path');
  if (models.some(model => model.key === 'listing_quality_gap')) signals.push('listing_quality_gap_path');
  if (models.some(model => model.key === 'seasonal_window')) signals.push('market_window_sensitive');
  return unique(signals);
}

function decisionQuality(coverage = {}) {
  if (coverage.sourceCount >= 4 && coverage.keywordResearch > 0 && coverage.productTimeMachine > 0) return 'full_market_profile';
  if (coverage.sourceCount >= 3) return 'market_first_ready';
  if (coverage.sourceCount > 0) return 'partial_market_evidence';
  return 'research_needed';
}

function recommendedOperatingUse(models = [], coverage = {}) {
  if (!coverage.totalMatches) return 'fill_selection_evidence_first';
  if (models.some(model => model.actionBoundary === 'product_repair_first')) return 'product_or_listing_repair_first';
  if (models.some(model => model.key === 'low_monopoly_market' || model.key === 'conversion_economics_usable')) return 'controlled_validation_candidate';
  if (models.some(model => model.key === 'competitor_traffic_map' || model.key === 'front_competitor_validated')) return 'competitor_research_to_keyword_validation';
  return 'operator_review';
}

function missingEvidence(coverage = {}) {
  const missing = [];
  if (!coverage.keywordResearch) missing.push('selection_keyword_research');
  if (!coverage.productTimeMachine) missing.push('selection_product_time_machine');
  if (!coverage.aba) missing.push('selection_aba_search_terms');
  if (!coverage.conversion) missing.push('selection_keyword_conversion_rate');
  if (!coverage.seasonality) missing.push('selection_keyword_seasonality');
  return missing;
}

function capabilitySummary(intelligence = {}, options = {}) {
  return {
    capabilityId: 'selection::market_evidence::operating-intelligence::read',
    evidenceBoundary: 'selection_read_only_market_evidence',
    subject: {
      sku: text(options.sku || options.subject?.sku),
      asin: text(options.asin || options.subject?.asin).toUpperCase(),
      terms: deriveTerms(options),
    },
    decisionQuality: intelligence.decisionQuality,
    recommendedOperatingUse: intelligence.recommendedOperatingUse,
    readyForDecisionSupport: intelligence.readyForDecisionSupport,
    readyForAutoAction: false,
    sourceCoverage: intelligence.sourceCoverage,
    topOpportunityModels: (intelligence.opportunityModels || []).slice(0, 5).map(model => ({
      key: model.key,
      term: model.term,
      score: model.score,
      actionBoundary: model.actionBoundary,
    })),
    riskSignals: intelligence.riskSignals || [],
    missingEvidence: intelligence.missingEvidence || [],
  };
}

function buildSelectionOperatingIntelligence(options = {}) {
  const suppliedRows = Array.isArray(options.evidenceRows) && options.evidenceRows.length
    ? options.evidenceRows
    : evidenceRowsFromSelectionReports(options);
  const evidenceRows = suppliedRows
    .map(row => ({ ...row, term: termKey(row.term || row.searchTerm || row.keyword) }))
    .filter(row => row.term);
  const coverage = sourceCoverage(evidenceRows);
  const models = buildOpportunityModels(evidenceRows, options);
  const riskSignals = riskSignalsForModels(models, evidenceRows);
  const quality = decisionQuality(coverage);
  return {
    frameworkVersion: 'selection_operating_intelligence.v1',
    sourceCoverage: coverage,
    decisionQuality: quality,
    readyForDecisionSupport: coverage.totalMatches > 0,
    readyForAutoAction: false,
    capabilityId: 'selection::market_evidence::operating-intelligence::read',
    recommendedOperatingUse: recommendedOperatingUse(models, coverage),
    missingEvidence: missingEvidence(coverage),
    opportunityModels: models.slice(0, 12),
    productTimeMachine: productTimeMachineSummary(evidenceRows),
    riskSignals,
    actionBoundary: 'read_only_market_evidence',
    evidenceRows,
  };
  intelligence.capabilitySummary = capabilitySummary(intelligence, options);
  return intelligence;
}

module.exports = {
  buildSelectionOperatingIntelligence,
  buildOpportunityModels,
  capabilitySummary,
  deriveTerms,
  evidenceRowsFromSelectionReports,
  termKey,
};
