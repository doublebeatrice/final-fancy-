const fs = require('fs');
const path = require('path');
const { buildSelectionKpiEvidence } = require('../../src/selection_kpi_evidence');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value, fallback) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw && fallback !== undefined) return fallback;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return fallback !== undefined ? fallback : new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function arrayOfText(value) {
  return Array.isArray(value) ? value.map(item => text(item?.type || item)).filter(Boolean) : [];
}

function getRecoveryPace(closedLoop = {}) {
  return (
    closedLoop.handoff?.kpiSummary?.recoveryPace ||
    closedLoop.kpiSummary?.recoveryPace ||
    closedLoop.recoveryPace ||
    closedLoop.handoff?.recoveryPace ||
    {}
  );
}

function buildNextRecoveryTarget(nextTarget = {}, gateStatus = '', gateTargetBusinessDate = '') {
  const businessDate = text(nextTarget.businessDate || nextTarget.targetBusinessDate);
  if (!businessDate) return null;

  const sameAsGate = businessDate === text(gateTargetBusinessDate);
  const status = text(gateStatus);

  return {
    businessDate,
    sales: nextTarget.salesTarget ?? nextTarget.sales ?? null,
    units: nextTarget.unitsTarget ?? nextTarget.units ?? null,
    netProfitRateMin: nextTarget.netProfitRateMin ?? null,
    acosMax: nextTarget.acosMax ?? null,
    refundRateMax: nextTarget.refundRateMax ?? null,
    adCostShareMax: nextTarget.adCostShareMax ?? null,
    estimatedNetProfitTarget: nextTarget.estimatedNetProfitTarget ?? null,
    relationshipToGate: sameAsGate
      ? 'current_gate_target'
      : status === 'fail'
        ? 'next_recovery_after_failed_gate'
        : 'next_pending_target',
  };
}

function summarizeRawCandidateSearch(rawDownloadCandidates = {}) {
  const byMissingClass = rawDownloadCandidates.byMissingClass || {};
  const byClass = {};
  for (const [missingClass, candidates] of Object.entries(byMissingClass)) {
    const items = Array.isArray(candidates) ? candidates : [];
    const sameDate = items.filter(item => item?.sameDate === true).length;
    const stale = items.filter(item => item?.sameDate === false && Number(item?.ageDays) > 0).length;
    const latest = items[0] || null;
    byClass[missingClass] = {
      total: items.length,
      sameDate,
      stale,
      latest: latest
        ? {
            name: text(latest.name || path.basename(latest.file || '')),
            file: text(latest.file),
            candidateDate: text(latest.candidateDate),
            ageDays: latest.ageDays ?? null,
            sameDate: latest.sameDate === true,
            action: text(latest.action),
          }
        : null,
    };
  }

  return {
    cutoffDate: text(rawDownloadCandidates.cutoffDate),
    rootsSearched: Array.isArray(rawDownloadCandidates.rootsSearched)
      ? rawDownloadCandidates.rootsSearched.map(text).filter(Boolean)
      : [],
    total: num(rawDownloadCandidates.total, 0),
    sameDateTotal: num(rawDownloadCandidates.sameDateTotal, 0),
    staleTotal: num(rawDownloadCandidates.staleTotal, 0),
    byMissingClass: byClass,
  };
}

function parseReasonMetric(reason = '', name = '') {
  const pattern = new RegExp(`${name}=(-?\\d+(?:\\.\\d+)?)`);
  const match = text(reason).match(pattern);
  return match ? num(match[1], null) : null;
}

function summarizeRecoveryDryRuns(adjustmentLog = [], outputDate = '') {
  const rows = Array.isArray(adjustmentLog)
    ? adjustmentLog
    : Array.isArray(adjustmentLog.rows)
      ? adjustmentLog.rows
      : Array.isArray(adjustmentLog.items)
        ? adjustmentLog.items
        : Array.isArray(adjustmentLog.adjustments)
          ? adjustmentLog.adjustments
          : [];

  const dryRuns = rows.filter(row => row?.dryRun === true && (!outputDate || text(row.businessDate || row.localDate) === outputDate));
  const highEfficiency = dryRuns.filter(row => text(row.reason).includes('high_efficiency'));
  const latest = highEfficiency
    .slice()
    .sort((a, b) => text(b.runAt).localeCompare(text(a.runAt)))[0];
  const latestRunId = text(latest?.sourceRunId || latest?.runId);
  const latestHighEfficiency = latestRunId
    ? highEfficiency.filter(row => text(row.sourceRunId || row.runId) === latestRunId)
    : highEfficiency;
  const byDecision = {};
  const byEntityType = {};
  const runCounts = {};
  const skuSet = new Set();

  for (const row of highEfficiency) {
    const runId = text(row.sourceRunId || row.runId || 'unknown');
    runCounts[runId] = (runCounts[runId] || 0) + 1;
  }

  for (const row of latestHighEfficiency) {
    const decision = text(row.reason).split(':')[0] || 'unknown';
    const entityType = text(row.entityType || 'unknown');
    byDecision[decision] = (byDecision[decision] || 0) + 1;
    byEntityType[entityType] = (byEntityType[entityType] || 0) + 1;
    if (text(row.sku)) skuSet.add(text(row.sku));
  }

  const sample = latestHighEfficiency
    .slice()
    .sort((a, b) => {
      const ordersDiff = num(parseReasonMetric(b.reason, 'orders7'), 0) - num(parseReasonMetric(a.reason, 'orders7'), 0);
      if (ordersDiff) return ordersDiff;
      return num(parseReasonMetric(a.reason, 'acos7'), 999) - num(parseReasonMetric(b.reason, 'acos7'), 999);
    })
    .slice(0, 10)
    .map(row => ({
      sku: text(row.sku),
      entityType: text(row.entityType),
      entityName: text(row.entityName),
      beforeValue: row.beforeValue ?? null,
      afterValue: row.afterValue ?? null,
      reasonCode: text(row.reason).split(':')[0],
      orders7: parseReasonMetric(row.reason, 'orders7'),
      acos7: parseReasonMetric(row.reason, 'acos7'),
      invDays: parseReasonMetric(row.reason, 'invDays'),
      netProfit: parseReasonMetric(row.reason, 'netProfit'),
    }));

  return {
    totalDryRuns: dryRuns.length,
    totalHighEfficiencyBidUps: highEfficiency.length,
    highEfficiencyBidUps: latestHighEfficiency.length,
    skuCount: skuSet.size,
    latestRunId,
    latestRunAt: text(latest?.runAt),
    latestRunCount: latestRunId ? num(runCounts[latestRunId], 0) : 0,
    byDecision,
    byEntityType,
    sample,
    decision: highEfficiency.length
      ? 'dry-run recovery candidates exist; review before any live execution'
      : 'no high-efficiency dry-run recovery candidates recorded',
  };
}

function adjustmentRows(adjustmentLog = []) {
  return Array.isArray(adjustmentLog)
    ? adjustmentLog
    : Array.isArray(adjustmentLog.rows)
      ? adjustmentLog.rows
      : Array.isArray(adjustmentLog.items)
        ? adjustmentLog.items
        : Array.isArray(adjustmentLog.adjustments)
          ? adjustmentLog.adjustments
          : [];
}

function hasHighEfficiencyDryRuns(adjustmentLog = [], date = '') {
  return adjustmentRows(adjustmentLog).some(row =>
    row?.dryRun === true &&
    text(row.businessDate || row.localDate) === date &&
    text(row.reason).includes('high_efficiency')
  );
}

function resolveAdjustmentBusinessDate(adjustmentLog = [], {
  explicitDate = '',
  gateStatus = '',
  targetDate = '',
  evaluatedDate = '',
  businessDate = '',
  outputDate = '',
} = {}) {
  if (explicitDate) return dateOnly(explicitDate);
  const candidates = text(gateStatus) === 'target_set_actual_pending'
    ? [targetDate, evaluatedDate, businessDate, outputDate]
    : [evaluatedDate, businessDate, targetDate, outputDate];
  const dates = [...new Set(candidates.map(item => dateOnly(item, '')).filter(Boolean))];
  return dates.find(date => hasHighEfficiencyDryRuns(adjustmentLog, date)) || dates[0] || outputDate;
}

function summarizeLandedActions(adjustmentLog = [], outputDate = '') {
  const liveRows = adjustmentRows(adjustmentLog)
    .filter(row => row?.dryRun !== true && (!outputDate || text(row.businessDate || row.localDate) === outputDate));
  const successOutcomes = new Set(['success', 'api_success']);
  const manualOutcomes = new Set(['manual_review', 'manualReview', 'needs_manual_review']);
  const failedOutcomes = new Set(['failed', 'api_failed', 'blocked', 'not_landed']);
  const summary = {
    success: 0,
    manualReview: 0,
    failed: 0,
  };

  for (const row of liveRows) {
    const outcome = text(row.outcome || row.status || row.finalStatus || row.meta?.finalStatus || row.meta?.apiStatus);
    if (successOutcomes.has(outcome)) {
      summary.success += 1;
    } else if (manualOutcomes.has(outcome)) {
      summary.manualReview += 1;
    } else if (failedOutcomes.has(outcome)) {
      summary.failed += 1;
    }
  }

  return summary;
}

function summarizeApprovalReview(kpiApprovalReview = {}, files = {}) {
  const summary = kpiApprovalReview.summary || {};
  const total = num(summary.total, 0);
  const recommendApprove = num(summary.recommendApprove ?? summary.byDecision?.recommend_approve, 0);
  const approvalNeeded = num(summary.approvalNeeded ?? summary.byDecision?.approval_needed, 0);
  const hold = num(summary.hold ?? summary.byDecision?.hold, 0);
  const blocked = num(summary.blocked ?? summary.byDecision?.blocked, 0);
  const markdownFile = text(files.kpiApprovalReviewMarkdown || files.kpiApprovalReviewMarkdownFile);
  const jsonFile = text(files.kpiApprovalReview || files.kpiApprovalReviewFile);

  return {
    ready: total > 0,
    total,
    skuCount: num(summary.skuCount, 0),
    recommendApprove,
    approvalNeeded,
    hold,
    blocked,
    jsonFile,
    markdownFile,
    markdownName: markdownFile ? path.basename(markdownFile) : '',
    decision: total > 0
      ? 'review recommend_approve and approval_needed items before any human-authorized live write'
      : 'no approval-needed write review is currently required',
  };
}

function buildCheckpoint({
  date = '',
  generatedAt = new Date().toISOString(),
  closureVerify = {},
  kpiGate = {},
  depositStatus = {},
  lowEfficiency = {},
  effectReview = {},
  writeExecution = {},
  kpiApprovalReview = {},
  closedLoop = {},
  adjustmentLog = [],
  selectionReports = {},
  files = {},
} = {}) {
  const outputDate = dateOnly(date || closureVerify.date || kpiGate.outputDate || closedLoop.outputDate || new Date());
  const closureSummary = {
    ...(closureVerify.summary || {}),
    ...(closedLoop.summary || {}),
  };
  const gateTarget = kpiGate.target || {};
  const gateActual = kpiGate.actual || {};
  const businessDate = text(closureSummary.businessDate || closedLoop.businessDate || kpiGate.evaluatedBusinessDate);
  const adjustmentBusinessDate = resolveAdjustmentBusinessDate(adjustmentLog, {
    explicitDate: files.adjustmentBusinessDate,
    gateStatus: kpiGate.status,
    targetDate: gateTarget.businessDate,
    evaluatedDate: kpiGate.evaluatedBusinessDate,
    businessDate,
    outputDate,
  });
  const lowTotals = lowEfficiency.summary?.totals || lowEfficiency.totals || {};
  const effectSummary = effectReview.summary || {};
  const writeSummary = writeExecution.summary || {};
  const lowRawActionable = num(lowTotals.actionable, 0);
  const lowCurrentExecutable = num(writeSummary.eligibleActions, 0);
  const missing = arrayOfText(depositStatus.missing || closureSummary.depositMissingItems || closureSummary.depositMissing);
  const suspicious = arrayOfText(depositStatus.suspicious || closureSummary.depositSuspiciousItems || closureSummary.depositSuspicious);
  const rawCandidateSearch = summarizeRawCandidateSearch(depositStatus.rawDownloadCandidates || {});
  const recoveryDryRun = summarizeRecoveryDryRuns(adjustmentLog, adjustmentBusinessDate);
  const approvalReview = summarizeApprovalReview(kpiApprovalReview, files);
  const landedFromAdjustments = summarizeLandedActions(adjustmentLog, adjustmentBusinessDate);
  const selectionKpiEvidence = buildSelectionKpiEvidence(selectionReports);
  const gateStatus = text(kpiGate.status || closureSummary.kpiGateStatus || 'unknown');
  const gateTargetBusinessDate = text(gateTarget.businessDate || closureSummary.nextBusinessDayTarget || closureSummary.recoveryGateTargetBusinessDate);
  const recoveryPace = getRecoveryPace(closedLoop);
  const nextRecoveryTarget = buildNextRecoveryTarget(
    recoveryPace.nextBusinessDayTarget,
    gateStatus,
    gateTargetBusinessDate
  );
  const nextChecks = [
    {
      name: 'refresh_deposit_status',
      command: `npm run ops:deposit:status -- --date ${outputDate} --json`,
      successCondition: 'status=complete and missing=[]',
    },
    {
      name: 'refresh_kpi_gate',
      command: `npm run ops:kpi:gate -- --date ${outputDate}`,
      successCondition: `status is pass or fail after evaluatedBusinessDate=${text(gateTarget.businessDate || closureSummary.nextBusinessDayTarget || outputDate)}`,
    },
    nextRecoveryTarget
      ? {
          name: 'track_next_recovery_target',
          command: `npm run ops:kpi:gate -- --date ${nextRecoveryTarget.businessDate}`,
          successCondition: `evaluatedBusinessDate=${nextRecoveryTarget.businessDate} and status is pass or fail`,
        }
      : null,
    {
      name: 'verify_closure',
      command: `npm run ops:closure:verify -- --date ${outputDate}`,
      successCondition: 'ok=true with explicit deposit missing/suspicious details if still partial',
    },
    {
      name: 'effect_review_next_window',
      command: `npm run ops:agent:review-effect -- --queue data\\agent\\review_queue_${outputDate}.json --collect-evidence --today ${outputDate} --evidence-out data\\agent\\review_evidence_${outputDate}.json --out data\\agent\\effect_review_${outputDate}.json --profit-report data\\snapshots\\profit_review_${outputDate}.json`,
      successCondition: 'needsAction=0 or concrete rollback/secondary action candidates are produced',
    },
    selectionKpiEvidence.readyForDecisionSupport
      ? null
      : {
          name: 'refresh_selection_kpi_evidence',
          command: `npm run ops:selection:extended -- --preset "bsr-list new-releases flow-theme-tags store-feedback" --date-info ${outputDate.slice(0, 7)} --rank-page-size 20 --flow-theme-page-size 20 --feedback-page-size 20 --out data\\snapshots\\selection_kpi_evidence_${outputDate}.json`,
          successCondition: 'report ok=true, then rerun KPI checkpoint with --extended-selection-report data\\snapshots\\selection_kpi_evidence_' + `${outputDate}.json`,
        },
  ].filter(Boolean);

  return {
    date: outputDate,
    generatedAt,
    businessDate,
    dataDate: text(closureSummary.dataDate || closedLoop.dataDate || kpiGate.dataDate),
    status: text(closureSummary.dailyClosureStatus || depositStatus.status || 'unknown'),
    completion: {
      closedLoop: closureSummary.closedLoop === true || closedLoop.closedLoop === true,
      dailyClosureStatus: text(closureSummary.dailyClosureStatus),
      dailyComplete: closureSummary.dailyComplete === true,
      reasons: arrayOfText(closureSummary.dailyClosureReasons),
    },
    kpiGate: {
      status: gateStatus,
      targetBusinessDate: gateTargetBusinessDate,
      evaluatedBusinessDate: text(kpiGate.evaluatedBusinessDate || closureSummary.businessDate || closedLoop.businessDate),
      dataDate: text(kpiGate.dataDate || closureSummary.dataDate || closedLoop.dataDate),
      target: {
        sales: gateTarget.salesTarget ?? closureSummary.recoveryGateSalesTarget ?? null,
        units: gateTarget.unitsTarget ?? closureSummary.recoveryGateUnitsTarget ?? null,
        netProfitRateMin: gateTarget.netProfitRateMin ?? closureSummary.recoveryGateNetProfitRateMin ?? null,
        acosMax: gateTarget.acosMax ?? closureSummary.recoveryGateAcosMax ?? null,
        refundRateMax: gateTarget.refundRateMax ?? closureSummary.recoveryGateRefundRateMax ?? null,
        adCostShareMax: gateTarget.adCostShareMax ?? closureSummary.recoveryGateAdCostShareMax ?? null,
      },
      actual: {
        sales: gateActual.sales ?? null,
        units: gateActual.units ?? null,
        netProfitRate: gateActual.netProfitRate ?? null,
        acos: gateActual.acos ?? null,
        refundRate: gateActual.refundRate ?? null,
        adCostShare: gateActual.adCostShare ?? null,
        estimatedNetProfit: gateActual.estimatedNetProfit ?? null,
      },
      blockedUntil: text(kpiGate.status) === 'target_set_actual_pending'
        ? `${text(gateTarget.businessDate || closureSummary.nextBusinessDayTarget || 'target')} actual total-account sales core row is available`
        : '',
    },
    nextRecoveryTarget,
    deposit: {
      status: text(depositStatus.status || closureSummary.depositStatus || 'unknown'),
      missing,
      suspicious,
      archivedCandidates: num(depositStatus.archivedCandidates, 0),
      rawCandidateSearch,
      nextAction: missing.length
        ? (rawCandidateSearch.sameDateTotal > 0
            ? 'archive the same-date original raw files before marking the day complete'
            : 'restore or redownload the same-date original raw files; no same-date candidates were found')
        : 'raw archive is complete; continue KPI recovery and effect review',
    },
    actionPools: {
      lowEfficiency: {
        actionable: lowRawActionable,
        rawActionable: lowRawActionable,
        currentExecutable: lowCurrentExecutable,
        hold: num(lowTotals.hold, 0),
        skip: num(lowTotals.skip, 0),
        decision: lowCurrentExecutable > 0
          ? 'review current low-efficiency write plan before any live write'
          : (lowRawActionable > 0
              ? 'raw low-efficiency pool still has candidates, but current agent write chain has no eligible low-risk action; do not treat raw pool count as pending live writes'
              : 'no new low-efficiency live write justified'),
        evidence: lowRawActionable > 0 && lowCurrentExecutable === 0
          ? 'raw pool scanner does not deduct today landed writes or write-chain guardrails'
          : (lowCurrentExecutable > 0
              ? 'writeExecution eligibleActions confirms current executable low-efficiency actions'
              : 'no raw low-efficiency candidate remains'),
      },
      effectReview: {
        total: num(effectSummary.total, 0),
        continueWatch: num(effectSummary.byVerdict?.continue_watch, 0),
        needsAction: num(effectSummary.needsAction, 0),
        blocked: num(effectSummary.blocked, 0),
        decision: num(effectSummary.needsAction, 0) > 0
          ? 'review rollback or secondary action candidates'
          : 'continue watch until the next 3-day or 7-day review window',
      },
      writeExecution: {
        mode: text(writeExecution.mode || 'unknown'),
        eligibleActions: num(writeSummary.eligibleActions, 0),
        blockedActions: num(writeSummary.blockedActions, 0),
        executedStages: num(writeSummary.executedStages, 0),
        failedStages: num(writeSummary.failedStages, 0),
        decision: num(writeSummary.eligibleActions, 0) > 0
          ? 'review dry-run/write plan before live execution'
          : 'no low-risk write action is pending in the agent write chain',
      },
      recoveryDryRun,
      approvalReview,
    },
    landedEvidence: {
      landedActionSuccess: Math.max(num(closureSummary.landedActionSuccess, 0), landedFromAdjustments.success),
      landedActionManualReview: Math.max(num(closureSummary.landedActionManualReview, 0), landedFromAdjustments.manualReview),
      landedActionFailed: Math.max(num(closureSummary.landedActionFailed, 0), landedFromAdjustments.failed),
      feedbackApplied: num(closureSummary.feedbackApplied, 0),
    },
    selectionKpiEvidence,
    nextChecks,
    files,
  };
}

function money(value) {
  const n = num(value, null);
  if (n === null) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function integer(value) {
  const n = num(value, null);
  if (n === null) return '-';
  return Math.round(n).toLocaleString('en-US');
}

function pct(value) {
  const n = num(value, null);
  if (n === null) return '-';
  return `${(n * 100).toFixed(2)}%`;
}

function ppGap(actual, target, direction = 'min') {
  const a = num(actual, null);
  const t = num(target, null);
  if (a === null || t === null) return '-';
  const diff = direction === 'max' ? a - t : a - t;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${(diff * 100).toFixed(2)}pp`;
}

function valueGap(actual, target) {
  const a = num(actual, null);
  const t = num(target, null);
  if (a === null || t === null) return '-';
  const diff = a - t;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${money(diff)}`;
}

function intGap(actual, target) {
  const a = num(actual, null);
  const t = num(target, null);
  if (a === null || t === null) return '-';
  const diff = a - t;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${integer(diff)}`;
}

function staleCandidateLines(rawCandidateSearch = {}, missing = []) {
  const missingSet = new Set((Array.isArray(missing) ? missing : []).map(text).filter(Boolean));
  return Object.entries(rawCandidateSearch.byMissingClass || {})
    .filter(([name]) => !missingSet.size || missingSet.has(name))
    .map(([name, summary]) => {
      const latest = summary.latest || {};
      if (!latest.name) return `- ${name}: no candidate found.`;
      return `- ${name}: ${latest.name} from ${latest.candidateDate || 'unknown date'} (${latest.action || 'reference_only'}).`;
    });
}

function buildOperatorCheckpointMarkdown(checkpoint = {}) {
  const gate = checkpoint.kpiGate || {};
  const target = gate.target || {};
  const actual = gate.actual || {};
  const deposit = checkpoint.deposit || {};
  const pools = checkpoint.actionPools || {};
  const dryRun = pools.recoveryDryRun || {};
  const approvalReview = pools.approvalReview || {};
  const landed = checkpoint.landedEvidence || {};
  const next = checkpoint.nextRecoveryTarget || {};
  const rawSearch = deposit.rawCandidateSearch || {};
  const sample = Array.isArray(dryRun.sample) ? dryRun.sample.slice(0, 8) : [];
  const nextChecks = Array.isArray(checkpoint.nextChecks) ? checkpoint.nextChecks : [];
  const lines = [];

  lines.push(`# KPI recovery operator checkpoint - ${checkpoint.date || ''}`);
  lines.push('');
  lines.push(`- Generated at: ${checkpoint.generatedAt || ''}`);
  lines.push(`- Business date: ${checkpoint.businessDate || ''}`);
  lines.push(`- Data date: ${checkpoint.dataDate || ''}`);
  lines.push(`- Current status: ${checkpoint.status || 'unknown'}; closedLoop=${checkpoint.completion?.closedLoop === true ? 'true' : 'false'}; dailyComplete=${checkpoint.completion?.dailyComplete === true ? 'true' : 'false'}.`);
  lines.push('- Machine checkpoint: data/tasks/kpi_recovery_checkpoint_' + `${checkpoint.date || ''}.json`);
  lines.push('- Dashboard: data/reports/daily_dashboard_' + `${checkpoint.date || ''}.html`);
  lines.push('- Handoff: data/agent/agent_handoff_' + `${checkpoint.date || ''}.md`);
  lines.push('');
  lines.push('## KPI gate result');
  lines.push('');
  lines.push(`- Gate status: ${gate.status || 'unknown'}.`);
  lines.push(`- Target business date: ${gate.targetBusinessDate || ''}; evaluated business date: ${gate.evaluatedBusinessDate || ''}; data date: ${gate.dataDate || ''}.`);
  if (gate.status === 'target_set_actual_pending') {
    lines.push(`- Blocked until: ${gate.blockedUntil || 'target actual total-account row is available'}.`);
  }
  lines.push('');
  lines.push('| Metric | Target | Actual | Gap |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| Total sales | ${money(target.sales)} | ${money(actual.sales)} | ${valueGap(actual.sales, target.sales)} |`);
  lines.push(`| Units | ${integer(target.units)} | ${integer(actual.units)} | ${intGap(actual.units, target.units)} |`);
  lines.push(`| Net profit rate | >= ${pct(target.netProfitRateMin)} | ${pct(actual.netProfitRate)} | ${ppGap(actual.netProfitRate, target.netProfitRateMin, 'min')} |`);
  lines.push(`| ACOS | <= ${pct(target.acosMax)} | ${pct(actual.acos)} | ${ppGap(actual.acos, target.acosMax, 'max')} |`);
  lines.push(`| Refund rate | <= ${pct(target.refundRateMax)} | ${pct(actual.refundRate)} | ${ppGap(actual.refundRate, target.refundRateMax, 'max')} |`);
  lines.push(`| Ad cost share | <= ${pct(target.adCostShareMax)} | ${pct(actual.adCostShare)} | ${ppGap(actual.adCostShare, target.adCostShareMax, 'max')} |`);
  if (next?.businessDate) {
    lines.push('');
    lines.push(`Next recovery target for ${next.businessDate}: sales >= ${money(next.sales)}, units >= ${integer(next.units)}, net profit rate >= ${pct(next.netProfitRateMin)}, ACOS <= ${pct(next.acosMax)}, refund rate <= ${pct(next.refundRateMax)}, ad cost share <= ${pct(next.adCostShareMax)}.`);
  }
  lines.push('');
  lines.push('## Data deposit state');
  lines.push('');
  lines.push(`- Deposit status: ${deposit.status || 'unknown'}.`);
  lines.push(`- Missing original raw files: ${(deposit.missing || []).join(', ') || 'none'}.`);
  lines.push(`- Suspicious fallback inputs: ${(deposit.suspicious || []).join(', ') || 'none'}.`);
  lines.push(`- Raw candidate scan: total ${integer(rawSearch.total)}, same-date ${integer(rawSearch.sameDateTotal)}, stale ${integer(rawSearch.staleTotal)}.`);
  lines.push(...staleCandidateLines(rawSearch, deposit.missing || []));
  lines.push(`- Next action: ${deposit.nextAction || 'verify deposit status'}.`);
  lines.push('');
  lines.push('## Action pools');
  lines.push('');
  lines.push('| Pool | Current result | Operator decision |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Low efficiency | rawActionable ${integer(pools.lowEfficiency?.rawActionable ?? pools.lowEfficiency?.actionable)}; currentExecutable ${integer(pools.lowEfficiency?.currentExecutable)}; hold ${integer(pools.lowEfficiency?.hold)}; skip ${integer(pools.lowEfficiency?.skip)} | ${pools.lowEfficiency?.decision || ''} |`);
  lines.push(`| Effect review | total ${integer(pools.effectReview?.total)}; continue_watch ${integer(pools.effectReview?.continueWatch)}; needsAction ${integer(pools.effectReview?.needsAction)} | ${pools.effectReview?.decision || ''} |`);
  lines.push(`| Write execution | eligible ${integer(pools.writeExecution?.eligibleActions)}; blocked ${integer(pools.writeExecution?.blockedActions)}; executed stages ${integer(pools.writeExecution?.executedStages)} | ${pools.writeExecution?.decision || ''} |`);
  lines.push(`| KPI recovery dry-run | highEfficiencyBidUps ${integer(dryRun.highEfficiencyBidUps)}; SKUs ${integer(dryRun.skuCount)}; latest ${dryRun.latestRunId || 'none'} | ${dryRun.decision || ''}; not counted as landed actions |`);
  lines.push(`| KPI approval review | total ${integer(approvalReview.total)}; recommendApprove ${integer(approvalReview.recommendApprove)}; approvalNeeded ${integer(approvalReview.approvalNeeded)}; hold ${integer(approvalReview.hold)}; blocked ${integer(approvalReview.blocked)} | ${approvalReview.decision || ''} |`);
  lines.push('');
  lines.push('Current landed evidence:');
  lines.push('');
  lines.push(`- landedActionSuccess: ${integer(landed.landedActionSuccess)}`);
  lines.push(`- landedActionManualReview: ${integer(landed.landedActionManualReview)}`);
  lines.push(`- landedActionFailed: ${integer(landed.landedActionFailed)}`);
  lines.push(`- feedbackApplied: ${integer(landed.feedbackApplied)}`);
  lines.push('');
  lines.push('## Selection KPI evidence');
  lines.push('');
  const selectionKpi = checkpoint.selectionKpiEvidence || {};
  const coverage = selectionKpi.coverage || {};
  const storeList = selectionKpi.storeFeedback?.list || {};
  const flowMain = selectionKpi.flowTheme?.main || {};
  const category = selectionKpi.category || {};
  lines.push(`- Ready for KPI decision support: ${selectionKpi.readyForDecisionSupport === true ? 'true' : 'false'}; autoAction=false.`);
  lines.push(`- Daily rank coverage: ${(coverage.dailyRankLists || []).join(', ') || 'none'}; categoryAnalysis=${coverage.categoryAnalysis === true ? 'true' : 'false'}; flowThemeTags=${coverage.flowThemeTags === true ? 'true' : 'false'}; storeFeedback=${coverage.storeFeedback === true ? 'true' : 'false'}.`);
  lines.push(`- Category rows: ${integer(category.rowCount)}${category.category ? ` for ${category.category}` : ''}.`);
  lines.push(`- Flow theme rows: ${integer(flowMain.rowCount)}; total ${flowMain.total == null ? '-' : integer(flowMain.total)}.`);
  lines.push(`- Store feedback rows: ${integer(storeList.rowCount)}; total ${storeList.total == null ? '-' : integer(storeList.total)}.`);
  lines.push('- Boundary: selection evidence supports KPI diagnosis and guardrails; it does not authorize automatic writes.');
  if ((selectionKpi.nextChecks || []).length) {
    lines.push(`- Missing selection checks: ${selectionKpi.nextChecks.join('; ')}.`);
  }
  lines.push('');
  lines.push('## Recovery dry-run candidates');
  lines.push('');
  lines.push(`- Latest run: ${dryRun.latestRunId || 'none'}.`);
  lines.push(`- Latest run count: ${integer(dryRun.latestRunCount)}.`);
  lines.push(`- By decision: ${Object.entries(dryRun.byDecision || {}).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}.`);
  lines.push(`- By entity type: ${Object.entries(dryRun.byEntityType || {}).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}.`);
  lines.push('');
  lines.push('| SKU | Entity | Bid | Evidence |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of sample) {
    lines.push(`| ${item.sku || ''} | ${item.entityType || ''}: ${item.entityName || ''} | ${item.beforeValue ?? ''} -> ${item.afterValue ?? ''} | orders7=${item.orders7 ?? '-'}; ACOS7=${pct(item.acos7)}; invDays=${item.invDays ?? '-'} |`);
  }
  if (!sample.length) {
    lines.push('| - | - | - | No dry-run recovery candidates recorded. |');
  }
  lines.push('');
  lines.push('## KPI approval review');
  lines.push('');
  lines.push(`- Review pack: ${approvalReview.markdownName || approvalReview.markdownFile || 'none'}.`);
  lines.push(`- Summary: total ${integer(approvalReview.total)}; recommendApprove ${integer(approvalReview.recommendApprove)}; approvalNeeded ${integer(approvalReview.approvalNeeded)}; hold ${integer(approvalReview.hold)}; blocked ${integer(approvalReview.blocked)}.`);
  lines.push(`- Operator decision: ${approvalReview.decision || 'no approval review loaded'}.`);
  lines.push('');
  lines.push('## Next checks');
  lines.push('');
  for (const item of nextChecks) {
    lines.push(`- ${item.name}: \`${item.command}\` (${item.successCondition})`);
  }
  lines.push('');
  lines.push('## Current operator stance');
  lines.push('');
  if ((deposit.missing || []).length || (deposit.suspicious || []).length || deposit.status !== 'complete') {
    lines.push('- Keep the day data-deposit partial until raw gaps or suspicious fallback inputs are cleared.');
  } else if (gate.status === 'fail' || checkpoint.completion?.dailyComplete !== true) {
    lines.push('- Data deposit is complete; keep the operating day partial only because KPI recovery is still off track.');
  } else {
    lines.push('- Data deposit and KPI gate are complete; keep standard follow-up reviews on schedule.');
  }
  lines.push('- Treat KPI gate failure as a recovery signal, not permission for broad spend expansion.');
  lines.push('- Dry-run recovery rows are opportunity evidence only; live execution still needs a fresh gate and guardrail decision.');
  lines.push('- Prioritize controlled efficient-volume recovery while protecting refund rate, ACOS, and inventory days.');

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const date = get('--date') || get('--today') || dateOnly(new Date());
  const noOperatorMarkdown = args.includes('--no-operator-md');
  return {
    date,
    closureVerifyFile: get('--closure-verify') || path.join(ROOT, 'data', 'agent', `daily_closure_verify_${date}.json`),
    kpiGateFile: get('--kpi-gate') || path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${date}.json`),
    depositStatusFile: get('--deposit-status') || path.join(ROOT, '黄成喆个人数据趋势', '原数据', '原日数据', `${Number(date.slice(5, 7))}-${Number(date.slice(8, 10))}`, `daily_deposit_status_${date}.json`),
    lowEfficiencyFile: get('--low-efficiency') || path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${date}.json`),
    effectReviewFile: get('--effect-review') || path.join(ROOT, 'data', 'agent', `effect_review_${date}.json`),
    writeExecutionFile: get('--write-execution') || path.join(ROOT, 'data', 'agent', `write_execution_${date}.json`),
    kpiApprovalReviewFile: get('--kpi-approval-review') || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`),
    kpiApprovalReviewMarkdownFile: get('--kpi-approval-review-md') || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.md`),
    closedLoopFile: get('--closed-loop') || path.join(ROOT, 'data', 'agent', `agent_closed_loop_${date}.json`),
    adjustmentLogFile: get('--adjustments') || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`),
    extendedSelectionReportFile: get('--extended-selection-report') || get('--selection-report') || get('--selection-kpi-report') || '',
    outFile: get('--out') || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${date}.json`),
    operatorOutFile: noOperatorMarkdown
      ? ''
      : get('--operator-out') || path.join(ROOT, 'data', 'tasks', `kpi_recovery_operator_checkpoint_${date}.md`),
  };
}

function run(options = {}) {
  const checkpoint = buildCheckpoint({
    date: options.date,
    closureVerify: readJson(options.closureVerifyFile, {}),
    kpiGate: readJson(options.kpiGateFile, {}),
    depositStatus: readJson(options.depositStatusFile, {}),
    lowEfficiency: readJson(options.lowEfficiencyFile, {}),
    effectReview: readJson(options.effectReviewFile, {}),
    writeExecution: readJson(options.writeExecutionFile, {}),
    kpiApprovalReview: readJson(options.kpiApprovalReviewFile, {}),
    closedLoop: readJson(options.closedLoopFile, {}),
    adjustmentLog: readJson(options.adjustmentLogFile, []),
    selectionReports: {
      extendedSelection: options.extendedSelectionReportFile ? readJson(options.extendedSelectionReportFile, {}) : {},
    },
    files: {
      closureVerify: options.closureVerifyFile,
      kpiGate: options.kpiGateFile,
      depositStatus: options.depositStatusFile,
      lowEfficiency: options.lowEfficiencyFile,
      effectReview: options.effectReviewFile,
      writeExecution: options.writeExecutionFile,
      kpiApprovalReview: options.kpiApprovalReviewFile,
      kpiApprovalReviewMarkdown: options.kpiApprovalReviewMarkdownFile,
      closedLoop: options.closedLoopFile,
      adjustmentLog: options.adjustmentLogFile,
      extendedSelectionReport: options.extendedSelectionReportFile || '',
    },
  });
  writeJson(options.outFile, checkpoint);
  if (options.operatorOutFile) {
    writeText(options.operatorOutFile, buildOperatorCheckpointMarkdown(checkpoint));
  }
  return { ok: true, outFile: options.outFile, operatorOutFile: options.operatorOutFile || '', checkpoint };
}

function main() {
  const result = run(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
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
  buildCheckpoint,
  buildOperatorCheckpointMarkdown,
  parseArgs,
  run,
  summarizeRecoveryDryRuns,
};
