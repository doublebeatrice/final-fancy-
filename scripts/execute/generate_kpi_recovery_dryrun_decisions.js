const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value, fallback = '') {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
    runId: text(options.runId || ''),
    adjustmentFile: text(options.adjustments || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`)),
    conflictFile: text(options.conflicts || path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${date}.json`)),
    kpiCheckpointFile: text(options.checkpoint || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${date}.json`)),
    writeExecutionFile: text(options.writeExecution || options['write-execution'] || path.join(ROOT, 'data', 'agent', `write_execution_${date}.json`)),
    kpiApprovalReviewFile: text(options.kpiApprovalReview || options['kpi-approval-review'] || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`)),
    outFile: text(options.out || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${date}.json`)),
    markdownFile: text(options.md || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${date}.md`)),
    nextActionsFile: text(options.nextActions || options['next-actions'] || path.join(ROOT, 'data', 'tasks', `kpi_recovery_next_actions_${date}.md`)),
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function normalizeOptions(options = {}) {
  const date = text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return {
    date,
    runId: text(options.runId || ''),
    adjustmentFile: text(options.adjustmentFile || options.adjustments || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`)),
    conflictFile: text(options.conflictFile || options.conflicts || path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${date}.json`)),
    kpiCheckpointFile: text(options.kpiCheckpointFile || options.checkpoint || path.join(ROOT, 'data', 'tasks', `kpi_recovery_checkpoint_${date}.json`)),
    writeExecutionFile: text(options.writeExecutionFile || options.writeExecution || options['write-execution'] || path.join(ROOT, 'data', 'agent', `write_execution_${date}.json`)),
    kpiApprovalReviewFile: text(options.kpiApprovalReviewFile || options.kpiApprovalReview || options['kpi-approval-review'] || path.join(ROOT, 'data', 'tasks', `kpi_approval_review_${date}.json`)),
    outFile: text(options.outFile || options.out || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${date}.json`)),
    markdownFile: text(options.markdownFile || options.md || path.join(ROOT, 'data', 'tasks', `kpi_recovery_dryrun_decisions_${date}.md`)),
    nextActionsFile: text(options.nextActionsFile || options.nextActions || options['next-actions'] || path.join(ROOT, 'data', 'tasks', `kpi_recovery_next_actions_${date}.md`)),
  };
}

function latestDryRunId(rows = [], date = '') {
  const dry = rows
    .filter(row => row?.dryRun === true && text(row.businessDate || row.localDate) === date)
    .filter(row => /high_efficiency/i.test(text(row.reason)));
  dry.sort((a, b) => new Date(text(b.runAt)).getTime() - new Date(text(a.runAt)).getTime());
  return text(dry[0]?.sourceRunId || '');
}

function hasHighEfficiencyDryRuns(rows = [], date = '') {
  return rows.some(row =>
    row?.dryRun === true &&
    text(row.businessDate || row.localDate) === date &&
    /high_efficiency/i.test(text(row.reason))
  );
}

function resolveActionBusinessDate(rows = [], checkpoint = {}, fallback = '') {
  const gate = checkpoint.kpiGate || {};
  const candidates = text(gate.status) === 'target_set_actual_pending'
    ? [gate.targetBusinessDate, gate.evaluatedBusinessDate, checkpoint.businessDate, fallback]
    : [gate.evaluatedBusinessDate, checkpoint.businessDate, gate.targetBusinessDate, fallback];
  const dates = [...new Set(candidates.map(item => dateOnly(item, '')).filter(Boolean))];
  return dates.find(date => hasHighEfficiencyDryRuns(rows, date)) || dates[0] || fallback;
}

function metricFromReason(reason = '', name) {
  const hit = text(reason).match(new RegExp(`${name}=(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return hit ? Number(hit[1]) : null;
}

function entityKey(row = {}) {
  return [text(row.sku), text(row.entityType), text(row.entityId || row.id)].join('::');
}

function liveSuccessKeys(rows = [], date = '') {
  const keys = new Set();
  for (const row of rows) {
    if (row?.dryRun === true) continue;
    if (text(row.businessDate || row.localDate) !== date) continue;
    if (!['success', 'api_success'].includes(text(row.outcome || row.status))) continue;
    keys.add(entityKey(row));
  }
  return keys;
}

function isLowEfficiencyLiveRow(row = {}) {
  if (row?.dryRun === true) return false;
  const sourceRunId = text(row.sourceRunId || row.runId);
  const reason = text(row.reason);
  return /low_efficiency/i.test(sourceRunId) || /low_efficiency/i.test(reason);
}

function summarizeLowEfficiencyLiveRows(rows = [], date = '') {
  const targetDate = dateOnly(date, '');
  const liveRows = rows.filter(row => {
    if (!isLowEfficiencyLiveRow(row)) return false;
    if (!targetDate) return true;
    return dateOnly(row.businessDate || row.localDate || row.runAt, '') === targetDate;
  });
  const byOutcome = {};
  const byEntityType = {};
  const runCounts = {};
  for (const row of liveRows) {
    const outcome = text(row.outcome || row.status || 'unknown');
    const entityType = text(row.entityType || 'unknown');
    const runId = text(row.sourceRunId || row.runId || 'unknown');
    byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
    byEntityType[entityType] = (byEntityType[entityType] || 0) + 1;
    runCounts[runId] = (runCounts[runId] || 0) + 1;
  }
  const latestRunId = liveRows
    .slice()
    .sort((a, b) => text(b.runAt).localeCompare(text(a.runAt)))[0]?.sourceRunId || '';
  return {
    total: liveRows.length,
    success: num(byOutcome.api_success || byOutcome.success, 0),
    failed: num(byOutcome.api_failed || byOutcome.failed || byOutcome.blocked, 0),
    byOutcome,
    byEntityType,
    latestRunId: text(latestRunId),
    latestRunCount: latestRunId ? num(runCounts[latestRunId], 0) : 0,
  };
}

function conflictSkuSet(conflict = {}) {
  const items = Array.isArray(conflict.sameNameReverseDifferentEntity)
    ? conflict.sameNameReverseDifferentEntity
    : [];
  return new Set(items.map(item => text(item.sku)).filter(Boolean));
}

function classify(row = {}, context = {}) {
  const reason = text(row.reason);
  const orders7 = metricFromReason(reason, 'orders7');
  const acos7 = metricFromReason(reason, 'acos7');
  const invDays = metricFromReason(reason, 'invDays');
  const netProfit = metricFromReason(reason, 'netProfit');
  const busyNetProfit = metricFromReason(reason, 'busyNetProfit');
  const changePct = num(row.beforeValue) > 0 ? (num(row.afterValue) - num(row.beforeValue)) / num(row.beforeValue) : 0;
  const sku = text(row.sku);
  const reasons = [];

  if (context.liveKeys.has(entityKey(row))) {
    return {
      decision: 'executed',
      reason: 'same entity already has a successful live write today',
      metrics: { orders7, acos7, invDays, netProfit, busyNetProfit, changePct },
    };
  }

  if (context.conflictSkus.has(sku)) {
    reasons.push('same_name_mixed_direction_review');
  }
  if (invDays !== null && invDays < 30) {
    reasons.push('inventory_under_30_days');
  }
  if (netProfit !== null && netProfit < 0.08) {
    reasons.push('net_profit_guard_weak');
  }
  if (busyNetProfit !== null && busyNetProfit < 0.05) {
    reasons.push('busy_profit_guard_weak');
  }
  if (changePct > 0.15) {
    reasons.push('large_bid_step');
  }

  if (reasons.includes('same_name_mixed_direction_review')) {
    return { decision: 'approval_needed', reason: reasons.join('; '), metrics: { orders7, acos7, invDays, netProfit, busyNetProfit, changePct } };
  }
  if (reasons.length) {
    return { decision: 'blocked', reason: reasons.join('; '), metrics: { orders7, acos7, invDays, netProfit, busyNetProfit, changePct } };
  }
  if (num(orders7) >= 2 && num(invDays) >= 35 && num(netProfit) >= 0.09 && num(busyNetProfit) >= 0.06 && num(acos7) <= 0.15) {
    return {
      decision: 'autonomous_recommendation',
      reason: 'repeat orders with inventory and profit room; still dry-run until a fresh live gate is requested',
      metrics: { orders7, acos7, invDays, netProfit, busyNetProfit, changePct },
    };
  }
  return {
    decision: 'watch_only',
    reason: 'positive signal but one-order, thinner profit, or needs next 1d/3d confirmation',
    metrics: { orders7, acos7, invDays, netProfit, busyNetProfit, changePct },
  };
}

function summarize(items = []) {
  const byDecision = {};
  const bySku = new Set();
  for (const item of items) {
    byDecision[item.decision] = (byDecision[item.decision] || 0) + 1;
    if (item.sku) bySku.add(item.sku);
  }
  return { total: items.length, skuCount: bySku.size, byDecision };
}

function renderMarkdown(report = {}) {
  const lines = [];
  lines.push(`# KPI recovery dry-run decisions - ${report.date}`);
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Source run: ${report.runId || 'none'}`);
  lines.push(`- Total rows: ${report.summary.total}; SKUs: ${report.summary.skuCount}.`);
  lines.push(`- Decision split: ${Object.entries(report.summary.byDecision).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}.`);
  lines.push('');
  lines.push('## Operator Rule');
  lines.push('');
  lines.push('- `executed`: same entity already has a successful live write today.');
  lines.push('- `autonomous_recommendation`: good repeat-order evidence, inventory, and profit room, but remains dry-run until a fresh live gate is explicitly run.');
  lines.push('- `watch_only`: positive but too early or thin for another same-day write.');
  lines.push('- `blocked`: inventory/profit/bid-step guard blocks execution.');
  lines.push('- `approval_needed`: mixed same-name direction or conflict review must be resolved first.');
  lines.push('');
  for (const decision of ['executed', 'autonomous_recommendation', 'watch_only', 'blocked', 'approval_needed']) {
    const rows = report.items.filter(item => item.decision === decision);
    lines.push(`## ${decision}`);
    lines.push('');
    if (!rows.length) {
      lines.push('- none');
      lines.push('');
      continue;
    }
    lines.push('| SKU | Entity | Bid | Evidence | Reason |');
    lines.push('| --- | --- | ---: | --- | --- |');
    for (const item of rows) {
      const m = item.metrics || {};
      lines.push(`| ${item.sku} | ${item.entityType}: ${item.entityName} | ${item.beforeValue} -> ${item.afterValue} | orders7=${m.orders7 ?? '-'}; ACOS7=${m.acos7 ?? '-'}; invDays=${m.invDays ?? '-'}; netProfit=${m.netProfit ?? '-'}; busy=${m.busyNetProfit ?? '-'} | ${item.reason} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function pct(value) {
  return value === null || value === undefined ? '-' : `${(num(value) * 100).toFixed(2)}%`;
}

function money(value) {
  return value === null || value === undefined ? '-' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function itemLine(item = {}) {
  const m = item.metrics || {};
  const entityLabel = text(item.entityName) || text(item.actionType) || text(item.entityId);
  const bid = item.beforeValue !== undefined || item.afterValue !== undefined
    ? `${item.beforeValue ?? ''} -> ${item.afterValue ?? ''}`
    : '-';
  return `| ${item.sku} | ${item.entityType}: \`${entityLabel}\` | ${bid} | orders7=${m.orders7 ?? '-'}; ACOS7=${pct(m.acos7)}; invDays=${m.invDays ?? '-'}; netProfit=${pct(m.netProfit)} | ${item.reason} |`;
}

function renderItemTable(lines, rows = [], emptyText) {
  if (!rows.length) {
    lines.push(`- ${emptyText}`);
    lines.push('');
    return;
  }
  lines.push('| SKU | Entity | Bid | Evidence | Decision |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const item of rows) {
    lines.push(itemLine(item));
  }
  lines.push('');
}

function approvalSurfaceLabel(item = {}) {
  const label = text(item.campaignName || item.id);
  const id = text(item.id);
  if (!id || label.includes(id)) return label || '-';
  return `${label} [${id}]`;
}

function approvalItemLine(item = {}) {
  const m = item.metrics || {};
  const bid = item.current !== undefined || item.suggested !== undefined
    ? `${item.current ?? ''} -> ${item.suggested ?? ''}`
    : '-';
  return `| ${item.sku} | ${item.entityType}/${item.actionType}: \`${approvalSurfaceLabel(item)}\` | ${bid} | orders=${m.orders ?? m.orders7 ?? '-'}; ACOS=${pct(m.acos)}; profit=${pct(m.profitRate)}; invDays=${m.invDays ?? '-'}; units7=${m.units7 ?? '-'} | ${item.reasonCode || item.operatorAction || item.decision} |`;
}

function renderApprovalReviewTable(lines, rows = [], emptyText) {
  if (!rows.length) {
    lines.push(`- ${emptyText}`);
    lines.push('');
    return;
  }
  lines.push('| SKU | Surface | Change | Evidence | Decision |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const item of rows) {
    lines.push(approvalItemLine(item));
  }
  lines.push('');
}

function renderNextActionsMarkdown(report = {}, checkpoint = {}) {
  const lines = [];
  const actions = report.nextActions || {};
  const approvalReview = report.approvalReview || {};
  const approvalItems = Array.isArray(approvalReview.items) ? approvalReview.items : [];
  const byDecision = decision => report.items.filter(item => item.decision === decision);
  const gate = checkpoint.kpiGate || {};
  const target = gate.target || {};
  const actual = gate.actual || {};
  const nextTarget = checkpoint.nextRecoveryTarget || {};
  const landed = actions.landed || byDecision('executed');
  const watch = [
    ...byDecision('autonomous_recommendation'),
    ...byDecision('watch_only'),
  ];
  const blocked = actions.blocked || byDecision('blocked');
  const approval = approvalItems.length
    ? approvalItems.filter(item => item.decision === 'approval_needed')
    : actions.approval || byDecision('approval_needed');
  const recommendedApproval = approvalItems.filter(item => item.decision === 'recommend_approve');
  const heldApproval = approvalItems.filter(item => item.decision === 'hold');
  const blockedApproval = approvalItems.filter(item => item.decision === 'blocked');

  lines.push(`# KPI recovery next actions - ${report.date}`);
  lines.push('');
  lines.push(`Business date: ${checkpoint.businessDate || report.date}`);
  lines.push(`Data date: ${checkpoint.dataDate || '-'}`);
  lines.push(`Source run: ${report.runId || 'none'}`);
  lines.push('');
  lines.push('## Account Gate');
  lines.push('');
  lines.push(`- KPI gate: ${gate.status || 'unknown'}.`);
  if (target.sales || actual.sales) {
    lines.push(`- Sales: actual ${money(actual.sales)} vs target ${money(target.sales)}.`);
  }
  if (target.units || actual.units) {
    lines.push(`- Units: actual ${money(actual.units)} vs target ${money(target.units)}.`);
  }
  if (target.netProfitRateMin || actual.netProfitRate) {
    lines.push(`- Net profit rate: actual ${pct(actual.netProfitRate)} vs min ${pct(target.netProfitRateMin)}.`);
  }
  if (target.acosMax || actual.acos) {
    lines.push(`- ACOS: actual ${pct(actual.acos)} vs max ${pct(target.acosMax)}.`);
  }
  if (target.refundRateMax || actual.refundRate) {
    lines.push(`- Refund rate: actual ${pct(actual.refundRate)} vs max ${pct(target.refundRateMax)}.`);
  }
  if (target.adCostShareMax || actual.adCostShare) {
    lines.push(`- Ad cost share: actual ${pct(actual.adCostShare)} vs max ${pct(target.adCostShareMax)}.`);
  }
  if (nextTarget.businessDate) {
    lines.push(`- Next recovery line ${nextTarget.businessDate}: sales at least ${money(nextTarget.sales)}; units at least ${money(nextTarget.units)}; net profit rate at least ${pct(nextTarget.netProfitRateMin)}; ACOS not above ${pct(nextTarget.acosMax)}; refund rate not above ${pct(nextTarget.refundRateMax)}; ad cost share not above ${pct(nextTarget.adCostShareMax)}.`);
  }
  lines.push('- Operator posture: recover volume only through rows with conversion evidence, inventory room, and profit room; do not count dry-runs as landed KPI actions.');
  lines.push('');
  lines.push('## Already Landed');
  lines.push('');
  lines.push('Do not repeat same-entity successful live writes until the next effect window proves a new action is needed.');
  lines.push('');
  const liveLowEfficiency = report.liveLowEfficiency || {};
  if (num(liveLowEfficiency.total, 0) > 0) {
    const entitySplit = Object.entries(liveLowEfficiency.byEntityType || {})
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    lines.push(`- Low-efficiency live stop-loss landed: success ${num(liveLowEfficiency.success, 0)}, failed ${num(liveLowEfficiency.failed, 0)}, latestRun ${liveLowEfficiency.latestRunId || 'none'} (${num(liveLowEfficiency.latestRunCount, 0)} rows).`);
    if (entitySplit) lines.push(`- Low-efficiency entity split: ${entitySplit}.`);
    lines.push('- Detailed rows are kept in the adjustment log and landed-action conflict audit; this summary prevents the next-actions file from hiding live stop-loss work.');
    lines.push('');
  }
  renderItemTable(lines, landed, 'none');
  lines.push('## High-Priority Watch Pool');
  lines.push('');
  lines.push('Promote only after fresh 1d/3d evidence shows repeat conversion and guardrails still pass.');
  lines.push('');
  renderItemTable(lines, watch, 'none');
  lines.push('## Blocked Pool');
  lines.push('');
  lines.push('Do not execute these as KPI recovery bid-ups without fresh inventory/profit evidence.');
  lines.push('');
  renderItemTable(lines, blocked, 'none');
  if (approvalItems.length) {
    const s = approvalReview.summary || {};
    lines.push(`- Approval review split: recommendApprove ${s.recommendApprove || 0}; approvalNeeded ${s.approvalNeeded || 0}; hold ${s.hold || 0}; blocked ${s.blocked || 0}.`);
    lines.push('');
    lines.push('## Recommended Approval');
    lines.push('');
    lines.push('These are still human-authorized writes, but the operator review found enough profit, conversion, and inventory room for a controlled lift.');
    lines.push('');
    renderApprovalReviewTable(lines, recommendedApproval, 'none');
  }
  lines.push('## True Approval Needed');
  lines.push('');
  lines.push('These require operator review because the current evidence conflicts or crosses the normal write boundary.');
  lines.push('');
  if (approvalItems.length) {
    renderApprovalReviewTable(lines, approval, 'none');
    lines.push('## Hold');
    lines.push('');
    lines.push('Do not approve these until the stated inventory, sell-through, or route condition changes.');
    lines.push('');
    renderApprovalReviewTable(lines, heldApproval, 'none');
    lines.push('## Approval Review Blocked');
    lines.push('');
    lines.push('Do not execute these as KPI recovery writes without rebuilding evidence or route context.');
    lines.push('');
    renderApprovalReviewTable(lines, blockedApproval, 'none');
  } else {
    renderItemTable(lines, approval, 'none');
  }
  lines.push('## Next Run Checklist');
  lines.push('');
  lines.push(`1. Run \`npm run ops:kpi:gate -- --date ${nextTarget.businessDate || report.date}\` when the next actual line is available.`);
  lines.push('2. Re-run effect review at the next 1d/3d window before promoting watch-only rows.');
  lines.push('3. Keep low-efficiency raw-pool counts separate from executable write-chain actions.');
  lines.push('4. Keep the day in recovery until KPI gate passes or the next recovery target is explicitly carried forward.');
  return `${lines.join('\n')}\n`;
}

function summarizeNextActions(nextActions = {}) {
  const approvalReview = nextActions.approvalReview || {};
  const reviewSummary = approvalReview.summary || {};
  return {
    alreadyLanded: (nextActions.landed || []).length,
    watch: (nextActions.watch || []).length,
    blocked: (nextActions.blocked || []).length,
    approvalNeeded: Number.isFinite(Number(reviewSummary.approvalNeeded))
      ? Number(reviewSummary.approvalNeeded)
      : (nextActions.approval || []).length,
    ...(approvalReview.items
      ? {
          recommendApprove: num(reviewSummary.recommendApprove, 0),
          hold: num(reviewSummary.hold, 0),
          approvalReviewBlocked: num(reviewSummary.blocked, 0),
        }
      : {}),
  };
}

function normalizeWritePlanItem(item = {}, decision = '') {
  const defaultReason = decision === 'executed'
    ? 'same action already has a successful live write today'
    : decision;
  return {
    sku: text(item.sku),
    asin: text(item.asin),
    entityType: text(item.entityType),
    entityId: text(item.entityId || item.id),
    entityName: text(item.entityName),
    actionType: text(item.actionType),
    beforeValue: item.beforeValue,
    afterValue: item.afterValue,
    decision,
    reason: text(item.reason || item.blocks?.join('; ') || item.requirements?.join('; ') || item.mode || defaultReason),
    metrics: {},
    sourceRunId: text(item.sourceRunId),
    dryRun: item.dryRun === true,
  };
}

function buildNextActions(reportItems = [], writeExecution = {}, approvalReview = {}) {
  const byDecision = decision => reportItems.filter(item => item.decision === decision);
  const plan = writeExecution.plan || {};
  const landed = [
    ...byDecision('executed'),
    ...(Array.isArray(plan.alreadyLanded) ? plan.alreadyLanded.map(item => normalizeWritePlanItem(item, 'executed')) : []),
  ];
  const watch = [
    ...byDecision('autonomous_recommendation'),
    ...byDecision('watch_only'),
  ];
  const blocked = [
    ...byDecision('blocked'),
    ...(Array.isArray(plan.dryRunBlocked) ? plan.dryRunBlocked.map(item => normalizeWritePlanItem(item, 'blocked')) : []),
  ];
  const approval = [
    ...byDecision('approval_needed'),
    ...(Array.isArray(plan.approvalNeeded) ? plan.approvalNeeded.map(item => normalizeWritePlanItem(item, 'approval_needed')) : []),
  ];
  return { landed, watch, blocked, approval, approvalReview };
}

function run(options = parseArgs()) {
  const config = normalizeOptions(options);
  const rows = readJson(config.adjustmentFile, []);
  const conflict = readJson(config.conflictFile, {});
  const checkpoint = readJson(config.kpiCheckpointFile, {});
  const writeExecution = readJson(config.writeExecutionFile, {});
  const approvalReview = readJson(config.kpiApprovalReviewFile, {});
  const businessDate = resolveActionBusinessDate(rows, checkpoint, config.date);
  const runId = config.runId || latestDryRunId(rows, businessDate);
  const dryRows = rows
    .filter(row => row?.dryRun === true)
    .filter(row => text(row.businessDate || row.localDate) === businessDate)
    .filter(row => text(row.sourceRunId) === runId)
    .filter(row => /high_efficiency/i.test(text(row.reason)));
  const context = {
    liveKeys: liveSuccessKeys(rows, businessDate),
    conflictSkus: conflictSkuSet(conflict),
  };
  const items = dryRows.map(row => {
    const classified = classify(row, context);
    return {
      sku: text(row.sku),
      asin: text(row.asin),
      entityType: text(row.entityType),
      entityId: text(row.entityId || row.id),
      entityName: text(row.entityName),
      beforeValue: num(row.beforeValue, null),
      afterValue: num(row.afterValue, null),
      decision: classified.decision,
      reason: classified.reason,
      metrics: classified.metrics,
      sourceRunId: text(row.sourceRunId),
      dryRun: row.dryRun === true,
    };
  });
  const report = {
    date: config.date,
    businessDate,
    generatedAt: new Date().toISOString(),
    runId,
    sourceFiles: {
      adjustments: config.adjustmentFile,
      conflicts: config.conflictFile,
      kpiCheckpoint: config.kpiCheckpointFile,
      writeExecution: config.writeExecutionFile,
      kpiApprovalReview: config.kpiApprovalReviewFile,
    },
    summary: summarize(items),
    items,
  };
  report.liveLowEfficiency = summarizeLowEfficiencyLiveRows(rows, config.date);
  report.approvalReview = approvalReview;
  report.nextActions = buildNextActions(items, writeExecution, approvalReview);
  report.summary.nextActions = summarizeNextActions(report.nextActions);
  fs.mkdirSync(path.dirname(config.outFile), { recursive: true });
  fs.mkdirSync(path.dirname(config.nextActionsFile), { recursive: true });
  fs.writeFileSync(config.outFile, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(config.markdownFile, renderMarkdown(report), 'utf8');
  fs.writeFileSync(config.nextActionsFile, renderNextActionsMarkdown(report, checkpoint), 'utf8');
  return {
    ok: true,
    outFile: config.outFile,
    markdownFile: config.markdownFile,
    nextActionsFile: config.nextActionsFile,
    summary: report.summary,
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(run(), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  classify,
  normalizeOptions,
  parseArgs,
  renderNextActionsMarkdown,
  run,
};
