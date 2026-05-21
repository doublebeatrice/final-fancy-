const fs = require('fs');
const path = require('path');
const { buildAgentLedger } = require('../src/agent_control_plane');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function readJson(file, fallback) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== undefined) return fallback;
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
    tasksFile: get('--tasks') || process.env.AGENT_TASKS_FILE || '',
    actionsFile: get('--actions') || process.env.AGENT_ACTIONS_FILE || '',
    outFile: get('--out') || process.env.AGENT_LEDGER_FILE || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    now: get('--now') || process.env.AGENT_NOW || '',
  };
}

function defaultOutFile(timeContext) {
  return path.join(DEFAULT_OUT_DIR, `agent_ledger_${timeContext.businessDate}.json`);
}

function arrayFromJson(value) {
  if (Array.isArray(value)) {
    if (value.some(item => Array.isArray(item?.actions))) {
      return value.flatMap(item => (item.actions || []).map(action => ({
        ...action,
        sku: action.sku || item.sku,
        asin: action.asin || item.asin,
        sourceTaskId: action.sourceTaskId || item.taskId || item.boardTaskId || '',
      })));
    }
    return value;
  }
  if (Array.isArray(value?.candidateContexts)) return dailyTaskPoolToAgentTasks(value);
  if (Array.isArray(value?.tasks) && value.tasks.some(isDailyTaskContext)) return dailyTaskPoolToAgentTasks(value);
  if (Array.isArray(value?.tasks)) return value.tasks;
  if (Array.isArray(value?.actions)) return value.actions;
  if (Array.isArray(value?.plan)) return value.plan.flatMap(item => (item.actions || []).map(action => ({ ...action, sku: action.sku || item.sku, asin: action.asin || item.asin })));
  return [];
}

function isDailyTaskContext(item = {}) {
  return Array.isArray(item.possibleSignals) || !!item.contextId || !!item.deterministicPriorityHint || !!item.facts;
}

function priorityFromHint(hint) {
  const value = Number(hint || 0);
  if (value >= 90) return 'P0';
  if (value >= 70) return 'P1';
  return 'P2';
}

function dailyTaskPoolToAgentTasks(pool = {}) {
  const contexts = pool.candidateContexts || pool.tasks || [];
  return contexts.map(context => {
    const signals = Array.isArray(context.possibleSignals) ? context.possibleSignals : [];
    const primarySignal = signals[0]?.type || context.primaryTaskType || context.category || 'daily_ops_review';
    const evidence = [
      ...signals.map(signal => signal.reason).filter(Boolean),
      ...(context.dataMissing || []).map(item => `missing: ${item}`),
    ];
    return {
      source: 'daily_ops',
      kind: primarySignal,
      title: `${context.sku || context.asin || context.groupKey || 'unnamed'} ${primarySignal}`,
      description: evidence.join(' | '),
      subject: {
        sku: context.sku,
        asin: context.asin,
        campaignId: context.campaignId,
        entityId: context.entityId,
      },
      priority: context.priority || priorityFromHint(context.deterministicPriorityHint),
      evidence,
      sourceRunId: context.sourceRunId || pool.time?.sourceRunId || '',
      businessDate: context.businessDate || pool.time?.businessDate || '',
      dataDate: context.dataDate || pool.time?.dataDate || '',
    };
  });
}

function runAgentControlPlane(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_control_${Date.now()}`,
  });
  const rawTasks = options.tasks || arrayFromJson(readJson(options.tasksFile, []));
  const rawActions = options.actions || arrayFromJson(readJson(options.actionsFile, []));
  const ledger = buildAgentLedger({
    timeContext,
    tasks: rawTasks,
    actions: rawActions,
  });
  const outFile = options.outFile || defaultOutFile(timeContext);
  writeJson(outFile, ledger);
  return ledger;
}

function main() {
  const options = parseArgs(process.argv);
  const ledger = runAgentControlPlane(options);
  const outFile = options.outFile || defaultOutFile(ledger);
  console.log(JSON.stringify({
    ok: true,
    businessDate: ledger.businessDate,
    outFile,
    summary: ledger.summary,
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
  arrayFromJson,
  dailyTaskPoolToAgentTasks,
  parseArgs,
  runAgentControlPlane,
};
