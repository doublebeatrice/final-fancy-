function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function candidateContextMap(candidateConfirmationList = {}) {
  const out = {};
  for (const item of candidateConfirmationList.items || []) {
    const sku = text(item.sku).toUpperCase();
    if (!sku) continue;
    out[sku] = {
      candidateId: text(item.candidateId),
      sku,
      asin: text(item.asin).toUpperCase(),
      conclusionLabel: text(item.conclusionLabel),
      marketLabel: text(item.market?.label),
      coverageLabel: text(item.coverage?.label || item.coverage?.conclusion),
      targetOrderGap: item.coverage?.targetOrderGap ?? null,
      requiredClickGap: item.coverage?.requiredClickGap ?? null,
      plannedClickPool: item.coverage?.plannedClickPool ?? null,
      coverageRatio: item.coverage?.coverageRatio ?? null,
      estimatedSpend: item.actionEconomics?.estimatedSpend ?? 0,
      current30dEstimatedProfit: item.actionEconomics?.current30dEstimatedProfit ?? 0,
      profitRiskLevel: text(item.actionEconomics?.profitRisk?.level),
      checkpoints: item.checkpoints || [],
    };
  }
  return out;
}

function approvalRecordForPending(item = {}, context = {}) {
  const sku = text(item.sku).toUpperCase();
  const candidate = context[sku] || {};
  return {
    candidateId: text(item.candidateId || candidate.candidateId),
    sku,
    asin: text(item.asin || candidate.asin).toUpperCase(),
    approved: false,
    approvedBy: '',
    operatorNote: '',
    conclusionLabel: text(item.conclusionLabel || candidate.conclusionLabel),
    route: text(item.route),
    intensity: text(item.intensity),
    coverage: {
      label: text(candidate.coverageLabel || item.coverageConclusion),
      targetOrderGap: candidate.targetOrderGap ?? null,
      requiredClickGap: candidate.requiredClickGap ?? null,
      plannedClickPool: candidate.plannedClickPool ?? null,
      coverageRatio: candidate.coverageRatio ?? null,
    },
    economics: {
      estimatedSpend: num(candidate.estimatedSpend),
      current30dEstimatedProfit: num(candidate.current30dEstimatedProfit),
      profitRiskLevel: text(candidate.profitRiskLevel),
    },
    checkpoints: candidate.checkpoints || [],
    actions: [item.action].filter(Boolean),
    operatorFill: {
      requiredEdit: 'set approved=true and approvedBy before rerunning old-product maintenance',
      rerunHint: 'pass this JSON as --approval to run_old_product_maintenance.js after confirming',
    },
  };
}

function buildOldProductOperatorApprovalPack(options = {}) {
  const candidateConfirmationList = options.candidateConfirmationList || {};
  const pendingConfirmationActions = options.pendingConfirmationActions || {};
  const manualSuggestionQueue = options.manualSuggestionQueue || {};
  const context = candidateContextMap(candidateConfirmationList);
  const approvedCandidates = (pendingConfirmationActions.items || [])
    .map(item => approvalRecordForPending(item, context));
  return {
    generatedAt: text(options.generatedAt || new Date().toISOString()),
    businessDate: text(options.businessDate),
    mode: 'operator_approval_template',
    evidenceBoundary: 'approval template only; no action executes until approved=true and live execution/readback run separately',
    instructions: [
      'Review candidate context, coverage, spend, profit risk, and checkpoints before editing.',
      'Set approved=true and approvedBy for only the reversible ad actions you want to execute.',
      'Listing, price, inventory, clearance, and replenishment suggestions are not included in approvedCandidates.',
    ],
    summary: {
      candidateCount: num(candidateConfirmationList.summary?.total, (candidateConfirmationList.items || []).length),
      approvalNeededActions: approvedCandidates.length,
      manualSuggestionItems: num(manualSuggestionQueue.summary?.total, (manualSuggestionQueue.items || []).length),
      defaultApproved: false,
    },
    candidateContext: context,
    approvedCandidates,
    manualSuggestionItems: manualSuggestionQueue.items || [],
  };
}

function renderOldProductOperatorApprovalMarkdown(pack = {}) {
  const lines = [];
  const s = pack.summary || {};
  lines.push(`# Old Product Operator Approval ${pack.businessDate || ''}`);
  lines.push('');
  lines.push(`Approval needed actions: ${s.approvalNeededActions || 0}; manual suggestions: ${s.manualSuggestionItems || 0}; default approved:false.`);
  lines.push('Only edit the JSON approval file; this markdown is a review surface.');
  lines.push('');
  lines.push('## Reversible Ad Actions');
  if (!(pack.approvedCandidates || []).length) {
    lines.push('- none');
  }
  for (const item of pack.approvedCandidates || []) {
    const actions = (item.actions || []).map(action => action.id || action.actionType).join(', ');
    lines.push(`- ${item.sku} ${item.asin}: approved:false; route ${item.route || '-'}; intensity ${item.intensity || '-'}; actions ${actions || '-'}; coverage ${item.coverage?.label || '-'}; spend ${item.economics?.estimatedSpend || 0}; profitRisk ${item.economics?.profitRiskLevel || '-'}`);
  }
  lines.push('');
  lines.push('## Manual Suggestions');
  if (!(pack.manualSuggestionItems || []).length) {
    lines.push('- none');
  }
  for (const item of pack.manualSuggestionItems || []) {
    lines.push(`- ${item.sku || ''}: ${item.action?.id || item.action?.actionType || 'manual'}; ${item.executionBoundary || ''}`);
  }
  return lines.join('\n');
}

module.exports = {
  buildOldProductOperatorApprovalPack,
  renderOldProductOperatorApprovalMarkdown,
};
