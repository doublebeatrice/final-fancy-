const fs = require('fs');
const path = require('path');
const { createPanelWs } = require('../../src/adjust_lib');
const { writeSeasonTitleReport } = require('../generate_season_title_dry_run');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SNAPSHOT_FILE = path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const DEFAULT_LISTING_CACHE_FILE = path.join(ROOT, 'data', 'listing_cache.json');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    queue: get('--queue') || '',
    out: get('--out') || '',
    snapshot: get('--snapshot') || DEFAULT_SNAPSHOT_FILE,
    listingCache: get('--listing-cache') || DEFAULT_LISTING_CACHE_FILE,
    limit: Number(get('--limit') || 120),
    timeoutMs: Number(get('--timeout-ms') || process.env.SEASON_TITLE_LISTING_FETCH_TIMEOUT_MS || 90000),
    rerunReport: !args.includes('--no-rerun-report'),
    execute: args.includes('--execute'),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function latestQueueFile() {
  const taskDir = path.join(ROOT, 'data', 'tasks');
  if (!fs.existsSync(taskDir)) return '';
  return fs.readdirSync(taskDir)
    .filter(name => /^season_title_listing_queue_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(taskDir, name))
    .filter(file => fs.existsSync(file) && fs.statSync(file).size > 3)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function resolveQueueFile(options = {}) {
  const file = options.queue ? path.resolve(options.queue) : latestQueueFile();
  if (!file) throw new Error('missing season title listing queue; run season title dry-run first');
  if (!fs.existsSync(file)) throw new Error(`queue file not found: ${file}`);
  return file;
}

function normalizeSkus(values = []) {
  return [...new Set(values
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

function listingDomainForSalesChannel(salesChannel = '') {
  const text = String(salesChannel || '').trim();
  if (text === 'Amazon.com' || !text) return 'amazon.com';
  if (text === 'Amazon.co.uk') return 'amazon.co.uk';
  return '';
}

function listingMapKey(domain, asin) {
  return `${String(domain || 'amazon.com').toLowerCase()}|${String(asin || '').trim().toUpperCase()}`;
}

function readListingQueue(file) {
  const raw = readJson(file);
  const skus = normalizeSkus(Array.isArray(raw.skus)
    ? raw.skus
    : (raw.items || []).map(item => item.sku));
  return {
    ...raw,
    skus,
  };
}

function buildFetchOptionsFromQueue(queue = {}, options = {}) {
  const limit = Number(options.limit || queue.skus?.length || 120);
  const listingSkus = normalizeSkus(queue.skus || []).slice(0, limit);
  return {
    mode: 'fast',
    listingStrategy: listingSkus.length ? 'schema' : 'none',
    listingSkus,
    listingLimit: listingSkus.length,
    listingConcurrency: Number(options.listingConcurrency || process.env.AD_OPS_LISTING_FETCH_CONCURRENCY || 5),
    listingTimeoutMs: Number(options.listingTimeoutMs || process.env.AD_OPS_LISTING_FETCH_TIMEOUT_MS || 10000),
    listingRetry: Number(options.listingRetry || process.env.AD_OPS_LISTING_FETCH_RETRY || 1),
    listingStageTimeoutMs: Number(options.listingStageTimeoutMs || process.env.AD_OPS_LISTING_FETCH_STAGE_TIMEOUT_MS || 120000),
    listingCacheTtlMs: Number(options.listingCacheTtlMs || process.env.AD_OPS_LISTING_CACHE_TTL_MS || (7 * 24 * 60 * 60 * 1000)),
    listingOptional: false,
    chartStrategy: 'none',
    chartSkus: [],
    salesHistoryStrategy: 'none',
    salesHistorySkus: [],
    salesHistoryLimit: 0,
  };
}

function buildListingFetchTasksFromQueue(queue = {}, snapshot = {}, options = {}) {
  const limit = Number(options.limit || queue.skus?.length || 120);
  const wantedSkus = normalizeSkus(queue.skus || []).slice(0, limit);
  const wanted = new Set(wantedSkus.map(sku => sku.toUpperCase()));
  const seenKeys = new Set();
  const tasks = [];
  for (const card of snapshot.productCards || []) {
    const sku = String(card?.sku || '').trim();
    if (!sku || !wanted.has(sku.toUpperCase())) continue;
    const asin = String(card.asin || '').trim().toUpperCase();
    if (!asin) continue;
    const domain = listingDomainForSalesChannel(card.salesChannel);
    if (domain !== 'amazon.com') continue;
    const key = listingMapKey(domain, asin);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    tasks.push({ sku, asin, domain, key });
  }
  return tasks;
}

function defaultOutputFile(queueFile) {
  const date = path.basename(queueFile).match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
  return path.join(ROOT, 'data', 'snapshots', `season_title_listing_fetch_${date}.json`);
}

function dateFromQueueFile(queueFile) {
  return path.basename(queueFile).match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
}

function reportPathsForFetch(queueFile) {
  const date = dateFromQueueFile(queueFile);
  return {
    outJson: path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${date}.json`),
    outMd: path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${date}.md`),
    outQueue: path.join(ROOT, 'data', 'tasks', `season_title_listing_queue_${date}.json`),
  };
}

function runWithTimeout(fn, timeoutMs, label = 'operation') {
  const ms = Number(timeoutMs || 0);
  if (!ms || ms <= 0) return Promise.resolve().then(fn);
  let timer = null;
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function evalInPanel(ws, expression, awaitPromise = false) {
  const send = msg => ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', handler);
      if (response.error) {
        reject(new Error(response.error.message || JSON.stringify(response.error)));
        return;
      }
      if (response.result?.exceptionDetails) {
        const detail = response.result.exceptionDetails;
        reject(new Error(detail.exception?.description || detail.text || 'panel evaluation failed'));
        return;
      }
      resolve(response.result && response.result.result && response.result.result.value);
    };
    ws.on('message', handler);
    send({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    });
  });
}

async function fetchListingsDirectly(options = {}) {
  const snapshotFile = path.resolve(options.snapshotFile || DEFAULT_SNAPSHOT_FILE);
  const listingCacheFile = path.resolve(options.listingCacheFile || DEFAULT_LISTING_CACHE_FILE);
  const snapshot = readJson(snapshotFile);
  const listingCache = fs.existsSync(listingCacheFile) ? readJson(listingCacheFile) : { entries: {} };
  const tasks = buildListingFetchTasksFromQueue(options.queue || {}, snapshot, { limit: options.limit });
  if (!tasks.length) {
    throw new Error('listing queue has no Amazon.com ASIN tasks after matching latest snapshot');
  }

  const fetchOptions = buildFetchOptionsFromQueue(options.queue || {}, {
    limit: options.limit,
    listingConcurrency: options.listingConcurrency,
    listingTimeoutMs: options.listingTimeoutMs,
    listingRetry: options.listingRetry,
    listingStageTimeoutMs: options.listingStageTimeoutMs,
    listingCacheTtlMs: options.listingCacheTtlMs,
  });
  fetchOptions.listingSkus = tasks.map(task => task.sku);
  fetchOptions.listingLimit = tasks.length;
  fetchOptions.listingStrategy = 'season_title_queue_direct';

  const ws = await createPanelWs();
  await new Promise(resolve => ws.on('open', resolve));
  try {
    const expression = `
      (async () => {
        const tasks = ${JSON.stringify(tasks)};
        const fetchOptions = ${JSON.stringify(fetchOptions)};
        globalThis.__AD_OPS_LISTING_CACHE = ${JSON.stringify(listingCache)};
        if (typeof STATE === 'undefined') throw new Error('extension panel STATE is not available');
        if (typeof fetchListingsConcurrent !== 'function') {
          throw new Error('fetchListingsConcurrent is not available in extension panel');
        }
        STATE.listingMap = STATE.listingMap || {};
        STATE.listingFetchMeta = {
          listingStrategy: 'season_title_queue_direct',
          maxListings: tasks.length,
          skippedByLimitOrMarket: 0
        };
        await fetchListingsConcurrent(tasks, () => {}, fetchOptions);
        return JSON.stringify({
          listingFetchMeta: STATE.listingFetchMeta || {},
          listingCache: globalThis.__AD_OPS_LISTING_CACHE || { entries: {} }
        });
      })()
    `;
    const raw = await evalInPanel(ws, expression, true);
    const result = JSON.parse(raw || '{}');
    writeJson(listingCacheFile, result.listingCache || { entries: {} });
    return {
      snapshotFile,
      listingCacheFile,
      tasks,
      fetchOptions,
      listingFetchMeta: result.listingFetchMeta || {},
    };
  } finally {
    ws.close();
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const queueFile = resolveQueueFile(options);
  const queue = readListingQueue(queueFile);
  const snapshotFile = path.resolve(options.snapshot);
  const listingCacheFile = path.resolve(options.listingCache);
  const snapshot = readJson(snapshotFile);
  const listingTasks = buildListingFetchTasksFromQueue(queue, snapshot, { limit: options.limit });
  const fetchOptions = buildFetchOptionsFromQueue(queue, { limit: options.limit });
  fetchOptions.listingSkus = listingTasks.map(task => task.sku);
  fetchOptions.listingLimit = listingTasks.length;
  fetchOptions.listingStrategy = listingTasks.length ? 'season_title_queue_direct' : 'none';
  const out = options.out ? path.resolve(options.out) : defaultOutputFile(queueFile);
  const plan = {
    dryRun: !options.execute,
    queueFile,
    snapshotFile,
    listingCacheFile,
    out,
    fetchOptions,
    listingTasks,
    timeoutMs: options.timeoutMs,
    skuCount: fetchOptions.listingSkus.length,
  };

  if (!options.execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (!fetchOptions.listingSkus.length) {
    throw new Error(`queue has no SKUs: ${queueFile}`);
  }
  const result = await runWithTimeout(
    () => fetchListingsDirectly({
      queue,
      snapshotFile,
      listingCacheFile,
      limit: options.limit,
    }),
    options.timeoutMs,
    'season title listing fetch'
  );
  const summary = {
    ...plan,
    dryRun: false,
    outputFile: out,
    listingCacheFile: result.listingCacheFile,
    listingFetchMeta: result.listingFetchMeta || {},
  };
  writeJson(out, summary);
  if (options.rerunReport) {
    const paths = reportPathsForFetch(queueFile);
    const reportResult = writeSeasonTitleReport({
      snapshot,
      snapshotFile,
      listingCacheFile,
      businessDate: dateFromQueueFile(queueFile),
      outJson: paths.outJson,
      outMd: paths.outMd,
      outQueue: paths.outQueue,
    });
    summary.rerunReport = {
      outJson: reportResult.outJson,
      outMd: reportResult.outMd,
      outQueue: reportResult.outQueue,
      summary: reportResult.report.summary,
    };
  }
  const summaryFile = out.replace(/\.json$/i, '_summary.json');
  writeJson(summaryFile, summary);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildListingFetchTasksFromQueue,
  buildFetchOptionsFromQueue,
  fetchListingsDirectly,
  latestQueueFile,
  readListingQueue,
  reportPathsForFetch,
  resolveQueueFile,
  runWithTimeout,
};
