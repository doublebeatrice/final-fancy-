const assert = require('assert');
const {
  buildKeywordConversionPayload,
  buildKeywordConversionReport,
  extractKeywordConversionResult,
  normalizeKeywords,
  summarizeKeywordConversionRows,
} = require('../src/selection_keyword_conversion_rate');

assert.deepStrictEqual(
  normalizeKeywords(` patriotic bucket hat, american flag bucket hat
patriotic bucket hat\uFF0C nurse gifts for women;4th of july decorations`),
  ['patriotic bucket hat', 'american flag bucket hat', 'nurse gifts for women', '4th of july decorations']
);

assert.deepStrictEqual(
  buildKeywordConversionPayload({
    keywords: [' patriotic bucket hat ', 'american flag bucket hat'],
    pageNum: '2',
    pageSize: '25',
  }),
  {
    keywords: ['patriotic bucket hat', 'american flag bucket hat'],
    customPrice: '',
    customProfitRate: '',
    desc: true,
    sortBy: '',
    pageNum: 2,
    pageSize: 25,
    strategy: 'legacyForSales_exact',
  }
);

const apiJson = {
  success: true,
  code: 200,
  message: '\u64CD\u4F5C\u6210\u529F\uFF01',
  result: {
    total: 2,
    weekNumber: 70,
    weekDate: '2026-04-26',
    keywords: [{
      keyword: 'american flag bucket hat',
      translateKeyword: '\u7F8E\u56FD\u56FD\u65D7\u6E14\u592B\u5E3D',
      searchVolume: 169,
      clickVolume: 124,
      purchaseVolume: 5,
      searchClickRatio: 0.7337,
      searchPurchaseRatio: 0.0296,
      clickPurchaseRatio: 0.0403,
      source: 'mix',
      updateTime: '2026-05-06 01:35:24',
      period: '2026-04-26',
      maxKwPrice: 46.99,
      avgKwPrice: 19.56,
      minKwPrice: 5.69,
      cpc: {
        legacyForSales_exact: [{ median: 0.74, start: 0.55, end: 0.93, categoryName: "Women's Bucket Hats", categoryid: '2474975011' }],
        legacyForSales_phrase: [{ median: 0.74, start: 0.55, end: 0.93, categoryName: "Women's Bucket Hats", categoryid: '2474975011' }],
        autoForSales_exact: [{ median: 0.48, start: 0.36, end: 0.6, categoryName: "Women's Bucket Hats", categoryid: '2474975011' }],
      },
      cpa: {
        legacyForSales_exact: [{ median: 18.3623, start: 13.6476, end: 23.0769 }],
        legacyForSales_phrase: [{ median: 18.3623, start: 13.6476, end: 23.0769 }],
        autoForSales_exact: [{ median: 11.9107, start: 8.933, end: 14.8883 }],
      },
      acos: {
        legacyForSales_exact: [{ median: 0.9388, start: 3.2271, end: 0.3908 }],
        legacyForSales_phrase: [{ median: 0.9388, start: 3.2271, end: 0.3908 }],
        autoForSales_exact: [{ median: 0.609, start: 2.0933, end: 0.2535 }],
      },
      asinsClickPurchaseRatio: [{ asin: 'B07D5B1YG4', clickPurchaseRatio: 0.03914935 }],
      topAsins: [{ asin: 'B0GTLP11HQ', price: 16.99, title: 'Waterproof Bucket Hats' }],
    }, {
      keyword: '4th of july decorations',
      translateKeyword: '4th of july decorations',
      searchVolume: 67269,
      clickVolume: 16518,
      purchaseVolume: 1151,
      searchClickRatio: 0.2456,
      searchPurchaseRatio: 0.0171,
      clickPurchaseRatio: 0.0697,
      source: 'mix',
      updateTime: '2026-05-06 10:23:27',
      period: '2026-04-26',
      maxKwPrice: 29.99,
      avgKwPrice: 13.03,
      minKwPrice: 5.39,
      cpc: {
        legacyForSales_exact: [{ median: 0.68, start: 0.51, end: 0.85, categoryName: 'Party Banners', categoryid: '23501433011' }],
        autoForSales_exact: [{ median: 0.4, start: 0.32, end: 0.5, categoryName: 'Party Banners', categoryid: '23501433011' }],
      },
      cpa: {
        legacyForSales_exact: [{ median: 9.7561, start: 7.3171, end: 12.1951 }],
        autoForSales_exact: [{ median: 5.7389, start: 4.5911, end: 7.1736 }],
      },
      acos: {
        legacyForSales_exact: [{ median: 0.7485, start: 1.81, end: 0.3253 }],
        autoForSales_exact: [{ median: 0.4403, start: 1.0647, end: 0.1914 }],
      },
      asinsClickPurchaseRatio: [],
      topAsins: new Array(10).fill(0).map((_, index) => ({ asin: `B0TEST${index}`, price: 9.99 })),
    }],
  },
};

const extracted = extractKeywordConversionResult({ status: 200, json: apiJson });
assert.strictEqual(extracted.ok, true);
assert.strictEqual(extracted.total, 2);
assert.strictEqual(extracted.weekDate, '2026-04-26');
assert.strictEqual(extracted.rows.length, 2);

const summary = summarizeKeywordConversionRows(extracted.rows, { strategy: 'legacyForSales_exact' });
assert.strictEqual(summary[0].keyword, 'american flag bucket hat');
assert.strictEqual(summary[0].translateKeyword, '\u7F8E\u56FD\u56FD\u65D7\u6E14\u592B\u5E3D');
assert.strictEqual(summary[0].clickPurchaseRatio, 0.0403);
assert.strictEqual(summary[0].cpcMedian, 0.74);
assert.strictEqual(summary[0].strategyMetrics.autoForSales_exact.cpaMedian, 11.9107);
assert.strictEqual(summary[0].bestCostStrategy, 'autoForSales_exact');
assert.strictEqual(summary[0].marketQuality, 'usable_niche');
assert.strictEqual(summary[0].recommendedUse, 'cross_check_before_spend');
assert.ok(summary[0].evidenceNotes.some(item => item.includes('clickPurchaseRatio=0.0403')));
assert.ok(summary[0].crossChecks.some(item => item.tool === 'ad_backend' && item.status === 'needed'));

assert.strictEqual(summary[1].marketQuality, 'strong');
assert.strictEqual(summary[1].recommendedUse, 'candidate_exact_or_phrase');
assert.strictEqual(summary[1].costRisk, 'medium');

const report = buildKeywordConversionReport({
  requestedKeywords: ['patriotic bucket hat', 'american flag bucket hat', '4th of july decorations'],
  extracted,
  strategy: 'legacyForSales_exact',
  generatedAt: '2026-05-18T10:00:00.000Z',
});

assert.deepStrictEqual(report.coverage.missingKeywords, ['patriotic bucket hat']);
assert.strictEqual(report.coverage.returnedCount, 2);
assert.strictEqual(report.period.dataAgeDays, 22);
assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
assert.ok(report.crossValidationPlan.some(item => item.tool === 'aba_search_terms'));

assert.strictEqual(
  extractKeywordConversionResult({ status: 200, json: { success: true, code: 200, result: { keywords: null } } }).rows.length,
  0
);

console.log('selection_keyword_conversion_rate tests passed');
