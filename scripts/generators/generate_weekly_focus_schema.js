const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cleanSku(value) {
  return String(value || '').trim().toUpperCase();
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function isPaused(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '2' || text === 'paused' || text === 'disabled' || text === 'ended';
}

function stats(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend ?? s.Spend),
    sales: num(s.sales ?? s.Sales),
    orders: num(s.orders ?? s.Orders),
    clicks: num(s.clicks ?? s.Clicks),
    impressions: num(s.impressions ?? s.Impressions),
    acos: num(s.acos ?? s.ACOS),
  };
}

function acosFor(s, price) {
  const sales = num(s.sales) || num(s.orders) * num(price);
  if (sales > 0) return num(s.spend) / sales;
  return num(s.spend) > 0 ? 99 : 0;
}

function addStats(target, s) {
  target.spend += num(s.spend);
  target.sales += num(s.sales);
  target.orders += num(s.orders);
  target.clicks += num(s.clicks);
  target.impressions += num(s.impressions);
}

function campaignStats(campaign, key, price) {
  const out = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, acos: 0 };
  const groups = [
    campaign.keywords || [],
    campaign.autoTargets || [],
    campaign.productAds || [],
    campaign.sponsoredBrands || [],
  ];
  for (const rows of groups) {
    for (const row of rows) addStats(out, stats(row, key));
  }
  out.acos = acosFor(out, price);
  return out;
}

function adStats(card, key) {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function ageDays(card) {
  const raw = card.opendate || card.fuldate;
  const t = Date.parse(String(raw || '').slice(0, 10));
  if (!Number.isFinite(t)) return 9999;
  return Math.floor((Date.parse(process.env.AD_OPS_CURRENT_DATE || '2026-04-29') - t) / 86400000);
}

function textForSeason(card) {
  return [
    card.sku,
    card.productName,
    card.solrTerm,
    card.note,
    card.listing?.title,
    JSON.stringify(card.productProfile || {}),
  ].join(' ').toLowerCase();
}

function isHolidayOld(card) {
  return /(mother|mom|mothers|graduation|graduate|teacher|nurse|cinco|mexican|fiesta|taco|summer|beach|pool|patriotic|memorial|father|dad|bridal|wedding|party|bbq|garden|cowboy|hat|easter|spring)/i.test(textForSeason(card));
}

function cardScore(card, sjYoy) {
  const yoy = num(card.yoyAsinPct ?? card.yoyUnitsPct);
  const sold30 = num(card.unitsSold_30d);
  const prev = yoy > -0.95 ? sold30 / (1 + yoy) : sold30 * 2;
  const target = prev * (1 + sjYoy);
  const surplus = Math.max(0, sold30 - target);
  const gap = Math.max(0, target - sold30);
  const holiday = isHolidayOld(card);
  return (holiday ? 120 : 0) + surplus * 2 + gap + num(card.unitsSold_7d) * 3 + num(card.profitRate) * 100;
}

function hasInventory(card) {
  const sell3 = num(card.sellableDays_3d);
  const sell7 = num(card.sellableDays_7d);
  const sell30 = num(card.sellableDays_30d || card.invDays);
  if (sell3 > 0 && sell3 <= 7) return false;
  if (sell7 > 0 && sell7 <= 10) return false;
  if (sell30 > 0 && sell30 <= 21) return false;
  return sell30 >= 21 && num(card.fulFillable ?? card.stockFul) >= 20;
}

function entityLabel(row) {
  return String(row.text || row.keywordText || row.targetText || row.targetingExpression || row.asin || '').trim();
}

function makeEvidence(card, line) {
  return [
    `SKU ${card.sku}: sellable days 3/7/30=${num(card.sellableDays_3d).toFixed(0)}/${num(card.sellableDays_7d).toFixed(0)}/${num(card.sellableDays_30d || card.invDays).toFixed(0)}, units 3/7/30=${num(card.unitsSold_3d).toFixed(0)}/${num(card.unitsSold_7d).toFixed(0)}/${num(card.unitsSold_30d).toFixed(0)}, profit rate ${(num(card.profitRate) * 100).toFixed(1)}%`,
    line,
  ];
}

const GENERATED_ACTION_META = {
  decisionStage: 'candidate',
  candidateSource: 'rule_generator',
  requiresAiDecision: true,
  approvedBy: null,
  actionSource: ['generator_candidate', 'rule_generator'],
};

function makeBidAction(card, campaign, row, entityType, suggestedBid, riskLevel, why) {
  return {
    id: String(row.id),
    entityType,
    actionType: 'bid',
    currentBid: num(row.bid),
    suggestedBid,
    text: entityLabel(row),
    label: entityLabel(row),
    campaignName: campaign.name || campaign.campaignName || '',
    groupName: campaign.groupName || campaign.adGroupName || campaign.name || '',
    campaignId: String(campaign.campaignId || ''),
    adGroupId: String(campaign.adGroupId || ''),
    reason: why,
    evidence: makeEvidence(card, `${entityType} "${entityLabel(row)}" in campaign "${campaign.name || campaign.campaignName || ''}" has 30d ${stats(row, '30d').clicks.toFixed(0)} clicks / ${stats(row, '30d').orders.toFixed(0)} orders / spend ${stats(row, '30d').spend.toFixed(2)}.`),
    confidence: 0.82,
    riskLevel,
    ...GENERATED_ACTION_META,
  };
}

function makeBudgetAction(card, campaign, suggestedBudget, why) {
  const c30 = campaignStats(campaign, '30d', card.price);
  return {
    id: String(campaign.campaignId || ''),
    entityType: 'campaign',
    actionType: 'budget',
    currentBudget: num(campaign.budget),
    suggestedBudget,
    campaignName: campaign.name || campaign.campaignName || '',
    groupName: campaign.groupName || campaign.adGroupName || campaign.name || '',
    campaignId: String(campaign.campaignId || ''),
    adGroupId: String(campaign.adGroupId || ''),
    reason: why,
    evidence: makeEvidence(card, `Campaign "${campaign.name || campaign.campaignName || ''}" 30d spend ${c30.spend.toFixed(2)} / clicks ${c30.clicks.toFixed(0)} / orders ${c30.orders.toFixed(0)} / ACOS ${c30.acos.toFixed(4)}; budget ${num(campaign.budget).toFixed(2)} -> ${suggestedBudget.toFixed(2)}.`),
    confidence: 0.8,
    riskLevel: 'weekly_focus_budget_scale',
    ...GENERATED_ACTION_META,
  };
}

function rowEnabled(row, campaign) {
  if (!isEnabled(row.state)) return false;
  if (campaign.state !== undefined && campaign.state !== '' && !isEnabled(campaign.state)) return false;
  if (campaign.campaignState !== undefined && campaign.campaignState !== '' && !isEnabled(campaign.campaignState)) return false;
  if (campaign.groupState !== undefined && campaign.groupState !== '' && !isEnabled(campaign.groupState)) return false;
  return true;
}

function collectRowActions(card, campaign) {
  const actions = [];
  const price = num(card.price);
  const groups = [
    ['keyword', campaign.keywords || []],
    ['autoTarget', (campaign.autoTargets || []).filter(row => row.targetType !== 'manual')],
    ['manualTarget', (campaign.autoTargets || []).filter(row => row.targetType === 'manual')],
    ['sbKeyword', campaign.sponsoredBrands || []],
  ];

  for (const [entityType, rows] of groups) {
    for (const row of rows) {
      if (!row?.id || row.onCooldown || !rowEnabled(row, campaign) || num(row.bid) <= 0) continue;
      const s7 = stats(row, '7d');
      const s30 = stats(row, '30d');
      const a30 = acosFor(s30, price);
      const a7 = acosFor(s7, price);
      const proven = s30.orders >= 2 && a30 > 0 && a30 <= 0.18;
      const recent = s7.orders >= 1 && a7 > 0 && a7 <= 0.16;
      if (!proven && !recent) continue;
      const lift = num(card.unitsSold_30d) >= 100 ? 1.12 : 1.1;
      const min = entityType === 'sbKeyword' && /sbv|video/i.test(campaign.name || '') ? 0.25 : 0.05;
      const next = Number(Math.max(min, num(row.bid) * lift).toFixed(2));
      if (next <= num(row.bid)) continue;
      actions.push({
        score: s30.orders * 8 + s7.orders * 10 - a30 * 15,
        action: makeBidAction(
          card,
          campaign,
          row,
          entityType,
          next,
          'weekly_focus_proven_traffic',
          `This week I am adding traffic only where the SKU can still carry inventory and this ad entry has already converted. This is a small bid lift on a proven path, not a broad SKU-wide push.`
        ),
      });
    }
  }
  return actions;
}

function generatePlans(snapshot, options = {}) {
  const sjYoy = num(options.sjYoy ?? process.env.SJ_YOY_TARGET, -0.2443);
  const maxActions = num(options.limit ?? process.env.WEEKLY_FOCUS_LIMIT, 30) || 30;
  const maxPerSku = num(options.maxPerSku ?? process.env.WEEKLY_FOCUS_MAX_PER_SKU, 2) || 2;
  const allowed = analyzeAllowedOperationScope(snapshot).allowedSkuSet;
  const plans = [];

  for (const card of snapshot.productCards || []) {
    const sku = cleanSku(card.sku);
    if (!allowed.has(sku)) continue;
    if (ageDays(card) < 180 || num(card.unitsSold_30d) <= 0) continue;
    if (num(card.profitRate) < 0.12 || !hasInventory(card)) continue;

    const yoy = num(card.yoyAsinPct ?? card.yoyUnitsPct);
    const holiday = isHolidayOld(card);
    const rising = yoy > 0;
    const declineButFocus = holiday && yoy < sjYoy;
    if (!holiday && !rising) continue;
    if (!rising && !declineButFocus) continue;

    const skuAd7 = adStats(card, '7d');
    const skuAd30 = adStats(card, '30d');
    const rowCandidates = [];
    for (const campaign of card.campaigns || []) {
      const campaignId = String(campaign.campaignId || '');
      if (!campaignId || isPaused(campaign.state || campaign.campaignState)) continue;

      const c30 = campaignStats(campaign, '30d', card.price);
      if (num(campaign.budget) > 0 && num(campaign.budget) <= 8 && c30.orders >= 4 && c30.acos > 0 && c30.acos <= 0.2) {
        const lift = num(card.unitsSold_30d) >= 100 ? 1.15 : 1.2;
        const next = Number(Math.min(10, Math.max(num(campaign.budget) + 0.5, num(campaign.budget) * lift)).toFixed(2));
        if (next > num(campaign.budget)) {
          rowCandidates.push({
            score: 90 + c30.orders * 5 - c30.acos * 20,
            action: makeBudgetAction(
              card,
              campaign,
              next,
              `This campaign is already producing orders at controlled cost, and the SKU is either in the current holiday lane or clearly rising YoY. I am raising budget moderately so the proven campaign is less likely to cap out this week.`
            ),
          });
        }
      }
      rowCandidates.push(...collectRowActions(card, campaign));
    }

    rowCandidates.sort((a, b) => b.score - a.score);
    const actions = rowCandidates.slice(0, maxPerSku).map(item => item.action);
    if (!actions.length) continue;
    plans.push({
      score: cardScore(card, sjYoy),
      sku: card.sku,
      asin: card.asin || '',
      summary: `Weekly focus: ${holiday ? 'holiday old product' : 'rising old product'} with sellable inventory and acceptable profit. Actions are limited to proven campaigns or proven ad entries.`,
      actions,
      diagnostic: {
        yoy,
        holiday,
        rising,
        units3: num(card.unitsSold_3d),
        units7: num(card.unitsSold_7d),
        units30: num(card.unitsSold_30d),
        sellableDays3: num(card.sellableDays_3d),
        sellableDays7: num(card.sellableDays_7d),
        sellableDays30: num(card.sellableDays_30d || card.invDays),
        profitRate: num(card.profitRate),
        ad7: skuAd7,
        ad30: skuAd30,
      },
    });
  }

  plans.sort((a, b) => b.score - a.score);
  const out = [];
  let count = 0;
  for (const plan of plans) {
    if (count >= maxActions) break;
    const actions = plan.actions.slice(0, maxActions - count);
    if (!actions.length) continue;
    out.push({ ...plan, actions });
    count += actions.length;
  }
  return out;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', `weekly_focus_action_schema_${new Date().toISOString().slice(0, 10)}.json`);
  const limit = process.argv[4] ? Number(process.argv[4]) : undefined;
  if (!snapshotFile) throw new Error('Usage: node scripts/generators/generate_weekly_focus_schema.js <snapshot.json> [output.json] [limit]');
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plans = generatePlans(snapshot, { limit });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  const flat = plans.flatMap(plan => plan.actions.map(action => ({ sku: plan.sku, actionType: action.actionType, entityType: action.entityType, riskLevel: action.riskLevel })));
  console.log(JSON.stringify({
    outputFile,
    plannedSkus: plans.length,
    plannedActions: flat.length,
    counts: flat.reduce((acc, item) => {
      acc[item.actionType] = (acc[item.actionType] || 0) + 1;
      acc[item.entityType] = (acc[item.entityType] || 0) + 1;
      acc[item.riskLevel] = (acc[item.riskLevel] || 0) + 1;
      return acc;
    }, {}),
    topSkus: plans.slice(0, 20).map(plan => ({
      sku: plan.sku,
      actions: plan.actions.length,
      yoy: plan.diagnostic.yoy,
      units: `${plan.diagnostic.units3}/${plan.diagnostic.units7}/${plan.diagnostic.units30}`,
      sellable: `${plan.diagnostic.sellableDays3}/${plan.diagnostic.sellableDays7}/${plan.diagnostic.sellableDays30}`,
      profitRate: plan.diagnostic.profitRate,
    })),
  }, null, 2));
}

module.exports = { generatePlans };

if (require.main === module) main();
