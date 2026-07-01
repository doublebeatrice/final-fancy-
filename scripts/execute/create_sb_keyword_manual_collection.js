#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { buildSbManualCollectionKeywordPayload } = require('../../src/sb_manual_collection_create');

const ROOT = path.join(__dirname, '..', '..');

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
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
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Run npm run chrome:ready first.');
  return tab;
}

function makeWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function evalInTab(ws, expression, timeoutMs = 90000) {
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
    const jwt = localStorage.getItem('jwt-token') || '';
    const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
    if (jwt) headers.Authorization = 'Bearer ' + jwt;
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: 'POST',
      credentials: 'include',
      headers,
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

function listFromResponse(response) {
  const candidates = [
    response?.data?.records,
    response?.data?.data,
    response?.data?.list,
    response?.data?.rows,
    response?.records,
    response?.list,
    response?.rows,
    response?.data,
  ];
  return candidates.find(Array.isArray) || [];
}

function extractCreateMeta(response) {
  const data = response?.data || {};
  return {
    campaignId: String(data.campaignId || data.campaign?.data || ''),
    adGroupId: String(data.adGroupId || data.group?.responseParams?.response?.adGroups?.success?.[0]?.adGroupId || ''),
    campaignName: data.campaignName || '',
    groupName: data.groupName || '',
  };
}

function keywordIdsFromCreate(response) {
  return (response?.data?.keyword?.responseParams?.response || [])
    .map(item => String(item.keywordId || ''))
    .filter(Boolean);
}

async function fetchKeywordReadback(ws, plan, createMeta, keywordIds) {
  const startDate = String(plan.startDate);
  const end = new Date(`${startDate}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const payload = {
    siteId: Number(plan.siteId),
    accountId: Number(plan.accountId),
    campaignId: createMeta.campaignId,
    adGroupId: createMeta.adGroupId,
    property: '4',
    state: '1',
    coreMark: '0',
    userName: [String(plan.sellerNum || plan.seller_num || '').trim()].filter(Boolean),
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    selectDate: [startDate, startDate],
    timeRange: [new Date(`${startDate}T00:00:00`).getTime(), end.getTime()],
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 100,
    filterArray: { campaignState: '1' },
  };
  if (!payload.userName.length) delete payload.userName;
  const response = await postAdv(ws, '/keyword/findAllNew', payload);
  const ids = new Set(keywordIds);
  const rows = listFromResponse(response)
    .filter(row => !ids.size || ids.has(String(row.keywordId || row.id || '')))
    .map(row => ({
      keywordId: String(row.keywordId || row.id || ''),
      keywordText: row.keywordText || row.keyword || '',
      bid: row.bid,
      state: row.state,
      campaignState: row.campaignState,
      groupState: row.groupState,
      campaignId: String(row.campaignId || ''),
      adGroupId: String(row.adGroupId || ''),
      campaignName: row.campaignName || '',
    }));
  return { response, rows };
}

async function main() {
  const planFile = argValue('--plan');
  if (!planFile) throw new Error('Usage: node scripts/execute/create_sb_keyword_manual_collection.js --plan=plan.json [--execute] [--out=out.json]');
  const execute = process.argv.includes('--execute');
  const outFile = path.resolve(argValue('--out', path.join(ROOT, 'data', 'actions', `sb_keyword_manual_collection_${new Date().toISOString().slice(0, 10)}.json`)));
  const plan = readJson(planFile);
  const built = buildSbManualCollectionKeywordPayload(plan);
  const report = {
    exportedAt: new Date().toISOString(),
    plan,
    dryRun: built,
    execution: null,
  };
  if (!built.ok) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    throw new Error(`SB manual collection keyword payload failed validation: ${built.errors.join('; ')}`);
  }
  if (!execute) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, mode: 'dry-run', outFile, requestUrl: built.requestUrl }, null, 2));
    return;
  }

  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  try {
    const response = await postAdv(ws, built.requestUrl, built.requestBody);
    const createMeta = extractCreateMeta(response);
    const keywordIds = keywordIdsFromCreate(response);
    const createOk = Number(response?.code) === 200 && createMeta.campaignId && createMeta.adGroupId && keywordIds.length;
    const readback = createOk ? await fetchKeywordReadback(ws, plan, createMeta, keywordIds) : null;
    report.execution = {
      ok: !!createOk,
      createMeta,
      keywordIds,
      response,
      readback,
      landedKeywordCount: readback?.rows?.length || 0,
    };
  } finally {
    ws.close();
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.execution?.ok,
    outFile,
    createMeta: report.execution?.createMeta,
    keywordIds: report.execution?.keywordIds,
    landedKeywordCount: report.execution?.landedKeywordCount,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
