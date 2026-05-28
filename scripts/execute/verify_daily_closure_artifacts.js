const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RAW_ORIGINAL_MISSING_CLASSES = [
  'sales_core_original_xlsx',
  'inventory_original_csv',
  'ad_full_original_csv',
];
const RAW_ORIGINAL_SUSPICIOUS_CLASSES = {
  sales_core_original_zero_summary: 'sales_core_original_xlsx',
  inventory_csv_tiny: 'inventory_original_csv',
};

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return '';
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function daysBetweenDateStrings(from = '', to = '') {
  const a = dateOnly(from);
  const b = dateOnly(to);
  if (!a || !b) return null;
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readText(file) {
  if (!file || !fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function defaultFile(prefix, date, ext, dir) {
  return path.join(ROOT, dir, `${prefix}_${date}.${ext}`);
}

function dateFromNamedFile(file = '', prefix = '') {
  const name = path.basename(text(file));
  const match = name.match(new RegExp(`${prefix}_(\\d{4}-\\d{2}-\\d{2})\\.[^.]+$`, 'i'));
  return match ? match[1] : '';
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function includesAll(haystack = '', values = []) {
  return values.every(value => !text(value) || haystack.includes(text(value)));
}

function includesAny(haystack = '', values = []) {
  return values.some(value => text(value) && haystack.includes(text(value)));
}

function closureStatusAliases(status, operatingClosureStatus) {
  const aliases = [text(status)].filter(Boolean);
  if (status === 'partial' && operatingClosureStatus === 'needs_recovery') {
    aliases.push('needs_recovery');
  }
  return [...new Set(aliases)];
}

function pushMismatch(errors, field, expected, actual) {
  if (expected !== actual) {
    errors.push(`${field} mismatch: expected ${expected}, got ${actual}`);
  }
}

function verifyDailyClosureArtifacts(options = {}) {
  const date = dateOnly(options.date || new Date());
  const enforceArtifactSummaryState = options.enforceArtifactSummaryState !== false;
  const closedLoopFile = options.closedLoopFile || defaultFile('agent_closed_loop', date, 'json', path.join('data', 'agent'));
  const handoffFile = options.handoffFile || defaultFile('agent_handoff', date, 'md', path.join('data', 'agent'));
  const dashboardFile = options.dashboardFile || defaultFile('daily_dashboard', date, 'html', path.join('data', 'reports'));
  const kpiGateFile = options.kpiGateFile || defaultFile('kpi_recovery_gate', date, 'json', path.join('data', 'tasks'));
  const kpiCheckpointFile = options.kpiCheckpointFile || defaultFile('kpi_recovery_checkpoint', date, 'json', path.join('data', 'tasks'));
  const operatorCheckpointFile = options.operatorCheckpointFile || defaultFile('kpi_recovery_operator_checkpoint', date, 'md', path.join('data', 'tasks'));
  const rawRecoveryQueueFile = options.rawRecoveryQueueFile || defaultFile('raw_recovery_queue', date, 'json', path.join('data', 'tasks'));
  const rawRecoveryMarkdownFile = options.rawRecoveryMarkdownFile || defaultFile('raw_recovery_queue', date, 'md', path.join('data', 'tasks'));
  let landedActionConflictAuditFile = options.landedActionConflictAuditFile || defaultFile('landed_action_conflict_audit', date, 'json', path.join('data', 'tasks'));
  let landedActionConflictAuditMarkdownFile = options.landedActionConflictAuditMarkdownFile || defaultFile('landed_action_conflict_audit', date, 'md', path.join('data', 'tasks'));
  const kpiDryRunDecisionFile = options.kpiDryRunDecisionFile || defaultFile('kpi_recovery_dryrun_decisions', date, 'json', path.join('data', 'tasks'));
  const kpiDryRunDecisionMarkdownFile = options.kpiDryRunDecisionMarkdownFile || defaultFile('kpi_recovery_dryrun_decisions', date, 'md', path.join('data', 'tasks'));
  const kpiRecoveryNextActionsFile = options.kpiRecoveryNextActionsFile || defaultFile('kpi_recovery_next_actions', date, 'md', path.join('data', 'tasks'));
  const kpiApprovalReviewFile = options.kpiApprovalReviewFile || defaultFile('kpi_approval_review', date, 'json', path.join('data', 'tasks'));
  const kpiApprovalReviewMarkdownFile = options.kpiApprovalReviewMarkdownFile || defaultFile('kpi_approval_review', date, 'md', path.join('data', 'tasks'));
  const monthKpiDigestFile = options.monthKpiDigestFile || defaultFile('month_kpi_operator_digest', date, 'json', path.join('data', 'tasks'));
  const monthKpiDigestMarkdownFile = options.monthKpiDigestMarkdownFile || defaultFile('month_kpi_operator_digest', date, 'md', path.join('data', 'tasks'));
  const report = readJson(closedLoopFile, null);
  const landedActionConflictExpectedDate = dateOnly(options.landedActionConflictExpectedDate || report?.businessDate || report?.handoff?.businessDate || date);
  const reportConflictAuditFile = report?.files?.landedActionConflictAuditFile || '';
  const landedActionConflictExpectedAuditDate = options.landedActionConflictExpectedDate
    ? landedActionConflictExpectedDate
    : (
        options.landedActionConflictAuditFile
          ? (dateFromNamedFile(options.landedActionConflictAuditFile, 'landed_action_conflict_audit') || date)
          : (dateFromNamedFile(reportConflictAuditFile, 'landed_action_conflict_audit') || landedActionConflictExpectedDate || date)
      );
  if (!options.landedActionConflictAuditFile && report?.files?.landedActionConflictAuditFile) {
    landedActionConflictAuditFile = report.files.landedActionConflictAuditFile;
  } else if (!options.landedActionConflictAuditFile && landedActionConflictExpectedDate && landedActionConflictExpectedDate !== date) {
    landedActionConflictAuditFile = defaultFile('landed_action_conflict_audit', landedActionConflictExpectedDate, 'json', path.join('data', 'tasks'));
  }
  if (!options.landedActionConflictAuditMarkdownFile && report?.files?.landedActionConflictAuditMarkdownFile) {
    landedActionConflictAuditMarkdownFile = report.files.landedActionConflictAuditMarkdownFile;
  } else if (!options.landedActionConflictAuditMarkdownFile && landedActionConflictExpectedDate && landedActionConflictExpectedDate !== date) {
    landedActionConflictAuditMarkdownFile = defaultFile('landed_action_conflict_audit', landedActionConflictExpectedDate, 'md', path.join('data', 'tasks'));
  }
  const handoffText = readText(handoffFile);
  const dashboardText = readText(dashboardFile);
  const operatorCheckpointText = readText(operatorCheckpointFile);
  const kpiGate = readJson(kpiGateFile, null);
  const kpiCheckpoint = readJson(kpiCheckpointFile, null);
  const rawRecoveryQueue = readJson(rawRecoveryQueueFile, null);
  const rawRecoveryMarkdownText = readText(rawRecoveryMarkdownFile);
  const landedActionConflictAudit = readJson(landedActionConflictAuditFile, null);
  const landedActionConflictAuditMarkdownText = readText(landedActionConflictAuditMarkdownFile);
  const kpiDryRunDecision = readJson(kpiDryRunDecisionFile, null);
  const kpiDryRunDecisionMarkdownText = readText(kpiDryRunDecisionMarkdownFile);
  const kpiRecoveryNextActionsText = readText(kpiRecoveryNextActionsFile);
  const kpiApprovalReview = readJson(kpiApprovalReviewFile, null);
  const kpiApprovalReviewMarkdownText = readText(kpiApprovalReviewMarkdownFile);
  const monthKpiDigest = readJson(monthKpiDigestFile, null);
  const monthKpiDigestMarkdownText = readText(monthKpiDigestMarkdownFile);
  const hubFile = options.hubFile || report?.files?.hubFile || defaultFile('operating_hub', date, 'json', path.join('data', 'agent'));
  const reviewQueueFile = options.reviewQueueFile || report?.files?.reviewQueueFile || defaultFile('review_queue', date, 'json', path.join('data', 'agent'));
  const effectReviewFile = options.effectReviewFile || report?.files?.effectReviewFile || defaultFile('effect_review', date, 'json', path.join('data', 'agent'));
  const hub = readJson(hubFile, null);
  const reviewQueue = readJson(reviewQueueFile, null);
  const effectReview = readJson(effectReviewFile, null);
  const errors = [];

  if (!report) errors.push(`missing or invalid closed loop file: ${closedLoopFile}`);
  if (!handoffText) errors.push(`missing handoff file: ${handoffFile}`);
  if (!dashboardText) errors.push(`missing dashboard file: ${dashboardFile}`);
  if (!report) {
    return {
      ok: false,
      date,
      errors,
      summary: {},
      files: {
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
      kpiApprovalReviewFile,
      kpiApprovalReviewMarkdownFile,
      monthKpiDigestFile,
      monthKpiDigestMarkdownFile,
      hubFile,
        reviewQueueFile,
        effectReviewFile,
      },
    };
  }

  const businessDate = dateOnly(report.businessDate);
  const dataDate = dateOnly(report.dataDate);
  const outputDate = dateOnly(report.outputDate || date);
  const expectedLagDays = daysBetweenDateStrings(dataDate, businessDate);
  const summary = report.summary || {};
  const handoff = report.handoff || {};
  const handoffFreshness = handoff.dataFreshness || {};
  const handoffSummary = handoff.summary || {};
  const dailyClosureStatus = text(summary.dailyClosureStatus);
  const dailyComplete = summary.dailyComplete === true;
  const rawDailyClosureReasons = Array.isArray(summary.dailyClosureReasons) ? summary.dailyClosureReasons.map(text).filter(Boolean) : [];
  const artifactVerificationErrors = Array.isArray(summary.artifactVerificationErrors)
    ? summary.artifactVerificationErrors.map(text).filter(Boolean)
    : [];
  const intermediateArtifactVerificationErrors = Array.isArray(summary.intermediateArtifactVerificationErrors)
    ? summary.intermediateArtifactVerificationErrors.map(text).filter(Boolean)
    : [];
  const kpiStatus = text(summary.kpiStatus);
  const operatingClosureStatus = text(summary.operatingClosureStatus);
  const dailyClosureStatusAliases = closureStatusAliases(dailyClosureStatus, operatingClosureStatus);
  const checkpointDeposit = kpiCheckpoint?.deposit || {};
  const checkpointMissing = Array.isArray(checkpointDeposit.missing) ? checkpointDeposit.missing : null;
  const checkpointSuspicious = Array.isArray(checkpointDeposit.suspicious) ? checkpointDeposit.suspicious : null;
  const depositMissingItems = (checkpointMissing ||
    (Array.isArray(summary.depositMissing) && summary.depositMissing.length
      ? summary.depositMissing
      : handoff.depositStatus?.missing || []))
    .map(text)
    .filter(Boolean);
  const depositSuspiciousItems = (checkpointSuspicious ||
    (Array.isArray(summary.depositSuspicious) && summary.depositSuspicious.length
      ? summary.depositSuspicious
      : handoff.depositStatus?.suspicious || []))
    .map(item => text(item?.type || item))
    .filter(Boolean);
  const depositStatus = text(checkpointDeposit.status || summary.depositStatus);
  const depositMissingCount = checkpointMissing
    ? depositMissingItems.length
    : Number(summary.depositMissingCount || depositMissingItems.length || 0);
  const checkpointLanded = kpiCheckpoint?.landedEvidence || {};
  const landedActionSuccess = Math.max(
    Number(summary.landedActionSuccess || 0),
    Number(checkpointLanded.landedActionSuccess || 0)
  );
  const landedActionManualReview = Math.max(
    Number(summary.landedActionManualReview || 0),
    Number(checkpointLanded.landedActionManualReview || 0)
  );
  const landedActionFailed = Math.max(
    Number(summary.landedActionFailed || 0),
    Number(checkpointLanded.landedActionFailed || 0)
  );
  const writeApprovalNeeded = Number(summary.writeApprovalNeeded || 0);
  const writeBlocked = Number(summary.writeBlocked || 0);
  const feedbackApplied = Math.max(
    Number(summary.feedbackApplied || 0),
    Number(checkpointLanded.feedbackApplied || 0)
  );
  const effectReviewFeedbackApplied = Math.max(
    Number(summary.effectReviewFeedbackApplied || 0),
    Number(summary.feedbackApplied || 0),
    Number(hub?.summary?.feedbackApplied || 0)
  );
  const dailyOperatingWorkflow = summary.dailyOperatingWorkflow || handoffSummary.dailyOperatingWorkflow || {};
  const dailyOperatingWorkflowStatus = text(
    summary.dailyOperatingWorkflowStatus ||
    dailyOperatingWorkflow.status ||
    handoffSummary.dailyOperatingWorkflowStatus ||
    ''
  );
  const dailyOperatingWorkflowBlockers = Array.isArray(summary.dailyOperatingWorkflowBlockers)
    ? summary.dailyOperatingWorkflowBlockers.map(text).filter(Boolean)
    : (Array.isArray(dailyOperatingWorkflow.blockers) ? dailyOperatingWorkflow.blockers.map(text).filter(Boolean) : []);
  const dailyOperatingWorkflowActive = !!dailyOperatingWorkflowStatus && dailyOperatingWorkflowStatus !== 'not_required';
  const dueReviews = Number(
    hub?.summary && Object.prototype.hasOwnProperty.call(hub.summary, 'dueReviews')
      ? hub.summary.dueReviews
      : (reviewQueue?.summary?.due || 0)
  );
  const reviewQueueDue = Number(reviewQueue?.summary?.due || (Array.isArray(reviewQueue?.due) ? reviewQueue.due.length : 0));
  const effectReviewTotal = Number(effectReview?.summary?.total || (Array.isArray(effectReview?.results) ? effectReview.results.length : 0));
  const recoveryEvidenceCount = landedActionSuccess + landedActionManualReview + writeApprovalNeeded + writeBlocked + feedbackApplied;
  const recoveryDryRun = kpiCheckpoint?.actionPools?.recoveryDryRun || {};
  const recoveryDryRunHighEfficiencyBidUps = Number(recoveryDryRun.highEfficiencyBidUps || 0);
  const recoveryDryRunSkuCount = Number(recoveryDryRun.skuCount || 0);
  const recoveryDryRunLatestRunId = text(recoveryDryRun.latestRunId || '');
  const dryRunDecisionSummary = kpiDryRunDecision?.summary || {};
  const dryRunDecisionTotal = Number(dryRunDecisionSummary.total || 0);
  const dryRunDecisionByDecision = dryRunDecisionSummary.byDecision || {};
  const dryRunDecisionExecuted = Number(dryRunDecisionByDecision.executed || 0);
  const approvalReviewSummary = kpiApprovalReview?.summary || {};
  const approvalReviewTotal = Number(approvalReviewSummary.total || summary.kpiApprovalReviewTotal || 0);
  const approvalReviewRecommended = Number(approvalReviewSummary.recommendApprove || summary.kpiApprovalRecommendApprove || 0);
  const approvalReviewNeeded = Number(approvalReviewSummary.approvalNeeded || 0);
  const approvalReviewHold = Number(approvalReviewSummary.hold || summary.kpiApprovalHold || 0);
  const approvalReviewBlocked = Number(approvalReviewSummary.blocked || summary.kpiApprovalBlocked || 0);
  const landedActionConflictSummary = landedActionConflictAudit?.summary || {};
  const landedActionConflictStatus = text(landedActionConflictSummary.status || '');
  const landedActionSameEntityReverseCount = Number(landedActionConflictSummary.sameEntityReverseCount || 0);
  const landedActionSameNameMixedCount = Number(landedActionConflictSummary.sameNameReverseDifferentEntityCount || 0);
  const landedActionLatestRunMixedSkuCount = Number(landedActionConflictSummary.latestRunMixedSkuCount || 0);
  const rawDepositIncomplete = (
    (depositStatus && depositStatus !== 'complete') ||
    depositMissingCount > 0 ||
    (!depositStatus && (
      rawDailyClosureReasons.includes('deposit_partial') ||
      rawDailyClosureReasons.includes('deposit_missing_raw')
    ))
  );
  const dailyClosureReasons = rawDepositIncomplete
    ? rawDailyClosureReasons
    : rawDailyClosureReasons.filter(reason => !['deposit_partial', 'deposit_missing_raw'].includes(reason));
  const kpiRequiresRecovery = (
    kpiStatus === 'off_track' ||
    operatingClosureStatus === 'needs_recovery' ||
    dailyClosureReasons.includes('kpi_off_track')
  );
  const depositIncomplete = rawDepositIncomplete;
  const missingRawOriginalItems = depositMissingItems.filter(item => RAW_ORIGINAL_MISSING_CLASSES.includes(item));
  const suspiciousRawOriginalItems = depositSuspiciousItems
    .map(item => RAW_ORIGINAL_SUSPICIOUS_CLASSES[item] || '')
    .filter(Boolean);
  const rawRecoveryRequired = depositIncomplete && (missingRawOriginalItems.length > 0 || suspiciousRawOriginalItems.length > 0);
  const nextBusinessDayTarget = summary.recoveryGateTargetBusinessDate ||
    handoff.kpiSummary?.recoveryPace?.nextBusinessDayTarget?.businessDate ||
    '';
  const laterRecoveryTarget = dateOnly(handoff.kpiSummary?.recoveryPace?.nextBusinessDayTarget?.businessDate);

  pushMismatch(errors, 'outputDate', date, outputDate);
  pushMismatch(errors, 'handoff.businessDate', businessDate, dateOnly(handoff.businessDate));
  pushMismatch(errors, 'handoff.dataDate', dataDate, dateOnly(handoff.dataDate));
  pushMismatch(errors, 'handoff.dataFreshness.businessDate', businessDate, dateOnly(handoffFreshness.businessDate));
  pushMismatch(errors, 'handoff.dataFreshness.dataDate', dataDate, dateOnly(handoffFreshness.dataDate));
  pushMismatch(errors, 'dataLagDays', expectedLagDays, Number(handoffFreshness.dataLagDays));
  pushMismatch(errors, 'summary.dataLagDays', expectedLagDays, Number(summary.dataLagDays));
  pushMismatch(errors, 'handoff.summary.dailyClosureStatus', dailyClosureStatus, text(handoffSummary.dailyClosureStatus));
  pushMismatch(errors, 'handoff.summary.dailyComplete', dailyComplete, handoffSummary.dailyComplete === true);

  if (!dailyClosureStatus) errors.push('dailyClosureStatus missing');
  if (report.closedLoop !== true) errors.push(`closedLoop must be true, got ${report.closedLoop}`);
  if (summary.closedLoop !== true) errors.push(`summary.closedLoop must be true, got ${summary.closedLoop}`);
  if (summary.closedLoop !== report.closedLoop) errors.push(`closedLoop mismatch: report ${report.closedLoop}, summary ${summary.closedLoop}`);
  if (enforceArtifactSummaryState) {
    if (summary.artifactVerificationOk === false) {
      errors.push('summary.artifactVerificationOk must not be false');
    }
    if (artifactVerificationErrors.length) {
      errors.push(`summary.artifactVerificationErrors must be empty: ${artifactVerificationErrors.join('; ')}`);
    }
    if (intermediateArtifactVerificationErrors.length) {
      errors.push(`summary.intermediateArtifactVerificationErrors must be empty: ${intermediateArtifactVerificationErrors.join('; ')}`);
    }
  }
  if (kpiRequiresRecovery && !nextBusinessDayTarget) {
    errors.push('KPI recovery gate target missing while KPI requires recovery');
  }
  if (kpiRequiresRecovery && recoveryEvidenceCount <= 0) {
    errors.push('KPI recovery evidence missing: no landed actions, manual reviews, approval-needed items, blocked items, or feedback applied');
  }
  if (dailyOperatingWorkflowActive) {
    if (dailyOperatingWorkflowStatus === 'needs_recovery') {
      if (dailyComplete) {
        errors.push('dailyComplete cannot be true while daily operating workflow needs recovery');
      }
      if (dailyClosureStatus === 'complete') {
        errors.push('dailyClosureStatus cannot be complete while daily operating workflow needs recovery');
      }
    }
    if (!includesAll(handoffText, [
      '## 每日经营工作流',
      `status: ${dailyOperatingWorkflowStatus}`,
    ])) {
      errors.push(`handoff missing daily operating workflow status ${dailyOperatingWorkflowStatus}`);
    }
    if (!includesAll(dashboardText, [
      '每日经营工作流',
      `status ${dailyOperatingWorkflowStatus}`,
    ])) {
      errors.push(`dashboard missing daily operating workflow status ${dailyOperatingWorkflowStatus}`);
    }
    if (dailyOperatingWorkflowBlockers.length && !includesAll(handoffText, dailyOperatingWorkflowBlockers)) {
      errors.push('handoff missing one or more daily operating workflow blockers');
    }
    if (dailyOperatingWorkflowBlockers.length && !includesAll(dashboardText, dailyOperatingWorkflowBlockers)) {
      errors.push('dashboard missing one or more daily operating workflow blockers');
    }
  }
  if (dueReviews > 0) {
    if (!reviewQueue) {
      errors.push(`missing review queue file while due reviews exist: ${reviewQueueFile}`);
    } else if (reviewQueueDue < dueReviews) {
      errors.push(`review queue due count too small: expected at least ${dueReviews}, got ${reviewQueueDue}`);
    }
    if (!effectReview) {
      errors.push(`missing effect review file while due reviews exist: ${effectReviewFile}`);
    } else if (effectReviewTotal < dueReviews) {
      errors.push(`effect review coverage too small: expected at least ${dueReviews}, got ${effectReviewTotal}`);
    }
    if (effectReviewFeedbackApplied < dueReviews) {
      errors.push(`effect review feedback coverage too small: expected at least ${dueReviews}, got ${effectReviewFeedbackApplied}`);
    }
    const expectedCoverageTokens = [
      'Effect Review Coverage',
      `dueReviews ${dueReviews}`,
      `effectReviewTotal ${effectReviewTotal}`,
      `feedbackApplied ${effectReviewFeedbackApplied}`,
    ];
    if (!includesAll(handoffText, expectedCoverageTokens)) {
      errors.push('handoff missing visible effect review coverage');
    }
    const expectedDashboardCoverageTokens = [
      'Effect review coverage',
      `dueReviews ${dueReviews}`,
      `effectReviewTotal ${effectReviewTotal}`,
      `feedbackApplied ${effectReviewFeedbackApplied}`,
    ];
    if (!includesAll(dashboardText, expectedDashboardCoverageTokens)) {
      errors.push('dashboard missing visible effect review coverage');
    }
  }
  if (kpiRequiresRecovery && recoveryEvidenceCount > 0) {
    const handoffHasRecoveryEvidence = includesAny(handoffText, [
      '## 已落地动作沉淀',
      '## 已落地动作沉淀',
      'landedActionSuccess',
      `成功 ${landedActionSuccess}`,
      `需人工复核 ${landedActionManualReview}`,
      `成功 ${landedActionSuccess}`,
      `需人工复核 ${landedActionManualReview}`,
      `approvalNeeded ${writeApprovalNeeded}`,
      `blocked ${writeBlocked}`,
      `反馈 ${feedbackApplied}`,
    ]);
    if (!handoffHasRecoveryEvidence) {
      errors.push('handoff missing visible KPI recovery evidence');
    }

    const dashboardHasRecoveryEvidence = includesAny(dashboardText, [
      '已落地动作',
      'landedActionSuccess',
      `>${landedActionSuccess}<`,
      `manual ${landedActionManualReview}`,
      `approvalNeeded ${writeApprovalNeeded}`,
      `blocked ${writeBlocked}`,
    ]);
    if (!dashboardHasRecoveryEvidence) {
      errors.push('dashboard missing visible KPI recovery evidence');
    }
  }
  if (landedActionSuccess > 0) {
    if (!landedActionConflictAudit) {
      errors.push(`missing or invalid landed action conflict audit file: ${landedActionConflictAuditFile}`);
    } else {
      pushMismatch(errors, 'landedActionConflictAudit.date', landedActionConflictExpectedAuditDate, dateOnly(landedActionConflictAudit.date));
      const validConflictStatuses = new Set(['clear', 'review_needed', 'blocked_conflict']);
      if (!validConflictStatuses.has(landedActionConflictStatus)) {
        errors.push(`landed action conflict audit status invalid: ${landedActionConflictStatus || 'missing'}`);
      }
      if (landedActionSameEntityReverseCount > 0 || landedActionConflictStatus === 'blocked_conflict') {
        errors.push(`landed action conflict audit has blocking same-entity reverse conflicts: ${landedActionSameEntityReverseCount}`);
      }
      if (landedActionSameNameMixedCount > 0) {
        if (!landedActionConflictAuditMarkdownText) {
          errors.push(`missing landed action conflict audit markdown file: ${landedActionConflictAuditMarkdownFile}`);
        } else if (!includesAll(landedActionConflictAuditMarkdownText, [
          'Same-name mixed direction review',
          'mixed_direction_review',
        ])) {
          errors.push('landed action conflict audit markdown missing same-name mixed direction review evidence');
        }
      }
    }
  }
  if (recoveryDryRunHighEfficiencyBidUps > 0) {
    if (!kpiDryRunDecision) {
      errors.push(`missing or invalid KPI dry-run decision file: ${kpiDryRunDecisionFile}`);
    } else {
      pushMismatch(errors, 'kpiDryRunDecision.date', date, dateOnly(kpiDryRunDecision.date));
      if (dryRunDecisionTotal < recoveryDryRunHighEfficiencyBidUps) {
        errors.push(`KPI dry-run decision total too small: expected at least ${recoveryDryRunHighEfficiencyBidUps}, got ${dryRunDecisionTotal}`);
      }
      const allDryRunCandidatesAlreadyLanded = dryRunDecisionExecuted >= recoveryDryRunHighEfficiencyBidUps;
      if (!allDryRunCandidatesAlreadyLanded && Number(dryRunDecisionByDecision.blocked || 0) <= 0 && Number(dryRunDecisionByDecision.approval_needed || 0) <= 0) {
        errors.push('KPI dry-run decision split missing blocked or approval_needed classifications');
      }
    }
    if (!kpiDryRunDecisionMarkdownText) {
      errors.push(`missing KPI dry-run decision markdown file: ${kpiDryRunDecisionMarkdownFile}`);
    } else if (dryRunDecisionExecuted < recoveryDryRunHighEfficiencyBidUps && !includesAll(kpiDryRunDecisionMarkdownText, [
      'approval_needed',
      'blocked',
    ])) {
      errors.push('KPI dry-run decision markdown missing approval_needed or blocked evidence');
    }
    if (!includesAll(handoffText, [
      'KPI Recovery Dry Run',
      `highEfficiencyBidUps ${recoveryDryRunHighEfficiencyBidUps}`,
      `SKUs ${recoveryDryRunSkuCount}`,
      'not counted as landed actions',
    ])) {
      errors.push('handoff missing visible KPI recovery dry-run candidates');
    }
    if (recoveryDryRunLatestRunId && !handoffText.includes(recoveryDryRunLatestRunId)) {
      errors.push(`handoff missing KPI recovery dry-run latest run ${recoveryDryRunLatestRunId}`);
    }
    if (!includesAll(dashboardText, [
      'KPI recovery dry-run',
      `highEfficiencyBidUps ${recoveryDryRunHighEfficiencyBidUps}`,
      `SKUs ${recoveryDryRunSkuCount}`,
      'not landed actions',
    ])) {
      errors.push('dashboard missing visible KPI recovery dry-run candidates');
    }
    if (recoveryDryRunLatestRunId && !dashboardText.includes(recoveryDryRunLatestRunId)) {
      errors.push(`dashboard missing KPI recovery dry-run latest run ${recoveryDryRunLatestRunId}`);
    }
    if (!includesAll(handoffText, [
      'KPI Dry-Run Decision Split',
      'approvalNeeded',
      'blocked',
    ])) {
      errors.push('handoff missing KPI dry-run decision split');
    }
    if (!includesAll(dashboardText, [
      'KPI dry-run decision split',
      'approvalNeeded',
      'blocked',
    ])) {
      errors.push('dashboard missing KPI dry-run decision split');
    }
    if (!kpiRecoveryNextActionsText) {
      errors.push(`missing KPI recovery next-actions file: ${kpiRecoveryNextActionsFile}`);
    } else if (!includesAll(kpiRecoveryNextActionsText, [
      '## Account Gate',
      '## Already Landed',
      '## High-Priority Watch Pool',
      '## Blocked Pool',
      '## True Approval Needed',
    ])) {
      errors.push('KPI recovery next-actions file missing required operator sections');
    } else {
      const nextActionsName = path.basename(kpiRecoveryNextActionsFile);
      if (!includesAll(handoffText, ['KPI Recovery Next Actions', nextActionsName])) {
        errors.push(`handoff missing KPI recovery next-actions ${nextActionsName}`);
      }
      if (!includesAll(dashboardText, ['KPI recovery next actions', nextActionsName])) {
        errors.push(`dashboard missing KPI recovery next-actions ${nextActionsName}`);
      }
    }
  }
  if (writeApprovalNeeded > 0 || approvalReviewTotal > 0) {
    if (!kpiApprovalReview) {
      errors.push(`missing or invalid KPI approval review file: ${kpiApprovalReviewFile}`);
    } else {
      pushMismatch(errors, 'kpiApprovalReview.date', date, dateOnly(kpiApprovalReview.date));
      if (approvalReviewTotal < writeApprovalNeeded) {
        errors.push(`KPI approval review total too small: expected at least ${writeApprovalNeeded}, got ${approvalReviewTotal}`);
      }
    }
    if (!kpiApprovalReviewMarkdownText) {
      errors.push(`missing KPI approval review markdown file: ${kpiApprovalReviewMarkdownFile}`);
    } else if (!includesAll(kpiApprovalReviewMarkdownText, [
      '## Summary',
      '## recommend_approve',
      '## approval_needed',
      '## hold',
      '## blocked',
    ])) {
      errors.push('KPI approval review markdown missing required operator sections');
    }
    const approvalReviewName = path.basename(kpiApprovalReviewMarkdownFile);
    if (!includesAll(handoffText, [
      'KPI Approval Review',
      approvalReviewName,
      `recommendApprove ${approvalReviewRecommended}`,
      `hold ${approvalReviewHold}`,
      `blocked ${approvalReviewBlocked}`,
    ])) {
      errors.push(`handoff missing KPI approval review ${approvalReviewName}`);
    }
    if (!includesAll(dashboardText, [
      'KPI approval review',
      path.basename(kpiApprovalReviewFile),
      `recommendApprove ${approvalReviewRecommended}`,
      `hold ${approvalReviewHold}`,
      `blocked ${approvalReviewBlocked}`,
    ])) {
      errors.push(`dashboard missing KPI approval review ${path.basename(kpiApprovalReviewFile)}`);
    }
    if (kpiRecoveryNextActionsText && !includesAll(kpiRecoveryNextActionsText, [
      '## Recommended Approval',
      '## True Approval Needed',
      '## Hold',
      '## Approval Review Blocked',
      `recommendApprove`,
    ])) {
      errors.push('KPI recovery next-actions missing approval review split');
    }
  }
  const monthDigestRequired = summary.monthKpiDigestReady === true ||
    !!report.files?.monthKpiDigestFile ||
    !!report.files?.monthKpiDigestMarkdownFile;
  if (monthDigestRequired) {
    if (!monthKpiDigest) {
      errors.push(`missing month KPI digest file: ${monthKpiDigestFile}`);
    }
    if (!monthKpiDigestMarkdownText) {
      errors.push(`missing month KPI digest markdown file: ${monthKpiDigestMarkdownFile}`);
    } else if (!includesAll(monthKpiDigestMarkdownText, [
      '月 KPI 运营摘要',
      'KPI 仍未追回',
      '下一业务日验收线',
      '复查覆盖',
    ])) {
      errors.push('month KPI digest markdown missing required operator sections');
    }
    const monthDigestName = path.basename(monthKpiDigestMarkdownFile);
    if (!includesAll(dashboardText, ['Month KPI digest', monthDigestName])) {
      errors.push(`dashboard missing month KPI digest ${monthDigestName}`);
    }
  }
  if (kpiCheckpoint) {
    if (!operatorCheckpointText) {
      errors.push(`missing operator KPI recovery checkpoint file: ${operatorCheckpointFile}`);
    } else {
      if (!operatorCheckpointText.includes(`KPI recovery operator checkpoint - ${date}`)) {
        errors.push(`operator checkpoint missing date heading ${date}`);
      }
      if (businessDate && !operatorCheckpointText.includes(`Business date: ${businessDate}`)) {
        errors.push(`operator checkpoint missing businessDate ${businessDate}`);
      }
      if (dataDate && !operatorCheckpointText.includes(`Data date: ${dataDate}`)) {
        errors.push(`operator checkpoint missing dataDate ${dataDate}`);
      }
      if (!dailyClosureStatusAliases.some(status => operatorCheckpointText.includes(`Current status: ${status}`))) {
        errors.push(`operator checkpoint missing current status ${dailyClosureStatus}`);
      }
      if (!operatorCheckpointText.includes(`dailyComplete=${dailyComplete ? 'true' : 'false'}`)) {
        errors.push(`operator checkpoint missing dailyComplete=${dailyComplete}`);
      }
      if (kpiGate?.status && !operatorCheckpointText.includes(`Gate status: ${text(kpiGate.status)}`)) {
        errors.push(`operator checkpoint missing KPI gate status ${text(kpiGate.status)}`);
      }
      const kpiGateTargetDate = dateOnly(kpiGate?.target?.businessDate);
      if (kpiGateTargetDate && !operatorCheckpointText.includes(`Target business date: ${kpiGateTargetDate}`)) {
        errors.push(`operator checkpoint missing KPI gate target ${kpiGateTargetDate}`);
      }
      const kpiGateEvaluatedDate = dateOnly(kpiGate?.evaluatedBusinessDate || businessDate);
      if (kpiGateEvaluatedDate && !operatorCheckpointText.includes(`evaluated business date: ${kpiGateEvaluatedDate}`)) {
        errors.push(`operator checkpoint missing KPI gate evaluated date ${kpiGateEvaluatedDate}`);
      }
      if (depositMissingItems.length && !includesAll(operatorCheckpointText, depositMissingItems)) {
        errors.push('operator checkpoint missing one or more deposit missing items');
      }
      if (depositSuspiciousItems.length && !includesAll(operatorCheckpointText, depositSuspiciousItems)) {
        errors.push('operator checkpoint missing one or more deposit suspicious items');
      }
      const checkpointNextTargetDate = dateOnly(kpiCheckpoint?.nextRecoveryTarget?.businessDate);
      if (checkpointNextTargetDate && !operatorCheckpointText.includes(`Next recovery target for ${checkpointNextTargetDate}`)) {
        errors.push(`operator checkpoint missing next recovery target ${checkpointNextTargetDate}`);
      }
      if (recoveryDryRunHighEfficiencyBidUps > 0 && !includesAll(operatorCheckpointText, [
        'KPI recovery dry-run',
        `highEfficiencyBidUps ${recoveryDryRunHighEfficiencyBidUps}`,
        `SKUs ${recoveryDryRunSkuCount}`,
        'not counted as landed actions',
      ])) {
        errors.push('operator checkpoint missing visible KPI recovery dry-run candidates');
      }
      if (recoveryDryRunLatestRunId && !operatorCheckpointText.includes(recoveryDryRunLatestRunId)) {
        errors.push(`operator checkpoint missing KPI recovery dry-run latest run ${recoveryDryRunLatestRunId}`);
      }
    }
  }
  if (operatingClosureStatus === 'needs_recovery') {
    if (dailyComplete) {
      errors.push('dailyComplete cannot be true while operatingClosureStatus is needs_recovery');
    }
    if (dailyClosureStatus === 'complete') {
      errors.push('dailyClosureStatus cannot be complete while operatingClosureStatus is needs_recovery');
    }
  }
  if (depositIncomplete) {
    if (dailyComplete) {
      errors.push(`dailyComplete cannot be true while deposit is incomplete: status=${depositStatus || 'missing'}, missing=${depositMissingCount}`);
    }
    if (dailyClosureStatus === 'complete') {
      errors.push(`dailyClosureStatus cannot be complete while deposit is incomplete: status=${depositStatus || 'missing'}, missing=${depositMissingCount}`);
    }
    if (depositMissingCount > 0 && !depositMissingItems.length) {
      errors.push('deposit missing detail list missing while depositMissingCount is positive');
    }
    if (depositMissingItems.length && !includesAll(handoffText, depositMissingItems)) {
      errors.push('handoff missing one or more deposit missing items');
    }
    if (depositMissingItems.length && !includesAll(dashboardText, depositMissingItems)) {
      errors.push('dashboard missing one or more deposit missing items');
    }
    if (depositSuspiciousItems.length && !includesAll(handoffText, depositSuspiciousItems)) {
      errors.push('handoff missing one or more deposit suspicious items');
    }
    if (depositSuspiciousItems.length && !includesAll(dashboardText, depositSuspiciousItems)) {
      errors.push('dashboard missing one or more deposit suspicious items');
    }
    if (rawRecoveryRequired) {
      if (!rawRecoveryQueue) {
        errors.push(`missing or invalid raw recovery queue file: ${rawRecoveryQueueFile}`);
      } else {
        const rawRecoveryStatus = text(rawRecoveryQueue.status);
        const rawRecoveryItems = Array.isArray(rawRecoveryQueue.items) ? rawRecoveryQueue.items : [];
        const rawRecoveryMissingClasses = rawRecoveryItems.map(item => text(item?.missingClass)).filter(Boolean);
        const expectedRawRecoveryClasses = [...new Set([...missingRawOriginalItems, ...suspiciousRawOriginalItems])];
        const rawRecoveryOpenCount = Number(rawRecoveryQueue.summary?.rawRecoveryItems || rawRecoveryItems.length || 0);
        const rawRecoveryMissingCount = Number(rawRecoveryQueue.summary?.missingRawOriginals || 0);
        const rawRecoverySuspiciousCount = Number(rawRecoveryQueue.summary?.suspiciousRawOriginals || 0);
        const rawRecoveryNeedsRedownload = Number(rawRecoveryQueue.summary?.needsRedownload || 0);

        if (rawRecoveryStatus !== 'open') {
          errors.push(`raw recovery queue status must be open while raw originals are missing or suspicious: ${rawRecoveryStatus || 'missing'}`);
        }
        if (rawRecoveryOpenCount < expectedRawRecoveryClasses.length) {
          errors.push(`raw recovery queue rawRecoveryItems too low: expected at least ${expectedRawRecoveryClasses.length}, got ${rawRecoveryOpenCount}`);
        }
        if (rawRecoveryMissingCount < missingRawOriginalItems.length) {
          errors.push(`raw recovery queue missingRawOriginals too low: expected at least ${missingRawOriginalItems.length}, got ${rawRecoveryMissingCount}`);
        }
        if (rawRecoverySuspiciousCount < suspiciousRawOriginalItems.length) {
          errors.push(`raw recovery queue suspiciousRawOriginals too low: expected at least ${suspiciousRawOriginalItems.length}, got ${rawRecoverySuspiciousCount}`);
        }
        if (rawRecoveryNeedsRedownload < 1) {
          errors.push('raw recovery queue must include at least one redownload item while raw originals are missing or suspicious');
        }
        if (!includesAll(rawRecoveryMissingClasses.join('\n'), expectedRawRecoveryClasses)) {
          errors.push('raw recovery queue missing one or more raw original missing/suspicious classes');
        }
      }
      if (!rawRecoveryMarkdownText) {
        errors.push(`missing raw recovery queue markdown file: ${rawRecoveryMarkdownFile}`);
      } else {
        if (!rawRecoveryMarkdownText.includes('Status: open')) {
          errors.push('raw recovery queue markdown missing Status: open');
        }
        if (!includesAll(rawRecoveryMarkdownText, [...new Set([...missingRawOriginalItems, ...suspiciousRawOriginalItems])])) {
          errors.push('raw recovery queue markdown missing one or more raw original missing/suspicious classes');
        }
      }
    }
  }
  if (report.closedLoop === true && !dashboardText.includes('closedLoop=true')) errors.push('dashboard missing closedLoop=true');
  if (!handoffText.includes(`业务日期：${businessDate}`)) errors.push(`handoff markdown missing businessDate ${businessDate}`);
  if (!handoffText.includes(`数据日期：${dataDate}`)) errors.push(`handoff markdown missing dataDate ${dataDate}`);
  if (!dailyClosureStatusAliases.some(status => handoffText.includes(`dailyClosureStatus: ${status}`))) errors.push(`handoff markdown missing dailyClosureStatus ${dailyClosureStatus}`);
  if (!handoffText.includes(`dailyComplete=${dailyComplete ? 'true' : 'false'}`)) errors.push(`handoff markdown missing dailyComplete=${dailyComplete}`);
  if (!includesAll(handoffText, dailyClosureReasons)) errors.push('handoff markdown missing one or more dailyClosureReasons');
  if (!dashboardText.includes(`businessDate ${businessDate}`)) errors.push(`dashboard businessDate mismatch or missing ${businessDate}`);
  if (!dashboardText.includes(`dataDate ${dataDate}`)) errors.push(`dashboard dataDate mismatch or missing ${dataDate}`);
  if (!dailyClosureStatusAliases.some(status => dashboardText.includes(`dailyClosureStatus: ${status}`))) errors.push(`dashboard missing dailyClosureStatus ${dailyClosureStatus}`);
  if (!dashboardText.includes(`dailyComplete=${dailyComplete ? 'true' : 'false'}`)) errors.push(`dashboard missing dailyComplete=${dailyComplete}`);
  if (!includesAll(dashboardText, dailyClosureReasons)) errors.push('dashboard missing one or more dailyClosureReasons');
  if (nextBusinessDayTarget && !handoffText.includes(`businessDate ${nextBusinessDayTarget}`)) {
    errors.push(`handoff missing next business day target ${nextBusinessDayTarget}`);
  }
  if (
    nextBusinessDayTarget &&
    !dashboardText.includes(`下一业务日验收线 ${nextBusinessDayTarget}`) &&
    !dashboardText.includes(`上一验收线回查 ${nextBusinessDayTarget}`)
  ) {
    errors.push(`dashboard missing next business day target ${nextBusinessDayTarget}`);
  }

  if (nextBusinessDayTarget) {
    if (!kpiGate) {
      errors.push(`missing or invalid KPI recovery gate file: ${kpiGateFile}`);
    } else {
      const kpiGateStatus = text(kpiGate.status);
      const kpiGateTargetDate = dateOnly(kpiGate.target?.businessDate);
      pushMismatch(errors, 'kpiGate.outputDate', date, dateOnly(kpiGate.outputDate));
      pushMismatch(errors, 'kpiGate.target.businessDate', nextBusinessDayTarget, kpiGateTargetDate);
      if (text(summary.kpiGateStatus)) {
        pushMismatch(errors, 'summary.kpiGateStatus', text(summary.kpiGateStatus), kpiGateStatus);
      }
      const allowedStatuses = new Set(['target_set_actual_pending', 'pending', 'pass', 'fail']);
      if (!allowedStatuses.has(kpiGateStatus)) {
        errors.push(`kpiGate.status invalid: ${kpiGateStatus || 'missing'}`);
      }
      if (['target_set_actual_pending', 'pending'].includes(kpiGateStatus)) {
        if (dailyComplete) {
          errors.push(`dailyComplete cannot be true while KPI gate is ${kpiGateStatus}`);
        }
        if (dailyClosureStatus === 'complete') {
          errors.push(`dailyClosureStatus cannot be complete while KPI gate is ${kpiGateStatus}`);
        }
      }
      if (kpiGateStatus && !handoffText.includes(kpiGateStatus)) {
        errors.push(`handoff missing KPI gate status ${kpiGateStatus}`);
      }
      if (kpiGateStatus && !dashboardText.includes(kpiGateStatus)) {
        errors.push(`dashboard missing KPI gate status ${kpiGateStatus}`);
      }
      if (kpiGateTargetDate && !handoffText.includes(kpiGateTargetDate)) {
        errors.push(`handoff missing KPI gate target ${kpiGateTargetDate}`);
      }
      if (kpiGateTargetDate && !dashboardText.includes(kpiGateTargetDate)) {
        errors.push(`dashboard missing KPI gate target ${kpiGateTargetDate}`);
      }
      if (['pass', 'fail'].includes(kpiGateStatus) && laterRecoveryTarget && laterRecoveryTarget !== kpiGateTargetDate) {
        if (!kpiCheckpoint) {
          errors.push(`missing or invalid KPI recovery checkpoint file: ${kpiCheckpointFile}`);
        } else {
          const checkpointGateStatus = text(kpiCheckpoint.kpiGate?.status);
          const checkpointGateTargetDate = dateOnly(kpiCheckpoint.kpiGate?.targetBusinessDate);
          const checkpointNextTargetDate = dateOnly(kpiCheckpoint.nextRecoveryTarget?.businessDate);
          pushMismatch(errors, 'kpiCheckpoint.kpiGate.status', kpiGateStatus, checkpointGateStatus);
          pushMismatch(errors, 'kpiCheckpoint.kpiGate.targetBusinessDate', kpiGateTargetDate, checkpointGateTargetDate);
          pushMismatch(errors, 'kpiCheckpoint.nextRecoveryTarget.businessDate', laterRecoveryTarget, checkpointNextTargetDate);
          if (kpiGateStatus === 'fail') {
            pushMismatch(
              errors,
              'kpiCheckpoint.nextRecoveryTarget.relationshipToGate',
              'next_recovery_after_failed_gate',
              text(kpiCheckpoint.nextRecoveryTarget?.relationshipToGate)
            );
          }
          const checkpointHasNextCheck = Array.isArray(kpiCheckpoint.nextChecks) &&
            kpiCheckpoint.nextChecks.some(item => text(item?.name) === 'track_next_recovery_target');
          if (!checkpointHasNextCheck) {
            errors.push('kpiCheckpoint missing track_next_recovery_target next check');
          }
        }
      }
    }
  }

  const finalErrors = errors.filter(error => {
    if (error === `handoff markdown missing businessDate ${businessDate}` && handoffText.includes(`业务日期：${businessDate}`)) return false;
    if (error === `handoff markdown missing dataDate ${dataDate}` && handoffText.includes(`数据日期：${dataDate}`)) return false;
    if (error === `handoff missing next business day target ${nextBusinessDayTarget}` && handoffText.includes(`target ${nextBusinessDayTarget}`)) return false;
    if (error === 'handoff missing visible KPI recovery evidence' && includesAny(handoffText, [
      '## 已落地动作沉淀',
      `成功 ${landedActionSuccess}`,
      `需人工复核 ${landedActionManualReview}`,
    ])) return false;
    return true;
  });

  return {
    ok: finalErrors.length === 0,
    date,
    errors: finalErrors,
    summary: {
      outputDate,
      businessDate,
      dataDate,
      dataLagDays: expectedLagDays,
      dailyClosureStatus,
      dailyComplete,
      dailyClosureReasons,
      closedLoop: report.closedLoop === true,
      kpiStatus,
      operatingClosureStatus,
      landedActionSuccess,
      landedActionFailed,
      landedActionManualReview,
      writeApprovalNeeded,
      writeBlocked,
      feedbackApplied,
      effectReviewFeedbackApplied,
      depositStatus,
      depositMissingCount,
      depositMissingItems,
      depositSuspiciousItems,
      rawRecoveryRequired,
      rawRecoveryQueueStatus: text(rawRecoveryQueue?.status || ''),
      rawRecoveryOpen: Number(rawRecoveryQueue?.summary?.rawRecoveryItems || rawRecoveryQueue?.items?.length || 0),
      nextBusinessDayTarget,
      nextRecoveryTarget: laterRecoveryTarget,
      kpiGateStatus: text(kpiGate?.status || ''),
      kpiCheckpointNextRecoveryTarget: dateOnly(kpiCheckpoint?.nextRecoveryTarget?.businessDate),
      recoveryDryRunHighEfficiencyBidUps,
      recoveryDryRunSkuCount,
      recoveryDryRunDecisionTotal: dryRunDecisionTotal,
      recoveryDryRunDecisionExecuted: dryRunDecisionExecuted,
      recoveryDryRunDecisionApprovalNeeded: Number(dryRunDecisionByDecision.approval_needed || 0),
      recoveryDryRunDecisionBlocked: Number(dryRunDecisionByDecision.blocked || 0),
      kpiRecoveryNextActionsReady: !!kpiRecoveryNextActionsText,
      kpiApprovalReviewReady: !!kpiApprovalReviewMarkdownText,
      kpiApprovalReviewTotal: approvalReviewTotal,
      kpiApprovalRecommendApprove: approvalReviewRecommended,
      kpiApprovalReviewApprovalNeeded: approvalReviewNeeded,
      kpiApprovalReviewHold: approvalReviewHold,
      kpiApprovalReviewBlocked: approvalReviewBlocked,
      monthKpiDigestReady: !!monthKpiDigestMarkdownText,
      dueReviews,
      reviewQueueDue,
      effectReviewTotal,
      dailyOperatingWorkflowStatus,
      dailyOperatingWorkflowBlockers,
      dailyOperatingWorkflow,
      landedActionConflictStatus,
      landedActionSameEntityReverseCount,
      landedActionSameNameMixedCount,
      landedActionLatestRunMixedSkuCount,
    },
    files: {
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
        kpiApprovalReviewFile,
        kpiApprovalReviewMarkdownFile,
        monthKpiDigestFile,
        monthKpiDigestMarkdownFile,
        hubFile,
      reviewQueueFile,
      effectReviewFile,
    },
  };
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    date: get('--date') || get('--today') || process.env.AGENT_TODAY || '',
    closedLoopFile: get('--closed-loop') || '',
    handoffFile: get('--handoff') || '',
    dashboardFile: get('--dashboard') || '',
    kpiGateFile: get('--kpi-gate') || '',
    kpiCheckpointFile: get('--kpi-checkpoint') || '',
    operatorCheckpointFile: get('--operator-checkpoint') || '',
    rawRecoveryQueueFile: get('--raw-recovery-queue') || '',
    rawRecoveryMarkdownFile: get('--raw-recovery-md') || '',
    landedActionConflictAuditFile: get('--landed-action-conflict-audit') || '',
    landedActionConflictAuditMarkdownFile: get('--landed-action-conflict-md') || '',
    kpiDryRunDecisionFile: get('--kpi-dryrun-decisions') || '',
    kpiDryRunDecisionMarkdownFile: get('--kpi-dryrun-decisions-md') || '',
    kpiRecoveryNextActionsFile: get('--kpi-next-actions') || '',
    kpiApprovalReviewFile: get('--kpi-approval-review') || '',
    kpiApprovalReviewMarkdownFile: get('--kpi-approval-review-md') || '',
    monthKpiDigestFile: get('--month-kpi-digest') || '',
    monthKpiDigestMarkdownFile: get('--month-kpi-digest-md') || '',
    hubFile: get('--hub') || '',
    reviewQueueFile: get('--review-queue') || '',
    effectReviewFile: get('--effect-review') || '',
    outFile: get('--out') || '',
  };
}

function main() {
  const options = parseArgs(process.argv);
  const result = verifyDailyClosureArtifacts(options);
  const outFile = options.outFile || defaultFile('daily_closure_verify', result.date, 'json', path.join('data', 'agent'));
  writeJson(outFile, result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
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
  verifyDailyClosureArtifacts,
};
