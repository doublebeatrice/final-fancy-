const path = require('path');
const { collectAdSkuReviewEvidence } = require('../src/agent_review_evidence');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    queueFile: get('--queue') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    outFile: get('--out') || process.env.AGENT_REVIEW_EVIDENCE_FILE || '',
    outDir: get('--out-dir') || process.env.AGENT_REVIEW_EVIDENCE_SOURCE_DIR || '',
    inventoryReportFile: get('--inventory-report') || process.env.AGENT_REVIEW_INVENTORY_REPORT || '',
    profitReportFile: get('--profit-report') || process.env.AGENT_REVIEW_PROFIT_REPORT || '',
    keywordResearchReportFile: get('--keyword-research-report') || process.env.AGENT_REVIEW_KEYWORD_RESEARCH_REPORT || '',
    keywordConversionReportFile: get('--keyword-conversion-report') || process.env.AGENT_REVIEW_KEYWORD_CONVERSION_REPORT || '',
    abaSearchTermReportFile: get('--aba-report') || process.env.AGENT_REVIEW_ABA_REPORT || '',
    keywordSeasonalityReportFile: get('--seasonality-report') || process.env.AGENT_REVIEW_KEYWORD_SEASONALITY_REPORT || '',
    productTimeMachineReportFile: get('--product-time-machine-report') || process.env.AGENT_REVIEW_PRODUCT_TIME_MACHINE_REPORT || '',
    extendedSelectionReportFile: get('--extended-selection-report') || process.env.AGENT_REVIEW_EXTENDED_SELECTION_REPORT || '',
    today: get('--today') || process.env.AGENT_REVIEW_TODAY || '',
    siteId: get('--site-id') || process.env.SITE_ID || '4',
    day: get('--day') || process.env.DAY || '7',
  };
}

function runAgentReviewEvidence(options = {}) {
  return collectAdSkuReviewEvidence({
    queueFile: options.queueFile,
    queue: options.queue,
    outFile: options.outFile,
    outDir: options.outDir || path.join(ROOT, 'data', 'agent', 'review_evidence_sources', options.today || new Date().toISOString().slice(0, 10)),
    inventoryReportFile: options.inventoryReportFile,
    profitReportFile: options.profitReportFile,
    keywordResearchReportFile: options.keywordResearchReportFile,
    keywordConversionReportFile: options.keywordConversionReportFile,
    abaSearchTermReportFile: options.abaSearchTermReportFile,
    keywordSeasonalityReportFile: options.keywordSeasonalityReportFile,
    productTimeMachineReportFile: options.productTimeMachineReportFile,
    extendedSelectionReportFile: options.extendedSelectionReportFile,
    inventoryReports: options.inventoryReports,
    profitReports: options.profitReports,
    selectionReports: options.selectionReports,
    today: options.today,
    siteId: options.siteId,
    day: options.day,
    execFileSync: options.execFileSync,
  });
}

function main() {
  const options = parseArgs(process.argv);
  const result = runAgentReviewEvidence(options);
  console.log(JSON.stringify({
    ok: result.summary.errors.length === 0,
    evidenceFile: result.evidenceFile,
    summary: result.summary,
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
  runAgentReviewEvidence,
};
