const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload, buildStateToggleRequest } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const ACTION_DATE = '2026-06-09';
const EXECUTE = process.argv.includes('--execute');
const OUT = path.join(
  ROOT,
  'data',
  'actions',
  `mty1808_stoploss_small_terms_${EXECUTE ? 'execution' : 'dryrun'}_${ACTION_DATE}.json`
);

const STOP_LOSS = [
  {
    entityType: 'keyword',
    label: 'patriotic keychain',
    keywordId: '124345197929485',
    campaignId: '27454025931688',
    adGroupId: '129279391185787',
    accountId: 841,
    siteId: 4,
    days: 30,
  },
  {
    entityType: 'keyword',
    label: 'independence day keychain',
    keywordId: '210365581569982',
    campaignId: '27454025931688',
    adGroupId: '129279391185787',
    accountId: 841,
    siteId: 4,
    days: 30,
  },
  {
    entityType: 'autoTarget',
    label: 'QUERY_BROAD_REL_MATCHES / loose-match',
    targetId: '471381949968401',
    campaignId: '503539920673225',
    adGroupId: '319091377546035',
    accountId: 841,
    siteId: 4,
    days: 7,
  },
];

const CREATE_PLAN = {
  sku: 'MTY1808',
  asin: 'B0FPG8DT4R',
  accountId: 841,
  siteId: 4,
  mode: 'keywordTarget',
  campaignName: 'ai_kw phrase_silicone wristlet keychain_mty1808_test',
  groupName: 'ai_kw phrase_silicone wristlet keychain_mty1808_test',
  coreTerm: 'silicone wristlet keychain',
  matchType: 'PHRASE',
  dailyBudget: 2,
  defaultBid: 0.32,
  keywords: [
    'silicone wristlet keychain',
    'american flag silicone wristlet keychain',
    'patriotic silicone wristlet keychain',
  ],
};

function ymd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateRange(days) {
  const end = new Date(`${ACTION_DATE}T00:00:00`);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return [ymd(start), ymd(end)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
      try { response = JSON.parse(data); } catch (_) { return; }
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) reject(new Error(JSON.stringify(response.error)));
      else resolve(response.result?.result?.value);
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
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

function rowsFrom(response) {
  const json = response?.json || response || {};
  const data = json.data || {};
  return data.records || data.data || data.list || data.rows || data.targetRows || data?.targetData?.rows ||
    json.records || json.list || json.rows || (Array.isArray(json.data) ? json.data : []);
}

async function fetchRows(ws, item) {
  const selectDate = dateRange(item.days || 30);
  const property = item.entityType === 'autoTarget' ? '2' : '1';
  const payload = {
    siteId: item.siteId,
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
    accountId: String(item.accountId),
    campaignId: String(item.campaignId),
    adGroupId: String(item.adGroupId),
    property,
    selectDate,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  };
  if (item.entityType === 'autoTarget') payload.tableName = 'product_target';
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', payload);
  const rows = rowsFrom(response).filter(row =>
    String(row.campaignId || '') === String(item.campaignId) &&
    String(row.adGroupId || '') === String(item.adGroupId)
  );
  return { selectDate, response, rows };
}

function findTargetRow(rows, item) {
  if (item.entityType === 'keyword') {
    return rows.find(row => String(row.keywordId || row.id || '') === String(item.keywordId)) || null;
  }
  return rows.find(row => String(row.targetId || row.id || '') === String(item.targetId)) || null;
}

function summarizeRow(row = {}) {
  return {
    id: String(row.keywordId || row.targetId || row.id || ''),
    text: row.keywordText || row.text || row.targetingText || row.targetType || row.type || '',
    matchType: row.matchType || '',
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? row.targetState ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    impressions: Number(row.impressions ?? row.Impressions ?? 0),
    clicks: Number(row.clicks ?? row.Clicks ?? 0),
    spend: Number(row.spend ?? row.Spend ?? row.cost ?? 0),
    orders: Number(row.orders ?? row.Orders ?? row.purchases ?? 0),
    updatedAt: row.updatedAt || row.updateTime || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function pauseItem(ws, item) {
  const beforeFetch = await fetchRows(ws, item);
  const before = findTargetRow(beforeFetch.rows, item);
  if (!before) {
    return { item, ok: false, skipped: true, reason: 'target row not found', beforeFetch };
  }
  const rowForRequest = {
    ...before,
    siteId: item.siteId,
    accountId: item.accountId,
    campaignId: item.campaignId,
    adGroupId: item.adGroupId,
    keywordId: item.keywordId || before.keywordId,
    targetId: item.targetId || before.targetId,
  };
  const built = buildStateToggleRequest(rowForRequest, 'pause', item.entityType);
  if (!built.ok) {
    return { item, ok: false, skipped: true, reason: built.reason, before: summarizeRow(before), built };
  }
  if (!EXECUTE) {
    return { item, ok: true, dryRun: true, before: summarizeRow(before), built };
  }

  const response = await advRequest(ws, 'PATCH', built.requestUrl, built.requestBody);
  await sleep(1000);
  const afterFetch = await fetchRows(ws, item);
  const after = findTargetRow(afterFetch.rows, item);
  const landed = Number(response.json?.code) === 200 && Number(after?.state) === 2;
  return {
    item,
    ok: landed,
    dryRun: false,
    response,
    before: summarizeRow(before),
    after: after ? summarizeRow(after) : null,
    built,
  };
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCreateMeta(response) {
  const data = response?.json?.data || response?.data || {};
  const param = data.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.json?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.json?.adGroupId || ''),
    campaignName: param.campaignName || response?.json?.campaignName || '',
    groupName: param.groupName || response?.json?.groupName || '',
  };
}

async function fetchCreatedKeywords(ws, createMeta) {
  const simple = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: CREATE_PLAN.siteId,
    accountId: CREATE_PLAN.accountId,
    type: 'spKeyword',
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '1',
    tableName: '',
    dateRange: [ACTION_DATE, ACTION_DATE],
    page: 1,
    limit: 500,
  });
  let rows = rowsFrom(simple).filter(row =>
    String(row.campaignId || '') === String(createMeta.campaignId) &&
    String(row.adGroupId || '') === String(createMeta.adGroupId)
  );
  if (rows.length) return { response: simple, rows, source: 'simple' };

  const fallback = await fetchRows(ws, {
    entityType: 'keyword',
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    accountId: CREATE_PLAN.accountId,
    siteId: CREATE_PLAN.siteId,
    days: 1,
  });
  rows = fallback.rows;
  return { response: fallback.response, rows, source: 'fallback' };
}

async function createSmallTest(ws) {
  const built = buildSpCreatePayload(CREATE_PLAN);
  if (!built.ok) return { ok: false, skipped: true, reason: built.errors.join('; '), built };
  if (!EXECUTE) return { ok: true, dryRun: true, built, plan: CREATE_PLAN };

  const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  const createMeta = extractCreateMeta(response);
  const createOk = Number(response?.json?.code) === 200 &&
    String(response?.json?.msg || '').toLowerCase() === 'success' &&
    createMeta.campaignId &&
    createMeta.adGroupId;
  if (!createOk) {
    return { ok: false, response, createMeta, built, plan: CREATE_PLAN };
  }

  await sleep(45000);
  const readback = await fetchCreatedKeywords(ws, createMeta);
  const wanted = new Set(CREATE_PLAN.keywords.map(normalizeTerm));
  const landedRows = readback.rows
    .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm || row.text)))
    .map(summarizeRow);
  const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.text)));
  const missingAfter = CREATE_PLAN.keywords.filter(term => !landedTerms.has(normalizeTerm(term)));
  const allLive = landedRows.every(row =>
    Number(row.state) === 1 &&
    Number(row.campaignState) === 1 &&
    Number(row.groupState) === 1 &&
    Number(row.bid) === CREATE_PLAN.defaultBid
  );
  return {
    ok: missingAfter.length === 0 && allLive,
    dryRun: false,
    response,
    createMeta,
    built,
    plan: CREATE_PLAN,
    readback: {
      source: readback.source,
      rowCount: readback.rows.length,
      landedRows,
      missingAfter,
      allLive,
    },
  };
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    const stopLossResults = [];
    for (const item of STOP_LOSS) {
      stopLossResults.push(await pauseItem(ws, item));
      await sleep(250);
    }
    const createResult = await createSmallTest(ws);
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: ACTION_DATE,
      mode: EXECUTE ? 'execute' : 'dry-run',
      evidenceBoundary: 'live ad backend via shared Chrome debug session; GBrain used only for prior conclusion and decision boundary',
      diagnosis: 'MTY1808 is leaking broad patriotic/keychain clicks without orders. Stop broad waste, then isolate a tiny material/form phrase test.',
      stopLossResults,
      createResult,
      ok: stopLossResults.every(result => result.ok) && createResult.ok,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({
      outputFile: OUT,
      mode: out.mode,
      ok: out.ok,
      paused: stopLossResults.map(result => ({
        label: result.item.label,
        ok: result.ok,
        beforeState: result.before?.state,
        afterState: result.after?.state,
      })),
      create: EXECUTE ? {
        ok: createResult.ok,
        campaignId: createResult.createMeta?.campaignId || '',
        adGroupId: createResult.createMeta?.adGroupId || '',
        landedRows: createResult.readback?.landedRows || [],
        missingAfter: createResult.readback?.missingAfter || [],
      } : {
        ok: createResult.ok,
        campaignName: CREATE_PLAN.campaignName,
        keywords: CREATE_PLAN.keywords,
      },
    }, null, 2));
    if (!out.ok) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
