const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');
const DEFAULT_COMMAND_TIMEOUT_MS = 120000;
const ALLOWED_NPM_SCRIPTS = new Set([
  'ops:agent:review-effect',
  'ops:agent:review-evidence',
  'ops:selection:keyword-research',
  'ops:selection:keyword-conversion',
  'ops:selection:aba-search-terms',
  'ops:selection:keyword-seasonality',
  'ops:selection:product-time-machine',
  'ops:selection:operating-intelligence',
  'ops:agent:correction-risk',
  'ops:agent:autonomy-audit',
  'ops:agent:learning-memory',
  'ops:agent:unattended-gate',
  'ops:agent:unattended-supervisor',
  'ops:agent:unattended-scheduler-audit',
  'ops:agent:unattended-schedule-plan',
  'ops:agent:unattended-schedule-install',
  'ops:agent:readiness-audit',
  'ops:agent:completion-audit',
  'ops:agent:goal-audit',
  'ops:agent:goal-final-audit',
  'ops:agent:capabilities',
]);
const SCRIPT_ENTRYPOINTS = {
  'ops:agent:review-effect': path.join(ROOT, 'scripts', 'run_agent_effect_review.js'),
  'ops:agent:review-evidence': path.join(ROOT, 'scripts', 'run_agent_review_evidence.js'),
  'ops:selection:keyword-research': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_keyword_research.js'),
  'ops:selection:keyword-conversion': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_keyword_conversion_rate.js'),
  'ops:selection:aba-search-terms': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_aba_search_terms.js'),
  'ops:selection:keyword-seasonality': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_keyword_seasonality.js'),
  'ops:selection:product-time-machine': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_product_time_machine.js'),
  'ops:selection:operating-intelligence': path.join(ROOT, 'scripts', 'execute', 'fetch_selection_operating_intelligence.js'),
  'ops:agent:correction-risk': path.join(ROOT, 'scripts', 'run_agent_correction_risk.js'),
  'ops:agent:autonomy-audit': path.join(ROOT, 'scripts', 'run_agent_autonomy_audit.js'),
  'ops:agent:learning-memory': path.join(ROOT, 'scripts', 'run_agent_learning_memory.js'),
  'ops:agent:unattended-gate': path.join(ROOT, 'scripts', 'run_agent_unattended_gate.js'),
  'ops:agent:unattended-supervisor': path.join(ROOT, 'scripts', 'run_agent_unattended_supervisor.js'),
  'ops:agent:unattended-scheduler-audit': path.join(ROOT, 'scripts', 'run_agent_unattended_scheduler_audit.js'),
  'ops:agent:unattended-schedule-plan': path.join(ROOT, 'scripts', 'run_agent_unattended_schedule_plan.js'),
  'ops:agent:unattended-schedule-install': path.join(ROOT, 'scripts', 'run_agent_unattended_schedule_install.js'),
  'ops:agent:readiness-audit': path.join(ROOT, 'scripts', 'run_agent_readiness_audit.js'),
  'ops:agent:completion-audit': path.join(ROOT, 'scripts', 'run_agent_completion_audit.js'),
  'ops:agent:goal-audit': path.join(ROOT, 'scripts', 'run_agent_goal_audit.js'),
  'ops:agent:goal-final-audit': path.join(ROOT, 'scripts', 'run_goal_final_audit.js'),
  'ops:agent:capabilities': path.join(ROOT, 'scripts', 'run_agent_capability_registry.js'),
};

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(resolveOutputFile(file), 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function splitCommandLine(command) {
  const tokens = [];
  const re = /"((?:\\"|[^"])*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(command))) {
    tokens.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\"/g, '"'));
  }
  return tokens;
}

function parseNpmRunCommand(command) {
  const raw = text(command);
  if (!raw) return { ok: false, reason: 'empty_command' };
  if (/[;&|`]/.test(raw)) return { ok: false, reason: 'shell_metacharacter_not_allowed' };
  if (/<[^>]+>/.test(raw)) return { ok: false, reason: 'placeholder_argument' };
  const tokens = splitCommandLine(raw);
  if (tokens[0] !== 'npm' || tokens[1] !== 'run' || !tokens[2]) {
    return { ok: false, reason: 'only_npm_run_commands_allowed' };
  }
  const script = tokens[2];
  if (!ALLOWED_NPM_SCRIPTS.has(script)) return { ok: false, reason: `not_allowlisted:${script}` };
  const passthroughArgs = tokens[3] === '--' ? tokens.slice(4) : tokens.slice(3);
  return {
    ok: true,
    script,
    bin: process.execPath,
    args: [SCRIPT_ENTRYPOINTS[script], ...passthroughArgs],
    originalArgs: tokens.slice(1),
  };
}

function commandHasPlaceholder(command = {}) {
  return /<[^>]+>/.test(text(command.command));
}

function collectRunnableCommands(hub = {}) {
  const runnable = [];
  const skipped = [];
  const seenRunnable = new Set();
  for (const task of hub.todayQueue || []) {
    const plan = task.executionPlan || {};
    for (const command of plan.commands || []) {
      const item = {
        taskId: text(task.taskId),
        taskTitle: text(task.title),
        label: text(command.label),
        command: text(command.command),
        output: text(command.output),
        riskLevel: text(command.riskLevel || 'read_only'),
      };
      if (plan.safeToAutoRun !== true) {
        skipped.push({ ...item, reason: 'unsafe_execution_plan' });
        continue;
      }
      if (item.riskLevel !== 'read_only') {
        skipped.push({ ...item, reason: 'non_read_only_command' });
        continue;
      }
      if (commandHasPlaceholder(command)) {
        skipped.push({ ...item, reason: 'placeholder_argument' });
        continue;
      }
      const parsed = parseNpmRunCommand(item.command);
      if (!parsed.ok) {
        skipped.push({ ...item, reason: parsed.reason });
        continue;
      }
      const dedupeKey = [item.command, item.output].join('|');
      if (seenRunnable.has(dedupeKey)) {
        skipped.push({ ...item, reason: 'duplicate_command' });
        continue;
      }
      seenRunnable.add(dedupeKey);
      runnable.push({ ...item, parsed });
    }
  }
  return { runnable, skipped };
}

function summarizeOutput(value) {
  return text(value).replace(/\s+/g, ' ').slice(0, 500);
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(text(value));
  } catch (error) {
    return null;
  }
}

function uniqueList(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function outputFilesFor(command = {}, stdoutJson = {}) {
  return uniqueList([
    command.output,
    stdoutJson?.outFile,
    stdoutJson?.outputFile,
    stdoutJson?.evidenceFile,
  ]);
}

function resolveOutputFile(file) {
  const raw = text(file);
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function missingOutputFiles(files = []) {
  return files.filter(file => {
    const resolved = resolveOutputFile(file);
    return resolved && !fs.existsSync(resolved);
  });
}

function reportForTask(outputFiles = [], taskId = '') {
  for (const file of outputFiles) {
    const parsed = readJson(file, null);
    if (!parsed || !Array.isArray(parsed.results)) continue;
    const matched = parsed.results.find(item => text(item.taskId) === text(taskId)) ||
      (parsed.results.length === 1 ? parsed.results[0] : null);
    if (matched) return matched;
  }
  return null;
}

function summaryForResult(report = null, stdoutJson = null, fallback = '') {
  return text(
    report?.nextStep ||
    report?.summary ||
    stdoutJson?.summary?.message ||
    stdoutJson?.message ||
    fallback
  );
}

function runOneCommand(item = {}, options = {}) {
  const execFileSync = options.execFileSync || defaultExecFileSync;
  const startedAtMs = Date.now();
  const startedAt = text(options.startedAt || new Date(startedAtMs).toISOString());
  const timeoutMs = Math.max(1000, Number(options.commandTimeoutMs || DEFAULT_COMMAND_TIMEOUT_MS));
  const withTiming = result => {
    const finishedAtMs = Date.now();
    return {
      ...result,
      at: startedAt,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
    };
  };
  try {
    const stdout = execFileSync(item.parsed.bin, item.parsed.args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    const stdoutJson = parseJsonMaybe(stdout);
    const outputFiles = outputFilesFor(item, stdoutJson || {});
    const missing = missingOutputFiles(outputFiles);
    if (missing.length) {
      return withTiming({
        taskId: item.taskId,
        label: item.label,
        command: item.command,
        ok: false,
        exitCode: 1,
        summary: `命令返回成功，但没有生成预期输出：${missing.join(', ')}`,
        stdoutSummary: summarizeOutput(stdout),
        stderrSummary: '',
        outputFiles,
        missingOutputFiles: missing,
        sourceRunId: text(options.timeContext?.sourceRunId || ''),
      });
    }
    const report = reportForTask(outputFiles, item.taskId);
    return withTiming({
      taskId: item.taskId,
      label: item.label,
      command: item.command,
      ok: true,
      exitCode: 0,
      summary: summaryForResult(report, stdoutJson, '命令执行成功。'),
      stdoutSummary: summarizeOutput(stdout),
      stderrSummary: '',
      outputFiles,
      report: report || undefined,
      sourceRunId: text(options.timeContext?.sourceRunId || ''),
    });
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';
    const timedOut = text(error.code) === 'ETIMEDOUT' || text(error.signal) === 'SIGTERM';
    const exitCode = Number(error.status ?? error.code ?? 1);
    const stdoutJson = parseJsonMaybe(stdout);
    const outputFiles = outputFilesFor(item, stdoutJson || {});
    const missing = missingOutputFiles(outputFiles);
    if (!timedOut && stdoutJson && outputFiles.length && missing.length === 0) {
      const report = reportForTask(outputFiles, item.taskId);
      return withTiming({
        taskId: item.taskId,
        label: item.label,
        command: item.command,
        ok: true,
        softFailed: true,
        exitCode: Number.isFinite(exitCode) ? exitCode : 1,
        summary: summaryForResult(report, stdoutJson, summarizeOutput(stdout)),
        stdoutSummary: summarizeOutput(stdout),
        stderrSummary: summarizeOutput(stderr),
        outputFiles,
        report: report || undefined,
        sourceRunId: text(options.timeContext?.sourceRunId || ''),
      });
    }
    return withTiming({
      taskId: item.taskId,
      label: item.label,
      command: item.command,
      ok: false,
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
      summary: timedOut
        ? `Command timed out after ${timeoutMs}ms`
        : summarizeOutput(stderr || stdout || error.message),
      error: text(error.message),
      timedOut,
      timeoutMs,
      stdoutSummary: summarizeOutput(stdout),
      stderrSummary: summarizeOutput(stderr),
      outputFiles: outputFiles.length ? outputFiles : uniqueList([item.output]),
      missingOutputFiles: missing,
      sourceRunId: text(options.timeContext?.sourceRunId || ''),
    });
  }
}

function commandTimingSummary(results = []) {
  const durations = results
    .map(item => Number(item.durationMs))
    .filter(value => Number.isFinite(value) && value >= 0);
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    timedOut: results.filter(item => item.timedOut === true).length,
    measuredCommandCount: durations.length,
    totalCommandDurationMs: total,
    averageCommandDurationMs: durations.length ? Number((total / durations.length).toFixed(1)) : 0,
    maxCommandDurationMs: durations.length ? Math.max(...durations) : 0,
  };
}

function commandResultsReport({ hub = {}, runnable = [], skipped = [], results = [], timeContext = {} } = {}) {
  const failed = results.filter(item => item.ok === false).length;
  return {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate: dateOnly(hub.businessDate || timeContext.businessDate || timeContext.runAt),
    sourceRunId: text(timeContext.sourceRunId || ''),
    summary: {
      planned: runnable.length + skipped.length,
      runnable: runnable.length,
      executed: results.filter(item => item.ok === true).length,
      failed,
      skipped: skipped.length,
      ...commandTimingSummary(results),
    },
    results,
    skipped,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    hubFile: get('--hub') || process.env.AGENT_OPERATING_HUB_FILE || '',
    outFile: get('--out') || process.env.AGENT_COMMAND_RESULTS_OUT || '',
    today: get('--today') || process.env.AGENT_TODAY || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    now: get('--now') || process.env.AGENT_NOW || '',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    commandTimeoutMs: Number(get('--command-timeout-ms') || process.env.AGENT_COMMAND_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS),
    dryRun: args.includes('--dry-run') || process.env.AGENT_COMMAND_RUNNER_DRY_RUN === '1',
  };
}

function defaultFile(prefix, today) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${today}.json`);
}

function runAgentCommandRunner(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `command_runner_${Date.now()}`,
  });
  const today = options.today || timeContext.businessDate;
  const hubFile = options.hubFile || defaultFile('operating_hub', today);
  const hub = options.hub || readJson(hubFile, {});
  const { runnable, skipped } = collectRunnableCommands(hub);
  const results = options.dryRun
    ? []
    : runnable.map(item => runOneCommand(item, { ...options, timeContext }));
  const report = commandResultsReport({ hub, runnable, skipped, results, timeContext });
  const outFile = options.outFile || defaultFile('command_results', report.businessDate);
  writeJson(outFile, report);
  return report;
}

function main() {
  const options = parseArgs(process.argv);
  const report = runAgentCommandRunner(options);
  const outFile = options.outFile || defaultFile('command_results', report.businessDate);
  console.log(JSON.stringify({
    ok: report.summary.failed === 0,
    businessDate: report.businessDate,
    outFile,
    summary: report.summary,
  }, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  collectRunnableCommands,
  parseArgs,
  parseNpmRunCommand,
  runAgentCommandRunner,
  DEFAULT_COMMAND_TIMEOUT_MS,
};
