const assert = require('assert');
const {
  chooseBestRecoveryResult,
  parseEvalResult,
} = require('../scripts/execute/recover_inventory_raw_from_list');

{
  assert.deepStrictEqual(parseEvalResult({ ok: true, rows: [{ sku: 'A' }] }), { ok: true, rows: [{ sku: 'A' }] });
  assert.deepStrictEqual(parseEvalResult('{"ok":true,"rowCount":2}'), { ok: true, rowCount: 2 });
}

{
  const listResult = {
    ok: true,
    source: 'filtered_list_request',
    rowCount: 1,
    total: 1,
    rows: [{ sku: 'ONE' }],
  };
  const panelResult = {
    ok: true,
    source: 'panel_fetchAllInventoryDirect',
    rowCount: 100,
    total: 100,
    rows: Array.from({ length: 100 }, (_, index) => ({ sku: `SKU${index}` })),
  };

  const best = chooseBestRecoveryResult(listResult, panelResult);
  assert.strictEqual(best.source, 'panel_fetchAllInventoryDirect');
  assert.strictEqual(best.rowCount, 100);
}

{
  const listResult = {
    ok: true,
    source: 'filtered_list_request',
    rowCount: 20,
    total: 20,
    rows: Array.from({ length: 20 }, (_, index) => ({ sku: `SKU${index}` })),
  };
  const panelResult = {
    ok: false,
    source: 'panel_fetchAllInventoryDirect',
    rowCount: 0,
    rows: [],
  };

  const best = chooseBestRecoveryResult(listResult, panelResult);
  assert.strictEqual(best.source, 'filtered_list_request');
  assert.strictEqual(best.rowCount, 20);
}

console.log('recover_inventory_raw_from_list tests passed');
