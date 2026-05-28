function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function firstValue(row, names) {
  for (const name of names) {
    const value = row?.[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function buildAmazonAssetListPayload(input = {}) {
  const accountId = Number(input.accountId);
  const siteId = Number(input.siteId || 4);
  const assetType = String(input.assetType || 'VIDEO').trim().toUpperCase();
  const name = String(input.name || input.assetName || input.search || '').replace(/\s+/g, ' ').trim();
  const brandEntityId = String(input.brandEntityId || input.brand || '').trim();
  const brandRegistryName = String(input.brandRegistryName || input.brandName || '').trim();
  const page = toPositiveInt(input.page || 1, 1);
  const limit = toPositiveInt(input.limit || 20, 20);
  const field = String(input.field || 'createdAt').trim();
  const order = String(input.order || 'desc').trim().toLowerCase();
  const errors = [];

  if (!Number.isFinite(accountId) || accountId <= 0) errors.push('accountId must be positive');
  if (!Number.isFinite(siteId) || siteId <= 0) errors.push('siteId must be positive');
  if (assetType !== 'VIDEO') errors.push('assetType must be VIDEO for SBV');
  if (!brandEntityId) errors.push('brandEntityId is required');
  if (!brandRegistryName) errors.push('brandRegistryName is required');
  if (!field) errors.push('field is required');
  if (!['asc', 'desc'].includes(order)) errors.push('order must be asc or desc');

  const requestUrl = '/amazonAsset/getAssetList';
  const requestBody = {
    accountId,
    siteId,
    assetType,
    ...(name ? { name } : {}),
    brandEntityId,
    brandRegistryName,
    page,
    limit,
    field,
    order,
  };

  return {
    ok: errors.length === 0,
    errors,
    requestUrl,
    requestBody,
  };
}

function getAmazonAssetRows(json = {}) {
  const candidates = [
    json?.data?.records,
    json?.data?.data,
    json?.data?.list,
    json?.data?.rows,
    json?.records,
    json?.list,
    json?.rows,
    json?.data,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }
  return [];
}

function normalizeAmazonAsset(row = {}) {
  const assetId = String(firstValue(row, [
    'assetId',
    'asset_id',
    'amazonAssetId',
    'amazon_asset_id',
    'assetLibraryId',
    'asset_library_id',
    'id',
  ])).trim();
  const name = String(firstValue(row, [
    'name',
    'assetName',
    'asset_name',
    'fileName',
    'file_name',
    'originalFileName',
    'original_file_name',
    'title',
  ])).trim();
  const status = String(firstValue(row, ['status', 'state', 'reviewStatus', 'approvalStatus'])).trim();
  const createdAt = String(firstValue(row, ['createdAt', 'created_at', 'createTime', 'create_time'])).trim();
  const thumbnailUrl = String(firstValue(row, ['thumbnailUrl', 'thumbnail_url', 'coverUrl', 'cover_url', 'previewImageUrl'])).trim();
  const previewUrl = String(firstValue(row, ['previewUrl', 'preview_url', 'videoPreviewUrl', 'assetUrl', 'url'])).trim();
  const brandEntityId = String(firstValue(row, ['brandEntityId', 'brand_entity_id', 'brand'])).trim();
  const brandRegistryName = String(firstValue(row, ['brandRegistryName', 'brand_registry_name', 'brandName'])).trim();
  const associatedAsins = associatedAsinsForAsset(row);

  return {
    assetId,
    name,
    status,
    createdAt,
    thumbnailUrl,
    previewUrl,
    brandEntityId,
    brandRegistryName,
    associatedAsins,
    raw: row,
  };
}

function normalizeAmazonAssets(rows = []) {
  return (rows || []).map(normalizeAmazonAsset).filter(row => row.assetId);
}

function findAmazonAssetById(rows = [], assetId = '') {
  const wanted = String(assetId || '').trim();
  if (!wanted) return null;
  return normalizeAmazonAssets(rows).find(row => row.assetId === wanted) || null;
}

function associatedAsinsForAsset(row = {}) {
  const direct = firstValue(row, ['asin', 'ASIN', 'asins', 'asinArray', 'associatedAsins']);
  if (Array.isArray(direct)) return direct.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
  if (direct) return String(direct).split(/[,;\s]+/).map(item => item.trim().toUpperCase()).filter(Boolean);

  const raw = row.associatedContexts || row.associated_contexts || row.contexts || '';
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const asinRows = Array.isArray(parsed?.ASIN) ? parsed.ASIN : [];
    return asinRows
      .map(item => String(item?.id || item?.asin || item?.name || '').trim().toUpperCase())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function findAmazonAssetByAsin(rows = [], asin = '') {
  const wanted = String(asin || '').trim().toUpperCase();
  if (!wanted) return null;
  return normalizeAmazonAssets(rows).find(row => (row.associatedAsins || []).includes(wanted)) || null;
}

module.exports = {
  associatedAsinsForAsset,
  buildAmazonAssetListPayload,
  findAmazonAssetByAsin,
  findAmazonAssetById,
  getAmazonAssetRows,
  normalizeAmazonAsset,
  normalizeAmazonAssets,
};
