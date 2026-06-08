const fs = require('fs');
const path = require('path');
const {
  extractKeywordHistoryResult,
  normalizeSearchKeywords,
} = require('../../src/selection_product_time_machine');
const {
  evaluate,
  listTabs,
  openTab,
} = require('../../discovery/lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const SIF_ORIGIN = 'https://www.sif.com';
const SIF_HOME_URL = `${SIF_ORIGIN}/`;
const KEYWORD_HISTORY_ENDPOINT = '/api/search/keyword/abahistory/chart';

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

function readKeywordInput(options = {}, positional = []) {
  const values = [];
  if (options.file) values.push(fs.readFileSync(path.resolve(options.file), 'utf8'));
  if (options.keyword) values.push(options.keyword);
  if (options.keywords) values.push(options.keywords);
  if (options.searchKeyword) values.push(options.searchKeyword);
  if (options['search-keyword']) values.push(options['search-keyword']);
  if (options.searchKeywords) values.push(options.searchKeywords);
  if (options['search-keywords']) values.push(options['search-keywords']);
  if (positional.length) values.push(positional.join(','));
  return normalizeSearchKeywords(values.join(','));
}

function buildKeywordHistoryUrl({ keyword, country = 'US', granularity = 'week', now = Date.now() } = {}) {
  const url = new URL(KEYWORD_HISTORY_ENDPOINT, SIF_ORIGIN);
  url.searchParams.set('country', text(country || 'US').toUpperCase());
  url.searchParams.set('keyword', text(keyword));
  url.searchParams.set('granularity', text(granularity || 'week'));
  url.searchParams.set('_t', String(now));
  return `${url.pathname}${url.search}`;
}

async function findSifTab({ openIfMissing = true } = {}) {
  const find = async () => (await listTabs())
    .find(tab => tab.type === 'page' && String(tab.url || '').startsWith(SIF_ORIGIN));
  let tab = await find();
  if (tab || !openIfMissing) return tab;
  await openTab(SIF_HOME_URL);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    tab = await find();
    if (tab) return tab;
  }
  return null;
}

async function readSifTokenState(tab) {
  const raw = await evaluate(tab, `(() => {
    const readCookie = name => {
      const hit = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='));
      return hit ? hit.slice(name.length + 1) : '';
    };
    const token = localStorage.getItem('token') || readCookie('sif_token_share_prod') || readCookie('sif_token') || '';
    const cookieNames = document.cookie.split(';').map(item => item.trim().split('=')[0]).filter(Boolean);
    if (token && !localStorage.getItem('token')) localStorage.setItem('token', token);
    return JSON.stringify({
      hasToken: !!token,
      tokenLength: token ? String(token).length : 0,
      cookieNames,
      href: location.href,
      title: document.title,
    });
  })()`);
  return JSON.parse(raw || '{}');
}

async function loginSifInTab(tab, { phone, password } = {}) {
  if (!phone || !password) {
    return { ok: false, reason: 'missing_credentials' };
  }
  const raw = await evaluate(tab, `(async () => {
    const readCookie = name => {
      const hit = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='));
      return hit ? hit.slice(name.length + 1) : '';
    };
    const res = await fetch('/api/user/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8'
      },
      body: JSON.stringify({
        phone: ${JSON.stringify(phone)},
        password: ${JSON.stringify(password)}
      })
    });
    const bodyText = await res.text();
    let json = null;
    try { json = JSON.parse(bodyText); } catch (_) {}
    const token = res.headers.get('authorization') || readCookie('sif_token_share_prod') || readCookie('sif_token') || '';
    if (token) localStorage.setItem('token', token);
    return JSON.stringify({
      ok: res.status >= 200 && res.status < 300 && json?.code === 1 && json?.data?.isSuccess === true && !!token,
      status: res.status,
      code: json?.code ?? null,
      loginSuccess: json?.data?.isSuccess ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 200),
      tokenState: {
        hasToken: !!token,
        tokenLength: token ? String(token).length : 0,
      },
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

async function fetchKeywordHistoryInTab(tab, request = {}) {
  const url = buildKeywordHistoryUrl(request);
  const raw = await evaluate(tab, `(async () => {
    const readCookie = name => {
      const hit = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='));
      return hit ? hit.slice(name.length + 1) : '';
    };
    const token = localStorage.getItem('token') || readCookie('sif_token_share_prod') || readCookie('sif_token') || '';
    if (!token) {
      return JSON.stringify({
        ok: false,
        status: null,
        code: null,
        message: 'SIF token missing',
        json: null,
        tokenState: { hasToken: false, tokenLength: 0 },
      });
    }
    const res = await fetch(${JSON.stringify(url)}, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: token,
      },
    });
    const bodyText = await res.text();
    let json = null;
    try { json = JSON.parse(bodyText); } catch (_) {}
    return JSON.stringify({
      ok: res.status >= 200 && res.status < 300 && json?.code === 1,
      status: res.status,
      code: json?.code ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 200),
      json,
      tokenState: {
        hasToken: !!token,
        tokenLength: token ? String(token).length : 0,
      },
      html: bodyText.trimStart().startsWith('<'),
      textSample: json ? '' : bodyText.slice(0, 300),
    });
  })()`, true);
  return JSON.parse(raw || '{}');
}

function extractSifKeywordHistory(api = {}) {
  const data = api.json?.data || api.json?.result || {};
  return extractKeywordHistoryResult({
    status: api.status,
    json: {
      code: api.code === 1 ? 200 : api.code,
      success: api.code === 1,
      message: api.message,
      result: data,
    },
  });
}

function buildReport({ keywordResults, country, granularity, login, tokenState, generatedAt = new Date().toISOString() }) {
  const ok = keywordResults.every(item => item.ok);
  return {
    ok,
    exportedAt: generatedAt,
    source: 'sif_direct',
    endpoint: KEYWORD_HISTORY_ENDPOINT,
    country,
    granularity,
    login: login ? {
      ok: !!login.ok,
      status: login.status ?? null,
      code: login.code ?? null,
      loginSuccess: login.loginSuccess ?? null,
      message: login.message || '',
      tokenState: login.tokenState || null,
    } : null,
    tokenState: tokenState || null,
    keywordHistory: keywordResults,
    summary: {
      requestedCount: keywordResults.length,
      okCount: keywordResults.filter(item => item.ok).length,
      missingCount: keywordResults.filter(item => !item.ok).length,
      latestSearchVolumes: keywordResults.map(item => ({
        keyword: item.keyword,
        latestSearchVolume: item.summary?.latestSearchVolume ?? null,
        searchVolumeDirection: item.summary?.searchVolumeDirection || 'unknown',
        rankDirection: item.summary?.rankDirection || 'unknown',
      })),
    },
  };
}

function defaultOutputFile() {
  return path.join(OUT_DIR, `sif_keyword_history_${todayYmd()}.json`);
}

async function run(options = {}) {
  const keywords = normalizeSearchKeywords(options.keywords || options.searchKeywords || []);
  if (!keywords.length) {
    throw new Error('missing keywords; pass --keyword, --keywords, --search-keywords, or --file');
  }

  const country = text(options.country || 'US').toUpperCase();
  const granularity = text(options.granularity || 'week');
  const tab = await findSifTab();
  if (!tab) throw new Error('SIF tab not found; open https://www.sif.com first');

  let tokenState = await readSifTokenState(tab);
  let login = null;
  if (!tokenState.hasToken && (options.phone || process.env.SIF_PHONE) && (options.password || process.env.SIF_PASSWORD)) {
    login = await loginSifInTab(tab, {
      phone: options.phone || process.env.SIF_PHONE,
      password: options.password || process.env.SIF_PASSWORD,
    });
    tokenState = await readSifTokenState(tab);
  }
  if (!tokenState.hasToken) {
    throw new Error('SIF session missing; login in the browser or set SIF_PHONE/SIF_PASSWORD for one-time login');
  }

  const keywordResults = [];
  for (const keyword of keywords) {
    const api = await fetchKeywordHistoryInTab(tab, { keyword, country, granularity });
    const extracted = extractSifKeywordHistory(api);
    keywordResults.push({
      keyword,
      ok: !!api.ok && extracted.ok,
      status: api.status ?? null,
      code: api.code ?? null,
      message: api.message || extracted.message || '',
      timelineCount: extracted.timeline.length,
      summary: extracted.summary,
      timeline: extracted.timeline,
      festivals: extracted.festivals,
      tokenState: api.tokenState,
    });
  }

  const report = buildReport({ keywordResults, country, granularity, login, tokenState });
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const keywords = readKeywordInput(options, positional);
  const { outputFile, report } = await run({
    keywords,
    country: options.country,
    granularity: options.granularity,
    out: options.out,
  });
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    source: report.source,
    endpoint: report.endpoint,
    country: report.country,
    granularity: report.granularity,
    login: report.login ? {
      ok: report.login.ok,
      status: report.login.status,
      code: report.login.code,
      loginSuccess: report.login.loginSuccess,
      tokenState: report.login.tokenState,
    } : null,
    tokenState: report.tokenState,
    summary: report.summary,
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
  KEYWORD_HISTORY_ENDPOINT,
  SIF_ORIGIN,
  buildKeywordHistoryUrl,
  buildReport,
  extractSifKeywordHistory,
  fetchKeywordHistoryInTab,
  findSifTab,
  loginSifInTab,
  parseArgs,
  readKeywordInput,
  readSifTokenState,
  run,
};
