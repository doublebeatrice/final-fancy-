# Listing Revision Brief — DUN1391 (B0CJ5GF9VP)

- **Date**: 2026-05-12
- **Requested by**: ad-ops (Claude)
- **Channel**: Amazon.com
- **Brand / Seller**: Hushee / DunnJing
- **Status**: 正常销售
- **PDP**: https://www.amazon.com/dp/B0CJ5GF9VP

## Why this brief

7d ad spend $2.80 / 0 orders. 30d ad spend $42 / 3 orders, ACOS 28%, profit -26.8%.
listing CR collapsed 5.36% → 2.5% week-over-week with sessions roughly flat (56 → 40).
Front-end PDP review found three concrete issues that are pushing buyers away — none of them get fixed by tuning bids. This brief lists the changes; ad-side actions are tracked separately.

## Diagnosis (concrete evidence from PDP + SERP scan)

### 1. Product–query mismatch (the biggest single driver)
- Ads target "food storage buckets with lids" and similar bucket queries.
- SERP for that query returns mostly **5-gallon heavy-duty buckets** (United Solutions, House Naturals, Cambro, EconoHome) at $39–58, with 275 / 810 / 1,112 / 1,165 / 3,780 ratings and 4.4–4.8★.
- Our product is a **4-pack 6-quart round PP food canister** — different form factor and use case (pantry / dry-food canister, not contractor bucket).
- Net effect: clicks land on a PDP that does not match shopper expectation → low CTR and CR.

### 2. Listing copy leans on "bucket / commercial" language that misframes the product
Current title: "Hushee 4 Pcs Commercial Food Storage Containers Round PP Food Storage Containers with Lids for Pantry Translucent Plastic Tubs with Lids for Storage Food Safe Bucket with Scales and Handles (6 Quart)".
- "Bucket" and "Commercial" pull bucket-query traffic that doesn't convert.
- "Translucent Plastic Tubs" is generic and competes with restaurant-supply listings where we lose on price/reviews.
- Bullet 1 leads with "Rich Content" — buyers don't search that.

### 3. Recent negative reviews all hit the same defect: lids don't seal
The hero feature in current bullets is "upgraded tighter seal" lids. The most recent verified 1–3★ reviews say the opposite:
- 2025-09 **1★**: "Lids are loose and do not fit on the container properly, do not seal. Hard to stack."
- 2025-08 **2★**: "Lid doesn't fit at all."
- 2024-02 **3★**: "lids are not air tight. do not use for storing food."
A buyer who reads the first negative review on PDP sees the listing contradicting itself. CR drop is consistent with this.

### 4. Trust gap vs. competing food-canister listings
- DUN1391: 3.9★ / 43 reviews.
- Same-shape competitor canister sets in the food-storage category typically run 4.3–4.7★ with hundreds to thousands of reviews.
- 3.9★ is in the danger zone for Home & Kitchen — buyers filter it out.

## Requested changes

### A. Title rewrite (priority 1)
**New title (200-char cap):**
> Hushee 4 Pack 6 Quart Pantry Storage Containers with Lids, Airtight Round Food Storage Canister Set, BPA-Free PP Plastic Canisters for Flour Sugar Rice with Measurement Marks and Handles

Notes:
- Remove "Commercial" and "Bucket" — both pull wrong-intent traffic.
- Lead with "Pantry Storage Containers" + "Canister Set" (matches the real search intent).
- Add canonical pantry-item nouns: "Flour Sugar Rice" — these are high-volume queries for canister sets.
- Keep "Measurement Marks" + "Handles" — real differentiators visible in product photos.
- Keep "BPA-Free" + "PP Plastic" — food-safe trust signals.

### B. Bullet rewrite (priority 1)
Replace existing 5 bullets with the following structure. Keep them factual — do NOT re-promise "airtight seal" since that is exactly the failure mode reviews call out. Reframe the lid as a dust/moisture lid for dry pantry goods.

1. **4-PACK CANISTER SET FOR PANTRY ORGANIZATION** — Includes 4 round 6-quart food storage containers with snap-on lids; great for sorting flour, sugar, rice, pasta, pet food, baking supplies, or craft/office materials in one consistent look.
2. **CLEAR QUART + LITER MEASUREMENT MARKS** — Bold red scale on the side shows how much is left at a glance, so you can refill before you run out and portion ingredients without an extra measuring cup.
3. **DRY-FOOD SAFE PP PLASTIC, BPA-FREE** — Built from food-grade polypropylene, suitable for refrigerator and freezer use from -40°F to 160°F. Designed for dry storage and short-term refrigerated use; not intended as a long-term airtight vacuum seal.
4. **STACKABLE WITH SIDE HANDLES** — Flat tops and matching footprints let containers stack stably on pantry shelves; molded side handles make it easy to lift a full 6-quart container down off the shelf.
5. **VERSATILE INDOOR USE** — Works in kitchens, pantries, RV/boat galleys, office break rooms, classrooms, and craft rooms; lids snap on for transport and snap off for one-handed scooping.

Why bullet 3 says "not intended as a long-term airtight vacuum seal":
The honest framing pre-empts the "lid doesn't seal" reviews. We stop competing on a feature we are losing on, and move the value prop to **pantry visibility + stacking + measurement** — features the product actually has.

### C. A+ content adjustments (priority 2)
- Replace any module that calls the product a "commercial bucket" with "pantry canister set".
- Add a module that visually shows the **measurement scale + side handle + stack** trio — these are the three honest wins.
- Add a comparison row vs. our own larger / smaller variant so shoppers self-select size instead of bouncing.
- Remove any A+ copy promising "airtight seal" or "vacuum lock".

### D. Main image / image set (priority 2)
- Keep the white-background hero showing all 4 containers.
- Add (or move up) a lifestyle shot of the containers **on a pantry shelf with flour / sugar / rice / pasta** — the use case the new title is targeting.
- Add an infographic showing **quart + liter scale** since that is now a top-3 bullet.
- The current image set has 7 images; keep count, swap order.

### E. Backend keywords (priority 1)
Add/keep:
- pantry storage containers
- airtight canister set
- flour sugar storage container
- rice storage container with lid
- dry food canister
- kitchen pantry organization
- pasta storage container
- bulk food storage
- 6 quart storage container
- food container with measurement

Remove / do not include:
- "5 gallon bucket" / "food grade bucket"
- "commercial food storage bucket"
- any "mylar bag" / "gamma seal" terms

### F. Review hygiene (priority 3 — escalation, not edit)
- Run the 2025-09 1★ and 2025-08 2★ through Seller Central review-appeal queue (both name a product defect that may be a manufacturing batch issue worth flagging to QC).
- If Vine slots are available for the parent ASIN B0CWRCBZQG, request enrollment for the 6qt variant to dilute the 43-review sample.

## Out of scope for this brief
- Pricing change — DUN1391 sits at $49.99 / list $54.99; price is in range with competing canister sets, so we leave price alone in this pass.
- Variant restructuring — parent B0CWRCBZQG carries 2qt / 6qt / 10qt; the same brief logic applies but each variant needs its own pass after we validate the new copy on 6qt.

## How to track results
- Re-snapshot listingSessions / listingConversionRates for B0CJ5GF9VP 14 days after the change ships.
- Target: CR back to ≥5% with sessions ≥40/wk = ~2 organic orders/wk. If CR stays under 3.5% at 14d post-ship with kept sessions, the listing issue is deeper than copy and needs a category/photo refresh.
