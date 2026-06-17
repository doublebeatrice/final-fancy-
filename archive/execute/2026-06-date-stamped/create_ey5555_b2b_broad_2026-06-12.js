const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'ey5555_b2b_broad_2026-06-12.json');
const BUSINESS_DATE = '2026-06-12';
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

const PLAN = {
  key: 'b2bBroadKeyword',
  sku: 'EY5555',
  asin: 'B0DX1Q6H4C',
  accountId: 295,
  siteId: 4,
  mode: 'keywordTarget',
  campaignName: 'ai_kw broad_b2b fathers day christian keychains_ey5555',
  groupName: 'ai_kw broad_b2b fathers day christian keychains_ey5555',
  coreTerm: 'b2b fathers day christian keychains',
  matchType: 'BROAD',
  siteRestriction: 'AMAZON_BUSINESS',
  siteAmazonBusiness: 0,
  dailyBudget: 3,
  defaultBid: 0.5,
  keywords: [
    "father's day keychain bulk",
    'father day gifts bulk',
    'christian fathers day gifts',
    'christian fathers day gifts bulk',
    'christian fathers day gifts for church bulk',
    'bulk fathers day gifts for church',
    'fathers day gifts for church',
    'fathers day church gifts',
    'religious fathers day gifts',
  ],
};

const SKIPPED_TERMS = [
  { term: 'dad gifts', reason: 'too generic; weak SKU/listing fit for Bible keychain bulk' },
  { term: 'fathers day gifts for dad', reason: 'too generic for BROAD; likely to pull unrelated gift traffic' },
  { term: 'happy fathers day gifts for employees', reason: 'ABA returned no row and product fit is weaker than church/bulk terms' },
  { term: 'fathers day gifts in bulk', reason: 'generic bulk gift term; conversion-cost evidence shows high risk' },
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
  if (Array.isArray(data)) return data;
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
    campaignName: param.campaignName || data.campaignName || response?.campaignName || PLAN.campaignName,
    groupName: param.groupName || data.groupName || response?.groupName || PLAN.groupName,
  };
}

function summarizeKeywordRow(row) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType || row.match_type || '',
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? row.campaign_state ?? '',
    groupState: row.groupState ?? row.group_state ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    createdAt: row.createdAt || '',
  };
}

function summarizeProductRow(row) {
  return {
    adId: row.adId || row.primaryId || '',
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    dailyBudget: row.dailyBudget || '',
    positionType: row.positionType || '',
    servingStatus: row.servingStatus || '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    state: row.state ?? '',
    accountId: row.accountId ?? '',
    siteId: row.siteId ?? '',
  };
}

async function fetchKeywordRows(ws, createMeta) {
  const basePayload = {
    siteId: PLAN.siteId,
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
    accountId: PLAN.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '1',
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    field: 'Spend',
    order: 'desc',
    limit: 500,
    filterArray: { campaignState: '4' },
  };
  const pages = [];
  const allRows = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', { ...basePayload, page });
    const pageRows = rowsFromResponse(response);
    pages.push({ page, response, rowCount: pageRows.length });
    allRows.push(...pageRows);
    if (pageRows.length < basePayload.limit) break;
  }
  const seen = new Set();
  const rows = allRows.filter(row => {
    if (String(row.campaignId || '') !== String(createMeta.campaignId)) return false;
    if (String(row.adGroupId || '') !== String(createMeta.adGroupId)) return false;
    const key = `${row.keywordId || ''}:${normalizeTerm(row.keywordText)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { response: { pages }, rows };
}

async function fetchProductRows(ws, createMeta = null) {
  const response = await postAdv(ws, '/product/adProductData', {
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    mode: 1,
    state: 1,
    siteId: PLAN.siteId,
    sku: PLAN.sku,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  });
  const rows = rowsFromResponse(response);
  if (!createMeta) return { response, rows };
  return {
    response,
    rows: rows.filter(row =>
      String(row.campaignId || '') === String(createMeta.campaignId) &&
      String(row.adGroupId || '') === String(createMeta.adGroupId)
    ),
  };
}

function existingMetaFromProductRows(rows) {
  const existing = rows.find(row => row.campaignName === PLAN.campaignName);
  if (!existing) return null;
  return {
    campaignId: String(existing.campaignId || ''),
    adGroupId: String(existing.adGroupId || ''),
    campaignName: existing.campaignName || PLAN.campaignName,
    groupName: existing.groupName || PLAN.groupName,
  };
}

async function verifyKeywordRows(ws, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const readback = await fetchKeywordRows(ws, createMeta);
    const summarized = readback.rows.map(summarizeKeywordRow);
    attempts.push({
      delayMs,
      rowCount: summarized.length,
      rows: summarized,
    });
    const wanted = new Set(PLAN.keywords.map(normalizeTerm));
    const landed = summarized.filter(row => wanted.has(normalizeTerm(row.keywordText)));
    if (landed.length === PLAN.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const wanted = new Set(PLAN.keywords.map(normalizeTerm));
  const landedRows = last.rows.filter(row => wanted.has(normalizeTerm(row.keywordText)));
  const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
  return {
    attempts,
    landedRows,
    missingAfter: PLAN.keywords.filter(term => !landedTerms.has(normalizeTerm(term))),
    allLanded: landedRows.length === PLAN.keywords.length &&
      landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

async function execute() {
  const built = buildSpCreatePayload(PLAN);
  const out = {
    exportedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    dryRun: DRY_RUN,
    evidenceBoundary: 'live ad backend via shared Chrome debug session; GBrain checked for EY5555/Fathers Day/B2B/broad; selection ABA and keyword-conversion snapshots from 2026-06-12 used as market support.',
    diagnosis: 'Operator clarified that EY5555 should also cover B2B BROAD Fathers Day related terms. The plan keeps terms tied to Christian, church, bulk, religious, or keychain intent and skips generic dad-gift broad traffic.',
    bidEvidence: {
      operatorSpecifiedBid: 0.5,
      sku7dCpc: 0.25,
      sku30dCpc: 0.3012,
      currentSbv30dCpc: 0.3986,
      marketConversionBroadCpcWarning: 'some generic Fathers Day broad CPC evidence is materially above 0.50, so this is capped B2B validation rather than full market-capture bidding',
      selectedB2bBroadBid: PLAN.defaultBid,
    },
    keywordEvidence: [
      { keywordText: "father's day keychain bulk", source: 'existing SP auto customer search term and ABA keychain-bulk demand' },
      { keywordText: 'father day gifts bulk', source: 'existing SP auto customer search term; kept only because it is bulk/B2B relevant' },
      { keywordText: 'christian fathers day gifts', source: 'ABA medium demand, medium competition; SKU title/listing has Christian/Bible language' },
      { keywordText: 'christian fathers day gifts bulk', source: 'ABA returned demand; bulk modifier improves SKU fit' },
      { keywordText: 'christian fathers day gifts for church bulk', source: 'ABA medium demand, medium competition; best church/bulk fit' },
      { keywordText: 'bulk fathers day gifts for church', source: 'ABA medium demand, medium competition; B2B/church bulk receiver' },
      { keywordText: 'fathers day gifts for church', source: 'ABA medium demand; included only in B2B-limited capped group' },
      { keywordText: 'fathers day church gifts', source: 'ABA niche demand; direct church receiver language' },
      { keywordText: 'religious fathers day gifts', source: 'religious modifier fits Bible keychain identity; market conversion is weak so no higher bid/budget' },
    ],
    skippedTerms: SKIPPED_TERMS,
    plan: PLAN,
    built,
    execution: null,
    ok: false,
  };

  if (!built.ok) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    throw new Error(`buildSpCreatePayload failed: ${built.errors.join('; ')}`);
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
    const beforeProductRows = await fetchProductRows(ws);
    const existingMeta = existingMetaFromProductRows(beforeProductRows.rows);
    let response = null;
    let createMeta = existingMeta;
    let createOk = !!existingMeta?.campaignId && !!existingMeta?.adGroupId;
    let action = createOk ? 'reuse_existing' : 'create';

    if (!createOk) {
      response = await postAdv(ws, built.requestUrl, built.requestBody);
      createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
      createMeta = extractCreateMeta(response);
    }

    out.execution = {
      action,
      duplicateGuard: existingMeta ? { found: true, createMeta: existingMeta } : { found: false },
      createOk,
      response,
      createMeta,
      readback: null,
      productReadback: null,
    };

    if (createOk && createMeta.campaignId && createMeta.adGroupId) {
      out.execution.readback = await verifyKeywordRows(ws, createMeta);
      const productReadback = await fetchProductRows(ws, createMeta);
      out.execution.productReadback = {
        rowCount: productReadback.rows.length,
        rows: productReadback.rows.map(summarizeProductRow),
        productEnabled: productReadback.rows.some(row =>
          Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1
        ),
      };
    }
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  out.ok = !!out.execution?.createOk &&
    !!out.execution?.readback?.allLanded &&
    !!out.execution?.productReadback?.productEnabled;
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
      planned: {
        campaignName: out.built.campaignName,
        dailyBudget: out.plan.dailyBudget,
        defaultBid: out.plan.defaultBid,
        siteRestriction: out.plan.siteRestriction,
        keywords: out.plan.keywords,
        skippedTerms: out.skippedTerms,
      },
      execution: out.execution ? {
        action: out.execution.action,
        createOk: out.execution.createOk,
        campaignId: out.execution.createMeta?.campaignId,
        adGroupId: out.execution.createMeta?.adGroupId,
        landedRows: out.execution.readback?.landedRows?.map(row => ({
          keywordText: row.keywordText,
          matchType: row.matchType,
          bid: row.bid,
          state: row.state,
          campaignState: row.campaignState,
          groupState: row.groupState,
        })) || [],
        missingAfter: out.execution.readback?.missingAfter || [],
        allLanded: out.execution.readback?.allLanded || false,
        productRows: out.execution.productReadback?.rows || [],
      } : null,
    }, null, 2));
    if (!out.ok) process.exitCode = out.dryRun ? 0 : 2;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
