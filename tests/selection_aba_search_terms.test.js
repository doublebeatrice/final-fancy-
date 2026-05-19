const assert = require('assert');
const {
  buildAbaSearchTermPayload,
  buildAbaSearchTermPayloads,
  buildAbaSearchTermReport,
  extractAbaSearchTermResult,
  normalizeSearchTerms,
  summarizeAbaSearchTermRows,
} = require('../src/selection_aba_search_terms');

assert.deepStrictEqual(
  normalizeSearchTerms(` cowboy hat, nurse gifts
cowboy hat\uFF0C4th of july decorations;western party decorations`),
  ['cowboy hat', 'nurse gifts', '4th of july decorations', 'western party decorations']
);

assert.deepStrictEqual(
  buildAbaSearchTermPayload({
    searchTerms: [' cowboy hat '],
    uTime: '2026-04-30',
    pageNo: '2',
    pageSize: '25',
  }),
  {
    site: '1',
    dateType: '2',
    uTime: '2026-04-30',
    stValue: 'cowboy hat',
    stType: '1',
    titleType: 2,
    category: [],
    advancedSearch: {},
    pageNo: 2,
    pageSize: 25,
    pageType: 1,
    column: 'rank',
    order: 'asc',
  }
);

const splitPayloads = buildAbaSearchTermPayloads({
  searchTerms: [' cowboy hat ', 'nurse gifts'],
  uTime: '2026-04-30',
  pageSize: 10,
});
assert.strictEqual(splitPayloads.length, 2);
assert.strictEqual(splitPayloads[0].stValue, 'cowboy hat');
assert.strictEqual(splitPayloads[1].stValue, 'nurse gifts');
assert.strictEqual(splitPayloads[1].pageSize, 10);

const apiJson = {
  success: true,
  code: 200,
  message: '\u64CD\u4F5C\u6210\u529F\uFF01',
  result: {
    total: 445,
    records: [{
      search_term: 'cowboy hat',
      rank: 1713,
      search_volume: 238539,
      orders: 37241,
      amazon_monthly_sales: 34400,
      asin1: 'B0FP19VG6F',
      asin2: 'B0BDRT6Z6L',
      asin3: 'B0CC5YP9TD',
      click_share1: 0.1348,
      click_share2: 0.0905,
      click_share3: 0.0823,
      total_click_share: 0.3076,
      conversion_share1: 0.0095,
      conversion_share2: 0.0385,
      conversion_share3: 0.012,
      total_conversion_share: 0.06,
      st_category1: 'Apparel',
      st_category2: 'Toys',
      st_category3: 'Shoes',
      category_id: 'fashion',
      market_cycle_type: 4,
      st_ao_avg: 0.16,
      st_ao_val_matrix: 0.273,
      st_ao_val_rate: 0.3696,
      st_zr_flow_proportion: 0.944,
      st_flow_proportion_matrix: 0.908,
      st_sp_counts: 0,
      st_zr_counts: 135,
      page3_brand_num: 84,
      brand_monopoly: 0.3023,
      page3_seller_num: 91,
      seller_monopoly: 0.3023,
      supply_demand: 0.124,
      total_asin_num: 157,
      quantity_being_sold: 29590,
      new_asin_num: 24,
      new_asin_proportion: 0.1529,
      new_asin_orders: 336,
      new_bsr_orders_proportion: 0.0465,
      bsr_orders: 34400,
      top3_seller_orders: 492,
      top3_seller_bsr_orders: 10400,
      top3_brand_orders: 492,
      top3_brand_bsr_orders: 10400,
      price_avg: 24.24,
      rating_avg: 4.4,
      total_comments_avg: 786,
      title_length_avg: 102,
      page1_title_proportion: 0.9167,
      st_zr_page123_title_appear_rate: 0.837,
      multi_size_proportion: 0.6879,
      color_proportion: 0.9427,
      multi_color_proportion: 0,
      most_proportion: 0.076,
      max_num: 24,
      max_num_asin: 'B0CJFD13RV',
      is_search_text: '\u641C\u7D22\u8BCD',
      is_ascending_text: '\u4E0A\u5347',
      is_first_text: '\u9996\u6B21\u51FA\u73B0',
      is_high_return_text: '\u975E\u9AD8\u9000\u8D27',
      is_new_market_segment: '\u65B0\u5174\u5E02\u573A',
      usr_mask_type: '\u4E07\u5723\u8282\uFF08\u5E73\u65F6\u53EF\u5356\uFF09',
    }, {
      search_term: 'western cowboy hat',
      rank: 64211,
      search_volume: 8212,
      orders: 366,
      amazon_monthly_sales: 190,
      total_click_share: 0.62,
      total_conversion_share: 0.41,
      page3_brand_num: 18,
      brand_monopoly: 0.71,
      page3_seller_num: 21,
      seller_monopoly: 0.68,
      supply_demand: 0.82,
      price_avg: 19.99,
      rating_avg: 4.1,
      total_comments_avg: 91,
    }],
  },
};

const extracted = extractAbaSearchTermResult({ status: 200, json: apiJson });
assert.strictEqual(extracted.ok, true);
assert.strictEqual(extracted.total, 445);
assert.strictEqual(extracted.rows.length, 2);

const summary = summarizeAbaSearchTermRows(extracted.rows);
assert.strictEqual(summary[0].searchTerm, 'cowboy hat');
assert.strictEqual(summary[0].rank, 1713);
assert.strictEqual(summary[0].searchVolume, 238539);
assert.strictEqual(summary[0].estimatedOrders, 37241);
assert.strictEqual(summary[0].topAsins[0].asin, 'B0FP19VG6F');
assert.strictEqual(summary[0].topAsins[0].clickShare, 0.1348);
assert.deepStrictEqual(summary[0].categoryPath, ['Apparel', 'Toys', 'Shoes']);
assert.strictEqual(summary[0].demandTier, 'high');
assert.strictEqual(summary[0].competitionTier, 'medium');
assert.strictEqual(summary[0].recommendedUse, 'cross_check_with_sku_fit');
assert.ok(summary[0].evidenceNotes.some(item => item.includes('rank=1713')));
assert.ok(summary[0].crossChecks.some(item => item.tool === 'selection_keyword_conversion_rate'));

assert.strictEqual(summary[1].demandTier, 'low');
assert.strictEqual(summary[1].competitionTier, 'high');
assert.strictEqual(summary[1].recommendedUse, 'hold_or_research_only');

const report = buildAbaSearchTermReport({
  requestedSearchTerms: ['cowboy hat', 'nurse gifts', 'western cowboy hat'],
  extracted,
  generatedAt: '2026-05-18T02:00:00.000Z',
  uTime: '2026-04-30',
  dateType: '2',
});

assert.deepStrictEqual(report.coverage.missingSearchTerms, ['nurse gifts']);
assert.strictEqual(report.coverage.returnedCount, 2);
assert.strictEqual(report.period.dataAgeDays, 18);
assert.strictEqual(report.period.freshness, 'fresh');
assert.strictEqual(report.opsReadiness.readyForDecisionSupport, true);
assert.strictEqual(report.opsReadiness.readyForAutoAction, false);
assert.strictEqual(report.operatorSummary.byDemandTier.high, 1);
assert.strictEqual(report.operatorSummary.byCompetitionTier.high, 1);
assert.ok(report.crossValidationPlan.some(item => item.tool === 'ad_backend'));

assert.strictEqual(
  extractAbaSearchTermResult({ status: 200, json: { success: true, code: 200, result: { records: null } } }).rows.length,
  0
);

console.log('selection_aba_search_terms tests passed');
