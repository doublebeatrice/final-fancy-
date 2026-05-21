# Structure Gap Broad/Expanded Correction - 2026-05-20

?????????/??????? BROAD ? ASIN_EXPANDED_FROM ?????/?????????????????????

- ?? broad/expanded campaigns: 11
- ?????: $67/day
- ???????: 52 rows, allOk=true
- Bid/budget mix control: 28 actions, apiSuccess=28

| SKU | New campaigns | New budget/day | Target rows | Layers | Bid/Budget control |
| --- | ---: | ---: | ---: | --- | --- |
| YUT3184 | 2 | $14 | 12 | BROAD: $8/bid 0.34<br>ASIN_EXPANDED_FROM: $6/bid 0.32 | keyword 0.62->0.47 x6<br>keyword 0.48->0.38 x5 |
| MED1970 | 2 | $18 | 12 | BROAD: $10/bid 0.5<br>ASIN_EXPANDED_FROM: $8/bid 0.45 | keyword 0.85->0.68 x7<br>keyword 0.65->0.52 x6 |
| SII0421 | 2 | $11 | 11 | BROAD: $6/bid 0.28<br>ASIN_EXPANDED_FROM: $5/bid 0.25 | - |
| NAY0963 | 1 | $5 | 4 | ASIN_EXPANDED_FROM: $5/bid 0.24 | budget 3->6<br>keyword 0.15->0.19 x2<br>keyword 0.17->0.2 |
| EU0867 | 2 | $10 | 7 | BROAD: $6/bid 0.26<br>ASIN_EXPANDED_FROM: $4/bid 0.23 | - |
| GT3811 | 2 | $9 | 6 | BROAD: $5/bid 0.24<br>ASIN_EXPANDED_FROM: $4/bid 0.22 | - |

## Readback
- create target readback: data/snapshots/structure_gap_broad_expand_post_create_readback_2026-05-20.json
- bid/budget readback: data/snapshots/structure_gap_bid_mix_control_readback_2026-05-20.json

## Recheck
- 2026-05-20 15:30 Asia/Shanghai: impressions/clicks/spend/orders first check.
- 2026-05-21 15:30 Asia/Shanghai: next-day click quality and spend/order check.