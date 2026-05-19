function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clean(value) {
  return text(value).toLowerCase();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

const STOP_WORDS = new Set([
  'for',
  'and',
  'the',
  'with',
  'from',
  'your',
  'men',
  'women',
  'gift',
  'gifts',
  'party',
]);

const SOURCE_LABELS = {
  keyword: 'keyword',
  pt: 'product_targeting',
  auto: 'auto',
};

function tokens(value) {
  return clean(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function keywordText(row = {}) {
  return text(
    row.keywordText ||
    row.keyword ||
    row.searchTerm ||
    row.customerSearchTerm ||
    row.search_term ||
    row.targetText ||
    row.targetingText ||
    row.target ||
    row.expression ||
    row.query ||
    row.inputText ||
    row.term ||
    row.asin ||
    row.ASIN
  );
}

function promotableSearchTermText(row = {}) {
  return text(
    row.keywordText ||
    row.keyword ||
    row.searchTerm ||
    row.customerSearchTerm ||
    row.search_term ||
    row.query ||
    row.inputText ||
    row.term
  );
}

function displayTextForSource(row = {}, source = 'keyword') {
  const promotableTerm = promotableSearchTermText(row);
  if (promotableTerm) return promotableTerm;
  if (source === 'pt') return text(row.targetText || row.targetingText || row.target || row.expression || row.asin || row.ASIN);
  if (source === 'auto') return text(row.type || row.targetType || row.expression || 'auto');
  return keywordText(row);
}

function productTitle(row = {}) {
  return text(row.productTitle || row.title || row.listingTitle || row.product_name || row.productName);
}

function rowMetrics(row = {}) {
  const spend = num(row.Spend ?? row.spend);
  const orders = num(row.Orders ?? row.orders ?? row.spTotalOrder ?? row.orderNum ?? row.order_num);
  const sales = num(row.Sales ?? row.sales ?? row.spTotalSales ?? row.orderSales ?? row.order_sales);
  const clicks = num(row.Clicks ?? row.clicks ?? row.spTotalClick ?? row.clickNum ?? row.click_num);
  const cpc = num(row.CPC ?? row.cpc, clicks > 0 ? spend / clicks : 0);
  const acos = num(row.ACOS ?? row.acos, sales > 0 ? spend / sales : 0);
  return {
    spend: round(spend),
    orders,
    sales: round(sales),
    clicks,
    cpc: round(cpc),
    acos: round(acos, 4),
  };
}

function seedText(product = {}, probe = {}) {
  return [
    product.title,
    product.listingTitle,
    product.productType,
    product.positioning,
    probe.query,
    ...(product.marketProbeTerms || []),
    ...(product.keywordSeeds || []),
    ...(product.createContext?.keywordSeeds || []),
    ...(product.productProfile?.productTypes || []),
    ...(product.productProfile?.targetAudience || []),
    ...(product.productProfile?.occasion || []),
  ].filter(Boolean).join(' ');
}

function scoreTermIntent(term, product = {}, probe = {}) {
  const queryTokens = tokens(seedText(product, probe));
  const termTokens = tokens(term);
  if (!queryTokens.length || !termTokens.length) return 0;
  const querySet = new Set(queryTokens);
  const overlap = termTokens.filter(token => querySet.has(token)).length;
  return round(overlap / Math.max(1, termTokens.length), 3);
}

function scoreProductSimilarity(candidate = {}, product = {}, probe = {}) {
  const seed = unique(tokens(seedText(product, probe)));
  const candidateTokens = new Set(tokens([
    productTitle(candidate),
    candidate.asin,
    candidate.sku,
  ].filter(Boolean).join(' ')));
  if (!seed.length || !candidateTokens.size) return 0;
  const overlap = seed.filter(token => candidateTokens.has(token));
  let score = overlap.length / Math.max(1, seed.length);
  const hasBucket = candidateTokens.has('bucket');
  const hasHat = candidateTokens.has('hat');
  const hasFlag = candidateTokens.has('flag') || candidateTokens.has('usa') || candidateTokens.has('american');
  if (hasBucket && hasHat) score += 0.22;
  else if (hasHat) score += 0.12;
  if (hasFlag) score += 0.08;
  return round(Math.min(1, score), 3);
}

function classifyTotalCompetition(total = {}) {
  const metrics = rowMetrics(total);
  const marketScale = metrics.spend >= 100 || metrics.orders >= 10 || metrics.clicks >= 150
    ? 'high'
    : (metrics.spend >= 25 || metrics.orders >= 3 || metrics.clicks >= 50 ? 'medium' : 'low');
  const bidPressure = metrics.cpc >= 0.65 || metrics.acos >= 0.5
    ? 'high'
    : (metrics.cpc >= 0.4 || metrics.acos >= 0.3 ? 'medium' : 'low');
  const evidence = [
    `totalSpend=${metrics.spend.toFixed(2)}`,
    `totalOrders=${metrics.orders}`,
    `avgCpc=${metrics.cpc.toFixed(2)}`,
    `acos=${metrics.acos.toFixed(4)}`,
    `marketScale=${marketScale}`,
    `bidPressure=${bidPressure}`,
  ];
  if (marketScale === 'high' || bidPressure === 'high') {
    return { level: 'high', marketScale, bidPressure, evidence };
  }
  if (marketScale === 'medium' || bidPressure === 'medium') {
    return { level: 'medium', marketScale, bidPressure, evidence };
  }
  return { level: 'low', marketScale, bidPressure, evidence };
}

function classifyKeywordCompetition(metrics) {
  if (metrics.cpc >= 0.8 || metrics.acos >= 0.8 || (metrics.spend >= 25 && metrics.orders <= 1)) return 'high';
  if (metrics.cpc >= 0.45 || metrics.spend >= 20 || metrics.acos >= 0.35) return 'medium';
  return 'low';
}

function normalizeSource(source) {
  const value = clean(source);
  if (value === 'pt' || value === 'target' || value === 'targeting' || value === 'product_targeting') return 'pt';
  if (value === 'auto' || value === 'automatic') return 'auto';
  return 'keyword';
}

function trafficSource(row = {}) {
  return normalizeSource(row.__source || row.source || row.isPtAuto || row.trafficSource);
}

function decorateRows(rows, source) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => ({
    ...row,
    __source: normalizeSource(row.__source || row.source || row.isPtAuto || row.trafficSource || source),
  }));
}

function collectProbeRows(probe = {}) {
  return [
    ...decorateRows(probe.keywordRows, 'keyword'),
    ...decorateRows(probe.ptRows, 'pt'),
    ...decorateRows(probe.autoRows, 'auto'),
    ...decorateRows(probe.rows, 'keyword'),
  ];
}

function classifyCompetitionBySource(probe = {}) {
  const totals = probe.sourceTotals || {};
  const result = {};
  for (const source of ['keyword', 'pt', 'auto']) {
    const sourceTotal = totals[source] || probe[`${source}Total`] || probe[`${source}Totals`];
    if (sourceTotal && Object.keys(sourceTotal).length) {
      result[source] = classifyTotalCompetition(sourceTotal);
    }
  }
  return result;
}

function hasSharedProductClass(term, product = {}, probe = {}) {
  const seed = new Set(tokens(seedText(product, probe)));
  const termSet = new Set(tokens(term));
  const classTokens = ['hat', 'bucket', 'cap', 'shirt', 'bag', 'tumbler', 'cup', 'banner', 'decorations'];
  return classTokens.some(token => seed.has(token) && termSet.has(token));
}

function affordableCpc(product = {}) {
  const price = num(product.price || product.listing?.price);
  const conversionRate = num(product.estimatedConversionRate, 0.07);
  const targetAcos = num(product.targetAcos, product.profitRate ? Math.min(0.25, num(product.profitRate) * 0.9) : 0.22);
  return round(price * conversionRate * targetAcos);
}

function suggestedBidFor(recommendation, metrics, model) {
  const internalCpc = metrics.cpc || model.affordableCpc;
  if (recommendation === 'direct_reference') {
    return round(Math.max(0.05, Math.min(internalCpc * 0.85, model.affordableCpc * 0.9)));
  }
  if (recommendation === 'low_bid_test') {
    return round(Math.max(0.05, Math.min(internalCpc * 0.6, model.affordableCpc * 0.65)));
  }
  return null;
}

function suggestedMatchTypeFor(source, recommendation) {
  if (source === 'pt') {
    return recommendation === 'direct_reference' || recommendation === 'low_bid_test'
      ? 'PRODUCT_TARGET'
      : '';
  }
  if (source === 'auto') {
    return recommendation === 'direct_reference' || recommendation === 'low_bid_test'
      ? 'PHRASE'
      : '';
  }
  if (recommendation === 'direct_reference') return 'EXACT_AND_PHRASE';
  if (recommendation === 'low_bid_test') return 'PHRASE';
  return '';
}

function decideKeyword(row, product, probe, model) {
  const source = trafficSource(row);
  const keyword = displayTextForSource(row, source);
  const hasPromotableTerm = source !== 'auto' || !!promotableSearchTermText(row);
  const metrics = rowMetrics(row);
  const productSimilarity = scoreProductSimilarity(row, product, probe);
  const termIntent = scoreTermIntent(keyword, product, probe);
  const competitionLevel = classifyKeywordCompetition(metrics);
  const targetAcos = num(product.targetAcos, 0.22);
  const acceptableAcos = metrics.orders > 0 && metrics.acos > 0 && metrics.acos <= targetAcos * 1.35;
  const similarConverted = productSimilarity >= 0.62 && metrics.orders > 0;
  const sharedProductClass = hasSharedProductClass(keyword, product, probe);
  let recommendation = 'observe_only';
  let reason = 'insufficient internal proof';

  if (source === 'auto' && !hasPromotableTerm && metrics.orders > 0) {
    recommendation = 'market_signal_only';
    reason = 'auto target converted, but no promotable search term was returned';
  } else if (similarConverted && acceptableAcos) {
    recommendation = 'direct_reference';
    reason = 'similar internal product converted with acceptable ACOS';
  } else if (metrics.orders > 0 && termIntent >= 0.45 && (productSimilarity >= 0.34 || sharedProductClass)) {
    recommendation = 'low_bid_test';
    reason = competitionLevel === 'high'
      ? 'internal orders exist but competition is high'
      : 'internal orders exist but product similarity is not strong enough';
  } else if (metrics.orders > 0) {
    recommendation = 'market_signal_only';
    reason = 'internal market exists, but converted product is not similar enough';
  } else if (metrics.spend >= 8 || metrics.clicks >= 15) {
    recommendation = 'avoid_or_negative';
    reason = 'internal spend/clicks did not produce orders';
  }

  if ((recommendation === 'direct_reference' || recommendation === 'low_bid_test') && source === 'pt') {
    reason = `${reason}; product targeting source`;
  }
  if ((recommendation === 'direct_reference' || recommendation === 'low_bid_test') && source === 'auto') {
    reason = `${reason}; auto group search term should be promoted cautiously`;
  }

  const suggestedBid = suggestedBidFor(recommendation, metrics, model);
  return {
    keyword,
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    sku: text(row.sku),
    asin: text(row.asin || row.ASIN),
    productTitle: productTitle(row),
    metrics,
    productSimilarity,
    termIntent,
    competitionLevel,
    recommendation,
    canReference: recommendation === 'direct_reference' || recommendation === 'low_bid_test',
    suggestedMatchType: suggestedMatchTypeFor(source, recommendation),
    suggestedBid,
    reason,
  };
}

function collectSimilarProducts(rows = [], product = {}, probe = {}) {
  const byKey = new Map();
  for (const row of rows) {
    const metrics = rowMetrics(row);
    const similarity = scoreProductSimilarity(row, product, probe);
    if (similarity < 0.62 || metrics.orders <= 0) continue;
    const key = text(row.sku || row.asin || productTitle(row));
    if (!key) continue;
    const existing = byKey.get(key);
    const item = {
      sku: text(row.sku),
      asin: text(row.asin || row.ASIN),
      title: productTitle(row),
      similarity,
      orders: metrics.orders,
      spend: metrics.spend,
      sales: metrics.sales,
    };
    if (!existing || item.orders > existing.orders || item.similarity > existing.similarity) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => b.similarity - a.similarity || b.orders - a.orders);
}

function analyzeInternalKeywordMarket({ product = {}, probe = {} } = {}) {
  const model = {
    price: num(product.price || product.listing?.price),
    estimatedConversionRate: num(product.estimatedConversionRate, 0.07),
    targetAcos: num(product.targetAcos, product.profitRate ? Math.min(0.25, num(product.profitRate) * 0.9) : 0.22),
    affordableCpc: affordableCpc(product),
  };
  const keywordRows = collectProbeRows(probe);
  const asinRows = Array.isArray(probe.asinRows) ? probe.asinRows : [];
  const keywordDecisions = keywordRows
    .map(row => decideKeyword(row, product, probe, model))
    .sort((a, b) => {
      const rank = { direct_reference: 0, low_bid_test: 1, market_signal_only: 2, avoid_or_negative: 3, observe_only: 4 };
      return (rank[a.recommendation] ?? 9) - (rank[b.recommendation] ?? 9) ||
        b.metrics.orders - a.metrics.orders ||
        b.metrics.spend - a.metrics.spend;
    });
  const similarProducts = collectSimilarProducts(asinRows, product, probe);
  const referenceKeywords = keywordDecisions.filter(item => item.canReference && item.source !== 'pt');
  const referenceTargets = keywordDecisions.filter(item => item.canReference && item.source === 'pt');
  const sourceSummary = ['keyword', 'pt', 'auto']
    .filter(source => keywordDecisions.some(item => item.source === source))
    .join('/');
  const reusableCount = referenceKeywords.length + referenceTargets.length;

  return {
    query: text(probe.query),
    sku: text(product.sku),
    asin: text(product.asin),
    competition: classifyTotalCompetition(probe.total || {}),
    competitionBySource: classifyCompetitionBySource(probe),
    bidModel: model,
    similarProducts,
    keywordDecisions,
    referenceKeywords,
    referenceTargets,
    operatorTakeaway: reusableCount
      ? `Use the internal market as proof, not a raw keyword list: ${reusableCount} items can be referenced after similarity and CPC checks${sourceSummary ? ` across ${sourceSummary}` : ''}.`
      : 'The internal market did not prove a reusable keyword yet; keep this query as market context only.',
  };
}

module.exports = {
  analyzeInternalKeywordMarket,
  scoreProductSimilarity,
  scoreTermIntent,
};
