const { evaluate, listTabs, openTab } = require('../discovery/lib/cdp');

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

function normalizePriceTargetTo99(currentPrice, suggestedPrice) {
  const current = toNum(currentPrice);
  const suggested = toNum(suggestedPrice);
  if (!Number.isFinite(suggested)) return suggested;
  let normalized = Number((Math.floor(suggested) + 0.99).toFixed(2));
  if (!Number.isFinite(current)) return normalized;

  if (suggested > current && normalized <= current) {
    normalized = Number((Math.floor(current) + 1.99).toFixed(2));
  } else if (suggested < current && normalized >= current) {
    normalized = Number((Math.floor(current) - 0.01).toFixed(2));
  }
  return normalized;
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
  const rawSuggestedPrice = toNum(action.suggestedPrice ?? action.priceApply ?? action.price_apply);
  const suggestedPrice = normalizePriceTargetTo99(currentPrice, rawSuggestedPrice);
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
  if (Number.isFinite(rawSuggestedPrice) && Number.isFinite(suggestedPrice) && Math.abs(rawSuggestedPrice - suggestedPrice) > 0.001) {
    warnings.push('price_target_normalized_to_99');
  }

  if (Number.isFinite(currentPrice) && Number.isFinite(suggestedPrice)) {
    const ratio = Math.abs(suggestedPrice - currentPrice) / currentPrice;
    if (ratio > 0.15) {
      if (forceExecute && forceReason) warnings.push('large_price_change_forced');
      else errors.push('price_change_too_large');
    }
    const suppliedFloat = toNum(action.floatPrice ?? action.float_price);
    if (Number.isFinite(suppliedFloat) && Math.abs(suppliedFloat - ((suggestedPrice - currentPrice) / currentPrice)) > 0.002) {
      if (Number.isFinite(rawSuggestedPrice) && Math.abs(rawSuggestedPrice - suggestedPrice) > 0.001) {
        warnings.push('float_price_recomputed_after_price_normalization');
      } else {
        errors.push('float_price_mismatch');
      }
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
  const suggestedPrice = normalizePriceTargetTo99(currentPrice, action.suggestedPrice ?? action.priceApply ?? action.price_apply);
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
  const inventoryTab = await findOrOpenSellerInventoryTab(tabs, options);
  if (!panelTab) {
    if (inventoryTab) {
      return executePriceActionsInInventoryTab(items, inventoryTab, {
        fallbackReason: 'extension_panel_not_found',
      });
    }
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
    if (inventoryTab) {
      return executePriceActionsInInventoryTab(items, inventoryTab, {
        fallbackReason: error.message || 'price panel execution failed',
      });
    }
    return {
      apiSuccess: 0,
      apiFailed: items.length,
      events: items.map(item => priceFailureEvent(item, error.message || 'price execution failed')),
    };
  }
  if (panelNeedsInventoryFallback(result) && inventoryTab) {
    return executePriceActionsInInventoryTab(items, inventoryTab, {
      fallbackReason: panelFallbackReason(result),
    });
  }
  if (!Array.isArray(result?.events) && inventoryTab) {
    return executePriceActionsInInventoryTab(items, inventoryTab, {
      fallbackReason: result?.error || 'invalid price execution result',
    });
  }
  const events = Array.isArray(result?.events) ? result.events : items.map(item => priceFailureEvent(item, result?.error || 'invalid price execution result'));
  return {
    apiSuccess: events.filter(event => event.apiStatus === 'api_success').length,
    apiFailed: events.filter(event => event.apiStatus !== 'api_success').length,
    events,
  };
}

function findSellerInventoryTab(tabs = []) {
  const sellerTabs = (tabs || []).filter(tab => (
    tab?.webSocketDebuggerUrl &&
    /sellerinventory\.yswg\.com\.cn/.test(String(tab.url || ''))
  ));
  return sellerTabs.find(tab => /sellerinventory\.yswg\.com\.cn\/?$/.test(String(tab.url || ''))) ||
    sellerTabs.find(tab => /\/pm\/formal\/list/.test(String(tab.url || ''))) ||
    sellerTabs[0] ||
    null;
}

async function findOrOpenSellerInventoryTab(tabs = [], options = {}) {
  const existing = findSellerInventoryTab(tabs);
  if (existing || options.openInventoryTab === false) return existing || null;
  try {
    return await openTab('https://sellerinventory.yswg.com.cn/', options.browserUrl, { background: true });
  } catch (_) {
    return null;
  }
}

function panelFallbackReason(result = {}) {
  if (result?.error) return result.error;
  const reasons = (result?.events || [])
    .map(event => String(event.errorReason || '').trim())
    .filter(Boolean);
  return reasons[0] || 'panel_price_execution_failed';
}

function panelNeedsInventoryFallback(result = {}) {
  const events = Array.isArray(result?.events) ? result.events : [];
  if (!events.length) return false;
  return events.every(event => (
    event?.apiStatus !== 'api_success' &&
    /findTab is not defined|ensureInventoryListPage is not defined|fetchAllInventoryDirect is not defined/.test(String(event.errorReason || ''))
  ));
}

async function executePriceActionsInInventoryTab(items = [], inventoryTab, options = {}) {
  const fallbackReason = String(options.fallbackReason || '').trim();
  const expression = `(${inventoryTabExecutorSource()})(${JSON.stringify({ items, fallbackReason })})`;
  let result;
  try {
    const text = await evaluate(inventoryTab, expression, true);
    result = typeof text === 'string' ? JSON.parse(text || '{}') : text;
  } catch (error) {
    const reason = `sellerinventory_direct_failed: ${error.message || 'unknown error'}`;
    return {
      apiSuccess: 0,
      apiFailed: items.length,
      events: items.map(item => priceFailureEvent(item, reason)),
    };
  }
  const events = Array.isArray(result?.events)
    ? result.events
    : items.map(item => priceFailureEvent(item, result?.error || 'invalid sellerinventory direct result'));
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

function inventoryTabExecutorSource() {
  return async function priceInventoryTabExecutor(args) {
    const items = args.items || [];
    const fallbackReason = String(args.fallbackReason || '').trim();
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
    const normalizePriceTargetTo99 = (currentPrice, suggestedPrice) => {
      const current = toNum(currentPrice);
      const suggested = toNum(suggestedPrice);
      if (!Number.isFinite(suggested)) return suggested;
      let normalized = Number((Math.floor(suggested) + 0.99).toFixed(2));
      if (!Number.isFinite(current)) return normalized;
      if (suggested > current && normalized <= current) normalized = Number((Math.floor(current) + 1.99).toFixed(2));
      else if (suggested < current && normalized >= current) normalized = Number((Math.floor(current) - 0.01).toFixed(2));
      return normalized;
    };
    const failEvent = (item, errorReason, extra = {}) => ({
      sku: item.sku || item.id,
      id: item.id || item.sku,
      entityType: 'sku',
      site: item.site || 'Amazon.com',
      apiStatus: 'failed',
      finalStatus: 'failed',
      success: false,
      errorReason: String(errorReason || 'price execution failed'),
      action: item,
      meta: {
        executor: 'sellerinventory_direct',
        fallbackReason,
        ...extra,
      },
    });
    const getRows = json => {
      if (Array.isArray(json?.data)) return json.data;
      if (Array.isArray(json?.data?.list)) return json.data.list;
      if (Array.isArray(json?.data?.rows)) return json.data.rows;
      if (Array.isArray(json?.data?.data)) return json.data.data;
      if (Array.isArray(json?.rows)) return json.rows;
      if (Array.isArray(json?.list)) return json.list;
      return [];
    };
    const normalizeHeaders = raw => {
      const headers = {};
      for (const [key, value] of Object.entries(raw || {})) {
        const name = String(key || '').toLowerCase();
        if (!name || ['host', 'origin', 'referer', 'cookie', 'content-length', 'user-agent'].includes(name)) continue;
        headers[key] = value;
      }
      headers.accept = headers.accept || '*/*';
      headers['content-type'] = headers['content-type'] || headers['Content-Type'] || 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['x-requested-with'] = headers['x-requested-with'] || headers['X-Requested-With'] || 'XMLHttpRequest';
      return headers;
    };
    const findInventoryContext = () => {
      const frames = [...document.querySelectorAll('iframe')]
        .filter(frame => (frame.src || '').includes('/pm/formal/list') && !(frame.src || '').includes('variant_sku'));
      for (const frame of frames) {
        try {
          if (frame.contentWindow && frame.contentDocument) {
            return {
              win: frame.contentWindow,
              doc: frame.contentDocument,
              referrer: frame.src || frame.contentWindow.location.href || location.href,
            };
          }
        } catch (_) {}
      }
      if ((location.href || '').includes('/pm/formal/list')) {
        return { win: window, doc: document, referrer: location.href };
      }
      return null;
    };
    const ensureInventoryContext = async () => {
      let ctx = findInventoryContext();
      if (ctx) return ctx;
      try {
        const index = window.layui?.index || window.top?.layui?.index;
        if (index && typeof index.openTabsPage === 'function') {
          index.openTabsPage('/pm/formal/list', 'formal list');
        }
      } catch (_) {}
      for (let i = 0; i < 40; i += 1) {
        await sleep(250);
        ctx = findInventoryContext();
        if (ctx) return ctx;
      }
      return null;
    };
    const captureListRequest = async ctx => {
      const win = ctx.win;
      const doc = ctx.doc;
      const proto = win.XMLHttpRequest?.prototype;
      if (!proto) return { ok: false, error: 'xml_http_request_not_available' };
      let captured = null;
      const originalOpen = proto.open;
      const originalSend = proto.send;
      const originalSetHeader = proto.setRequestHeader;
      proto.open = function(method, url, ...rest) {
        this.__codexPriceMethod = method;
        this.__codexPriceUrl = url;
        this.__codexPriceHeaders = {};
        return originalOpen.call(this, method, url, ...rest);
      };
      proto.setRequestHeader = function(key, value) {
        this.__codexPriceHeaders = this.__codexPriceHeaders || {};
        this.__codexPriceHeaders[key] = value;
        return originalSetHeader.call(this, key, value);
      };
      proto.send = function(body) {
        if (String(this.__codexPriceUrl || '').includes('/pm/formal/list')) {
          captured = {
            url: new URL(this.__codexPriceUrl, win.location.href).toString(),
            method: this.__codexPriceMethod || 'POST',
            headers: this.__codexPriceHeaders || {},
            body: typeof body === 'string' ? body : '',
            referrer: ctx.referrer || win.location.href,
          };
        }
        return originalSend.call(this, body);
      };
      try {
        const queryButton = doc.querySelector('input.search_btn') ||
          [...doc.querySelectorAll('input,button,[role="button"],[onclick]')]
            .find(el => (el.value || el.innerText || el.textContent || '').replace(/\s+/g, '').toLowerCase() === 'query');
        if (!queryButton) return { ok: false, error: 'inventory_query_button_not_found' };
        queryButton.click();
        for (let i = 0; i < 60 && !captured; i += 1) await sleep(200);
        if (!captured || !captured.body) return { ok: false, error: 'inventory_list_request_not_captured' };
        return { ok: true, ...captured, headers: normalizeHeaders(captured.headers) };
      } finally {
        proto.open = originalOpen;
        proto.send = originalSend;
        proto.setRequestHeader = originalSetHeader;
      }
    };
    const fetchRowsForItem = async (ctx, captured, item) => {
      const params = new URLSearchParams(captured.body || '');
      params.set('sku', normalizeText(item.sku || item.id));
      params.set('page', '1');
      params.set('limit', '20');
      const method = String(captured.method || 'POST').toUpperCase();
      let url = captured.url;
      const init = {
        method,
        credentials: 'include',
        headers: captured.headers || {},
      };
      if (method === 'GET') {
        const parsed = new URL(url, ctx.win.location.href);
        for (const [key, value] of params.entries()) parsed.searchParams.set(key, value);
        url = parsed.toString();
      } else {
        init.body = params.toString();
      }
      const res = await ctx.win.fetch(url, init);
      const bodyText = await res.text();
      if (bodyText.trimStart().startsWith('<')) {
        throw new Error(`inventory backend returned HTML status=${res.status}`);
      }
      let json = null;
      try { json = JSON.parse(bodyText || '{}'); } catch (error) {
        throw new Error(`inventory list parse failed: ${error.message}`);
      }
      const sku = normalizeText(item.sku || item.id);
      const site = normalizeText(item.site || 'Amazon.com');
      return getRows(json).filter(row => {
        const rowSku = normalizeText(row.sku);
        const rowSite = normalizeText(row.site || row.salesChannel || 'Amazon.com');
        return rowSku === sku && (!site || rowSite === site);
      });
    };
    const flattenProfitResult = value => {
      const data = value?.data && typeof value.data === 'object' ? value.data : {};
      return { ...data, ...(value || {}) };
    };
    const estimateProfit = (rawRate, currentPrice, suggestedPrice) => {
      const raw = toNum(rawRate);
      const current = toNum(currentPrice);
      const suggested = toNum(suggestedPrice);
      if (!Number.isFinite(raw) || !Number.isFinite(current) || !Number.isFinite(suggested) || suggested <= 0) return '';
      return ((current * raw) + (suggested - current)) / suggested;
    };
    const buildPayload = (action, row, profitResult) => {
      const currentPrice = toNum(action.currentPrice ?? action.priceRaw ?? action.price_raw ?? pick(row, ['price', 'price_raw', 'salesPrice', 'sale_price', 'lowestprice']));
      const suggestedPrice = normalizePriceTargetTo99(currentPrice, action.suggestedPrice ?? action.priceApply ?? action.price_apply);
      const profitSource = flattenProfitResult(profitResult);
      const profitRaw = action.profitBefore ?? action.profit_raw ?? pick(row, ['profit_raw', 'profitRate', 'profit_rate', 'profit']);
      const profitRawSea = action.profitBeforeSea ?? action.profit_raw_sea ?? pick(row, ['profit_raw_sea', 'seaProfitRate', 'sea_profit_rate', 'profitSea']);
      const estimatedProfit = estimateProfit(profitRaw, currentPrice, suggestedPrice);
      const estimatedProfitSea = estimateProfit(profitRawSea, currentPrice, suggestedPrice);
      const profitApply = pick(profitSource, ['profit', 'profit_apply', 'profitApply'], action.profitAfter ?? action.profit_apply ?? (estimatedProfit === '' ? '' : Number(estimatedProfit).toFixed(4)));
      const profitApplySea = pick(profitSource, ['profitSea', 'profit_sea', 'profit_apply_sea', 'profitApplySea'], action.profitAfterSea ?? action.profit_apply_sea ?? (estimatedProfitSea === '' ? '' : Number(estimatedProfitSea).toFixed(4)));
      const payload = {
        sku: normalizeText(action.sku || row.sku),
        site: normalizeText(action.site || row.site || row.salesChannel) || 'Amazon.com',
        sale_status: normalizeText(action.saleStatus || action.sale_status || row.sale_status || row.saleStatus),
        price_raw: fixedNumber(currentPrice, 3),
        price_apply: fixedNumber(suggestedPrice, 2),
        profit_raw: normalizeText(profitRaw),
        profit_raw_sea: normalizeText(profitRawSea),
        profit_apply: normalizeText(profitApply),
        profit_apply_sea: normalizeText(profitApplySea),
        float_price: fixedNumber((suggestedPrice - currentPrice) / currentPrice, 4),
        is_urgent: normalizeText(action.isUrgent || action.is_urgent || row.is_urgent),
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
    const postForm = async (ctx, endpoint, body, headers, referrer) => {
      const res = await ctx.win.fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer,
        body: typeof body === 'string' ? body : body.toString(),
      });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text || '{}'); } catch (_) {}
      return { ok: res.ok, status: res.status, text, json };
    };

    try {
      const ctx = await ensureInventoryContext();
      if (!ctx) {
        return JSON.stringify({
          ok: false,
          error: 'inventory_list_frame_not_found',
          events: items.map(item => failEvent(item, 'inventory_list_frame_not_found')),
        });
      }
      const captured = await captureListRequest(ctx);
      if (!captured.ok) {
        return JSON.stringify({
          ok: false,
          error: captured.error,
          events: items.map(item => failEvent(item, captured.error)),
        });
      }

      const results = [];
      for (const item of items) {
        let row = null;
        try {
          const rows = await fetchRowsForItem(ctx, captured, item);
          row = rows[0] || null;
        } catch (error) {
          results.push(failEvent(item, error.message || 'inventory_row_fetch_failed'));
          continue;
        }
        if (!row) {
          results.push(failEvent(item, 'inventory_row_not_found'));
          continue;
        }

        const currentPrice = item.currentPrice ?? item.priceRaw ?? item.price_raw ?? pick(row, ['price', 'price_raw', 'salesPrice', 'sale_price', 'lowestprice']);
        const profitPrice = normalizePriceTargetTo99(currentPrice, item.suggestedPrice ?? item.priceApply ?? item.price_apply);
        const profitBody = new URLSearchParams();
        profitBody.set('sku', normalizeText(item.sku || item.id));
        profitBody.set('site', normalizeText(item.site || row.site || row.salesChannel) || 'Amazon.com');
        profitBody.set('price_apply', Number(profitPrice).toFixed(2));

        let profitJson = {};
        try {
          const profitRes = await postForm(ctx, '/pm/formal/applyPriceProfit', profitBody, captured.headers, captured.referrer);
          if (profitRes.ok && !profitRes.text.trimStart().startsWith('<')) profitJson = profitRes.json || {};
        } catch (_) {}

        const built = buildPayload(item, row, profitJson);
        if (!built.ok) {
          results.push(failEvent(item, built.errors.join('; ') || 'build_payload_failed', {
            stage: 'build_payload',
          }));
          continue;
        }

        let apply = null;
        try {
          apply = await postForm(ctx, '/pm/formal/applyPrice', built.body, captured.headers, captured.referrer);
        } catch (error) {
          results.push(failEvent(item, error.message || 'apply_price_failed', {
            stage: 'apply_price',
          }));
          continue;
        }

        await sleep(250);
        let refreshedRow = row;
        try {
          const refreshedRows = await fetchRowsForItem(ctx, captured, item);
          refreshedRow = refreshedRows[0] || row;
        } catch (_) {}

        const applyJson = apply?.json || {};
        const ok = !!(apply?.ok && Number(applyJson.code) === 200);
        const applyId = normalizeText(applyJson.id || applyJson?.data?.id || refreshedRow?.id || refreshedRow?.price_apply_id);
        const expectedPrice = Number(built.payload.price_apply);
        const markerValue = normalizeText(refreshedRow?.today_price_apply || refreshedRow?.price_apply || refreshedRow?.new_price);
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
          resultMessage: applyJson.msg || apply?.text?.slice(0, 300) || '',
          errorReason: ok ? '' : (applyJson.msg || apply?.text?.slice(0, 300) || 'applyPrice failed'),
          priceApplyId: applyId,
          price_apply_time: refreshedRow?.price_apply_time || '',
          today_price_apply: refreshedRow?.today_price_apply || '',
          expectedPrice,
          currentPrice: item.currentPrice,
          suggestedPrice: item.suggestedPrice,
          action: item,
          meta: {
            executor: 'sellerinventory_direct',
            fallbackReason,
            endpoint: '/pm/formal/applyPrice',
            profit_raw: built.payload.profit_raw || '',
            profit_raw_sea: built.payload.profit_raw_sea || '',
            profit_apply: built.payload.profit_apply || '',
            profit_apply_sea: built.payload.profit_apply_sea || '',
            float_price: built.payload.float_price || '',
            price_apply_time: refreshedRow?.price_apply_time || '',
            today_price_apply: refreshedRow?.today_price_apply || '',
            priceApplyId: applyId,
          },
        });
      }
      return JSON.stringify({ ok: true, events: results });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error.message,
        events: items.map(item => failEvent(item, error.message || 'sellerinventory_direct_failed')),
      });
    }
  }.toString();
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
    const normalizePriceTargetTo99 = (currentPrice, suggestedPrice) => {
      const current = toNum(currentPrice);
      const suggested = toNum(suggestedPrice);
      if (!Number.isFinite(suggested)) return suggested;
      let normalized = Number((Math.floor(suggested) + 0.99).toFixed(2));
      if (!Number.isFinite(current)) return normalized;
      if (suggested > current && normalized <= current) normalized = Number((Math.floor(current) + 1.99).toFixed(2));
      else if (suggested < current && normalized >= current) normalized = Number((Math.floor(current) - 0.01).toFixed(2));
      return normalized;
    };
    const buildPayload = (action, row, profitResult) => {
      const currentPrice = toNum(action.currentPrice ?? action.priceRaw ?? action.price_raw ?? pick(row, ['price', 'price_raw', 'salesPrice', 'sale_price']));
      const suggestedPrice = normalizePriceTargetTo99(currentPrice, action.suggestedPrice ?? action.priceApply ?? action.price_apply);
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
          const preflightToNum = value => {
            if (value === undefined || value === null || value === '') return null;
            const n = Number(String(value).replace(/,/g, '').trim());
            return Number.isFinite(n) ? n : null;
          };
          const preflightPriceTargetTo99 = (currentPrice, suggestedPrice) => {
            const current = preflightToNum(currentPrice);
            const suggested = preflightToNum(suggestedPrice);
            if (!Number.isFinite(suggested)) return suggested;
            let normalized = Number((Math.floor(suggested) + 0.99).toFixed(2));
            if (!Number.isFinite(current)) return normalized;
            if (suggested > current && normalized <= current) normalized = Number((Math.floor(current) + 1.99).toFixed(2));
            else if (suggested < current && normalized >= current) normalized = Number((Math.floor(current) - 0.01).toFixed(2));
            return normalized;
          };
          const profitPrice = preflightPriceTargetTo99(action.currentPrice ?? row.price, action.suggestedPrice);
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
          profitBody.set('price_apply', Number(profitPrice).toFixed(2));
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
          const normalizePriceTargetTo99 = (currentPrice, suggestedPrice) => {
            const current = toNum(currentPrice);
            const suggested = toNum(suggestedPrice);
            if (!Number.isFinite(suggested)) return suggested;
            let normalized = Number((Math.floor(suggested) + 0.99).toFixed(2));
            if (!Number.isFinite(current)) return normalized;
            if (suggested > current && normalized <= current) normalized = Number((Math.floor(current) + 1.99).toFixed(2));
            else if (suggested < current && normalized >= current) normalized = Number((Math.floor(current) - 0.01).toFixed(2));
            return normalized;
          };
          const buildPayload = (payloadAction, payloadRow, payloadProfit) => {
            const currentPrice = toNum(payloadAction.currentPrice ?? payloadAction.priceRaw ?? payloadAction.price_raw ?? pick(payloadRow, ['price', 'price_raw', 'salesPrice', 'sale_price']));
            const suggestedPrice = normalizePriceTargetTo99(currentPrice, payloadAction.suggestedPrice ?? payloadAction.priceApply ?? payloadAction.price_apply);
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
  normalizePriceTargetTo99,
  priceDirection,
  validatePriceAction,
};
