const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const snapshotPath = path.resolve(ROOT, process.argv[2] || 'data/snapshots/latest_snapshot.json');
const date = process.argv[3] || new Date().toISOString().slice(0, 10);

function csvEscape(value) {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, rows) {
  const array = Array.isArray(rows) ? rows : [];
  const keys = [...array.reduce((set, row) => {
    if (row && typeof row === 'object') Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set())];
  const lines = [keys.map(csvEscape).join(',')];
  for (const row of array) {
    lines.push(keys.map((key) => csvEscape(row ? row[key] : '')).join(','));
  }
  fs.writeFileSync(file, `\uFEFF${lines.join('\n')}\n`, 'utf8');
  return { file, rows: array.length, columns: keys.length, bytes: fs.statSync(file).size };
}

function findTrendRoot() {
  const preferred = path.join(ROOT, '黄成喆个人数据趋势', '原数据', '原日数据');
  if (fs.existsSync(preferred)) return preferred;
  throw new Error(`raw archive root not found: ${preferred}`);
}

if (!fs.existsSync(snapshotPath)) {
  throw new Error(`snapshot not found: ${snapshotPath}`);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
if (!month || !day) throw new Error(`date must be YYYY-MM-DD: ${date}`);

const outDir = path.join(findTrendRoot(), `${Number(month)}-${Number(day)}`);
fs.mkdirSync(outDir, { recursive: true });

const outputs = [];
outputs.push(writeCsv(path.join(outDir, `seller_sales_from_snapshot_${date}.csv`), snapshot.sellerSalesRows));
outputs.push(writeCsv(path.join(outDir, `inv_auto_filtered_from_snapshot_${date}.csv`), snapshot.productCards));
outputs.push(writeCsv(path.join(outDir, `ad_sku_summary_from_snapshot_${date}.csv`), snapshot.adSkuSummaryRows));

const manifest = {
  date,
  generatedAt: new Date().toISOString(),
  snapshotPath,
  snapshotExportedAt: snapshot.exportedAt || null,
  outputs,
  sourceCounts: {
    productCards: Array.isArray(snapshot.productCards) ? snapshot.productCards.length : 0,
    sellerSalesRows: Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows.length : 0,
    adSkuSummaryRows: Array.isArray(snapshot.adSkuSummaryRows) ? snapshot.adSkuSummaryRows.length : 0,
    kwRows: Array.isArray(snapshot.kwRows) ? snapshot.kwRows.length : 0,
    autoRows: Array.isArray(snapshot.autoRows) ? snapshot.autoRows.length : 0,
    targetRows: Array.isArray(snapshot.targetRows) ? snapshot.targetRows.length : 0,
    sbRows: Array.isArray(snapshot.sbRows) ? snapshot.sbRows.length : 0,
  },
  notes: [
    'Generated from latest structured snapshot to preserve the daily raw-input layer.',
    'HTML remains the readable view; these CSV files plus the snapshot are the durable data layer.',
  ],
};

const manifestFile = path.join(outDir, `daily_deposit_manifest_${date}.json`);
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

console.log(JSON.stringify({ outDir, manifestFile, outputs }, null, 2));
