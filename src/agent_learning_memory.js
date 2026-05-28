const fs = require('fs');
const path = require('path');
const { normalizeAgentTask } = require('./agent_control_plane');

const ROOT = path.join(__dirname, '..');
const LEARNING_DIR = path.join(ROOT, 'data', 'learning');
const CORRECTION_DIR = path.join(LEARNING_DIR, 'corrections');
const SKU_LESSON_DIR = path.join(LEARNING_DIR, 'sku_lessons');
const ACTIVE_CORRECTION_STATUSES = ['active', 'active_correction', 'needs_operator_review', 'conflict_watch', 'unresolved'];

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

function readJson(file, fallback = null) {
  if (!file) return fallback;
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

function listFiles(dir, predicate = () => true) {
  try {
    return fs.readdirSync(dir)
      .map(name => path.join(dir, name))
      .filter(file => fs.statSync(file).isFile())
      .filter(predicate)
      .sort();
  } catch (error) {
    return [];
  }
}

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function defaultLearningFile(date) {
  return path.join(LEARNING_DIR, `daily_learning_${date}.json`);
}

function defaultAgentFile(prefix, date, ext = 'json') {
  return path.join(ROOT, 'data', 'agent', `${prefix}_${date}.${ext}`);
}

function normalizeCorrectionLesson(raw = {}, file = '') {
  const status = text(raw.status || raw.learningPatch?.status || '');
  const active = !status || ACTIVE_CORRECTION_STATUSES.includes(status);
  const nextValidation = raw.nextValidation || raw.learningPatch?.nextValidation || '';
  const appliesTo = unique(raw.scope?.appliesTo || raw.learningPatch?.scope?.appliesTo || raw.appliesTo || []);
  const immediateControls = unique(raw.immediateControls || raw.learningPatch?.immediateControls || []);
  return {
    id: text(raw.lessonId || raw.id || path.basename(file, path.extname(file))),
    status: status || 'active',
    active,
    source: 'operator_correction',
    sourceFile: relative(file),
    surface: text(raw.scope?.surface || raw.surface || ''),
    subject: raw.scope?.subject || raw.subject || {},
    lesson: text(raw.lesson || raw.summary || ''),
    appliesTo,
    immediateControls,
    doNotApplyWhen: unique(raw.doNotApplyWhen || raw.learningPatch?.doNotApplyWhen || []),
    requiredEvidenceBeforeReuse: unique(raw.requiredEvidenceBeforeReuse || raw.learningPatch?.requiredEvidenceBeforeReuse || []),
    nextValidation: typeof nextValidation === 'string'
      ? text(nextValidation)
      : unique([nextValidation.dueDate, ...(nextValidation.checks || [])]).join('; '),
  };
}

function correctionLessonSeverity(item = {}) {
  if (
    (item.appliesTo || []).includes('risk_as_inaction_excuse') ||
    (item.immediateControls || []).includes('risk_level_must_not_be_used_as_do_nothing_reason')
  ) {
    return 'warning';
  }
  return 'blocker';
}

function loadCorrectionLessons(dir = CORRECTION_DIR) {
  return listFiles(dir, file => file.endsWith('.json'))
    .map(file => normalizeCorrectionLesson(readJson(file, {}), file))
    .filter(item => item.active);
}

function normalizeSkuLesson(raw = {}, file = '') {
  const status = text(raw.status || '');
  return {
    id: text(raw.id || path.basename(file, path.extname(file))),
    status: status || 'active',
    active: !status || ['active', 'conflict_watch', 'narrowed'].includes(status),
    source: 'sku_lesson',
    sourceFile: relative(file),
    scope: raw.scope || {},
    lesson: text(raw.lesson || raw.summary || ''),
    doNotApplyWhen: unique(raw.doNotApplyWhen || []),
    transferableTo: unique(raw.transferableTo || []),
    confidence: text(raw.confidence || ''),
    nextValidation: text(raw.nextValidation || ''),
    conflictsWith: unique(raw.conflictsWith || []),
  };
}

function loadSkuLessons(dir = SKU_LESSON_DIR, limit = 50) {
  return listFiles(dir, file => file.endsWith('.json'))
    .map(file => normalizeSkuLesson(readJson(file, {}), file))
    .filter(item => item.active)
    .slice(-limit);
}

function dailyLearningConstraints(record = {}, file = '') {
  if (!record || typeof record !== 'object') return [];
  const constraints = [];
  const dataWarnings = unique(record.dataQuality?.warnings || []);
  for (const warning of dataWarnings) {
    constraints.push({
      id: `daily_data_warning:${warning}`,
      source: 'daily_learning',
      severity: 'warning',
      title: `Resolve or account for data warning: ${warning}`,
      evidenceFiles: [relative(file)],
      doNotApplyWhen: ['fresh evidence for this warning is missing'],
      requiredEvidenceBeforeReuse: ['latest snapshot freshness', 'daily data quality status'],
    });
  }
  const actionQualityStatus = text(record.decisions?.actionQuality?.status);
  if (actionQualityStatus && actionQualityStatus !== 'complete' && actionQualityStatus !== 'executed') {
    constraints.push({
      id: `daily_action_quality:${actionQualityStatus}`,
      source: 'daily_learning',
      severity: actionQualityStatus === 'dry_run_only' ? 'warning' : 'blocker',
      title: `Previous action quality was ${actionQualityStatus}`,
      evidenceFiles: [relative(file)],
      doNotApplyWhen: ['treat prior dry-run candidates as landed actions'],
      requiredEvidenceBeforeReuse: ['execution summary', 'execution verify', 'adjustment log final run'],
    });
  }
  const operatingClosureStatus = text(record.decisions?.operatingClosure?.status);
  if (operatingClosureStatus && !['complete', 'closed'].includes(operatingClosureStatus)) {
    constraints.push({
      id: `daily_operating_closure:${operatingClosureStatus}`,
      source: 'daily_learning',
      severity: 'warning',
      title: `Carry forward operating closure status: ${operatingClosureStatus}`,
      evidenceFiles: [relative(file)],
      requiredEvidenceBeforeReuse: ['primary plan action status', 'generated candidate closure', 'follow-up queue'],
    });
  }
  const questions = unique(record.carryForward?.openQuestions || []);
  for (const question of questions) {
    constraints.push({
      id: `carry_forward:${question.slice(0, 48)}`,
      source: 'daily_learning',
      severity: 'info',
      title: question,
      evidenceFiles: [relative(file)],
      requiredEvidenceBeforeReuse: ['1d/3d/7d effect evidence as applicable'],
    });
  }
  return constraints;
}

function autonomyConstraints(audit = {}, file = '') {
  const checks = Array.isArray(audit.checks) ? audit.checks : [];
  return checks
    .filter(check => check.status !== 'pass')
    .map(check => ({
      id: `autonomy:${check.id}`,
      source: 'autonomy_audit',
      severity: check.severity || 'warning',
      title: check.title || check.id,
      evidenceFiles: [relative(file)].concat(check.evidence || []),
      gaps: check.gaps || [],
      nextAction: check.nextAction || '',
      requiredEvidenceBeforeReuse: check.gaps || [],
    }));
}

function memoryTask(constraint = {}, context = {}) {
  if (constraint.severity === 'info') return null;
  return normalizeAgentTask({
    source: 'learning_memory',
    kind: 'learning_constraint',
    status: 'new',
    priority: constraint.severity === 'blocker' ? 'P0' : 'P1',
    title: constraint.title,
    description: constraint.nextAction || (constraint.requiredEvidenceBeforeReuse || []).join('; '),
    evidence: constraint.evidenceFiles || [],
    evidenceRequirements: constraint.requiredEvidenceBeforeReuse || [],
    subject: { entityId: constraint.id },
    businessDate: context.businessDate,
    dataDate: context.dataDate,
    dueDate: context.businessDate,
    sourceRunId: context.sourceRunId,
    rawInput: `learning_memory:${constraint.id}`,
  }, context);
}

function buildAgentLearningMemory(options = {}, timeContext = {}) {
  const businessDate = dateOnly(options.today || options.businessDate || timeContext.businessDate || timeContext.runAt);
  const dataDate = dateOnly(options.dataDate || timeContext.dataDate || businessDate);
  const generatedAt = text(timeContext.runAt || options.now || new Date().toISOString());
  const sourceRunId = text(timeContext.sourceRunId || options.sourceRunId || '');
  const learningFile = options.learningFile || defaultLearningFile(dataDate || businessDate);
  const autonomyAuditFile = options.autonomyAuditFile || defaultAgentFile('autonomy_audit', businessDate);
  const correctionDir = options.correctionDir || CORRECTION_DIR;
  const skuLessonDir = options.skuLessonDir || SKU_LESSON_DIR;
  const dailyLearning = options.dailyLearning || readJson(learningFile, {});
  const autonomyAudit = options.autonomyAudit || readJson(autonomyAuditFile, {});
  const corrections = loadCorrectionLessons(correctionDir);
  const skuLessons = loadSkuLessons(skuLessonDir);
  const constraints = [
    ...dailyLearningConstraints(dailyLearning, learningFile),
    ...autonomyConstraints(autonomyAudit, autonomyAuditFile),
    ...corrections.flatMap(item => item.doNotApplyWhen.map(rule => ({
      id: `correction:${item.id}:${rule.slice(0, 32)}`,
      source: 'operator_correction',
      severity: correctionLessonSeverity(item),
      title: rule,
      evidenceFiles: [item.sourceFile],
      doNotApplyWhen: item.doNotApplyWhen,
      requiredEvidenceBeforeReuse: item.requiredEvidenceBeforeReuse,
      nextAction: item.nextValidation,
    }))),
    ...skuLessons.flatMap(item => item.doNotApplyWhen.map(rule => ({
      id: `sku_lesson:${item.id}:${rule.slice(0, 32)}`,
      source: 'sku_lesson',
      severity: item.conflictsWith.length ? 'warning' : 'info',
      title: rule,
      evidenceFiles: [item.sourceFile],
      doNotApplyWhen: item.doNotApplyWhen,
      requiredEvidenceBeforeReuse: item.transferableTo,
      nextAction: item.nextValidation,
    }))),
  ];
  const context = { businessDate, dataDate, runAt: generatedAt, sourceRunId };
  const tasks = constraints.map(item => memoryTask(item, context)).filter(Boolean);
  const activeBlockers = constraints.filter(item => item.severity === 'blocker');
  const activeWarnings = constraints.filter(item => item.severity === 'warning');
  const mustRead = unique([
    relative(learningFile),
    relative(autonomyAuditFile),
    ...corrections.map(item => item.sourceFile),
    ...skuLessons.map(item => item.sourceFile),
  ]);
  return {
    generatedAt,
    businessDate,
    dataDate,
    sourceRunId,
    status: activeBlockers.length ? 'blocked_constraints' : (activeWarnings.length ? 'active_watch' : 'ready'),
    summary: {
      constraints: constraints.length,
      blockers: activeBlockers.length,
      warnings: activeWarnings.length,
      corrections: corrections.length,
      skuLessons: skuLessons.length,
      tasks: tasks.length,
      mustReadCount: mustRead.length,
    },
    sources: {
      learningFile,
      autonomyAuditFile,
      correctionDir,
      skuLessonDir,
    },
    nextRunBrief: {
      mustReadBeforeDecision: mustRead,
      evidenceBeforeReuse: unique(constraints.flatMap(item => item.requiredEvidenceBeforeReuse || [])),
      doNotApplyWhen: unique(constraints.flatMap(item => item.doNotApplyWhen || [])),
      openFollowUps: unique(constraints.map(item => item.nextAction).filter(Boolean)),
    },
    constraints,
    corrections,
    skuLessons,
    tasks,
  };
}

function renderAgentLearningMemoryMarkdown(memory = {}) {
  const lines = [];
  lines.push(`# Agent learning memory - ${memory.businessDate || ''}`);
  lines.push('');
  lines.push(`- Status: ${memory.status || 'unknown'}`);
  lines.push(`- Constraints: ${memory.summary?.constraints || 0}`);
  lines.push(`- Blockers: ${memory.summary?.blockers || 0}`);
  lines.push(`- Warnings: ${memory.summary?.warnings || 0}`);
  lines.push(`- Corrections: ${memory.summary?.corrections || 0}`);
  lines.push(`- SKU lessons: ${memory.summary?.skuLessons || 0}`);
  lines.push(`- Tasks: ${memory.summary?.tasks || 0}`);
  lines.push('');
  lines.push('## Must Read');
  for (const file of memory.nextRunBrief?.mustReadBeforeDecision || []) lines.push(`- ${file}`);
  lines.push('');
  lines.push('## Do Not Apply When');
  for (const item of memory.nextRunBrief?.doNotApplyWhen || []) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Evidence Before Reuse');
  for (const item of memory.nextRunBrief?.evidenceBeforeReuse || []) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Open Follow-Ups');
  for (const item of memory.nextRunBrief?.openFollowUps || []) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Constraint Tasks');
  for (const task of memory.tasks || []) lines.push(`- ${task.priority} ${task.taskId}: ${task.title}`);
  lines.push('');
  return lines.join('\n');
}

function persistAgentLearningMemory(memory = {}, options = {}) {
  const date = dateOnly(memory.businessDate || options.today);
  const outFile = options.outFile || defaultAgentFile('learning_memory', date);
  const markdownFile = options.markdownFile || defaultAgentFile('learning_memory', date, 'md');
  writeJson(outFile, memory);
  fs.mkdirSync(path.dirname(markdownFile), { recursive: true });
  fs.writeFileSync(markdownFile, renderAgentLearningMemoryMarkdown(memory), 'utf8');
  return { outFile, markdownFile };
}

module.exports = {
  buildAgentLearningMemory,
  dailyLearningConstraints,
  loadCorrectionLessons,
  loadSkuLessons,
  persistAgentLearningMemory,
  renderAgentLearningMemoryMarkdown,
};
