const fs = require('fs');
const path = require('path');
const { runAgentReviewQueue } = require('./run_agent_review_queue');
const { runAgentOperatingHub } = require('./run_agent_operating_hub');
const { runAgentCommandRunner } = require('./run_agent_command_runner');
const { runAgentWriteExecution } = require('./run_agent_write_execution');
const { runAgentExecutionFeedback } = require('./run_agent_execution_feedback');
const { runAgentHandoffSummary } = require('./run_agent_handoff_summary');
const { generateDailyDashboard } = require('./reports/generate_daily_dashboard');
const {
  archiveSameDateRawCandidates,
  buildRawRecoveryQueue,
  buildRawRecoveryQueueMarkdown,
  classifyDailyDeposit,
  defaultRecoveryQueueFile,
  defaultOutFile: defaultDepositStatusFile,
} = require('./execute/inspect_daily_deposit');
const { run: runKpiRecoveryGate } = require('./execute/evaluate_kpi_recovery_gate');
const { run: runKpiRecoveryCheckpoint } = require('./execute/generate_kpi_recovery_checkpoint');
const { run: runKpiDryRunDecisions } = require('./execute/generate_kpi_recovery_dryrun_decisions');
const { run: runKpiApprovalReview } = require('./execute/generate_kpi_approval_review');
const { run: runMonthKpiOperatorDigest } = require('./execute/generate_month_kpi_operator_digest');
const { verifyDailyClosureArtifacts } = require('./execute/verify_daily_closure_artifacts');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dateFromAdjustmentFile(file = '') {
  const match = text(file).match(/adjustments_(\d{4}-\d{2}-\d{2})\.json$/i);
  return match ? match[1] : '';
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inspectKpiSnapshotQuality(snapshot = {}) {
  const rows = Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows : [];
  const positiveRows = rows.filter(row => numberValue(row.order_sales) > 0 || numberValue(row.sale_num) > 0);
  const zeroTotalRows = rows.filter(row => {
    const title = text(row.seller_title || row.seller || row.name || '');
    const normalizedTitle = title.toLowerCase();
    const looksLikeTotal = rows.length === 1 || normalizedTitle.includes('total') || normalizedTitle.includes('summary') || normalizedTitle.includes('selected');
    return looksLikeTotal && numberValue(row.order_sales) === 0 && numberValue(row.sale_num) === 0;
  });
  const suspiciousZeroSellerSalesTotal = rows.length > 0 && positiveRows.length === 0 && zeroTotalRows.length > 0;
  return {
    sellerSalesRows: rows.length,
    positiveSellerSalesRows: positiveRows.length,
    suspiciousZeroSellerSalesTotal,
    usableSellerSales: positiveRows.length > 0 && !suspiciousZeroSellerSalesTotal,
  };
}

function normalizeKpiSnapshotOptions(options = {}) {
  const currentFile = options.snapshotFile || '';
  if (options.snapshot || !currentFile) return { options, warnings: [], originalSnapshotFile: currentFile, effectiveSnapshotFile: currentFile };

  const currentSnapshot = readJson(currentFile, {});
  const currentQuality = inspectKpiSnapshotQuality(currentSnapshot);
  if (!currentQuality.suspiciousZeroSellerSalesTotal) {
    return { options, warnings: [], originalSnapshotFile: currentFile, effectiveSnapshotFile: currentFile };
  }

  const fallbackFile = path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const fallbackQuality = inspectKpiSnapshotQuality(readJson(fallbackFile, {}));
  const warnings = [{
    type: 'snapshot_seller_sales_total_zero',
    file: currentFile,
    sellerSalesRows: currentQuality.sellerSalesRows,
    fallbackFile: fallbackQuality.usableSellerSales ? fallbackFile : '',
  }];
  if (fallbackQuality.usableSellerSales) {
    return {
      options: { ...options, snapshotFile: fallbackFile },
      warnings,
      originalSnapshotFile: currentFile,
      effectiveSnapshotFile: fallbackFile,
    };
  }
  return { options, warnings, originalSnapshotFile: currentFile, effectiveSnapshotFile: currentFile };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(outDir, prefix, today, ext = 'json') {
  return path.join(outDir || DEFAULT_OUT_DIR, `${prefix}_${today}.${ext}`);
}

function dashboardFileFor(today, outDir = '') {
  return path.join(outDir || path.join(ROOT, 'data', 'reports'), `daily_dashboard_${dateOnly(today)}.html`);
}

function runDailyDepositStatus(options = {}, today = '') {
  const date = dateOnly(today);
  const classifyOptions = {
    snapshotFile: options.snapshotFile || '',
    trendRoot: options.depositTrendRoot || '',
    rawRoot: options.depositRawRoot || '',
    rawCandidateRoots: options.rawCandidateRoots || undefined,
    rawCandidateDays: options.rawCandidateDays,
    rawCandidateLimit: options.rawCandidateLimit,
  };
  let status = classifyDailyDeposit(date, classifyOptions);
  let archive = null;
  if (options.archiveDepositCandidates === true) {
    archive = archiveSameDateRawCandidates(status);
    status = classifyDailyDeposit(date, classifyOptions);
    status.rawCandidateArchive = archive;
    status.notes = [
      ...(status.notes || []),
      archive.copied.length
        ? `Archived same-day raw download candidates: ${archive.copied.length}.`
        : 'No same-day raw download candidates were archived.',
    ];
  }
  const outFile = options.depositStatusOutFile || options.depositStatusFile || defaultDepositStatusFile(status);
  writeJson(outFile, status);
  const recoveryQueue = status.rawRecoveryQueue || buildRawRecoveryQueue(status);
  const recoveryQueueFile = options.rawRecoveryQueueOutFile || options.rawRecoveryQueueFile || (
    options.outDir
      ? path.join(options.outDir, `raw_recovery_queue_${date}.json`)
      : defaultRecoveryQueueFile(status, 'json')
  );
  const recoveryQueueMarkdownFile = options.rawRecoveryMarkdownOutFile || options.rawRecoveryMarkdownFile || (
    options.outDir
      ? path.join(options.outDir, `raw_recovery_queue_${date}.md`)
      : defaultRecoveryQueueFile(status, 'md')
  );
  writeJson(recoveryQueueFile, recoveryQueue);
  fs.mkdirSync(path.dirname(recoveryQueueMarkdownFile), { recursive: true });
  fs.writeFileSync(recoveryQueueMarkdownFile, buildRawRecoveryQueueMarkdown(recoveryQueue), 'utf8');
  return { status, outFile, recoveryQueueFile, recoveryQueueMarkdownFile, recoveryQueue };
}

function skippedWriteExecution(timeContext = {}, reason = 'No write actions or action schema provided.') {
  const today = dateOnly(timeContext.businessDate || timeContext.runAt);
  return {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate: today,
    dataDate: dateOnly(timeContext.dataDate || today),
    sourceRunId: text(timeContext.sourceRunId || ''),
    mode: 'skipped',
    plan: { canExecute: false, blockers: [], summary: { totalActions: 0, eligibleActions: 0, blockedActions: 0 } },
    stages: [],
    summary: {
      totalActions: 0,
      eligibleActions: 0,
      readOnlyActions: 0,
      blockedActions: 0,
      executedStages: 0,
      failedStages: 0,
    },
    results: [{
      taskId: `agent_write_execution::${today}`,
      label: 'Low-risk write execution chain',
      ok: true,
      exitCode: 0,
      summary: reason,
      outputFiles: [],
      report: { verdict: 'skipped', nextStep: 'No write stage was entered in this run.' },
      at: text(timeContext.runAt || new Date().toISOString()),
      sourceRunId: text(timeContext.sourceRunId || ''),
    }],
  };
}

function shouldRunWriteExecution(options = {}) {
  return !!(options.ledger || options.ledgerFile || options.actionSchemaFile || options.actionsFile);
}

function buildTimeContext(options = {}) {
  return options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_closed_loop_${Date.now()}`,
  });
}

function buildEvidenceTimeContext(timeContext = {}, runSummary = {}, outputDate = '') {
  const summaryTime = runSummary.time || {};
  const localDate = dateOnly(summaryTime.localDate || timeContext.localDate || outputDate || timeContext.businessDate || timeContext.runAt);
  const businessDate = dateOnly(summaryTime.businessDate || runSummary.businessDate || timeContext.businessDate || outputDate || localDate);
  const dataDate = dateOnly(summaryTime.dataDate || runSummary.dataDate || timeContext.dataDate || businessDate);
  return {
    ...timeContext,
    localDate,
    businessDate,
    dataDate,
    siteTimezone: summaryTime.siteTimezone || timeContext.siteTimezone,
    localTimezone: summaryTime.localTimezone || timeContext.localTimezone,
  };
}

function buildDailyClosureStatus({
  commandFailed = 0,
  writeFailed = 0,
  writeBlocked = 0,
  dataFreshnessStatus = '',
  snapshotStale = false,
  kpiStatus = '',
  operatingClosureStatus = '',
  recoveryGateStatus = '',
  depositStatus = '',
  depositMissingCount = 0,
} = {}) {
  const reasons = [];
  if (commandFailed > 0) reasons.push('command_failed');
  if (writeFailed > 0) reasons.push('write_failed');
  if (writeBlocked > 0) reasons.push('write_blocked');
  if (depositStatus === 'blocked') reasons.push('deposit_blocked');
  if (depositStatus === 'partial') reasons.push('deposit_partial');
  if (depositMissingCount > 0) reasons.push('deposit_missing_raw');
  if (snapshotStale) reasons.push('snapshot_stale');
  if (dataFreshnessStatus === 'warning') reasons.push('data_quality_warning');
  if (kpiStatus === 'off_track') reasons.push('kpi_off_track');
  if (recoveryGateStatus === 'fail') reasons.push('recovery_gate_failed');
  if (operatingClosureStatus === 'blocked') reasons.push('operating_blocked');
  if (operatingClosureStatus === 'partial') reasons.push('operating_partial');
  if (operatingClosureStatus === 'needs_recovery') reasons.push('operating_needs_recovery');

  const uniqueReasons = [...new Set(reasons)];
  let status = 'complete';
  if (commandFailed > 0 || writeFailed > 0 || writeBlocked > 0 || depositStatus === 'blocked' || operatingClosureStatus === 'blocked') {
    status = 'blocked';
  } else if (depositStatus === 'partial' || depositMissingCount > 0 || snapshotStale || dataFreshnessStatus === 'warning' || operatingClosureStatus === 'partial') {
    status = 'partial';
  } else if (kpiStatus === 'off_track' || recoveryGateStatus === 'fail' || operatingClosureStatus === 'needs_recovery') {
    status = 'needs_recovery';
  }
  return {
    dailyClosureStatus: status,
    dailyClosureReasons: uniqueReasons,
    dailyComplete: status === 'complete',
  };
}

function closedLoopSummary({ commandResults = {}, writeExecution = {}, feedback = {}, handoff = {} } = {}) {
  const commandFailed = Number(commandResults.summary?.failed || 0);
  const writeFailed = Number(writeExecution.summary?.failedStages || 0);
  const writeBlocked = Number(writeExecution.summary?.blockedActions || 0);
  const hardWriteBlocked = Math.max(0, writeBlocked - Number(writeExecution.summary?.dryRunBlockedActions || 0));
  const handoffOperatingStatus = handoff.operatingStatus || {};
  const recoveryPace = handoff.kpiSummary?.recoveryPace || {};
  const recoveryGate = recoveryPace.nextBusinessDayGate || null;
  const recoveryTarget = recoveryPace.nextBusinessDayTarget || null;
  const depositStatus = handoff.depositStatus || {};
  const depositMissing = Array.isArray(depositStatus.missing) ? depositStatus.missing : [];
  const depositSuspicious = Array.isArray(depositStatus.suspicious) ? depositStatus.suspicious : [];
  const kpiStatus = text(handoff.summary?.kpiStatus || handoff.kpiSummary?.status || '');
  const dataFreshnessStatus = text(handoff.summary?.dataFreshnessStatus || handoff.dataFreshness?.status || '');
  const snapshotStale = handoff.summary?.snapshotStale ?? handoff.dataFreshness?.snapshotStale ?? false;
  const operatingClosureStatus = text(handoff.summary?.operatingClosureStatus || handoffOperatingStatus.status || '');
  const recoveryGateStatus = text(recoveryGate?.status || (recoveryTarget ? 'target_set' : 'missing'));
  const depositStatusText = text(depositStatus.status || handoff.summary?.depositStatus || '');
  const dailyClosure = buildDailyClosureStatus({
    commandFailed,
    writeFailed,
    writeBlocked: hardWriteBlocked,
    dataFreshnessStatus,
    snapshotStale,
    kpiStatus,
    operatingClosureStatus,
    recoveryGateStatus,
    depositStatus: depositStatusText,
    depositMissingCount: depositMissing.length,
  });
  return {
    closedLoop: commandFailed === 0 && writeFailed === 0 && hardWriteBlocked === 0 && !!handoff.markdown,
    ...dailyClosure,
    commandExecuted: Number(commandResults.summary?.executed || 0),
    commandFailed,
    writeMode: text(writeExecution.mode || ''),
    writeStages: Number(writeExecution.summary?.executedStages || 0),
    writeFailed,
    writeBlocked,
    writeApprovalNeeded: Number(writeExecution.summary?.approvalNeededActions || 0),
    feedbackApplied: Number(feedback.summary?.feedbackApplied || 0),
    dueReviews: Number(handoff.summary?.effectReviewDue || feedback.summary?.dueReviews || 0),
    reviewQueueDue: Number(handoff.summary?.reviewQueueDue || handoff.summary?.effectReviewDue || feedback.summary?.dueReviews || 0),
    effectReviewTotal: Number(handoff.summary?.effectReviewTotal || 0),
    effectReviewFeedbackApplied: Number(handoff.summary?.effectReviewFeedbackApplied || feedback.summary?.feedbackApplied || 0),
    effectReviewNeedsAction: Number(handoff.summary?.effectReviewNeedsAction || 0),
    effectReviewBlocked: Number(handoff.summary?.effectReviewBlocked || 0),
    effectReviewContinueWatch: Number(handoff.summary?.effectReviewContinueWatch || 0),
    effectReviewCloseRecommended: Number(handoff.summary?.effectReviewCloseRecommended || 0),
    landedActionSuccess: Number(handoff.summary?.landedActionSuccess || 0),
    landedActionFailed: Number(handoff.summary?.landedActionFailed || 0),
    landedActionManualReview: Number(handoff.summary?.landedActionManualReview || 0),
    kpiStatus,
    kpiRequiredMode: text(handoff.summary?.kpiRequiredMode || handoff.kpiSummary?.requiredMode || ''),
    dataFreshnessStatus,
    dataLagDays: handoff.summary?.dataLagDays ?? handoff.dataFreshness?.dataLagDays ?? null,
    snapshotStale,
    operatingClosureStatus,
    operatingClosureWarnings: Array.isArray(handoffOperatingStatus.warnings) ? handoffOperatingStatus.warnings : [],
    recoveryGateStatus,
    recoveryGateTargetBusinessDate: text(recoveryGate?.targetBusinessDate || recoveryTarget?.businessDate || ''),
    recoveryGateSalesTarget: recoveryGate?.target?.salesTarget ?? recoveryTarget?.salesTarget ?? null,
    recoveryGateUnitsTarget: recoveryGate?.target?.unitsTarget ?? recoveryTarget?.unitsTarget ?? null,
    recoveryGateNetProfitRateMin: recoveryGate?.target?.netProfitRateMin ?? recoveryTarget?.netProfitRateMin ?? null,
    recoveryGateAcosMax: recoveryGate?.target?.acosMax ?? recoveryTarget?.acosMax ?? null,
    recoveryGateRefundRateMax: recoveryGate?.target?.refundRateMax ?? recoveryTarget?.refundRateMax ?? null,
    recoveryGateAdCostShareMax: recoveryGate?.target?.adCostShareMax ?? recoveryTarget?.adCostShareMax ?? null,
    recoveryGateSalesGap: recoveryGate?.gap?.salesGap ?? null,
    recoveryGateUnitsGap: recoveryGate?.gap?.unitsGap ?? null,
    recoveryGateNetProfitRateGap: recoveryGate?.gap?.netProfitRateGap ?? null,
    recoveryGateAcosGap: recoveryGate?.gap?.acosGap ?? null,
    recoveryGateRefundRateGap: recoveryGate?.gap?.refundRateGap ?? null,
    recoveryGateAdCostShareGap: recoveryGate?.gap?.adCostShareGap ?? null,
    depositStatus: depositStatusText,
    depositMissingCount: depositMissing.length,
    depositSuspiciousCount: depositSuspicious.length,
    depositMissing,
    depositSuspicious: depositSuspicious.map(item => text(item.type || item)).filter(Boolean),
    handoffReady: !!handoff.markdown,
    kpiRecoveryNextActionsReady: handoff.summary?.kpiRecoveryNextActionsReady === true,
    monthKpiDigestReady: handoff.summary?.monthKpiDigestReady === true,
  };
}

function runAgentClosedLoop(options = {}) {
  const snapshotInput = normalizeKpiSnapshotOptions(options);
  options = snapshotInput.options;
  const snapshotInputWarnings = snapshotInput.warnings;
  const timeContext = buildTimeContext(options);
  const runSummary = readJson(options.dashboardSummaryFile || '', {});
  const summaryTime = runSummary.time || {};
  const today = dateOnly(options.today || summaryTime.localDate || timeContext.localDate || timeContext.businessDate || timeContext.runAt);
  const outputDate = dateOnly(today);
  const evidenceTimeContext = buildEvidenceTimeContext(timeContext, runSummary, outputDate);
  const outDir = ensureDir(options.outDir || DEFAULT_OUT_DIR);
  const hubFile = options.hubOutFile || options.hubFile || fileFor(outDir, 'operating_hub', today);
  const reviewQueueFile = options.reviewQueueOutFile || options.reviewFile || fileFor(outDir, 'review_queue', today);
  const effectReviewFile = options.effectReviewFile || fileFor(outDir, 'effect_review', today);
  const commandResultsFile = options.commandResultsOutFile || fileFor(outDir, 'command_results', today);
  const writeExecutionFile = options.writeExecutionOutFile || fileFor(outDir, 'write_execution', today);
  const feedbackFile = options.feedbackOutFile || fileFor(outDir, 'operating_hub_feedback', today);
  const handoffOutFile = options.handoffOutFile || fileFor(outDir, 'agent_handoff', today, 'md');
  const handoffJsonFile = options.handoffJsonOutFile || fileFor(outDir, 'agent_handoff', today, 'json');
  const closedLoopFile = options.outFile || fileFor(outDir, 'agent_closed_loop', today);
  const closureVerificationFile = options.closureVerificationOutFile || fileFor(outDir, 'daily_closure_verify', today);
  const kpiGateFile = options.kpiGateOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_gate_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${today}.json`)
  );
  const kpiCheckpointFile = options.kpiCheckpointOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_checkpoint_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${today}.json`)
  );
  const kpiOperatorCheckpointFile = options.kpiOperatorCheckpointOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_operator_checkpoint_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_operator_checkpoint_${today}.md`)
  );
  const kpiDryRunDecisionFile = options.kpiDryRunDecisionOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_dryrun_decisions_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${today}.json`)
  );
  const kpiDryRunDecisionMarkdownFile = options.kpiDryRunDecisionMarkdownOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_dryrun_decisions_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${today}.md`)
  );
  const kpiRecoveryNextActionsFile = options.kpiRecoveryNextActionsOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_recovery_next_actions_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `kpi_recovery_next_actions_${today}.md`)
  );
  const kpiApprovalReviewFile = options.kpiApprovalReviewOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_approval_review_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${today}.json`)
  );
  const kpiApprovalReviewMarkdownFile = options.kpiApprovalReviewMarkdownOutFile || (
    options.outDir
      ? path.join(outDir, `kpi_approval_review_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${today}.md`)
  );
  const monthKpiDigestFile = options.monthKpiDigestOutFile || (
    options.outDir
      ? path.join(outDir, `month_kpi_operator_digest_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${today}.json`)
  );
  const monthKpiDigestMarkdownFile = options.monthKpiDigestMarkdownOutFile || (
    options.outDir
      ? path.join(outDir, `month_kpi_operator_digest_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${today}.md`)
  );
  const landedActionConflictAuditDate = dateOnly(
    options.landedActionConflictAuditDate ||
    dateFromAdjustmentFile(options.adjustmentsFile) ||
    evidenceTimeContext.businessDate ||
    today
  );
  const landedActionConflictAuditFile = options.landedActionConflictAuditFile || (
    options.outDir
      ? path.join(outDir, `landed_action_conflict_audit_${landedActionConflictAuditDate}.json`)
      : path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${landedActionConflictAuditDate}.json`)
  );
  const landedActionConflictAuditMarkdownFile = options.landedActionConflictAuditMarkdownFile || (
    options.outDir
      ? path.join(outDir, `landed_action_conflict_audit_${landedActionConflictAuditDate}.md`)
      : path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${landedActionConflictAuditDate}.md`)
  );
  const landedActionConflictExpectedDateForVerifier = (options.landedActionConflictAuditFile || options.landedActionConflictAuditMarkdownFile)
    ? ''
    : landedActionConflictAuditDate;
  const expectedDashboardFile = options.dashboardFile || dashboardFileFor(today, options.dashboardOutDir || '');
  const depositStatusResult = options.generateDepositStatus === true
    ? runDailyDepositStatus(options, today)
    : { status: options.depositStatus || readJson(options.depositStatusFile, {}), outFile: options.depositStatusFile || '' };
  const rawRecoveryQueueFile = options.rawRecoveryQueueOutFile || options.rawRecoveryQueueFile || depositStatusResult.recoveryQueueFile || (
    options.outDir
      ? path.join(outDir, `raw_recovery_queue_${today}.json`)
      : path.join(ROOT, 'data', 'tasks', `raw_recovery_queue_${today}.json`)
  );
  const rawRecoveryMarkdownFile = options.rawRecoveryMarkdownOutFile || options.rawRecoveryMarkdownFile || depositStatusResult.recoveryQueueMarkdownFile || (
    options.outDir
      ? path.join(outDir, `raw_recovery_queue_${today}.md`)
      : path.join(ROOT, 'data', 'tasks', `raw_recovery_queue_${today}.md`)
  );
  const rawRecoveryClosureFiles = {
    rawRecoveryQueueFile,
    rawRecoveryMarkdownFile,
  };
  const verifyClosureArtifacts = options.verifyDailyClosureArtifacts || verifyDailyClosureArtifacts;
  const refreshKpiCheckpoint = () => {
    writeJson(closedLoopFile, report);
    const kpiCheckpoint = runKpiRecoveryCheckpoint({
      date: outputDate,
      closureVerifyFile: closureVerificationFile,
      kpiGateFile,
      depositStatusFile: depositStatusResult.outFile,
      lowEfficiencyFile: options.lowEfficiencyFile || path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${today}.json`),
      effectReviewFile: options.effectReviewFile || path.join(outDir, `effect_review_${today}.json`),
      writeExecutionFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      closedLoopFile,
      adjustmentLogFile: options.adjustmentsFile || path.join(ROOT, 'data', 'adjustments', `adjustments_${today}.json`),
      outFile: kpiCheckpointFile,
      operatorOutFile: kpiOperatorCheckpointFile,
    });
    report.files.kpiCheckpointFile = kpiCheckpoint.outFile;
    report.files.kpiOperatorCheckpointFile = kpiCheckpoint.operatorOutFile;
    report.kpiRecoveryCheckpoint = kpiCheckpoint.checkpoint;
    report.summary.kpiCheckpointStatus = kpiCheckpoint.checkpoint.status;
    report.summary.kpiCheckpointGateStatus = kpiCheckpoint.checkpoint.kpiGate?.status || '';
    try {
      const approvalReview = runKpiApprovalReview({
        date: outputDate,
        writeExecutionFile,
        actionSchemaFile: options.actionSchemaFile || options.actionsFile || '',
        snapshotFile: options.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
        kpiCheckpointFile,
        outFile: kpiApprovalReviewFile,
        markdownFile: kpiApprovalReviewMarkdownFile,
      });
      report.files.kpiApprovalReviewFile = approvalReview.outFile;
      report.files.kpiApprovalReviewMarkdownFile = approvalReview.markdownFile;
      report.summary.kpiApprovalReviewReady = Number(approvalReview.summary?.total || 0) > 0;
      report.summary.kpiApprovalReviewTotal = Number(approvalReview.summary?.total || 0);
      report.summary.kpiApprovalRecommendApprove = Number(approvalReview.summary?.recommendApprove || 0);
      report.summary.kpiApprovalReviewApprovalNeeded = Number(approvalReview.summary?.approvalNeeded || 0);
      report.summary.kpiApprovalHold = Number(approvalReview.summary?.hold || 0);
      report.summary.kpiApprovalBlocked = Number(approvalReview.summary?.blocked || 0);
      const refreshedCheckpoint = runKpiRecoveryCheckpoint({
        date: outputDate,
        closureVerifyFile: closureVerificationFile,
        kpiGateFile,
        depositStatusFile: depositStatusResult.outFile,
        lowEfficiencyFile: options.lowEfficiencyFile || path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${today}.json`),
        effectReviewFile: options.effectReviewFile || path.join(outDir, `effect_review_${today}.json`),
        writeExecutionFile,
        kpiApprovalReviewFile,
        kpiApprovalReviewMarkdownFile,
        closedLoopFile,
        adjustmentLogFile: options.adjustmentsFile || path.join(ROOT, 'data', 'adjustments', `adjustments_${today}.json`),
        outFile: kpiCheckpointFile,
        operatorOutFile: kpiOperatorCheckpointFile,
      });
      report.files.kpiCheckpointFile = refreshedCheckpoint.outFile;
      report.files.kpiOperatorCheckpointFile = refreshedCheckpoint.operatorOutFile;
      report.kpiRecoveryCheckpoint = refreshedCheckpoint.checkpoint;
      report.summary.kpiCheckpointStatus = refreshedCheckpoint.checkpoint.status;
      report.summary.kpiCheckpointGateStatus = refreshedCheckpoint.checkpoint.kpiGate?.status || '';
    } catch (error) {
      report.summary.kpiApprovalReviewError = text(error.message || error);
    }
    try {
      const dryRunDecisions = runKpiDryRunDecisions({
        date: outputDate,
        adjustmentFile: options.adjustmentsFile || path.join(ROOT, 'data', 'adjustments', `adjustments_${today}.json`),
        conflictFile: landedActionConflictAuditFile,
        kpiCheckpointFile,
        writeExecutionFile,
        kpiApprovalReviewFile,
        outFile: kpiDryRunDecisionFile,
        markdownFile: kpiDryRunDecisionMarkdownFile,
        nextActionsFile: kpiRecoveryNextActionsFile,
      });
      report.files.kpiDryRunDecisionFile = dryRunDecisions.outFile;
      report.files.kpiDryRunDecisionMarkdownFile = dryRunDecisions.markdownFile;
      report.files.kpiRecoveryNextActionsFile = dryRunDecisions.nextActionsFile;
      report.summary.recoveryDryRunDecisionTotal = Number(dryRunDecisions.summary?.total || 0);
      report.summary.recoveryDryRunDecisionApprovalNeeded = Number(dryRunDecisions.summary?.byDecision?.approval_needed || 0);
      report.summary.recoveryDryRunDecisionBlocked = Number(dryRunDecisions.summary?.byDecision?.blocked || 0);
    } catch (error) {
      report.summary.kpiDryRunDecisionError = text(error.message || error);
    }
    writeJson(closedLoopFile, report);
    try {
      const monthDigest = runMonthKpiOperatorDigest({
        date: outputDate,
        closedLoopFile,
        approvalReviewFile: kpiApprovalReviewFile,
        outFile: monthKpiDigestFile,
        markdownFile: monthKpiDigestMarkdownFile,
      });
      report.files.monthKpiDigestFile = monthDigest.outFile;
      report.files.monthKpiDigestMarkdownFile = monthDigest.markdownFile;
      report.summary.monthKpiDigestReady = true;
      report.summary.monthKpiDigestRecommendApprove = Number(monthDigest.summary?.recommendApprove || 0);
      report.summary.monthKpiDigestApprovalNeeded = Number(monthDigest.summary?.approvalNeeded || 0);
      report.summary.monthKpiDigestHold = Number(monthDigest.summary?.hold || 0);
      report.summary.monthKpiDigestBlocked = Number(monthDigest.summary?.blocked || 0);
    } catch (error) {
      report.summary.monthKpiDigestError = text(error.message || error);
    }
    writeJson(closedLoopFile, report);
    return kpiCheckpoint;
  };

  const reviewQueue = options.reviewQueue || (!options.hub
    ? runAgentReviewQueue({
      ledger: options.ledger,
      ledgerFile: options.ledgerFile,
      outFile: reviewQueueFile,
      outDir,
      today,
    })
    : null);
  if (options.reviewQueue && reviewQueueFile) {
    writeJson(reviewQueueFile, options.reviewQueue);
  }

  const hub = options.hub
    ? options.hub
    : runAgentOperatingHub({
      ...options,
      timeContext,
      reviewFile: reviewQueueFile,
      effectReviewFile,
      reviewQueue,
      outFile: hubFile,
      today,
    });
  writeJson(hubFile, hub);

  const commandResults = runAgentCommandRunner({
    ...options,
    timeContext,
    hub,
    outFile: commandResultsFile,
    today,
  });

  const writeExecution = shouldRunWriteExecution(options)
    ? runAgentWriteExecution({
      ...options,
      timeContext,
      outFile: writeExecutionFile,
      today,
    })
    : skippedWriteExecution(timeContext);
  writeJson(writeExecutionFile, writeExecution);

  const feedback = runAgentExecutionFeedback({
    ...options,
    timeContext,
    hub,
    results: commandResults,
    outFile: feedbackFile,
    today,
  });

  const effectReview = options.effectReview || readJson(effectReviewFile, {});
  const evidenceHub = {
    ...feedback,
    businessDate: evidenceTimeContext.businessDate,
    dataDate: evidenceTimeContext.dataDate,
  };
  let handoff = runAgentHandoffSummary({
    ...options,
    timeContext: evidenceTimeContext,
    hub: evidenceHub,
    commandResults,
    writeExecution,
    effectReview,
    outFile: handoffOutFile,
    jsonOutFile: handoffJsonFile,
    dashboardFile: expectedDashboardFile,
    dashboardReady: false,
    depositStatus: depositStatusResult.status,
    depositStatusFile: depositStatusResult.outFile,
    today,
  });

  let summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
  const report = {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    outputDate,
    localDate: evidenceTimeContext.localDate,
    businessDate: evidenceTimeContext.businessDate,
    dataDate: evidenceTimeContext.dataDate,
    sourceRunId: text(timeContext.sourceRunId || ''),
    closedLoop: summary.closedLoop,
    summary,
    files: {
      hubFile,
      reviewQueueFile,
      effectReviewFile,
      commandResultsFile,
      writeExecutionFile,
      feedbackFile,
      handoffOutFile,
      handoffJsonFile,
      closedLoopFile,
      depositStatusFile: depositStatusResult.outFile,
      rawRecoveryQueueFile,
      rawRecoveryMarkdownFile,
      kpiGateFile,
      kpiCheckpointFile,
      kpiOperatorCheckpointFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
    },
    hub,
    commandResults,
    writeExecution,
    feedback,
    handoff,
  };
  if (options.generateDashboard !== false) {
    try {
      const dashboard = generateDailyDashboard({
        summaryFile: options.dashboardSummaryFile || '',
        outputDate,
        businessDate: evidenceTimeContext.businessDate,
        agentClosedLoop: report,
        outDir: options.dashboardOutDir || '',
      });
      handoff = runAgentHandoffSummary({
        ...options,
        timeContext: evidenceTimeContext,
        hub: evidenceHub,
        commandResults,
        writeExecution,
        effectReview,
        outFile: handoffOutFile,
        jsonOutFile: handoffJsonFile,
        dashboardFile: dashboard.outFile,
        dashboardReady: true,
        depositStatus: depositStatusResult.status,
        depositStatusFile: depositStatusResult.outFile,
        today,
      });
      report.handoff = handoff;
      summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
      report.summary = summary;
      report.closedLoop = summary.closedLoop;
      report.files.dashboardFile = dashboard.outFile;
      report.summary.dashboardReady = !!dashboard.outFile;
    } catch (error) {
      report.summary.dashboardReady = false;
      report.summary.dashboardError = text(error.message || error);
      report.summary.closedLoop = false;
      report.closedLoop = false;
    }
  }

  if (options.generateDashboard !== false && report.files.dashboardFile) {
    writeJson(closedLoopFile, report);
    const kpiGate = runKpiRecoveryGate({
      date: outputDate,
      handoffFile: handoffJsonFile,
      closedLoopFile,
      snapshotFile: options.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
      outFile: kpiGateFile,
    });
    report.files.kpiGateFile = kpiGate.outFile;
    report.kpiRecoveryGate = kpiGate.report;
    report.summary.kpiGateStatus = kpiGate.report.status;
    report.summary.kpiGateEvaluatedBusinessDate = kpiGate.report.evaluatedBusinessDate;
    report.summary.kpiGateDataDate = kpiGate.report.dataDate;
    refreshKpiCheckpoint();
    const closureVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
      enforceArtifactSummaryState: false,
    });
    writeJson(closureVerificationFile, closureVerification);
    report.files.closureVerificationFile = closureVerificationFile;
    report.closureVerification = closureVerification;
    report.summary.artifactVerificationOk = closureVerification.ok;
    report.summary.artifactVerificationErrors = closureVerification.errors;
    handoff = runAgentHandoffSummary({
      ...options,
      timeContext: evidenceTimeContext,
      hub: evidenceHub,
      commandResults,
      writeExecution,
      effectReview,
      outFile: handoffOutFile,
      jsonOutFile: handoffJsonFile,
      dashboardFile: report.files.dashboardFile,
      dashboardReady: true,
      depositStatus: depositStatusResult.status,
      depositStatusFile: depositStatusResult.outFile,
      closureVerification,
      today,
    });
    report.handoff = handoff;
    summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
    report.summary = {
      ...summary,
      dashboardReady: true,
      artifactVerificationOk: closureVerification.ok,
      artifactVerificationErrors: closureVerification.errors,
    };
    report.closedLoop = report.summary.closedLoop;
    const verifiedDashboard = generateDailyDashboard({
      summaryFile: options.dashboardSummaryFile || '',
      outputDate,
      businessDate: evidenceTimeContext.businessDate,
      agentClosedLoop: report,
      outDir: options.dashboardOutDir || '',
    });
    report.files.dashboardFile = verifiedDashboard.outFile;
    writeJson(closedLoopFile, report);
    const finalKpiGate = runKpiRecoveryGate({
      date: outputDate,
      handoffFile: handoffJsonFile,
      closedLoopFile,
      snapshotFile: options.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
      outFile: kpiGateFile,
    });
    report.files.kpiGateFile = finalKpiGate.outFile;
    report.kpiRecoveryGate = finalKpiGate.report;
    report.summary.kpiGateStatus = finalKpiGate.report.status;
    report.summary.kpiGateEvaluatedBusinessDate = finalKpiGate.report.evaluatedBusinessDate;
    report.summary.kpiGateDataDate = finalKpiGate.report.dataDate;
    refreshKpiCheckpoint();
    handoff = runAgentHandoffSummary({
      ...options,
      timeContext: evidenceTimeContext,
      hub: evidenceHub,
      commandResults,
      writeExecution,
      effectReview,
      outFile: handoffOutFile,
      jsonOutFile: handoffJsonFile,
      dashboardFile: report.files.dashboardFile,
      dashboardReady: true,
      depositStatus: depositStatusResult.status,
      depositStatusFile: depositStatusResult.outFile,
      closureVerification,
      kpiGate: finalKpiGate.report,
      today,
    });
    report.handoff = handoff;
    summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
    report.summary = {
      ...summary,
      dashboardReady: true,
      artifactVerificationOk: closureVerification.ok,
      artifactVerificationErrors: closureVerification.errors,
      kpiGateStatus: finalKpiGate.report.status,
      kpiGateEvaluatedBusinessDate: finalKpiGate.report.evaluatedBusinessDate,
      kpiGateDataDate: finalKpiGate.report.dataDate,
    };
    report.closedLoop = report.summary.closedLoop;
    const finalDashboard = generateDailyDashboard({
      summaryFile: options.dashboardSummaryFile || '',
      outputDate,
      businessDate: evidenceTimeContext.businessDate,
      agentClosedLoop: report,
      outDir: options.dashboardOutDir || '',
    });
    report.files.dashboardFile = finalDashboard.outFile;
    writeJson(closedLoopFile, report);
    const finalClosureVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
      enforceArtifactSummaryState: false,
    });
    writeJson(closureVerificationFile, finalClosureVerification);
    report.closureVerification = finalClosureVerification;
    handoff = runAgentHandoffSummary({
      ...options,
      timeContext: evidenceTimeContext,
      hub: evidenceHub,
      commandResults,
      writeExecution,
      effectReview,
      outFile: handoffOutFile,
      jsonOutFile: handoffJsonFile,
      dashboardFile: report.files.dashboardFile,
      dashboardReady: true,
      depositStatus: depositStatusResult.status,
      depositStatusFile: depositStatusResult.outFile,
      closureVerification: finalClosureVerification,
      kpiGate: finalKpiGate.report,
      today,
    });
    report.handoff = handoff;
    summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
    report.summary = {
      ...summary,
      dashboardReady: true,
      artifactVerificationOk: finalClosureVerification.ok,
      artifactVerificationErrors: finalClosureVerification.errors,
      kpiGateStatus: finalKpiGate.report.status,
      kpiGateEvaluatedBusinessDate: finalKpiGate.report.evaluatedBusinessDate,
      kpiGateDataDate: finalKpiGate.report.dataDate,
    };
    report.closedLoop = report.summary.closedLoop;
    const verifiedFinalDashboard = generateDailyDashboard({
      summaryFile: options.dashboardSummaryFile || '',
      outputDate,
      businessDate: evidenceTimeContext.businessDate,
      agentClosedLoop: report,
      outDir: options.dashboardOutDir || '',
    });
    report.files.dashboardFile = verifiedFinalDashboard.outFile;
    writeJson(closedLoopFile, report);
    const dashboardClosureVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
      enforceArtifactSummaryState: false,
    });
    writeJson(closureVerificationFile, dashboardClosureVerification);
    report.closureVerification = dashboardClosureVerification;
    report.summary.artifactVerificationOk = dashboardClosureVerification.ok;
    report.summary.artifactVerificationErrors = dashboardClosureVerification.errors;
    report.summary.intermediateArtifactVerificationErrors = [
      ...(closureVerification.ok ? [] : closureVerification.errors || []),
      ...(finalClosureVerification.ok ? [] : finalClosureVerification.errors || []),
    ];
    if (!dashboardClosureVerification.ok) {
      report.summary.closedLoop = false;
      report.closedLoop = false;
    }
    refreshKpiCheckpoint();
    handoff = runAgentHandoffSummary({
      ...options,
      timeContext: evidenceTimeContext,
      hub: evidenceHub,
      commandResults,
      writeExecution,
      effectReview,
      outFile: handoffOutFile,
      jsonOutFile: handoffJsonFile,
      dashboardFile: report.files.dashboardFile,
      dashboardReady: true,
      depositStatus: depositStatusResult.status,
      depositStatusFile: depositStatusResult.outFile,
      closureVerification: report.closureVerification,
      kpiGate: report.kpiRecoveryGate,
      kpiCheckpoint: report.kpiRecoveryCheckpoint,
      kpiDryRunDecisions: readJson(kpiDryRunDecisionFile, {}),
      kpiRecoveryNextActionsFile,
      kpiApprovalReview: readJson(kpiApprovalReviewFile, {}),
      kpiApprovalReviewFile: kpiApprovalReviewMarkdownFile,
      monthKpiDigestMarkdownFile,
      today,
    });
    report.handoff = handoff;
    summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
    report.summary = {
      ...report.summary,
      ...summary,
      dashboardReady: true,
    };
    report.closedLoop = report.summary.closedLoop;
    const postCheckpointDashboard = generateDailyDashboard({
      summaryFile: options.dashboardSummaryFile || '',
      outputDate,
      businessDate: evidenceTimeContext.businessDate,
      agentClosedLoop: report,
      outDir: options.dashboardOutDir || '',
    });
    report.files.dashboardFile = postCheckpointDashboard.outFile;
    writeJson(closedLoopFile, report);
    const postCheckpointVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
      enforceArtifactSummaryState: false,
    });
    writeJson(closureVerificationFile, postCheckpointVerification);
    report.closureVerification = postCheckpointVerification;
    handoff = runAgentHandoffSummary({
      ...options,
      timeContext: evidenceTimeContext,
      hub: evidenceHub,
      commandResults,
      writeExecution,
      effectReview,
      outFile: handoffOutFile,
      jsonOutFile: handoffJsonFile,
      dashboardFile: report.files.dashboardFile,
      dashboardReady: true,
      depositStatus: depositStatusResult.status,
      depositStatusFile: depositStatusResult.outFile,
      closureVerification: postCheckpointVerification,
      kpiGate: report.kpiRecoveryGate,
      kpiCheckpoint: report.kpiRecoveryCheckpoint,
      kpiDryRunDecisions: readJson(kpiDryRunDecisionFile, {}),
      kpiRecoveryNextActionsFile,
      kpiApprovalReview: readJson(kpiApprovalReviewFile, {}),
      kpiApprovalReviewFile: kpiApprovalReviewMarkdownFile,
      monthKpiDigestMarkdownFile,
      today,
    });
    report.handoff = handoff;
    summary = closedLoopSummary({ commandResults, writeExecution, feedback, handoff });
    report.summary = {
      ...report.summary,
      ...summary,
      dashboardReady: true,
      artifactVerificationOk: postCheckpointVerification.ok,
      artifactVerificationErrors: postCheckpointVerification.errors,
    };
    report.closedLoop = report.summary.closedLoop;
    const verifiedPostCheckpointDashboard = generateDailyDashboard({
      summaryFile: options.dashboardSummaryFile || '',
      outputDate,
      businessDate: evidenceTimeContext.businessDate,
      agentClosedLoop: report,
      outDir: options.dashboardOutDir || '',
    });
    report.files.dashboardFile = verifiedPostCheckpointDashboard.outFile;
    writeJson(closedLoopFile, report);
    const verifiedPostCheckpointVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
      enforceArtifactSummaryState: false,
    });
    writeJson(closureVerificationFile, verifiedPostCheckpointVerification);
    report.closureVerification = verifiedPostCheckpointVerification;
    report.summary.artifactVerificationOk = verifiedPostCheckpointVerification.ok;
    report.summary.artifactVerificationErrors = verifiedPostCheckpointVerification.errors;
    if (verifiedPostCheckpointVerification.ok) {
      report.summary.intermediateArtifactVerificationErrors = [];
    }
    if (!verifiedPostCheckpointVerification.ok) {
      report.summary.closedLoop = false;
      report.closedLoop = false;
    }
    report.kpiRecoveryCheckpoint = readJson(kpiCheckpointFile, report.kpiRecoveryCheckpoint);
    report.summary.kpiCheckpointStatus = report.kpiRecoveryCheckpoint?.status || report.summary.kpiCheckpointStatus || '';
    report.summary.kpiCheckpointGateStatus = report.kpiRecoveryCheckpoint?.kpiGate?.status || report.summary.kpiCheckpointGateStatus || '';
    writeJson(closedLoopFile, report);
    const strictFinalClosureVerification = verifyClosureArtifacts({
      date: outputDate,
      closedLoopFile,
      handoffFile: handoffOutFile,
      dashboardFile: report.files.dashboardFile,
      kpiGateFile,
      kpiCheckpointFile,
      operatorCheckpointFile: kpiOperatorCheckpointFile,
      kpiDryRunDecisionFile,
      kpiDryRunDecisionMarkdownFile,
      kpiRecoveryNextActionsFile,
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      landedActionConflictAuditFile,
      landedActionConflictAuditMarkdownFile,
      ...(landedActionConflictExpectedDateForVerifier ? { landedActionConflictExpectedDate: landedActionConflictExpectedDateForVerifier } : {}),
      ...rawRecoveryClosureFiles,
    });
    writeJson(closureVerificationFile, strictFinalClosureVerification);
    report.closureVerification = strictFinalClosureVerification;
    report.summary.artifactVerificationOk = strictFinalClosureVerification.ok;
    report.summary.artifactVerificationErrors = strictFinalClosureVerification.errors;
    if (strictFinalClosureVerification.ok) {
      report.summary.intermediateArtifactVerificationErrors = [];
    } else {
      report.summary.closedLoop = false;
      report.closedLoop = false;
    }
    writeJson(closedLoopFile, report);
  } else {
    refreshKpiCheckpoint();
  }
  if (snapshotInputWarnings.length) {
    report.summary.snapshotInputWarnings = snapshotInputWarnings;
    report.summary.originalSnapshotFile = snapshotInput.originalSnapshotFile;
    report.summary.effectiveSnapshotFile = snapshotInput.effectiveSnapshotFile;
    report.files.originalSnapshotFile = snapshotInput.originalSnapshotFile;
    report.files.effectiveSnapshotFile = snapshotInput.effectiveSnapshotFile;
    writeJson(closedLoopFile, report);
  }
  return report;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const rawCandidateRoots = get('--raw-candidate-roots') || process.env.AGENT_RAW_CANDIDATE_ROOTS || '';
  const rawCandidateDays = get('--raw-candidate-days') || process.env.AGENT_RAW_CANDIDATE_DAYS || '';
  const rawCandidateLimit = get('--raw-candidate-limit') || process.env.AGENT_RAW_CANDIDATE_LIMIT || '';
  return {
    ledgerFile: get('--ledger') || process.env.AGENT_LEDGER_FILE || '',
    inboxFile: get('--inbox') || process.env.AGENT_INBOX_FILE || '',
    reviewFile: get('--reviews') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    capabilityFile: get('--capabilities') || process.env.AGENT_CAPABILITY_REGISTRY_FILE || '',
    actionSchemaFile: get('--actions') || get('--action-schema') || process.env.ACTION_SCHEMA_FILE || '',
    snapshotFile: get('--snapshot') || process.env.PANEL_SNAPSHOT_FILE || '',
    adjustmentsFile: get('--adjustments') || get('--adjustment-log') || process.env.AGENT_ADJUSTMENTS_FILE || '',
    effectReviewFile: get('--effect-review') || process.env.AGENT_EFFECT_REVIEW_OUT || '',
    outDir: get('--out-dir') || process.env.AGENT_CLOSED_LOOP_OUT_DIR || '',
    outFile: get('--out') || process.env.AGENT_CLOSED_LOOP_OUT || '',
    dashboardSummaryFile: get('--dashboard-summary') || process.env.AGENT_DASHBOARD_SUMMARY_FILE || '',
    dashboardOutDir: get('--dashboard-out-dir') || process.env.AGENT_DASHBOARD_OUT_DIR || '',
    dashboardFile: get('--dashboard') || get('--dashboard-file') || process.env.AGENT_DASHBOARD_FILE || '',
    closureVerificationOutFile: get('--closure-verification-out') || process.env.AGENT_CLOSURE_VERIFICATION_OUT || '',
    kpiGateOutFile: get('--kpi-gate-out') || process.env.AGENT_KPI_GATE_OUT || '',
    kpiCheckpointOutFile: get('--kpi-checkpoint-out') || process.env.AGENT_KPI_CHECKPOINT_OUT || '',
    kpiOperatorCheckpointOutFile: get('--kpi-operator-checkpoint-out') || process.env.AGENT_KPI_OPERATOR_CHECKPOINT_OUT || '',
    monthKpiDigestOutFile: get('--month-kpi-digest-out') || process.env.AGENT_MONTH_KPI_DIGEST_OUT || '',
    monthKpiDigestMarkdownOutFile: get('--month-kpi-digest-md-out') || process.env.AGENT_MONTH_KPI_DIGEST_MD_OUT || '',
    depositStatusFile: get('--deposit-status') || process.env.AGENT_DEPOSIT_STATUS_FILE || '',
    depositStatusOutFile: get('--deposit-status-out') || process.env.AGENT_DEPOSIT_STATUS_OUT || '',
    rawRecoveryQueueFile: get('--raw-recovery-queue') || process.env.AGENT_RAW_RECOVERY_QUEUE_FILE || '',
    rawRecoveryMarkdownFile: get('--raw-recovery-md') || process.env.AGENT_RAW_RECOVERY_MARKDOWN_FILE || '',
    landedActionConflictAuditDate: get('--landed-action-conflict-date') || process.env.AGENT_LANDED_ACTION_CONFLICT_DATE || '',
    landedActionConflictAuditFile: get('--landed-action-conflict-audit') || process.env.AGENT_LANDED_ACTION_CONFLICT_AUDIT_FILE || '',
    landedActionConflictAuditMarkdownFile: get('--landed-action-conflict-md') || process.env.AGENT_LANDED_ACTION_CONFLICT_AUDIT_MD || '',
    depositTrendRoot: get('--deposit-trend-root') || process.env.AGENT_DEPOSIT_TREND_ROOT || '',
    depositRawRoot: get('--deposit-raw-root') || process.env.AGENT_DEPOSIT_RAW_ROOT || '',
    archiveDepositCandidates: args.includes('--archive-deposit-candidates') ||
      args.includes('--archive-candidates') ||
      process.env.AGENT_ARCHIVE_DEPOSIT_CANDIDATES === '1',
    rawCandidateRoots: rawCandidateRoots
      ? rawCandidateRoots.split(/[;,]/).map(item => item.trim()).filter(Boolean)
      : undefined,
    rawCandidateDays: rawCandidateDays || undefined,
    rawCandidateLimit: rawCandidateLimit || undefined,
    generateDepositStatus: !args.includes('--skip-deposit-status') && process.env.AGENT_SKIP_DEPOSIT_STATUS !== '1',
    today: get('--today') || process.env.AGENT_TODAY || '',
    now: get('--now') || process.env.AGENT_NOW || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    execute: args.includes('--execute') || process.env.AGENT_WRITE_EXECUTE === '1',
    generateDashboard: !args.includes('--skip-dashboard') && process.env.AGENT_SKIP_DASHBOARD !== '1',
    selfTest: args.includes('--self-test'),
  };
}

function buildSelfTestOptions(options = {}) {
  const timeContext = buildTimeContext({
    ...options,
    sourceRunId: options.sourceRunId || 'agent_closed_loop_self_test',
  });
  const today = options.today || timeContext.businessDate;
  timeContext.dataDate = today;
  const outDir = ensureDir(options.outDir || path.join(ROOT, 'data', 'tmp_tests', `agent_closed_loop_${today}`));
  const keywordOut = path.join(outDir, `selection_keyword_conversion_rate_${today}.json`);
  const actionSchemaFile = path.join(outDir, `action_schema_${today}_self_test.json`);
  const snapshotFile = path.join(outDir, 'latest_snapshot.json');
  writeJson(actionSchemaFile, [{
    sku: 'SELFTEST1',
    actions: [{
      actionType: 'pause',
      entityType: 'productAd',
      id: 'product-ad-self-test',
      approvedBy: 'codex',
      actionSource: ['codex'],
      evidence: ['self test low-risk waste'],
    }],
  }]);
  const selfTestSnapshot = {
    selfTest: true,
    businessDate: today,
    dataDate: today,
    productCards: [{ sku: 'SELFTEST1' }],
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
  };
  writeJson(snapshotFile, selfTestSnapshot);
  return {
    ...options,
    timeContext,
    today,
    outDir,
    dashboardOutDir: options.dashboardOutDir || outDir,
    actionSchemaFile,
    snapshotFile,
    snapshot: selfTestSnapshot,
    generateDepositStatus: options.generateDepositStatus === true && !!options.depositRawRoot,
    hub: {
      businessDate: today,
      dataDate: timeContext.dataDate,
      summary: { total: 1, externalRequests: 1 },
      todayQueue: [{
        taskId: 'self-test-external-1',
        title: 'Closed-loop self-test task: developer asks whether SELFTEST1 can continue',
        lane: 'external_inbox',
        workType: 'external_request',
        priority: 'P1',
        status: 'new',
        nextStep: 'Collect read-only evidence first, then enter the low-risk write dry run.',
        executionPlan: {
          safeToAutoRun: true,
          commands: [{
            label: 'Pull selection keyword conversion evidence',
            command: 'npm run ops:selection:keyword-conversion -- --keywords "self test keyword"',
            output: keywordOut,
            riskLevel: 'read_only',
          }],
        },
      }],
    },
    ledger: {
      actions: [{
        sku: 'SELFTEST1',
        actionType: 'pause',
        entityType: 'productAd',
        id: 'product-ad-self-test',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['self test low-risk waste'],
      }],
    },
    execFileSync: (bin, args) => {
      if (args.some(arg => text(arg).includes('fetch_selection_keyword_conversion_rate.js'))) {
        writeJson(keywordOut, { ok: true, rows: [], selfTest: true });
        return JSON.stringify({ ok: true, outputFile: keywordOut, message: 'Closed-loop self-test evidence generated.' });
      }
      if (args.some(arg => text(arg).includes('run_actions.js'))) {
        return '[self-test] dry-run completed';
      }
      return '';
    },
  };
}

function main() {
  const parsed = parseArgs(process.argv);
  const options = parsed.selfTest ? buildSelfTestOptions(parsed) : parsed;
  const report = runAgentClosedLoop(options);
  const ok = parsed.selfTest
    ? report.summary.commandFailed === 0 &&
      report.summary.writeFailed === 0 &&
      report.summary.writeBlocked === 0 &&
      report.summary.artifactVerificationOk === true
    : report.summary.closedLoop;
  console.log(JSON.stringify({
    ok,
    businessDate: report.businessDate,
    summary: report.summary,
    files: report.files,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildDailyClosureStatus,
  buildSelfTestOptions,
  closedLoopSummary,
  dashboardFileFor,
  inspectKpiSnapshotQuality,
  normalizeKpiSnapshotOptions,
  parseArgs,
  runDailyDepositStatus,
  runAgentClosedLoop,
};
