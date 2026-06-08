// Readback: for each appended ad group, query /keyword/findAllNew and confirm
// `cna week gifts` is enabled BROAD bid 0.25.

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'snapshots',
  'uan_mininotebook_cna_week_readback_2026-05-28.json');

const GROUPS = [
  { sku: 'UAN0188', campaignId: '217142821242849', adGroupId: '96332354357566' },
  { sku: 'UAN2599', campaignId: '22081897642891',  adGroupId: '87866475303592' },
  { sku: 'UAN2600', campaignId: '254486474845612', adGroupId: '226814447234449' },
  { sku: 'UAN3256', campaignId: '196791687005701', adGroupId: '226640084150353' },
  { sku: 'UAN3257', campaignId: '247971235223765', adGroupId: '140065698462247' },
  { sku: 'UAN3644', campaignId: '279454354280917', adGroupId: '259095558730766' },
  { sku: 'UAN3645', campaignId: '240213007270817', adGroupId: '112228781479893' },
  { sku: 'UAN3646', campaignId: '12268220537873',  adGroupId: '25854441918395' },
];
const PATHNAME = '/keyword/findAllNew';

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(t => String(t.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('cannot find adv tab');
  return tab;
}
function makeWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
function evalInTab(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e7);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, 60000);
    const handler = data => {
      let resp;
      try { resp = JSON.parse(data); } catch { return; }
      if (resp.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (resp.error) return reject(new Error(JSON.stringify(resp.error)));
      resolve(resp.result?.result?.value);
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
    return JSON.stringify(json || { code: 0, msg: text.slice(0, 800), httpStatus: res.status });
  })()`;
  const text = await evalInTab(ws, expr);
  try { return JSON.parse(text || '{}'); } catch (e) { return { code: 0, raw: text, parseErr: e.message }; }
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const out = [];
  try {
    for (const g of GROUPS) {
      // Query keywords for this ad group, filtered to cna term to keep payload small
      const body = {
        siteId: 4,
        accountId: 515,
        type: 'spKeyword',
        campaignId: g.campaignId,
        adGroupId: g.adGroupId,
        property: '1',
        tableName: '',
        dateRange: ['2026-05-28', '2026-05-28'],
        page: 1,
        limit: 200,
      };
      const t0 = Date.now();
      const resp = await postAdv(ws, PATHNAME, body);
      const ms = Date.now() - t0;
      // Extract rows
      let rows = [];
      const data = resp?.data || {};
      if (Array.isArray(data.targetRows)) rows = data.targetRows;
      else if (Array.isArray(data.rows)) rows = data.rows;
      else if (Array.isArray(data.list)) rows = data.list;
      else if (Array.isArray(data?.targetData?.rows)) rows = data.targetData.rows;
      const cna = rows.find(r => String(r.keywordText || '').toLowerCase() === 'cna week gifts');
      out.push({
        sku: g.sku,
        adGroupId: g.adGroupId,
        ms,
        ok: !!cna,
        rowCount: rows.length,
        cnaRow: cna ? {
          keywordId: cna.keywordId,
          keywordText: cna.keywordText,
          matchType: cna.matchType,
          bid: cna.bid,
          state: cna.state,
          createdAt: cna.createdAt,
          updatedAt: cna.updatedAt,
        } : null,
        responseShapeKeys: Object.keys(data).slice(0, 12),
      });
      console.log(`${g.sku} rows=${rows.length} cna=${cna ? `${cna.matchType}/${cna.bid}/${cna.state}` : 'NOT_FOUND'} ${ms}ms`);
    }
  } finally {
    ws.close();
  }
  fs.writeFileSync(OUT, JSON.stringify({
    exportedAt: new Date().toISOString(),
    pathname: PATHNAME,
    readbacks: out,
  }, null, 2), 'utf8');
  console.log('OUT', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
