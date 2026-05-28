const assert = require('assert');

const {
  buildKeywordPlacementReport,
  freshness,
  inferAsinsFromSnapshot,
  normalizePlacementGroup,
  normalizeTrendRows,
  placementGroupFromTrendRows,
  parsePositionRank,
  splitList,
} = require('../src/ad_keyword_placement');

assert.deepStrictEqual(splitList('cowboy hats, cowboy hat\ncowgirl hat'), ['cowboy hats', 'cowboy hat', 'cowgirl hat']);
assert.strictEqual(parsePositionRank('3', '3'), 99);
assert.strictEqual(parsePositionRank('', '3'), null);

const generatedAt = '2026-05-28T03:41:30.000Z';
const placementGroup = normalizePlacementGroup({
  items: [{
    searchTerm: 'cowboy hats',
    cateType: 'zr',
    asin: 'B09MK757X9',
    page: '3',
    pageRow: '3',
    timeBatch: '2026-05-28-10',
    createdTime: '2026-05-28 10:48:30',
    sourceLabel: 'auto',
  }],
  trendArrow: {
    sp: 'down',
    zr: 'up',
  },
}, generatedAt);

assert.strictEqual(placementGroup.ad, null);
assert.strictEqual(placementGroup.adText, '广告前五页无结果');
assert.strictEqual(placementGroup.organicText, '自然 P3-3');
assert.strictEqual(placementGroup.organic.rank, 99);
assert.deepStrictEqual(placementGroup.trendArrow, { sp: 'down', zr: 'up' });
assert.strictEqual(placementGroup.freshness.status, 'fresh');

const staleFreshness = freshness('2026-05-27 00:00:00', generatedAt);
assert.strictEqual(staleFreshness.status, 'stale');
assert.ok(staleFreshness.ageHours > 24);

const trendRows = normalizeTrendRows([{
  timeBatch: '2026-05-28-10',
  auto: {
    zr: {
      page: '3',
      pageRow: '3',
      createdTime: '2026-05-28 10:48:30',
    },
  },
}], generatedAt);
assert.strictEqual(trendRows[0].auto.organic.rank, 99);
assert.strictEqual(trendRows[0].auto.ad, null);

const placementFromTrend = placementGroupFromTrendRows(trendRows, generatedAt);
assert.strictEqual(placementFromTrend.source, 'trend_latest');
assert.strictEqual(placementFromTrend.adText, '广告前五页无结果');
assert.strictEqual(placementFromTrend.organicText, '自然 P3-3');

const snapshot = {
  productCards: [
    { sku: 'SAN0383', asin: 'B09MK757X9' },
    { sku: 'SAN0383', asin: 'B09OTHER' },
  ],
};
assert.deepStrictEqual(inferAsinsFromSnapshot(snapshot, 'san0383'), ['B09MK757X9', 'B09OTHER']);

const report = buildKeywordPlacementReport({
  generatedAt,
  request: { sku: 'SAN0383', terms: ['cowboy hats'], asins: ['B09MK757X9'] },
  keywordRows: [{
    keywordId: '368345204556183',
    keywordText: 'cowboy hats',
    keywordPosition: 1,
    adGroupId: '515181560403407',
    campaignId: '350659306277711',
    campaignName: 'kw_cowhat&band_san0383',
    bid: '0.37',
    Impressions: '78592',
    Clicks: '362',
    Orders: '39',
    ACOS: '0.140672',
  }],
  placementData: {
    515181560403407: {
      B09MK757X9: {
        items: placementGroup.items,
        trendArrow: placementGroup.trendArrow,
      },
    },
  },
  asins: ['B09MK757X9'],
});

assert.strictEqual(report.coverage.keywordRowCount, 1);
assert.strictEqual(report.coverage.placementEligibleRowCount, 1);
assert.strictEqual(report.coverage.rowsWithPlacement, 1);
assert.strictEqual(report.coverage.readyForAutoAction, false);
assert.strictEqual(report.rows[0].placement.organicText, '自然 P3-3');
assert.strictEqual(report.rows[0].placement.adText, '广告前五页无结果');
assert.strictEqual(report.rows[0].metrics.orders, 39);

console.log('ad_keyword_placement tests passed');
