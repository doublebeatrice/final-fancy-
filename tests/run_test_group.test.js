const assert = require('assert');

const {
  classifyTestFile,
  summarizeGroups,
  selectTests,
} = require('../scripts/maintenance/run_test_group');

{
  assert.strictEqual(classifyTestFile('tests/agent_goal_audit.test.js'), 'agent');
  assert.strictEqual(classifyTestFile('tests/wecom_gateway.test.js'), 'messaging');
  assert.strictEqual(classifyTestFile('tests/weixin_clawbot_http.test.js'), 'messaging');
  assert.strictEqual(classifyTestFile('tests/selection_keyword_research.test.js'), 'ops');
  assert.strictEqual(classifyTestFile('tests/perf_hygiene.test.js'), 'maintenance');
}

{
  const tests = [
    'tests/agent_goal_audit.test.js',
    'tests/wecom_gateway.test.js',
    'tests/selection_keyword_research.test.js',
    'tests/perf_hygiene.test.js',
  ];

  assert.deepStrictEqual(selectTests(tests, 'agent'), ['tests/agent_goal_audit.test.js']);
  assert.deepStrictEqual(selectTests(tests, 'messaging'), ['tests/wecom_gateway.test.js']);
  assert.deepStrictEqual(selectTests(tests, 'all'), tests);
}

{
  const tests = [
    'tests/agent_goal_audit.test.js',
    'tests/wecom_gateway.test.js',
    'tests/selection_keyword_research.test.js',
    'tests/perf_hygiene.test.js',
    'tests/activity_apply_prefill.test.js',
  ];
  const summary = summarizeGroups(tests);

  assert.deepStrictEqual(summary.map(item => [item.group, item.count]), [
    ['all', 5],
    ['agent', 1],
    ['core', 1],
    ['maintenance', 1],
    ['messaging', 1],
    ['ops', 1],
  ]);
}

console.log('run_test_group tests passed');
