const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ADJUSTMENT_DIR = path.join(ROOT, 'data', 'adjustments');

function readJsonIfExists(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function sameDayGuardedEntityIds(businessDate, options = {}) {
  const dir = options.dir || DEFAULT_ADJUSTMENT_DIR;
  const file = options.file || path.join(dir, `adjustments_${businessDate}.json`);
  const rows = readJsonIfExists(file, []);
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows
    .filter(row => row && row.businessDate === businessDate)
    .filter(row => row.dryRun !== true)
    .filter(row => {
      if (['success', 'api_success'].includes(row.outcome)) return true;
      return row.outcome === 'api_failed';
    })
    .map(row => String(row.entityId || row.action?.id || row.id || '').trim())
    .filter(Boolean));
}

module.exports = {
  sameDayGuardedEntityIds,
};
