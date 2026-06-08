function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = number(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const CATEGORY_DEFS = [
  {
    key: 'lowEfficiency',
    label: 'low_efficiency',
    reason: 'low_efficiency_not_landed',
    aliases: ['lowEfficiency', 'low_efficiency', 'lowEfficiencyTerms'],
    topLevelOpen: ['lowEfficiencyActionable', 'lowEfficiencyActionableRows', 'lowEfficiencyOpen'],
  },
  {
    key: 'overBudget',
    label: 'over_budget',
    reason: 'over_budget_not_landed',
    aliases: ['overBudget', 'over_budget'],
    topLevelOpen: ['overBudgetRequiredActions', 'overBudgetPlannedActions', 'overBudgetActionableCampaigns', 'overBudgetActionable'],
  },
  {
    key: 'price',
    label: 'price',
    reason: 'price_not_landed',
    aliases: ['price', 'priceActions', 'priceRaise'],
    topLevelOpen: ['priceRequiredActions', 'priceActions', 'priceActionable', 'priceOpen'],
  },
];

function categorySource(input = {}, def = {}) {
  for (const alias of def.aliases || []) {
    const value = input[alias];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (Number(value) > 0) return { open: value };
  }
  return {};
}

function topLevelOpen(input = {}, def = {}) {
  return pickNumber(...(def.topLevelOpen || []).map(key => input[key]));
}

function normalizeCategory(input = {}, def = {}) {
  const source = categorySource(input, def);
  const requiredActions = pickNumber(
    source.requiredActions,
    source.plannedActions,
    source.actionActions,
    source.open,
    source.actionable,
    topLevelOpen(input, def)
  );
  const candidateCount = pickNumber(
    source.candidates,
    source.candidateCount,
    source.rawActionable,
    source.actionable,
    topLevelOpen(input, def)
  );
  const openCount = requiredActions || candidateCount;
  const landed = number(source.landed || source.landedActions || source.landedSuccess || source.success);
  const manualReview = number(source.manualReview || source.manualReviewActions || source.manual);
  const blocked = number(source.blocked || source.blockedActions || source.hold);
  const approvalNeeded = number(source.approvalNeeded || source.approvalNeededActions || source.approval);
  const resolvedCount = landed + blocked + approvalNeeded;
  const forcedResolved = source.resolved === true || source.closed === true || source.status === 'closed' || source.status === 'complete';
  const unresolvedCount = forcedResolved ? 0 : Math.max(0, openCount - resolvedCount);
  return {
    key: def.key,
    label: def.label,
    openCount,
    candidateCount,
    requiredActions,
    landed,
    manualReview,
    blocked,
    approvalNeeded,
    resolvedCount,
    unresolvedCount,
    resolved: unresolvedCount <= 0,
    reason: def.reason,
  };
}

function normalizeMandatoryDailyClosure(input = {}) {
  const source = asObject(input.mandatoryDailyClosure || input.dailyMandatoryClosure || input);
  const categories = Array.isArray(source.categories)
    ? source.categories.map(item => {
        const def = CATEGORY_DEFS.find(candidate => candidate.key === item.key || candidate.label === item.label) || {};
        const openCount = number(item.openCount);
        const landed = number(item.landed);
        const blocked = number(item.blocked);
        const approvalNeeded = number(item.approvalNeeded);
        const resolvedCount = landed + blocked + approvalNeeded;
        const unresolvedCount = item.resolved === true ? 0 : Math.max(0, openCount - resolvedCount);
        return {
          key: text(item.key || def.key),
          label: text(item.label || def.label || item.key),
          openCount,
          candidateCount: number(item.candidateCount),
          requiredActions: number(item.requiredActions),
          landed,
          manualReview: number(item.manualReview),
          blocked,
          approvalNeeded,
          resolvedCount,
          unresolvedCount,
          resolved: unresolvedCount <= 0,
          reason: text(item.reason || def.reason),
        };
      })
    : CATEGORY_DEFS.map(def => normalizeCategory(source, def));
  const openCount = categories.reduce((sum, item) => sum + item.openCount, 0);
  const unresolvedCount = categories.reduce((sum, item) => sum + item.unresolvedCount, 0);
  const resolvedCount = categories.reduce((sum, item) => sum + item.resolvedCount, 0);
  const forcedResolved = source.resolved === true || source.closed === true || source.status === 'closed' || source.status === 'complete';
  const resolved = forcedResolved || unresolvedCount <= 0;
  const reasons = categories
    .filter(item => item.unresolvedCount > 0)
    .map(item => item.reason);
  return {
    required: source.required === true || openCount > 0,
    status: resolved ? 'closed' : 'needs_landing',
    openCount,
    resolvedCount,
    unresolvedCount: resolved ? 0 : unresolvedCount,
    resolved,
    categories,
    reasons,
  };
}

function mandatoryClosureFromOperatingClosure(operatingClosure = {}) {
  return normalizeMandatoryDailyClosure({
    lowEfficiency: {
      actionable: operatingClosure.lowEfficiencyActionable,
      landed: operatingClosure.lowEfficiencyLanded,
      manualReview: operatingClosure.lowEfficiencyManualReview,
      blocked: operatingClosure.lowEfficiencyBlocked,
      approvalNeeded: operatingClosure.lowEfficiencyApprovalNeeded,
    },
    overBudget: {
      actionable: operatingClosure.overBudgetRequiredActions || operatingClosure.overBudgetPlannedActions || operatingClosure.overBudgetActionableCampaigns,
      landed: operatingClosure.overBudgetLanded,
      manualReview: operatingClosure.overBudgetManualReview,
      blocked: operatingClosure.overBudgetBlocked,
      approvalNeeded: operatingClosure.overBudgetApprovalNeeded,
    },
    price: {
      actionable: operatingClosure.priceRequiredActions || operatingClosure.priceActions,
      landed: operatingClosure.priceLanded,
      manualReview: operatingClosure.priceManualReview,
      blocked: operatingClosure.priceBlocked,
      approvalNeeded: operatingClosure.priceApprovalNeeded,
    },
  });
}

module.exports = {
  CATEGORY_DEFS,
  mandatoryClosureFromOperatingClosure,
  normalizeMandatoryDailyClosure,
  number,
  text,
};
