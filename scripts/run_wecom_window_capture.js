const childProcess = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || path.join('data', 'agent'),
    outFile: get('--out') || '',
    processName: get('--process-name') || 'WXWork',
  };
}

function runWecomWindowCapture(options = {}) {
  const script = path.join(__dirname, 'run_wecom_window_capture.ps1');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-OutDir',
    options.outDir || path.join('data', 'agent'),
    '-ProcessName',
    options.processName || 'WXWork',
  ];
  if (options.outFile) args.push('-OutFile', options.outFile);
  const output = childProcess.execFileSync('powershell', args, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function main() {
  const result = runWecomWindowCapture(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
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
  runWecomWindowCapture,
};
