function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePct(value) {
  const n = num(value);
  if (!n) return 0;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function combinedAdStats(card = {}, key = '30d') {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    sales: num(sp.sales) + num(sb.sales),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
    acos: 0,
  };
}

function impliedAcos(card = {}, key = '30d') {
  const stats = combinedAdStats(card, key);
  const sales = stats.sales || stats.orders * Math.max(num(card.price), 0);
  if (sales > 0) return stats.spend / sales;
  return stats.spend > 0 ? 99 : 0;
}

function fbaUnits(card = {}) {
  return num(card.fulFillable) +
    num(card.reserved) +
    num(card.inbound) +
    num(card.inb) +
    num(card.inbAndAll) +
    num(card.inb_and_all) +
    num(card.inbAir) +
    num(card.inb_air);
}

function seasonalText(card = {}) {
  const profile = card.productProfile || {};
  return cleanText([
    card.sku,
    card.note,
    card.solrTerm,
    profile.positioning,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.seasonality || []),
    card.listing?.title,
    ...(card.listing?.bullets || []).slice(0, 3),
  ].filter(Boolean).join(' ')).toLowerCase();
}

function seasonalWindow(card = {}, currentDate = new Date()) {
  const text = seasonalText(card);
  const md = (currentDate.getMonth() + 1) * 100 + currentDate.getDate();
  const windows = [
    { label: 'cinco_de_mayo', re: /cinco|mexican|fiesta|taco|cactus|pinata/, start: 401, end: 510, future: false },
    { label: 'nurse_week', re: /nurse|healthcare|medical|lab week/, start: 401, end: 512, future: false },
    { label: 'teacher_appreciation', re: /teacher|school staff|educator|appreciation/, start: 401, end: 520, future: false },
    { label: 'mothers_day', re: /mother|mom|mothers day/, start: 401, end: 515, future: false },
    { label: 'graduation', re: /graduat|class of|senior/, start: 415, end: 630, future: true },
    { label: 'fathers_day', re: /father|dad|fathers day/, start: 501, end: 625, future: true },
    { label: 'summer', re: /summer|beach|pool|swim|luau|tropical|hawaiian/, start: 501, end: 831, future: true },
    { label: 'wedding', re: /wedding|bridal|bride|bridesmaid|bachelorette/, start: 401, end: 831, future: true },
  ];
  const hits = windows.filter(item => item.re.test(text));
  const active = hits.filter(item => md >= item.start && md <= item.end);
  const nearTail = active.some(item => item.end - md <= 14);
  const future = hits.some(item => item.future && md <= item.end);
  return {
    labels: hits.map(item => item.label),
    active: active.length > 0,
    nearTail,
    hasFutureDemand: future || hits.length === 0,
  };
}

function listingSeasonText(card = {}) {
  const listing = card.listing || {};
  const profile = card.productProfile || {};
  return cleanText([
    listing.title,
    ...(listing.bullets || []),
    ...(listing.bulletHighlights || []),
    listing.description,
    listing.aPlusText,
    listing.categoryPath,
    listing.variationText,
    listing.mainImageUrl,
    ...(listing.imageUrls || []),
    profile.positioning,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.visualTheme || []),
  ].filter(Boolean).join(' ')).toLowerCase();
}

function detectThemeWindows(text, currentDate = new Date()) {
  const md = (currentDate.getMonth() + 1) * 100 + currentDate.getDate();
  const rules = [
    { label: 'christmas', kind: 'strong_seasonal', re: /christmas|xmas|santa|stocking stuffer|merry christmas/, start: 901, end: 1231 },
    { label: 'halloween', kind: 'strong_seasonal', re: /halloween|trick or treat|spooky|pumpkin/, start: 801, end: 1031 },
    { label: 'easter', kind: 'strong_seasonal', re: /easter|bunny|egg hunt/, start: 301, end: 430 },
    { label: 'valentines_day', kind: 'strong_seasonal', re: /valentine|galentine|heart gift/, start: 101, end: 220 },
    { label: 'teacher_appreciation', kind: 'current_q2', re: /teacher|educator|school staff|teacher appreciation/, start: 401, end: 520 },
    { label: 'nurse_week', kind: 'current_q2', re: /nurse|rn\b|healthcare|medical assistant|nurse week/, start: 401, end: 512 },
    { label: 'graduation', kind: 'current_q2', re: /graduation|graduate|class of|senior/, start: 415, end: 630 },
    { label: 'mothers_day', kind: 'current_q2', re: /mother|mom|mothers day/, start: 401, end: 515 },
    { label: 'fathers_day', kind: 'current_q2', re: /father|dad|fathers day/, start: 501, end: 625 },
    { label: 'patriotic', kind: 'summer', re: /patriotic|independence day|4th of july|fourth of july|american flag/, start: 601, end: 710 },
    { label: 'summer', kind: 'summer', re: /summer|beach|pool|swim|luau|tropical|hawaiian/, start: 501, end: 831 },
    { label: 'christian_evergreen', kind: 'evergreen', re: /christian|faith|bible|prayer|blessing|inspirational/, start: 101, end: 1231 },
    { label: 'evergreen_gift', kind: 'evergreen', re: /gift basket|thank you gift|appreciation gift|birthday gift|care package|decor|home decor/, start: 101, end: 1231 },
  ];
  return rules
    .filter(rule => rule.re.test(text))
    .map(rule => ({
      label: rule.label,
      kind: rule.kind,
      active: md >= rule.start && md <= rule.end,
      daysUntilStart: md <= rule.start ? rule.start - md : 365,
      daysSinceEnd: md > rule.end ? md - rule.end : 0,
    }));
}

function assessListingSeasonFit(card = {}, options = {}) {
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date(process.env.AD_OPS_CURRENT_DATE || Date.now());
  const text = listingSeasonText(card);
  const themes = detectThemeWindows(text, currentDate);
  const strong = themes.filter(theme => theme.kind === 'strong_seasonal');
  const activeCurrent = themes.filter(theme => theme.active && theme.kind !== 'strong_seasonal');
  const evergreen = themes.filter(theme => theme.kind === 'evergreen');
  const activeStrong = strong.filter(theme => theme.active);
  const offSeasonStrong = strong.filter(theme => !theme.active);
  const hasTransferPath = activeCurrent.length > 0 || evergreen.length > 0;
  const title = cleanText(card.listing?.title || '').toLowerCase();
  const bullets = cleanText([...(card.listing?.bullets || []), ...(card.listing?.bulletHighlights || [])].join(' ')).toLowerCase();
  const imageText = cleanText([card.listing?.mainImageUrl, ...(card.listing?.imageUrls || []), ...(card.productProfile?.visualTheme || [])].filter(Boolean).join(' ')).toLowerCase();
  const expiredTitle = offSeasonStrong.some(theme => title.includes(theme.label.split('_')[0]) || theme.re?.test?.(title));
  const expiredImage = offSeasonStrong.some(theme => imageText.includes(theme.label.split('_')[0]));
  const bulletsFitCurrent = activeCurrent.length === 0 || activeCurrent.some(theme => bullets.includes(theme.label.split('_')[0]) || text.includes(theme.label.split('_')[0]));

  let fit = 'unclear';
  let pushLevel = 'light_test';
  let recommendation = '小预算、小 bid 测试';
  if (activeStrong.length || activeCurrent.length || evergreen.length) {
    fit = 'fit_current';
    pushLevel = 'normal_push';
    recommendation = 'Listing 明确适配当前节点或全年礼品，可正常建组/加投';
  }
  if (offSeasonStrong.length && hasTransferPath) {
    fit = 'transferable';
    pushLevel = 'light_test';
    recommendation = 'Listing 可转当前节点或全年礼品，只能小预算小 bid 测试';
  }
  if (offSeasonStrong.length && !hasTransferPath) {
    fit = 'offseason_mismatch';
    pushLevel = 'do_not_push';
    recommendation = 'Listing 强绑定过期/远期节日，当前月份不适合开广告强推';
  }
  if ((expiredTitle || expiredImage || !bulletsFitCurrent) && offSeasonStrong.length) {
    fit = hasTransferPath ? 'listing_update_required' : 'offseason_mismatch';
    pushLevel = hasTransferPath ? 'listing_update_required' : 'do_not_push';
    recommendation = hasTransferPath
      ? '先改 Listing 标题/图片/五点，再低力度测试'
      : '先比较留仓到旺季、低价清货、低力度测试，不直接投放';
  }

  return {
    fit,
    pushLevel,
    recommendation,
    themes: themes.map(theme => theme.label),
    activeThemes: themes.filter(theme => theme.active).map(theme => theme.label),
    offSeasonThemes: offSeasonStrong.map(theme => theme.label),
    hasTransferPath,
    expiredTitle,
    expiredImage,
    bulletsFitCurrent,
  };
}

function salesHistorySource(card = {}) {
  return card.salesHistory || card.skuSalesHistory || card.historySales || null;
}

function salesHistoryRows(history = {}) {
  if (!history) return [];
  return Array.isArray(history.rows) ? history.rows : [];
}

function salesHistorySummary(history = {}) {
  if (!history) return {};
  return history.summary && typeof history.summary === 'object' ? history.summary : {};
}

function monthName(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  return `${String(n).padStart(2, '0')}月`;
}

function hasSeasonAhead(summary = {}, currentDate = new Date()) {
  const start = Number(summary.historicalStartMonth || 0);
  const currentMonth = currentDate.getMonth() + 1;
  if (!start) return false;
  return start > currentMonth && start - currentMonth <= 5;
}

function assessSkuSalesHistory(card = {}, options = {}) {
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date(process.env.AD_OPS_CURRENT_DATE || Date.now());
  const history = salesHistorySource(card);
  const rows = salesHistoryRows(history);
  const summary = salesHistorySummary(history);
  const parseWarning = history?.parseWarning || '';
  const hasRows = rows.length > 0;
  const lastYearSamePeriodQty = num(summary.lastYearSamePeriodQty);
  const recent30Qty = num(summary.recent30Qty);
  const recent7Qty = num(summary.recent7Qty);
  const historicalStartMonth = summary.historicalStartMonth || '';
  const historicalPeakMonth = summary.historicalPeakMonth || '';
  const seasonStage = summary.seasonStage || (hasRows ? 'unknown' : 'no_history');
  const isNearHistoricalStart = !!summary.isNearHistoricalStart;
  const seasonAhead = hasSeasonAhead(summary, currentDate);
  const longTermWeak = hasRows && lastYearSamePeriodQty === 0 && recent30Qty === 0 &&
    (summary.monthTotals || []).reduce((sum, item) => sum + num(item.qty), 0) < 10;

  let demandSignal = 'unknown';
  let pushLevel = 'light_test';
  let suitableToTest = '小测';
  let recommendation = '历史销量不足或字段不完整，只能低力度验证，不能按 ACOS 机械加投。';

  if (parseWarning && !hasRows) {
    demandSignal = 'parse_warning';
    pushLevel = 'history_unknown';
    suitableToTest = '先补数据/小测';
    recommendation = '历史销量 HTML 未能识别出日期/销量字段，保留原始片段和 parseWarning，禁止用假数据替代。';
  } else if (!hasRows) {
    demandSignal = 'no_history';
    pushLevel = 'light_test';
    suitableToTest = '小测';
    recommendation = '没有可用历史销量，广告只允许低预算验证，不把 FBA 库存等同于立即强推。';
  } else if (longTermWeak) {
    demandSignal = 'long_term_weak';
    pushLevel = 'clearance_or_rework';
    suitableToTest = '清货/重做 Listing';
    recommendation = '历史长期动销弱，即使有 FBA 库存也不能继续无脑烧广告，应进入清货、降价或 Listing 重做判断。';
  } else if (seasonStage === 'peak' || seasonStage === 'active') {
    demandSignal = seasonStage;
    pushLevel = seasonStage === 'peak' ? 'scale_push' : 'normal_push';
    suitableToTest = seasonStage === 'peak' ? '加大推' : '正常推';
    recommendation = '当前已进入历史动销期，若 Listing 适配，可正常推或加大库存消化力度。';
  } else if (isNearHistoricalStart || seasonStage === 'warmup') {
    demandSignal = 'near_start';
    pushLevel = 'warmup_test';
    suitableToTest = '小测';
    recommendation = '当前接近历史动销起点，适合小预算、小 bid 预热，不做激进放量。';
  } else if (seasonAhead) {
    demandSignal = 'season_ahead';
    pushLevel = 'hold_wait_season';
    suitableToTest = '留仓等待';
    recommendation = '历史证明旺季在后面，当前淡季应优先比较留仓到旺季、低价清货、轻测，不机械清掉。';
  } else if (lastYearSamePeriodQty > 0) {
    demandSignal = 'same_period_demand';
    pushLevel = 'light_or_normal';
    suitableToTest = '小测/正常推';
    recommendation = '去年同期有销量，当前可尝试承接，但力度仍需受 Listing 适配和库存经济性约束。';
  } else {
    demandSignal = 'offseason';
    pushLevel = 'do_not_push';
    suitableToTest = '不开/留仓等待';
    recommendation = '当前不在历史动销窗口，不应因为 FBA 有库存就强推广告。';
  }

  return {
    hasHistory: hasRows,
    parseWarning,
    rowsCount: rows.length,
    lastYearSamePeriodQty,
    recent30Qty,
    recent7Qty,
    historicalPeakMonth,
    historicalStartMonth,
    isNearHistoricalStart,
    seasonStage,
    demandSignal,
    pushLevel,
    suitableToTest,
    longTermWeak,
    seasonAhead,
    recommendation,
  };
}

function assessInventoryResponsibility(card = {}, options = {}) {
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date(process.env.AD_OPS_CURRENT_DATE || Date.now());
  const units = fbaUnits(card);
  const sellableDays3 = num(card.sellableDays_3d);
  const sellableDays7 = num(card.sellableDays_7d);
  const invDays = num(card.sellableDays_30d || card.invDays);
  const hasShortVelocityDays = (sellableDays3 > 0 && sellableDays3 <= 7) || (sellableDays7 > 0 && sellableDays7 <= 10);
  const sold7 = num(card.unitsSold_7d);
  const sold30 = num(card.unitsSold_30d);
  const profitRate = normalizePct(card.profitRate);
  const netProfitRate = normalizePct(card.netProfit || card.busyNetProfit || profitRate);
  const acos30 = impliedAcos(card, '30d');
  const acos7 = impliedAcos(card, '7d');
  const adOrders30 = combinedAdStats(card, '30d').orders;
  const adOrders7 = combinedAdStats(card, '7d').orders;
  const hasFbaResponsibility = units > 0 || !!cleanText(card.fuldate || card.opendate);
  const salesVelocity = sold30 > 0 || sold7 > 0 || adOrders30 > 0 || adOrders7 > 0;
  const season = seasonalWindow(card, currentDate);

  const highInventoryPressure = hasFbaResponsibility && (
    invDays >= 90 ||
    (invDays >= 60 && units >= 10) ||
    (units >= 50 && sold30 < 20)
  );
  const lowInventoryPressure = hasFbaResponsibility && ((invDays > 0 && invDays < 25) || hasShortVelocityDays);
  const staleRisk = highInventoryPressure && (sold30 < 15 || invDays >= 120 || season.nearTail);

  const liquidationLossRate = num(options.liquidationLossRate, 0.55);
  const continueLossRate = Math.max(0, Math.max(acos7 && acos7 < 90 ? acos7 : 0, acos30 && acos30 < 90 ? acos30 : 0) - Math.max(profitRate, netProfitRate));
  const continueAdBeatsClearance = salesVelocity && continueLossRate <= liquidationLossRate;
  const adWorseThanClearance = highInventoryPressure && !continueAdBeatsClearance && continueLossRate > liquidationLossRate;
  const allowHighAcosSellThrough = highInventoryPressure && salesVelocity && continueAdBeatsClearance;
  const restrictScaleUp = lowInventoryPressure;

  let pressureLevel = 'normal';
  if (lowInventoryPressure) pressureLevel = 'low_stock';
  else if (highInventoryPressure && season.nearTail) pressureLevel = 'high_tail';
  else if (highInventoryPressure) pressureLevel = 'high';

  let strategy = 'efficiency_control';
  if (restrictScaleUp) strategy = 'preserve_inventory';
  else if (adWorseThanClearance) strategy = 'clearance_or_cut';
  else if (highInventoryPressure && season.nearTail) strategy = 'sell_through_clearance_ads';
  else if (allowHighAcosSellThrough) strategy = 'sell_through_ads';
  else if (staleRisk) strategy = 'stale_watch';

  return {
    fbaUnits: units,
    invDays,
    sellableDays3,
    sellableDays7,
    sellableDays30: invDays,
    sold7,
    sold30,
    profitRate,
    netProfitRate,
    acos7,
    acos30,
    hasFbaResponsibility,
    salesVelocity,
    highInventoryPressure,
    lowInventoryPressure,
    staleRisk,
    seasonalTail: season.nearTail,
    seasonalLabels: season.labels,
    hasFutureDemand: season.hasFutureDemand,
    continueLossRate,
    liquidationLossRate,
    continueAdBeatsClearance,
    adWorseThanClearance,
    allowHighAcosSellThrough,
    restrictScaleUp,
    pressureLevel,
    strategy,
  };
}

function inventoryEvidence(assessment = {}) {
  return [
    `fbaUnits=${assessment.fbaUnits}`,
    `sellableDays3/7/30=${assessment.sellableDays3}/${assessment.sellableDays7}/${assessment.sellableDays30}`,
    `inventoryPressure=${assessment.pressureLevel}`,
    `sellerResponsibility=${assessment.hasFbaResponsibility}`,
    `staleRisk=${assessment.staleRisk}`,
    `seasonalTail=${assessment.seasonalTail}`,
    `futureDemand=${assessment.hasFutureDemand}`,
    `continueLossRate=${assessment.continueLossRate.toFixed(4)}`,
    `clearanceLossRate=${assessment.liquidationLossRate.toFixed(4)}`,
    `continueAdBeatsClearance=${assessment.continueAdBeatsClearance}`,
    `inventoryStrategy=${assessment.strategy}`,
  ];
}

function listingSeasonEvidence(fit = {}) {
  return [
    `listingSeasonFit=${fit.fit}`,
    `listingPushLevel=${fit.pushLevel}`,
    `listingThemes=${(fit.themes || []).join(',') || 'none'}`,
    `listingActiveThemes=${(fit.activeThemes || []).join(',') || 'none'}`,
    `listingOffSeasonThemes=${(fit.offSeasonThemes || []).join(',') || 'none'}`,
    `listingTransferPath=${fit.hasTransferPath}`,
    `listingExpiredTitle=${fit.expiredTitle}`,
    `listingExpiredImage=${fit.expiredImage}`,
    `listingBulletsFitCurrent=${fit.bulletsFitCurrent}`,
  ];
}

function salesHistoryEvidence(history = {}) {
  return [
    `salesHistoryRows=${history.rowsCount || 0}`,
    `salesHistoryParseWarning=${history.parseWarning || 'none'}`,
    `historicalStartMonth=${history.historicalStartMonth || 'unknown'}`,
    `historicalPeakMonth=${history.historicalPeakMonth || 'unknown'}`,
    `lastYearSamePeriodQty=${history.lastYearSamePeriodQty || 0}`,
    `recent30Qty=${history.recent30Qty || 0}`,
    `recent7Qty=${history.recent7Qty || 0}`,
    `historySeasonStage=${history.seasonStage || 'unknown'}`,
    `historyDemandSignal=${history.demandSignal || 'unknown'}`,
    `historyPushLevel=${history.pushLevel || 'unknown'}`,
  ];
}

function assessCurrentAdReadiness(card = {}, context = {}, options = {}) {
  const inventory = context.inventory || assessInventoryResponsibility(card, options);
  const listing = context.listing || assessListingSeasonFit(card, options);
  const history = context.history || assessSkuSalesHistory(card, options);
  const offSeasonStrong = (listing.offSeasonThemes || []).length > 0;
  const hasCurrentTheme = (listing.activeThemes || []).length > 0 || listing.fit === 'fit_current';
  const listingMismatch = ['do_not_push', 'listing_update_required'].includes(listing.pushLevel) || listing.fit === 'offseason_mismatch';
  const listingRequiresUpdate = listing.pushLevel === 'listing_update_required' || listing.expiredTitle || listing.expiredImage;
  const noCurrentHistoryDemand = ['offseason', 'no_history'].includes(history.seasonStage) &&
    history.lastYearSamePeriodQty <= 0 &&
    history.recent30Qty <= 0;
  const historySamePeriodDemand = history.lastYearSamePeriodQty > 0;
  const canTransferCurrentNode = listing.hasTransferPath || listing.fit === 'transferable' || listing.fit === 'fit_current';
  const highPressureLightTestEconomic = inventory.highInventoryPressure &&
    (inventory.continueAdBeatsClearance || inventory.allowHighAcosSellThrough || inventory.strategy === 'sell_through_clearance_ads');
  const explicitClearanceAd = inventory.highInventoryPressure && inventory.staleRisk && inventory.continueAdBeatsClearance;
  const isOverseason = offSeasonStrong && !hasCurrentTheme && (listingMismatch || noCurrentHistoryDemand);

  let recommendation = '轻测';
  let buildAdAdvice = '轻测';
  let currentSeasonStage = history.seasonStage || (hasCurrentTheme ? 'current_window' : 'unknown');
  let reason = '当前需求窗口不完全明确，只允许小预算验证，不进入正常放量池。';

  if (offSeasonStrong && listingRequiresUpdate && !historySamePeriodDemand) {
    recommendation = '需改 Listing 后再测';
    buildAdAdvice = '不建广告';
    reason = 'Listing 标题、主图或五点仍强绑定过季节日；保留页面可以，但改图改文案前禁止新建广告、加词、加 ASIN、加 bid 或加预算。';
  } else if (isOverseason && !historySamePeriodDemand && !canTransferCurrentNode) {
    recommendation = history.seasonAhead ? '等待下个节点' : '不建广告';
    buildAdAdvice = recommendation;
    reason = 'Listing 强绑定过季/远期节日，历史也不支持当前月份动销；保留页面是为了保留评价和未来节点，不代表现在建广告。';
  } else if (listingMismatch && !canTransferCurrentNode) {
    recommendation = '需改 Listing 后再测';
    buildAdAdvice = '不建广告';
    reason = '当前 Listing 不适合当下流量，短期未改图改文案前不新增广告、不加词、不加 bid。';
  } else if (history.longTermWeak) {
    recommendation = '清货对比';
    buildAdAdvice = '清货对比';
    reason = '历史长期需求弱，需要比较清货、降价、Listing 重做和低成本辅助出货，不进入正常放量。';
  } else if (historySamePeriodDemand || canTransferCurrentNode || highPressureLightTestEconomic || explicitClearanceAd) {
    recommendation = (hasCurrentTheme && ['active', 'peak'].includes(history.seasonStage)) ? '正常推' : '轻测';
    buildAdAdvice = recommendation;
    reason = '满足历史同期有需求、可转当前节点、Listing 已适配或库存压力下轻测经济性可能优于直接清货，允许低力度尝试。';
  } else if (history.seasonAhead || history.pushLevel === 'hold_wait_season') {
    recommendation = '等待下个节点';
    buildAdAdvice = '等待下个节点';
    reason = '历史旺季在后面，当前应保留页面和评价，等待下一轮节点，必要时只做清货经济性对比。';
  }

  const pageHold = ['不建广告', '等待下个节点', '需改 Listing 后再测'].includes(recommendation);
  const allowLightTest = ['轻测', '正常推', '清货对比'].includes(recommendation) &&
    (historySamePeriodDemand || canTransferCurrentNode || highPressureLightTestEconomic || explicitClearanceAd);
  const disallowNewAds = pageHold;
  const disallowScaleActions = pageHold || recommendation === '清货对比';

  return {
    currentSeasonStage,
    isOverseason,
    listingFit: listing.fit,
    listingPushLevel: listing.pushLevel,
    listingRequiresUpdate,
    historySamePeriodDemand,
    noCurrentHistoryDemand,
    canTransferCurrentNode,
    allowLightTest,
    pageHold,
    disallowNewAds,
    disallowScaleActions,
    allowDefensiveAds: historySamePeriodDemand || inventory.continueAdBeatsClearance,
    recommendation,
    buildAdAdvice,
    reason,
  };
}

function currentAdReadinessEvidence(readiness = {}) {
  return [
    `currentSeasonStage=${readiness.currentSeasonStage || 'unknown'}`,
    `adReadinessRecommendation=${readiness.recommendation || 'unknown'}`,
    `isOverseason=${!!readiness.isOverseason}`,
    `readinessListingFit=${readiness.listingFit || 'unknown'}`,
    `historySamePeriodDemand=${!!readiness.historySamePeriodDemand}`,
    `canTransferCurrentNode=${!!readiness.canTransferCurrentNode}`,
    `allowLightTest=${!!readiness.allowLightTest}`,
    `pageHold=${!!readiness.pageHold}`,
    `disallowNewAds=${!!readiness.disallowNewAds}`,
    `disallowScaleActions=${!!readiness.disallowScaleActions}`,
  ];
}

function productAgeDays(card = {}, options = {}) {
  const raw = card.opendate || card.fuldate || card.openDate || card.firstAvailableDate || '';
  const openedAt = Date.parse(String(raw || '').slice(0, 10));
  if (!Number.isFinite(openedAt)) return null;
  const currentDate = options.currentDate ? new Date(options.currentDate) : new Date(process.env.AD_OPS_CURRENT_DATE || Date.now());
  const now = currentDate.getTime();
  if (!Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - openedAt) / 86400000));
}

function lifecycleStage(card = {}, options = {}) {
  const age = productAgeDays(card, options);
  const sold30 = num(card.unitsSold_30d);
  const yoy = normalizePct(card.yoyAsinPct ?? card.yoyUnitsPct ?? card.yoySalesPct);
  if (age != null && age <= 150) return 'new_0_5m';
  if (age != null && age <= 365) return 'ramp_6_12m';
  if (sold30 > 0 && yoy <= -0.25) return 'declining_old';
  if (age != null && age >= 730) return 'old_2y_plus';
  if (age != null && age > 365) return 'mature_1y_plus';
  if (sold30 <= 3) return 'unknown_low_velocity';
  return 'unknown';
}

function assessLifecycleSeasonStrategy(card = {}, context = {}, options = {}) {
  const inventory = context.inventory || assessInventoryResponsibility(card, options);
  const listing = context.listing || assessListingSeasonFit(card, options);
  const history = context.history || assessSkuSalesHistory(card, options);
  const readiness = context.readiness || assessCurrentAdReadiness(card, { inventory, listing, history }, options);
  const stage = lifecycleStage(card, options);
  const ageDays = productAgeDays(card, options);
  const ad7 = combinedAdStats(card, '7d');
  const ad30 = combinedAdStats(card, '30d');
  const price = num(card.price || card.listing?.price);
  const sales7 = ad7.sales || num(card.unitsSold_7d) * price;
  const sales30 = ad30.sales || num(card.unitsSold_30d) * price;
  const profitRate = normalizePct(card.profitRate);
  const contributionProfit7 = sales7 * profitRate - ad7.spend;
  const contributionProfit30 = sales30 * profitRate - ad30.spend;
  const strongOffSeasonListing = (listing.offSeasonThemes || []).length > 0 && (listing.expiredTitle || listing.expiredImage);
  const activeSeason = !strongOffSeasonListing && ((listing.activeThemes || []).length > 0 || ['active', 'peak'].includes(history.seasonStage));
  const warmupSeason = history.pushLevel === 'warmup_test' || history.demandSignal === 'near_start';
  const tailSeason = inventory.seasonalTail || history.seasonStage === 'tail';
  const offseason = strongOffSeasonListing || readiness.isOverseason || listing.pushLevel === 'do_not_push' || history.pushLevel === 'hold_wait_season';
  const hasConversion = ad7.orders > 0 || ad30.orders >= 2;
  const spendWithoutLearning = ad7.spend >= 8 && ad7.orders === 0 && contributionProfit7 < 0;

  let seasonPhase = 'evergreen_or_unclear';
  if (offseason) seasonPhase = 'offseason_or_wait';
  else if (tailSeason) seasonPhase = 'season_tail';
  else if (activeSeason) seasonPhase = 'active_window';
  else if (warmupSeason) seasonPhase = 'warmup';

  let aiDecisionFrame = 'balanced_efficiency';
  if (stage === 'new_0_5m') {
    if (seasonPhase === 'active_window') aiDecisionFrame = hasConversion ? 'new_window_accelerate_verified' : 'new_window_buy_data_tightly';
    else if (seasonPhase === 'warmup') aiDecisionFrame = 'new_warmup_buy_data';
    else if (seasonPhase === 'season_tail') aiDecisionFrame = hasConversion ? 'new_tail_collect_verified_demand' : 'new_tail_stop_unverified_spend';
    else if (seasonPhase === 'offseason_or_wait') aiDecisionFrame = 'new_offseason_hold_or_reposition';
    else aiDecisionFrame = hasConversion ? 'new_evergreen_verify_scale' : 'new_evergreen_low_budget_test';
  } else if (stage === 'declining_old' || stage === 'old_2y_plus' || stage === 'mature_1y_plus') {
    if (seasonPhase === 'active_window') aiDecisionFrame = hasConversion ? 'old_window_capture_verified' : 'old_window_retest_or_fix';
    else if (seasonPhase === 'warmup') aiDecisionFrame = 'old_warmup_prepare_proven_paths';
    else if (seasonPhase === 'season_tail') aiDecisionFrame = inventory.highInventoryPressure ? 'old_tail_sell_through_or_clearance' : 'old_tail_profit_preserve';
    else if (seasonPhase === 'offseason_or_wait') aiDecisionFrame = inventory.highInventoryPressure ? 'old_offseason_clearance_compare' : 'old_offseason_hold';
    else aiDecisionFrame = hasConversion ? 'old_evergreen_profit_harvest' : 'old_evergreen_rework_before_spend';
  }

  return {
    lifecycleStage: stage,
    ageDays,
    seasonPhase,
    aiDecisionFrame,
    activeThemes: listing.activeThemes || [],
    offSeasonThemes: listing.offSeasonThemes || [],
    historicalStartMonth: history.historicalStartMonth || '',
    historicalPeakMonth: history.historicalPeakMonth || '',
    hasConversion,
    spendWithoutLearning,
    sales7,
    sales30,
    adSpend7: ad7.spend,
    adSpend30: ad30.spend,
    adOrders7: ad7.orders,
    adOrders30: ad30.orders,
    contributionProfit7,
    contributionProfit30,
    aiMustAnswer: [
      'Is this strategic seasonal investment or unproductive spend?',
      'Did incremental ad spend buy sales, conversion learning, ranking, or only clicks?',
      'For new products: accelerate, narrow to verified traffic, buy data with a cap, or fix the offer?',
      'For mature/old products: capture the window, harvest profit, clear inventory, wait for season, or rework listing?',
    ],
  };
}

function lifecycleSeasonEvidence(strategy = {}) {
  return [
    `lifecycleStage=${strategy.lifecycleStage || 'unknown'}`,
    `productAgeDays=${strategy.ageDays == null ? 'unknown' : strategy.ageDays}`,
    `seasonPhase=${strategy.seasonPhase || 'unknown'}`,
    `aiDecisionFrame=${strategy.aiDecisionFrame || 'unknown'}`,
    `activeThemes=${(strategy.activeThemes || []).join(',') || 'none'}`,
    `offSeasonThemes=${(strategy.offSeasonThemes || []).join(',') || 'none'}`,
    `historicalStartMonth=${strategy.historicalStartMonth || 'unknown'}`,
    `historicalPeakMonth=${strategy.historicalPeakMonth || 'unknown'}`,
    `hasConversion=${!!strategy.hasConversion}`,
    `spendWithoutLearning=${!!strategy.spendWithoutLearning}`,
    `contributionProfit7=${num(strategy.contributionProfit7).toFixed(2)}`,
    `contributionProfit30=${num(strategy.contributionProfit30).toFixed(2)}`,
  ];
}

function formatLifecycleSeasonJudgement(strategy = {}) {
  return [
    '[Lifecycle/Season AI frame]',
    `stage=${strategy.lifecycleStage || 'unknown'}`,
    `seasonPhase=${strategy.seasonPhase || 'unknown'}`,
    `frame=${strategy.aiDecisionFrame || 'unknown'}`,
    `activeThemes=${(strategy.activeThemes || []).join(',') || 'none'}`,
    `offSeasonThemes=${(strategy.offSeasonThemes || []).join(',') || 'none'}`,
    `spendWithoutLearning=${strategy.spendWithoutLearning ? 'yes' : 'no'}`,
    'AI must decide by lifecycle + season + incremental profit, not by ACOS alone',
  ].join('; ');
}

function formatInventoryJudgement(assessment = {}) {
  const pressure = {
    low_stock: 'FBA库存低/可卖天数短，限制加投',
    high_tail: 'FBA库存压力高且接近节点尾声，优先库存消化',
    high: 'FBA库存压力高，销售有卖货责任',
    normal: 'FBA库存压力正常',
  }[assessment.pressureLevel] || 'FBA库存压力正常';
  const comparison = assessment.continueAdBeatsClearance
    ? '继续广告卖的预期损失低于批量清货/移除'
    : '继续广告卖未明显优于批量清货/移除';
  return `${pressure}；${assessment.hasFbaResponsibility ? '已形成销售责任' : '未形成明显FBA销售责任'}；不是简单看ACOS，需比较库存消化与清货损失；${comparison}；建议策略=${assessment.strategy}`;
}

function formatListingSeasonJudgement(fit = {}) {
  const fitText = {
    fit_current: 'Listing 适配当前月份/节点',
    transferable: 'Listing 可转当前节点或全年礼品',
    listing_update_required: 'Listing 有转节点可能，但标题/图片/五点需先修',
    offseason_mismatch: 'Listing 强绑定过期或远期节日，当前不适合强推',
    unclear: 'Listing 季节适配不明确，只能轻测',
  }[fit.fit] || 'Listing 季节适配不明确';
  return `${fitText}；当前主题=${(fit.themes || []).join(',') || '未识别'}；当前活跃节点=${(fit.activeThemes || []).join(',') || '无'}；过期/远期强绑定=${(fit.offSeasonThemes || []).join(',') || '无'}；尝试力度=${fit.pushLevel}；${fit.recommendation || ''}`;
}

function formatSalesHistoryJudgement(history = {}) {
  return [
    '【历史销量依据】',
    `历史动销起点：${monthName(history.historicalStartMonth)}`,
    `历史旺季：${monthName(history.historicalPeakMonth)}`,
    `去年同期表现：${history.lastYearSamePeriodQty || 0} 件`,
    `当前阶段：${history.seasonStage || 'unknown'}`,
    `当前是否适合尝试：${history.suitableToTest || '小测'}`,
    `建议力度：${history.suitableToTest || history.pushLevel || '小测'}`,
    `结论原因：${history.recommendation || ''}`,
  ].join('；');
}

function formatCurrentAdReadiness(readiness = {}) {
  return [
    '【是否适合当前建广告】',
    `当前节气阶段：${readiness.currentSeasonStage || 'unknown'}`,
    `是否过季：${readiness.isOverseason ? '是' : '否'}`,
    `Listing 是否适配：${readiness.listingFit || 'unknown'}`,
    `历史同期是否有销量：${readiness.historySamePeriodDemand ? '是' : '否'}`,
    `建议：${readiness.recommendation || '轻测'}`,
    `原因：${readiness.reason || ''}`,
  ].join('；');
}

function assessAdOperatingContext(card = {}, options = {}) {
  const inventory = assessInventoryResponsibility(card, options);
  const listing = assessListingSeasonFit(card, options);
  const history = assessSkuSalesHistory(card, options);
  const readiness = assessCurrentAdReadiness(card, { inventory, listing, history }, options);
  const lifecycleSeason = assessLifecycleSeasonStrategy(card, { inventory, listing, history, readiness }, options);
  let finalAction = listing.pushLevel;
  if (['do_not_push', 'listing_update_required'].includes(listing.pushLevel)) finalAction = listing.pushLevel;
  if (listing.pushLevel === 'normal_push' && history.pushLevel === 'scale_push') finalAction = 'scale_push';
  if (listing.pushLevel === 'normal_push' && history.pushLevel === 'normal_push') finalAction = 'normal_push';
  if (history.pushLevel === 'warmup_test' && !['do_not_push', 'listing_update_required'].includes(listing.pushLevel)) finalAction = 'light_warmup_test';
  if (history.pushLevel === 'hold_wait_season') finalAction = 'hold_wait_season_or_light_test';
  if (['do_not_push', 'clearance_or_rework'].includes(history.pushLevel) && listing.pushLevel !== 'normal_push') finalAction = 'hold_clearance_or_listing_update';
  if (listing.pushLevel === 'normal_push' && inventory.allowHighAcosSellThrough) finalAction = 'normal_push_sell_through';
  if (listing.pushLevel === 'normal_push' && inventory.restrictScaleUp) finalAction = 'hold_or_light_test';
  if ((listing.pushLevel === 'do_not_push' || listing.pushLevel === 'listing_update_required') && inventory.highInventoryPressure) {
    finalAction = 'hold_clearance_or_listing_update';
  }
  if (history.longTermWeak && inventory.highInventoryPressure) finalAction = 'clearance_or_listing_rework';
  if (readiness.disallowNewAds) finalAction = readiness.recommendation === '等待下个节点' ? 'page_hold_wait_next_node' : 'page_hold_do_not_create';
  if (readiness.recommendation === '清货对比') finalAction = 'clearance_economic_compare';
  return {
    inventory,
    listing,
    history,
    readiness,
    lifecycleSeason,
    finalAction,
    judgement: `${formatInventoryJudgement(inventory)}；${formatListingSeasonJudgement(listing)}；${formatSalesHistoryJudgement(history)}；${formatCurrentAdReadiness(readiness)}；最终建议=${finalAction}`,
  };
}

module.exports = {
  assessAdOperatingContext,
  assessCurrentAdReadiness,
  assessSkuSalesHistory,
  assessInventoryResponsibility,
  assessListingSeasonFit,
  combinedAdStats,
  fbaUnits,
  formatInventoryJudgement,
  formatListingSeasonJudgement,
  formatSalesHistoryJudgement,
  formatCurrentAdReadiness,
  assessLifecycleSeasonStrategy,
  formatLifecycleSeasonJudgement,
  lifecycleSeasonEvidence,
  impliedAcos,
  currentAdReadinessEvidence,
  inventoryEvidence,
  listingSeasonEvidence,
  salesHistoryEvidence,
  seasonalWindow,
};
