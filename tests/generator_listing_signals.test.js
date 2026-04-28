const assert = require('assert');
const {
  listingVisualSignals: adjustListingSignals,
  resolveQ2Signals,
} = require('../scripts/generators/generate_profit_adjust_schema');
const {
  listingVisualSignals: createListingSignals,
  resolveThemes,
  generatePlans: generateCreatePlans,
  buildTerms,
  seasonalTermStatus,
} = require('../scripts/generators/generate_profit_create_schema');
const {
  generatePlans: generateAdjustPlans,
} = require('../scripts/generators/generate_profit_adjust_schema');

const card = {
  sku: 'DN1655',
  asin: 'B0TEST1655',
  note: '',
  solrTerm: '',
  createContext: {
    keywordSeeds: ['gift basket', 'nurse week gifts'],
    coverage: { hasSpKeyword: false, hasSpAuto: false, hasSpManual: false },
    accountId: 120,
    siteId: 4,
  },
  listing: {
    isAvailable: true,
    mainImageUrl: 'https://cdn.example.com/nurse-week-gift-basket-main.jpg',
    imageUrls: [
      'https://cdn.example.com/nurse-week-gift-basket-main.jpg',
      'https://cdn.example.com/nurse-week-gift-basket-side.jpg',
    ],
    title: 'Old generic title',
    bullets: ['Old bullet'],
  },
  productProfile: {
    source: 'rules',
    productType: 'gift basket',
    productTypes: ['gift basket'],
    targetAudience: ['nurse'],
    occasion: ['nurse week'],
    seasonality: ['Q2'],
    visualTheme: ['nurse', 'week', 'gift', 'basket'],
    positioning: 'nurse week gift basket',
    hasImages: true,
    imageCount: 2,
    mainImageUrl: 'https://cdn.example.com/nurse-week-gift-basket-main.jpg',
    confidence: 0.85,
  },
  campaigns: [],
};

{
  const signals = adjustListingSignals(card);
  assert.strictEqual(signals.hasImages, true);
  assert.strictEqual(signals.imageCount, 2);
  assert.ok(signals.urlTokens.includes('nurse'));
  assert.ok(signals.urlTokens.includes('gift'));
}

{
  const q2Signals = resolveQ2Signals(card);
  assert.strictEqual(q2Signals.visual.visualReady, true);
  assert.strictEqual(q2Signals.q2Primary, true);
  assert.strictEqual(q2Signals.rationale, 'historical_or_internal_theme');
}

{
  const signals = createListingSignals(card);
  assert.strictEqual(signals.hasImages, true);
  assert.strictEqual(signals.imageCount, 2);
}

{
  const themes = resolveThemes(card);
  assert.ok(themes.primaryThemes.includes('nurse_week'));
}

console.log('generator listing signal tests passed');

{
  const noImageCard = {
    ...card,
    createContext: {
      ...card.createContext,
      keywordSeeds: [],
    },
    listing: {
      isAvailable: true,
      title: 'Nurse week gift basket',
      bullets: ['nurse appreciation gift'],
      imageUrls: [],
      mainImageUrl: '',
    },
    productProfile: null,
    profitRate: 0.2,
    invDays: 60,
    unitsSold_30d: 20,
    adStats: { '30d': { clicks: 12, impressions: 1000, spend: 5 } },
  };
  const createPlans = generateCreatePlans({ productCards: [noImageCard] }, { limit: 10, skipCreatedSkus: new Set(), imageReviewBudget: 1 });
  assert.strictEqual(createPlans.length, 1);
  assert.strictEqual(createPlans[0].actions[0].actionType, 'review');
  assert.strictEqual(createPlans[0].actions[0].riskLevel, 'image_review_required');
}

{
  const noImageAdjustCard = {
    ...card,
    note: '',
    solrTerm: '',
    profitRate: 0.2,
    invDays: 60,
    unitsSold_30d: 30,
    yoySalesPct: -0.25,
    yoyUnitsPct: -0.3,
    adStats: { '30d': { spend: 20 } },
    campaigns: [
      {
        name: 'generic gifts sp',
        keywords: [{ id: 'kw1', text: 'gift basket', bid: 0.5, state: 'paused', stats7d: {}, stats30d: {} }],
        autoTargets: [],
        productAds: [],
        sponsoredBrands: [],
      },
    ],
    listing: {
      isAvailable: true,
      title: 'nurse gifts',
      imageUrls: [],
      mainImageUrl: '',
    },
    productProfile: null,
  };
  const adjustPlans = generateAdjustPlans({ productCards: [noImageAdjustCard] }, { limit: 10, imageReviewBudget: 1 });
  assert.strictEqual(adjustPlans.length, 1);
  assert.strictEqual(adjustPlans[0].actions[0].actionType, 'review');
  assert.strictEqual(adjustPlans[0].actions[0].riskLevel, 'image_review_required');
}

{
  const mismatchCard = {
    ...card,
    sku: 'DN9999',
    asin: 'B0TEST9999',
    profitRate: 0.25,
    invDays: 80,
    unitsSold_30d: 60,
    adStats: { '30d': { spend: 20 } },
    productProfile: {
      productType: 'gift basket',
      productTypes: ['gift basket'],
      targetAudience: ['nurse'],
      occasion: ['nurse week'],
      seasonality: ['Q2'],
      visualTheme: ['nurse', 'medical'],
      positioning: 'nurse week gift basket',
      hasImages: true,
      imageCount: 2,
      confidence: 0.9,
    },
    campaigns: [
      {
        name: 'teacher appreciation exact',
        keywords: [{
          id: 'kw-mismatch',
          text: 'teacher appreciation gifts',
          bid: 0.5,
          state: 'enabled',
          stats7d: { spend: 5, orders: 1, acos: 0.1, clicks: 10 },
          stats30d: { spend: 10, orders: 2, acos: 0.1, clicks: 30, impressions: 3000 },
        }],
        autoTargets: [],
        productAds: [],
        sponsoredBrands: [],
      },
    ],
  };
  const adjustPlans = generateAdjustPlans({ productCards: [mismatchCard] }, { limit: 10, imageReviewBudget: 0 });
  const actions = adjustPlans.flatMap(plan => plan.actions || []);
  assert.strictEqual(actions.some(action => action.actionType === 'bid' && action.suggestedBid > action.currentBid), false);
}

{
  const noImageCard = {
    ...card,
    createContext: {
      ...card.createContext,
      keywordSeeds: [],
    },
    listing: {
      isAvailable: true,
      title: 'nurse week gift basket',
      bullets: ['nurse appreciation gift'],
      imageUrls: [],
      mainImageUrl: '',
    },
    productProfile: null,
    profitRate: 0.2,
    invDays: 60,
    unitsSold_30d: 20,
    adStats: { '30d': { clicks: 12, impressions: 1000, spend: 5 } },
  };
  const createPlans = generateCreatePlans(
    { productCards: [noImageCard, { ...noImageCard, sku: 'DN1656', asin: 'B0TEST1656' }] },
    { limit: 10, skipCreatedSkus: new Set(), imageReviewBudget: 0 }
  );
  assert.strictEqual(createPlans.length, 0);
}

{
  const lowProfitStagnantCard = {
    ...card,
    sku: 'STUCK001',
    asin: 'B0STUCK001',
    profitRate: -0.08,
    invDays: 160,
    unitsSold_30d: 6,
    price: 52.99,
    adStats: { '30d': { clicks: 4, impressions: 200, spend: 2 } },
    createContext: {
      ...card.createContext,
      keywordSeeds: ['nurse appreciation gifts', 'nurse week gifts', 'thank you nurse gifts'],
      coverage: { hasSpKeyword: false, hasSpAuto: false, hasSpManual: false },
    },
    campaigns: [
      {
        name: 'kw nurse week stuck001',
        keywords: [{
          id: 'kw-stuck',
          text: 'nurse week gifts',
          bid: 0.2,
          state: 'paused',
          stats7d: { spend: 0, orders: 0, acos: 0, clicks: 0 },
          stats30d: { spend: 2, orders: 1, acos: 0.2, clicks: 4, impressions: 200 },
        }],
        autoTargets: [],
        productAds: [],
        sponsoredBrands: [],
      },
    ],
  };

  const adjustPlans = generateAdjustPlans({ productCards: [lowProfitStagnantCard] }, { limit: 10, imageReviewBudget: 0 });
  assert.ok(adjustPlans.flatMap(plan => plan.actions).some(action => action.riskLevel === 'stagnant_opportunity'));

  const createPlans = generateCreatePlans(
    { productCards: [lowProfitStagnantCard] },
    { limit: 10, skipCreatedSkus: new Set(), imageReviewBudget: 0 }
  );
  const creates = createPlans.flatMap(plan => plan.actions);
  assert.ok(creates.length > 0);
  assert.ok(creates.every(action => action.riskLevel === 'stagnant_opportunity_create'));
  assert.ok(creates.every(action => action.createInput.dailyBudget === 1));
  assert.ok(creates.some(action => action.createInput.defaultBid >= 0.55));
}

{
  const joy0900LikeCard = {
    ...card,
    sku: 'JOY0900',
    asin: 'B0D65MK4X9',
    createContext: {
      ...card.createContext,
      keywordSeeds: [
        'teacher appreciation gifts',
        'teacher keychains',
        'teacher christmas gifts',
        'valentines day gifts for teachers',
        'compass teacher keychain',
      ],
    },
    productProfile: {
      productType: 'gift basket',
      productTypes: ['gift basket', 'jewelry'],
      targetAudience: ['teacher'],
      occasion: ['teacher appreciation', 'thank you'],
      seasonality: ['Q2'],
      visualTheme: ['teacher', 'keychain', 'compass'],
      positioning: 'teacher appreciation keychain gift basket',
      hasImages: true,
      imageCount: 8,
      confidence: 0.9,
    },
  };
  const terms = buildTerms(joy0900LikeCard, resolveThemes(joy0900LikeCard), { currentDate: '2026-04-24' });
  assert.ok(terms.includes('teacher appreciation gifts'));
  assert.ok(terms.includes('compass teacher keychain'));
  assert.strictEqual(terms.includes('teacher christmas gifts'), false);
  assert.strictEqual(terms.includes('valentines day gifts for teachers'), false);
  assert.strictEqual(terms.some(term => /nurse.*teacher|teacher.*nurse/.test(term)), false);
  assert.strictEqual(seasonalTermStatus('teacher christmas gifts', new Date('2026-04-24')).allowed, false);
  assert.strictEqual(seasonalTermStatus('valentines day gifts for teachers', new Date('2026-04-24')).allowed, false);
}
