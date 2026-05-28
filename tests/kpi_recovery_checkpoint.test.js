const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCheckpoint,
  buildOperatorCheckpointMarkdown,
  parseArgs,
  run,
} = require('../scripts/execute/generate_kpi_recovery_checkpoint');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-20',
    generatedAt: '2026-05-20T06:55:04.000Z',
    closureVerify: {
      summary: {
        businessDate: '2026-05-19',
        dataDate: '2026-05-18',
        dailyClosureStatus: 'partial',
        dailyComplete: false,
        dailyClosureReasons: ['deposit_partial', 'deposit_missing_raw', 'kpi_off_track'],
        closedLoop: true,
        depositStatus: 'partial',
        depositMissingCount: 3,
        depositMissingItems: ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv'],
        depositSuspiciousItems: ['sales_core_is_snapshot_derived'],
        landedActionSuccess: 774,
        landedActionManualReview: 24,
        feedbackApplied: 14,
      },
    },
    closedLoop: {
      handoff: {
        kpiSummary: {
          recoveryPace: {
            nextBusinessDayTarget: {
              businessDate: '2026-05-21',
              salesTarget: 543689.74,
              unitsTarget: 3770,
              netProfitRateMin: 0.1948,
              acosMax: 0.1973,
              refundRateMax: 0.0525,
              adCostShareMax: 0.108,
            },
          },
        },
      },
      summary: {
        landedActionFailed: 31,
      },
    },
    kpiGate: {
      outputDate: '2026-05-20',
      evaluatedBusinessDate: '2026-05-19',
      dataDate: '2026-05-18',
      status: 'target_set_actual_pending',
      target: {
        businessDate: '2026-05-20',
        salesTarget: 541080.88,
        unitsTarget: 3754,
        netProfitRateMin: 0.1947,
        acosMax: 0.1977,
        refundRateMax: 0.0528,
        adCostShareMax: 0.108,
      },
      actual: {
        sales: 525427.69,
        units: 3663,
        netProfitRate: 0.1941,
        acos: 0.1998,
        refundRate: 0.0546,
        adCostShare: 0.1012,
        estimatedNetProfit: 101985.51,
      },
    },
    depositStatus: {
      status: 'partial',
      missing: ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv'],
      suspicious: ['sales_core_is_snapshot_derived'],
      archivedCandidates: 0,
      rawDownloadCandidates: {
        cutoffDate: '2026-05-06',
        rootsSearched: ['D:\\chrome dl', 'D:\\Backup\\Downloads'],
        total: 2,
        sameDateTotal: 0,
        staleTotal: 2,
        byMissingClass: {
          sales_core_original_xlsx: [{
            name: 'table-export (16).xlsx',
            file: 'D:\\chrome dl\\table-export (16).xlsx',
            candidateDate: '2026-05-13',
            ageDays: 7,
            sameDate: false,
            action: 'reference_only_stale',
          }],
          inventory_original_csv: [{
            name: 'inv_auto_filtered_2026-05-16-09-24-30.csv',
            file: 'D:\\chrome dl\\inv_auto_filtered_2026-05-16-09-24-30.csv',
            candidateDate: '2026-05-16',
            ageDays: 4,
            sameDate: false,
            action: 'reference_only_stale',
          }],
          ad_full_original_csv: [],
        },
      },
    },
    lowEfficiency: { summary: { totals: { actionable: 0, hold: 21, skip: 620 } } },
    effectReview: { summary: { total: 14, byVerdict: { continue_watch: 14 }, needsAction: 0, blocked: 0 } },
    writeExecution: { mode: 'skipped', summary: { eligibleActions: 0, blockedActions: 0, executedStages: 0, failedStages: 0 } },
    adjustmentLog: [
      {
        sku: 'IF1427',
        entityType: 'keyword',
        entityName: 'kw_acrylic shelves_if1427',
        beforeValue: 0.37,
        afterValue: 0.45,
        reason: 'high_efficiency_strong_bid_up: strong_conversion+inventory_room+profit_room; orders7=8; acos7=0.0496; invDays=58; netProfit=0.1988; busyNetProfit=0.1881.',
        businessDate: '2026-05-20',
        runAt: '2026-05-20T07:34:48.533Z',
        sourceRunId: 'ops_2026-05-20T07-34-48-533Z',
        dryRun: true,
      },
      {
        sku: 'NO3390',
        entityType: 'keyword',
        entityName: 'kw2_butterfly baby shower_no3390',
        beforeValue: 0.15,
        afterValue: 0.18,
        reason: 'high_efficiency_standard_bid_up: good_conversion+inventory_ok+profit_ok; orders7=3; acos7=0.0258; invDays=84; netProfit=0.1075; busyNetProfit=0.0797.',
        businessDate: '2026-05-20',
        runAt: '2026-05-20T07:34:48.533Z',
        sourceRunId: 'ops_2026-05-20T07-34-48-533Z',
        dryRun: true,
      },
      {
        sku: 'OLD0001',
        entityType: 'keyword',
        reason: 'high_efficiency_small_bid_up: orders7=1; acos7=0.04.',
        businessDate: '2026-05-19',
        runAt: '2026-05-19T07:34:48.533Z',
        sourceRunId: 'old_run',
        dryRun: true,
      },
    ],
    selectionReports: {
      extendedSelection: {
        ok: true,
        results: [{
          request: { key: 'flowThemeMain', body: { uTime: '2026-04', dateType: 2 } },
          api: { ok: true, code: 200, result: { records: [{ patternSt: 'christmas towel' }], total: 1 } },
        }, {
          request: { key: 'storeFeedbackList', query: { uTime: '2026-04-01', myCollection: 0 } },
          api: { ok: true, code: 200, result: { records: [{ accountName: 'Pattern.', count30Day: 5027 }], total: 1 } },
        }],
      },
    },
  });

  assert.strictEqual(checkpoint.status, 'partial');
  assert.strictEqual(checkpoint.kpiGate.status, 'target_set_actual_pending');
  assert.strictEqual(checkpoint.kpiGate.target.sales, 541080.88);
  assert.strictEqual(checkpoint.deposit.missing.length, 3);
  assert.strictEqual(checkpoint.deposit.rawCandidateSearch.sameDateTotal, 0);
  assert.strictEqual(checkpoint.deposit.rawCandidateSearch.staleTotal, 2);
  assert.strictEqual(checkpoint.deposit.rawCandidateSearch.byMissingClass.inventory_original_csv.latest.candidateDate, '2026-05-16');
  assert.ok(checkpoint.deposit.nextAction.includes('redownload'));
  assert.strictEqual(checkpoint.actionPools.lowEfficiency.actionable, 0);
  assert.strictEqual(checkpoint.actionPools.effectReview.continueWatch, 14);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.highEfficiencyBidUps, 2);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.latestRunCount, 2);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.byDecision.high_efficiency_strong_bid_up, 1);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.sample[0].sku, 'IF1427');
  assert.strictEqual(checkpoint.landedEvidence.landedActionSuccess, 774);
  assert.strictEqual(checkpoint.landedEvidence.landedActionFailed, 31);
  assert.strictEqual(checkpoint.selectionKpiEvidence.readyForDecisionSupport, true);
  assert.strictEqual(checkpoint.selectionKpiEvidence.flowTheme.main.rowCount, 1);
  assert.strictEqual(checkpoint.selectionKpiEvidence.storeFeedback.list.rowCount, 1);
  assert.strictEqual(checkpoint.nextRecoveryTarget.businessDate, '2026-05-21');
  assert.strictEqual(checkpoint.nextRecoveryTarget.sales, 543689.74);
  assert.strictEqual(checkpoint.nextRecoveryTarget.relationshipToGate, 'next_pending_target');
  assert.ok(checkpoint.nextChecks.some(item => item.name === 'refresh_kpi_gate'));
  assert.ok(checkpoint.nextChecks.some(item => item.name === 'track_next_recovery_target'));
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-20',
    closureVerify: {
      summary: {
        businessDate: '2026-05-20',
        dataDate: '2026-05-19',
        dailyClosureStatus: 'partial',
        closedLoop: true,
        landedActionSuccess: 1,
      },
    },
    adjustmentLog: [
      {
        sku: 'LOW0001',
        entityType: 'keyword',
        reason: 'low_efficiency live success',
        businessDate: '2026-05-20',
        outcome: 'api_success',
        dryRun: false,
      },
      {
        sku: 'NO3390',
        entityType: 'keyword',
        entityName: 'kw2_butterfly baby shower_no3390',
        beforeValue: 0.15,
        afterValue: 0.18,
        reason: '{"code":200,"msg":"success","data":{"success":[{"keywordId":"272454594659175"}],"error":[]}}',
        businessDate: '2026-05-20',
        runAt: '2026-05-20T08:24:28.184Z',
        sourceRunId: 'ops_2026-05-20T08-24-28-184Z',
        outcome: 'success',
        dryRun: false,
      },
      {
        sku: 'NO3390',
        entityType: 'keyword',
        reason: 'high_efficiency_standard_bid_up: orders7=3; acos7=0.0258.',
        businessDate: '2026-05-20',
        dryRun: true,
      },
      {
        sku: 'OLD0001',
        entityType: 'keyword',
        reason: 'old live success',
        businessDate: '2026-05-19',
        outcome: 'success',
        dryRun: false,
      },
    ],
  });

  assert.strictEqual(checkpoint.landedEvidence.landedActionSuccess, 2);
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-21',
    closureVerify: {
      summary: {
        businessDate: '2026-05-20',
        dataDate: '2026-05-19',
        dailyClosureStatus: 'needs_recovery',
        closedLoop: true,
        landedActionSuccess: 758,
        landedActionFailed: 20,
      },
    },
    closedLoop: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      summary: {
        landedActionSuccess: 483,
        landedActionFailed: 3,
      },
    },
    adjustmentLog: [
      {
        sku: 'LOW0001',
        entityType: 'keyword',
        reason: 'low_efficiency live success',
        businessDate: '2026-05-21',
        outcome: 'api_success',
        dryRun: false,
      },
      {
        sku: 'LOW0002',
        entityType: 'autoTarget',
        reason: 'low_efficiency live failed',
        businessDate: '2026-05-21',
        outcome: 'api_failed',
        dryRun: false,
      },
    ],
    files: {
      adjustmentBusinessDate: '2026-05-21',
    },
  });

  assert.strictEqual(checkpoint.landedEvidence.landedActionSuccess, 483);
  assert.strictEqual(checkpoint.landedEvidence.landedActionFailed, 3);
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-21',
    closureVerify: {
      summary: {
        businessDate: '2026-05-20',
        dataDate: '2026-05-19',
        dailyClosureStatus: 'needs_recovery',
        closedLoop: true,
      },
    },
    kpiGate: {
      outputDate: '2026-05-21',
      evaluatedBusinessDate: '2026-05-20',
      dataDate: '2026-05-19',
      status: 'fail',
      target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
    },
    adjustmentLog: [
      {
        sku: 'REC_BIZ',
        entityType: 'keyword',
        entityName: 'business date keyword',
        beforeValue: 0.2,
        afterValue: 0.23,
        reason: 'high_efficiency_standard_bid_up: orders7=3; acos7=0.0500; invDays=60; netProfit=0.1800; busyNetProfit=0.1200.',
        businessDate: '2026-05-20',
        runAt: '2026-05-21T00:10:00.000Z',
        sourceRunId: 'dry-business-date',
        dryRun: true,
      },
      {
        sku: 'WRONG_DATE',
        entityType: 'keyword',
        reason: 'high_efficiency_small_bid_up: orders7=1; acos7=0.04.',
        businessDate: '2026-05-21',
        runAt: '2026-05-21T00:11:00.000Z',
        sourceRunId: 'wrong-output-date',
        dryRun: true,
      },
    ],
  });

  assert.strictEqual(checkpoint.date, '2026-05-21');
  assert.strictEqual(checkpoint.businessDate, '2026-05-20');
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.highEfficiencyBidUps, 1);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.sample[0].sku, 'REC_BIZ');
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-21',
    closureVerify: {
      summary: {
        businessDate: '2026-05-20',
        dailyClosureStatus: 'needs_recovery',
        closedLoop: true,
      },
    },
    kpiGate: {
      target: { businessDate: '2026-05-20' },
    },
    adjustmentLog: [
      {
        sku: 'OLD_RUN',
        entityType: 'keyword',
        reason: 'high_efficiency_small_bid_up: orders7=1; acos7=0.0400; invDays=80; netProfit=0.1800.',
        businessDate: '2026-05-20',
        runAt: '2026-05-20T07:00:00.000Z',
        sourceRunId: 'old-high-eff',
        dryRun: true,
      },
      {
        sku: 'LATEST_RUN',
        entityType: 'keyword',
        reason: 'high_efficiency_standard_bid_up: orders7=3; acos7=0.0500; invDays=60; netProfit=0.1800.',
        businessDate: '2026-05-20',
        runAt: '2026-05-21T00:00:00.000Z',
        sourceRunId: 'latest-high-eff',
        dryRun: true,
      },
    ],
  });

  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.totalHighEfficiencyBidUps, 2);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.highEfficiencyBidUps, 1);
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.latestRunId, 'latest-high-eff');
  assert.strictEqual(checkpoint.actionPools.recoveryDryRun.sample[0].sku, 'LATEST_RUN');
}

{
  const checkpoint = buildCheckpoint({
    date: '2026-05-20',
    closureVerify: {
      summary: {
        businessDate: '2026-05-20',
        dataDate: '2026-05-19',
        dailyClosureStatus: 'partial',
        closedLoop: true,
      },
    },
    closedLoop: {
      handoff: {
        kpiSummary: {
          recoveryPace: {
            nextBusinessDayTarget: {
              businessDate: '2026-05-21',
              salesTarget: 543689.74,
              unitsTarget: 3770,
            },
          },
        },
      },
    },
    kpiGate: {
      outputDate: '2026-05-20',
      evaluatedBusinessDate: '2026-05-20',
      dataDate: '2026-05-19',
      status: 'fail',
      target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
      actual: { sales: 525427.69 },
    },
  });

  assert.strictEqual(checkpoint.kpiGate.status, 'fail');
  assert.strictEqual(checkpoint.kpiGate.targetBusinessDate, '2026-05-20');
  assert.strictEqual(checkpoint.nextRecoveryTarget.businessDate, '2026-05-21');
  assert.strictEqual(checkpoint.nextRecoveryTarget.relationshipToGate, 'next_recovery_after_failed_gate');
  const markdown = buildOperatorCheckpointMarkdown(checkpoint);
  assert.ok(markdown.includes('Gate status: fail'));
  assert.ok(markdown.includes('Total sales | 541,080.88 | 525,427.69 | -15,653.19'));
  assert.ok(markdown.includes('Next recovery target for 2026-05-21'));
}

{
  const parsed = parseArgs([
    'node',
    'script',
    '--date',
    '2026-05-20',
    '--closure-verify',
    'closure.json',
    '--kpi-gate',
    'gate.json',
    '--deposit-status',
    'deposit.json',
    '--low-efficiency',
    'low.json',
    '--effect-review',
    'effect.json',
    '--write-execution',
    'write.json',
    '--kpi-approval-review',
    'approval.json',
    '--kpi-approval-review-md',
    'approval.md',
    '--closed-loop',
    'closed.json',
    '--adjustments',
    'adjustments.json',
    '--extended-selection-report',
    'selection.json',
    '--out',
    'checkpoint.json',
    '--operator-out',
    'operator.md',
  ]);
  assert.strictEqual(parsed.date, '2026-05-20');
  assert.strictEqual(parsed.closureVerifyFile, 'closure.json');
  assert.strictEqual(parsed.kpiGateFile, 'gate.json');
  assert.strictEqual(parsed.depositStatusFile, 'deposit.json');
  assert.strictEqual(parsed.lowEfficiencyFile, 'low.json');
  assert.strictEqual(parsed.effectReviewFile, 'effect.json');
  assert.strictEqual(parsed.writeExecutionFile, 'write.json');
  assert.strictEqual(parsed.kpiApprovalReviewFile, 'approval.json');
  assert.strictEqual(parsed.kpiApprovalReviewMarkdownFile, 'approval.md');
  assert.strictEqual(parsed.closedLoopFile, 'closed.json');
  assert.strictEqual(parsed.adjustmentLogFile, 'adjustments.json');
  assert.strictEqual(parsed.extendedSelectionReportFile, 'selection.json');
  assert.strictEqual(parsed.outFile, 'checkpoint.json');
  assert.strictEqual(parsed.operatorOutFile, 'operator.md');
}

{
  const parsed = parseArgs([
    'node',
    'script',
    '--date',
    '2026-05-20',
    '--no-operator-md',
  ]);
  assert.strictEqual(parsed.operatorOutFile, '');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-checkpoint-'));
  const closureVerifyFile = path.join(dir, 'closure.json');
  const kpiGateFile = path.join(dir, 'gate.json');
  const depositStatusFile = path.join(dir, 'deposit.json');
  const lowEfficiencyFile = path.join(dir, 'low.json');
  const effectReviewFile = path.join(dir, 'effect.json');
  const writeExecutionFile = path.join(dir, 'write.json');
  const closedLoopFile = path.join(dir, 'closed.json');
  const adjustmentLogFile = path.join(dir, 'adjustments.json');
  const extendedSelectionReportFile = path.join(dir, 'selection.json');
  const outFile = path.join(dir, 'checkpoint.json');
  const operatorOutFile = path.join(dir, 'operator.md');

  writeJson(closureVerifyFile, {
    summary: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      dailyClosureStatus: 'partial',
      dailyComplete: false,
      dailyClosureReasons: ['kpi_off_track'],
      closedLoop: true,
      landedActionSuccess: 1,
    },
  });
  writeJson(kpiGateFile, {
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
    actual: { sales: 525427.69 },
  });
  writeJson(depositStatusFile, {
    status: 'partial',
    missing: ['sales_core_original_xlsx'],
    suspicious: [],
    archivedCandidates: 0,
    rawDownloadCandidates: {
      rootsSearched: ['D:\\chrome dl'],
      total: 1,
      sameDateTotal: 1,
      staleTotal: 0,
      byMissingClass: {
        sales_core_original_xlsx: [{
          name: 'table-export (21).xlsx',
          file: 'D:\\chrome dl\\table-export (21).xlsx',
          candidateDate: '2026-05-20',
          ageDays: 0,
          sameDate: true,
          action: 'copy_to_daily_raw',
        }],
      },
    },
  });
  writeJson(lowEfficiencyFile, { summary: { totals: { actionable: 0, hold: 0, skip: 1 } } });
  writeJson(effectReviewFile, { summary: { total: 1, byVerdict: { continue_watch: 1 }, needsAction: 0, blocked: 0 } });
  writeJson(writeExecutionFile, { mode: 'skipped', summary: { eligibleActions: 0 } });
  const kpiApprovalReviewFile = path.join(dir, 'kpi_approval_review_2026-05-20.json');
  const kpiApprovalReviewMarkdownFile = path.join(dir, 'kpi_approval_review_2026-05-20.md');
  writeJson(kpiApprovalReviewFile, {
    summary: {
      total: 9,
      recommendApprove: 2,
      approvalNeeded: 3,
      hold: 2,
      blocked: 2,
      skuCount: 8,
    },
  });
  fs.writeFileSync(kpiApprovalReviewMarkdownFile, '# KPI approval review - 2026-05-20\n', 'utf8');
  writeJson(adjustmentLogFile, [{
    sku: 'AE2139',
    entityType: 'keyword',
    entityName: 'kw_1q clearstorage_ae2139',
    beforeValue: 0.42,
    afterValue: 0.45,
    reason: 'high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0458; invDays=20; netProfit=0.2340.',
    businessDate: '2026-05-20',
    runAt: '2026-05-20T07:34:48.533Z',
    sourceRunId: 'ops_2026-05-20T07-34-48-533Z',
    dryRun: true,
  }]);
  writeJson(closedLoopFile, {
    closedLoop: true,
    handoff: {
      kpiSummary: {
        recoveryPace: {
          nextBusinessDayTarget: { businessDate: '2026-05-21', salesTarget: 543689.74 },
        },
      },
    },
  });
  writeJson(extendedSelectionReportFile, {
    ok: true,
    results: [{
      request: { key: 'storeFeedbackList', query: { uTime: '2026-04-01', myCollection: 0 } },
      api: { ok: true, code: 200, result: { records: [{ accountName: 'Pattern.', count30Day: 5027 }], total: 1 } },
    }],
  });

  const result = run({
    date: '2026-05-20',
    closureVerifyFile,
    kpiGateFile,
    depositStatusFile,
    lowEfficiencyFile,
    effectReviewFile,
    writeExecutionFile,
    kpiApprovalReviewFile,
    kpiApprovalReviewMarkdownFile,
    closedLoopFile,
    adjustmentLogFile,
    extendedSelectionReportFile,
    outFile,
    operatorOutFile,
  });
  assert.strictEqual(result.ok, true);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(operatorOutFile));
  assert.strictEqual(result.checkpoint.deposit.missing[0], 'sales_core_original_xlsx');
  assert.strictEqual(result.checkpoint.nextRecoveryTarget.businessDate, '2026-05-21');
  assert.strictEqual(result.checkpoint.deposit.rawCandidateSearch.sameDateTotal, 1);
  assert.strictEqual(result.checkpoint.actionPools.recoveryDryRun.highEfficiencyBidUps, 1);
  assert.strictEqual(result.checkpoint.actionPools.approvalReview.recommendApprove, 2);
  assert.strictEqual(result.checkpoint.selectionKpiEvidence.storeFeedback.list.rowCount, 1);
  assert.ok(result.checkpoint.deposit.nextAction.includes('archive'));
  const operatorMarkdown = fs.readFileSync(operatorOutFile, 'utf8');
  assert.ok(operatorMarkdown.includes('Deposit status: partial'));
  assert.ok(operatorMarkdown.includes('Missing original raw files: sales_core_original_xlsx'));
  assert.ok(operatorMarkdown.includes('KPI recovery dry-run | highEfficiencyBidUps 1; SKUs 1'));
  assert.ok(operatorMarkdown.includes('not counted as landed actions'));
  assert.ok(operatorMarkdown.includes('## KPI approval review'));
  assert.ok(operatorMarkdown.includes('## Selection KPI evidence'));
  assert.ok(operatorMarkdown.includes('Store feedback rows: 1'));
  assert.ok(operatorMarkdown.includes('kpi_approval_review_2026-05-20.md'));
  assert.ok(operatorMarkdown.includes('recommendApprove 2; approvalNeeded 3; hold 2; blocked 2'));
}

console.log('kpi_recovery_checkpoint tests passed');
