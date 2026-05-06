const { assessAdOperatingContext } = require('./inventory_economics');
const { daysBetween, findLastAdjustment } = require('./adjustment_log');
const { getSeasonWindows, matchProductSeason } = require('./season_calendar');
const { buildProductProfile } = require('./product_profile');

const SIGNAL_PRIORITY_HINT = {
  profit_bleeding: 95,
  stale_inventory_risk: 88,
  reserved_page_watch: 84,
  season_peak: 78,
  season_preheat: 72,
  inventory_tight: 68,
  ad_structure_missing: 55,
  season_tail: 45,
  seven_day_unadjusted: 25,
  review_required: 20,
};

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').trim();
}

function salesSignals(card = {}) {
  return {
    units3d: num(card.unitsSold_3d),
    units7d: num(card.unitsSold_7d),
    units15d: num(card.unitsSold_15d),
    units30d: num(card.unitsSold_30d),
    profitRate: num(card.profitRate),
    netProfit: num(card.netProfit),
    yoySalesPct: num(card.yoySalesPct, null),
    yoyUnitsPct: num(card.yoyUnitsPct, null),
  };
}

function adWindow(card = {}, key) {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  const spend = num(sp.spend) + num(sb.spend);
  const orders = num(sp.orders) + num(sb.orders);
  const sales = num(sp.sales) + num(sb.sales);
  const acos = sales > 0 ? spend / sales : Math.max(num(sp.acos), num(sb.acos));
  return {
    spend,
    orders,
    sales,
    acos,
    roas: spend > 0 && sales > 0 ? sales / spend : 0,
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function adSignals(card = {}) {
  return {
    d3: adWindow(card, '3d'),
    d7: adWindow(card, '7d'),
    d30: adWindow(card, '30d'),
    adDependency: num(card.adDependency),
    spCoverage: card.createContext?.coverage || {},
  };
}

function inventorySignals(card = {}) {
  const inv = card.inventory || card.skuInvData || {};
  return {
    ful: num(card.fulFillable ?? card.fulfillable ?? inv.ful ?? inv.fulfillable ?? inv.fulFillable),
    res: num(card.reservedQty ?? inv.res ?? inv.reserved),
    inb: num(card.inboundQty ?? inv.inb ?? inv.inbound),
    local: num(card.localInventory ?? inv.local ?? inv.localInventory),
    sellableDays: num(card.invDays),
    staleRisk: num(card.invDays) >= 90 && num(card.unitsSold_30d) <= 3,
  };
}

function productStructure(card = {}) {
  const cachedProfile = card.productProfile || {};
  const hasSeedEvidence = Array.isArray(card.createContext?.keywordSeeds) && card.createContext.keywordSeeds.length > 0;
  const cachedHasListingEvidence = Boolean(cachedProfile.listingTitle || cachedProfile.hasImages || cachedProfile.categoryPath);
  const seedProfile = hasSeedEvidence && !cachedHasListingEvidence ? buildProductProfile(card) : null;
  const profile = seedProfile ? {
    ...cachedProfile,
    productType: seedProfile.productType !== 'unknown' ? seedProfile.productType : cachedProfile.productType,
    productTypes: [...new Set([...(cachedProfile.productTypes || []), ...(seedProfile.productTypes || [])])],
    targetAudience: [...new Set([...(seedProfile.targetAudience || []), ...(cachedProfile.targetAudience || [])])],
    occasion: [...new Set([...(seedProfile.occasion || []), ...(cachedProfile.occasion || [])])],
    seasonality: [...new Set([...(seedProfile.seasonality || []), ...(cachedProfile.seasonality || [])])],
    visualTheme: [...new Set([...(seedProfile.visualTheme || []), ...(cachedProfile.visualTheme || [])])],
    positioning: seedProfile.positioning || cachedProfile.positioning,
  } : cachedProfile;
  const saleStatus = text(card.saleStatus);
  return {
    lifecycle: card.opendate || card.fuldate ? 'opened' : 'new',
    productType: profile.productType || 'unknown',
    isSeasonal: card.isSeasonal === true || (profile.seasonality || []).length > 0 || (profile.occasion || []).length > 0,
    isReservedPage: card.reserved === true || /reserved|保留页面|淇濈暀椤甸潰/i.test(saleStatus),
    variantGroup: card.variationGroup || card.parentAsin || profile.variationGroup || '',
    takeover: /takeover|跟卖|承接|璺熷崠|鎵挎帴/i.test(`${card.note || ''} ${profile.positioning || ''}`),
    profile,
  };
}

function missingDataFor(card = {}) {
  const missing = [];
  if (!card.sku) missing.push('sku');
  if (!card.asin) missing.push('asin');
  if (card.profitRate === undefined || card.profitRate === null || card.profitRate === '') missing.push('profitRate');
  if (card.invDays === undefined || card.invDays === null || card.invDays === '') missing.push('invDays');
  if (!card.adStats || !card.adStats['30d']) missing.push('adStats.30d');
  if (card.unitsSold_7d === undefined && card.unitsSold_30d === undefined) missing.push('sales 7/30d');
  if (!card.productProfile) missing.push('productProfile');
  return missing;
}

function makeSignal(type, reason, options = {}) {
  return {
    type,
    reason,
    priorityHint: SIGNAL_PRIORITY_HINT[type] || 10,
    executableHint: options.executableHint === true,
    reviewHint: options.reviewHint === true,
    hardBlockHint: options.hardBlockHint === true,
    dataMissing: options.dataMissing || [],
  };
}

function directionForSignal(type) {
  if (['season_preheat', 'season_peak', 'ad_structure_missing'].includes(type)) return 'up';
  if (['profit_bleeding', 'season_tail', 'stale_inventory_risk'].includes(type)) return 'down';
  return '';
}

function cooldownForSignal(sku, signal, adjustments, timeContext, cooldownDays = 7) {
  const direction = directionForSignal(signal.type);
  if (!direction) return null;
  const last = findLastAdjustment(adjustments, sku, { direction });
  if (!last) return null;
  const ageDays = daysBetween(last.runAt, timeContext.runAt);
  return {
    active: ageDays !== null && ageDays < cooldownDays,
    ageDays,
    cooldownDays,
    direction,
    lastAdjustedAt: last.runAt,
    signalType: signal.type,
  };
}

function buildCandidateTaskContexts(input = {}) {
  const snapshot = input.snapshot || {};
  const time = input.timeContext;
  if (!time) throw new Error('timeContext is required');
  const adjustments = input.adjustments || [];
  const seasonWindows = getSeasonWindows(time.businessDate);
  const candidateContexts = [];
  const dataMissing = [];

  for (const card of snapshot.productCards || []) {
    const missing = missingDataFor(card);
    const sales = salesSignals(card);
    const ads = adSignals(card);
    const inventory = inventorySignals(card);
    const structure = productStructure(card);
    const operating = assessAdOperatingContext(card, { currentDate: time.businessDate });
    const matchedSeasons = matchProductSeason(structure.profile, seasonWindows);
    const matchedSeasonFacts = matchedSeasons.map(window => ({ key: window.key, label: window.label, phase: window.phase }));
    const matchedOffseason = matchedSeasonFacts.some(window => window.phase === 'offseason');
    const listingOverseason = operating.readiness?.disallowNewAds ||
      /do_not_push|hold_wait|page_hold|listing_update/.test(String(operating.finalAction || ''));
    const possibleSignals = [];

    if (missing.length) {
      dataMissing.push({ sku: card.sku || '', asin: card.asin || '', missing });
      possibleSignals.push(makeSignal('review_required', `missing required data: ${missing.join(', ')}`, {
        hardBlockHint: true,
        reviewHint: true,
        dataMissing: missing,
      }));
    }

    if (structure.isReservedPage && (listingOverseason || matchedOffseason)) {
      possibleSignals.push(makeSignal('reserved_page_watch', 'reserved page with over-season or listing-fit risk', {
        hardBlockHint: true,
        reviewHint: true,
      }));
    }

    if (ads.d7.spend >= 5 && ads.d7.orders === 0 && sales.profitRate < 0.18) {
      possibleSignals.push(makeSignal('profit_bleeding', `7d ad spend ${ads.d7.spend.toFixed(2)} with 0 orders and profit ${(sales.profitRate * 100).toFixed(1)}%`, {
        executableHint: true,
      }));
    }

    if (inventory.staleRisk || (inventory.sellableDays >= 120 && sales.units30d <= 5)) {
      possibleSignals.push(makeSignal('stale_inventory_risk', `sellable days ${inventory.sellableDays}, 30d units ${sales.units30d}`, {
        executableHint: !structure.isReservedPage,
        reviewHint: structure.isReservedPage,
      }));
    }

    if (inventory.sellableDays > 0 && inventory.sellableDays < 21 && sales.units7d > 0) {
      possibleSignals.push(makeSignal('inventory_tight', `sellable days ${inventory.sellableDays}, 7d units ${sales.units7d}`, {
        reviewHint: true,
      }));
    }

    const coverage = ads.spCoverage || {};
    if (!coverage.hasSpAuto || !coverage.hasSpKeyword || !coverage.hasSpManual) {
      possibleSignals.push(makeSignal('ad_structure_missing', 'SP structure incomplete from createContext coverage', {
        executableHint: !(structure.isReservedPage || listingOverseason),
        reviewHint: structure.isReservedPage || listingOverseason,
      }));
    }

    for (const window of matchedSeasonFacts) {
      if (window.phase === 'preheat') {
        possibleSignals.push(makeSignal('season_preheat', `${window.label} preheat window`, {
          executableHint: !listingOverseason && !structure.isReservedPage,
          reviewHint: listingOverseason || structure.isReservedPage,
        }));
      } else if (window.phase === 'peak') {
        possibleSignals.push(makeSignal('season_peak', `${window.label} peak window`, {
          executableHint: sales.profitRate >= 0.18 && inventory.sellableDays >= 30 && !listingOverseason,
          reviewHint: !(sales.profitRate >= 0.18 && inventory.sellableDays >= 30 && !listingOverseason),
        }));
      } else if (window.phase === 'tail') {
        possibleSignals.push(makeSignal('season_tail', `${window.label} tail window`, { executableHint: true }));
      }
    }

    const lastAny = findLastAdjustment(adjustments, card.sku);
    const daysSinceAny = lastAny ? daysBetween(lastAny.runAt, time.runAt) : null;
    if (daysSinceAny === null || daysSinceAny >= 7) {
      possibleSignals.push(makeSignal('seven_day_unadjusted', lastAny ? `last adjustment ${daysSinceAny}d ago` : 'no prior adjustment log found', {
        reviewHint: true,
      }));
    }

    const cooldowns = possibleSignals
      .map(signal => cooldownForSignal(card.sku, signal, adjustments, time))
      .filter(Boolean);

    candidateContexts.push({
      contextId: `${time.sourceRunId}::${card.sku || card.asin || candidateContexts.length}`,
      sku: text(card.sku),
      asin: text(card.asin),
      site: text(card.salesChannel || card.site || 'Amazon.com'),
      groupKey: [structure.variantGroup, card.sku, card.asin].map(text).filter(Boolean).join('::'),
      runAt: time.runAt,
      businessDate: time.businessDate,
      dataDate: time.dataDate,
      siteTimezone: time.siteTimezone,
      sourceRunId: time.sourceRunId,
      facts: {
        sales,
        ads,
        inventory,
        productStructure: structure,
        seasonWindows: matchedSeasonFacts,
        operatingFinalAction: operating.finalAction,
      },
      possibleSignals,
      deterministicPriorityHint: Math.max(0, ...possibleSignals.map(signal => signal.priorityHint || 0)),
      dataMissing: missing,
      lastAdjustedAt: lastAny?.runAt || null,
      cooldowns,
      guardrailInputs: {
        reservedPage: structure.isReservedPage,
        listingOverseason,
        matchedOffseason,
        hasCriticalMissingData: missing.length > 0,
      },
    });
  }

  const summary = candidateContexts.reduce((acc, item) => {
    acc.total += 1;
    for (const signal of item.possibleSignals || []) {
      acc.bySignal[signal.type] = (acc.bySignal[signal.type] || 0) + 1;
    }
    if (item.dataMissing.length) acc.withDataMissing += 1;
    if (item.guardrailInputs.reservedPage && (item.guardrailInputs.listingOverseason || item.guardrailInputs.matchedOffseason)) {
      acc.reservedPageBlocked += 1;
    }
    return acc;
  }, { total: 0, bySignal: {}, withDataMissing: 0, dataMissing: dataMissing.length, reservedPageBlocked: 0 });

  return {
    generatedAt: time.runAt,
    time,
    seasonWindows,
    summary,
    dataMissing,
    candidateContexts,
    tasks: candidateContexts,
  };
}

module.exports = {
  SIGNAL_PRIORITY_HINT,
  buildCandidateTaskContexts,
  buildDailyTaskPool: buildCandidateTaskContexts,
};
