const assert = require('assert');

const {
  auditAdStructureOpportunities,
  hasSbCoverage,
  hasSbvCoverage,
} = require('../src/ad_structure_opportunity');

const snapshot = {
  productCards: [
    {
      sku: 'SET1001',
      asin: 'B0SET10001',
      salesChannel: 'Amazon.com',
      variationGroup: 'PARENT1',
      variantCount: 3,
      listing: { hasVideo: false },
      createContext: { coverage: { hasSbKeyword: false, hasSbTarget: false } },
      campaigns: [],
    },
    {
      sku: 'VID2002',
      asin: 'B0VID20002',
      salesChannel: 'Amazon.com',
      variantCount: 1,
      listing: { hasVideo: true },
      createContext: { coverage: { hasSbKeyword: false, hasSbTarget: false } },
      campaigns: [],
    },
    {
      sku: 'GOOD3003',
      asin: 'B0GOOD3003',
      salesChannel: 'Amazon.com',
      variantCount: 3,
      listing: { hasVideo: true },
      campaigns: [
        {
          name: 'good3003 sb brand',
          sponsoredBrands: [{ entityType: 'sbKeyword', campaignName: 'good3003 sb brand', state: 1 }],
          sbCampaign: { state: 'ENABLED' },
        },
        {
          name: 'good3003 sbv-video',
          sponsoredBrands: [{ entityType: 'sbKeyword', campaignName: 'good3003 sbv-video', state: 1 }],
          sbCampaign: { state: 'ENABLED' },
        },
      ],
    },
    {
      sku: 'CHK4004',
      asin: 'B0CHK40004',
      salesChannel: 'Amazon.com',
      variantCount: 1,
      listing: null,
      createContext: { coverage: { hasSbKeyword: false } },
      campaigns: [],
    },
  ],
};

assert.strictEqual(hasSbCoverage(snapshot.productCards[0]), false);
assert.strictEqual(hasSbvCoverage(snapshot.productCards[2]), true);

const report = auditAdStructureOpportunities(snapshot);

assert.strictEqual(report.summary.productsChecked, 4);
assert.strictEqual(report.summary.sbRecommended, 1);
assert.strictEqual(report.summary.sbvRecommended, 1);
assert.strictEqual(report.summary.videoCheckQueued, 1);
assert.ok(report.items.some(item => item.sku === 'SET1001' && item.issue === 'sb_missing_three_plus_variants'));
assert.ok(report.items.some(item => item.sku === 'VID2002' && item.issue === 'sbv_missing_front_video'));
assert.ok(report.items.some(item => item.sku === 'CHK4004' && item.issue === 'front_video_check_needed'));
assert.ok(!report.items.some(item => item.sku === 'GOOD3003'));

console.log('ad_structure_opportunity tests passed');
