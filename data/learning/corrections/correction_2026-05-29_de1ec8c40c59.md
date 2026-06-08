# Operator Correction Risk Audit - correction_2026-05-29_de1ec8c40c59

- businessDate: 2026-05-29
- dataDate: 2026-05-28
- severity: high
- surface: general_decision
- subject: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:latest snapshot or backend readb
- sourceRunId: correction_risk_1780105450861

## Correction
- learning_memory:correction:lesson_correction_2026-05-25_3bb7c84cb2e6:latest snapshot or backend readb

## Risk Categories
- data_freshness_risk

## Immediate Controls
- record_operator_correction_as_authoritative_feedback
- freeze_same_rule_auto_execute_until_audit_closes
- require_human_visible_summary_before_next_same_surface_write
- block_decisions_from_reusing_the_stale_snapshot

## Required Checks
- read_latest_daily_learning_and_final_run_landing
- verify_latest_snapshot_businessDate_dataDate_sourceRunId
- inspect_related_action_schema_and_execution_verify
- inspect_adjustment_log_for_same_sku_or_same_entity
- compare_decision_inputs_against_fresh_backend_snapshot

## Follow-Up Tasks
- P1 operator_correction_risk_audit: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:latest snapshot or backend readb operator correction risk audit due 2026-05-29
- P1 same_rule_scan: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:latest snapshot or backend readb same-rule recent action scan due 2026-05-29
- P1 learning_patch: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:latest snapshot or backend readb correction learning patch due 2026-05-30

## Long-Term Learning Patch
- lessonId: lesson_correction_2026-05-29_de1ec8c40c59
- status: active_correction
- doNotApplyWhen:
  - latest snapshot or backend readback is missing
  - decision evidence cannot be tied to the current businessDate/dataDate
  - same rule has an unresolved correction audit
  - landing verification for the previous write is missing or contradictory
