const fs = require('fs');
const path = require('path');
const { dedupeAdjustmentRecords } = require('../../src/adjustment_log');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function parseArgs(argv = []) {
  const file = argv.find(arg => !arg.startsWith('--')) || '';
  if (!file) throw new Error('Usage: node scripts/execute/dedupe_adjustment_log.js <adjustments_YYYY-MM-DD.json> [--write]');
  return {
    file,
    write: argv.includes('--write'),
  };
}

function summarize(records = [], deduped = {}) {
  return {
    before: records.length,
    after: deduped.records?.length || 0,
    removed: deduped.removed || 0,
    dryRunRemoved: deduped.dryRunRemoved || 0,
    liveRemoved: deduped.liveRemoved || 0,
  };
}

function run(options = {}) {
  const file = path.resolve(options.file || '');
  const records = readJson(file, null);
  if (!Array.isArray(records)) throw new Error(`adjustment log must be a JSON array: ${file}`);
  const deduped = dedupeAdjustmentRecords(records);
  const summary = summarize(records, deduped);
  const result = {
    file,
    mode: options.write ? 'write' : 'dry-run',
    summary,
    backupFile: '',
  };
  if (options.write && summary.removed > 0) {
    const backupFile = `${file}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, backupFile, fs.constants.COPYFILE_EXCL);
    writeJson(file, deduped.records);
    result.backupFile = backupFile;
  }
  return result;
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  run,
  summarize,
};
