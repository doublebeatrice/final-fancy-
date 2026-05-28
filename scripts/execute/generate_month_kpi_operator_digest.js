const fs = require('fs');
const path = require('path');
const { buildSelectionKpiEvidence } = require('../../src/selection_kpi_evidence');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function int(value) {
  return Math.round(num(value)).toLocaleString('en-US');
}

function pct(value, digits = 2) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function pp(value, digits = 2) {
  return `${(num(value) * 100).toFixed(digits)}pp`;
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

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  const date = text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    date,
    closedLoopFile: text(options.closedLoop || options['closed-loop'] || path.join(ROOT, 'data', 'agent', `agent_closed_loop_${date}.json`)),
    approvalReviewFile: text(options.approvalReview || options['approval-review'] || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`)),
    extendedSelectionReportFile: text(options.extendedSelectionReport || options['extended-selection-report'] || options.selectionReport || options['selection-report'] || ''),
    outFile: text(options.out || path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${date}.json`)),
    markdownFile: text(options.md || path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${date}.md`)),
  };
}

function normalizeOptions(options = {}) {
  const date = text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    date,
    closedLoopFile: text(options.closedLoopFile || options.closedLoop || options['closed-loop'] || path.join(ROOT, 'data', 'agent', `agent_closed_loop_${date}.json`)),
    approvalReviewFile: text(options.approvalReviewFile || options.approvalReview || options['approval-review'] || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`)),
    extendedSelectionReportFile: text(options.extendedSelectionReportFile || options.extendedSelectionReport || options['extended-selection-report'] || options.selectionReport || options['selection-report'] || ''),
    outFile: text(options.outFile || options.out || path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${date}.json`)),
    markdownFile: text(options.markdownFile || options.md || path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${date}.md`)),
  };
}

function actionLine(item = {}) {
  const metrics = item.metrics || {};
  const surface = [text(item.entityType), text(item.actionType)].filter(Boolean).join('/');
  const name = text(item.campaignName || item.entityName || item.keyword || item.id || '-');
  const change = `${money(item.current, 2)} -> ${money(item.suggested, 2)}`;
  return `| ${text(item.sku)} | ${surface}: ${name} | ${change} | orders ${int(metrics.orders)}; ACOS ${metrics.acos == null ? '-' : pct(metrics.acos)}; profit ${metrics.profitRate == null ? '-' : pct(metrics.profitRate)}; invDays ${metrics.invDays ?? '-'}; units7 ${metrics.units7 ?? '-'} | ${text(item.operatorAction || item.reasonCode)} |`;
}

function byDecision(items = [], decision) {
  return items.filter(item => text(item.decision) === decision);
}

function actionSection(title, rows, empty) {
  if (!rows.length) return [`## ${title}`, '', `- ${empty}`, ''];
  return [
    `## ${title}`,
    '',
    '| SKU | 对象 | 调整 | 证据 | 处理 |',
    '| --- | --- | ---: | --- | --- |',
    ...rows.map(actionLine),
    '',
  ];
}

function buildDigest(input = {}) {
  const date = text(input.date);
  const closedLoop = input.closedLoop || {};
  const approvalReview = input.approvalReview || {};
  const selectionKpiEvidence = buildSelectionKpiEvidence(input.selectionReports || {});
  const summary = closedLoop.summary || {};
  const kpi = closedLoop.handoff?.kpiSummary || {};
  const current = kpi.current || {};
  const pace = kpi.recoveryPace || {};
  const nextTarget = pace.nextBusinessDayTarget || {};
  const lastGate = pace.nextBusinessDayGate || {};
  const lastGap = lastGate.gap || {};
  const finalTarget = kpi.finalTarget || {};
  const items = Array.isArray(approvalReview.items) ? approvalReview.items : [];
  const actions = {
    recommendApprove: byDecision(items, 'recommend_approve'),
    trueApprovalNeeded: byDecision(items, 'approval_needed'),
    hold: byDecision(items, 'hold'),
    blocked: byDecision(items, 'blocked'),
  };
  const digestSummary = {
    date,
    businessDate: text(closedLoop.businessDate),
    dataDate: text(closedLoop.dataDate),
    dailyClosureStatus: text(summary.dailyClosureStatus || ''),
    kpiGateStatus: text(summary.kpiGateStatus || ''),
    depositStatus: text(summary.depositStatus || ''),
    depositMissingCount: Number(summary.depositMissingCount || 0),
    depositSuspiciousCount: Number(summary.depositSuspiciousCount || 0),
    landedActionSuccess: Number(summary.landedActionSuccess || 0),
    writeApprovalNeeded: Number(summary.writeApprovalNeeded || 0),
    writeBlocked: Number(summary.writeBlocked || 0),
    dueReviews: Number(summary.dueReviews || 0),
    effectReviewTotal: Number(summary.effectReviewTotal || 0),
    feedbackApplied: Number(summary.feedbackApplied || summary.effectReviewFeedbackApplied || 0),
    recommendApprove: actions.recommendApprove.length,
    approvalNeeded: actions.trueApprovalNeeded.length,
    hold: actions.hold.length,
    blocked: actions.blocked.length,
  };
  return {
    generatedAt: new Date().toISOString(),
    summary: digestSummary,
    kpi: {
      status: text(kpi.status || summary.kpiStatus || ''),
      current,
      lastGate: {
        status: text(lastGate.status || summary.kpiGateStatus || ''),
        targetBusinessDate: text(lastGate.targetBusinessDate || summary.recoveryGateTargetBusinessDate || ''),
        salesGap: num(lastGap.salesGap ?? summary.recoveryGateSalesGap, 0),
        unitsGap: num(lastGap.unitsGap ?? summary.recoveryGateUnitsGap, 0),
        netProfitRateGap: num(lastGap.netProfitRateGap ?? summary.recoveryGateNetProfitRateGap, 0),
        acosGap: num(lastGap.acosGap ?? summary.recoveryGateAcosGap, 0),
        refundRateGap: num(lastGap.refundRateGap ?? summary.recoveryGateRefundRateGap, 0),
        adCostShareGap: num(lastGap.adCostShareGap ?? summary.recoveryGateAdCostShareGap, 0),
      },
      nextTarget,
      finalTarget,
    },
    actions,
    selectionKpiEvidence,
    files: {
      dashboardFile: text(closedLoop.files?.dashboardFile || ''),
      kpiRecoveryNextActionsFile: text(closedLoop.files?.kpiRecoveryNextActionsFile || ''),
      closedLoopFile: text(input.closedLoopFile || ''),
      approvalReviewFile: text(input.approvalReviewFile || ''),
      extendedSelectionReportFile: text(input.extendedSelectionReportFile || ''),
    },
  };
}

function renderMarkdown(digest = {}) {
  const s = digest.summary || {};
  const kpi = digest.kpi || {};
  const current = kpi.current || {};
  const gate = kpi.lastGate || {};
  const next = kpi.nextTarget || {};
  const finalTarget = kpi.finalTarget || {};
  const selectionKpi = digest.selectionKpiEvidence || {};
  const selectionCoverage = selectionKpi.coverage || {};
  const selectionStore = selectionKpi.storeFeedback?.list || {};
  const selectionFlow = selectionKpi.flowTheme?.main || {};
  const selectionLine = `- Selection KPI evidence: ready=${selectionKpi.readyForDecisionSupport === true ? 'true' : 'false'}; dailyRanks=${(selectionCoverage.dailyRankLists || []).join('/') || 'none'}; category=${selectionCoverage.categoryAnalysis === true ? 'true' : 'false'}; flowThemeRows=${int(selectionFlow.rowCount)}; storeFeedbackRows=${int(selectionStore.rowCount)}. Read-only evidence, not auto-write permission.`;
  return [
    `# 月 KPI 运营摘要 - ${s.date}`,
    '',
    `业务日期：${s.businessDate}；数据日期：${s.dataDate}`,
    '',
    `- 结论：${s.dailyClosureStatus === 'needs_recovery' || kpi.status === 'off_track' ? 'KPI 仍未追回' : 'KPI 已进入可验证状态'}；KPI gate=${s.kpiGateStatus || gate.status}；沉淀=${s.depositStatus}，缺失 ${s.depositMissingCount}，可疑 ${s.depositSuspiciousCount}。`,
    `- 当前总账户：销售 ${money(current.sales)}；件数 ${int(current.units)}；净利率 ${pct(current.netProfitRate)}；ACOS ${pct(current.acos)}；退款率 ${pct(current.refundRate)}；广告费率 ${pct(current.adCostShare)}。`,
    `- 上一验收线 ${gate.targetBusinessDate || '-'}：销售差 ${money(gate.salesGap)}；件数差 ${int(gate.unitsGap)}；净利率差 ${pp(gate.netProfitRateGap)}；ACOS 差 ${pp(gate.acosGap)}；退款率差 ${pp(gate.refundRateGap)}；广告费率差 ${pp(gate.adCostShareGap)}。`,
    `- 下一业务日验收线 ${next.businessDate || '-'}：销售至少 ${money(next.salesTarget)}；件数至少 ${int(next.unitsTarget)}；净利率至少 ${pct(next.netProfitRateMin)}；ACOS 不高于 ${pct(next.acosMax)}；退款率不高于 ${pct(next.refundRateMax)}；广告费率不高于 ${pct(next.adCostShareMax)}。`,
    `- 月终缺口：销售 ${money(finalTarget.salesGap)}；件数 ${int(finalTarget.unitsGap)}；净利润约 ${money(finalTarget.estimatedNetProfitGap)}；ACOS 差 ${pp(finalTarget.acosGap)}；退款率差 ${pp(finalTarget.refundRateGap)}。`,
    `- 已落地动作 ${s.landedActionSuccess}；写入需确认 ${s.writeApprovalNeeded}；写入阻塞 ${s.writeBlocked}；复查覆盖：dueReviews ${s.dueReviews}；effectReviewTotal ${s.effectReviewTotal}；feedbackApplied ${s.feedbackApplied}。`,
    selectionLine,
    '',
    ...actionSection('推荐批准', digest.actions?.recommendApprove || [], '暂无推荐批准项。'),
    ...actionSection('真正需要确认', digest.actions?.trueApprovalNeeded || [], '暂无真正需要确认项。'),
    ...actionSection('暂缓', digest.actions?.hold || [], '暂无暂缓项。'),
    ...actionSection('阻塞', digest.actions?.blocked || [], '暂无阻塞项。'),
    '## 下一次复查',
    '',
    `- 下一业务日先看是否达到 ${next.businessDate || '-'} 验收线；未达标继续只推有转化、利润和库存空间的动作。`,
    '- 推荐批准项执行后，先看 1 日 spend/orders，再看 3 日 ACOS，不重复扩大同一 SKU/entity。',
    '- hold 和 blocked 项不进入 live 写入，除非库存、listing、路线证据发生变化。',
    '',
    '## 文件',
    '',
    `- dashboard: ${digest.files?.dashboardFile || '-'}`,
    `- next actions: ${digest.files?.kpiRecoveryNextActionsFile || '-'}`,
    '',
  ].join('\n');
}

function run(options = {}) {
  const normalized = normalizeOptions(options);
  const closedLoop = readJson(normalized.closedLoopFile, {});
  const approvalReview = readJson(normalized.approvalReviewFile, {});
  const extendedSelection = normalized.extendedSelectionReportFile ? readJson(normalized.extendedSelectionReportFile, {}) : {};
  const digest = buildDigest({
    date: normalized.date,
    closedLoop,
    approvalReview,
    selectionReports: { extendedSelection },
    closedLoopFile: normalized.closedLoopFile,
    approvalReviewFile: normalized.approvalReviewFile,
    extendedSelectionReportFile: normalized.extendedSelectionReportFile,
  });
  digest.markdown = renderMarkdown(digest);
  writeJson(normalized.outFile, digest);
  writeText(normalized.markdownFile, digest.markdown);
  return {
    ok: true,
    outFile: normalized.outFile,
    markdownFile: normalized.markdownFile,
    summary: digest.summary,
  };
}

function main() {
  const result = run(parseArgs());
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
  buildDigest,
  renderMarkdown,
  run,
};
