const childProcess = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    image: get('--image') || '',
    outFile: get('--out') || '',
    language: get('--language') || 'zh-Hans-CN',
  };
}

function runWecomWindowOcr(options = {}) {
  if (!options.image) throw new Error('missing --image');
  const script = path.join(__dirname, 'run_wecom_window_ocr.ps1');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-Image',
    options.image,
    '-Language',
    options.language || 'zh-Hans-CN',
  ];
  if (options.outFile) args.push('-OutFile', options.outFile);
  const output = childProcess.execFileSync('powershell', args, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function main() {
  const result = runWecomWindowOcr(parseArgs(process.argv));
  console.log(JSON.stringify({
    ok: result.ok,
    image: result.image,
    language: result.language,
    lineCount: result.lineCount,
    textPreview: String(result.text || '').slice(0, 500),
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stderr || error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  runWecomWindowOcr,
};
