const assert = require('assert');
const { buildAllSkuOperatingReview, buildNodePlan, lifecycleFor, yoyFor } = require('../src/sku_operating_review');

{
  const lifecycle = lifecycleFor({ sku: 'NEW1', opendate: '2026-05-01' }, '2026-05-20');
  assert.strictEqual(lifecycle.key, 'new_product');
  assert.strictEqual(lifecycle.label, '新品');
  assert.strictEqual(lifecycle.ageDays, 19);
}

{
  const lifecycle = lifecycleFor({ sku: 'OLD1', opendate: '2024-05-01', unitsSold_30d: 12 }, '2026-05-20');
  assert.strictEqual(lifecycle.key, 'old_product');
  assert.strictEqual(lifecycle.label, '老品');
}

{
  const yoy = yoyFor({ yoyUnitsPct: -0.321, yoySourceField: 'year_over_year_asin_rate' });
  assert.strictEqual(yoy.value, -0.321);
  assert.strictEqual(yoy.source, 'year_over_year_asin_rate');
}

{
  const lifecycle = lifecycleFor({ sku: 'DAD1', opendate: '2024-05-01' }, '2026-05-20');
  const nodePlan = buildNodePlan({
    sku: 'DAD1',
    opendate: '2024-05-01',
    productProfile: {
      productType: 'keychain',
      targetAudience: ['dad'],
      occasion: ['fathers day'],
      seasonality: ['Q2'],
      positioning: 'fathers day dad keychain',
    },
  }, lifecycle, { clicks: 4, orders: 0, acos: 0, spend: 1 }, '2026-05-20');
  assert.strictEqual(nodePlan.seasonKey, 'fathers_day');
  assert.strictEqual(nodePlan.phase, 'preheat');
  assert.strictEqual(nodePlan.target.weeklyClicks, 20);
  assert.strictEqual(nodePlan.targetGap.weeklyClicksGap, 16);
  assert.strictEqual(nodePlan.problemFocus, 'traffic_problem');
}

{
  const review = buildAllSkuOperatingReview({
    timeContext: { businessDate: '2026-05-20', dataDate: '2026-05-19' },
    selectionReports: {
      keywordConversion: {
        rows: [{
          keyword: 'fathers day dad keychain',
          marketQuality: 'usable_niche',
          costRisk: 'medium',
          recommendedUse: 'low_bid_test_or_cross_check',
        }],
      },
      abaSearchTerms: {
        rows: [{
          searchTerm: 'fathers day dad keychain',
          demandTier: 'medium',
          competitionTier: 'medium',
          recommendedUse: 'candidate_market_validation',
        }],
        queryRows: {
          'elephant charm': {
            searchTerm: 'elephant charm',
            demandTier: 'query_returned',
            competitionTier: 'unknown',
            recommendedUse: 'cross_check_with_returned_terms',
            returnedRows: 3,
          },
        },
      },
    },
    snapshot: {
      productCards: [
        {
          sku: 'DAD1',
          asin: 'B0DAD00001',
          opendate: '2024-05-01',
          fulFillable: 120,
          invDays: 90,
          unitsSold_3d: 0,
          unitsSold_7d: 1,
          unitsSold_30d: 10,
          profitRate: 0.2,
          productProfile: {
            productType: 'keychain',
            targetAudience: ['dad'],
            occasion: ['fathers day'],
            seasonality: ['Q2'],
            positioning: 'fathers day dad keychain',
          },
          adStats: { '7d': { impressions: 120, clicks: 4, spend: 1, orders: 0 }, '30d': { impressions: 300, clicks: 10, spend: 3, orders: 1, sales: 25 } },
        },
        {
          sku: 'NEW1',
          asin: 'B0NEW00001',
          opendate: '2026-05-01',
          fulFillable: 120,
          invDays: 120,
          unitsSold_3d: 0,
          unitsSold_7d: 0,
          unitsSold_30d: 0,
          profitRate: 0.22,
          createContext: {
            keywordSeeds: ['elephant charm', 'small elephant figurines'],
          },
          adStats: { '7d': { impressions: 10, clicks: 0, spend: 0, orders: 0 }, '30d': { impressions: 50, clicks: 2, spend: 0, orders: 0 } },
        },
        {
          sku: 'OLD1',
          asin: 'B0OLD00001',
          opendate: '2024-05-01',
          fulFillable: 200,
          invDays: 80,
          unitsSold_3d: 1,
          unitsSold_7d: 3,
          unitsSold_30d: 40,
          profitRate: 0.18,
          yoyUnitsPct: -0.35,
          solrTerm: '134',
          productProfile: {
            productType: 'unknown',
            targetAudience: ['women'],
            occasion: ['fiesta'],
            positioning: 'women fiesta unknown',
            visualTheme: ['134', 'fiesta'],
          },
          adStats: { '7d': { impressions: 200, clicks: 8, spend: 6, orders: 1, sales: 40 }, '30d': { impressions: 1200, clicks: 50, spend: 30, orders: 8, sales: 260 } },
        },
        {
          sku: 'WASTE1',
          asin: 'B0WASTE001',
          opendate: '2023-05-01',
          fulFillable: 70,
          invDays: 60,
          unitsSold_7d: 0,
          unitsSold_30d: 2,
          profitRate: 0.05,
          adStats: { '7d': { impressions: 900, clicks: 30, spend: 12, orders: 0 }, '30d': { impressions: 3000, clicks: 80, spend: 40, orders: 0 } },
        },
      ],
    },
  });

  assert.strictEqual(review.summary.totalSkus, 4);
  assert.strictEqual(review.summary.newLaunchRepair, 1);
  assert.strictEqual(review.summary.oldProductYoyDown, 1);
  assert.strictEqual(review.summary.stopLoss, 1);
  assert.strictEqual(review.summary.nodeTrafficGap, 1);
  assert.strictEqual(review.rows.find(row => row.sku === 'DAD1').verdict, 'node_traffic_gap');
  assert.strictEqual(review.rows.find(row => row.sku === 'DAD1').nodePlan.target.weeklyClicks, 20);
  assert.strictEqual(review.rows.find(row => row.sku === 'NEW1').verdict, 'launch_repair');
  assert.strictEqual(review.rows.find(row => row.sku === 'OLD1').verdict, 'old_product_recovery_check');
  assert.strictEqual(review.rows.find(row => row.sku === 'WASTE1').verdict, 'stop_loss');

  assert.strictEqual(review.summary.marketAnalysis.totalSkus, 4);
  assert.strictEqual(review.summary.marketAnalysis.requiredSkus, 4);
  assert.strictEqual(review.summary.marketAnalysis.readyForDecisionSupport, 2);
  assert.strictEqual(review.summary.marketAnalysis.requiredMissing, 2);
  assert.ok(review.rows.every(row => row.marketAnalysis && row.marketAnalysis.status));

  const dadMarket = review.rows.find(row => row.sku === 'DAD1').marketAnalysis;
  assert.strictEqual(dadMarket.required, true);
  assert.strictEqual(dadMarket.status, 'market_evidence_ready');
  assert.ok(dadMarket.terms.includes('fathers day dad keychain'));
  assert.strictEqual(dadMarket.coverage.keywordConversionMatched, 1);
  assert.strictEqual(dadMarket.coverage.abaMatched, 1);

  const oldMarket = review.rows.find(row => row.sku === 'OLD1').marketAnalysis;
  assert.strictEqual(oldMarket.required, true);
  assert.strictEqual(oldMarket.status, 'market_required_missing');
  assert.ok(oldMarket.riskSignals.includes('market_evidence_missing'));
  assert.ok(oldMarket.terms.includes('fiesta gifts'));
  assert.ok(!oldMarket.terms.some(term => term.includes('unknown')));
  assert.ok(!oldMarket.terms.includes('134'));
  assert.ok(!oldMarket.terms.includes('women'));

  const newMarket = review.rows.find(row => row.sku === 'NEW1').marketAnalysis;
  assert.ok(newMarket.terms.includes('elephant charm'));
  assert.ok(newMarket.terms.includes('small elephant figurines'));
  assert.strictEqual(newMarket.status, 'market_evidence_ready');
  assert.strictEqual(newMarket.coverage.abaMatched, 1);
}

console.log('sku_operating_review.test.js passed');
