const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const {
  PROPERTY_CONFIGS,
  buildHighEfficiencyPayload,
  summarizeHighEfficiencyRows,
} = require('../../src/high_efficiency_filter');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const propertyArg = String(process.argv[2] || process.env.PROPERTY || 'all').trim();
const siteId = Number(process.argv[3] || process.env.SITE_ID || 4);
const rangeArgA = process.argv[4] || process.env.DATE_START || process.env.DAYS || '7';
const rangeArgB = process.argv[5] || process.env.DATE_END || '';
const outputFile = process.argv[6] || path.join(OUT_DIR, `high_efficiency_rows_${new Date().toISOString().slice(0, 10)}.json`);

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
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Open the ad backend in debug Chrome first.');
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
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

function parseProperties(value) {
  if (!value || value === 'all') return Object.keys(PROPERTY_CONFIGS);
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function getApiList(json) {
  const candidates = [
    json?.data?.records,
    json?.data?.data,
    json?.data?.list,
    json?.data?.rows,
    json?.records,
    json?.list,
    json?.rows,
    json?.data,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }
  return [];
}

async function fetchHighEfficiencyRows() {
  const properties = parseProperties(propertyArg);
  const payloads = properties.map(property => ({
    property,
    label: PROPERTY_CONFIGS[property]?.label || `property${property}`,
    payload: buildHighEfficiencyPayload({
      property,
      siteId,
      startYmd: rangeArgA,
      endYmd: rangeArgB,
      page: 1,
      limit: 500,
      field: 'Spend',
      order: 'desc',
    }),
  }));

  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const expression = `
    (async () => {
      const payloads = ${JSON.stringify(payloads)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      async function postJson(payload) {
        const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', payload };
        try { return { ok: res.ok, status: res.status, payload, json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 1000), payload }; }
      }
      const reports = [];
      for (const item of payloads) {
        const rows = [];
        const pages = [];
        for (let page = 1; page <= 40; page += 1) {
          const response = await postJson({ ...item.payload, page });
          const list = getList(response.json || {});
          pages.push({ page, ok: response.ok, status: response.status, rowCount: list.length, total: response.json?.count || response.json?.data?.total || response.json?.total || null, error: response.error || null });
          if (page === 1 && !response.ok) break;
          rows.push(...list.map(row => ({ ...row, __adProperty: item.property, __adPropertyLabel: item.label })));
          if (list.length < item.payload.limit) break;
        }
        reports.push({ property: item.property, label: item.label, payload: item.payload, rows, pages });
      }
      return JSON.stringify({ ok: reports.every(report => report.pages[0]?.ok !== false), reports });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const byProperty = {};
  const allRows = [];
  for (const report of result.reports || []) {
    byProperty[report.property] = {
      label: report.label,
      payload: report.payload,
      rowCount: Array.isArray(report.rows) ? report.rows.length : 0,
      summary: summarizeHighEfficiencyRows(report.rows || []),
      rows: report.rows || [],
      pages: report.pages || [],
    };
    allRows.push(...(report.rows || []));
  }
  const output = {
    exportedAt: new Date().toISOString(),
    source: '/keyword/findAllNew',
    filter: 'high_efficiency',
    ok: !!result.ok,
    siteId,
    properties,
    totalRows: allRows.length,
    summary: summarizeHighEfficiencyRows(allRows),
    byProperty,
  };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

if (require.main === module) {
  fetchHighEfficiencyRows()
    .then(report => {
      console.log(JSON.stringify({
        outputFile,
        ok: report.ok,
        siteId: report.siteId,
        properties: report.properties,
        totalRows: report.totalRows,
        skuCount: report.summary.skuCount,
        topSkus: report.summary.skus.slice(0, 20),
      }, null, 2));
    })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = {
  fetchHighEfficiencyRows,
  getApiList,
  parseProperties,
};
