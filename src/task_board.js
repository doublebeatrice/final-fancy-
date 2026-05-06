const { decideCandidateContexts } = require('./ai_task_decision');

const DEFAULT_MAIN_TASK_LIMIT = 80;
const LAYERS = ['P0', 'P1', 'P2', 'Data Missing', 'Low Priority'];

function text(value) {
  return String(value || '').trim();
}

function uniq(list) {
  return [...new Set((list || []).map(text).filter(Boolean))];
}

function classifyMissing(reason) {
  const value = String(reason || '').toLowerCase();
  if (value.includes('adstats')) return 'ad_data';
  if (value.includes('inv') || value.includes('ful') || value.includes('stock')) return 'inventory_data';
  if (value.includes('sales')) return 'sales_history';
  if (value.includes('profile') || value.includes('structure')) return 'product_structure';
  if (value.includes('profit')) return 'profit_data';
  if (value.includes('asin') || value.includes('sku')) return 'identity_data';
  return 'other';
}

function groupContexts(contexts = []) {
  const groups = new Map();
  for (const context of contexts) {
    const key = context.groupKey || [context.sku, context.asin].map(text).filter(Boolean).join('::') || context.contextId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(context);
  }
  return [...groups.entries()].map(([groupKey, items]) => {
    const primary = items
      .slice()
      .sort((a, b) => (b.deterministicPriorityHint || 0) - (a.deterministicPriorityHint || 0))[0];
    return {
      ...primary,
      groupKey,
      mergedContextCount: items.length,
      mergedSignals: uniq(items.flatMap(item => (item.possibleSignals || []).map(signal => signal.type))),
      dataMissing: uniq(items.flatMap(item => item.dataMissing || [])),
      cooldowns: items.flatMap(item => item.cooldowns || []),
    };
  });
}

function applyGuardrails(context = {}, decision = {}) {
  const guardrailBlocks = [];
  const next = { ...decision };
  const wantsScaleOrCreate = /create|scale|increase|加投|new_ad|build/i.test(String(decision.suggestedAction || ''));

  if (context.guardrailInputs?.hasCriticalMissingData || (context.dataMissing || []).length) {
    guardrailBlocks.push('critical_data_missing_blocks_execution');
    next.boardExecutableHint = false;
    next.reviewRequired = true;
    if (next.priority !== 'Data Missing') next.priority = 'Data Missing';
  }

  if (context.guardrailInputs?.reservedPage && (context.guardrailInputs?.listingOverseason || context.guardrailInputs?.matchedOffseason) && wantsScaleOrCreate) {
    guardrailBlocks.push('reserved_overseason_page_cannot_create_or_scale_ads');
    next.boardExecutableHint = false;
    next.reviewRequired = true;
    next.primaryTaskType = 'reserved_page_watch';
    next.suggestedAction = 'manual_review_reserved_page_do_not_create_or_scale';
  }

  const activeCooldown = (context.cooldowns || []).find(item => item.active);
  if (activeCooldown) {
    guardrailBlocks.push(`cooldown_active_${activeCooldown.direction}_${activeCooldown.ageDays}d`);
    next.boardExecutableHint = false;
    next.reviewRequired = true;
  }

  if (guardrailBlocks.length) {
    next.riskNotes = uniq([...(next.riskNotes || []), ...guardrailBlocks]);
  }

  return {
    ...next,
    guardrailBlocks,
    guardrailStatus: guardrailBlocks.length ? 'blocked_or_review_required' : 'passed',
    cooldown: activeCooldown || null,
  };
}

function priorityRank(priority) {
  return { P0: 0, P1: 1, P2: 2, 'Data Missing': 3, 'Low Priority': 4 }[priority] ?? 5;
}

function confidenceRank(decision = {}) {
  return Number(decision.confidence || 0);
}

function summarizeMissing(boardTasks = []) {
  const byType = {};
  const byReason = {};
  for (const task of boardTasks) {
    if (task.priority !== 'Data Missing') continue;
    for (const reason of task.dataMissing || []) byReason[reason] = (byReason[reason] || 0) + 1;
    for (const type of uniq((task.dataMissing || []).map(classifyMissing))) byType[type] = (byType[type] || 0) + 1;
  }
  return { byType, byReason };
}

function buildDailyTaskBoard(pool = {}, options = {}) {
  const mainTaskLimit = Number(options.mainTaskLimit || process.env.DAILY_TASK_BOARD_LIMIT || DEFAULT_MAIN_TASK_LIMIT);
  const groupedContexts = groupContexts(pool.candidateContexts || pool.tasks || []);
  const decisions = decideCandidateContexts(groupedContexts, { externalDecisions: options.externalDecisions || [] });
  let boardTasks = groupedContexts.map((context, index) => {
    const guarded = applyGuardrails(context, decisions[index]);
    return {
      boardTaskId: `${context.sourceRunId || 'board'}::${context.groupKey || context.sku || index}`,
      groupKey: context.groupKey,
      sku: context.sku,
      asin: context.asin,
      site: context.site,
      priority: guarded.priority,
      priorityReason: guarded.priorityReason,
      primaryTaskType: guarded.primaryTaskType,
      suggestedAction: guarded.suggestedAction,
      boardExecutableHint: guarded.boardExecutableHint === true,
      taskBoardSuggestedExecutable: guarded.boardExecutableHint === true,
      reviewRequired: guarded.reviewRequired === true,
      riskNotes: guarded.riskNotes || [],
      dataMissing: guarded.dataMissing || context.dataMissing || [],
      confidence: guarded.confidence,
      decisionSummary: guarded.decisionSummary,
      factsConsidered: guarded.factsConsidered || [],
      aiDecisionSource: guarded.source || 'unknown',
      guardrailStatus: guarded.guardrailStatus,
      guardrailBlocks: guarded.guardrailBlocks || [],
      cooldown: guarded.cooldown,
      lastAdjustedAt: context.lastAdjustedAt,
      possibleSignals: context.possibleSignals || [],
      deterministicPriorityHint: context.deterministicPriorityHint || 0,
      mergedContextCount: context.mergedContextCount || 1,
      mergedSignals: context.mergedSignals || uniq((context.possibleSignals || []).map(signal => signal.type)),
      facts: context.facts || {},
      runAt: context.runAt,
      businessDate: context.businessDate,
      dataDate: context.dataDate,
      siteTimezone: context.siteTimezone,
      sourceRunId: context.sourceRunId,
    };
  });

  boardTasks.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || confidenceRank(b) - confidenceRank(a) || (b.deterministicPriorityHint || 0) - (a.deterministicPriorityHint || 0));

  const layerKeepCounts = { P0: 0, P1: 0, P2: 0 };
  const layerCaps = {
    P0: Math.min(40, mainTaskLimit),
    P1: Math.min(40, Math.max(0, mainTaskLimit - Math.min(40, mainTaskLimit))),
    P2: mainTaskLimit,
  };
  boardTasks = boardTasks.map(task => {
    if (['Data Missing', 'Low Priority'].includes(task.priority)) return task;
    const currentMain = layerKeepCounts.P0 + layerKeepCounts.P1 + layerKeepCounts.P2;
    const cap = layerCaps[task.priority] ?? mainTaskLimit;
    if (currentMain < mainTaskLimit && layerKeepCounts[task.priority] < cap) {
      layerKeepCounts[task.priority] += 1;
      return task;
    }
    return {
      ...task,
      priority: 'Low Priority',
      boardExecutableHint: false,
      taskBoardSuggestedExecutable: false,
      reviewRequired: true,
      riskNotes: uniq([...(task.riskNotes || []), 'daily_board_main_task_limit_exceeded']),
    };
  });

  const layers = Object.fromEntries(LAYERS.map(layer => [layer, []]));
  for (const task of boardTasks) layers[task.priority].push(task);
  for (const layer of LAYERS) {
    layers[layer].sort((a, b) => confidenceRank(b) - confidenceRank(a) || (b.deterministicPriorityHint || 0) - (a.deterministicPriorityHint || 0));
  }

  const suppressedRuleCounts = boardTasks.reduce((acc, task) => {
    if (task.priority !== 'Low Priority') return acc;
    for (const signal of task.mergedSignals || []) acc[signal] = (acc[signal] || 0) + 1;
    return acc;
  }, {});

  const mergedTop = boardTasks
    .slice()
    .sort((a, b) => (b.mergedSignals || []).length - (a.mergedSignals || []).length)
    .slice(0, 10)
    .map(task => ({ sku: task.sku, asin: task.asin, groupKey: task.groupKey, mergedSignalCount: (task.mergedSignals || []).length, signals: task.mergedSignals || [] }));

  const summary = {
    fullContextCount: (pool.candidateContexts || pool.tasks || []).length,
    boardTaskCount: boardTasks.length,
    mainTaskCount: layers.P0.length + layers.P1.length + layers.P2.length,
    mainTaskLimit,
    executableMainTasks: [...layers.P0, ...layers.P1, ...layers.P2].filter(task => task.boardExecutableHint).length,
    byLayer: Object.fromEntries(LAYERS.map(layer => [layer, layers[layer].length])),
    dataMissing: summarizeMissing(boardTasks),
    suppressedRuleCounts,
    mergedTop,
    reviewRequired: boardTasks.filter(task => task.reviewRequired || !task.boardExecutableHint).length,
    aiDecisionSources: boardTasks.reduce((acc, task) => {
      acc[task.aiDecisionSource] = (acc[task.aiDecisionSource] || 0) + 1;
      return acc;
    }, {}),
    guardrailBlocks: boardTasks.reduce((acc, task) => {
      for (const block of task.guardrailBlocks || []) acc[block] = (acc[block] || 0) + 1;
      return acc;
    }, {}),
  };

  return {
    generatedAt: pool.generatedAt,
    time: pool.time,
    sourceCandidateSummary: pool.summary || {},
    summary,
    layers,
    tasks: boardTasks,
  };
}

module.exports = {
  DEFAULT_MAIN_TASK_LIMIT,
  applyGuardrails,
  buildDailyTaskBoard,
  classifyMissing,
};
