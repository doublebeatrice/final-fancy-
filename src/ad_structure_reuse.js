function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeLaneToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isReusableState(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (['1', 'enabled', 'enable', 'active', 'delivering', 'paused', 'pause', '2'].includes(text)) return true;
  return !/archived|ended|deleted|disabled|incomplete|rejected|terminated/.test(text);
}

function campaignIsReusable(campaign = {}) {
  return isReusableState(campaign.campaignState ?? campaign.state ?? campaign.status) &&
    isReusableState(campaign.groupState ?? campaign.adGroupState ?? campaign.ad_group_state);
}

function targetLaneForCreateInput(input = {}) {
  const mode = normalizeText(input.mode || input.targetMode);
  if (mode === 'auto') return 'auto';
  if (mode === 'keywordtarget' || mode === 'keyword') {
    const matchType = normalizeLaneToken(input.matchType || input.match_type);
    if (['broad', 'phrase', 'exact'].includes(matchType)) return `keyword:${matchType}`;
    return '';
  }
  if (mode === 'producttarget' || mode === 'manualtarget' || mode === 'product') {
    const targetType = normalizeLaneToken(input.targetType || input.matchType || input.match_type);
    if (targetType.includes('expanded')) return 'product:asin_expanded_from';
    if (targetType.includes('same_as') || targetType.includes('sameas') || targetType === 'asin') return 'product:asin_same_as';
    if (targetType.includes('category')) return 'product:category';
    return '';
  }
  return '';
}

function nameSuggestsKeywordLane(campaign = {}, lane) {
  const name = normalizeText([
    campaign.name,
    campaign.campaignName,
    campaign.groupName,
    campaign.adGroupName,
  ].filter(Boolean).join(' '));
  if (!name) return false;
  if (lane === 'keyword:broad') return /\bbroad\b|广泛/.test(name);
  if (lane === 'keyword:phrase') return /\bphrase\b|词组/.test(name);
  if (lane === 'keyword:exact') return /\bexact\b|精准/.test(name);
  return /\bkw\b|\bkeyword\b|关键词/.test(name);
}

function nameSuggestsAutoLane(campaign = {}) {
  const name = normalizeText([
    campaign.name,
    campaign.campaignName,
    campaign.groupName,
    campaign.adGroupName,
  ].filter(Boolean).join(' '));
  return /\bauto\b|自动/.test(name);
}

function keywordMatchesLane(row = {}, lane) {
  if (!isReusableState(row.state ?? row.status)) return false;
  if (lane === 'keyword:any') return true;
  const matchType = normalizeLaneToken(row.matchType || row.match_type || row.type);
  return lane === `keyword:${matchType}`;
}

function autoTargetMatches(row = {}) {
  if (!isReusableState(row.state ?? row.status)) return false;
  const targetType = normalizeLaneToken(row.targetType || row.target_type || row.type);
  if (!targetType) return true;
  if (targetType === 'manual') return false;
  if (targetType.includes('asin') || targetType.includes('category')) return false;
  return true;
}

function expressionTypes(row = {}) {
  const lists = [
    row.expression,
    row.resolvedExpression,
    row.expressions,
    row.resolvedExpressions,
  ];
  const types = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const type = normalizeLaneToken(item?.type);
      if (type) types.push(type);
    }
  }
  return types;
}

function productLaneForRow(row = {}) {
  const raw = [
    row.targetType,
    row.target_type,
    row.matchType,
    row.type,
    row.expressionType,
    ...expressionTypes(row),
  ].map(normalizeLaneToken).filter(Boolean);
  if (raw.some(value => value.includes('expanded'))) return 'product:asin_expanded_from';
  if (raw.some(value => value.includes('same_as') || value.includes('sameas') || value === 'asin')) return 'product:asin_same_as';
  if (raw.some(value => value.includes('category'))) return 'product:category';
  if (raw.some(value => value === 'manual' || value.includes('pat'))) return 'product:any';
  return '';
}

function productTargetRows(campaign = {}) {
  return [
    ...(campaign.manualTargets || []),
    ...(campaign.productTargets || []),
    ...(campaign.targets || []),
    ...(campaign.autoTargets || []).filter(row => {
      const lane = productLaneForRow(row);
      return !!lane || normalizeLaneToken(row.targetType || row.type) === 'manual';
    }),
  ];
}

function campaignsFor(card = {}) {
  if (Array.isArray(card.campaigns) && card.campaigns.length) return card.campaigns;
  const map = new Map();
  for (const row of card.adjustableAds || []) {
    const campaignId = String(row.campaignId || row.id || '');
    const adGroupId = String(row.adGroupId || '');
    if (!campaignId) continue;
    const key = `${campaignId}::${adGroupId}`;
    if (!map.has(key)) {
      map.set(key, {
        campaignId,
        adGroupId,
        campaignState: row.campaignState || row.state || '',
        groupState: row.groupState || '',
        name: row.campaignName || '',
        campaignName: row.campaignName || '',
        groupName: row.groupName || row.adGroupName || '',
        keywords: [],
        autoTargets: [],
        productTargets: [],
      });
    }
    const campaign = map.get(key);
    if (row.entityType === 'keyword') campaign.keywords.push(row);
    if (row.entityType === 'autoTarget') campaign.autoTargets.push(row);
    if (row.entityType === 'manualTarget') campaign.productTargets.push(row);
  }
  return [...map.values()];
}

function rowMatchesProductLane(row = {}, lane) {
  if (!isReusableState(row.state ?? row.status)) return false;
  const rowLane = productLaneForRow(row);
  if (!rowLane) return false;
  return lane === 'product:any' || rowLane === lane;
}

function campaignMatchesLane(campaign = {}, lane = '') {
  if (!campaignIsReusable(campaign)) return false;
  if (lane === 'auto') {
    return (campaign.autoTargets || []).some(autoTargetMatches) || nameSuggestsAutoLane(campaign);
  }
  if (lane.startsWith('keyword:')) {
    return (campaign.keywords || []).some(row => keywordMatchesLane(row, lane)) ||
      nameSuggestsKeywordLane(campaign, lane);
  }
  if (lane.startsWith('product:')) {
    return productTargetRows(campaign).some(row => rowMatchesProductLane(row, lane));
  }
  return false;
}

function hasReusableSpLane(card = {}, createInput = {}) {
  const lane = targetLaneForCreateInput(createInput);
  if (!lane) return { reusable: false, lane, matches: [] };
  const matches = campaignsFor(card)
    .filter(campaign => campaignMatchesLane(campaign, lane))
    .map(campaign => ({
      campaignId: String(campaign.campaignId || campaign.id || ''),
      adGroupId: String(campaign.adGroupId || campaign.groupId || ''),
      campaignName: campaign.name || campaign.campaignName || '',
      groupName: campaign.groupName || campaign.adGroupName || '',
      lane,
    }));
  return {
    reusable: matches.length > 0,
    lane,
    matches,
  };
}

module.exports = {
  hasReusableSpLane,
  targetLaneForCreateInput,
  campaignMatchesLane,
};
