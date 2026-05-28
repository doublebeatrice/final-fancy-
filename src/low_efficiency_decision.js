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
    writerUrl: '/advTarget/batchEditAutoTarget',
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

function latestTimestamp(...values) {
  let best = '';
  let bestTime = -Infinity;
  for (const value of values) {
    const date = parseDate(value);
    if (!date) continue;
    const time = date.getTime();
    if (time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isSameLocalDate(value, now) {
  const date = parseDate(value);
  if (!date) return false;
  return localDateKey(date) === localDateKey(now);
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

function isVideoSbKind(kind) {
  return kind === 'sbKeyword' || kind === 'sbTarget' || kind === 'sbKw';
}

function bidFloorFor(item = {}) {
  const kind = item.kind;
  const campaignName = text(item.campaignName || item.raw?.campaignName);
  if (isVideoSbKind(kind) && /sbv|video/i.test(campaignName)) return 0.25;
  return 0.02;
}

function clampBid(value, floor = 0.02) {
  const min = Number.isFinite(Number(floor)) ? Number(floor) : 0.02;
  if (value >= 0.5) return Math.max(min, Number((Math.floor(value * 20) / 20).toFixed(2)));
  return Math.max(min, Number(value.toFixed(2)));
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
  const lastAdjust = latestTimestamp(entity.operatedAt, entity.updatedAt);
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
    const suggestedBid = clampBid(entity.bid - amount, bidFloorFor(entity));
    if (suggestedBid >= entity.bid) {
      return {
        actionType: 'hold',
        reasonCode: 'bid_already_at_floor',
        reason: `Current bid ${Number(entity.bid).toFixed(2)} is already near the floor.`
      };
    }
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

const POOL_WINDOWS = [30, 15, 7, 3];

function presenceFlags(entry = {}) {
  const w = entry.windows || {};
  return {
    30: !!(w['30'] || w[30]),
    15: !!(w['15'] || w[15]),
    7:  !!(w['7']  || w[7]),
    3:  !!(w['3']  || w[3]),
  };
}

function classifyPoolPattern(flags) {
  const { 30: d30, 15: d15, 7: d7, 3: d3 } = flags;
  if (!d30 && !d15 && !d7 && !d3) return 'no_pool_membership';
  if (d30 && d15 && d7 && d3) return 'persistently_low';
  if (d30 && !d15 && !d7 && !d3) return 'improving_long_only';
  if (d30 && d15 && !d7 && !d3) return 'improving_recently';
  if (d30 && d15 && d7 && !d3) return 'improving_marginally';
  if (!d30 && d15 && d7 && d3) return 'recently_degraded';
  if (!d30 && !d15 && d7 && d3) return 'late_degrading';
  if (!d30 && !d15 && !d7 && d3) return 'noise_only_3d';
  if (d30 && !d15 && d7 && d3) return 'volatile_recent_degrade';
  if (d30 && d15 && !d7 && d3) return 'volatile_3d_degrade';
  if (d30 && !d15 && !d7 && d3) return 'volatile_3d_only';
  if (!d30 && d15 && !d7 && d3) return 'volatile_15_3';
  if (!d30 && d15 && d7 && !d3) return 'volatile_15_7';
  if (!d30 && d15 && !d7 && !d3) return 'volatile_15_only';
  if (d30 && !d15 && d7 && !d3) return 'volatile_30_7';
  return 'mixed_other';
}

const PATTERN_INTENT = {
  no_pool_membership:       { actionType: 'skip', reasonCode: 'no_pool_membership',         severity: 0 },
  improving_long_only:      { actionType: 'hold', reasonCode: 'recent_trend_improved',      severity: 0 },
  improving_recently:       { actionType: 'hold', reasonCode: 'recent_trend_improving',     severity: 0 },
  improving_marginally:     { actionType: 'hold', reasonCode: 'recent_trend_just_turned',   severity: 0 },
  noise_only_3d:            { actionType: 'hold', reasonCode: 'noise_only_3d',              severity: 0 },
  volatile_15_only:         { actionType: 'hold', reasonCode: 'volatile_no_recent_signal',  severity: 0 },
  volatile_30_7:            { actionType: 'hold', reasonCode: 'volatile_unclear_trend',     severity: 0 },
  volatile_15_3:            { actionType: 'hold', reasonCode: 'volatile_unclear_trend',     severity: 0 },
  volatile_15_7:            { actionType: 'hold', reasonCode: 'volatile_unclear_trend',     severity: 0 },
  volatile_3d_only:         { actionType: 'hold', reasonCode: 'noise_only_3d',              severity: 0 },
  recently_degraded:        { actionType: 'bid_small', reasonCode: 'recently_degraded',     severity: 1 },
  late_degrading:           { actionType: 'bid_small', reasonCode: 'late_degrading',        severity: 1 },
  volatile_recent_degrade:  { actionType: 'bid_small', reasonCode: 'volatile_recent_degrade', severity: 1 },
  volatile_3d_degrade:      { actionType: 'bid_small', reasonCode: 'volatile_3d_degrade',   severity: 1 },
  persistently_low:         { actionType: 'bid_or_pause', reasonCode: 'persistently_low',   severity: 2 },
  mixed_other:              { actionType: 'bid_small', reasonCode: 'mixed_other',           severity: 1 },
};

function pickFocusMetric(entry, pattern) {
  const w = entry.windows || {};
  if (pattern === 'persistently_low') return w['30'] || w[30] || w['15'] || w[15] || w['7'] || w[7] || w['3'] || w[3] || {};
  if (pattern === 'recently_degraded' || pattern === 'late_degrading' || pattern === 'volatile_recent_degrade' || pattern === 'volatile_3d_degrade') {
    return w['7'] || w[7] || w['3'] || w[3] || w['15'] || w[15] || {};
  }
  return w['30'] || w[30] || w['15'] || w[15] || w['7'] || w[7] || w['3'] || w[3] || {};
}

function smallBidStep(currentBid) {
  const bid = Number(currentBid) || 0;
  if (bid >= 1) return 0.10;
  if (bid >= 0.5) return 0.05;
  if (bid >= 0.2) return 0.03;
  return 0.02;
}

function metricWindow(entry = {}, windowDays) {
  return entry.windows?.[String(windowDays)]
    || entry.windows?.[windowDays]
    || entry.metrics?.[String(windowDays)]
    || entry.metrics?.[windowDays]
    || null;
}

function sevenDayRecoverySignal(entry = {}) {
  const metric = metricWindow(entry, 7);
  if (!metric) return null;
  const clicks = num(metric.clicks);
  const spend = num(metric.spend);
  const orders = num(metric.orders);
  const sales = num(metric.sales);
  const acos = metric.acos === null || metric.acos === undefined || metric.acos === '' ? null : num(metric.acos);
  if (!(orders > 0 && acos !== null && acos > 0 && acos <= 0.25)) return null;

  const bidUpCandidate = acos < 0.2;
  return {
    windowDays: 7,
    clicks,
    spend,
    orders,
    sales,
    acos,
    reasonCode: bidUpCandidate ? 'recent_recovery_under_20_acos' : 'recent_recovery_7d_acos_ok',
    opportunityAction: bidUpCandidate ? 'review_bid_up' : null,
    suggestedDirection: bidUpCandidate ? 'up' : 'hold',
    reason: `7d has recovered: clicks=${clicks}, spend=${spend.toFixed(2)}, orders=${orders}, acos=${acos.toFixed(3)}.`
  };
}

function attachRecoveryOpportunity(decision = {}, recovery = null) {
  if (!recovery || decision.actionType === 'bid' || decision.actionType === 'pause') return decision;
  const next = { ...decision, recoverySignal: recovery };
  if (recovery.opportunityAction) {
    next.opportunityAction = recovery.opportunityAction;
    next.suggestedDirection = recovery.suggestedDirection;
    next.opportunityReasonCode = recovery.reasonCode;
  }
  return next;
}

function wasteReasonCode(windowDays, kind, strength = '') {
  const suffix = strength ? `_${strength}` : '';
  return `cooldown_override_${windowDays}d_${kind}${suffix}`;
}

function wasteHitFromMetric(metric = {}, windowDays) {
  const clicks = num(metric.clicks);
  const spend = num(metric.spend);
  const orders = num(metric.orders);
  const acos = metric.acos === null || metric.acos === undefined || metric.acos === '' ? null : num(metric.acos);
  const isSevenDay = windowDays === 7;
  const zeroOrderClickGate = isSevenDay ? 7 : 5;
  const zeroOrderSpendGate = isSevenDay ? 2 : 2.5;
  const highAcosClickGate = 5;
  const highAcosSpendGate = isSevenDay ? 2 : 2.5;

  if (orders === 0 && (clicks >= zeroOrderClickGate || spend >= zeroOrderSpendGate)) {
    const hardStop = windowDays >= 15 && (clicks >= 8 || spend >= 3);
    const strength = hardStop ? 'hard_stop' : 'heavy_cut';
    return {
      windowDays,
      kind: 'zero_order',
      strength,
      severity: hardStop ? 100 : 80,
      clicks,
      spend,
      orders,
      acos,
      reasonCode: wasteReasonCode(windowDays, 'zero_order', strength),
      reason: `${windowDays}d still has clicks/spend with zero orders: clicks=${clicks}, spend=${spend.toFixed(2)}, orders=0.`
    };
  }

  if (orders > 0 && acos !== null && acos >= 0.3 && (clicks >= highAcosClickGate || spend >= highAcosSpendGate)) {
    const strength = acos >= 0.9 ? 'extreme_acos_cut' : acos >= 0.6 ? 'severe_acos_cut' : 'high_acos';
    return {
      windowDays,
      kind: 'high_acos',
      strength,
      severity: acos >= 0.9 ? 90 : acos >= 0.6 ? 70 : 20,
      clicks,
      spend,
      orders,
      acos,
      reasonCode: wasteReasonCode(windowDays, strength === 'high_acos' ? 'high_acos' : strength),
      reason: `${windowDays}d ACOS is still high despite orders: clicks=${clicks}, spend=${spend.toFixed(2)}, orders=${orders}, acos=${acos.toFixed(3)}.`
    };
  }

  return null;
}

function pickStrongerWasteHit(best, candidate) {
  if (!candidate) return best;
  if (!best) return candidate;
  if (candidate.severity !== best.severity) return candidate.severity > best.severity ? candidate : best;
  if ((candidate.acos || 0) !== (best.acos || 0)) return (candidate.acos || 0) > (best.acos || 0) ? candidate : best;
  return candidate.windowDays > best.windowDays ? candidate : best;
}

function bidTargetForWaste(entry = {}, waste = {}) {
  const bid = num(entry.bid) || 0;
  if (bid <= 0) return null;
  if (waste.strength === 'extreme_acos_cut' || waste.strength === 'heavy_cut') return clampBid(bid * 0.1, bidFloorFor(entry));
  if (waste.strength === 'severe_acos_cut') return clampBid(bid * 0.5, bidFloorFor(entry));
  return clampBid(bid - smallBidStep(bid), bidFloorFor(entry));
}

function decisionFromWaste(entry = {}, waste = {}, pattern = '', flags = presenceFlags(entry), prefix = 'residual') {
  if (!waste) return null;
  const reasonCode = waste.reasonCode.replace('cooldown_override_', `${prefix}_`);
  if (waste.strength === 'hard_stop') {
    return {
      actionType: 'pause',
      reasonCode,
      pattern,
      presence: flags,
      severity: waste.severity,
      reason: waste.reason
    };
  }

  const bid = num(entry.bid) || 0;
  const suggestedBid = bidTargetForWaste(entry, waste);
  if (!suggestedBid || suggestedBid >= bid) {
    return {
      actionType: 'hold',
      reasonCode: 'bid_already_at_floor',
      pattern,
      presence: flags,
      severity: waste.severity,
      reason: `Current bid ${bid.toFixed(2)} is already near the floor. ${waste.reason}`
    };
  }

  return {
    actionType: 'bid',
    currentBid: bid,
    suggestedBid,
    reasonCode,
    pattern,
    presence: flags,
    severity: waste.severity,
    reason: waste.reason
  };
}

function isStrongWasteDecision(decision = {}) {
  return decision.actionType === 'pause'
    || Number(decision.severity || 0) >= 70
    || /zero_order/.test(String(decision.reasonCode || ''));
}

function pauseEligibilityForPersistentlyLow(entry) {
  const w = entry.windows || {};
  const m30 = w['30'] || w[30] || {};
  const clicks30 = num(m30.clicks);
  const spend30 = num(m30.spend);
  const orders30 = num(m30.orders);
  const acos30 = m30.acos === null || m30.acos === undefined ? null : num(m30.acos);
  if (orders30 === 0 && clicks30 >= 15 && spend30 >= 5) return { pause: true, reasonCode: 'no_order_hard_stop' };
  if (orders30 > 0 && acos30 !== null && acos30 > 0.7) return { pause: true, reasonCode: 'acos_hard_stop' };
  return { pause: false };
}

function isExplicitlyDisabled(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (!s) return false;
    return s === 'paused' || s === 'archived' || s === 'disabled' || s === '0' || s === '2';
  }
  const n = Number(value);
  return Number.isFinite(n) && n !== 1;
}

function cooldownOverrideDecision(entry = {}, now = new Date()) {
  const lastAdjust = latestTimestamp(entry.operatedAt, entry.updatedAt);
  if (isSameLocalDate(lastAdjust, now)) return null;

  const windowHit = continuingWasteWindow(entry);
  if (!windowHit) return null;

  return decisionFromWaste(entry, windowHit, 'cooldown_override', presenceFlags(entry), 'cooldown_override');
}

function continuingWasteWindow(entry = {}) {
  const bid = num(entry.bid) || 0;
  if (bid <= 0) return null;

  const sevenDayMetric = metricWindow(entry, 7);
  const sevenDayHit = sevenDayMetric ? wasteHitFromMetric(sevenDayMetric, 7) : null;
  if (!sevenDayHit) return null;

  let best = null;
  for (const windowDays of [7, 15, 30]) {
    const metric = metricWindow(entry, windowDays);
    if (!metric) continue;
    best = pickStrongerWasteHit(best, wasteHitFromMetric(metric, windowDays));
  }

  return best;
}

function residualWasteBidDecision(entry = {}, pattern = '', flags = presenceFlags(entry)) {
  const waste = continuingWasteWindow(entry);
  if (!waste) return null;
  return decisionFromWaste(entry, waste, pattern, flags, 'residual');
}

function decideFromPoolMembership(entry = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const cooldownDays = Number(options.cooldownDays || 14);

  if (isExplicitlyDisabled(entry.state) || isExplicitlyDisabled(entry.campaignState) || isExplicitlyDisabled(entry.groupState)) {
    return { actionType: 'skip', reasonCode: 'inactive_parent_or_entity', pattern: 'inactive', presence: presenceFlags(entry), reason: 'Entity, campaign, or ad group is not enabled.' };
  }

  const flags = presenceFlags(entry);
  const recovery = sevenDayRecoverySignal(entry);
  const lastAdjust = latestTimestamp(entry.operatedAt, entry.updatedAt);
  if (daysSince(lastAdjust, now) < cooldownDays) {
    const override = cooldownOverrideDecision(entry, now);
    if (override) return override;
    return attachRecoveryOpportunity(
      { actionType: 'skip', reasonCode: 'adjustment_cooldown_not_elapsed', pattern: 'cooldown', presence: flags, reason: `Last adjustment is inside the ${cooldownDays}-day cooldown.` },
      recovery
    );
  }

  const pattern = classifyPoolPattern(flags);
  const intent = PATTERN_INTENT[pattern] || PATTERN_INTENT.mixed_other;
  const focus = pickFocusMetric(entry, pattern);
  const focusSummary = `clicks=${num(focus.clicks)}, spend=${num(focus.spend).toFixed(2)}, orders=${num(focus.orders)}, acos=${focus.acos === null || focus.acos === undefined ? '-' : Number(focus.acos).toFixed(3)}`;
  const presenceSummary = `30d=${flags[30] ? 'in' : 'ok'} 15d=${flags[15] ? 'in' : 'ok'} 7d=${flags[7] ? 'in' : 'ok'} 3d=${flags[3] ? 'in' : 'ok'}`;

  if (recovery) {
    return attachRecoveryOpportunity({
      actionType: 'hold',
      reasonCode: recovery.reasonCode,
      pattern,
      presence: flags,
      reason: `${presenceSummary}. ${recovery.reason}`
    }, recovery);
  }

  if (pattern === 'improving_marginally') {
    const residual = residualWasteBidDecision(entry, pattern, flags);
    if (residual) return residual;
  }

  if (intent.actionType === 'skip' || intent.actionType === 'hold') {
    const residual = residualWasteBidDecision(entry, pattern, flags);
    if (residual) return residual;
    const decision = { actionType: intent.actionType === 'skip' ? 'skip' : 'hold', reasonCode: intent.reasonCode, pattern, presence: flags, reason: `${presenceSummary}. ${focusSummary}.` };
    return attachRecoveryOpportunity(decision, recovery);
  }

  const bid = num(entry.bid) || 0;
  if (bid <= 0) {
    return { actionType: 'hold', reasonCode: 'missing_bid', pattern, presence: flags, reason: `Cannot compute bid step without a current bid. ${presenceSummary}.` };
  }

  if (intent.actionType === 'bid_or_pause') {
    const eligibility = pauseEligibilityForPersistentlyLow(entry);
    if (eligibility.pause) {
      return { actionType: 'pause', reasonCode: eligibility.reasonCode, pattern, presence: flags, reason: `${presenceSummary}. 30d ${focusSummary}.` };
    }
    const strongResidual = residualWasteBidDecision(entry, pattern, flags);
    if (strongResidual && isStrongWasteDecision(strongResidual)) return strongResidual;
    const focusMetric = entry.windows?.['30'] || entry.windows?.[30] || focus;
    const amount = bidDownAmount(focusMetric, bid, 30);
    if (amount >= bid) {
      return { actionType: 'pause', reasonCode: focusMetric.orders > 0 ? 'acos_hard_stop' : 'no_order_hard_stop', pattern, presence: flags, reason: `${presenceSummary}. 30d ${focusSummary}.` };
    }
    if (amount > 0) {
      const suggestedBid = clampBid(bid - amount, bidFloorFor(entry));
      if (suggestedBid >= bid) {
        return { actionType: 'hold', reasonCode: 'bid_already_at_floor', pattern, presence: flags, reason: `Current bid ${bid.toFixed(2)} is already near the floor. ${presenceSummary}.` };
      }
      return { actionType: 'bid', currentBid: bid, suggestedBid, reasonCode: focusMetric.orders > 0 ? 'acos_bid_down' : 'no_order_bid_down', pattern, presence: flags, reason: `${presenceSummary}. 30d ${focusSummary}.` };
    }
    const step = smallBidStep(bid);
    const suggestedBid = clampBid(bid - step, bidFloorFor(entry));
    if (suggestedBid >= bid) {
      return { actionType: 'hold', reasonCode: 'bid_already_at_floor', pattern, presence: flags, reason: `Current bid ${bid.toFixed(2)} is already near the floor. ${presenceSummary}.` };
    }
    return { actionType: 'bid', currentBid: bid, suggestedBid, reasonCode: 'persistently_low_small_step', pattern, presence: flags, reason: `${presenceSummary}. 30d ${focusSummary}.` };
  }

  const strongResidual = residualWasteBidDecision(entry, pattern, flags);
  if (strongResidual && isStrongWasteDecision(strongResidual)) return strongResidual;

  const step = smallBidStep(bid);
  const suggestedBid = clampBid(bid - step, bidFloorFor(entry));
  if (suggestedBid >= bid) {
    return { actionType: 'hold', reasonCode: 'bid_already_at_floor', pattern, presence: flags, reason: `Current bid ${bid.toFixed(2)} is already near the floor. ${presenceSummary}.` };
  }
  return { actionType: 'bid', currentBid: bid, suggestedBid, reasonCode: intent.reasonCode, pattern, presence: flags, reason: `${presenceSummary}. focus ${focusSummary}.` };
}

function scanLowEfficiencyPools(snapshot = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const cooldownDays = Number(options.cooldownDays || 14);
  const pools = snapshot.lowEfficiencyRows || {};
  const order = ['kw', 'auto', 'manual', 'sbKw', 'sbTarget'];
  const results = {};
  const summary = { byKind: {}, totals: { actionable: 0, hold: 0, skip: 0, recoveryOpportunity: 0 } };
  for (const kind of order) {
    const rows = pools[kind] || [];
    const decisions = rows.map(entry => {
      const decision = decideFromPoolMembership(entry, { now, cooldownDays });
      return { entry, decision };
    });
    const actionable = decisions.filter(d => d.decision.actionType === 'bid' || d.decision.actionType === 'pause');
    const hold = decisions.filter(d => d.decision.actionType === 'hold');
    const skip = decisions.filter(d => d.decision.actionType === 'skip');
    const recoveryOpportunity = decisions.filter(d => d.decision.opportunityAction === 'review_bid_up');
    results[kind] = decisions;
    summary.byKind[kind] = { scanned: rows.length, actionable: actionable.length, hold: hold.length, skip: skip.length, recoveryOpportunity: recoveryOpportunity.length };
    summary.totals.actionable += actionable.length;
    summary.totals.hold += hold.length;
    summary.totals.skip += skip.length;
    summary.totals.recoveryOpportunity += recoveryOpportunity.length;
  }
  return { generatedAt: new Date().toISOString(), cooldownDays, summary, results };
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
        lastAdjustedAt: latestTimestamp(entity.operatedAt, entity.updatedAt),
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
  decideFromPoolMembership,
  buildWriterRequest,
  scanLowEfficiencyCandidates,
  scanLowEfficiencyPools,
  classifyPoolPattern,
  presenceFlags,
  sevenDayRecoverySignal
};
