const assert = require('assert');

const {
  listPackageScripts,
  listScriptFiles,
} = require('../scripts/maintenance/package_scripts_catalog');

{
  const scripts = {
    'ops:today': 'node scripts/run_today_ops.js',
    'ops:deposit:status': 'node scripts/execute/inspect_daily_deposit.js',
    'perf:report': 'node scripts/maintenance/perf_hygiene.js report',
  };
  const result = listPackageScripts({ scripts, prefix: 'ops:deposit' });

  assert.deepStrictEqual(result.map(item => item.name), ['ops:deposit:status']);
  assert.strictEqual(result[0].command, 'node scripts/execute/inspect_daily_deposit.js');
}

{
  const scripts = {
    'ops:today': 'node scripts/run_today_ops.js',
    'ops:deposit:status': 'node scripts/execute/inspect_daily_deposit.js',
    'perf:report': 'node scripts/maintenance/perf_hygiene.js report',
  };
  const result = listPackageScripts({ scripts, query: 'inspect' });

  assert.deepStrictEqual(result.map(item => item.name), ['ops:deposit:status']);
}

{
  const result = listScriptFiles({
    files: [
      'scripts/generators/generate_product_vision_queue.js',
      'scripts/execute/normalize_daily_report_names.js',
      'src/not_a_script.js',
    ],
    query: 'vision',
  });

  assert.deepStrictEqual(result, [{
    name: 'scripts/generators/generate_product_vision_queue.js',
    command: 'node scripts/generators/generate_product_vision_queue.js',
  }]);
}

console.log('package_scripts_catalog tests passed');
