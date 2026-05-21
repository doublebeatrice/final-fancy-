const fs = require('fs');
const path = require('path');
const { buildDueReviewQueue } = require('../src/agent_external_inbox');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
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
    outFile: get('--out') || process.env.AGENT_REVIEW_QUEUE_OUT || '',
    today: get('--today') || process.env.AGENT_REVIEW_TODAY || '',
  };
}

function defaultLedgerFile(today, outDir = DEFAULT_OUT_DIR) {
  const ymd = today || new Date().toISOString().slice(0, 10);
  return path.join(outDir, `agent_ledger_${ymd}.json`);
}

function defaultOutFile(today) {
  const ymd = today || new Date().toISOString().slice(0, 10);
  return path.join(DEFAULT_OUT_DIR, `review_queue_${ymd}.json`);
}

function mergeLedgerTasks(ledgers = [], today = '') {
  const taskMap = new Map();
  for (const ledger of ledgers) {
    const tasks = Array.isArray(ledger?.nextOpenTasks) ? ledger.nextOpenTasks : (ledger?.tasks || []);
    for (const task of tasks) {
      if (today && task.businessDate && task.businessDate > today) continue;
      const key = task.taskId || `${task.source || ''}:${task.kind || ''}:${task.dueDate || ''}:${task.subject?.sku || task.subject?.entityId || ''}`;
      if (!key) continue;
      taskMap.set(key, task);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    businessDate: today,
    nextOpenTasks: [...taskMap.values()],
  };
}

function readDefaultLedgerCollection(today, outDir = DEFAULT_OUT_DIR) {
  const currentFile = defaultLedgerFile(today, outDir);
  const ledgers = [];
  if (fs.existsSync(currentFile)) {
    ledgers.push(readJson(currentFile, {}));
  }
  try {
    for (const name of fs.readdirSync(outDir)) {
      if (!/^agent_ledger_\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
      const file = path.join(outDir, name);
      if (path.resolve(file) === path.resolve(currentFile)) continue;
      const ledger = readJson(file, {});
      if (!ledger.businessDate || ledger.businessDate > today) continue;
      ledgers.push(ledger);
    }
  } catch (error) {
    // Keep the current-day fallback behavior when the agent directory is absent.
  }
  return mergeLedgerTasks(ledgers, today);
}

function runAgentReviewQueue(options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const ledgerFile = options.ledgerFile || '';
  const ledger = options.ledger || (ledgerFile
    ? readJson(ledgerFile, {})
    : readDefaultLedgerCollection(today, options.outDir || DEFAULT_OUT_DIR));
  const queue = buildDueReviewQueue(ledger, { today });
  const outFile = options.outFile || defaultOutFile(today);
  writeJson(outFile, queue);
  return queue;
}

function main() {
  const options = parseArgs(process.argv);
  const queue = runAgentReviewQueue(options);
  const outFile = options.outFile || defaultOutFile(options.today || queue.today);
  console.log(JSON.stringify({
    ok: true,
    today: queue.today,
    outFile,
    summary: queue.summary,
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
  mergeLedgerTasks,
  parseArgs,
  readDefaultLedgerCollection,
  runAgentReviewQueue,
};
