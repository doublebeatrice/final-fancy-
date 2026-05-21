# Team Lead Ad-Spend Risk Check 2026-05-20

- localDate: 2026-05-20
- businessDate: 2026-05-19
- dataDate: 2026-05-18
- snapshot: data/snapshots/runs/today_ops_2026-05-20T01-29-37-235Z/snapshot_2026-05-20.json
- SKU ad-share note: estimated as SP+SB spend / unitsSold * current price; account lifecycle metrics are the source of truth.

## Account Level

Conclusion: risk exists. Current 0-5m ad share 13.23% is above the 11% new-product line and +0.39pp vs Monday; 0-5m net profit 16.34% is -1.56pp vs Monday. Current 1y ad share 11.06% is +0.34pp vs Monday; 1y net profit 17.08% is -1.55pp vs Monday.

| source | sales | net | adShare | 0-5m sales | 0-5m net | 0-5m adShare | 0-5m ACOS | 1y net | 1y adShare |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | $525,428 | 19.41% | 10.12% | $40,489 | 16.34% | 13.23% | 22.76% | 17.08% | 11.06% |
| monday | $526,779 | 20.65% | 10.05% | $41,619 | 17.90% | 12.84% | 25.70% | 18.63% | 10.72% |
| prevWeek | $578,203 | 19.13% | 11.12% | $63,421 | 14.25% | 12.35% | 16.98% | 16.91% | 11.20% |

## Counts

- scanned product cards: 661
- 0-5m / within-1y SKU risks: 30
- regular inventory-tight + ad share >10%: 17
- recent aggressive/unreasonable spend: 40
- seasonal / graduation / node watch: 30
- landed actions today: 14; low-efficiency pool actionable 568, hold 21, skip 43

## 0-5m / Within-1y Risk

| SKU | life | inv/7dSell | u7/u30 | net | spend7 | ord7 | share7/share30 | acos7 | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LEM6581 | within1y | 23/18 | 7/24 | -10.5% | $50.1 | 4 | 18.8%/56.0% | 37.9% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| XIX2353 | 0-5m | 22/20.7 | 25/104 | 11.6% | $62.1 | 18 | 13.1%/19.2% | 17.9% | inventory_tight,low_profit,ad_share_gt_10pct |
| STY6101 | 0-5m | 57/74.2 | 5/28 | 5.9% | $40.1 | 6 | 12.3%/22.8% | 11.8% | low_profit,ad_share_gt_10pct |
| YUT3183 | within1y | 15/19.4 | 9/51 | 18.6% | $19.6 | 1 | 5.4%/21.6% | 52.3% | inventory_tight,ad_share_gt_10pct,high_acos_vs_profit |
| OB3296 | 0-5m | 11/45.5 | 4/73 | 21.8% | $25.0 | 3 | 20.9%/16.4% | 16.7% | inventory_tight,ad_share_gt_10pct |
| OCE2575 | 0-5m | 152/283.5 | 2/16 | -34.4% | $15.7 | 1 | 37.3%/102.7% | 52.9% | low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| QUN1382 | 0-5m | 28/177.3 | 6/165 | 16.8% | $29.2 | 7 | 48.7%/18.8% | 39.6% | inventory_tight,ad_share_gt_10pct,high_acos_vs_profit |
| KEJ1748 | within1y | 219/89.3 | 4/7 | -31.3% | $49.5 | 3 | 31.0%/64.8% | 29.2% | low_profit,ad_share_gt_10pct |
| GM4172 | 0-5m | 70/303.3 | 3/56 | 1.5% | $21.6 | 3 | 45.0%/25.5% | 55.6% | low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| YYW2629 | within1y | 11/6.2 | 17/44 | 20.1% | $22.7 | 2 | 2.3%/15.6% | 12.4% | inventory_tight,ad_share_gt_10pct |
| LUO1006 | within1y | 65/34.5 | 14/32 | 3.0% | $40.7 | 2 | 12.7%/21.9% | 74.1% | low_profit,ad_share_gt_10pct,high_acos_vs_profit,7d_spend_jump_without_order_growth |
| DH2685 | within1y | 83/161 | 3/25 | -21.5% | $17.8 | 2 | 39.6%/62.1% | 56.5% | low_profit,ad_share_gt_10pct,high_acos_vs_profit |

## Regular Inventory Tight + Ad Share >10%

| SKU | life | inv/7dSell | u7/u30 | net | spend7 | ord7 | share7/share30 | acos7 | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DN3049 | old | 19/14 | 20/65 | 22.5% | $140.3 | 8 | 9.9%/16.7% | 16.0% | inventory_tight,ad_share_gt_10pct |
| DUN1127 | old | 51/29.8 | 4/10 | -35.7% | $73.2 | 7 | 45.8%/111.5% | 32.0% | inventory_tight,low_profit,ad_share_gt_10pct |
| LEM6581 | within1y | 23/18 | 7/24 | -10.5% | $50.1 | 4 | 18.8%/56.0% | 37.9% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| DUN1392 | old | 42/29.4 | 5/15 | -2.3% | $59.1 | 4 | 19.4%/55.7% | 23.8% | inventory_tight,low_profit,ad_share_gt_10pct |
| QA1950 | old | 18/16.3 | 21/83 | 10.3% | $41.0 | 10 | 11.5%/45.8% | 22.4% | inventory_tight,low_profit,ad_share_gt_10pct |
| GT3812 | old | 24/28 | 17/87 | 13.4% | $21.8 | 3 | 6.8%/30.4% | 15.8% | inventory_tight,low_profit,ad_share_gt_10pct |
| DUN1391 | old | 57/18.3 | 13/18 | 9.3% | $80.2 | 4 | 12.8%/23.1% | 31.7% | inventory_tight,low_profit,ad_share_gt_10pct |
| CLO0344 | old | 29/23.3 | 12/42 | 9.8% | $40.0 | 6 | 12.7%/27.2% | 19.3% | inventory_tight,low_profit,ad_share_gt_10pct |
| UAN3248 | old | 11/16 | 14/92 | 21.4% | $9.5 | 0 | 2.6%/11.0% | 51.7% | inventory_tight,ad_share_gt_10pct,7d_no_order_waste,high_acos_vs_profit |
| YY4568 | within1y | 47/20 | 7/13 | -5.1% | $15.7 | 2 | 5.3%/32.6% | 20.5% | inventory_tight,low_profit,ad_share_gt_10pct |
| KEJ0562 | old | 20/42 | 1/9 | 5.6% | $8.2 | 0 | 23.4%/15.9% | 84.2% | inventory_tight,low_profit,ad_share_gt_10pct,7d_no_order_waste,high_acos_vs_profit |
| SIJ2012 | old | 22/14.5 | 14/40 | 18.3% | $12.7 | 2 | 1.7%/11.9% | 10.0% | inventory_tight,ad_share_gt_10pct |

## Recent Aggressive / Unreasonable Spend

| SKU | life | inv/7dSell | u7/u30 | net | spend7 | ord7 | share7/share30 | acos7 | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DUN1127 | old | 51/29.8 | 4/10 | -35.7% | $73.2 | 7 | 45.8%/111.5% | 32.0% | inventory_tight,low_profit,ad_share_gt_10pct |
| GT3308 | old | 26/31.2 | 20/101 | 7.3% | $56.9 | 10 | 20.3%/35.8% | 50.1% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit,7d_spend_jump_without_order_growth |
| LEM6581 | within1y | 23/18 | 7/24 | -10.5% | $50.1 | 4 | 18.8%/56.0% | 37.9% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| AE3311 | old | 17/35 | 8/73 | -5.7% | $26.0 | 3 | 20.6%/50.2% | 47.4% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| TH2869 | old | 57/70 | 13/69 | -3.0% | $39.8 | 12 | 23.6%/52.1% | 27.3% | low_profit,ad_share_gt_10pct |
| WEN1029 | old | 5/4.2 | 15/57 | -9.0% | $32.4 | 2 | 12.0%/37.7% | 83.1% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| DUC0055 | old | 68/31.5 | 8/14 | -6.1% | $58.8 | 8 | 22.3%/54.4% | 25.6% | low_profit,ad_share_gt_10pct |
| YUT3183 | within1y | 15/19.4 | 9/51 | 18.6% | $19.6 | 1 | 5.4%/21.6% | 52.3% | inventory_tight,ad_share_gt_10pct,high_acos_vs_profit |
| OB3296 | 0-5m | 11/45.5 | 4/73 | 21.8% | $25.0 | 3 | 20.9%/16.4% | 16.7% | inventory_tight,ad_share_gt_10pct |
| OCE2575 | 0-5m | 152/283.5 | 2/16 | -34.4% | $15.7 | 1 | 37.3%/102.7% | 52.9% | low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| SHQ2216 | old | 72/89.6 | 15/81 | 22.0% | $23.0 | 4 | 4.3%/17.2% | 31.3% | ad_share_gt_10pct,7d_spend_jump_without_order_growth |
| TH2599 | old | 8/10.8 | 11/64 | 12.4% | $11.3 | 1 | 6.8%/37.5% | 58.3% | inventory_tight,low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| QUN1382 | 0-5m | 28/177.3 | 6/165 | 16.8% | $29.2 | 7 | 48.7%/18.8% | 39.6% | inventory_tight,ad_share_gt_10pct,high_acos_vs_profit |
| YAN1353 | old | 90/504 | 1/24 | -59.1% | $22.2 | 3 | 246.4%/151.6% | 35.8% | low_profit,ad_share_gt_10pct,high_acos_vs_profit |
| MH0525 | unknown | 0/- | 0/0 | 0.0% | $46.5 | 7 | spend/no sales/spend/no sales | 33.3% | low_profit,ad_share_gt_10pct |

## Seasonal / Graduation / Node Watch

| SKU | life | inv/7dSell | u7/u30 | net | spend7 | ord7 | share7/share30 | acos7 | node |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DN1655 | old | 26/35.3 | 27/161 | 3.0% | $131.5 | 15 | 10.8%/40.9% | 14.5% | tail-season |
| DN2683 | old | 21/36.8 | 12/93 | 5.4% | $82.4 | 13 | 12.3%/21.0% | 11.4% | tail-season |
| SC3077 | old | 26/18.2 | 45/136 | 6.9% | $171.2 | 32 | 15.9%/22.0% | 24.7% | tail-season |
| GT3801 | old | 42/37.4 | 46/178 | 8.7% | $102.4 | 19 | 14.8%/40.9% | 31.5% | current/upcoming-season,tail-season |
| DN2684 | old | 30/73.5 | 6/63 | 10.9% | $52.4 | 6 | 15.3%/22.3% | 18.8% | tail-season |
| SH0423 | old | 48/25.4 | 71/164 | 1.2% | $84.9 | 39 | 9.2%/25.7% | 19.3% | current/upcoming-season |
| GT3308 | old | 26/31.2 | 20/101 | 7.3% | $56.9 | 10 | 20.3%/35.8% | 50.1% | current/upcoming-season,tail-season |
| AE3311 | old | 17/35 | 8/73 | -5.7% | $26.0 | 3 | 20.6%/50.2% | 47.4% | tail-season |
| EY0793 | old | 19/22.1 | 19/99 | 23.6% | $60.5 | 7 | 14.5%/25.3% | 36.7% | tail-season |
| WEN1029 | old | 5/4.2 | 15/57 | -9.0% | $32.4 | 2 | 12.0%/37.7% | 83.1% | tail-season |
| XIX2353 | 0-5m | 22/20.7 | 25/104 | 11.6% | $62.1 | 18 | 13.1%/19.2% | 17.9% | tail-season |
| LED3945 | old | 34/42 | 5/27 | -31.1% | $13.5 | 3 | 12.3%/106.2% | 24.4% | tail-season |

## Execution Closeout

- Today execution result: {"success":14,"productAd:success":1,"campaign:success":13}.
- BEU0541 zero-order productAd was paused. The other landed actions were mainly controlled budget lifts for converting over-budget campaigns, so they are not classified as direct waste cuts.
- Follow-up low-efficiency pass executed at 2026-05-20 10:28-10:33 CST: 567 validated bid-down actions landed, api_ok=567, api_failed=0.
- Verification dry-run at 2026-05-20 10:33 CST refetched the pool and returned actionable=0, hold=21, skip=611. Today's executable low-efficiency waste-cut pool is cleared.
- Handling rule: no SKU-level broad cuts were applied to seasonal/graduation/node traffic; the pass only compressed weak zero-order or high-ACOS bid entries.

### Top Low-Efficiency Rows Executed

| SKU | kind | entity | spend | clicks | orders | ACOS | bid | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DN1655 | manual | asinExpandedFrom=B0BF568FHP | $113.2 | 157 | 5 | 41.3% | 0.72->0.65 | cooldown_override_15d_high_acos |
| DN3049 | auto | asinSubstituteRelated | $75.6 | 113 | 1 | 109.6% | 0.70->0.60 | cooldown_override_7d_high_acos |
| ZO0892 | auto | asinSubstituteRelated | $65.7 | 172 | 3 | 55.7% | 0.41->0.38 | cooldown_override_7d_high_acos |
| QA1950 | kw | wood keychain | $65.3 | 122 | 9 | 37.3% | 0.37->0.34 | cooldown_override_15d_high_acos |
| AE3311 | auto | asinSubstituteRelated | $51.4 | 107 | 11 | 30.8% | 0.37->0.34 | cooldown_override_15d_high_acos |
| LEM6581 | auto | queryBroadRelMatches | $49.9 | 119 | 4 | 32.8% | 0.43->0.40 | cooldown_override_7d_high_acos |
| SC3077 | auto | queryBroadRelMatches | $41.9 | 110 | 5 | 36.1% | 0.35->0.32 | cooldown_override_7d_high_acos |
| GT3801 | kw | purple funeral ribbon pins | $33.3 | 64 | 1 | 222.0% | 0.36->0.33 | cooldown_override_7d_high_acos |
| QA3169 | auto | queryHighRelMatches | $30.3 | 132 | 3 | 53.2% | 0.21->0.18 | cooldown_override_15d_high_acos |
| AE2139 | kw | salad prep containers with lids | $27.2 | 47 | 1 | 36.8% | 0.52->0.47 | cooldown_override_7d_high_acos |
| KZ5816 | manual | asinExpandedFrom=B0FV8K3YKG | $25.1 | 52 | 9 | 31.5% | 0.51->0.46 | cooldown_override_7d_high_acos |
| DUN1127 | auto | queryBroadRelMatches | $24.6 | 62 | 1 | 61.5% | 0.34->0.31 | cooldown_override_7d_high_acos |
