// Use a wider window covering today (where the keyword has 0 activity but is just created).
// fetch_ad_group_rows uses startDate/endDate against ad reporting; a "today + day-after"
// window often returns the freshly created keyword once the reporting backend indexes it.

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'snapshots',
  'uan_uan3646_b2b_broad_lane_keywordid_check_2026-05-29.json');

const CAMP = '12268220537873';
const GROUP = '25854441918395';
const KEYWORD_ID = '135563576351997';

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
  return tabs.find(t => String(t.url || '').includes('adv.yswg.com.cn'));
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
      reject(new Error('timeout'));
    }, 90000);
    const handler = data => {
      let resp; try { resp = JSON.parse(data); } catch { return; }
      if (resp.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (resp.error) return reject(new Error(JSON.stringify(resp.error)));
      resolve(resp.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}
async function postAdv(ws, pathname, payload) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return JSON.stringify(json || { code: 0, msg: text.slice(0, 800), httpStatus: res.status });
  })()`;
  const text = await evalInTab(ws, expr);
  try { return JSON.parse(text || '{}'); } catch (e) { return { code: 0, raw: text }; }
}

async function main() {
  const tab = await findAdvTab();
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  const tries = [
    { label: 'created-window 2026-05-28..2026-05-29', start: '2026-05-28', end: '2026-05-29' },
    { label: 'wider 2026-05-26..2026-05-29',          start: '2026-05-26', end: '2026-05-29' },
    { label: 'today only 2026-05-29..2026-05-29',     start: '2026-05-29', end: '2026-05-29' },
  ];
  const results = [];
  try {
    for (const t of tries) {
      let allRows = [];
      for (let page = 1; page <= 5; page += 1) {
        const body = {
          siteId: 4, accountId: 515, type: 'spKeyword',
          campaignId: CAMP, adGroupId: GROUP, property: '1', tableName: '',
          dateRange: [t.start, t.end], page, limit: 200,
        };
        const resp = await postAdv(ws, '/keyword/findAllNew', body);
        const data = resp?.data || {};
        const rows = data.targetRows || data.rows || [];
        allRows = allRows.concat(rows);
        const total = Number(data.allTargetRowCount || data.total || 0);
        if (!rows.length || allRows.length >= total) break;
      }
      const cna = allRows.find(r => String(r.keywordText || '').toLowerCase() === 'cna week gifts'
                                 || String(r.keywordId) === KEYWORD_ID);
      results.push({ window: t, totalReturned: allRows.length, cnaRow: cna || null,
                     keywordTexts: allRows.map(r => r.keywordText) });
      console.log(`${t.label}: returned=${allRows.length}, cna=${cna ? 'FOUND id=' + cna.keywordId + ' bid=' + cna.bid + ' state=' + cna.state + ' match=' + cna.matchType : 'NOT_FOUND'}`);
    }
  } finally {
    ws.close();
  }
  fs.writeFileSync(OUT, JSON.stringify({ exportedAt: new Date().toISOString(), tries: results }, null, 2));
  console.log('OUT', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
