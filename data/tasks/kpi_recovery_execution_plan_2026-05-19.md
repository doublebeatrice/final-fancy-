# KPI Recovery Execution Plan - 2026-05-19

- localDate: 2026-05-20
- businessDate: 2026-05-19
- dataDate: 2026-05-18
- source snapshot: `data/snapshots/runs/today_ops_2026-05-20T01-29-37-235Z/snapshot_2026-05-20.json`
- source summary: `data/snapshots/runs/today_ops_2026-05-20T01-29-37-235Z/summary.json`

## KPI Gap

- 5/19 checkpoint sales target: 610,000; current: 525,427.69; gap: 84,572.31.
- 5/19 checkpoint units target: 4,150; current: 3,663; gap: 487.
- Final sales target: 680,000; current gap: 154,572.31.
- Final estimated net profit target: 139,000; current estimated net profit: 101,985.51; gap: 37,014.49.
- Final ACOS target: 18.00%; current: 19.98%; gap: 1.98pp.
- Final refund target: 3.80%; current: 5.46%; gap: 1.66pp.

Status: off_track. Required mode: active recovery with profit guardrails.

## Action Schema Progress

The previous daily loop detected 854 actionable over-budget campaigns but had 0 matched actions in the primary plan. This plan converts part of that pressure into a dry-run-ready recovery schema:

- candidate schema: `data/snapshots/overbudget_controlled_candidates_2026-05-19.json`
- KPI recovery schema: `data/snapshots/kpi_recovery_overbudget_mix_schema_2026-05-19.json`
- KPI recovery summary: `data/tasks/kpi_recovery_overbudget_mix_summary_2026-05-19.json`

Generated mix:

- controlled over-budget budget lifts: 20
- no-order over-budget productAd pauses: 20
- lower-layer cost-control reviews: 20
- review-only over-budget rows: 10
- total schema items: 70
- planned SKUs: 63
- planned actions in schema: 70
- budget lift cap: 80.00
- requested lift before cap: 94.99
- approved lift after cap: 79.82

Coverage check after this schema:

- overBudgetRows: 8,340
- eligibleCampaigns: 5,028
- actionableCampaigns: 854
- matchedActionCount: 70
- matchedCampaignCount: 70
- warning cleared for this schema: yes

## Dry-Run Result

Command:

```powershell
node scripts\execute\run_actions.js data\snapshots\kpi_recovery_overbudget_mix_schema_2026-05-19.json --snapshot data\snapshots\runs\today_ops_2026-05-20T01-29-37-235Z\snapshot_2026-05-20.json --dry-run
```

Dry-run result:

- external schema loaded: 14 SKUs, 14 executable actions
- manual review: 12
- invalid skipped: 44
- validation errors: 0
- dry-run executable mix: 13 campaign budget lifts, 1 productAd pause
- dry-run risk levels: `over_budget_controlled_budget_up` 13, `over_budget_no_order_pause` 1

Top dry-run actions:

- SE6599: `kw_bearshirt_se6599`, budget 13.82 -> 17.27; 53 orders, ACOS 14.1%, profit 12.4%, invDays 95.
- OB3296: `kw broad_donkey pinata_ob3296`, budget 19.23 -> 24.04; 37 orders, ACOS 15.2%, profit 21.8%, invDays 11.
- YUT3183: `kw_soccer balls-yut3183`, budget 35.00 -> 42.00; 22 orders, ACOS 11.1%, profit 18.6%, invDays 15.
- SC3420: `kw_30redbirdmemory_sc3420`, budget 27.00 -> 33.75; 29 orders, ACOS 18.9%, profit 14.2%, invDays 30.
- SIJ2012: `storage bins-sij2012-system-a`, budget 45.00 -> 54.00; 14 orders, ACOS 10.5%, profit 18.3%, invDays 22.
- HAY0218: `kw_hay0218_20260420_175558`, budget 12.15 -> 15.19; 27 orders, ACOS 7.9%, profit 12.7%, invDays 42.
- GT3814: `pin me cheer ribbon-gt3814-a2`, budget 42.00 -> 50.40; 27 orders, ACOS 16.1%, profit 19.1%, invDays 31.
- IF1427: `kw_acrylic shelves_if1427`, budget 10.50 -> 13.13; 16 orders, ACOS 9.3%, profit 19.9%, invDays 58.
- BEU0541: pause one over-budget productAd with 0 orders, 32 clicks, 9.37 spend, SKU profit -1.0%, invDays 66.

## Decision Boundary

Superseded by live execution on localDate 2026-05-20 09:59-10:00. The schema passed final authorization as `ai_approved`, `approvedBy=codex`, `canAutoExecute=true`, with validation errors at 0. The write boundary stayed inside the controlled daily cap: 13 SP campaign budget lifts and 1 over-budget/no-order productAd pause.

## Live Execution Result

Command:

```powershell
node scripts\execute\run_actions.js data\snapshots\kpi_recovery_overbudget_schema_2026-05-19.json --snapshot data\snapshots\runs\today_ops_2026-05-20T01-29-37-235Z\snapshot_2026-05-20.json --execute
```

Generated files:

- execution summary: `data/snapshots/execution_summary_2026-05-20.json`
- execution verification: `data/snapshots/execution_verify_2026-05-20.json`
- execution coverage: `data/snapshots/execution_coverage_2026-05-20.json`
- adjustment ledger: `data/adjustments/adjustments_2026-05-19.json`

Verification:

- planned SKUs/actions: 14 / 14
- API success: 13 SP campaign budget writes + 1 productAd state write
- API failed: 0
- final landed success: 14
- blocked / failed / unverified: 0 / 0 / 0
- coverage adjusted: 14, all with `reason=verified_landed`
- manual review remains: 11 SKUs, `reason=ai_review`
- invalid/paused skipped: 38
- inventory notes appended: 70 success, 0 failed

Executed actions:

- SE6599: `kw_bearshirt_se6599`, budget 13.82 -> 17.27.
- OB3296: `kw broad_donkey pinata_ob3296`, budget 19.23 -> 24.04.
- YUT3183: `kw_soccer balls-yut3183`, budget 35.00 -> 42.00.
- SC3420: `kw_30redbirdmemory_sc3420`, budget 27.00 -> 33.75.
- SIJ2012: `storage bins-sij2012-system-a`, budget 45.00 -> 54.00.
- HAY0218: `kw_hay0218_20260420_175558`, budget 12.15 -> 15.19.
- GT3814: `pin me cheer ribbon-gt3814-a2`, budget 42.00 -> 50.40.
- JUU1053: `kw broad_cakesicle stand_juu1053`, budget 23.44 -> 29.30.
- IF1427: `kw_acrylic shelves_if1427`, budget 10.50 -> 13.13.
- AE2139: `kw_1q clearstorage_ae2139`, budget 18.45 -> 23.06.
- YAN0087: `kw_cardinal memorial_yan0087`, budget 6.15 -> 7.69.
- QA1157: `auto_mini colored pencils_qa1157`, budget 18.75 -> 23.44.
- YAN2278: `baby shower games boy yan2278-system`, budget 15.00 -> 18.75.
- BEU0541: productAd `450647672433036` paused inside `auto_retirement gifts for women_beu0541` after 0 orders, 32 clicks, 9.37 spend, SKU profit -1.0%, invDays 66.

Expected KPI effect:

- This is a recovery move, not a guarantee that the month KPI is back on track.
- Intended upside: recover profitable capped demand from campaigns already converting inside profit room.
- Intended guardrail: BEU0541 pause keeps weak 0-order spend from consuming capped budget.
- Main risk: incremental spend grows faster than orders on tight-inventory SKUs; watch OB3296, YUT3183, JUU1053, AE2139 first because invDays are near the lower guardrail.

## Next Review

- 1-day review: check spend increase, order movement, ACOS, and whether capped campaigns regain delivery; revert or cap down any row where spend rises with no order movement.
- 3-day review: keep only actions where orders grow without ACOS breaking profit room; split into scale / hold / revert.
- 7-day review: compare contribution to sales gap, net profit gap, refund movement, and inventory days; keep winners in the monthly KPI recovery lane and remove weak spend.
