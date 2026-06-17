const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const OUT = path.join(ROOT, 'data', 'actions', 'fd_b2b_auto_2026-06-12.json');
const BUSINESS_DATE = '2026-06-12';
const DATA_START_DATE = '2026-05-13';
const DATA_END_DATE = '2026-06-11';
const EXECUTE = process.argv.includes('--execute');

const EXISTING_B2B_AUTO_BID_UPDATES = [
  {
    sku: 'STA2610',
    accountId: 420,
    siteId: 4,
    campaignId: '41864613460261',
    adGroupId: '351014914604398',
    campaignName: 'b2b auto_pastor gifts_sta2610',
    groupName: 'b2b auto_pastor gifts_sta2610',
    targetBid: 0.5,
    reason: 'Reuse existing enabled B2B auto lane; operator requested B2B auto at 0.50 for Father\'s Day window.',
  },
  {
    sku: 'STA2607',
    accountId: 420,
    siteId: 4,
    campaignId: '266859201210964',
    adGroupId: '489167009750290',
    campaignName: 'b2b auto_pastor gifts_sta2607',
    groupName: 'b2b auto_pastor gifts_sta2607',
    targetBid: 0.5,
    reason: 'Reuse existing enabled B2B auto lane; operator requested B2B auto at 0.50 for Father\'s Day window.',
  },
  {
    sku: 'STA2604',
    accountId: 420,
    siteId: 4,
    campaignId: '107079638806834',
    adGroupId: '341991636806176',
    campaignName: 'b2b auto_pastor gifts_sta2604',
    groupName: 'b2b auto_pastor gifts_sta2604',
    targetBid: 0.5,
    reason: 'Reuse existing enabled B2B auto lane; operator requested B2B auto at 0.50 for Father\'s Day window.',
  },
];

const CREATE_PLANS = [
  {
    key: 'FE3235_b2b_auto',
    sku: 'FE3235',
    asin: 'B0F23LCF6M',
    accountId: 412,
    siteId: 4,
    mode: 'auto',
    campaignName: 'ai_auto_b2b christian gift set_fe3235',
    groupName: 'ai_auto_b2b christian gift set_fe3235',
    coreTerm: 'b2b christian gift set',
    siteRestriction: 'AMAZON_BUSINESS',
    siteAmazonBusiness: 0,
    offAmazonBudgetControlStrategy: null,
    dailyBudget: 3,
    defaultBid: 0.5,
  },
  {
    key: 'FE3232_b2b_auto',
    sku: 'FE3232',
    asin: 'B0F23LD73K',
    accountId: 412,
    siteId: 4,
    mode: 'auto',
    campaignName: 'ai_auto_b2b spanish christian gift set_fe3232',
    groupName: 'ai_auto_b2b spanish christian gift set_fe3232',
    coreTerm: 'b2b spanish christian gift set',
    siteRestriction: 'AMAZON_BUSINESS',
    siteAmazonBusiness: 0,
    offAmazonBudgetControlStrategy: null,
    dailyBudget: 3,
    defaultBid: 0.5,
  },
];

const SKIPPED = [
  {
    sku: 'STA2613',
    reason: 'Skipped: live ad SKU summary, live ad product data, sellerinventory product analysis, local repo search, and GBrain search did not return a reliable ASIN/account mapping.',
  },
];

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function snapshot(name, value) {
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

function targetId(row = {}) {
  return String(row.targetId || row.target_id || row.id || '').trim();
}

function normalizeTargetType(row = {}) {
  return String(row.type || row.targetingExpression || row.targetType || row.expressionType || '').trim();
}

function summarizeAutoTarget(row = {}) {
  return {
    targetId: targetId(row),
    type: normalizeTargetType(row),
    bid: Number(row.bid ?? row.currentBid ?? row.cpcBid ?? 0),
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    accountId: row.accountId || '',
    siteId: row.siteId || '',
    spend: Number(row.Spend ?? row.spend ?? 0),
    orders: Number(row.Orders ?? row.orders ?? 0),
    updatedAt: row.updatedAt || row.updated_at || '',
  };
}

function dataTimeRange() {
  return [
    new Date(`${DATA_START_DATE}T00:00:00`).getTime(),
    new Date(new Date(`${DATA_END_DATE}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

async function fetchAutoTargets(ws, group, dateStart = DATA_START_DATE, dateEnd = DATA_END_DATE) {
  const allRows = [];
  const pages = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await postAdv(ws, '/keyword/findAllNew', {
      siteId: group.siteId || 4,
      timeRange: [
        new Date(`${dateStart}T00:00:00`).getTime(),
        new Date(new Date(`${dateEnd}T00:00:00`).getTime() + 86400000).getTime(),
      ],
      state: '4',
      coreMark: '0',
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      publicAdv: '2',
      lowCost: 2,
      accountId: group.accountId,
      campaignId: group.campaignId,
      adGroupId: group.adGroupId,
      property: '2',
      tableName: 'product_target',
      selectDate: [dateStart, dateEnd],
      field: 'Spend',
      order: 'desc',
      page,
      limit: 500,
      filterArray: { campaignState: '4' },
    });
    const rows = rowsFromResponse(response);
    pages.push({ page, code: response?.code ?? null, msg: response?.msg || '', rowCount: rows.length });
    allRows.push(...rows);
    if (rows.length < 500) break;
  }
  return {
    group,
    pages,
    rows: allRows.filter(row =>
      String(row.campaignId || '') === String(group.campaignId) &&
      String(row.adGroupId || '') === String(group.adGroupId)
    ),
  };
}

function buildAutoBidPayload(group, rows, bid) {
  const targetArray = rows.map(row => ({
    ...row,
    siteId: row.siteId || group.siteId || 4,
    accountId: row.accountId || group.accountId,
    campaignId: row.campaignId || group.campaignId,
    adGroupId: row.adGroupId || group.adGroupId,
    targetId: targetId(row),
    bid: String(bid),
    advType: 'SP',
  }));
  return {
    column: 'bid',
    property: 'autoTarget',
    operation: 'bid',
    accountId: group.accountId,
    siteId: group.siteId || 4,
    idArray: targetArray.map(row => row.targetId),
    campaignIdArray: [group.campaignId],
    targetArray,
    targetNewArray: targetArray,
  };
}

function extractCreateMeta(response = {}) {
  const data = response?.data || {};
  const param = data?.param || {};
  return {
    campaignId: String(param.campaignId || data.campaignId || response?.campaignId || ''),
    adGroupId: String(param.adGroupId || data.adGroupId || response?.adGroupId || ''),
    campaignName: param.campaignName || data.campaignName || response?.campaignName || '',
    groupName: param.groupName || data.groupName || response?.groupName || '',
  };
}

async function verifyAutoRows(ws, group, targetBid) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const read = await fetchAutoTargets(ws, group, BUSINESS_DATE, BUSINESS_DATE);
    const rows = read.rows.map(summarizeAutoTarget);
    attempts.push({ delayMs, rowCount: rows.length, rows });
    if (rows.length >= 4 && rows.every(row => Number(row.bid) === Number(targetBid))) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  return {
    attempts,
    landedRows: last.rows,
    allLanded: last.rows.length >= 4 &&
      last.rows.every(row =>
        Number(row.bid) === Number(targetBid) &&
        Number(row.state) === 1 &&
        Number(row.campaignState) === 1 &&
        Number(row.groupState) === 1
      ),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const builtCreates = CREATE_PLANS.map(plan => ({ plan, built: buildSpCreatePayload(plan) }));
  const out = {
    exportedAt: new Date().toISOString(),
    startedAt,
    businessDate: BUSINESS_DATE,
    dataDate: DATA_END_DATE,
    dryRun: !EXECUTE,
    evidenceBoundary: 'live ad backend, live sellerinventory product analysis, and GBrain history on 2026-06-12; ad metrics complete through 2026-06-11',
    gbrainPrecheck: {
      keywords: ['STA2613', 'STA2610', 'STA2607', 'STA2604', 'FE3235', 'FE3232', '父亲节', "Father's Day", 'B2B', '自动组'],
      priorFound: [
        "2026-06-11 Father's Day product check: STA2607 small-step verify, STA2604 repair/hold, STA2610 hold/stop-loss candidate, FE3232 inventory watch.",
        "2026-06-08 Father's Day matrix closure: do not treat Father's Day as pooled scaling; split by receiver fit and live proof.",
      ],
      sourceUse: 'live evidence plus GBrain history; GBrain is not treated as current state unless refetched live.',
    },
    operatingGoal: "Father's Day window controlled B2B/bulk discovery: use only Amazon Business SP auto coverage at bid 0.50, without generic Father's Day keywords or budget expansion.",
    adjustmentScope: {
      object: 'requested SKU list; STA2613 skipped due missing live SKU mapping',
      adLayers: 'existing B2B SP auto rows for STA2610/STA2607/STA2604; new Amazon Business SP auto rows for FE3235/FE3232',
      timeWindow: '3/7/30-day SKU and product-ad reads where available; child readback on execution day',
      trafficRange: 'B2B/bulk auto discovery only',
      resultCoverage: 'five executable SKUs, one B2B auto lane each, campaign daily budgets unchanged for reused lanes and 3 USD/day for new lanes',
    },
    bidEvidence: {
      targetBid: 0.5,
      summary: '0.50 is above recent observed SKU CPC for executable SKUs: STA2604 7d CPC 0.3348, STA2607 7d CPC 0.2979, STA2610 7d CPC 0.29, FE3235 7d CPC 0.365/30d 0.31, FE3232 7d CPC 0.27.',
      riskNotes: [
        'STA2610 has 30d 46 clicks and 0 ad orders, so this is operator-approved low-budget B2B discovery, not broad scale.',
        'STA2604 has recent no-order 7d despite 30d proof, so do not add generic keywords.',
        'FE3232 has low FBA stock from product analysis and is an inventory-watch SKU; keep budget capped and review quickly.',
      ],
    },
    skipped: SKIPPED,
    existingBidPlans: EXISTING_B2B_AUTO_BID_UPDATES,
    createPlans: CREATE_PLANS,
    builtCreates,
    before: null,
    execution: {
      mode: EXECUTE ? 'execute' : 'dry-run',
      bidUpdates: [],
      creates: [],
    },
    readback: {
      bidUpdates: [],
      creates: [],
    },
    acceptance: {
      oneDay: '2026-06-13: confirm each B2B auto lane still has enabled child rows and no serving blocker.',
      threeDay: '2026-06-15: if a B2B auto lane has spend but irrelevant terms or 0 useful clicks, diagnose delivery/term quality before further scale.',
      sevenDay: '2026-06-19: keep only lanes with order signal or useful B2B/bulk search-term learning; if a lane spends about 5 USD or reaches 10-12 clicks with 0 order, reduce weak auto buckets or pause that lane.',
      failureCondition: 'No-order B2B spend, irrelevant search terms, FE3232 stock pressure, or any parent/child row not enabled on readback.',
    },
    ok: false,
  };

  if (builtCreates.some(item => !item.built.ok)) {
    writeJson(OUT, out);
    throw new Error(`buildSpCreatePayload failed; wrote ${OUT}`);
  }

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const beforeReads = [];
    for (const group of EXISTING_B2B_AUTO_BID_UPDATES) {
      beforeReads.push(await fetchAutoTargets(ws, group));
    }
    out.before = {
      snapshot: snapshot('fd_b2b_auto_existing_before_2026-06-12.json', beforeReads),
      existingRows: beforeReads.map(read => ({
        sku: read.group.sku,
        campaignName: read.group.campaignName,
        campaignId: read.group.campaignId,
        adGroupId: read.group.adGroupId,
        rowCount: read.rows.length,
        rows: read.rows.map(summarizeAutoTarget),
      })),
    };

    const bidExecutionPlans = beforeReads.map(read => {
      const rows = read.rows.map(summarizeAutoTarget);
      return {
        sku: read.group.sku,
        campaignName: read.group.campaignName,
        campaignId: read.group.campaignId,
        adGroupId: read.group.adGroupId,
        targetBid: read.group.targetBid,
        currentRows: rows,
        okToExecute: rows.length >= 4 &&
          rows.every(row => targetId(row) || row.targetId) &&
          rows.some(row => Number(row.bid) !== Number(read.group.targetBid)) &&
          rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
      };
    });
    out.execution.bidUpdatePlan = bidExecutionPlans;

    if (!EXECUTE) {
      out.exportedAt = new Date().toISOString();
      out.readback.note = 'dry-run skips delayed landed readback; execute mode verifies child rows after writes.';
      out.readback.snapshot = snapshot('fd_b2b_auto_dryrun_2026-06-12.json', out.readback);
      out.ok = out.builtCreates.every(item => item.built.ok) &&
        out.execution.bidUpdatePlan.every(item => item.currentRows.length >= 4);
      writeJson(OUT, out);
      console.log(JSON.stringify({
        out: OUT,
        mode: out.execution.mode,
        dryRun: out.dryRun,
        ok: out.ok,
        skipped: out.skipped,
        bidUpdatePlan: out.execution.bidUpdatePlan.map(item => ({
          sku: item.sku,
          rowCount: item.currentRows.length,
          currentBids: item.currentRows.map(row => ({
            type: row.type,
            bid: row.bid,
            state: row.state,
            campaignState: row.campaignState,
            groupState: row.groupState,
          })),
          targetBid: item.targetBid,
          okToExecute: item.okToExecute,
        })),
        creates: out.builtCreates.map(item => ({
          sku: item.plan.sku,
          campaignName: item.built.campaignName,
          dailyBudget: item.plan.dailyBudget,
          defaultBid: item.plan.defaultBid,
          buildOk: item.built.ok,
        })),
        readback: out.readback,
      }, null, 2));
      return;
    }

    for (const read of beforeReads) {
      const rows = read.rows.map(summarizeAutoTarget);
      const eligibleRows = read.rows.filter(row => rows.some(item => item.targetId === targetId(row)));
      if (rows.length < 4) {
        out.execution.bidUpdates.push({
          sku: read.group.sku,
          skipped: true,
          ok: false,
          reason: 'fewer than four auto target rows found before execution',
          rows,
        });
        continue;
      }
      if (!rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1)) {
        out.execution.bidUpdates.push({
          sku: read.group.sku,
          skipped: true,
          ok: false,
          reason: 'child or parent row not enabled before execution',
          rows,
        });
        continue;
      }
      if (rows.every(row => Number(row.bid) === Number(read.group.targetBid))) {
        out.execution.bidUpdates.push({
          sku: read.group.sku,
          skipped: true,
          ok: true,
          reason: 'already at requested bid',
          rows,
        });
        continue;
      }
      const payload = buildAutoBidPayload(read.group, eligibleRows, read.group.targetBid);
      const response = await patchAdv(ws, '/advTarget/batchEditAutoTarget', payload);
      out.execution.bidUpdates.push({
        sku: read.group.sku,
        skipped: false,
        ok: Number(response?.json?.code) === 200,
        endpoint: '/advTarget/batchEditAutoTarget',
        fromBids: rows.map(row => ({ targetId: row.targetId, type: row.type, bid: row.bid })),
        toBid: read.group.targetBid,
        response,
      });
    }

    for (const item of builtCreates) {
      const response = await postAdv(ws, item.built.requestUrl, item.built.requestBody);
      const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
      const createMeta = extractCreateMeta(response);
      out.execution.creates.push({
        key: item.plan.key,
        sku: item.plan.sku,
        createOk,
        response,
        createMeta,
      });
    }

    for (const group of EXISTING_B2B_AUTO_BID_UPDATES) {
      const verify = await verifyAutoRows(ws, group, group.targetBid);
      out.readback.bidUpdates.push({
        sku: group.sku,
        campaignName: group.campaignName,
        campaignId: group.campaignId,
        adGroupId: group.adGroupId,
        targetBid: group.targetBid,
        ...verify,
      });
    }

    if (EXECUTE) {
      for (const created of out.execution.creates) {
        if (!created.createOk || !created.createMeta?.campaignId || !created.createMeta?.adGroupId) {
          out.readback.creates.push({
            key: created.key,
            sku: created.sku,
            allLanded: false,
            reason: 'create did not return campaign/ad group id',
          });
          continue;
        }
        const plan = CREATE_PLANS.find(item => item.key === created.key);
        const group = {
          sku: created.sku,
          accountId: plan.accountId,
          siteId: plan.siteId,
          campaignId: created.createMeta.campaignId,
          adGroupId: created.createMeta.adGroupId,
        };
        const verify = await verifyAutoRows(ws, group, plan.defaultBid);
        out.readback.creates.push({
          key: created.key,
          sku: created.sku,
          campaignName: created.createMeta.campaignName || plan.campaignName,
          campaignId: created.createMeta.campaignId,
          adGroupId: created.createMeta.adGroupId,
          targetBid: plan.defaultBid,
          ...verify,
        });
      }
    }
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  out.readback.snapshot = snapshot('fd_b2b_auto_after_2026-06-12.json', out.readback);
  out.ok = EXECUTE
    ? out.readback.bidUpdates.every(item => item.allLanded) && out.readback.creates.every(item => item.allLanded)
    : out.builtCreates.every(item => item.built.ok) &&
      out.execution.bidUpdatePlan.every(item => item.currentRows.length >= 4);
  writeJson(OUT, out);

  console.log(JSON.stringify({
    out: OUT,
    mode: out.execution.mode,
    dryRun: out.dryRun,
    ok: out.ok,
    skipped: out.skipped,
    bidUpdatePlan: out.execution.bidUpdatePlan.map(item => ({
      sku: item.sku,
      rowCount: item.currentRows.length,
      currentBids: item.currentRows.map(row => ({ type: row.type, bid: row.bid, state: row.state, campaignState: row.campaignState, groupState: row.groupState })),
      targetBid: item.targetBid,
      okToExecute: item.okToExecute,
    })),
    creates: out.builtCreates.map(item => ({
      sku: item.plan.sku,
      campaignName: item.built.campaignName,
      dailyBudget: item.plan.dailyBudget,
      defaultBid: item.plan.defaultBid,
      buildOk: item.built.ok,
    })),
    execution: out.execution,
    readback: out.readback,
  }, null, 2));
  if (!out.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
