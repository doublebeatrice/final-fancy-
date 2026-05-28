const assert = require('assert');
const { buildSpCreatePayload, buildSbvCreatePayload } = require('../auto_adjust');
const { createActionFromSeasonAd } = require('../scripts/generators/generate_season_title_action_schema');

function baseInput(overrides = {}) {
  return {
    advType: 'SP',
    mode: 'keywordTarget',
    sku: 'MH1806',
    asin: 'B09SW2NT6J',
    accountId: 187,
    siteId: 4,
    dailyBudget: 2,
    defaultBid: 0.3,
    coreTerm: 'dessert cups',
    matchType: 'PHRASE',
    keywords: ['dessert cups'],
    ...overrides,
  };
}

{
  const built = buildSpCreatePayload(baseInput({
    campaignName: 'ai_kw phrase_dessert cups_mh1806',
    groupName: 'ai_kw phrase_dessert cups_mh1806',
  }));
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.campaignName, 'ai_kw phrase_dessert cups_mh1806');
  assert.strictEqual(built.requestBody.groupName, 'ai_kw phrase_dessert cups_mh1806');
}

{
  const built = buildSpCreatePayload(baseInput({
    campaignName: 'ai_kw_phrase_dessert_cups_mh1806',
  }));
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.campaignName, 'ai_kw phrase_dessert cups_mh1806');
}

{
  const built = buildSpCreatePayload(baseInput({
    mode: 'auto',
    matchType: '',
    keywords: [],
    campaignName: '',
    groupName: '',
  }));
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.campaignName, 'ai_auto_dessert cups_mh1806');
}

{
  const built = buildSpCreatePayload(baseInput({
    mode: 'productTarget',
    matchType: '',
    keywords: [],
    targetType: 'ASIN_EXPANDED_FROM',
    targetAsins: ['B0TESTASIN'],
    campaignName: '',
    groupName: '',
  }));
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestBody.campaignName, 'ai_asin expanded_dessert cups_mh1806');
}

{
  const product = { sku: 'DAD001', asin: 'B0DAD001', createContext: { accountId: 120, siteId: 4 } };
  const action = createActionFromSeasonAd({
    sku: 'DAD001',
    asin: 'B0DAD001',
    selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
  }, {
    mode: 'broad',
    matchType: 'BROAD',
    dailyBudget: 3,
    defaultBid: 0.25,
    keywords: ["father's day gifts"],
  }, product);
  assert.strictEqual(action.campaignName, 'ai_kw broad_fathers day gifts_dad001');
  assert.strictEqual(action.groupName, 'ai_kw broad_fathers day gifts_dad001');
}

{
  const built = buildSbvCreatePayload({
    advType: 'SB',
    mode: 'keywordTarget',
    targetType: 'keyword',
    sku: 'UTE4258',
    asin: 'B0GRG9ZXZJ',
    accountId: 468,
    siteId: 4,
    brandName: 'Wesiti',
    brand: 'ENTITY3EK98Y2AIA3TP',
    campaignName: 'sbvkw_baby shower game_ute4258',
    groupName: 'sbvkw_baby shower game_ute4258',
    startDate: '2026-05-26',
    coreTerm: 'baby shower game',
    dailyBudget: 3,
    defaultBid: 0.35,
    adFormat: 'video',
    videoAssetIds: ['amzn1.assetlibrary.asset1.a65386b5a2a828fee9c4427e37b3cc79'],
    keywords: [
      'ready to pop baby shower',
      { keywordText: "she's ready to pop baby shower", matchType: 'BROAD', bid: 0.35 },
    ],
  });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestUrl, '/campaignSb/createCampaignBeta');
  assert.strictEqual(built.requestBody.advType, 'SB');
  assert.strictEqual(built.requestBody.adFormat, 'video');
  assert.strictEqual(built.requestBody.campaignName, 'sbvkw_baby shower game_ute4258');
  assert.strictEqual(built.requestBody.fieldArray.campaigns[0].brandEntityId, 'ENTITY3EK98Y2AIA3TP');
  assert.deepStrictEqual(built.requestBody.fieldArray.ads[0].creative.asins, ['B0GRG9ZXZJ']);
  assert.deepStrictEqual(built.requestBody.fieldArray.ads[0].creative.videoAssetIds, ['amzn1.assetlibrary.asset1.a65386b5a2a828fee9c4427e37b3cc79']);
  assert.deepStrictEqual(built.requestBody.fieldArray.keyword.map(row => row.keywordText), [
    'ready to pop baby shower',
    "she's ready to pop baby shower",
  ]);
}

{
  const built = buildSbvCreatePayload({
    advType: 'SB',
    mode: 'keywordTarget',
    targetType: 'keyword',
    sku: 'UTE4258',
    asin: 'B0GRG9ZXZJ',
    accountId: 468,
    siteId: 4,
    brandName: 'Wesiti',
    brand: 'ENTITY3EK98Y2AIA3TP',
    coreTerm: 'baby shower game',
    dailyBudget: 3,
    defaultBid: 0.35,
    adFormat: 'video',
    keywords: ['ready to pop baby shower'],
  });
  assert.strictEqual(built.ok, false);
  assert.ok(built.errors.includes('videoAssetIds is required'));
}

console.log('ad create naming tests passed');
