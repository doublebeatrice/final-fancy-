function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = num(value, NaN);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function dateOnly(value) {
  const s = text(value);
  const match = s.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function daysBetween(fromDate, toDate) {
  const from = Date.parse(`${dateOnly(fromDate)}T00:00:00Z`);
  const to = Date.parse(`${dateOnly(toDate)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

function fulResUnits(card = {}) {
  return num(card.fulResUnits ?? card.fulFillable ?? card.fulfillable ?? card.stockFul) +
    num(card.reservedQty ?? card.reserved ?? card.stockRes);
}

function sellableDays7d(card = {}) {
  const explicit = num(card.sellableDays7d ?? card.sellableDays_7d, NaN);
  if (Number.isFinite(explicit)) return explicit;
  const units7d = num(card.unitsSold_7d ?? card.qty_7, 0);
  if (units7d <= 0) return null;
  return round(fulResUnits(card) / (units7d / 7), 1);
}

function adWindow(card = {}, key) {
  const stats = card.adStats?.[key] || card.stats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  return {
    impressions: num(stats.impressions ?? stats.Impressions) + num(sb.impressions ?? sb.Impressions),
    clicks: num(stats.clicks ?? stats.Clicks) + num(sb.clicks ?? sb.Clicks),
    orders: num(stats.orders ?? stats.Orders) + num(sb.orders ?? sb.Orders),
  };
}

function adSuppressed(card = {}) {
  const state = text(card.advState ?? card.adState ?? card.ad_status ?? card.adStatus).toLowerCase();
  if (['off', 'closed', 'disabled'].includes(state)) return true;
  const point = num(card.adv_point ?? card.adPoint ?? card.adCostShare, NaN);
  if (Number.isFinite(point) && point <= 0.01) return true;
  const d3 = adWindow(card, '3d');
  return d3.impressions < 50 && d3.clicks < 2 && d3.orders === 0;
}

function currentPrice(card = {}) {
  return num(card.lowestprice ?? card.lowestPrice ?? card.price ?? card.salesPrice, NaN);
}

function priceLanded(card = {}, targetPrice) {
  const live = currentPrice(card);
  return Number.isFinite(live) && Math.abs(live - targetPrice) < 0.001;
}

function baselineUnits(record = {}, days) {
  return num(
    record.baseline?.[`units${days}d`] ??
      record[`baselineUnits${days}d`] ??
      record[`preUnits${days}d`] ??
      record[`units${days}dBefore`] ??
      record[`beforeUnits${days}d`],
    0,
  );
}

function currentUnits(card = {}, days) {
  return num(card[`unitsSold_${days}d`] ?? card[`qty_${days}`] ?? card[`units${days}d`], 0);
}

function normalizePriceRecord(record = {}) {
  const before = num(record.beforeValue ?? record.currentPrice ?? record.priceRaw ?? record.price_raw, NaN);
  const after = num(record.afterValue ?? record.suggestedPrice ?? record.priceApply ?? record.price_apply, NaN);
  return {
    ...record,
    sku: text(record.sku || record.id).toUpperCase(),
    site: text(record.site || record.salesChannel || 'Amazon.com'),
    beforePrice: before,
    targetPrice: after,
    businessDate: dateOnly(record.businessDate || record.localDate || record.runAt || record.price_apply_time),
  };
}

function isPriceRaiseRecord(record = {}) {
  if (text(record.actionType) !== 'price') return false;
  const normalized = normalizePriceRecord(record);
  return normalized.sku && Number.isFinite(normalized.beforePrice) &&
    Number.isFinite(normalized.targetPrice) && normalized.targetPrice > normalized.beforePrice;
}

function uniqueRecords(records = []) {
  const byKey = new Map();
  for (const raw of records.filter(isPriceRaiseRecord).map(normalizePriceRecord)) {
    const key = `${raw.sku}::${raw.site}::${raw.businessDate}::${raw.beforePrice}->${raw.targetPrice}`;
    const existing = byKey.get(key);
    if (!existing || text(raw.runAt) > text(existing.runAt)) byKey.set(key, raw);
  }
  return [...byKey.values()];
}

function evaluateRecord(record, card = {}, businessDate) {
  const ageDays = daysBetween(record.businessDate, businessDate);
  const reasons = [];
  const livePrice = currentPrice(card);
  const landed = priceLanded(card, record.targetPrice);
  const hasApplicationMarker = Boolean(card.is_price_apply || card.price_apply_time || card.today_price_apply);
  const landingStatus = landed
    ? 'landed'
    : (hasApplicationMarker || ageDays !== null && ageDays <= 3 ? 'submitted_pending' : 'unknown');

  const pre3 = baselineUnits(record, 3);
  const post3 = currentUnits(card, 3);
  const pre7 = baselineUnits(record, 7);
  const post7 = currentUnits(card, 7);
  const d3 = adWindow(card, '3d');
  const suppressed = adSuppressed(card);
  const daysLeft = sellableDays7d(card);
  const extremelyTight = fulResUnits(card) <= 7 || (daysLeft !== null && daysLeft <= 7);

  if (landingStatus !== 'landed') reasons.push('price_application_not_landed');
  if (landed && pre3 >= 6 && post3 <= pre3 * 0.5) reasons.push('post_raise_units_3d_drop_over_50pct');
  if (landed && pre7 >= 10 && post7 <= pre7 * 0.5) reasons.push('post_raise_units_7d_drop_over_50pct');
  if (landed && d3.clicks >= 10 && d3.orders === 0) reasons.push('clicks_without_orders_after_price_raise');
  if (landed && suppressed) reasons.push('ad_delivery_suppressed_after_price_raise');
  if (landed && extremelyTight) reasons.push('inventory_still_extremely_tight');

  let status = 'healthy';
  let recommendedAction = 'close_or_continue_7d_watch';
  if (landingStatus !== 'landed') {
    status = 'watch';
    recommendedAction = 'recheck_landing';
  } else if (suppressed && (post3 === 0 || d3.clicks < 3)) {
    status = 'watch';
    recommendedAction = 'separate_ad_pause_from_price_damage';
  } else if (reasons.includes('clicks_without_orders_after_price_raise') ||
    reasons.includes('post_raise_units_3d_drop_over_50pct') ||
    reasons.includes('post_raise_units_7d_drop_over_50pct')) {
    status = extremelyTight ? 'watch' : 'needs_action';
    recommendedAction = extremelyTight ? 'decide_inventory_protection_vs_sales_recovery' : 'rollback_one_price_step';
  }

  return {
    sku: record.sku,
    asin: text(record.asin || card.asin),
    site: record.site,
    status,
    landingStatus,
    businessDate: record.businessDate,
    ageDays,
    beforePrice: record.beforePrice,
    targetPrice: record.targetPrice,
    liveLowestPrice: Number.isFinite(livePrice) ? livePrice : null,
    baseline: {
      units1d: baselineUnits(record, 1),
      units3d: pre3,
      units7d: pre7,
    },
    current: {
      units1d: currentUnits(card, 1),
      units3d: post3,
      units7d: post7,
      adClicks3d: d3.clicks,
      adOrders3d: d3.orders,
      fulResUnits: fulResUnits(card),
      sellableDays7d: daysLeft,
    },
    reasons,
    recommendedAction,
  };
}

function buildPriceRaiseFollowup(options = {}) {
  const businessDate = dateOnly(options.businessDate) || new Date().toISOString().slice(0, 10);
  const records = uniqueRecords(options.adjustments || options.records || []);
  const bySku = new Map((options.snapshot?.productCards || []).map(card => [text(card.sku).toUpperCase(), card]));
  const windowDays = Number(options.windowDays || 7);
  const items = records
    .filter(record => {
      const age = daysBetween(record.businessDate, businessDate);
      return age !== null && age >= 0 && age <= windowDays;
    })
    .map(record => evaluateRecord(record, bySku.get(record.sku) || {}, businessDate))
    .sort((a, b) => {
      const rank = { needs_action: 0, watch: 1, healthy: 2 };
      return rank[a.status] - rank[b.status] || a.sku.localeCompare(b.sku);
    });
  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    summary: {
      total: items.length,
      needsAction: items.filter(item => item.status === 'needs_action').length,
      watch: items.filter(item => item.status === 'watch').length,
      healthy: items.filter(item => item.status === 'healthy').length,
    },
    items,
  };
}

function renderSection(title, items) {
  const lines = [`## ${title}`];
  if (!items.length) {
    lines.push('- none');
    return lines;
  }
  for (const item of items) {
    lines.push(`- ${item.sku}: ${item.beforePrice}->${item.targetPrice}, live=${item.liveLowestPrice ?? 'unknown'}, ${item.landingStatus}, action=${item.recommendedAction}, reasons=${item.reasons.join('|') || 'none'}`);
  }
  return lines;
}

function renderPriceRaiseFollowupMarkdown(report = {}) {
  const items = report.items || [];
  return [
    `# Price Raise Followup ${report.businessDate || ''}`,
    '',
    `- total: ${report.summary?.total || 0}`,
    `- needs_action: ${report.summary?.needsAction || 0}`,
    `- watch: ${report.summary?.watch || 0}`,
    `- healthy: ${report.summary?.healthy || 0}`,
    '',
    ...renderSection('Needs Action', items.filter(item => item.status === 'needs_action')),
    '',
    ...renderSection('Watch', items.filter(item => item.status === 'watch')),
    '',
    ...renderSection('Healthy', items.filter(item => item.status === 'healthy')),
    '',
  ].join('\n');
}

module.exports = {
  buildPriceRaiseFollowup,
  renderPriceRaiseFollowupMarkdown,
};
