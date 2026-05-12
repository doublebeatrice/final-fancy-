# Historical Adjustment Review 2026-05-08

- adjustment_history records: 8445
- impact records: 32650
- comparable 7d records: 1319
- recent records since 2026-05-01: 1252

## Lessons
- Historical replay updated from execution_impact_report: comparable 7d records=1319, total history=8445.
- Most early history before stable snapshots remains pending; use comparable records and recent landed records for decisions, not raw count alone.
- Positive historical buckets: keyword|pause|down|unknown count=116 score=0.305; keyword|unknown|up|unknown count=47 score=0.522; autoTarget|bid|down|complete count=45 score=0.563; keyword|unknown|same|unknown count=33 score=0.37; sbKeyword|unknown|up|unknown count=31 score=0.222; keyword|bid|down|complete count=27 score=0.326; autoTarget|unknown|down|unknown count=25 score=0.401; campaign|unknown|up|unknown count=21 score=0.014
- Risk buckets: autoTarget|bid|down|unknown count=157 score=-2.018; skuCandidate|unknown|same|unknown count=127 score=-1.571; keyword|bid|down|unknown count=104 score=-1.404; keyword|bid|up|unknown count=83 score=-0.447; skuCandidate|create|same|unknown count=62 score=-3.298; sbKeyword|bid|up|complete count=55 score=-0.842; keyword|bid|up|complete count=52 score=-2.554; autoTarget|bid|up|unknown count=45 score=-6.744
- Before any new action, check SKU cooldown/history: avoid repeat pushes on recently adjusted SKUs unless today evidence shows opportunity underdelivery, abnormal disconnect, inventory guard, or failed landing.

## 7d Comparable Buckets
| Bucket | Count | Score | Sales30 | Spend30 | Orders30 | ACOS30 | Profit Delta | +/- |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| autoTarget|bid|down|unknown | 157 | -2.018 | 85.6% | 150.0% | 68.2% | 1123.6% | -0.25 | 105/11 |
| skuCandidate|unknown|same|unknown | 127 | -1.571 | 51.1% | 127.9% | 62.4% | 788.5% | 11.16 | 41/32 |
| keyword|pause|down|unknown | 116 | 0.305 | 100.0% | 499.8% | 250.6% | -76.3% | 214.8 | 102/13 |
| keyword|bid|down|unknown | 104 | -1.404 | 133.5% | 208.8% | 195.5% | 1001.3% | -4.84 | 69/12 |
| keyword|bid|up|unknown | 83 | -0.447 | 141.7% | 767.1% | 106.8% | 9.3% | -114.82 | 22/56 |
| skuCandidate|create|same|unknown | 62 | -3.298 | 14.4% | 44.0% | 7.5% | 1594.8% | -8.91 | 7/22 |
| sbKeyword|bid|up|complete | 55 | -0.842 | 13.6% | 23.9% | 18.8% | 446.2% | 40.54 | 13/18 |
| keyword|bid|up|complete | 52 | -2.554 | 50.4% | 21.8% | 48.6% | 1362.6% | 25.22 | 17/23 |
| keyword|unknown|up|unknown | 47 | 0.522 | 114.1% | 31.7% | 33.1% | -58.0% | 161.75 | 32/10 |
| autoTarget|bid|up|unknown | 45 | -6.744 | 112.5% | 518.8% | 202.2% | 3416.4% | -540.26 | 6/33 |
| autoTarget|bid|down|complete | 45 | 0.563 | 130.8% | 112.0% | 108.3% | -5.0% | -18.66 | 37/2 |
| manualTarget|bid|down|unknown | 34 | -1.452 | 20.5% | 141.2% | 87.3% | 761.8% | 5.78 | 20/4 |
| autoTarget|bid|up|complete | 34 | -4.56 | 96.8% | 3.8% | 4.7% | 2450.1% | 35.68 | 11/10 |
| keyword|unknown|same|unknown | 33 | 0.37 | 100.0% | 1221.7% | 710.4% | -77.2% | 74.07 | 24/9 |
| sbKeyword|unknown|up|unknown | 31 | 0.222 | 43.7% | 8.5% | 11.5% | -36.7% | 195.25 | 17/1 |
| skuCandidate|unknown|same|complete | 29 | -0.233 | 32.8% | 160.3% | 3.4% | 23.8% | 2.66 | 3/8 |
| keyword|bid|down|complete | 27 | 0.326 | 65.2% | 41.4% | 70.0% | -8.8% | 34.81 | 21/1 |
| autoTarget|unknown|down|unknown | 25 | 0.401 | 80.1% | 61.3% | 82.4% | -14.4% | -42.68 | 20/0 |
| campaign|unknown|up|unknown | 21 | 0.014 | 29.0% | 90.6% | 51.1% | 37.9% | 8.13 | 8/8 |
| manualTarget|bid|up|complete | 20 | 0.129 | 41.0% | 0.5% | 6.0% | -3.2% | 48.66 | 12/5 |
| skuCandidate|create|same|complete | 20 | -0.354 | 37.9% | 232.5% | 5.0% | 34.5% | 2.57 | 3/9 |
| productAd|unknown|same|complete | 20 | -5.106 | 149.6% | 35.2% | 186.7% | 2959.3% | -69.95 | 14/4 |
| sbKeyword|bid|up|unknown | 17 | -0.348 | 40.5% | 558.0% | 113.4% | -38.8% | -363.23 | 3/11 |
| sbKeyword|bid|down|complete | 17 | 0.093 | 23.8% | 8.0% | 12.9% | -0.3% | 92.19 | 12/1 |
| manualTarget|bid|down|complete | 14 | 1.075 | 208.5% | 24.4% | 129.7% | -26.8% | -69.42 | 12/0 |
| sbKeyword|pause|down|unknown | 13 | 0.616 | 100.0% | 27.8% | 56.8% | -97.3% | 89.3 | 13/0 |
| sbKeyword|bid|down|unknown | 13 | 0.452 | 50.3% | 69.4% | 145.7% | -15.2% | -40.01 | 10/1 |
| keyword|unknown|down|unknown | 12 | 0.106 | 24.5% | -6.3% | 5.1% | -3.2% | 78.59 | 7/1 |
| sbKeyword|unknown|down|unknown | 11 | 0.178 | 39.8% | 2.0% | 17.0% | -10.6% | 91.08 | 9/0 |
| autoTarget|unknown|up|unknown | 10 | 0.195 | 18.9% | -0.7% | 38.8% | -17.9% | 1.94 | 4/2 |
| manualTarget|unknown|up|unknown | 7 | 0.048 | 11.9% | -7.9% | -3.7% | -3.3% | 130.76 | 3/2 |
| manualTarget|unknown|down|unknown | 7 | 0.458 | 80.6% | 17.2% | 81.7% | -28.9% | -187.53 | 7/0 |
| manualTarget|bid|up|unknown | 6 | 0.467 | 166.7% | 264.1% | 33.3% | -99.0% | 30.01 | 4/2 |

## Most Touched SKUs
| SKU | Actions | Up | Down | State | Last | Units7/30 | InvDays | Profit | Spend7/Orders7/Clicks7 | Last Reason |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |
| DO0446 | 201 | 5 | 2 | 0 | 2026-04-27 | 15/101 | 1 | 24.6% | 0/0/0 | Full ful>1 loop: SKU has margin/ACOS pressure, so reduce the worst inefficient w |
| HL4004 | 91 | 42 | 35 | 0 | 2026-05-06 | 41/202 | 43 | 42.4% | 29.7/6/88 | Codex confirmed bugfix cleanup of wrong created keyword. 建组关键词自查清理：christian gif |
| DN1655 | 83 | 32 | 30 | 0 | 2026-05-07 | 71/125 | 50 | -18.3% | 434.11/69/743 | Codex high-focus 2026-05-07: 7d spend 2.06 with 0 orders and 30d spend 4.75 with |
| XIX1523 | 80 | 36 | 44 | 0 | 2026-05-07 | 27/79 | 54 | 21.0% | 25.09/6/46 | Codex all-remaining 2026-05-07: 近 7 天消耗偏低效，先小幅降价，把预算让给更有把握的对象。 User requested br |
| YUT4460 | 75 | 47 | 13 | 0 | 2026-05-06 | 3/11 | 186 | 14.7% | 4.1/0/17 | Over-budget product ad is consuming budget without conversion. Pause product ad  |
| SHQ3375 | 66 | 25 | 16 | 0 | 2026-05-06 | 37/195 | 43 | 25.6% | 33.66/5/144 | Over-budget campaign is still converting efficiently. Increase budget moderately |
| SE5608 | 63 | 34 | 17 | 0 | 2026-05-06 | 66/262 | 27 | 34.0% | 52.54/26/147 | Over-budget campaign is still converting efficiently. Increase budget moderately |
| HAY0218 | 63 | 25 | 21 | 0 | 2026-05-06 | 21/86 | 54 | 19.0% | 39.54/18/142 | Over-budget campaign is still converting efficiently. Increase budget moderately |
| QQ2806 | 59 | 40 | 17 | 0 | 2026-05-07 | 68/252 | 33 | 27.5% | 26.74/11/97 | Codex identity-fix incremental 2026-05-07: 近 7 天消耗偏低效，先小幅降价，把预算让给更有把握的对象。 |
| QQ1764 | 59 | 21 | 25 | 0 | 2026-05-07 | 26/106 | 250 | 12.9% | 14.14/6/34 | QQ1764 is in the May-June rainbow/Pride window. 30d orders fell 54 -> 46, sales  |
| PR2214 | 56 | 14 | 17 | 0 | 2026-05-06 | 10/55 | 117 | 15.0% | 30.87/5/111 | Over-budget campaign is still converting efficiently. Increase budget moderately |
| DN2684 | 56 | 17 | 22 | 0 | 2026-05-07 | 21/68 | 28 | -15.2% | 119.56/22/299 | Codex high-focus 2026-05-07: shared SB keyword spent 2.04 in 7d with 0 orders; D |
| BOY1281 | 54 | 45 | 8 | 0 | 2026-05-05 | 6/13 | 261 | 20.6% | 3.73/0/5 | Over-budget product ad is consuming budget without conversion. Pause product ad  |
| LE5294 | 53 | 22 | 29 | 0 | 2026-05-06 | 9/21 | 165 | 6.5% | 3.21/1/10 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 3 t |
| BOY3171 | 53 | 9 | 27 | 0 | 2026-05-06 | 4/31 | 84 | 13.6% | 3.77/0/15 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 3 t |
| YAN1353 | 53 | 0 | 9 | 0 | 2026-05-06 | 8/24 | 100 | 12.7% | 41.79/8/224 | Codex confirmed bugfix cleanup of wrong created keyword. 建组关键词自查清理：healthcare wo |
| HL2535 | 51 | 19 | 29 | 0 | 2026-05-04 | 55/185 | 22 | 7.0% | 63.54/21/146 | ?3/7?ACOS???recent_spend_no_orders: recent conversion is above the 25%-30% contr |
| XUE2224 | 50 | 12 | 32 | 0 | 2026-05-06 | 4/19 | 38 | -24.9% | 15.74/0/35 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 3 t |
| XUE0890 | 50 | 12 | 31 | 0 | 2026-04-28 | 1/24 | 0 | -22.2% | 0/0/0 | I am not opening broad spend on the whole SKU. SP keyword "grid wall baskets" in |
| KV0324 | 49 | 24 | 22 | 0 | 2026-04-29 | 37/216 | 21 | 17.5% | 12.98/12/50 | This week I am adding traffic only where the SKU can still carry inventory and t |
| KV3640 | 47 | 27 | 18 | 0 | 2026-04-28 | 19/194 | 2 | 26.0% | 0/0/0 | This is not a SKU-level cut. SP auto target in campaign "auto_walkingstickbear_k |
| QA0828 | 47 | 23 | 20 | 0 | 2026-05-05 | 30/124 | 82 | 30.8% | 20.88/8/46 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 10  |
| JUU1053 | 47 | 13 | 22 | 0 | 2026-05-04 | 34/111 | 19 | 27.1% | 6.29/4/25 | ?3/7?ACOS???acos7_over_30: recent conversion is above the 25%-30% control band o |
| DUN1150 | 46 | 0 | 14 | 0 | 2026-05-05 | 1/4 | 83 | -27.0% | 1.76/1/6 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 7 t |
| GM3061 | 45 | 0 | 14 | 0 | 2026-04-29 | 1/83 | 1 | 29.1% | 0/0/0 | This is not a SKU-level cut. SP auto target in campaign "auto_dispatcher gifts_g |
| GM3054 | 45 | 19 | 24 | 0 | 2026-04-21 | 0/24 | 0 | 35.0% | 0/0/0 | TACoS18%低于目标x0.7稳健+8% |
| SC3420 | 45 | 11 | 10 | 0 | 2026-05-06 | 14/81 | 21 | 38.5% | 19.57/7/60 | Codex confirmed bugfix cleanup of wrong created keyword. 建组关键词自查清理：memorial gift |
| CL4199 | 45 | 16 | 25 | 0 | 2026-04-29 | 26/103 | 1 | -16.7% | 0/0/0 | This is not a SKU-level cut. SP manual target in campaign "asin_taco piñata_cl41 |
| SC3077 | 45 | 3 | 34 | 0 | 2026-05-06 | 26/96 | 61 | -1.2% | 60.05/16/197 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 67. |
| HAY0219 | 45 | 18 | 14 | 0 | 2026-05-06 | 6/37 | 39 | 17.4% | 23.18/6/64 | Over-budget campaign is still converting efficiently. Increase budget moderately |
| LNE1321 | 44 | 15 | 18 | 0 | 2026-05-07 | 21/39 | 56 | 17.4% | 85.18/18/262 | Codex sell-through 2026-05-07: 老品同比下滑明显，但库存和利润还能承接，先小幅提价修复展示和点击。 This is a small |
| WC2648 | 43 | 3 | 7 | 0 | 2026-05-06 | 2/19 | 64 | 30.7% | 21.26/0/35 | Codex confirmed bugfix cleanup of wrong created keyword. 建组关键词自查清理：veterans day  |
| AE2139 | 43 | 11 | 25 | 0 | 2026-05-05 | 13/53 | 30 | -3.2% | 14.53/1/44 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 20  |
| SAN0383 | 42 | 13 | 27 | 0 | 2026-05-04 | 23/76 | 107 | -19.9% | 133.54/27/236 | The campaign "asin_cowhat&band_san0383" is converting at a controlled cost and b |
| SHQ2216 | 42 | 9 | 18 | 0 | 2026-05-07 | 22/112 | 51 | 25.6% | 44.81/10/155 | Codex identity-fix incremental 2026-05-07: 近 7 天消耗偏低效，先小幅降价，把预算让给更有把握的对象。 |
| XIX2353 | 41 | 18 | 22 | 0 | 2026-05-07 | 36/84 | 42 | 28.2% | 94.07/31/341 | 近 7 天消耗偏低效，先小幅降价，把预算让给更有把握的对象。 Codex approved 2026-05-07: sales-core ad share is |
| LE8150 | 41 | 28 | 13 | 0 | 2026-05-07 | 6/24 | 137 | 6.9% | 14.66/5/31 | Codex all-remaining 2026-05-07: 滞销 SKU 有库存压力和时间窗口，只对已有承接的流量小幅提价，不做激进放量。 User req |
| QA3896 | 41 | 0 | 4 | 0 | 2026-05-05 | 2/13 | 100 | 20.9% | 2.66/0/14 | This is not a SKU-level cut. SP keyword "baby lips lip balm" in campaign "kw_blu |
| ZO0892 | 40 | 0 | 3 | 0 | 2026-05-06 | 8/17 | 136 | -25.0% | 19.84/1/77 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 30  |
| CL4170 | 39 | 7 | 25 | 0 | 2026-05-05 | 89/224 | 2 | -9.5% | 0/0/0 | Over-budget campaign is not a good budget receiver. Reduce daily budget from 50  |

## Recent Touched, Current Watch
| SKU | Actions | Last | Units7/30 | InvDays | Profit | Spend7 | Orders7 | Clicks7 | Spend30 | Orders30 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DN1655 | 83 | 2026-05-07 | 71/125 | 50 | -18.3% | 434.11 | 69 | 743 | 1962.28 | 255 |
| DN2683 | 34 | 2026-05-07 | 42/77 | 32 | -17.3% | 189.84 | 38 | 597 | 831.41 | 111 |
| WOO0174 | 9 | 2026-05-06 | 51/73 | 16 | 20.4% | 140.98 | 36 | 533 | 323.16 | 98 |
| SAN0383 | 42 | 2026-05-04 | 23/76 | 107 | -19.9% | 133.54 | 27 | 236 | 724.13 | 140 |
| LED3945 | 28 | 2026-05-06 | 14/22 | 48 | 9.7% | 130.79 | 28 | 397 | 614.13 | 90 |
| GT3801 | 28 | 2026-05-06 | 48/145 | 63 | 32.2% | 122 | 28 | 284 | 564.38 | 140 |
| LO3817 | 36 | 2026-05-07 | 33/61 | 64 | 5.4% | 120.98 | 20 | 356 | 391.28 | 68 |
| DN2684 | 56 | 2026-05-07 | 21/68 | 28 | -15.2% | 119.56 | 22 | 299 | 595.85 | 86 |
| XIX2353 | 41 | 2026-05-07 | 36/84 | 42 | 28.2% | 94.07 | 31 | 341 | 239.53 | 70 |
| GT3812 | 3 | 2026-05-05 | 30/105 | 29 | 32.7% | 93.5 | 11 | 240 | 451.62 | 87 |
| AE1079 | 37 | 2026-05-06 | 28/31 | 47 | 15.6% | 93.18 | 31 | 202 | 200.22 | 64 |
| LNE1321 | 44 | 2026-05-07 | 21/39 | 56 | 17.4% | 85.18 | 18 | 262 | 415.85 | 105 |
| LEM6581 | 6 | 2026-05-06 | 12/17 | 52 | -7.4% | 75.54 | 6 | 179 | 297.51 | 22 |
| QAA3142 | 23 | 2026-05-05 | 33/90 | 17 | 44.0% | 75.47 | 17 | 299 | 396.84 | 72 |
| DUN1392 | 15 | 2026-05-05 | 6/12 | 63 | -5.1% | 75.4 | 7 | 136 | 250.62 | 20 |
| YYW2629 | 8 | 2026-05-07 | 14/24 | 40 | 15.0% | 69.91 | 5 | 369 | 283.89 | 22 |
| HAY1932 | 38 | 2026-05-04 | 25/116 | 10 | 21.2% | 69.07 | 11 | 192 | 332.48 | 83 |
| SH0423 | 4 | 2026-05-04 | 34/90 | 113 | 2.0% | 68.12 | 11 | 184 | 256.88 | 66 |
| GM2389 | 10 | 2026-05-06 | 21/53 | 76 | 33.2% | 64.22 | 22 | 201 | 223.33 | 59 |
| GT3308 | 7 | 2026-05-06 | 24/97 | 26 | 27.7% | 63.57 | 17 | 155 | 291.56 | 94 |
| HL2535 | 51 | 2026-05-04 | 55/185 | 22 | 7.0% | 63.54 | 21 | 146 | 318.13 | 91 |
| ZUN0779 | 16 | 2026-05-07 | 10/17 | 90 | 0.3% | 61.79 | 7 | 574 | 209.3 | 34 |
| AE3311 | 22 | 2026-05-06 | 18/18 | 179 | 12.8% | 61.77 | 16 | 126 | 126.69 | 32 |
| STY6101 | 31 | 2026-05-07 | 14/22 | 75 | -10.3% | 61.05 | 6 | 249 | 271.1 | 34 |
| GM4172 | 10 | 2026-05-06 | 26/52 | 86 | 21.5% | 60.86 | 22 | 196 | 191.95 | 52 |
| SC3077 | 45 | 2026-05-06 | 26/96 | 61 | -1.2% | 60.05 | 16 | 197 | 506.7 | 87 |
| QA1950 | 34 | 2026-05-05 | 19/91 | 20 | 25.4% | 59.54 | 11 | 115 | 607.13 | 156 |
| BEU0541 | 31 | 2026-05-06 | 27/71 | 93 | 24.4% | 56.03 | 15 | 130 | 341.16 | 82 |
| DN1656 | 17 | 2026-05-07 | 61/109 | 55 | -10.5% | 55.64 | 6 | 75 | 180.81 | 18 |
| QAA3143 | 31 | 2026-05-06 | 42/112 | 17 | 41.7% | 55.2 | 15 | 268 | 356.24 | 120 |
| EY2727 | 21 | 2026-05-05 | 11/28 | 80 | 0.9% | 54.96 | 5 | 215 | 235.75 | 34 |
| YUT3183 | 22 | 2026-05-04 | 22/51 | 15 | 13.6% | 53.58 | 13 | 84 | 878.02 | 110 |
| TH2869 | 27 | 2026-05-07 | 17/76 | 62 | 19.9% | 53.41 | 21 | 82 | 383.52 | 146 |
| JOY0900 | 25 | 2026-05-07 | 28/41 | 37 | 33.9% | 52.75 | 11 | 233 | 218.01 | 53 |
| SE5608 | 63 | 2026-05-06 | 66/262 | 27 | 34.0% | 52.54 | 26 | 147 | 484.48 | 226 |
| DN2108 | 19 | 2026-05-07 | 8/15 | 196 | -18.1% | 52.18 | 3 | 65 | 189.67 | 10 |
| TH2599 | 16 | 2026-05-04 | 12/44 | 32 | 32.0% | 51.11 | 7 | 61 | 271.8 | 50 |
| SIJ2012 | 4 | 2026-05-06 | 9/22 | 40 | -29.8% | 49.17 | 8 | 147 | 143.9 | 24 |
| YUN2188 | 14 | 2026-05-06 | 7/23 | 50 | 0.6% | 48.36 | 6 | 144 | 133.85 | 16 |
| CL3650 | 39 | 2026-05-05 | 9/153 | 10 | 2.9% | 46.88 | 6 | 113 | 849.12 | 242 |
| HUQ0699 | 9 | 2026-05-06 | 8/16 | 40 | 16.3% | 45.01 | 5 | 262 | 149.73 | 14 |
| SHQ2216 | 42 | 2026-05-07 | 22/112 | 51 | 25.6% | 44.81 | 10 | 155 | 935.94 | 162 |
| GOO1089 | 5 | 2026-05-05 | 11/13 | 107 | -29.2% | 44.21 | 2 | 188 | 125.98 | 10 |
| HL4017 | 25 | 2026-05-05 | 16/85 | 19 | 34.2% | 43.81 | 15 | 161 | 368.61 | 92 |
| FLO2960 | 2 | 2026-05-04 | 1/3 | 260 | -42.5% | 41.88 | 1 | 96 | 163.78 | 10 |
| YAN1353 | 53 | 2026-05-06 | 8/24 | 100 | 12.7% | 41.79 | 8 | 224 | 273.96 | 72 |
| RHO0122 | 32 | 2026-05-07 | 33/139 | 95 | 11.0% | 40 | 14 | 168 | 252.65 | 134 |
| HAY0218 | 63 | 2026-05-06 | 21/86 | 54 | 19.0% | 39.54 | 18 | 142 | 401.38 | 149 |
| OCE2575 | 32 | 2026-05-07 | 6/14 | 180 | 19.0% | 38.41 | 3 | 114 | 272.32 | 14 |
| YUN2187 | 17 | 2026-05-06 | 7/8 | 379 | 0.8% | 37.96 | 6 | 110 | 153.43 | 33 |
