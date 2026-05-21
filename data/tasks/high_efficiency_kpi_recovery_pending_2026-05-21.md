# High-efficiency KPI recovery pending - 2026-05-21

Business date: 2026-05-20
Data date: 2026-05-19

This packet contains high-efficiency bid-up rows that passed run_actions dry-run validation. It is not live authorization.

- source schema: data/snapshots/high_efficiency_bid_schema_2026-05-20_latest.json
- dry-run sourceRunId: ops_2026-05-20T23-35-31-472Z
- validated SKUs: 22
- validated actions: 24
- full generated candidates: 113
- full review holds/diagnose/protect: inventory_protect 32; hold 31; diagnose 31
- validated risk mix: high_efficiency_small_bid_up=19, high_efficiency_controlled_bid_up=3, traffic_push=2

## Top validated rows

| SKU | Entity | Change | Evidence |
| --- | --- | ---: | --- |
| GT4431 | keyword: celebration of life favors [483633669788415] | 0.23 -> 0.3 | high_efficiency_strong_bid_up: strong_conversion+inventory_room+profit_room; orders7=4; acos7=0.0222; invDays=45; netProfit=0.2251; busyNetProfit=0.2211. |
| SE5942 | autoTarget: 552818927709107 [552818927709107] | 0.1 -> 0.13 | high_efficiency_strong_bid_up: strong_conversion+inventory_room+profit_room; orders7=4; acos7=0.0381; invDays=56; netProfit=0.2361; busyNetProfit=0.2323. |
| SHQ3950 | autoTarget: 518298526886690 [518298526886690] | 0.28 -> 0.33 | high_efficiency_standard_bid_up: good_conversion+inventory_ok+profit_ok; orders7=2; acos7=0.0670; invDays=79; netProfit=0.2142; busyNetProfit=0.2077. |
| BIO0026 | keyword: square containers [474977580858457] | 0.15 -> 0.18 | high_efficiency_standard_bid_up: good_conversion+inventory_ok+profit_ok; orders7=2; acos7=0.0241; invDays=60; netProfit=0.2183; busyNetProfit=0.1441. |
| YAN2061 | autoTarget: 460704091170452 [460704091170452] | 0.08 -> 0.09 | high_efficiency_standard_bid_up: good_conversion+inventory_ok+profit_ok; orders7=3; acos7=0.0550; invDays=46; netProfit=0.1622; busyNetProfit=0.1509. |
| SE5608 | keyword: +bear +shirt [296220949124115] | 0.28 -> 0.31 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=4; acos7=0.0704; invDays=24; netProfit=0.2602; busyNetProfit=0.2576. |
| WC2648 | keyword: inbagi memorial cardinal sign pins set [407997974293402] | 0.7 -> 0.73 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=2; acos7=0.1375; invDays=90; netProfit=0.1832; busyNetProfit=0.1768. |
| YB0698 | keyword: get well bear [529213102212390] | 0.31 -> 0.34 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0886; invDays=92; netProfit=0.1929; busyNetProfit=0.1656. |
| YUT4466 | keyword: inflatable number [212176392824662] | 0.5 -> 0.53 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0210; invDays=105; netProfit=0.4015; busyNetProfit=0.3824. |
| GT3814 | sbKeyword: memorial ribbons for funeral [548402655807644] | 0.25 -> 0.28 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0263; invDays=31; netProfit=0.1910; busyNetProfit=0.1884. |
| QA3169 | autoTarget: 413580923610078 [413580923610078] | 0.25 -> 0.28 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.1173; invDays=34; netProfit=0.1110; busyNetProfit=0.1064. |
| GM2851 | autoTarget: 448803720940707 [448803720940707] | 0.29 -> 0.32 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.1401; invDays=86; netProfit=0.0717; busyNetProfit=0.0632. |
| DEA0023 | autoTarget: 462521710588121 [462521710588121] | 0.28 -> 0.31 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0415; invDays=89; netProfit=0.1866; busyNetProfit=0.1577. |
| XIX2353 | sbKeyword: letter stencils [2002103403219] | 0.25 -> 0.28 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=6; acos7=0.0583; invDays=22; netProfit=0.1160; busyNetProfit=0.1137. |
| XIX2353 | sbKeyword: wizard font stencils [123766584996120] | 0.3 -> 0.33 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0590; invDays=22; netProfit=0.1160; busyNetProfit=0.1137. |
| QAA3143 | sbKeyword: crown brooch pin [21502426980329] | 0.25 -> 0.28 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0924; invDays=34; netProfit=0.2946; busyNetProfit=0.2937. |
| GM2389 | sbKeyword: bulk christian gifts for women [523903674134120] | 0.3 -> 0.33 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0390; invDays=40; netProfit=0.0139; busyNetProfit=0.0123. |
| UAN0188 | sbKeyword: inspirational journal [480473000198868] | 0.24 -> 0.26 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0424; invDays=66; netProfit=0.2145; busyNetProfit=0.2068. |
| WAR1276 | autoTarget: 349347303610156 [349347303610156] | 0.22 -> 0.24 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.1216; invDays=35; netProfit=0.2259; busyNetProfit=0.2143. |
| QA3169 | autoTarget: 463271235835225 [463271235835225] | 0.15 -> 0.17 | high_efficiency_small_bid_up: positive_conversion+borderline_inventory_or_profit; orders7=1; acos7=0.0083; invDays=34; netProfit=0.1110; busyNetProfit=0.1064. |

## Dry-run command

```powershell
node scripts\execute\run_actions.js data\snapshots\high_efficiency_bid_schema_2026-05-21_pending_validated.json --snapshot data\snapshots\high_efficiency_execution_snapshot_2026-05-20_latest.json --dry-run --fast-scope
```

## Live command after explicit approval

```powershell
node scripts\execute\run_actions.js data\snapshots\high_efficiency_bid_schema_2026-05-21_pending_validated.json --snapshot data\snapshots\high_efficiency_execution_snapshot_2026-05-20_latest.json --execute --fast-scope
```
