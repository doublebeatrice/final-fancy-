const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDailyOperatingWorkflow } = require('../src/agent_daily_workflow');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-daily-workflow-ready-'));
  const allSkuReviewFile = path.join(tmpDir, 'all_sku_operating_review_2026-05-25.json');
  const seasonTitleDryRunFile = path.join(tmpDir, 'season_title_dry_run_2026-05-25.json');
  const seasonGapAuditFile = path.join(tmpDir, 'season_gap_audit_2026-05-25_latest.json');
  const seasonTitleListingQueueFile = path.join(tmpDir, 'season_title_listing_queue_2026-05-25.json');

  writeJson(allSkuReviewFile, {
    summary: {
      totalSkus: 1284,
      mustReview: 285,
      marketAnalysis: { requiredMissing: 1290 },
    },
    rows: [{ sku: 'SKU1' }],
  });
  writeJson(seasonTitleDryRunFile, {
    summary: {
      items: 84,
      autoAdCandidates: 18,
    },
    items: [{ sku: 'SKU1' }],
  });
  writeJson(seasonGapAuditFile, {
    summary: {
      activeSeasonTasks: 94,
      riskItems: 23,
    },
  });
  writeJson(seasonTitleListingQueueFile, {
    skus: ['SKU1', 'SKU2'],
  });

  const workflow = buildDailyOperatingWorkflow({
    businessDate: '2026-05-25',
    required: true,
    allSkuReviewFile,
    seasonTitleDryRunFile,
    seasonGapAuditFile,
    seasonTitleListingQueueFile,
    effectReviewCoverage: {
      dueReviews: 2,
      effectReviewTotal: 2,
      feedbackApplied: 2,
    },
  });

  assert.strictEqual(workflow.status, 'ready');
  assert.deepStrictEqual(workflow.blockers, []);
  assert.strictEqual(workflow.allSku.totalSkus, 1284);
  assert.strictEqual(workflow.season.dryRunItems, 84);
  assert.strictEqual(workflow.season.activeSeasonTasks, 94);
  assert.strictEqual(workflow.effectReview.status, 'ready');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-daily-workflow-missing-'));
  const workflow = buildDailyOperatingWorkflow({
    businessDate: '2026-05-25',
    required: true,
    allSkuReviewFile: path.join(tmpDir, 'all_sku_operating_review_2026-05-25.json'),
    seasonTitleDryRunFile: path.join(tmpDir, 'season_title_dry_run_2026-05-25.json'),
    seasonGapAuditFile: path.join(tmpDir, 'season_gap_audit_2026-05-25_latest.json'),
    seasonTitleListingQueueFile: path.join(tmpDir, 'season_title_listing_queue_2026-05-25.json'),
    effectReviewCoverage: {
      dueReviews: 3,
      effectReviewTotal: 2,
      feedbackApplied: 1,
    },
  });

  assert.strictEqual(workflow.status, 'needs_recovery');
  assert.ok(workflow.blockers.includes('all_sku_review_missing'));
  assert.ok(workflow.blockers.includes('season_title_dry_run_missing'));
  assert.ok(workflow.blockers.includes('season_gap_audit_missing'));
  assert.ok(workflow.blockers.includes('season_action_path_missing'));
  assert.ok(workflow.blockers.includes('effect_review_coverage_missing'));
  assert.ok(workflow.blockers.includes('effect_review_feedback_missing'));
}

console.log('agent_daily_workflow tests passed');
