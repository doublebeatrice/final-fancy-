// One-shot: append `cna week gifts` BROAD @ 0.25 to each SKU's
// `b2b kw broad_mini journals bulk_<sku>` ad group via /keyword/createKeywordNew.
// Authoritative request layer matches auto_adjust.js execAdApi (CDP Runtime.evaluate
// against the adv.yswg.com.cn tab on port 9222).

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'snapshots',
  'uan_mininotebook_cna_week_keyword_append_execution_2026-05-28.json');

const PLAN = [
  { sku: 'UAN0188', campaignId: '217142821242849', adGroupId: '96332354357566', asin: 'B0C53BC1SQ' },
  { sku: 'UAN2599', campaignId: '22081897642891',  adGroupId: '87866475303592', asin: 'B0CHRQT54V' },
  { sku: 'UAN2600', campaignId: '254486474845612', adGroupId: '226814447234449', asin: 'B0CHRT58V7' },
  { sku: 'UAN3256', campaignId: '196791687005701', adGroupId: '226640084150353', asin: 'B0D2631LHB' },
  { sku: 'UAN3257', campaignId: '247971235223765', adGroupId: '140065698462247', asin: 'B0D25ZY7LC' },
  { sku: 'UAN3644', campaignId: '279454354280917', adGroupId: '259095558730766', asin: 'B0DH1ZVTKH' },
  { sku: 'UAN3645', campaignId: '240213007270817', adGroupId: '112228781479893', asin: 'B0DH227THZ' },
  { sku: 'UAN3646', campaignId: '12268220537873',  adGroupId: '25854441918395',  asin: 'B0DH1ZRGVQ' },
];
const SITE_ID = 4;
const ACCOUNT_ID = 515;
const BID = 0.25;
const KEYWORD = 'cna week gifts';
const PATHNAME = '/keyword/createKeywordNew';

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
  if (!tab?.webSocketDebuggerUrl) throw new Error('cannot find adv.yswg.com.cn tab on :9222');
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
  const exec = [];
  try {
    for (const item of PLAN) {
      const body = {
        siteId: SITE_ID,
        accountId: ACCOUNT_ID,
        keywords: [{
          campaignId: item.campaignId,
          adGroupId: item.adGroupId,
          bid: BID,
          matchType: 'BROAD',
          state: 'ENABLED',
          keywordText: KEYWORD,
        }],
        keywordGroups: [],
      };
      const t0 = Date.now();
      const resp = await postAdv(ws, PATHNAME, body);
      const ms = Date.now() - t0;
      const ok = resp && resp.code === 200 && resp.data && Array.isArray(resp.data.success) && resp.data.success.length;
      const err = resp && resp.data && Array.isArray(resp.data.error) ? resp.data.error : [];
      exec.push({ sku: item.sku, asin: item.asin, requestBody: body, response: resp, ok: !!ok, error: err, ms });
      console.log(`${item.sku} ${ok ? 'OK' : 'FAIL'} ${ms}ms keywordId=${ok && resp.data.success[0].keywordId} errLen=${err.length}`);
    }
  } finally {
    ws.close();
  }
  fs.writeFileSync(OUT, JSON.stringify({
    exportedAt: new Date().toISOString(),
    requestUrl: PATHNAME,
    siteId: SITE_ID,
    accountId: ACCOUNT_ID,
    keyword: KEYWORD,
    matchType: 'BROAD',
    bid: BID,
    plans: PLAN,
    executions: exec,
  }, null, 2), 'utf8');
  console.log('OUT', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
