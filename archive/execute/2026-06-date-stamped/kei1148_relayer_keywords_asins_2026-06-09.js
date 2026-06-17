const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'kei1148_relayer_keywords_asins_2026-06-09.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-09',
  dataDateRange: ['2026-05-10', '2026-06-08'],
  sku: 'KEI1148',
  asin: 'B0FVDZLF3G',
  accountId: 875,
  siteId: 4,
  keywordAppend: {
    campaignId: '560570806473381',
    adGroupId: '480843872651779',
    campaignName: 'kw_ dog rope toys _kei1148',
    groupName: 'kw_ dog rope toys _kei1148',
    appendLane: 'BROAD',
    targets: [
      { value: 'dog toys bulk', matchType: 'BROAD', bid: 0.62 },
      { value: 'rope toys for dogs', matchType: 'BROAD', bid: 0.67 },
    ],
  },
  productTargetAppend: {
    campaignId: '450062127196540',
    adGroupId: '438000678333251',
    campaignName: 'asin_ dog rope toys_kei1148',
    groupName: 'asin_ dog rope toys_kei1148',
    targetType: 'ASIN_SAME_AS',
    targets: [
      { value: 'B094XFK5Z2', matchType: 'ASIN_SAME_AS', bid: 0.60 },
      { value: 'B0C2QHMN6D', matchType: 'ASIN_SAME_AS', bid: 0.60 },
      { value: 'B0C3HCCVKK', matchType: 'ASIN_SAME_AS', bid: 0.60 },
      { value: 'B08VMV3DVL', matchType: 'ASIN_SAME_AS', bid: 0.60 },
      { value: 'B0CL3W13G1', matchType: 'ASIN_SAME_AS', bid: 0.60 },
    ],
  },
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

async function postAdv(ws, pathname, payload, method = 'POST') {
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
    return JSON.stringify(json || { code: 0, msg: text.slice(0, 1000), httpStatus: res.status });
  })()`;
  const text = await evalInTab(ws, expr);
  try { return JSON.parse(text || '{}'); } catch (error) { return { code: 0, raw: text, parseError: error.message }; }
}

function rowsFromResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.data || data.targetRows ||
    response?.records || response?.rows || response?.list || (Array.isArray(data) ? data : []);
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

function normalizeAsin(value) {
  return String(value || '').trim().toUpperCase();
}

function targetAsinFromRow(row = {}) {
  const raw = String(row.type || '').trim();
  const match = raw.match(/B[A-Z0-9]{9}/i);
  if (match) return match[0].toUpperCase();
  const lists = [row.expression, row.resolvedExpression, row.expressions, row.resolvedExpressions];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const asin = normalizeAsin(item?.value);
      if (/^B[A-Z0-9]{9}$/.test(asin)) return asin;
    }
  }
  return '';
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: normalizeMatch(row.matchType),
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
  };
}

function summarizeTarget(row = {}) {
  return {
    targetId: row.targetId || row.id || '',
    asin: targetAsinFromRow(row),
    type: row.type || '',
    bid: row.bid ?? row.currentBid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
  };
}

async function fetchKeywords(ws) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: PLAN.accountId,
    type: 'spKeyword',
    campaignId: PLAN.keywordAppend.campaignId,
    adGroupId: PLAN.keywordAppend.adGroupId,
    property: '1',
    tableName: '',
    dateRange: PLAN.dataDateRange,
    selectDate: PLAN.dataDateRange,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return { response, rows: rowsFromResponse(response) };
}

async function fetchTargets(ws) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: PLAN.accountId,
    type: 'spManualTarget',
    campaignId: PLAN.productTargetAppend.campaignId,
    adGroupId: PLAN.productTargetAppend.adGroupId,
    property: '3',
    tableName: 'product_manual_target',
    dateRange: PLAN.dataDateRange,
    selectDate: PLAN.dataDateRange,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return { response, rows: rowsFromResponse(response) };
}

async function filterSensitiveKeywords(ws, terms) {
  if (!terms.length) return {};
  const response = await postAdv(ws, '/keyword/checkSensitiveWord', {
    siteId: PLAN.siteId,
    advType: 'SP',
    keywords_array: terms,
    campaignId: PLAN.keywordAppend.campaignId,
    adGroupId: PLAN.keywordAppend.adGroupId,
  });
  return { response, data: response?.data && typeof response.data === 'object' ? response.data : {} };
}

async function filterInternalKeywords(ws, terms) {
  if (!terms.length) return {};
  const response = await postAdv(ws, '/filter/filterInternalAsinAndBrand', {
    siteId: PLAN.siteId,
    accountId: PLAN.accountId,
    targetType: 'keyword',
    productAsinArray: [PLAN.asin],
    targetArray: terms,
    advType: 'SP',
    campaignId: PLAN.keywordAppend.campaignId,
    adGroupId: PLAN.keywordAppend.adGroupId,
  });
  return { response, data: response?.data && typeof response.data === 'object' ? response.data : {} };
}

function removeBlockedKeywordTargets(targets, sensitiveData, internalData) {
  const blocked = new Set([
    ...Object.keys(sensitiveData || {}),
    ...Object.values(internalData || {}).flat().map(String),
  ].map(normalizeTerm).filter(Boolean));
  return {
    targets: targets.filter(target => !blocked.has(normalizeTerm(target.value))),
    blocked: targets.filter(target => blocked.has(normalizeTerm(target.value))).map(target => target.value),
  };
}

function removeDuplicateKeywordTargets(existingRows, targets) {
  const existing = new Set(existingRows.map(row => `${normalizeTerm(row.keywordText || row.keyword || row.searchTerm)}::${normalizeMatch(row.matchType)}`));
  return {
    targets: targets.filter(target => !existing.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`)),
    duplicates: targets.filter(target => existing.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`)).map(target => target.value),
  };
}

function removeDuplicateAsinTargets(existingRows, targets) {
  const existing = new Set(existingRows.map(targetAsinFromRow).filter(Boolean));
  return {
    targets: targets.filter(target => !existing.has(normalizeAsin(target.value)) && normalizeAsin(target.value) !== PLAN.asin),
    duplicates: targets.filter(target => existing.has(normalizeAsin(target.value))).map(target => target.value),
    selfFiltered: targets.filter(target => normalizeAsin(target.value) === PLAN.asin).map(target => target.value),
  };
}

function writeOut(out) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
}

function saveReadback(name, payload) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    const beforeKeywords = await fetchKeywords(ws);
    const beforeTargets = await fetchTargets(ws);

    const keywordDeduped = removeDuplicateKeywordTargets(beforeKeywords.rows, PLAN.keywordAppend.targets);
    const sensitive = await filterSensitiveKeywords(ws, keywordDeduped.targets.map(target => target.value));
    const internal = await filterInternalKeywords(ws, keywordDeduped.targets.map(target => target.value));
    const keywordFiltered = removeBlockedKeywordTargets(keywordDeduped.targets, sensitive.data, internal.data);
    const asinDeduped = removeDuplicateAsinTargets(beforeTargets.rows, PLAN.productTargetAppend.targets);

    const keywordBuilt = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.keywordAppend.appendLane,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.keywordAppend.campaignId,
      adGroupId: PLAN.keywordAppend.adGroupId,
      targets: keywordFiltered.targets,
    });
    const targetBuilt = buildSpAppendTargetPayload({
      positionType: 'productTarget',
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.productTargetAppend.campaignId,
      adGroupId: PLAN.productTargetAppend.adGroupId,
      targets: asinDeduped.targets,
    });

    const execution = {
      mode: EXECUTE ? 'execute' : 'dry-run',
      keyword: { skipped: true, reason: '', response: null },
      productTarget: { skipped: true, reason: '', response: null },
    };

    if (EXECUTE && keywordBuilt.ok && keywordFiltered.targets.length) {
      const response = await postAdv(ws, keywordBuilt.requestUrl, keywordBuilt.requestBody);
      execution.keyword = {
        skipped: false,
        ok: Number(response?.code) === 200,
        response,
      };
    } else {
      execution.keyword.reason = keywordBuilt.ok ? 'dry run or no new keyword targets' : keywordBuilt.errors.join('; ');
    }

    if (EXECUTE && targetBuilt.ok && asinDeduped.targets.length) {
      const response = await postAdv(ws, targetBuilt.requestUrl, targetBuilt.requestBody);
      execution.productTarget = {
        skipped: false,
        ok: Number(response?.code) === 200,
        response,
      };
    } else {
      execution.productTarget.reason = targetBuilt.ok ? 'dry run or no new ASIN targets' : targetBuilt.errors.join('; ');
    }

    if (EXECUTE) await sleep(45000);

    let afterKeywords = await fetchKeywords(ws);
    let afterTargets = await fetchTargets(ws);

    const wantedTerms = new Set(PLAN.keywordAppend.targets.map(target => normalizeTerm(target.value)));
    const wantedAsins = new Set(PLAN.productTargetAppend.targets.map(target => normalizeAsin(target.value)));
    let landedKeywords = afterKeywords.rows.filter(row => wantedTerms.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))).map(summarizeKeyword);
    let landedTargets = afterTargets.rows.filter(row => wantedAsins.has(targetAsinFromRow(row))).map(summarizeTarget);

    if (EXECUTE && (landedKeywords.length < keywordFiltered.targets.length || landedTargets.length < asinDeduped.targets.length)) {
      await sleep(45000);
      afterKeywords = await fetchKeywords(ws);
      afterTargets = await fetchTargets(ws);
      landedKeywords = afterKeywords.rows.filter(row => wantedTerms.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))).map(summarizeKeyword);
      landedTargets = afterTargets.rows.filter(row => wantedAsins.has(targetAsinFromRow(row))).map(summarizeTarget);
    }

    const landedTermSet = new Set(landedKeywords.map(row => normalizeTerm(row.keywordText)));
    const landedAsinSet = new Set(landedTargets.map(row => normalizeAsin(row.asin)));

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      evidenceBoundary: 'live ad backend via shared Chrome debug session; market evidence from live selection snapshots; GBrain historical decision memory',
      diagnosis: 'Reuse existing active SP keyword/productTarget lanes for KEI1148 and append only bulk/rope keywords plus similar multi-pack ASIN targets. No budget increase.',
      bidEvidence: {
        sku7dCpc: 0.44,
        sku30dCpc: 0.6047,
        skuLifetimeCpc: 0.6983,
        autoCustomerSearchCpc: '0.66-0.68 on recent close-match buyer terms',
        marketKeywordCpc: {
          dogToysBulk: 0.62,
          ropeToysForDogs: 1.70,
        },
        existingLaneBidBand: {
          keywordBroadActive: '0.58-0.91',
          productTargetExpandedActive: '0.35-0.70',
        },
      },
      plan: PLAN,
      before: {
        keywordRows: beforeKeywords.rows.map(summarizeKeyword),
        productTargetRows: beforeTargets.rows.map(summarizeTarget),
      },
      filtering: {
        duplicateKeywords: keywordDeduped.duplicates,
        sensitiveKeywordResponse: sensitive.response,
        internalKeywordResponse: internal.response,
        blockedKeywords: keywordFiltered.blocked,
        duplicateAsins: asinDeduped.duplicates,
        selfFilteredAsins: asinDeduped.selfFiltered,
      },
      dryRun: {
        keywordAppend: keywordBuilt,
        productTargetAppend: targetBuilt,
      },
      execution,
      readback: {
        keywordSnapshot: saveReadback('kei1148_relayer_keyword_readback_2026-06-09.json', afterKeywords),
        targetSnapshot: saveReadback('kei1148_relayer_asin_readback_2026-06-09.json', afterTargets),
        landedKeywords,
        landedTargets,
        missingKeywords: keywordFiltered.targets.map(target => target.value).filter(term => !landedTermSet.has(normalizeTerm(term))),
        missingAsins: asinDeduped.targets.map(target => normalizeAsin(target.value)).filter(asin => !landedAsinSet.has(asin)),
        keywordAllLanded: keywordFiltered.targets.length === 0 || keywordFiltered.targets.every(target => landedTermSet.has(normalizeTerm(target.value))),
        targetAllLanded: asinDeduped.targets.length === 0 || asinDeduped.targets.every(target => landedAsinSet.has(normalizeAsin(target.value))),
      },
      checkpoint: {
        firstReviewDate: '2026-06-12',
        secondReviewDate: '2026-06-16',
        successSignal: 'KEI1148 same-SKU order or at least controlled clicks on dog toys bulk / rope toys for dogs without spend spike',
        stopCondition: 'If tested rows spend >= 5 USD total with 0 same-SKU order, lower or pause the tested rows and move back to price/coupon/listing repair.',
      },
    };

    writeOut(out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      keywordBuiltOk: keywordBuilt.ok,
      targetBuiltOk: targetBuilt.ok,
      keywordExecutionOk: execution.keyword.ok || execution.keyword.skipped,
      targetExecutionOk: execution.productTarget.ok || execution.productTarget.skipped,
      keywordTargetsSubmitted: keywordFiltered.targets.map(target => target.value),
      asinTargetsSubmitted: asinDeduped.targets.map(target => target.value),
      landedKeywords,
      landedTargets,
      missingKeywords: out.readback.missingKeywords,
      missingAsins: out.readback.missingAsins,
    }, null, 2));

    if (EXECUTE && (out.readback.missingKeywords.length || out.readback.missingAsins.length)) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
