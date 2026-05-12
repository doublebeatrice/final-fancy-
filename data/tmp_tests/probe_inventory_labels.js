const http = require('http');
const WebSocket = require('ws');

function getInventoryPageId() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const page = tabs.find(t => t.type === 'page' && t.url && t.url.startsWith('https://sellerinventory.yswg.com.cn/'));
          if (!page) return reject(new Error('inventory tab not found'));
          resolve(page.id);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const TARGET_SKUS = ['TUR5292', 'TUR8821', 'TUR9541', 'STY2760', 'STY2115', 'STY6101', 'KZ6722', 'QUN5204', 'SHQ3950'];

async function main() {
  const pageId = await getInventoryPageId();
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + pageId);
  await new Promise(r => ws.on('open', r));

  function evalInPage(expr, awaitPromise = true) {
    return new Promise(resolve => {
      const id = Math.floor(Math.random() * 1e9);
      const handler = msg => {
        const r = JSON.parse(msg);
        if (r.id !== id) return;
        ws.off('message', handler);
        resolve(r.result?.result?.value);
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({
        id, method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise }
      }));
    });
  }

  const probeExpr = `
    (async () => {
      const skuList = ${JSON.stringify(TARGET_SKUS)};

      const iframes = Array.from(document.querySelectorAll('iframe'));
      let iframeWin = null;
      let iframeSrc = '';
      for (const f of iframes) {
        try {
          const src = f.src || '';
          if (src.includes('/pm/formal/list')) {
            iframeWin = f.contentWindow;
            iframeSrc = src;
            break;
          }
        } catch(e) {}
      }

      const csrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const inventoryToken = (iframeWin && iframeWin.localStorage && iframeWin.localStorage.getItem('surfaceKey')) || localStorage.getItem('surfaceKey') || sessionStorage.getItem('surfaceKey') || '';
      const jwtToken = (iframeWin && iframeWin.localStorage && iframeWin.localStorage.getItem('jwt_token')) || localStorage.getItem('jwt_token') || sessionStorage.getItem('jwt_token') || '';

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'x-csrf-token': decodeURIComponent(csrf),
        'x-requested-with': 'XMLHttpRequest',
      };
      if (inventoryToken) headers['inventory-token'] = inventoryToken;
      if (jwtToken) headers['jwt-token'] = jwtToken;

      const body = new URLSearchParams();
      body.set('_token', decodeURIComponent(csrf));
      body.set('page', '1');
      body.set('limit', '500');
      body.set('sale_status', '"\\u6b63\\u5e38\\u9500\\u552e","\\u4fdd\\u7559\\u9875\\u9762"');

      const fetchFn = (iframeWin && iframeWin.fetch) || window.fetch;
      try {
        const res = await fetchFn.call(iframeWin || window, '/pm/formal/list', {
          method: 'POST',
          credentials: 'include',
          headers,
          referrer: iframeSrc || location.href,
          body: body.toString(),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch(e) {}
        if (!json) return JSON.stringify({error: 'not_json', sample: text.slice(0, 500)});

        const rows = json.data?.list || json.data || json.list || [];
        const sample = rows[0] || null;
        const allKeys = sample ? Object.keys(sample).sort() : [];

        const matched = rows.filter(r => skuList.includes(r.sku) || skuList.includes(r.raw_sku) || skuList.includes(r.product_sku));

        return JSON.stringify({
          ok: true,
          totalRows: rows.length,
          allKeysCount: allKeys.length,
          allKeys,
          matchedCount: matched.length,
          matched: matched.map(r => ({
            sku: r.sku || r.raw_sku || r.product_sku,
            asin: r.asin,
            opendate: r.opendate,
            labelFields: Object.fromEntries(
              Object.entries(r).filter(([k,v]) =>
                /^is_|^has_|label|tag|parent|child|main|variation|variant|grafting|follow|change|year_product|new_product/i.test(k)
              )
            ),
          })),
        });
      } catch(e) {
        return JSON.stringify({error: e.message, stack: e.stack});
      }
    })()
  `;

  const result = await evalInPage(probeExpr, true);
  console.log(result);
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
