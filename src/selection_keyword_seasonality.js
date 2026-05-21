function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSearchTerms(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '').split(/[\n\r,;\uFF0C\uFF1B]+/);
  const seen = new Set();
  const searchTerms = [];
  for (const item of raw) {
    const term = text(item);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    searchTerms.push(term);
  }
  return searchTerms;
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeCategory(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return normalizeSearchTerms(value);
}

function normalizeOrder(value) {
  return text(value).toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function defaultAdvancedSearch() {
  return {
    total_appear_month_type: '1',
    market_cycle_type: [],
    usrMaskType: [],
    usrMaskProgress: [],
    label: [],
    keywordPattern: null,
  };
}

function buildKeywordSeasonalityPayload(options = {}) {
  const searchTerms = normalizeSearchTerms(
    options.searchTerms || options.terms || options.keywords || options.stValue || []
  );
  return {
    stValue: text(options.stValue) || searchTerms.join(','),
    titleType: positiveInt(options.titleType, 2),
    stType: text(options.stType) || '1',
    sale_calc_key: text(options.saleCalcKey || options.sale_calc_key) || 'orders',
    site: text(options.site) || '1',
    dateType: text(options.dateType) || '6',
    uTime: text(options.uTime || options.date || options.period),
    pageType: positiveInt(options.pageType, 1),
    advancedSearch: options.advancedSearch && typeof options.advancedSearch === 'object'
      ? options.advancedSearch
      : defaultAdvancedSearch(),
    category: normalizeCategory(options.category),
    column: text(options.column || options.sortBy) || 'top_rank',
    order: normalizeOrder(options.order),
    pageNo: positiveInt(options.pageNo || options.pageNum || options.page, 1),
    pageSize: positiveInt(options.pageSize || options.limit, 50),
  };
}

function buildKeywordSeasonalityPayloads(options = {}) {
  const searchTerms = normalizeSearchTerms(
    options.searchTerms || options.terms || options.keywords || options.stValue || []
  );
  if (!searchTerms.length || options.joinTerms === true) {
    return [buildKeywordSeasonalityPayload(options)];
  }
  return searchTerms.map(term => buildKeywordSeasonalityPayload({
    ...options,
    searchTerms: [term],
    stValue: term,
  }));
}

function buildGoogleTrendPayload(options = {}) {
  return {
    site: text(options.site) || '1',
    searchTerms: normalizeSearchTerms(options.searchTerms || options.terms || options.keywords || []),
    gType: text(options.gType) || '1',
    timeType: text(options.timeType) || '2',
  };
}

function rowsFromResult(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.records)) return result.records;
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.list)) return result.list;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result)) return result;
  return [];
}

function extractKeywordSeasonalityResult(response = {}) {
  const json = response.json || response;
  const result = json?.result || json?.data || {};
  const rows = rowsFromResult(result);
  const code = json?.code ?? null;
  const success = json?.success ?? null;
  const status = response.status ?? null;
  return {
    ok: (status === null || status === 200) && code === 200 && success === true,
    status,
    code,
    success,
    message: text(json?.message || json?.msg),
    total: num(result?.total ?? json?.total, rows.length),
    rows,
  };
}

function splitNumbers(value) {
  return String(value || '').split(',').map(item => num(item, 0));
}

function splitMonths(value) {
  return String(value || '').split(',').map(text).filter(Boolean);
}

function monthlySeries(row = {}, valueField) {
  const months = splitMonths(row.rel_month_list || row.relMonthList);
  const values = splitNumbers(row[valueField]);
  return months.map((month, index) => ({
    month,
    value: values[index] || 0,
  }));
}

function monthlyOrdersFor(row = {}) {
  return monthlySeries(row, 'orders_chart').map(item => ({
    month: item.month,
    orders: item.value,
  }));
}

function monthlySearchVolumeFor(row = {}) {
  return monthlySeries(row, 'search_volume_chart').map(item => ({
    month: item.month,
    searchVolume: item.value,
  }));
}

function quarterlyOrdersFor(row = {}) {
  return {
    q1: num(row.q1_orders ?? row.q1Orders, 0),
    q2: num(row.q2_orders ?? row.q2Orders, 0),
    q3: num(row.q3_orders ?? row.q3Orders, 0),
    q4: num(row.q4_orders ?? row.q4Orders, 0),
  };
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function peakQuarterFor(quarterlyOrders = {}) {
  const entries = Object.entries(quarterlyOrders);
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || '';
}

function quarterRatioFor(quarterlyOrders = {}) {
  const values = Object.values(quarterlyOrders).filter(value => value > 0);
  if (!values.length) return null;
  return round(Math.max(...values) / Math.min(...values), 2);
}

function classifySeasonality(quarterRatio) {
  if (quarterRatio === null) return 'unknown';
  if (quarterRatio >= 2) return 'strong_seasonal';
  if (quarterRatio >= 1.35) return 'moderate_seasonal';
  return 'evergreen_or_weak_seasonal';
}

function topMonthsFor(monthlyOrders = [], limit = 3) {
  return [...monthlyOrders]
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}

function classifySearchVolumeTrend(row = {}) {
  const rising = num(row.sv_rising_rate ?? row.svRisingRate, null);
  const declining = num(row.sv_decline_rate ?? row.svDeclineRate, null);
  if (rising === null && declining === null) return 'unknown';
  if (rising >= 0.65 && rising > declining) return 'rising';
  if (declining >= 0.65 && declining > rising) return 'declining';
  return 'mixed_or_flat';
}

function classifyDemand(row = {}) {
  const rank = num(row.top_rank ?? row.rank, null);
  const orders = num(row.orders, 0);
  if ((rank !== null && rank > 0 && rank <= 5000) || orders >= 300000) return 'high';
  if ((rank !== null && rank > 0 && rank <= 50000) || orders >= 50000) return 'medium';
  return 'low';
}

function classifyCompetition(row = {}) {
  const reviewAvg = num(row.total_comments_avg ?? row.reviewAvg, 0);
  const brandMonopoly = num(row.brand_monopoly ?? row.brandMonopoly, 0);
  const sellerMonopoly = num(row.seller_monopoly ?? row.sellerMonopoly, 0);
  const supplyDemand = num(row.supply_demand ?? row.supplyDemand, 0);
  if (reviewAvg >= 3000 || brandMonopoly >= 0.55 || sellerMonopoly >= 0.55 || supplyDemand >= 0.6) return 'high';
  if (reviewAvg >= 700 || brandMonopoly >= 0.25 || sellerMonopoly >= 0.25 || supplyDemand >= 0.25) return 'medium';
  return 'low';
}

function recommendedUseFor(seasonalityType, demandTier, competitionTier) {
  if (seasonalityType === 'strong_seasonal') return 'seasonal_window_planning';
  if (seasonalityType === 'moderate_seasonal') return 'seasonal_or_niche_validation';
  if (demandTier === 'high' && competitionTier !== 'high') return 'evergreen_market_validation';
  if (competitionTier === 'high') return 'research_only_or_narrow_slice';
  return 'research_or_small_step_validation';
}

function defaultCrossChecks() {
  return [
    {
      tool: 'selection_keyword_conversion_rate',
      status: 'needed',
      purpose: 'compare seasonality and demand with conversion rate, CPC, CPA, and ACOS before spending',
    },
    {
      tool: 'selection_aba_search_terms',
      status: 'needed',
      purpose: 'confirm ABA rank, search volume, top-ASIN concentration, and demand pressure',
    },
    {
      tool: 'ad_backend',
      status: 'needed_if_our_sku_exists',
      purpose: 'compare market seasonality with SKU CTR, CVR, CPC, ACOS, orders, and current campaign limits',
    },
    {
      tool: 'inventory_and_profit',
      status: 'needed_if_action_candidate',
      purpose: 'check inventory depth, margin, arrival timing, and clearance risk before budget, price, or replenishment decisions',
    },
  ];
}

function unwrapResult(api = {}) {
  if (!api || typeof api !== 'object') return {};
  return api.result || api.data || api;
}

function overviewRowsFor(api = {}) {
  const result = unwrapResult(api);
  return Array.isArray(result) ? result : rowsFromResult(result);
}

function firstOverviewFor(api = {}, searchTerm = '') {
  const rows = overviewRowsFor(api);
  const normalized = text(searchTerm).toLowerCase();
  return rows.find(row => text(row.search_term || row.searchTerm).toLowerCase() === normalized) || rows[0] || {};
}

function trendTimelineFor(api = {}) {
  const result = unwrapResult(api);
  const rows = Array.isArray(result.timelineData) ? result.timelineData : [];
  return rows.map(row => ({
    time: text(row.time),
    formattedTime: text(row.formattedTime || row.formattedAxisTime),
    value: num(Array.isArray(row.value) ? row.value[0] : row.value, 0),
    formattedValue: Array.isArray(row.formattedValue) ? text(row.formattedValue[0]) : text(row.formattedValue),
  }));
}

function average(values = []) {
  const valid = values.map(value => num(value, null)).filter(value => value !== null);
  if (!valid.length) return null;
  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length, 2);
}

function trendDirectionFor(points = []) {
  const values = points.map(point => num(point.value, null)).filter(value => value !== null);
  if (values.length < 4) return 'mixed_or_flat';
  const half = Math.floor(values.length / 2);
  const early = average(values.slice(0, half));
  const recent = average(values.slice(-half));
  if (early === null || recent === null || early === 0) return 'unknown';
  const change = (recent - early) / early;
  if (change >= 0.15) return 'rising';
  if (change <= -0.15) return 'declining';
  return 'mixed_or_flat';
}

function summarizeGoogleTrend(api = {}) {
  const timeline = trendTimelineFor(api);
  const values = timeline.map(point => point.value).filter(value => value !== null);
  return {
    pointCount: timeline.length,
    latestValue: values.length ? values[values.length - 1] : null,
    maxValue: values.length ? Math.max(...values) : null,
    minValue: values.length ? Math.min(...values) : null,
    averageValue: average(values),
    direction: trendDirectionFor(timeline),
    timeline,
  };
}

function asinDetailRowsFor(api = {}) {
  const result = unwrapResult(api);
  return rowsFromResult(result.asinDetail || result.asinDetails || result.records || result.rows || result.list || []);
}

function reviewCountFor(row = {}) {
  return num(row.commentNum ?? row.total_comments ?? row.totalComments ?? row.reviewCount ?? row.reviews ?? row.total_comments_num, null);
}

function summarizeCompetitors(api = {}) {
  const rows = asinDetailRowsFor(api);
  const prices = rows.map(row => num(row.price, null)).filter(value => value !== null);
  const ratings = rows.map(row => num(row.rating ?? row.ratingAvg, null)).filter(value => value !== null);
  const reviews = rows.map(reviewCountFor).filter(value => value !== null);
  const brands = {};
  for (const row of rows) {
    const brand = text(row.brand);
    if (brand) brands[brand] = (brands[brand] || 0) + 1;
  }
  return {
    asinCount: rows.length,
    priceAvg: average(prices),
    ratingAvg: average(ratings),
    reviewAvg: average(reviews),
    brandCount: Object.keys(brands).length,
    topBrands: Object.entries(brands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([brand, count]) => ({ brand, count })),
    topAsins: rows.slice(0, 20).map(row => ({
      asin: text(row.asin || row.parentAsin),
      title: text(row.title),
      brand: text(row.brand),
      price: num(row.price, null),
      rating: num(row.rating ?? row.ratingAvg, null),
      reviewCount: reviewCountFor(row),
      boughtMonth: num(row.boughtMonth ?? row.bought_month ?? row.amazonMonthlySales, null),
      imageUrl: text(row.imageUrl || row.mainImgUrl || row.img_url),
    })),
  };
}

function buyerSearchTermsFor(api = {}) {
  const result = unwrapResult(api);
  return rowsFromResult(result).slice(0, 50).map(row => ({
    searchTerm: text(row.search_term || row.searchTerm || row.keyword),
    rank: num(row.rank ?? row.top_rank, null),
    searchVolume: num(row.search_volume ?? row.searchVolume, null),
    estimatedOrders: num(row.estimated_orders ?? row.estimatedOrders ?? row.orders, null),
  })).filter(row => row.searchTerm);
}

function demandTierFromAnalysis(overview = {}) {
  const rank = num(overview.rank ?? overview.top_rank, null);
  const searchVolume = num(overview.search_volume ?? overview.searchVolume, 0);
  if ((rank !== null && rank > 0 && rank <= 5000) || searchVolume >= 100000) return 'high';
  if ((rank !== null && rank > 0 && rank <= 50000) || searchVolume >= 10000) return 'medium';
  return 'low';
}

function competitionTierFromAnalysis(overview = {}, competitorSummary = {}) {
  const asinCount = num(overview.asin_counts ?? overview.asinCount ?? competitorSummary.asinCount, 0);
  const reviewAvg = num(competitorSummary.reviewAvg, 0);
  if (asinCount >= 500 || reviewAvg >= 3000) return 'high';
  if (asinCount >= 100 || reviewAvg >= 700) return 'medium';
  return 'low';
}

function recommendedUseFromAnalysis(row = {}) {
  if (row.googleTrend?.direction === 'declining') return 'seasonal_tail_or_cautious_validation';
  if (row.demandTier === 'high' && row.competitionTier !== 'high') return 'market_validation_candidate';
  if (row.competitionTier === 'high') return 'research_only_or_narrow_slice';
  return 'small_step_validation';
}

function summarizeAnalysisResult(input = {}) {
  const searchTerm = text(input.searchTerm);
  const overview = firstOverviewFor(input.overview, searchTerm);
  const googleTrend = summarizeGoogleTrend(input.googleTrend);
  const competitorSummary = summarizeCompetitors(input.asinCompetition);
  const buyerSearchTerms = buyerSearchTermsFor(input.buyerSearchTerms);
  const rank = num(overview.rank ?? overview.top_rank, null);
  const searchVolume = num(overview.search_volume ?? overview.searchVolume, null);
  const asinCount = num(overview.asin_counts ?? overview.asinCount, competitorSummary.asinCount);
  const demandTier = demandTierFromAnalysis(overview);
  const competitionTier = competitionTierFromAnalysis(overview, competitorSummary);
  const row = {
    searchTerm: text(overview.search_term || overview.searchTerm || searchTerm),
    rank,
    searchVolume,
    asinCount,
    googleTrend,
    competitorSummary,
    buyerSearchTerms,
    demandTier,
    competitionTier,
    decisionConfidence: rank !== null || searchVolume !== null || googleTrend.pointCount > 0 ? 'medium' : 'low',
    evidenceNotes: [
      rank !== null ? `rank=${rank}` : '',
      searchVolume !== null ? `searchVolume=${searchVolume}` : '',
      asinCount !== null ? `asinCount=${asinCount}` : '',
      googleTrend.pointCount ? `googleTrendPoints=${googleTrend.pointCount}` : '',
      competitorSummary.asinCount ? `competitorAsins=${competitorSummary.asinCount}` : '',
      buyerSearchTerms.length ? `buyerSearchTerms=${buyerSearchTerms.length}` : '',
    ].filter(Boolean),
    crossChecks: defaultCrossChecks(),
  };
  row.recommendedUse = recommendedUseFromAnalysis(row);
  return row;
}

function evidenceNotesFor(row = {}, seasonalityType, quarterRatio, peakQuarter) {
  const notes = [
    `orders=${num(row.orders, 0)}`,
    `rank=${num(row.top_rank ?? row.rank, null)}`,
    `quarterRatio=${quarterRatio}`,
    `peakQuarter=${peakQuarter}`,
    `maxOrdersMonth=${text(row.max_orders_month || row.maxOrdersMonth)}`,
    `priceAvg=${num(row.price_avg ?? row.priceAvg, null)}`,
    `reviewAvg=${num(row.total_comments_avg ?? row.reviewAvg, null)}`,
    `seasonalityType=${seasonalityType}`,
  ];
  const marketTag = text(row.usr_mask_type || row.usrMaskType);
  if (marketTag) notes.push(`marketTag=${marketTag}`);
  return notes;
}

function summarizeKeywordSeasonalityRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const quarterlyOrders = quarterlyOrdersFor(row);
    const monthlyOrders = monthlyOrdersFor(row);
    const monthlySearchVolume = monthlySearchVolumeFor(row);
    const quarterRatio = quarterRatioFor(quarterlyOrders);
    const seasonalityType = classifySeasonality(quarterRatio);
    const peakQuarter = peakQuarterFor(quarterlyOrders);
    const demandTier = classifyDemand(row);
    const competitionTier = classifyCompetition(row);
    const recommendedUse = recommendedUseFor(seasonalityType, demandTier, competitionTier);
    return {
      searchTerm: text(row.search_term || row.searchTerm),
      rank: num(row.top_rank ?? row.rank),
      categoryId: text(row.category_id || row.categoryId),
      category: text(row.one_category_id || row.oneCategoryId),
      totalOrders: num(row.orders, 0),
      bsrOrders: num(row.bsr_orders ?? row.bsrOrders),
      quarterlyOrders,
      quarterRatio,
      peakQuarter,
      seasonalityType,
      maxOrdersMonth: text(row.max_orders_month || row.maxOrdersMonth),
      maxBsrOrdersMonth: text(row.max_bsr_orders_month || row.maxBsrOrdersMonth),
      monthlyOrders,
      monthlySearchVolume,
      topMonths: topMonthsFor(monthlyOrders),
      searchVolumeTrend: classifySearchVolumeTrend(row),
      seasonLabel: text(row.usr_mask_type || row.usrMaskType),
      marketCycleType: num(row.market_cycle_type ?? row.marketCycleType),
      priceAvg: num(row.price_avg ?? row.priceAvg),
      reviewAvg: num(row.total_comments_avg ?? row.reviewAvg),
      ratingAvg: num(row.rating_avg ?? row.ratingAvg),
      supplyDemand: num(row.supply_demand ?? row.supplyDemand),
      asinCount: num(row.total_asin_num ?? row.totalAsinNum),
      top3SellerOrders: num(row.top3_seller_orders ?? row.top3SellerOrders),
      brandMonopoly: num(row.brand_monopoly ?? row.brandMonopoly),
      sellerMonopoly: num(row.seller_monopoly ?? row.sellerMonopoly),
      demandTier,
      competitionTier,
      recommendedUse,
      decisionConfidence: demandTier === 'high' && seasonalityType !== 'unknown' ? 'medium_high' : 'medium',
      evidenceNotes: evidenceNotesFor(row, seasonalityType, quarterRatio, peakQuarter),
      crossChecks: defaultCrossChecks(),
    };
  });
}

function dataAgeDays(uTime, generatedAt) {
  const period = text(uTime).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return null;
  const generated = text(generatedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generated)) return null;
  const start = Date.parse(`${period}T00:00:00Z`);
  const end = Date.parse(`${generated}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function freshnessFor(ageDays) {
  if (ageDays === null) return 'unknown';
  if (ageDays <= 45) return 'fresh';
  if (ageDays <= 90) return 'usable_with_lag';
  return 'stale';
}

function countBy(rows = [], field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildKeywordSeasonalityReport(options = {}) {
  const requestedSearchTerms = normalizeSearchTerms(
    options.requestedSearchTerms || options.searchTerms || options.terms || []
  );
  const extracted = options.extracted || {};
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const dateType = text(options.dateType) || '6';
  const uTime = text(options.uTime || options.date || options.period);
  const rows = summarizeKeywordSeasonalityRows(extracted.rows || []);
  const returned = new Set(rows.map(row => row.searchTerm.toLowerCase()).filter(Boolean));
  const missingSearchTerms = requestedSearchTerms.filter(term => !returned.has(term.toLowerCase()));
  const ageDays = dataAgeDays(uTime, generatedAt);

  return {
    source: 'selection_keyword_seasonality',
    generatedAt,
    period: {
      dateType,
      uTime,
      dataAgeDays: ageDays,
      freshness: freshnessFor(ageDays),
    },
    coverage: {
      requestedCount: requestedSearchTerms.length,
      returnedCount: rows.length,
      missingCount: missingSearchTerms.length,
      missingSearchTerms,
    },
    opsReadiness: {
      readyForDecisionSupport: rows.length > 0,
      readyForAutoAction: false,
      reason: 'keyword seasonality data is read-only market evidence; do not create ads, raise bids, change budgets, prices, or replenishment from this source alone',
    },
    operatorSummary: {
      bySeasonalityType: countBy(rows, 'seasonalityType'),
      byDemandTier: countBy(rows, 'demandTier'),
      byCompetitionTier: countBy(rows, 'competitionTier'),
      byRecommendedUse: countBy(rows, 'recommendedUse'),
    },
    crossValidationPlan: defaultCrossChecks(),
    rows,
  };
}

function buildAnalysisKeywordSeasonalityReport(options = {}) {
  const requestedSearchTerms = normalizeSearchTerms(
    options.requestedSearchTerms || options.searchTerms || options.terms || []
  );
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const dateType = text(options.dateType) || '2';
  const uTime = text(options.uTime || options.date || options.period);
  const rows = (options.analysisResults || [])
    .map(summarizeAnalysisResult)
    .filter(row => row.searchTerm && (row.evidenceNotes || []).length);
  const returned = new Set(rows.map(row => row.searchTerm.toLowerCase()).filter(Boolean));
  const missingSearchTerms = requestedSearchTerms.filter(term => !returned.has(term.toLowerCase()));
  const ageDays = dataAgeDays(uTime, generatedAt);

  return {
    source: 'selection_keyword_seasonality',
    mode: 'analysis_search_term',
    generatedAt,
    period: {
      dateType,
      uTime,
      dataAgeDays: ageDays,
      freshness: freshnessFor(ageDays),
    },
    coverage: {
      requestedCount: requestedSearchTerms.length,
      returnedCount: rows.length,
      missingCount: missingSearchTerms.length,
      missingSearchTerms,
    },
    opsReadiness: {
      readyForDecisionSupport: rows.length > 0,
      readyForAutoAction: false,
      reason: 'search-term analysis data is read-only market evidence; do not create ads, raise bids, change budgets, prices, listings, or replenishment from this source alone',
    },
    operatorSummary: {
      byTrendDirection: countBy(rows.map(row => ({ direction: row.googleTrend?.direction || 'unknown' })), 'direction'),
      byDemandTier: countBy(rows, 'demandTier'),
      byCompetitionTier: countBy(rows, 'competitionTier'),
      byRecommendedUse: countBy(rows, 'recommendedUse'),
    },
    crossValidationPlan: defaultCrossChecks(),
    rows,
  };
}

module.exports = {
  buildAnalysisKeywordSeasonalityReport,
  buildGoogleTrendPayload,
  buildKeywordSeasonalityPayload,
  buildKeywordSeasonalityPayloads,
  buildKeywordSeasonalityReport,
  classifyCompetition,
  classifyDemand,
  classifySeasonality,
  extractKeywordSeasonalityResult,
  normalizeSearchTerms,
  summarizeKeywordSeasonalityRows,
};
