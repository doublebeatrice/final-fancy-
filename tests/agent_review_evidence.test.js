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
    },
  });

  assert.strictEqual(evidence.SE5608.market.terms[0].term, 'american flag bucket hat');
  assert.strictEqual(evidence.SE5608.market.coverage.keywordConversionMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.abaMatched, 1);
  assert.strictEqual(evidence.SE5608.market.coverage.seasonalityMatched, 1);
  assert.ok(evidence.SE5608.riskSignals.includes('market_conversion_weak'));
  assert.ok(evidence.SE5608.riskSignals.includes('market_competition_high'));
  assert.ok(evidence.SE5608.riskSignals.includes('market_strong_seasonality'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_keyword_conversion_rate'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_aba_search_terms'));
  assert.ok(evidence.SE5608.sources.some(item => item.source === 'selection_keyword_seasonality'));
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
