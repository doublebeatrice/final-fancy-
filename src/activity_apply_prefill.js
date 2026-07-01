const COUPON_ACTIVITY_KIND = {
  standard: 1,
  coupon: 1,
  subscribe_save: 2,
  subscribe: 2,
  reorder: 3,
};

const COUPON_TARGET_SEGMENT = {
  all: 'All customers',
  prime: 'Amazon Prime members',
  student: 'Amazon Student members',
  family: 'Amazon Family members',
  reorder: 'Reorder customers',
};

function text(value) {
  return String(value ?? '').trim();
}

function optionalText(value) {
  const raw = text(value);
  return raw || undefined;
}

function hasOwnAny(input = {}, keys = []) {
  return keys.some(key => Object.prototype.hasOwnProperty.call(input, key));
}

function boolToActivityValue(value, yes = 1, no = 2) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === 'yes' || value === '是' || Number(value) === 1) return yes;
  if (value === false || value === 'false' || value === 'no' || value === '否' || Number(value) === 2) return no;
  return undefined;
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function requireDate(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return raw;
}

function normalizeActivityType(value) {
  const raw = text(value || 'coupon').toLowerCase();
  if (['coupon', 'coupons'].includes(raw)) return 'coupon';
  throw new Error(`unsupported activity type for prefill: ${value || '(empty)'}`);
}

function normalizeCouponType(value) {
  const raw = text(value || 'percent').toLowerCase();
  if (['1', 'percent', 'percentage', 'rate', '%', '百分比减免'].includes(raw)) return 1;
  if (['2', 'amount', 'money', 'fixed', '$', '金额减免'].includes(raw)) return 2;
  throw new Error(`unsupported coupon discount type: ${value}`);
}

function normalizeCouponCascader(input = {}) {
  if (Array.isArray(input.cascaderValue) && input.cascaderValue.length >= 2) {
    return [input.cascaderValue[0], input.cascaderValue[1]];
  }

  const kindKey = text(input.activityKind || input.kind || 'standard').toLowerCase();
  const activityKind = COUPON_ACTIVITY_KIND[kindKey];
  if (!activityKind) throw new Error(`unsupported coupon activity kind: ${kindKey}`);

  if (activityKind === 3) return [3, 'Reorder customers'];

  const segmentKey = text(input.targetedSegment || input.segment || 'all').toLowerCase();
  const segment = COUPON_TARGET_SEGMENT[segmentKey] || optionalText(input.targetedSegment || input.segment);
  if (!segment) throw new Error(`unsupported coupon targeted segment: ${segmentKey}`);
  return [activityKind, segment];
}

function normalizeCouponPrefill(input = {}) {
  const startDate = requireDate(input.startDate || input.start || input.created_at, 'startDate');
  const endDate = requireDate(input.endDate || input.end || input.end_at, 'endDate');
  const couponType = normalizeCouponType(input.couponType || input.discountType);
  const couponValue = numberOrUndefined(input.couponValue || input.discountValue || input.discount);
  if (couponValue === undefined) throw new Error('coupon discount value is required');

  const patch = {
    activity_time: [startDate, endDate],
    cascaderValue: normalizeCouponCascader(input),
    couponType,
    couponValue,
  };

  const budget = numberOrUndefined(input.budget);
  if (budget !== undefined) patch.budget = budget;

  const price = numberOrUndefined(input.price || input.rawPrice);
  if (price !== undefined) patch.price = price;

  const exchangeOnce = boolToActivityValue(input.exchangeOnce ?? input.exchange_once);
  if (exchangeOnce !== undefined) patch.exchange_once = exchangeOnce;

  const multiActivity = boolToActivityValue(input.multiActivity ?? input.multi_activity);
  if (multiActivity !== undefined) patch.multi_activity = multiActivity;

  const investmentDiscount = optionalText(input.investmentDiscount || input.investment_discount);
  if (investmentDiscount) patch.investment_discount = investmentDiscount;

  if (hasOwnAny(input, ['coreKeywords', 'core_keywords', 'keywords'])) {
    patch.core_keywords = text(input.coreKeywords ?? input.core_keywords ?? input.keywords).slice(0, 100);
  }

  const remark = optionalText(input.remark);
  if (remark) patch.remark = remark.slice(0, 500);

  const variationSkus = normalizeSkuList(input.variationSkus || input.variation_sku || input.variationSkusCsv);
  if (variationSkus.length) patch.variationSkus = variationSkus;

  return patch;
}

function normalizeSkuList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
  return [...new Set(text(value).split(/[\s,，;；]+/).map(text).filter(Boolean))];
}

function buildActivityApplyParams(row = {}, plan = {}) {
  const site = text(plan.site || row.salesChannel || row.site || 'Amazon.com');
  const sku = text(plan.sku || row.sku);
  if (!sku) throw new Error('sku is required to open activity apply form');
  return {
    type: normalizeActivityType(plan.activityType || plan.type),
    lowestPrice: text(plan.price || plan.lowestPrice || row.lowestprice || row.lowestPrice),
    rating: text(row.rating),
    reviews: text(row.reviews),
    asin: text(row.asin),
    account: text(row.account),
    salesChannel: site,
    skus: sku,
    seller_num: text(row.seller_num || row.sellerNum),
    account_rating: text(row.account_rating || row.accountRating),
    brandName: text(row.brand_name || row.product_brand_name || row.brandName),
    is_coupon_control: text(row.is_coupon_control),
    control_user_id: text(row.control_user_id),
    backstage_status: text(row.backstage_status),
    root_category: text(row.root_category),
    fulFillable: text(row.fulFillable),
    is_variation: text(row.is_variation),
  };
}

function buildActivityApplyUrl(row = {}, plan = {}) {
  const params = new URLSearchParams(buildActivityApplyParams(row, plan));
  return `https://sellerinventory.yswg.com.cn/report/activityApplyIndex?${params.toString()}`;
}

function normalizeActivityPrefillPlan(input = {}) {
  const activityType = normalizeActivityType(input.activityType || input.type);
  const sku = text(input.sku);
  if (!sku) throw new Error('sku is required');
  if (activityType !== 'coupon') throw new Error(`unsupported activity type for prefill: ${activityType}`);
  return {
    activityType,
    sku,
    site: optionalText(input.site || input.salesChannel),
    formPatch: normalizeCouponPrefill(input.coupon || input),
  };
}

function injectCouponExpose(source) {
  const marker = '\n        return {\n            form,';
  const index = source.lastIndexOf(marker);
  if (index < 0) throw new Error('cannot find applyCoupon setup return marker');
  const expose = `
            window.__codexActivityForms = window.__codexActivityForms || {};
            window.__codexActivityForms.coupon = {
                form,
                isVariation,
                onChangeCouponValue,
                onChangeKeywords,
                onChangeCascader,
                getSnapshot: () => JSON.parse(JSON.stringify(form.value || {}))
            };
`;
  return `${source.slice(0, index)}${expose}${source.slice(index)}`;
}

function redactActivityUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    for (const key of ['Inventory-Token', 'jwt-token', '_token', 'token', 'X-CSRF-TOKEN']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.toString();
  } catch (_) {
    return raw.replace(/([?&](?:Inventory-Token|jwt-token|_token|token|X-CSRF-TOKEN)=)[^&\s]+/gi, '$1[redacted]');
  }
}

module.exports = {
  buildActivityApplyParams,
  buildActivityApplyUrl,
  injectCouponExpose,
  normalizeActivityPrefillPlan,
  normalizeCouponPrefill,
  redactActivityUrl,
};
