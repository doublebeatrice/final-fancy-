const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('../scripts/run_old_product_maintenance');
const { buildSkuReviewDigest } = require('../src/sku_review_digest');
const {
  assessMarketRelation,
  buildOldProductMaintenancePlan,
  estimateCoverage,
  evaluateFullAutomationReadiness,
  runOldProductMaintenance,
} = require('../src/old_product_maintenance');

{
  assert.strictEqual(parseArgs([], {}).maxCandidates, 20);
  assert.strictEqual(parseArgs(['--watchlist-out', 'tmp/watchlist.json'], {}).watchlistOutFile, 'tmp/watchlist.json');
  assert.strictEqual(parseArgs(['--execution-handoff-out', 'tmp/handoff.json'], {}).executionHandoffOutFile, 'tmp/handoff.json');
}

const readyMarket = {
  readyForDecisionSupport: true,
  riskSignals: [],
  terms: ['retirement gifts for women'],
  operatingIntelligence: {
    readyForDecisionSupport: true,
    recommendedOperatingUse: 'controlled_validation_candidate',
    sourceCoverage: {
      terms: 1,
      keywordResearch: 1,
      productTimeMachine: 1,
      aba: 1,
      conversion: 1,
      seasonality: 1,
      sourceCount: 5,
      totalMatches: 5,
    },
    opportunityModels: [
      { key: 'low_monopoly_market', term: 'retirement gifts for women' },
      { key: 'conversion_economics_usable', term: 'retirement gifts for women' },
    ],
    riskSignals: [],
    missingEvidence: [],
  },
};

function oldRow(patch = {}) {
  return {
    sku: 'OLD1',
    asin: 'B0OLD00001',
    lifecycle: 'old_product',
    verdict: 'old_product_recovery_check',
    units7d: 8,
    units30d: 40,
    yoyUnitsPct: -0.5,
    profitRate: 0.2,
    invDays: 90,
    fulRes: 120,
    ad7: { clicks: 80, orders: 8, spend: 24, sales: 160, acos: 0.15 },
    ad30: { clicks: 400, orders: 40, spend: 100, sales: 800, acos: 0.125 },
    marketAnalysis: readyMarket,
    ...patch,
  };
}

{
  const relation = assessMarketRelation(oldRow({
    marketAnalysis: {
      readyForDecisionSupport: false,
      status: 'market_required_missing',
      coverage: { requested: 3 },
      operatingIntelligence: {
        readyForDecisionSupport: false,
        missingEvidence: ['selection_keyword_research', 'selection_product_time_machine'],
      },
    },
  }));
  assert.strictEqual(relation.key, 'market_unknown_missing_evidence');
  assert.strictEqual(relation.actionBoundary, 'evidence_only');
  assert.ok(relation.missingEvidence.includes('selection_keyword_research'));
}

{
  const relation = assessMarketRelation(oldRow({
    marketAnalysis: {
      readyForDecisionSupport: true,
      terms: ['old retirement gift', 'retirement gift basket for women'],
      operatingIntelligence: {
        readyForDecisionSupport: true,
        recommendedOperatingUse: 'market_shift_reseed_new_terms',
        sourceCoverage: {
          terms: 2,
          keywordResearch: 1,
          productTimeMachine: 1,
          aba: 1,
          conversion: 1,
          seasonality: 1,
          sourceCount: 5,
        },
        opportunityModels: [
          { key: 'keyword_demand_shift', term: 'retirement gift basket for women' },
          { key: 'new_price_band_emerging', term: 'retirement gift basket for women' },
        ],
        riskSignals: ['old_keyword_decline', 'new_keyword_cluster_emerging'],
        missingEvidence: [],
      },
    },
  }));
  assert.strictEqual(relation.key, 'market_shift');
  assert.strictEqual(relation.marketState, 'shifted_to_new_terms_or_specs');
  assert.strictEqual(relation.actionBoundary, 'reseed_market_and_repair_first');
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'SHIFT1',
        marketAnalysis: {
          readyForDecisionSupport: true,
          terms: ['old retirement gift', 'retirement gift basket for women'],
          operatingIntelligence: {
            readyForDecisionSupport: true,
            recommendedOperatingUse: 'market_shift_reseed_new_terms',
            sourceCoverage: {
              terms: 2,
              keywordResearch: 1,
              productTimeMachine: 1,
              aba: 1,
              conversion: 1,
              seasonality: 1,
              sourceCount: 5,
            },
            opportunityModels: [{ key: 'keyword_demand_shift', term: 'retirement gift basket for women' }],
            riskSignals: ['old_keyword_decline', 'new_keyword_cluster_emerging'],
            missingEvidence: [],
          },
        },
      })],
    },
  });
  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.marketRelation.key, 'market_shift');
  assert.strictEqual(candidate.route.route, 'reseed_market_then_repair');
  assert.strictEqual(candidate.route.actionBoundary, 'reseed_market_and_repair_first');
  assert.strictEqual(candidate.decision, 'market_shift_reseed_required');
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'SHIFTAPP',
        marketAnalysis: {
          readyForDecisionSupport: true,
          terms: ['old retirement gift', 'retirement gift basket for women'],
          operatingIntelligence: {
            readyForDecisionSupport: true,
            recommendedOperatingUse: 'market_shift_reseed_new_terms',
            sourceCoverage: {
              terms: 2,
              keywordResearch: 1,
              productTimeMachine: 1,
              aba: 1,
              conversion: 1,
              seasonality: 1,
              sourceCount: 5,
            },
            opportunityModels: [{ key: 'keyword_demand_shift', term: 'retirement gift basket for women' }],
            riskSignals: ['old_keyword_decline', 'new_keyword_cluster_emerging'],
            missingEvidence: [],
          },
        },
      })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'SHIFTAPP',
        approved: true,
        approvedBy: 'operator',
        actions: [{
          id: 'kw-shift-approved',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.7,
          plannedClicks: 100,
        }],
      }],
    },
  });

  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.marketRelation.key, 'market_shift');
  assert.strictEqual(candidate.executionGate.readyForDownstreamExecute, false);
  assert.ok(candidate.executionGate.reasons.includes('market_reseed_required_before_ad_execution'));
  assert.strictEqual(plan.approvedActionSchema.length, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.total, 0);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'REPAIRAPP',
        marketAnalysis: {
          readyForDecisionSupport: true,
          riskSignals: ['listing_quality_gap_path'],
          terms: ['retirement gifts for women'],
          operatingIntelligence: {
            readyForDecisionSupport: true,
            sourceCoverage: {
              terms: 1,
              keywordResearch: 1,
              productTimeMachine: 1,
              aba: 1,
              conversion: 1,
              seasonality: 1,
              sourceCount: 5,
            },
            opportunityModels: [{ key: 'listing_quality_gap', term: 'retirement gifts for women' }],
            riskSignals: ['listing_quality_gap_path'],
            missingEvidence: [],
          },
        },
      })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'REPAIRAPP',
        approved: true,
        approvedBy: 'operator',
        actions: [{
          id: 'kw-repair-approved',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.5,
          suggestedBid: 0.7,
          plannedClicks: 100,
        }],
      }],
    },
  });

  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.route.actionBoundary, 'repair_first');
  assert.strictEqual(candidate.executionGate.readyForDownstreamExecute, false);
  assert.ok(candidate.executionGate.reasons.includes('receiver_repair_required_before_ad_execution'));
  assert.strictEqual(plan.approvedActionSchema.length, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.total, 0);
}

{
  const marketEvidence = (patch = {}) => ({
    readyForDecisionSupport: true,
    terms: ['retirement gifts for women'],
    operatingIntelligence: {
      readyForDecisionSupport: true,
      sourceCoverage: {
        terms: 1,
        keywordResearch: 1,
        productTimeMachine: 1,
        aba: 1,
        conversion: 1,
        seasonality: 1,
        sourceCount: 5,
      },
      opportunityModels: [],
      riskSignals: [],
      missingEvidence: [],
      ...patch.operatingIntelligence,
    },
    riskSignals: [],
    ...patch,
  });
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'TYPE-DOWN',
          yoyUnitsPct: -0.8,
          marketAnalysis: marketEvidence({ riskSignals: ['market_demand_low'] }),
        }),
        oldRow({
          sku: 'TYPE-STABLE',
          marketAnalysis: marketEvidence({
            operatingIntelligence: {
              opportunityModels: [{ key: 'conversion_economics_usable', term: 'retirement gifts for women' }],
            },
          }),
        }),
        oldRow({
          sku: 'TYPE-GROWING',
          marketAnalysis: marketEvidence({
            operatingIntelligence: {
              opportunityModels: [{ key: 'trend_or_new_market', term: 'retirement gifts for women' }],
            },
          }),
        }),
        oldRow({
          sku: 'TYPE-SHIFT',
          marketAnalysis: marketEvidence({
            operatingIntelligence: {
              recommendedOperatingUse: 'market_shift_reseed_new_terms',
              opportunityModels: [{ key: 'keyword_demand_shift', term: 'retirement gift basket for women' }],
              riskSignals: ['old_keyword_decline', 'new_keyword_cluster_emerging'],
            },
          }),
        }),
        oldRow({
          sku: 'TYPE-COMP',
          marketAnalysis: marketEvidence({ riskSignals: ['competitor_ad_pressure_high'] }),
        }),
        oldRow({
          sku: 'TYPE-RECEIVER',
          profitRate: 0.05,
          marketAnalysis: marketEvidence({
            operatingIntelligence: {
              opportunityModels: [{ key: 'conversion_economics_usable', term: 'retirement gifts for women' }],
            },
          }),
        }),
      ],
    },
    maxCandidates: 10,
  });

  const types = Object.fromEntries(plan.candidateConfirmationList.items.map(item => [item.sku, item.declineClassification.type]));
  assert.strictEqual(types['TYPE-DOWN'], 'market_down');
  assert.strictEqual(types['TYPE-STABLE'], 'self_down_market_stable');
  assert.strictEqual(types['TYPE-GROWING'], 'self_down_market_growing');
  assert.strictEqual(types['TYPE-SHIFT'], 'market_shift');
  assert.strictEqual(types['TYPE-COMP'], 'competitor_pressure');
  assert.strictEqual(types['TYPE-RECEIVER'], 'receiver_gap');
  assert.strictEqual(plan.summary.byDeclineClassification.market_down, 1);
  assert.strictEqual(plan.summary.byDeclineClassification.receiver_gap, 1);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'CHANGE1',
        marketAnalysis: {
          readyForDecisionSupport: true,
          terms: ['old retirement gift', 'retirement gift basket for women'],
          riskSignals: ['competitor_ad_pressure_high'],
          operatingIntelligence: {
            readyForDecisionSupport: true,
            recommendedOperatingUse: 'market_shift_reseed_new_terms',
            sourceCoverage: {
              terms: 2,
              keywordResearch: 1,
              productTimeMachine: 1,
              aba: 1,
              conversion: 1,
              seasonality: 1,
              sourceCount: 5,
            },
            opportunityModels: [
              { key: 'keyword_demand_shift', term: 'retirement gift basket for women' },
              { key: 'new_price_band_emerging', term: 'retirement gift basket for women' },
              { key: 'competitor_traffic_map', term: 'retirement gift basket for women' },
            ],
            riskSignals: ['old_keyword_decline', 'new_keyword_cluster_emerging', 'competitor_ad_pressure_high'],
            missingEvidence: [],
          },
        },
      })],
    },
  });

  const sheet = plan.candidateConfirmationList.items[0];
  assert.strictEqual(sheet.market.changeEvidence.recommendedOperatingUse, 'market_shift_reseed_new_terms');
  assert.ok(sheet.market.changeEvidence.keywordChanges.some(item => item.key === 'old_keyword_decline'));
  assert.ok(sheet.market.changeEvidence.keywordChanges.some(item => item.key === 'keyword_demand_shift' && item.term === 'retirement gift basket for women'));
  assert.ok(sheet.market.changeEvidence.competitorChanges.some(item => item.key === 'competitor_ad_pressure_high'));
  assert.strictEqual(sheet.market.changeEvidence.competitorChanges.filter(item => item.key === 'competitor_ad_pressure_high').length, 1);
  assert.ok(sheet.market.changeEvidence.competitorChanges.some(item => item.key === 'competitor_traffic_map' && item.term === 'retirement gift basket for women'));
}

{
  const coverage = estimateCoverage(oldRow(), []);
  assert.strictEqual(coverage.targetOrderGap, 40);
  assert.strictEqual(coverage.requiredClickGap, 400);
  assert.strictEqual(coverage.plannedClickPool, 0);
  assert.strictEqual(coverage.conclusion, 'coverage_insufficient');
  assert.strictEqual(coverage.label, '覆盖不足');
}

{
  const coverage = estimateCoverage(oldRow({
    units30d: 0,
    yoyUnitsPct: -1,
    ad30: { clicks: 0, orders: 0, spend: 0, sales: 0 },
  }), []);
  assert.strictEqual(coverage.targetOrderGap, null);
  assert.strictEqual(coverage.requiredClickGap, null);
  assert.strictEqual(coverage.conclusion, 'historical_baseline_required');
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'MISSING',
          asin: 'B0MISSING1',
          productType: 'retirement bag',
          marketAnalysis: {
            readyForDecisionSupport: false,
            terms: ['retirement gifts for women', 'retirement bag'],
            operatingIntelligence: {
              readyForDecisionSupport: false,
              missingEvidence: ['selection_product_time_machine'],
            },
          },
        }),
      ],
    },
  });

  assert.strictEqual(plan.summary.candidates, 1);
  assert.strictEqual(plan.summary.readyForDownstreamExecute, 0);
  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.decision, 'market_evidence_required');
  assert.strictEqual(candidate.route.route, 'evidence_hold');
  assert.ok(candidate.executionGate.reasons.includes('market_evidence_missing'));
  assert.ok(candidate.executionGate.reasons.includes('pending_operator_confirmation'));
  assert.strictEqual(plan.marketEvidenceQueue.summary.total, 1);
  assert.strictEqual(plan.marketEvidenceQueue.summary.readyToFetch, 1);
  assert.strictEqual(candidate.marketEvidenceRequest.status, 'ready_to_fetch');
  assert.deepStrictEqual(candidate.marketEvidenceRequest.terms.slice(0, 2), ['retirement gifts for women', 'retirement bag']);
  assert.strictEqual(candidate.marketEvidenceRequest.commands.length, 1);
  assert.ok(candidate.marketEvidenceRequest.commands[0].command.includes('npm run ops:selection:product-time-machine'));
  assert.ok(candidate.marketEvidenceRequest.commands[0].command.includes('--search-keywords'));
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'COMMAND1',
          marketAnalysis: {
            readyForDecisionSupport: false,
            terms: ['retirement gifts for women'],
            operatingIntelligence: {
              readyForDecisionSupport: false,
              missingEvidence: [
                'selection_aba_search_terms',
                'selection_keyword_conversion_rate',
                'selection_keyword_seasonality',
                'selection_product_time_machine',
              ],
            },
          },
        }),
      ],
    },
  });
  const commands = plan.candidates[0].marketEvidenceRequest.commands;
  assert.ok(commands.find(item => item.layer === 'selection_aba_search_terms').command.includes('--search-terms'));
  assert.ok(commands.find(item => item.layer === 'selection_keyword_conversion_rate').command.includes('--keywords'));
  assert.ok(commands.find(item => item.layer === 'selection_keyword_seasonality').command.includes('--search-terms'));
  assert.ok(commands.find(item => item.layer === 'selection_product_time_machine').command.includes('--search-keywords'));
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'ZERO1',
          units30d: 0,
          yoyUnitsPct: -1,
          fulRes: 0,
          invDays: 0,
          ad30: { clicks: 0, orders: 0, spend: 0, sales: 0 },
          suggestedActions: [{
            id: 'kw-zero-1',
            entityType: 'keyword',
            actionType: 'bid',
            plannedClicks: 100,
          }],
        }),
        oldRow({
          sku: 'ACTIVE1',
          units30d: 40,
          yoyUnitsPct: -0.45,
          fulRes: 100,
          invDays: 80,
          ad30: { clicks: 300, orders: 30, spend: 90, sales: 600, acos: 0.15 },
        }),
      ],
    },
    maxCandidates: 2,
  });
  assert.strictEqual(plan.summary.candidates, 1);
  assert.strictEqual(plan.summary.deprioritizedCandidates, 1);
  assert.strictEqual(plan.candidates[0].sku, 'ACTIVE1');
  assert.strictEqual(plan.candidates[0].priority, 'P0');
  assert.strictEqual(plan.candidateConfirmationList.items.length, 1);
  assert.strictEqual(plan.marketEvidenceQueue.items.some(item => item.sku === 'ZERO1'), false);
  assert.strictEqual(plan.pendingConfirmationActions.items.some(item => item.sku === 'ZERO1'), false);
  assert.strictEqual(plan.deprioritizedCandidates[0].sku, 'ZERO1');
  assert.strictEqual(plan.deprioritizedCandidates[0].priority, 'P2');
  assert.ok(plan.deprioritizedCandidates[0].reasons.includes('priority_below_p1'));
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'SEED1',
        marketAnalysis: {
          readyForDecisionSupport: false,
          terms: ['fiesta', 'fiesta gifts', 'mat with spikes', 'keep dogs off counter', 'anti pet mat'],
          operatingIntelligence: {
            readyForDecisionSupport: false,
            missingEvidence: ['selection_keyword_research'],
          },
        },
      })],
    },
  });
  const terms = plan.candidates[0].marketEvidenceRequest.terms;
  assert.deepStrictEqual(terms.slice(0, 3), ['keep dogs off counter', 'mat with spikes', 'anti pet mat']);
  assert.ok(!terms.slice(0, 3).includes('fiesta'));
  assert.ok(!terms.includes('fiesta gifts'));
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [oldRow({
        sku: 'CONFIRM1',
        asin: 'B0CONFIRM1',
        suggestedActions: [
          {
            id: 'kw-confirm-1',
            entityType: 'keyword',
            actionType: 'bid',
            currentBid: 0.8,
            suggestedBid: 0.7,
            plannedClicks: 220,
          },
          {
            id: 'listing-confirm-1',
            entityType: 'listing',
            actionType: 'copy_edit',
            reason: 'listing must be reviewed by the listing approval chain',
          },
        ],
      })],
    },
  });

  assert.strictEqual(plan.summary.confirmationSheets, 1);
  assert.strictEqual(plan.summary.pendingConfirmationActions, 1);
  assert.strictEqual(plan.summary.manualSuggestionItems, 1);
  const sheet = plan.candidateConfirmationList.items[0];
  assert.strictEqual(sheet.sku, 'CONFIRM1');
  assert.strictEqual(sheet.conclusionLabel, '建议执行');
  assert.strictEqual(sheet.market.key, 'market_stable_or_growing_self_down');
  assert.strictEqual(sheet.coverage.targetOrderGap, 40);
  assert.strictEqual(sheet.coverage.requiredClickGap, 400);
  assert.strictEqual(sheet.coverage.plannedClickPool, 220);
  assert.strictEqual(sheet.actionEconomics.estimatedSpend, 154);
  assert.strictEqual(sheet.actionEconomics.current30dEstimatedProfit, 160);
  assert.deepStrictEqual(sheet.checkpoints.map(item => item.date), ['2026-06-19', '2026-06-23']);
  assert.strictEqual(sheet.approvalTemplate.approved, false);

  const pending = plan.pendingConfirmationActions.items[0];
  assert.strictEqual(pending.sku, 'CONFIRM1');
  assert.strictEqual(pending.action.id, 'kw-confirm-1');
  assert.strictEqual(pending.requiresOperatorApproval, true);
  assert.strictEqual(pending.willNotExecuteWithoutApproval, true);
  assert.strictEqual(pending.executionBoundary, 'operator_confirmation_required_reversible_ad');

  const manual = plan.manualSuggestionQueue.items[0];
  assert.strictEqual(manual.sku, 'CONFIRM1');
  assert.strictEqual(manual.action.id, 'listing-confirm-1');
  assert.strictEqual(manual.executionBoundary, 'manual_or_approval_chain_only');
  assert.strictEqual(manual.notInApprovedActionSchema, true);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'NO-MARKET',
        marketAnalysis: {
          readyForDecisionSupport: false,
          terms: ['retirement gifts for women'],
          operatingIntelligence: {
            readyForDecisionSupport: false,
            missingEvidence: ['selection_product_time_machine'],
          },
        },
        suggestedActions: [{
          id: 'kw-no-market-1',
          entityType: 'keyword',
          actionType: 'bid',
          plannedClicks: 220,
        }],
      })],
    },
  });

  assert.strictEqual(plan.candidateConfirmationList.items[0].conclusionLabel, '市场证据不足');
  assert.strictEqual(plan.pendingConfirmationActions.items.length, 0);
  assert.strictEqual(plan.manualSuggestionQueue.items.length, 0);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({
        sku: 'LOWCOVER1',
        asin: 'B0LOWCOV01',
      })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'LOWCOVER1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-low-cover-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 100,
        }],
      }],
    },
  });

  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.coverage.label, '覆盖不足');
  assert.strictEqual(candidate.executionGate.readyForDownstreamExecute, true);
  assert.strictEqual(candidate.decision, 'confirmed_action_handoff_ready_coverage_insufficient');
  assert.strictEqual(plan.approvedActionSchema.length, 1);
}

{
  const candidateId = 'old_product_maintenance::2026-06-16::READY1';
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'READY1',
          asin: 'B0READY001',
        }),
      ],
    },
    approval: {
      approvedCandidates: [{
        candidateId,
        sku: 'READY1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-ready-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
        }],
      }],
    },
  });

  assert.strictEqual(plan.summary.readyForDownstreamExecute, 1);
  assert.strictEqual(plan.summary.approvedActionRows, 1);
  assert.strictEqual(plan.summary.reviewTasks, 0);
  assert.strictEqual(plan.summary.watchlistItems, 0);
  assert.strictEqual(plan.summary.executionHandoffItems, 1);
  assert.strictEqual(plan.watchlistItems.length, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.total, 1);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.pendingLiveReadback, 1);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.watchlistEligible, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.status, 'awaiting_dry_run_execute_and_live_readback');
  assert.strictEqual(plan.approvedExecutionHandoff.policy.noEffectReviewUntilLanded, true);
  assert.ok(plan.approvedExecutionHandoff.executionPlan.dryRunCommand.includes('run_actions.js'));
  assert.ok(plan.approvedExecutionHandoff.executionPlan.dryRunCommand.includes('--dry-run'));
  assert.ok(plan.approvedExecutionHandoff.executionPlan.liveExecuteCommand.includes('--execute'));
  assert.strictEqual(plan.approvedExecutionHandoff.items[0].executionState, 'approved_pending_live_readback');
  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.executionGate.status, 'manual_confirmed_ready_for_downstream_execute');
  assert.strictEqual(candidate.executionGate.approvalState, 'manual_confirmed');
  assert.strictEqual(candidate.coverage.conclusion, 'coverage_possible');
  assert.strictEqual(candidate.actionEconomics.estimatedSpend, 154);
  assert.strictEqual(candidate.actionEconomics.current30dEstimatedProfit, 160);
  assert.strictEqual(candidate.actionEconomics.profitRisk.level, 'high');
  assert.ok(candidate.actionEconomics.profitRisk.reasons.includes('estimated_spend_near_or_above_current_profit_pool'));
  assert.strictEqual(plan.approvedActionSchema.length, 1);
  assert.strictEqual(plan.approvedActionSchema[0].decisionStage, 'manual_approved');
  assert.ok(plan.approvedActionSchema[0].actionSource.includes('old_product_maintenance'));
  assert.strictEqual(plan.approvedActionSchema[0].estimatedSpend, 154);
  assert.strictEqual(plan.approvedActionSchema[0].profitRisk.level, 'high');
}

{
  const candidateId = 'old_product_maintenance::2026-06-16::LANDED1';
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'LANDED1',
          asin: 'B0LANDED01',
        }),
      ],
    },
    approval: {
      approvedCandidates: [{
        candidateId,
        sku: 'LANDED1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-landed-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
          landingStatus: 'landed',
          readback: {
            bid: 0.7,
            state: 1,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
  });

  assert.strictEqual(plan.summary.readyForDownstreamExecute, 1);
  assert.strictEqual(plan.summary.approvedActionRows, 1);
  assert.strictEqual(plan.summary.reviewTasks, 2);
  assert.strictEqual(plan.summary.watchlistItems, 1);
  assert.strictEqual(plan.summary.executionHandoffItems, 1);
  assert.strictEqual(plan.approvedActionSchema[0].landingEvidence.status, 'landed_verified');
  assert.strictEqual(plan.approvedExecutionHandoff.summary.watchlistEligible, 1);
  assert.strictEqual(plan.approvedExecutionHandoff.items[0].executionState, 'landed_verified_watchlist_eligible');
  assert.strictEqual(plan.reviewTasks.length, 2);
  assert.ok(plan.reviewTasks.every(task => task.status === 'waiting_review'));
  assert.ok(plan.reviewTasks.every(task => task.reviewPlan.requiresMarketRelativeImprovement === true));
  assert.ok(plan.reviewTasks.every(task => task.reviewPlan.requiresProfitImprovement === true));
  assert.strictEqual(plan.watchlistItems.length, 1);
  assert.strictEqual(plan.watchlistItems[0].sku, 'LANDED1');
  assert.strictEqual(plan.watchlistItems[0].source, 'old_product_maintenance');
  assert.strictEqual(plan.watchlistItems[0].nextCheckDate, '2026-06-19');
  assert.deepStrictEqual(plan.watchlistItems[0].stageTargets.map(item => item.by), ['2026-06-19', '2026-06-23']);
  assert.ok(plan.watchlistItems[0].nextChecks.some(check => check.includes('market-relative')));
  assert.ok(plan.watchlistItems[0].closeConditions.some(condition => condition.includes('profit')));
  assert.strictEqual(plan.watchlistItems[0].lastAction.verified, true);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [oldRow({ sku: 'MISMATCH1', asin: 'B0MISMATCH1' })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'MISMATCH1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-mismatch-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
          landingStatus: 'landed',
          readback: {
            bid: 0.8,
            state: 1,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
  });

  assert.strictEqual(plan.approvedActionSchema[0].landingEvidence.status, 'pending_live_readback');
  assert.ok(plan.approvedActionSchema[0].landingEvidence.reasons.includes('bid_readback_mismatch'));
  assert.strictEqual(plan.summary.reviewTasks, 0);
  assert.strictEqual(plan.summary.watchlistItems, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.pendingLiveReadback, 1);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.watchlistEligible, 0);
  assert.strictEqual(plan.approvedExecutionHandoff.items[0].executionState, 'approved_pending_live_readback');
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [oldRow({ sku: 'BIDPAUSED1', asin: 'B0BIDPAUSE' })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'BIDPAUSED1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-bid-paused-1',
          entityType: 'keyword',
          actionType: 'bid',
          suggestedBid: 0.7,
          plannedClicks: 220,
          landingStatus: 'landed',
          readback: {
            bid: 0.7,
            state: 0,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
  });

  assert.strictEqual(plan.approvedActionSchema[0].landingEvidence.status, 'pending_live_readback');
  assert.ok(plan.approvedActionSchema[0].landingEvidence.reasons.includes('child_state_not_enabled'));
  assert.strictEqual(plan.summary.watchlistItems, 0);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    allSkuReview: {
      rows: [oldRow({ sku: 'PAUSE1', asin: 'B0PAUSE001' })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'PAUSE1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-pause-1',
          entityType: 'keyword',
          actionType: 'pause',
          plannedClicks: 0,
          landingStatus: 'landed',
          readback: {
            state: 0,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
  });

  assert.strictEqual(plan.approvedActionSchema[0].landingEvidence.status, 'landed_verified');
  assert.strictEqual(plan.summary.watchlistItems, 1);
  assert.strictEqual(plan.approvedExecutionHandoff.summary.watchlistEligible, 1);
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    generatedAt: '2026-06-16T08:00:00.000Z',
    depositStatus: { status: 'blocked', missing: ['daily_html'] },
    allSkuReview: {
      rows: [
        oldRow({
          sku: 'BLOCKDATA1',
          asin: 'B0BLOCKD01',
        }),
      ],
    },
    approval: {
      approvedCandidates: [{
        sku: 'BLOCKDATA1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-blocked-data-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
        }],
      }],
    },
  });

  assert.strictEqual(plan.approvedExecutionHandoff.summary.status, 'blocked_by_data_prerequisites');
  assert.ok(plan.approvedExecutionHandoff.summary.blockers.includes('daily_deposit_not_complete'));
  assert.strictEqual(plan.approvedExecutionHandoff.executionPlan.liveExecuteBlocked, true);
  assert.strictEqual(plan.approvedExecutionHandoff.items[0].executionState, 'approved_blocked_by_data_prerequisites');
}

{
  const plan = buildOldProductMaintenancePlan({
    businessDate: '2026-06-16',
    allSkuReview: {
      rows: [oldRow({ sku: 'UNSAFE1', asin: 'B0UNSAFE01' })],
    },
    approval: {
      approvedCandidates: [{
        sku: 'UNSAFE1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'listing-1',
          entityType: 'listing',
          actionType: 'copy_edit',
          plannedClicks: 220,
        }],
      }],
    },
  });

  const candidate = plan.candidates[0];
  assert.strictEqual(candidate.executionGate.readyForDownstreamExecute, false);
  assert.ok(candidate.executionGate.reasons.includes('non_reversible_or_unsupported_action_present'));
  assert.strictEqual(plan.approvedActionSchema.length, 0);
}

function oldProductAutomationSample(patch = {}) {
  return {
    source: 'old_product_maintenance',
    oldProductMaintenance: true,
    marketRelative: { yoyGapImproved: true, attributionClear: true },
    profit: { improved: true },
    reasons: [
      'old_product_ad_spend_reviewed',
      'old_product_conversion_reviewed',
      'old_product_inventory_risk_reviewed',
    ],
    ...patch,
  };
}

{
  const missingOperatingEvidence = Array.from({ length: 10 }, (_, index) => ({
    source: 'old_product_maintenance',
    oldProductMaintenance: true,
    actionType: 'bid_down',
    week: index < 5 ? '2026-W24' : '2026-W25',
    marketRelative: { relativeGapImproved: true, attributionClear: true },
    profit: { improved: true },
  }));

  const readiness = evaluateFullAutomationReadiness(missingOperatingEvidence);
  assert.strictEqual(readiness.eligible, false);
  assert.strictEqual(readiness.status, 'keep_semi_auto');
  assert.strictEqual(readiness.passedSamples, 0);
  assert.ok(readiness.blockers.includes('old_product_operating_evidence_missing'));
}

{
  const ninePassing = Array.from({ length: 9 }, (_, index) => oldProductAutomationSample({
    week: index < 5 ? '2026-W24' : '2026-W25',
  }));
  const notReady = evaluateFullAutomationReadiness(ninePassing);
  assert.strictEqual(notReady.eligible, false);
  assert.ok(notReady.blockers.includes('sample_size_below_threshold'));

  const tenPassing = [
    ...ninePassing,
    oldProductAutomationSample({
      week: '2026-W25',
      marketRelative: { relativeGapImproved: true, attributionClear: true },
      profit: { unitProfitQualityImproved: true },
    }),
  ];
  const ready = evaluateFullAutomationReadiness(tenPassing);
  assert.strictEqual(ready.eligible, false);
  assert.strictEqual(ready.status, 'keep_semi_auto');
  assert.ok(ready.blockers.includes('action_type_missing'));
  assert.deepStrictEqual(ready.eligibleActionTypes, []);
}

{
  const bidDownPassing = Array.from({ length: 10 }, (_, index) => oldProductAutomationSample({
    actionType: 'bid_down',
    week: index < 5 ? '2026-W24' : '2026-W25',
    marketRelative: { relativeGapImproved: true, attributionClear: true },
    profit: { improved: true },
  }));
  const budgetFailing = Array.from({ length: 10 }, (_, index) => oldProductAutomationSample({
    actionType: 'budget',
    week: index < 5 ? '2026-W24' : '2026-W25',
    marketRelative: { relativeGapImproved: index < 2, attributionClear: true },
    profit: { improved: true },
  }));

  const readiness = evaluateFullAutomationReadiness([...bidDownPassing, ...budgetFailing]);
  assert.ok(readiness.eligibleActionTypes.includes('bid_down'));
  assert.ok(!readiness.eligibleActionTypes.includes('budget'));
  assert.strictEqual(readiness.actionTypeReadiness.bid_down.eligible, true);
  assert.strictEqual(readiness.actionTypeReadiness.budget.eligible, false);
  assert.ok(readiness.actionTypeReadiness.budget.blockers.includes('sample_size_below_threshold'));
  assert.strictEqual(readiness.status, 'partial_full_auto_candidate');
}

{
  const unclearMarketAttribution = Array.from({ length: 10 }, (_, index) => oldProductAutomationSample({
    actionType: 'bid_down',
    week: index < 5 ? '2026-W24' : '2026-W25',
    marketRelative: { relativeGapImproved: true, attributionClear: false },
    profit: { improved: true },
  }));

  const readiness = evaluateFullAutomationReadiness(unclearMarketAttribution);
  assert.strictEqual(readiness.eligible, false);
  assert.strictEqual(readiness.status, 'keep_semi_auto');
  assert.strictEqual(readiness.passedSamples, 0);
  assert.ok(readiness.blockers.includes('market_attribution_unclear'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-maintenance-'));
  const outFile = path.join(tmpDir, 'old_product_maintenance.json');
  const markdownFile = path.join(tmpDir, 'old_product_maintenance.md');
  const marketEvidenceQueueOutFile = path.join(tmpDir, 'market_evidence_queue.json');
  const watchlistOutFile = path.join(tmpDir, 'old_product_watchlist.json');
  const skuWatchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  fs.writeFileSync(skuWatchlistFile, JSON.stringify({
    schemaVersion: 1,
    items: [{ sku: 'KEEP1', status: 'watching', nextCheckDate: '2026-06-18' }],
  }, null, 2), 'utf8');
  const result = runOldProductMaintenance({
    businessDate: '2026-06-16',
    allSkuReview: { rows: [oldRow({ sku: 'RUN1', asin: 'B0RUN00001' })] },
    approval: {
      approvedCandidates: [{
        sku: 'RUN1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-run-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
          landingStatus: 'landed',
          readback: {
            bid: 0.7,
            state: 1,
            campaignState: 1,
            groupState: 1,
          },
        }],
      }],
    },
    outFile,
    markdownFile,
    marketEvidenceQueueOutFile,
    watchlistOutFile,
    skuWatchlistFile,
    generatedAt: '2026-06-16T08:00:00.000Z',
  });
  assert.strictEqual(result.plan.summary.candidates, 1);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
  assert.ok(fs.existsSync(marketEvidenceQueueOutFile));
  assert.ok(fs.existsSync(watchlistOutFile));
  assert.strictEqual(result.files.skuWatchlistFile, skuWatchlistFile);
  assert.strictEqual(result.files.skuWatchlistMergeStatus, 'updated');
  assert.ok(fs.readFileSync(markdownFile, 'utf8').includes('RUN1'));
  const watchlist = JSON.parse(fs.readFileSync(watchlistOutFile, 'utf8'));
  assert.strictEqual(watchlist.items.length, 1);
  assert.strictEqual(watchlist.items[0].nextCheckDate, '2026-06-19');
  const mergedWatchlist = JSON.parse(fs.readFileSync(skuWatchlistFile, 'utf8'));
  assert.strictEqual(mergedWatchlist.items.some(item => item.sku === 'KEEP1'), true);
  assert.strictEqual(mergedWatchlist.items.filter(item => item.sku === 'RUN1').length, 1);
  assert.strictEqual(mergedWatchlist.items.find(item => item.sku === 'RUN1').source, 'old_product_maintenance');
  const digest = buildSkuReviewDigest({
    today: '2026-06-19',
    watchlistFile: skuWatchlistFile,
    reviewQueueFile: path.join(tmpDir, 'missing_review_queue.json'),
    taskFollowupDir: path.join(tmpDir, 'missing_followups'),
  });
  assert.ok(digest.items.some(item => item.sku === 'RUN1'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-watchlist-invalid-'));
  const skuWatchlistFile = path.join(tmpDir, 'sku_watchlist.json');
  fs.writeFileSync(skuWatchlistFile, '{ invalid json', 'utf8');
  const result = runOldProductMaintenance({
    businessDate: '2026-06-16',
    allSkuReview: { rows: [oldRow({ sku: 'BADWATCH1', asin: 'B0BADWATCH' })] },
    approval: {
      approvedCandidates: [{
        sku: 'BADWATCH1',
        approved: true,
        approvedBy: 'manual',
        actions: [{
          id: 'kw-bad-watch-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
          landingStatus: 'landed',
          readback: { state: 1, campaignState: 1, groupState: 1 },
        }],
      }],
    },
    skuWatchlistFile,
    outFile: path.join(tmpDir, 'old_product_maintenance.json'),
    markdownFile: path.join(tmpDir, 'old_product_maintenance.md'),
    generatedAt: '2026-06-16T08:00:00.000Z',
  });
  assert.strictEqual(result.files.skuWatchlistMergeStatus, 'watchlist_parse_failed');
  assert.strictEqual(fs.readFileSync(skuWatchlistFile, 'utf8'), '{ invalid json');
}

console.log('old_product_maintenance.test.js passed');
