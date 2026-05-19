const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCapabilityRegistry,
  capabilityToTasks,
  defaultAgentCapabilities,
  normalizeCapability,
} = require('../src/agent_capability_registry');
const { runAgentCapabilityRegistry } = require('../scripts/run_agent_capability_registry');

const timeContext = {
  runAt: '2026-05-19T10:00:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'capability-registry-test',
};

{
  const defaults = defaultAgentCapabilities();
  const ids = defaults.map(item => normalizeCapability(item, timeContext).capabilityId);
  assert.ok(ids.includes('adv::ad_backend::ad-sku-summary::read'));
  assert.ok(ids.includes('selection::market_evidence::keyword-conversion::read'));
  assert.ok(ids.includes('selection::market_evidence::aba-search-terms::read'));
  assert.ok(ids.includes('sellerinventory::listing::listing-edit-submit::write'));
  assert.ok(ids.includes('agent::effect_review::review-evidence-collector::read'));
}

{
  const registry = buildCapabilityRegistry({
    includeDefaults: true,
    capabilities: [{
      name: 'custom read endpoint',
      sourceSystem: 'custom',
      surface: 'diagnostics',
      operationType: 'read',
      endpoint: { method: 'GET', path: '/custom/read' },
      contract: { params: ['id'], responseFields: ['ok'] },
      verification: { probeCommand: 'node scripts/custom_probe.js' },
    }],
    timeContext,
  });

  assert.ok(registry.summary.total > 5);
  assert.strictEqual(registry.summary.bySourceSystem.custom, 1);
  assert.ok(registry.summary.bySourceSystem.selection >= 2);
  assert.ok(registry.capabilities.some(item => item.capabilityId === 'agent::effect_review::review-evidence-collector::read'));
}

{
  const capability = normalizeCapability({
    name: 'selection keyword conversion',
    sourceSystem: 'selection',
    surface: 'market_evidence',
    operationType: 'read',
    endpoint: {
      method: 'POST',
      path: '/api/keyword/conversion',
    },
    auth: {
      source: 'active_browser_session',
    },
    contract: {
      params: ['keywords'],
      responseFields: ['searchVolume', 'purchaseVolume', 'clickPurchaseRate', 'cpc'],
      freshness: 'same_day',
    },
    verification: {
      probeCommand: 'npm run ops:selection:keyword-conversion -- --keywords "<term>"',
    },
  }, timeContext);

  assert.strictEqual(capability.capabilityId, 'selection::market_evidence::keyword-conversion::read');
  assert.strictEqual(capability.executionMode, 'auto_read');
  assert.strictEqual(capability.riskLevel, 'low');
  assert.strictEqual(capability.status, 'ready');
  assert.strictEqual(capability.auth.persistSensitiveHeaders, false);
  assert.deepStrictEqual(capability.missingRequirements, []);
  assert.deepStrictEqual(capabilityToTasks(capability, timeContext), []);
}

{
  const capability = normalizeCapability({
    name: 'sellerinventory listing edit submit',
    sourceSystem: 'sellerinventory',
    surface: 'listing',
    operationType: 'write',
    endpoint: {
      method: 'POST',
      path: '/kernel/productEditApply/store',
    },
    auth: {
      source: 'active_browser_session',
      persistSensitiveHeaders: true,
    },
    contract: {
      params: ['sku', 'title', 'bullet', 'searchTerms'],
      responseFields: ['code', 'message', 'applicationId'],
    },
    verification: {
      dryRunCommand: 'node scripts/execute/run_listing_copy_edits.js --dry-run',
      postWriteCheck: 'GET /kernel/productEditApply/getOriginData?sku=<SKU>&type=en',
    },
    boundary: {
      reversible: true,
      highImpact: true,
    },
  }, timeContext);

  assert.strictEqual(capability.executionMode, 'boundary_required');
  assert.strictEqual(capability.riskLevel, 'high');
  assert.strictEqual(capability.status, 'needs_boundary');
  assert.strictEqual(capability.auth.persistSensitiveHeaders, false);
  assert.ok(capability.warnings.includes('sensitive_headers_must_not_be_persisted'));
  assert.ok(capability.requirements.includes('explicit_authorization_boundary'));
  assert.deepStrictEqual(capabilityToTasks(capability, timeContext).map(task => task.kind), ['capability_boundary']);
}

{
  const capability = normalizeCapability({
    name: 'new unknown write endpoint',
    sourceSystem: 'adv',
    operationType: 'write',
    endpoint: {
      method: 'PATCH',
      path: '/new/write',
    },
    contract: {
      params: ['id'],
      responseFields: [],
    },
    verification: {},
  }, timeContext);

  assert.strictEqual(capability.executionMode, 'blocked');
  assert.strictEqual(capability.status, 'blocked');
  assert.ok(capability.missingRequirements.includes('response_fields'));
  assert.ok(capability.missingRequirements.includes('dry_run_or_probe_command'));
  assert.ok(capability.missingRequirements.includes('post_write_verification'));
  const tasks = capabilityToTasks(capability, timeContext);
  assert.ok(tasks.some(task => task.kind === 'capability_probe'));
  assert.ok(tasks.some(task => task.kind === 'capability_verification'));
}

{
  const registry = buildCapabilityRegistry({
    capabilities: [
      {
        name: 'ad sku summary',
        sourceSystem: 'adv',
        surface: 'ad_backend',
        operationType: 'read',
        endpoint: { method: 'GET', path: '/product/adSkuSummary' },
        contract: { params: ['sku', 'days'], responseFields: ['spend', 'orders', 'acos'] },
        verification: { probeCommand: 'node scripts/execute/fetch_ad_sku_summary.js 4 7 <SKU>' },
      },
      {
        name: 'campaign budget patch',
        sourceSystem: 'adv',
        surface: 'ad_backend',
        operationType: 'write',
        endpoint: { method: 'PATCH', path: '/campaign/batchCampaign' },
        contract: { params: ['campaignId', 'dailyBudget'], responseFields: ['code', 'success'] },
        verification: {
          dryRunCommand: 'node scripts/execute/run_actions.js <schema> --dry-run',
          postWriteCheck: 'fetch campaign row and compare dailyBudget',
        },
        boundary: { lowRisk: true, reversible: true },
      },
    ],
    timeContext,
  });

  assert.strictEqual(registry.summary.total, 2);
  assert.strictEqual(registry.summary.bySourceSystem.adv, 2);
  assert.strictEqual(registry.summary.byExecutionMode.auto_read, 1);
  assert.strictEqual(registry.summary.byExecutionMode.auto_execute_with_schema, 1);
  assert.strictEqual(registry.summary.taskCount, 0);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-capabilities-'));
  const inputFile = path.join(tmpDir, 'capabilities.json');
  const outFile = path.join(tmpDir, 'registry.json');
  fs.writeFileSync(inputFile, JSON.stringify([
    {
      name: 'selection ABA search terms',
      sourceSystem: 'selection',
      surface: 'market_evidence',
      operationType: 'read',
      endpoint: { method: 'POST', path: '/api/aba/searchTerms' },
      contract: { params: ['searchTerms'], responseFields: ['abaRank', 'searchVolume'] },
      verification: { probeCommand: 'npm run ops:selection:aba-search-terms -- --search-terms "<term>"' },
    },
  ], null, 2), 'utf8');

  const registry = runAgentCapabilityRegistry({ inputFile, outFile, timeContext, includeDefaults: false });
  assert.strictEqual(registry.summary.total, 1);
  assert.strictEqual(registry.capabilities[0].status, 'ready');
  assert.ok(fs.existsSync(outFile));
}

console.log('agent_capability_registry tests passed');
