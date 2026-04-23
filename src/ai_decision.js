const fs = require('fs');
const path = require('path');

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSourceList(source) {
  if (Array.isArray(source)) return [...new Set(source.filter(Boolean).map(String))];
  if (!source) return [];
  return [String(source)];
}

function detectCardEntities(card) {
  const campaigns = Array.isArray(card?.campaigns) ? card.campaigns : [];
  const keywords = [];
  const autoTargets = [];
  const productAds = [];
  const sbCampaigns = [];
  const sponsoredBrands = [];

  for (const campaign of campaigns) {
    for (const keyword of campaign.keywords || []) {
      keywords.push({
        id: String(keyword.id || ''),
        entityType: 'keyword',
        text: keyword.text || '',
        matchType: keyword.matchType || '',
        currentBid: toNum(keyword.bid),
        state: keyword.state || keyword.status || '',
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
        currentBid: toNum(target.bid),
        state: target.state || target.status || '',
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
        currentBid: null,
        state: ad.state || ad.status || '',
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
        matchType: sb.matchType || '',
        currentBid: toNum(sb.bid),
        state: sb.state || sb.status || '',
        onCooldown: !!sb.onCooldown,
        rawProperty: sb.rawProperty || '',
        stats3d: sb.stats3d || {},
        stats7d: sb.stats7d || {},
        stats30d: sb.stats30d || {},
      });
    }
  }

  return [...keywords, ...autoTargets, ...productAds, ...sbCampaigns, ...sponsoredBrands].filter(entity => entity.id);
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

  const products = (cards || []).map(card => ({
    sku: card.sku,
    asin: card.asin,
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
    adStats: card.adStats || {},
    sbStats: card.sbStats || {},
    listing: card.listing || null,
    createContext: card.createContext || null,
    history: (recentHistoryBySku.get(String(card.sku || '')) || []).slice(-10),
    adjustableAds: detectCardEntities(card).map(entity => ({
      ...entity,
      sourceSignals: ['strategy'],
    })),
    unmappedCandidates: [],
  }));

  attachSevenDaySignals(products, rowIndexes, sp7DayRows, sb7DayRows);
  return { products, rowIndexes };
}

function normalizeEntityType(value) {
  const text = String(value || '').trim();
  if (['keyword', 'autoTarget', 'manualTarget', 'productAd', 'sbKeyword', 'sbTarget', 'sbCampaign', 'skuCandidate', 'sbCampaignCandidate'].includes(text)) return text;
  return 'unknown';
}

function normalizeActionType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['bid', 'enable', 'pause', 'review', 'create', 'structure_fix'].includes(text)) return text;
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

function gateRisk(product, entity, action) {
  const gated = { ...action };
  const currentBid = toNum(gated.currentBid);
  const suggestedBid = toNum(gated.suggestedBid);
  const highVolume = isHighVolumeProduct(product);

  if (gated.actionType === 'structure_fix') {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:structure_fix]`.trim();
    return gated;
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
      gated.reason = `${gated.reason || ''} [risk_gate:create_missing:${missing.join(',')}]`.trim();
      return gated;
    }
    gated.canAutoExecute = true;
    gated.riskLevel = gated.riskLevel || 'low_budget_create';
    return gated;
  }

  if (gated.actionType === 'review') {
    gated.canAutoExecute = false;
    return gated;
  }

  if (gated.entityType === 'skuCandidate' || gated.entityType === 'sbCampaignCandidate') {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:non_executable_candidate]`.trim();
    return gated;
  }

  if (gated.actionType === 'bid' && Number.isFinite(currentBid) && currentBid > 0 && Number.isFinite(suggestedBid)) {
    const changePct = Math.abs(suggestedBid - currentBid) / currentBid;
    const explicitTrafficPushOverride = gated.allowLargeBidChange === true && gated.riskLevel === 'traffic_push';
    if (changePct > 0.15 && !explicitTrafficPushOverride) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:large_bid_change]`.trim();
      return gated;
    }
    if (highVolume && changePct > 0.08 && !explicitTrafficPushOverride) {
      gated.actionType = 'review';
      gated.canAutoExecute = false;
      gated.riskLevel = 'manual_review';
      gated.reason = `${gated.reason || ''} [risk_gate:high_volume_strong_bid_change]`.trim();
      return gated;
    }
  }

  gated.canAutoExecute = true;
  return gated;
}

function validateAndNormalizePlan(rawPlan, context) {
  if (!Array.isArray(rawPlan)) throw new Error('action schema root must be an array');
  const productMap = new Map((context.products || []).map(product => [String(product.sku || ''), product]));
  const plan = [];
  const review = [];
  const skipped = [];
  const errors = [];

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
      const entity = actionType === 'create'
        ? { id, entityType: 'skuCandidate', sourceSignals: ['strategy'], currentBid: null }
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
        currentBid: toNum(rawAction.currentBid ?? entity.currentBid),
        suggestedBid: toNum(rawAction.suggestedBid),
        reason: String(rawAction.reason || '').trim(),
        evidence,
        confidence: Math.max(0, Math.min(1, toNum(rawAction.confidence) ?? 0)),
        riskLevel: String(rawAction.riskLevel || '').trim() || 'low_confidence',
        source: 'codex',
        actionSource: normalizeSourceList(rawAction.actionSource).filter(source => ['strategy', 'sp_7day_untouched', 'sb_7day_untouched'].includes(source)),
        sku,
        campaignId: String(rawAction.campaignId || entity.campaignId || ''),
        adGroupId: String(rawAction.adGroupId || entity.adGroupId || ''),
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

      if (!normalized.actionSource.length) normalized.actionSource = normalizeSourceList(entity.sourceSignals).filter(source => ['strategy', 'sp_7day_untouched', 'sb_7day_untouched'].includes(source));
      if (!normalized.actionSource.length) normalized.actionSource = ['strategy'];

      if (normalized.actionType === 'bid') {
        if (!Number.isFinite(normalized.currentBid) || !Number.isFinite(normalized.suggestedBid)) {
          errors.push({ sku, id, entityType, reason: 'bid action missing currentBid/suggestedBid' });
          continue;
        }
        normalized.direction = normalized.suggestedBid > normalized.currentBid ? 'up' : (normalized.suggestedBid < normalized.currentBid ? 'down' : 'same');
      }

      const gated = gateRisk(product, entity, normalized);
      if (gated.actionType === 'review' || gated.canAutoExecute === false) review.push({ sku, action: gated });
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
  validateAndNormalizePlan,
  loadExternalActionSchema,
};
