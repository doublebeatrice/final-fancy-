const assert = require('assert');
const {
  buildExtendedSelectionReport,
  buildExtendedSelectionRequests,
  categoryAnalysisDate,
  dailyRankDate,
  defaultFlowThemeMonth,
  defaultDateInfo,
  normalizeAsins,
  PRESET_CATALOG,
  siteNameFor,
  storeFeedbackDate,
  summarizeApiResult,
} = require('../src/selection_extended_evidence');
const {
  materializeRequest,
} = require('../scripts/execute/fetch_selection_extended_evidence');

assert.ok(PRESET_CATALOG['home-overview']);
assert.ok(PRESET_CATALOG['asin-info']);
assert.ok(PRESET_CATALOG['association-flow']);
assert.ok(PRESET_CATALOG['ad-placement']);
assert.strictEqual(PRESET_CATALOG['category-analysis'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['bsr-list'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['new-releases'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['comment-analysis'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['flow-structure'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['flow-theme-tags'].status, 'stable');
assert.strictEqual(PRESET_CATALOG['store-feedback'].status, 'stable');

assert.deepStrictEqual(normalizeAsins('b0gwd724y8, bad, B0GWCK7H94'), ['B0GWD724Y8', 'B0GWCK7H94']);
assert.strictEqual(siteNameFor(1), 'us');
assert.match(defaultDateInfo({ generatedAt: 'unused' }), /^\d{4}-\d{2}$/);
assert.strictEqual(defaultFlowThemeMonth({ dateInfo: '2026-04' }), '2026-04');
assert.strictEqual(storeFeedbackDate({ feedbackDate: '2026-04' }), '2026-04-01');
assert.strictEqual(categoryAnalysisDate({ categoryDate: '2026-05-10' }), '2026-05-10');
assert.strictEqual(dailyRankDate({ rankDate: '2026-05-21' }), '2026-05-21');

{
  const built = buildExtendedSelectionRequests({ preset: 'home-overview', site: 1 });
  assert.deepStrictEqual(built.presets, ['home-overview']);
  assert.strictEqual(built.requests.length, 1);
  assert.strictEqual(built.requests[0].endpoint, '/analysis/index/getHeadData');
  const request = materializeRequest(built.requests[0]);
  assert.strictEqual(request.url, '/soundasia_selection/analysis/index/getHeadData?site=1');
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'asin-info association-flow',
    asin: 'B0GWD724Y8',
    site: 1,
    dateInfo: '2026-04',
  });
  assert.strictEqual(built.requests.length, 2);
  const asinInfo = built.requests.find(item => item.key === 'asinInfo');
  const association = built.requests.find(item => item.key === 'associationFlow');
  assert.deepStrictEqual(asinInfo.query, { site: '1', asins: 'B0GWD724Y8' });
  assert.strictEqual(association.body.siteName, 'us');
  assert.deepStrictEqual(association.body.asinList, ['B0GWD724Y8']);
  assert.strictEqual(association.body.searchType, 'related_products');
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'ad-placement',
    asin: 'B0GWD724Y8',
    site: 1,
    dateInfo: '2026-04',
  });
  assert.strictEqual(built.requests.length, 1);
  assert.strictEqual(built.requests[0].key, 'adPlacement');
  assert.strictEqual(built.requests[0].body.searchType, 'advertising');
  assert.strictEqual(built.requests[0].endpoint, '/asin/related/listAsin');
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'category-analysis',
    category: 'Beauty & Personal Care',
    categoryDate: '2026-05-10',
    site: 1,
    pageSize: 5,
  });
  assert.strictEqual(built.requests.length, 1);
  assert.strictEqual(built.requests[0].key, 'categoryAnalysis');
  assert.strictEqual(built.requests[0].endpoint, '/categoryAnalysis/listProfitCategory');
  assert.strictEqual(built.requests[0].query.uTime, '2026-05-10');
  assert.deepStrictEqual(built.requests[0].body.advancedSearch, { category: 'Beauty & Personal Care' });
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'bsr-list new-releases',
    rankDate: '2026-05-21',
    site: 1,
    pageSize: 5,
  });
  assert.strictEqual(built.requests.length, 4);
  const bsrList = built.requests.find(item => item.key === 'bsrList');
  const nsrList = built.requests.find(item => item.key === 'newReleasesList');
  assert.strictEqual(bsrList.endpoint, '/bsrcategory/brand/list');
  assert.strictEqual(bsrList.query.uTime, '2026-05-21');
  assert.strictEqual(bsrList.query.categoryType, 1);
  assert.strictEqual(nsrList.query.categoryType, 2);
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'comment-analysis flow-structure',
    asin: 'B0GWD724Y8',
    site: 1,
  });
  assert.strictEqual(built.requests.length, 7);
  assert.ok(built.requests.some(item => item.key === 'commentAnalysis'));
  assert.ok(built.requests.some(item => item.key === 'commentList'));
  const traffic = built.requests.find(item => item.key === 'trafficDetail');
  assert.deepStrictEqual(traffic.query, { site: '1', asins: 'B0GWD724Y8' });
}

{
  const built = buildExtendedSelectionRequests({
    preset: 'flow-theme-tags store-feedback',
    site: 1,
    dateInfo: '2026-04',
    searchTerm: 'christmas',
    pageSize: 5,
  });
  assert.strictEqual(built.pendingPresets.length, 0);
  assert.ok(built.requests.some(item => item.key === 'flowThemeMain'));
  assert.ok(built.requests.some(item => item.key === 'flowThemeHistory'));
  assert.ok(built.requests.some(item => item.key === 'flowThemeMatchWord'));
  assert.ok(built.requests.some(item => item.key === 'storeFeedbackList'));
  assert.ok(!built.requests.some(item => item.key === 'storeFeedbackAccountNum'));
  const flowMain = built.requests.find(item => item.key === 'flowThemeMain');
  const flowMatch = built.requests.find(item => item.key === 'flowThemeMatchWord');
  const feedbackList = built.requests.find(item => item.key === 'storeFeedbackList');
  assert.strictEqual(flowMain.body.uTime, '2026-04');
  assert.strictEqual(flowMatch.query.searchTerm, 'christmas');
  assert.strictEqual(feedbackList.query.uTime, '2026-04-01');
  assert.strictEqual(feedbackList.query.myCollection, '0');
}

{
  assert.throws(() => buildExtendedSelectionRequests({ preset: 'asin-info' }), /missing ASIN/);
  assert.throws(() => buildExtendedSelectionRequests({ preset: 'not-a-preset' }), /unknown selection extended preset/);
}

{
  const summary = summarizeApiResult({
    request: {
      preset: 'association-flow',
      key: 'associationFlow',
      label: 'associated product traffic',
      endpoint: '/soundasia_selection/asin/related/listAsin',
    },
    api: {
      ok: true,
      status: 200,
      code: 200,
      success: true,
      result: [{ relatedAsin: 'B012345678' }],
    },
  });
  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.rowCount, 1);
}

{
  const report = buildExtendedSelectionReport({
    requestedPresets: ['asin-info', 'flow-theme-tags'],
    requests: [{ key: 'asinInfo' }, { key: 'flowThemeMain' }],
    apiResults: [{
      request: { preset: 'asin-info', key: 'asinInfo', label: 'ASIN information', endpoint: '/analysis/searchTermByAsin/getInfoByAsin' },
      api: { ok: true, status: 200, code: 200, success: true, result: { asin: 'B0GWD724Y8' } },
    }, {
      request: { preset: 'flow-theme-tags', key: 'flowThemeMain', label: 'traffic theme tag table', endpoint: '/themeTags/listABAStThemeNew' },
      api: { ok: true, status: 200, code: 200, success: true, result: { records: [{ patternSt: 'christmas towel' }], total: 1 } },
    }],
    pendingPresets: [],
    generatedAt: '2026-05-25T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.readyForAutoAction, false);
  assert.strictEqual(report.missingEvidence.length, 0);
}

console.log('selection_extended_evidence.test.js passed');
