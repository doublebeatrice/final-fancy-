const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./quick_daily_core_summary');

const ROOT = path.join(__dirname, '..', '..');
const DATE = process.argv[4] || '2026-06-09';
const csvFile = process.argv[2] || path.join(ROOT, '黄成喆个人数据趋势', '原数据', '原日数据', '6-9', 'inv_auto_filtered_2026-06-09-09-19-11.csv');
const outputFile = process.argv[3] || path.join(ROOT, 'data', 'snapshots', `inventory_execution_snapshot_${DATE}.json`);

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value ?? '').trim();
}

function sellableDays(row, days) {
  const explicit = num(row[`can_sales_${days}_third`], NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const dynamic = num(row[`dynamic_saleday${days}`], NaN);
  if (Number.isFinite(dynamic) && dynamic > 0) return dynamic;
  const units = num(row[`qty_${days}`]);
  const fulRes = num(row.fulFillable) + num(row.reserved);
  if (units > 0) return Number((fulRes / (units / days)).toFixed(1));
  if (fulRes + num(row.inbound) + num(row.inventory_amount) > 0) return 999;
  return 0;
}

function stockPlan(row) {
  return num(row.fbaPlan) + num(row.fba_plan_total) + num(row.purchasePlan);
}

function projectCard(row) {
  const sku = text(row.sku || row.product_sku).toUpperCase();
  const stockFul = num(row.fulFillable);
  const stockRes = num(row.reserved);
  const stockInb = num(row.inbound);
  const plan = stockPlan(row);
  const card = {
    sku,
    asin: text(row.asin),
    aid: text(row.aid || row.id),
    rawSku: text(row.raw_sku),
    salesChannel: text(row.salesChannel),
    siteId: text(row.salesChannel) === 'Amazon.com' ? 4 : '',
    saleStatus: text(row.sale_status),
    sale_status: text(row.sale_status),
    opendate: text(row.opendate),
    fuldate: text(row.fuldate || row.origin_fuldate).slice(0, 10),
    price: num(row.lowestprice),
    lowestprice: text(row.lowestprice),
    profitRate: num(row.profitRate),
    seaProfitRate: num(row.seaProfitRate),
    netProfit: num(row.net_profit || row.reference_net_profit),
    busyNetProfit: num(row.busy_net_profit || row.reference_net_profit_busy_val),
    referenceNetProfit: num(row.reference_net_profit),
    invDays: sellableDays(row, 30),
    sellableDays_3d: sellableDays(row, 3),
    sellableDays_7d: sellableDays(row, 7),
    sellableDays_30d: sellableDays(row, 30),
    sellableDaysFulRes_7d: sellableDays(row, 7),
    unitsSold_3d: num(row.qty_3),
    unitsSold_7d: num(row.qty_7),
    unitsSold_30d: num(row.qty_30),
    fulFillable: stockFul,
    reserved: stockRes,
    stockFul,
    stockRes,
    stockInb,
    stockInbAir: 0,
    stockPlan: plan,
    inbound: stockInb,
    fbaPlan: num(row.fbaPlan),
    fbaPlanTotal: num(row.fba_plan_total),
    purchasePlan: num(row.purchasePlan),
    localInventory: {
      goodStock: num(row.inventory_amount),
      availableForPlan: num(row.available_inventory),
      orderAmount: num(row.order_amount),
      todayMadePlan: num(row.today_made_plan),
    },
    localGoodStock: num(row.inventory_amount),
    localAvailableForPlan: num(row.available_inventory),
    localOrderAmount: num(row.order_amount),
    sellerNum: text(row.seller_num),
    advState: text(row.advState),
    advMsg: text(row.advMsg),
    isPriceApply: text(row.is_price_apply),
    priceApplyTime: text(row.price_apply_time),
    todayPriceApply: text(row.today_price_apply),
    productLabels: {
      is_high_return_rate: num(row.is_high_return_rate),
      is_variation: num(row.is_variation),
      is_comb_variant: num(row.is_comb_variant),
      is_illegal_variant: num(row.is_illegal_variant),
      parent_asin: text(row.parent_asin),
      product_type: text(row.product_type),
      holiday_info: text(row.holiday_info),
      is_fba_no_sale: num(row.is_fba_no_sale),
      is_inbound_no_sale: num(row.is_inbound_no_sale),
      is_old_product_analysis: num(row.is_old_product_analysis),
    },
    campaigns: [],
    adStats: {
      '3d': { spend: num(row.cost_3), orders: num(row.adv_qty_3), clicks: 0, impressions: 0, acos: 0 },
      '7d': { spend: num(row.cost_7), orders: num(row.adv_qty_7), clicks: 0, impressions: 0, acos: 0 },
      '30d': { spend: num(row.cost_30), orders: num(row.adv_qty_30), clicks: num(row.clicks_30), impressions: num(row.impressions_30), acos: num(row.acos_30) },
    },
  };
  return card;
}

function main() {
  const rows = parseCsv(fs.readFileSync(csvFile, 'utf8')).filter(row => text(row.sku));
  const productCards = rows.map(projectCard).filter(card => card.sku);
  const inventoryScopeRows = productCards.map(card => ({
    sku: card.sku,
    asin: card.asin,
    aid: card.aid,
    salesChannel: card.salesChannel,
    saleStatus: card.saleStatus,
    fuldate: card.fuldate,
    opendate: card.opendate,
  }));
  const invMap = {};
  for (const card of productCards) {
    const key = `${card.salesChannel || 'unknown'}::${card.sku}`;
    if (!invMap[key]) invMap[key] = card;
  }
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: 'current_inventory_csv_projection',
    date: DATE,
    csvFile: path.resolve(csvFile),
    rowCount: productCards.length,
    productCards,
    inventoryScopeRows,
    invMap,
    kwRows: [],
    autoRows: [],
    targetRows: [],
    productAdRows: [],
    sbRows: [],
    sbCampaignRows: [],
    overBudgetRows: [],
  }, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile: path.resolve(outputFile),
    csvFile: path.resolve(csvFile),
    rowCount: productCards.length,
    amazonComNormalSale: productCards.filter(card => card.salesChannel === 'Amazon.com' && card.saleStatus === '正常销售').length,
  }, null, 2));
}

if (require.main === module) main();
