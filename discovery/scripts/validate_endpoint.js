#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  OUTPUT_DIR,
  ensureDiscoveryDirs,
  isDangerousText,
  makeOutputName,
  readJson,
  safeFilePart,
  summarizeResponseSample,
  todayYmd,
  writeJson,
} = require('../lib/common');
const { cdpSession, listTabs, openTab } = require('../lib/cdp');
const { classifyEndpointCandidate } = require('../lib/probe_analysis');

const DEFAULT_CANDIDATES = {
  'marketing.clearanceStockIndex': [
    { method: 'POST', path: '/marketing/getAllClearanceStock', params: { page: 1, limit: 20 } },
  ],
  'pm.abnormalDefectiveInventory.index': [
    { method: 'POST', path: '/pm/abnormalDefectiveInventory/getList', params: { page: 1, limit: 20 } },
    { method: 'GET', path: '/pm/authentication/getQuerySelect', params: { type: 'certification' } },
    { method: 'GET', path: '/pm/formal/get_amazon_user_have_accounts', params: { key: 'account_name_info_amazon' } },
    { method: 'GET', path: '/internalControl/get_internal_audit_group', params: {} },
    { method: 'GET', path: '/commonUtil/getInfoFromRedisByKey', params: { key: 'solar_term_festival_info' } },
  ],
  'product_line.sellerCoreData': [
    { method: 'GET', path: '/administrator/developer/getSpecialTypeAll', params: {} },
    { method: 'GET', path: '/commonUtil/getInfoFromRedisByKey', params: { key: 'solar_term_festival_info' } },
    { method: 'GET', path: '/pm/formal/get_amazon_user_have_accounts', params: { key: 'account_name_info_amazon' } },
    { method: 'POST', path: '/pm/sale/getBySeller', params: { time: '30', page: 1, limit: 20 } },
  ],
  'product_line.sellerSuccess': [
    { method: 'GET', path: '/administrator/developer/getSpecialTypeAll', params: {} },
    {
      method: 'POST',
      path: '/pm/product/sellerSuccess',
      params: {
        page: 1,
        limit: 20,
        seller: '',
        sellerDept: '',
        sell_depts: '',
        sell_dept_groups: '',
        sellerGroup: '',
        salesChannel: '',
        type: '',
        fuldate_min: '',
        fuldate_max: '',
        special_type: '',
        is_common_product: '',
      },
    },
    { method: 'GET', path: '/pm/product/successSellerDetailList', params: { start: '', end: '', site: '', category: '' } },
    { method: 'GET', path: '/pm/product/sellerSuccessChart', params: { seller_num: '' } },
  ],
  'sales_ranking.index': [
    { method: 'GET', path: '/pm/formal/salesRankingSearch', params: { site: 'Amazon.com', type: 'Home & Kitchen', ranking: 100 } },
  ],
  'searchPerformance.productIndex': [
    { method: 'GET', path: '/searchPerformance/fileSearchPerformance', params: {} },
    { method: 'GET', path: '/searchPerformance/getProductDataArray', params: { site: 'Amazon.com' } },
    { method: 'GET', path: '/searchPerformance/findProductSearchPerformance', params: { page: 1, limit: 20 } },
  ],
};

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function latestRoutesFile() {
  if (!fs.existsSync(OUTPUT_DIR)) return '';
  return fs.readdirSync(OUTPUT_DIR)
    .filter(name => /^routes_.*\.json$/.test(name))
    .map(name => path.join(OUTPUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function resolveRoute(routeId) {
  const routesFile = arg('--routes') || latestRoutesFile();
  const routes = readJson(routesFile, {});
  const found = (routes.routes || []).find(route => route.routeId === routeId || safeFilePart(route.routeId) === safeFilePart(routeId));
  if (!found?.url) throw new Error(`route not found or has no URL: ${routeId}`);
  return found;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evaluateValidationExpression(candidates) {
  return `(async () => {
    const candidates = ${JSON.stringify(candidates)};
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const out = [];
    const appendParams = (url, params) => {
      const full = new URL(url, location.origin);
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '') full.searchParams.set(key, value);
      }
      return full.toString();
    };
    for (const item of candidates) {
      const method = String(item.method || 'GET').toUpperCase();
      const params = item.params || {};
      let url = appendParams(item.path, method === 'GET' ? params : {});
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/plain, */*'
      };
      if (csrf) headers['X-CSRF-TOKEN'] = csrf;
      const options = { method, credentials: 'include', headers };
      if (method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        options.body = new URLSearchParams(params).toString();
      }
      try {
        const response = await fetch(url, options);
        const text = await response.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        out.push({
          path: item.path,
          method,
          params,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type') || '',
          textLength: text.length,
          sample: json || text.slice(0, 2000),
        });
      } catch (error) {
        out.push({ path: item.path, method, params, error: error.message });
      }
    }
    return out;
  })()`;
}

async function main() {
  ensureDiscoveryDirs();
  process.env.READ_ONLY = process.env.READ_ONLY || '1';
  const routeId = arg('--route-id');
  if (!routeId) throw new Error('Usage: node discovery/scripts/validate_endpoint.js --route-id <routeId>');
  const route = resolveRoute(routeId);
  const candidates = DEFAULT_CANDIDATES[route.routeId] || [];
  if (!candidates.length) throw new Error(`no default validation candidates for route: ${route.routeId}`);
  for (const candidate of candidates) {
    const endpointClass = classifyEndpointCandidate(candidate);
    if (endpointClass.risk === 'write_or_sensitive' || isDangerousText(candidate.path)) {
      throw new Error(`refusing to validate write-like endpoint: ${candidate.method} ${candidate.path}`);
    }
  }

  const opened = await openTab(route.url);
  const tabs = await listTabs();
  const tab = tabs.find(item => item.id === opened.id) || opened;
  const session = cdpSession(tab);
  await session.ready();
  try {
    await sleep(Number(arg('--settle-ms', '2500')));
    const result = await session.send('Runtime.evaluate', {
      expression: evaluateValidationExpression(candidates),
      returnByValue: true,
      awaitPromise: true,
      timeout: 30000,
    });
    const validations = (result.result?.value || []).map(item => ({
      ...item,
      responseSummary: summarizeResponseSample(item.sample),
    }));
    const outputFile = path.join(OUTPUT_DIR, makeOutputName('endpoint_validation', route.routeId, todayYmd()));
    writeJson(outputFile, {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      route,
      validations,
    });
    console.log(outputFile);
  } finally {
    session.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
