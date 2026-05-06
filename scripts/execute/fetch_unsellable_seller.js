const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const sellers = String(process.argv[2] || 'HJ17,HJ171,HJ172')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const explicitStartDate = String(process.argv[3] || '').trim();
const endDate = String(process.argv[4] || '');
const outputFile = process.argv[5] || path.join(OUT_DIR, `unsellable_seller_${new Date().toISOString().slice(0, 10)}.json`);

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultStartDate(days = 90) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${formatYmd(date)} 00:00:00`;
}

const startDate = explicitStartDate || defaultStartDate(90);

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
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn')) ||
    tabs.find(item => String(item.url || '').startsWith('http'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on port 9222. Open sellerinventory.yswg.com.cn in debug Chrome first.');
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

function jsonPreview(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').slice(0, 220);
}

async function fetchUnsellable() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const args = ${JSON.stringify({ sellers, startDate, endDate })};
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
          .find(src => src.includes('/pm/formal/unsellable_new_seller') || src.includes('Inventory-Token') || src.includes('/pm/formal/list')) || location.href;
        const inventoryToken = (iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '') ||
          localStorage.getItem('surfaceKey') ||
          sessionStorage.getItem('surfaceKey') ||
          findStorageValue([/inventory/i, /surface/i, /token/i], value => !!value && !String(value).startsWith('eyJ'));
        const jwtToken = localStorage.getItem('jwt_token') ||
          sessionStorage.getItem('jwt_token') ||
          findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));
        const tokenState = { csrf, inventoryToken, jwtToken };
        const sellerParam = args.sellers.join(',');
        const commonHeaders = {
          accept: 'application/json, text/javascript, */*; q=0.01',
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest'
        };
        if (inventoryToken) commonHeaders['inventory-token'] = inventoryToken;
        if (jwtToken) commonHeaders['jwt-token'] = jwtToken;

        async function parseResponse(res) {
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          return {
            ok: res.ok,
            status: res.status,
            isJson: !!json,
            json,
            textPreview: json ? '' : text.replace(/\\s+/g, ' ').slice(0, 220)
          };
        }

        const summaryBody = new URLSearchParams();
        summaryBody.set('page', '1');
        summaryBody.set('limit', '20');
        summaryBody.set('account', '');
        summaryBody.set('sellerDept', '');
        summaryBody.set('sell_dept_groups', '');
        summaryBody.set('sellerGroup', '');
        summaryBody.set('seller', sellerParam);
        summaryBody.set('clearanceSeller', '');

        const summaryRes = await fetch('/pm/formal/unsellable_new_seller/query', {
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          headers: {
            ...commonHeaders,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          referrer: iframeSrc,
          body: summaryBody.toString()
        });

        const chartParams = new URLSearchParams();
        chartParams.set('sellerDept', '');
        chartParams.set('sell_dept_groups', '');
        chartParams.set('sellerGroup', '');
        chartParams.set('seller', sellerParam);
        chartParams.set('clearanceSeller', '');
        chartParams.set('start_date', args.startDate);
        chartParams.set('end_date', args.endDate);
        chartParams.set('limit', '20');
        const chartRes = await fetch('/pm/formal/unsellable_new_seller/change_chart_query?' + chartParams.toString(), {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          headers: {
            ...commonHeaders,
            accept: '*/*'
          },
          referrer: iframeSrc
        });

        return {
          hrefHost: location.host,
          tokenState: cleanTokenState(tokenState),
          inputs: args,
          summary: await parseResponse(summaryRes),
          chart: await parseResponse(chartRes)
        };
      })()
    `;
    const result = await evalInTab(ws, expression, true);
    const payload = {
      generatedAt: new Date().toISOString(),
      endpointGroup: 'unsellable_new_seller',
      inputs: result?.inputs || { sellers, startDate, endDate },
      tokenState: result?.tokenState || {},
      summary: result?.summary || { ok: false, textPreview: jsonPreview(result) },
      chart: result?.chart || { ok: false, textPreview: jsonPreview(result) },
    };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
    const summaryRows = Array.isArray(payload.summary?.json?.data)
      ? payload.summary.json.data.length
      : (Array.isArray(payload.summary?.json?.data?.list) ? payload.summary.json.data.list.length : null);
    const chartKeys = payload.chart?.json && typeof payload.chart.json === 'object' ? Object.keys(payload.chart.json).slice(0, 12) : [];
    console.log(JSON.stringify({
      outputFile,
      tokenState: payload.tokenState,
      summary: {
        ok: payload.summary?.ok,
        status: payload.summary?.status,
        isJson: payload.summary?.isJson,
        rows: summaryRows,
        topLevelKeys: payload.summary?.json && typeof payload.summary.json === 'object' ? Object.keys(payload.summary.json).slice(0, 12) : [],
      },
      chart: {
        ok: payload.chart?.ok,
        status: payload.chart?.status,
        isJson: payload.chart?.isJson,
        topLevelKeys: chartKeys,
      },
    }, null, 2));
  } finally {
    ws.close();
  }
}

fetchUnsellable().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
