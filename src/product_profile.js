const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CACHE_FILE = path.join(__dirname, '..', 'data', 'product_profiles.json');
const PROFILE_VERSION = 1;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanToken(value) {
  return normalizeText(value).toLowerCase();
}

function uniq(items) {
  return [...new Set((items || []).map(cleanToken).filter(Boolean))];
}

const STOP_TOKENS = new Set([
  'for', 'and', 'the', 'with', 'from', 'your', 'you', 'women', 'woman', 'men', 'man',
  'gift', 'gifts', 'present', 'set', 'pack', 'bundle', 'best', 'bulk', 'cute',
]);

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOP_TOKENS.has(token));
}

function imageNameTokens(url = '') {
  const noise = new Set(['http', 'https', 'www', 'com', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'ssl', 'images', 'image', 'cdn', 'media', 'amazon']);
  return String(url || '')
    .toLowerCase()
    .replace(/^https?:\/\//, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !noise.has(token));
}

function listingText(card = {}) {
  const listing = card.listing || {};
  return [
    card.sku,
    card.asin,
    card.note,
    card.solrTerm,
    listing.title,
    listing.brand,
    ...(listing.bulletHighlights || []),
    ...(listing.bullets || []).slice(0, 8),
    listing.description,
    listing.aPlusText,
    listing.categoryPath,
    ...(listing.breadcrumbs || []),
    listing.variationText,
  ].filter(Boolean).join(' ');
}

function visualText(card = {}) {
  const listing = card.listing || {};
  const urls = [
    listing.mainImageUrl,
    ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
  ];
  return imageNameTokens(urls.join(' ')).join(' ');
}

function matchLabels(text, rules) {
  const hits = [];
  for (const [label, re] of rules) {
    if (re.test(text)) hits.push(label);
  }
  return hits;
}

const PRODUCT_TYPE_RULES = [
  ['gift basket', /gift basket|care package|basket|bundle|set/],
  ['tumbler', /tumbler|cup|mug|drinkware|water bottle/],
  ['blanket', /blanket|throw/],
  ['bag', /tote|bag|pouch|makeup bag|cosmetic bag/],
  ['jewelry', /bracelet|necklace|earring|jewelry|ring/],
  ['decor', /decor|decoration|sign|ornament|plaque/],
  ['apparel', /shirt|tee|socks|hat|cap|apron/],
  ['party supplies', /party supplies|favors|balloon|banner|pinata|piñata/],
];

const AUDIENCE_RULES = [
  ['nurse', /nurse|rn|healthcare|medical assistant|doctor|lab tech|caregiver/],
  ['teacher', /teacher|school staff|principal|educator/],
  ['mom', /mother|mom|mama|mommy/],
  ['dad', /father|dad|daddy/],
  ['graduate', /graduate|graduation|class of|senior/],
  ['bride', /bride|bridal|bridesmaid|bachelorette/],
  ['christian', /christian|faith|bible|prayer|blessing/],
  ['women', /women|woman|her|female|ladies|girls/],
  ['men', /men|man|him|male|boys/],
  ['baby', /baby|newborn|gender reveal/],
];

const OCCASION_RULES = [
  ['nurse week', /nurse week|nurse appreciation|healthcare appreciation/],
  ['teacher appreciation', /teacher appreciation|thank you teacher|teacher week/],
  ['mothers day', /mother'?s day|mothers day|mom gift/],
  ['fathers day', /father'?s day|fathers day|dad gift/],
  ['graduation', /graduation|class of|senior/],
  ['summer', /summer|beach|pool|swim|luau|tropical|hawaiian/],
  ['wedding', /wedding|bridal|bridesmaid|bachelorette/],
  ['fiesta', /fiesta|cinco|mexican|taco|cactus|pinata|piñata/],
  ['baby shower', /baby shower|gender reveal/],
  ['memorial', /memorial|remembrance|cardinal/],
  ['christian inspirational', /christian|inspirational|faith|bible|prayer/],
  ['thank you', /thank you|appreciation/],
];

function inferSeasonality(occasions) {
  const q2 = new Set([
    'nurse week',
    'teacher appreciation',
    'mothers day',
    'fathers day',
    'graduation',
    'summer',
    'wedding',
    'fiesta',
    'baby shower',
    'memorial',
  ]);
  return occasions.filter(item => q2.has(item)).length ? ['Q2'] : [];
}

function profileTerms(profile = {}) {
  return [
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.seasonality || []),
    ...(profile.visualTheme || []),
    ...(profile.visibleText || []),
    profile.positioning,
    profile.listingTitle,
    profile.categoryPath,
  ].filter(Boolean);
}

function scoreTermRelevance(term, profile = {}) {
  const termText = cleanToken(term);
  const termTokens = tokenize(termText);
  if (!termTokens.length || !profile || typeof profile !== 'object') {
    return { score: null, level: 'unknown', matched: [], conflicts: [] };
  }

  const profileTokenSet = new Set(tokenize(profileTerms(profile).join(' ')));
  const matched = termTokens.filter(token => profileTokenSet.has(token));
  const conflictPairs = [
    ['nurse', ['teacher', 'student', 'school']],
    ['teacher', ['nurse', 'medical', 'healthcare']],
    ['mom', ['dad', 'father']],
    ['dad', ['mom', 'mother']],
    ['bride', ['baby', 'teacher', 'nurse']],
    ['baby', ['bride', 'nurse', 'teacher']],
  ];
  const profileText = cleanToken(profileTerms(profile).join(' '));
  const conflicts = [];
  for (const [own, others] of conflictPairs) {
    if (!profileText.includes(own)) continue;
    for (const other of others) {
      if (termText.includes(other)) conflicts.push(other);
    }
  }

  const phraseBoosts = [
    ...(profile.occasion || []),
    ...(profile.targetAudience || []),
    profile.productType,
  ].filter(Boolean).filter(item => termText.includes(cleanToken(item)));

  let score = 0.18;
  score += Math.min(0.45, matched.length * 0.15);
  score += Math.min(0.25, phraseBoosts.length * 0.12);
  if (termText.includes('gift') && profileText.includes('gift')) score += 0.08;
  if (conflicts.length) score -= 0.35;
  if (matched.length === 0 && phraseBoosts.length === 0) score -= 0.12;
  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));

  const level = score >= 0.7 ? 'high' : (score >= 0.45 ? 'medium' : (score >= 0.25 ? 'low' : 'conflict'));
  return {
    score,
    level,
    matched: [...new Set(matched)],
    conflicts: [...new Set(conflicts)],
  };
}

function computeListingSignature(card = {}) {
  const listing = card.listing || {};
  const signaturePayload = {
    version: PROFILE_VERSION,
    asin: normalizeText(card.asin),
    title: normalizeText(listing.title),
    bullets: Array.isArray(listing.bullets) ? listing.bullets.map(normalizeText).slice(0, 8) : [],
    description: normalizeText(listing.description),
    aPlusText: normalizeText(listing.aPlusText),
    breadcrumbs: Array.isArray(listing.breadcrumbs) ? listing.breadcrumbs.map(normalizeText) : [],
    variationText: normalizeText(listing.variationText),
    mainImageUrl: normalizeText(listing.mainImageUrl),
    imageUrls: Array.isArray(listing.imageUrls) ? listing.imageUrls.map(normalizeText) : [],
  };
  return crypto.createHash('sha1').update(JSON.stringify(signaturePayload)).digest('hex');
}

function buildProductProfile(card = {}, existingProfile = null) {
  const text = cleanToken(`${listingText(card)} ${visualText(card)}`);
  const productTypes = matchLabels(text, PRODUCT_TYPE_RULES);
  const audiences = matchLabels(text, AUDIENCE_RULES);
  const occasions = matchLabels(text, OCCASION_RULES);
  const listing = card.listing || {};
  const imageUrls = uniq([
    listing.mainImageUrl,
    ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
  ]);
  const signature = computeListingSignature(card);
  const title = normalizeText(listing.title);
  const positioningParts = [
    audiences[0],
    occasions[0],
    productTypes[0],
  ].filter(Boolean);

  return {
    version: PROFILE_VERSION,
    sku: normalizeText(card.sku),
    asin: normalizeText(card.asin),
    signature,
    source: existingProfile && existingProfile.signature === signature ? existingProfile.source || 'cache' : 'rules',
    generatedAt: new Date().toISOString(),
    stale: false,
    productType: productTypes[0] || 'unknown',
    productTypes,
    targetAudience: audiences,
    occasion: occasions,
    seasonality: inferSeasonality(occasions),
    visualTheme: uniq([...audiences, ...occasions, ...visualText(card).split(/\s+/)]).slice(0, 18),
    positioning: positioningParts.length ? positioningParts.join(' ') : title.slice(0, 120),
    listingTitle: title,
    categoryPath: normalizeText(listing.categoryPath || (listing.breadcrumbs || []).join(' > ')),
    hasImages: imageUrls.length > 0,
    imageCount: imageUrls.length,
    mainImageUrl: normalizeText(listing.mainImageUrl || imageUrls[0] || ''),
    confidence: Math.min(0.9, 0.35 + (productTypes.length ? 0.15 : 0) + (audiences.length ? 0.15 : 0) + (occasions.length ? 0.15 : 0) + (imageUrls.length ? 0.1 : 0)),
    needsImageUnderstanding: imageUrls.length > 0 && !(existingProfile && existingProfile.imageUnderstandingAt && existingProfile.signature === signature),
    imageUnderstandingAt: existingProfile && existingProfile.signature === signature ? existingProfile.imageUnderstandingAt || null : null,
    notes: [],
  };
}

function loadProfileCache(cacheFile = DEFAULT_CACHE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return { version: PROFILE_VERSION, updatedAt: null, profiles: {} };
  }
}

function saveProfileCache(cache, cacheFile = DEFAULT_CACHE_FILE) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({
    version: PROFILE_VERSION,
    updatedAt: new Date().toISOString(),
    profiles: cache.profiles || {},
  }, null, 2), 'utf8');
}

function profileKey(card = {}) {
  return normalizeText(card.asin) || normalizeText(card.sku);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function scoreVisionCandidate(card = {}) {
  const profile = card.productProfile || {};
  const ad30 = card.adStats?.['30d'] || {};
  const profit = num(card.profitRate);
  const invDays = num(card.invDays);
  const sold30 = num(card.unitsSold_30d);
  const spend30 = num(ad30.spend);
  const seasonal = Array.isArray(profile.seasonality) && profile.seasonality.length > 0;
  const lowConfidence = num(profile.confidence) > 0 && num(profile.confidence) < 0.75;
  return (
    profit * 120 +
    Math.min(invDays, 180) * 0.12 +
    Math.min(sold30, 120) * 0.25 +
    Math.min(spend30, 80) * 0.35 +
    (seasonal ? 25 : 0) +
    (lowConfidence ? 12 : 0) +
    (profile.needsImageUnderstanding ? 30 : 0)
  );
}

function buildVisionQueue(snapshot = {}, options = {}) {
  const limit = Number(options.limit || process.env.PRODUCT_VISION_LIMIT || 30);
  const maxImagesPerSku = Number(options.maxImagesPerSku || process.env.PRODUCT_VISION_MAX_IMAGES || 2);
  const candidates = [];

  for (const card of snapshot.productCards || []) {
    const profile = card.productProfile || {};
    const listing = card.listing || {};
    if (!profile.needsImageUnderstanding) continue;
    const imageUrls = uniq([
      listing.mainImageUrl,
      ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
      profile.mainImageUrl,
    ]);
    if (!imageUrls.length) continue;
    const score = scoreVisionCandidate(card);
    candidates.push({
      sku: normalizeText(card.sku),
      asin: normalizeText(card.asin),
      score: Number(score.toFixed(3)),
      signature: profile.signature || computeListingSignature(card),
      profileSource: profile.source || 'rules',
      currentProfile: {
        productType: profile.productType || '',
        targetAudience: profile.targetAudience || [],
        occasion: profile.occasion || [],
        seasonality: profile.seasonality || [],
        positioning: profile.positioning || '',
        confidence: profile.confidence || 0,
      },
      listing: {
        title: normalizeText(listing.title),
        bullets: Array.isArray(listing.bullets) ? listing.bullets.map(normalizeText).slice(0, 5) : [],
        categoryPath: normalizeText(listing.categoryPath || (listing.breadcrumbs || []).join(' > ')),
      },
      businessSignals: {
        profitRate: num(card.profitRate),
        invDays: num(card.invDays),
        unitsSold30d: num(card.unitsSold_30d),
        adSpend30d: num(card.adStats?.['30d']?.spend),
      },
      images: imageUrls.slice(0, maxImagesPerSku).map((url, index) => ({
        url,
        role: index === 0 ? 'main' : 'secondary',
      })),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

function mergeVisionResultIntoProfile(profile = {}, result = {}) {
  const seasonality = uniq([...(result.seasonality || []), ...(profile.seasonality || [])])
    .map(item => /^q[1-4]$/i.test(item) ? item.toUpperCase() : item);
  const merged = {
    ...profile,
    source: 'vision',
    imageUnderstandingAt: result.analyzedAt || new Date().toISOString(),
    needsImageUnderstanding: false,
    productType: normalizeText(result.productType || profile.productType || 'unknown'),
    productTypes: uniq([...(profile.productTypes || []), ...(result.productTypes || []), result.productType]),
    targetAudience: uniq([...(result.targetAudience || []), ...(profile.targetAudience || [])]),
    occasion: uniq([...(result.occasion || []), ...(profile.occasion || [])]),
    seasonality,
    visualTheme: uniq([...(result.visualTheme || []), ...(profile.visualTheme || [])]).slice(0, 24),
    visibleText: uniq([...(result.visibleText || []), ...(profile.visibleText || [])]).slice(0, 24),
    positioning: normalizeText(result.positioning || profile.positioning || ''),
    confidence: Math.max(num(profile.confidence), num(result.confidence)),
    imageListingMatch: normalizeText(result.imageListingMatch || profile.imageListingMatch || ''),
    notes: [
      ...(Array.isArray(profile.notes) ? profile.notes : []),
      ...(Array.isArray(result.notes) ? result.notes.map(normalizeText).filter(Boolean) : []),
    ].slice(-20),
  };
  return merged;
}

function mergeVisionResults(snapshot = {}, visionResults = [], options = {}) {
  const cacheFile = options.cacheFile || DEFAULT_CACHE_FILE;
  const cache = options.cache || loadProfileCache(cacheFile);
  const profiles = cache.profiles || {};
  const byKey = new Map();
  for (const result of visionResults || []) {
    const key = normalizeText(result.asin) || normalizeText(result.sku);
    if (key) byKey.set(key, result);
  }

  let mergedCount = 0;
  const productCards = (snapshot.productCards || []).map(card => {
    const key = profileKey(card);
    const result = byKey.get(key);
    if (!result) return card;
    const current = card.productProfile || profiles[key] || buildProductProfile(card);
    if (result.signature && current.signature && result.signature !== current.signature) {
      return {
        ...card,
        productProfile: {
          ...current,
          notes: [...(current.notes || []), 'vision_result_signature_mismatch'].slice(-20),
        },
      };
    }
    const merged = mergeVisionResultIntoProfile(current, result);
    profiles[key] = merged;
    mergedCount += 1;
    return { ...card, productProfile: merged };
  });

  return {
    snapshot: {
      ...snapshot,
      productCards,
      productProfileMeta: {
        ...(snapshot.productProfileMeta || {}),
        visionMerged: mergedCount,
        visionMergedAt: new Date().toISOString(),
      },
    },
    cache: { ...cache, profiles },
    meta: { visionMerged: mergedCount },
  };
}

function enrichSnapshotWithProfiles(snapshot = {}, options = {}) {
  const cacheFile = options.cacheFile || DEFAULT_CACHE_FILE;
  const cache = options.cache || loadProfileCache(cacheFile);
  const profiles = cache.profiles || {};
  let created = 0;
  let reused = 0;
  let changed = 0;
  const productCards = (snapshot.productCards || []).map(card => {
    const key = profileKey(card);
    if (!key) return card;
    const signature = computeListingSignature(card);
    const existing = profiles[key] || null;
    const profile = existing && existing.signature === signature
      ? { ...existing, stale: false }
      : buildProductProfile(card, existing);
    if (!existing) created += 1;
    else if (existing.signature === signature) reused += 1;
    else changed += 1;
    profiles[key] = profile;
    return { ...card, productProfile: profile };
  });

  const nextSnapshot = {
    ...snapshot,
    productCards,
    productProfileMeta: {
      cacheFile,
      created,
      reused,
      changed,
      total: productCards.length,
      generatedAt: new Date().toISOString(),
    },
  };

  return {
    snapshot: nextSnapshot,
    cache: { ...cache, profiles },
    meta: nextSnapshot.productProfileMeta,
  };
}

module.exports = {
  DEFAULT_CACHE_FILE,
  PROFILE_VERSION,
  buildProductProfile,
  buildVisionQueue,
  computeListingSignature,
  enrichSnapshotWithProfiles,
  loadProfileCache,
  mergeVisionResults,
  saveProfileCache,
  scoreVisionCandidate,
  scoreTermRelevance,
  tokenize,
};
