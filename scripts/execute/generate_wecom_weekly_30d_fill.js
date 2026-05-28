const fs = require('fs');
const path = require('path');

const { archiveDateDir, parseCsv } = require('./quick_daily_core_summary');

const ROOT = path.resolve(__dirname, '..', '..');

const COPY_COLUMNS = [
  { key: 'date', label: '日期' },
  { key: 'name', label: '姓名' },
  { key: 'totalUnits', label: '销售数量' },
  { key: 'totalSales', label: '销售额' },
  { key: 'totalGrossProfitRate', label: '毛利率' },
  { key: 'totalNetProfitRate', label: '参考净利' },
  { key: 'totalRefundRate', label: '退款率' },
  { key: 'totalAdSpend', label: '广告花费' },
  { key: 'totalAdCostShare', label: '所有产品-广告占比' },
  { key: 'totalSp', label: '所有产品-SP' },
  { key: 'totalAt', label: '所有产品-AT' },
  { key: 'totalAcos', label: '所有产品-ACOS' },
  { key: 'totalCpc', label: '所有产品-CPC' },
  { key: 'totalCps', label: '所有产品-CPS' },
  { key: 'totalRoas', label: '所有产品-ROAS' },
  { key: 'new0To3Sales', label: '开售0-3个月-销售额' },
  { key: 'new0To3GrossProfitRate', label: '开售0-3个月-毛利率' },
  { key: 'new0To3NetProfitRate', label: '开售0-3个月-参考净利' },
  { key: 'new0To3AdCostShare', label: '开售0-3个月-广告占比' },
  { key: 'new0To3Sp', label: '开售0-3个月-SP' },
  { key: 'new0To3Acos', label: '开售0-3个月-ACOS' },
  { key: 'new0To5GrossProfitRate', label: '开售0-5个月-毛利率' },
  { key: 'new0To5NetProfitRate', label: '开售0-5个月-参考净利' },
  { key: 'new0To5AdCostShare', label: '开售0-5个月-广告占比' },
  { key: 'new0To5Sp', label: '开售0-5个月-SP' },
  { key: 'new0To5Acos', label: '开售0-5个月-ACOS' },
  { key: 'new0To5At', label: '开售0-5个月-AT' },
  { key: 'new0To5Cpc', label: '开售0-5个月-CPC' },
  { key: 'new0To5Cps', label: '开售0-5个月-CPS' },
  { key: 'new0To5Sales', label: '开售0-5个月-销售额' },
  { key: 'over3Sales', label: '开售3个月以上-销售额' },
  { key: 'over3GrossProfitRate', label: '开售3个月以上-毛利率' },
  { key: 'over3NetProfitRate', label: '开售3个月以上-参考净利' },
  { key: 'over3AdCostShare', label: '开售3个月以上-广告占比' },
  { key: 'over3Sp', label: '开售3个月以上-SP' },
  { key: 'over3Acos', label: '开售3个月以上-ACOS' },
  { key: 'under1YearNetProfitRate', label: '开售一年以内-参考净利' },
  { key: 'under1YearAdCostShare', label: '开售一年以内-广告占比' },
  { key: 'under1YearSp', label: '开售一年以内-SP' },
  { key: 'under1YearAcos', label: '开售一年以内-ACOS' },
  { key: 'under1YearAt', label: '开售一年以内-AT' },
  { key: 'under1YearCpc', label: '开售一年以内-CPC' },
  { key: 'under1YearCps', label: '开售一年以内-CPS' },
  { key: 'under1YearSales', label: '开售一年以内-销售额' },
  { key: 'oldOver1YearSales', label: '开售一年以上老品-销售额' },
  { key: 'oldOver1YearGrossProfitRate', label: '开售一年以上老品-毛利率' },
  { key: 'oldOver1YearNetProfitRate', label: '开售一年以上老品-参考净利' },
  { key: 'oldOver1YearYoyGrowth', label: '老品同比增长' },
  { key: 'oldOver1YearAdCostShare', label: '开售一年以上老品-广告占比' },
  { key: 'oldOver1YearSp', label: '开售一年以上老品-SP' },
  { key: 'oldOver1YearAcos', label: '开售一年以上老品-ACOS' },
  { key: 'oldOver1YearAt', label: '开售一年以上老品-AT' },
  { key: 'oldOver1YearCpc', label: '开售一年以上老品-CPC' },
  { key: 'oldOver1YearCps', label: '开售一年以上老品-CPS' },
  { key: 'successRate30To60', label: '30-60天-成功率' },
];

const ROW_PRESETS = {
  selected: { label: '黄成喆', selector: 'selected' },
  'hj-group': { label: 'HJ组均值', selector: 'hjGroup' },
  'hj1-group': { label: 'HJ1小组均值', selector: 'hj1Group' },
};

function text(value) {
  return String(value ?? '').trim();
}

function chinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  const positionalDate = argv.find(item => /^\d{4}-\d{2}-\d{2}$/.test(item));
  return {
    date: text(options.date || positionalDate || chinaDate()).slice(0, 10),
    rawDir: text(options['raw-dir'] || options.rawDir),
    salesCoreFile: text(options['sales-core-file'] || options.salesCoreFile),
    successRateFile: text(options['success-rate-file'] || options.successRateFile),
    rows: text(options.rows || options.row || 'selected'),
    person: text(options.person || options.name || ''),
    dateFormat: text(options['date-format'] || options.dateFormat || 'zh'),
    valuesOnly: !!(options['values-only'] || options.valuesOnly),
    withHeader: !!(options.header || options.headers || options['with-header']),
    json: !!options.json,
  };
}

function assertDate(value, label = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) throw new Error(`${label} must be YYYY-MM-DD: ${value}`);
}

function findTrendRoot() {
  const direct = path.join(ROOT, '黄成喆个人数据趋势');
  if (fs.existsSync(direct)) return direct;
  const hit = fs.readdirSync(ROOT, { withFileTypes: true })
    .find(entry => entry.isDirectory() && /个人数据趋势|data trend|personal|trend/i.test(entry.name));
  return hit ? path.join(ROOT, hit.name) : '';
}

function defaultRawDir(date) {
  const trendRoot = findTrendRoot();
  const direct = trendRoot ? path.join(trendRoot, '原数据', '原日数据', archiveDateDir(date)) : '';
  if (direct && fs.existsSync(direct)) return direct;
  return '';
}

function listFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).isFile());
}

function findSalesCoreFile(date, rawDir) {
  const files = listFiles(rawDir);
  const exactJson = files
    .filter(file => new RegExp(`^seller_sales_core_30d_${date}\\.json$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (exactJson) return exactJson;
  const exactCsv = files
    .filter(file => new RegExp(`^seller_sales_core_30d_${date}\\.csv$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (exactCsv) return exactCsv;
  const fallbackJson = files
    .filter(file => new RegExp(`^seller_sales_core_\\d+d_${date}\\.json$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (fallbackJson) return fallbackJson;
  return files
    .filter(file => new RegExp(`^seller_sales_core_\\d+d_${date}\\.csv$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function findSuccessRateFile(date, rawDir) {
  const rawHit = listFiles(rawDir).find(file => path.basename(file) === `seller_success_rate_HJ17_${date}.json`);
  if (rawHit) return rawHit;
  const snapshotHit = path.join(ROOT, 'data', 'snapshots', `seller_success_rate_HJ17_${date}.json`);
  return fs.existsSync(snapshotHit) ? snapshotHit : '';
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function loadSalesCore(file) {
  if (!file || !fs.existsSync(file)) return { payload: null, rows: [] };
  if (/\.json$/i.test(file)) {
    const payload = readJson(file, {});
    return {
      payload,
      rows: Array.isArray(payload) ? payload : (payload.rows || payload.data || payload.list || []),
    };
  }
  return { payload: null, rows: parseCsv(fs.readFileSync(file, 'utf8')) };
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function formatPct(value) {
  const n = num(value);
  return n === null ? '' : `${(n * 100).toFixed(2)}%`;
}

function formatMoney(value) {
  const n = num(value);
  return n === null
    ? ''
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInt(value) {
  const n = num(value);
  return n === null ? '' : Math.round(n).toLocaleString('en-US');
}

function formatMetric(value, digits = 2) {
  const n = num(value);
  if (n === null) return '';
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

function formatDate(date, format = 'zh') {
  if (format === 'iso') return date;
  const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  return month && day ? `${Number(month)}月${Number(day)}日` : date;
}

function rowTitle(row = {}) {
  return text(row.seller_title || row.title || row.sellerTitle);
}

function selectRow(rows = [], selector = 'selected') {
  if (selector === 'selected') {
    return rows.find(row => /所选|汇总|total/i.test(rowTitle(row))) || rows[2] || {};
  }
  if (selector === 'hjGroup') return rows.find(row => rowTitle(row) === 'HJ大组') || rows[0] || {};
  if (selector === 'hj1Group') return rows.find(row => rowTitle(row) === 'HJ1小组') || rows[1] || {};
  return {};
}

function successPercent(successRate = null) {
  if (!successRate) return '';
  if (successRate.successRatePercent) return successRate.successRatePercent;
  return formatPct(successRate.successRate);
}

function normalizeRowsOption(rowsText) {
  return text(rowsText)
    .split(/[,\s]+/)
    .map(item => text(item))
    .filter(Boolean)
    .map(item => ROW_PRESETS[item] ? item : 'selected');
}

function buildValues(row = {}, context = {}) {
  return {
    date: formatDate(context.date, context.dateFormat || 'zh'),
    name: context.name,
    totalUnits: formatInt(row.sale_num),
    totalSales: formatMoney(row.order_sales),
    totalGrossProfitRate: formatPct(row.gross_profit),
    totalNetProfitRate: formatPct(row.net_profit),
    totalRefundRate: formatPct(row.refund_percent),
    totalAdSpend: formatMoney(row.adv_spend),
    totalAdCostShare: formatPct(row.advCost),
    totalSp: formatMetric(row.SP),
    totalAt: formatMetric(row.AT),
    totalAcos: formatPct(row.ACOS),
    totalCpc: formatMetric(row.CPC),
    totalCps: formatMetric(row.CPS),
    totalRoas: formatMetric(row.ROAS),
    new0To3Sales: formatMoney(row.order_sales_in_3_month),
    new0To3GrossProfitRate: formatPct(row.gross_profit_in_3_month),
    new0To3NetProfitRate: formatPct(row.net_profit_in_3_month),
    new0To3AdCostShare: formatPct(row.advCost_in_3_month),
    new0To3Sp: formatMetric(row.sp_in_3_month),
    new0To3Acos: formatPct(row.acos_in_3_month),
    new0To5GrossProfitRate: formatPct(row.gross_profit_in_5_month),
    new0To5NetProfitRate: formatPct(row.net_profit_in_5_month),
    new0To5AdCostShare: formatPct(row.advCost_in_5_month),
    new0To5Sp: formatMetric(row.sp_in_5_month),
    new0To5Acos: formatPct(row.acos_in_5_month),
    new0To5At: formatMetric(row.at_in_5_month),
    new0To5Cpc: formatMetric(row.cpc_in_5_month),
    new0To5Cps: formatMetric(row.cps_in_5_month),
    new0To5Sales: formatMoney(row.order_sales_in_5_month),
    over3Sales: formatMoney(row.order_sales_over_3_month),
    over3GrossProfitRate: formatPct(row.gross_profit_over_3_month),
    over3NetProfitRate: formatPct(row.net_profit_over_3_month),
    over3AdCostShare: formatPct(row.advCost_over_3_month),
    over3Sp: formatMetric(row.sp_over_3_month),
    over3Acos: formatPct(row.acos_over_3_month),
    under1YearNetProfitRate: formatPct(row.net_profit_in_1_year),
    under1YearAdCostShare: formatPct(row.advCost_in_1_year),
    under1YearSp: formatMetric(row.sp_in_1_year),
    under1YearAcos: formatPct(row.acos_in_1_year),
    under1YearAt: formatMetric(row.at_in_1_year),
    under1YearCpc: formatMetric(row.cpc_in_1_year),
    under1YearCps: formatMetric(row.cps_in_1_year),
    under1YearSales: formatMoney(row.order_sales_in_1_year),
    oldOver1YearSales: formatMoney(row.order_sales_over_1_year),
    oldOver1YearGrossProfitRate: formatPct(row.gross_profit_over_1_year),
    oldOver1YearNetProfitRate: formatPct(row.net_profit_over_1_year),
    oldOver1YearYoyGrowth: formatPct(row.qty_yoy_over_1_year),
    oldOver1YearAdCostShare: formatPct(row.advCost_over_1_year),
    oldOver1YearSp: formatMetric(row.sp_over_1_year),
    oldOver1YearAcos: formatPct(row.acos_over_1_year),
    oldOver1YearAt: formatMetric(row.at_over_1_year),
    oldOver1YearCpc: formatMetric(row.cpc_over_1_year),
    oldOver1YearCps: formatMetric(row.cps_over_1_year),
    successRate30To60: successPercent(context.successRate),
  };
}

function exportedDate(payload = {}) {
  const raw = text(payload.exportedAt || payload.generatedAt);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

function buildWecomWeekly30dFill(options = {}) {
  const date = options.date || chinaDate();
  assertDate(date);
  const rawDir = options.rawDir || defaultRawDir(date);
  const salesCoreFile = options.salesCoreFile || findSalesCoreFile(date, rawDir);
  const { payload, rows } = loadSalesCore(salesCoreFile);
  const successRateFile = options.successRateFile || findSuccessRateFile(date, rawDir);
  const successRate = readJson(successRateFile, null);
  const rowKeys = normalizeRowsOption(options.rows || 'selected');
  const outputRows = rowKeys.map(key => {
    const preset = ROW_PRESETS[key] || ROW_PRESETS.selected;
    const name = key === 'selected' && options.person ? options.person : preset.label;
    const sourceRow = selectRow(rows, preset.selector);
    return {
      date,
      key,
      sourceTitle: rowTitle(sourceRow),
      values: buildValues(sourceRow, {
        date,
        dateFormat: options.dateFormat || 'zh',
        name,
        successRate: key === 'selected' ? successRate : null,
      }),
    };
  });
  const missing = [];
  if (!salesCoreFile || !rows.length) missing.push('seller_sales_core_30d');
  if (!successRateFile) missing.push('seller_success_rate_HJ17');
  const warnings = [];
  const pulledDate = exportedDate(payload || {});
  if (pulledDate && pulledDate !== date) {
    warnings.push(`sales core file is named ${date} but exported at ${pulledDate}; treat it as a rolling current 30-day pull, not a historical ${date} snapshot`);
  }
  return {
    date,
    rows: outputRows,
    tsv: rowsToTsv(outputRows, options),
    columns: columnsFor(options).map(column => column.label),
    files: { rawDir, salesCore: salesCoreFile || '', sellerSuccessRate: successRateFile || '' },
    missing,
    warnings,
  };
}

function columnsFor(options = {}) {
  if (!options.valuesOnly) return COPY_COLUMNS;
  return COPY_COLUMNS.filter(column => column.key !== 'date' && column.key !== 'name');
}

function rowsToTsv(rows, options = {}) {
  const columns = columnsFor(options);
  const lines = [];
  if (options.withHeader) lines.push(columns.map(column => column.label).join('\t'));
  for (const row of rows) {
    lines.push(columns.map(column => row.values[column.key] ?? '').join('\t'));
  }
  return lines.join('\n');
}

function main() {
  const options = parseArgs();
  const result = buildWecomWeekly30dFill(options);
  console.log(options.json ? JSON.stringify(result, null, 2) : result.tsv);
  if (result.missing.includes('seller_sales_core_30d')) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  COPY_COLUMNS,
  buildWecomWeekly30dFill,
  buildValues,
  columnsFor,
  formatDate,
  rowsToTsv,
};
