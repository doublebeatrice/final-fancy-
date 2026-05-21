const crypto = require('crypto');

const VALID_STATUSES = new Set(['new', 'in_progress', 'executed', 'waiting_review', 'blocked', 'closed']);
const AUTO_APPROVERS = new Set(['codex', 'claude', 'manual']);
const READ_ONLY_ACTIONS = new Set(['fetch', 'diagnose', 'inspect', 'report', 'review', 'summarize']);
const LOW_RISK_AD_ENTITIES = new Set(['keyword', 'target', 'productad', 'campaign', 'adgroup']);
const LOW_RISK_EXTENDED_AD_ENTITIES = new Set(['sbkeyword', 'sbtarget', 'autotarget', 'manualtarget']);
const LOW_RISK_AD_ACTIONS = new Set(['bid', 'bid_down', 'bid_up', 'pause', 'enable', 'budget', 'placement']);
const EFFECT_BASELINE_KEYS = ['spend', 'orders', 'sales', 'acos', 'clicks', 'impressions'];

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function metricNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeEffectBaseline(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const baseline = {};
  for (const key of EFFECT_BASELINE_KEYS) {
    const value = metricNumber(raw[key]);
    if (value !== undefined) baseline[key] = value;
  }
  return Object.keys(baseline).length ? baseline : null;
}

function baselineFromAction(action = {}) {
  const candidates = [
    action.reviewBaseline,
    action.baseline,
    action.metricsBaseline,
    action.adBaseline,
    action.currentMetrics,
    action.currentAdMetrics,
    action.learning?.baseline,
    action.learning?.baseline?.adStats?.['7d'],
    action.learning?.baseline?.adStats?.['3d'],
    action.learning?.baseline?.adStats?.['30d'],
    action.meta?.expectation?.baseline,
    action,
  ];
  for (const candidate of candidates) {
    const baseline = normalizeEffectBaseline(candidate);
    if (baseline) return baseline;
  }
  return null;
}

function reviewDaysFromAction(action = {}) {
  const reviewPlan = action.reviewPlan || action.meta?.expectation?.reviewPlan || {};
  const values = [
    ...(Array.isArray(reviewPlan.checkAfterDays) ? reviewPlan.checkAfterDays : []),
    ...(Array.isArray(reviewPlan.windows) ? reviewPlan.windows : []),
    ...(Array.isArray(action.learning?.measurementWindowDays) ? action.learning.measurementWindowDays : []),
  ];
  return [...new Set(values.map(Number).filter(day => Number.isFinite(day) && day > 0))]
    .sort((a, b) => a - b);
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
    .update(parts.map(part => text(part)).join('|'))
    .digest('hex')
    .slice(0, 10);
}

function subjectKey(subject = {}) {
  return text(subject.sku) ||
    text(subject.asin) ||
    text(subject.keyword) ||
    text(subject.campaignId) ||
    text(subject.id) ||
    'general';
}

function laneForSource(source) {
  const value = text(source) || 'agent';
  if (value === 'external_request') return 'external_inbox';
  if (value === 'daily_ops') return 'daily_ops';
  if (value === 'effect_review') return 'effect_review';
  if (value === 'capability_registry') return 'capability_registry';
  return value;
}

function normalizeSubject(raw = {}) {
  return {
    sku: text(raw.sku),
    asin: text(raw.asin),
    keyword: text(raw.keyword),
    campaignId: text(raw.campaignId),
    entityId: text(raw.entityId || raw.id),
  };
}

function normalizeAgentTask(input = {}, timeContext = {}) {
  const source = text(input.source || input.lane || 'agent');
  const kind = text(input.kind || input.primaryTaskType || input.taskType || 'general');
  const subject = normalizeSubject(input.subject || input);
  const businessDate = dateOnly(input.businessDate || timeContext.businessDate || timeContext.runAt);
  const createdAt = text(input.createdAt || timeContext.runAt || new Date().toISOString());
  const idSeed = [
    source,
    kind,
    subjectKey(subject),
    input.title || input.description || input.reason || input.suggestedAction || '',
    businessDate,
  ];
  const taskId = text(input.taskId) || `${source}::${kind}::${subjectKey(subject)}::${stableHash(idSeed)}`;
  const status = VALID_STATUSES.has(input.status) ? input.status : 'new';

  return {
    taskId,
    status,
    lane: laneForSource(source),
    source,
    kind,
    title: text(input.title || input.summary || input.primaryTaskType || kind),
    description: text(input.description || input.reason || input.decisionSummary || ''),
    subject,
    requestedBy: text(input.requestedBy || input.actor || ''),
    priority: text(input.priority || 'P2'),
    riskLevel: text(input.riskLevel || ''),
    evidence: list(input.evidence || input.factsConsidered || input.facts),
    evidenceRequirements: list(input.evidenceRequirements),
    authorizationHint: list(input.authorizationHint),
    replyExpectation: text(input.replyExpectation || ''),
    nextCheckpoint: text(input.nextCheckpoint || ''),
    rawInput: text(input.rawInput || ''),
    attachments: Array.isArray(input.attachments) ? input.attachments.slice() : [],
    dueDate: text(input.dueDate || ''),
    businessDate,
    dataDate: dateOnly(input.dataDate || timeContext.dataDate || businessDate),
    sourceRunId: text(input.sourceRunId || timeContext.sourceRunId || ''),
    createdAt,
    updatedAt: text(input.updatedAt || createdAt),
    history: Array.isArray(input.history) ? input.history.slice() : [],
    reviewPlan: input.reviewPlan || null,
    reviewOf: input.reviewOf || null,
    conclusion: text(input.conclusion || ''),
  };
}

function transitionTargetStatus(currentStatus, eventType) {
  if (eventType === 'start') return 'in_progress';
  if (eventType === 'execute') return 'executed';
  if (eventType === 'schedule_review') return 'waiting_review';
  if (eventType === 'block') return 'blocked';
  if (eventType === 'close') return 'closed';
  return currentStatus;
}

function transitionAgentTask(task = {}, event = {}) {
  const current = normalizeAgentTask(task, task);
  const type = text(event.type);
  const nextStatus = transitionTargetStatus(current.status, type);
  if (!VALID_STATUSES.has(nextStatus)) throw new Error(`invalid agent task status: ${nextStatus}`);
  if (type === 'close' && !text(event.conclusion)) throw new Error('close event requires conclusion');

  const at = text(event.at || new Date().toISOString());
  const historyItem = {
    type,
    actor: text(event.actor || 'agent'),
    at,
    fromStatus: current.status,
    toStatus: nextStatus,
    note: text(event.note || event.conclusion || ''),
  };

  return {
    ...current,
    status: nextStatus,
    dueDate: text(event.dueDate || current.dueDate),
    conclusion: type === 'close' ? text(event.conclusion) : current.conclusion,
    updatedAt: at,
    history: [...(current.history || []), historyItem],
  };
}

function hasApproval(action = {}) {
  return AUTO_APPROVERS.has(text(action.approvedBy).toLowerCase());
}

function actionSources(action = {}) {
  return list(action.actionSource || action.source || action.sources).map(item => item.toLowerCase());
}

function evidenceCount(action = {}) {
  return list(action.evidence || action.factsConsidered || action.reason || action.hypothesis).length;
}

function isReadOnly(action = {}) {
  const actionType = text(action.actionType || action.type).toLowerCase();
  const entityType = text(action.entityType).toLowerCase();
  return READ_ONLY_ACTIONS.has(actionType) ||
    entityType.startsWith('selection_') ||
    entityType.includes('report') ||
    entityType.includes('diagnostic');
}

function isLowRiskAdAction(action = {}) {
  const actionType = text(action.actionType || action.type).toLowerCase();
  const entityType = text(action.entityType).toLowerCase();
  if (actionType === 'bid_up') return false;
  if (['bid', 'budget', 'placement'].includes(actionType)) {
    const currentValue = actionType === 'budget'
      ? metricNumber(action.currentBudget)
      : (actionType === 'placement' ? metricNumber(action.currentPlacementPercent) : metricNumber(action.currentBid));
    const suggestedValue = actionType === 'budget'
      ? metricNumber(action.suggestedBudget)
      : (actionType === 'placement' ? metricNumber(action.suggestedPlacementPercent) : metricNumber(action.suggestedBid));
    if (currentValue !== undefined && suggestedValue !== undefined && suggestedValue > currentValue) return false;
  }
  if (LOW_RISK_AD_ACTIONS.has(actionType) && LOW_RISK_AD_ENTITIES.has(entityType)) return true;
  if (!LOW_RISK_EXTENDED_AD_ENTITIES.has(entityType)) return false;
  if (['pause', 'bid_down'].includes(actionType)) return true;
  if (actionType !== 'bid') return false;
  const currentBid = metricNumber(action.currentBid);
  const suggestedBid = metricNumber(action.suggestedBid);
  return currentBid !== undefined && suggestedBid !== undefined && suggestedBid <= currentBid;
}

function isHighImpactListing(action = {}) {
  const actionType = text(action.actionType || action.type).toLowerCase();
  const entityType = text(action.entityType).toLowerCase();
  const impact = action.impact || {};
  return entityType === 'listing' &&
    (actionType === 'copy_edit' || actionType === 'title_edit' || actionType === 'listing_edit') &&
    (impact.top50Sku === true || impact.highSalesSku === true || impact.highImpact === true || action.protected === true);
}

function isHighImpactCreate(action = {}) {
  const actionType = text(action.actionType || action.type).toLowerCase();
  const entityType = text(action.entityType).toLowerCase();
  return actionType === 'create' && ['campaign', 'sb_campaign', 'structure'].includes(entityType);
}

function assessAuthorization(action = {}) {
  if (isReadOnly(action)) {
    return {
      mode: 'auto_read',
      riskLevel: 'none',
      dryRunRequired: false,
      verificationRequired: false,
      blocks: [],
      requirements: ['record_source_and_freshness'],
    };
  }

  const sources = actionSources(action);
  const blocks = [];
  if (!hasApproval(action)) blocks.push('missing_ai_or_manual_approval');
  if (sources.includes('generator_candidate')) blocks.push('generator_candidate_cannot_execute');

  if (isHighImpactListing(action)) {
    blocks.push('top50_or_high_impact_listing_requires_boundary_release');
    return {
      mode: blocks.some(block => block === 'missing_ai_or_manual_approval' || block === 'generator_candidate_cannot_execute') ? 'blocked' : 'escalate',
      riskLevel: 'high',
      dryRunRequired: true,
      verificationRequired: true,
      blocks,
      requirements: ['explicit_boundary_release', 'dry_run', 'backend_application_verification', 'follow_up_review'],
    };
  }

  if (isHighImpactCreate(action)) {
    blocks.push('new_campaign_or_structure_create_requires_boundary_release');
    return {
      mode: blocks.some(block => block === 'missing_ai_or_manual_approval' || block === 'generator_candidate_cannot_execute') ? 'blocked' : 'escalate',
      riskLevel: 'high',
      dryRunRequired: true,
      verificationRequired: true,
      blocks,
      requirements: ['explicit_boundary_release', 'product_market_evidence_stack', 'dry_run', 'post_create_audit'],
    };
  }

  if (blocks.length) {
    return {
      mode: 'blocked',
      riskLevel: 'unknown',
      dryRunRequired: true,
      verificationRequired: true,
      blocks,
      requirements: ['rewrite_as_ai_or_manual_approved_schema'],
    };
  }

  if (isLowRiskAdAction(action)) {
    return {
      mode: 'auto_execute',
      riskLevel: evidenceCount(action) > 0 ? 'low' : 'medium',
      dryRunRequired: true,
      verificationRequired: true,
      blocks: [],
      requirements: ['dry_run', 'execute', 'landing_verification', 'adjustment_log', 'effect_review'],
    };
  }

  return {
    mode: 'escalate',
    riskLevel: 'medium',
    dryRunRequired: true,
    verificationRequired: true,
    blocks: ['unsupported_or_unclassified_action_surface'],
    requirements: ['classify_surface_before_execution'],
  };
}

function buildReviewTasks({ sourceTaskId = '', action = {}, timeContext = {} } = {}) {
  const reviewPlan = action.reviewPlan || {};
  const days = reviewDaysFromAction(action);
  const inferredBaseline = reviewPlan.baseline ? null : baselineFromAction(action);
  return days.map(day => normalizeAgentTask({
    source: 'effect_review',
    kind: 'effect_review',
    title: `${text(action.sku || action.asin || action.id || 'action')} ${day}日效果复查`,
    description: text(reviewPlan.rollbackIf || reviewPlan.escalationPlan || '复查动作后的订单、花费、ACOS 和库存影响。'),
    subject: {
      sku: action.sku,
      asin: action.asin,
      entityId: action.id || action.entityId,
    },
    status: 'waiting_review',
    priority: day <= 1 ? 'P1' : 'P2',
    dueDate: addDays(timeContext.businessDate || timeContext.runAt, day),
    reviewPlan: {
      ...reviewPlan,
      ...(inferredBaseline ? { baseline: inferredBaseline } : {}),
      checkAfterDays: days,
      checkAfterDay: day,
      rollbackIf: text(reviewPlan.rollbackIf || reviewPlan.escalationPlan || ''),
    },
    reviewOf: {
      sourceTaskId: text(sourceTaskId),
      actionId: text(action.id || action.entityId),
      actionType: text(action.actionType),
      entityType: text(action.entityType),
    },
  }, timeContext));
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildAgentLedger(input = {}) {
  const timeContext = input.timeContext || {};
  const tasks = (input.tasks || []).map(task => normalizeAgentTask(task, timeContext));
  const actions = (input.actions || []).map(action => ({
    ...action,
    authorization: assessAuthorization(action),
  }));
  const reviewTasks = actions.flatMap(action => buildReviewTasks({
    sourceTaskId: action.sourceTaskId || action.taskId || '',
    action,
    timeContext,
  }));
  const nextOpenTasks = [...tasks, ...reviewTasks].filter(task => task.status !== 'closed');

  return {
    generatedAt: text(input.generatedAt || timeContext.runAt || new Date().toISOString()),
    businessDate: dateOnly(timeContext.businessDate || timeContext.runAt),
    dataDate: dateOnly(timeContext.dataDate || timeContext.businessDate || timeContext.runAt),
    sourceRunId: text(timeContext.sourceRunId || ''),
    summary: {
      taskCount: tasks.length,
      actionCount: actions.length,
      reviewTaskCount: reviewTasks.length,
      nextOpenTaskCount: nextOpenTasks.length,
      byStatus: countBy(nextOpenTasks, task => task.status),
      byLane: countBy(tasks, task => task.lane),
      authorization: countBy(actions, action => action.authorization.mode),
    },
    tasks,
    actions,
    reviewTasks,
    nextOpenTasks,
  };
}

module.exports = {
  assessAuthorization,
  buildAgentLedger,
  buildReviewTasks,
  normalizeAgentTask,
  reviewDaysFromAction,
  transitionAgentTask,
};
