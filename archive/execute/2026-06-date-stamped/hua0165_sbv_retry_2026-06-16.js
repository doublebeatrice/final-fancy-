const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSbvCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'hua0165_sbv_retry_2026-06-16.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');
const DATA_RANGE = ['2026-06-16', '2026-06-16'];

const SKU = 'HUA0165';
const ASIN = 'B0C8M4Z2NL';
const ACCOUNT_ID = 600;
const SITE_ID = 4;
const BRAND_ENTITY_ID = 'ENTITYQ4TX1D7MOKFE';
const BRAND_NAME = 'Suhine';
const VIDEO_ASSET_ID = 'amzn1.assetlibrary.asset1.d5a75ad3122b05dd9401f0d5980f52dc';

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
  campaignName: 'sbvkw_broad_flip flops bulk_hua0165',
  groupName: 'sbvkw_broad_flip flops bulk_hua0165',
  coreTerm: 'flip flops bulk',
  dailyBudget: 10,
  defaultBid: 0.72,
  adFormat: 'video',
  landingType: 2,
  videoType: '简易',
  videoAssetIds: [VIDEO_ASSET_ID],
  keywords: [
    { keywordText: 'flip flops bulk', matchType: 'BROAD', bid: 0.72 },
    { keywordText: 'bulk flip flops', matchType: 'BROAD', bid: 0.72 },
    { keywordText: 'disposable flip flops', matchType: 'BROAD', bid: 0.72 },
    { keywordText: 'wedding flip flops bulk', matchType: 'BROAD', bid: 0.72 },
    { keywordText: 'flip flops for wedding guests', matchType: 'BROAD', bid: 0.72 },
    { keywordText: 'bulk wedding flip flops', matchType: 'BROAD', bid: 0.72 },
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

function rowsFrom(response) {
  const json = response?.json || response || {};
  const data = json.data || {};
  return data.records || data.data || data.list || data.rows || json.records || json.list || json.rows ||
    (Array.isArray(json.data) ? json.data : []);
}

function summarizeCampaign(row = {}) {
  return {
    campaignId: String(row.campaignId || row.primaryId || ''),
    campaignName: row.campaignName || '',
    adGroupId: String(row.groups?.[0]?.adGroupId || row.adGroupId || ''),
    groupName: row.groups?.[0]?.name || row.groupName || '',
    adFormat: row.adFormat || '',
    dailyBudget: row.dailyBudget || row.budget || '',
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    servingStatus: row.servingStatus || '',
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
  const response = await advRequest(ws, 'POST', '/keyword/checkSensitiveWord', {
    siteId: plan.siteId,
    advType: plan.advType || 'SB',
    keywords_array: terms,
  });
  const blocked = Object.entries(response?.json?.data || {})
    .filter(([, value]) => Object.values(value || {}).some(item => String(item?.flag || item?.reason || '').trim()))
    .map(([term]) => term);
  return { response, blocked };
}

async function filterInternalKeywords(ws, plan) {
  const terms = (plan.keywords || []).map(item => typeof item === 'string' ? item : item.keywordText);
  const response = await advRequest(ws, 'POST', '/filter/filterInternalAsinAndBrand', {
    siteId: plan.siteId,
    accountId: plan.accountId,
    targetType: 'keyword',
    productAsinArray: [plan.asin],
    targetArray: terms,
    advType: plan.advType || 'SB',
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

async function fetchCreatedKeywords(ws, plan, createMeta) {
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: plan.siteId,
    ...datePayload(),
    state: '1',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: plan.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '4',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '1' },
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

async function verifyCreatedPlan(ws, plan, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 20000, 45000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const rows = await fetchCreatedKeywords(ws, plan, createMeta);
    attempts.push({ delayMs, rows });
    if (rows.length >= plan.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const expectedValues = plan.keywords.map(item => normalizeTerm(typeof item === 'string' ? item : item.keywordText));
  const landedValues = last.rows.map(row => normalizeTerm(row.keywordText));
  const missingAfter = expectedValues.filter(value => !landedValues.includes(value));
  return {
    attempts,
    landedRows: last.rows,
    missingAfter,
    allLanded: missingAfter.length === 0 && last.rows.every(row => {
      const campaignEnabled = String(row.campaignState).toUpperCase() === 'ENABLED' || Number(row.campaignState) === 1;
      return Number(row.state) === 1 && campaignEnabled &&
        (row.groupState === '' || Number(row.groupState) === 1 || String(row.groupState).toUpperCase() === 'ENABLED');
    }),
  };
}

async function main() {
  const out = {
    exportedAt: new Date().toISOString(),
    dryRun: !EXECUTE,
    gbrainKeywords: ['HUA0165', 'B0C8M4Z2NL', 'SBV', 'Suhine'],
    evidenceBoundary: 'Live ad backend on 2026-06-16 plus GBrain history for the single-day 1500-impression objective.',
    operatingGoal: 'Retry SBV for HUA0165 to raise same-day impressions during the summer hot-sale window and reduce inventory stagnation risk.',
    brandEvidence: {
      source: '/sbProduct/getStore',
      brandEntityId: BRAND_ENTITY_ID,
      brandRegistryName: BRAND_NAME,
      snapshot: 'data/snapshots/hua0165_sb_brand_probe_2026-06-16.json',
    },
    videoEvidence: {
      source: '/amazonAsset/getAssetList',
      exactAsinAssetFound: true,
      asin: ASIN,
      assetId: VIDEO_ASSET_ID,
      assetName: 'suhine_150_pairs_flip_flops_bulk_pack_slippers.mp4',
      status: 'ACTIVE',
      snapshot: 'data/snapshots/amazon_asset_video_HUA0165_B0C8M4Z2NL_2026-06-16.json',
    },
    bidEvidence: {
      selectedSbvBid: SBV_BROAD.defaultBid,
      basis: 'Same hot-season traffic push bid as newly landed SP auto/broad/ASIN expanded lanes; market keyword conversion showed flip flops bulk CPC start 0.65 and median 0.86.',
    },
    preflight: null,
    plan: null,
    execution: null,
    ok: false,
  };

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const beforeRows = await fetchSkuProductRows(ws);
    out.preflight = {
      snapshot: saveSnapshot('hua0165_sbv_retry_before_2026-06-16.json', beforeRows),
      productRows: beforeRows.map(summarizeCampaign),
      duplicateGuard: {
        existingNames: beforeRows.map(row => row.campaignName).filter(Boolean),
      },
    };

    const sensitive = await filterSensitiveKeywords(ws, SBV_BROAD);
    const internal = await filterInternalKeywords(ws, SBV_BROAD);
    const filtered = removeBlockedKeywords(SBV_BROAD, [sensitive.blocked, internal.blocked]);
    const built = buildSbvCreatePayload(filtered.plan);
    out.plan = {
      plan: filtered.plan,
      built,
      filtering: {
        sensitiveBlocked: sensitive.blocked,
        internalBlocked: internal.blocked,
        removed: filtered.removed,
      },
    };

    const existing = beforeRows.find(row => normalizeTerm(row.campaignName) === normalizeTerm(filtered.plan.campaignName));
    if (!built.ok) {
      out.execution = { skipped: true, reason: `build failed: ${(built.errors || []).join('; ')}` };
    } else if (existing) {
      out.execution = { skipped: true, reason: `duplicate campaign exists: ${existing.campaignId || existing.primaryId || ''}` };
    } else if ((filtered.plan.keywords || []).length < 3) {
      out.execution = { skipped: true, reason: 'fewer than 3 valid keywords after filtering' };
    } else if (!EXECUTE) {
      out.execution = { skipped: true, reason: 'dry-run' };
      out.ok = true;
    } else {
      const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
      const createOk = Number(response?.json?.code) === 200 && String(response?.json?.msg || '').toLowerCase() === 'success';
      const createMeta = extractCreateMeta(response);
      const readback = createOk && createMeta.campaignId && createMeta.adGroupId
        ? await verifyCreatedPlan(ws, filtered.plan, createMeta)
        : null;
      out.execution = {
        skipped: false,
        createOk,
        createMeta,
        response,
        readback,
      };
      out.ok = createOk && readback?.allLanded;
    }
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  writeJson(OUT, out);
  console.log(JSON.stringify({
    out: OUT,
    dryRun: out.dryRun,
    ok: out.ok,
    planOk: out.plan?.built?.ok || false,
    filtering: out.plan?.filtering,
    execution: {
      skipped: out.execution?.skipped,
      reason: out.execution?.reason,
      createOk: out.execution?.createOk,
      campaignId: out.execution?.createMeta?.campaignId || '',
      adGroupId: out.execution?.createMeta?.adGroupId || '',
      landedRows: out.execution?.readback?.landedRows?.length || 0,
      missingAfter: out.execution?.readback?.missingAfter || [],
      allLanded: out.execution?.readback?.allLanded || false,
      responseCode: out.execution?.response?.json?.code ?? null,
      responseMsg: out.execution?.response?.json?.msg || '',
    },
  }, null, 2));
  if (EXECUTE && !out.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
