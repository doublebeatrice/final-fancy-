const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const keywordAdapter = require('../src/capabilities/adapters/adv_keyword_update_bid');
const budgetAdapter = require('../src/capabilities/adapters/adv_campaign_update_budget');
const verifyAdapter = require('../src/capabilities/adapters/review_landing_verify');
const {
  adapterCapabilityIds,
  getCapabilityAdapter,
} = require('../src/capabilities/orchestrator/capability_router');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-adapters-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({ productCards: [] }), 'utf8');

  {
    const calls = [];
    const logCalls = [];
    const result = await keywordAdapter.dryRun({
      sku: 'SKU1',
      asin: 'B000000001',
      id: 'kw-1',
      currentBid: 0.3,
      suggestedBid: 0.25,
      reason: 'test keyword trim',
    }, {
      snapshotFile,
      outDir: tmpDir,
      legacyRun: async options => {
        calls.push(options);
        const schema = JSON.parse(fs.readFileSync(options.actionSchemaFile, 'utf8'));
        assert.strictEqual(schema[0].sku, 'SKU1');
        assert.strictEqual(schema[0].actions[0].entityType, 'keyword');
        assert.strictEqual(schema[0].actions[0].actionType, 'bid');
        assert.strictEqual(schema[0].actions[0].suggestedBid, 0.25);
        return {
          mode: 'dry-run',
          dryReport: {
            time: { businessDate: '2026-05-22', sourceRunId: 'adapter-test' },
            plannedSkus: 1,
            plannedActions: 1,
            aiValidationErrors: [],
          },
          files: {},
        };
      },
      persistAdjustmentLog: result => {
        logCalls.push(result);
        return { count: 1, file: path.join(tmpDir, 'adjustments.json') };
      },
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.mode, 'dry-run');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].dryRun, true);
    assert.strictEqual(logCalls.length, 1);
    assert.strictEqual(result.adjustmentLog.count, 1);
  }

  {
    const calls = [];
    const result = await budgetAdapter.execute({
      sku: 'SKU2',
      id: 'camp-1',
      currentBudget: 8,
      suggestedBudget: 10,
      reason: 'test budget recover',
    }, {
      snapshotFile,
      outDir: tmpDir,
      legacyRun: async options => {
        calls.push(options);
        const schema = JSON.parse(fs.readFileSync(options.actionSchemaFile, 'utf8'));
        assert.strictEqual(schema[0].actions[0].entityType, 'campaign');
        assert.strictEqual(schema[0].actions[0].actionType, 'budget');
        assert.strictEqual(schema[0].actions[0].suggestedBudget, 10);
        return {
          mode: 'execute',
          report: {
            time: { businessDate: '2026-05-22', sourceRunId: 'adapter-test' },
            plannedSkus: 1,
            plannedActions: 1,
            finalCounts: { success: 1 },
            aiValidationErrors: [],
          },
          files: {},
        };
      },
      persistAdjustmentLog: () => ({ count: 1, file: path.join(tmpDir, 'adjustments.json') }),
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.mode, 'execute');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].dryRun, false);
  }

  {
    const verifyFile = path.join(tmpDir, 'execution_verify.json');
    fs.writeFileSync(verifyFile, JSON.stringify({
      finalCounts: { success: 1, failed: 1 },
      events: [{ id: 'kw-1', finalStatus: 'success' }, { id: 'kw-2', finalStatus: 'failed' }],
      noteResults: [],
    }, null, 2), 'utf8');
    const result = verifyAdapter.verify({ verifyFile });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.finalCounts, { success: 1, failed: 1 });
    assert.strictEqual(result.events.length, 2);
  }

  {
    const result = await keywordAdapter.dryRun({ sku: 'BAD' }, { snapshotFile, outDir: tmpDir });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'INPUT_VALIDATION_FAILED');
    assert.ok(result.error.details.missing.includes('id'));
  }

  assert.ok(adapterCapabilityIds().includes('adv.keyword.update_bid'));
  assert.strictEqual(getCapabilityAdapter('adv.campaign.update_budget').capabilityId, 'adv.campaign.update_budget');
  assert.strictEqual(getCapabilityAdapter('inventory.note.append'), null);

  console.log('capability_adapters.test.js passed');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
