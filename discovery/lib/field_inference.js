const { sanitizeObject } = require('./common');

function num(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function nearlyEqual(a, b, tolerance = 0.03) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return true;
  const base = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / base <= tolerance;
}

function columnMap(columns = []) {
  const out = new Map();
  for (const column of columns || []) {
    if (typeof column === 'string') {
      out.set(column, column);
      continue;
    }
    const field = column.field || column.prop || column.key || column.dataIndex || column.name || '';
    const label = column.label || column.title || column.text || column.name || field;
    if (field) out.set(String(field), String(label || field));
  }
  return out;
}

function collectFields(rows = [], columns = []) {
  const fields = new Set([...columnMap(columns).keys()]);
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields].sort();
}

function inferSemantic(field, label = '') {
  const text = `${field} ${label}`.toLowerCase();
  if (/acos|roas|cpc|ctr|cvr|conversion|spend|cost|sales|orders|click|impression|广告|花费|销售|订单|点击|曝光/.test(text)) return 'advertising_efficiency';
  if (/profit|margin|gross|net|rate|利润|毛利|净利/.test(text)) return 'profit';
  if (/inventory|stock|qty|sellable|stagnant|fba|库存|可卖|滞销|库龄/.test(text)) return 'inventory';
  if (/listing|title|bullet|image|review|rating|bsr|rank|asin|类目|评分|评论|排名|图片|标题/.test(text)) return 'listing_conversion';
  if (/refund|return|defect|risk|warning|restricted|异常|受限|退款|退货|瑕疵|跟卖|失败/.test(text)) return 'risk_health';
  if (/date|time|updated|created|日期|时间/.test(text)) return 'date_time';
  if (/state|status|enable|pause|状态|是否/.test(text)) return 'status';
  return 'unknown';
}

function businessValue(semanticType, field = '', label = '') {
  const text = `${field} ${label}`.toLowerCase();
  if (['advertising_efficiency', 'profit', 'inventory', 'listing_conversion', 'risk_health'].includes(semanticType)) return 'high';
  if (/seller|developer|sku|asin|account|site|销售|开发|账号|站点/.test(text)) return 'medium';
  return 'low';
}

function sampleValues(rows, field) {
  const values = [];
  for (const row of rows || []) {
    if (!row || !Object.prototype.hasOwnProperty.call(row, field)) continue;
    const value = row[field];
    if (value === null || value === undefined || value === '') continue;
    values.push(value);
    if (values.length >= 8) break;
  }
  return values;
}

function formulaEvidence(field, rows = []) {
  const lower = String(field).toLowerCase();
  const evidence = [];
  let confirmed = false;
  for (const row of rows || []) {
    const spend = num(row.Spend ?? row.spend ?? row.cost ?? row.adSpend);
    const sales = num(row.Sales ?? row.sales ?? row.adSales);
    const clicks = num(row.Clicks ?? row.clicks);
    const impressions = num(row.Impressions ?? row.impressions);
    const orders = num(row.Orders ?? row.orders);
    const value = num(row[field]);
    if (lower === 'acos' && sales > 0 && nearlyEqual(value, spend / sales)) {
      confirmed = true;
      evidence.push('Formula check matched: ACOS ~= Spend / Sales');
      break;
    }
    if (lower === 'cpc' && clicks > 0 && nearlyEqual(value, spend / clicks)) {
      confirmed = true;
      evidence.push('Formula check matched: CPC ~= Spend / Clicks');
      break;
    }
    if (lower === 'roas' && spend > 0 && nearlyEqual(value, sales / spend)) {
      confirmed = true;
      evidence.push('Formula check matched: ROAS ~= Sales / Spend');
      break;
    }
    if ((lower === 'ctr' || lower.includes('clickrate')) && impressions > 0 && nearlyEqual(value, clicks / impressions)) {
      confirmed = true;
      evidence.push('Formula check matched: CTR ~= Clicks / Impressions');
      break;
    }
    if ((lower === 'cvr' || lower.includes('conversion')) && clicks > 0 && nearlyEqual(value, orders / clicks)) {
      confirmed = true;
      evidence.push('Formula check matched: CVR ~= Orders / Clicks');
      break;
    }
  }
  return { confirmed, evidence };
}

function guessMeaning(field, label, semanticType) {
  if (label && label !== field) return `${label} (${field})`;
  const known = {
    ACOS: 'Advertising cost of sales',
    Spend: 'Advertising spend',
    Sales: 'Advertising sales',
    Orders: 'Advertising orders',
    Clicks: 'Clicks',
    Impressions: 'Impressions',
    CPC: 'Cost per click',
    ROAS: 'Return on ad spend',
    updatedAt: 'Last update time',
  };
  return known[field] || `${semanticType} field: ${field}`;
}

function confidenceFor({ field, label, semanticType, formula, values }) {
  if (formula.confirmed) return 'A_confirmed';
  if (semanticType !== 'unknown' && label && label !== field) return 'A_confirmed';
  if (semanticType !== 'unknown' && values.length >= 2) return 'B_probable';
  return 'C_unknown';
}

function inferFields(input = {}) {
  const rows = sanitizeObject(input.sampleRows || []);
  const columns = sanitizeObject(input.pageColumns || []);
  const labels = columnMap(columns);
  const fields = collectFields(rows, columns);
  const inferred = fields.map(field => {
    const label = labels.get(field) || '';
    const semanticType = inferSemantic(field, label);
    const values = sampleValues(rows, field);
    const formula = formulaEvidence(field, rows);
    const evidence = [];
    if (label) evidence.push(`Page column label: ${label}`);
    if (values.length) evidence.push(`Sample values: ${values.slice(0, 3).join(', ')}`);
    evidence.push(...formula.evidence);
    return {
      field,
      label,
      guessedMeaning: guessMeaning(field, label, semanticType),
      semanticType,
      businessValue: businessValue(semanticType, field, label),
      confidence: confidenceFor({ field, label, semanticType, formula, values }),
      sampleValues: values,
      evidence,
    };
  });
  return {
    sourceId: input.sourceId || '',
    generatedAt: new Date().toISOString(),
    fieldCount: inferred.length,
    fieldSummary: {
      confirmed: inferred.filter(field => field.confidence === 'A_confirmed').length,
      probable: inferred.filter(field => field.confidence === 'B_probable').length,
      unknown: inferred.filter(field => field.confidence === 'C_unknown').length,
    },
    fields: inferred,
  };
}

function buildOperatorQuestions(report = {}) {
  return (report.fields || [])
    .filter(field => field.businessValue === 'high' && ['B_probable', 'C_unknown'].includes(field.confidence))
    .map(field => `请确认字段 ${field.field} 是否表示：${field.guessedMeaning}。证据：${(field.evidence || []).join('；') || '暂无可自证证据'}`);
}

module.exports = {
  inferFields,
  buildOperatorQuestions,
};
