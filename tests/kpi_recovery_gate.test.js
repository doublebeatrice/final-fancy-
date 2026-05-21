const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildGateReport,
  parseArgs,
  run,
} = require('../scripts/execute/evaluate_kpi_recovery_gate');

{
  const report = buildGateReport({
    outputDate: '2026-05-20',
    handoff: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      kpiSummary: {
        current: {
          sales: 525427.69,
          units: 3663,
          netProfitRate: 0.1941,
          acos: 0.1998,
          refundRate: 0.0546,
          adCostShare: 0.1012,
          estimatedNetProfit: 101975.32,
        },
        recoveryPace: {
          nextBusinessDayTarget: {
            businessDate: '2026-05-20',
            salesTarget: 541080.88,
            unitsTarget: 3754,
            netProfitRateMin: 0.1947,
            acosMax: 0.1977,
            refundRateMax: 0.0528,
            adCostShareMax: 0.108,
          },
        },
      },
    },
  });
  assert.strictEqual(report.status, 'target_set_actual_pending');
  assert.strictEqual(report.target.salesTarget, 541080.88);
  assert.strictEqual(report.gate, null);
  assert.ok(report.warnings.includes('target_business_date_actual_not_available'));
  assert.ok(report.warnings.includes('data_date_lags_business_date'));
}

{
  const report = buildGateReport({
    outputDate: '2026-05-21',
    handoff: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-20',
      kpiSummary: {
        current: {
          sales: 540000,
          units: 3700,
          netProfitRate: 0.19,
          acos: 0.21,
          refundRate: 0.06,
          adCostShare: 0.11,
          estimatedNetProfit: 102600,
        },
        recoveryPace: {
          nextBusinessDayTarget: {
            businessDate: '2026-05-20',
            salesTarget: 541080.88,
            unitsTarget: 3754,
            netProfitRateMin: 0.1947,
            acosMax: 0.1977,
            refundRateMax: 0.0528,
            adCostShareMax: 0.108,
          },
        },
      },
    },
  });
  assert.strictEqual(report.status, 'fail');
  assert.strictEqual(report.gate.gap.salesGap, 1080.88);
  assert.strictEqual(report.gate.gap.unitsGap, 54);
  assert.ok(report.warnings.includes('recovery_gate_failed'));
}

{
  const report = buildGateReport({
    outputDate: '2026-05-20',
    handoff: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      kpiSummary: {
        current: {
          sales: 525427.69,
          units: 3663,
          netProfitRate: 0.1941,
          acos: 0.1998,
          refundRate: 0.0546,
          adCostShare: 0.1012,
        },
        recoveryPace: {
          nextBusinessDayTarget: {
            businessDate: '2026-05-21',
            salesTarget: 543689.74,
            unitsTarget: 3770,
            netProfitRateMin: 0.1948,
            acosMax: 0.1973,
            refundRateMax: 0.0525,
            adCostShareMax: 0.108,
          },
          nextBusinessDayGate: {
            status: 'fail',
            targetBusinessDate: '2026-05-20',
            evaluatedBusinessDate: '2026-05-20',
            target: {
              salesTarget: 541080.88,
              unitsTarget: 3754,
              netProfitRateMin: 0.1947,
              acosMax: 0.1977,
              refundRateMax: 0.0528,
              adCostShareMax: 0.108,
            },
            actual: {
              sales: 525427.69,
              units: 3663,
              netProfitRate: 0.1941,
              acos: 0.1998,
              refundRate: 0.0546,
              adCostShare: 0.1012,
            },
            gap: { salesGap: 15653.19, unitsGap: 91 },
          },
        },
      },
    },
  });
  assert.strictEqual(report.status, 'fail');
  assert.strictEqual(report.target.businessDate, '2026-05-20');
  assert.strictEqual(report.target.salesTarget, 541080.88);
  assert.strictEqual(report.gate.gap.salesGap, 15653.19);
  assert.ok(report.warnings.includes('recovery_gate_failed'));
}

{
  const parsed = parseArgs([
    'node',
    'script',
    '--date',
    '2026-05-20',
    '--handoff',
    'handoff.json',
    '--closed-loop',
    'closed.json',
    '--snapshot',
    'snapshot.json',
    '--out',
    'out.json',
  ]);
  assert.strictEqual(parsed.date, '2026-05-20');
  assert.strictEqual(parsed.handoffFile, 'handoff.json');
  assert.strictEqual(parsed.closedLoopFile, 'closed.json');
  assert.strictEqual(parsed.snapshotFile, 'snapshot.json');
  assert.strictEqual(parsed.outFile, 'out.json');
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-gate-'));
  const handoffFile = path.join(dir, 'handoff.json');
  const closedLoopFile = path.join(dir, 'closed.json');
  const snapshotFile = path.join(dir, 'snapshot.json');
  const outFile = path.join(dir, 'gate.json');
  fs.writeFileSync(handoffFile, JSON.stringify({
    businessDate: '2026-05-20',
    dataDate: '2026-05-20',
    kpiSummary: {
      current: {
        sales: 542000,
        units: 3800,
        netProfitRate: 0.2,
        acos: 0.19,
        refundRate: 0.05,
        adCostShare: 0.1,
      },
      recoveryPace: {
        nextBusinessDayTarget: {
          businessDate: '2026-05-20',
          salesTarget: 541080.88,
          unitsTarget: 3754,
          netProfitRateMin: 0.1947,
          acosMax: 0.1977,
          refundRateMax: 0.0528,
          adCostShareMax: 0.108,
        },
      },
    },
  }));
  fs.writeFileSync(closedLoopFile, '{}');
  fs.writeFileSync(snapshotFile, '{}');
  const result = run({
    date: '2026-05-20',
    handoffFile,
    closedLoopFile,
    snapshotFile,
    outFile,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.report.status, 'pass');
  assert.ok(fs.existsSync(outFile));
}

console.log('kpi_recovery_gate tests passed');
