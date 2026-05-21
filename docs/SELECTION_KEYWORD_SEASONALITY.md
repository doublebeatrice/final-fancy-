# Selection Keyword Seasonality

This document describes the read-only search-term analysis source from the internal selection system.

It is exposed as `keyword-seasonality` because its primary daily use is to decide market window, trend, and season timing. The data also includes market overview, competitor ASIN details, and buyer search-term expansion.

## Command

```powershell
npm run chrome:debug
npm run ops:selection:keyword-seasonality -- --search-terms "cowboy hat, hat organizer"
```

The report writes to:

```text
data/snapshots/selection_keyword_seasonality_<YYYY-MM-DD>.json
```

## Source

The script calls these endpoints inside the logged-in `selection.yswg.com.cn` browser tab:

```text
POST /soundasia_selection/searchTerm/analysis/getGoogleTrend
GET  /soundasia_selection/searchTerm/analysis/getOtherBySt
GET  /soundasia_selection/searchTerm/analysis/queryASINCP
GET  /soundasia_selection/searchTerm/analysis/getBuyerStBySearchTerm
```

Auth is read from the active browser session. Do not paste or store `X-Access-Token`, cookies, CSRF, XSRF, or JWT values.

## Output

Each row normalizes:

- `rank`, `searchVolume`, and `asinCount` from the market overview.
- Google Trend timeline, latest value, max/min value, average, and trend direction.
- Competitor ASIN summary: top ASINs, price average, rating average, review average, brand count, and top brands.
- Buyer search-term expansion rows when the backend returns them.
- Operating fields: `demandTier`, `competitionTier`, `recommendedUse`, evidence notes, and cross-check plan.

The default buyer search-term date is the latest completed monthly date from the selection date API. If the date is not resolved correctly, pass it explicitly:

```powershell
npm run ops:selection:keyword-seasonality -- --search-terms "sun hats for women" --u-time 2026-04-30
```

## Boundary

This is decision support only. It can explain season windows, replenishment timing, clearance risk, and keyword-market fit, but it cannot directly create keywords, raise bids, raise budgets, or change listing, price, or inventory. Cross-check with ABA demand, keyword conversion economics, SKU ad proof, listing fit, inventory, and profit before any executable action.
