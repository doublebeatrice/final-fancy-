const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'ro2084_hawaiian_grass_skirts_append_2026-06-15.json');

const PLAN = {
  sku: 'RO2084',
  asin: 'B07QLVNGR4',
  accountId: 141,
  siteId: 4,
  campaignId: '363716610290501',
  adGroupId: '357828511210087',
  campaignName: 'kw_grassskirt_ro2084',
  groupName: 'kw_grassskirt_ro2084',
  matchType: 'EXACT',
  bid: 0.28,
  term: 'hawaiian grass skirts',
  evidence: {
    source: 'auto_grassskirt_ro2084 customer search term, 2026-05-16..2026-06-14 live backend read',
    customerSearchText: 'hawaiian grass skirts',
    sourceTargetId: '302543857530833',
    sourceMatchType: 'close-match',
    clicks: 1,
    spend: 0.24,
    orders: 1,
    sales: 39.98,
    acos: 0.006003,
    bidEvidence: 'actual CST CPC 0.24; auto target CPC 0.286; SKU 30d CPC band around 0.316',
  },
};

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find adv.yswg.com.cn tab on port 9222.');
  return tab;
}

function makeWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function evalInTab(ws, expression, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 10000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, timeoutMs);
    const handler = data => {
      let response;
      try { response = JSON.parse(data); } catch { return; }
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

async function postAdv(ws, pathname, payload) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return JSON.stringify(json || { code: 0, msg: text.slice(0, 1000), httpStatus: res.status });
  })()`;
  const text = await evalInTab(ws, expr);
  try { return JSON.parse(text || '{}'); } catch (error) { return { code: 0, raw: text, parseError: error.message }; }
}

function rowsFromKeywordResponse(response) {
  const data = response?.data || {};
  return data.records || data.data || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || [];
}

async function fetchGroupKeywords(ws) {
  const selectDate = ['2026-05-16', '2026-06-14'];
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    timeRange: [
      new Date(`${selectDate[0]}T00:00:00`).getTime(),
      new Date(new Date(`${selectDate[1]}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: PLAN.accountId,
    campaignId: PLAN.campaignId,
    adGroupId: PLAN.adGroupId,
    property: '1',
    selectDate,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return { response, rows: rowsFromKeywordResponse(response) };
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeMatchType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === '1') return 'EXACT';
  if (text === '2') return 'PHRASE';
  if (text === '3') return 'BROAD';
  return text;
}

function summarizeRow(row) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: normalizeMatchType(row.matchType || row.match_type || ''),
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? row.campaign_state ?? '',
    groupState: row.groupState ?? row.group_state ?? '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
  };
}

function responseSuccessCount(response) {
  return (response?.data?.keyword?.success || response?.data?.success || []).length;
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    const before = await fetchGroupKeywords(ws);
    const existingBefore = before.rows
      .map(summarizeRow)
      .filter(row => normalizeTerm(row.keywordText) === normalizeTerm(PLAN.term));
    const missingBefore = !existingBefore.length;
    const built = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.matchType,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      targets: missingBefore ? [{ value: PLAN.term, matchType: PLAN.matchType, bid: PLAN.bid }] : [],
    });

    let execution = { skipped: true, reason: 'target term already existed', response: null };
    if (missingBefore && built.ok) {
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution = {
        skipped: false,
        ok: Number(response?.code) === 200 && responseSuccessCount(response) === 1,
        response,
      };
    } else if (missingBefore && !built.ok) {
      execution = { skipped: true, reason: 'dry-run build failed', response: null };
    }

    await new Promise(resolve => setTimeout(resolve, 45000));
    const after = await fetchGroupKeywords(ws);
    const landedRows = after.rows
      .map(summarizeRow)
      .filter(row => normalizeTerm(row.keywordText) === normalizeTerm(PLAN.term));
    const exactLandedRows = landedRows.filter(row => row.matchType === PLAN.matchType);
    const allLanded = exactLandedRows.some(row =>
      Number(row.bid) === PLAN.bid &&
      String(row.state) === '1' &&
      String(row.campaignState) === '1' &&
      String(row.groupState) === '1'
    );

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: '2026-06-15',
      evidenceBoundary: 'live ad backend via shared Chrome debug session plus GBrain history for decision boundary',
      diagnosis: 'RO2084 had one converting auto customer search term not present in the manual keyword layer.',
      plan: PLAN,
      before: {
        rowCount: before.rows.length,
        existingBefore,
      },
      dryRun: built,
      execution,
      readback: {
        rowCount: after.rows.length,
        landedRows,
        exactLandedRows,
        allLanded,
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({
      out: OUT,
      missingBefore,
      dryRunOk: built.ok,
      executed: !execution.skipped,
      executionOk: execution.ok || (!missingBefore && execution.skipped),
      responseSuccessCount: responseSuccessCount(execution.response),
      landedRows,
      allLanded,
    }, null, 2));
    if (!allLanded) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
