const assert = require('assert');

const {
  normalizeLowEfficiencyRow,
  decideLowEfficiencyAction,
  decideFromPoolMembership,
  classifyPoolPattern,
  presenceFlags,
  buildWriterRequest
} = require('../src/low_efficiency_decision');

const NOW = new Date('2026-05-15T00:00:00+08:00');

function spTargetRow(overrides = {}) {
  return {
    targetId: '447463479333604',
    Impressions: '1026',
    Clicks: '6',
    Spend: '7.07',
    Orders: '0',
    Sales: '0.00',
    ACOS: null,
    CPC: '1.178333',
    state: 1,
    bid: '1.24',
    adGroupId: '410760619600032',
    campaignId: '97009283476116',
    accountId: 737,
    siteId: 4,
    type: 'asinExpandedFrom=B0B82QKLBG',
    updatedAt: '2026-04-17 15:06:34',
    campaignState: 1,
    groupState: 1,
    campaignName: 'asin expanded_soccer ball_yut2844',
    groupName: 'asin expanded_soccer ball_yut2844',
    tableType: 'product_manual_target',
    ...overrides
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('normalizes SP manual target rows into one low-efficiency entity shape', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow());
  assert.strictEqual(entity.channel, 'SP_TARGET');
  assert.strictEqual(entity.entityType, 'manualTarget');
  assert.strictEqual(entity.id, '447463479333604');
  assert.strictEqual(entity.text, 'asinExpandedFrom=B0B82QKLBG');
  assert.strictEqual(entity.metrics.current.clicks, 6);
  assert.strictEqual(entity.metrics.current.spend, 7.07);
  assert.strictEqual(entity.bid, 1.24);
});

test('skips 30-day rows whose last adjustment is not 30 days old yet', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow());
  const decision = decideLowEfficiencyAction(entity, { windowDays: 30, now: NOW });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'adjustment_window_not_elapsed');
});

test('lowers bid for due 30-day no-order SP target before pausing when clicks are below hard-stop threshold', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow({ updatedAt: '2026-04-10 15:06:34' }));
  const decision = decideLowEfficiencyAction(entity, { windowDays: 30, now: NOW });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.suggestedBid, 1.0);
  assert.match(decision.reason, /0 orders/);
});

test('SP auto groups use last adjustment age because they have no red marker', () => {
  const entity = normalizeLowEfficiencyRow('spAuto', spTargetRow({
    targetId: 'auto-target-1',
    tableType: 'product_target',
    type: 'QUERY_BROAD_REL_MATCHES',
    bid: '0.35',
    updatedAt: '2026-05-11 10:00:00',
    Clicks: '12',
    Spend: '4.20'
  }));
  const tooSoon = decideLowEfficiencyAction(entity, { windowDays: 7, now: NOW });
  assert.strictEqual(tooSoon.actionType, 'skip');
  assert.strictEqual(tooSoon.reasonCode, 'adjustment_window_not_elapsed');

  const due = decideLowEfficiencyAction(entity, { windowDays: 3, now: NOW });
  assert.strictEqual(due.actionType, 'bid');
});

test('holds a 30-day inefficient row when recent windows are improving', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow({
    Orders: '1',
    Sales: '56.99',
    Spend: '19.24',
    ACOS: '0.337603',
    bid: '0.75',
    updatedAt: '2026-04-10 12:30:11'
  }), {
    metrics: {
      30: { clicks: 34, spend: 19.24, orders: 1, sales: 56.99, acos: 0.337603, cpc: 0.565882 },
      15: { clicks: 12, spend: 5.2, orders: 1, sales: 56.99, acos: 0.091, cpc: 0.433 },
      7: { clicks: 5, spend: 1.6, orders: 1, sales: 56.99, acos: 0.028, cpc: 0.32 },
      3: { clicks: 2, spend: 0.5, orders: 1, sales: 56.99, acos: 0.009, cpc: 0.25 }
    }
  });
  const decision = decideLowEfficiencyAction(entity, { windowDays: 30, now: NOW });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'recent_trend_improved');
});

test('builds SP target bid writer payload without storing auth headers', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow());
  const request = buildWriterRequest(entity, { actionType: 'bid', suggestedBid: 1.0 });
  assert.strictEqual(request.method, 'PATCH');
  assert.strictEqual(request.url, '/advTarget/batchUpdateManualTarget');
  assert.strictEqual(request.body.property, 'manualTarget');
  assert.strictEqual(request.body.operation, 'bid');
  assert.deepStrictEqual(request.body.idArray, ['447463479333604']);
  assert.strictEqual(request.body.targetNewArray[0].bid, '1.00');
});

test('builds SP auto target bid writer payload with the auto target endpoint', () => {
  const entity = normalizeLowEfficiencyRow('spAuto', spTargetRow({
    targetId: '316993892105076',
    tableType: 'product_target',
    type: 'queryHighRelMatches',
    bid: '0.31',
  }));
  const request = buildWriterRequest(entity, { actionType: 'bid', suggestedBid: 0.28 });
  assert.strictEqual(request.method, 'PATCH');
  assert.strictEqual(request.url, '/advTarget/batchEditAutoTarget');
  assert.strictEqual(request.body.property, 'autoTarget');
  assert.strictEqual(request.body.operation, 'bid');
  assert.deepStrictEqual(request.body.idArray, ['316993892105076']);
  assert.strictEqual(request.body.targetNewArray[0].bid, '0.28');
});

test('builds SB target pause writer payload', () => {
  const entity = normalizeLowEfficiencyRow('sbTarget', spTargetRow({
    targetId: '405113170150126',
    campaignId: '412986258529265',
    adGroupId: '524743013442276',
    accountId: 700
  }));
  const request = buildWriterRequest(entity, { actionType: 'pause' });
  assert.strictEqual(request.url, '/sbTarget/batchEditTargetSbColumn');
  assert.strictEqual(request.body.operation, 'state');
  assert.deepStrictEqual(request.body.campaignIdArray, ['412986258529265']);
  assert.strictEqual(request.body.targetArray[0].state, 'paused');
  assert.strictEqual(request.body.targetNewArray[0].state, 2);
});

test('parses date-only timestamps so date-only updatedAt does not bypass the recent-adjustment gate', () => {
  const entity = normalizeLowEfficiencyRow('spKeyword', {
    keywordId: 'k-only',
    matchType: 'BROAD',
    state: 1,
    campaignState: 1,
    groupState: 1,
    bid: '1.00',
    Clicks: '20',
    Spend: '8',
    Orders: '0',
    accountId: 1,
    siteId: 4,
    campaignId: 'c1',
    adGroupId: 'g1',
    updatedAt: '2026-05-14',
  });
  const decision = decideLowEfficiencyAction(entity, { windowDays: 30, now: NOW });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'adjustment_window_not_elapsed');
});

test('uses the most recent adjustment timestamp for recent-adjustment checks', () => {
  const entity = normalizeLowEfficiencyRow('spTarget', spTargetRow({
    updatedAt: '2026-05-14 09:51:25',
    operatedAt: '2026-05-01',
    bid: '0.19',
    Clicks: '25',
    Spend: '5.43',
    Orders: '0',
  }));
  const decision = decideLowEfficiencyAction(entity, { windowDays: 14, now: NOW });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'adjustment_window_not_elapsed');
});


function spKeywordRow(overrides = {}) {
  return {
    keywordId: '380012345678901',
    keywordText: 'soccer ball',
    matchType: 'BROAD',
    Impressions: '892',
    Clicks: '7',
    Spend: '6.30',
    Orders: '0',
    Sales: '0.00',
    ACOS: null,
    CPC: '0.9',
    state: 1,
    bid: '1.10',
    adGroupId: '410760619600032',
    campaignId: '97009283476116',
    accountId: 737,
    siteId: 4,
    bidThreshold: '0.02',
    adFormat: 'productCollection',
    costType: 'CPC',
    updatedAt: '2026-04-10 09:00:00',
    campaignState: 1,
    groupState: 1,
    campaignName: 'kw_camp',
    groupName: 'kw_grp',
    ...overrides
  };
}

test('builds SP keyword bid writer payload with matchType and property=keyword', () => {
  const entity = normalizeLowEfficiencyRow('spKeyword', spKeywordRow());
  assert.strictEqual(entity.matchType, 'BROAD');
  const request = buildWriterRequest(entity, { actionType: 'bid', suggestedBid: 0.95 });
  assert.strictEqual(request.method, 'PATCH');
  assert.strictEqual(request.url, '/keyword/batchKeyword');
  assert.strictEqual(request.body.property, 'keyword');
  assert.strictEqual(request.body.operation, 'bid');
  assert.deepStrictEqual(request.body.idArray, ['380012345678901']);
  assert.strictEqual(request.body.targetNewArray[0].bid, '0.95');
  assert.strictEqual(request.body.targetNewArray[0].matchType, 'BROAD');
  assert.strictEqual(request.body.targetNewArray[0].advType, 'SP');
});

test('builds SP keyword pause writer payload with PAUSED uppercase', () => {
  const entity = normalizeLowEfficiencyRow('spKeyword', spKeywordRow());
  const request = buildWriterRequest(entity, { actionType: 'pause' });
  assert.strictEqual(request.url, '/keyword/batchKeyword');
  assert.strictEqual(request.body.operation, 'state');
  assert.strictEqual(request.body.property, 'keyword');
  assert.strictEqual(request.body.targetArray[0].state, 'PAUSED');
  assert.strictEqual(request.body.targetNewArray[0].state, 2);
  assert.deepStrictEqual(request.body.campaignIdArray, ['97009283476116']);
});

test('builds SB keyword bid writer payload without property and with matchType', () => {
  const entity = normalizeLowEfficiencyRow('sbKeyword', spKeywordRow({
    keywordId: '511111122223333',
    matchType: 'PHRASE',
    campaignId: '412986258529265',
    adGroupId: '524743013442276',
    accountId: 700,
    bid: '1.40'
  }));
  const request = buildWriterRequest(entity, { actionType: 'bid', suggestedBid: 1.25 });
  assert.strictEqual(request.url, '/keywordSb/batchEditKeywordSbColumn');
  assert.strictEqual(request.body.property, undefined);
  assert.strictEqual(request.body.operation, 'bid');
  assert.strictEqual(request.body.targetNewArray[0].bid, '1.25');
  assert.strictEqual(request.body.targetNewArray[0].matchType, 'PHRASE');
  assert.strictEqual(request.body.targetNewArray[0].advType, 'SB');
});

test('builds SB keyword pause writer payload with paused lowercase and matchType', () => {
  const entity = normalizeLowEfficiencyRow('sbKeyword', spKeywordRow({
    keywordId: '511111122223333',
    matchType: 'EXACT',
    campaignId: '412986258529265',
    adGroupId: '524743013442276',
    accountId: 700
  }));
  const request = buildWriterRequest(entity, { actionType: 'pause' });
  assert.strictEqual(request.url, '/keywordSb/batchEditKeywordSbColumn');
  assert.strictEqual(request.body.targetArray[0].state, 'paused');
  assert.strictEqual(request.body.targetArray[0].matchType, 'EXACT');
  assert.strictEqual(request.body.targetNewArray[0].state, 2);
  assert.strictEqual(request.body.targetNewArray[0].matchType, 'EXACT');
});

// ---- Pool-membership trend tests ----

function poolEntry(windows, overrides = {}) {
  return {
    kind: 'kw',
    id: 'k1',
    state: 1,
    campaignState: 1,
    groupState: 1,
    bid: 0.8,
    matchType: 'BROAD',
    campaignId: 'c1',
    adGroupId: 'g1',
    accountId: 1,
    siteId: 4,
    updatedAt: '2026-04-01',
    operatedAt: '',
    windows,
    ...overrides,
  };
}

test('classifyPoolPattern recognizes the four canonical states', () => {
  assert.strictEqual(classifyPoolPattern(presenceFlags(poolEntry({ 30: {}, 15: {}, 7: {}, 3: {} }))), 'persistently_low');
  assert.strictEqual(classifyPoolPattern(presenceFlags(poolEntry({ 30: {} }))), 'improving_long_only');
  assert.strictEqual(classifyPoolPattern(presenceFlags(poolEntry({ 30: {}, 15: {} }))), 'improving_recently');
  assert.strictEqual(classifyPoolPattern(presenceFlags(poolEntry({ 15: {}, 7: {}, 3: {} }))), 'recently_degraded');
});

test('pool decision holds when only the 30d pool flags the row', () => {
  const entry = poolEntry({ 30: { clicks: 20, spend: 6, orders: 1, acos: 0.40 } });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'recent_trend_improved');
  assert.strictEqual(decision.pattern, 'improving_long_only');
});

test('pool decision can still lower bid when 7d also remains inefficient', () => {
  const entry = poolEntry({
    30: { clicks: 20, spend: 6, orders: 1, acos: 0.40 },
    7: { clicks: 5, spend: 2.1, orders: 1, acos: 0.32 },
  });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'residual_30d_high_acos');
  assert.strictEqual(decision.pattern, 'volatile_30_7');
  assert.strictEqual(decision.suggestedBid, 0.75);
});

test('pool decision holds when 30d and 15d are inefficient but 7d ACOS has recovered', () => {
  const entry = poolEntry({
    30: { clicks: 10, spend: 3.5, orders: 1, sales: 5.39, acos: 0.64935 },
    15: { clicks: 9, spend: 3.15, orders: 1, sales: 5.39, acos: 0.584415 },
    7: { clicks: 2, spend: 0.7, orders: 1, sales: 5.39, acos: 0.12987 },
  }, { bid: 0.35 });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'recent_recovery_under_20_acos');
  assert.strictEqual(decision.opportunityAction, 'review_bid_up');
  assert.strictEqual(decision.suggestedDirection, 'up');
  assert.strictEqual(decision.recoverySignal.acos, 0.12987);
});

test('pool decision protects 7d recovered rows above 20 ACOS without bid-up flag', () => {
  const entry = poolEntry({
    30: { clicks: 18, spend: 8.4, orders: 1, sales: 20, acos: 0.42 },
    15: { clicks: 10, spend: 4.2, orders: 1, sales: 20, acos: 0.21 },
    7: { clicks: 8, spend: 3.44, orders: 1, sales: 16, acos: 0.215 },
  }, { bid: 0.42 });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'recent_recovery_7d_acos_ok');
  assert.strictEqual(decision.opportunityAction, undefined);
  assert.strictEqual(decision.suggestedDirection, undefined);
});

test('pool decision pauses rows with sustained zero-order waste even if 3d is clean', () => {
  const entry = poolEntry({
    30: { clicks: 25, spend: 7, orders: 0 },
    15: { clicks: 14, spend: 4, orders: 0 },
    7: { clicks: 7, spend: 2, orders: 0 },
  });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'residual_30d_zero_order_hard_stop');
});

test('pool decision hard-stops recently-degraded rows when 15d zero-order waste is meaningful', () => {
  const entry = poolEntry({
    15: { clicks: 8, spend: 3, orders: 0 },
    7: { clicks: 5, spend: 2, orders: 0 },
    3: { clicks: 3, spend: 1, orders: 0 },
  }, { bid: 1.2 });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'residual_15d_zero_order_hard_stop');
});

test('pool decision pauses persistently-low rows that pass the hard-stop test', () => {
  const entry = poolEntry({
    30: { clicks: 20, spend: 8, orders: 0 },
    15: { clicks: 12, spend: 4, orders: 0 },
    7: { clicks: 6, spend: 2, orders: 0 },
    3: { clicks: 3, spend: 1, orders: 0 },
  }, { bid: 0.8 });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'no_order_hard_stop');
});

test('pool decision skips rows recently changed without a new stop-loss trigger', () => {
  const entry = poolEntry({ 30: {}, 15: {}, 7: {}, 3: {} }, { updatedAt: '2026-05-10' });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_no_new_waste');
  assert.match(decision.reason, /目标：/);
  assert.match(decision.reason, /发生：/);
  assert.match(decision.reason, /动作：/);
  assert.match(decision.reason, /可纠正原因：/);
});

test('pool decision still tags recovered under-20 rows after a recent change as bid-up review candidates', () => {
  const entry = poolEntry(
    {
      30: { clicks: 10, spend: 3.5, orders: 1, sales: 5.39, acos: 0.64935 },
      15: { clicks: 9, spend: 3.15, orders: 1, sales: 5.39, acos: 0.584415 },
      7: { clicks: 2, spend: 0.7, orders: 1, sales: 5.39, acos: 0.12987 },
    },
    { bid: 0.35, updatedAt: '2026-05-10 09:00:00' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_no_new_waste');
  assert.strictEqual(decision.opportunityAction, 'review_bid_up');
  assert.strictEqual(decision.suggestedDirection, 'up');
});

test('pool decision still cuts after a recent change when 7d has meaningful spend and zero orders', () => {
  const entry = poolEntry({ 7: { clicks: 9, spend: 2.45, orders: 0 } }, { bid: 0.35, updatedAt: '2026-05-10 09:00:00' });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_7d_zero_order_heavy_cut');
  assert.strictEqual(decision.suggestedBid, 0.03);
});

test('pool decision still cuts after a recent change when 7d ACOS is high despite orders', () => {
  const entry = poolEntry({ 7: { clicks: 8, spend: 2.8, orders: 1, acos: 0.5195 } }, { bid: 0.35, updatedAt: '2026-05-10 09:00:00' });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_7d_high_acos');
  assert.strictEqual(decision.suggestedBid, 0.32);
});

test('pool decision still pauses after a recent change when 15d has meaningful zero-order waste', () => {
  const entry = poolEntry({
    15: { clicks: 10, spend: 3.2, orders: 0 },
    7: { clicks: 7, spend: 2.2, orders: 0 },
  }, { bid: 0.38, updatedAt: '2026-05-10 09:00:00' });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_15d_zero_order_hard_stop');
});

test('pool decision trims single 15d-window high ACOS rows with orders', () => {
  const entry = poolEntry(
    { 15: { clicks: 32, spend: 9.6, orders: 1, sales: 26.99, acos: 0.356 } },
    { kind: 'auto', bid: 0.3, updatedAt: '2026-04-01' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'single_15d_acos_small_trim');
  assert.strictEqual(decision.pattern, 'volatile_15_only');
  assert.strictEqual(decision.suggestedBid, 0.27);
});

test('pool decision pauses floor-bid zero-order rows without long-window order protection', () => {
  const entry = poolEntry(
    { 7: { clicks: 13, spend: 3.63, orders: 0 } },
    { kind: 'sbKw', bid: 0.25, campaignName: 'white bunny pr2214-sbv-s-old', updatedAt: '2026-04-01' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'residual_7d_zero_order_floor_pause');
});

test('pool decision cuts 90 percent for extreme ACOS instead of using the small step', () => {
  const entry = poolEntry(
    { 7: { clicks: 66, spend: 22.34, orders: 2, acos: 0.932 } },
    { kind: 'auto', bid: 0.34, updatedAt: '2026-05-10 09:00:00' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_7d_extreme_acos_cut');
  assert.strictEqual(decision.suggestedBid, 0.03);
});

test('pool decision pauses SB targets with 15d zero-order waste', () => {
  const entry = poolEntry(
    {
      15: { clicks: 5, spend: 3.03, orders: 0 },
      7: { clicks: 7, spend: 2.1, orders: 0 },
    },
    { kind: 'sbTarget', bid: 0.43, updatedAt: '2026-05-10 09:00:00' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'pause');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_15d_zero_order_hard_stop');
});

test('pool decision clamps SBV keyword bid-downs to the 0.25 floor', () => {
  const entry = poolEntry(
    { 7: { clicks: 8, spend: 2.8, orders: 1, acos: 0.5195 } },
    { kind: 'sbKw', bid: 0.27, campaignName: 'sbvkw_babyshower_yan4858', updatedAt: '2026-05-10 09:00:00' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_stoploss_7d_high_acos');
  assert.strictEqual(decision.suggestedBid, 0.25);
});

test('pool decision holds SBV keyword rows already at the 0.25 floor', () => {
  const entry = poolEntry(
    {
      15: { clicks: 20, spend: 6.2, orders: 1, acos: 0.621 },
      7: { clicks: 10, spend: 3.5, orders: 1, acos: 0.5 },
      3: { clicks: 6, spend: 2.0, orders: 0 },
    },
    { kind: 'sbKw', bid: 0.25, campaignName: 'sbvkw_tie your shoe_yan2278', updatedAt: '2026-04-01' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'bid_already_at_floor');
});

test('pool decision still allows non-SBV low bids below 0.10 to move down', () => {
  const entry = poolEntry(
    {
      15: { clicks: 30, spend: 6.8, orders: 1, acos: 0.66 },
      7: { clicks: 12, spend: 2.8, orders: 1, acos: 0.48 },
      3: { clicks: 6, spend: 1.2, orders: 0 },
    },
    { kind: 'kw', bid: 0.06, campaignName: 'kw_q2 profit joy0900 phrase_joy0900', updatedAt: '2026-04-01' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'bid');
  assert.strictEqual(decision.reasonCode, 'residual_15d_severe_acos_cut');
  assert.strictEqual(decision.suggestedBid, 0.03);
});

test('pool decision does not repeat-write same-day adjustments', () => {
  const entry = poolEntry({ 7: { clicks: 20, spend: 8, orders: 0 } }, { bid: 0.35, updatedAt: '2026-05-15 09:00:00' });
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'recent_adjustment_no_new_waste');
});

test('pool decision skips inactive parents regardless of pattern', () => {
  const entry = poolEntry({ 30: {}, 15: {}, 7: {}, 3: {} }, { campaignState: 2 });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'inactive_parent_or_entity');
});

test('pool decision treats SB string campaignState=ENABLED and missing groupState as enabled', () => {
  const entry = poolEntry(
    { 30: {}, 15: {}, 7: {}, 3: {} },
    { campaignState: 'ENABLED', groupState: undefined, updatedAt: '2026-04-01' }
  );
  const decision = decideFromPoolMembership(entry, { now: NOW, recentAdjustmentWindowDays: 14 });
  assert.notStrictEqual(decision.reasonCode, 'inactive_parent_or_entity');
});

test('pool decision skips when campaignState is the SB paused string', () => {
  const entry = poolEntry({ 30: {}, 15: {}, 7: {}, 3: {} }, { campaignState: 'paused' });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'skip');
  assert.strictEqual(decision.reasonCode, 'inactive_parent_or_entity');
});

test('pool decision holds when only the 3d pool flags the row (noise)', () => {
  const entry = poolEntry({ 3: { clicks: 3, spend: 1, orders: 0 } });
  const decision = decideFromPoolMembership(entry, { now: NOW });
  assert.strictEqual(decision.actionType, 'hold');
  assert.strictEqual(decision.reasonCode, 'noise_only_3d');
});
