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

## 2026-06-01 fresh market and click-no-conversion recheck

Fresh selection access was live on 2026-06-01. Evidence used:

- Product Time Machine, latest 7-day keyword map.
- ABA monthly search terms, latest available period 2026-04-30.
- Keyword conversion economics, period 2026-05-10, data age 22 days.
- Keyword seasonality and competitor summary, latest available period 2026-04-30 plus Google trend timeline through 2026-05-31 to 2026-06-06.
- Live ad SKU summary for 2026-06-01.

Market read:

- `bread basket` has real demand, not a dead market. ABA shows 28,038 search volume and 6,140 estimated orders; keyword conversion shows 7,043 searches, 2,309 clicks, 369 purchases, and 15.98% click-purchase rate. However the live winner set is heavily mixed with sourdough proofing baskets, fruit baskets, and lower-priced serving baskets. Product Time Machine top bought products are mostly around $19.99 to $24.99 with stronger review bases.
- `bread basket with lid` is the best exact-fit lane, but it is small. ABA shows 2,672 search volume and 904 estimated orders; Product Time Machine latest search volume is 318, rising/improving. Competitor price average is about $35.32. This supports a controlled test, not scale.
- `bread basket with cover` remains weak as a scale term. Product Time Machine returned 0 current rows and ABA returned 0 exact rows. The existing SB broad row has 30-day 15 clicks and 0 orders.
- `bread box` is the largest adjacent market. ABA shows 265,540 search volume and 41,202 estimated orders, but buyer intent is countertop storage boxes, not an oval acrylic-lid serving basket. This can generate clicks but is not a clean conversion lane.
- `proofing basket` has strong demand and conversion economics, but it is a different product use case: sourdough proofing/banneton kits. It should not be used as a DUN scale lane unless the product changes.
- `bread warmer basket with stone` is a small niche and physical mismatch. Keyword conversion shows CPC median about $1.30, CPA about $20.47, and ACOS about 48.56%, so it is only an observation lane at most.

Ad read:

- DUN1128/DUN1127/DUN1150 combined 7-day live ad data: 73,427 impressions, 177 clicks, $59.70 spend, 0 orders. This is not a no-traffic problem.
- Combined 30-day live ad data: 208,776 impressions, 1,107 clicks, $427.66 spend, 29 orders, $1,188.71 sales, about 36.0% ACOS. The group can convert historically, but the last 7 days collapsed.
- Current prices are high versus the strongest market lanes: DUN1128 $41.99, DUN1127 $44.99, DUN1150 $41.99. Exact-fit covered-lid competitors average around $35, while broad bread-basket/proofing winners are often under $25.

Current diagnosis:

- The click-no-conversion issue is mainly traffic-fit plus offer/listing conversion support, not missing market demand.
- Keep only controlled tests on `bread basket`, `bread baskets for serving`, and `bread basket with lid`.
- Do not scale `bread basket with cover`, `proofing basket`, `bread warmer basket with stone`, or broad `bread box` unless they show account-level orders at low spend.
- Product/listing repair should come before additional scale: clearer filled-food scene image, acrylic lid use, party/buffet/countertop serving use case, and separate positioning for serving display versus countertop bread storage.
- If product development can iterate, prioritize rectangular covered 2-pack / buffet-tray format over adding another large oval variant.

## 2026-06-01 negative-keyword / traffic-control plan

Live receiver-layer recheck on 2026-06-01:

- SP keyword group `kw_baskets_dun1128`: `bread warmer basket with stone` has 30-day 25 clicks, $18.20 spend, 1 order, 45.5% ACOS; recent 7-day window has 14 clicks, $10.38 spend, 0 orders. This is not a clean DUN fit and should not be scaled. Since it was adjusted on 2026-06-01, protect against same-day repeat writes unless spend continues without orders at the next short checkpoint.
- SP auto group `ai_auto_ful full loop_dun1127`: auto buckets are still converting over 30 days. `queryBroadRelMatches`, `asinSubstituteRelated`, `queryHighRelMatches`, and `asinAccessoryRelated` together show orders, so do not apply broad negative roots to the whole auto group without exact customer-search proof.
- SP manual/category group `asin_baskets_dun1128`: category `Bread & Serving Baskets` has 30-day 29 clicks, $12.24 spend, 1 order, 30.6% ACOS. Keep as controlled observation.
- SB group `sb_dun1127dun1128dun1150`: protect `bread basket` and `bread basket for serving on dining table` because both have 30-day orders. `bread basket with cover` has 15 clicks, $3.51 spend, 0 orders and weak market evidence; this is the cleanest candidate for bid-down or pause rather than global negative. `basket for bread` has 10 clicks, $2.61 spend, 0 orders and is a secondary watch item.

Recommended control order:

1. Do not globally negative `bread basket`, `bread baskets for serving`, `bread basket with lid`, or the `Bread & Serving Baskets` category.
2. Treat `proofing`, `banneton`, `sourdough`, `dough`, `starter`, `lame`, `dutch oven`, `tortilla`, `warmer stone`, and `warming stone` as negative-candidate roots only when exact customer-search rows prove spend for DUN campaigns.
3. For existing writable rows, prefer narrow bid-down or pause on bad keyword rows before adding broad negative phrases.
4. Current executable candidate is SB `bread basket with cover` small-row control; `bread warmer basket with stone` should be checkpointed after its same-day adjustment before another write.

## 2026-06-01 live SB click-no-conversion cleanup

Operator instruction: close or lower click-no-conversion rows when warranted.

Executed live on SB campaign `sb_dun1127dun1128dun1150`:

- Paused SB keyword `bread basket with cover` (`keywordId` 32810215993629). Evidence: 30-day 15 clicks, spend 3.51, 0 orders; exact market lane had no effective current Product Time Machine / ABA support.
- Lowered SB keyword `basket for bread` (`keywordId` 143586659845475) bid from 0.25 to 0.22. Evidence: 30-day 10 clicks, spend 2.61, 0 orders; keep as a small adjacent lane instead of full pause.

Live readback after write:

- Enabled target rows no longer include `bread basket with cover`.
- `basket for bread` remains enabled at bid 0.22, updated at `2026-06-01 19:34:17`.
- Protected converting rows stayed active: `bread basket` bid 0.32 with 1 order / 15.55% ACOS, and `bread basket for serving on dining table` bid 0.38 with 1 order / 9.12% ACOS.

Next checkpoint: recheck on 2026-06-04. If same-day-adjusted `bread warmer basket with stone` continues to add clicks/spend with 0 orders, pause it instead of another small bid cut.

## 2026-06-01 live listing review and optimization plan

Live public Amazon listing scrape on 2026-06-01:

- Own variants:
  - `DUN1127` / `B0CH8QTQLG`: rating 4.2, 69 reviews, BSR #401 in Bread & Serving Baskets, live title uses the same keyword-stuffed structure as sibling variants.
  - `DUN1128` / `B0CH8SB9DJ`: rating 4.2, 69 reviews, BSR #401 in Bread & Serving Baskets, live title uses the same structure with only size changed.
  - `DUN1150` / `B0CH8RJFTG`: rating 4.2, 69 reviews, BSR #401 in Bread & Serving Baskets, live title uses the same structure for the mixed-size set.
- Developer comparison `B0CHVYCD6B`: rating 4.5, 35 reviews, BSR #84 in Bread & Serving Baskets. Main image is rectangular, filled with bread / fruit / party foods, and communicates party / buffet / countertop use faster.
- Inventory-side current prices on 2026-06-01: `DUN1128` 41.99, `DUN1127` 44.99, `DUN1150` 41.99.

Listing problems:

- Title is readable by search but weak for buyers: repeated `bread basket`, `wicker`, `fruit basket`, `food baskets`, and `display` terms make it look keyword-stuffed.
- Bullets are template-like and not size-specific. `DUN1127` and `DUN1150` have duplicate `Versatile Usage` bullets, one with uppercase holiday wording and typo `DINNNER`.
- Some wording hurts trust: `also known as plastic`, `ensures the items from dust`, and `quick know` read as machine-translated copy.
- Current main images show the acrylic lid and food, but the first visual space is still dominated by an empty oval basket / hand view. The competitor's first image shows filled-use capacity and rectangular countertop fit more directly.
- Backend search terms include weak or risky traffic such as `proof` and odd phrases like `world baking day`, while current market evidence says proofing / sourdough intent should not be a scale lane for this product.

Optimization plan:

1. Title: rewrite to a buyer-readable title centered on `bread basket with lid`, `acrylic covered wicker serving basket`, `bread / fruit / pastry display`, and size. Remove repeated generic phrases.
2. Bullets: rebuild five bullets around clear buyer jobs:
   - 2-pack value and clear acrylic lids.
   - Food display for bread, pastries, fruit, snacks.
   - Lightweight imitation rattan / acrylic material without overemphasizing `plastic`.
   - Size-specific capacity and countertop / buffet fit.
   - Use scenes: kitchen counter, picnic, party, restaurant, bakery, office reception.
3. Variant positioning:
   - `DUN1127`: compact countertop / picnic / office serving.
   - `DUN1128`: large party / buffet / bakery display.
   - `DUN1150`: mixed-size hosting set / multi-zone table display.
4. Image direction: rebuild main or second image around two filled baskets, lid-open plus lid-covered states, bread + fruit + pastry scenes, and a table / buffet arrangement. Keep the acrylic lid benefit obvious.
5. Backend search terms: remove proofing / sourdough-leaning terms unless customer-search data proves conversion. Use covered serving / countertop display language instead.
6. Offer-side caveat: price remains a conversion drag versus exact-fit covered-lid competitors around the mid-30s and broad bread-basket winners often below 25. Listing repair can help, but price / shape still limits scale.

No sellerinventory submission was made in this step. Proposed copy should be shown and confirmed before any live listing edit application.

## 2026-06-01 deeper listing audit: images, category, reviews, search box

Image audit:

- Each own ASIN has 7 product images. The image set is not empty, but the order and message are weak.
- Stronger own images:
  - Countertop / table scene with two filled baskets should move earlier because it shows real use better than the size chart.
  - Buffet / bread scene communicates real serving use and should be used to support party / bakery / restaurant positioning.
- Weak own images:
  - Current main images spend too much first visual attention on empty basket + hand. Food display appears, but not as strongly as the competitor's filled rectangular basket image.
  - Orange infographic style feels dated and text-heavy.
  - Product detail images include awkward labels such as `Easy visibility Material`; `DUN1150` image text says `Protect your belongings from dust...`, which is wrong for a food-serving product.
  - The lifestyle collage looks generic and less product-led than the competitor's picnic / BBQ / pool / party scenes.
  - `DUN1150` main image uses Easter-style food, which narrows the buyer scenario for an all-year serving/display product.

Category audit:

- Own ASIN and competitor are in the same browse path: Home & Kitchen > Kitchen & Dining > Dining & Entertaining > Dinnerware & Serveware > Bread & Serving Baskets.
- Category is not the problem. Rank and conversion strength are the problem: own live BSR #401 in Bread & Serving Baskets versus competitor #84.

Review audit:

- Own positive review themes: looks good, good size, easy to clean, useful for buffet / outdoor bread serving, cute for holidays.
- Own negative review themes:
  - Lid fit is weak: lid does not seal, falls off, cannot carry by handle.
  - Handle assembly can be a problem: screw holes may not line up.
  - Material/color risk: one review says it looks like a plastic / fake basket.
  - Damage risk: one review mentioned broken acrylic lid on arrival.
- Competitor positive review themes are clearer for buyer intent: summer entertaining, protection from flies, serving prepared foods, buffet setup, compatible with aluminum pans, quality not cheap, indoor/outdoor use.
- Copy implication: do not overclaim `seal`, `airtight`, `carry by handle`, or `keeps fresh` too strongly. Use safer claims such as `clear lid helps shield food while displayed` and `easy to see contents`.
- Product/QA implication for development: improve lid fit, handle screw alignment, acrylic lid packaging, and natural rattan color.

Search box audit on Amazon.com:

- Good autocomplete lanes:
  - `bread basket`
  - `bread baskets for serving`
  - `bread basket with lid`
  - `bread basket with lid for serving`
  - `bread basket with lid wicker`
  - `bread basket with lid large`
  - `wicker bread basket with lid`
  - `covered bread basket for buffet`
  - `bread serving basket with lid`
  - `bread basket for countertop`
- Mixed / risky lanes:
  - `bread basket proofing`, `wicker bread basket proofing`, `proofing basket`, and sourdough/banneton related terms are different product intent.
  - `bread basket with warming stone`, `bread basket with stone`, and warmer terms are different physical product intent.
  - `bread box` has strong demand but search-box results are countertop storage boxes, not this oval acrylic-lid serving basket.
  - `liner`, `cloth`, `glass`, and `airtight` are not core matches for the current product.

Search-result-page visual check for `bread basket with lid`:

- Search results mix rectangular covered serving baskets, oval baskets, proofing baskets, bread boxes, storage containers, and cloth/liner baskets.
- The strongest first-page visual promise is filled food display plus acrylic lid, especially rectangular / buffet-style products.
- Own oval product can compete only if the listing makes the food display / buffet / countertop use immediately clear and avoids proofing, warming-stone, and bread-box overreach.

Priority changes from deeper audit:

1. Reorder/replace image set before scaling traffic: use two filled baskets and countertop/buffet scene earlier; remove or rewrite weak infographic text.
2. Rewrite bullets to match review proof: buffet/outdoor/serving use, clear acrylic lid, easy visibility, easy cleaning; avoid airtight/seal/carry-by-handle claims.
3. Add product-side fixes to developer feedback: lid fit, handle screw alignment, acrylic lid packaging, and basket color/material realism.
4. Clean backend search terms and ad expansion around the good autocomplete lanes; exclude proofing / stone / sourdough / bread-box-primary intent.

## 2026-06-01 competitor image and review learning

Comparable stronger competitors checked from public Amazon pages and same-lane recommendations:

- `B0D5CR13ZR`: BSR #40 in Bread & Serving Baskets, 4.3 rating, 100 reviews.
- `B09KP8FSD7`: BSR #68 in Bread & Serving Baskets, 4.2 rating, 227 reviews.
- `B0C8J471DC`: BSR #72 in Bread & Serving Baskets, 4.2 rating, 73 reviews.
- `B0CHVYCD6B`: BSR #84 in Bread & Serving Baskets, 4.5 rating, 35 reviews.
- `B0D9JDWZ6C`: BSR #178 in Bread & Serving Baskets, 4.4 rating, 17 reviews.

Competitor image patterns:

- Main image usually shows food inside the basket immediately. Stronger examples use bread, fruit, pastries, salad, or picnic food instead of leading with an empty product-only shot.
- Rectangular competitors communicate countertop / buffet / catering fit faster than oval competitors because the footprint looks table-friendly and pan-compatible.
- Better image sets show both lid-open and lid-covered states, so the buyer understands display plus protection in one glance.
- Several stronger listings add value accessories in the first images: tongs, lace paper doilies, food blotting sheets, or compatible serving pans.
- Lifestyle images are specific: picnic, BBQ, outdoor entertaining, restaurant/bakery counter, buffet/catering display. They are not generic home decor collages.
- Size/detail images work when they are clean and functional, but the image sequence should not place size charts ahead of appetizing food-use scenes.

Competitor review-liked points:

- Buyers like `beautiful / elegant presentation` for bread, cookies, pastries, fruit, salad, and catering display.
- Buyers repeatedly mention `buffet`, `outdoor entertaining`, `picnic`, `party`, and `restaurant/catering` use.
- Clear lid value is mainly about shielding displayed food from flies/dust and allowing visibility, not true airtight sealing.
- Rectangular competitors get credit for practical fit: aluminum pans / serving trays / table display / countertop use.
- Add-on value matters: doilies, tongs, and easy serving accessories are noticed as practical and premium.
- Easy cleaning is liked, including the fact that plastic imitation rattan can be wiped clean.
- Negative patterns are consistent across the lane: lid not fitted/tight, lid cannot be used as a carrying handle, handle installation difficulty, orange/fake plastic look, flimsy construction, and shipping damage to acrylic lids.

Implication for DUN:

- Image repair should copy the winning buyer scene, not just competitor styling: filled food, acrylic lid visible, buffet/outdoor/countertop use, and preferably a rectangular future version.
- If current oval version stays, emphasize serving/display scenes and do not promise tight sealing or carry-by-handle.
- Product development improvement with highest conversion relevance: better lid fit, cleaner handle assembly, less orange/fake rattan color, stronger acrylic lid packaging, and optional accessories such as tongs/doilies.
