const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'qq1764_c_layer_matrix_2026-06-12.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const BUSINESS_DATE = '2026-06-12';
const SKU = 'QQ1764';
const ASIN = 'B0C1NF986W';
const ACCOUNT_ID = 296;
const SITE_ID = 4;

const GROUPS_TO_CHECK = [
  { key: 'converted_exact', campaignId: '206778787718361', adGroupId: '40529086558584' },
  { key: 'pride_exact', campaignId: '94563087816298', adGroupId: '269730990124943' },
  { key: 'pride_phrase', campaignId: '63208730504804', adGroupId: '220545508465053' },
  { key: 'pride_broad', campaignId: '147587809454865', adGroupId: '208807966957136' },
  { key: 'b2b_phrase', campaignId: '45163544774566', adGroupId: '198557309672364' },
  { key: 'kw_rainbow', campaignId: '453560590907042', adGroupId: '348728747999677' },
  { key: 'system_exact_paused_parent', campaignId: '398307602214216', adGroupId: '306980835725153' },
  { key: 'system_phrase_paused_parent', campaignId: '374365382603744', adGroupId: '335679847112470' },
];

const PLANS = [
  {
    key: 'phraseMatrix',
    sku: SKU,
    asin: ASIN,
    accountId: ACCOUNT_ID,
    siteId: SITE_ID,
    mode: 'keywordTarget',
    campaignName: 'ai_kw phrase_tablecloth matrix_qq1764',
    groupName: 'ai_kw phrase_tablecloth matrix_qq1764',
    coreTerm: 'tablecloth matrix',
    matchType: 'PHRASE',
    dailyBudget: 5,
    defaultBid: 0.62,
    keywords: [
      'rainbow table cloth',
      'rainbow table cloths for parties',
      'rainbow table cover',
    ],
  },
  {
    key: 'exactMatrix',
    sku: SKU,
    asin: ASIN,
    accountId: ACCOUNT_ID,
    siteId: SITE_ID,
    mode: 'keywordTarget',
    campaignName: 'ai_kw exact_tablecloth pride matrix_qq1764',
    groupName: 'ai_kw exact_tablecloth pride matrix_qq1764',
    coreTerm: 'tablecloth pride matrix',
    matchType: 'EXACT',
    dailyBudget: 5,
    defaultBid: 0.60,
    keywords: [
      'rainbow table cover',
      'rainbow pride tablecloth',
      'rainbow tablecloth bulk',
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

function dateRange() {
  return [
    new Date(`${BUSINESS_DATE}T00:00:00`).getTime(),
    new Date(new Date(`${BUSINESS_DATE}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchGroupKeywords(ws, group) {
  const rows = [];
  const pages = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', {
      siteId: SITE_ID,
      timeRange: dateRange(),
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: ACCOUNT_ID,
      campaignId: group.campaignId,
      adGroupId: group.adGroupId,
      property: '1',
      selectDate: [BUSINESS_DATE, BUSINESS_DATE],
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const pageRows = rowsFromResponse(response);
    pages.push({
      page,
      code: response?.code ?? null,
      msg: response?.msg || '',
      rowCount: pageRows.length,
      total: response?.count || response?.data?.total || response?.total || null,
    });
    rows.push(...pageRows);
    if (pageRows.length < 500) break;
  }
  return {
    group,
    pages,
    rows: rows.filter(row =>
      String(row.campaignId || '') === group.campaignId &&
      String(row.adGroupId || '') === group.adGroupId
    ),
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: normalizeMatch(row.matchType),
    bid: Number(row.bid ?? row.currentBid ?? row.cpcBid ?? 0),
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

async function filterSensitiveKeywords(ws, terms) {
  if (!terms.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/keyword/checkSensitiveWord', {
    siteId: SITE_ID,
    advType: 'SP',
    keywords_array: terms,
  });
  return { response, blocked: Object.keys(response?.data || {}) };
}

async function filterInternalKeywords(ws, terms) {
  if (!terms.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/filter/filterInternalAsinAndBrand', {
    siteId: SITE_ID,
    accountId: ACCOUNT_ID,
    targetType: 'keyword',
    productAsinArray: [ASIN],
    targetArray: terms,
    advType: 'SP',
  });
  return { response, blocked: Object.values(response?.data || {}).flat().map(String) };
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

async function fetchCreatedKeywords(ws, plan, createMeta) {
  const rows = [];
  const pages = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', {
      siteId: SITE_ID,
      timeRange: dateRange(),
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: ACCOUNT_ID,
      campaignId: createMeta.campaignId,
      adGroupId: createMeta.adGroupId,
      property: '1',
      selectDate: [BUSINESS_DATE, BUSINESS_DATE],
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const pageRows = rowsFromResponse(response);
    pages.push({
      page,
      code: response?.code ?? null,
      msg: response?.msg || '',
      rowCount: pageRows.length,
      total: response?.count || response?.data?.total || response?.total || null,
    });
    rows.push(...pageRows);
    if (pageRows.length < 500) break;
  }
  const wanted = new Set(plan.keywords.map(normalizeTerm));
  return {
    pages,
    rows: rows
      .filter(row =>
        String(row.campaignId || '') === createMeta.campaignId &&
        String(row.adGroupId || '') === createMeta.adGroupId &&
        wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm))
      )
      .map(summarizeKeyword),
  };
}

async function verifyPlan(ws, plan, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const readback = await fetchCreatedKeywords(ws, plan, createMeta);
    attempts.push({ delayMs, pages: readback.pages, rows: readback.rows });
    if (readback.rows.length >= plan.keywords.length) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  const landedTerms = new Set(last.rows.map(row => normalizeTerm(row.keywordText)));
  const missingAfter = plan.keywords.filter(term => !landedTerms.has(normalizeTerm(term)));
  return {
    attempts,
    landedRows: last.rows,
    missingAfter,
    allLanded: missingAfter.length === 0 &&
      last.rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function saveSnapshot(name, value) {
  return writeJson(path.join(SNAPSHOT_DIR, name), value);
}

function targetKey(term, matchType) {
  return `${normalizeTerm(term)}::${normalizeMatch(matchType)}`;
}

function filterDuplicates(plan, existingRows) {
  const activeKeys = new Set(existingRows
    .filter(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1)
    .map(row => targetKey(row.keywordText, row.matchType)));
  const inactiveMatches = existingRows
    .filter(row => targetKey(row.keywordText, row.matchType).endsWith(`::${plan.matchType}`))
    .filter(row => plan.keywords.some(term => targetKey(term, plan.matchType) === targetKey(row.keywordText, row.matchType)))
    .filter(row => !(Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1))
    .map(summarizeKeyword);
  const keywords = [];
  const duplicates = [];
  for (const term of plan.keywords) {
    if (activeKeys.has(targetKey(term, plan.matchType))) duplicates.push(term);
    else keywords.push(term);
  }
  return { ...plan, keywords, duplicateKeywords: duplicates, inactiveMatches };
}

async function main() {
  const startedAt = new Date().toISOString();
  const out = {
    exportedAt: new Date().toISOString(),
    startedAt,
    businessDate: BUSINESS_DATE,
    dryRun: !EXECUTE,
    evidenceBoundary: 'live ad backend through shared Chrome; GBrain 2026-06-12 growth package used as historical plan only',
    gbrainKeywords: ['QQ1764', 'rainbow tablecloth', 'old-yoy-three-sku', 'growth package', 'coverage'],
    diagnosis: 'QQ1764 needs C-layer owned SP keyword coverage after A/B bid and budget actions. Do not duplicate already-active exact/phrase terms; create only missing matrix rows.',
    scope: {
      objectScope: 'single SKU QQ1764 / ASIN B0C1NF986W',
      adScope: 'SP keyword C-layer phrase/exact matrix after checking owned and system keyword groups',
      timeScope: 'live 2026-06-12 structure readback plus 2026-06-07..11 growth evidence from prior package',
      trafficScope: 'tablecloth core terms, Pride-adjacent tablecloth terms, bulk/B2B tablecloth term',
      resultScope: 'up to 2 new SP campaigns, 6 keyword targets, 10 USD/day added capped budget; designed to cover part of the 131-click estimated gap',
    },
    bidEvidence: {
      sku7dCpc: 0.7112,
      selectedPhraseBid: 0.62,
      selectedExactBid: 0.60,
      reason: 'Bids sit inside the v2 0.55-0.70 band and below/near live SKU 7d CPC, so rows can receive traffic without launching below market.',
    },
    preflight: null,
    builtPlans: [],
    executions: [],
    ok: false,
  };

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const groupReads = [];
    for (const group of GROUPS_TO_CHECK) {
      groupReads.push(await fetchGroupKeywords(ws, group));
    }
    const beforeSnapshot = saveSnapshot('qq1764_c_layer_matrix_before_2026-06-12.json', groupReads);
    const existingRows = groupReads.flatMap(read => read.rows.map(row => ({
      ...summarizeKeyword(row),
      sourceGroup: read.group.key,
    })));

    const dedupedPlans = PLANS.map(plan => filterDuplicates(plan, existingRows));
    const filteredPlans = [];
    const filters = [];
    for (const plan of dedupedPlans) {
      const sensitive = await filterSensitiveKeywords(ws, plan.keywords);
      const internal = await filterInternalKeywords(ws, plan.keywords);
      const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
      const keywords = plan.keywords.filter(term => !blocked.has(normalizeTerm(term)));
      filters.push({
        key: plan.key,
        duplicateKeywords: plan.duplicateKeywords,
        inactiveMatches: plan.inactiveMatches,
        sensitiveResponse: sensitive.response,
        internalResponse: internal.response,
        blockedKeywords: plan.keywords.filter(term => blocked.has(normalizeTerm(term))),
      });
      filteredPlans.push({ ...plan, keywords });
    }

    out.preflight = {
      beforeSnapshot,
      groupSummaries: groupReads.map(read => ({
        key: read.group.key,
        campaignId: read.group.campaignId,
        adGroupId: read.group.adGroupId,
        rowCount: read.rows.length,
        pages: read.pages,
      })),
      candidateFilters: filters,
      existingCandidateRows: existingRows.filter(row =>
        PLANS.some(plan => plan.keywords.some(term => normalizeTerm(term) === normalizeTerm(row.keywordText)))
      ),
    };

    for (const plan of filteredPlans) {
      const built = buildSpCreatePayload(plan);
      out.builtPlans.push({ plan, built });
      const result = {
        key: plan.key,
        plan,
        skipped: true,
        reason: '',
        createOk: false,
        response: null,
        createMeta: null,
        readback: null,
      };

      if (plan.keywords.length < 3) {
        result.reason = `only ${plan.keywords.length} non-duplicate keywords remained; fresh SP keyword group requires at least 3`;
      } else if (!built.ok) {
        result.reason = built.errors.join('; ');
      } else if (!EXECUTE) {
        result.reason = 'dry run only';
      } else {
        const response = await postAdv(ws, built.requestUrl, built.requestBody);
        const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
        const createMeta = extractCreateMeta(response);
        result.skipped = false;
        result.createOk = createOk;
        result.response = response;
        result.createMeta = createMeta;
        if (createOk && createMeta.campaignId && createMeta.adGroupId) {
          result.readback = await verifyPlan(ws, plan, createMeta);
        }
      }
      out.executions.push(result);
    }

    out.exportedAt = new Date().toISOString();
    out.ok = EXECUTE
      ? out.executions.every(item => item.createOk && item.readback?.allLanded)
      : out.builtPlans.every(item => item.built.ok);
    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: EXECUTE ? 'execute' : 'dry-run',
      ok: out.ok,
      beforeSnapshot,
      plans: out.executions.map(item => ({
        key: item.key,
        skipped: item.skipped,
        reason: item.reason,
        campaignName: item.plan.campaignName,
        dailyBudget: item.plan.dailyBudget,
        defaultBid: item.plan.defaultBid,
        keywords: item.plan.keywords,
        createOk: item.createOk,
        campaignId: item.createMeta?.campaignId || '',
        adGroupId: item.createMeta?.adGroupId || '',
        landedRows: item.readback?.landedRows || [],
        missingAfter: item.readback?.missingAfter || [],
        allLanded: item.readback?.allLanded || false,
      })),
      filters: out.preflight.candidateFilters.map(item => ({
        key: item.key,
        duplicates: item.duplicateKeywords,
        blocked: item.blockedKeywords,
        inactiveMatches: item.inactiveMatches.map(row => ({
          keywordText: row.keywordText,
          matchType: row.matchType,
          bid: row.bid,
          state: row.state,
          campaignState: row.campaignState,
          groupState: row.groupState,
          campaignName: row.campaignName,
        })),
      })),
    }, null, 2));
    if (EXECUTE && !out.ok) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
