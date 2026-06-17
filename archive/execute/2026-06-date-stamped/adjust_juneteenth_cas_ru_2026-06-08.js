const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'juneteenth_cas_ru_adjust_2026-06-08.json');

const ACTIONS = {
  keywordBidDowns: [
    {
      sku: 'CAS4030',
      campaignId: '60553082753486',
      adGroupId: '231075766577371',
      accountId: 385,
      term: 'juneteenth cake decorations',
      bid: 0.20,
      reason: 'CAS exact lane 7d 3 clicks / 1.02 spend / 0 orders; keep a small exact receiver only.',
    },
    {
      sku: 'CAS4030',
      campaignId: '60553082753486',
      adGroupId: '231075766577371',
      accountId: 385,
      term: 'juneteenth cupcake decorations',
      bid: 0.20,
      reason: 'CAS exact lane 7d 2 clicks / 0.68 spend / 0 orders; lower ineffective exact pressure.',
    },
    {
      sku: 'CAS4030',
      campaignId: '136892579815755',
      adGroupId: '176040359409849',
      accountId: 385,
      term: 'black red green decorations',
      bid: 0.18,
      reason: 'CAS broad lane color/decor generic 7d 2 clicks / 0 orders; reduce non-cupcake spend.',
    },
    {
      sku: 'CAS4030',
      campaignId: '136892579815755',
      adGroupId: '176040359409849',
      accountId: 385,
      term: 'african american party decorations',
      bid: 0.18,
      reason: 'CAS broad lane generic party/decor term with no order; reduce non-cupcake spend.',
    },
    {
      sku: 'CAS4030',
      campaignId: '136892579815755',
      adGroupId: '176040359409849',
      accountId: 385,
      term: 'acrylic cupcake toppers',
      bid: 0.18,
      reason: 'CAS broad lane acrylic generic 7d 1 click / 0 orders and weak Juneteenth intent.',
    },
    {
      sku: 'CAS4030',
      campaignId: '136892579815755',
      adGroupId: '176040359409849',
      accountId: 385,
      term: 'freedom day decorations',
      bid: 0.18,
      reason: 'CAS broad lane generic decorations 7d 1 click / 0 orders; preserve spend for cupcake/cake directions.',
    },
  ],
  manualTargetBidDowns: [
    {
      sku: 'CAS4030',
      campaignId: '191500904339887',
      adGroupId: '122165149139079',
      accountId: 385,
      targetId: '279874520872148',
      bid: 0.20,
      reason: 'CAS ASIN target B0GT8PN6PY 7d 5 clicks / 1.41 spend / 0 orders.',
    },
    {
      sku: 'CAS4030',
      campaignId: '191500904339887',
      adGroupId: '122165149139079',
      accountId: 385,
      targetId: '246892305867004',
      bid: 0.20,
      reason: 'CAS ASIN target B0C1JN91JQ 7d 2 clicks / 0.60 spend / 0 orders.',
    },
    {
      sku: 'CAS4030',
      campaignId: '191500904339887',
      adGroupId: '122165149139079',
      accountId: 385,
      targetId: '578327336102',
      bid: 0.20,
      reason: 'CAS ASIN target B0F2SJXQNL 7d 2 clicks / 0.37 spend / 0 orders.',
    },
  ],
  keywordAppend: {
    sku: 'RU2438',
    accountId: 286,
    siteId: 4,
    campaignId: '236714680388019',
    adGroupId: '245399670583402',
    matchType: 'BROAD',
    bid: 0.42,
    terms: [
      '9 set juneteenth table centerpiece freedom day',
      'juneteenth table centerpiece',
      'juneteenth table centerpieces',
    ],
    reason: 'RU2438 B2B auto produced an order from "9 set juneteenth table centerpiece freedom day"; append narrow table-centerpiece variants into the existing B2B broad lane.',
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

async function advRequest(ws, method, pathname, payload) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

function rowsFrom(response) {
  const json = response?.json || response || {};
  const data = json.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    json.records || json.rows || json.list || [];
}

async function fetchKeywords(ws, plan) {
  const selectDate = ['2026-06-01', '2026-06-08'];
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: plan.siteId || 4,
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
    accountId: plan.accountId,
    campaignId: plan.campaignId,
    adGroupId: plan.adGroupId,
    property: '1',
    selectDate,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return rowsFrom(response);
}

async function fetchManualTargets(ws, plan) {
  const selectDate = ['2026-06-01', '2026-06-08'];
  const response = await advRequest(ws, 'POST', '/advTarget/findManualProductTarget', {
    siteId: plan.siteId || 4,
    accountId: plan.accountId,
    campaignId: plan.campaignId,
    adGroupId: plan.adGroupId,
    manualTargetState: 4,
    selectDate,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    previousPeriod: 7,
  });
  return rowsFrom(response);
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function keywordPayload(row, bid) {
  const keywordId = String(row.keywordId || row.id || '');
  return {
    column: 'bid',
    property: 'keyword',
    operation: 'bid',
    manualTargetType: '',
    accountId: Number(row.accountId),
    siteId: Number(row.siteId || 4),
    idArray: [keywordId],
    campaignIdArray: [String(row.campaignId)],
    targetArray: [{ ...row, keywordId, bid: String(bid), advType: 'SP' }],
    targetNewArray: [{ ...row, keywordId, bid: String(bid), advType: 'SP' }],
  };
}

function manualTargetPayload(row, bid) {
  const targetId = String(row.targetId || row.id || '');
  return {
    column: 'bid',
    property: 'manualTarget',
    operation: 'bid',
    accountId: Number(row.accountId),
    siteId: Number(row.siteId || 4),
    idArray: [targetId],
    campaignIdArray: [String(row.campaignId)],
    targetArray: [{ ...row, targetId, bid: String(bid), advType: 'SP' }],
    targetNewArray: [{ ...row, targetId, bid: String(bid), advType: 'SP' }],
  };
}

async function updateKeyword(ws, item) {
  const rows = await fetchKeywords(ws, item);
  const row = rows.find(r => normalizeTerm(r.keywordText || r.keyword || r.searchTerm) === normalizeTerm(item.term));
  if (!row) return { item, ok: false, skipped: true, reason: 'keyword row not found' };
  if (Number(row.state) !== 1) return { item, ok: true, skipped: true, reason: `keyword not enabled; state=${row.state}`, before: summarizeKeyword(row) };
  const response = await advRequest(ws, 'PATCH', '/keyword/batchKeyword', keywordPayload(row, item.bid));
  const afterRows = await fetchKeywords(ws, item);
  const after = afterRows.find(r => normalizeTerm(r.keywordText || r.keyword || r.searchTerm) === normalizeTerm(item.term));
  return {
    item,
    ok: Number(response.json?.code) === 200 && Number(after?.bid) === Number(item.bid),
    response,
    before: summarizeKeyword(row),
    after: after ? summarizeKeyword(after) : null,
  };
}

async function updateManualTarget(ws, item) {
  const rows = await fetchManualTargets(ws, item);
  const row = rows.find(r => String(r.targetId || r.id || '') === String(item.targetId));
  if (!row) return { item, ok: false, skipped: true, reason: 'manual target row not found' };
  if (Number(row.state) !== 1) return { item, ok: true, skipped: true, reason: `manual target not enabled; state=${row.state}`, before: summarizeTarget(row) };
  const response = await advRequest(ws, 'PATCH', '/advTarget/batchUpdateManualTarget', manualTargetPayload(row, item.bid));
  const afterRows = await fetchManualTargets(ws, item);
  const after = afterRows.find(r => String(r.targetId || r.id || '') === String(item.targetId));
  return {
    item,
    ok: Number(response.json?.code) === 200 && Number(after?.bid) === Number(item.bid),
    response,
    before: summarizeTarget(row),
    after: after ? summarizeTarget(after) : null,
  };
}

async function appendRuKeywords(ws) {
  const plan = ACTIONS.keywordAppend;
  const beforeRows = await fetchKeywords(ws, plan);
  const beforeTerms = new Set(beforeRows.map(row => normalizeTerm(row.keywordText || row.keyword || row.searchTerm)));
  const missingTerms = plan.terms.filter(term => !beforeTerms.has(normalizeTerm(term)));
  const built = buildSpAppendTargetPayload({
    positionType: 'keywordTarget',
    adGroupMatchType: plan.matchType,
    siteId: plan.siteId,
    accountId: plan.accountId,
    campaignId: plan.campaignId,
    adGroupId: plan.adGroupId,
    targets: missingTerms.map(value => ({ value, matchType: plan.matchType, bid: plan.bid })),
  });
  let response = null;
  if (missingTerms.length && built.ok) response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  await new Promise(resolve => setTimeout(resolve, 30000));
  const afterRows = await fetchKeywords(ws, plan);
  const wanted = new Set(plan.terms.map(normalizeTerm));
  const landedRows = afterRows.filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))).map(summarizeKeyword);
  const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
  return {
    plan,
    built,
    missingTermsBeforeExecution: missingTerms,
    response,
    ok: (!missingTerms.length || Number(response?.json?.code) === 200) && plan.terms.every(term => landedTerms.has(normalizeTerm(term))),
    landedRows,
    missingAfter: plan.terms.filter(term => !landedTerms.has(normalizeTerm(term))),
  };
}

function summarizeKeyword(row) {
  return {
    keywordId: String(row.keywordId || row.id || ''),
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType,
    bid: row.bid,
    state: row.state,
    campaignState: row.campaignState,
    groupState: row.groupState,
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

function summarizeTarget(row) {
  return {
    targetId: String(row.targetId || row.id || ''),
    type: row.type,
    bid: row.bid,
    state: row.state,
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    const keywordResults = [];
    for (const item of ACTIONS.keywordBidDowns) {
      keywordResults.push(await updateKeyword(ws, item));
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const manualTargetResults = [];
    for (const item of ACTIONS.manualTargetBidDowns) {
      manualTargetResults.push(await updateManualTarget(ws, item));
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const appendResult = await appendRuKeywords(ws);
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: '2026-06-08',
      evidenceBoundary: 'live ad backend via shared Chrome debug session',
      diagnosis: 'CAS4030: reduce enabled no-order Juneteenth tail spend while preserving ordered cake/ASIN directions. RU2438: promote the ordered B2B auto table-centerpiece query into the existing B2B broad lane.',
      actions: ACTIONS,
      keywordResults,
      manualTargetResults,
      appendResult,
      ok: keywordResults.every(r => r.ok) && manualTargetResults.every(r => r.ok) && appendResult.ok,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({
      out: OUT,
      ok: out.ok,
      keyword: keywordResults.map(r => ({ term: r.item.term, ok: r.ok, skipped: r.skipped || false, before: r.before?.bid, after: r.after?.bid, reason: r.reason || '' })),
      manualTargets: manualTargetResults.map(r => ({ targetId: r.item.targetId, ok: r.ok, before: r.before?.bid, after: r.after?.bid, reason: r.reason || '' })),
      append: {
        ok: appendResult.ok,
        missingTermsBeforeExecution: appendResult.missingTermsBeforeExecution,
        landed: appendResult.landedRows.map(row => ({ keywordText: row.keywordText, bid: row.bid, state: row.state })),
        missingAfter: appendResult.missingAfter,
      },
    }, null, 2));
    if (!out.ok) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
