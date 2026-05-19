const assert = require('assert');
const { analyzeInternalKeywordMarket } = require('../src/internal_keyword_market');

const guf3129 = {
  sku: 'GUF3129',
  asin: 'B0GUF3129',
  title: 'Patriotic Bucket Hat American Flag Summer Hat',
  price: 16.99,
  targetAcos: 0.22,
  estimatedConversionRate: 0.07,
  marketProbeTerms: [
    'patriotic bucket hat',
    'american flag bucket hat',
    '4th of july bucket hat',
  ],
};

const detectorProbe = {
  query: 'Patriotic Bucket Hat',
  total: {
    Spend: 146.2,
    Orders: 18,
    Sales: 382,
    Clicks: 210,
    CPC: 0.7,
    ACOS: 0.383,
  },
  keywordRows: [
    {
      keywordText: 'patriotic bucket hat',
      sku: 'HAT1001',
      asin: 'B0HAT1001',
      productTitle: 'American Flag Patriotic Bucket Hat',
      Spend: 34.5,
      Orders: 5,
      Sales: 172,
      Clicks: 82,
      CPC: 0.42,
      ACOS: 0.201,
    },
    {
      keywordText: 'american flag bucket hat',
      sku: 'HAT1002',
      asin: 'B0HAT1002',
      productTitle: 'USA American Flag Bucket Hat for Women Men',
      Spend: 19.2,
      Orders: 3,
      Sales: 94,
      Clicks: 54,
      CPC: 0.36,
      ACOS: 0.204,
    },
    {
      keywordText: '4th of july decorations',
      sku: 'DECOR1001',
      asin: 'B0DECOR01',
      productTitle: 'Patriotic Party Banner Decorations',
      Spend: 60,
      Orders: 8,
      Sales: 184,
      Clicks: 120,
      CPC: 0.5,
      ACOS: 0.326,
    },
    {
      keywordText: 'patriotic hat',
      sku: 'CAP2001',
      asin: 'B0CAP2001',
      productTitle: 'Patriotic Baseball Cap',
      Spend: 28,
      Orders: 1,
      Sales: 18,
      Clicks: 30,
      CPC: 0.93,
      ACOS: 1.556,
    },
    {
      keywordText: 'patriotic party favors',
      sku: 'FAVOR3001',
      asin: 'B0FAVOR01',
      productTitle: '4th of July Party Favors',
      Spend: 12,
      Orders: 0,
      Sales: 0,
      Clicks: 26,
      CPC: 0.46,
    },
  ],
  asinRows: [
    {
      asin: 'B0HAT1001',
      sku: 'HAT1001',
      title: 'American Flag Patriotic Bucket Hat',
      Orders: 5,
      Spend: 34.5,
      Sales: 172,
    },
    {
      asin: 'B0DECOR01',
      sku: 'DECOR1001',
      title: 'Patriotic Party Banner Decorations',
      Orders: 8,
      Spend: 60,
      Sales: 184,
    },
  ],
};

const result = analyzeInternalKeywordMarket({
  product: guf3129,
  probe: detectorProbe,
});

assert.strictEqual(result.query, 'Patriotic Bucket Hat');
assert.strictEqual(result.competition.level, 'high');
assert.strictEqual(result.competition.marketScale, 'high');
assert.strictEqual(result.competition.bidPressure, 'high');
assert.ok(result.competition.evidence.some(item => item.includes('totalSpend=146.20')));

assert.deepStrictEqual(
  result.similarProducts.map(item => item.sku),
  ['HAT1001']
);

const directTerms = result.keywordDecisions
  .filter(item => item.recommendation === 'direct_reference')
  .map(item => item.keyword);
assert.deepStrictEqual(directTerms, ['patriotic bucket hat', 'american flag bucket hat']);

const decor = result.keywordDecisions.find(item => item.keyword === '4th of july decorations');
assert.strictEqual(decor.recommendation, 'market_signal_only');
assert.strictEqual(decor.canReference, false);

const genericHat = result.keywordDecisions.find(item => item.keyword === 'patriotic hat');
assert.strictEqual(genericHat.recommendation, 'low_bid_test');
assert.strictEqual(genericHat.competitionLevel, 'high');
assert.strictEqual(genericHat.suggestedMatchType, 'PHRASE');

const primary = result.keywordDecisions.find(item => item.keyword === 'patriotic bucket hat');
assert.strictEqual(primary.suggestedMatchType, 'EXACT_AND_PHRASE');
assert.ok(primary.suggestedBid > 0);
assert.ok(primary.suggestedBid <= result.bidModel.affordableCpc);
assert.ok(primary.reason.includes('similar internal product converted'));

assert.strictEqual(result.referenceKeywords.length, 3);
assert.ok(result.operatorTakeaway.includes('internal market'));

const staleProfileProduct = {
  sku: 'GUF3129',
  asin: 'B0GWD724Y8',
  title: 'GUF3129',
  price: 45.99,
  targetAcos: 0.15,
  estimatedConversionRate: 0.05,
  productProfile: {
    productType: 'gift basket',
    targetAudience: ['nurse'],
    positioning: 'nurse gift basket',
  },
  createContext: {
    keywordSeeds: [
      'patriotic bucket hat set',
      'american flag bucket hat set',
    ],
  },
};

const staleProfileResult = analyzeInternalKeywordMarket({
  product: staleProfileProduct,
  probe: {
    query: '',
    total: { Spend: 24, Orders: 3, Sales: 120, Clicks: 60, CPC: 0.4, ACOS: 0.2 },
    keywordRows: [{
      keywordText: 'american flag bucket hat set',
      sku: 'HATSET1',
      asin: 'B0HATSET1',
      productTitle: 'American Flag Bucket Hat Set',
      Spend: 10,
      Orders: 2,
      Sales: 92,
      Clicks: 25,
      CPC: 0.4,
      ACOS: 0.109,
    }],
  },
});

assert.strictEqual(staleProfileResult.keywordDecisions[0].recommendation, 'direct_reference');
assert.ok(staleProfileResult.keywordDecisions[0].reason.includes('similar internal product converted'));

const thinHighCpcMarket = analyzeInternalKeywordMarket({
  product: {
    sku: 'GUF3129',
    title: '12 Pcs Patriotic Bucket Hat Set',
    price: 45.99,
    targetAcos: 0.15,
    estimatedConversionRate: 0.05,
    createContext: {
      keywordSeeds: ['patriotic bucket hat set'],
    },
  },
  probe: {
    query: 'Patriotic Bucket Hat',
    total: {
      Impressions: '921',
      Clicks: '6',
      Spend: '4.60',
      Orders: '1',
      Sales: '39.99',
      CPC: '0.766666',
      ACOS: '0.115028',
    },
    keywordRows: [],
  },
});

assert.strictEqual(thinHighCpcMarket.competition.level, 'high');
assert.strictEqual(thinHighCpcMarket.competition.marketScale, 'low');
assert.strictEqual(thinHighCpcMarket.competition.bidPressure, 'high');

const asinDetectorAliasResult = analyzeInternalKeywordMarket({
  product: {
    sku: 'GUF3129',
    title: '12 Pcs Patriotic Bucket Hat Set',
    price: 45.99,
    targetAcos: 0.15,
    estimatedConversionRate: 0.05,
    createContext: {
      keywordSeeds: ['patriotic bucket hat set', 'american flag bucket hat set'],
    },
  },
  probe: {
    query: 'Patriotic Bucket Hat',
    total: {},
    keywordRows: [],
    asinRows: [{
      asin: 'B0GFW54QYG',
      sku: 'BOY6911',
      title: 'Frienda 18 Pcs American Flag Bucket Hat Bulk 4th of July Hat USA Patriotic Bucket Hats',
      spTotalOrder: '4',
      Spend: '4.60',
      Sales: '39.99',
    }],
  },
});

assert.deepStrictEqual(asinDetectorAliasResult.similarProducts.map(item => item.sku), ['BOY6911']);
assert.strictEqual(asinDetectorAliasResult.similarProducts[0].orders, 4);

const asinReverseLookupWithTrafficSources = analyzeInternalKeywordMarket({
  product: {
    sku: 'GUF3129',
    title: '12 Pcs Patriotic Bucket Hat Set for Men Women',
    price: 45.99,
    targetAcos: 0.15,
    estimatedConversionRate: 0.05,
    createContext: {
      keywordSeeds: ['patriotic bucket hat set', 'american flag bucket hat set'],
    },
  },
  probe: {
    query: 'B0GFW54QYG',
    total: { Spend: '19.50', Orders: '4', Sales: '159.96', Clicks: '35', CPC: '0.56', ACOS: '0.122' },
    sourceTotals: {
      keyword: { Spend: '4.60', Orders: '1', Sales: '39.99', Clicks: '6', CPC: '0.77', ACOS: '0.115' },
      pt: { Spend: '10.50', Orders: '2', Sales: '79.98', Clicks: '16', CPC: '0.66', ACOS: '0.131' },
      auto: { Spend: '4.40', Orders: '1', Sales: '39.99', Clicks: '13', CPC: '0.34', ACOS: '0.110' },
    },
    keywordRows: [{
      keywordText: 'patriotic bucket hats',
      sku: 'BOY6911',
      asin: 'B0GFW54QYG',
      productTitle: 'Frienda 18 Pcs American Flag Bucket Hat Bulk 4th of July Hat USA Patriotic Bucket Hats',
      Spend: '4.60',
      Orders: '1',
      Sales: '39.99',
      Clicks: '6',
      CPC: '0.77',
      ACOS: '0.115',
    }],
    ptRows: [{
      targetText: 'B0GFW54QYG',
      sku: 'BOY6911',
      asin: 'B0GFW54QYG',
      productTitle: 'Frienda 18 Pcs American Flag Bucket Hat Bulk 4th of July Hat USA Patriotic Bucket Hats',
      Spend: '10.50',
      Orders: '2',
      Sales: '79.98',
      Clicks: '16',
      CPC: '0.66',
      ACOS: '0.131',
    }],
    autoRows: [{
      searchTerm: 'bulk patriotic bucket hats',
      sku: 'BOY6911',
      asin: 'B0GFW54QYG',
      productTitle: 'Frienda 18 Pcs American Flag Bucket Hat Bulk 4th of July Hat USA Patriotic Bucket Hats',
      Spend: '4.40',
      Orders: '1',
      Sales: '39.99',
      Clicks: '13',
      CPC: '0.34',
      ACOS: '0.110',
    }],
  },
});

assert.ok(asinReverseLookupWithTrafficSources.competitionBySource, 'expected per-source competition summary');
assert.strictEqual(asinReverseLookupWithTrafficSources.competitionBySource.keyword.bidPressure, 'high');
assert.strictEqual(asinReverseLookupWithTrafficSources.competitionBySource.pt.marketScale, 'low');
assert.strictEqual(asinReverseLookupWithTrafficSources.competitionBySource.auto.level, 'low');

const groupedSources = asinReverseLookupWithTrafficSources.keywordDecisions.map(item => item.source);
assert.deepStrictEqual(groupedSources, ['pt', 'keyword', 'auto']);

const ptTarget = asinReverseLookupWithTrafficSources.referenceTargets[0];
assert.strictEqual(ptTarget.source, 'pt');
assert.strictEqual(ptTarget.keyword, 'B0GFW54QYG');
assert.strictEqual(ptTarget.suggestedMatchType, 'PRODUCT_TARGET');
assert.strictEqual(ptTarget.recommendation, 'direct_reference');

const autoTerm = asinReverseLookupWithTrafficSources.referenceKeywords.find(item => item.source === 'auto');
assert.strictEqual(autoTerm.keyword, 'bulk patriotic bucket hats');
assert.strictEqual(autoTerm.suggestedMatchType, 'PHRASE');
assert.ok(autoTerm.reason.includes('auto'));

assert.ok(asinReverseLookupWithTrafficSources.operatorTakeaway.includes('keyword/pt/auto'));

const autoTargetOnlyResult = analyzeInternalKeywordMarket({
  product: {
    sku: 'GUF3129',
    title: '12 Pcs Patriotic Bucket Hat Set for Men Women',
    price: 45.99,
    targetAcos: 0.15,
    estimatedConversionRate: 0.05,
    createContext: {
      keywordSeeds: ['patriotic bucket hat set', 'american flag bucket hat set'],
    },
  },
  probe: {
    query: 'B0GFW54QYG',
    sourceTotals: {
      auto: { Spend: '792.28', Orders: '272', Sales: '5914.78', Clicks: '9506', CPC: '0.083345', ACOS: '0.133949' },
    },
    autoRows: [{
      type: 'close-match',
      targetType: 'close-match',
      asin: 'B0GFW54QYG',
      productTitle: 'Frienda 18 Pcs American Flag Bucket Hat Bulk 4th of July Hat USA Patriotic Bucket Hats',
      Spend: '792.28',
      Orders: '272',
      Sales: '5914.78',
      Clicks: '9506',
      CPC: '0.083345',
      ACOS: '0.133949',
    }],
  },
});

assert.deepStrictEqual(autoTargetOnlyResult.referenceKeywords, []);
assert.strictEqual(autoTargetOnlyResult.keywordDecisions[0].keyword, 'close-match');
assert.strictEqual(autoTargetOnlyResult.keywordDecisions[0].recommendation, 'market_signal_only');
assert.strictEqual(autoTargetOnlyResult.keywordDecisions[0].canReference, false);
assert.ok(autoTargetOnlyResult.keywordDecisions[0].reason.includes('no promotable search term'));

console.log('internal_keyword_market.test.js passed');
