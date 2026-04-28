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
const property = String(process.argv[6] || '1').trim();
const tableNameArg = String(process.argv[7] || '').trim();
const rangeArgA = process.argv[8] || process.env.DATE_START || process.env.DAYS || '30';
const rangeArgB = process.argv[9] || process.env.DATE_END || '';
const outputFile = process.argv[10] || path.join(OUT_DIR, `ad_group_rows_${campaignId || 'UNKNOWN'}_${adGroupId || 'UNKNOWN'}_p${property}_${new Date().toISOString().slice(0, 10)}.json`);

if (!campaignId || !adGroupId || !accountId) {
  throw new Error('Usage: node scripts/execute/fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> [siteId=4] [property=1] [tableName=-] [days=30 | startYmd] [endYmd] [output.json]');
}

const PROPERTY_LABELS = {
  1: 'spKeyword',
  2: 'spAutoTarget',
  3: 'spManualTarget',
  4: 'sbKeyword',
  6: 'sbTarget',
};

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

function resolveTableName(prop, raw) {
  if (raw && raw !== '-' && raw.toLowerCase() !== 'null') return raw;
  if (prop === '2') return 'product_target';
  if (prop === '3') return 'product_manual_target';
  return '';
}

async function fetchAdGroupRows() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const selectDate = resolveDateRange(rangeArgA, rangeArgB);
  const tableName = resolveTableName(property, tableNameArg);
  const expression = `
    (async () => {
      const selectDate = ${JSON.stringify(selectDate)};
      const property = ${JSON.stringify(property)};
      const tableName = ${JSON.stringify(tableName)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
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
      const basePayload = {
        siteId: ${JSON.stringify(siteId)},
        timeRange: [
          new Date(selectDate[0] + 'T00:00:00').getTime(),
          new Date(new Date(selectDate[1] + 'T00:00:00').getTime() + 86400000).getTime()
        ],
        state: ['4', '6'].includes(property) ? '1' : '4',
        coreMark: '0',
        userName: ['HJ17', 'HJ171', 'HJ172'],
        level: 'seller_num',
        publicAdv: '2',
        lowCost: 2,
        accountId: ${JSON.stringify(accountId)},
        campaignId: ${JSON.stringify(campaignId)},
        adGroupId: ${JSON.stringify(adGroupId)},
        property,
        selectDate,
        field: 'Spend',
        order: 'desc',
        page: 1,
        limit: 500,
        filterArray: { campaignState: ['4', '6'].includes(property) ? '1' : '4' },
      };
      if (tableName) basePayload.tableName = tableName;
      const targetRows = [];
      const targetPages = [];
      for (let page = 1; page <= 20; page += 1) {
        const response = await postJson('/keyword/findAllNew', { ...basePayload, page });
        const list = getList(response.json || {});
        targetPages.push({ page, ok: response.ok, status: response.status, rowCount: list.length, total: response.json?.count || response.json?.data?.total || response.json?.total || null, error: response.error || null });
        if (page === 1 && !response.ok) return JSON.stringify({ ok: false, selectDate, property, tableName, targetPages, targetRows, targetResponse: response });
        targetRows.push(...list);
        if (list.length < 500) break;
      }
      const searchQuery = {
        campaignId: ${JSON.stringify(campaignId)},
        adGroupId: ${JSON.stringify(adGroupId)},
        accountId: ${JSON.stringify(accountId)},
        siteId: ${JSON.stringify(siteId)},
        selectDate,
        field: 'Spend',
        order: 'desc',
        page: 1,
        limit: 500,
      };
      const customerSearchTerms = await getJson('/customerSearch/targetFindAll', searchQuery);
      const filteredTargetRows = targetRows.filter(row =>
        String(row?.campaignId || '') === ${JSON.stringify(campaignId)} &&
        String(row?.adGroupId || '') === ${JSON.stringify(adGroupId)}
      );
      return JSON.stringify({
        ok: true,
        selectDate,
        property,
        tableName,
        targetPages,
        allTargetRowCount: targetRows.length,
        targetRows: filteredTargetRows,
        customerSearchTerms,
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
      targetRows: '/keyword/findAllNew',
      customerSearchTerms: '/customerSearch/targetFindAll',
    },
    type: PROPERTY_LABELS[property] || `property${property}`,
    campaignId,
    adGroupId,
    accountId,
    siteId,
    property,
    tableName: result.tableName || resolveTableName(property, tableNameArg),
    dateRange: result.selectDate || selectDate,
    ok: !!result.ok,
    allTargetRowCount: Number(result.allTargetRowCount || 0),
    targetRowCount: Array.isArray(result.targetRows) ? result.targetRows.length : 0,
    customerSearchRowCount: Array.isArray(result.customerSearchRows) ? result.customerSearchRows.length : 0,
    targetRows: result.targetRows || [],
    customerSearchRows: result.customerSearchRows || [],
    pages: result.targetPages || [],
    raw: result,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

fetchAdGroupRows()
  .then(report => {
    console.log(JSON.stringify({
      outputFile,
      type: report.type,
      campaignId: report.campaignId,
      adGroupId: report.adGroupId,
      accountId: report.accountId,
      siteId: report.siteId,
      property: report.property,
      tableName: report.tableName,
      dateRange: report.dateRange,
      ok: report.ok,
      allTargetRowCount: report.allTargetRowCount,
      targetRowCount: report.targetRowCount,
      customerSearchRowCount: report.customerSearchRowCount,
      targetSampleKeys: report.targetRows[0] ? Object.keys(report.targetRows[0]).slice(0, 40) : [],
      customerSearchSampleKeys: report.customerSearchRows[0] ? Object.keys(report.customerSearchRows[0]).slice(0, 40) : [],
      targetSample: report.targetRows[0] || null,
      customerSearchSample: report.customerSearchRows[0] || null,
      pages: report.pages,
    }, null, 2));
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
