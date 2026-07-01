const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  archiveSameDateRawCandidates,
  buildRawRecoveryQueue,
  classifyDailyDeposit,
  parseArgs,
} = require('../scripts/execute/inspect_daily_deposit');

function write(file, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function touch(file, date) {
  const timestamp = new Date(date);
  fs.utimesSync(file, timestamp, timestamp);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-status-'));
  const trendRoot = path.join(root, '黄成喆个人数据趋势');
  const rawRoot = path.join(trendRoot, '原数据', '原日数据');
  const rawDir = path.join(rawRoot, '5-20');
  write(path.join(rawDir, 'seller_sales_from_snapshot_2026-05-20.csv'), 'sku,sales\nA,1\n');
  write(path.join(rawDir, 'inv_auto_filtered_from_snapshot_2026-05-20.csv'), 'sku,inv\nA,1\n');
  write(path.join(rawDir, 'ad_sku_summary_from_snapshot_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, '每日 近七天 数据趋势', '2026-05-20.html'), '<html></html>');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [{ sku: 'A' }], sellerSalesRows: [{ seller_title: '所选编号汇总' }], adSkuSummaryRows: [{ sku: 'A' }] }));

  const status = classifyDailyDeposit('2026-05-20', { trendRoot, rawRoot, snapshotFile: snapshot, rawCandidateRoots: [] });
  assert.strictEqual(status.status, 'partial');
  assert.ok(status.missing.includes('sales_core_original_xlsx'));
  assert.ok(status.missing.includes('inventory_original_csv'));
  assert.ok(status.missing.includes('ad_full_original_csv'));
  assert.ok(status.suspicious.some(item => item.type === 'sales_core_is_snapshot_derived'));
  assert.ok(status.completed.includes('daily_html'));
  assert.strictEqual(status.sourceCounts.productCards, 1);

  const queue = buildRawRecoveryQueue(status);
  assert.strictEqual(queue.status, 'open');
  assert.strictEqual(queue.items.length, 3);
  assert.deepStrictEqual(queue.items.map(item => item.missingClass), [
    'sales_core_original_xlsx',
    'inventory_original_csv',
    'ad_full_original_csv',
  ]);
  assert.ok(queue.items.every(item => item.state === 'needs_redownload'));
  assert.ok(queue.items.every(item => item.completionCondition.includes(status.rawDir)));
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-candidates-'));
  const trendRoot = path.join(root, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  const downloadRoot = path.join(root, 'downloads');
  write(path.join(rawDir, 'seller_sales_from_snapshot_2026-05-20.csv'), 'sku,sales\nA,1\n');
  write(path.join(rawDir, 'inv_auto_filtered_from_snapshot_2026-05-20.csv'), 'sku,inv\nA,1\n');
  write(path.join(rawDir, 'ad_sku_summary_from_snapshot_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>');
  write(path.join(downloadRoot, 'table-export (21).xlsx'), 'xlsx');
  write(path.join(downloadRoot, 'inv_auto_filtered_2026-05-20-09-30-00.csv'), 'x'.repeat(1024 * 1024 + 1));
  write(path.join(downloadRoot, 'ad_sku_summary_30d_2026-05-20.csv'), 'sku,cost\nA,1\n');
  touch(path.join(downloadRoot, 'table-export (21).xlsx'), '2026-05-20T09:20:00');
  touch(path.join(downloadRoot, 'inv_auto_filtered_2026-05-20-09-30-00.csv'), '2026-05-20T09:30:00');
  touch(path.join(downloadRoot, 'ad_sku_summary_30d_2026-05-20.csv'), '2026-05-20T09:31:00');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', {
    trendRoot,
    rawRoot,
    snapshotFile: snapshot,
    rawCandidateRoots: [downloadRoot],
    rawCandidateDays: 1,
  });
  assert.strictEqual(status.status, 'partial');
  assert.deepStrictEqual(status.rawDownloadCandidates.rootsSearched, [downloadRoot]);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.sales_core_original_xlsx.length, 1);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.inventory_original_csv.length, 1);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.ad_full_original_csv.length, 1);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.inventory_original_csv[0].candidateDate, '2026-05-20');
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.inventory_original_csv[0].ageDays, 0);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.inventory_original_csv[0].sameDate, true);
  assert.strictEqual(status.rawDownloadCandidates.byMissingClass.inventory_original_csv[0].action, 'copy_to_daily_raw');
  assert.ok(status.notes.some(note => note.includes('Raw download candidates found')));

  const archive = archiveSameDateRawCandidates(status);
  assert.strictEqual(archive.copied.length, 3);
  assert.strictEqual(archive.skipped.length, 0);
  assert.ok(fs.existsSync(path.join(rawDir, 'table-export (21).xlsx')));
  assert.ok(fs.existsSync(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-30-00.csv')));
  assert.ok(fs.existsSync(path.join(rawDir, 'ad_sku_summary_30d_2026-05-20.csv')));

  const archivedStatus = classifyDailyDeposit('2026-05-20', {
    trendRoot,
    rawRoot,
    snapshotFile: snapshot,
    rawCandidateRoots: [downloadRoot],
    rawCandidateDays: 1,
  });
  assert.strictEqual(archivedStatus.status, 'complete');
  assert.deepStrictEqual(archivedStatus.missing, []);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-sales-api-'));
  const trendRoot = path.join(root, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  write(path.join(rawDir, 'seller_sales_core_7d_2026-05-20.csv'), 'sku,sales\nA,1\n');
  write(path.join(rawDir, 'seller_sales_core_7d_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-00-00.csv'), 'x'.repeat(1024 * 1024 + 1));
  write(path.join(rawDir, 'ad_sku_summary_30d_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', { trendRoot, rawRoot, snapshotFile: snapshot });
  assert.strictEqual(status.status, 'complete');
  assert.deepStrictEqual(status.missing, []);
  assert.deepStrictEqual(status.suspicious, []);
  assert.strictEqual(status.files.originalSalesCore.length, 1);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-valid-inventory-after-tiny-'));
  const trendRoot = path.join(root, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  write(path.join(rawDir, 'seller_sales_core_7d_2026-05-20.csv'), 'sku,sales\nA,1\n');
  write(path.join(rawDir, 'seller_sales_core_7d_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-00-00.csv'), 'tiny');
  write(path.join(rawDir, 'inv_auto_filtered_2026-05-20-10-00-00.csv'), 'x'.repeat(1024 * 1024 + 1));
  write(path.join(rawDir, 'ad_sku_summary_30d_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', { trendRoot, rawRoot, snapshotFile: snapshot });
  assert.strictEqual(status.status, 'complete');
  assert.deepStrictEqual(status.missing, []);
  assert.deepStrictEqual(status.suspicious, []);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-zero-sales-'));
  const trendRoot = path.join(root, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  write(
    path.join(rawDir, 'seller_sales_core_7d_2026-05-20.csv'),
    [
      'advCost,order_sales,gross_profit,net_profit,ACOS,refund_percent,sale_num,seller_title',
      '0,0,0,0,0.00,0,0,\u6240\u9009\u7f16\u53f7\u6c47\u603b',
    ].join('\n'),
  );
  write(path.join(rawDir, 'seller_sales_core_7d_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-00-00.csv'), 'x'.repeat(1024 * 1024 + 1));
  write(path.join(rawDir, 'ad_sku_summary_30d_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', { trendRoot, rawRoot, snapshotFile: snapshot });
  assert.strictEqual(status.status, 'partial');
  assert.deepStrictEqual(status.missing, []);
  assert.ok(status.suspicious.some(item => item.type === 'sales_core_original_zero_summary'));
  assert.strictEqual(status.rawRecoveryQueue.status, 'open');
  assert.strictEqual(status.rawRecoveryQueue.items.length, 1);
  assert.strictEqual(status.rawRecoveryQueue.items[0].missingClass, 'sales_core_original_xlsx');
  assert.deepStrictEqual(status.rawRecoveryQueue.items[0].issueTypes, ['sales_core_original_zero_summary']);
  assert.strictEqual(status.rawRecoveryQueue.items[0].state, 'suspicious_needs_redownload');
  assert.strictEqual(status.rawRecoveryQueue.summary.suspiciousRawOriginals, 1);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-stale-candidates-'));
  const trendRoot = path.join(root, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  const downloadRoot = path.join(root, 'downloads');
  write(path.join(rawDir, 'seller_sales_from_snapshot_2026-05-20.csv'), 'sku,sales\nA,1\n');
  write(path.join(rawDir, 'inv_auto_filtered_from_snapshot_2026-05-20.csv'), 'sku,inv\nA,1\n');
  write(path.join(rawDir, 'ad_sku_summary_from_snapshot_2026-05-20.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>');
  const staleInventory = path.join(downloadRoot, 'inv_auto_filtered_2026-05-16-09-24-30.csv');
  write(staleInventory, 'x'.repeat(1024 * 1024 + 1));
  touch(staleInventory, '2026-05-16T09:24:30');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', {
    trendRoot,
    rawRoot,
    snapshotFile: snapshot,
    rawCandidateRoots: [downloadRoot],
    rawCandidateDays: 7,
  });
  const candidate = status.rawDownloadCandidates.byMissingClass.inventory_original_csv[0];
  assert.strictEqual(candidate.candidateDate, '2026-05-16');
  assert.strictEqual(candidate.ageDays, 4);
  assert.strictEqual(candidate.sameDate, false);
  assert.strictEqual(candidate.action, 'reference_only_stale');
  assert.strictEqual(status.rawDownloadCandidates.sameDateTotal, 0);
  assert.strictEqual(status.rawDownloadCandidates.staleTotal, 1);

  const queue = buildRawRecoveryQueue(status);
  assert.strictEqual(queue.items.find(item => item.missingClass === 'inventory_original_csv').state, 'stale_candidate_review');
  assert.ok(queue.items.find(item => item.missingClass === 'inventory_original_csv').candidate.name.includes('inv_auto_filtered'));
}

{
  const parsed = parseArgs([
    'node',
    'inspect_daily_deposit.js',
    '--date',
    '2026-05-20',
    '--trend-root',
    'trend',
    '--raw-root',
    'raw',
    '--raw-candidate-roots',
    'D:\\chrome dl;D:\\Backup\\Downloads',
    '--raw-candidate-days',
    '3',
    '--raw-candidate-limit',
    '200',
    '--archive-candidates',
  ]);
  assert.strictEqual(parsed.date, '2026-05-20');
  assert.strictEqual(parsed.trendRoot, 'trend');
  assert.strictEqual(parsed.rawRoot, 'raw');
  assert.deepStrictEqual(parsed.rawCandidateRoots, ['D:\\chrome dl', 'D:\\Backup\\Downloads']);
  assert.strictEqual(parsed.rawCandidateDays, '3');
  assert.strictEqual(parsed.rawCandidateLimit, '200');
  assert.strictEqual(parsed.archiveCandidates, true);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-deposit-complete-'));
  const trendRoot = path.join(root, '黄成喆个人数据趋势');
  const rawRoot = path.join(trendRoot, '原数据', '原日数据');
  const rawDir = path.join(rawRoot, '5-20');
  write(path.join(rawDir, 'table-export (20).xlsx'), 'xlsx');
  write(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-00-00.csv'), 'x'.repeat(1024 * 1024 + 1));
  write(path.join(rawDir, '广告全盘导出_近30天_2026-05-20_09-00-00.csv'), 'sku,cost\nA,1\n');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}');
  write(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n');
  write(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}');
  write(path.join(trendRoot, '每日 近七天 数据趋势', '2026-05-20.html'), '<html></html>');
  const snapshot = path.join(root, 'snapshot_2026-05-20.json');
  write(snapshot, JSON.stringify({ productCards: [], sellerSalesRows: [], adSkuSummaryRows: [] }));

  const status = classifyDailyDeposit('2026-05-20', { trendRoot, rawRoot, snapshotFile: snapshot });
  assert.strictEqual(status.status, 'complete');
  assert.deepStrictEqual(status.missing, []);
  assert.deepStrictEqual(status.suspicious, []);
}

console.log('daily_deposit_status tests passed');
