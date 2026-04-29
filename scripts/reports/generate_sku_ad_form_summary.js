const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'data', 'snapshots', 'realtime_pre_action_snapshot_2026-04-28.json');

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    snapshot: DEFAULT_SNAPSHOT,
    skus: [],
    out: '',
    limit: 0,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--snapshot') options.snapshot = args[++i];
    else if (arg === '--sku' || arg === '--skus') {
      options.skus.push(...String(args[++i] || '').split(/[,\s]+/).filter(Boolean));
    } else if (arg === '--out') options.out = args[++i];
    else if (arg === '--limit') options.limit = Number(args[++i] || options.limit);
  }
  options.snapshot = path.resolve(ROOT, options.snapshot);
  options.skus = [...new Set(options.skus.map(sku => String(sku).trim().toUpperCase()).filter(Boolean))];
  if (!options.out) {
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = options.skus.length ? options.skus.join('_') : 'all_allowed_skus';
    options.out = path.join(ROOT, 'data', 'snapshots', `sku_ad_form_summary_${suffix}_${stamp}.json`);
  } else {
    options.out = path.resolve(ROOT, options.out);
  }
  return options;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function emptyStats() {
  return { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
}

function readStats(row, windowKey) {
  const stats = row?.[`stats${windowKey}`] || {};
  return {
    spend: num(stats.spend ?? stats.Spend),
    sales: num(stats.sales ?? stats.Sales),
    orders: num(stats.orders ?? stats.Orders),
    clicks: num(stats.clicks ?? stats.Clicks),
    impressions: num(stats.impressions ?? stats.Impressions),
  };
}

function addStats(acc, stats) {
  acc.spend += num(stats.spend);
  acc.sales += num(stats.sales);
  acc.orders += num(stats.orders);
  acc.clicks += num(stats.clicks);
  acc.impressions += num(stats.impressions);
}

function finalizeStats(stats, price) {
  const sales = num(stats.sales) || (num(stats.orders) * num(price));
  return {
    spend: round(stats.spend),
    sales: round(sales),
    orders: round(stats.orders, 0),
    clicks: round(stats.clicks, 0),
    impressions: round(stats.impressions, 0),
    ctr: stats.impressions > 0 ? round(stats.clicks / stats.impressions, 4) : 0,
    cpc: stats.clicks > 0 ? round(stats.spend / stats.clicks, 4) : 0,
    acos: sales > 0 ? round(stats.spend / sales, 4) : (stats.spend > 0 ? 99 : 0),
    conversionRate: stats.clicks > 0 ? round(stats.orders / stats.clicks, 4) : 0,
  };
}

function shortEntity(row, entityType, campaignName) {
  const s7 = readStats(row, '7d');
  const s30 = readStats(row, '30d');
  return {
    entityType,
    id: String(row.id || row.keywordId || row.targetId || row.campaignId || row.adId || ''),
    text: String(row.text || row.keywordText || row.targetText || row.label || '').slice(0, 120),
    campaignName: String(row.campaignName || campaignName || '').slice(0, 160),
    bid: row.bid != null ? num(row.bid) : null,
    budget: row.budget != null ? num(row.budget) : null,
    state: row.state ?? row.campaignState ?? '',
    updatedAt: row.updatedAt || row.updated_at || row.manualAdjustTheTime || '',
    s7: finalizeStats(s7, 0),
    s30: finalizeStats(s30, 0),
  };
}

function collectEntities(card) {
  const entities = [];
  for (const campaign of card.campaigns || []) {
    const campaignName = campaign.name || campaign.campaignName || '';
    for (const row of campaign.keywords || []) entities.push(shortEntity(row, 'spKeyword', campaignName));
    for (const row of campaign.autoTargets || []) entities.push(shortEntity(row, row.targetType === 'manual' ? 'spManualTarget' : 'spAutoTarget', campaignName));
    for (const row of campaign.productAds || []) entities.push(shortEntity(row, 'spProductAd', campaignName));
    if (campaign.sbCampaign?.id || campaign.sbCampaign?.campaignId) entities.push(shortEntity(campaign.sbCampaign, 'sbCampaign', campaignName));
    for (const row of campaign.sponsoredBrands || []) {
      const type = row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword';
      entities.push(shortEntity(row, type, campaignName));
    }
  }
  return entities.filter(row => row.id || row.campaignName);
}

function summarizeType(rows, price) {
  const totals = { '3d': emptyStats(), '7d': emptyStats(), '30d': emptyStats() };
  for (const row of rows) {
    addStats(totals['3d'], readStats(row.raw || row, '3d'));
    addStats(totals['7d'], readStats(row.raw || row, '7d'));
    addStats(totals['30d'], readStats(row.raw || row, '30d'));
  }
  return {
    total: rows.length,
    enabled: rows.filter(row => isEnabled(row.state)).length,
    paused: rows.filter(row => !isEnabled(row.state)).length,
    s3: finalizeStats(totals['3d'], price),
    s7: finalizeStats(totals['7d'], price),
    s30: finalizeStats(totals['30d'], price),
  };
}

function collectRawByType(card) {
  const byType = {
    spKeyword: [],
    spAutoTarget: [],
    spManualTarget: [],
    spProductAd: [],
    sbCampaign: [],
    sbKeyword: [],
    sbTarget: [],
  };
  for (const campaign of card.campaigns || []) {
    const campaignName = campaign.name || campaign.campaignName || '';
    for (const row of campaign.keywords || []) byType.spKeyword.push({ ...row, campaignName });
    for (const row of campaign.autoTargets || []) byType[row.targetType === 'manual' ? 'spManualTarget' : 'spAutoTarget'].push({ ...row, campaignName });
    for (const row of campaign.productAds || []) byType.spProductAd.push({ ...row, campaignName });
    if (campaign.sbCampaign?.id || campaign.sbCampaign?.campaignId) byType.sbCampaign.push({ ...campaign.sbCampaign, campaignName });
    for (const row of campaign.sponsoredBrands || []) byType[row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword'].push({ ...row, campaignName });
  }
  return byType;
}

function rankWaste(entities) {
  return entities
    .filter(row => row.s30.spend >= 2 && row.s30.orders === 0)
    .sort((a, b) => b.s30.spend - a.s30.spend)
    .slice(0, 8);
}

function rankWinners(entities) {
  return entities
    .filter(row => row.s30.orders > 0 && row.s30.acos > 0 && row.s30.acos <= 0.2)
    .sort((a, b) => (b.s30.orders - a.s30.orders) || (a.s30.acos - b.s30.acos))
    .slice(0, 8);
}

function diagnose(card, formSummary, entities) {
  const sp30 = ['spKeyword', 'spAutoTarget', 'spManualTarget', 'spProductAd']
    .map(type => formSummary[type]?.s30 || emptyStats())
    .reduce((acc, stats) => {
      acc.spend += stats.spend;
      acc.orders += stats.orders;
      acc.clicks += stats.clicks;
      acc.impressions += stats.impressions;
      return acc;
    }, emptyStats());
  const sb30 = ['sbCampaign', 'sbKeyword', 'sbTarget']
    .map(type => formSummary[type]?.s30 || emptyStats())
    .reduce((acc, stats) => {
      acc.spend += stats.spend;
      acc.orders += stats.orders;
      acc.clicks += stats.clicks;
      acc.impressions += stats.impressions;
      return acc;
    }, emptyStats());
  const winners = rankWinners(entities);
  const waste = rankWaste(entities);
  const enabledEntities = entities.filter(row => isEnabled(row.state));
  const clicks30 = sp30.clicks + sb30.clicks;
  const impressions30 = sp30.impressions + sb30.impressions;
  const orders30 = sp30.orders + sb30.orders;
  const diagnosis = [];
  if (impressions30 < 2000 || clicks30 < 40) diagnosis.push('traffic_shortage');
  if (clicks30 >= 40 && orders30 === 0) diagnosis.push('conversion_shortage');
  if (waste.length >= 2) diagnosis.push('waste_spread');
  if (enabledEntities.length <= 2 && impressions30 < 3000) diagnosis.push('coverage_too_thin');
  if (num(card.yoyAsinPct ?? card.yoyUnitsPct) < -0.2 && impressions30 < 5000) diagnosis.push('yoy_down_lacking_exposure');
  if (!diagnosis.length) diagnosis.push('mixed_or_watch');
  return diagnosis;
}

function summarizeCard(card) {
  const price = num(card.price);
  const rawByType = collectRawByType(card);
  const entities = collectEntities(card);
  const formSummary = {};
  for (const [type, rows] of Object.entries(rawByType)) {
    formSummary[type] = summarizeType(rows, price);
  }
  return {
    sku: card.sku,
    asin: card.asin || '',
    price,
    inventory: {
      invDays: num(card.invDays),
      sellableDays3: num(card.sellableDays_3d),
      sellableDays7: num(card.sellableDays_7d),
      sellableDays30: num(card.sellableDays_30d || card.invDays),
      sellableDaysFulRes: [
        num(card.sellableDaysFulRes_3d || card.sellableDays_3d),
        num(card.sellableDaysFulRes_7d || card.sellableDays_7d),
        num(card.sellableDaysFulRes_30d || card.sellableDays_30d || card.invDays),
      ],
      sellableDaysAirFulRes: [
        num(card.sellableDaysAirFulRes_3d),
        num(card.sellableDaysAirFulRes_7d),
        num(card.sellableDaysAirFulRes_30d),
      ],
      sellableDaysInbFulRes: [
        num(card.sellableDaysInbFulRes_3d),
        num(card.sellableDaysInbFulRes_7d),
        num(card.sellableDaysInbFulRes_30d),
      ],
      sellableDaysInbFulResPlan: [
        num(card.sellableDaysInbFulResPlan_3d),
        num(card.sellableDaysInbFulResPlan_7d),
        num(card.sellableDaysInbFulResPlan_30d),
      ],
      fulfillable: num(card.fulFillable),
      reserved: num(card.reserved),
      inbAir: num(card.stockInbAir),
      inb: num(card.stockInb),
      plan: num(card.stockPlan),
      units3: num(card.unitsSold_3d),
      units7: num(card.unitsSold_7d),
      units30: num(card.unitsSold_30d),
      profitRate: round(card.profitRate, 4),
      yoyAsinPct: round(card.yoyAsinPct ?? card.yoyUnitsPct, 4),
      yoySourceField: card.yoySourceField || '',
    },
    campaignCount: (card.campaigns || []).length,
    adForms: formSummary,
    diagnosis: diagnose(card, formSummary, entities),
    topWaste: rankWaste(entities),
    topWinners: rankWinners(entities),
  };
}

function scoreCard(card) {
  const invDays = num(card.sellableDays_30d || card.invDays);
  const sellable7 = num(card.sellableDays_7d);
  const sellable3 = num(card.sellableDays_3d);
  const fulfillable = num(card.fulFillable);
  const yoy = num(card.yoyAsinPct ?? card.yoyUnitsPct);
  const spend3 = num(card.adStats?.['3d']?.spend) + num(card.sbStats?.['3d']?.spend);
  const orders3 = num(card.adStats?.['3d']?.orders) + num(card.sbStats?.['3d']?.orders);
  let score = 0;
  if (fulfillable > 20 && invDays > 60) score += 4;
  if ((sellable3 > 0 && sellable3 <= 10) || (sellable7 > 0 && sellable7 <= 14)) score += 2;
  if (yoy < -0.2) score += 4;
  if (spend3 > 2 && orders3 === 0) score += 4;
  if (num(card.unitsSold_30d) > 0) score += 2;
  return score;
}

function main() {
  const options = parseArgs(process.argv);
  const snapshot = JSON.parse(fs.readFileSync(options.snapshot, 'utf8'));
  let cards = snapshot.productCards || [];
  if (options.skus.length) {
    const wanted = new Set(options.skus);
    cards = cards.filter(card => wanted.has(String(card.sku || '').toUpperCase()));
  } else {
    const scope = analyzeAllowedOperationScope(snapshot);
    cards = cards.filter(card => scope.allowedSkuSet.has(String(card.sku || '').toUpperCase()));
    cards = cards
      .map(card => ({ card, score: scoreCard(card) }))
      .sort((a, b) => b.score - a.score || String(a.card.sku || '').localeCompare(String(b.card.sku || '')))
      .map(item => item.card);
    if (options.limit > 0) cards = cards.slice(0, options.limit);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    snapshotFile: options.snapshot,
    snapshotExportedAt: snapshot.exportedAt || '',
    requestedSkus: options.skus,
    skuCount: cards.length,
    rows: cards.map(summarizeCard),
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile: options.out,
    skuCount: report.skuCount,
    sample: report.rows.slice(0, 3).map(row => ({
      sku: row.sku,
      diagnosis: row.diagnosis,
      campaignCount: row.campaignCount,
      forms: Object.fromEntries(Object.entries(row.adForms).map(([k, v]) => [k, { total: v.total, enabled: v.enabled, spend30: v.s30.spend, orders30: v.s30.orders }])),
      topWaste: row.topWaste.slice(0, 2).map(item => ({ type: item.entityType, id: item.id, text: item.text, spend30: item.s30.spend, orders30: item.s30.orders })),
      topWinners: row.topWinners.slice(0, 2).map(item => ({ type: item.entityType, id: item.id, text: item.text, spend30: item.s30.spend, orders30: item.s30.orders, acos30: item.s30.acos })),
    })),
  }, null, 2));
}

main();
