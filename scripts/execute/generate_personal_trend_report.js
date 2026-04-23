const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const inputFile = process.argv[2] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const outDir = process.argv[3] || path.join(ROOT, '黄成喆个人数据趋势', '每日 近七天 数据趋势');

const WATCH_SKUS = ['DN3482', 'DN3049', 'DN2685', 'DN2684', 'DN2683', 'DN2437', 'DN1656', 'DN2108', 'DN1655'];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, digits = 2) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function money(value, digits = 2) {
  return num(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function pp(a, b) {
  if (!a || !b) return '';
  const delta = (num(a) - num(b)) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pp`;
}

function deltaPct(current, previous) {
  const prev = num(previous);
  if (!prev) return null;
  return (num(current) - prev) / Math.abs(prev);
}

function getDate(snapshot) {
  const d = snapshot.exportedAt ? new Date(snapshot.exportedAt) : new Date();
  const local = new Date(d.getTime() + 8 * 3600000);
  return local.toISOString().slice(0, 10);
}

function rowTitle(row) {
  return String(row?.seller_title || '').trim();
}

function findRow(rows, matcher) {
  return rows.find(row => matcher(rowTitle(row), row)) || null;
}

function coreRows(rows) {
  return {
    total: findRow(rows, title => title === '所选编号汇总'),
    hjGroup: findRow(rows, title => title === 'HJ大组'),
    hj1: findRow(rows, title => title === 'HJ1小组'),
    hj171: findRow(rows, title => title.startsWith('HJ171-')),
    hj17: findRow(rows, title => title.startsWith('HJ17-')),
    hj172: findRow(rows, title => title.startsWith('HJ172-')),
  };
}

function hasSales(row) {
  return num(row?.order_sales) > 0 || num(row?.sale_num) > 0;
}

function sellerCode(row) {
  const title = rowTitle(row);
  if (title.startsWith('HJ171')) return 'HJ171';
  if (title.startsWith('HJ172')) return 'HJ172';
  if (title.startsWith('HJ17')) return 'HJ17';
  return title || '-';
}

function isReferenceRow(row) {
  const title = rowTitle(row);
  return title === '所选编号汇总' || title === 'HJ大组' || title === 'HJ1小组';
}

function anomalyScore(row) {
  let score = 0;
  if (num(row.order_sales) >= 3000) score += 1;
  if (num(row.refund_percent) >= 0.08) score += 3;
  else if (num(row.refund_percent) >= 0.05) score += 2;
  if (num(row.net_profit) < 0.12 && num(row.order_sales) >= 3000) score += 3;
  else if (num(row.net_profit) < 0.18 && num(row.order_sales) >= 3000) score += 2;
  if (num(row.ACOS) >= 0.3) score += 2;
  if (num(row.SP) >= 0.35) score += 2;
  if (num(row.qty_yoy_over_1_year) < -0.3 && num(row.order_sales) >= 3000) score += 2;
  return score;
}

function anomalyTags(row) {
  const tags = [];
  if (num(row.refund_percent) >= 0.08) tags.push('高退货');
  if (num(row.net_profit) < 0.12 && num(row.order_sales) >= 3000) tags.push('低净利');
  else if (num(row.net_profit) < 0.18 && num(row.order_sales) >= 3000) tags.push('净利偏低');
  if (num(row.ACOS) >= 0.3) tags.push('ACOS高');
  if (num(row.SP) >= 0.35) tags.push('广告占比高');
  if (num(row.qty_yoy_over_1_year) < -0.3 && num(row.order_sales) >= 3000) tags.push('同比下滑');
  return tags;
}

function adStats(card, key) {
  return card?.adStats?.[key] || { spend: 0, orders: 0, clicks: 0, impressions: 0 };
}

function sbStats(card, key) {
  return card?.sbStats?.[key] || { spend: 0, orders: 0, clicks: 0, impressions: 0 };
}

function combinedStats(card, key) {
  const sp = adStats(card, key);
  const sb = sbStats(card, key);
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function estimatedSales(card, key) {
  return combinedStats(card, key).orders * Math.max(num(card.price), 1);
}

function acos(card, key) {
  const sales = estimatedSales(card, key);
  const spend = combinedStats(card, key).spend;
  if (sales > 0) return spend / sales;
  return spend > 0 ? 99 : 0;
}

function skuTags(card) {
  const tags = [];
  const a30 = acos(card, '30d');
  const sales30 = estimatedSales(card, '30d');
  if (num(card.yoyAsinPct ?? card.yoyUnitsPct) < -0.3) tags.push('同下滑');
  if (num(card.profitRate) < 0) tags.push('利润为负');
  else if (num(card.profitRate) < 0.12) tags.push('利润低');
  if (a30 >= 0.25 && a30 < 90) tags.push('ACOS高');
  if (num(card.invDays) > 180) tags.push('库存压力');
  if (num(card.invDays) < 21 && sales30 > 100) tags.push('库存承接紧');
  if (sales30 === 0 && num(card.unitsSold_30d) > 0) tags.push('广告弱覆盖');
  return tags;
}

function buildSkuPools(cards) {
  const rows = cards.map(card => ({
    sku: card.sku,
    asin: card.asin || '',
    units3: num(card.unitsSold_3d),
    units7: num(card.unitsSold_7d),
    units30: num(card.unitsSold_30d),
    invDays: num(card.invDays),
    yoy: num(card.yoyAsinPct ?? card.yoyUnitsPct),
    profitRate: num(card.profitRate),
    adSpend30: combinedStats(card, '30d').spend,
    adOrders30: combinedStats(card, '30d').orders,
    adSales30: estimatedSales(card, '30d'),
    acos30: acos(card, '30d'),
    campaignCount: Array.isArray(card.campaigns) ? card.campaigns.length : 0,
    tags: skuTags(card),
    watch: WATCH_SKUS.includes(String(card.sku || '')),
  })).filter(row => row.sku);

  const multiProblem = rows
    .filter(row => row.tags.length >= 2 && (row.units30 > 0 || row.adSpend30 > 0 || row.watch))
    .sort((a, b) => b.tags.length - a.tags.length || b.adSpend30 - a.adSpend30)
    .slice(0, 20);

  const trafficPush = rows
    .filter(row => row.units30 >= 8 && row.invDays >= 60 && row.profitRate > -0.25 && row.adOrders30 > 0)
    .sort((a, b) => b.units7 - a.units7 || a.acos30 - b.acos30)
    .slice(0, 12);

  const watch = WATCH_SKUS.map(sku => rows.find(row => row.sku === sku) || {
    sku,
    asin: '',
    units3: 0,
    units7: 0,
    units30: 0,
    invDays: 0,
    yoy: 0,
    profitRate: 0,
    adSpend30: 0,
    adOrders30: 0,
    adSales30: 0,
    acos30: 0,
    campaignCount: 0,
    tags: ['未进入产品画像'],
    watch: true,
  });

  return { rows, multiProblem, trafficPush, watch };
}

function cleanSku(value) {
  return String(value || '').trim().toUpperCase();
}

function buildAdSummaryMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sku = cleanSku(row.sku);
    if (!sku) continue;
    const spend30 = num(row['30_cost'] ?? row.cost);
    const sales30 = num(row['30_sales'] ?? row.sales);
    const orders30 = num(row['30_orders'] ?? row.orders);
    const acos30 = row['30_acos'] == null
      ? (sales30 > 0 ? spend30 / sales30 : (spend30 > 0 ? 99 : 0))
      : num(row['30_acos']);
    map.set(sku, {
      sku,
      spend30,
      sales30,
      orders30,
      clicks30: num(row['30_clicks'] ?? row.clicks),
      impressions30: num(row['30_impressions'] ?? row.impressions),
      acos30,
      cpc30: num(row['30_cpc'] ?? row.cpc),
      spendPrev30: num(row['30_cost_prev'] ?? row.cost_prev),
      salesPrev30: num(row['30_sales_prev'] ?? row.sales_prev),
      ordersPrev30: num(row['30_orders_prev'] ?? row.orders_prev),
      costDeltaPct: deltaPct(row['30_cost'] ?? row.cost, row['30_cost_prev'] ?? row.cost_prev),
      salesDeltaPct: deltaPct(row['30_sales'] ?? row.sales, row['30_sales_prev'] ?? row.sales_prev),
      ordersDeltaPct: deltaPct(row['30_orders'] ?? row.orders, row['30_orders_prev'] ?? row.orders_prev),
      sameSkuSales30: num(row['30_attributedSalesSameSku7d'] ?? row.attributedSalesSameSku7d),
      otherSkuSales30: num(row['30_salesOtherSku7d'] ?? row.SalesOtherSku7d),
    });
  }
  return map;
}

function buildSpManageMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sku = cleanSku(row.sku);
    if (!sku) continue;
    const item = map.get(sku) || {
      sku,
      rows: 0,
      activeRows: 0,
      pausedRows: 0,
      spend30: 0,
      sales30: 0,
      orders30: 0,
      highAcosRows: 0,
    };
    const spend = num(row.Spend);
    const sales = num(row.Sales);
    const orders = num(row.Orders);
    const acosValue = row.ACOS == null ? (sales > 0 ? spend / sales : (spend > 0 ? 99 : 0)) : num(row.ACOS);
    const stateText = `${row.state ?? ''} ${row.campaignState ?? ''} ${row.groupState ?? ''} ${row.servingStatus ?? ''}`.toUpperCase();
    const active = stateText.includes('ENABLED') || row.state === 1 || row.campaignState === 1 || row.groupState === 1;
    item.rows += 1;
    item.activeRows += active ? 1 : 0;
    item.pausedRows += active ? 0 : 1;
    item.spend30 += spend;
    item.sales30 += sales;
    item.orders30 += orders;
    if (acosValue >= 0.3 || acosValue >= 90) item.highAcosRows += 1;
    map.set(sku, item);
  }
  return map;
}

function buildSbCampaignSkuMap(rows, skuList) {
  const knownSkus = [...new Set(skuList.map(cleanSku).filter(Boolean))].sort((a, b) => b.length - a.length);
  const map = new Map();
  for (const row of rows || []) {
    const haystack = `${row.name || ''} ${JSON.stringify(row.adGroups || [])}`.toUpperCase();
    const sku = knownSkus.find(item => haystack.includes(item));
    if (!sku) continue;
    const item = map.get(sku) || {
      sku,
      campaigns: 0,
      activeCampaigns: 0,
      spend30: 0,
      sales30: 0,
      orders30: 0,
    };
    const stateText = `${row.state ?? ''} ${row.servingStatus ?? ''}`.toUpperCase();
    const active = stateText.includes('ENABLED') || row.state === 'ENABLED' || row.state === 1;
    item.campaigns += 1;
    item.activeCampaigns += active ? 1 : 0;
    item.spend30 += num(row.Spend);
    item.sales30 += num(row.Sales);
    item.orders30 += num(row.Orders);
    map.set(sku, item);
  }
  return map;
}

function skuTagsV2(row) {
  const tags = [];
  if (num(row.yoy) < -0.3) tags.push('同下滑');
  if (num(row.profitRate) < 0) tags.push('利润为负');
  else if (num(row.profitRate) < 0.12) tags.push('利润低');
  if (num(row.acos30) >= 0.25 && num(row.acos30) < 90) tags.push('ACOS高');
  if (num(row.acos30) >= 90) tags.push('有花费无订单');
  if (num(row.costDeltaPct) > 0.2 && num(row.ordersDeltaPct) <= 0) tags.push('花费上升订单未跟');
  if (num(row.salesDeltaPct) < -0.2 && num(row.costDeltaPct) > -0.05) tags.push('销售下滑花费未降');
  if (num(row.adSpend30) >= 100) tags.push('广告花费高');
  if (num(row.invDays) > 180) tags.push('库存压力');
  if (num(row.invDays) < 21 && num(row.adSales30) > 100) tags.push('库存承接紧');
  if (num(row.adSales30) === 0 && num(row.units30) > 0) tags.push('广告弱覆盖');
  if (num(row.spActiveRows) > 0) tags.push('SP有开启');
  if (num(row.sbCampaignCount) > 0) tags.push('SB有承接');
  return tags;
}

function buildSkuPoolsV2(cards, snapshot) {
  const adMap = buildAdSummaryMap(snapshot.adSkuSummaryRows || []);
  const spMap = buildSpManageMap(snapshot.advProductManageRows || []);
  const cardSkus = cards.map(card => card.sku).concat((snapshot.adSkuSummaryRows || []).map(row => row.sku));
  const sbMap = buildSbCampaignSkuMap(snapshot.sbCampaignManageRows || [], cardSkus.concat(WATCH_SKUS));
  const cardMap = new Map(cards.map(card => [cleanSku(card.sku), card]));
  const allSkus = [...new Set([...cardMap.keys(), ...adMap.keys(), ...spMap.keys(), ...sbMap.keys(), ...WATCH_SKUS])].filter(Boolean);

  const rows = allSkus.map(sku => {
    const card = cardMap.get(sku) || {};
    const ad = adMap.get(sku);
    const sp = spMap.get(sku) || {};
    const sb = sbMap.get(sku) || {};
    const fallback = combinedStats(card, '30d');
    const fallbackSales = estimatedSales(card, '30d');
    const row = {
      sku,
      asin: card.asin || '',
      units3: num(card.unitsSold_3d),
      units7: num(card.unitsSold_7d),
      units30: num(card.unitsSold_30d),
      invDays: num(card.invDays),
      yoy: num(card.yoyAsinPct ?? card.yoyUnitsPct),
      profitRate: num(card.profitRate),
      adSpend30: ad ? ad.spend30 : fallback.spend,
      adOrders30: ad ? ad.orders30 : fallback.orders,
      adSales30: ad ? ad.sales30 : fallbackSales,
      adClicks30: ad ? ad.clicks30 : fallback.clicks,
      adImpressions30: ad ? ad.impressions30 : fallback.impressions,
      acos30: ad ? ad.acos30 : acos(card, '30d'),
      cpc30: ad ? ad.cpc30 : 0,
      costDeltaPct: ad ? ad.costDeltaPct : null,
      salesDeltaPct: ad ? ad.salesDeltaPct : null,
      ordersDeltaPct: ad ? ad.ordersDeltaPct : null,
      spRows: sp.rows || 0,
      spActiveRows: sp.activeRows || 0,
      spSpend30: sp.spend30 || 0,
      spOrders30: sp.orders30 || 0,
      spHighAcosRows: sp.highAcosRows || 0,
      sbCampaignCount: sb.campaigns || 0,
      sbActiveCampaigns: sb.activeCampaigns || 0,
      sbSpend30: sb.spend30 || 0,
      sbOrders30: sb.orders30 || 0,
      campaignCount: (Array.isArray(card.campaigns) ? card.campaigns.length : 0) + (sp.activeRows || 0) + (sb.activeCampaigns || 0),
      watch: WATCH_SKUS.includes(sku),
    };
    row.tags = skuTagsV2(row);
    return row;
  });

  const multiProblem = rows
    .filter(row => row.tags.length >= 2 && (row.units30 > 0 || row.adSpend30 > 0 || row.watch))
    .sort((a, b) => b.tags.length - a.tags.length || b.adSpend30 - a.adSpend30)
    .slice(0, 20);

  const trafficPush = rows
    .filter(row => row.units30 >= 8 && row.invDays >= 60 && row.profitRate > -0.25 && row.adOrders30 > 0)
    .sort((a, b) => b.units7 - a.units7 || a.acos30 - b.acos30)
    .slice(0, 12);

  const adSummaryAnomalies = rows
    .filter(row => row.adSpend30 > 0 && (
      row.acos30 >= 0.25 ||
      (num(row.costDeltaPct) > 0.2 && num(row.ordersDeltaPct) <= 0) ||
      (num(row.salesDeltaPct) < -0.2 && num(row.costDeltaPct) > -0.05) ||
      row.tags.length >= 2
    ))
    .sort((a, b) => b.adSpend30 - a.adSpend30)
    .slice(0, 20);

  const spHighSpend = rows
    .filter(row => row.spSpend30 > 0)
    .sort((a, b) => b.spSpend30 - a.spSpend30)
    .slice(0, 15);

  const sbHighSpend = rows
    .filter(row => row.sbSpend30 > 0)
    .sort((a, b) => b.sbSpend30 - a.sbSpend30)
    .slice(0, 15);

  const watch = WATCH_SKUS.map(sku => rows.find(row => row.sku === sku)).filter(Boolean);

  return { rows, multiProblem, trafficPush, watch, adSummaryAnomalies, spHighSpend, sbHighSpend };
}

function isBlankProductCard(card) {
  return !num(card?.price) &&
    !num(card?.profitRate) &&
    !num(card?.invDays) &&
    !num(card?.unitsSold_30d) &&
    !num(card?.unitsSold_7d) &&
    !num(card?.yoyAsinPct ?? card?.yoyUnitsPct);
}

function loadJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function mergeProductCardFallbacks(cards, currentSnapshot) {
  const currentDate = getDate(currentSnapshot);
  const fallbackFiles = [
    path.join(ROOT, 'data', 'snapshots', 'latest_snapshot_with_personal_sales_reloaded.json'),
    path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
  ];
  const fallbackBySku = new Map();
  for (const file of fallbackFiles) {
    const snapshot = loadJsonIfExists(file);
    if (!snapshot || getDate(snapshot) !== currentDate) continue;
    for (const card of snapshot.productCards || []) {
      const sku = cleanSku(card.sku);
      if (!sku || isBlankProductCard(card) || fallbackBySku.has(sku)) continue;
      fallbackBySku.set(sku, card);
    }
  }
  return (cards || []).map(card => {
    const fallback = fallbackBySku.get(cleanSku(card.sku));
    return fallback && isBlankProductCard(card) ? { ...fallback, ...card, ...fallback } : card;
  });
}

function table(headers, rows) {
  return `<table class="data-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function sellerRow(row, totalSales) {
  return `<tr>
    <td>${esc(rowTitle(row))}</td>
    <td>${money(row.order_sales)}</td>
    <td>${num(row.sale_num)}</td>
    <td>${pct(row.net_profit)}</td>
    <td>${pct(row.refund_percent)}</td>
    <td>${pct(row.ACOS)}</td>
    <td>${pct(row.SP)}</td>
    <td>${pct(row.AT)}</td>
    <td>${pct(row.qty_yoy_over_1_year)}</td>
    <td>${totalSales ? pct(num(row.order_sales) / totalSales) : '-'}</td>
  </tr>`;
}

function detailRow(row) {
  const tags = anomalyTags(row);
  return `<tr>
    <td>${esc(sellerCode(row))}</td>
    <td>${esc(row.developer_num || '-')}</td>
    <td>${money(row.order_sales)}</td>
    <td>${num(row.sale_num)}</td>
    <td>${pct(row.net_profit)}</td>
    <td>${pct(row.refund_percent)}</td>
    <td>${pct(row.ACOS)}</td>
    <td>${pct(row.SP)}</td>
    <td>${pct(row.qty_yoy_over_1_year)}</td>
    <td>${esc(tags.join(' / ') || '观察')}</td>
  </tr>`;
}

function skuRow(row) {
  return `<tr>
    <td>${esc(row.sku)}</td>
    <td>${esc(row.asin)}</td>
    <td>${row.units3}</td>
    <td>${row.units7}</td>
    <td>${row.units30}</td>
    <td>${row.invDays}</td>
    <td>${pct(row.yoy)}</td>
    <td>${pct(row.profitRate)}</td>
    <td>${money(row.adSpend30)}</td>
    <td>${row.adOrders30}</td>
    <td>${row.acos30 >= 90 ? '无订单' : pct(row.acos30)}</td>
    <td>${row.campaignCount}</td>
    <td>${esc(row.tags.join(' / ') || '观察')}</td>
  </tr>`;
}

function pctOrDash(value) {
  return value == null ? '-' : pct(value);
}

function adAnomalyRow(row) {
  return `<tr>
    <td>${esc(row.sku)}</td>
    <td>${esc(row.asin)}</td>
    <td>${money(row.adSpend30)}</td>
    <td>${money(row.adSales30)}</td>
    <td>${row.adOrders30}</td>
    <td>${row.acos30 >= 90 ? '无订单' : pct(row.acos30)}</td>
    <td>${pctOrDash(row.costDeltaPct)}</td>
    <td>${pctOrDash(row.salesDeltaPct)}</td>
    <td>${pctOrDash(row.ordersDeltaPct)}</td>
    <td>${esc(row.tags.join(' / ') || '观察')}</td>
  </tr>`;
}

function spManageRow(row) {
  return `<tr>
    <td>${esc(row.sku)}</td>
    <td>${money(row.spSpend30)}</td>
    <td>${row.spOrders30}</td>
    <td>${row.spRows}</td>
    <td>${row.spActiveRows}</td>
    <td>${row.spHighAcosRows}</td>
    <td>${esc(row.tags.join(' / ') || '观察')}</td>
  </tr>`;
}

function sbManageRow(row) {
  return `<tr>
    <td>${esc(row.sku)}</td>
    <td>${money(row.sbSpend30)}</td>
    <td>${row.sbOrders30}</td>
    <td>${row.sbCampaignCount}</td>
    <td>${row.sbActiveCampaigns}</td>
    <td>${esc(row.tags.join(' / ') || '观察')}</td>
  </tr>`;
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const date = getDate(snapshot);
  const salesRows = snapshot.sellerSalesRows || [];
  const cards = mergeProductCardFallbacks(snapshot.productCards || [], snapshot);
  const core = coreRows(salesRows);
  const total = core.total || {};
  const totalSales = num(total.order_sales);
  const detailRows = salesRows
    .filter(row => hasSales(row) && !isReferenceRow(row))
    .filter(row => anomalyTags(row).length > 0)
    .sort((a, b) => anomalyScore(b) - anomalyScore(a) || num(b.order_sales) - num(a.order_sales))
    .slice(0, 25);
  const topSalesRows = salesRows
    .filter(row => hasSales(row) && !isReferenceRow(row))
    .sort((a, b) => num(b.order_sales) - num(a.order_sales))
    .slice(0, 20);
  const skuPools = buildSkuPoolsV2(cards, snapshot);

  const highestRefund = [core.hj171, core.hj17, core.hj172].filter(Boolean).sort((a, b) => num(b.refund_percent) - num(a.refund_percent))[0] || {};
  const lowestProfit = [core.hj171, core.hj17, core.hj172].filter(Boolean).sort((a, b) => num(a.net_profit) - num(b.net_profit))[0] || {};
  const highestAcos = [core.hj171, core.hj17, core.hj172].filter(Boolean).sort((a, b) => num(b.ACOS) - num(a.ACOS))[0] || {};
  const refundDelta = core.hj1 ? pp(total.refund_percent, core.hj1.refund_percent) : '';
  const groupRefundDelta = core.hjGroup ? pp(total.refund_percent, core.hjGroup.refund_percent) : '';

  const conclusion = [
    `总盘近 7 天销售额 <b>${money(total.order_sales)}</b>，销量 <b>${num(total.sale_num)}</b>，参考净利 <b>${pct(total.net_profit)}</b>。`,
    `总盘退货率 <b>${pct(total.refund_percent)}</b>${refundDelta ? `，较 HJ1 小组 <b>${refundDelta}</b>` : ''}${groupRefundDelta ? `，较 HJ 大组 <b>${groupRefundDelta}</b>` : ''}。`,
    `总盘 ACOS <b>${pct(total.ACOS)}</b>，ROAS <b>${num(total.ROAS).toFixed(2)}</b>，CPC <b>${num(total.CPC).toFixed(2)}</b>，广告效率不是单独看 ACOS，要和退货、净利一起判断。`,
    `编号层主拖累：退货最高是 <b>${esc(rowTitle(highestRefund))}</b>，净利最低是 <b>${esc(rowTitle(lowestProfit))}</b>，ACOS 最高是 <b>${esc(rowTitle(highestAcos))}</b>。`,
    `SKU 层今日识别：多问题池 <b>${skuPools.multiProblem.length}</b> 个，重点 watchlist <b>${skuPools.watch.length}</b> 个，后续动作优先从“同下滑 + 库存压力 + 有广告承接”的 SKU 里挑。`,
  ];

  const adInterfaceSections = `
  <div class="section">
    <h2>广告 SKU 汇总异常池</h2>
    <div class="note">新增 /product/adSkuSummary 真实 30 天口径：花费、销售、订单、ACOS、环比变化直接来自广告汇总接口，用来发现“花费上升订单未跟”“销售下滑花费未降”的 SKU。</div>
    ${table(['SKU', 'ASIN', '30天广告花费', '30天广告销售', '30天广告订单', '30天ACOS', '花费环比', '销售环比', '订单环比', '标签'], skuPools.adSummaryAnomalies.map(adAnomalyRow))}
  </div>

  <div class="section">
    <h2>SP 产品广告高消耗池</h2>
    <div class="note">新增 /advProduct/all 产品广告管理口径：确认 SKU 下 SP 商品广告是否实际开启、开启数量、消耗和高 ACOS 行数。</div>
    ${table(['SKU', 'SP花费', 'SP订单', 'SP行数', 'SP开启行数', '高ACOS行数', '标签'], skuPools.spHighSpend.map(spManageRow))}
  </div>

  <div class="section">
    <h2>SB 活动承接池</h2>
    <div class="note">新增 /campaignSb/findAllNew 活动管理口径：SB 没有直接 SKU 字段，当前按活动名和广告组名匹配 SKU，用于识别是否有品牌视频 / SB 承接。</div>
    ${table(['SKU', 'SB花费', 'SB订单', 'SB活动数', 'SB开启活动数', '标签'], skuPools.sbHighSpend.map(sbManageRow))}
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>黄成喆 今日数据沉淀 自动版 ${date}</title>
<style>
:root{--bg:#f6f8fb;--card:#fff;--text:#172033;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb;--good:#166534;--warn:#9a3412;--bad:#991b1b;--soft:#eff6ff}
*{box-sizing:border-box} body{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;line-height:1.58}
.wrap{max-width:1520px;margin:0 auto} h1{margin:0 0 8px;font-size:30px} h2{margin:0 0 14px;font-size:22px}.sub,.note,.footer{color:var(--muted)}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0}.card,.section{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 18px rgba(15,23,42,.04)}.card{padding:16px 18px}.section{margin-top:16px;padding:18px 20px}.kpi-title{font-size:13px;color:var(--muted);margin-bottom:6px}.kpi-value{font-size:28px;font-weight:750}.kpi-note{font-size:13px;color:var(--muted)}.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}.callout{background:var(--soft);border:1px solid #dbeafe;border-radius:14px;padding:14px 16px}.bullets{margin:0;padding-left:20px}.bullets li{margin:9px 0}.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;margin-right:8px;margin-bottom:8px;background:#eef2ff;color:#3730a3}.data-table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;margin-top:10px}.data-table th{background:#f8fafc;text-align:left;padding:10px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.data-table td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}.data-table tr:nth-child(even){background:#fcfdff}@media(max-width:1000px){.grid4,.grid3{grid-template-columns:1fr 1fr}}@media(max-width:720px){.grid4,.grid3{grid-template-columns:1fr}body{padding:14px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>今日数据沉淀：个人趋势 + SKU 异常池</h1>
  <div class="sub">沉淀日期：${esc(date)} ｜ 数据源：${esc(path.relative(ROOT, inputFile))} ｜ 个人销售接口：/pm/sale/getBySeller ｜ seller：${esc((snapshot.sellerSalesMeta?.sellers || []).join(' / '))}</div>

  <div class="grid4">
    <div class="card"><div class="kpi-title">总盘销售额</div><div class="kpi-value">${money(total.order_sales)}</div><div class="kpi-note">近 ${esc(snapshot.sellerSalesMeta?.days || 7)} 天，销量 ${num(total.sale_num)}</div></div>
    <div class="card"><div class="kpi-title">总盘参考净利</div><div class="kpi-value ${num(total.net_profit) < 0.18 ? 'bad' : 'good'}">${pct(total.net_profit)}</div><div class="kpi-note">毛利 ${pct(total.gross_profit)}，净利需结合退货看</div></div>
    <div class="card"><div class="kpi-title">总盘退货率</div><div class="kpi-value ${num(total.refund_percent) >= 0.045 ? 'bad' : 'warn'}">${pct(total.refund_percent)}</div><div class="kpi-note">较 HJ1 ${refundDelta || '-'}，较 HJ大组 ${groupRefundDelta || '-'}</div></div>
    <div class="card"><div class="kpi-title">总盘 ACOS / ROAS</div><div class="kpi-value ${num(total.ACOS) > 0.22 ? 'warn' : 'good'}">${pct(total.ACOS)}</div><div class="kpi-note">ROAS ${num(total.ROAS).toFixed(2)}，CPC ${num(total.CPC).toFixed(2)}</div></div>
  </div>

  <div class="section">
    <h2>先说结论</h2>
    <div class="callout"><ul class="bullets">${conclusion.map(item => `<li>${item}</li>`).join('')}</ul></div>
  </div>

  <div class="section">
    <h2>一、编号层拆分</h2>
    <div><span class="badge">看谁拖总盘</span><span class="badge">退货 / 净利 / ACOS 同看</span><span class="badge">先定异常方向再下钻 SKU</span></div>
    ${table(['编号', '销售额', '销量', '参考净利', '退货率', 'ACOS', '广告占比SP', 'AT', '1年以上销量同比', '销售额占比'], [core.hj171, core.hj17, core.hj172].filter(Boolean).map(row => sellerRow(row, totalSales)))}
  </div>

  <div class="section">
    <h2>二、明细异常池</h2>
    <div class="note">这里按销售额、退货率、净利、ACOS、广告占比、同比下滑打标签，用来每天一来先找异常编号/开发线。当前接口明细没有 SKU 字段，所以这一步负责定位异常来源，SKU 层还要结合广告和 inventory 快照。</div>
    ${table(['编号', '开发/明细', '销售额', '销量', '参考净利', '退货率', 'ACOS', 'SP', '1年以上销量同比', '标签'], detailRows.map(detailRow))}
  </div>

  <div class="section">
    <h2>三、销售额 Top 明细</h2>
    ${table(['编号', '开发/明细', '销售额', '销量', '参考净利', '退货率', 'ACOS', 'SP', '1年以上销量同比', '标签'], topSalesRows.map(detailRow))}
  </div>

  <div class="section">
    <h2>四、SKU 止血池</h2>
    <div class="note">SKU 口径来自 panel snapshot 的广告 + inventory 产品画像；标签用于找今天要复看的 SKU，不作为财务结算口径。</div>
    ${table(['SKU', 'ASIN', '3天', '7天', '30天', '库存天数', '同', '利润率', '30天广告花费', '30天广告订单', '30天ACOS', '广告活动数', '标签'], skuPools.multiProblem.map(skuRow))}
  </div>

  <div class="section">
    <h2>五、重点变体每日监看</h2>
    ${table(['SKU', 'ASIN', '3天', '7天', '30天', '库存天数', '同', '利润率', '30天广告花费', '30天广告订单', '30天ACOS', '广告活动数', '标签'], skuPools.watch.map(skuRow))}
  </div>

  <div class="section">
    <h2>六、可加投观察池</h2>
    <div class="note">这里不是直接自动加价，而是找“有销量、有库存承接、有广告订单”的候选。最终动作仍要结合利润、退货、同比和当前广告状态。</div>
    ${table(['SKU', 'ASIN', '3天', '7天', '30天', '库存天数', '同', '利润率', '30天广告花费', '30天广告订单', '30天ACOS', '广告活动数', '标签'], skuPools.trafficPush.map(skuRow))}
  </div>

  <div class="section">
    <h2>七、今天沉淀下来的判断框架</h2>
    <div class="callout"><ul class="bullets">
      <li>先看总盘：净利、退货、ACOS、广告占比、同比，判断今天主矛盾。</li>
      <li>再看编号层：确认是 HJ171 这种大体量拖累，还是 HJ172 这种小体量异常。</li>
      <li>再看明细异常池：按退货、净利、ACOS、SP、同比下滑确定复看优先级。</li>
      <li>最后落到 SKU：用同、库存天数、广告花费/订单、利润率拆成止血、观察、可推三类。</li>
      <li>重点 watchlist 必须每天保留，尤其 DN3049、DN1655 这类“同”已确认下滑口径的 SKU。</li>
    </ul></div>
  </div>

  <div class="footer">说明：本报告由 Codex 工作流生成，适合运营判断和历史沉淀；个人销售接口明细当前无 SKU 字段，SKU 行动池来自广告/inventory 快照联动。</div>
  ${adInterfaceSections}
</div>
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `黄成喆_今日数据沉淀_自动版_${date}.html`);
  fs.writeFileSync(outFile, `\uFEFF${html}`, 'utf8');
  console.log(outFile);
}

main();
