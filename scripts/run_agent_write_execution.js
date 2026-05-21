const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExecFileSync } = require('child_process');
const { assessAuthorization } = require('../src/agent_control_plane');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

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
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function actionsFromLedger(ledger = {}) {
  if (Array.isArray(ledger.actions)) return ledger.actions;
  if (Array.isArray(ledger.plan)) return ledger.plan.flatMap(item => (item.actions || []).map(action => ({ ...action, sku: action.sku || item.sku, asin: action.asin || item.asin })));
  if (Array.isArray(ledger)) return ledger;
  return [];
}

function actionKey(action = {}, index = 0) {
  return [
    text(action.sku),
    text(action.entityType),
    text(action.actionType || action.type),
    text(action.id || action.entityId),
    index,
  ].filter(item => item !== '').join('::');
}

function shouldRefreshAuthorization(action = {}, authorization = {}) {
  const blocks = Array.isArray(authorization.blocks) ? authorization.blocks : [];
  if (blocks.includes('unsupported_or_unclassified_action_surface')) return true;
  return !authorization.mode;
}

function classifyWriteActions(actions = []) {
  return actions.map((action, index) => {
    const authorization = assessAuthorization({ ...action, authorization: undefined });
    return {
      key: actionKey(action, index),
      sku: text(action.sku),
      actionType: text(action.actionType || action.type),
      entityType: text(action.entityType),
      authorization,
      action,
    };
  });
}

function commandForRunActions(actionSchemaFile, snapshotFile, mode, options = {}) {
  const args = [
    'scripts\\execute\\run_actions.js',
    actionSchemaFile,
  ];
  if (snapshotFile) args.push('--snapshot', snapshotFile);
  args.push(mode === 'execute' ? '--execute' : '--dry-run');
  if (options.fullScope) args.push('--full-scope');
  if (options.fastScope) args.push('--fast-scope');
  return {
    bin: process.execPath,
    args,
    printable: `node ${args.map(arg => /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg).join(' ')}`,
  };
}

function defaultFile(prefix, today) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${today}.json`);
}

function actionEntityId(action = {}) {
  return text(
    action.id ||
    action.entityId ||
    action.keywordId ||
    action.targetId ||
    action.adId ||
    action.campaignId
  );
}

function actionLandedKey(action = {}) {
  return [
    text(action.sku).toUpperCase(),
    text(action.entityType).toLowerCase(),
    text(action.actionType || action.type).toLowerCase(),
    actionEntityId(action),
  ].join('|');
}

function actionEntityKey(action = {}) {
  return [
    text(action.sku).toUpperCase(),
    text(action.entityType).toLowerCase(),
    actionEntityId(action),
  ].join('|');
}

function isSuccessfulAdjustment(row = {}) {
  if (row.dryRun === true) return false;
  return ['success', 'api_success', 'verified_landed', 'landed'].includes(text(row.outcome || row.status || row.result));
}

function dateMatches(row = {}, acceptedDates = []) {
  if (!acceptedDates.length) return true;
  const dates = [
    dateOnly(row.businessDate || ''),
    dateOnly(row.localDate || ''),
    dateOnly(row.runAt || ''),
  ].filter(Boolean);
  return dates.some(date => acceptedDates.includes(date));
}

function adjustmentLandedKeys(adjustments = [], acceptedDates = []) {
  return new Set((Array.isArray(adjustments) ? adjustments : [])
    .filter(row => isSuccessfulAdjustment(row) && dateMatches(row, acceptedDates))
    .map(row => actionLandedKey({
      sku: row.sku,
      entityType: row.entityType,
      actionType: row.actionType,
      id: row.entityId || row.id,
    }))
    .filter(key => !key.endsWith('|')));
}

function resolveAdjustmentFiles(today = '', timeContext = {}, explicitFile = '') {
  if (explicitFile) return [explicitFile];
  const dir = path.join(ROOT, 'data', 'adjustments');
  const dates = [today, timeContext.businessDate, timeContext.localDate]
    .map(dateOnly)
    .filter(Boolean);
  return [...new Set(dates)]
    .map(date => path.join(dir, `adjustments_${date}.json`))
    .filter(file => fs.existsSync(file));
}

function readAdjustmentFiles(files = []) {
  return files.flatMap(file => {
    const rows = readJson(file, []);
    return Array.isArray(rows) ? rows : [];
  });
}

function applyDryRunFeedbackToPlan(plan = {}, dryRunFeedback = {}) {
  const validationErrors = Array.isArray(dryRunFeedback.aiValidationErrors) ? dryRunFeedback.aiValidationErrors : [];
  const validationByKey = new Map(validationErrors.map(error => [
    actionEntityKey({
      sku: error.sku,
      entityType: error.entityType,
      id: error.id || error.entityId,
    }),
    text(error.reason || 'dry_run_validation_error'),
  ]));
  const outOfScope = new Set((dryRunFeedback.outOfScopeSkuList || []).map(item => text(item).toUpperCase()).filter(Boolean));
  const dryRunBlocked = [];
  const eligible = [];
  for (const item of plan.eligible || []) {
    const key = actionEntityKey(item.action);
    const sku = text(item.sku).toUpperCase();
    const reason = validationByKey.get(key) || (outOfScope.has(sku) ? 'sku_not_in_allowed_operation_scope' : '');
    if (reason) {
      dryRunBlocked.push({
        key: item.key,
        sku: item.sku,
        entityType: item.entityType,
        actionType: item.actionType,
        mode: 'blocked',
        riskLevel: item.authorization?.riskLevel || 'medium',
        blocks: [validationByKey.has(key) ? 'dry_run_validation_error' : 'out_of_operation_scope'],
        requirements: ['fresh_clean_dry_run_before_execute'],
        reason,
      });
    } else {
      eligible.push(item);
    }
  }
  return {
    ...plan,
    eligible,
    dryRunBlocked,
    canExecute: eligible.length > 0 && (plan.blockers || []).length === 0,
    summary: {
      ...plan.summary,
      eligibleActions: eligible.length,
      dryRunBlockedActions: dryRunBlocked.length,
      blockedActions: Number(plan.summary?.blockedActions || 0) + dryRunBlocked.length,
    },
  };
}

function readDryRunFeedback(options = {}) {
  if (options.dryRunFeedback) return options.dryRunFeedback;
  const candidates = [options.businessDate, options.localDate, options.today]
    .map(dateOnly)
    .filter(Boolean)
    .map(date => path.join(ROOT, 'data', 'snapshots', `execution_dry_run_${date}.json`))
    .filter(file => fs.existsSync(file))
    .map(file => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.length ? readJson(candidates[0].file, {}) : {};
}

function buildWriteExecutionPlan(options = {}) {
  const timeContext = options.timeContext || {};
  const today = dateOnly(options.today || timeContext.businessDate || timeContext.runAt);
  const ledger = options.ledger || readJson(options.ledgerFile, {});
  const actionSchemaFile = text(options.actionSchemaFile || options.actionsFile || '');
  const snapshotFile = text(options.snapshotFile || '');
  const acceptedDates = [...new Set([today, timeContext.businessDate, timeContext.localDate].map(dateOnly).filter(Boolean))];
  const adjustments = options.adjustments || readAdjustmentFiles(resolveAdjustmentFiles(today, timeContext, options.adjustmentsFile || ''));
  const landedKeys = adjustmentLandedKeys(adjustments, acceptedDates);
  const classified = classifyWriteActions(actionsFromLedger(ledger));
  const alreadyLanded = classified.filter(item => landedKeys.has(actionLandedKey(item.action)));
  const remaining = classified.filter(item => !landedKeys.has(actionLandedKey(item.action)));
  const eligible = remaining.filter(item => item.authorization.mode === 'auto_execute');
  const approvalNeeded = remaining.filter(item => !['auto_execute', 'auto_read'].includes(item.authorization.mode));
  const dryRun = commandForRunActions(actionSchemaFile, snapshotFile, 'dry-run', options);
  const execute = commandForRunActions(actionSchemaFile, snapshotFile, 'execute', options);
  const missing = [];
  if (eligible.length > 0 && !actionSchemaFile) missing.push({ mode: 'blocked', reason: 'missing_action_schema_file' });

  return {
    businessDate: today,
    actionSchemaFile,
    snapshotFile,
    canExecute: eligible.length > 0 && missing.length === 0,
    dryRunCommand: dryRun.printable,
    executeCommand: execute.printable,
    dryRun,
    execute,
    summary: {
      totalActions: classified.length,
      remainingActions: remaining.length,
      landedActions: alreadyLanded.length,
      eligibleActions: eligible.length,
      readOnlyActions: remaining.filter(item => item.authorization.mode === 'auto_read').length,
      approvalNeededActions: approvalNeeded.length,
      blockedActions: missing.length,
    },
    eligible,
    alreadyLanded: alreadyLanded.map(item => ({
      key: item.key,
      sku: item.sku,
      entityType: item.entityType,
      actionType: item.actionType,
    })),
    approvalNeeded: approvalNeeded.map(item => ({
      key: item.key,
      sku: item.sku,
      entityType: item.entityType,
      actionType: item.actionType,
      mode: item.authorization.mode,
      riskLevel: item.authorization.riskLevel,
      blocks: item.authorization.blocks || [],
      requirements: item.authorization.requirements || [],
    })),
    blockers: [
      ...missing,
    ],
  };
}

function runStage(stage, command, options = {}) {
  const execFileSync = options.execFileSync || defaultExecFileSync;
  const startedAt = text(options.timeContext?.runAt || new Date().toISOString());
  try {
    const stdout = execFileSync(command.bin, command.args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      name: stage,
      ok: true,
      exitCode: 0,
      command: command.printable,
      stdoutSummary: text(stdout).replace(/\s+/g, ' ').slice(0, 500),
      stderrSummary: '',
      at: startedAt,
    };
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';
    return {
      name: stage,
      ok: false,
      exitCode: Number(error.status || error.code || 1),
      command: command.printable,
      stdoutSummary: text(stdout).replace(/\s+/g, ' ').slice(0, 500),
      stderrSummary: text(stderr || error.message).replace(/\s+/g, ' ').slice(0, 500),
      error: text(error.message),
      at: startedAt,
    };
  }
}

function outputFiles(today) {
  return [
    path.join(ROOT, 'data', 'snapshots', `execution_dry_run_${today}.json`),
    path.join(ROOT, 'data', 'snapshots', `execution_verify_${today}.json`),
    path.join(ROOT, 'data', 'snapshots', `execution_summary_${today}.json`),
    path.join(ROOT, 'data', 'snapshots', `execution_coverage_${today}.json`),
    path.join(ROOT, 'data', 'adjustments', `adjustments_${today}.json`),
  ];
}

function commandResultForReport(report = {}, outFile = '') {
  const failed = report.summary.failedStages > 0 || report.summary.blockedActions > 0;
  return {
    taskId: report.taskId,
    command: report.mode === 'execute' ? report.plan.executeCommand : report.plan.dryRunCommand,
    label: '低风险写入动作受限执行链',
    ok: !failed,
    exitCode: failed ? 1 : 0,
    summary: failed
      ? '低风险写入链路未完成，存在阻塞或失败阶段。'
      : (report.mode === 'execute' ? '低风险写入链路已完成：预演、执行、落地回查和日志阶段已串联。' : '低风险写入链路已完成预演，等待明确执行授权。'),
    outputFiles: [outFile, ...outputFiles(report.businessDate)],
    report: {
      verdict: failed ? 'needs_action' : (report.mode === 'execute' ? 'executed' : 'dry_run_ready'),
      nextStep: report.mode === 'execute' ? '进入效果复查承诺。' : '确认后可带 --execute 执行真实写入。',
    },
    at: report.generatedAt,
    sourceRunId: report.sourceRunId,
  };
}

function runAgentWriteExecution(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_write_execution_${Date.now()}`,
  });
  let plan = buildWriteExecutionPlan({ ...options, timeContext });
  const stages = [];
  if (plan.summary.blockedActions === 0 && plan.summary.eligibleActions > 0) {
    stages.push(runStage('dry_run', plan.dryRun, { ...options, timeContext }));
    if (stages.at(-1)?.ok) {
      plan = applyDryRunFeedbackToPlan(plan, readDryRunFeedback({
        ...options,
        today: plan.businessDate,
        businessDate: timeContext.businessDate || plan.businessDate,
        localDate: timeContext.localDate,
      }));
    }
    if (options.execute === true && stages.every(stage => stage.ok) && plan.summary.eligibleActions > 0 && plan.summary.blockedActions === 0) {
      stages.push(runStage('execute_verify_note', plan.execute, { ...options, timeContext }));
    }
  }
  const report = {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    businessDate: plan.businessDate,
    dataDate: dateOnly(timeContext.dataDate || plan.businessDate),
    sourceRunId: text(timeContext.sourceRunId || ''),
    taskId: text(options.taskId || `agent_write_execution::${plan.businessDate}`),
    mode: options.execute === true ? 'execute' : 'dry-run',
    plan,
    stages,
    summary: {
      ...plan.summary,
      executedStages: stages.filter(stage => stage.ok).length,
      failedStages: stages.filter(stage => !stage.ok).length,
    },
  };
  const outFile = options.outFile || defaultFile('write_execution', report.businessDate);
  report.results = [commandResultForReport(report, outFile)];
  writeJson(outFile, report);
  return report;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    ledgerFile: get('--ledger') || process.env.AGENT_LEDGER_FILE || '',
    actionSchemaFile: get('--actions') || get('--action-schema') || process.env.ACTION_SCHEMA_FILE || '',
    snapshotFile: get('--snapshot') || process.env.PANEL_SNAPSHOT_FILE || '',
    adjustmentsFile: get('--adjustments') || process.env.AGENT_ADJUSTMENTS_FILE || '',
    outFile: get('--out') || process.env.AGENT_WRITE_EXECUTION_OUT || '',
    taskId: get('--task-id') || '',
    today: get('--today') || '',
    now: get('--now') || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    execute: args.includes('--execute') || process.env.AGENT_WRITE_EXECUTE === '1',
    fullScope: args.includes('--full-scope'),
    fastScope: args.includes('--fast-scope'),
  };
}

function main() {
  const options = parseArgs(process.argv);
  const report = runAgentWriteExecution(options);
  const outFile = options.outFile || defaultFile('write_execution', report.businessDate);
  console.log(JSON.stringify({
    ok: report.summary.failedStages === 0 && report.summary.blockedActions === 0,
    businessDate: report.businessDate,
    outFile,
    mode: report.mode,
    summary: report.summary,
  }, null, 2));
  if (report.summary.failedStages > 0 || report.summary.blockedActions > 0) process.exitCode = 1;
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
  applyDryRunFeedbackToPlan,
  buildWriteExecutionPlan,
  parseArgs,
  runAgentWriteExecution,
};
