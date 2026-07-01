#!/usr/bin/env node
// Lean low-efficiency runner. Skips snapshot, schema, validation, daily_learning,
// audits, listing, inventory, overBudget, 7day_untouched. Just:
//   1. seed kwCapture in the extension panel
//   2. fetch 5 ad types × 4 windows = 20 low-efficiency pools
//   3. classify + PATCH locally allowed actions
//   4. append to adjustments_<date>.json

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { createPanelWs, today, SNAPSHOTS_DIR } = require('../../src/adjust_lib');
const {
  decideFromPoolMembership,
  scanLowEfficiencyPools,
  normalizeLowEfficiencyRow,
  buildWriterRequest,
} = require('../../src/low_efficiency_decision');
const { appendAdjustmentRecords } = require('../../src/adjustment_log');
const { sameDayGuardedEntityIds } = require('../../src/low_efficiency_execution_guard');

const ROOT = path.join(__dirname, '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const RECENT_ADJUSTMENT_WINDOW_DAYS = Number(process.env.LOW_EFFICIENCY_RECENT_ADJUSTMENT_WINDOW_DAYS || 14);
const BACKEND_FETCH_CONCURRENCY = Math.max(1, Number(process.env.LOW_EFFICIENCY_BACKEND_CONCURRENCY || 5));
const BACKEND_FETCH_MAX_PAGES = Math.max(1, Number(process.env.LOW_EFFICIENCY_BACKEND_MAX_PAGES || 80));
const BACKEND_EVAL_TIMEOUT_MS = Math.max(10000, Number(process.env.LOW_EFFICIENCY_BACKEND_EVAL_TIMEOUT_MS || 420000));

const LOW_EFFICIENCY_CONFIGS = [
  { kind: 'kw', label: 'SP关键词低效', property: '1' },
  { kind: 'auto', label: 'SP自动低效', property: '2', tableName: 'product_target' },
  { kind: 'manual', label: 'SP定位低效', property: '3', tableName: 'product_manual_target' },
  { kind: 'sbKw', label: 'SB关键词低效', property: '4' },
  { kind: 'sbTarget', label: 'SB定位低效', property: '6' },
];
const LOW_EFFICIENCY_WINDOWS = [3, 7, 15, 30];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateRangeForDays(days, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - Number(days || 1) + 1);
  return [ymd(start), ymd(end)];
}

function makeAdTimeRange(days, now = new Date()) {
  const [startYmd, endYmd] = dateRangeForDays(days, now);
  return [
    new Date(`${startYmd}T00:00:00`).getTime(),
    new Date(new Date(`${endYmd}T00:00:00`).getTime() + 86400000).getTime(),
  ];
}

function buildBackendLowEfficiencyPayload(cfg = {}, days, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const selectDate = dateRangeForDays(days, now);
  const payload = {
    siteId: Number(options.siteId || 4),
    timeRange: makeAdTimeRange(days, now),
    selectDate,
    state: '1',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    isHigh: '2',
    property: String(cfg.property || '1'),
    field: 'Spend',
    order: 'desc',
    page: Number(options.page || 1),
    limit: Number(options.limit || 500),
    filterArray: { campaignState: '1' },
  };
  if (cfg.tableName) payload.tableName = cfg.tableName;
  return payload;
}

function lowEfficiencyTasks(options = {}) {
  return LOW_EFFICIENCY_CONFIGS.flatMap(cfg => LOW_EFFICIENCY_WINDOWS.map(days => ({
    kind: cfg.kind,
    label: cfg.label,
    days,
    payload: buildBackendLowEfficiencyPayload(cfg, days, options),
  })));
}

function mergeLowEfficiencyReports(reports = []) {
  const buckets = {};
  for (const cfg of LOW_EFFICIENCY_CONFIGS) buckets[cfg.kind] = new Map();
  for (const report of reports || []) {
    const bucket = buckets[report.kind];
    if (!bucket) continue;
    for (const row of report.rows || []) {
      const id = String(row.keywordId || row.targetId || row.id || '').trim();
      if (!id) continue;
      let merged = bucket.get(id);
      if (!merged) {
        merged = {
          kind: report.kind,
          id,
          keywordId: row.keywordId,
          targetId: row.targetId,
          keywordText: row.keywordText || row.targetText || row.type || row.targetType || '',
          matchType: row.matchType || '',
          campaignId: String(row.campaignId || ''),
          adGroupId: String(row.adGroupId || ''),
          accountId: row.accountId,
          siteId: row.siteId || 4,
          campaignName: row.campaignName || '',
          groupName: row.groupName || '',
          state: row.state,
          campaignState: row.campaignState,
          groupState: row.groupState,
          bid: row.bid,
          updatedAt: row.updatedAt || row.updated_at || '',
          operatedAt: row.operatedAt || row.operationTime || row.remarkTime || '',
          sku: row.sku || '',
          windows: {},
          __adProperty: row.__adProperty || report.payload?.property,
        };
        bucket.set(id, merged);
      }
      merged.windows[String(report.days)] = {
        impressions: row.Impressions ?? row.impressions ?? 0,
        clicks: row.Clicks ?? row.clicks ?? 0,
        spend: row.Spend ?? row.spend ?? 0,
        orders: row.Orders ?? row.orders ?? 0,
        sales: row.Sales ?? row.sales ?? 0,
        acos: row.ACOS ?? row.acos ?? null,
        cpc: row.CPC ?? row.cpc ?? 0,
      };
      merged.bid = merged.bid || row.bid;
      merged.updatedAt = merged.updatedAt || row.updatedAt || '';
      merged.operatedAt = merged.operatedAt || row.operatedAt || '';
    }
  }
  return Object.fromEntries(Object.entries(buckets).map(([kind, bucket]) => [kind, [...bucket.values()]]));
}

async function withPanelWs(handler) {
  const ws = await createPanelWs();
  await new Promise(resolve => ws.on('open', resolve));
  const evalInPanel = (expression, awaitPromise = false) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const onMsg = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', onMsg);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const inner = response.result?.exceptionDetails;
      if (inner) return reject(new Error(inner.exception?.description || inner.text));
      resolve(response.result?.result?.value);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: !!awaitPromise } }));
  });
  try {
    return await handler(evalInPanel);
  } finally {
    ws.close();
  }
}

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').startsWith('https://adv.yswg.com.cn/'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find logged-in adv.yswg.com.cn debug tab on port 9222.');
  }
  return tab;
}

async function withAdTabWs(handler) {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const evalInAdTab = (expression, awaitPromise = false, timeoutMs = BACKEND_EVAL_TIMEOUT_MS) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
    const onMsg = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', onMsg);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const inner = response.result?.exceptionDetails;
      if (inner) return reject(new Error(inner.exception?.description || inner.text));
      resolve(response.result?.result?.value);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: !!awaitPromise } }));
  });
  try {
    return await handler(evalInAdTab);
  } finally {
    ws.close();
  }
}

function backendFetchExpression(tasks, options = {}) {
  return `
    (async () => {
      const tasks = ${JSON.stringify(tasks)};
      const concurrency = ${JSON.stringify(options.concurrency || BACKEND_FETCH_CONCURRENCY)};
      const maxPages = ${JSON.stringify(options.maxPages || BACKEND_FETCH_MAX_PAGES)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      async function postJson(payload) {
        const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready' };
        try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 500) }; }
      }
      async function fetchTask(task) {
        const startedAt = Date.now();
        const rows = [];
        const pages = [];
        for (let page = 1; page <= maxPages; page += 1) {
          const payload = { ...task.payload, page };
          const response = await postJson(payload);
          const list = getList(response.json || {});
          const total = response.json?.count || response.json?.data?.total || response.json?.total || null;
          pages.push({ page, ok: response.ok, status: response.status, rowCount: list.length, total, error: response.error || null });
          if (page === 1 && !response.ok) break;
          rows.push(...list.map(row => ({ ...row, __adProperty: task.payload.property })));
          if (list.length < Number(task.payload.limit || 500)) break;
          if (total && page >= Math.ceil(total / Number(task.payload.limit || 500))) break;
        }
        return { ...task, ok: pages[0]?.ok !== false, rows, pages, durationMs: Date.now() - startedAt };
      }
      const reports = [];
      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = await Promise.all(tasks.slice(i, i + concurrency).map(fetchTask));
        reports.push(...batch);
      }
      return JSON.stringify({ ok: reports.every(report => report.ok), reports });
    })()
  `;
}

async function fetchLowEfficiencyPoolsFromAdTab() {
  const tasks = lowEfficiencyTasks();
  return withAdTabWs(async evalInAdTab => {
    const raw = await evalInAdTab(backendFetchExpression(tasks), true, BACKEND_EVAL_TIMEOUT_MS);
    const result = JSON.parse(raw || '{}');
    if (!result.ok) {
      const failed = (result.reports || []).filter(report => !report.ok).slice(0, 3);
      throw new Error(`backend low-efficiency fetch failed: ${JSON.stringify(failed)}`);
    }
    return {
      pools: mergeLowEfficiencyReports(result.reports || []),
      reports: result.reports || [],
    };
  });
}

async function fetchLowEfficiencyPoolsPreferPanel() {
  try {
    return await withPanelWs(async (evalInPanel) => {
      log('triggering runLowEfficiencyOnly() in panel...');
      const pools = await evalInPanel('runLowEfficiencyOnly().then(r => JSON.parse(JSON.stringify(r)))', true);
      if (!pools) throw new Error('panel returned empty low-efficiency pools');
      return { pools, source: 'extension_panel', reports: [] };
    });
  } catch (error) {
    log(`panel low-efficiency fetch unavailable: ${error.message}; falling back to adv backend tab.`);
    const result = await fetchLowEfficiencyPoolsFromAdTab();
    return { ...result, source: 'adv_backend_tab' };
  }
}

const KIND_TO_NORMALIZER = {
  kw: 'spKeyword',
  auto: 'spAuto',
  manual: 'spTarget',
  sbKw: 'sbKeyword',
  sbTarget: 'sbTarget',
};

function poolEntryToEntity(kind, entry) {
  const row = {
    [kind === 'kw' || kind === 'sbKw' ? 'keywordId' : 'targetId']: entry.id,
    keywordText: entry.keywordText,
    matchType: entry.matchType,
    campaignId: entry.campaignId,
    adGroupId: entry.adGroupId,
    accountId: entry.accountId,
    siteId: entry.siteId || 4,
    campaignName: entry.campaignName,
    groupName: entry.groupName,
    state: entry.state ?? 1,
    campaignState: entry.campaignState ?? 1,
    groupState: entry.groupState ?? 1,
    bid: entry.bid,
    updatedAt: entry.updatedAt,
    operatedAt: entry.operatedAt,
  };
  const w = entry.windows || {};
  return normalizeLowEfficiencyRow(KIND_TO_NORMALIZER[kind], row, {
    metrics: {
      30: w['30'] || {},
      15: w['15'] || {},
      7: w['7'] || {},
      3: w['3'] || {},
    },
  });
}

async function patchInAdTab(evalInAdTab, request) {
  const expression = `
    (async () => {
      const request = ${JSON.stringify(request)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const res = await fetch(request.url, { method: request.method || 'PATCH', credentials: 'include', headers, body: JSON.stringify(request.body) });
      const text = await res.text();
      try { return JSON.stringify({ status: res.status, json: JSON.parse(text) }); }
      catch (error) { return JSON.stringify({ status: res.status, json: { parseError: error.message, text: text.slice(0, 500) } }); }
    })()
  `;
  const raw = await evalInAdTab(expression, true);
  const parsed = JSON.parse(raw || '{}');
  return parsed.json || parsed;
}

async function main() {
  const startedAt = Date.now();
  const timings = [];
  const timed = async (label, fn) => {
    const phaseStarted = Date.now();
    try {
      return await fn();
    } finally {
      const durationMs = Date.now() - phaseStarted;
      timings.push({ label, durationMs });
      log(`timing ${label}: ${(durationMs / 1000).toFixed(1)}s`);
    }
  };
  log(`mode=${DRY_RUN ? 'dry-run' : 'EXECUTE'} recentAdjustmentWindowDays=${RECENT_ADJUSTMENT_WINDOW_DAYS}`);

  const fetchResult = await timed('fetch_low_efficiency_pools', fetchLowEfficiencyPoolsPreferPanel);
  const pools = fetchResult.pools;
  const total = Object.values(pools || {}).reduce((a, r) => a + (r?.length || 0), 0);
  log(`pools fetched via ${fetchResult.source}: ${total} rows (kw=${pools?.kw?.length || 0} auto=${pools?.auto?.length || 0} manual=${pools?.manual?.length || 0} sbKw=${pools?.sbKw?.length || 0} sbTarget=${pools?.sbTarget?.length || 0})`);

  const fakeSnapshot = { lowEfficiencyRows: pools };
  const scan = await timed('scan_low_efficiency_decisions', async () => scanLowEfficiencyPools(fakeSnapshot, { now: new Date(), recentAdjustmentWindowDays: RECENT_ADJUSTMENT_WINDOW_DAYS }));
  log(`decisions: actionable=${scan.summary.totals.actionable} hold=${scan.summary.totals.hold} skip=${scan.summary.totals.skip}`);
  for (const [k, s] of Object.entries(scan.summary.byKind)) {
    log(`  ${k}: scanned=${s.scanned} actionable=${s.actionable} hold=${s.hold} skip=${s.skip}`);
  }
  const poolsPath = path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${today}.json`);
  fs.writeFileSync(poolsPath, JSON.stringify(scan, null, 2));
  log(`pool scan persisted to ${poolsPath}`);

  const alreadyLandedEntityIds = sameDayGuardedEntityIds(today);
  const actionables = [];
  let alreadyLandedSkipped = 0;
  for (const [kind, decisions] of Object.entries(scan.results)) {
    for (const { entry, decision } of decisions) {
      if (decision.actionType !== 'bid' && decision.actionType !== 'pause') continue;
      if (alreadyLandedEntityIds.has(String(entry.id))) {
        alreadyLandedSkipped += 1;
        continue;
      }
      actionables.push({ kind, entry, decision });
    }
  }
  if (alreadyLandedSkipped) {
    log(`same-day live guard: skipped ${alreadyLandedSkipped} already-landed entities from execution pool.`);
  }

  const writePerf = (businessDate, actionables = [], executions = []) => {
    const apiOk = executions.filter(e => e.ok).length;
    const apiFail = executions.filter(e => !e.ok && !DRY_RUN).length;
    const perfFile = path.join(ROOT, 'data', 'tasks', `low_efficiency_perf_${businessDate}.json`);
    fs.writeFileSync(perfFile, JSON.stringify({
      generatedAt: new Date().toISOString(),
      businessDate,
      dryRun: DRY_RUN,
      source: fetchResult.source,
      summary: {
        totalRows: total,
        actionable: actionables.length,
        apiOk,
        apiFail,
        totalRuntimeMs: Date.now() - startedAt,
      },
      timings,
      fetchReports: (fetchResult.reports || []).map(report => ({
        kind: report.kind,
        days: report.days,
        ok: report.ok,
        rows: (report.rows || []).length,
        pages: (report.pages || []).length,
        durationMs: report.durationMs,
      })),
    }, null, 2));
    log(`perf summary persisted to ${perfFile}`);
  };

  if (!actionables.length) {
    log('nothing to execute today. done.');
    writePerf(today, actionables, []);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(`total runtime: ${elapsed}s`);
    return;
  }

  log('actionable detail:');
  actionables.forEach((a, i) => {
    const e = a.entry;
    const text = e.keywordText || '(target)';
    const action = a.decision.actionType === 'bid'
      ? `${e.bid} → ${a.decision.suggestedBid}`
      : 'PAUSE';
    log(`  ${i + 1}. [${a.kind}] id=${e.id} text="${text}" pattern=${a.decision.pattern} ${action}`);
  });

  const executions = [];
  if (!DRY_RUN) {
    await timed('execute_low_efficiency_actions', async () => withAdTabWs(async (evalInAdTab) => {
      for (const { kind, entry, decision } of actionables) {
        const entity = poolEntryToEntity(kind, entry);
        const request = buildWriterRequest(entity, decision);
        try {
          const result = await patchInAdTab(evalInAdTab, request);
          const data = result || {};
          const successList = Array.isArray(data?.data?.success) ? data.data.success : [];
          const errorList = Array.isArray(data?.data?.error) ? data.data.error : [];
          const ok = Number(data.code) === 200 && successList.length > 0 && errorList.length === 0;
          log(`  PATCH ${request.url} id=${entry.id}: ${ok ? 'ok' : 'failed'} ${JSON.stringify(result || {}).slice(0, 200)}`);
          executions.push({ kind, entry, decision, request, result, ok });
        } catch (err) {
          log(`  PATCH ${request.url} id=${entry.id}: error ${err.message}`);
          executions.push({ kind, entry, decision, request, error: err.message, ok: false });
        }
      }
    }));
  }

  const businessDate = today;
  const records = actionables.map(({ kind, entry, decision }, i) => {
    const exec = executions[i] || {};
    const text = entry.keywordText || '';
    const ENTITY_TYPE = { kw: 'keyword', auto: 'autoTarget', manual: 'manualTarget', sbKw: 'sbKeyword', sbTarget: 'sbTarget' };
    const apiResultText = exec.result ? JSON.stringify(exec.result).slice(0, 500) : '';
    return {
      sku: entry.sku || `lowEff::${kind}::${entry.id}`,
      asin: '',
      site: 'Amazon.com',
      action: {
        entityType: ENTITY_TYPE[kind],
        actionType: decision.actionType,
        id: entry.id,
        text,
        campaignId: entry.campaignId,
        adGroupId: entry.adGroupId,
        currentBid: Number(entry.bid) || 0,
        suggestedBid: decision.suggestedBid || null,
        reason: `[low_efficiency_pool:${decision.pattern}:${decision.reasonCode}] ${decision.reason}`,
        approvedBy: 'claude',
        decisionStage: 'ai_approved',
        actionSource: ['claude'],
      },
      outcome: DRY_RUN ? 'dry_run_planned' : (exec.ok ? 'api_success' : 'api_failed'),
      dryRun: DRY_RUN,
      reason: exec.error || (!exec.ok ? apiResultText : ''),
      meta: exec.result ? { apiResult: exec.result } : {},
    };
  });

  const timeContext = {
    runAt: new Date().toISOString(),
    businessDate,
    sourceRunId: `low_efficiency_${businessDate}_${Date.now()}`,
  };
  if (DRY_RUN) {
    log('dry-run: skipping adjustments log write.');
  } else {
    const result = appendAdjustmentRecords(records.map(r => ({ ...r, runAt: timeContext.runAt, businessDate: timeContext.businessDate, sourceRunId: timeContext.sourceRunId })), { timeContext });
    log(`adjustments appended to ${result.file} (${result.count} records)`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const apiOk = executions.filter(e => e.ok).length;
  const apiFail = executions.filter(e => !e.ok && !DRY_RUN).length;
  writePerf(businessDate, actionables, executions);
  log(`done. actionable=${actionables.length} api_ok=${apiOk} api_failed=${apiFail} total_runtime=${elapsed}s`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildBackendLowEfficiencyPayload,
  dateRangeForDays,
  lowEfficiencyTasks,
  makeAdTimeRange,
  mergeLowEfficiencyReports,
};
