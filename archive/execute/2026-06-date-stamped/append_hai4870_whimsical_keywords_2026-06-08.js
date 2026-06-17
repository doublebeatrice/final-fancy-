const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'hai4870_whimsical_keyword_append_2026-06-08.json');

const PLAN = {
  sku: 'HAI4870',
  asin: 'B0FP19WXC6',
  accountId: 496,
  siteId: 4,
  campaignId: '78108427620546',
  adGroupId: '37840724347923',
  campaignName: 'kw_q2 profit hai4870 phrase_hai4870',
  groupName: 'kw_q2 profit hai4870 phrase_hai4870',
  matchType: 'PHRASE',
  bid: 0.26,
  terms: [
    'whimsical room decor',
    'whimsical mushroom decor',
    'felt mushroom decor',
    'mushroom room decor',
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
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    accountId: PLAN.accountId,
    type: 'spKeyword',
    campaignId: PLAN.campaignId,
    adGroupId: PLAN.adGroupId,
    property: '1',
    tableName: '',
    dateRange: ['2026-05-09', '2026-06-08'],
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
      const t0 = Date.now();
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution = {
        skipped: false,
        ms: Date.now() - t0,
        ok: Number(response?.code) === 200 && Array.isArray(response?.data?.success) && response.data.success.length === missingTerms.length,
        response,
      };
    }

    await new Promise(resolve => setTimeout(resolve, 30000));
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
