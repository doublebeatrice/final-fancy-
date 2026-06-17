const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const EXECUTE = process.argv.includes('--execute');
const OUT_FILE = path.join(ROOT, 'data', 'actions', 'qaa0976_selective_restore_system_keyword_2026-06-15.json');

const CONFIG = {
  sku: 'QAA0976',
  asin: 'B0D533VKK9',
  siteId: 4,
  accountId: 604,
  campaignId: '405004694820095',
  adGroupId: '386699059333360',
  adId: '435158597097210',
  campaignName: 'family reunion-qaa0976-system-keyword',
  targetBudget: 3,
  dateRange: ['2024-07-01', '2026-06-14'],
  targetKeywords: [
    { term: 'family reunion', bid: 0.4, tier: 'core_market_and_history' },
    { term: 'family reunion favors', bid: 0.4, tier: 'core_market_and_history' },
    { term: 'family reunion gifts', bid: 0.36, tier: 'core_market_and_history' },
    { term: 'family reunion gift', bid: 0.36, tier: 'history_exact' },
    { term: 'family reunion bottle opener', bid: 0.36, tier: 'history_exact_product_form' },
    { term: 'personalized family reunion party favors', bid: 0.32, tier: 'history_long_tail' },
    { term: 'family party favors', bid: 0.3, tier: 'history_broader_controlled' },
  ],
};

function normalizeTerm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, 120000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const exception = response.result?.exceptionDetails;
      if (exception) return reject(new Error(exception.exception?.description || exception.text));
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

async function makeWs() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  return ws;
}

function getList(json) {
  return json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
    json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
}

async function advEval(ws, body) {
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      async function request(method, url, payload) {
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers,
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { httpStatus: res.status, ok: res.ok, code: json?.code ?? null, msg: json?.msg || json?.message || '', json: json || { text: text.slice(0, 1000) } };
      }
      ${body}
    })()
  `;
  const raw = await evalInTab(ws, expression, true);
  return JSON.parse(raw || '{}');
}

async function fetchKeywordRows(ws) {
  return advEval(ws, `
    const selectDate = ${JSON.stringify(CONFIG.dateRange)};
    const basePayload = {
      siteId: ${CONFIG.siteId},
      timeRange: [
        new Date(selectDate[0] + 'T00:00:00').getTime(),
        new Date(new Date(selectDate[1] + 'T00:00:00').getTime() + 86400000).getTime()
      ],
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: ${JSON.stringify(CONFIG.accountId)},
      campaignId: ${JSON.stringify(CONFIG.campaignId)},
      adGroupId: ${JSON.stringify(CONFIG.adGroupId)},
      property: '1',
      selectDate,
      field: 'Spend',
      order: 'desc',
      limit: 500,
      filterArray: { campaignState: '4' },
    };
    const rows = [];
    const pages = [];
    for (let page = 1; page <= 20; page += 1) {
      const response = await request('POST', '/keyword/findAllNew', { ...basePayload, page });
      const list = getList(response.json || {});
      pages.push({ page, ok: response.ok, httpStatus: response.httpStatus, rowCount: list.length, code: response.code, msg: response.msg });
      rows.push(...list);
      if (list.length < 500) break;
    }
    const filtered = rows.filter(row =>
      String(row.campaignId || '') === ${JSON.stringify(CONFIG.campaignId)} &&
      String(row.adGroupId || '') === ${JSON.stringify(CONFIG.adGroupId)}
    );
    return JSON.stringify({ ok: true, pages, rows: filtered });
  `);
}

async function fetchProductAdRows(ws) {
  return advEval(ws, `
    const selectDate = ${JSON.stringify(CONFIG.dateRange)};
    const states = [1, 2, 4];
    const results = [];
    for (const state of states) {
      const response = await request('POST', '/product/adProductData', {
        selectDate,
        mode: 1,
        state,
        siteId: ${CONFIG.siteId},
        sku: ${JSON.stringify(CONFIG.sku)},
        userName: ['HJ17', 'HJ171', 'HJ172'],
        level: 'seller_num',
        field: 'Spend',
        order: 'desc',
        page: 1,
        limit: 500,
      });
      const rows = getList(response.json || {});
      results.push({ state, ok: response.ok, httpStatus: response.httpStatus, code: response.code, msg: response.msg, rowCount: rows.length, rows });
    }
    const rows = results.flatMap(item => item.rows || []).filter(row =>
      String(row.adId || row.ad_id || row.id || '') === ${JSON.stringify(CONFIG.adId)} ||
      (String(row.campaignId || '') === ${JSON.stringify(CONFIG.campaignId)} && String(row.adGroupId || row.ad_group_id || '') === ${JSON.stringify(CONFIG.adGroupId)})
    );
    return JSON.stringify({ ok: true, results: results.map(({ rows, ...rest }) => rest), rows });
  `);
}

function successLike(result = {}) {
  return !!result.ok && (Number(result.code) === 200 || String(result.msg || '').toLowerCase() === 'success');
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: String(row.keywordId || ''),
    term: row.keywordText || '',
    matchType: row.matchType,
    state: row.state,
    campaignState: row.campaignState,
    groupState: row.groupState,
    bid: row.bid,
    impressions: row.Impressions,
    clicks: row.Clicks,
    spend: row.Spend,
    orders: row.Orders,
    sales: row.Sales,
    cpc: row.CPC,
    acos: row.ACOS,
  };
}

function summarizeProductAd(row = {}) {
  return {
    adId: String(row.adId || row.ad_id || row.id || ''),
    sku: row.sku,
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || row.ad_group_id || ''),
    campaignName: row.campaignName,
    groupName: row.groupName,
    state: row.state,
    campaignState: row.campaignState,
    groupState: row.groupState,
    dailyBudget: row.dailyBudget || row.budget,
    servingStatus: row.servingStatus,
  };
}

function dedupeKeywordRows(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = String(row.keywordId || '').trim() || `${normalizeTerm(row.keywordText)}::${row.matchType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function mergeKeywordRows(...groups) {
  return dedupeKeywordRows(groups.flatMap(rows => rows || []));
}

function keywordStatePayload(row, action) {
  const numericState = action === 'enable' ? 1 : 2;
  const textState = action === 'enable' ? 'enabled' : 'paused';
  const keywordId = String(row.keywordId || '');
  return {
    url: '/keyword/batchKeyword',
    method: 'PATCH',
    body: {
      siteId: Number(row.siteId || CONFIG.siteId),
      accountId: Number(row.accountId || CONFIG.accountId),
      column: 'state',
      targetArray: [{ keywordId, state: textState }],
      targetNewArray: [{
        keywordId,
        state: numericState,
        accountId: Number(row.accountId || CONFIG.accountId),
        campaignId: String(row.campaignId || CONFIG.campaignId),
        adGroupId: String(row.adGroupId || CONFIG.adGroupId),
      }],
      property: 'keyword',
      idArray: [keywordId],
      campaignIdArray: [String(row.campaignId || CONFIG.campaignId)],
      operation: 'state',
    },
  };
}

function keywordBidPayload(row, bid) {
  const keywordId = String(row.keywordId || '');
  const targetRow = {
    ...row,
    keywordId,
    bid: Number(bid).toFixed(2),
    siteId: Number(row.siteId || CONFIG.siteId),
    accountId: Number(row.accountId || CONFIG.accountId),
    campaignId: String(row.campaignId || CONFIG.campaignId),
    adGroupId: String(row.adGroupId || CONFIG.adGroupId),
    matchType: row.matchType,
    advType: 'SP',
    bidThreshold: row.bidThreshold,
    adFormat: row.adFormat,
    costType: row.costType,
  };
  return {
    url: '/keyword/batchKeyword',
    method: 'PATCH',
    body: {
      column: 'bid',
      property: 'keyword',
      operation: 'bid',
      manualTargetType: '',
      accountId: Number(row.accountId || CONFIG.accountId),
      siteId: Number(row.siteId || CONFIG.siteId),
      idArray: [keywordId],
      campaignIdArray: [String(row.campaignId || CONFIG.campaignId)],
      targetArray: [targetRow],
      targetNewArray: [targetRow],
    },
  };
}

function budgetPayload(productAdRow) {
  return {
    url: '/campaign/batchCampaign',
    method: 'PATCH',
    body: {
      siteId: Number(productAdRow?.siteId || CONFIG.siteId),
      accountId: Number(productAdRow?.accountId || CONFIG.accountId),
      campaignNewArray: [{
        siteId: Number(productAdRow?.siteId || CONFIG.siteId),
        accountId: Number(productAdRow?.accountId || CONFIG.accountId),
        campaignId: CONFIG.campaignId,
        budget: CONFIG.targetBudget.toFixed(2),
      }],
      batchType: 'add-budget-value',
      batch_campaigns: [CONFIG.campaignId],
      columnVal: [CONFIG.targetBudget.toFixed(2)],
      campaignIdArray: [CONFIG.campaignId],
      column: 'budget',
      property: 'campaign',
      operation: 'dailyBudget',
    },
  };
}

function enableCampaignPayload(productAdRow) {
  return {
    url: '/campaign/batchCampaign',
    method: 'PATCH',
    body: {
      siteId: Number(productAdRow?.siteId || CONFIG.siteId),
      accountId: Number(productAdRow?.accountId || CONFIG.accountId),
      column: 'state',
      property: 'campaign',
      operation: 'state',
      batchType: 'state',
      batchValue: [1],
      columnVal: [1],
      value: 'enabled',
      campaignIdArray: [CONFIG.campaignId],
      batch_campaigns: [CONFIG.campaignId],
      idArray: [CONFIG.campaignId],
      campaignNewArray: [{
        siteId: Number(productAdRow?.siteId || CONFIG.siteId),
        accountId: Number(productAdRow?.accountId || CONFIG.accountId),
        campaignId: CONFIG.campaignId,
        state: 1,
        campaignState: 1,
      }],
    },
  };
}

function enableAdGroupPayload(productAdRow) {
  return {
    url: '/advGroup/editGroupColumn',
    method: 'PATCH',
    body: {
      siteId: Number(productAdRow?.siteId || CONFIG.siteId),
      accountId: Number(productAdRow?.accountId || CONFIG.accountId),
      campaignId: CONFIG.campaignId,
      adGroupId: [CONFIG.adGroupId],
      key: 'state',
      value: 'enabled',
      property: 'group',
      groupIdArray: [CONFIG.adGroupId],
      campaignIdArray: [CONFIG.campaignId],
      operation: 'state',
      groupNewArray: [{
        siteId: Number(productAdRow?.siteId || CONFIG.siteId),
        accountId: Number(productAdRow?.accountId || CONFIG.accountId),
        campaignId: CONFIG.campaignId,
        adGroupId: CONFIG.adGroupId,
        state: 1,
      }],
    },
  };
}

function enableProductAdPayload(productAdRow) {
  return {
    url: '/advProduct/batchProduct',
    method: 'PATCH',
    body: {
      siteId: Number(productAdRow?.siteId || CONFIG.siteId),
      accountId: Number(productAdRow?.accountId || CONFIG.accountId),
      column: 'state',
      value: 'enabled',
      products: [CONFIG.adId],
      property: 'product',
      idArray: [CONFIG.adId],
      operation: 'state',
      campaignIdArray: [CONFIG.campaignId],
      productNewArray: [{
        siteId: Number(productAdRow?.siteId || CONFIG.siteId),
        accountId: Number(productAdRow?.accountId || CONFIG.accountId),
        campaignId: CONFIG.campaignId,
        adGroupId: CONFIG.adGroupId,
        adId: CONFIG.adId,
        state: 1,
      }],
    },
  };
}

async function patchAdv(ws, requestSpec) {
  return advEval(ws, `
    const response = await request(${JSON.stringify(requestSpec.method)}, ${JSON.stringify(requestSpec.url)}, ${JSON.stringify(requestSpec.body)});
    return JSON.stringify(response);
  `);
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const ws = await makeWs();
  const startedAt = new Date().toISOString();
  try {
    const beforeKeywords = await fetchKeywordRows(ws);
    const beforeKeywordsSecondPass = await fetchKeywordRows(ws);
    const beforeProductAds = await fetchProductAdRows(ws);
    const targetByTerm = new Map(CONFIG.targetKeywords.map(item => [normalizeTerm(item.term), item]));
    const keywordRows = mergeKeywordRows(beforeKeywords.rows || [], beforeKeywordsSecondPass.rows || []);
    const missingTargets = CONFIG.targetKeywords.filter(item =>
      !keywordRows.some(row => normalizeTerm(row.keywordText) === normalizeTerm(item.term))
    );
    if (missingTargets.length) {
      throw new Error(`Missing target keyword rows: ${missingTargets.map(item => item.term).join(', ')}`);
    }

    const targetRows = keywordRows.filter(row => targetByTerm.has(normalizeTerm(row.keywordText)));
    const nonTargetEnabledRows = keywordRows.filter(row =>
      String(row.state) === '1' && !targetByTerm.has(normalizeTerm(row.keywordText))
    );
    const productAdRow = (beforeProductAds.rows || [])[0] || {};

    const planned = {
      pauseNonTargetKeywords: nonTargetEnabledRows.map(summarizeKeyword),
      enableTargetKeywords: targetRows.filter(row => String(row.state) !== '1').map(summarizeKeyword),
      bidRepairs: targetRows.map(row => {
        const target = targetByTerm.get(normalizeTerm(row.keywordText));
        return { ...summarizeKeyword(row), requestedBid: target.bid, tier: target.tier };
      }).filter(row => Math.abs(Number(row.bid) - Number(row.requestedBid)) > 0.0001),
      parent: {
        budget: { current: productAdRow.dailyBudget || productAdRow.budget || '', requested: CONFIG.targetBudget.toFixed(2) },
        campaign: { currentState: productAdRow.campaignState, requestedState: 1 },
        adGroup: { currentState: productAdRow.groupState, requestedState: 1 },
        productAd: { currentState: productAdRow.state, requestedState: 1, adId: CONFIG.adId },
      },
    };

    const execution = { mode: EXECUTE ? 'execute' : 'dry-run', steps: [] };
    async function runStep(name, spec, meta = {}) {
      if (!EXECUTE) {
        execution.steps.push({ name, dryRun: true, meta, request: { url: spec.url, method: spec.method, body: spec.body } });
        return null;
      }
      const response = await patchAdv(ws, spec);
      execution.steps.push({ name, ok: successLike(response), meta, response });
      await sleep(350);
      return response;
    }

    for (const row of nonTargetEnabledRows) {
      await runStep('pauseNonTargetKeyword', keywordStatePayload(row, 'pause'), summarizeKeyword(row));
    }
    for (const row of targetRows) {
      if (String(row.state) !== '1') {
        await runStep('enableTargetKeyword', keywordStatePayload(row, 'enable'), summarizeKeyword(row));
      }
    }
    for (const row of targetRows) {
      const target = targetByTerm.get(normalizeTerm(row.keywordText));
      if (Math.abs(Number(row.bid) - Number(target.bid)) > 0.0001) {
        await runStep('repairTargetKeywordBid', keywordBidPayload(row, target.bid), {
          ...summarizeKeyword(row),
          requestedBid: target.bid,
          tier: target.tier,
        });
      }
    }
    await runStep('setCampaignBudget', budgetPayload(productAdRow), planned.parent.budget);
    await runStep('enableCampaign', enableCampaignPayload(productAdRow), planned.parent.campaign);
    await runStep('enableAdGroup', enableAdGroupPayload(productAdRow), planned.parent.adGroup);
    await runStep('enableProductAd', enableProductAdPayload(productAdRow), planned.parent.productAd);

    if (EXECUTE) await sleep(3500);
    let afterKeywords = await fetchKeywordRows(ws);
    let afterRows = dedupeKeywordRows(afterKeywords.rows || []);
    for (let remediation = 1; EXECUTE && remediation <= 2; remediation += 1) {
      const stillEnabled = afterRows
        .filter(row => !targetByTerm.has(normalizeTerm(row.keywordText)))
        .filter(row => String(row.state) === '1');
      if (!stillEnabled.length) break;
      for (const row of stillEnabled) {
        await runStep('remediateNonTargetKeywordPause', keywordStatePayload(row, 'pause'), {
          ...summarizeKeyword(row),
          remediation,
        });
      }
      await sleep(1500);
      afterKeywords = await fetchKeywordRows(ws);
      afterRows = dedupeKeywordRows(afterKeywords.rows || []);
    }
    const afterProductAds = await fetchProductAdRows(ws);
    const afterTargets = CONFIG.targetKeywords.map(target => {
      const row = afterRows.find(item => normalizeTerm(item.keywordText) === normalizeTerm(target.term));
      return { requestedBid: target.bid, tier: target.tier, row: summarizeKeyword(row || {}) };
    });
    const afterNonTargetsStillEnabled = afterRows
      .filter(row => !targetByTerm.has(normalizeTerm(row.keywordText)))
      .filter(row => String(row.state) === '1')
      .map(summarizeKeyword);
    const afterProductAdRow = (afterProductAds.rows || [])[0] || {};
    const verification = {
      targetKeywordsLanded: afterTargets.every(item =>
        String(item.row.state) === '1' &&
        String(item.row.campaignState) === '1' &&
        String(item.row.groupState) === '1' &&
        Math.abs(Number(item.row.bid) - Number(item.requestedBid)) < 0.001
      ),
      nonTargetsPaused: afterNonTargetsStillEnabled.length === 0,
      parentLanded: String(afterProductAdRow.state) === '1' &&
        String(afterProductAdRow.campaignState) === '1' &&
        String(afterProductAdRow.groupState) === '1',
      budgetLanded: Math.abs(Number(afterProductAdRow.dailyBudget || afterProductAdRow.budget) - CONFIG.targetBudget) < 0.001,
      afterTargets,
      afterNonTargetsStillEnabled,
      afterProductAd: summarizeProductAd(afterProductAdRow),
    };

    const report = {
      ok: EXECUTE ? (
        execution.steps.every(step => step.ok !== false) &&
        verification.targetKeywordsLanded &&
        verification.nonTargetsPaused &&
        verification.parentLanded &&
        verification.budgetLanded
      ) : true,
      mode: execution.mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      config: CONFIG,
      evidenceBoundary: 'Live ad backend read/write via shared Chrome debug session; historical rows from 2024-07-01 to 2026-06-14.',
      decision: {
        operatingGoal: 'Restore QAA0976 family reunion owned keyword coverage by reusing the old keyword group but only opening historically converting exact terms.',
        scope: 'Old SP keyword campaign/ad group only; no auto, ASIN, SB, SBV, or SD changes in this action.',
        guardrail: 'Pause non-target enabled keyword rows before opening parent entities so old system noise is not reactivated.',
      },
      before: {
        keywords: keywordRows.map(summarizeKeyword),
        productAd: summarizeProductAd(productAdRow),
      },
      planned,
      execution,
      after: {
        keywords: afterRows.map(summarizeKeyword),
        productAd: summarizeProductAd(afterProductAdRow),
      },
      verification,
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
      outputFile: OUT_FILE,
      ok: report.ok,
      mode: report.mode,
      plannedCounts: {
        pauseNonTargetKeywords: planned.pauseNonTargetKeywords.length,
        enableTargetKeywords: planned.enableTargetKeywords.length,
        bidRepairs: planned.bidRepairs.length,
      },
      verification: {
        targetKeywordsLanded: verification.targetKeywordsLanded,
        nonTargetsPaused: verification.nonTargetsPaused,
        parentLanded: verification.parentLanded,
        budgetLanded: verification.budgetLanded,
        afterProductAd: verification.afterProductAd,
        afterNonTargetsStillEnabled: verification.afterNonTargetsStillEnabled.map(row => row.term),
      },
    }, null, 2));
    if (EXECUTE && !report.ok) process.exitCode = 1;
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
