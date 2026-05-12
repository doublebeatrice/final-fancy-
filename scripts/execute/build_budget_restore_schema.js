const fs = require('fs');

const historyFile = process.argv[2] || 'data/adjustment_history.json';
const outFile = process.argv[3] || 'data/snapshots/restore_campaign_budget_schema.json';
const businessDate = process.argv[4] || new Date().toISOString().slice(0, 10);

const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
const rows = history.filter(item =>
  item.date === businessDate &&
  item.entityType === 'campaign' &&
  item.direction === 'down' &&
  String(item.reason || '').includes('Over-budget campaign is not a good budget receiver') &&
  Number.isFinite(Number(item.fromBudget)) &&
  Number.isFinite(Number(item.toBudget)) &&
  Number(item.fromBudget) > Number(item.toBudget)
);

const plans = [];
for (const item of rows) {
  let plan = plans.find(existing => existing.sku === item.sku);
  if (!plan) {
    plan = {
      sku: item.sku,
      asin: item.learning?.baseline?.asin || '',
      summary: `Restore campaign budgets for ${item.sku} after over-budget direction correction.`,
      actions: [],
    };
    plans.push(plan);
  }
  plan.actions.push({
    id: String(item.entityId),
    entityType: 'campaign',
    actionType: 'budget',
    currentBudget: Number(item.toBudget),
    suggestedBudget: Number(item.fromBudget),
    campaignId: String(item.entityId),
    campaignName: item.learning?.baseline?.overBudgetGroup?.campaignName || '',
    groupName: item.learning?.baseline?.overBudgetGroup?.groupName || '',
    reason: `Restore budget after correcting over-budget handling direction: ${item.toBudget} -> ${item.fromBudget}. Reducing campaign budget does not clear the out-of-budget board.`,
    evidence: [
      'correction=restore_mistaken_overbudget_budget_down',
      `previousDown=${item.fromBudget}->${item.toBudget}`,
      `restoreTo=${item.fromBudget}`,
    ],
    confidence: 0.99,
    riskLevel: 'restore_mistaken_overbudget_budget_down',
    source: 'codex_restore_overbudget_budget_down_2026-05-09',
    actionSource: ['codex'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    requiresAiDecision: false,
    allowLargeBudgetChange: true,
    learning: {
      enabled: true,
      hypothesis: 'Undo mistaken budget-down action that does not clear out-of-budget status.',
      expectedEffect: { budget: 'restore', spend: 'watch', orders: 'watch', acos: 'watch' },
      measurementWindowDays: [1, 3],
      baselineQuality: 'complete',
      baseline: {
        sku: item.sku,
        entityType: 'campaign',
        entityId: String(item.entityId),
        currentBudget: Number(item.toBudget),
        suggestedBudget: Number(item.fromBudget),
      },
    },
  });
}

fs.writeFileSync(outFile, JSON.stringify(plans, null, 2));
console.log(JSON.stringify({
  outFile,
  plannedSkus: plans.length,
  plannedActions: rows.length,
  sample: plans.flatMap(plan => plan.actions.map(action => ({
    sku: plan.sku,
    id: action.id,
    current: action.currentBudget,
    suggested: action.suggestedBudget,
  }))).slice(0, 20),
}, null, 2));
