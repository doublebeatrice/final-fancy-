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

function daysBetween(start = '', end = '') {
  const startDate = new Date(dateOnly(start) + 'T00:00:00.000Z');
  const endDate = new Date(dateOnly(end) + 'T00:00:00.000Z');
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
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

function goalForTask(task = {}) {
  const goal = task.reviewPlan?.goal || task.goal || task.reviewGoal || null;
  return goal && typeof goal === 'object' ? goal : null;
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function metricValue(metrics = {}, name = '') {
  const key = text(name).toLowerCase();
  if (!key) return null;
  const aliases = {
    unit: ['units', 'orders'],
    units: ['units', 'orders'],
    order: ['orders'],
    orders: ['orders'],
    sales: ['sales'],
    netprofit: ['netProfit', 'net_profit'],
    net_profit: ['netProfit', 'net_profit'],
    spend: ['spend'],
    acos: ['acos'],
    cvr: ['cvr', 'conversionRate', 'conversion_rate'],
    clicks: ['clicks'],
    impressions: ['impressions'],
    invdays: ['invDays', 'inventoryDays', 'sellableDays', 'stockDays'],
    fulres: ['fulRes', 'fba', 'fbaAvailable', 'sellableStock'],
    fba: ['fba', 'fulRes', 'fbaAvailable', 'sellableStock'],
    stock: ['stock', 'fulRes', 'fba', 'sellableStock'],
  }[key] || [key];
  for (const alias of aliases) {
    if (metrics[alias] !== undefined && metrics[alias] !== null && metrics[alias] !== '') {
      return num(metrics[alias], null);
    }
  }
  return null;
}

function truthyMetric(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function falseyMetric(value) {
  return value === false || value === 'false' || value === 0 || value === '0';
}

function isOldProductMarketRelativeReview(task = {}) {
  const plan = task.reviewPlan || {};
  const metrics = list(plan.metrics).map(item => item.toLowerCase());
  return plan.requiresMarketRelativeImprovement === true ||
    plan.requiresProfitImprovement === true ||
    metrics.includes('market_relative_yoy_gap');
}

function marketRelativeImproved(evidence = {}) {
  const marketRelative = evidence.marketRelative || {};
  const candidates = [
    evidence.relativeYoyGapImproved,
    marketRelative.yoyGapImproved,
    marketRelative.relativeGapImproved,
    marketRelative.relativeYoyGapImproved,
  ];
  if (candidates.some(truthyMetric)) return true;
  if (candidates.some(falseyMetric)) return false;
  return null;
}

function marketAttributionClear(evidence = {}) {
  const marketRelative = evidence.marketRelative || {};
  const candidates = [
    evidence.marketAttributionClear,
    evidence.marketBaselineAvailable,
    evidence.marketBaselineEvidence,
    marketRelative.attributionClear,
    marketRelative.marketBaselineAvailable,
    marketRelative.baselineAvailable,
    marketRelative.baselineEvidence,
  ];
  if (candidates.some(truthyMetric)) return true;
  if (candidates.some(falseyMetric)) return false;
  const attribution = text(marketRelative.attribution || marketRelative.attributionStatus || evidence.marketAttribution || '').toLowerCase();
  if (['clear', 'verified', 'market_relative_verified', 'baseline_verified'].includes(attribution)) return true;
  if (['unclear', 'unknown', 'missing', 'market_attribution_unclear'].includes(attribution)) return false;
  return null;
}

function profitImproved(evidence = {}, baseline = {}, current = {}) {
  const profit = evidence.profit || {};
  const candidates = [
    evidence.profitImproved,
    profit.improved,
    profit.unitProfitQualityImproved,
  ];
  if (candidates.some(truthyMetric)) return true;
  if (candidates.some(falseyMetric)) return false;
  const before = metricValue(baseline, 'netProfit');
  const after = metricValue(current, 'netProfit');
  if (before !== null && after !== null) return after > before;
  return null;
}

function hasAnyMetric(metrics = {}, names = []) {
  return names.some(name => metricValue(metrics, name) !== null);
}

function oldProductOperatingEvidence(evidence = {}, baseline = {}, current = {}) {
  const adSpendReviewed = evidence.adSpendReviewed === true ||
    evidence.adSpendResult === true ||
    hasAnyMetric(baseline, ['spend']) && hasAnyMetric(current, ['spend']);
  const conversionReviewed = evidence.conversionReviewed === true ||
    evidence.conversionResult === true ||
    evidence.conversion !== undefined ||
    evidence.conversionRate !== undefined ||
    (hasAnyMetric(baseline, ['clicks']) && hasAnyMetric(current, ['clicks']) && hasAnyMetric(baseline, ['orders']) && hasAnyMetric(current, ['orders'])) ||
    (hasAnyMetric(baseline, ['cvr']) && hasAnyMetric(current, ['cvr']));
  const inventoryRiskReviewed = evidence.inventoryReviewed === true ||
    evidence.inventoryRiskReviewed === true ||
    evidence.inventory !== undefined ||
    evidence.inventoryRisk !== undefined ||
    hasAnyMetric(current, ['invDays', 'fulRes', 'fba', 'stock']);
  const reasons = [];
  reasons.push(adSpendReviewed ? 'old_product_ad_spend_reviewed' : 'missing_old_product_ad_spend_result');
  reasons.push(conversionReviewed ? 'old_product_conversion_reviewed' : 'missing_old_product_conversion_result');
  reasons.push(inventoryRiskReviewed ? 'old_product_inventory_risk_reviewed' : 'missing_old_product_inventory_risk_result');
  return {
    ok: adSpendReviewed && conversionReviewed && inventoryRiskReviewed,
    reasons,
  };
}

function evaluateOldProductMarketRelativeReview(task = {}, evidence = {}, baseline = {}, current = {}, timeWindowPatch = {}) {
  if (!isOldProductMarketRelativeReview(task)) return null;
  const reasons = [];
  const marketPass = marketRelativeImproved(evidence);
  const marketAttribution = marketPass === true ? marketAttributionClear(evidence) : true;
  const profitPass = profitImproved(evidence, baseline, current);
  const operatingEvidence = oldProductOperatingEvidence(evidence, baseline, current);
  if (marketPass === null) reasons.push('missing_market_relative_yoy_gap_result');
  else reasons.push(marketPass ? 'market_relative_yoy_gap_improved' : 'market_relative_yoy_gap_not_improved');
  if (marketPass === true) {
    if (marketAttribution === true) reasons.push('market_attribution_clear');
    else reasons.push(marketAttribution === false ? 'market_attribution_unclear' : 'missing_market_attribution_evidence');
  }
  if (profitPass === null) reasons.push('missing_profit_improvement_result');
  else reasons.push(profitPass ? 'profit_improved' : 'profit_not_improved');
  reasons.push(...operatingEvidence.reasons);

  if (marketPass === null || marketAttribution !== true || profitPass === null) {
    return baseResult(task, evidence, {
      verdict: 'needs_data',
      status: 'blocked',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Collect market-relative YoY gap, market attribution/baseline evidence, and profit evidence before judging old-product maintenance.',
    });
  }

  if (!operatingEvidence.ok) {
    return baseResult(task, evidence, {
      verdict: 'needs_data',
      status: 'blocked',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Collect old-product ad spend, conversion, and inventory-risk evidence before closing or counting this review for automation.',
    });
  }

  if (marketPass && profitPass) {
    return baseResult(task, evidence, {
      verdict: 'goal_met',
      status: 'closed_recommended',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Old-product maintenance met both market-relative decline improvement and profit improvement gates.',
    });
  }

  return baseResult(task, evidence, {
    verdict: 'goal_missed',
    status: 'needs_action',
    reasons,
    baseline,
    current,
    ...timeWindowPatch,
    nextStep: 'Do not scale or automate this old-product action; review direction, market relation, receiver, and profit route.',
  });
}

function evaluateGoal(task = {}, baseline = {}, current = {}) {
  const goal = goalForTask(task);
  if (!goal) return null;
  const metric = text(goal.metric || goal.name || 'orders').toLowerCase();
  const currentValue = metricValue(current, metric);
  if (currentValue === null) return null;
  const target = goal.to ?? goal.target ?? goal.min ?? null;
  const hardFloor = goal.hardFloor ?? goal.floor ?? null;
  const baselineValue = metricValue(baseline, metric);
  if (target !== null && currentValue >= num(target, Infinity)) {
    return { verdict: 'goal_met', reason: `goal_${metric}_met`, goal, currentValue, baselineValue };
  }
  if (hardFloor !== null && currentValue < num(hardFloor, -Infinity)) {
    return { verdict: 'goal_missed', reason: `goal_${metric}_below_hard_floor`, goal, currentValue, baselineValue };
  }
  return { verdict: 'goal_partial', reason: `goal_${metric}_not_met_yet`, goal, currentValue, baselineValue };
}

function enrichResult(result = {}, evidence = {}) {
  return {
    ...result,
    baselineAsOf: text(result.baselineAsOf || evidence.baselineAsOf || evidence.baseline?.asOf || evidence.baseline?.exportedAt || ''),
    currentAsOf: text(result.currentAsOf || evidence.currentAsOf || evidence.current?.asOf || evidence.current?.exportedAt || ''),
    currentStale: result.currentStale === true || evidence.currentStale === true,
    inventory: evidence.inventory || null,
    profit: evidence.profit || null,
    market: evidence.market || null,
    riskSignals: Array.isArray(evidence.riskSignals) ? evidence.riskSignals.slice() : [],
  };
}

function baseResult(task = {}, evidence = {}, patch = {}) {
  return enrichResult({
    taskId: task.taskId || '',
    key: evidenceKeyForTask(task),
    title: task.title || '',
    ...patch,
  }, evidence);
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
      nextStep: 'Collect baseline and current metrics before judging the action.',
    }, evidence);
  }

  const baseline = evidence.baseline || {};
  const current = evidence.current || {};
  const guardrailRisks = businessGuardrailRisks(evidence);
  const reasons = [];
  const baselineAsOf = text(evidence.baselineAsOf || baseline.asOf || baseline.exportedAt || task.reviewPlan?.baselineAsOf || task.dataDate || task.businessDate || task.createdAt);
  const currentAsOf = text(evidence.currentAsOf || current.asOf || current.exportedAt);
  const today = text(evidence.today || task.today || '');
  const currentAgeDays = today && currentAsOf ? daysBetween(currentAsOf, today) : null;
  const currentStale = currentAgeDays !== null && currentAgeDays > 2;
  const timeWindowPatch = { baselineAsOf, currentAsOf, currentStale, currentAgeDays };
  const spendBefore = num(baseline.spend);
  const spendAfter = num(current.spend);
  const ordersBefore = num(baseline.orders);
  const ordersAfter = num(current.orders);
  const rollbackIf = text(task.reviewPlan?.rollbackIf).toLowerCase();
  const reviewDay = num(task.reviewPlan?.checkAfterDay, 0);

  if (!baselineAsOf || !currentAsOf) {
    return baseResult(task, { ...evidence, currentStale }, {
      verdict: 'needs_data',
      status: 'blocked',
      reasons: ['missing_effect_review_time_window'],
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Collect distinct baselineAsOf and currentAsOf before judging the action.',
    });
  }

  if (dateOnly(baselineAsOf) === dateOnly(currentAsOf)) {
    return baseResult(task, { ...evidence, currentStale }, {
      verdict: 'needs_data',
      status: 'blocked',
      reasons: ['same_window_baseline_and_current'],
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Baseline and current are from the same window; do not judge against itself.',
    });
  }

  if (rollbackIf.includes('spend rises without orders') && spendAfter > spendBefore && ordersAfter <= ordersBefore) {
    reasons.push('spend_rises_without_orders');
    if (currentStale) reasons.push('current_metrics_stale');
    return baseResult(task, evidence, {
      verdict: currentStale ? 'goal_partial' : 'goal_missed',
      status: currentStale ? 'waiting_review' : 'needs_action',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: currentStale
        ? 'Current metrics are stale; keep this review open and refresh evidence before rollback.'
        : 'Review rollback or secondary control; do not keep scaling this action.',
    });
  }

  if (reviewDay > 0 && reviewDay < 3) {
    reasons.push('early_review_window');
    return baseResult(task, evidence, {
      verdict: 'early_window',
      status: 'waiting_review',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: 'Early review window; wait for the next scheduled checkpoint before closing or rolling back.',
    });
  }

  const oldProductMarketRelativeResult = evaluateOldProductMarketRelativeReview(task, evidence, baseline, current, timeWindowPatch);
  if (oldProductMarketRelativeResult) return oldProductMarketRelativeResult;

  const goalResult = evaluateGoal(task, baseline, current);
  if (goalResult) {
    reasons.push(goalResult.reason);
    return baseResult(task, evidence, {
      verdict: currentStale && goalResult.verdict !== 'goal_partial' ? 'goal_partial' : goalResult.verdict,
      status: (currentStale && goalResult.verdict !== 'goal_partial' ? 'goal_partial' : goalResult.verdict) === 'goal_met'
        ? 'closed_recommended'
        : ((currentStale && goalResult.verdict !== 'goal_partial' ? 'goal_partial' : goalResult.verdict) === 'goal_missed' ? 'needs_action' : 'waiting_review'),
      reasons: currentStale && goalResult.verdict !== 'goal_partial' ? [...reasons, 'current_metrics_stale'] : reasons,
      baseline,
      current,
      ...timeWindowPatch,
      goal: goalResult.goal,
      goalCurrentValue: goalResult.currentValue,
      goalBaselineValue: goalResult.baselineValue,
      nextStep: goalResult.verdict === 'goal_met'
        ? 'Goal met; close this review and preserve the lesson.'
        : (goalResult.verdict === 'goal_missed'
          ? 'Goal missed; create rollback or direction-change work.'
          : 'Goal not fully met; keep watching until the next checkpoint.'),
    });
  }

  if (ordersAfter > ordersBefore && acosImprovedOrStable(baseline, current)) {
    reasons.push('orders_improved');
    if (guardrailRisks.length) {
      reasons.push('business_guardrail_risk', ...guardrailRisks);
      if (hasMarketRisk(guardrailRisks)) reasons.push('market_guardrail_risk');
      if (currentStale) reasons.push('current_metrics_stale');
      return baseResult(task, evidence, {
        verdict: 'goal_partial',
        status: 'waiting_review',
        reasons,
        baseline,
        current,
        ...timeWindowPatch,
        nextStep: 'Orders improved, but guardrails still require observation before scaling.',
      });
    }
    if (currentStale) reasons.push('current_metrics_stale');
    return baseResult(task, evidence, {
      verdict: currentStale ? 'goal_partial' : 'goal_met',
      status: currentStale ? 'waiting_review' : 'closed_recommended',
      reasons,
      baseline,
      current,
      ...timeWindowPatch,
      nextStep: currentStale
        ? 'Orders improved, but current metrics are stale; refresh evidence before closing.'
        : 'Goal met by order improvement; close this review and preserve the lesson.',
    });
  }

  reasons.push('no_clear_change_yet');
  return baseResult(task, evidence, {
    verdict: 'goal_partial',
    status: 'waiting_review',
    reasons,
    baseline,
    current,
    ...timeWindowPatch,
    nextStep: 'No clear change yet; keep watching until the next checkpoint.',
  });
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
  const today = dateOnly(input.today || new Date().toISOString());
  const results = due.map(task => evaluateReviewTask(task, {
    ...(evidence[evidenceKeyForTask(task)] || {}),
    today,
  }));
  const timeWindowDowngraded = results.filter(item => (item.reasons || []).includes('same_window_baseline_and_current')).length;
  const staleDowngraded = results.filter(item => (item.reasons || []).includes('current_metrics_stale')).length;
  return {
    generatedAt: text(input.generatedAt || new Date().toISOString()),
    today,
    summary: {
      total: results.length,
      feedbackApplied: results.length,
      effectReviewFeedbackApplied: results.length,
      byVerdict: countBy(results, item => item.verdict),
      byStatus: countBy(results, item => item.status),
      needsAction: results.filter(item => item.status === 'needs_action').length,
      blocked: results.filter(item => item.status === 'blocked').length,
      timeWindowDowngraded,
      staleDowngraded,
    },
    results,
  };
}

module.exports = {
  buildEffectReviewReport,
  evaluateReviewTask,
  evidenceKeyForTask,
};
