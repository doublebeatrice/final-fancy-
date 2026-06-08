# Operator Correction Risk Audit - correction_2026-05-28_eb602cdd174a

- businessDate: 2026-05-28
- dataDate: 2026-05-27
- severity: medium
- surface: general_decision
- subject: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:same rule has an unresolved corr
- sourceRunId: correction_risk_1780018218110

## Correction
- learning_memory:correction:lesson_correction_2026-05-25_3bb7c84cb2e6:same rule has an unresolved corr

## Risk Categories
- systemic_rule_risk

## Immediate Controls
- record_operator_correction_as_authoritative_feedback
- scan_recent_batch_actions_before_treating_this_as_one_off

## Required Checks
- read_latest_daily_learning_and_final_run_landing
- verify_latest_snapshot_businessDate_dataDate_sourceRunId
- inspect_related_action_schema_and_execution_verify
- inspect_adjustment_log_for_same_sku_or_same_entity
- scan_last_7_to_30_days_for_same_rule_or_same_reason_actions

## Follow-Up Tasks
- P2 operator_correction_risk_audit: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:same rule has an unresolved corr operator correction risk audit due 2026-05-28
- P2 same_rule_scan: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:same rule has an unresolved corr same-rule recent action scan due 2026-05-28
- P2 learning_patch: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:same rule has an unresolved corr correction learning patch due 2026-05-29

## Long-Term Learning Patch
- lessonId: lesson_correction_2026-05-28_eb602cdd174a
- status: active_correction
- doNotApplyWhen:
  - latest snapshot or backend readback is missing
  - decision evidence cannot be tied to the current businessDate/dataDate
  - same rule has an unresolved correction audit
  - landing verification for the previous write is missing or contradictory
