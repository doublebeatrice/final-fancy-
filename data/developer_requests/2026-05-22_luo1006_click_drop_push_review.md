# 2026-05-22 LUO1006 click drop / add-spend review

## Source

- Forwarded developer request: `LUO1006 这两天点击率又没有啦，可以加投看看吗`
- Source is the operator-forwarded screenshot/message, not direct WeCom/WeChat access.
- Review date: 2026-05-22 Asia/Shanghai.

## Product diagnosis

- Product: LUO1006 / B0FHHRWSF2, bottle chug / baby shower game product, rustic beige variant.
- Window: current inventory tag is `夏季产品(3-10月)`; baby shower / party game demand is still active enough for controlled testing.
- Market evidence supports small-step validation, not broad budget expansion:
  - ABA latest month `2026-04-30`: `bottle chug baby shower game` has medium demand, sample search volume 5,948 and estimated orders 1,785, with medium competition.
  - Keyword conversion latest usable week `2026-05-03`: `baby shower bottle chug` is a usable niche term with low cost risk; median CPC about 0.67 and median ACOS about 25.3%.
  - Product Time Machine: `baby shower bottle chug` and `bottle chug game` still have rising keyword history signals, while `baby bottle chug game` is declining. Evidence is mixed, so it supports keeping a controlled core lane rather than blind budget-up.
  - Keyword seasonality returned usable partial rows, but ASIN-competition endpoints failed for two terms, so it is only auxiliary evidence.

## Ad and inventory evidence

- Backend readiness passed on 2026-05-22 for adv, sellerinventory, and selection.
- DataDate for ad reads: 2026-05-21.
- SKU `/product/adSkuSummary`:
  - 7d: 20,026 impressions, 113 clicks, spend 49.73, 5 orders, sales 114.95, ACOS 43.26%.
  - Previous 7d: 17,907 impressions, 78 clicks, spend 40.85, 8 orders, sales 183.92, ACOS 22.21%.
  - 3d: 1,799 impressions, 16 clicks, spend 7.02, 1 order, sales 22.99, ACOS 30.54%.
  - 30d: 46,378 impressions, 234 clicks, spend 102.56, 17 orders, sales 389.83, ACOS 26.31%.
- `/product/chart` daily trend:
  - 2026-05-19: 870 impressions, 8 clicks, spend 3.62, 1 order.
  - 2026-05-20: 702 impressions, 8 clicks, spend 3.40, 0 orders.
  - 2026-05-21: 227 impressions, 0 clicks, spend 0, 0 orders.
- Campaign/ad-group readback:
  - Main SP keyword `kw_bottle chug_luo1006`: 7d 3,312 impressions, 31 clicks, spend 17.56, 2 orders, ACOS 38.19%; keep as the protected core lane.
  - SP ASIN lane `asin_bottle chug_luo1006`: 7d 3,592 impressions, 50 clicks, spend 19.77, 0 orders; do not expand this layer.
  - Exact keyword lane: 7d 309 impressions, 3 clicks, spend 1.01, 0 orders; too thin for budget-up.
  - SB/SBV lanes still have some low-cost conversion, but they are small and should not be treated as proof for broad expansion.
- Inventory/economics guard:
  - Inventory can support continued testing: current summary shows 65 / 57 / 63 day stock indicators and sale status `正常销售`.
  - 2026-05-21 operating review has LUO1006 profit rate negative, and 2026-05-20 risk check flagged low profit, high ad share, and high ACOS versus profit. This blocks blind add-spend.

## Decision

- Not executed: no direct budget increase.
- Reason: the issue is not a hard budget cap. The effective keyword lane still exists, while the largest recent click layer is an ASIN lane with 50 clicks and 0 orders. Raising whole-SKU budget would likely buy more unconverted ASIN traffic.
- Current operating move: hold budget, protect `bottle chug` core keyword lane, do not expand ASIN/product-target layer, and recheck whether 2026-05-22 restores clicks after the 2026-05-21 drop.
- Executed on 2026-05-22 12:24-12:25 Asia/Shanghai: SP keyword `bottle chug` / keywordId `324424760692027` in campaign `kw_bottle chug_luo1006` bid `0.45 -> 0.48`.
- Execution route: `action_schema_2026-05-22_luo1006_core_bid_repair.json` dry-run passed with 1 action, 0 review, 0 validation errors; execute returned API success and internal verification success=1.
- Landed readback: live ad-group row file `ad_group_rows_310157314522132_435001710549497_p1_2026-05-22.json` shows keyword `bottle chug` bid `0.48`, updatedAt `2026-05-22 12:25:01`.
- Still not executed: no campaign budget increase; no ASIN/product-target expansion.

## Inventory handling

- Current stock is not urgent-out-of-stock. Recent inventory reads show roughly 63-69 FBA fulfillable units, plus recent/inbound stock around 79 units, and local available/good stock around 40 units.
- At the recent sales pace, FBA alone is about 57-67 days of cover; including inbound, cover rises to about 66-141 days depending whether 3d/7d/30d pace is used.
- Do not ask development to make or purchase more stock now. Existing FBA + inbound is enough for the current window, and the SKU has negative/weak profit support.
- Do not do immediate hard clearance either. This is a 3-10 month summer / baby shower party-game product, so May is still inside the sell-through window.
- Goods route: sell through existing FBA with controlled ad cost; wait for inbound to receive; keep local 40 units as reserve and do not duplicate FBA arrangement unless FBA cover falls below about 30 days while 7d sales and ACOS recover.
- This is not a "wait for natural traffic" route. If natural flow is not carrying sales, the SKU needs capped paid sell-through on the proven core term plus price/coupon readiness, while waste ASIN traffic is held down.
- Route switch:
  - If 3-7 day sales recover and core keyword ACOS returns near 30-35%, continue steady sell-through and consider arranging part of local stock only after inbound receipt is clear.
  - If another 3 days has weak sales and natural flow stays absent, do not wait passively: keep only exact/core paid traffic, test a small price/coupon support if margin floor allows, and stop the ASIN waste layer.
  - If another 7 days has weak sales and ACOS stays above profit support, stop expanding ads and move to clearance/discount review; do not order more and do not send more local stock into FBA.
  - If after inbound receipt total cover moves above 90 days and daily sales stays around 1 unit or lower, treat it as controlled sell-through/clearance candidate.

## Follow-up checkpoint

- 2026-05-23: recheck `/product/chart`, `fetch_ad_sku_summary 4 7 LUO1006`, and live rows for:
  - whether 5/22 regained clicks,
  - whether `bottle chug` core keyword still spends and converts,
  - whether ASIN lane keeps consuming without orders,
  - whether ACOS is still above profit support.

## Forwardable reply

我看了下，LUO1006 这批货不能等自然流自己恢复，但也不能直接加大预算去买泛流量。现在 FBA 还有一个多月可卖，另有在途和本地余量，先不要再补新货/大货；处理上按控费卖货走：保留 bottle chug 这种能出单的主词小预算带单，把 ASIN 定位这种点击多没出单的层压住。如果接下来 3 天自然流和主词都不出单，就转到小幅价格/优惠承接；7 天还动不起来就按清货/折扣方案处理，不再继续往 FBA 加货。
## Forwardable reply (updated after bid landed)

刚才不是加预算，我已经补了一个主词小幅 bid：`bottle chug` 从 0.45 加到 0.48，后台已回读到 0.48。LUO1006 这批货不能等自然流自己恢复，但也不能直接放大预算去买泛流量；现在先用已出单主词控费带一点流量，ASIN 定位这种点击多没出单的层先不放大。接下来 3 天看点击和出单，如果有点击没转化，就转价格/优惠或承接问题处理；如果 7 天还动不起来，再按清货/折扣方案看。
