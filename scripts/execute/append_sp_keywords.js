'use strict';

// Append keywords (or product targets) to an existing SP ad group.
// Handles three cases automatically:
//   1. New keyword → create via /keyword/createKeywordNew
//   2. Existing keyword (paused) → enable + update bid via /keyword/batchKeyword
//   3. Existing keyword (active) → update bid only via /keyword/batchKeyword
//
// Usage:
//   node scripts/execute/append_sp_keywords.js --sku KUR1793 \
//     --keywords "car magnets:0.30,flower magnets:0.26,car stickers:0.23" \
//     [--campaign-id 498601369741810] [--ad-group-id 445615479104279] \
//     [--match-type BROAD] [--bid 0.25] [--execute]
//
// If --campaign-id/--ad-group-id omitted, picks the first keyword campaign for the SKU.
// --bid is the fallback for keywords without explicit ":bid" suffix.

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'actions');

function ymd(d) { return d.toISOString().slice(0, 10); }
function todayYmd() { return ymd(new Date()); }

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const has = (flag) => argv.includes(flag);
  return {
    sku: (get('--sku') || '').trim().toUpperCase(),
    campaignId: get('--campaign-id') || get('--campaignId') || '',
    adGroupId: get('--ad-group-id') || get('--adGroupId') || '',
    keywords: get('--keywords') || '',
    targetAsins: get('--target-asins') || get('--targets') || '',
    matchType: (get('--match-type') || get('--matchType') || 'BROAD').toUpperCase(),
    bid: Number(get('--bid') || 0.25),
    siteId: Number(get('--site-id') || 4),
    accountId: get('--account-id') || get('--accountId') || '',
    execute: has('--execute'),
  };
}

function parseKeywordsWithBid(raw, fallbackBid) {
  if (!raw) return [];
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(entry => {
    const colonIdx = entry.lastIndexOf(':');
    if (colonIdx > 0) {
      const maybeBid = Number(entry.slice(colonIdx + 1));
      if (Number.isFinite(maybeBid) && maybeBid > 0) {
        return { text: entry.slice(0, colonIdx).trim(), bid: maybeBid };
      }
    }
    return { text: entry.trim(), bid: fallbackBid };
  });
}

function parseAsinsWithBid(raw, fallbackBid) {
  if (!raw) return [];
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(entry => {
    const colonIdx = entry.lastIndexOf(':');
    if (colonIdx > 0) {
      const maybeBid = Number(entry.slice(colonIdx + 1));
      if (Number.isFinite(maybeBid) && maybeBid > 0) {
        return { asin: entry.slice(0, colonIdx).trim().toUpperCase(), bid: maybeBid };
      }
    }
    return { asin: entry.trim().toUpperCase(), bid: fallbackBid };
  });
}

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function withAdvWs(callback) {
  const tabs = await listTabs();
  const tab = tabs.find(t => String(t.url || '').startsWith('https://adv.yswg.com.cn'))
    || tabs.find(t => String(t.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('adv.yswg.com.cn tab not found on port 9222');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    return await callback(ws);
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('timeout'));
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

async function advFetch(ws, method, url, body) {
  const bodyStr = JSON.stringify(body);
  const expression = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(url)}, {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(bodyStr)}
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return JSON.stringify({ status: res.status, ok: res.ok, json, rawSnippet: text.slice(0, 200) });
  })()`;
  const text = await evalInTab(ws, expression, true);
  return JSON.parse(text || '{}');
}

async function fetchExistingKeywords(ws, { campaignId, adGroupId, accountId, siteId }) {
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - 29);
  const selectDate = [ymd(start), ymd(end)];

  const expression = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
    const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
      json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
    const basePayload = {
      siteId: ${siteId},
      timeRange: [new Date('${selectDate[0]}T00:00:00').getTime(), new Date('${selectDate[1]}T00:00:00').getTime() + 86400000],
      state: '4', coreMark: '0', userName: ['HJ17','HJ171','HJ172'], level: 'seller_num', publicAdv: '2', lowCost: 2,
      accountId: ${JSON.stringify(accountId)}, campaignId: ${JSON.stringify(campaignId)}, adGroupId: ${JSON.stringify(adGroupId)},
      property: '1', selectDate: ${JSON.stringify(selectDate)}, field: 'Spend', order: 'desc', limit: 500,
      filterArray: { campaignState: '4' },
    };
    const allRows = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({...basePayload, page}) });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) break;
      let json; try { json = JSON.parse(text); } catch(e) { break; }
      if (json.code !== 200) break;
      const rows = getList(json);
      allRows.push(...rows);
      if (rows.length < 500) break;
    }
    return JSON.stringify(allRows.filter(r => {
      if (String(r.campaignId) !== ${JSON.stringify(campaignId)}) return false;
      if (${JSON.stringify(adGroupId)} && String(r.adGroupId) !== ${JSON.stringify(adGroupId)}) return false;
      return true;
    }));
  })()`;

  const text = await evalInTab(ws, expression, true);
  try { return JSON.parse(text || '[]'); } catch (e) { return []; }
}

async function fetchAdGroupForCampaign(ws, { campaignId, accountId, siteId }) {
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - 7);
  const selectDate = [ymd(start), ymd(end)];

  const expression = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
    const payload = {
      siteId: ${siteId},
      state: '4', userName: ['HJ17','HJ171','HJ172'], level: 'seller_num', publicAdv: '2', lowCost: 2,
      accountId: ${JSON.stringify(accountId)}, campaignId: ${JSON.stringify(campaignId)},
      selectDate: ${JSON.stringify(selectDate)}, field: 'Spend', order: 'desc', page: 1, limit: 50,
      filterArray: { campaignState: '4' },
    };
    const res = await fetch('/adGroup/findAll', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return '';
    let json; try { json = JSON.parse(text); } catch(e) { return ''; }
    const rows = json?.data?.records || json?.data?.data || json?.data?.list || (Array.isArray(json?.data) ? json.data : []);
    const match = rows.find(r => String(r.campaignId) === ${JSON.stringify(campaignId)});
    return match ? String(match.adGroupId || '') : (rows.length ? String(rows[0].adGroupId || '') : '');
  })()`;

  return await evalInTab(ws, expression, true) || '';
}

async function resolveSkuCampaign(ws, sku, siteId, preferredMode = 'keyword') {
  const { resolveSkuAccount } = require('../../src/adv_backend');
  const resolved = await resolveSkuAccount(ws, sku, siteId);
  if (!resolved?.ok) throw new Error(`Cannot resolve account for SKU ${sku}: ${resolved?.error || 'unknown'}`);
  const campaigns = resolved.campaigns || [];
  const kwCampaign = campaigns.find(c =>
    (c.positionType === 'keywordTarget' || c.positionType === 'keywordtarget') &&
    /kw|keyword/i.test(c.campaignName || '')
  ) || campaigns.find(c => c.positionType === 'keywordTarget' || c.positionType === 'keywordtarget');
  return { accountId: resolved.accountId, asin: resolved.asin, siteId: resolved.siteId || siteId, campaigns, kwCampaign };
}

function buildBatchPatchPayload(rows, accountId, siteId) {
  return {
    column: 'bid',
    property: 'keyword',
    operation: 'bid',
    manualTargetType: '',
    accountId,
    siteId,
    idArray: rows.map(r => r.keywordId),
    campaignIdArray: [...new Set(rows.map(r => r.campaignId))],
    targetArray: rows,
    targetNewArray: rows,
  };
}

function buildStatePayload(rows, accountId, siteId) {
  return {
    column: 'state',
    property: 'keyword',
    operation: 'state',
    manualTargetType: '',
    accountId,
    siteId,
    idArray: rows.map(r => r.keywordId),
    campaignIdArray: [...new Set(rows.map(r => r.campaignId))],
    targetArray: rows.map(r => ({ ...r, state: 'ENABLED' })),
    targetNewArray: rows.map(r => ({ ...r, state: '1' })),
  };
}

async function main() {
  const args = parseArgs();
  if (!args.sku) { console.error('--sku is required'); process.exit(1); }
  if (!args.keywords && !args.targetAsins) { console.error('--keywords or --target-asins is required'); process.exit(1); }

  const entries = args.keywords
    ? parseKeywordsWithBid(args.keywords, args.bid)
    : parseAsinsWithBid(args.targetAsins, args.bid);

  const result = await withAdvWs(async ws => {
    let accountId = Number(args.accountId) || 0;
    let campaignId = args.campaignId;
    let adGroupId = args.adGroupId;

    if (!campaignId || !accountId) {
      const resolved = await resolveSkuCampaign(ws, args.sku, args.siteId);
      accountId = accountId || resolved.accountId;
      if (!campaignId && resolved.kwCampaign) {
        campaignId = resolved.kwCampaign.campaignId;
        adGroupId = adGroupId || resolved.kwCampaign.adGroupId;
      }
      if (!campaignId) throw new Error(`No keyword campaign found for ${args.sku}. Pass --campaign-id explicitly.`);
    }

    const existing = await fetchExistingKeywords(ws, { campaignId, adGroupId, accountId, siteId: args.siteId });
    if (!adGroupId && existing.length > 0) {
      adGroupId = String(existing[0].adGroupId || '');
    }
    if (!adGroupId) {
      const adGroupRes = await fetchAdGroupForCampaign(ws, { campaignId, accountId, siteId: args.siteId });
      if (adGroupRes) adGroupId = adGroupRes;
    }
    const existingMap = new Map(existing.map(r => [String(r.keywordText || '').trim().toLowerCase(), r]));

    const toCreate = [];
    const toEnable = [];
    const toBidUpdate = [];

    for (const entry of entries) {
      const key = entry.text ? entry.text.toLowerCase() : (entry.asin || '').toLowerCase();
      const existingRow = existingMap.get(key);
      if (!existingRow) {
        toCreate.push(entry);
      } else if (String(existingRow.state) === '2' || String(existingRow.state) === 'PAUSED') {
        toEnable.push({ ...entry, row: existingRow });
      } else {
        const currentBid = Number(existingRow.bid);
        const wantedBid = entry.bid;
        if (Math.abs(currentBid - wantedBid) >= 0.005) {
          toBidUpdate.push({ ...entry, row: existingRow });
        }
      }
    }

    const plan = {
      campaignId, adGroupId, accountId, siteId: args.siteId,
      existingCount: existing.length,
      toCreate: toCreate.map(e => ({ text: e.text || e.asin, bid: e.bid })),
      toEnable: toEnable.map(e => ({ text: e.text || e.asin, bid: e.bid, currentBid: e.row.bid, keywordId: e.row.keywordId })),
      toBidUpdate: toBidUpdate.map(e => ({ text: e.text || e.asin, bid: e.bid, currentBid: e.row.bid, keywordId: e.row.keywordId })),
    };

    if (!args.execute) {
      return { ok: true, dryRun: true, plan };
    }

    if (!adGroupId && toCreate.length) {
      throw new Error(`adGroupId could not be resolved for campaign ${campaignId}. Pass --ad-group-id explicitly (campaign may be too new for backend indexing).`);
    }

    const results = { created: [], enabled: [], bidUpdated: [], errors: [] };

    // 1. Create new keywords
    if (toCreate.length) {
      const createBody = {
        siteId: args.siteId,
        accountId,
        keywords: toCreate.map(e => ({
          campaignId, adGroupId,
          bid: e.bid,
          matchType: args.matchType,
          state: 'ENABLED',
          keywordText: e.text || e.asin,
        })),
        keywordGroups: [],
      };
      const createRes = await advFetch(ws, 'POST', '/keyword/createKeywordNew', createBody);
      if (createRes.json?.code === 200) {
        results.created = (createRes.json.data?.keyword?.success || []).map(s => s.keywordId);
      } else {
        results.errors.push({ step: 'create', status: createRes.status, response: createRes.json, rawSnippet: createRes.rawSnippet });
      }
    }

    // 2. Enable paused keywords + update bid
    if (toEnable.length) {
      const enableRows = toEnable.map(e => ({
        keywordId: e.row.keywordId,
        bid: String(e.bid),
        siteId: args.siteId,
        accountId,
        campaignId,
        adGroupId,
        matchType: e.row.matchType || args.matchType,
        advType: 'SP',
      }));
      // First enable
      const enablePayload = buildStatePayload(enableRows, accountId, args.siteId);
      const enableRes = await advFetch(ws, 'PATCH', '/keyword/batchKeyword', enablePayload);
      if (enableRes.json?.code !== 200) {
        results.errors.push({ step: 'enable', response: enableRes.json });
      }
      // Then update bid
      const bidPayload = buildBatchPatchPayload(enableRows, accountId, args.siteId);
      const bidRes = await advFetch(ws, 'PATCH', '/keyword/batchKeyword', bidPayload);
      if (bidRes.json?.code === 200) {
        results.enabled = (bidRes.json.data?.success || []).map(s => s.keywordId);
      } else {
        results.errors.push({ step: 'enable_bid', response: bidRes.json });
      }
    }

    // 3. Update bid for active keywords
    if (toBidUpdate.length) {
      const bidRows = toBidUpdate.map(e => ({
        keywordId: e.row.keywordId,
        bid: String(e.bid),
        siteId: args.siteId,
        accountId,
        campaignId,
        adGroupId,
        matchType: e.row.matchType || args.matchType,
        advType: 'SP',
      }));
      const bidPayload = buildBatchPatchPayload(bidRows, accountId, args.siteId);
      const bidRes = await advFetch(ws, 'PATCH', '/keyword/batchKeyword', bidPayload);
      if (bidRes.json?.code === 200) {
        results.bidUpdated = (bidRes.json.data?.success || []).map(s => s.keywordId);
      } else {
        results.errors.push({ step: 'bid_update', response: bidRes.json });
      }
    }

    return { ok: results.errors.length === 0, dryRun: false, plan, results };
  });

  const outFile = path.join(OUT_DIR, `sp_append_${args.sku}_${todayYmd()}.json`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ ...result, exportedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
