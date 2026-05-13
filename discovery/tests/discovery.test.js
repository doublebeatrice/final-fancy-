const assert = require('assert');
const {
  DISCOVERY_ROOT,
  sanitizeObject,
  isDangerousText,
  isSafeReadActionText,
    normalizeRouteEntry,
    makeOutputName,
    summarizeResponseSample,
} = require('../lib/common');
const { inferFields, buildOperatorQuestions } = require('../lib/field_inference');
const { rankSources } = require('../lib/source_ranking');
const { extractEndpointCandidates, summarizeEndpointCandidates } = require('../lib/probe_analysis');

assert.ok(DISCOVERY_ROOT.endsWith('discovery'));

{
  const input = {
    url: 'https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=secret-token&foo=1',
    headers: {
      cookie: 'SESSION=abc; XSRF-TOKEN=secret',
      Authorization: 'Bearer secret',
      'x-csrf-token': 'secret',
      'jwt-token': 'secret',
    },
    nested: {
      href: 'https://example.test/path?csrf_token=secret&ok=yes',
      value: 'plain text',
    },
  };
  const cleaned = sanitizeObject(input);
  const serialized = JSON.stringify(cleaned);
  assert.ok(!serialized.includes('secret-token'));
  assert.ok(!serialized.includes('Bearer secret'));
  assert.ok(!serialized.includes('SESSION=abc'));
  assert.ok(serialized.includes('<redacted>'));
  assert.strictEqual(cleaned.nested.value, 'plain text');
}

{
  assert.strictEqual(isDangerousText('保存'), true);
  assert.strictEqual(isDangerousText('批量创建'), true);
  assert.strictEqual(isDangerousText('审核通过'), true);
  assert.strictEqual(isDangerousText('查询'), false);
  assert.strictEqual(isSafeReadActionText('查询'), true);
  assert.strictEqual(isSafeReadActionText('搜索'), true);
  assert.strictEqual(isSafeReadActionText('刷新'), true);
  assert.strictEqual(isSafeReadActionText('保存并查询'), false);
}

{
  const summary = summarizeResponseSample({
    code: 0,
    data: {
      list: [
        { sku: 'A', sales: 10 },
        { sku: 'B', sales: 20 },
      ],
    },
  });
  assert.strictEqual(summary.rowCount, 2);
  assert.deepStrictEqual(summary.sampleFields, ['sku', 'sales']);
  const msgSummary = summarizeResponseSample({
    code: 200,
    msg: [
      { rank: 98, sales: 60 },
      { rank: 1693, sales: 6903 },
    ],
  });
  assert.strictEqual(msgSummary.rowCount, 2);
  assert.deepStrictEqual(msgSummary.sampleFields, ['rank', 'sales']);
}

{
  const route = normalizeRouteEntry({
    text: '商品搜索表现',
    attrs: {
      'data-routeid': 'searchPerformance.productIndex',
      'lay-href': 'https://sellerinventory.yswg.com.cn/searchPerformance/productIndex?jwt-token=secret',
    },
    source: 'sellerinventory',
  });
  assert.strictEqual(route.routeId, 'searchPerformance.productIndex');
  assert.strictEqual(route.visibleText, '商品搜索表现');
  assert.strictEqual(route.domain, 'sellerinventory.yswg.com.cn');
  assert.ok(!route.url.includes('secret'));
  assert.strictEqual(makeOutputName('report_probe', 'searchPerformance.productIndex', '2026-05-13'), 'report_probe_searchPerformance_productIndex_2026-05-13.json');
}

{
  const report = inferFields({
    sourceId: 'adv.keyword.sample',
    pageColumns: [
      { label: '花费', field: 'Spend' },
      { label: '销售额', field: 'Sales' },
      { label: 'ACOS', field: 'ACOS' },
      { label: 'CPC', field: 'CPC' },
      { label: '点击', field: 'Clicks' },
      { label: '更新时间', field: 'updatedAt' },
    ],
    sampleRows: [
      { Spend: '10', Sales: '50', ACOS: 0.2, CPC: 2, Clicks: 5, mysteryFlag: 'Y', updatedAt: '2026-05-13 12:00:00' },
      { Spend: '20', Sales: '100', ACOS: 0.2, CPC: 2, Clicks: 10, mysteryFlag: 'N', updatedAt: '2026-05-13 13:00:00' },
    ],
  });
  const byField = Object.fromEntries(report.fields.map(field => [field.field, field]));
  assert.strictEqual(byField.ACOS.confidence, 'A_confirmed');
  assert.strictEqual(byField.ACOS.semanticType, 'advertising_efficiency');
  assert.ok(byField.ACOS.evidence.some(item => item.includes('Spend / Sales')));
  assert.strictEqual(byField.CPC.confidence, 'A_confirmed');
  assert.strictEqual(byField.updatedAt.semanticType, 'date_time');
  assert.strictEqual(byField.mysteryFlag.confidence, 'C_unknown');
}

{
  const ranked = rankSources([
    {
      sourceId: 'listing_failures',
      routeName: 'Listing修改失败原因',
      fieldSummary: { confirmed: 8, probable: 2, unknown: 1 },
      networkSummary: { requestCount: 2, sampleRowCount: 40 },
      riskLevel: 'read_only',
    },
    {
      sourceId: 'password',
      routeName: '修改密码',
      fieldSummary: { confirmed: 1, probable: 0, unknown: 0 },
      networkSummary: { requestCount: 1, sampleRowCount: 1 },
      riskLevel: 'write_or_sensitive_candidate',
    },
  ]);
  assert.strictEqual(ranked[0].sourceId, 'listing_failures');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[1].reasons.includes('risk_penalty'));
}

{
  const questions = buildOperatorQuestions({
    sourceId: 'product_success',
    fields: [
      { field: 'success_rate', confidence: 'B_probable', businessValue: 'high', guessedMeaning: 'Product success rate' },
      { field: 'debug_code', confidence: 'C_unknown', businessValue: 'low', guessedMeaning: 'Internal code' },
    ],
  });
  assert.strictEqual(questions.length, 1);
  assert.ok(questions[0].includes('success_rate'));
}

{
  const endpoints = extractEndpointCandidates(`
    fetch('/pm/sale/getBySeller', { method: 'POST' });
    $.post("/searchPerformance/product/list", {});
    const ignored = "https://cdn.example.com/app.js";
    axios.get('/api/user/token/check');
    layui.table.render({ url: '/product_problem/list' });
  `);
  assert.ok(endpoints.some(item => item.path === '/pm/sale/getBySeller' && item.method === 'POST'));
  assert.ok(endpoints.some(item => item.path === '/searchPerformance/product/list'));
  assert.ok(endpoints.some(item => item.path === '/product_problem/list'));
  assert.ok(endpoints.some(item => item.path === '/pm/sale/getBySeller' && item.risk === 'safe_read_candidate'));
  assert.ok(!endpoints.some(item => item.path.includes('token')));
  const summary = summarizeEndpointCandidates([
    { path: '/marketing/getAllClearanceStock', method: 'POST' },
    { path: '/marketing/deleteClearancesData', method: 'DELETE' },
    { path: '/api/note/detail', method: 'UNKNOWN' },
    { path: '/misc/tool', method: 'UNKNOWN' },
  ]);
  assert.strictEqual(summary.safeRead, 1);
  assert.strictEqual(summary.writeOrSensitive, 1);
  assert.strictEqual(summary.commonNoise, 1);
  assert.strictEqual(summary.unknown, 1);
}

console.log('discovery tests passed');
