const assert = require('assert');
const {
  buildSeasonTitleActionSchema,
  createActionFromSeasonAd,
} = require('../scripts/generators/generate_season_title_action_schema');

const product = {
  sku: 'DAD001',
  asin: 'B0DAD001',
  listing: {
    title: "Dad Gifts Father's Day Keychain",
    categoryPath: 'Gifts > Keychains',
  },
  productProfile: {
    imageUnderstandingAt: '2026-05-31T00:00:00.000Z',
    listingTitle: "Dad Gifts Father's Day Keychain",
  },
  createContext: {
    accountId: 120,
    siteId: 4,
  },
};

const reportItem = {
  sku: 'DAD001',
  asin: 'B0DAD001',
  adDecision: 'auto_execute',
  selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
  adActions: [{
    mode: 'broad',
    matchType: 'BROAD',
    campaignName: "broad - father's day gifts - DAD001",
    groupName: "broad - father's day gifts - DAD001",
    dailyBudget: 3,
    defaultBid: 0.25,
    keywords: ["father's day gifts", 'dad gifts'],
  }],
};

{
  const action = createActionFromSeasonAd(reportItem, reportItem.adActions[0], product);
  assert.strictEqual(action.actionType, 'create');
  assert.strictEqual(action.entityType, 'skuCandidate');
  assert.strictEqual(action.createInput.mode, 'keywordTarget');
  assert.strictEqual(action.createInput.matchType, 'BROAD');
  assert.strictEqual(action.createInput.dailyBudget, 3);
  assert.strictEqual(action.createInput.defaultBid, 0.25);
  assert.strictEqual(action.createInput.accountId, 120);
  assert.ok(action.createInput.keywords.includes('dad gifts'));
}

{
  const schema = buildSeasonTitleActionSchema({
    report: { items: [reportItem] },
    snapshot: { productCards: [product] },
  });
  assert.strictEqual(schema.length, 1);
  assert.strictEqual(schema[0].sku, 'DAD001');
  assert.strictEqual(schema[0].actions.length, 1);
}

{
  const schema = buildSeasonTitleActionSchema({
    report: { items: [reportItem], businessDate: '2026-05-31' },
    snapshot: {
      productCards: [{
        ...product,
        listing: {
          title: 'Generic Keychain Gift',
          categoryPath: 'Accessories',
        },
        productProfile: {
          listingTitle: 'Generic Keychain Gift',
        },
      }],
    },
  });
  assert.strictEqual(schema.length, 1);
  assert.strictEqual(schema[0].reviewRequired, true);
  assert.deepStrictEqual(schema[0].actions, []);
  assert.ok(schema[0].reviewReasons.includes('main_image_not_verified'));
  assert.ok(schema[0].reviewReasons.includes('listing_not_supporting_confusing_season'));
}

{
  const action = createActionFromSeasonAd({
    ...reportItem,
    selectedEvent: { name: 'Summer Product Season', coreTerm: 'summer party supplies' },
    adActions: [{
      mode: 'broad',
      matchType: 'BROAD',
      campaignName: 'broad - summer party supplies - DAD001',
      groupName: 'broad - summer party supplies - DAD001',
      dailyBudget: 3,
      defaultBid: 0.25,
      keywords: ['summer party supplies'],
    }],
  }, {
    mode: 'broad',
    matchType: 'BROAD',
    campaignName: 'broad - summer party supplies - DAD001',
    groupName: 'broad - summer party supplies - DAD001',
    dailyBudget: 3,
    defaultBid: 0.25,
    keywords: ['summer party supplies'],
  }, product);
  assert.strictEqual(/Summer Product Season/i.test(JSON.stringify(action)), false);
}

{
  const schema = buildSeasonTitleActionSchema({
    report: {
      items: [{
        ...reportItem,
        sku: 'TOP001',
        highSales: true,
        adDecision: 'operator_approval_required',
      }],
    },
    snapshot: { productCards: [{ ...product, sku: 'TOP001' }] },
  });
  assert.strictEqual(schema.length, 0);
}

{
  const action = createActionFromSeasonAd({
    ...reportItem,
    adActions: [{
      ...reportItem.adActions[0],
      keywords: ['christian gifts', 'mom unknown', 'christian gifts unknown', 'bible verse cards'],
    }],
  }, {
    ...reportItem.adActions[0],
    keywords: ['christian gifts', 'mom unknown', 'christian gifts unknown', 'bible verse cards'],
  }, product);
  assert.deepStrictEqual(action.createInput.keywords, ['christian gifts', 'bible verse cards']);
}

console.log('season title action schema tests passed');
