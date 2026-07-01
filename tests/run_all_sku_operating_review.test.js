const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  runAllSkuOperatingReview,
} = require('../scripts/run_all_sku_operating_review');

{
  const options = parseArgs([
    '--date', '2026-06-16',
    '--data-date', '2026-06-15',
    '--snapshot', 'data/snapshots/latest_snapshot.json',
    '--selection-reports', 'data/tasks/old_product_market_selection_reports_2026-06-16.json',
  ]);
  assert.strictEqual(options.businessDate, '2026-06-16');
  assert.strictEqual(options.dataDate, '2026-06-15');
  assert.strictEqual(options.selectionReportsFile, 'data/tasks/old_product_market_selection_reports_2026-06-16.json');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'all-sku-operating-review-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const selectionReportsFile = path.join(tmpDir, 'selection_reports.json');
  const outFile = path.join(tmpDir, 'review.json');
  const htmlFile = path.join(tmpDir, 'review.html');

  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{
      sku: 'OLD1',
      asin: 'B0OLD00001',
      opendate: '2025-01-01',
      unitsSold_7d: 3,
      unitsSold_30d: 10,
      yoyUnitsPct: -0.5,
      profitRate: 0.2,
      invDays: 90,
      fulFillable: 100,
      createContext: { keywordSeeds: ['retirement gifts for women'] },
      adStats: {
        '7d': { spend: 3, sales: 30, orders: 2, clicks: 20, impressions: 1000 },
        '30d': { spend: 15, sales: 150, orders: 10, clicks: 120, impressions: 5000 },
      },
    }],
  }), 'utf8');

  fs.writeFileSync(selectionReportsFile, JSON.stringify({
    keywordResearch: {
      ok: true,
      source: 'selection_keyword_research',
      directCompetitorAsins: [{ searchTerm: 'retirement gifts for women', asin: 'B000000001' }],
    },
    keywordConversion: {
      ok: true,
      source: 'selection_keyword_conversion_rate',
      rows: [{ keyword: 'retirement gifts for women', marketQuality: 'usable_niche', costRisk: 'low' }],
    },
    abaSearchTerms: {
      ok: true,
      source: 'selection_aba_search_terms',
      rows: [{
        searchTerm: 'retirement gifts for women',
        demandTier: 'medium',
        competitionTier: 'medium',
        rank: 50000,
        aoValue: 0.1,
        totalClickShare: 0.2,
        productCount: 800,
      }],
    },
    keywordSeasonality: {
      ok: true,
      source: 'selection_keyword_seasonality',
      rows: [{ searchTerm: 'retirement gifts for women', seasonalityType: 'steady', quarterRatio: 1.1 }],
    },
    productTimeMachine: {
      ok: true,
      source: 'selection_product_time_machine',
      rows: [{
        searchKeyword: 'retirement gifts for women',
        asin: 'B000000001',
        demandTier: 'medium',
        trafficMix: 'organic_led',
        boughtInPastMonthLowerBound: 100,
      }],
    },
  }), 'utf8');

  const result = runAllSkuOperatingReview({
    businessDate: '2026-06-16',
    dataDate: '2026-06-15',
    snapshotFile,
    selectionReportsFile,
    outFile,
    htmlFile,
  });

  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(htmlFile));
  assert.strictEqual(result.review.summary.totalSkus, 1);
  assert.strictEqual(result.review.summary.marketAnalysis.readyForDecisionSupport, 1);
  assert.strictEqual(result.review.rows[0].marketAnalysis.status, 'market_evidence_ready');
  assert.ok(result.review.rows[0].marketAnalysis.sources.includes('selection_keyword_research'));
  assert.ok(result.review.rows[0].marketAnalysis.sources.includes('selection_product_time_machine'));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')).selectionReportsFile, selectionReportsFile);
}

console.log('run_all_sku_operating_review.test.js passed');
