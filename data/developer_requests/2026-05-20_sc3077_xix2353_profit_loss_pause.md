# 2026-05-20 SC3077 / XIX2353 developer request

## Source intent

- Forwarded developer request: XIX2353, close traffic with ACOS higher than 35%.
- Forwarded developer request: SC3077 has low profit; reduce or close weak-conversion traffic, including rows that have orders but ACOS is higher than profit support.

## Product diagnosis

- SC3077 is a small velvet jewelry tray / drawer organizer. Current demand is evergreen storage/gift traffic. The SKU still has proven conversion through SBV and close-match jewelry tray traffic, but the B2B auto loose-match lane is too expensive for the product's weak profit support.
- XIX2353 is a reusable letter/number stencil set. It belongs to craft / sign / summer party traffic. SBV and SB keyword paths are still converting at controlled ACOS, but several SP broad rows are above the developer's 35% stop-loss line or have no sales after meaningful spend.

## Action taken

Executed and post-fetched verification confirmed all six rows are paused (`state=2`):

- SC3077 `autob2b_jewelholder_sc3077` auto target `queryBroadRelMatches` (`525822316315097`): 7d spend 54.32, 142 clicks, 5 orders, ACOS 46.8%.
- SC3077 `kw broad_small jewelry tray_sc3077` keyword `drawer jewelry organizer` (`80801550720223`): 30d spend 8.87, 27 clicks, 1 order, ACOS 42.3%.
- XIX2353 `kw broad_letter stencils_xix2353` keyword `stencil letters 2 inch` (`446732311626255`): 30d spend 12.07, 27 clicks, 2 orders, ACOS 35.5%.
- XIX2353 `kw broad_letter stencils_xix2353` keyword `stencils letters` (`230944540467488`): 30d spend 8.14, 21 clicks, 1 order, ACOS 47.9%.
- XIX2353 `kw broad_letter stencils_xix2353` keyword `stencil letters` (`245030233189324`): 30d spend 4.82, 12 clicks, 0 orders.
- XIX2353 `kw broad_letter stencils_xix2353` keyword `large letter stencils` (`100423920363240`): 30d spend 4.43, 11 clicks, 0 orders.

Held deliberately:

- SC3077 SBV keyword rows: still the main conversion path, 7d ACOS around 10.7%-18.7% by row, so not closed in this pass.
- XIX2353 SB/SBV rows: current 7d/30d ACOS is controlled, so not part of the ACOS>35 close request.
- Very low-spend SC3077 B2B1 rows: already adjusted on 2026-05-18 and sample is still too small for another same-window cut.

## Follow-up checkpoints

- 2026-05-21: check whether spend falls on the paused rows and whether SKU-level orders hold through retained SBV / close-match lanes.
- 2026-05-23: review 3-day effect. Continue paused if spend drops without order loss; reconsider only if orders fall materially and retained traffic cannot cover demand.
- 2026-05-27: 7-day effect check against SKU-level ACOS, units, and remaining traffic mix.

## Reply draft

SC3077：我看了下，这款首饰收纳盘不是完全没转化，主要是利润承接弱，B2B 自动里的 loose match 和一个 SP 泛词已经跑到亏损线外了。我今天先把这两条亏损流量关掉，SBV 和更准的收纳盘词还在出单，先保留，明天看花费有没有降下来、订单有没有被影响。

XIX2353：我按 ACOS 35% 这条线处理了，SP broad 里超过 35% 的词和有点击花费但没出单的词已经关掉；SB/SBV 现在 ACOS 还在可控范围内，先不动。明天先看 spend 和订单承接，3 天后再确认是否需要继续收。
