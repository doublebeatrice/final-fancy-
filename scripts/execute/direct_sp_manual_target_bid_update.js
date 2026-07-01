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
  const required = ['campaignId', 'adGroupId', 'accountId', 'targetId', 'bid'];
  const missing = required.filter(key => !String(args[key] || '').trim());
  if (missing.length) throw new Error(`missing required args: ${missing.join(', ')}`);
  return {
    campaignId: String(args.campaignId).trim(),
    adGroupId: String(args.adGroupId).trim(),
    accountId: String(args.accountId).trim(),
    siteId: Number(args.siteId || 4),
    targetId: String(args.targetId).trim(),
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
  start.setDate(end.getDate() - days + 1);
  return [ymd(start), ymd(end)];
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
  try { return await callback(ws); } finally { try { ws.close(); } catch (_) {} }
}

async function fetchManualRows(ws, options) {
  const selectDate = dateRange(options.days);
  const payload = {
    siteId: options.siteId,
    accountId: options.accountId,
    campaignId: options.campaignId,
    adGroupId: options.adGroupId,
    manualTargetState: 4,
    selectDate,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
    previousPeriod: Math.max(0, Math.round((new Date(selectDate[1]) - new Date(selectDate[0])) / 86400000)),
  };
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch('/advTarget/findManualProductTarget', {
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
  const result = JSON.parse(await evalInTab(ws, expression, true) || '{}');
  if (!result.ok) throw new Error(`manual target row fetch failed: status=${result.status}`);
  return (result.rows || []).filter(row =>
    String(row.campaignId || '') === String(options.campaignId) &&
    String(row.adGroupId || '') === String(options.adGroupId)
  );
}

function buildPayload(row, bid, options) {
  const targetId = String(row.targetId || row.id || '').trim();
  const campaignId = String(row.campaignId || options.campaignId);
  const adGroupId = String(row.adGroupId || options.adGroupId);
  const accountId = row.accountId || options.accountId;
  const siteId = row.siteId || options.siteId;
  const targetRow = { ...row, targetId, bid: String(bid), accountId, siteId, campaignId, adGroupId, advType: 'SP' };
  return {
    column: 'bid',
    property: 'manualTarget',
    operation: 'bid',
    accountId,
    siteId,
    idArray: [targetId],
    campaignIdArray: [campaignId],
    targetArray: [targetRow],
    targetNewArray: [targetRow],
  };
}

async function patchManualTargetBid(ws, payload) {
  const expression = `
    (async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch('/advTarget/batchUpdateManualTarget', {
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

function summarize(row) {
  if (!row) return null;
  return {
    targetId: String(row.targetId || row.id || ''),
    type: row.type,
    bid: row.bid,
    state: row.state,
    campaignId: String(row.campaignId || ''),
    adGroupId: String(row.adGroupId || ''),
    updated_at: row.updated_at,
  };
}

async function main() {
  const options = parseArgs();
  if (!Number.isFinite(options.bid) || options.bid <= 0) throw new Error('--bid must be a positive number');
  const result = await withAdvWs(async ws => {
    const beforeRows = await fetchManualRows(ws, options);
    const before = beforeRows.find(row => String(row.targetId || row.id || '') === String(options.targetId));
    if (!before) throw new Error(`manual target not found: ${options.targetId}; fetchedRows=${beforeRows.length}`);
    const payload = buildPayload(before, options.bid, options);
    const writeResult = await patchManualTargetBid(ws, payload);
    const afterRows = await fetchManualRows(ws, options);
    const after = afterRows.find(row => String(row.targetId || row.id || '') === String(options.targetId));
    return {
      ok: Number(writeResult.json?.code) === 200 && Number(after?.bid) === Number(options.bid),
      executedAt: new Date().toISOString(),
      endpoint: '/advTarget/batchUpdateManualTarget',
      targetId: options.targetId,
      before: summarize(before),
      requestedBid: options.bid,
      after: summarize(after),
      writeResult,
    };
  });
  const out = options.output || path.join(ROOT, 'data', 'actions', `direct_sp_manual_target_bid_update_${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ outputFile: out, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
