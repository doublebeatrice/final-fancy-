const http = require('http');
const WebSocket = require('ws');

function usage() {
  console.error([
    'Usage:',
    '  node scripts/execute/write_inventory_season_tag.js <aid> <sku> <tag> [salesChannel]',
    '',
    'Example:',
    '  node scripts/execute/write_inventory_season_tag.js 3105578 KZ6722 "grad-preheat"',
  ].join('\n'));
}

const aid = String(process.argv[2] || '').trim();
const sku = String(process.argv[3] || '').trim();
const value = String(process.argv[4] || '').trim();
const salesChannel = String(process.argv[5] || 'Amazon.com').trim();

if (!aid || !sku || !value) {
  usage();
  process.exit(1);
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

async function writeTag() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const args = ${JSON.stringify({ aid, sku, value, salesChannel })};
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
          .find(src => src.includes('/pm/formal/list') || src.includes('Inventory-Token')) || location.href;
        const inventoryToken = (iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '') ||
          localStorage.getItem('surfaceKey') ||
          sessionStorage.getItem('surfaceKey') ||
          findStorageValue([/inventory/i, /surface/i, /token/i], value => !!value && !String(value).startsWith('eyJ'));
        const jwtToken = localStorage.getItem('jwt_token') ||
          sessionStorage.getItem('jwt_token') ||
          findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));

        const body = new URLSearchParams();
        body.set('aid', args.aid);
        body.set('type', 'input_tag');
        body.set('value', args.value);
        body.set('salesChannel', args.salesChannel);
        body.set('sku', args.sku);

        const headers = {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest',
        };

        const referrer = iframeSrc && iframeSrc.includes('/pm/formal/list') ? iframeSrc : location.href;
        const res = await fetch('https://sellerinventory.yswg.com.cn/pm/formal/update', {
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          headers,
          referrer,
          body: body.toString(),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return {
          ok: res.ok,
          status: res.status,
          json,
          textPreview: json ? '' : text.replace(/\\s+/g, ' ').slice(0, 300),
          tokenState: {
            hasCsrf: !!csrf,
            hasInventoryToken: !!inventoryToken,
            hasJwtToken: !!jwtToken,
            referrerHasInventoryToken: referrer.includes('Inventory-Token='),
          },
          request: {
            aid: args.aid,
            sku: args.sku,
            salesChannel: args.salesChannel,
            type: 'input_tag',
            value: args.value,
          },
        };
      })()
    `;
    return await evalInTab(ws, expression, true);
  } finally {
    ws.close();
  }
}

writeTag()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result?.ok) process.exitCode = 1;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
