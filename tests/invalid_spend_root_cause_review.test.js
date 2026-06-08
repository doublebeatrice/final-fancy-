const assert = require('assert');

const {
  attachMarketEvidenceStatus,
  buildSkuActionMap,
  classifyProtectedExploration,
  classifyQueueRow,
  deriveMarketVerdict,
  hardResidualRows,
  inferSku,
  isAutoBucketLabel,
  marketEvidenceStatusForFiles,
  marketEvidenceSeeds,
  protectedExplorationRows,
  summarizeRows,
} = require('../scripts/execute/generate_invalid_spend_root_cause_review');

assert.deepStrictEqual(
  classifyQueueRow({
    habit: 'kw_zero_order_or_high_acos_not_stopped',
    marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
  }),
  {
    rootCause: 'market_misjudgment_plus_bad_habit',
    habit: 'kw_zero_order_or_high_acos_not_stopped',
    marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
    reopenPolicy: 'do_not_reopen_without_fresh_market_and_exact_conversion_proof',
    nextAction: 'hold_generic_or_expanded_lane_until_market_fit_is_reproven',
  },
);

assert.deepStrictEqual(
  classifyQueueRow({
    habit: 'auto_loose_or_substitutes_uncontrolled',
    marketBucket: 'unclassified_low_efficiency_tail',
  }),
  {
    rootCause: 'bad_habit_only',
    habit: 'auto_loose_or_substitutes_uncontrolled',
    marketBucket: 'unclassified_low_efficiency_tail',
    reopenPolicy: 'reopen_only_after_recent_conversion_proof',
    nextAction: 'keep_stop_loss_and_reopen_only_if_recent_conversion_returns',
  },
);

{
  const summary = summarizeRows([
    {
      sku: 'GT3801',
      actionType: 'pause',
      spend30: 10,
      clicks30: 20,
      orders30: 1,
      text: 'purple funeral ribbon pins',
      habit: 'kw_zero_order_or_high_acos_not_stopped',
      marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
    },
    {
      sku: 'EY0793',
      actionType: 'bid',
      spend30: 4,
      clicks30: 8,
      orders30: 0,
      text: 'Substitutes',
      habit: 'auto_loose_or_substitutes_uncontrolled',
      marketBucket: 'unclassified_low_efficiency_tail',
    },
  ], classifyQueueRow);
  assert.strictEqual(summary.byRootCause[0].key, 'market_misjudgment_plus_bad_habit');
  assert.strictEqual(summary.byRootCause[0].spend30, 10);
  assert.deepStrictEqual(summary.byRootCause[0].rootCauses, ['market_misjudgment_plus_bad_habit']);
  assert.strictEqual(summary.byRootCause[1].key, 'bad_habit_only');
  assert.strictEqual(summary.topSkus.length, 2);
}

assert.deepStrictEqual(
  classifyProtectedExploration({
    spend3: 3,
    orders3: 1,
    spend7: 8,
    orders7: 2,
    spend30: 30,
    orders30: 8,
    acos30: 0.18,
  }).reviewLevel,
  'protect_recent_and_30d',
);

assert.deepStrictEqual(
  classifyProtectedExploration({
    spend3: 8,
    orders3: 0,
    spend7: 20,
    orders7: 2,
    spend30: 40,
    orders30: 10,
    acos30: 0.18,
  }).reviewLevel,
  'fragile_watch_3d_zero_order',
);

assert.deepStrictEqual(
  classifyProtectedExploration({
    spend3: 2,
    orders3: 0,
    spend7: 4,
    orders7: 0,
    spend30: 40,
    orders30: 10,
    acos30: 0.18,
  }).reviewLevel,
  'watch_30d_efficient_only',
);

assert.deepStrictEqual(
  protectedExplorationRows({
    protectedGrayRows: [
      {
        sku: 'SAN0383',
        kind: 'kw',
        entityType: 'keyword',
        entityId: '1',
        text: 'cowboy hats',
        spend3: 8,
        orders3: 0,
        spend7: 2.1,
        orders7: 1,
        acos7: 0.4,
        spend30: 20,
        orders30: 10,
        acos30: 0.15,
      },
    ],
  })[0].rootCause,
  'protected_exploration',
);

assert.deepStrictEqual(
  hardResidualRows({
    hardResiduals: [
      {
        sku: 'TH2781',
        kind: 'auto',
        entityId: '387745729096404',
        text: 'Loose-match',
      },
    ],
  })[0].nextAction,
  'retry_after_backend_system_adjustment_cooldown_or_verify_it_left_the_low_efficiency_pool',
);

{
  const plan = marketEvidenceSeeds([
    {
      sku: 'GT3801',
      spend30: 10,
      clicks30: 20,
      orders30: 1,
      text: 'purple funeral ribbon pins',
      marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
    },
    {
      sku: 'GT3801',
      spend30: 5,
      clicks30: 10,
      orders30: 0,
      text: 'asinExpandedFrom=B0CCS2RH1L',
      marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
    },
    {
      sku: 'EY0793',
      spend30: 20,
      clicks30: 40,
      orders30: 2,
      text: 'Substitutes',
      marketBucket: 'unclassified_low_efficiency_tail',
    },
  ]);
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].marketBucket, 'funeral_memorial_ribbon_fit_misjudge');
  assert.deepStrictEqual(plan[0].topTerms, ['purple funeral ribbon pins']);
  assert.deepStrictEqual(plan[0].topAsins, ['B0CCS2RH1L']);
  assert.strictEqual(plan[0].evidenceStatus, 'required_missing');
  assert.ok(plan[0].commands[0].includes('ops:selection:product-time-machine'));
}

assert.strictEqual(isAutoBucketLabel('Substitutes'), true);
assert.strictEqual(isAutoBucketLabel('purple funeral ribbon pins'), false);
assert.strictEqual(inferSku({ campaignName: 'kw_core_gt3801', groupName: '' }), 'GT3801');
assert.strictEqual(
  inferSku({ kind: 'sbKw', entityType: 'sbKeyword', adGroupId: '398273352562252', campaignName: 'sb' }),
  'UNMAPPED_SBKW::398273352562252',
);

{
  const readEvidence = (file, kind) => ({
    exists: kind !== 'aba',
    data: { ok: true, rowCount: kind === 'conversion' ? 0 : 12, total: 12, coverage: { missingCount: kind === 'ptm' ? 1 : 0 } },
  });
  const status = marketEvidenceStatusForFiles(
    { marketBucket: 'funeral_memorial_ribbon_fit_misjudge' },
    { businessDate: '2026-06-02', readEvidence },
  );
  assert.strictEqual(status.evidenceStatus, 'required_missing');
  assert.strictEqual(status.evidenceSummary.presentFiles, 2);
  assert.ok(status.evidenceReasons[0].includes('aba'));
}

{
  const readEvidence = (file, kind) => ({
    exists: true,
    data: { ok: true, rowCount: kind === 'conversion' ? 0 : 12, total: 12, coverage: { missingCount: kind === 'ptm' ? 2 : 0 } },
  });
  const status = attachMarketEvidenceStatus(
    [{ marketBucket: 'funeral_memorial_ribbon_fit_misjudge' }],
    { businessDate: '2026-06-02', readEvidence },
  )[0];
  assert.strictEqual(status.evidenceStatus, 'evidence_ready_with_gaps');
  assert.strictEqual(status.evidenceSummary.okFiles, 3);
  assert.strictEqual(status.evidenceSummary.zeroRowFiles, 1);
}

{
  const readEvidence = (file, kind) => ({
    exists: true,
    data: { ok: kind !== 'aba', rowCount: 12, total: 12, coverage: { missingCount: 0 } },
  });
  const status = marketEvidenceStatusForFiles(
    { marketBucket: 'funeral_memorial_ribbon_fit_misjudge' },
    { businessDate: '2026-06-02', readEvidence },
  );
  assert.strictEqual(status.evidenceStatus, 'needs_review');
}

assert.strictEqual(
  deriveMarketVerdict({
    evidenceFiles: [
      { kind: 'ptm', summary: { rowCount: 50, operatorSummary: { byRecommendedUse: { research_only: 42 } } } },
      { kind: 'conversion', summary: { rowCount: 0, operatorSummary: {} } },
      { kind: 'aba', summary: { rowCount: 2, operatorSummary: { byCompetitionTier: { high: 1, medium: 1 } } } },
    ],
  }).marketDecision,
  'keep_market_reopen_blocked',
);

assert.strictEqual(
  deriveMarketVerdict({
    marketBucket: 'baby_shower_party_competition_fit_gap',
    evidenceFiles: [
      { kind: 'ptm', summary: { rowCount: 250, operatorSummary: { byRecommendedUse: { research_only: 100 } } } },
      { kind: 'conversion', summary: { rowCount: 4, operatorSummary: { byCostRisk: { low: 3 }, byRecommendedUse: { low_bid_test_or_cross_check: 3 } } } },
      { kind: 'aba', summary: { rowCount: 25, operatorSummary: { byCompetitionTier: { high: 15, medium: 10 } } } },
    ],
  }).reopenBoundary,
  'block_auto_loose_substitutes_generic_broad_and_expanded_asin; exact_only_after_own_conversion_proof',
);

{
  const rows = [
    {
      sku: 'GT3801',
      actionType: 'pause',
      spend30: 10,
      clicks30: 20,
      orders30: 1,
      text: 'purple funeral ribbon pins',
      habit: 'kw_zero_order_or_high_acos_not_stopped',
      marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
      ...classifyQueueRow({
        habit: 'kw_zero_order_or_high_acos_not_stopped',
        marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
      }),
    },
    {
      sku: 'EY0793',
      actionType: 'bid',
      spend30: 20,
      clicks30: 40,
      orders30: 2,
      text: 'Substitutes',
      habit: 'auto_loose_or_substitutes_uncontrolled',
      marketBucket: 'unclassified_low_efficiency_tail',
      ...classifyQueueRow({
        habit: 'auto_loose_or_substitutes_uncontrolled',
        marketBucket: 'unclassified_low_efficiency_tail',
      }),
    },
  ];
  const actionMap = buildSkuActionMap({
    classifiedRows: rows,
    protectedRows: [{ sku: 'GT3801', kind: 'kw', text: 'funeral ribbon exact' }],
    marketEvidencePlan: [{
      marketBucket: 'funeral_memorial_ribbon_fit_misjudge',
      marketVerdict: 'market_fit_not_proven',
      reopenBoundary: 'do_not_reopen_until_market_demand_cost_layer_and_own_exact_conversion_are_proven',
    }],
  });
  assert.strictEqual(actionMap[0].sku, 'EY0793');
  assert.strictEqual(actionMap[0].route, 'bad_habit_stop_loss_monitor_regeneration');
  assert.strictEqual(actionMap[1].sku, 'GT3801');
  assert.strictEqual(actionMap[1].route, 'do_not_reopen_market_bucket');
  assert.strictEqual(actionMap[1].protectedRows, 1);
}

console.log('invalid_spend_root_cause_review tests passed');
