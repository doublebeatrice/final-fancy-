#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  decideFromPoolMembership,
  normalizeLowEfficiencyRow,
  buildWriterRequest,
} = require('../../src/low_efficiency_decision');
const { appendAdjustmentRecords } = require('../../src/adjustment_log');

const ROOT = path.join(__dirname, '..', '..');
const BUSINESS_DATE = process.env.BUSINESS_DATE || '2026-05-19';
const DATA_END = process.env.DATA_END || '2026-05-18';
const DATA_START = process.env.DATA_START || '2026-04-19';
const NOW = new Date(process.env.NOW_LOCAL || `${BUSINESS_DATE}T12:10:00+08:00`);
const EXECUTE = process.argv.includes('--execute');
const EXECUTE_FROM_SCAN = process.argv.includes('--from-scan') || process.env.LOW_EFFICIENCY_EXECUTE_FROM_SCAN === '1';
const KIND_ARG = String(process.argv.find(arg => arg.startsWith('--kind=')) || '--kind=auto').split('=')[1];
const COOLDOWN_DAYS = Number(process.env.LOW_EFFICIENCY_COOLDOWN_DAYS || 14);
const MAX_PAGES = Number(process.env.LOW_EFFICIENCY_RECHECK_MAX_PAGES || 160);
const VERIFY_MAX_PAGES = Number(process.env.LOW_EFFICIENCY_VERIFY_MAX_PAGES || MAX_PAGES);
const EVAL_TIMEOUT_MS = Number(process.env.LOW_EFFICIENCY_EVAL_TIMEOUT_MS || 600000);
const EXECUTE_MAX = Number(process.env.LOW_EFFICIENCY_EXECUTE_MAX || 0);
const EXECUTE_REASON_REGEX_TEXT = String(process.env.LOW_EFFICIENCY_EXECUTE_REASON_REGEX || '').trim();
const EXECUTE_REASON_REGEX = EXECUTE_REASON_REGEX_TEXT ? new RegExp(EXECUTE_REASON_REGEX_TEXT, 'i') : null;
const ALLOW_UNCAPPED_EXECUTE = process.env.LOW_EFFICIENCY_ALLOW_UNCAPPED_EXECUTE === '1';

function ymdAddDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function windowStart(endYmd, days) {
  return ymdAddDays(endYmd, -days + 1);
}

const RANGES = {
  3: [process.env.DATA_START_3 || windowStart(DATA_END, 3), DATA_END],
  7: [process.env.DATA_START_7 || windowStart(DATA_END, 7), DATA_END],
  15: [process.env.DATA_START_15 || windowStart(DATA_END, 15), DATA_END],
  30: [DATA_START, DATA_END],
};

const SPECS = {
  kw: {
    label: 'SP keyword',
    property: '1',
    tableName: '',
    state: '4',
    campaignState: '4',
    idField: 'keywordId',
    nameFields: ['keywordText', 'keyword'],
    entityType: 'keyword',
    normalizeKind: 'spKeyword',
  },
  auto: {
    label: 'SP auto target',
    property: '2',
    tableName: 'product_target',
    state: '4',
    campaignState: '4',
    idField: 'targetId',
    nameFields: ['type'],
    entityType: 'autoTarget',
    normalizeKind: 'spAuto',
  },
  manual: {
    label: 'SP manual target',
    property: '3',
    tableName: 'product_manual_target',
    state: '4',
    campaignState: '4',
    idField: 'targetId',
    nameFields: ['targetText', 'targetingText', 'expression', 'asin', 'ASIN'],
    entityType: 'manualTarget',
    normalizeKind: 'spTarget',
  },
  sbKw: {
    label: 'SB keyword',
    property: '4',
    tableName: '',
    state: '1',
    campaignState: '1',
    idField: 'keywordId',
    nameFields: ['keywordText', 'keyword'],
    entityType: 'sbKeyword',
    normalizeKind: 'sbKeyword',
  },
  sbTarget: {
    label: 'SB target',
    property: '6',
    tableName: '',
    state: '1',
    campaignState: '1',
    idField: 'targetId',
    nameFields: ['targetText', 'targetingText', 'asin', 'ASIN', 'expression'],
    entityType: 'sbTarget',
    normalizeKind: 'sbTarget',
  },
};

const AUTO_LABEL = {
  queryHighRelMatches: 'Close-match',
  queryBroadRelMatches: 'Loose-match',
  asinSubstituteRelated: 'Substitutes',
  asinAccessoryRelated: 'Complements',
};

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value ?? '').trim();
}

function metric(row = {}) {
  const rawAcos = row.ACOS ?? row.acos;
  return {
    impressions: num(row.Impressions ?? row.impressions),
    clicks: num(row.Clicks ?? row.clicks),
    spend: num(row.Spend ?? row.spend),
    orders: num(row.Orders ?? row.orders),
    sales: num(row.Sales ?? row.sales),
    acos: rawAcos === null || rawAcos === undefined || rawAcos === '' ? null : num(rawAcos),
    cpc: num(row.CPC ?? row.cpc),
  };
}

function sameBusinessDate(value) {
  return text(value).slice(0, 10) === BUSINESS_DATE;
}

function smallStep(bid) {
  if (bid >= 1) return 0.10;
  if (bid >= 0.5) return 0.05;
  if (bid >= 0.2) return 0.03;
  return 0.02;
}

function bidFloor(entry = {}) {
  if ((entry.kind === 'sbKw' || entry.kind === 'sbTarget') && /sbv|video/i.test(entry.campaignName || '')) {
    return 0.25;
  }
  return 0.02;
}

function proposedBid(entry = {}) {
  const bid = num(entry.bid);
  return Math.max(bidFloor(entry), Number((bid - smallStep(bid)).toFixed(2)));
}

function lowWindowHit(entry = {}) {
  for (const windowDays of [7, 15, 30]) {
    const m = entry.windows?.[String(windowDays)];
    if (!m) continue;
    const zeroClickGate = windowDays === 7 ? 7 : 8;
    const zeroSpendGate = windowDays === 7 ? 2 : 2.5;
    const highAcosSpendGate = windowDays === 7 ? 2 : 2.5;
    if (m.orders === 0 && (m.clicks >= zeroClickGate || m.spend >= zeroSpendGate)) {
      return {
        windowDays,
        kind: 'zero_order',
        reason: `${windowDays}d_zero_order clicks=${m.clicks} spend=${m.spend.toFixed(2)}`,
      };
    }
    if (m.orders > 0 && m.acos !== null && m.acos >= 0.3 && (m.clicks >= 5 || m.spend >= highAcosSpendGate)) {
      return {
        windowDays,
        kind: 'high_acos',
        reason: `${windowDays}d_high_acos clicks=${m.clicks} spend=${m.spend.toFixed(2)} orders=${m.orders} acos=${m.acos.toFixed(3)}`,
      };
    }
  }
  return null;
}

function adjustmentLogByEntityType() {
  const file = path.join(ROOT, 'data', 'adjustments', `adjustments_${BUSINESS_DATE}.json`);
  const result = new Map();
  if (!fs.existsSync(file)) return result;
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const record of records) {
    const type = text(record.entityType);
    const id = text(record.entityId);
    if (!type || !id) continue;
    if (!result.has(type)) result.set(type, new Map());
    const previous = result.get(type).get(id);
    if (!previous || String(record.runAt || '') > String(previous.runAt || '')) {
      result.get(type).set(id, record);
    }
  }
  return result;
}

function findAdjusted(adjusted, entityType, id) {
  return adjusted.get(entityType)?.get(String(id)) || null;
}

function adjustmentBlocksRetry(record = {}) {
  if (!record || record.dryRun) return false;
  const outcome = text(record.outcome).toLowerCase();
  if (!outcome) return true;
  if (outcome.includes('fail') || outcome === 'manual_review') return false;
  return true;
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
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find logged-in adv.yswg.com.cn debug tab on port 9222.');
  return tab;
}

function evalInPage(ws, expression, awaitPromise = false, timeoutMs = 420000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
    const onMessage = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      if (response.result?.exceptionDetails) {
        return reject(new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text));
      }
      resolve(response.result?.result?.value);
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    }));
  });
}

function browserFetchExpression(spec, ranges, maxPages, verifyIds = []) {
  return `
    (async () => {
      const spec = ${JSON.stringify(spec)};
      const ranges = ${JSON.stringify(ranges)};
      const maxPages = ${JSON.stringify(maxPages)};
      const verifyIds = new Set(${JSON.stringify(verifyIds.map(String))});
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      async function fetchWindow(range) {
        const rows = [];
        const pages = [];
        const foundIds = new Set();
        for (let page = 1; page <= maxPages; page += 1) {
          const payload = {
            siteId: 4,
            timeRange: [
              new Date(range[0] + 'T00:00:00').getTime(),
              new Date(new Date(range[1] + 'T00:00:00').getTime() + 86400000).getTime()
            ],
            state: spec.state,
            coreMark: '0',
            userName: ['HJ17', 'HJ171', 'HJ172'],
            level: 'seller_num',
            publicAdv: '2',
            lowCost: 2,
            property: spec.property,
            selectDate: range,
            field: 'Spend',
            order: 'desc',
            page,
            limit: 500,
            filterArray: { campaignState: spec.campaignState },
          };
          if (spec.tableName) payload.tableName = spec.tableName;
          const res = await fetch('/keyword/findAllNew', { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
          const body = await res.text();
          let json;
          try { json = JSON.parse(body); }
          catch (error) {
            return { ok: false, page, status: res.status, error: error.message, text: body.slice(0, 500), rows, pages };
          }
          const list = getList(json) || [];
          const kept = verifyIds.size ? list.filter(row => verifyIds.has(String(row[spec.idField] || row.id || row.targetId || row.keywordId || ''))) : list;
          rows.push(...kept);
          for (const row of kept) foundIds.add(String(row[spec.idField] || row.id || row.targetId || row.keywordId || ''));
          pages.push({ page, status: res.status, count: list.length, kept: kept.length, total: json?.count || json?.data?.total || json?.total || null });
          if (verifyIds.size && foundIds.size >= verifyIds.size) break;
          if (list.length < 500) break;
        }
        return { ok: true, range, rows, pages };
      }
      const out = {};
      for (const [days, range] of Object.entries(ranges)) out[days] = await fetchWindow(range);
      return JSON.stringify(out);
    })()
  `;
}

function browserPatchExpression(requests) {
  return `
    (async () => {
      const requests = ${JSON.stringify(requests)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const results = [];
      for (const request of requests) {
        try {
          const res = await fetch(request.url, { method: request.method || 'PATCH', credentials: 'include', headers, body: JSON.stringify(request.body) });
          const text = await res.text();
          let json;
          try { json = JSON.parse(text); }
          catch (error) { json = { parseError: error.message, text: text.slice(0, 500) }; }
          results.push({ id: request.id, status: res.status, json });
        } catch (error) {
          results.push({ id: request.id, error: error.message });
        }
      }
      return JSON.stringify({ executedAt: new Date().toISOString(), results });
    })()
  `;
}

function nameForRow(kind, spec, row) {
  if (kind === 'auto') return AUTO_LABEL[row.type] || text(row.type);
  for (const field of spec.nameFields) {
    const value = text(row[field]);
    if (value) return value;
  }
  return text(row.keywordText || row.targetText || row.targetingText || row.asin || row.ASIN || row.type || row.id);
}

function entriesFromFetched(kind, spec, fetched) {
  const latest = new Map();
  const windows = new Map();
  const fetchSummary = {};
  for (const [days, pack] of Object.entries(fetched || {})) {
    if (!pack.ok) throw new Error(`${kind} ${days}d fetch failed: ${JSON.stringify(pack).slice(0, 500)}`);
    fetchSummary[days] = {
      rowCount: pack.rows.length,
      pages: pack.pages.length,
      total: pack.pages.at(-1)?.total || pack.rows.length,
    };
    for (const row of pack.rows) {
      const id = text(row[spec.idField] || row.id || row.targetId || row.keywordId);
      if (!id) continue;
      if (!windows.has(id)) windows.set(id, {});
      windows.get(id)[days] = metric(row);
      const previous = latest.get(id);
      if (!previous || Number(days) > Number(previous.days)) latest.set(id, { days, row });
    }
  }
  const entries = [];
  for (const [id, { row }] of latest.entries()) {
    entries.push({
      kind,
      id,
      [spec.idField]: id,
      keywordText: nameForRow(kind, spec, row),
      matchType: row.matchType ?? row.match_type ?? '',
      campaignId: text(row.campaignId),
      adGroupId: text(row.adGroupId),
      accountId: num(row.accountId),
      siteId: num(row.siteId) || 4,
      campaignName: text(row.campaignName),
      groupName: text(row.groupName),
      state: row.state,
      campaignState: row.campaignState,
      groupState: row.groupState,
      bid: text(row.bid),
      updatedAt: text(row.updatedAt || row.updated_at || row.modifiedAt),
      operatedAt: text(row.operatedAt || row.operationTime || row.remarkTime),
      rawType: text(row.type || row.targetingText || row.targetText || row.asin || row.ASIN),
      windows: windows.get(id) || {},
      raw: row,
    });
  }
  return { entries, fetchSummary };
}

function classifyEntries(kind, spec, entries) {
  const adjusted = adjustmentLogByEntityType();
  const allLowSignals = [];
  const remaining = [];
  const skippedClass = {};

  for (const entry of entries) {
    const hit = lowWindowHit(entry);
    if (!hit) continue;
    const decision = decideFromPoolMembership(entry, { now: NOW, cooldownDays: COOLDOWN_DAYS });
    const logged = findAdjusted(adjusted, spec.entityType, entry.id);
    const loggedBlocksRetry = adjustmentBlocksRetry(logged);
    const sameDayBackend = sameBusinessDate(entry.updatedAt) || sameBusinessDate(entry.operatedAt);
    const nextBid = decision.actionType === 'bid'
      ? num(decision.suggestedBid || proposedBid(entry))
      : null;
    let status = 'candidate';
    if (loggedBlocksRetry) status = `already_in_adjustment_log:${logged.outcome || ''}`;
    else if (sameDayBackend) status = 'already_updated_today_backend';
    else if (decision.actionType === 'skip' || decision.actionType === 'hold') status = `decision_${decision.actionType}:${decision.reasonCode}`;
    else if (decision.actionType === 'bid' && nextBid >= num(entry.bid)) status = 'at_floor_or_no_bid_room';
    else status = 'remaining_actionable';

    const row = {
      kind,
      entityType: spec.entityType,
      id: entry.id,
      text: entry.keywordText,
      campaignName: entry.campaignName,
      groupName: entry.groupName,
      campaignId: entry.campaignId,
      adGroupId: entry.adGroupId,
      accountId: entry.accountId,
      siteId: entry.siteId,
      bid: num(entry.bid),
      proposedBid: nextBid,
      proposedAction: decision.actionType,
      updatedAt: entry.updatedAt,
      operatedAt: entry.operatedAt,
      rawType: entry.rawType,
      hit,
      decision,
      status,
      adjustment: logged ? { outcome: logged.outcome, runAt: logged.runAt, sourceRunId: logged.sourceRunId, blocksRetry: loggedBlocksRetry } : null,
      windows: entry.windows,
      entry,
    };
    allLowSignals.push(row);
    if (status === 'remaining_actionable') remaining.push(row);
    else skippedClass[status] = (skippedClass[status] || 0) + 1;
  }

  remaining.sort((a, b) => Math.max(...Object.values(b.windows).map(m => m.spend || 0)) - Math.max(...Object.values(a.windows).map(m => m.spend || 0)));
  return { allLowSignals, remaining, skippedClass };
}

function requestForCandidate(spec, candidate) {
  const raw = {
    ...(candidate.entry?.raw || {}),
    [spec.idField]: candidate.id,
    keywordText: candidate.text || candidate.entry?.raw?.keywordText,
    targetText: candidate.text || candidate.entry?.raw?.targetText,
    matchType: candidate.entry?.matchType || candidate.entry?.raw?.matchType,
    campaignId: candidate.campaignId,
    adGroupId: candidate.adGroupId,
    accountId: candidate.accountId,
    siteId: candidate.siteId,
    campaignName: candidate.campaignName,
    groupName: candidate.groupName,
    bid: candidate.bid,
  };
  const entity = normalizeLowEfficiencyRow(spec.normalizeKind, raw, {
    metrics: candidate.entry?.windows || candidate.windows || {},
  });
  const decision = {
    ...(candidate.decision || {}),
    suggestedBid: candidate.decision?.suggestedBid ?? candidate.proposedBid,
  };
  const request = buildWriterRequest(entity, decision);
  return { id: String(candidate.id), ...request };
}

function apiSuccessFor(spec, candidate, result) {
  if (Number(result?.json?.code) !== 200) return false;
  const success = result.json?.data?.success;
  if (!Array.isArray(success)) return false;
  return success.some(item => String(item[spec.idField] || item.targetId || item.keywordId || item.id || '') === String(candidate.id));
}

function executionReasonText(candidate = {}) {
  return [
    candidate.decision?.reasonCode,
    candidate.decision?.reason,
    candidate.hit?.reason,
  ].filter(Boolean).join(' ');
}

function selectExecutionCandidates(remaining = [], spec = null) {
  let selected = remaining;
  if (EXECUTE_REASON_REGEX) {
    selected = selected.filter(candidate => EXECUTE_REASON_REGEX.test(executionReasonText(candidate)));
  }
  if (spec?.entityType) {
    const adjusted = adjustmentLogByEntityType();
    selected = selected.filter(candidate => !adjustmentBlocksRetry(findAdjusted(adjusted, spec.entityType, candidate.id)));
  }
  if (EXECUTE_MAX > 0) selected = selected.slice(0, EXECUTE_MAX);
  return selected;
}

function expectedBidForCandidate(candidate = {}) {
  const value = candidate.decision?.suggestedBid ?? candidate.proposedBid;
  return value === null || value === undefined || value === '' ? null : num(value);
}

function rowPaused(row = {}) {
  const state = text(row.state ?? row.targetState ?? row.keywordState).toLowerCase();
  return state === '2' || state === 'paused' || state === 'pausing';
}

function recordsForExecutions(spec, executions, runAt, sourceRunId) {
  return executions.map(item => {
    const actionType = item.candidate.decision?.actionType === 'pause' ? 'pause' : 'bid';
    const action = {
      entityType: spec.entityType,
      actionType,
      id: item.candidate.id,
      text: item.candidate.text,
      campaignId: item.candidate.campaignId,
      adGroupId: item.candidate.adGroupId,
      currentBid: item.candidate.bid,
      reason: `[full_lower_layer_recheck:${item.candidate.decision.reasonCode}] ${item.candidate.hit.reason}; missed by today's low-efficiency pool recheck, ${actionType === 'pause' ? 'hard-stop pause' : 'bid correction'}.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
    };
    if (actionType === 'bid') action.suggestedBid = expectedBidForCandidate(item.candidate);
    return {
      sku: String(item.candidate.campaignName || '').match(/_([a-z]{2,4}\d{3,5})(?:\b|_|$)/i)?.[1]?.toUpperCase() || `lowEff::${item.candidate.kind}::${item.candidate.id}`,
      site: 'Amazon.com',
      action,
      outcome: item.ok ? 'api_success' : 'api_failed',
      dryRun: false,
      runAt,
      businessDate: BUSINESS_DATE,
      sourceRunId,
      meta: {
        campaignName: item.candidate.campaignName,
        kind: item.candidate.kind,
        source: 'full_lower_layer_low_efficiency_recheck',
        apiMessage: item.result?.json?.msg || item.result?.error || '',
      },
    };
  });
}

async function run() {
  const spec = SPECS[KIND_ARG];
  if (!spec) throw new Error(`Unknown kind "${KIND_ARG}". Use one of: ${Object.keys(SPECS).join(', ')}`);
  const scanPath = path.join(ROOT, 'data', 'snapshots', `full_low_efficiency_recheck_${KIND_ARG}_${BUSINESS_DATE}.json`);

  let scanReport = null;
  if (EXECUTE_FROM_SCAN) {
    if (!fs.existsSync(scanPath)) throw new Error(`scan file not found: ${scanPath}`);
    scanReport = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
    if (scanReport.kind !== KIND_ARG) throw new Error(`scan kind mismatch: expected ${KIND_ARG}, got ${scanReport.kind}`);
  }

  if (EXECUTE && EXECUTE_MAX <= 0 && !EXECUTE_REASON_REGEX && !ALLOW_UNCAPPED_EXECUTE) {
    throw new Error('Refusing uncapped live execution. Set LOW_EFFICIENCY_EXECUTE_MAX, LOW_EFFICIENCY_EXECUTE_REASON_REGEX, or LOW_EFFICIENCY_ALLOW_UNCAPPED_EXECUTE=1.');
  }

  let executionCandidates = scanReport ? selectExecutionCandidates(scanReport.remaining || [], spec) : [];
  if (EXECUTE_FROM_SCAN && (!EXECUTE || executionCandidates.length === 0)) {
    console.log(JSON.stringify({
      scanPath,
      kind: KIND_ARG,
      execute: EXECUTE,
      executeFromScan: EXECUTE_FROM_SCAN,
      executionCandidateCount: executionCandidates.length,
      executeMax: EXECUTE_MAX,
      executeReasonRegex: EXECUTE_REASON_REGEX_TEXT,
      totalEntities: scanReport.totalEntities,
      totalLowSignals: scanReport.totalLowSignals,
      remainingActionable: scanReport.remainingActionable,
      remainingByReason: scanReport.remainingByReason,
      skippedClass: scanReport.skippedClass,
      topRemaining: (scanReport.remaining || []).slice(0, 20).map(item => ({
        id: item.id,
        text: item.text,
        campaignName: item.campaignName,
        bid: item.bid,
        proposedBid: item.proposedBid,
        proposedAction: item.proposedAction,
        updatedAt: item.updatedAt,
        hit: item.hit.reason,
        reasonCode: item.decision.reasonCode,
      })),
      execution: null,
    }, null, 2));
    return;
  }

  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(resolve => ws.on('open', resolve));

  try {
    if (!scanReport) {
      const fetched = {};
      for (const [windowDays, range] of Object.entries(RANGES)) {
        const raw = await evalInPage(ws, browserFetchExpression(spec, { [windowDays]: range }, MAX_PAGES), true, EVAL_TIMEOUT_MS);
        Object.assign(fetched, JSON.parse(raw || '{}'));
      }
      const { entries, fetchSummary } = entriesFromFetched(KIND_ARG, spec, fetched);
      const classified = classifyEntries(KIND_ARG, spec, entries);
      const byReason = {};
      for (const item of classified.remaining) byReason[item.decision.reasonCode] = (byReason[item.decision.reasonCode] || 0) + 1;

      scanReport = {
        generatedAt: new Date().toISOString(),
        businessDate: BUSINESS_DATE,
        dataRange: { start: DATA_START, end: DATA_END },
        kind: KIND_ARG,
        spec: { label: spec.label, entityType: spec.entityType },
        fetchSummary,
        totalEntities: entries.length,
        totalLowSignals: classified.allLowSignals.length,
        remainingActionable: classified.remaining.length,
        remainingByReason: byReason,
        skippedClass: classified.skippedClass,
        remaining: classified.remaining,
        allLowSignals: classified.allLowSignals,
      };
      fs.writeFileSync(scanPath, JSON.stringify(scanReport, null, 2));
      executionCandidates = selectExecutionCandidates(scanReport.remaining || [], spec);
    }

    let executionReport = null;
    if (EXECUTE && executionCandidates.length) {
      const requests = executionCandidates.map(candidate => requestForCandidate(spec, candidate));
      const execRaw = await evalInPage(ws, browserPatchExpression(requests), true, 600000);
      const exec = JSON.parse(execRaw || '{}');
      const resultsById = new Map((exec.results || []).map(result => [String(result.id), result]));
      const executions = executionCandidates.map(candidate => {
        const result = resultsById.get(String(candidate.id)) || {};
        return { candidate, result, ok: apiSuccessFor(spec, candidate, result) };
      });
      const runAt = new Date().toISOString();
      const sourceRunId = `full_low_efficiency_recheck_${KIND_ARG}_${BUSINESS_DATE}_${Date.now()}`;
      const append = appendAdjustmentRecords(recordsForExecutions(spec, executions, runAt, sourceRunId), {
        timeContext: { runAt, businessDate: BUSINESS_DATE, sourceRunId, localTimezone: 'Asia/Shanghai' },
      });

      const verifyIds = executions.filter(item => item.ok).map(item => item.candidate.id);
      let landed = 0;
      let notLanded = [];
      let verifyRows = [];
      if (verifyIds.length) {
        const verifyRanges = { 30: RANGES[30] };
        const verifyRaw = await evalInPage(ws, browserFetchExpression(spec, verifyRanges, VERIFY_MAX_PAGES, verifyIds), true, EVAL_TIMEOUT_MS);
        const verifyFetched = JSON.parse(verifyRaw || '{}');
        verifyRows = verifyFetched['30']?.rows || [];
        const byId = new Map(verifyRows.map(row => [String(row[spec.idField] || row.targetId || row.keywordId), row]));
        for (const item of executions.filter(x => x.ok)) {
          const row = byId.get(String(item.candidate.id));
          const actionType = item.candidate.decision?.actionType === 'pause' ? 'pause' : 'bid';
          const actual = row ? num(row.bid) : null;
          const expectedBid = expectedBidForCandidate(item.candidate);
          if (actionType === 'pause' && (!row || rowPaused(row))) landed += 1;
          else if (actionType === 'bid' && row && Math.abs(actual - expectedBid) < 0.0001) landed += 1;
          else notLanded.push({
            id: item.candidate.id,
            campaignName: item.candidate.campaignName,
            actionType,
            expectedBid: actionType === 'bid' ? expectedBid : null,
            actualBid: actual,
            row: row || null,
          });
        }
      }

      executionReport = {
        executedAt: exec.executedAt,
        businessDate: BUSINESS_DATE,
        kind: KIND_ARG,
        sourceRunId,
        executeFromScan: EXECUTE_FROM_SCAN,
        executeMax: EXECUTE_MAX,
        executeReasonRegex: EXECUTE_REASON_REGEX_TEXT,
        verifyMaxPages: VERIFY_MAX_PAGES,
        availableActionable: (scanReport.remaining || []).length,
        total: executions.length,
        apiOk: executions.filter(item => item.ok).length,
        apiFailed: executions.filter(item => !item.ok).length,
        landed,
        notLandedCount: notLanded.length,
        adjustmentFile: append.file,
        adjustmentRecords: append.count,
        notLanded,
        blocked: executions.filter(item => !item.ok).map(item => ({
          id: item.candidate.id,
          campaignName: item.candidate.campaignName,
          text: item.candidate.text,
          result: item.result,
        })),
        verifyRowCount: verifyRows.length,
        executions,
      };
      const execPath = path.join(ROOT, 'data', 'snapshots', `full_low_efficiency_recheck_${KIND_ARG}_${BUSINESS_DATE}_execution.json`);
      fs.writeFileSync(execPath, JSON.stringify(executionReport, null, 2));
      executionReport.path = execPath;
    }

    console.log(JSON.stringify({
      scanPath,
      kind: KIND_ARG,
      execute: EXECUTE,
      executeFromScan: EXECUTE_FROM_SCAN,
      executionCandidateCount: executionCandidates.length,
      executeMax: EXECUTE_MAX,
      executeReasonRegex: EXECUTE_REASON_REGEX_TEXT,
      verifyMaxPages: VERIFY_MAX_PAGES,
      evalTimeoutMs: EVAL_TIMEOUT_MS,
      totalEntities: scanReport.totalEntities,
      totalLowSignals: scanReport.totalLowSignals,
      remainingActionable: scanReport.remainingActionable,
      remainingByReason: scanReport.remainingByReason,
      skippedClass: scanReport.skippedClass,
      topRemaining: scanReport.remaining.slice(0, 20).map(item => ({
        id: item.id,
        text: item.text,
        campaignName: item.campaignName,
        bid: item.bid,
        proposedBid: item.proposedBid,
        proposedAction: item.proposedAction,
        updatedAt: item.updatedAt,
        hit: item.hit.reason,
        reasonCode: item.decision.reasonCode,
      })),
      execution: executionReport && {
        path: executionReport.path,
        total: executionReport.total,
        apiOk: executionReport.apiOk,
        apiFailed: executionReport.apiFailed,
        landed: executionReport.landed,
        notLandedCount: executionReport.notLandedCount,
        adjustmentRecords: executionReport.adjustmentRecords,
        blocked: executionReport.blocked.slice(0, 10),
      },
    }, null, 2));
  } finally {
    ws.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
