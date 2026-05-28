const fs = require('fs');

const POSITION_PAGE_SIZE = 48;
const FRESH_HOURS = 2;
const RECENT_HOURS = 24;

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n;|]+/).map(text).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function parsePositionRank(page, pageRow) {
  const p = num(page);
  const r = num(pageRow);
  if (!Number.isFinite(p) || !Number.isFinite(r) || p <= 0 || r <= 0) return null;
  return POSITION_PAGE_SIZE * (p - 1) + r;
}

function positionText(label, item, noResultText = '') {
  if (!item) return noResultText || `${label}无数据`;
  return `${label} P${item.page}-${item.pageRow}`;
}

function sourceLabel(value) {
  if (value === 'auto') return 'auto';
  if (value === 'plugin') return 'plugin';
  return text(value) || 'unknown';
}

function freshness(createdTime, generatedAt = new Date()) {
  if (!createdTime) return { status: 'unknown', ageHours: null };
  const created = new Date(createdTime);
  const generated = new Date(generatedAt);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(generated.getTime())) {
    return { status: 'unknown', ageHours: null };
  }
  const ageHours = (generated.getTime() - created.getTime()) / 3600000;
  if (ageHours <= FRESH_HOURS) return { status: 'fresh', ageHours: Number(ageHours.toFixed(2)) };
  if (ageHours <= RECENT_HOURS) return { status: 'recent', ageHours: Number(ageHours.toFixed(2)) };
  return { status: 'stale', ageHours: Number(ageHours.toFixed(2)) };
}

function normalizePositionItem(item = {}, generatedAt = new Date()) {
  const cateType = lower(item.cateType);
  const kind = cateType === 'sp' ? 'ad' : (cateType === 'zr' ? 'organic' : cateType || 'unknown');
  return {
    kind,
    cateType: text(item.cateType),
    searchTerm: text(item.searchTerm),
    asin: text(item.asin),
    page: text(item.page),
    pageRow: text(item.pageRow),
    rank: parsePositionRank(item.page, item.pageRow),
    timeBatch: text(item.timeBatch),
    createdTime: text(item.createdTime),
    sourceLabel: sourceLabel(item.sourceLabel),
    campaignId: text(item.campaignId),
    adGroupId: text(item.adGroupId),
    adGroupName: text(item.adGroupName),
    freshness: freshness(item.createdTime, generatedAt),
  };
}

function latestByCreatedTime(items = []) {
  const normalized = items.filter(Boolean);
  if (!normalized.length) return null;
  return normalized
    .slice()
    .sort((a, b) => {
      const at = new Date(a.createdTime || 0).getTime() || 0;
      const bt = new Date(b.createdTime || 0).getTime() || 0;
      return bt - at || text(b.timeBatch).localeCompare(text(a.timeBatch));
    })[0];
}

function normalizePlacementGroup(group = {}, generatedAt = new Date()) {
  const items = Array.isArray(group.items)
    ? group.items.map(item => normalizePositionItem(item, generatedAt))
    : [];
  const adItems = items.filter(item => item.kind === 'ad');
  const organicItems = items.filter(item => item.kind === 'organic');
  const ad = latestByCreatedTime(adItems);
  const organic = latestByCreatedTime(organicItems);
  const latest = latestByCreatedTime(items);

  return {
    hasData: items.length > 0,
    ad,
    organic,
    adItems,
    organicItems,
    items,
    trendArrow: {
      sp: text(group.trendArrow?.sp),
      zr: text(group.trendArrow?.zr),
    },
    latestTimeBatch: latest?.timeBatch || '',
    latestCreatedTime: latest?.createdTime || '',
    freshness: freshness(latest?.createdTime, generatedAt),
    adText: positionText('广告', ad, '广告前五页无结果'),
    organicText: positionText('自然', organic, items.length ? '自然前五页无结果' : '自然无数据'),
  };
}

function normalizePlacementByAsin(raw = {}, asins = [], generatedAt = new Date()) {
  const out = {};
  const asinKeys = unique([...asins, ...Object.keys(raw || {})]);
  for (const asin of asinKeys) {
    const value = raw?.[asin];
    if (value) out[asin] = normalizePlacementGroup(value, generatedAt);
  }
  return out;
}

function getNestedPlacement(rawData = {}, adGroupId, asin) {
  const group = rawData?.[adGroupId] || rawData?.[String(adGroupId)];
  if (!group) return null;
  return group?.[asin] || group?.[String(asin)] || null;
}

function normalizeMetricRow(row = {}) {
  return {
    impressions: num(row.Impressions),
    clicks: num(row.Clicks),
    spend: num(row.Spend),
    orders: num(row.Orders),
    sales: num(row.Sales),
    acos: num(row.ACOS),
    cpc: num(row.CPC),
    ctr: num(row.CTR),
    conversionRate: num(row.ConversionRate),
    topOfSearchImpressionShare: num(row.topOfSearchImpressionShare),
    orders7: num(row.Orders_7),
    orders15: num(row.Orders_15),
    orders30: num(row.Orders_30),
    spend7: num(row.Spend_7),
    spend15: num(row.Spend_15),
    spend30: num(row.Spend_30),
  };
}

function normalizeKeywordRow(row = {}, placementData = {}, asins = [], generatedAt = new Date()) {
  const placementByAsin = {};
  const rowPlacement = row.keywordsOfPlacementData || {};
  const candidateAsins = unique([
    row.asin,
    ...asins,
    ...Object.keys(rowPlacement || {}),
  ]);

  for (const asin of candidateAsins) {
    const nested = getNestedPlacement(placementData, row.adGroupId, asin) || rowPlacement?.[asin];
    if (nested) placementByAsin[asin] = normalizePlacementGroup(nested, generatedAt);
  }

  const primaryAsin = text(row.asin) || candidateAsins[0] || '';
  const primaryPlacement = primaryAsin ? placementByAsin[primaryAsin] : Object.values(placementByAsin)[0] || null;

  return {
    sku: text(row.sku),
    asin: primaryAsin,
    keywordId: text(row.keywordId),
    keywordText: text(row.keywordText || row.keyword || row.searchTerm),
    matchType: row.matchType ?? '',
    keywordPosition: num(row.keywordPosition),
    siteId: row.siteId ?? '',
    accountId: row.accountId ?? '',
    campaignId: text(row.campaignId),
    adGroupId: text(row.adGroupId),
    campaignName: text(row.campaignName),
    groupName: text(row.groupName),
    bid: num(row.bid),
    state: row.state ?? '',
    campaignState: row.campaignState ?? '',
    groupState: row.groupState ?? '',
    updatedAt: text(row.updatedAt),
    metrics: normalizeMetricRow(row),
    placementByAsin,
    placement: primaryPlacement,
    actionBoundary: 'decision_support_only',
  };
}

function normalizeTrendPoint(point = {}, generatedAt = new Date()) {
  function item(source, kind) {
    const raw = point?.[source]?.[kind];
    return raw ? normalizePositionItem({ ...raw, cateType: kind, sourceLabel: source, timeBatch: point.timeBatch }, generatedAt) : null;
  }

  return {
    timeBatch: text(point.timeBatch),
    auto: {
      ad: item('auto', 'sp'),
      organic: item('auto', 'zr'),
    },
    plugin: {
      ad: item('plugin', 'sp'),
      organic: item('plugin', 'zr'),
    },
  };
}

function normalizeTrendRows(rows = [], generatedAt = new Date()) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => normalizeTrendPoint(row, generatedAt))
    .sort((a, b) => a.timeBatch.localeCompare(b.timeBatch));
}

function trendArrowFromLatest(trendRows = [], slot) {
  const values = trendRows.map(row => slot(row)).filter(Boolean);
  if (!trendRows.length) return '';
  const latest = slot(trendRows[trendRows.length - 1]);
  const previous = values.length > 1 ? values[values.length - 2] : null;
  if (!latest && previous) return 'down';
  if (latest && !previous) return 'up';
  if (!latest || !previous) return '';
  if (latest.rank < previous.rank) return 'up';
  if (latest.rank > previous.rank) return 'down';
  return 'same';
}

function placementGroupFromTrendRows(trendRows = [], generatedAt = new Date()) {
  const normalizedTrend = trendRows?.[0]?.auto && ('ad' in trendRows[0].auto || 'organic' in trendRows[0].auto)
    ? trendRows
    : normalizeTrendRows(trendRows, generatedAt);
  if (!normalizedTrend.length) return null;
  const latestPoint = normalizedTrend[normalizedTrend.length - 1];
  const items = [
    latestPoint.auto?.ad,
    latestPoint.auto?.organic,
    latestPoint.plugin?.ad,
    latestPoint.plugin?.organic,
  ].filter(Boolean);
  const group = normalizePlacementGroup({
    items,
    trendArrow: {
      sp: trendArrowFromLatest(normalizedTrend, row => row.auto?.ad || row.plugin?.ad),
      zr: trendArrowFromLatest(normalizedTrend, row => row.auto?.organic || row.plugin?.organic),
    },
  }, generatedAt);
  group.source = 'trend_latest';
  return group;
}

function inferAsinsFromSnapshot(snapshot = {}, sku = '') {
  const targetSku = lower(sku);
  if (!targetSku) return [];
  const found = [];
  const queue = [snapshot];
  const seen = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (!item || seen.has(item)) continue;
    if (typeof item === 'object') seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) queue.push(child);
      continue;
    }
    if (typeof item !== 'object') continue;
    if (lower(item.sku) === targetSku && item.asin) found.push(item.asin);
    for (const child of Object.values(item)) {
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return unique(found);
}

function readAsinsFromSnapshot(snapshotFile, sku) {
  if (!snapshotFile || !fs.existsSync(snapshotFile)) return [];
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  return inferAsinsFromSnapshot(snapshot, sku);
}

function buildKeywordPlacementReport({
  generatedAt = new Date().toISOString(),
  request = {},
  keywordRows = [],
  placementData = {},
  trendByKey = {},
  asins = [],
  warnings = [],
} = {}) {
  const normalizedRows = keywordRows.map(row => {
    const normalized = normalizeKeywordRow(row, placementData, asins, generatedAt);
    const trendKey = `${normalized.adGroupId}::${normalized.asin}::${lower(normalized.keywordText)}`;
    if (trendByKey[trendKey]) {
      normalized.trend = normalizeTrendRows(trendByKey[trendKey], generatedAt);
      if (!normalized.placement?.hasData) {
        const placementFromTrend = placementGroupFromTrendRows(normalized.trend, generatedAt);
        if (placementFromTrend) {
          normalized.placement = placementFromTrend;
          if (normalized.asin) normalized.placementByAsin[normalized.asin] = placementFromTrend;
        }
      }
    }
    return normalized;
  });

  const rowsWithPlacement = normalizedRows.filter(row => row.placement?.hasData).length;
  const staleRows = normalizedRows.filter(row => row.placement?.freshness?.status === 'stale').length;

  return {
    exportedAt: generatedAt,
    source: {
      keywordRows: '/keyword/findAllNew',
      placement: '/keyword/getKeywordsOfPlacementByAdGroups',
      trend: '/keyword/getKeywordsOfPlacementTrend',
    },
    request,
    coverage: {
      keywordRowCount: keywordRows.length,
      normalizedRowCount: normalizedRows.length,
      placementEligibleRowCount: normalizedRows.filter(row => row.keywordPosition === 1).length,
      rowsWithPlacement,
      staleRows,
      readyForDecisionSupport: normalizedRows.length > 0,
      readyForAutoAction: false,
    },
    rows: normalizedRows,
    warnings,
  };
}

module.exports = {
  FRESH_HOURS,
  RECENT_HOURS,
  buildKeywordPlacementReport,
  freshness,
  inferAsinsFromSnapshot,
  normalizeKeywordRow,
  normalizePlacementByAsin,
  normalizePlacementGroup,
  normalizePositionItem,
  normalizeTrendRows,
  placementGroupFromTrendRows,
  parsePositionRank,
  readAsinsFromSnapshot,
  splitList,
};
