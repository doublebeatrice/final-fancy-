const fs = require('fs');
const path = require('path');
const {
  buildKeywordHistoryPayload,
  buildProductTimeMachinePayload,
  buildProductTimeMachineReport,
  extractKeywordHistoryResult,
  extractProductTimeMachineResult,
  normalizeSearchKeywords,
} = require('../../src/selection_product_time_machine');
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
const PAGE_QUERY_ENDPOINT = '/soundasia_selection/sif/timemachine/pageQuery';
const FORWARD_ENDPOINT = '/soundasia_selection/sif/forward';
const PRODUCT_TIME_MACHINE_PAGE_URL = 'https://selection.yswg.com.cn/Product/ProductTimeMachine';

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

function readKeywordInput(options = {}, positional = []) {
  const values = [];
  if (options.file) values.push(fs.readFileSync(path.resolve(options.file), 'utf8'));
  if (options.searchKeyword) values.push(options.searchKeyword);
  if (options['search-keyword']) values.push(options['search-keyword']);
  if (options.searchKeywords) values.push(options.searchKeywords);
  if (options['search-keywords']) values.push(options['search-keywords']);
  if (options.keywords) values.push(options.keywords);
  if (options.terms) values.push(options.terms);
  if (positional.length) values.push(positional.join(','));
  return normalizeSearchKeywords(values.join(','));
}

async function findSelectionTab({ openIfMissing = true } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(TARGETS.selection.origin));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(PRODUCT_TIME_MACHINE_PAGE_URL);
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

async function fetchJsonInSelectionTab(tab, endpoint, payload) {
  const raw = await evaluate(tab, `(async () => {
    ${tokenEvalPrefix()}
    const res = await fetch(${JSON.stringify(endpoint)}, {
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

async function fetchProductTimeMachineInSelectionTab(tab, payload) {
  return fetchJsonInSelectionTab(tab, PAGE_QUERY_ENDPOINT, payload);
}

async function fetchKeywordHistoryInSelectionTab(tab, payload) {
  return fetchJsonInSelectionTab(tab, FORWARD_ENDPOINT, payload);
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
  return path.join(OUT_DIR, `selection_product_time_machine_${todayYmd()}.json`);
}

async function run(options = {}) {
  const searchKeywords = normalizeSearchKeywords(options.searchKeywords || []);
  if (!searchKeywords.length) {
    throw new Error('missing keywords; pass --search-keywords "term1,term2", --keywords "term1,term2", or --file terms.txt');
  }

  const tab = await findSelectionTab();
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (!options.skipReady) await ensureSelectionReady(tab);

  const pageResults = [];
  const extractedRows = [];
  const keywordHistoryResults = [];
  let status = null;
  let code = null;
  let success = null;
  let message = '';
  let ok = true;
  let keywordHistoryOk = true;
  let total = 0;
  let tokenState = { hasAccessToken: false, tokenLength: 0 };

  for (const searchKeyword of searchKeywords) {
    const pagePayload = buildProductTimeMachinePayload({
      ...options,
      searchKeyword,
    });
    const pageApi = await fetchProductTimeMachineInSelectionTab(tab, pagePayload);
    const extracted = extractProductTimeMachineResult({
      status: pageApi.status,
      json: {
        success: pageApi.success,
        code: pageApi.code,
        message: pageApi.message,
        result: pageApi.result,
      },
    });
    for (const row of extracted.rows) {
      extractedRows.push({ ...row, searchKeyword });
    }
    pageResults.push({
      request: pagePayload,
      ok: !!pageApi.ok && extracted.ok,
      status: pageApi.status ?? null,
      code: pageApi.code ?? null,
      success: pageApi.success ?? null,
      message: pageApi.message || extracted.message,
      total: extracted.total,
      rowCount: extracted.rows.length,
    });
    ok = ok && !!pageApi.ok && extracted.ok;
    status = pageApi.status ?? status;
    code = pageApi.code ?? code;
    success = pageApi.success ?? success;
    message = pageApi.message || extracted.message || message;
    total += extracted.total || extracted.rows.length;
    tokenState = {
      hasAccessToken: tokenState.hasAccessToken || !!pageApi.hasAccessToken,
      tokenLength: tokenState.tokenLength || pageApi.tokenLength || 0,
    };

    if (options.includeKeywordHistory !== false) {
      const historyPayload = buildKeywordHistoryPayload({
        keyword: searchKeyword,
        site: options.site,
        siteName: options.siteName || options['site-name'],
        granularity: options.granularity,
      });
      const historyApi = await fetchKeywordHistoryInSelectionTab(tab, historyPayload);
      const history = extractKeywordHistoryResult({
        status: historyApi.status,
        json: {
          success: historyApi.success,
          code: historyApi.code,
          message: historyApi.message,
          result: historyApi.result,
        },
      });
      keywordHistoryResults.push({
        keyword: searchKeyword,
        request: historyPayload,
        extracted: history,
      });
      keywordHistoryOk = keywordHistoryOk && !!historyApi.ok && history.ok;
      tokenState = {
        hasAccessToken: tokenState.hasAccessToken || !!historyApi.hasAccessToken,
        tokenLength: tokenState.tokenLength || historyApi.tokenLength || 0,
      };
    }
  }

  const generatedAt = new Date().toISOString();
  const firstRequest = buildProductTimeMachinePayload({
    ...options,
    searchKeyword: searchKeywords[0],
  });
  const decisionReport = buildProductTimeMachineReport({
    requestedKeywords: searchKeywords,
    extracted: {
      ok,
      status,
      code,
      success,
      message,
      total,
      rows: extractedRows,
    },
    keywordHistoryResults,
    generatedAt,
    request: firstRequest,
  });
  const report = {
    ...decisionReport,
    exportedAt: generatedAt,
    endpoints: {
      pageQuery: PAGE_QUERY_ENDPOINT,
      keywordHistory: FORWARD_ENDPOINT,
    },
    request: searchKeywords.length === 1 ? firstRequest : {
      ...firstRequest,
      splitRequests: searchKeywords,
    },
    requests: pageResults.map(item => item.request),
    pageResults,
    keywordHistoryOk,
    ok,
    status: status ?? null,
    code: code ?? null,
    success: success ?? null,
    message: ok ? 'ok' : (message || 'one or more product time machine endpoints failed'),
    total,
    rowCount: decisionReport.rows.length,
    tokenState,
    rawRows: extractedRows,
  };

  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const searchKeywords = readKeywordInput(options, positional);
  const desc = options.desc === undefined ? undefined : !['0', 'false', 'no'].includes(String(options.desc).toLowerCase());
  const { outputFile, report } = await run({
    searchKeywords,
    site: options.site,
    siteName: options.siteName || options['site-name'],
    timePieceType: options.timePieceType || options['time-piece-type'],
    timePieceValue: options.timePieceValue || options['time-piece-value'],
    type: options.type,
    pageNum: options.pageNum || options.page || options['page-num'],
    pageSize: options.pageSize || options.limit || options['page-size'],
    sortBy: options.sortBy || options['sort-by'],
    desc,
    showType: options.showType || options['show-type'],
    condition: options.condition,
    granularity: options.granularity,
    includeKeywordHistory: options['no-keyword-history'] === '1' ? false : undefined,
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
    coverage: report.coverage,
    operatorSummary: report.operatorSummary,
    total: report.total,
    rowCount: report.rowCount,
    request: {
      site: report.request.site,
      timePieceType: report.request.timePieceType,
      timePieceValue: report.request.timePieceValue,
      searchKeyword: report.request.searchKeyword,
      pageNum: report.request.pageNum,
      pageSize: report.request.pageSize,
      sortBy: report.request.sortBy,
      desc: report.request.desc,
      splitRequests: report.request.splitRequests || undefined,
    },
    pageResults: (report.pageResults || []).map(item => ({
      searchKeyword: item.request?.searchKeyword || '',
      ok: item.ok,
      total: item.total,
      rowCount: item.rowCount,
    })),
    keywordHistory: (report.keywordHistory || []).map(item => ({
      keyword: item.keyword,
      ok: item.ok,
      latestSearchVolume: item.summary?.latestSearchVolume ?? null,
      searchVolumeDirection: item.summary?.searchVolumeDirection || 'unknown',
      rankDirection: item.summary?.rankDirection || 'unknown',
    })),
    sample: report.rows[0] || null,
    crossValidationTools: report.crossValidationPlan.map(item => item.tool),
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
  FORWARD_ENDPOINT,
  PAGE_QUERY_ENDPOINT,
  PRODUCT_TIME_MACHINE_PAGE_URL,
  ensureSelectionReady,
  fetchKeywordHistoryInSelectionTab,
  fetchProductTimeMachineInSelectionTab,
  findSelectionTab,
  readKeywordInput,
  run,
};
