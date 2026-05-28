const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const {
  buildAgentLearningMemory,
  persistAgentLearningMemory,
} = require('../src/agent_learning_memory');

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
    learningFile: get('--learning') || process.env.AGENT_DAILY_LEARNING_FILE || '',
    autonomyAuditFile: get('--autonomy-audit') || process.env.AGENT_AUTONOMY_AUDIT_OUT || '',
    correctionDir: get('--correction-dir') || process.env.AGENT_CORRECTION_LEARNING_DIR || '',
    skuLessonDir: get('--sku-lesson-dir') || process.env.AGENT_SKU_LESSON_DIR || '',
    outFile: get('--out') || process.env.AGENT_LEARNING_MEMORY_OUT || '',
    markdownFile: get('--md-out') || process.env.AGENT_LEARNING_MEMORY_MD_OUT || '',
  };
}

function runAgentLearningMemory(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_learning_memory_${Date.now()}`,
  });
  const memory = buildAgentLearningMemory(options, timeContext);
  const files = persistAgentLearningMemory(memory, {
    outFile: options.outFile,
    markdownFile: options.markdownFile,
    today: memory.businessDate,
  });
  memory.files = {
    outFile: files.outFile,
    markdownFile: files.markdownFile,
  };
  persistAgentLearningMemory(memory, {
    outFile: files.outFile,
    markdownFile: files.markdownFile,
    today: memory.businessDate,
  });
  return memory;
}

function main() {
  const memory = runAgentLearningMemory(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: true,
    businessDate: memory.businessDate,
    status: memory.status,
    summary: memory.summary,
    files: {
      outFile: text(memory.files.outFile).replace(ROOT, '').replace(/^[/\\]/, ''),
      markdownFile: text(memory.files.markdownFile).replace(ROOT, '').replace(/^[/\\]/, ''),
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
  runAgentLearningMemory,
};
