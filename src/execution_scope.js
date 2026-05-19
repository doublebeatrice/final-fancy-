const fs = require('fs');
const path = require('path');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSku(value) {
  return normalizeText(value).toUpperCase();
}

function readJson(file, fallback) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function rawPlanItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.plan)) return raw.plan;
  return [];
}

function addIfSet(set, value) {
  const text = normalizeText(value);
  if (text) set.add(text);
}

function extractActionSchemaScope(actionSchemaFile) {
  const raw = readJson(actionSchemaFile, []);
  const skus = new Set();
  const entityIds = new Set();
  const campaignIds = new Set();
  const adGroupIds = new Set();

  for (const item of rawPlanItems(raw)) {
    addIfSet(skus, item?.sku);
    for (const action of item?.actions || []) {
      addIfSet(entityIds, action.id);
      addIfSet(entityIds, action.keywordId);
      addIfSet(entityIds, action.targetId);
      addIfSet(entityIds, action.adId);
      addIfSet(campaignIds, action.campaignId);
      if (String(action.entityType || '') === 'campaign') addIfSet(campaignIds, action.id);
      addIfSet(adGroupIds, action.adGroupId);
    }
  }

  return {
    skus: [...skus].filter(Boolean),
    skuSet: new Set([...skus].map(normalizeSku).filter(Boolean)),
    entityIds,
    campaignIds,
    adGroupIds,
    actionCount: rawPlanItems(raw).reduce((sum, item) => sum + ((item?.actions || []).length), 0),
    schemaFile: actionSchemaFile ? path.resolve(actionSchemaFile) : '',
  };
}

function shouldUseFastActionScope(options = {}) {
  if (options.fastScope === false) return false;
  if (options.fastScope === true) return !!options.actionSchemaFile;
  if (process.env.AD_OPS_FULL_ACTION_SCOPE === '1') return false;
  if (process.env.AD_OPS_FAST_ACTION_SCOPE === '1') return !!options.actionSchemaFile;
  const basename = `${path.basename(options.actionSchemaFile || '')} ${path.basename(options.snapshotFile || '')}`.toLowerCase();
  return !!options.actionSchemaFile && /\bdevreq\b|developer|\u5f00\u53d1|\u8bc9\u6c42/.test(basename);
}

function rowId(row = {}) {
  return normalizeText(row.keywordId || row.targetId || row.target_id || row.adId || row.ad_id || row.id || row.keyword_id);
}

function campaignId(row = {}) {
  return normalizeText(row.campaignId || row.campaign_id || row.id);
}

function adGroupId(row = {}) {
  return normalizeText(row.adGroupId || row.ad_group_id);
}

function rowMatchesScope(row = {}, scope) {
  const sku = normalizeSku(row.sku);
  if (sku && scope.skuSet.has(sku)) return true;
  const id = rowId(row);
  if (id && scope.entityIds.has(id)) return true;
  const cId = campaignId(row);
  if (cId && scope.campaignIds.has(cId)) return true;
  const gId = adGroupId(row);
  if (gId && scope.adGroupIds.has(gId)) return true;
  return false;
}

function filterRows(rows, scope) {
  return (rows || []).filter(row => rowMatchesScope(row, scope));
}

function scopedMetaFromRows(meta = {}, rows = []) {
  const sample = rows[0] || null;
  return {
    ...meta,
    count: rows.length,
    sampleKeys: sample ? Object.keys(sample).sort() : [],
    sample: sample || {},
  };
}

function filterSevenDayMeta(meta = {}, spRows = [], sbRows = []) {
  if (!meta || typeof meta !== 'object') return meta;
  const filtered = { ...meta };
  if (meta.sp) filtered.sp = scopedMetaFromRows(meta.sp, spRows);
  if (meta.sb) filtered.sb = scopedMetaFromRows(meta.sb, sbRows);
  return filtered;
}

function filterInvMap(invMap = {}, scope) {
  return Object.fromEntries(Object.entries(invMap || {}).filter(([key, value]) => {
    const keySku = normalizeSku(key);
    const valueSku = normalizeSku(value?.sku);
    return scope.skuSet.has(keySku) || scope.skuSet.has(valueSku);
  }));
}

function filterSnapshotForActionSchema(snapshot = {}, options = {}) {
  if (!shouldUseFastActionScope(options)) return snapshot;
  const scope = extractActionSchemaScope(options.actionSchemaFile);
  if (!scope.skus.length) return snapshot;
  const sp7DayUntouchedRows = filterRows(snapshot.sp7DayUntouchedRows, scope);
  const sb7DayUntouchedRows = filterRows(snapshot.sb7DayUntouchedRows, scope);

  const filtered = {
    ...snapshot,
    productCards: (snapshot.productCards || []).filter(card => scope.skuSet.has(normalizeSku(card?.sku))),
    kwRows: filterRows(snapshot.kwRows, scope),
    autoRows: filterRows(snapshot.autoRows, scope),
    targetRows: filterRows(snapshot.targetRows, scope),
    productAdRows: filterRows(snapshot.productAdRows, scope),
    sbRows: filterRows(snapshot.sbRows, scope),
    sbCampaignRows: filterRows(snapshot.sbCampaignRows, scope),
    overBudgetRows: filterRows(snapshot.overBudgetRows, scope),
    sp7DayUntouchedRows,
    sb7DayUntouchedRows,
    sevenDayUntouchedMeta: filterSevenDayMeta(snapshot.sevenDayUntouchedMeta, sp7DayUntouchedRows, sb7DayUntouchedRows),
    lowEfficiencyRows: snapshot.lowEfficiencyRows && typeof snapshot.lowEfficiencyRows === 'object'
      ? Object.fromEntries(Object.entries(snapshot.lowEfficiencyRows).map(([key, rows]) => [key, filterRows(rows, scope)]))
      : snapshot.lowEfficiencyRows,
    inventoryScopeRows: (snapshot.inventoryScopeRows || []).filter(row => scope.skuSet.has(normalizeSku(row?.sku))),
    invMap: filterInvMap(snapshot.invMap || {}, scope),
    productChartMap: filterInvMap(snapshot.productChartMap || {}, scope),
    salesHistoryMap: filterInvMap(snapshot.salesHistoryMap || {}, scope),
  };

  filtered.__fastActionScope = {
    enabled: true,
    schemaSkuCount: scope.skus.length,
    retainedProductCards: filtered.productCards.length,
    originalProductCards: (snapshot.productCards || []).length,
  };
  return filtered;
}

module.exports = {
  extractActionSchemaScope,
  filterSnapshotForActionSchema,
  shouldUseFastActionScope,
};
