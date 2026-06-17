const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'cii1823_soccer_party_phrase_2026-06-11.json');
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

const BUSINESS_DATE = '2026-06-11';
const PLAN = {
  key: 'soccerPartyPhrase',
  sku: 'CII1823',
  asin: 'B0F3XNNG5V',
  accountId: 717,
  siteId: 4,
  mode: 'keywordTarget',
  campaignName: 'ai_kw phrase_soccer party favors_cii1823',
  groupName: 'ai_kw phrase_soccer party favors_cii1823',
  coreTerm: 'soccer party favors',
  matchType: 'PHRASE',
  dailyBudget: 3,
  defaultBid: 0.35,
  keywords: [
    'world cup party favors',
    'soccer party favors',
    'football party favors',
    'international flag party favors',
    'country flag pens',
  ],
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
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

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function rowsFromResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || [];
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
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType || row.match_type || '',
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? row.campaign_state ?? '',
    groupState: row.groupState ?? row.group_state ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
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

async function fetchKeywords(ws, createMeta) {
  const rows = [];
  const pages = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', {
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: createMeta.campaignId,
      adGroupId: createMeta.adGroupId,
      property: '1',
      tableName: '',
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      selectDate: [BUSINESS_DATE, BUSINESS_DATE],
      timeRange: [
        new Date(`${BUSINESS_DATE}T00:00:00`).getTime(),
        new Date(new Date(`${BUSINESS_DATE}T00:00:00`).getTime() + 86400000).getTime(),
      ],
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const list = rowsFromResponse(response);
    pages.push({ page, code: response?.code ?? null, msg: response?.msg || '', rowCount: list.length });
    rows.push(...list);
    if (list.length < 500) break;
  }
  return {
    pages,
    rows: rows.filter(row =>
      String(row.campaignId || '') === String(createMeta.campaignId) &&
      String(row.adGroupId || '') === String(createMeta.adGroupId)
    ),
  };
}

async function verifyCreatedKeywords(ws, plan, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const readback = await fetchKeywords(ws, createMeta);
    const wanted = new Set(plan.keywords.map(normalizeTerm));
    const landedRows = readback.rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeRow);
    attempts.push({
      delayMs,
      rowCount: readback.rows.length,
      pages: readback.pages,
      landedRows,
    });
    if (landedRows.length >= plan.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { landedRows: [] };
  const landedTerms = new Set(last.landedRows.map(row => normalizeTerm(row.keywordText)));
  const missingAfter = plan.keywords.filter(term => !landedTerms.has(normalizeTerm(term)));
  return {
    attempts,
    landedRows: last.landedRows,
    missingAfter,
    allLanded: missingAfter.length === 0 &&
      last.landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const out = {
    exportedAt: new Date().toISOString(),
    startedAt,
    businessDate: BUSINESS_DATE,
    dryRun: DRY_RUN,
    evidenceBoundary: 'live ad backend via shared Chrome; CII1823 title application 4616550 is submitted but not Amazon-front landed.',
    diagnosis: 'Create a fresh SP phrase campaign for the soccer/football party-favor direction. Keep the old paused flag-pen system keyword group untouched.',
    bidEvidence: {
      competitorScreenshotCpc: 0.33,
      oldCii1823ObservedCpc: 0.3904,
      selectedBid: PLAN.defaultBid,
      dailyBudget: PLAN.dailyBudget,
      reason: '0.35 is market-capable relative to the competitor screenshot while limiting waste before the new title lands.',
    },
    plan: PLAN,
    preflight: null,
    dryRunBuild: null,
    execution: null,
    readback: null,
    ok: false,
  };

  if (DRY_RUN) {
    const built = buildSpCreatePayload(PLAN);
    out.dryRunBuild = built;
    out.ok = built.ok;
    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      dryRun: true,
      ok: built.ok,
      errors: built.errors || [],
      campaignName: built.campaignName,
      defaultBid: PLAN.defaultBid,
      dailyBudget: PLAN.dailyBudget,
      keywords: PLAN.keywords,
    }, null, 2));
    if (!built.ok) process.exitCode = 2;
    return;
  }

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const sensitive = await filterSensitiveKeywords(ws, PLAN.keywords);
    const internal = await filterInternalKeywords(ws, PLAN.keywords);
    const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
    const filteredKeywords = PLAN.keywords.filter(term => !blocked.has(normalizeTerm(term)));
    const executablePlan = { ...PLAN, keywords: filteredKeywords };
    const built = buildSpCreatePayload(executablePlan);
    out.preflight = {
      sensitive,
      internal,
      blockedTerms: [...blocked],
      filteredKeywords,
    };
    out.dryRunBuild = built;
    if (!built.ok) {
      out.execution = { ok: false, skipped: true, reason: built.errors.join('; ') };
      writeJson(OUT, out);
      throw new Error(`buildSpCreatePayload failed; wrote ${OUT}`);
    }

    const response = await postAdv(ws, built.requestUrl, built.requestBody);
    const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
    const createMeta = extractCreateMeta(response);
    out.execution = { ok: createOk, response, createMeta };
    if (createOk && createMeta.campaignId && createMeta.adGroupId) {
      out.readback = await verifyCreatedKeywords(ws, executablePlan, createMeta);
    }
    out.exportedAt = new Date().toISOString();
    out.ok = !!(out.execution?.ok && out.readback?.allLanded);
    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      ok: out.ok,
      blockedTerms: out.preflight.blockedTerms,
      campaignId: createMeta.campaignId,
      adGroupId: createMeta.adGroupId,
      campaignName: createMeta.campaignName || built.campaignName,
      landedRows: out.readback?.landedRows?.map(row => ({
        keywordText: row.keywordText,
        matchType: row.matchType,
        bid: row.bid,
        state: row.state,
        campaignState: row.campaignState,
        groupState: row.groupState,
      })) || [],
      missingAfter: out.readback?.missingAfter || [],
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
