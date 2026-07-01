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
const type = String(process.argv[3] || 'fba').trim().toLowerCase();
const region = String(process.argv[4] || 'us').trim().toLowerCase();
const outputFile = process.argv[5] || path.join(
  OUT_DIR,
  type === 'local'
    ? `unsellable_local_detail_all_${sellers.join('_')}_${new Date().toISOString().slice(0, 10)}_live.json`
    : `unsellable_fba_detail_all_${sellers.join('_')}_${region}_${new Date().toISOString().slice(0, 10)}_live.json`
);
const limit = Number(process.env.LIMIT || 1000);

if (!['fba', 'local'].includes(type)) {
  throw new Error('Usage: node scripts/execute/fetch_unsellable_details.js <seller-csv> <fba|local> [region=us] [output.json]');
}

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

async function fetchDetails() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const args = ${JSON.stringify({ sellers, type, region, limit })};
        const cleanTokenState = tokenState => ({
          hasCsrf: !!tokenState.csrf,
          hasInventoryToken: !!tokenState.inventoryToken,
          hasJwtToken: !!tokenState.jwtToken
        });
        const csrf =
          document.querySelector('meta[name="csrf-token"]')?.content ||
          document.querySelector('input[name="_token"]')?.value ||
          window.Laravel?.csrfToken ||
          document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
          '';
        const iframeSrc = [...document.querySelectorAll('iframe')]
          .map(frame => frame.src || '')
          .find(Boolean) || location.href;
        const inventoryToken = (iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '') ||
          localStorage.getItem('surfaceKey') ||
          sessionStorage.getItem('surfaceKey') ||
          '';
        const jwtToken = localStorage.getItem('jwt_token') ||
          sessionStorage.getItem('jwt_token') ||
          '';
        const headers = {
          accept: 'application/json, text/javascript, */*; q=0.01',
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest'
        };
        if (inventoryToken) headers['inventory-token'] = inventoryToken;
        if (jwtToken) headers['jwt-token'] = jwtToken;

        async function getJson(url, params) {
          const qs = new URLSearchParams(params);
          const res = await fetch(url + '?' + qs.toString(), {
            method: 'GET',
            credentials: 'include',
            headers
          });
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

        const details = {};
        for (const seller of args.sellers) {
          const params = {
            page: '1',
            limit: String(args.limit),
            seller_num: seller,
            sku: '',
            asin: '',
            sort: '',
            order: ''
          };
          if (args.type === 'fba') params.region = args.region;
          const url = args.type === 'local'
            ? '/pm/formal/unsellable_new_seller/local_detail_query'
            : '/pm/formal/unsellable_new_seller/fba_detail_query';
          details[seller] = await getJson(url, params);
        }
        return {
          tokenState: cleanTokenState({ csrf, inventoryToken, jwtToken }),
          inputs: args,
          details
        };
      })()
    `;
    const result = await evalInTab(ws, expression, true);
    const payload = {
      generatedAt: new Date().toISOString(),
      tokenState: result?.tokenState || {},
      inputs: result?.inputs || { sellers, type, region, limit },
      endpointGroup: type === 'local'
        ? 'unsellable_new_seller_local_detail_all'
        : 'unsellable_new_seller_fba_detail_all',
      details: result?.details || {},
    };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(JSON.stringify({
      outputFile,
      endpointGroup: payload.endpointGroup,
      tokenState: payload.tokenState,
      sellers: Object.fromEntries(Object.entries(payload.details).map(([seller, detail]) => [
        seller,
        {
          ok: detail.ok,
          status: detail.status,
          code: detail.json?.code,
          count: detail.json?.count,
          rows: Array.isArray(detail.json?.data) ? detail.json.data.length : null,
        },
      ])),
    }, null, 2));
  } finally {
    ws.close();
  }
}

fetchDetails().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
