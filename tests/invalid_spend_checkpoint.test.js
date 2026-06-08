const assert = require('assert');

const {
  addDays,
  adSkuSummaryFetchCommand,
  assessRootCauseSegment,
  assessRootCauseSegmentOutcomes,
  assessCompletionAudit,
  assessWindowOutcome,
  buildMarketEvidenceAudit,
  buildProtectedRowAudit,
  buildRootCauseSegments,
  canFetchCheckpoint,
  checkpointReadiness,
  dataRequirements,
  fetchMissingData,
  inferSku,
  marketEvidenceGate,
  metricFromRows,
  nextActionForRootCauseVerdict,
  pctDelta,
  protectedRowAuditGate,
  resolveCheckpointDate,
  resolveNextCheckpointDate,
  rootCauseSegmentMetrics,
  scheduled3dCheckpointGate,
  summarizeAdjustments,
  summarizeImpactedSkus,
} = require('../scripts/execute/review_invalid_spend_checkpoint');

assert.strictEqual(addDays('2026-06-02', 3), '2026-06-05');
assert.strictEqual(addDays('2026-06-02', 7), '2026-06-09');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: '3d' }), '2026-06-05');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: '7d' }), '2026-06-09');
assert.strictEqual(resolveNextCheckpointDate('2026-06-02', '2026-06-02'), '2026-06-05');
assert.strictEqual(resolveNextCheckpointDate('2026-06-02', '2026-06-05'), '2026-06-05');
assert.strictEqual(resolveNextCheckpointDate('2026-06-02', '2026-06-08'), '2026-06-05');
assert.strictEqual(resolveNextCheckpointDate('2026-06-02', '2026-06-09'), '2026-06-09');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: 'next', currentDate: '2026-06-02' }), '2026-06-05');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: 'auto', currentDate: '2026-06-09' }), '2026-06-09');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: 'final', currentDate: '2026-06-05' }), '2026-06-09');
assert.strictEqual(resolveCheckpointDate('2026-06-02', { checkpoint: '3d', checkpointDate: '2026-06-08' }), '2026-06-08');
assert.strictEqual(pctDelta(100, 80), -0.2);
assert.strictEqual(
  adSkuSummaryFetchCommand(3, '2026-06-05'),
  'node scripts\\execute\\fetch_ad_sku_summary.js 4 3 "" data\\snapshots\\ad_sku_summary_ALL_3d_2026-06-05.json',
);
assert.strictEqual(canFetchCheckpoint('2026-06-05', '2026-06-02'), false);
assert.strictEqual(canFetchCheckpoint('2026-06-05', '2026-06-05'), true);

assert.deepStrictEqual(
  checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-02',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  }),
  {
    checkpoint3dDue: false,
    checkpoint7dDue: false,
    checkpoint3dHasData: false,
    checkpoint7dHasData: false,
    checkpoint30dHasData: true,
    status: 'not_due',
  },
);

assert.strictEqual(
  checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-05',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: false,
  }).status,
  'missing_3d_data',
);

assert.strictEqual(
  checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-09',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: false,
  }).status,
  'missing_3d_and_7d_data',
);

assert.strictEqual(
  checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-09',
    checkpoint3Ok: true,
    checkpoint7Ok: true,
    checkpoint30Ok: true,
  }).status,
  'ready_for_review',
);

{
  const requirements = dataRequirements({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: false,
      checkpoint7Ok: false,
      checkpoint30Ok: false,
    }),
    checkpointDate: '2026-06-05',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: false,
  });
  assert.strictEqual(requirements.required.length, 1);
  assert.strictEqual(requirements.required[0].day, 3);
  assert.strictEqual(requirements.optional[0].day, 30);
  assert.strictEqual(requirements.commands[0], 'npm run chrome:ready');
}

{
  const requirements = dataRequirements({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: false,
      checkpoint7Ok: false,
      checkpoint30Ok: false,
    }),
    checkpointDate: '2026-06-09',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: false,
  });
  assert.deepStrictEqual(requirements.required.map(item => item.day), [3, 7]);
  assert.strictEqual(requirements.commands.length, 3);
}

assert.strictEqual(
  fetchMissingData({
    checkpointDate: '2026-06-02',
    dataRequirements: { required: [], commands: [] },
  }, { currentDate: '2026-06-02' }).status,
  'not_needed',
);

assert.strictEqual(
  fetchMissingData({
    checkpointDate: '2026-06-05',
    dataRequirements: {
      required: [{ day: 3, file: 'data/snapshots/ad_sku_summary_ALL_3d_2026-06-05.json' }],
      commands: ['fetch command'],
    },
  }, { currentDate: '2026-06-02' }).status,
  'future_checkpoint_refused',
);

{
  const calls = [];
  const result = fetchMissingData({
    checkpointDate: '2026-06-05',
    dataRequirements: {
      required: [
        { day: 3, file: 'data/snapshots/ad_sku_summary_ALL_3d_2026-06-05.json' },
      ],
      commands: [],
    },
  }, {
    currentDate: '2026-06-05',
    runner(command, args) {
      calls.push([command, args]);
      return { status: command === 'npm' ? 1 : 0 };
    },
  });
  assert.strictEqual(result.status, 'fetched');
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[1], [
    'node',
    ['scripts\\execute\\fetch_ad_sku_summary.js', '4', '3', '', 'data\\snapshots\\ad_sku_summary_ALL_3d_2026-06-05.json'],
  ]);
}

{
  const calls = [];
  const result = fetchMissingData({
    checkpointDate: '2026-06-05',
    readiness: { checkpoint3dDue: true },
    dataRequirements: {
      required: [],
      commands: [],
    },
    protectedRowAudit: { status: 'pending_data' },
  }, {
    currentDate: '2026-06-05',
    runner(command, args) {
      calls.push([command, args]);
      return { status: 0 };
    },
  });
  assert.strictEqual(result.status, 'fetched');
  assert.strictEqual(calls.length, 6);
  assert.deepStrictEqual(calls[1], [
    'node',
    ['scripts\\execute\\recheck_low_efficiency_lower_layer.js', '--kind=kw'],
  ]);
  assert.deepStrictEqual(calls[5], [
    'node',
    ['scripts\\execute\\recheck_low_efficiency_lower_layer.js', '--kind=sbTarget'],
  ]);
}

assert.strictEqual(
  inferSku({
    sku: 'lowEff::auto::317392606314211',
    campaignName: 'auto_custom lane_ae3311',
  }),
  'AE3311',
);

const summary = summarizeAdjustments([
  { businessDate: '2026-06-02', entityType: 'keyword', entityId: '1', outcome: 'api_failed' },
  { businessDate: '2026-06-02', entityType: 'keyword', entityId: '1', actionType: 'bid', outcome: 'api_success' },
  { businessDate: '2026-06-02', entityType: 'autoTarget', entityId: '2', actionType: 'pause', outcome: 'api_success' },
  { businessDate: '2026-06-02', entityType: 'autoTarget', entityId: '3', outcome: 'api_failed', meta: { apiMessage: 'blocked' } },
]);
assert.strictEqual(summary.uniqueSuccess, 2);
assert.strictEqual(summary.unresolvedFailures.length, 1);
assert.strictEqual(summary.successActionByType['keyword|bid'], 1);
assert.strictEqual(summary.successActionByType['autoTarget|pause'], 1);

const impacted = summarizeImpactedSkus(
  [
    { entityType: 'keyword', entityId: '1', sku: 'LOWEFF::KW::1', actionType: 'bid', outcome: 'api_success' },
  ],
  [
    {
      entityType: 'keyword',
      entityId: '1',
      sku: '',
      campaignName: 'kw_core_gt3801',
      spend30: 10.5,
      clicks30: 20,
      orders30: 1,
      text: 'funeral ribbon',
    },
  ],
);
assert.strictEqual(impacted[0].sku, 'GT3801');
assert.strictEqual(impacted[0].representedSpend30, 10.5);

const metric = metricFromRows([
  { sku: 'GT3801', impressions: 100, clicks: 10, cost: 5, orders: 2, sales: 25, impressions_prev: 80, clicks_prev: 8, cost_prev: 6, orders_prev: 2, sales_prev: 20 },
  { sku: 'OTHER', impressions: 999, clicks: 99, cost: 99, orders: 9, sales: 99 },
], new Set(['GT3801']));
assert.strictEqual(metric.skus, 1);
assert.strictEqual(metric.acos, 0.2);
assert.strictEqual(metric.cpc, 0.5);
assert.strictEqual(metric.prevAcos, 0.3);
assert.strictEqual(metric.delta.costPct, -0.1667);
assert.strictEqual(metric.delta.impressionsPct, 0.25);

assert.strictEqual(
  nextActionForRootCauseVerdict('market_spend_reduced_reopen_blocked'),
  'keep_market_reopen_blocked_until_fresh_market_proof_plus_exact_conversion',
);

{
  const segments = buildRootCauseSegments({
    queueRows: [
      { sku: 'EY0793', marketBucket: 'unclassified_low_efficiency_tail' },
      { sku: 'GT3801', marketBucket: 'funeral_memorial_ribbon_fit_misjudge' },
    ],
    protectedRows: [{ sku: 'SAN0383' }],
    rootCauseReview: {
      protectedExploration: [
        { sku: 'SAN0383', reviewLevel: 'protect_recent_and_30d' },
      ],
    },
    rootCauseFile: 'data/tasks/root.json',
    rootCauseOk: true,
  });
  assert.strictEqual(segments.sourceOk, true);
  assert.deepStrictEqual(segments.segments.map(row => row.key), [
    'bad_habit_only',
    'market_misjudgment_plus_bad_habit',
    'protected_exploration',
  ]);
  assert.deepStrictEqual(segments.segments[0].skus, ['EY0793']);
  assert.deepStrictEqual(segments.segments[1].skus, ['GT3801']);
  assert.deepStrictEqual(segments.protectedReviewLevels[0].key, 'protect_recent_and_30d');

  const segmentMetrics = rootCauseSegmentMetrics([
    { sku: 'EY0793', cost: 6, clicks: 12, orders: 2, sales: 30 },
    { sku: 'GT3801', cost: 8, clicks: 16, orders: 1, sales: 20 },
    { sku: 'SAN0383', cost: 4, clicks: 10, orders: 1, sales: 25 },
  ], segments.segments);
  assert.strictEqual(segmentMetrics[0].metrics.cost, 6);
  assert.strictEqual(segmentMetrics[1].metrics.acos, 0.4);
  assert.strictEqual(segmentMetrics[2].metrics.orders, 1);
}

assert.strictEqual(
  assessRootCauseSegment({
    key: 'bad_habit_only',
    label: 'Bad habit only',
    metrics: {
      cost: 80,
      prevCost: 100,
      clicks: 90,
      prevClicks: 100,
      orders: 10,
      prevOrders: 10,
      delta: { costPct: -0.2, clicksPct: -0.1, ordersPct: 0 },
    },
  }).nextAction,
  'keep_current_stop_loss; no_market_reopen_needed',
);

assert.strictEqual(
  assessRootCauseSegment({
    key: 'market_misjudgment_plus_bad_habit',
    label: 'Market misjudgment plus bad habit',
    metrics: {
      cost: 70,
      prevCost: 100,
      clicks: 80,
      prevClicks: 100,
      orders: 3,
      prevOrders: 10,
      delta: { costPct: -0.3, clicksPct: -0.2, ordersPct: -0.7 },
    },
  }).nextAction,
  'review_exact_row_evidence; do_not_reopen_generic_market_bucket',
);

assert.strictEqual(
  assessRootCauseSegment({
    key: 'protected_exploration',
    label: 'Protected exploration',
    metrics: {
      cost: 70,
      prevCost: 100,
      clicks: 30,
      prevClicks: 100,
      orders: 3,
      prevOrders: 10,
      delta: { costPct: -0.3, clicksPct: -0.7, ordersPct: -0.7 },
    },
  }).verdict,
  'protected_possible_misfire_review',
);

assert.strictEqual(
  assessRootCauseSegment({
    key: 'protected_exploration',
    label: 'Protected exploration',
    metrics: {
      impressions: 40,
      prevImpressions: 100,
      clicks: 90,
      prevClicks: 100,
      orders: 9,
      prevOrders: 10,
      delta: { impressionsPct: -0.6, clicksPct: -0.1, ordersPct: -0.1 },
    },
  }).verdict,
  'protected_possible_misfire_review',
);

{
  const audit = buildMarketEvidenceAudit({
    marketEvidencePlan: [
      { marketBucket: 'funeral_memorial_ribbon_fit_misjudge', evidenceStatus: 'required_missing' },
      { marketBucket: 'baby_shower_party_competition_fit_gap', evidenceStatus: 'evidence_ready' },
    ],
  });
  assert.strictEqual(audit.status, 'pending_data');
  assert.strictEqual(audit.missingBuckets, 1);
  assert.strictEqual(marketEvidenceGate(audit).status, 'pending_data');
}

{
  const audit = buildMarketEvidenceAudit({
    marketEvidencePlan: [
      { marketBucket: 'funeral_memorial_ribbon_fit_misjudge', evidenceStatus: 'evidence_ready_with_gaps' },
      { marketBucket: 'baby_shower_party_competition_fit_gap', evidenceStatus: 'reopen_blocked_verified' },
    ],
  });
  assert.strictEqual(audit.status, 'passed');
  assert.strictEqual(audit.readyBuckets, 2);
  assert.strictEqual(marketEvidenceGate(audit).status, 'passed');
}

{
  const readiness = checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-02',
    checkpoint3Ok: false,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  });
  const audit = buildProtectedRowAudit({
    readiness,
    protectedRows: [{ sku: 'SE6599', entityType: 'keyword', entityId: '1', kind: 'kw', text: 'bear shirt' }],
    checkpointScan: { ok: false, sources: [], commands: [] },
  });
  assert.strictEqual(audit.status, 'pending_not_due');
  assert.strictEqual(protectedRowAuditGate({ readiness, protectedRowAudit: audit }).status, 'pending_not_due');
}

{
  const readiness = checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-05',
    checkpoint3Ok: true,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  });
  const audit = buildProtectedRowAudit({
    readiness,
    protectedRows: [{ sku: 'SE6599', entityType: 'keyword', entityId: '1', kind: 'kw', text: 'bear shirt' }],
    checkpointScan: { ok: false, sources: [], commands: ['scan'] },
  });
  assert.strictEqual(audit.status, 'pending_data');
  assert.strictEqual(protectedRowAuditGate({ readiness, protectedRowAudit: audit }).status, 'pending_data');
}

{
  const readiness = checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-05',
    checkpoint3Ok: true,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  });
  const audit = buildProtectedRowAudit({
    readiness,
    protectedRows: [{
      sku: 'SE6599',
      entityType: 'keyword',
      entityId: '1',
      kind: 'kw',
      text: 'bear shirt',
      impressions3: 100,
      clicks3: 20,
      orders3: 4,
    }],
    checkpointScan: {
      ok: true,
      sources: [],
      commands: [],
      rows: [],
    },
  });
  assert.strictEqual(audit.status, 'passed');
  assert.strictEqual(audit.rows[0].verdict, 'no_current_low_eff_signal');
}

{
  const readiness = checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-05',
    checkpoint3Ok: true,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  });
  const audit = buildProtectedRowAudit({
    readiness,
    protectedRows: [{
      sku: 'SE6599',
      entityType: 'keyword',
      entityId: '1',
      kind: 'kw',
      text: 'bear shirt',
      impressions3: 100,
      clicks3: 20,
      orders3: 4,
    }],
    checkpointScan: {
      ok: true,
      sources: [],
      commands: [],
      rows: [{
        entityType: 'keyword',
        id: '1',
        windows: { 3: { impressions: 40, clicks: 8, orders: 3, spend: 4 } },
        decision: { reasonCode: 'cooldown_override_7d_high_acos' },
      }],
    },
  });
  assert.strictEqual(audit.status, 'needs_review');
  assert.strictEqual(audit.rows[0].verdict, 'possible_misfire_review');
}

{
  const readiness = checkpointReadiness({
    businessDate: '2026-06-02',
    checkpointDate: '2026-06-05',
    checkpoint3Ok: true,
    checkpoint7Ok: false,
    checkpoint30Ok: true,
  });
  const audit = buildProtectedRowAudit({
    readiness,
    protectedRows: [{
      sku: 'SE6599',
      entityType: 'keyword',
      entityId: '1',
      kind: 'kw',
      text: 'bear shirt',
      impressions3: 100,
      clicks3: 20,
      orders3: 4,
    }],
    checkpointScan: {
      ok: true,
      sources: [],
      commands: [],
      rows: [{
        entityType: 'keyword',
        id: '1',
        windows: { 3: { impressions: 100, clicks: 20, orders: 0, spend: 10 } },
        decision: { reasonCode: 'zero_order_3d' },
      }],
    },
  });
  assert.strictEqual(audit.status, 'needs_review');
  assert.strictEqual(audit.rows[0].verdict, 'renewed_hard_waste');
}

assert.deepStrictEqual(
  assessRootCauseSegmentOutcomes({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: true,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    metrics: {
      checkpoint3d: {
        ok: true,
        rootCauseSegments: [
          {
            key: 'protected_exploration',
            label: 'Protected exploration',
            metrics: {
              clicks: 80,
              prevClicks: 100,
              orders: 8,
              prevOrders: 10,
              cost: 40,
              prevCost: 50,
              delta: { clicksPct: -0.2, ordersPct: -0.2, costPct: -0.2 },
            },
          },
        ],
      },
      checkpoint7d: { ok: false },
    },
  }).verdicts[0].verdict,
  'protected_no_obvious_harm',
);

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: false,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'pending_data', status: 'missing_3d_data' },
    rootCauseOutcome: { status: 'pending_data', verdicts: [] },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
    scheduled3dCheckpoint: { ok: false, file: 'missing.json' },
  });
  assert.strictEqual(audit.status, 'pending_checkpoint_data');
  assert.strictEqual(audit.finalVerified, false);
  assert.strictEqual(audit.gates.find(gate => gate.key === 'checkpoint_3d_data').status, 'pending_data');
}

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: false,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'cost_control_without_obvious_harm', status: 'evaluated' },
    rootCauseOutcome: {
      status: 'evaluated',
      verdicts: [
        { verdict: 'habit_spend_controlled' },
        { verdict: 'market_spend_reduced_reopen_blocked' },
        { verdict: 'protected_no_obvious_harm' },
      ],
    },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
    scheduled3dCheckpoint: { ok: false, file: 'missing.json' },
  });
  assert.strictEqual(audit.status, 'pending_checkpoint_data');
  assert.strictEqual(audit.finalVerified, false);
  assert.strictEqual(audit.gates.find(gate => gate.key === 'checkpoint_3d_data').status, 'pending_data');
}

assert.strictEqual(
  scheduled3dCheckpointGate({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    scheduled3dCheckpoint: { ok: false, file: 'missing.json' },
  }).status,
  'pending_data',
);

assert.strictEqual(
  scheduled3dCheckpointGate({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    scheduled3dCheckpoint: {
      ok: true,
      data: {
        readiness: { checkpoint3dHasData: true },
        rootCauseOutcome: {
          status: 'evaluated',
          verdicts: [{ verdict: 'protected_possible_misfire_review' }],
        },
        outcome: { verdict: 'possible_misfire_review' },
      },
    },
  }).status,
  'needs_review',
);

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'cost_control_without_obvious_harm', status: 'evaluated' },
    rootCauseOutcome: {
      status: 'evaluated',
      verdicts: [
        { verdict: 'habit_spend_controlled' },
        { verdict: 'market_spend_reduced_reopen_blocked' },
        { verdict: 'protected_no_obvious_harm' },
      ],
    },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
    scheduled3dCheckpoint: { ok: false, file: 'missing.json' },
  });
  assert.strictEqual(audit.status, 'pending_checkpoint_data');
  assert.strictEqual(audit.finalVerified, false);
  assert.strictEqual(audit.gates.find(gate => gate.key === 'scheduled_3d_checkpoint_review').status, 'pending_data');
}

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'cost_control_without_obvious_harm', status: 'evaluated' },
    rootCauseOutcome: {
      status: 'evaluated',
      verdicts: [
        { verdict: 'habit_spend_controlled' },
        { verdict: 'market_spend_reduced_reopen_blocked' },
        { verdict: 'protected_no_obvious_harm' },
      ],
    },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
    scheduled3dCheckpoint: {
      ok: true,
      data: {
        readiness: { checkpoint3dHasData: true },
        rootCauseOutcome: {
          status: 'evaluated',
          verdicts: [
            { verdict: 'habit_spend_controlled' },
            { verdict: 'market_spend_reduced_reopen_blocked' },
            { verdict: 'protected_no_obvious_harm' },
          ],
        },
        outcome: { verdict: 'cost_control_without_obvious_harm' },
      },
    },
    protectedRowAudit: { status: 'passed', summary: { tracked: 30, needsReview: 0 } },
    marketEvidenceAudit: { status: 'passed', requiredBuckets: 2, readyBuckets: 2, missingBuckets: 0, needsReviewBuckets: 0 },
  });
  assert.strictEqual(audit.status, 'complete_candidate_verified');
  assert.strictEqual(audit.finalVerified, true);
}

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'cost_control_without_obvious_harm', status: 'evaluated' },
    rootCauseOutcome: {
      status: 'evaluated',
      verdicts: [
        { verdict: 'habit_spend_controlled' },
        { verdict: 'market_spend_reduced_reopen_blocked' },
        { verdict: 'protected_no_obvious_harm' },
      ],
    },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
    scheduled3dCheckpoint: {
      ok: true,
      data: {
        readiness: { checkpoint3dHasData: true },
        rootCauseOutcome: {
          status: 'evaluated',
          verdicts: [
            { verdict: 'habit_spend_controlled' },
            { verdict: 'market_spend_reduced_reopen_blocked' },
            { verdict: 'protected_no_obvious_harm' },
          ],
        },
        outcome: { verdict: 'cost_control_without_obvious_harm' },
      },
    },
    protectedRowAudit: { status: 'passed', summary: { tracked: 30, needsReview: 0 } },
    marketEvidenceAudit: { status: 'pending_data', requiredBuckets: 2, readyBuckets: 0, missingBuckets: 2, needsReviewBuckets: 0 },
  });
  assert.strictEqual(audit.status, 'pending_checkpoint_data');
  assert.strictEqual(audit.finalVerified, false);
  assert.strictEqual(audit.gates.find(gate => gate.key === 'market_evidence_review').status, 'pending_data');
}

{
  const audit = assessCompletionAudit({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-09',
      checkpoint3Ok: true,
      checkpoint7Ok: true,
      checkpoint30Ok: true,
    }),
    outcome: { verdict: 'cost_control_without_obvious_harm', status: 'evaluated' },
    rootCauseOutcome: {
      status: 'evaluated',
      verdicts: [{ verdict: 'protected_possible_misfire_review' }],
    },
    adjustmentSummary: { uniqueSuccess: 456 },
    hardResiduals: [{ entityId: 'backend-blocked' }],
    rootCauseSegments: { sourceOk: true, segments: [{}, {}, {}] },
  });
  assert.strictEqual(audit.status, 'needs_review');
  assert.strictEqual(audit.gates.find(gate => gate.key === 'root_cause_segment_verdicts').status, 'needs_review');
}

assert.strictEqual(
  assessWindowOutcome({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-02',
      checkpoint3Ok: false,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    metrics: { checkpoint3d: { ok: false }, checkpoint7d: { ok: false } },
    hardResiduals: [],
  }).verdict,
  'pending_data',
);

assert.strictEqual(
  assessWindowOutcome({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: true,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    metrics: {
      checkpoint3d: {
        ok: true,
        trackedSkus: {
          cost: 80,
          prevCost: 100,
          orders: 10,
          prevOrders: 10,
          acos: 0.18,
          prevAcos: 0.24,
          delta: { costPct: -0.2, ordersPct: 0, acosPct: -0.25 },
        },
        protectedSkus: {
          clicks: 60,
          prevClicks: 80,
          orders: 8,
          prevOrders: 10,
          delta: { clicksPct: -0.25, ordersPct: -0.2 },
        },
      },
      checkpoint7d: { ok: false },
    },
    hardResiduals: [{ entityId: 'backend-blocked' }],
  }).verdict,
  'cost_control_without_obvious_harm',
);

assert.strictEqual(
  assessWindowOutcome({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: true,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    metrics: {
      checkpoint3d: {
        ok: true,
        trackedSkus: {
          cost: 80,
          prevCost: 100,
          orders: 10,
          prevOrders: 10,
          acos: 0.18,
          prevAcos: 0.24,
          delta: { costPct: -0.2, ordersPct: 0, acosPct: -0.25 },
        },
        protectedSkus: {
          clicks: 20,
          prevClicks: 80,
          orders: 1,
          prevOrders: 10,
          delta: { clicksPct: -0.75, ordersPct: -0.9 },
        },
      },
      checkpoint7d: { ok: false },
    },
    hardResiduals: [],
  }).verdict,
  'possible_misfire_review',
);

{
  const outcome = assessWindowOutcome({
    readiness: checkpointReadiness({
      businessDate: '2026-06-02',
      checkpointDate: '2026-06-05',
      checkpoint3Ok: true,
      checkpoint7Ok: false,
      checkpoint30Ok: true,
    }),
    metrics: {
      checkpoint3d: {
        ok: true,
        trackedSkus: {
          cost: 80,
          prevCost: 100,
          orders: 10,
          prevOrders: 10,
          acos: 0.18,
          prevAcos: 0.24,
          delta: { costPct: -0.2, ordersPct: 0, acosPct: -0.25 },
        },
        protectedSkus: {
          impressions: 40,
          prevImpressions: 100,
          clicks: 90,
          prevClicks: 100,
          orders: 9,
          prevOrders: 10,
          delta: { impressionsPct: -0.6, clicksPct: -0.1, ordersPct: -0.1 },
        },
      },
      checkpoint7d: { ok: false },
    },
    hardResiduals: [],
  });
  assert.strictEqual(outcome.verdict, 'possible_misfire_review');
  assert.strictEqual(outcome.protectedImpressionsOk, false);
}

console.log('invalid_spend_checkpoint tests passed');
