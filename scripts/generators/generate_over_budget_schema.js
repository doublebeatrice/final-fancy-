const fs = require('fs');
const path = require('path');
const { buildSkuStateMap, effectiveProfitRate, getSkuState, isEnabledState, num } = require('../../src/over_budget_policy');

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function candidateMeta(actionType, reasonSignals = []) {
  return {
    decisionStage: 'candidate',
    candidateSource: 'rule_generator',
    candidateActionType: actionType,
    requiresAiDecision: true,
    approvedBy: null,
    candidateReason: reasonSignals.join(', '),
    actionSource: ['generator_candidate', 'rule_generator'],
  };
}

function budgetLiftGoal(campaign = {}) {
  const from = Math.max(0, Math.round(num(campaign.orders)));
  return {
    metric: 'orders',
    from,
    to: Math.max(from + 1, Math.ceil(from * 1.05)),
    deadlineDays: 7,
    hardFloor: Math.max(0, Math.floor(from * 0.75)),
  };
}

function budgetLiftKillSwitch(goal = {}) {
  return {
    metric: 'orders',
    condition: `orders below ${goal.hardFloor} by day 7 while spend rises after budget lift`,
    rollbackIf: `orders below ${goal.hardFloor} by day 7 while spend rises after budget lift`,
  };
}

function computeControlledBudgetLift(currentBudget) {
  const current = num(currentBudget);
  if (current <= 0) return 0;
  if (current <= 1) return 3;
  if (current <= 5) return roundMoney(Math.max(3, Math.min(current + 2, current * 1.35)));
  return roundMoney(Math.min(current * 1.2, current + 8));
}

function buildOverBudgetControlledResult(snapshot, options = {}) {
  const limit = Number(options.limit || 60);
  const rows = snapshot.overBudgetRows || [];
  const skuStateMap = buildSkuStateMap(snapshot);
  const filtered = {
    rows: rows.length,
    notSp: 0,
    notEnabled: 0,
    noCampaign: 0,
    notAllowedSku: 0,
    noOrders: 0,
    lowProfit: 0,
    lowInventory: 0,
    highAcos: 0,
    keptRows: 0,
  };
  const byCampaign = new Map();

  for (const row of rows) {
    if (row.__overBudgetSource !== 'SP') {
      filtered.notSp += 1;
      continue;
    }
    if (!isEnabledState(row.state) || !isEnabledState(row.campaignState) || !isEnabledState(row.groupState)) {
      filtered.notEnabled += 1;
      continue;
    }
    if (!row.campaignId) {
      filtered.noCampaign += 1;
      continue;
    }
    const card = getSkuState(skuStateMap, row.sku);
    if (!card) {
      filtered.notAllowedSku += 1;
      continue;
    }

    const profitRate = effectiveProfitRate(card);
    const invDays = num(card.invDays);
    const orders = num(row.Orders);
    const sales = num(row.Sales);
    const spend = num(row.Spend);
    const acos = sales > 0 ? spend / sales : num(row.ACOS);
    const maxAcos = Math.min(0.22, Math.max(0.12, profitRate * 0.9));

    if (orders <= 0) {
      filtered.noOrders += 1;
      continue;
    }
    if (profitRate < 0.12) {
      filtered.lowProfit += 1;
      continue;
    }
    if (invDays > 0 && invDays < 25) {
      filtered.lowInventory += 1;
      continue;
    }
    if (acos > maxAcos) {
      filtered.highAcos += 1;
      continue;
    }

    filtered.keptRows += 1;
    const key = String(row.campaignId);
    if (!byCampaign.has(key)) {
      byCampaign.set(key, {
        sku: row.sku,
        asin: row.asin,
        campaignId: key,
        adGroupId: String(row.adGroupId || ''),
        campaignName: row.campaignName || '',
        groupName: row.groupName || '',
        currentBudget: num(row.dailyBudget),
        spend: 0,
        sales: 0,
        orders: 0,
        clicks: 0,
        rows: 0,
        profitRate,
        invDays,
        units7: num(card.unitsSold_7d),
        units30: num(card.unitsSold_30d),
        evidence: [],
      });
    }
    const campaign = byCampaign.get(key);
    campaign.spend += spend;
    campaign.sales += sales;
    campaign.orders += orders;
    campaign.clicks += num(row.Clicks);
    campaign.rows += 1;
    campaign.currentBudget = Math.max(campaign.currentBudget, num(row.dailyBudget));
    if (campaign.evidence.length < 3) {
      campaign.evidence.push(`${row.positionType || 'ad'} spend ${spend.toFixed(2)} sales ${sales.toFixed(2)} orders ${orders} ACOS ${(acos * 100).toFixed(1)}%`);
    }
  }

  const campaigns = [...byCampaign.values()]
    .map(campaign => {
      campaign.acos = campaign.sales > 0 ? campaign.spend / campaign.sales : 99;
      campaign.score = campaign.spend * (0.24 - campaign.acos) + campaign.orders * 2 + campaign.profitRate * 20;
      campaign.suggestedBudget = computeControlledBudgetLift(campaign.currentBudget);
      return campaign;
    })
    .filter(campaign => campaign.suggestedBudget > campaign.currentBudget)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const plans = campaigns.map(campaign => {
    const goal = budgetLiftGoal(campaign);
    const killSwitch = budgetLiftKillSwitch(goal);
    return {
      sku: campaign.sku,
      asin: campaign.asin,
      summary: `Over-budget controlled budget lift: ${campaign.campaignName} is still capped while converting. Aggregated ACOS ${(campaign.acos * 100).toFixed(1)}%, orders ${campaign.orders}, profit ${(campaign.profitRate * 100).toFixed(1)}%, inventory days ${campaign.invDays}.`,
      actions: [{
        ...candidateMeta('budget', ['over_budget', 'efficient_conversion', 'controlled_budget_lift']),
        id: campaign.campaignId,
        entityType: 'campaign',
        actionType: 'budget',
        currentBudget: campaign.currentBudget,
        suggestedBudget: campaign.suggestedBudget,
        campaignId: campaign.campaignId,
        adGroupId: campaign.adGroupId,
        campaignName: campaign.campaignName,
        groupName: campaign.groupName,
        reason: `Over-budget campaign is still converting efficiently. Increase budget moderately from ${campaign.currentBudget} to ${campaign.suggestedBudget}, not a broad scale-up. Aggregated over-budget rows: spend ${campaign.spend.toFixed(2)}, sales ${campaign.sales.toFixed(2)}, orders ${campaign.orders}, ACOS ${(campaign.acos * 100).toFixed(1)}%; SKU profit ${(campaign.profitRate * 100).toFixed(1)}%, inventory days ${campaign.invDays}.`,
        evidence: [
          `overBudgetRows=${campaign.rows}`,
          `campaign spend=${campaign.spend.toFixed(2)} sales=${campaign.sales.toFixed(2)} orders=${campaign.orders} ACOS=${(campaign.acos * 100).toFixed(1)}%`,
          `profitRate=${(campaign.profitRate * 100).toFixed(1)}% invDays=${campaign.invDays} units7=${campaign.units7} units30=${campaign.units30}`,
          ...campaign.evidence,
        ],
        confidence: 0.78,
        riskLevel: campaign.currentBudget <= 1 ? 'over_budget_min_budget_repair' : 'over_budget_controlled_budget_up',
        allowLargeBudgetChange: campaign.currentBudget <= 1,
        goal,
        killSwitch,
        reviewPlan: {
          checkAfterDays: [1, 3, 7],
          goal,
          killSwitch,
          rollbackIf: 'orders fall below floor or ACOS leaves SKU profit room after budget lift',
        },
        learning: {
          enabled: true,
          hypothesis: campaign.currentBudget <= 1
            ? 'Campaign was still over budget at the minimum daily budget while converting efficiently; repair to a workable minimum budget and monitor profit.'
            : 'Campaign was over budget and still converting efficiently; a capped budget lift should recover profitable sales without broad expansion.',
          expectedEffect: { impressions: 'up', clicks: 'up', spend: 'up', orders: 'up', acos: 'watch' },
          measurementWindowDays: [1, 3, 7],
          baselineQuality: 'complete',
          baseline: {
            sku: campaign.sku,
            asin: campaign.asin,
            entityType: 'campaign',
            entityId: campaign.campaignId,
            currentBudget: campaign.currentBudget,
            suggestedBudget: campaign.suggestedBudget,
            profitRate: campaign.profitRate,
            invDays: campaign.invDays,
            overBudgetRows: campaign.rows,
            spend: roundMoney(campaign.spend),
            sales: roundMoney(campaign.sales),
            orders: campaign.orders,
            acos: campaign.acos,
          },
        },
      }],
    };
  });

  return {
    plans,
    filtered,
    campaignCandidates: byCampaign.size,
  };
}

function buildOverBudgetControlledPlans(snapshot, options = {}) {
  return buildOverBudgetControlledResult(snapshot, options).plans;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', `today_over_budget_controlled_schema_${new Date().toISOString().slice(0, 10)}.json`);
  const limit = Number(process.argv[4] || process.env.OVER_BUDGET_ACTION_LIMIT || 60);
  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_over_budget_schema.js <snapshot.json> [output.json] [limit]');
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const { plans, filtered, campaignCandidates } = buildOverBudgetControlledResult(snapshot, { limit });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    filtered,
    campaignCandidates,
    plannedSkus: new Set(plans.map(plan => plan.sku)).size,
    plannedActions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    top: plans.slice(0, 20).map(plan => ({
      sku: plan.sku,
      campaign: plan.actions[0].campaignName,
      currentBudget: plan.actions[0].currentBudget,
      suggestedBudget: plan.actions[0].suggestedBudget,
      evidence: plan.actions[0].evidence.slice(1, 3),
    })),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildOverBudgetControlledPlans,
  buildOverBudgetControlledResult,
  computeControlledBudgetLift,
};
