# 2026-05-22 KUR0501 YoY drop / history-based optimization

## Source

- Forwarded developer request: `KUR0501 你好这个产品相较去年下滑很多 麻烦你根据历史转化比较好的优化一下哈 谢谢`
- Source is the operator-forwarded screenshot/message, not direct WeCom/WeChat access.
- Review date: 2026-05-22 Asia/Shanghai.
- Business date: 2026-05-22.
- Ad data date: 2026-05-21.

## Product Diagnosis

- Product: KUR0501 / B09CD2K6CW, 16-piece 60s hippie flower / peace sign car magnet set, usable for car, refrigerator, mailbox, party and daily decor.
- Current Amazon listing pull: Weewooday, price 8.99, rating 4.4, 349 reviews, refrigerator magnet category.
- Product stage: regular sale / long-tail daily product with school-season and party/decor scene tags, not a pure one-day holiday item.
- Inventory and economics support a controlled traffic repair, not aggressive budget-up: price 8.99, profit rate about 24.4%, FBA fulfillable 122 plus reserved 15, inventory about 96 days.
- Listing session/conversion signal weakened: last week conversion 6.76%, versus 13.33% two weeks ago and 8.43% three weeks ago, so traffic repair must watch conversion support.

## Evidence

- Backend readiness passed on 2026-05-22 for ad backend, sellerinventory, and selection system.
- 2025 same window, 2025-04-22 to 2025-05-21:
  - `auto2_hippie flower car magnet_kur0501`: 12,106 impressions, 121 clicks, 19 orders, sales 189.81, CVR 15.7%, ACOS 13.1%.
- 2026 current window, 2026-04-22 to 2026-05-21:
  - SKU total: 13,161 impressions, 51 clicks, 1 order, sales 8.99, ACOS 83.4%.
  - `kw_hippie flower car magnet_kur0501`: 6,397 impressions, 25 clicks, 1 order, ACOS 49.8%.
  - `auto2_hippie flower car magnet_kur0501`: 6,799 impressions, 26 clicks, 0 orders.
- 2026 previous 30 days, 2026-03-23 to 2026-04-21:
  - `kw_hippie flower car magnet_kur0501`: 12,888 impressions, 59 clicks, 8 orders, ACOS 18.8%.
  - `auto2_hippie flower car magnet_kur0501`: 6,640 impressions, 49 clicks, 8 orders, ACOS 6.64%.
- Keyword detail:
  - `magnetic car decals`: current 30d 10 clicks / 1 order / ACOS 17.6%; previous 30d 9 clicks / 1 order / ACOS 23.8%.
  - `funny car magnets`: previous 30d 22 clicks / 5 orders / ACOS 13.0%, but current 30d 10 clicks / 0 orders. Keep observing instead of immediate larger push.
  - `asinSubstituteRelated`: previous 30d 49 clicks / 8 orders / ACOS 6.64%, but current 30d 26 clicks / 0 orders. This is the historical auto lane that stopped converting.
- Market evidence:
  - ABA latest month 2026-04-30 only found `flower car magnets`: search volume 2,222, estimated orders 820, low demand tier but high competition / supply pressure.
  - Keyword conversion returned no rows for the narrow hippie/flower/car magnet seeds, so cost-layer evidence is missing, not a veto.
  - Product Time Machine returned no winning-ASIN rows for the narrow seeds.
  - Seasonality evidence for `flower car magnets` supports only small-step validation; competitor set has stronger review counts and broader pack options.

## Decision

- Do not raise campaign budgets or create a new broad structure.
- Do not submit listing edits from this request; current evidence points first to traffic routing and conversion observation.
- Keep the proven magnet/car-decal keyword lane alive with a small bid repair.
- Trim the historical auto substitute lane by one cent to control current non-converting click drift while keeping the lane enabled.
- Leave `funny car magnets` unchanged for now because it has strong previous-period proof but current-period evidence has not reached a clear enough cutoff for a hard trim after recent updates.

## Execution

- Dry-run: `data/tasks/devreq_KUR0501_actions_2026-05-22.json`
  - Planned SKU: 1.
  - Planned actions: 2.
  - Review: 0.
  - Skipped: 0.
  - Validation errors: 0.
- Executed on 2026-05-22 15:09 Asia/Shanghai:
  - SP keyword `magnetic car decals`, keywordId `391719833749255`, campaign `kw_hippie flower car magnet_kur0501`: bid 0.16 -> 0.18.
  - SP auto target `asinSubstituteRelated`, targetId `376105176803937`, campaign `auto2_hippie flower car magnet_kur0501`: bid 0.08 -> 0.07.
- Verification:
  - `execution_verify_2026-05-22.json` final counts: success 2, keyword success 1, autoTarget success 1.
  - Independent live readback after execution:
    - `magnetic car decals` bid is 0.18, updatedAt 2026-05-22 15:09:31.
    - `asinSubstituteRelated` bid is 0.07, updatedAt 2026-05-22 15:09:32.
- Inventory notes appended successfully for both actions.

## Follow-Up

- 2026-05-23: check whether `magnetic car decals` gets additional impressions/clicks without CPC spike, and whether auto substitute spend slows.
- 2026-05-25: compare 3-day clicks, CPC, spend, and orders:
  - If `magnetic car decals` keeps conversion or at least controlled CPC, hold the repair.
  - If clicks rise but no order, roll back or shift to listing/price/image support.
  - If `asinSubstituteRelated` still spends with no orders, consider another small trim or search-term cleanup.
- 2026-05-29: 7-day effect review before any larger budget or structure decision.

## Forwardable Reply

我看了下，这款去年有效的核心其实是在车贴/磁贴相关流量，去年同期 auto2 这层转化很好；今年不是完全没流量，而是历史那层流量现在点击后不转化，整体从去年同期 19 单掉到当前 1 单。今天我没有直接加大预算，先按历史有效方向做了小步修正：把当前还在出单的 `magnetic car decals` 小幅加了一点 bid，同时把历史 auto substitute 但最近 26 个点击 0 单的层小幅压低，两个动作后台都已经回读确认落地。后面我会先看 3 天点击和转化，如果有点击没转化就不继续加量，转去看主图/listing/价格承接；7 天再决定要不要继续放还是收。
