const fs = require('fs');
const path = require('path');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isEnabled(value) {
  const text = String(value ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
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

function classifyProfitTradeoff({ profitRate, invDays, units7, units30, orders, spend, sales, acos }) {
  if (invDays >= 180 && units30 <= 3) {
    return {
      category: 'long_term_clearance_candidate',
      note: 'Long-term profit risk is inventory carrying cost; ad waste should be cut and SKU should be considered for timed batch clearance.',
    };
  }
  if (invDays >= 120 && units30 > 3 && orders > 0 && acos < 0.45) {
    return {
      category: 'sell_through_protect',
      note: 'Inventory is stale but still moving; preserve sales path and only cut clearly wasteful traffic.',
    };
  }
  if (orders <= 0 && spend >= 5) {
    return {
      category: 'no_conversion_waste',
      note: 'Short-term spend has produced clicks but no orders; cut this traffic before it consumes more capped budget.',
    };
  }
  if (profitRate < 0 && invDays < 120) {
    return {
      category: 'short_term_loss_control',
      note: 'SKU is losing money without a strong long-term inventory reason to keep buying the same traffic.',
    };
  }
  if (orders > 0 && acos >= 0.45) {
    return {
      category: 'trial_traffic_reduce',
      note: 'Traffic has conversion signal but cost is too high; reduce exposure instead of fully stopping demand discovery.',
    };
  }
  if (invDays >= 120) {
    return {
      category: 'stale_inventory_controlled_sell_through',
      note: 'Balance long-term inventory cost against ad efficiency; reduce only the capped inefficient receiver.',
    };
  }
  return {
    category: 'controlled_efficiency_trim',
    note: 'Reduce inefficient capped traffic while leaving room for better-performing campaigns.',
  };
}

function recentEntityIds(history, date) {
  const ids = new Set();
  for (const item of history || []) {
    if (item?.date === date && item.entityId) ids.add(String(item.entityId));
  }
  return ids;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', `today_over_budget_bad_conversion_schema_${new Date().toISOString().slice(0, 10)}.json`);
  const limit = Number(process.argv[4] || process.env.OVER_BUDGET_BAD_ACTION_LIMIT || 80);
  const businessDate = process.argv[5] || new Date().toISOString().slice(0, 10);
  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_over_budget_bad_conversion_schema.js <snapshot.json> [output.json] [limit] [businessDate]');
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const rows = snapshot.overBudgetRows || [];
  const cards = snapshot.productCards || [];
  const cardBySku = new Map(cards.map(card => [String(card.sku || ''), card]));
  const alreadyAdjusted = recentEntityIds(readJson(path.join('data', 'adjustment_history.json'), []), businessDate);
  const filtered = {
    rows: rows.length,
    notSp: 0,
    notEnabled: 0,
    notAllowedSku: 0,
    alreadyAdjusted: 0,
    longTermSellThroughHold: 0,
    keptPauseRows: 0,
    keptBudgetRows: 0,
  };

  const pausePlans = [];
  const campaignMap = new Map();
  const touchedEntities = new Set();

  for (const row of rows) {
    if (row.__overBudgetSource !== 'SP') {
      filtered.notSp += 1;
      continue;
    }
    if (!isEnabled(row.state) || !isEnabled(row.campaignState) || !isEnabled(row.groupState)) {
      filtered.notEnabled += 1;
      continue;
    }
    const card = cardBySku.get(String(row.sku || ''));
    if (!card) {
      filtered.notAllowedSku += 1;
      continue;
    }

    const adId = String(row.adId || '');
    const campaignId = String(row.campaignId || '');
    if ((adId && alreadyAdjusted.has(adId)) || (campaignId && alreadyAdjusted.has(campaignId))) {
      filtered.alreadyAdjusted += 1;
      continue;
    }

    const profitRate = num(card.profitRate);
    const invDays = num(card.invDays);
    const spend = num(row.Spend);
    const sales = num(row.Sales);
    const orders = num(row.Orders);
    const clicks = num(row.Clicks);
    const acos = sales > 0 ? spend / sales : num(row.ACOS);
    const maxAcos = Math.max(0.25, profitRate * 1.25);
    const staleInventory = invDays >= 120;
    const longTermSellThroughCandidate = staleInventory && orders > 0;
    const severeWaste = orders <= 0 || acos >= 0.45;

    if (adId && orders <= 0 && spend >= 5 && clicks >= 8 && !touchedEntities.has(adId)) {
      const tradeoff = classifyProfitTradeoff({
        profitRate,
        invDays,
        units7: num(card.unitsSold_7d),
        units30: num(card.unitsSold_30d),
        orders,
        spend,
        sales,
        acos,
      });
      filtered.keptPauseRows += 1;
      touchedEntities.add(adId);
      pausePlans.push({
        sku: row.sku,
        asin: row.asin,
        score: spend + clicks * 0.2 + (profitRate < 0 ? 10 : 0),
        summary: `Over-budget bad conversion pause: product ad in ${row.campaignName || campaignId} spent ${spend.toFixed(2)} with ${clicks} clicks and 0 orders.`,
        actions: [{
          ...candidateMeta('pause', ['over_budget', 'bad_conversion', 'zero_orders']),
          id: adId,
          entityType: 'productAd',
          actionType: 'pause',
          campaignId,
          adGroupId: String(row.adGroupId || ''),
          campaignName: row.campaignName || '',
          groupName: row.groupName || '',
          reason: `Over-budget product ad is consuming budget without conversion. Pause product ad ${adId}: spend ${spend.toFixed(2)}, clicks ${clicks}, orders 0; SKU profit ${(profitRate * 100).toFixed(1)}%, inventory days ${invDays}. Profit tradeoff: ${tradeoff.note}`,
          evidence: [
            `overBudgetSource=SP productAd=${adId}`,
            `spend=${spend.toFixed(2)} clicks=${clicks} orders=${orders} sales=${sales.toFixed(2)} ACOS=${sales > 0 ? (acos * 100).toFixed(1) + '%' : 'no sales'}`,
            `profitRate=${(profitRate * 100).toFixed(1)}% invDays=${invDays} units7=${num(card.unitsSold_7d)} units30=${num(card.unitsSold_30d)}`,
            `profitTradeoff=${tradeoff.category}: ${tradeoff.note}`,
          ],
          profitTradeoffCategory: tradeoff.category,
          profitTradeoffNote: tradeoff.note,
          confidence: 0.82,
          riskLevel: 'over_budget_no_order_pause',
        }],
      });
      continue;
    }

    if (longTermSellThroughCandidate && !severeWaste) {
      filtered.longTermSellThroughHold += 1;
      continue;
    }

    const needsBudgetDown = campaignId && spend >= 8 && (
      (profitRate < 0 && !longTermSellThroughCandidate) ||
      (orders > 0 && acos > maxAcos) ||
      (orders <= 0 && spend >= 10)
    );
    if (!needsBudgetDown) continue;

    if (!campaignMap.has(campaignId)) {
      campaignMap.set(campaignId, {
        sku: row.sku,
        asin: row.asin,
        campaignId,
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
        tradeoffSamples: [],
        evidence: [],
      });
    }
    const campaign = campaignMap.get(campaignId);
    campaign.currentBudget = Math.max(campaign.currentBudget, num(row.dailyBudget));
    campaign.spend += spend;
    campaign.sales += sales;
    campaign.orders += orders;
    campaign.clicks += clicks;
    campaign.rows += 1;
    if (campaign.evidence.length < 3) {
      campaign.evidence.push(`${row.positionType || 'ad'} spend ${spend.toFixed(2)} sales ${sales.toFixed(2)} orders ${orders} ACOS ${sales > 0 ? (acos * 100).toFixed(1) + '%' : 'no sales'}`);
    }
    if (campaign.tradeoffSamples.length < 3) {
      campaign.tradeoffSamples.push(classifyProfitTradeoff({
        profitRate,
        invDays,
        units7: num(card.unitsSold_7d),
        units30: num(card.unitsSold_30d),
        orders,
        spend,
        sales,
        acos,
      }));
    }
  }

  const budgetPlans = [...campaignMap.values()]
    .filter(campaign => campaign.currentBudget > 1 && !touchedEntities.has(campaign.campaignId))
    .map(campaign => {
      campaign.acos = campaign.sales > 0 ? campaign.spend / campaign.sales : 99;
      campaign.score = campaign.spend + Math.max(0, campaign.acos - 0.25) * 50 + (campaign.profitRate < 0 ? 20 : 0);
      campaign.suggestedBudget = roundMoney(Math.max(1, campaign.currentBudget * 0.82));
      if (campaign.currentBudget <= 5) campaign.suggestedBudget = roundMoney(Math.max(1, campaign.currentBudget - 1));
      campaign.tradeoff = classifyProfitTradeoff({
        profitRate: campaign.profitRate,
        invDays: campaign.invDays,
        units7: campaign.units7,
        units30: campaign.units30,
        orders: campaign.orders,
        spend: campaign.spend,
        sales: campaign.sales,
        acos: campaign.sales > 0 ? campaign.spend / campaign.sales : 99,
      });
      return campaign;
    })
    .filter(campaign => campaign.suggestedBudget < campaign.currentBudget)
    .sort((a, b) => b.score - a.score)
    .map(campaign => {
      filtered.keptBudgetRows += campaign.rows;
      return {
        sku: campaign.sku,
        asin: campaign.asin,
        score: campaign.score,
        summary: `Over-budget bad conversion budget down: ${campaign.campaignName} has inefficient spend while capped.`,
        actions: [{
          ...candidateMeta('budget', ['over_budget', 'bad_conversion', 'budget_receiver_inefficient']),
          id: campaign.campaignId,
          entityType: 'campaign',
          actionType: 'budget',
          currentBudget: campaign.currentBudget,
          suggestedBudget: campaign.suggestedBudget,
          campaignId: campaign.campaignId,
          adGroupId: campaign.adGroupId,
          campaignName: campaign.campaignName,
          groupName: campaign.groupName,
          reason: `Over-budget campaign is not a good budget receiver. Reduce daily budget from ${campaign.currentBudget} to ${campaign.suggestedBudget}: spend ${campaign.spend.toFixed(2)}, sales ${campaign.sales.toFixed(2)}, orders ${campaign.orders}, ACOS ${campaign.sales > 0 ? (campaign.acos * 100).toFixed(1) + '%' : 'no sales'}; SKU profit ${(campaign.profitRate * 100).toFixed(1)}%, inventory days ${campaign.invDays}. Profit tradeoff: ${campaign.tradeoff.note}`,
          evidence: [
            `overBudgetRows=${campaign.rows}`,
            `campaign spend=${campaign.spend.toFixed(2)} sales=${campaign.sales.toFixed(2)} orders=${campaign.orders} ACOS=${campaign.sales > 0 ? (campaign.acos * 100).toFixed(1) + '%' : 'no sales'}`,
            `profitRate=${(campaign.profitRate * 100).toFixed(1)}% invDays=${campaign.invDays} units7=${campaign.units7} units30=${campaign.units30}`,
            `profitTradeoff=${campaign.tradeoff.category}: ${campaign.tradeoff.note}`,
            ...campaign.evidence,
          ],
          profitTradeoffCategory: campaign.tradeoff.category,
          profitTradeoffNote: campaign.tradeoff.note,
          confidence: 0.78,
          riskLevel: 'over_budget_bad_conversion_budget_down',
          allowLargeBudgetChange: false,
        }],
      };
    });

  const sortedPausePlans = pausePlans.sort((a, b) => b.score - a.score);
  const sortedBudgetPlans = budgetPlans.sort((a, b) => b.score - a.score);
  const pauseLimit = Math.min(sortedPausePlans.length, Math.max(12, Math.floor(limit * 0.35)));
  const selectedPlans = [
    ...sortedPausePlans.slice(0, pauseLimit),
    ...sortedBudgetPlans.slice(0, Math.max(0, limit - pauseLimit)),
  ];
  const plans = selectedPlans.map(({ score, ...plan }) => plan);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    filtered,
    campaignCandidates: campaignMap.size,
    plannedSkus: new Set(plans.map(plan => plan.sku)).size,
    plannedActions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    counts: plans.reduce((acc, plan) => {
      for (const action of plan.actions) {
        acc[action.actionType] = (acc[action.actionType] || 0) + 1;
        acc[action.entityType] = (acc[action.entityType] || 0) + 1;
      }
      return acc;
    }, {}),
    top: plans.slice(0, 20).map(plan => ({
      sku: plan.sku,
      type: `${plan.actions[0].actionType}:${plan.actions[0].entityType}`,
      entity: plan.actions[0].campaignName || plan.actions[0].id,
      currentBudget: plan.actions[0].currentBudget,
      suggestedBudget: plan.actions[0].suggestedBudget,
      evidence: plan.actions[0].evidence.slice(1, 3),
    })),
  }, null, 2));
}

if (require.main === module) {
  main();
}
