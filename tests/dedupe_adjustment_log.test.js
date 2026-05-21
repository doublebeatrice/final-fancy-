const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, run } = require('../scripts/execute/dedupe_adjustment_log');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const baseRecord = {
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

{
  const parsed = parseArgs(['data/adjustments/adjustments_2026-05-20.json', '--write']);
  assert.strictEqual(parsed.file, 'data/adjustments/adjustments_2026-05-20.json');
  assert.strictEqual(parsed.write, true);
}

{
  assert.throws(() => parseArgs([]), /Usage:/);
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-adjustment-log-'));
  const file = path.join(dir, 'adjustments_2026-05-20.json');
  writeJson(file, [
    baseRecord,
    { ...baseRecord, sourceRunId: 'dry-run-b', runAt: '2026-05-20T02:00:00.000Z' },
    { ...baseRecord, dryRun: false, outcome: 'success', sourceRunId: 'live-run-a' },
  ]);

  const dryRunResult = run({ file, write: false });
  assert.strictEqual(dryRunResult.mode, 'dry-run');
  assert.strictEqual(dryRunResult.summary.before, 3);
  assert.strictEqual(dryRunResult.summary.after, 2);
  assert.strictEqual(dryRunResult.summary.dryRunRemoved, 1);
  assert.strictEqual(dryRunResult.backupFile, '');
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).length, 3, 'dry-run must not mutate the source file');

  const writeResult = run({ file, write: true });
  assert.strictEqual(writeResult.mode, 'write');
  assert.strictEqual(writeResult.summary.removed, 1);
  assert.ok(path.basename(writeResult.backupFile).includes('.json.bak.'));
  assert.ok(fs.existsSync(writeResult.backupFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).length, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(writeResult.backupFile, 'utf8')).length, 3);

  const cleanResult = run({ file, write: false });
  assert.strictEqual(cleanResult.summary.removed, 0);
}

console.log('dedupe_adjustment_log tests passed');
