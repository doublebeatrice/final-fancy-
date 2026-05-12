const { buildProductContexts } = require('../../src/ai_decision');
const fs = require('fs');
const path = require('path');

const snap = JSON.parse(fs.readFileSync('data/snapshots/latest_snapshot.json', 'utf8'));
const rawCards = snap.productCards || [];
const ctx = buildProductContexts(rawCards, {
  keyword: snap.kwRows || [],
  autoTarget: snap.autoRows || [],
  manualTarget: snap.targetRows || [],
  productAd: snap.productAdRows || [],
  sbKeyword: snap.sbRows || [],
  sbCampaign: snap.sbCampaignRows || [],
}, [], [], []);

// Build eligibility lookup from raw cards
const eligibleMap = new Map();
for (const c of rawCards) {
  const status = String(c.saleStatus || '').trim();
  const opendate = String(c.opendate || '').trim();
  const domain = String(c.listingDomain || c.salesChannel || '').toLowerCase();
  const saleOk = status.includes('正常销售') || status.includes('保留页面');
  const launched = !!opendate;
  const site = domain.includes('amazon.com') || domain.includes('amazon.co.uk') || domain === 'us' || domain === 'uk';
  if (saleOk && launched && site) eligibleMap.set(c.sku, { saleStatus: status, listingDomain: domain });
}

const cooldownFiles = ['adjustments_2026-05-04.json', 'adjustments_2026-05-05.json', 'adjustments_2026-05-06.json', 'adjustments_2026-05-09.json', 'adjustments_2026-05-11.json'];
const cooldown = new Set();
for (const f of cooldownFiles) {
  try {
    for (const r of JSON.parse(fs.readFileSync('data/adjustments/' + f, 'utf8'))) {
      // Only cooldown SKUs that had real entity-level execution, not review-only.
      const isReal = !r.dryRun && r.outcome === 'success' && r.actionType !== 'review';
      if (isReal) cooldown.add(r.sku);
    }
  } catch (_) {}
}

function isEligible(p) {
  return eligibleMap.has(p.sku);
}

const stats = {
  total: 0,
  notEligible: 0,
  noAdjustable: 0,
  onCooldown: 0,
  lowActivity: 0,
  eligible: 0,
};
const buckets = {
  bidUp_healthy: [],
  bidDown_badAcos: [],
  bidDown_staleInv: [],
  review_tight_inv: [],
  review_negative_profit: [],
  review_marginal: [],
  no_action_stable: [],
};

for (const p of ctx.products) {
  stats.total++;
  if (!isEligible(p)) { stats.notEligible++; continue; }
  if (!(p.adjustableAds || []).length) { stats.noAdjustable++; continue; }

  const a7 = p.adStats && p.adStats['7d'] ? p.adStats['7d'] : { spend: 0, orders: 0, clicks: 0, acos: 0 };
  const a30 = p.adStats && p.adStats['30d'] ? p.adStats['30d'] : { spend: 0, orders: 0, clicks: 0, acos: 0 };
  const profitRate = Number(p.profitRate) || 0;
  const invDays = Number(p.invDays) || 0;
  const units7 = Number(p.units7) || 0;
  const units30 = Number(p.units30) || 0;

  if (cooldown.has(p.sku)) { stats.onCooldown++; continue; }
  if (a7.spend < 0.5 && a30.spend < 5) { stats.lowActivity++; continue; }
  stats.eligible++;

  const adjustableKw = (p.adjustableAds || []).filter(e =>
    e.entityType === 'keyword' && e.state &&
    e.campaignState === 1 && e.groupState === 1 &&
    !e.onCooldown &&
    Number(e.currentBid) > 0.10 && Number(e.currentBid) < 2.50
  );
  // also auto/manualTarget/sbKeyword
  const adjustableAny = (p.adjustableAds || []).filter(e =>
    ['keyword', 'autoTarget', 'manualTarget', 'sbKeyword'].includes(e.entityType) && e.state &&
    e.campaignState === 1 && e.groupState === 1 &&
    !e.onCooldown &&
    Number(e.currentBid) > 0.10 && Number(e.currentBid) < 2.50
  );

  // 1. BID UP — healthy converting product, room to scale
  if (profitRate >= 0.15 && invDays >= 10 && invDays <= 200 && a7.orders >= 2 && a7.acos > 0 && a7.acos < 0.25) {
    // Try in priority order: keyword w/ order > auto/target/sb w/ order > keyword w/ click > auto/target/sb w/ click
    const withOrder = adjustableAny
      .filter(e => Number(e.stats7d?.orders || 0) >= 1 && Number(e.stats7d?.acos || 0) > 0 && Number(e.stats7d?.acos || 0) < 0.25)
      .sort((a, b) => (b.stats7d.orders || 0) - (a.stats7d.orders || 0));
    let bestEnt = withOrder[0];
    if (!bestEnt) {
      const withClicks = adjustableAny
        .filter(e => Number(e.stats7d?.clicks || 0) >= 3 && (Number(e.stats7d.acos || 0) === 0 || Number(e.stats7d.acos || 0) < 0.30))
        .sort((a, b) => (b.stats7d.clicks || 0) - (a.stats7d.clicks || 0));
      bestEnt = withClicks[0];
    }
    if (bestEnt) {
      buckets.bidUp_healthy.push({ sku: p.sku, asin: p.asin, salesChannel: p.salesChannel, profitRate, invDays, units7, units30, a7, kw: { id: bestEnt.id, text: bestEnt.text, currentBid: bestEnt.currentBid, stats7d: bestEnt.stats7d, matchType: bestEnt.matchType, entityType: bestEnt.entityType } });
      continue;
    }
  }

  // 2. BID DOWN — bad ACOS or click-no-order
  if (a7.spend >= 5 && (a7.acos > 0.50 || (a7.orders === 0 && a7.clicks >= 20))) {
    const worstEnt = adjustableAny
      .filter(e => Number(e.stats7d?.spend || 0) >= 1 && (Number(e.stats7d.acos || 0) > 0.50 || (Number(e.stats7d.orders || 0) === 0 && Number(e.stats7d.clicks || 0) >= 10)))
      .sort((a, b) => (b.stats7d.spend || 0) - (a.stats7d.spend || 0))[0];
    if (worstEnt) {
      buckets.bidDown_badAcos.push({ sku: p.sku, asin: p.asin, salesChannel: p.salesChannel, profitRate, invDays, units7, a7, kw: { id: worstEnt.id, text: worstEnt.text, currentBid: worstEnt.currentBid, stats7d: worstEnt.stats7d, matchType: worstEnt.matchType, entityType: worstEnt.entityType } });
      continue;
    }
  }

  // 3. BID DOWN — stale inventory still spending
  if (invDays >= 300 && a7.spend >= 2) {
    const anyEnt = adjustableAny
      .filter(e => Number(e.stats7d?.spend || 0) >= 0.5)
      .sort((a, b) => (b.stats7d.spend || 0) - (a.stats7d.spend || 0))[0];
    if (anyEnt) {
      buckets.bidDown_staleInv.push({ sku: p.sku, asin: p.asin, salesChannel: p.salesChannel, profitRate, invDays, units7, a7, kw: { id: anyEnt.id, text: anyEnt.text, currentBid: anyEnt.currentBid, stats7d: anyEnt.stats7d, matchType: anyEnt.matchType, entityType: anyEnt.entityType } });
      continue;
    }
  }

  // 4. REVIEW — tight inventory active spend
  if (invDays > 0 && invDays < 10 && a7.spend >= 3) {
    buckets.review_tight_inv.push({ sku: p.sku, invDays, profitRate, units7, a7 });
    continue;
  }

  // 5. REVIEW — negative profit still spending
  if (profitRate < 0 && a7.spend >= 3) {
    buckets.review_negative_profit.push({ sku: p.sku, profitRate, invDays, units7, a7 });
    continue;
  }

  // 6. REVIEW — marginal: spending without orders, but not enough to bid down yet
  if (a7.orders === 0 && a7.spend >= 1 && a7.spend < 5) {
    buckets.review_marginal.push({ sku: p.sku, profitRate, invDays, units7, a7, reason: 'small_spend_no_order' });
    continue;
  }

  // 7. No-action — stable
  buckets.no_action_stable.push({ sku: p.sku, profitRate, invDays, units7, a7 });
}

console.log('stats:', JSON.stringify(stats, null, 2));
console.log('---');
for (const [k, v] of Object.entries(buckets)) console.log(k, ':', v.length);

fs.mkdirSync('data/tmp_tests', { recursive: true });
fs.writeFileSync('data/tmp_tests/claude_scope_2026-05-11.json', JSON.stringify(buckets, null, 2));
console.log('scope written to data/tmp_tests/claude_scope_2026-05-11.json');
