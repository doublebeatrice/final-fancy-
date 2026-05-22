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

function priorityRank(priority) {
  return { P0: 0, P1: 1, P2: 2, 'Low Priority': 3 }[text(priority)] ?? 4;
}

function workTypeRank(workType) {
  return {
    due_effect_review: 0,
    daily_ops: 1,
    capability_setup: 2,
    external_request: 3,
    upcoming_effect_review: 4,
    blocked_or_other: 5,
  }[workType] ?? 9;
}

function subjectSummary(subject = {}) {
  return text(subject.sku) || text(subject.asin) || text(subject.keyword) || text(subject.entityId) || text(subject.campaignId) || '';
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function capabilityHintsForTask(task = {}) {
  const requirements = list(task.evidenceRequirements).map(item => item.toLowerCase());
  const metrics = list(task.reviewPlan?.metrics).map(item => item.toLowerCase());
  const hints = [];
  const wantsSelection = [...requirements, ...metrics].some(item =>
    item.includes('selection') ||
    item.includes('market') ||
    item.includes('aba') ||
    item.includes('keyword_conversion') ||
    item.includes('keyword_research') ||
    item.includes('product_time_machine') ||
    item.includes('time_machine') ||
    item.includes('时光机')
  );
  const wantsInventory = [...requirements, ...metrics].some(item => item.includes('inventory') || item.includes('库存'));
  const wantsProfit = [...requirements, ...metrics].some(item => item.includes('profit') || item.includes('利润'));

  if (wantsSelection) {
    hints.push('selection::market_evidence::keyword-research::read');
    hints.push('selection::market_evidence::keyword-conversion::read');
    hints.push('selection::market_evidence::aba-search-terms::read');
    hints.push('selection::market_evidence::keyword-seasonality::read');
    hints.push('selection::market_evidence::product-time-machine::read');
  }
  if (wantsInventory) hints.push('sellerinventory::listing::origin-data::read');
  if (wantsProfit) hints.push('agent::effect_review::review-evidence-collector::read');
  if (task.kind === 'effect_review' || task.lane === 'effect_review') hints.push('agent::effect_review::review-evidence-collector::read');

  return [...new Set(hints)];
}

function marketTermsForTask(task = {}) {
  const values = [
    ...(Array.isArray(task.reviewPlan?.marketTerms) ? task.reviewPlan.marketTerms : []),
    ...(Array.isArray(task.marketTerms) ? task.marketTerms : []),
    task.subject?.keyword,
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

function keywordResearchSubjectArgs(task = {}) {
  const subject = task.subject || {};
  const terms = marketTermsForTask(task);
  const parts = [];
  if (text(subject.sku)) parts.push('--sku', quoteArg(subject.sku));
  if (text(subject.asin)) parts.push('--asin', quoteArg(subject.asin));
  if (text(subject.keyword)) {
    parts.push('--terms', quoteArg(subject.keyword));
  } else if (terms.length) {
    parts.push('--terms', quoteArg(terms.join(', ')));
  }
  return parts;
}

function defaultAgentFile(prefix, today) {
  return `data\\agent\\${prefix}_${today}.json`;
}

function defaultSnapshotFile(prefix, today) {
  return `data\\snapshots\\${prefix}_${today}.json`;
}

function hasCapability(capabilities = [], needle = '') {
  return capabilities.some(item => item === needle);
}

function quoteArg(value) {
  const raw = text(value);
  if (!raw) return '""';
  return /\s/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

function commandItem(label, command, options = {}) {
  return {
    label,
    command,
    purpose: text(options.purpose || ''),
    output: text(options.output || ''),
    riskLevel: text(options.riskLevel || 'read_only'),
  };
}

function buildExecutionPlan(task = {}, options = {}) {
  const today = dateOnly(options.today || options.businessDate || new Date().toISOString());
  const classified = task.workType ? task : classifyWorkItem({ ...task, executionPlan: undefined }, { ...options, skipExecutionPlan: true });
  const requiredCapabilities = classified.requiredCapabilities || capabilityHintsForTask(task);
  const commands = [];
  const expectedOutputs = [];
  const requiredInputs = [];

  if (classified.workType === 'due_effect_review') {
    const reviewFile = options.reviewFile || defaultAgentFile('review_queue', today);
    const outFile = options.effectReviewFile || defaultAgentFile('effect_review', today);
    const evidenceFile = defaultAgentFile('review_evidence', today);
    const parts = [
      'npm run ops:agent:review-effect --',
      '--queue', reviewFile,
      '--collect-evidence',
      '--today', today,
      '--evidence-out', evidenceFile,
      '--out', outFile,
    ];
    if (hasCapability(requiredCapabilities, 'sellerinventory::listing::origin-data::read')) {
      const inventoryFile = defaultSnapshotFile('inventory_review', today);
      parts.push('--inventory-report', inventoryFile);
      requiredInputs.push(inventoryFile);
    }
    if (hasCapability(requiredCapabilities, 'agent::effect_review::review-evidence-collector::read')) {
      const profitFile = defaultSnapshotFile('profit_review', today);
      parts.push('--profit-report', profitFile);
      requiredInputs.push(profitFile);
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::keyword-conversion::read')) {
      const keywordFile = defaultSnapshotFile('selection_keyword_conversion_rate', today);
      parts.push('--keyword-conversion-report', keywordFile);
      requiredInputs.push(keywordFile);
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::aba-search-terms::read')) {
      const abaFile = defaultSnapshotFile('selection_aba_search_terms', today);
      parts.push('--aba-report', abaFile);
      requiredInputs.push(abaFile);
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::keyword-seasonality::read')) {
      const seasonalityFile = defaultSnapshotFile('selection_keyword_seasonality', today);
      parts.push('--seasonality-report', seasonalityFile);
      requiredInputs.push(seasonalityFile);
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::product-time-machine::read')) {
      const productTimeMachineFile = defaultSnapshotFile('selection_product_time_machine', today);
      parts.push('--product-time-machine-report', productTimeMachineFile);
      requiredInputs.push(productTimeMachineFile);
    }
    commands.push(commandItem('采集证据并执行效果复查', parts.join(' '), {
      purpose: '拉取当前证据，对比执行前基线并输出关闭、继续观察或回滚复核判断。',
      output: outFile,
    }));
    expectedOutputs.push(evidenceFile, outFile);
  } else if (classified.workType === 'external_request' || classified.autonomyMode === 'gather_evidence') {
    const terms = marketTermsForTask(task);
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::keyword-research::read')) {
      const keywordResearchArgs = keywordResearchSubjectArgs(task);
      commands.push(commandItem('拉选品关键词调研证据', `npm run ops:selection:keyword-research -- ${keywordResearchArgs.length ? keywordResearchArgs.join(' ') : '--terms <关键词或搜索词>'}`, {
        purpose: '先从 Amazon 前台和产品证据找可承接的新流量方向，只生成候选和复核清单，不直接执行广告动作。',
        output: defaultSnapshotFile('selection_keyword_research', today),
      }));
      expectedOutputs.push(defaultSnapshotFile('selection_keyword_research', today));
      if (!keywordResearchArgs.length) requiredInputs.push('关键词、SKU、ASIN 或产品描述');
    }
    const termArg = terms.length ? terms.join(', ') : '<关键词或搜索词>';
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::keyword-conversion::read')) {
      commands.push(commandItem('拉选品关键词转化证据', `npm run ops:selection:keyword-conversion -- --keywords ${quoteArg(termArg)}`, {
        purpose: '确认关键词市场转化和成本，不作为直接执行广告动作的依据。',
        output: defaultSnapshotFile('selection_keyword_conversion_rate', today),
      }));
      expectedOutputs.push(defaultSnapshotFile('selection_keyword_conversion_rate', today));
      if (!terms.length) requiredInputs.push('关键词或搜索词');
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::aba-search-terms::read')) {
      commands.push(commandItem('拉选品 ABA 搜索词证据', `npm run ops:selection:aba-search-terms -- --search-terms ${quoteArg(termArg)}`, {
        purpose: '确认需求、竞争和头部 ASIN 集中度，不作为直接执行广告动作的依据。',
        output: defaultSnapshotFile('selection_aba_search_terms', today),
      }));
      expectedOutputs.push(defaultSnapshotFile('selection_aba_search_terms', today));
      if (!terms.length) requiredInputs.push('关键词或搜索词');
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::keyword-seasonality::read')) {
      commands.push(commandItem('拉选品关键词季节性证据', `npm run ops:selection:keyword-seasonality -- --search-terms ${quoteArg(termArg)}`, {
        purpose: '确认关键词 Google 趋势、市场规模、竞品门槛、品牌集中和买家扩展词，只作为市场判断证据。',
        output: defaultSnapshotFile('selection_keyword_seasonality', today),
      }));
      expectedOutputs.push(defaultSnapshotFile('selection_keyword_seasonality', today));
      if (!terms.length) requiredInputs.push('关键词或搜索词');
    }
    if (hasCapability(requiredCapabilities, 'selection::market_evidence::product-time-machine::read')) {
      commands.push(commandItem('拉选品产品时光机证据', `npm run ops:selection:product-time-machine -- --search-keywords ${quoteArg(termArg)}`, {
        purpose: '确认关键词下竞品 ASIN、近月购买量、历史购买趋势、自然/广告流量词结构、自然排名和关键词历史曲线，只作为市场与竞品证据。',
        output: defaultSnapshotFile('selection_product_time_machine', today),
      }));
      expectedOutputs.push(defaultSnapshotFile('selection_product_time_machine', today));
      if (!terms.length) requiredInputs.push('关键词或搜索词');
    }
  } else if (classified.workType === 'daily_ops') {
    const outFile = defaultAgentFile('agent_ledger', today);
    commands.push(commandItem('运行每日运营闭环', 'npm run ops:today -- --mode full-snapshot --actor codex', {
      purpose: '刷新当日运营数据、任务池、动作授权和复查承诺。',
      output: outFile,
      riskLevel: 'read_then_schema_gated',
    }));
    expectedOutputs.push(outFile);
  } else if (classified.workType === 'capability_setup') {
    commands.push(commandItem('刷新能力注册目录', `npm run ops:agent:capabilities -- --out ${defaultAgentFile('capability_registry', today)}`, {
      purpose: '合并默认能力和新接口能力，输出缺契约、缺探针、缺授权边界的补齐任务。',
      output: defaultAgentFile('capability_registry', today),
    }));
    expectedOutputs.push(defaultAgentFile('capability_registry', today));
  }

  return {
    mode: classified.autonomyMode || 'triage',
    commands,
    requiredInputs: [...new Set(requiredInputs)],
    expectedOutputs: [...new Set(expectedOutputs)],
    safeToAutoRun: commands.length > 0 && commands.every(command => command.riskLevel === 'read_only'),
  };
}

function isDue(task = {}, today) {
  if (!task.dueDate) return false;
  return dateOnly(task.dueDate).localeCompare(dateOnly(today)) <= 0;
}

function classifyWorkItem(task = {}, options = {}) {
  const today = dateOnly(options.today || options.businessDate || new Date().toISOString());
  const lane = text(task.lane || task.source);
  let workType = 'blocked_or_other';
  let autonomyMode = 'triage';
  let priority = text(task.priority || 'P2');
  let nextStep = '补齐任务背景，判断下一步。';

  if ((lane === 'effect_review' || task.kind === 'effect_review') && isDue(task, today)) {
    workType = 'due_effect_review';
    autonomyMode = 'run_review';
    priority = 'P0';
    nextStep = '拉取最新广告、库存、利润和必要的选品证据，对比基线和复查指标，判断关闭、继续观察、回滚或二次动作。';
  } else if (lane === 'effect_review' || task.kind === 'effect_review') {
    workType = 'upcoming_effect_review';
    autonomyMode = 'wait_until_due';
    nextStep = `等待到期复查：${task.dueDate || ''}`;
  } else if (lane === 'daily_ops') {
    workType = 'daily_ops';
    autonomyMode = 'run_daily_loop';
    nextStep = '进入每日运营顺序：低效、超预算、季节/节气、SKU 异常和机会诊断。';
  } else if (lane === 'capability_registry') {
    workType = 'capability_setup';
    autonomyMode = 'complete_capability_setup';
    nextStep = '补齐接口契约、探针、授权边界或写后回查，再进入可用能力目录。';
  } else if (lane === 'external_inbox') {
    workType = 'external_request';
    autonomyMode = 'gather_evidence';
    nextStep = '按任务类型拉取广告、库存、选品、listing 或历史动作证据，并输出运营可直接发送的回复。';
  }

  const requiresEscalation = (task.authorizationHint || []).some(item => /requires|boundary|高影响|授权/i.test(String(item))) &&
    !['run_review', 'run_daily_loop', 'gather_evidence'].includes(autonomyMode);

  const base = {
    ...task,
    workType,
    autonomyMode,
    priority,
    subjectText: subjectSummary(task.subject || {}),
    nextStep,
    requiredCapabilities: capabilityHintsForTask(task),
    requiresEscalation,
  };
  return options.skipExecutionPlan ? base : {
    ...base,
    executionPlan: buildExecutionPlan(base, options),
  };
}

function flattenSourceItems(source = {}) {
  return [
    ...(source.reviewQueue?.due || []),
    ...(source.ledger?.nextOpenTasks || []),
    ...(source.externalInbox?.tasks || []),
    ...(source.capabilityRegistry?.tasks || []),
    ...(source.reviewQueue?.upcoming || []),
  ];
}

function dedupe(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = text(item.taskId) || [item.lane, item.kind, item.title, subjectSummary(item.subject || {}), item.dueDate].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeAgentWorkSources(source = {}, options = {}) {
  const today = dateOnly(options.today || options.businessDate || new Date().toISOString());
  return dedupe(flattenSourceItems(source))
    .filter(item => item.status !== 'closed')
    .map(item => classifyWorkItem(item, { ...options, today }))
    .sort((a, b) => workTypeRank(a.workType) - workTypeRank(b.workType) ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      text(a.dueDate).localeCompare(text(b.dueDate)) ||
      text(a.title).localeCompare(text(b.title)));
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildOperatingHub(input = {}) {
  const timeContext = input.timeContext || {};
  const today = dateOnly(input.today || timeContext.businessDate || timeContext.runAt);
  const todayQueue = mergeAgentWorkSources(input, { ...(input.sourceFiles || {}), today });
  const summary = {
    total: todayQueue.length,
    byWorkType: countBy(todayQueue, item => item.workType),
    byAutonomyMode: countBy(todayQueue, item => item.autonomyMode),
    byPriority: countBy(todayQueue, item => item.priority),
    requiresEscalation: todayQueue.filter(item => item.requiresEscalation).length,
    dueReviews: todayQueue.filter(item => item.workType === 'due_effect_review').length,
    externalRequests: todayQueue.filter(item => item.workType === 'external_request').length,
    capabilitySetup: todayQueue.filter(item => item.workType === 'capability_setup').length,
  };
  return {
    generatedAt: text(input.generatedAt || timeContext.runAt || new Date().toISOString()),
    businessDate: today,
    dataDate: dateOnly(timeContext.dataDate || today),
    sourceRunId: text(timeContext.sourceRunId || ''),
    summary,
    todayQueue,
  };
}

module.exports = {
  buildExecutionPlan,
  buildOperatingHub,
  capabilityHintsForTask,
  classifyWorkItem,
  mergeAgentWorkSources,
};
