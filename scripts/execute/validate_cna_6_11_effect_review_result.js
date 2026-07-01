const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_FILE = path.join(ROOT, 'data', 'tasks', 'cna_6_11_effect_review_result_template.json');

const REQUIRED_SKUS = [
  'WOO0173',
  'WOO0172',
  'GM2827',
  'UAN2600',
  'UAN0188',
  'HEL0606',
  'HEL0319',
  'UAN3646',
];

const REQUIRED_KEYWORD_IDS = [
  '205563485458750',
  '220704918317292',
  '208238442226357',
  '183138841883345',
  '38852901357476',
  '81832634189454',
  '113292488604608',
  '135563576351997',
];

const ALLOWED_FINAL_LADDERS = new Set([
  '0 exclude',
  '1 fill architecture',
  '2 get impressions/clicks',
  '3 protect effective line',
  '3.5 stop-loss window',
  '4 strong holiday push',
  'hold',
  'repair first',
]);

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function hasFiles(value) {
  return Array.isArray(value) && value.some(item => text(item));
}

function parseArgs(argv = []) {
  const fileArg = argv.find(arg => !arg.startsWith('--'));
  return {
    file: path.resolve(fileArg || DEFAULT_FILE),
  };
}

function pushMissing(missing, scope, field, message) {
  missing.push({ scope, field, message });
}

function validate(result = {}) {
  const missing = [];
  const warnings = [];
  const skuResults = Array.isArray(result.skuResults) ? result.skuResults : [];
  const resultBySku = new Map(skuResults.map(row => [text(row.sku), row]));

  if (text(result.task) !== 'CNA_WEEK_2026_MATRIX') {
    pushMissing(missing, 'root', 'task', 'task must be CNA_WEEK_2026_MATRIX');
  }
  if (text(result.reviewDate) !== '2026-06-11') {
    pushMissing(missing, 'root', 'reviewDate', 'reviewDate must be 2026-06-11');
  }
  if (result.requiredLiveReads?.backendReady !== true) {
    pushMissing(missing, 'requiredLiveReads', 'backendReady', 'backend readiness must be true after live check');
  }

  const keywordIds = result.requiredLiveReads?.keywordReadback?.keywordIds || [];
  for (const id of REQUIRED_KEYWORD_IDS) {
    if (!keywordIds.map(text).includes(id)) {
      pushMissing(missing, 'keywordReadback', id, 'required repaired keywordId is missing');
    }
  }
  if (!hasFiles(result.requiredLiveReads?.keywordReadback?.evidenceFiles)) {
    pushMissing(missing, 'keywordReadback', 'evidenceFiles', 'keyword readback evidence file is required');
  }
  if (!hasFiles(result.requiredLiveReads?.skuArchitecture?.evidenceFiles)) {
    pushMissing(missing, 'skuArchitecture', 'evidenceFiles', 'SKU architecture evidence file is required');
  }

  const searchStatus = text(result.requiredLiveReads?.customerSearchTerms?.status);
  if (!searchStatus || searchStatus === 'not_checked') {
    pushMissing(missing, 'customerSearchTerms', 'status', 'record usable, unavailable_shell_rows, or unavailable_error');
  }
  if (searchStatus === 'usable' && !hasFiles(result.requiredLiveReads?.customerSearchTerms?.evidenceFiles)) {
    pushMissing(missing, 'customerSearchTerms', 'evidenceFiles', 'usable search terms require evidence files');
  }

  for (const sku of REQUIRED_SKUS) {
    const row = resultBySku.get(sku);
    if (!row) {
      pushMissing(missing, sku, 'skuResults', 'missing SKU result row');
      continue;
    }
    for (const field of [
      'architectureStatus',
      'funnelLayer',
      'searchTermOrAsinRelevance',
      'listingOrOfferBlocker',
      'finalLadder',
      'actionTakenOrHoldReason',
    ]) {
      if (!text(row[field])) {
        pushMissing(missing, sku, field, 'field must be filled from live review');
      }
    }
    if (!hasFiles(row.liveEvidenceFiles)) {
      pushMissing(missing, sku, 'liveEvidenceFiles', 'SKU live evidence files are required');
    }
    const finalLadder = text(row.finalLadder);
    if (finalLadder && !ALLOWED_FINAL_LADDERS.has(finalLadder)) {
      pushMissing(missing, sku, 'finalLadder', `final ladder is not allowed: ${finalLadder}`);
    }
    if (text(row.closeoutState) === 'pending_live_read') {
      pushMissing(missing, sku, 'closeoutState', 'closeoutState must be updated after live read');
    }
  }

  if (result.closeout?.canCloseCna === true) {
    if (missing.length > 0) {
      warnings.push('canCloseCna is true but required evidence or SKU fields are missing');
    }
    if (result.closeout?.gbrainUpdated !== true) {
      pushMissing(missing, 'closeout', 'gbrainUpdated', 'GBrain must be updated before closing CNA');
    }
    if (result.closeout?.watchlistUpdated !== true) {
      pushMissing(missing, 'closeout', 'watchlistUpdated', 'watchlist must be updated before closing CNA');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    skuRows: skuResults.length,
  };
}

function run(options = {}) {
  const file = path.resolve(options.file || DEFAULT_FILE);
  const result = readJson(file);
  return {
    file,
    ...validate(result),
  };
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exit(2);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  run,
  validate,
};
