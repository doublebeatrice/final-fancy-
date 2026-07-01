const fs = require('fs');
const path = require('path');
const {
  buildAllSkuOperatingReview,
  renderAllSkuOperatingReviewHtml,
} = require('../src/sku_operating_review');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function resolveRoot(file) {
  const raw = text(file);
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  return {
    businessDate: get('--date') || get('--business-date') || env.ALL_SKU_OPERATING_REVIEW_DATE || '',
    dataDate: get('--data-date') || env.ALL_SKU_OPERATING_REVIEW_DATA_DATE || '',
    snapshotFile: get('--snapshot') || env.ALL_SKU_OPERATING_REVIEW_SNAPSHOT || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    selectionReportsFile: get('--selection-reports') || get('--market-evidence') || env.ALL_SKU_OPERATING_REVIEW_SELECTION_REPORTS || '',
    outFile: get('--out') || env.ALL_SKU_OPERATING_REVIEW_OUT || '',
    htmlFile: get('--html-out') || env.ALL_SKU_OPERATING_REVIEW_HTML_OUT || '',
  };
}

function defaultJsonFile(businessDate) {
  return path.join(ROOT, 'data', 'tasks', `all_sku_operating_review_${businessDate}.json`);
}

function defaultHtmlFile(businessDate) {
  return path.join(ROOT, 'data', 'tasks', `all_sku_operating_review_${businessDate}.html`);
}

function runAllSkuOperatingReview(options = {}) {
  const businessDate = dateOnly(options.businessDate || options.date || new Date());
  const dataDate = dateOnly(options.dataDate || businessDate);
  const snapshotFile = resolveRoot(options.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'));
  const selectionReportsFile = resolveRoot(options.selectionReportsFile || '');
  const snapshot = options.snapshot || readJson(snapshotFile, {});
  const selectionReports = options.selectionReports || readJson(selectionReportsFile, {});
  const review = buildAllSkuOperatingReview({
    snapshot,
    selectionReports,
    timeContext: { businessDate, dataDate },
  });
  review.snapshotFile = snapshotFile;
  if (selectionReportsFile) review.selectionReportsFile = selectionReportsFile;

  const outFile = resolveRoot(options.outFile || defaultJsonFile(businessDate));
  const htmlFile = resolveRoot(options.htmlFile || defaultHtmlFile(businessDate));
  writeJson(outFile, review);
  writeText(htmlFile, renderAllSkuOperatingReviewHtml(review));
  return {
    review,
    files: {
      outFile,
      htmlFile,
      snapshotFile,
      selectionReportsFile,
    },
  };
}

function main() {
  const result = runAllSkuOperatingReview(parseArgs());
  console.log(JSON.stringify({
    ok: true,
    businessDate: result.review.businessDate,
    dataDate: result.review.dataDate,
    files: {
      outFile: path.resolve(result.files.outFile),
      htmlFile: path.resolve(result.files.htmlFile),
      snapshotFile: path.resolve(result.files.snapshotFile),
      selectionReportsFile: result.files.selectionReportsFile ? path.resolve(result.files.selectionReportsFile) : '',
    },
    summary: result.review.summary,
  }, null, 2));
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
  parseArgs,
  runAllSkuOperatingReview,
};
