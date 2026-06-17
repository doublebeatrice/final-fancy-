const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpAppendTargetPayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'hel0606_2025_turtle_terms_append_2026-06-10.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-10',
  dataDateRange: ['2026-05-11', '2026-06-09'],
  structureDateRange: ['2026-06-10', '2026-06-10'],
  sku: 'HEL0606',
  asin: 'B0C7KGV5MT',
  accountId: 487,
  siteId: 4,
  campaignId: '193647937042754',
  adGroupId: '20137014218264',
  campaignName: 'b2b kw broad_turtle gifts_hel0606',
  groupName: 'b2b kw broad_turtle gifts_hel0606',
  appendLane: 'BROAD',
  targets: [
    { value: 'turtle party favors', matchType: 'BROAD', bid: 0.18, historicalCpc: 0.14, historicalOrders: 3 },
    { value: 'turtle charms for keychains', matchType: 'BROAD', bid: 0.15, historicalCpc: 0.09, historicalOrders: 3 },
    { value: 'turtle key chains bulk', matchType: 'BROAD', bid: 0.24, historicalCpc: 0.205, historicalOrders: 2 },
    { value: "you're turtely awesome keychains", matchType: 'BROAD', bid: 0.15, historicalCpc: 0.08, historicalOrders: 1 },
    { value: 'turtle party favors for kids', matchType: 'BROAD', bid: 0.15, historicalCpc: 0.05, historicalOrders: 1 },
    { value: 'turtle charms', matchType: 'BROAD', bid: 0.15, historicalCpc: 0.07, historicalOrders: 1 },
    { value: 'beach keychains', matchType: 'BROAD', bid: 0.15, historicalCpc: 0.115, historicalOrders: 1 },
    { value: 'teacher appreciation gifts in bulk keychains', matchType: 'BROAD', bid: 0.28, historicalCpc: 0.25, historicalOrders: 1 },
    { value: 'keychains in bulk', matchType: 'BROAD', bid: 0.33, historicalCpc: 0.30, historicalOrders: 1 },
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
  const selectDate = PLAN.structureDateRange || PLAN.dataDateRange;
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

function normalizeTerm(value) {
  return String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
    const beforeTerms = new Set(before.rows.map(row => normalizeTerm(row.keywordText || row.keyword || row.searchTerm)));
    const missingTargets = PLAN.targets.filter(target => !beforeTerms.has(normalizeTerm(target.value)));
    const built = buildSpAppendTargetPayload({
      positionType: 'keywordTarget',
      adGroupMatchType: PLAN.appendLane,
      siteId: PLAN.siteId,
      accountId: PLAN.accountId,
      campaignId: PLAN.campaignId,
      adGroupId: PLAN.adGroupId,
      targets: missingTargets,
    });

    let execution = {
      mode: EXECUTE ? 'execute' : 'dry-run',
      skipped: true,
      ok: !EXECUTE,
      reason: EXECUTE ? 'not executed' : 'dry run only',
      response: null,
    };

    if (EXECUTE && missingTargets.length && built.ok) {
      const t0 = Date.now();
      const response = await postAdv(ws, built.requestUrl, built.requestBody);
      execution = {
        mode: 'execute',
        skipped: false,
        ms: Date.now() - t0,
        ok: Number(response?.code) === 200 && responseSuccessCount(response) === missingTargets.length && responseErrorCount(response) === 0,
        responseSuccessCount: responseSuccessCount(response),
        responseErrorCount: responseErrorCount(response),
        response,
      };
      await sleep(45000);
    } else if (EXECUTE && !missingTargets.length) {
      execution = { mode: 'execute', skipped: true, ok: true, reason: 'all target terms already existed', response: null };
    } else if (EXECUTE && !built.ok) {
      execution = { mode: 'execute', skipped: true, ok: false, reason: built.errors.join('; '), response: null };
    }

    let after = await fetchGroupKeywords(ws);
    const wanted = new Set(PLAN.targets.map(target => normalizeTerm(target.value)));
    let landedRows = after.rows
      .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .map(summarizeKeyword);

    if (EXECUTE && missingTargets.length && landedRows.length < PLAN.targets.length) {
      await sleep(45000);
      after = await fetchGroupKeywords(ws);
      landedRows = after.rows
        .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
        .map(summarizeKeyword);
    }

    const landedTerms = new Set(landedRows.map(row => normalizeTerm(row.keywordText)));
    const submittedTerms = missingTargets.map(target => target.value);
    const missingAfter = submittedTerms.filter(term => !landedTerms.has(normalizeTerm(term)));
    const landedEnabledRows = landedRows.filter(row =>
      row.matchType === PLAN.appendLane &&
      String(row.state) === '1' &&
      String(row.campaignState) === '1' &&
      String(row.groupState) === '1'
    );

    const beforeSnapshot = saveSnapshot('hel0606_2025_turtle_terms_before_2026-06-10.json', before);
    const afterSnapshot = saveSnapshot('hel0606_2025_turtle_terms_after_2026-06-10.json', after);
    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      evidenceBoundary: 'live ad backend via shared Chrome debug session; GBrain historical SKU memory used only as reference',
      diagnosis: 'Restore 2025 buyer-query winners for HEL0606 turtle/keychain line that had 0 current impressions, excluding turtle keychain because it still has current traffic.',
      bidEvidence: {
        rule: 'bid slightly above 2025 actual CPC, with a 0.15 floor for traffic-capable recovery on very low historical CPC terms',
        liveSku7dCpc: 0.2265,
        liveSku30dCpc: 0.2341,
        existingBroadLaneCpc: 'about 0.285-0.32 recently; existing row bid band mostly 0.34-0.40',
      },
      plan: PLAN,
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
        secondReviewDate: '2026-06-17',
        successSignal: 'restored terms receive impressions/clicks and at least one turtle/keychain/appreciation-related order with controlled ACOS',
        failureCondition: 'if restored terms spend reaches 6 USD total or 20 clicks without order, cut weak rows back or pause the non-converting tails',
      },
    };

    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      dryRunOk: built.ok,
      termsSubmitted: submittedTerms,
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
      outFile: OUT,
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
