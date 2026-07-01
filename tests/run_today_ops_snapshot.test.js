const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSkuReviewDigest } = require('../src/sku_review_digest');
const {
  buildActionQuality,
  buildFetchOptions,
  buildKpiRecoveryOverBudgetSchema,
  buildGbrainActionGuard,
  buildOldProductMaintenanceArtifacts,
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'today-ops-old-products-'));
  const allSkuReview = {
    rows: [{
      sku: 'OLD-DAY-1',
      asin: 'B0OLDDAY01',
      lifecycle: 'old_product',
      verdict: 'old_product_recovery_check',
      units30d: 20,
      yoyUnitsPct: -0.5,
      profitRate: 0.18,
      invDays: 80,
      fulRes: 100,
      ad30: { clicks: 200, orders: 20 },
      marketAnalysis: {
        readyForDecisionSupport: false,
        terms: ['retirement gifts for women', 'retirement bag'],
        operatingIntelligence: {
          readyForDecisionSupport: false,
          missingEvidence: ['selection_product_time_machine'],
        },
      },
    }],
  };

  const result = buildOldProductMaintenanceArtifacts({
    businessDate: '2026-06-16',
    dataDate: '2026-06-15',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview,
    depositStatus: { status: 'partial' },
    taskDir: tmpDir,
    snapshotDir: tmpDir,
  });

  assert.strictEqual(result.summary.candidates, 1);
  assert.strictEqual(result.summary.confirmationSheets, 1);
  assert.strictEqual(result.summary.marketEvidenceQueue.total, 1);
  assert.strictEqual(result.summary.skuWatchlistMerge.status, 'no_landed_items');
  assert.ok(fs.existsSync(result.files.oldProductMaintenanceJson));
  assert.ok(fs.existsSync(result.files.oldProductMaintenanceMarkdown));
  assert.ok(fs.existsSync(result.files.oldProductMarketEvidenceQueueJson));
  assert.ok(fs.existsSync(result.files.oldProductCandidateConfirmationJson));
  assert.ok(fs.existsSync(result.files.oldProductPendingConfirmationActionsJson));
  assert.ok(fs.existsSync(result.files.oldProductApprovedExecutionHandoffJson));
  assert.ok(fs.existsSync(result.files.oldProductApprovedActionSchemaJson));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(result.files.oldProductApprovedActionSchemaJson, 'utf8')), []);
  const executionHandoff = JSON.parse(fs.readFileSync(result.files.oldProductApprovedExecutionHandoffJson, 'utf8'));
  assert.strictEqual(executionHandoff.summary.total, 0);
  assert.strictEqual(executionHandoff.policy.noEffectReviewUntilLanded, true);

  const queue = JSON.parse(fs.readFileSync(result.files.oldProductMarketEvidenceQueueJson, 'utf8'));
  assert.strictEqual(queue.summary.readyToFetch, 1);
  const confirmation = JSON.parse(fs.readFileSync(result.files.oldProductCandidateConfirmationJson, 'utf8'));
  assert.strictEqual(confirmation.items[0].conclusionLabel, '市场证据不足');
  const pendingActions = JSON.parse(fs.readFileSync(result.files.oldProductPendingConfirmationActionsJson, 'utf8'));
  assert.strictEqual(pendingActions.items.length, 0);

  const summary = buildRunSummary({
    mode: 'fast',
    runId: 'old-product-run',
    time: { businessDate: '2026-06-16' },
    steps: [],
    oldProductMaintenance: result.summary,
    outputFiles: result.files,
  });
  assert.strictEqual(summary.oldProductMaintenance.candidates, 1);
  assert.strictEqual(
    summary.outputFiles.oldProductMarketEvidenceQueueJson,
    result.files.oldProductMarketEvidenceQueueJson
  );
  assert.strictEqual(
    summary.outputFiles.oldProductCandidateConfirmationJson,
    result.files.oldProductCandidateConfirmationJson
  );
  assert.strictEqual(
    summary.outputFiles.oldProductApprovedExecutionHandoffJson,
    result.files.oldProductApprovedExecutionHandoffJson
  );
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'today-ops-old-watchlist-'));
  const allSkuReview = {
    rows: [{
      sku: 'OLD-LANDED-1',
      asin: 'B0OLDLAND1',
      lifecycle: 'old_product',
      verdict: 'old_product_recovery_check',
      units7d: 10,
      units30d: 30,
      yoyUnitsPct: -0.5,
      profitRate: 0.2,
      invDays: 90,
      fulRes: 120,
      ad7: { clicks: 80, orders: 8, spend: 24, sales: 160, acos: 0.15 },
      ad30: { clicks: 300, orders: 30, spend: 90, sales: 600, acos: 0.15 },
      marketAnalysis: {
        readyForDecisionSupport: true,
        terms: ['retirement gifts for women'],
        operatingIntelligence: {
          readyForDecisionSupport: true,
          sourceCoverage: {
            terms: 1,
            keywordResearch: 1,
            productTimeMachine: 1,
            aba: 1,
            conversion: 1,
            seasonality: 1,
            sourceCount: 5,
          },
          opportunityModels: [{ key: 'conversion_economics_usable', term: 'retirement gifts for women' }],
          riskSignals: [],
          missingEvidence: [],
        },
      },
    }],
  };

  const result = buildOldProductMaintenanceArtifacts({
    businessDate: '2026-06-16',
    dataDate: '2026-06-15',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview,
    approval: {
      approvedCandidates: [{
        sku: 'OLD-LANDED-1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-old-landed-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 180,
          landingStatus: 'landed',
          readback: {
            bid: 0.7,
            state: 1,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
    depositStatus: { status: 'complete' },
    taskDir: tmpDir,
    snapshotDir: tmpDir,
  });

  assert.strictEqual(result.summary.watchlistItems, 1);
  assert.strictEqual(result.summary.skuWatchlistMerge.status, 'updated');
  assert.ok(fs.existsSync(result.files.oldProductWatchlistDeltaJson));
  assert.ok(fs.existsSync(result.files.oldProductSkuWatchlistJson));
  assert.ok(fs.existsSync(result.files.oldProductApprovedExecutionHandoffJson));
  const watchlist = JSON.parse(fs.readFileSync(result.files.oldProductWatchlistDeltaJson, 'utf8'));
  const skuWatchlist = JSON.parse(fs.readFileSync(result.files.oldProductSkuWatchlistJson, 'utf8'));
  const executionHandoff = JSON.parse(fs.readFileSync(result.files.oldProductApprovedExecutionHandoffJson, 'utf8'));
  assert.strictEqual(watchlist.items.length, 1);
  assert.strictEqual(watchlist.items[0].sku, 'OLD-LANDED-1');
  assert.strictEqual(watchlist.items[0].nextCheckDate, '2026-06-19');
  assert.strictEqual(skuWatchlist.items.filter(item => item.sku === 'OLD-LANDED-1').length, 1);
  assert.strictEqual(executionHandoff.summary.watchlistEligible, 1);

  const digest = buildSkuReviewDigest({
    today: '2026-06-19',
    watchlistFile: result.files.oldProductSkuWatchlistJson,
    reviewQueueFile: path.join(tmpDir, 'missing_review_queue.json'),
    taskFollowupDir: path.join(tmpDir, 'missing_followups'),
  });
  assert.strictEqual(digest.summary.due, 1);
  assert.strictEqual(digest.items[0].sku, 'OLD-LANDED-1');

  const summary = buildRunSummary({
    mode: 'fast',
    runId: 'old-product-watchlist-run',
    time: { businessDate: '2026-06-16' },
    steps: [],
    oldProductMaintenance: result.summary,
    outputFiles: result.files,
  });
  assert.strictEqual(
    summary.outputFiles.oldProductWatchlistDeltaJson,
    result.files.oldProductWatchlistDeltaJson
  );
}

{
  const summary = buildRunSummary({
    mode: 'fast',
    runId: 'price-followup-run',
    time: { businessDate: '2026-06-17' },
    steps: [],
    priceRaiseFollowup: {
      total: 2,
      needsAction: 1,
      watch: 1,
      healthy: 0,
    },
    outputFiles: {
      priceRaiseFollowupJson: 'data/tasks/price_raise_followup_2026-06-17.json',
      priceRaiseFollowupMarkdown: 'data/tasks/price_raise_followup_2026-06-17.md',
    },
  });

  assert.strictEqual(summary.priceRaiseFollowup.needsAction, 1);
  assert.strictEqual(
    summary.outputFiles.priceRaiseFollowupJson,
    'data/tasks/price_raise_followup_2026-06-17.json'
  );
}

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
  const validation = {
    plan: [{
      sku: 'GBRAIN1',
      asin: 'B0GBRAIN001',
      actions: [{
        entityType: 'sku',
        actionType: 'price',
        id: 'GBRAIN1',
        currentPrice: 22.99,
        suggestedPrice: 24.99,
        source: 'price_full_closure',
      }],
    }],
    review: [],
    skipped: [],
  };
  const recentAdjustments = [{
    sku: 'GBRAIN1',
    actionType: 'price',
    entityType: 'sku',
    beforeValue: 19.99,
    afterValue: 22.99,
    direction: 'up',
    dryRun: false,
    businessDate: '2026-06-08',
    runAt: '2026-06-09T01:00:00.000Z',
  }];
  const guard = buildGbrainActionGuard(validation, {
    businessDate: '2026-06-09',
    recentAdjustments,
    gbrainText: '不能让自动流程对同一 SKU 连续两天按新的现价继续提价，除非涨过价以后仍有大量出单。',
  });
  assert.strictEqual(guard.ok, false);
  assert.strictEqual(guard.failures.length, 1);
  assert.strictEqual(guard.failures[0].ruleId, 'gbrain.price.no_consecutive_raise_without_large_post_raise_sales');
}

{
  const schemaFile = path.join(process.cwd(), 'data', 'snapshots', 'action_schema_2026-06-03_price_full_closure_after_daily.json');
  const adjustmentsFile = path.join(process.cwd(), 'data', 'adjustments', 'adjustments_2026-06-02.json');
  if (fs.existsSync(schemaFile) && fs.existsSync(adjustmentsFile)) {
    const validation = { plan: JSON.parse(fs.readFileSync(schemaFile, 'utf8')), review: [], skipped: [] };
    const recentAdjustments = JSON.parse(fs.readFileSync(adjustmentsFile, 'utf8'));
    const guard = buildGbrainActionGuard(validation, {
      businessDate: '2026-06-03',
      recentAdjustments,
      gbrainText: '不能让自动流程对同一 SKU 连续两天按新的现价继续提价，除非涨过价以后仍有大量出单。',
    });
    assert.ok(
      guard.failures.some(item => item.sku === 'JIN1883'),
      'GBrain guard should catch JIN1883-style consecutive price raises in old price schema'
    );
  }
}

{
  const validation = {
    plan: [{
      sku: 'GBRAIN7D',
      asin: 'B0GBRAIN7D',
      actions: [{
        entityType: 'sku',
        actionType: 'price',
        id: 'GBRAIN7D',
        currentPrice: 25.99,
        suggestedPrice: 28.99,
        source: 'manual_schema',
      }],
    }],
    review: [],
    skipped: [],
  };
  const recentAdjustments = [{
    sku: 'GBRAIN7D',
    actionType: 'price',
    entityType: 'sku',
    beforeValue: 22.99,
    afterValue: 25.99,
    direction: 'up',
    dryRun: false,
    businessDate: '2026-06-04',
    runAt: '2026-06-05T01:00:00.000Z',
  }];
  const guard = buildGbrainActionGuard(validation, {
    businessDate: '2026-06-09',
    recentAdjustments,
    gbrainText: '自动化门禁：同一 SKU 提价后进入 7 天吸收期，除非涨过价以后仍有大量出单，否则不能继续提价。',
  });
  assert.strictEqual(guard.ok, false);
  assert.strictEqual(guard.failures.length, 1);
  assert.strictEqual(guard.failures[0].sku, 'GBRAIN7D');
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
