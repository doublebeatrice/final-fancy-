const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'dn3482_variant_winner_exact_2026-06-12.json');
const BUSINESS_DATE = '2026-06-12';
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  sku: 'DN3482',
  asin: 'B0FPQZPD7T',
  accountId: 171,
  siteId: 4,
  mode: 'keywordTarget',
  coreTerm: 'variant winner flower bucket terms',
  matchType: 'EXACT',
  defaultBid: 0.6,
  dailyBudget: 4,
  campaignName: 'ai_kw exact_variant winner flower bucket_dn3482',
  groupName: 'ai_kw exact_variant winner flower bucket_dn3482',
  keywords: [
    'galvanized flower bucket',
    'metal flower bucket',
    'flower buckets',
    'flower bucket',
    'flower buckets for flower bar',
    'flower bar',
    'flower bar buckets',
    'flower bar supplies',
    'bouquet bar supplies',
    'bloom bar',
    'floral containers',
    'galvanized flower vases',
    'galvanized vase',
    'french metal vase',
    'french flower bucket',
    'farmhouse flower bucket',
    '12 inch farm house vase',
    '12" floral bucket',
    'galvanized flower bucket 12 inch',
    'galvanized vases for flowers',
    'flower galvanized buckets',
    'vintage vases',
    'containers for natural flowers',
    'bouquet containers wide base metal',
    'flower basket for cut flowers',
    'flower vases for centerpieces',
    '12 inch flower buckets irenare',
    'galvanized containers',
    'metal bucket',
    'colorful galvanized steel vase',
    'tall flower bar with buckets',
  ],
  excludedTerms: [
    { term: 'white galvanized vase', reason: 'color mismatch with DN3482 orange/retro red' },
    { term: 'pink flower buckets', reason: 'color mismatch with DN3482 orange/retro red' },
    { term: 'blue flower buckets', reason: 'color mismatch with DN3482 orange/retro red' },
    { term: 'large vase', reason: 'too broad; weak receiver fit' },
    { term: 'flower cart display stand', reason: 'wrong object; cart/stand rather than bucket/vase' },
    { term: 'ASIN strings from product targeting', reason: 'not buyer-facing keywords for this request' },
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

function rowsFromResponse(response = {}) {
  const data = response.data || {};
  return data.records || data.rows || data.list || data.data || data.targetRows ||
    response.records || response.rows || response.list || (Array.isArray(data) ? data : []);
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeMatch(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === '1') return 'EXACT';
  if (text === '2') return 'PHRASE';
  if (text === '3') return 'BROAD';
  return text;
}

function extractCreateMeta(response = {}) {
  const data = response.data || {};
  const param = data.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || '',
    groupName: param.groupName || data.groupName || '',
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: normalizeMatch(row.matchType),
    bid: Number(row.bid ?? row.currentBid ?? row.cpcBid ?? 0),
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

function timeRange() {
  return [
    new Date(`${BUSINESS_DATE}T00:00:00`).getTime(),
    new Date(new Date(`${BUSINESS_DATE}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchKeywordRows(ws, campaignId, adGroupId) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    timeRange: timeRange(),
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: PLAN.accountId,
    campaignId,
    adGroupId,
    property: '1',
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(campaignId) &&
    String(row.adGroupId || '') === String(adGroupId)
  );
}

async function filterSensitiveKeywords(ws, terms) {
  if (!terms.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/keyword/checkSensitiveWord', {
    siteId: PLAN.siteId,
    advType: 'SP',
    keywords_array: terms,
  });
  return { response, blocked: Object.keys(response?.data || {}) };
}

async function filterInternalKeywords(ws, terms) {
  if (!terms.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/filter/filterInternalAsinAndBrand', {
    siteId: PLAN.siteId,
    accountId: PLAN.accountId,
    targetType: 'keyword',
    productAsinArray: [PLAN.asin],
    targetArray: terms,
    advType: 'SP',
  });
  return { response, blocked: Object.values(response?.data || {}).flat().map(String) };
}

async function verifyPlan(ws, createMeta, wantedTerms) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const rows = await fetchKeywordRows(ws, createMeta.campaignId, createMeta.adGroupId);
    const wanted = new Set(wantedTerms.map(normalizeTerm));
    const landedRows = rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeKeyword);
    attempts.push({ delayMs, rowCount: rows.length, landedRows });
    if (landedRows.length === wantedTerms.length) break;
  }
  const landedRows = attempts[attempts.length - 1]?.landedRows || [];
  const landed = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
  return {
    attempts,
    landedRows,
    missingAfter: wantedTerms.filter(term => !landed.has(normalizeTerm(term))),
    allLanded: landedRows.length === wantedTerms.length,
    allEnabled: landedRows.length === wantedTerms.length &&
      landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

function writeOut(value) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(value, null, 2), 'utf8');
}

async function main() {
  const startedAt = new Date().toISOString();
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const sensitive = await filterSensitiveKeywords(ws, PLAN.keywords);
    const internal = await filterInternalKeywords(ws, PLAN.keywords);
    const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
    const keywords = PLAN.keywords.filter(term => !blocked.has(normalizeTerm(term)));
    const built = buildSpCreatePayload({ ...PLAN, keywords });
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: BUSINESS_DATE,
      dryRun: !EXECUTE,
      evidenceBoundary: 'live ad backend through shared Chrome; sibling variant 30-day adProductData and lower-layer keyword/search-term rows read on 2026-06-12',
      diagnosis: 'Migrate relevant same-parent converting buyer-facing terms into a DN3482 exact SP lane. Exact match and small budget are used because DN3482 has inventory pressure and weak receiver proof, while sibling variants do show keyword/search-term orders.',
      bidEvidence: {
        dn3482CurrentPhraseCpc30d: 0.6,
        siblingCoreKeywordCpc30d: {
          galvanizedFlowerBucket: 0.741,
          metalFlowerBucket: 0.541,
          flowerBuckets: 0.672,
        },
        marketCpcMedian: {
          galvanizedFlowerBucket: 0.86,
          flowerBucketsForFlowerBar: 0.79,
        },
        selectedBid: PLAN.defaultBid,
      },
      plan: { ...PLAN, keywords },
      filtering: {
        excludedTerms: PLAN.excludedTerms,
        blockedTargets: PLAN.keywords.filter(term => blocked.has(normalizeTerm(term))),
        sensitiveResponse: sensitive.response,
        internalResponse: internal.response,
      },
      dryRunBuild: built,
      execution: null,
      readback: null,
      checkpoint: {
        firstReviewDate: '2026-06-15',
        secondReviewDate: '2026-06-19',
        successSignal: 'new exact lane gets impressions/clicks and DN3482 gets same-SKU order while ACOS stays under 30%',
        failureCondition: 'any migrated term spends >=6 USD or reaches 12 clicks without a DN3482 order; pause/bid down that term and do not broaden',
      },
      ok: false,
    };

    if (!built.ok || !keywords.length) {
      out.ok = false;
      writeOut(out);
      throw new Error(`build failed: ${(built.errors || []).join('; ') || 'no keywords after filtering'}`);
    }

    if (!EXECUTE) {
      out.ok = true;
      writeOut(out);
      console.log(JSON.stringify({
        out: OUT,
        mode: 'dry-run',
        ok: out.ok,
        keywords,
        blockedTargets: out.filtering.blockedTargets,
        campaignName: built.campaignName,
        dailyBudget: PLAN.dailyBudget,
        defaultBid: PLAN.defaultBid,
      }, null, 2));
      return;
    }

    const response = await postAdv(ws, built.requestUrl, built.requestBody);
    const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
    const createMeta = extractCreateMeta(response);
    out.execution = { createOk, response, createMeta };
    if (createOk && createMeta.campaignId && createMeta.adGroupId) {
      out.readback = await verifyPlan(ws, createMeta, keywords);
    }
    out.exportedAt = new Date().toISOString();
    out.ok = !!(createOk && out.readback?.allEnabled);
    writeOut(out);
    console.log(JSON.stringify({
      out: OUT,
      mode: 'execute',
      ok: out.ok,
      createOk,
      campaignId: createMeta.campaignId,
      adGroupId: createMeta.adGroupId,
      landedCount: out.readback?.landedRows?.length || 0,
      missingAfter: out.readback?.missingAfter || [],
      allEnabled: out.readback?.allEnabled || false,
      landedRows: (out.readback?.landedRows || []).map(row => ({
        keywordText: row.keywordText,
        matchType: row.matchType,
        bid: row.bid,
        state: row.state,
        campaignState: row.campaignState,
        groupState: row.groupState,
      })),
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
