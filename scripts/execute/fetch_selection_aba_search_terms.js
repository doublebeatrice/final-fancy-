const fs = require('fs');
const path = require('path');
const {
  buildAbaSearchTermPayload,
  buildAbaSearchTermPayloads,
  buildAbaSearchTermReport,
  extractAbaSearchTermResult,
  normalizeSearchTerms,
} = require('../../src/selection_aba_search_terms');
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
const ENDPOINT = '/soundasia_selection/searchTerm/lastDay/list';
const LATEST_DATE_ENDPOINT = '/soundasia_selection/brandAnalytics/usBrandAnalytics/getSiteDateNew';
const ABA_PAGE_URL = 'https://selection.yswg.com.cn/SearchTerm/ABASearchTermNew';

const SITE_KEYS = {
  1: 'us',
  2: 'uk',
  3: 'de',
  4: 'fr',
  5: 'es',
  6: 'it',
};

const DATE_TYPE_KEYS = {
  0: 'lastMonth',
  1: 'week',
  2: 'month',
  3: 'quarter',
  5: 'day',
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
  if (options.asins) values.push(options.asins);
  if (positional.length) values.push(positional.join(','));
  return normalizeSearchTerms(values.join(','));
}

async function findSelectionTab({ openIfMissing = true } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(TARGETS.selection.origin));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(ABA_PAGE_URL);
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

async function fetchLatestAbaDateInSelectionTab(tab, options = {}) {
  const site = String(options.site || '1');
  const dateType = String(options.dateType || '2');
  const siteKey = SITE_KEYS[site] || 'us';
  const dateKey = DATE_TYPE_KEYS[dateType] || 'month';
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
    const sourceNames = ['ABA日搜索词(新)', 'ABA搜索词(新)', '流量选品'];
    let sourceName = '';
    let latestDate = '';
    for (const name of sourceNames) {
      const bySite = result?.[name]?.[${JSON.stringify(siteKey)}] || result?.[name]?.[${JSON.stringify(site)}];
      if (!bySite || typeof bySite !== 'object') continue;
      latestDate = String(bySite[${JSON.stringify(dateKey)}] || bySite.month || bySite.day || bySite.week || '');
      if (latestDate) {
        sourceName = name;
        break;
      }
    }
    return JSON.stringify({
      ok: res.status === 200 && json?.success === true && json?.code === 200 && !!latestDate,
      status: res.status,
      code: json?.code ?? null,
      success: json?.success ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 200),
      latestDate,
      sourceName,
      siteKey: ${JSON.stringify(siteKey)},
      dateKey: ${JSON.stringify(dateKey)},
      resultKeys: Object.keys(result || {}).slice(0, 30),
      isJson: !!json,
      html: text.trimStart().startsWith('<'),
      ...tokenState,
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

async function fetchAbaSearchTermsInSelectionTab(tab, payload) {
  const raw = await evaluate(tab, `(async () => {
    ${tokenEvalPrefix()}
    const res = await fetch(${JSON.stringify(ENDPOINT)}, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(${JSON.stringify(payload)}),
    });
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
  return path.join(OUT_DIR, `selection_aba_search_terms_${todayYmd()}.json`);
}

async function run(options = {}) {
  const searchTerms = normalizeSearchTerms(options.searchTerms || []);
  if (!searchTerms.length) {
    throw new Error('missing search terms; pass --search-terms "term1,term2", --asins "B0...", or --file terms.txt');
  }

  const tab = await findSelectionTab();
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (!options.skipReady) await ensureSelectionReady(tab);

  const dateType = String(options.dateType || '2');
  const site = String(options.site || '1');
  let latestDateState = null;
  let uTime = options.uTime || options.date || options.period;
  if (!uTime) {
    latestDateState = await fetchLatestAbaDateInSelectionTab(tab, { site, dateType });
    if (!latestDateState?.ok || !latestDateState.latestDate) {
      throw new Error(`could not resolve latest ABA date; pass --u-time explicitly. latestDateState=${JSON.stringify({
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

  const payloadOptions = {
    searchTerms,
    site,
    dateType,
    uTime,
    stType: options.stType || (options.asinMode ? '2' : '1'),
    titleType: options.titleType,
    category: options.category,
    pageNo: options.pageNo,
    pageSize: options.pageSize,
    column: options.column || options.sortBy,
    order: options.order,
  };
  const payloads = buildAbaSearchTermPayloads(payloadOptions);
  const apiResults = [];
  const extractedRows = [];
  let status = null;
  let code = null;
  let success = null;
  let message = '';
  let ok = true;
  let total = 0;
  let tokenState = { hasAccessToken: false, tokenLength: 0 };

  for (const payload of payloads) {
    const api = await fetchAbaSearchTermsInSelectionTab(tab, payload);
    const extracted = extractAbaSearchTermResult({
      status: api.status,
      json: {
        success: api.success,
        code: api.code,
        message: api.message,
        result: api.result,
      },
    });
    apiResults.push({
      request: payload,
      ok: !!api.ok && extracted.ok,
      status: api.status ?? null,
      code: api.code ?? null,
      success: api.success ?? null,
      message: api.message || extracted.message,
      total: extracted.total,
      rowCount: extracted.rows.length,
    });
    extractedRows.push(...extracted.rows);
    ok = ok && !!api.ok && extracted.ok;
    status = api.status ?? status;
    code = api.code ?? code;
    success = api.success ?? success;
    message = api.message || extracted.message || message;
    if (extracted.total >= 0) total += extracted.total;
    else if (total === 0) total = extracted.total;
    tokenState = {
      hasAccessToken: !!api.hasAccessToken,
      tokenLength: api.tokenLength || 0,
    };
  }

  const extracted = {
    ok,
    status,
    code,
    success,
    message,
    total,
    rows: extractedRows,
  };
  const firstPayload = payloads[0] || buildAbaSearchTermPayload(payloadOptions);
  const generatedAt = new Date().toISOString();
  const decisionReport = buildAbaSearchTermReport({
    requestedSearchTerms: searchTerms,
    extracted,
    generatedAt,
    dateType: firstPayload.dateType,
    uTime: firstPayload.uTime,
  });
  const report = {
    ...decisionReport,
    exportedAt: generatedAt,
    endpoint: ENDPOINT,
    latestDateEndpoint: LATEST_DATE_ENDPOINT,
    latestDateState: latestDateState ? {
      ok: !!latestDateState.ok,
      status: latestDateState.status ?? null,
      code: latestDateState.code ?? null,
      success: latestDateState.success ?? null,
      latestDate: latestDateState.latestDate || '',
      sourceName: latestDateState.sourceName || '',
      siteKey: latestDateState.siteKey || '',
      dateKey: latestDateState.dateKey || '',
    } : null,
    request: payloads.length === 1 ? payloads[0] : {
      ...buildAbaSearchTermPayload(payloadOptions),
      splitRequests: payloads.map(payload => payload.stValue),
    },
    requests: payloads,
    apiResults,
    ok: extracted.ok,
    status: extracted.status ?? null,
    code: extracted.code ?? null,
    success: extracted.success ?? null,
    message: extracted.message,
    total: extracted.total,
    rowCount: decisionReport.rows.length,
    tokenState,
    rawRows: extracted.rows,
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
    asinMode: !!options.asins || options.stType === '2' || options['st-type'] === '2',
    site: options.site,
    dateType: options.dateType || options['date-type'],
    uTime: options.uTime || options['u-time'] || options.date || options.period,
    stType: options.stType || options['st-type'],
    titleType: options.titleType || options['title-type'],
    category: options.category,
    pageNo: options.pageNo || options.page || options['page-no'] || options['page-num'],
    pageSize: options.pageSize || options.limit || options['page-size'],
    column: options.column || options.sortBy || options['sort-by'],
    order: options.order,
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
      stValue: report.request.stValue,
      stType: report.request.stType,
      pageNo: report.request.pageNo,
      pageSize: report.request.pageSize,
      column: report.request.column,
      order: report.request.order,
      splitRequests: report.request.splitRequests || undefined,
    },
    apiResults: (report.apiResults || []).map(item => ({
      stValue: item.request?.stValue || '',
      ok: item.ok,
      total: item.total,
      rowCount: item.rowCount,
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
  ABA_PAGE_URL,
  ENDPOINT,
  LATEST_DATE_ENDPOINT,
  ensureSelectionReady,
  fetchAbaSearchTermsInSelectionTab,
  fetchLatestAbaDateInSelectionTab,
  findSelectionTab,
  readSearchTermInput,
  run,
};
