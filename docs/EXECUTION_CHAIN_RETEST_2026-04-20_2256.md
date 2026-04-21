# Execution Chain Retest - 2026-04-20 22:56

## Scope

Retest used the current fixed execution chain without changing strategy logic.

Flow:

1. Full data fetch.
2. Current strategy plan generation.
3. Real ad execution.
4. Forced fresh refetch.
5. Bid landing verification.
6. Inventory note append.
7. History write for verified success only.

## Input

- Product cards: 427
- SP keywords: 6716
- SP auto targets: 1518
- SP manual targets: 1626
- SB keyword rows: 3531
- SB target rows: 31

## Plan

- Planned SKUs: 24
- Planned actions: 38

Current plan is smaller than the first full real run because earlier verified actions and history/cooldown state changed the current actionable pool.

## Result

- Verified success: 1
- API success but not landed: 0
- Conflict / system blocked: 37
- Failed: 0

By type:

- SP keyword: 1 conflict
- SP auto target: 36 conflicts
- SP manual target: 1 verified success
- SB keyword: 0 actions in this retest
- SB target: 0 actions in this retest

Inventory notes:

- Note success: 24
- Note failure: 0
- Missing aid in this retest: 0

## Interpretation

The fixed consistency chain behaved correctly:

- No action was counted as success unless fresh bid lookup confirmed it.
- There were no `not_landed` cases.
- The 37 blocked actions were classified as `conflict`, not normal failure and not success.
- Inventory notes were written after final state classification.

The main remaining limitation is coverage, not the repaired execution chain:

- This retest did not exercise SB actions because current strategy/history state generated no SB actions.
- This retest did not exercise close/pause actions because current strategy generated no close actions.

## Conclusion

修复后继续复测.

The repaired execution and note consistency chain passed this retest for the actions that were actually generated. A broader retest still needs a plan that naturally includes SB and close/pause actions.
