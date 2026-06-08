const fs = require('fs');
const path = require('path');
const { evaluate, listTabs } = require('../../discovery/lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const ENDPOINT = '/kernel/productAnalysis/query2';
const PROFIT_LAG_MONTHS = 1;

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const eqIndex = item.indexOf('=');
    if (eqIndex >= 0) {
      options[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return { options, positional };
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function dateFromOptions(options = {}) {
  return cleanText(options.date || options.businessDate || options['business-date'] || formatYmd(new Date())).slice(0, 10);
}

function outputFileFor(options = {}, sku, businessDate) {
  if (options.out) return options.out;
  const safeSku = cleanText(sku || 'UNKNOWN').replace(/[^A-Za-z0-9_-]+/g, '_') || 'UNKNOWN';
  return path.join(SNAPSHOT_DIR, `product_analysis_query2_${safeSku}_${businessDate}.json`);
}

function buildRequestBody(input = {}) {
  const params = new URLSearchParams();
  params.set('page', String(positiveInt(input.page, 1)));
  params.set('limit', String(positiveInt(input.limit, 50)));
  params.set('sku', cleanText(input.sku));
  params.set('asin', cleanText(input.asin));
  params.set('parent_asin', cleanText(input.parentAsin || input.parent_asin));
  params.set('origin_fuldate_min', cleanText(input.originFuldateMin || input.origin_fuldate_min));
  params.set('origin_fuldate_max', cleanText(input.originFuldateMax || input.origin_fuldate_max));
  params.set('solr_term', cleanText(input.solrTerm || input.solr_term));
  params.set('departs', cleanText(input.departs));
  params.set('super_group', cleanText(input.superGroup || input.super_group));
  params.set('group', cleanText(input.group));
  params.set('developer_num', cleanText(input.developerNum || input.developer_num));
  params.set('seller_dept', cleanText(input.sellerDept || input.seller_dept));
  params.set('seller_super_group', cleanText(input.sellerSuperGroup || input.seller_super_group));
  params.set('seller_group', cleanText(input.sellerGroup || input.seller_group));
  params.set('seller', cleanText(input.seller || 'HJ17,HJ171,HJ172'));
  for (let i = 0; i <= 12; i += 1) {
    params.set(`refer_profit${i}_min`, cleanText(input[`refer_profit${i}_min`]));
    params.set(`refer_profit${i}_max`, cleanText(input[`refer_profit${i}_max`]));
  }
  params.set('refer_profit_sum_min', cleanText(input.refer_profit_sum_min));
  params.set('refer_profit_sum_max', cleanText(input.refer_profit_sum_max));
  params.set('refer_profit_sum13_min', cleanText(input.refer_profit_sum13_min));
  params.set('refer_profit_sum13_max', cleanText(input.refer_profit_sum13_max));
  return params;
}

function rowsFromResponse(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.data)) return json.data.data;
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.result?.data)) return json.result.data;
  return [];
}

function summarizeRows(rows = [], sku = '') {
  const targetSku = cleanText(sku).toLowerCase();
  const targetRows = targetSku
    ? rows.filter(row => cleanText(row.sku || row.SKU || row.local_sku).toLowerCase() === targetSku)
    : rows;
  const sampleKeys = targetRows[0] ? Object.keys(targetRows[0]).slice(0, 80) : [];
  return {
    rowCount: rows.length,
    targetRowCount: targetRows.length,
    sampleKeys,
  };
}

function safeUrlInfo(rawUrl = '') {
  try {
    const url = new URL(String(rawUrl || ''));
    return {
      origin: url.origin,
      pathname: url.pathname,
    };
  } catch (_) {
    return {
      origin: '',
      pathname: '',
    };
  }
}

async function findSellerInventoryTab(browserUrl) {
  const tabs = await listTabs(browserUrl);
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on Chrome debug port. Run npm run chrome:operator and log in to sellerinventory first.');
  }
  return tab;
}

function browserFetchExpression(args = {}) {
  return `
    (async () => {
      const args = ${JSON.stringify(args)};
      const cleanTokenState = tokenState => ({
        hasCsrf: !!tokenState.csrf,
        hasInventoryToken: !!tokenState.inventoryToken,
        hasJwtToken: !!tokenState.jwtToken
      });
      const findStorageValue = (patterns, validator = value => !!value) => {
        const stores = [localStorage, sessionStorage];
        for (const store of stores) {
          for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            const value = store.getItem(key);
            if (patterns.some(pattern => pattern.test(key)) && validator(value)) return value;
          }
        }
        for (const store of stores) {
          for (let i = 0; i < store.length; i += 1) {
            const value = store.getItem(store.key(i));
            if (validator(value)) return value;
          }
        }
        return '';
      };
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.content ||
        document.querySelector('input[name="_token"]')?.value ||
        window.Laravel?.csrfToken ||
        document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
        '';
      const frameUrls = [...document.querySelectorAll('iframe')].map(frame => frame.src || '');
      const iframeSrc = frameUrls.find(src => src.includes('/kernel/productAnalysis/index2')) ||
        frameUrls.find(src => src.includes('/pm/formal/list') || src.includes('Inventory-Token')) ||
        location.href;
      const inventoryToken = (iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '') ||
        localStorage.getItem('surfaceKey') ||
        sessionStorage.getItem('surfaceKey') ||
        findStorageValue([/inventory/i, /surface/i, /token/i], value => !!value && !String(value).startsWith('eyJ'));
      const jwtToken = localStorage.getItem('jwt_token') ||
        sessionStorage.getItem('jwt_token') ||
        findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));

      const tokenState = { csrf, inventoryToken, jwtToken };
      const headers = {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      };
      if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
      if (inventoryToken) headers['inventory-token'] = inventoryToken;
      if (jwtToken) headers['jwt-token'] = jwtToken;

      const res = await fetch(args.endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer: iframeSrc,
        body: args.body
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      let referrerPath = '';
      try { referrerPath = new URL(iframeSrc, location.origin).pathname; } catch (_) {}
      return {
        hrefHost: location.host,
        referrerPath,
        tokenState: cleanTokenState(tokenState),
        response: {
          ok: res.ok,
          status: res.status,
          isJson: !!json,
          json,
          textPreview: json ? '' : text.replace(/\\s+/g, ' ').slice(0, 300)
        }
      };
    })()
  `;
}

async function fetchProductAnalysis(options = {}) {
  const sku = cleanText(options.sku || options.positionalSku);
  if (!sku && !cleanText(options.asin) && !cleanText(options.parentAsin || options.parent_asin)) {
    throw new Error('Usage: node scripts/execute/fetch_product_analysis_query2.js --sku <SKU> [--seller HJ17,HJ171,HJ172] [--out output.json]');
  }
  const businessDate = dateFromOptions(options);
  const outputFile = outputFileFor(options, sku, businessDate);
  const body = buildRequestBody({
    ...options,
    sku,
    parentAsin: options.parentAsin || options['parent-asin'] || options.parent_asin,
    originFuldateMin: options.originFuldateMin || options['origin-fuldate-min'] || options.origin_fuldate_min,
    originFuldateMax: options.originFuldateMax || options['origin-fuldate-max'] || options.origin_fuldate_max,
  });
  const browserUrl = options.browserUrl || options['browser-url'] || process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222';
  const tab = await findSellerInventoryTab(browserUrl);
  const result = await evaluate(tab, browserFetchExpression({
    endpoint: ENDPOINT,
    body: body.toString(),
  }), true);
  const rows = rowsFromResponse(result?.response?.json);
  const summary = summarizeRows(rows, sku);
  const payload = {
    generatedAt: new Date().toISOString(),
    businessDate,
    endpoint: ENDPOINT,
    request: {
      method: 'POST',
      body: body.toString(),
      browserUrl,
    },
    query: {
      sku,
      asin: cleanText(options.asin),
      parentAsin: cleanText(options.parentAsin || options['parent-asin'] || options.parent_asin),
      seller: cleanText(options.seller || 'HJ17,HJ171,HJ172'),
    },
    interpretation: {
      profitLagMonths: PROFIT_LAG_MONTHS,
      profitFields: 'refer_profit0-12 are closed monthly reference-profit buckets from the frontend table, not real-time current-month profit.',
      currentUse: 'Use inventory quantity, purchase cost, and sales_30 as current SKU pressure signals; cross-check current profit through daily deposited sales-core/ad data.',
    },
    source: {
      activeTab: safeUrlInfo(tab.url),
      hrefHost: result?.hrefHost || '',
      referrerPath: result?.referrerPath || '',
      tokenState: result?.tokenState || {},
    },
    response: result?.response || null,
    summary,
    rows,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
  return { outputFile, payload };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const { outputFile, payload } = await fetchProductAnalysis({
    ...options,
    positionalSku: positional[0],
  });
  console.log(JSON.stringify({
    ok: payload.response?.ok,
    status: payload.response?.status,
    endpoint: payload.endpoint,
    query: payload.query,
    tokenState: payload.source.tokenState,
    interpretation: payload.interpretation,
    response: {
      isJson: payload.response?.isJson,
      code: payload.response?.json?.code,
      msg: payload.response?.json?.msg,
      count: payload.response?.json?.count,
      textPreview: payload.response?.textPreview,
    },
    summary: payload.summary,
    outputFile,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildRequestBody,
  fetchProductAnalysis,
  rowsFromResponse,
  summarizeRows,
};
