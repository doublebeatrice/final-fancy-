# Price Ful+Res Ad Stop Execution 2026-05-19

- localDate: 2026-05-19
- businessDate: 2026-05-18
- dataDate: 2026-05-17
- action schema: D:\ad-ops-workbench\data\snapshots\action_schema_2026-05-19_price_fulres_ads_approved.json
- dry-run sourceRunId: ops_2026-05-19T03-07-26-065Z
- verify file: D:\ad-ops-workbench\data\snapshots\execution_verify_2026-05-19.json
- adjustment log: D:\ad-ops-workbench\data\adjustments\adjustments_2026-05-18.json

## Result

- price SKUs executed: 20/20
- productAd pauses executed: 19/19
- final verification: {"success":39,"sku:success":20,"productAd:success":19}
- dry-run validation: 0 review, 0 skipped, 0 validation errors

## SKU Detail

| SKU | Price | Ful+Res | 7d sellable days | Price status | Price application | Paused ads |
|---|---:|---:|---:|---|---|---:|
| XLN0347 | 9.99 -> 10.99 | 0 | 0 | success | 2261825 2026-05-19 11:08:23 | 0/0 |
| DN2437 | 58.99 -> 61.99 | 0 | 0 | success | 1219324 2026-05-19 11:08:30 | 0/0 |
| HAY1931 | 22.99 -> 24.99 | 4 | 1.6 | success | 1477361 2026-05-19 11:08:38 | 3/3 |
| WEN1029 | 16.99 -> 17.99 | 10 | 3 | success | 1603026 2026-05-19 11:08:44 | 5/5 |
| TH2824 | 19.99 -> 20.99 | 1 | 3.5 | success | 1121562 2026-05-19 11:08:51 | 4/4 |
| SHQ0554 | 26.99 -> 28.99 | 15 | 3.6 | success | 1845290 2026-05-19 11:08:58 | 2/2 |
| SE6621 | 17.99 -> 18.99 | 8 | 4.7 | success | 2062460 2026-05-19 11:09:05 | 3/3 |
| XIA3242 | 18.99 -> 19.99 | 2 | 4.7 | success | 2781761 2026-05-19 11:09:12 | 0/0 |
| PIR4617 | 26.99 -> 28.99 | 7 | 6.1 | success | 2421770 2026-05-19 11:09:19 | 1/1 |
| MK0522 | 11.99 -> 12.99 | 16 | 7 | success | 41632 2026-05-19 11:09:27 | 1/1 |
| FA4843 | 7.99 -> 8.99 | 4 | 7 | success | 887704 2026-05-19 11:09:34 | 0/0 |
| LE8163 | 28.99 -> 30.99 | 3 | 7 | success | 2920579 2026-05-19 11:09:41 | 0/0 |
| DON4521 | 9.99 -> 10.99 | 2 | 7 | success | 2872261 2026-05-19 11:09:49 | 0/0 |
| GM3210 | 13.99 -> 14.99 | 1 | 7 | success | 3200411 2026-05-19 11:09:55 | 0/0 |
| AE2521 | 14.99 -> 15.99 | 1 | 7 | success | 950018 2026-05-19 11:10:03 | 0/0 |
| GT2432 | 36.99 -> 38.99 | 1 | 7 | success | 877727 2026-05-19 11:10:11 | 0/0 |
| XIA1681 | 13.99 -> 14.99 | 51 | 7.3 | success | 1216353 2026-05-19 11:10:19 | 0/0 |
| TH2599 | 13.99 -> 14.99 | 20 | 8.2 | success | 664388 2026-05-19 11:10:28 | 0/0 |
| TH2870 | 19.99 -> 20.99 | 6 | 8.4 | success | 1821016 2026-05-19 11:10:35 | 0/0 |
| YYW2629 | 54.99 -> 57.99 | 17 | 9.2 | success | 2559450 2026-05-19 11:10:42 | 0/0 |

## Ad Pause Detail

- HAY1931: productAd:405828005479037, productAd:500724589847116, productAd:382096077041553
- WEN1029: productAd:349181328381401, productAd:558451616378188, productAd:344532410175569, productAd:494074707365232, productAd:335183724034797
- TH2824: productAd:556703983685036, productAd:427439340966330, productAd:346060286869939, productAd:372331561020198
- SHQ0554: productAd:561120023883588, productAd:460076007506324
- SE6621: productAd:457862408584498, productAd:308140366003233, productAd:536683466282634
- PIR4617: productAd:302461753268666
- MK0522: productAd:470042580924339

## Follow-up

- Next check: confirm sellerinventory price application markers remain present and refresh front-end/current price after the usual 1-3 day application lag.
- Ads: keep paused while Ful+Res is single-digit or sellable days stay below 7; reopen only after inventory replenishes or sales pressure normalizes.