---
name: amazon-listing-health-check
description: >
  Use when working in ad-ops-workbench to inspect Amazon listing health, ASIN
  front-page status, Buy Box/buyability, price, delivery, rating/reviews, BSR,
  category, search visibility, listing conversion blockers, or Chinese prompts
  like 检查 listing, 链接健康, ASIN 页面, 前台可见性, Buy Box, 是否可售,
  差评检查, BSR, 搜索可见, or 新品上架验收. Use browser-backed and internal
  selection evidence; curl/BeautifulSoup is only a fast fallback and must not be
  trusted alone when Amazon blocks or dynamic fields are missing.
---

# Amazon Listing Health Check

## Purpose

Check what a buyer and our internal systems can see for an ASIN/listing. This is a read-only diagnostic skill. It does not submit listing edits or ad changes.

Default project root: `D:\ad-ops-workbench`.

## Read Order

### 1. Resolve ASIN/SKU

Extract ASIN, Amazon URL, SKU, seller/account, site, expected seller, and key search terms. If a SKU is provided, read the product card/listing context before front-page inspection.

### 2. Front-Page Listing Facts

Use `aicx-amazon-info` for ASIN/product-page reads when the prompt contains ASIN or Amazon URL. It currently supports title, brand, price, rating, review count, bullets, specs, and main image.

If you build or use a lightweight `curl + BeautifulSoup` path, treat it as a fast snapshot only:

- Accept: title, price, rating/review count, BSR/category snippets, visible unavailable text.
- Escalate to browser-backed read when captcha, dog page, missing price, missing buy buttons, region-sensitive delivery, coupon, Buy Box, or search visibility matters.
- Say whether each important field is `front-page-browser`, `curl_snapshot`, `selection`, `sellerinventory`, or `missing`.

### 3. Internal Selection Cross-Check

Use selection extended evidence for ASIN context:

```powershell
npm run chrome:ready
npm run ops:selection:extended -- --preset "asin-info flow-structure comment-analysis association-flow ad-placement" --asin <ASIN> --site 1 --date-info <YYYY-MM>
```

Use Product Time Machine, ABA, or keyword research if listing health depends on search visibility or market fit:

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<core terms>"
npm run ops:selection:product-time-machine -- --search-keywords "<core terms>"
```

### 4. Internal SKU And Ad Context

For our SKU, add:

- sellerinventory product-analysis: stock, 30-day sales, profit trend.
- daily deposit or latest snapshot: current sales, profit, refund, listing sessions/conversion when available.
- ad backend: current impressions/clicks/orders, search terms, placement, active state.

## Health Dimensions

Check and label each dimension:

- Page access: ok, unavailable, suppressed, captcha/blocked, wrong ASIN, variant redirect.
- Buyability: Add to Cart/Buy Now, Sold by, Ships from, FBA/FBM, expected seller match.
- Price and promo: current price, coupon/promo, abnormal missing price, price-band fit.
- Delivery: Prime and delivery promise when visible.
- Listing content: title, bullets, images, video, keyword coverage, product identity clarity.
- Rating/reviews: rating, review count, visible or internal comment pain points.
- Category/BSR: category path, BSR/new-release evidence, category mismatch.
- Search visibility: front-search/keyword-research position, sponsored/natural separation.
- Internal support: inventory, profit, SKU ad proof, current action history.

## Output Contract

```text
检查对象:
<ASIN/SKU/site and data-source status>

总体状态:
<healthy / attention / abnormal / blocked_missing_live_read>

问题清单:
<dimension, fact, source, severity, why it matters>

内部承接:
<inventory, profit, listing fit, ad proof, market evidence>

建议:
<read-only diagnosis, listing repair candidate, ad repair candidate, or next exact check>
```

If a listing edit is needed, hand off to `sellerinventory-listing-submission` and show proposed copy before any live submission.

## Red Lines

- Do not trust `curl + BeautifulSoup` alone for Buy Box, delivery, coupon, search rank, or dynamic page state.
- Do not claim Amazon front-end landed after sellerinventory submission unless the front page is verified.
- Do not fabricate seller, delivery, BSR, or review facts when Amazon blocks the page.
- Do not modify listing, price, ads, or inventory from this skill.
