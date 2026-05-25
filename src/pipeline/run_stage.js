const { assertStageStatus } = require('./stage_registry');

function list(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)].filter(Boolean);
}

function nextRetryAt(stage = {}, error = null) {
  const explicit = error?.nextRetryAt || error?.next_retry_at || '';
  if (explicit) return explicit;
  const minutes = Number(stage.retryDelayMinutes || 0);
  if (!minutes) return '';
  return new Date(Date.now() + minutes * 60000).toISOString();
}

function normalizeResult(raw = {}, stage = {}) {
  const result = raw || {};
  const status = assertStageStatus(result.status || (result.skipped ? 'skipped' : 'success'));
  const blockedReason = String(result.blocked_reason || result.blockedReason || result.reason || result.details?.reason || '');
  return {
    status,
    inputs: result.inputs !== undefined ? result.inputs : (stage.inputs || []),
    outputs: result.outputs || {},
    blocked_reason: status === 'blocked' || status === 'skipped' ? blockedReason : blockedReason,
    missing_data: list(result.missing_data || result.missingData),
    next_retry_at: String(result.next_retry_at || result.nextRetryAt || ''),
    details: result.details,
  };
}

function normalizeError(error = {}, stage = {}) {
  const status = assertStageStatus(error.stageStatus || error.status || error.pipelineStatus || 'failed');
  return {
    status,
    inputs: error.inputs || stage.inputs || [],
    outputs: error.outputs || {},
    blocked_reason: String(error.blocked_reason || error.blockedReason || error.message || ''),
    missing_data: list(error.missing_data || error.missingData || error.details),
    next_retry_at: nextRetryAt(stage, error),
    error: String(error.message || error),
  };
}

async function runStage(context, stage, fn, options = {}) {
  const startedAt = new Date().toISOString();
  const step = {
    name: stage.name,
    status: 'in_progress',
    inputs: options.inputs !== undefined ? options.inputs : (stage.inputs || []),
    outputs: {},
    blocked_reason: '',
    missing_data: [],
    next_retry_at: '',
    startedAt,
    durationMs: 0,
  };
  context.manifest.steps.push(step);
  context.persist();

  try {
    const raw = await fn();
    const result = normalizeResult({
      inputs: options.inputs !== undefined ? options.inputs : undefined,
      ...raw,
    }, stage);
    Object.assign(step, result);
    if (result.details !== undefined) step.details = result.details;
    step.finishedAt = new Date().toISOString();
    step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
    context.persist();
    return result;
  } catch (error) {
    const result = normalizeError(error, stage);
    Object.assign(step, result);
    step.finishedAt = new Date().toISOString();
    step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
    context.persist();
    if (options.continueOnError || result.status === 'skipped') return result;
    throw error;
  }
}

module.exports = {
  normalizeError,
  normalizeResult,
  runStage,
};
