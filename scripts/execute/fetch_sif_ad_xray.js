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

const AD_CAMPAIGN_CHART_ENDPOINT = '/api/search/asinAdCampaignView/chart';
const AD_GROUP_CHART_ENDPOINT = '/api/search/asinAdKeywordNum/chart';
const AD_SEARCH_TERM_ENDPOINT = '/api/search/variantAsinAdKeywords/list';
const REC_OVERVIEW_ENDPOINT = '/api/search/rec/overview';
const REC_VIEW_ENDPOINT = '/api/search/rec/recView';
const REC_CAMPAIGN_VIEW_ENDPOINT = '/api/search/rec/campaignView';

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

function buildAdCampaignPayload(options = {}) {
  return {
    granularity: text(options.granularity || 'week'),
    asin: text(options.asin).toUpperCase(),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
    conditions: {
      from: options.from || null,
      to: options.to || null,
      asin: options.searchAsin || options['search-asin'] || null,
      campaignId: text(options.campaignId || options['campaign-id']),
      encryptCampaignId: text(options.encryptCampaignId || options['encrypt-campaign-id']),
    },
    sortBy: text(options.sortBy || options['sort-by'] || 'campaign'),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    isAsinSearch: normalizeBool(options.isAsinSearch || options['is-asin-search'], false),
  };
}

function buildAdGroupPayload(options = {}) {
  return {
    lastMonths: positiveInt(options.lastMonths || options['last-months'], 6),
    adShowId: text(options.adShowId || options['ad-show-id']),
    campaignShowId: text(options.campaignShowId || options['campaign-show-id']),
    granularity: text(options.granularity || 'week'),
    asin: text(options.asin).toUpperCase(),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    groupByCampaign: normalizeBool(options.groupByCampaign || options['group-by-campaign'], false),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
    conditions: {
      from: options.from || null,
      to: options.to || null,
      asin: text(options.searchAsin || options['search-asin']),
      campaignId: text(options.campaignId || options['campaign-id']),
      encryptCampaignId: text(options.encryptCampaignId || options['encrypt-campaign-id']),
      encryptAdId: text(options.encryptAdId || options['encrypt-ad-id']),
    },
  };
}

function buildAdSearchTermPayload(options = {}) {
  return {
    asin: text(options.asin).toUpperCase(),
    timePieceType: text(options.timePieceType || options['time-piece-type'] || 'latelyDay'),
    latelyDay: positiveInt(options.latelyDay || options['lately-day'] || options.timePieceValue || options['time-piece-value'], 7),
    month: text(options.month),
    week: text(options.week),
    sortBy: text(options.sortBy || options['sort-by'] || 'spScoreRatio'),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
    searchKeyword: text(options.searchKeyword || options['search-keyword'] || options.keyword),
  };
}

function buildRecommendationPayload(options = {}) {
  return {
    asin: text(options.asin).toUpperCase(),
    timePieceType: text(options.timePieceType || options['time-piece-type'] || 'latelyDay'),
    timePieceValue: text(options.timePieceValue || options['time-piece-value'] || '7'),
  };
}

function buildRecommendationViewPayload(options = {}) {
  return {
    ...buildRecommendationPayload(options),
    desc: options.desc === undefined ? true : normalizeBool(options.desc, true),
    sortBy: text(options.recSortBy || options['rec-sort-by'] || options.sortBy || options['sort-by'] || 'ratio'),
  };
}

function buildRecommendationCampaignPayload(options = {}) {
  return {
    ...buildRecommendationViewPayload(options),
    recTitle: text(options.recTitle || options['rec-title']),
    campaignType: text(options.campaignType || options['campaign-type']),
    pageNum: positiveInt(options.pageNum || options.page || options['page-num'], 1),
    pageSize: positiveInt(options.pageSize || options['page-size'] || options.limit, 100),
  };
}

function rowsFrom(data = {}, key) {
  const value = data?.[key];
  return Array.isArray(value) ? value : [];
}

function apiOk(api = {}) {
  const json = api.json || api;
  return api.status === 200 && json?.code === 1;
}

function normalizeCampaign(row = {}) {
  return {
    campaignIdSuffix: text(row.fakeCampaignId),
    encryptedCampaignId: text(row.encryptCampaignId || row.encryptCampaignIdA0),
    campaignName: text(row.campaignName),
    adType: num(row.adType),
    productType: text(row.productType),
    strategy: text(row.strategy),
    campaignCreatedAt: text(row.campaignCreatedAt),
    lastAdCreatedAt: text(row.lastAdCreatedAt),
    asinCount: num(row.asinNum, 0),
    adCount: num(row.adNum, 0),
    flowCount: Array.isArray(row.flows) ? row.flows.length : 0,
    adTypes: Array.isArray(row.adTypesSet) ? row.adTypesSet.map(text).filter(Boolean) : [],
  };
}

function normalizeAdGroup(row = {}) {
  return {
    campaignIdSuffix: text(row.fakeCampaignId),
    adIdSuffix: text(row.fakeAdId),
    encryptedCampaignId: text(row.encryptCampaignIdA0),
    adType: num(row.adType),
    asin: text(row.asin),
    title: text(row.title),
    price: num(row.price),
    image: text(row.img),
    historyPoints: Array.isArray(row.history) ? row.history.length : 0,
  };
}

function normalizeAdSearchTerm(row = {}) {
  return {
    keyword: text(row.keyword),
    translation: text(row.translateKeyword),
    adIdCount: num(row.adIdNum, 0),
    campaignIdCount: num(row.campaignIdNum, 0),
    variantCount: num(row.variantNum, 0),
    estimatedSearches: num(row.estSearchesNum),
    searchesRank: num(row.searchesRank),
    spScoreRatio: num(row.spScoreRatio),
    keywordSpScoreRatio: num(row.kwSpScoreRatio),
    clickPurchaseRatio: num(row.clickPurchaseRatio),
    asins: Array.isArray(row.asins) ? row.asins.map(text).filter(Boolean) : [],
  };
}

function normalizeRecommendation(row = {}) {
  return {
    title: text(row.recTitle),
    ratio: num(row.ratio),
    manualRatio: num(row.manualRatio),
    autoRatio: num(row.autoRatio),
    campaignCount: num(row.campaignCnt, 0),
    keywordCount: num(row.keywordCnt, 0),
    lastCampaignCount: num(row.lastCampaignCnt, 0),
    lastKeywordCount: num(row.lastKeywordCnt, 0),
  };
}

function normalizeRecommendationCampaign(row = {}) {
  return {
    campaignIdSuffix: text(row.maskCampaignId || row.fakeCampaignId),
    campaignName: text(row.campaignName),
    campaignType: text(row.campaignType),
    productType: text(row.campaignProductType),
    ratio: num(row.ratio),
    recommendationCount: num(row.recCnt, 0),
    recommendationTitles: row.recDetail && typeof row.recDetail === 'object'
      ? Object.keys(row.recDetail).map(text).filter(Boolean)
      : [],
  };
}

function extractAdCampaignResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = rowsFrom(data, 'campaigns').map(normalizeCampaign);
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    total: num(data.total, rows.length),
    adCount: num(data.adNum, 0),
    spCount: num(data.spNum, 0),
    sbCount: num(data.sbNum, 0),
    sbvCount: num(data.sbvNum, 0),
    sbSbvCount: num(data.sbSbvNum, 0),
    spTraceBackTime: text(data.spTraceBackTime),
    sbTraceBackTime: text(data.sbTraceBackTime),
    rows,
  };
}

function extractAdGroupResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = rowsFrom(data, 'adInfo').map(normalizeAdGroup);
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    total: num(data.total, rows.length),
    campaignTotal: num(data.campaignTotal, 0),
    spCount: num(data.spNum, 0),
    sbCount: num(data.sbNum, 0),
    sbvCount: num(data.sbvNum, 0),
    rows,
  };
}

function extractAdSearchTermResult(api = {}) {
  const json = api.json || api;
  const data = json?.data || {};
  const rows = rowsFrom(data, 'keywords').map(normalizeAdSearchTerm);
  return {
    ok: apiOk(api),
    status: api.status ?? null,
    code: json?.code ?? null,
    message: text(json?.message || json?.msg),
    granularity: text(data.granularity),
    estimatedDate: text(data.estDate),
    total: num(data.total, rows.length),
    adIdTotal: num(data.adIdTotalNum, 0),
    campaignIdTotal: num(data.campaignIdTotalNum, 0),
    variantTotal: num(data.variantTotalNum, 0),
    rows,
  };
}

function extractRecommendationResult(overviewApi = {}, viewApi = {}, campaignApi = {}) {
  const overviewJson = overviewApi.json || overviewApi;
  const viewJson = viewApi.json || viewApi;
  const campaignJson = campaignApi.json || campaignApi;
  const overview = overviewJson?.data || {};
  const viewData = viewJson?.data || {};
  const campaignData = campaignJson?.data || {};
  const rows = rowsFrom(viewData, 'list').map(normalizeRecommendation);
  const campaigns = rowsFrom(campaignData, 'list').map(normalizeRecommendationCampaign);
  return {
    ok: apiOk(overviewApi) && apiOk(viewApi) && apiOk(campaignApi),
    status: {
      overview: overviewApi.status ?? null,
      recView: viewApi.status ?? null,
      campaignView: campaignApi.status ?? null,
    },
    code: {
      overview: overviewJson?.code ?? null,
      recView: viewJson?.code ?? null,
      campaignView: campaignJson?.code ?? null,
    },
    overview: {
      recommendationCount: num(overview.recCnt, 0),
      campaignCount: num(overview.campaignCnt, 0),
      keywordCount: num(overview.keywordCnt, 0),
    },
    totalRecommendationRows: rows.length,
    totalCampaignRows: num(campaignData.total, campaigns.length),
    rows,
    campaigns,
  };
}

function topRows(rows = [], count = 10) {
  return rows.slice(0, count);
}

function buildAdXrayReport({
  asin,
  country,
  request,
  tokenState,
  adCampaigns,
  adGroups,
  adSearchTerms,
  recommendations,
  generatedAt = new Date().toISOString(),
} = {}) {
  const evidenceRows =
    (adCampaigns.rows || []).length +
    (adGroups.rows || []).length +
    (adSearchTerms.rows || []).length +
    (recommendations.rows || []).length +
    (recommendations.campaigns || []).length;
  return {
    ok: !!adCampaigns.ok && !!adGroups.ok && !!adSearchTerms.ok && !!recommendations.ok,
    source: 'sif_direct',
    mode: 'ad_xray',
    exportedAt: generatedAt,
    asin,
    country,
    endpoints: {
      adCampaigns: AD_CAMPAIGN_CHART_ENDPOINT,
      adGroups: AD_GROUP_CHART_ENDPOINT,
      adSearchTerms: AD_SEARCH_TERM_ENDPOINT,
      recommendationOverview: REC_OVERVIEW_ENDPOINT,
      recommendationView: REC_VIEW_ENDPOINT,
      recommendationCampaignView: REC_CAMPAIGN_VIEW_ENDPOINT,
    },
    request,
    tokenState,
    summary: {
      adCampaignTotal: adCampaigns.total,
      adCount: adCampaigns.adCount,
      spCount: adCampaigns.spCount,
      sbCount: adCampaigns.sbCount,
      sbvCount: adCampaigns.sbvCount,
      adGroupTotal: adGroups.total,
      adSearchTermTotal: adSearchTerms.total,
      recommendationCount: recommendations.overview?.recommendationCount ?? 0,
      recommendationCampaignCount: recommendations.overview?.campaignCount ?? 0,
      recommendationKeywordCount: recommendations.overview?.keywordCount ?? 0,
      topCampaigns: topRows(adCampaigns.rows, 5),
      topAdSearchTerms: topRows(adSearchTerms.rows, 10),
      topRecommendationColumns: topRows(recommendations.rows, 10),
    },
    modules: {
      adCampaigns,
      adGroups,
      adSearchTerms,
      recommendations,
    },
    opsReadiness: {
      readyForDecisionSupport: evidenceRows > 0,
      readyForAutoAction: false,
      reason: 'SIF ad xray is read-only external ad-structure evidence; cross-check with our ad backend rows, converting search terms, listing fit, inventory, and economics before any live ad action',
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
    const headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      authorization: token,
    };
    const init = {
      method: input.method || 'POST',
      credentials: 'include',
      headers,
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

function defaultOutputFile(asin) {
  return path.join(OUT_DIR, `sif_ad_xray_${asin}_${todayYmd()}.json`);
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

  const campaignPayload = buildAdCampaignPayload({ ...options, asin });
  const groupPayload = buildAdGroupPayload({ ...options, asin });
  const searchTermPayload = buildAdSearchTermPayload({ ...options, asin });
  const recOverviewPayload = buildRecommendationPayload({ ...options, asin });
  const recViewPayload = buildRecommendationViewPayload({ ...options, asin });
  const recCampaignPayload = buildRecommendationCampaignPayload({ ...options, asin });

  const campaignApi = await fetchSifApiInTab(tab, { endpoint: AD_CAMPAIGN_CHART_ENDPOINT, body: campaignPayload, country });
  const groupApi = await fetchSifApiInTab(tab, { endpoint: AD_GROUP_CHART_ENDPOINT, body: groupPayload, country });
  const searchTermApi = await fetchSifApiInTab(tab, { endpoint: AD_SEARCH_TERM_ENDPOINT, body: searchTermPayload, country });
  const recOverviewApi = await fetchSifApiInTab(tab, { endpoint: REC_OVERVIEW_ENDPOINT, body: recOverviewPayload, country });
  const recViewApi = await fetchSifApiInTab(tab, { endpoint: REC_VIEW_ENDPOINT, body: recViewPayload, country });
  const recCampaignApi = await fetchSifApiInTab(tab, { endpoint: REC_CAMPAIGN_VIEW_ENDPOINT, body: recCampaignPayload, country });

  const report = buildAdXrayReport({
    asin,
    country,
    request: {
      adCampaigns: campaignPayload,
      adGroups: groupPayload,
      adSearchTerms: searchTermPayload,
      recommendationOverview: recOverviewPayload,
      recommendationView: recViewPayload,
      recommendationCampaignView: recCampaignPayload,
    },
    tokenState,
    adCampaigns: extractAdCampaignResult(campaignApi),
    adGroups: extractAdGroupResult(groupApi),
    adSearchTerms: extractAdSearchTermResult(searchTermApi),
    recommendations: extractRecommendationResult(recOverviewApi, recViewApi, recCampaignApi),
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
    out: options.out,
  });
  console.log(JSON.stringify({
    outputFile,
    ok: report.ok,
    asin: report.asin,
    country: report.country,
    adCampaignTotal: report.summary.adCampaignTotal,
    adCount: report.summary.adCount,
    spCount: report.summary.spCount,
    sbCount: report.summary.sbCount,
    sbvCount: report.summary.sbvCount,
    adGroupTotal: report.summary.adGroupTotal,
    adSearchTermTotal: report.summary.adSearchTermTotal,
    recommendationCount: report.summary.recommendationCount,
    topAdSearchTerms: report.summary.topAdSearchTerms.slice(0, 5),
    topRecommendationColumns: report.summary.topRecommendationColumns.slice(0, 5),
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
  AD_CAMPAIGN_CHART_ENDPOINT,
  AD_GROUP_CHART_ENDPOINT,
  AD_SEARCH_TERM_ENDPOINT,
  REC_CAMPAIGN_VIEW_ENDPOINT,
  REC_OVERVIEW_ENDPOINT,
  REC_VIEW_ENDPOINT,
  buildAdCampaignPayload,
  buildAdGroupPayload,
  buildAdSearchTermPayload,
  buildAdXrayReport,
  buildRecommendationCampaignPayload,
  buildRecommendationPayload,
  buildRecommendationViewPayload,
  extractAdCampaignResult,
  extractAdGroupResult,
  extractAdSearchTermResult,
  extractRecommendationResult,
  parseArgs,
  readAsinInput,
  run,
};
