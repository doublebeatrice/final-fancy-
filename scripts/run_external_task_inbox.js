const fs = require('fs');
const path = require('path');
const { buildExternalInbox } = require('../src/agent_external_inbox');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function readMarkdownItems(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith('.md'))
    .sort()
    .map(name => {
      const file = path.join(dir, name);
      return {
        text: readText(file),
        title: path.basename(name, path.extname(name)),
        requestDate: (name.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || '',
        attachments: [file],
      };
    });
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
    text: get('--text') || process.env.EXTERNAL_TASK_TEXT || '',
    inputFile: get('--file') || process.env.EXTERNAL_TASK_FILE || '',
    inputDir: get('--dir') || process.env.EXTERNAL_TASK_DIR || '',
    outFile: get('--out') || process.env.EXTERNAL_TASK_OUT || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    now: get('--now') || process.env.AGENT_NOW || '',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
  };
}

function splitInput(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function defaultOutFile(timeContext) {
  return path.join(DEFAULT_OUT_DIR, `external_inbox_${timeContext.businessDate}.json`);
}

function runExternalTaskInbox(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `external_inbox_${Date.now()}`,
  });
  const inputText = options.text || (options.inputFile ? readText(options.inputFile) : '');
  const items = options.items || (options.inputDir ? readMarkdownItems(options.inputDir) : splitInput(inputText));
  const inbox = buildExternalInbox(items, timeContext);
  const outFile = options.outFile || defaultOutFile(timeContext);
  writeJson(outFile, inbox);
  return inbox;
}

function main() {
  const options = parseArgs(process.argv);
  const inbox = runExternalTaskInbox(options);
  const outFile = options.outFile || defaultOutFile(inbox);
  console.log(JSON.stringify({
    ok: true,
    businessDate: inbox.businessDate,
    outFile,
    summary: inbox.summary,
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
  readMarkdownItems,
  runExternalTaskInbox,
  splitInput,
};
