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
    name: 'external_inbox',
    required: false,
    inputs: ['external_task_text', 'external_task_file', 'external_task_dir'],
  },
  {
    name: 'proactive_operating_audit',
    required: false,
    inputs: ['snapshot_file', 'time_context'],
  },
  {
    name: 'old_product_maintenance',
    required: false,
    inputs: ['all_sku_operating_review', 'daily_deposit_status'],
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
    name: 'trend_anomaly_check',
    required: false,
    inputs: ['daily_learning_file', 'kpi_baseline'],
  },
  {
    name: 'report',
    required: false,
    inputs: ['execution_verify', 'execution_summary', 'execution_coverage'],
  },
]);

const DORMANT_COMPONENTS = Object.freeze([
  {
    id: 'agent_unattended_gate',
    status: 'dormant',
    reason: 'Unattended execute gating is not accepted as completion proof until actions carry falsifiable goals and landed readback.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'agent_unattended_supervisor',
    status: 'dormant',
    reason: 'Scheduler heartbeat alone does not prove product judgement, execution, or effect review closure.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'agent_unattended_scheduler',
    status: 'dormant',
    reason: 'Schedule install/audit artifacts are operational plumbing, not business closure evidence.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'agent_goal_audit',
    status: 'dormant',
    reason: 'Goal audit can summarize evidence but must not replace ledger/effect-review proof.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'agent_completion_audit',
    status: 'dormant',
    reason: 'Completion audit previously aggregated green artifacts without proving one action lifecycle.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'ai_decision_brief_artifact',
    status: 'dormant',
    reason: 'The brief is a view artifact and can hide product-identity mistakes; task cards remain the source artifact.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'operating_hub_feedback_artifact',
    status: 'dormant',
    reason: 'Feedback file only mirrors command results and must not count as effect-review feedback.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'ad_structure_opportunities_detail',
    status: 'dormant',
    reason: 'The detail audit is not product-level closure and is no longer a default daily stage.',
    mainFlow: false,
    completionProof: false,
  },
  {
    id: 'review_evidence_artifact',
    status: 'dormant',
    reason: 'Review evidence files are inputs only; the effect-review verdict and ledger transition are the closure proof.',
    mainFlow: false,
    completionProof: false,
  },
]);

function dormantComponent(id) {
  return DORMANT_COMPONENTS.find(item => item.id === id) || null;
}

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
  DORMANT_COMPONENTS,
  STAGE_STATUSES,
  assertStageStatus,
  createStageRegistry,
  dormantComponent,
  normalizeStage,
};
