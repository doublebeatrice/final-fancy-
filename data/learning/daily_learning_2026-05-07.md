# Daily Learning 2026-05-07

- dataDate: 2026-05-06
- baselineQuality: complete
- productCards: 1263
- 7d units: 4401
- 7d ad spend: 6783.15
- 7d ad sales: unavailable in snapshot window
- 7d ad ACOS: unavailable
- inventory tight: 62
- stale inventory: 116
- low profit: 127

## Task Pressure
- seven_day_unadjusted: 655
- ad_structure_missing: 499
- season_peak: 199
- stale_inventory_risk: 131
- inventory_tight: 60
- season_preheat: 48
- profit_bleeding: 23

## Decisions
- schema SKUs: 10
- planned SKUs: 0
- executable SKUs: 0
- review SKUs: 10
- planned actions: 0
- landed success: 0
- landed failed: 0
- dry-run planned: 0

## 2026-05-08 Execution
- mode: compressed observation pool into actions, not broad observation
- schemas: `data/snapshots/today_ai_ops_action_schema_2026-05-08.json`, `data/snapshots/today_ai_ops_action_schema_2026-05-08_second_pass.json`
- summary: `data/snapshots/today_execution_summary_2026-05-08.json`
- adjusted SKUs: 73
- adjusted actions: 109
- landed success: 109
- failed / blocked / not landed: 0
- manual review hold: 1 (`XUL2303`, marginal profit gate)
- direction mix: 53 opportunity-recovery bid ups, 56 controlled loss-reduction bid downs
- action mix: 50 auto targets, 8 manual targets, 40 keywords, 11 SB keywords
- third-pass scan: `data/snapshots/today_third_pass_candidate_scan_2026-05-08.json` found 123 recovery candidates and 116 control candidates before final filtering.

## 2026-05-08 Follow-up Rules
- Tomorrow first compare entity-level impressions, clicks, spend, orders, and ACOS against today's baseline before adding any more push.
- Continue only if core traffic recovers with acceptable ACOS; if spend rises without orders, do not keep increasing.
- `WAR1276` and `HAY0219` need inventory guard because inventory days are near 30-40.
- `SHQ2216` keyword control from yesterday should not be casually reversed; today restored only the core auto target.
- `GM3207`, `TUR5292`, `UAN3257`, and `DAY2987` were not left in vague observation: they were explicitly held for no-action/diagnosis because margin, ACOS, inventory, or structure state did not support direct push today.
- User correction: do not stop at a tiny high-confidence batch while hundreds of SKUs remain. Daily ops must run full-scan candidate compression after the first pass and classify each remaining candidate as action, diagnosis, or explicit no-action.

## Carry Forward
- Must read this file before tomorrow's decisions.
- Compare 1d, 3d, 7d, 14d, and 30d movement against the sources listed in the JSON record.
- 2026-05-08 operator lesson: loss control is not pure pausing. For clicks/impressions down vs 30d daily average, first judge whether the decline is reasonable inventory guard, reasonable loss control, stale decline, abnormal ad disconnect, or opportunity underdelivery.
- Opportunity underdelivery to inspect before action: `QQ1764`, `SHQ2216`, `GT3814`, `WAR1276`, `YUT4466`, `SE6685`, `YAN4898`, `HAY0219`. Restore only historical converting/core traffic.
- Abnormal ad disconnect to diagnose before scaling: `GM3207`, `TUR5292`, `UAN3257`, `CL1976`, `GT4431`, `DAY2987`, `YUT2927`. Check budget, state, bid, campaign/adGroup, listing, and inventory before any push.
- Historical adjustment review is required before new execution. Refreshed `data/learning/historical_adjustment_review_2026-05-08.md`: 8,445 history records, 6,530 replay events, 1,319 comparable 7d records. Do not repeat-push recently adjusted SKUs unless today's evidence clearly supports opportunity recovery or disconnect repair.
- Historical replay warning: broad bid-up has weak/negative evidence when source/baseline is weak; prefer targeted down/pause of proven bad traffic and targeted restoration of historical converting traffic. Protect recently touched high-spend SKUs (`DN1655`, `DN2684`, `DN2683`, `LO3817`, `XIX2353`, `SAN0383`, `LED3945`, `GT3801`, `WOO0174`) from additional casual changes.
