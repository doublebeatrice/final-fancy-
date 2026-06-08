# Operator Correction Risk Audit - correction_2026-05-31_14e0e2dece26

- businessDate: 2026-05-31
- dataDate: 2026-05-30
- severity: medium
- surface: general_decision
- subject: general
- sourceRunId: correction_risk_1780218249815

## Correction
- 你发现没，自从你运营之后，数据一直下滑，你自己找找自己的问题啊

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
- P2 operator_correction_risk_audit: general operator correction risk audit due 2026-05-31
- P2 same_rule_scan: general same-rule recent action scan due 2026-05-31
- P2 learning_patch: general correction learning patch due 2026-06-01

## Long-Term Learning Patch
- lessonId: lesson_correction_2026-05-31_14e0e2dece26
- status: active_correction
- doNotApplyWhen:
  - latest snapshot or backend readback is missing
  - decision evidence cannot be tied to the current businessDate/dataDate
  - same rule has an unresolved correction audit
  - landing verification for the previous write is missing or contradictory
