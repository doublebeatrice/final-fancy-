const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildReviewEvidence,
  collectAdSkuReviewEvidence,
  normalizeAdSkuSummaryReport,
  normalizeInventoryReport,
  normalizeProfitReport,
  normalizeExtendedSelectionReport,
  normalizeSelectionMarketReport,
  reviewSubjectKeys,
} = require('../src/agent_review_evidence');
const { runAgentReviewEvidence } = require('../scripts/run_agent_review_evidence');

{
  const report = {
    ok: true,
    source: '/product/adSkuSummary',
    rows: [{
      sku: 'SE5608',
      cost: '18.5',
      orders: '2',
      sales: '60',
      clicks: '20',
      impressions: '3000',
    }],
  };
  const normalized = normalizeAdSkuSummaryReport(report);

  assert.strictEqual(normalized.ok, true);
  assert.strictEqual(normalized.rows.SE5608.spend, 18.5);
  assert.strictEqual(normalized.rows.SE5608.orders, 2);
  assert.strictEqual(normalized.rows.SE5608.sales, 60);
  assert.strictEqual(normalized.rows.SE5608.acos, 18.5 / 60);
}

{
  const inventory = normalizeInventoryReport({
    ok: true,
    source: 'inventoryScopeRows',
    rows: [{
      sku: 'SE5608',
      fulFillable: '12',
      reservedQty: '3',
      inboundQty: '5',
      invDays: '18',
      unitsSold_7d: '7',
    }],
  });
  const profit = normalizeProfitReport({
    ok: true,
    source: 'productCards',
    rows: [{
      sku: 'SE5608',
      profitRate: '0.16',
      netProfit: '4.2',
      price: '19.99',
    }],
  });

  assert.strictEqual(inventory.rows.SE5608.fulRes, 15);
  assert.strictEqual(inventory.rows.SE5608.totalInventory, 20);
  assert.strictEqual(inventory.rows.SE5608.sellableDays, 18);
  assert.strictEqual(profit.rows.SE5608.profitRate, 0.16);
  assert.strictEqual(profit.rows.SE5608.netProfit, 4.2);
}

{
  const extended = normalizeExtendedSelectionReport({
    ok: true,
    source: 'selection_extended_evidence',
    results: [{
      request: {
        key: 'asinInfo',
        query: { asins: 'B0INFO0001' },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          asin: 'B0INFO0001',
          title: 'Single ASIN Info Object',
        },
      },
    }, {
      request: {
        key: 'associationFlow',
        body: { asinList: ['B0GWD724Y8'] },
      },
      api: {
        ok: true,
        code: 200,
        result: [{
          relatedAsin: 'B0GWD724Y8',
          relatedCount: 3,
          relatedDetailVo: {
            asin: 'B0GWD724Y8',
            title: '12 Pcs Patriotic Bucket Hat Set',
            price: '45.99',
            isSelfAsin: 1,
          },
        }],
      },
    }, {
      request: {
        key: 'adPlacement',
        body: { asinList: ['B0GWD724Y8'] },
      },
      api: {
        ok: true,
        code: 200,
        result: [{
          relatedAsin: 'B0GWAD0001',
          relatedCount: 1,
        }],
      },
    }, {
      request: {
        key: 'commentAnalysis',
        query: { asin: 'B0GWD724Y8' },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          haveComments: [{
            asin: 'B0GWD724Y8',
            asinRatingCount: 12,
            asinCommentsCount: 5,
            asinRatingAvg: 4.2,
          }],
          noComments: [],
        },
      },
    }, {
      request: {
        key: 'commentList',
        query: { asin: 'B0GWD724Y8' },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          records: [{ id: 1, rating: 5 }, { id: 2, rating: 1 }],
          total: 2,
        },
      },
    }, {
      request: {
        key: 'trafficDetail',
        query: { asins: 'B0GWD724Y8' },
      },
      api: {
        ok: true,
        code: 200,
        result: [{
          asin: 'B0GWD724Y8',
          searchTerm: 'american flag bucket hat',
          flowRate: 0.12,
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
            asin: 'B0GWD724Y8',
            title: '12 Pcs Patriotic Bucket Hat Set',
            bsrRank: 42,
            firstCategoryRank: 4,
            price: 45.99,
            rating: 4.3,
            totalComments: 18,
          }],
          total: 1,
        },
      },
    }, {
      request: {
        key: 'bsrOverview',
        query: { uTime: '2026-05-21', categoryType: 1 },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          asinNum1: 100,
          newAsinCount1: 12,
        },
      },
    }, {
      request: {
        key: 'categoryAnalysis',
        query: { uTime: '2026-05-10', site: 1, dateType: 1 },
        body: { advancedSearch: { category: 'Beauty & Personal Care' } },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          records: [{
            category: 'Beauty & Personal Care',
            productType: 'makeup bag',
            sellers: 42,
            asin: 120,
            newAsin: 12,
          }],
          total: 1,
        },
      },
    }, {
      request: {
        key: 'flowThemeMain',
        body: { uTime: '2026-04', dateType: 2 },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          records: [{ patternSt: 'christmas towel', pattern_rank: 12 }],
          total: 1,
        },
      },
    }, {
      request: {
        key: 'flowThemeHistory',
        query: { uTime: '2026-04' },
      },
      api: {
        ok: true,
        code: 200,
        result: ['material', 'function'],
      },
    }, {
      request: {
        key: 'storeFeedbackList',
        query: { uTime: '2026-04-01', myCollection: 0 },
      },
      api: {
        ok: true,
        code: 200,
        result: {
          records: [{
            accountId: 'A2EJCTH67GJMT3',
            accountName: 'Pattern.',
            count30Day: 5027,
            asinCounts: 8000,
          }],
          total: 1,
        },
      },
    }],
  });

  assert.strictEqual(extended.rows.B0INFO0001.asinInfo.title, 'Single ASIN Info Object');
  assert.strictEqual(extended.rows.B0GWD724Y8.asinInfo.title, '12 Pcs Patriotic Bucket Hat Set');
  assert.strictEqual(extended.rows.B0GWD724Y8.associationFlow.length, 1);
  assert.strictEqual(extended.rows.B0GWD724Y8.commentList.records.length, 2);
  assert.strictEqual(extended.rows.B0GWD724Y8.commentAsinStats[0].asinRatingAvg, 4.2);
  assert.strictEqual(extended.rows.B0GWD724Y8.trafficDetail.length, 1);
  assert.strictEqual(extended.rows.B0GWD724Y8.dailyRanks[0].bsrRank, 42);
  assert.strictEqual(extended.dailyRanks.bsrOverview.metrics.asinNum1, 100);
  assert.strictEqual(extended.categoryAnalysis.category, 'Beauty & Personal Care');
  assert.strictEqual(extended.categoryAnalysis.rowCount, 1);
  assert.strictEqual(extended.flowThemeTags.main.rowCount, 1);
  assert.strictEqual(extended.flowThemeTags.dimensions.rowCount, 2);
  assert.strictEqual(extended.storeFeedback.list.rows[0].accountName, 'Pattern.');
  assert.strictEqual(extended.rows.B0GWAD0001.adPlacement.length, 1);
  assert.strictEqual(extended.readyForAutoAction, false);
}

{
  const market = normalizeSelectionMarketReport({
    keywordConversion: {
      source: 'selection_keyword_conversion_rate',
      rows: [{
        keyword: 'american flag bucket hat',
        marketQuality: 'weak',
        costRisk: 'high',
        purchaseVolume: 1,
        clickPurchaseRatio: 0.01,
      }],
    },
    abaSearchTerms: {
      source: 'selection_aba_search_terms',
      rows: [{
        searchTerm: 'american flag bucket hat',
        demandTier: 'low',
        competitionTier: 'high',
        searchVolume: 1800,
      }],
    },
    keywordSeasonality: {
      source: 'selection_keyword_seasonality',
      rows: [{
        searchTerm: 'american flag bucket hat',
        seasonalityType: 'strong_seasonal',
        peakQuarter: 'q2',
        quarterRatio: 2.4,
      }],
    },
  });

  assert.strictEqual(market.keywordConversion.rows['american flag bucket hat'].marketQuality, 'weak');
  assert.strictEqual(market.abaSearchTerms.rows['american flag bucket hat'].competitionTier, 'high');
  assert.strictEqual(market.keywordSeasonality.rows['american flag bucket hat'].peakQuarter, 'q2');
}

{
  const market = normalizeSelectionMarketReport({
    keywordSeasonality: {
      source: 'selection_keyword_seasonality',
      rows: [{
        searchTerm: 'sun hats for women',
        rank: 2393,
        searchVolume: 196759,
        asinCount: 170,
        demandTier: 'high',
        competitionTier: 'high',
        googleTrend: {
          latestValue: 94,
          maxValue: 100,
          direction: 'mixed_or_flat',
        },
        competitorSummary: {
          asinCount: 10,
          priceAvg: 15.6,
          reviewAvg: 7533.1,
          brandCount: 5,
        },
      }],
    },
  });

  const row = market.keywordSeasonality.rows['sun hats for women'];
  assert.strictEqual(row.rank, 2393);
  assert.strictEqual(row.searchVolume, 196759);
  assert.strictEqual(row.asinCount, 170);
  assert.strictEqual(row.googleTrend.direction, 'mixed_or_flat');
  assert.strictEqual(row.competitorSummary.priceAvg, 15.6);
  assert.strictEqual(row.competitionTier, 'high');
}

{
  const keys = reviewSubjectKeys({
    due: [
      { subject: { sku: 'SE5608' } },
      { subject: { sku: 'SE5608' } },
      { subject: { asin: 'B0ABCDEF12' } },
      { subject: {} },
    ],
  });
  assert.deepStrictEqual(keys, ['SE5608', 'B0ABCDEF12']);
}

{
  const queue = {
    due: [{
      taskId: 'review-1',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 0, acos: 0 },
        metrics: ['spend', 'orders', 'acos'],
      },
    }],
  };
  const evidence = buildReviewEvidence({
    queue,
    adReports: {
      SE5608: {
        ok: true,
        rows: [{ sku: 'SE5608', spend: 18, orders: 0, sales: 0 }],
      },
    },
  });

  assert.deepStrictEqual(evidence.SE5608.baseline, { spend: 10, orders: 0, acos: 0 });
  assert.strictEqual(evidence.SE5608.current.spend, 18);
  assert.strictEqual(evidence.SE5608.current.orders, 0);
  assert.strictEqual(evidence.SE5608.sources[0].source, '/product/adSkuSummary');
}

{
  const queue = {
    due: [{
      taskId: 'review-business-guardrail',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 1, acos: 0.2 },
        metrics: ['spend', 'orders', 'acos', 'inventory', 'profit'],
      },
    }],
  };
  const evidence = buildReviewEvidence({
    queue,
    adReports: {
      SE5608: {
        ok: true,
        rows: [{ sku: 'SE5608', spend: 14, orders: 3, sales: 40, acos: 0.35 }],
      },
    },
    inventoryReports: {
      SE5608: {
        ok: true,
        source: 'inventoryScopeRows',
        rows: [{ sku: 'SE5608', fulFillable: 8, reservedQty: 1, inboundQty: 0, invDays: 12 }],
      },
    },
    profitReports: {
      SE5608: {
        ok: true,
        source: 'productCards',
        rows: [{ sku: 'SE5608', profitRate: 0.16, netProfit: 3.5 }],
      },
    },
  });

  assert.strictEqual(evidence.SE5608.current.orders, 3);
  assert.strictEqual(evidence.SE5608.inventory.sellableDays, 12);
  assert.strictEqual(evidence.SE5608.profit.profitRate, 0.16);
  assert.ok(evidence.SE5608.riskSignals.includes('inventory_tight'));
  assert.ok(evidence.SE5608.riskSignals.includes('acos_above_profit_rate'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'inventoryScopeRows'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'productCards'));
}

{
  const queue = {
    due: [{
      taskId: 'review-market-guardrail',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 1, acos: 0.2 },
        metrics: ['orders', 'market'],
        marketTerms: ['american flag bucket hat'],
      },
    }],
  };
  const evidence = buildReviewEvidence({
    queue,
    adReports: {
      SE5608: {
        ok: true,
        rows: [{ sku: 'SE5608', spend: 14, orders: 3, sales: 40, acos: 0.25 }],
      },
    },
    selectionReports: {
      keywordResearch: {
        source: 'selection_keyword_research',
        candidateKeywords: [{ term: 'american flag bucket hat', source: 'operator_terms' }],
        directCompetitorAsins: [{ asin: 'B0HAT00001', searchTerm: 'american flag bucket hat' }],
      },
      keywordConversion: {
        source: 'selection_keyword_conversion_rate',
        rows: [{ keyword: 'american flag bucket hat', marketQuality: 'weak', costRisk: 'high' }],
      },
      abaSearchTerms: {
        source: 'selection_aba_search_terms',
        rows: [{ searchTerm: 'american flag bucket hat', demandTier: 'low', competitionTier: 'high' }],
      },
      keywordSeasonality: {
        source: 'selection_keyword_seasonality',
        rows: [{ searchTerm: 'american flag bucket hat', seasonalityType: 'strong_seasonal', peakQuarter: 'q2', quarterRatio: 2.4 }],
      },
      productTimeMachine: {
        source: 'selection_product_time_machine',
        rows: [{
          asin: 'B0HAT00001',
          searchKeyword: 'american flag bucket hat',
          demandTier: 'high',
          trafficMix: 'ad_led',
          boughtInPastMonthLowerBound: 1000,
          aoVal: 1.4,
          trafficTerms: { total: 120, natural: 20, sp: 80 },
        }],
      },
      extendedSelection: {
        source: 'selection_extended_evidence',
        ok: true,
        results: [{
          request: {
            key: 'associationFlow',
            body: { asinList: ['B0ABCDEF12'] },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              relatedAsin: 'B0ABCDEF12',
              relatedCount: 2,
              relatedDetailVo: {
                asin: 'B0ABCDEF12',
                title: 'American Flag Bucket Hat',
                isSelfAsin: 1,
              },
            }],
          },
        }],
      },
    },
  });

  assert.strictEqual(evidence.SE5608.market.terms[0].term, 'american flag bucket hat');
  assert.strictEqual(evidence.SE5608.market.coverage.keywordResearchMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.keywordConversionMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.abaMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.seasonalityMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.productTimeMachineMatched, 1);
  assert.strictEqual(evidence.SE5608.market.operatingIntelligence.decisionQuality, 'full_market_profile');
  assert.ok(evidence.SE5608.riskSignals.includes('market_conversion_weak'));
  assert.ok(evidence.SE5608.riskSignals.includes('market_competition_high'));
  assert.ok(evidence.SE5608.riskSignals.includes('market_strong_seasonality'));
  assert.ok(evidence.SE5608.riskSignals.includes('competitor_ad_pressure_high'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_keyword_research'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_keyword_conversion_rate'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_aba_search_terms'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_keyword_seasonality'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_product_time_machine'));
  assert.strictEqual(evidence.SE5608.productSelection, null);
}

{
  const queue = {
    due: [{
      taskId: 'review-product-selection',
      subject: { asin: 'B0ABCDEF12' },
      reviewPlan: {
        baseline: { spend: 10, orders: 1 },
        metrics: ['asin', 'product'],
      },
    }],
  };
  const evidence = buildReviewEvidence({
    queue,
    adReports: {
      B0ABCDEF12: {
        ok: true,
        rows: [{ sku: 'B0ABCDEF12', spend: 14, orders: 1 }],
      },
    },
    selectionReports: {
      extendedSelection: {
        source: 'selection_extended_evidence',
        ok: true,
        results: [{
          request: {
            key: 'associationFlow',
            body: { asinList: ['B0ABCDEF12'] },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              relatedAsin: 'B0ABCDEF12',
              relatedCount: 2,
              relatedDetailVo: {
                asin: 'B0ABCDEF12',
                title: 'American Flag Bucket Hat',
                isSelfAsin: 1,
              },
            }],
          },
        }, {
          request: {
            key: 'adPlacement',
            body: { asinList: ['B0ABCDEF12'] },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              relatedAsin: 'B0ABCDEF12',
              relatedCount: 1,
              relatedDetailVo: {
                asin: 'B0ABCDEF12',
                title: 'American Flag Bucket Hat',
                isSelfAsin: 1,
              },
            }],
          },
        }, {
          request: {
            key: 'commentList',
            query: { asin: 'B0ABCDEF12' },
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
            query: { asins: 'B0ABCDEF12' },
          },
          api: {
            ok: true,
            code: 200,
            result: [{
              asin: 'B0ABCDEF12',
              searchTerm: 'american flag bucket hat',
            }],
          },
        }, {
          request: {
            key: 'newReleasesList',
            query: { uTime: '2026-05-21', categoryType: 2 },
          },
          api: {
            ok: true,
            code: 200,
            result: {
              records: [{
                asin: 'B0ABCDEF12',
                title: 'American Flag Bucket Hat',
                bsrRank: 18,
                isAsinNew: true,
              }],
              total: 1,
            },
          },
        }, {
          request: {
            key: 'storeFeedbackNewAsin',
            query: {
              accountId: 'A2STORE',
              accountName: 'Store sample',
            },
          },
          api: {
            ok: true,
            code: 200,
            result: {
              records: [{
                asin: 'B0ABCDEF12',
                account_name: 'Store sample',
                isAsinNew: 1,
              }],
              total: 1,
            },
          },
        }],
      },
    },
  });

  assert.strictEqual(evidence.B0ABCDEF12.productSelection.readyForDecisionSupport, true);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.associationFlowCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.adPlacementCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.commentListCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.trafficDetailCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.dailyRankCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.storeFeedbackNewAsinCount, 1);
  assert.strictEqual(evidence.B0ABCDEF12.productSelection.dailyRanks[0].list, 'newReleases');
  assert.ok(evidence.B0ABCDEF12.sources.some(item => item.source === 'selection_extended_evidence'));
}

{
  const queue = {
    due: [{
      taskId: 'review-2',
      subject: { sku: 'QAA3143' },
      reviewPlan: { metrics: ['orders'] },
    }],
  };
  const evidence = buildReviewEvidence({
    queue,
    adReports: {
      QAA3143: { ok: true, rows: [{ sku: 'QAA3143', spend: 2, orders: 1 }] },
    },
  });

  assert.strictEqual(evidence.QAA3143.current.orders, 1);
  assert.strictEqual(evidence.QAA3143.baseline, null);
  assert.ok(evidence.QAA3143.warnings.includes('missing_baseline_metrics'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-review-evidence-'));
  const queue = {
    due: [{
      taskId: 'review-1',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 0 },
        metrics: ['orders', 'market'],
        marketTerms: ['american flag bucket hat'],
      },
    }],
  };
  const calls = [];
  const result = collectAdSkuReviewEvidence({
    queue,
    outDir: tmpDir,
    today: '2026-05-19',
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      const outFile = args[args.length - 1];
      fs.writeFileSync(outFile, JSON.stringify({
        ok: true,
        rows: [{ sku: 'SE5608', cost: 18, orders: 0, sales: 0 }],
      }), 'utf8');
      return 'ok';
    },
  });

  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].args.includes('SE5608'));
  assert.strictEqual(result.evidence.SE5608.current.spend, 18);
  assert.ok(fs.existsSync(result.evidenceFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-review-evidence-cli-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const outFile = path.join(tmpDir, 'evidence.json');
  fs.writeFileSync(queueFile, JSON.stringify({
    due: [{
      taskId: 'review-1',
      subject: { sku: 'SE5608' },
      reviewPlan: {
        baseline: { spend: 10, orders: 0 },
        metrics: ['orders', 'market'],
        marketTerms: ['american flag bucket hat'],
      },
    }],
  }), 'utf8');

  const result = runAgentReviewEvidence({
    queueFile,
    outFile,
    today: '2026-05-19',
    outDir: tmpDir,
    inventoryReports: {
      SE5608: {
        ok: true,
        source: 'inventoryScopeRows',
        rows: [{ sku: 'SE5608', fulFillable: 8, reservedQty: 2, invDays: 16 }],
      },
    },
    profitReports: {
      SE5608: {
        ok: true,
        source: 'productCards',
        rows: [{ sku: 'SE5608', profitRate: 0.18 }],
      },
    },
    selectionReports: {
      keywordConversion: {
        source: 'selection_keyword_conversion_rate',
        rows: [{ keyword: 'american flag bucket hat', marketQuality: 'usable_niche', costRisk: 'medium' }],
      },
    },
    execFileSync: (bin, args) => {
      fs.writeFileSync(args[args.length - 1], JSON.stringify({
        ok: true,
        rows: [{ sku: 'SE5608', cost: 18, orders: 0, sales: 0 }],
      }), 'utf8');
      return 'ok';
    },
  });

  assert.strictEqual(result.summary.collected, 1);
  assert.strictEqual(result.summary.inventoryCollected, 1);
  assert.strictEqual(result.summary.profitCollected, 1);
  assert.strictEqual(result.summary.selectionCollected, 1);
  assert.ok(fs.existsSync(outFile));
}

console.log('agent_review_evidence tests passed');
