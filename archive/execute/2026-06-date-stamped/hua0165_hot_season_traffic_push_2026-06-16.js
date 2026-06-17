const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'hua0165_hot_season_traffic_push_2026-06-16.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const BUSINESS_DATE = '2026-06-16';
const DATA_RANGE = ['2026-06-09', '2026-06-15'];
const EXECUTE = process.argv.includes('--execute');

const SKU = 'HUA0165';
const ASIN = 'B0C8M4Z2NL';
const ACCOUNT_ID = 600;
const SITE_ID = 4;

const SP_AUTO = {
  key: 'sp_auto_hot_season',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  mode: 'auto',
  campaignName: 'ai_auto_flip flops bulk_hua0165',
  groupName: 'ai_auto_flip flops bulk_hua0165',
  coreTerm: 'flip flops bulk',
  dailyBudget: 10,
  defaultBid: 0.72,
};

const SP_BROAD = {
  key: 'sp_broad_bulk_gap',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  mode: 'keywordTarget',
  campaignName: 'ai_kw broad_flip flops bulk_hua0165',
  groupName: 'ai_kw broad_flip flops bulk_hua0165',
  coreTerm: 'flip flops bulk',
  matchType: 'BROAD',
  dailyBudget: 10,
  defaultBid: 0.72,
  keywords: [
    'flip flops bulk',
    'bulk flip flops',
    'disposable flip flops',
    'wedding flip flops bulk',
    'flip flops for wedding guests',
    'bulk wedding flip flops',
  ],
};

const SP_EXPANDED = {
  key: 'sp_asin_expanded_competitors',
  sku: SKU,
  asin: ASIN,
  accountId: ACCOUNT_ID,
  siteId: SITE_ID,
  mode: 'productTarget',
  campaignName: 'ai_asin expanded_flip flops bulk_hua0165',
  groupName: 'ai_asin expanded_flip flops bulk_hua0165',
  coreTerm: 'flip flops bulk',
  targetType: 'ASIN_EXPANDED_FROM',
  dailyBudget: 10,
  defaultBid: 0.72,
  targetAsins: [
    'B07XGMQ734',
    'B09HWVKLGJ',
    'B09J1LJT43',
    'B0CC7DXD4N',
    'B07XVRKX8N',
    'B0BYYNZK6R',
    'B0FZWNR835',
    'B0F25545L3',
  ],
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
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
  return data.records || data.data || data.list || data.rows || json.records || json.list || json.rows || (Array.isArray(json.data) ? json.data : []);
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
    dailyBudget: row.dailyBudget || row.budget || '',
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    servingStatus: row.servingStatus || '',
    impressions: row.Impressions ?? null,
    clicks: row.Clicks ?? null,
    spend: row.Spend ?? null,
    orders: row.Orders ?? null,
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

function summarizeAutoTarget(row = {}) {
  return {
    targetId: String(row.targetId || row.id || ''),
    type: row.type || row.keywordText || '',
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
  return { response, blocked: [] };
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
  const keywords = plan.keywords.filter(term => !blocked.has(normalizeTerm(term)));
  return {
    plan: { ...plan, keywords },
    removed: plan.keywords.filter(term => blocked.has(normalizeTerm(term))),
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

async function fetchCreatedKeywords(ws, plan, meta) {
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
    campaignId: meta.campaignId,
    adGroupId: meta.adGroupId,
    property: '1',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const wanted = new Set(plan.keywords.map(normalizeTerm));
  return rowsFrom(response)
    .filter(row => String(row.campaignId || '') === meta.campaignId && String(row.adGroupId || '') === meta.adGroupId && wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
    .map(summarizeKeyword);
}

async function fetchCreatedAutoTargets(ws, plan, meta) {
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
    campaignId: meta.campaignId,
    adGroupId: meta.adGroupId,
    property: '2',
    tableName: 'product_target',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return rowsFrom(response)
    .filter(row => String(row.campaignId || '') === meta.campaignId && String(row.adGroupId || '') === meta.adGroupId)
    .map(summarizeAutoTarget);
}

async function fetchCreatedManualTargets(ws, plan, meta) {
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
    campaignId: meta.campaignId,
    adGroupId: meta.adGroupId,
    property: '3',
    tableName: 'product_manual_target',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const wanted = new Set(plan.targetAsins.map(value => String(value).toUpperCase()));
  return rowsFrom(response)
    .filter(row => String(row.campaignId || '') === meta.campaignId && String(row.adGroupId || '') === meta.adGroupId && wanted.has(targetAsinFromRow(row)))
    .map(summarizeManualTarget);
}

function rowEnabled(row) {
  const campaignEnabled = String(row.campaignState).toUpperCase() === 'ENABLED' || Number(row.campaignState) === 1;
  const groupEnabled = row.groupState === '' || String(row.groupState).toUpperCase() === 'ENABLED' || Number(row.groupState) === 1;
  return Number(row.state) === 1 && campaignEnabled && groupEnabled;
}

async function verifyCreatedPlan(ws, plan, meta, kind) {
  const attempts = [];
  for (const delayMs of [0, 20000, 45000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    let rows = [];
    if (kind === 'spAuto') rows = await fetchCreatedAutoTargets(ws, plan, meta);
    if (kind === 'spKeyword') rows = await fetchCreatedKeywords(ws, plan, meta);
    if (kind === 'spTarget') rows = await fetchCreatedManualTargets(ws, plan, meta);
    attempts.push({ delayMs, rows });
    const expected = kind === 'spAuto' ? 4 : (kind === 'spTarget' ? plan.targetAsins.length : plan.keywords.length);
    if (rows.length >= expected) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const expectedValues = kind === 'spAuto'
    ? ['asinAccessoryRelated', 'asinSubstituteRelated', 'queryBroadRelMatches', 'queryHighRelMatches'].map(normalizeTerm)
    : kind === 'spTarget'
      ? plan.targetAsins.map(value => String(value).toUpperCase())
      : plan.keywords.map(normalizeTerm);
  const landedValues = kind === 'spAuto'
    ? last.rows.map(row => normalizeTerm(row.type))
    : kind === 'spTarget'
      ? last.rows.map(row => row.asin)
      : last.rows.map(row => normalizeTerm(row.keywordText));
  const missingAfter = expectedValues.filter(value => !landedValues.includes(value));
  return {
    attempts,
    landedRows: last.rows,
    missingAfter,
    allLanded: !missingAfter.length && last.rows.every(rowEnabled),
  };
}

function skipped(plan, reason) {
  return { key: plan.key, skipped: true, reason, createOk: false, createMeta: null, response: null, readback: null };
}

async function createPlan(ws, plan, built, kind) {
  if (!EXECUTE) return skipped(plan, 'dry-run');
  const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  const createOk = Number(response?.json?.code) === 200 && String(response?.json?.msg || '').toLowerCase() === 'success';
  const createMeta = extractCreateMeta(response);
  const readback = createOk && createMeta.campaignId && createMeta.adGroupId
    ? await verifyCreatedPlan(ws, plan, createMeta, kind)
    : null;
  return { key: plan.key, skipped: false, createOk, createMeta, response, readback };
}

async function main() {
  const out = {
    exportedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    dryRun: !EXECUTE,
    gbrainKeywords: ['HUA0165', 'B0C8M4Z2NL', 'flip flops bulk', 'bulk flip flops', 'SBV'],
    evidenceBoundary: 'live ad backend on 2026-06-16; selection Product Time Machine and keyword conversion live reads on 2026-06-16; GBrain historical HUA0165 clearance note from 2026-06-05.',
    operatingGoal: 'Hot-season sell-through and storage-risk control: raise HUA0165 from 566 impressions/day toward at least 1500 impressions/day by adding missing owned traffic entrances.',
    bidEvidence: {
      sku3dCpc: 0.587,
      sku7dCpc: 0.5662,
      sku30dCpc: 0.5725,
      marketCpcStartForFlipFlopsBulk: 0.65,
      selectedBid: 0.72,
    },
    keywordEvidence: [
      'Existing keyword group is too single: it only covers flip flops / flip flops bulk across match types.',
      'Product Time Machine 2026-06-16: flip flops bulk latest search volume 1848 and rising; bulk flip flops latest search volume 1969 and rising; disposable flip flops latest search volume 893 and rising.',
      'Keyword conversion 2026-06-16: flip flops bulk has search volume 976, click volume 620, purchase volume 8, CPC start 0.65, median 0.86; this is high-cost but usable under hot-season inventory-risk objective.',
    ],
    targetEvidence: [
      'ASIN seeds selected from same product-image traffic pool: bulk/wedding/hotel/pool flip flops, 48-72 pair or close bulk packs, bought-in-past-month and organic/ad traffic visible.',
      'Excluded generic one-pair sandals, kids-only packs, men-only non-bulk sandals, and unrelated broad flip-flop traffic.',
    ],
    sbvStatus: {
      requested: true,
      executable: false,
      reason: 'brandEntityId/brandName/videoAssetIds for exact HUA0165 ASIN were not available from local/live evidence in this run; SBV must not be created with invented asset fields.',
    },
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
      snapshot: writeJson(path.join(SNAPSHOT_DIR, 'hua0165_hot_season_traffic_push_before_2026-06-16.json'), beforeRows),
      productRows: beforeRows.map(summarizeCampaign),
      duplicateGuard: { existingNames: beforeRows.map(row => row.campaignName).filter(Boolean) },
    };

    const sensitive = await filterSensitiveKeywords(ws, SP_BROAD);
    const internal = await filterInternalKeywords(ws, SP_BROAD);
    const filteredBroad = removeBlockedKeywords(SP_BROAD, [sensitive.blocked, internal.blocked]);

    const planned = [
      { plan: SP_AUTO, built: buildSpCreatePayload(SP_AUTO), kind: 'spAuto', filtering: {} },
      {
        plan: filteredBroad.plan,
        built: buildSpCreatePayload(filteredBroad.plan),
        kind: 'spKeyword',
        filtering: { sensitiveCheck: sensitive.response?.json || null, sensitiveBlocked: sensitive.blocked, internalBlocked: internal.blocked, removed: filteredBroad.removed },
      },
      { plan: SP_EXPANDED, built: buildSpCreatePayload(SP_EXPANDED), kind: 'spTarget', filtering: {} },
    ];
    out.plans = planned.map(item => ({ kind: item.kind, plan: item.plan, built: item.built, filtering: item.filtering }));

    for (const item of planned) {
      const existing = beforeRows.find(row => normalizeTerm(row.campaignName) === normalizeTerm(item.plan.campaignName));
      if (!item.built.ok) {
        out.executions.push(skipped(item.plan, `build failed: ${(item.built.errors || []).join('; ')}`));
        continue;
      }
      if (existing) {
        out.executions.push(skipped(item.plan, `duplicate campaign exists: ${existing.campaignId || existing.primaryId || ''}`));
        continue;
      }
      if (item.kind === 'spKeyword' && (item.plan.keywords || []).length < 3) {
        out.executions.push(skipped(item.plan, 'fewer than 3 valid keywords after filtering'));
        continue;
      }
      out.executions.push(await createPlan(ws, item.plan, item.built, item.kind));
    }

    out.ok = out.executions.every(item => item.skipped ? item.reason === 'dry-run' : item.createOk && item.readback?.allLanded);
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  writeJson(OUT, out);
  console.log(JSON.stringify({
    out: OUT,
    dryRun: out.dryRun,
    ok: out.ok,
    sbvStatus: out.sbvStatus,
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
