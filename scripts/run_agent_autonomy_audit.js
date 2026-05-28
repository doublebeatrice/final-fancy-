const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const {
  buildAutonomyAudit,
  persistAutonomyAudit,
} = require('../src/agent_autonomy_audit');

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
    now: get('--now') || process.env.AGENT_NOW || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    closedLoopFile: get('--closed-loop') || process.env.AGENT_CLOSED_LOOP_OUT || '',
    handoffFile: get('--handoff') || process.env.AGENT_HANDOFF_FILE || '',
    commandResultsFile: get('--command-results') || process.env.AGENT_COMMAND_RESULTS_FILE || '',
    writeExecutionFile: get('--write-execution') || process.env.AGENT_WRITE_EXECUTION_FILE || '',
    learningFile: get('--learning') || process.env.AGENT_DAILY_LEARNING_FILE || '',
    learningMemoryFile: get('--learning-memory') || process.env.AGENT_LEARNING_MEMORY_OUT || '',
    correctionRiskFile: get('--correction-risk') || process.env.AGENT_CORRECTION_RISK_FILE || '',
    outFile: get('--out') || process.env.AGENT_AUTONOMY_AUDIT_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_AUTONOMY_AUDIT_MD_OUT || '',
    requireArtifactVerification: !args.includes('--skip-artifact-verification'),
  };
}

function runAgentAutonomyAudit(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_autonomy_audit_${Date.now()}`,
  });
  const audit = buildAutonomyAudit(options, timeContext);
  const files = persistAutonomyAudit(audit, {
    outFile: options.outFile,
    markdownFile: options.markdownFile,
    today: audit.businessDate,
  });
  audit.files = {
    ...audit.files,
    outFile: files.outFile,
    markdownFile: files.markdownFile,
  };
  persistAutonomyAudit(audit, {
    outFile: files.outFile,
    markdownFile: files.markdownFile,
    today: audit.businessDate,
  });
  return audit;
}

function main() {
  const options = parseArgs(process.argv);
  const audit = runAgentAutonomyAudit(options);
  console.log(JSON.stringify({
    ok: true,
    autonomousReady: audit.summary.autonomousReady === true,
    businessDate: audit.businessDate,
    status: audit.status,
    score: audit.score,
    summary: audit.summary,
    files: {
      outFile: text(audit.files.outFile).replace(ROOT, '').replace(/^[/\\]/, ''),
      markdownFile: text(audit.files.markdownFile).replace(ROOT, '').replace(/^[/\\]/, ''),
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
  runAgentAutonomyAudit,
};
