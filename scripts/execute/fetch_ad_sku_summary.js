const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const siteId = Number(process.argv[2] || process.env.SITE_ID || 4);
const day = Number(process.argv[3] || process.env.DAY || 30);
const skuFilter = String(process.argv[4] || process.env.SKU || '').trim().toUpperCase();
const outputFile = process.argv[5] || path.join(OUT_DIR, `ad_sku_summary_${skuFilter || 'ALL'}_${day}d_${new Date().toISOString().slice(0, 10)}.json`);
const limit = Number(process.env.LIMIT || 500);
const maxPages = Number(process.env.MAX_PAGES || 20);

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

async function fetchAdSkuSummary() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const basePayload = {
    siteId,
    mode: 1,
    day,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'cost',
    order: 'desc',
    page: 1,
    limit,
  };

  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const basePayload = ${JSON.stringify(basePayload)};
      const skuFilter = ${JSON.stringify(skuFilter)};
      const limit = ${JSON.stringify(limit)};
      const maxPages = ${JSON.stringify(maxPages)};
      const all = [];
      let lastJson = null;
      let total = null;
      for (let page = 1; page <= maxPages; page += 1) {
        const payload = { ...basePayload, page, limit };
        const res = await fetch('/product/adSkuSummary', {
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
        lastJson = json;
        const list = json?.data?.data || json?.data?.list || json?.data?.rows || json?.data || json?.list || json?.rows || [];
        if (!Array.isArray(list) || !list.length) break;
        all.push(...list);
        total = json?.data?.total ?? json?.total ?? total;
        if (skuFilter && list.some(row => String(row.sku || row.SKU || '').trim().toUpperCase() === skuFilter)) break;
        if (list.length < limit) break;
        if (total != null && all.length >= Number(total)) break;
      }
      return JSON.stringify({ ok: true, status: 200, payload: basePayload, rows: all, total, pagesFetched: Math.ceil(all.length / limit), json: lastJson });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const rows = Array.isArray(result.rows) ? result.rows : getApiList(result.json || {});
  const filteredRows = skuFilter
    ? rows.filter(row => String(row.sku || row.SKU || '').trim().toUpperCase() === skuFilter)
    : rows;
  const report = {
    exportedAt: new Date().toISOString(),
    source: '/product/adSkuSummary',
    siteId,
    day,
    skuFilter,
    ok: !!result.ok,
    status: result.status,
    payload: basePayload,
    rowCount: filteredRows.length,
    totalReturnedRows: rows.length,
    totalAvailableRows: result.total ?? null,
    pagesFetched: result.pagesFetched ?? null,
    rows: filteredRows,
    raw: result.json || result,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

fetchAdSkuSummary()
  .then(report => {
    console.log(JSON.stringify({
      outputFile,
      source: report.source,
      siteId: report.siteId,
      day: report.day,
      skuFilter: report.skuFilter || null,
      ok: report.ok,
      status: report.status,
      rowCount: report.rowCount,
      totalReturnedRows: report.totalReturnedRows,
      totalAvailableRows: report.totalAvailableRows,
      pagesFetched: report.pagesFetched,
      sampleKeys: report.rows[0] ? Object.keys(report.rows[0]).slice(0, 40) : [],
      sample: report.rows[0] || null,
    }, null, 2));
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
