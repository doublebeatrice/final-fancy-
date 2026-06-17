const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'cas4030_juneteenth_cake_keyword_append_2026-06-08.json');

const PLAN = {
  sku: 'CAS4030',
  asin: 'B0FZSSJL2H',
  accountId: 385,
  siteId: 4,
  campaignId: '136892579815755',
  adGroupId: '176040359409849',
  campaignName: 'kw_freedom day cupcake toppers_cas4030',
  groupName: 'kw_freedom day cupcake toppers_cas4030',
  matchType: 'BROAD',
  bid: 0.24,
  terms: [
    'juneteenth cake toppers',
    'juneteenth cake topper',
    'juneteenth cupcake picks',
    'juneteenth cupcake toppers decorations',
    'juneteenth cake topper decorations',
  ],
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
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || [];
}

async function fetchGroupKeywords(ws) {
  const selectDate = ['2026-06-01', '2026-06-08'];
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

function summarizeRow(row) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType || row.match_type || '',
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
    const beforeTerms = new Set(before.rows.map(row => normalizeTerm(row.keywordText || row.keyword || row.searchTerm)));
    const missingTerms = PLAN.terms.filter(term => !beforeTerms.has(normalizeTerm(term)));
    const built = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.matchType,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      targets: missingTerms.map(value => ({ value, matchType: PLAN.matchType, bid: PLAN.bid })),
    });

    let execution = { skipped: true, reason: 'all target terms already existed', response: null };
    if (missingTerms.length && built.ok) {
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution = {
        skipped: false,
        ok: Number(response?.code) === 200 && responseSuccessCount(response) === missingTerms.length,
        response,
      };
    }

    await new Promise(resolve => setTimeout(resolve, 45000));
    const after = await fetchGroupKeywords(ws);
    const wanted = new Set(PLAN.terms.map(normalizeTerm));
    const landedRows = after.rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeRow);
    const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
    const missingAfter = PLAN.terms.filter(term => !landedTerms.has(normalizeTerm(term)));

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: '2026-06-08',
      evidenceBoundary: 'live ad backend via shared Chrome debug session',
      diagnosis: 'RU2438 B2B auto produced an order from a table-centerpiece query; append narrow table-centerpiece variants to the existing B2B broad lane.',
      plan: PLAN,
      before: {
        rowCount: before.rows.length,
        existingTargetRows: before.rows
          .filter(row => PLAN.terms.map(normalizeTerm).includes(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
          .map(summarizeRow),
      },
      dryRun: built,
      missingTermsBeforeExecution: missingTerms,
      execution,
      readback: {
        rowCount: after.rows.length,
        landedRows,
        missingAfter,
        allLanded: missingAfter.length === 0,
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({
      out: OUT,
      missingTermsBeforeExecution: missingTerms,
      executed: !execution.skipped,
      executionOk: execution.ok || execution.skipped,
      landed: landedRows.map(row => ({ keywordText: row.keywordText, matchType: row.matchType, bid: row.bid, state: row.state })),
      missingAfter,
      responseSuccessCount: responseSuccessCount(execution.response),
    }, null, 2));
    if (missingAfter.length) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
