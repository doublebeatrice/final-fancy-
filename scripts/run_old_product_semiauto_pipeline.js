const path = require('path');
const { runOldProductSemiautoPipeline } = require('../src/old_product_semiauto_pipeline');

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
    businessDate: get('--date') || get('--business-date') || env.OLD_PRODUCT_SEMIAUTO_DATE || '',
    dataDate: get('--data-date') || env.OLD_PRODUCT_SEMIAUTO_DATA_DATE || '',
    snapshotFile: get('--snapshot') || env.OLD_PRODUCT_SEMIAUTO_SNAPSHOT || '',
    depositStatusFile: get('--deposit-status') || env.OLD_PRODUCT_SEMIAUTO_DEPOSIT_STATUS || '',
    taskDir: get('--task-dir') || env.OLD_PRODUCT_SEMIAUTO_TASK_DIR || '',
    snapshotDir: get('--snapshot-dir') || env.OLD_PRODUCT_SEMIAUTO_SNAPSHOT_DIR || '',
    agentDir: get('--agent-dir') || env.OLD_PRODUCT_SEMIAUTO_AGENT_DIR || '',
    skuWatchlistFile: get('--sku-watchlist') || env.OLD_PRODUCT_SEMIAUTO_SKU_WATCHLIST || '',
    marketEvidenceOutputRoot: get('--market-evidence-output-root') || env.OLD_PRODUCT_SEMIAUTO_MARKET_EVIDENCE_ROOT || '',
    manifestFile: get('--out') || env.OLD_PRODUCT_SEMIAUTO_OUT || '',
    markdownFile: get('--md-out') || env.OLD_PRODUCT_SEMIAUTO_MD_OUT || '',
    maxCandidates: numberArg('--max-candidates', 20),
    maxMarketItems: numberArg('--max-market-items', 20),
    commandTimeoutMs: numberArg('--command-timeout-ms', 180000),
    runMarketEvidence: argv.includes('--run-market-evidence') || env.OLD_PRODUCT_SEMIAUTO_RUN_MARKET_EVIDENCE === '1',
  };
}

function main() {
  const result = runOldProductSemiautoPipeline(parseArgs());
  console.log(JSON.stringify({
    ok: true,
    businessDate: result.manifest.businessDate,
    mode: result.manifest.mode,
    summary: result.manifest.summary,
    files: Object.fromEntries(
      Object.entries(result.files).map(([key, file]) => [key, file ? path.resolve(file) : ''])
    ),
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
