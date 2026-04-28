const ALLOWED_OPERATION_SITES = ['Amazon.com', 'Amazon.co.uk'];
const ALLOWED_OPERATION_SALE_STATUS = ['正常销售', '保留页面'];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSku(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeInventoryScopeRow(row = {}) {
  return {
    sku: normalizeText(row.sku || row.SKU || row.Sku || row.raw_sku || row.product_sku || row.rawSku || ''),
    asin: normalizeText(row.asin || row.ASIN || ''),
    aid: row.aid || row.id || row.AID || row.product_id || '',
    salesChannel: normalizeText(row.salesChannel || row.sales_channel || ''),
    saleStatus: normalizeText(row.sale_status || row.saleStatus || ''),
    fuldate: normalizeText(row.fuldate || ''),
    opendate: normalizeText(row.opendate || ''),
  };
}

function isOpenedProduct(row = {}) {
  return !!(normalizeText(row.fuldate) || normalizeText(row.opendate));
}

function isRowInAllowedOperationScope(row = {}) {
  return ALLOWED_OPERATION_SITES.includes(normalizeText(row.salesChannel))
    && ALLOWED_OPERATION_SALE_STATUS.includes(normalizeText(row.saleStatus))
    && isOpenedProduct(row);
}

function summarizeDistribution(rows, field) {
  return Object.entries((rows || []).reduce((acc, row) => {
    const key = normalizeText(row?.[field]) || '(empty)';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
}

function extractInventoryScopeRows(snapshot = {}) {
  const sourceRows = Array.isArray(snapshot.inventoryScopeRows) && snapshot.inventoryScopeRows.length
    ? snapshot.inventoryScopeRows
    : Object.values(snapshot.invMap || {}).map(row => ({
        sku: row.sku,
        asin: row.asin,
        salesChannel: row.salesChannel,
        saleStatus: row.saleStatus || '',
        fuldate: row.fuldate || '',
        opendate: row.opendate || '',
      }));
  return sourceRows.map(normalizeInventoryScopeRow).filter(row => row.sku);
}

function analyzeAllowedOperationScope(snapshot = {}) {
  const inventoryScopeRows = extractInventoryScopeRows(snapshot);
  const allowedRows = inventoryScopeRows.filter(isRowInAllowedOperationScope);
  const bySku = new Map();
  for (const row of allowedRows) {
    const skuKey = normalizeSku(row.sku);
    if (!bySku.has(skuKey)) bySku.set(skuKey, []);
    bySku.get(skuKey).push(row);
  }
  const duplicateSkus = [...bySku.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([sku, rows]) => ({ sku, rows }));
  const allowedSkuSet = new Set([...bySku.keys()]);
  return {
    inventoryScopeRows,
    allowedRows,
    allowedSkuSet,
    allowedSkuList: [...allowedSkuSet],
    summary: {
      totalProductCards: (snapshot.productCards || []).length,
      inventoryScopeRowCount: inventoryScopeRows.length,
      allowedScopeRowCount: allowedRows.length,
      allowedScopeSkuCount: allowedSkuSet.size,
      duplicateScopeSkuCount: duplicateSkus.length,
      salesChannelDistribution: summarizeDistribution(inventoryScopeRows, 'salesChannel'),
      saleStatusDistribution: summarizeDistribution(inventoryScopeRows, 'saleStatus'),
      openedDistribution: [
        ['opened', inventoryScopeRows.filter(isOpenedProduct).length],
        ['not_opened', inventoryScopeRows.filter(row => !isOpenedProduct(row)).length],
      ],
      duplicateScopeSkus: duplicateSkus,
      source: Array.isArray(snapshot.inventoryScopeRows) && snapshot.inventoryScopeRows.length
        ? 'inventoryScopeRows'
        : 'invMap_fallback',
    },
  };
}

function uniqueSchemaSkus(decision = {}) {
  const rawPlan = decision.rawPlan;
  if (Array.isArray(rawPlan)) {
    return [...new Set(rawPlan.map(item => normalizeText(item?.sku)).filter(Boolean))];
  }
  if (rawPlan && Array.isArray(rawPlan.plan)) {
    return [...new Set(rawPlan.plan.map(item => normalizeText(item?.sku)).filter(Boolean))];
  }

  const values = new Set();
  const pushSku = value => {
    const sku = normalizeText(value);
    if (sku) values.add(sku);
  };
  for (const item of decision.plan || []) pushSku(item?.sku);
  for (const item of decision.review || []) pushSku(item?.sku);
  for (const item of decision.skipped || []) pushSku(item?.sku);
  for (const item of decision.errors || []) pushSku(item?.sku);
  return [...values];
}

function applyAllowedOperationScope(decision = {}, scopeAnalysis) {
  const allowedSkuSet = scopeAnalysis?.allowedSkuSet || new Set();
  const schemaSkuSet = new Set(uniqueSchemaSkus(decision).map(normalizeText));
  const outOfScope = [];
  const recordOutOfScope = (sku, source, payload = {}) => {
    const normalizedSku = normalizeText(sku);
    if (!normalizedSku) return;
    outOfScope.push({ sku: normalizedSku, source, ...payload });
  };

  const scopedPlan = [];
  for (const item of decision.plan || []) {
    const sku = normalizeText(item.sku);
    const isSchemaSku = schemaSkuSet.has(sku);
    if (!isSchemaSku && !(item.actions || []).length) {
      scopedPlan.push(item);
      continue;
    }
    if (!allowedSkuSet.has(normalizeSku(item.sku))) {
      recordOutOfScope(sku, 'plan', {
        actionCount: (item.actions || []).length,
        reason: 'out_of_scope',
      });
      continue;
    }
    scopedPlan.push(item);
  }

  const scopedReview = [];
  for (const item of decision.review || []) {
    if (!allowedSkuSet.has(normalizeSku(item.sku))) {
      recordOutOfScope(item.sku, 'review', {
        actionId: item.action?.id || '',
        reason: 'out_of_scope',
      });
      continue;
    }
    scopedReview.push(item);
  }

  const scopedSkipped = [];
  for (const item of decision.skipped || []) {
    if (!allowedSkuSet.has(normalizeSku(item.sku))) {
      recordOutOfScope(item.sku, 'skipped', {
        actionId: item.action?.id || '',
        reason: 'out_of_scope',
      });
      continue;
    }
    scopedSkipped.push(item);
  }

  const scopedErrors = [];
  for (const item of decision.errors || []) {
    if (item?.sku && !allowedSkuSet.has(normalizeSku(item.sku))) {
      recordOutOfScope(item.sku, 'error', {
        actionId: item.id || '',
        reason: item.reason || 'out_of_scope',
      });
      continue;
    }
    scopedErrors.push(item);
  }

  const outOfScopeSkuList = [...new Set(outOfScope.map(item => item.sku))];
  return {
    ...decision,
    plan: scopedPlan,
    review: scopedReview,
    skipped: scopedSkipped,
    errors: scopedErrors,
    scope: {
      ...(scopeAnalysis?.summary || {}),
      schemaSkuCount: uniqueSchemaSkus(decision).length,
      outOfScopeSkus: outOfScopeSkuList.length,
      outOfScopeSkuList,
      outOfScope,
      reviewSkus: [...new Set(scopedReview.map(item => item.sku))].length,
      plannedSkus: scopedPlan.filter(item => (item.actions || []).length > 0).length,
      executableSkus: scopedPlan.filter(item => (item.actions || []).some(action => action.canAutoExecute !== false)).length,
    },
  };
}

module.exports = {
  ALLOWED_OPERATION_SITES,
  ALLOWED_OPERATION_SALE_STATUS,
  normalizeInventoryScopeRow,
  isOpenedProduct,
  isRowInAllowedOperationScope,
  analyzeAllowedOperationScope,
  applyAllowedOperationScope,
  uniqueSchemaSkus,
};
