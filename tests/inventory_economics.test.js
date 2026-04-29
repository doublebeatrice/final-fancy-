const assert = require('assert');
const {
  assessAdOperatingContext,
  assessCurrentAdReadiness,
  assessSkuSalesHistory,
  assessLifecycleSeasonStrategy,
  assessInventoryResponsibility,
  assessListingSeasonFit,
  formatInventoryJudgement,
} = require('../src/inventory_economics');

{
  const strategy = assessLifecycleSeasonStrategy({
    sku: 'NEW-NURSE',
    opendate: '2026-03-20',
    invDays: 80,
    fulFillable: 40,
    unitsSold_7d: 3,
    unitsSold_30d: 8,
    price: 20,
    profitRate: 0.2,
    listing: {
      title: 'Nurse Week Gift Basket',
      bullets: ['Nurse appreciation gift'],
      mainImageUrl: 'https://cdn.example.com/nurse-gift.jpg',
    },
    productProfile: {
      occasion: ['nurse week'],
      targetAudience: ['nurse'],
      productType: 'gift basket',
    },
    adStats: {
      '7d': { spend: 18, orders: 2, sales: 40 },
      '30d': { spend: 42, orders: 4, sales: 80 },
    },
  }, {}, { currentDate: '2026-04-29' });
  assert.strictEqual(strategy.lifecycleStage, 'new_0_5m');
  assert.strictEqual(strategy.seasonPhase, 'active_window');
  assert.strictEqual(strategy.aiDecisionFrame, 'new_window_accelerate_verified');
}

{
  const strategy = assessLifecycleSeasonStrategy({
    sku: 'OLD-XMAS',
    opendate: '2021-09-01',
    invDays: 160,
    fulFillable: 70,
    unitsSold_7d: 0,
    unitsSold_30d: 2,
    price: 20,
    profitRate: 0.15,
    yoyAsinPct: -0.4,
    listing: {
      title: 'Christmas Gift Basket',
      bullets: ['Merry Christmas gift'],
      mainImageUrl: 'https://cdn.example.com/christmas.jpg',
    },
    productProfile: {
      occasion: ['christmas'],
      visualTheme: ['christmas'],
    },
    adStats: {
      '7d': { spend: 12, orders: 0, sales: 0 },
      '30d': { spend: 24, orders: 1, sales: 20 },
    },
  }, {}, { currentDate: '2026-04-29' });
  assert.strictEqual(strategy.lifecycleStage, 'declining_old');
  assert.strictEqual(strategy.seasonPhase, 'offseason_or_wait');
  assert.strictEqual(strategy.aiDecisionFrame, 'old_offseason_clearance_compare');
  assert.strictEqual(strategy.spendWithoutLearning, true);
}

{
  const assessment = assessInventoryResponsibility({
    sku: 'FBA-HIGH',
    price: 20,
    profitRate: 0.12,
    invDays: 140,
    fulFillable: 80,
    reserved: 10,
    unitsSold_30d: 18,
    unitsSold_7d: 5,
    productProfile: { occasion: ['nurse week'], seasonality: ['Q2'] },
    adStats: {
      '7d': { spend: 32, orders: 5, sales: 100 },
      '30d': { spend: 120, orders: 18, sales: 360 },
    },
  }, { currentDate: '2026-04-28' });
  assert.strictEqual(assessment.highInventoryPressure, true);
  assert.strictEqual(assessment.hasFbaResponsibility, true);
  assert.strictEqual(assessment.allowHighAcosSellThrough, true);
  assert.strictEqual(assessment.continueAdBeatsClearance, true);
  assert.ok(formatInventoryJudgement(assessment).includes('ACOS'));
}

{
  const assessment = assessInventoryResponsibility({
    sku: 'LOW-STOCK',
    price: 25,
    profitRate: 0.25,
    invDays: 12,
    fulFillable: 4,
    unitsSold_30d: 20,
    adStats: { '30d': { spend: 20, orders: 8, sales: 200 } },
  }, { currentDate: '2026-04-28' });
  assert.strictEqual(assessment.lowInventoryPressure, true);
  assert.strictEqual(assessment.restrictScaleUp, true);
  assert.strictEqual(assessment.strategy, 'preserve_inventory');
}

{
  const fit = assessListingSeasonFit({
    sku: 'XMAS-MAY',
    listing: {
      title: 'Christmas Teacher Gift Basket',
      bullets: ['Merry Christmas stocking stuffer for teacher'],
      mainImageUrl: 'https://cdn.example.com/christmas-tree-gift.jpg',
    },
    productProfile: {
      occasion: ['christmas'],
      visualTheme: ['christmas', 'santa'],
    },
  }, { currentDate: '2026-05-10' });
  assert.strictEqual(fit.pushLevel, 'listing_update_required');
  assert.strictEqual(fit.fit, 'listing_update_required');
}

{
  const context = assessAdOperatingContext({
    sku: 'EVERGREEN-MAY',
    invDays: 120,
    fulFillable: 60,
    unitsSold_30d: 10,
    price: 20,
    profitRate: 0.1,
    listing: {
      title: 'Teacher Appreciation Gift Basket',
      bullets: ['Thank you teacher gift for women'],
      mainImageUrl: 'https://cdn.example.com/teacher-appreciation-gift.jpg',
    },
    productProfile: {
      occasion: ['teacher appreciation'],
      targetAudience: ['teacher'],
      productType: 'gift basket',
    },
    adStats: { '30d': { spend: 30, orders: 5, sales: 100 } },
  }, { currentDate: '2026-05-10' });
  assert.strictEqual(context.listing.pushLevel, 'normal_push');
  assert.strictEqual(context.history.pushLevel, 'light_test');
  assert.ok(context.judgement.includes('Listing'));
}

{
  const history = assessSkuSalesHistory({
    sku: 'XMAS-HISTORY',
    salesHistory: {
      rows: [
        { date: '2025-09-01', salesQty: 3 },
        { date: '2025-10-15', salesQty: 18 },
        { date: '2025-11-20', salesQty: 45 },
      ],
      summary: {
        lastYearSamePeriodQty: 0,
        recent30Qty: 0,
        recent7Qty: 0,
        historicalStartMonth: '09',
        historicalPeakMonth: '11',
        isNearHistoricalStart: false,
        seasonStage: 'offseason',
        monthTotals: [
          { month: '2025-09', qty: 3 },
          { month: '2025-10', qty: 18 },
          { month: '2025-11', qty: 45 },
        ],
      },
    },
  }, { currentDate: '2026-05-10' });
  assert.strictEqual(history.pushLevel, 'hold_wait_season');
}

{
  const context = assessAdOperatingContext({
    sku: 'XMAS-MAY-HISTORY',
    invDays: 180,
    fulFillable: 90,
    price: 22,
    profitRate: 0.12,
    unitsSold_30d: 0,
    listing: {
      title: 'Christmas Gift Basket',
      bullets: ['Merry Christmas gift'],
      mainImageUrl: 'https://cdn.example.com/christmas.jpg',
    },
    salesHistory: {
      rows: [
        { date: '2025-09-01', salesQty: 5 },
        { date: '2025-11-20', salesQty: 40 },
      ],
      summary: {
        lastYearSamePeriodQty: 0,
        recent30Qty: 0,
        recent7Qty: 0,
        historicalStartMonth: '09',
        historicalPeakMonth: '11',
        isNearHistoricalStart: false,
        seasonStage: 'offseason',
        monthTotals: [
          { month: '2025-09', qty: 5 },
          { month: '2025-11', qty: 40 },
        ],
      },
    },
  }, { currentDate: '2026-05-10' });
  assert.strictEqual(context.history.pushLevel, 'hold_wait_season');
  assert.strictEqual(context.finalAction, 'page_hold_do_not_create');
  assert.strictEqual(context.readiness.disallowNewAds, true);
  assert.strictEqual(context.readiness.recommendation, '需改 Listing 后再测');
}

{
  const readiness = assessCurrentAdReadiness({
    sku: 'EASTER-PAST',
    invDays: 90,
    fulFillable: 40,
    listing: {
      title: 'Easter Bunny Basket',
      bullets: ['Easter egg hunt party favor'],
      mainImageUrl: 'https://cdn.example.com/easter-bunny.jpg',
    },
    productProfile: {
      occasion: ['easter'],
      visualTheme: ['easter', 'bunny'],
    },
    salesHistory: {
      rows: [{ date: '2025-03-20', salesQty: 30 }],
      summary: {
        lastYearSamePeriodQty: 0,
        recent30Qty: 0,
        recent7Qty: 0,
        historicalStartMonth: '03',
        historicalPeakMonth: '03',
        seasonStage: 'offseason',
        monthTotals: [{ month: '2025-03', qty: 30 }],
      },
    },
  }, {}, { currentDate: '2026-05-10' });
  assert.strictEqual(readiness.isOverseason, true);
  assert.strictEqual(readiness.disallowNewAds, true);
  assert.strictEqual(readiness.pageHold, true);
}

console.log('inventory_economics tests passed');
