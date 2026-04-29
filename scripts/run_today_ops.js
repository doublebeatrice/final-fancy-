const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createPanelWs, SNAPSHOTS_DIR, today } = require('../src/adjust_lib');
const { loadExternalActionSchema } = require('../src/ai_decision');
const { analyzeAllowedOperationScope, applyAllowedOperationScope } = require('../src/operation_scope');
const { exportSnapshot } = require('./execute/export_snapshot');
const { run } = require('../auto_adjust');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DATA_DIR = path.join(ROOT, 'data', 'snapshots');

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--execute');
  const execute = args.includes('--execute');
  if (dryRun && execute && args.includes('--dry-run')) {
    throw new Error('choose either --dry-run or --execute');
  }
  const schemaIndex = args.findIndex(arg => arg === '--schema');
  const snapshotIndex = args.findIndex(arg => arg === '--snapshot');
  const modeIndex = args.findIndex(arg => arg === '--mode');
  const requestedSchemaFile = schemaIndex >= 0 ? args[schemaIndex + 1] : (process.env.ACTION_SCHEMA_FILE || path.join(ROOT, 'data', 'snapshots', 'action_schema.json'));
  const requestedMode = modeIndex >= 0 ? args[modeIndex + 1] : '';
  const runtimeMode = execute ? 'execute' : ((requestedMode || 'fast').trim() || 'fast');
  return {
    mode: runtimeMode,
    dryRun: !execute,
    execute,
    actionSchemaFile: resolveActionSchemaFile(requestedSchemaFile),
    snapshotFileArg: snapshotIndex >= 0 ? args[snapshotIndex + 1] : '',
  };
}

function isUsableSchemaFile(file) {
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

function resolveActionSchemaFile(requestedFile) {
  if (isUsableSchemaFile(requestedFile)) return requestedFile;

  const preferred = [
    path.join(SNAPSHOT_DATA_DIR, 'q2_full_test_action_schema.json'),
  ];
  for (const file of preferred) {
    if (isUsableSchemaFile(file)) return file;
  }

  const fallback = fs.existsSync(SNAPSHOT_DATA_DIR)
    ? fs.readdirSync(SNAPSHOT_DATA_DIR)
      .filter(name => /schema.*\.json$/i.test(name))
      .map(name => path.join(SNAPSHOT_DATA_DIR, name))
      .filter(isUsableSchemaFile)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
    : '';

  return fallback || requestedFile;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function extractSchemaSkuList(schemaFile) {
  const raw = readJson(schemaFile, []);
  if (Array.isArray(raw)) return [...new Set(raw.map(item => String(item?.sku || '').trim()).filter(Boolean))];
  if (raw && Array.isArray(raw.plan)) return [...new Set(raw.plan.map(item => String(item?.sku || '').trim()).filter(Boolean))];
  return [];
}

function buildFetchOptions(options) {
  const schemaSkus = extractSchemaSkuList(options.actionSchemaFile);
  return {
    mode: options.mode === 'full-snapshot' ? 'full-snapshot' : 'fast',
    listingStrategy: options.mode === 'full-snapshot' ? 'all' : 'schema',
    listingSkus: options.mode === 'full-snapshot' ? [] : schemaSkus,
    chartStrategy: options.mode === 'full-snapshot' ? 'none' : 'schema',
    chartSkus: options.mode === 'full-snapshot' ? [] : schemaSkus,
    salesHistoryStrategy: options.mode === 'full-snapshot' ? (process.env.AD_OPS_SALES_HISTORY_STRATEGY || 'none') : (process.env.AD_OPS_SALES_HISTORY_STRATEGY || 'schema'),
    salesHistorySkus: options.mode === 'full-snapshot' ? [] : schemaSkus,
    salesHistoryLimit: Number(process.env.AD_OPS_SALES_HISTORY_LIMIT || (options.mode === 'full-snapshot' ? 0 : Math.max(10, schemaSkus.length || 0))),
    salesHistoryConcurrency: Number(process.env.AD_OPS_SALES_HISTORY_CONCURRENCY || 3),
    chartLookbackDays: Number(process.env.AD_OPS_PRODUCT_CHART_LOOKBACK_DAYS || 30),
    listingConcurrency: Number(process.env.AD_OPS_LISTING_FETCH_CONCURRENCY || 5),
    listingLimit: Number(process.env.AD_OPS_LISTING_FETCH_LIMIT || (options.mode === 'full-snapshot' ? 120 : Math.max(10, schemaSkus.length || 0))),
    listingTimeoutMs: Number(process.env.AD_OPS_LISTING_FETCH_TIMEOUT_MS || 10000),
    listingRetry: Number(process.env.AD_OPS_LISTING_FETCH_RETRY || 1),
    listingStageTimeoutMs: Number(process.env.AD_OPS_LISTING_FETCH_STAGE_TIMEOUT_MS || 120000),
    listingCacheTtlMs: Number(process.env.AD_OPS_LISTING_CACHE_TTL_MS || (7 * 24 * 60 * 60 * 1000)),
    listingOptional: true,
    schemaSkus,
  };
}

function summarizeAction(action = {}, sku = '') {
  return {
    sku,
    entityType: action.entityType || '',
    id: action.id || '',
    actionType: action.actionType || '',
    reason: action.reason || '',
    verifySource: action.verifySource || '',
    verifyField: action.verifyField || '',
    expected: action.expected || null,
  };
}

function buildRowsByType(snapshot) {
  const sbRows = snapshot.sbRows || [];
  return {
    keyword: snapshot.kwRows || [],
    autoTarget: snapshot.autoRows || [],
    manualTarget: snapshot.targetRows || [],
    productAd: snapshot.productAdRows || [],
    sbKeyword: sbRows.filter(row => String(row.__adProperty || '') === '4'),
    sbTarget: sbRows.filter(row => String(row.__adProperty || '') === '6'),
    sbCampaign: snapshot.sbCampaignRows || [],
    sbCampaignCandidate: snapshot.sb7DayUntouchedRows || [],
    campaign: [
      ...(snapshot.kwRows || []),
      ...(snapshot.autoRows || []),
      ...(snapshot.targetRows || []),
      ...(snapshot.productAdRows || []),
    ],
  };
}

async function openPanelWs() {
  const ws = await createPanelWs();
  await new Promise(resolve => ws.on('open', resolve));
  return ws;
}

function evalInPanel(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('panel evaluation timed out'));
    }, 180000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) {
        reject(new Error(JSON.stringify(response.error)));
        return;
      }
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    }));
  });
}

async function runPreflight() {
  const attachStarted = Date.now();
  const ws = await openPanelWs();
  const attachDurationMs = Date.now() - attachStarted;
  try {
    const raw = await evalInPanel(ws, `
      (async () => {
        const checks = [];
        const add = (name, ok, details = {}, optional = false) => checks.push({ name, ok: !!ok, details, optional: !!optional });
        const required = [
          'findTab',
          'execInTab',
          'execInAnyFrame',
          'ensureAdKeywordPage',
          'ensureInventoryListPage',
          'fetchAllData',
          'refreshRowsForExecutionEvents',
          'appendInventoryOperationNotes',
          'ensureInventoryRecordsForSkus'
        ];
        for (const name of required) add('panel_fn:' + name, typeof globalThis[name] === 'function');

        let advTab = null;
        let invTab = null;

        try {
          advTab = await findTab('*://adv.yswg.com.cn/*');
          add('adv_tab_found', true, { id: advTab.id, url: advTab.url || '' });
          await ensureAdKeywordPage(advTab.id);
          add('adv_keyword_page_ready', true);
        } catch (error) {
          add('adv_tab_ready', false, { error: error.message });
        }

        try {
          invTab = await findTab('*://sellerinventory.yswg.com.cn/*');
          add('inventory_tab_found', true, { id: invTab.id, url: invTab.url || '' });
          try {
            await ensureInventoryListPage(invTab.id);
            add('inventory_list_page_ready', true);
          } catch (error) {
            add('inventory_list_page_ready', false, { error: error.message }, true);
          }
        } catch (error) {
          add('inventory_tab_ready', false, { error: error.message });
        }

        if (advTab) {
          try {
            const probe = await execInTab(advTab.id, async () => {
              const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
              const payload = {
                siteId: 4,
                mode: 1,
                day: 30,
                userName: ['HJ17', 'HJ171', 'HJ172'],
                level: 'seller_num',
                field: 'cost',
                order: 'desc',
                page: 1,
                limit: 1,
              };
              try {
                const res = await fetch('/product/adSkuSummary', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-xsrf-token': decodeURIComponent(xsrf),
                  },
                  body: JSON.stringify(payload),
                });
                const text = await res.text();
                const isHtml = text.trimStart().startsWith('<');
                let json = null;
                if (!isHtml) {
                  try { json = JSON.parse(text); } catch (_) {}
                }
                const rows = json?.data?.data || json?.data?.list || json?.data?.rows || json?.data || json?.list || json?.rows || [];
                return {
                  ok: !!xsrf && res.ok && !isHtml && Array.isArray(rows),
                  href: location.href,
                  hasXsrf: !!xsrf,
                  status: res.status,
                  isHtml,
                  sampleText: text.slice(0, 120),
                  rowCount: Array.isArray(rows) ? rows.length : 0,
                };
              } catch (error) {
                return { ok: false, href: location.href, hasXsrf: !!xsrf, error: error.message };
              }
            });
            add('adv_probe', probe.ok, probe);
          } catch (error) {
            add('adv_probe', false, { error: error.message });
          }
        }

        if (invTab) {
          try {
            const probe = await execInTab(invTab.id, async () => {
              const findStorageValue = (patterns, validator = value => !!value) => {
                const stores = [localStorage, sessionStorage];
                for (const store of stores) {
                  for (let i = 0; i < store.length; i++) {
                    const key = store.key(i);
                    const value = store.getItem(key);
                    if (patterns.some(pattern => pattern.test(key)) && validator(value)) return value;
                  }
                }
                return '';
              };
              const csrf =
                document.querySelector('meta[name="csrf-token"]')?.content ||
                document.querySelector('input[name="_token"]')?.value ||
                window.Laravel?.csrfToken ||
                document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
                '';
              const iframeSrc = [...document.querySelectorAll('iframe')].map(frame => frame.src || '').find(src => src.includes('/pm/formal/list')) || '';
              const inventoryToken = (iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '') ||
                localStorage.getItem('surfaceKey') ||
                sessionStorage.getItem('surfaceKey') ||
                findStorageValue([/inventory/i, /surface/i, /token/i], value => !!value && !String(value).startsWith('eyJ'));
              const jwtToken = localStorage.getItem('jwt_token') ||
                sessionStorage.getItem('jwt_token') ||
                findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));

              const body = new URLSearchParams();
              body.set('time', '7');
              body.append('seller[]', 'HJ17');
              body.set('page', '1');
              body.set('limit', '1');

              const headers = {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'x-csrf-token': decodeURIComponent(csrf),
                'x-requested-with': 'XMLHttpRequest',
              };
              if (inventoryToken) headers['inventory-token'] = inventoryToken;
              if (jwtToken) headers['jwt-token'] = jwtToken;

              try {
                const res = await fetch('/pm/sale/getBySeller', {
                  method: 'POST',
                  mode: 'cors',
                  credentials: 'include',
                  headers,
                  referrer: iframeSrc || location.href,
                  body: body.toString(),
                });
                const text = await res.text();
                const isHtml = text.trimStart().startsWith('<');
                let json = null;
                if (!isHtml) {
                  try { json = JSON.parse(text); } catch (_) {}
                }
                const rows = Array.isArray(json?.data?.list) ? json.data.list : (Array.isArray(json?.rows) ? json.rows : []);
                return {
                  ok: !!csrf && !!inventoryToken && res.ok && !isHtml,
                  href: location.href,
                  hasCsrf: !!csrf,
                  hasInventoryToken: !!inventoryToken,
                  hasJwtToken: !!jwtToken,
                  status: res.status,
                  isHtml,
                  sampleText: text.slice(0, 120),
                  rowCount: rows.length,
                };
              } catch (error) {
                return {
                  ok: false,
                  href: location.href,
                  hasCsrf: !!csrf,
                  hasInventoryToken: !!inventoryToken,
                  hasJwtToken: !!jwtToken,
                  error: error.message,
                };
              }
            });
            add('inventory_probe', probe.ok, probe);
          } catch (error) {
            add('inventory_probe', false, { error: error.message });
          }
        }

        return JSON.stringify({
          ok: checks.every(item => item.optional || item.ok),
          checks,
        });
      })()
    `, true);
    const parsed = JSON.parse(raw || '{}');
    parsed.attachChrome = {
      startedAt: new Date(Date.now() - attachDurationMs).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: attachDurationMs,
      success: 1,
      failed: 0,
      attempted: 1,
      avgMs: attachDurationMs,
      p95Ms: attachDurationMs,
    };
    return parsed;
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

function validateSnapshotFile(snapshotFile) {
  const raw = fs.readFileSync(snapshotFile, 'utf8');
  if (raw.trimStart().startsWith('<')) {
    return { ok: false, reason: 'snapshot file is HTML, likely login page' };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `snapshot file is not valid JSON: ${error.message}` };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.productCards)) {
    return { ok: false, reason: 'snapshot JSON missing productCards array' };
  }
  return {
    ok: true,
    snapshot: parsed,
    counts: {
      productCards: parsed.productCards.length,
      kwRows: (parsed.kwRows || []).length,
      autoRows: (parsed.autoRows || []).length,
      targetRows: (parsed.targetRows || []).length,
      sbRows: (parsed.sbRows || []).length,
      invMap: Object.keys(parsed.invMap || {}).length,
    },
  };
}

function summarizeValidation(validation) {
  const scope = validation.scope || {};
  return {
    planSkuCount: (validation.plan || []).filter(item => (item.actions || []).length > 0).length,
    planActionCount: (validation.plan || []).reduce((sum, item) => sum + (item.actions || []).length, 0),
    reviewCount: (validation.review || []).length,
    skippedCount: (validation.skipped || []).length,
    errorCount: (validation.errors || []).length,
    reviewActions: (validation.review || []).map(item => summarizeAction(item.action, item.sku)),
    blockedActions: (validation.review || [])
      .filter(item => String(item.action?.reason || '').includes('missing_verify_spec'))
      .map(item => summarizeAction(item.action, item.sku)),
    skippedActions: (validation.skipped || []).map(item => summarizeAction(item.action, item.sku)),
    errors: validation.errors || [],
    totalProductCards: scope.totalProductCards || 0,
    allowedScopeSkuCount: scope.allowedScopeSkuCount || 0,
    schemaSkuCount: scope.schemaSkuCount || 0,
    plannedSkus: scope.plannedSkus || 0,
    outOfScopeSkus: scope.outOfScopeSkus || 0,
    reviewSkus: scope.reviewSkus || 0,
    executableSkus: scope.executableSkus || 0,
    outOfScopeSkuList: scope.outOfScopeSkuList || [],
    allowedScopeRowCount: scope.allowedScopeRowCount || 0,
    inventoryScopeRowCount: scope.inventoryScopeRowCount || 0,
    duplicateScopeSkuCount: scope.duplicateScopeSkuCount || 0,
  };
}

function buildRunSummary(manifest) {
  const steps = manifest.steps.map(step => ({
    name: step.name,
    status: step.status,
    durationMs: step.durationMs || 0,
    outputs: step.outputs || {},
    error: step.error || '',
  }));
  const schemaSummary = manifest.schemaValidation || {};
  const panelStages = manifest.panelFetchMetrics?.stages || [];
  return {
    mode: manifest.mode,
    runId: manifest.runId,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt || null,
    steps,
    reviewActions: schemaSummary.reviewActions || [],
    blockedActions: schemaSummary.blockedActions || [],
    totalProductCards: schemaSummary.totalProductCards || 0,
    allowedScopeSkuCount: schemaSummary.allowedScopeSkuCount || 0,
    schemaSkuCount: schemaSummary.schemaSkuCount || 0,
    plannedSkus: schemaSummary.plannedSkus || 0,
    outOfScopeSkus: schemaSummary.outOfScopeSkus || 0,
    reviewSkus: schemaSummary.reviewSkus || 0,
    executableSkus: schemaSummary.executableSkus || 0,
    stageTimingTop10: panelStages
      .slice()
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 10)
      .map(stage => ({ stage: stage.stage, durationMs: stage.durationMs, attempted: stage.attempted || 0, success: stage.success || 0, failed: stage.failed || 0, skipped: stage.skipped || 0 })),
    outputFiles: manifest.outputFiles || {},
    overBudgetCapture: manifest.overBudgetCapture || {},
  };
}

function chinaClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function buildOverBudgetCaptureMeta(date = new Date()) {
  const parts = chinaClockParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  const cutoffMinutes = 16 * 60;
  return {
    source: 'adv_over_budget_board',
    localDate: parts.date,
    localTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
    timezone: 'Asia/Shanghai',
    dailyCutoffLocalTime: '16:00:00',
    captureRequiredBeforeCutoff: true,
    availableAtRunStart: minutes < cutoffMinutes,
    status: minutes < cutoffMinutes ? 'capture_window_open' : 'capture_window_missed',
    warning: minutes < cutoffMinutes
      ? ''
      : '超预算板块 16:00 后不可见，本次运行不能作为当日超预算完整样本；需使用 16:00 前快照或标记为数据缺口。',
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const runId = `today_ops_${nowStamp()}`;
  const runDir = path.join(SNAPSHOTS_DIR, 'runs', runId);
  const manifestFile = path.join(runDir, 'manifest.json');
  const summaryFile = path.join(runDir, 'summary.json');
  const snapshotFile = options.snapshotFileArg
    ? path.resolve(options.snapshotFileArg)
    : path.join(runDir, `snapshot_${today}.json`);

  const manifest = {
    runId,
    mode: options.mode,
    startedAt: new Date().toISOString(),
    actionSchemaFile: path.resolve(options.actionSchemaFile),
    snapshotFile,
    manifestFile,
    steps: [],
    outputFiles: {
      manifestFile,
      summaryFile,
    },
    overBudgetCapture: buildOverBudgetCaptureMeta(),
  };

  function persist() {
    writeJson(manifestFile, manifest);
    writeJson(summaryFile, buildRunSummary(manifest));
  }

  async function runStep(name, fn, { allowSkip = false } = {}) {
    const step = { name, status: 'in_progress', startedAt: new Date().toISOString() };
    manifest.steps.push(step);
    persist();
    try {
      const result = await fn();
      step.status = result?.skipped ? 'skipped' : 'success';
      step.finishedAt = new Date().toISOString();
      step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
      if (result?.outputs) step.outputs = result.outputs;
      if (result?.details) step.details = result.details;
      persist();
      return result;
    } catch (error) {
      step.status = allowSkip ? 'skipped' : 'failed';
      step.finishedAt = new Date().toISOString();
      step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
      step.error = error.message;
      persist();
      if (!allowSkip) throw error;
      return { skipped: true, reason: error.message };
    }
  }

  try {
    await runStep('preflight', async () => {
      const result = await runPreflight();
      if (!result.ok) {
        const failedChecks = (result.checks || []).filter(item => !item.ok);
        const error = new Error(`preflight failed: ${failedChecks.map(item => item.name).join(', ')}`);
        error.details = failedChecks;
        throw error;
      }
      return { outputs: { preflightChecks: (result.checks || []).length }, details: result };
    });

    const fetchOptions = buildFetchOptions(options);
    await runStep('snapshot', async () => {
      const result = await exportSnapshot({ outputFile: snapshotFile, fetchOptions });
      const snapshotCheck = validateSnapshotFile(result.outputFile);
      if (!snapshotCheck.ok) throw new Error(snapshotCheck.reason);
      manifest.outputFiles.snapshotFile = result.outputFile;
      manifest.panelFetchMetrics = result.snapshot?.fetchMetrics || {};
      return {
        outputs: { snapshotFile: result.outputFile },
        details: {
          profileMeta: result.profileMeta,
          snapshotCounts: snapshotCheck.counts,
          fetchMetrics: result.snapshot?.fetchMetrics || {},
          fetchOptions,
        },
      };
    });

    const snapshotCheck = validateSnapshotFile(snapshotFile);
    if (!snapshotCheck.ok) throw new Error(snapshotCheck.reason);
    const snapshot = snapshotCheck.snapshot;
    const scopeAnalysis = analyzeAllowedOperationScope(snapshot);
    manifest.allowedOperationScope = scopeAnalysis.summary;
    const rowsByType = buildRowsByType(snapshot);

    await runStep('sku_ad_form_summary', async () => {
      const summaryScript = path.join(ROOT, 'scripts', 'reports', 'generate_sku_ad_form_summary.js');
      const schemaSkus = extractSchemaSkuList(options.actionSchemaFile);
      const outFile = path.join(SNAPSHOT_DATA_DIR, `sku_ad_form_summary_${today}.json`);
      const args = [
        summaryScript,
        '--snapshot',
        snapshotFile,
        '--out',
        outFile,
      ];
      if (schemaSkus.length) {
        args.push('--skus', schemaSkus.join(','));
      } else if (process.env.SKU_AD_FORM_SUMMARY_LIMIT) {
        args.push('--limit', String(Number(process.env.SKU_AD_FORM_SUMMARY_LIMIT || 0)));
      }
      const stdout = execFileSync(process.execPath, args, { encoding: 'utf8' });
      const parsed = readJson(outFile, {});
      manifest.outputFiles.skuAdFormSummaryFile = outFile;
      return {
        outputs: { skuAdFormSummaryFile: outFile },
        details: {
          requestedSkus: schemaSkus,
          skuCount: parsed.skuCount || 0,
          stdout: stdout.trim(),
        },
      };
    });

    const validation = await runStep('schema_validate', async () => {
      const actionSchemaFile = path.resolve(options.actionSchemaFile);
      if (!fs.existsSync(actionSchemaFile)) {
        throw new Error(`action schema file not found: ${actionSchemaFile}`);
      }
      const loaded = loadExternalActionSchema({
        cards: snapshot.productCards || [],
        rowsByType,
        sp7DayRows: snapshot.sp7DayUntouchedRows || [],
        sb7DayRows: snapshot.sb7DayUntouchedRows || [],
        history: readJson(path.join(ROOT, 'data', 'adjustment_history.json'), []),
        sevenDayMeta: snapshot.sevenDayUntouchedMeta || {},
        snapshotDir: SNAPSHOTS_DIR,
        actionSchemaFile,
      });
      const scoped = applyAllowedOperationScope(loaded, scopeAnalysis);
      const summary = summarizeValidation(scoped);
      manifest.schemaValidation = summary;
      manifest.outputFiles.validatedPlanFile = path.join(SNAPSHOTS_DIR, 'ai_decision_validated_plan.json');
      if (summary.errorCount > 0 && options.execute) {
        throw new Error(`schema validation failed: ${summary.errorCount} errors`);
      }
      return {
        outputs: {
          actionSchemaFile,
          validatedPlanFile: manifest.outputFiles.validatedPlanFile,
        },
        details: summary,
      };
    });

    await runStep('dry_run', async () => {
      const result = await run({
        actionSchemaFile: path.resolve(options.actionSchemaFile),
        snapshotFile,
        dryRun: true,
      });
      manifest.outputFiles.dryRunFile = result?.files?.dryRunFile || path.join(SNAPSHOTS_DIR, `execution_dry_run_${today}.json`);
      return {
        outputs: result?.files || {},
        details: result?.dryReport || {},
      };
    });

    let executeResult = null;
    if (options.execute) {
      executeResult = await runStep('execute_verify_note', async () => {
        const result = await run({
          actionSchemaFile: path.resolve(options.actionSchemaFile),
          snapshotFile,
          dryRun: false,
        });
        Object.assign(manifest.outputFiles, result?.files || {});
        return {
          outputs: result?.files || {},
          details: {
            report: result?.report || {},
            verificationBlocked: (result?.verificationBlocked || []).map(item => summarizeAction(item.action, item.sku)),
          },
        };
      });
    } else {
      await runStep('execute_verify_note', async () => ({
        skipped: true,
        outputs: {},
        details: { reason: 'dry-run mode; execute step skipped' },
      }));
    }

    await runStep('report', async () => {
      if (!options.execute) {
        return {
          skipped: true,
          outputs: {},
          details: { reason: 'dry-run mode; report step skipped because execution outputs do not exist' },
        };
      }
      const reportScript = path.join(ROOT, 'scripts', 'execute', 'generate_closed_loop_report.js');
      const stdout = execFileSync(
        process.execPath,
        [
          reportScript,
          snapshotFile,
          path.resolve(options.actionSchemaFile),
          executeResult?.outputs?.verifyFile || path.join(SNAPSHOTS_DIR, `execution_verify_${today}.json`),
          executeResult?.outputs?.summaryFile || path.join(SNAPSHOTS_DIR, `execution_summary_${today}.json`),
          executeResult?.outputs?.coverageFile || path.join(SNAPSHOTS_DIR, `execution_coverage_${today}.json`),
        ],
        { encoding: 'utf8' }
      );
      const reportFiles = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      manifest.outputFiles.closedLoopReportFiles = reportFiles;
      return {
        outputs: { closedLoopReportFiles: reportFiles },
        details: { reportFiles },
      };
    });

    manifest.finishedAt = new Date().toISOString();
    manifest.status = 'success';
    persist();
    console.log(JSON.stringify(buildRunSummary(manifest), null, 2));
  } catch (error) {
    manifest.finishedAt = new Date().toISOString();
    manifest.status = 'failed';
    manifest.error = {
      message: error.message,
      details: error.details || null,
    };
    persist();
    console.error(JSON.stringify(buildRunSummary(manifest), null, 2));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
