# CL1976 recent decline review

- Source: forwarded developer message screenshot, "这个最近几个月下滑很多后".
- Product: CL1976 / B093WHT1PW, Mudder eyebrow trimmer scissors with comb, evergreen beauty grooming tool.
- Listing snapshot: price $5.39, rating 3.8, review count about 1,190, Best Sellers Rank #100 in Eyebrow Grooming Scissors.
- Note: the local product-profile rule had misclassified this SKU as Nurse Week / fiesta apparel. Current listing and inventory title confirm the operating judgement should use eyebrow grooming / beauty accessory, not seasonal nurse traffic.

## Evidence

- Data freshness: ad backend pulled on 2026-05-21, reporting through 2026-05-20; daily task layer businessDate 2026-05-20, dataDate 2026-05-19.
- Sales task layer: 30d units moved from 59 on 2026-05-04 snapshot to 36 on 2026-05-20 snapshot; YoY units about -57.65%; profit rate about 25.38%; FBA 156, local 49, sellable days about 150.
- Ad SKU summary: latest 30d impressions 10,175 vs previous 13,353, clicks 105 vs 149, orders 12 vs 25, sales $75.46 vs $134.75, ACOS 41.55% vs 21.22%. Latest 7d impressions and clicks recovered slightly, but orders fell from 5 to 4 and ACOS rose to 52.8%.
- Ad structure: old `auto2_brow scissors_cl1976` was historically the strongest source in the last 90d, but latest 30d dropped from 8,823 impressions / 96 clicks / 18 orders in the previous period to 367 impressions / 2 clicks / 1 order. New `kw exact_eyebrow scissors_cl1976` is carrying the replacement traffic, but 30d ACOS is 44.61%.
- Working exact terms: `eyebrow scissors` and `eyebrow scissors with comb` have orders. `eyebrow trimmer scissors`, `eyebrow trimming scissors`, `brow scissors`, and women variants have weaker or zero-order evidence at current bid levels.
- Market evidence: ABA 2026-04-30 still shows demand for `eyebrow scissors` with search volume 63,015 and estimated orders 11,830. Keyword conversion 2026-05-03 shows `eyebrow scissors` as strong quality, click-purchase rate 22.83%, median CPC $0.84, median ACOS about 40.02%. Competitors are stronger on listing trust: front-search sample averages rating about 4.5 and review count about 3,600, while CL1976 is 3.8 rating and about 1,190 reviews.

## Judgement

This is not a pure market-disappeared SKU and not a simple "ads did not push" case. The category still has demand, but this SKU's recent decline is mainly:

1. historical auto traffic disconnected sharply;
2. replacement exact traffic is available but more expensive;
3. listing trust is weaker than key competitors, so scaling spend can quickly push ACOS above profit room.

## Action Status

- Initial review stopped before live traffic repair; operator corrected the boundary and explicitly requested execution.
- Live traffic supplement executed on 2026-05-21 15:27 Asia/Shanghai through `run_actions.js` after dry-run passed with validationErrors=0, review=0, skipped=0.
- No campaign budget, listing, or price change was made. The live change was limited to four lower-layer bid repairs:
  - `kw exact_eyebrow scissors_cl1976` / keyword `eyebrow scissors with comb`: 0.19 -> 0.21.
  - `kw exact_eyebrow scissors_cl1976` / keyword `eyebrow scissors`: 0.23 -> 0.25.
  - `auto_brow scissors_cl1976` / auto target `asinAccessoryRelated`: 0.08 -> 0.09.
  - `auto2_brow scissors_cl1976` / auto target `asinAccessoryRelated`: 0.16 -> 0.18.
- Execution result: API success 4/4; final lookup success=4, not_landed=0, failed=0; inventory notes success=4.
- Independent backend re-fetch verified landed bids:
  - `eyebrow scissors with comb` bid=0.21, updatedAt=2026-05-21 15:27:11.
  - `eyebrow scissors` bid=0.25, updatedAt=2026-05-21 15:27:11.
  - `auto_brow scissors_cl1976` `asinAccessoryRelated` bid=0.09, updatedAt=2026-05-21 15:27:13.
  - `auto2_brow scissors_cl1976` `asinAccessoryRelated` bid=0.18, updatedAt=2026-05-21 15:27:13.

## Follow-Up

- Next checkpoint: 2026-05-22 first landing-effect check, then 2026-05-24 3d traffic/order review.
- Review 3d exposure/click/order change for `kw exact_eyebrow scissors_cl1976`, `auto_brow scissors_cl1976`, and `auto2_brow scissors_cl1976`.
- Continue only if exact terms keep orders and ACOS moves closer to profit room; if clicks rise without order recovery, shift to listing/offer repair rather than ad scale.

## New Traffic Discovery And Action

- User follow-up on 2026-05-21: "有没有新流量 找找啊".
- Evidence checked: selection keyword research, ABA search terms, keyword conversion, existing exact/phrase/broad keyword rows, existing ASIN exact/expanded target rows.
- Held traffic:
  - `eyebrow grooming kit`: has demand, but intent is full kit; CL1976 is scissors with comb, fit is weaker.
  - `eyebrow trimmer for women`: conversion data is strong, but front search skews electric trimmer/razor, not scissors.
  - `eyebrow scissors kit`: low demand and high CPC/ACOS risk.
  - `eyebrow scissors with brush` and `eyebrow razor scissors`: missing ABA/conversion coverage.
- Live new keyword test executed through `/keyword/createKeywordNew` on 2026-05-21 15:42 Asia/Shanghai and re-fetched as visible:
  - `facial hair scissors` exact, bid 0.20, keywordId `256543917988846`.
  - `small scissors for grooming` exact, bid 0.18, keywordId `91529096951361`.
- Competitor ASIN test submitted through `/advTarget/storeManualTarget` on 2026-05-21 15:42 Asia/Shanghai:
  - `B0F9WQ35N1`, `B0F1D8ZQY8`, `B0DDXTL23F`, each `ASIN_SAME_AS`, bid 0.18.
  - API returned success and targetIds `60835993739608`, `217740003287334`, `126426680932874`, but `/keyword/findAllNew` and `/advTarget/findManualProductTarget` did not yet show the rows after re-fetch. Treat these as pending visibility, not confirmed landed.
- Adjustment log appended in `data/adjustments/adjustments_2026-05-21.json` with two landed keyword creates and three ASIN pending-visibility creates.

## Reply Draft

我看了下，这个不是单纯市场没量，眉毛修剪剪刀核心词还有需求；老自动流量断得明显，所以我已经先补了小流量，没有猛加预算。原有有效精准词和老自动方向已小幅抬价，另外新开了 `facial hair scissors`、`small scissors for grooming` 两个低价精准词做新流量测试；几个贴品竞品 ASIN 也提交了追加，但后台列表还没刷出来，我这边先按待可见跟进。明天先看曝光点击有没有接回来，3 天后看订单和 ACOS。
