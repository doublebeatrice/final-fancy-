function text(value) {
  return String(value || '').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lower(value) {
  return text(value).toLowerCase();
}

function rowLooksEnabled(row = {}) {
  const stateText = lower(row.state || row.status || row.campaignState || row.activeStatus);
  if (['enabled', 'enable', '1'].includes(stateText)) return true;
  if (num(row.state) === 1 || num(row.stateVal) === 1 || num(row.state) === 2) return true;
  return !['paused', 'pause', 'disabled', 'archived', '0'].includes(stateText);
}

function sbNameText(card = {}) {
  const parts = [];
  for (const campaign of card.campaigns || []) {
    parts.push(campaign.name, campaign.campaignName);
    if (campaign.sbCampaign) parts.push(campaign.sbCampaign.name, campaign.sbCampaign.campaignName, campaign.sbCampaign.entityType);
    for (const row of campaign.sponsoredBrands || []) {
      parts.push(row.campaignName, row.name, row.text, row.entityType);
    }
  }
  return parts.map(text).join(' ');
}

function hasSbvCoverage(card = {}) {
  const nameText = sbNameText(card);
  if (/\bsbv\b|video|视频/i.test(nameText)) {
    return (card.campaigns || []).some(campaign =>
      /\bsbv\b|video|视频/i.test([campaign.name, campaign.campaignName, campaign.sbCampaign?.name, campaign.sbCampaign?.campaignName].map(text).join(' ')) ||
      (campaign.sponsoredBrands || []).some(row => /\bsbv\b|video|视频/i.test([row.campaignName, row.name, row.text, row.entityType].map(text).join(' ')) && rowLooksEnabled(row))
    );
  }
  return false;
}

function hasSbCoverage(card = {}) {
  const coverage = card.createContext?.coverage || {};
  if (coverage.hasSbKeyword || coverage.hasSbTarget) {
    if (!hasSbvCoverage(card)) return true;
    const hasNonVideoRow = (card.campaigns || []).some(campaign =>
      (campaign.sponsoredBrands || []).some(row => !/\bsbv\b|video|视频/i.test([campaign.name, row.campaignName, row.name, row.text].map(text).join(' ')) && rowLooksEnabled(row))
    );
    if (hasNonVideoRow) return true;
  }
  return (card.campaigns || []).some(campaign => {
    const name = [campaign.name, campaign.campaignName, campaign.sbCampaign?.name, campaign.sbCampaign?.campaignName].map(text).join(' ');
    if (/\bsbv\b|video|视频/i.test(name)) return false;
    return !!campaign.sbCampaign || (campaign.sponsoredBrands || []).some(row => rowLooksEnabled(row));
  });
}

function listingHasVideo(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  if (listing.hasVideo === true || profile.hasVideo === true) return true;
  if (num(listing.videoCount || profile.videoCount) > 0) return true;
  return false;
}

function videoStatusKnown(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  return listing.hasVideo === true || listing.hasVideo === false || profile.hasVideo === true || profile.hasVideo === false || num(listing.videoCount || profile.videoCount) > 0;
}

function firstSbvAssetSource(card = {}) {
  const createContext = card.createContext || {};
  const sources = [
    card.sbvVideoAsset,
    card.sbvVideoAssetLookup,
    card.videoAsset,
    createContext.sbvVideoAsset,
    createContext.sbvVideoAssetLookup,
    createContext.sbvAsset,
    createContext.assetLibrary,
    createContext.amazonAsset,
  ].filter(Boolean);
  for (const source of sources) {
    if (source.matchedAsset) return source.matchedAsset;
    if (source.asset) return source.asset;
    return source;
  }
  return null;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function associatedAsins(source = {}) {
  const direct = [
    ...asList(source.associatedAsins),
    ...asList(source.asins),
    ...asList(source.asinArray),
    ...asList(source.asin),
    ...asList(source.ASIN),
  ];
  const parsed = [];
  const raw = source.associatedContexts || source.associated_contexts || '';
  if (raw) {
    try {
      const contexts = typeof raw === 'string' ? JSON.parse(raw) : raw;
      for (const item of contexts?.ASIN || []) parsed.push(item?.id || item?.asin || item?.name);
    } catch (_) {}
  }
  return [...direct, ...parsed].map(item => text(item).toUpperCase()).filter(Boolean);
}

function sbvVideoAssetStatus(card = {}) {
  const asin = text(card.asin).toUpperCase();
  const source = firstSbvAssetSource(card);
  if (!source) {
    return { known: false, ready: false, missing: false, reason: 'asset_lookup_not_run' };
  }

  const sourceText = lower([
    source.status,
    source.lookupStatus,
    source.reason,
    source.error,
    source.message,
  ].join(' '));
  const assetIds = [
    ...asList(source.assetId),
    ...asList(source.videoAssetId),
    ...asList(source.amazonAssetId),
    ...asList(source.assetLibraryId),
    ...asList(source.videoAssetIds),
  ].map(text).filter(Boolean);
  const rowCount = source.rowCount === undefined ? null : num(source.rowCount);
  const asins = associatedAsins(source);
  const asinMatches = !asin || !asins.length || asins.includes(asin);

  if (assetIds.length && asinMatches && !/missing|not_found|no_asset|no video/.test(sourceText)) {
    return {
      known: true,
      ready: true,
      missing: false,
      assetId: assetIds[0],
      assetName: text(source.name || source.assetName || source.fileName),
      associatedAsins: asins,
    };
  }

  if (source.matchedAsset === null || rowCount === 0 || /missing|not_found|no_asset|no video/.test(sourceText)) {
    return { known: true, ready: false, missing: true, reason: 'no_exact_asin_video_asset' };
  }

  return { known: false, ready: false, missing: false, reason: 'asset_lookup_incomplete' };
}

function groupCounts(productCards = []) {
  const counts = new Map();
  for (const card of productCards || []) {
    const key = text(card.variationGroup || card.parentAsin || card.parent_asin || card.parentSku || card.styleParent || '');
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function variantCount(card = {}, counts = new Map()) {
  const explicit = num(card.variantCount || card.variationCount || card.variationsCount || card.childCount);
  if (explicit > 0) return explicit;
  const key = text(card.variationGroup || card.parentAsin || card.parent_asin || card.parentSku || card.styleParent || '');
  return key ? num(counts.get(key)) : 1;
}

function auditAdStructureOpportunities(snapshot = {}) {
  const productCards = Array.isArray(snapshot.productCards) ? snapshot.productCards : [];
  const counts = groupCounts(productCards);
  const items = [];
  for (const card of productCards) {
    const sku = text(card.sku).toUpperCase();
    const asin = text(card.asin).toUpperCase();
    const salesChannel = text(card.salesChannel || card.site || 'Amazon.com');
    if (!sku || !asin || !/amazon\.com/i.test(salesChannel)) continue;
    const variants = variantCount(card, counts);
    if (variants >= 3 && !hasSbCoverage(card)) {
      items.push({
        sku,
        asin,
        issue: 'sb_missing_three_plus_variants',
        action: 'manual_create_sb',
        reason: 'Three or more variants under the product group can support an SB structure; current snapshot has no non-video SB coverage.',
        evidence: [`variantCount=${variants}`, 'hasSb=false'],
      });
    }
    const sbvAsset = sbvVideoAssetStatus(card);
    if (!hasSbvCoverage(card) && sbvAsset.ready) {
      items.push({
        sku,
        asin,
        issue: 'sbv_missing_video_asset_ready',
        action: 'manual_create_sbv',
        reason: 'SBV is part of the basic ad structure check, and the asset library has an exact ASIN-bound video asset; current ad structure has no SBV coverage.',
        evidence: [
          'hasSbv=false',
          `videoAssetId=${sbvAsset.assetId}`,
          sbvAsset.assetName ? `videoAssetName=${sbvAsset.assetName}` : '',
          sbvAsset.associatedAsins?.length ? `associatedAsins=${sbvAsset.associatedAsins.join(',')}` : '',
        ].filter(Boolean),
      });
    } else if (!hasSbvCoverage(card) && sbvAsset.missing) {
      items.push({
        sku,
        asin,
        issue: 'sbv_video_asset_missing',
        action: 'do_not_create_sbv',
        reason: 'No exact ASIN-bound video asset was found in the asset library, so SBV should not be created; the product may not have a video shot yet.',
        evidence: ['hasSbv=false', 'assetLookup=not_found'],
      });
    } else if (!hasSbvCoverage(card) && !sbvAsset.known) {
      items.push({
        sku,
        asin,
        issue: 'sbv_video_asset_check_needed',
        action: 'search_asset_library_by_asin',
        reason: 'No SBV exists. Search the asset library by ASIN before considering SBV; if no exact product video is found, do not create SBV.',
        evidence: [`listingHasVideo=${listingHasVideo(card) ? 'true' : (videoStatusKnown(card) ? 'false' : 'unknown')}`, 'hasSbv=false', 'assetLookup=needed'],
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      productsChecked: productCards.length,
      sbRecommended: items.filter(item => item.issue === 'sb_missing_three_plus_variants').length,
      sbvRecommended: items.filter(item => item.issue === 'sbv_missing_video_asset_ready').length,
      sbvVideoMissing: items.filter(item => item.issue === 'sbv_video_asset_missing').length,
      videoCheckQueued: items.filter(item => item.issue === 'sbv_video_asset_check_needed').length,
      totalItems: items.length,
    },
    items,
  };
}

module.exports = {
  auditAdStructureOpportunities,
  hasSbCoverage,
  hasSbvCoverage,
  listingHasVideo,
  sbvVideoAssetStatus,
  variantCount,
};
