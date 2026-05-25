const STAGE_STATUSES = Object.freeze(['success', 'partial', 'blocked', 'failed', 'skipped']);

const DEFAULT_STAGES = Object.freeze([
  {
    name: 'preflight',
    required: true,
    inputs: ['active_browser_session', 'panel_runtime_functions'],
    retryDelayMinutes: 15,
  },
  {
    name: 'snapshot',
    required: true,
    inputs: ['snapshot_plan', 'fetch_options'],
    retryDelayMinutes: 15,
  },
  {
    name: 'daily_task_pool',
    required: true,
    inputs: ['snapshot_file', 'adjustment_log'],
  },
  {
    name: 'proactive_operating_audit',
    required: false,
    inputs: ['snapshot_file', 'time_context'],
  },
  {
    name: 'season_title_dry_run',
    required: false,
    inputs: ['snapshot_file', 'season_events', 'listing_cache'],
  },
  {
    name: 'low_efficiency_candidates',
    required: false,
    inputs: ['snapshot_file', 'low_efficiency_rows'],
  },
  {
    name: 'high_efficiency_rows',
    required: false,
    inputs: ['active_browser_session', 'ad_backend_rows'],
    retryDelayMinutes: 15,
  },
  {
    name: 'ad_structure_opportunities',
    required: false,
    inputs: ['snapshot_file'],
  },
  {
    name: 'sku_ad_form_summary',
    required: false,
    inputs: ['snapshot_file', 'action_schema_file'],
  },
  {
    name: 'schema_validate',
    required: true,
    inputs: ['snapshot_file', 'action_schema_file', 'allowed_operation_scope'],
  },
  {
    name: 'dry_run',
    required: true,
    inputs: ['snapshot_file', 'validated_action_schema'],
  },
  {
    name: 'execute_verify_note',
    required: false,
    inputs: ['dry_run_result', 'validated_action_schema'],
    retryDelayMinutes: 30,
  },
  {
    name: 'daily_learning',
    required: true,
    inputs: ['manifest', 'task_pool', 'adjustment_records'],
  },
  {
    name: 'report',
    required: false,
    inputs: ['execution_verify', 'execution_summary', 'execution_coverage'],
  },
]);

function normalizeStage(stage = {}, index = 0) {
  const name = String(stage.name || '').trim();
  if (!name) throw new Error('stage name is required');
  return {
    name,
    index,
    required: stage.required !== false,
    inputs: Array.isArray(stage.inputs) ? stage.inputs.map(item => String(item)).filter(Boolean) : [],
    retryDelayMinutes: Number.isFinite(Number(stage.retryDelayMinutes)) ? Number(stage.retryDelayMinutes) : 0,
  };
}

function createStageRegistry(stages = DEFAULT_STAGES) {
  const normalized = stages.map(normalizeStage);
  const byName = new Map();
  for (const stage of normalized) {
    if (byName.has(stage.name)) throw new Error(`duplicate stage registered: ${stage.name}`);
    byName.set(stage.name, stage);
  }
  return {
    stages: normalized,
    names: normalized.map(stage => stage.name),
    get(name) {
      const stage = byName.get(String(name || '').trim());
      if (!stage) throw new Error(`unknown pipeline stage: ${name}`);
      return stage;
    },
    has(name) {
      return byName.has(String(name || '').trim());
    },
  };
}

function assertStageStatus(status) {
  const normalized = String(status || '').trim();
  if (!STAGE_STATUSES.includes(normalized)) {
    throw new Error(`invalid stage status: ${status}`);
  }
  return normalized;
}

module.exports = {
  DEFAULT_STAGES,
  STAGE_STATUSES,
  assertStageStatus,
  createStageRegistry,
  normalizeStage,
};
