const assert = require('assert');
const { recordsFromExecutionEvents, recordsFromPlan } = require('../src/adjustment_log');

const timeContext = {
  runAt: '2026-05-14T10:00:00.000Z',
  businessDate: '2026-05-14',
  dataDate: '2026-05-14',
  siteTimezone: 'Asia/Shanghai',
  sourceRunId: 'test_price_executor',
};

{
  const records = recordsFromPlan([
    {
      sku: 'RHO1540',
      asin: 'B000000000',
      actions: [
        {
          entityType: 'sku',
          id: 'RHO1540',
          actionType: 'price',
          currentPrice: 11.99,
          suggestedPrice: 12.99,
          site: 'Amazon.com',
          direction: 'up',
          reason: '可卖低 涨价',
        },
      ],
    },
  ], timeContext, { dryRun: true });
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].beforeValue, 11.99);
  assert.strictEqual(records[0].afterValue, 12.99);
  assert.strictEqual(records[0].outcome, 'dry_run_planned');
}

{
  const records = recordsFromExecutionEvents([
    {
      sku: 'RHO1540',
      asin: 'B000000000',
      site: 'Amazon.com',
      entityType: 'sku',
      id: 'price_apply::20033564',
      apiStatus: 'api_success',
      finalStatus: 'application_submitted',
      action: {
        entityType: 'sku',
        id: 'RHO1540',
        actionType: 'price',
        currentPrice: 11.99,
        suggestedPrice: 12.99,
        direction: 'up',
        reason: '可卖低 涨价',
      },
      meta: {
        endpoint: '/pm/formal/applyPrice',
        priceApplyId: '20033564',
      },
    },
  ], timeContext);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].beforeValue, 11.99);
  assert.strictEqual(records[0].afterValue, 12.99);
  assert.strictEqual(records[0].outcome, 'application_submitted');
  assert.strictEqual(records[0].meta.priceApplyId, '20033564');
}

console.log('adjustment_log_price tests passed');
