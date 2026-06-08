const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildActionQuality,
  buildFetchOptions,
  buildKpiRecoveryOverBudgetSchema,
  buildOperatingClosure,
  buildProactiveRecoveryActionSchema,
  buildRunQuality,
  buildRunSummary,
  buildSnapshotDataQuality,
  countSchemaActions,
  dailyTaskPoolToAgentTasks,
  getSnapshotStepPlan,
  mergeActionSchemas,
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
  const options = parseArgs([
    'node',
    'scripts/run_today_ops.js',
    '--business-date',
    '2026-06-03',
    '--data-date',
    '2026-06-02',
  ]);
  assert.strictEqual(options.businessDate, '2026-06-03');
  assert.strictEqual(options.dataDate, '2026-06-02');
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
  const manifest = {
    status: 'success',
    operationMode: 'dry-run',
    dataQuality: { baselineQuality: 'complete', warnings: [] },
    schemaValidation: { planActionCount: 0, executableSkus: 0, errorCount: 0 },
    overBudgetCoverage: { actionableCampaigns: 12 },
    lowEfficiencyPools: { actionableRows: 5 },
    proactiveOperatingAudit: { priceActions: 3 },
    steps: [{ name: 'execute_verify_note', status: 'skipped' }],
  };
  manifest.operatingClosure = buildOperatingClosure(manifest);
  const actionQuality = buildActionQuality(manifest, { execute: false });
  assert.strictEqual(actionQuality.status, 'blocked');
  assert.strictEqual(actionQuality.mandatoryDailyClosure.openCount, 20);
  assert.ok(actionQuality.warnings.includes('mandatory_daily_closure_not_landed'));
  assert.ok(actionQuality.warnings.includes('low_efficiency_not_landed'));
  assert.ok(actionQuality.warnings.includes('over_budget_not_landed'));
  assert.ok(actionQuality.warnings.includes('price_not_landed'));
}

{
  const manifest = {
    status: 'success',
    operationMode: 'execute',
    dataQuality: { baselineQuality: 'complete', warnings: [] },
    schemaValidation: { planActionCount: 20, executableSkus: 4, errorCount: 0 },
    overBudgetCoverage: { actionableCampaigns: 12 },
    lowEfficiencyPools: { actionableRows: 5 },
    proactiveOperatingAudit: { priceActions: 3 },
    steps: [{ name: 'execute_verify_note', status: 'success' }],
  };
  manifest.operatingClosure = buildOperatingClosure(manifest);
  const actionQuality = buildActionQuality(manifest, { execute: true });
  assert.strictEqual(actionQuality.status, 'executed');
  assert.strictEqual(actionQuality.mandatoryDailyClosure.resolved, false);
  assert.ok(actionQuality.warnings.includes('mandatory_daily_closure_not_landed'));
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
  const tasks = dailyTaskPoolToAgentTasks({
    candidateContexts: [{
      sku: 'AGENT1',
      asin: 'B0AGENT1',
      deterministicPriorityHint: 95,
      possibleSignals: [
        { type: 'profit_bleeding', reason: '7d spend with zero orders' },
        { type: 'stale_inventory_risk', reason: '180 sellable days' },
      ],
      dataMissing: [],
      facts: { sales: { units30d: 0 }, inventory: { sellableDays: 180 } },
    }],
  });

  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].source, 'daily_ops');
  assert.strictEqual(tasks[0].kind, 'profit_bleeding');
  assert.strictEqual(tasks[0].subject.sku, 'AGENT1');
  assert.ok(tasks[0].evidence.includes('7d spend with zero orders'));
}

{
  const audit = {
    newProductLaunch: {
      summary: { total: 1 },
      items: [{
        sku: 'ARRIVE1',
        asin: 'B0ARRIVE001',
        issue: 'new_product_existing_structure_low_delivery',
        ageDays: 3,
        invDays: 120,
        units7d: 0,
        spend7d: 0,
      }],
    },
    arrivalAdRecovery: {
      summary: { total: 1 },
      items: [{
        sku: 'ARRIVE1',
        asin: 'B0ARRIVE001',
        issue: 'arrived_inventory_ads_have_no_effective_delivery',
        requiredAction: 'reopen_or_scale_existing_ads',
      }],
    },
  };
  const snapshot = {
    productCards: [{
      sku: 'ARRIVE1',
      asin: 'B0ARRIVE001',
      campaigns: [{
        campaignId: 'camp-1',
        adGroupId: 'group-1',
        campaignState: 'enabled',
        groupState: 'enabled',
        keywords: [{
          id: 'kw-1',
          bid: 0.3,
          state: 'enabled',
          text: 'arrival term',
          stats7d: { impressions: 5, clicks: 0, spend: 0, orders: 0 },
        }],
      }],
    }],
  };

  const proactiveSchema = buildProactiveRecoveryActionSchema(audit, snapshot, { reviewLimit: 10 });
  const counts = countSchemaActions(proactiveSchema);
  assert.strictEqual(counts.skus, 1);
  assert.ok(counts.actions >= 2, 'arrival recovery must not remain audit-only');
  assert.ok(
    proactiveSchema[0].actions.some(action => action.riskLevel === 'new_product_low_delivery_bid_up'),
    'low-delivery arrival items should generate a controlled bid repair when a reusable row exists'
  );
  assert.ok(
    proactiveSchema[0].actions.some(action => action.id === 'review::ARRIVE1::arrival_ad_recovery'),
    'arrival recovery should also stay explicit as a repair item'
  );
}

{
  const merged = mergeActionSchemas([
    [{ sku: 'SKU1', asin: 'B000000001', actions: [{ id: 'a', actionType: 'bid' }] }],
    [{ sku: 'SKU1', asin: 'B000000001', actions: [{ id: 'b', actionType: 'review' }] }],
  ]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].actions.length, 2);
  assert.deepStrictEqual(countSchemaActions(merged), {
    skus: 1,
    actions: 2,
    executableActions: 1,
    reviewActions: 1,
  });
}

{
  const audit = {
    newProductLaunch: {
      summary: { total: 1 },
      items: [{
        sku: 'ROWBACK1',
        asin: 'B0ROWBACK1',
        issue: 'new_product_existing_structure_low_delivery',
        ageDays: 4,
        invDays: 99,
        units7d: 0,
        spend7d: 0,
      }],
    },
    arrivalAdRecovery: { summary: { total: 0 }, items: [] },
  };
  const snapshot = {
    productCards: [{ sku: 'ROWBACK1', asin: 'B0ROWBACK1' }],
    productAdRows: [{
      sku: 'ROWBACK1',
      campaignId: 'camp-row',
      adGroupId: 'group-row',
    }],
    kwRows: [{
      campaignId: 'camp-row',
      adGroupId: 'group-row',
      campaignName: 'rowback phrase',
      groupName: 'rowback phrase',
      campaignState: 1,
      groupState: 1,
      keywordId: 'kw-row',
      keywordText: 'rowback arrival term',
      state: 1,
      bid: 0.3,
      Impressions: '4',
      Clicks: '0',
      Spend: '0.00',
      Orders: '0',
    }],
  };
  const schema = buildProactiveRecoveryActionSchema(audit, snapshot, { reviewLimit: 10 });
  const actions = schema.flatMap(item => item.actions || []);
  assert.ok(
    actions.some(action => action.id === 'kw-row' && action.riskLevel === 'new_product_low_delivery_bid_up'),
    'proactive action builder should use snapshot kwRows when productCards do not embed campaigns'
  );
}

{
  const snapshot = {
    productCards: [{
      sku: 'KPI1',
      asin: 'B0KPI1',
      profitRate: 0.22,
      invDays: 60,
      unitsSold_7d: 12,
      unitsSold_30d: 60,
      fulFillable: 300,
      stockFul: 300,
      stockRes: 0,
    }],
    overBudgetRows: [{
      __overBudgetSource: 'SP',
      sku: 'KPI1',
      asin: 'B0KPI1',
      campaignId: 'campaign-kpi-1',
      campaignName: 'kw_kpi_recovery',
      adGroupId: 'adgroup-kpi-1',
      adId: 'ad-kpi-1',
      state: 1,
      campaignState: 1,
      groupState: 1,
      dailyBudget: 10,
      Spend: 8,
      Sales: 80,
      Orders: 4,
      Clicks: 40,
      positionType: 'productAd',
    }],
  };
  const result = buildKpiRecoveryOverBudgetSchema(snapshot, {
    actor: 'codex',
    currentDate: new Date('2026-05-19'),
    limit: { aggressive: 0, controlled: 2, seasonal: 0, lowerLayer: 0, review: 0, autoPause: 0 },
    maxDailyBudgetIncreaseUsd: 80,
  });
  assert.strictEqual(result.schema.length, 1);
  assert.strictEqual(result.summary.plannedActions, 1);
  assert.strictEqual(result.summary.coverage.warning, '');
  assert.strictEqual(result.summary.coverage.matchedActionCount, 1);
  assert.strictEqual(result.schema[0].actions[0].approvedBy, 'codex');
  assert.strictEqual(result.schema[0].actions[0].riskLevel, 'over_budget_controlled_budget_up');
}

{
  const summary = buildRunSummary({
    mode: 'fast',
    runId: 'run-1',
    time: { businessDate: '2026-05-15' },
    startedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    seasonTitleListingApplications: { built: 2, skipped: 1 },
    seasonTitleListingCopyDryRun: { total: 2, valid: 1, invalid: 1, warnings: 0 },
    agentLedger: { taskCount: 3, actionCount: 2, reviewTaskCount: 1 },
    outputFiles: {
      seasonTitleListingCopyDryRunJson: 'data/snapshots/listing_copy_edit_dry_run_2026-05-15.json',
      agentLedgerJson: 'data/agent/agent_ledger_2026-05-15.json',
    },
  });

  assert.deepStrictEqual(summary.seasonTitleListingApplications, { built: 2, skipped: 1 });
  assert.deepStrictEqual(summary.seasonTitleListingCopyDryRun, { total: 2, valid: 1, invalid: 1, warnings: 0 });
  assert.strictEqual(
    summary.outputFiles.seasonTitleListingCopyDryRunJson,
    'data/snapshots/listing_copy_edit_dry_run_2026-05-15.json'
  );
  assert.deepStrictEqual(summary.agentLedger, { taskCount: 3, actionCount: 2, reviewTaskCount: 1 });
  assert.strictEqual(summary.outputFiles.agentLedgerJson, 'data/agent/agent_ledger_2026-05-15.json');
}

console.log('run_today_ops_snapshot.test.js passed');
