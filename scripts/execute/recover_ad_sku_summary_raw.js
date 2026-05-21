const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
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
      options[key] = '1';
    }
  }
  return {
    date: text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10),
    siteId: Number(options.site || options.siteId || 4),
    day: Number(options.day || 30),
    outDir: text(options.outDir || ''),
  };
}

function dateFolderName(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`date must be YYYY-MM-DD: ${ymd}`);
  return `${Number(match[2])}-${Number(match[3])}`;
}

function defaultRawDir(date) {
  return path.join(
    ROOT,
    '黄成喆个人数据趋势',
    '原数据',
    '原日数据',
    dateFolderName(date),
  );
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(file, rows = []) {
  const headers = [...rows.reduce((set, row) => {
    if (row && typeof row === 'object') Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set())];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => csvEscape(row?.[header])).join(','));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `\uFEFF${lines.join('\n')}\n`, 'utf8');
  return { file, rows: rows.length, columns: headers.length, bytes: fs.statSync(file).size };
}

function run(options = parseArgs()) {
  const rawDir = options.outDir || defaultRawDir(options.date);
  const jsonFile = path.join(ROOT, 'data', 'snapshots', `ad_sku_summary_ALL_${options.day}d_${options.date}.json`);
  const csvFile = path.join(rawDir, `ad_sku_summary_${options.day}d_${options.date}.csv`);
  const child = spawnSync(
    process.execPath,
    [path.join(__dirname, 'fetch_ad_sku_summary.js'), String(options.siteId), String(options.day), '', jsonFile],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (child.status !== 0) {
    throw new Error(`fetch_ad_sku_summary failed: ${child.stderr || child.stdout}`);
  }
  const report = JSON.parse(fs.readFileSync(jsonFile, 'utf8').replace(/^\uFEFF/, ''));
  if (!report.ok || !Array.isArray(report.rows) || !report.rows.length) {
    throw new Error(`ad summary fetch returned no usable rows: ${JSON.stringify({ ok: report.ok, status: report.status, rowCount: report.rowCount })}`);
  }
  const csv = writeCsv(csvFile, report.rows);
  return {
    ok: true,
    date: options.date,
    source: report.source,
    jsonFile,
    csvFile,
    rowCount: report.rows.length,
    totalAvailableRows: report.totalAvailableRows,
    pagesFetched: report.pagesFetched,
    csv,
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(run(), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { run, writeCsv };
