const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../scripts/execute/generate_month_kpi_operator_digest');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'month-kpi-digest-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-21.json');
  const approvalReviewFile = path.join(tmpDir, 'kpi_approval_review_2026-05-21.json');
  const extendedSelectionReportFile = path.join(tmpDir, 'selection_kpi_evidence_2026-05-21.json');
  const outFile = path.join(tmpDir, 'month_kpi_operator_digest_2026-05-21.json');
  const markdownFile = path.join(tmpDir, 'month_kpi_operator_digest_2026-05-21.md');

  writeJson(closedLoopFile, {
    outputDate: '2026-05-21',
    businessDate: '2026-05-20',
    dataDate: '2026-05-19',
    summary: {
      dailyClosureStatus: 'needs_recovery',
      kpiGateStatus: 'fail',
      depositStatus: 'complete',
      depositMissingCount: 0,
      depositSuspiciousCount: 0,
      landedActionSuccess: 32,
      writeApprovalNeeded: 9,
      writeBlocked: 9,
      dueReviews: 41,
      reviewQueueDue: 41,
      effectReviewTotal: 41,
      feedbackApplied: 41,
      effectReviewContinueWatch: 41,
    },
    handoff: {
      kpiSummary: {
        status: 'off_track',
        current: {
          sales: 525427.69,
          units: 3663,
          netProfitRate: 0.1941,
          acos: 0.1998,
          refundRate: 0.0546,
          adCostShare: 0.1012,
        },
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
            gap: {
              salesGap: 15653.19,
              unitsGap: 91,
              netProfitRateGap: 0.0006,
              acosGap: 0.0021,
              refundRateGap: 0.0018,
              adCostShareGap: 0,
            },
          },
        },
        finalTarget: {
          salesGap: 154572.31,
          unitsGap: 937,
          estimatedNetProfitGap: 37014.49,
          acosGap: 0.0198,
          refundRateGap: 0.0166,
        },
      },
    },
    files: {
      dashboardFile: 'D:\\ad-ops-workbench\\data\\reports\\daily_dashboard_2026-05-21.html',
      kpiRecoveryNextActionsFile: 'D:\\ad-ops-workbench\\data\\tasks\\kpi_recovery_next_actions_2026-05-21.md',
    },
  });

  writeJson(approvalReviewFile, {
    summary: {
      total: 4,
      recommendApprove: 1,
      approvalNeeded: 1,
      hold: 1,
      blocked: 1,
    },
    items: [{
      sku: 'KZ5816',
      entityType: 'campaign',
      actionType: 'budget',
      campaignName: 'asin_vip party_kz5816',
      current: 5.44,
      suggested: 6.8,
      decision: 'recommend_approve',
      reasonCode: 'controlled_profitable_budget_lift',
      operatorAction: 'approve one controlled lift',
      metrics: { orders: 21, acos: 0.221, profitRate: 0.261, invDays: 31, units7: 67 },
    }, {
      sku: 'HL4017',
      entityType: 'campaign',
      actionType: 'budget',
      campaignName: 'auto2_spikes mat_hl4017',
      current: 18.75,
      suggested: 23.44,
      decision: 'approval_needed',
      reasonCode: 'profit_or_inventory_guard_tight',
      operatorAction: 'approve only with rollback check',
      metrics: { orders: 11, acos: 0.213, profitRate: 0.232, invDays: 27, units7: 14 },
    }, {
      sku: 'CL3650',
      entityType: 'campaign',
      actionType: 'budget',
      campaignName: 'asin_red chili_cl3650',
      current: 20,
      suggested: 25,
      decision: 'hold',
      reasonCode: 'inventory_tight_before_budget_lift',
      operatorAction: 'hold budget lift',
      metrics: { orders: 30, acos: 0.095, profitRate: 0.245, invDays: 11, units7: 8 },
    }, {
      sku: 'GM3940',
      entityType: 'autoTarget',
      actionType: 'bid',
      campaignName: 'auto_bible verse necklace_gm3940',
      current: 0.22,
      suggested: 0.25,
      decision: 'blocked',
      reasonCode: 'no_recent_units_and_inventory_not_deep',
      operatorAction: 'repair listing/traffic evidence first',
      metrics: { orders: 0, profitRate: 0.199, invDays: 20, units7: 0 },
    }],
  });
  writeJson(extendedSelectionReportFile, {
    ok: true,
    results: [{
      request: { key: 'flowThemeMain', body: { uTime: '2026-04', dateType: 2 } },
      api: { ok: true, code: 200, result: { records: [{ patternSt: 'christmas towel' }], total: 1 } },
    }, {
      request: { key: 'storeFeedbackList', query: { uTime: '2026-04-01', myCollection: 0 } },
      api: { ok: true, code: 200, result: { records: [{ accountName: 'Pattern.', count30Day: 5027 }], total: 1 } },
    }],
  });

  const result = run({
    date: '2026-05-21',
    closedLoopFile,
    approvalReviewFile,
    extendedSelectionReportFile,
    outFile,
    markdownFile,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.dailyClosureStatus, 'needs_recovery');
  assert.strictEqual(result.summary.recommendApprove, 1);
  assert.strictEqual(result.summary.approvalNeeded, 1);
  assert.strictEqual(result.summary.hold, 1);
  assert.strictEqual(result.summary.blocked, 1);
  assert.strictEqual(result.summary.dueReviews, 41);

  const json = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(json.actions.recommendApprove[0].sku, 'KZ5816');
  assert.strictEqual(json.actions.trueApprovalNeeded[0].sku, 'HL4017');
  assert.strictEqual(json.actions.hold[0].sku, 'CL3650');
  assert.strictEqual(json.actions.blocked[0].sku, 'GM3940');
  assert.strictEqual(json.selectionKpiEvidence.flowTheme.main.rowCount, 1);
  assert.strictEqual(json.selectionKpiEvidence.storeFeedback.list.rowCount, 1);

  const markdown = fs.readFileSync(markdownFile, 'utf8');
  assert.ok(markdown.includes('# 月 KPI 运营摘要 - 2026-05-21'));
  assert.ok(markdown.includes('业务日期：2026-05-20；数据日期：2026-05-19'));
  assert.ok(markdown.includes('KPI 仍未追回'));
  assert.ok(markdown.includes('下一业务日验收线'));
  assert.ok(markdown.includes('销售至少 543,689.74'));
  assert.ok(markdown.includes('## 推荐批准'));
  assert.ok(markdown.includes('KZ5816'));
  assert.ok(markdown.includes('## 真正需要确认'));
  assert.ok(markdown.includes('HL4017'));
  assert.ok(markdown.includes('## 暂缓'));
  assert.ok(markdown.includes('CL3650'));
  assert.ok(markdown.includes('## 阻塞'));
  assert.ok(markdown.includes('GM3940'));
  assert.ok(markdown.includes('Selection KPI evidence: ready=true'));
  assert.ok(markdown.includes('flowThemeRows=1; storeFeedbackRows=1'));
  assert.ok(markdown.includes('复查覆盖：dueReviews 41；effectReviewTotal 41；feedbackApplied 41'));
}

console.log('month_kpi_operator_digest tests passed');
