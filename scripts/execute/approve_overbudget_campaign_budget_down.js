const fs = require('fs');

const inFile = process.argv[2];
const outFile = process.argv[3];
const limit = Number(process.argv[4] || 80);

if (!inFile || !outFile) {
  throw new Error('Usage: node scripts/execute/approve_overbudget_campaign_budget_down.js <candidate.json> <out.json> [limit]');
}

const plans = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const selected = [];
const allowCampaignBudgetDown = process.env.OVER_BUDGET_ALLOW_CAMPAIGN_BUDGET_DOWN === '1';

if (!allowCampaignBudgetDown) {
  fs.writeFileSync(outFile, JSON.stringify([], null, 2));
  console.log(JSON.stringify({
    outFile,
    plannedSkus: 0,
    plannedActions: 0,
    disabled: true,
    reason: 'campaign_budget_down_is_not_a_clear_over_budget_action; use productAd pause or keyword/target bid-down for inefficient lower-layer traffic',
  }, null, 2));
  process.exit(0);
}

for (const plan of plans) {
  for (const action of plan.actions || []) {
    if (
      action.entityType === 'campaign' &&
      action.actionType === 'budget' &&
      action.riskLevel === 'over_budget_bad_conversion_budget_down'
    ) {
      selected.push({
        sku: plan.sku,
        asin: plan.asin || '',
        summary: `Codex approved over-budget campaign daily budget down for ${plan.sku}. This is campaign budget, intended to clear or reduce the advertising-system over-budget list.`,
        action: {
          ...action,
          decisionStage: 'ai_approved',
          approvedBy: 'codex',
          requiresAiDecision: false,
          actionSource: ['codex'],
          candidateSource: '',
          candidateActionType: '',
          candidateReason: '',
          source: 'codex_overbudget_campaign_budget_down_2026-05-09',
          confidence: Math.max(Number(action.confidence) || 0, 0.86),
        },
      });
    }
  }
}

const limited = selected.slice(0, limit);
const bySku = [];
for (const item of limited) {
  let plan = bySku.find(existing => existing.sku === item.sku);
  if (!plan) {
    plan = { sku: item.sku, asin: item.asin, summary: item.summary, actions: [] };
    bySku.push(plan);
  }
  plan.actions.push(item.action);
}

fs.writeFileSync(outFile, JSON.stringify(bySku, null, 2));
console.log(JSON.stringify({
  outFile,
  totalCandidates: selected.length,
  plannedSkus: bySku.length,
  plannedActions: limited.length,
  items: limited.map(item => ({
    sku: item.sku,
    id: item.action.id,
    campaign: item.action.campaignName,
    current: item.action.currentBudget,
    suggested: item.action.suggestedBudget,
    evidence: (item.action.evidence || []).slice(1, 3),
  })),
}, null, 2));
