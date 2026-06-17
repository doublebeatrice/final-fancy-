const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'qaa3142_group_cna_sp_2026-06-12.json');
const BUSINESS_DATE = '2026-06-12';
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

const COMMON = {
  accountId: 604,
  siteId: 4,
  mode: 'keywordTarget',
  coreTerm: 'cna crown brooch gifts',
  matchType: 'BROAD',
  dailyBudget: 2,
  keywords: [
    'cna week gifts',
    'cna gifts',
    'cna gifts bulk',
    'cna appreciation gifts bulk',
    'cna week gifts bulk 2026',
    'certified nursing assistant gifts',
  ],
};

const PLANS = [
  {
    key: 'qaa3142_cna_broad',
    sku: 'QAA3142',
    asin: 'B0F4R59VVV',
    defaultBid: 0.38,
    campaignName: 'ai_kw broad_cna crown brooch gifts_qaa3142',
    groupName: 'ai_kw broad_cna crown brooch gifts_qaa3142',
    ...COMMON,
  },
  {
    key: 'qaa3143_cna_broad',
    sku: 'QAA3143',
    asin: 'B0F4R4S12D',
    defaultBid: 0.4,
    campaignName: 'ai_kw broad_cna crown brooch gifts_qaa3143',
    groupName: 'ai_kw broad_cna crown brooch gifts_qaa3143',
    ...COMMON,
  },
];

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

function evalInTab(ws, expression, timeoutMs = 120000) {
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
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify(json || { code: 0, msg: text.slice(0, 1000), httpStatus: res.status });
  })()`;
  const text = await evalInTab(ws, expr);
  try { return JSON.parse(text || '{}'); } catch (error) { return { code: 0, raw: text, parseError: error.message }; }
}

function rowsFromResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || [];
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCreateMeta(response = {}) {
  const data = response?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || response?.campaignName || '',
    groupName: param.groupName || data.groupName || response?.groupName || '',
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType || '',
    bid: row.bid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function fetchKeywordRows(ws, plan, createMeta) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: plan.siteId,
    timeRange: [
      new Date(`${BUSINESS_DATE}T00:00:00`).getTime(),
      new Date(new Date(`${BUSINESS_DATE}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: plan.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '1',
    tableName: '',
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const rows = rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(createMeta.campaignId) &&
    String(row.adGroupId || '') === String(createMeta.adGroupId)
  );
  return { response, rows };
}

async function verifyPlan(ws, plan, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const readback = await fetchKeywordRows(ws, plan, createMeta);
    const wanted = new Set(plan.keywords.map(normalizeTerm));
    const landed = readback.rows.filter(row =>
      wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))
    );
    attempts.push({
      delayMs,
      rowCount: readback.rows.length,
      landedRows: landed.map(summarizeKeyword),
    });
    if (landed.length === plan.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { landedRows: [] };
  const landedTerms = new Set(last.landedRows.map(row => normalizeTerm(row.keywordText)));
  return {
    attempts,
    landedRows: last.landedRows,
    missingAfter: plan.keywords.filter(term => !landedTerms.has(normalizeTerm(term))),
    allLanded: last.landedRows.length === plan.keywords.length &&
      last.landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

async function execute() {
  const startedAt = new Date().toISOString();
  const builtPlans = PLANS.map(plan => ({ plan, built: buildSpCreatePayload(plan) }));
  const out = {
    exportedAt: new Date().toISOString(),
    startedAt,
    businessDate: BUSINESS_DATE,
    dryRun: DRY_RUN,
    evidenceBoundary: 'live ad backend, live sellerinventory product analysis, selection ABA/keyword conversion/seasonality, and GBrain CNA playbook history read on 2026-06-12',
    diagnosis: 'Developer requested CNA for the QAA3142 group. QAA3142 and QAA3143 are eligible for controlled CNA Week SP BROAD validation because their current titles carry employee/nurse/teacher gift intent and recent ad ACOS is controlled. QAA4200 is held because its current title is back-to-school/cancer-awareness oriented and weaker for CNA.',
    bidEvidence: {
      qaa3142: { sku7dCpc: 0.2105, sku30dCpc: 0.2132, productLineCpc: 0.325398, selectedBid: 0.38 },
      qaa3143: { sku7dCpc: 0.2388, sku30dCpc: 0.2276, productLineCpc: 0.325398, selectedBid: 0.4 },
      cnaMarket: 'Keyword conversion 2026-05-24: cna gifts searchVolume=5753, purchaseVolume=71, cpcMedian=1.02; ABA 2026-05-31 and seasonality say active but small-step validation only.',
    },
    excluded: [
      {
        sku: 'QAA4200',
        reason: 'Same parent product, but current title is Back-to-school/Cancer Awareness instead of Nurse/CNA, and 7d click volume is thin; do not push CNA until listing receiver is repaired or live proof appears.',
      },
    ],
    builtPlans,
    executions: [],
    ok: false,
  };

  if (builtPlans.some(item => !item.built.ok)) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    throw new Error(`buildSpCreatePayload failed; wrote ${OUT}`);
  }

  if (DRY_RUN) {
    out.ok = true;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    return out;
  }

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    for (const item of builtPlans) {
      const response = await postAdv(ws, item.built.requestUrl, item.built.requestBody);
      const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
      const createMeta = extractCreateMeta(response);
      const result = {
        key: item.plan.key,
        plan: item.plan,
        createOk,
        response,
        createMeta,
        readback: null,
      };
      if (createOk && createMeta.campaignId && createMeta.adGroupId) {
        result.readback = await verifyPlan(ws, item.plan, createMeta);
      }
      out.executions.push(result);
    }
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  out.ok = out.executions.every(item => item.createOk && item.readback?.allLanded);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

execute()
  .then(out => {
    console.log(JSON.stringify({
      out: OUT,
      dryRun: out.dryRun,
      ok: out.ok,
      planned: out.builtPlans.map(item => ({
        key: item.plan.key,
        campaignName: item.built.campaignName,
        dailyBudget: item.plan.dailyBudget,
        defaultBid: item.plan.defaultBid,
        keywords: item.plan.keywords,
      })),
      executions: out.executions.map(item => ({
        key: item.key,
        createOk: item.createOk,
        campaignId: item.createMeta?.campaignId,
        adGroupId: item.createMeta?.adGroupId,
        landedRows: item.readback?.landedRows?.map(row => ({
          keywordText: row.keywordText,
          matchType: row.matchType,
          bid: row.bid,
          state: row.state,
          campaignState: row.campaignState,
          groupState: row.groupState,
        })) || [],
        missingAfter: item.readback?.missingAfter || [],
        allLanded: item.readback?.allLanded || false,
      })),
    }, null, 2));
    if (!out.ok) process.exitCode = out.dryRun ? 0 : 2;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
