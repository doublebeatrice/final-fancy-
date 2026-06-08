const fs = require('fs');
const path = require('path');
const { buildSummary } = require('../scripts/execute/quick_daily_core_summary');
const { KPI_FINAL_TARGET, KPI_TRAJECTORY } = require('./proactive_audit');

const ROOT = path.join(__dirname, '..');

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_LOOKBACK_LIMIT_DAYS = 21;
const MIN_POINTS_FOR_TREND = 3;

const HIGHER_IS_BETTER_METRICS = ['sales', 'units', 'netProfitRate'];
const LOWER_IS_BETTER_METRICS = ['adCostShare', 'acos', 'refundRate'];
const TRACKED_METRICS = [...HIGHER_IS_BETTER_METRICS, ...LOWER_IS_BETTER_METRICS];

const RED_THRESHOLDS = {
  sales:         { kind: 'relative_slope', yellow: 0.01,  red: 0.03,  cumulativeYellow: 0.05,  cumulativeRed: 0.12  },
  units:         { kind: 'relative_slope', yellow: 0.01,  red: 0.03,  cumulativeYellow: 0.05,  cumulativeRed: 0.12  },
  netProfitRate: { kind: 'absolute_slope', yellow: 0.002, red: 0.005, cumulativeYellow: 0.008, cumulativeRed: 0.02  },
  adCostShare:   { kind: 'absolute_slope', yellow: 0.002, red: 0.005, cumulativeYellow: 0.008, cumulativeRed: 0.02  },
  acos:          { kind: 'absolute_slope', yellow: 0.004, red: 0.01,  cumulativeYellow: 0.015, cumulativeRed: 0.03  },
  refundRate:    { kind: 'absolute_slope', yellow: 0.002, red: 0.005, cumulativeYellow: 0.008, cumulativeRed: 0.02  },
};

const RED_KPI_GAP_DAYS = 5;
const YELLOW_DETERIORATION_DAYS = 3;
const RED_DETERIORATION_DAYS = 3;

function text(value) {
  return String(value ?? '').trim();
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function shiftDate(yyyyMmDd, dayOffset) {
  const date = new Date(`${yyyyMmDd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function todayChinaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function relativePath(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function linearRegressionSlope(values) {
  const points = values
    .map((value, index) => ({ index, value }))
    .filter(point => isNumber(point.value));
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.index, 0);
  const sumY = points.reduce((s, p) => s + p.value, 0);
  const sumXY = points.reduce((s, p) => s + p.index * p.value, 0);
  const sumX2 = points.reduce((s, p) => s + p.index * p.index, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function consecutiveDeteriorationCount(values, higherIsBetter) {
  let count = 0;
  let lastSeen = null;
  for (const value of values) {
    if (!isNumber(value)) continue;
    if (lastSeen === null) {
      lastSeen = value;
      continue;
    }
    const isDeteriorating = higherIsBetter ? value < lastSeen : value > lastSeen;
    if (isDeteriorating) {
      count += 1;
    } else {
      count = 0;
    }
    lastSeen = value;
  }
  return count;
}

function readJson(file, fallback = null) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (_) {
    return fallback;
  }
}

function loadTotalAccountForDate(date, options = {}) {
  if (typeof options.loadTotalForDate === 'function') {
    return options.loadTotalForDate(date) || null;
  }
  try {
    const summary = buildSummary({ date, rawDir: options.rawDir });
    const total = summary.totalAccount || {};
    if (!total || total.sales === null || total.sales === undefined) return null;
    return {
      date,
      sales: isNumber(total.sales) ? total.sales : null,
      units: isNumber(total.units) ? total.units : null,
      netProfitRate: isNumber(total.netProfitRate) ? total.netProfitRate : null,
      adCostShare: isNumber(total.adCostShare) ? total.adCostShare : null,
      acos: isNumber(total.acos) ? total.acos : null,
      refundRate: isNumber(total.refundRate) ? total.refundRate : null,
      sourceFile: relativePath(summary.files?.salesCore || ''),
    };
  } catch (_) {
    return null;
  }
}

function buildSeries(today, windowDays, options = {}) {
  const lookbackLimit = Math.max(windowDays, options.lookbackLimitDays || DEFAULT_LOOKBACK_LIMIT_DAYS);
  const series = [];
  let dayOffset = 0;
  while (series.length < windowDays && dayOffset < lookbackLimit) {
    const date = shiftDate(today, -dayOffset);
    dayOffset += 1;
    const point = loadTotalAccountForDate(date, options);
    if (!point) continue;
    series.push(point);
    if (series.length >= windowDays) break;
  }
  series.reverse();
  return series;
}

function findKpiTrajectoryAt(date) {
  const sorted = [...KPI_TRAJECTORY].sort((a, b) => a.date.localeCompare(b.date));
  let prev = null;
  for (const point of sorted) {
    if (point.date <= date) prev = point;
    else if (!prev) prev = point;
    else break;
  }
  return prev || sorted[0];
}

function gapForMetric(metric, current, target) {
  if (!isNumber(current) || !isNumber(target)) return null;
  if (HIGHER_IS_BETTER_METRICS.includes(metric)) {
    return Math.max(0, target - current);
  }
  return Math.max(0, current - target);
}

function buildKpiGapTrend(series) {
  return series.map(point => {
    const trajectory = findKpiTrajectoryAt(point.date) || {};
    const gap = {};
    for (const metric of TRACKED_METRICS) {
      const target = trajectory[metric];
      gap[metric] = gapForMetric(metric, point[metric], target);
    }
    return { date: point.date, gap };
  });
}

function consecutiveGapExpansionCount(gapTrend, metric) {
  let count = 0;
  let lastSeen = null;
  for (const entry of gapTrend) {
    const value = entry.gap?.[metric];
    if (!isNumber(value)) continue;
    if (lastSeen === null) {
      lastSeen = value;
      continue;
    }
    if (value > lastSeen) count += 1;
    else count = 0;
    lastSeen = value;
  }
  return count;
}

function cumulativeChange(metric, series) {
  const valid = (series || []).map(point => point[metric]).filter(isNumber);
  if (valid.length < 2) return { change: 0, magnitude: 0, kind: 'absolute' };
  const first = valid[0];
  const last = valid[valid.length - 1];
  const higherIsBetter = HIGHER_IS_BETTER_METRICS.includes(metric);
  const thresholds = RED_THRESHOLDS[metric] || { kind: 'absolute_slope' };
  if (thresholds.kind === 'relative_slope') {
    if (first === 0) return { change: 0, magnitude: 0, kind: 'relative' };
    const change = (last - first) / first;
    const isBad = higherIsBetter ? change < 0 : change > 0;
    return { change, magnitude: isBad ? Math.abs(change) : 0, kind: 'relative' };
  }
  const change = last - first;
  const isBad = higherIsBetter ? change < 0 : change > 0;
  return { change, magnitude: isBad ? Math.abs(change) : 0, kind: 'absolute' };
}

function classifySignal(metric, slope, deteriorationStreak, gapStreak, series) {
  const thresholds = RED_THRESHOLDS[metric] || { kind: 'absolute_slope', yellow: 0, red: 0 };
  const higherIsBetter = HIGHER_IS_BETTER_METRICS.includes(metric);
  const slopeSign = isNumber(slope) ? slope : 0;
  const slopeIsBad = higherIsBetter ? slopeSign < 0 : slopeSign > 0;

  let slopeMagnitude;
  if (thresholds.kind === 'relative_slope') {
    const validValues = (series || []).map(point => point[metric]).filter(isNumber);
    const avgValue = validValues.length
      ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
      : 0;
    slopeMagnitude = avgValue > 0 ? Math.abs(slopeSign) / avgValue : 0;
  } else {
    slopeMagnitude = Math.abs(slopeSign);
  }

  const slopeBeyondRed = slopeIsBad && slopeMagnitude >= thresholds.red;
  const slopeBeyondYellow = slopeIsBad && slopeMagnitude >= thresholds.yellow;

  const cumulative = cumulativeChange(metric, series);
  const cumulativeRed = thresholds.cumulativeRed != null && cumulative.magnitude >= thresholds.cumulativeRed;
  const cumulativeYellow = thresholds.cumulativeYellow != null && cumulative.magnitude >= thresholds.cumulativeYellow;

  if (deteriorationStreak >= RED_DETERIORATION_DAYS && slopeBeyondRed) return 'red';
  if (gapStreak >= RED_KPI_GAP_DAYS) return 'red';
  if (cumulativeRed) return 'red';
  if (deteriorationStreak >= YELLOW_DETERIORATION_DAYS && slopeBeyondYellow) return 'yellow';
  if (gapStreak >= YELLOW_DETERIORATION_DAYS) return 'yellow';
  if (cumulativeYellow) return 'yellow';
  return 'green';
}

function describeMetric(metric) {
  switch (metric) {
    case 'sales': return '销售额';
    case 'units': return '销量';
    case 'netProfitRate': return '净利率';
    case 'adCostShare': return '广告费占比';
    case 'acos': return 'ACOS';
    case 'refundRate': return '退货率';
    default: return metric;
  }
}

function fmtMetric(metric, value) {
  if (!isNumber(value)) return '-';
  if (metric === 'sales') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (metric === 'units') return Math.round(value).toLocaleString('en-US');
  return `${(value * 100).toFixed(2)}%`;
}

function buildSignalEntry(metric, severity, slope, deteriorationStreak, gapStreak, series, gapTrend) {
  const higherIsBetter = HIGHER_IS_BETTER_METRICS.includes(metric);
  const evidence = [];
  if (deteriorationStreak > 0) {
    evidence.push(`连续 ${deteriorationStreak} 天${higherIsBetter ? '下滑' : '走高'} (${describeMetric(metric)})`);
  }
  if (isNumber(slope)) {
    evidence.push(`slope=${slope.toFixed(metric === 'sales' || metric === 'units' ? 2 : 4)}`);
  }
  const cumulative = cumulativeChange(metric, series);
  if (cumulative.magnitude > 0) {
    if (cumulative.kind === 'relative') {
      evidence.push(`首末值变化 ${(cumulative.change * 100).toFixed(2)}%`);
    } else {
      evidence.push(`首末值变化 ${(cumulative.change * 100).toFixed(2)} pp`);
    }
  }
  if (gapStreak > 0) {
    evidence.push(`KPI gap 连续 ${gapStreak} 天扩大`);
  }
  const recent = series.slice(-Math.min(series.length, 5)).map(point => `${point.date}=${fmtMetric(metric, point[metric])}`);
  if (recent.length) evidence.push(`recent: ${recent.join(' → ')}`);
  return {
    metric,
    severity,
    slope: isNumber(slope) ? slope : null,
    deteriorationStreak,
    gapStreak,
    cumulativeMagnitude: cumulative.magnitude,
    evidence,
    doNotApplyWhen: [
      `metric=${metric}: stop traffic-push, bid-up, budget-up actions until trend stabilizes`,
    ],
    requiredEvidenceBeforeReuse: [
      `${describeMetric(metric)} 至少需要 2 天稳定或回升的证据，并核对真实 sales_core 数据，避免以"广告动作量"代替结果证明`,
    ],
  };
}

function aggregateOverallStatus(signals, seriesPoints) {
  if (!signals.length) {
    if (seriesPoints < MIN_POINTS_FOR_TREND) return 'insufficient_data';
    return 'green';
  }
  if (signals.some(item => item.severity === 'red')) return 'red';
  if (signals.some(item => item.severity === 'yellow')) return 'yellow';
  return 'green';
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Trend Anomaly Report ${report.today}`);
  lines.push('');
  lines.push(`Status: **${report.status.toUpperCase()}**`);
  lines.push(`Window: 最近 ${report.windowDays} 天目标，实际收集 ${report.series.length} 个数据点`);
  if (report.missingDates?.length) {
    lines.push(`Missing dates: ${report.missingDates.join(', ')}`);
  }
  lines.push('');
  if (report.status === 'insufficient_data') {
    lines.push('数据点不足以判定趋势（最少需要 3 个连续日的 sales_core_7d 文件）。');
    lines.push('请补齐近 7 天的 `seller_sales_core_7d_<date>.json`，再重新运行。');
    return lines.join('\n');
  }
  if (report.redSignals.length) {
    lines.push('## Red Signals (硬阻断 unattended)');
    for (const signal of report.redSignals) {
      lines.push(`- **${describeMetric(signal.metric)}**: ${signal.evidence.join('; ')}`);
    }
    lines.push('');
  }
  if (report.yellowSignals.length) {
    lines.push('## Yellow Signals (警告)');
    for (const signal of report.yellowSignals) {
      lines.push(`- **${describeMetric(signal.metric)}**: ${signal.evidence.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Series');
  lines.push(`| date | ${TRACKED_METRICS.map(describeMetric).join(' | ')} |`);
  lines.push(`| --- | ${TRACKED_METRICS.map(() => '---').join(' | ')} |`);
  for (const point of report.series) {
    const cells = TRACKED_METRICS.map(metric => fmtMetric(metric, point[metric]));
    lines.push(`| ${point.date} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('## KPI Gap Trend');
  lines.push(`| date | ${TRACKED_METRICS.map(describeMetric).join(' | ')} |`);
  lines.push(`| --- | ${TRACKED_METRICS.map(() => '---').join(' | ')} |`);
  for (const entry of report.kpiGapTrend) {
    const cells = TRACKED_METRICS.map(metric => fmtMetric(metric, entry.gap?.[metric]));
    lines.push(`| ${entry.date} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('Sources:');
  for (const file of report.sources) lines.push(`- ${file}`);
  return lines.join('\n');
}

function detectTrendAnomalies(options = {}) {
  const today = options.today || todayChinaDate();
  const windowDays = Math.max(MIN_POINTS_FOR_TREND, Number(options.windowDays || DEFAULT_WINDOW_DAYS));
  const series = options.series || buildSeries(today, windowDays, options);

  const allDates = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    allDates.push(shiftDate(today, -offset));
  }
  const presentDates = new Set(series.map(point => point.date));
  const missingDates = allDates.filter(date => !presentDates.has(date));

  const sources = [...new Set(series.map(point => point.sourceFile).filter(Boolean))];

  if (series.length < MIN_POINTS_FOR_TREND) {
    const report = {
      today,
      windowDays,
      status: 'insufficient_data',
      redSignals: [],
      yellowSignals: [],
      series,
      kpiGapTrend: [],
      missingDates,
      sources,
      generatedAt: new Date().toISOString(),
    };
    report.markdown = renderMarkdown(report);
    return report;
  }

  const kpiGapTrend = buildKpiGapTrend(series);

  const signals = [];
  for (const metric of TRACKED_METRICS) {
    const values = series.map(point => point[metric]);
    const slope = linearRegressionSlope(values);
    const higherIsBetter = HIGHER_IS_BETTER_METRICS.includes(metric);
    const deteriorationStreak = consecutiveDeteriorationCount(values, higherIsBetter);
    const gapStreak = consecutiveGapExpansionCount(kpiGapTrend, metric);
    const severity = classifySignal(metric, slope, deteriorationStreak, gapStreak, series);
    if (severity !== 'green') {
      signals.push(buildSignalEntry(metric, severity, slope, deteriorationStreak, gapStreak, series, kpiGapTrend));
    }
  }

  const status = aggregateOverallStatus(signals, series.length);
  const redSignals = signals.filter(item => item.severity === 'red');
  const yellowSignals = signals.filter(item => item.severity === 'yellow');

  const report = {
    today,
    windowDays,
    status,
    redSignals,
    yellowSignals,
    series,
    kpiGapTrend,
    missingDates,
    sources,
    kpiFinalTarget: KPI_FINAL_TARGET,
    generatedAt: new Date().toISOString(),
  };
  report.markdown = renderMarkdown(report);
  return report;
}

module.exports = {
  detectTrendAnomalies,
  TRACKED_METRICS,
  HIGHER_IS_BETTER_METRICS,
  LOWER_IS_BETTER_METRICS,
  RED_THRESHOLDS,
  MIN_POINTS_FOR_TREND,
  RED_KPI_GAP_DAYS,
  RED_DETERIORATION_DAYS,
  YELLOW_DETERIORATION_DAYS,
  buildSeries,
  buildKpiGapTrend,
  linearRegressionSlope,
  consecutiveDeteriorationCount,
  consecutiveGapExpansionCount,
  cumulativeChange,
  loadTotalAccountForDate,
  classifySignal,
  renderMarkdown,
};
