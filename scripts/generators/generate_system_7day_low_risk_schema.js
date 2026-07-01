const fs = require('fs');
const path = require('path');
const { ALLOWED_OPERATION_SALE_STATUS } = require('../../src/operation_scope');

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

function saleStatusForSp(row) {
  return text(row?.skuInvData?.sale_status || row?.sale_status);
}

function saleStatusesForSb(row, systemSnapshot) {
  const infos = systemSnapshot.sbSkuInfo?.[String(row.campaignId || '')] || [];
  return [...new Set(infos.map(info => text(info.sale_status)).filter(Boolean))];
}

function isNormalSaleOnly(statuses) {
  return statuses.length > 0 && statuses.every(status => ALLOWED_OPERATION_SALE_STATUS.includes(status));
}

function minBid(row, entityType) {
  const campaignName = row.campaignName || row.name || row.campaign?.name || row.campaign?.campaignName || '';
  if ((entityType === 'sbKeyword' || entityType === 'sbTarget') && /sbv|video/i.test(campaignName)) return 0.25;
  return 0.02;
}

function bidDownOneStep(currentBid, floor) {
  const step = currentBid >= 0.5 ? 0.02 : 0.01;
  return Number(Math.max(floor, currentBid - step).toFixed(2));
}

function labelFor(row) {
  return text(row.text || row.keywordText || row.targetText || row.targetingExpression || row.type || row.asin || row.label || row.name || '');
}

function uiStats(row) {
  return {
    spend: num(row.Spend ?? row.spend),
    orders: num(row.Orders ?? row.orders),
    sales: num(row.Sales ?? row.sales),
    clicks: num(row.Clicks ?? row.clicks),
    impressions: num(row.Impressions ?? row.impressions),
    acos: num(row.ACOS ?? row.acos),
  };
}

function entityStats(row, key) {
  const stats = row?.[`stats${key}`] || {};
  return {
    spend: num(stats.spend ?? stats.Spend),
    orders: num(stats.orders ?? stats.Orders),
    sales: num(stats.sales ?? stats.Sales),
    clicks: num(stats.clicks ?? stats.Clicks),
    impressions: num(stats.impressions ?? stats.Impressions),
    acos: num(stats.acos ?? stats.ACOS),
  };
}

function buildIndexes(panelSnapshot) {
  const bySku = new Map();
  const byCampaign = new Map();
  for (const card of panelSnapshot.productCards || []) {
    bySku.set(cleanSku(card.sku), card);
    for (const campaign of card.campaigns || []) {
      const id = String(campaign.campaignId || '');
      if (!id) continue;
      if (!byCampaign.has(id)) byCampaign.set(id, []);
      byCampaign.get(id).push({ card, campaign });
    }
  }
  return { bySku, byCampaign };
}

function spEntities(card, systemRow) {
  const out = [];
  for (const campaign of card?.campaigns || []) {
    if (String(campaign.campaignId || '') !== String(systemRow.campaignId || '')) continue;
    if (String(campaign.adGroupId || '') !== String(systemRow.adGroupId || '')) continue;
    for (const row of campaign.keywords || []) out.push({ ...row, entityType: 'keyword', campaign });
    for (const row of campaign.autoTargets || []) {
      out.push({ ...row, entityType: row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', campaign });
    }
  }
  return out;
}

function sbEntities(matches) {
  const out = [];
  for (const { campaign } of matches || []) {
    for (const row of campaign.sponsoredBrands || []) {
      out.push({ ...row, entityType: row.entityType === 'sbTarget' ? 'sbTarget' : 'sbKeyword', campaign });
    }
  }
  return out;
}

function liveWritableEntities(rows) {
  return rows.filter(row =>
    row.id &&
    num(row.bid) > 0 &&
    !row.onCooldown &&
    isEnabled(row.state) &&
    isEnabled(row.campaignState ?? row.campaign?.campaignState ?? row.campaign?.state) &&
    isEnabled(row.groupState ?? row.campaign?.groupState)
  );
}

function chooseBidDown(rows) {
  const candidates = [];
  for (const row of rows) {
    const currentBid = num(row.bid);
    const floor = minBid(row, row.entityType);
    const suggestedBid = bidDownOneStep(currentBid, floor);
    if (!(suggestedBid > 0) || suggestedBid >= currentBid) continue;
    if ((currentBid - suggestedBid) / currentBid > 0.15) continue;
    const s7 = entityStats(row, '7d');
    const s30 = entityStats(row, '30d');
    const score = s7.spend * 8 + s30.spend * 2 + s7.clicks + s30.clicks * 0.25 + currentBid;
    candidates.push({ row, currentBid, suggestedBid, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function actionFor(systemRow, card, candidate, channel) {
  const row = candidate.row;
  const stats = uiStats(systemRow);
  const label = labelFor(row);
  const campaign = row.campaign || {};
  const saleStatus = channel === 'SP' ? saleStatusForSp(systemRow) : '';
  const reasonCode = channel === 'SB'
    ? 'system_7day_sb_low_risk_bid_down_touch'
    : 'system_7day_sp_low_risk_bid_down_touch';
  return {
    id: String(row.id),
    entityType: row.entityType,
    actionType: 'bid',
    currentBid: candidate.currentBid,
    suggestedBid: candidate.suggestedBid,
    text: label,
    label,
    campaignId: String(campaign.campaignId || systemRow.campaignId || ''),
    adGroupId: String(campaign.adGroupId || systemRow.adGroupId || ''),
    campaignName: text(campaign.name || systemRow.campaignName || systemRow.name),
    groupName: text(campaign.groupName || systemRow.groupName),
    reason: `${reasonCode}: normal-sale product; one-step lower-layer bid-down only, no budget/state/create change.`,
    hypothesis: 'Clear seven-day untouched status with the smallest reversible traffic-control touch.',
    expectedEffect: { impressions: 'slightly_down', clicks: 'slightly_down', spend: 'slightly_down', orders: 'watch', acos: 'watch' },
    reviewPlan: {
      checkAfterDays: [1, 3, 7],
      metrics: ['impressions', 'clicks', 'spend', 'orders', 'ACOS'],
      rollbackIf: 'If qualified orders fall faster than spend, restore the prior bid.',
    },
    measurementWindowDays: [1, 3, 7, 14, 30],
    evidence: [
      `system_card_channel=${channel}; SKU=${card.sku}; sale_status=${saleStatus || 'allowed'}.`,
      `UI row spend=${stats.spend.toFixed(2)}, clicks=${stats.clicks.toFixed(0)}, orders=${stats.orders.toFixed(0)}, ACOS=${stats.acos || 0}.`,
      `${row.entityType} ${row.id} ${label}: bid ${candidate.currentBid}->${candidate.suggestedBid}.`,
    ],
    currentMetrics: stats,
    confidence: 0.82,
    riskLevel: reasonCode,
    expectationClass: 'control_waste',
    source: 'codex',
    actionSource: ['codex'],
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    canAutoExecute: true,
    candidateSource: `system_7day_${channel.toLowerCase()}`,
  };
}

function addPlan(plansBySku, card, action) {
  const sku = text(card.sku);
  if (!plansBySku.has(sku)) {
    plansBySku.set(sku, {
      sku,
      asin: card.asin || '',
      summary: `System seven-day untouched low-risk bid-down touch for ${sku}.`,
      actions: [],
    });
  }
  plansBySku.get(sku).actions.push(action);
}

function main() {
  const systemFile = process.argv[2] || path.join('data', 'snapshots', 'system_7day_unadjusted_products_2026-05-22.json');
  const panelFile = process.argv[3] || path.join('data', 'snapshots', 'latest_snapshot_luo1051_preexec_2026-05-22.json');
  const schemaFile = process.argv[4] || path.join('data', 'snapshots', 'system_7day_low_risk_action_schema_2026-05-22.json');
  const reportFile = process.argv[5] || path.join('data', 'tasks', 'system_7day_unadjusted_status_plan_2026-05-22.json');

  const systemSnapshot = JSON.parse(fs.readFileSync(systemFile, 'utf8'));
  const panelSnapshot = JSON.parse(fs.readFileSync(panelFile, 'utf8'));
  const { bySku, byCampaign } = buildIndexes(panelSnapshot);
  const plansBySku = new Map();
  const used = new Set();
  const report = {
    generatedAt: new Date().toISOString(),
    systemSnapshot: systemFile,
    panelSnapshot: panelFile,
    sourceCounts: {
      spCardCount: systemSnapshot.spCount,
      sbCardCount: systemSnapshot.sbCount,
      spRows: (systemSnapshot.spRows || []).length,
      sbRows: (systemSnapshot.sbRows || []).length,
    },
    planned: [],
    skipped: [],
  };

  function skip(channel, row, reason, extra = {}) {
    report.skipped.push({
      channel,
      sku: row.sku || extra.skus || '',
      campaignId: String(row.campaignId || ''),
      adGroupId: String(row.adGroupId || ''),
      campaignName: row.campaignName || row.name || '',
      saleStatus: extra.saleStatus || '',
      spend: num(row.Spend),
      orders: num(row.Orders),
      acos: row.ACOS ?? null,
      reason,
      ...extra,
    });
  }

  function plan(channel, row, card, candidate) {
    const key = `${candidate.row.entityType}:${candidate.row.id}`;
    if (used.has(key)) {
      skip(channel, row, 'duplicate_lower_entity_already_planned', { saleStatus: channel === 'SP' ? saleStatusForSp(row) : saleStatusesForSb(row, systemSnapshot).join('|') });
      return;
    }
    used.add(key);
    const action = actionFor(row, card, candidate, channel);
    addPlan(plansBySku, card, action);
    report.planned.push({
      channel,
      sku: card.sku,
      campaignId: action.campaignId,
      adGroupId: action.adGroupId,
      entityType: action.entityType,
      id: action.id,
      currentBid: action.currentBid,
      suggestedBid: action.suggestedBid,
      campaignName: action.campaignName,
      label: action.label,
      spend: num(row.Spend),
      orders: num(row.Orders),
      acos: row.ACOS ?? null,
      reason: action.riskLevel,
    });
  }

  for (const row of systemSnapshot.spRows || []) {
    const saleStatus = saleStatusForSp(row);
    if (!ALLOWED_OPERATION_SALE_STATUS.includes(saleStatus)) {
      skip('SP', row, 'product_status_not_normal_sale', { saleStatus });
      continue;
    }
    if (String(row.servingStatus || '').includes('INCOMPLETE')) {
      skip('SP', row, 'campaign_incomplete_not_safe_auto_touch', { saleStatus });
      continue;
    }
    const card = bySku.get(cleanSku(row.sku));
    if (!card) {
      skip('SP', row, 'sku_not_found_in_panel_snapshot', { saleStatus });
      continue;
    }
    const live = liveWritableEntities(spEntities(card, row));
    if (!live.length) {
      skip('SP', row, 'no_enabled_writable_lower_layer_entity', { saleStatus });
      continue;
    }
    const candidate = chooseBidDown(live);
    if (!candidate) {
      skip('SP', row, 'enabled_lower_layer_at_floor_or_bid_down_not_small_risk', { saleStatus, liveLowerEntities: live.length });
      continue;
    }
    plan('SP', row, card, candidate);
  }

  for (const row of systemSnapshot.sbRows || []) {
    const statuses = saleStatusesForSb(row, systemSnapshot);
    if (!isNormalSaleOnly(statuses)) {
      skip('SB', row, 'sb_campaign_product_status_not_all_normal_sale', {
        saleStatus: statuses.join('|') || '(missing)',
        skus: (systemSnapshot.sbSkuInfo?.[String(row.campaignId || '')] || []).map(info => info.sku).join('|'),
      });
      continue;
    }
    const matches = byCampaign.get(String(row.campaignId || '')) || [];
    if (!matches.length) {
      skip('SB', row, 'campaign_not_found_in_panel_snapshot', { saleStatus: statuses.join('|') });
      continue;
    }
    const live = liveWritableEntities(sbEntities(matches));
    if (!live.length) {
      skip('SB', row, 'no_enabled_writable_lower_layer_entity', { saleStatus: statuses.join('|') });
      continue;
    }
    const candidate = chooseBidDown(live);
    if (!candidate) {
      skip('SB', row, 'enabled_lower_layer_at_floor_or_bid_down_not_small_risk', { saleStatus: statuses.join('|'), liveLowerEntities: live.length });
      continue;
    }
    plan('SB', row, matches[0].card, candidate);
  }

  const plans = [...plansBySku.values()].filter(item => item.actions.length);
  report.summary = {
    plannedActions: report.planned.length,
    plannedSkus: plans.length,
    plannedByChannel: report.planned.reduce((acc, item) => {
      acc[item.channel] = (acc[item.channel] || 0) + 1;
      return acc;
    }, {}),
    skippedByReason: report.skipped.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {}),
  };

  fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(schemaFile, JSON.stringify(plans, null, 2), 'utf8');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ schemaFile, reportFile, summary: report.summary }, null, 2));
}

if (require.main === module) main();
