const fs = require('fs');
const path = require('path');
const {
  buildExtendedSelectionReport,
  buildExtendedSelectionRequests,
  normalizePresets,
  PRESET_CATALOG,
  siteNameFor,
} = require('../../src/selection_extended_evidence');
const {
  buildRequestUrl,
  canonicalizeEndpoint,
  ensureSelectionReady,
  fetchSelectionApiInTab,
  findSelectionTab,
  isReadOnlySelectionRequest,
  parseArgs,
  safeFileSegment,
} = require('./fetch_selection_api');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function defaultOutputFile(options = {}) {
  const preset = String(options.preset || options.presets || 'home-overview');
  const label = safeFileSegment(`extended_${preset}`);
  return path.join(OUT_DIR, `selection_${label}_${todayYmd()}.json`);
}

function materializeRequest(request = {}) {
  const endpoint = canonicalizeEndpoint(request.endpoint);
  const url = buildRequestUrl(endpoint, request.query || {});
  return {
    ...request,
    endpoint,
    url,
    method: request.method || 'GET',
  };
}

function hasRankDate(options = {}, kind = 'bsr') {
  if (options.rankDate || options['rank-date'] || options.uTime || options['u-time'] || options.day || options.date) return true;
  if (kind === 'new-releases') {
    return !!(options.newReleasesRankDate || options['new-releases-rank-date'] || options.nsrRankDate || options['nsr-rank-date']);
  }
  return !!(options.bsrRankDate || options['bsr-rank-date']);
}

function hasCategoryAnalysisDate(options = {}) {
  return !!(
    options.categoryAnalysisDate || options['category-analysis-date'] ||
    options.categoryDate || options['category-date'] ||
    options.uTime || options['u-time'] ||
    options.week || options.date
  );
}

function siteDateKey(kind = 'bsr', site = '1') {
  const label = kind === 'new-releases' ? 'NSR榜单' : 'BSR榜单';
  return `${label}=>${siteNameFor(site)}=>day`;
}

async function hydrateDailyRankDates(options = {}, tab) {
  const requestedPresets = normalizePresets(options.preset || options.presets);
  const needsBsr = requestedPresets.includes('bsr-list') && !hasRankDate(options, 'bsr');
  const needsNewReleases = requestedPresets.includes('new-releases') && !hasRankDate(options, 'new-releases');
  const needsCategoryAnalysis = requestedPresets.includes('category-analysis') && !hasCategoryAnalysisDate(options);
  if (!needsBsr && !needsNewReleases && !needsCategoryAnalysis) {
    return {
      rankDates: {
        bsrList: options.bsrRankDate || options['bsr-rank-date'] || options.rankDate || options['rank-date'] || options.uTime || options['u-time'] || '',
        newReleases: options.newReleasesRankDate || options['new-releases-rank-date'] || options.nsrRankDate || options['nsr-rank-date'] || options.rankDate || options['rank-date'] || options.uTime || options['u-time'] || '',
      },
      categoryDates: {
        categoryAnalysis: options.categoryAnalysisDate || options['category-analysis-date'] || options.categoryDate || options['category-date'] || options.uTime || options['u-time'] || '',
      },
    };
  }

  const endpoint = canonicalizeEndpoint('/brandAnalytics/usBrandAnalytics/getSiteDateNew');
  const request = {
    key: 'siteDateConfig',
    label: 'selection available date config',
    endpoint,
    method: 'GET',
    query: {},
    body: null,
    url: buildRequestUrl(endpoint, {}),
  };
  const api = await fetchSelectionApiInTab(tab, request);
  const result = api.result || {};
  const site = options.site || '1';
  const runtimeContext = {
    dateConfig: {
      ok: !!api.ok,
      endpoint,
      source: 'brandAnalytics/usBrandAnalytics/getSiteDateNew',
      version: result.version || null,
    },
    rankDates: {},
    categoryDates: {},
  };

  if (needsBsr) {
    const key = siteDateKey('bsr', site);
    const maxDay = result[key]?.maxDay || '';
    if (maxDay) options.bsrRankDate = maxDay;
    runtimeContext.rankDates.bsrList = maxDay;
    runtimeContext.dateConfig.bsrKey = key;
  }
  if (needsNewReleases) {
    const key = siteDateKey('new-releases', site);
    const maxDay = result[key]?.maxDay || '';
    if (maxDay) options.newReleasesRankDate = maxDay;
    runtimeContext.rankDates.newReleases = maxDay;
    runtimeContext.dateConfig.newReleasesKey = key;
  }
  if (needsCategoryAnalysis) {
    const key = '类目分析';
    const maxWeek = result[key]?.[siteNameFor(site)]?.week || '';
    if (maxWeek) options.categoryAnalysisDate = maxWeek;
    runtimeContext.categoryDates.categoryAnalysis = maxWeek;
    runtimeContext.dateConfig.categoryAnalysisKey = `${key}.${siteNameFor(site)}.week`;
  }
  return runtimeContext;
}

async function run(options = {}) {
  if (options.help || options.h === '1') {
    return {
      outputFile: '',
      report: {
        ok: true,
        presets: PRESET_CATALOG,
      },
    };
  }

  const tab = await findSelectionTab();
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (options['skip-ready'] !== '1') await ensureSelectionReady(tab);

  const hydratedOptions = { ...options };
  const runtimeContext = await hydrateDailyRankDates(hydratedOptions, tab);
  const built = buildExtendedSelectionRequests(hydratedOptions);
  const requests = built.requests.map(materializeRequest);
  for (const request of requests) {
    if (!options['allow-unsafe'] && !isReadOnlySelectionRequest(request)) {
      throw new Error(`blocked non-read-only selection API request: ${request.method} ${request.url}`);
    }
  }

  const apiResults = [];
  for (const request of requests) {
    const api = await fetchSelectionApiInTab(tab, request);
    apiResults.push({ request, api });
  }

  const report = buildExtendedSelectionReport({
    requestedPresets: built.presets,
    requests,
    apiResults,
    pendingPresets: built.pendingPresets,
    runtimeContext,
  });
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile(options);
  writeJson(outputFile, report);
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  if (!options.preset && positional[0]) options.preset = positional[0];
  const { outputFile, report } = await run(options);
  if (options.help || options.h === '1') {
    console.log(JSON.stringify(report.presets, null, 2));
    return;
  }
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    requestedPresets: report.requestedPresets,
    evidenceBoundary: report.evidenceBoundary,
    readyForAutoAction: report.readyForAutoAction,
    summaries: report.summaries,
    pendingPresets: report.pendingPresets,
    missingEvidence: report.missingEvidence,
  }, null, 2));
  if (!report.ok && report.summaries.some(item => !item.ok)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  defaultOutputFile,
  hydrateDailyRankDates,
  materializeRequest,
  run,
};
