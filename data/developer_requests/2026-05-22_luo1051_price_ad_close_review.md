# 2026-05-22 LUO1051 price and ad-close review

## Source

- Forwarded developer request: `UQ1051 this SKU had several middle days with high clicks/click rate, but orders were not ideal; lower price to 21.99 and close ads, what do you think?`
- Source is the operator-forwarded screenshot/message, not direct WeCom/WeChat access.
- Backend lookup note: `UQ1051` returned no current ad rows. The matching live bottle-chug SKU in project evidence is `LUO1051` / `B0FL2FHX6Y`.
- Review date: 2026-05-22 Asia/Shanghai.
- Ad data date range checked: 2026-04-22 to 2026-05-21, plus 2026-05-08 to 2026-05-21.

## Product diagnosis

- Product: LUO1051 / B0FL2FHX6Y, bottle chug / baby shower game product, tagged as summer product for the 3-10 month window.
- Market window is still active enough for controlled sell-through, not a full stop: `bottle chug baby shower game` has usable niche demand and the broader `baby shower games` market is large but more competitive and lower-price.
- Current SKU issue is not "no traffic"; it is weak conversion after clicks, with recent 3-day order loss and negative profit support.
- Inventory pressure exists: latest operating review has `fulRes=73`, `invDays=365`, `profitRate=-20.34%`, so the route should be controlled sell-through / repair, not aggressive scale.

## Evidence

- `UQ1051` backend probes:
  - `/product/adSkuSummary` 14d returned 0 rows.
  - `/product/adProductData` 30d returned 0 rows.
- `LUO1051` backend ad read:
  - Shared SB `sbkw_bottle chug_luo1051 luo1012 luo1006`: 15d 18,067 impressions / 43 clicks / 1 order / spend 18.51 / ACOS 80.51%; 3d no delivery.
  - SBV `sbvkw_bottle chug_luo1051`: 30d 36 clicks / 3 orders / spend 17.89 / ACOS 25.94%; 7d 33 clicks / 3 orders; recent 3d 9 clicks / 0 orders.
  - SP auto `auto_bottle chug_luo1051`: 30d 51 clicks / 2 orders / spend 16.28 / ACOS 35.41%; 7d 42 clicks / 0 orders.
  - SP keyword `kw_bottle chug_luo1051`: 30d 20 clicks / 2 orders / spend 9.13 / ACOS 19.86%; recent 7d only 3 clicks / 0 orders.
  - SP ASIN `asin_bottle chug_luo1051`: 30d 8 clicks / 0 orders; no reason to expand.
- 2026-05-21 operating review:
  - units3d=0, units7d=2, units30d=6.
  - ad7 around 92-98 clicks and 2-3 orders depending source window, but profit support is weak.
- Market evidence:
  - Keyword conversion latest usable week 2026-05-03: `bottle chug baby shower game` search volume 845, click volume 365, purchase volume 32, click-purchase ratio 8.77%, median CPC 0.36, median ACOS 15.65%.
  - ABA latest month 2026-04-30: `bottle chug baby shower game` search volume 5,948, estimated orders 1,785, average price 20.63, average rating 4.6, average review count 420, medium competition.
  - Product Time Machine 7d keyword history: `bottle chug baby shower game` latest search volume 994 and declining; `baby bottle chug` rising; `baby shower games` flat but broad/competitive.

## Decision

- Do not close all ads immediately.
- Price: lowering from 22.99 to 21.99 is reasonable as a short controlled conversion test because market average on the core term is close to 20.63, but it worsens already weak profit, so it should be paired with ad waste control and a checkpoint.
- Ads: close/hold only the no-order or weak layers, especially ASIN/product targeting and broad/shared SB layers if they resume spending without orders. Preserve small-budget core bottle-chug keyword/SBV/auto lanes that have proven orders.
- Executed on 2026-05-22:
  - Price application submitted in sellerinventory for `LUO1051` from 22.99 to 21.99. Backend profit check returned `profit=-0.2495`, `profitSea=0.2344`; `/pm/formal/applyPrice` returned `code=200`, `msg=申请成功`. This is a sellerinventory application, not Amazon front-end price propagation. Proof artifact: `data/snapshots/price_application_luo1051_submit_unicode_2026-05-22.json`.
  - Paused three zero-order waste product-ad layers: `asin_bottle chug_luo1051` productAd `502288879562605`, `b2b auto_LUO1051` productAd `294156534476053`, and `auto2_bottle chug_luo1051` productAd `337554091605153`. Durable proof is in `data/adjustments/adjustments_2026-05-21.json`; the temporary `data/snapshots/execution_verify_2026-05-22.json` was later overwritten by another SKU run and should not be used as the long-term LUO1051 proof source.
  - Preserved the proven core bottle-chug lanes: main keyword, SBV, and main auto were not fully closed.

## Follow-up checkpoint

- Thread reminder created: automation `luo1051` / `LUO1051 价格广告复查`, scheduled for 2026-05-25 09:30.
- Recheck on 2026-05-25 or after 3 full sales days:
  - whether price 21.99, if applied, lifts conversion,
  - whether 3d orders recover on core bottle-chug lanes,
  - whether SP auto or ASIN layers keep spending without orders,
  - whether ACOS returns near 30-35% or stays above profit support.
- Route switch:
  - If 21.99 plus core traffic restores orders, continue controlled sell-through and keep broad/ASIN layers capped.
  - If clicks continue without orders for another 3 days, keep only exact/core low-bid traffic and move to coupon/clearance review.
  - If 7 more days stay weak, treat as stop-loss sell-through; do not keep buying traffic broadly.

## Forwardable reply

我这边已经处理了：价格 22.99 到 21.99 的申请已提交，广告没有全关，先把无单的 ASIN 定位、B2B auto 和第二组 auto 浪费层停掉，核心 `bottle chug` 出过单的词/SBV/主 auto 先保留小预算观察。3 天后我回看降价后转化有没有恢复；如果还是有点击没单，再转优惠/清货方案，不继续买泛流量。
