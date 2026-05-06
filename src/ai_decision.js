const fs = require('fs');
const path = require('path');
const { scoreTermRelevance } = require('./product_profile');
const {
  assessAdOperatingContext,
  currentAdReadinessEvidence,
  formatCurrentAdReadiness,
  lifecycleSeasonEvidence,
} = require('./inventory_economics');

const EXECUTABLE_ACTION_SOURCES = new Set(['codex', 'manual']);
const ACCEPTED_ACTION_SOURCES = new Set([
  ...EXECUTABLE_ACTION_SOURCES,
  'ai_approved',
  'manual_approved',
  'strategy',
  'sp_7day_untouched',
  'sb_7day_untouched',
  'generator_candidate',
  'rule_generator',
  'bugfix_cleanup',
]);
const CRITICAL_REVIEW_RISKS = new Set([
  'manual_review',
  'image_review_required',
  'traffic_push',
  'non_codex_source',
  'large_budget_change',
  'overseason_page_hold',
  'large_placement_change',
  'invalid_placement',
  'high_volume_guard',
  'marginal_profit_review',
]);

const HIGH_VOLUME_BID_CHANGE_REVIEW_THRESHOLD = 0.15;
const NORMAL_BID_CHANGE_REVIEW_THRESHOLD = 0.25;

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSourceList(source) {
  if (Array.isArray(source)) return [...new Set(source.filter(Boolean).map(String))];
  if (!source) return [];
  return [String(source)];
}

function normalizeActionSources(source, fallback = ['codex']) {
  const normalized = normalizeSourceList(source)
    .map(item => item.trim())
    .filter(item => ACCEPTED_ACTION_SOURCES.has(item));
  if (normalized.length) return [...new Set(normalized)];
  return normalizeSourceList(fallback).filter(item => ACCEPTED_ACTION_SOURCES.has(item));
}

function isCandidateDecision(action = {}) {
  const stage = normalizeText(action.decisionStage).toLowerCase();
  const approvedBy = normalizeText(action.approvedBy).toLowerCase();
  const approved = ['ai_approved', 'manual_approved'].includes(stage) &&
    ['codex', 'manual'].includes(approvedBy);
  return !approved && (
    stage === 'candidate' ||
    action.requiresAiDecision === true ||
    !!action.candidateActionType
  );
}

function executionApprovalFailures(action = {}) {
  if (!action || action.actionType === 'review' || action.actionType === 'structure_fix') return [];
  const failures = [];
  const stage = normalizeText(action.decisionStage).toLowerCase();
  const approvedBy = normalizeText(action.approvedBy).toLowerCase();
  const sources = normalizeActionSources(action.actionSource, []).map(source => source.toLowerCase());
  const candidateSource = normalizeText(action.candidateSource).toLowerCase();
  const source = normalizeText(action.source).toLowerCase();

  if (!['ai_approved', 'manual_approved'].includes(stage)) failures.push('decisionStage_not_approved');
  if (!['codex', 'manual'].includes(approvedBy)) failures.push('approvedBy_not_codex_or_manual');
  if (!sources.some(item => item === 'codex' || item === 'manual')) failures.push('actionSource_missing_codex_or_manual');
  if (action.requiresAiDecision === true) failures.push('requiresAiDecision_true');
  if (candidateSource === 'rule_generator') failures.push('candidateSource_rule_generator');
  if (source === 'provisional_local_policy' || source === 'provisional_local_ai_policy') failures.push('source_provisional_local_policy');

  return failures;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqStrings(list) {
  return [...new Set((list || []).map(item => normalizeText(item)).filter(Boolean))];
}

function summarizeListing(listing) {
  if (!listing || typeof listing !== 'object') return null;
  const bullets = uniqStrings(Array.isArray(listing.bullets) ? listing.bullets : []).slice(0, 8);
  const breadcrumbs = uniqStrings(Array.isArray(listing.breadcrumbs) ? listing.breadcrumbs : []).slice(0, 6);
  const imageUrls = uniqStrings(Array.isArray(listing.imageUrls) ? listing.imageUrls : []);
  return {
    title: normalizeText(listing.title),
    brand: normalizeText(listing.brand),
    bullets,
    bulletHighlights: bullets.slice(0, 4),
    description: normalizeText(listing.description),
    aPlusText: normalizeText(listing.aPlusText),
    breadcrumbs,
    categoryPath: breadcrumbs.join(' > '),
    variationText: normalizeText(listing.variationText),
    mainImageUrl: normalizeText(listing.mainImageUrl),
    imageUrls,
    imageCount: imageUrls.length,
    hasImages: imageUrls.length > 0,
    hasAPlus: !!normalizeText(listing.aPlusText),
    isAvailable: listing.isAvailable === true,
    price: toNum(listing.price),
    reviewCount: toNum(listing.reviewCount),
    reviewRating: toNum(listing.reviewRating),
    hasPrime: listing.hasPrime === true,
    bsr: Array.isArray(listing.bsr) ? listing.bsr.slice(0, 5) : [],
    fetchedAt: listing.fetchedAt || null,
  };
}

function summarizeProductProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    version: profile.version || null,
    source: profile.source || '',
    signature: profile.signature || '',
    stale: profile.stale === true,
    productType: normalizeText(profile.productType),
    productTypes: uniqStrings(Array.isArray(profile.productTypes) ? profile.productTypes : []).slice(0, 8),
    targetAudience: uniqStrings(Array.isArray(profile.targetAudience) ? profile.targetAudience : []).slice(0, 8),
    occasion: uniqStrings(Array.isArray(profile.occasion) ? profile.occasion : []).slice(0, 8),
    seasonality: uniqStrings(Array.isArray(profile.seasonality) ? profile.seasonality : []).slice(0, 4),
    visualTheme: uniqStrings(Array.isArray(profile.visualTheme) ? profile.visualTheme : []).slice(0, 18),
    positioning: normalizeText(profile.positioning),
    categoryPath: normalizeText(profile.categoryPath),
    hasImages: profile.hasImages === true,
    imageCount: toNum(profile.imageCount),
    mainImageUrl: normalizeText(profile.mainImageUrl),
    confidence: toNum(profile.confidence),
    needsImageUnderstanding: profile.needsImageUnderstanding === true,
    imageUnderstandingAt: profile.imageUnderstandingAt || null,
    generatedAt: profile.generatedAt || null,
  };
}

function parsePlacementPercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  const afterColon = text.includes(':') ? text.split(':').pop() : text;
  return toNum(afterColon);
}

function actionBaselineQuality(action) {
  const warnings = [];
  if (action.actionType === 'bid' && (!Number.isFinite(action.currentBid) || action.currentBid <= 0)) {
    warnings.push('missing_current_bid');
  }
  if (action.actionType === 'budget' && (!Number.isFinite(action.currentBudget) || action.currentBudget <= 0)) {
    warnings.push('missing_current_budget');
  }
  if (action.actionType === 'placement' && !Number.isFinite(action.currentPlacementPercent)) {
    warnings.push('missing_current_placement');
  }
  if (!Array.isArray(action.evidence) || !action.evidence.length) warnings.push('missing_evidence');
  return {
    level: warnings.length ? 'incomplete' : 'complete',
    warnings,
  };
}

function inferExpectedEffect(action) {
  if (action.expectedEffect && typeof action.expectedEffect === 'object') return action.expectedEffect;
  const direction = action.direction || '';
  if (action.actionType === 'budget') {
    return direction === 'up'
      ? { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' }
      : { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
  }
  if (action.actionType === 'placement') {
    return { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' };
  }
  if (action.actionType === 'bid') {
    return direction === 'up'
      ? { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' }
      : { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
  }
  if (action.actionType === 'enable' || action.actionType === 'create') {
    return { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' };
  }
  if (action.actionType === 'pause') {
    return { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
  }
  return { effect: 'review' };
}

function buildLearningContext(product, entity, action, rawAction = {}) {
  const quality = actionBaselineQuality(action);
  return {
    enabled: true,
    hypothesis: normalizeText(rawAction.hypothesis || action.hypothesis || action.reason),
    expectedEffect: inferExpectedEffect({ ...action, expectedEffect: rawAction.expectedEffect }),
    measurementWindowDays: Array.isArray(rawAction.measurementWindowDays)
      ? rawAction.measurementWindowDays
      : [1, 3, 7, 14, 30],
    baselineQuality: quality.level,
    dataQualityWarnings: quality.warnings,
    baseline: {
      sku: product?.sku || action.sku || '',
      asin: product?.asin || '',
      entityType: action.entityType,
      entityId: action.id,
      currentBid: Number.isFinite(action.currentBid) ? action.currentBid : null,
      suggestedBid: Number.isFinite(action.suggestedBid) ? action.suggestedBid : null,
      currentBudget: Number.isFinite(action.currentBudget) ? action.currentBudget : null,
      suggestedBudget: Number.isFinite(action.suggestedBudget) ? action.suggestedBudget : null,
      placementKey: action.placementKey || '',
      currentPlacementPercent: Number.isFinite(action.currentPlacementPercent) ? action.currentPlacementPercent : null,
      suggestedPlacementPercent: Number.isFinite(action.suggestedPlacementPercent) ? action.suggestedPlacementPercent : null,
      profitRate: toNum(product?.profitRate),
      invDays: toNum(product?.invDays),
      opendate: product?.opendate || '',
      fuldate: product?.fuldate || '',
      price: toNum(product?.price),
      unitsSold_7d: toNum(product?.unitsSold_7d),
      unitsSold_30d: toNum(product?.unitsSold_30d),
      lifecycleSeason: product?.lifecycleSeason || null,
      lifecycleSeasonEvidence: lifecycleSeasonEvidence(product?.lifecycleSeason || {}),
      adDependency: toNum(product?.adDependency),
      listingSessions: product?.listingSessions || {},
      listingConversionRates: product?.listingConversionRates || {},
      productChart: product?.productChart || null,
      adStats: product?.adStats || {},
      sbStats: product?.sbStats || {},
      listingFetch: product?.listing ? {
        hasListing: true,
        isAvailable: product.listing.isAvailable,
        hasImages: product.listing.hasImages,
        imageCount: product.listing.imageCount,
        fetchedAt: product.listing.fetchedAt,
      } : { hasListing: false },
      entityStats7d: entity?.stats7d || {},
      entityStats30d: entity?.stats30d || {},
    },
    confounders: uniqStrings([
      ...(Array.isArray(rawAction.confounders) ? rawAction.confounders : []),
      product?.listing ? '' : 'listing_missing',
      product?.lifecycleSeason?.seasonPhase === 'offseason_or_wait' ? 'season_window_not_current' : '',
      product?.lifecycleSeason?.spendWithoutLearning ? 'recent_spend_without_learning' : '',
      quality.warnings.length ? `baseline_${quality.level}` : '',
    ]),
  };
}

function hasCriticalReviewRisk(action) {
  const text = `${action.riskLevel || ''} ${action.reason || ''}`;
  if (CRITICAL_REVIEW_RISKS.has(action.riskLevel)) return true;
  return [...CRITICAL_REVIEW_RISKS].some(risk => text.includes(risk));
}

function buildVerificationSpec(action) {
  const entityType = String(action?.entityType || '');
  const actionType = String(action?.actionType || '');

  if (actionType === 'review' || actionType === 'structure_fix') return null;

  if (actionType === 'bid') {
    const source = {
      keyword: 'kwRows',
      autoTarget: 'autoRows',
      manualTarget: 'targetRows',
      sbKeyword: 'sbRows',
      sbTarget: 'sbRows',
    }[entityType];
    if (!source || !Number.isFinite(toNum(action?.suggestedBid))) return null;
    return {
      verifySource: source,
      verifyField: 'bid',
      expected: {
        type: 'number',
        sourceField: 'suggestedBid',
        value: toNum(action.suggestedBid),
      },
    };
  }

  if (actionType === 'enable' || actionType === 'pause') {
    const source = {
      campaign: 'campaignRows',
      keyword: 'kwRows',
      autoTarget: 'autoRows',
      manualTarget: 'targetRows',
      productAd: 'productAdRows',
      sbKeyword: 'sbRows',
      sbTarget: 'sbRows',
      sbCampaign: 'sbCampaignRows',
    }[entityType];
    if (!source) return null;
    return {
      verifySource: source,
      verifyField: 'state',
      expected: {
        type: 'enum',
        sourceField: 'actionType',
        value: actionType === 'enable' ? 'enabled' : 'paused',
      },
    };
  }

  if (actionType === 'budget') {
    if (!Number.isFinite(toNum(action?.suggestedBudget))) return null;
    return {
      verifySource: entityType === 'sbCampaign' ? 'sbCampaignRows' : 'campaignRows',
      verifyField: 'budget',
      expected: {
        type: 'number',
        sourceField: 'suggestedBudget',
        value: toNum(action.suggestedBudget),
      },
    };
  }

  if (actionType === 'placement') {
    if (!action?.placementKey || !Number.isFinite(toNum(action?.suggestedPlacementPercent))) return null;
    return {
      verifySource: 'campaignRows',
      verifyField: action.placementKey,
      expected: {
        type: 'number',
        sourceField: 'suggestedPlacementPercent',
        value: toNum(action.suggestedPlacementPercent),
      },
    };
  }

  if (actionType === 'create') {
    return {
      verifySource: 'campaignRows',
      verifyField: 'campaignId',
      expected: {
        type: 'created_entity',
        sourceField: 'apiResult.campaignId',
        value: 'created_campaign_visible_or_pending_visibility',
      },
    };
  }

  return null;
}

function hasRequiredVerification(action) {
  if (!action || action.actionType === 'review' || action.actionType === 'structure_fix') return true;
  return !!(
    action.verifySource &&
    action.verifyField &&
    action.expected &&
    action.expected.value !== undefined &&
    action.expected.value !== null &&
    action.expected.value !== ''
  );
}

function detectCardEntities(card) {
  const campaigns = Array.isArray(card?.campaigns) ? card.campaigns : [];
  const spCampaigns = [];
  const keywords = [];
  const autoTargets = [];
  const productAds = [];
  const sbCampaigns = [];
  const sponsoredBrands = [];

  for (const campaign of campaigns) {
    if (campaign.campaignId && ((campaign.keywords || []).length || (campaign.autoTargets || []).length || (campaign.productAds || []).length)) {
      spCampaigns.push({
        id: String(campaign.campaignId || ''),
        entityType: 'campaign',
        campaignId: String(campaign.campaignId || ''),
        adGroupId: String(campaign.adGroupId || ''),
        accountId: campaign.accountId || '',
        siteId: campaign.siteId || 4,
        campaignName: campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        currentBid: null,
        currentBudget: toNum(campaign.budget),
        placementTop: parsePlacementPercent(campaign.placementTop),
        placementProductPage: parsePlacementPercent(campaign.placementProductPage ?? campaign.placementPage),
        placementRestOfSearch: parsePlacementPercent(campaign.placementRestOfSearch),
        state: campaign.state || campaign.status || '',
        campaignState: campaign.campaignState || campaign.state || campaign.status || '',
        groupState: campaign.groupState || '',
      });
    }
    for (const keyword of campaign.keywords || []) {
      keywords.push({
        id: String(keyword.id || ''),
        entityType: 'keyword',
        text: keyword.text || '',
        label: keyword.text || '',
        campaignName: campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        matchType: keyword.matchType || '',
        currentBid: toNum(keyword.bid),
        state: keyword.state || keyword.status || '',
        campaignState: keyword.campaignState || campaign.campaignState || campaign.state || '',
        groupState: keyword.groupState || campaign.groupState || '',
        onCooldown: !!keyword.onCooldown,
        stats3d: keyword.stats3d || {},
        stats7d: keyword.stats7d || {},
        stats30d: keyword.stats30d || {},
      });
    }
    for (const target of campaign.autoTargets || []) {
      autoTargets.push({
        id: String(target.id || ''),
        entityType: target.targetType === 'manual' ? 'manualTarget' : 'autoTarget',
        targetType: target.targetType || '',
        text: target.text || target.targetText || target.targetingExpression || target.targetType || '',
        label: target.text || target.targetText || target.targetingExpression || target.targetType || '',
        campaignName: campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        currentBid: toNum(target.bid),
        state: target.state || target.status || '',
        campaignState: target.campaignState || campaign.campaignState || campaign.state || '',
        groupState: target.groupState || campaign.groupState || '',
        onCooldown: !!target.onCooldown,
        stats3d: target.stats3d || {},
        stats7d: target.stats7d || {},
        stats30d: target.stats30d || {},
      });
    }
    for (const ad of campaign.productAds || []) {
      productAds.push({
        id: String(ad.id || ''),
        entityType: 'productAd',
        text: ad.asin || ad.sku || '',
        label: ad.asin || ad.sku || '',
        campaignName: campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        currentBid: null,
        state: ad.state || ad.status || '',
        campaignState: ad.campaignState || campaign.campaignState || campaign.state || '',
        groupState: ad.groupState || campaign.groupState || '',
        onCooldown: !!ad.onCooldown,
        stats3d: ad.stats3d || {},
        stats7d: ad.stats7d || {},
        stats30d: ad.stats30d || {},
      });
    }
    if (campaign.sbCampaign?.id) {
      sbCampaigns.push({
        id: String(campaign.sbCampaign.id || ''),
        entityType: 'sbCampaign',
        text: campaign.sbCampaign.name || campaign.name || '',
        label: campaign.sbCampaign.name || campaign.name || '',
        campaignName: campaign.sbCampaign.name || campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        currentBid: null,
        currentBudget: toNum(campaign.sbCampaign.budget),
        state: campaign.sbCampaign.state || campaign.sbCampaign.status || '',
        onCooldown: !!campaign.sbCampaign.onCooldown,
        stats3d: campaign.sbCampaign.stats3d || {},
        stats7d: campaign.sbCampaign.stats7d || {},
        stats30d: campaign.sbCampaign.stats30d || {},
      });
    }
    for (const sb of campaign.sponsoredBrands || []) {
      const entityType = sb.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword';
      sponsoredBrands.push({
        id: String(sb.id || ''),
        entityType,
        text: sb.text || '',
        label: sb.text || '',
        campaignName: campaign.name || campaign.campaignName || '',
        groupName: campaign.groupName || campaign.adGroupName || '',
        matchType: sb.matchType || '',
        currentBid: toNum(sb.bid),
        state: sb.state || sb.status || '',
        campaignState: sb.campaignState || campaign.campaignState || campaign.state || '',
        groupState: sb.groupState || campaign.groupState || '',
        onCooldown: !!sb.onCooldown,
        rawProperty: sb.rawProperty || '',
        stats3d: sb.stats3d || {},
        stats7d: sb.stats7d || {},
        stats30d: sb.stats30d || {},
      });
    }
  }

  return [...spCampaigns, ...keywords, ...autoTargets, ...productAds, ...sbCampaigns, ...sponsoredBrands].filter(entity => entity.id);
}

function buildRowIndexes(rowsByType = {}) {
  const byType = {};
  for (const [entityType, rows] of Object.entries(rowsByType)) {
    const idMap = new Map();
    const skuMap = new Map();
    for (const row of rows || []) {
      const id = String(row.keywordId || row.targetId || row.target_id || row.adId || row.ad_id || row.campaignId || row.campaign_id || row.id || row.keyword_id || '').trim();
      const sku = String(row.sku || '').trim();
      if (id) idMap.set(id, row);
      if (sku) {
        if (!skuMap.has(sku)) skuMap.set(sku, []);
        skuMap.get(sku).push(row);
      }
    }
    byType[entityType] = { idMap, skuMap };
  }
  return byType;
}

function attachSevenDaySignals(products, rowIndexes, sp7DayRows = [], sb7DayRows = []) {
  const bySku = new Map(products.map(product => [String(product.sku || ''), product]));

  for (const candidate of sp7DayRows || []) {
    const sku = String(candidate.sku || '').trim();
    const product = bySku.get(sku);
    if (!product) continue;
    const campaignId = String(candidate.campaignId || '');
    const adGroupId = String(candidate.adGroupId || '');
    let matched = false;
    for (const entity of product.adjustableAds) {
      const row = rowIndexes[entity.entityType]?.idMap.get(String(entity.id || '')) || null;
      const rowCampaignId = String(row?.campaignId || '');
      const rowAdGroupId = String(row?.adGroupId || '');
      if (rowCampaignId === campaignId && rowAdGroupId === adGroupId) {
        entity.sourceSignals = [...new Set([...(entity.sourceSignals || []), 'sp_7day_untouched'])];
        matched = true;
      }
    }
    if (!matched) {
      product.unmappedCandidates.push({
        entityType: 'skuCandidate',
        id: `sp7::${sku}::${campaignId}::${adGroupId}`,
        sourceSignals: ['sp_7day_untouched'],
        campaignId,
        adGroupId,
        reason: 'sp_7day_untouched_candidate_without_executable_entity',
        stats7d: {
          spend: toNum(candidate.Spend ?? candidate.spend) || 0,
          orders: toNum(candidate.Orders ?? candidate.orders) || 0,
          sales: toNum(candidate.Sales ?? candidate.sales) || 0,
          acos: toNum(candidate.ACOS ?? candidate.acos) || 0,
        },
      });
    }
  }

  for (const candidate of sb7DayRows || []) {
    const sku = String(candidate.sku || '').trim();
    const product = bySku.get(sku);
    if (!product) continue;
    const campaignId = String(candidate.campaignId || '');
    let matched = false;
    for (const entity of product.adjustableAds) {
      const row = rowIndexes[entity.entityType]?.idMap.get(String(entity.id || '')) || null;
      if (String(row?.campaignId || '') === campaignId && (entity.entityType === 'sbKeyword' || entity.entityType === 'sbTarget')) {
        entity.sourceSignals = [...new Set([...(entity.sourceSignals || []), 'sb_7day_untouched'])];
        matched = true;
      }
    }
    if (!matched) {
      product.unmappedCandidates.push({
        entityType: 'sbCampaignCandidate',
        id: `sb7::${sku}::${campaignId}`,
        sourceSignals: ['sb_7day_untouched'],
        campaignId,
        reason: 'sb_7day_untouched_campaign_candidate_without_executable_entity',
        stats7d: {
          spend: toNum(candidate.Spend ?? candidate.spend) || 0,
          orders: toNum(candidate.Orders ?? candidate.orders) || 0,
          sales: toNum(candidate.Sales ?? candidate.sales) || 0,
          acos: toNum(candidate.ACOS ?? candidate.acos) || 0,
        },
      });
    }
  }
}

function buildProductContexts(cards, rowsByType, sp7DayRows, sb7DayRows, history) {
  const rowIndexes = buildRowIndexes(rowsByType);
  const recentHistoryBySku = new Map();
  for (const item of history || []) {
    const sku = String(item.sku || '').trim();
    if (!sku) continue;
    if (!recentHistoryBySku.has(sku)) recentHistoryBySku.set(sku, []);
    recentHistoryBySku.get(sku).push(item);
  }

  const products = (cards || []).map(card => {
    const productProfile = summarizeProductProfile(card.productProfile);
    const operatingContext = assessAdOperatingContext(card);
    return {
      sku: card.sku,
      asin: card.asin,
      opendate: card.opendate || '',
      fuldate: card.fuldate || '',
      price: toNum(card.price || card.listing?.price),
      profitRate: toNum(card.profitRate),
      invDays: toNum(card.invDays),
      unitsSold_7d: toNum(card.unitsSold_7d),
      unitsSold_30d: toNum(card.unitsSold_30d),
      adDependency: toNum(card.adDependency),
      yoySales: toNum(card.yoySales),
      yoySalesPct: toNum(card.yoySalesPct),
      yoyUnitsPct: toNum(card.yoyUnitsPct),
      yoyAsinPct: toNum(card.yoyAsinPct),
      yoySourceField: card.yoySourceField || null,
      yoyRank: toNum(card.yoyRank),
      note: card.note || null,
      personalSales: card.personalSales || null,
      listingSessions: card.listingSessions || {},
      listingConversionRates: card.listingConversionRates || {},
      adStats: card.adStats || {},
      sbStats: card.sbStats || {},
      listing: summarizeListing(card.listing),
      productProfile,
      operatingContext,
      lifecycleSeason: operatingContext.lifecycleSeason || null,
      createContext: card.createContext || null,
      history: (recentHistoryBySku.get(String(card.sku || '')) || []).slice(-10),
      adjustableAds: detectCardEntities(card).map(entity => ({
        ...entity,
        productMatch: scoreTermRelevance(entity.text || entity.targetType || '', productProfile || {}),
        sourceSignals: ['codex'],
      })),
      unmappedCandidates: [],
    };
  });

  attachSevenDaySignals(products, rowIndexes, sp7DayRows, sb7DayRows);
  return { products, rowIndexes };
}

function normalizeEntityType(value) {
  const text = String(value || '').trim();
  if (['campaign', 'keyword', 'autoTarget', 'manualTarget', 'productAd', 'sbKeyword', 'sbTarget', 'sbCampaign', 'skuCandidate', 'sbCampaignCandidate'].includes(text)) return text;
  return 'unknown';
}

function normalizeActionType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['bid', 'budget', 'placement', 'enable', 'pause', 'review', 'create', 'structure_fix'].includes(text)) return text;
  return 'review';
}

function findProductEntity(product, entityType, id) {
  if (!product) return null;
  const adjustable = (product.adjustableAds || []).find(item => String(item.entityType) === entityType && String(item.id) === String(id)) || null;
  if (adjustable) return adjustable;
  if (entityType === 'skuCandidate' || entityType === 'sbCampaignCandidate') {
    return (product.unmappedCandidates || []).find(item =>
      String(item.id) === String(id) &&
      String(item.entityType) === entityType
    ) || null;
  }
  return null;
}

function isHighVolumeProduct(product) {
  return (toNum(product?.unitsSold_30d) || 0) >= 80 ||
    (toNum(product?.adStats?.['30d']?.orders) || 0) >= 12 ||
    (toNum(product?.sbStats?.['30d']?.orders) || 0) >= 12;
}

function isEnabledState(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function hasInactiveParentAdObject(entity = {}) {
  for (const key of ['campaignState', 'groupState']) {
    const value = entity[key];
    if (value !== undefined && value !== null && String(value).trim() !== '' && !isEnabledState(value)) return true;
  }
  return false;
}

function isScaleOrBuildAction(action = {}) {
  const currentBid = toNum(action.currentBid);
  const suggestedBid = toNum(action.suggestedBid);
  const currentBudget = toNum(action.currentBudget);
  const suggestedBudget = toNum(action.suggestedBudget);
  if (action.actionType === 'create') return true;
  if (action.actionType === 'enable') return true;
  if (action.actionType === 'bid' && Number.isFinite(currentBid) && Number.isFinite(suggestedBid)) return suggestedBid > currentBid;
  if (action.actionType === 'budget' && Number.isFinite(currentBudget) && Number.isFinite(suggestedBudget)) return suggestedBudget > currentBudget;
  return false;
}

function statsFor(product = {}, key = '7d') {
  const sp = product.adStats?.[key] || {};
  const sb = product.sbStats?.[key] || {};
  return {
    spend: (toNum(sp.spend) || 0) + (toNum(sb.spend) || 0),
    orders: (toNum(sp.orders) || 0) + (toNum(sb.orders) || 0),
    clicks: (toNum(sp.clicks) || 0) + (toNum(sb.clicks) || 0),
    sales: (toNum(sp.sales) || 0) + (toNum(sb.sales) || 0),
  };
}

function impliedProductSales(product = {}, unitsKey = 'unitsSold_7d') {
  const units = toNum(product?.[unitsKey]) || 0;
  const price = toNum(product?.listing?.price ?? product?.price) || 0;
  return units * price;
}

function assessMarginalScaleEconomics(product = {}, action = {}, entity = {}) {
  const actionType = String(action.actionType || '');
  const isBudgetUp = actionType === 'budget' &&
    Number.isFinite(toNum(action.currentBudget)) &&
    Number.isFinite(toNum(action.suggestedBudget)) &&
    toNum(action.suggestedBudget) > toNum(action.currentBudget);
  const isBidUp = actionType === 'bid' &&
    Number.isFinite(toNum(action.currentBid)) &&
    Number.isFinite(toNum(action.suggestedBid)) &&
    toNum(action.suggestedBid) > toNum(action.currentBid);
  const isNewTraffic = ['create', 'enable'].includes(actionType);
  if (!isBudgetUp && !isBidUp && !isNewTraffic) return { ok: true, reason: 'not_scale' };

  const profitRate = toNum(product?.profitRate) || 0;
  const ad7 = statsFor(product, '7d');
  const ad30 = statsFor(product, '30d');
  const sales7 = ad7.sales || impliedProductSales(product, 'unitsSold_7d');
  const grossProfit7 = sales7 * Math.max(profitRate, 0);
  const entity7 = entity?.stats7d || {};
  const entity30 = entity?.stats30d || {};
  const entityOrders7 = toNum(entity7.orders) || 0;
  const entityOrders30 = toNum(entity30.orders) || 0;
  const entitySpend7 = toNum(entity7.spend) || 0;
  const expectedWeeklyOrders = (ad30.orders || entityOrders30 || 0) / 30 * 7;
  const weakRecentConversion = ad7.spend >= 8 && ad7.orders <= Math.max(0, expectedWeeklyOrders * 0.5);
  const entityWeakRecentConversion = entitySpend7 >= 4 && entityOrders7 === 0;
  const adSpendEatingProfit = profitRate > 0 && grossProfit7 > 0 && ad7.spend > grossProfit7 * 0.8;
  const noSalesAgainstSpend = ad7.spend >= 8 && sales7 <= 0;

  const evidence = [
    `skuAdSpend7=${ad7.spend.toFixed(2)}`,
    `skuAdOrders7=${ad7.orders.toFixed(0)}`,
    `skuAdOrders30=${ad30.orders.toFixed(0)}`,
    `skuSales7=${sales7.toFixed(2)}`,
    `profitRate=${profitRate.toFixed(4)}`,
    `grossProfit7=${grossProfit7.toFixed(2)}`,
    `entitySpend7=${entitySpend7.toFixed(2)}`,
    `entityOrders7=${entityOrders7.toFixed(0)}`,
    `entityOrders30=${entityOrders30.toFixed(0)}`,
  ];

  if (noSalesAgainstSpend) {
    return { ok: false, reason: 'spend_without_sku_sales', evidence };
  }
  if ((isBudgetUp || isBidUp || isNewTraffic) && (weakRecentConversion || entityWeakRecentConversion) && adSpendEatingProfit) {
    return { ok: false, reason: 'spend_up_conversion_not_covering_profit', evidence };
  }
  if ((isBudgetUp || isBidUp) && entityWeakRecentConversion && entityOrders30 <= 1) {
    return { ok: false, reason: 'entity_recent_spend_without_orders', evidence };
  }
  return { ok: true, reason: 'marginal_economics_ok', evidence };
}

function gateRisk(product, entity, action) {
  const gated = { ...action };
  const currentBid = toNum(gated.currentBid);
  const suggestedBid = toNum(gated.suggestedBid);
  const currentBudget = toNum(gated.currentBudget);
  const suggestedBudget = toNum(gated.suggestedBudget);
  const highVolume = isHighVolumeProduct(product);
  const sources = normalizeActionSources(gated.actionSource, []);

  const approvalFailures = executionApprovalFailures(gated);
  if (approvalFailures.length) {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:missing_codex_execution_approval:${approvalFailures.join(',')}] Final executable actions must have decisionStage=ai_approved/manual_approved, approvedBy=codex/manual, actionSource including codex/manual, requiresAiDecision=false, and no rule-generator/provisional source.`.trim();
    return gated;
  }

  if (isCandidateDecision(gated)) {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.decisionStage = gated.decisionStage || 'candidate';
    gated.requiresAiDecision = true;
    gated.reason = `${gated.reason || ''} [risk_gate:candidate_requires_ai_decision] Rule-generator candidates are evidence, not final Codex decisions. Approve with decisionStage=ai_approved/manual_approved, approvedBy, and executable actionSource before execution.`.trim();
    return gated;
  }

  if (['keyword', 'autoTarget', 'manualTarget', 'productAd'].includes(gated.entityType) && hasInactiveParentAdObject(entity)) {
    gated.actionType = 'skip';
    gated.canAutoExecute = false;
    gated.riskLevel = 'parent_ad_object_inactive';
    gated.reason = `${gated.reason || ''} [risk_gate:parent_ad_object_inactive:campaignState=${entity.campaignState || ''},groupState=${entity.groupState || ''}] Child row is not safe to adjust while the parent campaign/ad group is paused or closed; reactivate the parent first or choose another active ad form.`.trim();
    return gated;
  }

  if (gated.actionType === 'review') {
    gated.canAutoExecute = false;
    return gated;
  }

  if (sources.some(source => !EXECUTABLE_ACTION_SOURCES.has(source))) {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:non_codex_source:${sources.join('+') || 'unknown'}]`.trim();
    return gated;
  }

  if (gated.actionType === 'structure_fix') {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:structure_fix]`.trim();
    return gated;
  }

  if (isScaleOrBuildAction(gated)) {
    const operating = assessAdOperatingContext(product || {});
    const readiness = operating.readiness || {};
    if (readiness.disallowNewAds || readiness.disallowScaleActions) {
      const evidence = [
        ...currentAdReadinessEvidence(readiness),
        `readinessReason=${readiness.reason || 'unknown'}`,
      ].join('; ');
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'overseason_page_hold';
      gated.currentAdReadinessJudgement = gated.currentAdReadinessJudgement || formatCurrentAdReadiness(readiness);
      gated.reason = `${gated.reason || ''} [risk_gate:overseason_or_page_hold:${readiness.recommendation || 'unknown'}] ${gated.currentAdReadinessJudgement}; evidence: ${evidence}`.trim();
      return gated;
    }

    const economics = assessMarginalScaleEconomics(product || {}, gated, entity || {});
    if (!economics.ok) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'marginal_profit_review';
      gated.reason = `${gated.reason || ''} [risk_gate:marginal_profit:${economics.reason}] Scale/build action needs manual review because recent ad spend is not producing enough sales/orders to cover gross profit. evidence: ${(economics.evidence || []).join('; ')}`.trim();
      return gated;
    }
  }

  if (gated.actionType === 'create') {
    const createInput = gated.createInput || {};
    const mode = String(createInput.mode || '').trim();
    const advType = String(createInput.advType || 'SP').toUpperCase();
    const missing = [];
    if (advType !== 'SP') missing.push('supported SP create only');
    if (!['auto', 'productTarget', 'keywordTarget'].includes(mode)) missing.push('mode');
    for (const field of ['sku', 'asin', 'accountId', 'siteId', 'dailyBudget', 'defaultBid', 'coreTerm']) {
      if (createInput[field] === undefined || createInput[field] === null || createInput[field] === '') missing.push(field);
    }
    if (mode === 'keywordTarget' && !(Array.isArray(createInput.keywords) && createInput.keywords.length)) missing.push('keywords');
    if (mode === 'productTarget' && !(Array.isArray(createInput.targetAsins) && createInput.targetAsins.length)) missing.push('targetAsins');
    if (missing.length) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:create_missing:${missing.join(',')}] Need these create fields before automation can execute: ${missing.join(', ')}.`.trim();
      return gated;
    }
    gated.canAutoExecute = true;
    gated.riskLevel = gated.riskLevel || 'low_budget_create';
    return gated;
  }

  if (gated.entityType === 'skuCandidate' || gated.entityType === 'sbCampaignCandidate') {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:non_executable_candidate] Candidate rows are analysis objects, not writable ad entities. The generator must output actionType=create with createInput, or a concrete campaign/keyword/target/productAd id.`.trim();
    return gated;
  }

  if (gated.actionType === 'bid' && Number.isFinite(currentBid) && currentBid > 0 && Number.isFinite(suggestedBid)) {
    const changePct = Math.abs(suggestedBid - currentBid) / currentBid;
    const explicitTrafficPushOverride = gated.allowLargeBidChange === true && gated.riskLevel === 'traffic_push';
    if (highVolume && changePct > HIGH_VOLUME_BID_CHANGE_REVIEW_THRESHOLD && !explicitTrafficPushOverride) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:high_volume_strong_bid_change:changePct=${changePct.toFixed(4)},threshold=${HIGH_VOLUME_BID_CHANGE_REVIEW_THRESHOLD}]`.trim();
      return gated;
    }
    if (!highVolume && changePct > NORMAL_BID_CHANGE_REVIEW_THRESHOLD && !explicitTrafficPushOverride) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:large_bid_change:changePct=${changePct.toFixed(4)},threshold=${NORMAL_BID_CHANGE_REVIEW_THRESHOLD}]`.trim();
      return gated;
    }
  }

  if (gated.actionType === 'budget' && Number.isFinite(currentBudget) && currentBudget > 0 && Number.isFinite(suggestedBudget)) {
    const changePct = Math.abs(suggestedBudget - currentBudget) / currentBudget;
    const explicitTrafficPushOverride = gated.allowLargeBudgetChange === true && gated.riskLevel === 'traffic_push';
    if (changePct > 0.5 && !explicitTrafficPushOverride) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:large_budget_change]`.trim();
      return gated;
    }
  }

  if (gated.actionType === 'placement') {
    const next = toNum(gated.suggestedPlacementPercent);
    if (!['placementTop', 'placementProductPage', 'placementRestOfSearch'].includes(String(gated.placementKey || '')) || !Number.isFinite(next) || next < 0 || next > 900) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:invalid_placement]`.trim();
      return gated;
    }
    if (next > 100 && !(gated.allowLargePlacementChange === true && gated.riskLevel === 'traffic_push')) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:large_placement_change]`.trim();
      return gated;
    }
  }

  gated.canAutoExecute = true;
  return gated;
}

function validateAndNormalizePlan(rawPlan, context) {
  if (!Array.isArray(rawPlan)) throw new Error('action schema root must be an array');
  const productMap = new Map((context.products || []).map(product => [String(product.sku || ''), product]));
  const productCount = productMap.size;
  const reviewLimit = productCount > 0 ? Math.max(1, Math.floor(productCount * 0.01)) : 0;
  const plan = [];
  const review = [];
  const skipped = [];
  const errors = [];

  function pushReviewOrSkip(sku, action) {
    if (hasCriticalReviewRisk(action)) {
      review.push({ sku, action });
      return;
    }
    if (review.length < reviewLimit) {
      review.push({ sku, action });
      return;
    }
    skipped.push({
      sku,
      action: {
        ...action,
        actionType: 'skip',
        canAutoExecute: false,
        riskLevel: action.riskLevel || 'review_budget_exceeded',
        reason: `${action.reason || ''} [review_budget_exceeded:limit=${reviewLimit},productCount=${productCount}]`.trim(),
      },
    });
  }

  for (const productResult of rawPlan) {
    const sku = String(productResult?.sku || '').trim();
    const product = productMap.get(sku);
    if (!product) {
      errors.push({ sku, reason: 'unknown sku in action schema' });
      continue;
    }
    const summary = String(productResult.summary || '').trim();
    const actions = [];
    for (const rawAction of productResult.actions || []) {
      const actionType = normalizeActionType(rawAction.actionType);
      const rawCreateInput = rawAction.createInput || {};
      const entityType = actionType === 'create'
        ? 'skuCandidate'
        : normalizeEntityType(rawAction.entityType);
      const id = String(
        rawAction.id ||
        (actionType === 'create'
          ? `create::${sku}::${rawCreateInput.mode || rawAction.mode || 'unknown'}::${rawCreateInput.coreTerm || rawAction.coreTerm || ''}`
          : '')
      ).trim();

      if ((entityType === 'skuCandidate' || entityType === 'sbCampaignCandidate') && actionType !== 'create' && actionType !== 'review') {
        errors.push({
          sku,
          id,
          entityType,
          reason: `candidate action is not directly executable: actionType=${actionType}. Emit actionType=create with createInput, or emit a concrete keyword/target/productAd/campaign id.`,
        });
        continue;
      }

      const entity = actionType === 'create' || (actionType === 'review' && entityType === 'skuCandidate')
        ? { id, entityType: 'skuCandidate', sourceSignals: ['codex'], currentBid: null }
        : findProductEntity(product, entityType, id);
      if (entityType === 'unknown') {
        errors.push({ sku, id, reason: 'unsupported entity type in action schema' });
        continue;
      }
      if (!id) {
        errors.push({ sku, entityType, reason: 'missing action id in action schema' });
        continue;
      }
      if (!entity) {
        errors.push({ sku, id, entityType, reason: 'entity id not found in context' });
        continue;
      }

      const evidence = Array.isArray(rawAction.evidence)
        ? rawAction.evidence.map(item => String(item)).filter(Boolean)
        : (rawAction.evidence ? [String(rawAction.evidence)] : []);
      const normalized = {
        entityType,
        entityLevel: entityType,
        id,
        actionType,
        allowLargeBidChange: rawAction.allowLargeBidChange === true,
        allowLargeBudgetChange: rawAction.allowLargeBudgetChange === true,
        allowLargePlacementChange: rawAction.allowLargePlacementChange === true,
        currentBid: toNum(rawAction.currentBid ?? entity.currentBid),
        suggestedBid: toNum(rawAction.suggestedBid),
        currentBudget: toNum(rawAction.currentBudget ?? entity.currentBudget),
        suggestedBudget: toNum(rawAction.suggestedBudget),
        placementKey: String(rawAction.placementKey || rawAction.key || '').trim(),
        currentPlacementPercent: toNum(rawAction.currentPlacementPercent ?? (rawAction.placementKey ? entity[rawAction.placementKey] : null)),
        suggestedPlacementPercent: toNum(rawAction.suggestedPlacementPercent ?? rawAction.column),
        reason: String(rawAction.reason || '').trim(),
        text: String(rawAction.text || rawAction.keywordText || rawAction.targetText || entity.text || '').trim(),
        label: String(rawAction.label || rawAction.text || entity.label || entity.text || '').trim(),
        evidence,
        confidence: Math.max(0, Math.min(1, toNum(rawAction.confidence) ?? 0)),
        riskLevel: String(rawAction.riskLevel || '').trim() || 'low_confidence',
        currentAdReadinessJudgement: String(rawAction.currentAdReadinessJudgement || '').trim(),
        source: normalizeText(rawAction.source || rawAction.candidateSource || 'external_action_schema'),
        actionSource: normalizeActionSources(rawAction.actionSource, []),
        decisionStage: normalizeText(rawAction.decisionStage),
        candidateSource: normalizeText(rawAction.candidateSource),
        candidateActionType: normalizeText(rawAction.candidateActionType),
        candidateReason: normalizeText(rawAction.candidateReason),
        requiresAiDecision: rawAction.requiresAiDecision === true,
        approvedBy: rawAction.approvedBy === null || rawAction.approvedBy === undefined ? null : normalizeText(rawAction.approvedBy),
        sku,
        campaignId: String(rawAction.campaignId || entity.campaignId || ''),
        adGroupId: String(rawAction.adGroupId || entity.adGroupId || ''),
        campaignName: String(rawAction.campaignName || entity.campaignName || '').trim(),
        groupName: String(rawAction.groupName || rawAction.adGroupName || entity.groupName || entity.adGroupName || '').trim(),
        keywordId: entityType === 'keyword' || entityType === 'sbKeyword' ? id : '',
        targetId: entityType === 'autoTarget' || entityType === 'manualTarget' || entityType === 'sbTarget' ? id : '',
        adId: entityType === 'productAd' ? id : '',
      };

      if (actionType === 'create') {
        const createContext = product.createContext || {};
        normalized.createInput = {
          ...(rawCreateInput || {}),
          mode: rawCreateInput.mode || rawAction.mode || '',
          sku: rawCreateInput.sku || sku,
          asin: rawCreateInput.asin || product.asin || '',
          accountId: rawCreateInput.accountId ?? rawAction.accountId ?? createContext.accountId,
          siteId: rawCreateInput.siteId ?? rawAction.siteId ?? createContext.siteId ?? 4,
          dailyBudget: rawCreateInput.dailyBudget ?? rawAction.dailyBudget ?? createContext.recommendedDailyBudget,
          defaultBid: rawCreateInput.defaultBid ?? rawAction.defaultBid ?? createContext.recommendedDefaultBid,
          coreTerm: rawCreateInput.coreTerm || rawAction.coreTerm || '',
          targetType: rawCreateInput.targetType || rawAction.targetType || '',
          targetAsins: rawCreateInput.targetAsins || rawAction.targetAsins || [],
          matchType: rawCreateInput.matchType || rawAction.matchType || '',
          keywords: rawCreateInput.keywords || rawAction.keywords || [],
          advType: rawCreateInput.advType || rawAction.advType || 'SP',
        };
      }

      const verification = buildVerificationSpec(normalized);
      normalized.verifySource = verification?.verifySource || String(rawAction.verifySource || '').trim();
      normalized.verifyField = verification?.verifyField || String(rawAction.verifyField || '').trim();
      normalized.expected = verification?.expected || rawAction.expected || null;

      if (!normalized.actionSource.length) normalized.actionSource = ['generator_candidate'];

      if (normalized.actionType === 'bid') {
        if (!Number.isFinite(normalized.currentBid) || !Number.isFinite(normalized.suggestedBid)) {
          errors.push({ sku, id, entityType, reason: 'bid action missing currentBid/suggestedBid' });
          continue;
        }
        normalized.direction = normalized.suggestedBid > normalized.currentBid ? 'up' : (normalized.suggestedBid < normalized.currentBid ? 'down' : 'same');
      }

      if (normalized.actionType === 'budget') {
        if (entityType !== 'campaign' || !Number.isFinite(normalized.suggestedBudget)) {
          errors.push({ sku, id, entityType, reason: 'budget action requires campaign entity and suggestedBudget' });
          continue;
        }
        normalized.direction = normalized.currentBudget != null && normalized.suggestedBudget > normalized.currentBudget ? 'up' : (normalized.currentBudget != null && normalized.suggestedBudget < normalized.currentBudget ? 'down' : 'same');
      }

      if (normalized.actionType === 'placement') {
        if (entityType !== 'campaign' || !normalized.placementKey || !Number.isFinite(normalized.suggestedPlacementPercent)) {
          errors.push({ sku, id, entityType, reason: 'placement action requires campaign entity, placementKey, suggestedPlacementPercent' });
          continue;
        }
        if (Number.isFinite(normalized.currentPlacementPercent)) {
          normalized.direction = normalized.suggestedPlacementPercent > normalized.currentPlacementPercent ? 'up' : (normalized.suggestedPlacementPercent < normalized.currentPlacementPercent ? 'down' : 'same');
        } else {
          normalized.direction = 'unknown';
        }
      }

      normalized.learning = buildLearningContext(product, entity, normalized, rawAction);

      if (!hasRequiredVerification(normalized)) {
        normalized.actionType = 'review';
        normalized.canAutoExecute = false;
        normalized.riskLevel = 'manual_review';
        normalized.reason = `${normalized.reason || ''} [risk_gate:missing_verify_spec] No post-write verification mapping for entityType=${normalized.entityType}, actionType=${normalized.actionType}. Add verifySource/verifyField support or emit a concrete executable entity/action pair.`.trim();
      }

      const gated = gateRisk(product, entity, normalized);
      if (gated.actionType === 'review' || gated.canAutoExecute === false) pushReviewOrSkip(sku, gated);
      else if (gated.actionType === 'skip') skipped.push({ sku, action: gated });
      else actions.push(gated);
    }
    plan.push({ sku, asin: product.asin, summary, actions });
  }

  for (const product of context.products || []) {
    if (!plan.some(item => item.sku === product.sku)) {
      plan.push({ sku: product.sku, asin: product.asin, summary: '', actions: [] });
    }
  }

  return { plan, review, skipped, errors };
}

function loadExternalActionSchema({
  cards,
  rowsByType,
  sp7DayRows,
  sb7DayRows,
  history,
  sevenDayMeta,
  snapshotDir,
  actionSchemaFile,
}) {
  const { products } = buildProductContexts(cards, rowsByType, sp7DayRows, sb7DayRows, history);
  const context = {
    generatedAt: new Date().toISOString(),
    products,
    meta: {
      productCount: products.length,
      sp7CandidateCount: (sp7DayRows || []).length,
      sb7CandidateCount: (sb7DayRows || []).length,
      sevenDayMeta: sevenDayMeta || {},
    },
  };

  const resolvedFile = actionSchemaFile || process.env.ACTION_SCHEMA_FILE || '';
  if (snapshotDir) {
    fs.writeFileSync(path.join(snapshotDir, 'ai_decision_context.json'), JSON.stringify(context, null, 2));
  }
  if (!resolvedFile) {
    throw Object.assign(new Error('missing ACTION_SCHEMA_FILE'), {
      code: 'ACTION_SCHEMA_FILE_MISSING',
    });
  }

  const rawText = fs.readFileSync(resolvedFile, 'utf8');
  const rawPlan = JSON.parse(rawText);
  if (snapshotDir) {
    fs.writeFileSync(path.join(snapshotDir, 'ai_decision_raw_response.json'), rawText);
  }

  const validated = validateAndNormalizePlan(rawPlan, context);
  if (snapshotDir) {
    fs.writeFileSync(path.join(snapshotDir, 'ai_decision_validated_plan.json'), JSON.stringify(validated, null, 2));
  }

  const sourceStats = validated.plan
    .flatMap(item => item.actions || [])
    .reduce((acc, action) => {
      for (const source of action.actionSource || []) acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

  return {
    decisionSource: 'external_action_schema',
    actionSchemaFile: path.resolve(resolvedFile),
    context,
    rawPlan,
    ...validated,
    meta: {
      sourceStats,
      sp7CandidateCount: (sp7DayRows || []).length,
      sb7CandidateCount: (sb7DayRows || []).length,
    },
  };
}

module.exports = {
  buildProductContexts,
  hasRequiredVerification,
  validateAndNormalizePlan,
  loadExternalActionSchema,
};
