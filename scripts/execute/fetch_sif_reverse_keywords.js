const fs = require('fs');
const path = require('path');
const { evaluate } = require('../../discovery/lib/cdp');
const {
  findSifTab,
  loginSifInTab,
  readSifTokenState,
} = require('./fetch_sif_keyword_history');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const REVERSE_KEYWORDS_ENDPOINT = '/api/search/asinKeywordList';
const REVERSE_OVERVIEW_ENDPOINT = '/api/search/asinKeywordOverview';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
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

function readAsinInput(options = {}, positional = []) {
  const asin = text(options.asin || options.ASIN || positional[0]).toUpperCase();
  if (!/^B[A-Z0-9]{9}$/.test(asin)) {
    throw new Error('missing ASIN; pass --asin B012345678');
  }
  return asin;
}

function buildReverseKeywordPayload(options = {}) {
  return {
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 50),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    conditions: Array.isArray(options.conditions)
      ? options.conditions
      : [text(options.conditions || 'totalPeriod.total')],
    keyword: text(options.keyword),
    asin: text(options.asin).toUpperCase(),
    listingSearch: normalizeBool(options.listingSearch || options['listing-search'], false),
    timePieceType: text(options.timePieceType || options['time-piece-type'] || 'latelyDay'),
    timePieceValue: text(options.timePieceValue || options['time-piece-value'] || '7'),
    keywordSearch: text(options.keywordSearch || options['keyword-search']),
    sortBy: text(options.sortBy || options['sort-by'] || 'scoreInfo.scoreRatio'),
  };
}

function buildReverseOverviewPayload(options = {}) {
  return {
    asin: text(options.asin).toUpperCase(),
    listingSearch: normalizeBool(options.listingSearch || options['listing-search'], false),
    timePieceType: text(options.timePieceType || options['time-piece-type'] || 'latelyDay'),
    timePieceValue: text(options.timePieceValue || options['time-piece-value'] || '7'),
  };
}

function scoreSummary(value = {}) {
  return {
    score: num(value.score),
    ratio: num(value.scoreRatio),
    change: num(value.scoreChange),
    changeRatio: num(value.scoreChangeRatio),
    contributionChangeRatio: num(value.contriChangeRatio),
  };
}

function rankSummary(row = {}, prefix) {
  return {
    rank: num(row[`${prefix}LastRank`]),
    rankText: text(row[`${prefix}LastRankStr`]),
    rankTime: text(row[`${prefix}LastRankTimeStr`] || row[`${prefix}LastRankTime`]),
  };
}

function normalizeReverseKeywordRow(row = {}) {
  return {
    keyword: text(row.keyword),
    keywordId: num(row.keywordId),
    translation: text(row.translateKeyword),
    isCore: !!row.isCore,
    isTarget: !!row.isTarget,
    pieceMaxTime: text(row.pieceMaxTime),
    updateTime: num(row.updateTime),
    exposurePositions: Array.isArray(row.exposurePositions) ? row.exposurePositions.map(text).filter(Boolean) : [],
    total: scoreSummary(row.scoreInfo),
    natural: scoreSummary(row.nfScoreInfo),
    ad: scoreSummary(row.adScoreInfo),
    spAll: scoreSummary(row.allSpScoreInfo),
    sp: scoreSummary(row.spScoreInfo),
    recSp: scoreSummary(row.recSpScoreInfo),
    sbAll: scoreSummary(row.allSbScoreInfo),
    sb: scoreSummary(row.sbScoreInfo),
    sbv: scoreSummary(row.sbvScoreInfo),
    naturalRank: rankSummary(row, 'nf'),
    spRank: rankSummary(row, 'sp'),
    sbRank: rankSummary(row, 'sb'),
    sbvRank: rankSummary(row, 'sbv'),
  };
}

function normalizeOverviewCount(value = {}) {
  return {
    total: num(value.total, 0),
    previous: num(value.prev, 0),
    in: num(value.in, 0),
    out: num(value.out, 0),
  };
}

function extractReverseKeywordResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = Array.isArray(data.list) ? data.list.map(normalizeReverseKeywordRow) : [];
  return {
    ok: api.status === 200 && json?.code === 1 && Array.isArray(data.list),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    total: num(data.total, rows.length),
    rows,
    timeMode: text(data.timeMode),
    pasin: !!data.pasin,
    balanceIntegral: num(json.balanceIntegral),
  };
}

function extractReverseOverviewResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  return {
    ok: api.status === 200 && json?.code === 1 && !!data.totalPeriod,
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    totalPeriod: normalizeOverviewCount(data.totalPeriod),
    historyTotal: num(data.historyTotal, 0),
    naturalKeywords: normalizeOverviewCount(data.nfKeywordCnt),
    adKeywords: normalizeOverviewCount(data.adKeywordCnt),
    spAllKeywords: normalizeOverviewCount(data.allSpKeywordCnt),
    spKeywords: normalizeOverviewCount(data.spKeywordCnt),
    recSpKeywords: normalizeOverviewCount(data.recSpKeywordCnt),
    sbAllKeywords: normalizeOverviewCount(data.allSbKeywordCnt),
    sbKeywords: normalizeOverviewCount(data.sbKeywordCnt),
    sbvKeywords: normalizeOverviewCount(data.sbvKeywordCnt),
    pasin: !!data.pasin,
  };
}

function topRows(rows = [], count = 10) {
  return rows.slice(0, count).map(row => ({
    keyword: row.keyword,
    translation: row.translation,
    score: row.total.score,
    scoreRatio: row.total.ratio,
    naturalRatio: row.natural.ratio,
    adRatio: row.ad.ratio,
    positions: row.exposurePositions,
    naturalRank: row.naturalRank.rankText || row.naturalRank.rank,
  }));
}

function buildReverseKeywordReport({
  asin,
  country,
  request,
  overview,
  keywordResult,
  tokenState,
  generatedAt = new Date().toISOString(),
} = {}) {
  const rows = keywordResult.rows || [];
  return {
    ok: !!overview.ok && !!keywordResult.ok,
    source: 'sif_direct',
    mode: 'reverse_keywords',
    exportedAt: generatedAt,
    asin,
    country,
    endpoints: {
      overview: REVERSE_OVERVIEW_ENDPOINT,
      keywordList: REVERSE_KEYWORDS_ENDPOINT,
    },
    request,
    tokenState,
    overview,
    summary: {
      totalKeywords: keywordResult.total,
      returnedRows: rows.length,
      naturalKeywords: overview.naturalKeywords?.total ?? null,
      adKeywords: overview.adKeywords?.total ?? null,
      spKeywords: overview.spKeywords?.total ?? null,
      recSpKeywords: overview.recSpKeywords?.total ?? null,
      sbKeywords: overview.sbKeywords?.total ?? null,
      sbvKeywords: overview.sbvKeywords?.total ?? null,
      topKeywords: topRows(rows, 10),
    },
    opsReadiness: {
      readyForDecisionSupport: rows.length > 0,
      readyForAutoAction: false,
      reason: 'SIF reverse keywords are read-only competitor traffic evidence; cross-check with ad backend converting terms, selection conversion data, listing fit, and inventory before any live ad action',
    },
    rows,
  };
}

async function fetchSifApiInTab(tab, endpoint, body) {
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
    const url = ${JSON.stringify(endpoint)} + '?country=' + encodeURIComponent(${JSON.stringify(body.country || 'US')}) + '&_t=' + Date.now();
    const payload = ${JSON.stringify({ ...body, country: undefined })};
    delete payload.country;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        authorization: token,
      },
      body: JSON.stringify(payload),
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

function defaultOutputFile(asin) {
  return path.join(OUT_DIR, `sif_reverse_keywords_${asin}_${todayYmd()}.json`);
}

async function run(options = {}) {
  const asin = readAsinInput(options, options.positional || []);
  const country = text(options.country || 'US').toUpperCase();
  const tab = await findSifTab();
  if (!tab) throw new Error('SIF tab not found; run npm run chrome:ready first');

  let tokenState = await readSifTokenState(tab);
  if (!tokenState.hasToken && process.env.SIF_PHONE && process.env.SIF_PASSWORD) {
    await loginSifInTab(tab, {
      phone: process.env.SIF_PHONE,
      password: process.env.SIF_PASSWORD,
    });
    tokenState = await readSifTokenState(tab);
  }
  if (!tokenState.hasToken) {
    throw new Error('SIF session missing; login in the shared business browser or set SIF_PHONE/SIF_PASSWORD for one-time in-tab login');
  }

  const listPayload = buildReverseKeywordPayload({ ...options, asin });
  const overviewPayload = buildReverseOverviewPayload({ ...options, asin });
  const overviewApi = await fetchSifApiInTab(tab, REVERSE_OVERVIEW_ENDPOINT, { ...overviewPayload, country });
  const listApi = await fetchSifApiInTab(tab, REVERSE_KEYWORDS_ENDPOINT, { ...listPayload, country });
  const overview = extractReverseOverviewResult(overviewApi);
  const keywordResult = extractReverseKeywordResult(listApi);
  const report = buildReverseKeywordReport({
    asin,
    country,
    request: { overview: overviewPayload, keywordList: listPayload },
    overview,
    keywordResult,
    tokenState,
  });
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile(asin);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const asin = readAsinInput(options, positional);
  const { outputFile, report } = await run({
    ...options,
    positional,
    asin,
    country: options.country,
    pageSize: options.pageSize || options['page-size'],
    pageNum: options.pageNum || options.page || options['page-num'],
    timePieceType: options.timePieceType || options['time-piece-type'],
    timePieceValue: options.timePieceValue || options['time-piece-value'],
    keywordSearch: options.keywordSearch || options['keyword-search'],
    sortBy: options.sortBy || options['sort-by'],
    out: options.out,
  });
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    asin: report.asin,
    country: report.country,
    totalKeywords: report.summary.totalKeywords,
    returnedRows: report.summary.returnedRows,
    naturalKeywords: report.summary.naturalKeywords,
    adKeywords: report.summary.adKeywords,
    topKeywords: report.summary.topKeywords.slice(0, 5),
    tokenState: {
      hasToken: !!report.tokenState?.hasToken,
      tokenLength: report.tokenState?.tokenLength || 0,
    },
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
  REVERSE_KEYWORDS_ENDPOINT,
  REVERSE_OVERVIEW_ENDPOINT,
  buildReverseKeywordPayload,
  buildReverseKeywordReport,
  buildReverseOverviewPayload,
  extractReverseKeywordResult,
  extractReverseOverviewResult,
  normalizeReverseKeywordRow,
  parseArgs,
  readAsinInput,
  run,
};
