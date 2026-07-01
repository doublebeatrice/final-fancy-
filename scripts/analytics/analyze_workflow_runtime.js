const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value) {
  return Number(Number(value || 0).toFixed(1));
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) {
      out.push(...listFiles(file, predicate));
      continue;
    }
    if (!predicate || predicate(file)) out.push(file);
  }
  return out;
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function durationBetween(startedAt, finishedAt) {
  const start = new Date(text(startedAt)).getTime();
  const end = new Date(text(finishedAt)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function classifyCommand(command = '') {
  const match = text(command).match(/\bnpm\s+run\s+([^\s]+)/);
  const script = match ? match[1] : '';
  if (!script) return { script: '', workflow: 'command.unknown' };
  if (script.startsWith('ops:selection:')) {
    return { script, workflow: `selection.evidence.${script.replace('ops:selection:', '')}` };
  }
  if (script.startsWith('ops:sif:')) {
    return { script, workflow: `sif.evidence.${script.replace('ops:sif:', '')}` };
  }
  if (script.startsWith('ops:agent:review-')) {
    return { script, workflow: `agent.${script.replace('ops:agent:review-', 'review-')}` };
  }
  if (script.startsWith('ops:agent:')) {
    return { script, workflow: `agent.${script.replace('ops:agent:', '')}` };
  }
  if (script.startsWith('ops:deposit:')) {
    return { script, workflow: `daily_deposit.${script.replace('ops:deposit:', '')}` };
  }
  if (script.startsWith('ops:low-efficiency')) {
    return { script, workflow: 'low_efficiency.command' };
  }
  if (script.startsWith('ops:high-efficiency')) {
    return { script, workflow: 'high_efficiency.command' };
  }
  return { script, workflow: script.replace(/^ops:/, '').replace(/:/g, '.') };
}

function record(workflow, durationMs, attrs = {}) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < 0) return null;
  return {
    workflow,
    durationMs: duration,
    ok: attrs.ok !== false,
    source: attrs.source || '',
    recordedAt: attrs.recordedAt || '',
    businessDate: attrs.businessDate || '',
    runId: attrs.runId || '',
    details: attrs.details || {},
  };
}

function recordsFromTodayOpsManifest(file, root) {
  const manifest = readJson(file, null);
  if (!manifest || typeof manifest !== 'object') return [];
  const source = relative(root, file);
  const businessDate = text(manifest.businessDate || manifest.time?.businessDate);
  const runId = text(manifest.runId || manifest.time?.sourceRunId || path.basename(path.dirname(file)));
  const ok = text(manifest.status || 'success') !== 'failed';
  const records = [];
  const totalMs = durationBetween(manifest.startedAt || manifest.runAt, manifest.finishedAt) ||
    (manifest.steps || []).reduce((sum, step) => sum + num(step.durationMs), 0);
  const total = record('daily_ops.total', totalMs, {
    ok,
    source,
    businessDate,
    runId,
    recordedAt: text(manifest.finishedAt || manifest.startedAt || manifest.runAt),
    details: { status: manifest.status || '' },
  });
  if (total) records.push(total);
  for (const step of manifest.steps || []) {
    const item = record(`daily_ops.step.${text(step.name)}`, step.durationMs, {
      ok: text(step.status || 'success') !== 'failed',
      source,
      businessDate,
      runId,
      recordedAt: text(step.finishedAt || manifest.finishedAt || manifest.startedAt),
      details: { status: step.status || '' },
    });
    if (item) records.push(item);
  }
  for (const stage of manifest.panelFetchMetrics?.stages || []) {
    const item = record(`snapshot.fetch.${text(stage.stage)}`, stage.durationMs, {
      ok: num(stage.failed) === 0,
      source,
      businessDate,
      runId,
      recordedAt: text(stage.endedAt || manifest.finishedAt || manifest.startedAt),
      details: {
        attempted: stage.attempted,
        success: stage.success,
        failed: stage.failed,
        skipped: stage.skipped,
      },
    });
    if (item) records.push(item);
  }
  return records;
}

function recordsFromCommandResults(file, root, counters) {
  const report = readJson(file, null);
  if (!report || typeof report !== 'object') return [];
  const records = [];
  const source = relative(root, file);
  const businessDate = text(report.businessDate || path.basename(file).match(/\d{4}-\d{2}-\d{2}/)?.[0]);
  for (const item of report.results || []) {
    const durationMs = Number.isFinite(Number(item.durationMs))
      ? Number(item.durationMs)
      : durationBetween(item.startedAt, item.finishedAt);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      counters.unmeasuredCommandResults += 1;
      continue;
    }
    if (!Number.isFinite(Number(item.durationMs))) counters.derivedCommandResults += 1;
    const classified = classifyCommand(item.command);
    const row = record(`${classified.workflow}.command`, durationMs, {
      ok: item.ok !== false && item.timedOut !== true,
      source,
      businessDate,
      runId: text(item.sourceRunId || report.sourceRunId),
      recordedAt: text(item.finishedAt || item.startedAt || item.at || report.generatedAt),
      details: {
        script: classified.script,
        timedOut: item.timedOut === true,
        taskId: item.taskId || '',
      },
    });
    if (row) records.push(row);
  }
  return records;
}

function perfPrefixFromFile(file) {
  const name = path.basename(file);
  if (name.startsWith('low_efficiency_perf_')) return 'low_efficiency.quick_path';
  return name.replace(/_perf_\d{4}-\d{2}-\d{2}\.json$/, '').replace(/-/g, '_');
}

function recordsFromPerfFile(file, root) {
  const report = readJson(file, null);
  if (!report || typeof report !== 'object') return [];
  const prefix = perfPrefixFromFile(file);
  const source = relative(root, file);
  const businessDate = text(report.businessDate || path.basename(file).match(/\d{4}-\d{2}-\d{2}/)?.[0]);
  const records = [];
  const total = record(`${prefix}.total`, report.summary?.totalRuntimeMs, {
    ok: true,
    source,
    businessDate,
    recordedAt: text(report.generatedAt),
    details: {
      dryRun: report.dryRun === true,
      source: report.source || '',
      totalRows: report.summary?.totalRows,
      actionable: report.summary?.actionable,
    },
  });
  if (total) records.push(total);
  for (const timing of report.timings || []) {
    const item = record(`${prefix}.${text(timing.label || timing.name)}`, timing.durationMs, {
      ok: true,
      source,
      businessDate,
      recordedAt: text(report.generatedAt),
      details: { dryRun: report.dryRun === true, source: report.source || '' },
    });
    if (item) records.push(item);
  }
  return records;
}

function collectWorkflowRuntimeRecords(options = {}) {
  const root = options.root || ROOT;
  const counters = { derivedCommandResults: 0, unmeasuredCommandResults: 0 };
  const records = [];
  const manifestFiles = listFiles(path.join(root, 'data', 'snapshots', 'runs'), file => path.basename(file) === 'manifest.json');
  const commandFiles = listFiles(path.join(root, 'data', 'agent'), file => /^command_results_.*\.json$/.test(path.basename(file)));
  const perfFiles = listFiles(path.join(root, 'data', 'tasks'), file => /_perf_\d{4}-\d{2}-\d{2}\.json$/.test(path.basename(file)));
  for (const file of manifestFiles) records.push(...recordsFromTodayOpsManifest(file, root));
  for (const file of commandFiles) records.push(...recordsFromCommandResults(file, root, counters));
  for (const file of perfFiles) records.push(...recordsFromPerfFile(file, root));
  return { records, counters };
}

function aggregateRecords(records = []) {
  const groups = new Map();
  for (const item of records) {
    if (!item?.workflow || !Number.isFinite(Number(item.durationMs))) continue;
    if (!groups.has(item.workflow)) groups.set(item.workflow, []);
    groups.get(item.workflow).push(item);
  }
  return [...groups.entries()].map(([workflow, rows]) => {
    const durations = rows.map(item => num(item.durationMs));
    const total = durations.reduce((sum, value) => sum + value, 0);
    const latest = rows.slice().sort((a, b) => text(b.recordedAt).localeCompare(text(a.recordedAt)))[0] || {};
    return {
      workflow,
      sampleCount: rows.length,
      successCount: rows.filter(item => item.ok !== false).length,
      failedCount: rows.filter(item => item.ok === false).length,
      averageMs: round1(total / rows.length),
      p50Ms: percentile(durations, 50),
      p90Ms: percentile(durations, 90),
      maxMs: Math.max(...durations),
      latestMs: latest.durationMs || 0,
      latestAt: latest.recordedAt || '',
      latestSource: latest.source || '',
      sources: [...new Set(rows.map(item => item.source).filter(Boolean))].slice(0, 5),
    };
  }).sort((a, b) => b.averageMs - a.averageMs || b.sampleCount - a.sampleCount);
}

function buildOptimizationHints(workflows = []) {
  const byName = new Map(workflows.map(item => [item.workflow, item]));
  const hints = [];
  const addStageHint = (workflow, reason, suggestion) => {
    const item = byName.get(workflow);
    if (!item) return;
    hints.push({
      workflow,
      reason,
      suggestion,
      averageMs: item.averageMs,
    });
  };
  const snapshot = byName.get('daily_ops.step.snapshot');
  if (snapshot) {
    hints.push({
      workflow: snapshot.workflow,
      reason: 'full snapshot is the largest shared blocking stage',
      suggestion: 'Prefer task-specific fast reads before running full today_ops when the user asks for one concrete workflow.',
      averageMs: snapshot.averageMs,
    });
  }
  const lowPool = byName.get('snapshot.fetch.low_efficiency_pools');
  const lowQuick = byName.get('low_efficiency.quick_path.total');
  if (lowPool && lowQuick && lowPool.averageMs > lowQuick.averageMs) {
    hints.push({
      workflow: lowPool.workflow,
      reason: 'full snapshot low-efficiency pool fetch is slower than the quick path',
      suggestion: 'Route low-efficiency checks to ops:low-efficiency before full daily snapshot unless broader daily closure is required.',
      averageMs: lowPool.averageMs,
      quickPathAverageMs: lowQuick.averageMs,
    });
  }
  addStageHint(
    'snapshot.fetch.listing_fetch',
    'listing fetch is expensive and not needed for every ad-only request',
    'Defer listing fetch unless the request needs listing/front-page evidence, and add SKU-scoped listing reads for product-review requests.'
  );
  addStageHint(
    'snapshot.fetch.ads_data_read',
    'full ad row reads are heavy for single-SKU or single-entity work',
    'Prefer direct backend reads scoped by SKU, campaign, ad group, keyword, or target before falling back to full ad snapshots.'
  );
  addStageHint(
    'snapshot.fetch.over_budget_rows',
    'over-budget pool reads are a distinct workflow but currently live inside the full snapshot path',
    'Route over-budget requests to a standalone fast fetch/schema path when the user asks only for budget handling.'
  );
  addStageHint(
    'snapshot.fetch.ads_metric_windows',
    'multi-window ad metrics dominate broad daily reads on some days',
    'Cache shared metric windows during a run and fetch only requested windows for single workflow checks.'
  );
  addStageHint(
    'daily_ops.step.dry_run',
    'dry-run cost spikes when the action schema is broad',
    'Generate scoped schemas for single user requests instead of running the full daily candidate set.'
  );
  addStageHint(
    'daily_ops.step.execute_verify_note',
    'verification can be cheap when no write is needed but expensive after broad action batches',
    'Keep readback verification, but scope it to the entities touched by the current request.'
  );
  const commandTimeouts = workflows.filter(item => item.failedCount > 0 && item.workflow.endsWith('.command')).slice(0, 5);
  for (const item of commandTimeouts) {
    hints.push({
      workflow: item.workflow,
      reason: 'command has failed or timed out samples',
      suggestion: 'Inspect this command separately and add a narrow output contract or cache if it is part of a common request.',
      averageMs: item.averageMs,
    });
  }
  return hints;
}

function buildWorkflowRuntimeReport(options = {}) {
  const root = options.root || ROOT;
  const { records, counters } = collectWorkflowRuntimeRecords({ root });
  const workflows = aggregateRecords(records);
  const durations = records.map(item => num(item.durationMs)).filter(value => Number.isFinite(value));
  const report = {
    generatedAt: new Date().toISOString(),
    today: text(options.today || new Date().toISOString().slice(0, 10)),
    root,
    summary: {
      measuredRecords: records.length,
      derivedCommandResults: counters.derivedCommandResults,
      unmeasuredCommandResults: counters.unmeasuredCommandResults,
      workflowCount: workflows.length,
      averageMs: durations.length ? round1(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
      p90Ms: percentile(durations, 90),
      maxMs: durations.length ? Math.max(...durations) : 0,
    },
    workflows,
    slowestWorkflows: workflows.slice(0, Number(options.limit || 20)),
    optimizationHints: buildOptimizationHints(workflows),
  };
  return report;
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  return {
    today: get('--today') || process.env.AGENT_TODAY || new Date().toISOString().slice(0, 10),
    out: get('--out') || '',
    limit: Number(get('--limit') || 20),
  };
}

function main() {
  const options = parseArgs();
  const report = buildWorkflowRuntimeReport(options);
  const outFile = options.out || path.join(ROOT, 'data', 'agent', `workflow_runtime_report_${options.today}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outFile,
    summary: report.summary,
    slowestWorkflows: report.slowestWorkflows.slice(0, options.limit),
    optimizationHints: report.optimizationHints,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  aggregateRecords,
  buildWorkflowRuntimeReport,
  classifyCommand,
  collectWorkflowRuntimeRecords,
};
