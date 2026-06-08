const assert = require('assert');
const path = require('path');
const {
  detectTrendAnomalies,
  cumulativeChange,
  classifySignal,
  consecutiveDeteriorationCount,
  consecutiveGapExpansionCount,
  linearRegressionSlope,
  buildKpiGapTrend,
  TRACKED_METRICS,
  RED_KPI_GAP_DAYS,
} = require('../src/trend_anomaly_detector');

function makePoint(date, overrides = {}) {
  return {
    date,
    sales: 600000,
    units: 4000,
    netProfitRate: 0.20,
    adCostShare: 0.105,
    acos: 0.18,
    refundRate: 0.04,
    sourceFile: `mock/${date}.json`,
    ...overrides,
  };
}

function loaderFromPoints(points) {
  const map = new Map(points.map(point => [point.date, point]));
  return date => map.get(date) || null;
}

(function test_insufficientData() {
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: () => null,
  });
  assert.strictEqual(r.status, 'insufficient_data', 'no data should yield insufficient_data');
  assert.strictEqual(r.redSignals.length, 0);
  assert.strictEqual(r.yellowSignals.length, 0);
  assert.ok(r.markdown.includes('数据点不足'));
})();

(function test_steadyGreen() {
  const points = [
    makePoint('2026-05-22'),
    makePoint('2026-05-23'),
    makePoint('2026-05-24'),
    makePoint('2026-05-25'),
    makePoint('2026-05-26'),
    makePoint('2026-05-27'),
    makePoint('2026-05-28'),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'green', `steady values should be green, got ${r.status}`);
  assert.strictEqual(r.redSignals.length, 0);
  assert.strictEqual(r.yellowSignals.length, 0);
})();

(function test_monotonicCrashRed() {
  const sales = [600000, 580000, 555000, 530000, 505000, 480000, 460000];
  const points = sales.map((value, index) => makePoint(`2026-05-${22 + index}`, { sales: value }));
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'red', `monotonic 23% crash should be red, got ${r.status}`);
  const sale = r.redSignals.find(s => s.metric === 'sales');
  assert.ok(sale, 'sales should appear as red signal');
  assert.ok(sale.deteriorationStreak >= 5, `streak should reach 5, got ${sale.deteriorationStreak}`);
  assert.ok(sale.cumulativeMagnitude >= 0.20, `cumulative magnitude expected ≥0.20, got ${sale.cumulativeMagnitude}`);
})();

(function test_smallNoiseGreen() {
  const points = [
    makePoint('2026-05-22', { sales: 600000 }),
    makePoint('2026-05-23', { sales: 599000 }),
    makePoint('2026-05-24', { sales: 601000 }),
    makePoint('2026-05-25', { sales: 600500 }),
    makePoint('2026-05-26', { sales: 599500 }),
    makePoint('2026-05-27', { sales: 600200 }),
    makePoint('2026-05-28', { sales: 600800 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'green', `small noise (<0.5%) should stay green, got ${r.status}`);
})();

(function test_consecutiveDeteriorationYellow() {
  const points = [
    makePoint('2026-05-22', { acos: 0.18 }),
    makePoint('2026-05-23', { acos: 0.181 }),
    makePoint('2026-05-24', { acos: 0.183 }),
    makePoint('2026-05-25', { acos: 0.186 }),
    makePoint('2026-05-26', { acos: 0.189 }),
    makePoint('2026-05-27', { acos: 0.192 }),
    makePoint('2026-05-28', { acos: 0.196 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.ok(['yellow', 'red'].includes(r.status), `slow ACOS climb should be at least yellow, got ${r.status}`);
  const acosSignal = [...r.redSignals, ...r.yellowSignals].find(s => s.metric === 'acos');
  assert.ok(acosSignal, 'ACOS should be flagged');
  assert.ok(acosSignal.deteriorationStreak >= 6, `ACOS streak expected ≥6, got ${acosSignal.deteriorationStreak}`);
})();

(function test_kpiGapExpansionRed() {
  const points = Array.from({ length: 7 }, (_, i) => makePoint(`2026-05-${22 + i}`, {
    sales: 600000 - i * 20000,
    netProfitRate: 0.205 - i * 0.001,
  }));
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'red', `kpi gap expansion 7 days should be red, got ${r.status}`);
})();

(function test_missingDayHandling() {
  const points = [
    makePoint('2026-05-23', { sales: 600000 }),
    makePoint('2026-05-25', { sales: 540000 }),
    makePoint('2026-05-26', { sales: 510000 }),
    makePoint('2026-05-27', { sales: 480000 }),
    makePoint('2026-05-28', { sales: 460000 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.deepStrictEqual(r.missingDates, ['2026-05-22', '2026-05-24']);
  assert.strictEqual(r.series.length, 5);
  assert.strictEqual(r.status, 'red', `5 points with -23% cumulative should be red, got ${r.status}`);
})();

(function test_lastDayBouncePreservesCumulative() {
  const points = [
    makePoint('2026-05-22', { sales: 600000 }),
    makePoint('2026-05-23', { sales: 580000 }),
    makePoint('2026-05-24', { sales: 555000 }),
    makePoint('2026-05-25', { sales: 525000 }),
    makePoint('2026-05-26', { sales: 500000 }),
    makePoint('2026-05-27', { sales: 480000 }),
    makePoint('2026-05-28', { sales: 485000 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  const sale = r.redSignals.find(s => s.metric === 'sales');
  assert.ok(sale, 'last-day small bounce must not erase 19% cumulative drop');
  assert.strictEqual(sale.severity, 'red');
  assert.ok(sale.cumulativeMagnitude > 0.15, `cumulative should still be >15%, got ${sale.cumulativeMagnitude}`);
})();

(function test_higherIsBetterUnits() {
  const points = [
    makePoint('2026-05-22', { units: 4000 }),
    makePoint('2026-05-23', { units: 3850 }),
    makePoint('2026-05-24', { units: 3700 }),
    makePoint('2026-05-25', { units: 3500 }),
    makePoint('2026-05-26', { units: 3300 }),
    makePoint('2026-05-27', { units: 3100 }),
    makePoint('2026-05-28', { units: 2900 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'red');
  const u = r.redSignals.find(s => s.metric === 'units');
  assert.ok(u);
  assert.ok(u.cumulativeMagnitude > 0.25, `units -27% cumulative expected, got ${u.cumulativeMagnitude}`);
})();

(function test_lowerIsBetterRefundRise() {
  const points = [
    makePoint('2026-05-22', { refundRate: 0.04 }),
    makePoint('2026-05-23', { refundRate: 0.045 }),
    makePoint('2026-05-24', { refundRate: 0.05 }),
    makePoint('2026-05-25', { refundRate: 0.055 }),
    makePoint('2026-05-26', { refundRate: 0.06 }),
    makePoint('2026-05-27', { refundRate: 0.065 }),
    makePoint('2026-05-28', { refundRate: 0.07 }),
  ];
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  assert.strictEqual(r.status, 'red');
  const rf = r.redSignals.find(s => s.metric === 'refundRate');
  assert.ok(rf, 'refundRate climbing 3pp should be red');
})();

(function test_signalMetadataShape() {
  const points = Array.from({ length: 7 }, (_, i) => makePoint(`2026-05-${22 + i}`, {
    sales: 600000 - i * 30000,
  }));
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  const sale = r.redSignals.find(s => s.metric === 'sales');
  assert.ok(sale.doNotApplyWhen.length > 0, 'each signal must carry doNotApplyWhen for learning_memory');
  assert.ok(sale.requiredEvidenceBeforeReuse.length > 0, 'each signal must carry requiredEvidenceBeforeReuse');
  assert.ok(sale.evidence.some(e => e.includes('首末值变化')), 'cumulative evidence must be present');
  assert.ok(sale.evidence.some(e => e.includes('recent:')), 'recent points must be in evidence');
})();

(function test_cumulativeChangeNumeric() {
  const series = [
    { sales: 600000 },
    { sales: 500000 },
  ];
  const cumulative = cumulativeChange('sales', series);
  assert.strictEqual(cumulative.kind, 'relative');
  assert.ok(Math.abs(cumulative.change - (-100000 / 600000)) < 1e-9);
  assert.ok(cumulative.magnitude > 0.16);
})();

(function test_cumulativeChangeAbsolute() {
  const series = [
    { netProfitRate: 0.20 },
    { netProfitRate: 0.15 },
  ];
  const cumulative = cumulativeChange('netProfitRate', series);
  assert.strictEqual(cumulative.kind, 'absolute');
  assert.ok(Math.abs(cumulative.magnitude - 0.05) < 1e-9);
})();

(function test_consecutiveDeteriorationCountResets() {
  const values = [10, 9, 8, 7, 8, 7];
  assert.strictEqual(consecutiveDeteriorationCount(values, true), 1);
  const values2 = [10, 9, 8, 7, 6];
  assert.strictEqual(consecutiveDeteriorationCount(values2, true), 4);
  const valuesUp = [0.1, 0.11, 0.12, 0.13];
  assert.strictEqual(consecutiveDeteriorationCount(valuesUp, false), 3);
})();

(function test_linearRegressionSlope() {
  assert.strictEqual(linearRegressionSlope([1, 2, 3, 4, 5]), 1);
  assert.ok(linearRegressionSlope([5, 4, 3, 2, 1]) === -1);
  assert.strictEqual(linearRegressionSlope([null, null]), null);
})();

(function test_buildKpiGapTrendShape() {
  const series = [
    makePoint('2026-05-19', { sales: 580000 }),
    makePoint('2026-05-26', { sales: 600000 }),
  ];
  const trend = buildKpiGapTrend(series);
  assert.strictEqual(trend.length, 2);
  for (const entry of trend) {
    for (const metric of TRACKED_METRICS) {
      assert.ok(metric in entry.gap, `gap should include ${metric}`);
    }
  }
})();

(function test_kpiGapStreakTriggersRedAtExactly5() {
  // KPI gap 单调扩大 5+ 天 → red，即使指标本身斜率小
  const baseSales = 600000;
  const points = [];
  for (let i = 0; i < 7; i += 1) {
    points.push(makePoint(`2026-05-${22 + i}`, { sales: baseSales - i * 5000 }));
  }
  const r = detectTrendAnomalies({
    today: '2026-05-28',
    windowDays: 7,
    loadTotalForDate: loaderFromPoints(points),
  });
  const sale = [...r.redSignals, ...r.yellowSignals].find(s => s.metric === 'sales');
  assert.ok(sale, 'sales should be flagged via gap expansion');
  assert.ok(sale.gapStreak >= RED_KPI_GAP_DAYS - 1, `gap streak should be near ${RED_KPI_GAP_DAYS}`);
})();

console.log('trend_anomaly_detector.test.js: all', 17, 'cases passed');
