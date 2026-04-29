const assert = require('assert');
const { buildProductContexts, validateAndNormalizePlan, loadExternalActionSchema } = require('../src/ai_decision');
const fs = require('fs');
const path = require('path');

const cards = [
  {
    sku: 'SKU-1',
    asin: 'ASIN-1',
    opendate: '2026-03-20',
    invDays: 20,
    unitsSold_30d: 20,
    unitsSold_7d: 5,
    adStats: { '30d': { orders: 3, spend: 12 } },
    listingSessions: { lastWeek: 44, twoWeeksAgo: 51, threeWeeksAgo: 41 },
    listingConversionRates: { lastWeek: 20.45, twoWeeksAgo: 25.49, threeWeeksAgo: 21.95 },
    sbStats: { '30d': { orders: 1, spend: 4 } },
    listing: {
      title: 'Nurse Week Gift Basket for Women',
      brand: 'YSWG',
      bullets: [
        'Nurse appreciation gift for RN women.',
        'Mother day hospital shift ready.',
      ],
      description: 'Gift basket with tumbler, socks and card.',
      aPlusText: 'Perfect for nurse week | themed accessories',
      breadcrumbs: ['Home & Kitchen', 'Gift Baskets'],
      variationText: 'Color: Pink',
      mainImageUrl: 'https://images.example.com/main.jpg',
      imageUrls: [
        'https://images.example.com/main.jpg',
        'https://images.example.com/alt1.jpg',
      ],
      isAvailable: true,
      price: 19.99,
      reviewCount: 1234,
      reviewRating: 4.7,
      hasPrime: true,
      bsr: [{ rank: 12, category: 'Gift Baskets' }],
      fetchedAt: '2026-04-23T10:00:00.000Z',
    },
    productProfile: {
      version: 1,
      source: 'rules',
      signature: 'abc123',
      productType: 'gift basket',
      productTypes: ['gift basket'],
      targetAudience: ['nurse', 'women'],
      occasion: ['nurse week', 'appreciation'],
      seasonality: ['Q2'],
      visualTheme: ['nurse', 'pink', 'thank you'],
      positioning: 'nurse week gift basket',
      hasImages: true,
      imageCount: 2,
      mainImageUrl: 'https://images.example.com/main.jpg',
      confidence: 0.85,
      needsImageUnderstanding: false,
    },
    campaigns: [
      {
        campaignId: 'c1',
        accountId: 1,
        siteId: 4,
        budget: 5,
        placementTop: 'placementTop:0',
        placementProductPage: 'placementProductPage:20',
        placementRestOfSearch: 'placementRestOfSearch:0',
        keywords: [
          {
            id: 'kw-1',
            text: 'test keyword',
            matchType: 'EXACT',
            bid: 0.5,
            stats7d: { spend: 5, orders: 1, clicks: 10 },
            stats30d: { spend: 12, orders: 3, clicks: 30 },
          },
        ],
        autoTargets: [
          {
            id: 'at-1',
            targetType: 'auto',
            bid: 0.4,
            stats7d: { spend: 3, orders: 0, clicks: 8 },
            stats30d: { spend: 7, orders: 1, clicks: 24 },
          },
        ],
        productAds: [
          {
            id: 'ad-1',
            state: 'paused',
            stats7d: { spend: 1, orders: 0, clicks: 2 },
            stats30d: { spend: 4, orders: 1, clicks: 12 },
          },
        ],
        sbCampaign: {
          id: 'sbc1',
          state: 'paused',
          budget: 5,
          stats7d: { spend: 2, orders: 0, clicks: 3 },
          stats30d: { spend: 6, orders: 1, clicks: 9 },
        },
        sponsoredBrands: [
          {
            id: 'sbk-1',
            entityType: 'sbKeyword',
            text: 'sb keyword',
            matchType: 'BROAD',
            bid: 0.6,
            stats7d: { spend: 2, orders: 1, clicks: 5 },
            stats30d: { spend: 5, orders: 2, clicks: 16 },
          },
        ],
      },
    ],
  },
];

const rowsByType = {
  keyword: [{ sku: 'SKU-1', keywordId: 'kw-1', campaignId: 'c1', adGroupId: 'g1', accountId: 1, siteId: 4 }],
  autoTarget: [{ sku: 'SKU-1', targetId: 'at-1', campaignId: 'c1', adGroupId: 'g1', accountId: 1, siteId: 4 }],
  manualTarget: [],
  productAd: [{ sku: 'SKU-1', adId: 'ad-1', campaignId: 'c1', adGroupId: 'g1', accountId: 1, siteId: 4 }],
  sbCampaign: [{ sku: 'SKU-1', campaignId: 'sbc1', accountId: 1, siteId: 4 }],
  sbKeyword: [{ sku: 'SKU-1', keywordId: 'sbk-1', campaignId: 'sbc1', adGroupId: 'sbg1', matchType: 'BROAD', accountId: 1, siteId: 4 }],
  sbTarget: [],
};

{
  const { products } = buildProductContexts(
    cards,
    rowsByType,
    [{ sku: 'SKU-1', campaignId: 'c1', adGroupId: 'g1', Spend: '10', Orders: '1' }],
    [{ sku: 'SKU-1', campaignId: 'sbc1', Spend: '8', Orders: '1' }],
    []
  );
  assert.strictEqual(products.length, 1);
  const product = products[0];
  const keyword = product.adjustableAds.find(item => item.id === 'kw-1');
  const autoTarget = product.adjustableAds.find(item => item.id === 'at-1');
  const sbKeyword = product.adjustableAds.find(item => item.id === 'sbk-1');
  assert.ok(keyword.sourceSignals.includes('sp_7day_untouched'));
  assert.ok(autoTarget.sourceSignals.includes('sp_7day_untouched'));
  assert.ok(sbKeyword.sourceSignals.includes('sb_7day_untouched'));
  assert.strictEqual(product.listing.title, 'Nurse Week Gift Basket for Women');
  assert.deepStrictEqual(product.listing.bulletHighlights, [
    'Nurse appreciation gift for RN women.',
    'Mother day hospital shift ready.',
  ]);
  assert.strictEqual(product.listing.categoryPath, 'Home & Kitchen > Gift Baskets');
  assert.strictEqual(product.listing.mainImageUrl, 'https://images.example.com/main.jpg');
  assert.strictEqual(product.listing.imageCount, 2);
  assert.strictEqual(product.listing.hasAPlus, true);
  assert.strictEqual(product.productProfile.productType, 'gift basket');
  assert.strictEqual(product.listingSessions.lastWeek, 44);
  assert.strictEqual(product.listingConversionRates.lastWeek, 20.45);
  assert.strictEqual(product.lifecycleSeason.lifecycleStage, 'new_0_5m');
  assert.ok(product.lifecycleSeason.aiDecisionFrame.startsWith('new_'));
  const campaign = product.adjustableAds.find(item => item.entityType === 'campaign' && item.id === 'c1');
  assert.strictEqual(campaign.currentBudget, 5);
  assert.strictEqual(campaign.placementProductPage, 20);
  assert.deepStrictEqual(product.productProfile.targetAudience, ['nurse', 'women']);
  assert.strictEqual(product.productProfile.positioning, 'nurse week gift basket');
  assert.strictEqual(keyword.productMatch.level, 'conflict');
  assert.strictEqual(typeof keyword.productMatch.score, 'number');
}

{
  const context = buildProductContexts(cards, rowsByType, [], [], []).products
    ? { products: buildProductContexts(cards, rowsByType, [], [], []).products }
    : null;
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'test',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'low risk raise',
          evidence: ['7d orders=1'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan.length, 1);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.errors.length, 0);
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'campaign budget and placement',
      actions: [
        {
          entityType: 'campaign',
          id: 'c1',
          actionType: 'budget',
          currentBudget: 5,
          suggestedBudget: 7,
          reason: 'budget capped but profitable',
          evidence: ['dailyBudget=5', 'orders=3'],
          confidence: 0.82,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
        {
          entityType: 'campaign',
          id: 'c1',
          actionType: 'placement',
          placementKey: 'placementProductPage',
          currentPlacementPercent: 20,
          suggestedPlacementPercent: 30,
          reason: 'product page placement converts better',
          evidence: ['productPage ACOS better than rest'],
          confidence: 0.82,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 2);
  assert.strictEqual(validated.plan[0].actions[0].actionType, 'budget');
  assert.strictEqual(validated.plan[0].actions[1].actionType, 'placement');
  assert.strictEqual(validated.plan[0].actions[0].learning.baselineQuality, 'complete');
  assert.deepStrictEqual(validated.plan[0].actions[0].learning.measurementWindowDays, [1, 3, 7, 14, 30]);
  assert.strictEqual(validated.plan[0].actions[0].learning.expectedEffect.spend, 'up');
  assert.strictEqual(validated.plan[0].actions[0].learning.baseline.lifecycleSeason.lifecycleStage, 'new_0_5m');
  assert.ok(validated.plan[0].actions[0].learning.baseline.lifecycleSeasonEvidence.some(item => item.startsWith('seasonPhase=')));
}

{
  const weakScaleCards = [{
    ...cards[0],
    unitsSold_7d: 1,
    unitsSold_30d: 10,
    profitRate: 0.2,
    adStats: {
      '7d': { spend: 25, orders: 0, clicks: 80, sales: 0 },
      '30d': { spend: 60, orders: 1, clicks: 180, sales: 20 },
    },
    sbStats: {},
    campaigns: [{
      campaignId: 'c1',
      accountId: 1,
      siteId: 4,
      budget: 5,
      keywords: [{
        id: 'kw-1',
        text: 'test keyword',
        bid: 0.5,
        stats7d: { spend: 8, orders: 0, clicks: 30 },
        stats30d: { spend: 20, orders: 1, clicks: 70 },
      }],
      autoTargets: [],
      productAds: [],
      sponsoredBrands: [],
    }],
  }];
  const context = { products: buildProductContexts(weakScaleCards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'budget push without conversion',
      actions: [
        {
          entityType: 'campaign',
          id: 'c1',
          actionType: 'budget',
          currentBudget: 5,
          suggestedBudget: 6,
          reason: 'try more budget',
          evidence: ['budget capped'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.review[0].action.riskLevel, 'marginal_profit_review');
  assert.ok(validated.review[0].action.reason.includes('risk_gate:marginal_profit'));
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'invalid placement',
      actions: [
        {
          entityType: 'campaign',
          id: 'c1',
          actionType: 'placement',
          placementKey: 'badPlacement',
          suggestedPlacementPercent: 30,
          reason: 'bad key',
          evidence: ['bad key'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.review.length, 1);
  assert.ok(validated.review[0].action.reason.includes('invalid_placement'));
}

{
  const context = { products: buildProductContexts([
    {
      ...cards[0],
      unitsSold_30d: 120,
      adStats: { '30d': { orders: 20, spend: 40 } },
    },
  ], rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'test',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'pause',
          reason: 'high volume but intentionally aggressive',
          evidence: ['high volume'],
          confidence: 0.9,
          riskLevel: 'high',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions[0].actionType, 'pause');
}

{
  const context = { products: buildProductContexts([
    {
      ...cards[0],
      createContext: {
        accountId: 1,
        siteId: 4,
        recommendedDailyBudget: 3,
        recommendedDefaultBid: 0.25,
      },
    },
  ], rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'create test',
      actions: [
        {
          actionType: 'create',
          mode: 'keywordTarget',
          coreTerm: 'nurse gifts',
          keywords: ['nurse gifts', 'nurse week gifts'],
          dailyBudget: 3,
          defaultBid: 0.25,
          reason: 'seasonal launch',
          evidence: ['inventory ready'],
          confidence: 0.85,
          riskLevel: 'low_budget_create',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions[0].actionType, 'create');
  assert.strictEqual(validated.plan[0].actions[0].createInput.accountId, 1);
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'generator candidate must not execute',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'candidate generated by helper',
          evidence: ['helper output'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['generator_candidate'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.plan[0].actions.length, 0);
  assert.ok(validated.review[0].action.reason.includes('non_codex_source'));
}

{
  const manyCards = Array.from({ length: 200 }, (_, index) => ({
    ...cards[0],
    sku: `SKU-${index + 1}`,
    asin: `ASIN-${index + 1}`,
    campaigns: [],
  }));
  const context = { products: buildProductContexts(manyCards, rowsByType, [], [], []).products };
  const rawPlan = manyCards.map(card => ({
    sku: card.sku,
    summary: 'many generator candidates',
    actions: [
      {
        entityType: 'skuCandidate',
        id: `review::${card.sku}`,
        actionType: 'review',
        reason: 'candidate needs review',
        evidence: ['candidate'],
        confidence: 0.7,
        riskLevel: 'manual_review',
        actionSource: ['generator_candidate'],
      },
    ],
  }));
  const validated = validateAndNormalizePlan(rawPlan, context);
  assert.strictEqual(validated.review.length, 200);
  assert.strictEqual(validated.skipped.length, 0);
  assert.strictEqual(validated.review[0].action.riskLevel, 'manual_review');
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'entity state test',
      actions: [
        {
          entityType: 'productAd',
          id: 'ad-1',
          actionType: 'enable',
          reason: 'restore SP product ad',
          evidence: ['paused product ad'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
        {
          entityType: 'sbCampaign',
          id: 'sbc1',
          actionType: 'enable',
          reason: 'restore SB campaign',
          evidence: ['paused campaign'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 2);
  assert.deepStrictEqual(validated.plan[0].actions.map(action => action.entityType), ['productAd', 'sbCampaign']);
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'explicit traffic push override',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.75,
          allowLargeBidChange: true,
          reason: 'operator approved CPC push',
          evidence: ['avg cpc target'],
          confidence: 0.86,
          riskLevel: 'traffic_push',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.plan[0].actions[0].allowLargeBidChange, true);
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'manual image review',
      actions: [
        {
          entityType: 'skuCandidate',
          id: 'review::SKU-1::listing_image_gate',
          actionType: 'review',
          reason: 'image signal missing',
          evidence: ['listingHasImages=false'],
          confidence: 0.7,
          riskLevel: 'image_review_required',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.plan[0].actions.length, 0);
  assert.strictEqual(validated.review[0].action.riskLevel, 'image_review_required');
}

{
  const tmpFile = path.join(__dirname, '__tmp_action_schema.json');
  fs.writeFileSync(tmpFile, JSON.stringify([
    {
      sku: 'SKU-1',
      summary: 'external schema',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'codex decision',
          evidence: ['external action schema'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], null, 2));

  const loaded = loadExternalActionSchema({
    cards,
    rowsByType,
    sp7DayRows: [],
    sb7DayRows: [],
    history: [],
    sevenDayMeta: {},
    actionSchemaFile: tmpFile,
  });

  assert.strictEqual(loaded.decisionSource, 'external_action_schema');
  assert.strictEqual(loaded.plan.length >= 1, true);
  fs.unlinkSync(tmpFile);
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'verify spec for bid and state',
      actions: [
        {
          entityType: 'keyword',
          id: 'kw-1',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.55,
          reason: 'raise with verify',
          evidence: ['orders>0'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
        {
          entityType: 'productAd',
          id: 'ad-1',
          actionType: 'enable',
          reason: 'resume product ad',
          evidence: ['paused row exists'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions[0].verifySource, 'kwRows');
  assert.strictEqual(validated.plan[0].actions[0].verifyField, 'bid');
  assert.strictEqual(validated.plan[0].actions[0].expected.value, 0.55);
  assert.strictEqual(validated.plan[0].actions[1].verifySource, 'productAdRows');
  assert.strictEqual(validated.plan[0].actions[1].verifyField, 'state');
  assert.strictEqual(validated.plan[0].actions[1].expected.value, 'enabled');
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'campaign state verify mapping',
      actions: [
        {
          entityType: 'campaign',
          id: 'c1',
          actionType: 'enable',
          reason: 'resume campaign',
          evidence: ['test'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions[0].verifySource, 'campaignRows');
  assert.strictEqual(validated.plan[0].actions[0].verifyField, 'state');
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'candidate must be converted before execution',
      actions: [
        {
          entityType: 'skuCandidate',
          id: 'candidate-1',
          actionType: 'bid',
          reason: 'invalid candidate action',
          evidence: ['test'],
          confidence: 0.8,
          riskLevel: 'low',
          actionSource: ['strategy'],
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 1);
  assert.ok(validated.errors[0].reason.includes('candidate action is not directly executable'));
  assert.strictEqual(validated.review.length, 0);
}

console.log('ai_decision tests passed');
