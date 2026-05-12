const fs = require('fs');
const path = require('path');
const {
  assessOverBudgetAdjustmentObjective,
  assessSeasonalSellThroughOpportunity,
  buildSkuStateMap,
  computeSeasonalBudgetLift,
  computeSeasonalCloseMatchBid,
  getSkuState,
  isEnabledState,
  num,
} = require('../../src/over_budget_policy');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function adGroupKey(campaignId, adGroupId) {
  return `${String(campaignId || '')}::${String(adGroupId || '')}`;
}

function actionApproval(source) {
  return {
    source,
    actionSource: ['codex'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    requiresAiDecision: false,
  };
}

function aggregateOverBudgetGroups(snapshot = {}) {
  const groups = new Map();
  for (const row of snapshot.overBudgetRows || []) {
    if (row.__overBudgetSource !== 'SP') continue;
    if (!isEnabledState(row.state) || !isEnabledState(row.campaignState) || !isEnabledState(row.groupState)) continue;
    const key = adGroupKey(row.campaignId, row.adGroupId);
    if (!groups.has(key)) {
      groups.set(key, {
        sku: row.sku,
        asin: row.asin,
        campaignId: String(row.campaignId || ''),
        adGroupId: String(row.adGroupId || ''),
        adId: String(row.adId || ''),
        accountId: String(row.accountId || ''),
        campaignName: row.campaignName || '',
        groupName: row.groupName || '',
        currentBudget: num(row.dailyBudget),
        spend: 0,
        sales: 0,
        orders: 0,
        clicks: 0,
        rows: 0,
        positionTypes: new Set(),
        evidence: [],
      });
    }
    const group = groups.get(key);
    group.currentBudget = Math.max(group.currentBudget, num(row.dailyBudget));
    group.spend += num(row.Spend);
    group.sales += num(row.Sales);
    group.orders += num(row.Orders);
    group.clicks += num(row.Clicks);
    group.rows += 1;
    group.positionTypes.add(row.positionType || 'unknown');
    if (group.evidence.length < 4) {
      const rowAcos = num(row.Sales) > 0 ? num(row.Spend) / num(row.Sales) : num(row.ACOS);
      group.evidence.push(`${row.positionType || 'ad'} spend ${num(row.Spend).toFixed(2)} sales ${num(row.Sales).toFixed(2)} orders ${num(row.Orders)} ACOS ${(rowAcos * 100).toFixed(1)}%`);
    }
  }
  for (const group of groups.values()) {
    group.acos = group.sales > 0 ? group.spend / group.sales : 99;
    group.positionTypes = [...group.positionTypes];
  }
  return groups;
}

function buildReportMap(adGroupReports = []) {
  const map = new Map();
  for (const report of adGroupReports || []) {
    if (!report) continue;
    map.set(adGroupKey(report.campaignId, report.adGroupId), report);
  }
  return map;
}

function isCloseMatchAutoTarget(row = {}) {
  const text = String(row.type || row.targetType || row.text || row.keywordText || '').toLowerCase();
  return text.includes('queryhighrelmatches') || text.includes('close-match') || text.includes('close match');
}

function buildCloseMatchBidAction({ group, card, report, currentDate }) {
  const rows = (report?.targetRows || [])
    .filter(row => isCloseMatchAutoTarget(row))
    .filter(row => isEnabledState(row.state))
    .filter(row => isEnabledState(row.campaignState ?? group.campaignState ?? 1))
    .filter(row => isEnabledState(row.groupState ?? group.groupState ?? 1))
    .map(row => {
      const spend = num(row.Spend);
      const sales = num(row.Sales);
      return {
        row,
        id: String(row.targetId || row.id || ''),
        currentBid: num(row.bid),
        spend,
        sales,
        orders: num(row.Orders),
        clicks: num(row.Clicks),
        acos: sales > 0 ? spend / sales : num(row.ACOS),
      };
    })
    .filter(item => item.id && item.currentBid > 0 && item.orders > 0 && item.acos > 0 && item.acos <= 0.25)
    .sort((a, b) => (b.orders - a.orders) || (b.spend - a.spend));

  const selected = rows[0];
  if (!selected) return null;
  const nextBid = computeSeasonalCloseMatchBid(selected.currentBid);
  if (!(nextBid > selected.currentBid)) return null;

  return {
    id: selected.id,
    entityType: 'autoTarget',
    actionType: 'bid',
    currentBid: selected.currentBid,
    suggestedBid: nextBid,
    text: selected.row.type || selected.row.targetType || 'Close match',
    label: selected.row.type || selected.row.targetType || 'Close match',
    campaignId: group.campaignId,
    adGroupId: group.adGroupId,
    campaignName: group.campaignName,
    groupName: group.groupName,
    reason: `Over-budget profit-max adjustment: Close match is carrying live seasonal demand. Increase close-match bid ${selected.currentBid} -> ${nextBid}; this is based on product seasonality, ad-layer quality, and profit/inventory tradeoff, not a requirement to clear the over-budget board.`,
    evidence: [
      `source=overBudgetRows+adGroupFetch; objective=profit_max_adjustment; mustClearOverBudget=false; currentDate=${currentDate.toISOString().slice(0, 10)}`,
      `overBudgetGroup spend=${group.spend.toFixed(2)} sales=${group.sales.toFixed(2)} orders=${group.orders} clicks=${group.clicks} ACOS=${(group.acos * 100).toFixed(1)}% dailyBudget=${group.currentBudget}`,
      `SKU ${group.sku}: profitRate=${(num(card.profitRate) * 100).toFixed(1)}% invDays=${num(card.invDays)} absoluteInventory=${num(card.fulFillable) + num(card.reserved) + num(card.stockFul) + num(card.stockRes)} units7=${num(card.unitsSold_7d)} units30=${num(card.unitsSold_30d)}`,
      `closeMatch target=${selected.id} spend=${selected.spend.toFixed(2)} sales=${selected.sales.toFixed(2)} orders=${selected.orders} clicks=${selected.clicks} ACOS=${(selected.acos * 100).toFixed(1)}%`,
    ],
    confidence: 0.86,
    riskLevel: 'seasonal_overbudget_close_match_bid_up',
    allowLargeBidChange: false,
    ...actionApproval('codex_overbudget_seasonal_sellthrough_2026-05-09'),
    learning: {
      enabled: true,
      hypothesis: 'Close-match seasonal demand is still converting; a small bid lift should capture sell-through before the seasonal window closes.',
      expectedEffect: { impressions: 'up', clicks: 'up', spend: 'up', orders: 'up', acos: 'watch' },
      measurementWindowDays: [1, 3, 7],
      baselineQuality: 'complete',
      baseline: {
        sku: group.sku,
        asin: group.asin,
        entityType: 'autoTarget',
        entityId: selected.id,
        currentBid: selected.currentBid,
        suggestedBid: nextBid,
        overBudgetGroup: group,
      },
    },
  };
}

function buildSeasonalSellThroughPlans({ snapshot = {}, adGroupReports = [], currentDate = new Date(), limit = Infinity } = {}) {
  const skuStateMap = buildSkuStateMap(snapshot);
  const groups = aggregateOverBudgetGroups(snapshot);
  const reportMap = buildReportMap(adGroupReports);
  const plans = [];

  for (const group of groups.values()) {
    const card = getSkuState(skuStateMap, group.sku);
    if (!card) continue;

    const decision = assessSeasonalSellThroughOpportunity({ card, group, currentDate });
    if (!decision.shouldLift) continue;
    const objective = assessOverBudgetAdjustmentObjective({ card, group, currentDate });

    const suggestedBudget = computeSeasonalBudgetLift(group.currentBudget);
    const actions = [];
    if (suggestedBudget > group.currentBudget) {
      actions.push({
        id: group.campaignId,
        entityType: 'campaign',
        actionType: 'budget',
        currentBudget: group.currentBudget,
        suggestedBudget,
        campaignId: group.campaignId,
        adGroupId: group.adGroupId,
        campaignName: group.campaignName,
        groupName: group.groupName,
        reason: `Over-budget profit-max adjustment: live seasonal demand is still converting and absolute inventory is high. Increase campaign daily budget ${group.currentBudget} -> ${suggestedBudget}; this is controlled sell-through based on product/ad/profit evidence, not a requirement to clear over-budget to zero.`,
        evidence: [
          `source=overBudgetRows; objective=${objective.objective}; primaryAction=${objective.primaryAction}; mustClearOverBudget=${objective.mustClearOverBudget}; reasonCode=${decision.reasonCode}`,
          `overBudgetGroup spend=${group.spend.toFixed(2)} sales=${group.sales.toFixed(2)} orders=${group.orders} clicks=${group.clicks} ACOS=${(group.acos * 100).toFixed(1)}% dailyBudget=${group.currentBudget}`,
          `SKU ${group.sku}: profitRate=${(num(card.profitRate) * 100).toFixed(1)}% invDays=${num(card.invDays)} absoluteInventory=${decision.absoluteInventory} units7=${num(card.unitsSold_7d)} units30=${num(card.unitsSold_30d)}`,
          ...group.evidence,
        ],
        confidence: 0.84,
        riskLevel: 'seasonal_overbudget_sell_through_budget_up',
        allowLargeBudgetChange: false,
        ...actionApproval('codex_overbudget_seasonal_sellthrough_2026-05-09'),
        learning: {
          enabled: true,
          hypothesis: 'Seasonal product has live demand and high absolute inventory; a small budget lift should prevent capped sell-through before the demand window closes.',
          expectedEffect: { impressions: 'up', clicks: 'up', spend: 'up', orders: 'up', acos: 'watch' },
          measurementWindowDays: [1, 3, 7],
          baselineQuality: 'complete',
          baseline: {
            sku: group.sku,
            asin: group.asin,
            entityType: 'campaign',
            entityId: group.campaignId,
            currentBudget: group.currentBudget,
            suggestedBudget,
            overBudgetGroup: group,
          },
        },
      });
    }

    const bidAction = buildCloseMatchBidAction({
      group,
      card,
      report: reportMap.get(adGroupKey(group.campaignId, group.adGroupId)),
      currentDate,
    });
    if (bidAction) actions.push(bidAction);

    if (!actions.length) continue;
    plans.push({
      sku: group.sku,
      asin: group.asin || card.asin || '',
      summary: `Over-budget profit-max adjustment for ${group.sku}: live seasonal demand, high absolute inventory, controlled budget and close-match bid moves only; over-budget itself is a review trigger, not a zero-clear target.`,
      actions,
    });
    if (plans.reduce((sum, plan) => sum + plan.actions.length, 0) >= limit) break;
  }

  return plans;
}

function loadAdGroupReports(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => /^ad_group_rows_.*\.json$/i.test(name))
    .map(name => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

function main() {
  const snapshotFile = process.argv[2];
  const outFile = process.argv[3] || path.join('data', 'snapshots', `today_overbudget_seasonal_sellthrough_approved_${new Date().toISOString().slice(0, 10)}.json`);
  const reportDir = process.argv[4] || path.join('data', 'snapshots');
  const limit = Number(process.argv[5] || 80);
  if (!snapshotFile) {
    throw new Error('Usage: node scripts/execute/generate_overbudget_seasonal_sellthrough_schema.js <snapshot.json> [out.json] [adGroupReportDir=data/snapshots] [limit]');
  }

  const snapshot = readJson(snapshotFile, {});
  const adGroupReports = loadAdGroupReports(reportDir);
  const plans = buildSeasonalSellThroughPlans({ snapshot, adGroupReports, currentDate: new Date(), limit });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outFile,
    adGroupReports: adGroupReports.length,
    plannedSkus: plans.length,
    plannedActions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    items: plans.flatMap(plan => plan.actions.map(action => ({
      sku: plan.sku,
      type: `${action.entityType}:${action.actionType}`,
      id: action.id,
      campaign: action.campaignName,
      current: action.currentBudget ?? action.currentBid,
      suggested: action.suggestedBudget ?? action.suggestedBid,
      risk: action.riskLevel,
    }))).slice(0, 40),
  }, null, 2));
}

module.exports = {
  buildSeasonalSellThroughPlans,
  loadAdGroupReports,
};

if (require.main === module) main();
