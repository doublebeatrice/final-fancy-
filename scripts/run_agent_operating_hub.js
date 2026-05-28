const fs = require('fs');
const path = require('path');
const { buildOperatingHub } = require('../src/agent_operating_hub');
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
    ledgerFile: get('--ledger') || process.env.AGENT_LEDGER_FILE || '',
    inboxFile: get('--inbox') || process.env.AGENT_INBOX_FILE || '',
    reviewFile: get('--reviews') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    capabilityFile: get('--capabilities') || process.env.AGENT_CAPABILITY_REGISTRY_FILE || '',
    learningMemoryFile: get('--learning-memory') || get('--prior-learning-memory') || process.env.AGENT_PRIOR_LEARNING_MEMORY_FILE || '',
    outFile: get('--out') || process.env.AGENT_OPERATING_HUB_OUT || '',
    today: get('--today') || process.env.AGENT_TODAY || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    now: get('--now') || process.env.AGENT_NOW || '',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
  };
}

function defaultFile(prefix, today) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${today}.json`);
}

function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function runAgentOperatingHub(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `operating_hub_${Date.now()}`,
  });
  const today = options.today || timeContext.businessDate;
  const ledgerFile = options.ledgerFile || defaultFile('agent_ledger', today);
  const inboxFile = options.inboxFile || defaultFile('external_inbox', today);
  const reviewFile = options.reviewFile || defaultFile('review_queue', today);
  const capabilityFile = options.capabilityFile || defaultFile('capability_registry', today);
  const learningMemoryFile = options.learningMemoryFile || defaultFile('learning_memory', addDays(today, -1));
  const hub = buildOperatingHub({
    timeContext,
    today,
    ledger: options.ledger || readJson(ledgerFile, {}),
    externalInbox: options.externalInbox || readJson(inboxFile, {}),
    reviewQueue: options.reviewQueue || readJson(reviewFile, {}),
    capabilityRegistry: options.capabilityRegistry || readJson(capabilityFile, {}),
    learningMemory: options.learningMemory || readJson(learningMemoryFile, {}),
    sourceFiles: {
      ledgerFile,
      inboxFile,
      reviewFile,
      effectReviewFile: options.effectReviewFile || '',
      capabilityFile,
      learningMemoryFile,
    },
  });
  const outFile = options.outFile || defaultFile('operating_hub', today);
  writeJson(outFile, hub);
  return hub;
}

function main() {
  const options = parseArgs(process.argv);
  const hub = runAgentOperatingHub(options);
  const outFile = options.outFile || defaultFile('operating_hub', hub.businessDate);
  console.log(JSON.stringify({
    ok: true,
    businessDate: hub.businessDate,
    outFile,
    summary: hub.summary,
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
  runAgentOperatingHub,
};
