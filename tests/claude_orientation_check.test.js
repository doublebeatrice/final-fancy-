const assert = require('assert');
const path = require('path');

const {
  buildOrientationReport,
  parseArgs,
} = require('../scripts/diagnostics/claude_orientation_check');

const task = 'UY6438 \u80fd\u4e0d\u80fd\u63a8\u5e7f\u544a';
const adAdjust = '\u5e7f\u544a\u8c03\u6574';
const unlanded = '\u672a\u843d\u5730';
const gbrainRule = path.join(
  'D:\\ad-ops-brain',
  '04-\u6807\u51c6\u6253\u6cd5',
  'Claude-Codex\u4ea4\u53c9\u9a8c\u8bc1\u4e0eGBrain\u8c03\u7528.md',
);

{
  const args = parseArgs(['--actor', 'claude', '--task', task]);

  assert.strictEqual(args.actor, 'claude');
  assert.strictEqual(args.task, task);
}

{
  const report = buildOrientationReport({
    actor: 'claude',
    task,
    packageScripts: {
      'ops:today': 'node scripts/run_today_ops.js',
      'ops:deposit:status': 'node scripts/execute/inspect_daily_deposit.js',
      'ops:selection:keyword-research': 'node scripts/execute/fetch_selection_keyword_research.js',
      'ops:sif:reverse-keywords': 'node scripts/execute/fetch_sif_reverse_keywords.js',
    },
    existingPaths: new Set([
      'CLAUDE.md',
      'AGENTS.md',
      'README.md',
      'docs/CLAUDE_DIRECTION_PACK.md',
      'docs/CLAUDE_CROSS_VALIDATION_GUIDE.md',
      'docs/PRODUCT_MARKET_EVIDENCE_STACK.md',
      gbrainRule,
    ]),
    gbrainDoctor: {
      status: 'unhealthy',
      checks: [
        { name: 'connection', status: 'ok', message: 'Connected, 255 pages' },
        { name: 'sync_freshness', status: 'fail', message: 'Source default last synced 3d ago' },
      ],
    },
  });

  assert.strictEqual(report.actor, 'claude');
  assert.strictEqual(report.updateModel.dynamicInputs.includes('package.json scripts'), true);
  assert.strictEqual(report.gbrain.indexedSearchUsable, true);
  assert.strictEqual(report.gbrain.rawSearchRequired, true);
  assert.ok(report.gbrain.searchAngles.objectTerms.includes('UY6438'));
  assert.ok(report.gbrain.searchAngles.workflowTerms.includes(adAdjust));
  assert.ok(report.gbrain.searchAngles.failureModeTerms.includes(unlanded));
  assert.ok(report.gbrain.searchAngles.systemRouteTerms.includes('adv'));
  assert.ok(report.requiredReads.every(item => item.exists));
  assert.ok(report.recommendedCommands.some(command => command.includes('ops:selection:keyword-research')));
}

console.log('claude_orientation_check tests passed');
