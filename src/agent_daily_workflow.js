const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function readJsonIfExists(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function fileExists(file) {
  return !!(file && fs.existsSync(file));
}

function defaultTaskFile(prefix, date, suffix = '.json') {
  return path.join(ROOT, 'data', 'tasks', `${prefix}_${date}${suffix}`);
}

function defaultSnapshotFile(prefix, date, suffix = '.json') {
  return path.join(ROOT, 'data', 'snapshots', `${prefix}_${date}${suffix}`);
}

function countRows(report = {}) {
  if (Array.isArray(report.rows)) return report.rows.length;
  if (Array.isArray(report.items)) return report.items.length;
  if (Array.isArray(report.actions)) return report.actions.length;
  if (Array.isArray(report.skus)) return report.skus.length;
  return 0;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSeasonGapAuditFile(date = '', explicitFile = '') {
  if (explicitFile) return explicitFile;
  const latest = defaultTaskFile('season_gap_audit', `${date}_latest`);
  if (fileExists(latest)) return latest;
  return defaultTaskFile('season_gap_audit', date);
}

function buildAllSkuGate({ date = '', allSkuReview = {}, allSkuReviewFile = '' } = {}) {
  const file = allSkuReviewFile || defaultTaskFile('all_sku_operating_review', date);
  const report = Object.keys(allSkuReview || {}).length ? allSkuReview : readJsonIfExists(file, {});
  const summary = report.summary || {};
  const totalSkus = number(summary.totalSkus || countRows(report));
  const mustReview = number(summary.mustReview);
  const status = totalSkus > 0 ? 'ready' : (fileExists(file) ? 'empty' : 'missing');
  const blockers = [];
  if (status === 'missing') blockers.push('all_sku_review_missing');
  if (status === 'empty') blockers.push('all_sku_review_empty');
  return {
    status,
    file,
    totalSkus,
    mustReview,
    oldProductYoyDown: number(summary.oldProductYoyDown),
    newLaunchRepair: number(summary.newLaunchRepair),
    stopLoss: number(summary.stopLoss),
    marketMissing: number(summary.marketAnalysis?.requiredMissing),
    blockers,
  };
}

function buildSeasonGate({
  date = '',
  seasonTitleDryRunFile = '',
  seasonGapAuditFile = '',
  seasonTitleListingQueueFile = '',
  seasonActionSchemaFile = '',
  seasonListingApplicationsFile = '',
} = {}) {
  const dryRunFile = seasonTitleDryRunFile || defaultTaskFile('season_title_dry_run', date);
  const gapAuditFile = resolveSeasonGapAuditFile(date, seasonGapAuditFile);
  const listingQueueFile = seasonTitleListingQueueFile || defaultTaskFile('season_title_listing_queue', date);
  const actionSchemaFile = seasonActionSchemaFile || defaultSnapshotFile('action_schema', `${date}_season_title_ads`);
  const listingApplicationsFile = seasonListingApplicationsFile || defaultSnapshotFile('season_title_listing_applications', date);

  const dryRun = readJsonIfExists(dryRunFile, {});
  const gapAudit = readJsonIfExists(gapAuditFile, {});
  const listingQueue = readJsonIfExists(listingQueueFile, {});
  const actionSchema = readJsonIfExists(actionSchemaFile, {});
  const listingApplications = readJsonIfExists(listingApplicationsFile, {});

  const dryRunItems = number(dryRun.summary?.items || countRows(dryRun));
  const autoAdCandidates = number(dryRun.summary?.autoAdCandidates);
  const activeSeasonTasks = number(gapAudit.summary?.activeSeasonTasks);
  const riskItems = number(gapAudit.summary?.riskItems);
  const listingQueueSkus = Array.isArray(listingQueue.skus)
    ? listingQueue.skus.length
    : number(listingQueue.summary?.skus || countRows(listingQueue));
  const actionRows = countRows(actionSchema);
  const listingApplicationRows = countRows(listingApplications);

  const hasDryRun = fileExists(dryRunFile);
  const hasGapAudit = fileExists(gapAuditFile);
  const hasListingQueue = fileExists(listingQueueFile);
  const hasActionSchema = fileExists(actionSchemaFile);
  const hasListingApplications = fileExists(listingApplicationsFile);

  let status = 'ready';
  const blockers = [];
  if (!hasDryRun) {
    status = 'missing';
    blockers.push('season_title_dry_run_missing');
  }
  if (!hasGapAudit) {
    status = status === 'missing' ? 'missing' : 'partial';
    blockers.push('season_gap_audit_missing');
  }
  if (!hasListingQueue && !hasActionSchema && !hasListingApplications) {
    status = status === 'missing' ? 'missing' : 'partial';
    blockers.push('season_action_path_missing');
  }
  if (hasDryRun && dryRunItems <= 0 && activeSeasonTasks <= 0) {
    status = status === 'ready' ? 'empty' : status;
    blockers.push('season_line_empty');
  }

  return {
    status,
    files: {
      dryRunFile,
      gapAuditFile,
      listingQueueFile,
      actionSchemaFile,
      listingApplicationsFile,
    },
    dryRunItems,
    autoAdCandidates,
    activeSeasonTasks,
    riskItems,
    listingQueueSkus,
    actionRows,
    listingApplicationRows,
    blockers,
  };
}

function buildEffectReviewGate(effectReviewCoverage = {}) {
  const dueReviews = number(effectReviewCoverage.dueReviews);
  const effectReviewTotal = number(effectReviewCoverage.effectReviewTotal);
  const feedbackApplied = number(effectReviewCoverage.feedbackApplied);
  const status = dueReviews <= 0 || (effectReviewTotal >= dueReviews && feedbackApplied >= dueReviews)
    ? 'ready'
    : 'partial';
  const blockers = [];
  if (dueReviews > 0 && effectReviewTotal < dueReviews) blockers.push('effect_review_coverage_missing');
  if (dueReviews > 0 && feedbackApplied < dueReviews) blockers.push('effect_review_feedback_missing');
  return {
    status,
    dueReviews,
    effectReviewTotal,
    feedbackApplied,
    needsAction: number(effectReviewCoverage.needsAction),
    blocked: number(effectReviewCoverage.blocked),
    continueWatch: number(effectReviewCoverage.continueWatch),
    closeRecommended: number(effectReviewCoverage.closeRecommended),
    blockers,
  };
}

function buildDailyOperatingWorkflow(options = {}) {
  const date = dateOnly(options.businessDate || options.date || new Date()) || new Date().toISOString().slice(0, 10);
  const required = options.required === true;
  const allSku = buildAllSkuGate({ ...options, date });
  const season = buildSeasonGate({ ...options, date });
  const effectReview = buildEffectReviewGate(options.effectReviewCoverage || {});
  const blockers = [
    ...allSku.blockers,
    ...season.blockers,
    ...effectReview.blockers,
  ];
  const hasAnyArtifact = (
    allSku.status !== 'missing' ||
    season.status !== 'missing' ||
    effectReview.dueReviews > 0
  );
  let status = 'not_required';
  if (required || hasAnyArtifact) {
    status = blockers.length ? 'needs_recovery' : 'ready';
  }
  return {
    date,
    required,
    status,
    blockers: [...new Set(blockers)],
    allSku,
    season,
    effectReview,
  };
}

module.exports = {
  buildDailyOperatingWorkflow,
  buildAllSkuGate,
  buildSeasonGate,
  buildEffectReviewGate,
  dateOnly,
};
