const DEFAULT_STRATEGY = 'legacyForSales_exact';
const STRATEGIES = [
  'legacyForSales_exact',
  'legacyForSales_phrase',
  'legacyForSales_broad',
  'autoForSales_exact',
  'autoForSales_phrase',
  'autoForSales_broad',
];

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKeywords(input) {
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

function buildKeywordConversionPayload(options = {}) {
  return {
    keywords: normalizeKeywords(options.keywords),
    customPrice: text(options.customPrice),
    customProfitRate: text(options.customProfitRate),
    desc: options.desc === undefined ? true : !!options.desc,
    sortBy: text(options.sortBy),
    pageNum: positiveInt(options.pageNum, 1),
    pageSize: positiveInt(options.pageSize, 50),
    strategy: text(options.strategy) || DEFAULT_STRATEGY,
  };
}

function keywordRowsFromResult(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.keywords)) return result.keywords;
  if (Array.isArray(result.records)) return result.records;
  if (Array.isArray(result.list)) return result.list;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result)) return result;
  return [];
}

function extractKeywordConversionResult(response = {}) {
  const json = response.json || response;
  const result = json?.result || json?.data || {};
  const rows = keywordRowsFromResult(result);
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
    weekNumber: result?.weekNumber ?? null,
    weekDate: result?.weekDate || null,
    rows,
  };
}

function firstMetric(map, strategy) {
  const value = map && map[strategy];
  if (!Array.isArray(value) || !value.length) return {};
  return value[0] || {};
}

function metricSummary(row, strategy) {
  const cpc = firstMetric(row.cpc, strategy);
  const cpa = firstMetric(row.cpa, strategy);
  const acos = firstMetric(row.acos, strategy);
  return {
    cpcMedian: num(cpc.median),
    cpcStart: num(cpc.start),
    cpcEnd: num(cpc.end),
    cpaMedian: num(cpa.median),
    cpaStart: num(cpa.start),
    cpaEnd: num(cpa.end),
    acosMedian: num(acos.median),
    acosStart: num(acos.start),
    acosEnd: num(acos.end),
    categoryName: text(cpc.categoryName || cpa.categoryName || acos.categoryName),
    categoryId: text(cpc.categoryid || cpc.categoryId || cpa.categoryid || cpa.categoryId || acos.categoryid || acos.categoryId),
  };
}

function hasAnyMetric(metrics = {}) {
  return [
    metrics.cpcMedian,
    metrics.cpcStart,
    metrics.cpcEnd,
    metrics.cpaMedian,
    metrics.cpaStart,
    metrics.cpaEnd,
    metrics.acosMedian,
    metrics.acosStart,
    metrics.acosEnd,
  ].some(value => value !== null && value !== undefined);
}

function buildStrategyMetrics(row = {}, strategies = STRATEGIES) {
  const result = {};
  for (const strategy of strategies) {
    const metrics = metricSummary(row, strategy);
    if (hasAnyMetric(metrics)) result[strategy] = metrics;
  }
  return result;
}

function chooseBestCostStrategy(strategyMetrics = {}) {
  const entries = Object.entries(strategyMetrics);
  if (!entries.length) return '';
  const score = metrics => {
    const acos = metrics.acosMedian == null ? 999 : metrics.acosMedian;
    const cpa = metrics.cpaMedian == null ? 999 : metrics.cpaMedian;
    const cpc = metrics.cpcMedian == null ? 999 : metrics.cpcMedian;
    return (acos * 1000000) + (cpa * 1000) + cpc;
  };
  entries.sort((a, b) => score(a[1]) - score(b[1]));
  return entries[0][0];
}

function classifyMarketQuality(row = {}) {
  const purchaseVolume = num(row.purchaseVolume, 0);
  const clickPurchaseRatio = num(row.clickPurchaseRatio, null);
  if (!purchaseVolume || clickPurchaseRatio === null) return 'no_conversion_proof';
  if (purchaseVolume >= 100 && clickPurchaseRatio >= 0.05) return 'strong';
  if (purchaseVolume >= 3 && clickPurchaseRatio >= 0.035) return 'usable_niche';
  if (purchaseVolume >= 1 && clickPurchaseRatio >= 0.015) return 'test_only';
  return 'weak';
}

function classifyCostRisk(metrics = {}) {
  const acos = num(metrics.acosMedian, null);
  const cpa = num(metrics.cpaMedian, null);
  const cpc = num(metrics.cpcMedian, null);
  if (acos !== null) {
    if (acos >= 0.9) return 'high';
    if (acos >= 0.55) return 'medium';
    return 'low';
  }
  if (cpa !== null) {
    if (cpa >= 20) return 'high';
    if (cpa >= 10) return 'medium';
    return 'low';
  }
  if (cpc !== null) {
    if (cpc >= 1.2) return 'high';
    if (cpc >= 0.65) return 'medium';
    return 'low';
  }
  return 'unknown';
}

function recommendedUseFor(marketQuality, costRisk) {
  if (marketQuality === 'no_conversion_proof' || marketQuality === 'weak') return 'avoid_or_hold';
  if (costRisk === 'high') return 'cross_check_before_spend';
  if (marketQuality === 'strong') return 'candidate_exact_or_phrase';
  if (marketQuality === 'usable_niche') return 'low_bid_test_or_cross_check';
  return 'observe_or_low_bid_test';
}

function evidenceNotesFor(row = {}, metrics = {}, bestCostStrategy = '') {
  const notes = [
    `searchVolume=${num(row.searchVolume, 0)}`,
    `clickVolume=${num(row.clickVolume, 0)}`,
    `purchaseVolume=${num(row.purchaseVolume, 0)}`,
    `clickPurchaseRatio=${num(row.clickPurchaseRatio, null)}`,
  ];
  if (metrics.cpcMedian !== null) notes.push(`selectedCpcMedian=${metrics.cpcMedian}`);
  if (metrics.cpaMedian !== null) notes.push(`selectedCpaMedian=${metrics.cpaMedian}`);
  if (metrics.acosMedian !== null) notes.push(`selectedAcosMedian=${metrics.acosMedian}`);
  if (bestCostStrategy) notes.push(`bestCostStrategy=${bestCostStrategy}`);
  return notes;
}

function defaultCrossChecks() {
  return [
    {
      tool: 'ad_backend',
      status: 'needed',
      purpose: 'compare this market keyword signal with our SKU CTR, CVR, CPC, ACOS, and order evidence before increasing spend',
    },
    {
      tool: 'aba_search_terms',
      status: 'needed',
      purpose: 'confirm demand rank, trend direction, and whether the term is still current',
    },
    {
      tool: 'reverse_search_terms',
      status: 'needed',
      purpose: 'confirm the keyword belongs to the target ASIN/product class instead of an adjacent market',
    },
    {
      tool: 'listing_price_review',
      status: 'needed_if_our_sku_underperforms',
      purpose: 'separate weak keyword demand from price, image, review, or listing conversion problems',
    },
  ];
}

function summarizeKeywordConversionRows(rows = [], options = {}) {
  const strategy = text(options.strategy) || DEFAULT_STRATEGY;
  return (Array.isArray(rows) ? rows : []).map(row => {
    const selectedMetrics = metricSummary(row, strategy);
    const strategyMetrics = buildStrategyMetrics(row);
    const bestCostStrategy = chooseBestCostStrategy(strategyMetrics);
    const marketQuality = classifyMarketQuality(row);
    const costRisk = classifyCostRisk(selectedMetrics);
    const recommendedUse = recommendedUseFor(marketQuality, costRisk);
    return {
      keyword: text(row.keyword),
      translateKeyword: text(row.translateKeyword),
      searchVolume: num(row.searchVolume, 0),
      clickVolume: num(row.clickVolume, 0),
      purchaseVolume: num(row.purchaseVolume, 0),
      searchClickRatio: num(row.searchClickRatio),
      searchPurchaseRatio: num(row.searchPurchaseRatio),
      clickPurchaseRatio: num(row.clickPurchaseRatio),
      source: text(row.source),
      period: text(row.period),
      updateTime: text(row.updateTime),
      minKwPrice: num(row.minKwPrice),
      avgKwPrice: num(row.avgKwPrice),
      maxKwPrice: num(row.maxKwPrice),
      strategy,
      ...selectedMetrics,
      strategyMetrics,
      bestCostStrategy,
      marketQuality,
      costRisk,
      recommendedUse,
      decisionConfidence: marketQuality === 'strong' && costRisk !== 'high' ? 'medium_high' : 'medium',
      topAsinCount: Array.isArray(row.topAsins) ? row.topAsins.length : 0,
      asinConversionSample: Array.isArray(row.asinsClickPurchaseRatio)
        ? row.asinsClickPurchaseRatio.slice(0, 3).map(item => ({
          asin: text(item.asin),
          clickPurchaseRatio: num(item.clickPurchaseRatio),
        }))
        : [],
      evidenceNotes: evidenceNotesFor(row, selectedMetrics, bestCostStrategy),
      crossChecks: defaultCrossChecks(),
    };
  });
}

function dataAgeDays(weekDate, generatedAt) {
  const week = text(weekDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  const generated = text(generatedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generated)) return null;
  const start = Date.parse(`${week}T00:00:00Z`);
  const end = Date.parse(`${generated}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function countBy(rows = [], field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildKeywordConversionReport(options = {}) {
  const requestedKeywords = normalizeKeywords(options.requestedKeywords || options.keywords || []);
  const extracted = options.extracted || {};
  const strategy = text(options.strategy) || DEFAULT_STRATEGY;
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const rows = summarizeKeywordConversionRows(extracted.rows || [], { strategy });
  const returned = new Set(rows.map(row => row.keyword.toLowerCase()).filter(Boolean));
  const missingKeywords = requestedKeywords.filter(keyword => !returned.has(keyword.toLowerCase()));
  const staleDays = dataAgeDays(extracted.weekDate, generatedAt);

  return {
    source: 'selection_keyword_conversion_rate',
    generatedAt,
    period: {
      weekNumber: extracted.weekNumber ?? null,
      weekDate: extracted.weekDate || null,
      dataAgeDays: staleDays,
      freshness: staleDays === null ? 'unknown' : (staleDays <= 14 ? 'fresh' : (staleDays <= 35 ? 'usable_with_lag' : 'stale')),
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
      reason: 'market keyword conversion data is decision support only; cross-check with SKU-level ads, listing, and demand tools before spend changes',
    },
    operatorSummary: {
      byMarketQuality: countBy(rows, 'marketQuality'),
      byCostRisk: countBy(rows, 'costRisk'),
      byRecommendedUse: countBy(rows, 'recommendedUse'),
    },
    crossValidationPlan: defaultCrossChecks(),
    rows,
  };
}

module.exports = {
  DEFAULT_STRATEGY,
  STRATEGIES,
  buildKeywordConversionPayload,
  buildKeywordConversionReport,
  classifyCostRisk,
  classifyMarketQuality,
  extractKeywordConversionResult,
  normalizeKeywords,
  summarizeKeywordConversionRows,
};
