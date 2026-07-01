'use strict';

// Shared helpers for talking to the live ad backend (adv.yswg.com.cn) through a
// Chrome DevTools debug session on 127.0.0.1:9222. Extracted so SP fast-create,
// SBV create, and SKU->account/asin resolution all share one implementation.

const http = require('http');
const WebSocket = require('ws');

const DEBUG_HOST = process.env.ADV_DEBUG_HOST || '127.0.0.1';
const DEBUG_PORT = Number(process.env.ADV_DEBUG_PORT || 9222);

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Run `npm run chrome:ready` and log in first.');
  }
  return tab;
}

function makeWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

// Open a ready-to-use WebSocket against the adv tab.
async function openAdvWs() {
  const tab = await findAdvTab();
  return makeWs(tab.webSocketDebuggerUrl);
}

function evalInTab(ws, expression, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 10000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, timeoutMs);
    function handler(data) {
      let response;
      try { response = JSON.parse(data); } catch (_) { return; }
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      resolve(response.result?.result?.value);
    }
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

// Run an authenticated request against the ad backend from inside the page, so
// the browser's session cookies + XSRF token are used. Returns { status, ok, json }.
async function advRequest(ws, method, pathname, payload = {}) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const request = {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) }
    };
    let url = ${JSON.stringify(pathname)};
    if (${JSON.stringify(method)} === 'GET') {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(${JSON.stringify(payload)})) query.set(key, String(value));
      url += '?' + query.toString();
    } else {
      request.body = ${JSON.stringify(JSON.stringify(payload))};
    }
    const res = await fetch(url, request);
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      return JSON.stringify({ status: res.status, ok: false, json: { code: 0, msg: 'ad backend returned HTML; login/session is not ready' } });
    }
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { code: 0, msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

function apiList(json = {}) {
  const data = json.data || {};
  return data.records || data.data || data.list || data.rows ||
    json.records || json.list || json.rows ||
    (Array.isArray(json.data) ? json.data : []);
}

function ymd(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Resolve a SKU's accountId / asin / siteId and its existing campaigns from the
// live ad backend via /product/adProductData. Only works for SKUs that already
// have ad campaigns; brand-new SKUs return no rows (accountId unknowable here).
async function resolveSkuAccount(ws, sku, siteId = 4, options = {}) {
  const normalizedSku = String(sku || '').trim().toUpperCase();
  if (!normalizedSku) return { ok: false, error: 'sku is required' };
  const end = ymd(new Date(Date.now() - 86400000));
  const start = ymd(new Date(Date.now() - 86400000 * Number(options.days || 30)));
  const payload = {
    selectDate: [start, end],
    mode: 1,
    state: 1,
    siteId: Number(siteId) || 4,
    sku: normalizedSku,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  };
  const res = await advRequest(ws, 'POST', '/product/adProductData', payload);
  const rows = apiList(res.json || {});
  if (!rows.length) {
    return {
      ok: false,
      sku: normalizedSku,
      error: 'no ad rows for sku; cannot resolve accountId/asin live. Pass --account-id and --asin explicitly (SKU may have no existing campaigns).',
      status: res.status,
    };
  }
  const withAccount = rows.find(r => r.accountId) || rows[0];
  const asin = String(
    withAccount.asin ||
    withAccount.skuInvData?.asin ||
    rows.map(r => r.skuInvData?.asin).find(Boolean) || ''
  ).trim().toUpperCase();
  const campaigns = rows.map(r => ({
    campaignId: String(r.campaignId || ''),
    adGroupId: String(r.adGroupId || ''),
    campaignName: String(r.campaignName || r.name || ''),
    groupName: String(r.groupName || ''),
    positionType: String(r.positionType || ''),
    state: r.state,
    campaignState: r.campaignState,
  }));
  return {
    ok: true,
    sku: normalizedSku,
    accountId: Number(withAccount.accountId) || null,
    asin: asin || null,
    siteId: Number(withAccount.siteId) || Number(siteId) || 4,
    campaigns,
    rowCount: rows.length,
  };
}

module.exports = {
  DEBUG_HOST,
  DEBUG_PORT,
  listTabs,
  findAdvTab,
  makeWs,
  openAdvWs,
  evalInTab,
  advRequest,
  apiList,
  ymd,
  resolveSkuAccount,
};
