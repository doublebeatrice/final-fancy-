const fs = require('fs');
const path = require('path');
const { evaluateRecoveryGate } = require('../run_agent_handoff_summary');

const ROOT = path.join(__dirname, '..', '..');

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

function round(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function targetFromSummary(summary = {}) {
  const targetDate = text(summary.recoveryGateTargetBusinessDate);
  if (!targetDate) return null;
  return {
    businessDate: targetDate,
    salesTarget: summary.recoveryGateSalesTarget ?? null,
    unitsTarget: summary.recoveryGateUnitsTarget ?? null,
    netProfitRateMin: summary.recoveryGateNetProfitRateMin ?? null,
    acosMax: summary.recoveryGateAcosMax ?? null,
    refundRateMax: summary.recoveryGateRefundRateMax ?? null,
    adCostShareMax: summary.recoveryGateAdCostShareMax ?? null,
  };
}

function targetFromEvaluatedGate(gate = {}) {
  const targetBusinessDate = text(gate.targetBusinessDate);
  if (!targetBusinessDate || !gate.target) return null;
  return {
    businessDate: targetBusinessDate,
    salesTarget: gate.target.salesTarget ?? null,
    unitsTarget: gate.target.unitsTarget ?? null,
    netProfitRateMin: gate.target.netProfitRateMin ?? null,
    acosMax: gate.target.acosMax ?? null,
    refundRateMax: gate.target.refundRateMax ?? null,
    adCostShareMax: gate.target.adCostShareMax ?? null,
    estimatedNetProfitTarget: gate.target.estimatedNetProfitTarget ?? null,
  };
}

function normalizeCurrent(current = {}) {
  return {
    sales: Number(current.sales ?? 0),
    units: Number(current.units ?? 0),
    netProfitRate: Number(current.netProfitRate ?? 0),
    acos: Number(current.acos ?? 0),
    refundRate: Number(current.refundRate ?? 0),
    adCostShare: Number(current.adCostShare ?? 0),
    estimatedNetProfit: Number(current.estimatedNetProfit ?? 0),
  };
}

function buildGateReport({
  outputDate = '',
  handoff = {},
  closedLoop = {},
  snapshot = {},
  handoffFile = '',
  closedLoopFile = '',
  snapshotFile = '',
} = {}) {
  const date = dateOnly(outputDate || closedLoop.outputDate || handoff.localDate || new Date());
  const kpiSummary = handoff.kpiSummary || closedLoop.handoff?.kpiSummary || {};
  const evaluatedGate = kpiSummary.recoveryPace?.nextBusinessDayGate || null;
  const evaluatedBusinessDate = dateOnly(
    handoff.businessDate ||
    closedLoop.businessDate ||
    snapshot.businessDate ||
    snapshot.time?.businessDate ||
    ''
  );
  const dataDate = dateOnly(
    handoff.dataDate ||
    closedLoop.dataDate ||
    snapshot.dataDate ||
    snapshot.time?.dataDate ||
    evaluatedBusinessDate
  );
  const evaluatedGateTarget = evaluatedGate && dateOnly(evaluatedGate.targetBusinessDate) <= evaluatedBusinessDate
    ? targetFromEvaluatedGate(evaluatedGate)
    : null;
  const target = evaluatedGateTarget ||
    kpiSummary.recoveryPace?.nextBusinessDayTarget ||
    targetFromSummary(closedLoop.summary || {}) ||
    null;
  const current = normalizeCurrent(evaluatedGate?.actual || kpiSummary.current || {});
  const targetBusinessDate = target ? dateOnly(target.businessDate) : '';
  let status = 'missing_target';
  let gate = evaluatedGateTarget ? evaluatedGate : null;
  const warnings = [];

  if (!target) {
    warnings.push('kpi_recovery_gate_target_missing');
  } else if (evaluatedBusinessDate < targetBusinessDate) {
    status = 'target_set_actual_pending';
    warnings.push('target_business_date_actual_not_available');
  } else {
    gate = gate || evaluateRecoveryGate(current, target, evaluatedBusinessDate);
    status = gate?.status || 'missing_actual';
    if (status === 'fail') warnings.push('recovery_gate_failed');
    if (status === 'pass') warnings.push('recovery_gate_passed');
  }

  if (dataDate < evaluatedBusinessDate) warnings.push('data_date_lags_business_date');

  return {
    generatedAt: new Date().toISOString(),
    outputDate: date,
    evaluatedBusinessDate,
    dataDate,
    status,
    target,
    actual: target ? {
      sales: round(current.sales, 2),
      units: round(current.units, 0),
      netProfitRate: round(current.netProfitRate, 4),
      acos: round(current.acos, 4),
      refundRate: round(current.refundRate, 4),
      adCostShare: round(current.adCostShare, 4),
      estimatedNetProfit: round(current.estimatedNetProfit, 2),
    } : null,
    gate,
    warnings: [...new Set(warnings)],
    sourceFiles: {
      handoffFile,
      closedLoopFile,
      snapshotFile,
    },
  };
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const date = get('--date') || get('--today') || dateOnly(new Date());
  return {
    date,
    handoffFile: get('--handoff') || path.join(ROOT, 'data', 'agent', `agent_handoff_${date}.json`),
    closedLoopFile: get('--closed-loop') || path.join(ROOT, 'data', 'agent', `agent_closed_loop_${date}.json`),
    snapshotFile: get('--snapshot') || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    outFile: get('--out') || path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${date}.json`),
  };
}

function run(options = {}) {
  const handoff = readJson(options.handoffFile, {});
  const closedLoop = readJson(options.closedLoopFile, {});
  const snapshot = readJson(options.snapshotFile, {});
  const report = buildGateReport({
    outputDate: options.date,
    handoff,
    closedLoop,
    snapshot,
    handoffFile: options.handoffFile,
    closedLoopFile: options.closedLoopFile,
    snapshotFile: options.snapshotFile,
  });
  writeJson(options.outFile, report);
  return { ok: true, outFile: options.outFile, report };
}

function main() {
  const result = run(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
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
  buildGateReport,
  parseArgs,
  run,
  targetFromEvaluatedGate,
};
