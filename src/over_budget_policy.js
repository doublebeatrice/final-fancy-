function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasNumber(value) {
  if (value === undefined || value === null || value === '') return false;
  return Number.isFinite(Number(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function skuKey(value) {
  return normalizeText(value).toUpperCase();
}

function includesAny(text, needles) {
  const haystack = String(text || '').toLowerCase();
  return needles.some(needle => haystack.includes(needle));
}

const SEASONAL_THEME_KEYWORDS = {
  mothers_day: ['mother', 'mothers day', "mother's day", 'godmother', 'god mother', 'mom'],
  nurse_week: ['nurse', 'lab', 'technician', 'medical', 'nursing'],
  teacher_appreciation: ['teacher', 'school counselor', 'counselor appreciation'],
  graduation: ['graduation', 'graduate', 'senior'],
  wedding: ['wedding', 'bridesmaid', 'bridal', 'bride'],
  pride: ['pride', 'rainbow'],
  cinco_de_mayo: ['cinco', 'fiesta', 'mexican'],
};

function isEnabledState(value) {
  const text = String(value ?? '').toLowerCase();
  return text === '1' || text === '2' || text === 'enabled' || text === 'enable' || text === 'active';
}

function projectSkuState(row = {}) {
  return {
    sku: normalizeText(row.sku || row.SKU || row.raw_sku || ''),
    asin: normalizeText(row.asin || row.ASIN || ''),
    salesChannel: normalizeText(row.salesChannel || row.sales_channel || ''),
    saleStatus: normalizeText(row.saleStatus || row.sale_status || ''),
    price: num(row.price),
    profitRate: num(row.profitRate),
    seaProfitRate: num(row.seaProfitRate),
    netProfit: num(row.netProfit || row.net_profit),
    busyNetProfit: num(row.busyNetProfit || row.busy_net_profit),
    invDays: num(row.sellableDays_30d || row.invDays),
    sellableDays_3d: num(row.sellableDays_3d),
    sellableDays_7d: num(row.sellableDays_7d),
    sellableDays_30d: num(row.sellableDays_30d || row.invDays),
    unitsSold_3d: num(row.unitsSold_3d || row.qty_3),
    unitsSold_7d: num(row.unitsSold_7d || row.qty_7),
    unitsSold_30d: num(row.unitsSold_30d || row.qty_30),
    fulFillable: num(row.fulFillable),
    reserved: num(row.reserved),
    stockInbAir: num(row.stockInbAir),
    stockInb: num(row.stockInb),
    stockFul: num(row.stockFul),
    stockRes: num(row.stockRes),
    stockPlan: num(row.stockPlan),
    adDependency: num(row.adDependency),
    isSeasonal: row.isSeasonal === true || row.isSeasonal === 'true',
    lifecycleSeason: row.lifecycleSeason && typeof row.lifecycleSeason === 'object' ? row.lifecycleSeason : {},
    campaigns: Array.isArray(row.campaigns) ? row.campaigns : [],
    adStats: row.adStats && typeof row.adStats === 'object' ? row.adStats : {},
    sbStats: row.sbStats && typeof row.sbStats === 'object' ? row.sbStats : {},
  };
}

function mergeSkuState(base = {}, incoming = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'campaigns') {
      if ((!merged.campaigns || !merged.campaigns.length) && Array.isArray(value)) merged.campaigns = value;
      continue;
    }
    if (key === 'adStats' || key === 'sbStats') {
      if (!merged[key] || !Object.keys(merged[key]).length) merged[key] = value;
      continue;
    }
    if (merged[key] === undefined || merged[key] === '' || merged[key] === 0 || merged[key] === false) {
      merged[key] = value;
    }
  }
  return merged;
}

function buildSkuStateMap(snapshot = {}) {
  const map = new Map();
  const add = row => {
    const state = projectSkuState(row);
    const key = skuKey(state.sku);
    if (!key) return;
    map.set(key, mergeSkuState(map.get(key), state));
  };

  for (const row of Object.values(snapshot.invMap || {})) add(row);
  for (const row of snapshot.productCards || []) add(row);

  return map;
}

function getSkuState(stateMap, sku) {
  return stateMap.get(skuKey(sku));
}

function effectiveProfitRate(card = {}) {
  if (hasNumber(card.netProfit)) return num(card.netProfit);
  if (hasNumber(card.busyNetProfit)) return num(card.busyNetProfit);
  if (hasNumber(card.profitRate)) return num(card.profitRate);
  return 0;
}

function totalAbsoluteInventory(card = {}) {
  return num(card.fulFillable) + num(card.reserved) + num(card.stockFul) + num(card.stockRes);
}

function isMotherDaySellThroughWindow(currentDate = new Date()) {
  const date = currentDate instanceof Date ? currentDate : new Date(currentDate);
  if (Number.isNaN(date.getTime())) return false;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return month === 4 || (month === 5 && day <= 20);
}

function hasSeasonalSellThroughSignal(card = {}, group = {}, currentDate = new Date()) {
  const text = [
    group.campaignName,
    group.groupName,
    group.text,
    card.sku,
    card.asin,
  ].join(' ');
  if (isMotherDaySellThroughWindow(currentDate) && includesAny(text, SEASONAL_THEME_KEYWORDS.mothers_day)) return true;

  const lifecycle = card.lifecycleSeason || {};
  const phase = String(lifecycle.seasonPhase || '').toLowerCase();
  const themes = Array.isArray(lifecycle.activeThemes) ? lifecycle.activeThemes.map(theme => String(theme).toLowerCase()) : [];
  const tailOrActive = phase === 'season_tail' || phase === 'season_peak' || phase === 'season_preheat';
  if (!tailOrActive || !themes.length) return false;

  return themes.some(theme => includesAny(text, SEASONAL_THEME_KEYWORDS[theme] || []));
}

function hasStableRecentDemand(card = {}, group = {}) {
  const orders = num(group.orders);
  if (orders <= 0) return false;
  const units7 = num(card.unitsSold_7d);
  const units30 = num(card.unitsSold_30d);
  if (units7 <= 0) return true;
  if (units30 <= 0) return true;
  return (units7 * 30 / 7) >= (units30 * 0.6);
}

function assessSeasonalSellThroughOpportunity({ card = {}, group = {}, currentDate = new Date() } = {}) {
  const spend = num(group.spend);
  const sales = num(group.sales);
  const acos = sales > 0 ? spend / sales : num(group.acos);
  const absoluteInventory = totalAbsoluteInventory(card);
  const blockers = [];
  const seasonalSignal = hasSeasonalSellThroughSignal(card, group, currentDate);
  const stableDemand = hasStableRecentDemand(card, group);
  const inventoryHigh = absoluteInventory >= 50;
  const acosReasonable = acos > 0 && acos <= 0.25;

  if (!seasonalSignal) blockers.push('no_seasonal_signal');
  if (num(group.orders) <= 0) blockers.push('no_orders');
  if (!stableDemand) blockers.push('recent_demand_not_stable');
  if (!inventoryHigh) blockers.push('absolute_inventory_not_high');
  if (!acosReasonable) blockers.push('acos_not_reasonable_for_seasonal_sell_through');

  return {
    shouldLift: blockers.length === 0,
    reasonCode: blockers.length === 0 ? 'seasonal_sell_through_profit_max' : 'not_seasonal_sell_through',
    blockers,
    seasonalSignal,
    stableDemand,
    absoluteInventory,
    acos,
  };
}

function assessOverBudgetAdjustmentObjective({ card = {}, group = {}, currentDate = new Date() } = {}) {
  const profitRate = effectiveProfitRate(card);
  const spend = num(group.spend);
  const sales = num(group.sales);
  const orders = num(group.orders);
  const clicks = num(group.clicks);
  const acos = sales > 0 ? spend / sales : num(group.acos);
  const reasons = [];
  const seasonal = assessSeasonalSellThroughOpportunity({ card, group, currentDate });

  if (profitRate < 0.12) reasons.push('low_or_negative_profit');
  if (orders <= 0) reasons.push('no_orders');
  if (orders > 0) reasons.push('has_orders');
  if (acos > 0 && profitRate > 0 && acos > Math.max(0.25, profitRate * 1.5)) reasons.push('acos_above_profit_room');
  if (spend >= 5 && clicks >= 8 && orders <= 0) reasons.push('waste_spend_without_orders');
  if (seasonal.seasonalSignal) reasons.push('seasonal_product_signal');
  if (seasonal.absoluteInventory >= 50) reasons.push('high_absolute_inventory');

  let primaryAction = 'review_product_ad_profit_before_action';
  if (seasonal.shouldLift) {
    primaryAction = 'controlled_budget_and_relevant_bid_up';
  } else if (orders <= 0 || reasons.includes('acos_above_profit_room') || profitRate < 0) {
    primaryAction = 'lower_layer_bid_down_or_pause';
  } else if (orders > 0 && profitRate >= 0.12 && acos > 0 && acos <= Math.max(0.12, profitRate * 0.9)) {
    primaryAction = 'controlled_budget_up';
  } else {
    primaryAction = 'fetch_lower_layer_detail_then_adjust';
  }

  return {
    objective: 'profit_max_adjustment',
    mustClearOverBudget: false,
    primaryAction,
    reasons,
    metrics: {
      profitRate,
      spend,
      sales,
      orders,
      clicks,
      acos,
      invDays: num(card.invDays),
      absoluteInventory: seasonal.absoluteInventory,
    },
  };
}

function computeSeasonalBudgetLift(currentBudget) {
  const current = num(currentBudget);
  if (current <= 0) return 0;
  if (current <= 10) return Number(Math.min(current + 2, current * 1.5).toFixed(2));
  return Number(Math.min(current * 1.15, current + 8).toFixed(2));
}

function computeSeasonalCloseMatchBid(currentBid) {
  const current = num(currentBid);
  if (current <= 0) return 0;
  return Number((current + 0.05).toFixed(2));
}

function hasListingPayload(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'listing')) return true;
  if (Object.prototype.hasOwnProperty.call(value, 'productProfile')) return true;
  if (Array.isArray(value)) return value.some(hasListingPayload);
  return Object.values(value).some(hasListingPayload);
}

module.exports = {
  assessOverBudgetAdjustmentObjective,
  assessSeasonalSellThroughOpportunity,
  buildSkuStateMap,
  computeSeasonalBudgetLift,
  computeSeasonalCloseMatchBid,
  effectiveProfitRate,
  getSkuState,
  hasListingPayload,
  hasSeasonalSellThroughSignal,
  isEnabledState,
  num,
  projectSkuState,
  skuKey,
  totalAbsoluteInventory,
};
