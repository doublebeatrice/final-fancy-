const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSpCreatePayload } = require('../../auto_adjust');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'actions', 'ey5555_b2b_auto_2026-06-12.json');
const BUSINESS_DATE = '2026-06-12';
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

const PLAN = {
  key: 'b2bAuto',
  sku: 'EY5555',
  asin: 'B0DX1Q6H4C',
  accountId: 295,
  siteId: 4,
  mode: 'auto',
  campaignName: 'ai_auto_b2b fathers day christian keychains_ey5555',
  groupName: 'ai_auto_b2b fathers day christian keychains_ey5555',
  coreTerm: 'b2b fathers day christian keychains',
  siteRestriction: 'AMAZON_BUSINESS',
  siteAmazonBusiness: 0,
  dailyBudget: 3,
  defaultBid: 0.5,
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

function summarizeAutoRow(row) {
  return {
    targetId: row.targetId || row.id || '',
    type: row.type || '',
    bid: row.bid ?? row.currentBid ?? row.cpcBid ?? null,
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
  };
}

function summarizeProductRow(row) {
  return {
    adId: row.adId || row.primaryId || '',
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    dailyBudget: row.dailyBudget || '',
    positionType: row.positionType || '',
    servingStatus: row.servingStatus || '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    state: row.state ?? '',
  };
}

async function fetchAutoRows(ws, createMeta) {
  const response = await postAdv(ws, '/keyword/findAllNew', {
    siteId: PLAN.siteId,
    timeRange: [
      new Date(`${BUSINESS_DATE}T00:00:00`).getTime(),
      new Date(new Date(`${BUSINESS_DATE}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: PLAN.accountId,
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '2',
    tableName: 'product_target',
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    filterArray: { campaignState: '4' },
  });
  const rows = rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(createMeta.campaignId) &&
    String(row.adGroupId || '') === String(createMeta.adGroupId)
  );
  return { response, rows };
}

async function fetchProductRows(ws, createMeta) {
  const response = await postAdv(ws, '/product/adProductData', {
    selectDate: [BUSINESS_DATE, BUSINESS_DATE],
    mode: 1,
    state: 1,
    siteId: PLAN.siteId,
    sku: PLAN.sku,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  });
  const rows = rowsFromResponse(response).filter(row =>
    String(row.campaignId || '') === String(createMeta.campaignId) &&
    String(row.adGroupId || '') === String(createMeta.adGroupId)
  );
  return { response, rows };
}

async function verifyAutoRows(ws, createMeta) {
  const attempts = [];
  for (const delayMs of [0, 45000, 60000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const readback = await fetchAutoRows(ws, createMeta);
    attempts.push({
      delayMs,
      rowCount: readback.rows.length,
      rows: readback.rows.map(summarizeAutoRow),
    });
    if (readback.rows.length >= 4) break;
  }
  const last = attempts[attempts.length - 1] || { rows: [] };
  return {
    attempts,
    landedRows: last.rows,
    allLanded: last.rows.length >= 4 &&
      last.rows.every(row => Number(row.state) === 1 && Number(row.campaignState) === 1 && Number(row.groupState) === 1),
  };
}

async function execute() {
  const built = buildSpCreatePayload(PLAN);
  const out = {
    exportedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    dryRun: DRY_RUN,
    evidenceBoundary: 'live ad backend via shared Chrome debug session; sellerinventory productAnalysis live read; GBrain checked for EY5555/Fathers Day/B2B history with no EY5555-specific current page found.',
    diagnosis: 'Operator requested EY5555 Fathers Day scale by adding an Amazon Business SP auto group at bid 0.50. EY5555 is normal sale and ELIGIBLE; 7d clicks fell from 14 to 2, inventory remains available, and current owned SP auto has B2B/bulk-like search terms but no B2B-limited lane.',
    bidEvidence: {
      sku7dCpc: 0.25,
      sku30dCpc: 0.3012,
      productLineCpc: 0.318897,
      currentAuto30dCpc: 0.2623,
      selectedB2bAutoBid: PLAN.defaultBid,
      operatorSpecifiedBid: 0.5,
      sourceFiles: [
        'data/snapshots/ad_sku_summary_EY5555_7d_2026-06-12.json',
        'data/snapshots/ad_sku_summary_EY5555_30d_2026-06-12.json',
        'data/snapshots/sku_ad_product_EY5555_2026-06-12.json',
        'data/snapshots/product_analysis_query2_EY5555_2026-06-12.json',
        'data/snapshots/ad_group_rows_90905719662027_558703182511672_p2_2026-06-12.json',
      ],
    },
    plan: PLAN,
    built,
    execution: null,
    ok: false,
  };

  if (!built.ok) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    throw new Error(`buildSpCreatePayload failed: ${built.errors.join('; ')}`);
  }

  if (DRY_RUN) {
    out.ok = true;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
    return out;
  }

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const response = await postAdv(ws, built.requestUrl, built.requestBody);
    const createOk = Number(response?.code) === 200 && String(response?.msg || '').toLowerCase() === 'success';
    const createMeta = extractCreateMeta(response);
    out.execution = { createOk, response, createMeta, readback: null, productReadback: null };
    if (createOk && createMeta.campaignId && createMeta.adGroupId) {
      out.execution.readback = await verifyAutoRows(ws, createMeta);
      const productReadback = await fetchProductRows(ws, createMeta);
      out.execution.productReadback = {
        rowCount: productReadback.rows.length,
        rows: productReadback.rows.map(summarizeProductRow),
      };
    }
  } finally {
    ws.close();
  }

  out.exportedAt = new Date().toISOString();
  out.ok = !!out.execution?.createOk && !!out.execution?.readback?.allLanded;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

execute()
  .then(out => {
    console.log(JSON.stringify({
      out: OUT,
      dryRun: out.dryRun,
      ok: out.ok,
      planned: {
        campaignName: out.built.campaignName,
        dailyBudget: out.plan.dailyBudget,
        defaultBid: out.plan.defaultBid,
        siteRestriction: out.plan.siteRestriction,
      },
      execution: out.execution ? {
        createOk: out.execution.createOk,
        campaignId: out.execution.createMeta?.campaignId,
        adGroupId: out.execution.createMeta?.adGroupId,
        landedRows: out.execution.readback?.landedRows || [],
        allLanded: out.execution.readback?.allLanded || false,
        productRows: out.execution.productReadback?.rows || [],
      } : null,
    }, null, 2));
    if (!out.ok) process.exitCode = out.dryRun ? 0 : 2;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
