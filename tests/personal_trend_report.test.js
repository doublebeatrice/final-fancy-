const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateReport } = require('../scripts/execute/generate_personal_trend_report_v2');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function minimalSnapshot() {
  return {
    exportedAt: '2026-05-20T20:21:39.239Z',
    sellerSalesRows: [{
      seller_title: 'total',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
    productCards: [],
    adSkuSummaryRows: [],
  };
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-trend-report-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const taskFile = path.join(tmpDir, 'tasks.json');
  const outDir = path.join(tmpDir, 'daily');
  writeJson(snapshotFile, minimalSnapshot());
  writeJson(taskFile, {});

  const outFile = generateReport({
    inputFile: snapshotFile,
    taskFile,
    outDir,
    date: '2026-05-21',
  });

  assert.strictEqual(outFile, path.join(outDir, '2026-05-21.html'));
  assert.ok(fs.existsSync(outFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-trend-report-cli-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const outDir = path.join(tmpDir, 'daily');
  writeJson(snapshotFile, minimalSnapshot());

  const stdout = execFileSync(process.execPath, [
    path.join('scripts', 'execute', 'generate_personal_trend_report.js'),
    '--snapshot',
    snapshotFile,
    '--out-dir',
    outDir,
    '--date',
    '2026-05-21',
  ], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }).trim();

  assert.strictEqual(stdout, path.join(outDir, '2026-05-21.html'));
  assert.ok(fs.existsSync(stdout));
  assert.ok(!fs.existsSync(path.join(process.cwd(), '2026-05-21', '2026-05-21.html')));
}

console.log('personal_trend_report tests passed');
