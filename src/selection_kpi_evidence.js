const { normalizeSelectionMarketReport } = require('./agent_review_evidence');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasRows(value = {}) {
  if (!value || typeof value !== 'object') return false;
  return num(value.rowCount, 0) > 0 || (Array.isArray(value.rows) && value.rows.length > 0);
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function normalizeInput(selectionReports = {}) {
  if (selectionReports.extendedSelection?.dailyRanks || selectionReports.extendedSelection?.storeFeedback) {
    return selectionReports;
  }
  if (selectionReports.dailyRanks || selectionReports.storeFeedback || selectionReports.flowThemeTags) {
    return { extendedSelection: selectionReports };
  }
  return normalizeSelectionMarketReport(selectionReports);
}

function summarizeDailyRanks(dailyRanks = {}) {
  const bsr = dailyRanks.bsrList || {};
  const newReleases = dailyRanks.newReleasesList || {};
  return {
    bsr: compactObject({
      rankDate: text(bsr.query?.uTime),
      rowCount: num(bsr.rowCount, 0),
      total: bsr.total ?? null,
      sample: (bsr.rows || []).slice(0, 5).map(row => compactObject({
        asin: text(row.asin || row.ASIN),
        title: text(row.title).slice(0, 120),
        rank: row.bsrRank ?? row.rank ?? null,
        categoryName: text(row.categoryName),
        price: row.price ?? null,
        rating: row.rating ?? null,
        reviews: row.totalComments ?? row.reviewCount ?? null,
      })),
    }),
    newReleases: compactObject({
      rankDate: text(newReleases.query?.uTime),
      rowCount: num(newReleases.rowCount, 0),
      total: newReleases.total ?? null,
      sample: (newReleases.rows || []).slice(0, 5).map(row => compactObject({
        asin: text(row.asin || row.ASIN),
        title: text(row.title).slice(0, 120),
        rank: row.bsrRank ?? row.rank ?? null,
        categoryName: text(row.categoryName),
        launchTime: text(row.launchTime),
        price: row.price ?? null,
      })),
    }),
  };
}

function summarizeCategory(categoryAnalysis = null) {
  if (!categoryAnalysis) return null;
  return compactObject({
    category: text(categoryAnalysis.category),
    uTime: text(categoryAnalysis.query?.uTime),
    rowCount: num(categoryAnalysis.rowCount, 0),
    total: categoryAnalysis.total ?? null,
    sample: (categoryAnalysis.rows || []).slice(0, 5).map(row => compactObject({
      asin: text(row.asin || row.ASIN),
      title: text(row.title).slice(0, 120),
      categoryName: text(row.categoryName || row.category),
      price: row.price ?? row.avgPrice ?? null,
      rating: row.rating ?? row.avgRating ?? null,
      reviews: row.totalComments ?? row.reviewCount ?? row.avgReviewCount ?? null,
    })),
  });
}

function summarizeFlowTheme(flowThemeTags = {}) {
  const main = flowThemeTags.main || {};
  const dimensions = flowThemeTags.dimensions || {};
  const matchWords = flowThemeTags.matchWords || {};
  return {
    main: compactObject({
      uTime: text(main.body?.uTime || main.query?.uTime),
      dateType: text(main.body?.dateType || main.query?.dateType),
      rowCount: num(main.rowCount, 0),
      total: main.total ?? null,
      sample: (main.rows || []).slice(0, 5).map(row => compactObject({
        theme: text(row.patternSt || row.word || row.searchTerm),
        translation: text(row.translate_cn || row.translation),
        categoryName: text(row.categoryName),
        rank: row.pattern_rank ?? null,
        rankChangeRate: row.pattern_rank_change_rate ?? row.pattern_rank_rate_of_change ?? null,
        bsrOrdersTotal: row.patternBsrOrdersTotal ?? null,
        wordCount: row.pattern_word_num ?? row.patternStCount ?? null,
      })),
    }),
    dimensions: compactObject({
      uTime: text(dimensions.query?.uTime),
      rowCount: num(dimensions.rowCount, 0),
      rows: (dimensions.rows || []).slice(0, 20),
    }),
    matchWords: compactObject({
      searchTerm: text(matchWords.query?.searchTerm),
      rowCount: num(matchWords.rowCount, 0),
      total: matchWords.total ?? null,
      sample: (matchWords.rows || []).slice(0, 10).map(row => compactObject({
        word: text(row.word),
        wordCount: row.wordCount ?? null,
        updatedAt: text(row.updatedAt),
      })),
    }),
  };
}

function summarizeStoreFeedback(storeFeedback = {}) {
  const accounts = storeFeedback.accounts || {};
  const accountSummaries = Object.entries(accounts).map(([key, value]) => compactObject({
    key,
    accountId: text(value.accountId),
    accountName: text(value.accountName),
    categoryRowCount: num(value.category?.rowCount, 0),
    topAsinCount: num(value.topAsins?.rowCount, 0),
    newAsinCount: num(value.newAsins?.rowCount, 0),
    newAsinTotal: value.newAsins?.total ?? null,
    trendPoints: num(value.trend?.rowCount, 0),
    asinTrendPoints: num(value.asinNum?.rowCount, 0),
    topAsinSample: (value.topAsins?.rows || []).slice(0, 5).map(row => compactObject({
      asin: text(row.asin || row.ASIN),
      title: text(row.title).slice(0, 120),
      price: row.price ?? null,
      rating: row.rating ?? null,
      reviews: row.totalComments ?? null,
      launchTime: text(row.launchTime),
    })),
  }));
  return {
    list: compactObject({
      uTime: text(storeFeedback.list?.query?.uTime),
      rowCount: num(storeFeedback.list?.rowCount, 0),
      total: storeFeedback.list?.total ?? null,
      sample: (storeFeedback.list?.rows || []).slice(0, 5).map(row => compactObject({
        accountId: text(row.accountId),
        accountName: text(row.accountName),
        siteName: text(row.siteName),
        count30Day: row.count30Day ?? null,
        count1Year: row.count1Year ?? null,
        countLifetime: row.countLifetime ?? null,
        asinCounts: row.asinCounts ?? null,
        asinNewCounts: row.asinNewCounts ?? null,
        countsNewRate: row.countsNewRate ?? null,
        top20AvgRating: row.top20AvgRating ?? null,
        top20AvgTotalComments: row.top20AvgTotalComments ?? null,
        crawlDate: text(row.fbCrawlDate),
      })),
    }),
    accountNum: storeFeedback.accountNum?.metrics || null,
    siteCount: num(storeFeedback.sites?.rowCount, 0),
    accountDetails: accountSummaries,
  };
}

function buildSelectionKpiEvidence(selectionReports = {}) {
  const normalized = normalizeInput(selectionReports);
  const extended = normalized.extendedSelection || {};
  const dailyRanks = summarizeDailyRanks(extended.dailyRanks || {});
  const category = summarizeCategory(extended.categoryAnalysis);
  const flowTheme = summarizeFlowTheme(extended.flowThemeTags || {});
  const storeFeedback = summarizeStoreFeedback(extended.storeFeedback || {});
  const coverage = {
    dailyRankLists: [
      hasRows(extended.dailyRanks?.bsrList) ? 'bsr' : '',
      hasRows(extended.dailyRanks?.newReleasesList) ? 'newReleases' : '',
    ].filter(Boolean),
    categoryAnalysis: !!category && num(category.rowCount, 0) > 0,
    flowThemeTags: hasRows(extended.flowThemeTags?.main) || hasRows(extended.flowThemeTags?.dimensions) || hasRows(extended.flowThemeTags?.matchWords),
    storeFeedback: hasRows(extended.storeFeedback?.list) || Object.keys(extended.storeFeedback?.accounts || {}).length > 0,
    missingEvidenceCount: Array.isArray(extended.missingEvidence) ? extended.missingEvidence.length : 0,
  };
  const readyForDecisionSupport = (
    coverage.dailyRankLists.length > 0 ||
    coverage.categoryAnalysis ||
    coverage.flowThemeTags ||
    coverage.storeFeedback
  );
  const nextChecks = [];
  if (!coverage.dailyRankLists.length) nextChecks.push('refresh bsr-list and new-releases for market pressure');
  if (!coverage.categoryAnalysis) nextChecks.push('pass --category when KPI drilldown needs a category capacity view');
  if (!coverage.flowThemeTags) nextChecks.push('refresh flow-theme-tags for traffic theme expansion');
  if (!coverage.storeFeedback) nextChecks.push('refresh store-feedback for store quality and competitor-account risk');

  return {
    readyForDecisionSupport,
    readyForAutoAction: false,
    evidenceBoundary: extended.evidenceBoundary || 'selection_read_only_market_evidence',
    coverage,
    dailyRanks,
    category,
    flowTheme,
    storeFeedback,
    kpiServiceUse: {
      salesRecovery: 'use BSR/new-release/category evidence to decide whether KPI recovery should come from proven demand or new-product exploration',
      conversionQuality: 'use comment, flow-theme, and category shape as listing and traffic-quality context before scaling spend',
      trustRisk: 'use store feedback as seller-quality and account-concentration risk, not as a write trigger',
      guardrail: 'selection evidence supports KPI diagnosis; it never authorizes automatic spend, listing, or price writes by itself',
    },
    nextChecks,
  };
}

module.exports = {
  buildSelectionKpiEvidence,
  summarizeCategory,
  summarizeDailyRanks,
  summarizeFlowTheme,
  summarizeStoreFeedback,
};
