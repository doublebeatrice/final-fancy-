const path = require('path');
const {
  runOldProductMaintenance,
} = require('../src/old_product_maintenance');

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  const numberArg = (name, fallback) => {
    const raw = get(name);
    if (raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    businessDate: get('--date') || get('--business-date') || env.OLD_PRODUCT_MAINTENANCE_DATE || '',
    dataDate: get('--data-date') || env.OLD_PRODUCT_MAINTENANCE_DATA_DATE || '',
    allSkuReviewFile: get('--all-sku-review') || env.OLD_PRODUCT_MAINTENANCE_ALL_SKU_REVIEW || '',
    approvalFile: get('--approval') || env.OLD_PRODUCT_MAINTENANCE_APPROVAL || '',
    depositStatusFile: get('--deposit-status') || env.OLD_PRODUCT_MAINTENANCE_DEPOSIT_STATUS || '',
    effectResultsFile: get('--effect-results') || env.OLD_PRODUCT_MAINTENANCE_EFFECT_RESULTS || '',
    outFile: get('--out') || env.OLD_PRODUCT_MAINTENANCE_OUT || '',
    markdownFile: get('--md-out') || env.OLD_PRODUCT_MAINTENANCE_MD_OUT || '',
    approvedActionsOutFile: get('--approved-actions-out') || env.OLD_PRODUCT_MAINTENANCE_APPROVED_ACTIONS_OUT || '',
    marketEvidenceQueueOutFile: get('--market-evidence-queue-out') || env.OLD_PRODUCT_MAINTENANCE_MARKET_EVIDENCE_QUEUE_OUT || '',
    candidateConfirmationOutFile: get('--candidate-confirmation-out') || env.OLD_PRODUCT_MAINTENANCE_CANDIDATE_CONFIRMATION_OUT || '',
    pendingConfirmationActionsOutFile: get('--pending-confirmation-actions-out') || env.OLD_PRODUCT_MAINTENANCE_PENDING_CONFIRMATION_ACTIONS_OUT || '',
    manualSuggestionQueueOutFile: get('--manual-suggestion-queue-out') || env.OLD_PRODUCT_MAINTENANCE_MANUAL_SUGGESTION_QUEUE_OUT || '',
    watchlistOutFile: get('--watchlist-out') || env.OLD_PRODUCT_MAINTENANCE_WATCHLIST_OUT || '',
    skuWatchlistFile: get('--sku-watchlist') || env.OLD_PRODUCT_MAINTENANCE_SKU_WATCHLIST || '',
    executionHandoffOutFile: get('--execution-handoff-out') || env.OLD_PRODUCT_MAINTENANCE_EXECUTION_HANDOFF_OUT || '',
    snapshotFile: get('--snapshot') || env.OLD_PRODUCT_MAINTENANCE_SNAPSHOT || '',
    maxCandidates: numberArg('--max-candidates', 20),
  };
}

function main() {
  const options = parseArgs();
  const result = runOldProductMaintenance(options);
  console.log(JSON.stringify({
    ok: true,
    businessDate: result.plan.businessDate,
    mode: result.plan.mode,
    files: {
      outFile: path.resolve(result.files.outFile),
      markdownFile: path.resolve(result.files.markdownFile),
      approvedActionsOutFile: result.files.approvedActionsOutFile ? path.resolve(result.files.approvedActionsOutFile) : '',
      marketEvidenceQueueOutFile: result.files.marketEvidenceQueueOutFile ? path.resolve(result.files.marketEvidenceQueueOutFile) : '',
      candidateConfirmationOutFile: result.files.candidateConfirmationOutFile ? path.resolve(result.files.candidateConfirmationOutFile) : '',
      pendingConfirmationActionsOutFile: result.files.pendingConfirmationActionsOutFile ? path.resolve(result.files.pendingConfirmationActionsOutFile) : '',
      manualSuggestionQueueOutFile: result.files.manualSuggestionQueueOutFile ? path.resolve(result.files.manualSuggestionQueueOutFile) : '',
      watchlistOutFile: result.files.watchlistOutFile ? path.resolve(result.files.watchlistOutFile) : '',
      skuWatchlistFile: result.files.skuWatchlistFile ? path.resolve(result.files.skuWatchlistFile) : '',
      executionHandoffOutFile: result.files.executionHandoffOutFile ? path.resolve(result.files.executionHandoffOutFile) : '',
    },
    skuWatchlistMerge: result.files.skuWatchlistMerge,
    summary: result.plan.summary,
    dataPrerequisites: result.plan.dataPrerequisites,
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
};
