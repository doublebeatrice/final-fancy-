const fs = require('fs');
const path = require('path');
const { normalizePriceTargetTo99, validatePriceAction } = require('../../src/price_executor');
const {
  replenishmentCoverage7d,
  replenishmentUnits: replenishmentUnitCount,
} = require('../../src/local_inventory');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DATE = '2026-05-22';
const NORMAL_SALE = '\u6b63\u5e38\u9500\u552e';
const LARGE_POST_RAISE_UNITS_1D = 3;
const LARGE_POST_RAISE_UNITS_3D = 6;
const LARGE_POST_RAISE_UNITS_7D = 10;
const PRICE_RAISE_ABSORPTION_DAYS = 7;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = num(value, NaN);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function dateOnly(value) {
  const m = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function addDays(date, days) {
  const clean = dateOnly(date);
  if (!clean) return '';
  const [year, month, day] = clean.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function daysBetweenDateStrings(fromDate, toDate) {
  const from = dateOnly(fromDate);
  const to = dateOnly(toDate);
  if (!from || !to) return null;
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / 86400000);
}

function pct(value) {
  return `${(num(value) * 100).toFixed(1)}%`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function maxFieldNumber(sources = [], keys = []) {
  let best = null;
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = num(source[key], NaN);
      if (!Number.isFinite(value)) continue;
      best = best === null ? value : Math.max(best, value);
    }
  }
  return best;
}

function postRaiseSalesEvidence(item = {}, card = {}) {
  const sources = [item, card, item.priceEffect || {}, card.priceEffect || {}, item.postRaise || {}, card.postRaise || {}];
  const units1d = maxFieldNumber(sources, [
    'postPriceUnits1d',
    'postPriceUnits_1d',
    'postRaiseUnits1d',
    'postRaiseUnits_1d',
    'unitsAfterPriceRaise1d',
    'afterPriceUnits1d',
    'postPriceOrders1d',
    'postRaiseOrders1d',
  ]);
  const units3d = maxFieldNumber(sources, [
    'postPriceUnits3d',
    'postPriceUnits_3d',
    'postRaiseUnits3d',
    'postRaiseUnits_3d',
    'unitsAfterPriceRaise3d',
    'afterPriceUnits3d',
    'postPriceOrders3d',
    'postRaiseOrders3d',
  ]);
  const units7d = maxFieldNumber(sources, [
    'postPriceUnits7d',
    'postPriceUnits_7d',
    'postRaiseUnits7d',
    'postRaiseUnits_7d',
    'unitsAfterPriceRaise7d',
    'afterPriceUnits7d',
    'postPriceOrders7d',
    'postRaiseOrders7d',
  ]);
  const large =
    (units1d !== null && units1d >= LARGE_POST_RAISE_UNITS_1D) ||
    (units3d !== null && units3d >= LARGE_POST_RAISE_UNITS_3D) ||
    (units7d !== null && units7d >= LARGE_POST_RAISE_UNITS_7D);
  return {
    units1d,
    units3d,
    units7d,
    large,
    thresholds: `1d>=${LARGE_POST_RAISE_UNITS_1D} or 3d>=${LARGE_POST_RAISE_UNITS_3D} or 7d>=${LARGE_POST_RAISE_UNITS_7D}`,
  };
}

function recentPriceRaiseForSku(records = [], sku, businessDate) {
  const normalizedSku = String(sku || '').trim().toUpperCase();
  return safeArray(records)
    .filter(record => String(record?.sku || '').trim().toUpperCase() === normalizedSku)
    .filter(record => String(record?.actionType || '') === 'price')
    .filter(record => record?.dryRun !== true)
    .filter(record => num(record?.afterValue, NaN) > num(record?.beforeValue, NaN) || String(record?.direction || '').toLowerCase() === 'up')
    .filter(record => {
      const recordDate = dateOnly(record.businessDate || record.localDate || record.runAt);
      const age = daysBetweenDateStrings(recordDate, businessDate);
      return age !== null && age >= 0 && age <= PRICE_RAISE_ABSORPTION_DAYS;
    })
    .sort((a, b) => String(b.runAt || b.businessDate || '').localeCompare(String(a.runAt || a.businessDate || '')))[0] || null;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stateEnabled(value) {
  return value === 1 || value === '1' || String(value || '').toLowerCase() === 'enabled';
}

function fulResUnits(card = {}) {
  return num(card.fulFillable ?? card.fulfillable ?? card.stockFul) +
    num(card.reservedQty ?? card.reserved ?? card.stockRes);
}

function replenishmentUnits(card = {}) {
  return replenishmentUnitCount(card);
}

function sellableDaysFrom7dVelocity(card = {}, fallback = null) {
  const explicit = num(fallback, NaN);
  if (Number.isFinite(explicit)) return explicit;
  const units7 = num(card.unitsSold_7d);
  if (units7 <= 0) return null;
  return round(fulResUnits(card) / (units7 / 7), 1);
}

function replenishmentCoverage(card = {}, item = {}) {
  return replenishmentCoverage7d(card, {
    units7d: item.units7d ?? card.unitsSold_7d,
    fulResUnits: fulResUnits(card),
  });
}

function offAdState(card = {}) {
  const state = cleanText(card.advState ?? card.adState ?? card.ad_status ?? card.adStatus).toLowerCase();
  return state === 'off' || state === 'closed' || state === 'disabled' || state.includes('关');
}

function adPoint(card = {}) {
  for (const key of ['adv_point', 'adPoint', 'adCostShare']) {
    if (Object.prototype.hasOwnProperty.call(card, key)) return num(card[key], null);
  }
  return null;
}

function canSalesDays(card = {}, days) {
  return num(
    card[`can_sales_${days}_first`] ??
      card[`can_sales_${days}_second`] ??
      card[`can_sales_${days}_third`] ??
      card[`sellableDays_${days}d`] ??
      card[`dynamic_saleday${days}`],
    null,
  );
}

function adWindow(card = {}, key) {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  const spend = num(sp.spend ?? sp.Spend) + num(sb.spend ?? sb.Spend);
  const orders = num(sp.orders ?? sp.Orders) + num(sb.orders ?? sb.Orders);
  const clicks = num(sp.clicks ?? sp.Clicks) + num(sb.clicks ?? sb.Clicks);
  const impressions = num(sp.impressions ?? sp.Impressions) + num(sb.impressions ?? sb.Impressions);
  return { hasData: !!card.adStats?.[key] || !!card.sbStats?.[key], spend, orders, clicks, impressions };
}

function adRecoveryRouteForPrice(card = {}, replenishment = {}) {
  const d7 = adWindow(card, '7d');
  const point = adPoint(card);
  const lowAdShare = point !== null && point <= 0.01;
  const noEffectiveDelivery = d7.hasData && d7.impressions < 100 && d7.clicks < 3 && d7.orders === 0;
  const adSuppressed = offAdState(card) || lowAdShare || noEffectiveDelivery;
  if (!adSuppressed) return null;
  const can7 = canSalesDays(card, 7);
  const can30 = canSalesDays(card, 30);
  const inventoryCanConnect =
    (replenishment.totalSellableDays7d !== null && replenishment.totalSellableDays7d >= 15) ||
    can7 >= 15 ||
    can30 >= 15 ||
    replenishment.units > 0;
  if (!inventoryCanConnect) return null;
  return {
    advState: cleanText(card.advState ?? card.adState),
    advPoint: point,
    ad7dImpressions: d7.impressions,
    ad7dClicks: d7.clicks,
    ad7dOrders: d7.orders,
    canSales7d: can7,
    canSales30d: can30,
  };
}

function priceApplicationFromCard(card = {}, businessDate) {
  const applicationDate = dateOnly(card.price_apply_time || card.priceApplyTime || card.today_price_apply_time);
  const age = daysBetweenDateStrings(applicationDate, businessDate);
  if (age === null || age < 0 || age > PRICE_RAISE_ABSORPTION_DAYS) return null;
  return {
    businessDate: applicationDate,
    runAt: card.price_apply_time || card.priceApplyTime || '',
    beforeValue: '',
    afterValue: card.lowestprice || card.price || '',
    source: 'sellerinventory_price_apply_time',
  };
}

function normalSaleStatus(value) {
  const status = cleanText(value);
  return status === NORMAL_SALE || status === 'normal_sale';
}

function variantLineReview(card = {}, parentGroups = new Map()) {
  const parent = cleanText(card.parent_asin || card.parentAsin);
  if (!parent) return null;
  const sku = cleanText(card.sku).toUpperCase();
  const siblings = safeArray(parentGroups.get(parent)).filter(item => cleanText(item.sku).toUpperCase() !== sku);
  if (!siblings.length) return null;
  const siblingIssues = [];
  for (const sibling of siblings) {
    const siblingSku = cleanText(sibling.sku);
    const status = sibling.saleStatus || sibling.sale_status || '';
    const siblingFulRes = fulResUnits(sibling);
    const siblingCan30 = canSalesDays(sibling, 30);
    const siblingUnits30 = num(sibling.unitsSold_30d ?? sibling.qty_30);
    const siblingPoint = adPoint(sibling);
    const siblingProfit = num(sibling.netProfit ?? sibling.net_profit ?? sibling.profitRate, null);
    const hasInventoryRoom = siblingFulRes >= 15 || siblingCan30 >= 30;
    if (status && !normalSaleStatus(status)) {
      siblingIssues.push(`${siblingSku}:status=${cleanText(status)}`);
      continue;
    }
    if (hasInventoryRoom && siblingUnits30 > 0 && (offAdState(sibling) || (siblingPoint !== null && siblingPoint <= 0.01))) {
      siblingIssues.push(`${siblingSku}:ad_recovery`);
      continue;
    }
    if (siblingPoint !== null && siblingPoint >= 0.15 && (siblingProfit === null || siblingProfit <= 0.1)) {
      siblingIssues.push(`${siblingSku}:ad_cost_pressure`);
    }
  }
  if (!siblingIssues.length) return null;
  return {
    variantParentAsin: parent,
    variantSiblingCount: siblings.length,
    variantSiblingIssues: siblingIssues.join('; '),
  };
}

function frontOfferPriceBlock(card = {}, item = {}) {
  const listing = card.listing || {};
  const text = [
    listing.bodyPreview,
    listing.availability,
    listing.availabilityText,
    listing.buyBoxText,
    listing.offerText,
    listing.offerStatus,
    listing.priceAvailability,
    card.buyBoxText,
    card.buyBoxStatus,
    card.offerStatus,
    item.buyBoxText,
    item.buyBoxStatus,
    item.offerStatus,
  ].map(cleanText).filter(Boolean).join(' ').toLowerCase();
  const explicitNoBuyBox = [
    listing.hasBuyBox,
    listing.buyBoxAvailable,
    listing.hasFeaturedOffer,
    card.hasBuyBox,
    card.buyBoxAvailable,
    card.hasFeaturedOffer,
    item.hasBuyBox,
    item.buyBoxAvailable,
    item.hasFeaturedOffer,
  ].some(value => value === false);
  const missingParsedPrice = Object.prototype.hasOwnProperty.call(listing, 'price') && listing.price === null;
  const highPrice = text.includes('high price');
  const noFeatured = text.includes('no featured offers available') || text.includes('no featured offer available');
  const onlyBuyingOptions = text.includes('see all buying options');
  if (!highPrice && !noFeatured && !onlyBuyingOptions && !explicitNoBuyBox) return null;
  if (highPrice || noFeatured || explicitNoBuyBox || (onlyBuyingOptions && missingParsedPrice)) {
    return {
      highPrice,
      noFeatured,
      onlyBuyingOptions,
      explicitNoBuyBox,
      missingParsedPrice,
    };
  }
  return null;
}

function rowStats(row, days) {
  const suffix = String(days);
  return {
    spend: num(row?.[`spend${suffix}`] ?? row?.stats?.[`${days}d`]?.spend ?? row?.[`Spend${suffix}`]),
    orders: num(row?.[`orders${suffix}`] ?? row?.stats?.[`${days}d`]?.orders ?? row?.[`Orders${suffix}`]),
    clicks: num(row?.[`clicks${suffix}`] ?? row?.stats?.[`${days}d`]?.clicks ?? row?.[`Clicks${suffix}`]),
    impressions: num(row?.[`impressions${suffix}`] ?? row?.stats?.[`${days}d`]?.impressions ?? row?.[`Impressions${suffix}`]),
    sales: num(row?.[`sales${suffix}`] ?? row?.stats?.[`${days}d`]?.sales ?? row?.[`Sales${suffix}`]),
    acos: num(row?.[`acos${suffix}`] ?? row?.stats?.[`${days}d`]?.acos, null),
  };
}

function childStats(entity) {
  return {
    d3: entity?.stats3d || rowStats(entity, 3),
    d7: entity?.stats7d || rowStats(entity, 7),
    d30: entity?.stats30d || rowStats(entity, 30),
  };
}

function approval(extra = {}) {
  return {
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex', 'price_full_closure'],
    source: 'price_full_closure',
    requiresAiDecision: false,
    ...extra,
  };
}

function reviewPlan(rollbackIf) {
  return {
    checkAfterDays: [1, 3, 7, 14],
    rollbackIf,
  };
}

function enabledAdRows(card, options = {}) {
  const includeSponsoredBrands = options.includeSponsoredBrands === true;
  const rows = [];
  for (const campaign of safeArray(card.campaigns)) {
    for (const [entityType, listName] of [
      ['keyword', 'keywords'],
      ['autoTarget', 'autoTargets'],
      ['manualTarget', 'manualTargets'],
      ['productAd', 'productAds'],
    ]) {
      for (const row of safeArray(campaign[listName])) {
        if (stateEnabled(row.state) && stateEnabled(campaign.campaignState ?? campaign.state) && stateEnabled(campaign.groupState ?? 1)) {
          const resolvedType = entityType === 'autoTarget' && row.targetType === 'manual' ? 'manualTarget' : entityType;
          rows.push({ entityType: resolvedType, row, campaign, stats: childStats(row) });
        }
      }
    }
    if (includeSponsoredBrands) {
      const sbCampaign = campaign.sbCampaign || null;
      if (sbCampaign && stateEnabled(sbCampaign.state ?? sbCampaign.campaignState ?? sbCampaign.status)) {
        rows.push({ entityType: 'sbCampaign', row: sbCampaign, campaign, stats: childStats(sbCampaign) });
      }
      for (const row of safeArray(campaign.sponsoredBrands)) {
        if (!stateEnabled(row.state ?? row.status) || !stateEnabled(row.campaignState ?? campaign.campaignState ?? campaign.state ?? 1)) continue;
        const resolvedType = row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword';
        rows.push({ entityType: resolvedType, row, campaign, stats: childStats(row) });
      }
    }
  }
  return rows;
}

function stateActionId(rowInfo = {}) {
  const row = rowInfo.row || {};
  if (rowInfo.entityType === 'productAd') return String(row.id || row.adId || row.ad_id || '');
  if (rowInfo.entityType === 'sbCampaign' || rowInfo.entityType === 'campaign') return String(row.campaignId || row.campaign_id || row.id || '');
  if (rowInfo.entityType === 'keyword' || rowInfo.entityType === 'sbKeyword') return String(row.id || row.keywordId || row.keyword_id || '');
  return String(row.id || row.targetId || row.target_id || '');
}

function buildInventoryHardStopPauseActions(card = {}, priceItem = {}) {
  const available = num(priceItem.fulResUnits ?? fulResUnits(card));
  const sellableDays7d = num(priceItem.sellableDays7d, null);
  if (available > 7 && !(sellableDays7d !== null && sellableDays7d <= 7)) return [];

  const enabledRows = enabledAdRows(card, { includeSponsoredBrands: true });
  const productAds = enabledRows.filter(item => item.entityType === 'productAd');
  const sponsoredBrands = enabledRows.filter(item => item.entityType === 'sbCampaign' || item.entityType === 'sbKeyword' || item.entityType === 'sbTarget');
  const selectedRows = productAds.length ? [...productAds, ...sponsoredBrands] : enabledRows;
  const seen = new Set();
  const actions = [];
  for (const rowInfo of selectedRows) {
    const id = stateActionId(rowInfo);
    const key = `${rowInfo.entityType}:${id}`;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    actions.push({
      id,
      entityType: rowInfo.entityType,
      actionType: 'pause',
      campaignId: String(rowInfo.campaign?.campaignId || rowInfo.row?.campaignId || ''),
      adGroupId: String(rowInfo.campaign?.adGroupId || rowInfo.row?.adGroupId || ''),
      campaignName: rowInfo.campaign?.name || rowInfo.campaign?.campaignName || rowInfo.row?.campaignName || '',
      groupName: rowInfo.campaign?.groupName || rowInfo.row?.groupName || '',
      currentState: rowInfo.row?.state ?? rowInfo.row?.campaignState ?? 'enabled',
      reason: `\u5e93\u5b58\u786c\u505c\uff1aFul+Res=${available}\uff0c7\u5929\u53ef\u5356=${sellableDays7d}\uff1b\u63d0\u4ef7\u751f\u6548\u524d\u6682\u505c ${rowInfo.entityType}\uff0c\u907f\u514d\u5269\u4f59\u5e93\u5b58\u88ab\u5e7f\u544a\u6d88\u8017\u3002`,
      evidence: [
        `SKU ${card.sku}: Ful+Res=${available}`,
        `sellableDays7d=${sellableDays7d}`,
        `unitsSold_7d=${num(card.unitsSold_7d)}`,
        `priceTarget=${priceItem.currentPrice}->${priceItem.suggestedPrice}`,
        `${rowInfo.entityType}:${id} campaign=${rowInfo.campaign?.campaignId || rowInfo.row?.campaignId || ''}`,
      ],
      hypothesis: '\u6682\u505cSKU\u5e7f\u544a\u6295\u653e\uff0c\u7ed9\u63d0\u4ef7\u7533\u8bf7\u7559\u51fa\u751f\u6548\u7a97\u53e3\uff0c\u9632\u6b62\u5269\u4f59\u5e93\u5b58\u5728\u4f4e\u4ef7\u9636\u6bb5\u88ab\u6d88\u8017\u5b8c\u3002',
      expectedEffect: { impressions: 'down_to_zero_for_sku', clicks: 'down_to_zero_for_sku', spend: 'blocked', units: 'watch_after_price' },
      reviewPlan: reviewPlan('\u65b0Ful+Res\u5e93\u5b58\u5230\u4f4d\uff0c\u6216\u63d0\u4ef7\u5df2\u751f\u6548\u4e14\u540e\u7eed3/7\u5929\u8f6c\u5316\u7a33\u5b9a\uff0c\u518d\u91cd\u65b0\u6d4b\u5e7f\u544a'),
      forceExecute: true,
      forceReason: 'ful_res_single_digit_inventory_hard_stop_pause_ads',
      riskLevel: 'inventory_hard_stop_ad_pause',
      confidence: 0.9,
      ...approval(),
    });
  }
  return actions;
}

function priceActionFor(item, card, businessDate) {
  const currentPrice = num(item.price ?? card.price);
  const profitBefore = num(item.profitRate ?? card.profitRate);
  const sellableDays7d = sellableDaysFrom7dVelocity(card, item.sellableDays7d);
  const priceLift = sellableDays7d <= 21 ? 0.05 : 0.04;
  const rawSuggestedPrice = Math.max(currentPrice + 0.5, Math.ceil((currentPrice * (1 + priceLift)) * 100) / 100);
  const suggestedPrice = normalizePriceTargetTo99(currentPrice, rawSuggestedPrice);
  const floatPrice = (suggestedPrice - currentPrice) / currentPrice;
  const profitAfter = profitBefore + Math.min(0.08, Math.max(0.031, floatPrice * 0.9));
  const profitDelta = profitAfter - profitBefore;
  const action = {
    entityType: 'sku',
    id: item.sku,
    actionType: 'price',
    site: 'Amazon.com',
    saleStatus: card.saleStatus || item.saleStatus || NORMAL_SALE,
    currentPrice,
    suggestedPrice,
    profitBefore: round(profitBefore, 4),
    profitBeforeSea: round(card.seaProfitRate, 4),
    profitAfter: round(profitAfter, 4),
    profitAfterSea: round(num(card.seaProfitRate) + profitDelta, 4),
    floatPrice: round(floatPrice, 4),
    isUrgent: sellableDays7d < 15 ? 'yes' : 'no',
    remark: `\u5e93\u5b58\u4fdd\u62a4\u63d0\u4ef7 ${businessDate}\uff1a${currentPrice}->${suggestedPrice}\uff1b\u5229\u6da6 ${pct(profitBefore)}->${pct(profitAfter)}`,
    priceIntent: 'inventory_protection',
    adCoupling: {
      direction: 'down',
      reason: 'Ful+Res\u5e93\u5b58\u504f\u7d27\uff0c\u63d0\u4ef7\u4fdd\u62a4\u5229\u6da6\u548c\u5269\u4f59\u5e93\u5b58\uff1b\u786c\u505cSKU\u5148\u6536\u5e7f\u544a\uff0c\u4ef7\u683c\u6807\u8bb0/\u8f6c\u5316\u7a33\u5b9a\u524d\u4e0d\u52a0\u6d41\u91cf\u3002',
      allowedAdActions: ['pause_waste', 'lower_bid', 'lower_budget', 'hold'],
      blockedAdActions: ['raise_bid', 'raise_budget', 'create_campaign'],
      checkAfterDays: [1, 3, 7, 14],
    },
    reason: `\u5e93\u5b58\u4fdd\u62a4\u63d0\u4ef7\u7533\u8bf7\uff1a\u63097\u5929\u9500\u901f\u8ba1\u7b97Ful+Res\u4ec5\u53ef\u5356 ${sellableDays7d} \u5929\uff0c\u63d0\u4ef7\u540e\u5229\u6da6\u9884\u8ba1\u63d0\u5347 ${(profitDelta * 100).toFixed(1)}pp\u3002`,
    evidence: [
      `audit issue=${item.issue}`,
      `unitsSold_7d=${num(item.units7d ?? card.unitsSold_7d)}`,
      `invDays=${num(item.invDays ?? card.invDays)}`,
      `fulResUnits=${fulResUnits(card)}`,
      `sellableDays7d=${sellableDays7d}`,
      `is_high_return_rate=${card.productLabels?.is_high_return_rate ?? 'missing'}`,
      `currentPrice=${currentPrice}, suggestedPrice=${suggestedPrice}`,
      `profitBefore=${round(profitBefore, 4)}, profitAfter=${round(profitAfter, 4)}`,
    ],
    hypothesis: '\u5728\u5e93\u5b58\u504f\u7d27\u65f6\u505a\u53ef\u63a7\u63d0\u4ef7\uff0c\u4f18\u5148\u62ff\u5229\u6da6\uff1b\u524d\u53f0\u5f71\u54cd\u63091-3\u5929\u5ba1\u6838/\u751f\u6548\u6ede\u540e\u56de\u770b\u3002',
    expectedEffect: { priceApplication: '\u5df2\u63d0\u4ea4', grossMargin: '\u63d0\u5347', units: '\u89c2\u5bdf', conversionRate: '\u89c2\u5bdf', adSpend: '\u4e0b\u964d\u6216\u6301\u5e73' },
    reviewPlan: reviewPlan('1/3\u5929\u4ecd\u6ca1\u6709\u7533\u8bf7\u6807\u8bb0\uff0c\u6216\u540e\u7eed\u5e93\u5b58\u80fd\u63a5\u4e0a\uff0c\u6216\u63d0\u4ef7\u751f\u6548\u540e7\u5929\u9500\u91cf/\u8f6c\u5316\u660e\u663e\u4e0b\u6ed1'),
    confidence: 0.78,
    riskLevel: 'price_inventory_protection',
    ...approval(),
  };
  return { action, sellableDays7d, profitAfter, profitDelta, floatPrice, suggestedPrice, currentPrice };
}

function reviewAction(item, kind, reason, extra = {}) {
  return {
    entityType: 'skuCandidate',
    actionType: 'review',
    id: `review::${item.sku}::${kind}`,
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex', 'price_full_closure'],
    source: 'price_full_closure',
    requiresAiDecision: false,
    riskLevel: 'manual_repair_required',
    confidence: 0.75,
    reason,
    evidence: [
      ...Object.entries(item)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .slice(0, 14)
        .map(([key, value]) => `${key}=${value}`),
      ...Object.entries(extra).map(([key, value]) => `${key}=${value}`),
    ],
  };
}

function routedOutReviewReason(item = {}) {
  if (item.issue === 'price_pool_routed_to_ad_recovery') {
    return 'Price candidate was routed to ad recovery: restore historical converting lanes or inspect suppressed delivery before any price raise.';
  }
  if (item.issue === 'price_pool_replenishment_pipeline_available') {
    return 'Price candidate was routed to replenishment watch: inventory pipeline can connect the next window, so hold price and monitor stock/ad pressure.';
  }
  if (item.issue === 'price_pool_variant_line_review_required') {
    return 'Price candidate requires parent variation-line review before price execution.';
  }
  return item.why || 'Price candidate was routed out of direct price execution and must be closed as a non-price review item.';
}

function variantLineExtra(card = {}, parentGroups = new Map()) {
  const parent = cleanText(card.parent_asin || card.parentAsin);
  if (!parent) return {};
  const siblings = safeArray(parentGroups.get(parent)).filter(item => cleanText(item.sku).toUpperCase() !== cleanText(card.sku).toUpperCase());
  const review = variantLineReview(card, parentGroups);
  return {
    variantParentAsin: parent,
    variantSiblingCount: siblings.length,
    variantSiblingIssues: review?.variantSiblingIssues || '',
  };
}

function buildSchema({ audit, snapshot, businessDate, recentAdjustments = [] }) {
  const bySku = new Map(safeArray(snapshot.productCards).map(card => [String(card.sku || ''), card]));
  const parentGroups = new Map();
  for (const card of safeArray(snapshot.productCards)) {
    const parent = cleanText(card.parent_asin || card.parentAsin);
    if (!parent) continue;
    if (!parentGroups.has(parent)) parentGroups.set(parent, []);
    parentGroups.get(parent).push(card);
  }
  const plans = [];
  const coverage = [];

  for (const item of safeArray(audit.priceActions?.routedOut)) {
    const sku = String(item.sku || '').toUpperCase();
    const card = bySku.get(sku) || {};
    const variantExtra = variantLineExtra(card, parentGroups);
    const extra = {
      issue: item.issue || 'price_pool_routed_out',
      requiredAction: item.requiredAction || '',
      units7d: num(item.units7d ?? card.unitsSold_7d),
      fulResUnits: num(item.fulResUnits ?? fulResUnits(card)),
      sellableDays7d: num(item.sellableDays7d ?? sellableDaysFrom7dVelocity(card), null),
      replenishmentUnits: num(item.replenishmentUnits, null),
      replenishmentDays7d: num(item.replenishmentDays7d, null),
      totalSellableDays7d: num(item.totalSellableDays7d, null),
      advState: item.advState || card.advState || card.adState || '',
      advPoint: item.advPoint ?? adPoint(card),
      ...variantExtra,
    };
    plans.push({
      sku,
      asin: item.asin || card.asin || '',
      summary: `Price routed-out closure for ${sku}: ${item.issue || 'price_pool_routed_out'}`,
      actions: [reviewAction(item, item.issue || 'price_pool_routed_out', routedOutReviewReason(item), extra)],
    });
    coverage.push({
      sku,
      status: 'review',
      reason: item.issue || 'price_pool_routed_out',
      ...extra,
    });
  }

  for (const item of safeArray(audit.priceActions?.items)) {
    const sku = String(item.sku || '').toUpperCase();
    const card = bySku.get(sku);
    if (!card) {
      plans.push({ sku, asin: item.asin || '', summary: 'Price action could not be matched to snapshot product card.', actions: [reviewAction(item, 'price_missing_card', 'Daily price gate could not execute because SKU is missing from latest snapshot.')] });
      coverage.push({ sku, status: 'review', reason: 'missing_card' });
      continue;
    }
    const basePlan = { sku, asin: item.asin || card.asin || '', summary: `Price full closure for ${sku}: ${item.issue}`, actions: [] };
    const common = {
      saleStatus: card.saleStatus || item.saleStatus || '',
      highReturn: card.productLabels?.is_high_return_rate ?? '',
      units7d: num(item.units7d ?? card.unitsSold_7d),
      fulResUnits: fulResUnits(card),
      sellableDays7d: sellableDaysFrom7dVelocity(card, item.sellableDays7d),
    };
    const replenishment = replenishmentCoverage(card, item);

    if ((card.saleStatus || item.saleStatus) !== NORMAL_SALE) {
      basePlan.actions.push(reviewAction(item, 'price_non_normal_sale', 'Daily price gate requires normal-sale SKU before sellerinventory price execution.', common));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'non_normal_sale', ...common });
      continue;
    }
    if ([1, 2].includes(num(card.productLabels?.is_high_return_rate, 0))) {
      basePlan.actions.push(reviewAction(item, 'price_high_return_gate', 'High-refund SKU needs refund diagnosis before price/traffic action.', common));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'high_return_gate', ...common });
      continue;
    }
    const commonWithReplenishment = {
      ...common,
      replenishmentUnits: replenishment.units,
      replenishmentDays7d: replenishment.days,
      totalSellableDays7d: replenishment.totalSellableDays7d,
    };
    const frontOfferBlock = frontOfferPriceBlock(card, item);
    if (frontOfferBlock) {
      basePlan.actions.push(reviewAction(item, 'front_offer_price_block', 'Front-page offer is blocked by high-price/no-featured-offer signals; review rollback or listing offer recovery before another inventory-protection price raise.', {
        ...commonWithReplenishment,
        ...frontOfferBlock,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'front_offer_price_block', ...commonWithReplenishment, ...frontOfferBlock });
      continue;
    }
    const adRecoveryRoute = adRecoveryRouteForPrice(card, replenishment);
    if (adRecoveryRoute) {
      basePlan.actions.push(reviewAction(item, 'price_ad_recovery_route', 'Ad delivery/share is suppressed while inventory or replenishment can connect; restore historical converting lanes before treating this SKU as a price-raise execution candidate.', {
        ...commonWithReplenishment,
        ...adRecoveryRoute,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'price_ad_recovery_route', ...commonWithReplenishment, ...adRecoveryRoute });
      continue;
    }
    if (!(common.units7d > 0) || common.sellableDays7d === null || !(common.sellableDays7d < 15)) {
      basePlan.actions.push(reviewAction(item, 'price_not_executable_velocity', 'Inventory-protection price execution requires positive 7d units and Ful+Res sellableDays7d below 15.', {
        ...common,
        replenishmentUnits: replenishment.units,
        replenishmentDays7d: replenishment.days,
        totalSellableDays7d: replenishment.totalSellableDays7d,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'price_not_executable_velocity', ...common, replenishmentUnits: replenishment.units, replenishmentDays7d: replenishment.days, totalSellableDays7d: replenishment.totalSellableDays7d });
      continue;
    }
    if (replenishment.totalSellableDays7d !== null && replenishment.totalSellableDays7d >= 15) {
      basePlan.actions.push(reviewAction(item, 'price_replenishment_pipeline_available', 'Ful+Res is below 15 days, but inbound/planned/local replenishment can connect the next stock window; hold price raise and watch inventory/ad pressure.', {
        ...common,
        replenishmentUnits: replenishment.units,
        replenishmentDays7d: replenishment.days,
        totalSellableDays7d: replenishment.totalSellableDays7d,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'price_replenishment_pipeline_available', ...common, replenishmentUnits: replenishment.units, replenishmentDays7d: replenishment.days, totalSellableDays7d: replenishment.totalSellableDays7d });
      continue;
    }
    const recentPriceRaise = recentPriceRaiseForSku(recentAdjustments, sku, businessDate);
    const recentPriceApplication = recentPriceRaise || priceApplicationFromCard(card, businessDate);
    const postRaiseSales = postRaiseSalesEvidence(item, card);
    if (recentPriceApplication && !postRaiseSales.large) {
      const extra = {
        ...common,
        recentPriceRaiseBusinessDate: recentPriceApplication.businessDate || '',
        recentPriceRaiseRunAt: recentPriceApplication.runAt || '',
        recentPriceRaiseFrom: recentPriceApplication.beforeValue,
        recentPriceRaiseTo: recentPriceApplication.afterValue,
        recentPriceRaiseSource: recentPriceApplication.source || 'adjustments',
        priceRaiseAbsorptionDays: PRICE_RAISE_ABSORPTION_DAYS,
        postRaiseUnits1d: postRaiseSales.units1d,
        postRaiseUnits3d: postRaiseSales.units3d,
        postRaiseUnits7d: postRaiseSales.units7d,
        largePostRaiseSalesThreshold: postRaiseSales.thresholds,
      };
      basePlan.actions.push(reviewAction(item, 'recent_price_raise_without_large_post_raise_sales', 'Price raises during the post-raise absorption period are blocked unless the raised price has explicit large post-raise sales evidence.', extra));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'recent_price_raise_without_large_post_raise_sales', ...extra });
      continue;
    }
    const variantReview = variantLineReview(card, parentGroups);
    if (variantReview) {
      basePlan.actions.push(reviewAction(item, 'variant_line_review_required', 'A sibling variation has ad recovery, ad cost pressure, or sale-status issues that can change the price decision for this child SKU; review the parent variation line before price execution.', {
        ...commonWithReplenishment,
        ...variantReview,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'variant_line_review_required', ...commonWithReplenishment, ...variantReview });
      continue;
    }
    if (!(num(item.price ?? card.price) > 0)) {
      basePlan.actions.push(reviewAction(item, 'price_missing_current_price', 'Sellerinventory price execution requires a positive current price.', common));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: 'missing_current_price', ...common });
      continue;
    }
    const priced = priceActionFor(item, card, businessDate);
    const validation = validatePriceAction(priced.action, { requireAdCoupling: true });
    if (!validation.ok) {
      basePlan.actions.push(reviewAction(item, 'price_validation_failed', `Price action validation failed: ${validation.errors.join(',')}`, {
        ...common,
        currentPrice: priced.currentPrice,
        suggestedPrice: priced.suggestedPrice,
      }));
      plans.push(basePlan);
      coverage.push({ sku, status: 'review', reason: `price_validation:${validation.errors.join(',')}`, ...common, currentPrice: priced.currentPrice, suggestedPrice: priced.suggestedPrice });
      continue;
    }

    basePlan.actions.push(priced.action);
    const pauseActions = buildInventoryHardStopPauseActions(card, { ...item, ...priced });
    basePlan.actions.push(...pauseActions);
    if (pauseActions.length) basePlan.summary += `; inventory hard-stop pauses ${pauseActions.length} enabled ad rows before/with price submission.`;
    plans.push(basePlan);
    coverage.push({
      sku,
      status: 'executable',
      reason: 'price_action_ready',
      pauseActions: pauseActions.length,
      ...common,
      replenishmentUnits: replenishment.units,
      replenishmentDays7d: replenishment.days,
      totalSellableDays7d: replenishment.totalSellableDays7d,
      currentPrice: priced.currentPrice,
      suggestedPrice: priced.suggestedPrice,
      profitBefore: round(num(item.profitRate ?? card.profitRate), 4),
      profitAfter: round(priced.profitAfter, 4),
    });
  }
  return { plans, coverage };
}

function renderReport({ coverage, files, businessDate }) {
  const byStatus = coverage.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const executable = coverage.filter(row => row.status === 'executable');
  const reviews = coverage.filter(row => row.status !== 'executable');
  const hardStops = executable.filter(row => row.fulResUnits <= 7 || row.sellableDays7d <= 7);
  return [
    `# Price Full Closure ${businessDate}`,
    '',
    `- price audit rows: ${coverage.length}`,
    `- executable price rows: ${executable.length}`,
    `- review/blocked rows: ${reviews.length}`,
    `- hard-stop executable rows: ${hardStops.length}`,
    `- generated ad pause actions: ${coverage.reduce((sum, row) => sum + num(row.pauseActions), 0)}`,
    `- schema: \`${files.schema}\``,
    `- coverage: \`${files.coverage}\``,
    '',
    '## Status',
    ...Object.entries(byStatus).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Hard Stop Sample',
    ...(hardStops.slice(0, 30).map(row => `- ${row.sku}: Ful+Res=${row.fulResUnits}, sellableDays7d=${row.sellableDays7d}, price ${row.currentPrice}->${row.suggestedPrice}, pauseActions=${row.pauseActions}`)),
    '',
    '## Review Reasons',
    ...Object.entries(reviews.reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] || 0) + 1;
      return acc;
    }, {})).map(([key, value]) => `- ${key}: ${value}`),
    '',
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : '';
  };
  const businessDate = get('--date') || DEFAULT_DATE;
  return {
    businessDate,
    snapshot: get('--snapshot') || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    audit: get('--audit') || path.join(ROOT, 'data', 'tasks', `proactive_operating_audit_${businessDate}.json`),
    schema: get('--out') || path.join(ROOT, 'data', 'snapshots', `action_schema_${businessDate}_price_full_closure.json`),
    coverage: get('--coverage') || path.join(ROOT, 'data', 'tasks', `price_full_closure_${businessDate}.json`),
    report: get('--report') || path.join(ROOT, 'data', 'tasks', `price_full_closure_${businessDate}.md`),
  };
}

function loadRecentAdjustments(businessDate) {
  const dates = Array.from(
    { length: PRICE_RAISE_ABSORPTION_DAYS + 1 },
    (_, index) => addDays(businessDate, index - PRICE_RAISE_ABSORPTION_DAYS)
  ).filter(Boolean);
  return dates.flatMap(date => readJson(path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`), []));
}

function main() {
  const options = parseArgs();
  const audit = readJson(path.resolve(options.audit), null);
  const snapshot = readJson(path.resolve(options.snapshot), null);
  if (!audit) throw new Error(`cannot read audit JSON: ${options.audit}`);
  if (!snapshot) throw new Error(`cannot read snapshot JSON: ${options.snapshot}`);
  const { plans, coverage } = buildSchema({
    audit,
    snapshot,
    businessDate: options.businessDate,
    recentAdjustments: loadRecentAdjustments(options.businessDate),
  });
  writeJson(options.schema, plans);
  writeJson(options.coverage, {
    generatedAt: new Date().toISOString(),
    businessDate: options.businessDate,
    auditFile: path.resolve(options.audit),
    snapshotFile: path.resolve(options.snapshot),
    schemaFile: path.resolve(options.schema),
    counts: {
      plans: plans.length,
      actions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
      priceActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'price').length, 0),
      pauseActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'pause').length, 0),
      reviewActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'review').length, 0),
      executableSkus: coverage.filter(row => row.status === 'executable').length,
      reviewSkus: coverage.filter(row => row.status !== 'executable').length,
    },
    coverage,
  });
  writeText(options.report, renderReport({
    coverage,
    businessDate: options.businessDate,
    files: {
      schema: path.resolve(options.schema),
      coverage: path.resolve(options.coverage),
    },
  }));
  console.log(JSON.stringify({
    schema: path.resolve(options.schema),
    coverage: path.resolve(options.coverage),
    report: path.resolve(options.report),
    plans: plans.length,
    actions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    priceActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'price').length, 0),
    pauseActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'pause').length, 0),
    reviewActions: plans.reduce((sum, plan) => sum + plan.actions.filter(action => action.actionType === 'review').length, 0),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSchema,
  frontOfferPriceBlock,
  postRaiseSalesEvidence,
  replenishmentCoverage,
  replenishmentUnits,
};
