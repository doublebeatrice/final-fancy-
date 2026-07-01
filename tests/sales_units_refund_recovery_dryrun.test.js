const assert = require('assert');

const { buildReport } = require('../scripts/execute/generate_sales_units_refund_recovery_dryrun');

function gate() {
  return {
    status: 'fail',
    target: {
      salesTarget: 1000,
      unitsTarget: 100,
      refundRateMax: 0.05,
      netProfitRateMin: 0.2,
      acosMax: 0.2,
      adCostShareMax: 0.1,
    },
    actual: {
      sales: 800,
      units: 80,
      refundRate: 0.07,
      netProfitRate: 0.22,
      acos: 0.18,
      adCostShare: 0.09,
    },
    gate: {
      gap: {
        salesGap: 200,
        unitsGap: 20,
        refundRateGap: 0.02,
      },
    },
  };
}

function snapshot() {
  return {
    productCards: [
      {
        sku: 'GOOD1',
        asin: 'BGOOD00001',
        saleStatus: '正常销售',
        price: 20,
        netProfit: 0.3,
        busyNetProfit: 0.25,
        invDays: 90,
        unitsSold_7d: 10,
        unitsSold_30d: 30,
        listingSessions: { lastWeek: 200 },
        listingConversionRates: { lastWeek: 0.05 },
        productLabels: { is_high_return_rate: 0, product_type: '常规产品' },
      },
      {
        sku: 'FIX1',
        asin: 'BFIX000001',
        saleStatus: '正常销售',
        price: 18,
        netProfit: 0.24,
        busyNetProfit: 0.22,
        invDays: 80,
        unitsSold_7d: 1,
        unitsSold_30d: 30,
        listingSessions: { lastWeek: 400 },
        listingConversionRates: { lastWeek: 0.005 },
        productLabels: { is_high_return_rate: 0, product_type: '组合产品' },
      },
      {
        sku: 'REF1',
        asin: 'BREF000001',
        saleStatus: '正常销售',
        price: 15,
        netProfit: 0.2,
        busyNetProfit: 0.19,
        invDays: 70,
        unitsSold_7d: 25,
        unitsSold_30d: 100,
        listingSessions: { lastWeek: 500 },
        listingConversionRates: { lastWeek: 0.015 },
        productLabels: { is_high_return_rate: 1, is_illegal_variant: 1, product_type: '组合产品' },
      },
    ],
    adSkuSummaryRows: [
      { sku: 'GOOD1', '7_orders': 4, '7_acos': 0.1, '7_clicks': 30, '7_impressions': 1000, '30_orders': 12 },
      { sku: 'FIX1', '7_orders': 0, '7_acos': 0, '7_clicks': 45, '7_impressions': 1200, '30_orders': 6 },
    ],
    sellerSalesRows: [{ seller_title: 'all', refund_percent: '0.07' }],
  };
}

const report = buildReport({
  date: '2026-06-08',
  gate: gate(),
  snapshot: snapshot(),
  operatingReview: {
    rows: [
      { sku: 'FIX1', verdict: 'node_conversion_gap', reasons: ['转化断层'], salesPace7v30: -0.7 },
    ],
  },
  highEfficiencySchema: [
    {
      sku: 'GOOD1',
      actions: [
        {
          entityType: 'keyword',
          id: '1',
          text: 'good term',
          reason: 'orders7=4; acos7=0.1000; invDays=90; netProfit=0.3000; busyNetProfit=0.2500.',
        },
      ],
    },
  ],
  dryRunDecisions: {
    summary: { total: 1, byDecision: { executed: 1 } },
    items: [{ sku: 'GOOD1', decision: 'executed' }],
  },
  adjustments: [{ dryRun: false, actionType: 'budget' }],
  writeExecution: { mode: 'skipped', summary: { totalActions: 0, executedStages: 0 } },
  sourceFiles: {},
});

assert.strictEqual(report.boundaries.dryRunOnly, true);
assert.strictEqual(report.boundaries.noBudgetIncrease, true);
assert.strictEqual(report.refundRootCauseBoundary.claimsSkuRefundRate, false);
assert.ok(report.summary.highProfitScaleCandidates > 0);
assert.ok(report.summary.conversionRepairCandidates > 0);
assert.ok(report.summary.refundRootCauseSuspectSkus > 0);
assert.strictEqual(report.noWriteAudit.writeExecutionMode, 'skipped');
assert.strictEqual(report.noWriteAudit.executedStages, 0);
assert.strictEqual(report.highProfitScaleCandidates[0].action, 'dry_run_watch_existing_efficient_rows_no_budget_up');
assert.strictEqual(report.refundRootCauseSuspectSkus[0].evidenceLevel, 'proxy_suspect_not_confirmed_sku_refund_rate');

console.log('sales_units_refund_recovery_dryrun.test.js passed');
