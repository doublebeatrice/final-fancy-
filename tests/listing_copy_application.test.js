const assert = require('assert');
const {
  buildEditApplyDeleteForm,
  buildEditApplyQueryForm,
  classifyEditApplyDeleteResponse,
  extractEditApplyRows,
  normalizeEditApplyQuery,
} = require('../src/listing_copy_application');
const {
  parseArgs,
  runWithdrawal,
} = require('../scripts/execute/run_listing_copy_application_withdrawals');

{
  const query = normalizeEditApplyQuery({
    sku: 'MF6294',
    seller: ['HJ17', 'HJ171', 'HJ172'],
    startTime: '2026-02-18 11:14:24',
  });
  assert.strictEqual(query.page, 1);
  assert.strictEqual(query.limit, 50);
  assert.strictEqual(query.queryType, 3);
  assert.strictEqual(query.seller, 'HJ17,HJ171,HJ172');
  assert.strictEqual(query.startTime, '2026-02-18 11:14:24');
}

{
  const form = buildEditApplyQueryForm({
    sku: 'MF6294',
    seller: 'HJ17,HJ171,HJ172',
    status: '',
    startTime: '2026-02-18 11:14:24',
    queryType: 3,
  });
  assert.strictEqual(form.get('page'), '1');
  assert.strictEqual(form.get('limit'), '50');
  assert.strictEqual(form.get('sku'), 'MF6294');
  assert.strictEqual(form.get('seller'), 'HJ17,HJ171,HJ172');
  assert.strictEqual(form.get('status'), '');
  assert.strictEqual(form.get('query_type'), '3');
  assert.strictEqual(form.get('start_time'), '2026-02-18 11:14:24');
  assert.strictEqual(form.get('end_time'), '');
}

{
  const form = buildEditApplyDeleteForm({ id: 4451131, csrf: 'csrf-token' });
  assert.strictEqual(form.get('_token'), 'csrf-token');
  assert.strictEqual(form.get('id'), '4451131');
}

{
  const rows = extractEditApplyRows({
    code: 0,
    data: {
      list: [
        { id: 4451131, sku: 'MF6294', reason: 'English reason' },
      ],
    },
  });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, '4451131');
  assert.strictEqual(rows[0].sku, 'MF6294');
}

{
  assert.deepStrictEqual(classifyEditApplyDeleteResponse({ code: 200, msg: 'ok' }), {
    success: true,
    apiStatus: 'deleted',
    message: 'ok',
  });
  assert.strictEqual(classifyEditApplyDeleteResponse({ code: 500, msg: 'failed' }).success, false);
}

(async () => {
  {
    const args = parseArgs(['node', 'script', '--id', '4451131', '--execute']);
    assert.strictEqual(args.id, '4451131');
    assert.strictEqual(args.execute, true);
    assert.strictEqual(args.seller, 'HJ17,HJ171,HJ172');
  }

  {
    const dry = await runWithdrawal({ id: '4451131', seller: 'HJ17,HJ171,HJ172' });
    assert.strictEqual(dry.dryRun, true);
    assert.strictEqual(dry.queryEndpoint.includes('/pm/edit_apply/query'), true);
    assert.strictEqual(dry.deleteEndpoint.includes('/pm/edit_apply/delete'), true);
    assert.strictEqual(dry.deletePreview, '_token=%5Bdynamic-csrf%5D&id=4451131');
  }

  {
    await assert.rejects(
      () => runWithdrawal({ sku: 'MF6294', execute: true }),
      /requires --id/
    );
  }

  console.log('listing copy application tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
