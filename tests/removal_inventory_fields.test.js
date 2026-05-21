const assert = require('assert');
const {
  normalizeLabel,
  parseRemovalInventoryAddViewInspection,
  parseRemovalInventoryPageInspection,
} = require('../src/removal_inventory_fields');

assert.strictEqual(normalizeLabel(' SKU: '), 'SKU');
assert.strictEqual(normalizeLabel('\u9500\u552e\u8d26\u53f7\uff1a'), '\u9500\u552e\u8d26\u53f7');
assert.strictEqual(normalizeLabel('\n\t'), '');

{
  const parsed = parseRemovalInventoryPageInspection({
    capturedAt: '2026-05-20T09:30:00.000Z',
    page: {
      url: 'https://sellerinventory.yswg.com.cn/internalControl/inventory/index',
      title: '\u79fb\u9664\u5e93\u5b58',
    },
    frames: [
      {
        url: 'https://sellerinventory.yswg.com.cn/internalControl/inventory/index',
        title: '\u79fb\u9664\u5e93\u5b58',
        controls: [
          {
            label: '\u9500\u552e\u8d26\u53f7\uff1a',
            name: 'seller',
            type: 'select-one',
            value: 'HJ17',
            options: ['HJ17', 'HJ171'],
          },
          {
            label: 'SKU',
            name: 'sku',
            type: 'text',
            value: 'ABC123',
            placeholder: '',
          },
          {
            label: '',
            name: 'asin',
            type: 'text',
            value: '',
            placeholder: '\u8bf7\u8f93\u5165ASIN',
          },
        ],
        buttons: ['\u641c\u7d22', '\u91cd\u7f6e'],
        table: {
          headers: ['SKU', 'ASIN', '\u53ef\u79fb\u9664\u6570\u91cf', '\u8fd0\u8425\u4eba'],
          rows: [['ABC123', 'B012345678', '12', 'HJ17']],
        },
        summaryTexts: ['\u5408\u8ba1 12'],
        endpointHints: [
          '/internalControl/inventory/index',
          '/internalControl/inventory/query',
          '/internalControl/inventory/query',
        ],
      },
    ],
  });

  assert.strictEqual(parsed.readOnly, true);
  assert.strictEqual(parsed.page.route, '/internalControl/inventory/index');
  assert.deepStrictEqual(parsed.filters.map(item => item.label), [
    '\u9500\u552e\u8d26\u53f7',
    'SKU',
    '\u8bf7\u8f93\u5165ASIN',
  ]);
  assert.strictEqual(parsed.filters[0].options.length, 2);
  assert.deepStrictEqual(parsed.actions, ['\u641c\u7d22', '\u91cd\u7f6e']);
  assert.deepStrictEqual(parsed.table.columns, ['SKU', 'ASIN', '\u53ef\u79fb\u9664\u6570\u91cf', '\u8fd0\u8425\u4eba']);
  assert.strictEqual(parsed.table.visibleRowCount, 1);
  assert.deepStrictEqual(parsed.table.previewRows[0], {
    SKU: 'ABC123',
    ASIN: 'B012345678',
    '\u53ef\u79fb\u9664\u6570\u91cf': '12',
    '\u8fd0\u8425\u4eba': 'HJ17',
  });
  assert.deepStrictEqual(parsed.summaryFields, ['\u5408\u8ba1 12']);
  assert.deepStrictEqual(parsed.endpointHints, [
    '/internalControl/inventory/index',
    '/internalControl/inventory/query',
  ]);
  assert.ok(parsed.boundary.includes('read_only'));
  assert.ok(parsed.boundary.includes('no_submit_no_delete_no_removal_application'));
}

{
  const parsed = parseRemovalInventoryPageInspection({
    page: { url: 'https://sellerinventory.yswg.com.cn/internalControl/inventory/index' },
    frames: [{
      controls: [
        { label: 'SKU', name: 'sku', type: 'text' },
        { label: 'SKU', name: 'sku', type: 'text' },
      ],
      buttons: [],
      table: { headers: [], rows: [] },
    }],
  });

  assert.strictEqual(parsed.filters.length, 1);
  assert.strictEqual(parsed.filters[0].name, 'sku');
  assert.deepStrictEqual(parsed.table.columns, []);
  assert.strictEqual(parsed.table.visibleRowCount, 0);
  assert.ok(parsed.warnings.includes('no_table_columns_detected'));
}

{
  const parsed = parseRemovalInventoryAddViewInspection({
    capturedAt: '2026-05-20T10:40:00.000Z',
    url: 'https://sellerinventory.yswg.com.cn/internalControl/internal_control_inventory_add_view',
    title: '\u4e9a\u58f0\u5a01\u683c\u4e9a\u9a6c\u900a\u7ba1\u7406\u7cfb\u7edf',
    sku: 'KZ6722',
    aid: '3105578',
    sections: ['\u79fb\u9664\u64cd\u4f5c\u5206\u533a', '\u6e05\u4ed3\u56de\u6b3e\u5c55\u793a\u5206\u533a'],
    formItems: [
      {
        label: '\u662f\u5426\u7d27\u6025 (\u5fc5\u586b)',
        inputs: [
          { name: 'is_urgent', type: 'radio', value: '\u662f' },
          { name: 'is_urgent', type: 'radio', value: '\u5426' },
        ],
      },
      {
        label: '\u79fb\u9664\u540e\u64cd\u4f5c(\u5fc5\u586b)',
        inputs: [
          {
            name: 'operate_type',
            type: 'select-one',
            options: ['\u8bf7\u9009\u62e9', 'FBA\u5e93\u5b58\u79fb\u9664\u9500\u6bc1', '\u79fb\u9664\u5230\u6d77\u5916\u4ed3'],
          },
        ],
      },
      {
        label: '\u5f53\u524d\u552e\u4ef7\u56de\u6b3eUSD',
        inputs: [
          { name: 'profit', type: 'text', value: '3.33', readonly: true },
        ],
      },
    ],
    buttons: [{ text: '\u63d0\u4ea4' }, { text: '\u53d6\u6d88' }],
    endpoints: [
      '/internalControl/inventory/checkRemoveInventory',
      '/pm/formal/getFee',
      '/internalControl/inventory/add',
    ],
  });

  assert.strictEqual(parsed.readOnly, true);
  assert.strictEqual(parsed.page.route, '/internalControl/internal_control_inventory_add_view');
  assert.strictEqual(parsed.sku, 'KZ6722');
  assert.strictEqual(parsed.aid, '3105578');
  assert.ok(parsed.sections.includes('\u79fb\u9664\u64cd\u4f5c\u5206\u533a'));
  assert.ok(parsed.writableFields.some(item => item.name === 'operate_type'));
  assert.deepStrictEqual(parsed.readOnlyValues, [{
    label: '\u5f53\u524d\u552e\u4ef7\u56de\u6b3eUSD',
    name: 'profit',
    value: '3.33',
  }]);
  assert.ok(parsed.actions.includes('\u63d0\u4ea4'));
  assert.ok(parsed.endpointHints.includes('/internalControl/inventory/checkRemoveInventory'));
  assert.ok(parsed.warnings.includes('write_endpoint_detected_but_not_called'));
  assert.ok(parsed.boundary.includes('no_submit_no_add_no_delete_no_removal_application'));
}

console.log('removal_inventory_fields tests passed');
