const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  buildSpCreatePayload,
  buildStateToggleRequest,
} = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'mf6328_ad_repair_2026-06-10.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const EXECUTE = process.argv.includes('--execute');

const PLAN = {
  businessDate: '2026-06-10',
  dataDateRange: ['2026-05-26', '2026-06-09'],
  sku: 'MF6328',
  asin: 'B0GMN2PCWN',
  accountId: 314,
  siteId: 4,
  pauseKeywordLane: {
    campaignId: '25287830145641',
    adGroupId: '158850663455662',
    terms: [
      'pool party decorations',
      'pool floats',
      'inflatable number balloon',
      'giant number balloon',
    ],
  },
  createCampaigns: [
    {
      key: 'kw_15th_scene',
      sku: 'MF6328',
      asin: 'B0GMN2PCWN',
      accountId: 314,
      siteId: 4,
      mode: 'keywordTarget',
      coreTerm: '15th birthday decorations',
      matchType: 'PHRASE',
      dailyBudget: 3,
      defaultBid: 0.45,
      campaignName: 'ai_kw phrase_15th birthday decorations_mf6328',
      groupName: 'ai_kw phrase_15th birthday decorations_mf6328',
      keywords: [
        '15th birthday decorations',
        '15th birthday party decorations',
        '15th birthday photo props',
        'number 15 birthday decorations',
      ],
    },
    {
      key: 'kw_birthday_pool_float',
      sku: 'MF6328',
      asin: 'B0GMN2PCWN',
      accountId: 314,
      siteId: 4,
      mode: 'keywordTarget',
      coreTerm: 'birthday pool float',
      matchType: 'PHRASE',
      dailyBudget: 3,
      defaultBid: 0.45,
      campaignName: 'ai_kw phrase_birthday pool float_mf6328',
      groupName: 'ai_kw phrase_birthday pool float_mf6328',
      keywords: [
        'birthday pool float',
        'birthday pool floats',
        'happy birthday pool float',
        'birthday pool party decorations',
        'pool birthday decorations',
        'pool birthday party decorations',
      ],
    },
    {
      key: 'asin_same_as_scene',
      sku: 'MF6328',
      asin: 'B0GMN2PCWN',
      accountId: 314,
      siteId: 4,
      mode: 'productTarget',
      coreTerm: 'birthday 15th pool scene',
      targetType: 'ASIN_SAME_AS',
      dailyBudget: 3,
      defaultBid: 0.46,
      campaignName: 'ai_asin same_as_birthday 15th pool scene_mf6328',
      groupName: 'ai_asin same_as_birthday 15th pool scene_mf6328',
      targetAsins: [
        'B0CTJQHZGS',
        'B0GLPB331R',
        'B0GFC55CBD',
        'B0CQXPPJXP',
        'B0CQXP38KG',
        'B0FMJC57S7',
        'B0G4W7LJXH',
        'B0BVR1VDKR',
        'B0F6YGLHP6',
        'B0CY2TFGXF',
      ],
    },
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

function rowsFromResponse(response) {
  const data = response?.data || {};
  return data.records || data.rows || data.list || data.targetRows || data?.targetData?.rows ||
    response?.records || response?.rows || response?.list || (Array.isArray(data) ? data : []);
}

async function fetchKeywordLane(ws, campaignId, adGroupId) {
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
    campaignId,
    adGroupId,
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
  const rows = rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(campaignId) &&
    String(row.adGroupId || '') === String(adGroupId)
  );
  return { response, rows };
}

async function fetchManualTargetLane(ws, campaignId, adGroupId) {
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
    campaignId,
    adGroupId,
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
  const rows = rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(campaignId) &&
    String(row.adGroupId || '') === String(adGroupId)
  );
  return { response, rows };
}

async function filterSensitiveKeywords(ws, plan) {
  if (!Array.isArray(plan.keywords) || !plan.keywords.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/keyword/checkSensitiveWord', {
    siteId: PLAN.siteId,
    advType: 'SP',
    keywords_array: plan.keywords,
  });
  return { response, blocked: Object.keys(response?.data || {}) };
}

async function filterInternalKeywords(ws, plan) {
  if (!Array.isArray(plan.keywords) || !plan.keywords.length) return { response: null, blocked: [] };
  const response = await postAdv(ws, '/filter/filterInternalAsinAndBrand', {
    siteId: PLAN.siteId,
    accountId: PLAN.accountId,
    targetType: 'keyword',
    productAsinArray: [PLAN.asin],
    targetArray: plan.keywords,
    advType: 'SP',
  });
  return { response, blocked: Object.values(response?.data || {}).flat().map(String) };
}

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeAsin(value) {
  return String(value || '').trim().toUpperCase();
}

function targetAsinFromRow(row = {}) {
  const raw = String(row.type || '').trim();
  const match = raw.match(/B[A-Z0-9]{9}/i);
  if (match) return match[0].toUpperCase();
  for (const list of [row.expression, row.resolvedExpression, row.expressions, row.resolvedExpressions]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const asin = normalizeAsin(item?.value);
      if (/^B[A-Z0-9]{9}$/.test(asin)) return asin;
    }
  }
  return '';
}

function extractCreateMeta(response = {}) {
  const data = response?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.adGroupId || ''),
    campaignName: param.campaignName || response?.campaignName || '',
    groupName: param.groupName || response?.groupName || '',
  };
}

function summarizeKeyword(row = {}) {
  return {
    keywordId: row.keywordId || row.id || '',
    keywordText: row.keywordText || row.keyword || row.searchTerm || '',
    matchType: row.matchType || '',
    bid: row.bid ?? null,
    state: row.state ?? '',
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
    bid: row.bid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
  };
}

function activeSpKeyword(row = {}) {
  return String(row.state) === '1' && String(row.campaignState) === '1' && String(row.groupState) === '1';
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
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
    const beforeBadLane = await fetchKeywordLane(ws, PLAN.pauseKeywordLane.campaignId, PLAN.pauseKeywordLane.adGroupId);
    const termsToPause = new Set(PLAN.pauseKeywordLane.terms.map(normalizeTerm));
    const pauseRows = beforeBadLane.rows
      .filter(row => termsToPause.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
      .filter(activeSpKeyword);

    const pauseBuilt = pauseRows.map(row => ({
      row: summarizeKeyword(row),
      built: buildStateToggleRequest(row, 'pause', 'keyword'),
    }));

    const builtCreates = [];
    for (const createPlan of PLAN.createCampaigns) {
      const sensitive = await filterSensitiveKeywords(ws, createPlan);
      const internal = await filterInternalKeywords(ws, createPlan);
      const blocked = new Set([...sensitive.blocked, ...internal.blocked].map(normalizeTerm).filter(Boolean));
      const filteredPlan = {
        ...createPlan,
        keywords: Array.isArray(createPlan.keywords)
          ? createPlan.keywords.filter(keyword => !blocked.has(normalizeTerm(keyword)))
          : createPlan.keywords,
        targetAsins: Array.isArray(createPlan.targetAsins)
          ? createPlan.targetAsins.filter(asin => normalizeAsin(asin) !== PLAN.asin)
          : createPlan.targetAsins,
      };
      builtCreates.push({
        key: createPlan.key,
        plan: filteredPlan,
        sensitive,
        internal,
        blocked: [...blocked],
        built: buildSpCreatePayload(filteredPlan),
      });
    }

    const execution = {
      mode: EXECUTE ? 'execute' : 'dry-run',
      pauses: [],
      creates: [],
    };

    if (EXECUTE) {
      for (const item of pauseBuilt) {
        const response = item.built.ok
          ? await postAdv(ws, item.built.requestUrl, item.built.requestBody, 'PATCH')
          : item.built;
        execution.pauses.push({
          row: item.row,
          ok: item.built.ok && (Number(response?.code) === 200 || String(response?.msg || '').toLowerCase() === 'success'),
          response,
        });
        await sleep(250);
      }

      for (const item of builtCreates) {
        const response = item.built.ok
          ? await postAdv(ws, item.built.requestUrl, item.built.requestBody, 'POST')
          : item.built;
        const createMeta = extractCreateMeta(response);
        const ok = item.built.ok && Number(response?.code) === 200 && !!createMeta.campaignId && !!createMeta.adGroupId;
        execution.creates.push({
          key: item.key,
          ok,
          response,
          createMeta,
        });
        await sleep(1000);
      }
      await sleep(50000);
    }

    const afterBadLane = await fetchKeywordLane(ws, PLAN.pauseKeywordLane.campaignId, PLAN.pauseKeywordLane.adGroupId);
    const readbackCreates = [];
    for (const create of execution.creates) {
      if (!create.createMeta?.campaignId || !create.createMeta?.adGroupId) continue;
      const plan = builtCreates.find(item => item.key === create.key)?.plan || {};
      const readback = plan.mode === 'productTarget'
        ? await fetchManualTargetLane(ws, create.createMeta.campaignId, create.createMeta.adGroupId)
        : await fetchKeywordLane(ws, create.createMeta.campaignId, create.createMeta.adGroupId);
      readbackCreates.push({ key: create.key, plan, createMeta: create.createMeta, readback });
    }

    const verification = {
      pausedRows: afterBadLane.rows
        .filter(row => termsToPause.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
        .map(summarizeKeyword),
      created: readbackCreates.map(item => {
        if (item.plan.mode === 'productTarget') {
          const wanted = new Set((item.plan.targetAsins || []).map(normalizeAsin));
          const landed = item.readback.rows
            .filter(row => wanted.has(targetAsinFromRow(row)))
            .map(summarizeTarget);
          const landedSet = new Set(landed.map(row => normalizeAsin(row.asin)));
          return {
            key: item.key,
            campaignId: item.createMeta.campaignId,
            adGroupId: item.createMeta.adGroupId,
            landed,
            missing: [...wanted].filter(asin => !landedSet.has(asin)),
          };
        }
        const wanted = new Set((item.plan.keywords || []).map(normalizeTerm));
        const landed = item.readback.rows
          .filter(row => wanted.has(normalizeTerm(row.keywordText || row.keyword || row.searchTerm)))
          .map(summarizeKeyword);
        const landedSet = new Set(landed.map(row => normalizeTerm(row.keywordText)));
        return {
          key: item.key,
          campaignId: item.createMeta.campaignId,
          adGroupId: item.createMeta.adGroupId,
          landed,
          missing: [...wanted].filter(term => !landedSet.has(term)),
        };
      }),
    };

    const out = {
      exportedAt: new Date().toISOString(),
      startedAt,
      businessDate: PLAN.businessDate,
      evidenceBoundary: 'live ad backend via shared Chrome debug session; market evidence from 2026-06-10 selection/SIF reads; GBrain historical decision memory',
      diagnosis: 'MF6328 ad repair: stop active broad wrong entries, create separate phrase lanes for 15th birthday scene and birthday pool float scene, and create ASIN_SAME_AS scene targeting. No SB winner change and no budget scale beyond new controlled lanes.',
      bidEvidence: {
        sku7dCpc: 0.4332,
        sku30dCpc: 0.438,
        activeSpCoreBidBand: '0.40-0.47',
        activeAsinBidBand: '0.46-0.49',
        chosenKeywordDefaultBid: 0.45,
        chosenAsinDefaultBid: 0.46,
      },
      marketEvidence: {
        birthdayPoolFloat: 'selection keyword conversion 2026-05-24 period: searchVolume=701, clicks=175, purchases=16, clickPurchaseRatio=0.0914',
        birthdayPoolExistingOrders: 'SB live rows 2026-05-26..2026-06-09: birthday pool floats 18 clicks / 2 orders; related SB birthday/pool terms 6 orders total',
        fifteenthBirthdayScene: 'Product Time Machine: 15th birthday decorations total=320, latestSearchVolume=449; top scene ASINs include 600+ bought rows',
      },
      plan: PLAN,
      before: {
        pauseLaneRows: beforeBadLane.rows.map(summarizeKeyword),
      },
      dryRun: {
        pauseBuilt,
        builtCreates,
      },
      execution,
      verification,
      files: {
        afterPauseLaneSnapshot: writeJson(path.join(SNAPSHOT_DIR, 'mf6328_ad_repair_after_pause_lane_2026-06-10.json'), afterBadLane),
      },
      checkpoint: {
        firstReviewDate: '2026-06-13',
        secondReviewDate: '2026-06-17',
        successSignal: 'new phrase/ASIN lanes get qualified impressions/clicks and at least first order signal without generic spend returning',
        stopCondition: 'If new lanes accumulate about 20 qualified clicks or 6-8 USD spend with 0 order and weak CTR, pause or cut the specific loser lane instead of reopening broad generic terms.',
      },
    };

    writeJson(OUT, out);
    console.log(JSON.stringify({
      out: OUT,
      mode: execution.mode,
      pausesPlanned: pauseBuilt.map(item => item.row.keywordText),
      pausesExecuted: execution.pauses.map(item => ({ keywordText: item.row.keywordText, ok: item.ok })),
      createsPlanned: builtCreates.map(item => ({ key: item.key, ok: item.built.ok, campaignName: item.built.campaignName, errors: item.built.errors })),
      createsExecuted: execution.creates.map(item => ({ key: item.key, ok: item.ok, campaignId: item.createMeta.campaignId, adGroupId: item.createMeta.adGroupId })),
      verification,
    }, null, 2));

    const failedPause = execution.pauses.some(item => !item.ok);
    const failedCreate = execution.creates.some(item => !item.ok);
    const missingCreated = verification.created.some(item => (item.missing || []).length);
    if (EXECUTE && (failedPause || failedCreate || missingCreated)) process.exitCode = 2;
  } finally {
    ws.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
