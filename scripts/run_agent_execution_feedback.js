const fs = require('fs');
const path = require('path');
const { applyCommandResultsToHub } = require('../src/agent_execution_feedback');
const { buildOpsTimeContext } = require('../src/ops_time');

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

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    hubFile: get('--hub') || process.env.AGENT_OPERATING_HUB_FILE || '',
    resultsFile: get('--results') || process.env.AGENT_COMMAND_RESULTS_FILE || '',
    outFile: get('--out') || process.env.AGENT_FEEDBACK_OUT || '',
    today: get('--today') || process.env.AGENT_TODAY || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    now: get('--now') || process.env.AGENT_NOW || '',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
  };
}

function defaultFile(prefix, today) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${today}.json`);
}

function runAgentExecutionFeedback(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `execution_feedback_${Date.now()}`,
  });
  const today = options.today || timeContext.businessDate;
  const hubFile = options.hubFile || defaultFile('operating_hub', today);
  const resultsFile = options.resultsFile || defaultFile('command_results', today);
  const updated = applyCommandResultsToHub(
    options.hub || readJson(hubFile, {}),
    options.results || readJson(resultsFile, {}),
    timeContext
  );
  const outFile = options.outFile || defaultFile('operating_hub_feedback', today);
  writeJson(outFile, updated);
  return updated;
}

function main() {
  const options = parseArgs(process.argv);
  const updated = runAgentExecutionFeedback(options);
  const outFile = options.outFile || defaultFile('operating_hub_feedback', updated.businessDate);
  console.log(JSON.stringify({
    ok: true,
    businessDate: updated.businessDate,
    outFile,
    summary: updated.summary,
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
  runAgentExecutionFeedback,
};
