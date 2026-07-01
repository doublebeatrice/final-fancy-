const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildProductLineOpsProfile,
  INTERNAL_EVIDENCE_ROUTES,
  runProductLineOpsProfile,
  sampleProductLineOpsInput,
} = require('../src/product_line_ops_profile');

{
  const routes = INTERNAL_EVIDENCE_ROUTES.map(route => route.sourceSystem);
  assert.ok(routes.includes('selection'));
  assert.ok(routes.includes('sif'));
  assert.ok(routes.includes('sellerinventory'));
  assert.ok(routes.includes('ad_backend'));
  assert.ok(!routes.includes('seller_sprite'));
}

{
  const input = sampleProductLineOpsInput();
  const profile = buildProductLineOpsProfile(input);

  assert.strictEqual(profile.capabilityId, 'product_line_ops::profile::read');
  assert.strictEqual(profile.readyForAutoAction, false);
  assert.strictEqual(profile.stage, 'product_line_profile');
  assert.strictEqual(profile.productIdentity.sku, 'AI5041');
  assert.strictEqual(profile.productIdentity.productType, 'kitchen mat set');
  assert.ok(profile.sourceBoundary.defaultSources.includes('selection'));
  assert.ok(profile.sourceBoundary.defaultSources.includes('sif'));
  assert.ok(profile.sourceBoundary.defaultSources.includes('sellerinventory'));
  assert.ok(profile.sourceBoundary.externalFallbacks.includes('seller_sprite'));
  assert.ok(!profile.missingEvidence.includes('seller_sprite'));
  assert.ok(profile.marketNodes.length > 0);
  assert.ok(profile.competitorPool.direct.length > 0);
  assert.ok(profile.keywordRoutes.some(route => route.term === 'mushroom kitchen mats'));
  assert.ok(profile.keywordRoutes.some(route => route.adRoute.includes('Exact test')));
  assert.strictEqual(profile.decisionGate.conclusion, 'Validate');
  assert.ok(profile.adActionBoundary.requiredStandard.includes('广告调整完整结构'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-line-profile-'));
  const outFile = path.join(tmpDir, 'profile.json');
  const result = runProductLineOpsProfile({
    sample: true,
    outFile,
    today: '2026-06-17',
  });

  assert.strictEqual(result.profile.capabilityId, 'product_line_ops::profile::read');
  assert.ok(fs.existsSync(outFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.sourceBoundary.defaultSources[0], 'selection');
}

{
  const result = runProductLineOpsProfile({ sku: 'NO-DATA' });
  assert.strictEqual(result.profile.sourceCoverage.sellerinventory, false);
  assert.strictEqual(result.profile.sourceCoverage.ad_backend, false);
  assert.ok(result.profile.missingEvidence.includes('sellerinventory_listing_inventory_profit'));
  assert.ok(result.profile.missingEvidence.includes('live_ad_backend_when_ad_action_is_needed'));
}

console.log('product_line_ops_profile tests passed');
