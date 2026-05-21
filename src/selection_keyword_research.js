const { tokenize } = require('./product_profile');

const AMAZON_SEARCH_ORIGIN = 'https://www.amazon.com';

const NODE_ONLY_TOKENS = new Set([
  '4th', 'patriotic', 'july', 'christmas', 'halloween', 'easter', 'valentine', 'valentines',
  'thanksgiving', 'memorial', 'fiesta', 'cinco', 'mayo', 'fathers', 'father',
  'mothers', 'mother', 'graduation', 'summer', 'spring', 'winter', 'fall',
]);

const SCENE_TOKENS = new Set([
  'party', 'table', 'centerpiece', 'centerpieces', 'runner', 'dinner', 'host',
  'classroom', 'office', 'porch', 'yard', 'door', 'wall', 'supplies', 'decor',
  'decoration', 'decorations', 'banner', 'banners', 'sign', 'signs', 'photo',
  'booth', 'props', 'setup', 'outdoor', 'indoor',
]);

const DIRECT_FORM_TOKENS = new Set([
  'decor', 'decoration', 'decorations', 'centerpiece', 'centerpieces', 'ornament',
  'ornaments', 'sign', 'signs', 'banner', 'banners',
]);

const PRODUCT_FORM_TOKEN_HINTS = new Set([
  'hat', 'hats', 'cap', 'caps', 'bucket', 'shirt', 'shirts', 'tee', 'tees',
  'fisherman', 'fishermen',
  'sock', 'socks', 'tablecloth', 'tablecloths', 'runner', 'runners', 'cup',
  'cups', 'plate', 'plates', 'napkin', 'napkins', 'tumbler', 'mug', 'blanket',
  'bag', 'keychain', 'bracelet', 'necklace', 'earring', 'ornament', 'pinata',
  'balloon', 'banner', 'sign', 'sash', 'card', 'cards', 'basket', 'frame',
  'candle', 'topper', 'toppers', 'pick', 'picks', 'flag', 'flags', 'decor',
  'decoration', 'decorations', 'centerpiece', 'centerpieces',
]);

const TITLE_STOP_TOKENS = new Set([
  'for', 'and', 'with', 'the', 'this', 'that', 'your', 'from', 'pack', 'pcs',
  'piece', 'pieces', 'set', 'bulk', 'best',
]);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function uniq(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function splitList(value) {
  if (Array.isArray(value)) return uniq(value);
  return uniq(String(value || '')
    .split(/[,，;\n\r]+/)
    .map(item => item.trim()));
}

function normalizeAsin(value) {
  return text(value).toUpperCase();
}

function normalizeResearchInput(input = {}) {
  const asin = normalizeAsin(input.asin);
  const ownAsins = [
    asin,
    ...splitList(input.ownAsins || input.ownAsin || ''),
  ].map(normalizeAsin).filter(Boolean);
  return {
    sku: text(input.sku).toUpperCase(),
    asin,
    title: text(input.title || input.listingTitle || input.productTitle),
    description: text(input.description || input.productDescription),
    terms: splitList(input.terms || input.searchTerms || input.keywords),
    ownAsins: [...new Set(ownAsins)],
    productProfile: input.productProfile || {},
  };
}

function buildAmazonSearchUrl(term) {
  const url = new URL('/s', AMAZON_SEARCH_ORIGIN);
  url.searchParams.set('k', text(term));
  return url.toString();
}

function addSeed(seeds, seen, term, source) {
  const normalized = lower(term);
  if (!normalized || normalized.length < 3 || normalized.length > 80 || seen.has(normalized)) return;
  seen.add(normalized);
  seeds.push({ term: normalized, source });
}

function titleTokens(value) {
  return lower(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !TITLE_STOP_TOKENS.has(token));
}

function titleNgrams(value, min = 3, max = 4) {
  const tokens = titleTokens(value);
  const phrases = [];
  for (let size = max; size >= min; size -= 1) {
    for (let i = 0; i <= tokens.length - size; i += 1) {
      const phraseTokens = tokens.slice(i, i + size);
      if (!phraseTokens.some(token => !NODE_ONLY_TOKENS.has(token))) continue;
      phrases.push(phraseTokens.join(' '));
    }
  }
  return uniq(phrases);
}

function deriveResearchSeedTerms(input = {}, options = {}) {
  const normalized = normalizeResearchInput(input);
  const limit = Number(options.limit || 8);
  const seeds = [];
  const seen = new Set();
  for (const term of normalized.terms) addSeed(seeds, seen, term, 'operator_terms');

  const profile = normalized.productProfile || {};
  addSeed(seeds, seen, profile.positioning, 'product_profile');
  addSeed(seeds, seen, profile.listingTitle, 'product_profile');
  for (const phrase of titleNgrams(normalized.title).slice(0, 6)) {
    addSeed(seeds, seen, phrase, 'listing_title');
  }

  for (const occasion of profile.occasion || []) {
    for (const productType of [profile.productType, ...(profile.productTypes || [])]) {
      addSeed(seeds, seen, `${occasion} ${productType}`, 'product_profile');
    }
  }

  return seeds.slice(0, limit);
}

function tokenSet(value) {
  return new Set(tokenize(value));
}

function intersect(a = new Set(), b = new Set()) {
  return [...a].filter(item => b.has(item));
}

function nonNode(tokens = []) {
  return tokens.filter(token => !NODE_ONLY_TOKENS.has(token));
}

function productIntentTokens(input = {}) {
  const profile = input.productProfile || {};
  const raw = [
    input.title,
    input.description,
    ...(input.terms || []),
    profile.productType,
    ...(profile.productTypes || []),
    profile.positioning,
  ].filter(Boolean).join(' ');
  return new Set(nonNode([...tokenSet(raw)]));
}

function directFormTokens(input = {}) {
  const profile = input.productProfile || {};
  const raw = [
    input.title,
    ...(input.terms || []),
    profile.productType,
    ...(profile.productTypes || []),
    profile.positioning,
  ].filter(Boolean).join(' ');
  const tokens = nonNode([...tokenSet(raw)]);
  const formTokens = tokens.filter(token => PRODUCT_FORM_TOKEN_HINTS.has(token) || DIRECT_FORM_TOKENS.has(token));
  if (tokens.includes('decor')) formTokens.push('decoration', 'decorations', 'centerpiece', 'centerpieces');
  if (tokens.includes('hat') || tokens.includes('cap') || tokens.includes('bucket')) formTokens.push('fisherman', 'fishermen', 'cap', 'caps', 'hat', 'hats', 'bucket');
  if (tokens.includes('apparel')) formTokens.push('hat', 'hats', 'cap', 'caps', 'shirt', 'shirts');
  if (tokens.includes('party') && tokens.includes('supplies')) formTokens.push('banner', 'balloon', 'tablecloth', 'napkin', 'plate', 'cup');
  return new Set(formTokens);
}

function searchContextTokens(seedTerms = []) {
  return new Set(nonNode(seedTerms.flatMap(item => [...tokenSet(item.term || item)])));
}

function categoryLooksDifferent(categoryPath = '', input = {}) {
  const category = lower(categoryPath);
  if (!category) return false;
  const profile = input.productProfile || {};
  const productWords = [
    profile.productType,
    ...(profile.productTypes || []),
    'decor',
    'decoration',
    'decorations',
  ].filter(Boolean).map(lower);
  return !productWords.some(word => category.includes(word));
}

function classifyResult(row = {}, context = {}) {
  const input = context.input || {};
  const title = text(row.title);
  const asin = normalizeAsin(row.asin);
  const ownAsins = new Set((input.ownAsins || []).map(normalizeAsin));
  if (!asin) return { bucket: 'excludedAsins', excludeReason: 'missing_asin' };
  if (ownAsins.has(asin)) return { bucket: 'excludedAsins', excludeReason: 'own_or_same_store_asin' };

  const titleSet = tokenSet(title);
  const intentMatches = intersect(context.productIntentTokens, titleSet);
  const searchMatches = nonNode(intersect(context.searchContextTokens, titleSet));
  const sceneMatches = searchMatches.filter(token => SCENE_TOKENS.has(token) || context.productIntentTokens.has(token));
  const nodeMatches = intersect(tokenSet(row.searchTerm || ''), titleSet).filter(token => NODE_ONLY_TOKENS.has(token));

  if (!intentMatches.length && !sceneMatches.length) {
    return {
      bucket: 'excludedAsins',
      excludeReason: nodeMatches.length ? 'node_only_without_product_intent' : 'insufficient_product_or_scene_evidence',
      matchedTokens: [],
      nodeMatches,
    };
  }

  const categoryDifferent = categoryLooksDifferent(row.categoryPath, input);
  const evidenceNotes = [
    row.searchTerm ? `front_search_term=${row.searchTerm}` : '',
    row.position ? `front_position=${row.position}` : '',
    row.sponsored ? 'front_result_is_sponsored' : 'front_result_is_organic_or_unknown',
    intentMatches.length ? `product_intent_tokens=${intentMatches.join('|')}` : '',
    sceneMatches.length ? `scene_tokens=${sceneMatches.join('|')}` : '',
    categoryDifferent ? 'category differs but buyer intent is still relevant' : '',
    Number(row.reviewCount) > 0 ? `review_count=${row.reviewCount}` : '',
  ].filter(Boolean);

  const normalized = {
    asin,
    title,
    searchTerm: text(row.searchTerm),
    price: row.price ?? null,
    rating: row.rating ?? null,
    reviewCount: Number(row.reviewCount || 0),
    position: Number(row.position || 0),
    sponsored: !!row.sponsored,
    categoryPath: text(row.categoryPath),
    url: text(row.url),
    imageUrl: text(row.imageUrl),
    matchedTokens: [...new Set([...intentMatches, ...sceneMatches])],
    evidenceNotes,
  };

  const directFormMatches = intersect(context.directFormTokens, titleSet)
    .filter(token => context.directFormTokens.has(token) || DIRECT_FORM_TOKENS.has(token));
  if (directFormMatches.length >= 2 || (directFormMatches.length && (intentMatches.length >= 2 || sceneMatches.length >= 2))) {
    return { bucket: 'directCompetitors', item: normalized };
  }
  if (sceneMatches.length >= 2 || categoryDifferent) {
    return { bucket: 'sceneCompetitors', item: normalized };
  }
  return { bucket: 'trafficBridgeCompetitors', item: normalized };
}

function classifyAmazonSearchResults({ input = {}, seedTerms = [], searchResults = [] } = {}) {
  const normalizedInput = normalizeResearchInput(input);
  const context = {
    input: normalizedInput,
    productIntentTokens: productIntentTokens(normalizedInput),
    directFormTokens: directFormTokens(normalizedInput),
    searchContextTokens: searchContextTokens(seedTerms),
  };
  const buckets = {
    directCompetitors: [],
    sceneCompetitors: [],
    trafficBridgeCompetitors: [],
    excludedAsins: [],
  };
  const seen = new Set();
  for (const row of searchResults || []) {
    const asin = normalizeAsin(row.asin);
    const key = asin || `${row.searchTerm}|${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const classified = classifyResult(row, context);
    if (classified.bucket === 'excludedAsins') {
      buckets.excludedAsins.push({
        asin,
        title: text(row.title),
        searchTerm: text(row.searchTerm),
        excludeReason: classified.excludeReason,
        matchedTokens: classified.matchedTokens || [],
        nodeMatches: classified.nodeMatches || [],
      });
    } else {
      buckets[classified.bucket].push(classified.item);
    }
  }
  return {
    ...buckets,
    summary: {
      totalSearchResults: (searchResults || []).length,
      directCompetitors: buckets.directCompetitors.length,
      sceneCompetitors: buckets.sceneCompetitors.length,
      trafficBridgeCompetitors: buckets.trafficBridgeCompetitors.length,
      excluded: buckets.excludedAsins.length,
    },
  };
}

function candidateKeywordFromSeed(seed, searchResults = {}) {
  const matchingCompetitors = [
    ...(searchResults.directCompetitors || []),
    ...(searchResults.sceneCompetitors || []),
    ...(searchResults.trafficBridgeCompetitors || []),
  ].filter(item => lower(item.searchTerm) === lower(seed.term));
  return {
    term: seed.term,
    source: seed.source,
    evidence: [
      `seed_source=${seed.source}`,
      matchingCompetitors.length ? `front_competitor_matches=${matchingCompetitors.length}` : 'front_competitor_matches=0',
    ],
    nextCheck: ['aba_search_terms', 'keyword_conversion', 'sku_listing_fit'],
  };
}

function buildKeywordResearchReport({ input = {}, seedTerms = [], searchResults = {}, generatedAt = new Date().toISOString() } = {}) {
  const normalizedInput = normalizeResearchInput(input);
  const candidates = seedTerms.map(seed => candidateKeywordFromSeed(seed, searchResults));
  const evidenceCount = (
    (searchResults.directCompetitors || []).length +
    (searchResults.sceneCompetitors || []).length +
    (searchResults.trafficBridgeCompetitors || []).length
  );
  return {
    source: 'selection_keyword_research',
    generatedAt,
    exportedAt: generatedAt,
    input: normalizedInput,
    seedTerms,
    searchTermsUsed: seedTerms.map(item => item.term),
    directCompetitorAsins: searchResults.directCompetitors || [],
    sceneCompetitorAsins: searchResults.sceneCompetitors || [],
    trafficBridgeAsins: searchResults.trafficBridgeCompetitors || [],
    excludedAsins: searchResults.excludedAsins || [],
    candidateKeywords: candidates,
    operatorSummary: {
      summary: searchResults.summary || {},
      dataFirstBoundary: 'Every direction is a hypothesis until front-search, ABA, keyword seasonality, keyword conversion, and SKU fit evidence support it.',
      recommendedNextStep: evidenceCount > 0
        ? 'Run ABA, keyword seasonality, and keyword conversion validation before any ad action.'
        : 'No usable competitor evidence yet; expand front-search terms before testing spend.',
    },
    crossValidationPlan: [
      'selection_aba_search_terms',
      'selection_keyword_seasonality',
      'selection_keyword_conversion_rate',
      'ad_backend_customer_search_terms',
      'listing_price_inventory_fit',
    ],
    opsReadiness: {
      readyForDecisionSupport: evidenceCount > 0,
      readyForAutoAction: false,
      reason: 'keyword research is evidence generation only; ad actions require normal schema, dry-run, execution, and landing verification',
    },
  };
}

function quoteArg(value) {
  const raw = text(value);
  return `"${raw.replace(/"/g, '\\"')}"`;
}

function buildNextValidationCommands(report = {}) {
  const terms = (report.candidateKeywords || []).map(item => item.term).filter(Boolean).slice(0, 20);
  if (!terms.length) return [];
  const termArg = terms.join(', ');
  return [
    {
      label: 'validate keyword research ABA demand',
      command: `npm run ops:selection:aba-search-terms -- --search-terms ${quoteArg(termArg)}`,
      riskLevel: 'read_only',
      purpose: 'confirm demand, concentration, and supply pressure for keyword research candidates',
    },
    {
      label: 'validate keyword research seasonality',
      command: `npm run ops:selection:keyword-seasonality -- --search-terms ${quoteArg(termArg)}`,
      riskLevel: 'read_only',
      purpose: 'confirm Google Trend, market overview, competitor pressure, buyer-search expansion, and market-window risk for keyword research candidates',
    },
    {
      label: 'validate keyword research conversion economics',
      command: `npm run ops:selection:keyword-conversion -- --keywords ${quoteArg(termArg)}`,
      riskLevel: 'read_only',
      purpose: 'confirm purchase proof and CPC/CPA/ACOS ranges before spend changes',
    },
  ];
}

module.exports = {
  buildAmazonSearchUrl,
  buildKeywordResearchReport,
  buildNextValidationCommands,
  classifyAmazonSearchResults,
  deriveResearchSeedTerms,
  normalizeResearchInput,
};
