const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'uy1624_b2b_auto_broad_2026-06-10.json');
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

const BUSINESS_DATE = '2026-06-10';
const SITE_ID = 4;
const ACCOUNT_ID = 380;
const SKU = 'UY1624';
const ASIN = 'B0BKG9LWYR';

const PLANS = [
  {
    key: 'b2bAuto',
    sku: SKU,
    asin: ASIN,
    accountId: ACCOUNT_ID,
    siteId: SITE_ID,
    mode: 'auto',
    campaignName: 'ai_auto_b2b patriotic tablecloth_uy1624',
    groupName: 'ai_auto_b2b patriotic tablecloth_uy1624',
    coreTerm: 'b2b patriotic tablecloth',
    siteRestriction: 'AMAZON_BUSINESS',
    siteAmazonBusiness: 0,
    dailyBudget: 3,
    defaultBid: 0.63,
  },
  {
    key: 'b2bBroadKeyword',
    sku: SKU,
    asin: ASIN,
    accountId: ACCOUNT_ID,
    siteId: SITE_ID,
    mode: 'keywordTarget',
    campaignName: 'ai_kw broad_b2b patriotic tablecloth_uy1624',
    groupName: 'ai_kw broad_b2b patriotic tablecloth_uy1624',
    coreTerm: 'b2b patriotic tablecloth',
    matchType: 'BROAD',
    siteRestriction: 'AMAZON_BUSINESS',
    siteAmazonBusiness: 0,
    dailyBudget: 3,
    defaultBid: 0.62,
    keywords: [
      'patriotic tablecloth',
      'red white and blue tablecloth',
      'american flag tablecloth',
      'patriotic tablecloths',
      'fourth of july tablecloth',
    ],
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

function rowsFromResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || [];
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCreateMeta(response) {
  const data = response?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || response?.campaignName || '',
    groupName: param.groupName || data.groupName || response?.groupName || '',
  };
}

function summarizeRow(row) {
  return {
    keywordId: row.keywordId || row.id || '',
    targetId: row.targetId || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    type: row.type || '',
    matchType: row.matchType || row.match_type || '',
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? row.campaign_state ?? '',
    groupState: row.groupState ?? row.group_state ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function fetchChildRows(ws, plan, createMeta) {
  const property = plan.mode === 'auto' ? '2' : '1';
  const tableName = plan.mode === 'auto' ? 'product_target' : '';
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
    property,
    tableName,
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
    const readback = await fetchChildRows(ws, plan, createMeta);
    attempts.push({
      delayMs,
      rowCount: readback.rows.length,
      rows: readback.rows.map(summarizeRow),
    });
    if (plan.mode === 'auto' && readback.rows.length >= 4) break;
    if (plan.mode === 'keywordTarget') {
      const wanted = new Set(plan.keywords.map(normalizeTerm));
      const landed = readback.rows.filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)));
      if (landed.length === plan.keywords.length) break;
    }
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  if (plan.mode === 'auto') {
    return {
      attempts,
      landedRows: last.rows,
      allLanded: last.rows.length >= 4 && last.rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
    };
  }
  const wanted = new Set(plan.keywords.map(normalizeTerm));
  const landedRows = last.rows.filter(row => wanted.has(normalizeTerm(row.keywordText)));
  const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
  return {
    attempts,
    landedRows,
    missingAfter: plan.keywords.filter(term => !landedTerms.has(normalizeTerm(term))),
    allLanded: landedRows.length === plan.keywords.length &&
      landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
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
    evidenceBoundary: 'live ad backend via shared Chrome debug session; selection keyword conversion and ABA evidence from 2026-06-10',
    diagnosis: 'Operator requested controlled B2B auto and B2B broad keyword coverage for UY1624. Existing UY1624 has no B2B named structure; current ordinary auto 30d CPC is 0.611 and market broad CPC start for patriotic tablecloth is 0.62.',
    bidEvidence: {
      currentAuto30dCpc: 0.61125,
      currentExact30dCpc: 0.65,
      selectedB2bAutoBid: 0.63,
      selectedBroadKeywordBid: 0.62,
      sourceFiles: [
        'data/snapshots/sku_ad_product_UY1624_30d_pre_b2b_2026-06-10.json',
        'data/snapshots/selection_keyword_conversion_rate_2026-06-10.json',
        'data/snapshots/selection_aba_search_terms_2026-06-10.json',
      ],
    },
    keywordEvidence: [
      { keywordText: 'patriotic tablecloth', conversionSearchVolume: 6973, purchaseVolume: 134, abaSearchVolume: 8992, abaEstimatedOrders: 2502 },
      { keywordText: 'red white and blue tablecloth', conversionSearchVolume: 3496, purchaseVolume: 72, abaSearchVolume: 4987, abaEstimatedOrders: 1559 },
      { keywordText: 'american flag tablecloth', conversionSearchVolume: 1166, purchaseVolume: 62, abaSearchVolume: 2490, abaEstimatedOrders: 866 },
      { keywordText: 'patriotic tablecloths', conversionSearchVolume: 1212, purchaseVolume: 27, abaSearchVolume: 2222, abaEstimatedOrders: 823 },
      { keywordText: 'fourth of july tablecloth', conversionSearchVolume: 1512, purchaseVolume: 31, abaSearchVolume: 2619, abaEstimatedOrders: 852 },
    ],
    builtPlans,
    executions: [],
    ok: false,
  };

  if (builtPlans.some(item => !item.built.ok)) {
    out.ok = false;
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
        keywords: item.plan.keywords || [],
      })),
      executions: out.executions.map(item => ({
        key: item.key,
        createOk: item.createOk,
        campaignId: item.createMeta?.campaignId,
        adGroupId: item.createMeta?.adGroupId,
        landedRows: item.readback?.landedRows?.map(row => ({
          keywordText: row.keywordText,
          type: row.type,
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
