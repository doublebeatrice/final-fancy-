const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { auditLandedActionConflicts, markdownReport } = require('../scripts/execute/audit_landed_action_conflicts');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landed-action-conflict-'));
  const adjustmentsFile = path.join(tmpDir, 'adjustments_2026-05-20.json');
  writeJson(adjustmentsFile, [
    {
      sku: 'SKU1',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T01:00:00.000Z',
      sourceRunId: 'run-a',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-1',
      entityName: 'same keyword',
      beforeValue: 0.2,
      afterValue: 0.24,
      direction: 'up',
      outcome: 'success',
      dryRun: false,
    },
    {
      sku: 'SKU1',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T02:00:00.000Z',
      sourceRunId: 'run-b',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-1',
      entityName: 'same keyword',
      beforeValue: 0.24,
      afterValue: 0.19,
      direction: 'down',
      outcome: 'success',
      dryRun: false,
    },
    {
      sku: 'SKU2',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T03:00:00.000Z',
      sourceRunId: 'run-b',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-2a',
      entityName: 'same name different ids',
      beforeValue: 0.3,
      afterValue: 0.34,
      direction: 'up',
      outcome: 'success',
      dryRun: false,
    },
    {
      sku: 'SKU2',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T03:05:00.000Z',
      sourceRunId: 'run-b',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-2b',
      entityName: 'same name different ids',
      beforeValue: 0.3,
      afterValue: 0.24,
      direction: 'down',
      outcome: 'success',
      dryRun: false,
    },
    {
      sku: 'DRY',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T04:00:00.000Z',
      sourceRunId: 'dry-run',
      entityType: 'keyword',
      entityId: 'dry-1',
      entityName: 'dry row',
      direction: 'up',
      dryRun: true,
    },
    {
      sku: 'OLD',
      businessDate: '2026-05-19',
      runAt: '2026-05-19T04:00:00.000Z',
      sourceRunId: 'old-run',
      entityType: 'keyword',
      entityId: 'old-1',
      entityName: 'old row',
      direction: 'down',
      dryRun: false,
    },
  ]);

  const report = auditLandedActionConflicts({ date: '2026-05-20', adjustmentsFile });
  assert.strictEqual(report.summary.liveRows, 4);
  assert.strictEqual(report.summary.sameEntityReverseCount, 1);
  assert.strictEqual(report.summary.sameNameReverseDifferentEntityCount, 1);
  assert.strictEqual(report.summary.latestRunMixedSkuCount, 1);
  assert.strictEqual(report.summary.status, 'blocked_conflict');
  const md = markdownReport(report);
  assert.ok(md.includes('Blocking same-entity reverse conflicts'));
  assert.ok(md.includes('Same-name mixed direction review'));
  assert.ok(md.includes('SKU2'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landed-action-review-'));
  const adjustmentsFile = path.join(tmpDir, 'adjustments_2026-05-20.json');
  writeJson(adjustmentsFile, [
    {
      sku: 'SKU2',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T03:00:00.000Z',
      sourceRunId: 'run-b',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-2a',
      entityName: 'same name different ids',
      beforeValue: 0.3,
      afterValue: 0.34,
      direction: 'up',
      outcome: 'success',
      dryRun: false,
    },
    {
      sku: 'SKU2',
      businessDate: '2026-05-20',
      runAt: '2026-05-20T03:05:00.000Z',
      sourceRunId: 'run-b',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'kw-2b',
      entityName: 'same name different ids',
      beforeValue: 0.3,
      afterValue: 0.24,
      direction: 'down',
      outcome: 'success',
      dryRun: false,
    },
  ]);

  const report = auditLandedActionConflicts({ date: '2026-05-20', adjustmentsFile });
  assert.strictEqual(report.summary.sameEntityReverseCount, 0);
  assert.strictEqual(report.summary.sameNameReverseDifferentEntityCount, 1);
  assert.strictEqual(report.summary.status, 'review_needed');
}

console.log('landed_action_conflict_audit tests passed');
