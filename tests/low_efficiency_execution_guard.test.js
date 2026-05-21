const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  sameDayGuardedEntityIds,
} = require('../src/low_efficiency_execution_guard');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'low-eff-guard-'));
  writeJson(path.join(dir, 'adjustments_2026-05-20.json'), [
    { businessDate: '2026-05-20', dryRun: false, outcome: 'api_success', entityId: 'success-id' },
    { businessDate: '2026-05-20', dryRun: false, outcome: 'success', action: { id: 'action-id' } },
    { businessDate: '2026-05-20', dryRun: false, outcome: 'api_failed', entityId: 'failed-id' },
    { businessDate: '2026-05-20', dryRun: true, outcome: 'api_success', entityId: 'dry-run-id' },
    { businessDate: '2026-05-19', dryRun: false, outcome: 'api_success', entityId: 'other-day-id' },
    { businessDate: '2026-05-20', dryRun: false, outcome: 'manual_review', entityId: 'manual-id' },
  ]);

  const ids = sameDayGuardedEntityIds('2026-05-20', { dir });
  assert.strictEqual(ids.has('success-id'), true);
  assert.strictEqual(ids.has('action-id'), true);
  assert.strictEqual(ids.has('failed-id'), true);
  assert.strictEqual(ids.has('dry-run-id'), false);
  assert.strictEqual(ids.has('other-day-id'), false);
  assert.strictEqual(ids.has('manual-id'), false);
}

console.log('low_efficiency_execution_guard tests passed');
