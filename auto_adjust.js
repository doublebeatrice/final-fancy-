const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { log, loadHistory, saveHistory, analyzeCard, hasRecentOutcome, SNAPSHOTS_DIR, today } = require('./src/adjust_lib');

const BATCH = 50;
const VERIFY_TOLERANCE = 0.0001;
const DRY_RUN = process.env.DRY_RUN === '1';

function groupByAccountSite(items, getMeta, typeLabel) {
  const groups = new Map();
  const skipped = [];

  for (const item of items) {
    const meta = getMeta(item) || {};
    if (!meta.accountId) {
      skipped.push(item);
      continue;
    }
    const siteId = meta.siteId || 4;
    const key = `${meta.accountId}::${siteId}`;
    if (!groups.has(key)) groups.set(key, { accountId: meta.accountId, siteId, items: [] });
    groups.get(key).items.push({ item, meta });
  }

  if (skipped.length) log(`${typeLabel} skipped ${skipped.length}: missing accountId/metadata`);
  return { groups, skipped };
}

function findPanelId() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const panel = tabs.find(t => t.url && t.url.includes('panel.html') && t.url.includes('chrome-extension'));
          if (panel) resolve(panel.id);
          else reject(new Error('Cannot find extension panel page. Open the extension panel first.'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function apiOk(result) {
  return !!(result && (result.code === 200 || result.msg === 'success' || result.msg === '更新成功'));
}

function isSystemConflict(result) {
  const text = JSON.stringify(result || {});
  return !!(result && (result.code === 403 || /系统已自动调整|禁止手动调整/.test(text)));
}

function classifyApiResult(result) {
  if (apiOk(result)) return 'api_success';
  if (isSystemConflict(result)) return 'blocked_by_system_recent_adjust';
  return 'failed';
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarize(events) {
  return events.reduce((acc, event) => {
    const status = event.finalStatus || event.apiStatus || 'unknown';
    const type = event.entityType || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    acc[`${type}:${status}`] = (acc[`${type}:${status}`] || 0) + 1;
    return acc;
  }, {});
}

function groupEventsBySku(events) {
  const map = new Map();
  for (const event of events || []) {
    const sku = String(event.sku || '').trim();
    if (!sku) continue;
    if (!map.has(sku)) map.set(sku, []);
    map.get(sku).push(event);
  }
  return map;
}

function normalizeSources(source) {
  if (Array.isArray(source)) return [...new Set(source.filter(Boolean))];
  if (!source) return ['strategy'];
  return [source];
}

function readStats(row) {
  const spend = toNum(row?.spend7 ?? row?.Spend7 ?? row?.Spend ?? row?.spend ?? row?.cost ?? row?.Cost) || 0;
  const orders = toNum(row?.orders7 ?? row?.Orders7 ?? row?.Orders ?? row?.orders ?? row?.order) || 0;
  const sales = toNum(row?.sales7 ?? row?.Sales7 ?? row?.Sales ?? row?.sales) || 0;
  const clicks = toNum(row?.clicks7 ?? row?.Clicks7 ?? row?.Clicks ?? row?.clicks ?? row?.click) || 0;
  let acos = toNum(row?.acos7 ?? row?.ACOS7 ?? row?.ACOS ?? row?.acos);
  if (acos == null && sales > 0) acos = spend / sales;
  return { spend, orders, sales, clicks, acos: acos || 0 };
}

function dedupeKeyFor(action, meta = {}, sku = '') {
  const adType = action.adType || (String(action.entityType || '').startsWith('sb') ? 'SB' : 'SP');
  const entityLevel = action.entityLevel || action.entityType || '';
  return [
    meta.siteId || action.siteId || 4,
    adType,
    entityLevel,
    sku || action.sku || meta.sku || '',
    meta.campaignId || action.campaignId || '',
    meta.adGroupId || action.adGroupId || '',
    meta.keywordId || action.keywordId || (action.entityType === 'keyword' || action.entityType === 'sbKeyword' ? action.id : ''),
    meta.targetId || action.targetId || (action.entityType === 'autoTarget' || action.entityType === 'manualTarget' || action.entityType === 'sbTarget' ? action.id : ''),
  ].map(v => String(v ?? '')).join('::');
}

function executionEntityKey(entityType, id) {
  return `${String(entityType || '')}::${String(id || '')}`;
}

function isInvalidState(value) {
  const text = String(value ?? '').toUpperCase();
  return /PAUSED|ARCHIVED|DISABLED|ENDED|INCOMPLETE|CAMPAIGN_INCOMPLETE/.test(text) || text === '0' || text === '2';
}

function sbRowIsVideo(meta = {}) {
  const adFormat = String(meta.adFormat || '').toLowerCase();
  const campaignName = String(meta.campaignName || '').toLowerCase();
  return adFormat === 'video' || campaignName.includes('sbv');
}

function minAllowedBidFor(action, meta = {}) {
  const entityType = String(action?.entityType || '');
  if ((entityType === 'sbKeyword' || entityType === 'sbTarget') && sbRowIsVideo(meta)) return 0.25;
  return 0.05;
}

function ensureTouchedBidChange(bid, factor, direction, minBid = 0.05) {
  const currentBid = toNum(bid);
  if (!currentBid || currentBid <= 0) return null;

  const rounded = parseFloat(Math.max(minBid, currentBid * factor).toFixed(2));
  if (Math.abs(rounded - currentBid) > 0.001) return rounded;

  if (direction === 'down') {
    const nudgedDown = parseFloat(Math.max(minBid, currentBid - 0.01).toFixed(2));
    if (nudgedDown < currentBid) return nudgedDown;
    return null;
  }

  const nudgedUp = parseFloat((currentBid + 0.01).toFixed(2));
  if (nudgedUp > currentBid) return nudgedUp;
  return null;
}

function touchActionForEntity(card, entity, entityType, source, rowStats = null, meta = {}) {
  const stats7 = rowStats || entity.stats7d || { spend: 0, orders: 0, clicks: 0, acos: 0 };
  const stats30 = entity.stats30d || {};
  const bid = toNum(entity.bid);
  if (!bid || bid <= 0) return null;

  const invDays = Number(card.invDays || 0);
  const lowStockRisk = invDays > 0 && invDays <= 2;
  const stateText = String(entity.state || entity.status || entity.servingStatus || '').trim().toUpperCase();
  const stateRisk = isInvalidState(entity.state || entity.status || entity.servingStatus);
  const pausedState = stateText === '2' || stateText.includes('PAUSED');
  const hardInvalidState = /ARCHIVED|DISABLED|ENDED|INCOMPLETE|CAMPAIGN_INCOMPLETE/.test(stateText) || stateText === '0';
  const base = {
    entityType,
    id: String(entity.id),
    currentBid: bid,
    source,
    actionSource: [source],
    adType: String(entityType).startsWith('sb') ? 'SB' : 'SP',
    entityLevel: entityType,
    canAutoExecute: true,
    riskLevel: 'low',
    reason: '',
    sku: meta.sku || card.sku,
    campaignId: meta.campaignId || '',
    adGroupId: meta.adGroupId || '',
    keywordId: entityType === 'keyword' || entityType === 'sbKeyword' ? String(entity.id) : '',
    targetId: entityType === 'autoTarget' || entityType === 'manualTarget' || entityType === 'sbTarget' ? String(entity.id) : '',
    candidateKey: meta.candidateKey || '',
  };

  if (hardInvalidState) {
    return { ...base, actionType: 'skip', canAutoExecute: false, riskLevel: 'skip', reason: '7天未调整命中，但对象状态不可执行，跳过' };
  }

  if (pausedState) {
    const canReopen =
      String(source || '').includes('7day') &&
      !lowStockRisk &&
      (
        (stats30.orders || 0) > 0 ||
        (stats30.clicks || 0) >= 8 ||
        (stats30.spend || 0) >= 3 ||
        Number(card.unitsSold_30d || 0) >= 80
      );
    if (!canReopen) {
      return { ...base, actionType: 'skip', canAutoExecute: false, riskLevel: 'skip', reason: '7day untouched hit, child entity is paused without enough relaunch signal' };
    }
    return {
      ...base,
      actionType: 'enable',
      reason: '7day untouched hit, child entity is paused but has historical signal, relaunch one representative entity first',
      snapshot: {
        spend7: parseFloat((stats7.spend || 0).toFixed(2)),
        spend30: parseFloat((stats30.spend || 0).toFixed(2)),
        orders30: stats30.orders || 0,
        clicks30: stats30.clicks || 0,
      },
    };
  }

  let factor = 0.97;
  let direction = 'down';
  let riskLevel = 'low_confidence';
  let reason = '7天未调整触达：数据方向不明确，轻微降3%';
  if ((stats7.orders || 0) === 0 && (stats7.spend || 0) > 3) {
    factor = 0.90;
    direction = 'down';
    riskLevel = 'low';
    reason = `7天未调整触达：近7天0单且花费$${stats7.spend.toFixed(2)}>3，降10%`;
  } else if ((stats7.acos || 0) > 0.30) {
    factor = 0.90;
    direction = 'down';
    riskLevel = 'low';
    reason = `7天未调整触达：近7天ACOS ${(stats7.acos * 100).toFixed(1)}%>30%，降10%`;
  } else if ((stats7.acos || 0) > 0 && stats7.acos <= 0.20 && (stats7.orders || 0) >= 2) {
    factor = 1.05;
    direction = 'up';
    riskLevel = 'low';
    reason = `7天未调整触达：近7天ACOS ${(stats7.acos * 100).toFixed(1)}%<=20%且订单${stats7.orders}，加5%`;
  } else if ((stats7.orders || 0) > 0) {
    factor = 1.03;
    direction = 'up';
    reason = '7天未调整触达：近7天有订单但信号较弱，轻微加3%';
  }

  const ambiguousHighVolume = ((stats7.orders || 0) >= 20 || (stats7.spend || 0) >= 80 || (stats30.orders || 0) >= 40) && riskLevel === 'low_confidence';
  if (lowStockRisk || ambiguousHighVolume) {
    return { ...base, actionType: 'review', canAutoExecute: false, riskLevel: 'manual_review', reason: `7天未调整命中，高风险需人工复核：库存${invDays || '-'}天，7日订单${stats7.orders || 0}，7日花费$${(stats7.spend || 0).toFixed(2)}` };
  }

  const suggestedBid = ensureTouchedBidChange(bid, factor, direction);
  if (suggestedBid == null) {
    return {
      ...base,
      actionType: 'skip',
      canAutoExecute: false,
      riskLevel: 'skip',
      reason: `7澶╂湭璋冩暣鍛戒腑锛屼絾褰撳墠鍑轰环 ${bid.toFixed(2)} 宸插埌鏈€灏忓彲瀹夊叏璋冩暣绮惧害锛岃烦杩?`,
    };
  }
  return {
    ...base,
    actionType: 'bid',
    suggestedBid,
    direction,
    riskLevel,
    reason,
    snapshot: {
      spend7: parseFloat((stats7.spend || 0).toFixed(2)),
      orders7: stats7.orders || 0,
      acos7: parseFloat(((stats7.acos || 0) * 100).toFixed(1)),
    },
  };
}

function touchActionForSbCampaign(row, source) {
  const stats7 = readStats(row);
  const campaignId = String(row.campaignId || row.campaign_id || '').trim();
  const sku = String(row.sku || row.SKU || row.raw_sku || row.product_sku || '').trim();
  const currentBudget = toNum(row.budget);
  const stateRisk = isInvalidState(row.state || row.status || row.servingStatus || row.campaignState);
  const base = {
    id: campaignId,
    entityType: 'sbCampaign',
    entityLevel: 'campaign',
    actionType: 'budget',
    source,
    actionSource: [source],
    adType: 'SB',
    canAutoExecute: true,
    riskLevel: 'low',
    reason: '',
    sku,
    campaignId,
    adGroupId: '',
    keywordId: '',
    targetId: '',
    candidateKey: `SB7::${campaignId}`,
    currentBudget,
    suggestedBudget: null,
    currentBid: currentBudget,
    suggestedBid: null,
  };

  if (!campaignId || !currentBudget || currentBudget <= 0) {
    return {
      ...base,
      actionType: 'review',
      canAutoExecute: false,
      riskLevel: 'manual_review',
      reason: '7天未调整SB活动缺少有效预算或活动ID，进入人工复核',
    };
  }

  if (stateRisk) {
    return {
      ...base,
      actionType: 'skip',
      canAutoExecute: false,
      riskLevel: 'skip',
      reason: '7天未调整命中，但SB活动状态不可执行，跳过',
    };
  }

  let factor = 0.97;
  let direction = 'down';
  let riskLevel = 'low_confidence';
  let reason = '7天未调整SB活动触达：数据方向不明确，预算轻微下调3%';
  if ((stats7.orders || 0) === 0 && (stats7.spend || 0) > 3) {
    factor = 0.90;
    direction = 'down';
    riskLevel = 'low';
    reason = `7天未调整SB活动触达：近7天0单且花费$${stats7.spend.toFixed(2)}>3，预算降10%`;
  } else if ((stats7.acos || 0) > 0.30) {
    factor = 0.90;
    direction = 'down';
    riskLevel = 'low';
    reason = `7天未调整SB活动触达：近7天ACOS ${(stats7.acos * 100).toFixed(1)}%>30%，预算降10%`;
  } else if ((stats7.acos || 0) > 0 && stats7.acos <= 0.20 && (stats7.orders || 0) >= 2) {
    factor = 1.05;
    direction = 'up';
    riskLevel = 'low';
    reason = `7天未调整SB活动触达：近7天ACOS ${(stats7.acos * 100).toFixed(1)}%<=20%且订单${stats7.orders}，预算加5%`;
  } else if ((stats7.orders || 0) > 0) {
    factor = 1.03;
    direction = 'up';
    reason = '7天未调整SB活动触达：近7天有订单但信号较弱，预算轻微上调3%';
  }

  const ambiguousHighVolume = ((stats7.orders || 0) >= 20 || (stats7.spend || 0) >= 80) && riskLevel === 'low_confidence';
  if (ambiguousHighVolume) {
    return {
      ...base,
      actionType: 'review',
      canAutoExecute: false,
      riskLevel: 'manual_review',
      reason: `7天未调整SB活动命中，但体量较大且方向不明确：7日订单${stats7.orders || 0}，7日花费$${(stats7.spend || 0).toFixed(2)}`,
    };
  }

  const suggestedBudget = parseFloat(Math.max(1, currentBudget * factor).toFixed(2));
  if (Math.abs(suggestedBudget - currentBudget) <= 0.001) return null;
  return {
    ...base,
    suggestedBudget,
    suggestedBid: suggestedBudget,
    direction,
    riskLevel,
    reason,
    snapshot: {
      spend7: parseFloat((stats7.spend || 0).toFixed(2)),
      orders7: stats7.orders || 0,
      acos7: parseFloat(((stats7.acos || 0) * 100).toFixed(1)),
    },
  };
}

function pickRepresentativeSevenDayEntity(matches) {
  if (!matches.length) return null;
  const score = match => {
    const row = match.row || {};
    const state = String(row.state || row.status || row.servingStatus || '').trim();
    const active = state === '1' || /ENABLED/i.test(state);
    const spend7 = toNum(row.spend7 ?? row.Spend7 ?? row.Spend) || 0;
    const spend30 = toNum(row.spend30 ?? row.Spend30 ?? row.Spend) || 0;
    const clicks30 = toNum(row.clicks30 ?? row.Clicks30 ?? row.Clicks) || 0;
    const orders30 = toNum(row.orders30 ?? row.Orders30 ?? row.Orders) || 0;
    return (active ? 100000 : 0) + spend7 * 1000 + spend30 * 100 + orders30 * 10 + clicks30;
  };
  return [...matches].sort((a, b) => score(b) - score(a))[0];
}

function buildSevenDayPlans(cards, spRows, sbRows, rowsByType, history = []) {
  const plans = [];
  const review = [];
  const skipped = [];
  const cardBySku = new Map(cards.map(card => [String(card.sku || ''), card]));
  const planBySku = new Map();

  function pushAction(sku, action) {
    if (!planBySku.has(sku)) planBySku.set(sku, { sku, actions: [] });
    planBySku.get(sku).actions.push(action);
  }

  function handleOutcome(sku, action) {
    if (!action) return;
    if (action.actionType === 'bid') pushAction(sku, action);
    else if (action.actionType === 'review') review.push({ sku, dedupeKey: action.dedupeKey || action.candidateKey || '', actionSource: action.actionSource, source: action.source, action });
    else if (action.actionType === 'skip') skipped.push({ sku, dedupeKey: action.dedupeKey || action.candidateKey || '', actionSource: action.actionSource, source: action.source, action });
  }

  for (const row of spRows || []) {
    const sku = String(row.sku || row.SKU || '').trim();
    const campaignId = String(row.campaignId || row.campaign_id || '').trim();
    const adGroupId = String(row.adGroupId || row.ad_group_id || '').trim();
    const candidateKey = `SP7::${sku}::${campaignId}::${adGroupId}`;
    const recentlyBlocked = hasRecentOutcome(
      history,
      h => h.candidateKey === candidateKey || (String(h.campaignId || '') === campaignId && String(h.adGroupId || '') === adGroupId),
      'blocked_by_system_recent_adjust',
      7
    );
    if (recentlyBlocked) {
      skipped.push({
        sku,
        dedupeKey: candidateKey,
        actionSource: ['sp_7day_untouched'],
        source: 'sp_7day_untouched',
        action: {
          id: candidateKey,
          entityType: 'adGroup',
          entityLevel: 'adGroup',
          source: 'sp_7day_untouched',
          actionSource: ['sp_7day_untouched'],
          canAutoExecute: false,
          riskLevel: 'cooldown',
          actionType: 'skip',
          reason: '7天未调整对象近期已被系统自动调价拦截，进入冷却期，本轮不重复执行',
          candidateKey,
          campaignId,
          adGroupId,
          sku,
        },
      });
      continue;
    }
    const card = cardBySku.get(sku);
    if (!card) {
      review.push({ sku, dedupeKey: candidateKey, actionSource: ['sp_7day_untouched'], source: 'sp_7day_untouched', action: { id: candidateKey, entityType: 'skuCandidate', entityLevel: 'skuCandidate', source: 'sp_7day_untouched', actionSource: ['sp_7day_untouched'], canAutoExecute: false, riskLevel: 'manual_review', actionType: 'review', reason: '7天未调整候选未映射到SKU画像，进入人工复核', candidateKey, campaignId, adGroupId, sku } });
      continue;
    }
    const matches = [
      ...(rowsByType.keyword || []).filter(r => String(r.campaignId || r.campaign_id || '').trim() === campaignId && String(r.adGroupId || r.ad_group_id || '').trim() === adGroupId).map(r => ({ row: r, entityType: 'keyword' })),
      ...(rowsByType.autoTarget || []).filter(r => String(r.campaignId || r.campaign_id || '').trim() === campaignId && String(r.adGroupId || r.ad_group_id || '').trim() === adGroupId).map(r => ({ row: r, entityType: 'autoTarget' })),
      ...(rowsByType.manualTarget || []).filter(r => String(r.campaignId || r.campaign_id || '').trim() === campaignId && String(r.adGroupId || r.ad_group_id || '').trim() === adGroupId).map(r => ({ row: r, entityType: 'manualTarget' })),
    ];
    if (!matches.length) {
      review.push({ sku, dedupeKey: candidateKey, actionSource: ['sp_7day_untouched'], source: 'sp_7day_untouched', action: { id: candidateKey, entityType: 'adGroup', entityLevel: 'adGroup', source: 'sp_7day_untouched', actionSource: ['sp_7day_untouched'], canAutoExecute: false, riskLevel: 'manual_review', actionType: 'review', reason: '7天未调整候选未钻取到真实SP执行层，进入人工复核', candidateKey, campaignId, adGroupId, sku } });
      continue;
    }
    const representative = pickRepresentativeSevenDayEntity(matches);
    for (const match of representative ? [representative] : []) {
      const bid = toNum(match.row.bid || match.row.defaultBid || match.row.cpcBid);
      const entityStats = readStats(match.row);
      const fallbackStats = readStats(row);
      const hasEntitySignal = (entityStats.spend || 0) > 0 || (entityStats.orders || 0) > 0 || (entityStats.acos || 0) > 0;
      const entity = {
        id: String(match.row.keywordId || match.row.targetId || match.row.id || ''),
        bid,
        state: match.row.state || match.row.status || match.row.servingStatus,
        stats7d: hasEntitySignal ? entityStats : fallbackStats,
        stats30d: entityStats,
      };
      const action = touchActionForEntity(card, entity, match.entityType, 'sp_7day_untouched', hasEntitySignal ? entityStats : fallbackStats, { sku, campaignId, adGroupId, candidateKey });
      if (action) action.dedupeKey = dedupeKeyFor(action, { siteId: row.siteId || 4, campaignId, adGroupId, keywordId: match.entityType === 'keyword' ? entity.id : '', targetId: match.entityType !== 'keyword' ? entity.id : '' }, sku);
      handleOutcome(sku, action);
    }
    if (!representative) {
      review.push({ sku, dedupeKey: candidateKey, actionSource: ['sp_7day_untouched'], source: 'sp_7day_untouched', action: { id: candidateKey, entityType: 'adGroup', entityLevel: 'adGroup', source: 'sp_7day_untouched', actionSource: ['sp_7day_untouched'], canAutoExecute: false, riskLevel: 'manual_review', actionType: 'review', reason: '7day untouched candidate has child entities, but no representative executable entity was selected', candidateKey, campaignId, adGroupId, sku } });
    }
  }

  for (const row of sbRows || []) {
    const campaignId = String(row.campaignId || row.campaign_id || '').trim();
    const candidateKey = `SB7::${campaignId}`;
    const action = touchActionForSbCampaign(row, 'sb_7day_untouched');
    if (action) action.dedupeKey = dedupeKeyFor(action, { siteId: row.siteId || 4, campaignId }, '');
    if (action?.actionType === 'review') review.push({ sku: action.sku || '', dedupeKey: action.dedupeKey || candidateKey, actionSource: action.actionSource, source: action.source, action });
    else if (action?.actionType === 'skip') skipped.push({ sku: action.sku || '', dedupeKey: action.dedupeKey || candidateKey, actionSource: action.actionSource, source: action.source, action });
    else if (action) {
      const planSku = action.sku || campaignId;
      if (!planBySku.has(planSku)) planBySku.set(planSku, { sku: planSku, actions: [] });
      planBySku.get(planSku).actions.push(action);
    }
  }

  return { plans: [...planBySku.values()], review, skipped };
}

function mergePlans(strategyPlan, sevenDayPlan, rowsByType) {
  const mergedBySku = new Map();
  const actionByKey = new Map();
  let overlap = 0;

  function addAction(sku, action, source) {
    const rows = rowsByType[action.entityType] || [];
    const meta = rows.find(row => String(row.keywordId || row.targetId || row.id || '') === String(action.id)) || {};
    const normalizedAction = { ...action };
    if (normalizedAction.actionType !== 'budget' && normalizedAction.suggestedBid != null) {
      const minBid = minAllowedBidFor(normalizedAction, meta);
      const currentBid = toNum(normalizedAction.currentBid);
      const normalizedBid = parseFloat(Math.max(minBid, Number(normalizedAction.suggestedBid)).toFixed(2));
      if (currentBid != null && Math.abs(normalizedBid - currentBid) <= 0.001) return;
      normalizedAction.suggestedBid = normalizedBid;
    }
    const key = action.dedupeKey || dedupeKeyFor(action, meta, sku);
    const enriched = {
      ...normalizedAction,
      sku,
      dedupeKey: key,
      actionSource: normalizeSources(action.actionSource || source),
      source,
      adType: action.adType || (String(action.entityType || '').startsWith('sb') ? 'SB' : 'SP'),
      entityLevel: action.entityLevel || action.entityType,
      canAutoExecute: action.canAutoExecute !== false && ['bid', 'budget', 'enable', 'pause'].includes(action.actionType || 'bid'),
      riskLevel: action.riskLevel || 'strategy',
    };
    if (actionByKey.has(key)) {
      overlap++;
      const existing = actionByKey.get(key);
      existing.actionSource = [...new Set([...normalizeSources(existing.actionSource), ...normalizeSources(enriched.actionSource)])];
      if (!String(existing.reason || '').includes('7天未调整') && String(source).includes('7day')) {
        existing.reason = `${existing.reason || ''}；同时命中7天未调整池`;
      }
      return;
    }
    actionByKey.set(key, enriched);
    if (!mergedBySku.has(sku)) mergedBySku.set(sku, { sku, actions: [] });
    mergedBySku.get(sku).actions.push(enriched);
  }

  for (const p of strategyPlan || []) for (const a of p.actions || []) addAction(p.sku, a, 'strategy');
  for (const p of sevenDayPlan || []) for (const a of p.actions || []) addAction(p.sku, a, a.source || 'sp_7day_untouched');
  return { plan: [...mergedBySku.values()], overlap };
}

async function run() {
  const panelId = await findPanelId();
  log(`Panel ID: ${panelId}`);
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${panelId}`);
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await new Promise(resolve => ws.on('open', resolve));

  const eval_ = (expression, awaitPromise = false) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', handler);
      resolve(response.result && response.result.result && response.result.result.value);
    };
    ws.on('message', handler);
    send({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    });
  });

  async function execPanelJson(expression, awaitPromise = true) {
    const text = await eval_(`${expression}.then(d => JSON.stringify(d)).catch(e => JSON.stringify({code:0,msg:e.message,error:e.message}))`, awaitPromise);
    try {
      return JSON.parse(text || '{}');
    } catch (e) {
      return { code: 0, msg: e.message, raw: text };
    }
  }

  const executionEvents = [];
  const landedIds = new Set();

  function recordExecutionEvent(item, entityType, apiStatus, result) {
    const planItem = plan.find(p => p.sku === item.sku) ||
      plan.find(p => (p.actions || []).some(a => String(a.id) === String(item.id)));
    const action = (planItem?.actions || []).find(a => String(a.id) === String(item.id) && a.entityType === entityType) ||
      (planItem?.actions || []).find(a => String(a.id) === String(item.id)) ||
      item;
    executionEvents.push({
      sku: item.sku || planItem?.sku,
      id: item.id,
      bid: item.suggestedBid,
      suggestedBid: item.suggestedBid,
      currentBid: item.currentBid,
      suggestedBudget: item.suggestedBudget,
      currentBudget: item.currentBudget,
      entityType,
      apiStatus,
      success: false,
      plan: planItem || { sku: item.sku },
      action,
      source: action.source || item.source || 'strategy',
      actionSource: normalizeSources(action.actionSource || item.actionSource || action.source || item.source),
      riskLevel: action.riskLevel || item.riskLevel || '',
      canAutoExecute: action.canAutoExecute !== false,
      dedupeKey: action.dedupeKey || item.dedupeKey || '',
      executionKey: executionEntityKey(entityType, item.id),
      resultMessage: JSON.stringify(result || {}),
      errorReason: apiStatus === 'api_success' ? '' : JSON.stringify(result || {}),
    });
  }

  async function executeKeywordItems(items, metaById, typeLabel, endpoint, property, entityType, advType = 'SP') {
    let apiSuccess = 0;
    let apiFailed = 0;
    const { groups, skipped } = groupByAccountSite(items, item => metaById[String(item.id)], typeLabel);
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, entityType, 'failed', { msg: 'missing keyword metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const rows = batch.map(({ item, meta }) => ({
          ...meta,
          keywordId: item.id,
          bid: String(item.suggestedBid),
          siteId: meta.siteId || 4,
          accountId: meta.accountId,
          campaignId: meta.campaignId,
          adGroupId: meta.adGroupId,
          matchType: meta.matchType,
          advType,
          bidThreshold: meta.bidThreshold,
          adFormat: meta.adFormat,
          costType: meta.costType,
        }));
        const payload = {
          column: 'bid',
          property,
          operation: 'bid',
          manualTargetType: '',
          accountId: group.accountId,
          siteId: group.siteId,
          idArray: batch.map(({ item }) => item.id),
          campaignIdArray: [...new Set(rows.map(r => r.campaignId).filter(Boolean))],
          targetArray: rows,
          targetNewArray: rows,
        };
        const result = await execPanelJson(`execAdWrite(${JSON.stringify(endpoint)}, ${JSON.stringify(payload)})`);
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item }) => recordExecutionEvent(item, entityType, status, result));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function executeTargetItems(items, rows, typeLabel, endpoint, property, entityType, advType = 'SP') {
    let apiSuccess = 0;
    let apiFailed = 0;
    const { groups, skipped } = groupByAccountSite(
      items,
      item => rows.find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id)),
      typeLabel
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, entityType, 'failed', { msg: 'missing target metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const targetArray = batch.map(({ item, meta }) => ({
          ...meta,
          siteId: meta.siteId || 4,
          accountId: meta.accountId,
          campaignId: meta.campaignId,
          adGroupId: meta.adGroupId,
          targetId: item.id,
          bid: String(item.suggestedBid),
          advType,
          bidThreshold: meta.bidThreshold,
          adFormat: meta.adFormat,
          costType: meta.costType,
        }));
        const payload = {
          column: 'bid',
          property,
          operation: 'bid',
          accountId: group.accountId,
          siteId: group.siteId,
          idArray: batch.map(({ item }) => item.id),
          campaignIdArray: [...new Set(targetArray.map(r => r.campaignId).filter(Boolean))],
          targetArray,
          targetNewArray: targetArray,
        };
        const result = await execPanelJson(`execAdWrite(${JSON.stringify(endpoint)}, ${JSON.stringify(payload)})`);
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item }) => recordExecutionEvent(item, entityType, status, result));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function executeSbCampaignItems(items, rows, typeLabel) {
    let apiSuccess = 0;
    let apiFailed = 0;
    const { groups, skipped } = groupByAccountSite(
      items,
      item => rows.find(r => String(r.campaignId || r.campaign_id || '') === String(item.id)),
      typeLabel
    );
    apiFailed += skipped.length;
    skipped.forEach(item => recordExecutionEvent(item, 'sbCampaign', 'failed', { msg: 'missing sb campaign metadata' }));

    for (const [accountKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += BATCH) {
        const batch = group.items.slice(i, i + BATCH);
        const payload = {
          accountId: group.accountId,
          siteId: group.siteId,
          campaignIdArray: batch.map(({ item }) => String(item.id)),
          batchType: 'budget',
          batchValue: batch.map(({ item }) => item.suggestedBudget),
          campaignNewArray: batch.map(({ item, meta }) => ({
            siteId: meta.siteId || 4,
            accountId: meta.accountId,
            campaignId: String(item.id),
            budget: item.suggestedBudget,
          })),
        };
        const result = await execPanelJson(`execAdWrite(${JSON.stringify('/campaignSb/batchSbCampaign')}, ${JSON.stringify(payload)})`);
        const status = classifyApiResult(result);
        if (status === 'api_success') apiSuccess += batch.length;
        else apiFailed += batch.length;
        batch.forEach(({ item }) => recordExecutionEvent(item, 'sbCampaign', status, result));
        log(`${typeLabel} ${accountKey}: API ${status} ${batch.length}`);
        await wait(500);
      }
    }
    return { apiSuccess, apiFailed };
  }

  async function verifyLanding() {
    log('Refreshing data for post-write verification...');
    await eval_('STATE.kwRows = []; STATE.autoRows = []; STATE.targetRows = []; STATE.sbRows = [];');
    await eval_('fetchAllData().then(()=>true)', true);
    const verifyScript = `
      (() => {
        const events = ${JSON.stringify(executionEvents)};
        const bidNum = value => {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        };
        const normalizeState = value => {
          const text = String(value ?? '').trim();
          if (!text) return '';
          if (text === '1') return 'enabled';
          if (text === '2') return 'paused';
          const upper = text.toUpperCase();
          if (upper === 'ENABLED' || upper === 'ENABLE' || upper === 'ACTIVE') return 'enabled';
          if (upper === 'PAUSED' || upper === 'DISABLED' || upper === 'ARCHIVED' || upper === 'ENDED') return 'paused';
          const lower = text.toLowerCase();
          if (lower === 'enabled' || lower === 'enable' || lower === 'active') return 'enabled';
          if (lower === 'paused' || lower === 'disabled' || lower === 'archived' || lower === 'ended') return 'paused';
          return lower;
        };
        const expectedStateFor = event => {
          if (event.action?.actionType === 'enable') return 'enabled';
          if (event.action?.actionType === 'pause') return 'paused';
          return '';
        };
        const rowId = row => String(row.keywordId || row.targetId || row.id || row.keyword_id || '').trim();
        const rowsFor = type => {
          if (type === 'keyword') return STATE.kwRows || [];
          if (type === 'manualTarget') return STATE.targetRows || [];
          if (type === 'sbKeyword') return (STATE.sbRows || []).filter(r => String(r.__adProperty || '') === '4');
          if (type === 'sbTarget') return (STATE.sbRows || []).filter(r => String(r.__adProperty || '') === '6');
          if (type === 'sbCampaign') return STATE.sb7DayUntouchedRows || [];
          return STATE.autoRows || [];
        };
        return JSON.stringify(events.map(event => {
          const out = { ...event };
          if (event.apiStatus !== 'api_success') {
            out.finalStatus = event.apiStatus === 'blocked_by_system_recent_adjust' || event.apiStatus === 'conflict' ? 'blocked_by_system_recent_adjust' : 'failed';
            out.success = false;
            out.errorReason = event.errorReason || event.resultMessage || '';
            return out;
          }
          const sourceTags = Array.isArray(event.actionSource) ? event.actionSource : (event.actionSource ? [event.actionSource] : []);
          const isSpSevenDayTouch = sourceTags.includes('sp_7day_untouched');
          if (isSpSevenDayTouch) {
            const stillInSpUntouchedPool = (STATE.sp7DayUntouchedRows || []).some(r =>
              String(r.campaignId || r.campaign_id || '') === String(event.action?.campaignId || '') &&
              String(r.adGroupId || r.ad_group_id || '') === String(event.action?.adGroupId || '')
            );
            out.stillInSpUntouchedPool = stillInSpUntouchedPool;
            if (!stillInSpUntouchedPool) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
              return out;
            }
          }
          if (event.action?.actionType === 'enable' || event.action?.actionType === 'pause') {
            const row = rowsFor(event.entityType).find(r => rowId(r) === String(event.id));
            const expectedState = expectedStateFor(event);
            const actualState = row ? normalizeState(row.state ?? row.status ?? row.servingStatus ?? row.activeStatus) : '';
            out.rowFound = !!row;
            out.expectedState = expectedState;
            out.actualState = actualState;
            if (row && actualState === expectedState) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
            } else {
              out.finalStatus = 'not_landed';
              out.success = false;
              out.errorReason = row ? 'state action API success but state not landed' : 'state action API success but row missing on verify';
            }
            return out;
          }
          if (event.entityType === 'sbCampaign') {
            const row = (STATE.sb7DayUntouchedRows || []).find(r => String(r.campaignId || r.campaign_id || '') === String(event.id));
            const expected = bidNum(event.suggestedBudget ?? event.suggestedBid ?? event.bid);
            const actual = row ? bidNum(row.budget) : null;
            out.rowFound = !!row;
            out.expectedBid = expected;
            out.actualBid = actual;
            if (!row) {
              out.finalStatus = 'success';
              out.success = true;
              out.errorReason = '';
            } else {
              out.finalStatus = 'not_landed';
              out.success = false;
              out.errorReason = actual != null && expected != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}
                ? 'SB活动预算已变化，但仍停留在7天未调整池'
                : 'SB活动预算回查未生效且仍停留在7天未调整池';
            }
            return out;
          }
          const row = rowsFor(event.entityType).find(r => rowId(r) === String(event.id));
          const expected = bidNum(event.suggestedBid ?? event.bid);
          const actual = row ? bidNum(row.bid ?? row.defaultBid ?? row.cpcBid) : null;
          out.rowFound = !!row;
          out.expectedBid = expected;
          out.actualBid = actual;
          if (row && expected != null && actual != null && Math.abs(actual - expected) < ${VERIFY_TOLERANCE}) {
            out.finalStatus = 'success';
            out.success = true;
            out.errorReason = '';
          } else {
            out.finalStatus = 'not_landed';
            out.success = false;
            out.errorReason = row ? '接口成功但回查未生效' : '接口成功但回查缺失行';
          }
          return out;
        }));
      })()
    `;
    const text = await eval_(verifyScript, true);
    return JSON.parse(text || '[]');
  }

  async function fetchPanelDataDirect() {
    let meta = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const text = await eval_(`(async () => {
        document.getElementById("log").innerHTML = "";
        await fetchAllData();
        return JSON.stringify({
          cards: (STATE.productCards || []).length,
          kwRows: (STATE.kwRows || []).length,
          autoRows: (STATE.autoRows || []).length,
          targetRows: (STATE.targetRows || []).length,
          sbRows: (STATE.sbRows || []).length,
          sp7: (STATE.sp7DayUntouchedRows || []).length,
          sb7: (STATE.sb7DayUntouchedRows || []).length,
          logText: document.getElementById("log").innerText || ""
        });
      })()`, true);
      meta = JSON.parse(text || '{}');
      if (meta.cards > 0 || meta.kwRows > 0 || meta.autoRows > 0 || meta.targetRows > 0 || meta.sbRows > 0) {
        log(`Data ready on attempt ${attempt}: cards=${meta.cards}, kw=${meta.kwRows}, auto=${meta.autoRows}, target=${meta.targetRows}, sb=${meta.sbRows}`);
        return meta;
      }
      const last = String(meta.logText || '').split('\n').filter(Boolean).slice(-1)[0] || 'no panel log';
      log(`Fetch attempt ${attempt} returned empty state, retrying: ${last}`);
      await wait(3000);
    }
    return meta;
  }

  log('=== Auto adjustment run started ===');
  log('Fetching full data...');
  let fetchMeta = null;
  fetchMeta = await fetchPanelDataDirect();
  while (false) {
    await wait(10000);
    const logText = await eval_('document.getElementById("log").innerText');
    if (logText && logText.includes('全量数据就绪')) {
      log('Data ready');
      break;
    }
    if (logText && logText.includes('拉取失败')) {
      log(`Fatal fetch error: ${(logText || '').split('\n').slice(-1)[0]}`);
      ws.close();
      process.exit(1);
    }
    const last = (logText || '').split('\n').filter(Boolean).slice(-1)[0] || '';
    if (last) log(`  ${last}`);
  }

  const cards = JSON.parse(await eval_('JSON.stringify(STATE.productCards)') || '[]');
  const kwRows = JSON.parse(await eval_('JSON.stringify(STATE.kwRows)') || '[]');
  const autoTargetRows = JSON.parse(await eval_('JSON.stringify(STATE.autoRows)') || '[]');
  const manualTargetRows = JSON.parse(await eval_('JSON.stringify(STATE.targetRows)') || '[]');
  const sbKwRows = JSON.parse(await eval_('JSON.stringify((STATE.sbRows||[]).filter(r=>String(r.__adProperty)==="4"))') || '[]');
  const sbTargetRows = JSON.parse(await eval_('JSON.stringify((STATE.sbRows||[]).filter(r=>String(r.__adProperty)==="6"))') || '[]');
  const sp7DayRows = JSON.parse(await eval_('JSON.stringify(STATE.sp7DayUntouchedRows || [])') || '[]');
  const sb7DayRows = JSON.parse(await eval_('JSON.stringify(STATE.sb7DayUntouchedRows || [])') || '[]');
  const sevenDayMeta = JSON.parse(await eval_('JSON.stringify(STATE.sevenDayUntouchedMeta || {})') || '{}');
  log(`Product cards: ${cards.length}; SP keywords: ${kwRows.length}; SP auto: ${autoTargetRows.length}; SP manual targets: ${manualTargetRows.length}; SB keywords: ${sbKwRows.length}; SB targets: ${sbTargetRows.length}`);
  log(`7d untouched: SP candidates=${sp7DayRows.length}; SB candidates=${sb7DayRows.length}; SP granularity=${sevenDayMeta.sp?.entityLevel || 'unknown'}; SB granularity=${sevenDayMeta.sb?.entityLevel || 'unknown'}`);
  if (!cards.length) {
    ws.close();
    throw new Error(`No product cards after full fetch. Last fetch meta: ${JSON.stringify(fetchMeta || {})}`);
  }

  const history = loadHistory();
  const strategyPlan = [];
  const diagnosticPlanWithoutHistory = new Map();
  for (const card of cards) {
    const spSpend = card.adStats?.['30d']?.spend || 0;
    const sbSpend = card.sbStats?.['30d']?.spend || 0;
    const noHistoryActions = (spSpend > 0 || sbSpend > 0) ? analyzeCard(card, []) : [];
    diagnosticPlanWithoutHistory.set(card.sku, noHistoryActions);
    if (spSpend <= 0 && sbSpend <= 0) continue;
    const actions = analyzeCard(card, history);
    if (actions.length) strategyPlan.push({ sku: card.sku, actions });
  }
  const rowsByType = {
    keyword: kwRows,
    autoTarget: autoTargetRows,
    manualTarget: manualTargetRows,
    sbKeyword: sbKwRows,
    sbTarget: sbTargetRows,
    sbCampaign: sb7DayRows,
  };
  const sevenDay = buildSevenDayPlans(cards, sp7DayRows, sb7DayRows, rowsByType, history);
  const merged = mergePlans(strategyPlan, sevenDay.plans, rowsByType);
  const plan = merged.plan;
  const totalActions = plan.reduce((sum, item) => sum + item.actions.length, 0);
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `plan_${today}.json`), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `seven_day_untouched_${today}.json`), JSON.stringify({ meta: sevenDayMeta, spRows: sp7DayRows, sbRows: sb7DayRows, review: sevenDay.review, skipped: sevenDay.skipped }, null, 2));
  log(`Plan: ${plan.length} SKUs, ${totalActions} actions; strategySkus=${strategyPlan.length}; 7dSkus=${sevenDay.plans.length}; overlap=${merged.overlap}; manualReview=${sevenDay.review.length}; skipped=${sevenDay.skipped.length}`);
  if (DRY_RUN) {
    const allActions = plan.flatMap(p => (p.actions || []).map(a => ({ ...a, sku: p.sku })));
    const drySummary = allActions.reduce((acc, action) => {
      for (const source of normalizeSources(action.actionSource)) acc[`source:${source}`] = (acc[`source:${source}`] || 0) + 1;
      acc[`type:${action.entityType}`] = (acc[`type:${action.entityType}`] || 0) + 1;
      acc[`risk:${action.riskLevel || 'normal'}`] = (acc[`risk:${action.riskLevel || 'normal'}`] || 0) + 1;
      return acc;
    }, {});
    const dryReport = {
      dryRun: true,
      plannedSkus: plan.length,
      plannedActions: totalActions,
      strategyPlannedSkus: strategyPlan.length,
      sevenDayPlannedSkus: sevenDay.plans.length,
      sevenDayStats: {
        spCandidates: sp7DayRows.length,
        spExecutable: allActions.filter(a => normalizeSources(a.actionSource).includes('sp_7day_untouched') && a.canAutoExecute !== false).length,
        sbCandidates: sb7DayRows.length,
        sbExecutable: allActions.filter(a => normalizeSources(a.actionSource).includes('sb_7day_untouched') && a.canAutoExecute !== false).length,
        overlapWithStrategy: merged.overlap,
        manualReview: sevenDay.review.length,
        invalidSkipped: sevenDay.skipped.length,
        granularity: sevenDayMeta,
      },
      drySummary,
    };
    fs.writeFileSync(path.join(SNAPSHOTS_DIR, `execution_dry_run_${today}.json`), JSON.stringify(dryReport, null, 2));
    log(`DRY_RUN complete: ${JSON.stringify(dryReport.sevenDayStats)}`);
    ws.close();
    return;
  }

  const kwItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'keyword' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const atItems = plan.flatMap(p => p.actions.filter(a => (a.entityType === 'autoTarget' || a.entityType === 'manualTarget') && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbKwItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbKeyword' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbTargetItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbTarget' && (a.actionType || 'bid') === 'bid').map(a => ({ ...a, sku: p.sku })));
  const sbCampaignItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'sbCampaign').map(a => ({ ...a, sku: p.sku })));
  const stateItems = plan.flatMap(p => p.actions.filter(a => ['enable', 'pause'].includes(a.actionType)).map(a => ({ ...a, sku: p.sku })));

  const kwMeta = Object.fromEntries(kwRows.map(row => [String(row.keywordId), row]));
  const sbKwMeta = Object.fromEntries(sbKwRows.map(row => [String(row.keywordId), row]));
  const autoTargetIds = new Set(autoTargetRows.map(row => String(row.targetId || row.target_id || row.id || '')));
  const manualTargetIds = new Set(manualTargetRows.map(row => String(row.targetId || row.target_id || row.id || '')));
  const spAutoItems = atItems.filter(item => autoTargetIds.has(String(item.id)));
  const spManualItems = atItems.filter(item => manualTargetIds.has(String(item.id)) && !autoTargetIds.has(String(item.id)));
  const spUnknownItems = atItems.filter(item => !autoTargetIds.has(String(item.id)) && !manualTargetIds.has(String(item.id)));
  spUnknownItems.forEach(item => recordExecutionEvent(item, 'autoTarget', 'failed', { msg: 'missing target row metadata' }));

  const apiStats = {};
  async function executeStateItems(items, rowsByEntityType) {
    let apiSuccess = 0;
    let apiFailed = 0;
    for (const item of items) {
      const rows = rowsByEntityType[item.entityType] || [];
      const meta = rows.find(row => String(row.keywordId || row.targetId || row.target_id || row.id || row.keyword_id || '') === String(item.id));
      if (!meta) {
        apiFailed += 1;
        recordExecutionEvent(item, item.entityType, 'failed', { msg: 'missing state row metadata' });
        continue;
      }
      const result = await execPanelJson(`toggleAdState(${JSON.stringify(meta)}, ${JSON.stringify(item.actionType)}, ${JSON.stringify(item.entityType)})`);
      const status = result?.ok ? 'api_success' : classifyApiResult(result?.rawResponse || { code: result?.responseCode, msg: result?.responseMsg, reason: result?.reason });
      if (status === 'api_success') apiSuccess += 1;
      else apiFailed += 1;
      recordExecutionEvent(item, item.entityType, status, result);
      log(`State ${item.actionType} ${item.entityType} ${item.id}: ${status}`);
      await wait(200);
    }
    return { apiSuccess, apiFailed };
  }
  apiStats.state = await executeStateItems(stateItems, {
    keyword: kwRows,
    autoTarget: autoTargetRows,
    manualTarget: manualTargetRows,
    sbKeyword: sbKwRows,
    sbTarget: sbTargetRows,
  });
  apiStats.keyword = await executeKeywordItems(kwItems, kwMeta, 'SP keyword', '/keyword/batchKeyword', 'keyword', 'keyword');
  apiStats.sbKeyword = await executeKeywordItems(sbKwItems, sbKwMeta, 'SB keyword', '/keywordSb/batchEditKeywordSbColumn', '', 'sbKeyword', 'SB');
  apiStats.autoTarget = await executeTargetItems(spAutoItems, autoTargetRows, 'SP auto target', '/advTarget/batchEditAutoTarget', 'autoTarget', 'autoTarget');
  apiStats.manualTarget = await executeTargetItems(spManualItems, manualTargetRows, 'SP manual target', '/advTarget/batchUpdateManualTarget', 'manualTarget', 'manualTarget');
  apiStats.unknownTarget = { apiSuccess: 0, apiFailed: spUnknownItems.length };
  apiStats.sbTarget = await executeTargetItems(sbTargetItems, sbTargetRows, 'SB target', '/sbTarget/batchEditTargetSbColumn', '', 'sbTarget', 'SB');
  apiStats.sbCampaign = await executeSbCampaignItems(sbCampaignItems, sb7DayRows, 'SB campaign');

  const verifiedEvents = await verifyLanding();
  const finalCounts = summarize(verifiedEvents);
  const eventsBySku = groupEventsBySku(verifiedEvents);
  for (const event of verifiedEvents) {
    if (event.finalStatus === 'success') landedIds.add(executionEntityKey(event.entityType, event.id));
  }

  const nonExecutionEvents = [
    ...sevenDay.review.map(item => ({
      sku: item.sku,
      id: item.action.id,
      dedupeKey: item.dedupeKey || item.action?.dedupeKey || item.action?.candidateKey || '',
      source: item.source || item.action?.source || 'sp_7day_untouched',
      actionSource: item.actionSource || item.action?.actionSource || [item.source || item.action?.source || 'sp_7day_untouched'],
      bid: item.action.suggestedBid,
      suggestedBid: item.action.suggestedBid,
      currentBid: item.action.currentBid,
      entityType: item.action.entityType,
      apiStatus: 'manual_review',
      finalStatus: 'manual_review',
      success: false,
      plan: { sku: item.sku, summary: '七天未调整人工复核' },
      action: item.action,
      resultMessage: 'manual_review',
      errorReason: item.action.reason,
    })),
    ...sevenDay.skipped.map(item => ({
      sku: item.sku,
      id: item.action.id,
      dedupeKey: item.dedupeKey || item.action?.dedupeKey || item.action?.candidateKey || '',
      source: item.source || item.action?.source || 'sp_7day_untouched',
      actionSource: item.actionSource || item.action?.actionSource || [item.source || item.action?.source || 'sp_7day_untouched'],
      entityType: item.action.entityType,
      apiStatus: 'skipped_invalid_state',
      finalStatus: 'skipped_invalid_state',
      success: false,
      plan: { sku: item.sku, summary: '七天未调整跳过' },
      action: item.action,
      resultMessage: 'skipped_invalid_state',
      errorReason: item.action.reason,
    })),
  ];

  const noteEvents = [...verifiedEvents, ...nonExecutionEvents];
  const noteResultText = noteEvents.length
    ? await eval_(
        'appendInventoryOperationNotes(' + JSON.stringify(noteEvents) + ')' +
        '.then(d => JSON.stringify(d)).catch(e => JSON.stringify([{ok:false,error:e.message}]))',
        true
      )
    : '[]';
  const noteResults = JSON.parse(noteResultText || '[]');
  const noteFailures = noteResults.filter(r => !r.ok);

  fs.writeFileSync(
    path.join(SNAPSHOTS_DIR, `execution_verify_${today}.json`),
    JSON.stringify({ apiStats, finalCounts, noteResults, events: verifiedEvents, nonExecutionEvents }, null, 2)
  );

  const newHistory = loadHistory();
  for (const p of plan) {
    for (const a of p.actions) {
      if (!landedIds.has(executionEntityKey(a.entityType, a.id))) continue;
      newHistory.push({
        entityId: a.id,
        sku: p.sku,
        entityType: a.entityType,
        date: today,
        fromBid: a.currentBid,
        toBid: a.suggestedBid,
        direction: a.direction,
        reason: a.reason,
      });
    }
  }
  for (const event of verifiedEvents) {
    if (!['blocked_by_system_recent_adjust', 'failed'].includes(event.finalStatus)) continue;
    const action = event.action || {};
    newHistory.push({
      entityId: event.id,
      sku: event.sku,
      entityType: event.entityType,
      date: today,
      outcome: event.finalStatus,
      candidateKey: action.candidateKey || '',
      campaignId: action.campaignId || '',
      adGroupId: action.adGroupId || '',
      direction: action.direction || '',
      reason: action.reason || event.errorReason || event.resultMessage || '',
    });
  }
  for (const event of nonExecutionEvents) {
    if (!['manual_review', 'skipped_invalid_state'].includes(event.finalStatus)) continue;
    const action = event.action || {};
    newHistory.push({
      entityId: event.id,
      sku: event.sku,
      entityType: event.entityType,
      date: today,
      outcome: event.finalStatus,
      candidateKey: action.candidateKey || '',
      campaignId: action.campaignId || '',
      adGroupId: action.adGroupId || '',
      direction: action.direction || '',
      reason: action.reason || event.errorReason || event.resultMessage || '',
    });
  }
  saveHistory(newHistory);

  const planBySku = new Map(plan.map(item => [item.sku, item]));
  const reviewBySku = groupEventsBySku(nonExecutionEvents.filter(event => event.finalStatus === 'manual_review'));
  const skippedBySku = groupEventsBySku(nonExecutionEvents.filter(event => event.finalStatus === 'skipped_invalid_state'));
  const coverage = cards.map(card => {
    const sku = card.sku;
    const events = eventsBySku.get(sku) || [];
    const reviewEvents = reviewBySku.get(sku) || [];
    const skipEvents = skippedBySku.get(sku) || [];
    const actionCount = planBySku.get(sku)?.actions?.length || 0;
    const noHistoryActionCount = diagnosticPlanWithoutHistory.get(sku)?.length || 0;
    const finalStatuses = events.reduce((acc, event) => {
      const key = event.finalStatus || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    let status = 'no_action';
    let reason = 'current_rules_no_bid_change';
    if (events.some(event => event.finalStatus === 'success')) {
      status = 'adjusted';
      reason = 'verified_landed';
    } else if (events.some(event => event.finalStatus === 'blocked_by_system_recent_adjust' || event.finalStatus === 'conflict')) {
      status = 'blocked';
      reason = 'blocked_by_system_recent_adjust';
    } else if (events.some(event => event.finalStatus === 'not_landed')) {
      status = 'unverified';
      reason = 'api_success_but_not_landed';
    } else if (events.some(event => event.finalStatus === 'failed')) {
      status = 'failed';
      reason = 'execution_failed';
    } else if (reviewEvents.length) {
      status = 'manual_review';
      reason = 'seven_day_risk_review';
    } else if (skipEvents.length) {
      status = 'skipped';
      reason = 'invalid_or_paused_state';
    } else if (actionCount === 0 && noHistoryActionCount > 0) {
      status = 'suppressed';
      reason = 'history_cooldown_suppressed';
    } else if (((card.adStats?.['30d']?.spend || 0) <= 0) && ((card.sbStats?.['30d']?.spend || 0) <= 0)) {
      status = 'no_action';
      reason = 'no_recent_ad_spend';
    }
    return {
      sku,
      status,
      reason,
      plannedActions: actionCount,
      actionsIfIgnoringHistory: noHistoryActionCount,
      finalStatuses,
      invDays: card.invDays,
      spSpend30: card.adStats?.['30d']?.spend || 0,
      sbSpend30: card.sbStats?.['30d']?.spend || 0,
    };
  });
  const coverageSummary = coverage.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    acc[`reason:${item.reason}`] = (acc[`reason:${item.reason}`] || 0) + 1;
    return acc;
  }, {});

  const report = {
    plannedSkus: plan.length,
    plannedActions: totalActions,
    strategyPlannedSkus: strategyPlan.length,
    sevenDayPlannedSkus: sevenDay.plans.length,
    sevenDayStats: {
      spCandidates: sp7DayRows.length,
      spExecutable: plan.flatMap(p => p.actions || []).filter(a => normalizeSources(a.actionSource).includes('sp_7day_untouched') && a.canAutoExecute !== false).length,
      sbCandidates: sb7DayRows.length,
      sbExecutable: plan.flatMap(p => p.actions || []).filter(a => normalizeSources(a.actionSource).includes('sb_7day_untouched') && a.canAutoExecute !== false).length,
      overlapWithStrategy: merged.overlap,
      manualReview: sevenDay.review.length,
      invalidSkipped: sevenDay.skipped.length,
      blockedBySystemRecentAdjust: finalCounts.blocked_by_system_recent_adjust || finalCounts.conflict || 0,
      granularity: sevenDayMeta,
    },
    totalProductSkus: cards.length,
    apiStats,
    finalCounts,
    coverageSummary,
    noteSuccess: noteResults.filter(r => r.ok).length,
    noteFailure: noteFailures.length,
    missingAidSkus: noteFailures.map(r => ({ sku: r.sku, error: r.error })),
  };
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `execution_summary_${today}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(SNAPSHOTS_DIR, `execution_coverage_${today}.json`), JSON.stringify({ summary: coverageSummary, coverage }, null, 2));

  log(`Final lookup: success=${finalCounts.success || 0}, not_landed=${finalCounts.not_landed || 0}, blocked=${finalCounts.blocked_by_system_recent_adjust || finalCounts.conflict || 0}, failed=${finalCounts.failed || 0}`);
  log(`SKU coverage: adjusted=${coverageSummary.adjusted || 0}, blocked=${coverageSummary.blocked || 0}, suppressed=${coverageSummary.suppressed || 0}, no_action=${coverageSummary.no_action || 0}, failed=${coverageSummary.failed || 0}, unverified=${coverageSummary.unverified || 0}`);
  log(`Inventory notes: success=${report.noteSuccess}, failed=${report.noteFailure}`);
  log('=== Auto adjustment run finished ===');

  ws.close();
}

run().catch(e => {
  log(`Fatal error: ${e.stack || e.message}`);
  process.exit(1);
});
