const assert = require('assert');
const { getSnapshotStepPlan, writeTextFileWithRetry } = require('../scripts/run_today_ops');

{
  const plan = getSnapshotStepPlan({
    snapshotFileArg: 'data/snapshots/latest_snapshot.json',
    mode: 'fast',
  }, 'D:/ad-ops-workbench/data/snapshots/runs/run-1/snapshot_2026-05-14.json');

  assert.strictEqual(plan.shouldExport, false);
  assert.strictEqual(plan.reason, 'reuse_provided_snapshot');
  assert.strictEqual(plan.snapshotFile.endsWith('data\\snapshots\\latest_snapshot.json') || plan.snapshotFile.endsWith('data/snapshots/latest_snapshot.json'), true);
}

{
  const plan = getSnapshotStepPlan({
    snapshotFileArg: '',
    mode: 'fast',
  }, 'D:/ad-ops-workbench/data/snapshots/runs/run-1/snapshot_2026-05-14.json');

  assert.strictEqual(plan.shouldExport, true);
  assert.strictEqual(plan.reason, 'export_fresh_snapshot');
}

{
  let attempts = 0;
  const calls = [];
  writeTextFileWithRetry('virtual.json', '{}', {
    retries: 2,
    sleepMs: 0,
    writeFileSync: (file, text) => {
      calls.push({ file, text });
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("UNKNOWN: unknown error, open 'virtual.json'");
        error.code = 'UNKNOWN';
        throw error;
      }
    },
  });

  assert.strictEqual(attempts, 3);
  assert.strictEqual(calls.length, 3);
}

console.log('run_today_ops_snapshot.test.js passed');
