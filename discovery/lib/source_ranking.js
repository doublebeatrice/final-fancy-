function valueScore(name = '') {
  const text = String(name || '').toLowerCase();
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };
  if (/search|搜索|关键词|asin|流量|表现/.test(text)) add(24, 'traffic_value');
  if (/listing|转化|评分|评论|购物车|产品问题|修改失败/.test(text)) add(22, 'conversion_value');
  if (/profit|利润|价格|赔偿|refund|退款|退货|成本/.test(text)) add(22, 'profit_value');
  if (/inventory|库存|滞销|清仓|移除|fba|可卖/.test(text)) add(22, 'inventory_value');
  if (/risk|异常|受限|跟卖|敏感|失败|瑕疵|合规/.test(text)) add(18, 'risk_value');
  if (!score) add(5, 'general_report');
  return { score, reasons };
}

function rankSources(sources = []) {
  return (sources || []).map(source => {
    const fieldSummary = source.fieldSummary || {};
    const networkSummary = source.networkSummary || {};
    const endpointSummary = source.endpointSummary || {};
    const value = valueScore(`${source.routeName || ''} ${source.sourceId || ''}`);
    const reasons = [...value.reasons];
    let score = value.score;
    score += Number(fieldSummary.confirmed || 0) * 4;
    score += Number(fieldSummary.probable || 0) * 2;
    score -= Number(fieldSummary.unknown || 0);
    if (Number(networkSummary.requestCount || 0) > 0) {
      score += 8;
      reasons.push('has_network_sample');
    }
    if (Number(networkSummary.sampleRowCount || 0) > 0) {
      score += Math.min(12, Number(networkSummary.sampleRowCount || 0) / 10);
      reasons.push('has_rows');
    }
    if (Number(endpointSummary.safeRead || 0) > 0) {
      score += Math.min(10, Number(endpointSummary.safeRead || 0) * 2);
      reasons.push('has_safe_read_endpoint_candidate');
    }
    if (Number(endpointSummary.writeOrSensitive || 0) > 0) {
      score -= Math.min(12, Number(endpointSummary.writeOrSensitive || 0) * 2);
      reasons.push('has_write_endpoint_candidate');
    }
    if (Number(endpointSummary.total || 0) > 0 && Number(endpointSummary.safeRead || 0) === 0 && Number(endpointSummary.commonNoise || 0) > 0) {
      score -= 34;
      reasons.push('only_common_endpoint_noise');
    }
    if (source.riskLevel === 'write_or_sensitive_candidate') {
      score -= 60;
      reasons.push('risk_penalty');
    }
    return {
      ...source,
      score: Number(score.toFixed(2)),
      reasons,
    };
  }).sort((a, b) => b.score - a.score || String(a.sourceId || '').localeCompare(String(b.sourceId || '')));
}

module.exports = {
  rankSources,
};
