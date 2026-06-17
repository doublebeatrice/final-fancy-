const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const OUT = path.join(ROOT, 'data', 'actions', 'gt4431_coverage_push_2026-06-12.json');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-12',
  dataStartDate: '2026-05-13',
  dataEndDate: '2026-06-11',
  sku: 'GT4431',
  asin: 'B0G2LY9D4X',
  accountId: 167,
  siteId: 4,
  appendLane: 'EXACT',
  appendCampaignId: '175688016222595',
  appendAdGroupId: '180123988992907',
  appendCampaignName: 'ai_kw exact_celebration of life favors_gt4431',
  appendGroupName: 'ai_kw exact_celebration of life favors_gt4431',
  groups: [
    { key: 'exact', campaignId: '175688016222595', adGroupId: '180123988992907' },
    { key: 'phrase', campaignId: '258793074650959', adGroupId: '207858864166491' },
    { key: 'broad', campaignId: '225582328472388', adGroupId: '231004267012573' },
    { key: 'kw_funeral', campaignId: '227140974187776', adGroupId: '483299169276169' },
    { key: 'kw_board', campaignId: '84618718800782', adGroupId: '345451568335711' },
  ],
  bidUpdates: [
    {
      groupKey: 'exact',
      term: 'funeral favors',
      matchType: 'EXACT',
      expectedCurrentBid: 0.21,
      suggestedBid: 0.25,
      reason: 'Exact owned coverage for a live converting broad/board term is under-delivering at bid 0.21; product 7d CPC is 0.271 and market cpcStart for funeral favors is 0.32, so 0.25 is still controlled.',
    },
    {
      groupKey: 'kw_funeral',
      term: 'funeral pins',
      matchType: 'PHRASE',
      expectedCurrentBid: 0.22,
      suggestedBid: 0.25,
      reason: 'Funeral pins converts in broad and has 1 phrase click / 1 order; raise phrase lane only, not the whole broad group.',
    },
    {
      groupKey: 'kw_funeral',
      term: 'memorial ribbons for funeral',
      matchType: 'EXACT',
      expectedCurrentBid: 0.17,
      suggestedBid: 0.24,
      reason: 'Broad same term has 30d 525 impressions / 9 clicks / 2 orders / ACOS 7.94%; repair exact coverage from 0.17 to the observed broad CPC band around 0.234.',
    },
  ],
  appendTargets: [
    {
      value: 'funeral pins',
      matchType: 'EXACT',
      bid: 0.25,
      reason: 'Broad row has 30d 914 impressions / 10 clicks / 2 orders / ACOS 7.47% and the existing phrase row has 1 click / 1 order; add exact coverage at controlled product-CPC bid.',
    },
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

async function patchAdv(ws, pathname, payload) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({ httpOk: res.ok, httpStatus: res.status, json: json || { msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
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

function matchToNumber(value) {
  const raw = normalizeMatch(value);
  if (raw === 'EXACT') return 1;
  if (raw === 'PHRASE') return 2;
  if (raw === 'BROAD') return 3;
  return Number(value) || value;
}

function timeRange() {
  return [
    new Date(`${PLAN.dataStartDate}T00:00:00`).getTime(),
    new Date(new Date(`${PLAN.dataEndDate}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchGroupKeywords(ws, group) {
  const responses = [];
  const allRows = [];
  for (let page = 1; page <= 20; page += 1) {
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
      campaignId: group.campaignId,
      adGroupId: group.adGroupId,
      property: '1',
      selectDate: [PLAN.dataStartDate, PLAN.dataEndDate],
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const rows = rowsFromResponse(response);
    responses.push({
      page,
      code: response?.code ?? null,
      msg: response?.msg || response?.message || '',
      rowCount: rows.length,
      total: response?.count || response?.data?.total || response?.total || null,
    });
    allRows.push(...rows);
    if (rows.length < 500) break;
  }
  return {
    group,
    response: { pages: responses },
    rows: allRows.filter(row =>
      String(row.campaignId || '') === group.campaignId &&
      String(row.adGroupId || '') === group.adGroupId
    ),
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: String(row.keywordId || row.id || ''),
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
    updatedAt: row.updatedAt || '',
  };
}

function findKeyword(rows, term, matchType) {
  const wantedTerm = normalizeTerm(term);
  const wantedMatch = normalizeMatch(matchType);
  return (rows || []).find(row =>
    normalizeTerm(row.keywordText || row.keyword || row.searchTerm) === wantedTerm &&
    normalizeMatch(row.matchType) === wantedMatch
  ) || null;
}

function buildBidPayload(row, newBid) {
  const keywordId = String(row.keywordId || row.id || '');
  const campaignId = String(row.campaignId || '');
  const adGroupId = String(row.adGroupId || '');
  const targetRow = {
    ...row,
    keywordId,
    bid: String(newBid),
    siteId: row.siteId || PLAN.siteId,
    accountId: row.accountId || PLAN.accountId,
    campaignId,
    adGroupId,
    matchType: row.matchType,
    advType: 'SP',
  };
  return {
    column: 'bid',
    property: 'keyword',
    operation: 'bid',
    manualTargetType: '',
    accountId: row.accountId || PLAN.accountId,
    siteId: row.siteId || PLAN.siteId,
    idArray: [keywordId],
    campaignIdArray: [campaignId],
    targetArray: [targetRow],
    targetNewArray: [targetRow],
  };
}

async function filterSensitiveKeywords(ws, terms) {
  if (!terms.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/keyword/checkSensitiveWord', {
    siteId: PLAN.siteId,
    advType: 'SP',
    keywords_array: terms,
    campaignId: PLAN.appendCampaignId,
    adGroupId: PLAN.appendAdGroupId,
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
    campaignId: PLAN.appendCampaignId,
    adGroupId: PLAN.appendAdGroupId,
  });
  return { response, blocked: Object.values(response?.data || {}).flat().map(String) };
}

function responseSuccessCount(response) {
  for (const item of [response?.data?.keyword?.success, response?.data?.success, response?.success]) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

function responseErrorCount(response) {
  for (const item of [response?.data?.keyword?.error, response?.data?.error, response?.error]) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

async function fetchAllGroups(ws) {
  const reads = [];
  for (const group of PLAN.groups) reads.push(await fetchGroupKeywords(ws, group));
  return reads;
}

function groupRowsByKey(reads) {
  return Object.fromEntries(reads.map(read => [read.group.key, read.rows]));
}

async function main() {
  const startedAt = new Date().toISOString();
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const beforeReads = await fetchAllGroups(ws);
    const beforeByGroup = groupRowsByKey(beforeReads);
    const existingRows = beforeReads.flatMap(read => read.rows.map(row => ({
      ...summarizeKeyword(row),
      sourceGroup: read.group.key,
    })));
    const existingActive = new Set(existingRows
      .filter(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1)
      .map(row => `${normalizeTerm(row.keywordText)}::${row.matchType}`));

    const bidPlan = PLAN.bidUpdates.map(action => {
      const row = findKeyword(beforeByGroup[action.groupKey] || [], action.term, action.matchType);
      return {
        ...action,
        row: row ? summarizeKeyword(row) : null,
        okToExecute: !!row &&
          Number(row.state) === 1 &&
          Number(row.campaignState) === 1 &&
          Number(row.groupState) === 1 &&
          Number(row.bid) < action.suggestedBid,
      };
    });

    const duplicateAppendTargets = PLAN.appendTargets.filter(target =>
      existingActive.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`)
    );
    const dedupedAppendTargets = PLAN.appendTargets.filter(target =>
      !existingActive.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`)
    );
    const sensitive = await filterSensitiveKeywords(ws, dedupedAppendTargets.map(target => target.value));
    const internal = await filterInternalKeywords(ws, dedupedAppendTargets.map(target => target.value));
    const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
    const appendTargets = dedupedAppendTargets.filter(target => !blocked.has(normalizeTerm(target.value)));
    const appendPayload = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.appendLane,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.appendCampaignId,
      adGroupId: PLAN.appendAdGroupId,
      targets: appendTargets,
    });

    const execution = {
      mode: EXECUTE ? 'execute' : 'dry-run',
      bidUpdates: [],
      append: { skipped: true, ok: !EXECUTE, response: null, responseSuccessCount: 0, responseErrorCount: 0 },
    };

    if (EXECUTE) {
      for (const item of bidPlan) {
        if (!item.okToExecute) {
          execution.bidUpdates.push({ term: item.term, matchType: item.matchType, skipped: true, reason: item.row ? 'row not eligible or already at/above suggested bid' : 'row not found', row: item.row });
          continue;
        }
        const sourceRow = findKeyword(beforeByGroup[item.groupKey] || [], item.term, item.matchType);
        const payload = buildBidPayload(sourceRow, item.suggestedBid);
        const response = await patchAdv(ws, '/keyword/batchKeyword', payload);
        execution.bidUpdates.push({
          term: item.term,
          matchType: item.matchType,
          groupKey: item.groupKey,
          keywordId: String(sourceRow.keywordId || ''),
          from: Number(sourceRow.bid),
          to: item.suggestedBid,
          skipped: false,
          ok: Number(response?.json?.code) === 200,
          response,
        });
      }
      if (appendTargets.length && appendPayload.ok) {
        const response = await postAdv(ws, appendPayload.requestUrl, appendPayload.requestBody);
        execution.append = {
          skipped: false,
          ok: Number(response?.code) === 200 &&
            responseSuccessCount(response) === appendTargets.length &&
            responseErrorCount(response) === 0,
          response,
          responseSuccessCount: responseSuccessCount(response),
          responseErrorCount: responseErrorCount(response),
        };
        await new Promise(resolve => setTimeout(resolve, 45000));
      } else {
        execution.append = {
          skipped: true,
          ok: appendTargets.length === 0,
          reason: appendTargets.length ? appendPayload.errors.join('; ') : 'all append targets duplicate or filtered',
          response: null,
          responseSuccessCount: 0,
          responseErrorCount: 0,
        };
      }
    }

    let afterReads = await fetchAllGroups(ws);
    let afterRows = afterReads.flatMap(read => read.rows.map(row => ({
      ...summarizeKeyword(row),
      sourceGroup: read.group.key,
    })));
    const landedAppendRows = afterRows
      .filter(row => String(row.campaignId) === PLAN.appendCampaignId && String(row.adGroupId) === PLAN.appendAdGroupId)
      .filter(row => PLAN.appendTargets.some(target =>
        normalizeTerm(target.value) === normalizeTerm(row.keywordText) &&
        normalizeMatch(target.matchType) === row.matchType
      ));
    const submittedAppendSet = new Set(appendTargets.map(target => `${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`));
    let missingAppendAfter = appendTargets
      .filter(target => !landedAppendRows.some(row => `${normalizeTerm(row.keywordText)}::${row.matchType}` === `${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`))
      .map(target => target.value);

    if (EXECUTE && appendTargets.length && missingAppendAfter.length) {
      await new Promise(resolve => setTimeout(resolve, 60000));
      afterReads = await fetchAllGroups(ws);
      afterRows = afterReads.flatMap(read => read.rows.map(row => ({ ...summarizeKeyword(row), sourceGroup: read.group.key })));
      const refreshedAppendRows = afterRows
        .filter(row => String(row.campaignId) === PLAN.appendCampaignId && String(row.adGroupId) === PLAN.appendAdGroupId)
        .filter(row => PLAN.appendTargets.some(target =>
          normalizeTerm(target.value) === normalizeTerm(row.keywordText) &&
          normalizeMatch(target.matchType) === row.matchType
        ));
      landedAppendRows.length = 0;
      landedAppendRows.push(...refreshedAppendRows);
      missingAppendAfter = appendTargets
        .filter(target => !landedAppendRows.some(row => `${normalizeTerm(row.keywordText)}::${row.matchType}` === `${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`))
        .map(target => target.value);
    }

    const bidReadback = PLAN.bidUpdates.map(action => {
      const group = PLAN.groups.find(item => item.key === action.groupKey);
      const row = afterRows.find(item =>
        item.sourceGroup === action.groupKey &&
        normalizeTerm(item.keywordText) === normalizeTerm(action.term) &&
        item.matchType === normalizeMatch(action.matchType)
      );
      return {
        term: action.term,
        matchType: action.matchType,
        groupKey: action.groupKey,
        campaignId: group?.campaignId || '',
        adGroupId: group?.adGroupId || '',
        targetBid: action.suggestedBid,
        row: row || null,
        landed: !!row &&
          Number(row.bid) === Number(action.suggestedBid) &&
          Number(row.state) === 1 &&
          Number(row.campaignState) === 1 &&
          Number(row.groupState) === 1,
      };
    });

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      dryRun: !EXECUTE,
      evidenceBoundary: 'live ad backend and selection-system keyword evidence through shared Chrome on 2026-06-12; ad metrics complete through 2026-06-11',
      skuGoal: 'Controlled push for GT4431: add coverage across proven funeral/memorial buyer terms while preserving ACOS and avoiding weak broad expansion.',
      adjustmentScope: {
        object: 'single SKU GT4431',
        adLayers: 'existing SP owned keyword layers plus one exact append into existing exact group',
        timeWindow: '3/7/15/30-day SKU summary; 30-day child keyword rows; market evidence dated 2026-05-24 and 2026-05-31',
        trafficRange: 'funeral favors, funeral pins, memorial ribbons for funeral, memorial pins for funeral',
        resultCoverage: 'three stable bid repairs plus one exact append across low-risk exact/phrase coverage; budget unchanged; weak funeral ribbon broad row excluded',
      },
      problemLayer: 'owned exact/phrase coverage is under-delivering while broad/phrase historical rows convert; no evidence that campaign budgets are the main constraint.',
      direction: 'coverage push by bid repair and exact term append; not broad expansion',
      intensity: 'medium-low',
      bidEvidence: {
        sku7dCpc: 0.2714,
        sku30dCpc: 0.2544,
        funeralFavorsMarketCpcStart: 0.32,
        funeralFavorsMarketCpcMedian: 0.39,
        celebrationOfLifeFavorsMarketCpcStart: 0.32,
        strongestExistingPhraseCpc: 0.283,
        selectedBidBand: '0.24-0.30, below or near current proven SKU CPC/row CPC except exact memorial pins for funeral at 0.30 due strongest 30d receiver',
      },
      exclusions: [
        'No budget increase because current productAd spend does not show budget saturation.',
        'No funeral ribbon broad bid-up: 30d 1004 impressions / 15 clicks / 0 orders.',
        'No ASIN expansion today: ASIN lane remains low-volume and unconverted.',
        'No celebration of life favors add today: recent 7d board row has 5 clicks / 0 orders, so it stays observed.',
      ],
      plan: PLAN,
      before: {
        snapshot: saveSnapshot('gt4431_coverage_push_before_2026-06-12.json', beforeReads),
        bidPlan,
        appendExistingCandidateRows: existingRows.filter(row =>
          PLAN.appendTargets.some(target => normalizeTerm(target.value) === normalizeTerm(row.keywordText))
        ),
      },
      filtering: {
        duplicateAppendTargets: duplicateAppendTargets.map(target => target.value),
        sensitiveResponse: sensitive.response,
        internalResponse: internal.response,
        blockedAppendTargets: dedupedAppendTargets.filter(target => blocked.has(normalizeTerm(target.value))).map(target => target.value),
      },
      appendPayload,
      appendTargetsSubmitted: appendTargets.map(target => target.value),
      execution,
      readback: {
        snapshot: saveSnapshot('gt4431_coverage_push_after_2026-06-12.json', afterReads),
        bidReadback,
        landedAppendRows,
        missingAppendAfter,
        allBidUpdatesLanded: bidReadback.every(row => row.landed),
        allSubmittedAppendEnabled: missingAppendAfter.length === 0 &&
          landedAppendRows
            .filter(row => submittedAppendSet.has(`${normalizeTerm(row.keywordText)}::${row.matchType}`))
            .every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
      },
      acceptance: {
        threeDay: '2026-06-15: new exact/phrase coverage should begin receiving relevant impressions/clicks without dragging SKU 3d ACOS above 12%.',
        sevenDay: '2026-06-19: keep coverage if added rows have order signal or relevant clicks and SKU 7d ACOS stays <=15%; control any added row with 6 USD spend or 12 clicks and 0 order.',
        rollback: 'If any raised/appended row spends 6 USD or reaches 12 clicks with 0 order, reduce that row back to its prior bid or pause the appended exact row after live readback.',
      },
    };
    out.ok = EXECUTE
      ? out.readback.allBidUpdatesLanded && out.readback.allSubmittedAppendEnabled && (execution.append.skipped || execution.append.ok)
      : appendPayload.ok && bidPlan.every(row => row.row);
    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      dryRunOk: !EXECUTE ? out.ok : undefined,
      bidPlan: bidPlan.map(row => ({ term: row.term, matchType: row.matchType, current: row.row?.bid, to: row.suggestedBid, okToExecute: row.okToExecute })),
      duplicateAppendTargets: out.filtering.duplicateAppendTargets,
      blockedAppendTargets: out.filtering.blockedAppendTargets,
      appendTargetsSubmitted: out.appendTargetsSubmitted,
      appendBuildOk: appendPayload.ok,
      executionBidUpdates: execution.bidUpdates,
      appendExecution: execution.append,
      bidReadback,
      landedAppendRows,
      missingAppendAfter,
      ok: out.ok,
    }, null, 2));
    if (EXECUTE && !out.ok) process.exitCode = 2;
    if (!EXECUTE && !out.ok) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
