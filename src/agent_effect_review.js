function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function evidenceKeyForTask(task = {}) {
  const subject = task.subject || {};
  return text(subject.sku) || text(subject.asin) || text(subject.keyword) || text(subject.entityId) || text(task.taskId);
}

function hasMetrics(evidence = {}) {
  return evidence && typeof evidence === 'object' && evidence.baseline && evidence.current;
}

function acosImprovedOrStable(baseline = {}, current = {}) {
  const before = num(baseline.acos, null);
  const after = num(current.acos, null);
  if (before === null || after === null || before <= 0) return true;
  return after <= before * 1.2;
}

function businessGuardrailRisks(evidence = {}) {
  const signals = Array.isArray(evidence.riskSignals) ? evidence.riskSignals : [];
  return signals.filter(signal => [
    'inventory_tight',
    'profit_negative',
    'acos_above_profit_rate',
    'market_conversion_weak',
    'market_cost_high',
    'market_demand_low',
    'market_competition_high',
    'market_evidence_missing',
  ].includes(signal));
}

function hasMarketRisk(signals = []) {
  return signals.some(signal => String(signal).startsWith('market_'));
}

function enrichResult(result = {}, evidence = {}) {
  return {
    ...result,
    inventory: evidence.inventory || null,
    profit: evidence.profit || null,
    market: evidence.market || null,
    riskSignals: Array.isArray(evidence.riskSignals) ? evidence.riskSignals.slice() : [],
  };
}

function evaluateReviewTask(task = {}, evidence = {}) {
  const key = evidenceKeyForTask(task);
  if (!hasMetrics(evidence)) {
    return enrichResult({
      taskId: task.taskId || '',
      key,
      title: task.title || '',
      verdict: 'needs_data',
      status: 'blocked',
      reasons: ['missing_baseline_or_current_metrics'],
      nextStep: '先拉取执行前基线和当前表现，再做复查判断。',
    }, evidence);
  }

  const baseline = evidence.baseline || {};
  const current = evidence.current || {};
  const guardrailRisks = businessGuardrailRisks(evidence);
  const reasons = [];
  const spendBefore = num(baseline.spend);
  const spendAfter = num(current.spend);
  const ordersBefore = num(baseline.orders);
  const ordersAfter = num(current.orders);
  const rollbackIf = text(task.reviewPlan?.rollbackIf).toLowerCase();

  if (rollbackIf.includes('spend rises without orders') && spendAfter > spendBefore && ordersAfter <= ordersBefore) {
    reasons.push('spend_rises_without_orders');
    return enrichResult({
      taskId: task.taskId || '',
      key,
      title: task.title || '',
      verdict: 'rollback_review',
      status: 'needs_action',
      reasons,
      baseline,
      current,
      nextStep: '进入回滚或二次控制复核，不要继续放大该动作。',
    }, evidence);
  }

  if (ordersAfter > ordersBefore && acosImprovedOrStable(baseline, current)) {
    reasons.push('orders_improved');
    if (guardrailRisks.length) {
      reasons.push('business_guardrail_risk', ...guardrailRisks);
      if (hasMarketRisk(guardrailRisks)) reasons.push('market_guardrail_risk');
      return enrichResult({
        taskId: task.taskId || '',
        key,
        title: task.title || '',
        verdict: 'continue_watch',
        status: 'waiting_review',
        reasons,
        baseline,
        current,
        nextStep: '订单有改善，但库存或利润约束仍未通过，继续观察并限制追加放量。',
      }, evidence);
    }
    return enrichResult({
      taskId: task.taskId || '',
      key,
      title: task.title || '',
      verdict: 'close_success',
      status: 'closed_recommended',
      reasons,
      baseline,
      current,
      nextStep: '记录为有效动作，关闭本次复查，保留后续常规观察。',
    }, evidence);
  }

  reasons.push('no_clear_change_yet');
  return enrichResult({
    taskId: task.taskId || '',
    key,
    title: task.title || '',
    verdict: 'continue_watch',
    status: 'waiting_review',
    reasons,
    baseline,
    current,
    nextStep: '继续观察到下一个复查窗口，暂不追加动作。',
  }, evidence);
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildEffectReviewReport(input = {}) {
  const queue = input.queue || {};
  const due = queue.due || queue.tasks || [];
  const evidence = input.evidence || {};
  const results = due.map(task => evaluateReviewTask(task, evidence[evidenceKeyForTask(task)] || {}));
  return {
    generatedAt: text(input.generatedAt || new Date().toISOString()),
    today: dateOnly(input.today || new Date().toISOString()),
    summary: {
      total: results.length,
      byVerdict: countBy(results, item => item.verdict),
      byStatus: countBy(results, item => item.status),
      needsAction: results.filter(item => item.status === 'needs_action').length,
      blocked: results.filter(item => item.status === 'blocked').length,
    },
    results,
  };
}

module.exports = {
  buildEffectReviewReport,
  evaluateReviewTask,
  evidenceKeyForTask,
};
