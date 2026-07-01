const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  aggregateRecords,
  buildWorkflowRuntimeReport,
  classifyCommand,
} = require('../scripts/analytics/analyze_workflow_runtime');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const command = classifyCommand('npm run ops:selection:keyword-research -- --terms abc');
  assert.strictEqual(command.script, 'ops:selection:keyword-research');
  assert.strictEqual(command.workflow, 'selection.evidence.keyword-research');
}

{
  const rows = aggregateRecords([
    { workflow: 'daily_ops.step.snapshot', durationMs: 1000, ok: true, source: 'a' },
    { workflow: 'daily_ops.step.snapshot', durationMs: 3000, ok: true, source: 'b' },
    { workflow: 'low_efficiency.quick_path.total', durationMs: 500, ok: true, source: 'c' },
  ]);
  const snapshot = rows.find(item => item.workflow === 'daily_ops.step.snapshot');
  assert.strictEqual(snapshot.sampleCount, 2);
  assert.strictEqual(snapshot.averageMs, 2000);
  assert.strictEqual(snapshot.maxMs, 3000);
  assert.strictEqual(snapshot.successCount, 2);
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-runtime-report-'));
  writeJson(path.join(root, 'data', 'snapshots', 'runs', 'today_ops_2026-06-08T01-00-00-000Z', 'manifest.json'), {
    runId: 'today_ops_2026-06-08T01-00-00-000Z',
    status: 'success',
    startedAt: '2026-06-08T01:00:00.000Z',
    finishedAt: '2026-06-08T01:00:12.000Z',
    businessDate: '2026-06-08',
    steps: [
      { name: 'snapshot', status: 'success', durationMs: 10000 },
      { name: 'report', status: 'success', durationMs: 2000 },
    ],
    panelFetchMetrics: {
      stages: [
        { stage: 'low_efficiency_pools', durationMs: 4000, success: 10, failed: 0 },
      ],
    },
  });
  writeJson(path.join(root, 'data', 'agent', 'command_results_2026-06-08.json'), {
    summary: { measuredCommandCount: 1, totalCommandDurationMs: 1500 },
    results: [
      {
        command: 'npm run ops:agent:review-effect -- --today 2026-06-08',
        ok: true,
        durationMs: 1500,
        startedAt: '2026-06-08T01:10:00.000Z',
        finishedAt: '2026-06-08T01:10:01.500Z',
      },
      {
        command: 'npm run ops:agent:readiness-audit -- --today 2026-06-08',
        ok: true,
        startedAt: '2026-06-08T01:10:02.000Z',
        finishedAt: '2026-06-08T01:10:05.250Z',
      },
      {
        command: 'npm run ops:selection:keyword-conversion -- --keywords abc',
        ok: false,
      },
    ],
  });
  writeJson(path.join(root, 'data', 'tasks', 'low_efficiency_perf_2026-06-08.json'), {
    generatedAt: '2026-06-08T01:11:00.000Z',
    source: 'adv_backend_tab',
    dryRun: true,
    summary: { totalRuntimeMs: 9000, totalRows: 100, actionable: 5 },
    timings: [
      { label: 'fetch_low_efficiency_pools', durationMs: 8500 },
      { label: 'scan_low_efficiency_decisions', durationMs: 100 },
    ],
  });

  const report = buildWorkflowRuntimeReport({ root, today: '2026-06-08' });
  assert.ok(report.summary.measuredRecords >= 7);
  assert.strictEqual(report.summary.derivedCommandResults, 1);
  assert.ok(report.summary.unmeasuredCommandResults >= 1);
  assert.ok(report.workflows.some(item => item.workflow === 'daily_ops.total'));
  assert.ok(report.workflows.some(item => item.workflow === 'snapshot.fetch.low_efficiency_pools'));
  assert.ok(report.workflows.some(item => item.workflow === 'agent.review-effect.command'));
  assert.ok(report.workflows.some(item => item.workflow === 'agent.readiness-audit.command' && item.averageMs === 3250));
  assert.ok(report.workflows.some(item => item.workflow === 'low_efficiency.quick_path.fetch_low_efficiency_pools'));
  assert.ok(report.optimizationHints.some(item => item.workflow === 'daily_ops.step.snapshot'));
}

console.log('workflow_runtime_report tests passed');
