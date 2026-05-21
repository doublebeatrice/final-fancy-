const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../scripts/execute/generate_kpi_approval_review');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-approval-review-'));
  const writeExecutionFile = path.join(tmpDir, 'write_execution.json');
  const actionSchemaFile = path.join(tmpDir, 'actions.json');
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const checkpointFile = path.join(tmpDir, 'checkpoint.json');
  const outFile = path.join(tmpDir, 'review.json');
  const markdownFile = path.join(tmpDir, 'review.md');

  writeJson(writeExecutionFile, {
    businessDate: '2026-05-20',
    dataDate: '2026-05-19',
    plan: {
      approvalNeeded: [
        { key: 'GOOD1::campaign::budget::c1::0' },
        { key: 'TIGHT1::campaign::budget::c2::1' },
        { key: 'BID1::keyword::bid::k1::2' },
        { key: 'BID1::keyword::bid::k2::3' },
        { key: 'BLOCK1::autoTarget::bid::a1::3' },
      ],
    },
  });
  writeJson(actionSchemaFile, [
    {
      sku: 'GOOD1',
      actions: [{
        entityType: 'campaign',
        actionType: 'budget',
        id: 'c1',
        campaignName: 'good campaign',
        currentBudget: 10,
        suggestedBudget: 12.5,
        evidence: [
          'campaign spend=50 sales=500 orders=12 clicks=80',
          'acos=10% profitRate=25%',
          'invDays=45 units7=10 units30=80',
        ],
      }],
    },
    {
      sku: 'TIGHT1',
      actions: [{
        entityType: 'campaign',
        actionType: 'budget',
        id: 'c2',
        campaignName: 'tight campaign',
        currentBudget: 10,
        suggestedBudget: 12.5,
        evidence: [
          'campaign spend=50 sales=500 orders=12 clicks=80',
          'acos=10% profitRate=25%',
          'invDays=12 units7=10 units30=80',
        ],
      }],
    },
    {
      sku: 'BID1',
      actions: [{
        entityType: 'keyword',
        actionType: 'bid',
        id: 'k1',
        campaignName: 'new keyword',
        currentBid: 0.3,
        suggestedBid: 0.35,
        evidence: [
          'ageDays=36',
          'invDays=60',
          'units7d=3',
          'spend7d=1.5',
        ],
      }, {
        entityType: 'keyword',
        actionType: 'bid',
        id: 'k2',
        campaignName: 'new keyword',
        currentBid: 0.3,
        suggestedBid: 0.35,
        evidence: [
          'ageDays=36',
          'invDays=60',
          'units7d=3',
          'spend7d=1.5',
        ],
      }],
    },
    {
      sku: 'BLOCK1',
      actions: [{
        entityType: 'autoTarget',
        actionType: 'bid',
        id: 'a1',
        campaignName: 'low delivery auto',
        currentBid: 0.3,
        suggestedBid: 0.35,
        evidence: [
          'ageDays=44',
          'invDays=20',
          'units7d=0',
          'spend7d=0.5',
        ],
      }],
    },
  ]);
  writeJson(snapshotFile, { productCards: [] });
  writeJson(checkpointFile, { businessDate: '2026-05-20', dataDate: '2026-05-19' });

  const result = run({
    date: '2026-05-21',
    writeExecutionFile,
    actionSchemaFile,
    snapshotFile,
    kpiCheckpointFile: checkpointFile,
    outFile,
    markdownFile,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.total, 5);
  assert.strictEqual(result.summary.recommendApprove, 1);
  assert.strictEqual(result.summary.hold, 1);
  assert.strictEqual(result.summary.approvalNeeded, 2);
  assert.strictEqual(result.summary.blocked, 1);
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(report.items.find(item => item.sku === 'GOOD1').decision, 'recommend_approve');
  assert.strictEqual(report.items.find(item => item.sku === 'TIGHT1').decision, 'hold');
  assert.strictEqual(report.items.find(item => item.sku === 'BID1').decision, 'approval_needed');
  assert.strictEqual(report.items.find(item => item.sku === 'BLOCK1').decision, 'blocked');
  const markdown = fs.readFileSync(markdownFile, 'utf8');
  assert.ok(markdown.includes('## recommend_approve'));
  assert.ok(markdown.includes('GOOD1'));
  assert.ok(markdown.includes('new keyword [k1]'));
  assert.ok(markdown.includes('new keyword [k2]'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-approval-schema-fallback-'));
  const writeExecutionFile = path.join(tmpDir, 'write_execution.json');
  const actionSchemaFile = path.join(tmpDir, 'actions.json');
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const checkpointFile = path.join(tmpDir, 'checkpoint.json');
  const outFile = path.join(tmpDir, 'review.json');
  const markdownFile = path.join(tmpDir, 'review.md');

  writeJson(writeExecutionFile, {
    businessDate: '2026-05-20',
    plan: { approvalNeeded: [] },
  });
  writeJson(actionSchemaFile, [{
    sku: 'KZ5816',
    actions: [{
      entityType: 'campaign',
      actionType: 'budget',
      id: '128136203487216',
      campaignName: 'asin_vip party_kz5816',
      currentBudget: 5.44,
      suggestedBudget: 6.8,
      evidence: [
        'campaign spend=40.97 sales=181.39 orders=21 clicks=92',
        'acos=22.6% profitRate=26.0%',
        'invDays=30 units7=60 units30=295',
      ],
    }],
  }]);
  writeJson(snapshotFile, { productCards: [] });
  writeJson(checkpointFile, { businessDate: '2026-05-20', dataDate: '2026-05-19' });

  const result = run({
    date: '2026-05-21',
    writeExecutionFile,
    actionSchemaFile,
    snapshotFile,
    kpiCheckpointFile: checkpointFile,
    outFile,
    markdownFile,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.total, 1);
  assert.strictEqual(result.summary.recommendApprove, 1);
  const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(report.items[0].sku, 'KZ5816');
  assert.strictEqual(report.items[0].decision, 'recommend_approve');
  assert.ok(fs.readFileSync(markdownFile, 'utf8').includes('asin_vip party_kz5816'));
}

console.log('kpi_approval_review tests passed');
