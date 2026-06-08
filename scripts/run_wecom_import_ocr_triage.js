const fs = require('fs');
const path = require('path');
const {
  appendMessageEvent,
  eventFromOcrTriage,
  loadConfig,
} = require('../src/wecom_gateway');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WECOM_GATEWAY_CONFIG || '',
    triageFile: get('--triage') || '',
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || '',
    today: get('--today') || '',
    force: args.includes('--force'),
  };
}

function shouldImport(triage = {}, options = {}) {
  if (options.force) return true;
  const subjects = triage.detectedSubjects || {};
  const hasSubject = Boolean((subjects.skus || []).length || (subjects.asins || []).length || (subjects.keywords || []).length);
  const isPriority = ['P0', 'P1'].includes(triage.priority);
  const isActionable = ['developer_product_inquiry', 'sentiment_or_exception_watch'].includes(triage.category);
  return isPriority || isActionable || hasSubject;
}

function runImportOcrTriage(options = {}) {
  if (!options.triageFile) throw new Error('missing --triage');
  const config = loadConfig(options.configFile);
  if (options.outDir) config.outDir = options.outDir;
  const raw = JSON.parse(fs.readFileSync(options.triageFile, 'utf8').replace(/^\uFEFF/, ''));
  const triage = raw.triage || raw;
  if (!shouldImport(triage, options)) {
    return {
      ok: true,
      imported: false,
      reason: 'no_trigger_signal',
      triageFile: options.triageFile,
      category: triage.category,
      priority: triage.priority,
    };
  }
  const event = eventFromOcrTriage(triage, {
    businessDate: options.today,
    operatorAliases: config.operatorAliases,
    sourceFile: options.triageFile,
    timezone: config.timezone,
  });
  const result = appendMessageEvent(event, {
    outDir: config.outDir,
    file: options.today ? path.join(config.outDir, `wecom_messages_${options.today}.json`) : '',
  });
  return {
    ok: true,
    imported: true,
    outFile: result.file,
    inserted: result.inserted,
    messageHash: event.messageHash,
    category: event.category,
    priority: event.priority,
    detectedSubjects: event.detectedSubjects,
  };
}

function main() {
  const result = runImportOcrTriage(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
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
  runImportOcrTriage,
  shouldImport,
};
