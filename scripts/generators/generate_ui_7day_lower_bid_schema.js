const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanSku(value) {
  return text(value).toUpperCase();
}

function isEnabled(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '' || v === '1' || v === 'enabled' || v === 'enable' || v === 'active';
}

function stat(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend ?? s.Spend),
    orders: num(s.orders ?? s.Orders),
    sales: num(s.sales ?? s.Sales),
    clicks: num(s.clicks ?? s.Clicks),
    impressions: num(s.impressions ?? s.Impressions),
    acos: num(s.acos ?? s.ACOS),
  };
}

function uiStat(row) {
  return {
    spend: num(row.Spend ?? row.spend),
    orders: num(row.Orders ?? row.orders),
    sales: num(row.Sales ?? row.sales),
    clicks: num(row.Clicks ?? row.clicks),
    impressions: num(row.Impressions ?? row.impressions),
    acos: num(row.ACOS ?? row.acos),
  };
}

function acosFor(s, price) {
  const sales = num(s.sales) || num(s.orders) * num(price);
  if (sales > 0) return num(s.spend) / sales;
  return num(s.spend) > 0 ? 99 : 0;
}

function labelFor(row) {
  return text(row.text || row.keywordText || row.targetText || row.targetingExpression || row.asin || row.label || row.targetType || '');
}

function minBid(row) {
  if ((row.entityType === 'sbKeyword' || row.entityType === 'sbTarget') && /sbv|video/i.test(row.campaignName || '')) return 0.25;
  return 0.05;
}

function roundBid(value, min) {
  return Number(Math.max(min, value).toFixed(2));
}

function nudgeBid(currentBid, factor, min) {
  const next = roundBid(currentBid * factor, min);
  if (factor < 1 && next < currentBid) return next;
  if (factor > 1 && next > currentBid) return next;
  if (factor < 1) {
    const nudge = roundBid(currentBid - 0.01, min);
    return nudge < currentBid ? nudge : currentBid;
  }
  const nudge = roundBid(currentBid + 0.01, min);
  return nudge > currentBid ? nudge : currentBid;
}

function inventoryContext(card) {
  const d3 = num(card.sellableDays_3d);
  const d7 = num(card.sellableDays_7d);
  const d30 = num(card.sellableDays_30d || card.invDays);
  const fulfillable = num(card.fulFillable ?? card.stockFul);
  return {
    d3,
    d7,
    d30,
    fulfillable,
    tight: (d3 > 0 && d3 <= 10) || (d7 > 0 && d7 <= 14) || (d30 > 0 && d30 <= 21) || (fulfillable > 0 && fulfillable <= 20),
    ample: fulfillable >= 20 && d30 >= 45,
  };
}

function collectEntities(campaign, channel) {
  const base = {
    campaignId: String(campaign.campaignId || ''),
    adGroupId: String(campaign.adGroupId || ''),
    campaignName: text(campaign.name || campaign.campaignName),
    groupName: text(campaign.groupName || campaign.adGroupName),
    campaignState: campaign.campaignState || campaign.state || '',
    groupState: campaign.groupState || '',
  };
  const out = [];
  if (channel === 'SP') {
    for (const row of campaign.keywords || []) out.push({ ...row, ...base, id: String(row.id || ''), entityType: 'keyword' });
    for (const row of campaign.autoTargets || []) {
      out.push({ ...row, ...base, id: String(row.id || ''), entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget' });
    }
  } else {
    for (const row of campaign.sponsoredBrands || []) {
      out.push({ ...row, ...base, id: String(row.id || ''), entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword' });
    }
  }
  return out.filter(row =>
    row.id &&
    num(row.bid) > 0 &&
    !row.onCooldown &&
    isEnabled(row.state) &&
    isEnabled(row.campaignState) &&
    isEnabled(row.groupState)
  );
}

function makeAction(card, row, nextBid, reason, riskLevel, sourceLabel) {
  const s7 = stat(row, '7d');
  const s30 = stat(row, '30d');
  const inv = inventoryContext(card);
  const currentBid = num(row.bid);
  const direction = nextBid > currentBid ? 'up' : 'down';
  const expectedEffect = direction === 'up'
    ? { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' }
    : { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid,
    suggestedBid: nextBid,
    text: labelFor(row),
    label: labelFor(row),
    campaignName: row.campaignName || '',
    groupName: row.groupName || '',
    campaignId: row.campaignId || '',
    adGroupId: row.adGroupId || '',
    reason,
    hypothesis: reason,
    expectedEffect,
    measurementWindowDays: [1, 3, 7, 14, 30],
    evidence: [
      `UI source=${sourceLabel}; this is a lower-layer bid action, not campaign budget.`,
      `SKU ${card.sku}: sellable days 3/7/30=${inv.d3.toFixed(0)}/${inv.d7.toFixed(0)}/${inv.d30.toFixed(0)}, fulfillable=${inv.fulfillable.toFixed(0)}, units 7/30=${num(card.unitsSold_7d).toFixed(0)}/${num(card.unitsSold_30d).toFixed(0)}.`,
      `${row.entityType} "${labelFor(row)}" in campaign "${row.campaignName || ''}": 7d spend=${s7.spend.toFixed(2)}, clicks=${s7.clicks.toFixed(0)}, orders=${s7.orders.toFixed(0)}, ACOS=${acosFor(s7, card.price).toFixed(4)}.`,
      `${row.entityType} "${labelFor(row)}" in campaign "${row.campaignName || ''}": 30d spend=${s30.spend.toFixed(2)}, clicks=${s30.clicks.toFixed(0)}, orders=${s30.orders.toFixed(0)}, ACOS=${acosFor(s30, card.price).toFixed(4)}.`,
    ],
    confidence: 0.84,
    riskLevel,
    source: 'codex',
    actionSource: ['codex'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    requiresAiDecision: false,
  };
}

function chooseEntity(card, entities, ui, sourceLabel) {
  const price = num(card.price);
  const inv = inventoryContext(card);
  const candidates = [];

  for (const row of entities) {
    const bid = num(row.bid);
    const min = minBid(row);
    const s7 = stat(row, '7d');
    const s30 = stat(row, '30d');
    const a7 = acosFor(s7, price);
    const a30 = acosFor(s30, price);
    const spend = Math.max(s7.spend, s30.spend);
    const noOrderWaste = (s7.spend >= 2.5 && s7.orders === 0 && s7.clicks >= 5) ||
      (s30.spend >= 4 && s30.orders === 0 && s30.clicks >= 8);
    const highAcos = (s7.orders > 0 && a7 >= 0.3 && s7.spend >= 3) ||
      (s30.orders > 0 && a30 >= 0.3 && s30.spend >= 4) ||
      (ui.orders > 0 && ui.acos >= 0.3);
    const proven = (s30.orders >= 1 && a30 > 0 && a30 <= 0.18) ||
      (s7.orders >= 1 && a7 > 0 && a7 <= 0.16);

    if (noOrderWaste || highAcos) {
      const next = nudgeBid(bid, noOrderWaste ? 0.9 : 0.92, min);
      if (next < bid) {
        candidates.push({
          score: 100 + spend + (noOrderWaste ? 20 : 0) + Math.max(a7, a30),
          action: makeAction(
            card,
            row,
            next,
            `This 7-day-unadjusted item is handled at the traffic object level. ${row.entityType} "${labelFor(row)}" is the weaker demand entry in the matched campaign, so I am trimming its bid and leaving the campaign budget unchanged.`,
            noOrderWaste ? 'ui_7day_lower_waste_control' : 'ui_7day_lower_high_acos_control',
            sourceLabel
          ),
        });
      }
      continue;
    }

    if (inv.tight && (s7.spend >= 2 || s30.spend >= 4 || ui.spend >= 5)) {
      const next = nudgeBid(bid, 0.95, min);
      if (next < bid) {
        candidates.push({
          score: 80 + spend,
          action: makeAction(
            card,
            row,
            next,
            `The product has tight sellable days, so demand should be cooled from the active lower-layer ad object instead of changing campaign budget. I am trimming this matched bid slightly to slow spend without closing the ad.`,
            'ui_7day_lower_inventory_demand_control',
            sourceLabel
          ),
        });
      }
      continue;
    }

    if (proven && inv.ample && ui.orders >= 1 && ui.acos > 0 && ui.acos <= 0.22 && bid >= 0.08) {
      const next = nudgeBid(bid, 1.05, min);
      if (next > bid) {
        candidates.push({
          score: 70 + s30.orders * 4 + s7.orders * 5 - a30 * 8,
          action: makeAction(
            card,
            row,
            next,
            `The SKU has inventory room and this lower-layer entry has already converted at controlled cost. I am repairing traffic with a small bid lift on the proven keyword/target only, not increasing campaign budget.`,
            'ui_7day_lower_controlled_traffic_repair',
            sourceLabel
          ),
        });
      }
    }

    if (bid > min && (inv.tight || (ui.orders === 0 && ui.spend >= 1))) {
      const next = nudgeBid(bid, 0.98, min);
      if (next < bid) {
        candidates.push({
          score: 35 + spend,
          action: makeAction(
            card,
            row,
            next,
            `This remaining 7-day-unadjusted row needs a lower-layer touch, but the signal is not strong enough for a large move. Product demand points to cooling this entry by one bid step while keeping the campaign budget unchanged.`,
            inv.tight ? 'ui_7day_lower_small_inventory_touch' : 'ui_7day_lower_small_waste_touch',
            sourceLabel
          ),
        });
      }
    } else if (!inv.tight && ui.orders >= 1 && ui.acos > 0 && ui.acos <= 0.25 && bid >= 0.08) {
      const next = nudgeBid(bid, 1.03, min);
      if (next > bid && (next - bid) / bid <= 0.15) {
        candidates.push({
          score: 30 + ui.orders + spend / 10,
          action: makeAction(
            card,
            row,
            next,
            `This remaining 7-day-unadjusted row has acceptable demand and inventory is not tight. I am making a one-step lower-layer bid repair only, without changing campaign budget.`,
            'ui_7day_lower_small_demand_touch',
            sourceLabel
          ),
        });
      }
    }

    if (bid > min && s7.orders === 0 && s30.orders === 0 && (s7.spend > 0 || s30.spend > 0 || inv.tight)) {
      const next = nudgeBid(bid, 0.99, min);
      if (next < bid) {
        candidates.push({
          score: 20 + s7.spend + s30.spend / 2,
          action: makeAction(
            card,
            row,
            next,
            `This remaining 7-day-unadjusted entry has no order signal on this lower-layer object. I am making the smallest bid-down touch to control weak demand and keep the campaign budget unchanged.`,
            'ui_7day_lower_minimal_no_order_touch',
            sourceLabel
          ),
        });
      }
    } else if (!inv.tight && inv.ample && s7.spend === 0 && s30.spend === 0 && bid >= 0.08) {
      const next = nudgeBid(bid, 1.02, min);
      if (next > bid && (next - bid) / bid <= 0.15) {
        candidates.push({
          score: 12,
          action: makeAction(
            card,
            row,
            next,
            `This remaining 7-day-unadjusted entry has inventory room but no recent traffic. I am making the smallest lower-layer bid-up test to repair demand visibility without changing campaign budget.`,
            'ui_7day_lower_minimal_visibility_touch',
            sourceLabel
          ),
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.action || null;
}

function isTotalRow(row, componentName) {
  if (componentName === 'AdvProduct') return !row.sku || String(row.sku).includes('合计');
  if (componentName === 'SBAdvCampaign') return !Array.isArray(row.skuInfo) || !row.skuInfo[0]?.sku || String(row.name || '') === String(num(row.name || 0));
  return false;
}

function main() {
  const snapshotFile = process.argv[2] || path.join('data', 'snapshots', 'latest_snapshot.json');
  const uiFile = process.argv[3] || path.join('data', 'snapshots', 'ui_7day_unadjusted_cards_2026-05-08.json');
  const outFile = process.argv[4] || path.join('data', 'snapshots', 'ui_7day_lower_bid_schema_2026-05-08.json');
  const reportFile = process.argv[5] || path.join('data', 'snapshots', 'ui_7day_lower_bid_report_2026-05-08.json');

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const ui = JSON.parse(fs.readFileSync(uiFile, 'utf8'));
  const bySku = new Map((snapshot.productCards || []).map(card => [cleanSku(card.sku), card]));
  const allowed = analyzeAllowedOperationScope(snapshot).allowedSkuSet;
  const skipActionFile = process.env.SKIP_ACTION_SCHEMA || '';
  const skipIds = new Set();
  if (skipActionFile && fs.existsSync(skipActionFile)) {
    const previous = JSON.parse(fs.readFileSync(skipActionFile, 'utf8'));
    for (const plan of previous || []) {
      for (const action of plan.actions || []) skipIds.add(`${action.entityType}:${action.id}`);
    }
  }
  const plansBySku = new Map();
  const used = new Set();
  const report = { generatedAt: new Date().toISOString(), source: uiFile, planned: [], skipped: [] };

  function addAction(sku, action) {
    const key = `${action.entityType}:${action.id}`;
    if (skipIds.has(key)) return false;
    if (used.has(key)) return false;
    used.add(key);
    if (!plansBySku.has(sku)) plansBySku.set(sku, { sku, asin: bySku.get(cleanSku(sku))?.asin || '', summary: `UI 7-day-unadjusted clear for ${sku}: lower-layer bid only; campaign budget is unchanged.`, actions: [] });
    plansBySku.get(sku).actions.push(action);
    report.planned.push({ sku, entityType: action.entityType, id: action.id, currentBid: action.currentBid, suggestedBid: action.suggestedBid, campaignName: action.campaignName, riskLevel: action.riskLevel });
    return true;
  }

  for (const result of ui.results || []) {
    for (const component of result.components || []) {
      const channel = component.name === 'AdvProduct' ? 'SP' : component.name === 'SBAdvCampaign' ? 'SB' : '';
      if (!channel) continue;
      for (const row of component.rows || []) {
        if (isTotalRow(row, component.name)) continue;
        const sku = channel === 'SP' ? cleanSku(row.sku) : cleanSku(row.skuInfo?.[0]?.sku);
        if (!allowed.has(sku)) {
          report.skipped.push({ channel, sku, reason: 'sku_out_of_allowed_operation_scope' });
          continue;
        }
        const card = bySku.get(sku);
        if (!card) {
          report.skipped.push({ channel, sku, reason: 'sku_not_in_snapshot' });
          continue;
        }
        const campaignId = String(row.campaignId || '');
        const adGroupId = String(row.adGroupId || '');
        const campaigns = (card.campaigns || []).filter(campaign => {
          if (String(campaign.campaignId || '') !== campaignId) return false;
          return channel === 'SB' || !adGroupId || String(campaign.adGroupId || '') === adGroupId;
        });
        const entities = campaigns.flatMap(campaign => collectEntities(campaign, channel));
        if (!entities.length) {
          report.skipped.push({ channel, sku, campaignId, adGroupId, reason: 'no_active_lower_entity_or_all_on_cooldown' });
          continue;
        }
        const action = chooseEntity(card, entities, uiStat(row), `${channel}:${component.name}:${campaignId}`);
        if (!action) {
          report.skipped.push({ channel, sku, campaignId, adGroupId, reason: 'no_safe_bid_move_at_lower_layer' });
          continue;
        }
        addAction(sku, action);
      }
    }
  }

  const plans = [...plansBySku.values()].filter(plan => plan.actions.length);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(plans, null, 2), 'utf8');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  const counts = report.planned.reduce((acc, item) => {
    acc.actions += 1;
    acc[item.entityType] = (acc[item.entityType] || 0) + 1;
    acc[item.riskLevel] = (acc[item.riskLevel] || 0) + 1;
    return acc;
  }, { actions: 0 });
  console.log(JSON.stringify({
    outFile,
    reportFile,
    plannedSkus: plans.length,
    skipped: report.skipped.length,
    counts,
  }, null, 2));
}

if (require.main === module) main();
