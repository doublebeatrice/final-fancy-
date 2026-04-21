# Execution Chain Fix Report - 2026-04-20

## Scope

This round only changed execution, verification, consistency, and inventory-note recording paths.

Business strategy rules in `src/adjust_lib.js` were not changed.

## Code Changes

- Rebuilt `auto_adjust.js` as a valid UTF-8 script after the old file exposed broken Chinese encoding during editing.
- Kept the same strategy entry: `analyzeCard(card, history)`.
- SP keyword writes now send full row payloads, not minimal metadata-only rows.
- SP keyword writes include `campaignIdArray`.
- SP target execution is split by actual source rows:
  - `STATE.autoRows` -> `/advTarget/batchEditAutoTarget`, property `autoTarget`
  - `STATE.targetRows` -> `/advTarget/batchUpdateManualTarget`, property `manualTarget`
- SB keyword and SB target endpoints were kept unchanged.
- Post-write verification now clears cached ad rows before refetch:
  - `STATE.kwRows = []`
  - `STATE.autoRows = []`
  - `STATE.targetRows = []`
  - `STATE.sbRows = []`
- Final success now means API success plus fresh lookup confirms the target bid.
- API success without fresh lookup confirmation is classified as `not_landed`.
- Backend `403` with system auto-adjust blocking is classified as `conflict`, not normal failure.
- History is written only for final verified `success`.
- Inventory notes are written after final verification, using final status.
- Inventory note template changed to the requested operations format:
  - `【YYYY-MM-DD HH:mm】`
  - `阶段判断`
  - `当前问题`
  - `核心判断`
  - `执行动作`
  - `动作目的`
  - `后续观察点`
  - `备注`

## Root Cause

The earlier "SP keyword 111 planned, 0 landed" result was not a pure write failure.

The key consistency bug was that `fetchAllData()` skipped keyword refetch when `STATE.kwRows` already had data. Post-write verification was therefore comparing against stale keyword rows. After clearing `STATE.kwRows` before verification and refetching, SP keyword writes were confirmed as landed.

SP auto/target had a separate routing issue: manual product targets from `STATE.targetRows` were being sent through the auto-target endpoint. Those are now routed through `/advTarget/batchUpdateManualTarget`.

## Targeted Verification

Targeted real-write checks were run before the full retest.

- SP keyword sample: `SC3420`, keyword `463179748346107`
  - Full-row payload write succeeded.
  - Fresh keyword refetch confirmed bid `0.45`.
  - Inventory note append succeeded.
- SP manual target sample: `KV3640`, target `367712391178375`
  - Manual target endpoint write succeeded.
  - Fresh lookup confirmed bid `0.48`.
  - Inventory note append succeeded.
- SP auto target sample: `SHQ2216`, target `416371830621891`
  - Auto target endpoint write succeeded.
  - Fresh lookup confirmed bid `0.36`.
  - Inventory note append succeeded.

One earlier SC3420 validation note was written before the stale keyword-cache issue was identified and said "接口成功但回查未生效". A follow-up note was appended after forced keyword refetch confirmed the bid had landed.

## Full Retest Result

Snapshot files:

- `data/snapshots/execution_verify_2026-04-20.json`
- `data/snapshots/execution_summary_2026-04-20.json`

The full retest ran against the current state after the previous full run and history writes, so the plan size was smaller than the earlier 719-action run.

- Planned SKUs: 29
- Planned actions: 55
- Final verified success: 18
- API success but not landed: 0
- Conflict / system blocked: 37
- Failed: 0

By type:

- SP keyword: 5 verified success, 1 conflict
- SP auto target: 36 conflict
- SP manual target: 13 verified success
- SB keyword: 0 actions in this retest plan
- SB target: 0 actions in this retest plan

Inventory notes:

- Note success: 28 SKUs
- Note failure: 1 SKU
- Failed SKU: `TH2527`
- Reason: missing inventory record / aid

## Inventory Aid Mapping

The earlier 14 missing-aid SKUs were checked against the current full inventory map. They are still absent from `STATE.invMap`; no aid was guessed.

Current retest only touched one missing-aid SKU:

- `TH2527`: still missing inventory record / aid, note failed as expected.

## Status Separation

Final states are now separated as:

- `success`: API success and fresh bid lookup matched target bid.
- `not_landed`: API success but fresh lookup did not match target bid or row was missing.
- `conflict`: backend/system blocked manual adjustment, especially the 403 auto-adjust message.
- `failed`: API failure or missing metadata.

## Remaining Risk

- `TH2527` still lacks inventory aid mapping. This must be resolved in inventory data or accepted as a note failure with explicit reporting.
- The retest did not include SB keyword / SB target actions because the current strategy/history state produced no SB actions. Their existing successful chain was not modified, but this retest did not re-exercise them.
- Close/pause actions are still not covered because the current strategy output generated no close actions.

## Final Conclusion

修复后继续复测.

The main SP keyword and SP manual-target consistency bugs are fixed, and this retest had zero `not_landed` actions. The remaining blockers are inventory aid coverage for missing SKUs and a future retest that includes SB and close/pause actions when the plan naturally produces them.
