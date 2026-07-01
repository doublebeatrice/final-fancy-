const assert = require('assert');
const { buildSchema } = require('../scripts/execute/build_price_full_closure');

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'PIPE1',
          asin: 'B0PIPELINE',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 14,
          sellableDays7d: 10,
          price: 19.99,
          profitRate: 0.15,
          saleStatus: '正常销售',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'PIPE1',
        asin: 'B0PIPELINE',
        salesChannel: 'Amazon.com',
        saleStatus: '正常销售',
        price: 19.99,
        profitRate: 0.15,
        seaProfitRate: 0.35,
        unitsSold_7d: 14,
        fulFillable: 20,
        reserved: 0,
        stockInb: 80,
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'price_replenishment_pipeline_available');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'SHORT1',
          asin: 'B0SHORTAGE',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 14,
          sellableDays7d: 10,
          price: 19.99,
          profitRate: 0.15,
          saleStatus: '正常销售',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'SHORT1',
        asin: 'B0SHORTAGE',
        salesChannel: 'Amazon.com',
        saleStatus: '正常销售',
        price: 19.99,
        profitRate: 0.15,
        seaProfitRate: 0.35,
        unitsSold_7d: 14,
        fulFillable: 20,
        reserved: 0,
        stockInb: 0,
        localAvailableForPlan: 0,
        localFbaPlan: 0,
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'executable');
  assert.strictEqual(result.coverage[0].reason, 'price_action_ready');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    true,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'DAYS16',
          asin: 'B0DAYS16',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 7,
          sellableDays7d: 16,
          price: 19.99,
          profitRate: 0.15,
          saleStatus: '正常销售',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'DAYS16',
        asin: 'B0DAYS16',
        salesChannel: 'Amazon.com',
        saleStatus: '正常销售',
        price: 19.99,
        profitRate: 0.15,
        seaProfitRate: 0.35,
        unitsSold_7d: 7,
        fulFillable: 16,
        reserved: 0,
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'price_not_executable_velocity');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'SC3077',
          asin: 'B0CGV57T53',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 9,
          sellableDays7d: 16.7,
          price: 29.99,
          profitRate: 0.1817,
          saleStatus: '正常销售',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'SC3077',
        asin: 'B0CGV57T53',
        salesChannel: 'Amazon.com',
        saleStatus: '正常销售',
        price: 29.99,
        profitRate: 0.1817,
        seaProfitRate: 0.4691,
        unitsSold_7d: 9,
        fulFillable: 20,
        reserved: 10,
        productLabels: {},
        listing: {
          bodyPreview: 'High price. No featured offers available. See All Buying Options.',
          price: null,
          isAvailable: true,
        },
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'front_offer_price_block');
  assert.strictEqual(result.plans[0].actions.length, 1);
  assert.strictEqual(result.plans[0].actions[0].actionType, 'review');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'LADDER1',
          asin: 'B0LADDER1',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 14,
          sellableDays7d: 10,
          price: 22.99,
          profitRate: 0.12,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'LADDER1',
        asin: 'B0LADDER1',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 22.99,
        profitRate: 0.12,
        seaProfitRate: 0.32,
        unitsSold_7d: 14,
        fulFillable: 20,
        reserved: 0,
        stockInb: 0,
        localAvailableForPlan: 0,
        localFbaPlan: 0,
        productLabels: {},
      },
    ],
  };
  const recentAdjustments = [
    {
      sku: 'LADDER1',
      site: 'Amazon.com',
      actionType: 'price',
      entityType: 'sku',
      beforeValue: 19.99,
      afterValue: 22.99,
      direction: 'up',
      businessDate: '2026-06-04',
      runAt: '2026-06-05T02:00:00.000Z',
      outcome: 'application_submitted',
    },
  ];

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05', recentAdjustments });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'recent_price_raise_without_large_post_raise_sales');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'LADDER2',
          asin: 'B0LADDER2',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 21,
          sellableDays7d: 6.7,
          price: 22.99,
          profitRate: 0.12,
          postPriceUnits1d: 3,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'LADDER2',
        asin: 'B0LADDER2',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 22.99,
        profitRate: 0.12,
        seaProfitRate: 0.32,
        unitsSold_7d: 21,
        fulFillable: 20,
        reserved: 0,
        stockInb: 0,
        localAvailableForPlan: 0,
        localFbaPlan: 0,
        productLabels: {},
      },
    ],
  };
  const recentAdjustments = [
    {
      sku: 'LADDER2',
      site: 'Amazon.com',
      actionType: 'price',
      entityType: 'sku',
      beforeValue: 19.99,
      afterValue: 22.99,
      direction: 'up',
      businessDate: '2026-06-04',
      runAt: '2026-06-05T02:00:00.000Z',
      outcome: 'application_submitted',
    },
  ];

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05', recentAdjustments });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'executable');
  assert.strictEqual(result.coverage[0].reason, 'price_action_ready');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    true,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'LADDER3',
          asin: 'B0LADDER3',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 5,
          sellableDays7d: 8,
          price: 25.99,
          profitRate: 0.1,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'LADDER3',
        asin: 'B0LADDER3',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 25.99,
        profitRate: 0.1,
        seaProfitRate: 0.31,
        unitsSold_7d: 5,
        fulFillable: 6,
        reserved: 0,
        stockInb: 0,
        localAvailableForPlan: 0,
        localFbaPlan: 0,
        productLabels: {},
      },
    ],
  };
  const recentAdjustments = [
    {
      sku: 'LADDER3',
      site: 'Amazon.com',
      actionType: 'price',
      entityType: 'sku',
      beforeValue: 22.99,
      afterValue: 25.99,
      direction: 'up',
      businessDate: '2026-05-31',
      runAt: '2026-06-01T02:00:00.000Z',
      outcome: 'application_submitted',
    },
  ];

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05', recentAdjustments });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'recent_price_raise_without_large_post_raise_sales');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'ADREC1',
          asin: 'B0ADREC1',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 2,
          sellableDays7d: 14,
          price: 27.99,
          profitRate: 0.2,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'ADREC1',
        asin: 'B0ADREC1',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 27.99,
        profitRate: 0.2,
        seaProfitRate: 0.35,
        unitsSold_7d: 2,
        fulFillable: 4,
        reserved: 0,
        stockInb: 20,
        can_sales_30_first: 40,
        adv_point: 0.006,
        advState: '开',
        adStats: { '7d': { spend: 0.3, orders: 0, impressions: 40, clicks: 1 } },
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'price_ad_recovery_route');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'APPLYTIME1',
          asin: 'B0APPLYTIME',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 7,
          sellableDays7d: 7,
          price: 31.99,
          profitRate: 0.2,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'APPLYTIME1',
        asin: 'B0APPLYTIME',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 31.99,
        lowestprice: 31.99,
        price_apply_time: '2026-06-04 10:00:00',
        profitRate: 0.2,
        seaProfitRate: 0.35,
        unitsSold_7d: 7,
        fulFillable: 7,
        reserved: 0,
        adStats: { '7d': { spend: 2, orders: 1, impressions: 500, clicks: 12 } },
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'recent_price_raise_without_large_post_raise_sales');
  assert.strictEqual(result.coverage[0].recentPriceRaiseSource, 'sellerinventory_price_apply_time');
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [
        {
          sku: 'VARPRICE1',
          asin: 'B0VARPRICE',
          issue: 'ful_res_7d_sellable_days_short_price_gate',
          units7d: 4,
          sellableDays7d: 7,
          price: 21.99,
          profitRate: 0.2,
          saleStatus: '\u6b63\u5e38\u9500\u552e',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'VARPRICE1',
        asin: 'B0VARPRICE',
        parent_asin: 'B0VARPARENT',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 21.99,
        profitRate: 0.2,
        seaProfitRate: 0.35,
        unitsSold_7d: 4,
        unitsSold_30d: 18,
        fulFillable: 4,
        reserved: 0,
        adv_point: 0.04,
        advState: '开',
        adStats: { '7d': { spend: 5, orders: 2, impressions: 1200, clicks: 20 } },
        productLabels: {},
      },
      {
        sku: 'VARSIB1',
        asin: 'B0VARSIB1',
        parent_asin: 'B0VARPARENT',
        salesChannel: 'Amazon.com',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        price: 19.99,
        profitRate: 0.18,
        netProfit: 0.08,
        unitsSold_7d: 1,
        unitsSold_30d: 6,
        fulFillable: 80,
        reserved: 0,
        can_sales_30_first: 120,
        adv_point: 0,
        advState: '关',
        productLabels: {},
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'variant_line_review_required');
  assert(String(result.coverage[0].variantSiblingIssues).includes('VARSIB1:ad_recovery'));
  assert.strictEqual(
    result.plans[0].actions.some(action => action.actionType === 'price'),
    false,
  );
}

{
  const audit = {
    priceActions: {
      items: [],
      routedOut: [
        {
          sku: 'ROUTEOUT1',
          asin: 'B0ROUTEOUT',
          issue: 'price_pool_routed_to_ad_recovery',
          requiredAction: 'restore_historical_ad_lanes_before_price_raise',
          units7d: 2,
          fulResUnits: 4,
          sellableDays7d: 14,
          totalSellableDays7d: 40,
          why: 'Ad delivery/share is suppressed while inventory can connect.',
        },
      ],
    },
  };
  const snapshot = {
    productCards: [
      {
        sku: 'ROUTEOUT1',
        asin: 'B0ROUTEOUT',
        parent_asin: 'B0ROUTEPARENT',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        unitsSold_7d: 2,
        fulFillable: 4,
        reserved: 0,
        adv_point: 0.006,
        advState: '开',
      },
      {
        sku: 'ROUTESIB1',
        asin: 'B0ROUTESIB',
        parent_asin: 'B0ROUTEPARENT',
        saleStatus: '\u6b63\u5e38\u9500\u552e',
        unitsSold_30d: 5,
        fulFillable: 60,
        advState: '关',
        adv_point: 0,
      },
    ],
  };

  const result = buildSchema({ audit, snapshot, businessDate: '2026-06-05' });
  assert.strictEqual(result.coverage.length, 1);
  assert.strictEqual(result.coverage[0].status, 'review');
  assert.strictEqual(result.coverage[0].reason, 'price_pool_routed_to_ad_recovery');
  assert.strictEqual(result.plans[0].actions[0].actionType, 'review');
  assert(String(result.coverage[0].variantSiblingIssues).includes('ROUTESIB1:ad_recovery'));
}

console.log('price_full_closure tests passed');
