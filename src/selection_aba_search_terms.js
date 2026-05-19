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
  const order = text(value).toLowerCase();
  return order === 'desc' ? 'desc' : 'asc';
}

function buildAbaSearchTermPayload(options = {}) {
  const searchTerms = normalizeSearchTerms(
    options.searchTerms || options.terms || options.keywords || options.stValue || []
  );
  const stValue = text(options.stValue) || searchTerms.join(',');
  return {
    site: text(options.site) || '1',
    dateType: text(options.dateType) || '2',
    uTime: text(options.uTime || options.date || options.period),
    stValue,
    stType: text(options.stType) || '1',
    titleType: positiveInt(options.titleType, 2),
    category: normalizeCategory(options.category),
    advancedSearch: options.advancedSearch && typeof options.advancedSearch === 'object'
      ? options.advancedSearch
      : {},
    pageNo: positiveInt(options.pageNo || options.pageNum || options.page, 1),
    pageSize: positiveInt(options.pageSize || options.limit, 50),
    pageType: positiveInt(options.pageType, 1),
    column: text(options.column || options.sortBy) || 'rank',
    order: normalizeOrder(options.order),
  };
}

function buildAbaSearchTermPayloads(options = {}) {
  const searchTerms = normalizeSearchTerms(
    options.searchTerms || options.terms || options.keywords || options.stValue || []
  );
  if (!searchTerms.length || options.joinTerms === true) {
    return [buildAbaSearchTermPayload(options)];
  }
  return searchTerms.map(term => buildAbaSearchTermPayload({
    ...options,
    searchTerms: [term],
    stValue: term,
  }));
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

function extractAbaSearchTermResult(response = {}) {
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

function topAsinsFor(row = {}) {
  const asins = [];
  for (const index of [1, 2, 3]) {
    const asin = text(row[`asin${index}`]);
    if (!asin) continue;
    asins.push({
      asin,
      clickShare: num(row[`click_share${index}`]),
      conversionShare: num(row[`conversion_share${index}`]),
    });
  }
  return asins;
}

function categoryPathFor(row = {}) {
  return [row.st_category1, row.st_category2, row.st_category3]
    .map(text)
    .filter(Boolean);
}

function classifyDemand(row = {}) {
  const rank = num(row.rank, null);
  const searchVolume = num(row.search_volume ?? row.searchVolume, 0);
  const orders = num(row.orders, 0);
  if ((rank !== null && rank > 0 && rank <= 5000) || searchVolume >= 100000 || orders >= 10000) return 'high';
  if ((rank !== null && rank > 0 && rank <= 50000) || searchVolume >= 10000 || orders >= 1000) return 'medium';
  return 'low';
}

function classifyCompetition(row = {}) {
  const brandMonopoly = num(row.brand_monopoly ?? row.brandMonopoly, 0);
  const sellerMonopoly = num(row.seller_monopoly ?? row.sellerMonopoly, 0);
  const supplyDemand = num(row.supply_demand ?? row.supplyDemand, 0);
  const clickShare = num(row.total_click_share ?? row.totalClickShare, 0);
  const conversionShare = num(row.total_conversion_share ?? row.totalConversionShare, 0);

  if (
    brandMonopoly >= 0.55 ||
    sellerMonopoly >= 0.55 ||
    supplyDemand >= 0.6 ||
    (clickShare >= 0.55 && conversionShare >= 0.35)
  ) return 'high';

  if (
    brandMonopoly >= 0.25 ||
    sellerMonopoly >= 0.25 ||
    supplyDemand >= 0.25 ||
    clickShare >= 0.25 ||
    conversionShare >= 0.2
  ) return 'medium';

  return 'low';
}

function recommendedUseFor(demandTier, competitionTier) {
  if (demandTier === 'high') {
    return competitionTier === 'low'
      ? 'candidate_market_validation'
      : 'cross_check_with_sku_fit';
  }
  if (demandTier === 'medium') {
    return competitionTier === 'high'
      ? 'cross_check_with_sku_fit'
      : 'niche_or_low_bid_test';
  }
  return competitionTier === 'high' ? 'hold_or_research_only' : 'research_only';
}

function evidenceNotesFor(row = {}) {
  const notes = [
    `rank=${num(row.rank, null)}`,
    `searchVolume=${num(row.search_volume ?? row.searchVolume, 0)}`,
    `orders=${num(row.orders, 0)}`,
    `top3ClickShare=${num(row.total_click_share ?? row.totalClickShare, null)}`,
    `top3ConversionShare=${num(row.total_conversion_share ?? row.totalConversionShare, null)}`,
    `brandMonopoly=${num(row.brand_monopoly ?? row.brandMonopoly, null)}`,
    `sellerMonopoly=${num(row.seller_monopoly ?? row.sellerMonopoly, null)}`,
    `supplyDemand=${num(row.supply_demand ?? row.supplyDemand, null)}`,
  ];
  const marketTag = text(row.usr_mask_type);
  if (marketTag) notes.push(`marketTag=${marketTag}`);
  const newMarket = text(row.is_new_market_segment);
  if (newMarket) notes.push(`newMarketSegment=${newMarket}`);
  return notes;
}

function defaultCrossChecks() {
  return [
    {
      tool: 'selection_keyword_conversion_rate',
      status: 'needed',
      purpose: 'compare ABA demand rank and monopoly signals with keyword conversion CPC/CPA/ACOS before spending or product selection',
    },
    {
      tool: 'ad_backend',
      status: 'needed',
      purpose: 'compare market demand with our SKU CTR, CVR, CPC, ACOS, order evidence, and current campaign limits',
    },
    {
      tool: 'reverse_search_terms',
      status: 'needed_if_candidate',
      purpose: 'confirm the term belongs to the target ASIN and not an adjacent market',
    },
    {
      tool: 'listing_price_review',
      status: 'needed_if_our_sku_underperforms',
      purpose: 'separate weak market demand from price, image, review, or listing conversion problems',
    },
  ];
}

function summarizeAbaSearchTermRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const demandTier = classifyDemand(row);
    const competitionTier = classifyCompetition(row);
    const recommendedUse = recommendedUseFor(demandTier, competitionTier);
    return {
      searchTerm: text(row.search_term || row.searchTerm),
      rank: num(row.rank),
      searchVolume: num(row.search_volume ?? row.searchVolume, 0),
      estimatedOrders: num(row.orders, 0),
      amazonMonthlySales: num(row.amazon_monthly_sales ?? row.amazonMonthlySales),
      priceAvg: num(row.price_avg ?? row.priceAvg),
      ratingAvg: num(row.rating_avg ?? row.ratingAvg),
      reviewAvg: num(row.total_comments_avg ?? row.reviewAvg),
      topAsins: topAsinsFor(row),
      totalClickShare: num(row.total_click_share ?? row.totalClickShare),
      totalConversionShare: num(row.total_conversion_share ?? row.totalConversionShare),
      categoryPath: categoryPathFor(row),
      categoryId: text(row.category_id || row.categoryId),
      marketCycleType: num(row.market_cycle_type ?? row.marketCycleType),
      aoAvg: num(row.st_ao_avg ?? row.aoAvg),
      aoValueMatrix: num(row.st_ao_val_matrix ?? row.aoValueMatrix),
      aoValueRate: num(row.st_ao_val_rate ?? row.aoValueRate),
      organicFlowShare: num(row.st_zr_flow_proportion ?? row.organicFlowShare),
      flowProportionMatrix: num(row.st_flow_proportion_matrix ?? row.flowProportionMatrix),
      adKeywordCount: num(row.st_sp_counts ?? row.adKeywordCount, 0),
      organicKeywordCount: num(row.st_zr_counts ?? row.organicKeywordCount, 0),
      brandCount: num(row.page3_brand_num ?? row.brandCount),
      sellerCount: num(row.page3_seller_num ?? row.sellerCount),
      brandMonopoly: num(row.brand_monopoly ?? row.brandMonopoly),
      sellerMonopoly: num(row.seller_monopoly ?? row.sellerMonopoly),
      supplyDemand: num(row.supply_demand ?? row.supplyDemand),
      totalAsinNum: num(row.total_asin_num ?? row.totalAsinNum),
      quantityBeingSold: num(row.quantity_being_sold ?? row.quantityBeingSold),
      newAsinNum: num(row.new_asin_num ?? row.newAsinNum, 0),
      newAsinProportion: num(row.new_asin_proportion ?? row.newAsinProportion),
      newAsinOrders: num(row.new_asin_orders ?? row.newAsinOrders, 0),
      newBsrOrdersProportion: num(row.new_bsr_orders_proportion ?? row.newBsrOrdersProportion),
      bsrOrders: num(row.bsr_orders ?? row.bsrOrders),
      top3SellerOrders: num(row.top3_seller_orders ?? row.top3SellerOrders),
      top3SellerBsrOrders: num(row.top3_seller_bsr_orders ?? row.top3SellerBsrOrders),
      top3BrandOrders: num(row.top3_brand_orders ?? row.top3BrandOrders),
      top3BrandBsrOrders: num(row.top3_brand_bsr_orders ?? row.top3BrandBsrOrders),
      titleLengthAvg: num(row.title_length_avg ?? row.titleLengthAvg),
      page1TitleProportion: num(row.page1_title_proportion ?? row.page1TitleProportion),
      organicTitleAppearRate: num(row.st_zr_page123_title_appear_rate ?? row.organicTitleAppearRate),
      multiSizeProportion: num(row.multi_size_proportion ?? row.multiSizeProportion),
      colorProportion: num(row.color_proportion ?? row.colorProportion),
      multiColorProportion: num(row.multi_color_proportion ?? row.multiColorProportion),
      maxNum: num(row.max_num ?? row.maxNum),
      maxNumAsin: text(row.max_num_asin || row.maxNumAsin),
      flags: [
        row.is_search_text,
        row.is_ascending_text,
        row.is_first_text,
        row.is_high_return_text,
        row.is_new_market_segment,
        row.usr_mask_type,
      ].map(text).filter(Boolean),
      demandTier,
      competitionTier,
      recommendedUse,
      decisionConfidence: demandTier === 'high' && competitionTier !== 'high' ? 'medium_high' : 'medium',
      evidenceNotes: evidenceNotesFor(row),
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

function freshnessFor(dateType, ageDays) {
  if (ageDays === null) return 'unknown';
  const type = text(dateType);
  if (type === '5') return ageDays <= 3 ? 'fresh' : (ageDays <= 10 ? 'usable_with_lag' : 'stale');
  if (type === '1') return ageDays <= 14 ? 'fresh' : (ageDays <= 35 ? 'usable_with_lag' : 'stale');
  return ageDays <= 45 ? 'fresh' : (ageDays <= 90 ? 'usable_with_lag' : 'stale');
}

function countBy(rows = [], field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildAbaSearchTermReport(options = {}) {
  const requestedSearchTerms = normalizeSearchTerms(
    options.requestedSearchTerms || options.searchTerms || options.terms || []
  );
  const extracted = options.extracted || {};
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const dateType = text(options.dateType) || '2';
  const uTime = text(options.uTime || options.date || options.period);
  const rows = summarizeAbaSearchTermRows(extracted.rows || []);
  const returned = new Set(rows.map(row => row.searchTerm.toLowerCase()).filter(Boolean));
  const missingSearchTerms = requestedSearchTerms.filter(term => !returned.has(term.toLowerCase()));
  const ageDays = dataAgeDays(uTime, generatedAt);

  return {
    source: 'selection_aba_search_terms',
    generatedAt,
    period: {
      dateType,
      uTime,
      dataAgeDays: ageDays,
      freshness: freshnessFor(dateType, ageDays),
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
      reason: 'ABA search term data is market evidence only; do not create or change ads until SKU fit, ad backend performance, and conversion cost are cross-checked',
    },
    operatorSummary: {
      byDemandTier: countBy(rows, 'demandTier'),
      byCompetitionTier: countBy(rows, 'competitionTier'),
      byRecommendedUse: countBy(rows, 'recommendedUse'),
    },
    crossValidationPlan: defaultCrossChecks(),
    rows,
  };
}

module.exports = {
  buildAbaSearchTermPayload,
  buildAbaSearchTermPayloads,
  buildAbaSearchTermReport,
  classifyCompetition,
  classifyDemand,
  extractAbaSearchTermResult,
  normalizeSearchTerms,
  summarizeAbaSearchTermRows,
};
