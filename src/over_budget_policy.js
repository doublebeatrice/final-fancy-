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

function preferredProfitRate(card = {}) {
  const netProfit = num(card.netProfit);
  if (hasNumber(card.netProfit) && netProfit !== 0) return netProfit;
  const busyNetProfit = num(card.busyNetProfit);
  if (hasNumber(card.busyNetProfit) && busyNetProfit !== 0) return busyNetProfit;
  if (hasNumber(card.profitRate)) return num(card.profitRate);
  return 0;
}

function totalAbsoluteInventory(card = {}) {
  return num(card.fulFillable) + num(card.reserved) + num(card.stockFul) + num(card.stockRes);
}

function isMotherDaySellThroughWindow(currentDate = new Date()) {
  return isInSeasonWindow('mothers_day', currentDate);
}

// month/day are inclusive boundaries in site-local calendar terms.
// Each window starts at peak preheat (~3-5 weeks before holiday) and ends ~5-10 days after
// the holiday to cover post-event clearance demand.
const SEASONAL_WINDOWS = {
  mothers_day:           [{ from: [4,  1], to: [5, 20] }],
  fathers_day:           [{ from: [5, 15], to: [6, 25] }],
  graduation:            [{ from: [4, 20], to: [6, 15] }],
  wedding:               [{ from: [4,  1], to: [9, 30] }],
  pride:                 [{ from: [5, 15], to: [6, 30] }],
  nurse_week:            [{ from: [4, 15], to: [5, 15] }],
  teacher_appreciation:  [{ from: [4, 15], to: [5, 15] }],
  cinco_de_mayo:         [{ from: [4, 15], to: [5, 10] }],
  fourth_of_july:        [{ from: [6,  1], to: [7, 10] }],
  back_to_school:        [{ from: [7,  1], to: [9, 10] }],
  halloween:             [{ from: [9,  1], to: [11, 5] }],
  thanksgiving:          [{ from: [10, 15], to: [12, 1] }],
  black_friday:          [{ from: [10, 20], to: [12, 5] }],
  christmas:             [{ from: [10, 15], to: [12, 28] }],
  valentines_day:        [{ from: [1,  5], to: [2, 18] }],
  new_year:              [{ from: [12, 20], to: [1, 15] }],
};

const SEASONAL_THEME_KEYWORDS_EXTENDED = {
  ...SEASONAL_THEME_KEYWORDS,
  fathers_day: ['father', 'fathers day', "father's day", 'dad', 'daddy', 'papa', 'grandpa'],
  fourth_of_july: ['4th of july', 'fourth of july', 'independence day', 'patriotic', 'usa flag', 'red white blue'],
  back_to_school: ['back to school', 'school supply', 'classroom', 'student', 'backpack', 'pencil case'],
  halloween: ['halloween', 'pumpkin', 'spooky', 'witch', 'ghost', 'costume', 'trick or treat'],
  thanksgiving: ['thanksgiving', 'turkey', 'fall harvest', 'cornucopia'],
  black_friday: ['black friday', 'cyber monday', 'bfcm', 'holiday deal'],
  christmas: ['christmas', 'xmas', 'holiday', 'santa', 'reindeer', 'ornament', 'stocking', 'gingerbread'],
  valentines_day: ['valentine', "valentine's", 'love', 'heart', 'romantic', 'sweetheart'],
  new_year: ['new year', "new year's", 'nye', '2026', '2027'],
};

function isInSeasonWindow(theme, currentDate = new Date()) {
  const date = currentDate instanceof Date ? currentDate : new Date(currentDate);
  if (Number.isNaN(date.getTime())) return false;
  const windows = SEASONAL_WINDOWS[theme];
  if (!Array.isArray(windows) || !windows.length) return false;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const value = month * 100 + day;
  for (const w of windows) {
    const fromValue = w.from[0] * 100 + w.from[1];
    const toValue = w.to[0] * 100 + w.to[1];
    if (fromValue <= toValue) {
      if (value >= fromValue && value <= toValue) return true;
    } else {
      // window wraps year boundary (e.g. new_year: 12/20 → 1/15)
      if (value >= fromValue || value <= toValue) return true;
    }
  }
  return false;
}

function activeSeasonalThemes(currentDate = new Date()) {
  return Object.keys(SEASONAL_WINDOWS).filter(theme => isInSeasonWindow(theme, currentDate));
}

function hasSeasonalSellThroughSignal(card = {}, group = {}, currentDate = new Date()) {
  const text = [
    group.campaignName,
    group.groupName,
    group.text,
    card.sku,
    card.asin,
  ].join(' ');

  for (const theme of activeSeasonalThemes(currentDate)) {
    const needles = SEASONAL_THEME_KEYWORDS_EXTENDED[theme] || SEASONAL_THEME_KEYWORDS[theme] || [];
    if (needles.length && includesAny(text, needles)) return true;
  }

  const lifecycle = card.lifecycleSeason || {};
  const phase = String(lifecycle.seasonPhase || '').toLowerCase();
  const themes = Array.isArray(lifecycle.activeThemes) ? lifecycle.activeThemes.map(theme => String(theme).toLowerCase()) : [];
  const tailOrActive = phase === 'season_tail' || phase === 'season_peak' || phase === 'season_preheat';
  if (!tailOrActive || !themes.length) return false;

  return themes.some(theme => includesAny(text, SEASONAL_THEME_KEYWORDS_EXTENDED[theme] || SEASONAL_THEME_KEYWORDS[theme] || []));
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

const OVER_BUDGET_LANES = [
  'aggressive_budget_expansion',
  'controlled_budget_up',
  'seasonal_sell_through',
  'lower_layer_cost_control',
  'review',
];

const OVER_BUDGET_RISK_LEVELS = new Set([
  'over_budget_aggressive_budget_expansion',
  'over_budget_controlled_budget_up',
  'over_budget_min_budget_repair',
  'seasonal_overbudget_sell_through_budget_up',
  'seasonal_overbudget_close_match_bid_up',
  'overbudget_lower_layer_cost_control',
  'over_budget_no_order_pause',
  'over_budget_bad_conversion_budget_down',
  'overbudget_review_required',
]);

function isOverBudgetRiskLevel(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (OVER_BUDGET_RISK_LEVELS.has(text)) return true;
  return text.startsWith('over_budget_') ||
    text.startsWith('overbudget_') ||
    text.startsWith('seasonal_overbudget_');
}

function classifyOverBudgetLane({ campaign, currentDate = new Date() } = {}) {
  const profitRate = Number(campaign.profitRate);
  const invDays = Number(campaign.invDays) || 0;
  const absoluteInventory = Number(campaign.absoluteInventory) || 0;
  const orders = Number(campaign.orders) || 0;
  const spend = Number(campaign.spend) || 0;
  const sales = Number(campaign.sales) || 0;
  const clicks = Number(campaign.clicks) || 0;
  const acos = sales > 0 ? spend / sales : (orders === 0 ? 99 : 0);
  const blockers = [];

  const seasonal = assessSeasonalSellThroughOpportunity({
    card: {
      lifecycleSeason: campaign.lifecycleSeason || {},
      sku: campaign.sku,
      asin: campaign.asin,
      fulFillable: campaign.fulFillable,
      reserved: campaign.reserved,
      stockFul: campaign.stockFul,
      stockRes: campaign.stockRes,
      unitsSold_7d: campaign.units7,
      unitsSold_30d: campaign.units30,
    },
    group: {
      spend,
      sales,
      orders,
      acos,
      campaignName: campaign.campaignName,
      groupName: campaign.groupName,
    },
    currentDate,
  });

  const missingProfitSignal = !Number.isFinite(profitRate);
  const missingActivity = spend === 0 && orders === 0 && clicks === 0;
  if (missingProfitSignal || missingActivity) blockers.push(missingProfitSignal ? 'missing_profit_rate' : 'no_recent_activity');

  if (blockers.length) return { lane: 'review', blockers, acos, seasonal };

  if (seasonal.shouldLift) {
    return { lane: 'seasonal_sell_through', blockers: [], acos, seasonal };
  }

  const negativeProfit = profitRate < 0;
  const noOrderSpend = orders <= 0 && spend >= 5;
  const acosFarAboveProfitRoom = orders > 0 && acos > Math.max(0.45, profitRate * 1.5);
  if (negativeProfit || noOrderSpend || acosFarAboveProfitRoom) {
    if (negativeProfit) blockers.push('negative_profit');
    if (noOrderSpend) blockers.push('no_order_spend');
    if (acosFarAboveProfitRoom) blockers.push('acos_far_above_profit_room');
    return { lane: 'lower_layer_cost_control', blockers, acos, seasonal };
  }

  const inventoryHealthy = invDays === 0 || invDays >= 25 || absoluteInventory >= 50;
  const profitHealthy = profitRate >= 0.12;
  const hasOrders = orders >= 1;
  const acosInsideRoom = acos > 0 && acos <= Math.max(0.22, profitRate * 0.9);

  if (!profitHealthy) blockers.push('profit_below_12pct');
  if (!hasOrders) blockers.push('no_orders');
  if (!inventoryHealthy) blockers.push('inventory_tight');
  if (!acosInsideRoom) blockers.push('acos_outside_profit_room');

  if (blockers.length) {
    return { lane: 'review', blockers, acos, seasonal };
  }

  const aggressiveOrders = orders >= 5;
  const aggressiveProfit = profitRate >= 0.20;
  const aggressiveAcos = acos > 0 && acos <= Math.min(0.20, profitRate * 0.85);
  const aggressiveInventory = invDays >= 25 || absoluteInventory >= 80;
  if (aggressiveOrders && aggressiveProfit && aggressiveAcos && aggressiveInventory) {
    return { lane: 'aggressive_budget_expansion', blockers: [], acos, seasonal };
  }

  return { lane: 'controlled_budget_up', blockers: [], acos, seasonal };
}

function bucketOverBudgetRows(snapshot = {}, options = {}) {
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date();
  const cooldownSkus = options.cooldownSkus instanceof Set
    ? options.cooldownSkus
    : new Set((options.cooldownSkus || []).map(value => skuKey(value)));
  const cooldownCampaignIds = options.cooldownCampaignIds instanceof Set
    ? options.cooldownCampaignIds
    : new Set((options.cooldownCampaignIds || []).map(String));
  if (options.cooldown && !options.cooldownSkus && !options.cooldownCampaignIds) {
    const legacy = options.cooldown instanceof Set ? options.cooldown : new Set(options.cooldown || []);
    for (const value of legacy) cooldownSkus.add(skuKey(value));
  }
  const rows = Array.isArray(snapshot.overBudgetRows) ? snapshot.overBudgetRows : [];
  const skuStateMap = buildSkuStateMap(snapshot);

  const filtered = {
    rows: rows.length,
    notSp: 0,
    notEnabled: 0,
    noCampaign: 0,
    notAllowedSku: 0,
    onCooldownSku: 0,
    onCooldownCampaign: 0,
  };
  const byCampaign = new Map();

  for (const row of rows) {
    if (row.__overBudgetSource && row.__overBudgetSource !== 'SP') {
      filtered.notSp += 1;
      continue;
    }
    if (!isEnabledState(row.state) || !isEnabledState(row.campaignState) || !isEnabledState(row.groupState)) {
      filtered.notEnabled += 1;
      continue;
    }
    if (!row.campaignId) {
      filtered.noCampaign += 1;
      continue;
    }
    const card = getSkuState(skuStateMap, row.sku);
    if (!card) {
      filtered.notAllowedSku += 1;
      continue;
    }
    if (cooldownCampaignIds.has(String(row.campaignId))) {
      filtered.onCooldownCampaign += 1;
      continue;
    }
    if (cooldownSkus.has(skuKey(row.sku))) {
      filtered.onCooldownSku += 1;
      continue;
    }

    const key = String(row.campaignId);
    if (!byCampaign.has(key)) {
      byCampaign.set(key, {
        sku: card.sku || row.sku,
        asin: card.asin || row.asin,
        campaignId: key,
        campaignName: row.campaignName || '',
        adGroupId: String(row.adGroupId || ''),
        groupName: row.groupName || '',
        currentBudget: num(row.dailyBudget),
        spend: 0,
        sales: 0,
        orders: 0,
        clicks: 0,
        rows: 0,
        adIds: new Set(),
        adGroupIds: new Set(),
        positionTypes: new Set(),
        sampleRows: [],
        profitRate: preferredProfitRate(card),
        invDays: num(card.invDays),
        absoluteInventory: totalAbsoluteInventory(card),
        units7: num(card.unitsSold_7d),
        units30: num(card.unitsSold_30d),
        fulFillable: num(card.fulFillable),
        reserved: num(card.reserved),
        stockFul: num(card.stockFul),
        stockRes: num(card.stockRes),
        lifecycleSeason: card.lifecycleSeason || {},
      });
    }
    const campaign = byCampaign.get(key);
    campaign.spend += num(row.Spend);
    campaign.sales += num(row.Sales);
    campaign.orders += num(row.Orders);
    campaign.clicks += num(row.Clicks);
    campaign.rows += 1;
    campaign.currentBudget = Math.max(campaign.currentBudget, num(row.dailyBudget));
    if (row.adGroupId) campaign.adGroupIds.add(String(row.adGroupId));
    if (row.adId) campaign.adIds.add(String(row.adId));
    if (row.positionType) campaign.positionTypes.add(String(row.positionType));
    if (campaign.sampleRows.length < 3) {
      campaign.sampleRows.push({
        adId: String(row.adId || ''),
        adGroupId: String(row.adGroupId || ''),
        positionType: row.positionType || '',
        spend: num(row.Spend),
        sales: num(row.Sales),
        orders: num(row.Orders),
        clicks: num(row.Clicks),
      });
    }
  }

  const buckets = {};
  for (const lane of OVER_BUDGET_LANES) buckets[lane] = [];

  for (const campaign of byCampaign.values()) {
    const classification = classifyOverBudgetLane({ campaign, currentDate });
    const annotation = (options.capSinceAnnotations instanceof Map)
      ? options.capSinceAnnotations.get(String(campaign.campaignId))
      : null;
    const entry = {
      sku: campaign.sku,
      asin: campaign.asin,
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      adGroupId: campaign.adGroupId,
      groupName: campaign.groupName,
      currentBudget: campaign.currentBudget,
      spend: Number(campaign.spend.toFixed(2)),
      sales: Number(campaign.sales.toFixed(2)),
      orders: campaign.orders,
      clicks: campaign.clicks,
      acos: Number(classification.acos.toFixed(4)),
      rows: campaign.rows,
      adGroupCount: campaign.adGroupIds.size,
      adCount: campaign.adIds.size,
      positionTypes: [...campaign.positionTypes],
      sampleRows: campaign.sampleRows,
      profitRate: campaign.profitRate,
      invDays: campaign.invDays,
      absoluteInventory: campaign.absoluteInventory,
      units7: campaign.units7,
      units30: campaign.units30,
      lane: classification.lane,
      blockers: classification.blockers,
      seasonalSignal: classification.seasonal.seasonalSignal,
      seasonalBlockers: classification.seasonal.blockers,
      capSince: annotation ? annotation.capSince : null,
      cappedHours: annotation ? annotation.cappedHours : null,
    };
    buckets[classification.lane].push(entry);
  }

  for (const lane of OVER_BUDGET_LANES) {
    // Sort by cappedHours (longer-capped first) then by spend
    buckets[lane].sort((a, b) => {
      const ah = Number(a.cappedHours) || 0;
      const bh = Number(b.cappedHours) || 0;
      if (bh !== ah) return bh - ah;
      return b.spend - a.spend;
    });
  }

  const counts = Object.fromEntries(OVER_BUDGET_LANES.map(lane => [lane, buckets[lane].length]));
  const totalClassified = OVER_BUDGET_LANES.reduce((sum, lane) => sum + buckets[lane].length, 0);

  return {
    buckets,
    counts,
    filtered,
    campaignsClassified: totalClassified,
    capturedAt: snapshot.exportedAt || null,
  };
}

function actionTargetsOverBudget(action, overBudgetCampaignIds) {
  if (!action) return false;
  if (isOverBudgetRiskLevel(action.riskLevel)) return true;
  const sources = Array.isArray(action.actionSource) ? action.actionSource.map(String) : [];
  if (sources.some(src => /overbudget|over_budget/i.test(src))) return true;
  const evidence = Array.isArray(action.evidence) ? action.evidence.map(String).join(' ') : '';
  if (/over[_ ]?budget|outOfBudget/i.test(evidence)) return true;
  if (overBudgetCampaignIds && overBudgetCampaignIds.size > 0) {
    const entityId = String(action.campaignId || action.id || '');
    if (entityId && overBudgetCampaignIds.has(entityId)) return true;
  }
  return false;
}

function summarizeOverBudgetCoverage(snapshot = {}, planActions = []) {
  const bucketResult = bucketOverBudgetRows(snapshot);
  const overBudgetCampaignIds = new Set();
  for (const lane of OVER_BUDGET_LANES) {
    for (const entry of bucketResult.buckets[lane]) overBudgetCampaignIds.add(String(entry.campaignId));
  }
  const eligibleCampaigns = bucketResult.campaignsClassified;
  const actionableCampaigns = OVER_BUDGET_LANES
    .filter(lane => lane !== 'review')
    .reduce((sum, lane) => sum + bucketResult.buckets[lane].length, 0);
  const matchedActions = (planActions || []).filter(action => actionTargetsOverBudget(action, overBudgetCampaignIds));
  const matchedCampaignIds = new Set();
  for (const action of matchedActions) {
    const entityId = String(action.campaignId || action.id || '');
    if (entityId && overBudgetCampaignIds.has(entityId)) matchedCampaignIds.add(entityId);
  }
  const warning = (() => {
    if (bucketResult.filtered.rows === 0) return '';
    if (eligibleCampaigns === 0) return '';
    if (actionableCampaigns > 0 && matchedActions.length === 0) {
      return 'overBudget_action_missing_from_schema';
    }
    if (actionableCampaigns > 0 && matchedCampaignIds.size === 0) {
      return 'overBudget_actions_do_not_target_eligible_campaigns';
    }
    return '';
  })();
  return {
    snapshotRows: bucketResult.filtered.rows,
    filtered: bucketResult.filtered,
    counts: bucketResult.counts,
    eligibleCampaigns,
    actionableCampaigns,
    matchedActionCount: matchedActions.length,
    matchedCampaignCount: matchedCampaignIds.size,
    warning,
  };
}

module.exports = {
  OVER_BUDGET_LANES,
  OVER_BUDGET_RISK_LEVELS,
  SEASONAL_WINDOWS,
  SEASONAL_THEME_KEYWORDS,
  SEASONAL_THEME_KEYWORDS_EXTENDED,
  actionTargetsOverBudget,
  activeSeasonalThemes,
  assessOverBudgetAdjustmentObjective,
  assessSeasonalSellThroughOpportunity,
  bucketOverBudgetRows,
  buildSkuStateMap,
  classifyOverBudgetLane,
  computeSeasonalBudgetLift,
  computeSeasonalCloseMatchBid,
  effectiveProfitRate,
  getSkuState,
  hasListingPayload,
  hasSeasonalSellThroughSignal,
  isEnabledState,
  isInSeasonWindow,
  isOverBudgetRiskLevel,
  num,
  preferredProfitRate,
  projectSkuState,
  skuKey,
  summarizeOverBudgetCoverage,
  totalAbsoluteInventory,
};
