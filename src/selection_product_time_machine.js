function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSearchKeywords(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '').split(/[\n\r,;\uFF0C\uFF1B]+/);
  const seen = new Set();
  const keywords = [];
  for (const item of raw) {
    const keyword = text(item);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function normalizeSiteName(site) {
  const raw = text(site || '1').toLowerCase();
  const map = {
    1: 'us',
    us: 'us',
    usa: 'us',
    amazoncom: 'us',
    2: 'uk',
    uk: 'uk',
    3: 'de',
    de: 'de',
    4: 'fr',
    fr: 'fr',
    5: 'es',
    es: 'es',
    6: 'it',
    it: 'it',
  };
  return map[raw] || raw || 'us';
}

function countryForSiteName(siteName) {
  const map = {
    us: 'US',
    uk: 'UK',
    de: 'DE',
    fr: 'FR',
    es: 'ES',
    it: 'IT',
  };
  return map[normalizeSiteName(siteName)] || String(siteName || 'us').toUpperCase();
}

function buildProductTimeMachinePayload(options = {}) {
  const searchKeywords = normalizeSearchKeywords(
    options.searchKeywords || options.searchKeyword || options.keywords || options.terms || []
  );
  return {
    site: text(options.site) || '1',
    timePieceType: text(options.timePieceType || options['time-piece-type']) || 'latelyDay',
    timePieceValue: text(options.timePieceValue || options['time-piece-value']) || '7',
    type: positiveInt(options.type, 2),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options.limit || options['page-size'], 50),
    sortBy: text(options.sortBy || options['sort-by']) || 'nfScoreRatio',
    desc: normalizeBool(options.desc, true),
    showType: text(options.showType || options['show-type']) || '1',
    condition: text(options.condition),
    searchKeyword: text(options.searchKeyword) || searchKeywords[0] || '',
  };
}

function buildKeywordHistoryPayload(options = {}) {
  const keyword = text(options.keyword || options.searchKeyword);
  const siteName = normalizeSiteName(options.siteName || options.site);
  return {
    api: text(options.api) || 'https://www.sif.com/api/search/keyword/abahistory/chart',
    siteName,
    method: text(options.method) || 'get',
    body: {
      country: text(options.country) || countryForSiteName(siteName),
      keyword,
      granularity: text(options.granularity) || 'week',
    },
  };
}

function rowsFromResult(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.asins)) return result.asins;
  if (Array.isArray(result.records)) return result.records;
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.list)) return result.list;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result)) return result;
  return [];
}

function extractProductTimeMachineResult(response = {}) {
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
    isParentAsin: text(result?.isParentAsin),
    vaiantsNum: num(result?.vaiantsNum),
    nkVaiantsNum: num(result?.nkVaiantsNum),
    pasins: result?.pasins || null,
    boughtMonth: result?.boughtMonth || null,
    rows,
  };
}

function extractKeywordHistoryResult(response = {}) {
  const json = response.json || response;
  const result = json?.result || json?.data || {};
  const code = json?.code ?? null;
  const success = json?.success ?? null;
  const status = response.status ?? null;
  const granularities = Array.isArray(result.granularities) ? result.granularities : [];
  const searchVolumes = Array.isArray(result.keywordSearchVolumes) ? result.keywordSearchVolumes : [];
  const extSearchVolumes = Array.isArray(result.extSearchVolumes) ? result.extSearchVolumes : [];
  const ranks = Array.isArray(result.keywordRanks) ? result.keywordRanks : [];
  const timeline = granularities.map((period, index) => ({
    period: text(period),
    searchVolume: num(searchVolumes[index], 0),
    extSearchVolume: num(extSearchVolumes[index], null),
    rank: num(ranks[index], null),
  }));
  return {
    ok: (status === null || status === 200) && code === 200 && success === true,
    status,
    code,
    success,
    message: text(json?.message || json?.msg),
    timeline,
    festivals: Array.isArray(result.festivals) ? result.festivals : [],
    summary: summarizeKeywordHistoryTimeline(timeline),
  };
}

function parseLowerBound(value) {
  const raw = text(value);
  if (!raw || raw === '-') return null;
  const match = raw.replace(/,/g, '').match(/\d+/);
  return match ? num(match[0], null) : null;
}

function monthlyBoughtHistoryFor(row = {}) {
  const months = Array.isArray(row.boughtHistoryDates) ? row.boughtHistoryDates : [];
  const history = Array.isArray(row.boughtHistory) ? row.boughtHistory : [];
  return months.map((month, index) => ({
    month: text(month),
    raw: text(history[index]),
    lowerBound: parseLowerBound(history[index]),
  })).filter(item => item.month);
}

function rankHistoryFor(row = {}) {
  const dates = Array.isArray(row.rankHistory?.date) ? row.rankHistory.date : [];
  const ranks = Array.isArray(row.rankHistory?.rank) ? row.rankHistory.rank : [];
  const adRanks = Array.isArray(row.rankHistory?.adRank) ? row.rankHistory.adRank : [];
  const organic = dates.map((date, index) => ({
    date: text(date),
    rank: num(ranks[index], null),
  })).filter(item => item.date);
  const ad = dates.map((date, index) => ({
    date: text(date),
    rank: num(adRanks[index], null),
  })).filter(item => item.date && item.rank !== null);
  const organicRanks = organic.map(item => item.rank).filter(value => value !== null);
  const adRankValues = ad.map(item => item.rank).filter(value => value !== null);
  return {
    dates,
    organic,
    ad,
    latestOrganicRank: organicRanks.length ? organicRanks[organicRanks.length - 1] : null,
    bestOrganicRank: organicRanks.length ? Math.min(...organicRanks) : null,
    worstOrganicRank: organicRanks.length ? Math.max(...organicRanks) : null,
    latestAdRank: adRankValues.length ? adRankValues[adRankValues.length - 1] : null,
    bestAdRank: adRankValues.length ? Math.min(...adRankValues) : null,
  };
}

function flowResourceTypesFor(row = {}) {
  const resources = row.flowResources && typeof row.flowResources === 'object' ? row.flowResources : {};
  return Object.keys(resources)
    .map(text)
    .filter(Boolean)
    .sort();
}

function trafficTermsFor(row = {}) {
  return {
    total: num(row.total, 0),
    natural: num(row.natural, 0),
    sp: num(row.sp, 0),
    brand: num(row.brand, 0),
    video: num(row.vedio ?? row.video, 0),
    ac: num(row.ac, 0),
    er: num(row.er, 0),
    tr: num(row.tr, 0),
  };
}

function classifyTrafficMix(traffic = {}) {
  const adCount = (traffic.sp || 0) + (traffic.brand || 0) + (traffic.video || 0);
  if (adCount > 0 && traffic.natural > 0) return 'ad_augmented';
  if (adCount > 0) return 'ad_led';
  if (traffic.natural > 0) return 'organic_led';
  return 'unknown';
}

function classifyDemand(row = {}) {
  const monthlyBought = parseLowerBound(row.boughtInPastMonth);
  const ratingNum = num(row.ratingNum, 0);
  const traffic = trafficTermsFor(row);
  if ((monthlyBought || 0) >= 5000 || traffic.total >= 500 || ratingNum >= 5000) return 'high';
  if ((monthlyBought || 0) >= 500 || traffic.total >= 100 || ratingNum >= 500) return 'medium';
  return 'low';
}

function recommendedUseFor(demandTier, trafficMix) {
  if (demandTier === 'high' && trafficMix === 'ad_augmented') return 'competitor_traffic_map';
  if (demandTier === 'high') return 'competitor_reference';
  if (demandTier === 'medium') return 'niche_candidate_review';
  return 'research_only';
}

function evidenceNotesFor(row = {}, traffic = {}, rankHistory = {}) {
  return [
    `boughtInPastMonth=${text(row.boughtInPastMonth)}`,
    `trafficTerms=${traffic.total}`,
    `naturalTerms=${traffic.natural}`,
    `spTerms=${traffic.sp}`,
    `brandTerms=${traffic.brand}`,
    `videoTerms=${traffic.video}`,
    `organicFlowShare=${num(row.nfScoreRatio, null)}`,
    `aoVal=${num(row.aoVal, null)}`,
    rankHistory.latestOrganicRank !== null ? `latestOrganicRank=${rankHistory.latestOrganicRank}` : '',
    rankHistory.bestOrganicRank !== null ? `bestOrganicRank=${rankHistory.bestOrganicRank}` : '',
  ].filter(Boolean);
}

function defaultCrossChecks() {
  return [
    {
      tool: 'selection_aba_search_terms',
      status: 'needed',
      purpose: 'confirm demand rank, search volume, and top-ASIN concentration for the same keyword before judging spend or product opportunity',
    },
    {
      tool: 'selection_keyword_conversion_rate',
      status: 'needed',
      purpose: 'compare traffic map with keyword conversion economics, CPC, CPA, and ACOS ranges before ad tests',
    },
    {
      tool: 'selection_keyword_seasonality',
      status: 'needed_if_window_or_trend_matters',
      purpose: 'check market window, trend direction, competitor thresholds, and buyer-search expansions',
    },
    {
      tool: 'sku_listing_inventory_profit',
      status: 'needed_if_our_sku_exists',
      purpose: 'confirm our product fit, listing/price/review support, inventory, margin, and ad proof before any executable action',
    },
  ];
}

function summarizeProductTimeMachineRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const trafficTerms = trafficTermsFor(row);
    const rankHistory = rankHistoryFor(row);
    const trafficMix = classifyTrafficMix(trafficTerms);
    const demandTier = classifyDemand(row);
    return {
      asin: text(row.asin),
      searchKeyword: text(row.searchKeyword || row.keyword || row.stValue),
      title: text(row.title),
      imageUrl: text(row.img || row.imageUrl || row.mainImgUrl),
      category: text(row.category),
      features: Array.isArray(row.features) ? row.features.map(text).filter(Boolean) : [],
      price: num(row.price, null),
      rating: num(row.score ?? row.rating, null),
      star: num(row.star, null),
      reviewCount: num(row.ratingNum ?? row.reviewCount, 0),
      boughtInPastMonth: text(row.boughtInPastMonth),
      boughtInPastMonthLowerBound: parseLowerBound(row.boughtInPastMonth),
      monthlyBoughtHistory: monthlyBoughtHistoryFor(row),
      trafficTerms,
      trafficMix,
      organicFlowShare: num(row.nfScoreRatio, null),
      aoVal: num(row.aoVal, null),
      rankHistory,
      flowResourceTypes: flowResourceTypesFor(row),
      flags: {
        bestSeller: text(row.isBestSeller) === 'true',
        coupon: !!row.isCoupon,
        limitedTimeDeal: !!row.isLimitedTimeDeal,
        lowest30: !!row.isLowest30,
        hasVariants: !!row.hasVaiants,
        variant: !!row.vaiant,
        focus: !!row.focus,
      },
      demandTier,
      recommendedUse: recommendedUseFor(demandTier, trafficMix),
      decisionConfidence: trafficTerms.total > 0 || parseLowerBound(row.boughtInPastMonth) !== null ? 'medium' : 'low',
      evidenceNotes: evidenceNotesFor(row, trafficTerms, rankHistory),
      crossChecks: defaultCrossChecks(),
    };
  });
}

function trendDirection(values = [], options = {}) {
  const clean = values.filter(value => value !== null && value !== undefined);
  if (clean.length < 2) return 'unknown';
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (first === 0 && last === 0) return 'flat';
  const delta = last - first;
  const ratio = first === 0 ? (last > 0 ? Infinity : 0) : Math.abs(delta) / Math.abs(first);
  const threshold = options.threshold ?? 0.1;
  if (Math.abs(delta) <= Math.max(1, Math.abs(first) * threshold)) return 'flat';
  if (options.lowerIsBetter) return delta < 0 ? 'improving' : 'declining';
  return delta > 0 ? 'rising' : 'declining';
}

function average(values = []) {
  const clean = values.filter(value => value !== null && value !== undefined);
  if (!clean.length) return null;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 100) / 100;
}

function summarizeKeywordHistoryTimeline(timeline = []) {
  const searchVolumes = timeline.map(item => item.searchVolume).filter(value => value !== null);
  const ranks = timeline.map(item => item.rank).filter(value => value !== null);
  return {
    pointCount: timeline.length,
    firstPeriod: timeline[0]?.period || '',
    latestPeriod: timeline[timeline.length - 1]?.period || '',
    latestSearchVolume: searchVolumes.length ? searchVolumes[searchVolumes.length - 1] : null,
    maxSearchVolume: searchVolumes.length ? Math.max(...searchVolumes) : null,
    avgSearchVolume: average(searchVolumes),
    bestRank: ranks.length ? Math.min(...ranks) : null,
    latestRank: ranks.length ? ranks[ranks.length - 1] : null,
    searchVolumeDirection: trendDirection(searchVolumes),
    rankDirection: trendDirection(ranks, { lowerIsBetter: true }),
  };
}

function countBy(rows = [], field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildProductTimeMachineReport(options = {}) {
  const requestedKeywords = normalizeSearchKeywords(
    options.requestedKeywords || options.searchKeywords || options.keywords || []
  );
  const extracted = options.extracted || {};
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const rows = summarizeProductTimeMachineRows(extracted.rows || []);
  const returned = new Set(rows.map(row => row.searchKeyword.toLowerCase()).filter(Boolean));
  const missingKeywords = requestedKeywords.filter(keyword => !returned.has(keyword.toLowerCase()));
  const keywordHistory = (options.keywordHistoryResults || []).map(item => ({
    keyword: text(item.keyword),
    request: item.request || null,
    ok: !!item.extracted?.ok,
    status: item.extracted?.status ?? null,
    code: item.extracted?.code ?? null,
    success: item.extracted?.success ?? null,
    message: item.extracted?.message || '',
    summary: item.extracted?.summary || summarizeKeywordHistoryTimeline(item.extracted?.timeline || []),
    timeline: item.extracted?.timeline || [],
  }));

  return {
    source: 'selection_product_time_machine',
    mode: 'product_time_machine',
    generatedAt,
    request: options.request || null,
    period: {
      timePieceType: text(options.request?.timePieceType) || 'latelyDay',
      timePieceValue: text(options.request?.timePieceValue) || '7',
    },
    coverage: {
      requestedCount: requestedKeywords.length,
      returnedCount: rows.length,
      missingCount: missingKeywords.length,
      missingKeywords,
    },
    opsReadiness: {
      readyForDecisionSupport: rows.length > 0,
      readyForAutoAction: false,
      reason: 'product time machine data is read-only market and competitor traffic evidence; do not create ads, raise bids, change budgets, listings, prices, or inventory from this source alone',
    },
    operatorSummary: {
      byDemandTier: countBy(rows, 'demandTier'),
      byTrafficMix: countBy(rows, 'trafficMix'),
      byRecommendedUse: countBy(rows, 'recommendedUse'),
      keywordHistoryCount: keywordHistory.length,
    },
    crossValidationPlan: defaultCrossChecks(),
    keywordHistory,
    rows,
  };
}

module.exports = {
  buildKeywordHistoryPayload,
  buildProductTimeMachinePayload,
  buildProductTimeMachineReport,
  extractKeywordHistoryResult,
  extractProductTimeMachineResult,
  normalizeSearchKeywords,
  summarizeKeywordHistoryRows: summarizeKeywordHistoryTimeline,
  summarizeProductTimeMachineRows,
};
