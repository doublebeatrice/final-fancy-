const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

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

function archiveDateDir(date) {
  const [, month, day] = text(date).match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  if (!month || !day) throw new Error(`date must be YYYY-MM-DD: ${date}`);
  return `${Number(month)}-${Number(day)}`;
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
    rawDir: text(options['raw-dir'] || options.rawDir || ''),
    salesCoreFile: text(options['sales-core-file'] || options.salesCoreFile || ''),
    successRateFile: text(options['success-rate-file'] || options.successRateFile || ''),
    json: !!options.json,
  };
}

function findTrendRoot() {
  const direct = path.join(ROOT, '黄成喆个人数据趋势');
  if (fs.existsSync(direct)) return direct;
  const hit = fs.readdirSync(ROOT, { withFileTypes: true })
    .find(entry => entry.isDirectory() && /个人数据趋势|data trend|personal|trend/i.test(entry.name));
  return hit ? path.join(ROOT, hit.name) : '';
}

function findRawRoot(trendRoot) {
  const direct = path.join(trendRoot, '原数据', '原日数据');
  if (fs.existsSync(direct)) return direct;
  const stack = [trendRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (!entry.isDirectory()) continue;
      if (/原日数据|raw daily|raw/i.test(full)) return full;
      stack.push(full);
    }
  }
  return '';
}

function defaultRawDir(date) {
  const trendRoot = findTrendRoot();
  const rawRoot = trendRoot ? findRawRoot(trendRoot) : '';
  return rawRoot ? path.join(rawRoot, archiveDateDir(date)) : '';
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function parseCsv(textValue) {
  const input = String(textValue || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter(values => values.some(value => text(value)))
    .map(values => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])));
}

function listFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).isFile());
}

function findSalesCoreFile(date, rawDir) {
  const files = listFiles(rawDir);
  const preferredJson = files
    .filter(file => new RegExp(`^seller_sales_core_7d_${date}\\.json$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (preferredJson) return preferredJson;
  const preferredCsv = files
    .filter(file => new RegExp(`^seller_sales_core_7d_${date}\\.csv$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (preferredCsv) return preferredCsv;
  const json = files
    .filter(file => new RegExp(`^seller_sales_core_\\d+d_${date}\\.json$`, 'i').test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (json) return json;
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

function loadSalesRows(file) {
  if (!file || !fs.existsSync(file)) return [];
  if (/\.json$/i.test(file)) {
    const payload = readJson(file, {});
    return Array.isArray(payload) ? payload : (payload.rows || payload.data || payload.list || []);
  }
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function rowTitle(row = {}) {
  return text(row.seller_title || row.title || row.sellerTitle);
}

function selectTotalRow(rows = []) {
  return rows.find(row => {
    const title = rowTitle(row);
    return title === '所选编号汇总' || title === '鎵€閫夌紪鍙锋眹鎬?' || title.toLowerCase() === 'total';
  }) || {};
}

function selectSellerRow(rows = [], code) {
  const candidates = rows.filter(row => {
    const title = rowTitle(row);
    return text(row.seller_num) === code || title.startsWith(`${code}-`) || title === code;
  });
  return candidates.sort((a, b) => num(b.order_sales, 0) - num(a.order_sales, 0))[0] || {};
}

function rate(value) {
  const n = num(value);
  return n === null ? null : n;
}

function money(value) {
  const n = num(value);
  return n === null ? null : n;
}

function rowMetrics(row = {}) {
  return {
    title: rowTitle(row) || null,
    sellerNum: text(row.seller_num) || null,
    sales: money(row.order_sales),
    units: num(row.sale_num, null),
    grossProfitRate: rate(row.gross_profit),
    netProfitRate: rate(row.net_profit),
    adCostShare: rate(row.advCost),
    acos: rate(row.ACOS),
    refundRate: rate(row.refund_percent),
    at: rate(row.AT),
    cpc: money(row.CPC),
    cps: money(row.CPS),
    roas: money(row.ROAS),
    unitYoyOver1Year: rate(row.qty_yoy_over_1_year),
  };
}

function newProductMetrics(row = {}) {
  return {
    sales: money(row.order_sales_in_5_month),
    grossProfitRate: rate(row.gross_profit_in_5_month),
    netProfitRate: rate(row.net_profit_in_5_month),
    adCostShare: rate(row.advCost_in_5_month),
    acos: rate(row.acos_in_5_month),
    at: rate(row.at_in_5_month),
    cpc: money(row.cpc_in_5_month),
    cps: money(row.cps_in_5_month),
  };
}

function buildSummary(options = {}) {
  const date = options.date || chinaDate();
  const rawDir = options.rawDir || defaultRawDir(date);
  const salesCoreFile = options.salesCoreFile || findSalesCoreFile(date, rawDir);
  const salesRows = loadSalesRows(salesCoreFile);
  const totalRow = selectTotalRow(salesRows);
  const successRateFile = options.successRateFile || findSuccessRateFile(date, rawDir);
  const successRate = readJson(successRateFile, null);
  const startedAt = options.startedAt || Date.now();

  const missing = [];
  if (!salesCoreFile || !salesRows.length || !Object.keys(totalRow).length) missing.push('sales_core_summary');
  if (!successRateFile) missing.push('seller_success_rate_HJ17');

  return {
    ok: missing.length === 0 || (missing.length === 1 && missing[0] === 'seller_success_rate_HJ17'),
    mode: 'fast_core_summary',
    date,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    files: {
      rawDir,
      salesCore: salesCoreFile || '',
      sellerSuccessRate: successRateFile || '',
    },
    missing,
    totalAccount: rowMetrics(totalRow),
    newProduct0To5Month: newProductMetrics(totalRow),
    sellers: {
      HJ17: rowMetrics(selectSellerRow(salesRows, 'HJ17')),
      HJ171: rowMetrics(selectSellerRow(salesRows, 'HJ171')),
      HJ172: rowMetrics(selectSellerRow(salesRows, 'HJ172')),
    },
    sellerSuccessRate: successRate ? {
      percent: successRate.successRatePercent || null,
      rate: successRate.successRate ?? null,
      total: successRate.targetRow?.total ?? null,
      success: successRate.targetRow?.success ?? null,
      failure: successRate.targetRow?.failure ?? null,
      inspect: successRate.targetRow?.inspect ?? null,
      window: successRate.window || null,
    } : null,
    nextAction: missing.includes('sales_core_summary')
      ? `Run npm run ops:deposit:recover-sales-core -- --date ${date} after chrome readiness; do not run full snapshot just to answer core metrics.`
      : 'Core metrics are ready; run full snapshot only when refreshing HTML, SKU pools, inventory/ad detail, or full deposit closure.',
  };
}

function fmtMoney(value) {
  return value === null || value === undefined
    ? '-'
    : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(value) {
  return value === null || value === undefined
    ? '-'
    : Math.round(Number(value)).toLocaleString('en-US');
}

function fmtPct(value) {
  return value === null || value === undefined
    ? '-'
    : `${(Number(value) * 100).toFixed(2)}%`;
}

function humanSummary(summary) {
  const total = summary.totalAccount || {};
  const np = summary.newProduct0To5Month || {};
  const hj17 = summary.sellers?.HJ17 || {};
  const success = summary.sellerSuccessRate || {};
  return [
    `Fast core summary ${summary.date} (${summary.elapsedMs}ms)`,
    `Total: sales ${fmtMoney(total.sales)}, units ${fmtInt(total.units)}, gross ${fmtPct(total.grossProfitRate)}, net ${fmtPct(total.netProfitRate)}, ad share ${fmtPct(total.adCostShare)}, ACOS ${fmtPct(total.acos)}, refund ${fmtPct(total.refundRate)}, ROAS ${fmtMoney(total.roas)}.`,
    `0-5m: sales ${fmtMoney(np.sales)}, gross ${fmtPct(np.grossProfitRate)}, net ${fmtPct(np.netProfitRate)}, ad share ${fmtPct(np.adCostShare)}, ACOS ${fmtPct(np.acos)}, AT ${fmtPct(np.at)}.`,
    `HJ17: sales ${fmtMoney(hj17.sales)}, units ${fmtInt(hj17.units)}, net ${fmtPct(hj17.netProfitRate)}, refund ${fmtPct(hj17.refundRate)}, ACOS ${fmtPct(hj17.acos)}, success ${success.percent || '-'}.`,
    summary.missing.length ? `Missing: ${summary.missing.join(', ')}.` : 'Missing: none.',
    summary.nextAction,
  ].join('\n');
}

function main() {
  const startedAt = Date.now();
  const options = parseArgs();
  const summary = buildSummary({ ...options, startedAt });
  console.log(options.json ? JSON.stringify(summary, null, 2) : humanSummary(summary));
  if (summary.missing.includes('sales_core_summary')) process.exitCode = 2;
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
  archiveDateDir,
  buildSummary,
  humanSummary,
  parseCsv,
  selectSellerRow,
  selectTotalRow,
};
