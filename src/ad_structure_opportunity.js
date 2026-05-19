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
    if (listingHasVideo(card) && !hasSbvCoverage(card)) {
      items.push({
        sku,
        asin,
        issue: 'sbv_missing_front_video',
        action: 'manual_create_sbv',
        reason: 'Amazon front listing has video evidence but current ad structure has no SBV coverage.',
        evidence: ['listingHasVideo=true', 'hasSbv=false'],
      });
    } else if (!videoStatusKnown(card) && !hasSbvCoverage(card)) {
      items.push({
        sku,
        asin,
        issue: 'front_video_check_needed',
        action: 'fetch_front_listing_video_status',
        reason: 'No SBV exists and the snapshot does not know whether the Amazon front listing has a video; queue this SKU for targeted front-page video check.',
        evidence: ['listingHasVideo=unknown', 'hasSbv=false'],
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      productsChecked: productCards.length,
      sbRecommended: items.filter(item => item.issue === 'sb_missing_three_plus_variants').length,
      sbvRecommended: items.filter(item => item.issue === 'sbv_missing_front_video').length,
      videoCheckQueued: items.filter(item => item.issue === 'front_video_check_needed').length,
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
  variantCount,
};
