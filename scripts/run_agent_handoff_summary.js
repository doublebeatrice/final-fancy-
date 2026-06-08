const fs = require('fs');
const path = require('path');
const { buildOpsTimeContext } = require('../src/ops_time');
const { buildKpiAudit, KPI_TRAJECTORY } = require('../src/proactive_audit');
const { buildDailyOperatingWorkflow } = require('../src/agent_daily_workflow');
const { normalizeMandatoryDailyClosure } = require('../src/daily_mandatory_closure');

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

function daysBetweenDateStrings(from, to) {
  const a = text(from);
  const b = text(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function addDays(ymd = '', days = 0) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
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

function readJsonIfExists(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return readJson(file, fallback);
}

function resolveDefaultAdjustmentsFile(today = '') {
  const dir = path.join(ROOT, 'data', 'adjustments');
  const todayFile = today ? path.join(dir, `adjustments_${today}.json`) : '';
  if (todayFile && fs.existsSync(todayFile)) return todayFile;
  try {
    const files = fs.readdirSync(dir)
      .filter(name => /^adjustments_\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map(name => {
        const file = path.join(dir, name);
        return { file, mtimeMs: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files[0]?.file || todayFile;
  } catch (error) {
    return todayFile;
  }
}

function resolveDefaultAdjustmentFiles(today = '', businessDate = '') {
  const dir = path.join(ROOT, 'data', 'adjustments');
  const direct = [today, businessDate]
    .map(date => dateOnly(date))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map(date => path.join(dir, `adjustments_${date}.json`));
  const existing = [...new Set(direct)].filter(file => fs.existsSync(file));
  if (existing.length) return existing;
  const fallback = resolveDefaultAdjustmentsFile(today || businessDate);
  return fallback ? [fallback] : [];
}

function readAdjustmentFiles(files = []) {
  const merged = [];
  const seen = new Set();
  for (const file of files) {
    const rows = readJson(file, []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = [
        text(row.sourceRunId),
        text(row.entityType),
        text(row.entityId),
        text(row.actionType),
        text(row.runAt),
        text(row.outcome),
        row.dryRun === true ? 'dry' : 'live',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

function resolveDailyDepositStatusFile(today = '') {
  const [, month, day] = text(today).match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  if (!month || !day) return '';
  const direct = path.join(ROOT, '黄成喆个人数据趋势', '原数据', '原日数据', `${Number(month)}-${Number(day)}`, `daily_deposit_status_${today}.json`);
  if (fs.existsSync(direct)) return direct;
  const trendRoot = path.join(ROOT, '黄成喆个人数据趋势');
  if (!fs.existsSync(trendRoot)) return direct;
  const stack = [trendRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === `daily_deposit_status_${today}.json`) return full;
    }
  }
  return direct;
}

function resolvePreviousRecoveryTarget(businessDate = '', outDir = DEFAULT_OUT_DIR) {
  const date = dateOnly(businessDate);
  let candidates = [];
  try {
    candidates = fs.readdirSync(outDir)
      .filter(name => /^agent_handoff_\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map(name => path.join(outDir, name));
  } catch (error) {
    return null;
  }
  const matches = [];
  for (const file of candidates) {
    const json = readJsonIfExists(file, {});
    const target = json.kpiSummary?.recoveryPace?.nextBusinessDayTarget;
    if (target && dateOnly(target.businessDate) === date) {
      matches.push({
        file,
        generatedAt: text(json.generatedAt),
        localDate: text(json.localDate || json.businessDate),
        target,
      });
    }
  }
  matches.sort((a, b) => {
    const generated = text(b.generatedAt).localeCompare(text(a.generatedAt));
    if (generated !== 0) return generated;
    return text(b.localDate).localeCompare(text(a.localDate));
  });
  return matches[0]?.target || null;
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function countBy(items = [], keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function shortLine(value, max = 120) {
  const raw = text(value).replace(/\s+/g, ' ');
  return raw.length > max ? `${raw.slice(0, max - 1)}...` : raw;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInteger(value) {
  return num(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(value, digits = 2) {
  return `${formatNumber(num(value) * 100, digits)}%`;
}

function formatPp(value, digits = 2) {
  return `${formatNumber(num(value) * 100, digits)}pp`;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function firstTrajectoryTarget() {
  return Array.isArray(KPI_TRAJECTORY) && KPI_TRAJECTORY.length ? KPI_TRAJECTORY[0] : null;
}

function trajectoryTargetOnOrBefore(businessDate = '') {
  if (!Array.isArray(KPI_TRAJECTORY) || !KPI_TRAJECTORY.length) return null;
  const date = text(businessDate);
  if (!date) return firstTrajectoryTarget();
  const due = KPI_TRAJECTORY.filter(item => text(item.date) <= date);
  return due.length ? due[due.length - 1] : firstTrajectoryTarget();
}

function trajectoryTargetAfter(businessDate = '') {
  if (!Array.isArray(KPI_TRAJECTORY) || !KPI_TRAJECTORY.length) return null;
  const date = text(businessDate);
  if (!date) return KPI_TRAJECTORY[1] || null;
  return KPI_TRAJECTORY.find(item => text(item.date) > date) || null;
}

function kpiGapForTarget(target = {}, current = {}) {
  if (!target || !target.date) return null;
  return {
    date: target.date,
    target,
    salesGap: minGap(target.sales, current.sales),
    unitsGap: minGap(target.units, current.units),
    netProfitRateGap: minGap(target.netProfitRate, current.netProfitRate),
    adCostShareGap: maxGap(current.adCostShare, target.adCostShare),
    acosGap: maxGap(current.acos, target.acos),
    refundRateGap: maxGap(current.refundRate, target.refundRate),
  };
}

function dailyRecoveryPace(gap = {}, fromDate = '') {
  const targetDate = text(gap.date || gap.target?.date);
  const days = daysBetweenDateStrings(fromDate, targetDate);
  const remainingDays = days !== null ? Math.max(1, days) : null;
  if (!remainingDays) return null;
  return {
    targetDate,
    remainingDays,
    salesPerDay: round(num(gap.salesGap) / remainingDays, 2),
    unitsPerDay: round(num(gap.unitsGap) / remainingDays, 2),
    estimatedNetProfitPerDay: gap.estimatedNetProfitGap !== undefined
      ? round(num(gap.estimatedNetProfitGap) / remainingDays, 2)
      : null,
  };
}

function nextBusinessDayTarget(current = {}, pace = {}, businessDate = '', checkpoint = {}) {
  if (!pace || !pace.targetDate) return null;
  const remainingDays = Math.max(1, num(pace.remainingDays, 1));
  return {
    businessDate: addDays(businessDate, 1),
    salesTarget: round(num(current.sales) + num(pace.salesPerDay), 2),
    unitsTarget: Math.ceil(num(current.units) + num(pace.unitsPerDay)),
    netProfitRateMin: round(num(current.netProfitRate) + (num(checkpoint.netProfitRateGap) / remainingDays), 4),
    acosMax: round(num(current.acos) - (num(checkpoint.acosGap) / remainingDays), 4),
    refundRateMax: round(num(current.refundRate) - (num(checkpoint.refundRateGap) / remainingDays), 4),
    adCostShareMax: round(num(checkpoint.target?.adCostShare ?? current.adCostShare), 4),
    estimatedNetProfitTarget: pace.estimatedNetProfitPerDay !== null && pace.estimatedNetProfitPerDay !== undefined
      ? round(num(current.estimatedNetProfit) + num(pace.estimatedNetProfitPerDay), 2)
      : null,
  };
}

function evaluateRecoveryGate(current = {}, target = {}, businessDate = '') {
  if (!target || !target.businessDate) return null;
  const targetBusinessDate = dateOnly(target.businessDate);
  const effectiveBusinessDate = dateOnly(businessDate);
  const salesGap = round(num(target.salesTarget) - num(current.sales), 2);
  const unitsGap = Math.ceil(num(target.unitsTarget) - num(current.units));
  const estimatedNetProfitGap = target.estimatedNetProfitTarget !== null && target.estimatedNetProfitTarget !== undefined
    ? round(num(target.estimatedNetProfitTarget) - num(current.estimatedNetProfit), 2)
    : null;
  const netProfitRateGap = target.netProfitRateMin !== null && target.netProfitRateMin !== undefined
    ? round(num(target.netProfitRateMin) - num(current.netProfitRate), 4)
    : null;
  const acosGap = target.acosMax !== null && target.acosMax !== undefined
    ? round(num(current.acos) - num(target.acosMax), 4)
    : null;
  const refundRateGap = target.refundRateMax !== null && target.refundRateMax !== undefined
    ? round(num(current.refundRate) - num(target.refundRateMax), 4)
    : null;
  const adCostShareGap = target.adCostShareMax !== null && target.adCostShareMax !== undefined
    ? round(num(current.adCostShare) - num(target.adCostShareMax), 4)
    : null;
  const due = effectiveBusinessDate >= targetBusinessDate;
  const passed = salesGap <= 0 &&
    unitsGap <= 0 &&
    (estimatedNetProfitGap === null || estimatedNetProfitGap <= 0) &&
    (netProfitRateGap === null || netProfitRateGap <= 0) &&
    (acosGap === null || acosGap <= 0) &&
    (refundRateGap === null || refundRateGap <= 0) &&
    (adCostShareGap === null || adCostShareGap <= 0);
  return {
    status: due ? (passed ? 'pass' : 'fail') : 'pending',
    targetBusinessDate,
    evaluatedBusinessDate: effectiveBusinessDate,
    target: {
      salesTarget: num(target.salesTarget),
      unitsTarget: num(target.unitsTarget),
      netProfitRateMin: target.netProfitRateMin ?? null,
      acosMax: target.acosMax ?? null,
      refundRateMax: target.refundRateMax ?? null,
      adCostShareMax: target.adCostShareMax ?? null,
      estimatedNetProfitTarget: target.estimatedNetProfitTarget ?? null,
    },
    actual: {
      sales: round(current.sales, 2),
      units: num(current.units),
      netProfitRate: round(current.netProfitRate, 4),
      acos: round(current.acos, 4),
      refundRate: round(current.refundRate, 4),
      adCostShare: round(current.adCostShare, 4),
      estimatedNetProfit: round(current.estimatedNetProfit, 2),
    },
    gap: {
      salesGap: Math.max(0, salesGap),
      unitsGap: Math.max(0, unitsGap),
      netProfitRateGap: netProfitRateGap === null ? null : Math.max(0, netProfitRateGap),
      acosGap: acosGap === null ? null : Math.max(0, acosGap),
      refundRateGap: refundRateGap === null ? null : Math.max(0, refundRateGap),
      adCostShareGap: adCostShareGap === null ? null : Math.max(0, adCostShareGap),
      estimatedNetProfitGap: estimatedNetProfitGap === null ? null : Math.max(0, estimatedNetProfitGap),
    },
  };
}

function findSelectedSellerSummary(snapshot = {}) {
  const rows = Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows : [];
  return rows.find(row => text(row.seller_title) === '所选编号汇总') ||
    rows.find(row => text(row.seller_title).includes('所选编号汇总')) ||
    rows.find(row => text(row.sellerTitle) === '所选编号汇总') ||
    rows.find(row => text(row.sellerTitle).includes('所选编号汇总')) ||
    rows.filter(row => num(row.order_sales) > 0)
      .sort((a, b) => num(b.order_sales) - num(a.order_sales))[0] ||
    null;
}

function buildDataFreshnessSummary({ businessDate = '', dataDate = '', snapshot = {} } = {}) {
  const snapshotDataDate = dateOnly(snapshot.dataDate || snapshot.time?.dataDate || dataDate || businessDate);
  const effectiveBusinessDate = dateOnly(snapshot.businessDate || snapshot.time?.businessDate || businessDate);
  const lagDays = daysBetweenDateStrings(snapshotDataDate, effectiveBusinessDate);
  const warnings = [];
  if (lagDays === null) warnings.push('data_date_unparseable');
  if (lagDays !== null && lagDays < 0) warnings.push('data_date_after_business_date');
  if (lagDays !== null && lagDays > 1) warnings.push('data_lag_gt_1_day');
  const sellerSalesRows = Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows.length : 0;
  if (sellerSalesRows <= 0) warnings.push('seller_sales_rows_missing');
  const productCards = Array.isArray(snapshot.productCards) ? snapshot.productCards.length : 0;
  if (productCards <= 0) warnings.push('product_cards_missing');
  return {
    businessDate: effectiveBusinessDate,
    dataDate: snapshotDataDate,
    dataLagDays: lagDays,
    snapshotStale: lagDays !== null && lagDays > 1,
    status: warnings.length ? 'warning' : (lagDays === 0 ? 'same_day' : 'previous_day'),
    sellerSalesRows,
    productCards,
    warnings,
  };
}

function dataFreshnessMarkdownLines(dataFreshness = {}) {
  const warnings = dataFreshness.warnings || [];
  return [
    '## 数据质量',
    `- 数据时效：businessDate ${dataFreshness.businessDate || ''}；dataDate ${dataFreshness.dataDate || ''}；滞后 ${dataFreshness.dataLagDays ?? 'unknown'} 天；状态 ${dataFreshness.status || 'unknown'}。`,
    `- 快照覆盖：sellerSalesRows ${dataFreshness.sellerSalesRows ?? 0}；productCards ${dataFreshness.productCards ?? 0}。`,
    warnings.length
      ? `- 警告：${warnings.join('；')}。`
      : '- 警告：暂无。',
    '',
  ];
}

function buildOperatingStatus({ dataFreshness = {}, kpiSummary = {}, dailyOperatingWorkflow = {}, commandFailed = 0, writeFailed = 0, writeBlocked = 0 } = {}) {
  const warnings = [];
  if (commandFailed > 0) warnings.push('command_failed');
  if (writeFailed > 0) warnings.push('write_failed');
  if (writeBlocked > 0) warnings.push('write_blocked');
  if (dataFreshness.snapshotStale) warnings.push('snapshot_stale');
  if (dataFreshness.status === 'warning') warnings.push('data_quality_warning');
  if (kpiSummary.status === 'off_track') warnings.push('kpi_off_track');
  const workflowStatus = text(dailyOperatingWorkflow.status || '');
  const workflowBlockers = Array.isArray(dailyOperatingWorkflow.blockers) ? dailyOperatingWorkflow.blockers : [];
  if (workflowStatus === 'needs_recovery') warnings.push('daily_workflow_needs_recovery', ...workflowBlockers);
  let status = 'complete';
  if (commandFailed > 0 || writeFailed > 0 || writeBlocked > 0) status = 'blocked';
  else if (dataFreshness.snapshotStale || dataFreshness.status === 'warning') status = 'partial';
  else if (workflowStatus === 'needs_recovery') status = 'needs_recovery';
  else if (kpiSummary.status === 'off_track') status = 'needs_recovery';
  return {
    status,
    warnings: [...new Set(warnings)],
    reason: status === 'complete'
      ? 'pipeline_closed_and_kpi_not_off_track'
      : [...new Set(warnings)].join(';'),
  };
}

function operatingStatusMarkdownLines(operatingStatus = {}) {
  return [
    '## 闭环状态',
    `- 运营闭环：${operatingStatus.status || 'unknown'}；原因：${operatingStatus.reason || 'unknown'}。`,
    '',
  ];
}

function buildDailyClosureStatus({
  commandFailed = 0,
  writeFailed = 0,
  writeBlocked = 0,
  dataFreshnessStatus = '',
  snapshotStale = false,
  kpiStatus = '',
  operatingClosureStatus = '',
  recoveryGateStatus = '',
  depositStatus = '',
  depositMissingCount = 0,
  mandatoryDailyClosureOpen = 0,
  mandatoryDailyClosureResolved = true,
} = {}) {
  const reasons = [];
  if (commandFailed > 0) reasons.push('command_failed');
  if (writeFailed > 0) reasons.push('write_failed');
  if (writeBlocked > 0) reasons.push('write_blocked');
  if (depositStatus === 'blocked') reasons.push('deposit_blocked');
  if (depositStatus === 'partial') reasons.push('deposit_partial');
  if (depositMissingCount > 0) reasons.push('deposit_missing_raw');
  if (snapshotStale) reasons.push('snapshot_stale');
  if (dataFreshnessStatus === 'warning') reasons.push('data_quality_warning');
  if (kpiStatus === 'off_track') reasons.push('kpi_off_track');
  if (recoveryGateStatus === 'fail') reasons.push('recovery_gate_failed');
  if (operatingClosureStatus === 'blocked') reasons.push('operating_blocked');
  if (operatingClosureStatus === 'partial') reasons.push('operating_partial');
  if (operatingClosureStatus === 'needs_recovery') reasons.push('operating_needs_recovery');
  if (mandatoryDailyClosureOpen > 0 && mandatoryDailyClosureResolved !== true) reasons.push('mandatory_daily_closure_not_landed');

  const dailyClosureReasons = [...new Set(reasons)];
  let dailyClosureStatus = 'complete';
  if (commandFailed > 0 || writeFailed > 0 || writeBlocked > 0 || depositStatus === 'blocked' || operatingClosureStatus === 'blocked') {
    dailyClosureStatus = 'blocked';
  } else if (depositStatus === 'partial' || depositMissingCount > 0 || snapshotStale || dataFreshnessStatus === 'warning' || operatingClosureStatus === 'partial') {
    dailyClosureStatus = 'partial';
  } else if (kpiStatus === 'off_track' || recoveryGateStatus === 'fail' || operatingClosureStatus === 'needs_recovery' || (mandatoryDailyClosureOpen > 0 && mandatoryDailyClosureResolved !== true)) {
    dailyClosureStatus = 'needs_recovery';
  }
  return {
    dailyClosureStatus,
    dailyClosureReasons,
    dailyComplete: dailyClosureStatus === 'complete',
  };
}

function dailyClosureMarkdownLines(dailyClosure = {}) {
  if (!dailyClosure || !dailyClosure.dailyClosureStatus) return [];
  return [
    '## Daily Closure',
    `- dailyClosureStatus: ${dailyClosure.dailyClosureStatus}; dailyComplete=${dailyClosure.dailyComplete === true ? 'true' : 'false'}.`,
    dailyClosure.dailyClosureReasons?.length
      ? `- reasons: ${dailyClosure.dailyClosureReasons.join(', ')}`
      : '- reasons: none',
    '',
  ];
}

function mandatoryDailyClosureMarkdownLines(closure = {}) {
  if (!closure || closure.required !== true) return [];
  const categories = Array.isArray(closure.categories) ? closure.categories : [];
  return [
    '## Mandatory Daily Closure',
    `- status: ${closure.status || 'unknown'}; open=${Number(closure.openCount || 0)}; unresolved=${Number(closure.unresolvedCount || 0)}; resolved=${closure.resolved === true ? 'true' : 'false'}.`,
    ...(categories.length
      ? categories.map(item => `- ${item.label || item.key}: open ${Number(item.openCount || 0)}, resolved ${Number(item.resolvedCount || 0)}, unresolved ${Number(item.unresolvedCount || 0)}.`)
      : ['- categories: none']),
    '',
  ];
}

function dailyOperatingWorkflowMarkdownLines(workflow = {}) {
  if (!workflow || !workflow.status || workflow.status === 'not_required') return [];
  const allSku = workflow.allSku || {};
  const season = workflow.season || {};
  const effect = workflow.effectReview || {};
  const blockers = Array.isArray(workflow.blockers) && workflow.blockers.length
    ? workflow.blockers.join(', ')
    : 'none';
  return [
    '## 每日经营工作流',
    `- status: ${workflow.status}; required=${workflow.required === true ? 'true' : 'false'}; blockers: ${blockers}.`,
    `- 全体 SKU: ${allSku.status || 'unknown'}; totalSkus ${Number(allSku.totalSkus || 0)}; mustReview ${Number(allSku.mustReview || 0)}; marketMissing ${Number(allSku.marketMissing || 0)}; file ${path.basename(text(allSku.file || 'all_sku_operating_review.json'))}.`,
    `- 节日线: ${season.status || 'unknown'}; dryRunItems ${Number(season.dryRunItems || 0)}; autoAdCandidates ${Number(season.autoAdCandidates || 0)}; activeSeasonTasks ${Number(season.activeSeasonTasks || 0)}; riskItems ${Number(season.riskItems || 0)}.`,
    `- 等生效: ${effect.status || 'unknown'}; dueReviews ${Number(effect.dueReviews || 0)}; effectReviewTotal ${Number(effect.effectReviewTotal || 0)}; feedbackApplied ${Number(effect.feedbackApplied || 0)}.`,
    '',
  ];
}

function maxGap(current, target) {
  return round(Math.max(0, num(current) - num(target)), 4);
}

function minGap(target, current) {
  return round(Math.max(0, num(target) - num(current)), 4);
}

function buildKpiSummary(snapshot = {}, timeContext = {}) {
  const sourceRow = findSelectedSellerSummary(snapshot);
  if (!sourceRow) {
    return {
      hasKpi: false,
      status: 'missing',
      requiredMode: 'missing_sales_core_summary',
      warnings: ['sellerSalesRows selected summary missing'],
    };
  }

  const kpi = buildKpiAudit(snapshot, timeContext);
  const current = {
    sales: num(sourceRow.order_sales),
    units: num(sourceRow.sale_num),
    netProfitRate: num(sourceRow.net_profit),
    estimatedNetProfit: num(sourceRow.order_sales) * num(sourceRow.net_profit),
    refundRate: num(sourceRow.refund_percent),
    acos: num(sourceRow.ACOS),
    roas: num(sourceRow.ROAS),
    adCostShare: num(sourceRow.advCost),
    spShare: num(sourceRow.SP),
    adSpend: num(sourceRow.adv_spend),
    cpc: num(sourceRow.CPC),
    cps: num(sourceRow.CPS),
  };
  const effectiveBusinessDate = dateOnly(timeContext.businessDate || snapshot.businessDate || snapshot.time?.businessDate || '');
  const missedCheckpoint = kpiGapForTarget(trajectoryTargetOnOrBefore(effectiveBusinessDate), current);
  const nextCheckpoint = kpiGapForTarget(trajectoryTargetAfter(effectiveBusinessDate), current);
  const finalCheckpoint = {
    ...kpi.finalTarget,
    date: kpi.finalTarget?.target?.date || '2026-06-12',
  };
  const nextCheckpointPace = dailyRecoveryPace(nextCheckpoint, effectiveBusinessDate);
  const finalTargetPace = dailyRecoveryPace(finalCheckpoint, effectiveBusinessDate);
  const previousRecoveryTarget = timeContext.previousRecoveryTarget || null;

  return {
    hasKpi: true,
    status: kpi.status,
    requiredMode: kpi.requiredMode,
    sourceSellerTitle: text(sourceRow.seller_title || sourceRow.sellerTitle),
    current,
    missedCheckpoint,
    nextCheckpoint,
    recoveryPace: {
      nextCheckpoint: nextCheckpointPace,
      finalTarget: finalTargetPace,
      nextBusinessDayTarget: nextBusinessDayTarget(current, nextCheckpointPace, effectiveBusinessDate, nextCheckpoint),
      nextBusinessDayGate: evaluateRecoveryGate(current, previousRecoveryTarget, effectiveBusinessDate),
    },
    finalTarget: kpi.finalTarget,
  };
}

function kpiMarkdownLines(kpiSummary = {}) {
  if (!kpiSummary.hasKpi) {
    return [
      '## KPI 总账户',
      `- 状态：缺销售核心总账户汇总行；${(kpiSummary.warnings || []).join('；') || '无法计算月 KPI 缺口'}。`,
      '',
    ];
  }
  const current = kpiSummary.current || {};
  const checkpoint = kpiSummary.missedCheckpoint || {};
  const nextTarget = kpiSummary.nextCheckpoint?.target || {};
  const nextCheckpoint = kpiSummary.nextCheckpoint || {};
  const finalTarget = kpiSummary.finalTarget || {};
  const pace = kpiSummary.recoveryPace || {};
  return [
    '## KPI 总账户',
    `- 来源：${kpiSummary.sourceSellerTitle || '所选编号汇总'}；状态：${kpiSummary.status}；模式：${kpiSummary.requiredMode}。`,
    `- 当前：销售 ${formatNumber(current.sales)}；件数 ${formatInteger(current.units)}；净利率 ${formatPercent(current.netProfitRate)}；退货率 ${formatPercent(current.refundRate)}；ACOS ${formatPercent(current.acos)}；ROAS ${formatNumber(current.roas)}；广告占比 ${formatPercent(current.adCostShare)}；SP占比 ${formatPercent(current.spShare)}；广告花费 ${formatNumber(current.adSpend)}。`,
    checkpoint.date
      ? `- 已错过/需追回 ${checkpoint.date} 检查点：销售缺口 ${formatNumber(checkpoint.salesGap)}；件数缺口 ${formatInteger(checkpoint.unitsGap)}；净利率缺口 ${formatPp(checkpoint.netProfitRateGap)}；ACOS超出 ${formatPp(checkpoint.acosGap)}；退货超出 ${formatPp(checkpoint.refundRateGap)}。`
      : '- 检查点：未配置阶段目标。',
    nextTarget.date
      ? `- 下一检查点 ${nextTarget.date}：销售缺口 ${formatNumber(nextCheckpoint.salesGap)}；件数缺口 ${formatInteger(nextCheckpoint.unitsGap)}；ACOS超出 ${formatPp(nextCheckpoint.acosGap)}；退货超出 ${formatPp(nextCheckpoint.refundRateGap)}。`
      : '- 下一检查点：未配置。',
    `- 月终目标缺口：销售 ${formatNumber(finalTarget.salesGap)}；件数 ${formatInteger(finalTarget.unitsGap)}；净利率 ${formatPp(finalTarget.netProfitRateGap)}；净利润约 ${formatNumber(finalTarget.estimatedNetProfitGap)}；ACOS超出 ${formatPp(finalTarget.acosGap)}；退货超出 ${formatPp(finalTarget.refundRateGap)}。`,
    pace.nextCheckpoint
      ? `- 追回速度线：到 ${pace.nextCheckpoint.targetDate} 还剩 ${pace.nextCheckpoint.remainingDays} 天，需日均销售 ${formatNumber(pace.nextCheckpoint.salesPerDay)}、日均 ${formatNumber(pace.nextCheckpoint.unitsPerDay, 1)} 件。`
      : '- 追回速度线：下一检查点无法计算。',
    pace.nextBusinessDayTarget
      ? `- 下一业务日验收线（businessDate ${pace.nextBusinessDayTarget.businessDate}）：总销售至少 ${formatNumber(pace.nextBusinessDayTarget.salesTarget)}、件数至少 ${formatInteger(pace.nextBusinessDayTarget.unitsTarget)}、净利率至少 ${formatPercent(pace.nextBusinessDayTarget.netProfitRateMin)}、ACOS 不高于 ${formatPercent(pace.nextBusinessDayTarget.acosMax)}、退款率不高于 ${formatPercent(pace.nextBusinessDayTarget.refundRateMax)}、广告费率不高于 ${formatPercent(pace.nextBusinessDayTarget.adCostShareMax)}。`
      : '- 下一业务日验收线：无法计算。',
    pace.nextBusinessDayGate
      ? `- 上一验收线回查：${pace.nextBusinessDayGate.targetBusinessDate} ${pace.nextBusinessDayGate.status}；销售差 ${formatNumber(pace.nextBusinessDayGate.gap.salesGap)}；件数差 ${formatInteger(pace.nextBusinessDayGate.gap.unitsGap)}；净利率差 ${formatPp(pace.nextBusinessDayGate.gap.netProfitRateGap)}；ACOS 差 ${formatPp(pace.nextBusinessDayGate.gap.acosGap)}；退款率差 ${formatPp(pace.nextBusinessDayGate.gap.refundRateGap)}；广告费率差 ${formatPp(pace.nextBusinessDayGate.gap.adCostShareGap)}。`
      : '- 上一验收线回查：暂无可匹配的历史目标。',
    pace.finalTarget
      ? `- 月终速度线：到 ${pace.finalTarget.targetDate} 还剩 ${pace.finalTarget.remainingDays} 天，需日均销售 ${formatNumber(pace.finalTarget.salesPerDay)}、日均 ${formatNumber(pace.finalTarget.unitsPerDay, 1)} 件、日均净利润 ${formatNumber(pace.finalTarget.estimatedNetProfitPerDay)}。`
      : '- 月终速度线：无法计算。',
    '',
  ];
}

function taskLine(task = {}) {
  const title = shortLine(task.title || task.taskId || '未命名任务', 80);
  const step = shortLine(task.nextStep || task.description || '', 100);
  const parts = [
    text(task.priority || 'P2'),
    text(task.status || 'new'),
    text(task.workType || task.lane || ''),
  ].filter(Boolean).join(' / ');
  return `- ${title}（${parts}）${step ? `：${step}` : ''}`;
}

function resultLine(result = {}) {
  const status = result.ok === false ? '失败' : '完成';
  const summary = shortLine(result.summary || result.error || result.stderrSummary || result.stdoutSummary || '', 120);
  const files = list(result.outputFiles).slice(0, 2);
  return `- ${status}：${summary || text(result.label || result.command || result.taskId)}${files.length ? `；文件：${files.join('，')}` : ''}`;
}

function reviewLine(item = {}) {
  const verdict = text(item.verdict || item.report?.verdict || 'unknown');
  const nextStep = shortLine(item.nextStep || item.summary || item.report?.nextStep || '', 120);
  return `- ${verdict}：${nextStep || text(item.taskId || '')}`;
}

function effectReviewCoverageSummary({ hub = {}, effectReview = {}, reviewResults = [], workTypeCounts = {}, closureVerification = null } = {}) {
  const summary = effectReview.summary || {};
  const closureSummary = closureVerification?.summary || {};
  const results = Array.isArray(effectReview.results) ? effectReview.results : reviewResults;
  const byStatus = summary.byStatus || countBy(results, item => item.status || item.report?.status || 'unknown');
  const byVerdict = summary.byVerdict || countBy(results, item => item.verdict || item.report?.verdict || 'unknown');
  const dueReviews = Number(hub.summary?.dueReviews || workTypeCounts.due_effect_review || 0);
  const effectReviewTotal = Number(summary.total || results.length || 0);
  const feedbackApplied = Math.max(
    Number(hub.summary?.feedbackApplied || 0),
    Number(summary.feedbackApplied || 0),
    Number(summary.effectReviewFeedbackApplied || 0),
    Number(closureSummary.feedbackApplied || 0),
    Number(closureSummary.effectReviewFeedbackApplied || 0)
  );
  return {
    dueReviews,
    reviewQueueDue: Number(hub.summary?.reviewQueueDue || dueReviews || 0),
    effectReviewTotal,
    feedbackApplied,
    needsAction: Number(summary.needsAction || byStatus.needs_action || 0),
    blocked: Number(summary.blocked || byStatus.blocked || 0),
    continueWatch: Number(byVerdict.continue_watch || 0),
    closeRecommended: Number(byVerdict.close_success || byStatus.closed_recommended || 0),
  };
}

function effectReviewCoverageMarkdownLines(coverage = {}) {
  if (!coverage.dueReviews && !coverage.effectReviewTotal && !coverage.feedbackApplied) return [];
  return [
    '## Effect Review Coverage',
    `- dueReviews ${coverage.dueReviews}; reviewQueueDue ${coverage.reviewQueueDue}; effectReviewTotal ${coverage.effectReviewTotal}; feedbackApplied ${coverage.feedbackApplied}.`,
    `- needsAction ${coverage.needsAction}; blocked ${coverage.blocked}; continueWatch ${coverage.continueWatch}; closeRecommended ${coverage.closeRecommended}.`,
    '',
  ];
}

function adjustmentOutcome(item = {}) {
  return text(item.outcome || item.status || item.result || 'unknown') || 'unknown';
}

function summarizeAdjustmentLedger(adjustments = [], businessDate = '', options = {}) {
  const allRows = Array.isArray(adjustments)
    ? adjustments
    : [];
  const acceptedBusinessDates = [...new Set([
    businessDate,
    ...(Array.isArray(options.acceptedBusinessDates) ? options.acceptedBusinessDates : []),
  ].map(date => text(date)).filter(Boolean))];
  const filteredRows = allRows.filter(item => {
    if (!acceptedBusinessDates.length) return true;
    const rowBusinessDate = text(item.businessDate);
    if (!rowBusinessDate) return true;
    return acceptedBusinessDates.includes(rowBusinessDate);
  });
  const fallbackUsed = options.fallbackToLatest === true && acceptedBusinessDates.length > 0 && filteredRows.length === 0 && allRows.length > 0;
  const rows = fallbackUsed ? allRows : filteredRows;
  const liveRows = rows.filter(item => item.dryRun !== true);
  const candidates = liveRows.length ? liveRows : rows;
  const acceptedRunDates = [...new Set(
    (Array.isArray(options.acceptedRunDates) ? options.acceptedRunDates : [])
      .map(date => text(date))
      .filter(Boolean)
  )];
  const totalRowsForRunDate = acceptedRunDates.length
    ? candidates.filter(item => {
        const runDate = text(item.localDate || dateOnly(item.runAt));
        return acceptedRunDates.includes(runDate);
      })
    : candidates;
  if (!candidates.length) {
    return {
      hasAdjustments: false,
      totalRows: rows.length,
      latestRunId: '',
      latestRunRows: 0,
      fallbackUsed,
      outcomeCounts: {},
      successCount: 0,
      failedCount: 0,
      manualReviewCount: 0,
      skippedCount: 0,
      sample: [],
    };
  }

  const ordered = [...candidates].sort((a, b) => text(a.runAt).localeCompare(text(b.runAt)));
  const latest = ordered[ordered.length - 1] || {};
  const latestRunId = text(latest.sourceRunId);
  const latestRunAt = text(latest.runAt);
  const latestRunRows = candidates.filter(item => {
    if (latestRunId) return text(item.sourceRunId) === latestRunId;
    return text(item.runAt) === latestRunAt;
  });
  const outcomeCounts = countBy(latestRunRows, adjustmentOutcome);
  const totalOutcomeCounts = countBy(totalRowsForRunDate, adjustmentOutcome);
  const successCount = latestRunRows.filter(item => ['success', 'api_success', 'verified_landed'].includes(adjustmentOutcome(item))).length;
  const failedCount = latestRunRows.filter(item => /fail|error|blocked|not_landed/i.test(adjustmentOutcome(item))).length;
  const manualReviewCount = latestRunRows.filter(item => adjustmentOutcome(item) === 'manual_review').length;
  const skippedCount = latestRunRows.filter(item => /^skipped/.test(adjustmentOutcome(item))).length;
  const totalSuccessCount = totalRowsForRunDate.filter(item => ['success', 'api_success', 'verified_landed'].includes(adjustmentOutcome(item))).length;
  const totalFailedCount = totalRowsForRunDate.filter(item => /fail|error|blocked|not_landed/i.test(adjustmentOutcome(item))).length;
  const totalManualReviewCount = totalRowsForRunDate.filter(item => adjustmentOutcome(item) === 'manual_review').length;
  const totalSkippedCount = totalRowsForRunDate.filter(item => /^skipped/.test(adjustmentOutcome(item))).length;
  const sample = latestRunRows
    .filter(item => ['success', 'api_success', 'verified_landed'].includes(adjustmentOutcome(item)))
    .slice(0, 8)
    .map(item => ({
      sku: text(item.sku),
      actionType: text(item.actionType),
      entityType: text(item.entityType),
      entityName: text(item.entityName),
      beforeValue: item.beforeValue,
      afterValue: item.afterValue,
      outcome: adjustmentOutcome(item),
    }));

  return {
    hasAdjustments: true,
    totalRows: rows.length,
    latestRunId,
    latestRunAt,
    latestRunRows: latestRunRows.length,
    fallbackUsed,
    outcomeCounts,
    totalOutcomeCounts,
    successCount,
    failedCount,
    manualReviewCount,
    skippedCount,
    totalSuccessCount,
    totalFailedCount,
    totalManualReviewCount,
    totalSkippedCount,
    sample,
  };
}

function adjustmentLine(item = {}) {
  const name = shortLine(item.entityName || item.entityType || '', 64);
  const valueChange = item.beforeValue !== undefined && item.afterValue !== undefined
    ? `，${item.beforeValue} -> ${item.afterValue}`
    : '';
  return `- ${text(item.sku || 'UNKNOWN')} ${text(item.actionType || '')}${name ? `：${name}` : ''}${valueChange}；${text(item.outcome || '')}`;
}

function dashboardMarkdownLines({ dashboardFile = '', dashboardReady = false } = {}) {
  const file = text(dashboardFile);
  const status = dashboardReady ? 'ready' : (file ? 'expected_or_pending' : 'missing');
  return [
    '## Dashboard',
    `- path: ${file || 'missing'}`,
    `- status: ${status}`,
    '',
  ];
}

function summarizeApprovalNeeded(approvalNeeded = []) {
  const items = Array.isArray(approvalNeeded) ? approvalNeeded : [];
  const groups = new Map();
  for (const item of items) {
    const key = [
      text(item.mode || 'unknown'),
      text(item.riskLevel || 'review'),
      text(item.actionType || 'action'),
      text(item.entityType || 'entity'),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        mode: text(item.mode || 'unknown'),
        riskLevel: text(item.riskLevel || 'review'),
        actionType: text(item.actionType || 'action'),
        entityType: text(item.entityType || 'entity'),
        count: 0,
        skus: new Set(),
        blocks: new Set(),
        requirements: new Set(),
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (text(item.sku)) group.skus.add(text(item.sku));
    for (const block of list(item.blocks)) group.blocks.add(block);
    for (const requirement of list(item.requirements)) group.requirements.add(requirement);
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      skus: [...group.skus],
      blocks: [...group.blocks],
      requirements: [...group.requirements],
    }))
    .sort((a, b) => b.count - a.count || `${a.actionType}/${a.entityType}`.localeCompare(`${b.actionType}/${b.entityType}`));
}

function writeStatusMarkdownLines(writeExecution = {}) {
  const summary = writeExecution.summary || {};
  const approvalNeeded = Array.isArray(writeExecution.plan?.approvalNeeded) ? writeExecution.plan.approvalNeeded : [];
  const approvalGroups = summarizeApprovalNeeded(approvalNeeded);
  const dryRunBlocked = Array.isArray(writeExecution.plan?.dryRunBlocked) ? writeExecution.plan.dryRunBlocked : [];
  const dryRunBlockedGroups = summarizeApprovalNeeded(dryRunBlocked);
  return [
    '## Write Status',
    `- mode: ${text(writeExecution.mode || 'not_run')}; eligible ${summary.eligibleActions || 0}; alreadyLanded ${summary.landedActions || 0}; approvalNeeded ${summary.approvalNeededActions || 0}; blocked ${summary.blockedActions || 0}; stages ${summary.executedStages || 0}; failed ${summary.failedStages || 0}.`,
    ...(dryRunBlockedGroups.length
      ? [
        '- dry-run blocked groups:',
        ...dryRunBlockedGroups.slice(0, 5).map(group => [
          `  - ${group.count}x ${group.actionType}/${group.entityType}; blocks=${group.blocks.join(',') || 'dry_run_blocked'}; skus=${group.skus.join(', ') || 'UNKNOWN'}`,
          group.requirements.length ? `; requirements=${group.requirements.join(',')}` : '',
        ].join('')),
      ]
      : []),
    ...(approvalGroups.length
      ? [
        '- approval needed groups:',
        ...approvalGroups.slice(0, 5).map(group => [
          `  - ${group.count}x ${group.actionType}/${group.entityType}; mode=${group.mode}; risk=${group.riskLevel}; skus=${group.skus.join(', ') || 'UNKNOWN'}`,
          group.blocks.length ? `; blocks=${group.blocks.join(',')}` : '',
          group.requirements.length ? `; requirements=${group.requirements.join(',')}` : '',
        ].join('')),
      ]
      : []),
    '',
  ];
}

function depositStatusMarkdownLines(depositStatus = {}) {
  if (!depositStatus || !depositStatus.status) return [];
  const missing = Array.isArray(depositStatus.missing) ? depositStatus.missing : [];
  const suspicious = Array.isArray(depositStatus.suspicious) ? depositStatus.suspicious : [];
  const candidates = depositStatus.rawDownloadCandidates || {};
  const candidateRoots = Array.isArray(candidates.rootsSearched) ? candidates.rootsSearched : [];
  const candidateTotal = Number(candidates.total || 0);
  const sameDateTotal = Number(candidates.sameDateTotal || 0);
  const staleTotal = Number(candidates.staleTotal || 0);
  return [
    '## Deposit Status',
    `- status: ${text(depositStatus.status)}; missing ${missing.length}; suspicious ${suspicious.length}.`,
    ...(missing.length ? [`- missing raw: ${missing.join(', ')}`] : []),
    ...(suspicious.length ? [`- suspicious: ${suspicious.map(item => text(item.type || item)).join(', ')}`] : []),
    ...(candidateTotal > 0 ? [`- raw download candidates: ${candidateTotal}; same-day ${sameDateTotal}; stale ${staleTotal}; roots: ${candidateRoots.join(', ')}`] : []),
    '',
  ];
}

function artifactVerificationMarkdownLines(closureVerification = null) {
  if (!closureVerification || typeof closureVerification.ok !== 'boolean') return [];
  const errors = Array.isArray(closureVerification.errors) ? closureVerification.errors : [];
  return [
    '## Artifact Verification',
    `- artifactVerificationOk=${closureVerification.ok ? 'true' : 'false'}; errors=${errors.length}.`,
    ...(errors.length ? [`- errors: ${errors.join('; ')}`] : []),
    '',
  ];
}

function kpiGateMarkdownLines(kpiGate = null) {
  if (!kpiGate || !kpiGate.status) return [];
  return [
    '## KPI Gate',
    `- status: ${text(kpiGate.status)}; target ${text(kpiGate.target?.businessDate || '')}; actual ${text(kpiGate.evaluatedBusinessDate || 'pending')}; dataDate ${text(kpiGate.dataDate || '')}.`,
    ...(Array.isArray(kpiGate.warnings) && kpiGate.warnings.length
      ? [`- warnings: ${kpiGate.warnings.map(text).filter(Boolean).join(', ')}`]
      : []),
    '',
  ];
}

function recoveryDryRunMarkdownLines(kpiCheckpoint = {}) {
  const recoveryDryRun = kpiCheckpoint.actionPools?.recoveryDryRun || {};
  if (!recoveryDryRun || Number(recoveryDryRun.highEfficiencyBidUps || 0) <= 0) return [];
  const sample = Array.isArray(recoveryDryRun.sample) ? recoveryDryRun.sample.slice(0, 8) : [];
  return [
    '## KPI Recovery Dry Run',
    `- highEfficiencyBidUps ${Number(recoveryDryRun.highEfficiencyBidUps || 0)}; SKUs ${Number(recoveryDryRun.skuCount || 0)}; latestRun ${text(recoveryDryRun.latestRunId || 'unknown')}.`,
    `- status: planned dry-run only; not counted as landed actions. ${text(recoveryDryRun.decision || '')}`,
    ...(sample.length
      ? sample.map(item => `- ${text(item.sku)} ${text(item.entityType)} ${shortLine(item.entityName, 48)}: ${item.beforeValue ?? ''} -> ${item.afterValue ?? ''}; ${text(item.reasonCode)}; orders7 ${item.orders7 ?? ''}; acos7 ${item.acos7 ?? ''}; invDays ${item.invDays ?? ''}`)
      : []),
    '',
  ];
}

function recoveryDryRunDecisionMarkdownLines(decisions = {}) {
  const summary = decisions.summary || {};
  const byDecision = summary.byDecision || {};
  if (!Number(summary.total || 0)) return [];
  const items = Array.isArray(decisions.items) ? decisions.items : [];
  const priorityRows = items
    .filter(item => ['autonomous_recommendation', 'approval_needed', 'blocked'].includes(text(item.decision)))
    .slice(0, 8);
  return [
    '## KPI Dry-Run Decision Split',
    `- file: data\\tasks\\kpi_recovery_dryrun_decisions_${decisions.date || ''}.md`,
    `- total ${Number(summary.total || 0)}; SKUs ${Number(summary.skuCount || 0)}; executed ${Number(byDecision.executed || 0)}; autonomous ${Number(byDecision.autonomous_recommendation || 0)}; watch ${Number(byDecision.watch_only || 0)}; blocked ${Number(byDecision.blocked || 0)}; approvalNeeded ${Number(byDecision.approval_needed || 0)}.`,
    ...(priorityRows.length
      ? priorityRows.map(item => `- ${text(item.decision)}: ${text(item.sku)} ${text(item.entityType)} ${shortLine(item.entityName, 48)}; ${item.beforeValue ?? ''} -> ${item.afterValue ?? ''}; ${shortLine(item.reason, 90)}`)
      : ['- no non-watch dry-run rows beyond already executed items.']),
    '',
  ];
}

function recoveryNextActionsMarkdownLines({ file = '', decisions = {} } = {}) {
  const summary = decisions.summary || {};
  const byDecision = summary.byDecision || {};
  const nextActions = summary.nextActions || {};
  const total = Number(summary.total || 0);
  const hasNextActions = Object.keys(nextActions).length > 0;
  if (!file && !total && !hasNextActions) return [];
  const alreadyLanded = hasNextActions ? Number(nextActions.alreadyLanded || 0) : Number(byDecision.executed || 0);
  const watch = hasNextActions
    ? Number(nextActions.watch || 0)
    : Number(byDecision.autonomous_recommendation || 0) + Number(byDecision.watch_only || 0);
  const blocked = hasNextActions ? Number(nextActions.blocked || 0) : Number(byDecision.blocked || 0);
  const approvalNeeded = hasNextActions ? Number(nextActions.approvalNeeded || 0) : Number(byDecision.approval_needed || 0);
  return [
    '## KPI Recovery Next Actions',
    `- file: ${file ? path.basename(file) : 'kpi_recovery_next_actions.md'}`,
    `- alreadyLanded ${alreadyLanded}; watch ${watch}; blocked ${blocked}; approvalNeeded ${approvalNeeded}.`,
    '- use this as the next operating checklist; dry-run rows remain planned evidence until a fresh live gate is requested.',
    '',
  ];
}

function kpiApprovalReviewMarkdownLines({ file = '', review = {} } = {}) {
  const summary = review.summary || {};
  const total = Number(summary.total || 0);
  if (!file && !total) return [];
  return [
    '## KPI Approval Review',
    `- file: ${file ? path.basename(file) : 'kpi_approval_review.md'}`,
    `- total ${total}; recommendApprove ${Number(summary.recommendApprove || 0)}; approvalNeeded ${Number(summary.approvalNeeded || 0)}; hold ${Number(summary.hold || 0)}; blocked ${Number(summary.blocked || 0)}.`,
    '- use this as the short true-approval decision pack; it does not authorize live writes by itself.',
    '',
  ];
}

function monthKpiDigestMarkdownLines({ file = '' } = {}) {
  const name = file ? path.basename(file) : '';
  return [
    '## Month KPI Digest',
    file ? `- file: ${name}` : '- file: missing',
    '- use this as the clean Chinese monthly KPI operating summary.',
    '',
  ];
}

function allSkuReviewMarkdownLines(allSkuReview = {}) {
  const summary = allSkuReview.summary || {};
  const rows = Array.isArray(allSkuReview.topPriorityRows)
    ? allSkuReview.topPriorityRows
    : (Array.isArray(allSkuReview.rows) ? allSkuReview.rows.slice(0, 12) : []);
  if (!summary.totalSkus && !rows.length) return [];
  const lifecycle = Object.entries(summary.byLifecycle || {})
    .map(([key, value]) => `${key} ${value}`)
    .join('，') || '暂无';
  const verdicts = Object.entries(summary.byVerdict || {})
    .map(([key, value]) => `${key} ${value}`)
    .join('，') || '暂无';
  const market = summary.marketAnalysis || {};
  const marketStatuses = Object.entries(market.statusCounts || {})
    .map(([key, value]) => `${key} ${value}`)
    .join('; ') || 'none';
  return [
    '## 全 SKU 经营复盘',
    `- 已逐 SKU 输出经营结论：totalSkus ${Number(summary.totalSkus || rows.length)}；必复查 ${Number(summary.mustReview || 0)}；老品同比下滑 ${Number(summary.oldProductYoyDown || 0)}；新品启动修复 ${Number(summary.newLaunchRepair || 0)}；节点点击缺口 ${Number(summary.nodeTrafficGap || 0)}；节点转化缺口 ${Number(summary.nodeConversionGap || 0)}；止血 ${Number(summary.stopLoss || 0)}。`,
    `- 生命周期分层：${lifecycle}。`,
    `- 结论分布：${verdicts}。`,
    `- SKU market analysis: required ${Number(market.requiredSkus || 0)}; market evidence ready ${Number(market.readyForDecisionSupport || 0)}; market missing ${Number(market.requiredMissing || 0)}; mismatch market missing ${Number(market.mismatchMissing || 0)}; statuses ${marketStatuses}.`,
    ...(rows.length
      ? rows.slice(0, 8).map(row => {
        const node = row.nodePlan?.label
          ? `；节点 ${text(row.nodePlan.label)}/${text(row.nodePlan.phase)}，目标 ${row.nodePlan.target?.weeklyClicks ?? '-'} 点击/${row.nodePlan.target?.weeklyOrders ?? '-'} 单`
          : '';
        return `- ${text(row.sku)} ${text(row.lifecycleLabel)}${row.ageDays !== null && row.ageDays !== undefined ? `/${row.ageDays}d` : ''}：3/7/30销量 ${row.units3d}/${row.units7d}/${row.units30d}；同比 ${row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? '-' : formatPercent(row.yoyUnitsPct, 1)}${node}；结论 ${text(row.action || row.verdict)}；market ${text(row.marketAnalysis?.status || 'missing_market_analysis')}；${shortLine((row.reasons || []).join('；'), 90)}`;
      })
      : []),
    '',
  ];
}

function buildAgentHandoffSummary(input = {}) {
  const timeContext = input.timeContext || {};
  const hub = input.hub || {};
  const commandResults = input.commandResults || {};
  const writeExecution = input.writeExecution || {};
  const effectReview = input.effectReview || {};
  const businessDate = dateOnly(hub.businessDate || timeContext.businessDate || input.businessDate || timeContext.runAt);
  const localDate = dateOnly(input.localDate || timeContext.localDate || businessDate);
  const dataDate = dateOnly(hub.dataDate || timeContext.dataDate || businessDate);
  const queue = hub.todayQueue || [];
  const commandItems = commandResults.results || [];
  const failedCommands = commandItems.filter(item => item.ok === false);
  const successfulCommands = commandItems.filter(item => item.ok !== false);
  const reviewResults = effectReview.results || commandItems.map(item => item.report).filter(Boolean);
  const statusCounts = countBy(queue, item => item.status || 'unknown');
  const workTypeCounts = countBy(queue, item => item.workType || item.lane || 'unknown');
  const closureVerification = input.closureVerification || null;
  const effectReviewCoverage = effectReviewCoverageSummary({ hub, effectReview, reviewResults, workTypeCounts, closureVerification });
  const allSkuReview = input.allSkuReview || {};
  const dailyOperatingWorkflow = input.dailyOperatingWorkflow || buildDailyOperatingWorkflow({
    businessDate,
    allSkuReview,
    allSkuReviewFile: input.allSkuReviewFile || '',
    seasonTitleDryRunFile: input.seasonTitleDryRunFile || '',
    seasonGapAuditFile: input.seasonGapAuditFile || '',
    seasonTitleListingQueueFile: input.seasonTitleListingQueueFile || '',
    seasonActionSchemaFile: input.seasonActionSchemaFile || '',
    seasonListingApplicationsFile: input.seasonListingApplicationsFile || '',
    effectReviewCoverage,
    mandatoryDailyClosure: input.mandatoryDailyClosure || input.dailyMandatoryClosure || {},
    required: input.requireDailyWorkflow === true,
  });
  const mandatoryDailyClosure = normalizeMandatoryDailyClosure(
    input.mandatoryDailyClosure ||
    input.dailyMandatoryClosure ||
    dailyOperatingWorkflow.mandatoryDailyClosure ||
    dailyOperatingWorkflow.mandatoryClosure ||
    {}
  );
  const topTasks = queue.slice(0, 8).map(taskLine);
  const adjustmentSummary = input.adjustmentSummary || summarizeAdjustmentLedger(input.adjustments || [], businessDate, {
    fallbackToLatest: input.adjustmentFallbackToLatest !== false,
    acceptedBusinessDates: [businessDate, localDate],
  });
  const adjustmentLines = adjustmentSummary.sample?.map(adjustmentLine) || [];
  const kpiSummary = input.kpiSummary || buildKpiSummary(input.snapshot || {}, { ...timeContext, businessDate, dataDate });
  const dataFreshness = input.dataFreshness || buildDataFreshnessSummary({ businessDate, dataDate, snapshot: input.snapshot || {} });
  const dashboardFile = text(input.dashboardFile || '');
  const dashboardReady = input.dashboardReady === true;
  const depositStatus = input.depositStatus || {};
  const kpiGate = input.kpiGate || null;
  const kpiCheckpoint = input.kpiCheckpoint || {};
  const kpiRecoveryNextActionsFile = text(input.kpiRecoveryNextActionsFile || '');
  const monthKpiDigestMarkdownFile = text(input.monthKpiDigestMarkdownFile || input.monthKpiDigestFile || '');
  const monthKpiDigestReady = !!monthKpiDigestMarkdownFile && fs.existsSync(monthKpiDigestMarkdownFile);
  const landedEvidence = kpiCheckpoint.landedEvidence || {};
  const hasLandedEvidence = Object.prototype.hasOwnProperty.call(landedEvidence, 'landedActionSuccess')
    || Object.prototype.hasOwnProperty.call(landedEvidence, 'landedActionFailed')
    || Object.prototype.hasOwnProperty.call(landedEvidence, 'landedActionManualReview');
  const preferAdjustmentLedger = adjustmentSummary.hasAdjustments === true;
  const landedActionSuccess = preferAdjustmentLedger || !hasLandedEvidence
    ? (adjustmentSummary.totalSuccessCount ?? adjustmentSummary.successCount)
    : Number(landedEvidence.landedActionSuccess || 0);
  const landedActionFailed = preferAdjustmentLedger || !hasLandedEvidence
    ? (adjustmentSummary.totalFailedCount ?? adjustmentSummary.failedCount)
    : Number(landedEvidence.landedActionFailed || 0);
  const landedActionManualReview = preferAdjustmentLedger || !hasLandedEvidence
    ? (adjustmentSummary.totalManualReviewCount ?? adjustmentSummary.manualReviewCount)
    : Number(landedEvidence.landedActionManualReview || 0);
  const hardWriteBlocked = Math.max(0, Number(writeExecution.summary?.blockedActions || 0) - Number(writeExecution.summary?.dryRunBlockedActions || 0));
  const operatingStatus = input.operatingStatus || buildOperatingStatus({
    dataFreshness,
    kpiSummary,
    dailyOperatingWorkflow,
    commandFailed: failedCommands.length,
    writeFailed: writeExecution.summary?.failedStages || 0,
    writeBlocked: hardWriteBlocked,
  });
  const recoveryPace = kpiSummary.recoveryPace || {};
  const recoveryGateStatus = text(recoveryPace.nextBusinessDayGate?.status || (recoveryPace.nextBusinessDayTarget ? 'target_set' : 'missing'));
  const depositMissing = Array.isArray(depositStatus.missing) ? depositStatus.missing : [];
  const dailyClosure = input.dailyClosure || buildDailyClosureStatus({
    commandFailed: failedCommands.length,
    writeFailed: writeExecution.summary?.failedStages || 0,
    writeBlocked: hardWriteBlocked,
    dataFreshnessStatus: dataFreshness.status,
    snapshotStale: dataFreshness.snapshotStale,
    kpiStatus: kpiSummary.status,
    operatingClosureStatus: operatingStatus.status,
    recoveryGateStatus,
    depositStatus: depositStatus.status || '',
    depositMissingCount: depositMissing.length,
    mandatoryDailyClosureOpen: mandatoryDailyClosure.openCount,
    mandatoryDailyClosureResolved: mandatoryDailyClosure.resolved,
  });
  const markdown = [
    `# 智能代理早间交接 - ${localDate}`,
    '',
    `本地日期：${localDate}`,
    `业务日期：${businessDate}`,
    `数据日期：${dataDate}`,
    '',
    ...dashboardMarkdownLines({ dashboardFile, dashboardReady }),
    ...writeStatusMarkdownLines(writeExecution),
    ...depositStatusMarkdownLines(depositStatus),
    ...artifactVerificationMarkdownLines(closureVerification),
    ...dailyClosureMarkdownLines(dailyClosure),
    ...mandatoryDailyClosureMarkdownLines(mandatoryDailyClosure),
    ...dailyOperatingWorkflowMarkdownLines(dailyOperatingWorkflow),
    ...operatingStatusMarkdownLines(operatingStatus),
    ...dataFreshnessMarkdownLines(dataFreshness),
    ...kpiMarkdownLines(kpiSummary),
    ...kpiGateMarkdownLines(kpiGate),
    ...recoveryDryRunMarkdownLines(kpiCheckpoint),
    ...recoveryDryRunDecisionMarkdownLines(input.kpiDryRunDecisions || {}),
    ...recoveryNextActionsMarkdownLines({
      file: kpiRecoveryNextActionsFile,
      decisions: input.kpiDryRunDecisions || {},
    }),
    ...kpiApprovalReviewMarkdownLines({
      file: text(input.kpiApprovalReviewFile || ''),
      review: input.kpiApprovalReview || {},
    }),
    ...monthKpiDigestMarkdownLines({
      file: monthKpiDigestMarkdownFile,
    }),
    ...allSkuReviewMarkdownLines(allSkuReview),
    ...effectReviewCoverageMarkdownLines(effectReviewCoverage),
    '## 总览',
    `- 今日队列 ${queue.length} 项；待复查 ${hub.summary?.dueReviews || workTypeCounts.due_effect_review || 0}；外部任务 ${hub.summary?.externalRequests || workTypeCounts.external_request || 0}；能力补齐 ${hub.summary?.capabilitySetup || workTypeCounts.capability_setup || 0}。`,
    `- 状态分布：${Object.entries(statusCounts).map(([key, value]) => `${key} ${value}`).join('，') || '暂无' }。`,
    `- 只读命令：完成 ${successfulCommands.length}，失败 ${failedCommands.length}，跳过 ${commandResults.summary?.skipped || 0}。`,
    '',
    '## 今日优先',
    ...(topTasks.length ? topTasks : ['- 暂无待办。']),
    '',
    '## 自动证据',
    ...(successfulCommands.length ? successfulCommands.slice(0, 8).map(resultLine) : ['- 暂无自动完成的证据命令。']),
    '',
    '## 阻塞和需确认',
    ...(failedCommands.length ? failedCommands.slice(0, 8).map(resultLine) : ['- 暂无命令失败。']),
    '',
    '## 复查结论',
    ...(reviewResults.length ? reviewResults.slice(0, 8).map(reviewLine) : ['- 暂无复查结论。']),
    '',
    '## 已落地动作沉淀',
    adjustmentSummary.hasAdjustments
      ? `- 最近批次 ${adjustmentSummary.latestRunId || adjustmentSummary.latestRunAt || 'unknown'}${adjustmentSummary.fallbackUsed ? '（当天无匹配账本，回退最近真实批次）' : ''}：成功 ${adjustmentSummary.successCount}，需人工复核 ${adjustmentSummary.manualReviewCount}，跳过 ${adjustmentSummary.skippedCount}，失败/阻塞 ${adjustmentSummary.failedCount}。`
      : '- 暂无已落地动作记录。',
    adjustmentSummary.hasAdjustments
      ? `- 当天累计：成功 ${adjustmentSummary.totalSuccessCount ?? adjustmentSummary.successCount}，需人工复核 ${adjustmentSummary.totalManualReviewCount ?? adjustmentSummary.manualReviewCount}，跳过 ${adjustmentSummary.totalSkippedCount ?? adjustmentSummary.skippedCount}，失败/阻塞 ${adjustmentSummary.totalFailedCount ?? adjustmentSummary.failedCount}。`
      : '',
    ...(adjustmentLines.length ? adjustmentLines : []),
    '',
    '## 写入链路',
    `- 模式：${text(writeExecution.mode || '未运行')}；可执行动作 ${writeExecution.summary?.eligibleActions || 0}；已落地动作 ${writeExecution.summary?.landedActions || 0}；阻塞动作 ${writeExecution.summary?.blockedActions || 0}；已完成阶段 ${writeExecution.summary?.executedStages || 0}；失败阶段 ${writeExecution.summary?.failedStages || 0}。`,
    '',
  ].join('\n');

  return {
    generatedAt: text(timeContext.runAt || new Date().toISOString()),
    localDate,
    businessDate,
    dataDate,
    sourceRunId: text(timeContext.sourceRunId || ''),
    summary: {
      queueTotal: queue.length,
      statusCounts,
      workTypeCounts,
      commandSuccess: successfulCommands.length,
      commandFailed: failedCommands.length,
      reviewResults: reviewResults.length,
      writeMode: text(writeExecution.mode || ''),
      writeApprovalNeeded: Number(writeExecution.summary?.approvalNeededActions || 0),
      writeApprovalGroups: summarizeApprovalNeeded(writeExecution.plan?.approvalNeeded || []),
      landedActionSuccess,
      landedActionFailed,
      landedActionManualReview,
      kpiStatus: kpiSummary.status,
      kpiRequiredMode: kpiSummary.requiredMode,
      dataFreshnessStatus: dataFreshness.status,
      dataLagDays: dataFreshness.dataLagDays,
      snapshotStale: dataFreshness.snapshotStale,
      operatingClosureStatus: operatingStatus.status,
      dashboardReady,
      depositStatus: depositStatus.status || '',
      artifactVerificationOk: closureVerification?.ok,
      artifactVerificationErrors: Array.isArray(closureVerification?.errors) ? closureVerification.errors : [],
      dailyClosureStatus: dailyClosure.dailyClosureStatus,
      dailyComplete: dailyClosure.dailyComplete,
      dailyClosureReasons: dailyClosure.dailyClosureReasons,
      kpiGateStatus: text(kpiGate?.status || ''),
      kpiGateTargetBusinessDate: text(kpiGate?.target?.businessDate || ''),
      kpiGateEvaluatedBusinessDate: text(kpiGate?.evaluatedBusinessDate || ''),
      kpiGateDataDate: text(kpiGate?.dataDate || ''),
      recoveryDryRunHighEfficiencyBidUps: Number(kpiCheckpoint.actionPools?.recoveryDryRun?.highEfficiencyBidUps || 0),
      recoveryDryRunSkuCount: Number(kpiCheckpoint.actionPools?.recoveryDryRun?.skuCount || 0),
      recoveryDryRunDecisionTotal: Number(input.kpiDryRunDecisions?.summary?.total || 0),
      recoveryDryRunApprovalNeeded: Number(input.kpiDryRunDecisions?.summary?.byDecision?.approval_needed || 0),
      recoveryDryRunBlocked: Number(input.kpiDryRunDecisions?.summary?.byDecision?.blocked || 0),
      effectReviewDue: effectReviewCoverage.dueReviews,
      reviewQueueDue: effectReviewCoverage.reviewQueueDue,
      effectReviewTotal: effectReviewCoverage.effectReviewTotal,
      effectReviewFeedbackApplied: effectReviewCoverage.feedbackApplied,
      effectReviewNeedsAction: effectReviewCoverage.needsAction,
      effectReviewBlocked: effectReviewCoverage.blocked,
      effectReviewContinueWatch: effectReviewCoverage.continueWatch,
      effectReviewCloseRecommended: effectReviewCoverage.closeRecommended,
      kpiApprovalReviewTotal: Number(input.kpiApprovalReview?.summary?.total || 0),
      kpiApprovalRecommendApprove: Number(input.kpiApprovalReview?.summary?.recommendApprove || 0),
      kpiApprovalReviewApprovalNeeded: Number(input.kpiApprovalReview?.summary?.approvalNeeded || 0),
      kpiApprovalHold: Number(input.kpiApprovalReview?.summary?.hold || 0),
      kpiApprovalBlocked: Number(input.kpiApprovalReview?.summary?.blocked || 0),
      kpiApprovalReviewReady: Number(input.kpiApprovalReview?.summary?.total || 0) > 0,
      kpiRecoveryNextActionsReady: !!kpiRecoveryNextActionsFile,
      monthKpiDigestReady,
      allSkuReviewTotal: Number(allSkuReview.summary?.totalSkus || 0),
      allSkuReviewMustReview: Number(allSkuReview.summary?.mustReview || 0),
      dailyOperatingWorkflowStatus: dailyOperatingWorkflow.status,
      dailyOperatingWorkflowBlockers: dailyOperatingWorkflow.blockers || [],
      dailyOperatingWorkflow: {
        status: dailyOperatingWorkflow.status,
        required: dailyOperatingWorkflow.required === true,
        blockers: dailyOperatingWorkflow.blockers || [],
        allSku: dailyOperatingWorkflow.allSku || {},
        season: dailyOperatingWorkflow.season || {},
        effectReview: dailyOperatingWorkflow.effectReview || {},
      },
      mandatoryDailyClosure,
      mandatoryDailyClosureOpen: mandatoryDailyClosure.openCount,
      mandatoryDailyClosureUnresolved: mandatoryDailyClosure.unresolvedCount,
      mandatoryDailyClosureResolved: mandatoryDailyClosure.resolved,
    },
    dashboardFile,
    dashboardReady,
    depositStatus,
    closureVerification,
    dailyClosure,
    operatingStatus,
    dataFreshness,
    kpiSummary,
    kpiGate,
    kpiCheckpoint,
    dailyOperatingWorkflow,
    allSkuReview,
    adjustmentSummary,
    markdown,
  };
}

function defaultFile(prefix, today, ext) {
  return path.join(DEFAULT_OUT_DIR, `${prefix}_${today}.${ext}`);
}

function runAgentHandoffSummary(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `agent_handoff_${Date.now()}`,
  });
  const today = options.today || timeContext.businessDate;
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  const previousRecoveryTarget = options.previousRecoveryTarget === undefined
    ? resolvePreviousRecoveryTarget(timeContext.businessDate || today, outDir)
    : options.previousRecoveryTarget;
  const depositStatusFile = options.depositStatusFile || resolveDailyDepositStatusFile(today);
  const kpiGateFile = options.kpiGateFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${today}.json`);
  const kpiCheckpointFile = options.kpiCheckpointFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${today}.json`);
  const allSkuReviewDate = timeContext.businessDate || today;
  const allSkuReviewFile = options.allSkuReviewFile || path.join(ROOT, 'data', 'tasks', `all_sku_operating_review_${allSkuReviewDate}.json`);
  const seasonTitleDryRunFile = options.seasonTitleDryRunFile || path.join(ROOT, 'data', 'tasks', `season_title_dry_run_${allSkuReviewDate}.json`);
  const seasonGapAuditFile = options.seasonGapAuditFile || path.join(ROOT, 'data', 'tasks', `season_gap_audit_${allSkuReviewDate}_latest.json`);
  const seasonTitleListingQueueFile = options.seasonTitleListingQueueFile || path.join(ROOT, 'data', 'tasks', `season_title_listing_queue_${allSkuReviewDate}.json`);
  const seasonActionSchemaFile = options.seasonActionSchemaFile || path.join(ROOT, 'data', 'snapshots', `action_schema_${allSkuReviewDate}_season_title_ads.json`);
  const seasonListingApplicationsFile = options.seasonListingApplicationsFile || path.join(ROOT, 'data', 'snapshots', `season_title_listing_applications_${allSkuReviewDate}.json`);
  const kpiDryRunDecisionFile = options.kpiDryRunDecisionFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${today}.json`);
  const kpiRecoveryNextActionsFile = options.kpiRecoveryNextActionsFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_next_actions_${today}.md`);
  const kpiApprovalReviewFile = options.kpiApprovalReviewFile || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${today}.md`);
  const kpiApprovalReviewJsonFile = options.kpiApprovalReviewJsonFile || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${today}.json`);
  const adjustmentFiles = options.adjustmentsFile
    ? [options.adjustmentsFile]
    : resolveDefaultAdjustmentFiles(today, timeContext.businessDate);
  const summary = buildAgentHandoffSummary({
    timeContext: { ...timeContext, previousRecoveryTarget },
    hub: options.hub || readJson(options.hubFile || defaultFile('operating_hub', today, 'json'), {}),
    commandResults: options.commandResults || readJson(options.commandResultsFile || defaultFile('command_results', today, 'json'), {}),
    writeExecution: options.writeExecution || readJson(options.writeExecutionFile || defaultFile('write_execution', today, 'json'), {}),
    effectReview: options.effectReview || readJson(options.effectReviewFile || defaultFile('effect_review', today, 'json'), {}),
    adjustments: options.adjustments || readAdjustmentFiles(adjustmentFiles),
    snapshot: options.snapshot || readJson(options.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'), {}),
    dashboardFile: options.dashboardFile || '',
    dashboardReady: options.dashboardReady === true,
    depositStatus: options.depositStatus || readJson(depositStatusFile, {}),
    closureVerification: options.closureVerification || readJsonIfExists(options.closureVerificationFile, null),
    kpiGate: options.kpiGate || readJsonIfExists(kpiGateFile, null),
    kpiCheckpoint: options.kpiCheckpoint || readJsonIfExists(kpiCheckpointFile, {}),
    kpiDryRunDecisions: options.kpiDryRunDecisions || readJsonIfExists(kpiDryRunDecisionFile, {}),
    kpiRecoveryNextActionsFile,
    monthKpiDigestMarkdownFile: options.monthKpiDigestMarkdownFile || options.monthKpiDigestFile || '',
    kpiApprovalReviewFile,
    kpiApprovalReview: options.kpiApprovalReview || readJsonIfExists(kpiApprovalReviewJsonFile, {}),
    requireDailyWorkflow: options.requireDailyWorkflow === true,
    dailyOperatingWorkflow: options.dailyOperatingWorkflow,
    allSkuReviewFile,
    seasonTitleDryRunFile,
    seasonGapAuditFile,
    seasonTitleListingQueueFile,
    seasonActionSchemaFile,
    seasonListingApplicationsFile,
    allSkuReview: options.allSkuReview || readJsonIfExists(allSkuReviewFile, {}),
  });
  const outFile = options.outFile || defaultFile('agent_handoff', summary.businessDate, 'md');
  const jsonOutFile = options.jsonOutFile || defaultFile('agent_handoff', summary.businessDate, 'json');
  writeText(outFile, summary.markdown);
  writeJson(jsonOutFile, summary);
  return summary;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    hubFile: get('--hub') || process.env.AGENT_OPERATING_HUB_FILE || '',
    commandResultsFile: get('--results') || get('--command-results') || process.env.AGENT_COMMAND_RESULTS_FILE || '',
    writeExecutionFile: get('--write-execution') || process.env.AGENT_WRITE_EXECUTION_FILE || '',
    effectReviewFile: get('--effect-review') || process.env.AGENT_EFFECT_REVIEW_OUT || '',
    adjustmentsFile: get('--adjustments') || process.env.AGENT_ADJUSTMENTS_FILE || '',
    snapshotFile: get('--snapshot') || process.env.AGENT_HANDOFF_SNAPSHOT_FILE || process.env.PANEL_SNAPSHOT_FILE || '',
    outFile: get('--out') || process.env.AGENT_HANDOFF_OUT || '',
    jsonOutFile: get('--json-out') || process.env.AGENT_HANDOFF_JSON_OUT || '',
    dashboardFile: get('--dashboard') || get('--dashboard-file') || process.env.AGENT_DASHBOARD_FILE || '',
    dashboardReady: args.includes('--dashboard-ready') || process.env.AGENT_DASHBOARD_READY === '1',
    depositStatusFile: get('--deposit-status') || process.env.AGENT_DEPOSIT_STATUS_FILE || '',
    closureVerificationFile: get('--closure-verification') || process.env.AGENT_CLOSURE_VERIFICATION_FILE || '',
    kpiGateFile: get('--kpi-gate') || process.env.AGENT_KPI_GATE_FILE || '',
    kpiCheckpointFile: get('--kpi-checkpoint') || process.env.AGENT_KPI_CHECKPOINT_FILE || '',
    kpiRecoveryNextActionsFile: get('--kpi-next-actions') || process.env.AGENT_KPI_NEXT_ACTIONS_FILE || '',
    kpiApprovalReviewFile: get('--kpi-approval-review') || process.env.AGENT_KPI_APPROVAL_REVIEW_FILE || '',
    kpiApprovalReviewJsonFile: get('--kpi-approval-review-json') || process.env.AGENT_KPI_APPROVAL_REVIEW_JSON_FILE || '',
    allSkuReviewFile: get('--all-sku-review') || process.env.AGENT_ALL_SKU_REVIEW_FILE || '',
    seasonTitleDryRunFile: get('--season-title-dry-run') || process.env.AGENT_SEASON_TITLE_DRY_RUN_FILE || '',
    seasonGapAuditFile: get('--season-gap-audit') || process.env.AGENT_SEASON_GAP_AUDIT_FILE || '',
    seasonTitleListingQueueFile: get('--season-title-listing-queue') || process.env.AGENT_SEASON_TITLE_LISTING_QUEUE_FILE || '',
    seasonActionSchemaFile: get('--season-action-schema') || process.env.AGENT_SEASON_ACTION_SCHEMA_FILE || '',
    seasonListingApplicationsFile: get('--season-listing-applications') || process.env.AGENT_SEASON_LISTING_APPLICATIONS_FILE || '',
    requireDailyWorkflow: args.includes('--require-daily-workflow') || process.env.AGENT_REQUIRE_DAILY_WORKFLOW === '1',
    today: get('--today') || '',
    now: get('--now') || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
  };
}

function main() {
  const options = parseArgs(process.argv);
  const summary = runAgentHandoffSummary(options);
  const outFile = options.outFile || defaultFile('agent_handoff', summary.businessDate, 'md');
  const jsonOutFile = options.jsonOutFile || defaultFile('agent_handoff', summary.businessDate, 'json');
  console.log(JSON.stringify({
    ok: true,
    businessDate: summary.businessDate,
    outFile,
    jsonOutFile,
    summary: summary.summary,
  }, null, 2));
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
  buildAgentHandoffSummary,
  buildDataFreshnessSummary,
  buildKpiSummary,
  buildDailyClosureStatus,
  artifactVerificationMarkdownLines,
  dashboardMarkdownLines,
  dailyClosureMarkdownLines,
  depositStatusMarkdownLines,
  evaluateRecoveryGate,
  kpiGateMarkdownLines,
  recoveryDryRunMarkdownLines,
  recoveryDryRunDecisionMarkdownLines,
  buildOperatingStatus,
  readAdjustmentFiles,
  resolveDefaultAdjustmentFiles,
  resolvePreviousRecoveryTarget,
  writeStatusMarkdownLines,
  parseArgs,
  runAgentHandoffSummary,
  summarizeApprovalNeeded,
  summarizeAdjustmentLedger,
};
