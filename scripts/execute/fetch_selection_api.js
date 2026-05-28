const fs = require('fs');
const path = require('path');
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
const SELECTION_API_PREFIX = '/soundasia_selection';
const DEFAULT_PAGE_URL = TARGETS.selection.requiredUrl;

const UNSAFE_ENDPOINT_PATTERN = /(?:^|\/)(?:save|update|delete|del|upload|import|export|download|dow|collect|collection|batch|edit|create|add|remove|hide|handleImport|saveAll|saveBatch|inOrUp|isFilterItem|updateFilter|delUserFilter|saveKey)(?:$|[A-Z_/?-])/i;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function assignOption(target, key, value) {
  if (target[key] === undefined) {
    target[key] = value;
    return;
  }
  if (!Array.isArray(target[key])) target[key] = [target[key]];
  target[key].push(value);
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
      assignOption(options, item.slice(2, eq), item.slice(eq + 1));
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      assignOption(options, key, next);
      i += 1;
    } else {
      assignOption(options, key, '1');
    }
  }
  return { options, positional };
}

function parseJsonValue(raw, label) {
  const value = text(raw);
  if (!value) return null;
  try {
    return JSON.parse(value.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`invalid JSON for ${label}: ${error.message}`);
  }
}

function parseBody(options = {}) {
  if (options.bodyFile || options['body-file']) {
    return parseJsonValue(fs.readFileSync(path.resolve(options.bodyFile || options['body-file']), 'utf8'), 'body-file');
  }
  if (options.body !== undefined) return parseJsonValue(options.body, 'body');
  if (options.payload !== undefined) return parseJsonValue(options.payload, 'payload');
  return null;
}

function parseQueryValue(value) {
  const raw = text(value);
  if (!raw) return {};
  if (raw.startsWith('{')) return parseJsonValue(raw, 'query');
  const out = {};
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  for (const [key, paramValue] of params.entries()) out[key] = paramValue;
  return out;
}

function parseParamEntries(value) {
  const values = Array.isArray(value) ? value : [value];
  const out = {};
  for (const item of values.filter(item => item !== undefined)) {
    const raw = text(item);
    if (!raw) continue;
    const eq = raw.indexOf('=');
    if (eq < 0) {
      out[raw] = '1';
    } else {
      out[raw.slice(0, eq)] = raw.slice(eq + 1);
    }
  }
  return out;
}

function parseQuery(options = {}) {
  return {
    ...parseQueryValue(options.query),
    ...parseParamEntries(options.param),
  };
}

function canonicalizeEndpoint(endpoint, options = {}) {
  const raw = text(endpoint);
  if (!raw) throw new Error('missing endpoint; pass --endpoint /path');

  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch (_) {
    parsed = null;
  }

  if (parsed) {
    if (parsed.origin !== TARGETS.selection.origin && !options.allowExternal) {
      throw new Error(`external selection API call blocked: ${parsed.origin}`);
    }
    if (parsed.origin === TARGETS.selection.origin && !parsed.pathname.startsWith(SELECTION_API_PREFIX)) {
      parsed.pathname = `${SELECTION_API_PREFIX}${parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`}`;
    }
    return parsed.toString();
  }

  const pathOnly = raw.startsWith('/') ? raw : `/${raw}`;
  if (pathOnly.startsWith(SELECTION_API_PREFIX)) return pathOnly;
  return `${SELECTION_API_PREFIX}${pathOnly}`;
}

function buildRequestUrl(endpoint, query = {}, options = {}) {
  const canonical = canonicalizeEndpoint(endpoint, options);
  const base = canonical.startsWith('http') ? canonical : `${TARGETS.selection.origin}${canonical}`;
  const parsed = new URL(base);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) parsed.searchParams.append(key, String(item));
    } else {
      parsed.searchParams.set(key, String(value));
    }
  }
  if (parsed.origin === TARGETS.selection.origin) return `${parsed.pathname}${parsed.search}`;
  return parsed.toString();
}

function isReadOnlySelectionRequest(request = {}) {
  const method = text(request.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) return false;
  const url = buildRequestUrl(request.endpoint || request.url || '', request.query || {}, {
    allowExternal: request.allowExternal,
  });
  if (UNSAFE_ENDPOINT_PATTERN.test(url)) return false;
  return true;
}

async function findSelectionTab({ openIfMissing = true, pageUrl = DEFAULT_PAGE_URL } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(TARGETS.selection.origin));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(pageUrl);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    tab = await find();
    if (tab) return tab;
  }
  return null;
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
        json: null,
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

async function fetchSelectionApiInTab(tab, request = {}) {
  const method = text(request.method || 'GET').toUpperCase();
  const body = request.body === undefined ? null : request.body;
  const raw = await evaluate(tab, `(async () => {
    ${tokenEvalPrefix()}
    const fetchOptions = {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers,
    };
    const body = ${JSON.stringify(body)};
    if (body !== null && body !== undefined) fetchOptions.body = JSON.stringify(body);
    const res = await fetch(${JSON.stringify(request.url)}, fetchOptions);
    const responseText = await res.text();
    let json = null;
    try { json = JSON.parse(responseText); } catch (_) {}
    const hasVerdict = json && (Object.prototype.hasOwnProperty.call(json, 'code') || Object.prototype.hasOwnProperty.call(json, 'success'));
    const jsonOk = !json
      ? true
      : (hasVerdict ? (json.code === 200 || json.success === true) : (json.result !== undefined || json.data !== undefined));
    return JSON.stringify({
      ok: res.status >= 200 && res.status < 300 && jsonOk,
      status: res.status,
      code: json?.code ?? null,
      success: json?.success ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 300),
      json,
      result: json?.result ?? json?.data ?? null,
      isJson: !!json,
      html: responseText.trimStart().startsWith('<'),
      textSample: json ? '' : responseText.slice(0, 500),
      ...tokenState,
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

function countRows(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  const candidates = [
    value.records,
    value.rows,
    value.list,
    value.data,
    value.content,
    value.items,
    value.result,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.length;
    if (candidate && typeof candidate === 'object') {
      const nested = countRows(candidate);
      if (nested) return nested;
    }
  }
  return 0;
}

function extractTotal(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['total', 'totalCount', 'count', 'recordsTotal']) {
    const n = Number(value[key]);
    if (Number.isFinite(n)) return n;
  }
  for (const nested of [value.result, value.data, value.page, value.pagination]) {
    const total = extractTotal(nested);
    if (total !== null) return total;
  }
  return null;
}

function safeFileSegment(value) {
  return text(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^\/?soundasia_selection\//, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'selection_api';
}

function defaultOutputFile(endpoint) {
  return path.join(OUT_DIR, `selection_api_${safeFileSegment(endpoint)}_${todayYmd()}.json`);
}

function buildSelectionApiReport({ request, api, generatedAt = new Date().toISOString() }) {
  const result = api.result ?? null;
  return {
    ok: !!api.ok,
    exportedAt: generatedAt,
    endpoint: request.endpoint,
    url: request.url,
    method: request.method,
    request: {
      endpoint: request.endpoint,
      url: request.url,
      method: request.method,
      query: request.query || {},
      body: request.body ?? null,
    },
    status: api.status ?? null,
    code: api.code ?? null,
    success: api.success ?? null,
    message: api.message || '',
    isJson: !!api.isJson,
    html: !!api.html,
    total: extractTotal(api.json) ?? extractTotal(result),
    rowCount: countRows(result),
    result,
    rawJson: api.json ?? null,
    textSample: api.textSample || '',
    tokenState: {
      hasAccessToken: !!api.hasAccessToken,
      tokenLength: api.tokenLength || 0,
    },
  };
}

async function run(options = {}) {
  const endpoint = options.endpoint || options.url || options._endpoint;
  const method = text(options.method || (options.get ? 'GET' : 'POST')).toUpperCase();
  const query = parseQuery(options);
  const body = parseBody(options);
  const url = buildRequestUrl(endpoint, query, {
    allowExternal: options['allow-external'] === '1' || options.allowExternal === '1',
  });
  const request = {
    endpoint: canonicalizeEndpoint(endpoint, {
      allowExternal: options['allow-external'] === '1' || options.allowExternal === '1',
    }),
    url,
    method,
    query,
    body,
    allowExternal: options['allow-external'] === '1' || options.allowExternal === '1',
  };

  if (!options['allow-unsafe'] && !isReadOnlySelectionRequest(request)) {
    throw new Error(`blocked non-read-only selection API request: ${method} ${url}`);
  }

  const tab = await findSelectionTab({
    pageUrl: options.pageUrl || options['page-url'] || DEFAULT_PAGE_URL,
  });
  if (!tab) throw new Error('selection tab not found; run npm run chrome:debug first');
  if (options['skip-ready'] !== '1') await ensureSelectionReady(tab);

  const api = await fetchSelectionApiInTab(tab, request);
  const report = buildSelectionApiReport({ request, api });
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile(request.endpoint);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  if (!options.endpoint && !options.url && positional[0]) options._endpoint = positional[0];
  const { outputFile, report } = await run(options);
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    status: report.status,
    code: report.code,
    success: report.success,
    message: report.message,
    method: report.method,
    url: report.url,
    total: report.total,
    rowCount: report.rowCount,
    resultKeys: report.result && typeof report.result === 'object' && !Array.isArray(report.result)
      ? Object.keys(report.result).slice(0, 40)
      : [],
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
  buildRequestUrl,
  buildSelectionApiReport,
  canonicalizeEndpoint,
  countRows,
  extractTotal,
  fetchSelectionApiInTab,
  findSelectionTab,
  ensureSelectionReady,
  isReadOnlySelectionRequest,
  parseArgs,
  parseBody,
  parseQuery,
  run,
  safeFileSegment,
};
