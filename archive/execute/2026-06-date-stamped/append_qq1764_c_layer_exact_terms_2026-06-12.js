const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'qq1764_c_layer_exact_append_2026-06-12.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-12',
  sku: 'QQ1764',
  asin: 'B0C1NF986W',
  accountId: 296,
  siteId: 4,
  appendLane: 'EXACT',
  campaignId: '206778787718361',
  adGroupId: '40529086558584',
  campaignName: 'ai_kw exact_converted precise terms_qq1764',
  groupName: 'ai_kw exact_converted precise terms_qq1764',
  targets: [
    { value: 'rainbow table cover', matchType: 'EXACT', bid: 0.60 },
    { value: 'rainbow pride tablecloth', matchType: 'EXACT', bid: 0.60 },
    { value: 'rainbow tablecloth bulk', matchType: 'EXACT', bid: 0.60 },
  ],
  duplicateCheckGroups: [
    { key: 'converted_exact', campaignId: '206778787718361', adGroupId: '40529086558584' },
    { key: 'pride_exact', campaignId: '94563087816298', adGroupId: '269730990124943' },
    { key: 'failed_new_exact_matrix', campaignId: '23944597730039', adGroupId: '18492561538379' },
    { key: 'kw_rainbow', campaignId: '453560590907042', adGroupId: '348728747999677' },
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

function timeRange() {
  return [
    new Date(`${PLAN.businessDate}T00:00:00`).getTime(),
    new Date(new Date(`${PLAN.businessDate}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchGroupKeywords(ws, group) {
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
    selectDate: [PLAN.businessDate, PLAN.businessDate],
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  return {
    group,
    response,
    rows: rowsFromResponse(response).filter(row =>
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
    siteId: PLAN.siteId,
    advType: 'SP',
    keywords_array: terms,
    campaignId: PLAN.campaignId,
    adGroupId: PLAN.adGroupId,
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
    campaignId: PLAN.campaignId,
    adGroupId: PLAN.adGroupId,
  });
  return { response, blocked: Object.values(response?.data || {}).flat().map(String) };
}

function responseSuccessCount(response) {
  const candidates = [
    response?.data?.keyword?.success,
    response?.data?.success,
    response?.success,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

function responseErrorCount(response) {
  const candidates = [
    response?.data?.keyword?.error,
    response?.data?.error,
    response?.error,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function saveSnapshot(name, value) {
  return writeJson(path.join(SNAPSHOT_DIR, name), value);
}

async function main() {
  const startedAt = new Date().toISOString();
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const beforeReads = [];
    for (const group of PLAN.duplicateCheckGroups) {
      beforeReads.push(await fetchGroupKeywords(ws, group));
    }
    const existingRows = beforeReads.flatMap(read => read.rows.map(row => ({ ...summarizeKeyword(row), sourceGroup: read.group.key })));
    const existingActive = new Set(existingRows
      .filter(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1)
      .map(row => `${normalizeTerm(row.keywordText)}::${row.matchType}`));
    const duplicateTargets = PLAN.targets.filter(target => existingActive.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`));
    const dedupedTargets = PLAN.targets.filter(target => !existingActive.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`));
    const sensitive = await filterSensitiveKeywords(ws, dedupedTargets.map(target => target.value));
    const internal = await filterInternalKeywords(ws, dedupedTargets.map(target => target.value));
    const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
    const targets = dedupedTargets.filter(target => !blocked.has(normalizeTerm(target.value)));
    const built = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.appendLane,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      targets,
    });

    const execution = { mode: EXECUTE ? 'execute' : 'dry-run', skipped: true, ok: !EXECUTE, reason: '', response: null };
    if (EXECUTE && targets.length && built.ok) {
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution.skipped = false;
      execution.ok = Number(response?.code) === 200 && responseSuccessCount(response) === targets.length && responseErrorCount(response) === 0;
      execution.responseSuccessCount = responseSuccessCount(response);
      execution.responseErrorCount = responseErrorCount(response);
      execution.response = response;
      await new Promise(resolve => setTimeout(resolve, 45000));
    } else if (EXECUTE && !targets.length) {
      execution.reason = 'all exact targets already existed or were filtered';
    } else if (EXECUTE && !built.ok) {
      execution.ok = false;
      execution.reason = built.errors.join('; ');
    } else {
      execution.reason = 'dry run only';
    }

    let after = await fetchGroupKeywords(ws, { key: 'converted_exact_after', campaignId: PLAN.campaignId, adGroupId: PLAN.adGroupId });
    let landedRows = after.rows
      .filter(row => PLAN.targets.some(target => normalizeTerm(target.value) === normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeKeyword);
    if (EXECUTE && landedRows.length < targets.length) {
      await new Promise(resolve => setTimeout(resolve, 45000));
      after = await fetchGroupKeywords(ws, { key: 'converted_exact_after', campaignId: PLAN.campaignId, adGroupId: PLAN.adGroupId });
      landedRows = after.rows
        .filter(row => PLAN.targets.some(target => normalizeTerm(target.value) === normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
        .map(summarizeKeyword);
    }

    const landedSet = new Set(landedRows.map(row => `${normalizeTerm(row.keywordText)}::${row.matchType}`));
    const missingAfter = targets
      .filter(target => !landedSet.has(`${normalizeTerm(target.value)}::${normalizeMatch(target.matchType)}`))
      .map(target => target.value);
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      dryRun: !EXECUTE,
      evidenceBoundary: 'live ad backend through shared Chrome; fallback append after fresh exact campaign API success but keyword rows did not read back',
      diagnosis: 'Append missing exact C-layer terms into the existing active exact group to complete QQ1764 C-layer coverage without waiting on a non-readable fresh exact campaign.',
      bidEvidence: {
        sku7dCpc: 0.7112,
        selectedBid: 0.60,
        existingExactBidBand: '0.50-0.72 for active pride/tablecloth exact rows',
      },
      plan: PLAN,
      before: {
        snapshot: saveSnapshot('qq1764_c_layer_exact_append_before_2026-06-12.json', beforeReads),
        existingCandidateRows: existingRows.filter(row =>
          PLAN.targets.some(target => normalizeTerm(target.value) === normalizeTerm(row.keywordText))
        ),
      },
      filtering: {
        duplicateTargets: duplicateTargets.map(target => target.value),
        sensitiveResponse: sensitive.response,
        internalResponse: internal.response,
        blockedTargets: dedupedTargets.filter(target => blocked.has(normalizeTerm(target.value))).map(target => target.value),
      },
      dryRunBuild: built,
      targetsSubmitted: targets.map(target => target.value),
      execution,
      readback: {
        snapshot: saveSnapshot('qq1764_c_layer_exact_append_after_2026-06-12.json', after),
        landedRows,
        missingAfter,
        allSubmittedLanded: missingAfter.length === 0,
        allSubmittedEnabled: missingAfter.length === 0 &&
          landedRows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
      },
      checkpoint: {
        firstReviewDate: '2026-06-15',
        successSignal: 'new phrase/exact rows start receiving impressions/clicks and QQ1764 7-day orders recover toward 60+ while ACOS stays <=32%',
        stopCondition: 'if C-layer rows spend 8 USD or 20 clicks without order, pause or bid down the weak row; if total spend rises and orders stay below 60, stop further C expansion',
      },
    };
    out.ok = EXECUTE
      ? !!(execution.ok && out.readback.allSubmittedEnabled)
      : built.ok;
    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      dryRunOk: built.ok,
      duplicateTargets: out.filtering.duplicateTargets,
      blockedTargets: out.filtering.blockedTargets,
      targetsSubmitted: out.targetsSubmitted,
      executionOk: execution.ok,
      responseSuccessCount: execution.responseSuccessCount || 0,
      responseErrorCount: execution.responseErrorCount || 0,
      landedRows,
      missingAfter,
      allSubmittedEnabled: out.readback.allSubmittedEnabled,
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
