const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = inlineValue !== undefined ? inlineValue : argv[i + 1];
    if (inlineValue === undefined) i += 1;
  }
  const required = ['campaignId', 'adGroupId', 'accountId', 'term', 'bid'];
  const missing = required.filter(key => !String(args[key] || '').trim());
  if (missing.length) {
    throw new Error(`missing required args: ${missing.join(', ')}`);
  }
  return {
    campaignId: String(args.campaignId).trim(),
    adGroupId: String(args.adGroupId).trim(),
    accountId: String(args.accountId).trim(),
    siteId: Number(args.siteId || 4),
    term: String(args.term).trim(),
    bid: Number(args.bid),
    days: Number(args.days || 30),
    output: args.output || '',
  };
}

function ymd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateRange(days) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return [ymd(start), ymd(end)];
}

function targetTerm(row = {}) {
  return String(row.keywordText || row.text || '').trim().toLowerCase();
}

function findKeywordRow(rows, term) {
  const wanted = String(term || '').trim().toLowerCase();
  return (rows || []).find(row => targetTerm(row) === wanted) || null;
}

function buildBidPayload(row, bid, { siteId = 4, accountId } = {}) {
  const keywordId = String(row.keywordId || row.id || '').trim();
  const campaignId = String(row.campaignId || '').trim();
  const adGroupId = String(row.adGroupId || '').trim();
  if (!keywordId || !campaignId || !adGroupId) {
    throw new Error('keyword row missing keywordId/campaignId/adGroupId');
  }
  const account = row.accountId || accountId;
  const site = row.siteId || siteId;
  const targetRow = {
    ...row,
    keywordId,
    bid: String(bid),
    siteId: site,
    accountId: account,
    campaignId,
    adGroupId,
    matchType: row.matchType,
    advType: 'SP',
    bidThreshold: row.bidThreshold,
    adFormat: row.adFormat,
    costType: row.costType,
  };
  return {
    column: 'bid',
    property: 'keyword',
    operation: 'bid',
    manualTargetType: '',
    accountId: account,
    siteId: site,
    idArray: [keywordId],
    campaignIdArray: [campaignId],
    targetArray: [targetRow],
    targetNewArray: [targetRow],
  };
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

async function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('timeout sending Runtime.evaluate'));
    }, 60000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) reject(new Error(JSON.stringify(response.error)));
      else resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

async function withAdvWs(callback) {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('adv.yswg.com.cn tab not found on port 9222');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    return await callback(ws);
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

async function fetchKeywordRows(ws, options) {
  const selectDate = dateRange(options.days);
  const basePayload = {
    siteId: options.siteId,
    timeRange: [
      new Date(`${selectDate[0]}T00:00:00`).getTime(),
      new Date(new Date(`${selectDate[1]}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: options.accountId,
    campaignId: options.campaignId,
    adGroupId: options.adGroupId,
    property: '1',
    selectDate,
    field: 'Spend',
    order: 'desc',
    limit: 500,
    filterArray: { campaignState: '4' },
  };
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = { ...basePayload, page };
    const expression = `
      (async () => {
        const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
        const res = await fetch('/keyword/findAllNew', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
          body: ${JSON.stringify(JSON.stringify(payload))}
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (error) {}
        const rows = json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
          json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
        return JSON.stringify({ status: res.status, ok: res.ok, rows });
      })()`;
    const text = await evalInTab(ws, expression, true);
    const result = JSON.parse(text || '{}');
    if (!result.ok) throw new Error(`keyword row fetch failed: status=${result.status}`);
    rows.push(...(result.rows || []));
    if ((result.rows || []).length < 500) break;
  }
  return rows.filter(row =>
    String(row.campaignId || '') === String(options.campaignId) &&
    String(row.adGroupId || '') === String(options.adGroupId)
  );
}

async function patchKeywordBid(ws, payload) {
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch('/keyword/batchKeyword', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
        body: ${JSON.stringify(JSON.stringify(payload))}
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (error) {}
      return JSON.stringify({ status: res.status, ok: res.ok, json: json || { msg: text.slice(0, 1000) } });
    })()`;
  return JSON.parse(await evalInTab(ws, expression, true) || '{}');
}

async function main() {
  const options = parseArgs();
  if (!Number.isFinite(options.bid) || options.bid <= 0) throw new Error('--bid must be a positive number');
  const result = await withAdvWs(async ws => {
    const beforeRows = await fetchKeywordRows(ws, options);
    const before = findKeywordRow(beforeRows, options.term);
    if (!before) {
      const sampleTerms = beforeRows.slice(0, 10).map(row => row.keywordText || row.text || '').filter(Boolean);
      throw new Error(`keyword not found in campaign/ad group: ${options.term}; fetchedRows=${beforeRows.length}; sampleTerms=${sampleTerms.join(' | ')}`);
    }
    const payload = buildBidPayload(before, options.bid, options);
    const writeResult = await patchKeywordBid(ws, payload);
    const afterRows = await fetchKeywordRows(ws, options);
    const after = findKeywordRow(afterRows, options.term);
    return {
      ok: Number(writeResult.json?.code) === 200 && Number(after?.bid) === Number(options.bid),
      executedAt: new Date().toISOString(),
      endpoint: '/keyword/batchKeyword',
      term: options.term,
      keywordId: String(before.keywordId || ''),
      before: {
        bid: before.bid,
        state: before.state,
        campaignState: before.campaignState,
        groupState: before.groupState,
      },
      requestedBid: options.bid,
      after: after ? {
        bid: after.bid,
        state: after.state,
        campaignState: after.campaignState,
        groupState: after.groupState,
        updatedAt: after.updatedAt,
      } : null,
      writeResult,
    };
  });
  const out = options.output || path.join(ROOT, 'data', 'actions', `direct_sp_keyword_bid_update_${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ outputFile: out, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildBidPayload,
  findKeywordRow,
  parseArgs,
};
