const path = require('path');
const {
  runOldProductMarketEvidenceQueue,
} = require('../src/old_product_market_evidence_queue');

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  const numberArg = (name, fallback = 0) => {
    const n = Number(get(name));
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    businessDate: get('--date') || get('--business-date') || env.OLD_PRODUCT_MARKET_EVIDENCE_DATE || '',
    queueFile: get('--queue') || env.OLD_PRODUCT_MARKET_EVIDENCE_QUEUE || '',
    hubFile: get('--hub-out') || env.OLD_PRODUCT_MARKET_EVIDENCE_HUB_OUT || '',
    markdownFile: get('--md-out') || env.OLD_PRODUCT_MARKET_EVIDENCE_MD_OUT || '',
    outputRoot: get('--output-root') || env.OLD_PRODUCT_MARKET_EVIDENCE_OUTPUT_ROOT || '',
    aggregateOutFile: get('--aggregate-out') || env.OLD_PRODUCT_MARKET_EVIDENCE_AGGREGATE_OUT || '',
    maxItems: numberArg('--max-items', 0),
  };
}

function main() {
  const options = parseArgs();
  const result = runOldProductMarketEvidenceQueue(options);
  console.log(JSON.stringify({
    ok: true,
    businessDate: result.plan.businessDate,
    files: {
      hubFile: path.resolve(result.files.hubFile),
      markdownFile: path.resolve(result.files.markdownFile),
      queueFile: path.resolve(result.files.queueFile),
      aggregateFile: result.files.aggregateFile ? path.resolve(result.files.aggregateFile) : '',
    },
    summary: result.plan.summary,
    nextCommand: `node scripts/run_agent_command_runner.js --hub ${path.resolve(result.files.hubFile)} --dry-run`,
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
