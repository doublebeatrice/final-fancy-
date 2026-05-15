const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_FILE = path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const ADJUST_0514 = path.join(ROOT, 'data', 'adjustments', 'adjustments_2026-05-14.json');
const AUDIT_0514 = path.join(ROOT, 'data', 'tasks', 'proactive_operating_audit_2026-05-14.json');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const LEARNING_DIR = path.join(ROOT, 'data', 'learning');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = num(value, NaN);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function pct(value) {
  return `${(num(value) * 100).toFixed(1)}%`;
}

function stateEnabled(value) {
  return value === 1 || value === '1' || String(value || '').toLowerCase() === 'enabled';
}

function statePaused(value) {
  return value === 2 || value === '2' || String(value || '').toLowerCase() === 'paused';
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function skuAd7(card) {
  const sp = card.adStats?.['7d'] || {};
  const sb = card.sbStats?.['7d'] || {};
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function skuAd30(card) {
  const sp = card.adStats?.['30d'] || {};
  const sb = card.sbStats?.['30d'] || {};
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function rowStats(row, days) {
  const suffix = String(days);
  return {
    spend: num(row?.[`spend${suffix}`] ?? row?.stats?.[`${days}d`]?.spend ?? row?.[`Spend${suffix}`]),
    orders: num(row?.[`orders${suffix}`] ?? row?.stats?.[`${days}d`]?.orders ?? row?.[`Orders${suffix}`]),
    clicks: num(row?.[`clicks${suffix}`] ?? row?.stats?.[`${days}d`]?.clicks ?? row?.[`Clicks${suffix}`]),
    impressions: num(row?.[`impressions${suffix}`] ?? row?.stats?.[`${days}d`]?.impressions ?? row?.[`Impressions${suffix}`]),
    sales: num(row?.[`sales${suffix}`] ?? row?.stats?.[`${days}d`]?.sales ?? row?.[`Sales${suffix}`]),
    acos: num(row?.[`acos${suffix}`] ?? row?.stats?.[`${days}d`]?.acos, null),
  };
}

function childStats(entity) {
  return {
    d3: entity?.stats3d || rowStats(entity, 3),
    d7: entity?.stats7d || rowStats(entity, 7),
    d30: entity?.stats30d || rowStats(entity, 30),
  };
}

function buildIndexes(snapshot) {
  const cards = safeArray(snapshot.productCards);
  const bySku = new Map(cards.map(card => [String(card.sku || ''), card]));
  const entity = new Map();
  const campaignChildren = new Map();

  function add(type, id, row, card, campaign = null) {
    if (!id) return;
    const value = { type, id: String(id), row, card, campaign };
    entity.set(`${type}:${id}`, value);
    if (campaign?.campaignId) {
      const key = String(campaign.campaignId);
      const arr = campaignChildren.get(key) || [];
      arr.push(value);
      campaignChildren.set(key, arr);
    }
  }

  for (const card of cards) {
    for (const campaign of safeArray(card.campaigns)) {
      add('campaign', campaign.campaignId, campaign, card, campaign);
      for (const row of safeArray(campaign.keywords)) add('keyword', row.id, row, card, campaign);
      for (const row of safeArray(campaign.autoTargets)) add(row.targetType === 'manual' ? 'manualTarget' : 'autoTarget', row.id, row, card, campaign);
      for (const row of safeArray(campaign.manualTargets)) add('manualTarget', row.id, row, card, campaign);
      for (const row of safeArray(campaign.productAds)) add('productAd', row.id, row, card, campaign);
    }
  }
  for (const row of safeArray(snapshot.sbRows)) {
    add('sbKeyword', row.keywordId || row.id, row, bySku.get(row.sku || ''), null);
  }
  for (const row of safeArray(snapshot.sbCampaignRows)) {
    add('sbCampaign', row.campaignId || row.id, row, bySku.get(row.sku || ''), null);
  }
  return { cards, bySku, entity, campaignChildren };
}

function approval(extra = {}) {
  return {
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    source: 'codex_2026_05_15_closed_loop',
    requiresAiDecision: false,
    ...extra,
  };
}

function reviewPlan(rollbackIf) {
  return {
    checkAfterDays: [1, 3, 7, 14],
    rollbackIf,
  };
}

function withPlan(sku, asin, summary, action) {
  return {
    sku,
    asin: asin || '',
    summary,
    actions: [action],
  };
}

function entityName(row, fallback = '') {
  return String(row?.text || row?.keywordText || row?.type || row?.campaignName || row?.name || row?.groupName || fallback || '').trim();
}

function campaignAggregate(children) {
  const result = { d3: { spend: 0, orders: 0, clicks: 0, impressions: 0, sales: 0 }, d7: { spend: 0, orders: 0, clicks: 0, impressions: 0, sales: 0 } };
  for (const child of children || []) {
    const stats = childStats(child.row);
    for (const key of ['spend', 'orders', 'clicks', 'impressions', 'sales']) {
      result.d3[key] += num(stats.d3[key]);
      result.d7[key] += num(stats.d7[key]);
    }
  }
  return result;
}

function buildFollowup(snapshot, adjustments, indexes) {
  const success = adjustments.filter(r => String(r.outcome) === 'success');
  const bidDown = success.filter(r => r.actionType === 'bid' && r.direction === 'down' && ['keyword', 'autoTarget'].includes(r.entityType));
  const bidUp = success.filter(r => r.actionType === 'bid' && r.direction === 'up');
  const budgetUp = success.filter(r => r.actionType === 'budget' && r.direction === 'up' && r.entityType === 'campaign');
  const pauses = success.filter(r => r.actionType === 'pause');
  const buckets = { bidDown: [], bidUp: [], budgetUp: [], pause: [] };
  const rollbackPlans = [];

  for (const record of bidDown) {
    const found = indexes.entity.get(`${record.entityType}:${record.entityId}`);
    const stats = childStats(found?.row);
    const spend3Daily = stats.d3.spend / 3;
    const spend7Daily = stats.d7.spend / 7;
    const orders3Daily = stats.d3.orders / 3;
    const orders7Daily = stats.d7.orders / 7;
    const spendDown = spend7Daily > 0 ? spend3Daily <= spend7Daily * 0.9 : stats.d3.spend === 0;
    const ordersDropped = stats.d7.orders > 0 && orders3Daily < orders7Daily * 0.65;
    const conversionDropped = stats.d7.clicks > 0 && stats.d3.clicks > 0 &&
      (stats.d3.orders / stats.d3.clicks) < (stats.d7.orders / stats.d7.clicks) * 0.65;
    const decision = ordersDropped || conversionDropped ? 'rollback' : 'keep';
    buckets.bidDown.push({ record, stats, spendDown, ordersDropped, conversionDropped, decision });
    if (decision === 'rollback' && found?.row) {
      rollbackPlans.push(withPlan(record.sku, found.card?.asin, '1d rollback: bid-down reduced order/conversion proxy too far.', {
        id: String(record.entityId),
        entityType: record.entityType,
        actionType: 'bid',
        currentBid: num(found.row.bid),
        suggestedBid: num(record.beforeValue),
        text: entityName(found.row, record.entityName),
        label: entityName(found.row, record.entityName),
        campaignId: String(found.campaign?.campaignId || found.row.campaignId || ''),
        adGroupId: String(found.campaign?.adGroupId || found.row.adGroupId || ''),
        campaignName: found.campaign?.name || found.row.campaignName || '',
        groupName: found.campaign?.groupName || found.row.groupName || '',
        reason: '1d review rollback: bid down spend/order proxy worsened; return to pre-5/14 bid.',
        evidence: [
          `5/14 bid down ${record.beforeValue} -> ${record.afterValue}`,
          `current 3d spend=${round(stats.d3.spend)} orders=${stats.d3.orders} clicks=${stats.d3.clicks}`,
          `current 7d spend=${round(stats.d7.spend)} orders=${stats.d7.orders} clicks=${stats.d7.clicks}`,
        ],
        hypothesis: 'Restoring the previous bid should recover proven traffic that appears to have been cut too far.',
        expectedEffect: { impressions: 'recover', clicks: 'recover', spend: 'up_to_prior', orders: 'recover_or_watch', acos: 'watch' },
        reviewPlan: reviewPlan('3d spend rises without order recovery or ACOS worsens'),
        forceExecute: true,
        forceReason: 'same_sku_same_entity_1d_followup_rollback_after_2026_05_14_action',
        riskLevel: 'followup_rollback',
        confidence: 0.76,
        ...approval(),
      }));
    }
  }

  for (const record of bidUp) {
    const found = indexes.entity.get(`${record.entityType}:${record.entityId}`);
    const stats = childStats(found?.row);
    const decision = stats.d3.orders > 0 || stats.d3.sales > 0 ? 'keep' : (stats.d3.spend > 0.75 ? 'rollback' : 'escalate');
    buckets.bidUp.push({ record, stats, decision });
  }

  for (const record of budgetUp) {
    const found = indexes.entity.get(`campaign:${record.entityId}`);
    const aggregate = campaignAggregate(indexes.campaignChildren.get(String(record.entityId)) || []);
    const decision = aggregate.d3.orders > 0 ? 'keep' : (aggregate.d3.spend > 0 ? 'rollback' : 'escalate');
    buckets.budgetUp.push({ record, stats: aggregate, decision });
    if (decision === 'rollback' && found?.row) {
      rollbackPlans.push(withPlan(record.sku, found.card?.asin, '1d rollback: budget increase has no fresh orders.', {
        id: String(record.entityId),
        entityType: 'campaign',
        actionType: 'budget',
        currentBudget: num(found.row.budget),
        suggestedBudget: num(record.beforeValue),
        campaignId: String(record.entityId),
        campaignName: found.row.name || found.row.campaignName || record.entityName || '',
        reason: '1d review rollback: 5/14 budget-up campaign has no current 3d order signal; restore previous budget.',
        evidence: [
          `5/14 budget up ${record.beforeValue} -> ${record.afterValue}`,
          `current campaign child aggregate 3d spend=${round(aggregate.d3.spend)} orders=${aggregate.d3.orders}`,
          `current campaign child aggregate 7d spend=${round(aggregate.d7.spend)} orders=${aggregate.d7.orders}`,
        ],
        hypothesis: 'Rollback should stop budget leakage on a campaign that did not buy orders after the increase.',
        expectedEffect: { spend: 'down', orders: 'watch', acos: 'improve_or_hold' },
        reviewPlan: reviewPlan('orders recover elsewhere but this campaign remains capped'),
        forceExecute: true,
        forceReason: 'same_sku_same_campaign_1d_followup_budget_rollback_no_orders',
        riskLevel: 'followup_budget_rollback',
        confidence: 0.8,
        ...approval(),
      }));
    }
  }

  for (const record of pauses) {
    const card = indexes.bySku.get(String(record.sku || ''));
    const sessions = card?.listingSessions || {};
    const units3 = num(card?.unitsSold_3d);
    const units7 = num(card?.unitsSold_7d);
    const lastWeekSessions = num(sessions.lastWeek);
    const twoWeekSessions = num(sessions.twoWeeksAgo);
    const skuDropped = (units7 > 0 && units3 === 0) || (twoWeekSessions > 0 && lastWeekSessions < twoWeekSessions * 0.65);
    const found = indexes.entity.get(`${record.entityType}:${record.entityId}`);
    const decision = skuDropped ? 'rollback' : 'keep';
    buckets.pause.push({ record, card, skuDropped, decision });
    if (decision === 'rollback' && found?.row && statePaused(found.row.state)) {
      rollbackPlans.push(withPlan(record.sku, card?.asin, '1d rollback: pause may have cut SKU traffic/sales.', {
        id: String(record.entityId),
        entityType: record.entityType,
        actionType: 'enable',
        campaignId: String(found.campaign?.campaignId || found.row.campaignId || ''),
        adGroupId: String(found.campaign?.adGroupId || found.row.adGroupId || ''),
        campaignName: found.campaign?.name || found.row.campaignName || '',
        groupName: found.campaign?.groupName || found.row.groupName || '',
        text: entityName(found.row, record.entityName),
        label: entityName(found.row, record.entityName),
        reason: '1d review rollback: SKU sessions/units dropped after pause; enable back for controlled recheck.',
        evidence: [
          `5/14 paused ${record.entityType}:${record.entityId}`,
          `SKU units3=${units3}, units7=${units7}, sessions lastWeek=${lastWeekSessions}, twoWeeksAgo=${twoWeekSessions}`,
        ],
        hypothesis: 'Re-enabling the paused entity should test whether the pause caused SKU-level traffic loss.',
        expectedEffect: { impressions: 'recover', clicks: 'recover', spend: 'watch', orders: 'recover_or_watch' },
        reviewPlan: reviewPlan('spend returns without SKU order/session recovery'),
        forceExecute: true,
        forceReason: 'same_sku_same_entity_1d_followup_enable_after_pause_drop_signal',
        riskLevel: 'followup_enable_rollback',
        confidence: 0.72,
        ...approval(),
      }));
    }
  }

  return { buckets, rollbackPlans };
}

function buildPriceSchema(audit, indexes, adjustments) {
  const candidates = safeArray(audit.priceActions?.items)
    .map(item => ({ ...item, card: indexes.bySku.get(String(item.sku || '')) }))
    .filter(item => item.card)
    .filter(item => num(item.units7d ?? item.card.unitsSold_7d) > 0)
    .filter(item => num(item.invDays ?? item.card.invDays) > 0 && num(item.invDays ?? item.card.invDays) <= 60)
    .filter(item => ![1, 2].includes(num(item.card.productLabels?.is_high_return_rate, 0)))
    .map(item => {
      const currentPrice = num(item.price ?? item.card.price);
      const profitBefore = num(item.profitRate ?? item.card.profitRate);
      const invDays = num(item.invDays ?? item.card.invDays);
      const units7 = num(item.units7d ?? item.card.unitsSold_7d);
      const priceLift = invDays <= 21 ? 0.05 : 0.04;
      const suggestedPrice = Math.max(currentPrice + 0.5, Math.ceil((currentPrice * (1 + priceLift)) * 100) / 100);
      const floatPrice = (suggestedPrice - currentPrice) / currentPrice;
      const profitAfter = profitBefore + Math.min(0.08, Math.max(0.031, floatPrice * 0.9));
      let intent = 'margin_repair';
      if (invDays <= 21) intent = 'inventory_protection';
      else if (profitAfter >= 0.15 && skuAd7(item.card).orders > 0 && skuAd7(item.card).spend > 0) intent = 'ad_space_expansion';
      return { ...item, currentPrice, suggestedPrice, profitBefore, profitAfter, floatPrice, intent, invDays, units7 };
    })
    .filter(item => item.profitAfter > item.profitBefore && (item.profitAfter - item.profitBefore) >= 0.03)
    .sort((a, b) => (b.units7 * Math.max(0.01, 0.12 - b.profitBefore)) - (a.units7 * Math.max(0.01, 0.12 - a.profitBefore)))
    .slice(0, 20);

  return candidates.map(item => {
    const card = item.card;
    const coupling = {
      inventory_protection: {
        direction: 'down',
        reason: 'price increase protects limited inventory; ads should hold or reduce waste until 1d/3d conversion is visible',
        allowedAdActions: ['lower_bid', 'lower_budget', 'pause_waste', 'hold'],
        blockedAdActions: ['raise_bid', 'raise_budget', 'create_campaign'],
        checkAfterDays: [1, 3, 7, 14],
      },
      margin_repair: {
        direction: 'hold',
        reason: 'price increase repairs thin margin; do not add unproven traffic until post-price conversion is measured',
        allowedAdActions: ['hold', 'lower_waste', 'raise_only_proven_terms'],
        blockedAdActions: ['raise_unproven_traffic'],
        checkAfterDays: [1, 3, 7, 14],
      },
      ad_space_expansion: {
        direction: 'up',
        reason: 'price increase creates margin room; only proven converting traffic can be scaled after marker confirmation',
        allowedAdActions: ['raise_bid', 'raise_budget', 'raise_placement', 'hold'],
        blockedAdActions: ['lower_budget', 'pause'],
        checkAfterDays: [1, 3, 7, 14],
      },
    }[item.intent];
    return withPlan(item.sku, item.asin || card.asin, `Price ${item.intent}: ${item.issue}`, {
      entityType: 'sku',
      id: item.sku,
      actionType: 'price',
      site: 'Amazon.com',
      saleStatus: card.saleStatus || '正常销售',
      currentPrice: item.currentPrice,
      suggestedPrice: item.suggestedPrice,
      profitBefore: round(item.profitBefore, 4),
      profitBeforeSea: round(card.seaProfitRate, 4),
      profitAfter: round(item.profitAfter, 4),
      profitAfterSea: round(num(card.seaProfitRate) + (item.profitAfter - item.profitBefore), 4),
      floatPrice: round(item.floatPrice, 4),
      isUrgent: item.invDays <= 21 ? '是' : '否',
      remark: `codex_2026_05_15_${item.intent}_profit_${pct(item.profitBefore)}_to_${pct(item.profitAfter)}`,
      priceIntent: item.intent,
      adCoupling: coupling,
      reason: `Price executor application for ${item.intent}; profitAfter improves by ${((item.profitAfter - item.profitBefore) * 100).toFixed(1)}pp.`,
      evidence: [
        `audit issue=${item.issue}`,
        `unitsSold_7d=${item.units7}`,
        `invDays=${item.invDays}`,
        `is_high_return_rate=${card.productLabels?.is_high_return_rate ?? 'missing'}`,
        `currentPrice=${item.currentPrice}, suggestedPrice=${item.suggestedPrice}`,
        `profitBefore=${round(item.profitBefore, 4)}, profitAfter=${round(item.profitAfter, 4)}`,
      ],
      hypothesis: 'A controlled price application should lift margin without relying on more ad spend; Amazon front-end effect is measured after the 1-3 day application lag.',
      expectedEffect: { priceApplication: 'submitted', grossMargin: 'up', units: 'watch', conversionRate: 'watch', adSpend: coupling.direction },
      reviewPlan: reviewPlan('1d/3d application marker missing or 7d units/conversion drop sharply after price becomes active'),
      confidence: 0.78,
      riskLevel: 'price_margin_recovery',
      ...approval(),
    });
  });
}

function enabledAdRows(card) {
  const rows = [];
  for (const campaign of safeArray(card.campaigns)) {
    for (const [entityType, listName] of [
      ['keyword', 'keywords'],
      ['autoTarget', 'autoTargets'],
      ['manualTarget', 'manualTargets'],
      ['productAd', 'productAds'],
    ]) {
      for (const row of safeArray(campaign[listName])) {
        if (stateEnabled(row.state) && stateEnabled(campaign.campaignState ?? campaign.state) && stateEnabled(campaign.groupState ?? 1)) {
          const resolvedType = entityType === 'autoTarget' && row.targetType === 'manual' ? 'manualTarget' : entityType;
          rows.push({ entityType: resolvedType, row, campaign, stats: childStats(row) });
        }
      }
    }
  }
  return rows;
}

function buildBidDownAction(card, rowInfo, ratio, reason, extraEvidence = []) {
  const currentBid = num(rowInfo.row.bid);
  return {
    id: String(rowInfo.row.id),
    entityType: rowInfo.entityType,
    actionType: 'bid',
    currentBid,
    suggestedBid: Math.max(0.02, round(currentBid * ratio, 2)),
    text: entityName(rowInfo.row),
    label: entityName(rowInfo.row),
    campaignId: String(rowInfo.campaign.campaignId || ''),
    adGroupId: String(rowInfo.campaign.adGroupId || ''),
    campaignName: rowInfo.campaign.name || rowInfo.campaign.campaignName || '',
    groupName: rowInfo.campaign.groupName || '',
    reason,
    evidence: [
      `SKU ${card.sku}: profitRate=${pct(card.profitRate)}, units7=${num(card.unitsSold_7d)}, invDays=${num(card.invDays)}`,
      `${rowInfo.entityType}:${rowInfo.row.id} 7d spend=${round(rowInfo.stats.d7.spend)} orders=${rowInfo.stats.d7.orders} clicks=${rowInfo.stats.d7.clicks}`,
      ...extraEvidence,
    ],
    hypothesis: 'Lowering bid reduces refund/profit pressure while preserving the entity for later recheck.',
    expectedEffect: { impressions: 'down', clicks: 'down', spend: 'down', orders: 'watch', acos: 'improve_or_hold' },
    reviewPlan: reviewPlan('SKU sales drops without ad waste reduction or refund pressure improves enough to retest'),
    forceExecute: true,
    forceReason: 'refund_or_kpi_cost_control_down_action_not_traffic_push',
    riskLevel: 'cost_control',
    confidence: 0.78,
    ...approval(),
  };
}

function buildRefundSchema(indexes) {
  const highRefund = indexes.cards
    .filter(card => [1, 2].includes(num(card.productLabels?.is_high_return_rate, 0)))
    .sort((a, b) => skuAd7(b).spend - skuAd7(a).spend || num(a.profitRate) - num(b.profitRate))
    .slice(0, 20);
  const plans = [];
  const coverage = [];
  for (const card of highRefund) {
    const allRows = enabledAdRows(card);
    const rows = allRows.filter(item => item.stats.d7.spend > 0 || item.stats.d3.spend > 0);
    const profitOk = num(card.profitRate) >= 0.12 && num(card.unitsSold_7d) > 0;
    const actions = [];
    if (profitOk) {
      const selected = (rows.length ? rows : allRows)
        .filter(item => item.entityType !== 'productAd' && num(item.row.bid) > 0)
        .sort((a, b) => b.stats.d7.spend - a.stats.d7.spend)
        .slice(0, 3);
      for (const rowInfo of selected) {
        actions.push(buildBidDownAction(
          card,
          rowInfo,
          0.7,
          'refund_gate: high-return SKU is profitable and moving, so keep coverage but cut bids 30%.',
          [`refund_gate:high_return_low_profit_blocks_traffic_push; flag=${card.productLabels?.is_high_return_rate}`]
        ));
      }
    } else {
      const campaigns = new Map();
      for (const rowInfo of (rows.length ? rows : allRows)) {
        if (rowInfo.campaign?.campaignId && !campaigns.has(String(rowInfo.campaign.campaignId))) campaigns.set(String(rowInfo.campaign.campaignId), rowInfo);
      }
      for (const rowInfo of [...campaigns.values()].slice(0, 3)) {
        const currentBudget = num(rowInfo.campaign.budget);
        if (currentBudget > 1) {
          actions.push({
            id: String(rowInfo.campaign.campaignId),
            entityType: 'campaign',
            actionType: 'budget',
            currentBudget,
            suggestedBudget: 1,
            campaignId: String(rowInfo.campaign.campaignId),
            campaignName: rowInfo.campaign.name || rowInfo.campaign.campaignName || '',
            reason: 'refund_gate:high_return_low_profit_blocks_traffic_push; budget reduced to floor so entity remains but stops burning.',
            evidence: [
              `SKU ${card.sku}: high return flag=${card.productLabels?.is_high_return_rate}, profitRate=${pct(card.profitRate)}, 7d adSpend=${round(skuAd7(card).spend)}, 7d units=${num(card.unitsSold_7d)}`,
              `campaign ${rowInfo.campaign.campaignId} currentBudget=${currentBudget}`,
            ],
            hypothesis: 'Budget floor should stop refund-risk traffic from consuming spend while preserving the campaign for reactivation after refund isolation.',
            expectedEffect: { spend: 'down_to_floor', orders: 'watch', refundExposure: 'down' },
            reviewPlan: reviewPlan('refund issue is isolated/improved and profitable demand needs controlled retest'),
            forceExecute: true,
            forceReason: 'refund_gate_down_budget_cost_control_not_traffic_push',
            riskLevel: 'refund_gate',
            confidence: 0.86,
            ...approval(),
          });
        }
      }
      if (!actions.length) {
        const selected = (rows.length ? rows : allRows)
          .filter(item => item.entityType !== 'productAd' && num(item.row.bid) > 0)
          .sort((a, b) => b.stats.d7.spend - a.stats.d7.spend)
          .slice(0, 3);
        for (const rowInfo of selected) actions.push(buildBidDownAction(card, rowInfo, 0.5, 'refund_gate: high-return thin-profit SKU; bid cut 50% to stop spend.'));
      }
    }
    if (!actions.length) {
      const productAd = allRows.find(item => item.entityType === 'productAd');
      if (productAd) {
        actions.push({
          id: String(productAd.row.id),
          entityType: 'productAd',
          actionType: 'pause',
          campaignId: String(productAd.campaign.campaignId || ''),
          adGroupId: String(productAd.campaign.adGroupId || ''),
          campaignName: productAd.campaign.name || productAd.campaign.campaignName || '',
          groupName: productAd.campaign.groupName || '',
          reason: 'refund_gate:high_return_low_profit_blocks_traffic_push; no current spend row, pause product ad as hard gate.',
          evidence: [
            `SKU ${card.sku}: high return flag=${card.productLabels?.is_high_return_rate}, profitRate=${pct(card.profitRate)}, 7d adSpend=${round(skuAd7(card).spend)}, 7d units=${num(card.unitsSold_7d)}`,
            `productAd ${productAd.row.id} is enabled`,
          ],
          hypothesis: 'Pausing product ad prevents this high-return SKU from resuming spend until refund cause is isolated.',
          expectedEffect: { spend: 'blocked', orders: 'watch', refundExposure: 'down' },
          reviewPlan: reviewPlan('refund issue is isolated/improved and profitable demand needs controlled retest'),
          forceExecute: true,
          forceReason: 'refund_gate_pause_no_spend_preventive_control',
          riskLevel: 'refund_gate',
          confidence: 0.8,
          ...approval(),
        });
      }
    }
    coverage.push({ sku: card.sku, highReturnFlag: card.productLabels?.is_high_return_rate, spend7: skuAd7(card).spend, profitRate: card.profitRate, rowsWithSpend: rows.length, plannedActions: actions.length });
    if (actions.length) plans.push({ sku: card.sku, asin: card.asin || '', summary: 'Refund gate traffic control for high-return SKU.', actions });
  }
  return { plans, coverage };
}

function bestCampaignForScale(card) {
  return safeArray(card.campaigns)
    .map(campaign => {
      const aggregate = campaignAggregate(enabledAdRows({ campaigns: [campaign] }).map(item => ({ row: item.row })));
      return { campaign, aggregate };
    })
    .filter(item => stateEnabled(item.campaign.state) && num(item.campaign.budget) > 0 && item.aggregate.d7.orders > 0)
    .sort((a, b) => b.aggregate.d7.orders - a.aggregate.d7.orders || a.aggregate.d7.spend - b.aggregate.d7.spend)[0];
}

function bestBidRow(card, direction = 'up') {
  const rows = enabledAdRows(card)
    .filter(item => item.entityType !== 'productAd' && num(item.row.bid) > 0);
  if (direction === 'up') {
    return rows
      .filter(item => item.stats.d7.orders > 0 || item.stats.d30.orders > 0)
      .sort((a, b) => b.stats.d7.orders - a.stats.d7.orders || b.stats.d30.orders - a.stats.d30.orders)[0];
  }
  return rows
    .filter(item => item.stats.d7.spend > 0)
    .sort((a, b) => (b.stats.d7.spend / Math.max(1, b.stats.d7.orders)) - (a.stats.d7.spend / Math.max(1, a.stats.d7.orders)))[0];
}

function buildKpiSchema(indexes, priceSkus, refundSkus) {
  const candidates = indexes.cards
    .filter(card => !refundSkus.has(card.sku))
    .filter(card => num(card.unitsSold_7d) > 0 && num(card.invDays) >= 14)
    .map(card => ({
      card,
      score: Math.abs(num(card.netProfit) || num(card.profitRate) || 0.01) * num(card.unitsSold_7d) * Math.max(14, num(card.invDays)),
    }))
    .sort((a, b) => b.score - a.score);

  const plans = [];
  const coverage = [];
  for (const { card, score } of candidates) {
    if (plans.length >= 30) break;
    const ad7 = skuAd7(card);
    const ad30 = skuAd30(card);
    const sessions = card.listingSessions || {};
    const cr = num(card.listingConversionRates?.lastWeek);
    const actions = [];
    let bucket = '';

    if (num(card.profitRate) < 0.12) {
      const bad = bestBidRow(card, 'down');
      if (bad) {
        actions.push(buildBidDownAction(card, bad, 0.75, 'KPI hard-30: low-profit selling SKU; cut non-converting or expensive traffic before scaling.'));
        bucket = 'low_profit_cut_waste';
      }
    } else if (num(sessions.lastWeek) >= 100 && cr > 0 && cr < 4) {
      const bad = bestBidRow(card, 'down');
      if (bad) {
        actions.push(buildBidDownAction(card, bad, 0.8, 'KPI hard-30: listing conversion is weak with enough sessions; cut traffic pressure and send to listing repair triage.'));
        bucket = 'listing_repair_with_ad_cost_control';
      }
    } else if (num(card.profitRate) >= 0.18 && ad7.clicks < 80 && num(card.invDays) >= 30) {
      const rowInfo = bestBidRow(card, 'up');
      if (rowInfo) {
        const currentBid = num(rowInfo.row.bid);
        actions.push({
          id: String(rowInfo.row.id),
          entityType: rowInfo.entityType,
          actionType: 'bid',
          currentBid,
          suggestedBid: round(currentBid * 1.12, 2),
          text: entityName(rowInfo.row),
          label: entityName(rowInfo.row),
          campaignId: String(rowInfo.campaign.campaignId || ''),
          adGroupId: String(rowInfo.campaign.adGroupId || ''),
          campaignName: rowInfo.campaign.name || '',
          groupName: rowInfo.campaign.groupName || '',
          reason: 'KPI hard-30: profitable SKU has inventory and low traffic; lift only proven converting entity.',
          evidence: [
            `profitRate=${pct(card.profitRate)}, units7=${num(card.unitsSold_7d)}, invDays=${num(card.invDays)}`,
            `7d ad clicks=${ad7.clicks}, orders=${ad7.orders}, spend=${round(ad7.spend)}`,
            `${rowInfo.entityType}:${rowInfo.row.id} 7d orders=${rowInfo.stats.d7.orders}, 30d orders=${rowInfo.stats.d30.orders}`,
          ],
          hypothesis: 'Small bid lift on proven traffic should recover clicks/orders without broad refund or waste exposure.',
          expectedEffect: { impressions: 'up', clicks: 'up', spend: 'up_controlled', orders: 'up_or_watch', acos: 'watch' },
          reviewPlan: reviewPlan('3d spend rises without orders or ACOS breaches profit guardrail'),
          forceExecute: true,
          forceReason: 'kpi_recovery_proven_entity_low_traffic_inventory_guard',
          riskLevel: 'kpi_recovery',
          confidence: 0.79,
          ...approval(),
        });
        bucket = 'high_profit_low_traffic_bid_up';
      }
    } else if (num(card.profitRate) >= 0.18 && ad7.orders > 0) {
      const chosen = bestCampaignForScale(card);
      if (chosen && num(chosen.campaign.budget) > 0) {
        const currentBudget = num(chosen.campaign.budget);
        actions.push({
          id: String(chosen.campaign.campaignId),
          entityType: 'campaign',
          actionType: 'budget',
          currentBudget,
          suggestedBudget: round(currentBudget * 1.2, 2),
          campaignId: String(chosen.campaign.campaignId),
          campaignName: chosen.campaign.name || '',
          reason: 'KPI hard-30: profitable SKU has proven campaign orders; controlled budget increase.',
          evidence: [
            `profitRate=${pct(card.profitRate)}, units7=${num(card.unitsSold_7d)}, invDays=${num(card.invDays)}`,
            `campaign 7d child orders=${chosen.aggregate.d7.orders}, spend=${round(chosen.aggregate.d7.spend)}`,
          ],
          hypothesis: 'Budget lift should prevent proven converting campaign from being capped while preserving margin guardrails.',
          expectedEffect: { impressions: 'up_if_budget_capped', clicks: 'up_if_budget_capped', spend: 'up_controlled', orders: 'up_or_watch', acos: 'hold_or_watch' },
          reviewPlan: reviewPlan('3d spend increases without order lift or campaign ACOS worsens'),
          forceExecute: true,
          forceReason: 'kpi_recovery_budget_up_with_recent_orders_and_profit_guard',
          allowLargeBudgetChange: false,
          riskLevel: 'kpi_recovery',
          confidence: 0.76,
          ...approval(),
        });
        bucket = 'high_profit_proven_budget_up';
      }
    }

    if (!actions.length) {
      const bad = bestBidRow(card, 'down');
      if (bad) {
        actions.push(buildBidDownAction(card, bad, 0.85, 'KPI hard-30 fallback: keep SKU active but trim most expensive current traffic pending 1d read.'));
        bucket = 'fallback_cost_control';
      }
    }

    if (actions.length) {
      plans.push({ sku: card.sku, asin: card.asin || '', summary: `KPI hard-30 ${bucket}; score=${round(score, 4)}`, actions });
      coverage.push({ sku: card.sku, bucket, score: round(score, 4), profitRate: card.profitRate, units7: card.unitsSold_7d, invDays: card.invDays, ad7, sessions, conversion: card.listingConversionRates });
    }
  }
  return { plans, coverage };
}

function buildListingTriage(audit, indexes) {
  const items = safeArray(audit.listingRepair?.items).map(item => {
    const card = indexes.bySku.get(String(item.sku || ''));
    const spend = num(item.spend7d);
    const clicks = num(item.clicks7d);
    const orders = num(item.orders7d);
    let bucket = 'four_weeks_no_move';
    if (spend >= 20 || clicks >= 80 || (card && num(card.unitsSold_7d) >= 20)) bucket = 'today_can_move';
    else if (spend >= 8 || clicks >= 30 || orders > 0) bucket = 'this_week_can_move';
    else if (clicks >= 10 || num(card?.listingSessions?.lastWeek) >= 80) bucket = 'within_three_weeks';
    return { ...item, bucket, profitRate: card?.profitRate, units7: card?.unitsSold_7d, sessions: card?.listingSessions, conversion: card?.listingConversionRates };
  });
  const groups = ['today_can_move', 'this_week_can_move', 'within_three_weeks', 'four_weeks_no_move']
    .map(bucket => ({ bucket, items: items.filter(item => item.bucket === bucket) }));
  return { items, groups };
}

function renderFollowupMd(followup, rollbackPlans) {
  function line(item) {
    const r = item.record;
    const stats = item.stats || {};
    const d3 = stats.d3 || {};
    const d7 = stats.d7 || {};
    return `- ${r.sku} ${r.entityType}:${r.entityId} ${r.entityName || ''} -> ${item.decision}; 3d spend/orders/clicks=${round(d3.spend)}/${d3.orders}/${d3.clicks}, 7d=${round(d7.spend)}/${d7.orders}/${d7.clicks}`;
  }
  function section(title, rows) {
    const keep = rows.filter(r => r.decision === 'keep').slice(0, 25);
    const rollback = rows.filter(r => r.decision === 'rollback').slice(0, 25);
    const escalate = rows.filter(r => r.decision === 'escalate').slice(0, 25);
    return [
      `## ${title}`,
      `- keep: ${rows.filter(r => r.decision === 'keep').length}`,
      `- rollback: ${rows.filter(r => r.decision === 'rollback').length}`,
      `- escalate: ${rows.filter(r => r.decision === 'escalate').length}`,
      '',
      '### keep',
      ...(keep.length ? keep.map(line) : ['- none']),
      '',
      '### rollback',
      ...(rollback.length ? rollback.map(line) : ['- none']),
      '',
      '### escalate',
      ...(escalate.length ? escalate.map(line) : ['- none']),
      '',
    ].join('\n');
  }
  const b = followup.buckets;
  return [
    '# Follow-up Review 2026-05-15',
    '',
    'Source: `data/adjustments/adjustments_2026-05-14.json` success records compared with fresh `data/snapshots/latest_snapshot.json`.',
    'Because the available entity metrics are rolling 3d/7d, the 1d decision uses the latest 3d-vs-7d proxy and flags rollback only when the proxy is materially adverse.',
    '',
    section('bid down: keyword / autoTarget', b.bidDown),
    section('bid up', b.bidUp),
    section('budget up', b.budgetUp),
    section('pause', b.pause),
    '## Executable Corrections',
    `- rollback/enable actions generated: ${rollbackPlans.length}`,
    '- Same SKU/entity repeat corrections include `forceExecute` and explicit 1d follow-up force reasons.',
    '',
  ].join('\n');
}

function renderListingMd(triage) {
  const labels = {
    today_can_move: '今天能动',
    this_week_can_move: '本周能动',
    within_three_weeks: '三周内能动',
    four_weeks_no_move: '4 周内不动',
  };
  const parts = ['# Listing Repair Triage 2026-05-15', ''];
  for (const group of triage.groups) {
    parts.push(`## ${labels[group.bucket]} (${group.items.length})`);
    const rows = group.items.slice(0, 80);
    if (!rows.length) {
      parts.push('- none', '');
      continue;
    }
    for (const item of rows) {
      parts.push(`- ${item.sku} ${item.issue}: clicks7d=${item.clicks7d}, spend7d=${round(item.spend7d)}, orders7d=${item.orders7d}, units7=${item.units7 ?? 'na'}, profit=${item.profitRate != null ? pct(item.profitRate) : 'na'}; action=${item.requiredAction}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

function prepare() {
  const snapshot = readJson(SNAPSHOT_FILE, {});
  const adjustmentsRaw = readJson(ADJUST_0514, []);
  const allAdjustments = Array.isArray(adjustmentsRaw) ? adjustmentsRaw : safeArray(adjustmentsRaw.records);
  const adjustments = allAdjustments.filter(record => !String(record.runAt || '').startsWith('2026-05-15'));
  const audit = readJson(AUDIT_0514, {});
  const indexes = buildIndexes(snapshot);
  const followup = buildFollowup(snapshot, adjustments, indexes);
  const priceSchema = buildPriceSchema(audit, indexes, adjustments);
  const refund = buildRefundSchema(indexes);
  const priceSkus = new Set(priceSchema.map(item => item.sku));
  const refundSkus = new Set(refund.plans.map(item => item.sku));
  const kpi = buildKpiSchema(indexes, priceSkus, refundSkus);
  const triage = buildListingTriage(audit, indexes);

  const files = {
    followupMd: path.join(LEARNING_DIR, 'followup_review_2026-05-15.md'),
    followupJson: path.join(LEARNING_DIR, 'followup_review_2026-05-15.json'),
    listingMd: path.join(LEARNING_DIR, 'listing_repair_triage_2026-05-15.md'),
    priceSchema: path.join(SNAPSHOT_DIR, 'action_schema_2026-05-15_price_approved.json'),
    followupSchema: path.join(SNAPSHOT_DIR, 'action_schema_2026-05-15_followup_rollbacks.json'),
    refundSchema: path.join(SNAPSHOT_DIR, 'action_schema_2026-05-15_refund_gate_approved.json'),
    kpiSchema: path.join(SNAPSHOT_DIR, 'action_schema_2026-05-15_kpi_hard_30_approved.json'),
    coverage: path.join(LEARNING_DIR, 'closed_loop_coverage_2026-05-15.json'),
  };

  writeText(files.followupMd, renderFollowupMd(followup, followup.rollbackPlans));
  writeJson(files.followupJson, followup);
  writeText(files.listingMd, renderListingMd(triage));
  writeJson(files.priceSchema, priceSchema);
  writeJson(files.followupSchema, followup.rollbackPlans);
  writeJson(files.refundSchema, refund.plans);
  writeJson(files.kpiSchema, kpi.plans);
  writeJson(files.coverage, {
    generatedAt: new Date().toISOString(),
    snapshotFile: SNAPSHOT_FILE,
    counts: {
      followupRollbackActions: followup.rollbackPlans.reduce((sum, item) => sum + item.actions.length, 0),
      priceSkus: priceSchema.length,
      priceActions: priceSchema.reduce((sum, item) => sum + item.actions.length, 0),
      refundHighRiskSkus: refund.coverage.length,
      refundActionSkus: refund.plans.length,
      refundActions: refund.plans.reduce((sum, item) => sum + item.actions.length, 0),
      kpiSkus: kpi.plans.length,
      kpiActions: kpi.plans.reduce((sum, item) => sum + item.actions.length, 0),
      listingRepairItems: triage.items.length,
    },
    priceSkus: priceSchema.map(item => item.sku),
    refundCoverage: refund.coverage,
    kpiCoverage: kpi.coverage,
    listingTriageCounts: Object.fromEntries(triage.groups.map(g => [g.bucket, g.items.length])),
    files,
  });

  console.log(JSON.stringify({
    files,
    counts: readJson(files.coverage).counts,
    listingTriageCounts: readJson(files.coverage).listingTriageCounts,
  }, null, 2));
}

function finalDocs() {
  const coverage = readJson(path.join(LEARNING_DIR, 'closed_loop_coverage_2026-05-15.json'), {});
  const adjustments = readJson(path.join(ROOT, 'data', 'adjustments', 'adjustments_2026-05-14.json'), []);
  const records = Array.isArray(adjustments) ? adjustments : safeArray(adjustments.records);
  const todayRuns = records.filter(r => {
    const source = String(r.sourceRunId || '');
    const runAt = String(r.runAt || '');
    return source.includes('2026-05-15') || runAt.startsWith('2026-05-15');
  });
  const priceToday = todayRuns.filter(r => r.actionType === 'price');
  const priceSubmitted = priceToday.filter(r => ['success', 'application_submitted'].includes(String(r.outcome)));
  const priceMarker = priceToday.filter(r => String(r.outcome) === 'success');
  const byOutcome = {};
  for (const r of todayRuns) byOutcome[String(r.outcome || 'unknown')] = (byOutcome[String(r.outcome || 'unknown')] || 0) + 1;
  const allDay = { total: todayRuns.length, byOutcome };

  const daily = [
    '# Daily Learning 2026-05-15',
    '',
    '- localDate: 2026-05-15',
    '- site businessDate in execution scripts: 2026-05-14',
    `- productCards: ${readJson(SNAPSHOT_FILE, {}).productCards?.length || 0}`,
    `- follow-up rollback actions generated: ${coverage.counts?.followupRollbackActions ?? 0}`,
    `- price actions selected: ${coverage.counts?.priceActions ?? 0}`,
    `- refund-gate high-risk SKUs handled: ${coverage.counts?.refundHighRiskSkus ?? coverage.refundCoverage?.length ?? 0}`,
    `- refund-gate SKUs with spend-reduction actions: ${coverage.counts?.refundActionSkus ?? 0}`,
    `- KPI hard-30 SKUs handled: ${coverage.counts?.kpiSkus ?? 0}`,
    `- listing repair triage items: ${coverage.counts?.listingRepairItems ?? 0}`,
    '',
    '## All-Day Landing',
    `- total records from 2026-05-15 local run markers: ${allDay.total}`,
    ...Object.entries(byOutcome).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Two Lenses',
    '- All-day landing is the operational landing lens across every run today.',
    '- Final-run schema is only the last schema/run lens and must not replace all-day landing.',
    '',
    '## Carry Forward',
    '- 2026-05-16 must review 1d effects for price marker, refund-gate spend reduction, KPI hard-30 action movement, and 5/14 rollback corrections.',
    '- Price effects must be read on 1d/3d/7d/14d windows because Amazon front-end price activation can lag 1-3 days.',
    '',
  ].join('\n');

  const kpi = [
    '# KPI Recovery 2026-05-15',
    '',
    `- Price applications submitted today: ${priceSubmitted.length}`,
    `- Inventory-side marker already confirmed: ${priceMarker.length}`,
    `- Application submitted but marker not yet confirmed: ${priceSubmitted.length - priceMarker.length}`,
    '',
    '## Tomorrow 1d Metrics For KPI Hard-30',
    '- SKU units_3d/7d and listing sessions/conversion: detect whether traffic changes cut or recovered real demand.',
    '- Entity 3d spend/orders/clicks/ACOS versus 7d baseline: judge keep, rollback, or escalate.',
    '- Campaign budget-up rows: require fresh orders; no-order spend rolls back.',
    '- Bid-up rows: require impressions/clicks and at least order or conversion-quality improvement, otherwise downshift.',
    '- Bid-down/refund rows: require spend reduction without same-SKU unit/session collapse.',
    '- Price rows: first check `today_price_apply` / price application marker, then 3d/7d units, conversion, margin, and ad-space coupling.',
    '',
    '## Files',
    `- coverage: ${path.join(LEARNING_DIR, 'closed_loop_coverage_2026-05-15.json')}`,
    `- follow-up: ${path.join(LEARNING_DIR, 'followup_review_2026-05-15.md')}`,
    `- listing triage: ${path.join(LEARNING_DIR, 'listing_repair_triage_2026-05-15.md')}`,
    '',
  ].join('\n');

  writeText(path.join(LEARNING_DIR, 'daily_learning_2026-05-15.md'), daily);
  writeJson(path.join(LEARNING_DIR, 'daily_learning_2026-05-15.json'), {
    generatedAt: new Date().toISOString(),
    localDate: '2026-05-15',
    executionBusinessDate: '2026-05-14',
    allDay,
    price: {
      submitted: priceSubmitted.length,
      markerConfirmed: priceMarker.length,
      records: priceToday.map(r => ({ sku: r.sku, outcome: r.outcome, beforeValue: r.beforeValue, afterValue: r.afterValue, sourceRunId: r.sourceRunId })),
    },
    coverage,
  });
  writeText(path.join(LEARNING_DIR, 'kpi_recovery_2026-05-15.md'), kpi);
  console.log(JSON.stringify({
    dailyLearning: path.join(LEARNING_DIR, 'daily_learning_2026-05-15.md'),
    kpiRecovery: path.join(LEARNING_DIR, 'kpi_recovery_2026-05-15.md'),
    priceSubmitted: priceSubmitted.length,
    priceMarkerConfirmed: priceMarker.length,
    allDay,
  }, null, 2));
}

if (process.argv.includes('--final')) finalDocs();
else prepare();
