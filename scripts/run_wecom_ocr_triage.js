const fs = require('fs');
const path = require('path');
const { triageOcrResult } = require('../src/wecom_ocr_triage');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    ocrFile: get('--ocr') || '',
    outFile: get('--out') || '',
  };
}

function runWecomOcrTriage(options = {}) {
  if (!options.ocrFile) throw new Error('missing --ocr');
  const ocr = JSON.parse(fs.readFileSync(options.ocrFile, 'utf8').replace(/^\uFEFF/, ''));
  const triage = triageOcrResult(ocr);
  if (options.outFile) {
    fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
    fs.writeFileSync(options.outFile, JSON.stringify(triage, null, 2), 'utf8');
  }
  return triage;
}

function main() {
  const result = runWecomOcrTriage(parseArgs(process.argv));
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
  runWecomOcrTriage,
};
