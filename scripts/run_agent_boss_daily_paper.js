const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildSummary } = require('./execute/quick_daily_core_summary');
const { run: recoverDailyRawInputs } = require('./execute/recover_daily_raw_inputs');
const { buildAgentLedger } = require('../src/agent_control_plane');
const { runAgentReviewQueue } = require('./run_agent_review_queue');
const { runAgentEffectReview } = require('./run_agent_effect_review');
const { runAgentLearningMemory } = require('./run_agent_learning_memory');
const { runExternalTaskInbox } = require('./run_external_task_inbox');
const {
  buildTaskFollowupDashboard,
  renderTaskFollowupMarkdown,
} = require('../src/task_followup_dashboard');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join(ROOT, 'data', 'agent');
const DEFAULT_SKU_LESSON_DIR = path.join(ROOT, 'data', 'learning', 'sku_lessons');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const TASK_DIR = path.join(ROOT, 'data', 'tasks');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function dateOnly(value) {
  const raw = text(value);
  if (raw === 'today' || raw === '今天') return chinaDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return chinaDate();
  return date.toISOString().slice(0, 10);
}

function chinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDateFromTimestamp(value) {
  const raw = text(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return chinaDate(date);
}

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(ymd) {
  const day = new Date(`${dateOnly(ymd)}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function businessDaysEndingAt(today, count) {
  const days = [];
  let cursor = dateOnly(today);
  while (days.length < count) {
    if (isBusinessDay(cursor)) days.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function rel(file) {
  if (!file) return '';
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function money(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function int(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Math.round(Number(value)).toLocaleString('en-US');
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function signedMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return `${n >= 0 ? '+' : '-'}${money(Math.abs(n))}`;
}

function signedInt(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return `${n >= 0 ? '+' : '-'}${int(Math.abs(n))}`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  return {
    today: dateOnly(get('--today') || process.env.AGENT_TODAY || 'today'),
    agentDir: get('--agent-dir') || process.env.AGENT_DIR || DEFAULT_AGENT_DIR,
    outFile: get('--out') || process.env.AGENT_BOSS_PAPER_OUT || '',
    jsonOutFile: get('--json-out') || process.env.AGENT_BOSS_PAPER_JSON_OUT || '',
    skipTodayOps: argv.includes('--skip-today-ops') || process.env.AGENT_BOSS_PAPER_SKIP_TODAY_OPS === '1',
  };
}

function defaultPaperFile(today, agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `每日结果纸_${dateOnly(today)}.md`);
}

function defaultJsonFile(today, agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `boss_daily_paper_${dateOnly(today)}.json`);
}

function isReliableCoreSummary(summary = {}) {
  const total = summary.totalAccount || {};
  return !((summary.missing || []).includes('sales_core_summary')) &&
    num(total.sales, 0) > 0 &&
    num(total.units, 0) > 0;
}

function estimatedNetProfit(summary = {}) {
  const total = summary.totalAccount || {};
  const sales = num(total.sales, null);
  const rate = num(total.netProfitRate, null);
  return sales === null || rate === null ? null : sales * rate;
}

function invalidCoreReasons(summary = {}) {
  const reasons = [];
  const total = summary.totalAccount || {};
  if (!summary.files?.salesCore) reasons.push('sales_core file missing');
  if ((summary.missing || []).includes('sales_core_summary')) reasons.push('sales_core_summary missing');
  if (num(total.sales, 0) <= 0) reasons.push('total sales is zero or null');
  if (num(total.units, 0) <= 0) reasons.push('total units is zero or null');
  const sellers = Object.values(summary.sellers || {});
  if (sellers.length && sellers.every(row => row.sales === null || row.sales === undefined)) {
    reasons.push('seller rows are null');
  }
  if ((summary.missing || []).includes('seller_success_rate_HJ17')) {
    reasons.push('seller_success_rate_HJ17 missing');
  }
  return reasons;
}

function safeBuildSummary(date, overrides = {}) {
  if (overrides.summaryByDate?.[date]) return overrides.summaryByDate[date];
  try {
    return buildSummary({ date });
  } catch (error) {
    return {
      ok: false,
      date,
      files: {},
      missing: ['sales_core_summary'],
      totalAccount: {},
      sellers: {},
      error: error.message,
    };
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function resolveLocalChromeForTestingPath() {
  const toolsDir = path.join(ROOT, 'tools', 'chrome-for-testing');
  if (!fs.existsSync(toolsDir)) return '';
  const candidates = [];
  const stack = [toolsDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.toLowerCase() === 'chrome.exe' && /chrome-win64[\\/]chrome\.exe$/i.test(fullPath)) {
        candidates.push(fullPath);
      }
    }
  }
  candidates.sort().reverse();
  return candidates[0] || '';
}

function dailyChromeDebugEnv(options = {}) {
  const env = { AD_OPS_REQUIRE_PANEL: '1' };
  if (options.chromePath) {
    env.AD_OPS_CHROME_PATH = options.chromePath;
  } else if (!process.env.AD_OPS_CHROME_PATH) {
    const chromeForTesting = resolveLocalChromeForTestingPath();
    if (chromeForTesting) env.AD_OPS_CHROME_PATH = chromeForTesting;
  }
  return env;
}

function runCommand(command, args = [], options = {}) {
  if (typeof options.commandRunner === 'function') {
    return options.commandRunner(command, args, options);
  }
  const child = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    shell: process.platform === 'win32',
    timeout: options.commandTimeoutMs || 300000,
  });
  return {
    command: [command, ...args].join(' '),
    status: child.status,
    ok: child.status === 0,
    stdout: text(child.stdout).slice(-4000),
    stderr: text(child.stderr).slice(-4000),
    error: child.error ? child.error.message : '',
  };
}

function attemptCoreRecovery(today, initialSummary = {}, options = {}) {
  if (options.disableAutoRecovery) {
    return {
      attempted: false,
      status: 'skipped',
      reason: 'disableAutoRecovery',
    };
  }

  if (typeof options.recoverCoreData === 'function') {
    try {
      const result = options.recoverCoreData({ date: today, initialSummary, options });
      return {
        attempted: true,
        status: result?.status || (result?.summary ? 'recovered' : 'finished'),
        method: 'injected_recoverCoreData',
        result: result || {},
      };
    } catch (error) {
      return {
        attempted: true,
        status: 'failed',
        method: 'injected_recoverCoreData',
        error: error.message,
      };
    }
  }

  const chrome = runCommand(npmCommand(), ['run', 'chrome:debug'], options);
  let rawRecovery = null;
  try {
    rawRecovery = recoverDailyRawInputs({
      date: today,
      maxPages: options.maxPages || 200,
    });
  } catch (error) {
    rawRecovery = {
      ok: false,
      error: error.message,
    };
  }
  return {
    attempted: true,
    status: rawRecovery?.after?.status === 'complete' ? 'recovered' : 'failed',
    method: 'chrome_debug_plus_recover_daily_raw_inputs',
    chrome,
    rawRecovery,
  };
}

function detectDataBreak(summaries = []) {
  const invalidBeforeFirstValid = [];
  for (const item of summaries) {
    if (item.reliable) {
      return {
        breakStartDate: invalidBeforeFirstValid.length
          ? invalidBeforeFirstValid[invalidBeforeFirstValid.length - 1].date
          : '',
        latestCompleteSettlementDate: item.date,
        inspectedDates: summaries.map(row => row.date),
      };
    }
    invalidBeforeFirstValid.push(item);
  }
  return {
    breakStartDate: invalidBeforeFirstValid.length
      ? invalidBeforeFirstValid[invalidBeforeFirstValid.length - 1].date
      : '',
    latestCompleteSettlementDate: '',
    inspectedDates: summaries.map(row => row.date),
  };
}

function summarizeDate(date, options = {}) {
  const summary = safeBuildSummary(date, options);
  return {
    date,
    summary,
    reliable: isReliableCoreSummary(summary),
    estimatedNetProfit: estimatedNetProfit(summary),
    invalidReasons: invalidCoreReasons(summary),
  };
}

function buildCoreMetrics(today, options = {}) {
  const dates = Array.from({ length: options.lookbackDays || 10 }, (_, index) => addDays(today, -index));
  let summaryByDate = { ...(options.summaryByDate || {}) };
  let summaries = dates.map(date => summarizeDate(date, { ...options, summaryByDate }));
  const initialToday = summaries[0] || null;
  let recovery = { attempted: false, status: 'not_needed' };
  if (!summaries[0]?.reliable) {
    recovery = attemptCoreRecovery(today, summaries[0]?.summary || {}, options);
    if (recovery.result?.summary) {
      summaryByDate = { ...summaryByDate, [today]: recovery.result.summary };
    }
    summaries = dates.map(date => summarizeDate(date, { ...options, summaryByDate }));
    if (summaries[0]?.reliable && recovery.status !== 'recovered') {
      recovery = {
        ...recovery,
        status: 'recovered',
        note: 'core_sales_summary_is_reliable_after_recovery',
      };
    }
  }
  const dataBreak = detectDataBreak(summaries);
  const recoveryFile = recovery.attempted
    ? (options.recoveryFile || path.join(options.agentDir || DEFAULT_AGENT_DIR, `core_recovery_${today}.json`))
    : '';
  if (recoveryFile) {
    writeJson(recoveryFile, {
      today,
      generatedAt: new Date().toISOString(),
      before: {
        reliable: initialToday?.reliable === true,
        invalidReasons: initialToday?.invalidReasons || [],
        files: initialToday?.summary?.files || {},
      },
      recovery,
      after: {
        reliable: summaries[0]?.reliable === true,
        invalidReasons: summaries[0]?.invalidReasons || [],
      },
      dataBreak,
    });
  }
  const validDescending = summaries.filter(item => item.reliable);
  const latest = validDescending[0] || null;
  const previous = validDescending[1] || null;
  const trend = validDescending.slice().reverse().map(item => ({
    date: item.date,
    sales: item.summary.totalAccount?.sales ?? null,
    units: item.summary.totalAccount?.units ?? null,
    netProfitRate: item.summary.totalAccount?.netProfitRate ?? null,
    estimatedNetProfit: item.estimatedNetProfit,
    acos: item.summary.totalAccount?.acos ?? null,
  }));
  const firstTrend = trend[0] || null;
  const latestTrend = trend[trend.length - 1] || null;
  const latestTotal = latest?.summary.totalAccount || {};
  const previousTotal = previous?.summary.totalAccount || {};
  return {
    status: summaries[0]?.reliable
      ? 'ready_today'
      : (latest ? 'blocked_today_after_recovery_latest_complete_known' : 'blocked_missing_core_sales'),
    today,
    coverage: {
      dataPipeline: {
        denominator: 1,
        numerator: summaries[0]?.reliable ? 1 : 0,
        gapCount: summaries[0]?.reliable ? 0 : 1,
        gaps: summaries[0]?.reliable ? [] : [{
          item: today,
          reason: (summaries[0]?.invalidReasons || []).join('; ') || 'missing reliable sales core',
          trace: summaries[0]?.summary?.files?.salesCore || '',
        }],
      },
    },
    recovery,
    recoveryFile,
    dataBreak,
    latestValidDate: latest?.date || '',
    previousValidDate: previous?.date || '',
    todayReliability: summaries[0]?.reliable ? 'reliable' : 'not_reliable',
    todayInvalidReasons: summaries[0]?.reliable ? [] : (summaries[0]?.invalidReasons || []),
    missingDates: summaries.filter(item => !item.reliable).map(item => ({
      date: item.date,
      reasons: item.invalidReasons,
      files: item.summary.files || {},
    })),
    latest: latest ? {
      date: latest.date,
      sales: latestTotal.sales ?? null,
      units: latestTotal.units ?? null,
      netProfitRate: latestTotal.netProfitRate ?? null,
      estimatedNetProfit: latest.estimatedNetProfit,
      acos: latestTotal.acos ?? null,
      refundRate: latestTotal.refundRate ?? null,
      adCostShare: latestTotal.adCostShare ?? null,
      sourceFile: latest.summary.files?.salesCore || '',
    } : null,
    previous: previous ? {
      date: previous.date,
      sales: previousTotal.sales ?? null,
      units: previousTotal.units ?? null,
      estimatedNetProfit: previous.estimatedNetProfit,
      sourceFile: previous.summary.files?.salesCore || '',
    } : null,
    deltaVsPrevious: latest && previous ? {
      sales: num(latestTotal.sales, 0) - num(previousTotal.sales, 0),
      units: num(latestTotal.units, 0) - num(previousTotal.units, 0),
      estimatedNetProfit: num(latest.estimatedNetProfit, 0) - num(previous.estimatedNetProfit, 0),
    } : null,
    trend,
    trendDelta: firstTrend && latestTrend ? {
      startDate: firstTrend.date,
      endDate: latestTrend.date,
      sales: num(latestTrend.sales, 0) - num(firstTrend.sales, 0),
      units: num(latestTrend.units, 0) - num(firstTrend.units, 0),
      estimatedNetProfit: num(latestTrend.estimatedNetProfit, 0) - num(firstTrend.estimatedNetProfit, 0),
    } : null,
  };
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.list)) return payload.list;
  return [];
}

function adSummaryFile(day, today) {
  return path.join(SNAPSHOT_DIR, `ad_sku_summary_ALL_${day}d_${today}.json`);
}

function loadAdRows(day, today, options = {}) {
  const file = options.adSummaryFiles?.[day] || adSummaryFile(day, today);
  return {
    file,
    rows: extractRows(readJson(file, {})),
  };
}

function skuTerm(row = {}) {
  return text(row.skuInvData?.solr_term || row.term || row.season || '');
}

function classifySkuDrop(row = {}) {
  const reasons = [];
  const impressions = num(row.impressions, 0);
  const impressionsPrev = num(row.impressions_prev, 0);
  const clicks = num(row.clicks, 0);
  const clicksPrev = num(row.clicks_prev, 0);
  const orders = num(row.orders, 0);
  const ordersPrev = num(row.orders_prev, 0);
  const acos = num(row.acos, null);
  const acosPrev = num(row.acos_prev, null);
  const term = skuTerm(row);
  if (term && !/常规产品/.test(term)) reasons.push(`season_or_event=${term}`);
  if (impressionsPrev > 0 && impressions < impressionsPrev * 0.75) reasons.push('traffic_down');
  if (clicksPrev > 0 && clicks < clicksPrev * 0.75) reasons.push('clicks_down');
  if (clicks >= clicksPrev * 0.8 && orders < ordersPrev) reasons.push('conversion_down');
  if (acos !== null && acosPrev !== null && acos > acosPrev * 1.5) reasons.push('acos_worse');
  if (!reasons.length) reasons.push('sales_mix_or_price_gap');
  return reasons;
}

function buildDragSkuAttribution(today, options = {}) {
  const source = loadAdRows(7, today, options);
  const rows = source.rows;
  const candidates = rows.map(row => {
    const salesGap = num(row.sales_prev, 0) - num(row.sales, 0);
    const contributionBefore = num(row.sales_prev, 0) - num(row.cost_prev, 0);
    const contributionNow = num(row.sales, 0) - num(row.cost, 0);
    return {
      sku: text(row.sku),
      term: skuTerm(row),
      sales: num(row.sales, 0),
      salesPrev: num(row.sales_prev, 0),
      salesGap,
      orders: num(row.orders, 0),
      ordersPrev: num(row.orders_prev, 0),
      cost: num(row.cost, 0),
      costPrev: num(row.cost_prev, 0),
      acos: row.acos ?? null,
      acosPrev: row.acos_prev ?? null,
      impressions: num(row.impressions, 0),
      impressionsPrev: num(row.impressions_prev, 0),
      clicks: num(row.clicks, 0),
      clicksPrev: num(row.clicks_prev, 0),
      contributionGap: contributionBefore - contributionNow,
      reasons: classifySkuDrop(row),
    };
  }).filter(item => item.sku && item.salesGap > 0)
    .sort((a, b) => b.salesGap - a.salesGap)
    .slice(0, 5);
  return {
    sourceFile: source.file,
    topDrops: candidates,
  };
}

function countLessonFiles(dir = DEFAULT_SKU_LESSON_DIR) {
  try {
    return fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.json')).length;
  } catch (_) {
    return 0;
  }
}

function successAdjustment(row = {}) {
  return row.dryRun !== true && ['success', 'api_success'].includes(text(row.outcome).toLowerCase());
}

function metricPatchFromAdRow(row = {}) {
  return {
    impressions: num(row.impressions, 0),
    clicks: num(row.clicks, 0),
    spend: num(row.cost, 0),
    orders: num(row.orders, 0),
    sales: num(row.sales, 0),
    acos: row.acos ?? null,
  };
}

function baselinePatchFromAdRow(row = {}) {
  return {
    impressions: num(row.impressions_prev, 0),
    clicks: num(row.clicks_prev, 0),
    spend: num(row.cost_prev, 0),
    orders: num(row.orders_prev, 0),
    sales: num(row.sales_prev, 0),
    acos: row.acos_prev ?? null,
  };
}

function findLifecycleCandidate(today, options = {}) {
  const sourceDate = addDays(today, -3);
  const adjustmentFile = options.adjustmentFile || path.join(ROOT, 'data', 'adjustments', `adjustments_${sourceDate}.json`);
  const currentFile = options.lifecycleAdFile || adSummaryFile(3, today);
  const adjustments = readJson(adjustmentFile, []);
  const rows = extractRows(readJson(currentFile, {}));
  const rowBySku = new Map(rows.map(row => [text(row.sku), row]));
  const candidates = (Array.isArray(adjustments) ? adjustments : [])
    .filter(successAdjustment)
    .map(action => ({ action, row: rowBySku.get(text(action.sku)) }))
    .filter(item => item.row && num(item.row.orders, 0) > num(item.row.orders_prev, 0));
  return {
    sourceDate,
    adjustmentFile,
    currentFile,
    candidate: candidates.find(item => text(item.action.sku) === 'GT3801') || candidates[0] || null,
  };
}

function lifecycleActionFromAdjustment(found = {}, today = '') {
  const action = found.candidate?.action || {};
  const row = found.candidate?.row || {};
  const baseline = baselinePatchFromAdRow(row);
  const current = metricPatchFromAdRow(row);
  const sku = text(action.sku);
  const entityId = text(action.entityId || action.id);
  const sourceTaskId = `goal04_real_lifecycle::${sku}::${text(action.entityType)}::${entityId}`;
  const goal = {
    metric: 'orders',
    from: baseline.orders,
    to: baseline.orders + 1,
    deadlineDays: 3,
    hardFloor: 0,
  };
  return {
    sourceTaskId,
    taskId: sourceTaskId,
    sku,
    asin: text(action.asin),
    id: entityId,
    entityId,
    entityName: text(action.entityName),
    entityType: text(action.entityType),
    actionType: text(action.actionType),
    currentBid: action.actionType === 'bid' ? action.beforeValue : undefined,
    suggestedBid: action.actionType === 'bid' ? action.afterValue : undefined,
    approvedBy: text(action.approvedBy || 'codex'),
    actionSource: [...new Set([...(Array.isArray(action.actionSource) ? action.actionSource : []), 'real_adjustment_log'])],
    reason: text(action.reason),
    evidence: [
      `source_adjustment=${rel(found.adjustmentFile)}`,
      `sourceRunId=${text(action.sourceRunId)}`,
      `runAt=${text(action.runAt)}`,
      `landed_outcome=${text(action.outcome)}`,
      `current_metrics=${rel(found.currentFile)}`,
      `baseline_orders=${baseline.orders} current_orders=${current.orders}`,
      `baseline_spend=${baseline.spend} current_spend=${current.spend}`,
    ],
    goal,
    killSwitch: {
      metric: 'orders',
      condition: 'spend rises without orders by day 3',
      rollbackIf: 'spend rises without orders by day 3',
      actionType: text(action.actionType),
    },
    reviewPlan: {
      checkAfterDays: [3],
      metrics: ['orders', 'sales', 'spend', 'acos', 'clicks', 'impressions'],
      baseline,
      baselineAsOf: found.sourceDate,
      goal,
      rollbackIf: 'spend rises without orders by day 3',
    },
    rawAdjustment: {
      sourceRunId: text(action.sourceRunId),
      runAt: text(action.runAt),
      outcome: text(action.outcome),
      beforeValue: action.beforeValue ?? null,
      afterValue: action.afterValue ?? null,
    },
    _effectEvidence: {
      baseline,
      current,
      baselineAsOf: found.sourceDate,
      currentAsOf: today,
    },
  };
}

function runRealLifecycle(today, options = {}) {
  if (options.lifecycle) return options.lifecycle;
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const lessonDir = options.skuLessonDir || DEFAULT_SKU_LESSON_DIR;
  const found = findLifecycleCandidate(today, options);
  const beforeLessonCount = countLessonFiles(lessonDir);
  if (!found.candidate) {
    const artifact = {
      status: 'blocked',
      today,
      sourceDate: found.sourceDate,
      sourceAdjustmentFile: found.adjustmentFile,
      currentMetricsFile: found.currentFile,
      reason: 'no real landed action with improved current 3d orders',
    };
    const artifactFile = path.join(agentDir, `goal04_real_lifecycle_${today}.json`);
    writeJson(artifactFile, artifact);
    return { ...artifact, artifactFile };
  }

  const action = lifecycleActionFromAdjustment(found, today);
  const timeContext = {
    businessDate: found.sourceDate,
    dataDate: addDays(found.sourceDate, -1),
    runAt: action.rawAdjustment.runAt || `${found.sourceDate}T00:00:00.000Z`,
    sourceRunId: `goal04_real_lifecycle_${today}`,
  };
  const ledger = buildAgentLedger({ timeContext, actions: [action] });
  const ledgerFile = path.join(agentDir, `goal04_real_lifecycle_ledger_${today}.json`);
  writeJson(ledgerFile, ledger);

  const queueFile = path.join(agentDir, `goal04_real_lifecycle_review_queue_${today}.json`);
  const queue = runAgentReviewQueue({ ledger, outFile: queueFile, today });
  const effectFile = path.join(agentDir, `goal04_real_lifecycle_effect_review_${today}.json`);
  const evidence = {
    [action.sku]: action._effectEvidence,
  };
  const effectReview = runAgentEffectReview({
    queue,
    outFile: effectFile,
    ledgerFile,
    ledgerOutFile: ledgerFile,
    skuLessonDir: lessonDir,
    writeBack: true,
    today,
    evidence,
  });
  const memoryDate = addDays(today, 1);
  const learningMemory = runAgentLearningMemory({
    timeContext: {
      businessDate: memoryDate,
      dataDate: today,
      runAt: `${memoryDate}T00:00:00.000Z`,
      sourceRunId: `goal04_learning_memory_${today}`,
    },
    skuLessonDir: lessonDir,
    outFile: path.join(agentDir, `learning_memory_${memoryDate}.json`),
    markdownFile: path.join(agentDir, `learning_memory_${memoryDate}.md`),
  });
  const result = effectReview.results?.[0] || {};
  const artifact = {
    status: result.verdict === 'goal_met' ? 'pass' : 'needs_attention',
    today,
    sourceDate: found.sourceDate,
    sku: action.sku,
    asin: action.asin,
    sourceAdjustmentFile: found.adjustmentFile,
    currentMetricsFile: found.currentFile,
    ledgerFile,
    queueFile,
    effectReviewFile: effectFile,
    learningMemoryFile: learningMemory.files?.outFile || '',
    beforeLessonCount,
    afterLessonCount: countLessonFiles(lessonDir),
    lessonFiles: effectReview.writeBack?.skuLessonFiles || [],
    verdict: result.verdict || '',
    reasons: result.reasons || [],
    baseline: action._effectEvidence.baseline,
    current: action._effectEvidence.current,
    note: 'The source action is a real landed adjustment; GOAL-04 reconstructs the review goal from the real baseline/current window instead of claiming the original log already had a goal.',
  };
  const artifactFile = path.join(agentDir, `goal04_real_lifecycle_${today}.json`);
  writeJson(artifactFile, artifact);
  return { ...artifact, artifactFile };
}

function extractSchemaActions(schema) {
  const plan = Array.isArray(schema) ? schema : (schema?.plan || []);
  return plan.flatMap(item => (item.actions || [])
    .filter(action => text(action.actionType).toLowerCase() !== 'review')
    .map(action => ({
      ...action,
      sku: action.sku || item.sku,
      asin: action.asin || item.asin,
      sourceTaskId: action.sourceTaskId || item.boardTaskId || `${item.sku || 'schema'}::${action.id || action.entityId || action.actionType}`,
    })));
}

function hasActionGoal(action = {}) {
  return !!(action.goal || action.reviewPlan?.goal || action.meta?.expectation?.goal);
}

function isUsableJsonFile(file) {
  if (!file || !fs.existsSync(file)) return false;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 3) return false;
    JSON.parse(fs.readFileSync(file, 'utf8'));
    return true;
  } catch (_) {
    return false;
  }
}

function uniqueText(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function comparablePath(file) {
  const raw = text(file);
  return raw ? path.resolve(ROOT, raw).toLowerCase() : '';
}

function samePath(left, right) {
  const a = comparablePath(left);
  const b = comparablePath(right);
  return !!a && !!b && a === b;
}

function resolveLocalFile(file) {
  const raw = text(file);
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function localTraceExists(file) {
  const resolved = resolveLocalFile(file);
  if (!resolved || !fs.existsSync(resolved)) return false;
  const stat = fs.statSync(resolved);
  return stat.isFile() || stat.isDirectory();
}

function inferActionDateFromSchemaFile(file) {
  const match = path.basename(file || '').match(/^action_schema_(\d{4}-\d{2}-\d{2})_/);
  return match ? match[1] : '';
}

function todayOpsRunEvidence(run = {}) {
  const manifest = run?.manifest || {};
  return {
    manifestStatus: text(manifest.status),
    runId: text(manifest.runId || manifest.time?.sourceRunId || path.basename(run?.dir || '')),
    mode: text(manifest.mode),
    operationMode: text(manifest.operationMode),
  };
}

function todayOpsTaskCardFile(run = {}, options = {}) {
  const outputFiles = run?.manifest?.outputFiles || {};
  const candidates = [
    options.taskCardFile,
    outputFiles.taskCardsJson,
    outputFiles.taskCardsLatestJson,
    path.join(TASK_DIR, 'task_cards.json'),
  ].map(text).filter(Boolean);
  return candidates.find(file => isUsableJsonFile(file)) || candidates[0] || path.join(TASK_DIR, 'task_cards.json');
}

function findLatestTodayOpsRun(today, options = {}) {
  if (options.todayOpsRun) return options.todayOpsRun;
  const runsDir = path.join(SNAPSHOT_DIR, 'runs');
  if (!fs.existsSync(runsDir)) return null;
  const runs = fs.readdirSync(runsDir)
    .filter(name => name.startsWith('today_ops_'))
    .map(name => {
      const dir = path.join(runsDir, name);
      const manifestFile = path.join(dir, 'manifest.json');
      const summaryFile = path.join(dir, 'summary.json');
      const manifest = readJson(manifestFile, null) || readJson(summaryFile, null);
      if (!manifest) return null;
      const localDate = text(manifest.time?.localDate || manifest.localDate || text(manifest.runAt).slice(0, 10));
      if (localDate !== today) return null;
      const outputFiles = manifest.outputFiles || {};
      const dailySchema = outputFiles.dailyRecoveryCombinedSchemaJson || '';
      const mtimeFile = fs.existsSync(manifestFile) ? manifestFile : summaryFile;
      return {
        dir,
        manifestFile,
        summaryFile,
        manifest,
        businessDate: text(manifest.businessDate || manifest.time?.businessDate),
        localDate,
        ...todayOpsRunEvidence({ dir, manifest }),
        mtimeMs: fs.existsSync(mtimeFile) ? fs.statSync(mtimeFile).mtimeMs : 0,
        hasDailySchema: isUsableJsonFile(dailySchema),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.hasDailySchema) - Number(a.hasDailySchema) || b.mtimeMs - a.mtimeMs);
  return runs[0] || null;
}

function resolveDailyActionSchemaFile(today, options = {}) {
  if (isUsableJsonFile(options.actionSchemaFile)) return options.actionSchemaFile;
  const latestRun = findLatestTodayOpsRun(today, options);
  const runOutputFiles = latestRun?.manifest?.outputFiles || {};
  const runPreferred = [
    runOutputFiles.dailyRecoveryCombinedSchemaJson,
    runOutputFiles.proactiveRecoveryActionSchemaJson,
    runOutputFiles.seasonTitleActionSchemaJson,
  ];
  for (const file of runPreferred) {
    if (isUsableJsonFile(file)) return file;
  }

  const dates = uniqueText([
    today,
    options.actionBusinessDate,
    options.todayOps?.businessDate,
    latestRun?.businessDate,
  ]);
  const preferred = dates.flatMap(date => [
    path.join(SNAPSHOT_DIR, `action_schema_${date}_daily_recovery_combined.json`),
    path.join(SNAPSHOT_DIR, `action_schema_${date}_proactive_recovery_candidate.json`),
    path.join(SNAPSHOT_DIR, `action_schema_${date}_codex.json`),
    path.join(SNAPSHOT_DIR, `action_schema_goal02_goal_template_${date}.json`),
  ]);
  for (const file of preferred) {
    if (isUsableJsonFile(file)) return file;
  }
  const candidates = fs.existsSync(SNAPSHOT_DIR)
    ? fs.readdirSync(SNAPSHOT_DIR)
      .filter(name => dates.some(date => name.includes(date)) && /^action_schema_.*\.json$/i.test(name))
      .map(name => path.join(SNAPSHOT_DIR, name))
      .filter(isUsableJsonFile)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  return candidates[0] || '';
}

function goalIsComplete(action = {}) {
  const goal = action.goal || action.reviewPlan?.goal || action.meta?.expectation?.goal || {};
  return text(goal.metric) &&
    Number.isFinite(num(goal.from, NaN)) &&
    Number.isFinite(num(goal.to, NaN)) &&
    Number.isFinite(num(goal.deadlineDays ?? goal.deadline, NaN)) &&
    Number.isFinite(num(goal.hardFloor, NaN));
}

function classifyActionBucket(action = {}) {
  const haystack = [
    action.actionType,
    action.entityType,
    action.riskLevel,
    action.reason,
    action.hypothesis,
    action.summary,
    action.itemSummary,
    ...(Array.isArray(action.actionSource) ? action.actionSource : []),
    ...(Array.isArray(action.evidence) ? action.evidence : []),
  ].map(text).join(' ').toLowerCase();
  const actionType = text(action.actionType).toLowerCase();
  const currentBid = num(action.currentBid, null);
  const suggestedBid = num(action.suggestedBid, null);
  const currentBudget = num(action.currentBudget, null);
  const suggestedBudget = num(action.suggestedBudget, null);
  const currentPlacement = num(action.currentPlacementPercent, null);
  const suggestedPlacement = num(action.suggestedPlacementPercent, null);

  if (/\b(review|effect_review|due|checkpoint|recheck|follow[-_ ]?up|复查|到期)\b/i.test(haystack)) {
    return 'due_recheck';
  }
  if (actionType === 'pause' ||
    actionType === 'bid_down' ||
    (actionType === 'bid' && currentBid !== null && suggestedBid !== null && suggestedBid < currentBid) ||
    (actionType === 'budget' && currentBudget !== null && suggestedBudget !== null && suggestedBudget < currentBudget) ||
    /stop[_ -]?loss|bleed|waste|zero[_ -]?order|no[_ -]?order|low[_ -]?efficiency|expired[_ -]?season|high[_ -]?acos|loss|trim|pause|止损|放血|低效|无单|亏损/i.test(haystack)) {
    return 'stop_loss';
  }
  if (actionType === 'create' ||
    actionType === 'append' ||
    actionType === 'bid_up' ||
    (actionType === 'bid' && currentBid !== null && suggestedBid !== null && suggestedBid > currentBid) ||
    (actionType === 'budget' && currentBudget !== null && suggestedBudget !== null && suggestedBudget > currentBudget) ||
    (actionType === 'placement' && currentPlacement !== null && suggestedPlacement !== null && suggestedPlacement > currentPlacement) ||
    /scale|recovery|launch|high[_ -]?efficiency|controlled[_ -]?budget[_ -]?up|opportunity|open[_ -]?source|加投|放量|开源|恢复|新品/i.test(haystack)) {
    return 'open_source';
  }
  return 'other';
}

function countActionBuckets(actions = [], queue = {}) {
  const counts = actions.reduce((acc, action) => {
    const bucket = classifyActionBucket(action);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
  counts.due_recheck = (counts.due_recheck || 0) + Number(queue.summary?.due || 0);
  return {
    stopLoss: counts.stop_loss || 0,
    openSource: counts.open_source || 0,
    dueRecheck: counts.due_recheck || 0,
    other: counts.other || 0,
  };
}

function runFullActionClosure(today, options = {}) {
  if (options.actionClosure) return options.actionClosure;
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const schemaFile = resolveDailyActionSchemaFile(today, options);
  const actionBusinessDate = text(options.actionBusinessDate || options.todayOps?.businessDate || inferActionDateFromSchemaFile(schemaFile) || today);
  const schema = readJson(schemaFile, []);
  const actions = extractSchemaActions(schema);
  const ledger = buildAgentLedger({
    timeContext: {
      businessDate: actionBusinessDate,
      dataDate: actionBusinessDate,
      runAt: `${today}T00:00:00.000Z`,
      sourceRunId: `goal04_full_action_closure_${today}`,
    },
    actions,
  });
  const ledgerFile = path.join(agentDir, `agent_ledger_${today}.json`);
  writeJson(ledgerFile, ledger);
  const queueFile = path.join(agentDir, `review_queue_${today}.json`);
  const queue = runAgentReviewQueue({ ledger, outFile: queueFile, today });
  const reviewTaskActionIds = new Set(ledger.reviewTasks.map(task => text(task.reviewOf?.sourceTaskId)));
  const actionsWithoutReview = actions.filter(action => !reviewTaskActionIds.has(text(action.sourceTaskId)));
  const incompleteGoalActions = actions.filter(action => !goalIsComplete(action));
  const actionBuckets = countActionBuckets(actions, queue);
  const artifact = {
    status: actions.length > 0 &&
      actions.every(goalIsComplete) &&
      actionsWithoutReview.length === 0 &&
      ledger.summary.actionCount === actions.length
      ? 'pass'
      : 'needs_attention',
    today,
    actionBusinessDate,
    schemaFile,
    ledgerFile,
    queueFile,
    schemaItems: Array.isArray(schema) ? schema.length : (schema?.plan?.length || 0),
    executableActions: actions.length,
    executableWithGoal: actions.filter(hasActionGoal).length,
    executableWithCompleteGoal: actions.filter(goalIsComplete).length,
    executableMissingGoal: actions.filter(action => !hasActionGoal(action)).length,
    executableIncompleteGoal: incompleteGoalActions.length,
    ledgerActionCount: ledger.summary.actionCount,
    reviewTaskCount: ledger.summary.reviewTaskCount,
    actionBuckets,
    coverage: {
      denominator: actions.length,
      numerator: actions.filter(action => goalIsComplete(action) && reviewTaskActionIds.has(text(action.sourceTaskId))).length,
      gapCount: uniqueStrings([
        ...actionsWithoutReview.map(action => text(action.sourceTaskId || action.taskId || action.id || action.entityId)),
        ...incompleteGoalActions.map(action => text(action.sourceTaskId || action.taskId || action.id || action.entityId)),
      ]).length,
      gaps: [
        ...actionsWithoutReview.map(action => ({
          item: text(action.sku || action.id || action.entityId),
          reason: 'missing_review_task',
        })),
        ...incompleteGoalActions.map(action => ({
          item: text(action.sku || action.id || action.entityId),
          reason: 'missing_complete_goal',
        })),
      ],
    },
    dueToday: queue.summary?.due || 0,
    upcoming: queue.summary?.upcoming || 0,
    actionsWithoutReview: actionsWithoutReview.map(action => ({
      sku: action.sku,
      id: action.id || action.entityId,
      actionType: action.actionType,
      entityType: action.entityType,
    })),
    incompleteGoalActions: incompleteGoalActions.map(action => ({
      sku: action.sku,
      id: action.id || action.entityId,
      actionType: action.actionType,
      entityType: action.entityType,
      goal: action.goal || action.reviewPlan?.goal || null,
    })),
    authorization: ledger.summary.authorization,
  };
  const artifactFile = path.join(agentDir, `goal04_full_action_closure_counts_${today}.json`);
  writeJson(artifactFile, artifact);
  return { ...artifact, artifactFile };
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function skuFromText(value = '') {
  const match = text(value).match(/(?:^|[^A-Z0-9])([A-Z]{2,6}\d{3,5}[A-Z0-9-]*)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function skuFromAdRow(row = {}) {
  return text(row.sku || row.skuCode || row.skuInvData?.sku || skuFromText([
    row.campaignName,
    row.groupName,
    row.adGroupName,
    row.entityName,
  ].map(text).join(' '))).toUpperCase();
}

function cnaKeywordRowsForSku(keywordEvidence = {}, sku = '') {
  const targetSku = text(sku).toUpperCase();
  if (!targetSku) return [];
  return extractRows(keywordEvidence.rawCnaRows || keywordEvidence.rows || [])
    .filter(row => skuFromAdRow(row) === targetSku);
}

function sourceCnaWeekRow(rows = []) {
  return rows.find(row => text(row.keywordText).toLowerCase() === 'cna week gifts') || null;
}

function metricIsBlank(value) {
  return value === null || value === undefined || value === '';
}

function metricPatchFromKeywordRow(row = {}) {
  return {
    impressions: row.Impressions ?? row.impressions ?? null,
    clicks: row.Clicks ?? row.clicks ?? null,
    spend: row.Spend ?? row.spend ?? row.cost ?? null,
    orders: row.Orders ?? row.orders ?? null,
    sales: row.Sales ?? row.sales ?? null,
    cpc: row.CPC ?? row.cpc ?? null,
    acos: row.ACOS ?? row.acos ?? null,
  };
}

function externalFollowupsDueToday(tasks = [], today = '') {
  return tasks.flatMap(task => {
    const checkpoints = task.reviewPlan?.checkpoints || [];
    const skus = uniqueStrings(task.reviewPlan?.subjectSkus || [task.subject?.sku]);
    const subjects = skus.length ? skus : [''];
    return checkpoints
      .filter(checkpoint => checkpoint.date === today)
      .flatMap(checkpoint => subjects.map(sku => ({
        taskId: [task.taskId, sku, checkpoint.date].filter(Boolean).join('::'),
        sourceTaskId: task.taskId,
        title: task.title,
        sku: sku || task.subject?.sku || '',
        keyword: task.subject?.keyword || '',
        checkpoint,
        sourceFile: task.attachments?.[0] || '',
        subjectSkus: task.reviewPlan?.subjectSkus || [],
        rawInput: task.rawInput || '',
      })));
  });
}

function summarizeUanCnaFollowup(today, followup = {}) {
  const haystack = [followup.title, followup.rawInput, followup.keyword, ...(followup.subjectSkus || [])]
    .map(text)
    .join(' ')
    .toLowerCase();
  if (!haystack.includes('uan') || !haystack.includes('cna')) return null;

  const sku = text(followup.sku || followup.subject?.sku || '').toUpperCase();
  const keywordFile = path.join(SNAPSHOT_DIR, `developer_request_followup_uan0188_cna_keywords_${today}.json`);
  const perSkuKeywordFile = sku ? path.join(SNAPSHOT_DIR, `developer_request_followup_${sku}_cna_keywords_${today}.json`) : '';
  const productFile = path.join(SNAPSHOT_DIR, `uan_cna_review_${sku || 'UAN0188'}_${today}.json`);
  const currentGroupFile = path.join(SNAPSHOT_DIR, 'current_UAN0188_cna_expansion_group_final_2026-05-29.json');
  const keywordEvidence = readJson(keywordFile, {});
  const perSkuKeywordEvidence = readJson(perSkuKeywordFile, {});
  const currentGroup = readJson(currentGroupFile, {});
  const combinedRows = cnaKeywordRowsForSku(keywordEvidence, sku);
  const perSkuRows = extractRows(perSkuKeywordEvidence.targetRows || perSkuKeywordEvidence.rawCnaRows || perSkuKeywordEvidence.rows || []);
  const targetRows = combinedRows.length ? combinedRows : perSkuRows.filter(row => {
    const rowSku = skuFromAdRow(row);
    return !rowSku || rowSku === sku;
  });
  const sourceKeyword = sourceCnaWeekRow(targetRows) || (sku === 'UAN0188' ? keywordEvidence.sourceKeyword || {} : {});
  const hasLiveSourceRow = !!sourceCnaWeekRow(targetRows) || (sku === 'UAN0188' && !!keywordEvidence.sourceKeyword);
  const hasLiveAdGroupPull = targetRows.length > 0 || perSkuRows.length > 0;
  const trace = fs.existsSync(perSkuKeywordFile)
    ? perSkuKeywordFile
    : (fs.existsSync(keywordFile) ? keywordFile : (fs.existsSync(productFile) ? productFile : followup.sourceFile));
  if (!hasLiveSourceRow) {
    if (hasLiveAdGroupPull) {
      return {
        status: 'red',
        liveChecked: true,
        sku,
        label: `${sku || 'UAN'} CNA 3d effect review`,
        trace,
        detail: `checkpoint=${today} ${followup.checkpoint?.description || '3d effect review'}; cna week gifts row missing after live ad-group pull for ${sku || 'unknown SKU'}`,
      };
    }
    return {
      status: 'gap',
      liveChecked: false,
      gapReason: 'missing_live_keyword_row',
      label: `${sku || 'UAN'} CNA 3d effect review`,
      trace,
      detail: `checkpoint=${today} ${followup.checkpoint?.description || '3d effect review'}; missing live cna week gifts row for ${sku || 'unknown SKU'}`,
    };
  }
  const extras = uniqueStrings([
    ...targetRows
      .filter(row => /cna/i.test(text(row.keywordText)) && text(row.keywordText).toLowerCase() !== 'cna week gifts')
      .map(row => row.keywordText),
    ...(sku === 'UAN0188' ? keywordEvidence.findings?.extraCnaKeywordTexts || [] : []),
    ...((currentGroup.targetRows || [])
      .filter(row => /cna/i.test(text(row.keywordText)) && text(row.keywordText).toLowerCase() !== 'cna week gifts')
      .map(row => row.keywordText)),
  ]);
  const metricsAllNull = ['Impressions', 'Clicks', 'Orders'].every(field => metricIsBlank(sourceKeyword[field]));
  const expectedBid = keywordEvidence.findings?.expectedBid ?? 0.25;
  const actualBid = sourceKeyword.bid === undefined
    ? (sku === 'UAN0188' ? keywordEvidence.findings?.actualBid ?? null : null)
    : num(sourceKeyword.bid, null);
  const bidMismatch = actualBid !== null && Number(actualBid) !== Number(expectedBid);
  const needsAttention = metricsAllNull || bidMismatch || extras.length > 0;
  const metrics = metricPatchFromKeywordRow(sourceKeyword);
  return {
    status: needsAttention ? 'red' : 'watch',
    liveChecked: true,
    sku,
    label: `${sku || 'UAN'} CNA 3d effect review`,
    trace,
    metrics,
    detail: [
      `checkpoint=${today} ${followup.checkpoint?.description || '3d effect review'}`,
      `cna week gifts ${keywordEvidence.request?.dateRange?.join('..') || 'window'} Impressions/Clicks/Orders=${metricsAllNull ? 'all_null' : 'has_activity'}`,
      actualBid !== null ? `bid ${expectedBid}->${actualBid}` : '',
      extras.length ? `extra=${extras.slice(0, 3).join(', ')}` : '',
    ].filter(Boolean).join('; '),
  };
}

function buildFollowupCoverage(items = []) {
  const gaps = items
    .filter(item => item.evidence?.liveChecked !== true)
    .map(item => ({
      sku: item.sku || item.evidence?.sku || '',
      reason: item.evidence?.gapReason || 'missing_live_evidence',
      trace: item.evidence?.trace || item.sourceFile || '',
    }));
  return {
    denominator: items.length,
    numerator: items.length - gaps.length,
    gapCount: gaps.length,
    gaps,
    status: gaps.length ? 'needs_attention' : 'pass',
  };
}

function buildExternalFollowupEvidence(today, followups = [], options = {}) {
  const items = followups.map(followup => {
    const uanCna = summarizeUanCnaFollowup(today, followup);
    return {
      ...followup,
      status: uanCna?.status || 'due',
      evidence: uanCna || {
        status: 'due',
        label: followup.title || followup.sku || 'external follow-up',
        detail: `checkpoint=${today} ${followup.checkpoint?.description || ''}`.trim(),
        trace: followup.sourceFile,
      },
    };
  });
  const coverage = buildFollowupCoverage(items);
  const outFile = options.outFile || path.join(options.agentDir || DEFAULT_AGENT_DIR, `external_due_followups_${today}.json`);
  writeJson(outFile, {
    today,
    generatedAt: new Date().toISOString(),
    count: items.length,
    coverage,
    items,
  });
  return { items, outFile, coverage };
}

function runExternalLine(today, options = {}) {
  if (options.externalLine) return options.externalLine;
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const inputDir = options.externalInputDir || path.join(ROOT, 'data', 'developer_requests');
  const outFile = path.join(agentDir, `external_inbox_${today}.json`);
  const inbox = runExternalTaskInbox({
    inputDir,
    outFile,
    timeContext: {
      businessDate: today,
      dataDate: today,
      runAt: `${today}T00:00:00.000Z`,
      sourceRunId: `goal04_external_inbox_${today}`,
    },
  });
  const ledger = buildAgentLedger({
    timeContext: {
      businessDate: today,
      dataDate: today,
      runAt: `${today}T00:00:00.000Z`,
      sourceRunId: `goal04_external_ledger_${today}`,
    },
    tasks: inbox.tasks || [],
  });
  const ledgerFile = path.join(agentDir, `external_ledger_${today}.json`);
  writeJson(ledgerFile, ledger);
  const queueFile = path.join(agentDir, `external_review_queue_${today}.json`);
  const queue = runAgentReviewQueue({ ledger, outFile: queueFile, today });
  const todayDueFollowups = externalFollowupsDueToday(inbox.tasks || [], today);
  const dueFollowupEvidence = buildExternalFollowupEvidence(today, todayDueFollowups, {
    ...options,
    agentDir,
  });
  return {
    status: inbox.summary?.total > 0 ? 'pass' : 'needs_attention',
    sourceDir: inputDir,
    outFile,
    ledgerFile,
    queueFile,
    dueFollowupFile: dueFollowupEvidence.outFile,
    total: inbox.summary?.total || 0,
    byKind: inbox.summary?.byKind || {},
    byPriority: inbox.summary?.byPriority || {},
    dueToday: queue.summary?.due || 0,
    upcoming: queue.summary?.upcoming || 0,
    todayDueFollowups: dueFollowupEvidence.items,
    todayDueFollowupsCount: dueFollowupEvidence.coverage.denominator,
    todayDueFollowupsCovered: dueFollowupEvidence.coverage.numerator,
    todayDueFollowupGaps: dueFollowupEvidence.coverage.gaps,
    coverage: {
      dueFollowups: dueFollowupEvidence.coverage,
      inbox: {
        denominator: inbox.summary?.total || 0,
        numerator: inbox.summary?.total || 0,
        gapCount: 0,
        gaps: [],
      },
    },
    topTasks: (inbox.tasks || []).slice(0, 5).map(task => ({
      sku: task.subject?.sku || '',
      asin: task.subject?.asin || '',
      keyword: task.subject?.keyword || '',
      kind: task.kind,
      priority: task.priority,
      title: task.title,
    })),
  };
}

function flattenTaskCards(payload = {}) {
  const layers = payload.layers || {};
  return Object.entries(layers).flatMap(([layer, items]) => (Array.isArray(items) ? items : []).map(item => ({ ...item, layer })));
}

function buildSystemLine(today, options = {}) {
  if (options.systemLine) return options.systemLine;
  const file = options.taskCardFile || path.join(TASK_DIR, 'task_cards.json');
  const payload = readJson(file, {});
  const cards = flattenTaskCards(payload);
  const p0 = cards.filter(card => card.priority === 'P0' || card.layer === 'P0');
  const summary = payload.summary?.P0 || {
    count: p0.length,
    executable: p0.filter(card => card.boardExecutableHint).length,
    reviewRequired: p0.filter(card => !card.boardExecutableHint).length,
  };
  const classified = Number(summary.executable || 0) + Number(summary.reviewRequired || 0);
  const gapCount = Math.max(0, Number(summary.count || 0) - classified);
  return {
    status: p0.length ? 'pass' : 'needs_attention',
    sourceFile: file,
    summary,
    coverage: {
      denominator: Number(summary.count || 0),
      numerator: Math.min(Number(summary.count || 0), classified),
      gapCount,
      gaps: gapCount ? [{ item: 'P0 task cards', reason: 'summary_count_exceeds_classified_tasks', trace: file }] : [],
    },
    topTasks: p0.slice(0, 5).map(card => ({
      sku: card.sku,
      asin: card.asin,
      type: card.primaryTaskType,
      decision: card.decisionSummary,
      evidence: card.keyEvidence || {},
      executable: !!card.boardExecutableHint,
    })),
  };
}

function buildSeasonLine(today, options = {}) {
  if (options.seasonLine) return options.seasonLine;
  const source = loadAdRows(7, today, options);
  const rowBySku = new Map(source.rows.map(row => [text(row.sku), row]));
  const listingTaskFile = path.join(TASK_DIR, 'lay2384_250th_independence_title_2026-05-28.json');
  const wanted = [
    { sku: 'GUF3129', lane: 'Independence Day / patriotic', expectation: 'keep validated lane alive' },
    { sku: 'LAY2384', lane: 'Patriotic / 250th direction correction', expectation: 'listing direction and ad lane must be reconciled' },
    { sku: 'ZHW0104', lane: "Father's Day preheat", expectation: 'do not confuse event identity; watch no-order spend' },
  ];
  const missing = wanted.filter(item => !rowBySku.has(item.sku));
  return {
    status: missing.length ? 'needs_attention' : 'pass',
    sourceFile: source.file,
    listingTaskFile: fs.existsSync(listingTaskFile) ? listingTaskFile : '',
    coverage: {
      denominator: wanted.length,
      numerator: wanted.length - missing.length,
      gapCount: missing.length,
      gaps: missing.map(item => ({ item: item.sku, reason: 'missing_ad_summary_row', trace: source.file })),
    },
    items: wanted.map(item => {
      const row = rowBySku.get(item.sku) || {};
      return {
        sku: item.sku,
        lane: item.lane,
        expectation: item.expectation,
        term: skuTerm(row),
        impressions: num(row.impressions, 0),
        impressionsPrev: num(row.impressions_prev, 0),
        clicks: num(row.clicks, 0),
        clicksPrev: num(row.clicks_prev, 0),
        cost: num(row.cost, 0),
        costPrev: num(row.cost_prev, 0),
        orders: num(row.orders, 0),
        ordersPrev: num(row.orders_prev, 0),
        sales: num(row.sales, 0),
        salesPrev: num(row.sales_prev, 0),
        acos: row.acos ?? null,
        acosPrev: row.acos_prev ?? null,
      };
    }),
  };
}

function buildRedLights(report) {
  const redLights = [];
  const core = report.coreMetrics || {};
  if (core.todayReliability !== 'reliable') {
    redLights.push({
      title: `${core.today} 今日销售核心重抓后仍不可用`,
      detail: [
        (core.todayInvalidReasons || []).join('; ') || 'missing reliable sales core',
        core.recovery?.attempted ? `recovery=${core.recovery.status}` : 'recovery=not_attempted',
        core.dataBreak?.breakStartDate ? `断点起始=${core.dataBreak.breakStartDate}` : '',
        core.dataBreak?.latestCompleteSettlementDate ? `最新完整结算日=${core.dataBreak.latestCompleteSettlementDate}` : '',
      ].filter(Boolean).join('; '),
      trace: core.recoveryFile || (core.missingDates || [])[0]?.files?.salesCore || '',
    });
  }
  if (core.trendDelta && core.trendDelta.sales < 0) {
    redLights.push({
      title: `可信总盘 ${core.trendDelta.startDate} 到 ${core.trendDelta.endDate} 下滑`,
      detail: `sales ${signedMoney(core.trendDelta.sales)}, units ${signedInt(core.trendDelta.units)}, estNetProfit ${signedMoney(core.trendDelta.estimatedNetProfit)}`,
      trace: core.latest?.sourceFile || '',
    });
  }
  const lay = (report.lines?.season?.items || []).find(item => item.sku === 'LAY2384');
  if (lay && lay.orders < lay.ordersPrev) {
    redLights.push({
      title: 'LAY2384 节日身份和投放窗口不闭环',
      detail: `term=${lay.term}; orders ${lay.ordersPrev}->${lay.orders}; ACOS ${pct(lay.acos)}`,
      trace: report.lines?.season?.listingTaskFile || report.lines?.season?.sourceFile,
    });
  }
  const externalReds = (report.lines?.external?.todayDueFollowups || [])
    .map(item => item.evidence)
    .filter(item => ['red', 'gap'].includes(item?.status));
  if (externalReds.length) {
    redLights.push({
      title: `开发诉求到期复查红灯 ${externalReds.length} 条`,
      detail: externalReds.slice(0, 5)
        .map(item => `${item.label}: ${item.detail}`)
        .join('；'),
      trace: report.lines?.external?.dueFollowupFile || externalReds[0]?.trace || '',
    });
  }
  const firstDrop = report.attribution?.topDrops?.[0];
  if (firstDrop) {
    redLights.push({
      title: `${firstDrop.sku} 是 7d 销售拖累前排`,
      detail: `sales ${money(firstDrop.salesPrev)}->${money(firstDrop.sales)}, gap ${money(firstDrop.salesGap)}; ${firstDrop.reasons.join(', ')}`,
      trace: report.attribution.sourceFile,
    });
  }
  if (report.lifecycle?.status !== 'pass') {
    redLights.push({
      title: '真实动作生命周期闭环未通过',
      detail: report.lifecycle?.reason || report.lifecycle?.verdict || 'missing real lifecycle proof',
      trace: report.lifecycle?.artifactFile || '',
    });
  }
  if (report.todayOps?.status === 'failed') {
    redLights.push({
      title: 'ops:today dry-run 未跑通',
      detail: text(report.todayOps?.result?.error || report.todayOps?.result?.stderr || 'today ops command failed'),
      trace: report.todayOps?.outFile || '',
    });
  }
  return redLights.slice(0, 5);
}

function validateBossPaperGuard(input = {}) {
  const outFile = text(input.outFile);
  const content = text(input.content);
  const evidenceFiles = input.evidenceFiles || [];
  const failures = [];
  const basename = path.basename(outFile);
  if (basename === '每日结果纸_.md' || basename === '姣忔棩缁撴灉绾竉.md') failures.push('empty_date_boss_paper_filename');
  if (outFile && !/\d{4}-\d{2}-\d{2}/.test(basename)) failures.push('boss_paper_filename_missing_date');
  if (/PASS\s|闭环证明|闂幆璇佹槑|goal02_stage/i.test(content)) failures.push('acceptance_report_content');
  if (/LC1001|synthetic|fake_sku/i.test(content)) failures.push('synthetic_lifecycle_content');
  if (/<date>|<SKU>|YYYY-MM-DD/i.test(content)) failures.push('placeholder_content');
  if (!/GOAL-FINAL/.test(content)) failures.push('missing_goal_final_section');
  if (!/(?:分母|鍒嗘瘝)/.test(content) || !/(?:分子|鍒嗗瓙)/.test(content) || !/(?:缺口|缂哄彛)/.test(content)) {
    failures.push('missing_coverage_triplet_text');
  }
  if (!/(?:连续达标|杩炵画杈炬爣)/.test(content)) failures.push('missing_goal_final_continuity_text');
  if (!/(?:当日执行 live 文件|褰撴棩鎵ц live 鏂囦欢)/.test(content)) failures.push('missing_today_ops_live_section');
  if (!/(?:到期复查 live 文件|鍒版湡澶嶆煡 live 鏂囦欢)/.test(content)) failures.push('missing_due_followup_live_section');
  const requiredLinePatterns = [
    /(?:数据管道|鏁版嵁绠￠亾)/,
    /(?:全量动作|鍏ㄩ噺鍔ㄤ綔)/,
    /(?:开发诉求|寮€鍙戣瘔姹)/,
    /(?:系统P0|绯荤粺P0)/,
    /(?:节日|事件|鑺傛棩|浜嬩欢)/,
  ];
  if (!requiredLinePatterns.every(pattern => pattern.test(content))) failures.push('missing_known_line_coverage_text');
  for (const file of evidenceFiles) {
    const normalized = text(file).replace(/\\/g, '/');
    if (/goal02_lifecycle|goal02_stage6|goal02_stage|(?:^|\/)(?:temp|tmp)(?:\/|$)/i.test(normalized)) {
      failures.push(`invalid_evidence_path:${normalized}`);
    }
  }
  return {
    status: failures.length ? 'fail' : 'pass',
    failures,
  };
}

function buildVerification(report = {}, guard = {}) {
  const actionClosure = report.actionClosure || {};
  const lines = report.lines || {};
  const core = report.coreMetrics || {};
  const dueFollowups = Array.isArray(lines.external?.todayDueFollowups) ? lines.external.todayDueFollowups : [];
  const dueFollowupCoverage = lines.external?.coverage?.dueFollowups || {};
  const rawDueFollowupCount = Number(dueFollowupCoverage.denominator ?? lines.external?.todayDueFollowupsCount ?? 0);
  const dueFollowupCount = Number.isFinite(rawDueFollowupCount) ? rawDueFollowupCount : 0;
  const dueFollowupsRequired = dueFollowupCount > 0 || dueFollowups.length > 0;
  const dueFollowupsTraced = !dueFollowupsRequired || (
    dueFollowups.length === dueFollowupCount &&
    dueFollowups.every(item => text(item.checkpoint?.date) &&
      text(item.evidence?.status) &&
      text(item.evidence?.label) &&
      text(item.evidence?.detail) &&
      text(item.evidence?.trace))
  );
  const dueFollowupsLivePerObject = !dueFollowupsRequired || (
    dueFollowups.length === dueFollowupCount &&
    dueFollowups.every(item => dueFollowupLiveTraceReady(item, text(report.today)))
  );
  const coverageTriplets = goalFinalCoverageTriplets(report);
  const coverageItems = Object.values(coverageTriplets).filter(Boolean);
  const coverageSelfCertified = Object.keys(coverageTriplets).length >= 5 &&
    Object.values(coverageTriplets).every(item => validCoverageTriplet(item || {}));
  const unreasonableGapPattern = /missing_live_evidence|missing_live_keyword_row|summary_count_exceeds_classified_tasks|missing_ad_summary_row|missing reliable sales core/i;
  const noUnreasonableCoverageGaps = coverageItems.every(item =>
    coverageGapsExplained(item) &&
    !((item.gaps || []).some(gap => unreasonableGapPattern.test(text(gap.reason)))));
  const goalFinalEvidence = report.goalFinalEvidence || buildGoalFinalEvidence(report);
  const denominatorEvidenceReady = goalFinalDenominatorEvidenceReady(goalFinalEvidence, report);
  const todayOpsReady = todayOpsGoalFinalReady(report);
  const result = {
    P1_today_real_or_recovered: core.todayReliability === 'reliable' &&
      (!core.recovery?.attempted || core.recovery.status === 'recovered') &&
      !!core.latest?.sourceFile,
    P1_recovery_attempted_before_red_light: core.todayReliability === 'reliable' ||
      (core.recovery?.attempted === true &&
        !!core.dataBreak?.breakStartDate &&
        !!core.dataBreak?.latestCompleteSettlementDate),
    P1_today_ops_ran_or_ready: todayOpsReady,
    P2_actions_goal_ledger_aligned: actionClosure.status === 'pass' &&
      report.todayOps?.status !== 'failed' &&
      actionClosure.executableActions === actionClosure.executableWithCompleteGoal &&
      actionClosure.executableActions === actionClosure.ledgerActionCount &&
      (actionClosure.actionBuckets?.stopLoss || 0) >= 0 &&
      (actionClosure.actionBuckets?.openSource || 0) >= 0 &&
      (actionClosure.actionBuckets?.dueRecheck || 0) >= 0,
    P3_three_lines_present: (lines.external?.total || 0) > 0 &&
      (lines.systemP0?.summary?.count || 0) > 0 &&
      (lines.season?.items || []).filter(item => text(item.sku)).length >= 3,
    P3_developer_due_followups_triggered: dueFollowupsTraced,
    P3_developer_due_followups_each_object_live_trace: dueFollowupsLivePerObject,
    P3_goal_final_coverage_triplets_present: coverageSelfCertified,
    P3_goal_final_denominator_evidence_present: denominatorEvidenceReady,
    P3_goal_final_no_unreasonable_coverage_gaps: noUnreasonableCoverageGaps,
    P4_trend_and_attribution: !!core.latest?.sourceFile &&
      !!core.previous?.sourceFile &&
      !!core.trendDelta?.startDate &&
      (report.attribution?.topDrops || []).every(item => text(item.sku) && (item.reasons || []).length),
    P5_real_lifecycle_lesson_readback: report.lifecycle?.status === 'pass' &&
      !!text(report.lifecycle?.sku) &&
      (report.lifecycle?.lessonFiles || []).some(file => /data[\\/]+learning[\\/]+sku_lessons/i.test(text(file))) &&
      !!text(report.lifecycle?.learningMemoryFile),
    P6_red_lights_limited_and_traced: (report.redLights || []).length <= 5 &&
      (report.redLights || []).every(item => text(item.trace)),
    guard_rejects_synthetic_or_placeholder: guard.status === 'pass',
    C_all_actions_have_goals_and_reviews: actionClosure.status === 'pass' &&
      actionClosure.executableActions === actionClosure.executableWithGoal &&
      actionClosure.actionsWithoutReview?.length === 0,
    D_three_lines_present: (lines.external?.total || 0) > 0 &&
      (lines.systemP0?.summary?.count || 0) > 0 &&
      (lines.season?.items || []).length >= 3,
    F_today_entrypoint_ran: !!report.files?.paperFile && !!report.files?.jsonFile,
  };
  delete result.C_all_actions_have_goals_and_reviews;
  delete result.D_three_lines_present;
  delete result.A_real_lifecycle;
  return {
    status: Object.values(result).every(Boolean) ? 'pass' : 'needs_attention',
    checks: result,
  };
}

function readBossPaperForDate(agentDir = DEFAULT_AGENT_DIR, date = '') {
  return readJson(path.join(agentDir, `boss_daily_paper_${date}.json`), null);
}

function metricSummary(metrics = {}) {
  const fields = [
    ['impressions', 'imp'],
    ['clicks', 'clk'],
    ['orders', 'ord'],
    ['spend', 'spend'],
    ['sales', 'sales'],
    ['cpc', 'cpc'],
    ['acos', 'acos'],
  ];
  const parts = fields
    .filter(([key]) => metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== '')
    .map(([key, label]) => `${label}=${metrics[key]}`);
  return parts.length ? parts.join(',') : 'no_metric_row';
}

function liveTraceDigest(trace, sku = '') {
  const liveFile = resolveLocalFile(trace);
  if (!isUsableJsonFile(liveFile)) {
    return { ok: false, reason: 'missing_or_invalid_trace' };
  }
  const live = readJson(liveFile, {});
  return {
    ok: live.ok === true,
    exportedAt: live.exportedAt || live.generatedAt || live.runAt || '',
    localDate: localDateFromTimestamp(live.exportedAt || live.generatedAt || live.runAt),
    dateRange: Array.isArray(live.dateRange) ? live.dateRange.join('..') : '',
    targetRowCount: Number(live.targetRowCount ?? live.allTargetRowCount ?? (Array.isArray(live.targetRows) ? live.targetRows.length : NaN)),
    customerSearchRowCount: Number(live.customerSearchRowCount ?? (Array.isArray(live.customerSearchRows) ? live.customerSearchRows.length : NaN)),
    source: [
      live.source?.targetRows,
      live.source?.customerSearchTerms,
      live.source?.endpoint,
    ].map(text).filter(Boolean).join('+') || text(live.source),
    skuMatch: liveTraceContainsSku(live, sku),
  };
}

function liveTraceDigestSummary(digest = {}) {
  if (digest.ok !== true) return `traceDigest=${digest.reason || 'not_ready'}`;
  return [
    `exportedAt=${digest.exportedAt || '-'}`,
    `localDate=${digest.localDate || '-'}`,
    `dateRange=${digest.dateRange || '-'}`,
    `targetRows=${Number.isFinite(digest.targetRowCount) ? digest.targetRowCount : '-'}`,
    `searchRows=${Number.isFinite(digest.customerSearchRowCount) ? digest.customerSearchRowCount : '-'}`,
    `skuMatch=${digest.skuMatch ? 'true' : 'false'}`,
    `source=${digest.source || '-'}`,
  ].join(',');
}

function liveTraceContainsSku(live = {}, sku = '') {
  const needle = text(sku).toUpperCase();
  if (!needle) return true;
  return JSON.stringify([
    live.sku,
    live.campaignName,
    live.groupName,
    live.adGroupName,
    live.campaignId,
    live.adGroupId,
    live.targetRows,
    live.customerSearchRows,
  ]).toUpperCase().includes(needle);
}

function dueFollowupLiveTraceReady(item = {}, expectedDate = '') {
  const sku = text(item.sku || item.evidence?.sku).toUpperCase();
  const trace = text(item.evidence?.trace);
  if (item.evidence?.liveChecked !== true || !trace || (sku && !trace.toUpperCase().includes(sku))) {
    return false;
  }
  const liveFile = resolveLocalFile(trace);
  if (!isUsableJsonFile(liveFile)) return false;
  const live = readJson(liveFile, {});
  const exportedLocalDate = localDateFromTimestamp(live.exportedAt || live.generatedAt || live.runAt);
  const checkpointDate = text(item.checkpoint?.date || expectedDate);
  return live.ok === true &&
    (!checkpointDate || exportedLocalDate === checkpointDate) &&
    !!text(live.source?.targetRows || live.source?.endpoint || live.source) &&
    Array.isArray(live.targetRows) &&
    Number.isFinite(Number(live.targetRowCount ?? live.allTargetRowCount ?? live.targetRows.length)) &&
    Array.isArray(live.dateRange) &&
    live.dateRange.length >= 2 &&
    liveTraceContainsSku(live, sku);
}

function todayOpsManifestReady(report = {}) {
  const todayOps = report.todayOps || {};
  const manifestFile = resolveLocalFile(todayOps.manifestFile);
  if (!isUsableJsonFile(manifestFile)) return false;
  const manifest = readJson(manifestFile, {});
  if (text(manifest.status).toLowerCase() !== 'success') return false;

  const reportDate = text(report.today);
  const manifestLocalDate = text(manifest.time?.localDate || manifest.localDate || localDateFromTimestamp(manifest.runAt || manifest.startedAt));
  if (!manifestLocalDate || (reportDate && manifestLocalDate !== reportDate)) return false;

  const businessDate = text(todayOps.businessDate || todayOps.time?.businessDate);
  const manifestBusinessDate = text(manifest.businessDate || manifest.time?.businessDate);
  if (!manifestBusinessDate || (businessDate && manifestBusinessDate !== businessDate)) return false;

  const runId = text(todayOps.runId);
  const manifestRunId = text(manifest.runId || manifest.time?.sourceRunId);
  if (!manifestRunId || (runId && manifestRunId !== runId)) return false;

  const outputFiles = manifest.outputFiles || {};
  if (!text(outputFiles.dailyRecoveryCombinedSchemaJson) ||
    !samePath(outputFiles.dailyRecoveryCombinedSchemaJson, todayOps.schemaFile)) {
    return false;
  }
  const manifestTaskCardFiles = uniqueText([outputFiles.taskCardsJson, outputFiles.taskCardsLatestJson]);
  if (!manifestTaskCardFiles.length ||
    !manifestTaskCardFiles.some(file => samePath(file, todayOps.taskCardFile))) {
    return false;
  }
  if (text(todayOps.summaryFile) && text(outputFiles.summaryFile) && !samePath(outputFiles.summaryFile, todayOps.summaryFile)) {
    return false;
  }

  return true;
}

function todayOpsGoalFinalReady(report = {}) {
  const todayOps = report.todayOps || {};
  const actionClosure = report.actionClosure || {};
  const status = text(todayOps.status);
  if (!['already_ready', 'finished'].includes(status)) return false;
  if (text(todayOps.manifestStatus).toLowerCase() !== 'success') return false;
  if (!text(todayOps.manifestFile)) return false;

  const reportDate = text(report.today);
  const localDate = text(todayOps.localDate || todayOps.time?.localDate);
  if (!localDate || (reportDate && localDate !== reportDate)) return false;

  const businessDate = text(todayOps.businessDate || todayOps.time?.businessDate);
  const actionBusinessDate = text(actionClosure.actionBusinessDate);
  if (!businessDate) return false;
  if (actionBusinessDate && businessDate !== actionBusinessDate) return false;

  const schemaFile = text(todayOps.schemaFile);
  const actionSchemaFile = text(actionClosure.schemaFile);
  if (!schemaFile) return false;
  if (actionSchemaFile && !samePath(schemaFile, actionSchemaFile)) return false;

  const taskCardFile = text(todayOps.taskCardFile);
  const systemTaskCardFile = text(report.lines?.systemP0?.sourceFile);
  if (!taskCardFile) return false;
  if (systemTaskCardFile && !samePath(taskCardFile, systemTaskCardFile)) return false;
  if (!todayOpsManifestReady(report)) return false;

  return true;
}

function buildGoalFinalEvidence(report = {}) {
  const core = report.coreMetrics || {};
  const external = report.lines?.external || {};
  const system = report.lines?.systemP0 || {};
  const season = report.lines?.season || {};
  const action = report.actionClosure || {};
  const todayOps = report.todayOps || {};
  const triplets = goalFinalCoverageTriplets(report);
  const known = {
    dataPipeline: {
      line: 'dataPipeline',
      label: '数据管道',
      method: 'coreMetrics.latest.date must equal today and sales core must be reliable',
      trace: core.latest?.sourceFile || core.recoveryFile || '',
    },
    actionClosure: {
      line: 'actionClosure',
      label: '全量动作闭环',
      method: 'daily action schema executable actions joined to agent ledger review tasks',
      trace: action.schemaFile || action.ledgerFile || action.artifactFile || '',
    },
    developerDueFollowups: {
      line: 'developerDueFollowups',
      label: '开发诉求到期复查',
      method: 'developer_requests checkpoint.date=today expanded by reviewPlan.subjectSkus',
      trace: external.dueFollowupFile || external.outFile || external.sourceDir || '',
    },
    systemP0: {
      line: 'systemP0',
      label: '系统P0',
      method: 'task_cards P0 layer count split into executable and reviewRequired',
      trace: system.sourceFile || '',
    },
    season: {
      line: 'season',
      label: '节日/事件窗口巡查',
      method: 'current season watchlist SKUs matched against 7d ad SKU summary',
      trace: season.sourceFile || season.listingTaskFile || '',
    },
    'line:external.inbox': {
      line: 'line:external.inbox',
      label: '开发诉求收件箱',
      method: 'developer_requests parsed into external inbox tasks',
      trace: external.outFile || external.sourceDir || '',
    },
  };
  const denominatorEvidence = Object.entries(triplets).map(([line, coverage]) => ({
    ...(known[line] || genericGoalFinalEvidenceForLine(report, line)),
    denominator: Number(coverage?.denominator || 0),
    numerator: Number(coverage?.numerator || 0),
    gapCount: Number(coverage?.gapCount || 0),
  }));
  const externalDueFollowups = (external.todayDueFollowups || []).map(item => {
    const sku = item.sku || item.evidence?.sku || '';
    const trace = item.evidence?.trace || item.sourceFile || '';
    return {
      sku,
      checkpointDate: item.checkpoint?.date || '',
      status: item.evidence?.status || item.status || '',
      liveChecked: item.evidence?.liveChecked === true,
      metrics: item.evidence?.metrics || {},
      traceMetrics: liveTraceDigest(trace, sku),
      detail: item.evidence?.detail || '',
      trace,
    };
  });
  return {
    denominatorEvidence,
    liveEvidence: {
      todayOps: {
        paperGeneratedAt: report.generatedAt || '',
        paperLocalDate: bossPaperGeneratedLocalDate(report),
        status: todayOps.status || '',
        businessDate: todayOps.businessDate || '',
        localDate: todayOps.localDate || '',
        manifestStatus: todayOps.manifestStatus || '',
        runId: todayOps.runId || '',
        mode: todayOps.mode || '',
        operationMode: todayOps.operationMode || '',
        manifestFile: todayOps.manifestFile || '',
        summaryFile: todayOps.summaryFile || '',
        schemaFile: todayOps.schemaFile || '',
        taskCardFile: todayOps.taskCardFile || '',
      },
      externalDueFollowups,
    },
  };
}

function genericGoalFinalEvidenceForLine(report = {}, line = '') {
  const match = /^line:([^.]+)(?:\.(.+))?$/.exec(line);
  const lineName = match?.[1] || '';
  const coverageName = match?.[2] || '';
  const lineReport = lineName ? report.lines?.[lineName] || {} : {};
  return {
    line,
    label: coverageName ? `${lineName}.${coverageName}` : line,
    method: 'structured line coverage object discovered in boss-paper report.lines',
    trace: lineReport.sourceFile ||
      lineReport.outFile ||
      lineReport.dueFollowupFile ||
      lineReport.ledgerFile ||
      lineReport.queueFile ||
      lineReport.sourceDir ||
      '',
  };
}

function traceIncludesDate(file, date) {
  const wanted = text(date);
  return !!wanted && text(file).replace(/\\/g, '/').includes(wanted);
}

function goalFinalDenominatorTraceMatches(row = {}, report = {}) {
  const line = text(row.line);
  const trace = text(row.trace);
  const today = text(report.today);
  const actionBusinessDate = text(report.actionClosure?.actionBusinessDate || report.todayOps?.businessDate);
  const external = report.lines?.external || {};
  if (!trace) return false;

  if (line === 'dataPipeline') {
    return samePath(trace, report.coreMetrics?.latest?.sourceFile) &&
      text(report.coreMetrics?.latest?.date) === today &&
      traceIncludesDate(trace, today);
  }
  if (line === 'actionClosure') {
    return samePath(trace, report.actionClosure?.schemaFile) &&
      (!actionBusinessDate ||
        traceIncludesDate(trace, actionBusinessDate) ||
        inferActionDateFromSchemaFile(trace) === actionBusinessDate);
  }
  if (line === 'developerDueFollowups') {
    return samePath(trace, external.dueFollowupFile) && traceIncludesDate(trace, today);
  }
  if (line === 'systemP0') {
    return samePath(trace, report.lines?.systemP0?.sourceFile) &&
      (!text(report.todayOps?.taskCardFile) || samePath(trace, report.todayOps?.taskCardFile));
  }
  if (line === 'season') {
    return samePath(trace, report.lines?.season?.sourceFile || report.lines?.season?.listingTaskFile) &&
      traceIncludesDate(trace, today);
  }
  if (line === 'line:external.inbox') {
    return samePath(trace, external.outFile) && traceIncludesDate(trace, today);
  }

  const genericTrace = genericGoalFinalEvidenceForLine(report, line).trace;
  return samePath(trace, genericTrace) &&
    (traceIncludesDate(trace, today) || (!!actionBusinessDate && traceIncludesDate(trace, actionBusinessDate)));
}

function goalFinalDenominatorEvidenceReady(goalFinalEvidence = {}, report = {}) {
  const required = new Set(['dataPipeline', 'actionClosure', 'developerDueFollowups', 'systemP0', 'season']);
  const rows = Array.isArray(goalFinalEvidence.denominatorEvidence)
    ? goalFinalEvidence.denominatorEvidence
    : [];
  const rowReady = row =>
    Number.isFinite(Number(row.denominator)) &&
    Number.isFinite(Number(row.numerator)) &&
    Number.isFinite(Number(row.gapCount)) &&
    text(row.method) &&
    text(row.trace) &&
    localTraceExists(row.trace) &&
    goalFinalDenominatorTraceMatches(row, report);
  return rows
    .filter(row => required.has(row.line))
    .length >= required.size &&
    rows.every(rowReady);
}

function goalFinalCoverageTriplets(report = {}) {
  const core = report.coreMetrics || {};
  const lines = report.lines || {};
  const triplets = {
    dataPipeline: core.coverage?.dataPipeline,
    actionClosure: report.actionClosure?.coverage,
    developerDueFollowups: lines.external?.coverage?.dueFollowups,
    systemP0: lines.systemP0?.coverage,
    season: lines.season?.coverage,
  };
  const seen = new Set(Object.values(triplets).filter(Boolean));
  for (const [lineName, line] of Object.entries(lines)) {
    const coverage = line?.coverage;
    let lineTripletCount = 0;
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
      triplets[`line:${lineName}`] = undefined;
      continue;
    }
    if (looksLikeCoverageTriplet(coverage)) {
      lineTripletCount += 1;
      if (!seen.has(coverage)) {
        triplets[`line:${lineName}`] = coverage;
        seen.add(coverage);
      }
    }
    for (const [coverageName, coverageItem] of Object.entries(coverage)) {
      if (!looksLikeCoverageTriplet(coverageItem)) continue;
      lineTripletCount += 1;
      if (seen.has(coverageItem)) continue;
      triplets[`line:${lineName}.${coverageName}`] = coverageItem;
      seen.add(coverageItem);
    }
    if (!lineTripletCount) {
      triplets[`line:${lineName}`] = undefined;
    }
  }
  return triplets;
}

function validCoverageTriplet(item = {}) {
  return Number.isFinite(Number(item.denominator)) &&
    Number.isFinite(Number(item.numerator)) &&
    Number.isFinite(Number(item.gapCount));
}

function looksLikeCoverageTriplet(item = {}) {
  return !!item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    ('denominator' in item || 'numerator' in item || 'gapCount' in item);
}

function coverageGapReasonAllowed(gap = {}) {
  const reason = text(gap.reason);
  const nextStep = text(gap.nextStep || gap.next_step);
  const haystack = `${reason} ${nextStep}`.toLowerCase();
  const banned = /能做但没做|其實能做|其实能做|静默跳过|靜默跳過|skipped|skip\b|not[ _-]?done|todo|to[ _-]?do|no[ _-]?data|missing[ _-]?data|missing[ _-]?live|missing[ _-]?ad[ _-]?summary|omitted|ignored|forgot|未做|没做|漏做|无数据|缺数据|缺失数据|漏掉|跳过/i;
  return !!reason && !banned.test(haystack);
}

function coverageGapsExplained(item = {}) {
  const gapCount = Number(item.gapCount || 0);
  if (!Number.isFinite(gapCount) || gapCount <= 0) return true;
  const gaps = Array.isArray(item.gaps) ? item.gaps : [];
  return gaps.length >= gapCount &&
    gaps.every(gap =>
      text(gap.item || gap.sku || gap.label) &&
      text(gap.reason) &&
      (text(gap.trace) || text(gap.nextStep || gap.next_step)) &&
      coverageGapReasonAllowed(gap)
    );
}

function bossPaperGeneratedLocalDate(report = {}) {
  return text(report.generatedLocalDate || report.generatedDate || localDateFromTimestamp(report.generatedAt));
}

function bossPaperEvidenceFiles(report = {}) {
  return [
    report.coreMetrics?.recoveryFile,
    report.todayOps?.outFile,
    report.todayOps?.schemaFile,
    report.coreMetrics?.latest?.sourceFile,
    report.attribution?.sourceFile,
    report.lifecycle?.artifactFile,
    report.lifecycle?.sourceAdjustmentFile,
    report.lifecycle?.currentMetricsFile,
    report.actionClosure?.artifactFile,
    report.actionClosure?.schemaFile,
    report.lines?.external?.outFile,
    report.lines?.external?.dueFollowupFile,
    ...(report.lines?.external?.todayDueFollowups || []).map(item => item.evidence?.trace || item.sourceFile),
    report.lines?.systemP0?.sourceFile,
    report.lines?.season?.sourceFile,
    report.lines?.season?.listingTaskFile,
  ].filter(Boolean);
}

function withGoalFinalFiles(report = {}, date = '', agentDir = DEFAULT_AGENT_DIR) {
  return {
    ...report,
    files: {
      ...(report.files || {}),
      paperFile: text(report.files?.paperFile) || defaultPaperFile(date, agentDir),
      jsonFile: text(report.files?.jsonFile) || defaultJsonFile(date, agentDir),
    },
  };
}

function persistedBossPaperGuard(report = {}, date = '', agentDir = DEFAULT_AGENT_DIR) {
  const withFiles = withGoalFinalFiles(report, date, agentDir);
  const paperFile = withFiles.files.paperFile;
  if (!fs.existsSync(paperFile)) {
    return { status: 'fail', failures: ['missing_boss_paper_markdown'] };
  }
  const content = fs.readFileSync(paperFile, 'utf8');
  return validateBossPaperGuard({
    outFile: paperFile,
    content,
    evidenceFiles: bossPaperEvidenceFiles(withFiles),
  });
}

function recomputeGoalFinalVerification(report = {}, guard = report.guard || {}) {
  return buildVerification(report, guard);
}

function goalFinalPassReasons(report = {}, date = '', options = {}) {
  const reasons = [];
  const guard = options.requirePersistedPaper
    ? persistedBossPaperGuard(report, date, options.agentDir || DEFAULT_AGENT_DIR)
    : (report.guard || {});
  const recomputedVerification = recomputeGoalFinalVerification(report, guard);
  const checks = recomputedVerification.checks || {};
  const core = report.coreMetrics || {};
  const reportDate = text(report.today || date);
  const latestDate = text(core.latest?.date || core.latestValidDate);
  const generatedLocalDate = bossPaperGeneratedLocalDate(report);
  if (report.verification?.status !== 'pass') reasons.push(`verification=${report.verification?.status || 'missing'}`);
  if (recomputedVerification.status !== 'pass') reasons.push(`verification_recomputed=${recomputedVerification.status || 'missing'}`);
  if (report.guard?.status !== 'pass') reasons.push(`guard=${report.guard?.status || 'missing'}`);
  if (guard.status !== 'pass') reasons.push(`boss_paper_guard:${(guard.failures || []).join(',') || 'fail'}`);
  if (!generatedLocalDate || (reportDate && generatedLocalDate !== reportDate)) {
    reasons.push(`boss_paper_not_generated_on_report_date:${generatedLocalDate || 'missing'}`);
  }
  if (!todayOpsGoalFinalReady(report)) reasons.push(`today_ops_not_run:${report.todayOps?.status || 'missing'}`);
  if (checks.P3_goal_final_coverage_triplets_present !== true ||
    checks.P3_goal_final_denominator_evidence_present !== true ||
    checks.P3_developer_due_followups_each_object_live_trace !== true ||
    checks.P3_goal_final_no_unreasonable_coverage_gaps !== true) {
    reasons.push('missing_goal_final_coverage_checks');
  }
  if (core.todayReliability !== 'reliable') reasons.push('today_core_not_reliable');
  if (!latestDate || (reportDate && latestDate !== reportDate)) {
    reasons.push(`latest_core_date_not_today:${latestDate || 'missing'}`);
  }
  if (!text(core.latest?.sourceFile)) reasons.push('missing_today_core_source_file');
  const triplets = goalFinalCoverageTriplets(report);
  const missingTriplets = Object.entries(triplets)
    .filter(([, item]) => !validCoverageTriplet(item || {}))
    .map(([label]) => label);
  if (missingTriplets.length) reasons.push(`missing_coverage_triplets:${missingTriplets.join(',')}`);
  const unexplainedGapTriplets = Object.entries(triplets)
    .filter(([, item]) => validCoverageTriplet(item || {}) && !coverageGapsExplained(item || {}))
    .map(([label]) => label);
  if (unexplainedGapTriplets.length) reasons.push(`unexplained_coverage_gaps:${unexplainedGapTriplets.join(',')}`);
  return reasons;
}

function dailyGoalFinalPass(report = {}, date = '') {
  return goalFinalPassReasons(report, date).length === 0;
}

function buildGoalFinalContinuity(today, agentDir = DEFAULT_AGENT_DIR, currentReport = {}) {
  const requiredBusinessDays = 3;
  const days = businessDaysEndingAt(today, requiredBusinessDays);
  const daily = days.map(date => {
    const rawReport = date === today ? currentReport : readBossPaperForDate(agentDir, date);
    const report = rawReport ? withGoalFinalFiles(rawReport, date, agentDir) : null;
    const reasons = report
      ? goalFinalPassReasons(report, date, { agentDir, requirePersistedPaper: date !== today })
      : ['missing_boss_daily_paper'];
    return {
      date,
      present: !!report,
      pass: !!report && reasons.length === 0,
      reasons,
      verificationStatus: report?.verification?.status || 'missing',
      guardStatus: report?.guard?.status || 'missing',
      paperFile: report?.files?.paperFile || defaultPaperFile(date, agentDir),
      jsonFile: report?.files?.jsonFile || '',
    };
  });
  let currentStreak = 0;
  for (const day of daily) {
    if (!day.pass) break;
    currentStreak += 1;
  }
  return {
    status: currentStreak >= requiredBusinessDays ? 'complete' : 'pending',
    requiredBusinessDays,
    currentStreak,
    today,
    daily,
    blockers: daily
      .filter(day => !day.pass)
      .map(day => ({
        date: day.date,
        reason: day.reasons.join('; '),
        trace: day.jsonFile || day.paperFile,
      })),
  };
}

function ensureTodayOpsArtifacts(today, options = {}) {
  if (options.skipTodayOps || options.disableTodayOps) {
    return {
      attempted: false,
      status: 'skipped',
      reason: 'skipTodayOps',
    };
  }
  if (options.todayOps) return options.todayOps;

  let latestRun = findLatestTodayOpsRun(today, options);
  let actionBusinessDate = text(options.actionBusinessDate || latestRun?.businessDate || today);
  const schemaFile = resolveDailyActionSchemaFile(today, { ...options, todayOpsRun: latestRun, actionBusinessDate });
  actionBusinessDate = text(actionBusinessDate || inferActionDateFromSchemaFile(schemaFile) || today);
  const taskCardFile = todayOpsTaskCardFile(latestRun, options);
  const taskCardBusinessDate = text(readJson(taskCardFile, {})?.time?.businessDate);
  const taskCardsFresh = fs.existsSync(taskCardFile) &&
    (taskCardBusinessDate === today || taskCardBusinessDate === actionBusinessDate);
  if (isUsableJsonFile(schemaFile) && taskCardsFresh) {
    const runEvidence = todayOpsRunEvidence(latestRun);
    return {
      attempted: false,
      status: 'already_ready',
      businessDate: actionBusinessDate,
      localDate: latestRun?.localDate || today,
      ...runEvidence,
      manifestFile: latestRun?.manifestFile || '',
      summaryFile: latestRun?.summaryFile || '',
      schemaFile,
      taskCardFile,
    };
  }

  const chrome = runCommand(npmCommand(), ['run', 'chrome:debug'], {
    ...options,
    env: { ...(options.env || {}), ...dailyChromeDebugEnv(options) },
    commandTimeoutMs: options.chromeRecoveryTimeoutMs || 300000,
  });
  const result = runCommand(npmCommand(), ['run', 'ops:today', '--', '--mode', 'full-snapshot', '--actor', 'codex'], {
    ...options,
    commandTimeoutMs: options.todayOpsTimeoutMs || 900000,
  });
  latestRun = findLatestTodayOpsRun(today, options);
  actionBusinessDate = text(options.actionBusinessDate || latestRun?.businessDate || today);
  const afterSchemaFile = resolveDailyActionSchemaFile(today, { ...options, todayOpsRun: latestRun, actionBusinessDate });
  const afterTaskCardFile = todayOpsTaskCardFile(latestRun, options);
  const afterTaskCards = readJson(afterTaskCardFile, {});
  const afterTaskCardBusinessDate = text(afterTaskCards?.time?.businessDate);
  const runEvidence = todayOpsRunEvidence(latestRun);
  const artifact = {
    today,
    businessDate: actionBusinessDate,
    localDate: latestRun?.localDate || today,
    generatedAt: new Date().toISOString(),
    attempted: true,
    status: result.ok ? 'finished' : 'failed',
    command: result.command,
    chrome,
    result,
    ...runEvidence,
    manifestFile: latestRun?.manifestFile || '',
    summaryFile: latestRun?.summaryFile || '',
    schemaFile: isUsableJsonFile(afterSchemaFile) ? afterSchemaFile : '',
    taskCardFile: [today, actionBusinessDate].includes(afterTaskCardBusinessDate) ? afterTaskCardFile : '',
  };
  const outFile = options.todayOpsFile || path.join(options.agentDir || DEFAULT_AGENT_DIR, `today_ops_attempt_${today}.json`);
  writeJson(outFile, artifact);
  return { ...artifact, outFile };
}

function buildBossDailyPaper(options = {}) {
  if (options.report) return options.report;
  const today = dateOnly(options.today || 'today');
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const coreMetrics = options.coreMetrics || buildCoreMetrics(today, { ...options, agentDir });
  const todayOps = ensureTodayOpsArtifacts(today, { ...options, today, agentDir });
  const actionOptions = {
    ...options,
    agentDir,
    todayOps,
    actionBusinessDate: options.actionBusinessDate || todayOps.businessDate,
    actionSchemaFile: options.actionSchemaFile || todayOps.schemaFile,
    taskCardFile: options.taskCardFile || todayOps.taskCardFile,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    today,
    coreMetrics,
    todayOps,
    attribution: options.attribution || buildDragSkuAttribution(today, options),
    lifecycle: options.lifecycle || runRealLifecycle(today, { ...options, agentDir }),
    actionClosure: options.actionClosure || runFullActionClosure(today, actionOptions),
    lines: {
      external: options.externalLine || runExternalLine(today, { ...options, agentDir }),
      systemP0: options.systemLine || buildSystemLine(today, actionOptions),
      season: options.seasonLine || buildSeasonLine(today, options),
    },
    files: {},
  };
  report.redLights = options.redLights || buildRedLights(report);
  report.taskFollowup = buildReportTaskFollowup(report, options);
  return report;
}

function buildReportTaskFollowup(report = {}, options = {}) {
  if (options.taskFollowup) return options.taskFollowup;
  if (!options.force && report.taskFollowup) return report.taskFollowup;
  return buildTaskFollowupDashboard({
    ...options,
    today: report.today,
    report,
  });
}

function formatCoverageTriplet(coverage = {}, label = '') {
  const denominator = Number(coverage.denominator || 0);
  const numerator = Number(coverage.numerator || 0);
  const gapCount = Number(coverage.gapCount || Math.max(0, denominator - numerator));
  const gaps = Array.isArray(coverage.gaps) ? coverage.gaps : [];
  const gapText = gaps.length
    ? `；缺口项 ${gaps.slice(0, 5).map(gap => `${gap.item || gap.sku || '-'}:${gap.reason || 'missing_reason'}`).join('，')}${gaps.length > 5 ? ` 等 ${gaps.length} 项` : ''}`
    : '';
  return `${label}：分母 ${denominator}，分子 ${numerator}，缺口 ${gapCount}${gapText}`;
}

function renderCoreSection(core = {}) {
  const latest = core.latest || {};
  const previous = core.previous || {};
  const delta = core.deltaVsPrevious || {};
  const trendDelta = core.trendDelta || {};
  const lines = [
    '## 1. 总盘：净利/销量',
  ];
  if (core.todayReliability !== 'reliable') {
    lines.push(`- ${core.today} 今日核心销售数据不能当作真实结果：${(core.todayInvalidReasons || []).join('；') || '缺少可信 sales core'}。`);
    if (core.recovery?.attempted) {
      lines.push(`- P1 自愈已触发：${core.recovery.method || 'recovery'}，结果 ${core.recovery.status}，证据 ${rel(core.recoveryFile)}。`);
    } else {
      lines.push('- P1 自愈未触发：这会使 GOAL-04 不达成。');
    }
    if (core.dataBreak?.breakStartDate || core.dataBreak?.latestCompleteSettlementDate) {
      lines.push(`- 数据断点：从 ${core.dataBreak.breakStartDate || '-'} 起不可用；最新完整结算日 ${core.dataBreak.latestCompleteSettlementDate || '-'}。`);
    }
  }
  if (latest.date) {
    lines.push(`- 最新可信业务日：${latest.date}，销售额 ${money(latest.sales)}，销量 ${int(latest.units)}，净利率 ${pct(latest.netProfitRate)}，估算净利 ${money(latest.estimatedNetProfit)}，ACOS ${pct(latest.acos)}，退款率 ${pct(latest.refundRate)}。`);
    if (previous.date) {
      lines.push(`- 对比 ${previous.date}：销售额 ${signedMoney(delta.sales)}，销量 ${signedInt(delta.units)}，估算净利 ${signedMoney(delta.estimatedNetProfit)}。`);
    }
    if (trendDelta.startDate) {
      lines.push(`- 可信趋势 ${trendDelta.startDate} -> ${trendDelta.endDate}：销售额 ${signedMoney(trendDelta.sales)}，销量 ${signedInt(trendDelta.units)}，估算净利 ${signedMoney(trendDelta.estimatedNetProfit)}。`);
    }
    lines.push(`- 数据源：${rel(latest.sourceFile)}。`);
  } else {
    lines.push('- 没有找到可信销售核心日，老板纸只能进入数据红灯，不能给销量/净利结论。');
  }
  lines.push(`- 覆盖度自证-${formatCoverageTriplet(core.coverage?.dataPipeline || {}, '数据管道') }。`);
  return lines.join('\n');
}

function renderLinesSection(report = {}) {
  const external = report.lines?.external || {};
  const system = report.lines?.systemP0 || {};
  const season = report.lines?.season || {};
  const drops = report.attribution?.topDrops || [];
  const externalTop = (external.topTasks || []).slice(0, 3)
    .map(item => `${item.sku || item.asin || item.keyword || '未识别主体'}(${item.kind}/${item.priority})`).join('，') || '无';
  const dueFollowupTop = (external.todayDueFollowups || []).slice(0, 3)
    .map(item => `${item.evidence?.label || item.title || item.sku || 'follow-up'}: ${item.evidence?.detail || item.checkpoint?.description || ''} trace=${rel(item.evidence?.trace || item.sourceFile)}`)
    .join('；') || '无';
  const p0Top = (system.topTasks || []).slice(0, 3)
    .map(item => `${item.sku}(${item.type}${item.executable ? '/可执行' : '/需复核'})`).join('，') || '无';
  const seasonTop = (season.items || []).map(item => `${item.sku} ${item.lane}: orders ${item.ordersPrev}->${item.orders}, sales ${money(item.salesPrev)}->${money(item.sales)}, ACOS ${pct(item.acos)}`).join('；');
  const dropTop = drops.map(item => `${item.sku} gap ${money(item.salesGap)} [${item.reasons.join(', ')}]`).join('；') || '无';
  const buckets = report.actionClosure?.actionBuckets || {};
  return [
    '## 2. 三条线：开发诉求 / 系统P0 / 节日巡查',
    `- 开发诉求到期复查：今天触发 ${external.todayDueFollowupsCount || 0} 条，已 live 复查 ${external.todayDueFollowupsCovered || 0} 条；${dueFollowupTop}。`,
    `- 覆盖度自证-${formatCoverageTriplet(external.coverage?.dueFollowups || {}, '开发诉求到期复查')}。`,
    `- 开发诉求线：读取 ${external.total || 0} 条，类型 ${JSON.stringify(external.byKind || {})}；已进入 ${rel(external.ledgerFile)} 和 ${rel(external.queueFile)}。前排：${externalTop}。`,
    `- 系统 P0 线：P0 ${system.summary?.count || 0} 条，可执行 ${system.summary?.executable || 0} 条，需复核 ${system.summary?.reviewRequired || 0} 条。前排：${p0Top}。`,
    `- 覆盖度自证-${formatCoverageTriplet(system.coverage || {}, '系统P0')}。`,
    `- 节日巡查线：${seasonTop || '无节日 SKU 行'}。`,
    `- 覆盖度自证-${formatCoverageTriplet(season.coverage || {}, '节日巡查')}。`,
    `- 7d 拖累归因：${dropTop}。`,
    `- 全量动作闭环：schema 可执行 ${report.actionClosure?.executableActions || 0}，完整利润 goal ${report.actionClosure?.executableWithCompleteGoal || 0}，ledger 动作 ${report.actionClosure?.ledgerActionCount || 0}，复查检查点 ${report.actionClosure?.reviewTaskCount || 0}。止血 ${buckets.stopLoss || 0} 条，开源 ${buckets.openSource || 0} 条，到期复查 ${buckets.dueRecheck || 0} 条。`,
    `- 覆盖度自证-${formatCoverageTriplet(report.actionClosure?.coverage || {}, '全量动作闭环')}。`,
  ].join('\n');
}

function renderRedLightSection(report = {}) {
  const redLights = report.redLights || [];
  const rows = redLights.length
    ? redLights.map((item, index) => `- ${index + 1}. ${item.title}：${item.detail}（trace: ${rel(item.trace)}）`)
    : ['- 暂无红灯；这只代表输入证据没有触发红灯，不代表可以跳过明天复查。'];
  const goalFinal = report.goalFinal;
  const goalFinalLine = goalFinal
    ? `- GOAL-FINAL 连续达标：${goalFinal.currentStreak || 0}/${goalFinal.requiredBusinessDays || 3}，status=${goalFinal.status || 'pending'}${goalFinal.blockers?.length ? `；未计入：${goalFinal.blockers.slice(0, 3).map(item => `${item.date}:${item.reason}`).join('，')}` : ''}。`
    : '';
  return [
    '## 3. 红灯（≤5）与追溯',
    ...rows,
    goalFinalLine,
    `- 真实生命周期追溯：${report.lifecycle?.sku || '-'} verdict=${report.lifecycle?.verdict || '-'}，artifact=${rel(report.lifecycle?.artifactFile)}。`,
    `- 防合成守卫：禁止空日期老板纸、GOAL-02 阶段验收纸、合成 SKU/临时目录冒充闭环。`,
  ].filter(Boolean).join('\n');
}

function renderGoalFinalEvidenceSection(report = {}) {
  const evidence = report.goalFinalEvidence || buildGoalFinalEvidence(report);
  const denominatorRows = evidence.denominatorEvidence || [];
  const denominatorText = denominatorRows.length
    ? denominatorRows
      .map(row => `${row.label || row.line}: 分母 ${row.denominator}，分子 ${row.numerator}，缺口 ${row.gapCount}；依据=${rel(row.trace)}；算法=${row.method}`)
      .join('；')
    : '无';
  const todayOps = evidence.liveEvidence?.todayOps || {};
  const todayOpsText = text(todayOps.status)
    ? `paperGeneratedAt=${todayOps.paperGeneratedAt || '-'} paperLocalDate=${todayOps.paperLocalDate || '-'} status=${todayOps.status || '-'} manifest=${todayOps.manifestStatus || '-'} run=${todayOps.runId || '-'} businessDate=${todayOps.businessDate || '-'} localDate=${todayOps.localDate || '-'} mode=${todayOps.mode || '-'} operation=${todayOps.operationMode || '-'} manifestFile=${rel(todayOps.manifestFile)} summaryFile=${rel(todayOps.summaryFile)} schema=${rel(todayOps.schemaFile)} taskCards=${rel(todayOps.taskCardFile)}`
    : '无当日执行证据';
  const followupRows = evidence.liveEvidence?.externalDueFollowups || [];
  const followupText = followupRows.length
    ? followupRows
      .map(row => `${row.sku || '-'} status=${row.status || '-'} live=${row.liveChecked ? 'true' : 'false'} metrics=${metricSummary(row.metrics)} traceMetrics=${liveTraceDigestSummary(row.traceMetrics)} trace=${rel(row.trace)}`)
      .join('；')
    : '今日无到期复查对象';
  return [
    '## 4. GOAL-FINAL 自证证据',
    `- 分母独立核验：${denominatorText}。`,
    `- 当日执行 live 文件：${todayOpsText}。`,
    `- 到期复查 live 文件：${followupText}。`,
  ].join('\n');
}

function renderBossDailyPaper(report = {}) {
  const taskFollowup = buildReportTaskFollowup(report);
  return [
    `# 每日结果纸 ${report.today}`,
    '',
    renderCoreSection(report.coreMetrics || {}),
    '',
    renderLinesSection(report),
    '',
    renderRedLightSection(report),
    '',
    renderGoalFinalEvidenceSection(report),
    '',
    renderTaskFollowupMarkdown(taskFollowup),
    '',
  ].join('\n');
}

function cleanupStaleBossPapers(agentDir = DEFAULT_AGENT_DIR) {
  const staleFiles = [
    path.join(agentDir, '每日结果纸_.md'),
    path.join(agentDir, '姣忶棩缁撴灉绾竉.md'),
  ];
  const removed = [];
  for (const stale of staleFiles) {
    if (!fs.existsSync(stale)) continue;
    const content = fs.readFileSync(stale, 'utf8');
    if (/闭环证明|闂幆璇佹槑|goal02_stage|PASS\s/i.test(content)) {
      fs.unlinkSync(stale);
      removed.push(stale);
    }
  }
  return removed;
}

function runBossDailyPaper(options = {}) {
  const today = dateOnly(options.today || 'today');
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const outFile = options.outFile || defaultPaperFile(today, agentDir);
  const jsonOutFile = options.jsonOutFile || defaultJsonFile(today, agentDir);
  const report = buildBossDailyPaper({ ...options, today, agentDir });
  report.goalFinalEvidence = buildGoalFinalEvidence(report);
  let markdown = renderBossDailyPaper(report);
  const evidenceFiles = bossPaperEvidenceFiles(report);
  let guard = validateBossPaperGuard({ outFile, content: markdown, evidenceFiles });
  report.files = {
    paperFile: outFile,
    jsonFile: jsonOutFile,
    removedStaleFiles: cleanupStaleBossPapers(agentDir),
  };
  report.guard = guard;
  report.verification = buildVerification(report, guard);
  report.goalFinal = buildGoalFinalContinuity(today, agentDir, report);
  report.taskFollowup = buildReportTaskFollowup(report, { ...options, force: true });
  markdown = renderBossDailyPaper(report);
  guard = validateBossPaperGuard({ outFile, content: markdown, evidenceFiles });
  report.guard = guard;
  report.verification = buildVerification(report, guard);
  report.goalFinal = buildGoalFinalContinuity(today, agentDir, report);
  report.taskFollowup = buildReportTaskFollowup(report, { ...options, force: true });
  markdown = renderBossDailyPaper(report);
  writeText(outFile, markdown);
  writeJson(jsonOutFile, report);
  return report;
}

function main() {
  const options = parseArgs();
  const report = runBossDailyPaper(options);
  console.log(JSON.stringify({
    ok: report.verification?.status === 'pass',
    status: report.verification?.status || 'needs_attention',
    today: report.today,
    paperFile: rel(report.files.paperFile),
    jsonFile: rel(report.files.jsonFile),
    verification: report.verification,
    goalFinal: report.goalFinal,
    guard: report.guard,
  }, null, 2));
  if (report.guard?.status !== 'pass') process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildBossDailyPaper,
  buildCoreMetrics,
  buildDragSkuAttribution,
  buildExternalFollowupEvidence,
  buildGoalFinalContinuity,
  buildRedLights,
  buildVerification,
  dateOnly,
  defaultPaperFile,
  externalFollowupsDueToday,
  parseArgs,
  renderBossDailyPaper,
  runBossDailyPaper,
  validateBossPaperGuard,
};
