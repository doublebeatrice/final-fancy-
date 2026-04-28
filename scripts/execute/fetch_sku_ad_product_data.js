const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const sku = String(process.argv[2] || '').trim().toUpperCase();
const siteId = Number(process.argv[3] || process.env.SITE_ID || 4);
const rangeArgA = process.argv[4] || process.env.DATE_START || process.env.DAYS || '30';
const rangeArgB = process.argv[5] || process.env.DATE_END || '';
const outputFile = process.argv[6] || path.join(OUT_DIR, `sku_ad_product_${sku || 'UNKNOWN'}_${new Date().toISOString().slice(0, 10)}.json`);

if (!sku) {
  throw new Error('Usage: node scripts/execute/fetch_sku_ad_product_data.js <SKU> [siteId=4] [days=30 | startYmd] [endYmd] [output.json]');
}

function formatYmd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDateRange(daysBack) {
  // Use yesterday as the end date because ad reporting for today is usually incomplete.
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack + 1);
  return [formatYmd(start), formatYmd(end)];
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function resolveDateRange(argA, argB) {
  if (isYmd(argA) && isYmd(argB)) return [argA, argB];
  return defaultDateRange(Number(argA || 30));
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

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Open the ad backend in the debug Chrome first.');
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
      if (response.error) {
        reject(new Error(JSON.stringify(response.error)));
        return;
      }
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise,
        returnByValue: true,
      },
    }));
  });
}

function getApiList(json) {
  const candidates = [
    json?.data?.data,
    json?.data?.list,
    json?.data?.rows,
    json?.data,
    json?.list,
    json?.rows,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }
  return [];
}

async function fetchSkuAdProductData() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const [start, end] = resolveDateRange(rangeArgA, rangeArgB);
  const payload = {
    selectDate: [start, end],
    mode: 1,
    state: 1,
    siteId,
    sku,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  };

  const expression = `
    (async () => {
      const payload = ${JSON.stringify(payload)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch('/product/adProductData', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-xsrf-token': decodeURIComponent(xsrf),
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) {
        return JSON.stringify({ ok: false, error: 'ad backend returned HTML; login/session is not ready', status: res.status, payload });
      }
      let json;
      try { json = JSON.parse(text); } catch (error) {
        return JSON.stringify({ ok: false, error: error.message, status: res.status, text: text.slice(0, 1000), payload });
      }
      return JSON.stringify({ ok: res.ok, status: res.status, payload, json });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const rows = getApiList(result.json || {});
  const report = {
    exportedAt: new Date().toISOString(),
    source: '/product/adProductData',
    sku,
    siteId,
    days: isYmd(rangeArgA) ? null : Number(rangeArgA || 30),
    dateRange: [start, end],
    ok: !!result.ok,
    status: result.status,
    payload,
    rowCount: rows.length,
    rows,
    raw: result.json || result,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

fetchSkuAdProductData()
  .then(report => {
    console.log(JSON.stringify({
      outputFile,
      sku: report.sku,
      siteId: report.siteId,
      dateRange: report.dateRange,
      ok: report.ok,
      status: report.status,
      rowCount: report.rowCount,
      sampleKeys: report.rows[0] ? Object.keys(report.rows[0]).slice(0, 40) : [],
      sample: report.rows[0] || null,
    }, null, 2));
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
