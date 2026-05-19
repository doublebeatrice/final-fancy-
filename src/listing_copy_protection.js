const fs = require('fs');

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeProtectedListingSkus(value = []) {
  if (value instanceof Map) return value;
  const rows = Array.isArray(value) ? value : (Array.isArray(value.skus) ? value.skus : []);
  const map = new Map();
  for (const row of rows) {
    const sku = text(typeof row === 'string' ? row : row.sku).toUpperCase();
    if (!sku) continue;
    map.set(sku, {
      sku,
      scope: text(row.scope || 'listing'),
      reason: text(row.reason || 'preserve existing product page; do not change listing copy'),
      source: text(row.source || 'operator_instruction'),
    });
  }
  return map;
}

function isReservedPageStatus(value = '') {
  return /保留页面|reserved\s*page/i.test(text(value));
}

function cardForSku(snapshot = {}, sku = '') {
  const key = text(sku).toUpperCase();
  if (!key) return {};
  const card = (snapshot.productCards || []).find(item => text(item.sku).toUpperCase() === key) || {};
  const inv = snapshot.invMap?.[key] || snapshot.invMap?.[text(sku)] || {};
  return { ...inv, ...card };
}

function listingProtectionForCard(card = {}) {
  if (card.reserved === true) {
    return {
      sku: text(card.sku).toUpperCase(),
      scope: 'listing',
      reason: 'reserved page product; preserve current product page and do not change listing copy',
      source: 'reservedFlag',
    };
  }
  const saleStatus = text(card.saleStatus || card.sale_status || card.upload_sale_status);
  if (isReservedPageStatus(saleStatus)) {
    return {
      sku: text(card.sku).toUpperCase(),
      scope: 'listing',
      reason: 'saleStatus is reserved page; preserve current product page and do not change listing copy',
      source: 'saleStatus',
    };
  }
  return null;
}

function listingProtectionForSku(sku = '', protectedListingSkus = [], snapshot = {}) {
  const map = protectedListingSkus instanceof Map
    ? protectedListingSkus
    : normalizeProtectedListingSkus(protectedListingSkus);
  return listingProtectionForCard(cardForSku(snapshot, sku)) || map.get(text(sku).toUpperCase()) || null;
}

function loadProtectedListingSkus(file = '') {
  if (!file || !fs.existsSync(file)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  return normalizeProtectedListingSkus(parsed);
}

module.exports = {
  listingProtectionForSku,
  listingProtectionForCard,
  loadProtectedListingSkus,
  normalizeProtectedListingSkus,
  isReservedPageStatus,
};
