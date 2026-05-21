# KPI recovery dry-run decisions - 2026-05-20

- Generated at: 2026-05-20T12:24:21.337Z
- Source run: ops_2026-05-20T07-34-48-533Z
- Total rows: 37; SKUs: 31.
- Decision split: executed=3, approval_needed=3, blocked=12, watch_only=19.

## Operator Rule

- `executed`: same entity already has a successful live write today.
- `autonomous_recommendation`: good repeat-order evidence, inventory, and profit room, but remains dry-run until a fresh live gate is explicitly run.
- `watch_only`: positive but too early or thin for another same-day write.
- `blocked`: inventory/profit/bid-step guard blocks execution.
- `approval_needed`: mixed same-name direction or conflict review must be resolved first.

## executed

| SKU | Entity | Bid | Evidence | Reason |
| --- | --- | ---: | --- | --- |
| YUT4464 | keyword: pool party decorations for kids birthday-yut4464-system-keyword | 0.33 -> 0.36 | orders7=1; ACOS7=0.0512; invDays=107; netProfit=0.2509; busy=0.2357 | same entity already has a successful live write today |
| NO3390 | keyword: kw2_butterfly baby shower_no3390 | 0.15 -> 0.18 | orders7=3; ACOS7=0.0258; invDays=84; netProfit=0.1075; busy=0.0797 | same entity already has a successful live write today |
| YUT2946 | autoTarget: auto_21 pool float_yut2946 | 0.3 -> 0.33 | orders7=1; ACOS7=0.1044; invDays=334; netProfit=0.1534; busy=0.0729 | same entity already has a successful live write today |

## autonomous_recommendation

- none

## watch_only

| SKU | Entity | Bid | Evidence | Reason |
| --- | --- | ---: | --- | --- |
| TUR5292 | keyword: ai_kw exact_prayer scripture cards_tur5292 | 0.42 -> 0.45 | orders7=1; ACOS7=0.0205; invDays=35; netProfit=0.2793; busy=0.2711 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| TUR5292 | keyword: ai_kw exact_prayer scripture cards_tur5292 | 0.42 -> 0.45 | orders7=1; ACOS7=0.0637; invDays=35; netProfit=0.2793; busy=0.2711 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SAN1213 | keyword: kw_cowboyhat_san1213 | 0.3 -> 0.33 | orders7=1; ACOS7=0.0398; invDays=56; netProfit=0.1693; busy=0.116 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YB0698 | manualTarget: asin_bear_yb0698 | 0.27 -> 0.3 | orders7=1; ACOS7=0.0348; invDays=92; netProfit=0.1929; busy=0.1656 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| IF1738 | keyword: kw_q2 profit if1738 broad_if1738 | 0.2 -> 0.22 | orders7=1; ACOS7=0.0024; invDays=54; netProfit=0.2578; busy=0.2404 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YUT2946 | keyword: kw broad_21 pool float_yut2946 | 0.27 -> 0.3 | orders7=1; ACOS7=0.0257; invDays=334; netProfit=0.1534; busy=0.0729 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| LRU1537 | keyword: kw board_bear paper plates napkins_lru1537 | 0.31 -> 0.34 | orders7=1; ACOS7=0.0136; invDays=76; netProfit=0.1427; busy=0.0991 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| WAR1276 | autoTarget: auto_rainbow party-war1276 | 0.19 -> 0.21 | orders7=1; ACOS7=0.0835; invDays=35; netProfit=0.2259; busy=0.2143 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YCL1246 | autoTarget: auto_crylic crystal picks _ycl1246 | 0.14 -> 0.15 | orders7=1; ACOS7=0.0548; invDays=57; netProfit=0.1847; busy=0.1745 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| YAN0656 | autoTarget: auto_drysunf_yan0656 | 0.22 -> 0.24 | orders7=1; ACOS7=0.0851; invDays=71; netProfit=0.2839; busy=0.2805 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SHQ3950 | autoTarget: auto_baby shower games_SHQ3950 | 0.26 -> 0.29 | orders7=1; ACOS7=0.023; invDays=79; netProfit=0.2142; busy=0.2077 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QQ2806 | autoTarget: auto_rainbow_qq2806 | 0.17 -> 0.19 | orders7=1; ACOS7=0.0393; invDays=30; netProfit=0.2742; busy=0.2709 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QQ2806 | sbKeyword: sbv kw_rainbow_qq2806 | 0.3 -> 0.33 | orders7=1; ACOS7=0.0531; invDays=30; netProfit=0.2742; busy=0.2709 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| KZ5816 | sbKeyword: sbvkw_vip party_kz5816 | 0.29 -> 0.32 | orders7=1; ACOS7=0.0412; invDays=31; netProfit=0.2583; busy=0.2544 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| QA3169 | autoTarget: auto_softball senior night gifts_qa3169 | 0.19 -> 0.21 | orders7=1; ACOS7=0.0106; invDays=34; netProfit=0.111; busy=0.1064 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| EY2727 | sbKeyword: sbvkw1_straw sun hats for women_ey2727 | 0.27 -> 0.3 | orders7=2; ACOS7=0.0249; invDays=40; netProfit=0.0884; busy=0.0621 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| SE6685 | sbKeyword: sbvkw_bear clothes basic_se6685 | 0.25 -> 0.28 | orders7=1; ACOS7=0.1471; invDays=59; netProfit=0.21; busy=0.2051 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| FE3235 | sbKeyword: sbvkw1_christian gift set_fe3235 | 0.3 -> 0.33 | orders7=1; ACOS7=0.0278; invDays=112; netProfit=0.2316; busy=0.179 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |
| DUI0086 | sbKeyword: large wooden cutting board-dui0086-sbv-s-new | 0.25 -> 0.28 | orders7=1; ACOS7=0.0063; invDays=60; netProfit=0.2081; busy=0.1715 | positive signal but one-order, thinner profit, or needs next 1d/3d confirmation |

## blocked

| SKU | Entity | Bid | Evidence | Reason |
| --- | --- | ---: | --- | --- |
| AE2139 | keyword: kw_1q clearstorage_ae2139 | 0.42 -> 0.45 | orders7=1; ACOS7=0.0458; invDays=20; netProfit=0.234; busy=0.2173 | inventory_under_30_days |
| AE2139 | keyword: kw_1q clearstorage_ae2139 | 0.35 -> 0.38 | orders7=1; ACOS7=0.084; invDays=20; netProfit=0.234; busy=0.2173 | inventory_under_30_days |
| SE7586 | sbKeyword: sbvkw_bear clothes basic tee_se7586 | 0.27 -> 0.3 | orders7=1; ACOS7=0.0153; invDays=25; netProfit=0.0892; busy=0.0866 | inventory_under_30_days |
| KZ6074 | autoTarget: auto_vip party_kz6074 | 0.28 -> 0.31 | orders7=1; ACOS7=0.1246; invDays=26; netProfit=0.1851; busy=0.1768 | inventory_under_30_days |
| YAN0087 | autoTarget: acrylic photo frame yan0087-system-a | 0.18 -> 0.2 | orders7=1; ACOS7=0.1041; invDays=27; netProfit=0.239; busy=0.2328 | inventory_under_30_days |
| QUN1025 | autoTarget: auto_graduation bouquet _qun1025 | 0.09 -> 0.1 | orders7=1; ACOS7=0.0821; invDays=21; netProfit=0.0402; busy=0.0373 | inventory_under_30_days; net_profit_guard_weak; busy_profit_guard_weak |
| UY0879 | autoTarget: b2b auto_therapy office decor_uy0879 | 0.25 -> 0.28 | orders7=1; ACOS7=0.0101; invDays=53; netProfit=0.0781; busy=0.0699 | net_profit_guard_weak |
| NEW0005 | autoTarget: auto3_wooden love sign_new0005 | 0.08 -> 0.09 | orders7=1; ACOS7=0.0222; invDays=27; netProfit=0.282; busy=0.2727 | inventory_under_30_days |
| ZO0892 | autoTarget: auto_christian gifts for women_zo0892 | 0.17 -> 0.19 | orders7=2; ACOS7=0.0033; invDays=54; netProfit=0.0955; busy=0.0271 | busy_profit_guard_weak |
| XIX2353 | sbKeyword: sbv kw broad_letter stencils_xix2353 | 0.29 -> 0.32 | orders7=2; ACOS7=0.0637; invDays=22; netProfit=0.116; busy=0.1137 | inventory_under_30_days |
| XIX2353 | sbKeyword: sbv kw broad_letter stencils_xix2353 | 0.3 -> 0.33 | orders7=1; ACOS7=0.0432; invDays=22; netProfit=0.116; busy=0.1137 | inventory_under_30_days |
| KZ6722 | sbKeyword: sb kw_vip party_kz6722 kz6074 kz5816 | 0.21 -> 0.23 | orders7=1; ACOS7=0.0601; invDays=285; netProfit=0.0598; busy=0.0451 | net_profit_guard_weak; busy_profit_guard_weak |

## approval_needed

| SKU | Entity | Bid | Evidence | Reason |
| --- | --- | ---: | --- | --- |
| YUT4464 | keyword: pool party decorations for kids birthday-yut4464-system-keyword | 0.5 -> 0.53 | orders7=1; ACOS7=0.1301; invDays=107; netProfit=0.2509; busy=0.2357 | same_name_mixed_direction_review |
| MF6328 | sbKeyword: sbkw_pool floats_mf6328 mf6292 mf6280 | 0.3 -> 0.33 | orders7=1; ACOS7=0.0463; invDays=310; netProfit=0.2109; busy=0.1518 | same_name_mixed_direction_review |
| YUT2927 | autoTarget: ai_auto_birthday pool float_yut2927 | 0.27 -> 0.3 | orders7=1; ACOS7=0.1301; invDays=158; netProfit=0.1735; busy=0.1393 | same_name_mixed_direction_review |
