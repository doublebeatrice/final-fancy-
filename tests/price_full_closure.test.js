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

console.log('price_full_closure tests passed');
