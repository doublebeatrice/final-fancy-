const assert = require('assert');
const {
  buildRequestUrl,
  buildSelectionApiReport,
  canonicalizeEndpoint,
  countRows,
  extractTotal,
  isReadOnlySelectionRequest,
  parseArgs,
  parseQuery,
  safeFileSegment,
} = require('../scripts/execute/fetch_selection_api');

{
  const { options, positional } = parseArgs([
    '--endpoint', '/categoryAnalysis/listProfitCategory',
    '--method=POST',
    '--query', 'site=1&pageNo=1',
    '--param', 'pageSize=20',
    'tail',
  ]);
  assert.strictEqual(options.endpoint, '/categoryAnalysis/listProfitCategory');
  assert.strictEqual(options.method, 'POST');
  assert.strictEqual(positional[0], 'tail');
  assert.deepStrictEqual(parseQuery(options), {
    site: '1',
    pageNo: '1',
    pageSize: '20',
  });
}

assert.strictEqual(
  canonicalizeEndpoint('/categoryAnalysis/listProfitCategory'),
  '/soundasia_selection/categoryAnalysis/listProfitCategory'
);
assert.strictEqual(
  canonicalizeEndpoint('sellAccount/feedback/listByES'),
  '/soundasia_selection/sellAccount/feedback/listByES'
);
assert.strictEqual(
  canonicalizeEndpoint('/soundasia_selection/sif/timemachine/pageQuery'),
  '/soundasia_selection/sif/timemachine/pageQuery'
);

assert.strictEqual(
  buildRequestUrl('/asin/related/listAsin', { site: 1, asin: 'B012345678' }),
  '/soundasia_selection/asin/related/listAsin?site=1&asin=B012345678'
);

assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/categoryAnalysis/listProfitCategory',
  method: 'POST',
}), true);
assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/sellAccount/feedback/listByES',
  method: 'GET',
}), true);
assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/themeTags/listABAStThemeNew',
  method: 'POST',
}), true);
assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/userFilter/updateFilter',
  method: 'POST',
}), false);
assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/asinComments/analysis/updateCommentValues',
  method: 'POST',
}), false);
assert.strictEqual(isReadOnlySelectionRequest({
  endpoint: '/themeTags/addABAMatchWord',
  method: 'POST',
}), false);

assert.strictEqual(countRows({ records: [{}, {}] }), 2);
assert.strictEqual(countRows({ data: { rows: [{ id: 1 }] } }), 1);
assert.strictEqual(extractTotal({ result: { total: 42 } }), 42);
assert.strictEqual(safeFileSegment('/soundasia_selection/categoryAnalysis/listProfitCategory?site=1'), 'categoryAnalysis_listProfitCategory_site_1');

{
  const report = buildSelectionApiReport({
    request: {
      endpoint: '/soundasia_selection/categoryAnalysis/listProfitCategory',
      url: '/soundasia_selection/categoryAnalysis/listProfitCategory',
      method: 'POST',
      query: {},
      body: { site: 1 },
    },
    api: {
      ok: true,
      status: 200,
      code: 200,
      success: true,
      message: 'ok',
      isJson: true,
      result: { records: [{ asin: 'B012345678' }], total: 1 },
      json: { code: 200, success: true, result: { records: [{ asin: 'B012345678' }], total: 1 } },
      hasAccessToken: true,
      tokenLength: 235,
    },
    generatedAt: '2026-05-25T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.total, 1);
  assert.strictEqual(report.rowCount, 1);
  assert.deepStrictEqual(report.tokenState, { hasAccessToken: true, tokenLength: 235 });
}

{
  const report = buildSelectionApiReport({
    request: {
      endpoint: '/soundasia_selection/categoryAnalysis/listProfitCategory',
      url: '/soundasia_selection/categoryAnalysis/listProfitCategory',
      method: 'POST',
      query: {},
      body: { site: 1 },
    },
    api: {
      ok: false,
      status: 200,
      code: 500,
      success: false,
      message: "Required String parameter 'uTime' is not present",
      isJson: true,
      result: null,
      json: { code: 500, success: false, message: "Required String parameter 'uTime' is not present", result: null },
      hasAccessToken: true,
      tokenLength: 235,
    },
    generatedAt: '2026-05-25T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.code, 500);
  assert.strictEqual(report.message, "Required String parameter 'uTime' is not present");
}

console.log('selection_api_fetcher.test.js passed');
