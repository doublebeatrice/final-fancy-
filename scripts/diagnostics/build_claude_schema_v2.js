const fs = require('fs');
const buckets = JSON.parse(fs.readFileSync('data/tmp_tests/claude_scope_2026-05-11.json', 'utf8'));

const plan = [];

// Helper: bid bump within +/-5%, clamped to one cent or one half-step
function bidBump(curr, dir) {
  const step = curr <= 0.50 ? 0.01 : curr <= 1.00 ? 0.02 : 0.03;
  const next = dir > 0 ? curr + step : curr - step;
  return Math.max(0.05, Math.round(next * 100) / 100);
}

// 1. Bid UP — healthy converters, micro step
for (const item of buckets.bidUp_healthy) {
  const newBid = bidBump(item.kw.currentBid, +1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Healthy converter bid micro-up (+${(newBid - item.kw.currentBid).toFixed(2)}). 7d kw ${item.kw.stats7d.orders}ord ACOS ${(item.kw.stats7d.acos * 100).toFixed(1)}%, profit ${(item.profitRate * 100).toFixed(1)}%, inv ${item.invDays}d.`,
    actions: [{
      entityType: 'keyword',
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `Healthy converting keyword "${item.kw.text}". 7d: ${item.kw.stats7d.clicks}clk/${item.kw.stats7d.orders}ord/${(item.kw.stats7d.acos * 100).toFixed(1)}%ACOS, well inside ${(item.profitRate * 100).toFixed(1)}% profit. SKU 7d ${item.a7.orders}ord/${(item.a7.acos * 100).toFixed(0)}%ACOS, inv ${item.invDays}d. Single micro-step.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.72,
      evidence: [
        `kw_text=${item.kw.text}`,
        `kw_7d_orders=${item.kw.stats7d.orders}`,
        `kw_7d_acos=${item.kw.stats7d.acos.toFixed(3)}`,
        `kw_7d_clicks=${item.kw.stats7d.clicks}`,
        `sku_7d_orders=${item.a7.orders}`,
        `sku_7d_acos=${item.a7.acos.toFixed(3)}`,
        `profitRate=${item.profitRate.toFixed(3)}`,
        `invDays=${item.invDays}`,
      ],
      hypothesis: `One-step bid raise on a converting keyword should sustain or modestly lift orders without breaking the ${(item.profitRate * 100).toFixed(0)}% profit margin.`,
      expectedEffect: { clicks: 'up_modest', orders: 'up_modest', acos: 'watch_below_25pct', spend: 'up_modest' },
      reviewPlan: { windows: [1, 3, 7], metrics: ['clicks', 'orders', 'acos', 'spend'] },
    }],
  });
}

// 2. Bid DOWN — stale inventory still spending
for (const item of buckets.bidDown_staleInv) {
  const newBid = bidBump(item.kw.currentBid, -1);
  plan.push({
    sku: item.sku,
    asin: item.asin,
    summary: `Stale inventory (${item.invDays}d) cost control: bid micro-down on top-spend keyword.`,
    actions: [{
      entityType: 'keyword',
      actionType: 'bid',
      id: item.kw.id,
      currentBid: item.kw.currentBid,
      suggestedBid: newBid,
      reason: `Stale inventory ${item.invDays} days. Keyword "${item.kw.text}" still spending $${item.kw.stats7d.spend.toFixed(2)} 7d with ${item.kw.stats7d.orders} orders. Single micro-step down to slow burn without killing remaining converting traffic.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      canAutoExecute: true,
      riskLevel: 'low',
      confidence: 0.65,
      evidence: [
        `kw_text=${item.kw.text}`,
        `kw_7d_spend=${item.kw.stats7d.spend.toFixed(2)}`,
        `kw_7d_orders=${item.kw.stats7d.orders}`,
        `sku_7d_spend=${item.a7.spend.toFixed(2)}`,
        `profitRate=${item.profitRate.toFixed(3)}`,
        `invDays=${item.invDays}`,
      ],
      hypothesis: `Lowering bid by one step on a stale-inventory SKU should reduce daily ad spend on already-old stock without immediately killing residual converting traffic.`,
      expectedEffect: { clicks: 'down_modest', orders: 'watch', acos: 'down_or_flat', spend: 'down_modest' },
      reviewPlan: { windows: [3, 7, 14], metrics: ['clicks', 'orders', 'acos', 'spend', 'invDays'] },
    }],
  });
}

// 3. REVIEW — tight inventory + active spend (don't auto-act, just record concern)
for (const item of buckets.review_tight_inv) {
  plan.push({
    sku: item.sku,
    summary: `Review: tight inventory (${item.invDays}d) with active 7d spend $${item.a7.spend.toFixed(2)}.`,
    actions: [{
      entityType: 'skuCandidate',
      actionType: 'review',
      id: `tight-inv::${item.sku}`,
      reason: `Tight inventory ${item.invDays} days but ad still spending $${item.a7.spend.toFixed(2)} 7d (${item.a7.orders}ord). Decision needs human eye on whether to throttle ads to extend stock or push sell-through.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      riskLevel: 'manual_review',
      confidence: 0.6,
      evidence: [`invDays=${item.invDays}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `sku_7d_orders=${item.a7.orders}`, `profitRate=${item.profitRate.toFixed(3)}`],
    }],
  });
}

// 4. REVIEW — negative profit + active spend
for (const item of buckets.review_negative_profit) {
  plan.push({
    sku: item.sku,
    summary: `Review: negative profit (${(item.profitRate * 100).toFixed(1)}%) with active 7d spend $${item.a7.spend.toFixed(2)}.`,
    actions: [{
      entityType: 'skuCandidate',
      actionType: 'review',
      id: `neg-profit::${item.sku}`,
      reason: `Profit rate ${(item.profitRate * 100).toFixed(1)}% with 7d ad spend $${item.a7.spend.toFixed(2)} and ${item.a7.orders} orders. Each ad-driven order is losing money. Needs decision: lower bids, pause low-converting entities, or accept loss for inventory rotation reasons.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      riskLevel: 'manual_review',
      confidence: 0.7,
      evidence: [`profitRate=${item.profitRate.toFixed(3)}`, `sku_7d_spend=${item.a7.spend.toFixed(2)}`, `sku_7d_orders=${item.a7.orders}`, `invDays=${item.invDays}`, `units7=${item.units7}`],
    }],
  });
}

// 5. REVIEW — marginal: small spend no orders
for (const item of buckets.review_marginal) {
  plan.push({
    sku: item.sku,
    summary: `Review: $${item.a7.spend.toFixed(2)} spend with 0 orders 7d.`,
    actions: [{
      entityType: 'skuCandidate',
      actionType: 'review',
      id: `marginal::${item.sku}`,
      reason: `7d spend $${item.a7.spend.toFixed(2)} with 0 orders, profit ${(item.profitRate * 100).toFixed(1)}%, inv ${item.invDays}d. Below the bid-down threshold, but still leaking. If continues for another cycle, pause weakest entity.`,
      approvedBy: 'claude',
      decisionStage: 'ai_approved',
      actionSource: ['claude'],
      requiresAiDecision: false,
      riskLevel: 'manual_review',
      confidence: 0.5,
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
fs.writeFileSync('data/snapshots/action_schema_2026-05-11_claude_v2.json', JSON.stringify(plan, null, 2));
console.log('written: data/snapshots/action_schema_2026-05-11_claude_v2.json');
