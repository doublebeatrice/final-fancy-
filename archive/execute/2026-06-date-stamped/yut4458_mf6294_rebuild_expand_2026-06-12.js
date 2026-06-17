const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  buildSpCreatePayload,
  buildStateToggleRequest,
} = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'yut4458_mf6294_rebuild_expand_2026-06-12.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const BUSINESS_DATE = '2026-06-12';
const DATA_RANGE = ['2026-05-13', '2026-06-11'];
const EXECUTE = process.argv.includes('--execute');

const YUT = {
  sku: 'YUT4458',
  asin: 'B0D1VMCWXL',
  accountId: 737,
  siteId: 4,
  autoCampaignId: '167533189090878',
  autoAdGroupId: '478153832088964',
  pollutedCampaignId: '173702230856772',
  lowBidCampaignId: '549118348051109',
};

const MF = {
  sku: 'MF6294',
  asin: 'B0GMH7Q46X',
  accountId: 314,
  siteId: 4,
  autoCampaignId: '252297710887286',
  autoAdGroupId: '427388412063871',
};

const CREATE_PLANS = [
  {
    key: 'yut_kw_broad',
    sku: YUT.sku,
    asin: YUT.asin,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    mode: 'keywordTarget',
    campaignName: 'ai_kw broad_30th birthday pool float_yut4458',
    groupName: 'ai_kw broad_30th birthday pool float_yut4458',
    coreTerm: '30th birthday pool float',
    matchType: 'BROAD',
    dailyBudget: 3,
    defaultBid: 0.35,
    keywords: [
      '30th birthday pool float',
      'birthday pool float',
      'inflatable number 30 pool float',
      'number 30 pool float',
    ],
  },
  {
    key: 'yut_kw_phrase',
    sku: YUT.sku,
    asin: YUT.asin,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    mode: 'keywordTarget',
    campaignName: 'ai_kw phrase_30th birthday pool float_yut4458',
    groupName: 'ai_kw phrase_30th birthday pool float_yut4458',
    coreTerm: '30th birthday pool float',
    matchType: 'PHRASE',
    dailyBudget: 3,
    defaultBid: 0.35,
    keywords: [
      '30th birthday pool float',
      'birthday pool float',
      'inflatable number 30 pool float',
      'number 30 pool float',
      'inflatable number pool float',
    ],
  },
  {
    key: 'yut_kw_exact',
    sku: YUT.sku,
    asin: YUT.asin,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    mode: 'keywordTarget',
    campaignName: 'ai_kw exact_30th birthday pool float_yut4458',
    groupName: 'ai_kw exact_30th birthday pool float_yut4458',
    coreTerm: '30th birthday pool float',
    matchType: 'EXACT',
    dailyBudget: 3,
    defaultBid: 0.35,
    keywords: [
      '30th birthday pool float',
      'inflatable number 30 pool float',
      'number 30 pool float',
      '30 pool float',
    ],
  },
  {
    key: 'yut_asin_same_as',
    sku: YUT.sku,
    asin: YUT.asin,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    mode: 'productTarget',
    campaignName: 'ai_asin same_as_30th birthday pool float_yut4458',
    groupName: 'ai_asin same_as_30th birthday pool float_yut4458',
    coreTerm: '30th birthday pool float',
    targetType: 'ASIN_SAME_AS',
    dailyBudget: 3,
    defaultBid: 0.35,
    targetAsins: [
      'B0GF867T9Y',
      'B0CZ6ZVHRL',
      'B0DX5T5D86',
      'B0DPMW7NN8',
      'B0DPMW65TV',
    ],
  },
  {
    key: 'mf_kw_exact',
    sku: MF.sku,
    asin: MF.asin,
    accountId: MF.accountId,
    siteId: MF.siteId,
    mode: 'keywordTarget',
    campaignName: 'ai_kw exact_baby shower pool float_mf6294',
    groupName: 'ai_kw exact_baby shower pool float_mf6294',
    coreTerm: 'baby shower pool float',
    matchType: 'EXACT',
    dailyBudget: 3,
    defaultBid: 0.38,
    keywords: [
      'baby shower pool float',
      'baby shower pool decorations',
      'baby pool letters',
    ],
  },
  {
    key: 'mf_kw_phrase',
    sku: MF.sku,
    asin: MF.asin,
    accountId: MF.accountId,
    siteId: MF.siteId,
    mode: 'keywordTarget',
    campaignName: 'ai_kw phrase_baby shower pool float_mf6294',
    groupName: 'ai_kw phrase_baby shower pool float_mf6294',
    coreTerm: 'baby shower pool float',
    matchType: 'PHRASE',
    dailyBudget: 3,
    defaultBid: 0.36,
    keywords: [
      'baby shower pool float',
      'baby shower pool decorations',
      'baby pool letters',
      'floating pool decorations baby shower',
    ],
  },
  {
    key: 'mf_asin_same_as',
    sku: MF.sku,
    asin: MF.asin,
    accountId: MF.accountId,
    siteId: MF.siteId,
    mode: 'productTarget',
    campaignName: 'ai_asin same_as_baby shower pool float_mf6294',
    groupName: 'ai_asin same_as_baby shower pool float_mf6294',
    coreTerm: 'baby shower pool float',
    targetType: 'ASIN_SAME_AS',
    dailyBudget: 3,
    defaultBid: 0.35,
    targetAsins: [
      'B0GMXT7BNH',
      'B0F9YPGRW2',
      'B0GXK8VNPV',
      'B0G3X52QCC',
    ],
  },
];

const UPDATE_PLAN = [
  {
    key: 'yut_auto_budget',
    sku: YUT.sku,
    entityType: 'campaign',
    actionType: 'budget',
    campaignId: YUT.autoCampaignId,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    suggestedBudget: 3,
    reason: 'reuse clean 30th birthday auto lane as new-product discovery base; current budget is only 1 USD/day',
  },
  {
    key: 'yut_lowbid_budget_cap',
    sku: YUT.sku,
    entityType: 'campaign',
    actionType: 'budget',
    campaignId: YUT.lowBidCampaignId,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    suggestedBudget: 3,
    reason: 'cap legacy low-bid shell from 100 USD/day while the rebuilt structure becomes the measurable traffic source',
  },
  {
    key: 'yut_polluted_broad_pause',
    sku: YUT.sku,
    entityType: 'campaign',
    actionType: 'pause',
    campaignId: YUT.pollutedCampaignId,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    reason: 'replace mixed summer/gift broad structure with clean owned broad/phrase/exact lanes',
  },
  {
    key: 'yut_auto_high_bid',
    sku: YUT.sku,
    entityType: 'autoTarget',
    actionType: 'bid',
    campaignId: YUT.autoCampaignId,
    adGroupId: YUT.autoAdGroupId,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    type: 'queryHighRelMatches',
    targetId: '388169482806019',
    suggestedBid: 0.32,
    reason: 'open high-rel auto bucket to the SKU lifetime CPC band instead of keeping it at 0.20 with near-zero delivery',
  },
  {
    key: 'yut_auto_broad_bid',
    sku: YUT.sku,
    entityType: 'autoTarget',
    actionType: 'bid',
    campaignId: YUT.autoCampaignId,
    adGroupId: YUT.autoAdGroupId,
    accountId: YUT.accountId,
    siteId: YUT.siteId,
    type: 'queryBroadRelMatches',
    targetId: '470682153089906',
    suggestedBid: 0.32,
    reason: 'open discovery bucket to the SKU lifetime CPC band while keeping product-page auto buckets unchanged',
  },
  {
    key: 'mf_auto_broad_enable',
    sku: MF.sku,
    entityType: 'autoTarget',
    actionType: 'enable',
    campaignId: MF.autoCampaignId,
    adGroupId: MF.autoAdGroupId,
    accountId: MF.accountId,
    siteId: MF.siteId,
    type: 'queryBroadRelMatches',
    targetId: '455668177920181',
    reason: '30d 58 clicks / 5 orders / 8.93% ACOS but current state=2; restore proven broad-rel delivery',
  },
  {
    key: 'mf_auto_high_bid',
    sku: MF.sku,
    entityType: 'autoTarget',
    actionType: 'bid',
    campaignId: MF.autoCampaignId,
    adGroupId: MF.autoAdGroupId,
    accountId: MF.accountId,
    siteId: MF.siteId,
    type: 'queryHighRelMatches',
    targetId: '370202926948329',
    suggestedBid: 0.36,
    reason: '30d 49 clicks / 4 orders / 11.61% ACOS with observed CPC 0.36; current 0.02 caused 7d zero impressions',
  },
];

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

async function fetchSkuProductRows(ws, sku, siteId = 4) {
  const response = await advRequest(ws, 'POST', '/product/adProductData', {
    selectDate: DATA_RANGE,
    mode: 1,
    state: 1,
    siteId,
    sku,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  });
  return rowsFrom(response).filter(row => String(row.sku || '').toUpperCase() === sku.toUpperCase());
}

async function fetchAutoRows(ws, item) {
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: item.siteId,
    ...datePayload(),
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: item.accountId,
    campaignId: item.campaignId,
    adGroupId: item.adGroupId,
    property: '2',
    tableName: 'product_target',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return rowsFrom(response).filter(row =>
    String(row.campaignId || '') === String(item.campaignId) &&
    String(row.adGroupId || '') === String(item.adGroupId)
  );
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
    campaignId: String(row.campaignId || row.id || ''),
    campaignName: row.campaignName || '',
    adGroupId: String(row.adGroupId || ''),
    groupName: row.groupName || '',
    dailyBudget: row.dailyBudget || row.budget || '',
    campaignState: row.campaignState ?? row.state ?? '',
    groupState: row.groupState ?? '',
    state: row.state ?? '',
    servingStatus: row.servingStatus || '',
    impressions: row.Impressions ?? row.impressions ?? null,
    clicks: row.Clicks ?? row.clicks ?? null,
    spend: row.Spend ?? row.spend ?? null,
    orders: row.Orders ?? row.orders ?? null,
    sales: row.Sales ?? row.sales ?? null,
  };
}

function summarizeAuto(row = {}) {
  return {
    targetId: String(row.targetId || row.id || ''),
    type: row.type || '',
    bid: row.bid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    impressions: row.Impressions ?? null,
    clicks: row.Clicks ?? null,
    spend: row.Spend ?? null,
    orders: row.Orders ?? null,
    sales: row.Sales ?? null,
    cpc: row.CPC ?? null,
    acos: row.ACOS ?? null,
    updatedAt: row.updatedAt || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    accountId: row.accountId,
    siteId: row.siteId,
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

async function filterSensitiveKeywords(ws, plan) {
  if (plan.mode !== 'keywordTarget' || !plan.keywords?.length) return { response: null, blocked: [] };
  const response = await advRequest(ws, 'POST', '/keyword/checkSensitiveWord', {
    siteId: plan.siteId,
    advType: 'SP',
    keywords_array: plan.keywords,
  });
  return { response, blocked: Object.keys(response?.json?.data || {}) };
}

async function filterInternalKeywords(ws, plan) {
  if (plan.mode !== 'keywordTarget' || !plan.keywords?.length) return { response: null, blocked: [] };
  const response = await advRequest(ws, 'POST', '/filter/filterInternalAsinAndBrand', {
    siteId: plan.siteId,
    accountId: plan.accountId,
    targetType: 'keyword',
    productAsinArray: [plan.asin],
    targetArray: plan.keywords,
    advType: 'SP',
  });
  return { response, blocked: Object.values(response?.json?.data || {}).flat().map(String) };
}

function buildBudgetPayload(row, suggestedBudget, fallback) {
  const campaignId = String(row.campaignId || fallback.campaignId);
  const accountId = Number(row.accountId || fallback.accountId);
  const siteId = Number(row.siteId || fallback.siteId || 4);
  return {
    siteId,
    accountId,
    campaignNewArray: [{
      siteId,
      accountId,
      campaignId,
      budget: Number(suggestedBudget).toFixed(2),
    }],
    batchType: 'add-budget-value',
    batch_campaigns: [campaignId],
    columnVal: [Number(suggestedBudget).toFixed(2)],
    campaignIdArray: [campaignId],
    column: 'budget',
    property: 'campaign',
    operation: 'dailyBudget',
  };
}

function buildAutoBidPayload(row, suggestedBid, fallback) {
  const targetId = String(row.targetId || row.id || fallback.targetId);
  const campaignId = String(row.campaignId || fallback.campaignId);
  const adGroupId = String(row.adGroupId || fallback.adGroupId);
  const accountId = Number(row.accountId || fallback.accountId);
  const siteId = Number(row.siteId || fallback.siteId || 4);
  const targetRow = {
    ...row,
    targetId,
    campaignId,
    adGroupId,
    accountId,
    siteId,
    bid: String(suggestedBid),
    advType: 'SP',
  };
  return {
    column: 'bid',
    property: 'autoTarget',
    operation: 'bid',
    accountId,
    siteId,
    idArray: [targetId],
    campaignIdArray: [campaignId],
    targetArray: [targetRow],
    targetNewArray: [targetRow],
  };
}

function extractCreateMeta(response = {}) {
  const json = response?.json || response;
  const data = json?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || json?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || json?.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || json?.campaignName || '',
    groupName: param.groupName || data.groupName || json?.groupName || '',
  };
}

function plannedCreateIsAllowedSkip(item) {
  const targetCount = item.plan.mode === 'keywordTarget'
    ? (item.plan.keywords || []).length
    : (item.plan.targetAsins || []).length;
  return targetCount < 3 &&
    ((item.filterRecord?.sensitiveBlocked || []).length > 0 ||
      (item.filterRecord?.internalBlocked || []).length > 0 ||
      (item.filterRecord?.removedOwnAsin || []).length > 0);
}

async function fetchCreatedKeywords(ws, plan, createMeta) {
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
    property: '1',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const wanted = new Set(plan.keywords.map(normalizeTerm));
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
  const wanted = new Set(plan.targetAsins.map(value => String(value).toUpperCase()));
  return rowsFrom(response)
    .filter(row =>
      String(row.campaignId || '') === createMeta.campaignId &&
      String(row.adGroupId || '') === createMeta.adGroupId &&
      wanted.has(targetAsinFromRow(row))
    )
    .map(summarizeManualTarget);
}

async function verifyCreatedPlan(ws, plan, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 15000, 30000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const rows = plan.mode === 'keywordTarget'
      ? await fetchCreatedKeywords(ws, plan, createMeta)
      : await fetchCreatedManualTargets(ws, plan, createMeta);
    attempts.push({ delayMs, rows });
    const expected = plan.mode === 'keywordTarget' ? plan.keywords.length : plan.targetAsins.length;
    if (rows.length >= expected) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const expectedValues = plan.mode === 'keywordTarget'
    ? plan.keywords.map(normalizeTerm)
    : plan.targetAsins.map(value => String(value).toUpperCase());
  const landedValues = plan.mode === 'keywordTarget'
    ? last.rows.map(row => normalizeTerm(row.keywordText))
    : last.rows.map(row => row.asin);
  const missingAfter = expectedValues.filter(value => !landedValues.includes(value));
  return {
    attempts,
    landedRows: last.rows,
    missingAfter,
    allLanded: missingAfter.length === 0 &&
      last.rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

async function main() {
  const out = {
    exportedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    dryRun: !EXECUTE,
    gbrainKeywords: [
      'YUT4458',
      'MF6294',
      'B0D1VMCWXL',
      'B0GMH7Q46X',
      '30th birthday pool float',
      'baby shower pool float',
      'SKU诊断顺序前台市场优先纠偏',
      '广告调整完整结构',
    ],
    evidenceBoundary: 'live ad backend read on 2026-06-12; GBrain used as historical rule/decision memory; Amazon front-search and market evidence from 2026-06-12 prior live reads in the same work session.',
    operatingRoute: {
      YUT4458: 'operator override: treat as new-product rebuild, replace polluted broad/legacy low-bid structure with clean owned SP coverage and measurable stop-loss checkpoints.',
      MF6294: 'controlled push / expansion: restore proven auto delivery and add owned baby-shower keyword/ASIN expansion; do not fund generic balloon/summer residue.',
    },
    bidEvidence: {
      YUT4458: 'SKU 30d CPC 0.2827, lifetime CPC 0.3225, product-line CPC 0.4676; selected 0.32 for reused auto buckets and 0.35 for new keyword/ASIN rows.',
      MF6294: 'SKU 30d CPC 0.3342, proven auto group CPC 0.3293, queryHighRelMatches 30d CPC 0.36; selected 0.36 high-rel bid, 0.36-0.38 keyword bids, 0.35 ASIN bid.',
    },
    preflight: null,
    updateActions: [],
    createPlans: [],
    executions: [],
    ok: false,
  };

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const [yutProductRows, mfProductRows] = await Promise.all([
      fetchSkuProductRows(ws, YUT.sku, YUT.siteId),
      fetchSkuProductRows(ws, MF.sku, MF.siteId),
    ]);
    const [yutAutoRows, mfAutoRows] = await Promise.all([
      fetchAutoRows(ws, { ...YUT, campaignId: YUT.autoCampaignId, adGroupId: YUT.autoAdGroupId }),
      fetchAutoRows(ws, { ...MF, campaignId: MF.autoCampaignId, adGroupId: MF.autoAdGroupId }),
    ]);
    const beforeSnapshot = saveSnapshot('yut4458_mf6294_rebuild_expand_before_2026-06-12.json', {
      yutProductRows: yutProductRows.map(summarizeCampaign),
      mfProductRows: mfProductRows.map(summarizeCampaign),
      yutAutoRows: yutAutoRows.map(summarizeAuto),
      mfAutoRows: mfAutoRows.map(summarizeAuto),
    });

    out.preflight = {
      beforeSnapshot,
      yutProductRows: yutProductRows.map(summarizeCampaign),
      mfProductRows: mfProductRows.map(summarizeCampaign),
      yutAutoRows: yutAutoRows.map(summarizeAuto),
      mfAutoRows: mfAutoRows.map(summarizeAuto),
    };

    for (const action of UPDATE_PLAN) {
      let row = null;
      let built = null;
      let requestUrl = '';
      if (action.entityType === 'campaign') {
        const rows = action.sku === YUT.sku ? yutProductRows : mfProductRows;
        row = rows.find(item => String(item.campaignId || '') === String(action.campaignId)) || null;
        if (action.actionType === 'budget') {
          built = { ok: !!row, requestBody: row ? buildBudgetPayload(row, action.suggestedBudget, action) : null, reason: row ? '' : 'campaign row not found' };
          requestUrl = '/campaign/batchCampaign';
        } else {
          built = row ? buildStateToggleRequest({ ...row, accountId: action.accountId, siteId: action.siteId }, action.actionType, 'campaign') : { ok: false, reason: 'campaign row not found' };
          requestUrl = built.requestUrl;
        }
      } else if (action.entityType === 'autoTarget') {
        const rows = action.sku === YUT.sku ? yutAutoRows : mfAutoRows;
        row = rows.find(item => String(item.targetId || item.id || '') === String(action.targetId)) || null;
        if (action.actionType === 'bid') {
          built = { ok: !!row, requestBody: row ? buildAutoBidPayload(row, action.suggestedBid, action) : null, reason: row ? '' : 'auto target row not found' };
          requestUrl = '/advTarget/batchEditAutoTarget';
        } else {
          built = row ? buildStateToggleRequest({ ...row, accountId: action.accountId, siteId: action.siteId }, action.actionType, 'autoTarget') : { ok: false, reason: 'auto target row not found' };
          requestUrl = built.requestUrl;
        }
      }

      const result = {
        action,
        before: row ? (action.entityType === 'autoTarget' ? summarizeAuto(row) : summarizeCampaign(row)) : null,
        requestUrl,
        built,
        response: null,
        after: null,
        ok: false,
        dryRun: !EXECUTE,
      };

      if (!built?.ok) {
        result.ok = false;
      } else if (!EXECUTE) {
        result.ok = true;
      } else {
        result.response = await advRequest(ws, 'PATCH', requestUrl, built.requestBody);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (action.entityType === 'campaign') {
          const afterRows = await fetchSkuProductRows(ws, action.sku, action.siteId);
          const after = afterRows.find(item => String(item.campaignId || '') === String(action.campaignId)) || null;
          result.after = after ? summarizeCampaign(after) : null;
          if (action.actionType === 'budget') {
            result.ok = Number(result.response?.json?.code) === 200 &&
              Math.abs(Number(result.after?.dailyBudget) - Number(action.suggestedBudget)) < 0.001;
          } else if (action.actionType === 'pause') {
            result.ok = Number(result.response?.json?.code) === 200 &&
              Number(result.after?.campaignState) === 2;
          }
        } else {
          const afterRows = await fetchAutoRows(ws, action);
          const after = afterRows.find(item => String(item.targetId || item.id || '') === String(action.targetId)) || null;
          result.after = after ? summarizeAuto(after) : null;
          if (action.actionType === 'bid') {
            result.ok = Number(result.response?.json?.code) === 200 &&
              Math.abs(Number(result.after?.bid) - Number(action.suggestedBid)) < 0.001;
          } else if (action.actionType === 'enable') {
            result.ok = Number(result.response?.json?.code) === 200 &&
              Number(result.after?.state) === 1;
          }
        }
      }
      out.updateActions.push(result);
    }

    const filteredPlans = [];
    for (const plan of CREATE_PLANS) {
      let filtered = { ...plan };
      const filterRecord = { key: plan.key, sensitiveBlocked: [], internalBlocked: [], removedOwnAsin: [] };
      if (plan.mode === 'keywordTarget') {
        const sensitive = await filterSensitiveKeywords(ws, plan);
        const internal = await filterInternalKeywords(ws, plan);
        const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm));
        filterRecord.sensitiveBlocked = sensitive.blocked;
        filterRecord.internalBlocked = internal.blocked;
        filtered = {
          ...plan,
          keywords: plan.keywords.filter(keyword => !blocked.has(normalizeTerm(keyword))),
        };
      } else if (plan.mode === 'productTarget') {
        filtered = {
          ...plan,
          targetAsins: plan.targetAsins.filter(asin => String(asin).toUpperCase() !== plan.asin),
        };
        filterRecord.removedOwnAsin = plan.targetAsins.filter(asin => String(asin).toUpperCase() === plan.asin);
      }
      const built = buildSpCreatePayload(filtered);
      filteredPlans.push(filtered);
      out.createPlans.push({ plan: filtered, filterRecord, built });
    }

    for (const item of out.createPlans) {
      const result = {
        key: item.plan.key,
        plan: item.plan,
        createOk: false,
        response: null,
        createMeta: null,
        readback: null,
        skipped: false,
        reason: '',
        dryRun: !EXECUTE,
      };
      const targetCount = item.plan.mode === 'keywordTarget'
        ? item.plan.keywords.length
        : item.plan.targetAsins.length;
      if (!item.built.ok) {
        result.skipped = true;
        result.reason = item.built.errors.join('; ');
      } else if (targetCount < 3) {
        result.skipped = true;
        result.reason = `only ${targetCount} valid targets remain`;
      } else if (!EXECUTE) {
        result.createOk = true;
        result.reason = 'dry run only';
      } else {
        result.response = await advRequest(ws, 'POST', item.built.requestUrl, item.built.requestBody);
        result.createMeta = extractCreateMeta(result.response);
        result.createOk = Number(result.response?.json?.code) === 200 &&
          String(result.response?.json?.msg || '').toLowerCase() === 'success' &&
          !!result.createMeta.campaignId &&
          !!result.createMeta.adGroupId;
      }
      out.executions.push(result);
    }

    if (EXECUTE) {
      for (const result of out.executions.filter(item => item.createOk)) {
        result.readback = await verifyCreatedPlan(ws, result.plan, result.createMeta);
      }
    }

    out.exportedAt = new Date().toISOString();
    out.ok = EXECUTE
      ? out.updateActions.every(item => item.ok) &&
        out.executions.every(item => item.skipped || (item.createOk && item.readback?.allLanded))
      : out.updateActions.every(item => item.ok) &&
        out.createPlans.every(item => item.built.ok || plannedCreateIsAllowedSkip(item));
    writeJson(OUT, out);

    console.log(JSON.stringify({
      out: OUT,
      mode: EXECUTE ? 'execute' : 'dry-run',
      ok: out.ok,
      updates: out.updateActions.map(item => ({
        key: item.action.key,
        ok: item.ok,
        before: item.before,
        after: item.after,
        requestUrl: item.requestUrl,
        reason: item.action.reason,
      })),
      creates: out.executions.map(item => ({
        key: item.key,
        createOk: item.createOk,
        skipped: item.skipped,
        reason: item.reason,
        campaignName: item.plan.campaignName,
        dailyBudget: item.plan.dailyBudget,
        defaultBid: item.plan.defaultBid,
        targetCount: item.plan.mode === 'keywordTarget' ? item.plan.keywords.length : item.plan.targetAsins.length,
        campaignId: item.createMeta?.campaignId || '',
        adGroupId: item.createMeta?.adGroupId || '',
        landedRows: item.readback?.landedRows || [],
        missingAfter: item.readback?.missingAfter || [],
        allLanded: item.readback?.allLanded || false,
      })),
    }, null, 2));
    if (!out.ok) process.exitCode = EXECUTE ? 2 : 1;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
