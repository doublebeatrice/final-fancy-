const fs = require('fs');
const path = require('path');

const snapshotFile = process.argv[2] || path.join('data', 'snapshots', 'latest_snapshot.json');
const WATCH_SKUS = ['DN3482', 'DN3049', 'DN2685', 'DN2684', 'DN2683', 'DN2437', 'DN1656', 'DN2108', 'DN1655'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  const n = num(value);
  return `${(n * 100).toFixed(2)}%`;
}

function emptyStats() {
  return { spend: 0, orders: 0, clicks: 0, impressions: 0 };
}

function addStats(acc, stats = {}) {
  acc.spend += num(stats.spend ?? stats.Spend);
  acc.orders += num(stats.orders ?? stats.Orders);
  acc.clicks += num(stats.clicks ?? stats.Clicks);
  acc.impressions += num(stats.impressions ?? stats.Impressions);
}

function finalize(stats, price) {
  const sales = stats.orders * (num(price) || 1);
  return {
    spend: Number(stats.spend.toFixed(2)),
    orders: stats.orders,
    clicks: stats.clicks,
    impressions: stats.impressions,
    acos: sales > 0 ? Number((stats.spend / sales).toFixed(4)) : (stats.spend > 0 ? 99 : 0),
  };
}

const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
const cards = new Map((snapshot.productCards || []).map(card => [String(card.sku || ''), card]));
const invMap = snapshot.invMap || {};

const rows = WATCH_SKUS.map(sku => {
  const card = cards.get(sku) || {};
  const inv = invMap[sku] || {};
  const price = card.price ?? inv.price ?? 0;
  const ad3 = emptyStats();
  const ad7 = emptyStats();
  const ad30 = emptyStats();
  const sb3 = emptyStats();
  const sb7 = emptyStats();
  const sb30 = emptyStats();
  let campaignCount = 0;

  for (const campaign of card.campaigns || []) {
    campaignCount += 1;
    for (const row of campaign.keywords || []) {
      addStats(ad3, row.stats3d);
      addStats(ad7, row.stats7d);
      addStats(ad30, row.stats30d);
    }
    for (const row of campaign.autoTargets || []) {
      addStats(ad3, row.stats3d);
      addStats(ad7, row.stats7d);
      addStats(ad30, row.stats30d);
    }
    for (const row of campaign.productAds || []) {
      addStats(ad3, row.stats3d);
      addStats(ad7, row.stats7d);
      addStats(ad30, row.stats30d);
    }
    if (campaign.sbCampaign) {
      addStats(sb3, campaign.sbCampaign.stats3d);
      addStats(sb7, campaign.sbCampaign.stats7d);
      addStats(sb30, campaign.sbCampaign.stats30d);
    }
    for (const row of campaign.sponsoredBrands || []) {
      addStats(sb3, row.stats3d);
      addStats(sb7, row.stats7d);
      addStats(sb30, row.stats30d);
    }
  }

  const yoy = card.yoyAsinPct ?? inv.yoyAsinPct ?? card.yoyUnitsPct ?? inv.yoyUnitsPct ?? 0;
  const personalSales = card.personalSales || null;
  return {
    sku,
    asin: card.asin || inv.asin || '',
    foundInProductCards: !!card.sku,
    units3: card.unitsSold_3d ?? inv.unitsSold_3d ?? 0,
    units7: card.unitsSold_7d ?? inv.unitsSold_7d ?? 0,
    units30: card.unitsSold_30d ?? inv.unitsSold_30d ?? 0,
    invDays: card.invDays ?? inv.invDays ?? 0,
    yoy: pct(yoy),
    yoyRaw: yoy,
    yoySourceField: card.yoySourceField || inv.yoySourceField || '',
    profitRate: pct(card.profitRate ?? inv.profitRate ?? 0),
    personalSales: personalSales ? {
      sellers: personalSales.sellers || [],
      orderSales: personalSales.orderSales || 0,
      orderQuantity: personalSales.orderQuantity || 0,
      orderCount: personalSales.orderCount || 0,
      refundQuantity: personalSales.refundQuantity || 0,
    } : null,
    campaignCount,
    sp3: finalize(ad3, price),
    sp7: finalize(ad7, price),
    sp30: finalize(ad30, price),
    sb3: finalize(sb3, price),
    sb7: finalize(sb7, price),
    sb30: finalize(sb30, price),
  };
});

console.log(JSON.stringify({
  snapshotFile,
  exportedAt: snapshot.exportedAt || '',
  sellerSalesMeta: snapshot.sellerSalesMeta || {},
  watchSkus: WATCH_SKUS,
  rows,
}, null, 2));
