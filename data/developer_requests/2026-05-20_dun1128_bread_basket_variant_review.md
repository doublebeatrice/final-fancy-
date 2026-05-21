# 2026-05-20 DUN1128 bread basket variant review

## Source intent

- Forwarded developer request: DUN1128 variant group may be sellable; developer compared against Amazon listing `https://www.amazon.com/dp/B0CHVYCD6B?th=1`.
- Product family: imitation rattan bread basket with acrylic lid / covered serving basket.
- Current handling objective: judge whether the group is worth continuing and what action is appropriate now.

## Product and listing evidence

- Comparison ASIN `B0CHVYCD6B` scraped on 2026-05-20: Ziliny 2-set wicker bread basket with acrylic lid, 4.5 rating, 33 reviews, BSR `#14 in Bread & Serving Baskets`, size 13.78 x 9.84 inch.
- Our SKU `DUN1128` / ASIN `B0CH8SB9DJ` scraped on 2026-05-20: Hushee 2-set imitation rattan bread basket with lid, 4.2 rating, 68 reviews, BSR `#104 in Bread & Serving Baskets`, size 15.75 x 11.81 inch.
- Interpretation: the form factor and category are proven, but the comparison is not a direct green light for aggressive spend because our offer is a larger-size variant with weaker rating and BSR position.

## Market evidence

- Selection ABA, period 2026-04-30: `bread basket with lid` has search volume 2672 and estimated orders 904, but demand tier is low and competition tier is high.
- Selection keyword conversion, period 2026-04-26: `bread basket` has search volume 7052, click volume 2687, purchase volume 390, click-purchase rate 14.51%, CPC median about 0.51, and low cost risk.
- Missing selection rows for more exact long tails: `bread basket with cover`, `wicker bread basket with lid`, `rattan bread basket with lid`, `bread basket with acrylic cover`.
- Interpretation: generic `bread basket` demand exists and can convert, while exact covered/acrylic lid long tails are smaller. Use the broad market as discovery only; scale only from terms that show account-level conversion.

## Account evidence

- Latest daily task snapshot: businessDate 2026-05-19, dataDate 2026-05-18.
- DUN1128: 5 units in 3d, 7 units in 7d, 9 units in 30d; 7d ad spend 15.35, 2 ad orders, 38 clicks, 4543 impressions; FBA fulfillable 24, local 1, sellable days 87; final action `light_test`.
- DUN1127 sibling: 4 units in 7d, 10 units in 30d; 7d ad spend 73.18, 7 ad orders, 184 clicks; FBA fulfillable 13, sellable days 51; final action `light_test`.
- DUN1150 sibling: 1 unit in 7d, 5 units in 30d; 7d ad spend 13.69, 0 ad orders, 44 clicks; FBA fulfillable 7, sellable days 54; final action `light_test`.
- Customer search terms in DUN1127 auto campaign: 475 clicks, spend 210.75, 15 orders, sales 653.84. Bread-basket-related terms contributed 141 clicks, spend 62.73, 6 orders, sales 243.94.
- Converting term examples: `bread basket`, `bread box`, `bread baskets for serving`, `bread basket storage`, `bread basket with lid`.

## Handling status

- 2026-05-19 already adjusted weak traffic rather than cutting the SKU:
  - DUN1128 auto `Close-match`: small-step correction for 30d zero-order traffic.
  - DUN1128 auto `Substitutes`: small-step correction for 30d zero-order traffic.
  - Three-variant SB broad terms `bread basket` and `bread basket with cover`: small-step correction for 30d zero-order traffic.
- Current decision: keep DUN1128 and sibling variants on controlled light test. Do not large-scale budget-up yet because profit is weak and some broad/SB traffic has clicks without orders.

## Next checkpoint

- Recheck on 2026-05-23 after 2-3 days:
  - DUN1128 exposure, clicks, and order count after weak-traffic corrections.
  - Whether orders continue from `bread basket`, `bread baskets for serving`, `bread basket with lid`, and adjacent storage/serving terms.
  - Whether DUN1150 should stay only as a small variant supplement or be further suppressed.

## Operator reply draft

Chinese operator-facing reply was delivered in the conversation response. This file keeps the evidence record in ASCII to avoid local terminal encoding issues.

## 2026-05-20 competitor learning and product optimization

Current comparison source:

- Competitor ASIN `B0CHVYCD6B`, Ziliny, 2-set rectangular wicker bread basket with acrylic lid.
- Our variant group: `DUN1127` / `B0CH8QTQLG` small oval 13.78 x 9.84 inch, `DUN1128` / `B0CH8SB9DJ` large oval 15.75 x 11.81 inch, `DUN1150` / `B0CH8RJFTG` mixed-size oval set.

What the competitor is doing better:

- Scene fit is clearer. The main image shows two filled baskets, lid lift, and party / buffet food use in one view. Our main image shows the product form but communicates less about table display capacity and use occasion.
- Shape may be closer to high-frequency buyer intent. The rectangular basket is easier to understand as a countertop, buffet, picnic, bakery, or self-serve tray. Our oval large-size offer has capacity, but it may look more like a specialty tray and can feel more space-consuming.
- Listing wording is more occasion-led. Competitor title and bullets repeat serving, fruit, picnic, BBQ, pool party, outdoor, housewarming gift, restaurant, reception room, and office. Our copy is more generic storage/display language.
- Rating threshold is stronger. Competitor page shows 4.5 rating and BSR #14 in Bread & Serving Baskets; our page shows 4.2 rating and BSR #104. Our review count is higher, but the lower rating weakens conversion trust.
- The two-piece value is visually obvious. Competitor image makes the 2-set benefit clear immediately; our image can read as one product repeated, and the variant differences are not obvious enough.

Optimization direction:

- Product-side next development: keep a rectangular 13.78 x 9.84 inch 2-pack as the core learnable format. If a new mold or replenishment choice is possible, prioritize rectangular / buffet-tray shape before adding another large oval variant.
- Listing image: rebuild the main image and second image around filled food scenes. Show two baskets together, lid handle in use, bread + pastries + fruit, and a countertop / party display layout.
- Variant naming: separate the buyer logic for small, large, and mixed-size sets. Small = countertop / table serving; large = party / buffet / bakery display; mixed = hosting set / multi-scene.
- Copy repair: remove duplicate bullet wording and typo-like phrases such as uppercase holiday lists and `DINNNER`. Replace with clean occasion clusters: bread serving, fruit display, picnic, BBQ, party, restaurant counter, housewarming.
- Traffic/listing alignment: keep ad testing on `bread basket`, `bread basket with lid`, `bread baskets for serving`, `bread basket storage`, and ASIN expansion from relevant covered-serving-basket competitors. Do not scale purely from broad proofing-basket traffic because sourdough proofing intent is a different product use.
- Review/rating risk: before aggressive scale, inspect negative review causes if available. If complaints are about lid fit, material feel, size expectation, or packaging, product/detail-page repair should come before larger spend.

Operating verdict:

- The competitor supports that this product type can sell, but the learnable point is not only ad spend. The stronger path is a rectangular, scene-led, occasion-led covered serving basket presentation.
- DUN1128 can stay in controlled test after the no-click bid-up, but product optimization should focus on image/copy/variant positioning first. If developing the next version, copy the competitor's buyer-use clarity and rectangular table-fit, not just the same keyword set.

## 2026-05-20 competitor keyword reverse check

Reverse-check scope:

- Direct ABA ASIN reverse lookup for `B0CHVYCD6B` returned 0 rows for period `2026-04-30`.
- Then used the AI ASIN keyword pipeline with 16 broad seeds: developer competitor `B0CHVYCD6B` plus related ABA top ASINs from `bread basket`, `bread basket with lid`, `bread baskets for serving`, `wicker bread basket`, and `bread basket storage`.
- Pipeline output: 60 similar competitors, 3301 keywords, 215 high-relevance keywords, 7 medium-relevance keywords, 133 low-relevance keywords.
- Evidence files:
  - `data/snapshots/selection_aba_asin_B0CHVYCD6B_2026-05-20.json`
  - `data/snapshots/keyword_pipeline_dun1128_competitor_B0CHVYCD6B_2026-05-20.json`
  - `data/snapshots/keyword_pipeline_dun1128_competitor_B0CHVYCD6B_2026-05-20.xlsx`
  - `data/snapshots/keyword_pipeline_dun1128_competitor_B0CHVYCD6B_2026-05-20_summary.json`
  - `data/snapshots/selection_keyword_conversion_dun1128_competitor_reverse_2026-05-20.json`

Reverse keyword findings:

- Strongest clean product term remains `bread basket`: selection keyword conversion returned search volume 7052, click volume 2687, purchase volume 390, click-purchase ratio 14.51%, and CPC median 0.51. It is the cleanest exact/phrase candidate.
- `bread baskets for serving` is relevant but smaller and more expensive: search volume 2424, purchase volume 77, click-purchase ratio 9.49%, CPC median 0.98.
- `bread box` and `bread box for kitchen countertop` are the large adjacent pool: `bread box` search volume 92130, purchase volume 1362, click-purchase ratio 4.74%, CPC median 0.61; `bread box for kitchen countertop` search volume 12404, purchase volume 198, click-purchase ratio 4.78%, CPC median 0.61. This is not a perfect product match, but account customer-search evidence already had one order on `bread box`, so it can stay as a controlled test direction.
- `basket with lid` and `wicker basket with lid` are broad storage-basket terms with low click-purchase ratios around 3%. Use only as observation / low-bid tests, not as the main push layer.
- The pipeline produced many high-volume `sourdough`, `proofing`, `banneton`, and `dutch oven` keywords. These are a different baking-tool market and must be excluded from ad expansion and product positioning.

Corrected product optimization:

- The competitor keyword pool says buyers are not only searching for a serving basket; they are strongly searching for countertop bread storage. To learn from the competitor properly, the product/page should lean into `covered countertop bread storage` and `serving display`, not only `picnic basket`.
- If the next product version is possible, a rectangular covered basket is more aligned with `bread box for kitchen countertop` and `bread basket` intent than a large oval tray.
- Current DUN1128 listing should separate two messages:
  - primary: `bread basket / bread baskets for serving / bread basket with lid`
  - secondary: `countertop bread storage / bread box adjacent use`
- Do not build around sourdough-proofing language unless the physical product changes into a real proofing basket.
