const fs = require('fs');
const path = require('path');
const { buildSkuStateMap, effectiveProfitRate, getSkuState, isEnabledState, num } = require('../../src/over_budget_policy');

function stat(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend),
    orders: num(s.orders),
    clicks: num(s.clicks),
    impressions: num(s.impressions),
    acos: num(s.acos),
  };
}

function calcAcos(s, price) {
  const sales = s.orders * num(price);
  if (sales > 0) return s.spend / sales;
  return s.spend > 0 ? 99 : 0;
}

function roundBid(value, min = 0.05) {
  return Number(Math.max(min, value).toFixed(2));
}

function entityLabel(row) {
  return String(row.text || row.keywordText || row.targetText || row.targetType || '').trim();
}

function buildOverbudgetAdgroupLowerBidPlans({ snapshot = {}, history = [], limit = 30, businessDate = new Date().toISOString().slice(0, 10) } = {}) {
  const adjusted = new Set(history
    .filter(item => item.date === businessDate)
    .map(item => String(item.entityId || '')));

  const skuStateMap = buildSkuStateMap(snapshot);

  const overBudgetRows = (snapshot.overBudgetRows || []).filter(row =>
    row.__overBudgetSource === 'SP' &&
    isEnabledState(row.state) &&
    isEnabledState(row.campaignState) &&
    isEnabledState(row.groupState)
  );

  const groups = new Map();
  for (const row of overBudgetRows) {
    const key = [row.sku, row.campaignId, row.adGroupId].join('::');
    if (!groups.has(key)) {
      groups.set(key, {
        sku: row.sku,
        asin: row.asin,
        campaignId: String(row.campaignId || ''),
        adGroupId: String(row.adGroupId || ''),
        campaignName: row.campaignName || '',
        groupName: row.groupName || '',
        spend: 0,
        sales: 0,
        orders: 0,
        clicks: 0,
        rows: 0,
        dailyBudget: num(row.dailyBudget),
      });
    }
    const group = groups.get(key);
    group.spend += num(row.Spend);
    group.sales += num(row.Sales);
    group.orders += num(row.Orders);
    group.clicks += num(row.Clicks);
    group.rows += 1;
    group.dailyBudget = Math.max(group.dailyBudget, num(row.dailyBudget));
  }

  const items = [];
  for (const group of groups.values()) {
    const card = getSkuState(skuStateMap, group.sku);
    if (!card) continue;
    group.acos = group.sales > 0 ? group.spend / group.sales : (group.spend > 0 ? 99 : 0);
    const profitRate = effectiveProfitRate(card);
    const campaign = (card.campaigns || []).find(item =>
      String(item.campaignId) === group.campaignId &&
      String(item.adGroupId) === group.adGroupId
    );
    if (!campaign) continue;

    const entities = [];
    for (const row of campaign.keywords || []) entities.push({ ...row, entityType: 'keyword' });
    for (const row of campaign.autoTargets || []) {
      entities.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget' });
    }

    for (const rawEntity of entities) {
      const entity = {
        ...rawEntity,
        campaignId: group.campaignId,
        adGroupId: group.adGroupId,
        campaignName: group.campaignName,
        groupName: group.groupName,
      };
      const entityId = String(entity.id || '');
      if (!entityId || adjusted.has(entityId) || entity.onCooldown || num(entity.bid) <= 0) continue;
      if (!isEnabledState(entity.state)) continue;
      if (!isEnabledState(entity.campaignState ?? campaign.campaignState ?? campaign.state)) continue;
      if (!isEnabledState(entity.groupState ?? campaign.groupState)) continue;

      const s7 = stat(entity, '7d');
      const s30 = stat(entity, '30d');
      const a7 = calcAcos(s7, card.price);
      const a30 = calcAcos(s30, card.price);
      const noOrderWaste = (s7.spend >= 5 && s7.orders === 0 && s7.clicks >= 8) ||
        (s30.spend >= 12 && s30.orders === 0 && s30.clicks >= 20);
      const highAcos = (s7.orders > 0 && s7.spend >= 8 && a7 >= Math.max(0.32, profitRate * 1.8)) ||
        (s30.orders > 0 && s30.spend >= 15 && a30 >= Math.max(0.32, profitRate * 1.8));
      const negativeProfitConverting = profitRate < 0 && (
        (s7.orders > 0 && s7.spend >= 8) ||
        (s30.orders > 0 && s30.spend >= 12)
      );
      const profitPressure = profitRate > 0 &&
        group.acos > profitRate * 1.1 &&
        s30.orders > 0 &&
        s30.spend >= 12 &&
        a30 > profitRate * 1.1;
      const minBudgetProfitPressure = profitRate > 0 &&
        group.dailyBudget <= 1 &&
        group.orders > 0 &&
        group.acos > Math.max(0.45, profitRate * 2) &&
        (
          (s30.orders <= 0 && s30.spend >= 3 && s30.clicks >= 8) ||
          (s30.orders > 0 && s30.spend >= 3 && a30 > Math.max(0.3, profitRate * 1.4))
        );
      if (!noOrderWaste && !highAcos && !negativeProfitConverting && !profitPressure && !minBudgetProfitPressure) continue;

      const reasonType = noOrderWaste
        ? 'no_order_waste'
        : (negativeProfitConverting
          ? 'negative_profit'
          : (profitPressure
            ? 'profit_pressure'
            : (minBudgetProfitPressure ? 'min_budget_profit_pressure' : 'high_acos')));
      const multiplier = noOrderWaste ? 0.88 : (profitPressure ? 0.96 : (minBudgetProfitPressure ? 0.9 : 0.92));
      const nextBid = roundBid(num(entity.bid) * multiplier);
      if (!(nextBid < num(entity.bid))) continue;
      const currentNetProfit = Number(profitRate.toFixed(4));
      const goal = {
        metric: 'netProfit',
        from: currentNetProfit,
        to: Number((currentNetProfit + 0.01).toFixed(4)),
        deadlineDays: 7,
        hardFloor: Number((currentNetProfit - 0.02).toFixed(4)),
      };

      const action = {
        id: entityId,
        entityType: entity.entityType,
        actionType: 'bid',
        currentBid: num(entity.bid),
        suggestedBid: nextBid,
        text: entityLabel(entity),
        label: entityLabel(entity),
        campaignId: group.campaignId,
        adGroupId: group.adGroupId,
        campaignName: group.campaignName,
        groupName: group.groupName,
        reason: [
          `Over-budget ad group lower-layer control: ${reasonType}.`,
          `Campaign="${group.campaignName}", adGroup="${group.groupName}".`,
          `Group spend=${group.spend.toFixed(2)}, orders=${group.orders}, ACOS=${(group.acos * 100).toFixed(1)}%.`,
          `Lower ${entity.entityType} bid ${num(entity.bid)} -> ${nextBid}; campaign budget is unchanged.`,
        ].join(' '),
        evidence: [
          `source=overBudgetRows; scope=adGroup; campaignId=${group.campaignId}; adGroupId=${group.adGroupId}`,
          `overBudgetGroup spend=${group.spend.toFixed(2)} sales=${group.sales.toFixed(2)} orders=${group.orders} clicks=${group.clicks} ACOS=${(group.acos * 100).toFixed(1)}% dailyBudget=${group.dailyBudget}`,
          `SKU ${group.sku}: referenceNetProfit=${(profitRate * 100).toFixed(1)}% rawProfitRate=${(num(card.profitRate) * 100).toFixed(1)}% invDays=${num(card.invDays)} units7=${num(card.unitsSold_7d)} units30=${num(card.unitsSold_30d)}`,
          `${entity.entityType} 7d spend=${s7.spend.toFixed(2)} clicks=${s7.clicks} orders=${s7.orders} ACOS=${a7 === 99 ? 'no_sales' : `${(a7 * 100).toFixed(1)}%`}`,
          `${entity.entityType} 30d spend=${s30.spend.toFixed(2)} clicks=${s30.clicks} orders=${s30.orders} ACOS=${a30 === 99 ? 'no_sales' : `${(a30 * 100).toFixed(1)}%`}`,
        ],
        confidence: 0.86,
        riskLevel: `overbudget_adgroup_${reasonType}_bid_down`,
        source: 'codex_overbudget_adgroup_lower_bid_2026-05-09',
        actionSource: ['codex'],
        decisionStage: 'ai_approved',
        approvedBy: 'codex',
        requiresAiDecision: false,
        allowLargeBidChange: false,
        goal,
        learning: {
          enabled: true,
          hypothesis: 'Trim weak lower-layer object inside an over-budget ad group without changing campaign budget.',
          expectedEffect: { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' },
          measurementWindowDays: [1, 3, 7],
          baselineQuality: 'complete',
          baseline: {
            sku: group.sku,
            asin: group.asin,
            entityType: entity.entityType,
            entityId,
            currentBid: num(entity.bid),
            suggestedBid: nextBid,
            profitRate,
            invDays: num(card.invDays),
            overBudgetGroup: group,
            entityStats7d: s7,
            entityStats30d: s30,
          },
        },
      };
      items.push({
        score: (noOrderWaste ? 100 : 70) + s7.spend + s30.spend / 5 + group.spend / 30,
        sku: group.sku,
        asin: group.asin,
        action,
      });
    }
  }

  items.sort((a, b) => b.score - a.score);
  const selected = items.slice(0, limit);
  const plans = [];
  for (const item of selected) {
    let plan = plans.find(existing => existing.sku === item.sku);
    if (!plan) {
      plan = {
        sku: item.sku,
        asin: item.asin || '',
        summary: `Over-budget ad-group lower-layer adjustments for ${item.sku}: only keyword/target bid changes inside overBudgetRows ad groups; no campaign budget and no SKU-wide close.`,
        actions: [],
      };
      plans.push(plan);
    }
    plan.actions.push(item.action);
  }

  return plans;
}

function main() {
  const snapshotFile = process.argv[2] || path.join('data', 'snapshots', 'latest_snapshot.json');
  const outFile = process.argv[3] || path.join('data', 'snapshots', `today_overbudget_adgroup_lower_bid_approved_${new Date().toISOString().slice(0, 10)}.json`);
  const limit = Number(process.argv[4] || 30);
  const businessDate = process.argv[5] || new Date().toISOString().slice(0, 10);

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const history = fs.existsSync(path.join('data', 'adjustment_history.json'))
    ? JSON.parse(fs.readFileSync(path.join('data', 'adjustment_history.json'), 'utf8'))
    : [];
  const plans = buildOverbudgetAdgroupLowerBidPlans({ snapshot, history, limit, businessDate });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outFile,
    overBudgetEnabledGroups: 'see_generated_schema',
    candidates: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    plannedSkus: plans.length,
    plannedActions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    items: plans.flatMap(plan => plan.actions.map(action => ({
      sku: plan.sku,
      type: action.entityType,
      id: action.id,
      campaign: action.campaignName,
      group: action.groupName,
      current: action.currentBid,
      suggested: action.suggestedBid,
      risk: action.riskLevel,
      evidence: action.evidence.slice(1, 5),
    }))),
  }, null, 2));
}

module.exports = {
  buildOverbudgetAdgroupLowerBidPlans,
};

if (require.main === module) main();
