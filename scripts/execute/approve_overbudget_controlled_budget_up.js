const fs = require('fs');

const inFile = process.argv[2];
const outFile = process.argv[3];
const limit = Number(process.argv[4] || 50);
const businessDate = process.argv[5] || new Date().toISOString().slice(0, 10);
const historyFile = process.argv[6] || 'data/adjustment_history.json';

if (!inFile || !outFile) {
  throw new Error('Usage: node scripts/execute/approve_overbudget_controlled_budget_up.js <candidate.json> <out.json> [limit] [businessDate] [history.json]');
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const plans = loadJson(inFile, []);
const history = loadJson(historyFile, []);

const alreadyControlledLifted = new Set(
  history
    .filter(item => item.date === businessDate)
    .filter(item => String(item.entityType || '') === 'campaign')
    .filter(item => String(item.direction || '') === 'up')
    .filter(item => !String(item.reason || '').includes('Restore budget after correcting over-budget handling direction'))
    .filter(item => String(item.reason || '').includes('Over-budget campaign is still converting efficiently'))
    .map(item => String(item.entityId || item.campaignId || ''))
    .filter(Boolean)
);

const selected = [];
const skipped = [];

for (const plan of plans) {
  for (const action of plan.actions || []) {
    const id = String(action.id || action.campaignId || '');
    if (
      action.entityType !== 'campaign' ||
      action.actionType !== 'budget' ||
      action.riskLevel !== 'over_budget_controlled_budget_up'
    ) {
      continue;
    }
    if (alreadyControlledLifted.has(id)) {
      skipped.push({ id, sku: plan.sku, campaign: action.campaignName, reason: 'already_controlled_lifted_today' });
      continue;
    }
    if (Number(action.suggestedBudget) <= Number(action.currentBudget)) {
      skipped.push({ id, sku: plan.sku, campaign: action.campaignName, reason: 'not_budget_up' });
      continue;
    }
    selected.push({
      sku: plan.sku,
      asin: plan.asin || '',
      summary: `Codex approved controlled over-budget campaign daily budget lift for ${plan.sku}.`,
      action: {
        ...action,
        decisionStage: 'ai_approved',
        approvedBy: 'codex',
        requiresAiDecision: false,
        actionSource: ['codex'],
        candidateSource: '',
        candidateActionType: '',
        candidateReason: '',
        source: 'codex_overbudget_controlled_budget_up_2026-05-09',
        confidence: Math.max(Number(action.confidence) || 0, 0.86),
      },
    });
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
  businessDate,
  alreadyControlledLiftedToday: alreadyControlledLifted.size,
  totalCandidates: selected.length + skipped.length,
  skipped: skipped.length,
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
