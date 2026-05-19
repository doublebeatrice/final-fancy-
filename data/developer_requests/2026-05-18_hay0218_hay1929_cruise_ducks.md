# 2026-05-18 HAY0218 / HAY1929 Cruise Ducks

## Source

- Forwarded developer request:
  - `HAY0218 哈喽 这条线麻烦加急调整促单！库存充足哈`
  - `HAY1929 这个可以开广告了`
- Operator source only: forwarded screenshot/text from the operator. No direct WeCom/WeChat access.

## Product Diagnosis

- Product line: cruise / sailing rubber ducks with sunglasses, party favor toy line.
- HAY0218: yellow 24 pcs cruise duck set, normal sale and eligible. Current window fits summer/cruise evergreen demand. Snapshot evidence: 124 FBA units, 46 inventory days, 7d units 19, 30d units 82, profit rate 15.15%, last-week sessions 231.
- HAY1929: blue/white variant under the same parent line, normal sale and eligible. Inventory pressure is high: 93 FBA units, 399 inventory days, 7d/30d units both 7, profit rate 23.34%. Existing shared SP/SB traffic was live but too thin for this variant, so opening a dedicated low-budget test is appropriate.
- Sales history page opened but did not expose recognizable date/sales fields in the parser, so no historical seasonal curve was used as evidence.

## Executed Actions

Execution time: 2026-05-18 15:10 Asia/Shanghai.

- HAY0218 keyword bid lift, campaign `kw_hay0218_20260420_175558`:
  - `cruise ducks` keyword `213802516579147`: bid `0.27 -> 0.29`
  - Evidence before action: 30d clicks 121, orders 15, sales 433.85, ACOS 8.40%.
  - Landing verification: backend row updated at `2026-05-18 15:10:31`, bid now `0.29`.
- HAY0218 keyword bid lift, campaign `kw_hay0218_20260420_175558`:
  - `sailor ducks` keyword `169798883726014`: bid `0.33 -> 0.35`
  - Evidence before action: 30d clicks 44, orders 9, sales 227.91, ACOS 6.03%.
  - Landing verification: backend row updated at `2026-05-18 15:10:31`, bid now `0.35`.
- HAY1929 dedicated SP keyword campaign created:
  - Campaign `kw_cruise_ducks_hay1929_devreq`
  - Campaign ID `276348666502411`, ad group ID `184850758333493`
  - Daily budget `3.00`, default bid `0.24`
  - Keywords enabled: `cruise ducks`, `rubber ducks cruise`, `sailor ducks`, `cruise ship ducks`, `cruise duck`
  - Landing verification: campaign status `Delivering`; all 5 keywords state `1`, bid `0.24`, created at `2026-05-18 15:10:40`.

## Follow-Up Checkpoints

- Same day landing check: complete. Backend rows and new campaign are visible.
- 2026-05-19 morning: inspect impressions/clicks and spend. If HAY1929 has no impressions, inspect campaign/ad product eligibility and bid competitiveness.
- 2026-05-21: inspect HAY0218 3d spend/orders and HAY1929 click quality. Roll back HAY0218 lifts if spend rises without orders or 7d ACOS moves above 25% without total SKU order lift.
- 2026-05-25: inspect 7d result. Keep HAY1929 only if it gets qualified clicks/orders; pause or narrow if it reaches 20 clicks or 3d spend with no HAY1929 orders.

## Direct Reply Draft

我看了下，这条线本质还是夏季/游轮场景的橡胶鸭，HAY0218 现在是有库存也有订单承接的，不适合一上来乱扩泛流量。我刚刚先把已经出过单、ACOS 比较稳的两个核心词小幅提了下，集中在 `cruise ducks` 和 `sailor ducks`，不动大预算和泛词。

HAY1929 这款我也已经单独开了一个低预算 SP 关键词测试，预算先卡在 3 美金/天，核心只放游轮鸭相关词，先让它有独立曝光和点击数据，不让共享广告里其他变体把量吃掉。

今天先看落地和曝光，明早我会回看 HAY1929 有没有开始进量；三天后再看点击质量、花费和有没有出单，不行就及时收窄，能承接再继续加。
