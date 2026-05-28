const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyDailyClosureArtifacts } = require('../scripts/execute/verify_daily_closure_artifacts');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function sampleReport() {
  return {
    outputDate: '2026-05-20',
    businessDate: '2026-05-19',
    dataDate: '2026-05-18',
    closedLoop: true,
    summary: {
      closedLoop: true,
      dailyClosureStatus: 'partial',
      dailyComplete: false,
      dailyClosureReasons: ['deposit_partial', 'deposit_missing_raw', 'kpi_off_track', 'operating_needs_recovery'],
      dataLagDays: 1,
      depositStatus: 'partial',
      depositMissingCount: 3,
      recoveryGateTargetBusinessDate: '2026-05-20',
      kpiGateStatus: 'target_set_actual_pending',
      kpiStatus: 'off_track',
      operatingClosureStatus: 'needs_recovery',
      landedActionSuccess: 61,
      landedActionManualReview: 12,
      writeApprovalNeeded: 0,
      writeBlocked: 0,
      feedbackApplied: 14,
    },
    handoff: {
      localDate: '2026-05-20',
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      summary: {
        dailyClosureStatus: 'partial',
        dailyComplete: false,
        dailyClosureReasons: ['deposit_partial', 'deposit_missing_raw', 'kpi_off_track', 'operating_needs_recovery'],
      },
      dataFreshness: {
        businessDate: '2026-05-19',
        dataDate: '2026-05-18',
        dataLagDays: 1,
        status: 'previous_day',
        snapshotStale: false,
      },
      depositStatus: {
        status: 'partial',
        missing: ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv'],
        suspicious: [],
      },
      kpiSummary: {
        recoveryPace: {
          nextBusinessDayTarget: {
            businessDate: '2026-05-20',
            salesTarget: 541080.88,
          },
        },
      },
    },
  };
}

function sampleRawRecoveryQueue() {
  return {
    date: '2026-05-20',
    status: 'open',
    items: [
      { missingClass: 'sales_core_original_xlsx', state: 'needs_redownload' },
      { missingClass: 'inventory_original_csv', state: 'needs_redownload' },
      { missingClass: 'ad_full_original_csv', state: 'needs_redownload' },
    ],
    summary: {
      missingRawOriginals: 3,
      sameDateCandidates: 0,
      staleCandidates: 0,
      needsRedownload: 3,
    },
  };
}

function writeRawRecoveryArtifacts(jsonFile, markdownFile) {
  writeJson(jsonFile, sampleRawRecoveryQueue());
  writeText(markdownFile, [
    '# Raw recovery queue - 2026-05-20',
    '- Status: open',
    '- Missing raw originals: 3',
    '- Needs redownload: 3',
    '| sales_core_original_xlsx | needs_redownload |',
    '| inventory_original_csv | needs_redownload |',
    '| ad_full_original_csv | needs_redownload |',
  ].join('\n'));
}

function sampleLandedActionConflictAudit(overrides = {}) {
  return {
    date: '2026-05-20',
    summary: {
      liveRows: 61,
      latestRunId: 'ops-test',
      latestRunRows: 1,
      sameEntityMultiCount: 0,
      sameEntityReverseCount: 0,
      sameNameReverseDifferentEntityCount: 0,
      latestRunMixedSkuCount: 0,
      status: 'clear',
      ...(overrides.summary || {}),
    },
    sameEntityReverse: overrides.sameEntityReverse || [],
    sameNameReverseDifferentEntity: overrides.sameNameReverseDifferentEntity || [],
    latestRunBySku: overrides.latestRunBySku || [],
    decision: overrides.decision || 'No landed action conflict found.',
  };
}

function writeLandedActionConflictAudit(jsonFile, markdownFile, overrides = {}) {
  const audit = sampleLandedActionConflictAudit(overrides);
  writeJson(jsonFile, audit);
  const lines = [
    '# Landed action conflict audit - 2026-05-20',
    '',
    `- Status: ${audit.summary.status}`,
    `- Same entity reverse conflicts: ${audit.summary.sameEntityReverseCount}`,
    `- Same-name mixed direction groups: ${audit.summary.sameNameReverseDifferentEntityCount}`,
  ];
  if (audit.summary.sameNameReverseDifferentEntityCount > 0) {
    lines.push('', '## Same-name mixed direction review', '', '| SKU | Review |', '| --- | --- |', '| SKU1 | mixed_direction_review |');
  }
  writeText(markdownFile, lines.join('\n'));
}

function writeDryRunDecisionArtifacts(jsonFile, markdownFile) {
  writeJson(jsonFile, {
    date: '2026-05-20',
    summary: {
      total: 37,
      skuCount: 31,
      byDecision: {
        executed: 3,
        autonomous_recommendation: 0,
        watch_only: 19,
        blocked: 12,
        approval_needed: 3,
      },
    },
    items: [],
  });
  writeText(markdownFile, [
    '# KPI recovery dry-run decisions - 2026-05-20',
    '',
    '- approval_needed: 3',
    '- blocked: 12',
    '- watch_only: 19',
  ].join('\n'));
}

function writeNextActionsArtifact(markdownFile) {
  writeText(markdownFile, [
    '# KPI recovery next actions - 2026-05-20',
    '',
    '## Account Gate',
    '- KPI gate: fail.',
    '',
    '## Already Landed',
    '| SKU | Entity | Bid | Evidence | Decision |',
    '| --- | --- | ---: | --- | --- |',
    '| DONE1 | keyword: `done keyword` | 0.20 -> 0.23 | orders7=3; ACOS7=4.00%; invDays=80; netProfit=20.00% | landed |',
    '',
    '## High-Priority Watch Pool',
    '| SKU | Entity | Bid | Evidence | Decision |',
    '| --- | --- | ---: | --- | --- |',
    '| WATCH1 | keyword: `watch keyword` | 0.20 -> 0.23 | orders7=1; ACOS7=4.00%; invDays=80; netProfit=20.00% | watch |',
    '',
    '## Blocked Pool',
    '| SKU | Entity | Bid | Evidence | Decision |',
    '| --- | --- | ---: | --- | --- |',
    '| BLOCK1 | keyword: `blocked keyword` | 0.20 -> 0.23 | orders7=1; ACOS7=4.00%; invDays=20; netProfit=20.00% | blocked |',
    '',
    '## True Approval Needed',
    '| SKU | Entity | Bid | Evidence | Decision |',
    '| --- | --- | ---: | --- | --- |',
    '| APPROVE1 | keyword: `approval keyword` | 0.20 -> 0.23 | orders7=1; ACOS7=4.00%; invDays=80; netProfit=20.00% | approval |',
  ].join('\n'));
}

function writeApprovalReviewArtifacts(jsonFile, markdownFile) {
  writeJson(jsonFile, {
    date: '2026-05-20',
    summary: {
      total: 9,
      recommendApprove: 2,
      approvalNeeded: 3,
      hold: 2,
      blocked: 2,
    },
    items: [],
  });
  writeText(markdownFile, [
    '# KPI approval review - 2026-05-20',
    '',
    '## Summary',
    '- total 9; SKUs 7; recommendApprove 2; approvalNeeded 3; hold 2; blocked 2.',
    '',
    '## recommend_approve',
    '- KZ5816',
    '',
    '## approval_needed',
    '- TH3353',
    '',
    '## hold',
    '- CL3650',
    '',
    '## blocked',
    '- GM3940',
  ].join('\n'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-ok-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const operatorCheckpointFile = path.join(tmpDir, 'kpi_recovery_operator_checkpoint_2026-05-20.md');
  const rawRecoveryQueueFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.json');
  const rawRecoveryMarkdownFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.md');
  const landedActionConflictAuditFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const landedActionConflictAuditMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  writeJson(closedLoopFile, sampleReport());
  writeJson(hubFile, { summary: { dueReviews: 0 } });
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '## 已落地动作沉淀',
    '- 当天累计：成功 61，需人工复核 12，跳过 0，失败/阻塞 0。',
    '- 数据时效：businessDate 2026-05-19；dataDate 2026-05-18；滞后 1 天；状态 previous_day。',
    '- 下一业务日验收线（businessDate 2026-05-20）：总销售至少 541,080.88。',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 · businessDate 2026-05-19 · dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '已落地动作 <div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '下一业务日验收线 2026-05-20',
    '</html>',
  ].join('\n'));
  writeText(operatorCheckpointFile, [
    '# KPI recovery operator checkpoint - 2026-05-20',
    '',
    '- Business date: 2026-05-20',
    '- Data date: 2026-05-19',
    '- Current status: partial; closedLoop=true; dailyComplete=false.',
    '## KPI gate result',
    '- Gate status: fail.',
    '- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.',
    'Next recovery target for 2026-05-21: sales >= 543,689.74.',
    '## Data deposit state',
    '- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv.',
    '## Action pools',
    '| KPI recovery dry-run | highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z | not counted as landed actions |',
  ].join('\n'));

  writeRawRecoveryArtifacts(rawRecoveryQueueFile, rawRecoveryMarkdownFile);
  writeLandedActionConflictAudit(landedActionConflictAuditFile, landedActionConflictAuditMarkdownFile);

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    hubFile,
    operatorCheckpointFile,
    rawRecoveryQueueFile,
    rawRecoveryMarkdownFile,
    landedActionConflictAuditFile,
    landedActionConflictAuditMarkdownFile,
  });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.summary.businessDate, '2026-05-19');
  assert.strictEqual(result.summary.dataLagDays, 1);
  assert.strictEqual(result.summary.kpiGateStatus, 'target_set_actual_pending');
  assert.strictEqual(result.summary.rawRecoveryRequired, true);
  assert.strictEqual(result.summary.rawRecoveryOpen, 3);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-pending-complete-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const report = sampleReport();
  report.summary.dailyClosureStatus = 'complete';
  report.summary.dailyComplete = true;
  report.summary.dailyClosureReasons = [];
  report.handoff.summary.dailyClosureStatus = 'complete';
  report.handoff.summary.dailyComplete = true;
  report.handoff.summary.dailyClosureReasons = [];
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-19',
    '鏁版嵁鏃ユ湡锛?026-05-18',
    '- dailyClosureStatus: complete; dailyComplete=true.',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '- next businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-19 路 dataDate 2026-05-18',
    'dailyClosureStatus: complete',
    'closedLoop=true | dailyComplete=true',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    '涓嬩竴涓氬姟鏃ラ獙鏀剁嚎 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('dailyComplete cannot be true')));
  assert.ok(result.errors.some(error => error.includes('dailyClosureStatus cannot be complete')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-dryrun-hidden-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const operatorCheckpointFile = path.join(tmpDir, 'kpi_recovery_operator_checkpoint_2026-05-20.md');
  writeJson(closedLoopFile, sampleReport());
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    actionPools: {
      recoveryDryRun: {
        highEfficiencyBidUps: 37,
        skuCount: 31,
        latestRunId: 'ops_2026-05-20T07-34-48-533Z',
      },
    },
  });
  writeText(handoffFile, [
    '# handoff',
    'businessDate 2026-05-19',
    'dataDate 2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '## landed evidence',
    '- landedActionSuccess 61; manual 12; blocked 0; feedback 14.',
    '- next businessDate 2026-05-20 target 541080.88.',
  ].join('\\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-19 路 dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '宸茶惤鍦板姩浣?<div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '涓嬩竴涓氬姟鏃ラ獙鏀剁嚎 2026-05-20',
    '</html>',
  ].join('\n'));

  writeText(operatorCheckpointFile, [
    '# KPI recovery operator checkpoint - 2026-05-20',
    '',
    '- Business date: 2026-05-20',
    '- Data date: 2026-05-19',
    '- Current status: partial; closedLoop=true; dailyComplete=false.',
    '## KPI gate result',
    '- Gate status: fail.',
    '- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.',
    'Next recovery target for 2026-05-21: sales >= 543,689.74.',
    '## Data deposit state',
    '- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv.',
    '## Action pools',
    '| KPI recovery dry-run | highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z | not counted as landed actions |',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    operatorCheckpointFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('handoff missing visible KPI recovery dry-run candidates')));
  assert.ok(result.errors.some(error => error.includes('dashboard missing visible KPI recovery dry-run candidates')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-closed-loop-false-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const report = sampleReport();
  report.closedLoop = false;
  report.summary.closedLoop = false;
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-19',
    '鏁版嵁鏃ユ湡锛?026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '- businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-19 路 dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=false | dailyComplete=false',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '涓嬩竴涓氬姟鏃ラ獙鏀剁嚎 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('closedLoop must be true')));
  assert.ok(result.errors.some(error => error.includes('summary.closedLoop must be true')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-intermediate-errors-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const report = sampleReport();
  report.summary.artifactVerificationOk = true;
  report.summary.artifactVerificationErrors = [];
  report.summary.intermediateArtifactVerificationErrors = ['dashboard missing stale dry-run latest run'];
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    'businessDate 2026-05-19',
    'dataDate 2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '## landed evidence',
    '- landedActionSuccess 61; manual 12; blocked 0; feedback 14.',
    '- next businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    'landedActionSuccess <div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    'next businessDate 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('summary.intermediateArtifactVerificationErrors must be empty')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-deposit-complete-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const report = sampleReport();
  report.summary.dailyClosureStatus = 'complete';
  report.summary.dailyComplete = true;
  report.summary.dailyClosureReasons = [];
  report.summary.kpiGateStatus = 'pass';
  report.handoff.summary.dailyClosureStatus = 'complete';
  report.handoff.summary.dailyComplete = true;
  report.handoff.summary.dailyClosureReasons = [];
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'pass',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    deposit: {
      status: 'partial',
      missing: ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv'],
      suspicious: [],
    },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: complete; dailyComplete=true.',
    '## KPI Gate',
    '- status: pass; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-18.',
    '- businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: complete',
    'closedLoop=true | dailyComplete=true',
    'KPI gate pass target 2026-05-20 actual 2026-05-20',
    '下一业务日验收线 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('dailyComplete cannot be true while deposit is incomplete')));
  assert.ok(result.errors.some(error => error.includes('dailyClosureStatus cannot be complete while deposit is incomplete')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-kpi-no-target-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const report = sampleReport();
  delete report.summary.recoveryGateTargetBusinessDate;
  delete report.handoff.kpiSummary;
  report.summary.kpiStatus = 'off_track';
  report.summary.operatingClosureStatus = 'needs_recovery';
  writeJson(closedLoopFile, report);
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '## KPI Gate',
    '- status: missing target.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('KPI recovery gate target missing')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-kpi-no-evidence-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'missing_kpi_recovery_checkpoint_2026-05-20.json');
  const report = sampleReport();
  report.summary.landedActionSuccess = 0;
  report.summary.landedActionManualReview = 0;
  report.summary.writeApprovalNeeded = 0;
  report.summary.writeBlocked = 0;
  report.summary.feedbackApplied = 0;
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '- businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '下一业务日验收线 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('KPI recovery evidence missing')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-operating-complete-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const report = sampleReport();
  report.summary.dailyClosureStatus = 'complete';
  report.summary.dailyComplete = true;
  report.summary.dailyClosureReasons = ['kpi_off_track', 'operating_needs_recovery'];
  report.summary.depositStatus = 'complete';
  report.summary.depositMissingCount = 0;
  report.summary.kpiGateStatus = 'pass';
  report.handoff.summary.dailyClosureStatus = 'complete';
  report.handoff.summary.dailyComplete = true;
  report.handoff.summary.dailyClosureReasons = ['kpi_off_track', 'operating_needs_recovery'];
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'pass',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: complete; dailyComplete=true.',
    '- reasons: kpi_off_track, operating_needs_recovery',
    '## KPI Gate',
    '- status: pass; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-18.',
    '- businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: complete',
    'closedLoop=true | dailyComplete=true',
    'KPI gate pass target 2026-05-20 actual 2026-05-20',
    'kpi_off_track, operating_needs_recovery',
    '下一业务日验收线 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('dailyComplete cannot be true while operatingClosureStatus is needs_recovery')));
  assert.ok(result.errors.some(error => error.includes('dailyClosureStatus cannot be complete while operatingClosureStatus is needs_recovery')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-workflow-open-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const report = sampleReport();
  report.summary.dailyClosureStatus = 'complete';
  report.summary.dailyComplete = true;
  report.summary.dailyClosureReasons = [];
  report.summary.depositStatus = 'complete';
  report.summary.depositMissingCount = 0;
  report.summary.kpiStatus = '';
  report.summary.operatingClosureStatus = 'complete';
  report.summary.dailyOperatingWorkflowStatus = 'needs_recovery';
  report.summary.dailyOperatingWorkflowBlockers = ['all_sku_review_missing', 'season_title_dry_run_missing'];
  report.summary.dailyOperatingWorkflow = {
    status: 'needs_recovery',
    required: true,
    blockers: ['all_sku_review_missing', 'season_title_dry_run_missing'],
    allSku: { status: 'missing', totalSkus: 0, mustReview: 0 },
    season: { status: 'missing', dryRunItems: 0, activeSeasonTasks: 0 },
    effectReview: { status: 'ready', dueReviews: 0, effectReviewTotal: 0, feedbackApplied: 0 },
  };
  report.handoff.summary.dailyClosureStatus = 'complete';
  report.handoff.summary.dailyComplete = true;
  report.handoff.summary.dailyClosureReasons = [];
  report.handoff.summary.dailyOperatingWorkflowStatus = 'needs_recovery';
  report.handoff.summary.dailyOperatingWorkflow = report.summary.dailyOperatingWorkflow;
  report.handoff.depositStatus = { status: 'complete', missing: [], suspicious: [] };
  delete report.summary.recoveryGateTargetBusinessDate;
  delete report.handoff.kpiSummary;
  writeJson(closedLoopFile, report);
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-19',
    '鏁版嵁鏃ユ湡锛?026-05-18',
    '- dailyClosureStatus: complete; dailyComplete=true.',
    '## 每日经营工作流',
    '- status: needs_recovery; blockers: all_sku_review_missing, season_title_dry_run_missing.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-19 | dataDate 2026-05-18',
    'dailyClosureStatus: complete',
    'closedLoop=true | dailyComplete=true',
    '每日经营工作流: status needs_recovery; blockers all_sku_review_missing, season_title_dry_run_missing',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('dailyComplete cannot be true while daily operating workflow needs recovery')));
  assert.ok(result.errors.some(error => error.includes('dailyClosureStatus cannot be complete while daily operating workflow needs recovery')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-checkpoint-ok-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const operatorCheckpointFile = path.join(tmpDir, 'kpi_recovery_operator_checkpoint_2026-05-20.md');
  const rawRecoveryQueueFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.json');
  const rawRecoveryMarkdownFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.md');
  const landedActionConflictAuditFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const landedActionConflictAuditMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  const kpiDryRunDecisionFile = path.join(tmpDir, 'kpi_recovery_dryrun_decisions_2026-05-20.json');
  const kpiDryRunDecisionMarkdownFile = path.join(tmpDir, 'kpi_recovery_dryrun_decisions_2026-05-20.md');
  const kpiRecoveryNextActionsFile = path.join(tmpDir, 'kpi_recovery_next_actions_2026-05-20.md');
  const report = sampleReport();
  report.businessDate = '2026-05-20';
  report.dataDate = '2026-05-19';
  report.summary.dataLagDays = 1;
  report.summary.recoveryGateTargetBusinessDate = '2026-05-20';
  report.summary.kpiGateStatus = 'fail';
  report.handoff.businessDate = '2026-05-20';
  report.handoff.dataDate = '2026-05-19';
  report.handoff.dataFreshness.businessDate = '2026-05-20';
  report.handoff.dataFreshness.dataDate = '2026-05-19';
  report.handoff.kpiSummary.recoveryPace.nextBusinessDayTarget.businessDate = '2026-05-21';
  report.handoff.kpiSummary.recoveryPace.nextBusinessDayTarget.salesTarget = 543689.74;
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 0 } });
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'fail',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    kpiGate: {
      status: 'fail',
      targetBusinessDate: '2026-05-20',
    },
    nextRecoveryTarget: {
      businessDate: '2026-05-21',
      sales: 543689.74,
      relationshipToGate: 'next_recovery_after_failed_gate',
    },
    nextChecks: [
      { name: 'track_next_recovery_target' },
    ],
    actionPools: {
      recoveryDryRun: {
        highEfficiencyBidUps: 37,
        skuCount: 31,
        latestRunId: 'ops_2026-05-20T07-34-48-533Z',
      },
    },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-20',
    '数据日期：2026-05-19',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: fail; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-19.',
    '## KPI Recovery Dry Run',
    '- highEfficiencyBidUps 37; SKUs 31; latestRun ops_2026-05-20T07-34-48-533Z.',
    '- status: planned dry-run only; not counted as landed actions.',
    '## KPI Dry-Run Decision Split',
    '- total 37; executed 3; autonomous 0; watch 19; blocked 12; approvalNeeded 3.',
    '## KPI Recovery Next Actions',
    '- file: kpi_recovery_next_actions_2026-05-20.md',
    '- alreadyLanded 3; watch 19; blocked 12; approvalNeeded 3.',
    '## 宸茶惤鍦板姩浣滄矇娣€',
    '- landedActionSuccess 61; manual 12; blocked 0; feedback 14.',
    '- businessDate 2026-05-20; dataDate 2026-05-19.',
    '- next businessDate 2026-05-21 target 543689.74.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-20 路 dataDate 2026-05-19',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '宸茶惤鍦板姩浣?<div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate fail target 2026-05-20 actual 2026-05-20',
    'KPI recovery dry-run: highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z',
    'dry-run note: not landed actions.',
    'KPI dry-run decision split: total 37; executed 3; autonomous 0; watch 19; blocked 12; approvalNeeded 3; file kpi_recovery_dryrun_decisions_2026-05-20.json',
    'KPI recovery next actions: file kpi_recovery_next_actions_2026-05-20.md; alreadyLanded 3; watch 19; blocked 12; approvalNeeded 3',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '上一验收线回查 2026-05-20',
    '</html>',
  ].join('\n'));

  writeText(operatorCheckpointFile, [
    '# KPI recovery operator checkpoint - 2026-05-20',
    '',
    '- Business date: 2026-05-20',
    '- Data date: 2026-05-19',
    '- Current status: partial; closedLoop=true; dailyComplete=false.',
    '## KPI gate result',
    '- Gate status: fail.',
    '- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.',
    'Next recovery target for 2026-05-21: sales >= 543,689.74.',
    '## Data deposit state',
    '- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv.',
    '## Action pools',
    '| KPI recovery dry-run | highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z | not counted as landed actions |',
  ].join('\\n'));

  writeRawRecoveryArtifacts(rawRecoveryQueueFile, rawRecoveryMarkdownFile);
  writeLandedActionConflictAudit(landedActionConflictAuditFile, landedActionConflictAuditMarkdownFile);
  writeDryRunDecisionArtifacts(kpiDryRunDecisionFile, kpiDryRunDecisionMarkdownFile);
  writeNextActionsArtifact(kpiRecoveryNextActionsFile);

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    operatorCheckpointFile,
    rawRecoveryQueueFile,
    rawRecoveryMarkdownFile,
    landedActionConflictAuditFile,
    landedActionConflictAuditMarkdownFile,
    kpiDryRunDecisionFile,
    kpiDryRunDecisionMarkdownFile,
    kpiRecoveryNextActionsFile,
    hubFile,
  });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.summary.nextRecoveryTarget, '2026-05-21');
  assert.strictEqual(result.summary.kpiCheckpointNextRecoveryTarget, '2026-05-21');
  assert.strictEqual(result.summary.recoveryDryRunHighEfficiencyBidUps, 37);
  assert.strictEqual(result.summary.recoveryDryRunDecisionTotal, 37);
  assert.strictEqual(result.summary.kpiRecoveryNextActionsReady, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-next-actions-hidden-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const kpiDryRunDecisionFile = path.join(tmpDir, 'kpi_recovery_dryrun_decisions_2026-05-20.json');
  const kpiDryRunDecisionMarkdownFile = path.join(tmpDir, 'kpi_recovery_dryrun_decisions_2026-05-20.md');
  const kpiRecoveryNextActionsFile = path.join(tmpDir, 'kpi_recovery_next_actions_2026-05-20.md');
  const report = sampleReport();
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    actionPools: {
      recoveryDryRun: {
        highEfficiencyBidUps: 37,
        skuCount: 31,
        latestRunId: 'ops-test',
      },
    },
  });
  writeDryRunDecisionArtifacts(kpiDryRunDecisionFile, kpiDryRunDecisionMarkdownFile);
  writeNextActionsArtifact(kpiRecoveryNextActionsFile);
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-19',
    '鏁版嵁鏃ユ湡锛?026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '## KPI Recovery Dry Run',
    '- highEfficiencyBidUps 37; SKUs 31; latestRun ops-test.',
    '- status: planned dry-run only; not counted as landed actions.',
    '## KPI Dry-Run Decision Split',
    '- total 37; executed 3; autonomous 0; watch 19; blocked 12; approvalNeeded 3.',
    '- next businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'businessDate 2026-05-19 dataDate 2026-05-18',
    'dailyClosureStatus: partial dailyComplete=false',
    'KPI recovery dry-run: highEfficiencyBidUps 37; SKUs 31; latest ops-test',
    'dry-run note: not landed actions.',
    'KPI dry-run decision split: total 37; executed 3; autonomous 0; watch 19; blocked 12; approvalNeeded 3',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    kpiDryRunDecisionFile,
    kpiDryRunDecisionMarkdownFile,
    kpiRecoveryNextActionsFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('handoff missing KPI recovery next-actions')));
  assert.ok(result.errors.some(error => error.includes('dashboard missing KPI recovery next-actions')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-approval-hidden-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiApprovalReviewFile = path.join(tmpDir, 'kpi_approval_review_2026-05-20.json');
  const kpiApprovalReviewMarkdownFile = path.join(tmpDir, 'kpi_approval_review_2026-05-20.md');
  const report = sampleReport();
  report.summary.depositStatus = 'complete';
  report.summary.depositMissingCount = 0;
  report.summary.dailyClosureReasons = ['kpi_off_track', 'operating_needs_recovery'];
  report.summary.landedActionSuccess = 0;
  report.summary.landedActionManualReview = 0;
  report.summary.feedbackApplied = 0;
  report.summary.writeApprovalNeeded = 9;
  report.summary.writeBlocked = 9;
  report.summary.kpiApprovalReviewTotal = 9;
  report.summary.kpiApprovalRecommendApprove = 2;
  report.handoff.depositStatus = { status: 'complete', missing: [], suspicious: [] };
  report.handoff.summary.dailyClosureReasons = ['kpi_off_track', 'operating_needs_recovery'];
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeApprovalReviewArtifacts(kpiApprovalReviewFile, kpiApprovalReviewMarkdownFile);
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-19',
    '鏁版嵁鏃ユ湡锛?026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: kpi_off_track, operating_needs_recovery',
    '## KPI Gate',
    '- status: target_set_actual_pending; target 2026-05-20; actual 2026-05-19; dataDate 2026-05-18.',
    '## Write Status',
    '- mode: dry-run; eligible 0; approvalNeeded 9; blocked 9; stages 1; failed 0.',
    '- businessDate 2026-05-19; dataDate 2026-05-18.',
    '- next businessDate 2026-05-20 target 541080.88.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-19 路 dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    'KPI gate target_set_actual_pending target 2026-05-20 actual 2026-05-19',
    'approvalNeeded 9 blocked 9',
    'kpi_off_track, operating_needs_recovery',
    '涓嬩竴涓氬姟鏃ラ獙鏀剁嚎 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiApprovalReviewFile,
    kpiApprovalReviewMarkdownFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('handoff missing KPI approval review')));
  assert.ok(result.errors.some(error => error.includes('dashboard missing KPI approval review')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-month-digest-missing-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const monthKpiDigestFile = path.join(tmpDir, 'month_kpi_operator_digest_2026-05-20.json');
  const monthKpiDigestMarkdownFile = path.join(tmpDir, 'month_kpi_operator_digest_2026-05-20.md');
  const report = sampleReport();
  report.summary.monthKpiDigestReady = true;
  report.files = {
    monthKpiDigestFile,
    monthKpiDigestMarkdownFile,
  };
  writeJson(closedLoopFile, report);
  writeText(handoffFile, 'businessDate 2026-05-19 dataDate 2026-05-18 dailyClosureStatus: partial dailyComplete=false kpi_off_track operating_needs_recovery');
  writeText(dashboardFile, '<html>businessDate 2026-05-19 dataDate 2026-05-18 dailyClosureStatus: partial closedLoop=true dailyComplete=false kpi_off_track operating_needs_recovery</html>');

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    monthKpiDigestFile,
    monthKpiDigestMarkdownFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('missing month KPI digest')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-approval-next-actions-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiApprovalReviewFile = path.join(tmpDir, 'kpi_approval_review_2026-05-20.json');
  const kpiApprovalReviewMarkdownFile = path.join(tmpDir, 'kpi_approval_review_2026-05-20.md');
  const kpiRecoveryNextActionsFile = path.join(tmpDir, 'kpi_recovery_next_actions_2026-05-20.md');
  const report = sampleReport();
  report.summary.writeApprovalNeeded = 9;
  report.summary.kpiApprovalReviewTotal = 9;
  report.summary.kpiApprovalRecommendApprove = 2;
  report.summary.kpiApprovalHold = 2;
  report.summary.kpiApprovalBlocked = 2;
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'target_set_actual_pending',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeApprovalReviewArtifacts(kpiApprovalReviewFile, kpiApprovalReviewMarkdownFile);
  writeNextActionsArtifact(kpiRecoveryNextActionsFile);
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-19',
    '数据日期：2026-05-18',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: kpi_off_track, operating_needs_recovery',
    '## KPI Approval Review',
    '- file: kpi_approval_review_2026-05-20.md',
    '- total 9; recommendApprove 2; hold 2; blocked 2.',
    '## KPI Recovery Next Actions',
    '- file: kpi_recovery_next_actions_2026-05-20.md',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'businessDate 2026-05-19 dataDate 2026-05-18',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    'KPI approval review file kpi_approval_review_2026-05-20.json recommendApprove 2 hold 2 blocked 2',
    'KPI recovery next actions: file kpi_recovery_next_actions_2026-05-20.md',
    'kpi_off_track, operating_needs_recovery',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiApprovalReviewFile,
    kpiApprovalReviewMarkdownFile,
    kpiRecoveryNextActionsFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('KPI recovery next-actions missing approval review split')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-review-coverage-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue_2026-05-20.json');
  const effectReviewFile = path.join(tmpDir, 'effect_review_2026-05-20.json');
  const report = sampleReport();
  report.files = report.files || {};
  report.files.hubFile = hubFile;
  report.files.reviewQueueFile = reviewQueueFile;
  report.files.effectReviewFile = effectReviewFile;
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 3 } });
  writeJson(reviewQueueFile, { summary: { due: 3 }, due: [{ taskId: 'r1' }, { taskId: 'r2' }, { taskId: 'r3' }] });
  writeJson(effectReviewFile, { summary: { total: 1 }, results: [{ taskId: 'r1' }] });
  writeText(handoffFile, '业务日期：2026-05-19\n数据日期：2026-05-18\ndailyClosureStatus: partial\ndailyComplete=false\nkpi_off_track\noperating_needs_recovery\nbusinessDate 2026-05-20\n');
  writeText(dashboardFile, '<html>businessDate 2026-05-19 dataDate 2026-05-18 dailyClosureStatus: partial closedLoop=true dailyComplete=false kpi_off_track operating_needs_recovery target 2026-05-20</html>');

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    hubFile,
    reviewQueueFile,
    effectReviewFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('effect review coverage too small')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-review-visibility-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue_2026-05-20.json');
  const effectReviewFile = path.join(tmpDir, 'effect_review_2026-05-20.json');
  const report = sampleReport();
  report.files = report.files || {};
  report.files.hubFile = hubFile;
  report.files.reviewQueueFile = reviewQueueFile;
  report.files.effectReviewFile = effectReviewFile;
  report.summary.feedbackApplied = 3;
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 3 } });
  writeJson(reviewQueueFile, { summary: { due: 3 }, due: [{ taskId: 'r1' }, { taskId: 'r2' }, { taskId: 'r3' }] });
  writeJson(effectReviewFile, { summary: { total: 3 }, results: [{ taskId: 'r1' }, { taskId: 'r2' }, { taskId: 'r3' }] });
  writeText(handoffFile, 'businessDate 2026-05-20 dataDate 2026-05-19 dailyClosureStatus: partial dailyComplete=false kpi_off_track operating_needs_recovery feedback 3');
  writeText(dashboardFile, '<html>businessDate 2026-05-20 dataDate 2026-05-19 dailyClosureStatus: partial closedLoop=true dailyComplete=false kpi_off_track operating_needs_recovery feedback 3</html>');

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    hubFile,
    reviewQueueFile,
    effectReviewFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('handoff missing visible effect review coverage')));
  assert.ok(result.errors.some(error => error.includes('dashboard missing visible effect review coverage')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-review-feedback-scope-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const reviewQueueFile = path.join(tmpDir, 'review_queue_2026-05-20.json');
  const effectReviewFile = path.join(tmpDir, 'effect_review_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const report = sampleReport();
  report.files = report.files || {};
  report.files.hubFile = hubFile;
  report.files.reviewQueueFile = reviewQueueFile;
  report.files.effectReviewFile = effectReviewFile;
  report.summary.feedbackApplied = 3;
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 3, feedbackApplied: 3 } });
  writeJson(reviewQueueFile, { summary: { due: 3 }, due: [{ taskId: 'r1' }, { taskId: 'r2' }, { taskId: 'r3' }] });
  writeJson(effectReviewFile, { summary: { total: 3 }, results: [{ taskId: 'r1' }, { taskId: 'r2' }, { taskId: 'r3' }] });
  writeJson(kpiCheckpointFile, { landedEvidence: { feedbackApplied: 4 } });
  writeText(handoffFile, [
    'businessDate 2026-05-20 dataDate 2026-05-19 dailyClosureStatus: partial dailyComplete=false kpi_off_track operating_needs_recovery',
    '## Effect Review Coverage',
    '- dueReviews 3; reviewQueueDue 3; effectReviewTotal 3; feedbackApplied 3.',
  ].join('\n'));
  writeText(dashboardFile, '<html>businessDate 2026-05-20 dataDate 2026-05-19 dailyClosureStatus: partial closedLoop=true dailyComplete=false kpi_off_track operating_needs_recovery Effect review coverage dueReviews 3 effectReviewTotal 3 feedbackApplied 3</html>');

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    hubFile,
    reviewQueueFile,
    effectReviewFile,
    kpiCheckpointFile,
  });
  assert.ok(!result.errors.some(error => error.includes('handoff missing visible effect review coverage')));
  assert.ok(!result.errors.some(error => error.includes('dashboard missing visible effect review coverage')));
  assert.strictEqual(result.summary.feedbackApplied, 4);
  assert.strictEqual(result.summary.effectReviewFeedbackApplied, 3);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-checkpoint-landed-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const operatorCheckpointFile = path.join(tmpDir, 'kpi_recovery_operator_checkpoint_2026-05-20.md');
  const rawRecoveryQueueFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.json');
  const rawRecoveryMarkdownFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.md');
  const landedActionConflictAuditFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const landedActionConflictAuditMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  const report = sampleReport();
  report.businessDate = '2026-05-20';
  report.dataDate = '2026-05-19';
  report.summary.landedActionSuccess = 587;
  report.summary.kpiGateStatus = 'fail';
  report.summary.recoveryGateTargetBusinessDate = '2026-05-20';
  report.handoff.businessDate = '2026-05-20';
  report.handoff.dataDate = '2026-05-19';
  report.handoff.dataFreshness.businessDate = '2026-05-20';
  report.handoff.dataFreshness.dataDate = '2026-05-19';
  report.handoff.kpiSummary.recoveryPace.nextBusinessDayTarget.businessDate = '2026-05-21';
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 0 } });
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'fail',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    kpiGate: { status: 'fail', targetBusinessDate: '2026-05-20' },
    nextRecoveryTarget: { businessDate: '2026-05-21', relationshipToGate: 'next_recovery_after_failed_gate' },
    nextChecks: [{ name: 'track_next_recovery_target' }],
    landedEvidence: { landedActionSuccess: 588 },
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-20',
    '数据日期：2026-05-19',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: fail; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-19.',
    '## 已落地动作沉淀',
    '- 当天累计：成功 588，需人工复核 12，跳过 0，失败/阻塞 0。',
    '- businessDate 2026-05-20; dataDate 2026-05-19.',
    '- next businessDate 2026-05-21 target 543689.74.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-20 | dataDate 2026-05-19',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '已落地动作 <div class="status-value">588</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate fail target 2026-05-20 actual 2026-05-20',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '上一验收线回查 2026-05-20',
    '</html>',
  ].join('\n'));
  writeText(operatorCheckpointFile, [
    '# KPI recovery operator checkpoint - 2026-05-20',
    '',
    '- Business date: 2026-05-20',
    '- Data date: 2026-05-19',
    '- Current status: partial; closedLoop=true; dailyComplete=false.',
    '## KPI gate result',
    '- Gate status: fail.',
    '- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.',
    'Next recovery target for 2026-05-21: sales >= 543,689.74.',
    '## Data deposit state',
    '- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv.',
  ].join('\n'));
  writeRawRecoveryArtifacts(rawRecoveryQueueFile, rawRecoveryMarkdownFile);
  writeLandedActionConflictAudit(landedActionConflictAuditFile, landedActionConflictAuditMarkdownFile, {
    summary: {
      liveRows: 588,
      latestRunId: 'ops-test',
      latestRunRows: 1,
      sameNameReverseDifferentEntityCount: 1,
      latestRunMixedSkuCount: 1,
      status: 'review_needed',
    },
  });

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    hubFile,
    operatorCheckpointFile,
    rawRecoveryQueueFile,
    rawRecoveryMarkdownFile,
    landedActionConflictAuditFile,
    landedActionConflictAuditMarkdownFile,
  });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.summary.landedActionSuccess, 588);
  assert.strictEqual(result.summary.landedActionConflictStatus, 'review_needed');
  assert.strictEqual(result.summary.landedActionSameNameMixedCount, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-conflict-blocked-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const hubFile = path.join(tmpDir, 'operating_hub_2026-05-20.json');
  const operatorCheckpointFile = path.join(tmpDir, 'kpi_recovery_operator_checkpoint_2026-05-20.md');
  const rawRecoveryQueueFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.json');
  const rawRecoveryMarkdownFile = path.join(tmpDir, 'raw_recovery_queue_2026-05-20.md');
  const landedActionConflictAuditFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const landedActionConflictAuditMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  const report = sampleReport();
  report.businessDate = '2026-05-20';
  report.dataDate = '2026-05-19';
  report.summary.dataLagDays = 1;
  report.summary.recoveryGateTargetBusinessDate = '2026-05-20';
  report.summary.kpiGateStatus = 'fail';
  report.handoff.businessDate = '2026-05-20';
  report.handoff.dataDate = '2026-05-19';
  report.handoff.dataFreshness.businessDate = '2026-05-20';
  report.handoff.dataFreshness.dataDate = '2026-05-19';
  report.handoff.kpiSummary.recoveryPace.nextBusinessDayTarget.businessDate = '2026-05-21';
  writeJson(closedLoopFile, report);
  writeJson(hubFile, { summary: { dueReviews: 0 } });
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'fail',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    kpiGate: { status: 'fail', targetBusinessDate: '2026-05-20' },
    nextRecoveryTarget: { businessDate: '2026-05-21', relationshipToGate: 'next_recovery_after_failed_gate' },
    nextChecks: [{ name: 'track_next_recovery_target' }],
    landedEvidence: { landedActionSuccess: 61 },
  });
  writeText(handoffFile, [
    '# handoff',
    '涓氬姟鏃ユ湡锛?026-05-20',
    '鏁版嵁鏃ユ湡锛?026-05-19',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: fail; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-19.',
    '## landed evidence',
    '- landedActionSuccess 61; manual 12; blocked 0; feedback 14.',
    '- businessDate 2026-05-20; dataDate 2026-05-19.',
    '- next businessDate 2026-05-21 target 543689.74.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 | businessDate 2026-05-20 | dataDate 2026-05-19',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '宸茶惤鍦板姩浣?<div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate fail target 2026-05-20 actual 2026-05-20',
    'KPI recovery dry-run: highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z',
    'dry-run note: not landed actions.',
    'KPI dry-run decision split: total 37; executed 3; autonomous 0; watch 19; blocked 12; approvalNeeded 3; file kpi_recovery_dryrun_decisions_2026-05-20.json',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '涓婁竴楠屾敹绾垮洖鏌?2026-05-20',
    '</html>',
  ].join('\n'));
  writeText(operatorCheckpointFile, [
    '# KPI recovery operator checkpoint - 2026-05-20',
    '',
    '- Business date: 2026-05-20',
    '- Data date: 2026-05-19',
    '- Current status: partial; closedLoop=true; dailyComplete=false.',
    '## KPI gate result',
    '- Gate status: fail.',
    '- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.',
    'Next recovery target for 2026-05-21: sales >= 543,689.74.',
    '## Data deposit state',
    '- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv.',
    '## Action pools',
    '| KPI recovery dry-run | highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z | not counted as landed actions |',
  ].join('\n'));
  writeRawRecoveryArtifacts(rawRecoveryQueueFile, rawRecoveryMarkdownFile);
  writeLandedActionConflictAudit(landedActionConflictAuditFile, landedActionConflictAuditMarkdownFile, {
    summary: {
      sameEntityReverseCount: 1,
      status: 'blocked_conflict',
    },
    sameEntityReverse: [{ sku: 'SKU1' }],
  });

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
    hubFile,
    operatorCheckpointFile,
    rawRecoveryQueueFile,
    rawRecoveryMarkdownFile,
    landedActionConflictAuditFile,
    landedActionConflictAuditMarkdownFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('blocking same-entity reverse conflicts')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-checkpoint-bad-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const kpiGateFile = path.join(tmpDir, 'kpi_recovery_gate_2026-05-20.json');
  const kpiCheckpointFile = path.join(tmpDir, 'kpi_recovery_checkpoint_2026-05-20.json');
  const report = sampleReport();
  report.businessDate = '2026-05-20';
  report.dataDate = '2026-05-19';
  report.summary.dataLagDays = 1;
  report.summary.recoveryGateTargetBusinessDate = '2026-05-20';
  report.summary.kpiGateStatus = 'fail';
  report.handoff.businessDate = '2026-05-20';
  report.handoff.dataDate = '2026-05-19';
  report.handoff.dataFreshness.businessDate = '2026-05-20';
  report.handoff.dataFreshness.dataDate = '2026-05-19';
  report.handoff.kpiSummary.recoveryPace.nextBusinessDayTarget.businessDate = '2026-05-21';
  writeJson(closedLoopFile, report);
  writeJson(kpiGateFile, {
    outputDate: '2026-05-20',
    status: 'fail',
    target: { businessDate: '2026-05-20', salesTarget: 541080.88 },
  });
  writeJson(kpiCheckpointFile, {
    kpiGate: {
      status: 'fail',
      targetBusinessDate: '2026-05-20',
    },
    nextRecoveryTarget: {
      businessDate: '2026-05-20',
      relationshipToGate: 'current_gate_target',
    },
    nextChecks: [],
  });
  writeText(handoffFile, [
    '# handoff',
    '业务日期：2026-05-20',
    '数据日期：2026-05-19',
    '- dailyClosureStatus: partial; dailyComplete=false.',
    '- reasons: deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '- missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    '## KPI Gate',
    '- status: fail; target 2026-05-20; actual 2026-05-20; dataDate 2026-05-19.',
    '## 宸茶惤鍦板姩浣滄矇娣€',
    '- landedActionSuccess 61; manual 12; blocked 0; feedback 14.',
    '- businessDate 2026-05-20; dataDate 2026-05-19.',
    '- next businessDate 2026-05-21 target 543689.74.',
  ].join('\n'));
  writeText(dashboardFile, [
    '<html>',
    'localDate 2026-05-20 路 businessDate 2026-05-20 路 dataDate 2026-05-19',
    'dailyClosureStatus: partial',
    'closedLoop=true | dailyComplete=false',
    '宸茶惤鍦板姩浣?<div class="status-value">61</div> failed 0 / manual 12',
    'missing raw: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv',
    'KPI gate fail target 2026-05-20 actual 2026-05-20',
    'deposit_partial, deposit_missing_raw, kpi_off_track, operating_needs_recovery',
    '上一验收线回查 2026-05-20',
    '</html>',
  ].join('\n'));

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
    kpiGateFile,
    kpiCheckpointFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('kpiCheckpoint.nextRecoveryTarget.businessDate')));
  assert.ok(result.errors.some(error => error.includes('kpiCheckpoint.nextRecoveryTarget.relationshipToGate')));
  assert.ok(result.errors.some(error => error.includes('track_next_recovery_target')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-closure-artifacts-bad-'));
  const closedLoopFile = path.join(tmpDir, 'agent_closed_loop_2026-05-20.json');
  const handoffFile = path.join(tmpDir, 'agent_handoff_2026-05-20.md');
  const dashboardFile = path.join(tmpDir, 'daily_dashboard_2026-05-20.html');
  const report = sampleReport();
  report.handoff.businessDate = '2026-05-20';
  report.handoff.dataFreshness.businessDate = '2026-05-20';
  report.handoff.dataFreshness.dataLagDays = 2;
  writeJson(closedLoopFile, report);
  writeText(handoffFile, '业务日期：2026-05-20\n数据时效：businessDate 2026-05-20；dataDate 2026-05-18；滞后 2 天；状态 warning。\n');
  writeText(dashboardFile, 'localDate 2026-05-20 · businessDate 2026-05-20 · dataDate 2026-05-18\ndailyClosureStatus: partial\n');

  const result = verifyDailyClosureArtifacts({
    date: '2026-05-20',
    closedLoopFile,
    handoffFile,
    dashboardFile,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('handoff.businessDate')));
  assert.ok(result.errors.some(error => error.includes('dataLagDays')));
  assert.ok(result.errors.some(error => error.includes('dashboard businessDate')));
  assert.ok(result.errors.some(error => error.includes('KPI gate status')));
}

console.log('daily_closure_artifacts tests passed');
