const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createPanelWs, SNAPSHOTS_DIR, today } = require('../src/adjust_lib');
const { loadExternalActionSchema } = require('../src/ai_decision');
const { analyzeAllowedOperationScope, applyAllowedOperationScope } = require('../src/operation_scope');
const { appendAdjustmentRecords, recordsFromExecutionEvents, recordsFromPlan } = require('../src/adjustment_log');
const { buildOpsTimeContext } = require('../src/ops_time');
const { buildDailyTaskPool } = require('../src/task_scheduler');
const { persistDailyLearning } = require('../src/daily_learning');
const { buildAgentLedger } = require('../src/agent_control_plane');
const { buildProactiveOperatingAudit, renderProactiveOperatingAuditHtml } = require('../src/proactive_audit');
const { buildAllSkuOperatingReview, renderAllSkuOperatingReviewHtml } = require('../src/sku_operating_review');
const { writeSeasonTitleReport } = require('./generate_season_title_dry_run');
const { buildSeasonTitleActionSchema } = require('./generators/generate_season_title_action_schema');
const { buildSeasonTitleListingApplications } = require('./generators/generate_season_title_listing_schema');
const { buildListingCopyDryRunReport } = require('../src/listing_copy_edit');
const { summarizeOverBudgetCoverage } = require('../src/over_budget_policy');
const { buildOverBudgetPlanItems } = require('../src/over_budget_to_actions');
const { updateHistoryFromSnapshot, annotateCapSince } = require('../src/over_budget_history');
const { scanLowEfficiencyCandidates, scanLowEfficiencyPools } = require('../src/low_efficiency_decision');
const { auditAdStructureOpportunities } = require('../src/ad_structure_opportunity');
const {
  buildExpiredSeasonActions,
  buildNewProductLaunchActions,
  buildReviewItems,
  mergePlans,
} = require('./generators/generate_proactive_audit_action_schema');
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
  const actorIndex = args.findIndex(arg => arg === '--actor');
  const requestedActor = actorIndex >= 0 ? String(args[actorIndex + 1] || '').toLowerCase().trim() : String(process.env.RUN_ACTOR || '').toLowerCase().trim();
  const actor = ['codex', 'claude', 'manual'].includes(requestedActor) ? requestedActor : 'codex';
  const requestedSchemaFile = schemaIndex >= 0 ? args[schemaIndex + 1] : (process.env.ACTION_SCHEMA_FILE || '');
  const requestedMode = modeIndex >= 0 ? args[modeIndex + 1] : '';
  const normalizedMode = String(requestedMode || 'fast').trim();
  const snapshotMode = normalizedMode === 'full-snapshot' ? 'full-snapshot' : 'fast';
  return {
    mode: snapshotMode,
    operationMode: execute ? 'execute' : 'dry-run',
    dryRun: !execute,
    execute,
    actor,
    actionSchemaFile: resolveActionSchemaFile(requestedSchemaFile, actor),
    explicitActionSchemaRequested: isUsableSchemaFile(requestedSchemaFile),
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

function resolveActionSchemaFile(requestedFile, actor = 'codex') {
  if (isUsableSchemaFile(requestedFile)) return requestedFile;

  const today = new Date().toISOString().slice(0, 10);
  const preferred = [
    path.join(SNAPSHOT_DATA_DIR, `action_schema_${today}_${actor}.json`),
    path.join(SNAPSHOT_DATA_DIR, 'action_schema.json'),
    path.join(SNAPSHOT_DATA_DIR, 'q2_full_test_action_schema.json'),
  ];
  for (const file of preferred) {
    if (isUsableSchemaFile(file)) return file;
  }

  const actorPattern = new RegExp(`action_schema_.*_${actor}\\.json$`, 'i');
  const candidates = fs.existsSync(SNAPSHOT_DATA_DIR)
    ? fs.readdirSync(SNAPSHOT_DATA_DIR)
      .filter(name => /schema.*\.json$/i.test(name))
      .map(name => path.join(SNAPSHOT_DATA_DIR, name))
      .filter(isUsableSchemaFile)
    : [];

  const actorScoped = candidates
    .filter(file => actorPattern.test(path.basename(file)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (actorScoped) return actorScoped;

  const fallback = candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return fallback || requestedFile || path.join(SNAPSHOT_DATA_DIR, `action_schema_${today}_${actor}.json`);
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

function isTransientWriteError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return ['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(code) ||
    (message.includes('unknown error') && message.includes('open'));
}

function sleepSync(ms) {
  if (!ms || ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function writeTextFileWithRetry(file, text, options = {}) {
  const retries = Number(options.retries ?? 4);
  const sleepMs = Number(options.sleepMs ?? 150);
  const writeFileSync = options.writeFileSync || fs.writeFileSync;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      writeFileSync(file, text, 'utf8');
      return;
    } catch (error) {
      if (attempt >= retries || !isTransientWriteError(error)) throw error;
      sleepSync(sleepMs * (attempt + 1));
    }
  }
}

function writeJson(file, value) {
  writeTextFileWithRetry(file, JSON.stringify(value, null, 2));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTaskPoolHtml(pool) {
  const rows = (pool.tasks || []).map(task => `
    <tr>
      <td>${task.priority}</td>
      <td>${escapeHtml(task.category)}</td>
      <td>${escapeHtml(task.status)}</td>
      <td>${escapeHtml(task.sku)}</td>
      <td>${escapeHtml(task.asin)}</td>
      <td>${task.boardExecutableHint ? 'yes' : 'no'}</td>
      <td>${escapeHtml(task.reason)}</td>
      <td>${escapeHtml(task.suggestedAction)}</td>
      <td>${escapeHtml((task.missingData || []).join(', '))}</td>
      <td>${escapeHtml(task.lastAdjustedAt || '')}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Daily Ad Ops Task Pool ${escapeHtml(pool.time.businessDate)}</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #1f2933; background: #f7f8fa; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta { color: #52616b; margin-bottom: 18px; line-height: 1.6; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .pill { background: #fff; border: 1px solid #d7dde3; border-radius: 6px; padding: 8px 10px; }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 13px; }
    th, td { border-bottom: 1px solid #e3e8ee; padding: 8px; text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: #edf2f7; z-index: 1; }
    tr:nth-child(even) td { background: #fbfcfd; }
  </style>
</head>
<body>
  <h1>每日广告运营任务池</h1>
  <div class="meta">
    runAt: ${escapeHtml(pool.time.runAt)} |
    businessDate: ${escapeHtml(pool.time.businessDate)} |
    dataDate: ${escapeHtml(pool.time.dataDate)} |
    siteTimezone: ${escapeHtml(pool.time.siteTimezone)} |
    sourceRunId: ${escapeHtml(pool.time.sourceRunId)}
  </div>
  <div class="summary">
    <div class="pill">total: ${pool.summary.total}</div>
    <div class="pill">executable: ${pool.summary.executable}</div>
    <div class="pill">reviewRequired: ${pool.summary.reviewRequired}</div>
    <div class="pill">dataMissing: ${pool.summary.dataMissing}</div>
  </div>
  <table>
    <thead>
      <tr><th>Priority</th><th>Category</th><th>Status</th><th>SKU</th><th>ASIN</th><th>Executable</th><th>Reason</th><th>Suggested Action</th><th>Missing</th><th>Last Adjusted</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function extractSchemaSkuList(schemaFile) {
  const raw = readJson(schemaFile, []);
  if (Array.isArray(raw)) return [...new Set(raw.map(item => String(item?.sku || '').trim()).filter(Boolean))];
  if (raw && Array.isArray(raw.plan)) return [...new Set(raw.plan.map(item => String(item?.sku || '').trim()).filter(Boolean))];
  return [];
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function buildFetchOptions(options) {
  const schemaSkus = extractSchemaSkuList(options.actionSchemaFile);
  const fullSnapshot = options.mode === 'full-snapshot';
  return {
    mode: fullSnapshot ? 'full-snapshot' : 'fast',
    listingStrategy: fullSnapshot ? 'all' : 'schema',
    listingSkus: fullSnapshot ? [] : schemaSkus,
    chartStrategy: fullSnapshot ? 'none' : 'schema',
    chartSkus: fullSnapshot ? [] : schemaSkus,
    salesHistoryStrategy: fullSnapshot ? (process.env.AD_OPS_SALES_HISTORY_STRATEGY || 'none') : (process.env.AD_OPS_SALES_HISTORY_STRATEGY || 'schema'),
    salesHistorySkus: fullSnapshot ? [] : schemaSkus,
    salesHistoryLimit: numberFromEnv('AD_OPS_SALES_HISTORY_LIMIT', fullSnapshot ? 0 : Math.max(10, schemaSkus.length || 0)),
    salesHistoryConcurrency: numberFromEnv('AD_OPS_SALES_HISTORY_CONCURRENCY', 3),
    chartLookbackDays: numberFromEnv('AD_OPS_PRODUCT_CHART_LOOKBACK_DAYS', 30),
    listingConcurrency: numberFromEnv('AD_OPS_LISTING_FETCH_CONCURRENCY', 5),
    listingLimit: numberFromEnv('AD_OPS_LISTING_FETCH_LIMIT', fullSnapshot ? 0 : Math.max(10, schemaSkus.length || 0)),
    listingTimeoutMs: numberFromEnv('AD_OPS_LISTING_FETCH_TIMEOUT_MS', 10000),
    listingRetry: numberFromEnv('AD_OPS_LISTING_FETCH_RETRY', 1),
    listingStageTimeoutMs: numberFromEnv('AD_OPS_LISTING_FETCH_STAGE_TIMEOUT_MS', 120000),
    listingCacheTtlMs: numberFromEnv('AD_OPS_LISTING_CACHE_TTL_MS', 7 * 24 * 60 * 60 * 1000),
    listingOptional: true,
    schemaSkus,
  };
}

function getSnapshotStepPlan(options = {}, defaultSnapshotFile = '') {
  if (options.snapshotFileArg) {
    return {
      shouldExport: false,
      reason: 'reuse_provided_snapshot',
      snapshotFile: path.resolve(options.snapshotFileArg),
    };
  }
  return {
    shouldExport: true,
    reason: 'export_fresh_snapshot',
    snapshotFile: path.resolve(defaultSnapshotFile),
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
    counts: buildSnapshotCounts(parsed),
  };
}

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function objectCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function uniqueList(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function buildSnapshotCounts(snapshot = {}) {
  const listingFetchMeta = snapshot.listingFetchMeta || {};
  const counts = {
    productCards: arrayCount(snapshot.productCards),
    kwRows: arrayCount(snapshot.kwRows),
    autoRows: arrayCount(snapshot.autoRows),
    targetRows: arrayCount(snapshot.targetRows),
    productAdRows: arrayCount(snapshot.productAdRows),
    sbRows: arrayCount(snapshot.sbRows),
    sbCampaignRows: arrayCount(snapshot.sbCampaignRows),
    sellerSalesRows: arrayCount(snapshot.sellerSalesRows),
    overBudgetRows: arrayCount(snapshot.overBudgetRows),
    invMap: objectCount(snapshot.invMap),
    inventoryScopeRows: arrayCount(snapshot.inventoryScopeRows),
    salesHistorySkus: objectCount(snapshot.salesHistoryMap),
    productChartSkus: objectCount(snapshot.productChartMap),
    listingFetchAttempted: Number(listingFetchMeta.attempted || 0),
    listingFetchSuccess: Number(listingFetchMeta.success || 0),
    listingFetchFailed: Number(listingFetchMeta.failed || 0),
    listingFetchSkipped: Number(listingFetchMeta.skipped || 0),
    listingFetchMaxListings: Number(listingFetchMeta.maxListings || 0),
  };
  counts.adRowsTotal = counts.kwRows + counts.autoRows + counts.targetRows + counts.productAdRows + counts.sbRows + counts.sbCampaignRows;
  return counts;
}

function buildSnapshotDataQuality(snapshot = {}, fetchOptions = {}) {
  const counts = buildSnapshotCounts(snapshot);
  const listingMeta = snapshot.listingFetchMeta || {};
  const listingStrategy = String(fetchOptions.listingStrategy || listingMeta.listingStrategy || '').trim();
  const listingLimit = Number(fetchOptions.listingLimit ?? listingMeta.maxListings ?? 0);
  const listingCoverageThreshold = numberFromEnv('AD_OPS_LISTING_COVERAGE_WARN_THRESHOLD', 0.8);
  const listingCoverage = counts.productCards > 0
    ? counts.listingFetchSuccess / counts.productCards
    : null;
  const warnings = [];

  if (counts.productCards <= 0) warnings.push('snapshot_missing_product_cards');
  if (counts.adRowsTotal <= 0) warnings.push('ads_rows_missing');
  if (counts.sellerSalesRows <= 0) warnings.push('seller_sales_rows_missing');
  if (counts.invMap <= 0 && counts.inventoryScopeRows <= 0) warnings.push('inventory_rows_missing');

  if (listingStrategy === 'all') {
    if (listingLimit > 0 && counts.productCards > listingLimit) warnings.push('full_snapshot_listing_limited');
    if (counts.listingFetchAttempted <= 0 && counts.productCards > 0) warnings.push('listing_fetch_missing');
    if (counts.listingFetchFailed > 0 || counts.listingFetchSkipped > 0) warnings.push('listing_fetch_partial');
    if (listingCoverage !== null && listingCoverage < listingCoverageThreshold) warnings.push('listing_coverage_low');
  }

  const baselineQuality = counts.productCards <= 0 || counts.adRowsTotal <= 0
    ? 'incomplete'
    : (warnings.length ? 'warning' : 'complete');

  return {
    baselineQuality,
    ...counts,
    listingStrategy,
    listingLimit,
    listingCoverage,
    warnings: uniqueList(warnings),
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

function buildProductMap(snapshot = {}) {
  const map = new Map();
  for (const card of snapshot.productCards || []) {
    if (card.sku) {
      const sku = String(card.sku).toUpperCase();
      map.set(sku, {
        ...card,
        campaigns: Array.isArray(card.campaigns) ? [...card.campaigns] : [],
      });
    }
  }
  const skuByCampaignGroup = new Map();
  for (const row of snapshot.productAdRows || []) {
    const sku = String(row.sku || row.productAdSku || '').toUpperCase();
    const campaignId = String(row.campaignId || '');
    const adGroupId = String(row.adGroupId || '');
    if (sku && campaignId && adGroupId) skuByCampaignGroup.set(`${campaignId}::${adGroupId}`, sku);
  }
  const ensureProduct = row => {
    const campaignId = String(row.campaignId || '');
    const adGroupId = String(row.adGroupId || '');
    const sku = String(row.sku || row.productAdSku || skuByCampaignGroup.get(`${campaignId}::${adGroupId}`) || '').toUpperCase();
    if (!sku) return null;
    if (!map.has(sku)) map.set(sku, { sku, asin: row.asin || '', campaigns: [] });
    return map.get(sku);
  };
  const ensureCampaign = (product, row) => {
    const campaignId = String(row.campaignId || '');
    const adGroupId = String(row.adGroupId || '');
    if (!campaignId || !adGroupId) return null;
    product.campaigns = product.campaigns || [];
    let campaign = product.campaigns.find(item =>
      String(item.campaignId || '') === campaignId && String(item.adGroupId || '') === adGroupId
    );
    if (!campaign) {
      campaign = {
        campaignId,
        adGroupId,
        campaignName: row.campaignName || row.name || '',
        groupName: row.groupName || row.adGroupName || '',
        campaignState: row.campaignState ?? row.state,
        groupState: row.groupState,
        keywords: [],
        autoTargets: [],
      };
      product.campaigns.push(campaign);
    }
    campaign.keywords = campaign.keywords || [];
    campaign.autoTargets = campaign.autoTargets || [];
    return campaign;
  };
  const stats7d = row => ({
    impressions: Number(row.Impressions ?? row['7_Impressions'] ?? 0) || 0,
    clicks: Number(row.Clicks ?? row['7_Clicks'] ?? 0) || 0,
    spend: Number(row.Spend ?? row['7_Spend'] ?? 0) || 0,
    orders: Number(row.Orders ?? row['7_Orders'] ?? 0) || 0,
    sales: Number(row.Sales ?? row['7_Sales'] ?? 0) || 0,
  });
  for (const row of snapshot.kwRows || []) {
    const product = ensureProduct(row);
    const campaign = product && ensureCampaign(product, row);
    const id = row.keywordId || row.id;
    if (campaign && id && !campaign.keywords.some(item => String(item.id) === String(id))) {
      campaign.keywords.push({
        id: String(id),
        bid: row.bid,
        state: row.state,
        text: row.keywordText || row.text || '',
        matchType: row.matchType,
        stats7d: stats7d(row),
      });
    }
  }
  const targetRows = new Set(snapshot.targetRows || []);
  for (const row of [...(snapshot.autoRows || []), ...(snapshot.targetRows || [])]) {
    const product = ensureProduct(row);
    const campaign = product && ensureCampaign(product, row);
    const id = row.targetId || row.id;
    if (campaign && id && !campaign.autoTargets.some(item => String(item.id) === String(id))) {
      campaign.autoTargets.push({
        id: String(id),
        bid: row.bid,
        state: row.state,
        targetType: row.targetType || (targetRows.has(row) ? 'manual' : 'auto'),
        text: row.keywordText || row.text || row.targetingText || row.targetMark || '',
        stats7d: stats7d(row),
      });
    }
  }
  return map;
}

function countSchemaActions(schema = []) {
  const actions = schema.reduce((sum, item) => sum + (item.actions || []).length, 0);
  const executableActions = schema.reduce(
    (sum, item) => sum + (item.actions || []).filter(action => action.actionType !== 'review').length,
    0
  );
  return {
    skus: schema.length,
    actions,
    executableActions,
    reviewActions: actions - executableActions,
  };
}

function mergeActionSchemas(parts = []) {
  return mergePlans(parts.filter(Array.isArray));
}

function buildProactiveRecoveryActionSchema(audit = {}, snapshot = {}, options = {}) {
  const products = buildProductMap(snapshot);
  const reviewLimit = Number(options.reviewLimit || 80);
  return mergePlans([
    buildExpiredSeasonActions(audit, products, Number(options.expiredLimit || 80)),
    buildNewProductLaunchActions(audit, products, Math.min(reviewLimit, 40)),
    buildReviewItems(audit, products, reviewLimit),
  ]);
}

function buildOperatingClosure(manifest = {}) {
  const proactive = manifest.proactiveOperatingAudit || {};
  const seasonActionCount = Number(manifest.seasonTitleActionSchema?.actions || 0);
  const listingApplicationCount = Number(manifest.seasonTitleListingApplications?.built || 0);
  const overBudgetActionable = Number(manifest.overBudgetCoverage?.actionableCampaigns || 0);
  const lowEfficiencyActionable = Number(
    manifest.lowEfficiencyPools?.actionableRows
    || manifest.lowEfficiencyPools?.actionable
    || manifest.lowEfficiencyCandidates?.actionable
    || 0
  );
  const proactiveGaps = [
    Number(proactive.newProductLaunch || 0),
    Number(proactive.arrivalAdRecovery || 0),
    Number(proactive.priceActions || 0),
    Number(proactive.removalEconomics || 0),
    Number(proactive.expiredSeasonKeywordWaste || 0),
    Number(proactive.listingRepair || 0),
  ].reduce((sum, value) => sum + value, 0);
  const generatedCandidateActions = seasonActionCount + listingApplicationCount + overBudgetActionable + lowEfficiencyActionable;
  const primaryPlanActions = Number(manifest.schemaValidation?.planActionCount || 0);
  const warnings = [];
  if (generatedCandidateActions > 0 && primaryPlanActions <= 0) warnings.push('generated_candidates_not_in_primary_plan');
  if (proactiveGaps > 0 && primaryPlanActions <= 0) warnings.push('diagnosis_pressure_without_primary_plan');

  return {
    status: primaryPlanActions > 0
      ? 'primary_plan_ready'
      : (generatedCandidateActions > 0 || proactiveGaps > 0 ? 'candidate_pressure_detected' : 'no_candidate_pressure'),
    primaryPlanActions,
    generatedCandidateActions,
    proactiveGaps,
    seasonTitleAdActions: seasonActionCount,
    listingApplications: listingApplicationCount,
    overBudgetActionableCampaigns: overBudgetActionable,
    lowEfficiencyActionable,
    warnings,
  };
}

function buildActionQuality(manifest = {}, options = {}) {
  const schema = manifest.schemaValidation || {};
  const executeStep = (manifest.steps || []).find(step => step.name === 'execute_verify_note') || {};
  const overBudgetCoverage = manifest.overBudgetCoverage || {};
  const operatingClosure = manifest.operatingClosure || buildOperatingClosure(manifest);
  const plannedActions = Number(schema.planActionCount || 0);
  const executableSkus = Number(schema.executableSkus || 0);
  const errorCount = Number(schema.errorCount || 0);
  const warnings = [];

  if (errorCount > 0) warnings.push('schema_validation_errors');
  if (plannedActions <= 0) warnings.push('no_planned_actions');
  if (overBudgetCoverage.warning) warnings.push(overBudgetCoverage.warning);
  if (!options.execute || executeStep.status === 'skipped') warnings.push('execution_skipped');
  warnings.push(...(operatingClosure.warnings || []));

  let status = 'ready_to_execute';
  if (errorCount > 0) status = 'blocked';
  else if (plannedActions <= 0) status = 'no_action_plan';
  else if (!options.execute || executeStep.status === 'skipped') status = 'dry_run_only';
  else if (executeStep.status === 'success') status = 'executed';
  else if (executeStep.status === 'failed') status = 'execution_failed';

  return {
    status,
    plannedActions,
    executableSkus,
    errorCount,
    operatingClosure,
    warnings: uniqueList(warnings),
  };
}

function buildRunQuality(manifest = {}, options = {}) {
  const dataQuality = manifest.dataQuality || {};
  const actionQuality = manifest.actionQuality || buildActionQuality(manifest, options);
  const warnings = uniqueList([
    ...(dataQuality.warnings || []),
    ...(actionQuality.warnings || []),
  ]);
  let status = 'complete';
  if (manifest.status === 'failed') status = 'failed';
  else if (dataQuality.baselineQuality === 'incomplete' || actionQuality.status === 'blocked' || actionQuality.status === 'execution_failed') status = 'blocked';
  else if (dataQuality.baselineQuality === 'warning' || actionQuality.status !== 'executed' || warnings.length) status = 'needs_attention';

  return {
    status,
    dataQuality: dataQuality.baselineQuality || 'unknown',
    actionQuality: actionQuality.status,
    warnings,
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
    operationMode: manifest.operationMode || '',
    runId: manifest.runId,
    time: manifest.time || null,
    runAt: manifest.runAt || manifest.time?.runAt || manifest.startedAt,
    businessDate: manifest.businessDate || manifest.time?.businessDate || '',
    dataDate: manifest.dataDate || manifest.time?.dataDate || '',
    siteTimezone: manifest.siteTimezone || manifest.time?.siteTimezone || '',
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt || null,
    steps,
    reviewActions: schemaSummary.reviewActions || [],
    blockedActions: schemaSummary.blockedActions || [],
    dataQuality: manifest.dataQuality || null,
    actionQuality: manifest.actionQuality || null,
    runQuality: manifest.runQuality || null,
    operatingClosure: manifest.operatingClosure || null,
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
    allSkuOperatingReview: manifest.allSkuOperatingReview || null,
    overBudgetCapture: manifest.overBudgetCapture || {},
    overBudgetCoverage: manifest.overBudgetCoverage || null,
    warnings: manifest.warnings || [],
    seasonTitleDryRun: manifest.seasonTitleDryRun || null,
    seasonTitleListingQueue: manifest.seasonTitleListingQueue || null,
    seasonTitleActionSchema: manifest.seasonTitleActionSchema || null,
    seasonTitleListingApplications: manifest.seasonTitleListingApplications || null,
    seasonTitleListingCopyDryRun: manifest.seasonTitleListingCopyDryRun || null,
    highEfficiencyRows: manifest.highEfficiencyRows || null,
    adStructureOpportunities: manifest.adStructureOpportunities || null,
    kpiRecoveryOverBudgetSchema: manifest.kpiRecoveryOverBudgetSchema || null,
    agentLedger: manifest.agentLedger || null,
    dailyLearning: manifest.dailyLearning || null,
  };
}

function overBudgetRecoveryLimitsFromEnv(env = process.env) {
  return {
    aggressive: Number(env.KPI_RECOVERY_OVERBUDGET_AGGRESSIVE_LIMIT || 0),
    controlled: Number(env.KPI_RECOVERY_OVERBUDGET_CONTROLLED_LIMIT || 20),
    seasonal: Number(env.KPI_RECOVERY_OVERBUDGET_SEASONAL_LIMIT || 0),
    lowerLayer: Number(env.KPI_RECOVERY_OVERBUDGET_LOWER_LAYER_LIMIT || 20),
    review: Number(env.KPI_RECOVERY_OVERBUDGET_REVIEW_LIMIT || 10),
    autoPause: Number(env.KPI_RECOVERY_OVERBUDGET_AUTO_PAUSE_LIMIT || 20),
  };
}

function summarizeKpiRecoveryOverBudgetSchema(snapshot, schemaItems, rawResult = {}) {
  const actions = (schemaItems || []).flatMap(item => item.actions || []);
  const coverage = summarizeOverBudgetCoverage(snapshot, actions);
  return {
    counts: rawResult.counts || {},
    bucketCounts: rawResult.bucketCounts || {},
    filtered: rawResult.filtered || {},
    campaignsClassified: rawResult.campaignsClassified || 0,
    autoPauseStats: rawResult.autoPauseStats || null,
    autoPauseCandidateCount: rawResult.autoPauseCandidateCount || 0,
    accountCap: rawResult.accountCap || {},
    plannedSkus: new Set((schemaItems || []).map(item => item.sku).filter(Boolean)).size,
    plannedActions: actions.length,
    coverage,
  };
}

function buildKpiRecoveryOverBudgetSchema(snapshot = {}, options = {}) {
  const result = buildOverBudgetPlanItems(snapshot, {
    actor: options.actor || 'codex',
    currentDate: options.currentDate,
    limit: options.limit || overBudgetRecoveryLimitsFromEnv(options.env || process.env),
    maxDailyBudgetIncreaseUsd: options.maxDailyBudgetIncreaseUsd ?? Number((options.env || process.env).KPI_RECOVERY_OVERBUDGET_MAX_DAILY_LIFT_USD || 80),
  });
  return {
    schema: result.items || [],
    summary: summarizeKpiRecoveryOverBudgetSchema(snapshot, result.items || [], result),
  };
}

function priorityFromHint(hint) {
  const value = Number(hint || 0);
  if (value >= 90) return 'P0';
  if (value >= 70) return 'P1';
  return 'P2';
}

function dailyTaskPoolToAgentTasks(pool = {}) {
  const contexts = pool.candidateContexts || pool.tasks || [];
  return contexts.map(context => {
    const signals = context.possibleSignals || [];
    const primarySignal = signals[0]?.type || context.primaryTaskType || context.category || 'daily_ops_review';
    const evidence = [
      ...signals.map(signal => signal.reason).filter(Boolean),
      ...(context.dataMissing || []).map(item => `missing: ${item}`),
    ];
    const subject = {
      sku: context.sku,
      asin: context.asin,
      campaignId: context.campaignId,
      entityId: context.entityId,
    };
    return {
      source: 'daily_ops',
      kind: primarySignal,
      title: `${context.sku || context.asin || context.groupKey || '未命名对象'} ${primarySignal}`,
      description: evidence.join(' | '),
      subject,
      priority: context.priority || priorityFromHint(context.deterministicPriorityHint),
      evidence,
      sourceRunId: context.sourceRunId || pool.time?.sourceRunId || '',
      businessDate: context.businessDate || pool.time?.businessDate || '',
      dataDate: context.dataDate || pool.time?.dataDate || '',
    };
  });
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
    captureRequiredBeforeCutoff: false,
    freshAtRunStart: minutes < cutoffMinutes,
    status: minutes < cutoffMinutes ? 'fresh_window' : 'late_window',
    warning: minutes < cutoffMinutes
      ? ''
      : '超预算抓取已过 16:00 新鲜窗口；若接口仍返回明细则继续使用，若无明细则标记 partial/missing_rows，不阻断其他模块。',
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const runId = `today_ops_${nowStamp()}`;
  const timeContext = buildOpsTimeContext({
    site: process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: runId,
  });
  const runDir = path.join(SNAPSHOTS_DIR, 'runs', runId);
  const manifestFile = path.join(runDir, 'manifest.json');
  const summaryFile = path.join(runDir, 'summary.json');
  const snapshotPlan = getSnapshotStepPlan(options, path.join(runDir, `snapshot_${today}.json`));
  const snapshotFile = snapshotPlan.snapshotFile;

  const manifest = {
    runId,
    time: timeContext,
    runAt: timeContext.runAt,
    businessDate: timeContext.businessDate,
    dataDate: timeContext.dataDate,
    siteTimezone: timeContext.siteTimezone,
    runActor: options.actor || 'codex',
    mode: options.mode,
    operationMode: options.operationMode,
    startedAt: timeContext.runAt,
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
      let result = { outputFile: snapshotFile, snapshot: readJson(snapshotFile, {}) };
      if (snapshotPlan.shouldExport) {
        result = await exportSnapshot({ outputFile: snapshotFile, fetchOptions });
      }
      const snapshotCheck = validateSnapshotFile(result.outputFile);
      if (!snapshotCheck.ok) throw new Error(snapshotCheck.reason);
      manifest.outputFiles.snapshotFile = result.outputFile;
      manifest.panelFetchMetrics = result.snapshot?.fetchMetrics || snapshotCheck.snapshot?.fetchMetrics || {};
      manifest.dataQuality = buildSnapshotDataQuality(snapshotCheck.snapshot, fetchOptions);
      manifest.overBudgetCapture = {
        ...manifest.overBudgetCapture,
        ...((result.snapshot || snapshotCheck.snapshot)?.dataAvailability?.overBudget || {}),
      };
      try {
        const history = updateHistoryFromSnapshot(result.snapshot || snapshotCheck.snapshot || readJson(result.outputFile, {}));
        manifest.overBudgetHistory = {
          campaigns: Object.keys(history.campaigns || {}).length,
          updatedAt: history.updatedAt,
        };
      } catch (err) {
        manifest.overBudgetHistory = { error: err.message };
      }
      return {
        outputs: { snapshotFile: result.outputFile },
        details: {
          snapshotSource: snapshotPlan.reason,
          profileMeta: result.profileMeta,
          snapshotCounts: snapshotCheck.counts,
          fetchMetrics: result.snapshot?.fetchMetrics || snapshotCheck.snapshot?.fetchMetrics || {},
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

    let dailyTaskPool = null;
    let proactiveAudit = null;
    let agentPlanActions = [];
    await runStep('daily_task_pool', async () => {
      const adjustments = [
        ...readJson(path.join(ROOT, 'data', 'adjustments', `adjustments_${timeContext.businessDate}.json`), []),
        ...readJson(path.join(ROOT, 'data', 'adjustment_history.json'), []),
      ];
      const pool = buildDailyTaskPool({ snapshot, timeContext, adjustments });
      dailyTaskPool = pool;
      pool.snapshotFile = snapshotFile;
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const jsonFile = path.join(taskDir, `daily_tasks_${timeContext.businessDate}.json`);
      const htmlFile = path.join(taskDir, `daily_tasks_${timeContext.businessDate}.html`);
      writeJson(jsonFile, pool);
      writeTextFileWithRetry(htmlFile, renderTaskPoolHtml(pool));
      manifest.outputFiles.dailyTaskPoolJson = jsonFile;
      manifest.outputFiles.dailyTaskPoolHtml = htmlFile;
      manifest.dailyTaskPool = pool.summary;
      return {
        outputs: { dailyTaskPoolJson: jsonFile, dailyTaskPoolHtml: htmlFile },
        details: pool.summary,
      };
    });

    await runStep('all_sku_operating_review', async () => {
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const review = buildAllSkuOperatingReview({ snapshot, timeContext });
      review.snapshotFile = snapshotFile;
      const jsonFile = path.join(taskDir, `all_sku_operating_review_${timeContext.businessDate}.json`);
      const htmlFile = path.join(taskDir, `all_sku_operating_review_${timeContext.businessDate}.html`);
      writeJson(jsonFile, review);
      writeTextFileWithRetry(htmlFile, renderAllSkuOperatingReviewHtml(review));
      manifest.outputFiles.allSkuOperatingReviewJson = jsonFile;
      manifest.outputFiles.allSkuOperatingReviewHtml = htmlFile;
      manifest.allSkuOperatingReview = review.summary;
      return {
        outputs: { allSkuOperatingReviewJson: jsonFile, allSkuOperatingReviewHtml: htmlFile },
        details: review.summary,
      };
    });

    await runStep('proactive_operating_audit', async () => {
      proactiveAudit = buildProactiveOperatingAudit({ snapshot, timeContext });
      proactiveAudit.snapshotFile = snapshotFile;
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const jsonFile = path.join(taskDir, `proactive_operating_audit_${timeContext.businessDate}.json`);
      const htmlFile = path.join(taskDir, `proactive_operating_audit_${timeContext.businessDate}.html`);
      writeJson(jsonFile, proactiveAudit);
      writeTextFileWithRetry(htmlFile, renderProactiveOperatingAuditHtml(proactiveAudit));
      manifest.outputFiles.proactiveOperatingAuditJson = jsonFile;
      manifest.outputFiles.proactiveOperatingAuditHtml = htmlFile;
      manifest.proactiveOperatingAudit = {
        kpiStatus: proactiveAudit.kpi.status,
        newProductLaunch: proactiveAudit.newProductLaunch.summary.total,
        arrivalAdRecovery: proactiveAudit.arrivalAdRecovery.summary.total,
        priceActions: proactiveAudit.priceActions.summary.total,
        removalEconomics: proactiveAudit.removalEconomics.summary.total,
        expiredSeasonKeywordWaste: proactiveAudit.expiredSeasonKeywordWaste.summary.totalEnabledRows,
        listingRepair: proactiveAudit.listingRepair.summary.total,
      };
      return {
        outputs: { proactiveOperatingAuditJson: jsonFile, proactiveOperatingAuditHtml: htmlFile },
        details: manifest.proactiveOperatingAudit,
      };
    });

    await runStep('proactive_recovery_action_schema', async () => {
      const schemaFile = path.join(SNAPSHOT_DATA_DIR, `action_schema_${timeContext.businessDate}_proactive_recovery_candidate.json`);
      const schema = buildProactiveRecoveryActionSchema(proactiveAudit, snapshot);
      writeJson(schemaFile, schema);
      const counts = countSchemaActions(schema);
      manifest.outputFiles.proactiveRecoveryActionSchemaJson = schemaFile;
      manifest.proactiveRecoveryActionSchema = {
        ...counts,
        arrivalAdRecovery: proactiveAudit?.arrivalAdRecovery?.summary?.total || 0,
        newProductLaunch: proactiveAudit?.newProductLaunch?.summary?.total || 0,
      };
      return {
        outputs: { proactiveRecoveryActionSchemaJson: schemaFile },
        details: manifest.proactiveRecoveryActionSchema,
      };
    });

    await runStep('season_title_dry_run', async () => {
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const jsonFile = path.join(taskDir, `season_title_dry_run_${timeContext.businessDate}.json`);
      const mdFile = path.join(taskDir, `season_title_dry_run_${timeContext.businessDate}.md`);
      const queueFile = path.join(taskDir, `season_title_listing_queue_${timeContext.businessDate}.json`);
      const actionSchemaFile = path.join(SNAPSHOT_DATA_DIR, `action_schema_${timeContext.businessDate}_season_title_ads.json`);
      const listingApplicationsFile = path.join(SNAPSHOT_DATA_DIR, `season_title_listing_applications_${timeContext.businessDate}.json`);
      const listingCopyDryRunFile = path.join(SNAPSHOT_DATA_DIR, `listing_copy_edit_dry_run_${timeContext.businessDate}.json`);
      const result = writeSeasonTitleReport({
        snapshot,
        snapshotFile,
        businessDate: timeContext.businessDate,
        outJson: jsonFile,
        outMd: mdFile,
        outQueue: queueFile,
      });
      const actionSchema = buildSeasonTitleActionSchema({ report: result.report, snapshot });
      const listingApplications = buildSeasonTitleListingApplications({ report: result.report, snapshot });
      const listingCopyDryRun = buildListingCopyDryRunReport(listingApplications, {
        businessDate: timeContext.businessDate,
      });
      writeJson(actionSchemaFile, actionSchema);
      writeJson(listingApplicationsFile, listingApplications);
      writeJson(listingCopyDryRunFile, {
        ...listingCopyDryRun,
        schemaFile: listingApplicationsFile,
      });
      manifest.outputFiles.seasonTitleDryRunJson = jsonFile;
      manifest.outputFiles.seasonTitleDryRunMarkdown = mdFile;
      manifest.outputFiles.seasonTitleListingQueueJson = queueFile;
      manifest.outputFiles.seasonTitleActionSchemaJson = actionSchemaFile;
      manifest.outputFiles.seasonTitleListingApplicationsJson = listingApplicationsFile;
      manifest.outputFiles.seasonTitleListingCopyDryRunJson = listingCopyDryRunFile;
      manifest.seasonTitleDryRun = result.report.summary;
      manifest.seasonTitleListingQueue = { skus: result.listingQueue.skus.length };
      manifest.seasonTitleActionSchema = {
        skus: actionSchema.length,
        actions: actionSchema.reduce((sum, item) => sum + item.actions.length, 0),
      };
      manifest.seasonTitleListingApplications = listingApplications.summary;
      manifest.seasonTitleListingCopyDryRun = listingCopyDryRun.summary;
      return {
        outputs: { seasonTitleDryRunJson: jsonFile, seasonTitleDryRunMarkdown: mdFile, seasonTitleListingQueueJson: queueFile, seasonTitleActionSchemaJson: actionSchemaFile, seasonTitleListingApplicationsJson: listingApplicationsFile, seasonTitleListingCopyDryRunJson: listingCopyDryRunFile },
        details: { ...result.report.summary, listingQueueSkus: result.listingQueue.skus.length, actionSchemaSkus: actionSchema.length, actionSchemaActions: actionSchema.reduce((sum, item) => sum + item.actions.length, 0), listingApplications: listingApplications.summary.built, listingCopyDryRun: listingCopyDryRun.summary },
      };
    });

    await runStep('low_efficiency_candidates', async () => {
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const hasPools = !!(snapshot.lowEfficiencyRows && Object.values(snapshot.lowEfficiencyRows).some(arr => Array.isArray(arr) && arr.length));
      let outputs;
      let details;
      if (hasPools) {
        const pools = scanLowEfficiencyPools(snapshot, { now: new Date(timeContext.runAt || Date.now()) });
        const jsonFile = path.join(taskDir, `low_efficiency_pools_${timeContext.businessDate}.json`);
        writeJson(jsonFile, pools);
        manifest.outputFiles.lowEfficiencyPoolsJson = jsonFile;
        manifest.lowEfficiencyPools = pools.summary;
        outputs = { lowEfficiencyPoolsJson: jsonFile };
        details = { source: 'lowEfficiencyRows_pool', ...pools.summary };
      } else {
        const scan = scanLowEfficiencyCandidates(snapshot, { now: new Date(timeContext.runAt || Date.now()) });
        const jsonFile = path.join(taskDir, `low_efficiency_candidates_${timeContext.businessDate}.json`);
        writeJson(jsonFile, scan);
        manifest.outputFiles.lowEfficiencyCandidatesJson = jsonFile;
        manifest.lowEfficiencyCandidates = scan.summary;
        outputs = { lowEfficiencyCandidatesJson: jsonFile };
        details = { source: 'fallback_full_scan', ...scan.summary };
      }
      return { outputs, details };
    });

    await runStep('high_efficiency_rows', async () => {
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const jsonFile = path.join(taskDir, `high_efficiency_rows_${timeContext.businessDate}.json`);
      const scriptFile = path.join(ROOT, 'scripts', 'execute', 'fetch_high_efficiency_rows.js');
      const stdout = execFileSync(process.execPath, [scriptFile, 'all', '4', '7', '', jsonFile], { encoding: 'utf8' });
      const report = readJson(jsonFile, {});
      manifest.outputFiles.highEfficiencyRowsJson = jsonFile;
      manifest.highEfficiencyRows = {
        totalRows: Number(report.totalRows || 0),
        skuCount: Number(report.summary?.skuCount || 0),
        topSkus: (report.summary?.skus || []).slice(0, 20),
      };
      return {
        outputs: { highEfficiencyRowsJson: jsonFile },
        details: { ...manifest.highEfficiencyRows, stdout: stdout.trim() },
      };
    });

    await runStep('ad_structure_opportunities', async () => {
      const taskDir = path.join(ROOT, 'data', 'tasks');
      const jsonFile = path.join(taskDir, `ad_structure_opportunities_${timeContext.businessDate}.json`);
      const report = auditAdStructureOpportunities(snapshot);
      writeJson(jsonFile, report);
      manifest.outputFiles.adStructureOpportunitiesJson = jsonFile;
      manifest.adStructureOpportunities = report.summary;
      return {
        outputs: { adStructureOpportunitiesJson: jsonFile },
        details: report.summary,
      };
    });

    await runStep('kpi_recovery_overbudget_schema', async () => {
      if (options.explicitActionSchemaRequested) {
        const proactiveCounts = manifest.proactiveRecoveryActionSchema || {};
        if (Number(proactiveCounts.arrivalAdRecovery || 0) > 0) {
          manifest.warnings = [...(manifest.warnings || []), {
            code: 'explicit_schema_does_not_close_arrival_recovery',
            detail: `arrivalAdRecovery=${proactiveCounts.arrivalAdRecovery}; proactive schema generated but not selected as primary execution schema`,
          }];
        }
        return {
          skipped: true,
          outputs: {},
          details: {
            reason: 'explicit action schema requested; keeping provided schema',
            actionSchemaFile: path.resolve(options.actionSchemaFile),
            proactiveRecoveryActionSchemaJson: manifest.outputFiles.proactiveRecoveryActionSchemaJson || '',
            proactiveRecoveryActionSchema: proactiveCounts,
          },
        };
      }
      const schemaFile = path.join(SNAPSHOT_DATA_DIR, `kpi_recovery_overbudget_schema_${timeContext.businessDate}.json`);
      const summaryFile = path.join(ROOT, 'data', 'tasks', `kpi_recovery_overbudget_schema_summary_${timeContext.businessDate}.json`);
      const combinedSchemaFile = path.join(SNAPSHOT_DATA_DIR, `action_schema_${timeContext.businessDate}_daily_recovery_combined.json`);
      const { schema, summary } = buildKpiRecoveryOverBudgetSchema(snapshot, {
        actor: options.actor,
        currentDate: new Date(timeContext.siteLocalTime || timeContext.runAt || Date.now()),
      });
      const proactiveSchema = readJson(manifest.outputFiles.proactiveRecoveryActionSchemaJson || '', []);
      const combinedSchema = mergeActionSchemas([schema, proactiveSchema]);
      writeJson(schemaFile, schema);
      writeJson(combinedSchemaFile, combinedSchema);
      writeJson(summaryFile, {
        ...summary,
        schemaFile,
        proactiveSchemaFile: manifest.outputFiles.proactiveRecoveryActionSchemaJson || '',
        combinedSchemaFile,
        combined: countSchemaActions(combinedSchema),
        sourceSnapshotFile: snapshotFile,
        businessDate: timeContext.businessDate,
        dataDate: timeContext.dataDate,
      });
      options.actionSchemaFile = combinedSchemaFile;
      manifest.actionSchemaFile = path.resolve(combinedSchemaFile);
      manifest.outputFiles.kpiRecoveryOverBudgetSchemaJson = schemaFile;
      manifest.outputFiles.dailyRecoveryCombinedSchemaJson = combinedSchemaFile;
      manifest.outputFiles.kpiRecoveryOverBudgetSchemaSummaryJson = summaryFile;
      manifest.kpiRecoveryOverBudgetSchema = {
        plannedSkus: summary.plannedSkus,
        plannedActions: summary.plannedActions,
        matchedActionCount: summary.coverage?.matchedActionCount || 0,
        matchedCampaignCount: summary.coverage?.matchedCampaignCount || 0,
        actionableCampaigns: summary.coverage?.actionableCampaigns || 0,
        accountCap: summary.accountCap,
        counts: summary.counts,
      };
      manifest.dailyRecoveryCombinedSchema = countSchemaActions(combinedSchema);
      return {
        outputs: {
          kpiRecoveryOverBudgetSchemaJson: schemaFile,
          dailyRecoveryCombinedSchemaJson: combinedSchemaFile,
          kpiRecoveryOverBudgetSchemaSummaryJson: summaryFile,
        },
        details: {
          ...manifest.kpiRecoveryOverBudgetSchema,
          combined: manifest.dailyRecoveryCombinedSchema,
          proactiveRecoveryActionSchema: manifest.proactiveRecoveryActionSchema,
        },
      };
    });

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
      const executableActions = (loaded.plan || [])
        .flatMap(item => (item.actions || []).map(action => ({
          ...action,
          sku: action.sku || item.sku,
          asin: action.asin || item.asin,
          sourceTaskId: action.sourceTaskId || item.boardTaskId || '',
        })));
      const reviewActions = (scoped.review || [])
        .map(item => item.action ? ({
          ...item.action,
          sku: item.action.sku || item.sku,
          asin: item.action.asin || item.asin,
          sourceTaskId: item.action.sourceTaskId || item.boardTaskId || '',
        }) : null)
        .filter(Boolean);
      const planActions = executableActions.concat(reviewActions);
      agentPlanActions = planActions;
      const overBudgetCoverage = summarizeOverBudgetCoverage(snapshot, planActions);
      manifest.schemaValidation = summary;
      manifest.overBudgetCoverage = overBudgetCoverage;
      if (overBudgetCoverage.warning) {
        manifest.warnings = [...(manifest.warnings || []), {
          code: overBudgetCoverage.warning,
          detail: `overBudgetRows=${overBudgetCoverage.snapshotRows}, eligibleCampaigns=${overBudgetCoverage.eligibleCampaigns}, actionableCampaigns=${overBudgetCoverage.actionableCampaigns}, matchedActions=${overBudgetCoverage.matchedActionCount}`,
        }];
        console.warn(`[warn] over_budget coverage: ${overBudgetCoverage.warning} | rows=${overBudgetCoverage.snapshotRows} eligible=${overBudgetCoverage.eligibleCampaigns} actionable=${overBudgetCoverage.actionableCampaigns} matched=${overBudgetCoverage.matchedActionCount}`);
      }
      manifest.operatingClosure = buildOperatingClosure(manifest);
      manifest.actionQuality = buildActionQuality(manifest, options);
      manifest.outputFiles.validatedPlanFile = path.join(SNAPSHOTS_DIR, 'ai_decision_validated_plan.json');
      if (summary.errorCount > 0 && options.execute) {
        throw new Error(`schema validation failed: ${summary.errorCount} errors`);
      }
      return {
        outputs: {
          actionSchemaFile,
          validatedPlanFile: manifest.outputFiles.validatedPlanFile,
        },
        details: { ...summary, overBudgetCoverage },
      };
    });

    await runStep('dry_run', async () => {
      const result = await run({
        actionSchemaFile: path.resolve(options.actionSchemaFile),
        snapshotFile,
        dryRun: true,
        fastScope: options.mode !== 'full-snapshot',
        timeContext,
        sourceRunId: runId,
      });
      manifest.outputFiles.dryRunFile = result?.files?.dryRunFile || path.join(SNAPSHOTS_DIR, `execution_dry_run_${today}.json`);
      const planForLog = readJson(result?.files?.planFile || path.join(SNAPSHOTS_DIR, `plan_${today}.json`), []);
      const logResult = appendAdjustmentRecords(recordsFromPlan(planForLog, timeContext, { dryRun: true }), { timeContext });
      manifest.outputFiles.dryRunAdjustmentLogFile = logResult.file;
      manifest.actionQuality = buildActionQuality(manifest, options);
      return {
        outputs: { ...(result?.files || {}), dryRunAdjustmentLogFile: logResult.file },
        details: { ...(result?.dryReport || {}), adjustmentLogCount: logResult.count },
      };
    });

    let executeResult = null;
    if (options.execute) {
      executeResult = await runStep('execute_verify_note', async () => {
        const result = await run({
          actionSchemaFile: path.resolve(options.actionSchemaFile),
          snapshotFile,
          dryRun: false,
          fastScope: options.mode !== 'full-snapshot',
          timeContext,
          sourceRunId: runId,
        });
        Object.assign(manifest.outputFiles, result?.files || {});
        const verify = readJson(result?.files?.verifyFile || '', {});
        const executionLogResult = appendAdjustmentRecords(
          recordsFromExecutionEvents([...(verify.events || []), ...(verify.nonExecutionEvents || [])], timeContext),
          { timeContext }
        );
        manifest.outputFiles.executeAdjustmentLogFile = executionLogResult.file;
        manifest.actionQuality = buildActionQuality(manifest, options);
        return {
          outputs: { ...(result?.files || {}), executeAdjustmentLogFile: executionLogResult.file },
          details: {
            report: result?.report || {},
            verificationBlocked: (result?.verificationBlocked || []).map(item => summarizeAction(item.action, item.sku)),
            adjustmentLogCount: executionLogResult.count,
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
    manifest.actionQuality = buildActionQuality(manifest, options);
    manifest.runQuality = buildRunQuality(manifest, options);

    await runStep('agent_control_ledger', async () => {
      const agentDir = path.join(ROOT, 'data', 'agent');
      const ledgerFile = path.join(agentDir, `agent_ledger_${timeContext.businessDate}.json`);
      const ledger = buildAgentLedger({
        timeContext,
        tasks: dailyTaskPoolToAgentTasks(dailyTaskPool || {}),
        actions: agentPlanActions,
      });
      writeJson(ledgerFile, ledger);
      manifest.outputFiles.agentLedgerJson = ledgerFile;
      manifest.agentLedger = ledger.summary;
      return {
        outputs: { agentLedgerJson: ledgerFile },
        details: ledger.summary,
      };
    });

    await runStep('daily_learning', async () => {
      const adjustmentLogFile = manifest.outputFiles.executeAdjustmentLogFile || manifest.outputFiles.dryRunAdjustmentLogFile || '';
      const adjustmentRecords = readJson(adjustmentLogFile, []);
      const result = persistDailyLearning({
        timeContext,
        snapshot,
        snapshotFile,
        taskPool: dailyTaskPool,
        manifest,
        adjustmentRecords,
      });
      manifest.outputFiles.dailyLearningJson = result.jsonFile;
      manifest.outputFiles.dailyLearningMarkdown = result.mdFile;
      manifest.dailyLearning = {
        file: result.jsonFile,
        baselineQuality: result.record.dataQuality.baselineQuality,
        productCards: result.record.dataQuality.productCards,
        plannedActions: result.record.decisions.plannedActions,
        warnings: result.record.dataQuality.warnings,
        actionQuality: result.record.decisions.actionQuality?.status || '',
        runQuality: result.record.decisions.runQuality?.status || '',
      };
      return {
        outputs: { dailyLearningJson: result.jsonFile, dailyLearningMarkdown: result.mdFile },
        details: manifest.dailyLearning,
      };
    });

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
    manifest.operatingClosure = buildOperatingClosure(manifest);
    manifest.actionQuality = buildActionQuality(manifest, options);
    manifest.runQuality = buildRunQuality(manifest, options);
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
    manifest.actionQuality = buildActionQuality(manifest, options);
    manifest.runQuality = buildRunQuality(manifest, options);
    persist();
    console.error(JSON.stringify(buildRunSummary(manifest), null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildActionQuality,
  buildFetchOptions,
  buildKpiRecoveryOverBudgetSchema,
  buildProductMap,
  buildProactiveRecoveryActionSchema,
  countSchemaActions,
  buildRunQuality,
  buildRunSummary,
  buildSnapshotDataQuality,
  dailyTaskPoolToAgentTasks,
  getSnapshotStepPlan,
  mergeActionSchemas,
  parseArgs,
  summarizeKpiRecoveryOverBudgetSchema,
  validateSnapshotFile,
  writeTextFileWithRetry,
};
