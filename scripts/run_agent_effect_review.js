const fs = require('fs');
const path = require('path');
const { buildEffectReviewReport } = require('../src/agent_effect_review');
const { collectAdSkuReviewEvidence } = require('../src/agent_review_evidence');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadQueue(options = {}) {
  if (options.queue) return options.queue;
  if (!options.queueFile) return {};
  if (!fs.existsSync(options.queueFile)) {
    throw new Error(`review queue file not found: ${options.queueFile}`);
  }
  return readJson(options.queueFile, {});
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    queueFile: get('--queue') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    evidenceFile: get('--evidence') || process.env.AGENT_REVIEW_EVIDENCE_FILE || '',
    collectEvidence: args.includes('--collect-evidence') || process.env.AGENT_REVIEW_COLLECT_EVIDENCE === '1',
    evidenceOutFile: get('--evidence-out') || process.env.AGENT_REVIEW_EVIDENCE_OUT || '',
    evidenceSourceDir: get('--evidence-source-dir') || process.env.AGENT_REVIEW_EVIDENCE_SOURCE_DIR || '',
    inventoryReportFile: get('--inventory-report') || process.env.AGENT_REVIEW_INVENTORY_REPORT || '',
    profitReportFile: get('--profit-report') || process.env.AGENT_REVIEW_PROFIT_REPORT || '',
    keywordConversionReportFile: get('--keyword-conversion-report') || process.env.AGENT_REVIEW_KEYWORD_CONVERSION_REPORT || '',
    abaSearchTermReportFile: get('--aba-report') || process.env.AGENT_REVIEW_ABA_REPORT || '',
    keywordSeasonalityReportFile: get('--seasonality-report') || process.env.AGENT_REVIEW_KEYWORD_SEASONALITY_REPORT || '',
    siteId: get('--site-id') || process.env.SITE_ID || '4',
    day: get('--day') || process.env.DAY || '7',
    outFile: get('--out') || process.env.AGENT_EFFECT_REVIEW_OUT || '',
    today: get('--today') || process.env.AGENT_REVIEW_TODAY || '',
  };
}

function defaultOutFile(today) {
  const ymd = today || new Date().toISOString().slice(0, 10);
  return path.join(DEFAULT_OUT_DIR, `effect_review_${ymd}.json`);
}

function runAgentEffectReview(options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const queue = loadQueue(options);
  let evidence = options.evidence || readJson(options.evidenceFile, {});
  let evidenceFile = options.evidenceFile || '';
  if (options.collectEvidence) {
    const collected = collectAdSkuReviewEvidence({
      queue,
      today,
      outFile: options.evidenceOutFile,
      outDir: options.evidenceSourceDir,
      inventoryReportFile: options.inventoryReportFile,
      profitReportFile: options.profitReportFile,
      keywordConversionReportFile: options.keywordConversionReportFile,
      abaSearchTermReportFile: options.abaSearchTermReportFile,
      keywordSeasonalityReportFile: options.keywordSeasonalityReportFile,
      inventoryReports: options.inventoryReports,
      profitReports: options.profitReports,
      selectionReports: options.selectionReports,
      siteId: options.siteId,
      day: options.day,
      execFileSync: options.execFileSync,
    });
    evidence = collected.evidence;
    evidenceFile = collected.evidenceFile;
  }
  const report = buildEffectReviewReport({
    queue,
    evidence,
    today,
  });
  if (evidenceFile) report.evidenceFile = evidenceFile;
  const outFile = options.outFile || defaultOutFile(today);
  writeJson(outFile, report);
  return report;
}

function main() {
  const options = parseArgs(process.argv);
  const report = runAgentEffectReview(options);
  const outFile = options.outFile || defaultOutFile(report.today);
  console.log(JSON.stringify({
    ok: true,
    today: report.today,
    outFile,
    summary: report.summary,
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
  loadQueue,
  parseArgs,
  runAgentEffectReview,
};
