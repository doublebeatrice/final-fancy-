# AE1101 Softball Coach Title Clearance

- date: 2026-05-21
- sku: AE1101
- asin: B0BBTQQF2D
- source: forwarded developer message

## Original Message

开发诉求 AE1101

Softball Coach Gifts Coach Appreciation Gift Set Include 20 oz Baseball Tumbler, Thank You Keychain, Whistle with Lanyard End of Season Gift for Men Lover Player Fan Team Colleague Graduation Gift

宝子，这个产品的标题我重新修改了一下，你看下还有需要加的吗？价格降了一美金哈，尽快把库存清掉

## Diagnosis

- Product: baseball/softball coach appreciation gift set, including 20 oz tumbler, thank-you keychain, and whistle with lanyard.
- Current stage: old product clearance/recovery. Latest operating data uses businessDate 2026-05-20 and dataDate 2026-05-19.
- Inventory and sales: FBA sellable/reserved about 40 units, about 134 sellable days; 3/7/30d units 1/6/9; YoY units down 68.97%; profit rate about 13.89%.
- Ads: 7d spend about 7.21, 17 clicks, 2 orders; 30d spend about 42.07, 97 clicks, 4 orders. Existing verdict is old_product_recovery_check, with follow-up to inspect traffic decline vs conversion decline.
- Market evidence: `softball coach gifts` is usable niche but high cost; `baseball coach gifts` has ABA demand but weak keyword-conversion economics. `coach appreciation`, `thank you coach gifts`, `end of season coach gifts`, and `whistles for adults with lanyard` have limited or missing conversion evidence and should be semantic support, not spend-expansion proof.
- Front listing fetch on 2026-05-21 still shows the main title centered on Sieral, baseball/softball coach gifts, tumbler, thank-you keychain, whistle, and end-of-season use. Price fetch returned an invalid `$00`, so price landing was not confirmed from Amazon front-end.

## Action Status

- No new listing submission was executed in this pass.
- Clearance ad action executed after follow-up challenge: raised the proven SP manual ASIN target `asinExpandedFrom=B0BJZ28TRW` in campaign `asin_coachgifts_ae1101` from `0.44` to `0.48`.
- Live verification: `targetId=464203745974334` refreshed from the ad backend with `bid=0.48`, `updatedAt=2026-05-21 15:14:48`.
- Weak ASIN lane remains controlled: `asinExpandedFrom=B09VPT893B` had 30d/15d zero orders and was already lowered to `0.33` on 2026-05-21.
- Second clearance layer executed after operator challenge that only one target was pushed: created capped SP exact keyword campaign `ai_kw exact_softball coach gifts_ae1101`, `campaignId=249683882620529`, `adGroupId=250797617113495`, daily budget `3`, default bid `0.45`.
- Live keyword verification on 2026-05-21 day window: exact keywords `softball coach gifts` (`keywordId=149215215716000`) and `coach gifts for men` (`keywordId=5254627385237`) are visible with `bid=0.45`, `campaignState=1`, `groupState=1`. The requested `baseball coach gift` keyword appeared in the create API payload/receipt but was not visible in the keyword detail pull, so it is not counted as landed.
- Old paused `kw_coachgifts_ae1101` was not reactivated because `softball coach gift` had 30d `17 clicks / $11.51 / 0 orders` at `0.77`. Old paused `auto_coachgifts_ae1101` was not reactivated because auto rows had 30d `22 clicks / $5.91 / 0 orders`.
- New-traffic search executed after operator asked to find new traffic:
  - Front-search research file: `data/snapshots/selection_keyword_research_AE1101_new_traffic_2026-05-21.json`; searched 10 seed terms, 180 front results, found 9 direct competitor ASINs, 45 same-scene ASINs, and 44 bridge ASINs.
  - Market validation file: `data/snapshots/selection_keyword_conversion_rate_AE1101_new_traffic_2026-05-21.json`; `coach whistle` had search volume `1536`, purchase volume `330`, click-purchase ratio `0.4172`, median CPC `0.93`, median ACOS `0.1487`, while `coach gifts for women` was weak with median CPA about `83.33` and median ACOS about `5.5593`.
  - ABA file: `data/snapshots/selection_aba_search_terms_AE1101_new_traffic_2026-05-21.json`; `coach whistle`, `whistle for coaches`, and `coach whistle with lanyard` were medium-demand niche/low-bid-test directions; broad women/generic coach gift terms stayed hold/research-only.
- New traffic create API returned success for two capped test structures:
  - Same-scenario ASIN product targeting: `ai_asin_coach tumbler gifts_ae1101`, `campaignId=160451091627294`, `adGroupId=174521556008043`, daily budget `2`, bid `0.32`, target ASINs `B0FLHZ8L67`, `B0CXJ93JFN`, `B0D9XQZXTH`, `B0BRMFC69V`, `B0BJZK5J63`.
  - Whistle bridge exact keyword test: `ai_kw exact_coach whistle_ae1101`, `campaignId=123558478571831`, `adGroupId=103515168937571`, daily budget `2`, bid `0.25`, keywords `coach whistle`, `whistle for coaches`, `coach whistle with lanyard`.
  - Important status boundary: create API returned `code=200`, but immediate and 25-second retry pulls did not show lower-layer target/keyword rows for these two new structures, and SKU ad product pull did not yet show these campaigns. Treat them as `api_success_pending_visibility`, not fully landed, until the next backend visibility check confirms product ad and lower-layer rows.
- Title recommendation: keep `Softball Coach Gifts`, add/keep `Baseball Coach Gifts`, keep `Coach Appreciation Gift Set`, `20 oz Baseball Tumbler`, `Thank You Keychain`, `Whistle with Lanyard`, and `End of Season`. Do not add broad terms like `Lover`, `Fan`, `Colleague`, or `Graduation Gift` unless the image/copy clearly supports those buyers, because they dilute the coach-gift intent.
- Suggested title direction: `Softball Baseball Coach Gifts for Men, Coach Appreciation Gift Set with 20 oz Baseball Tumbler, Thank You Keychain and Whistle with Lanyard, End of Season Coach Gifts from Team Players`.

## Follow-Up

- Recheck 2026-05-22 09:45 CST, businessDate 2026-05-21:
  - `asin_coachgifts_ae1101` is still live. Proven ASIN `asinExpandedFrom=B0BJZ28TRW` remains visible at `bid=0.48`; 1d result: `47 impressions / 1 click / $0.48 spend / 0 orders`. Campaign-level SKU ad product row: `53 impressions / 1 click / $0.48 spend / 0 orders`; 3d `412 impressions / 8 clicks / $3.39 / 0 orders`; 7d `1175 impressions / 22 clicks / $9.31 / 2 orders / $59.96 sales`.
  - `ai_kw exact_softball coach gifts_ae1101` is live in SKU ad product data with `68 impressions / 0 clicks / $0 spend / 0 orders`. Current keyword detail shows `softball coach gifts` and `baseball coach gift`, both `bid=0.45`; `coach gifts for men` was not visible in this recheck.
  - `ai_asin_coach tumbler gifts_ae1101` is now visible and live: 5 ASIN targets are present at `bid=0.32` (`B0CXJ93JFN`, `B0BJZK5J63`, `B0FLHZ8L67`, `B0BRMFC69V`, `B0D9XQZXTH`), but no impressions/clicks/spend yet.
  - `ai_kw exact_coach whistle_ae1101` is now visible in SKU ad product data but only one lower-layer keyword row is visible: `coach whistle`, `bid=0.25`; no impressions/clicks/spend yet. `whistle for coaches` and `coach whistle with lanyard` remain not visible in keyword detail.
  - Inventory/listing data from SKU ad product row: price `13.99`, sale status `正常销售`, sellable-day string `120 / 47 / 134`, ad serving `ELIGIBLE`.
  - Decision: no immediate rollback or pause. The new layers have mostly just become visible and have not spent; the only spent line is the proven ASIN lane with one click, which is not enough to judge failure. Next hard decision remains the 3d check: if spend accumulates without orders, roll ASIN back to `0.44` and pause/trim the no-conversion exact or ASIN tests.
- Operator follow-up 2026-05-22 10:08 CST: because same-day rows were still not serving, executed an exposure-repair bid-up without raising campaign budgets. Dry-run passed with 12 executable actions, then execute returned 12/12 success and live readback confirmed landed bids:
  - Exact gift keywords in `ai_kw exact_softball coach gifts_ae1101`: `baseball coach gift`, `softball coach gifts`, and `coach gifts for men` all `0.45 -> 0.55`, `updatedAt=2026-05-22 10:08:40`.
  - Whistle exact keywords in `ai_kw exact_coach whistle_ae1101`: `whistle for coaches`, `coach whistle with lanyard`, and `coach whistle` all `0.25 -> 0.35`, `updatedAt=2026-05-22 10:08:41`.
  - Same-scenario ASIN test `ai_asin_coach tumbler gifts_ae1101`: all 5 ASIN targets `0.32 -> 0.40`, `updatedAt=2026-05-22 10:08:42`.
  - Proven ASIN target `asinExpandedFrom=B0BJZ28TRW` in `asin_coachgifts_ae1101`: `0.48 -> 0.55`, `updatedAt=2026-05-22 10:08:43`.
  - Budgets were left capped: exact gift `$3`, same-scenario ASIN `$2`, whistle exact `$2`, existing ASIN group `$3`.
  - Next checkpoint: check same-day/next-day impressions first. If bids now create impressions but clicks/spend do not produce orders by the 3d window, roll back the new bid layer rather than adding more budget.
- Recheck/action 2026-05-23 09:43 CST, businessDate 2026-05-22:
  - 5/22 bid-up did repair some exposure: exact gift row now has `245 impressions / 1 click / $0.55 / 0 orders`; proven ASIN group has `51 impressions / 1 click / $0.55 / 0 orders`.
  - New lanes still underexposed before today's action: same-scenario ASIN only `1 impression / 0 clicks / $0`; whistle exact only `3 impressions / 0 clicks / $0`.
  - Executed second exposure repair only on the still-underexposed lanes, budgets unchanged. Dry-run passed `8` actions; execute returned `8/8 success`.
  - Whistle exact keywords `whistle for coaches`, `coach whistle with lanyard`, and `coach whistle`: `0.35 -> 0.45`, live readback `updatedAt=2026-05-23 09:43:10`.
  - Same-scenario ASIN targets `B0D9XQZXTH`, `B0BJZK5J63`, `B0BRMFC69V`, `B0FLHZ8L67`, and `B0CXJ93JFN`: `0.40 -> 0.50`, live readback `updatedAt=2026-05-23 09:43:11`.
  - Exact gift and proven ASIN were not raised again because they already started showing; next action for those lanes should be based on click/order quality, not more blind bid-up.
  - SKU ad product inventory/listing fields now show price `6.99`, sale status `正常销售`, sellable-day string `999 / 140 / 134`, and ad serving `ELIGIBLE`. Treat this as a clearance-price warning: clicks need tight monitoring because order economics are thinner at this price.
- Check front listing title and price landing first.
- Codex heartbeat reminder created: `ae1101`, daily at 09:30 for 7 checks starting after 2026-05-21, covering the 1d/3d/7d bid-push review.
- Review 3d/7d after the price change is live: sessions/clicks, conversion, orders, and whether ad clicks shift from low-efficiency terms to coach-intent traffic.
- For the bid push, check 1d/3d/7d: exposure and clicks should rise on `B0BJZ28TRW`; if spend rises without orders by the 3d check, roll back to `0.44` or lower.
- For the new exact keyword campaign, check 1d/3d/7d: whether `softball coach gifts` and `coach gifts for men` get impressions/clicks; if 3d spend rises with zero orders or CPC runs above the clearance cap, pause the exact campaign instead of raising bids.
- Recheck whether `baseball coach gift` becomes visible in the keyword table; do not count it as landed until a keyword row appears.
- First priority next check: confirm whether `160451091627294/174521556008043` and `123558478571831/103515168937571` become visible in SKU ad product data and lower-layer target/keyword detail. If still invisible, treat the API create as not landed and do not duplicate-create without manual backend inspection.
- If visible, review after 1d/3d/7d: same-scenario ASIN layer should get product-page impressions without high CPC; whistle bridge layer should stay low-bid and pause quickly if clicks do not convert.
- If price is live but orders do not improve, inspect main image/offer and avoid further broad ad expansion.

## Forwardable Reply

我看了下，这款核心还是棒球/垒球教练感谢礼盒，标题里把 Softball Coach Gifts、Baseball Coach Gifts、Coach Appreciation Gift Set、20 oz tumbler、thank you keychain、whistle、end of season 留住就够了；`graduation/colleague/fan/lover` 这些泛人群不建议继续堆，容易把场景打散。降价配合清库存可以做，我这边已经把有出单的相似 ASIN 流量小幅加了一点，3 天先看曝光和订单有没有跟上，不行就撤回。
