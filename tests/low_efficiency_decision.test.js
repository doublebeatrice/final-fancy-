const assert = require('assert');

const {
  normalizeLowEfficiencyRow,
  decideLowEfficiencyAction,
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

test('parses date-only timestamps so date-only updatedAt does not bypass the cooldown', () => {
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
