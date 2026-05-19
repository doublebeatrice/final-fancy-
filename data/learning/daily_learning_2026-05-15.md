# Daily Learning 2026-05-15

- localDate: 2026-05-15
- businessDate: 2026-05-15
- dataDate: 2026-05-14
- baselineQuality: complete
- productCards: 1269
- 7d units: 3665
- 7d ad spend: 6665.04
- 7d ad sales: unavailable in snapshot window
- 7d ad ACOS: unavailable
- inventory tight: 68
- stale inventory: 101
- low profit: 139
- proactive KPI status: off_track
- proactive new product launch gaps: 14
- proactive arrival ad recovery gaps: 3
- proactive price actions: 145
- proactive expired season keyword waste rows: 179
- proactive listing repair gaps: 307

## Task Pressure
- seven_day_unadjusted: 519
- ad_structure_missing: 479
- season_tail: 178
- stale_inventory_risk: 129
- inventory_tight: 57
- season_preheat: 42
- season_peak: 42
- profit_bleeding: 23

## All-Day Landing (across 24 runs)
- total records: 526
- success: 211
- failed: 0
- manual-review: 12
- skipped: 16
- dry-run planned: 287
- unknown: 0
- best run by success count: ops_2026-05-15T01-38-49-461Z (82)

## Final Run
- run id: today_ops_2026-05-15T09-28-00-666Z
- success: 5, failed: 0, manual-review: 0, skipped: 0, dry-run: 5, unknown: 0

## Final-Run Schema (last action_schema only, NOT all-day total)
- schema SKUs: 5
- planned SKUs: 5
- executable SKUs: 5
- review SKUs: 0
- planned actions: 5

## Action Breakdown (across all runs today)
- landed success: 211
- landed failed: 0
- manual-review: 12
- skipped: 16
- dry-run planned: 287
- unknown: 0

## Decision Attribution
- claude: planned 20, landed 10, failed 0, manual-review 0, skipped 0, dry-run 10
- codex: planned 506, landed 201, failed 0, manual-review 12, skipped 16, dry-run 277

## Carry Forward
- Must read this file before tomorrow's decisions.
- Compare 1d, 3d, 7d, 14d, and 30d movement against the sources listed in the JSON record.
- All-day landing is the canonical day-completion lens. Final-run schema reflects only the last action_schema run; it is normal for that to be a manual repair queue with 0 executable actions.
- Budget correction carry-forward: after operator challenge, false campaign budget cuts were traced to raw `profitRate` misuse, 3d no-order proxy overreach, and missing action-granularity judgment. Restored protected converters, DN vase/flower-bucket budgets, additional false cuts, and the `ZO0892` / `YH3707` operator-logic misses. Detailed record: `data/learning/overbudget_error_audit_2026-05-15.md`.
- Tomorrow's budget rule: protect converting, stocked traffic; use `netProfit` / `busyNetProfit` / operator reference profit rather than raw `profitRate`; and choose the action layer by the cleanest converting evidence. Clean campaign -> campaign budget. Weak SKU/campaign with one efficient target/keyword -> adjust only that lower-layer entity.
