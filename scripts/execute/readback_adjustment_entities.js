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
  const date = args.date || new Date().toISOString().slice(0, 10);
  return {
    date,
    sourceRunId: String(args.sourceRunId || '').trim(),
    sourceRunPrefix: String(args.sourceRunPrefix || '').trim(),
    adjustmentsFile: args.adjustments || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`),
    output: args.output || path.join(ROOT, 'data', 'tasks', `adjustment_entity_readback_${date}.json`),
    days: Number(args.days || 30),
    siteId: Number(args.siteId || 4),
  };
}

function readJson(file, fallback) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateRange(days) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 30) + 1);
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

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222.');
  }
  return tab;
}

function evalInTab(ws, expression, awaitPromise = false, timeoutMs = 420000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
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

function entityConfig(entityType) {
  if (entityType === 'keyword') return { property: '1', tableName: '' };
  if (entityType === 'autoTarget') return { property: '2', tableName: 'product_target' };
  if (entityType === 'manualTarget') return { property: '3', tableName: 'product_manual_target' };
  if (entityType === 'sbKeyword') return { property: '4', tableName: '' };
  if (entityType === 'sbTarget') return { property: '6', tableName: '' };
  return null;
}

function rowId(row = {}) {
  return String(row.keywordId || row.keyword_id || row.targetId || row.target_id || row.adId || row.id || '').trim();
}

function rowBid(row = {}) {
  const n = Number(row.bid ?? row.defaultBid ?? row.cpcBid ?? row.keywordBid ?? row.targetBid);
  return Number.isFinite(n) ? n : null;
}

function stateLanded(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '2' || raw === 'paused' || raw === 'pause' || raw === 'archived';
}

function expectedFor(record = {}) {
  const action = record.action || {};
  const actionType = record.actionType || action.actionType || '';
  if (actionType === 'pause') return { field: 'state', value: 'paused' };
  if (actionType === 'bid') {
    const n = Number(record.afterValue ?? action.suggestedBid);
    return { field: 'bid', value: Number.isFinite(n) ? n : null };
  }
  return { field: actionType || 'unknown', value: null };
}

function normalizeRecord(record = {}) {
  const action = record.action || {};
  const entityType = String(record.entityType || action.entityType || '').trim();
  const id = String(record.entityId || action.id || '').trim();
  const cfg = entityConfig(entityType);
  if (!cfg || !id) return null;
  return {
    sku: record.sku || '',
    sourceRunId: record.sourceRunId || '',
    entityType,
    id,
    entityName: record.entityName || action.text || action.label || '',
    actionType: record.actionType || action.actionType || '',
    expected: expectedFor(record),
    accountId: record.accountId || action.accountId || action.account || record.meta?.accountId || '',
    campaignId: record.campaignId || action.campaignId || '',
    adGroupId: record.adGroupId || action.adGroupId || '',
    siteId: Number(record.siteId || action.siteId || 4),
    property: cfg.property,
    tableName: cfg.tableName,
    beforeValue: record.beforeValue,
    afterValue: record.afterValue,
  };
}

function groupKey(item) {
  return [
    item.accountId,
    item.campaignId,
    item.adGroupId,
    item.siteId,
    item.property,
    item.tableName,
  ].join('|');
}

async function fetchGroups(items, options) {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const selectDate = dateRange(options.days);
    const groups = new Map();
    for (const item of items) {
      const key = groupKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const tasks = [...groups.values()].map(group => ({
      sample: group[0],
      ids: group.map(item => item.id),
    }));
    const expression = `
      (async () => {
        const tasks = ${JSON.stringify(tasks)};
        const selectDate = ${JSON.stringify(selectDate)};
        const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
        const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
        const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
          json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
        const rowId = row => String(row.keywordId || row.keyword_id || row.targetId || row.target_id || row.adId || row.id || '').trim();
        async function postJson(payload) {
          const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
          const text = await res.text();
          if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready' };
          try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
          catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 500) }; }
        }
        function basePayload(sample, state) {
          const payload = {
            siteId: sample.siteId || ${JSON.stringify(options.siteId)},
            timeRange: [
              new Date(selectDate[0] + 'T00:00:00').getTime(),
              new Date(new Date(selectDate[1] + 'T00:00:00').getTime() + 86400000).getTime(),
            ],
            selectDate,
            state,
            coreMark: '0',
            userName: ['HJ17', 'HJ171', 'HJ172'],
            level: 'seller_num',
            publicAdv: '2',
            lowCost: 2,
            accountId: sample.accountId,
            campaignId: sample.campaignId,
            adGroupId: sample.adGroupId,
            property: sample.property,
            field: 'Spend',
            order: 'desc',
            page: 1,
            limit: 500,
            filterArray: { campaignState: state },
          };
          if (sample.tableName) payload.tableName = sample.tableName;
          return payload;
        }
        async function fetchOne(task) {
          const wanted = new Set(task.ids.map(String));
          const rowsById = {};
          const attempts = [];
          for (const state of ['1', '4', '2']) {
            for (let page = 1; page <= 20; page += 1) {
              const payload = { ...basePayload(task.sample, state), page };
              const response = await postJson(payload);
              const list = getList(response.json || {});
              attempts.push({ state, page, ok: response.ok, status: response.status, rowCount: list.length, total: response.json?.count || response.json?.data?.total || response.json?.total || null, error: response.error || null });
              if (page === 1 && !response.ok) break;
              for (const row of list) {
                const id = rowId(row);
                if (wanted.has(id)) rowsById[id] = { ...row, __readbackStateQuery: state };
              }
              if ([...wanted].every(id => rowsById[id])) return { task, rowsById, attempts };
              if (list.length < 500) break;
            }
          }
          return { task, rowsById, attempts };
        }
        const out = [];
        for (const task of tasks) out.push(await fetchOne(task));
        return JSON.stringify({ ok: true, selectDate, groups: out });
      })()
    `;
    return JSON.parse(await evalInTab(ws, expression, true) || '{}');
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

async function fetchGlobalItems(items, options) {
  if (!items.length) return { ok: true, groups: [] };
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const selectDate = dateRange(options.days);
    const groups = new Map();
    for (const item of items) {
      const key = [item.siteId, item.property, item.tableName].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const tasks = [...groups.values()].map(group => ({
      sample: group[0],
      ids: group.map(item => item.id),
    }));
    const expression = `
      (async () => {
        const tasks = ${JSON.stringify(tasks)};
        const selectDate = ${JSON.stringify(selectDate)};
        const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
        const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
        const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
          json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
        const rowId = row => String(row.keywordId || row.keyword_id || row.targetId || row.target_id || row.adId || row.id || '').trim();
        async function postJson(payload) {
          const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
          const text = await res.text();
          if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready' };
          try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
          catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 500) }; }
        }
        function basePayload(sample, state) {
          const payload = {
            siteId: sample.siteId || ${JSON.stringify(options.siteId)},
            timeRange: [
              new Date(selectDate[0] + 'T00:00:00').getTime(),
              new Date(new Date(selectDate[1] + 'T00:00:00').getTime() + 86400000).getTime(),
            ],
            selectDate,
            state,
            coreMark: '0',
            userName: ['HJ17', 'HJ171', 'HJ172'],
            level: 'seller_num',
            publicAdv: '2',
            lowCost: 2,
            property: sample.property,
            field: 'Spend',
            order: 'desc',
            page: 1,
            limit: 500,
            filterArray: { campaignState: state },
          };
          if (sample.tableName) payload.tableName = sample.tableName;
          return payload;
        }
        async function fetchOne(task) {
          const wanted = new Set(task.ids.map(String));
          const rowsById = {};
          const attempts = [];
          for (const state of ['1', '4', '2']) {
            for (let page = 1; page <= 100; page += 1) {
              const payload = { ...basePayload(task.sample, state), page };
              const response = await postJson(payload);
              const list = getList(response.json || {});
              attempts.push({ state, page, ok: response.ok, status: response.status, rowCount: list.length, total: response.json?.count || response.json?.data?.total || response.json?.total || null, error: response.error || null });
              if (page === 1 && !response.ok) break;
              for (const row of list) {
                const id = rowId(row);
                if (wanted.has(id)) rowsById[id] = { ...row, __readbackStateQuery: state, __globalReadback: true };
              }
              if ([...wanted].every(id => rowsById[id])) return { task, rowsById, attempts };
              if (list.length < 500) break;
              const total = response.json?.count || response.json?.data?.total || response.json?.total || null;
              if (total && page >= Math.ceil(Number(total) / 500)) break;
            }
          }
          return { task, rowsById, attempts };
        }
        const out = [];
        for (const task of tasks) out.push(await fetchOne(task));
        return JSON.stringify({ ok: true, selectDate, groups: out });
      })()
    `;
    return JSON.parse(await evalInTab(ws, expression, true) || '{}');
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

async function main() {
  const options = parseArgs();
  const rows = readJson(options.adjustmentsFile, []);
  const filtered = rows
    .filter(row => !row.dryRun)
    .filter(row => options.sourceRunId
      ? String(row.sourceRunId || '') === options.sourceRunId
      : (options.sourceRunPrefix ? String(row.sourceRunId || '').startsWith(options.sourceRunPrefix) : true))
    .map(normalizeRecord)
    .filter(Boolean);

  const groupedItems = filtered.filter(item => item.accountId && item.campaignId && item.adGroupId);
  const globalItems = filtered.filter(item => !(item.accountId && item.campaignId && item.adGroupId));
  const fetched = await fetchGroups(groupedItems, options);
  const globalFetched = await fetchGlobalItems(globalItems, options);
  const byId = new Map();
  for (const group of fetched.groups || []) {
    for (const [id, row] of Object.entries(group.rowsById || {})) byId.set(id, row);
  }
  for (const group of globalFetched.groups || []) {
    for (const [id, row] of Object.entries(group.rowsById || {})) byId.set(id, row);
  }
  const details = filtered.map(item => {
    const row = byId.get(item.id);
    const actualBid = row ? rowBid(row) : null;
    const actualState = row ? row.state : null;
    const landed = item.expected.field === 'bid'
      ? !!row && actualBid != null && item.expected.value != null && Math.abs(actualBid - item.expected.value) < 0.0001
      : (item.expected.field === 'state' ? !!row && stateLanded(actualState) : false);
    return {
      ...item,
      rowFound: !!row,
      actualBid,
      actualState,
      landed,
      updatedAt: row?.updatedAt || row?.updated_at || '',
      campaignState: row?.campaignState ?? null,
      groupState: row?.groupState ?? null,
      readbackStateQuery: row?.__readbackStateQuery || '',
    };
  });
  const summary = {
    total: details.length,
    found: details.filter(item => item.rowFound).length,
    landed: details.filter(item => item.landed).length,
    notLanded: details.filter(item => item.rowFound && !item.landed).length,
    missing: details.filter(item => !item.rowFound).length,
    byAction: details.reduce((acc, item) => {
      acc[item.actionType] = (acc[item.actionType] || 0) + 1;
      return acc;
    }, {}),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    adjustmentsFile: options.adjustmentsFile,
    sourceRunId: options.sourceRunId,
    sourceRunPrefix: options.sourceRunPrefix,
    source: '/keyword/findAllNew',
    dateRange: fetched.selectDate,
    summary,
    details,
    fetchGroups: [
      ...(fetched.groups || []).map(group => ({
        mode: 'group',
        sample: group.task?.sample || {},
        ids: group.task?.ids || [],
        found: Object.keys(group.rowsById || {}).length,
        attempts: group.attempts || [],
      })),
      ...(globalFetched.groups || []).map(group => ({
        mode: 'global_property',
        sample: group.task?.sample || {},
        ids: group.task?.ids || [],
        found: Object.keys(group.rowsById || {}).length,
        attempts: group.attempts || [],
      })),
    ],
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outputFile: options.output, summary }, null, 2));
  if (summary.landed !== summary.total) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
