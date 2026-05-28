const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildOpportunityModels,
  buildSelectionOperatingIntelligence,
  capabilitySummary,
  deriveTerms,
  evidenceRowsFromSelectionReports,
  termKey,
} = require('../src/selection_operating_intelligence');
const {
  buildSelectionOperatingIntelligenceCapability,
  runSelectionOperatingIntelligenceCapability,
  sampleSelectionOperatingIntelligenceInput,
} = require('../src/selection_operating_intelligence_capability');

assert.strictEqual(termKey(' "American+Flag  Bucket Hat" '), 'american flag bucket hat');

const evidenceRows = [{
  term: 'american flag bucket hat',
  keywordResearch: {
    directCompetitors: 2,
    sceneCompetitors: 1,
    trafficBridgeCompetitors: 0,
    readyForDecisionSupport: true,
  },
  abaSearchTerm: {
    rank: 82000,
    searchVolume: 36000,
    aoValue: 0.12,
    brandMonopoly: 0.34,
    totalClickShare: 0.42,
    productCount: 860,
    newProductShare: 0.22,
    newProductSalesShare: 0.19,
    avgPrice: 32.5,
    avgRating: 3.5,
    avgReviewCount: 900,
    aPlusRate: 0.2,
    videoRate: 0.18,
    fbmShare: 0.43,
    keywordType: 'rising',
  },
  keywordSeasonality: {
    seasonalityType: 'strong_seasonal',
    peakQuarter: 'q2',
    quarterRatio: 2.4,
    googleTrend: { direction: 'rising' },
  },
  keywordConversion: {
    marketQuality: 'usable_niche',
    costRisk: 'medium',
  },
  productTimeMachine: [{
    asin: 'B0HAT00001',
    searchKeyword: 'american flag bucket hat',
    demandTier: 'high',
    trafficMix: 'ad_augmented',
    boughtInPastMonthLowerBound: 2000,
    price: 33,
    reviewCount: 1200,
    aoVal: 1.2,
    trafficTerms: { total: 220, natural: 90, sp: 60, brand: 10, video: 60 },
  }],
}];

const models = buildOpportunityModels(evidenceRows, {
  productProfile: { productType: 'hat', positioning: 'american flag bucket hat' },
});
assert.ok(models.some(model => model.key === 'front_competitor_validated'));
assert.ok(models.some(model => model.key === 'low_monopoly_market'));
assert.ok(models.some(model => model.key === 'new_product_survival'));
assert.ok(models.some(model => model.key === 'seasonal_window'));
assert.ok(models.some(model => model.key === 'trend_or_new_market'));
assert.ok(models.some(model => model.key === 'price_room'));
assert.ok(models.some(model => model.key === 'listing_quality_gap'));
assert.ok(models.some(model => model.key === 'review_upgrade_opportunity'));
assert.ok(models.some(model => model.key === 'seller_type_opening'));
assert.ok(models.some(model => model.key === 'long_tail_precision'));
assert.ok(models.some(model => model.key === 'competitor_traffic_map'));
assert.ok(models.some(model => model.key === 'conversion_economics_usable'));

const intelligence = buildSelectionOperatingIntelligence({
  evidenceRows,
  productProfile: { productType: 'hat' },
});
assert.strictEqual(intelligence.readyForDecisionSupport, true);
assert.strictEqual(intelligence.readyForAutoAction, false);
assert.strictEqual(intelligence.decisionQuality, 'full_market_profile');
assert.strictEqual(intelligence.recommendedOperatingUse, 'product_or_listing_repair_first');
assert.strictEqual(intelligence.sourceCoverage.keywordResearch, 1);
assert.strictEqual(intelligence.sourceCoverage.productTimeMachine, 1);
assert.ok(intelligence.productTimeMachine.byTrafficMix.ad_augmented >= 1);
assert.ok(intelligence.riskSignals.includes('competitor_ad_pressure_high'));
assert.ok(intelligence.riskSignals.includes('listing_quality_gap_path'));
assert.ok(intelligence.riskSignals.includes('market_window_sensitive'));
assert.deepStrictEqual(intelligence.missingEvidence, []);

const partial = buildSelectionOperatingIntelligence({
  evidenceRows: [{ term: 'small elephant figurines' }],
});
assert.strictEqual(partial.readyForDecisionSupport, false);
assert.strictEqual(partial.decisionQuality, 'research_needed');
assert.ok(partial.missingEvidence.includes('selection_keyword_research'));

const sampleInput = sampleSelectionOperatingIntelligenceInput();
const normalizedRows = evidenceRowsFromSelectionReports({
  terms: ['american flag bucket hat'],
  selectionReports: sampleInput.selectionReports,
});
assert.strictEqual(normalizedRows.length, 1);
assert.strictEqual(deriveTerms({
  selectionReports: sampleInput.selectionReports,
}).length, 1);

const capabilityReport = buildSelectionOperatingIntelligenceCapability({ sample: true });
assert.strictEqual(capabilityReport.capabilityId, 'selection::market_evidence::operating-intelligence::read');
assert.strictEqual(capabilityReport.readyForDecisionSupport, true);
assert.strictEqual(capabilityReport.analysis.decisionAnalysis.recommendedOperatingUse, 'product_or_listing_repair_first');
assert.ok(capabilityReport.analysis.sourceLayerAnalysis.some(layer => layer.key === 'extendedSelection' && layer.status === 'present'));
assert.ok(capabilityReport.capabilitySummary.topOpportunityModels.length > 0);
assert.ok(capabilitySummary(capabilityReport.operatingIntelligence, { terms: ['american flag bucket hat'] }).capabilityId);
assert.strictEqual(capabilityReport.analysis.nextValidationCommands.length, 0);

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selection-operating-intelligence-'));
  const outFile = path.join(tmpDir, 'report.json');
  const result = runSelectionOperatingIntelligenceCapability({
    sample: true,
    outFile,
  });
  assert.strictEqual(result.report.capabilityId, 'selection::market_evidence::operating-intelligence::read');
  assert.strictEqual(result.report.operatingIntelligence.readyForDecisionSupport, true);
  assert.ok(fs.existsSync(outFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.capabilityId, 'selection::market_evidence::operating-intelligence::read');
  assert.strictEqual(persisted.analysis.nextValidationCommands.length, 0);
  assert.ok(persisted.analysis.functionBehavior.length > 0);
}

console.log('selection_operating_intelligence.test.js passed');
