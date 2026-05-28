const DEFAULT_SITE = '1';

const SITE_NAMES = {
  1: 'us',
  2: 'uk',
  3: 'de',
  4: 'fr',
  5: 'es',
  6: 'it',
};

const PRESET_CATALOG = {
  'home-overview': {
    label: 'Selection data health overview',
    status: 'stable',
    required: [],
    evidenceUse: 'selection data readiness and total ASIN/search-term scale',
    requests: ['homeOverview'],
  },
  'asin-info': {
    label: 'ASIN information snapshot',
    status: 'stable',
    required: ['asin'],
    evidenceUse: 'product identity, title/image/category/basic ASIN attributes',
    requests: ['asinInfo'],
  },
  'association-flow': {
    label: 'Associated traffic seed ASINs',
    status: 'stable',
    required: ['asin'],
    evidenceUse: 'related product-page traffic and advertising-placement adjacency',
    requests: ['associationFlow'],
  },
  'ad-placement': {
    label: 'Detail-page advertising placement ASINs',
    status: 'stable',
    required: ['asin'],
    evidenceUse: 'products appearing in the target ASIN detail-page advertising slots',
    requests: ['adPlacement'],
  },
  'category-analysis': {
    label: 'Category analysis table',
    status: 'stable',
    required: ['category'],
    evidenceUse: 'category capacity, price/review/rating shape, and top-ASIN diagnostics',
    requests: ['categoryAnalysis'],
  },
  'bsr-list': {
    label: 'BSR list',
    status: 'stable',
    required: [],
    evidenceUse: 'category rank pressure, new-ASIN rate, and category concentration',
    requests: ['bsrList', 'bsrOverview'],
  },
  'new-releases': {
    label: 'New releases list',
    status: 'stable',
    required: [],
    evidenceUse: 'new-product survival room and fast-rising ASIN discovery',
    requests: ['newReleasesList', 'newReleasesOverview'],
  },
  'comment-analysis': {
    label: 'Comment analysis',
    status: 'stable',
    required: ['asin'],
    evidenceUse: 'review pain points, rating trend, feature complaints, and conversion blockers',
    requests: ['commentCount', 'commentAnalysis', 'commentGptData', 'commentRating', 'commentType', 'commentList'],
  },
  'flow-structure': {
    label: 'Traffic structure',
    status: 'stable',
    required: ['asin'],
    evidenceUse: 'ASIN traffic keyword detail and paid/natural exposure structure',
    requests: ['trafficDetail'],
  },
  'flow-theme-tags': {
    label: 'Traffic theme tags',
    status: 'stable',
    required: [],
    evidenceUse: 'traffic-word theme size, theme dimensions, and optional matched base words',
    requests: ['flowThemeMain', 'flowThemeHistory', 'flowThemeMatchWord'],
  },
  'store-feedback': {
    label: 'Store feedback',
    status: 'stable',
    required: [],
    evidenceUse: 'seller quality, store/category concentration, top ASIN, and feedback trend',
    requests: [
      'storeFeedbackList',
      'storeFeedbackSite',
      'storeFeedbackCategory',
      'storeFeedbackIndicator',
      'storeFeedbackTopAsin',
      'storeFeedbackCategoryNum',
      'storeFeedbackNewAsin',
      'storeFeedbackTrend',
      'storeFeedbackAsinNum',
    ],
  },
  feedback: {
    label: 'Store feedback',
    status: 'stable',
    required: [],
    evidenceUse: 'alias of store-feedback for backward-compatible prompts',
    requests: [
      'storeFeedbackList',
      'storeFeedbackSite',
      'storeFeedbackCategory',
      'storeFeedbackIndicator',
      'storeFeedbackTopAsin',
      'storeFeedbackCategoryNum',
      'storeFeedbackNewAsin',
      'storeFeedbackTrend',
      'storeFeedbackAsinNum',
    ],
  },
};

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  return text(value).split(/[,，\s\r\n]+/).map(text).filter(Boolean);
}

function normalizeAsins(value) {
  return splitList(value)
    .map(item => item.toUpperCase())
    .filter(item => /^[A-Z0-9]{10}$/.test(item));
}

function normalizePresets(value) {
  const presets = splitList(value || 'home-overview');
  return presets.length ? presets : ['home-overview'];
}

function siteNameFor(site) {
  return SITE_NAMES[String(site || DEFAULT_SITE)] || 'us';
}

function defaultDateInfo(options = {}) {
  const value = text(options.dateInfo || options['date-info'] || options.month || options.uTime || options['u-time'] || options.period);
  if (value) return value.slice(0, 7);
  const now = new Date();
  now.setUTCMonth(now.getUTCMonth() - 1);
  return now.toISOString().slice(0, 7);
}

function dailyRankDate(options = {}, kind = 'bsr') {
  const value = kind === 'new-releases'
    ? text(
      options.newReleasesRankDate || options['new-releases-rank-date'] ||
      options.nsrRankDate || options['nsr-rank-date'] ||
      options.rankDate || options['rank-date'] ||
      options.uTime || options['u-time'] ||
      options.day || options.date
    )
    : text(
      options.bsrRankDate || options['bsr-rank-date'] ||
      options.rankDate || options['rank-date'] ||
      options.uTime || options['u-time'] ||
      options.day || options.date
    );
  if (value) return value.slice(0, 10);
  throw new Error(`missing ${kind} rank date; pass --rank-date YYYY-MM-DD or run through ops:selection:extended for auto date resolution`);
}

function categoryAnalysisDate(options = {}) {
  const value = text(
    options.categoryAnalysisDate || options['category-analysis-date'] ||
    options.categoryDate || options['category-date'] ||
    options.uTime || options['u-time'] ||
    options.week || options.date
  );
  if (value) return value.slice(0, 10);
  throw new Error('missing category analysis date; pass --category-date YYYY-MM-DD or run through ops:selection:extended for auto date resolution');
}

function defaultFlowThemeMonth(options = {}) {
  const value = text(
    options.flowThemeDate || options['flow-theme-date'] ||
    options.themeDate || options['theme-date'] ||
    options.uTime || options['u-time'] ||
    options.dateInfo || options['date-info'] ||
    options.month || options.period
  );
  if (value) return value.slice(0, 7);
  return defaultDateInfo(options);
}

function storeFeedbackDate(options = {}) {
  const value = text(
    options.storeFeedbackDate || options['store-feedback-date'] ||
    options.feedbackDate || options['feedback-date'] ||
    options.uTime || options['u-time'] ||
    options.dateInfo || options['date-info'] ||
    options.month || options.period
  );
  const normalized = value || defaultDateInfo(options);
  if (/^\d{4}-\d{2}$/.test(normalized)) return `${normalized}-01`;
  return normalized.slice(0, 10);
}

function firstAsins(options = {}) {
  const asins = normalizeAsins(options.asins || options.asin || options.searchValue || options['search-value']);
  if (!asins.length) {
    throw new Error('missing ASIN; pass --asin or --asins for this preset');
  }
  return asins;
}

function firstAsin(options = {}) {
  return firstAsins(options)[0];
}

function rankCategories(options = {}) {
  return splitList(options.rankCategory || options['rank-category'] || options.rankCategories || options['rank-categories'] || options.categoryId || options['category-id']);
}

function rankPageSize(options = {}) {
  return text(options.rankPageSize || options['rank-page-size'] || options.pageSize || options['page-size'] || 20);
}

function rankPageNo(options = {}) {
  return text(options.rankPageNo || options['rank-page-no'] || options.pageNo || options['page-no'] || 1);
}

function dailyRankListRequest(options = {}, defaults = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const category = rankCategories(options);
  const query = {
    stValue: text(options.stValue || options['search-value'] || options.keyword || ''),
    stType: text(options.stType || options['search-type'] || '1'),
    dayFlag: text(options.dayFlag || options['day-flag'] || 'is1DayFlag'),
    site,
    dateType: text(options.dateType || options['date-type'] || '5'),
    uTime: dailyRankDate(options, defaults.kind || 'bsr'),
    pageType: text(options.pageType || options['page-type'] || 1),
    pageNo: rankPageNo(options),
    pageSize: rankPageSize(options),
    column: text(options.rankSortColumn || options['rank-sort-column'] || options.column || 'bsrRank'),
    order: text(options.rankSortOrder || options['rank-sort-order'] || options.order || 'asc'),
    categoryType: defaults.categoryType,
  };
  if (category.length) query.category = category;
  return {
    key: defaults.key,
    label: defaults.label,
    endpoint: '/bsrcategory/brand/list',
    method: 'GET',
    query,
    body: null,
  };
}

function dailyRankOverviewRequest(options = {}, defaults = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const category = rankCategories(options);
  const query = {
    site,
    uTime: dailyRankDate(options, defaults.kind || 'bsr'),
    categoryType: defaults.categoryType,
  };
  if (category.length) query.category = category;
  return {
    key: defaults.key,
    label: defaults.label,
    endpoint: '/bsrcategory/brand/queryBrandIndicator',
    method: 'GET',
    query,
    body: null,
  };
}

function bsrListRequest(options = {}) {
  return dailyRankListRequest(options, {
    key: 'bsrList',
    label: 'BSR daily rank list',
    categoryType: 1,
    kind: 'bsr',
  });
}

function bsrOverviewRequest(options = {}) {
  return dailyRankOverviewRequest(options, {
    key: 'bsrOverview',
    label: 'BSR daily rank overview',
    categoryType: 1,
    kind: 'bsr',
  });
}

function newReleasesListRequest(options = {}) {
  return dailyRankListRequest(options, {
    key: 'newReleasesList',
    label: 'new releases daily rank list',
    categoryType: 2,
    kind: 'new-releases',
  });
}

function newReleasesOverviewRequest(options = {}) {
  return dailyRankOverviewRequest(options, {
    key: 'newReleasesOverview',
    label: 'new releases daily rank overview',
    categoryType: 2,
    kind: 'new-releases',
  });
}

function categoryAnalysisRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const category = text(options.category || options['category-name']);
  if (!category) throw new Error('missing category; pass --category "Beauty & Personal Care" for category-analysis');
  const dateType = text(options.categoryDateType || options['category-date-type'] || options.dateType || options['date-type'] || '1');
  const uTime = categoryAnalysisDate(options);
  const pageNo = text(options.categoryPageNo || options['category-page-no'] || options.pageNo || options['page-no'] || 1);
  const pageSize = text(options.categoryPageSize || options['category-page-size'] || options.pageSize || options['page-size'] || 20);
  return {
    key: 'categoryAnalysis',
    label: 'category analysis table',
    endpoint: '/categoryAnalysis/listProfitCategory',
    method: 'POST',
    query: {
      pageNo,
      pageSize,
      uTime,
      site,
      dateType,
    },
    body: {
      site,
      dateType,
      uTime,
      pageNo,
      pageSize,
      pageType: text(options.pageType || options['page-type'] || 1),
      advancedSearch: { category },
    },
  };
}

function flowThemePageSize(options = {}) {
  return text(options.flowThemePageSize || options['flow-theme-page-size'] || options.pageSize || options['page-size'] || 20);
}

function flowThemeMainRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const pageNo = text(options.flowThemePageNo || options['flow-theme-page-no'] || options.pageNo || options['page-no'] || 1);
  const pageSize = flowThemePageSize(options);
  const uTime = defaultFlowThemeMonth(options);
  const dateType = text(options.flowThemeDateType || options['flow-theme-date-type'] || options.dateType || options['date-type'] || 2);
  return {
    key: 'flowThemeMain',
    label: 'traffic theme tag table',
    endpoint: '/themeTags/listABAStThemeNew',
    method: 'POST',
    query: {},
    body: {
      site,
      uTime,
      dateType,
      pageNo,
      pageSize,
      advancedSearch: {},
    },
  };
}

function flowThemeHistoryRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  return {
    key: 'flowThemeHistory',
    label: 'traffic theme dimensions by month',
    endpoint: '/themeTags/listAllThemeChByTime',
    method: 'POST',
    query: {
      site,
      uTime: defaultFlowThemeMonth(options),
    },
    body: null,
  };
}

function flowThemeSearchTerm(options = {}) {
  return text(
    options.searchTerm || options['search-term'] ||
    options.keyword || options.stValue || options['search-value'] ||
    options.flowThemeSearchTerm || options['flow-theme-search-term']
  );
}

function flowThemeMatchWordRequest(options = {}) {
  const searchTerm = flowThemeSearchTerm(options);
  if (!searchTerm) return null;
  const site = text(options.site || DEFAULT_SITE);
  const pageNo = text(options.flowThemeMatchPageNo || options['flow-theme-match-page-no'] || options.pageNo || options['page-no'] || 1);
  const pageSize = text(options.flowThemeMatchPageSize || options['flow-theme-match-page-size'] || options.pageSize || options['page-size'] || 20);
  return {
    key: 'flowThemeMatchWord',
    label: 'traffic theme matched base words',
    endpoint: '/themeTags/listABAMatchWord',
    method: 'POST',
    query: {
      site,
      pageNo,
      pageSize,
      searchTerm,
    },
    body: null,
  };
}

function storeFeedbackPageSize(options = {}) {
  return text(options.feedbackPageSize || options['feedback-page-size'] || options.storeFeedbackPageSize || options['store-feedback-page-size'] || options.pageSize || options['page-size'] || 20);
}

function storeFeedbackBaseQuery(options = {}) {
  const query = {
    site: text(options.site || DEFAULT_SITE),
    uTime: storeFeedbackDate(options),
    myCollection: text(options.myCollection || options['my-collection'] || options.storeFeedbackCollection || options['store-feedback-collection'] || 0),
  };
  const accountName = text(options.accountName || options['account-name'] || options.sellerName || options['seller-name']);
  const accountId = text(options.accountId || options['account-id'] || options.sellerId || options['seller-id']);
  if (accountName) query.accountName = accountName;
  if (accountId) query.accountId = accountId;
  return query;
}

function storeFeedbackListRequest(options = {}) {
  return {
    key: 'storeFeedbackList',
    label: 'store feedback account list',
    endpoint: '/sellAccount/feedback/listByES',
    method: 'GET',
    query: {
      ...storeFeedbackBaseQuery(options),
      pageNo: text(options.feedbackPageNo || options['feedback-page-no'] || options.pageNo || options['page-no'] || 1),
      pageSize: storeFeedbackPageSize(options),
    },
    body: null,
  };
}

function storeFeedbackAccountNumRequest(options = {}) {
  if (text(options.includeFeedbackAccountNum || options['include-feedback-account-num']) !== '1') return null;
  return {
    key: 'storeFeedbackAccountNum',
    label: 'store feedback account count',
    endpoint: '/sellAccount/feedback/queryAccountNum',
    method: 'GET',
    query: storeFeedbackBaseQuery(options),
    body: null,
  };
}

function storeFeedbackSiteRequest(options = {}) {
  return {
    key: 'storeFeedbackSite',
    label: 'store feedback site list',
    endpoint: '/sellAccount/feedback/getSiteByMonthNew',
    method: 'GET',
    query: {
      site: text(options.site || DEFAULT_SITE),
    },
    body: null,
  };
}

function storeFeedbackAccountName(options = {}) {
  return text(options.accountName || options['account-name'] || options.sellerName || options['seller-name']);
}

function storeFeedbackAccountId(options = {}) {
  return text(options.accountId || options['account-id'] || options.sellerId || options['seller-id']);
}

function storeFeedbackOptionalAccountRequest(options = {}, defaults = {}) {
  if (defaults.requiresAccountId && !storeFeedbackAccountId(options)) return null;
  if (defaults.requiresAccountName && !storeFeedbackAccountName(options)) return null;
  return {
    key: defaults.key,
    label: defaults.label,
    endpoint: defaults.endpoint,
    method: 'GET',
    query: {
      ...storeFeedbackBaseQuery(options),
      pageNo: text(options.feedbackDetailPageNo || options['feedback-detail-page-no'] || options.pageNo || options['page-no'] || 1),
      pageSize: storeFeedbackPageSize(options),
    },
    body: null,
  };
}

function storeFeedbackCategoryRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackCategory',
    label: 'store feedback category coverage',
    endpoint: '/sellAccount/feedback/getOneCategoryAndAccountNum',
    requiresAccountName: true,
  });
}

function storeFeedbackIndicatorRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackIndicator',
    label: 'store feedback indicator distribution',
    endpoint: '/sellAccount/feedback/queryIndicatorByAccount',
    requiresAccountName: true,
  });
}

function storeFeedbackTopAsinRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackTopAsin',
    label: 'store feedback top ASINs',
    endpoint: '/sellAccount/feedback/getTopAsinByAccount',
    requiresAccountId: true,
  });
}

function storeFeedbackCategoryNumRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackCategoryNum',
    label: 'store feedback category ASIN share',
    endpoint: '/sellAccount/feedback/getCategoryNumByAccount',
    requiresAccountId: true,
  });
}

function storeFeedbackNewAsinRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackNewAsin',
    label: 'store feedback new ASINs',
    endpoint: '/sellAccount/feedback/getNewAsinByAccount',
    requiresAccountId: true,
  });
}

function storeFeedbackTrendRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackTrend',
    label: 'store feedback trend',
    endpoint: '/sellAccount/feedback/getFeedbackData',
    requiresAccountId: true,
  });
}

function storeFeedbackAsinNumRequest(options = {}) {
  return storeFeedbackOptionalAccountRequest(options, {
    key: 'storeFeedbackAsinNum',
    label: 'store feedback ASIN count trend',
    endpoint: '/sellAccount/feedback/getAsinNumByAccount',
    requiresAccountId: true,
  });
}

function homeOverviewRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  return {
    key: 'homeOverview',
    label: 'selection home overview',
    endpoint: '/analysis/index/getHeadData',
    method: 'GET',
    query: { site },
    body: null,
  };
}

function asinInfoRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const asins = firstAsins(options);
  return {
    key: 'asinInfo',
    label: 'ASIN information',
    endpoint: '/analysis/searchTermByAsin/getInfoByAsin',
    method: 'GET',
    query: {
      site,
      asins: asins.join(','),
    },
    body: null,
  };
}

function relatedAsinRequest(options = {}, defaults = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const asins = firstAsins(options).slice(0, 20);
  const searchType = text(defaults.searchType || options.searchType || options['search-type'] || 'related_products');
  const dateType = text(options.dateType || options['date-type'] || 'month');
  const body = {
    siteName: siteNameFor(site),
    dateType,
    variationType: options.currentOnly === '1' || options['current-only'] === '1' ? '' : text(options.variationType || options['variation-type'] || 'variationFlag'),
    asinList: asins,
    searchType,
    dateInfo: dateType === 'month' ? defaultDateInfo(options) : '',
  };
  return {
    key: defaults.key || 'associationFlow',
    label: defaults.label || (searchType === 'advertising' ? 'associated advertising placements' : 'associated product traffic'),
    endpoint: '/asin/related/listAsin',
    method: 'POST',
    query: {},
    body,
  };
}

function associationFlowRequest(options = {}) {
  return relatedAsinRequest(options, {
    key: 'associationFlow',
    searchType: 'related_products',
    label: 'associated product traffic',
  });
}

function adPlacementRequest(options = {}) {
  return relatedAsinRequest(options, {
    key: 'adPlacement',
    searchType: 'advertising',
    label: 'associated advertising placements',
  });
}

function commentRequest(options = {}, defaults = {}) {
  const asin = firstAsin(options);
  return {
    key: defaults.key,
    label: defaults.label,
    endpoint: defaults.endpoint,
    method: 'GET',
    query: {
      asin,
      ...(defaults.query || {}),
    },
    body: null,
  };
}

function commentCountRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentCount',
    label: 'comment count summary',
    endpoint: '/asinComments/analysis/getCountByAsinComments',
  });
}

function commentAnalysisRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentAnalysis',
    label: 'comment variant analysis',
    endpoint: '/asinComments/analysis/getCommentsAnalysis',
  });
}

function commentGptDataRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentGptData',
    label: 'comment GPT cached analysis',
    endpoint: '/asinComments/analysis/getCommentAnalyData',
  });
}

function commentRatingRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentRating',
    label: 'comment rating chart',
    endpoint: '/asinComments/analysis/getRatingByAsin',
  });
}

function commentTypeRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentType',
    label: 'comment type chart',
    endpoint: '/asinComments/analysis/getCommentsTypeByAsin',
  });
}

function commentListRequest(options = {}) {
  return commentRequest(options, {
    key: 'commentList',
    label: 'comment list sample',
    endpoint: '/asinComments/analysis/queryAsinCommentsList',
    query: {
      pageNo: text(options.commentPageNo || options['comment-page-no'] || options.pageNo || 1),
      pageSize: text(options.commentPageSize || options['comment-page-size'] || options.pageSize || 20),
    },
  });
}

function trafficDetailRequest(options = {}) {
  const site = text(options.site || DEFAULT_SITE);
  const asins = firstAsins(options);
  return {
    key: 'trafficDetail',
    label: 'ASIN traffic keyword detail',
    endpoint: '/analysis/searchTermByAsin/getDetailByAsin',
    method: 'GET',
    query: {
      site,
      asins: asins.join(','),
    },
    body: null,
  };
}

const REQUEST_BUILDERS = {
  homeOverview: homeOverviewRequest,
  asinInfo: asinInfoRequest,
  associationFlow: associationFlowRequest,
  adPlacement: adPlacementRequest,
  categoryAnalysis: categoryAnalysisRequest,
  bsrList: bsrListRequest,
  bsrOverview: bsrOverviewRequest,
  newReleasesList: newReleasesListRequest,
  newReleasesOverview: newReleasesOverviewRequest,
  commentCount: commentCountRequest,
  commentAnalysis: commentAnalysisRequest,
  commentGptData: commentGptDataRequest,
  commentRating: commentRatingRequest,
  commentType: commentTypeRequest,
  commentList: commentListRequest,
  trafficDetail: trafficDetailRequest,
  flowThemeMain: flowThemeMainRequest,
  flowThemeHistory: flowThemeHistoryRequest,
  flowThemeMatchWord: flowThemeMatchWordRequest,
  storeFeedbackList: storeFeedbackListRequest,
  storeFeedbackAccountNum: storeFeedbackAccountNumRequest,
  storeFeedbackSite: storeFeedbackSiteRequest,
  storeFeedbackCategory: storeFeedbackCategoryRequest,
  storeFeedbackIndicator: storeFeedbackIndicatorRequest,
  storeFeedbackTopAsin: storeFeedbackTopAsinRequest,
  storeFeedbackCategoryNum: storeFeedbackCategoryNumRequest,
  storeFeedbackNewAsin: storeFeedbackNewAsinRequest,
  storeFeedbackTrend: storeFeedbackTrendRequest,
  storeFeedbackAsinNum: storeFeedbackAsinNumRequest,
};

function buildExtendedSelectionRequests(options = {}) {
  const presets = normalizePresets(options.preset || options.presets);
  const requests = [];
  const missingPresets = [];
  const pendingPresets = [];

  for (const preset of presets) {
    const catalog = PRESET_CATALOG[preset];
    if (!catalog) {
      missingPresets.push(preset);
      continue;
    }
    if (catalog.status !== 'stable') {
      pendingPresets.push({
        preset,
        status: catalog.status,
        required: catalog.required || [],
        endpoints: catalog.endpoints || [],
        evidenceUse: catalog.evidenceUse,
      });
      continue;
    }
    for (const requestKey of catalog.requests || []) {
      const builder = REQUEST_BUILDERS[requestKey];
      if (!builder) continue;
      const built = builder(options);
      const builtRequests = Array.isArray(built) ? built : [built];
      for (const request of builtRequests.filter(Boolean)) {
        requests.push({ preset, ...request });
      }
    }
  }

  if (missingPresets.length) {
    throw new Error(`unknown selection extended preset(s): ${missingPresets.join(', ')}`);
  }

  return {
    presets,
    requests,
    pendingPresets,
  };
}

function countRows(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['records', 'rows', 'list', 'data', 'content', 'items', 'result']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.length;
    const n = countRows(nested);
    if (n) return n;
  }
  return 0;
}

function extractResultKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).slice(0, 40);
}

function summarizeApiResult(item = {}) {
  const api = item.api || {};
  const result = api.result ?? api.json?.result ?? api.json?.data ?? null;
  return {
    preset: item.request?.preset || '',
    key: item.request?.key || '',
    label: item.request?.label || '',
    ok: !!api.ok,
    status: api.status ?? null,
    code: api.code ?? null,
    success: api.success ?? null,
    message: api.message || '',
    endpoint: item.request?.endpoint || '',
    rowCount: countRows(result),
    resultKeys: extractResultKeys(result),
  };
}

function buildExtendedSelectionReport({
  requestedPresets = [],
  requests = [],
  apiResults = [],
  pendingPresets = [],
  runtimeContext = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const summaries = apiResults.map(summarizeApiResult);
  return {
    ok: summaries.every(item => item.ok) && pendingPresets.length === 0,
    exportedAt: generatedAt,
    frameworkVersion: 'selection_extended_evidence.v1',
    requestedPresets,
    evidenceBoundary: 'selection_read_only_market_evidence',
    readyForAutoAction: false,
    runtimeContext,
    requests,
    summaries,
    pendingPresets,
    missingEvidence: [
      ...summaries.filter(item => !item.ok).map(item => ({
        source: item.key || item.preset,
        reason: item.message || `selection API failed with status ${item.status || 'unknown'}`,
      })),
      ...pendingPresets.map(item => ({
        source: item.preset,
        reason: 'preset discovered but payload normalizer is not stable yet',
        endpoints: item.endpoints,
      })),
    ],
    results: apiResults.map(item => ({
      request: item.request,
      api: item.api,
    })),
  };
}

module.exports = {
  PRESET_CATALOG,
  buildExtendedSelectionReport,
  buildExtendedSelectionRequests,
  categoryAnalysisDate,
  countRows,
  dailyRankDate,
  defaultFlowThemeMonth,
  defaultDateInfo,
  normalizeAsins,
  normalizePresets,
  siteNameFor,
  storeFeedbackDate,
  summarizeApiResult,
};
