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

const POSITION_COUNT_ENDPOINT = '/api/search/competeAsinAssay';
const COMPETITION_PATTERN_ENDPOINT = '/api/search/competePattern';
const SNAPSHOT_QUERY_ENDPOINT = '/api/monitorSnapshot/queryList';
const SNAPSHOT_SUGGESTION_ENDPOINT = '/api/monitorSnapshot/suggestion';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/[$,%]/g, '').replace(/,/g, ''));
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

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  return text(value).split(/[,，\r\n]+/).map(text).filter(Boolean);
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
  if (options.terms) values.push(options.terms);
  if (options.searchTerm) values.push(options.searchTerm);
  if (options['search-term']) values.push(options['search-term']);
  if (positional.length) values.push(positional.join(','));
  const keywords = [...new Set(splitList(values.join(',')))];
  if (!keywords.length) throw new Error('missing keyword; pass --keyword "balloon pump" or --keywords "term1,term2"');
  return keywords;
}

function buildPositionCountPayload(options = {}) {
  const keywords = splitList(options.keywords || options.keyword || []);
  return {
    isExpand: options.isExpand === undefined ? true : normalizeBool(options.isExpand || options['is-expand'], true),
    keywords,
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    trendType: text(options.trendType || options['trend-type'] || 'week'),
    sortBy: text(options.sortBy || options['sort-by'] || 'estSearchesNum'),
  };
}

function buildCompetitionPatternPayload(options = {}) {
  return {
    timePieceType: text(options.timePieceType || options['time-piece-type'] || 'latelyDay'),
    timePieceValue: text(options.timePieceValue || options['time-piece-value'] || '7'),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
    sortBy: text(options.patternSortBy || options['pattern-sort-by'] || options.sortBy || options['sort-by'] || 'nfScoreRatio'),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    keyword: text(options.keyword),
    searchValue: text(options.searchValue || options['search-value']),
  };
}

function buildSnapshotPayload(options = {}) {
  return {
    keyword: text(options.keyword),
    adType: text(options.adType || options['ad-type'] || 'sp'),
  };
}

function apiOk(api = {}) {
  const json = api.json || api;
  return api.status === 200 && json?.code === 1;
}

function normalizePositionCountRow(row = {}) {
  return {
    keyword: text(row.keyword),
    translation: text(row.translateKeyword),
    estimatedSearches: num(row.estSearchesNum),
    searchesRank: num(row.searchesRank),
    sales: num(row.saleNum),
    naturalAsinCount: num(row.nfAsinNum, 0),
    spAsinCount: num(row.spAsinNum, 0),
    brandAsinCount: num(row.brandAsinNum, 0),
    videoAsinCount: num(row.videoAsinNum, 0),
    acAsinCount: num(row.acAsinNum, 0),
    ppcAsinCount: num(row.ppcAsinNum, 0),
    recommendedAsinCount: num(row.recommendedAsinNum, 0),
    conversionShare: num(row.conversionShared),
    clickShare: num(row.clickShared),
  };
}

function normalizeCompetitorRow(row = {}) {
  return {
    asin: text(row.asin),
    title: text(row.title),
    image: text(row.img),
    price: num(row.price),
    ratingCount: num(row.ratingNum),
    score: num(row.score),
    star: num(row.star),
    boughtInPastMonth: text(row.boughtInPastMonth),
    naturalScoreRatio: num(row.nfScoreRatio),
    spScoreRatio: num(row.spScoreRatio),
    videoAdScoreRatio: num(row.videoAdScoreRatio ?? row.vedioAdScoreRatio),
    brandAdScoreRatio: num(row.brandAdScoreRatio),
    acScoreRatio: num(row.acScoreRatio),
    erScoreRatio: num(row.erScoreRatio),
    trScoreRatio: num(row.trScoreRatio),
    hasVariants: !!row.hasVaiants || !!row.hasVariants,
  };
}

function normalizeSnapshotSlot(row = {}) {
  return {
    asin: text(row.asin),
    title: text(row.title),
    image: text(row.img),
    price: num(row.price),
    ratingCount: num(row.ratingNum),
    score: num(row.score),
    star: num(row.star),
    adType: text(row.adType || row.adTypeFeature),
    campaignId: text(row.campaignId || row.campaignA0Id),
    campaignIdSuffix: text(row.fakeCampaignId),
    rankText: text(row.rankStr),
    rank: num(row.rank),
    pageNo: num(row.pageNo),
    pageRank: num(row.pageRank),
    position: text(row.position),
    time: text(row.timeFormat || row.dateTimeKey),
    keyword: text(row.keyword),
    column: text(row.column),
    isExample: !!row.isExample,
  };
}

function flattenSnapshotSlots(table = []) {
  const rows = [];
  for (const pageRow of Array.isArray(table) ? table : []) {
    for (const hourItems of Array.isArray(pageRow.hourAsins) ? pageRow.hourAsins : []) {
      for (const item of Array.isArray(hourItems) ? hourItems : []) {
        if (item && typeof item === 'object') rows.push(normalizeSnapshotSlot(item));
      }
    }
  }
  const seen = new Set();
  return rows.filter(row => {
    const key = [row.asin, row.position, row.time, row.campaignId].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPositionCountResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = Array.isArray(data.keywords) ? data.keywords.map(normalizePositionCountRow) : [];
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    total: num(data.total, rows.length),
    rows,
  };
}

function extractCompetitionPatternResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = Array.isArray(data.asins) ? data.asins.map(normalizeCompetitorRow) : [];
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    total: num(data.total, rows.length),
    boughtMonth: data.boughtMonth || null,
    dutyFinishDate: text(data.dutyFinishDate),
    rows,
  };
}

function extractSnapshotResult(api = {}, suggestionApi = {}) {
  const json = api.json || api;
  const suggestionJson = suggestionApi.json || suggestionApi;
  const data = json?.data || {};
  const suggestionData = suggestionJson?.data || {};
  const slots = flattenSnapshotSlots(data.table);
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(data.message || json?.message || json?.msg),
    flag: num(data.flag),
    searchTime: text(data.searchTime),
    countrySearchTime: text(data.countrySearchTime),
    chinaSearchTime: text(data.chinaSearchTime),
    monitored: Array.isArray(data.table) && data.table.length > 0,
    tableRows: Array.isArray(data.table) ? data.table.length : 0,
    slotRows: slots.length,
    slots,
    suggestion: {
      ok: apiOk(suggestionApi),
      total: num(suggestionData.total, 0),
      record: suggestionData.record || null,
    },
  };
}

function topRows(rows = [], count = 10) {
  return rows.slice(0, count);
}

function buildKeywordSlotReport({
  country,
  keywords,
  request,
  tokenState,
  positionCounts,
  keywordReports,
  generatedAt = new Date().toISOString(),
} = {}) {
  const reports = keywordReports || {};
  const allOk = !!positionCounts.ok && Object.values(reports).every(item => item.competition.ok && item.snapshot.ok);
  const evidenceRows = (positionCounts.rows || []).length + Object.values(reports)
    .reduce((sum, item) => sum + (item.competition.rows || []).length + (item.snapshot.slots || []).length, 0);
  return {
    ok: allOk,
    source: 'sif_direct',
    mode: 'keyword_slots',
    exportedAt: generatedAt,
    country,
    keywords,
    endpoints: {
      positionCounts: POSITION_COUNT_ENDPOINT,
      competitionPattern: COMPETITION_PATTERN_ENDPOINT,
      snapshotQuery: SNAPSHOT_QUERY_ENDPOINT,
      snapshotSuggestion: SNAPSHOT_SUGGESTION_ENDPOINT,
    },
    request,
    tokenState,
    summary: {
      keywordCount: keywords.length,
      positionCountRows: positionCounts.rows.length,
      topPositionCounts: topRows(positionCounts.rows, 10),
      topCompetitorsByKeyword: Object.fromEntries(Object.entries(reports).map(([keyword, item]) => [
        keyword,
        topRows(item.competition.rows, 5),
      ])),
      snapshotStatusByKeyword: Object.fromEntries(Object.entries(reports).map(([keyword, item]) => [
        keyword,
        {
          monitored: item.snapshot.monitored,
          searchTime: item.snapshot.searchTime,
          slotRows: item.snapshot.slotRows,
          message: item.snapshot.message,
        },
      ])),
    },
    positionCounts,
    keywordsDetail: reports,
    opsReadiness: {
      readyForDecisionSupport: evidenceRows > 0,
      readyForAutoAction: false,
      reason: 'SIF keyword slots are read-only placement and competitor evidence; cross-check with selection conversion economics, ABA, Product Time Machine, SKU fit, and our ad backend before live ad actions',
    },
  };
}

async function fetchSifApiInTab(tab, { endpoint, method = 'POST', body = {}, query = {}, country = 'US' } = {}) {
  const raw = await evaluate(tab, `(async () => {
    const input = ${JSON.stringify({ endpoint, method, body, query, country })};
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
    const params = new URLSearchParams({ country: input.country || 'US', _t: String(Date.now()) });
    for (const [key, value] of Object.entries(input.query || {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const init = {
      method: input.method || 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        authorization: token,
      },
    };
    if (init.method !== 'GET') init.body = JSON.stringify(input.body || {});
    const res = await fetch(input.endpoint + '?' + params.toString(), init);
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

function defaultOutputFile() {
  return path.join(OUT_DIR, `sif_keyword_slots_${todayYmd()}.json`);
}

async function run(options = {}) {
  const keywords = readKeywordInput(options, options.positional || []);
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

  const positionPayload = buildPositionCountPayload({ ...options, keywords });
  const positionApi = await fetchSifApiInTab(tab, { endpoint: POSITION_COUNT_ENDPOINT, body: positionPayload, country });
  const positionCounts = extractPositionCountResult(positionApi);
  const request = { positionCounts: positionPayload, keywords: {} };
  const keywordReports = {};

  for (const keyword of keywords) {
    const competitionPayload = buildCompetitionPatternPayload({ ...options, keyword });
    const snapshotPayload = buildSnapshotPayload({ ...options, keyword });
    const competitionApi = await fetchSifApiInTab(tab, { endpoint: COMPETITION_PATTERN_ENDPOINT, body: competitionPayload, country });
    const snapshotApi = await fetchSifApiInTab(tab, { endpoint: SNAPSHOT_QUERY_ENDPOINT, body: snapshotPayload, country });
    const suggestionApi = await fetchSifApiInTab(tab, {
      endpoint: SNAPSHOT_SUGGESTION_ENDPOINT,
      method: 'GET',
      query: { s: keyword },
      country,
    });
    request.keywords[keyword] = {
      competitionPattern: competitionPayload,
      snapshot: snapshotPayload,
      suggestion: { s: keyword },
    };
    keywordReports[keyword] = {
      competition: extractCompetitionPatternResult(competitionApi),
      snapshot: extractSnapshotResult(snapshotApi, suggestionApi),
    };
  }

  const report = buildKeywordSlotReport({
    country,
    keywords,
    request,
    tokenState,
    positionCounts,
    keywordReports,
  });
  const outputFile = options.out ? path.resolve(options.out) : defaultOutputFile();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { outputFile, report };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const { outputFile, report } = await run({
    ...options,
    positional,
    pageSize: options.pageSize || options['page-size'],
    pageNum: options.pageNum || options.page || options['page-num'],
    adType: options.adType || options['ad-type'],
    out: options.out,
  });
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    country: report.country,
    keywords: report.keywords,
    positionCountRows: report.summary.positionCountRows,
    topPositionCounts: report.summary.topPositionCounts,
    snapshotStatusByKeyword: report.summary.snapshotStatusByKeyword,
    topCompetitorsByKeyword: Object.fromEntries(Object.entries(report.summary.topCompetitorsByKeyword)
      .map(([keyword, rows]) => [keyword, rows.slice(0, 3)])),
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
  COMPETITION_PATTERN_ENDPOINT,
  POSITION_COUNT_ENDPOINT,
  SNAPSHOT_QUERY_ENDPOINT,
  SNAPSHOT_SUGGESTION_ENDPOINT,
  buildCompetitionPatternPayload,
  buildKeywordSlotReport,
  buildPositionCountPayload,
  buildSnapshotPayload,
  extractCompetitionPatternResult,
  extractPositionCountResult,
  extractSnapshotResult,
  flattenSnapshotSlots,
  parseArgs,
  readKeywordInput,
  run,
};
