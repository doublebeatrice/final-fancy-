const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

const campaignId = String(process.argv[2] || '').trim();
const accountId = String(process.argv[3] || '').trim();
const siteId = Number(process.argv[4] || process.env.SITE_ID || 4);
const rangeArgA = process.argv[5] || process.env.DATE_START || process.env.DAYS || '7';
const rangeArgB = process.argv[6] || process.env.DATE_END || '';
const outputFile = process.argv[7] || path.join(OUT_DIR, `campaign_placement_${campaignId || 'UNKNOWN'}_${new Date().toISOString().slice(0, 10)}.json`);

if (!campaignId || !accountId) {
  throw new Error('Usage: node scripts/execute/fetch_campaign_placement.js <campaignId> <accountId> [siteId=4] [days=7 | startYmd] [endYmd] [output.json]');
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
  return defaultDateRange(Number(argA || 7));
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

async function fetchCampaignPlacement() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const selectDate = resolveDateRange(rangeArgA, rangeArgB);
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const url = new URL('/placement/findAllPlacement', location.origin);
      url.searchParams.set('campaignId', ${JSON.stringify(campaignId)});
      url.searchParams.set('accountId', ${JSON.stringify(accountId)});
      url.searchParams.set('siteId', ${JSON.stringify(siteId)});
      for (const item of ${JSON.stringify(selectDate)}) url.searchParams.append('selectDate[]', item);
      const res = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { 'x-xsrf-token': decodeURIComponent(xsrf) },
      });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) {
        return JSON.stringify({ ok: false, error: 'ad backend returned HTML; login/session is not ready', status: res.status, url: url.toString() });
      }
      try { return JSON.stringify({ ok: res.ok, status: res.status, url: url.toString(), json: JSON.parse(text) }); }
      catch (error) { return JSON.stringify({ ok: false, error: error.message, status: res.status, text: text.slice(0, 1000), url: url.toString() }); }
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const result = JSON.parse(raw || '{}');
  const rows = getApiList(result.json || {});
  const report = {
    exportedAt: new Date().toISOString(),
    source: '/placement/findAllPlacement',
    campaignId,
    accountId,
    siteId,
    dateRange: selectDate,
    ok: !!result.ok,
    status: result.status,
    rowCount: rows.length,
    rows,
    raw: result.json || result,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

fetchCampaignPlacement()
  .then(report => {
    console.log(JSON.stringify({
      outputFile,
      campaignId: report.campaignId,
      accountId: report.accountId,
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
