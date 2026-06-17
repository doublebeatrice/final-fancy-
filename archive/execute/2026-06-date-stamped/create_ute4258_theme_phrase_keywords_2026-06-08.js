const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'ute4258_theme_phrase_keywords_2026-06-08.json');

const PLAN = {
  sku: 'UTE4258',
  asin: 'B0GRG9ZXZJ',
  accountId: 468,
  siteId: 4,
  mode: 'keywordTarget',
  coreTerm: 'safari baby shower games',
  matchType: 'PHRASE',
  dailyBudget: 3,
  defaultBid: 0.32,
  keywords: [
    'safari baby shower games',
    'safari baby shower game',
    'safari diaper raffle',
    'safari diaper raffle tickets',
    'jungle baby shower games',
    'neutral baby shower games',
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

async function fetchKeywords(ws, createMeta) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    accountId: PLAN.accountId,
    type: 'spKeyword',
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '1',
    tableName: '',
    dateRange: ['2026-06-08', '2026-06-08'],
    page: 1,
    limit: 500,
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

function extractCreateMeta(response) {
  const data = response?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.adGroupId || ''),
    campaignName: param.campaignName || response?.campaignName || '',
    groupName: param.groupName || response?.groupName || '',
  };
}

async function main() {
  const built = buildSpCreatePayload(PLAN);
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    if (!built.ok) throw new Error(`buildSpCreatePayload failed: ${built.errors.join('; ')}`);
    const response = await postAdv(ws, built.requestUrl, built.requestBody);
    const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
    const createMeta = extractCreateMeta(response);
    if (!createOk || !createMeta.campaignId || !createMeta.adGroupId) {
      const out = { exportedAt: new Date().toISOString(), startedAt, plan: PLAN, dryRun: built, execution: { ok: false, response, createMeta } };
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
      throw new Error(`create failed or missing IDs; wrote ${OUT}`);
    }

    await new Promise(resolve => setTimeout(resolve, 45000));
    const readback = await fetchKeywords(ws, createMeta);
    const wanted = new Set(PLAN.keywords.map(normalizeTerm));
    const landedRows = readback.rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeRow);
    const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
    const missingAfter = PLAN.keywords.filter(term => !landedTerms.has(normalizeTerm(term)));

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: '2026-06-08',
      evidenceBoundary: 'live ad backend via shared Chrome debug session',
      diagnosis: 'UTE4258 has traffic but search terms are partly off-theme; create a phrase lane for safari/jungle/neutral baby shower terms that match the listing theme.',
      bidEvidence: {
        sku7dCpc: 0.32,
        source: 'fetch_ad_sku_summary.js UTE4258 siteId=4 day=7 on 2026-06-08',
      },
      plan: PLAN,
      dryRun: built,
      execution: {
        ok: createOk,
        response,
        createMeta,
      },
      readback: {
        rowCount: readback.rows.length,
        landedRows,
        missingAfter,
        allLanded: missingAfter.length === 0,
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({
      out: OUT,
      campaignId: createMeta.campaignId,
      adGroupId: createMeta.adGroupId,
      campaignName: createMeta.campaignName,
      landed: landedRows.map(row => ({ keywordText: row.keywordText, matchType: row.matchType, bid: row.bid, state: row.state })),
      missingAfter,
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
