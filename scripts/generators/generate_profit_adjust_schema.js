const fs = require('fs');
const path = require('path');
const { scoreTermRelevance } = require('../../src/product_profile');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundBid(value, min = 0.05) {
  return Number(Math.max(min, value).toFixed(2));
}

function normalizePct(value) {
  const n = num(value);
  if (!n) return 0;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function isPaused(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '2' || text === 'paused' || text === 'disabled';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniq(items) {
  return [...new Set((items || []).map(item => normalizeText(item)).filter(Boolean))];
}

function imageNameTokens(url = '') {
  const text = String(url || '').toLowerCase();
  return text
    .replace(/^https?:\/\//, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token && token.length >= 3);
}

function listingVisualSignals(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  const imageUrls = uniq(Array.isArray(listing.imageUrls) ? listing.imageUrls : []);
  const mainImageUrl = normalizeText(listing.mainImageUrl || profile.mainImageUrl || imageUrls[0] || '');
  const tokens = uniq([mainImageUrl, ...imageUrls].flatMap(imageNameTokens));
  const profileImageCount = num(profile.imageCount);
  return {
    hasImages: imageUrls.length > 0 || !!mainImageUrl || profile.hasImages === true,
    imageCount: imageUrls.length || profileImageCount || (mainImageUrl ? 1 : 0),
    mainImageUrl,
    imageUrls,
    urlTokens: uniq([...tokens, ...(Array.isArray(profile.visualTheme) ? profile.visualTheme : [])]),
    visualReady: (imageUrls.length > 0 || !!mainImageUrl || profile.hasImages === true) && listing.isAvailable !== false,
    isAvailable: listing.isAvailable !== false,
  };
}

function internalThemeText(card = {}) {
  const profile = card.productProfile || {};
  const parts = [
    card.sku,
    card.asin,
    card.note,
    card.solrTerm,
    profile.productType,
    profile.positioning,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.seasonality || []),
  ];
  for (const campaign of card.campaigns || []) {
    parts.push(campaign.name);
    for (const row of campaign.keywords || []) parts.push(row.text);
    for (const row of campaign.sponsoredBrands || []) parts.push(row.text);
  }
  return parts.filter(Boolean).join(' ');
}

function listingTextHints(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  return [
    profile.positioning,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    listing.title,
    ...(listing.bulletHighlights || []),
    ...(listing.bullets || []).slice(0, 3),
    listing.description,
    listing.aPlusText,
    listing.categoryPath,
    listing.variationText,
  ].filter(Boolean).join(' ');
}

function isQ2ThemeText(text) {
  return /teacher|appreciation|nurse|medical|lab week|christian|inspir|faith|graduat|summer|beach|pool|swim|luau|tropical|wedding|bridal|bridesmaid|mexican|fiesta|pinata|taco|cactus|baby shower|gender reveal|memorial|mother|father|dad|mom/i.test(text || '');
}

function resolveQ2Signals(card = {}) {
  const visual = listingVisualSignals(card);
  const internalText = internalThemeText(card);
  const listingText = listingTextHints(card);
  const historicalTheme = isQ2ThemeText(internalText);
  const listingThemeWeak = isQ2ThemeText(listingText);
  const visualOnlyTheme = isQ2ThemeText(visual.urlTokens.join(' '));
  return {
    visual,
    q2Primary: historicalTheme || visualOnlyTheme,
    q2Secondary: listingThemeWeak,
    rationale: historicalTheme
      ? 'historical_or_internal_theme'
      : (visualOnlyTheme ? 'image_url_theme_hint' : (listingThemeWeak ? 'listing_text_hint_only' : 'no_q2_theme_hit')),
  };
}

function collectEntities(card) {
  const rows = [];
  for (const campaign of card.campaigns || []) {
    for (const row of campaign.keywords || []) {
      rows.push({ ...row, entityType: 'keyword', label: row.text || '', campaignName: campaign.name });
    }
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', label: row.text || row.targetType || '', campaignName: campaign.name });
    }
    for (const row of campaign.productAds || []) {
      rows.push({ ...row, entityType: 'productAd', label: 'product ad', campaignName: campaign.name });
    }
    if (campaign.sbCampaign?.id) {
      rows.push({ ...campaign.sbCampaign, entityType: 'sbCampaign', label: 'SB campaign', campaignName: campaign.name });
    }
    for (const row of campaign.sponsoredBrands || []) {
      rows.push({ ...row, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword', label: row.text || '', campaignName: campaign.name });
    }
  }
  return rows.filter(row => row.id && row.entityType);
}

function minBid(entityType, row) {
  const name = String(row.campaignName || '').toLowerCase();
  if ((entityType === 'sbKeyword' || entityType === 'sbTarget') && name.includes('sbv')) return 0.25;
  return 0.05;
}

function makeBidAction(row, suggestedBid, reason, evidence, riskLevel = 'low') {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid: num(row.bid),
    suggestedBid,
    reason,
    evidence,
    confidence: 0.78,
    riskLevel,
    actionSource: ['generator_candidate'],
  };
}

function makeStateAction(row, actionType, reason, evidence, riskLevel = 'low') {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType,
    reason,
    evidence,
    confidence: 0.74,
    riskLevel,
    actionSource: ['generator_candidate'],
  };
}

function makeReviewAction(card, reason, evidence, riskLevel = 'manual_review') {
  return {
    id: `review::${card.sku}::listing_image_gate`,
    entityType: 'skuCandidate',
    actionType: 'review',
    reason,
    evidence,
    confidence: 0.7,
    riskLevel,
    actionSource: ['generator_candidate'],
  };
}

function generatePlans(snapshot = {}, options = {}) {
  const limit = Number(options.limit || process.env.ADJUST_ACTION_LIMIT || 180);
  const maxActionsPerSku = Number(options.maxActionsPerSku || process.env.MAX_ADJUST_ACTIONS_PER_SKU || 12);
  const totalCards = (snapshot.productCards || []).length;
  const imageReviewBudget = options.imageReviewBudget != null
    ? Number(options.imageReviewBudget)
    : Math.max(0, Math.floor(totalCards * 0.01));
  const plans = [];
  let actionCount = 0;
  let imageReviewUsed = 0;
  const seen = new Set();

  for (const card of snapshot.productCards || []) {
    if (actionCount >= limit) break;
    const profit = num(card.profitRate);
    const invDays = num(card.invDays);
    const sold30 = num(card.unitsSold_30d);
    const q2Signals = resolveQ2Signals(card);
    const q2 = q2Signals.q2Primary || (q2Signals.q2Secondary && q2Signals.visual.visualReady);
    const ad30 = card.adStats?.['30d'] || {};
    const adShareLow = num(card.adDependency) < 0.07 || num(ad30.spend) < Math.max(8, sold30 * 0.4);
    const stuckRisk = invDays >= 90 && sold30 < 30;
    const yoySalesPct = normalizePct(card.yoySalesPct);
    const yoyUnitsPct = normalizePct(card.yoyUnitsPct);
    const yoyDecline = Math.min(yoySalesPct, yoyUnitsPct);
    const yoyDownHard = yoyDecline <= -0.30;
    const yoyDownModerate = yoyDecline <= -0.20;
    const oldProductRecovery = yoyDownModerate && profit >= 0.1 && invDays >= 30;
    const stagnantOpportunity = profit < 0.1 && invDays >= 60 && (q2 || stuckRisk || yoyDownHard);
    if (profit >= 0.1) {
      if (invDays < 20) continue;
    } else if (!stagnantOpportunity) {
      continue;
    }
    const entities = collectEntities(card);
    const actions = [];
    const seasonalPushNeedsImageReview =
      !q2Signals.visual.visualReady &&
      q2Signals.rationale === 'listing_text_hint_only';
    const evidenceBase = [
      `profit=${(profit * 100).toFixed(1)}%`,
      `invDays=${invDays}`,
      `sold30=${sold30}`,
      `q2=${q2}`,
      `q2Signal=${q2Signals.rationale}`,
      `listingHasImages=${q2Signals.visual.hasImages}`,
      `listingImageCount=${q2Signals.visual.imageCount}`,
      `listingMainImage=${q2Signals.visual.mainImageUrl || 'none'}`,
      `adShareLow=${adShareLow}`,
      `stuckRisk=${stuckRisk}`,
      `yoySalesPct=${yoySalesPct}`,
      `yoyUnitsPct=${yoyUnitsPct}`,
      `oldProductRecovery=${oldProductRecovery}`,
      `stagnantOpportunity=${stagnantOpportunity}`,
    ];

    if (seasonalPushNeedsImageReview && imageReviewUsed < imageReviewBudget) {
      imageReviewUsed += 1;
      plans.push({
        sku: card.sku,
        asin: card.asin,
        summary: `利润导向调整：该 SKU 有主题/季节推动线索，但 listing 图片缺失，先人工确认图片是否还匹配当前卖点。`,
        actions: [
          makeReviewAction(
            card,
            '当前更看重图片而不是旧文案；这个 SKU 存在主题推动线索，但 listing 图片未抓到，先人工确认主图/副图是否仍匹配当前卖点，再决定是否激进推进。',
            evidenceBase,
            'image_review_required'
          ),
        ],
      });
      continue;
    }

    const ranked = entities
      .map(row => {
        const s7 = row.stats7d || {};
        const s30 = row.stats30d || {};
        const isStateOnly = row.entityType === 'productAd' || row.entityType === 'sbCampaign';
        const score =
          num(s30.orders) * 10 +
          num(s7.orders) * 12 +
          (num(s30.acos) > 0 && num(s30.acos) <= 0.25 ? 12 : 0) +
          (isPaused(row.state) && (q2 || stuckRisk || adShareLow || oldProductRecovery || stagnantOpportunity) ? 18 : 0) +
          (isStateOnly && isPaused(row.state) ? 10 : 0) +
          (oldProductRecovery ? 20 : 0) +
          (stagnantOpportunity ? 18 : 0) +
          (yoyDownHard ? 12 : 0) +
          (q2Signals.visual.visualReady ? 4 : 0) +
          (num(s7.spend) > 4 && num(s7.orders) === 0 ? -8 : 0) +
          (num(s7.acos) > 0.35 && !oldProductRecovery && !stagnantOpportunity ? -7 : 0);
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.row);

    for (const row of ranked) {
      if (actionCount + actions.length >= limit) break;
      if (actions.length >= maxActionsPerSku) break;
      const key = `${row.entityType}:${row.id}`;
      if (seen.has(key)) continue;

      const bid = num(row.bid);
      const s7 = row.stats7d || {};
      const s30 = row.stats30d || {};
      const orders7 = num(s7.orders);
      const orders30 = num(s30.orders);
      const spend7 = num(s7.spend);
      const acos7 = num(s7.acos);
      const acos30 = num(s30.acos);
      const clicks30 = num(s30.clicks);
      const impressions30 = num(s30.impressions);
      const min = minBid(row.entityType, row);
      const coverageWeak = clicks30 < 25 || impressions30 < 2500;
      const productMatch = scoreTermRelevance(row.label || row.campaignName || '', card.productProfile || {});
      const productMatchWeak = productMatch.level === 'conflict' || (productMatch.score != null && productMatch.score < 0.35);
      const evidence = [
        ...evidenceBase,
        `entity=${row.entityType}`,
        `bid=${bid}`,
        `orders7=${orders7}`,
        `orders30=${orders30}`,
        `acos7=${acos7}`,
        `acos30=${acos30}`,
        `clicks30=${clicks30}`,
        `impressions30=${impressions30}`,
        `coverageWeak=${coverageWeak}`,
        `productMatch=${productMatch.score ?? 'unknown'}`,
        `productMatchLevel=${productMatch.level}`,
        `productMatchHits=${(productMatch.matched || []).join(',') || 'none'}`,
        `productMatchConflicts=${(productMatch.conflicts || []).join(',') || 'none'}`,
      ];

      if (isPaused(row.state) && !productMatchWeak && (q2 || stuckRisk || adShareLow || oldProductRecovery || stagnantOpportunity)) {
        const reason = stagnantOpportunity
          ? '滞销库存有节点或恢复机会，先恢复低风险历史流量，观察展示、点击和订单再决定是否放量。'
          : oldProductRecovery
          ? '同比下滑明显，但 SKU 仍有利润和库存承接，先恢复历史投放对象把流量拉回来。'
          : '当前对象处于暂停，SKU 仍有利润/库存/窗口机会，先恢复覆盖观察点击和转化。';
        actions.push(makeStateAction(row, 'enable', reason, evidence, stagnantOpportunity ? 'stagnant_opportunity' : (oldProductRecovery ? 'yoy_recovery' : 'coverage_recovery')));
        seen.add(key);
        continue;
      }

      if (row.entityType === 'productAd' || row.entityType === 'sbCampaign') continue;
      if (!isEnabled(row.state) || bid <= 0) continue;

      if ((orders7 >= 1 || orders30 >= 2 || (oldProductRecovery && coverageWeak) || (stagnantOpportunity && orders30 >= 1 && coverageWeak)) &&
          (acos7 === 0 || acos7 <= 0.28 || acos30 <= 0.28 || oldProductRecovery || stagnantOpportunity) &&
          !productMatchWeak &&
          (q2 || adShareLow || stuckRisk || sold30 >= 30 || oldProductRecovery || stagnantOpportunity)) {
        const factor = stagnantOpportunity ? 1.05 : (oldProductRecovery ? 1.12 : (sold30 >= 80 || q2 ? 1.12 : 1.08));
        const next = roundBid(bid * factor, min);
        if (next > bid) {
          const reason = stagnantOpportunity
            ? '滞销 SKU 有库存压力和时间窗口，只对已有承接的流量小幅提价，不做激进放量。'
            : oldProductRecovery
            ? '老品同比下滑明显，但库存和利润还能承接，先小幅提价修复展示和点击。'
            : (q2Signals.visual.hasImages
              ? '当前对象已有转化或承接基础，且产品画像/图片信号可用，先小幅提价扩大曝光。'
              : '当前对象已有转化或承接基础，但图片信号不足，先小幅提价测试，不做激进放量。');
          actions.push(makeBidAction(row, next, reason, evidence, stagnantOpportunity ? 'stagnant_opportunity' : (oldProductRecovery ? 'yoy_recovery' : 'profit_scale')));
          seen.add(key);
          continue;
        }
      }

      if (!oldProductRecovery && !stagnantOpportunity && ((spend7 >= 4 && orders7 === 0) || (acos7 > 0.35 && spend7 >= 3))) {
        const next = roundBid(bid * 0.9, min);
        if (next < bid) {
          actions.push(makeBidAction(row, next, '近 7 天消耗偏低效，先小幅降价，把预算让给更有把握的对象。', evidence, 'efficiency_control'));
          seen.add(key);
          continue;
        }
      }

      if (!oldProductRecovery && !stagnantOpportunity && productMatchWeak && spend7 >= 3 && orders7 === 0) {
        const next = roundBid(bid * 0.85, min);
        if (next < bid) {
          actions.push(makeBidAction(row, next, '投放词和产品画像匹配度偏低，且近 7 天有消耗无订单，先小幅降价控错流量。', evidence, 'relevance_control'));
          seen.add(key);
          continue;
        }
      }

      if (!oldProductRecovery && !stagnantOpportunity && !q2 && !stuckRisk && spend7 >= 8 && orders7 === 0 && sold30 < 10) {
        actions.push(makeStateAction(row, 'pause', '非当前重点窗口，且近 7 天明显消耗无订单，先暂停止损。', evidence, 'waste_pause'));
        seen.add(key);
      }
    }

    if (actions.length) {
      actionCount += actions.length;
      plans.push({
        sku: card.sku,
        asin: card.asin,
        summary: `利润导向调整：利润率 ${(profit * 100).toFixed(1)}%，库存 ${invDays} 天，30 天销量 ${sold30}；listing 图片信号 ${q2Signals.visual.hasImages ? `已抓取(${q2Signals.visual.imageCount})` : '缺失'}。`,
        actions,
      });
    }
  }

  return plans;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', 'profit_adjust_candidate_schema_2026-04-23.json');
  const limit = Number(process.argv[4] || process.env.ADJUST_ACTION_LIMIT || 180);
  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_profit_adjust_schema.js <snapshot.json> [output.json] [limit]');
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plans = generatePlans(snapshot, { limit });
  const flat = plans.flatMap(p => p.actions.map(a => ({ sku: p.sku, entityType: a.entityType, actionType: a.actionType })));

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    plannedSkus: plans.length,
    plannedActions: flat.length,
    counts: flat.reduce((acc, item) => {
      acc[item.actionType] = (acc[item.actionType] || 0) + 1;
      acc[item.entityType] = (acc[item.entityType] || 0) + 1;
      return acc;
    }, {}),
    topSkus: plans.slice(0, 12).map(p => ({ sku: p.sku, actions: p.actions.length, summary: p.summary })),
  }, null, 2));
}

module.exports = {
  generatePlans,
  listingVisualSignals,
  resolveQ2Signals,
  makeReviewAction,
};

if (require.main === module) {
  main();
}
