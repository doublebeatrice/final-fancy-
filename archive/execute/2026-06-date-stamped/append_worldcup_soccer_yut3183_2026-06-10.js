const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'worldcup_soccer_yut3183_append_2026-06-10.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-10',
  dataDateRange: ['2026-05-11', '2026-06-09'],
  sku: 'YUT3183',
  asin: 'B0D3PKTJWT',
  accountId: 737,
  siteId: 4,
  campaignId: '107436363126588',
  adGroupId: '237646507115366',
  campaignName: 'kw phrase_soccer balls-yut3183',
  groupName: 'kw phrase_soccer balls-yut3183',
  appendLane: 'PHRASE',
  targets: [
    { value: 'world cup soccer ball', matchType: 'PHRASE', bid: 0.55 },
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

function rowsFromKeywordResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || (Array.isArray(response?.data) ? response.data : []);
}

function timeRange(dateRange) {
  return [
    new Date(`${dateRange[0]}T00:00:00`).getTime(),
    new Date(new Date(`${dateRange[1]}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchGroupKeywords(ws) {
  const selectDate = PLAN.dataDateRange;
  const rows = [];
  const pages = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', {
      siteId: PLAN.siteId,
      timeRange: timeRange(selectDate),
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      property: '1',
      selectDate,
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const pageRows = rowsFromKeywordResponse(response);
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
    pages,
    rows: rows.filter(row =>
      String(row?.campaignId || '') === PLAN.campaignId &&
      String(row?.adGroupId || '') === PLAN.adGroupId
    ),
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

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchTypeLabel(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === '3') return 'BROAD';
  if (text === '2') return 'PHRASE';
  if (text === '1') return 'EXACT';
  return text;
}

function summarizeKeyword(row) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: matchTypeLabel(row.matchType || row.match_type || ''),
    bid: Number(row.bid ?? row.currentBid ?? row.cpcBid ?? 0),
    state: row.state ?? row.keywordState ?? '',
    campaignState: row.campaignState ?? row.campaign_state ?? '',
    groupState: row.groupState ?? row.group_state ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    impressions: Number(row.Impressions || row.impressions || 0),
    clicks: Number(row.Clicks || row.clicks || 0),
    orders: Number(row.Orders || row.orders || 0),
    spend: Number(row.Spend || row.spend || 0),
  };
}

function responseSuccessCount(response) {
  for (const item of [
    response?.data?.keyword?.success,
    response?.data?.success,
    response?.success,
  ]) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

function responseErrorCount(response) {
  for (const item of [
    response?.data?.keyword?.error,
    response?.data?.error,
    response?.error,
  ]) {
    if (Array.isArray(item)) return item.length;
  }
  return 0;
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

function saveSnapshot(name, payload) {
  return writeJson(path.join(SNAPSHOT_DIR, name), payload);
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const startedAt = new Date().toISOString();
  try {
    const before = await fetchGroupKeywords(ws);
    const beforeKeys = new Set(before.rows.map(row =>
      `${normalizeTerm(row.keywordText || row.keyword || row.searchTerm)}::${matchTypeLabel(row.matchType)}`
    ));
    const dedupedTargets = PLAN.targets.filter(target =>
      !beforeKeys.has(`${normalizeTerm(target.value)}::${target.matchType}`)
    );
    const sensitive = await filterSensitiveKeywords(ws, dedupedTargets.map(target => target.value));
    const internal = await filterInternalKeywords(ws, dedupedTargets.map(target => target.value));
    const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
    const filteredTargets = dedupedTargets.filter(target => !blocked.has(normalizeTerm(target.value)));
    const built = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.appendLane,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      targets: filteredTargets,
    });

    let execution = {
      mode: EXECUTE ? 'execute' : 'dry-run',
      skipped: true,
      ok: !EXECUTE,
      reason: EXECUTE ? 'not executed' : 'dry run only',
      response: null,
    };

    if (EXECUTE && filteredTargets.length && built.ok) {
      const t0 = Date.now();
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution = {
        mode: 'execute',
        skipped: false,
        ms: Date.now() - t0,
        ok: Number(response?.code) === 200 && responseSuccessCount(response) === filteredTargets.length && responseErrorCount(response) === 0,
        responseSuccessCount: responseSuccessCount(response),
        responseErrorCount: responseErrorCount(response),
        response,
      };
      await sleep(45000);
    } else if (EXECUTE && !filteredTargets.length) {
      execution = { mode: 'execute', skipped: true, ok: true, reason: 'no unblocked new keyword targets', response: null };
    } else if (EXECUTE && !built.ok) {
      execution = { mode: 'execute', skipped: true, ok: false, reason: built.errors.join('; '), response: null };
    }

    let after = await fetchGroupKeywords(ws);
    const wanted = new Set(PLAN.targets.map(target => normalizeTerm(target.value)));
    let landedRows = after.rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeKeyword);

    if (EXECUTE && filteredTargets.length && landedRows.length < PLAN.targets.length) {
      await sleep(45000);
      after = await fetchGroupKeywords(ws);
      landedRows = after.rows
        .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
        .map(summarizeKeyword);
    }

    const landedTermSet = new Set(landedRows.map(row => `${normalizeTerm(row.keywordText)}::${row.matchType}`));
    const submittedTerms = filteredTargets.map(target => target.value);
    const missingAfter = submittedTerms.filter(term => !landedTermSet.has(`${normalizeTerm(term)}::${PLAN.appendLane}`));
    const landedEnabledRows = landedRows.filter(row =>
      row.matchType === PLAN.appendLane &&
      String(row.state) === '1' &&
      String(row.campaignState) === '1' &&
      String(row.groupState) === '1'
    );

    const beforeSnapshot = saveSnapshot('worldcup_soccer_yut3183_before_2026-06-10.json', before);
    const afterSnapshot = saveSnapshot('worldcup_soccer_yut3183_after_2026-06-10.json', after);
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      evidenceBoundary: 'live ad backend + live inventory snapshot + selection/ABA market evidence + GBrain historical boundary',
      diagnosis: 'World Cup window starts 2026-06-11; only append one buyer-facing soccer term to the proven YUT3183 phrase lane. Do not add decorations/party-favor terms or expand weak siblings.',
      bidEvidence: {
        marketKeyword: 'world cup soccer ball',
        marketVerdict: 'ABA demand exists, but keyword-conversion layer is weak/high-risk; use only narrow phrase test.',
        selectedBid: 0.55,
        reason: '0.55 sits inside keyword-conversion autoForSales phrase CPC band 0.38-0.59 and below the proven YUT3183 phrase lane CPC/bid, enough for controlled impression recovery without broad spillover.',
        liveSkuCpc: { sku7dCpc: 0.672, sku30dCpc: 0.6699 },
        laneEvidence: 'YUT3183 phrase lane 30d 29 clicks / 2 orders / ACOS 14.25%; 7d 18 clicks / 2 orders / ACOS 8.56%.',
      },
      plan: PLAN,
      filtering: {
        duplicateSkipped: PLAN.targets.filter(target =>
          !dedupedTargets.some(item => normalizeTerm(item.value) === normalizeTerm(target.value))
        ).map(target => target.value),
        sensitive,
        internal,
        blockedTerms: [...blocked],
      },
      before: {
        snapshot: beforeSnapshot,
        rowCount: before.rows.length,
        existingTargetRows: before.rows
          .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
          .map(summarizeKeyword),
        pages: before.pages,
      },
      dryRun: built,
      missingTermsBeforeExecution: submittedTerms,
      execution,
      readback: {
        snapshot: afterSnapshot,
        rowCount: after.rows.length,
        landedRows,
        landedEnabledRows,
        missingAfter,
        submittedAllLanded: missingAfter.length === 0,
        submittedAllEnabled: missingAfter.length === 0 && landedEnabledRows.length >= submittedTerms.length,
        pages: after.pages,
      },
      checkpoint: {
        firstReviewDate: '2026-06-12',
        secondReviewDate: '2026-06-15',
        successSignal: '`world cup soccer ball` receives impressions/clicks, and YUT3183 total 3d clicks stay up without ACOS > 18%.',
        failureCondition: 'If the appended row reaches 4 USD spend or 6 clicks with 0 order, lower/pause it; do not add more World Cup generic terms to weak siblings.',
      },
    };

    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      dryRunOk: built.ok,
      termsSubmitted: submittedTerms,
      blockedTerms: [...blocked],
      executionOk: execution.ok,
      responseSuccessCount: execution.responseSuccessCount || 0,
      responseErrorCount: execution.responseErrorCount || 0,
      landed: landedRows.map(row => ({
        keywordText: row.keywordText,
        matchType: row.matchType,
        bid: row.bid,
        state: row.state,
        campaignState: row.campaignState,
        groupState: row.groupState,
      })),
      missingAfter,
      allLanded: missingAfter.length === 0,
      beforeSnapshot,
      afterSnapshot,
    }, null, 2));

    if (EXECUTE && (!execution.ok || missingAfter.length)) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
