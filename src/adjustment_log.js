const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ADJUSTMENT_DIR = path.join(ROOT, 'data', 'adjustments');
const LEGACY_HISTORY_FILE = path.join(ROOT, 'data', 'adjustment_history.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function dailyLogFile(businessDate, dir = ADJUSTMENT_DIR) {
  return path.join(dir, `adjustments_${businessDate}.json`);
}

function normalizeValue(value) {
  if (value === undefined) return null;
  return value;
}

function inferBeforeAfter(action = {}) {
  if (action.actionType === 'bid') return [action.currentBid, action.suggestedBid];
  if (action.actionType === 'budget') return [action.currentBudget, action.suggestedBudget];
  if (action.actionType === 'placement') return [action.currentPlacementPercent, action.suggestedPlacementPercent];
  if (action.actionType === 'pause') return [action.currentState || action.state || 'enabled', 'paused'];
  if (action.actionType === 'enable') return [action.currentState || action.state || 'paused', 'enabled'];
  if (action.actionType === 'create') return [null, action.createInput || action.expected || 'created'];
  if (action.actionType === 'note') return [action.beforeValue || null, action.afterValue || action.note || 'note_appended'];
  return [action.beforeValue, action.afterValue];
}

function normalizeAdjustmentRecord(input = {}, timeContext = {}) {
  const action = input.action || input;
  const [beforeValue, afterValue] = inferBeforeAfter(action);
  return {
    sku: String(input.sku || action.sku || '').trim(),
    asin: String(input.asin || action.asin || action.createInput?.asin || '').trim(),
    site: String(input.site || action.site || action.salesChannel || action.createInput?.site || '').trim() || 'Amazon.com',
    actionType: String(input.actionType || action.actionType || '').trim(),
    entityType: String(input.entityType || action.entityType || '').trim(),
    entityId: String(input.entityId || input.id || action.entityId || action.id || '').trim(),
    entityName: String(input.entityName || action.entityName || action.campaignName || action.groupName || action.label || action.text || '').trim(),
    beforeValue: normalizeValue(input.beforeValue !== undefined ? input.beforeValue : beforeValue),
    afterValue: normalizeValue(input.afterValue !== undefined ? input.afterValue : afterValue),
    reason: String(input.reason || action.reason || input.errorReason || '').trim(),
    runAt: input.runAt || action.runAt || timeContext.runAt,
    businessDate: input.businessDate || action.businessDate || timeContext.businessDate,
    dataDate: input.dataDate || action.dataDate || timeContext.dataDate,
    siteTimezone: input.siteTimezone || action.siteTimezone || timeContext.siteTimezone,
    sourceRunId: input.sourceRunId || action.sourceRunId || timeContext.sourceRunId,
    lastAdjustedAt: input.lastAdjustedAt || action.lastAdjustedAt || null,
    direction: input.direction || action.direction || '',
    outcome: input.outcome || input.finalStatus || input.apiStatus || action.outcome || '',
    dryRun: input.dryRun === true,
    meta: input.meta || {},
  };
}

function readAdjustmentLog(options = {}) {
  const file = options.file || (options.businessDate ? dailyLogFile(options.businessDate, options.dir || ADJUSTMENT_DIR) : LEGACY_HISTORY_FILE);
  return readJson(file, []);
}

function appendAdjustmentRecords(records = [], options = {}) {
  const normalized = records
    .map(record => normalizeAdjustmentRecord(record, options.timeContext || {}))
    .filter(record => record.sku && record.actionType && record.entityType && record.runAt && record.businessDate && record.sourceRunId);
  if (!normalized.length) return { file: '', count: 0, records: [] };
  const file = options.file || dailyLogFile(normalized[0].businessDate, options.dir || ADJUSTMENT_DIR);
  const current = readJson(file, []);
  writeJson(file, [...current, ...normalized]);
  return { file, count: normalized.length, records: normalized };
}

function recordsFromPlan(plan = [], timeContext = {}, options = {}) {
  const records = [];
  for (const item of plan || []) {
    for (const action of item.actions || []) {
      records.push(normalizeAdjustmentRecord({
        sku: item.sku,
        asin: item.asin,
        site: item.site || item.salesChannel || 'Amazon.com',
        action: { ...action, sku: item.sku },
        outcome: options.outcome || (options.dryRun ? 'dry_run_planned' : ''),
        dryRun: options.dryRun === true,
      }, timeContext));
    }
  }
  return records;
}

function recordsFromExecutionEvents(events = [], timeContext = {}, options = {}) {
  return (events || []).map(event => normalizeAdjustmentRecord({
    sku: event.sku,
    asin: event.asin || event.action?.asin,
    site: event.site || 'Amazon.com',
    action: event.action || event,
    outcome: event.finalStatus || event.apiStatus || options.outcome || '',
    dryRun: options.dryRun === true,
    reason: event.errorReason || event.resultMessage || event.action?.reason || '',
    meta: { apiStatus: event.apiStatus || '', finalStatus: event.finalStatus || '' },
  }, timeContext));
}

function findLastAdjustment(records = [], sku, options = {}) {
  const normalizedSku = String(sku || '').trim();
  const actionType = options.actionType || '';
  const direction = options.direction || '';
  return (records || [])
    .filter(record => String(record.sku || '').trim() === normalizedSku)
    .filter(record => !actionType || record.actionType === actionType)
    .filter(record => !direction || record.direction === direction)
    .sort((a, b) => String(b.runAt || '').localeCompare(String(a.runAt || '')))[0] || null;
}

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / 86400000);
}

module.exports = {
  ADJUSTMENT_DIR,
  appendAdjustmentRecords,
  dailyLogFile,
  daysBetween,
  findLastAdjustment,
  normalizeAdjustmentRecord,
  readAdjustmentLog,
  recordsFromExecutionEvents,
  recordsFromPlan,
};
