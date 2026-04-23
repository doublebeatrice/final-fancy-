const fs = require('fs');
const path = require('path');

const snapshotFile = process.argv[2];
const outputFile = process.argv[3] || path.join('data', 'snapshots', 'profit_adjust_action_schema_2026-04-23.json');
const limit = Number(process.argv[4] || process.env.ADJUST_ACTION_LIMIT || 180);
const maxActionsPerSku = Number(process.env.MAX_ADJUST_ACTIONS_PER_SKU || 12);

if (!snapshotFile) {
  throw new Error('Usage: node scripts/generators/generate_profit_adjust_schema.js <snapshot.json> [output.json] [limit]');
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundBid(value, min = 0.05) {
  return Number(Math.max(min, value).toFixed(2));
}

function normalizePct(value) {
  const n = num(value);
  if (!n) return 0;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

function isEnabled(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '1' || text === 'enabled' || text === 'enable' || text === 'active';
}

function isPaused(state) {
  const text = String(state ?? '').toLowerCase();
  return text === '2' || text === 'paused' || text === 'disabled';
}

function isQ2(text) {
  return /teacher|appreciation|nurse|medical|lab week|christian|inspir|faith|graduat|summer|beach|pool|swim|luau|tropical|wedding|bridal|bridesmaid|mexican|fiesta|pinata|taco|cactus|baby shower|gender reveal|memorial|mother|father|dad|mom/i.test(text || '');
}

function productText(card) {
  const parts = [card.sku, card.asin, card.note, card.solrTerm];
  for (const campaign of card.campaigns || []) {
    parts.push(campaign.name);
    for (const row of campaign.keywords || []) parts.push(row.text);
    for (const row of campaign.sponsoredBrands || []) parts.push(row.text);
  }
  return parts.filter(Boolean).join(' ');
}

function collectEntities(card) {
  const rows = [];
  for (const campaign of card.campaigns || []) {
    for (const row of campaign.keywords || []) {
      rows.push({ ...row, entityType: 'keyword', label: row.text || '', campaignName: campaign.name });
    }
    for (const row of campaign.autoTargets || []) {
      rows.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', label: row.text || row.targetType || '', campaignName: campaign.name });
    }
    for (const row of campaign.productAds || []) {
      rows.push({ ...row, entityType: 'productAd', label: 'product ad', campaignName: campaign.name });
    }
    if (campaign.sbCampaign?.id) {
      rows.push({ ...campaign.sbCampaign, entityType: 'sbCampaign', label: 'SB campaign', campaignName: campaign.name });
    }
    for (const row of campaign.sponsoredBrands || []) {
      rows.push({ ...row, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword', label: row.text || '', campaignName: campaign.name });
    }
  }
  return rows.filter(row => row.id && row.entityType);
}

function minBid(entityType, row) {
  const name = String(row.campaignName || '').toLowerCase();
  if ((entityType === 'sbKeyword' || entityType === 'sbTarget') && name.includes('sbv')) return 0.25;
  return 0.05;
}

function makeBidAction(row, suggestedBid, reason, evidence, riskLevel = 'low') {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid: num(row.bid),
    suggestedBid,
    reason,
    evidence,
    confidence: 0.78,
    riskLevel,
    actionSource: ['strategy'],
  };
}

function makeStateAction(row, actionType, reason, evidence, riskLevel = 'low') {
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType,
    reason,
    evidence,
    confidence: 0.74,
    riskLevel,
    actionSource: ['strategy'],
  };
}

const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
const plans = [];
let actionCount = 0;
const seen = new Set();

for (const card of snapshot.productCards || []) {
  if (actionCount >= limit) break;
  const profit = num(card.profitRate);
  const invDays = num(card.invDays);
  const sold30 = num(card.unitsSold_30d);
  if (profit < 0.1 || invDays < 20) continue;

  const text = productText(card);
  const q2 = isQ2(text);
  const ad30 = card.adStats?.['30d'] || {};
  const adShareLow = num(card.adDependency) < 0.07 || num(ad30.spend) < Math.max(8, sold30 * 0.4);
  const stuckRisk = invDays >= 90 && sold30 < 30;
  const yoySalesPct = normalizePct(card.yoySalesPct);
  const yoyUnitsPct = normalizePct(card.yoyUnitsPct);
  const yoyDecline = Math.min(yoySalesPct, yoyUnitsPct);
  const yoyDownHard = yoyDecline <= -0.30;
  const yoyDownModerate = yoyDecline <= -0.20;
  const oldProductRecovery = yoyDownModerate && profit >= 0.1 && invDays >= 30;
  const entities = collectEntities(card);
  const actions = [];
  const evidenceBase = [
    `profit=${(profit * 100).toFixed(1)}%`,
    `invDays=${invDays}`,
    `sold30=${sold30}`,
    `q2=${q2}`,
    `adShareLow=${adShareLow}`,
    `stuckRisk=${stuckRisk}`,
    `yoySalesPct=${yoySalesPct}`,
    `yoyUnitsPct=${yoyUnitsPct}`,
    `oldProductRecovery=${oldProductRecovery}`,
  ];

  const ranked = entities
    .map(row => {
      const s7 = row.stats7d || {};
      const s30 = row.stats30d || {};
      const isStateOnly = row.entityType === 'productAd' || row.entityType === 'sbCampaign';
      const score =
        num(s30.orders) * 10 +
        num(s7.orders) * 12 +
        (num(s30.acos) > 0 && num(s30.acos) <= 0.25 ? 12 : 0) +
        (isPaused(row.state) && (q2 || stuckRisk || adShareLow || oldProductRecovery) ? 18 : 0) +
        (isStateOnly && isPaused(row.state) ? 10 : 0) +
        (oldProductRecovery ? 20 : 0) +
        (yoyDownHard ? 12 : 0) +
        (num(s7.spend) > 4 && num(s7.orders) === 0 ? -8 : 0) +
        (num(s7.acos) > 0.35 && !oldProductRecovery ? -7 : 0);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.row);

  for (const row of ranked) {
    if (actionCount + actions.length >= limit) break;
    if (actions.length >= maxActionsPerSku) break;
    const key = `${row.entityType}:${row.id}`;
    if (seen.has(key)) continue;

    const bid = num(row.bid);
    const s7 = row.stats7d || {};
    const s30 = row.stats30d || {};
    const orders7 = num(s7.orders);
    const orders30 = num(s30.orders);
    const spend7 = num(s7.spend);
    const acos7 = num(s7.acos);
    const acos30 = num(s30.acos);
    const clicks30 = num(s30.clicks);
    const impressions30 = num(s30.impressions);
    const min = minBid(row.entityType, row);
    const coverageWeak = clicks30 < 25 || impressions30 < 2500;
    const evidence = [
      ...evidenceBase,
      `entity=${row.entityType}`,
      `bid=${bid}`,
      `orders7=${orders7}`,
      `orders30=${orders30}`,
      `acos7=${acos7}`,
      `acos30=${acos30}`,
      `clicks30=${clicks30}`,
      `impressions30=${impressions30}`,
      `coverageWeak=${coverageWeak}`,
    ];

    if (isPaused(row.state) && (q2 || stuckRisk || adShareLow || oldProductRecovery)) {
      const reason = oldProductRecovery
        ? '同比下滑明显，但SKU仍有利润和库存承接，当前对象暂停会进一步丢失展示，先恢复覆盖观察点击和转化。'
        : '利润/库存可承接，当前对象暂停但SKU需要恢复覆盖，先开启观察有效点击和转化。';
      actions.push(makeStateAction(row, 'enable', reason, evidence, oldProductRecovery ? 'yoy_recovery' : 'coverage_recovery'));
      seen.add(key);
      continue;
    }

    if (row.entityType === 'productAd' || row.entityType === 'sbCampaign') continue;
    if (!isEnabled(row.state) || bid <= 0) continue;

    if ((orders7 >= 1 || orders30 >= 2 || (oldProductRecovery && coverageWeak)) &&
        (acos7 === 0 || acos7 <= 0.28 || acos30 <= 0.28 || oldProductRecovery) &&
        (q2 || adShareLow || stuckRisk || sold30 >= 30 || oldProductRecovery)) {
      const factor = oldProductRecovery ? 1.12 : (sold30 >= 80 || q2 ? 1.12 : 1.08);
      const next = roundBid(bid * factor, min);
      if (next > bid) {
        const reason = oldProductRecovery
          ? '老品同比下滑明显，当前需要优先保展示和点击，在利润与库存可承接前提下小幅加价修复流量。'
          : '利润导向放量：该对象已有订单或ACOS可承接，SKU有库存/节气/老品恢复需求，小幅加价扩大曝光和点击。';
        actions.push(makeBidAction(row, next, reason, evidence, oldProductRecovery ? 'yoy_recovery' : 'profit_scale'));
        seen.add(key);
        continue;
      }
    }

    if (!oldProductRecovery && ((spend7 >= 4 && orders7 === 0) || (acos7 > 0.35 && spend7 >= 3))) {
      const next = roundBid(bid * 0.9, min);
      if (next < bid) {
        actions.push(makeBidAction(row, next, '利润导向控损：近7天消耗偏低效，先降价释放预算给更可能出单的对象。', evidence, 'efficiency_control'));
        seen.add(key);
        continue;
      }
    }

    if (!oldProductRecovery && !q2 && !stuckRisk && spend7 >= 8 && orders7 === 0 && sold30 < 10) {
      actions.push(makeStateAction(row, 'pause', '非Q2重点且近7天明显消耗无订单，先关闭止损，把预算让给有库存利润和节气机会的SKU。', evidence, 'waste_pause'));
      seen.add(key);
    }
  }

  if (actions.length) {
    actionCount += actions.length;
    plans.push({
      sku: card.sku,
      asin: card.asin,
      summary: `KPI利润导向竞价/开关：利润率${(profit * 100).toFixed(1)}%，库存${invDays}天，30天销量${sold30}。`,
      actions,
    });
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(plans, null, 2), 'utf8');
const flat = plans.flatMap(p => p.actions.map(a => ({ sku: p.sku, entityType: a.entityType, actionType: a.actionType })));
console.log(JSON.stringify({
  outputFile,
  plannedSkus: plans.length,
  plannedActions: flat.length,
  counts: flat.reduce((acc, item) => {
    acc[item.actionType] = (acc[item.actionType] || 0) + 1;
    acc[item.entityType] = (acc[item.entityType] || 0) + 1;
    return acc;
  }, {}),
  topSkus: plans.slice(0, 12).map(p => ({ sku: p.sku, actions: p.actions.length, summary: p.summary })),
}, null, 2));
