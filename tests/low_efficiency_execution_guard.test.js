const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  sameDayGuardedEntityIds,
} = require('../src/low_efficiency_execution_guard');
const {
  buildBackendLowEfficiencyPayload,
  lowEfficiencyTasks,
  mergeLowEfficiencyReports,
} = require('../scripts/execute/run_low_efficiency');

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

{
  const payload = buildBackendLowEfficiencyPayload(
    { kind: 'auto', property: '2', tableName: 'product_target' },
    7,
    { now: new Date('2026-06-08T12:00:00+08:00') }
  );
  assert.strictEqual(payload.lowCost, 2);
  assert.strictEqual(payload.isHigh, '2');
  assert.strictEqual(payload.coreMark, '0');
  assert.strictEqual(payload.publicAdv, '2');
  assert.strictEqual(payload.state, '1');
  assert.strictEqual(payload.property, '2');
  assert.strictEqual(payload.tableName, 'product_target');
  assert.deepStrictEqual(payload.filterArray, { campaignState: '1' });
  assert.deepStrictEqual(payload.selectDate, ['2026-06-02', '2026-06-08']);
}

{
  const tasks = lowEfficiencyTasks({ now: new Date('2026-06-08T12:00:00+08:00') });
  assert.strictEqual(tasks.length, 20);
  assert.ok(tasks.some(task => task.kind === 'kw' && task.days === 3));
  assert.ok(tasks.some(task => task.kind === 'sbTarget' && task.days === 30));
}

{
  const pools = mergeLowEfficiencyReports([{
    kind: 'kw',
    days: 7,
    payload: { property: '1' },
    rows: [{
      keywordId: 'k1',
      keywordText: 'bad term',
      Clicks: '12',
      Spend: '4.80',
      Orders: '0',
      bid: '0.50',
      campaignId: 'c1',
      adGroupId: 'g1',
    }],
  }, {
    kind: 'kw',
    days: 30,
    payload: { property: '1' },
    rows: [{
      keywordId: 'k1',
      keywordText: 'bad term',
      Clicks: '30',
      Spend: '12.00',
      Orders: '0',
      bid: '0.50',
    }],
  }]);
  assert.strictEqual(pools.kw.length, 1);
  assert.strictEqual(pools.kw[0].windows['7'].clicks, '12');
  assert.strictEqual(pools.kw[0].windows['30'].spend, '12.00');
}

console.log('low_efficiency_execution_guard tests passed');
