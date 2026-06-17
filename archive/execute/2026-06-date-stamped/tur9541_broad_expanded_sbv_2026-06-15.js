const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  buildSpCreatePayload,
  buildSbvCreatePayload,
} = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'tur9541_broad_expanded_sbv_2026-06-15.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const BUSINESS_DATE = '2026-06-15';
const DATA_RANGE = ['2026-06-08', '2026-06-14'];
const EXECUTE = process.argv.includes('--execute');

const SKU = 'TUR9541';
const ASIN = 'B0GYRW7MG5';
const ACCOUNT_ID = 856;
const SITE_ID = 4;
const BRAND_ENTITY_ID = 'ENTITYFNVTPPITL5C3';
const BRAND_NAME = 'Acellegic';

const SP_BROAD = {
  key: 'sp_broad',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  mode: 'keywordTarget',
  campaignName: 'ai_kw broad_christian gift tin boxes prayer cards_tur9541',
  groupName: 'ai_kw broad_christian gift tin boxes prayer cards_tur9541',
  coreTerm: 'christian gift tin boxes prayer cards',
  matchType: 'BROAD',
  dailyBudget: 3,
  defaultBid: 0.42,
  keywords: [
    'christian gift boxes',
    'christian gift tin boxes',
    'prayer cards',
    'scripture cards',
    'bible verse cards',
    'christian fathers day gifts',
  ],
};

const SP_EXPANDED = {
  key: 'sp_asin_expanded',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  mode: 'productTarget',
  campaignName: 'ai_asin expanded_christian prayer card tin box_tur9541',
  groupName: 'ai_asin expanded_christian prayer card tin box_tur9541',
  coreTerm: 'christian prayer card tin box',
  targetType: 'ASIN_EXPANDED_FROM',
  dailyBudget: 3,
  defaultBid: 0.4,
  targetAsins: [
    'B082FNPCPJ',
    'B0FMNNTXZJ',
    'B0FSQRBJQ3',
    'B015N8JPK4',
    'B082FNLWTG',
    'B0G1V65LLN',
  ],
};

const SBV_BROAD = {
  key: 'sbv_broad',
  advType: 'SB',
  mode: 'keywordTarget',
  targetType: 'keyword',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  brand: BRAND_ENTITY_ID,
  brandName: BRAND_NAME,
  campaignName: 'sbvkw_broad_christian gift tin boxes_tur9541',
  groupName: 'sbvkw_broad_christian gift tin boxes_tur9541',
  coreTerm: 'christian gift tin boxes',
  dailyBudget: 3,
  defaultBid: 0.46,
  adFormat: 'video',
  videoAssetIds: ['amzn1.assetlibrary.asset1.500a935a006cf3194ef21ac86bb08b69'],
  videoAssetEvidence: {
    exactAsinAssetFound: false,
    exactAsin: ASIN,
    variantAssetAsin: 'B0GFV4TN5L',
    variantSku: 'TUR5292',
    assetName: 'B0GFV4TN5L-S-VB.mp4',
    assetStatus: 'ACTIVE',
    source: 'data/snapshots/amazon_asset_video_TUR5292_name_asin_2026-06-15.json',
  },
  keywords: [
    { keywordText: 'christian gift boxes', matchType: 'BROAD', bid: 0.46 },
    { keywordText: 'christian gift tin boxes', matchType: 'BROAD', bid: 0.46 },
    { keywordText: 'prayer cards', matchType: 'BROAD', bid: 0.46 },
    { keywordText: 'scripture cards', matchType: 'BROAD', bid: 0.46 },
    { keywordText: 'bible verse cards', matchType: 'BROAD', bid: 0.46 },
  ],
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function saveSnapshot(name, value) {
  return writeJson(path.join(SNAPSHOT_DIR, name), value);
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
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { code: 0, msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

function rowsFrom(response) {
  const json = response?.json || response || {};
  const data = json.data || {};
  return data.records || data.data || data.list || data.rows || data.targetRows || data?.targetData?.rows ||
    json.records || json.list || json.rows || (Array.isArray(json.data) ? json.data : []);
}

function datePayload() {
  return {
    timeRange: [
      new Date(`${DATA_RANGE[0]}T00:00:00`).getTime(),
      new Date(new Date(`${DATA_RANGE[1]}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    selectDate: DATA_RANGE,
    dateRange: DATA_RANGE,
  };
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeMatch(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === '1') return 'EXACT';
  if (raw === '2') return 'PHRASE';
  if (raw === '3') return 'BROAD';
  return raw;
}

function targetAsinFromRow(row = {}) {
  const raw = String(row.type || '');
  const match = raw.match(/B[A-Z0-9]{9}/i);
  if (match) return match[0].toUpperCase();
  for (const list of [row.expression, row.resolvedExpression, row.expressions, row.resolvedExpressions]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const asin = String(item?.value || '').toUpperCase();
      if (/^B[A-Z0-9]{9}$/.test(asin)) return asin;
    }
  }
  return '';
}

function summarizeCampaign(row = {}) {
  return {
    adType: row.adType || '',
    campaignId: String(row.campaignId || row.primaryId || ''),
    campaignName: row.campaignName || '',
    adGroupId: String(row.groups?.[0]?.adGroupId || row.adGroupId || ''),
    groupName: row.groups?.[0]?.name || row.groupName || '',
    positionType: row.positionType || '',
    adFormat: row.adFormat || '',
    dailyBudget: row.dailyBudget || row.budget || '',
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    servingStatus: row.servingStatus || '',
    impressions: row.Impressions ?? null,
    clicks: row.Clicks ?? null,
    spend: row.Spend ?? null,
    orders: row.Orders ?? null,
    sales: row.Sales ?? null,
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: String(row.keywordId || row.id || ''),
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: normalizeMatch(row.matchType),
    bid: row.bid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

function summarizeManualTarget(row = {}) {
  return {
    targetId: String(row.targetId || row.id || ''),
    asin: targetAsinFromRow(row),
    type: row.type || '',
    bid: row.bid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function fetchSkuProductRows(ws) {
  const response = await advRequest(ws, 'POST', '/product/adProductData', {
    selectDate: DATA_RANGE,
    mode: 1,
    state: 1,
    siteId: SITE_ID,
    sku: SKU,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  });
  return rowsFrom(response);
}

async function filterSensitiveKeywords(ws, plan) {
  const terms = (plan.keywords || []).map(item => typeof item === 'string' ? item : item.keywordText);
  if (!terms.length) return { response: null, blocked: [] };
  const response = await advRequest(ws, 'POST', '/keyword/checkSensitiveWord', {
    siteId: plan.siteId,
    advType: plan.advType || 'SP',
    keywords_array: terms,
  });
  return { response, blocked: Object.keys(response?.json?.data || {}) };
}

async function filterInternalKeywords(ws, plan) {
  const terms = (plan.keywords || []).map(item => typeof item === 'string' ? item : item.keywordText);
  if (!terms.length) return { response: null, blocked: [] };
  const response = await advRequest(ws, 'POST', '/filter/filterInternalAsinAndBrand', {
    siteId: plan.siteId,
    accountId: plan.accountId,
    targetType: 'keyword',
    productAsinArray: [plan.asin],
    targetArray: terms,
    advType: plan.advType || 'SP',
  });
  return { response, blocked: Object.values(response?.json?.data || {}).flat().map(String) };
}

function removeBlockedKeywords(plan, blockedLists) {
  const blocked = new Set(blockedLists.flat().map(normalizeTerm).filter(Boolean));
  if (!blocked.size) return { plan, removed: [] };
  const keywords = plan.keywords.filter(item => {
    const text = typeof item === 'string' ? item : item.keywordText;
    return !blocked.has(normalizeTerm(text));
  });
  return {
    plan: { ...plan, keywords },
    removed: plan.keywords.filter(item => {
      const text = typeof item === 'string' ? item : item.keywordText;
      return blocked.has(normalizeTerm(text));
    }),
  };
}

function extractCreateMeta(response = {}) {
  const json = response?.json || response;
  const data = json?.data || {};
  const param = data?.param || {};
  const groupSuccess = data?.group?.responseParams?.response?.adGroups?.success?.[0] || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || data.campaign?.data || json?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || groupSuccess.adGroupId || groupSuccess.adGroup?.adGroupId || json?.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || json?.campaignName || '',
    groupName: param.groupName || data.groupName || json?.groupName || '',
  };
}

async function fetchCreatedKeywords(ws, plan, createMeta, property = '1') {
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: plan.siteId,
    ...datePayload(),
    state: property === '4' ? '1' : '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: plan.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: property === '4' ? '1' : '4' },
  });
  const wanted = new Set((plan.keywords || []).map(item => normalizeTerm(typeof item === 'string' ? item : item.keywordText)));
  return rowsFrom(response)
    .filter(row =>
      String(row.campaignId || '') === createMeta.campaignId &&
      String(row.adGroupId || '') === createMeta.adGroupId &&
      wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))
    )
    .map(summarizeKeyword);
}

async function fetchCreatedManualTargets(ws, plan, createMeta) {
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: plan.siteId,
    ...datePayload(),
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: plan.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '3',
    tableName: 'product_manual_target',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const wanted = new Set((plan.targetAsins || []).map(value => String(value).toUpperCase()));
  return rowsFrom(response)
    .filter(row =>
      String(row.campaignId || '') === createMeta.campaignId &&
      String(row.adGroupId || '') === createMeta.adGroupId &&
      wanted.has(targetAsinFromRow(row))
    )
    .map(summarizeManualTarget);
}

async function verifyCreatedPlan(ws, plan, createMeta, kind) {
  const attempts = [];
  for (const delayMs of [0, 20000, 45000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    let rows = [];
    if (kind === 'spKeyword') rows = await fetchCreatedKeywords(ws, plan, createMeta, '1');
    if (kind === 'spTarget') rows = await fetchCreatedManualTargets(ws, plan, createMeta);
    if (kind === 'sbvKeyword') rows = await fetchCreatedKeywords(ws, plan, createMeta, '4');
    attempts.push({ delayMs, rows });
    const expected = kind === 'spTarget' ? plan.targetAsins.length : plan.keywords.length;
    if (rows.length >= expected) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const expectedValues = kind === 'spTarget'
    ? plan.targetAsins.map(value => String(value).toUpperCase())
    : plan.keywords.map(item => normalizeTerm(typeof item === 'string' ? item : item.keywordText));
  const landedValues = kind === 'spTarget'
    ? last.rows.map(row => row.asin)
    : last.rows.map(row => normalizeTerm(row.keywordText));
  const missingAfter = expectedValues.filter(value => !landedValues.includes(value));
  return {
    attempts,
    landedRows: last.rows,
    missingAfter,
    allLanded: missingAfter.length === 0 &&
      last.rows.every(row => {
        const campaignEnabled = String(row.campaignState).toUpperCase() === 'ENABLED' || Number(row.campaignState) === 1;
        return Number(row.state) === 1 && campaignEnabled && (row.groupState === '' || Number(row.groupState) === 1 || String(row.groupState).toUpperCase() === 'ENABLED');
      }),
  };
}

function createSkippedExecution(plan, reason) {
  return {
    key: plan.key,
    skipped: true,
    reason,
    createOk: false,
    createMeta: null,
    response: null,
    readback: null,
  };
}

async function createPlan(ws, plan, built, kind) {
  if (!EXECUTE) {
    return {
      key: plan.key,
      skipped: true,
      reason: 'dry-run',
      createOk: false,
      createMeta: null,
      response: null,
      readback: null,
    };
  }
  const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  const createOk = Number(response?.json?.code) === 200 && String(response?.json?.msg || '').toLowerCase() === 'success';
  const createMeta = extractCreateMeta(response);
  const readback = createOk && createMeta.campaignId && createMeta.adGroupId
    ? await verifyCreatedPlan(ws, plan, createMeta, kind)
    : null;
  return {
    key: plan.key,
    skipped: false,
    createOk,
    createMeta,
    response,
    readback,
  };
}

async function main() {
  const out = {
    exportedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    dryRun: !EXECUTE,
    gbrainKeywords: ['TUR9541', 'B0GYRW7MG5', 'SBV', 'BROAD', 'ASIN_EXPANDED_FROM', 'Acellegic'],
    evidenceBoundary: 'live ad backend on 2026-06-15; GBrain historical notes from 2026-06-08/09/11/15; asset library live reads on 2026-06-15.',
    operatingGoal: 'Fill missing owned base traffic entrances for TUR9541 while protecting current profitable SB and controlled SP lanes.',
    bidEvidence: {
      sku7dCpc: 0.3791,
      sku30dCpc: 0.3791,
      existingSb7dCpc: 0.4417,
      existingPhraseExactRepairBid: 0.5,
      selectedSpBroadBid: SP_BROAD.defaultBid,
      selectedExpandedAsinBid: SP_EXPANDED.defaultBid,
      selectedSbvBid: SBV_BROAD.defaultBid,
    },
    keywordEvidence: [
      'SB broad live read 2026-06-15: christian gift boxes has 249 impressions, 7 clicks, 3 orders, 3.58% ACOS.',
      'SB broad live rows also cover bible verse cards, scripture cards, christian gifts, church gifts.',
      'Existing SP phrase/exact Father Day rows are enabled but limited delivery; broad layer should stay product-form and Christian-intent, not generic dad gifts.',
    ],
    targetEvidence: [
      'Expanded ASIN seeds reuse the live verified direct competitor pool from the existing ASIN_SAME_AS layer.',
      'The ASIN_EXPANDED_FROM lane is separate from the existing ASIN_SAME_AS lane for attribution and control.',
    ],
    videoEvidence: SBV_BROAD.videoAssetEvidence,
    preflight: null,
    plans: [],
    executions: [],
    ok: false,
  };

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const beforeRows = await fetchSkuProductRows(ws);
    out.preflight = {
      snapshot: saveSnapshot('tur9541_broad_expanded_sbv_before_2026-06-15.json', beforeRows),
      productRows: beforeRows.map(summarizeCampaign),
      duplicateGuard: {
        existingNames: beforeRows.map(row => row.campaignName).filter(Boolean),
      },
    };

    const spSensitive = await filterSensitiveKeywords(ws, SP_BROAD);
    const spInternal = await filterInternalKeywords(ws, SP_BROAD);
    const spFiltered = removeBlockedKeywords(SP_BROAD, [spSensitive.blocked, spInternal.blocked]);

    const sbvSensitive = await filterSensitiveKeywords(ws, SBV_BROAD);
    const sbvInternal = await filterInternalKeywords(ws, SBV_BROAD);
    const sbvFiltered = removeBlockedKeywords(SBV_BROAD, [sbvSensitive.blocked, sbvInternal.blocked]);

    const planned = [
      {
        plan: spFiltered.plan,
        built: buildSpCreatePayload(spFiltered.plan),
        kind: 'spKeyword',
        filtering: {
          sensitiveBlocked: spSensitive.blocked,
          internalBlocked: spInternal.blocked,
          removed: spFiltered.removed,
        },
      },
      {
        plan: SP_EXPANDED,
        built: buildSpCreatePayload(SP_EXPANDED),
        kind: 'spTarget',
        filtering: {},
      },
      {
        plan: sbvFiltered.plan,
        built: buildSbvCreatePayload(sbvFiltered.plan),
        kind: 'sbvKeyword',
        filtering: {
          sensitiveBlocked: sbvSensitive.blocked,
          internalBlocked: sbvInternal.blocked,
          removed: sbvFiltered.removed,
        },
      },
    ];

    out.plans = planned.map(item => ({
      kind: item.kind,
      plan: item.plan,
      built: item.built,
      filtering: item.filtering,
    }));

    for (const item of planned) {
      const existing = beforeRows.find(row => normalizeTerm(row.campaignName) === normalizeTerm(item.plan.campaignName));
      if (!item.built.ok) {
        out.executions.push(createSkippedExecution(item.plan, `build failed: ${(item.built.errors || []).join('; ')}`));
        continue;
      }
      if (existing) {
        out.executions.push(createSkippedExecution(item.plan, `duplicate campaign exists: ${existing.campaignId || existing.primaryId || ''}`));
        continue;
      }
      if (item.kind !== 'spTarget' && (item.plan.keywords || []).length < 3) {
        out.executions.push(createSkippedExecution(item.plan, 'fewer than 3 valid keywords after filtering'));
        continue;
      }
      out.executions.push(await createPlan(ws, item.plan, item.built, item.kind));
    }

    out.ok = out.executions.every(item =>
      item.skipped ? item.reason === 'dry-run' : item.createOk && item.readback?.allLanded
    );
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  writeJson(OUT, out);
  console.log(JSON.stringify({
    out: OUT,
    dryRun: out.dryRun,
    ok: out.ok,
    executions: out.executions.map(item => ({
      key: item.key,
      skipped: item.skipped,
      reason: item.reason,
      createOk: item.createOk,
      campaignId: item.createMeta?.campaignId || '',
      adGroupId: item.createMeta?.adGroupId || '',
      landedRows: item.readback?.landedRows?.length || 0,
      missingAfter: item.readback?.missingAfter || [],
      allLanded: item.readback?.allLanded || false,
      responseCode: item.response?.json?.code ?? null,
      responseMsg: item.response?.json?.msg || '',
    })),
  }, null, 2));
  if (EXECUTE && !out.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
