const fs = require('fs');
const path = require('path');
const { createPanelWs, SNAPSHOTS_DIR } = require('../../src/adjust_lib');
const {
  DEFAULT_CACHE_FILE,
  enrichSnapshotWithProfiles,
  loadProfileCache,
  saveProfileCache,
} = require('../../src/product_profile');
const DEFAULT_LISTING_CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'listing_cache.json');

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (_) {
    return fallback;
  }
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
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

function overBudgetDataAvailability(date = new Date()) {
  const parts = chinaClockParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  const cutoffMinutes = 16 * 60;
  return {
    source: 'adv_over_budget_board',
    localDate: parts.date,
    localTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
    timezone: 'Asia/Shanghai',
    dailyCutoffLocalTime: '16:00:00',
    freshAtExport: minutes < cutoffMinutes,
    status: minutes < cutoffMinutes ? 'fresh_window' : 'late_window',
    warning: minutes < cutoffMinutes
      ? ''
      : '超预算抓取已过 16:00 新鲜窗口；若接口仍返回明细则继续使用，若无明细则标记 partial/missing_rows。',
  };
}

function buildOverBudgetAvailability(overBudgetRows = [], overBudgetMeta = {}, date = new Date()) {
  const base = overBudgetDataAvailability(date);
  const rowCount = Array.isArray(overBudgetRows) ? overBudgetRows.length : 0;
  const fetchStatus = overBudgetMeta?.status || '';
  let moduleStatus = 'partial';
  let reason = 'missing_rows';

  if (fetchStatus === 'complete' || fetchStatus === 'complete_empty') {
    moduleStatus = fetchStatus === 'complete_empty' ? 'complete_empty' : 'complete';
    reason = rowCount ? '' : 'no_over_budget_rows_returned';
  } else if (fetchStatus === 'partial') {
    reason = overBudgetMeta.reason || 'fetch_partial';
  } else if (base.status === 'late_window') {
    reason = 'late_window_missing_rows';
  }

  return {
    ...base,
    moduleStatus,
    status: moduleStatus === 'complete' || moduleStatus === 'complete_empty' ? moduleStatus : base.status,
    rowCount,
    reason,
    fetchStatus,
    meta: overBudgetMeta || {},
  };
}

function normalizeExportOptions(input) {
  if (typeof input === 'string') return { outputFile: input };
  return input || {};
}

async function exportSnapshot(input = '') {
  const options = normalizeExportOptions(input);
  const resolvedOutputFile =
    options.outputFile ||
    process.env.EXPORT_SNAPSHOT_FILE ||
    path.join(SNAPSHOTS_DIR, `panel_snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));

  await new Promise(resolve => ws.on('open', resolve));

  const evalInPanel = (expression, awaitPromise = false) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', handler);
      resolve(response.result && response.result.result && response.result.result.value);
    };
    ws.on('message', handler);
    send({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    });
  });

  const listingCacheFile = options.listingCacheFile || process.env.LISTING_CACHE_FILE || DEFAULT_LISTING_CACHE_FILE;
  const listingCache = readJsonFile(listingCacheFile, { entries: {} });
  const fetchOptions = options.fetchOptions || {};

  await evalInPanel(`globalThis.__AD_OPS_FETCH_OPTIONS = ${JSON.stringify(fetchOptions)}; true`, false);
  await evalInPanel(`globalThis.__AD_OPS_LISTING_CACHE = ${JSON.stringify(listingCache)}; true`, false);
  await evalInPanel('fetchAllData(globalThis.__AD_OPS_FETCH_OPTIONS).then(()=>true)', true);

  const overBudgetRows = parseJson(await evalInPanel('JSON.stringify(STATE.overBudgetRows || [])'), []);
  const overBudgetMeta = parseJson(await evalInPanel('JSON.stringify(STATE.overBudgetMeta || {})'), {});

  const snapshot = {
    exportedAt: new Date().toISOString(),
    dataAvailability: {
      overBudget: buildOverBudgetAvailability(overBudgetRows, overBudgetMeta),
    },
    productCards: parseJson(await evalInPanel('JSON.stringify(STATE.productCards)'), []),
    kwRows: parseJson(await evalInPanel('JSON.stringify(STATE.kwRows)'), []),
    autoRows: parseJson(await evalInPanel('JSON.stringify(STATE.autoRows)'), []),
    targetRows: parseJson(await evalInPanel('JSON.stringify(STATE.targetRows)'), []),
    productAdRows: parseJson(await evalInPanel('JSON.stringify(STATE.productAdRows || [])'), []),
    sbRows: parseJson(await evalInPanel('JSON.stringify(STATE.sbRows)'), []),
    sbCampaignRows: parseJson(await evalInPanel('JSON.stringify(STATE.sbCampaignRows || [])'), []),
    adSkuSummaryRows: parseJson(await evalInPanel('JSON.stringify(STATE.adSkuSummaryRows || [])'), []),
    advProductManageRows: parseJson(await evalInPanel('JSON.stringify(STATE.advProductManageRows || [])'), []),
    sbCampaignManageRows: parseJson(await evalInPanel('JSON.stringify(STATE.sbCampaignManageRows || [])'), []),
    overBudgetRows,
    overBudgetMeta,
    sellerSalesRows: parseJson(await evalInPanel('JSON.stringify(STATE.sellerSalesRows || [])'), []),
    sellerSalesMeta: parseJson(await evalInPanel('JSON.stringify(STATE.sellerSalesMeta || {})'), {}),
    salesHistoryMap: parseJson(await evalInPanel('JSON.stringify(STATE.salesHistoryMap || {})'), {}),
    inventoryScopeRows: parseJson(await evalInPanel('JSON.stringify(STATE.inventoryScopeRows || [])'), []),
    productChartMap: parseJson(await evalInPanel('JSON.stringify(STATE.productChartMap || {})'), {}),
    listingFetchMeta: parseJson(await evalInPanel('JSON.stringify(STATE.listingFetchMeta || {})'), {}),
    fetchMetrics: parseJson(await evalInPanel('JSON.stringify(STATE.fetchMetrics || {})'), {}),
    invMap: parseJson(await evalInPanel('JSON.stringify(STATE.invMap || {})'), {}),
    sp7DayUntouchedRows: parseJson(await evalInPanel('JSON.stringify(STATE.sp7DayUntouchedRows || [])'), []),
    sb7DayUntouchedRows: parseJson(await evalInPanel('JSON.stringify(STATE.sb7DayUntouchedRows || [])'), []),
    sevenDayUntouchedMeta: parseJson(await evalInPanel('JSON.stringify(STATE.sevenDayUntouchedMeta || {})'), {}),
  };

  const cacheFile = process.env.PRODUCT_PROFILE_CACHE || DEFAULT_CACHE_FILE;
  const cache = loadProfileCache(cacheFile);
  const profiled = enrichSnapshotWithProfiles(snapshot, { cache, cacheFile });
  saveProfileCache(profiled.cache, cacheFile);
  const updatedListingCache = parseJson(await evalInPanel('JSON.stringify(globalThis.__AD_OPS_LISTING_CACHE || { entries: {} })'), { entries: {} });
  writeJsonFile(listingCacheFile, updatedListingCache);

  writeJsonFile(resolvedOutputFile, profiled.snapshot);
  ws.close();
  return {
    outputFile: resolvedOutputFile,
    snapshot: profiled.snapshot,
    profileMeta: profiled.meta,
    listingCacheFile,
  };
}

async function main() {
  const result = await exportSnapshot(process.argv[2] || '');
  console.log(result.outputFile);
  console.error(`productProfile: ${JSON.stringify(result.profileMeta)}`);
}

module.exports = {
  exportSnapshot,
};

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
