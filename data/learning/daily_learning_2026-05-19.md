# Daily Learning 2026-05-19

- localDate: 2026-05-19
- businessDate: 2026-05-18
- dataDate: 2026-05-17
- baselineQuality: warning
- actionQuality: executed
- runQuality: needs_attention
- qualityWarnings: listing_fetch_missing, listing_coverage_low
- productCards: 1262
- adRowsTotal: 6360
- sellerSalesRows: 183
- listingCoverage: 0.0%
- 7d units: 3668
- 7d ad spend: 0.00
- 7d ad sales: unavailable in snapshot window
- 7d ad ACOS: unavailable
- inventory tight: 70
- stale inventory: 98
- low profit: 138
- proactive KPI status: off_track
- proactive new product launch gaps: 23
- proactive arrival ad recovery gaps: 8
- proactive price actions: 144
- proactive expired season keyword waste rows: 0
- proactive listing repair gaps: 0
- operating closure: arrival_ad_recovery_closed_with_manual_repair, generated candidates 7, primary actions 7

## Task Pressure
- ad_structure_missing: 660
- seven_day_unadjusted: 584
- season_tail: 138
- stale_inventory_risk: 126
- inventory_tight: 61
- season_peak: 23
- season_preheat: 13

## All-Day Landing (across 16 runs)
- total records: 180
- success: 46
- failed: 0
- manual-review: 0
- skipped: 0
- dry-run planned: 134
- unknown: 0
- best run by success count: ops_2026-05-19T01-55-55-931Z (17)

## Final Run
- run id: arrival_ad_recovery_closure_2026-05-19
- success: 7, failed: 0, manual-review: 0, skipped: 0, dry-run: 0, unknown: 0

## Final-Run Schema (last action_schema only, NOT all-day total)
- schema SKUs: 7
- planned SKUs: 7
- executable SKUs: 7
- review SKUs: 0
- planned actions: 7

## Action Breakdown (across all runs today)
- landed success: 269
- landed failed: 1
- manual-review: 0
- skipped: 0
- dry-run planned: 155
- unknown: 0

## Decision Attribution
- claude: planned 14, landed 14, failed 0, manual-review 0, skipped 0, dry-run 0
- codex: planned 332, landed 176, failed 1, manual-review 0, skipped 0, dry-run 155
- unattributed: planned 79, landed 79, failed 0, manual-review 0, skipped 0, dry-run 0

## Carry Forward
- Must read this file before tomorrow's decisions.
- Compare 1d, 3d, 7d, 14d, and 30d movement against the sources listed in the JSON record.
- All-day landing is the canonical day-completion lens. Final-run schema reflects only the last action_schema run; it is normal for that to be a manual repair queue with 0 executable actions.

## Low-Efficiency Closeout Correction
- Operator correction: do not generalize a low-efficiency example only to the same window. Under high ad-cost pressure, scan 3d, 7d, 15d, and 30d together for high-ACOS small-step controls.
- Current 2026-05-19 closeout: after the generalized pass and the low-bid floor correction, executable low-efficiency bid-down rows are 0. The only repeat-blocked row observed was `auto_wire ties for cords_th3351 / queryBroadRelMatches`, blocked by backend recent-system-adjust protection.
- Bid floor lesson: do not assume every keyword has a `$0.25` minimum. SP keyword/auto/manual and non-video SB can be below `$0.25`; SBV/video SB rows should be treated as `$0.25` floor unless a refreshed backend row proves a lower landed value.
- SBV verification lesson: `/keywordSb/batchEditKeywordSbColumn` can return API success for a sub-floor SBV bid that does not remain landed after refresh. For SBV/video bid changes, completion requires a fresh row pull with the expected bid and updated timestamp, not API success alone.
- Low-bid lesson: do not filter all rows with `bid < 0.10` out of the low-efficiency pass. Non-SBV SP rows can still have legal down-step room below `$0.10`; clamp by actual floor and verify live.

## Over-Budget ProductAd Closeout
- Final run: `ops_2026-05-19T06-18-40-615Z`; local time `2026-05-19T14:18:40`, businessDate `2026-05-18`, dataDate `2026-05-17`.
- Action schema: `data/snapshots/action_schema_overbudget_productad_pause_2026-05-19_codex.json`.
- Scope: over-budget productAd cleanup only. Generated 30 no-order productAd pause candidates, dry-run narrowed them to 4 executable, 12 manual-review, and 14 skipped-invalid-state.
- Executed and verified 4/4 productAd pauses: `BEU0541`, `DAY2987`, `TUR8821`, `RU2438`. API failures 0, not-landed 0, note failures 0.
- Review/skipped lesson: many generated candidates were already under inactive parent campaign/ad-group state or exceeded the review budget. Keep using execution dry-run as the final writable-state filter before live over-budget cleanup.
- Tomorrow checkpoint: check 1d/3d same-SKU units and campaign spend. Desired result is lower over-budget waste without same-SKU sales loss; re-enable only if units drop without replacement traffic.

## Over-Budget Controlled Budget Closeout
- Final run: `ops_2026-05-19T06-21-55-179Z`; local time `2026-05-19T14:21:55`, businessDate `2026-05-18`, dataDate `2026-05-17`.
- Action schema: `data/snapshots/action_schema_overbudget_controlled_budget_up_2026-05-19_codex.json`.
- Scope: controlled budget lifts for out-of-budget campaigns that were still converting inside profit room. Top 10 candidates dry-ran to 5 executable and 5 same-SKU-cooldown reviews.
- Executed and verified 5/5 campaign budget lifts: `SE5608`, `SE5942`, `SE6685`, `QAA3143`, `SAN0149`. API failures 0, not-landed 0, note failures 0.
- Held by cooldown: `QQ2806`, `WAR1276`, `HAY0218`, `GT3814`, `SHQ2216`; do not force them again today without new traffic evidence.
- Tomorrow checkpoint: compare 1d/3d spend, orders, and ACOS against profit room before any repeat traffic-push. If spend rises without order lift, roll back the specific campaign budget rather than broad cutting the SKU.
