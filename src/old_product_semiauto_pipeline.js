const fs = require('fs');
const path = require('path');
const { runAllSkuOperatingReview } = require('../scripts/run_all_sku_operating_review');
const { runAgentCommandRunner } = require('../scripts/run_agent_command_runner');
const { runOldProductMaintenance } = require('./old_product_maintenance');
const { runOldProductMarketEvidenceQueue } = require('./old_product_market_evidence_queue');
const {
  buildOldProductOperatorApprovalPack,
  renderOldProductOperatorApprovalMarkdown,
} = require('./old_product_operator_approval_pack');

const ROOT = path.join(__dirname, '..');

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

function resolveRoot(file) {
  const raw = text(file);
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function mirrorJsonFile(sourceFile, targetFile) {
  if (!sourceFile || !fs.existsSync(sourceFile)) return '';
  const value = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  writeJson(targetFile, value);
  return targetFile;
}

function defaultTaskFile(taskDir, name, date, suffix = '', ext = 'json') {
  const mid = suffix ? `_${suffix}` : '';
  return path.join(taskDir, `${name}_${date}${mid}.${ext}`);
}

function quoteCommandArg(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function buildApprovalRerunCommand({ businessDate, dataDate, snapshotFile, depositStatusFile, maxCandidates, files }) {
  const args = [
    'node',
    'scripts\\run_old_product_maintenance.js',
    '--date', businessDate,
    '--data-date', dataDate,
    '--all-sku-review', files.finalAllSkuReviewJson,
    '--approval', files.operatorApprovalTemplateJson,
    '--deposit-status', depositStatusFile,
    '--snapshot', snapshotFile,
    '--out', files.finalOldProductMaintenanceJson,
    '--md-out', files.finalOldProductMaintenanceMarkdown,
    '--approved-actions-out', files.finalApprovedActionsJson,
    '--candidate-confirmation-out', files.finalCandidateConfirmationJson,
    '--pending-confirmation-actions-out', files.finalPendingConfirmationActionsJson,
    '--manual-suggestion-queue-out', files.finalManualSuggestionQueueJson,
    '--watchlist-out', files.finalWatchlistDeltaJson,
    '--execution-handoff-out', files.finalExecutionHandoffJson,
    '--max-candidates', String(maxCandidates),
  ];
  return args.map(arg => /[\s"]/u.test(arg) ? quoteCommandArg(arg) : arg).join(' ');
}

function renderManifestMarkdown(manifest = {}) {
  const lines = [];
  const s = manifest.summary || {};
  lines.push(`# Old Product Semiauto Pipeline ${manifest.businessDate || ''}`);
  lines.push('');
  lines.push(`Status: ${s.status || ''}`);
  lines.push(`Candidates: ${s.candidates || 0}; market missing: ${s.marketEvidenceMissing || 0}; coverage insufficient: ${s.coverageInsufficient || 0}; approved actions: ${s.approvedActionRows || 0}.`);
  lines.push(`Market evidence commands: ${s.marketEvidenceCommands || 0}; executed: ${s.marketEvidenceExecuted ? 'yes' : 'no'}.`);
  lines.push('');
  lines.push('## Files');
  for (const [key, file] of Object.entries(manifest.files || {})) {
    if (file) lines.push(`- ${key}: ${file}`);
  }
  if (manifest.nextAfterOperatorApproval?.command) {
    lines.push('');
    lines.push('## After Operator Approval');
    lines.push('Edit only the operator approval JSON, then rerun:');
    lines.push('');
    lines.push('```powershell');
    lines.push(manifest.nextAfterOperatorApproval.command);
    lines.push('```');
  }
  return lines.join('\n');
}

function oldProductMaintenanceFiles(taskDir, snapshotDir, date, suffix) {
  return {
    outFile: defaultTaskFile(taskDir, 'old_product_maintenance', date, suffix),
    markdownFile: defaultTaskFile(taskDir, 'old_product_maintenance', date, suffix, 'md'),
    marketEvidenceQueueOutFile: defaultTaskFile(taskDir, 'old_product_market_evidence_queue', date, suffix),
    candidateConfirmationOutFile: defaultTaskFile(taskDir, 'old_product_candidate_confirmation', date, suffix),
    pendingConfirmationActionsOutFile: defaultTaskFile(taskDir, 'old_product_pending_confirmation_actions', date, suffix),
    manualSuggestionQueueOutFile: defaultTaskFile(taskDir, 'old_product_manual_suggestion_queue', date, suffix),
    approvedActionsOutFile: path.join(snapshotDir, `action_schema_${date}_old_product_approved_${suffix}.json`),
    watchlistOutFile: defaultTaskFile(taskDir, 'old_product_watchlist_delta', date, suffix),
    executionHandoffOutFile: defaultTaskFile(taskDir, 'old_product_approved_execution_handoff', date, suffix),
  };
}

function runMaintenanceStage({ businessDate, dataDate, allSkuReviewFile, depositStatusFile, snapshotFile, taskDir, snapshotDir, suffix, skuWatchlistFile, maxCandidates }) {
  return runOldProductMaintenance({
    businessDate,
    dataDate,
    allSkuReviewFile,
    depositStatusFile,
    snapshotFile,
    skuWatchlistFile,
    maxCandidates,
    ...oldProductMaintenanceFiles(taskDir, snapshotDir, businessDate, suffix),
  });
}

function runOldProductSemiautoPipeline(options = {}) {
  const businessDate = dateOnly(options.businessDate || options.date || new Date());
  const dataDate = dateOnly(options.dataDate || businessDate);
  const taskDir = resolveRoot(options.taskDir || path.join(ROOT, 'data', 'tasks'));
  const snapshotDir = resolveRoot(options.snapshotDir || path.join(ROOT, 'data', 'snapshots'));
  const agentDir = resolveRoot(options.agentDir || path.join(ROOT, 'data', 'agent'));
  const snapshotFile = resolveRoot(options.snapshotFile || path.join(snapshotDir, 'latest_snapshot.json'));
  const depositStatusSourceFile = resolveRoot(options.depositStatusFile || '');
  const depositStatusMirrorFile = depositStatusSourceFile
    ? mirrorJsonFile(
      depositStatusSourceFile,
      defaultTaskFile(taskDir, 'old_product_daily_deposit_status', businessDate, 'semiauto')
    )
    : '';
  const depositStatusFile = depositStatusMirrorFile || depositStatusSourceFile;
  const skuWatchlistFile = resolveRoot(options.skuWatchlistFile || path.join(taskDir, 'sku_watchlist.json'));
  const marketEvidenceOutputRoot = resolveRoot(options.marketEvidenceOutputRoot || path.join(snapshotDir, 'old_product_market_evidence'));
  const maxCandidates = Number(options.maxCandidates || 20);
  const maxMarketItems = Number(options.maxMarketItems || maxCandidates);
  const runMarketEvidence = options.runMarketEvidence === true;

  const initialAllSkuReviewJson = defaultTaskFile(taskDir, 'all_sku_operating_review', businessDate, 'old_product_initial');
  const initialAllSkuReviewHtml = defaultTaskFile(taskDir, 'all_sku_operating_review', businessDate, 'old_product_initial', 'html');
  const initialReview = runAllSkuOperatingReview({
    businessDate,
    dataDate,
    snapshotFile,
    outFile: initialAllSkuReviewJson,
    htmlFile: initialAllSkuReviewHtml,
  });

  const initialMaintenance = runMaintenanceStage({
    businessDate,
    dataDate,
    allSkuReviewFile: initialAllSkuReviewJson,
    depositStatusFile,
    snapshotFile,
    taskDir,
    snapshotDir,
    suffix: 'initial',
    skuWatchlistFile,
    maxCandidates,
  });

  const marketHubFile = path.join(agentDir, `old_product_market_evidence_hub_${businessDate}_semiauto.json`);
  const marketHubMarkdownFile = path.join(agentDir, `old_product_market_evidence_hub_${businessDate}_semiauto.md`);
  const marketAggregateFile = defaultTaskFile(taskDir, 'old_product_market_selection_reports', businessDate, 'semiauto_scoped');
  let marketEvidence = runOldProductMarketEvidenceQueue({
    businessDate,
    queueFile: initialMaintenance.files.marketEvidenceQueueOutFile,
    outputRoot: marketEvidenceOutputRoot,
    maxItems: maxMarketItems,
    hubFile: marketHubFile,
    markdownFile: marketHubMarkdownFile,
    aggregateOutFile: marketAggregateFile,
  });

  let commandReport = null;
  const commandResultsFile = path.join(agentDir, `old_product_market_evidence_command_results_${businessDate}_semiauto.json`);
  if (runMarketEvidence) {
    commandReport = runAgentCommandRunner({
      hubFile: marketHubFile,
      outFile: commandResultsFile,
      commandTimeoutMs: Number(options.commandTimeoutMs || 180000),
    });
    marketEvidence = runOldProductMarketEvidenceQueue({
      businessDate,
      queueFile: initialMaintenance.files.marketEvidenceQueueOutFile,
      outputRoot: marketEvidenceOutputRoot,
      maxItems: maxMarketItems,
      hubFile: marketHubFile,
      markdownFile: marketHubMarkdownFile,
      aggregateOutFile: marketAggregateFile,
    });
  }

  const finalAllSkuReviewJson = defaultTaskFile(taskDir, 'all_sku_operating_review', businessDate, 'old_product_market_scoped');
  const finalAllSkuReviewHtml = defaultTaskFile(taskDir, 'all_sku_operating_review', businessDate, 'old_product_market_scoped', 'html');
  const finalReview = runAllSkuOperatingReview({
    businessDate,
    dataDate,
    snapshotFile,
    selectionReportsFile: marketAggregateFile,
    outFile: finalAllSkuReviewJson,
    htmlFile: finalAllSkuReviewHtml,
  });

  const finalMaintenance = runMaintenanceStage({
    businessDate,
    dataDate,
    allSkuReviewFile: finalAllSkuReviewJson,
    depositStatusFile,
    snapshotFile,
    taskDir,
    snapshotDir,
    suffix: 'market_scoped',
    skuWatchlistFile,
    maxCandidates,
  });
  if (finalMaintenance.files.approvedActionsOutFile && !fs.existsSync(finalMaintenance.files.approvedActionsOutFile)) {
    writeJson(finalMaintenance.files.approvedActionsOutFile, finalMaintenance.plan.approvedActionSchema || []);
  }
  const operatorApprovalFile = defaultTaskFile(taskDir, 'old_product_operator_approval_template', businessDate, 'market_scoped');
  const operatorApprovalMarkdownFile = defaultTaskFile(taskDir, 'old_product_operator_approval_template', businessDate, 'market_scoped', 'md');
  const operatorApprovalPack = buildOldProductOperatorApprovalPack({
    businessDate,
    candidateConfirmationList: finalMaintenance.plan.candidateConfirmationList,
    pendingConfirmationActions: finalMaintenance.plan.pendingConfirmationActions,
    manualSuggestionQueue: finalMaintenance.plan.manualSuggestionQueue,
  });
  writeJson(operatorApprovalFile, operatorApprovalPack);
  writeText(operatorApprovalMarkdownFile, renderOldProductOperatorApprovalMarkdown(operatorApprovalPack));

  const manifestFile = resolveRoot(options.manifestFile || defaultTaskFile(taskDir, 'old_product_semiauto_pipeline', businessDate));
  const markdownFile = resolveRoot(options.markdownFile || defaultTaskFile(taskDir, 'old_product_semiauto_pipeline', businessDate, '', 'md'));
  const summary = finalMaintenance.plan.summary || {};
  const manifest = {
    generatedAt: new Date().toISOString(),
    businessDate,
    dataDate,
    mode: 'semi_auto',
    evidenceBoundary: 'daily deposit status + local snapshot + scoped read-only selection market evidence; no ad execution in this pipeline',
    summary: {
      status: 'semi_auto_operator_review',
      candidates: summary.candidates || 0,
      marketEvidenceMissing: summary.marketEvidenceMissing || 0,
      coverageInsufficient: summary.coverageInsufficient || 0,
      approvedActionRows: summary.approvedActionRows || 0,
      pendingConfirmationActions: summary.pendingConfirmationActions || 0,
      executionHandoffItems: summary.executionHandoffItems || 0,
      watchlistItems: summary.watchlistItems || 0,
      automationReadiness: summary.automationReadiness || 'keep_semi_auto',
      operatorApprovalNeededActions: operatorApprovalPack.summary.approvalNeededActions || 0,
      operatorManualSuggestionItems: operatorApprovalPack.summary.manualSuggestionItems || 0,
      marketEvidenceCommands: marketEvidence.plan.summary?.commands || 0,
      marketEvidenceExecuted: runMarketEvidence,
      marketEvidenceFailed: commandReport?.summary?.failed || 0,
      initialReadyForDecisionSupport: initialReview.review.summary?.marketAnalysis?.readyForDecisionSupport || 0,
      finalReadyForDecisionSupport: finalReview.review.summary?.marketAnalysis?.readyForDecisionSupport || 0,
    },
    stages: {
      initialAllSkuReview: initialReview.review.summary,
      initialOldProductMaintenance: initialMaintenance.plan.summary,
      marketEvidence: marketEvidence.plan.summary,
      marketEvidenceCommandRunner: commandReport?.summary || null,
      finalAllSkuReview: finalReview.review.summary,
      finalOldProductMaintenance: finalMaintenance.plan.summary,
    },
    files: {},
  };

  const files = {
    manifestFile,
    markdownFile,
    depositStatusMirrorJson: depositStatusMirrorFile,
    initialAllSkuReviewJson,
    initialAllSkuReviewHtml,
    initialOldProductMaintenanceJson: initialMaintenance.files.outFile,
    initialMarketEvidenceQueueJson: initialMaintenance.files.marketEvidenceQueueOutFile,
    marketHubFile,
    marketHubMarkdownFile,
    marketAggregateFile,
    marketCommandResultsFile: runMarketEvidence ? commandResultsFile : '',
    finalAllSkuReviewJson,
    finalAllSkuReviewHtml,
    finalOldProductMaintenanceJson: finalMaintenance.files.outFile,
    finalOldProductMaintenanceMarkdown: finalMaintenance.files.markdownFile,
    finalCandidateConfirmationJson: finalMaintenance.files.candidateConfirmationOutFile,
    finalPendingConfirmationActionsJson: finalMaintenance.files.pendingConfirmationActionsOutFile,
    finalManualSuggestionQueueJson: finalMaintenance.files.manualSuggestionQueueOutFile,
    operatorApprovalTemplateJson: operatorApprovalFile,
    operatorApprovalTemplateMarkdown: operatorApprovalMarkdownFile,
    finalApprovedActionsJson: finalMaintenance.files.approvedActionsOutFile,
    finalExecutionHandoffJson: finalMaintenance.files.executionHandoffOutFile,
    finalWatchlistDeltaJson: finalMaintenance.files.watchlistOutFile,
  };
  manifest.files = files;
  manifest.nextAfterOperatorApproval = {
    approvalFile: operatorApprovalFile,
    command: buildApprovalRerunCommand({
      businessDate,
      dataDate,
      snapshotFile,
      depositStatusFile,
      maxCandidates,
      files,
    }),
    expectedOutputs: {
      approvedActionsJson: files.finalApprovedActionsJson,
      executionHandoffJson: files.finalExecutionHandoffJson,
      watchlistDeltaJson: files.finalWatchlistDeltaJson,
    },
  };
  writeJson(manifestFile, manifest);
  writeText(markdownFile, renderManifestMarkdown(manifest));
  return {
    manifest,
    files,
    initialReview,
    initialMaintenance,
    marketEvidence,
    commandReport,
    finalReview,
    finalMaintenance,
  };
}

module.exports = {
  runOldProductSemiautoPipeline,
};
