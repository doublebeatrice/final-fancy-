const fs = require('fs');
const { buildProductContexts } = require('../../src/ai_decision');
const { buildOverBudgetPlanItems } = require('../../src/over_budget_to_actions');

const buckets = JSON.parse(fs.readFileSync('data/tmp_tests/claude_scope_2026-05-11.json', 'utf8'));
const snap = JSON.parse(fs.readFileSync('data/snapshots/latest_snapshot.json', 'utf8'));
const ctx = buildProductContexts(snap.productCards || [], {
  keyword: snap.kwRows || [], autoTarget: snap.autoRows || [], manualTarget: snap.targetRows || [],
  productAd: snap.productAdRows || [], sbKeyword: snap.sbRows || [], sbCampaign: snap.sbCampaignRows || [],
}, [], [], []);

// Yesterday's bidDown SKUs where SKU 7d orders == 0 and spend > 1 — escalate one more step down
const escalate = [];
const adj = JSON.parse(fs.readFileSync('data/adjustments/adjustments_2026-05-11.json', 'utf8'));
const yesterdayBidDown = ['LEM5778', 'CII1754', 'WAR0227'];
for (const sku of yesterdayBidDown) {
  const p = ctx.products.find(p => p.sku === sku);
  if (!p) continue;
  const rec = adj.find(r => r.sku === sku && r.actionType === 'bid' && !r.dryRun && r.outcome === 'success');
  if (!rec) continue;
  const cur = (p.adjustableAds || []).find(e => String(e.id) === String(rec.entityId));
  if (!cur) continue;
  escalate.push({ sku, asin: p.asin, profitRate: p.profitRate, invDays: p.invDays, a7: p.adStats['7d'], kw: cur });
}

const plan = [];

function bidBump(curr, dir) {
  const step = curr <= 0.50 ? 0.01 : curr <= 1.00 ? 0.02 : 0.03;
  const next = dir > 0 ? curr + step : curr - step;
  return Math.max(0.05, Math.round(next * 100) / 100);
}

// FOLLOW-UP ESCALATION — yesterday bid-down with still 0 orders 7d
for (const item of escalate) {
  const newBid = bidBump(item.kw.currentBid, -1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Follow-up bid-down: yesterday's ${item.kw.currentBid} still not converting, step down again.`,
    actions: [{
      entityType: item.kw.entityType,
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `Yesterday lowered to ${item.kw.currentBid}. 7d SKU spend $${item.a7.spend.toFixed(2)} with 0 orders. KW 7d: $${item.kw.stats7d.spend.toFixed(2)}/${item.kw.stats7d.clicks}clk/${item.kw.stats7d.orders}ord. One more micro step down to cut bleed. Inventory ${item.invDays}d — stale or stagnant.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.75,
      evidence: [`escalation_from=2026-05-11`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `sku_7d_orders=${item.a7.orders}`, `kw_7d_spend=${item.kw.stats7d.spend.toFixed(2)}`, `kw_7d_clicks=${item.kw.stats7d.clicks}`, `invDays=${item.invDays}`, `profitRate=${item.profitRate.toFixed(3)}`],
      hypothesis: `A second step-down after 1 day of zero return should reduce burn further without killing residual traffic.`,
      expectedEffect: { clicks: 'down_more', orders: 'watch', acos: 'watch', spend: 'down_more' },
      reviewPlan: { windows: [3, 7], metrics: ['clicks', 'orders', 'acos', 'spend'], escalationPlan: 'if still 0 orders 7d after this second step, pause this entity' },
    }],
  });
}

// 1. Bid UP — healthy converters, micro step
for (const item of buckets.bidUp_healthy) {
  const newBid = bidBump(item.kw.currentBid, +1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Healthy converter micro-up (+${(newBid - item.kw.currentBid).toFixed(2)}). 7d sku ${item.a7.orders}ord ACOS ${(item.a7.acos * 100).toFixed(1)}%, profit ${(item.profitRate * 100).toFixed(1)}%, inv ${item.invDays}d.`,
    actions: [{
      entityType: item.kw.entityType || 'keyword',
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `Healthy ${item.kw.entityType || 'keyword'} "${item.kw.text || '(auto/target)'}" on SKU with 7d ${item.a7.orders}ord/${(item.a7.acos * 100).toFixed(1)}%ACOS, profit ${(item.profitRate * 100).toFixed(1)}%, inv ${item.invDays}d. Entity 7d: ${item.kw.stats7d.clicks}clk/${item.kw.stats7d.orders}ord. Single micro-step up.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.72,
      evidence: [`entity_type=${item.kw.entityType || 'keyword'}`, `entity_text=${item.kw.text || ''}`, `kw_7d_orders=${item.kw.stats7d.orders}`, `kw_7d_clicks=${item.kw.stats7d.clicks}`, `sku_7d_orders=${item.a7.orders}`, `sku_7d_acos=${item.a7.acos.toFixed(3)}`, `profitRate=${item.profitRate.toFixed(3)}`, `invDays=${item.invDays}`],
      hypothesis: `One-step bid raise on a converting entity should sustain or modestly lift orders inside the ${(item.profitRate * 100).toFixed(0)}% profit margin.`,
      expectedEffect: { clicks: 'up_modest', orders: 'up_modest', acos: 'watch_below_25pct', spend: 'up_modest' },
      reviewPlan: { windows: [1, 3, 7], metrics: ['clicks', 'orders', 'acos', 'spend'] },
    }],
  });
}

// 2. Bid DOWN — bad ACOS
for (const item of buckets.bidDown_badAcos) {
  const newBid = bidBump(item.kw.currentBid, -1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Bad ACOS control: ${item.kw.entityType || 'keyword'} bid micro-down.`,
    actions: [{
      entityType: item.kw.entityType || 'keyword',
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `${item.kw.entityType || 'keyword'} "${item.kw.text || ''}" 7d $${item.kw.stats7d.spend.toFixed(2)}/${item.kw.stats7d.clicks}clk/${item.kw.stats7d.orders}ord. SKU 7d $${item.a7.spend.toFixed(2)} with ACOS ${(item.a7.acos === 99 ? 'NA' : (item.a7.acos * 100).toFixed(0) + '%')}. Single step down to control waste without killing all traffic.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.70,
      evidence: [`entity_type=${item.kw.entityType || 'keyword'}`, `kw_7d_spend=${item.kw.stats7d.spend.toFixed(2)}`, `kw_7d_orders=${item.kw.stats7d.orders}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `profitRate=${item.profitRate.toFixed(3)}`, `invDays=${item.invDays}`],
      hypothesis: `Lowering bid one step should reduce burn on high-ACOS or click-no-order traffic while preserving potential residual conversion.`,
      expectedEffect: { clicks: 'down_modest', orders: 'watch', acos: 'down_or_flat', spend: 'down_modest' },
      reviewPlan: { windows: [3, 7], metrics: ['clicks', 'orders', 'acos', 'spend'] },
    }],
  });
}

// 3. Bid DOWN — stale inventory
for (const item of buckets.bidDown_staleInv) {
  const newBid = bidBump(item.kw.currentBid, -1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Stale inventory (${item.invDays}d) cost control.`,
    actions: [{
      entityType: item.kw.entityType || 'keyword',
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `Stale inventory ${item.invDays}d. ${item.kw.entityType || 'keyword'} "${item.kw.text || ''}" 7d $${item.kw.stats7d.spend.toFixed(2)}/${item.kw.stats7d.orders}ord. Single step down to slow burn.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.65,
      evidence: [`entity_type=${item.kw.entityType || 'keyword'}`, `kw_7d_spend=${item.kw.stats7d.spend.toFixed(2)}`, `kw_7d_orders=${item.kw.stats7d.orders}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `profitRate=${item.profitRate.toFixed(3)}`, `invDays=${item.invDays}`],
      hypothesis: `Lower bid on stale inventory reduces ad spend on aged stock without killing residual converting traffic.`,
      expectedEffect: { clicks: 'down_modest', orders: 'watch', acos: 'watch', spend: 'down_modest' },
      reviewPlan: { windows: [3, 7, 14], metrics: ['clicks', 'orders', 'acos', 'spend', 'invDays'] },
    }],
  });
}

// 4. REVIEW — tight inventory + active spend
for (const item of buckets.review_tight_inv) {
  plan.push({
    sku: item.sku,
    summary: `Review: tight inventory (${item.invDays}d) with active 7d spend $${item.a7.spend.toFixed(2)}.`,
    actions: [{
      entityType: 'skuCandidate', actionType: 'review',
      id: `tight-inv::${item.sku}`,
      reason: `Tight inventory ${item.invDays}d, ad 7d $${item.a7.spend.toFixed(2)}/${item.a7.orders}ord. Throttle vs. sell-through decision.`,
      approvedBy: 'claude', decisionStage: 'ai_approved', actionSource: ['claude'],
      requiresAiDecision: false, riskLevel: 'manual_review', confidence: 0.6,
      evidence: [`invDays=${item.invDays}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `sku_7d_orders=${item.a7.orders}`, `profitRate=${item.profitRate.toFixed(3)}`],
    }],
  });
}

// 5. REVIEW — negative profit
for (const item of buckets.review_negative_profit) {
  plan.push({
    sku: item.sku,
    summary: `Review: negative profit (${(item.profitRate * 100).toFixed(1)}%) with active 7d spend $${item.a7.spend.toFixed(2)}.`,
    actions: [{
      entityType: 'skuCandidate', actionType: 'review',
      id: `neg-profit::${item.sku}`,
      reason: `Profit ${(item.profitRate * 100).toFixed(1)}%, 7d ad $${item.a7.spend.toFixed(2)}/${item.a7.orders}ord. Each ad-driven order losing money. Lower bids, pause weak entities, or accept loss for inventory rotation.`,
      approvedBy: 'claude', decisionStage: 'ai_approved', actionSource: ['claude'],
      requiresAiDecision: false, riskLevel: 'manual_review', confidence: 0.7,
      evidence: [`profitRate=${item.profitRate.toFixed(3)}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `sku_7d_orders=${item.a7.orders}`, `invDays=${item.invDays}`, `units7=${item.units7}`],
    }],
  });
}

// 6. REVIEW — marginal
for (const item of buckets.review_marginal) {
  plan.push({
    sku: item.sku,
    summary: `Review: $${item.a7.spend.toFixed(2)} spend, 0 orders 7d.`,
    actions: [{
      entityType: 'skuCandidate', actionType: 'review',
      id: `marginal::${item.sku}`,
      reason: `7d spend $${item.a7.spend.toFixed(2)}, 0 orders, profit ${(item.profitRate * 100).toFixed(1)}%, inv ${item.invDays}d. Below bid-down threshold but leaking.`,
      approvedBy: 'claude', decisionStage: 'ai_approved', actionSource: ['claude'],
      requiresAiDecision: false, riskLevel: 'manual_review', confidence: 0.5,
      evidence: [`profitRate=${item.profitRate.toFixed(3)}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `invDays=${item.invDays}`, `units7=${item.units7}`],
    }],
  });
}

console.log('total plan SKUs:', plan.length);
const counts = { bid_up: 0, bid_down: 0, review: 0 };
for (const item of plan) for (const a of item.actions) {
  if (a.actionType === 'bid' && a.suggestedBid > a.currentBid) counts.bid_up++;
  else if (a.actionType === 'bid' && a.suggestedBid < a.currentBid) counts.bid_down++;
  else counts.review++;
}
console.log('action breakdown:', counts);

const adjForCooldown = JSON.parse(fs.readFileSync('data/adjustments/adjustments_2026-05-11.json', 'utf8'));
const cooldownSkus = new Set();
for (const r of adjForCooldown) {
  if (!r.dryRun && r.outcome === 'success' && r.actionType !== 'review') cooldownSkus.add(r.sku);
}
const overBudget = buildOverBudgetPlanItems(snap, { actor: 'claude', cooldown: cooldownSkus });
console.log('overBudget bucket counts:', overBudget.bucketCounts);
console.log('overBudget plan counts:', overBudget.counts);
const overBudgetCounts = { budget_up: 0, budget_down: 0, pause: 0, review: 0 };
for (const item of overBudget.items) for (const a of item.actions) {
  if (a.actionType === 'budget' && a.suggestedBudget > a.currentBudget) overBudgetCounts.budget_up++;
  else if (a.actionType === 'budget' && a.suggestedBudget < a.currentBudget) overBudgetCounts.budget_down++;
  else if (a.actionType === 'pause') overBudgetCounts.pause++;
  else overBudgetCounts.review++;
}
console.log('overBudget action breakdown:', overBudgetCounts);

const merged = [...plan, ...overBudget.items];
console.log('merged plan items:', merged.length);
fs.writeFileSync('data/snapshots/action_schema_2026-05-12_claude.json', JSON.stringify(merged, null, 2));
console.log('written: data/snapshots/action_schema_2026-05-12_claude.json');
