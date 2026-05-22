const assert = require('assert');
const {
  buildKeywordHistoryPayload,
  buildProductTimeMachinePayload,
  buildProductTimeMachineReport,
  extractKeywordHistoryResult,
  extractProductTimeMachineResult,
  normalizeSearchKeywords,
  summarizeProductTimeMachineRows,
} = require('../src/selection_product_time_machine');

assert.deepStrictEqual(
  normalizeSearchKeywords(' red, nurse gifts\nred;sun hat '),
  ['red', 'nurse gifts', 'sun hat']
);

assert.deepStrictEqual(
  buildProductTimeMachinePayload({
    searchKeyword: ' red ',
    timePieceValue: '30',
    pageNum: '2',
    pageSize: '25',
  }),
  {
    site: '1',
    timePieceType: 'latelyDay',
    timePieceValue: '30',
    type: 2,
    pageNum: 2,
    pageSize: 25,
    sortBy: 'nfScoreRatio',
    desc: true,
    showType: '1',
    condition: '',
    searchKeyword: 'red',
  }
);

assert.deepStrictEqual(
  buildKeywordHistoryPayload({ keyword: ' red ', granularity: 'week' }),
  {
    api: 'https://www.sif.com/api/search/keyword/abahistory/chart',
    siteName: 'us',
    method: 'get',
    body: {
      country: 'US',
      keyword: 'red',
      granularity: 'week',
    },
  }
);

const pageQueryJson = {
  success: true,
  code: 200,
  message: 'ok',
  result: {
    total: 225,
    asins: [{
      asin: 'B003PFPFIE',
      title: 'Red Bull Energy Drink with 80mg Caffeine plus Taurine & B Vitamins, 8.4 Fl Oz, Pack of 24 Cans',
      img: 'https://m.media-amazon.com/images/I/81KGBZO-fXL._AC_UL320_.jpg',
      boughtInPastMonth: '20,000+',
      boughtHistoryDates: ['2026-02', '2026-03', '2026-04'],
      boughtHistory: ['10000', '10000', '20000'],
      ratingNum: 43079,
      price: 34.98,
      score: 4.7,
      star: 4.5,
      isBestSeller: 'false',
      flowResources: { natural: [], sbv: [], sb: [] },
      rankHistory: {
        date: ['2026-05-13', '2026-05-14', '2026-05-15'],
        adRank: [],
        rank: [2, 1, 6],
      },
      total: '1562',
      natural: '369',
      sp: '0',
      brand: '2',
      vedio: '1382',
      ac: '0',
      er: '0',
      tr: '0',
      hasVaiants: true,
      features: ['16 Fl Oz, 12pk'],
      nfScoreRatio: 0.02611931,
      aoVal: 3.751,
      focus: false,
      vaiant: false,
      searchKeyword: 'red',
    }],
  },
};

const extracted = extractProductTimeMachineResult({ status: 200, json: pageQueryJson });
assert.strictEqual(extracted.ok, true);
assert.strictEqual(extracted.total, 225);
assert.strictEqual(extracted.rows.length, 1);

const rows = summarizeProductTimeMachineRows(extracted.rows);
assert.strictEqual(rows[0].asin, 'B003PFPFIE');
assert.strictEqual(rows[0].searchKeyword, 'red');
assert.strictEqual(rows[0].boughtInPastMonthLowerBound, 20000);
assert.strictEqual(rows[0].monthlyBoughtHistory[2].month, '2026-04');
assert.strictEqual(rows[0].monthlyBoughtHistory[2].lowerBound, 20000);
assert.strictEqual(rows[0].rankHistory.latestOrganicRank, 6);
assert.strictEqual(rows[0].rankHistory.bestOrganicRank, 1);
assert.strictEqual(rows[0].trafficTerms.video, 1382);
assert.strictEqual(rows[0].trafficMix, 'ad_augmented');
assert.strictEqual(rows[0].flowResourceTypes.includes('sbv'), true);
assert.strictEqual(rows[0].demandTier, 'high');
assert.strictEqual(rows[0].recommendedUse, 'competitor_traffic_map');
assert.ok(rows[0].crossChecks.some(item => item.tool === 'selection_aba_search_terms'));

const historyJson = {
  success: true,
  code: 200,
  message: 'ok',
  result: {
    granularities: ['2026-05-03', '2026-05-10', '2026-05-17'],
    keywordSearchVolumes: [1000, 1500, 1800],
    keywordRanks: [3000, 2500, 2200],
    extSearchVolumes: [900, 1200, 1600],
    festivals: [],
  },
};
const history = extractKeywordHistoryResult({ status: 200, json: historyJson });
assert.strictEqual(history.ok, true);
assert.strictEqual(history.timeline.length, 3);
assert.strictEqual(history.summary.latestSearchVolume, 1800);
assert.strictEqual(history.summary.bestRank, 2200);
assert.strictEqual(history.summary.searchVolumeDirection, 'rising');
assert.strictEqual(history.summary.rankDirection, 'improving');

const report = buildProductTimeMachineReport({
  requestedKeywords: ['red', 'missing'],
  extracted: {
    ...extracted,
    rows: extracted.rows,
  },
  keywordHistoryResults: [{
    keyword: 'red',
    request: buildKeywordHistoryPayload({ keyword: 'red' }),
    extracted: history,
  }],
  generatedAt: '2026-05-21T08:00:00.000Z',
  request: buildProductTimeMachinePayload({ searchKeyword: 'red' }),
});

assert.strictEqual(report.source, 'selection_product_time_machine');
assert.strictEqual(report.mode, 'product_time_machine');
assert.strictEqual(report.coverage.returnedCount, 1);
assert.deepStrictEqual(report.coverage.missingKeywords, ['missing']);
assert.strictEqual(report.keywordHistory[0].summary.latestSearchVolume, 1800);
assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
assert.ok(report.crossValidationPlan.some(item => item.tool === 'selection_keyword_conversion_rate'));

const reportWithFailedAuxiliaryHistory = buildProductTimeMachineReport({
  requestedKeywords: ['red'],
  extracted,
  keywordHistoryResults: [{
    keyword: 'red',
    request: buildKeywordHistoryPayload({ keyword: 'red' }),
    extracted: {
      ok: false,
      status: 500,
      code: 500,
      success: false,
      message: 'history unavailable',
      timeline: [],
      summary: {},
    },
  }],
  generatedAt: '2026-05-21T08:00:00.000Z',
  request: buildProductTimeMachinePayload({ searchKeyword: 'red' }),
});
assert.strictEqual(reportWithFailedAuxiliaryHistory.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(reportWithFailedAuxiliaryHistory.keywordHistory[0].ok, false);

console.log('selection_product_time_machine tests passed');
