const assert = require('assert');

const {
  buildSbManualCollectionKeywordPayload,
  validatePlan,
} = require('../src/sb_manual_collection_create');

const plan = {
  accountId: 856,
  siteId: 4,
  sellerNum: 'HJ17',
  brandEntityId: 'ENTITYFNVTPPITL5C3',
  brandName: 'Acellegic',
  campaignName: 'sb kw_christian gift tin boxes prayer cards_tur9541 tur8821 tur5292',
  groupName: 'sb kw_christian gift tin boxes prayer cards_tur9541 tur8821 tur5292',
  startDate: '2026-06-08',
  budget: 3,
  defaultBid: 0.4,
  matchType: 'BROAD',
  brandLogoAssetID: 'amzn1.assetlibrary.asset1.deadbeef:version_v1',
  headline: 'Christian Gifts and Prayer Cards',
  adName: 'sb christian gifts top',
  products: [
    { sku: 'TUR9541', asin: 'B0GYRW7MG5' },
    { sku: 'TUR8821', asin: 'B0GVT9WTG2' },
    { sku: 'TUR5292', asin: 'B0GFV4TN5L' },
  ],
  keywords: ['christian gifts', 'prayer cards'],
};

{
  const built = buildSbManualCollectionKeywordPayload(plan);
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestUrl, '/campaignSb/createCampaignBeta');
  assert.strictEqual(built.requestBody.adFormat, 'manualCollection');
  assert.strictEqual(built.requestBody.targetType, 'keyword');
  assert.deepStrictEqual(built.requestBody.asinArray, ['B0GYRW7MG5', 'B0GVT9WTG2', 'B0GFV4TN5L']);
  assert.deepStrictEqual(built.requestBody.skuArray, ['TUR9541', 'TUR8821', 'TUR5292']);
  assert.deepStrictEqual(built.requestBody.fieldArray.ads[0].creative.landingPage, { pageType: 'PRODUCT_LIST', url: '' });
  assert.strictEqual(built.requestBody.fieldArray.ads[0].creative.brandLogoAssetID, 'amzn1.assetlibrary.asset1.deadbeef:version_v1');
  assert.deepStrictEqual(built.requestBody.fieldArray.ads[0].creative.brandLogoCrop, { top: 0, left: 0, width: 400, height: 400 });
  assert.strictEqual(built.requestBody.fieldArray.ads[0].creative.title, 'Christian Gifts and Prayer Cards');
  assert.deepStrictEqual(built.requestBody.fieldArray.keyword.map(item => item.keywordText), ['christian gifts', 'prayer cards']);
  assert.strictEqual(built.requestBody.fieldArray.keyword[0].matchType, 'BROAD');
  assert.strictEqual(built.requestBody.fieldArray.keyword[0].bid, 0.4);
}

{
  const validation = validatePlan({ ...plan, products: plan.products.slice(0, 2) });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('at least 3 products with asin are required'));
}

{
  // brand logo is mandatory: without it the SB lands INCOMPLETE
  const { brandLogoAssetID, ...noLogo } = plan;
  const validation = validatePlan(noLogo);
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some(e => e.includes('brandLogoAssetID is required')));
}

{
  // titleType AUTO omits the title field (Amazon auto-generates the headline)
  const { headline, ...autoTitle } = plan;
  const built = buildSbManualCollectionKeywordPayload({ ...autoTitle, titleType: 'AUTO' });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.fieldArray.ads[0].creative.title, undefined);
}

{
  // custom headline with illegal characters is rejected
  const validation = validatePlan({ ...plan, headline: 'Best mats @ 50% off!!' });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some(e => e.includes('headline may only contain')));
}

{
  // custom headline longer than 32 chars is rejected (Amazon AD_CREATIVE limit)
  const validation = validatePlan({ ...plan, headline: 'Pet Training Mats for Your Dogs and Cats' });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.some(e => e.includes('custom headline must be <= 32 chars')));
}

console.log('sb_manual_collection_create tests passed');
