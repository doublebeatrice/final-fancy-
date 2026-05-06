const assert = require('assert');
const {
  buildProductProfile,
  buildVisionQueue,
  computeListingSignature,
  enrichSnapshotWithProfiles,
  mergeVisionResults,
  scoreTermRelevance,
} = require('../src/product_profile');
const { getSeasonWindows, matchProductSeason } = require('../src/season_calendar');

const card = {
  sku: 'DN1655',
  asin: 'B0TEST1655',
  listing: {
    title: 'Nurse Week Gift Basket for Women',
    bullets: ['Nurse appreciation gift with tumbler and socks'],
    description: 'Ready to gift care package for healthcare workers.',
    aPlusText: 'Thank you nurse | pink gift basket',
    breadcrumbs: ['Home & Kitchen', 'Gift Baskets'],
    mainImageUrl: 'https://cdn.example.com/nurse-week-gift-basket-main.jpg',
    imageUrls: [
      'https://cdn.example.com/nurse-week-gift-basket-main.jpg',
      'https://cdn.example.com/nurse-week-gift-basket-side.jpg',
    ],
  },
};

{
  const profile = buildProductProfile(card);
  assert.strictEqual(profile.productType, 'gift basket');
  assert.ok(profile.targetAudience.includes('nurse'));
  assert.ok(profile.occasion.includes('nurse week'));
  assert.ok(profile.seasonality.includes('Q2'));
  assert.strictEqual(profile.hasImages, true);
  assert.strictEqual(profile.imageCount, 2);
  assert.ok(profile.needsImageUnderstanding);
  const strong = scoreTermRelevance('nurse week gifts', profile);
  const weak = scoreTermRelevance('teacher appreciation gifts', profile);
  assert.strictEqual(strong.level, 'high');
  assert.ok(strong.score > weak.score);
  assert.ok(weak.conflicts.includes('teacher'));
}

{
  const signature = computeListingSignature(card);
  const existing = {
    signature,
    source: 'vision',
    imageUnderstandingAt: '2026-04-24T00:00:00.000Z',
    productType: 'gift basket',
  };
  const profile = buildProductProfile(card, existing);
  assert.strictEqual(profile.source, 'vision');
  assert.strictEqual(profile.imageUnderstandingAt, '2026-04-24T00:00:00.000Z');
  assert.strictEqual(profile.needsImageUnderstanding, false);
}

{
  const cache = { profiles: {} };
  const first = enrichSnapshotWithProfiles({ productCards: [card] }, { cache, cacheFile: 'data/product_profiles.json' });
  assert.strictEqual(first.meta.created, 1);
  const second = enrichSnapshotWithProfiles(first.snapshot, { cache: first.cache, cacheFile: 'data/product_profiles.json' });
  assert.strictEqual(second.meta.reused, 1);
  assert.strictEqual(second.snapshot.productCards[0].productProfile.productType, 'gift basket');
}

{
  const cache = { profiles: {} };
  const { snapshot } = enrichSnapshotWithProfiles({
    productCards: [
      { ...card, sku: 'LOW', profitRate: 0.12, invDays: 30, unitsSold_30d: 2, adStats: { '30d': { spend: 1 } } },
      { ...card, sku: 'HIGH', asin: 'B0HIGH', profitRate: 0.3, invDays: 120, unitsSold_30d: 80, adStats: { '30d': { spend: 50 } } },
    ],
  }, { cache, cacheFile: 'data/product_profiles.json' });
  const queue = buildVisionQueue(snapshot, { limit: 1 });
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].sku, 'HIGH');
  assert.strictEqual(queue[0].images.length, 2);
}

{
  const cache = { profiles: {} };
  const enriched = enrichSnapshotWithProfiles({ productCards: [card] }, { cache, cacheFile: 'data/product_profiles.json' });
  const profile = enriched.snapshot.productCards[0].productProfile;
  const merged = mergeVisionResults(enriched.snapshot, [
    {
      sku: 'DN1655',
      asin: 'B0TEST1655',
      signature: profile.signature,
      productType: 'gift basket',
      productTypes: ['gift basket', 'care package'],
      targetAudience: ['nurse', 'women'],
      occasion: ['nurse week'],
      seasonality: ['Q2'],
      visualTheme: ['pink', 'thank you', 'medical'],
      visibleText: ['Thank You Nurse'],
      positioning: 'nurse week appreciation gift basket',
      imageListingMatch: 'strong',
      confidence: 0.92,
      notes: ['main image confirms nurse theme'],
    },
  ], { cache: enriched.cache, cacheFile: 'data/product_profiles.json' });
  const mergedProfile = merged.snapshot.productCards[0].productProfile;
  assert.strictEqual(merged.meta.visionMerged, 1);
  assert.strictEqual(mergedProfile.source, 'vision');
  assert.strictEqual(mergedProfile.needsImageUnderstanding, false);
  assert.strictEqual(mergedProfile.imageListingMatch, 'strong');
  assert.ok(mergedProfile.visibleText.includes('thank you nurse'));
  assert.strictEqual(buildVisionQueue(merged.snapshot).length, 0);
}

{
  const godmotherCard = {
    sku: 'AE1079',
    asin: 'B0BD3NQ9QN',
    listing: null,
    createContext: {
      keywordSeeds: [
        "mother's day gifts for godmother",
        'godmother gift box',
        'godmother gifts',
        'godmother coffee cup',
        'gift box for godmother',
      ],
    },
  };
  const profile = buildProductProfile(godmotherCard);
  assert.ok(profile.targetAudience.includes('godmother'));
  assert.ok(profile.occasion.includes('mothers day'));
  assert.ok(profile.seasonality.includes('Q2'));
  const matched = matchProductSeason(profile, getSeasonWindows('2026-05-05'));
  assert.ok(matched.some(window => window.key === 'mothers_day' && window.phase === 'peak'));
  const relevant = scoreTermRelevance('godmother proposal', profile);
  assert.notStrictEqual(relevant.level, 'conflict');
}

console.log('product_profile tests passed');
