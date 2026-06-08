const assert = require('assert');
const {
  buildKeywordHistoryUrl,
  buildReport,
  extractSifKeywordHistory,
  parseArgs,
  readKeywordInput,
} = require('../scripts/execute/fetch_sif_keyword_history');

{
  const { options, positional } = parseArgs([
    '--keyword', 'party favors',
    '--country=us',
    '--granularity', 'week',
    'gift bags',
  ]);
  assert.strictEqual(options.keyword, 'party favors');
  assert.strictEqual(options.country, 'us');
  assert.strictEqual(options.granularity, 'week');
  assert.deepStrictEqual(positional, ['gift bags']);
  assert.deepStrictEqual(readKeywordInput(options, positional), ['party favors', 'gift bags']);
}

assert.strictEqual(
  buildKeywordHistoryUrl({
    keyword: 'party favors',
    country: 'us',
    granularity: 'week',
    now: 123,
  }),
  '/api/search/keyword/abahistory/chart?country=US&keyword=party+favors&granularity=week&_t=123'
);

{
  const extracted = extractSifKeywordHistory({
    status: 200,
    code: 1,
    message: '',
    json: {
      code: 1,
      data: {
        granularities: ['2026-W20', '2026-W21'],
        keywordSearchVolumes: [100, 150],
        extSearchVolumes: [90, 120],
        keywordRanks: [5, 3],
        festivals: ['Memorial Day'],
      },
    },
  });
  assert.strictEqual(extracted.ok, true);
  assert.strictEqual(extracted.timeline.length, 2);
  assert.strictEqual(extracted.summary.latestSearchVolume, 150);
  assert.strictEqual(extracted.summary.searchVolumeDirection, 'rising');
  assert.strictEqual(extracted.summary.rankDirection, 'improving');
  assert.deepStrictEqual(extracted.festivals, ['Memorial Day']);
}

{
  const report = buildReport({
    country: 'US',
    granularity: 'week',
    tokenState: { hasToken: true, tokenLength: 32, cookieNames: ['sif_token_share_prod'] },
    login: { ok: true, status: 200, code: 1, loginSuccess: true, tokenState: { hasToken: true, tokenLength: 32 } },
    keywordResults: [
      {
        keyword: 'party favors',
        ok: true,
        summary: {
          latestSearchVolume: 150,
          searchVolumeDirection: 'rising',
          rankDirection: 'improving',
        },
      },
    ],
    generatedAt: '2026-06-02T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.source, 'sif_direct');
  assert.strictEqual(report.login.ok, true);
  assert.strictEqual(report.summary.requestedCount, 1);
  assert.strictEqual(report.summary.latestSearchVolumes[0].latestSearchVolume, 150);
}

console.log('sif_keyword_history.test.js passed');
