const assert = require('assert');
const {
  buildApplyPricePayload,
  normalizeAdCoupling,
  validatePriceAction,
} = require('../src/price_executor');

{
  const action = {
    sku: 'RHO1540',
    id: 'RHO1540',
    site: 'Amazon.com',
    currentPrice: 11.99,
    suggestedPrice: 12.99,
    remark: '可卖低 涨价',
    priceIntent: 'inventory_protection',
    adCoupling: {
      direction: 'down',
      reason: 'inventory is tight',
      allowedAdActions: ['lower_bid', 'hold'],
      blockedAdActions: ['raise_bid'],
      checkAfterDays: [1, 3, 7],
    },
  };
  const row = {
    sku: 'RHO1540',
    site: 'Amazon.com',
    sale_status: '正常销售',
    price: '11.99',
    profit_raw: '0.2519',
    profit_raw_sea: '0.3953',
    account: 'RHO',
    developer_num: 'DB847',
    seller_num: 'HJ17',
  };
  const profit = { profit: '0.2948', profitSea: '0.4272' };
  const built = buildApplyPricePayload(action, row, profit);
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.payload.sku, 'RHO1540');
  assert.strictEqual(built.payload.site, 'Amazon.com');
  assert.strictEqual(built.payload.sale_status, '正常销售');
  assert.strictEqual(built.payload.price_raw, '11.990');
  assert.strictEqual(built.payload.price_apply, '12.99');
  assert.strictEqual(built.payload.profit_raw, '0.2519');
  assert.strictEqual(built.payload.profit_raw_sea, '0.3953');
  assert.strictEqual(built.payload.profit_apply, '0.2948');
  assert.strictEqual(built.payload.profit_apply_sea, '0.4272');
  assert.strictEqual(built.payload.float_price, '0.0834');
  assert.strictEqual(built.payload.remark, '可卖低 涨价');
  assert.strictEqual(built.payload['variant_sku[]'], '');
  assert.strictEqual(built.body.includes('%E5%8F%AF%E5%8D%96%E4%BD%8E+%E6%B6%A8%E4%BB%B7'), true);
  assert.strictEqual(built.body.includes('x-csrf-token'), false);
}

{
  const action = {
    sku: 'SKU-1',
    id: 'SKU-1',
    actionType: 'price',
    currentPrice: 10,
    suggestedPrice: 12.5,
    remark: '涨价',
    priceIntent: 'inventory_protection',
    adCoupling: { direction: 'down', reason: 'slow sell-through' },
  };
  const result = validatePriceAction(action);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes('price_change_too_large'));

  const forced = validatePriceAction({ ...action, forceExecute: true, forceReason: 'manual confirmed' });
  assert.strictEqual(forced.ok, true);
  assert.ok(forced.warnings.includes('large_price_change_forced'));
}

{
  const action = {
    sku: 'WAR0228',
    id: 'WAR0228',
    site: 'Amazon.com',
    currentPrice: 50.99,
    suggestedPrice: 53.54,
    remark: 'inventory protection price raise',
    priceIntent: 'inventory_protection',
    adCoupling: { direction: 'down', reason: 'protect tight inventory' },
  };
  const validation = validatePriceAction(action);
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.suggestedPrice, 53.99);
  assert.strictEqual(validation.direction, 'up');
  assert.ok(validation.warnings.includes('price_target_normalized_to_99'));

  const built = buildApplyPricePayload(action, {
    sku: 'WAR0228',
    site: 'Amazon.com',
    price: '50.99',
    profit_raw: '0.2100',
    profit_raw_sea: '0.3400',
    account: 'WAR',
    developer_num: 'DB000',
    seller_num: 'HJ17',
  }, { profit: '0.2600', profitSea: '0.3900' });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.payload.price_apply, '53.99');
  assert.strictEqual(built.payload.float_price, '0.0588');
}

{
  const defaulted = normalizeAdCoupling({
    priceIntent: 'ad_space_expansion',
    currentPrice: 20,
    suggestedPrice: 22,
  });
  assert.strictEqual(defaulted.direction, 'up');
  assert.ok(defaulted.allowedAdActions.includes('raise_bid'));
  assert.ok(defaulted.blockedAdActions.includes('lower_budget'));

  const validation = validatePriceAction({
    sku: 'SKU-2',
    id: 'SKU-2',
    actionType: 'price',
    currentPrice: 20,
    suggestedPrice: 22,
    remark: '扩广告',
    priceIntent: 'ad_space_expansion',
    adCoupling: { direction: 'down', reason: 'wrong direction' },
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('ad_coupling_direction_conflicts_with_price_intent'));
}

console.log('price_executor tests passed');
