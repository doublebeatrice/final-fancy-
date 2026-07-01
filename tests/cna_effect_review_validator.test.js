const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validate } = require('../scripts/execute/validate_cna_6_11_effect_review_result');

const ROOT = path.join(__dirname, '..');
const templateFile = path.join(ROOT, 'data', 'tasks', 'cna_6_11_effect_review_result_template.json');

const requiredSkus = [
  'WOO0173',
  'WOO0172',
  'GM2827',
  'UAN2600',
  'UAN0188',
  'HEL0606',
  'HEL0319',
  'UAN3646',
];

function readTemplate() {
  return JSON.parse(fs.readFileSync(templateFile, 'utf8'));
}

function completeResult() {
  const result = readTemplate();
  result.status = 'review_complete';
  result.requiredLiveReads.backendReady = true;
  result.requiredLiveReads.keywordReadback.evidenceFiles = [
    'data/snapshots/cna_6_11_keyword_readback.json',
  ];
  result.requiredLiveReads.skuArchitecture.evidenceFiles = [
    'data/snapshots/cna_6_11_ad_architecture.json',
  ];
  result.requiredLiveReads.customerSearchTerms.status = 'unavailable_shell_rows';
  result.skuResults = requiredSkus.map(sku => ({
    sku,
    preReviewLadder: '2 get impressions/clicks',
    liveEvidenceFiles: [`data/snapshots/cna_6_11_${sku}.json`],
    architectureStatus: 'KW/AUTO/ASIN/SB/SBV checked from live read',
    funnelLayer: 'orders',
    searchTermOrAsinRelevance: 'relevant or explicitly unavailable',
    listingOrOfferBlocker: 'none',
    finalLadder: '3 protect effective line',
    actionTakenOrHoldReason: 'protect effective line after live review',
    nextReview: '2026-06-12',
    closeoutState: 'closed_or_carried_forward',
  }));
  result.closeout = {
    canCloseCna: false,
    closedItems: ['all SKU rows reviewed'],
    carriedForwardItems: ['operator decides whether to close matrix'],
    nextCheckDate: '2026-06-12',
    gbrainUpdated: false,
    watchlistUpdated: false,
  };
  return result;
}

{
  const pending = validate(readTemplate());
  assert.strictEqual(pending.valid, false);
  assert.ok(pending.missing.some(item => item.field === 'backendReady'));
  assert.ok(pending.missing.some(item => item.scope === 'WOO0173' && item.field === 'finalLadder'));
}

{
  const result = completeResult();
  const validated = validate(result);
  assert.strictEqual(validated.valid, true);
  assert.strictEqual(validated.skuRows, 8);
  assert.deepStrictEqual(validated.warnings, []);
}

{
  const result = completeResult();
  result.skuResults[0].finalLadder = '4ish push';
  const validated = validate(result);
  assert.strictEqual(validated.valid, false);
  assert.ok(validated.missing.some(item => item.scope === 'WOO0173' && item.field === 'finalLadder'));
}

