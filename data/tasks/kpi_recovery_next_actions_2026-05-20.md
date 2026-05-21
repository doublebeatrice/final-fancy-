# KPI recovery next actions - 2026-05-20

Business date: 2026-05-20
Data date: 2026-05-19
Source run: ops_2026-05-20T07-34-48-533Z

## Account Gate

- KPI gate: fail.
- Sales: actual 525,427.69 vs target 541,080.88.
- Units: actual 3,663 vs target 3,754.
- Net profit rate: actual 19.41% vs min 19.47%.
- ACOS: actual 19.98% vs max 19.77%.
- Refund rate: actual 5.46% vs max 5.28%.
- Ad cost share: actual 10.12% vs max 10.80%.
- Next recovery line 2026-05-21: sales at least 543,689.74; units at least 3,770; net profit rate at least 19.48%; ACOS not above 19.73%; refund rate not above 5.25%; ad cost share not above 10.80%.
- Operator posture: recover volume only through rows with conversion evidence, inventory room, and profit room; do not count dry-runs as landed KPI actions.

## Already Landed

Do not repeat same-entity successful live writes until the next effect window proves a new action is needed.

| SKU | Entity | Bid | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| YUT4464 | keyword: `pool party decorations for kids birthday-yut4464-system-keyword` | 0.33 -> 0.36 | orders7=1; ACOS7=5.12%; invDays=107; netProfit=25.09% | same entity already has a successful live write today |
| NO3390 | keyword: `kw2_butterfly baby shower_no3390` | 0.15 -> 0.18 | orders7=3; ACOS7=2.58%; invDays=84; netProfit=10.75% | same entity already has a successful live write today |
| YUT2946 | autoTarget: `auto_21 pool float_yut2946` | 0.3 -> 0.33 | orders7=1; ACOS7=10.44%; invDays=334; netProfit=15.34% | same entity already has a successful live write today |

## High-Priority Watch Pool

Promote only after fresh 1d/3d evidence shows repeat conversion and guardrails still pass.

| SKU | Entity | Bid | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| TUR5292 | keyword: `ai_kw exact_prayer scripture cards_tur5292` | 0.42 -> 0.45 | orders7=1; ACOS7=2.05%; invDays=35; netProfit=27.93% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| TUR5292 | keyword: `ai_kw exact_prayer scripture cards_tur5292` | 0.42 -> 0.45 | orders7=1; ACOS7=6.37%; invDays=35; netProfit=27.93% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SAN1213 | keyword: `kw_cowboyhat_san1213` | 0.3 -> 0.33 | orders7=1; ACOS7=3.98%; invDays=56; netProfit=16.93% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YB0698 | manualTarget: `asin_bear_yb0698` | 0.27 -> 0.3 | orders7=1; ACOS7=3.48%; invDays=92; netProfit=19.29% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| IF1738 | keyword: `kw_q2 profit if1738 broad_if1738` | 0.2 -> 0.22 | orders7=1; ACOS7=0.24%; invDays=54; netProfit=25.78% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YUT2946 | keyword: `kw broad_21 pool float_yut2946` | 0.27 -> 0.3 | orders7=1; ACOS7=2.57%; invDays=334; netProfit=15.34% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| LRU1537 | keyword: `kw board_bear paper plates napkins_lru1537` | 0.31 -> 0.34 | orders7=1; ACOS7=1.36%; invDays=76; netProfit=14.27% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| WAR1276 | autoTarget: `auto_rainbow party-war1276` | 0.19 -> 0.21 | orders7=1; ACOS7=8.35%; invDays=35; netProfit=22.59% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YCL1246 | autoTarget: `auto_crylic crystal picks _ycl1246` | 0.14 -> 0.15 | orders7=1; ACOS7=5.48%; invDays=57; netProfit=18.47% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YAN0656 | autoTarget: `auto_drysunf_yan0656` | 0.22 -> 0.24 | orders7=1; ACOS7=8.51%; invDays=71; netProfit=28.39% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SHQ3950 | autoTarget: `auto_baby shower games_SHQ3950` | 0.26 -> 0.29 | orders7=1; ACOS7=2.30%; invDays=79; netProfit=21.42% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QQ2806 | autoTarget: `auto_rainbow_qq2806` | 0.17 -> 0.19 | orders7=1; ACOS7=3.93%; invDays=30; netProfit=27.42% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QQ2806 | sbKeyword: `sbv kw_rainbow_qq2806` | 0.3 -> 0.33 | orders7=1; ACOS7=5.31%; invDays=30; netProfit=27.42% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| KZ5816 | sbKeyword: `sbvkw_vip party_kz5816` | 0.29 -> 0.32 | orders7=1; ACOS7=4.12%; invDays=31; netProfit=25.83% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QA3169 | autoTarget: `auto_softball senior night gifts_qa3169` | 0.19 -> 0.21 | orders7=1; ACOS7=1.06%; invDays=34; netProfit=11.10% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| EY2727 | sbKeyword: `sbvkw1_straw sun hats for women_ey2727` | 0.27 -> 0.3 | orders7=2; ACOS7=2.49%; invDays=40; netProfit=8.84% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SE6685 | sbKeyword: `sbvkw_bear clothes basic_se6685` | 0.25 -> 0.28 | orders7=1; ACOS7=14.71%; invDays=59; netProfit=21.00% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| FE3235 | sbKeyword: `sbvkw1_christian gift set_fe3235` | 0.3 -> 0.33 | orders7=1; ACOS7=2.78%; invDays=112; netProfit=23.16% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| DUI0086 | sbKeyword: `large wooden cutting board-dui0086-sbv-s-new` | 0.25 -> 0.28 | orders7=1; ACOS7=0.63%; invDays=60; netProfit=20.81% | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |

## Blocked Pool

Do not execute these as KPI recovery bid-ups without fresh inventory/profit evidence.

| SKU | Entity | Bid | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| AE2139 | keyword: `kw_1q clearstorage_ae2139` | 0.42 -> 0.45 | orders7=1; ACOS7=4.58%; invDays=20; netProfit=23.40% | inventory_under_30_days |
| AE2139 | keyword: `kw_1q clearstorage_ae2139` | 0.35 -> 0.38 | orders7=1; ACOS7=8.40%; invDays=20; netProfit=23.40% | inventory_under_30_days |
| SE7586 | sbKeyword: `sbvkw_bear clothes basic tee_se7586` | 0.27 -> 0.3 | orders7=1; ACOS7=1.53%; invDays=25; netProfit=8.92% | inventory_under_30_days |
| KZ6074 | autoTarget: `auto_vip party_kz6074` | 0.28 -> 0.31 | orders7=1; ACOS7=12.46%; invDays=26; netProfit=18.51% | inventory_under_30_days |
| YAN0087 | autoTarget: `acrylic photo frame yan0087-system-a` | 0.18 -> 0.2 | orders7=1; ACOS7=10.41%; invDays=27; netProfit=23.90% | inventory_under_30_days |
| QUN1025 | autoTarget: `auto_graduation bouquet _qun1025` | 0.09 -> 0.1 | orders7=1; ACOS7=8.21%; invDays=21; netProfit=4.02% | inventory_under_30_days; net_profit_guard_weak; busy_profit_guard_weak |
| UY0879 | autoTarget: `b2b auto_therapy office decor_uy0879` | 0.25 -> 0.28 | orders7=1; ACOS7=1.01%; invDays=53; netProfit=7.81% | net_profit_guard_weak |
| NEW0005 | autoTarget: `auto3_wooden love sign_new0005` | 0.08 -> 0.09 | orders7=1; ACOS7=2.22%; invDays=27; netProfit=28.20% | inventory_under_30_days |
| ZO0892 | autoTarget: `auto_christian gifts for women_zo0892` | 0.17 -> 0.19 | orders7=2; ACOS7=0.33%; invDays=54; netProfit=9.55% | busy_profit_guard_weak |
| XIX2353 | sbKeyword: `sbv kw broad_letter stencils_xix2353` | 0.29 -> 0.32 | orders7=2; ACOS7=6.37%; invDays=22; netProfit=11.60% | inventory_under_30_days |
| XIX2353 | sbKeyword: `sbv kw broad_letter stencils_xix2353` | 0.3 -> 0.33 | orders7=1; ACOS7=4.32%; invDays=22; netProfit=11.60% | inventory_under_30_days |
| KZ6722 | sbKeyword: `sb kw_vip party_kz6722 kz6074 kz5816` | 0.21 -> 0.23 | orders7=1; ACOS7=6.01%; invDays=285; netProfit=5.98% | net_profit_guard_weak; busy_profit_guard_weak |

## True Approval Needed

These require operator review because the current evidence conflicts or crosses the normal write boundary.

| SKU | Entity | Bid | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| YUT4464 | keyword: `pool party decorations for kids birthday-yut4464-system-keyword` | 0.5 -> 0.53 | orders7=1; ACOS7=13.01%; invDays=107; netProfit=25.09% | same_name_mixed_direction_review |
| MF6328 | sbKeyword: `sbkw_pool floats_mf6328 mf6292 mf6280` | 0.3 -> 0.33 | orders7=1; ACOS7=4.63%; invDays=310; netProfit=21.09% | same_name_mixed_direction_review |
| YUT2927 | autoTarget: `ai_auto_birthday pool float_yut2927` | 0.27 -> 0.3 | orders7=1; ACOS7=13.01%; invDays=158; netProfit=17.35% | same_name_mixed_direction_review |

## Next Run Checklist

1. Run `npm run ops:kpi:gate -- --date 2026-05-21` when the next actual line is available.
2. Re-run effect review at the next 1d/3d window before promoting watch-only rows.
3. Keep low-efficiency raw-pool counts separate from executable write-chain actions.
4. Keep the day in recovery until KPI gate passes or the next recovery target is explicitly carried forward.
