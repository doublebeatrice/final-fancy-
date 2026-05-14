const { evaluate, listTabs } = require('../discovery/lib/cdp');

const PRICE_INTENTS = new Set([
  'ad_space_expansion',
  'inventory_protection',
  'margin_repair',
  'conversion_recovery',
  'seasonal_sell_through',
  'clearance',
  'review',
]);

const DEFAULT_AD_COUPLING = {
  ad_space_expansion: {
    direction: 'up',
    allowedAdActions: ['raise_bid', 'raise_budget', 'raise_placement', 'create_campaign', 'hold'],
    blockedAdActions: ['lower_budget', 'pause'],
  },
  inventory_protection: {
    direction: 'down',
    allowedAdActions: ['lower_bid', 'lower_budget', 'pause_waste', 'hold'],
    blockedAdActions: ['raise_bid', 'raise_budget', 'create_campaign'],
  },
  margin_repair: {
    direction: 'hold',
    allowedAdActions: ['hold', 'lower_waste', 'raise_only_proven_terms'],
    blockedAdActions: ['raise_unproven_traffic'],
  },
  conversion_recovery: {
    direction: 'hold',
    allowedAdActions: ['hold', 'raise_proven_terms_after_conversion_recovers'],
    blockedAdActions: ['raise_wasteful_traffic'],
  },
  seasonal_sell_through: {
    direction: 'up',
    allowedAdActions: ['raise_proven_terms', 'raise_budget_with_cap', 'hold'],
    blockedAdActions: ['raise_broad_waste'],
  },
  clearance: {
    direction: 'hold',
    allowedAdActions: ['hold', 'lower_waste', 'cap_budget'],
    blockedAdActions: ['uncapped_scale'],
  },
  review: {
    direction: 'review',
    allowedAdActions: ['hold'],
    blockedAdActions: ['raise_bid', 'raise_budget', 'create_campaign'],
  },
};

function toNum(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function priceDirection(currentPrice, suggestedPrice) {
  const current = toNum(currentPrice);
  const suggested = toNum(suggestedPrice);
  if (!Number.isFinite(current) || !Number.isFinite(suggested)) return 'unknown';
  if (suggested > current) return 'up';
  if (suggested < current) return 'down';
  return 'same';
}

function normalizedIntent(value) {
  const text = normalizeText(value) || 'review';
  return PRICE_INTENTS.has(text) ? text : 'review';
}

function normalizeAdCoupling(action = {}) {
  const intent = normalizedIntent(action.priceIntent);
  const input = action.adCoupling && typeof action.adCoupling === 'object' ? action.adCoupling : {};
  const defaults = DEFAULT_AD_COUPLING[intent] || DEFAULT_AD_COUPLING.review;
  const checkAfterDays = Array.isArray(input.checkAfterDays) && input.checkAfterDays.length
    ? input.checkAfterDays.map(Number).filter(Number.isFinite)
    : [1, 3, 7];
  return {
    direction: normalizeText(input.direction) || defaults.direction,
    reason: normalizeText(input.reason || action.adCouplingReason || ''),
    allowedAdActions: Array.isArray(input.allowedAdActions) && input.allowedAdActions.length
      ? input.allowedAdActions.map(normalizeText).filter(Boolean)
      : [...defaults.allowedAdActions],
    blockedAdActions: Array.isArray(input.blockedAdActions) && input.blockedAdActions.length
      ? input.blockedAdActions.map(normalizeText).filter(Boolean)
      : [...defaults.blockedAdActions],
    checkAfterDays: checkAfterDays.length ? checkAfterDays : [1, 3, 7],
  };
}

function validatePriceAction(action = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const sku = normalizeText(action.sku || action.id);
  const currentPrice = toNum(action.currentPrice ?? action.priceRaw ?? action.price_raw);
  const suggestedPrice = toNum(action.suggestedPrice ?? action.priceApply ?? action.price_apply);
  const intent = normalizedIntent(action.priceIntent);
  const hasAdCoupling = !!(action.adCoupling && typeof action.adCoupling === 'object');
  const adCoupling = normalizeAdCoupling(action);
  const forceExecute = action.forceExecute === true;
  const forceReason = normalizeText(action.forceReason);

  if (!sku) errors.push('missing_sku');
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) errors.push('missing_current_price');
  if (!Number.isFinite(suggestedPrice) || suggestedPrice <= 0) errors.push('missing_suggested_price');
  if (Number.isFinite(currentPrice) && Number.isFinite(suggestedPrice) && currentPrice === suggestedPrice) errors.push('same_price');
  if (!normalizeText(action.remark)) errors.push('missing_remark');
  if (!PRICE_INTENTS.has(intent) || intent === 'review') errors.push('missing_price_intent');
  if (options.requireAdCoupling && !hasAdCoupling) errors.push('missing_ad_coupling');
  if (hasAdCoupling && !normalizeText(action.adCoupling.reason)) errors.push('missing_ad_coupling_reason');

  if (Number.isFinite(currentPrice) && Number.isFinite(suggestedPrice)) {
    const ratio = Math.abs(suggestedPrice - currentPrice) / currentPrice;
    if (ratio > 0.15) {
      if (forceExecute && forceReason) warnings.push('large_price_change_forced');
      else errors.push('price_change_too_large');
    }
    const suppliedFloat = toNum(action.floatPrice ?? action.float_price);
    if (Number.isFinite(suppliedFloat) && Math.abs(suppliedFloat - ((suggestedPrice - currentPrice) / currentPrice)) > 0.002) {
      errors.push('float_price_mismatch');
    }
  }

  if (intent === 'ad_space_expansion' && adCoupling.direction !== 'up') {
    errors.push('ad_coupling_direction_conflicts_with_price_intent');
  }
  if (intent === 'inventory_protection' && !['down', 'hold'].includes(adCoupling.direction)) {
    errors.push('ad_coupling_direction_conflicts_with_price_intent');
  }
  if (intent === 'clearance' && !['hold', 'down', 'review'].includes(adCoupling.direction)) {
    errors.push('ad_coupling_direction_conflicts_with_price_intent');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    currentPrice,
    suggestedPrice,
    direction: priceDirection(currentPrice, suggestedPrice),
    priceIntent: intent,
    adCoupling,
  };
}

function fixedNumber(value, digits) {
  const n = toNum(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '';
}

function buildApplyPricePayload(action = {}, row = {}, profitResult = {}) {
  const currentPrice = toNum(action.currentPrice ?? action.priceRaw ?? action.price_raw ?? pick(row, ['price', 'price_raw', 'salesPrice', 'sale_price']));
  const suggestedPrice = toNum(action.suggestedPrice ?? action.priceApply ?? action.price_apply);
  const errors = [];
  if (!normalizeText(action.sku || row.sku)) errors.push('missing_sku');
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) errors.push('missing_current_price');
  if (!Number.isFinite(suggestedPrice) || suggestedPrice <= 0) errors.push('missing_suggested_price');
  if (!normalizeText(action.remark)) errors.push('missing_remark');

  const profitApply = pick(profitResult, ['profit', 'profit_apply', 'profitApply'], action.profitAfter ?? action.profit_apply);
  const profitApplySea = pick(profitResult, ['profitSea', 'profit_sea', 'profit_apply_sea', 'profitApplySea'], action.profitAfterSea ?? action.profit_apply_sea);
  const profitRaw = action.profitBefore ?? action.profit_raw ?? pick(row, ['profit_raw', 'profitRate', 'profit_rate', 'profit']);
  const profitRawSea = action.profitBeforeSea ?? action.profit_raw_sea ?? pick(row, ['profit_raw_sea', 'seaProfitRate', 'sea_profit_rate', 'profitSea']);
  for (const [name, value] of [
    ['profit_raw', profitRaw],
    ['profit_raw_sea', profitRawSea],
    ['profit_apply', profitApply],
    ['profit_apply_sea', profitApplySea],
  ]) {
    if (!normalizeText(value)) errors.push(`missing_${name}`);
  }

  const payload = {
    sku: normalizeText(action.sku || row.sku),
    site: normalizeText(action.site || row.site || row.salesChannel) || 'Amazon.com',
    sale_status: normalizeText(action.saleStatus || action.sale_status || row.sale_status || row.saleStatus) || '正常销售',
    price_raw: fixedNumber(currentPrice, 3),
    price_apply: fixedNumber(suggestedPrice, 2),
    profit_raw: normalizeText(profitRaw),
    profit_raw_sea: normalizeText(profitRawSea),
    profit_apply: normalizeText(profitApply),
    profit_apply_sea: normalizeText(profitApplySea),
    float_price: fixedNumber((suggestedPrice - currentPrice) / currentPrice, 4),
    is_urgent: normalizeText(action.isUrgent || action.is_urgent || row.is_urgent) || '否',
    account: normalizeText(action.account || row.account || row.account_num || row.accountNum),
    developer_num: normalizeText(action.developerNum || action.developer_num || row.developer_num || row.developerNum),
    seller_num: normalizeText(action.sellerNum || action.seller_num || row.seller_num || row.sellerNum || row.seller),
    remark: normalizeText(action.remark),
    'variant_sku[]': normalizeText(action.variantSku || action.variant_sku || row.variant_sku),
    malicious_user_id: normalizeText(action.maliciousUserId || action.malicious_user_id),
    min_price: normalizeText(action.minPrice || action.min_price),
    max_price: normalizeText(action.maxPrice || action.max_price),
  };

  for (const key of ['account', 'developer_num', 'seller_num']) {
    if (!payload[key]) errors.push(`missing_${key}`);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) params.append(key, value);
  return {
    ok: errors.length === 0,
    errors,
    payload,
    body: params.toString(),
  };
}

function normalizePriceActionForExecution(action = {}) {
  const validation = validatePriceAction(action);
  return {
    ...action,
    sku: normalizeText(action.sku || action.id),
    id: normalizeText(action.id || action.sku),
    entityType: 'sku',
    actionType: 'price',
    currentPrice: validation.currentPrice,
    suggestedPrice: validation.suggestedPrice,
    direction: validation.direction,
    priceIntent: validation.priceIntent,
    adCoupling: validation.adCoupling,
    validation,
  };
}

async function executePriceActions(actions = {}, options = {}) {
  const items = (Array.isArray(actions) ? actions : []).map(normalizePriceActionForExecution);
  if (!items.length) return { apiSuccess: 0, apiFailed: 0, events: [] };

  const tabs = await listTabs(options.browserUrl);
  const panelTab = tabs.find(tab => /^chrome-extension:\/\//.test(tab.url || '') && /panel\.html/.test(tab.url || ''));
  if (!panelTab) {
    return {
      apiSuccess: 0,
      apiFailed: items.length,
      events: items.map(item => priceFailureEvent(item, 'extension_panel_not_found')),
    };
  }

  const expression = `(${panelExecutorSource()})(${JSON.stringify({ items })})`;
  let result;
  try {
    const text = await evaluate(panelTab, expression, true);
    result = typeof text === 'string' ? JSON.parse(text || '{}') : text;
  } catch (error) {
    return {
      apiSuccess: 0,
      apiFailed: items.length,
      events: items.map(item => priceFailureEvent(item, error.message || 'price execution failed')),
    };
  }
  const events = Array.isArray(result?.events) ? result.events : items.map(item => priceFailureEvent(item, result?.error || 'invalid price execution result'));
  return {
    apiSuccess: events.filter(event => event.apiStatus === 'api_success').length,
    apiFailed: events.filter(event => event.apiStatus !== 'api_success').length,
    events,
  };
}

function priceFailureEvent(item, errorReason) {
  return {
    sku: item.sku || item.id,
    id: item.id || item.sku,
    entityType: 'sku',
    apiStatus: 'failed',
    finalStatus: 'failed',
    success: false,
    errorReason: String(errorReason || 'price execution failed'),
    action: item,
  };
}

function panelExecutorSource() {
  return async function pricePanelExecutor(args) {
    const items = args.items || [];
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const normalizeText = value => String(value ?? '').trim();
    const toNum = value => {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(String(value).replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : null;
    };
    const pick = (obj, keys, fallback = '') => {
      for (const key of keys) {
        const value = obj?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return fallback;
    };
    const fixedNumber = (value, digits) => {
      const n = toNum(value);
      return Number.isFinite(n) ? n.toFixed(digits) : '';
    };
    const buildPayload = (action, row, profitResult) => {
      const currentPrice = toNum(action.currentPrice ?? action.priceRaw ?? action.price_raw ?? pick(row, ['price', 'price_raw', 'salesPrice', 'sale_price']));
      const suggestedPrice = toNum(action.suggestedPrice ?? action.priceApply ?? action.price_apply);
      const profitApply = pick(profitResult, ['profit', 'profit_apply', 'profitApply'], action.profitAfter ?? action.profit_apply);
      const profitApplySea = pick(profitResult, ['profitSea', 'profit_sea', 'profit_apply_sea', 'profitApplySea'], action.profitAfterSea ?? action.profit_apply_sea);
      const profitRaw = action.profitBefore ?? action.profit_raw ?? pick(row, ['profit_raw', 'profitRate', 'profit_rate', 'profit']);
      const profitRawSea = action.profitBeforeSea ?? action.profit_raw_sea ?? pick(row, ['profit_raw_sea', 'seaProfitRate', 'sea_profit_rate', 'profitSea']);
      const payload = {
        sku: normalizeText(action.sku || row.sku),
        site: normalizeText(action.site || row.site || row.salesChannel) || 'Amazon.com',
        sale_status: normalizeText(action.saleStatus || action.sale_status || row.sale_status || row.saleStatus) || '正常销售',
        price_raw: fixedNumber(currentPrice, 3),
        price_apply: fixedNumber(suggestedPrice, 2),
        profit_raw: normalizeText(profitRaw),
        profit_raw_sea: normalizeText(profitRawSea),
        profit_apply: normalizeText(profitApply),
        profit_apply_sea: normalizeText(profitApplySea),
        float_price: fixedNumber((suggestedPrice - currentPrice) / currentPrice, 4),
        is_urgent: normalizeText(action.isUrgent || action.is_urgent || row.is_urgent) || '否',
        account: normalizeText(action.account || row.account || row.account_num || row.accountNum),
        developer_num: normalizeText(action.developerNum || action.developer_num || row.developer_num || row.developerNum),
        seller_num: normalizeText(action.sellerNum || action.seller_num || row.seller_num || row.sellerNum || row.seller),
        remark: normalizeText(action.remark),
        'variant_sku[]': normalizeText(action.variantSku || action.variant_sku || row.variant_sku),
        malicious_user_id: normalizeText(action.maliciousUserId || action.malicious_user_id),
        min_price: normalizeText(action.minPrice || action.min_price),
        max_price: normalizeText(action.maxPrice || action.max_price),
      };
      const errors = [];
      for (const key of ['sku', 'price_raw', 'price_apply', 'profit_raw', 'profit_raw_sea', 'profit_apply', 'profit_apply_sea', 'account', 'developer_num', 'seller_num', 'remark']) {
        if (!payload[key]) errors.push(`missing_${key}`);
      }
      const params = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => params.append(key, value));
      return { ok: errors.length === 0, errors, payload, body: params.toString() };
    };

    try {
      const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
      await ensureInventoryListPage(tab.id);
      const rows = await fetchAllInventoryDirect(tab.id);
      const rowBySku = new Map();
      for (const row of rows || []) {
        const key = `${normalizeText(row.sku)}::${normalizeText(row.site || row.salesChannel || 'Amazon.com')}`;
        if (!rowBySku.has(key)) rowBySku.set(key, row);
      }
      const rowFor = action => rowBySku.get(`${normalizeText(action.sku || action.id)}::${normalizeText(action.site || 'Amazon.com')}`) ||
        (rows || []).find(row => normalizeText(row.sku) === normalizeText(action.sku || action.id)) ||
        null;

      const results = [];
      for (const item of items) {
        const row = rowFor(item);
        if (!row) {
          results.push({
            sku: item.sku || item.id,
            id: item.id || item.sku,
            entityType: 'sku',
            apiStatus: 'failed',
            finalStatus: 'failed',
            success: false,
            errorReason: 'inventory_row_not_found',
            action: item,
          });
          continue;
        }
        const one = await execInTab(tab.id, async (action, row) => {
          const normalizeText = value => String(value ?? '').trim();
          const csrf =
            document.querySelector('meta[name="csrf-token"]')?.content ||
            document.querySelector('input[name="_token"]')?.value ||
            window.Laravel?.csrfToken ||
            document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
            '';
          const referrer = [...document.querySelectorAll('iframe')]
            .map(f => f.src || '')
            .find(src => src.includes('/pm/formal/list')) || location.href;
          const headers = {
            accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
          };
          if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
          const profitBody = new URLSearchParams();
          profitBody.set('sku', normalizeText(action.sku || action.id));
          profitBody.set('site', normalizeText(action.site || row.site || row.salesChannel) || 'Amazon.com');
          profitBody.set('price_apply', Number(action.suggestedPrice).toFixed(2));
          const profitRes = await fetch('/pm/formal/applyPriceProfit', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers,
            referrer,
            body: profitBody.toString(),
          });
          const profitText = await profitRes.text();
          let profitJson = {};
          try { profitJson = JSON.parse(profitText || '{}'); } catch (_) {}
          const toNum = value => {
            if (value === undefined || value === null || value === '') return null;
            const n = Number(String(value).replace(/,/g, '').trim());
            return Number.isFinite(n) ? n : null;
          };
          const pick = (obj, keys, fallback = '') => {
            for (const key of keys) {
              const value = obj?.[key];
              if (value !== undefined && value !== null && String(value).trim() !== '') return value;
            }
            return fallback;
          };
          const fixedNumber = (value, digits) => {
            const n = toNum(value);
            return Number.isFinite(n) ? n.toFixed(digits) : '';
          };
          const buildPayload = (payloadAction, payloadRow, payloadProfit) => {
            const currentPrice = toNum(payloadAction.currentPrice ?? payloadAction.priceRaw ?? payloadAction.price_raw ?? pick(payloadRow, ['price', 'price_raw', 'salesPrice', 'sale_price']));
            const suggestedPrice = toNum(payloadAction.suggestedPrice ?? payloadAction.priceApply ?? payloadAction.price_apply);
            const profitApply = pick(payloadProfit, ['profit', 'profit_apply', 'profitApply'], payloadAction.profitAfter ?? payloadAction.profit_apply);
            const profitApplySea = pick(payloadProfit, ['profitSea', 'profit_sea', 'profit_apply_sea', 'profitApplySea'], payloadAction.profitAfterSea ?? payloadAction.profit_apply_sea);
            const profitRaw = payloadAction.profitBefore ?? payloadAction.profit_raw ?? pick(payloadRow, ['profit_raw', 'profitRate', 'profit_rate', 'profit']);
            const profitRawSea = payloadAction.profitBeforeSea ?? payloadAction.profit_raw_sea ?? pick(payloadRow, ['profit_raw_sea', 'seaProfitRate', 'sea_profit_rate', 'profitSea']);
            const payload = {
              sku: normalizeText(payloadAction.sku || payloadRow.sku),
              site: normalizeText(payloadAction.site || payloadRow.site || payloadRow.salesChannel) || 'Amazon.com',
              sale_status: normalizeText(payloadAction.saleStatus || payloadAction.sale_status || payloadRow.sale_status || payloadRow.saleStatus) || '正常销售',
              price_raw: fixedNumber(currentPrice, 3),
              price_apply: fixedNumber(suggestedPrice, 2),
              profit_raw: normalizeText(profitRaw),
              profit_raw_sea: normalizeText(profitRawSea),
              profit_apply: normalizeText(profitApply),
              profit_apply_sea: normalizeText(profitApplySea),
              float_price: fixedNumber((suggestedPrice - currentPrice) / currentPrice, 4),
              is_urgent: normalizeText(payloadAction.isUrgent || payloadAction.is_urgent || payloadRow.is_urgent) || '否',
              account: normalizeText(payloadAction.account || payloadRow.account || payloadRow.account_num || payloadRow.accountNum),
              developer_num: normalizeText(payloadAction.developerNum || payloadAction.developer_num || payloadRow.developer_num || payloadRow.developerNum),
              seller_num: normalizeText(payloadAction.sellerNum || payloadAction.seller_num || payloadRow.seller_num || payloadRow.sellerNum || payloadRow.seller),
              remark: normalizeText(payloadAction.remark),
              'variant_sku[]': normalizeText(payloadAction.variantSku || payloadAction.variant_sku || payloadRow.variant_sku),
              malicious_user_id: normalizeText(payloadAction.maliciousUserId || payloadAction.malicious_user_id),
              min_price: normalizeText(payloadAction.minPrice || payloadAction.min_price),
              max_price: normalizeText(payloadAction.maxPrice || payloadAction.max_price),
            };
            const errors = [];
            for (const key of ['sku', 'price_raw', 'price_apply', 'profit_raw', 'profit_raw_sea', 'profit_apply', 'profit_apply_sea', 'account', 'developer_num', 'seller_num', 'remark']) {
              if (!payload[key]) errors.push(`missing_${key}`);
            }
            const params = new URLSearchParams();
            Object.entries(payload).forEach(([key, value]) => params.append(key, value));
            return { ok: errors.length === 0, errors, payload, body: params.toString() };
          };
          const built = buildPayload(action, row, profitJson);
          if (!built.ok) return { ok: false, stage: 'build_payload', errors: built.errors, profitJson };
          const applyRes = await fetch('/pm/formal/applyPrice', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers,
            referrer,
            body: built.body,
          });
          const applyText = await applyRes.text();
          let applyJson = {};
          try { applyJson = JSON.parse(applyText || '{}'); } catch (_) {}
          return {
            ok: applyRes.ok && Number(applyJson.code) === 200,
            httpStatus: applyRes.status,
            applyJson,
            profitJson,
            payload: built.payload,
            responseText: applyText.slice(0, 300),
          };
        }, [item, row]);

        await sleep(350);
        let refreshedRow = row;
        try {
          const refreshedRows = await fetchAllInventoryDirect(tab.id);
          refreshedRow = refreshedRows.find(r => normalizeText(r.sku) === normalizeText(item.sku || item.id)) || row;
        } catch (_) {}

        const ok = !!one?.ok;
        const applyId = String(one?.applyJson?.id || one?.applyJson?.data?.id || refreshedRow?.id || refreshedRow?.price_apply_id || '').trim();
        const markerValue = normalizeText(refreshedRow?.today_price_apply || refreshedRow?.price_apply || refreshedRow?.new_price || '');
        const expectedPrice = Number(item.suggestedPrice);
        const markerPrice = Number(markerValue);
        const markerMatches = Number.isFinite(markerPrice) && Math.abs(markerPrice - expectedPrice) < 0.001;
        results.push({
          sku: item.sku || item.id,
          id: applyId || `price::${item.sku || item.id}::${item.site || 'Amazon.com'}`,
          entityType: 'sku',
          site: item.site || 'Amazon.com',
          apiStatus: ok ? 'api_success' : 'failed',
          finalStatus: ok ? (markerMatches || refreshedRow?.price_apply_time || refreshedRow?.is_price_apply ? 'success' : 'application_submitted') : 'failed',
          success: ok,
          resultMessage: one?.applyJson?.msg || one?.responseText || '',
          errorReason: ok ? '' : (one?.errors || [one?.applyJson?.msg || one?.responseText || 'applyPrice failed']).filter(Boolean).join('; '),
          priceApplyId: applyId,
          price_apply_time: refreshedRow?.price_apply_time || '',
          today_price_apply: refreshedRow?.today_price_apply || '',
          expectedPrice,
          currentPrice: item.currentPrice,
          suggestedPrice: item.suggestedPrice,
          action: item,
          meta: {
            endpoint: '/pm/formal/applyPrice',
            profit_raw: one?.payload?.profit_raw || '',
            profit_raw_sea: one?.payload?.profit_raw_sea || '',
            profit_apply: one?.payload?.profit_apply || '',
            profit_apply_sea: one?.payload?.profit_apply_sea || '',
            float_price: one?.payload?.float_price || '',
            price_apply_time: refreshedRow?.price_apply_time || '',
            today_price_apply: refreshedRow?.today_price_apply || '',
            priceApplyId: applyId,
          },
        });
      }
      return JSON.stringify({ ok: true, events: results });
    } catch (error) {
      return JSON.stringify({ ok: false, error: error.message, events: items.map(item => ({
        sku: item.sku || item.id,
        id: item.id || item.sku,
        entityType: 'sku',
        apiStatus: 'failed',
        finalStatus: 'failed',
        success: false,
        errorReason: error.message,
        action: item,
      })) });
    }
  }.toString();
}

module.exports = {
  PRICE_INTENTS,
  buildApplyPricePayload,
  executePriceActions,
  normalizeAdCoupling,
  priceDirection,
  validatePriceAction,
};
