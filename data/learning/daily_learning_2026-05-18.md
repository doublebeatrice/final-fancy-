# Daily Learning 2026-05-18

- localDate: 2026-05-18
- businessDate: 2026-05-17
- dataDate: 2026-05-16
- baselineQuality: complete
- productCards: 1271
- 7d units: 3596
- 7d ad spend: 5823.53
- 7d ad sales: unavailable in snapshot window
- 7d ad ACOS: unavailable
- inventory tight: 75
- stale inventory: 100
- low profit: 140
- proactive KPI status: off_track
- proactive new product launch gaps: 14
- proactive arrival ad recovery gaps: 2
- proactive price actions: 147
- proactive expired season keyword waste rows: 170
- proactive listing repair gaps: 261

## Task Pressure
- seven_day_unadjusted: 659
- ad_structure_missing: 480
- season_tail: 255
- stale_inventory_risk: 124
- inventory_tight: 64
- season_peak: 52
- season_preheat: 49
- profit_bleeding: 27
- reserved_page_watch: 5

## All-Day Landing (across 0 runs)
- total records: 0
- success: 0
- failed: 0
- manual-review: 0
- skipped: 0
- dry-run planned: 0
- unknown: 0
- best run by success count: n/a (0)

## Final Run
- run id: today_ops_2026-05-18T01-41-18-939Z
- success: 0, failed: 0, manual-review: 0, skipped: 0, dry-run: 0, unknown: 0

## Final-Run Schema (last action_schema only, NOT all-day total)
- schema SKUs: 10
- planned SKUs: 0
- executable SKUs: 0
- review SKUs: 10
- planned actions: 0

## Action Breakdown (across all runs today)
- landed success: 0
- landed failed: 0
- manual-review: 0
- skipped: 0
- dry-run planned: 0
- unknown: 0

## Decision Attribution
- none

## Carry Forward
- Must read this file before tomorrow's decisions.
- Compare 1d, 3d, 7d, 14d, and 30d movement against the sources listed in the JSON record.
- All-day landing is the canonical day-completion lens. Final-run schema reflects only the last action_schema run; it is normal for that to be a manual repair queue with 0 executable actions.

## Low-Efficiency Rule Repair
- 2026-05-18 11:19-11:21 local: corrected the `improving_marginally` rule. A clean 3d window is not recovery when the 7d low-efficiency pool still has clicks/spend and zero orders.
- Landed 6 small bid-down fixes after the rule correction: `SH0424/kids uv 50 umbrella hat 0.53->0.48`, `XUL2303/funny office desk gift 0.24->0.21`, `YMF1073/baby in bloom favors 0.20->0.17`, `LEM5778/asinAccessoryRelated 0.21->0.18`, `QUN1382/asinAccessoryRelated 0.32->0.29`, `AE1101/asinExpandedFrom=B09VPT893B 0.45->0.42`.
- Verification: all 6 records are `api_success_landed` in `data/adjustments/adjustments_2026-05-18.json`; refreshed `data/tasks/low_efficiency_pools_2026-05-18.json` has `actionable=0`.
- 2026-05-18 11:30 local: corrected the cooldown interpretation. The 14-day cooldown cannot shield non-same-day rows that are still burning spend in the 7d low-efficiency pool. Same-day rows remain protected, but 7d zero-order rows with meaningful spend/clicks and 7d high-ACOS rows now get one small bid-down.
- The cooldown repair found 71 additional non-same-day rows, total 7d spend 519.48, and executed all 71 small bid-downs. All 71 are `api_success_landed`; refreshed `data/tasks/low_efficiency_pools_2026-05-18.json` again has `actionable=0`.
