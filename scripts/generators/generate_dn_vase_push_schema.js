const fs = require('fs');
const path = require('path');

const SKUS = ['DN3482', 'DN3049', 'DN2685', 'DN2684', 'DN2683', 'DN2437', 'DN1656', 'DN2108', 'DN1655'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundBid(value) {
  return Number(Math.max(0.05, value).toFixed(2));
}

function isPaused(state) {
  return ['2', 'paused', 'disabled'].includes(String(state).toLowerCase());
}

function isEnabled(state) {
  return ['1', 'enabled', 'enable', 'active'].includes(String(state).toLowerCase());
}

function priceAnchor(card) {
  const price = num(card.price);
  if (price >= 60) return 0.75;
  if (price >= 50) return 0.65;
  if (price >= 40) return 0.55;
  if (price >= 30) return 0.48;
  return 0.4;
}

function collectEntities(card) {
  const rows = [];
  for (const campaign of card.campaigns || []) {
    for (const row of campaign.keywords || []) {
      rows.push({ ...row, entityType: 'keyword', label: row.text || '', campaignName: campaign.name });
    }
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', label: row.text || row.targetType || 'auto', campaignName: campaign.name });
    }
    for (const row of campaign.sponsoredBrands || []) {
      rows.push({ ...row, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword', label: row.text || '', campaignName: campaign.name });
    }
  }
  return rows.filter(row => row.id && row.entityType);
}

function entityScore(row) {
  const s7 = row.stats7d || {};
  const s30 = row.stats30d || {};
  return num(s30.orders) * 100 + num(s7.orders) * 120 + num(s30.clicks) * 2 + num(s30.impressions) / 1000;
}

function generatePlans(snapshot) {
  const plans = [];
  for (const sku of SKUS) {
    const card = (snapshot.productCards || []).find(item => String(item.sku) === sku);
    if (!card) continue;

    const ad30 = card.adStats?.['30d'] || {};
    const cpc30 = num(ad30.clicks) ? num(ad30.spend) / num(ad30.clicks) : 0;
    const baseBid = Math.max(priceAnchor(card), cpc30 * 1.2, num(card.createContext?.recommendedDefaultBid));
    const evidenceBase = [
      `price=${num(card.price)}`,
      `profit=${(num(card.profitRate) * 100).toFixed(1)}%`,
      `invDays=${num(card.invDays)}`,
      `sold30=${num(card.unitsSold_30d)}`,
      `yoy=${num(card.yoyAsinPct || card.yoyUnitsPct)}`,
      `skuCpc30=${cpc30.toFixed(2)}`,
      `baseBid=${baseBid.toFixed(2)}`,
    ];

    const actions = [];
    const rows = collectEntities(card).sort((a, b) => entityScore(b) - entityScore(a));
    for (const row of rows) {
      if (actions.length >= 8) break;
      const bid = num(row.bid);
      const s7 = row.stats7d || {};
      const s30 = row.stats30d || {};
      const orders7 = num(s7.orders);
      const orders30 = num(s30.orders);
      const spend7 = num(s7.spend);
      const spend30 = num(s30.spend);
      const clicks30 = num(s30.clicks);
      const acos7 = num(s7.acos);
      const acos30 = num(s30.acos);
      const evidence = [
        ...evidenceBase,
        `entity=${row.entityType}`,
        `text=${row.label || row.campaignName || ''}`,
        `currentBid=${bid}`,
        `orders7=${orders7}`,
        `orders30=${orders30}`,
        `spend7=${spend7}`,
        `spend30=${spend30}`,
        `clicks30=${clicks30}`,
        `acos7=${acos7}`,
        `acos30=${acos30}`,
      ];

      if (isPaused(row.state)) {
        actions.push({
          id: String(row.id),
          entityType: row.entityType,
          actionType: 'enable',
          reason: 'DN flower bucket/vase group must stay in traffic recovery; re-enable relevant paused traffic.',
          evidence,
          confidence: 0.82,
          riskLevel: 'traffic_push',
          allowLargeBidChange: true,
          actionSource: ['generator_candidate'],
        });
        continue;
      }

      if (!isEnabled(row.state) || !bid) continue;

      const noOrderWaste = (spend7 >= 5 && orders7 === 0 && orders30 === 0) ||
        (spend30 >= 12 && orders30 === 0 && clicks30 >= 20);
      if (noOrderWaste) {
        const next = roundBid(bid * 0.9);
        if (next < bid) {
          actions.push({
            id: String(row.id),
            entityType: row.entityType,
            actionType: 'bid',
            currentBid: bid,
            suggestedBid: next,
            reason: 'DN group overall continues adding traffic, but this object has spend/clicks with no orders; small 10% cut to shift budget to better DN traffic.',
            evidence,
            confidence: 0.78,
            riskLevel: 'efficiency_control',
            actionSource: ['generator_candidate'],
          });
          continue;
        }
      }

      const goodOrNeedsTraffic = orders7 > 0 || orders30 > 0 || clicks30 === 0 || num(s30.impressions) < 1000;
      const maxBid = row.entityType.startsWith('sb') ? 0.65 : 0.9;
      const minNext = Math.min(maxBid, baseBid * (row.entityType.startsWith('sb') ? 0.85 : 1));
      let next = goodOrNeedsTraffic ? Math.max(bid * 1.15, minNext) : bid * 1.08;
      next = roundBid(Math.min(maxBid, next));
      if (next > bid + 0.005) {
        actions.push({
          id: String(row.id),
          entityType: row.entityType,
          actionType: 'bid',
          currentBid: bid,
          suggestedBid: next,
          reason: 'DN flower bucket/vase group is a priority declining inventory group; raise bid to click-capable level based on price and historical CPC.',
          evidence,
          confidence: 0.84,
          riskLevel: 'traffic_push',
          allowLargeBidChange: true,
          actionSource: ['generator_candidate'],
        });
      }
    }

    if (actions.length) {
      plans.push({
        sku,
        asin: card.asin,
        summary: `DN flower bucket/vase traffic push: price $${num(card.price)}, inv ${num(card.invDays)}d, profit ${(num(card.profitRate) * 100).toFixed(1)}%, yoy ${(num(card.yoyAsinPct || card.yoyUnitsPct) * 100).toFixed(1)}%.`,
        actions,
      });
    }
  }
  return plans;
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', 'dn_vase_traffic_push_candidate_schema_2026-04-24.json');
  if (!snapshotFile) throw new Error('Usage: node scripts/generators/generate_dn_vase_push_schema.js <snapshot.json> [output.json]');
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plans = generatePlans(snapshot);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    skus: plans.length,
    actions: plans.reduce((sum, plan) => sum + plan.actions.length, 0),
    top: plans.map(plan => ({
      sku: plan.sku,
      actions: plan.actions.length,
      up: plan.actions.filter(action => action.actionType === 'bid' && action.suggestedBid > action.currentBid).length,
      down: plan.actions.filter(action => action.actionType === 'bid' && action.suggestedBid < action.currentBid).length,
      enable: plan.actions.filter(action => action.actionType === 'enable').length,
      sample: plan.actions.slice(0, 4).map(action => ({ type: action.actionType, entity: action.entityType, current: action.currentBid, next: action.suggestedBid, risk: action.riskLevel })),
    })),
  }, null, 2));
}

module.exports = { generatePlans };

if (require.main === module) main();
