# Operator Correction Risk Audit - correction_2026-06-01_6d1dfbc7b613

- businessDate: 2026-06-01
- dataDate: 2026-05-31
- severity: medium
- surface: general_decision
- subject: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:a supported operating action has
- sourceRunId: correction_risk_1780300168742

## Correction
- learning_memory:correction:lesson_correction_2026-05-25_3bb7c84cb2e6:a supported operating action has

## Risk Categories
- decision_quality_risk

## Immediate Controls
- record_operator_correction_as_authoritative_feedback

## Required Checks
- read_latest_daily_learning_and_final_run_landing
- verify_latest_snapshot_businessDate_dataDate_sourceRunId
- inspect_related_action_schema_and_execution_verify
- inspect_adjustment_log_for_same_sku_or_same_entity

## Follow-Up Tasks
- P2 operator_correction_risk_audit: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:a supported operating action has operator correction risk audit due 2026-06-01
- P2 same_rule_scan: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:a supported operating action has same-rule recent action scan due 2026-06-01
- P2 learning_patch: correction:lesson_correction_2026-05-25_3bb7c84cb2e6:a supported operating action has correction learning patch due 2026-06-02

## Long-Term Learning Patch
- lessonId: lesson_correction_2026-06-01_6d1dfbc7b613
- status: active_correction
- doNotApplyWhen:
  - latest snapshot or backend readback is missing
  - decision evidence cannot be tied to the current businessDate/dataDate
  - same rule has an unresolved correction audit
  - landing verification for the previous write is missing or contradictory
