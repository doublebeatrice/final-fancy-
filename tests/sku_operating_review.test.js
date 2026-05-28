const assert = require('assert');
const { buildAllSkuOperatingReview, buildNodePlan, lifecycleFor, profitRateFor, yoyFor } = require('../src/sku_operating_review');

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
  const profit = profitRateFor({ sku: 'NET1', profitRate: 0.3033, netProfit: 0.15 });
  assert.strictEqual(profit, 0.15);
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
      keywordResearch: {
        source: 'selection_keyword_research',
        candidateKeywords: [{
          term: 'fathers day dad keychain',
          source: 'operator_terms',
          evidence: ['front_competitor_matches=2'],
        }],
        directCompetitorAsins: [{
          asin: 'B0DADCOMP1',
          searchTerm: 'fathers day dad keychain',
          title: 'Fathers Day Dad Keychain Gift',
        }],
        sceneCompetitorAsins: [{
          asin: 'B0DADCOMP2',
          searchTerm: 'fathers day dad keychain',
          title: 'Fathers Day Gift for Dad',
        }],
      },
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
      productTimeMachine: {
        source: 'selection_product_time_machine',
        rows: [{
          asin: 'B0DADCOMP1',
          searchKeyword: 'fathers day dad keychain',
          demandTier: 'high',
          trafficMix: 'ad_augmented',
          boughtInPastMonthLowerBound: 1500,
          price: 18.99,
          reviewCount: 1200,
          aoVal: 1.1,
          trafficTerms: { total: 180, natural: 70, sp: 60, brand: 10, video: 40 },
        }],
      },
      extendedSelection: {
        source: 'selection_extended_evidence',
        ok: true,
        results: [{
          request: {
            key: 'associationFlow',
            body: { asinList: ['B0DAD00001'] },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              relatedAsin: 'B0DAD00001',
              relatedCount: 2,
              relatedDetailVo: {
                asin: 'B0DAD00001',
                title: 'Fathers Day Dad Keychain Gift',
                price: '18.99',
                isSelfAsin: 1,
              },
            }],
          },
        }, {
          request: {
            key: 'adPlacement',
            body: { asinList: ['B0DAD00001'] },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              relatedAsin: 'B0DAD00001',
              relatedCount: 1,
              relatedDetailVo: {
                asin: 'B0DAD00001',
                title: 'Fathers Day Dad Keychain Gift',
                isSelfAsin: 1,
              },
            }],
          },
        }, {
          request: {
            key: 'commentList',
            query: { asin: 'B0DAD00001' },
          },
          api: {
            ok: true,
            code: 200,
            result: {
              records: [{ id: 1, rating: 5 }],
              total: 1,
            },
          },
        }, {
          request: {
            key: 'trafficDetail',
            query: { asins: 'B0DAD00001' },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              asin: 'B0DAD00001',
              searchTerm: 'fathers day dad keychain',
            }],
          },
        }, {
          request: {
            key: 'bsrList',
            query: { uTime: '2026-05-21', categoryType: 1 },
          },
          api: {
            ok: true,
            code: 200,
            result: {
              records: [{
                asin: 'B0DAD00001',
                title: 'Fathers Day Dad Keychain Gift',
                bsrRank: 12,
                firstCategoryRank: 3,
              }],
              total: 1,
            },
          },
        }],
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
        {
          sku: 'NET1',
          asin: 'B0NET00001',
          opendate: '2026-01-16',
          fulFillable: 90,
          invDays: 23,
          unitsSold_7d: 20,
          unitsSold_30d: 112,
          profitRate: 0.3033,
          netProfit: 0.15,
          productProfile: {
            productType: 'stencil',
            positioning: 'letter stencils',
          },
          adStats: { '7d': { impressions: 1000, clicks: 9, spend: 3.43, orders: 2, sales: 41.98 }, '30d': { impressions: 10000, clicks: 203, spend: 79.54, orders: 14, sales: 293.86 } },
        },
      ],
    },
  });

  assert.strictEqual(review.summary.totalSkus, 5);
  assert.strictEqual(review.summary.newLaunchRepair, 1);
  assert.strictEqual(review.summary.oldProductYoyDown, 1);
  assert.strictEqual(review.summary.stopLoss, 1);
  assert.strictEqual(review.summary.nodeTrafficGap, 1);
  assert.strictEqual(review.rows.find(row => row.sku === 'DAD1').verdict, 'node_traffic_gap');
  assert.strictEqual(review.rows.find(row => row.sku === 'DAD1').nodePlan.target.weeklyClicks, 20);
  assert.strictEqual(review.rows.find(row => row.sku === 'NEW1').verdict, 'launch_repair');
  assert.strictEqual(review.rows.find(row => row.sku === 'OLD1').verdict, 'old_product_recovery_check');
  assert.strictEqual(review.rows.find(row => row.sku === 'WASTE1').verdict, 'stop_loss');

  assert.strictEqual(review.summary.marketAnalysis.totalSkus, 5);
  assert.strictEqual(review.summary.marketAnalysis.requiredSkus, 5);
  assert.strictEqual(review.summary.marketAnalysis.readyForDecisionSupport, 2);
  assert.strictEqual(review.summary.marketAnalysis.requiredMissing, 3);
  assert.ok(review.rows.every(row => row.marketAnalysis && row.marketAnalysis.status));
  assert.strictEqual(review.summary.productSelection.totalSkus, 5);
  assert.strictEqual(review.summary.productSelection.readyForDecisionSupport, 1);
  const netRow = review.rows.find(row => row.sku === 'NET1');
  assert.strictEqual(netRow.profitRate, 0.15);
  assert.strictEqual(netRow.profitSource, 'netProfit');

  const dadMarket = review.rows.find(row => row.sku === 'DAD1').marketAnalysis;
  assert.strictEqual(dadMarket.required, true);
  assert.strictEqual(dadMarket.status, 'market_evidence_ready');
  assert.ok(dadMarket.terms.includes('fathers day dad keychain'));
  assert.strictEqual(dadMarket.coverage.keywordConversionMatched, 1);
  assert.strictEqual(dadMarket.coverage.abaMatched, 1);
  assert.strictEqual(dadMarket.coverage.keywordResearchMatched, 1);
  assert.strictEqual(dadMarket.coverage.productTimeMachineMatched, 1);
  assert.strictEqual(dadMarket.operatingIntelligence.decisionQuality, 'full_market_profile');
  assert.ok(dadMarket.operatingIntelligence.opportunityModels.some(model => model.key === 'competitor_traffic_map'));
  assert.ok(dadMarket.riskSignals.includes('competitor_ad_pressure_high'));
  const dadSelection = review.rows.find(row => row.sku === 'DAD1').productSelection;
  assert.strictEqual(dadSelection.readyForDecisionSupport, true);
  assert.strictEqual(dadSelection.readyForAutoAction, false);
  assert.strictEqual(dadSelection.associationFlowCount, 1);
  assert.strictEqual(dadSelection.adPlacementCount, 1);
  assert.strictEqual(dadSelection.commentListCount, 1);
  assert.strictEqual(dadSelection.trafficDetailCount, 1);
  assert.strictEqual(dadSelection.dailyRankCount, 1);
  assert.strictEqual(dadSelection.dailyRanks[0].bsrRank, 12);
  assert.strictEqual(dadSelection.asinInfo.title, 'Fathers Day Dad Keychain Gift');

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
