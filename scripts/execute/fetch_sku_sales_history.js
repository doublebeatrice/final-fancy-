const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { parseSkuSalesHistoryHtml } = require('../../extension/sales_history_parser');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const asin = String(process.argv[2] || '').trim();
const site = String(process.argv[3] || 'Amazon.com').trim();
const sku = String(process.argv[4] || '').trim();
const fbaRemoteFlag = String(process.argv[5] || '否').trim();
const outputFile = process.argv[6] || path.join(OUT_DIR, `sku_sales_history_${sku || 'UNKNOWN'}_${new Date().toISOString().slice(0, 10)}.json`);

if (!asin || !sku) {
  throw new Error('Usage: node scripts/execute/fetch_sku_sales_history.js <asin> <site=Amazon.com> <sku> [fba_remote_flag=否] [output.json]');
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
    throw new Error('Cannot find a browser tab on port 9222. Open sellerinventory.yswg.com.cn in the debug Chrome first.');
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

async function fetchSalesHistory() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const params = new URLSearchParams({
          asin: ${JSON.stringify(asin)},
          site: ${JSON.stringify(site)},
          sku: ${JSON.stringify(sku)},
          fba_remote_flag: ${JSON.stringify(fbaRemoteFlag)}
        });
        const url = 'https://sellerinventory.yswg.com.cn/pm/formal/getSalesHistoryList?' + params.toString();
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, url, text };
      })()
    `;
    const response = await evalInTab(ws, expression, true);
    const parsed = parseSkuSalesHistoryHtml(response?.text || '', { asin, site, sku }, { currentDate: process.env.AD_OPS_CURRENT_DATE || undefined });
    const result = {
      ok: !!response?.ok,
      status: response?.status,
      url: response?.url,
      sku,
      asin,
      site,
      fbaRemoteFlag,
      rows: parsed.rows,
      summary: parsed.summary,
      parseWarning: parsed.parseWarning,
      rawHtmlSnippet: parsed.rawHtmlSnippet || String(response?.text || '').slice(0, 1200),
    };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      outputFile,
      rows: result.rows.length,
      parseWarning: result.parseWarning || '',
      summary: result.summary,
    }, null, 2));
  } finally {
    ws.close();
  }
}

fetchSalesHistory().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
