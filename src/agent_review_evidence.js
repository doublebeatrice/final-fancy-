const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, fallback = 0) {
  const n = num(value, fallback);
  if (!n) return n;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function firstNumber(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return num(row[key]);
  }
  return 0;
}

function rowSku(row = {}) {
  return text(row.sku || row.SKU || row.localSku || row.itemSku).toUpperCase();
}

function normalizeMetricRow(row = {}) {
  const spend = firstNumber(row, ['spend', 'cost', 'advCost', 'adCost', '广告花费', '花费']);
  const orders = firstNumber(row, ['orders', 'orderCount', 'advOrders', 'adOrders', '广告订单', '订单']);
  const sales = firstNumber(row, ['sales', 'advSales', 'adSales', 'orderSales', '广告销售额', '销售额']);
  const acosRaw = firstNumber(row, ['acos', 'ACOS', 'advAcos']);
  const acos = acosRaw > 1 ? acosRaw / 100 : (acosRaw || (sales > 0 ? spend / sales : 0));
  return {
    sku: rowSku(row),
    spend,
    orders,
    sales,
    acos,
    clicks: firstNumber(row, ['clicks', 'click', '广告点击', '点击']),
    impressions: firstNumber(row, ['impressions', 'impression', '广告曝光', '曝光']),
  };
}

function normalizeAdSkuSummaryReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeMetricRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || '/product/adSkuSummary',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function normalizeInventoryRow(row = {}) {
  const fulfillable = firstNumber(row, ['fulfillable', 'fulFillable', 'ful', 'stockFul', 'FBA可售', '可售']);
  const reserved = firstNumber(row, ['reserved', 'reservedQty', 'res', 'stockRes', '预留']);
  const inbound = firstNumber(row, ['inbound', 'inboundQty', 'inb', 'stockInb', 'inbAndAll', 'inb_and_all', '在途']);
  const explicitTotal = firstNumber(row, ['totalInventory', 'inventoryQuantity', 'absoluteInventory', 'stockTotal', '总库存']);
  const totalInventory = explicitTotal || fulfillable + reserved + inbound;
  return {
    sku: rowSku(row),
    fulfillable,
    reserved,
    inbound,
    fulRes: fulfillable + reserved,
    totalInventory,
    sellableDays: firstNumber(row, ['sellableDays', 'inventoryDays', 'invDays', 'sellableDays7d', 'sellableDays_7d', '库存天数', '可售天数']),
    units7d: firstNumber(row, ['units7d', 'unitsSold_7d', 'sales7d', '7d销量', '近7天销量']),
    units30d: firstNumber(row, ['units30d', 'unitsSold_30d', 'sales30d', '30d销量', '近30天销量']),
  };
}

function normalizeInventoryReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeInventoryRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'inventory',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function normalizeProfitRow(row = {}) {
  return {
    sku: rowSku(row),
    profitRate: pct(firstNumber(row, ['profitRate', 'profit_rate', 'profit', 'profit_raw', 'net_profit', 'netProfitRate', '净利率', '利润率'])),
    grossProfitRate: pct(firstNumber(row, ['grossProfitRate', 'gross_profit_rate', 'grossProfit', '毛利率'])),
    netProfit: firstNumber(row, ['netProfit', 'net_profit_amount', 'profitAmount', 'profit_value', '净利润']),
    price: firstNumber(row, ['price', 'salePrice', 'currentPrice', '售价']),
    refundRate: pct(firstNumber(row, ['refundRate', 'refund_rate', 'refund_percent', '退货率'])),
  };
}

function normalizeProfitReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const bySku = {};
  for (const row of rows) {
    const normalized = normalizeProfitRow(row);
    if (!normalized.sku) continue;
    bySku[normalized.sku] = normalized;
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'profit',
    exportedAt: report.exportedAt || '',
    rowCount: Object.keys(bySku).length,
    rows: bySku,
    rawStatus: report.status,
  };
}

function termKey(value) {
  return text(value).toLowerCase();
}

function normalizeKeywordConversionReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const keyword = termKey(row.keyword || row.searchTerm || row.term);
    if (!keyword) continue;
    byTerm[keyword] = {
      keyword,
      marketQuality: text(row.marketQuality || row.quality),
      costRisk: text(row.costRisk),
      recommendedUse: text(row.recommendedUse),
      searchVolume: num(row.searchVolume),
      purchaseVolume: num(row.purchaseVolume),
      clickPurchaseRatio: num(row.clickPurchaseRatio),
      cpcMedian: num(row.cpcMedian),
      cpaMedian: num(row.cpaMedian),
      acosMedian: num(row.acosMedian),
    };
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_keyword_conversion_rate',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeAbaSearchTermReport(report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const byTerm = {};
  for (const row of rows) {
    const searchTerm = termKey(row.searchTerm || row.search_term || row.keyword || row.term);
    if (!searchTerm) continue;
    byTerm[searchTerm] = {
      searchTerm,
      demandTier: text(row.demandTier),
      competitionTier: text(row.competitionTier),
      recommendedUse: text(row.recommendedUse),
      rank: num(row.rank),
      searchVolume: num(row.searchVolume || row.search_volume),
      estimatedOrders: num(row.estimatedOrders || row.orders),
      totalClickShare: num(row.totalClickShare || row.total_click_share),
      totalConversionShare: num(row.totalConversionShare || row.total_conversion_share),
      topAsinCount: Array.isArray(row.topAsins) ? row.topAsins.length : num(row.topAsinCount),
    };
  }
  return {
    ok: report.ok !== false,
    source: report.source || 'selection_aba_search_terms',
    exportedAt: report.generatedAt || report.exportedAt || '',
    rowCount: Object.keys(byTerm).length,
    rows: byTerm,
    coverage: report.coverage || {},
    operatorSummary: report.operatorSummary || {},
  };
}

function normalizeSelectionMarketReport(report = {}) {
  return {
    keywordConversion: normalizeKeywordConversionReport(
      report.keywordConversion || report.keywordConversionReport || report.conversion || {}
    ),
    abaSearchTerms: normalizeAbaSearchTermReport(
      report.abaSearchTerms || report.abaSearchTermReport || report.aba || {}
    ),
  };
}

function taskSubjectKey(task = {}) {
  const subject = task.subject || {};
  return text(subject.sku || subject.asin || subject.keyword || subject.entityId || task.taskId).toUpperCase();
}

function reviewSubjectKeys(queue = {}) {
  const due = queue.due || queue.tasks || [];
  return [...new Set(due.map(taskSubjectKey).filter(Boolean))];
}

function baselineForTask(task = {}) {
  return task.reviewPlan?.baseline || task.baseline || task.reviewBaseline || null;
}

function requestedMetrics(task = {}) {
  return (task.reviewPlan?.metrics || []).map(item => text(item).toLowerCase());
}

function marketTermsForTask(task = {}) {
  const values = [
    ...(Array.isArray(task.reviewPlan?.marketTerms) ? task.reviewPlan.marketTerms : []),
    ...(Array.isArray(task.marketTerms) ? task.marketTerms : []),
    task.subject?.keyword,
  ];
  return [...new Set(values.map(termKey).filter(Boolean))];
}

function normalizeReportMap(reports = {}, normalizeFn = value => value) {
  if (!reports || typeof reports !== 'object') return {};
  if (Array.isArray(reports.rows)) {
    const normalized = normalizeFn(reports);
    const mapped = {};
    for (const key of Object.keys(normalized.rows || {})) mapped[key] = normalized;
    return mapped;
  }

  const normalizedReports = {};
  for (const [key, report] of Object.entries(reports || {})) {
    const normalized = normalizeFn(report);
    const explicitKey = text(key).toUpperCase();
    if (explicitKey) normalizedReports[explicitKey] = normalized;
    for (const rowKey of Object.keys(normalized.rows || {})) normalizedReports[rowKey] = normalized;
  }
  return normalizedReports;
}

function sourceEntry(report = {}, fallbackSource = '') {
  return {
    source: report.source || fallbackSource,
    ok: report.ok === true,
    exportedAt: report.exportedAt || '',
  };
}

function marketEvidenceForTask(task = {}, selection = {}) {
  const terms = marketTermsForTask(task);
  if (!terms.length) return null;
  const keywordConversion = selection.keywordConversion || {};
  const abaSearchTerms = selection.abaSearchTerms || {};
  const rows = terms.map(term => ({
    term,
    keywordConversion: keywordConversion.rows?.[term] || null,
    abaSearchTerm: abaSearchTerms.rows?.[term] || null,
  }));
  return {
    terms: rows,
    coverage: {
      requested: terms.length,
      keywordConversionMatched: rows.filter(row => row.keywordConversion).length,
      abaMatched: rows.filter(row => row.abaSearchTerm).length,
    },
    readyForDecisionSupport: rows.some(row => row.keywordConversion || row.abaSearchTerm),
    readyForAutoAction: false,
  };
}

function marketRiskSignals(market = null) {
  if (!market) return [];
  const signals = [];
  if (market.coverage?.requested > 0 && !market.readyForDecisionSupport) signals.push('market_evidence_missing');
  for (const row of market.terms || []) {
    const conversion = row.keywordConversion || {};
    const aba = row.abaSearchTerm || {};
    if (['weak', 'no_conversion_proof'].includes(conversion.marketQuality)) signals.push('market_conversion_weak');
    if (conversion.costRisk === 'high') signals.push('market_cost_high');
    if (aba.demandTier === 'low') signals.push('market_demand_low');
    if (aba.competitionTier === 'high') signals.push('market_competition_high');
  }
  return signals;
}

function riskSignalsForEvidence(current = null, inventory = null, profit = null, market = null) {
  const signals = [];
  if (inventory) {
    const sellableDays = num(inventory.sellableDays, null);
    if (sellableDays !== null && sellableDays > 0 && sellableDays < 21) signals.push('inventory_tight');
    if (sellableDays !== null && sellableDays >= 120) signals.push('stale_inventory_pressure');
  }
  if (profit) {
    const profitRate = num(profit.profitRate, null);
    if (profitRate !== null && profitRate < 0) signals.push('profit_negative');
    if (current && profitRate !== null && profitRate > 0 && num(current.acos, 0) > profitRate) {
      signals.push('acos_above_profit_rate');
    }
  }
  signals.push(...marketRiskSignals(market));
  return [...new Set(signals)];
}

function buildReviewEvidence({ queue = {}, adReports = {}, inventoryReports = {}, profitReports = {}, selectionReports = {} } = {}) {
  const due = queue.due || queue.tasks || [];
  const normalizedAdReports = normalizeReportMap(adReports, normalizeAdSkuSummaryReport);
  const normalizedInventoryReports = normalizeReportMap(inventoryReports, normalizeInventoryReport);
  const normalizedProfitReports = normalizeReportMap(profitReports, normalizeProfitReport);
  const normalizedSelectionReports = normalizeSelectionMarketReport(selectionReports);
  const evidence = {};
  for (const task of due) {
    const key = taskSubjectKey(task);
    if (!key) continue;
    const adReport = normalizedAdReports[key] || {};
    const inventoryReport = normalizedInventoryReports[key] || {};
    const profitReport = normalizedProfitReports[key] || {};
    const current = adReport.rows?.[key] || null;
    const inventory = inventoryReport.rows?.[key] || null;
    const profit = profitReport.rows?.[key] || null;
    const market = marketEvidenceForTask(task, normalizedSelectionReports);
    const baseline = baselineForTask(task);
    const metrics = requestedMetrics(task);
    const warnings = [];
    if (!baseline) warnings.push('missing_baseline_metrics');
    if (!current) warnings.push('missing_current_ad_sku_summary');
    if (metrics.includes('inventory') && !inventory) warnings.push('missing_current_inventory_metrics');
    if (metrics.includes('profit') && !profit) warnings.push('missing_current_profit_metrics');
    if ((metrics.includes('market') || metrics.includes('selection')) && !market?.readyForDecisionSupport) warnings.push('missing_current_selection_market');
    const riskSignals = riskSignalsForEvidence(current, inventory, profit, market);
    evidence[key] = {
      baseline,
      current,
      inventory,
      profit,
      market,
      riskSignals,
      warnings,
      taskId: task.taskId || '',
      sources: [
        sourceEntry(adReport, '/product/adSkuSummary'),
        ...(inventory ? [sourceEntry(inventoryReport, 'inventory')] : []),
        ...(profit ? [sourceEntry(profitReport, 'profit')] : []),
        ...(market?.coverage?.keywordConversionMatched ? [sourceEntry(normalizedSelectionReports.keywordConversion, 'selection_keyword_conversion_rate')] : []),
        ...(market?.coverage?.abaMatched ? [sourceEntry(normalizedSelectionReports.abaSearchTerms, 'selection_aba_search_terms')] : []),
      ],
    };
  }
  return evidence;
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function collectAdSkuReviewEvidence(options = {}) {
  const queue = options.queue || readJson(options.queueFile, {});
  const today = dateOnly(options.today || new Date().toISOString());
  const day = Number(options.day || 7);
  const siteId = Number(options.siteId || 4);
  const outDir = options.outDir || path.join(ROOT, 'data', 'agent', 'review_evidence_sources', today);
  const execFileSync = options.execFileSync || defaultExecFileSync;
  const script = path.join(ROOT, 'scripts', 'execute', 'fetch_ad_sku_summary.js');
  const adReports = {};
  const errors = [];

  for (const key of reviewSubjectKeys(queue)) {
    const reportFile = path.join(outDir, `ad_sku_summary_${key}_${day}d_${today}.json`);
    try {
      execFileSync(process.execPath, [script, String(siteId), String(day), key, reportFile], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: options.stdio || 'pipe',
      });
      adReports[key] = readJson(reportFile, { ok: false, rows: [] });
    } catch (error) {
      errors.push({ key, error: error.message });
      adReports[key] = readJson(reportFile, { ok: false, rows: [], error: error.message });
    }
  }

  const evidence = buildReviewEvidence({
    queue,
    adReports,
    inventoryReports: options.inventoryReports || readJson(options.inventoryReportFile, {}),
    profitReports: options.profitReports || readJson(options.profitReportFile, {}),
    selectionReports: options.selectionReports || {
      keywordConversion: readJson(options.keywordConversionReportFile, {}),
      abaSearchTerms: readJson(options.abaSearchTermReportFile, {}),
    },
  });
  const evidenceFile = options.outFile || path.join(ROOT, 'data', 'agent', `review_evidence_${today}.json`);
  writeJson(evidenceFile, evidence);
  return {
    evidenceFile,
    evidence,
    summary: {
      requested: reviewSubjectKeys(queue).length,
      collected: Object.values(evidence).filter(item => item.current).length,
      inventoryCollected: Object.values(evidence).filter(item => item.inventory).length,
      profitCollected: Object.values(evidence).filter(item => item.profit).length,
      selectionCollected: Object.values(evidence).filter(item => item.market?.readyForDecisionSupport).length,
      missingBaseline: Object.values(evidence).filter(item => item.warnings.includes('missing_baseline_metrics')).length,
      errors,
    },
  };
}

module.exports = {
  buildReviewEvidence,
  collectAdSkuReviewEvidence,
  normalizeAdSkuSummaryReport,
  normalizeInventoryReport,
  normalizeProfitReport,
  normalizeSelectionMarketReport,
  reviewSubjectKeys,
};
