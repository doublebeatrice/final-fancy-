const assert = require('assert');
const {
  buildAnalysisKeywordSeasonalityReport,
  buildGoogleTrendPayload,
  buildKeywordSeasonalityPayload,
  buildKeywordSeasonalityPayloads,
  buildKeywordSeasonalityReport,
  extractKeywordSeasonalityResult,
  normalizeSearchTerms,
  summarizeKeywordSeasonalityRows,
} = require('../src/selection_keyword_seasonality');

assert.deepStrictEqual(
  normalizeSearchTerms(` hat, cowboy hat
hat\uFF0Cteacher gifts;christmas cards`),
  ['hat', 'cowboy hat', 'teacher gifts', 'christmas cards']
);

assert.deepStrictEqual(
  buildKeywordSeasonalityPayload({
    searchTerms: [' hat '],
    uTime: '2026-04-30',
    pageNo: '2',
    pageSize: '25',
  }),
  {
    stValue: 'hat',
    titleType: 2,
    stType: '1',
    sale_calc_key: 'orders',
    site: '1',
    dateType: '6',
    uTime: '2026-04-30',
    pageType: 1,
    advancedSearch: {
      total_appear_month_type: '1',
      market_cycle_type: [],
      usrMaskType: [],
      usrMaskProgress: [],
      label: [],
      keywordPattern: null,
    },
    category: [],
    column: 'top_rank',
    order: 'asc',
    pageNo: 2,
    pageSize: 25,
  }
);

const splitPayloads = buildKeywordSeasonalityPayloads({
  searchTerms: [' hat ', 'cowboy hat'],
  uTime: '2026-04-30',
  pageSize: 10,
});
assert.strictEqual(splitPayloads.length, 2);
assert.strictEqual(splitPayloads[0].stValue, 'hat');
assert.strictEqual(splitPayloads[1].stValue, 'cowboy hat');
assert.strictEqual(splitPayloads[1].pageSize, 10);

const apiJson = {
  success: true,
  code: 200,
  message: '\u64CD\u4F5C\u6210\u529F\uFF01',
  result: {
    total: 26413,
    records: [{
      search_term: 'hat organizer',
      top_rank: 1349,
      orders: 466383,
      q1_orders: 114568,
      q2_orders: 114207,
      q3_orders: 112365,
      q4_orders: 125243,
      max_orders_month: '2025-12',
      rel_month_list: '2026-01,2026-02,2026-03,2026-04,2025-05,2025-06,2025-07,2025-08,2025-09,2025-10,2025-11,2025-12',
      orders_chart: '40873,36821,36874,36866,37699,39642,35138,40127,37100,33956,42461,48826',
      search_volume_chart: '291974,251152,242583,244407,241156,276055,237271,260338,269968,240284,301816,360873',
      one_category_id: 'home-garden',
      price_avg: 14.46,
      total_comments_avg: 2200,
      rating_avg: 4.5,
      supply_demand: 0.053,
      total_asin_num: 143,
      brand_monopoly: 0.2498,
      seller_monopoly: 0.2498,
      top3_seller_orders: 59854,
      sv_rising_rate: 0.9167,
      sv_decline_rate: 0.0833,
      usr_mask_type: null,
    }, {
      search_term: 'cowboy hat',
      top_rank: 2402,
      orders: 364518,
      q1_orders: 76583,
      q2_orders: 108267,
      q3_orders: 100658,
      q4_orders: 79010,
      max_orders_month: '2025-10',
      rel_month_list: '2026-01,2026-02,2026-03,2026-04,2025-05,2025-06,2025-07,2025-08,2025-09,2025-10,2025-11,2025-12',
      orders_chart: '19785,25419,31379,37241,39155,31871,36018,32509,32131,44807,17108,17095',
      search_volume_chart: '115139,157697,194290,238539,252258,213169,229183,173958,203487,297689,96739,97477',
      one_category_id: 'fashion',
      price_avg: 24.24,
      total_comments_avg: 786,
      rating_avg: 4.4,
      supply_demand: 0.124,
      total_asin_num: 157,
      brand_monopoly: 0.3023,
      seller_monopoly: 0.3023,
      top3_seller_orders: 27398,
      sv_rising_rate: 0.25,
      sv_decline_rate: 0.75,
      usr_mask_type: '\u4E07\u5723\u8282\uFF08\u5E73\u65F6\u53EF\u5356\uFF09',
    }],
  },
};

const extracted = extractKeywordSeasonalityResult({ status: 200, json: apiJson });
assert.strictEqual(extracted.ok, true);
assert.strictEqual(extracted.total, 26413);
assert.strictEqual(extracted.rows.length, 2);

const summary = summarizeKeywordSeasonalityRows(extracted.rows);
assert.strictEqual(summary[0].searchTerm, 'hat organizer');
assert.strictEqual(summary[0].rank, 1349);
assert.deepStrictEqual(summary[0].quarterlyOrders, { q1: 114568, q2: 114207, q3: 112365, q4: 125243 });
assert.strictEqual(summary[0].quarterRatio, 1.11);
assert.strictEqual(summary[0].seasonalityType, 'evergreen_or_weak_seasonal');
assert.strictEqual(summary[0].topMonths[0].month, '2025-12');
assert.strictEqual(summary[0].topMonths[0].orders, 48826);
assert.strictEqual(summary[0].monthlyOrders.length, 12);
assert.strictEqual(summary[0].searchVolumeTrend, 'rising');
assert.strictEqual(summary[0].competitionTier, 'medium');
assert.strictEqual(summary[0].recommendedUse, 'evergreen_market_validation');
assert.ok(summary[0].crossChecks.some(item => item.tool === 'selection_keyword_conversion_rate'));

assert.strictEqual(summary[1].seasonalityType, 'moderate_seasonal');
assert.strictEqual(summary[1].peakQuarter, 'q2');
assert.strictEqual(summary[1].searchVolumeTrend, 'declining');
assert.strictEqual(summary[1].seasonLabel, '\u4E07\u5723\u8282\uFF08\u5E73\u65F6\u53EF\u5356\uFF09');
assert.strictEqual(summary[1].recommendedUse, 'seasonal_or_niche_validation');

const report = buildKeywordSeasonalityReport({
  requestedSearchTerms: ['hat', 'cowboy hat', 'nurse gifts'],
  extracted,
  generatedAt: '2026-05-21T08:00:00.000Z',
  uTime: '2026-04-30',
  dateType: '6',
});

assert.deepStrictEqual(report.coverage.missingSearchTerms, ['hat', 'nurse gifts']);
assert.strictEqual(report.coverage.returnedCount, 2);
assert.strictEqual(report.period.dataAgeDays, 21);
assert.strictEqual(report.period.freshness, 'fresh');
assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
assert.strictEqual(report.operatorSummary.bySeasonalityType.moderate_seasonal, 1);
assert.strictEqual(report.operatorSummary.byRecommendedUse.evergreen_market_validation, 1);
assert.ok(report.crossValidationPlan.some(item => item.tool === 'inventory_and_profit'));

assert.strictEqual(
  extractKeywordSeasonalityResult({ status: 200, json: { success: true, code: 200, result: { records: null } } }).rows.length,
  0
);

assert.deepStrictEqual(
  buildGoogleTrendPayload({ searchTerms: ['sun hats for women'], site: '1' }),
  {
    site: '1',
    searchTerms: ['sun hats for women'],
    gType: '1',
    timeType: '2',
  }
);

const analysisReport = buildAnalysisKeywordSeasonalityReport({
  requestedSearchTerms: ['sun hats for women', 'missing term'],
  generatedAt: '2026-05-21T08:00:00.000Z',
  dateType: '2',
  uTime: '2026-04-30',
  analysisResults: [{
    searchTerm: 'sun hats for women',
    googleTrend: {
      success: true,
      code: 200,
      result: {
        timelineData: [
          { formattedTime: '2025-05-18 - 24', time: '1747526400', value: [85], formattedValue: ['85'] },
          { formattedTime: '2025-05-25 - 31', time: '1748131200', value: [70], formattedValue: ['70'] },
          { formattedTime: '2025-06-01 - 7', time: '1748736000', value: [94], formattedValue: ['94'] },
        ],
      },
    },
    overview: {
      success: true,
      code: 200,
      result: [{
        search_term: 'sun hats for women',
        rank: 2393,
        search_volume: 196759,
        asin_counts: 170,
      }],
    },
    asinCompetition: {
      success: true,
      code: 200,
      result: {
        asinDetail: [{
          asin: 'B000000001',
          title: 'Wide Brim Sun Hat for Women',
          brand: 'furtalk',
          price: 13.99,
          rating: 4.5,
          commentNum: 1200,
          boughtMonth: 3000,
        }, {
          asin: 'B000000002',
          title: 'Foldable Beach Hat',
          brand: 'other',
          price: 15.99,
          rating: 4.3,
          total_comments: 800,
          boughtMonth: 1200,
        }],
      },
    },
    buyerSearchTerms: {
      success: true,
      code: 200,
      other: '20260401~20260431',
      result: {
        records: [{
          search_term: 'beach hats for women',
          rank: 3333,
          search_volume: 50000,
        }],
        total: 1,
      },
    },
  }],
});

assert.strictEqual(analysisReport.source, 'selection_keyword_seasonality');
assert.strictEqual(analysisReport.coverage.returnedCount, 1);
assert.deepStrictEqual(analysisReport.coverage.missingSearchTerms, ['missing term']);
assert.strictEqual(analysisReport.rows[0].searchTerm, 'sun hats for women');
assert.strictEqual(analysisReport.rows[0].rank, 2393);
assert.strictEqual(analysisReport.rows[0].searchVolume, 196759);
assert.strictEqual(analysisReport.rows[0].asinCount, 170);
assert.strictEqual(analysisReport.rows[0].googleTrend.latestValue, 94);
assert.strictEqual(analysisReport.rows[0].googleTrend.maxValue, 94);
assert.strictEqual(analysisReport.rows[0].googleTrend.direction, 'mixed_or_flat');
assert.strictEqual(analysisReport.rows[0].competitorSummary.asinCount, 2);
assert.strictEqual(analysisReport.rows[0].competitorSummary.priceAvg, 14.99);
assert.strictEqual(analysisReport.rows[0].buyerSearchTerms[0].searchTerm, 'beach hats for women');
assert.strictEqual(analysisReport.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(analysisReport.opsReadiness.readyForAutoAction, false);
assert.ok(analysisReport.crossValidationPlan.some(item => item.tool === 'selection_keyword_conversion_rate'));

console.log('selection_keyword_seasonality tests passed');
