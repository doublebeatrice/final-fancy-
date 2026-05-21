const assert = require('assert');
const { buildSpCreatePayload } = require('../auto_adjust');
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

console.log('ad create naming tests passed');
