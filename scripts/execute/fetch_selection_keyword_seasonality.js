const fs = require('fs');
const path = require('path');
const {
  buildAnalysisKeywordSeasonalityReport,
  buildGoogleTrendPayload,
  normalizeSearchTerms,
} = require('../../src/selection_keyword_seasonality');
const { TARGETS } = require('./backend_login_lib');
const {
  checkSelectionHealth,
  waitForBackendReady,
} = require('./ensure_backend_login');
const {
  evaluate,
  listTabs,
  openTab,
} = require('../../discovery/lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const GOOGLE_TREND_ENDPOINT = '/soundasia_selection/searchTerm/analysis/getGoogleTrend';
const OVERVIEW_ENDPOINT = '/soundasia_selection/searchTerm/analysis/getOtherBySt';
const ASIN_COMPETITION_ENDPOINT = '/soundasia_selection/searchTerm/analysis/queryASINCP';
const BUYER_SEARCH_TERM_ENDPOINT = '/soundasia_selection/searchTerm/analysis/getBuyerStBySearchTerm';
const LATEST_DATE_ENDPOINT = '/soundasia_selection/brandAnalytics/usBrandAnalytics/getSiteDateNew';
const ANALYSIS_PAGE_URL = 'https://selection.yswg.com.cn/SearchTerm/AnalysisSearchTerm';

const SITE_KEYS = {
  1: 'us',
  2: 'uk',
  3: 'de',
  4: 'fr',
  5: 'es',
  6: 'it',
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const eq = item.indexOf('=');
    if (eq >= 0) {
      options[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return { options, positional };
}

function readSearchTermInput(options = {}, positional = []) {
  const values = [];
  if (options.file) {
    values.push(fs.readFileSync(path.resolve(options.file), 'utf8'));
  }
  if (options.searchTerms) values.push(options.searchTerms);
  if (options['search-terms']) values.push(options['search-terms']);
  if (options.terms) values.push(options.terms);
  if (options.keywords) values.push(options.keywords);
  if (positional.length) values.push(positional.join(','));
  return normalizeSearchTerms(values.join(','));
}

async function findSelectionTab({ openIfMissing = true } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(TARGETS.selection.origin));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(ANALYSIS_PAGE_URL);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    tab = await find();
    if (tab) return tab;
  }
  return null;
}

function tokenEvalPrefix() {
  return `
    const parseToken = rawValue => {
      if (!rawValue) return '';
      try {
        const parsed = JSON.parse(String(rawValue));
        return typeof parsed?.value === 'string' ? parsed.value : '';
      } catch (_) {
        return '';
      }
    };
    const accessToken = parseToken(localStorage.getItem('pro__Access-Token') || '');
    const tokenState = {
      hasAccessToken: !!accessToken,
      tokenLength: accessToken ? String(accessToken).length : 0,
    };
    if (!accessToken) {
      return JSON.stringify({
        ok: false,
        status: null,
        code: null,
        success: false,
        message: 'selection access token missing',
        result: null,
        ...tokenState,
      });
    }
    const headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      'X-Access-Token': accessToken,
    };
  `;
}

async function fetchLatestSeasonalityDateInSelectionTab(tab, options = {}) {
  const site = String(options.site || '1');
  const dateType = String(options.dateType || '2');
  const siteKey = SITE_KEYS[site] || 'us';
  const preferredKeysByDateType = {
    0: ['lastMonth', 'month'],
    1: ['week'],
    2: ['month', 'lastMonth'],
    3: ['quarter'],
    5: ['day'],
    6: ['year', 'month'],
  };
  const preferredKeys = preferredKeysByDateType[dateType] || ['month', 'lastMonth'];
  const today = new Date().toISOString().slice(0, 10);
  const raw = await evaluate(tab, `(async () => {
    ${tokenEvalPrefix()}
    const res = await fetch(${JSON.stringify(LATEST_DATE_ENDPOINT)}, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    const result = json?.result || {};
    const candidates = [];
    const addCandidate = (sourceName, key, value) => {
      const date = String(value || '').slice(0, 10);
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) candidates.push({
        sourceName,
        key,
        date,
        preferredKey: ${JSON.stringify(preferredKeys)}.includes(key),
        isFuture: date > ${JSON.stringify(today)},
      });
    };
    for (const [sourceName, sourceValue] of Object.entries(result || {})) {
      if (!sourceValue || typeof sourceValue !== 'object') continue;
      const bySite = sourceValue[${JSON.stringify(siteKey)}] || sourceValue[${JSON.stringify(site)}] || sourceValue;
      if (!bySite || typeof bySite !== 'object') continue;
      for (const key of ['year', 'month', 'day', 'week', 'quarter', 'lastMonth']) {
        addCandidate(sourceName, key, bySite[key]);
      }
    }
    const preferred = candidates.filter(item => item.preferredKey && !item.isFuture);
    const fallback = candidates.filter(item => !item.isFuture);
    const pool = preferred.length ? preferred : (fallback.length ? fallback : candidates);
    pool.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const latest = pool[0] || null;
    return JSON.stringify({
      ok: res.status === 200 && json?.success === true && json?.code === 200 && !!latest,
      status: res.status,
      code: json?.code ?? null,
      success: json?.success ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 200),
      latestDate: latest?.date || '',
      sourceName: latest?.sourceName || '',
      sourceKey: latest?.key || '',
      siteKey: ${JSON.stringify(siteKey)},
      resultKeys: Object.keys(result || {}).slice(0, 30),
      isJson: !!json,
      html: text.trimStart().startsWith('<'),
      ...tokenState,
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

function apiEnvelope(api = {}) {
  return {
    ok: !!api.ok,
    status: api.status ?? null,
    code: api.code ?? null,
    success: api.success ?? null,
    message: api.message || '',
    result: api.result || null,
  };
}

async function fetchJsonInSelectionTab(tab, request = {}) {
  const method = request.method || 'GET';
  const body = request.body === undefined ? null : request.body;
  const raw = await evaluate(tab, `(async () => {
    ${tokenEvalPrefix()}
    const fetchOptions = {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers,
    };
    const body = ${JSON.stringify(body)};
    if (body !== null) fetchOptions.body = JSON.stringify(body);
    const res = await fetch(${JSON.stringify(request.url)}, fetchOptions);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({
      ok: res.status === 200 && json?.success === true && json?.code === 200,
      status: res.status,
      code: json?.code ?? null,
      success: json?.success ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 200),
      result: json?.result || null,
      isJson: !!json,
      html: text.trimStart().startsWith('<'),
      ...tokenState,
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

async function fetchAnalysisForSearchTerm(tab, options = {}) {
  const site = String(options.site || '1');
  const searchTerm = String(options.searchTerm || '').trim();
  const stamp = Math.floor(Date.now() / 1000);
  const dateType = String(options.dateType || '2');
  const uTime = String(options.uTime || '');
  const requests = {
    googleTrend: {
      method: 'POST',
      url: GOOGLE_TREND_ENDPOINT,
      body: buildGoogleTrendPayload({
        site,
        searchTerms: [searchTerm],
        gType: options.gType || '1',
        timeType: options.timeType || '2',
      }),
    },
    overview: {
      method: 'GET',
      url: `${OVERVIEW_ENDPOINT}?${queryString({ _t: stamp, site, 'searchTerms[]': [searchTerm] })}`,
    },
    asinCompetition: {
      method: 'GET',
      url: `${ASIN_COMPETITION_ENDPOINT}?${queryString({
        _t: stamp,
        site,
        searchTerm,
        excAsins: options.excAsins || '',
      })}`,
    },
    buyerSearchTerms: {
      method: 'GET',
      url: `${BUYER_SEARCH_TERM_ENDPOINT}?${queryString({
        _t: stamp,
        site,
        searchTerm,
        dateType,
        uTime,
        pageNo: options.pageNo || 1,
        pageSize: options.pageSize || 10,
      })}`,
    },
  };
  const [googleTrend, overview, asinCompetition, buyerSearchTerms] = await Promise.all([
    fetchJsonInSelectionTab(tab, requests.googleTrend),
    fetchJsonInSelectionTab(tab, requests.overview),
    fetchJsonInSelectionTab(tab, requests.asinCompetition),
    fetchJsonInSelectionTab(tab, requests.buyerSearchTerms),
  ]);
  return {
    searchTerm,
    requests,
    googleTrend: apiEnvelope(googleTrend),
    overview: apiEnvelope(overview),
    asinCompetition: apiEnvelope(asinCompetition),
    buyerSearchTerms: apiEnvelope(buyerSearchTerms),
    tokenState: {
      hasAccessToken: !!(
        googleTrend.hasAccessToken ||
        overview.hasAccessToken ||
        asinCompetition.hasAccessToken ||
        buyerSearchTerms.hasAccessToken
      ),
      tokenLength: googleTrend.tokenLength || overview.tokenLength || asinCompetition.tokenLength || buyerSearchTerms.tokenLength || 0,
    },
  };
}

async function ensureSelectionReady(tab) {
  const status = await waitForBackendReady(TARGETS.selection, tab);
  if (status.status !== 'ready') {
    throw new Error(`selection page is not ready: ${JSON.stringify({
      status: status.status,
      reason: status.reason,
      href: status.href,
      title: status.title,
    })}`);
  }
  const health = await checkSelectionHealth(tab);
  if (!health?.ok) {
    throw new Error(`selection health check failed: ${JSON.stringify(health)}`);
  }
  return { status, health };
}

function defaultOutputFile() {
  return path.join(OUT_DIR, `selection_keyword_seasonality_${todayYmd()}.json`);
}

async function run(options = {}) {
  const searchTerms = normalizeSearchTerms(options.searchTerms || []);
  if (!searchTerms.length) {
    throw new Error('missing search terms; pass --search-terms "term1,term2", --keywords "term1,term2", or --file terms.txt');
  }

  const tab = await findSelectionTab();
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (!options.skipReady) await ensureSelectionReady(tab);

  const site = String(options.site || '1');
  const dateType = String(options.dateType || '2');
  let latestDateState = null;
  let uTime = options.uTime || options.date || options.period;
  if (!uTime) {
    latestDateState = await fetchLatestSeasonalityDateInSelectionTab(tab, { site, dateType });
    if (!latestDateState?.ok || !latestDateState.latestDate) {
      throw new Error(`could not resolve latest seasonality date; pass --u-time explicitly. latestDateState=${JSON.stringify({
        ok: latestDateState?.ok,
        status: latestDateState?.status,
        code: latestDateState?.code,
        success: latestDateState?.success,
        message: latestDateState?.message,
        resultKeys: latestDateState?.resultKeys,
      })}`);
    }
    uTime = latestDateState.latestDate;
  }

  const analysisResults = [];
  let tokenState = { hasAccessToken: false, tokenLength: 0 };

  for (const searchTerm of searchTerms) {
    const result = await fetchAnalysisForSearchTerm(tab, {
      searchTerm,
      site,
      dateType,
      uTime,
      gType: options.gType,
      timeType: options.timeType,
      excAsins: options.excAsins,
      pageNo: options.pageNo,
      pageSize: options.pageSize,
    });
    analysisResults.push(result);
    tokenState = {
      hasAccessToken: tokenState.hasAccessToken || result.tokenState.hasAccessToken,
      tokenLength: tokenState.tokenLength || result.tokenState.tokenLength || 0,
    };
  }

  const generatedAt = new Date().toISOString();
  const decisionReport = buildAnalysisKeywordSeasonalityReport({
    requestedSearchTerms: searchTerms,
    generatedAt,
    dateType,
    uTime,
    analysisResults,
  });
  const apiResults = analysisResults.map(item => {
    const endpoints = ['googleTrend', 'overview', 'asinCompetition', 'buyerSearchTerms'];
    return {
      searchTerm: item.searchTerm,
      ok: endpoints.every(key => item[key]?.ok),
      endpoints: Object.fromEntries(endpoints.map(key => [key, {
        ok: item[key]?.ok,
        status: item[key]?.status ?? null,
        code: item[key]?.code ?? null,
        success: item[key]?.success ?? null,
      }])),
    };
  });
  const ok = apiResults.every(item => item.ok) && decisionReport.opsReadiness.readyForDecisionSupport;
  const report = {
    ...decisionReport,
    exportedAt: generatedAt,
    endpoints: {
      googleTrend: GOOGLE_TREND_ENDPOINT,
      overview: OVERVIEW_ENDPOINT,
      asinCompetition: ASIN_COMPETITION_ENDPOINT,
      buyerSearchTerms: BUYER_SEARCH_TERM_ENDPOINT,
    },
    latestDateEndpoint: LATEST_DATE_ENDPOINT,
    latestDateState: latestDateState ? {
      ok: !!latestDateState.ok,
      status: latestDateState.status ?? null,
      code: latestDateState.code ?? null,
      success: latestDateState.success ?? null,
      latestDate: latestDateState.latestDate || '',
      sourceName: latestDateState.sourceName || '',
      sourceKey: latestDateState.sourceKey || '',
      siteKey: latestDateState.siteKey || '',
    } : null,
    request: {
      site,
      dateType,
      uTime,
      searchTerms,
      gType: options.gType || '1',
      timeType: options.timeType || '2',
      pageNo: options.pageNo || 1,
      pageSize: options.pageSize || 10,
    },
    requests: analysisResults.map(item => ({
      searchTerm: item.searchTerm,
      googleTrend: item.requests.googleTrend,
      overview: item.requests.overview,
      asinCompetition: item.requests.asinCompetition,
      buyerSearchTerms: item.requests.buyerSearchTerms,
    })),
    apiResults,
    ok,
    status: ok ? 200 : null,
    code: ok ? 200 : null,
    success: ok,
    message: ok ? 'ok' : 'one or more selection analysis endpoints failed or returned no decision-support rows',
    total: decisionReport.rows.length,
    rowCount: decisionReport.rows.length,
    tokenState,
    rawApiResults: analysisResults.map(item => ({
      searchTerm: item.searchTerm,
      googleTrend: item.googleTrend,
      overview: item.overview,
      asinCompetition: item.asinCompetition,
      buyerSearchTerms: item.buyerSearchTerms,
    })),
  };

  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const searchTerms = readSearchTermInput(options, positional);
  const { outputFile, report } = await run({
    searchTerms,
    site: options.site,
    dateType: options.dateType || options['date-type'],
    uTime: options.uTime || options['u-time'] || options.date || options.period,
    gType: options.gType || options['g-type'],
    timeType: options.timeType || options['time-type'],
    excAsins: options.excAsins || options['exc-asins'],
    pageNo: options.pageNo || options.page || options['page-no'] || options['page-num'],
    pageSize: options.pageSize || options.limit || options['page-size'],
    out: options.out,
    skipReady: options['skip-ready'] === '1',
  });
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    status: report.status,
    code: report.code,
    success: report.success,
    message: report.message,
    period: report.period,
    coverage: report.coverage,
    operatorSummary: report.operatorSummary,
    total: report.total,
    rowCount: report.rowCount,
    request: {
      site: report.request.site,
      dateType: report.request.dateType,
      uTime: report.request.uTime,
      searchTerms: report.request.searchTerms,
      gType: report.request.gType,
      timeType: report.request.timeType,
      pageNo: report.request.pageNo,
      pageSize: report.request.pageSize,
    },
    apiResults: (report.apiResults || []).map(item => ({
      searchTerm: item.searchTerm || '',
      ok: item.ok,
      endpoints: item.endpoints,
    })),
    sample: report.rows[0] || null,
    crossValidationTools: report.crossValidationPlan.map(item => item.tool),
    latestDateState: report.latestDateState,
    tokenState: report.tokenState,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  ANALYSIS_PAGE_URL,
  ASIN_COMPETITION_ENDPOINT,
  BUYER_SEARCH_TERM_ENDPOINT,
  GOOGLE_TREND_ENDPOINT,
  LATEST_DATE_ENDPOINT,
  OVERVIEW_ENDPOINT,
  ensureSelectionReady,
  fetchAnalysisForSearchTerm,
  fetchJsonInSelectionTab,
  fetchLatestSeasonalityDateInSelectionTab,
  findSelectionTab,
  readSearchTermInput,
  run,
};
