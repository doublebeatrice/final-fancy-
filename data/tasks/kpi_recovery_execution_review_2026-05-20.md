# KPI recovery execution review - 2026-05-20

Business date: 2026-05-20
Data date: 2026-05-19
Source: `data/adjustments/adjustments_2026-05-20.json`, dry-run `ops_2026-05-20T07-34-48-533Z`

## Gate

- KPI gate is `fail`.
- Deposit is `complete`: sales core, ad full export, and inventory raw inputs are now archived for 5-20.
- The ad full export, inventory CSV, and sales core export were recovered from live backend APIs and archived into the 5-20 raw folder; they are no longer snapshot-derived fallbacks.
- Closure verifier passes with no deposit gaps; the day remains `needs_recovery` only because the KPI gate failed.
- Backend preflight initially timed out on the selection page CDP evaluate. Reloading the selection tab restored Runtime.evaluate and the full backend preflight then passed for adv, sellerinventory, and selection.

## Current execution posture

- Live action ledger today: 655 success, 0 manual review, 16 failed.
- Successful rows counted by landed-action evidence exclude failed rows and dry-runs. Earlier low-efficiency batches contributed 587 success; the controlled NO3390 high-efficiency bid-up contributed 1 success; recovery/mix batch `ops_2026-05-20T10-28-28-826Z` contributed 41 success; later successful live batches contributed 15 success.
- High-efficiency KPI recovery rows: 37 dry-run rows across 31 SKUs.
- High-efficiency live rows landed today: 1.
- Dry-run rows are opportunity evidence only and are not counted as KPI recovery actions.
- Landed action conflict audit: `review_needed`; successful live rows 650 in the audit snapshot; same-entity reverse conflicts 0; same-name mixed direction groups 6; latest-run mixed SKU count 0. File: `data/tasks/landed_action_conflict_audit_2026-05-20.md`.
- Low-efficiency raw pool still shows 568 raw candidates, but the current agent write chain has `eligibleActions=0`; treat 568 as a raw scanner backlog, not as pending live writes.
- Raw recovery progress: `seller_sales_core_7d_2026-05-20.csv` has 183 rows / 56 columns; `ad_sku_summary_30d_2026-05-20.csv` has 664 rows / 159 columns; `inv_auto_filtered_2026-05-20-19-06-11.csv` has 446 rows / 364 columns. Raw recovery queue is clear.

## Decision split

| Class | Rows | SKUs | Decision |
| --- | ---: | ---: | --- |
| Executed | 1 | 1 | Controlled live bid-up landed and verified. |
| Watch-only | 25 | 21 | Evidence is positive but mostly one-order or borderline ACOS/profit. Recheck next 1d/3d window. |
| Blocked or confirm | 11 | 9 | Inventory under 30 days or profit guard weak. Do not execute without fresh inventory/profit review. |

## Executed

| SKU | Entity | Bid | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| NO3390 | keyword `baby shower gift bags for guests` in `kw2_butterfly baby shower_no3390` | 0.15 -> 0.18 | orders7=3; ACOS7=2.58%; invDays=84; stockTotal=131; netProfit=10.75%; busyNetProfit=7.97% | Executed; API success and final lookup success. |

Execution command used:

```powershell
node scripts\execute\run_actions.js data\snapshots\high_efficiency_bid_schema_2026-05-20_kpi_no3390_single.json --snapshot data\snapshots\high_efficiency_execution_snapshot_2026-05-20_fresh.json --execute
```

Execution result:

- Source run: `ops_2026-05-20T08-24-28-184Z`
- API result: `api_success`
- Final lookup: success=1, not_landed=0, blocked=0, failed=0
- Adjustment log: `data/adjustments/adjustments_2026-05-20.json`
- Current KPI checkpoint landedActionSuccess: 644; landedActionFailed: 16

This single-row schema was split out because `high_efficiency_bid_schema_2026-05-20_kpi_executable2.json` does not contain NO3390 and should not be used for this exact decision.

## Watch-only rows

These rows have positive signal but should stay under observation because most have only one order, borderline ACOS, or thinner profit room:

- ZO0892 autoTarget `auto_christian gifts for women_zo0892`: 0.17 -> 0.19; orders7=2; ACOS7=0.33%; invDays=54; netProfit=9.55%; busyNetProfit=2.71%.
- EY2727 sbKeyword `sbvkw1_straw sun hats for women_ey2727`: 0.27 -> 0.30; orders7=2; ACOS7=2.49%; invDays=40; netProfit=8.84%; busyNetProfit=6.21%.
- IF1738 keyword `kw_q2 profit if1738 broad_if1738`: 0.20 -> 0.22; orders7=1; ACOS7=0.24%; invDays=54; netProfit=25.78%; busyNetProfit=24.04%.
- DUI0086 sbKeyword `large wooden cutting board-dui0086-sbv-s-new`: 0.25 -> 0.28; orders7=1; ACOS7=0.63%; invDays=60; netProfit=20.81%; busyNetProfit=17.15%.
- QA3169 autoTarget `auto_softball senior night gifts_qa3169`: 0.19 -> 0.21; orders7=1; ACOS7=1.06%; invDays=34; netProfit=11.10%; busyNetProfit=10.64%.
- LRU1537 keyword `kw board_bear paper plates napkins_lru1537`: 0.31 -> 0.34; orders7=1; ACOS7=1.36%; invDays=76; netProfit=14.27%; busyNetProfit=9.91%.
- TUR5292 keyword `ai_kw exact_prayer scripture cards_tur5292`: 0.42 -> 0.45; orders7=1; ACOS7=2.05%-6.37%; invDays=35; netProfit=27.93%; busyNetProfit=27.11%.
- SHQ3950 autoTarget `auto_baby shower games_SHQ3950`: 0.26 -> 0.29; orders7=1; ACOS7=2.30%; invDays=79; netProfit=21.42%; busyNetProfit=20.77%.
- YUT2946 keyword/autoTarget pool rows: orders7=1; ACOS7=2.57%-10.44%; invDays=334; netProfit=15.34%; busyNetProfit=7.29%.
- FE3235, YB0698, QQ2806, SAN1213, KZ5816, MF6328, YUT4464, YCL1246, WAR1276, YAN0656, YUT2927, SE6685: keep watch-only until the next review window confirms repeat orders or stronger conversion.

## Blocked or confirm rows

Do not execute these rows in the KPI recovery pass without fresh evidence:

- Inventory under 30 days: XIX2353, SE7586, NEW0005, AE2139, QUN1025, YAN0087, KZ6074.
- Profit guard weak: UY0879, KZ6722, QUN1025.

## Next checks

- Do not repeat the NO3390 write unless the next 1d/3d review shows it failed to land or needs a new action.
- Re-run KPI gate on 2026-05-21 and compare against the recovery target.
- Re-run effect review at the 3-day window; do not close the 14 review items on a 1-day signal.
- Recheck the 6 same-name mixed direction groups by entity layer at the 1d/3d window: YUT2927, YUT4464, YUT4460, YUT4458, MF6292, MF6328.
- Re-run deposit status after the three original raw files are restored or redownloaded.
