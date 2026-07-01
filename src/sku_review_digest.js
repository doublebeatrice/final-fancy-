const fs = require('fs');
const path = require('path');

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? [text(value)] : [];
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${dateOnly(startDate)}T00:00:00.000Z`);
  const end = new Date(`${dateOnly(endDate)}T00:00:00.000Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : 0;
}

function priorityRank(priority) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[text(priority)] ?? 4;
}

function defaultWatchlistFile(root = process.cwd()) {
  return path.join(root, 'data', 'tasks', 'sku_watchlist.json');
}

function defaultReviewQueueFile(today, root = process.cwd()) {
  return path.join(root, 'data', 'agent', `review_queue_${dateOnly(today)}.json`);
}

function defaultTaskFollowupDir(root = process.cwd()) {
  return path.join(root, 'data', 'tasks');
}

function dueOnOrBefore(date, today) {
  return Boolean(text(date)) && dateOnly(date) <= dateOnly(today);
}

function mergeItem(itemMap, item) {
  const key = text(item.sku || item.subject || item.taskId);
  if (!key) return;
  const existing = itemMap.get(key);
  if (!existing) {
    itemMap.set(key, {
      ...item,
      sources: [...new Set(item.sources || [])],
      checks: [...new Set(list(item.checks))],
      closeConditions: [...new Set(list(item.closeConditions))],
    });
    return;
  }
  itemMap.set(key, {
    ...existing,
    priority: priorityRank(item.priority) < priorityRank(existing.priority) ? item.priority : existing.priority,
    dueDate: existing.dueDate && item.dueDate ? (dateOnly(existing.dueDate) < dateOnly(item.dueDate) ? existing.dueDate : item.dueDate) : existing.dueDate || item.dueDate,
    productIdentity: existing.productIdentity || item.productIdentity,
    lastAction: existing.lastAction || item.lastAction,
    rollbackIf: existing.rollbackIf || item.rollbackIf,
    sources: [...new Set([...(existing.sources || []), ...(item.sources || [])])],
    checks: [...new Set([...(existing.checks || []), ...list(item.checks)])],
    closeConditions: [...new Set([...(existing.closeConditions || []), ...list(item.closeConditions)])],
  });
}

function itemsFromWatchlist(watchlist, today) {
  return (watchlist.items || [])
    .filter(item => !['closed', 'done'].includes(text(item.status).toLowerCase()))
    .filter(item => dueOnOrBefore(item.nextCheckDate, today))
    .map(item => ({
      sku: text(item.sku),
      priority: text(item.priority || 'P2'),
      dueDate: dateOnly(item.nextCheckDate),
      productIdentity: text(item.productIdentity),
      lastAction: text(item.lastAction?.summary || item.lastAction),
      checks: list(item.nextChecks),
      closeConditions: list(item.closeConditions),
      sources: ['watchlist'],
    }))
    .filter(item => item.sku);
}

function itemsFromReviewQueue(queue, today) {
  const due = Array.isArray(queue.due)
    ? queue.due
    : (queue.items || queue.tasks || []).filter(item => dueOnOrBefore(item.dueDate, today));
  return due
    .map(task => ({
      sku: text(task.subject?.sku || task.sku || task.subject?.entityId || task.taskId),
      priority: text(task.priority || 'P2'),
      dueDate: dateOnly(task.dueDate || today),
      taskId: text(task.taskId),
      checks: list(task.checklist || task.nextChecks),
      rollbackIf: text(task.rollbackIf || task.reviewPlan?.rollbackIf),
      sources: ['review_queue'],
    }))
    .filter(item => item.sku);
}

function itemsFromTaskFollowups(taskFollowupDir, today) {
  if (!taskFollowupDir || !fs.existsSync(taskFollowupDir)) return [];
  return fs.readdirSync(taskFollowupDir)
    .filter(name => /\.json$/i.test(name) && /follow[-_]?up/i.test(name))
    .flatMap(name => {
      const file = path.join(taskFollowupDir, name);
      let task;
      try {
        task = readJson(file, null);
      } catch {
        return [];
      }
      const followUps = Array.isArray(task?.followUps) ? task.followUps : [];
      const sku = text(task?.subject?.sku || task?.sku);
      if (!sku || !followUps.length) return [];
      return followUps
        .filter(followUp => !['closed', 'done', 'complete', 'completed'].includes(text(followUp.status).toLowerCase()))
        .filter(followUp => dueOnOrBefore(followUp.dueDate, today))
        .map(followUp => ({
          sku,
          priority: text(task.priority || 'P2'),
          dueDate: dateOnly(followUp.dueDate || today),
          productIdentity: text(task.productIdentity || task.subject?.productIdentity),
          lastAction: text(task.lastAction?.summary || task.actionSummary || task.diagnosis),
          checks: [...list(followUp.check), ...list(followUp.nextChecks)],
          closeConditions: [
            ...list(followUp.successSignal),
            ...list(followUp.failureCondition),
            ...list(followUp.actionIfFail),
          ],
          rollbackIf: text(followUp.failureCondition),
          sources: ['task_followup'],
          followupFile: file,
        }));
    });
}

function buildSkuReviewDigest(options = {}) {
  const today = dateOnly(options.today);
  const watchlistFile = options.watchlistFile || defaultWatchlistFile(options.root);
  const reviewQueueFile = options.reviewQueueFile || defaultReviewQueueFile(today, options.root);
  const taskFollowupDir = options.taskFollowupDir || (options.root ? defaultTaskFollowupDir(options.root) : '');
  const watchlist = readJson(watchlistFile, { items: [] });
  const reviewQueue = readJson(reviewQueueFile, { due: [] });
  const itemMap = new Map();
  for (const item of itemsFromWatchlist(watchlist, today)) mergeItem(itemMap, item);
  for (const item of itemsFromReviewQueue(reviewQueue, today)) mergeItem(itemMap, item);
  for (const item of itemsFromTaskFollowups(taskFollowupDir, today)) mergeItem(itemMap, item);
  const items = [...itemMap.values()]
    .map(item => ({
      ...item,
      overdueDays: Math.max(0, daysBetween(item.dueDate, today)),
    }))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.overdueDays - a.overdueDays || a.sku.localeCompare(b.sku));
  return {
    generatedAt: text(options.generatedAt || new Date().toISOString()),
    today,
    files: { watchlistFile, reviewQueueFile, taskFollowupDir },
    summary: {
      due: items.length,
      overdue: items.filter(item => item.overdueDays > 0).length,
      byPriority: items.reduce((acc, item) => {
        acc[item.priority] = (acc[item.priority] || 0) + 1;
        return acc;
      }, {}),
    },
    items,
  };
}

function renderSkuReviewText(digest = {}, options = {}) {
  const limit = Number(options.limit || 8);
  const maxText = Number(options.maxText || 74);
  const botName = text(options.botName || '小哆');
  const operatorName = text(options.operatorName || '哆布');
  const items = (digest.items || []).slice(0, limit);
  const lines = [
    `${operatorName}，${botName}来提醒 SKU 复查啦`,
    `${digest.today} 今天要复查 ${digest.summary?.due || 0} 个 SKU，逾期 ${digest.summary?.overdue || 0} 个。`,
  ];
  if (!items.length) {
    lines.push('今天没有到期 SKU，先安心处理别的。');
    lines.push(`回复${botName}：收到 / 明天提醒 / 查某个SKU`);
    return lines.join('\n');
  }
  lines.push('');
  for (const item of items) {
    const index = items.indexOf(item) + 1;
    const overdue = item.overdueDays > 0 ? `，已逾期 ${item.overdueDays} 天` : '';
    lines.push(`${index}. 【${item.priority}】${item.sku}${overdue}`);
    if (item.productIdentity) lines.push(`先看：${compact(item.productIdentity, maxText)}`);
    const checks = (item.checks || []).slice(0, 2).map(check => compact(check, maxText));
    if (checks.length) {
      lines.push('要做：');
      for (const check of checks) lines.push(`  - ${check}`);
    }
    if (item.rollbackIf) lines.push(`失败线：${compact(item.rollbackIf, maxText)}`);
    lines.push('');
  }
  if ((digest.items || []).length > items.length) {
    lines.push(`还有 ${digest.items.length - items.length} 个在队列里，先处理上面这些。`);
  }
  lines.push(`回复${botName}：收到 / 延后 / 已处理 + SKU / 先看某个SKU`);
  return lines.join('\n');
}

function compact(value, maxLength) {
  const cleaned = text(value).replace(/\s+/g, ' ');
  if (!maxLength || cleaned.length <= maxLength) return cleaned;
  const hardLimit = Math.max(0, maxLength - 3);
  const punctIndex = Math.max(
    cleaned.lastIndexOf('；', hardLimit),
    cleaned.lastIndexOf('。', hardLimit),
    cleaned.lastIndexOf(';', hardLimit),
    cleaned.lastIndexOf(',', hardLimit),
    cleaned.lastIndexOf(' ', hardLimit),
  );
  const cutAt = punctIndex >= Math.floor(hardLimit * 0.55) ? punctIndex : hardLimit;
  return `${cleaned.slice(0, cutAt).replace(/[；。;,\s]+$/, '')}...`;
}

module.exports = {
  buildSkuReviewDigest,
  compact,
  dateOnly,
  defaultReviewQueueFile,
  defaultTaskFollowupDir,
  defaultWatchlistFile,
  itemsFromTaskFollowups,
  renderSkuReviewText,
};
