const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');
const { buildSelectionOperatingIntelligence } = require('./selection_operating_intelligence');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, fallback = 0) {
  const n = num(value, fallback);
  if (!n) return n;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function firstText(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key])) return text(row[key]);
  }
  return '';
}

function firstNumber(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return num(row[key]);
  }
  return 0;
}

function rowSku(row = {}) {
  return text(row.sku || row.SKU || row.localSku || row.itemSku).toUpperCase();
}

function normalizeMetricRow(row = {}) {
  const spend = firstNumber(row, ['spend', 'cost', 'advCost', 'adCost', '广告花费', '花费']);
  const orders = firstNumber(row, ['orders', 'orderCount', 'advOrders', 'adOrders', '广告订单', '订单']);
  const sales = firstNumber(row, ['sales', 'advSales', 'adSales', 'orderSales', '广告销售额', '销售额']);
  const acosRaw = firstNumber(row, ['acos', 'ACOS', 'advAcos']);
  const acos = acosRaw > 1 ? acosRaw / 100 : (acosRaw || (sales > 0 ? spend / sales : 0));
  return {
    sku: rowSku(row),
    spend,
    orders,
    sales,
    netProfit: firstNumber(row, ['netProfit', 'net_profit', 'profit', 'profitAmount']),
    acos,
    clicks: firstNumber(row, ['clicks', 'click', '广告点击', '点击']),
    impressions: firstNumber(row, ['impressions', 'impression', '广告曝光', '曝光']),
  };
}

function normalizeAdSkuSummaryReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeMetricRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || '/product/adSkuSummary',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function normalizeInventoryRow(row = {}) {
  const fulfillable = firstNumber(row, ['fulfillable', 'fulFillable', 'ful', 'stockFul', 'FBA可售', '可售']);
  const reserved = firstNumber(row, ['reserved', 'reservedQty', 'res', 'stockRes', '预留']);
  const inbound = firstNumber(row, ['inbound', 'inboundQty', 'inb', 'stockInb', 'inbAndAll', 'inb_and_all', '在途']);
  const explicitTotal = firstNumber(row, ['totalInventory', 'inventoryQuantity', 'absoluteInventory', 'stockTotal', '总库存']);
  const totalInventory = explicitTotal || fulfillable + reserved + inbound;
  return {
    sku: rowSku(row),
    fulfillable,
    reserved,
    inbound,
    fulRes: fulfillable + reserved,
    totalInventory,
    sellableDays: firstNumber(row, ['sellableDays', 'inventoryDays', 'invDays', 'sellableDays7d', 'sellableDays_7d', '库存天数', '可售天数']),
    units7d: firstNumber(row, ['units7d', 'unitsSold_7d', 'sales7d', '7d销量', '近7天销量']),
    units30d: firstNumber(row, ['units30d', 'unitsSold_30d', 'sales30d', '30d销量', '近30天销量']),
  };
}

function normalizeInventoryReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeInventoryRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'inventory',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function normalizeProfitRow(row = {}) {
  return {
    sku: rowSku(row),
    profitRate: pct(firstNumber(row, ['profitRate', 'profit_rate', 'profit', 'profit_raw', 'net_profit', 'netProfitRate', '净利率', '利润率'])),
    grossProfitRate: pct(firstNumber(row, ['grossProfitRate', 'gross_profit_rate', 'grossProfit', '毛利率'])),
    netProfit: firstNumber(row, ['netProfit', 'net_profit_amount', 'profitAmount', 'profit_value', '净利润']),
    price: firstNumber(row, ['price', 'salePrice', 'currentPrice', '售价']),
    refundRate: pct(firstNumber(row, ['refundRate', 'refund_rate', 'refund_percent', '退货率'])),
  };
}

function normalizeProfitReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeProfitRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'profit',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function termKey(value) {
  return text(value).toLowerCase();
}

function normalizeKeywordConversionReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const keyword = termKey(row.keyword || row.searchTerm || row.term);
    if (!keyword) continue;
    byTerm[keyword] = {
      keyword,
      marketQuality: text(row.marketQuality || row.quality),
      costRisk: text(row.costRisk),
      recommendedUse: text(row.recommendedUse),
      searchVolume: num(row.searchVolume),
      purchaseVolume: num(row.purchaseVolume),
      clickPurchaseRatio: num(row.clickPurchaseRatio),
      cpcMedian: num(row.cpcMedian),
      cpaMedian: num(row.cpaMedian),
      acosMedian: num(row.acosMedian),
    };
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_keyword_conversion_rate',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeAbaSearchTermReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const searchTerm = termKey(row.searchTerm || row.search_term || row.keyword || row.term);
    if (!searchTerm) continue;
    byTerm[searchTerm] = {
      searchTerm,
      demandTier: text(row.demandTier),
      competitionTier: text(row.competitionTier),
      recommendedUse: text(row.recommendedUse),
      rank: num(row.rank),
      searchVolume: num(row.searchVolume || row.search_volume),
      estimatedOrders: num(row.estimatedOrders || row.orders),
      totalClickShare: num(row.totalClickShare || row.total_click_share),
      totalConversionShare: num(row.totalConversionShare || row.total_conversion_share),
      topAsinCount: Array.isArray(row.topAsins) ? row.topAsins.length : num(row.topAsinCount),
      aoValue: num(row.aoValue ?? row.aoVal ?? row.ao),
      brandMonopoly: num(row.brandMonopoly ?? row.brandMonopolyRate ?? row.brandMonopolyCoefficient),
      sellerMonopoly: num(row.sellerMonopoly ?? row.sellerMonopolyRate ?? row.sellerMonopolyCoefficient),
      supplyDemand: num(row.supplyDemand ?? row.supplyDemandIndex ?? row.supplyDemandRatio),
      productCount: num(row.productCount ?? row.sellingProductCount ?? row.totalProducts ?? row.asinCount),
      newProductShare: num(row.newProductShare ?? row.newAsinShare),
      newProductSalesShare: num(row.newProductSalesShare ?? row.newProductSalesRatio),
      titleDensity: num(row.titleDensity ?? row.titleShare ?? row.titleRate),
      adTitleDensity: num(row.adTitleDensity ?? row.adTitleShare ?? row.adTitleRate),
      avgPrice: num(row.avgPrice ?? row.averagePrice ?? row.productAveragePrice),
      avgRating: num(row.avgRating ?? row.averageRating),
      avgReviewCount: num(row.avgReviewCount ?? row.averageReviewCount ?? row.reviewAvg),
      aPlusRate: num(row.aPlusRate ?? row.aPlusShare),
      videoRate: num(row.videoRate ?? row.videoShare),
      fbmShare: num(row.fbmShare ?? row.fbmRate),
      chinaSellerShare: num(row.chinaSellerShare ?? row.cnSellerShare),
      amazonSelfShare: num(row.amazonSelfShare ?? row.amazonShare),
      keywordType: text(row.keywordType || row.type),
      marketCycle: text(row.marketCycle || row.market_cycle),
    };
  }
  const byQuery = {};
  const queryRows = report.queryRows && typeof report.queryRows === 'object' ? report.queryRows : {};
  for (const [term, row] of Object.entries(queryRows)) {
    const searchTerm = termKey(term || row?.searchTerm || row?.term);
    if (!searchTerm) continue;
    byQuery[searchTerm] = {
      searchTerm,
      demandTier: text(row.demandTier || 'query_returned'),
      competitionTier: text(row.competitionTier || 'unknown'),
      recommendedUse: text(row.recommendedUse || 'cross_check_with_returned_terms'),
      rank: num(row.rank),
      searchVolume: num(row.searchVolume || row.search_volume),
      estimatedOrders: num(row.estimatedOrders || row.orders),
      totalClickShare: num(row.totalClickShare || row.total_click_share),
      totalConversionShare: num(row.totalConversionShare || row.total_conversion_share),
      topAsinCount: Array.isArray(row.topAsins) ? row.topAsins.length : num(row.topAsinCount),
      aoValue: num(row.aoValue ?? row.aoVal ?? row.ao),
      brandMonopoly: num(row.brandMonopoly ?? row.brandMonopolyRate ?? row.brandMonopolyCoefficient),
      sellerMonopoly: num(row.sellerMonopoly ?? row.sellerMonopolyRate ?? row.sellerMonopolyCoefficient),
      supplyDemand: num(row.supplyDemand ?? row.supplyDemandIndex ?? row.supplyDemandRatio),
      productCount: num(row.productCount ?? row.sellingProductCount ?? row.totalProducts ?? row.asinCount),
      newProductShare: num(row.newProductShare ?? row.newAsinShare),
      newProductSalesShare: num(row.newProductSalesShare ?? row.newProductSalesRatio),
      titleDensity: num(row.titleDensity ?? row.titleShare ?? row.titleRate),
      adTitleDensity: num(row.adTitleDensity ?? row.adTitleShare ?? row.adTitleRate),
      avgPrice: num(row.avgPrice ?? row.averagePrice ?? row.productAveragePrice),
      avgRating: num(row.avgRating ?? row.averageRating),
      avgReviewCount: num(row.avgReviewCount ?? row.averageReviewCount ?? row.reviewAvg),
      aPlusRate: num(row.aPlusRate ?? row.aPlusShare),
      videoRate: num(row.videoRate ?? row.videoShare),
      fbmShare: num(row.fbmShare ?? row.fbmRate),
      chinaSellerShare: num(row.chinaSellerShare ?? row.cnSellerShare),
      amazonSelfShare: num(row.amazonSelfShare ?? row.amazonShare),
      keywordType: text(row.keywordType || row.type),
      marketCycle: text(row.marketCycle || row.market_cycle),
      returnedRows: num(row.returnedRows),
      total: num(row.total),
    };
  }
  for (const item of report.apiResults || []) {
    const searchTerm = termKey(item.request?.stValue || item.stValue || item.searchTerm || item.term);
    if (!searchTerm || byQuery[searchTerm] || num(item.rowCount) <= 0) continue;
    byQuery[searchTerm] = {
      searchTerm,
      demandTier: 'query_returned',
      competitionTier: 'unknown',
      recommendedUse: 'cross_check_with_returned_terms',
      rank: 0,
      searchVolume: 0,
      estimatedOrders: 0,
      totalClickShare: 0,
      totalConversionShare: 0,
      topAsinCount: 0,
      returnedRows: num(item.rowCount),
      total: num(item.total),
    };
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_aba_search_terms',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    queryRows: byQuery,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeKeywordSeasonalityReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const searchTerm = termKey(row.searchTerm || row.search_term || row.keyword || row.term);
    if (!searchTerm) continue;
    byTerm[searchTerm] = {
      searchTerm,
      seasonalityType: text(row.seasonalityType),
      peakQuarter: text(row.peakQuarter),
      maxOrdersMonth: text(row.maxOrdersMonth || row.max_orders_month),
      quarterRatio: num(row.quarterRatio),
      totalOrders: num(row.totalOrders || row.orders),
      rank: num(row.rank),
      searchVolume: num(row.searchVolume || row.search_volume),
      asinCount: num(row.asinCount || row.asin_counts),
      googleTrend: row.googleTrend && typeof row.googleTrend === 'object' ? {
        latestValue: num(row.googleTrend.latestValue),
        maxValue: num(row.googleTrend.maxValue),
        minValue: num(row.googleTrend.minValue),
        averageValue: num(row.googleTrend.averageValue),
        direction: text(row.googleTrend.direction),
      } : {},
      competitorSummary: row.competitorSummary && typeof row.competitorSummary === 'object' ? {
        asinCount: num(row.competitorSummary.asinCount),
        priceAvg: num(row.competitorSummary.priceAvg),
        ratingAvg: num(row.competitorSummary.ratingAvg),
        reviewAvg: num(row.competitorSummary.reviewAvg),
        brandCount: num(row.competitorSummary.brandCount),
      } : {},
      buyerSearchTermCount: Array.isArray(row.buyerSearchTerms) ? row.buyerSearchTerms.length : 0,
      demandTier: text(row.demandTier),
      competitionTier: text(row.competitionTier),
      recommendedUse: text(row.recommendedUse),
      topMonths: Array.isArray(row.topMonths) ? row.topMonths.slice(0, 3) : [],
    };
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_keyword_seasonality',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeKeywordResearchReport(report = {}) {
  const candidates = Array.isArray(report.candidateKeywords) ? report.candidateKeywords : [];
  const direct = Array.isArray(report.directCompetitorAsins) ? report.directCompetitorAsins : [];
  const scene = Array.isArray(report.sceneCompetitorAsins) ? report.sceneCompetitorAsins : [];
  const bridge = Array.isArray(report.trafficBridgeAsins) ? report.trafficBridgeAsins : [];
  const excluded = Array.isArray(report.excludedAsins) ? report.excludedAsins : [];
  const byTerm = {};
  const ensure = term => {
    const key = termKey(term);
    if (!key) return null;
    if (!byTerm[key]) {
      byTerm[key] = {
        term: key,
        directCompetitors: 0,
        sceneCompetitors: 0,
        trafficBridgeCompetitors: 0,
        excluded: 0,
        candidate: null,
        readyForDecisionSupport: false,
        evidenceNotes: [],
      };
    }
    return byTerm[key];
  };
  for (const candidate of candidates) {
    const row = ensure(candidate.term || candidate.keyword || candidate.searchTerm);
    if (!row) continue;
    row.candidate = {
      term: row.term,
      source: text(candidate.source),
      nextCheck: Array.isArray(candidate.nextCheck) ? candidate.nextCheck.map(text).filter(Boolean) : [],
    };
    row.evidenceNotes.push(...(Array.isArray(candidate.evidence) ? candidate.evidence.map(text).filter(Boolean) : []));
  }
  for (const item of direct) {
    const row = ensure(item.searchTerm || item.term || item.keyword);
    if (row) row.directCompetitors += 1;
  }
  for (const item of scene) {
    const row = ensure(item.searchTerm || item.term || item.keyword);
    if (row) row.sceneCompetitors += 1;
  }
  for (const item of bridge) {
    const row = ensure(item.searchTerm || item.term || item.keyword);
    if (row) row.trafficBridgeCompetitors += 1;
  }
  for (const item of excluded) {
    const row = ensure(item.searchTerm || item.term || item.keyword);
    if (row) row.excluded += 1;
  }
  for (const row of Object.values(byTerm)) {
    row.readyForDecisionSupport = row.directCompetitors + row.sceneCompetitors + row.trafficBridgeCompetitors > 0;
    row.evidenceNotes = [...new Set(row.evidenceNotes)];
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_keyword_research',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    summary: report.operatorSummary?.summary || report.summary || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeProductTimeMachineReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const keyword = termKey(row.searchKeyword || row.keyword || row.searchTerm || row.term);
    if (!keyword) continue;
    if (!byTerm[keyword]) byTerm[keyword] = [];
    byTerm[keyword].push({
      asin: text(row.asin),
      searchKeyword: keyword,
      title: text(row.title),
      price: num(row.price),
      rating: num(row.rating ?? row.star),
      reviewCount: num(row.reviewCount),
      boughtInPastMonthLowerBound: num(row.boughtInPastMonthLowerBound),
      demandTier: text(row.demandTier),
      trafficMix: text(row.trafficMix),
      trafficTerms: row.trafficTerms || {},
      organicFlowShare: num(row.organicFlowShare),
      aoVal: num(row.aoVal),
      recommendedUse: text(row.recommendedUse),
      rankHistory: row.rankHistory || {},
    });
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_product_time_machine',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: rows.length,
    rows: byTerm,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
    keywordHistory: Array.isArray(report.keywordHistory) ? report.keywordHistory : [],
  };
}

function normalizeExtendedSelectionReport(report = {}) {
  const rows = {};
  const summaries = Array.isArray(report.summaries) ? report.summaries : [];
  const missingEvidence = Array.isArray(report.missingEvidence) ? report.missingEvidence : [];
  const pendingPresets = Array.isArray(report.pendingPresets) ? report.pendingPresets : [];
  const dailyRanks = {
    bsrList: null,
    bsrOverview: null,
    newReleasesList: null,
    newReleasesOverview: null,
  };
  let categoryAnalysis = null;
  const flowThemeTags = {
    main: null,
    dimensions: null,
    matchWords: null,
  };
  const storeFeedback = {
    list: null,
    accountNum: null,
    sites: null,
    accounts: {},
  };
  const COMMENT_KEYS = new Set(['commentCount', 'commentAnalysis', 'commentGptData', 'commentRating', 'commentType', 'commentList']);
  const DAILY_RANK_LIST_KEYS = new Set(['bsrList', 'newReleasesList']);
  const DAILY_RANK_OVERVIEW_KEYS = new Set(['bsrOverview', 'newReleasesOverview']);
  const asinInfoValues = result => {
    if (Array.isArray(result)) return result;
    if (!result || typeof result !== 'object') return [];
    if (result.asin || result.ASIN || result.parentAsin) return [result];
    return Object.values(result).filter(value => value && typeof value === 'object');
  };
  const splitAsins = value => text(value).split(/[,，\s]+/).map(item => item.toUpperCase()).filter(Boolean);
  const requestedAsinsFor = request => [
    ...splitAsins(request.query?.asin),
    ...splitAsins(request.query?.asins),
    ...(Array.isArray(request.body?.asinList) ? request.body.asinList.map(item => text(item).toUpperCase()).filter(Boolean) : []),
  ].filter(Boolean);
  const pagedRecords = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['records', 'rows', 'list', 'data', 'content', 'items']) {
      if (Array.isArray(value[key])) return value[key];
    }
    return [];
  };
  const nullableNum = value => (value === null || value === undefined || text(value) === '' ? null : num(value, null));
  const normalizeDailyRankRow = (value = {}, request = {}) => ({
    list: request.key === 'newReleasesList' ? 'newReleases' : 'bsr',
    rankDate: text(request.query?.uTime),
    categoryType: text(request.query?.categoryType),
    asin: text(value.asin || value.ASIN).toUpperCase(),
    title: text(value.title),
    brandName: text(value.brandName),
    categoryId: text(value.categoryId),
    categoryName: text(value.categoryName),
    bsrRank: nullableNum(value.bsrRank ?? value.bsr_rank ?? value.rank),
    firstCategoryRank: nullableNum(value.firstCategoryRank),
    price: nullableNum(value.price),
    rating: nullableNum(value.rating),
    totalComments: nullableNum(value.totalComments ?? value.reviewCount),
    bsrOrders: nullableNum(value.bsrOrders),
    bsrOrdersChange: nullableNum(value.bsrOrdersChange),
    aoVal: nullableNum(value.aoVal),
    launchTime: text(value.launchTime),
    isNewAsin: !!(value.isAsinNew || value.isAsinBsrNew),
    sourceRow: value,
  });
  const addAsin = (asin, patch = {}) => {
    const key = text(asin).toUpperCase();
    if (!key) return null;
    if (!rows[key]) {
      rows[key] = {
        asin: key,
        asinInfo: null,
        associationFlow: [],
        adPlacement: [],
        trafficDetail: [],
        commentCount: null,
        commentAnalysis: null,
        commentGptData: null,
        commentRating: null,
        commentType: null,
        commentList: null,
        commentAsinStats: [],
        dailyRanks: [],
        storeFeedbackTopAsins: [],
        storeFeedbackNewAsins: [],
        sourceKeys: [],
      };
    }
    if (patch.asinInfo) rows[key].asinInfo = patch.asinInfo;
    if (Array.isArray(patch.associationFlow)) rows[key].associationFlow.push(...patch.associationFlow);
    if (Array.isArray(patch.adPlacement)) rows[key].adPlacement.push(...patch.adPlacement);
    if (Array.isArray(patch.trafficDetail)) rows[key].trafficDetail.push(...patch.trafficDetail);
    for (const commentKey of COMMENT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, commentKey)) rows[key][commentKey] = patch[commentKey];
    }
    if (Array.isArray(patch.commentAsinStats)) rows[key].commentAsinStats.push(...patch.commentAsinStats);
    if (Array.isArray(patch.dailyRanks)) rows[key].dailyRanks.push(...patch.dailyRanks);
    if (Array.isArray(patch.storeFeedbackTopAsins)) rows[key].storeFeedbackTopAsins.push(...patch.storeFeedbackTopAsins);
    if (Array.isArray(patch.storeFeedbackNewAsins)) rows[key].storeFeedbackNewAsins.push(...patch.storeFeedbackNewAsins);
    if (patch.sourceKey) rows[key].sourceKeys.push(patch.sourceKey);
    rows[key].sourceKeys = [...new Set(rows[key].sourceKeys)];
    return rows[key];
  };
  const accountKeyFor = request => text(request.query?.accountId || request.query?.accountName || 'selected_account');
  const ensureStoreAccount = request => {
    const key = accountKeyFor(request);
    if (!storeFeedback.accounts[key]) {
      storeFeedback.accounts[key] = {
        accountId: text(request.query?.accountId),
        accountName: text(request.query?.accountName),
        category: null,
        indicator: null,
        topAsins: null,
        categoryNum: null,
        newAsins: null,
        trend: null,
        asinNum: null,
      };
    }
    return storeFeedback.accounts[key];
  };

  for (const item of report.results || []) {
    const request = item.request || {};
    const result = item.api?.result ?? item.api?.json?.result ?? item.api?.json?.data ?? null;
    if (request.key === 'asinInfo') {
      const values = asinInfoValues(result);
      const requestedAsins = text(request.query?.asins).split(/[,，\s]+/).map(item => item.toUpperCase()).filter(Boolean);
      if (values.length) {
        for (const value of values) {
          const asin = value?.asin || value?.ASIN || value?.parentAsin || requestedAsins[0];
          addAsin(asin, { asinInfo: value, sourceKey: request.key });
        }
      } else {
        for (const asin of requestedAsins) addAsin(asin, { asinInfo: result || {}, sourceKey: request.key });
      }
    }
    if (request.key === 'associationFlow' || request.key === 'adPlacement') {
      const values = Array.isArray(result) ? result : [];
      const requestedAsins = Array.isArray(request.body?.asinList) ? request.body.asinList.map(item => text(item).toUpperCase()).filter(Boolean) : [];
      const evidenceKey = request.key === 'adPlacement' ? 'adPlacement' : 'associationFlow';
      for (const value of values) {
        const asin = value.relatedAsin || value.asin || value.relatedDetailVo?.asin;
        addAsin(asin, { [evidenceKey]: [value], sourceKey: request.key });
        if (value.relatedDetailVo?.isSelfAsin || requestedAsins.includes(text(asin).toUpperCase())) {
          addAsin(asin, { asinInfo: value.relatedDetailVo, sourceKey: request.key });
        }
      }
      for (const asin of requestedAsins) addAsin(asin, { sourceKey: request.key });
    }
    if (COMMENT_KEYS.has(request.key)) {
      const requestedAsins = requestedAsinsFor(request);
      for (const asin of requestedAsins) addAsin(asin, { [request.key]: result, sourceKey: request.key });
      if (request.key === 'commentAnalysis' && result && typeof result === 'object') {
        const stats = [
          ...(Array.isArray(result.haveComments) ? result.haveComments : []),
          ...(Array.isArray(result.noComments) ? result.noComments : []),
        ];
        for (const value of stats) {
          const asin = value.asin || value.ASIN || value.parentAsin;
          addAsin(asin, { commentAnalysis: result, commentAsinStats: [value], sourceKey: request.key });
        }
      }
    }
    if (request.key === 'trafficDetail') {
      const requestedAsins = requestedAsinsFor(request);
      const values = Array.isArray(result) ? result : [];
      const valuesWithAsin = values.filter(value => value.asin || value.ASIN || value.parentAsin);
      if (!valuesWithAsin.length) {
        for (const asin of requestedAsins) addAsin(asin, { trafficDetail: values, sourceKey: request.key });
      }
      for (const value of values) {
        const asin = value.asin || value.ASIN || value.parentAsin;
        if (asin) addAsin(asin, { trafficDetail: [value], sourceKey: request.key });
      }
      for (const asin of requestedAsins) addAsin(asin, { sourceKey: request.key });
    }
    if (DAILY_RANK_LIST_KEYS.has(request.key)) {
      const values = pagedRecords(result);
      dailyRanks[request.key] = {
        query: request.query || {},
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
      for (const value of values) {
        const rankRow = normalizeDailyRankRow(value, request);
        if (rankRow.asin) addAsin(rankRow.asin, { dailyRanks: [rankRow], sourceKey: request.key });
      }
    }
    if (DAILY_RANK_OVERVIEW_KEYS.has(request.key)) {
      dailyRanks[request.key] = {
        query: request.query || {},
        metrics: result && typeof result === 'object' ? result : {},
      };
    }
    if (request.key === 'categoryAnalysis') {
      const values = pagedRecords(result);
      categoryAnalysis = {
        query: request.query || {},
        category: text(request.body?.advancedSearch?.category || request.body?.category),
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
    }
    if (request.key === 'flowThemeMain') {
      const values = pagedRecords(result);
      flowThemeTags.main = {
        query: request.query || {},
        body: request.body || {},
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
    }
    if (request.key === 'flowThemeHistory') {
      const values = Array.isArray(result) ? result : pagedRecords(result);
      flowThemeTags.dimensions = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
    if (request.key === 'flowThemeMatchWord') {
      const values = pagedRecords(result);
      flowThemeTags.matchWords = {
        query: request.query || {},
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackList') {
      const values = pagedRecords(result);
      storeFeedback.list = {
        query: request.query || {},
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackAccountNum') {
      storeFeedback.accountNum = {
        query: request.query || {},
        metrics: result && typeof result === 'object' ? result : {},
      };
    }
    if (request.key === 'storeFeedbackSite') {
      const values = Array.isArray(result) ? result : pagedRecords(result);
      storeFeedback.sites = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackCategory') {
      const account = ensureStoreAccount(request);
      const values = Array.isArray(result) ? result : pagedRecords(result);
      account.category = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackIndicator') {
      const account = ensureStoreAccount(request);
      account.indicator = {
        query: request.query || {},
        metrics: result && typeof result === 'object' ? result : {},
      };
    }
    if (request.key === 'storeFeedbackTopAsin') {
      const account = ensureStoreAccount(request);
      const values = Array.isArray(result) ? result : pagedRecords(result);
      account.topAsins = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
      for (const value of values) {
        const asin = value.asin || value.ASIN || value.parentAsin;
        if (asin) addAsin(asin, { storeFeedbackTopAsins: [value], sourceKey: request.key });
      }
    }
    if (request.key === 'storeFeedbackCategoryNum') {
      const account = ensureStoreAccount(request);
      const values = Array.isArray(result) ? result : pagedRecords(result);
      account.categoryNum = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackNewAsin') {
      const account = ensureStoreAccount(request);
      const values = pagedRecords(result);
      account.newAsins = {
        query: request.query || {},
        rowCount: values.length,
        total: num(result?.total, null),
        rows: values,
      };
      for (const value of values) {
        const asin = value.asin || value.ASIN || value.parent_asin || value.parentAsin;
        if (asin) addAsin(asin, { storeFeedbackNewAsins: [value], sourceKey: request.key });
      }
    }
    if (request.key === 'storeFeedbackTrend') {
      const account = ensureStoreAccount(request);
      const values = Array.isArray(result) ? result : pagedRecords(result);
      account.trend = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
    if (request.key === 'storeFeedbackAsinNum') {
      const account = ensureStoreAccount(request);
      const values = Array.isArray(result) ? result : pagedRecords(result);
      account.asinNum = {
        query: request.query || {},
        rowCount: values.length,
        rows: values,
      };
    }
  }

  return {
    ok: report.ok === true,
    source: report.source || 'selection_extended_evidence',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(rows).length,
    rows,
    dailyRanks,
    categoryAnalysis,
    flowThemeTags,
    storeFeedback,
    summaries,
    pendingPresets,
    missingEvidence,
    evidenceBoundary: report.evidenceBoundary || 'selection_read_only_market_evidence',
    readyForAutoAction: false,
  };
}

function normalizeSelectionMarketReport(report = {}) {
  return {
    keywordResearch: normalizeKeywordResearchReport(
      report.keywordResearch || report.keywordResearchReport || report.research || {}
    ),
    keywordConversion: normalizeKeywordConversionReport(
      report.keywordConversion || report.keywordConversionReport || report.conversion || {}
    ),
    abaSearchTerms: normalizeAbaSearchTermReport(
      report.abaSearchTerms || report.abaSearchTermReport || report.aba || {}
    ),
    keywordSeasonality: normalizeKeywordSeasonalityReport(
      report.keywordSeasonality || report.keywordSeasonalityReport || report.seasonality || {}
    ),
    productTimeMachine: normalizeProductTimeMachineReport(
      report.productTimeMachine || report.productTimeMachineReport || report.timeMachine || {}
    ),
    extendedSelection: normalizeExtendedSelectionReport(
      report.extendedSelection || report.extendedSelectionReport || report.extended || {}
    ),
  };
}

function taskSubjectKey(task = {}) {
  const subject = task.subject || {};
  return text(subject.sku || subject.asin || subject.keyword || subject.entityId || task.taskId).toUpperCase();
}

function reviewSubjectKeys(queue = {}) {
  const due = queue.due || queue.tasks || [];
  return [...new Set(due.map(taskSubjectKey).filter(Boolean))];
}

function baselineForTask(task = {}) {
  return task.reviewPlan?.baseline || task.baseline || task.reviewBaseline || null;
}

function baselineAsOfForTask(task = {}, baseline = null) {
  return firstText(baseline || {}, ['asOf', 'asOfDate', 'exportedAt', 'dataDate', 'businessDate', 'capturedAt']) ||
    firstText(task.reviewPlan || {}, ['baselineAsOf', 'baselineDate', 'dataDate', 'businessDate', 'createdAt']) ||
    firstText(task, ['dataDate', 'businessDate', 'createdAt']);
}

function requestedMetrics(task = {}) {
  return (task.reviewPlan?.metrics || []).map(item => text(item).toLowerCase());
}

function marketTermsForTask(task = {}) {
  const values = [
    ...(Array.isArray(task.reviewPlan?.marketTerms) ? task.reviewPlan.marketTerms : []),
    ...(Array.isArray(task.marketTerms) ? task.marketTerms : []),
    task.subject?.keyword,
  ];
  return [...new Set(values.map(termKey).filter(Boolean))];
}

function normalizeReportMap(reports = {}, normalizeFn = value => value) {
  if (!reports || typeof reports !== 'object') return {};
  if (Array.isArray(reports.rows)) {
    const normalized = normalizeFn(reports);
    const mapped = {};
    for (const key of Object.keys(normalized.rows || {})) mapped[key] = normalized;
    return mapped;
  }

  const normalizedReports = {};
  for (const [key, report] of Object.entries(reports || {})) {
    const normalized = normalizeFn(report);
    const explicitKey = text(key).toUpperCase();
    if (explicitKey && (!normalizedReports[explicitKey] || normalized.rows?.[explicitKey])) {
      normalizedReports[explicitKey] = normalized;
    }
    for (const rowKey of Object.keys(normalized.rows || {})) {
      if (!normalizedReports[rowKey] || !normalizedReports[rowKey].rows?.[rowKey]) {
        normalizedReports[rowKey] = normalized;
      }
    }
  }
  return normalizedReports;
}

function sourceEntry(report = {}, fallbackSource = '') {
  return {
    source: report.source || fallbackSource,
    ok: report.ok === true,
    exportedAt: report.exportedAt || '',
  };
}

function nestedRowCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['records', 'rows', 'list', 'data', 'content', 'items', 'result']) {
    if (Array.isArray(value[key])) return value[key].length;
    const nested = nestedRowCount(value[key]);
    if (nested) return nested;
  }
  return 0;
}

function marketEvidenceForTask(task = {}, selection = {}) {
  const terms = marketTermsForTask(task);
  if (!terms.length) return null;
  const keywordResearch = selection.keywordResearch || {};
  const keywordConversion = selection.keywordConversion || {};
  const abaSearchTerms = selection.abaSearchTerms || {};
  const keywordSeasonality = selection.keywordSeasonality || {};
  const productTimeMachine = selection.productTimeMachine || {};
  const rows = terms.map(term => ({
    term,
    keywordResearch: keywordResearch.rows?.[term] || null,
    keywordConversion: keywordConversion.rows?.[term] || null,
    abaSearchTerm: abaSearchTerms.rows?.[term] || null,
    keywordSeasonality: keywordSeasonality.rows?.[term] || null,
    productTimeMachine: productTimeMachine.rows?.[term] || [],
  }));
  const operatingIntelligence = buildSelectionOperatingIntelligence({ evidenceRows: rows });
  return {
    terms: rows,
    coverage: {
      requested: terms.length,
      keywordResearchMatched: rows.filter(row => row.keywordResearch).length,
      keywordConversionMatched: rows.filter(row => row.keywordConversion).length,
      abaMatched: rows.filter(row => row.abaSearchTerm).length,
      seasonalityMatched: rows.filter(row => row.keywordSeasonality).length,
      productTimeMachineMatched: rows.filter(row => row.productTimeMachine?.length).length,
    },
    readyForDecisionSupport: operatingIntelligence.readyForDecisionSupport,
    readyForAutoAction: false,
    operatingIntelligence,
    riskSignals: operatingIntelligence.riskSignals,
  };
}

function productSelectionEvidenceForTask(task = {}, selection = {}) {
  const asin = text(task.subject?.asin || task.asin).toUpperCase();
  if (!asin) return null;
  const extended = selection.extendedSelection || {};
  const row = extended.rows?.[asin] || null;
  if (!row) return null;
  return {
    asin,
    readyForDecisionSupport: true,
    readyForAutoAction: false,
    asinInfo: row.asinInfo,
    associationFlowCount: row.associationFlow?.length || 0,
    adPlacementCount: row.adPlacement?.length || 0,
    trafficDetailCount: row.trafficDetail?.length || 0,
    commentListCount: nestedRowCount(row.commentList),
    dailyRankCount: row.dailyRanks?.length || 0,
    commentAsinStats: row.commentAsinStats || [],
    commentEvidence: {
      count: row.commentCount || null,
      analysis: row.commentAnalysis || null,
      gptData: row.commentGptData || null,
      rating: row.commentRating || null,
      type: row.commentType || null,
    },
    storeFeedbackTopAsinCount: row.storeFeedbackTopAsins?.length || 0,
    storeFeedbackNewAsinCount: row.storeFeedbackNewAsins?.length || 0,
    storeFeedbackEvidence: {
      topAsins: (row.storeFeedbackTopAsins || []).slice(0, 20),
      newAsins: (row.storeFeedbackNewAsins || []).slice(0, 20),
    },
    associationFlow: (row.associationFlow || []).slice(0, 20),
    adPlacement: (row.adPlacement || []).slice(0, 20),
    trafficDetail: (row.trafficDetail || []).slice(0, 50),
    dailyRanks: (row.dailyRanks || []).slice(0, 20),
    sourceKeys: row.sourceKeys || [],
    evidenceBoundary: extended.evidenceBoundary || 'selection_read_only_market_evidence',
  };
}

function marketRiskSignals(market = null) {
  if (!market) return [];
  const signals = [...(market.riskSignals || []), ...(market.operatingIntelligence?.riskSignals || [])];
  if (market.coverage?.requested > 0 && !market.readyForDecisionSupport) signals.push('market_evidence_missing');
  for (const row of market.terms || []) {
    const conversion = row.keywordConversion || {};
    const aba = row.abaSearchTerm || {};
    const seasonality = row.keywordSeasonality || {};
    if (['weak', 'no_conversion_proof'].includes(conversion.marketQuality)) signals.push('market_conversion_weak');
    if (conversion.costRisk === 'high') signals.push('market_cost_high');
    if (aba.demandTier === 'low') signals.push('market_demand_low');
    if (aba.competitionTier === 'high') signals.push('market_competition_high');
    if (seasonality.seasonalityType === 'strong_seasonal') signals.push('market_strong_seasonality');
    if (seasonality.demandTier === 'low') signals.push('market_demand_low');
    if (seasonality.competitionTier === 'high') signals.push('market_competition_high');
    if (seasonality.googleTrend?.direction === 'declining') signals.push('market_trend_declining');
    if (row.productTimeMachine?.some(item => item.trafficMix === 'ad_led')) signals.push('competitor_ad_pressure_high');
    if (row.keywordResearch && !row.keywordResearch.readyForDecisionSupport) signals.push('front_search_competitor_weak');
  }
  return signals;
}

function riskSignalsForEvidence(current = null, inventory = null, profit = null, market = null) {
  const signals = [];
  if (inventory) {
    const sellableDays = num(inventory.sellableDays, null);
    if (sellableDays !== null && sellableDays > 0 && sellableDays < 21) signals.push('inventory_tight');
    if (sellableDays !== null && sellableDays >= 120) signals.push('stale_inventory_pressure');
  }
  if (profit) {
    const profitRate = num(profit.profitRate, null);
    if (profitRate !== null && profitRate < 0) signals.push('profit_negative');
    if (current && profitRate !== null && profitRate > 0 && num(current.acos, 0) > profitRate) {
      signals.push('acos_above_profit_rate');
    }
  }
  signals.push(...marketRiskSignals(market));
  return [...new Set(signals)];
}

function buildReviewEvidence({ queue = {}, adReports = {}, inventoryReports = {}, profitReports = {}, selectionReports = {} } = {}) {
  const due = queue.due || queue.tasks || [];
  const normalizedAdReports = normalizeReportMap(adReports, normalizeAdSkuSummaryReport);
  const normalizedInventoryReports = normalizeReportMap(inventoryReports, normalizeInventoryReport);
  const normalizedProfitReports = normalizeReportMap(profitReports, normalizeProfitReport);
  const normalizedSelectionReports = normalizeSelectionMarketReport(selectionReports);
  const evidence = {};
  for (const task of due) {
    const key = taskSubjectKey(task);
    if (!key) continue;
    const adReport = normalizedAdReports[key] || {};
    const inventoryReport = normalizedInventoryReports[key] || {};
    const profitReport = normalizedProfitReports[key] || {};
    const current = adReport.rows?.[key] || null;
    const inventory = inventoryReport.rows?.[key] || null;
    const profit = profitReport.rows?.[key] || null;
    const market = marketEvidenceForTask(task, normalizedSelectionReports);
    const productSelection = productSelectionEvidenceForTask(task, normalizedSelectionReports);
    const baseline = baselineForTask(task);
    const baselineAsOf = baselineAsOfForTask(task, baseline);
    const currentAsOf = current ? firstText(adReport, ['exportedAt', 'generatedAt', 'dataDate', 'businessDate']) : '';
    const metrics = requestedMetrics(task);
    const warnings = [];
    if (!baseline) warnings.push('missing_baseline_metrics');
    if (!current) warnings.push('missing_current_ad_sku_summary');
    if (metrics.includes('inventory') && !inventory) warnings.push('missing_current_inventory_metrics');
    if (metrics.includes('profit') && !profit) warnings.push('missing_current_profit_metrics');
    if ((metrics.includes('market') || metrics.includes('selection')) && !market?.readyForDecisionSupport) warnings.push('missing_current_selection_market');
    if ((metrics.includes('product') || metrics.includes('asin') || metrics.includes('extended_selection')) && !productSelection?.readyForDecisionSupport) warnings.push('missing_current_extended_selection');
    const currentWithProfit = current && profit && !current.netProfit
      ? { ...current, netProfit: (num(current.sales) * num(profit.profitRate)) - num(current.spend) }
      : current;
    const riskSignals = riskSignalsForEvidence(currentWithProfit, inventory, profit, market);
    evidence[key] = {
      baseline,
      baselineAsOf,
      current: currentWithProfit,
      currentAsOf,
      inventory,
      profit,
      market,
      productSelection,
      riskSignals,
      warnings,
      taskId: task.taskId || '',
      sources: [
        sourceEntry(adReport, '/product/adSkuSummary'),
        ...(inventory ? [sourceEntry(inventoryReport, 'inventory')] : []),
        ...(profit ? [sourceEntry(profitReport, 'profit')] : []),
        ...(market?.coverage?.keywordResearchMatched ? [sourceEntry(normalizedSelectionReports.keywordResearch, 'selection_keyword_research')] : []),
        ...(market?.coverage?.keywordConversionMatched ? [sourceEntry(normalizedSelectionReports.keywordConversion, 'selection_keyword_conversion_rate')] : []),
        ...(market?.coverage?.abaMatched ? [sourceEntry(normalizedSelectionReports.abaSearchTerms, 'selection_aba_search_terms')] : []),
        ...(market?.coverage?.seasonalityMatched ? [sourceEntry(normalizedSelectionReports.keywordSeasonality, 'selection_keyword_seasonality')] : []),
        ...(market?.coverage?.productTimeMachineMatched ? [sourceEntry(normalizedSelectionReports.productTimeMachine, 'selection_product_time_machine')] : []),
        ...(productSelection ? [sourceEntry(normalizedSelectionReports.extendedSelection, 'selection_extended_evidence')] : []),
      ],
    };
  }
  return evidence;
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function latestAdSkuSummaryFile(day = 7) {
  const dir = path.join(ROOT, 'data', 'snapshots');
  try {
    return fs.readdirSync(dir)
      .filter(name => new RegExp(`^ad_sku_summary_ALL_${Number(day) || 7}d_\\d{4}-\\d{2}-\\d{2}\\.json$`).test(name))
      .map(name => path.join(dir, name))
      .filter(file => fs.statSync(file).size > 3)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
  } catch (_) {
    return '';
  }
}

function adSummaryFromSnapshot(snapshot = {}, day = 7) {
  const rows = Array.isArray(snapshot.adSkuSummaryRows) ? snapshot.adSkuSummaryRows : [];
  if (!rows.length) return null;
  return {
    ok: true,
    source: 'latest_snapshot.adSkuSummaryRows',
    exportedAt: snapshot.exportedAt || snapshot.generatedAt || '',
    day,
    rows,
  };
}

function loadFallbackAdSkuSummary(options = {}) {
  if (options.adSkuSummaryReport) return options.adSkuSummaryReport;
  if (options.adSkuSummaryReportFile) return readJson(options.adSkuSummaryReportFile, {});
  if (options.snapshotFile) {
    const fromSnapshot = adSummaryFromSnapshot(readJson(options.snapshotFile, {}), options.day);
    if (fromSnapshot) return fromSnapshot;
  }
  const latestFile = latestAdSkuSummaryFile(options.day);
  return latestFile ? readJson(latestFile, {}) : {};
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function collectAdSkuReviewEvidence(options = {}) {
  const queue = options.queue || readJson(options.queueFile, {});
  const today = dateOnly(options.today || new Date().toISOString());
  const day = Number(options.day || 7);
  const siteId = Number(options.siteId || 4);
  const outDir = options.outDir || path.join(ROOT, 'data', 'agent', 'review_evidence_sources', today);
  const execFileSync = options.execFileSync || defaultExecFileSync;
  const script = path.join(ROOT, 'scripts', 'execute', 'fetch_ad_sku_summary.js');
  const adReports = {};
  const errors = [];
  const fallbackAdReport = loadFallbackAdSkuSummary(options);
  if (Array.isArray(fallbackAdReport.rows) && fallbackAdReport.rows.length) {
    adReports.__fallback_ad_sku_summary = fallbackAdReport;
  }

  for (const key of reviewSubjectKeys(queue)) {
    const reportFile = path.join(outDir, `ad_sku_summary_${key}_${day}d_${today}.json`);
    try {
      execFileSync(process.execPath, [script, String(siteId), String(day), key, reportFile], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: options.stdio || 'pipe',
      });
      adReports[key] = readJson(reportFile, { ok: false, rows: [] });
    } catch (error) {
      errors.push({ key, error: error.message });
      adReports[key] = readJson(reportFile, { ok: false, rows: [], error: error.message });
    }
  }

  const evidence = buildReviewEvidence({
    queue,
    adReports,
    inventoryReports: options.inventoryReports || readJson(options.inventoryReportFile, {}),
    profitReports: options.profitReports || readJson(options.profitReportFile, {}),
    selectionReports: options.selectionReports || {
      keywordResearch: readJson(options.keywordResearchReportFile, {}),
      keywordConversion: readJson(options.keywordConversionReportFile, {}),
      abaSearchTerms: readJson(options.abaSearchTermReportFile, {}),
      keywordSeasonality: readJson(options.keywordSeasonalityReportFile, {}),
      productTimeMachine: readJson(options.productTimeMachineReportFile, {}),
      extendedSelection: readJson(options.extendedSelectionReportFile, {}),
    },
  });
  const evidenceFile = options.outFile || path.join(ROOT, 'data', 'agent', `review_evidence_${today}.json`);
  writeJson(evidenceFile, evidence);
  return {
    evidenceFile,
    evidence,
    summary: {
      requested: reviewSubjectKeys(queue).length,
      collected: Object.values(evidence).filter(item => item.current).length,
      inventoryCollected: Object.values(evidence).filter(item => item.inventory).length,
      profitCollected: Object.values(evidence).filter(item => item.profit).length,
      selectionCollected: Object.values(evidence).filter(item => item.market?.readyForDecisionSupport).length,
      extendedSelectionCollected: Object.values(evidence).filter(item => item.productSelection?.readyForDecisionSupport).length,
      missingBaseline: Object.values(evidence).filter(item => item.warnings.includes('missing_baseline_metrics')).length,
      fallbackAdSkuSummaryRows: Array.isArray(fallbackAdReport.rows) ? fallbackAdReport.rows.length : 0,
      errors,
    },
  };
}

module.exports = {
  buildReviewEvidence,
  collectAdSkuReviewEvidence,
  normalizeAdSkuSummaryReport,
  normalizeInventoryReport,
  normalizeProfitReport,
  normalizeKeywordResearchReport,
  normalizeProductTimeMachineReport,
  normalizeExtendedSelectionReport,
  normalizeSelectionMarketReport,
  reviewSubjectKeys,
  latestAdSkuSummaryFile,
  loadFallbackAdSkuSummary,
};
