const { buildSummary } = require('./quick_daily_core_summary');

const COPY_COLUMNS = [
  { key: 'date', label: '日期' },
  { key: 'totalGrossProfitRate', label: '所有产品-毛利率' },
  { key: 'totalNetProfitRate', label: '所有产品-参考净利' },
  { key: 'totalAdCostShare', label: '所有产品-广告占比' },
  { key: 'totalAt', label: '所有产品-AT' },
  { key: 'totalAcos', label: '所有产品-ACOS' },
  { key: 'new0To5GrossProfitRate', label: '0-5个月-毛利润率' },
  { key: 'new0To5NetProfitRate', label: '0-5个月-参考净利' },
  { key: 'new0To5AdCostShare', label: '0-5个月-广告占比' },
  { key: 'new0To5Acos', label: '0-5个月-ACOS' },
  { key: 'oldProductYoyDown', label: '老品下滑' },
  { key: 'sellerSuccessRate', label: '成功率' },
];

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
    from: text(options.from).slice(0, 10),
    to: text(options.to).slice(0, 10),
    rawDir: text(options['raw-dir'] || options.rawDir),
    salesCoreFile: text(options['sales-core-file'] || options.salesCoreFile),
    successRateFile: text(options['success-rate-file'] || options.successRateFile),
    dateFormat: text(options['date-format'] || options.dateFormat || 'zh'),
    valuesOnly: !!(options['values-only'] || options.valuesOnly),
    withHeader: !!(options.header || options.headers || options['with-header']),
    json: !!options.json,
  };
}

function assertDate(value, label = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) throw new Error(`${label} must be YYYY-MM-DD: ${value}`);
}

function addDays(date, days) {
  assertDate(date);
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year, month - 1, day);
  local.setDate(local.getDate() + days);
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, '0'),
    String(local.getDate()).padStart(2, '0'),
  ].join('-');
}

function listDates(options = {}) {
  if (options.from || options.to) {
    const from = options.from || options.to;
    const to = options.to || options.from;
    assertDate(from, 'from');
    assertDate(to, 'to');
    if (from > to) throw new Error(`from must be on or before to: ${from} > ${to}`);
    const dates = [];
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);
    return dates;
  }
  assertDate(options.date);
  return [options.date];
}

function formatDate(date, format = 'zh') {
  if (format === 'iso') return date;
  const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  return month && day ? `${Number(month)}月${Number(day)}日` : date;
}

function formatPct(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : '';
}

function successPercent(successRate = {}) {
  if (successRate.percent) return successRate.percent;
  return formatPct(successRate.rate);
}

function buildWecomFillRow(options = {}) {
  const date = options.date || chinaDate();
  const summary = buildSummary({
    date,
    rawDir: options.rawDir,
    salesCoreFile: options.salesCoreFile,
    successRateFile: options.successRateFile,
    startedAt: options.startedAt || Date.now(),
  });
  const total = summary.totalAccount || {};
  const newProducts = summary.newProduct0To5Month || {};
  const values = {
    date: formatDate(date, options.dateFormat || 'zh'),
    totalGrossProfitRate: formatPct(total.grossProfitRate),
    totalNetProfitRate: formatPct(total.netProfitRate),
    totalAdCostShare: formatPct(total.adCostShare),
    totalAt: formatPct(total.at),
    totalAcos: formatPct(total.acos),
    new0To5GrossProfitRate: formatPct(newProducts.grossProfitRate),
    new0To5NetProfitRate: formatPct(newProducts.netProfitRate),
    new0To5AdCostShare: formatPct(newProducts.adCostShare),
    new0To5Acos: formatPct(newProducts.acos),
    oldProductYoyDown: formatPct(total.unitYoyOver1Year),
    sellerSuccessRate: successPercent(summary.sellerSuccessRate || {}),
  };
  const missing = [...(summary.missing || [])];
  return {
    date,
    values,
    missing,
    files: {
      ...summary.files,
      oldProductYoyDownSource: summary.files?.salesCore || '',
    },
    source: {
      oldProductYoyDown: total.unitYoyOver1Year === null || total.unitYoyOver1Year === undefined
        ? null
        : 'sales_core.total.qty_yoy_over_1_year',
    },
  };
}

function columnsFor(options = {}) {
  return options.valuesOnly ? COPY_COLUMNS.filter(column => column.key !== 'date') : COPY_COLUMNS;
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

function buildWecomFill(options = {}) {
  const rows = listDates(options).map(date => buildWecomFillRow({ ...options, date }));
  return {
    rows,
    tsv: rowsToTsv(rows, options),
    columns: columnsFor(options).map(column => column.label),
    missing: Object.fromEntries(rows.map(row => [row.date, row.missing])),
  };
}

function main() {
  const options = parseArgs();
  const result = buildWecomFill(options);
  console.log(options.json ? JSON.stringify(result, null, 2) : result.tsv);
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
  buildWecomFill,
  buildWecomFillRow,
  formatDate,
  rowsToTsv,
};
