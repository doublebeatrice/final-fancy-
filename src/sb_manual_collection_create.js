function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKeyword(item, defaults = {}) {
  if (typeof item === 'string') {
    return {
      keywordText: text(item),
      matchType: text(defaults.matchType || 'BROAD').toUpperCase(),
      bid: num(defaults.defaultBid, 0),
      coreMark: null,
    };
  }
  return {
    keywordText: text(item.keywordText || item.keyword),
    matchType: text(item.matchType || defaults.matchType || 'BROAD').toUpperCase(),
    bid: num(item.bid ?? defaults.defaultBid, 0),
    coreMark: item.coreMark ?? null,
  };
}

function validatePlan(plan = {}) {
  const errors = [];
  if (!num(plan.accountId)) errors.push('accountId is required');
  if (!num(plan.siteId)) errors.push('siteId is required');
  if (!text(plan.brandEntityId || plan.brand)) errors.push('brandEntityId is required');
  if (!text(plan.brandName)) errors.push('brandName is required');
  if (!text(plan.campaignName)) errors.push('campaignName is required');
  if (!text(plan.startDate)) errors.push('startDate is required');
  if (!num(plan.budget ?? plan.dailyBudget)) errors.push('budget is required');
  if (!text(plan.brandLogoAssetID || plan.brandLogoAssetId)) errors.push('brandLogoAssetID is required (SB product collection ad needs a brand logo, else the campaign lands INCOMPLETE)');

  if (text(plan.brandName).length > 30) errors.push(`brandName must be <= 30 chars; got ${text(plan.brandName).length}`);

  const titleType = text(plan.titleType || (text(plan.headline || plan.title) ? 'CUSTOM' : 'AUTO')).toUpperCase();
  if (!['AUTO', 'STANDARD', 'CUSTOM'].includes(titleType)) errors.push(`unsupported titleType: ${titleType}`);
  if (titleType === 'CUSTOM') {
    const headline = text(plan.headline || plan.title);
    if (!headline) errors.push('headline is required when titleType is CUSTOM');
    else if (headline.length > 32) errors.push(`custom headline must be <= 32 chars (Amazon AD_CREATIVE limit); got ${headline.length}: "${headline}"`);
    else if (!/^[A-Za-z0-9一-龥\s.,!?'"\-]+$/.test(headline)) errors.push('headline may only contain letters/digits/Chinese/space and . , ! ? \' " -');
  }

  const products = Array.isArray(plan.products) ? plan.products : [];
  const asins = products.map(item => text(item.asin)).filter(Boolean);
  if (asins.length < 3) errors.push('at least 3 products with asin are required');

  const keywords = Array.isArray(plan.keywords) ? plan.keywords.map(item => normalizeKeyword(item, plan)) : [];
  if (!keywords.length) errors.push('keywords are required');
  for (const keyword of keywords) {
    if (!keyword.keywordText) errors.push('keywordText is required');
    if (!['BROAD', 'PHRASE', 'EXACT'].includes(keyword.matchType)) errors.push(`unsupported matchType: ${keyword.matchType}`);
    if (!keyword.bid) errors.push(`bid is required for keyword: ${keyword.keywordText || '(blank)'}`);
  }

  return { ok: errors.length === 0, errors };
}

function buildSbManualCollectionKeywordPayload(plan = {}) {
  const validation = validatePlan(plan);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const accountId = num(plan.accountId);
  const siteId = num(plan.siteId);
  const brand = text(plan.brandEntityId || plan.brand);
  const brandName = text(plan.brandName);
  const campaignName = text(plan.campaignName);
  const groupName = text(plan.groupName || plan.campaignName);
  const startDate = text(plan.startDate);
  const budget = num(plan.budget ?? plan.dailyBudget);
  const products = plan.products.map(item => ({
    sku: text(item.sku),
    asin: text(item.asin),
  }));
  const keywords = plan.keywords.map(item => normalizeKeyword(item, plan));
  const asins = products.map(item => item.asin);
  const skus = products.map(item => item.sku).filter(Boolean);

  const brandLogoAssetID = text(plan.brandLogoAssetID || plan.brandLogoAssetId);
  const brandLogoCrop = plan.brandLogoCrop && typeof plan.brandLogoCrop === 'object'
    ? plan.brandLogoCrop
    : { top: 0, left: 0, width: 400, height: 400 };
  const headline = text(plan.headline || plan.title);
  const titleType = text(plan.titleType || (headline ? 'CUSTOM' : 'AUTO')).toUpperCase();

  const payload = {
    createType: 'campaign',
    advType: 'SB',
    targetType: 'keyword',
    siteId,
    accountId,
    campaignName,
    groupName,
    startDate,
    budgetType: 'DAILY',
    budget,
    dailyBudget: budget,
    brand,
    brandName,
    goal: 'PAGE_VISIT',
    costType: 'CPC',
    adFormat: 'manualCollection',
    landingType: 2,
    landingPageUrl: '',
    asinArray: asins,
    skuArray: skus,
    bidTopOfSearch: num(plan.bidTopOfSearch, 0),
    bidRestOfSearch: num(plan.bidRestOfSearch, 0),
    customBidPercentage: num(plan.customBidPercentage, 0),
    fieldArray: {
      campaigns: [{
        budgetType: 'DAILY',
        brandEntityId: brand,
        endDate: text(plan.endDate),
        name: campaignName,
        startDate,
        budget,
        bidding: {
          bidOptimization: false,
          bidAdjustmentsByPlacement: [
            { percentage: num(plan.bidTopOfSearch, 0), placement: 'TOP_OF_SEARCH' },
            { percentage: num(plan.bidRestOfSearch, 0), placement: 'OTHER' },
          ],
        },
      }],
      keyword: keywords.map(keyword => ({
        keywordText: keyword.keywordText,
        matchType: keyword.matchType,
        bid: keyword.bid,
        coreMark: keyword.coreMark,
      })),
      negativeKeywords: [],
      ads: [{
        name: text(plan.adName || groupName),
        creative: {
          asins,
          brandName,
          brandLogoAssetID,
          brandLogoCrop,
          ...(titleType !== 'AUTO' && headline ? { title: headline } : {}),
          landingPage: { pageType: 'PRODUCT_LIST', url: '' },
        },
      }],
    },
  };

  return {
    ok: true,
    requestUrl: '/campaignSb/createCampaignBeta',
    requestBody: payload,
  };
}

module.exports = {
  buildSbManualCollectionKeywordPayload,
  normalizeKeyword,
  validatePlan,
};
