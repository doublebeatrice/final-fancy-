const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const { loadProtectedListingSkus } = require('../src/listing_copy_protection');
const { buildSeasonTitleDryRun } = require('../src/season_title_opportunity');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    snapshot: get('--snapshot') || process.env.TODAY_TASK_SNAPSHOT || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    events: get('--events') || path.join(ROOT, 'data', 'season_events_2026.json'),
    businessDate: get('--business-date') || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    horizonDays: Number(get('--horizon-days') || 60),
    topSalesLimit: Number(get('--top-sales-limit') || 50),
    outJson: get('--out-json') || '',
    outMd: get('--out-md') || '',
    outQueue: get('--out-queue') || '',
    limit: Number(get('--limit') || 120),
    listingCache: get('--listing-cache') || path.join(ROOT, 'data', 'listing_cache.json'),
    protectedListingSkus: get('--protected-listing-skus') || path.join(ROOT, 'data', 'listing_copy_protected_skus.json'),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function attachListingCache(snapshot = {}, cache = {}) {
  const entries = cache.entries || {};
  if (!entries || !Object.keys(entries).length) return snapshot;
  const byAsin = new Map();
  for (const entry of Object.values(entries)) {
    const payload = entry?.payload || entry?.listing || entry;
    if (payload?.asin) byAsin.set(String(payload.asin).toUpperCase(), payload);
  }
  return {
    ...snapshot,
    productCards: (snapshot.productCards || []).map(card => {
      const asin = String(card.asin || '').toUpperCase();
      if (!asin || card.listing?.title || !byAsin.has(asin)) return card;
      return { ...card, listing: byAsin.get(asin) };
    }),
  };
}

function renderMarkdown(report = {}, limit = 120) {
  const rows = (report.items || []).slice(0, limit);
  const lines = [
    `# Season Title Dry Run ${report.businessDate}`,
    '',
    `- Products scanned: ${report.summary?.productsScanned || 0}`,
    `- Events loaded: ${report.summary?.eventsLoaded || 0}`,
    `- Items: ${report.summary?.items || 0}`,
    `- High-sales reminders: ${report.summary?.highSalesReminders || 0}`,
    `- Auto-executable candidates: ${report.summary?.autoExecutable || 0}`,
    '',
    '| SKU | ASIN | Decision | Event | Status | Expired Title Events | Suggested Title | Ad Actions |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const item of rows) {
    const expired = (item.expiredTitleEvents || []).map(event => event.name).join(', ');
    const adActions = (item.adActions || []).map(action =>
      `${action.mode}:${action.campaignName}:bid=${action.defaultBid}:budget=${action.dailyBudget}`
    ).join('<br>');
    lines.push([
      item.sku,
      item.asin,
      item.titleDecision,
      item.selectedEvent?.name || '',
      item.selectedStatus || '',
      expired,
      item.suggestedTitle || '',
      adActions || item.adDecision,
    ].map(value => String(value || '').replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return `${lines.join('\n')}\n`;
}

function buildSeasonTitleReport(options = {}) {
  const snapshotRaw = options.snapshot || readJson(path.resolve(options.snapshotFile || options.snapshot || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json')));
  const eventsFile = path.resolve(options.eventsFile || options.events || path.join(ROOT, 'data', 'season_events_2026.json'));
  const listingCacheFile = path.resolve(options.listingCacheFile || options.listingCache || path.join(ROOT, 'data', 'listing_cache.json'));
  const protectedListingSkusFile = path.resolve(options.protectedListingSkusFile || options.protectedListingSkus || path.join(ROOT, 'data', 'listing_copy_protected_skus.json'));
  const events = options.events || readJson(eventsFile);
  let listingCache = { entries: {} };
  try {
    listingCache = options.listingCacheData || readJson(listingCacheFile);
  } catch (_) {
    listingCache = { entries: {} };
  }
  const snapshot = attachListingCache(snapshotRaw, listingCache);
  const protectedListingSkus = options.protectedListingSkusData || loadProtectedListingSkus(protectedListingSkusFile);
  const businessDate = options.businessDate;
  if (!businessDate) throw new Error('businessDate is required');
  const report = buildSeasonTitleDryRun({
    snapshot,
    events,
    businessDate,
    horizonDays: options.horizonDays || 60,
    topSalesLimit: options.topSalesLimit ?? 50,
    protectedListingSkus,
  });
  report.snapshotFile = options.snapshotFile ? path.resolve(options.snapshotFile) : '';
  report.eventsFile = eventsFile;
  report.listingCacheFile = listingCacheFile;
  report.protectedListingSkusFile = protectedListingSkusFile;
  return report;
}

function writeSeasonTitleReport(options = {}) {
  const report = buildSeasonTitleReport(options);
  const outJson = options.outJson || path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${report.businessDate}.json`);
  const outMd = options.outMd || path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${report.businessDate}.md`);
  const outQueue = options.outQueue || path.join(ROOT, 'data', 'tasks', `season_title_listing_queue_${report.businessDate}.json`);
  const listingQueue = {
    businessDate: report.businessDate,
    reason: 'season_title_candidates_missing_current_listing_title',
    skus: [...new Set((report.items || [])
      .filter(item => item.titleDecision === 'review_missing_current_title')
      .map(item => item.sku)
      .filter(Boolean))],
    items: (report.items || [])
      .filter(item => item.titleDecision === 'review_missing_current_title')
      .map(item => ({
        sku: item.sku,
        asin: item.asin,
        selectedEvent: item.selectedEvent?.name || '',
        selectedStatus: item.selectedStatus || '',
        adActions: (item.adActions || []).length,
      })),
  };
  writeJson(outJson, report);
  fs.writeFileSync(outMd, renderMarkdown(report, options.limit || 120), 'utf8');
  writeJson(outQueue, listingQueue);
  return { report, outJson, outMd, outQueue, listingQueue };
}

function main() {
  const options = parseArgs(process.argv);
  const snapshotFile = path.resolve(options.snapshot);
  const eventsFile = path.resolve(options.events);
  const snapshotRaw = readJson(snapshotFile);
  const events = readJson(eventsFile);
  if (!Array.isArray(snapshotRaw.productCards) || snapshotRaw.productCards.length === 0) {
    throw new Error(`missing usable productCards snapshot: ${snapshotFile}`);
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`missing usable season events: ${eventsFile}`);
  }

  const time = buildOpsTimeContext({
    site: options.site,
    businessDate: options.businessDate || undefined,
    sourceRunId: `season_title_dry_run_${options.businessDate || new Date().toISOString().slice(0, 10)}`,
  });
  const result = writeSeasonTitleReport({
    snapshot: snapshotRaw,
    events,
    eventsFile,
    listingCacheFile: options.listingCache,
    protectedListingSkusFile: options.protectedListingSkus,
    businessDate: time.businessDate,
    horizonDays: options.horizonDays,
    topSalesLimit: options.topSalesLimit,
    outJson: options.outJson || path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${time.businessDate}.json`),
    outMd: options.outMd || path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${time.businessDate}.md`),
    outQueue: options.outQueue || path.join(ROOT, 'data', 'tasks', `season_title_listing_queue_${time.businessDate}.json`),
    limit: options.limit,
  });
  const { report, outJson, outMd, outQueue } = result;
  report.time = time;
  report.snapshotFile = snapshotFile;
  writeJson(outJson, report);
  console.log(JSON.stringify({
    outJson,
    outMd,
    outQueue,
    businessDate: time.businessDate,
    summary: report.summary,
    top: report.items.slice(0, 10).map(item => ({
      sku: item.sku,
      decision: item.titleDecision,
      event: item.selectedEvent?.name || '',
      expired: (item.expiredTitleEvents || []).map(event => event.name),
      adActions: item.adActions.length,
    })),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  attachListingCache,
  buildSeasonTitleReport,
  main,
  renderMarkdown,
  writeSeasonTitleReport,
};
