# Daily Readout 2026-05-06

Data source:
- Fresh snapshot: `data/snapshots/runs/today_ops_2026-05-06T06-42-17-493Z/snapshot_2026-05-06.json`
- Sales baseline: `data/core_sales/core_sales_2026-05-05.json`
- Cleanup execution: `data/snapshots/execution_summary_2026-05-06.json`

## Core Sales Movement

Compared with the 2026-05-05 persisted baseline:

- Selected seller total order sales: 632,298.82 -> 649,647.85, up 17,349.03 (+2.74%).
- Units/orders count: 4,389 -> 4,408, up 19 (+0.43%).
- Net profit rate: 17.73% -> 18.40%, up 0.67 percentage points.
- Gross profit rate: 33.07% -> 32.86%, down 0.21 percentage points.
- ACOS: 18.53% -> 18.75%, up 0.22 percentage points.
- Ad cost share: 10.52% -> 10.36%, down 0.16 percentage points.
- ROAS: 5.3959 -> 5.3342, down 0.0617.
- YoY units field: -21.68% -> -22.67%, down 0.99 percentage points.

Conclusion: top-line sales and net profit rate improved, ad cost share improved slightly, but ACOS/ROAS did not improve and YoY pressure worsened. Treat as mixed improvement, not a clean win.

## Watchlist Movement

- DN2684 improved: 7d units 18 -> 20; 7d ad orders 8 -> 12; 7d spend roughly flat; 7d ACOS improved from about 17.5% to 12.0%.
- DN2683 improved: 7d units 23 -> 28; 30d units 52 -> 59; 7d ad orders 24 -> 27; ACOS roughly stable.
- DN1655 improved volume: 7d units 39 -> 44; 30d units 77 -> 88; 7d ad orders 46 -> 50; ACOS roughly stable.
- DN1656 sold more units but ad efficiency worsened: 7d units 44 -> 56, but 7d ad orders 5 -> 4 and ACOS rose from about 14.1% to 18.4%.
- DN2108 sold more units and inventory pressure eased, but 7d ad orders fell 4 -> 3 and ACOS rose.
- DN3482 stopped 7d ad spend from 9.87 to 0 with no order loss, but sales remained weak and profit rate stayed negative.

## Task Pressure

Current task board:
- P0: 40
- P1: 40
- Data Missing: 604
- Low Priority: 573
- Review required: 1217

Pressure did not materially improve. Data missing and ad-structure signals remain high.

## Incident Learning

AE3311 wrong-keyword creation was confirmed:
- Product is godmother / Mother's Day.
- Created ad keywords included father/dad and Mexican/Cinco/fiesta terms.
- Root cause: stale low-confidence product profile plus existing ad keyword contamination in create-theme detection.

Fix applied:
- `scripts/generators/generate_profit_create_schema.js` no longer uses existing campaign/ad group/keyword text as create-theme evidence.
- Seed/listing evidence now overrides low-confidence stale product profile conflicts.
- Naked seasonal generic terms require exact seed or listing support.
- Regression added in `tests/generator_listing_signals.test.js`.

Cleanup executed:
- `data/snapshots/created_keyword_cleanup_codex_schema_2026-05-06.json`
- 39 SKUs, 122 keyword pause actions.
- API success: 122/122.
- Landed success: 122/122.
- Inventory notes: 122/122.

AE1079 seasonal miss was confirmed:
- Product is godmother / Mother's Day, but cached profile still said nurse/fiesta and listing fields were missing in the snapshot.
- Root cause: product profile and season matching did not use `createContext.keywordSeeds`, so the task board classified the group under the wrong seasonal evidence and allowed it to be suppressed by the daily board cap.
- Secondary issue: the cleanup audit trusted the stale profile too much and paused three relevant godmother keywords.

Fix and restore applied:
- `src/product_profile.js` now includes keyword seeds in profile evidence and recognizes godmother/godparent/Madrina.
- `src/season_calendar.js` maps godmother/godparent/Madrina to Mother's Day.
- `src/task_scheduler.js` repairs stale/no-listing profiles from seeds for task prioritization.
- `src/ai_task_decision.js` upgrades active season + ad structure gap + sales/inventory evidence to P1 executable review flow.
- `scripts/execute/audit_created_campaign_keywords.js` protects distinctive seed-supported terms from stale-profile false positives.
- Restored three valid AE1079 keywords with `data/snapshots/ae1079_restore_godmother_keywords_2026-05-06.json`; API success 3/3, landed success 3/3, notes 3/3.

Season gap audit added:
- Command: `node scripts/generate_season_gap_audit.js data/snapshots/latest_snapshot.json <YYYY-MM-DD>`
- Today's output: `data/tasks/season_gap_audit_2026-05-06.json` and `.md`.
- 180 active season tasks found; 56 risk items; 20 were suppressed by the main task limit.
- Risk split: critical_stale_season 26, season_structure_stale_risk 11, season_stale_watch 8, inventory_tight_no_scale 11.
- Top stale-season risks included MEL1299, STA2610, GM2827, STA2607, CEE0747, CEE0611, CEE0467, MH2710, UY3242, UY1624, AE3311, SHN1038.

## Regular Operations Executed

After the wrong-keyword incident was fixed, two validated regular operating schemas were executed against the fresh 2026-05-06 snapshot:

1. Over-budget bad-conversion control:
   - Schema: `data/snapshots/today_over_budget_bad_conversion_schema_2026-05-06.json`
   - Scope: 76 adjusted SKUs, 89 actions.
   - Action mix: 12 product-ad pauses plus 77 campaign budget reductions.
   - Validation errors before execute: 0.
   - Landed success: 89/89.
   - Inventory notes: 89/89.

2. Over-budget controlled budget lift:
   - Schema: `data/snapshots/today_over_budget_controlled_clean_schema_2026-05-06.json`
   - Scope: 43 adjusted SKUs, 57 campaign budget increases.
   - Removed from raw schema before execution: TUR5292, NEW0005, WC2648 because of missing entity/review risk.
   - Validation errors before execute: 0.
   - Landed success: 57/57.
   - Inventory notes: 57/57.

Today's executed regular actions after incident cleanup:
- 146 regular ad-ops actions landed.
- 271 total landed actions including wrong-keyword cleanup and AE1079 keyword restore.
- Tomorrow must compare spend/order/ACOS movement separately for cleanup, waste-control, and budget-lift cohorts.

## Carry Forward

- Do not execute new create workflows without running created-keyword audit first.
- Avoid new create workflows until wrong-keyword cleanup has one fresh post-clean snapshot.
- Tomorrow compare AE3311 and all cleaned SKUs for wrong-theme impressions/clicks drop and same-SKU sales stability.
- Tomorrow check AE1079 restored godmother keywords for impressions/clicks/orders and verify no fiesta/dad/father terms reappear.
- Daily close must include the season gap audit, especially critical_stale_season and season_structure_stale_risk rows, so seasonal inventory is not missed when the main board is capped.
- Tomorrow compare the 89 bad-conversion controls for spend reduction without order loss.
- Tomorrow compare the 57 controlled budget lifts for order recovery and ACOS drift.
