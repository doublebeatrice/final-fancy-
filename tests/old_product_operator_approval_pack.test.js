const assert = require('assert');
const {
  buildOldProductOperatorApprovalPack,
  renderOldProductOperatorApprovalMarkdown,
} = require('../src/old_product_operator_approval_pack');

{
  const pack = buildOldProductOperatorApprovalPack({
    businessDate: '2026-06-16',
    candidateConfirmationList: {
      summary: { total: 1 },
      items: [{
        candidateId: 'old_product_maintenance::2026-06-16::READY1',
        sku: 'READY1',
        asin: 'B0READY001',
        conclusionLabel: '建议执行',
        market: { label: 'market stable or usable while SKU is down' },
        coverage: { label: '覆盖足够', targetOrderGap: 40, requiredClickGap: 400, plannedClickPool: 220, coverageRatio: 0.55 },
        actionEconomics: { estimatedSpend: 154, current30dEstimatedProfit: 160, profitRisk: { level: 'high' } },
        checkpoints: [{ day: 3, date: '2026-06-19' }, { day: 7, date: '2026-06-23' }],
      }],
    },
    pendingConfirmationActions: {
      summary: { total: 1 },
      items: [{
        candidateId: 'old_product_maintenance::2026-06-16::READY1',
        businessDate: '2026-06-16',
        sku: 'READY1',
        asin: 'B0READY001',
        conclusionLabel: '建议执行',
        route: 'controlled_push',
        intensity: 'medium',
        action: {
          id: 'kw-ready-1',
          entityType: 'keyword',
          actionType: 'bid',
          currentBid: 0.8,
          suggestedBid: 0.7,
          plannedClicks: 220,
          reversibleAdAction: true,
        },
      }],
    },
    manualSuggestionQueue: {
      summary: { total: 1 },
      items: [{
        sku: 'READY1',
        action: { id: 'listing-ready-1', actionType: 'copy_edit' },
        executionBoundary: 'manual_or_approval_chain_only',
      }],
    },
  });

  assert.strictEqual(pack.summary.approvalNeededActions, 1);
  assert.strictEqual(pack.summary.defaultApproved, false);
  assert.strictEqual(pack.approvedCandidates.length, 1);
  assert.strictEqual(pack.approvedCandidates[0].approved, false);
  assert.strictEqual(pack.approvedCandidates[0].approvedBy, '');
  assert.strictEqual(pack.approvedCandidates[0].candidateId, 'old_product_maintenance::2026-06-16::READY1');
  assert.strictEqual(pack.approvedCandidates[0].actions[0].id, 'kw-ready-1');
  assert.strictEqual(pack.approvedCandidates[0].operatorFill.requiredEdit, 'set approved=true and approvedBy before rerunning old-product maintenance');
  assert.strictEqual(pack.candidateContext.READY1.coverageRatio, 0.55);
  assert.strictEqual(pack.manualSuggestionItems.length, 1);

  const markdown = renderOldProductOperatorApprovalMarkdown(pack);
  assert.ok(markdown.includes('READY1'));
  assert.ok(markdown.includes('approved:false'));
  assert.ok(markdown.includes('kw-ready-1'));
  assert.ok(markdown.includes('listing-ready-1'));
}

{
  const pack = buildOldProductOperatorApprovalPack({
    businessDate: '2026-06-16',
    candidateConfirmationList: { summary: { total: 0 }, items: [] },
    pendingConfirmationActions: { summary: { total: 0 }, items: [] },
  });
  assert.deepStrictEqual(pack.approvedCandidates, []);
  assert.strictEqual(pack.summary.approvalNeededActions, 0);
}

console.log('old_product_operator_approval_pack.test.js passed');
