const fs = require('fs');
const path = require('path');
const { runWecomWindowCapture } = require('./run_wecom_window_capture');
const { runWecomWindowOcr } = require('./run_wecom_window_ocr');
const { triageOcrResult } = require('../src/wecom_ocr_triage');

function dateOnly(value = new Date()) {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || path.join('data', 'agent'),
    processName: get('--process-name') || 'WXWork',
    today: get('--today') || dateOnly(),
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function runWecomWindowScan(options = {}) {
  const today = options.today || dateOnly();
  const captureFile = path.join(options.outDir || path.join('data', 'agent'), `wecom_window_capture_${today}.png`);
  const ocrFile = path.join(options.outDir || path.join('data', 'agent'), `wecom_window_ocr_${today}.json`);
  const triageFile = path.join(options.outDir || path.join('data', 'agent'), `wecom_window_triage_${today}.json`);
  const capture = runWecomWindowCapture({
    outDir: options.outDir,
    outFile: captureFile,
    processName: options.processName || 'WXWork',
  });
  if (!capture.ok || capture.likelyBlank) {
    const result = {
      ok: false,
      stage: 'capture',
      capture,
      ocrFile,
      triageFile,
    };
    writeJson(triageFile, result);
    return result;
  }
  const ocr = runWecomWindowOcr({ image: capture.outFile, outFile: ocrFile });
  const triage = triageOcrResult(ocr);
  const result = {
    ok: true,
    generatedAt: new Date().toISOString(),
    capture,
    ocrFile,
    triage,
  };
  writeJson(triageFile, result);
  return {
    ok: true,
    captureFile: capture.outFile,
    ocrFile,
    triageFile,
    category: triage.category,
    priority: triage.priority,
    detectedSubjects: triage.detectedSubjects,
    conversationCandidates: triage.conversationCandidates,
  };
}

function main() {
  const result = runWecomWindowScan(parseArgs(process.argv));
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
  runWecomWindowScan,
};
