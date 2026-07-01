const assert = require('assert');
const {
  buildPriceRaiseFollowup,
  renderPriceRaiseFollowupMarkdown,
} = require('../src/price_raise_followup');

const baseSnapshot = {
  productCards: [
    {
      sku: 'HOT1599',
      asin: 'B0HOT1599',
      salesChannel: 'Amazon.com',
      lowestprice: 17.99,
      unitsSold_1d: 1,
      unitsSold_3d: 4,
      unitsSold_7d: 12,
      fulFillable: 80,
      reserved: 0,
      adStats: {
        '3d': { clicks: 35, orders: 0, impressions: 1200 },
        '7d': { clicks: 90, orders: 3, impressions: 3000 },
      },
    },
    {
      sku: 'ADPAUSED',
      asin: 'B0ADPAUSED',
      salesChannel: 'Amazon.com',
      lowestprice: 16.99,
      unitsSold_1d: 0,
      unitsSold_3d: 0,
      unitsSold_7d: 0,
      fulFillable: 5,
      reserved: 0,
      advState: 'off',
      adStats: {
        '3d': { clicks: 0, orders: 0, impressions: 0 },
        '7d': { clicks: 0, orders: 0, impressions: 0 },
      },
    },
    {
      sku: 'PENDING',
      asin: 'B0PENDING',
      salesChannel: 'Amazon.com',
      lowestprice: 15.99,
      unitsSold_1d: 18,
      unitsSold_3d: 55,
      unitsSold_7d: 120,
      fulFillable: 20,
      reserved: 0,
      is_price_apply: 1,
      price_apply_time: '2026-06-16 10:00:00',
    },
    {
      sku: 'OKPRICE',
      asin: 'B0OKPRICE',
      salesChannel: 'Amazon.com',
      lowestprice: 16.99,
      unitsSold_1d: 15,
      unitsSold_3d: 48,
      unitsSold_7d: 100,
      fulFillable: 40,
      reserved: 0,
      adStats: {
        '3d': { clicks: 80, orders: 16, impressions: 2400 },
      },
    },
  ],
};

const adjustments = [
  {
    sku: 'HOT1599',
    asin: 'B0HOT1599',
    site: 'Amazon.com',
    actionType: 'price',
    beforeValue: 15.99,
    afterValue: 17.99,
    businessDate: '2026-06-14',
    baseline: {
      units1d: 20,
      units3d: 60,
      units7d: 140,
    },
  },
  {
    sku: 'ADPAUSED',
    asin: 'B0ADPAUSED',
    site: 'Amazon.com',
    actionType: 'price',
    beforeValue: 15.99,
    afterValue: 16.99,
    businessDate: '2026-06-14',
    baseline: {
      units1d: 12,
      units3d: 36,
      units7d: 80,
    },
  },
  {
    sku: 'PENDING',
    asin: 'B0PENDING',
    site: 'Amazon.com',
    actionType: 'price',
    beforeValue: 15.99,
    afterValue: 16.99,
    businessDate: '2026-06-16',
    baseline: {
      units1d: 18,
      units3d: 55,
      units7d: 120,
    },
  },
  {
    sku: 'OKPRICE',
    asin: 'B0OKPRICE',
    site: 'Amazon.com',
    actionType: 'price',
    beforeValue: 15.99,
    afterValue: 16.99,
    businessDate: '2026-06-14',
    baseline: {
      units1d: 16,
      units3d: 45,
      units7d: 95,
    },
  },
];

{
  const report = buildPriceRaiseFollowup({
    businessDate: '2026-06-17',
    snapshot: baseSnapshot,
    adjustments,
  });

  assert.strictEqual(report.summary.total, 4);
  assert.strictEqual(report.summary.needsAction, 1);
  assert.strictEqual(report.summary.watch, 2);
  assert.strictEqual(report.summary.healthy, 1);

  const hot = report.items.find(item => item.sku === 'HOT1599');
  assert.strictEqual(hot.status, 'needs_action');
  assert.strictEqual(hot.landingStatus, 'landed');
  assert.ok(hot.reasons.includes('post_raise_units_3d_drop_over_50pct'));
  assert.ok(hot.reasons.includes('clicks_without_orders_after_price_raise'));
  assert.strictEqual(hot.recommendedAction, 'rollback_one_price_step');

  const paused = report.items.find(item => item.sku === 'ADPAUSED');
  assert.strictEqual(paused.status, 'watch');
  assert.ok(paused.reasons.includes('ad_delivery_suppressed_after_price_raise'));
  assert.strictEqual(paused.recommendedAction, 'separate_ad_pause_from_price_damage');

  const pending = report.items.find(item => item.sku === 'PENDING');
  assert.strictEqual(pending.status, 'watch');
  assert.strictEqual(pending.landingStatus, 'submitted_pending');
  assert.ok(pending.reasons.includes('price_application_not_landed'));

  const ok = report.items.find(item => item.sku === 'OKPRICE');
  assert.strictEqual(ok.status, 'healthy');
  assert.strictEqual(ok.recommendedAction, 'close_or_continue_7d_watch');
}

{
  const markdown = renderPriceRaiseFollowupMarkdown(buildPriceRaiseFollowup({
    businessDate: '2026-06-17',
    snapshot: baseSnapshot,
    adjustments,
  }));

  assert.ok(markdown.includes('# Price Raise Followup 2026-06-17'));
  assert.ok(markdown.includes('## Needs Action'));
  assert.ok(markdown.includes('HOT1599'));
  assert.ok(markdown.includes('rollback_one_price_step'));
}
