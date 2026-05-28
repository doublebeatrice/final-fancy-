const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const {
  buildCorrectionRiskReport,
  persistCorrectionRiskReport,
} = require('../src/agent_correction_risk');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    text: get('--text') || process.env.AGENT_CORRECTION_TEXT || '',
    inputFile: get('--file') || process.env.AGENT_CORRECTION_FILE || '',
    outFile: get('--out') || process.env.AGENT_CORRECTION_RISK_OUT || '',
    mdFile: get('--md-out') || process.env.AGENT_CORRECTION_RISK_MD_OUT || '',
    learningDir: get('--learning-dir') || process.env.AGENT_CORRECTION_LEARNING_DIR || '',
    sku: get('--sku') || '',
    asin: get('--asin') || '',
    entityId: get('--entity-id') || '',
    keyword: get('--keyword') || '',
    surface: get('--surface') || '',
    severity: get('--severity') || '',
    operator: get('--operator') || get('--requested-by') || '',
    today: get('--today') || process.env.AGENT_TODAY || '',
    now: get('--now') || process.env.AGENT_NOW || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
  };
}

function correctionText(options = {}) {
  if (text(options.text)) return text(options.text);
  if (options.inputFile) return readText(path.isAbsolute(options.inputFile) ? options.inputFile : path.join(ROOT, options.inputFile));
  return '';
}

function runAgentCorrectionRisk(options = {}) {
  const rawText = correctionText(options);
  if (!rawText) throw new Error('correction text is required; pass --text or --file');
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `correction_risk_${Date.now()}`,
  });
  if (options.today) {
    timeContext.localDate = dateOnly(options.today);
    timeContext.businessDate = dateOnly(options.today);
  }
  const report = buildCorrectionRiskReport({
    text: rawText,
    subject: {
      sku: options.sku,
      asin: options.asin,
      keyword: options.keyword,
      entityId: options.entityId,
    },
    surface: options.surface,
    severity: options.severity,
    operator: options.operator,
    sourceRunId: options.sourceRunId || timeContext.sourceRunId,
  }, timeContext);
  return persistCorrectionRiskReport(report, {
    outFile: options.outFile,
    mdFile: options.mdFile,
    learningDir: options.learningDir,
  });
}

function main() {
  const options = parseArgs(process.argv);
  const report = runAgentCorrectionRisk(options);
  console.log(JSON.stringify({
    ok: true,
    businessDate: report.businessDate,
    summary: report.summary,
    files: report.files,
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
  runAgentCorrectionRisk,
};
