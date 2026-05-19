const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const SUCCESS_ENDPOINT = '/pm/product/sellerSuccess';

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultWindow(today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth(), 0);
  return {
    startYmd: formatYmd(start),
    endYmd: formatYmd(end),
  };
}

function parseCli(argv) {
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

function normalizeDateTime(value, isEnd) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text} ${isEnd ? '23:59:59' : '00:00:00'}`;
  }
  return text;
}

function dateFolderName(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  return `${Number(match[2])}-${Number(match[3])}`;
}

function getRawDailyDir(depositYmd) {
  const rawDailyRoot = path.join(
    ROOT,
    '\u9ec4\u6210\u5586\u4e2a\u4eba\u6570\u636e\u8d8b\u52bf',
    '\u539f\u6570\u636e',
    '\u539f\u65e5\u6570\u636e'
  );
  if (!fs.existsSync(path.dirname(rawDailyRoot))) return null;
  return path.join(rawDailyRoot, dateFolderName(depositYmd));
}

const { options, positional } = parseCli(process.argv.slice(2));
const defaultDates = defaultWindow();
const seller = String(options.seller || positional[0] || 'HJ17').trim();
const startYmd = String(options.start || options.fuldate_min || positional[1] || defaultDates.startYmd).slice(0, 10);
const endYmd = String(options.end || options.fuldate_max || positional[2] || defaultDates.endYmd).slice(0, 10);
const depositYmd = String(options.depositDate || options['deposit-date'] || positional[3] || formatYmd(new Date())).slice(0, 10);
const fuldateMin = normalizeDateTime(options.fuldate_min || options.start || positional[1] || startYmd, false);
const fuldateMax = normalizeDateTime(options.fuldate_max || options.end || positional[2] || endYmd, true);
const outputBase = `seller_success_rate_${seller}_${depositYmd}`;
const outputFile = options.out || path.join(SNAPSHOT_DIR, `${outputBase}.json`);
const csvFile = options.csv || path.join(SNAPSHOT_DIR, `${outputBase}.csv`);

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function findInventoryTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on port 9222. Run npm run chrome:debug and log in to sellerinventory.yswg.com.cn first.');
  }
  return tab;
}

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, 120000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const result = response.result?.result;
      if (result?.subtype === 'error') return reject(new Error(result.description || 'DevTools evaluation error'));
      resolve(result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

function computeRate(row) {
  if (!row) return { successRate: null, successRatePercent: '' };
  const total = Number(row.total);
  const success = Number(row.success);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(success)) {
    return { successRate: null, successRatePercent: '' };
  }
  const successRate = success / total;
  return {
    successRate,
    successRatePercent: `${(successRate * 100).toFixed(2)}%`,
  };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, payload) {
  const row = payload.targetRow || {};
  const headers = [
    'deposit_date',
    'seller',
    'fuldate_min',
    'fuldate_max',
    'total',
    'success',
    'failure',
    'inspect',
    'success_rate',
    'success_rate_percent',
    'seller_title',
    'source_endpoint',
    'generated_at',
  ];
  const values = [
    payload.depositDate,
    payload.seller,
    payload.window.fuldateMin,
    payload.window.fuldateMax,
    row.total,
    row.success,
    row.failure,
    row.inspect,
    payload.successRate,
    payload.successRatePercent,
    row.seller_title,
    SUCCESS_ENDPOINT,
    payload.generatedAt,
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `\uFEFF${headers.join(',')}\n${values.map(csvEscape).join(',')}\n`, 'utf8');
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
}

async function fetchSellerSuccessRate() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const args = ${JSON.stringify({ seller, fuldateMin, fuldateMax })};
        const cleanTokenState = tokenState => ({
          hasCsrf: !!tokenState.csrf,
          hasInventoryToken: !!tokenState.inventoryToken,
          hasJwtToken: !!tokenState.jwtToken
        });
        const findStorageValue = (patterns, validator = value => !!value) => {
          const stores = [localStorage, sessionStorage];
          for (const store of stores) {
            for (let i = 0; i < store.length; i++) {
              const key = store.key(i);
              const value = store.getItem(key);
              if (patterns.some(pattern => pattern.test(key)) && validator(value)) return value;
            }
          }
          for (const store of stores) {
            for (let i = 0; i < store.length; i++) {
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
        const iframeSrc = [...document.querySelectorAll('iframe')]
          .map(frame => frame.src || '')
          .find(src => src.includes('/pm/product/sellerSuccess') || src.includes('Inventory-Token') || src.includes('/pm/formal/list')) || location.href;
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
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest'
        };
        if (inventoryToken) headers['inventory-token'] = inventoryToken;
        if (jwtToken) headers['jwt-token'] = jwtToken;

        const body = new URLSearchParams();
        body.set('page', '1');
        body.set('limit', '30');
        body.set('sellerDept', '');
        body.set('sell_dept_groups', 'HJ');
        body.set('sellerGroup', '');
        body.set('seller', args.seller);
        body.set('sell_depts', '');
        body.set('is_common_product', '');
        body.set('salesChannel', '');
        body.set('type', '');
        body.set('fuldate_min', args.fuldateMin);
        body.set('fuldate_max', args.fuldateMax);
        body.set('special_type', '');
        body.set('salesPrice_min', '');
        body.set('salesPrice_max', '');
        body.set('business_type', '');

        const res = await fetch('${SUCCESS_ENDPOINT}', {
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          headers,
          referrer: iframeSrc,
          body: body.toString()
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return {
          hrefHost: location.host,
          tokenState: cleanTokenState(tokenState),
          requestBody: body.toString(),
          response: {
            ok: res.ok,
            status: res.status,
            isJson: !!json,
            json,
            textPreview: json ? '' : text.replace(/\\s+/g, ' ').slice(0, 220)
          }
        };
      })()
    `;
    const result = await evalInTab(ws, expression, true);
    const responseJson = result?.response?.json;
    const rows = Array.isArray(responseJson?.data) ? responseJson.data : [];
    const targetRow = rows.find(row => String(row.seller_num || '') === seller) || null;
    const rate = computeRate(targetRow);
    const payload = {
      generatedAt: new Date().toISOString(),
      depositDate: depositYmd,
      endpoint: SUCCESS_ENDPOINT,
      seller,
      window: {
        fuldateMin,
        fuldateMax,
        rule: 'default: previous-previous month last day 00:00:00 through previous month last day 23:59:59',
      },
      tokenState: result?.tokenState || {},
      targetRow,
      successRate: rate.successRate,
      successRatePercent: rate.successRatePercent,
      response: result?.response || null,
    };

    writeJson(outputFile, payload);
    writeCsv(csvFile, payload);

    const rawDailyDir = getRawDailyDir(depositYmd);
    const rawOutputs = [];
    if (rawDailyDir) {
      const rawJson = path.join(rawDailyDir, `${outputBase}.json`);
      const rawCsv = path.join(rawDailyDir, `${outputBase}.csv`);
      writeJson(rawJson, payload);
      writeCsv(rawCsv, payload);
      rawOutputs.push(rawJson, rawCsv);
    }

    console.log(JSON.stringify({
      seller,
      window: payload.window,
      targetRow: payload.targetRow,
      successRatePercent: payload.successRatePercent,
      tokenState: payload.tokenState,
      outputFile,
      csvFile,
      rawOutputs,
      response: {
        ok: payload.response?.ok,
        status: payload.response?.status,
        isJson: payload.response?.isJson,
        code: payload.response?.json?.code,
        count: payload.response?.json?.count,
        rowCount: rows.length,
        textPreview: payload.response?.textPreview,
      },
    }, null, 2));
  } finally {
    ws.close();
  }
}

fetchSellerSuccessRate().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
