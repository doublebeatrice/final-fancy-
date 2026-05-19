# 2026-05-18 SHQ3950 price recovery request

## Source intent

- Forwarded developer message: "涨太多转化不好啦" / "哈哈哈哈哈哈哈"
- Operator request: `SHQ3950, 降价, 开发诉求`
- SKU: SHQ3950
- ASIN: B0GT3G8TG6
- Product: WinnerWhy baby shower game sign kit, Animal style

## Diagnosis

- Product type: baby shower / bridal party game sign kit, a party-event item with evergreen plus wedding/baby-shower occasion demand.
- Current price before action: 34.99.
- Prior price marker: price application time was 2026-05-14 17:37:22 before this request.
- Local date: 2026-05-18.
- Business date: 2026-05-18.
- Ad data date: 2026-05-17.
- Live ad pull, 2026-05-11 to 2026-05-17: 11,842 impressions, 70 clicks, 19.95 spend, 2 orders, 65.98 sales, about 30.24% ACOS.
- Last 3 ad days in the live pull: 8,511 impressions, 55 clicks, 15.69 spend, 0 orders.
- Inventory context after live pull: 22 fulfillable, 19 inbound, 50 shipping, 7 units sold in 7 days, 1 unit sold in 3 days.
- Profit context before action: profitRate 0.2095, seaProfitRate 0.3621. Price-profit probe returned 500, so post-price profit was estimated conservatively from the current profit rate and price delta.

## Decision

The request is valid. This is not an inventory-protection price hold: supply is not critically tight, and conversion weakened after the price increase window. Restoring 32.99 is a controlled conversion-recovery test.

## Action Taken

- Submitted a price application for SHQ3950 on Amazon.com: 34.99 -> 32.99.
- Price intent: conversion_recovery.
- Ad coupling: hold. Do not automatically raise bids/budgets just because price is lower.
- Execution result: api_success / success.
- Application marker: `is_price_apply=1`.
- Price application time: 2026-05-18 17:16:01.
- Current inventory price field still showed 34.990 after submission, so this is application submitted / pending price effect, not Amazon-front-end landed.

## Follow-Up

- 2026-05-19: confirm whether the 32.99 application has landed in inventory/front-end price fields.
- 1d after landing: check clicks, orders, conversion, ACOS, and whether spend remains capped.
- 3d after landing: if clicks continue with no orders, do not expand ads; review listing/offer fit and rollback or hold.
- 7d after landing: decide whether to keep 32.99, step back up, or narrow ad traffic further.

## Operator Reply Draft

我看了下，SHQ3950 这款是 baby shower 游戏套装，最近确实更像是价格涨上去以后承接变弱，不是单纯广告没推起来。后台这几天有点击，但是近 3 天 55 个点击 0 单，库存也不是少到必须用高价控量的状态。

我这边已经先做降价申请了，按 34.99 恢复到 32.99 处理。这个现在是库存侧申请成功，等价格生效后我明天先回看一次；如果降下来后点击能转单，就先稳住，不马上放大广告。如果还是有点击没单，就回到主图/标题/价格承接继续查。
