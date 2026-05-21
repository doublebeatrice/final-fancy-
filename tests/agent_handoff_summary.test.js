const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAgentHandoffSummary,
  buildDataFreshnessSummary,
  buildKpiSummary,
  evaluateRecoveryGate,
  buildOperatingStatus,
  readAdjustmentFiles,
  resolvePreviousRecoveryTarget,
  runAgentHandoffSummary,
  summarizeApprovalNeeded,
  summarizeAdjustmentLedger,
} = require('../scripts/run_agent_handoff_summary');

const timeContext = {
  runAt: '2026-05-19T12:45:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'agent-handoff-test',
};

{
  const summary = buildAgentHandoffSummary({
    timeContext,
    hub: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      summary: { total: 3, dueReviews: 1, externalRequests: 1, capabilitySetup: 1, feedbackApplied: 1 },
      todayQueue: [{
        taskId: 'review-1',
        title: 'SE5608 1日效果复查',
        workType: 'due_effect_review',
        priority: 'P0',
        status: 'waiting_review',
        nextStep: '拉取最新广告、库存和利润证据。',
      }, {
        taskId: 'ext-1',
        title: '开发问 HAY0218 能不能推',
        workType: 'external_request',
        priority: 'P1',
        status: 'executed',
        nextStep: '输出运营回复。',
      }],
    },
    commandResults: {
      summary: { executed: 1, failed: 1, skipped: 0 },
      results: [{
        taskId: 'ext-1',
        ok: true,
        summary: '选品关键词转化证据已生成。',
        outputFiles: ['data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json'],
      }, {
        taskId: 'review-1',
        ok: false,
        summary: '缺少执行前基线。',
      }],
    },
    writeExecution: {
      mode: 'dry-run',
      summary: { eligibleActions: 2, landedActions: 1, approvalNeededActions: 3, blockedActions: 1, dryRunBlockedActions: 1, executedStages: 1, failedStages: 0 },
      plan: {
        dryRunBlocked: [{
          sku: 'MISS1',
          actionType: 'pause',
          entityType: 'keyword',
          mode: 'blocked',
          riskLevel: 'low',
          blocks: ['dry_run_validation_error'],
          requirements: ['fresh_clean_dry_run_before_execute'],
        }],
        approvalNeeded: [{
          sku: 'SE6599',
          actionType: 'review',
          entityType: 'campaign',
          mode: 'escalate',
          riskLevel: 'medium',
          blocks: ['unsupported_or_unclassified_action_surface'],
          requirements: ['classify_surface_before_execution'],
        }, {
          sku: 'TIN2259',
          actionType: 'review',
          entityType: 'campaign',
          mode: 'escalate',
          riskLevel: 'medium',
          blocks: ['unsupported_or_unclassified_action_surface'],
          requirements: ['classify_surface_before_execution'],
        }, {
          sku: 'YUT3183',
          actionType: 'review',
          entityType: 'skuCandidate',
          mode: 'escalate',
          riskLevel: 'medium',
          blocks: ['unsupported_or_unclassified_action_surface'],
        }],
      },
    },
    effectReview: {
      results: [{
        taskId: 'review-1',
        verdict: 'continue_watch',
        nextStep: '继续观察到 3 日窗口。',
      }],
    },
    adjustments: [{
      sku: 'SE6599',
      actionType: 'budget',
      entityType: 'campaign',
      entityName: 'kw_bearshirt_se6599',
      beforeValue: 13.82,
      afterValue: 17.27,
      outcome: 'success',
      dryRun: false,
      businessDate: '2026-05-19',
      runAt: '2026-05-19T13:10:00.000Z',
      sourceRunId: 'ops-live-test',
    }],
    dashboardFile: 'D:\\ad-ops-workbench\\data\\reports\\daily_dashboard_2026-05-19.html',
    dashboardReady: true,
    depositStatus: {
      status: 'partial',
      missing: ['sales_core_original_xlsx'],
      suspicious: [{ type: 'sales_core_is_snapshot_derived' }],
      rawDownloadCandidates: {
        total: 1,
        sameDateTotal: 1,
        staleTotal: 0,
        rootsSearched: ['D:\\chrome dl'],
        byMissingClass: {
          sales_core_original_xlsx: [{ file: 'D:\\chrome dl\\table-export (21).xlsx' }],
          inventory_original_csv: [],
          ad_full_original_csv: [],
        },
      },
    },
    closureVerification: {
      ok: true,
      errors: [],
      files: { closedLoopFile: 'data\\agent\\agent_closed_loop_2026-05-19.json' },
    },
    kpiGate: {
      status: 'target_set_actual_pending',
      evaluatedBusinessDate: '2026-05-19',
      dataDate: '2026-05-18',
      target: { businessDate: '2026-05-20' },
      warnings: ['target_business_date_actual_not_available'],
    },
    kpiCheckpoint: {
      actionPools: {
        recoveryDryRun: {
          highEfficiencyBidUps: 37,
          skuCount: 31,
          latestRunId: 'ops_2026-05-20T07-34-48-533Z',
          decision: 'dry-run recovery candidates exist; review before any live execution',
          sample: [{
            sku: 'NO3390',
            entityType: 'keyword',
            entityName: 'kw2_butterfly baby shower_no3390',
            beforeValue: 0.15,
            afterValue: 0.18,
            reasonCode: 'high_efficiency_standard_bid_up',
            orders7: 3,
            acos7: 0.0258,
            invDays: 84,
          }],
        },
      },
    },
    kpiDryRunDecisions: {
      date: '2026-05-19',
      summary: {
        total: 4,
        skuCount: 4,
        byDecision: {
          executed: 1,
          autonomous_recommendation: 1,
          watch_only: 1,
          blocked: 1,
          approval_needed: 1,
        },
        nextActions: {
          alreadyLanded: 32,
          watch: 2,
          blocked: 9,
          approvalNeeded: 9,
        },
      },
      items: [{
        sku: 'REC1',
        entityType: 'keyword',
        entityName: 'repeat keyword',
        beforeValue: 0.2,
        afterValue: 0.23,
        decision: 'autonomous_recommendation',
        reason: 'repeat orders with inventory and profit room',
      }],
    },
    kpiRecoveryNextActionsFile: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_recovery_next_actions_2026-05-19.md',
    kpiApprovalReviewFile: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_approval_review_2026-05-19.md',
    kpiApprovalReview: {
      summary: {
        total: 9,
        recommendApprove: 2,
        approvalNeeded: 3,
        hold: 2,
        blocked: 2,
      },
    },
    allSkuReview: {
      summary: {
        totalSkus: 2,
        mustReview: 1,
        oldProductYoyDown: 1,
        newLaunchRepair: 0,
        stopLoss: 0,
        nodeTrafficGap: 0,
        nodeConversionGap: 0,
        byLifecycle: { old_product: 2 },
        byVerdict: { old_product_recovery_check: 1, watch: 1 },
        marketAnalysis: {
          totalSkus: 2,
          requiredSkus: 2,
          readyForDecisionSupport: 1,
          requiredMissing: 1,
          mismatchMissing: 1,
          statusCounts: {
            market_evidence_ready: 1,
            market_required_missing: 1,
          },
        },
      },
      topPriorityRows: [{
        sku: 'OLD1',
        lifecycleLabel: 'old_product',
        ageDays: 400,
        units3d: 0,
        units7d: 1,
        units30d: 30,
        yoyUnitsPct: -0.4,
        action: 'market check first',
        reasons: ['below expectation'],
        marketAnalysis: {
          status: 'market_required_missing',
          readyForDecisionSupport: false,
          coverage: { requested: 2, keywordConversionMatched: 0, abaMatched: 0 },
        },
      }],
    },
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: '所选编号汇总',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
        adv_spend: '53198.34389999999',
        CPC: '2.1729',
        CPS: '16.1495',
      }],
    },
  });

  assert.strictEqual(summary.businessDate, '2026-05-19');
  assert.ok(summary.markdown.includes('智能代理早间交接'));
  assert.ok(summary.markdown.includes('业务日期：2026-05-19'));
  assert.ok(summary.markdown.includes('待复查 1'));
  assert.ok(summary.markdown.includes('选品关键词转化证据已生成。'));
  assert.ok(summary.markdown.includes('缺少执行前基线。'));
  assert.ok(summary.markdown.includes('继续观察到 3 日窗口。'));
  assert.ok(summary.markdown.includes('已落地动作沉淀'));
  assert.ok(summary.markdown.includes('成功 1'));
  assert.ok(summary.markdown.includes('KPI 总账户'));
  assert.ok(summary.markdown.includes('所选编号汇总'));
  assert.ok(summary.markdown.includes('销售 525,427.69'));
  assert.ok(summary.markdown.includes('月终目标缺口'));
  assert.ok(summary.markdown.includes('数据质量'));
  assert.ok(summary.markdown.includes('滞后 1 天'));
  assert.ok(summary.markdown.includes('闭环状态'));
  assert.ok(summary.markdown.includes('## Dashboard'));
  assert.ok(summary.markdown.includes('daily_dashboard_2026-05-19.html'));
  assert.ok(summary.markdown.includes('- status: ready'));
  assert.strictEqual(summary.dashboardReady, true);
  assert.strictEqual(summary.summary.dashboardReady, true);
  assert.ok(summary.markdown.includes('## Deposit Status'));
  assert.ok(summary.markdown.includes('raw download candidates: 1; same-day 1; stale 0'));
  assert.ok(summary.markdown.includes('D:\\chrome dl'));
  assert.ok(summary.markdown.includes('## Artifact Verification'));
  assert.ok(summary.markdown.includes('artifactVerificationOk=true'));
  assert.ok(summary.markdown.includes('## KPI Gate'));
  assert.ok(summary.markdown.includes('target_set_actual_pending'));
  assert.ok(summary.markdown.includes('## KPI Recovery Dry Run'));
  assert.ok(summary.markdown.includes('market_required_missing'));
  assert.ok(summary.markdown.includes('market evidence ready 1'));
  assert.ok(summary.markdown.includes('market missing 1'));
  assert.ok(summary.markdown.includes('highEfficiencyBidUps 37'));
  assert.ok(summary.markdown.includes('not counted as landed actions'));
  assert.ok(summary.markdown.includes('NO3390'));
  assert.ok(summary.markdown.includes('## KPI Recovery Next Actions'));
  assert.ok(summary.markdown.includes('kpi_recovery_next_actions_2026-05-19.md'));
  assert.ok(summary.markdown.includes('alreadyLanded 32'));
  assert.ok(summary.markdown.includes('watch 2'));
  assert.ok(summary.markdown.includes('blocked 9'));
  assert.ok(summary.markdown.includes('approvalNeeded 9'));
  assert.ok(summary.markdown.includes('## KPI Approval Review'));
  assert.ok(summary.markdown.includes('kpi_approval_review_2026-05-19.md'));
  assert.ok(summary.markdown.includes('recommendApprove 2'));
  assert.ok(summary.markdown.includes('## Effect Review Coverage'));
  assert.ok(summary.markdown.includes('dueReviews 1'));
  assert.ok(summary.markdown.includes('effectReviewTotal 1'));
  assert.ok(summary.markdown.includes('feedbackApplied 1'));
  assert.strictEqual(summary.summary.kpiApprovalReviewReady, true);
  assert.strictEqual(summary.summary.kpiApprovalReviewTotal, 9);
  assert.strictEqual(summary.summary.kpiApprovalRecommendApprove, 2);
  assert.strictEqual(summary.summary.kpiApprovalReviewApprovalNeeded, 3);
  assert.strictEqual(summary.summary.kpiApprovalHold, 2);
  assert.strictEqual(summary.summary.kpiApprovalBlocked, 2);
  assert.strictEqual(summary.summary.kpiGateStatus, 'target_set_actual_pending');
  assert.strictEqual(summary.summary.recoveryDryRunHighEfficiencyBidUps, 37);
  assert.strictEqual(summary.summary.recoveryDryRunSkuCount, 31);
  assert.strictEqual(summary.summary.kpiRecoveryNextActionsReady, true);
  assert.strictEqual(summary.summary.effectReviewDue, 1);
  assert.strictEqual(summary.summary.effectReviewTotal, 1);
  assert.strictEqual(summary.summary.effectReviewFeedbackApplied, 1);
  assert.strictEqual(summary.summary.effectReviewContinueWatch, 1);
  assert.strictEqual(summary.summary.kpiGateTargetBusinessDate, '2026-05-20');
  assert.ok(summary.markdown.includes('approval needed groups'));
  assert.ok(summary.markdown.includes('dry-run blocked groups'));
  assert.ok(summary.markdown.includes('alreadyLanded 1'));
  assert.ok(summary.markdown.includes('2x review/campaign'));
  assert.ok(summary.markdown.includes('SE6599, TIN2259'));
  assert.strictEqual(summary.summary.writeApprovalGroups[0].count, 2);
  assert.ok(summary.markdown.includes('sales_core_original_xlsx'));
  assert.ok(summary.markdown.includes('广告费率'));
  assert.strictEqual(summary.summary.depositStatus, 'partial');
  assert.strictEqual(summary.summary.artifactVerificationOk, true);
  assert.deepStrictEqual(summary.summary.artifactVerificationErrors, []);
  assert.strictEqual(summary.summary.landedActionSuccess, 1);
  assert.strictEqual(summary.summary.kpiStatus, 'off_track');
  assert.strictEqual(summary.summary.dataFreshnessStatus, 'previous_day');
  assert.strictEqual(summary.summary.snapshotStale, false);
  assert.strictEqual(summary.summary.operatingClosureStatus, 'blocked');
  assert.strictEqual(summary.kpiSummary.finalTarget.salesGap, 154572.31);
  assert.ok(summary.markdown.includes('写入链路'));
}

{
  const passGate = evaluateRecoveryGate({
    sales: 541500,
    units: 3755,
    estimatedNetProfit: 104000,
  }, {
    businessDate: '2026-05-20',
    salesTarget: 541080.88,
    unitsTarget: 3754,
  }, '2026-05-20');
  assert.strictEqual(passGate.status, 'pass');
  assert.strictEqual(passGate.gap.salesGap, 0);
  assert.strictEqual(passGate.gap.unitsGap, 0);

  const failGate = evaluateRecoveryGate({
    sales: 540000,
    units: 3700,
    netProfitRate: 0.19,
    acos: 0.21,
    refundRate: 0.06,
    adCostShare: 0.11,
    estimatedNetProfit: 103000,
  }, {
    businessDate: '2026-05-20',
    salesTarget: 541080.88,
    unitsTarget: 3754,
    netProfitRateMin: 0.1947,
    acosMax: 0.1977,
    refundRateMax: 0.0528,
    adCostShareMax: 0.108,
  }, '2026-05-20');
  assert.strictEqual(failGate.status, 'fail');
  assert.strictEqual(failGate.gap.salesGap, 1080.88);
  assert.strictEqual(failGate.gap.unitsGap, 54);
  assert.strictEqual(failGate.gap.netProfitRateGap, 0.0047);
  assert.strictEqual(failGate.gap.acosGap, 0.0123);
  assert.strictEqual(failGate.gap.refundRateGap, 0.0072);
  assert.strictEqual(failGate.gap.adCostShareGap, 0.002);
}

{
  const grouped = summarizeApprovalNeeded([{
    sku: 'A',
    actionType: 'review',
    entityType: 'campaign',
    mode: 'escalate',
    riskLevel: 'medium',
    blocks: ['surface'],
  }, {
    sku: 'B',
    actionType: 'review',
    entityType: 'campaign',
    mode: 'escalate',
    riskLevel: 'medium',
    requirements: ['classify'],
  }, {
    sku: 'C',
    actionType: 'review',
    entityType: 'skuCandidate',
    mode: 'escalate',
    riskLevel: 'medium',
  }]);
  assert.strictEqual(grouped.length, 2);
  assert.strictEqual(grouped[0].count, 2);
  assert.deepStrictEqual(grouped[0].skus, ['A', 'B']);
  assert.ok(grouped[0].blocks.includes('surface'));
  assert.ok(grouped[0].requirements.includes('classify'));
}

{
  const summary = buildAgentHandoffSummary({
    timeContext,
    hub: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    commandResults: { summary: { executed: 0, failed: 0 }, results: [] },
    writeExecution: {
      mode: 'dry-run',
      summary: { eligibleActions: 0, approvalNeededActions: 0, blockedActions: 0, executedStages: 0, failedStages: 0 },
      plan: { approvalNeeded: [] },
    },
    depositStatus: {
      status: 'partial',
      missing: ['sales_core_original_xlsx', 'inventory_original_csv'],
      suspicious: [{ type: 'sales_core_is_snapshot_derived' }],
    },
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: '鎵€閫夌紪鍙锋眹鎬?',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
  });
  assert.strictEqual(summary.summary.dailyClosureStatus, 'partial');
  assert.strictEqual(summary.summary.dailyComplete, false);
  assert.ok(summary.summary.dailyClosureReasons.includes('deposit_partial'));
  assert.ok(summary.summary.dailyClosureReasons.includes('deposit_missing_raw'));
  assert.ok(summary.summary.dailyClosureReasons.includes('kpi_off_track'));
  assert.ok(summary.markdown.includes('## Daily Closure'));
  assert.ok(summary.markdown.includes('dailyClosureStatus: partial'));
  assert.ok(summary.markdown.includes('dailyComplete=false'));
}

{
  const kpi = buildKpiSummary({
    sellerSalesRows: [{
      seller_title: '所选编号汇总',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
      adv_spend: '53198.34389999999',
    }],
  }, timeContext);
  assert.strictEqual(kpi.sourceSellerTitle, '所选编号汇总');
  assert.strictEqual(kpi.missedCheckpoint.salesGap, 84572.31);
  assert.strictEqual(kpi.missedCheckpoint.date, '2026-05-19');
  assert.strictEqual(kpi.nextCheckpoint.target.date, '2026-05-26');
  assert.strictEqual(kpi.nextCheckpoint.salesGap, 109572.31);
  assert.strictEqual(kpi.recoveryPace.nextCheckpoint.remainingDays, 7);
  assert.strictEqual(kpi.recoveryPace.nextCheckpoint.salesPerDay, 15653.19);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.businessDate, '2026-05-20');
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.salesTarget, 541080.88);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.unitsTarget, 3754);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.netProfitRateMin, 0.1947);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.acosMax, 0.1977);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.refundRateMax, 0.0528);
  assert.strictEqual(kpi.recoveryPace.nextBusinessDayTarget.adCostShareMax, 0.108);
  assert.strictEqual(kpi.recoveryPace.finalTarget.remainingDays, 24);
  assert.strictEqual(kpi.recoveryPace.finalTarget.estimatedNetProfitPerDay, 1542.27);
  assert.strictEqual(kpi.finalTarget.unitsGap, 937);
}

{
  const freshness = buildDataFreshnessSummary({
    businessDate: '2026-05-20',
    dataDate: '2026-05-18',
    snapshot: {
      sellerSalesRows: [{ seller_title: '所选编号汇总' }],
      productCards: [{ sku: 'SKU1' }],
    },
  });
  assert.strictEqual(freshness.dataLagDays, 2);
  assert.strictEqual(freshness.snapshotStale, true);
  assert.ok(freshness.warnings.includes('data_lag_gt_1_day'));
}

{
  const status = buildOperatingStatus({
    dataFreshness: { status: 'previous_day', snapshotStale: false },
    kpiSummary: { status: 'off_track' },
  });
  assert.strictEqual(status.status, 'needs_recovery');
  assert.ok(status.warnings.includes('kpi_off_track'));
}

{
  const status = buildOperatingStatus({
    dataFreshness: { status: 'warning', snapshotStale: true },
    kpiSummary: { status: 'off_track' },
  });
  assert.strictEqual(status.status, 'partial');
  assert.ok(status.warnings.includes('snapshot_stale'));
  assert.ok(status.warnings.includes('kpi_off_track'));
}

{
  const result = summarizeAdjustmentLedger([{
    sku: 'A',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-19T10:00:00.000Z',
    sourceRunId: 'run-1',
  }, {
    sku: 'B',
    outcome: 'manual_review',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-19T10:00:00.000Z',
    sourceRunId: 'run-1',
  }, {
    sku: 'C',
    outcome: 'skipped_invalid_state',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-19T10:00:00.000Z',
    sourceRunId: 'run-1',
  }], '2026-05-19');
  assert.strictEqual(result.latestRunRows, 3);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.manualReviewCount, 1);
  assert.strictEqual(result.skippedCount, 1);
}

{
  const result = summarizeAdjustmentLedger([{
    sku: 'KPI1',
    actionType: 'budget',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-20T01:00:00.000Z',
    sourceRunId: 'latest-cross-date-run',
  }], '2026-05-20', { fallbackToLatest: true });
  assert.strictEqual(result.fallbackUsed, true);
  assert.strictEqual(result.latestRunRows, 1);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.latestRunId, 'latest-cross-date-run');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-handoff-adjustments-'));
  const localFile = path.join(tmpDir, 'adjustments_2026-05-20.json');
  const businessFile = path.join(tmpDir, 'adjustments_2026-05-19.json');
  fs.writeFileSync(localFile, JSON.stringify([{
    sku: 'LOW',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-20',
    runAt: '2026-05-20T02:00:00.000Z',
    sourceRunId: 'local-low-eff',
    entityType: 'keyword',
    entityId: '1',
    actionType: 'bid',
  }]), 'utf8');
  fs.writeFileSync(businessFile, JSON.stringify([{
    sku: 'DN1656',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-20T05:14:39.819Z',
    sourceRunId: 'business-high-eff',
    entityType: 'keyword',
    entityId: '387542217176746',
    actionType: 'bid',
  }, {
    sku: 'SHQ3949',
    outcome: 'blocked_by_system_recent_adjust',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-20T05:14:39.819Z',
    sourceRunId: 'business-high-eff',
    entityType: 'autoTarget',
    entityId: '399777227925143',
    actionType: 'bid',
  }]), 'utf8');
  const rows = readAdjustmentFiles([localFile, businessFile]);
  const result = summarizeAdjustmentLedger(rows, '2026-05-19');
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(result.latestRunId, 'business-high-eff');
  assert.strictEqual(result.latestRunRows, 2);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.failedCount, 1);
  assert.strictEqual(result.sample[0].sku, 'DN1656');
}

{
  const result = summarizeAdjustmentLedger([{
    sku: 'DN1656',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-20T05:14:39.819Z',
    sourceRunId: 'business-high-eff',
  }, {
    sku: 'lowEff::kw::191297114365768',
    outcome: 'api_success',
    dryRun: false,
    businessDate: '2026-05-20',
    runAt: '2026-05-20T05:22:31.861Z',
    sourceRunId: 'local-low-eff',
  }, {
    sku: 'lowEff::kw::59150984226833',
    outcome: 'api_success',
    dryRun: false,
    businessDate: '2026-05-20',
    runAt: '2026-05-20T05:22:31.861Z',
    sourceRunId: 'local-low-eff',
  }, {
    sku: 'OLD',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-19T05:22:31.861Z',
    sourceRunId: 'old-run',
  }], '2026-05-19', { acceptedBusinessDates: ['2026-05-19', '2026-05-20'] });
  assert.strictEqual(result.latestRunId, 'local-low-eff');
  assert.strictEqual(result.latestRunRows, 2);
  assert.strictEqual(result.successCount, 2);
  assert.strictEqual(result.totalSuccessCount, 4);
}

{
  const result = summarizeAdjustmentLedger([{
    sku: 'NEW',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-20',
    runAt: '2026-05-20T05:22:31.861Z',
    sourceRunId: 'new-run',
  }, {
    sku: 'OLD',
    outcome: 'success',
    dryRun: false,
    businessDate: '2026-05-19',
    runAt: '2026-05-19T05:22:31.861Z',
    sourceRunId: 'old-run',
  }], '2026-05-19', {
    acceptedBusinessDates: ['2026-05-19', '2026-05-20'],
    acceptedRunDates: ['2026-05-20'],
  });
  assert.strictEqual(result.latestRunId, 'new-run');
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.totalSuccessCount, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-handoff-summary-'));
  const outFile = path.join(tmpDir, 'handoff.md');
  const jsonOutFile = path.join(tmpDir, 'handoff.json');
  const hubFile = path.join(tmpDir, 'hub.json');
  const commandResultsFile = path.join(tmpDir, 'command_results.json');
  const depositStatusFile = path.join(tmpDir, 'daily_deposit_status_2026-05-19.json');
  fs.writeFileSync(hubFile, JSON.stringify({
    businessDate: '2026-05-19',
    dataDate: '2026-05-18',
    summary: { total: 1 },
    todayQueue: [{ taskId: 'daily-1', title: '低效清理', priority: 'P0', status: 'new', nextStep: '进入每日运营顺序。' }],
  }), 'utf8');
  fs.writeFileSync(commandResultsFile, JSON.stringify({
    summary: { executed: 1, failed: 0 },
    results: [{ taskId: 'daily-1', ok: true, summary: '证据已生成。' }],
  }), 'utf8');

  fs.writeFileSync(depositStatusFile, JSON.stringify({ status: 'complete', missing: [], suspicious: [] }), 'utf8');

  const result = runAgentHandoffSummary({
    hubFile,
    commandResultsFile,
    outFile,
    jsonOutFile,
    dashboardFile: path.join(tmpDir, 'daily_dashboard_2026-05-19.html'),
    dashboardReady: true,
    depositStatusFile,
    timeContext,
  });

  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(jsonOutFile));
  assert.ok(result.markdown.includes('daily_dashboard_2026-05-19.html'));
  assert.ok(result.markdown.includes('status: complete'));
  assert.ok(result.markdown.includes('低效清理'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-handoff-previous-target-'));
  fs.writeFileSync(path.join(tmpDir, 'agent_handoff_2026-05-20.json'), JSON.stringify({
    generatedAt: '2026-05-20T01:00:00.000Z',
    localDate: '2026-05-20',
    kpiSummary: {
      recoveryPace: {
        nextBusinessDayTarget: {
          businessDate: '2026-05-21',
          salesTarget: 550000,
          unitsTarget: 3800,
        },
      },
    },
  }), 'utf8');
  const target = resolvePreviousRecoveryTarget('2026-05-21', tmpDir);
  assert.strictEqual(target.salesTarget, 550000);
  assert.strictEqual(target.unitsTarget, 3800);
}

{
  const summary = buildAgentHandoffSummary({
    timeContext: { businessDate: '2026-05-20', localDate: '2026-05-21', dataDate: '2026-05-19' },
    hub: { businessDate: '2026-05-20', dataDate: '2026-05-19', todayQueue: [] },
    kpiCheckpoint: {
      landedEvidence: {
        landedActionSuccess: 0,
        landedActionFailed: 0,
        landedActionManualReview: 0,
      },
    },
    adjustments: [{
      sku: 'CL3650',
      actionType: 'pause',
      entityType: 'keyword',
      entityName: 'adult pinata-cl3650-system-keyword',
      beforeValue: 'enabled',
      afterValue: 'paused',
      outcome: 'success',
      dryRun: false,
      businessDate: '2026-05-20',
      localDate: '2026-05-21',
      runAt: '2026-05-20T20:40:47.965Z',
      sourceRunId: 'ops-live-test',
    }],
  });

  assert.strictEqual(summary.summary.landedActionSuccess, 1);
  assert.ok(summary.markdown.includes('最近批次 ops-live-test'));
}

{
  const summary = buildAgentHandoffSummary({
    timeContext: { businessDate: '2026-05-20', localDate: '2026-05-21', dataDate: '2026-05-19' },
    hub: { businessDate: '2026-05-20', dataDate: '2026-05-19', todayQueue: [] },
    adjustments: [{
      sku: 'EARLY',
      actionType: 'bid',
      entityType: 'keyword',
      outcome: 'api_success',
      dryRun: false,
      businessDate: '2026-05-20',
      localDate: '2026-05-20',
      runAt: '2026-05-20T02:00:00.000Z',
      sourceRunId: 'early-low-eff',
    }, {
      sku: 'LATE',
      actionType: 'bid',
      entityType: 'keyword',
      outcome: 'api_success',
      dryRun: false,
      businessDate: '2026-05-20',
      localDate: '2026-05-21',
      runAt: '2026-05-20T23:00:00.000Z',
      sourceRunId: 'late-low-eff',
    }, {
      sku: 'LATE_FAIL',
      actionType: 'bid',
      entityType: 'keyword',
      outcome: 'api_failed',
      dryRun: false,
      businessDate: '2026-05-20',
      localDate: '2026-05-21',
      runAt: '2026-05-20T23:00:00.000Z',
      sourceRunId: 'late-low-eff',
    }],
  });

  assert.strictEqual(summary.summary.landedActionSuccess, 2);
  assert.strictEqual(summary.summary.landedActionFailed, 1);
  assert.ok(summary.markdown.includes('late-low-eff'));
}

console.log('agent_handoff_summary tests passed');
