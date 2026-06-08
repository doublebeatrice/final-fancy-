const fs = require('fs');
const path = require('path');
const { buildEffectReviewReport } = require('../src/agent_effect_review');
const { collectAdSkuReviewEvidence } = require('../src/agent_review_evidence');
const { normalizeAgentTask, transitionAgentTask } = require('../src/agent_control_plane');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');
const DEFAULT_SKU_LESSON_DIR = path.join(ROOT, 'data', 'learning', 'sku_lessons');

function readJson(file, fallback = {}) {
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

function addDays(ymd, days) {
  const date = new Date(`${dateOnly(ymd)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function slug(value) {
  return text(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'task';
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function uniqueTasks(tasks = []) {
  const map = new Map();
  for (const task of tasks) {
    const key = text(task?.taskId);
    if (!key) continue;
    map.set(key, task);
  }
  return [...map.values()];
}

function ledgerTaskMap(ledger = {}) {
  const map = new Map();
  for (const source of [ledger.tasks, ledger.reviewTasks, ledger.nextOpenTasks]) {
    for (const task of Array.isArray(source) ? source : []) {
      const key = text(task.taskId);
      if (key && !map.has(key)) map.set(key, task);
    }
  }
  return map;
}

function updateTaskArray(tasks = [], updated = new Map()) {
  return (Array.isArray(tasks) ? tasks : []).map(task => updated.get(text(task.taskId)) || task);
}

function followupTaskForMiss(result = {}, task = {}, today = '', generatedAt = '') {
  const subject = task.subject || {};
  return normalizeAgentTask({
    taskId: `effect_review::direction_change::${slug(result.taskId || task.taskId)}`,
    source: 'effect_review',
    kind: 'direction_change_or_rollback',
    status: 'new',
    title: `${text(subject.sku || subject.asin || result.key || 'action')} rollback/direction-change after missed goal`,
    description: text(result.nextStep || 'Goal missed; review rollback or direction change.'),
    subject,
    priority: 'P1',
    dueDate: today,
    evidence: [
      `effect_review=${text(result.taskId || task.taskId)}`,
      ...((result.reasons || []).map(reason => `reason=${reason}`)),
    ],
    reviewOf: {
      ...(task.reviewOf || {}),
      effectReviewTaskId: text(result.taskId || task.taskId),
      verdict: text(result.verdict),
    },
  }, {
    businessDate: today,
    dataDate: today,
    runAt: generatedAt,
  });
}

function lessonForResult(result = {}, task = {}, today = '', generatedAt = '') {
  const subject = task.subject || {};
  const sku = text(subject.sku || result.key);
  const verdict = text(result.verdict);
  const recommendation = {
    goal_met: 'close_task_and_preserve_lane_learning',
    goal_partial: 'keep_review_open_and_refresh_evidence_before_scaling',
    goal_missed: 'create_rollback_or_direction_change_task',
  }[verdict] || 'refresh_evidence_before_judgement';
  return {
    id: `effect_review_${today}_${slug(result.taskId || task.taskId)}_${verdict}`,
    status: 'active',
    source: 'effect_review',
    generatedAt,
    businessDate: today,
    scope: {
      sku,
      asin: text(subject.asin),
      taskId: text(result.taskId || task.taskId),
      actionType: text(task.reviewOf?.actionType),
      entityType: text(task.reviewOf?.entityType),
      verdict,
    },
    condition: {
      baselineAsOf: text(result.baselineAsOf),
      currentAsOf: text(result.currentAsOf),
      currentStale: result.currentStale === true,
      baseline: result.baseline || null,
      current: result.current || null,
      reasons: Array.isArray(result.reasons) ? result.reasons.slice() : [],
    },
    apply: {
      recommendation,
      nextStep: text(result.nextStep),
      doNotCloseWhen: 'baselineAsOf_equals_currentAsOf_or_current_metrics_stale',
    },
    lesson: `${sku || text(result.key)} ${verdict}: ${text(result.nextStep)}`,
    confidence: result.currentStale ? 'low' : 'medium',
    nextValidation: 'Use this lesson before repeating the same SKU/action lane.',
  };
}

function writeSkuLessons(report = {}, tasksById = new Map(), lessonDir = DEFAULT_SKU_LESSON_DIR) {
  const generatedAt = text(report.generatedAt || new Date().toISOString());
  const today = dateOnly(report.today || generatedAt);
  const verdicts = new Set(['goal_met', 'goal_partial', 'goal_missed']);
  const files = [];
  fs.mkdirSync(lessonDir, { recursive: true });
  for (const result of report.results || []) {
    if (!verdicts.has(result.verdict)) continue;
    const task = tasksById.get(text(result.taskId)) || {};
    const lesson = lessonForResult(result, task, today, generatedAt);
    const file = path.join(lessonDir, `${slug(lesson.id)}.json`);
    writeJson(file, lesson);
    files.push(file);
  }
  return files;
}

function applyEffectReviewToLedger(ledger = {}, report = {}) {
  const generatedAt = text(report.generatedAt || new Date().toISOString());
  const today = dateOnly(report.today || generatedAt);
  const tasksById = ledgerTaskMap(ledger);
  const updated = new Map();
  const followups = [];
  const summary = {
    closed: 0,
    blocked: 0,
    rescheduled: 0,
    followupTasks: 0,
    missingLedgerTasks: 0,
  };

  for (const result of report.results || []) {
    const taskId = text(result.taskId);
    const task = tasksById.get(taskId);
    if (!task) {
      summary.missingLedgerTasks += 1;
      continue;
    }
    if (result.verdict === 'goal_met') {
      updated.set(taskId, transitionAgentTask(task, {
        type: 'close',
        actor: 'effect_review',
        at: generatedAt,
        conclusion: text(result.nextStep || 'effect review goal met'),
      }));
      summary.closed += 1;
    } else if (result.verdict === 'goal_missed') {
      updated.set(taskId, transitionAgentTask(task, {
        type: 'block',
        actor: 'effect_review',
        at: generatedAt,
        note: text(result.nextStep || 'effect review goal missed'),
      }));
      const followup = followupTaskForMiss(result, task, today, generatedAt);
      if (!tasksById.has(followup.taskId)) followups.push(followup);
      summary.blocked += 1;
      summary.followupTasks += 1;
    } else if (result.verdict === 'goal_partial' || result.verdict === 'early_window') {
      updated.set(taskId, transitionAgentTask(task, {
        type: 'schedule_review',
        actor: 'effect_review',
        at: generatedAt,
        dueDate: addDays(today, 1),
        note: text(result.nextStep || 'effect review remains open'),
      }));
      summary.rescheduled += 1;
    } else if (result.verdict === 'needs_data') {
      updated.set(taskId, transitionAgentTask(task, {
        type: 'block',
        actor: 'effect_review',
        at: generatedAt,
        note: text(result.nextStep || 'effect review needs data'),
      }));
      summary.blocked += 1;
    }
  }

  const tasks = Array.isArray(ledger.tasks) ? [...updateTaskArray(ledger.tasks, updated), ...followups] : ledger.tasks;
  const reviewTasks = Array.isArray(ledger.reviewTasks) ? updateTaskArray(ledger.reviewTasks, updated) : ledger.reviewTasks;
  const nextOpenTasks = uniqueTasks([
    ...updateTaskArray(Array.isArray(ledger.nextOpenTasks) ? ledger.nextOpenTasks : [], updated),
    ...(Array.isArray(tasks) ? tasks : []),
    ...(Array.isArray(reviewTasks) ? reviewTasks : []),
    ...followups,
  ]).filter(task => task.status !== 'closed');

  return {
    ...ledger,
    generatedAt,
    businessDate: today,
    summary: {
      ...(ledger.summary || {}),
      nextOpenTaskCount: nextOpenTasks.length,
      byStatus: countBy(nextOpenTasks, task => task.status),
      effectReviewWriteBack: summary,
    },
    ...(Array.isArray(tasks) ? { tasks } : {}),
    ...(Array.isArray(reviewTasks) ? { reviewTasks } : {}),
    nextOpenTasks,
  };
}

function loadQueue(options = {}) {
  if (options.queue) return options.queue;
  if (!options.queueFile) return {};
  if (!fs.existsSync(options.queueFile)) {
    throw new Error(`review queue file not found: ${options.queueFile}`);
  }
  return readJson(options.queueFile, {});
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    queueFile: get('--queue') || process.env.AGENT_REVIEW_QUEUE_FILE || '',
    evidenceFile: get('--evidence') || process.env.AGENT_REVIEW_EVIDENCE_FILE || '',
    collectEvidence: args.includes('--collect-evidence') || process.env.AGENT_REVIEW_COLLECT_EVIDENCE === '1',
    evidenceOutFile: get('--evidence-out') || process.env.AGENT_REVIEW_EVIDENCE_OUT || '',
    evidenceSourceDir: get('--evidence-source-dir') || process.env.AGENT_REVIEW_EVIDENCE_SOURCE_DIR || '',
    adSkuSummaryReportFile: get('--ad-sku-summary') || process.env.AGENT_REVIEW_AD_SKU_SUMMARY || '',
    snapshotFile: get('--snapshot') || process.env.AGENT_REVIEW_SNAPSHOT || '',
    inventoryReportFile: get('--inventory-report') || process.env.AGENT_REVIEW_INVENTORY_REPORT || '',
    profitReportFile: get('--profit-report') || process.env.AGENT_REVIEW_PROFIT_REPORT || '',
    keywordResearchReportFile: get('--keyword-research-report') || process.env.AGENT_REVIEW_KEYWORD_RESEARCH_REPORT || '',
    keywordConversionReportFile: get('--keyword-conversion-report') || process.env.AGENT_REVIEW_KEYWORD_CONVERSION_REPORT || '',
    abaSearchTermReportFile: get('--aba-report') || process.env.AGENT_REVIEW_ABA_REPORT || '',
    keywordSeasonalityReportFile: get('--seasonality-report') || process.env.AGENT_REVIEW_KEYWORD_SEASONALITY_REPORT || '',
    productTimeMachineReportFile: get('--product-time-machine-report') || process.env.AGENT_REVIEW_PRODUCT_TIME_MACHINE_REPORT || '',
    extendedSelectionReportFile: get('--extended-selection-report') || process.env.AGENT_REVIEW_EXTENDED_SELECTION_REPORT || '',
    siteId: get('--site-id') || process.env.SITE_ID || '4',
    day: get('--day') || process.env.DAY || '7',
    outFile: get('--out') || process.env.AGENT_EFFECT_REVIEW_OUT || '',
    today: get('--today') || process.env.AGENT_REVIEW_TODAY || '',
    ledgerFile: get('--ledger') || process.env.AGENT_EFFECT_REVIEW_LEDGER || '',
    ledgerOutFile: get('--ledger-out') || process.env.AGENT_EFFECT_REVIEW_LEDGER_OUT || '',
    writeBack: args.includes('--write-back') || process.env.AGENT_EFFECT_REVIEW_WRITE_BACK === '1',
    skuLessonDir: get('--sku-lesson-dir') || process.env.AGENT_EFFECT_REVIEW_SKU_LESSON_DIR || '',
  };
}

function defaultOutFile(today) {
  const ymd = today || new Date().toISOString().slice(0, 10);
  return path.join(DEFAULT_OUT_DIR, `effect_review_${ymd}.json`);
}

function runAgentEffectReview(options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const queue = loadQueue(options);
  let evidence = options.evidence || readJson(options.evidenceFile, {});
  let evidenceFile = options.evidenceFile || '';
  if (options.collectEvidence) {
    const collected = collectAdSkuReviewEvidence({
      queue,
      today,
      outFile: options.evidenceOutFile,
      outDir: options.evidenceSourceDir,
      adSkuSummaryReportFile: options.adSkuSummaryReportFile,
      adSkuSummaryReport: options.adSkuSummaryReport,
      snapshotFile: options.snapshotFile,
      inventoryReportFile: options.inventoryReportFile,
      profitReportFile: options.profitReportFile,
      keywordResearchReportFile: options.keywordResearchReportFile,
      keywordConversionReportFile: options.keywordConversionReportFile,
      abaSearchTermReportFile: options.abaSearchTermReportFile,
      keywordSeasonalityReportFile: options.keywordSeasonalityReportFile,
      productTimeMachineReportFile: options.productTimeMachineReportFile,
      extendedSelectionReportFile: options.extendedSelectionReportFile,
      inventoryReports: options.inventoryReports,
      profitReports: options.profitReports,
      selectionReports: options.selectionReports,
      siteId: options.siteId,
      day: options.day,
      execFileSync: options.execFileSync,
    });
    evidence = collected.evidence;
    evidenceFile = collected.evidenceFile;
  }
  const report = buildEffectReviewReport({
    queue,
    evidence,
    today,
  });
  if (evidenceFile) report.evidenceFile = evidenceFile;
  if (options.writeBack || options.ledger || options.ledgerFile || options.ledgerOutFile || options.skuLessonDir) {
    const ledger = options.ledger || readJson(options.ledgerFile, {});
    const tasksById = ledgerTaskMap(ledger);
    const lessonDir = options.skuLessonDir || DEFAULT_SKU_LESSON_DIR;
    const lessonFiles = options.writeBack ? writeSkuLessons(report, tasksById, lessonDir) : [];
    const updatedLedger = applyEffectReviewToLedger(ledger, report);
    const ledgerOutFile = options.ledgerOutFile || options.ledgerFile || '';
    if (options.writeBack && ledgerOutFile) writeJson(ledgerOutFile, updatedLedger);
    report.writeBack = {
      enabled: options.writeBack === true,
      ledgerFile: ledgerOutFile,
      skuLessonDir: lessonDir,
      skuLessonFiles: lessonFiles,
      ledgerSummary: updatedLedger.summary?.effectReviewWriteBack || {},
    };
  }
  const outFile = options.outFile || defaultOutFile(today);
  writeJson(outFile, report);
  return report;
}

function main() {
  const options = parseArgs(process.argv);
  const report = runAgentEffectReview(options);
  const outFile = options.outFile || defaultOutFile(report.today);
  console.log(JSON.stringify({
    ok: true,
    today: report.today,
    outFile,
    summary: report.summary,
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
  applyEffectReviewToLedger,
  loadQueue,
  parseArgs,
  runAgentEffectReview,
  writeSkuLessons,
};
