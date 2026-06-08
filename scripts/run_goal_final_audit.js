const fs = require('fs');
const path = require('path');
const {
  buildGoalFinalContinuity,
  dateOnly,
  defaultPaperFile,
  validateBossPaperGuard,
} = require('./run_agent_boss_daily_paper');

const ROOT = path.join(__dirname, '..');
const DEFAULT_AGENT_DIR = path.join(ROOT, 'data', 'agent');

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
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

function defaultJsonFile(today, agentDir = DEFAULT_AGENT_DIR) {
  return path.join(agentDir, `boss_daily_paper_${dateOnly(today)}.json`);
}

function defaultAuditFile(today, agentDir = DEFAULT_AGENT_DIR, ext = 'json') {
  return path.join(agentDir, `goal_final_audit_${dateOnly(today)}.${ext}`);
}

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : '';
  };
  return {
    today: dateOnly(get('--today') || process.env.AGENT_TODAY || 'today'),
    agentDir: get('--agent-dir') || process.env.AGENT_DIR || DEFAULT_AGENT_DIR,
    paperJson: get('--paper-json') || '',
    outFile: get('--out') || '',
    markdownFile: get('--md-out') || '',
    requireComplete: argv.includes('--require-complete'),
  };
}

function addBusinessDays(startDate, count) {
  let date = new Date(`${dateOnly(startDate)}T00:00:00.000Z`);
  let remaining = Number(count || 0);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function nextBusinessDays(today, count) {
  const days = [];
  for (let i = 1; i <= Number(count || 0); i += 1) {
    days.push(addBusinessDays(today, i));
  }
  return days;
}

function currentPaperGuard(report = {}, today = '', agentDir = DEFAULT_AGENT_DIR) {
  const paperFile = text(report.files?.paperFile) || defaultPaperFile(today, agentDir);
  if (!paperFile || !fs.existsSync(paperFile)) {
    return {
      exists: false,
      file: paperFile,
      guard: { status: 'missing', failures: ['missing_current_boss_paper_markdown'] },
    };
  }
  const content = fs.readFileSync(paperFile, 'utf8');
  return {
    exists: true,
    file: paperFile,
    guard: validateBossPaperGuard({ outFile: paperFile, content }),
  };
}

function continuityWithCurrentPaper(continuity = {}, paper = {}) {
  const today = text(continuity.today);
  const daily = (continuity.daily || []).map(day => ({ ...day, reasons: [...(day.reasons || [])] }));
  const todayRow = daily.find(day => day.date === today);
  const guardStatus = text(paper.guard?.status || '');
  if (todayRow && (!paper.exists || guardStatus !== 'pass')) {
    todayRow.present = todayRow.present && paper.exists;
    todayRow.pass = false;
    todayRow.guardStatus = guardStatus || 'missing';
    const reason = paper.exists
      ? `current_boss_paper_guard:${(paper.guard.failures || []).join(',') || 'fail'}`
      : 'missing_current_boss_paper_markdown';
    if (!todayRow.reasons.includes(reason)) todayRow.reasons.push(reason);
  }

  let currentStreak = 0;
  for (const day of daily) {
    if (!day.pass) break;
    currentStreak += 1;
  }
  const requiredBusinessDays = Number(continuity.requiredBusinessDays || 3);
  return {
    ...continuity,
    status: currentStreak >= requiredBusinessDays ? 'complete' : 'pending',
    currentStreak,
    requiredBusinessDays,
    daily,
    blockers: daily
      .filter(day => !day.pass)
      .map(day => ({
        date: day.date,
        reason: (day.reasons || []).join('; '),
        trace: day.jsonFile || day.paperFile,
      })),
  };
}

function buildGoalFinalAuditReport(options = {}) {
  const today = dateOnly(options.today || 'today');
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const paperJson = options.paperJson || defaultJsonFile(today, agentDir);
  const currentReport = options.currentReport || readJson(paperJson, null);
  const paper = options.currentPaper || (currentReport
    ? currentPaperGuard(currentReport, today, agentDir)
    : {
        exists: false,
        file: defaultPaperFile(today, agentDir),
        guard: { status: 'missing', failures: ['missing_current_boss_daily_paper_json'] },
      });
  const baseContinuity = options.continuity ||
    (currentReport
      ? buildGoalFinalContinuity(today, agentDir, currentReport)
      : {
          status: 'pending',
          requiredBusinessDays: 3,
          currentStreak: 0,
          today,
          daily: [{
            date: today,
            present: false,
            pass: false,
            reasons: ['missing_current_boss_daily_paper_json'],
            verificationStatus: 'missing',
            guardStatus: 'missing',
            paperFile: paper.file,
            jsonFile: paperJson,
          }],
          blockers: [{
            date: today,
            reason: 'missing_current_boss_daily_paper_json',
            trace: paperJson,
          }],
        });
  const continuity = continuityWithCurrentPaper(baseContinuity, paper);
  const required = Number(continuity.requiredBusinessDays || 3);
  const neededPassDays = Math.max(0, required - Number(continuity.currentStreak || 0));
  return {
    ok: continuity.status === 'complete',
    status: continuity.status,
    today,
    generatedAt: new Date().toISOString(),
    paperJson,
    currentPaper: {
      exists: paper.exists,
      file: paper.file,
      guardStatus: paper.guard?.status || 'missing',
      guardFailures: paper.guard?.failures || [],
    },
    goalFinal: continuity,
    summary: {
      currentStreak: continuity.currentStreak || 0,
      requiredBusinessDays: required,
      neededPassDays,
      nextRequiredBusinessDays: nextBusinessDays(today, neededPassDays),
      earliestCompletionDate: neededPassDays ? addBusinessDays(today, neededPassDays) : today,
    },
  };
}

function renderGoalFinalAudit(report = {}) {
  const blockers = report.goalFinal?.blockers || [];
  const daily = report.goalFinal?.daily || [];
  return [
    `# GOAL-FINAL audit - ${report.today || ''}`,
    '',
    `- status: ${report.status || 'pending'}`,
    `- streak: ${report.summary?.currentStreak || 0}/${report.summary?.requiredBusinessDays || 3}`,
    `- neededPassDays: ${report.summary?.neededPassDays || 0}`,
    `- earliestCompletionDate: ${report.summary?.earliestCompletionDate || '-'}`,
    `- currentPaper: ${report.currentPaper?.guardStatus || 'missing'} ${relative(report.currentPaper?.file)}`,
    '',
    '## Daily Evidence',
    ...daily.map(day => `- ${day.date}: pass=${day.pass ? 'true' : 'false'} verification=${day.verificationStatus || 'missing'} guard=${day.guardStatus || 'missing'} reasons=${(day.reasons || []).join('; ') || '-'}`),
    '',
    '## Blockers',
    ...(blockers.length
      ? blockers.map(item => `- ${item.date}: ${item.reason || '-'} trace=${relative(item.trace)}`)
      : ['- none']),
    '',
  ].join('\n');
}

function runGoalFinalAudit(options = {}) {
  const today = dateOnly(options.today || 'today');
  const agentDir = options.agentDir || DEFAULT_AGENT_DIR;
  const outFile = options.outFile || defaultAuditFile(today, agentDir, 'json');
  const markdownFile = options.markdownFile || defaultAuditFile(today, agentDir, 'md');
  const report = buildGoalFinalAuditReport({ ...options, today, agentDir });
  writeJson(outFile, report);
  writeText(markdownFile, renderGoalFinalAudit(report));
  return { ...report, files: { jsonFile: outFile, markdownFile } };
}

function main() {
  const options = parseArgs();
  const report = runGoalFinalAudit(options);
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    today: report.today,
    currentStreak: report.summary.currentStreak,
    requiredBusinessDays: report.summary.requiredBusinessDays,
    neededPassDays: report.summary.neededPassDays,
    earliestCompletionDate: report.summary.earliestCompletionDate,
    blockers: report.goalFinal.blockers,
    jsonFile: relative(report.files.jsonFile),
    markdownFile: relative(report.files.markdownFile),
  }, null, 2));
  if (options.requireComplete && !report.ok) process.exitCode = 2;
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
  addBusinessDays,
  buildGoalFinalAuditReport,
  continuityWithCurrentPaper,
  nextBusinessDays,
  parseArgs,
  renderGoalFinalAudit,
  runGoalFinalAudit,
};
