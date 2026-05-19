const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildActionQuality,
  buildFetchOptions,
  buildRunQuality,
  buildRunSummary,
  buildSnapshotDataQuality,
  getSnapshotStepPlan,
  parseArgs,
  validateSnapshotFile,
  writeTextFileWithRetry,
} = require('../scripts/run_today_ops');

{
  const options = parseArgs(['node', 'scripts/run_today_ops.js', '--execute', '--mode', 'full-snapshot']);
  assert.strictEqual(options.execute, true);
  assert.strictEqual(options.dryRun, false);
  assert.strictEqual(options.operationMode, 'execute');
  assert.strictEqual(options.mode, 'full-snapshot', 'execute must not replace requested snapshot mode');
}

{
  const options = buildFetchOptions({ mode: 'full-snapshot', actionSchemaFile: '' });
  assert.strictEqual(options.mode, 'full-snapshot');
  assert.strictEqual(options.listingStrategy, 'all');
  assert.strictEqual(options.listingLimit, 0, 'full snapshot should not silently cap listing fetches at 120');
}

{
  const snapshotFile = path.join(os.tmpdir(), `run_today_ops_snapshot_${Date.now()}.json`);
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'SKU-1', asin: 'B000000001' }, { sku: 'SKU-2', asin: 'B000000002' }],
    kwRows: [],
    autoRows: [],
    targetRows: [],
    productAdRows: [],
    sbRows: [],
    sellerSalesRows: [],
    invMap: {},
    listingFetchMeta: { attempted: 2, success: 0, skipped: 2, maxListings: 0, listingStrategy: 'all' },
  }), 'utf8');

  const checked = validateSnapshotFile(snapshotFile);
  assert.strictEqual(checked.ok, true);
  assert.strictEqual(checked.counts.productCards, 2);
  assert.strictEqual(checked.counts.adRowsTotal, 0);
  assert.strictEqual(checked.counts.sellerSalesRows, 0);
  assert.strictEqual(checked.counts.listingFetchAttempted, 2);

  const quality = buildSnapshotDataQuality(checked.snapshot, { mode: 'full-snapshot', listingStrategy: 'all', listingLimit: 0 });
  assert.strictEqual(quality.baselineQuality, 'incomplete');
  assert.ok(quality.warnings.includes('ads_rows_missing'));
  assert.ok(quality.warnings.includes('seller_sales_rows_missing'));
  assert.ok(quality.warnings.includes('listing_coverage_low'));

  fs.unlinkSync(snapshotFile);
}

{
  const manifest = {
    status: 'success',
    operationMode: 'dry-run',
    dataQuality: { baselineQuality: 'warning', warnings: ['listing_coverage_low'] },
    schemaValidation: { planActionCount: 0, executableSkus: 0, errorCount: 0 },
    steps: [{ name: 'execute_verify_note', status: 'skipped' }],
  };
  const actionQuality = buildActionQuality(manifest, { execute: false });
  assert.strictEqual(actionQuality.status, 'no_action_plan');
  assert.ok(actionQuality.warnings.includes('no_planned_actions'));
  assert.ok(actionQuality.warnings.includes('execution_skipped'));

  const runQuality = buildRunQuality(manifest, { execute: false });
  assert.strictEqual(runQuality.status, 'needs_attention');
  assert.strictEqual(runQuality.dataQuality, 'warning');
  assert.strictEqual(runQuality.actionQuality, 'no_action_plan');
}

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

{
  const summary = buildRunSummary({
    mode: 'fast',
    runId: 'run-1',
    time: { businessDate: '2026-05-15' },
    startedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    outputFiles: {
      seasonTitleListingCopyDryRunJson: 'data/snapshots/listing_copy_edit_dry_run_2026-05-15.json',
    },
    seasonTitleListingApplications: { built: 2, skipped: 1 },
    seasonTitleListingCopyDryRun: { total: 2, valid: 1, invalid: 1, warnings: 0 },
  });

  assert.deepStrictEqual(summary.seasonTitleListingApplications, { built: 2, skipped: 1 });
  assert.deepStrictEqual(summary.seasonTitleListingCopyDryRun, { total: 2, valid: 1, invalid: 1, warnings: 0 });
  assert.strictEqual(
    summary.outputFiles.seasonTitleListingCopyDryRunJson,
    'data/snapshots/listing_copy_edit_dry_run_2026-05-15.json'
  );
}

console.log('run_today_ops_snapshot.test.js passed');
