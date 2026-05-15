function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value ?? '').trim();
}

const TYPE_META = {
  spKeyword: {
    channel: 'SP_KEYWORD',
    entityType: 'keyword',
    idField: 'keywordId',
    writerUrl: '/keyword/batchKeyword',
    property: 'keyword'
  },
  spAuto: {
    channel: 'SP_AUTO',
    entityType: 'autoTarget',
    idField: 'targetId',
    writerUrl: '/advTarget/batchUpdateManualTarget',
    property: 'autoTarget'
  },
  spTarget: {
    channel: 'SP_TARGET',
    entityType: 'manualTarget',
    idField: 'targetId',
    writerUrl: '/advTarget/batchUpdateManualTarget',
    property: 'manualTarget'
  },
  sbKeyword: {
    channel: 'SB_KEYWORD',
    entityType: 'sbKeyword',
    idField: 'keywordId',
    writerUrl: '/keywordSb/batchEditKeywordSbColumn'
  },
  sbTarget: {
    channel: 'SB_TARGET',
    entityType: 'sbTarget',
    idField: 'targetId',
    writerUrl: '/sbTarget/batchEditTargetSbColumn'
  }
};

function metricFromRow(row = {}) {
  const spend = num(row.Spend ?? row.spend);
  const sales = num(row.Sales ?? row.sales);
  const acosRaw = row.ACOS ?? row.acos;
  return {
    impressions: num(row.Impressions ?? row.impressions),
    clicks: num(row.Clicks ?? row.clicks),
    spend,
    orders: num(row.Orders ?? row.orders),
    sales,
    acos: acosRaw === null || acosRaw === undefined || acosRaw === '' ? null : num(acosRaw),
    cpc: num(row.CPC ?? row.cpc) || (num(row.Clicks ?? row.clicks) ? spend / num(row.Clicks ?? row.clicks) : 0)
  };
}

function normalizeLowEfficiencyRow(kind, row = {}, options = {}) {
  const meta = TYPE_META[kind];
  if (!meta) throw new Error(`unknown low-efficiency row kind: ${kind}`);
  const id = text(row[meta.idField] || row.id || row.targetId || row.keywordId);
  const current = metricFromRow(row);
  const metrics = { current, ...(options.metrics || {}) };
  if (!metrics[30]) metrics[30] = current;
  return {
    raw: row,
    kind,
    channel: meta.channel,
    entityType: meta.entityType,
    id,
    text: text(row.keywordText || row.type || row.targetText || row.targetType || row.asin || row.text),
    matchType: text(row.matchType || row.match_type),
    campaignId: text(row.campaignId),
    adGroupId: text(row.adGroupId),
    accountId: num(row.accountId),
    siteId: num(row.siteId) || 4,
    campaignName: text(row.campaignName),
    groupName: text(row.groupName),
    state: row.state,
    campaignState: row.campaignState,
    groupState: row.groupState,
    bid: num(row.bid),
    bidThreshold: row.bidThreshold,
    adFormat: row.adFormat,
    costType: row.costType,
    updatedAt: text(row.updatedAt || row.updated_at || row.modifiedAt),
    operatedAt: text(row.operatedAt || row.operationTime || row.remarkTime),
    hasRedMarker: row.mark !== null && row.mark !== undefined && row.mark !== '',
    metrics
  };
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoLike = raw.includes('T') ? raw : raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T00:00:00`;
  const date = new Date(`${isoLike}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value, now) {
  const date = parseDate(value);
  if (!date) return Infinity;
  return (now.getTime() - date.getTime()) / 86400000;
}

function activeEnough(entity) {
  return num(entity.state) === 1 && num(entity.campaignState) === 1 && num(entity.groupState) === 1;
}

function metricForWindow(entity, windowDays) {
  return entity.metrics[windowDays] || entity.metrics.current || entity.metrics[30] || {};
}

function hasRecentImprovement(entity, windowDays) {
  if (windowDays < 15) return false;
  const longMetric = metricForWindow(entity, windowDays);
  if (!(longMetric.orders > 0 && longMetric.acos > 0.3)) return false;
  const recentWindows = [15, 7, 3].filter(w => w < windowDays);
  return recentWindows.some(w => {
    const metric = entity.metrics[w];
    return metric && metric.orders > 0 && metric.acos !== null && metric.acos > 0 && metric.acos <= 0.25;
  });
}

function clampBid(value) {
  if (value >= 0.5) return Math.max(0.02, Number((Math.floor(value * 20) / 20).toFixed(2)));
  return Math.max(0.02, Number(value.toFixed(2)));
}

function bidDownAmount(metric, bid, windowDays) {
  if (metric.orders <= 0) {
    if (windowDays >= 30 && metric.clicks >= 15 && metric.spend >= 5) return bid;
    if (metric.spend >= 5 && bid >= 1) return 0.2;
    if (metric.clicks >= 15 && metric.spend >= 5) return 0.2;
    if (metric.clicks >= 10) return 0.15;
    if (metric.clicks >= 8) return 0.1;
    if (metric.clicks >= 5) return 0.05;
    return 0;
  }
  const acos = metric.acos || 0;
  if (windowDays >= 30 && acos > 0.7) return bid;
  if (windowDays < 30 && acos > 1) return bid;
  if (acos > 0.6) return 0.2;
  if (acos > 0.5) return 0.15;
  if (acos > 0.4) return 0.1;
  if (acos > 0.3) return 0.05;
  return 0;
}

function decideLowEfficiencyAction(entity, options = {}) {
  const windowDays = Number(options.windowDays || 30);
  const now = options.now instanceof Date ? options.now : new Date();
  if (!activeEnough(entity)) {
    return { actionType: 'skip', reasonCode: 'inactive_parent_or_entity', reason: 'Entity, campaign, or ad group is not enabled.' };
  }
  const lastAdjust = entity.operatedAt || entity.updatedAt;
  if (daysSince(lastAdjust, now) < windowDays) {
    return { actionType: 'skip', reasonCode: 'adjustment_window_not_elapsed', reason: `Last adjustment is inside the ${windowDays}-day window.` };
  }
  if (hasRecentImprovement(entity, windowDays)) {
    return { actionType: 'hold', reasonCode: 'recent_trend_improved', reason: `${windowDays}-day data is inefficient, but recent windows are improving.` };
  }
  const metric = metricForWindow(entity, windowDays);
  const amount = bidDownAmount(metric, entity.bid, windowDays);
  if (amount >= entity.bid) {
    return {
      actionType: 'pause',
      reasonCode: metric.orders > 0 ? 'acos_hard_stop' : 'no_order_hard_stop',
      reason: `${windowDays}d has ${metric.clicks || 0} clicks, spend ${metric.spend || 0}, ${metric.orders || 0} orders.`
    };
  }
  if (amount > 0) {
    const suggestedBid = clampBid(entity.bid - amount);
    return {
      actionType: 'bid',
      currentBid: entity.bid,
      suggestedBid,
      reasonCode: metric.orders > 0 ? 'acos_bid_down' : 'no_order_bid_down',
      reason: `${windowDays}d has ${metric.clicks || 0} clicks, spend ${metric.spend || 0}, ${metric.orders || 0} orders.`
    };
  }
  return { actionType: 'hold', reasonCode: 'low_efficiency_not_actionable', reason: 'Metrics do not justify a bid change yet.' };
}

function fmtBid(value) {
  return Number(value).toFixed(2);
}

function metricsFromRowWithWindows(row = {}) {
  const win = (suffix) => ({
    impressions: num(row[`impressions${suffix}`] ?? row[`Impressions${suffix}`]),
    clicks: num(row[`clicks${suffix}`] ?? row[`Clicks${suffix}`]),
    spend: num(row[`spend${suffix}`] ?? row[`Spend${suffix}`]),
    orders: num(row[`orders${suffix}`] ?? row[`Orders${suffix}`]),
    sales: num(row[`sales${suffix}`] ?? row[`Sales${suffix}`]),
    acos: row[`acos${suffix}`] === undefined || row[`acos${suffix}`] === null || row[`acos${suffix}`] === ''
      ? null
      : num(row[`acos${suffix}`]),
    cpc: num(row[`cpc${suffix}`] ?? row[`CPC${suffix}`]),
  });
  const current = metricFromRow(row);
  return {
    current,
    30: current,
    15: win('15'),
    7: win('7'),
    3: win('3'),
  };
}

function scanLowEfficiencyCandidates(snapshot = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const windowDays = Number(options.windowDays || 30);
  const sbRows = snapshot.sbRows || [];
  const sources = [
    { kind: 'spKeyword', rows: snapshot.kwRows || [] },
    { kind: 'spAuto', rows: snapshot.autoRows || [] },
    { kind: 'spTarget', rows: snapshot.targetRows || [] },
    { kind: 'sbKeyword', rows: sbRows.filter(row => String(row.__adProperty || '') === '4') },
    { kind: 'sbTarget', rows: sbRows.filter(row => String(row.__adProperty || '') === '6') },
  ];
  const candidates = [];
  const summary = { actionable: 0, skipped: 0, holds: 0, byKind: {} };
  for (const { kind, rows } of sources) {
    summary.byKind[kind] = { actionable: 0, skipped: 0, holds: 0, scanned: rows.length };
    for (const row of rows) {
      const entity = normalizeLowEfficiencyRow(kind, row, { metrics: metricsFromRowWithWindows(row) });
      const decision = decideLowEfficiencyAction(entity, { windowDays, now });
      const record = {
        kind,
        id: entity.id,
        sku: text(row.sku || ''),
        text: entity.text,
        matchType: entity.matchType,
        campaignId: entity.campaignId,
        adGroupId: entity.adGroupId,
        campaignName: entity.campaignName,
        groupName: entity.groupName,
        accountId: entity.accountId,
        siteId: entity.siteId,
        currentBid: entity.bid,
        lastAdjustedAt: entity.operatedAt || entity.updatedAt,
        metrics30: entity.metrics[30] || entity.metrics.current,
        metrics7: entity.metrics[7],
        metrics3: entity.metrics[3],
        decision,
      };
      if (decision.actionType === 'bid' || decision.actionType === 'pause') {
        record.suggestedBid = decision.suggestedBid !== undefined ? decision.suggestedBid : null;
        summary.actionable += 1;
        summary.byKind[kind].actionable += 1;
        candidates.push(record);
      } else if (decision.actionType === 'hold') {
        summary.holds += 1;
        summary.byKind[kind].holds += 1;
      } else {
        summary.skipped += 1;
        summary.byKind[kind].skipped += 1;
      }
    }
  }
  return { generatedAt: new Date().toISOString(), windowDays, summary, candidates };
}


function buildWriterRequest(entity, decision) {
  const meta = TYPE_META[entity.kind];
  if (!meta) throw new Error(`unsupported writer kind: ${entity.kind}`);

  if (entity.kind === 'spTarget' || entity.kind === 'spAuto' || entity.kind === 'sbTarget') {
    const id = entity.id;
    const base = {
      targetId: id,
      accountId: entity.accountId,
      campaignId: entity.campaignId,
      adGroupId: entity.adGroupId
    };
    if (decision.actionType === 'bid') {
      const item = { siteId: entity.siteId, ...base, bid: fmtBid(decision.suggestedBid) };
      const body = {
        column: 'bid',
        targetArray: [item],
        idArray: [id],
        operation: 'bid',
        accountId: entity.accountId,
        siteId: entity.siteId,
        campaignIdArray: [entity.campaignId],
        targetNewArray: [item]
      };
      if (meta.property) body.property = meta.property;
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
    if (decision.actionType === 'pause') {
      const targetArrayState = entity.kind === 'sbTarget' ? 'paused' : 'PAUSED';
      const body = {
        column: 'state',
        targetArray: [{ campaignId: entity.campaignId, adGroupId: entity.adGroupId, targetId: id, state: targetArrayState }],
        idArray: [id],
        operation: 'state',
        siteId: entity.siteId,
        accountId: entity.accountId,
        campaignIdArray: [entity.campaignId],
        targetNewArray: [{ ...base, state: 2 }]
      };
      if (meta.property) body.property = meta.property;
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
  }

  if (entity.kind === 'spKeyword') {
    const id = entity.id;
    if (decision.actionType === 'bid') {
      const row = {
        keywordId: id,
        accountId: entity.accountId,
        siteId: entity.siteId,
        campaignId: entity.campaignId,
        adGroupId: entity.adGroupId,
        matchType: entity.matchType,
        bid: fmtBid(decision.suggestedBid),
        advType: 'SP',
        bidThreshold: entity.bidThreshold,
        adFormat: entity.adFormat,
        costType: entity.costType
      };
      const body = {
        column: 'bid',
        property: meta.property || 'keyword',
        operation: 'bid',
        manualTargetType: '',
        accountId: entity.accountId,
        siteId: entity.siteId,
        idArray: [id],
        campaignIdArray: [entity.campaignId],
        targetArray: [row],
        targetNewArray: [row]
      };
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
    if (decision.actionType === 'pause') {
      const body = {
        siteId: entity.siteId,
        accountId: entity.accountId,
        column: 'state',
        targetArray: [{ keywordId: id, state: 'PAUSED' }],
        targetNewArray: [{ keywordId: id, state: 2, accountId: entity.accountId, campaignId: entity.campaignId, adGroupId: entity.adGroupId }],
        property: meta.property || 'keyword',
        idArray: [id],
        campaignIdArray: [entity.campaignId],
        operation: 'state'
      };
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
  }

  if (entity.kind === 'sbKeyword') {
    const id = entity.id;
    if (decision.actionType === 'bid') {
      const row = {
        keywordId: id,
        accountId: entity.accountId,
        siteId: entity.siteId,
        campaignId: entity.campaignId,
        adGroupId: entity.adGroupId,
        matchType: entity.matchType,
        bid: fmtBid(decision.suggestedBid),
        advType: 'SB'
      };
      const body = {
        column: 'bid',
        operation: 'bid',
        accountId: entity.accountId,
        siteId: entity.siteId,
        idArray: [id],
        campaignIdArray: [entity.campaignId],
        targetArray: [row],
        targetNewArray: [row]
      };
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
    if (decision.actionType === 'pause') {
      const body = {
        siteId: entity.siteId,
        accountId: entity.accountId,
        column: 'state',
        targetArray: [{ campaignId: entity.campaignId, adGroupId: entity.adGroupId, matchType: entity.matchType, keywordId: id, state: 'paused' }],
        targetNewArray: [{ campaignId: entity.campaignId, adGroupId: entity.adGroupId, matchType: entity.matchType, keywordId: id, state: 2, accountId: entity.accountId }]
      };
      return { method: 'PATCH', url: meta.writerUrl, body };
    }
  }

  throw new Error(`unsupported writer action: ${entity.kind}/${decision.actionType}`);
}

module.exports = {
  normalizeLowEfficiencyRow,
  decideLowEfficiencyAction,
  buildWriterRequest,
  scanLowEfficiencyCandidates
};
