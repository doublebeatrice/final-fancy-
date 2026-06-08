const fs = require('fs');
const path = require('path');
const {
  appendFileItems,
  buildFilePrompt,
} = require('../src/wecom_file_inbox');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    file: get('--file') || '',
    dir: get('--dir') || '',
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || path.join('data', 'agent'),
    today: get('--today') || '',
    note: get('--note') || '',
    requestedBy: get('--requested-by') || '',
    promptOut: get('--prompt-out') || '',
  };
}

function collectFiles(options = {}) {
  const files = [];
  if (options.file) files.push(options.file);
  if (options.dir) {
    for (const name of fs.readdirSync(options.dir)) {
      const file = path.join(options.dir, name);
      if (fs.statSync(file).isFile()) files.push(file);
    }
  }
  return files;
}

function runWecomFileInbox(options = {}) {
  const files = collectFiles(options);
  if (!files.length) throw new Error('no files provided; use --file or --dir');
  const result = appendFileItems(files, options);
  const prompt = buildFilePrompt(result.inbox);
  const promptOut = options.promptOut || path.join(options.outDir || path.join('data', 'agent'), `wecom_file_prompt_${result.inbox.businessDate}.md`);
  fs.mkdirSync(path.dirname(promptOut), { recursive: true });
  fs.writeFileSync(promptOut, prompt, 'utf8');
  return { ...result, promptOut };
}

function main() {
  const result = runWecomFileInbox(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: true,
    outFile: result.outFile,
    promptOut: result.promptOut,
    summary: result.inbox.summary,
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
  collectFiles,
  parseArgs,
  runWecomFileInbox,
};
