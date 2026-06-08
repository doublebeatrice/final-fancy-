const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const {
  buildUnattendedGate,
  persistUnattendedGate,
} = require('../src/agent_unattended_gate');
const { runAgentWriteExecution } = require('./run_agent_write_execution');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    today: get('--today') || process.env.AGENT_TODAY || '',
    dataDate: get('--data-date') || process.env.AGENT_DATA_DATE || '',
    now: get('--now') || process.env.AGENT_NOW || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    closedLoopFile: get('--closed-loop') || process.env.AGENT_CLOSED_LOOP_OUT || '',
    autonomyAuditFile: get('--autonomy-audit') || process.env.AGENT_AUTONOMY_AUDIT_OUT || '',
    learningMemoryFile: get('--learning-memory') || process.env.AGENT_LEARNING_MEMORY_OUT || '',
    trendAnomalyFile: get('--trend-anomaly') || process.env.AGENT_TREND_ANOMALY_OUT || '',
    writeExecutionFile: get('--write-execution') || process.env.AGENT_WRITE_EXECUTION_FILE || '',
    ledgerFile: get('--ledger') || process.env.AGENT_LEDGER_FILE || '',
    actionSchemaFile: get('--actions') || get('--action-schema') || process.env.ACTION_SCHEMA_FILE || '',
    snapshotFile: get('--snapshot') || process.env.PANEL_SNAPSHOT_FILE || '',
    adjustmentsFile: get('--adjustments') || process.env.AGENT_ADJUSTMENTS_FILE || '',
    outFile: get('--out') || process.env.AGENT_UNATTENDED_GATE_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_UNATTENDED_GATE_MD_OUT || '',
    executionOutFile: get('--execute-out') || process.env.AGENT_UNATTENDED_EXECUTION_OUT || '',
    executeIfReady: args.includes('--execute-if-ready') || process.env.AGENT_UNATTENDED_EXECUTE_IF_READY === '1',
    maxActions: get('--max-actions') || process.env.AGENT_UNATTENDED_MAX_ACTIONS || '',
  };
}

function runAgentUnattendedGate(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_unattended_gate_${Date.now()}`,
  });
  const gate = buildUnattendedGate(options, timeContext);
  let execution = null;
  if (options.executeIfReady === true && gate.canAutoExecute === true) {
    const plan = gate.writePlan || {};
    execution = runAgentWriteExecution({
      ...options,
      timeContext,
      execute: true,
      ledger: options.ledger || {
        actions: (plan.eligible || []).map(item => item.action).filter(Boolean),
      },
      ledgerFile: options.ledgerFile,
      actionSchemaFile: options.actionSchemaFile || plan.actionSchemaFile,
      snapshotFile: options.snapshotFile || plan.snapshotFile,
      outFile: options.executionOutFile,
      today: gate.businessDate,
    });
    gate.execution = execution;
    if (execution.summary.failedStages > 0 || execution.summary.blockedActions > 0) {
      gate.decision = 'execute_failed';
      gate.canAutoExecute = false;
    }
  }
  const files = persistUnattendedGate(gate, {
    outFile: options.outFile,
    markdownFile: options.markdownFile,
    today: gate.businessDate,
  });
  gate.files = {
    ...gate.files,
    outFile: files.outFile,
    markdownFile: files.markdownFile,
  };
  persistUnattendedGate(gate, {
    outFile: files.outFile,
    markdownFile: files.markdownFile,
    today: gate.businessDate,
  });
  return gate;
}

function main() {
  const gate = runAgentUnattendedGate(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: true,
    executeAllowed: gate.canAutoExecute === true,
    businessDate: gate.businessDate,
    decision: gate.decision,
    summary: gate.summary,
    files: {
      outFile: text(gate.files.outFile).replace(ROOT, '').replace(/^[/\\]/, ''),
      markdownFile: text(gate.files.markdownFile).replace(ROOT, '').replace(/^[/\\]/, ''),
    },
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
  runAgentUnattendedGate,
};
