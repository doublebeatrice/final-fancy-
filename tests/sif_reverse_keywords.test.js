const assert = require('assert');
const {
  buildReverseKeywordPayload,
  buildReverseKeywordReport,
  buildReverseOverviewPayload,
  extractReverseKeywordResult,
  extractReverseOverviewResult,
  parseArgs,
  readAsinInput,
} = require('../scripts/execute/fetch_sif_reverse_keywords');

{
  const { options, positional } = parseArgs([
    '--asin', 'b01nbndc1t',
    '--page-size=10',
    '--keyword-search', 'pillow',
    'B0TESTASIN',
  ]);
  assert.strictEqual(options.asin, 'b01nbndc1t');
  assert.strictEqual(options['page-size'], '10');
  assert.strictEqual(options['keyword-search'], 'pillow');
  assert.deepStrictEqual(positional, ['B0TESTASIN']);
  assert.strictEqual(readAsinInput(options, positional), 'B01NBNDC1T');
}

assert.deepStrictEqual(
  buildReverseOverviewPayload({ asin: 'b01nbndc1t' }),
  {
    asin: 'B01NBNDC1T',
    listingSearch: false,
    timePieceType: 'latelyDay',
    timePieceValue: '7',
  }
);

assert.deepStrictEqual(
  buildReverseKeywordPayload({ asin: 'b01nbndc1t' }),
  {
    pageSize: 50,
    pageNum: 1,
    desc: true,
    conditions: ['totalPeriod.total'],
    keyword: '',
    asin: 'B01NBNDC1T',
    listingSearch: false,
    timePieceType: 'latelyDay',
    timePieceValue: '7',
    keywordSearch: '',
    sortBy: 'scoreInfo.scoreRatio',
  }
);

{
  const overview = extractReverseOverviewResult({
    status: 200,
    json: {
      code: 1,
      data: {
        totalPeriod: { total: 1450, prev: 1180, in: 485, out: 215 },
        historyTotal: 6726,
        nfKeywordCnt: { total: 1218, prev: 1118, in: 307, out: 207 },
        adKeywordCnt: { total: 447, prev: 196, in: 308, out: 57 },
        spKeywordCnt: { total: 170, prev: 80, in: 120, out: 30 },
        recSpKeywordCnt: { total: 323, prev: 140, in: 220, out: 37 },
        sbKeywordCnt: { total: 63, prev: 40, in: 40, out: 17 },
        sbvKeywordCnt: { total: 65, prev: 45, in: 42, out: 22 },
        pasin: false,
      },
    },
  });
  assert.strictEqual(overview.ok, true);
  assert.strictEqual(overview.totalPeriod.total, 1450);
  assert.strictEqual(overview.historyTotal, 6726);
  assert.strictEqual(overview.naturalKeywords.total, 1218);
  assert.strictEqual(overview.adKeywords.in, 308);
}

{
  const keywordResult = extractReverseKeywordResult({
    status: 200,
    json: {
      code: 1,
      balanceIntegral: 88,
      data: {
        total: 1450,
        timeMode: 'latelyDay',
        pasin: false,
        list: [
          {
            keyword: 'throw pillows',
            keywordId: '123',
            translateKeyword: 'throw pillows',
            isCore: true,
            isTarget: false,
            scoreInfo: { score: '46719.689', scoreRatio: '0.19071172' },
            nfScoreInfo: { score: 33367, scoreRatio: 0.1362 },
            adScoreInfo: { score: 13352, scoreRatio: 0.0545 },
            exposurePositions: ['nf', 'sbv', 'recSp'],
            nfLastRank: 12,
            nfLastRankStr: '12',
          },
        ],
      },
    },
  });
  assert.strictEqual(keywordResult.ok, true);
  assert.strictEqual(keywordResult.total, 1450);
  assert.strictEqual(keywordResult.rows.length, 1);
  assert.strictEqual(keywordResult.rows[0].keyword, 'throw pillows');
  assert.strictEqual(keywordResult.rows[0].total.score, 46719.689);
  assert.deepStrictEqual(keywordResult.rows[0].exposurePositions, ['nf', 'sbv', 'recSp']);
}

{
  const overview = extractReverseOverviewResult({
    status: 200,
    json: {
      code: 1,
      data: {
        totalPeriod: { total: 1450 },
        nfKeywordCnt: { total: 1218 },
        adKeywordCnt: { total: 447 },
      },
    },
  });
  const keywordResult = extractReverseKeywordResult({
    status: 200,
    json: {
      code: 1,
      data: {
        total: 1450,
        list: [
          {
            keyword: 'throw pillows',
            translateKeyword: 'throw pillows',
            scoreInfo: { score: 100, scoreRatio: 0.5 },
            nfScoreInfo: { scoreRatio: 0.4 },
            adScoreInfo: { scoreRatio: 0.1 },
            exposurePositions: ['nf'],
          },
        ],
      },
    },
  });
  const report = buildReverseKeywordReport({
    asin: 'B01NBNDC1T',
    country: 'US',
    request: {},
    overview,
    keywordResult,
    tokenState: { hasToken: true, tokenLength: 32 },
    generatedAt: '2026-06-02T00:00:00.000Z',
  });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.source, 'sif_direct');
  assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
  assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
  assert.strictEqual(report.summary.topKeywords[0].keyword, 'throw pillows');
}

console.log('sif_reverse_keywords.test.js passed');
