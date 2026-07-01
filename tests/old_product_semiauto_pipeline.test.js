const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('../scripts/run_old_product_semiauto_pipeline');
const { runOldProductSemiautoPipeline } = require('../src/old_product_semiauto_pipeline');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeSelectionEvidence(root, date, sku, term) {
  const dir = path.join(root, date);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, `${sku}_selection_keyword_research.json`), {
    ok: true,
    source: 'selection_keyword_research',
    directCompetitorAsins: [{ searchTerm: term, asin: 'B0COMP0001' }],
  });
  writeJson(path.join(dir, `${sku}_selection_keyword_conversion_rate.json`), {
    ok: true,
    source: 'selection_keyword_conversion_rate',
    rows: [{ keyword: term, marketQuality: 'usable_niche', costRisk: 'low' }],
  });
  writeJson(path.join(dir, `${sku}_selection_aba_search_terms.json`), {
    ok: true,
    source: 'selection_aba_search_terms',
    rows: [{
      searchTerm: term,
      demandTier: 'medium',
      competitionTier: 'medium',
      rank: 50000,
      aoValue: 0.1,
      totalClickShare: 0.2,
    }],
  });
  writeJson(path.join(dir, `${sku}_selection_keyword_seasonality.json`), {
    ok: true,
    source: 'selection_keyword_seasonality',
    rows: [{ searchTerm: term, seasonalityType: 'steady', quarterRatio: 1.1 }],
  });
  writeJson(path.join(dir, `${sku}_selection_product_time_machine.json`), {
    ok: true,
    source: 'selection_product_time_machine',
    rows: [{
      searchKeyword: term,
      asin: 'B0COMP0001',
      demandTier: 'medium',
      trafficMix: 'organic_led',
      boughtInPastMonthLowerBound: 100,
    }],
  });
}

{
  const options = parseArgs([
    '--date', '2026-06-16',
    '--data-date', '2026-06-15',
    '--snapshot', 'data/snapshots/latest_snapshot.json',
    '--deposit-status', 'data/tasks/daily_deposit_status_2026-06-16.json',
    '--max-market-items', '3',
    '--run-market-evidence',
  ]);
  assert.strictEqual(options.businessDate, '2026-06-16');
  assert.strictEqual(options.dataDate, '2026-06-15');
  assert.strictEqual(options.maxMarketItems, 3);
  assert.strictEqual(options.runMarketEvidence, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-semiauto-pipeline-'));
  const snapshotFile = path.join(tmpDir, 'latest_snapshot.json');
  const depositStatusFile = path.join(tmpDir, 'daily_deposit_status_2026-06-16.json');
  const taskDir = path.join(tmpDir, 'tasks');
  const snapshotDir = path.join(tmpDir, 'snapshots');
  const evidenceRoot = path.join(tmpDir, 'market_evidence');

  writeJson(snapshotFile, {
    productCards: [{
      sku: 'OLD1',
      asin: 'B0OLD00001',
      opendate: '2024-01-01',
      fulFillable: 100,
      invDays: 90,
      unitsSold_7d: 2,
      unitsSold_30d: 10,
      yoyUnitsPct: -0.5,
      profitRate: 0.2,
      createContext: { keywordSeeds: ['shared niche gift'] },
      adStats: {
        '7d': { spend: 3, sales: 30, orders: 1, clicks: 20, impressions: 1000 },
        '30d': { spend: 15, sales: 150, orders: 5, clicks: 120, impressions: 5000 },
      },
    }, {
      sku: 'OLD2',
      asin: 'B0OLD00002',
      opendate: '2024-01-01',
      fulFillable: 100,
      invDays: 90,
      unitsSold_7d: 2,
      unitsSold_30d: 10,
      yoyUnitsPct: -0.5,
      profitRate: 0.2,
      createContext: { keywordSeeds: ['shared niche gift'] },
      adStats: {
        '7d': { spend: 3, sales: 30, orders: 1, clicks: 20, impressions: 1000 },
        '30d': { spend: 15, sales: 150, orders: 5, clicks: 120, impressions: 5000 },
      },
    }],
  });
  writeJson(depositStatusFile, { status: 'complete', missing: [], suspicious: [], rawRecoveryOpen: 0 });
  writeSelectionEvidence(evidenceRoot, '2026-06-16', 'OLD1', 'shared niche gift');

  const result = runOldProductSemiautoPipeline({
    businessDate: '2026-06-16',
    dataDate: '2026-06-15',
    snapshotFile,
    depositStatusFile,
    taskDir,
    snapshotDir,
    marketEvidenceOutputRoot: evidenceRoot,
    maxMarketItems: 1,
    runMarketEvidence: false,
  });

  assert.strictEqual(result.manifest.summary.status, 'semi_auto_operator_review');
  assert.strictEqual(result.manifest.summary.marketEvidenceExecuted, false);
  assert.strictEqual(result.manifest.summary.approvedActionRows, 0);
  assert.ok(fs.existsSync(result.files.manifestFile));
  assert.ok(fs.existsSync(result.files.depositStatusMirrorJson));
  assert.ok(fs.existsSync(result.files.finalOldProductMaintenanceJson));
  assert.ok(fs.existsSync(result.files.finalAllSkuReviewJson));
  assert.ok(fs.existsSync(result.files.finalCandidateConfirmationJson));
  assert.ok(fs.existsSync(result.files.operatorApprovalTemplateJson));
  assert.ok(fs.existsSync(result.files.operatorApprovalTemplateMarkdown));
  assert.strictEqual(result.manifest.summary.operatorApprovalNeededActions, 0);
  assert.ok(result.manifest.nextAfterOperatorApproval.command.includes('--approval'));
  assert.ok(result.manifest.nextAfterOperatorApproval.command.includes(result.files.depositStatusMirrorJson));
  assert.ok(result.manifest.nextAfterOperatorApproval.command.includes(result.files.operatorApprovalTemplateJson));

  const manifestMarkdown = fs.readFileSync(result.files.markdownFile, 'utf8');
  assert.ok(manifestMarkdown.includes('## After Operator Approval'));
  assert.ok(manifestMarkdown.includes('--approval'));
  assert.ok(manifestMarkdown.includes(result.files.operatorApprovalTemplateJson));

  const finalReview = JSON.parse(fs.readFileSync(result.files.finalAllSkuReviewJson, 'utf8'));
  const old1 = finalReview.rows.find(row => row.sku === 'OLD1');
  const old2 = finalReview.rows.find(row => row.sku === 'OLD2');
  assert.strictEqual(old1.marketAnalysis.status, 'market_evidence_ready');
  assert.notStrictEqual(old2.marketAnalysis.status, 'market_evidence_ready');
  assert.strictEqual(finalReview.summary.marketAnalysis.readyForDecisionSupport, 1);

  const approvedSchema = JSON.parse(fs.readFileSync(result.files.finalApprovedActionsJson, 'utf8'));
  assert.deepStrictEqual(approvedSchema, []);
  const approvalTemplate = JSON.parse(fs.readFileSync(result.files.operatorApprovalTemplateJson, 'utf8'));
  assert.deepStrictEqual(approvalTemplate.approvedCandidates, []);
}

console.log('old_product_semiauto_pipeline.test.js passed');
