const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dashboardHtml, statusTone } = require('../scripts/reports/generate_daily_dashboard');

assert.strictEqual(statusTone('complete'), 'good');
assert.strictEqual(statusTone('partial'), 'warn');
assert.strictEqual(statusTone('blocked'), 'bad');
assert.strictEqual(statusTone('target_set_actual_pending'), 'warn');
assert.strictEqual(statusTone('pass'), 'good');
assert.strictEqual(statusTone('fail'), 'bad');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-dashboard-'));
const depositStatusFile = path.join(tmpDir, 'daily_deposit_status_2026-05-20.json');
fs.writeFileSync(depositStatusFile, JSON.stringify({
  status: 'partial',
  missing: ['sales_core_original_xlsx'],
  suspicious: [{ type: 'sales_core_is_snapshot_derived' }],
  rawDownloadCandidates: {
    total: 3,
    sameDateTotal: 1,
    staleTotal: 2,
    rootsSearched: ['D:\\chrome dl', 'D:\\Backup\\Downloads'],
    byMissingClass: {
      sales_core_original_xlsx: [{ name: 'table-export (16).xlsx' }],
      inventory_original_csv: [{ name: 'inv_auto_filtered_2026-05-16-09-24-30.csv' }],
      ad_full_original_csv: [{ name: '广告全盘导出_近30天_2026-05-16_17-26-21.csv' }],
    },
  },
}), 'utf8');

const html = dashboardHtml({
  summary: {
    time: { localDate: '2026-05-20', businessDate: '2026-05-20', dataDate: '2026-05-18' },
    warnings: [],
    dailyLearning: { baselineQuality: 'warning' },
    totalProductCards: 1,
    allowedScopeSkuCount: 1,
    proactiveOperatingAudit: {},
    overBudgetCoverage: { counts: {}, snapshotRows: 0, actionableCampaigns: 0, matchedActionCount: 0 },
  },
  snapshot: {
    productCards: [],
    sellerSalesRows: [],
  },
  history: [{
    date: '2026-05-20',
    sales: 525427.69,
    units: 3663,
    adSpend: 53198.34,
    acos: 0.1998,
    netProfit: 0.1941,
    refund: 0.0546,
    adCostShare: 0.1012,
  }],
  audit: {
    kpi: {
      status: 'off_track',
      nextCheckpoint: { salesGap: 84572.31, unitsGap: 487, acosGap: 0.0118, refundRateGap: 0.0096, target: { sales: 610000, units: 4150 } },
      finalTarget: { salesGap: 154572.31, estimatedNetProfitGap: 37014.49, acosGap: 0.0198, refundRateGap: 0.0166 },
    },
  },
  tasks: { summary: { bySignal: {} } },
  allSkuReview: {
    summary: {
      totalSkus: 2,
      mustReview: 1,
      oldProductYoyDown: 1,
      newLaunchRepair: 0,
      nodeTrafficGap: 0,
      nodeConversionGap: 0,
      stopLoss: 0,
      byVerdict: { old_product_recovery_check: 1, watch: 1 },
      byLifecycle: { old_product: 2 },
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
    rows: [{
      sku: 'OLD1',
      lifecycleLabel: 'old_product',
      ageDays: 400,
      units3d: 0,
      units7d: 1,
      units30d: 30,
      yoyUnitsPct: -0.4,
      profitRate: 0.18,
      invDays: 90,
      ad7: { spend: 10, orders: 1, acos: 0.2 },
      nodePlan: {},
      action: 'market check first',
      reasons: ['below expectation'],
      marketAnalysis: {
        status: 'market_required_missing',
        readyForDecisionSupport: false,
        coverage: { requested: 2, keywordConversionMatched: 0, abaMatched: 0 },
      },
    }],
  },
  kpiDryRunDecisions: {
    summary: {
      total: 10,
      byDecision: {
        executed: 1,
        autonomous_recommendation: 1,
        watch_only: 2,
        blocked: 3,
        approval_needed: 4,
      },
      nextActions: {
        alreadyLanded: 32,
        watch: 3,
        blocked: 9,
        approvalNeeded: 9,
      },
    },
  },
  kpiApprovalReview: {
    summary: {
      total: 9,
      recommendApprove: 2,
      approvalNeeded: 3,
      hold: 2,
      blocked: 2,
    },
  },
  lowEfficiency: {},
  successRate: { successRatePercent: '96.0%' },
  execution: { finalCounts: { success: 567 } },
  agentClosedLoop: {
    closedLoop: true,
    files: {
      kpiRecoveryNextActionsFile: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_recovery_next_actions_2026-05-20.md',
      kpiApprovalReviewFile: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_approval_review_2026-05-20.json',
      monthKpiDigestMarkdownFile: 'D:\\ad-ops-workbench\\data\\tasks\\month_kpi_operator_digest_2026-05-20.md',
    },
    summary: {
      commandExecuted: 1,
      commandFailed: 0,
      dailyClosureStatus: 'partial',
      dailyComplete: false,
      dailyClosureReasons: ['deposit_partial', 'deposit_missing_raw', 'kpi_off_track'],
      artifactVerificationOk: true,
      artifactVerificationErrors: [],
      operatingClosureStatus: 'partial',
      operatingClosureWarnings: ['snapshot_stale', 'kpi_off_track'],
      kpiStatus: 'off_track',
      kpiRequiredMode: 'active_recovery_with_profit_guardrails',
      dataFreshnessStatus: 'warning',
      dataLagDays: 2,
      snapshotStale: true,
      dueReviews: 41,
      reviewQueueDue: 41,
      effectReviewTotal: 41,
      feedbackApplied: 41,
      landedActionSuccess: 567,
      landedActionFailed: 0,
      landedActionManualReview: 0,
      kpiGateStatus: 'target_set_actual_pending',
      kpiGateEvaluatedBusinessDate: '2026-05-19',
      kpiGateDataDate: '2026-05-18',
      monthKpiDigestReady: true,
      dailyOperatingWorkflow: {
        status: 'needs_recovery',
        required: true,
        blockers: ['all_sku_review_missing'],
        allSku: { status: 'missing', totalSkus: 0, mustReview: 0 },
        season: { status: 'ready', dryRunItems: 84, activeSeasonTasks: 94 },
        effectReview: { status: 'ready', dueReviews: 41, effectReviewTotal: 41, feedbackApplied: 41 },
      },
    },
    kpiRecoveryGate: {
      status: 'target_set_actual_pending',
      evaluatedBusinessDate: '2026-05-19',
      dataDate: '2026-05-18',
      target: { businessDate: '2026-05-20' },
    },
    kpiRecoveryCheckpoint: {
      landedEvidence: {
        landedActionSuccess: 629,
        landedActionFailed: 0,
        landedActionManualReview: 0,
      },
      actionPools: {
        recoveryDryRun: {
          highEfficiencyBidUps: 37,
          skuCount: 31,
          latestRunId: 'ops_2026-05-20T07-34-48-533Z',
          decision: 'dry-run recovery candidates exist; review before any live execution',
        },
      },
    },
    handoff: {
      kpiSummary: {
        missedCheckpoint: {
          date: '2026-05-19',
          salesGap: 84572.31,
          unitsGap: 487,
          acosGap: 0.0118,
          refundRateGap: 0.0096,
          target: { date: '2026-05-19', sales: 610000, units: 4150 },
        },
        nextCheckpoint: {
          date: '2026-05-26',
          salesGap: 109572.31,
          unitsGap: 637,
          acosGap: 0.0148,
          refundRateGap: 0.0126,
          target: { date: '2026-05-26', sales: 635000, units: 4300 },
        },
        finalTarget: {
          salesGap: 154572.31,
          estimatedNetProfitGap: 37014.49,
          acosGap: 0.0198,
          refundRateGap: 0.0166,
        },
        recoveryPace: {
          nextCheckpoint: {
            targetDate: '2026-05-26',
            remainingDays: 7,
            salesPerDay: 15653.19,
            unitsPerDay: 91,
          },
          nextBusinessDayTarget: {
            businessDate: '2026-05-20',
            salesTarget: 541080.88,
            unitsTarget: 3754,
            netProfitRateMin: 0.1947,
            acosMax: 0.1977,
            refundRateMax: 0.0528,
            adCostShareMax: 0.108,
          },
          nextBusinessDayGate: {
            status: 'fail',
            targetBusinessDate: '2026-05-20',
            gap: {
              salesGap: 1080.88,
              unitsGap: 54,
              netProfitRateGap: 0.0047,
              acosGap: 0.0123,
              refundRateGap: 0.0072,
              adCostShareGap: 0.002,
            },
          },
          finalTarget: {
            targetDate: '2026-06-12',
            remainingDays: 24,
            salesPerDay: 6440.51,
            unitsPerDay: 39.04,
            estimatedNetProfitPerDay: 1542.27,
          },
        },
      },
    },
  },
  outputDate: '2026-05-20',
  reportPaths: {
    snapshot: 'latest_snapshot.json',
    depositManifest: '',
    depositStatus: depositStatusFile,
    kpiRecoveryNextActions: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_recovery_next_actions_2026-05-20.md',
    kpiApprovalReview: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_approval_review_2026-05-20.json',
    monthKpiDigest: 'D:\\ad-ops-workbench\\data\\tasks\\month_kpi_operator_digest_2026-05-20.md',
  },
});

assert.ok(html.includes('运营闭环'));
assert.ok(html.includes('partial'));
assert.ok(html.includes('closedLoop=true'));
assert.ok(html.includes('dailyClosureStatus: partial'));
assert.ok(html.includes('dailyComplete=false'));
assert.ok(html.includes('deposit_partial'));
assert.ok(html.includes('artifactVerificationOk=true'));
assert.ok(html.includes('KPI 状态'));
assert.ok(html.includes('off_track'));
assert.ok(html.includes('KPI gate'));
assert.ok(html.includes('target_set_actual_pending'));
assert.ok(html.includes('target 2026-05-20 | actual 2026-05-19'));
assert.ok(html.includes('actual 2026-05-19'));
assert.ok(html.includes('data lag 2'));
assert.ok(html.includes('Effect review coverage'));
assert.ok(html.includes('dueReviews 41'));
assert.ok(html.includes('effectReviewTotal 41'));
assert.ok(html.includes('feedbackApplied 41'));
assert.ok(html.includes('已落地动作'));
assert.ok(html.includes('<div class="status-value">629</div>'));
assert.ok(html.includes('KPI recovery dry-run'));
assert.ok(html.includes('highEfficiencyBidUps 37'));
assert.ok(html.includes('SKUs 31'));
assert.ok(html.includes('not landed actions'));
assert.ok(html.includes('KPI recovery next actions'));
assert.ok(html.includes('kpi_recovery_next_actions_2026-05-20.md'));
assert.ok(html.includes('alreadyLanded 32; watch 3; blocked 9; approvalNeeded 9'));
assert.ok(html.includes('KPI approval review'));
assert.ok(html.includes('kpi_approval_review_2026-05-20.json'));
assert.ok(html.includes('recommendApprove 2; approvalNeeded 3; hold 2; blocked 2'));
assert.ok(html.includes('Month KPI digest'));
assert.ok(html.includes('month_kpi_operator_digest_2026-05-20.md'));
assert.ok(html.includes('每日经营工作流'));
assert.ok(html.includes('status needs_recovery'));
assert.ok(html.includes('all_sku_review_missing'));
assert.ok(html.includes('market_required_missing'));
assert.ok(html.includes('market evidence ready 1'));
assert.ok(html.includes('market missing 1'));
assert.ok(html.includes('deposit status: partial'));
assert.ok(html.includes('sales_core_original_xlsx'));
assert.ok(html.includes('raw download candidates: 3; same-day 1; stale 2'));
assert.ok(html.includes('D:\\chrome dl'));
assert.ok(html.includes('table-export (16).xlsx'));
assert.ok(html.includes('15,653.19'));
assert.ok(html.includes('1,542.27'));
assert.ok(html.includes('2026-05-26'));
assert.ok(html.includes('已错过 2026-05-19'));
assert.ok(html.includes('下一检查点 2026-05-26'));
assert.ok(html.includes('109,572'));
assert.ok(html.includes('下一业务日验收线 2026-05-20'));
assert.ok(html.includes('541,080.88'));
assert.ok(html.includes('3,754'));
assert.ok(html.includes('19.47%'));
assert.ok(html.includes('19.77%'));
assert.ok(html.includes('5.28%'));
assert.ok(html.includes('10.80%'));
assert.ok(html.includes('上一验收线回查 2026-05-20'));
assert.ok(html.includes('1,080.88'));
assert.ok(html.includes('0.47pp'));
assert.ok(html.includes('广告费率差 0.20pp'));

const failedGateHtml = dashboardHtml({
  summary: {
    time: { localDate: '2026-05-20', businessDate: '2026-05-20', dataDate: '2026-05-19' },
    warnings: [],
    dailyLearning: {},
    totalProductCards: 1,
    allowedScopeSkuCount: 1,
    proactiveOperatingAudit: {},
    overBudgetCoverage: { counts: {}, snapshotRows: 0, actionableCampaigns: 0, matchedActionCount: 0 },
  },
  snapshot: { productCards: [], sellerSalesRows: [] },
  history: [],
  audit: { kpi: {} },
  tasks: { summary: { bySignal: {} } },
  lowEfficiency: {},
  successRate: {},
  execution: {},
  agentClosedLoop: {
    closedLoop: true,
    summary: {
      dailyClosureStatus: 'partial',
      dailyComplete: false,
      dailyClosureReasons: ['kpi_off_track'],
      artifactVerificationOk: true,
      kpiStatus: 'off_track',
      kpiGateStatus: 'fail',
      kpiGateEvaluatedBusinessDate: '2026-05-20',
      kpiGateDataDate: '2026-05-19',
    },
    kpiRecoveryGate: {
      status: 'fail',
      evaluatedBusinessDate: '2026-05-20',
      dataDate: '2026-05-19',
      target: { businessDate: '2026-05-20' },
    },
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
          nextBusinessDayGate: {
            status: 'fail',
            targetBusinessDate: '2026-05-20',
            gap: { salesGap: 15653.19, unitsGap: 91 },
          },
        },
      },
    },
  },
  outputDate: '2026-05-20',
  reportPaths: {},
});

assert.ok(failedGateHtml.includes('target 2026-05-20 | actual 2026-05-20'));
assert.ok(!failedGateHtml.includes('target 2026-05-21 | actual 2026-05-20'));
assert.ok(failedGateHtml.includes('下一业务日验收线 2026-05-21'));
assert.ok(failedGateHtml.includes('上一验收线回查 2026-05-20'));

console.log('daily_dashboard tests passed');
