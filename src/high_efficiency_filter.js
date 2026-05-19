const DEFAULT_SELLERS = ['HJ17', 'HJ171', 'HJ172'];

const PROPERTY_CONFIGS = {
  1: { label: 'spKeyword', property: '1', state: '4', tableName: '' },
  2: { label: 'spAutoTarget', property: '2', state: '4', tableName: 'product_target' },
  3: { label: 'spManualTarget', property: '3', state: '4', tableName: 'product_manual_target' },
  4: { label: 'sbKeyword', property: '4', state: '1', tableName: '' },
  6: { label: 'sbTarget', property: '6', state: '1', tableName: '' },
};

function text(value) {
  return String(value || '').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ymdToLocalMs(ymd) {
  return new Date(`${ymd}T00:00:00`).getTime();
}

function resolveDateRange(startYmd, endYmd) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text(startYmd)) && /^\d{4}-\d{2}-\d{2}$/.test(text(endYmd))) {
    return [startYmd, endYmd];
  }
  const days = Math.max(1, Number(startYmd || 7));
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const fmt = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return [fmt(start), fmt(end)];
}

function buildHighEfficiencyPayload(options = {}) {
  const prop = text(options.property || '1');
  const config = PROPERTY_CONFIGS[prop] || { label: `property${prop}`, property: prop, state: '4', tableName: '' };
  const [start, end] = resolveDateRange(options.startYmd || options.days || '7', options.endYmd || '');
  const payload = {
    siteId: Number(options.siteId || 4),
    timeRange: [ymdToLocalMs(start), ymdToLocalMs(end) + 86400000],
    state: config.state,
    coreMark: '0',
    userName: Array.isArray(options.userName) && options.userName.length ? options.userName : DEFAULT_SELLERS,
    level: options.level || 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    isHigh: '1',
    page: Number(options.page || 1),
    limit: Number(options.limit || 500),
    property: config.property,
    filterArray: { campaignState: '1' },
  };
  if (config.tableName) payload.tableName = config.tableName;
  if (options.field) payload.field = options.field;
  if (options.order) payload.order = options.order;
  return payload;
}

function resolveSku(row = {}) {
  const direct = text(row.sku || row.SKU || row.productSku || row.adSku);
  if (direct) return direct.toUpperCase();
  const source = [
    row.campaignName,
    row.groupName,
    row.adGroupName,
    row.keywordText,
    row.targetText,
  ].map(text).join(' ');
  const match = source.match(/[A-Z]{2,5}\d{3,5}/i);
  return match ? match[0].toUpperCase() : '';
}

function rowTerm(row = {}) {
  return text(row.keywordText || row.keyword || row.targetText || row.targetingExpression || row.asin || row.ASIN || row.name);
}

function rowMetrics(row = {}) {
  return {
    spend: num(row.spend ?? row.Spend ?? row.cost ?? row.Cost),
    orders: num(row.orders ?? row.Orders ?? row.order ?? row.Order),
    sales: num(row.sales ?? row.Sales ?? row.orderSales ?? row.OrderSales),
    impressions: num(row.impressions ?? row.Impressions ?? row.impression ?? row.Impression),
    clicks: num(row.clicks ?? row.Clicks ?? row.click ?? row.Click),
  };
}

function summarizeHighEfficiencyRows(rows = []) {
  const bySku = {};
  for (const row of rows || []) {
    const sku = resolveSku(row);
    if (!sku) continue;
    if (!bySku[sku]) {
      bySku[sku] = { sku, rows: 0, spend: 0, orders: 0, sales: 0, impressions: 0, clicks: 0, terms: [] };
    }
    const bucket = bySku[sku];
    const metric = rowMetrics(row);
    bucket.rows += 1;
    bucket.spend += metric.spend;
    bucket.orders += metric.orders;
    bucket.sales += metric.sales;
    bucket.impressions += metric.impressions;
    bucket.clicks += metric.clicks;
    const term = rowTerm(row);
    if (term) bucket.terms.push({ term, orders: metric.orders, spend: metric.spend, sales: metric.sales });
  }
  for (const bucket of Object.values(bySku)) {
    bucket.spend = Number(bucket.spend.toFixed(2));
    bucket.sales = Number(bucket.sales.toFixed(2));
    bucket.acos = bucket.sales > 0 ? Number((bucket.spend / bucket.sales).toFixed(4)) : null;
    bucket.bestTerms = bucket.terms
      .slice()
      .sort((a, b) => b.orders - a.orders || b.sales - a.sales || b.spend - a.spend)
      .map(item => item.term)
      .filter((term, index, list) => list.indexOf(term) === index)
      .slice(0, 8);
    delete bucket.terms;
  }
  const skus = Object.values(bySku).sort((a, b) => b.orders - a.orders || b.sales - a.sales || b.spend - a.spend);
  return {
    totalRows: Array.isArray(rows) ? rows.length : 0,
    skuCount: skus.length,
    skus: skus.map(item => item.sku),
    bySku,
  };
}

module.exports = {
  DEFAULT_SELLERS,
  PROPERTY_CONFIGS,
  buildHighEfficiencyPayload,
  resolveSku,
  resolveDateRange,
  rowMetrics,
  rowTerm,
  summarizeHighEfficiencyRows,
};
