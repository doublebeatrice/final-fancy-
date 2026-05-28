const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizeAgentTask } = require('./agent_control_plane');

const ROOT = path.join(__dirname, '..');
const DEFAULT_LEARNING_DIR = path.join(ROOT, 'data', 'learning', 'corrections');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function stableHash(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.map(text).join('|'))
    .digest('hex')
    .slice(0, 12);
}

function firstMatch(raw, pattern) {
  const match = text(raw).match(pattern);
  return match ? match[1] || match[0] : '';
}

function extractAsin(raw) {
  return firstMatch(raw, /(?:\/dp\/|\/gp\/product\/|\b)(B[0-9A-Z]{9})(?:[/?\s]|$)/i).toUpperCase();
}

function extractSku(raw) {
  const withoutAsin = text(raw).replace(/B[0-9A-Z]{9}/ig, ' ');
  const match = withoutAsin.match(/\b[A-Z]{2,6}\d{3,5}[A-Z0-9-]*\b/);
  return match ? match[0].toUpperCase() : '';
}

function lower(raw) {
  return text(raw).toLowerCase();
}

function hasAny(raw, patterns = []) {
  const value = lower(raw);
  return patterns.some(pattern => pattern.test ? pattern.test(value) : value.includes(String(pattern).toLowerCase()));
}

function hasRiskAsInactionExcuse(raw = '') {
  const value = lower(raw);
  const mentionsRisk = /risk|\u98ce\u9669/.test(value);
  const mentionsInactionExcuse = /excuse|do[-\s]?nothing|not\s+act|avoid(?:ing)?\s+(?:the\s+)?(?:work|action)|should\s+have\s+done|only\s+low[-\s]?risk|failed\s+to\s+act|\u501f\u53e3|\u4e0d\u5e94\u8be5|\u4e0d\u505a|\u6ca1\u6709\u505a|\u53ea\u505a|\u4f4e\u98ce\u9669|\u5e94\u8be5\u505a|\u8be5\u505a|\u8fd0\u8425\u8be5\u505a|\u8fd0\u8425\u52a8\u4f5c|\u63a8\u8fdb/.test(value);
  return mentionsRisk && mentionsInactionExcuse;
}

function correctionSignals(raw = '') {
  const signals = [];
  if (hasRiskAsInactionExcuse(raw)) {
    signals.push('risk_as_inaction_excuse');
  }
  if (hasAny(raw, [/旧数据|数据不新|不是今天|过期|stale|date|snapshot|快照|data date/i])) {
    signals.push('stale_or_wrong_data');
  }
  if (hasAny(raw, [/没看|没有证据|没查|未核实|凭感觉|evidence|missing evidence|no proof/i])) {
    signals.push('missing_evidence');
  }
  if (hasAny(raw, [/范围|不在.*范围|不是这个|全量|漏看|漏了|scope|out of scope|wrong sku/i])) {
    signals.push('scope_boundary_gap');
  }
  if (hasAny(raw, [/关错|开错|调错|降错|提错|预算|bid|budget|pause|enable|执行错|落地错|wrong action/i])) {
    signals.push('wrong_or_risky_write');
  }
  if (hasAny(raw, [/listing|标题|文案|search term|价格|price|库存|inventory/i])) {
    signals.push('high_impact_surface');
  }
  if (hasAny(raw, [/同类|同样|规则|批量|全局|以后|所有|pattern|rule|batch/i])) {
    signals.push('repeated_pattern_risk');
  }
  if (hasAny(raw, [/often|repeated|pattern|rule|batch|\u7ecf\u5e38|\u4ee5\u540e|\u540c\u7c7b|\u540c\u6837|\u89c4\u5219|\u6279\u91cf|\u5168\u5c40/i])) {
    signals.push('repeated_pattern_risk');
  }
  if (hasAny(raw, [/未落地|没落地|api success|verify|回查|not landed|landed/i])) {
    signals.push('landing_verification_gap');
  }
  if (signals.length === 0) signals.push('operator_disagrees_with_decision');
  return [...new Set(signals)];
}

function classifySurface(raw = '') {
  const value = lower(raw);
  if (hasRiskAsInactionExcuse(raw)) return 'agent_operating_behavior';
  if (/listing|标题|文案|bullet|description|search term/.test(value)) return 'listing';
  if (/价格|price/.test(value)) return 'price';
  if (/库存|inventory|补货|清仓/.test(value)) return 'inventory';
  if (/预算|budget/.test(value)) return 'ad_budget';
  if (/bid|出价|竞价|降价|提价/.test(value)) return 'ad_bid';
  if (/pause|enable|暂停|开启|关错|开错/.test(value)) return 'ad_state';
  if (/关键词|keyword|投词|词/.test(value)) return 'keyword';
  return 'general_decision';
}

function severityFor(signals = [], surface = '') {
  if (signals.includes('risk_as_inaction_excuse')) return 'high';
  if (signals.includes('wrong_or_risky_write') && signals.includes('repeated_pattern_risk')) return 'critical';
  if (['listing', 'price', 'ad_budget', 'ad_state'].includes(surface) && signals.includes('wrong_or_risky_write')) return 'critical';
  if (signals.includes('wrong_or_risky_write')) return 'high';
  if (signals.includes('stale_or_wrong_data') || signals.includes('scope_boundary_gap')) return 'high';
  if (signals.includes('missing_evidence') || signals.includes('landing_verification_gap')) return 'medium';
  return 'medium';
}

function requiredChecksFor(signals = [], surface = '') {
  const checks = [
    'read_latest_daily_learning_and_final_run_landing',
    'verify_latest_snapshot_businessDate_dataDate_sourceRunId',
    'inspect_related_action_schema_and_execution_verify',
    'inspect_adjustment_log_for_same_sku_or_same_entity',
  ];
  if (signals.includes('stale_or_wrong_data')) checks.push('compare_decision_inputs_against_fresh_backend_snapshot');
  if (signals.includes('missing_evidence')) checks.push('enumerate_required_evidence_and_mark_missing_fields');
  if (signals.includes('scope_boundary_gap')) checks.push('recheck_operation_scope_and_allowed_sku_boundary');
  if (signals.includes('wrong_or_risky_write')) checks.push('read_backend_landed_state_and_prepare_rollback_or_secondary_action_review');
  if (signals.includes('repeated_pattern_risk')) checks.push('scan_last_7_to_30_days_for_same_rule_or_same_reason_actions');
  if (signals.includes('landing_verification_gap')) checks.push('rerun_landing_verification_before_any_new_write');
  if (signals.includes('risk_as_inaction_excuse')) {
    checks.push('classify_risk_as_execution_design_not_stop_reason');
    checks.push('route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker');
    checks.push('create_capability_or_escalation_task_when_action_is_not_yet_supported');
  }
  if (['listing', 'price'].includes(surface)) checks.push('freeze_same_surface_auto_execution_until_boundary_is_reconfirmed');
  return [...new Set(checks)];
}

function immediateControlsFor(severity = '', signals = [], surface = '') {
  const controls = ['record_operator_correction_as_authoritative_feedback'];
  const isRiskAsInactionExcuse = signals.includes('risk_as_inaction_excuse');
  if (['critical', 'high'].includes(severity) && !isRiskAsInactionExcuse) {
    controls.push('freeze_same_rule_auto_execute_until_audit_closes');
    controls.push('require_human_visible_summary_before_next_same_surface_write');
  }
  if (['critical', 'high'].includes(severity) && isRiskAsInactionExcuse) {
    controls.push('require_human_visible_summary_before_next_same_surface_write');
  }
  if (signals.includes('wrong_or_risky_write')) controls.push('do_not_repeat_same_write_without_landed_state_and_rollback_check');
  if (signals.includes('stale_or_wrong_data')) controls.push('block_decisions_from_reusing_the_stale_snapshot');
  if (signals.includes('repeated_pattern_risk')) controls.push('scan_recent_batch_actions_before_treating_this_as_one_off');
  if (isRiskAsInactionExcuse) {
    controls.push('risk_level_must_not_be_used_as_do_nothing_reason');
    controls.push('supported_operating_actions_must_route_to_execution_path');
    controls.push('unsupported_actions_must_create_capability_or_escalation_task');
  }
  if (['listing', 'price'].includes(surface)) controls.push('route_future_same_surface_writes_through_boundary_release');
  return [...new Set(controls)];
}

function correctionEvent(input = {}, timeContext = {}) {
  const rawText = text(input.text || input.message || input.rawInput || input.correction);
  const businessDate = dateOnly(input.businessDate || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(input.dataDate || timeContext.dataDate || businessDate);
  const subject = {
    sku: text(input.subject?.sku || input.sku || extractSku(rawText)),
    asin: text(input.subject?.asin || input.asin || extractAsin(rawText)),
    keyword: text(input.subject?.keyword || input.keyword || ''),
    entityId: text(input.subject?.entityId || input.entityId || input.id || ''),
  };
  const signals = correctionSignals(rawText);
  const surface = text(input.surface || classifySurface(rawText));
  const severity = text(input.severity || severityFor(signals, surface));
  const id = text(input.correctionId) || `correction_${businessDate}_${stableHash([
    rawText,
    subject.sku,
    subject.asin,
    subject.entityId,
    input.sourceRunId || timeContext.sourceRunId || '',
  ])}`;
  return {
    correctionId: id,
    receivedAt: text(input.receivedAt || timeContext.runAt || new Date().toISOString()),
    businessDate,
    dataDate,
    sourceRunId: text(input.sourceRunId || timeContext.sourceRunId || ''),
    rawText,
    operator: text(input.operator || input.requestedBy || 'operator'),
    subject,
    surface,
    severity,
    signals,
    relatedFiles: list(input.relatedFiles),
    relatedActionIds: list(input.relatedActionIds || input.actionIds),
  };
}

function riskCategoriesFor(event = {}) {
  const categories = [];
  if (event.signals.includes('stale_or_wrong_data')) categories.push('data_freshness_risk');
  if (event.signals.includes('missing_evidence')) categories.push('evidence_contract_risk');
  if (event.signals.includes('scope_boundary_gap')) categories.push('scope_boundary_risk');
  if (event.signals.includes('wrong_or_risky_write')) categories.push('execution_decision_risk');
  if (event.signals.includes('landing_verification_gap')) categories.push('landing_verification_risk');
  if (event.signals.includes('repeated_pattern_risk')) categories.push('systemic_rule_risk');
  if (event.signals.includes('risk_as_inaction_excuse')) categories.push('operating_underreach_risk');
  if (categories.length === 0) categories.push('decision_quality_risk');
  return categories;
}

function subjectTitle(subject = {}) {
  return text(subject.sku) || text(subject.asin) || text(subject.keyword) || text(subject.entityId) || 'general';
}

function buildRiskTasks(event = {}, audit = {}, timeContext = {}) {
  const base = {
    businessDate: event.businessDate,
    dataDate: event.dataDate,
    sourceRunId: event.sourceRunId || timeContext.sourceRunId || '',
    subject: event.subject,
    requestedBy: event.operator,
    evidence: [
      `correctionId=${event.correctionId}`,
      `severity=${event.severity}`,
      `surface=${event.surface}`,
      ...event.signals.map(signal => `signal=${signal}`),
    ],
    rawInput: event.rawText,
  };
  const priority = event.severity === 'critical' ? 'P0' : (event.severity === 'high' ? 'P1' : 'P2');
  const tasks = [
    normalizeAgentTask({
      ...base,
      source: 'correction_risk',
      kind: 'operator_correction_risk_audit',
      title: `${subjectTitle(event.subject)} operator correction risk audit`,
      description: 'Operator correction must trigger system risk inspection before repeating the same decision pattern.',
      priority,
      status: 'new',
      dueDate: event.businessDate,
      evidenceRequirements: audit.requiredChecks,
      authorizationHint: audit.immediateControls,
    }, timeContext),
    normalizeAgentTask({
      ...base,
      source: 'correction_risk',
      kind: 'same_rule_scan',
      title: `${subjectTitle(event.subject)} same-rule recent action scan`,
      description: 'Scan recent actions for the same rule, reason, surface, SKU, or entity so the correction is not treated as isolated.',
      priority,
      status: 'new',
      dueDate: event.businessDate,
      evidenceRequirements: ['adjustment_log_7d_30d', 'action_schema_history', 'daily_learning_history'],
      authorizationHint: ['read_only_scan', 'no_new_write_until_scan_done'],
    }, timeContext),
    normalizeAgentTask({
      ...base,
      source: 'correction_risk',
      kind: 'learning_patch',
      title: `${subjectTitle(event.subject)} correction learning patch`,
      description: 'Write a reusable lesson with scope, do-not-apply boundary, conflict status, and next validation.',
      priority: priority === 'P0' ? 'P1' : priority,
      status: 'new',
      dueDate: addDays(event.businessDate, 1),
      evidenceRequirements: ['correction_audit_report', 'lesson_scope', 'do_not_apply_when', 'next_validation'],
      authorizationHint: ['persist_long_term_learning'],
    }, timeContext),
  ];
  if (event.signals.includes('wrong_or_risky_write')) {
    tasks.push(normalizeAgentTask({
      ...base,
      source: 'correction_risk',
      kind: 'rollback_or_secondary_action_review',
      title: `${subjectTitle(event.subject)} rollback or secondary action review`,
      description: 'If the corrected decision was already written, verify landed state and decide rollback, secondary control, or no-op.',
      priority: 'P0',
      status: 'new',
      dueDate: event.businessDate,
      evidenceRequirements: ['backend_landed_state', 'execution_verify', 'pre_action_baseline', 'current_impact_metrics'],
      authorizationHint: ['schema_required_for_any_rollback_write', 'dry_run_and_landing_verification_required'],
    }, timeContext));
  }
  if (event.signals.includes('risk_as_inaction_excuse')) {
    tasks.push(normalizeAgentTask({
      ...base,
      source: 'correction_risk',
      kind: 'execution_path_repair',
      title: `${subjectTitle(event.subject)} risk-as-inaction execution path repair`,
      description: 'Risk must change evidence, boundary, batch size, dry-run, approval, and follow-up design; it must not turn a supported operating action into a no-op.',
      priority,
      status: 'new',
      dueDate: event.businessDate,
      evidenceRequirements: ['supported_action_inventory', 'capability_boundary', 'action_schema_or_capability_gap', 'dry_run_or_explicit_next_action'],
      authorizationHint: ['risk_is_routing_not_refusal', 'execute_supported_operating_actions', 'create_capability_or_escalation_task_for_unsupported_actions'],
    }, timeContext));
  }
  return tasks;
}

function buildLearningPatch(event = {}, audit = {}) {
  const subject = subjectTitle(event.subject);
  const isRiskAsInactionExcuse = event.signals.includes('risk_as_inaction_excuse');
  return {
    lessonId: `lesson_${event.correctionId}`,
    type: 'operator_correction',
    status: 'active_correction',
    severity: event.severity,
    subject,
    surface: event.surface,
    scope: {
      sku: event.subject.sku,
      asin: event.subject.asin,
      keyword: event.subject.keyword,
      entityId: event.subject.entityId,
      appliesTo: [
        event.surface,
        ...event.signals,
      ].filter(Boolean),
    },
    doNotApplyWhen: [
      'latest snapshot or backend readback is missing',
      'decision evidence cannot be tied to the current businessDate/dataDate',
      'same rule has an unresolved correction audit',
      'landing verification for the previous write is missing or contradictory',
      ...(event.signals.includes('scope_boundary_gap') ? ['SKU is outside the confirmed operation scope'] : []),
      ...(event.signals.includes('missing_evidence') ? ['required evidence fields are unavailable or stale'] : []),
      ...(isRiskAsInactionExcuse ? [
        'risk level is the only reason to skip a supported operating action',
        'a supported operating action has not been routed to evidence, boundary, dry-run, execution, or an explicit unsupported gap',
      ] : []),
    ],
    requiredEvidenceBeforeReuse: audit.requiredChecks,
    immediateControls: audit.immediateControls,
    operatingPrinciple: isRiskAsInactionExcuse
      ? 'Risk is routing, not refusal: it changes evidence, boundary, batch size, approval path, and follow-up, but it cannot be used to skip supported operating work.'
      : '',
    nextValidation: {
      dueDate: addDays(event.businessDate, 1),
      checks: [
        'confirm all generated risk tasks have owner and status',
        'confirm same-rule scan found zero unresolved high-risk repeats or generated follow-up tasks',
        'confirm future daily decisions read this correction lesson before same-surface actions',
        ...(isRiskAsInactionExcuse ? ['confirm future supported operating actions route to execute path or explicit unsupported-gap task instead of no-op'] : []),
      ],
    },
    sourceCorrection: {
      correctionId: event.correctionId,
      rawText: event.rawText,
      sourceRunId: event.sourceRunId,
      businessDate: event.businessDate,
      dataDate: event.dataDate,
    },
  };
}

function buildCorrectionRiskReport(input = {}, timeContext = {}) {
  const event = correctionEvent(input, timeContext);
  const audit = {
    auditId: `risk_audit_${event.correctionId.replace(/^correction_/, '')}`,
    severity: event.severity,
    surface: event.surface,
    categories: riskCategoriesFor(event),
    requiredChecks: requiredChecksFor(event.signals, event.surface),
    immediateControls: immediateControlsFor(event.severity, event.signals, event.surface),
  };
  const tasks = buildRiskTasks(event, audit, timeContext);
  const learningPatch = buildLearningPatch(event, audit);
  return {
    generatedAt: text(timeContext.runAt || event.receivedAt || new Date().toISOString()),
    businessDate: event.businessDate,
    dataDate: event.dataDate,
    sourceRunId: event.sourceRunId || text(timeContext.sourceRunId || ''),
    correction: event,
    summary: {
      correctionId: event.correctionId,
      severity: event.severity,
      surface: event.surface,
      categoryCount: audit.categories.length,
      taskCount: tasks.length,
      requiresImmediateControl: ['critical', 'high'].includes(event.severity),
      freezeSameRuleAutoExecute: audit.immediateControls.includes('freeze_same_rule_auto_execute_until_audit_closes'),
    },
    audit,
    tasks,
    learningPatch,
    results: [{
      taskId: `correction_risk::${event.correctionId}`,
      label: 'operator correction risk audit',
      ok: true,
      exitCode: 0,
      summary: `${event.severity} correction risk audit generated for ${event.surface}; ${tasks.length} follow-up tasks created.`,
      report: {
        verdict: ['critical', 'high'].includes(event.severity) ? 'needs_action' : 'continue_watch',
        nextStep: audit.requiredChecks.join('; '),
      },
      outputFiles: [],
      at: text(timeContext.runAt || event.receivedAt || new Date().toISOString()),
      sourceRunId: event.sourceRunId || text(timeContext.sourceRunId || ''),
    }],
  };
}

function renderCorrectionRiskMarkdown(report = {}) {
  const event = report.correction || {};
  const audit = report.audit || {};
  const tasks = report.tasks || [];
  const lesson = report.learningPatch || {};
  const lines = [
    `# Operator Correction Risk Audit - ${event.correctionId || ''}`,
    '',
    `- businessDate: ${report.businessDate || ''}`,
    `- dataDate: ${report.dataDate || ''}`,
    `- severity: ${event.severity || ''}`,
    `- surface: ${event.surface || ''}`,
    `- subject: ${subjectTitle(event.subject || {})}`,
    `- sourceRunId: ${report.sourceRunId || ''}`,
    '',
    '## Correction',
    `- ${event.rawText || ''}`,
    '',
    '## Risk Categories',
    ...(audit.categories || []).map(item => `- ${item}`),
    '',
    '## Immediate Controls',
    ...(audit.immediateControls || []).map(item => `- ${item}`),
    '',
    '## Required Checks',
    ...(audit.requiredChecks || []).map(item => `- ${item}`),
    '',
    '## Follow-Up Tasks',
    ...(tasks.length ? tasks.map(task => `- ${task.priority} ${task.kind}: ${task.title} due ${task.dueDate || 'n/a'}`) : ['- none']),
    '',
    '## Long-Term Learning Patch',
    `- lessonId: ${lesson.lessonId || ''}`,
    `- status: ${lesson.status || ''}`,
    ...(lesson.operatingPrinciple ? [`- operatingPrinciple: ${lesson.operatingPrinciple}`] : []),
    '- doNotApplyWhen:',
    ...((lesson.doNotApplyWhen || []).map(item => `  - ${item}`)),
    '',
  ];
  return lines.join('\n');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function persistCorrectionRiskReport(report = {}, options = {}) {
  const today = dateOnly(report.businessDate || new Date().toISOString());
  const correctionId = text(report.correction?.correctionId || `correction_${today}`);
  const outFile = options.outFile || path.join(ROOT, 'data', 'agent', `correction_risk_${today}.json`);
  const mdFile = options.mdFile || outFile.replace(/\.json$/i, '.md');
  const learningDir = options.learningDir || DEFAULT_LEARNING_DIR;
  const learningJsonFile = options.learningJsonFile || path.join(learningDir, `${correctionId}.json`);
  const learningMdFile = options.learningMdFile || path.join(learningDir, `${correctionId}.md`);
  const persisted = {
    ...report,
    files: {
      outFile,
      mdFile,
      learningJsonFile,
      learningMdFile,
    },
  };
  persisted.results = (persisted.results || []).map(result => ({
    ...result,
    outputFiles: [outFile, mdFile, learningJsonFile, learningMdFile],
  }));
  writeJson(outFile, persisted);
  writeText(mdFile, renderCorrectionRiskMarkdown(persisted));
  writeJson(learningJsonFile, persisted.learningPatch);
  writeText(learningMdFile, renderCorrectionRiskMarkdown(persisted));
  return persisted;
}

module.exports = {
  DEFAULT_LEARNING_DIR,
  buildCorrectionRiskReport,
  classifySurface,
  correctionEvent,
  correctionSignals,
  persistCorrectionRiskReport,
  renderCorrectionRiskMarkdown,
  requiredChecksFor,
  severityFor,
};
