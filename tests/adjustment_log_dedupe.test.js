const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendAdjustmentRecords, dedupeAdjustmentRecords } = require('../src/adjustment_log');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adjustment-log-dedupe-'));
const file = path.join(dir, 'adjustments_2026-05-20.json');

const dryRecord = {
  sku: 'SKU1',
  asin: 'ASIN1',
  actionType: 'bid',
  entityType: 'keyword',
  entityId: 'kw1',
  beforeValue: 0.2,
  afterValue: 0.18,
  outcome: 'dry_run_planned',
  dryRun: true,
  runAt: '2026-05-20T01:00:00.000Z',
  businessDate: '2026-05-20',
  sourceRunId: 'dry-run-a',
};

const first = appendAdjustmentRecords([dryRecord], { file });
const second = appendAdjustmentRecords([
  {
    ...dryRecord,
    runAt: '2026-05-20T02:00:00.000Z',
    sourceRunId: 'dry-run-b',
  },
], { file });
assert.strictEqual(first.count, 1);
assert.strictEqual(second.count, 0, 'same-day duplicate dry-run plan must not bloat the adjustment ledger');
assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);

const liveA = appendAdjustmentRecords([
  {
    ...dryRecord,
    dryRun: false,
    outcome: 'success',
    sourceRunId: 'live-run-a',
  },
], { file });
const liveB = appendAdjustmentRecords([
  {
    ...dryRecord,
    dryRun: false,
    outcome: 'success',
    sourceRunId: 'live-run-b',
  },
], { file });
assert.strictEqual(liveA.count, 1);
assert.strictEqual(liveB.count, 1, 'different live runs should remain auditable');

const liveRepeat = appendAdjustmentRecords([
  {
    ...dryRecord,
    dryRun: false,
    outcome: 'success',
    sourceRunId: 'live-run-b',
  },
], { file });
assert.strictEqual(liveRepeat.count, 0, 'same live run should not duplicate the same action');
assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).length, 3);

const existing = dedupeAdjustmentRecords([
  dryRecord,
  { ...dryRecord, sourceRunId: 'dry-run-c', runAt: '2026-05-20T03:00:00.000Z' },
  { ...dryRecord, dryRun: false, outcome: 'success', sourceRunId: 'live-run-a' },
  { ...dryRecord, dryRun: false, outcome: 'success', sourceRunId: 'live-run-a' },
  { ...dryRecord, dryRun: false, outcome: 'success', sourceRunId: 'live-run-c' },
]);
assert.strictEqual(existing.records.length, 3);
assert.strictEqual(existing.removed, 2);
assert.strictEqual(existing.dryRunRemoved, 1);
assert.strictEqual(existing.liveRemoved, 1);

console.log('adjustment_log_dedupe tests passed');
