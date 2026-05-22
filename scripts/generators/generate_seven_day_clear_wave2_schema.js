const fs = require('fs');
const path = require('path');
const { analyzeAllowedOperationScope } = require('../../src/operation_scope');

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanSku(value) {
  return text(value).toUpperCase();
}

function isEnabled(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '' || v === '1' || v === 'enabled' || v === 'enable' || v === 'active';
}

function ymd(value) {
  return text(value).slice(0, 10);
}

function isToday(value, today) {
  return ymd(value) === today;
}

function stat(row, key) {
  const s = row?.[`stats${key}`] || {};
  return {
    spend: num(s.spend ?? s.Spend ?? row?.[`spend${key.replace('d', '')}`]),
    orders: num(s.orders ?? s.Orders ?? row?.[`orders${key.replace('d', '')}`]),
    sales: num(s.sales ?? s.Sales ?? row?.[`sales${key.replace('d', '')}`]),
    clicks: num(s.clicks ?? s.Clicks ?? row?.[`clicks${key.replace('d', '')}`]),
    impressions: num(s.impressions ?? s.Impressions ?? row?.[`impressions${key.replace('d', '')}`]),
    acos: num(s.acos ?? s.ACOS ?? row?.[`acos${key.replace('d', '')}`]),
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
  return text(row.text || row.keywordText || row.targetText || row.targetingExpression || row.type || row.asin || row.label || row.targetType || row.name || '');
}

function minBid(row) {
  if ((row.entityType === 'sbKeyword' || row.entityType === 'sbTarget') && /sbv|video/i.test(row.campaignName || '')) return 0.25;
  return 0.02;
}

function roundBid(value, min) {
  return Number(Math.max(min, value).toFixed(2));
}

function bidDownOneStep(currentBid, min) {
  const step = currentBid >= 0.5 ? 0.02 : 0.01;
  const next = roundBid(currentBid - step, min);
  return next < currentBid ? next : currentBid;
}

function bidUpOneStep(currentBid, min) {
  const step = currentBid >= 0.5 ? 0.02 : 0.01;
  const next = roundBid(currentBid + step, min);
  return next > currentBid ? next : currentBid;
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
    ample: fulfillable >= 20 && (d30 >= 45 || d30 === 999),
  };
}

function actionKey(entityType, id) {
  return `${entityType}:${String(id || '')}`;
}

function collectAdjustedEntities(adjustmentFile, today) {
  const adjusted = new Set();
  if (!fs.existsSync(adjustmentFile)) return adjusted;
  const rows = JSON.parse(fs.readFileSync(adjustmentFile, 'utf8'));
  for (const row of rows || []) {
    if (row.dryRun === true) continue;
    if (row.localDate && String(row.localDate) !== today) continue;
    const outcome = String(row.outcome || row.finalStatus || '').toLowerCase();
    if (!['success', 'api_success', 'success_readback', 'api_success_landed', 'api_success_pending_visibility'].includes(outcome)) continue;
    if (row.entityType && row.entityId) adjusted.add(actionKey(row.entityType, row.entityId));
  }
  return adjusted;
}

function collectEntities(campaign, channel, today, adjustedIds) {
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
      const entityType = row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword';
      out.push({ ...row, ...base, id: String(row.id || ''), entityType });
    }
  }
  return out.filter(row =>
    row.id &&
    num(row.bid) > 0 &&
    !row.onCooldown &&
    !isToday(row.updatedAt, today) &&
    !adjustedIds.has(actionKey(row.entityType, row.id)) &&
    isEnabled(row.state) &&
    isEnabled(row.campaignState) &&
    isEnabled(row.groupState)
  );
}

function chooseDirection(card, row, ui) {
  const price = num(card.price);
  const inv = inventoryContext(card);
  const s7 = stat(row, '7d');
  const s30 = stat(row, '30d');
  const a7 = acosFor(s7, price);
  const a30 = acosFor(s30, price);
  const noOrderWaste = (s7.spend >= 1 && s7.orders === 0 && s7.clicks >= 1) ||
    (s30.spend >= 2 && s30.orders === 0 && s30.clicks >= 3) ||
    (ui.spend >= 1 && ui.orders === 0);
  const highAcos = (s7.orders > 0 && a7 >= 0.28) ||
    (s30.orders > 0 && a30 >= 0.3) ||
    (ui.orders > 0 && ui.acos >= 0.3);
  const proven = (s7.orders >= 1 && a7 > 0 && a7 <= 0.2) ||
    (s30.orders >= 1 && a30 > 0 && a30 <= 0.22);

  if (noOrderWaste) return { direction: 'down', reasonCode: 'ui_7day_lower_minimal_waste_touch', expectationClass: 'control_waste' };
  if (highAcos) return { direction: 'down', reasonCode: 'ui_7day_lower_small_acos_touch', expectationClass: 'control_waste' };
  if (inv.tight) return { direction: 'down', reasonCode: 'ui_7day_lower_small_inventory_touch', expectationClass: 'cool_inventory_demand' };
  if (proven && inv.ample && num(card.profitRate) >= 0.12) return { direction: 'up', reasonCode: 'ui_7day_lower_small_demand_touch', expectationClass: 'repair_visibility' };
  if (s7.spend === 0 && s30.spend === 0 && inv.ample && num(card.profitRate) >= 0.12) return { direction: 'up', reasonCode: 'ui_7day_lower_minimal_visibility_touch', expectationClass: 'repair_visibility' };
  return { direction: 'down', reasonCode: 'ui_7day_lower_neutral_hygiene_touch', expectationClass: 'control_waste' };
}

function candidateScore(card, row, ui) {
  const s7 = stat(row, '7d');
  const s30 = stat(row, '30d');
  const price = num(card.price);
  const inv = inventoryContext(card);
  const a7 = acosFor(s7, price);
  const a30 = acosFor(s30, price);
  let score = 0;
  score += s7.spend * 8 + s30.spend * 2 + ui.spend;
  score += s7.clicks * 1.5 + s30.clicks * 0.3;
  if (s7.orders === 0 && s7.spend > 0) score += 30;
  if (a7 >= 0.3 || a30 >= 0.3) score += 20;
  if (inv.tight) score += 15;
  if (row.entityType === 'keyword' || row.entityType === 'autoTarget' || row.entityType === 'manualTarget') score += 3;
  return score;
}

function makeAction(card, row, nextBid, decision, sourceLabel, ui) {
  const s7 = stat(row, '7d');
  const s30 = stat(row, '30d');
  const inv = inventoryContext(card);
  const currentBid = num(row.bid);
  const direction = nextBid > currentBid ? 'up' : 'down';
  const expectedEffect = direction === 'up'
    ? { impressions: 'up', clicks: 'up', spend: 'up', orders: 'watch', acos: 'watch' }
    : { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'watch' };
  const reasonText = direction === 'up'
    ? 'This seven-day untouched row has inventory room and acceptable demand context, so I am making a one-step lower-layer bid-up touch without changing campaign budget.'
    : 'This seven-day untouched row needs a hygiene touch at the lower-layer traffic object; I am making a one-step bid-down/control move without changing campaign budget.';
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
    reason: `${decision.reasonCode}: ${reasonText}`,
    hypothesis: reasonText,
    expectedEffect,
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      metrics: ['impressions', 'clicks', 'spend', 'orders', 'ACOS'],
      rollbackIf: direction === 'up'
        ? 'If spend rises for 7 days without orders, trim back to the prior bid.'
        : 'If qualified orders fall faster than spend, restore the prior bid.',
    },
    measurementWindowDays: [1, 3, 7, 14, 30],
    evidence: [
      `UI source=${sourceLabel}; lower-layer bid only, no campaign budget, no pause, no create.`,
      `SKU ${card.sku}: sellable days 3/7/30=${inv.d3.toFixed(0)}/${inv.d7.toFixed(0)}/${inv.d30.toFixed(0)}, fulfillable=${inv.fulfillable.toFixed(0)}, units 7/30=${num(card.unitsSold_7d).toFixed(0)}/${num(card.unitsSold_30d).toFixed(0)}, profitRate=${num(card.profitRate).toFixed(4)}.`,
      `UI row: spend=${ui.spend.toFixed(2)}, clicks=${ui.clicks.toFixed(0)}, orders=${ui.orders.toFixed(0)}, ACOS=${ui.acos || 0}.`,
      `${row.entityType} "${labelFor(row)}": 7d spend=${s7.spend.toFixed(2)}, clicks=${s7.clicks.toFixed(0)}, orders=${s7.orders.toFixed(0)}, ACOS=${acosFor(s7, card.price).toFixed(4)}.`,
      `${row.entityType} "${labelFor(row)}": 30d spend=${s30.spend.toFixed(2)}, clicks=${s30.clicks.toFixed(0)}, orders=${s30.orders.toFixed(0)}, ACOS=${acosFor(s30, card.price).toFixed(4)}.`,
    ],
    confidence: direction === 'up' ? 0.72 : 0.8,
    riskLevel: decision.reasonCode,
    expectationClass: decision.expectationClass,
    source: 'codex',
    actionSource: ['codex'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    requiresAiDecision: false,
    candidateSource: sourceLabel,
  };
}

function chooseAction(card, entities, ui, sourceLabel) {
  const candidates = [];
  for (const row of entities) {
    const bid = num(row.bid);
    const min = minBid(row);
    const decision = chooseDirection(card, row, ui);
    const nextBid = decision.direction === 'up' ? bidUpOneStep(bid, min) : bidDownOneStep(bid, min);
    if (nextBid === bid) continue;
    candidates.push({
      score: candidateScore(card, row, ui) + (decision.direction === 'down' ? 5 : 0),
      action: makeAction(card, row, nextBid, decision, sourceLabel, ui),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.action || null;
}

function buildIndex(snapshot) {
  const bySku = new Map((snapshot.productCards || []).map(card => [cleanSku(card.sku), card]));
  const byCampaign = new Map();
  for (const card of snapshot.productCards || []) {
    for (const campaign of card.campaigns || []) {
      const cid = String(campaign.campaignId || '');
      if (!cid) continue;
      if (!byCampaign.has(cid)) byCampaign.set(cid, []);
      byCampaign.get(cid).push({ card, campaign });
    }
  }
  return { bySku, byCampaign };
}

function main() {
  const snapshotFile = process.argv[2] || path.join('data', 'snapshots', 'latest_snapshot.json');
  const outFile = process.argv[3] || path.join('data', 'snapshots', 'action_schema_2026-05-21_7day_unadjusted_clear_wave2.json');
  const reportFile = process.argv[4] || path.join('data', 'tasks', 'seven_day_unadjusted_clear_wave2_2026-05-21.json');
  const today = process.argv[5] || '2026-05-21';
  const adjustmentFile = process.argv[6] || path.join('data', 'adjustments', `adjustments_${today}.json`);

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const { bySku, byCampaign } = buildIndex(snapshot);
  const allowed = analyzeAllowedOperationScope(snapshot).allowedSkuSet;
  const adjustedIds = collectAdjustedEntities(adjustmentFile, today);
  const plansBySku = new Map();
  const used = new Set();
  const report = {
    generatedAt: new Date().toISOString(),
    sourceSnapshot: snapshotFile,
    businessDate: today,
    snapshotExportedAt: snapshot.exportedAt || '',
    inputCounts: {
      sp: (snapshot.sp7DayUntouchedRows || []).length,
      sb: (snapshot.sb7DayUntouchedRows || []).length,
    },
    planned: [],
    skipped: [],
  };

  function addAction(card, action) {
    const key = actionKey(action.entityType, action.id);
    if (used.has(key)) return false;
    used.add(key);
    const sku = card.sku;
    if (!plansBySku.has(sku)) {
      plansBySku.set(sku, {
        sku,
        asin: card.asin || '',
        summary: `Seven-day untouched clear wave2 for ${sku}: lower-layer bid touch only; campaign budget/state/create unchanged.`,
        actions: [],
      });
    }
    plansBySku.get(sku).actions.push(action);
    report.planned.push({
      sku,
      entityType: action.entityType,
      id: action.id,
      campaignId: action.campaignId,
      adGroupId: action.adGroupId,
      currentBid: action.currentBid,
      suggestedBid: action.suggestedBid,
      direction: action.suggestedBid > action.currentBid ? 'up' : 'down',
      riskLevel: action.riskLevel,
      expectationClass: action.expectationClass,
      label: action.label,
      campaignName: action.campaignName,
    });
    return true;
  }

  function skip(row, channel, reason, extra = {}) {
    report.skipped.push({
      channel,
      sku: row.sku || '',
      campaignId: String(row.campaignId || ''),
      adGroupId: String(row.adGroupId || ''),
      campaignName: row.campaignName || row.name || '',
      reason,
      ...extra,
    });
  }

  for (const row of snapshot.sp7DayUntouchedRows || []) {
    const sku = cleanSku(row.sku);
    const card = bySku.get(sku);
    if (!sku || !card) {
      skip(row, 'SP', 'sku_not_in_snapshot');
      continue;
    }
    if (!allowed.has(sku)) {
      skip(row, 'SP', 'sku_out_of_allowed_operation_scope');
      continue;
    }
    if (isToday(row.manualAdjustTheTime, today) || isToday(row.lastAdvUpdatedDate, today)) {
      skip(row, 'SP', 'candidate_already_adjusted_today');
      continue;
    }
    const campaignId = String(row.campaignId || '');
    const adGroupId = String(row.adGroupId || '');
    const campaigns = (card.campaigns || []).filter(campaign =>
      String(campaign.campaignId || '') === campaignId &&
      (!adGroupId || String(campaign.adGroupId || '') === adGroupId)
    );
    const entities = campaigns.flatMap(campaign => collectEntities(campaign, 'SP', today, adjustedIds));
    if (!entities.length) {
      skip(row, 'SP', 'no_active_lower_entity_or_all_on_cooldown_or_adjusted_today');
      continue;
    }
    const action = chooseAction(card, entities, uiStat(row), `sp_7day_untouched:${campaignId}:${adGroupId}`);
    if (!action) {
      skip(row, 'SP', 'no_safe_bid_move_at_lower_layer');
      continue;
    }
    if (!addAction(card, action)) skip(row, 'SP', 'duplicate_lower_entity_already_planned');
  }

  for (const row of snapshot.sb7DayUntouchedRows || []) {
    const campaignId = String(row.campaignId || '');
    if (isToday(row.manualAdjustTheTime, today) || isToday(row.updated_at, today)) {
      skip(row, 'SB', 'candidate_already_adjusted_today');
      continue;
    }
    const matches = (byCampaign.get(campaignId) || []).filter(({ card, campaign }) =>
      cleanSku(card.sku) !== campaignId &&
      (campaign.sponsoredBrands || []).length
    );
    if (!matches.length) {
      skip(row, 'SB', 'campaign_not_mapped_to_product_card');
      continue;
    }
    const allowedMatches = matches.filter(({ card }) => allowed.has(cleanSku(card.sku)));
    if (!allowedMatches.length) {
      skip(row, 'SB', 'sku_out_of_allowed_operation_scope');
      continue;
    }
    let planned = false;
    let anyEntities = false;
    for (const { card, campaign } of allowedMatches) {
      const entities = collectEntities(campaign, 'SB', today, adjustedIds);
      if (!entities.length) continue;
      anyEntities = true;
      const action = chooseAction(card, entities, uiStat(row), `sb_7day_untouched:${campaignId}`);
      if (!action) continue;
      if (addAction(card, action)) {
        planned = true;
        break;
      }
    }
    if (!planned) {
      skip(row, 'SB', anyEntities ? 'no_safe_bid_move_at_lower_layer_or_duplicate' : 'no_active_lower_entity_or_all_on_cooldown_or_adjusted_today');
    }
  }

  const plans = [...plansBySku.values()].filter(plan => plan.actions.length);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(plans, null, 2), 'utf8');

  report.summary = report.planned.reduce((acc, item) => {
    acc.actions += 1;
    acc.skus.add(item.sku);
    acc.byType[item.entityType] = (acc.byType[item.entityType] || 0) + 1;
    acc.byDirection[item.direction] = (acc.byDirection[item.direction] || 0) + 1;
    acc.byRisk[item.riskLevel] = (acc.byRisk[item.riskLevel] || 0) + 1;
    acc.byExpectation[item.expectationClass] = (acc.byExpectation[item.expectationClass] || 0) + 1;
    return acc;
  }, { actions: 0, skus: new Set(), byType: {}, byDirection: {}, byRisk: {}, byExpectation: {} });
  report.summary.skus = report.summary.skus.size;
  report.skippedSummary = report.skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    outFile,
    reportFile,
    plannedSkus: plans.length,
    summary: report.summary,
    skippedSummary: report.skippedSummary,
  }, null, 2));
}

if (require.main === module) main();
