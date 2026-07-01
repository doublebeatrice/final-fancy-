const assert = require('assert');
const path = require('path');

const {
  buildQualityGateReport,
  parseArgs,
} = require('../scripts/diagnostics/agent_quality_gate');

const adTask = 'UY6438 \u80fd\u4e0d\u80fd\u63a8\u5e7f\u544a';
const gbrainRule = path.join(
  'D:\\ad-ops-brain',
  '04-\u6807\u51c6\u6253\u6cd5',
  'Claude-Codex\u4ea4\u53c9\u9a8c\u8bc1\u4e0eGBrain\u8c03\u7528.md',
);

const packageScripts = {
  'chrome:operator': 'powershell -File scripts/launch_ad_ops_collaboration_browser.ps1',
  'chrome:ready': 'powershell -File scripts/execute/open_debug_browser_fixed_profile.ps1',
  'ops:today': 'node scripts/run_today_ops.js',
  'ops:deposit:status': 'node scripts/execute/inspect_daily_deposit.js',
  'ops:selection:keyword-research': 'node scripts/execute/fetch_selection_keyword_research.js',
  'ops:selection:keyword-conversion': 'node scripts/execute/fetch_selection_keyword_conversion_rate.js',
  'ops:selection:aba-search-terms': 'node scripts/execute/fetch_selection_aba_search_terms.js',
  'ops:sif:reverse-keywords': 'node scripts/execute/fetch_sif_reverse_keywords.js',
  'ops:sif:keyword-history': 'node scripts/execute/fetch_sif_keyword_history.js',
  'ops:agent:orientation': 'node scripts/diagnostics/claude_orientation_check.js',
  'ops:agent:inbox': 'node scripts/run_external_task_inbox.js',
};

const existingPaths = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'docs/CLAUDE_DIRECTION_PACK.md',
  'docs/CLAUDE_CROSS_VALIDATION_GUIDE.md',
  'docs/PRODUCT_MARKET_EVIDENCE_STACK.md',
  gbrainRule,
]);

const staleDoctor = {
  status: 'unhealthy',
  checks: [
    { name: 'connection', status: 'ok', message: 'Connected, 255 pages' },
    { name: 'sync_freshness', status: 'fail', message: 'Source default last synced 3d ago' },
  ],
};

{
  const args = parseArgs(['--actor', 'claude', '--task', adTask, '--json']);

  assert.strictEqual(args.actor, 'claude');
  assert.strictEqual(args.task, adTask);
  assert.strictEqual(args.json, true);
}

{
  const report = buildQualityGateReport({
    actor: 'claude',
    task: adTask,
    packageScripts,
    existingPaths,
    gbrainDoctor: staleDoctor,
  });

  assert.strictEqual(report.actor, 'claude');
  assert.strictEqual(report.status, 'pass_with_warnings');
  assert.ok(report.totalScore >= 80);
  assert.deepStrictEqual(Object.keys(report.dimensions), [
    'taskRouting',
    'gbrainSearchQuality',
    'evidenceBoundaryQuality',
    'runtimeEfficiency',
    'operatingOutputQuality',
  ]);
  assert.ok(report.dimensions.runtimeEfficiency.score >= 16);
  assert.ok(report.routes.includes('advertising'));
  assert.ok(report.routes.includes('selection'));
  assert.ok(report.nextShortestPath.some(step => step.includes('rg -n')));
  assert.ok(report.nextShortestPath.some(step => step.includes('ops:selection:keyword-research')));
  assert.ok(report.qualityRequirements.some(item => item.includes('\u4ea7\u54c1/\u5e02\u573a')));
  assert.ok(report.warnings.some(item => item.includes('raw GBrain')));
}

{
  const report = buildQualityGateReport({
    actor: 'claude',
    task: '\u4eca\u5929\u80fd\u4e0d\u80fd\u7ee7\u7eed\u52a0\u5e7f\u544a',
    packageScripts,
    existingPaths,
    gbrainDoctor: staleDoctor,
  });

  assert.ok(report.totalScore < 90);
  assert.ok(report.weakPoints.some(item => item.includes('\u5bf9\u8c61\u8bcd')));
  assert.ok(report.qualityRequirements.some(item => item.includes('live read')));
}

console.log('agent_quality_gate tests passed');
