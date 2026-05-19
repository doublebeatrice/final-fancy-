const fs = require('fs');
const path = require('path');
const {
  buildKeywordConversionPayload,
  buildKeywordConversionReport,
  extractKeywordConversionResult,
  normalizeKeywords,
} = require('../../src/selection_keyword_conversion_rate');
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
const ENDPOINT = '/soundasia_selection/sif/conversionRate/pageQuery';

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
  if (options.file) {
    values.push(fs.readFileSync(path.resolve(options.file), 'utf8'));
  }
  if (options.keywords) values.push(options.keywords);
  if (positional.length) values.push(positional.join(','));
  return normalizeKeywords(values.join(','));
}

async function findSelectionTab({ openIfMissing = true } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(TARGETS.selection.origin));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(TARGETS.selection.requiredUrl);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    tab = await find();
    if (tab) return tab;
  }
  return null;
}

async function fetchKeywordConversionInSelectionTab(tab, payload) {
  const raw = await evaluate(tab, `(async () => {
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
  return path.join(OUT_DIR, `selection_keyword_conversion_rate_${todayYmd()}.json`);
}

async function run(options = {}) {
  const keywords = normalizeKeywords(options.keywords || []);
  if (!keywords.length) {
    throw new Error('missing keywords; pass --keywords "term1,term2" or --file keywords.txt');
  }

  const tab = await findSelectionTab();
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (!options.skipReady) await ensureSelectionReady(tab);

  const payload = buildKeywordConversionPayload({
    keywords,
    customPrice: options.customPrice,
    customProfitRate: options.customProfitRate,
    desc: options.desc,
    sortBy: options.sortBy,
    pageNum: options.pageNum,
    pageSize: options.pageSize,
    strategy: options.strategy,
  });
  const api = await fetchKeywordConversionInSelectionTab(tab, payload);
  const extracted = extractKeywordConversionResult({
    status: api.status,
    json: {
      success: api.success,
      code: api.code,
      message: api.message,
      result: api.result,
    },
  });
  const generatedAt = new Date().toISOString();
  const decisionReport = buildKeywordConversionReport({
    requestedKeywords: payload.keywords,
    extracted,
    strategy: payload.strategy,
    generatedAt,
  });
  const report = {
    ...decisionReport,
    exportedAt: generatedAt,
    endpoint: ENDPOINT,
    request: payload,
    ok: !!api.ok && extracted.ok,
    status: api.status ?? null,
    code: api.code ?? null,
    success: api.success ?? null,
    message: api.message || extracted.message,
    total: extracted.total,
    rowCount: decisionReport.rows.length,
    tokenState: {
      hasAccessToken: !!api.hasAccessToken,
      tokenLength: api.tokenLength || 0,
    },
    rawRows: extracted.rows,
  };

  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const keywords = readKeywordInput(options, positional);
  const desc = options.desc === undefined ? undefined : !['0', 'false', 'no'].includes(String(options.desc).toLowerCase());
  const { outputFile, report } = await run({
    keywords,
    customPrice: options.customPrice || options['custom-price'],
    customProfitRate: options.customProfitRate || options['custom-profit-rate'],
    desc,
    sortBy: options.sortBy || options['sort-by'],
    pageNum: options.pageNum || options.page || options['page-num'],
    pageSize: options.pageSize || options.limit || options['page-size'],
    strategy: options.strategy,
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
    keywords: report.request.keywords,
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
  ENDPOINT,
  ensureSelectionReady,
  fetchKeywordConversionInSelectionTab,
  findSelectionTab,
  readKeywordInput,
  run,
};
