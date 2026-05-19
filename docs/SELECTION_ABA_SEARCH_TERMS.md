# Selection ABA Search Terms

This document describes the read-only ABA search-term source from the internal selection system.

## Purpose

Use this source to answer whether a market search term has current demand, rank, top-ASIN concentration, category fit, price/review context, and supply-demand pressure.

It is decision support only. It must not directly create keywords, raise bids, raise budgets, or start product pushes without SKU-level ad, listing, inventory, product-fit, and keyword conversion evidence.

## Command

Start or verify the debug browser first:

```powershell
npm run chrome:debug
```

Fetch ABA search terms:

```powershell
npm run ops:selection:aba-search-terms -- --search-terms "cowboy hat, nurse gifts, 4th of july decorations"
```

Multiple comma-separated terms are split into separate ABA requests and then merged into one report. The ABA New page treats comma text as one search string, so the script does the split client-side.

Optional ASIN mode:

```powershell
npm run ops:selection:aba-search-terms -- --asins "B0FP19VG6F,B0BDRT6Z6L"
```

Optional explicit date:

```powershell
npm run ops:selection:aba-search-terms -- --search-terms "cowboy hat" --date-type 2 --u-time 2026-04-30
```

Default output:

```text
data/snapshots/selection_aba_search_terms_<YYYY-MM-DD>.json
```

## Source Interface

The script calls these endpoints inside the logged-in `selection.yswg.com.cn` browser tab:

```text
GET  /soundasia_selection/brandAnalytics/usBrandAnalytics/getSiteDateNew
POST /soundasia_selection/searchTerm/lastDay/list
```

If `--u-time` is omitted, the script resolves the latest available ABA date from `ABA日搜索词(新)` for the requested site/date type. For the current US monthly path, this is `site=1`, `dateType=2`.

The browser page provides `localStorage.pro__Access-Token`; the script parses only the Vue-LS `value` and uses it inside the browser context as `X-Access-Token`.

Do not paste, store, or log `X-Access-Token`, cookies, CSRF tokens, XSRF tokens, or captured fetch headers.

## Report Shape

Top-level fields:

- `period.dateType`, `period.uTime`, `period.dataAgeDays`, `period.freshness`
- `coverage.requestedCount`, `coverage.returnedCount`, `coverage.missingSearchTerms`
- `request.splitRequests` and `apiResults` when multiple terms are queried
- `operatorSummary.byDemandTier`, `operatorSummary.byCompetitionTier`, `operatorSummary.byRecommendedUse`
- `opsReadiness.readyForDecisionSupport`
- `opsReadiness.readyForAutoAction`
- `crossValidationPlan`
- `rows`

Per-term fields:

- Demand: `rank`, `searchVolume`, `estimatedOrders`, `amazonMonthlySales`
- Concentration: `topAsins`, `totalClickShare`, `totalConversionShare`
- Market structure: `brandCount`, `sellerCount`, `brandMonopoly`, `sellerMonopoly`, `supplyDemand`
- Product context: `priceAvg`, `ratingAvg`, `reviewAvg`, `categoryPath`, `categoryId`
- New-market context: `newAsinNum`, `newAsinProportion`, `newAsinOrders`, `flags`
- Operating classification: `demandTier`, `competitionTier`, `recommendedUse`, `decisionConfidence`
- Evidence: `evidenceNotes`, `crossChecks`

## Operating Interpretation

`demandTier`:

- `high`: strong search rank, search volume, or order signal.
- `medium`: visible demand, but not a broad high-demand term.
- `low`: weak current ABA demand.

`competitionTier`:

- `high`: high brand/seller monopoly, high supply-demand pressure, or heavy top-ASIN concentration.
- `medium`: visible concentration or pressure, but not enough to block research.
- `low`: no major concentration signal from the returned fields.

`recommendedUse`:

- `candidate_market_validation`: high demand and lower competition; validate product fit and conversion cost next.
- `cross_check_with_sku_fit`: demand exists but competition or category fit needs SKU-level proof.
- `niche_or_low_bid_test`: smaller market; only cautious testing after product fit is confirmed.
- `research_only`: market context only.
- `hold_or_research_only`: low demand or high competition; do not push from this source.

`opsReadiness.readyForAutoAction` is always `false`. This protects the boundary between market evidence and executable ad decisions.

## Cross-Validation Plan

Before spend or product-selection changes, validate against:

- `selection_keyword_conversion_rate`: keyword search/click/purchase proof and CPC/CPA/ACOS ranges.
- `ad_backend`: our SKU CTR, CVR, CPC, ACOS, orders, and recent trend.
- `reverse_search_terms`: whether the term belongs to the target ASIN/product class.
- `listing_price_review`: whether our price, image, rating, reviews, or listing copy can convert the traffic.

ABA is strongest when it agrees with keyword conversion data and current SKU-level performance. A high ABA rank alone is not enough to create ads or increase spend.

## Known Limitations

- Monthly ABA data is not real time. Check `period.dataAgeDays` and `period.freshness`.
- Search matching can return related terms. Treat `coverage.missingSearchTerms` as missing exact evidence, not as zero demand.
- Category and monopoly fields are market-level evidence, not proof that our SKU can win.
- The script is read-only and browser-session dependent.
