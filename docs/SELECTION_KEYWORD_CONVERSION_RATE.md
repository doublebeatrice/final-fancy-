# Selection Keyword Conversion Rate

This document describes the read-only keyword conversion data source from the internal selection system.

## Purpose

Use this source to answer whether a keyword has market-level demand, click volume, purchase proof, and a realistic CPC/CPA/ACOS range before changing advertising coverage.

It is decision support only. It must not directly create keywords, raise bids, raise budgets, or pause traffic without SKU-level ad, listing, inventory, and product-fit evidence.

## Command

Start or verify the debug browser first:

```powershell
npm run chrome:debug
```

Fetch keyword conversion data:

```powershell
npm run ops:selection:keyword-conversion -- --keywords "american flag bucket hat, 4th of july decorations, nurse gifts for women"
```

Optional file input:

```powershell
npm run ops:selection:keyword-conversion -- --file data\tmp_tests\keywords.txt
```

Default output:

```text
data/snapshots/selection_keyword_conversion_rate_<YYYY-MM-DD>.json
```

## Source Interface

The script calls this endpoint inside the logged-in `selection.yswg.com.cn` browser tab:

```text
POST /soundasia_selection/sif/conversionRate/pageQuery
```

The browser page provides `localStorage.pro__Access-Token`; the script parses only the Vue-LS `value` and uses it inside the browser context as `X-Access-Token`.

Do not paste, store, or log `X-Access-Token`, cookies, CSRF tokens, XSRF tokens, or captured fetch headers.

The related endpoint below is not part of the data path because it only records filter history:

```text
POST /soundasia_selection/userFilter/inOrUpItemHis?site=1
```

## Keyword Research

The keyword conversion report starts from known keywords. When a new SKU needs competitor-driven keyword discovery, use keyword research before conversion checks.

Current agent command:

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<front-search seed terms>"
```

See `docs/SELECTION_KEYWORD_RESEARCH.md`.

The older manually discovered backend pipeline used this browser WebSocket path:


```text
wss://selection.yswg.com.cn/soundasia_selection/ws/pipeline
```

Use a broad external ASIN input layer:

- Include many relevant external ASINs: same product shape, same theme or occasion, pack-size and price-band comparables, and high-traffic adjacent products.
- Do not seed only the new SKU's own ASIN. New ASINs often have no natural flow terms and may return empty keyword details or abort the pipeline.
- Do not seed only the final ASINs you expect to target. The pipeline needs a wide enough competitor set to expose keyword and product pools.

Then narrow the execution layer:

- Select high-fit keywords from the returned pool and reject adjacent markets before creating spend.
- Use the larger candidate product pool to choose ASIN targets; the ASINs confirmed in the pipeline competitor step are not automatically the final targeting list.
- If spend risk is high, reduce the final ASIN count or campaign budget. Do not rely on very low bids that are unlikely to deliver; use category-appropriate starting bids and monitor.

## Report Shape

Top-level fields:

- `period.weekDate`, `period.weekNumber`, `period.dataAgeDays`, `period.freshness`
- `coverage.requestedCount`, `coverage.returnedCount`, `coverage.missingKeywords`
- `operatorSummary.byMarketQuality`, `operatorSummary.byCostRisk`, `operatorSummary.byRecommendedUse`
- `opsReadiness.readyForDecisionSupport`
- `opsReadiness.readyForAutoAction`
- `crossValidationPlan`
- `rows`

Per-keyword fields:

- Demand: `searchVolume`, `clickVolume`, `purchaseVolume`
- Conversion: `searchClickRatio`, `searchPurchaseRatio`, `clickPurchaseRatio`
- Cost: selected-strategy `cpcMedian`, `cpaMedian`, `acosMedian`
- Multi-strategy metrics: `strategyMetrics`
- Chosen cheaper strategy: `bestCostStrategy`
- Operating classification: `marketQuality`, `costRisk`, `recommendedUse`, `decisionConfidence`
- Evidence: `evidenceNotes`, `crossChecks`

## Operating Interpretation

`marketQuality`:

- `strong`: clear market purchase proof and usable conversion signal.
- `usable_niche`: smaller market, but enough purchase proof for cautious testing.
- `test_only`: weak but nonzero proof; use only for low-bid experiments after product fit is confirmed.
- `weak` or `no_conversion_proof`: hold, avoid, or use only as market context.

`recommendedUse`:

- `candidate_exact_or_phrase`: can become a keyword candidate after SKU-level cross-checks.
- `low_bid_test_or_cross_check`: only low-bid testing or additional validation.
- `cross_check_before_spend`: cost risk is high; do not increase spend from this source alone.
- `avoid_or_hold`: do not push based on this source.

`opsReadiness.readyForAutoAction` is always `false`. This protects the boundary between market evidence and executable ad decisions.

## Cross-Validation Plan

Before spend changes, validate against:

- `ad_backend`: our SKU CTR, CVR, CPC, ACOS, orders, and recent trend.
- `aba_search_terms`: demand rank, search volume, top-ASIN concentration, category fit, monopoly, and supply-demand pressure. Use `npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"`.
- `keyword_seasonality`: Google Trend, market overview, competitor ASIN pressure, buyer search-term expansion, and market-window risk. Use `npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"`.
- `reverse_search_terms`: whether the keyword belongs to the target ASIN/product class.
- `listing_price_review`: whether our price, image, rating, reviews, or listing copy can convert the traffic.

The keyword conversion report is strongest when it agrees with at least one demand source and one SKU-level performance source.

## Known Limitations

- Data is not real time. Use `period.dataAgeDays` and `period.freshness` before acting.
- Some requested keywords may not return; treat `coverage.missingKeywords` as explicit missing evidence, not as zero demand.
- It is market-level keyword evidence, not proof that our SKU will convert.
- The selected strategy defaults to `legacyForSales_exact`, but the report keeps all strategy metrics for comparison.
