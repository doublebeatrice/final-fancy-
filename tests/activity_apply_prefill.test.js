const assert = require('assert');
const {
  buildActivityApplyParams,
  buildActivityApplyUrl,
  injectCouponExpose,
  normalizeActivityPrefillPlan,
  normalizeCouponPrefill,
  redactActivityUrl,
} = require('../src/activity_apply_prefill');

{
  const patch = normalizeCouponPrefill({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    discountType: 'percent',
    discount: '5',
    budget: '200',
    activityKind: 'standard',
    segment: 'all',
    exchangeOnce: true,
    multiActivity: false,
    keywords: 'soccer ball',
    remark: 'Codex prefill only',
  });
  assert.deepStrictEqual(patch.activity_time, ['2026-06-01', '2026-06-07']);
  assert.deepStrictEqual(patch.cascaderValue, [1, 'All customers']);
  assert.strictEqual(patch.couponType, 1);
  assert.strictEqual(patch.couponValue, 5);
  assert.strictEqual(patch.budget, 200);
  assert.strictEqual(patch.exchange_once, 1);
  assert.strictEqual(patch.multi_activity, 2);
  assert.strictEqual(patch.core_keywords, 'soccer ball');
}

{
  const patch = normalizeCouponPrefill({
    start: '2026-06-01',
    end: '2026-06-07',
    couponType: 'amount',
    couponValue: '2.5',
    activityKind: 'reorder',
  });
  assert.deepStrictEqual(patch.cascaderValue, [3, 'Reorder customers']);
  assert.strictEqual(patch.couponType, 2);
  assert.strictEqual(patch.couponValue, 2.5);
}

{
  assert.throws(() => normalizeCouponPrefill({
    startDate: '2026/06/01',
    endDate: '2026-06-07',
    discount: 5,
  }), /startDate must be YYYY-MM-DD/);
}

{
  const plan = normalizeActivityPrefillPlan({
    type: 'coupon',
    sku: 'KZ6722',
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    discount: 5,
  });
  assert.strictEqual(plan.activityType, 'coupon');
  assert.strictEqual(plan.sku, 'KZ6722');
  assert.strictEqual(plan.formPatch.couponValue, 5);
}

{
  const params = buildActivityApplyParams({
    sku: 'KZ6722',
    salesChannel: 'Amazon.com',
    account: 'KZ',
    asin: 'B0GV48BQ52',
    lowestprice: '9.590',
    rating: '4.6',
    reviews: 188,
    seller_num: 'HJ17',
    brand_name: 'Blulu',
    backstage_status: 1,
    root_category: 'Toys & Games',
    fulFillable: 72,
    is_variation: 1,
  }, { type: 'coupon' });
  assert.strictEqual(params.type, 'coupon');
  assert.strictEqual(params.skus, 'KZ6722');
  assert.strictEqual(params.lowestPrice, '9.590');
  assert.strictEqual(params.salesChannel, 'Amazon.com');
  assert.strictEqual(params.brandName, 'Blulu');

  const url = buildActivityApplyUrl({ sku: 'KZ6722', salesChannel: 'Amazon.com' }, { type: 'coupon' });
  assert.ok(url.startsWith('https://sellerinventory.yswg.com.cn/report/activityApplyIndex?'));
  assert.ok(url.includes('type=coupon'));
  assert.ok(url.includes('skus=KZ6722'));
}

{
  const source = `
export default defineComponent({
    setup() {
        const form = ref({});
        const isVariation = ref('2');
        const onChangeCouponValue = () => {};
        const onChangeKeywords = () => {};
        const onChangeCascader = () => {};
        return {
            form,
            onSubmit,
            }
    }
})`;
  const patched = injectCouponExpose(source);
  assert.ok(patched.includes('window.__codexActivityForms.coupon'));
  assert.ok(patched.includes('getSnapshot'));
}

{
  const redacted = redactActivityUrl('https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=secret&jwt-token=jwt&keep=1');
  assert.strictEqual(redacted, 'https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=%5Bredacted%5D&jwt-token=%5Bredacted%5D&keep=1');
}

console.log('activity apply prefill tests passed');
