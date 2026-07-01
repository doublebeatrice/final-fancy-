const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function pct(done, total) {
  const denominator = num(total, 0);
  if (denominator <= 0) return 0;
  return Math.round((num(done, 0) / denominator) * 100);
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function relative(file) {
  const raw = text(file);
  if (!raw) return '';
  const resolved = path.resolve(raw);
  return resolved.startsWith(ROOT) ? path.relative(ROOT, resolved) : raw;
}

function taskDone(status = '') {
  return /^(done|closed|complete|completed|pass|landed|已完成|已落地|完成)$/i.test(text(status));
}

function taskBlocked(status = '') {
  return /^(blocked|fail|failed|error|阻塞|失败|未落地)$/i.test(text(status));
}

function short(value, limit = 48) {
  const raw = text(value);
  return raw.length > limit ? `${raw.slice(0, limit - 1)}...` : raw;
}

function taskTitle(item = {}) {
  return text(item.title || item.name || item.task || item.item || item.sku || item.taskId || '未命名任务');
}

function normalizeTaskItems(payload = {}) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['tasks', 'items', 'rows', 'openItems', 'gaps', 'blockers']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function section({ id, label, status = '', done = 0, total = 0, blocked = 0, trace = '', openItems = [] }) {
  const safeTotal = Math.max(num(total, 0), 0);
  const safeDone = Math.min(num(done, 0), safeTotal || num(done, 0));
  const safeBlocked = Math.max(num(blocked, 0), 0);
  const safeOpen = Math.max(0, safeTotal - safeDone);
  return {
    id,
    label,
    status: text(status) || (safeOpen > 0 ? 'open' : 'complete'),
    done: safeDone,
    total: safeTotal,
    open: safeOpen,
    blocked: safeBlocked,
    progressPercent: pct(safeDone, safeTotal),
    trace: text(trace),
    openItems: openItems.slice(0, 5).map(item => ({
      title: short(taskTitle(item)),
      status: text(item.status || item.reason || item.verdict || ''),
      owner: text(item.owner || item.assignee || item.responsible || ''),
      dueDate: text(item.dueDate || item.deadline || item.nextCheckDate || ''),
      trace: text(item.trace || item.file || item.sourceFile || ''),
    })),
  };
}

function buildSqlRecoverySection(report = {}, options = {}) {
  const core = report.coreMetrics || {};
  const coverage = core.coverage?.dataPipeline || {};
  const trace = options.sqlRecoveryFile || core.recoveryFile || coverage.gaps?.[0]?.trace || '';
  const total = num(coverage.denominator, 1);
  const done = core.todayReliability === 'reliable' ? total : num(coverage.numerator, 0);
  const gaps = Array.isArray(coverage.gaps) ? coverage.gaps : [];
  const invalid = (core.todayInvalidReasons || []).map(reason => ({ title: reason, status: 'blocked', trace }));
  return section({
    id: 'sql_recovery',
    label: 'SQL/数据恢复',
    status: core.todayReliability === 'reliable' ? 'complete' : text(core.recovery?.status || 'needs_recovery'),
    done,
    total,
    blocked: core.todayReliability === 'reliable' ? 0 : Math.max(gaps.length, invalid.length, 1),
    trace,
    openItems: gaps.length ? gaps : invalid,
  });
}

function buildGoalProgressSection(report = {}, options = {}) {
  const goal = options.goalProgress || report.goalFinal || {};
  const total = num(goal.requiredBusinessDays || goal.total || goal.target, 1);
  const done = num(goal.currentStreak || goal.done || goal.completed, goal.status === 'complete' ? total : 0);
  return section({
    id: 'goal_progress',
    label: '目标完成度',
    status: text(goal.status || (done >= total ? 'complete' : 'pending')),
    done,
    total,
    blocked: Array.isArray(goal.blockers) ? goal.blockers.length : 0,
    trace: text(goal.trace || options.goalProgressFile || ''),
    openItems: Array.isArray(goal.blockers) ? goal.blockers.map(item => ({
      title: `${item.date || ''} ${item.reason || ''}`.trim(),
      status: 'blocked',
      trace: item.trace || '',
    })) : [],
  });
}

function buildWeeklyTasksSection(options = {}) {
  const payload = options.weeklyTasks || readJson(options.weeklyTaskFile, {});
  const tasks = normalizeTaskItems(payload);
  const done = tasks.filter(item => taskDone(item.status)).length;
  const blocked = tasks.filter(item => taskBlocked(item.status)).length;
  return section({
    id: 'weekly_team_tasks',
    label: '小组本周任务',
    status: text(payload.status || (tasks.length ? 'open' : 'empty')),
    done,
    total: tasks.length,
    blocked,
    trace: options.weeklyTaskFile || payload.sourceFile || '',
    openItems: tasks.filter(item => !taskDone(item.status)),
  });
}

function defaultAutomationFollowupFile(today = '', options = {}) {
  const taskDir = options.taskDir || path.join(ROOT, 'data', 'tasks');
  return today ? path.join(taskDir, `automation_followups_${today}.json`) : '';
}

function automationFollowupFiles(today = '', options = {}) {
  if (Array.isArray(options.automationFollowupFiles)) return options.automationFollowupFiles;
  if (options.automationFollowupFile) return [options.automationFollowupFile];
  const file = defaultAutomationFollowupFile(today, options);
  return file && fs.existsSync(file) ? [file] : [];
}

function loadAutomationFollowups(today = '', options = {}) {
  return automationFollowupFiles(today, options).flatMap(file => {
    const payload = readJson(file, {});
    return normalizeTaskItems(payload).map(item => ({
      ...item,
      trace: item.trace || item.file || item.sourceFile || file,
    }));
  });
}

function buildOpenFollowupsSection(report = {}, options = {}) {
  const external = report.lines?.external || {};
  const coverage = external.coverage?.dueFollowups || {};
  const automationTasks = loadAutomationFollowups(options.today || report.today || '', options);
  const automationDone = automationTasks.filter(item => taskDone(item.status)).length;
  const total = num(coverage.denominator, num(external.todayDueFollowupsCount, 0)) + automationTasks.length;
  const done = num(coverage.numerator, num(external.todayDueFollowupsCovered, 0)) + automationDone;
  const gaps = Array.isArray(coverage.gaps) ? coverage.gaps : [];
  const openAutomationTasks = automationTasks.filter(item => !taskDone(item.status));
  return section({
    id: 'open_followups',
    label: '未闭环事项',
    status: total > done ? 'open' : 'complete',
    done,
    total,
    blocked: gaps.length + automationTasks.filter(item => taskBlocked(item.status)).length,
    trace: [external.dueFollowupFile, ...automationFollowupFiles(options.today || report.today || '', options)].map(text).filter(Boolean).join('; '),
    openItems: [...gaps, ...openAutomationTasks],
  });
}

function buildTaskFollowupDashboard(options = {}) {
  const report = options.report || {};
  const today = text(options.today || report.today || '');
  const sections = [
    buildSqlRecoverySection(report, options),
    buildGoalProgressSection(report, options),
    buildWeeklyTasksSection(options),
    buildOpenFollowupsSection(report, { ...options, today }),
  ];
  return {
    today,
    status: sections.some(item => item.blocked > 0) ? 'needs_attention' : (sections.some(item => item.open > 0) ? 'open' : 'complete'),
    summary: {
      totalSections: sections.length,
      openItems: sections.reduce((sum, item) => sum + item.open, 0),
      blockedItems: sections.reduce((sum, item) => sum + item.blocked, 0),
      completeSections: sections.filter(item => item.total > 0 && item.done >= item.total).length,
    },
    sections,
  };
}

function renderItem(item = {}) {
  const owner = item.owner ? `；负责人 ${item.owner}` : '';
  const due = item.dueDate ? `；截止 ${item.dueDate}` : '';
  const trace = item.trace ? `；trace ${relative(item.trace)}` : '';
  return `${item.title}${item.status ? `（${item.status}）` : ''}${owner}${due}${trace}`;
}

function renderTaskFollowupMarkdown(dashboard = {}) {
  const lines = [
    '## 5. 任务跟进装置',
    `- 总状态：${dashboard.status || 'unknown'}；未闭环 ${dashboard.summary?.openItems || 0}；阻塞 ${dashboard.summary?.blockedItems || 0}。`,
  ];
  for (const item of dashboard.sections || []) {
    const trace = item.trace ? `；证据 ${relative(item.trace)}` : '';
    lines.push(`- ${item.label}：${item.done}/${item.total}，${item.progressPercent}%；状态 ${item.status}${trace}。`);
    if (item.openItems?.length) {
      lines.push(`  - 待跟进：${item.openItems.map(renderItem).join('；')}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  buildTaskFollowupDashboard,
  renderTaskFollowupMarkdown,
};
