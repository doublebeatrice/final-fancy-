const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'reports');

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function money(value, digits = 0) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value, digits = 1) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function signedMoney(value, digits = 0) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${money(n, digits)}`;
}

function signedPct(value, digits = 1) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;
}

function signedPp(value, digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}pp`;
}

function int(value) {
  return Math.round(num(value)).toLocaleString('en-US');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function findTrendRoot() {
  const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(entry => entry.isDirectory());
  const hit = dirs.find(entry => /个人数据趋势|personal|trend/i.test(entry.name));
  return hit ? path.join(ROOT, hit.name) : null;
}

function findLatestRunSummary() {
  const runsDir = path.join(ROOT, 'data', 'snapshots', 'runs');
  const summaries = walkFiles(runsDir).filter(file => path.basename(file) === 'summary.json');
  summaries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return summaries[0] || null;
}

function findLatestByPattern(dir, pattern) {
  const files = walkFiles(dir).filter(file => pattern.test(path.basename(file)));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function totalSalesRow(rows) {
  return (rows || []).find(row => {
    const title = String(row.seller_title || '').trim();
    return title === '所选编号汇总' || (title.includes('所选') && title.includes('汇总'));
  }) || {};
}

function historyRows(trendRoot) {
  if (!trendRoot) return [];
  return walkFiles(trendRoot)
    .map(file => {
      const match = path.basename(file).match(/^seller_sales_from_snapshot_(\d{4}-\d{2}-\d{2})\.csv$/);
      if (!match) return null;
      const row = totalSalesRow(readCsv(file));
      if (!row.order_sales) return null;
      return {
        date: match[1],
        sales: num(row.order_sales),
        units: num(row.sale_num),
        adSpend: num(row.adv_spend),
        acos: num(row.ACOS),
        netProfit: num(row.net_profit),
        refund: num(row.refund_percent),
        adCostShare: num(row.advCost),
        new5Sales: num(row.order_sales_in_5_month),
        new5Acos: num(row.acos_in_5_month),
        new5Net: num(row.net_profit_in_5_month),
        yoyUnits: num(row.qty_yoy_over_1_year),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricDelta(rows, key) {
  if (rows.length < 2) return null;
  const prev = rows[rows.length - 2];
  const current = rows[rows.length - 1];
  return {
    absolute: num(current[key]) - num(prev[key]),
    ratio: num(prev[key]) ? (num(current[key]) / num(prev[key]) - 1) : null,
  };
}

function sparkline(rows, key, color, asPct = false) {
  const values = rows.map(row => num(row[key])).filter(Number.isFinite);
  if (values.length < 2) return '';
  const width = 460;
  const height = 150;
  const pad = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const pathData = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaData = `${pathData} L${points[points.length - 1][0].toFixed(1)} ${height - pad} L${points[0][0].toFixed(1)} ${height - pad} Z`;
  const labels = rows.map((row, index) => {
    const [x] = points[index];
    const text = row.date.slice(5);
    return `<text x="${x.toFixed(1)}" y="${height - 5}" text-anchor="middle">${esc(text)}</text>`;
  }).join('');
  const valueLabels = points.map(([x, y], index) => {
    const value = values[index];
    const text = asPct ? pct(value, 1) : money(value, 0);
    return `<text x="${x.toFixed(1)}" y="${Math.max(12, y - 8).toFixed(1)}" text-anchor="middle">${esc(text)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    <path d="${areaData}" fill="${color}" opacity="0.12"></path>
    <path d="${pathData}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
    ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}"></circle>`).join('')}
    ${valueLabels}
    ${labels}
  </svg>`;
}

function barList(items, maxValue, valueFormatter = int) {
  return `<div class="bars">${items.map(item => {
    const value = num(item.value);
    const width = maxValue > 0 ? Math.max(2, Math.min(100, (value / maxValue) * 100)) : 0;
    return `<div class="bar-row">
      <div class="bar-label">${esc(item.label)}</div>
      <div class="bar-track"><div class="bar-fill ${esc(item.tone || '')}" style="width:${width.toFixed(1)}%"></div></div>
      <div class="bar-value">${esc(valueFormatter(value))}</div>
    </div>`;
  }).join('')}</div>`;
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty">暂无命中项</div>';
  return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function statusClass(value, goodWhenDown = false) {
  const n = num(value);
  if (goodWhenDown) return n <= 0 ? 'good' : 'bad';
  return n >= 0 ? 'good' : 'bad';
}

function developerRows(rows) {
  const devRows = (rows || []).filter(row => row.developer_num && num(row.order_sales) > 0);
  const topSales = [...devRows].sort((a, b) => num(b.order_sales) - num(a.order_sales)).slice(0, 8);
  const highRefund = [...devRows]
    .filter(row => num(row.order_sales) >= 8000 && num(row.refund_percent) >= 0.08)
    .sort((a, b) => num(b.order_sales) - num(a.order_sales))
    .slice(0, 8);
  const lowProfit = [...devRows]
    .filter(row => num(row.order_sales) >= 8000 && num(row.net_profit) < 0.15)
    .sort((a, b) => num(a.net_profit) - num(b.net_profit))
    .slice(0, 8);
  return { topSales, highRefund, lowProfit };
}

function skuRiskRows(snapshot) {
  const cards = snapshot.productCards || [];
  const lowEfficiencyRows = Array.isArray(snapshot.lowEfficiencyRows)
    ? snapshot.lowEfficiencyRows
    : Object.values(snapshot.lowEfficiencyRows || {}).flat();
  const stale = cards
    .filter(card => num(card.invDays) >= 120 && num(card.unitsSold_7d) <= 3 && num(card.stockFul) + num(card.stockRes) > 0)
    .sort((a, b) => num(b.invDays) - num(a.invDays))
    .slice(0, 8);
  const tight = cards
    .filter(card => num(card.sellableDays_7d) > 0 && num(card.sellableDays_7d) <= 30 && num(card.unitsSold_7d) >= 3)
    .sort((a, b) => num(a.sellableDays_7d) - num(b.sellableDays_7d))
    .slice(0, 8);
  const waste = lowEfficiencyRows
    .filter(row => num(row?.windows?.['3']?.spend) > 0 || num(row?.entry?.windows?.['3']?.spend) > 0)
    .slice(0, 8);
  return { stale, tight, waste };
}

function auditSamples(audit) {
  const item = (value) => Array.isArray(value?.items) ? value.items : [];
  return {
    newProducts: item(audit.newProductLaunch).slice(0, 8),
    removal: item(audit.removalEconomics).slice(0, 8),
    expired: item(audit.expiredSeasonKeywordWaste).slice(0, 8),
    listing: item(audit.listingRepair).slice(0, 8),
  };
}

function latestExecutionSummary(date) {
  const direct = path.join(ROOT, 'data', 'snapshots', `execution_summary_${date}.json`);
  if (fs.existsSync(direct)) return readJson(direct, {});
  const file = findLatestByPattern(path.join(ROOT, 'data', 'snapshots'), /^execution_summary_\d{4}-\d{2}-\d{2}\.json$/);
  return readJson(file, {});
}

function agentClosedLoopSummary(date, businessDate = date) {
  const direct = path.join(ROOT, 'data', 'agent', `agent_closed_loop_${date}.json`);
  if (fs.existsSync(direct)) return readJson(direct, {});
  const byBusinessDate = path.join(ROOT, 'data', 'agent', `agent_closed_loop_${businessDate}.json`);
  if (fs.existsSync(byBusinessDate)) return readJson(byBusinessDate, {});
  return {};
}

function statusTone(status = '') {
  if (status === 'complete' || status === 'closed' || status === 'pass') return 'good';
  if (status === 'blocked' || status === 'failed' || status === 'fail') return 'bad';
  if (status === 'partial' || status === 'warning' || status === 'needs_recovery' || status === 'pending' || status === 'target_set' || status === 'target_set_actual_pending') return 'warn';
  return '';
}

function dashboardHtml(model) {
  const { summary, snapshot, history, audit, tasks, lowEfficiency, successRate, execution, agentClosedLoop = {}, allSkuReview = {}, kpiDryRunDecisions = {}, kpiApprovalReview = {}, outputDate, reportPaths } = model;
  const current = history[history.length - 1] || {};
  const salesDelta = metricDelta(history, 'sales');
  const unitsDelta = metricDelta(history, 'units');
  const adSpendDelta = metricDelta(history, 'adSpend');
  const acosDelta = metricDelta(history, 'acos');
  const netDelta = metricDelta(history, 'netProfit');
  const refundDelta = metricDelta(history, 'refund');
  const new5Delta = metricDelta(history, 'new5Sales');
  const taskSummary = tasks.summary || summary.dailyTaskPool || {};
  const auditKpi = audit.kpi || {};
  const modules = [
    { label: '新品启动', value: num(audit.newProductLaunch?.summary?.total ?? summary.proactiveOperatingAudit?.newProductLaunch) },
    { label: '到货广告恢复', value: num(audit.arrivalAdRecovery?.summary?.total ?? summary.proactiveOperatingAudit?.arrivalAdRecovery) },
    { label: '价格动作', value: num(audit.priceActions?.summary?.total ?? summary.proactiveOperatingAudit?.priceActions), tone: 'warn' },
    { label: '移除经济性', value: num(audit.removalEconomics?.summary?.total ?? summary.proactiveOperatingAudit?.removalEconomics), tone: 'warn' },
    { label: '过季词浪费', value: num(audit.expiredSeasonKeywordWaste?.summary?.totalEnabledRows ?? summary.proactiveOperatingAudit?.expiredSeasonKeywordWaste), tone: 'bad' },
    { label: 'Listing修复', value: num(audit.listingRepair?.summary?.total ?? summary.proactiveOperatingAudit?.listingRepair), tone: 'bad' },
  ];
  const maxModule = Math.max(...modules.map(item => item.value), 1);
  const dev = developerRows(snapshot.sellerSalesRows || []);
  const risks = skuRiskRows(snapshot);
  const samples = auditSamples(audit);
  const allSkuSummary = allSkuReview.summary || summary.allSkuOperatingReview || {};
  const allSkuRows = Array.isArray(allSkuReview.rows) ? allSkuReview.rows : [];
  const allSkuMarketSummary = allSkuSummary.marketAnalysis || {};
  const allSkuVerdictRows = Object.entries(allSkuSummary.byVerdict || {})
    .map(([label, value]) => ({
      label,
      value,
      tone: /stop|repair|recovery|deep|launch/.test(label) ? 'warn' : (/protect/.test(label) ? 'bad' : ''),
    }));
  const allSkuLifecycleRows = Object.entries(allSkuSummary.byLifecycle || {})
    .map(([label, value]) => ({ label, value }));
  const allSkuMarketRows = Object.entries(allSkuMarketSummary.statusCounts || {})
    .map(([label, value]) => ({
      label,
      value,
      tone: /missing/.test(label) ? 'bad' : 'good',
    }));
  const sourceTime = {
    ...(summary.time || audit.time || {}),
    localDate: agentClosedLoop.localDate || summary.time?.localDate || audit.time?.localDate || outputDate,
    businessDate: agentClosedLoop.businessDate || summary.time?.businessDate || audit.time?.businessDate || '',
    dataDate: agentClosedLoop.dataDate || summary.time?.dataDate || audit.time?.dataDate || '',
  };
  const agentSummary = agentClosedLoop.summary || {};
  const rawOutputs = readJson(reportPaths.depositManifest, {})?.outputs || [];
  const depositStatusFromFile = readJson(reportPaths.depositStatus, {});
  const depositStatus = depositStatusFromFile.status
    ? depositStatusFromFile
    : (agentClosedLoop.handoff?.depositStatus || {
        status: agentSummary.depositStatus || '',
        missing: agentSummary.depositMissing || [],
        suspicious: agentSummary.depositSuspicious || [],
      });
  const rawDownloadCandidates = depositStatus.rawDownloadCandidates || {};
  const rawCandidateRoots = Array.isArray(rawDownloadCandidates.rootsSearched) ? rawDownloadCandidates.rootsSearched : [];
  const rawCandidateTotal = Number(rawDownloadCandidates.total || 0);
  const rawSameDateTotal = Number(rawDownloadCandidates.sameDateTotal || 0);
  const rawStaleTotal = Number(rawDownloadCandidates.staleTotal || 0);
  const rawCandidateSamples = Object.values(rawDownloadCandidates.byMissingClass || {})
    .flat()
    .map(item => path.basename(item.name || item.file || ''))
    .filter(Boolean)
    .slice(0, 6);
  const operatingClosureStatus = agentSummary.operatingClosureStatus || agentClosedLoop.handoff?.operatingStatus?.status || 'unknown';
  const operatingWarnings = agentSummary.operatingClosureWarnings || agentClosedLoop.handoff?.operatingStatus?.warnings || [];
  const closedLoopOk = agentClosedLoop.closedLoop === true || agentSummary.closedLoop === true;
  const dailyClosureStatus = agentSummary.dailyClosureStatus || agentClosedLoop.dailyClosureStatus || agentClosedLoop.handoff?.summary?.dailyClosureStatus || 'unknown';
  const dailyComplete = agentSummary.dailyComplete ?? agentClosedLoop.dailyComplete ?? agentClosedLoop.handoff?.summary?.dailyComplete ?? false;
  const dailyClosureReasons = agentSummary.dailyClosureReasons || agentClosedLoop.dailyClosureReasons || agentClosedLoop.handoff?.summary?.dailyClosureReasons || [];
  const artifactVerificationKnown = agentSummary.artifactVerificationOk !== undefined || agentClosedLoop.closureVerification?.ok !== undefined;
  const artifactVerificationOk = agentSummary.artifactVerificationOk ?? agentClosedLoop.closureVerification?.ok ?? null;
  const artifactVerificationErrors = agentSummary.artifactVerificationErrors || agentClosedLoop.closureVerification?.errors || [];
  const agentKpiStatus = agentSummary.kpiStatus || agentClosedLoop.handoff?.kpiSummary?.status || auditKpi.status || 'unknown';
  const kpiCheckpoint = agentClosedLoop.kpiRecoveryCheckpoint || readJson(reportPaths.kpiCheckpoint, {});
  const landedEvidence = kpiCheckpoint.landedEvidence || {};
  const agentActionSuccess = Math.max(num(agentSummary.landedActionSuccess), num(landedEvidence.landedActionSuccess));
  const agentActionFailed = Math.max(num(agentSummary.landedActionFailed), num(landedEvidence.landedActionFailed));
  const agentActionManualReview = Math.max(num(agentSummary.landedActionManualReview), num(landedEvidence.landedActionManualReview));
  const agentDataLag = agentSummary.dataLagDays ?? agentClosedLoop.handoff?.dataFreshness?.dataLagDays ?? '';
  const effectReviewDue = Math.max(
    num(agentSummary.dueReviews),
    num(agentSummary.effectReviewDue),
    num(agentClosedLoop.handoff?.summary?.effectReviewDue)
  );
  const reviewQueueDue = Math.max(
    num(agentSummary.reviewQueueDue),
    num(agentClosedLoop.handoff?.summary?.reviewQueueDue),
    effectReviewDue
  );
  const effectReviewTotal = Math.max(
    num(agentSummary.effectReviewTotal),
    num(agentClosedLoop.handoff?.summary?.effectReviewTotal)
  );
  const effectReviewFeedbackApplied = Math.max(
    num(agentSummary.feedbackApplied),
    num(agentSummary.effectReviewFeedbackApplied),
    num(agentClosedLoop.handoff?.summary?.effectReviewFeedbackApplied)
  );
  const effectReviewNeedsAction = Math.max(
    num(agentSummary.effectReviewNeedsAction),
    num(agentClosedLoop.handoff?.summary?.effectReviewNeedsAction)
  );
  const effectReviewBlocked = Math.max(
    num(agentSummary.effectReviewBlocked),
    num(agentClosedLoop.handoff?.summary?.effectReviewBlocked)
  );
  const effectReviewContinueWatch = Math.max(
    num(agentSummary.effectReviewContinueWatch),
    num(agentClosedLoop.handoff?.summary?.effectReviewContinueWatch)
  );
  const dailyWorkflow = agentSummary.dailyOperatingWorkflow || agentClosedLoop.handoff?.summary?.dailyOperatingWorkflow || {};
  const dailyWorkflowAllSku = dailyWorkflow.allSku || {};
  const dailyWorkflowSeason = dailyWorkflow.season || {};
  const dailyWorkflowEffect = dailyWorkflow.effectReview || {};
  const dailyWorkflowBlockers = Array.isArray(dailyWorkflow.blockers) ? dailyWorkflow.blockers : [];
  const handoffKpi = agentClosedLoop.handoff?.kpiSummary || {};
  const missedGap = handoffKpi.missedCheckpoint || auditKpi.missedCheckpoint || {};
  const nextGap = handoffKpi.nextCheckpoint || auditKpi.nextCheckpoint || {};
  const finalGap = handoffKpi.finalTarget || auditKpi.finalTarget || {};
  const nextGapDate = nextGap.date || nextGap.target?.date || '';
  const missedGapDate = missedGap.date || missedGap.target?.date || '';
  const recoveryPace = handoffKpi.recoveryPace || {};
  const kpiGate = agentClosedLoop.kpiRecoveryGate || {};
  const nextPace = recoveryPace.nextCheckpoint || {};
  const finalPace = recoveryPace.finalTarget || {};
  const nextDayTarget = recoveryPace.nextBusinessDayTarget || kpiGate.target || {};
  const nextDayGate = recoveryPace.nextBusinessDayGate || {};
  const kpiGateStatus = agentSummary.kpiGateStatus || kpiGate.status || nextDayGate.status || (nextDayTarget.businessDate ? 'target_set' : 'missing');
  const kpiGateEvaluatedBusinessDate = agentSummary.kpiGateEvaluatedBusinessDate || kpiGate.evaluatedBusinessDate || '';
  const kpiGateDataDate = agentSummary.kpiGateDataDate || kpiGate.dataDate || '';
  const kpiGateTargetBusinessDate = (
    kpiGate.target?.businessDate ||
    nextDayGate.targetBusinessDate ||
    (['target_set_actual_pending', 'pending', 'target_set'].includes(kpiGateStatus) ? nextDayTarget.businessDate : '') ||
    ''
  );
  const recoveryDryRun = kpiCheckpoint.actionPools?.recoveryDryRun || {};
  const dryRunDecisionSummary = kpiDryRunDecisions.summary || {};
  const dryRunByDecision = dryRunDecisionSummary.byDecision || {};
  const recoveryNextActionsSummary = dryRunDecisionSummary.nextActions || {};
  const approvalReviewSummary = kpiApprovalReview.summary || {};
  const nextActionsAlreadyLanded = recoveryNextActionsSummary.alreadyLanded ?? dryRunByDecision.executed;
  const nextActionsWatch = recoveryNextActionsSummary.watch ?? (num(dryRunByDecision.autonomous_recommendation) + num(dryRunByDecision.watch_only));
  const nextActionsBlocked = recoveryNextActionsSummary.blocked ?? dryRunByDecision.blocked;
  const nextActionsApprovalNeeded = recoveryNextActionsSummary.approvalNeeded ?? dryRunByDecision.approval_needed;
  const kpiRecoveryNextActionsFile = reportPaths.kpiRecoveryNextActions || agentClosedLoop.files?.kpiRecoveryNextActionsFile || '';
  const monthKpiDigestFile = reportPaths.monthKpiDigest || agentClosedLoop.files?.monthKpiDigestMarkdownFile || '';
  const recoveryDryRunRows = (Array.isArray(recoveryDryRun.sample) ? recoveryDryRun.sample : [])
    .slice(0, 6)
    .map(item => `<tr>
      <td>${esc(item.sku)}</td><td>${esc(item.entityType)}</td><td>${esc(item.entityName)}</td>
      <td>${esc(item.beforeValue ?? '')} -> ${esc(item.afterValue ?? '')}</td>
      <td>${esc(item.reasonCode)}</td><td>${int(item.orders7)}</td><td>${pct(item.acos7, 2)}</td><td>${int(item.invDays)}</td>
    </tr>`);

  const cards = [
    { label: '总销售', value: money(current.sales, 2), sub: salesDelta ? `${signedMoney(salesDelta.absolute, 0)} / ${signedPct(salesDelta.ratio, 1)}` : '无对比', cls: statusClass(salesDelta?.absolute ?? 0) },
    { label: '销量', value: int(current.units), sub: unitsDelta ? `${unitsDelta.absolute >= 0 ? '+' : ''}${int(unitsDelta.absolute)} / ${signedPct(unitsDelta.ratio, 1)}` : '无对比', cls: statusClass(unitsDelta?.absolute ?? 0) },
    { label: '净利率', value: pct(current.netProfit, 2), sub: netDelta ? signedPp(netDelta.absolute, 2) : '无对比', cls: statusClass(netDelta?.absolute ?? 0) },
    { label: 'ACOS', value: pct(current.acos, 2), sub: acosDelta ? signedPp(acosDelta.absolute, 2) : '无对比', cls: statusClass(-(acosDelta?.absolute ?? 0)) },
    { label: '广告费率', value: pct(current.adCostShare, 2), sub: adSpendDelta ? `广告费 ${signedMoney(adSpendDelta.absolute, 0)} / ${signedPct(adSpendDelta.ratio, 1)}` : '无对比', cls: statusClass(-(adSpendDelta?.absolute ?? 0)) },
    { label: '退款率', value: pct(current.refund, 2), sub: refundDelta ? signedPp(refundDelta.absolute, 2) : '无对比', cls: statusClass(-(refundDelta?.absolute ?? 0)) },
  ];

  const devTopRows = dev.topSales.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${esc(row.seller_num)}</td><td>${money(row.order_sales, 2)}</td>
    <td>${int(row.sale_num)}</td><td>${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td><td>${pct(row.refund_percent, 1)}</td>
  </tr>`);
  const refundRows = dev.highRefund.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${money(row.order_sales, 2)}</td><td>${int(row.sale_num)}</td>
    <td class="bad-text">${pct(row.refund_percent, 1)}</td><td>${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td>
  </tr>`);
  const lowProfitRows = dev.lowProfit.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${money(row.order_sales, 2)}</td><td>${int(row.sale_num)}</td>
    <td class="bad-text">${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td><td>${pct(row.refund_percent, 1)}</td>
  </tr>`);

  const newProductRows = samples.newProducts.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue)}</td><td>${int(item.ageDays)}</td>
    <td>${int(item.units7d)}</td><td>${money(item.spend7d, 2)}</td><td>${esc(item.requiredAction)}</td>
  </tr>`);
  const expiredRows = samples.expired.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue || 'expired season keyword')}</td>
    <td>${money(item.spend7d ?? item.spend3d, 2)}</td><td>${int(item.orders7d)}</td><td>${esc(item.requiredAction || 'pause_or_bid_down_expired_season_keyword')}</td>
  </tr>`);
  const listingRows = samples.listing.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue)}</td><td>${int(item.clicks7d)}</td><td>${int(item.units7d)}</td><td>${esc(item.requiredAction)}</td>
  </tr>`);
  const allSkuTopRows = allSkuRows.slice(0, 18).map(row => `<tr>
    <td>${esc(row.sku)}</td>
    <td>${esc(row.lifecycleLabel)}${row.ageDays !== null && row.ageDays !== undefined ? ` / ${int(row.ageDays)}d` : ''}</td>
    <td>${esc(row.nodePlan?.label || '-')} ${esc(row.nodePlan?.phase || '')}</td>
    <td>${int(row.units3d)} / ${int(row.units7d)} / ${int(row.units30d)}</td>
    <td>${row.yoyUnitsPct === null || row.yoyUnitsPct === undefined ? '-' : pct(row.yoyUnitsPct, 1)}</td>
    <td>${pct(row.profitRate, 1)}</td>
    <td>${int(row.invDays)}</td>
    <td>${money(row.ad7?.spend, 2)} / ${int(row.ad7?.orders)} / ${pct(row.ad7?.acos, 1)}</td>
    <td>${row.nodePlan?.target ? `${int(row.nodePlan.target.weeklyClicks)} 点击 / ${int(row.nodePlan.target.weeklyOrders)} 单` : '-'}</td>
    <td>${esc(row.action)}</td>
    <td>${esc(row.marketAnalysis?.status || 'missing_market_analysis')}</td>
    <td>${esc((row.reasons || []).join('；'))}</td>
  </tr>`);
  const staleRows = risks.stale.map(card => `<tr>
    <td>${esc(card.sku)}</td><td>${esc(card.asin)}</td><td>${int(card.invDays)}</td>
    <td>${int(card.unitsSold_7d)}</td><td>${pct(card.netProfit, 1)}</td><td>${esc(card.saleStatus)}</td>
  </tr>`);
  const tightRows = risks.tight.map(card => `<tr>
    <td>${esc(card.sku)}</td><td>${esc(card.asin)}</td><td>${int(card.sellableDays_7d)}</td>
    <td>${int(card.unitsSold_7d)}</td><td>${pct(card.netProfit, 1)}</td><td>${esc(card.saleStatus)}</td>
  </tr>`);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>每日经营 Dashboard ${esc(outputDate)}</title>
  <style>
    :root {
      --bg: #f7f8fa;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d9dee7;
      --blue: #2878bd;
      --green: #20815a;
      --red: #c2473b;
      --amber: #b7791f;
      --teal: #16818a;
    }
    * { box-sizing: border-box; }
    html, body { overflow-x: hidden; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      letter-spacing: 0;
    }
    .page { width: 100%; max-width: 1440px; margin: 0 auto; padding: 24px; }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
      margin-bottom: 18px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 750; }
    h2 { margin: 0 0 12px; font-size: 18px; font-weight: 720; }
    h3 { margin: 0 0 8px; font-size: 15px; font-weight: 720; }
    .meta { color: var(--muted); line-height: 1.8; overflow-wrap: anywhere; }
    .meta-line { display: block; max-width: 100%; overflow-wrap: anywhere; }
    .stamp { text-align: right; color: var(--muted); line-height: 1.8; white-space: nowrap; }
    .grid { display: grid; gap: 14px; }
    .grid > *, header > * { min-width: 0; }
    .status-strip { grid-template-columns: repeat(8, minmax(140px, 1fr)); margin-bottom: 14px; }
    .status-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-left: 5px solid var(--blue);
      border-radius: 8px;
      padding: 12px;
      min-height: 82px;
    }
    .status-card.good { border-left-color: var(--green); }
    .status-card.warn { border-left-color: var(--amber); }
    .status-card.bad { border-left-color: var(--red); }
    .status-label { color: var(--muted); font-size: 12px; }
    .status-value { font-size: 20px; font-weight: 760; margin-top: 8px; overflow-wrap: anywhere; }
    .status-note { color: var(--muted); font-size: 12px; margin-top: 6px; line-height: 1.45; overflow-wrap: anywhere; }
    .kpis { grid-template-columns: repeat(6, minmax(150px, 1fr)); }
    .two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .panel, .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    }
    .panel { padding: 16px; overflow: hidden; min-width: 0; }
    .metric { padding: 14px; min-height: 110px; }
    .metric .label { color: var(--muted); font-size: 13px; }
    .metric .value { font-size: 26px; font-weight: 760; margin: 10px 0 8px; white-space: nowrap; }
    .metric .sub { font-size: 13px; color: var(--muted); line-height: 1.4; }
    .metric.good .sub { color: var(--green); }
    .metric.bad .sub { color: var(--red); }
    .section { margin-top: 14px; }
    .callout {
      border-left: 4px solid var(--blue);
      background: #eef5fb;
      padding: 12px 14px;
      border-radius: 8px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    .warn-callout { border-left-color: var(--amber); background: #fff8e6; }
    .bad-callout { border-left-color: var(--red); background: #fbf1ef; }
    .good-text { color: var(--green); font-weight: 700; }
    .bad-text { color: var(--red); font-weight: 700; }
    .warn-text { color: var(--amber); font-weight: 700; }
    .chart { width: 100%; height: 170px; display: block; }
    .chart text { fill: var(--muted); font-size: 11px; }
    .bars { display: grid; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: 112px minmax(120px, 1fr) 76px; gap: 10px; align-items: center; }
    .bar-label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { height: 10px; background: #edf0f4; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--blue); border-radius: 999px; }
    .bar-fill.warn { background: var(--amber); }
    .bar-fill.bad { background: var(--red); }
    .bar-value { text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: var(--muted); font-weight: 650; background: #fafbfc; }
    td { line-height: 1.45; }
    .table-wrap { max-height: 360px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 9px;
      border-radius: 999px;
      background: #eef2f6;
      color: #344054;
      font-size: 12px;
      white-space: nowrap;
    }
    .pill.good { background: #eaf6ef; color: #1f6f4a; }
    .pill.bad { background: #fae9e6; color: #a33b31; }
    .pill.warn { background: #fff4db; color: #8a5a0a; }
    .empty { color: var(--muted); padding: 16px; background: #fafbfc; border-radius: 8px; }
    .source-list { display: grid; gap: 8px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    @media (max-width: 1100px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .two, .three { grid-template-columns: 1fr; }
      header { grid-template-columns: 1fr; }
      .stamp { text-align: left; }
    }
    @media (max-width: 680px) {
      .page { padding: 14px; max-width: 390px; margin: 0; }
      .kpis { grid-template-columns: 1fr; }
      .status-strip { grid-template-columns: 1fr; }
      .stamp { white-space: normal; overflow-wrap: anywhere; }
      .meta-line { max-width: calc(100vw - 28px); word-break: break-all; }
      .bar-row { grid-template-columns: 96px minmax(80px, 1fr) 64px; }
      h1 { font-size: 23px; }
      .metric .value { font-size: 23px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>每日经营 Dashboard</h1>
        <div class="meta">
          <span class="meta-line">本地日期 ${esc(sourceTime.localDate || outputDate)}</span>
          <span class="meta-line">localDate ${esc(sourceTime.localDate || outputDate)} · businessDate ${esc(sourceTime.businessDate || '')} · dataDate ${esc(sourceTime.dataDate || '')}</span>
          <span class="meta-line">口径：总账号所选编号汇总优先，SKU/广告池用于解释和行动排序。</span>
        </div>
      </div>
      <div class="stamp">
        生成时间 ${esc(new Date().toLocaleString('zh-CN', { hour12: false }))}<br>
        快照 ${esc(path.basename(reportPaths.snapshot || 'latest_snapshot.json'))}
      </div>
    </header>

    <section class="grid status-strip">
      <div class="status-card ${esc(statusTone(operatingClosureStatus))}">
        <div class="status-label">运营闭环</div>
        <div class="status-value">${esc(operatingClosureStatus)}</div>
        <div class="status-note">${esc(operatingWarnings.join(';') || 'no warnings')}</div>
      </div>
      <div class="status-card ${closedLoopOk && dailyComplete ? 'good' : esc(statusTone(dailyClosureStatus))}">
        <div class="status-label">自动链路</div>
        <div class="status-value">dailyClosureStatus: ${esc(dailyClosureStatus)}</div>
        <div class="status-note">${closedLoopOk ? 'closedLoop=true' : 'closedLoop=false'} | dailyComplete=${dailyComplete === true ? 'true' : 'false'} | command ${int(agentSummary.commandExecuted)} / failed ${int(agentSummary.commandFailed)}</div>
        ${dailyClosureReasons.length ? `<div class="status-note">${esc(dailyClosureReasons.join(', '))}</div>` : ''}
      </div>
      <div class="status-card ${artifactVerificationKnown ? (artifactVerificationOk ? 'good' : 'bad') : 'warn'}">
        <div class="status-label">产物校验</div>
        <div class="status-value">artifactVerificationOk=${artifactVerificationOk === true ? 'true' : (artifactVerificationOk === false ? 'false' : 'unknown')}</div>
        <div class="status-note">errors ${int(artifactVerificationErrors.length || 0)}</div>
      </div>
      <div class="status-card ${esc(statusTone(agentKpiStatus === 'off_track' ? 'needs_recovery' : agentKpiStatus))}">
        <div class="status-label">KPI 状态</div>
        <div class="status-value">${esc(agentKpiStatus)}</div>
        <div class="status-note">${esc(agentSummary.kpiRequiredMode || agentClosedLoop.handoff?.kpiSummary?.requiredMode || '')}</div>
      </div>
      <div class="status-card ${esc(statusTone(kpiGateStatus))}">
        <div class="status-label">KPI gate</div>
        <div class="status-value">${esc(kpiGateStatus)}</div>
        <div class="status-note">target ${esc(kpiGateTargetBusinessDate)} | actual ${esc(kpiGateEvaluatedBusinessDate || 'pending')}</div>
      </div>
      <div class="status-card ${agentSummary.snapshotStale ? 'warn' : 'good'}">
        <div class="status-label">数据时效</div>
        <div class="status-value">${esc(agentSummary.dataFreshnessStatus || 'unknown')}</div>
        <div class="status-note">data lag ${esc(agentDataLag)} day(s)</div>
      </div>
      <div class="status-card ${effectReviewDue > 0 && effectReviewTotal >= effectReviewDue && effectReviewFeedbackApplied >= effectReviewDue ? 'good' : 'warn'}">
        <div class="status-label">Effect review coverage</div>
        <div class="status-value">${int(effectReviewTotal)} / ${int(effectReviewDue)}</div>
        <div class="status-note">dueReviews ${num(effectReviewDue)} | reviewQueueDue ${num(reviewQueueDue)} | effectReviewTotal ${num(effectReviewTotal)} | feedbackApplied ${num(effectReviewFeedbackApplied)}</div>
        <div class="status-note">needsAction ${num(effectReviewNeedsAction)} | blocked ${num(effectReviewBlocked)} | continueWatch ${num(effectReviewContinueWatch)}</div>
      </div>
      <div class="status-card ${agentActionSuccess > 0 ? 'good' : 'warn'}">
        <div class="status-label">已落地动作</div>
        <div class="status-value">${int(agentActionSuccess)}</div>
        <div class="status-note">failed ${int(agentActionFailed)} / manual ${int(agentActionManualReview)}</div>
      </div>
      <div class="status-card ${num(recoveryDryRun.highEfficiencyBidUps) > 0 ? 'warn' : ''}">
        <div class="status-label">KPI recovery dry-run</div>
        <div class="status-value">${int(recoveryDryRun.highEfficiencyBidUps)}</div>
        <div class="status-note">SKUs ${int(recoveryDryRun.skuCount)} | latest ${esc(recoveryDryRun.latestRunId || 'none')}</div>
      </div>
      <div class="status-card ${esc(statusTone(depositStatus.status || 'unknown'))}">
        <div class="status-label">沉淀状态</div>
        <div class="status-value">${esc(depositStatus.status || 'unknown')}</div>
        <div class="status-note">missing ${int(depositStatus.missing?.length || 0)} / suspicious ${int(depositStatus.suspicious?.length || 0)}</div>
      </div>
    </section>

    <section class="grid kpis">
      ${cards.map(card => `<div class="metric ${esc(card.cls)}"><div class="label">${esc(card.label)}</div><div class="value">${esc(card.value)}</div><div class="sub">${esc(card.sub)}</div></div>`).join('')}
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>经营判断</h2>
        <div class="callout">
          今天是修复型好转：销售 ${salesDelta ? esc(signedMoney(salesDelta.absolute, 0)) : '无对比'}，净利率 ${netDelta ? esc(signedPp(netDelta.absolute, 2)) : '无对比'}，ACOS ${acosDelta ? esc(signedPp(acosDelta.absolute, 2)) : '无对比'}。广告费下降但销售回升，说明控费没有明显压掉订单。
        </div>
        <div class="callout bad-callout" style="margin-top:10px">
          KPI 仍未闭环：已错过 ${esc(missedGapDate || '当前')} 检查点，销售还差 ${money(missedGap.salesGap, 0)}，销量还差 ${int(missedGap.unitsGap)}，ACOS 还差 ${signedPp(missedGap.acosGap, 2).replace('+', '')}，退款率还差 ${signedPp(missedGap.refundRateGap, 2).replace('+', '')}。
        </div>
        ${nextGapDate ? `<div class="callout bad-callout" style="margin-top:10px">下一检查点 ${esc(nextGapDate)}：销售还差 ${money(nextGap.salesGap, 0)}，销量还差 ${int(nextGap.unitsGap)}，ACOS 还差 ${signedPp(nextGap.acosGap, 2).replace('+', '')}，退款率还差 ${signedPp(nextGap.refundRateGap, 2).replace('+', '')}。</div>` : ''}
        ${nextPace.targetDate ? `<div class="callout warn-callout" style="margin-top:10px">阶段追回速度：到 ${esc(nextPace.targetDate)} 还剩 ${int(nextPace.remainingDays)} 天，需日均销售 ${money(nextPace.salesPerDay, 2)}、日均 ${num(nextPace.unitsPerDay).toFixed(1)} 件。</div>` : ''}
        ${nextDayTarget.businessDate ? `<div class="callout warn-callout" style="margin-top:10px">下一业务日验收线 ${esc(nextDayTarget.businessDate)}：总销售至少 ${money(nextDayTarget.salesTarget, 2)}、件数至少 ${int(nextDayTarget.unitsTarget)}、净利率至少 ${pct(nextDayTarget.netProfitRateMin, 2)}、ACOS 不高于 ${pct(nextDayTarget.acosMax, 2)}、退款率不高于 ${pct(nextDayTarget.refundRateMax, 2)}、广告费率不高于 ${pct(nextDayTarget.adCostShareMax, 2)}。</div>` : ''}
        ${nextDayGate.status ? `<div class="callout ${nextDayGate.status === 'pass' ? '' : 'bad-callout'}" style="margin-top:10px">上一验收线回查 ${esc(nextDayGate.targetBusinessDate)}：${esc(nextDayGate.status)}；销售差 ${money(nextDayGate.gap?.salesGap, 2)}，件数差 ${int(nextDayGate.gap?.unitsGap)}，净利率差 ${signedPp(nextDayGate.gap?.netProfitRateGap, 2).replace('+', '')}，ACOS 差 ${signedPp(nextDayGate.gap?.acosGap, 2).replace('+', '')}，退款率差 ${signedPp(nextDayGate.gap?.refundRateGap, 2).replace('+', '')}，广告费率差 ${signedPp(nextDayGate.gap?.adCostShareGap, 2).replace('+', '')}。</div>` : ''}
        ${finalPace.targetDate ? `<div class="callout warn-callout" style="margin-top:10px">月终速度线：到 ${esc(finalPace.targetDate)} 还剩 ${int(finalPace.remainingDays)} 天，需日均销售 ${money(finalPace.salesPerDay, 2)}、日均 ${num(finalPace.unitsPerDay).toFixed(1)} 件、日均净利润 ${money(finalPace.estimatedNetProfitPerDay, 2)}。</div>` : ''}
      </div>
      <div class="panel">
        <h2>数据健康</h2>
        <div class="pill-row">
          <span class="pill good">baseline ${esc(summary.dailyLearning?.baselineQuality || 'complete')}</span>
          <span class="pill">productCards ${int(summary.totalProductCards || snapshot.productCards?.length)}</span>
          <span class="pill">allowed SKUs ${int(summary.allowedScopeSkuCount)}</span>
          <span class="pill ${summary.warnings?.length ? 'warn' : 'good'}">warnings ${int(summary.warnings?.length || 0)}</span>
          <span class="pill ${esc(statusTone(operatingClosureStatus))}">closure ${esc(operatingClosureStatus)}</span>
          <span class="pill ${esc(statusTone(kpiGateStatus))}">KPI gate ${esc(kpiGateStatus)}</span>
          <span class="pill ${agentSummary.snapshotStale ? 'warn' : 'good'}">data lag ${esc(agentDataLag)}</span>
          <span class="pill ${execution.finalCounts?.success ? 'good' : 'warn'}">今日执行 ${int(execution.finalCounts?.success || 0)}</span>
          <span class="pill">HJ17成功率 ${esc(successRate.successRatePercent || '-')}</span>
        </div>
        <div class="source-list" style="margin-top:12px">
          <div>deposit status: ${esc(depositStatus.status || 'unknown')} · missing ${int(depositStatus.missing?.length || 0)} · suspicious ${int(depositStatus.suspicious?.length || 0)}</div>
          ${depositStatus.missing?.length ? `<div>missing raw: ${esc(depositStatus.missing.join(', '))}</div>` : ''}
          ${depositStatus.suspicious?.length ? `<div>suspicious: ${esc(depositStatus.suspicious.map(item => item.type || item).join(', '))}</div>` : ''}
          ${rawCandidateTotal > 0 ? `<div>raw download candidates: ${int(rawCandidateTotal)}; same-day ${int(rawSameDateTotal)}; stale ${int(rawStaleTotal)}; roots: ${esc(rawCandidateRoots.join(', '))}</div>` : ''}
          ${rawCandidateSamples.length ? `<div>candidate samples: ${esc(rawCandidateSamples.join(', '))}</div>` : ''}
          <div>KPI recovery dry-run: highEfficiencyBidUps ${int(recoveryDryRun.highEfficiencyBidUps)}; SKUs ${int(recoveryDryRun.skuCount)}; latest ${esc(recoveryDryRun.latestRunId || 'none')}</div>
          <div>dry-run note: ${esc(recoveryDryRun.decision || 'no dry-run recovery candidates recorded')}; not landed actions.</div>
          ${dailyWorkflow.status && dailyWorkflow.status !== 'not_required' ? `<div>每日经营工作流: status ${esc(dailyWorkflow.status)}; 全体SKU ${esc(dailyWorkflowAllSku.status || 'unknown')} totalSkus ${int(dailyWorkflowAllSku.totalSkus)} mustReview ${int(dailyWorkflowAllSku.mustReview)}; 节日线 ${esc(dailyWorkflowSeason.status || 'unknown')} dryRunItems ${int(dailyWorkflowSeason.dryRunItems)} activeSeasonTasks ${int(dailyWorkflowSeason.activeSeasonTasks)}; 等生效 ${esc(dailyWorkflowEffect.status || 'unknown')} dueReviews ${int(dailyWorkflowEffect.dueReviews)} effectReviewTotal ${int(dailyWorkflowEffect.effectReviewTotal)} feedbackApplied ${int(dailyWorkflowEffect.feedbackApplied)}; blockers ${esc(dailyWorkflowBlockers.join(', ') || 'none')}</div>` : ''}
          ${Number(dryRunDecisionSummary.total || 0) > 0 ? `<div>KPI dry-run decision split: total ${int(dryRunDecisionSummary.total)}; executed ${int(dryRunByDecision.executed)}; autonomous ${int(dryRunByDecision.autonomous_recommendation)}; watch ${int(dryRunByDecision.watch_only)}; blocked ${int(dryRunByDecision.blocked)}; approvalNeeded ${int(dryRunByDecision.approval_needed)}; file ${esc(path.basename(reportPaths.kpiDryRunDecisions || ''))}</div>` : ''}
          ${kpiRecoveryNextActionsFile ? `<div>KPI recovery next actions: file ${esc(path.basename(kpiRecoveryNextActionsFile))}; alreadyLanded ${int(nextActionsAlreadyLanded)}; watch ${int(nextActionsWatch)}; blocked ${int(nextActionsBlocked)}; approvalNeeded ${int(nextActionsApprovalNeeded)}</div>` : ''}
          ${Number(approvalReviewSummary.total || 0) > 0 ? `<div>KPI approval review: file ${esc(path.basename(reportPaths.kpiApprovalReview || ''))}; recommendApprove ${int(approvalReviewSummary.recommendApprove)}; approvalNeeded ${int(approvalReviewSummary.approvalNeeded)}; hold ${int(approvalReviewSummary.hold)}; blocked ${int(approvalReviewSummary.blocked)}</div>` : ''}
          ${monthKpiDigestFile ? `<div>Month KPI digest: file ${esc(path.basename(monthKpiDigestFile))}</div>` : ''}
          ${rawOutputs.map(item => `<div>${esc(path.basename(item.file || ''))}: ${int(item.rows)} rows · ${(num(item.bytes) / 1024).toFixed(1)} KB</div>`).join('') || '<div>未找到 raw deposit manifest</div>'}
        </div>
      </div>
    </section>

    <section class="section grid three">
      <div class="panel">
        <h2>销售趋势</h2>
        ${sparkline(history.slice(-7), 'sales', '#2878bd')}
      </div>
      <div class="panel">
        <h2>利润率趋势</h2>
        ${sparkline(history.slice(-7), 'netProfit', '#20815a', true)}
      </div>
      <div class="panel">
        <h2>ACOS 趋势</h2>
        ${sparkline(history.slice(-7), 'acos', '#c2473b', true)}
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>异常压力</h2>
        ${barList(modules, maxModule)}
      </div>
      <div class="panel">
        <h2>任务池</h2>
        ${barList(Object.entries(taskSummary.bySignal || {}).map(([label, value]) => ({ label, value, tone: /profit|tail|stale|tight/.test(label) ? 'warn' : '' })), Math.max(...Object.values(taskSummary.bySignal || { x: 1 }).map(num), 1))}
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>全 SKU 经营复盘</h2>
        <div class="pill-row">
          <span class="pill">总 SKU ${int(allSkuSummary.totalSkus)}</span>
          <span class="pill warn">必复查 ${int(allSkuSummary.mustReview)}</span>
          <span class="pill warn">老品同比下滑 ${int(allSkuSummary.oldProductYoyDown)}</span>
          <span class="pill warn">新品启动修复 ${int(allSkuSummary.newLaunchRepair)}</span>
          <span class="pill warn">节点点击缺口 ${int(allSkuSummary.nodeTrafficGap)}</span>
          <span class="pill warn">节点转化缺口 ${int(allSkuSummary.nodeConversionGap)}</span>
          <span class="pill bad">止血 ${int(allSkuSummary.stopLoss)}</span>
          <span class="pill ${int(allSkuMarketSummary.requiredMissing) ? 'bad' : 'good'}">market evidence ready ${int(allSkuMarketSummary.readyForDecisionSupport)}</span>
          <span class="pill ${int(allSkuMarketSummary.requiredMissing) ? 'bad' : 'good'}">market missing ${int(allSkuMarketSummary.requiredMissing)}</span>
          <span class="pill ${int(allSkuMarketSummary.mismatchMissing) ? 'bad' : 'good'}">mismatch market missing ${int(allSkuMarketSummary.mismatchMissing)}</span>
        </div>
        <div style="margin-top:12px">
          ${barList(allSkuVerdictRows, Math.max(...allSkuVerdictRows.map(item => num(item.value)), 1))}
          ${allSkuMarketRows.length ? barList(allSkuMarketRows, Math.max(...allSkuMarketRows.map(item => num(item.value)), 1)) : ''}
        </div>
      </div>
      <div class="panel">
        <h2>生命周期分层</h2>
        ${barList(allSkuLifecycleRows, Math.max(...allSkuLifecycleRows.map(item => num(item.value)), 1))}
        <div class="source-list" style="margin-top:12px">
          <div>全 SKU 表必须带新品/老品、开售年龄、3/7/30日销量、同比、库存、利润、广告成本、节点阶段和量化目标。</div>
          <div>SKU market analysis is required; missing selection market evidence keeps the SKU layer open.</div>
          <div>明细：${esc(path.basename(reportPaths.allSkuReview || 'all_sku_operating_review.json'))}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="panel">
        <h2>SKU 必过结论 Top</h2>
        <div class="table-wrap">${table(['SKU', '生命周期', '节点阶段', '销量 3/7/30', '同比', '利润率', '库存天数', '7日广告 花费/单/ACOS', '阶段目标', '结论', 'market', '原因'], allSkuTopRows)}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>过预算覆盖</h2>
        <div class="pill-row">
          <span class="pill">抓取行 ${int(summary.overBudgetCoverage?.snapshotRows)}</span>
          <span class="pill">可行动 campaign ${int(summary.overBudgetCoverage?.actionableCampaigns)}</span>
          <span class="pill bad">schema 命中 ${int(summary.overBudgetCoverage?.matchedActionCount)}</span>
          <span class="pill warn">${esc(summary.overBudgetCoverage?.warning || 'no warning')}</span>
        </div>
        <div style="margin-top:12px">
          ${barList(Object.entries(summary.overBudgetCoverage?.counts || {}).map(([label, value]) => ({ label, value, tone: label === 'review' ? 'warn' : '' })), Math.max(...Object.values(summary.overBudgetCoverage?.counts || { x: 1 }).map(num), 1))}
        </div>
      </div>
      <div class="panel">
        <h2>新品段</h2>
        <div class="grid three">
          <div><h3>销售</h3><div class="metric-value">${money(current.new5Sales, 2)}</div><div class="meta">${new5Delta ? `${signedMoney(new5Delta.absolute, 0)} / ${signedPct(new5Delta.ratio, 1)}` : '无对比'}</div></div>
          <div><h3>ACOS</h3><div class="metric-value">${pct(current.new5Acos, 2)}</div><div class="meta">目标先稳定低于 30%</div></div>
          <div><h3>净利</h3><div class="metric-value">${pct(current.new5Net, 2)}</div><div class="meta">继续保留有效流量</div></div>
        </div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>开发线销售贡献</h2>
        <div class="table-wrap">${table(['开发线', '账号', '销售', '销量', '净利', 'ACOS', '退款'], devTopRows)}</div>
      </div>
      <div class="panel">
        <h2>高退款开发线</h2>
        <div class="table-wrap">${table(['开发线', '销售', '销量', '退款', '净利', 'ACOS'], refundRows)}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>低利润开发线</h2>
        <div class="table-wrap">${table(['开发线', '销售', '销量', '净利', 'ACOS', '退款'], lowProfitRows)}</div>
      </div>
      <div class="panel">
        <h2>新品启动缺口</h2>
        <div class="table-wrap">${table(['SKU', '问题', '年龄', '7日销量', '7日花费', '动作'], newProductRows)}</div>
      </div>
    </section>

    <section class="section grid three">
      <div class="panel">
        <h2>过季词清理</h2>
        <div class="table-wrap">${table(['SKU', '问题', '7日花费', '7日订单', '动作'], expiredRows)}</div>
      </div>
      <div class="panel">
        <h2>Listing / Offer 修复</h2>
        <div class="table-wrap">${table(['SKU', '问题', '7日点击', '7日销量', '动作'], listingRows)}</div>
      </div>
      <div class="panel">
        <h2>库存风险</h2>
        <div class="table-wrap">${table(['SKU', 'ASIN', '库存天数', '7日销量', '净利', '状态'], staleRows)}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>紧库存</h2>
        <div class="table-wrap">${table(['SKU', 'ASIN', '可售天数', '7日销量', '净利', '状态'], tightRows)}</div>
      </div>
      <div class="panel">
        <h2>下一检查点</h2>
        <div class="callout">
          先看 ${esc(nextGapDate || '下一阶段')} 总销售是否接近 ${money(nextGap.target?.sales, 0)}、销量是否接近 ${int(nextGap.target?.units)}；再看 ACOS 是否继续低于今天的 ${pct(current.acos, 2)}，退款率是否从 ${pct(current.refund, 2)} 回落。
        </div>
        <div class="source-list" style="margin-top:12px">
          <div>最终 KPI 销售缺口：${money(finalGap.salesGap, 0)}</div>
          <div>最终 KPI 净利润额缺口：${money(finalGap.estimatedNetProfitGap, 0)}</div>
          <div>最终 KPI ACOS 缺口：${signedPp(finalGap.acosGap, 2).replace('+', '')}</div>
          <div>最终 KPI 退款率缺口：${signedPp(finalGap.refundRateGap, 2).replace('+', '')}</div>
          ${nextPace.targetDate ? `<div>阶段日均销售追回：${money(nextPace.salesPerDay, 2)} / ${num(nextPace.unitsPerDay).toFixed(1)} 件</div>` : ''}
          ${nextDayTarget.businessDate ? `<div>下一业务日验收线：${esc(nextDayTarget.businessDate)} 销售 ${money(nextDayTarget.salesTarget, 2)} / ${int(nextDayTarget.unitsTarget)} 件 / 净利 ${pct(nextDayTarget.netProfitRateMin, 2)} / ACOS ${pct(nextDayTarget.acosMax, 2)} / 退款 ${pct(nextDayTarget.refundRateMax, 2)} / 广告费率 ${pct(nextDayTarget.adCostShareMax, 2)}</div>` : ''}
          ${nextDayGate.status ? `<div>上一验收线回查：${esc(nextDayGate.targetBusinessDate)} ${esc(nextDayGate.status)} / 销售差 ${money(nextDayGate.gap?.salesGap, 2)} / 件数差 ${int(nextDayGate.gap?.unitsGap)} / 净利率差 ${signedPp(nextDayGate.gap?.netProfitRateGap, 2).replace('+', '')} / 广告费率差 ${signedPp(nextDayGate.gap?.adCostShareGap, 2).replace('+', '')}</div>` : ''}
          ${finalPace.targetDate ? `<div>月终日均净利润追回：${money(finalPace.estimatedNetProfitPerDay, 2)}</div>` : ''}
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildDashboardModel(options = {}) {
  const latestSummaryFile = options.summaryFile || findLatestRunSummary();
  const summary = options.summary || readJson(latestSummaryFile, {});
  const snapshotFile = summary.outputFiles?.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const snapshot = readJson(snapshotFile, readJson(path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'), {}));
  const outputDate = options.outputDate || summary.time?.localDate || new Date().toISOString().slice(0, 10);
  const businessDate = options.businessDate || summary.time?.businessDate || outputDate;
  const trendRoot = findTrendRoot();
  const history = historyRows(trendRoot).slice(-7);
  if (!history.length && snapshot.sellerSalesRows) {
    const row = totalSalesRow(snapshot.sellerSalesRows);
    history.push({
      date: outputDate,
      sales: num(row.order_sales),
      units: num(row.sale_num),
      adSpend: num(row.adv_spend),
      acos: num(row.ACOS),
      netProfit: num(row.net_profit),
      refund: num(row.refund_percent),
      adCostShare: num(row.advCost),
      new5Sales: num(row.order_sales_in_5_month),
      new5Acos: num(row.acos_in_5_month),
      new5Net: num(row.net_profit_in_5_month),
      yoyUnits: num(row.qty_yoy_over_1_year),
    });
  }

  const auditFile = summary.outputFiles?.proactiveOperatingAuditJson || path.join(ROOT, 'data', 'tasks', `proactive_operating_audit_${businessDate}.json`);
  const tasksFile = summary.outputFiles?.dailyTaskPoolJson || path.join(ROOT, 'data', 'tasks', `daily_tasks_${businessDate}.json`);
  const allSkuReviewFile = summary.outputFiles?.allSkuOperatingReviewJson || path.join(ROOT, 'data', 'tasks', `all_sku_operating_review_${businessDate}.json`);
  const lowEfficiencyFile = summary.outputFiles?.lowEfficiencyPoolsJson || path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${businessDate}.json`);
  const successRateFile = path.join(ROOT, 'data', 'snapshots', `seller_success_rate_HJ17_${outputDate}.json`);
  const depositManifest = trendRoot ? findLatestByPattern(trendRoot, new RegExp(`^daily_deposit_manifest_${outputDate}\\.json$`)) : '';
  const depositStatus = trendRoot ? findLatestByPattern(trendRoot, new RegExp(`^daily_deposit_status_${outputDate}\\.json$`)) : '';
  const execution = latestExecutionSummary(outputDate);
  const agentClosedLoop = options.agentClosedLoop || agentClosedLoopSummary(outputDate, businessDate);
  const kpiGateFile = agentClosedLoop.files?.kpiGateFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_gate_${outputDate}.json`);
  const kpiCheckpointFile = agentClosedLoop.files?.kpiCheckpointFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${outputDate}.json`);
  const kpiDryRunDecisionFile = agentClosedLoop.files?.kpiDryRunDecisionFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${outputDate}.json`);
  const kpiRecoveryNextActionsFile = agentClosedLoop.files?.kpiRecoveryNextActionsFile || path.join(ROOT, 'data', 'tasks', `kpi_recovery_next_actions_${outputDate}.md`);
  const kpiApprovalReviewFile = agentClosedLoop.files?.kpiApprovalReviewFile || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${outputDate}.json`);
  const monthKpiDigestFile = agentClosedLoop.files?.monthKpiDigestMarkdownFile || path.join(ROOT, 'data', 'tasks', `month_kpi_operator_digest_${outputDate}.md`);
  if (!agentClosedLoop.kpiRecoveryGate && fs.existsSync(kpiGateFile)) {
    agentClosedLoop.kpiRecoveryGate = readJson(kpiGateFile, {});
  }
  if (fs.existsSync(kpiCheckpointFile)) {
    const currentCheckpoint = agentClosedLoop.kpiRecoveryCheckpoint || {};
    const latestCheckpoint = readJson(kpiCheckpointFile, {});
    const currentLanded = num(currentCheckpoint.landedEvidence?.landedActionSuccess);
    const latestLanded = num(latestCheckpoint.landedEvidence?.landedActionSuccess);
    const currentDryRun = num(currentCheckpoint.actionPools?.recoveryDryRun?.highEfficiencyBidUps);
    const latestDryRun = num(latestCheckpoint.actionPools?.recoveryDryRun?.highEfficiencyBidUps);
    if (!currentCheckpoint.actionPools?.recoveryDryRun || latestLanded > currentLanded || latestDryRun > currentDryRun) {
      agentClosedLoop.kpiRecoveryCheckpoint = latestCheckpoint;
    }
  }

  return {
    summary,
    snapshot,
    history,
    audit: readJson(auditFile, {}),
    tasks: readJson(tasksFile, {}),
    allSkuReview: readJson(allSkuReviewFile, {}),
    kpiDryRunDecisions: readJson(kpiDryRunDecisionFile, {}),
    kpiApprovalReview: readJson(kpiApprovalReviewFile, {}),
    lowEfficiency: readJson(lowEfficiencyFile, {}),
    successRate: readJson(successRateFile, {}),
    execution,
    agentClosedLoop,
    outputDate,
    reportPaths: {
      snapshot: snapshotFile,
      depositManifest,
      depositStatus,
      allSkuReview: allSkuReviewFile,
      kpiGate: kpiGateFile,
      kpiCheckpoint: kpiCheckpointFile,
      kpiDryRunDecisions: kpiDryRunDecisionFile,
      kpiRecoveryNextActions: kpiRecoveryNextActionsFile,
      kpiApprovalReview: kpiApprovalReviewFile,
      monthKpiDigest: monthKpiDigestFile,
    },
  };
}

function generateDailyDashboard(options = {}) {
  const model = buildDashboardModel(options);
  const outputDate = options.outputDate || model.outputDate;
  const outDir = options.outDir || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = options.outFile || path.join(outDir, `daily_dashboard_${outputDate}.html`);
  fs.writeFileSync(outFile, dashboardHtml(model), 'utf8');
  return {
    outFile,
    outputDate,
    businessDate: model.summary.time?.businessDate || outputDate,
  };
}

function main() {
  const result = generateDailyDashboard({ summaryFile: process.argv[2] || '' });
  console.log(result.outFile);
}

if (require.main === module) {
  main();
}

module.exports = {
  agentClosedLoopSummary,
  buildDashboardModel,
  dashboardHtml,
  generateDailyDashboard,
  statusTone,
};
