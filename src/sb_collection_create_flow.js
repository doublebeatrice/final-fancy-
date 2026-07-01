const fs = require('fs');
const path = require('path');

const { openAdvWs, advRequest, apiList, resolveSkuAccount, ymd } = require('./adv_backend');
const { fetchBrand, parseCsvList } = require('./sbv_create_flow');
const { buildSbManualCollectionKeywordPayload } = require('./sb_manual_collection_create');

const ROOT = path.join(__dirname, '..');
const ACTIONS_DIR = path.join(ROOT, 'data', 'actions');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

// Auto-target bucket pseudo-terms that show up in keyword rows but are not real
// customer keywords — never carry these into an SB keyword campaign.
const AUTO_BUCKET_TERMS = new Set([
  'substitutes', 'close-match', 'loose-match', 'complements',
  'close match', 'loose match', '*', '', 'category', 'asin',
]);

function normalizeTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// keyword/findAllNew and adProductData rows use Capitalized metric keys
// (Orders/Clicks/Spend/Sales); some other endpoints use lowercase. Read both.
function metric(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return num(row[key]);
  }
  return 0;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

// Enumerate ALL campaigns (incl. paused) for a SKU. resolveSkuAccount only sees
// running rows (state:1); the converting-term archaeology needs paused groups
// too, so we re-query /product/adProductData with state:4. SB rows carry
// campaignId but an empty adGroupId at product level, so we key on campaignId
// and let keyword/findAllNew expand the groups.
async function fetchSkuGroups(ws, sku, siteId, accountId) {
  const end = ymd(new Date(Date.now() - 86400000));
  const res = await advRequest(ws, 'POST', '/product/adProductData', {
    selectDate: ['2022-01-01', end],
    mode: 1,
    state: 4,
    siteId: Number(siteId) || 4,
    sku: String(sku).toUpperCase(),
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    accountId: accountId || undefined,
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 500,
  });
  const rows = apiList(res.json || {});
  return rows
    .map(r => ({ campaignId: String(r.campaignId || ''), adGroupId: String(r.adGroupId || '') }))
    .filter(g => g.campaignId);
}

// Pull keyword rows for one campaign (all its groups) across a wide window. The
// keyword/findAllNew endpoint paginates 500/page; converting archaeology rarely
// exceeds a few pages. adGroupId is optional — omitting it returns every group.
async function fetchGroupKeywordRows(ws, { campaignId, adGroupId, accountId, siteId, startYmd, endYmd }) {
  const rows = [];
  const base = {
    siteId: Number(siteId),
    timeRange: [
      new Date(`${startYmd}T00:00:00`).getTime(),
      new Date(new Date(`${endYmd}T00:00:00`).getTime() + 86400000).getTime(),
    ],
    state: '4',
    coreMark: '0',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    publicAdv: '2',
    lowCost: 2,
    accountId: Number(accountId),
    campaignId,
    property: '1',
    selectDate: [startYmd, endYmd],
    field: 'Spend',
    order: 'desc',
    limit: 500,
    filterArray: { campaignState: '4' },
  };
  if (adGroupId) base.adGroupId = adGroupId;
  for (let page = 1; page <= 20; page += 1) {
    const res = await advRequest(ws, 'POST', '/keyword/findAllNew', { ...base, page });
    const list = apiList(res.json || {});
    rows.push(...list);
    if (list.length < 500) break;
  }
  return rows;
}

// Aggregate keyword rows across all groups by normalized text, sum the metrics,
// drop auto-bucket pseudo-terms, then rank by orders (sales as tiebreak).
function aggregateConvertingTerms(allRows, { maxAcos } = {}) {
  const byTerm = new Map();
  for (const row of allRows) {
    const text = row.keywordText || row.keyword || row.searchTerm || '';
    const key = normalizeTerm(text);
    if (AUTO_BUCKET_TERMS.has(key)) continue;
    if (!key) continue;
    const cur = byTerm.get(key) || { kw: text.trim(), orders: 0, clicks: 0, spend: 0, sales: 0, states: new Set() };
    cur.orders += metric(row, 'Orders', 'orders', 'orderNum', 'totalOrders');
    cur.clicks += metric(row, 'Clicks', 'clicks', 'click');
    cur.spend += metric(row, 'Spend', 'spend', 'cost');
    cur.sales += metric(row, 'Sales', 'sales', 'saleAmount', 'totalSales');
    if (row.state != null) cur.states.add(String(row.state));
    byTerm.set(key, cur);
  }
  let terms = [...byTerm.values()].map(t => ({
    kw: t.kw,
    orders: t.orders,
    clicks: t.clicks,
    spend: round2(t.spend),
    sales: round2(t.sales),
    cpc: t.clicks ? round2(t.spend / t.clicks) : 0,
    acos: t.sales ? round2(t.spend / t.sales) : null,
    states: [...t.states],
  }));
  terms = terms.filter(t => t.orders >= 1);
  if (Number.isFinite(maxAcos)) terms = terms.filter(t => t.acos == null || t.acos <= maxAcos);
  terms.sort((a, b) => b.orders - a.orders || b.sales - a.sales || b.clicks - a.clicks);
  return terms;
}

// Click-weighted average CPC across the chosen top terms — the bid the operator
// asked for. Falls back to simple mean when click data is thin.
function avgCpcBid(topTerms) {
  const totalClicks = topTerms.reduce((s, t) => s + num(t.clicks), 0);
  const totalSpend = topTerms.reduce((s, t) => s + num(t.spend), 0);
  const weighted = totalClicks ? totalSpend / totalClicks : 0;
  const simple = topTerms.length
    ? topTerms.reduce((s, t) => s + num(t.cpc), 0) / topTerms.length
    : 0;
  const bid = weighted || simple;
  return {
    bid: Math.max(round2(bid), 0.1),
    avgCpcClickWeighted: round2(weighted),
    avgCpcSimple: round2(simple),
  };
}

// Reuse an existing approved SB to source BOTH the brand and the logo, so the
// new ad is consistent with how these ASINs are already advertised and does not
// land INCOMPLETE. /sbProduct/getStore is unreliable here — it returns the
// account's first registered brand, which is wrong when the account holds
// multiple brands. Instead scan SB campaigns, read each PRODUCT_COLLECTION
// creative (only those carry brandLogoAssetID), and PREFER one whose creative
// ASINs overlap our target ASINs; fall back to any logo-bearing collection.
async function resolveBrandAndLogo(ws, { accountId, siteId, targetAsins = [] }) {
  const listRes = await advRequest(ws, 'POST', '/campaignSb/findAllNew', {
    siteId: Number(siteId),
    accountId: Number(accountId),
    field: 'Spend',
    order: 'desc',
    page: 1,
    limit: 100,
    selectDate: ['2022-01-01', ymd()],
    level: 'seller_num',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    state: '',
  });
  const rows = apiList(listRes.json || {});
  const wantAsins = new Set(targetAsins.map(a => String(a).toUpperCase()));
  let fallback = null;
  for (const row of rows) {
    const campaignId = String(row.campaignId || row.primaryId || '');
    const adGroups = Array.isArray(row.adGroups) ? row.adGroups : (Array.isArray(row.groups) ? row.groups : []);
    if (!campaignId || !adGroups.length) continue;
    for (const g of adGroups) {
      const adGroupId = String(g.adGroupId || g.id || '');
      if (!adGroupId) continue;
      const cr = await advRequest(ws, 'GET', `/ad/getCreative?campaignId=${campaignId}&accountId=${accountId}&siteId=${siteId}&adGroupId=${adGroupId}`, {});
      const data = cr.json?.data || {};
      let creative = {};
      try { creative = JSON.parse(data.creative || '{}'); } catch (_) { creative = {}; }
      if (!creative.brandLogoAssetID) continue;
      let crAsins = [];
      try { crAsins = JSON.parse(data.asins || '[]'); } catch (_) { crAsins = Array.isArray(data.asins) ? data.asins : []; }
      const match = {
        brandEntityId: data.brandEntityId || row.brandEntityId || '',
        brandName: creative.brandName || row.brandName || '',
        brandLogoAssetID: creative.brandLogoAssetID,
        brandLogoCrop: creative.brandLogoCrop || { top: 0, left: 0, width: 400, height: 400 },
        source: `campaign ${campaignId} / group ${adGroupId}`,
      };
      if (crAsins.some(a => wantAsins.has(String(a).toUpperCase()))) {
        return { ...match, matchedByAsin: true };
      }
      if (!fallback) fallback = { ...match, matchedByAsin: false };
    }
  }
  if (fallback) return fallback;
  return { error: 'no_existing_sb_logo', scanned: rows.length };
}

async function readbackCreative(ws, { campaignId, adGroupId, accountId, siteId }) {
  const cr = await advRequest(ws, 'GET', `/ad/getCreative?campaignId=${campaignId}&accountId=${accountId}&siteId=${siteId}&adGroupId=${adGroupId}`, {});
  const d = cr.json?.data || {};
  let creative = {};
  try { creative = JSON.parse(d.creative || '{}'); } catch (_) { creative = {}; }
  return {
    state: d.state,
    servingStatus: d.servingStatus,
    creativeStatus: d.creativeStatus,
    servingStatusDetails: d.servingStatusDetails,
    brandLogoAssetID: creative.brandLogoAssetID || null,
    headline: creative.headline || creative.title || null,
    asins: d.asins,
  };
}

function shortAdName(coreTerm, skuCount) {
  // Ad creative name is capped at 32 chars (Amazon AD_CREATIVE limit).
  const base = `sb ${coreTerm}`.trim();
  const suffix = ` x${skuCount}`;
  const room = 32 - suffix.length;
  return (base.length > room ? base.slice(0, room).trim() : base) + suffix;
}

function extractCreateMeta(response = {}) {
  const data = response?.data || response?.json?.data || {};
  return {
    campaignId: String(data.campaignId || data.campaign?.data || ''),
    adGroupId: String(data.adGroupId || data.group?.responseParams?.response?.adGroups?.success?.[0]?.adGroupId || ''),
  };
}

async function runSbCollectionCreateFlow(options = {}) {
  const args = options.args || {};
  const skus = (options.skus || parseCsvList(args.skus || args.sku) || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
  const date = options.date || ymd();
  const execute = options.execute === true || args.execute === true;
  const siteIdArg = Number(args.siteId || 4);
  const topN = Number(args.top || options.top || 10);
  const matchType = String(args.matchType || 'BROAD').toUpperCase();
  const budget = Number(args.budget ?? args.dailyBudget ?? 10);
  const maxAcos = args.maxAcos != null ? Number(args.maxAcos) : (options.maxAcos != null ? options.maxAcos : NaN);
  const headlineArg = String(args.headline || options.headline || '').trim();
  const startYmd = String(args.windowStart || options.windowStart || '2022-01-01');
  const endYmd = String(args.windowEnd || options.windowEnd || date);
  const outFile = options.out || path.join(ACTIONS_DIR, `sb_collection_${(skus[0] || 'unknown').toLowerCase()}_x${skus.length}_${date}.json`);

  const out = {
    exportedAt: new Date().toISOString(),
    dryRun: !execute,
    evidenceBoundary: 'Live ad backend reads from debug Chrome. Converting terms = SP keyword rows (property=1, all states) over the window; not GBrain.',
    skus,
    resolved: null,
    convertingEvidence: null,
    brandEvidence: null,
    logoEvidence: null,
    plan: null,
    execution: null,
    ok: false,
  };

  if (skus.length < 3) {
    out.execution = { skipped: true, reason: 'sb_product_collection_needs_at_least_3_skus', skus };
    return { out, outFile: writeJson(outFile, out) };
  }

  const ws = await openAdvWs();
  ws.setMaxListeners(0); // parallel advRequest fan-out adds many transient message listeners
  try {
    // 1) Resolve every SKU's account/asin in parallel.
    const resolved = await Promise.all(skus.map(sku => resolveSkuAccount(ws, sku, siteIdArg)));
    const resolvedMap = skus.map((sku, i) => ({ sku, ...resolved[i] }));
    out.resolved = resolvedMap.map(r => ({ sku: r.sku, ok: r.ok, accountId: r.accountId, asin: r.asin, siteId: r.siteId, error: r.error }));
    const failed = resolvedMap.filter(r => !r.ok || !r.asin || !r.accountId);
    if (failed.length) {
      out.execution = { skipped: true, reason: 'sku_resolve_failed', failed: failed.map(f => ({ sku: f.sku, error: f.error })) };
      return { out, outFile: writeJson(outFile, out) };
    }
    const accountId = resolvedMap[0].accountId;
    const siteId = resolvedMap[0].siteId || siteIdArg;
    const products = resolvedMap.map(r => ({ sku: r.sku, asin: r.asin }));
    const mixedAccount = resolvedMap.some(r => r.accountId !== accountId);
    if (mixedAccount) {
      out.execution = { skipped: true, reason: 'skus_span_multiple_accounts', resolved: out.resolved };
      return { out, outFile: writeJson(outFile, out) };
    }

    // 2) Enumerate all groups (incl. paused) per SKU in parallel, then dedupe.
    const groupLists = await Promise.all(resolvedMap.map(r => fetchSkuGroups(ws, r.sku, siteId, accountId)));
    const groupKey = g => `${g.campaignId}:${g.adGroupId}`;
    const groups = [...new Map(groupLists.flat().map(g => [groupKey(g), g])).values()];

    // 3) Pull keyword rows for every group in parallel, aggregate, rank.
    const rowLists = await Promise.all(groups.map(g =>
      fetchGroupKeywordRows(ws, { ...g, accountId, siteId, startYmd, endYmd }).catch(() => [])
    ));
    const allRows = rowLists.flat();
    const ranked = aggregateConvertingTerms(allRows, { maxAcos: Number.isFinite(maxAcos) ? maxAcos : undefined });
    const top = ranked.slice(0, topN);
    const { bid, avgCpcClickWeighted, avgCpcSimple } = avgCpcBid(top);
    out.convertingEvidence = writeJson(
      path.join(SNAPSHOT_DIR, `sb_collection_converting_${(skus[0] || 'x').toLowerCase()}_${date}.json`),
      { builtAt: date, skus, accountId, window: `${startYmd}..${endYmd}`, groupCount: groups.length, rowCount: allRows.length, distinctConverting: ranked.length, top10: top, avgCpcClickWeighted, avgCpcSimple, bid }
    );
    if (top.length < 1) {
      out.execution = { skipped: true, reason: 'no_converting_terms_found', groupCount: groups.length, rowCount: allRows.length };
      return { out, outFile: writeJson(outFile, out) };
    }

    // 4) Brand + logo, both lifted from the existing SB that advertises these
    // ASINs (consistent + avoids the multi-brand getStore mistake). fetchBrand
    // is only a last resort if no existing SB collection carries a logo.
    const lifted = await resolveBrandAndLogo(ws, { accountId, siteId, targetAsins: products.map(p => p.asin) });
    out.logoEvidence = lifted;
    let brandEntityId = lifted.brandEntityId;
    let brandName = lifted.brandName;
    if (lifted.error || !brandEntityId || !brandName) {
      const brand = await fetchBrand(ws, { brand: args.brand, brandName: args.brandName, asin: products[0].asin, siteId, accountId });
      out.brandEvidence = { source: brand.source, brandEntityId: brand.brandEntityId, brandRegistryName: brand.brandRegistryName, error: brand.error };
      if (lifted.error || brand.error) {
        out.execution = { skipped: true, reason: lifted.error ? 'brand_logo_unresolved' : 'brand_missing', detail: lifted };
        return { out, outFile: writeJson(outFile, out) };
      }
      brandEntityId = brandEntityId || brand.brandEntityId;
      brandName = brandName || brand.brandRegistryName;
    } else {
      out.brandEvidence = { source: 'existing_sb_creative', brandEntityId, brandRegistryName: brandName, matchedByAsin: lifted.matchedByAsin };
    }
    const logo = { brandLogoAssetID: lifted.brandLogoAssetID, brandLogoCrop: lifted.brandLogoCrop };

    // 5) Assemble plan and validate via the shared builder.
    const coreTerm = top[0].kw;
    const campaignName = String(args.campaignName || options.campaignName ||
      `sb collection_${coreTerm}_${skus.map(s => s.toLowerCase()).join(' ')} top${top.length}`).slice(0, 128);
    const adGroupName = String(args.groupName || options.groupName || shortAdName(coreTerm, skus.length));
    const plan = {
      accountId,
      siteId,
      sellerNum: 'HJ17',
      brand: brandEntityId,
      brandEntityId,
      brandName,
      campaignName,
      groupName: adGroupName,
      adName: adGroupName,
      startDate: date,
      budget,
      dailyBudget: budget,
      matchType,
      defaultBid: bid,
      brandLogoAssetID: logo.brandLogoAssetID,
      brandLogoCrop: logo.brandLogoCrop,
      titleType: headlineArg ? 'CUSTOM' : 'AUTO',
      ...(headlineArg ? { headline: headlineArg } : {}),
      products,
      keywords: top.map(t => ({ keywordText: t.kw, matchType, bid })),
    };
    const built = buildSbManualCollectionKeywordPayload(plan);
    out.plan = { plan, built: { ok: built.ok, errors: built.errors, requestUrl: built.requestUrl } };
    if (!built.ok) {
      out.execution = { skipped: true, reason: 'payload_invalid', errors: built.errors };
      return { out, outFile: writeJson(outFile, out) };
    }
    if (!execute) {
      out.execution = { skipped: true, reason: 'dry-run' };
      out.ok = true;
      return { out, outFile: writeJson(outFile, out) };
    }

    // 6) Execute + independent readback (creative logo present, keywords landed).
    const response = await advRequest(ws, 'POST', built.requestUrl, built.requestBody);
    const createMeta = extractCreateMeta(response.json || response);
    const createOk = Number(response?.json?.code) === 200 && createMeta.campaignId && createMeta.adGroupId;
    const readback = createOk
      ? await readbackCreative(ws, { ...createMeta, accountId, siteId })
      : null;
    out.execution = { skipped: false, createOk, createMeta, response: response.json, readback };
    out.ok = createOk && !!readback?.brandLogoAssetID;
    return { out, outFile: writeJson(outFile, out) };
  } finally {
    try { ws.close(); } catch (_) {}
    writeJson(outFile, out);
  }
}

module.exports = {
  runSbCollectionCreateFlow,
  aggregateConvertingTerms,
  avgCpcBid,
  shortAdName,
  AUTO_BUCKET_TERMS,
};
