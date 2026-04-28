const fs = require('fs');
const path = require('path');
const {
  enrichSnapshotWithProfiles,
  loadProfileCache,
  saveProfileCache,
  scoreTermRelevance,
} = require('../../src/product_profile');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundBid(value) {
  return Number(Math.max(0.03, value).toFixed(2));
}

function priceBidAnchor(card) {
  const price = num(card.price);
  if (price >= 60) return 0.85;
  if (price >= 45) return 0.7;
  if (price >= 30) return 0.55;
  if (price >= 18) return 0.42;
  if (price >= 10) return 0.32;
  return 0.24;
}

function deservedBid(card, row = null) {
  const ctxBid = num(card.createContext?.recommendedDefaultBid);
  const stats = skuAdStats(card);
  const cpc = stats.clicks ? stats.spend / stats.clicks : 0;
  const rowCpc = row?.s30?.clicks ? row.s30.spend / row.s30.clicks : 0;
  const anchor = Math.max(priceBidAnchor(card), ctxBid, cpc * 1.25, rowCpc * 1.2);
  const cap = row?.entityType?.startsWith('sb') ? 1.1 : 1.35;
  return roundBid(Math.min(cap, Math.max(0.12, anchor)));
}

function isEnabled(state) {
  return ['1', 'enabled', 'enable', 'active'].includes(String(state).toLowerCase());
}

function isPaused(state) {
  return ['2', 'paused', 'disabled', 'paused'].includes(String(state).toLowerCase());
}

function rowStats(row, window = 'stats30d') {
  const s = row[window] || {};
  return {
    spend: num(s.spend),
    sales: num(s.sales),
    orders: num(s.orders),
    clicks: num(s.clicks),
    impressions: num(s.impressions),
    acos: num(s.acos),
  };
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function listingSummary(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  return [
    `listingTitle=${normalizeText(listing.title || profile.listingTitle).slice(0, 120) || 'none'}`,
    `profileType=${normalizeText(profile.productType) || 'unknown'}`,
    `profileAudience=${(profile.targetAudience || []).join('|') || 'none'}`,
    `profileOccasion=${(profile.occasion || []).join('|') || 'none'}`,
    `profileConfidence=${num(profile.confidence)}`,
    `listingImages=${(listing.imageUrls || []).length || num(profile.imageCount)}`,
  ];
}

function rowRelevance(card, row) {
  const text = normalizeText(row.label || row.campaignName || row.targetType || '');
  return scoreTermRelevance(text, card.productProfile || {});
}

function collectRows(card, adjustedIds) {
  const rows = [];
  for (const campaign of card.campaigns || []) {
    for (const row of campaign.keywords || []) {
      rows.push({ ...row, entityType: 'keyword', label: row.text || '', campaignName: campaign.name || '' });
    }
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', label: row.text || row.targetType || 'auto', campaignName: campaign.name || '' });
    }
    for (const row of campaign.sponsoredBrands || []) {
      rows.push({ ...row, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword', label: row.text || '', campaignName: campaign.name || '' });
    }
  }
  return rows
    .filter(row => row.id && row.entityType && !adjustedIds.has(String(row.id)))
    .map(row => ({
      ...row,
      bidNum: num(row.bid),
      s7: rowStats(row, 'stats7d'),
      s30: rowStats(row, 'stats30d'),
      relevance: rowRelevance(card, row),
    }));
}

function skuAdStats(card) {
  const sp = card.adStats?.['30d'] || {};
  const sb = card.sbStats?.['30d'] || {};
  const spend = num(sp.spend) + num(sb.spend);
  const sales = num(sp.sales) + num(sb.sales);
  const orders = num(sp.orders) + num(sb.orders);
  const clicks = num(sp.clicks) + num(sb.clicks);
  const impressions = num(sp.impressions) + num(sb.impressions);
  return {
    spend,
    sales,
    orders,
    clicks,
    impressions,
    acos: sales ? spend / sales : (spend > 5 ? 99 : 0),
  };
}

function actionEvidence(card, row, stats, extra = []) {
  return [
    'scope=fulFillable>1 full loop',
    `fulFillable=${num(card.fulFillable)}`,
    `profit=${(num(card.profitRate) * 100).toFixed(1)}%`,
    `invDays=${num(card.invDays)}`,
    `sold7=${num(card.unitsSold_7d)}`,
    `sold30=${num(card.unitsSold_30d)}`,
    `entity=${row.entityType}`,
    `label=${String(row.label || row.campaignName || '').slice(0, 90)}`,
    `currentBid=${row.bidNum}`,
    `impressions30=${stats.impressions}`,
    `clicks30=${stats.clicks}`,
    `orders30=${stats.orders}`,
    `spend30=${stats.spend}`,
    `sales30=${stats.sales}`,
    `acos30=${stats.acos}`,
    `productMatch=${row.relevance?.score ?? 'unknown'}`,
    `productMatchLevel=${row.relevance?.level || 'unknown'}`,
    `productMatchHits=${(row.relevance?.matched || []).join('|') || 'none'}`,
    `productMatchConflicts=${(row.relevance?.conflicts || []).join('|') || 'none'}`,
    ...listingSummary(card),
    ...extra,
  ];
}

function makeBidAction(card, row, nextBid, reason, riskLevel, confidence = 0.78) {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid: row.bidNum,
    suggestedBid: nextBid,
    allowLargeBidChange: true,
    reason,
    evidence: actionEvidence(card, row, row.s30, [`skuAcos30=${skuAdStats(card).acos}`]),
    confidence,
    riskLevel: 'traffic_push',
    originalRiskLevel: riskLevel,
    actionSource: ['strategy'],
  };
}

function makeStateAction(card, row, actionType, reason, riskLevel) {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType,
    reason,
    evidence: actionEvidence(card, row, row.s30),
    confidence: 0.72,
    riskLevel: 'traffic_push',
    originalRiskLevel: riskLevel,
    actionSource: ['strategy'],
  };
}

function fallbackTerms(card) {
  const seeds = (card.createContext?.keywordSeeds || []).map(String).filter(Boolean);
  if (seeds.length) return seeds.slice(0, 4);
  const title = String(card.listing?.title || '').toLowerCase();
  if (/christian|faith|bible|prayer/.test(title)) return ['christian gifts', 'faith based gifts', 'inspirational gifts'];
  if (/teacher/.test(title)) return ['teacher appreciation gifts', 'teacher gifts'];
  if (/nurse/.test(title)) return ['nurse appreciation gifts', 'nurse gifts'];
  if (/graduat/.test(title)) return ['graduation gifts', 'class of 2026'];
  if (/flower|floral|bouquet|rose/.test(title)) return ['flower decor', 'floral decorations'];
  return [String(card.sku || '').toLowerCase()];
}

function makeCreateAction(card, reason) {
  const ctx = card.createContext || {};
  const bid = deservedBid(card);
  const sold30 = num(card.unitsSold_30d);
  const invDays = num(card.invDays);
  const budget = Math.max(
    8,
    Math.min(40, Math.ceil((sold30 >= 30 ? 20 : sold30 >= 10 ? 15 : 10) + (invDays >= 180 ? 5 : 0)))
  );
  return {
    id: `create::${card.sku}::auto::auto::ful full loop ${String(card.sku).toLowerCase()} auto`,
    entityType: 'skuCandidate',
    actionType: 'create',
    createInput: {
      advType: 'SP',
      mode: 'auto',
      sku: card.sku,
      asin: card.asin,
      accountId: ctx.accountId,
      siteId: ctx.siteId || 4,
      dailyBudget: budget,
      defaultBid: bid,
      coreTerm: `ful full loop ${String(card.sku).toLowerCase()} auto`,
      matchType: '',
      keywords: [],
    },
    reason,
    evidence: [
      'scope=fulFillable>1 full loop',
      `fulFillable=${num(card.fulFillable)}`,
      `profit=${(num(card.profitRate) * 100).toFixed(1)}%`,
      `invDays=${num(card.invDays)}`,
      `sold7=${num(card.unitsSold_7d)}`,
      `sold30=${num(card.unitsSold_30d)}`,
      `skuImpressions30=${skuAdStats(card).impressions}`,
      `skuClicks30=${skuAdStats(card).clicks}`,
      `fallbackTerms=${fallbackTerms(card).join('|')}`,
      ...listingSummary(card),
    ],
    confidence: 0.74,
    riskLevel: 'traffic_push',
    allowLargeBudgetChange: true,
    originalRiskLevel: 'full_loop_create',
    actionSource: ['strategy'],
  };
}

function chooseAction(card, adjustedIds) {
  const rows = collectRows(card, adjustedIds);
  const enabled = rows.filter(row => isEnabled(row.state) && row.bidNum > 0);
  const paused = rows.filter(row => isPaused(row.state));
  const skuStats = skuAdStats(card);
  const profit = num(card.profitRate);
  const relevanceScore = row => row.relevance?.score == null ? 0.25 : num(row.relevance.score);
  const conflictPenalty = row => row.relevance?.level === 'conflict' ? 100 : 0;

  const waste = enabled
    .filter(row => row.s30.clicks >= 8 || row.s30.spend >= 4 || row.s7.spend >= 2)
    .sort((a, b) => {
      const aAcos = a.s30.sales ? a.s30.spend / a.s30.sales : (a.s30.spend > 0 ? 99 : 0);
      const bAcos = b.s30.sales ? b.s30.spend / b.s30.sales : (b.s30.spend > 0 ? 99 : 0);
      return (bAcos - aAcos) || (conflictPenalty(b) - conflictPenalty(a)) || (b.s30.spend - a.s30.spend);
    });

  if ((profit < 0 || skuStats.acos > 0.35) && waste.length) {
    const row = waste[0];
    const next = roundBid(row.bidNum * (profit < 0 ? 0.65 : 0.75));
    if (next < row.bidNum) {
      return makeBidAction(card, row, next, 'Full ful>1 loop: SKU has margin/ACOS pressure, so reduce the worst inefficient writable object instead of leaving the SKU unadjusted.', profit < 0 ? 'margin_recovery_cut' : 'acos_control_cut');
    }
  }

  const converters = enabled
    .filter(row => row.s30.orders > 0 && (row.s30.sales ? row.s30.spend / row.s30.sales : 99) <= 0.28)
    .sort((a, b) => (relevanceScore(b) - relevanceScore(a)) || (b.s30.orders - a.s30.orders) || (b.s30.clicks - a.s30.clicks));
  if (profit >= 0.05 && converters.length) {
    const row = converters[0];
    const next = roundBid(Math.max(row.bidNum * 1.25, deservedBid(card, row)));
    if (next > row.bidNum) {
      return makeBidAction(card, row, next, 'Full ful>1 loop: SKU has sellable inventory and this object has proven orders at acceptable ACOS; lift lightly to learn whether more traffic scales.', 'controlled_scale_up', 0.8);
    }
  }

  const lowExposure = enabled
    .filter(row => (row.s30.impressions < 500 || row.s30.clicks < 5) && row.relevance?.level !== 'conflict')
    .sort((a, b) => (relevanceScore(b) - relevanceScore(a)) || (a.s30.impressions - b.s30.impressions) || (a.s30.clicks - b.s30.clicks));
  if (lowExposure.length) {
    const row = lowExposure[0];
    const next = roundBid(Math.max(row.bidNum * 1.35, deservedBid(card, row)));
    if (next > row.bidNum) {
      return makeBidAction(card, row, next, 'Full ful>1 loop: SKU has inventory but this object has insufficient impressions/clicks; lift bid to force a measurable traffic test.', 'coverage_repair', 0.78);
    }
  }

  if (paused.length) {
    const row = [...paused].sort((a, b) => (relevanceScore(b) - relevanceScore(a)) || (b.s30.orders - a.s30.orders))[0];
    return makeStateAction(card, row, 'enable', 'Full ful>1 loop: no better writable bid action was available; enable one paused object to create a measurable test.', 'coverage_reopen');
  }

  if (enabled.length) {
    const row = enabled.sort((a, b) => (conflictPenalty(b) - conflictPenalty(a)) || (b.s30.spend - a.s30.spend))[0];
    const next = roundBid(row.bidNum * 0.8);
    if (next < row.bidNum) {
      return makeBidAction(card, row, next, 'Full ful>1 loop: fallback adjustment after SKU review; trim the largest active spend object slightly so the SKU is not left without a closed-loop action.', 'full_loop_fallback_trim', 0.7);
    }
  }

  return makeCreateAction(card, 'Full ful>1 loop: no writable existing ad object found after SKU review; create one low-budget SP auto campaign to discover whether the SKU can get traffic.');
}

function loadAdjustedIds(files) {
  const ids = new Set();
  for (const file of files) {
    try {
      const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const item of plan || []) for (const action of item.actions || []) ids.add(String(action.id));
    } catch (_) {}
  }
  return ids;
}

function generate(snapshot, options = {}) {
  const adjustedIds = loadAdjustedIds(options.adjustedFiles || []);
  const plans = [];
  for (const card of snapshot.productCards || []) {
    if (num(card.fulFillable) <= 1) continue;
    if (!card.sku || !card.asin) continue;
    const action = chooseAction(card, adjustedIds);
    plans.push({
      sku: card.sku,
      asin: card.asin,
      summary: `Full ful>1 loop: reviewed SKU with fulFillable=${num(card.fulFillable)}, profit=${(num(card.profitRate) * 100).toFixed(1)}%, invDays=${num(card.invDays)}, sold30=${num(card.unitsSold_30d)}; action=${action.actionType}.`,
      actions: [action],
    });
  }
  return plans;
}

function main() {
  const snapshotFile = process.argv[2] || path.join('data', 'snapshots', 'latest_snapshot.json');
  const outputFile = process.argv[3] || path.join('data', 'snapshots', 'ful_full_loop_schema_2026-04-27.json');
  const rawSnapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const cache = loadProfileCache();
  const enriched = enrichSnapshotWithProfiles(rawSnapshot, { cache });
  saveProfileCache(enriched.cache);
  const snapshot = enriched.snapshot;
  if (optionsWriteProfiledSnapshot(outputFile)) {
    const profiledFile = outputFile.replace(/\.json$/i, '_profiled_input.json');
    fs.writeFileSync(profiledFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }
  const plans = generate(snapshot, {
    adjustedFiles: [
      path.join('data', 'snapshots', 'weekly_focus_action_schema_2026-04-27.json'),
      path.join('data', 'snapshots', 'weekly_focus_coverage_supplement_schema_2026-04-27.json'),
    ],
  });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  const actions = plans.flatMap(plan => plan.actions);
  console.log(JSON.stringify({
    outputFile,
    skus: plans.length,
    actions: actions.length,
    bid: actions.filter(action => action.actionType === 'bid').length,
    up: actions.filter(action => action.actionType === 'bid' && action.suggestedBid > action.currentBid).length,
    down: actions.filter(action => action.actionType === 'bid' && action.suggestedBid < action.currentBid).length,
    enable: actions.filter(action => action.actionType === 'enable').length,
    create: actions.filter(action => action.actionType === 'create').length,
  }, null, 2));
}

function optionsWriteProfiledSnapshot(outputFile) {
  return process.env.WRITE_PROFILED_INPUT === '1' && /\.json$/i.test(outputFile);
}

module.exports = { generate };

if (require.main === module) main();
