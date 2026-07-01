const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const { buildSbvCreatePayload } = require('../auto_adjust');
const { resolveSkuAccount } = require('./adv_backend');
const {
  buildAmazonAssetListPayload,
  findAmazonAssetByAsin,
  findAmazonAssetById,
  getAmazonAssetRows,
  normalizeAmazonAssets,
} = require('./sbv_asset_library');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function parseArgs(args = []) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    out[key] = inlineValue !== undefined ? inlineValue : args[i + 1];
    if (inlineValue === undefined) i += 1;
  }
  return out;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function rowsFrom(response) {
  const json = response?.json || response || {};
  const data = json.data || {};
  return data.records || data.data || data.list || data.rows || json.records || json.list || json.rows ||
    (Array.isArray(json.data) ? json.data : []);
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

function parseCsvList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[,，\n]+/)
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sensitiveBlockedTerms(data = {}) {
  // /keyword/checkSensitiveWord returns three flag tiers in `flag`:
  //   - "禁用" / "禁止" / "拒绝" → hard block, Amazon will reject the keyword
  //   - "人工排查" (specialMark=3) → advisory only, sales team is asked to
  //     eyeball it; Amazon itself accepts the keyword. Historical evidence:
  //     YUT3185 already runs `ai_kw exact_size4 soccer ball_yut3185` ENABLED
  //     for weeks despite the API flagging "4" and "ball" as advisory.
  //   - empty flag → no concern.
  // We only block hard tiers. Advisory hits are surfaced via the second
  // return value so the caller can show them to the operator without
  // dropping the keyword from the create payload.
  const advisoryPattern = /人工排查|审核|review/i;
  const hardPattern = /禁用|禁止|拒绝|违禁|block|reject|forbid/i;
  const blocked = [];
  const advisory = [];
  for (const [term, hits] of Object.entries(data || {})) {
    let hardHit = false;
    let advisoryHit = false;
    for (const item of Object.values(hits || {})) {
      const flag = String(item?.flag || '').trim();
      if (hardPattern.test(flag)) hardHit = true;
      else if (advisoryPattern.test(flag) || Number(item?.specialMark) === 3) advisoryHit = true;
      else if (flag) hardHit = true;
    }
    if (hardHit) blocked.push(term);
    else if (advisoryHit) advisory.push(term);
  }
  return { blocked, advisory };
}

function removeBlockedKeywords(plan, blockedLists) {
  const blocked = new Set(blockedLists.flat().map(normalizeTerm).filter(Boolean));
  if (!blocked.size) return { plan, removed: [] };
  const keywords = (plan.keywords || []).filter(item => {
    const text = typeof item === 'string' ? item : item.keywordText;
    return !blocked.has(normalizeTerm(text));
  });
  return {
    plan: { ...plan, keywords },
    removed: (plan.keywords || []).filter(item => {
      const text = typeof item === 'string' ? item : item.keywordText;
      return blocked.has(normalizeTerm(text));
    }),
  };
}

function summarizeCampaign(row = {}) {
  return {
    campaignId: String(row.campaignId || row.primaryId || ''),
    campaignName: row.campaignName || row.name || '',
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
    adFormat: row.adFormat || '',
  };
}

function buildDatePayload(startYmd, endYmd) {
  return {
    timeRange: [
      new Date(`${startYmd}T00:00:00`).getTime(),
      new Date(new Date(`${endYmd}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    selectDate: [startYmd, endYmd],
    dateRange: [startYmd, endYmd],
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

async function advRequest(ws, method, pathname, payload = {}) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const request = {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) }
    };
    let url = ${JSON.stringify(pathname)};
    if (${JSON.stringify(method)} === 'GET') {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(${JSON.stringify(payload)})) query.set(key, String(value));
      url += '?' + query.toString();
    } else {
      request.body = ${JSON.stringify(JSON.stringify(payload))};
    }
    const res = await fetch(url, request);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { code: 0, msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

async function fetchBrand(ws, plan) {
  if (plan.brand && plan.brandName) {
    return {
      brandEntityId: plan.brand,
      brandRegistryName: plan.brandName,
      source: 'input',
      response: null,
    };
  }
  // Prefer ASIN-bound brand from /amazonAsset/getExternalAssetUrl: it returns
  // the brand the ASIN is actually advertised under (matches what SBV create
  // requires). /sbProduct/getStore returns the account's first registered
  // brand and can mismatch when an account holds multiple brands.
  if (plan.asin) {
    const externalResp = await advRequest(ws, 'POST', '/amazonAsset/getExternalAssetUrl', {
      type: 'video',
      siteId: plan.siteId,
      skuOrAsin: plan.asin,
      accountId: plan.accountId,
    });
    const brandInfo = externalResp?.json?.data?.brandInfo;
    const externalAssets = Array.isArray(externalResp?.json?.data?.assets) ? externalResp.json.data.assets : [];
    if (brandInfo?.brandEntityId && brandInfo?.brandRegistryName) {
      return {
        brandEntityId: brandInfo.brandEntityId,
        brandRegistryName: brandInfo.brandRegistryName,
        source: '/amazonAsset/getExternalAssetUrl',
        response: externalResp,
        externalAssets,
      };
    }
  }
  const response = await advRequest(ws, 'GET', '/sbProduct/getStore', {
    siteId: plan.siteId,
    accountId: plan.accountId,
  });
  const rows = rowsFrom(response);
  const selected = plan.brand
    ? rows.find(row => String(row.brandEntityId || '') === String(plan.brand))
    : rows[0];
  if (!selected?.brandEntityId || !selected?.brandRegistryName) {
    return { error: 'brand_missing', response, rows };
  }
  return {
    brandEntityId: selected.brandEntityId,
    brandRegistryName: selected.brandRegistryName,
    source: '/sbProduct/getStore',
    response,
    rows,
  };
}

async function fetchVideoAsset(ws, plan, brand) {
  if ((plan.videoAssetIds || []).length) {
    return {
      matchedAsset: {
        assetId: plan.videoAssetIds[0],
        associatedAsins: [plan.asin],
        status: 'input',
      },
      source: 'input',
      rowCount: null,
    };
  }
  const built = buildAmazonAssetListPayload({
    accountId: plan.accountId,
    siteId: plan.siteId,
    brandEntityId: brand.brandEntityId,
    brandRegistryName: brand.brandRegistryName,
    asin: plan.asin,
    limit: 50,
  });
  if (!built.ok) return { error: 'asset_payload_invalid', errors: built.errors };
  const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
  const rows = getAmazonAssetRows(response.json || {});
  const matchedAsset = findAmazonAssetById(rows, plan.videoAssetId || '') || findAmazonAssetByAsin(rows, plan.asin);
  // Amazon Asset Library miss does not always mean "no video": the asset may
  // exist in the internal OSS store and just not be synced to Amazon yet.
  // Surface that hint via the brand-step external assets so the caller can
  // distinguish "go upload" from "go trigger Amazon sync".
  const externalAssets = Array.isArray(brand?.externalAssets) ? brand.externalAssets : [];
  return {
    source: built.requestUrl,
    requestBody: built.requestBody,
    response,
    rowCount: rows.length,
    normalizedAssets: normalizeAmazonAssets(rows),
    matchedAsset,
    externalAssets,
    pendingAmazonSync: !matchedAsset && externalAssets.length > 0,
  };
}

async function fetchSkuProductRows(ws, plan, startYmd, endYmd) {
  const response = await advRequest(ws, 'POST', '/product/adProductData', {
    selectDate: [startYmd, endYmd],
    mode: 1,
    state: 1,
    siteId: plan.siteId,
    sku: plan.sku,
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
  const { blocked, advisory } = sensitiveBlockedTerms(response?.json?.data || {});
  return { response, blocked, advisory };
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

async function fetchCreatedKeywords(ws, plan, createMeta, startYmd, endYmd) {
  const response = await advRequest(ws, 'POST', '/keyword/findAllNew', {
    siteId: plan.siteId,
    ...buildDatePayload(startYmd, endYmd),
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
  return {
    response,
    rows: rowsFrom(response)
      .filter(row =>
        String(row.campaignId || '') === createMeta.campaignId &&
        String(row.adGroupId || '') === createMeta.adGroupId &&
        wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))
      )
      .map(summarizeKeyword),
  };
}

async function fetchSbCampaignRows(ws, plan, createMeta, startYmd, endYmd) {
  const response = await advRequest(ws, 'POST', '/campaignSb/findAllNew', {
    siteId: plan.siteId,
    accountId: plan.accountId,
    campaignId: createMeta.campaignId,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 100,
    selectDate: [startYmd, endYmd],
    timeRange: [
      new Date(`${startYmd}T00:00:00`).getTime(),
      new Date(new Date(`${endYmd}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
  });
  return {
    response,
    rows: rowsFrom(response)
      .filter(row => String(row.campaignId || row.primaryId || '') === createMeta.campaignId)
      .map(summarizeCampaign),
  };
}

async function verifyCreatedPlan(ws, plan, createMeta, startYmd, endYmd, delays = [0, 20000, 45000]) {
  const attempts = [];
  let campaignRows = [];
  for (const delayMs of delays) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const keywordRead = await fetchCreatedKeywords(ws, plan, createMeta, startYmd, endYmd);
    const campaignRead = await fetchSbCampaignRows(ws, plan, createMeta, startYmd, endYmd);
    campaignRows = campaignRead.rows;
    attempts.push({ delayMs, keywordRows: keywordRead.rows, campaignRows: campaignRead.rows });
    if (keywordRead.rows.length >= plan.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { keywordRows: [] };
  const expectedValues = plan.keywords.map(item => normalizeTerm(typeof item === 'string' ? item : item.keywordText));
  const landedValues = last.keywordRows.map(row => normalizeTerm(row.keywordText));
  const missingAfter = expectedValues.filter(value => !landedValues.includes(value));
  const allKeywordsEnabled = missingAfter.length === 0 && last.keywordRows.every(row => {
    const campaignEnabled = String(row.campaignState).toUpperCase() === 'ENABLED' || Number(row.campaignState) === 1;
    return Number(row.state) === 1 && campaignEnabled &&
      (row.groupState === '' || Number(row.groupState) === 1 || String(row.groupState).toUpperCase() === 'ENABLED');
  });
  return {
    attempts,
    campaignRows,
    landedRows: last.keywordRows,
    missingAfter,
    allLanded: allKeywordsEnabled,
  };
}

function buildPlanFromArgs(args) {
  const sku = String(args.sku || '').trim().toUpperCase();
  const asin = String(args.asin || '').trim().toUpperCase();
  const accountId = Number(args.accountId);
  const siteId = Number(args.siteId || 4);
  const budget = Number(args.budget ?? args.dailyBudget);
  const bid = Number(args.bid ?? args.defaultBid);
  const coreTerm = String(args.coreTerm || parseCsvList(args.keywords)[0] || '').trim();
  const keywordRows = parseCsvList(args.keywords).map(keywordText => ({
    keywordText,
    matchType: String(args.matchType || 'BROAD').toUpperCase(),
    bid,
  }));
  return {
    key: 'sbv_broad',
    advType: 'SB',
    mode: 'keywordTarget',
    targetType: 'keyword',
    sku,
    asin,
    accountId,
    siteId,
    brand: String(args.brandEntityId || args.brand || '').trim(),
    brandName: String(args.brandName || '').trim(),
    campaignName: args.campaignName || `sbvkw_broad_${coreTerm}_${sku.toLowerCase()}`,
    groupName: args.groupName || args.campaignName || `sbvkw_broad_${coreTerm}_${sku.toLowerCase()}`,
    coreTerm,
    dailyBudget: budget,
    defaultBid: bid,
    adFormat: 'video',
    landingType: Number(args.landingType || 2),
    videoType: String(args.videoType || '简易'),
    videoAssetIds: parseCsvList(args.videoAssetIds || args.videoAssetId),
    keywords: keywordRows,
  };
}

function validateCliPlan(plan) {
  const errors = [];
  if (!plan.sku) errors.push('sku is required');
  if (!/^B[A-Z0-9]{9}$/.test(plan.asin)) errors.push('asin must be a 10-character Amazon ASIN');
  if (!Number.isFinite(plan.accountId) || plan.accountId <= 0) errors.push('accountId must be positive');
  if (!Number.isFinite(plan.siteId) || plan.siteId <= 0) errors.push('siteId must be positive');
  if (!Number.isFinite(plan.dailyBudget) || plan.dailyBudget <= 0) errors.push('budget/dailyBudget must be positive');
  if (!Number.isFinite(plan.defaultBid) || plan.defaultBid <= 0) errors.push('bid/defaultBid must be positive');
  if (!plan.coreTerm) errors.push('coreTerm or keywords is required');
  if ((plan.keywords || []).length < 3) errors.push('at least 3 keywords are required');
  return errors;
}

async function runSbvCreateFlow(options = {}) {
  const plan = options.plan || buildPlanFromArgs(options.args || {});
  const date = options.date || todayYmd();
  const startYmd = options.startYmd || date;
  const endYmd = options.endYmd || date;
  const execute = options.execute === true;
  const outFile = options.out || path.join(ROOT, 'data', 'actions', `sbv_create_${plan.sku || 'unknown'}_${date}.json`);
  const out = {
    exportedAt: new Date().toISOString(),
    dryRun: !execute,
    evidenceBoundary: 'Live ad backend reads from debug Chrome; GBrain/context must be supplied by operator workflow.',
    planInput: plan,
    brandEvidence: null,
    videoEvidence: null,
    preflight: null,
    plan: null,
    execution: null,
    ok: false,
  };

  const needsResolve = !plan.accountId || !Number.isFinite(plan.accountId) || plan.accountId <= 0 ||
    !/^B[A-Z0-9]{9}$/.test(plan.asin || '');

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    // Auto-resolve accountId/asin/siteId from the SKU's existing campaigns when
    // either is missing, so operators only need --sku (not --account-id/--asin).
    if (needsResolve && plan.sku) {
      const resolved = await resolveSkuAccount(ws, plan.sku, plan.siteId || 4);
      out.resolved = resolved.ok
        ? { accountId: resolved.accountId, asin: resolved.asin, siteId: resolved.siteId, existingCampaigns: resolved.rowCount }
        : { error: resolved.error };
      if (resolved.ok) {
        if (!plan.accountId || !Number.isFinite(plan.accountId) || plan.accountId <= 0) plan.accountId = resolved.accountId;
        if (!/^B[A-Z0-9]{9}$/.test(plan.asin || '')) plan.asin = resolved.asin;
        if (resolved.siteId) plan.siteId = resolved.siteId;
      }
    }

    const errors = validateCliPlan(plan);
    if (errors.length) {
      out.execution = { skipped: true, reason: 'input_invalid', errors };
      try { ws.close(); } catch (_) {}
      writeJson(outFile, out);
      return { out, outFile };
    }

    const brand = await fetchBrand(ws, plan);
    out.brandEvidence = {
      source: brand.source,
      brandEntityId: brand.brandEntityId,
      brandRegistryName: brand.brandRegistryName,
      error: brand.error,
      rowCount: brand.rows?.length ?? null,
    };
    if (brand.error) {
      out.execution = { skipped: true, reason: brand.error };
      return { out, outFile: writeJson(outFile, out) };
    }

    const video = await fetchVideoAsset(ws, plan, brand);
    out.videoEvidence = {
      source: video.source,
      rowCount: video.rowCount,
      matchedAsset: video.matchedAsset,
      error: video.error,
      errors: video.errors,
      pendingAmazonSync: video.pendingAmazonSync,
      externalAssets: video.externalAssets,
    };
    const assetIsExact = (video.matchedAsset?.associatedAsins || []).includes(String(plan.asin).toUpperCase()) || video.source === 'input';
    if (video.error || !video.matchedAsset?.assetId || !assetIsExact) {
      const reason = video.pendingAmazonSync
        ? 'video_pending_amazon_sync'
        : 'video_asset_missing_or_not_exact_asin';
      out.execution = { skipped: true, reason };
      return { out, outFile: writeJson(outFile, out) };
    }

    const planWithAssets = {
      ...plan,
      brand: brand.brandEntityId,
      brandName: brand.brandRegistryName,
      videoAssetIds: [video.matchedAsset.assetId],
    };

    const beforeRows = await fetchSkuProductRows(ws, planWithAssets, startYmd, endYmd);
    out.preflight = {
      snapshot: writeJson(path.join(SNAPSHOT_DIR, `sbv_create_${plan.sku}_${date}_before.json`), beforeRows),
      productRows: beforeRows.map(summarizeCampaign),
      duplicateGuard: {
        existingNames: beforeRows.map(row => row.campaignName).filter(Boolean),
      },
    };

    const sensitive = await filterSensitiveKeywords(ws, planWithAssets);
    const internal = await filterInternalKeywords(ws, planWithAssets);
    const filtered = removeBlockedKeywords(planWithAssets, [sensitive.blocked, internal.blocked]);
    const built = buildSbvCreatePayload(filtered.plan);
    out.plan = {
      plan: filtered.plan,
      built,
      filtering: {
        sensitiveBlocked: sensitive.blocked,
        sensitiveAdvisory: sensitive.advisory || [],
        internalBlocked: internal.blocked,
        removed: filtered.removed,
      },
    };

    const existing = beforeRows.find(row => normalizeTerm(row.campaignName) === normalizeTerm(filtered.plan.campaignName));
    if (!built.ok) {
      out.execution = { skipped: true, reason: 'payload_invalid', errors: built.errors };
    } else if (existing) {
      out.execution = { skipped: true, reason: 'duplicate_campaign', campaignId: existing.campaignId || existing.primaryId || '' };
    } else if ((filtered.plan.keywords || []).length < 3) {
      out.execution = { skipped: true, reason: 'keyword_filtered_empty_or_too_few' };
    } else if (!execute) {
      out.execution = { skipped: true, reason: 'dry-run' };
      out.ok = true;
    } else {
      const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
      const createOk = Number(response?.json?.code) === 200 && String(response?.json?.msg || '').toLowerCase() === 'success';
      const createMeta = extractCreateMeta(response);
      const readback = createOk && createMeta.campaignId && createMeta.adGroupId
        ? await verifyCreatedPlan(ws, filtered.plan, createMeta, startYmd, endYmd)
        : null;
      out.execution = { skipped: false, createOk, createMeta, response, readback };
      out.ok = createOk && readback?.allLanded;
    }
  } finally {
    ws.close();
    writeJson(outFile, out);
  }
  return { out, outFile };
}

module.exports = {
  buildPlanFromArgs,
  fetchBrand,
  fetchVideoAsset,
  parseArgs,
  parseCsvList,
  removeBlockedKeywords,
  rowsFrom,
  runSbvCreateFlow,
  sensitiveBlockedTerms,
  validateCliPlan,
};
