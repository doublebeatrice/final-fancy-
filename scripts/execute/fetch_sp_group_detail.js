const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const campaignId = String(process.argv[2] || '').trim();
const adGroupId = String(process.argv[3] || '').trim();
const accountId = String(process.argv[4] || '').trim();
const siteId = Number(process.argv[5] || process.env.SITE_ID || 4);
const rangeArgA = process.argv[6] || process.env.DATE_START || process.env.DAYS || '30';
const rangeArgB = process.argv[7] || process.env.DATE_END || '';
const outputFile = process.argv[8] || path.join(OUT_DIR, `sp_group_detail_${campaignId || 'UNKNOWN'}_${adGroupId || 'UNKNOWN'}_${new Date().toISOString().slice(0, 10)}.json`);

if (!campaignId || !adGroupId || !accountId) {
  throw new Error('Usage: node scripts/execute/fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> [siteId=4] [days=30 | startYmd] [endYmd] [output.json]');
}

function formatYmd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDateRange(daysBack) {
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
      params: { expression, awaitPromise, returnByValue: true },
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

async function fetchSpGroupDetail() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const selectDate = resolveDateRange(rangeArgA, rangeArgB);
  const previousPeriod = Math.max(0, Math.round((new Date(selectDate[1]) - new Date(selectDate[0])) / 86400000));
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      };
      const getList = json => json?.data?.data || json?.data?.list || json?.data?.rows || json?.data || json?.list || json?.rows || [];
      async function postJson(path, payload) {
        const res = await fetch(path, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', payload };
        try { return { ok: res.ok, status: res.status, payload, json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 1000), payload }; }
      }
      async function getJson(path, query) {
        const url = new URL(path, location.origin);
        for (const [key, value] of Object.entries(query)) {
          if (Array.isArray(value)) {
            for (const item of value) url.searchParams.append(key + '[]', item);
          } else {
            url.searchParams.set(key, value);
          }
        }
        const res = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { 'x-xsrf-token': decodeURIComponent(xsrf) } });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', url: url.toString() };
        try { return { ok: res.ok, status: res.status, url: url.toString(), json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 1000), url: url.toString() }; }
      }
      const targetPayload = {
        siteId: ${JSON.stringify(siteId)},
        accountId: ${JSON.stringify(accountId)},
        campaignId: ${JSON.stringify(campaignId)},
        adGroupId: ${JSON.stringify(adGroupId)},
        manualTargetState: 4,
        selectDate: ${JSON.stringify(selectDate)},
        field: 'Spend',
        order: 'desc',
        page: 1,
        limit: 500,
        previousPeriod: ${JSON.stringify(previousPeriod)}
      };
      const searchQuery = {
        campaignId: ${JSON.stringify(campaignId)},
        adGroupId: ${JSON.stringify(adGroupId)},
        accountId: ${JSON.stringify(accountId)},
        siteId: ${JSON.stringify(siteId)},
        selectDate: ${JSON.stringify(selectDate)},
        field: 'Spend',
        order: 'desc',
        page: 1,
        limit: 500,
      };
      const [manualProductTargets, customerSearchTerms] = await Promise.all([
        postJson('/advTarget/findManualProductTarget', targetPayload),
        getJson('/customerSearch/targetFindAll', searchQuery),
      ]);
      return JSON.stringify({
        ok: !!manualProductTargets.ok && !!customerSearchTerms.ok,
        selectDate: ${JSON.stringify(selectDate)},
        previousPeriod: ${JSON.stringify(previousPeriod)},
        manualProductTargets,
        customerSearchTerms,
        manualProductTargetRows: getList(manualProductTargets.json || {}),
        customerSearchRows: getList(customerSearchTerms.json || {}),
      });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const report = {
    exportedAt: new Date().toISOString(),
    source: {
      manualProductTargets: '/advTarget/findManualProductTarget',
      customerSearchTerms: '/customerSearch/targetFindAll',
    },
    campaignId,
    adGroupId,
    accountId,
    siteId,
    dateRange: result.selectDate || selectDate,
    previousPeriod: result.previousPeriod ?? previousPeriod,
    ok: !!result.ok,
    manualProductTargetRowCount: Array.isArray(result.manualProductTargetRows) ? result.manualProductTargetRows.length : 0,
    customerSearchRowCount: Array.isArray(result.customerSearchRows) ? result.customerSearchRows.length : 0,
    manualProductTargetRows: result.manualProductTargetRows || [],
    customerSearchRows: result.customerSearchRows || [],
    raw: result,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

fetchSpGroupDetail()
  .then(report => {
    console.log(JSON.stringify({
      outputFile,
      campaignId: report.campaignId,
      adGroupId: report.adGroupId,
      accountId: report.accountId,
      siteId: report.siteId,
      dateRange: report.dateRange,
      ok: report.ok,
      manualProductTargetRowCount: report.manualProductTargetRowCount,
      customerSearchRowCount: report.customerSearchRowCount,
      manualProductTargetSampleKeys: report.manualProductTargetRows[0] ? Object.keys(report.manualProductTargetRows[0]).slice(0, 40) : [],
      customerSearchSampleKeys: report.customerSearchRows[0] ? Object.keys(report.customerSearchRows[0]).slice(0, 40) : [],
      manualProductTargetSample: report.manualProductTargetRows[0] || null,
      customerSearchSample: report.customerSearchRows[0] || null,
    }, null, 2));
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
