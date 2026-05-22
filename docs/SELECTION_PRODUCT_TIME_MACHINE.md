# Selection Product Time Machine

This document describes the read-only Product Time Machine source from the internal selection system.

Use it when a keyword or product direction needs competitor ASIN evidence: which ASINs own traffic, whether demand is real, how much of the traffic is organic versus paid, and whether the keyword trend is rising or weakening.

## Command

```powershell
npm run chrome:debug
npm run ops:selection:product-time-machine -- --search-keywords "cowboy hat, nurse gifts" --time-piece-value 7
```

The report writes to:

```text
data/snapshots/selection_product_time_machine_<YYYY-MM-DD>.json
```

## Source

The useful Product Time Machine main table is:

```text
POST /soundasia_selection/sif/timemachine/pageQuery
```

The request shape is:

```json
{
  "site": "1",
  "timePieceType": "latelyDay",
  "timePieceValue": "7",
  "type": 2,
  "pageNum": 1,
  "pageSize": 50,
  "sortBy": "nfScoreRatio",
  "desc": true,
  "showType": "1",
  "condition": "",
  "searchKeyword": "cowboy hat"
}
```

The small `forward` request shown beside it is useful, but it is not the main table. It proxies SIF keyword ABA history:

```text
POST /soundasia_selection/sif/forward
api=https://www.sif.com/api/search/keyword/abahistory/chart
```

The command fetches both by default:

- `pageQuery`: ASIN list, product title/image, price, rating/reviews, bought-in-past-month, monthly bought history, 7-day rank history, traffic word counts, organic traffic share, AO value, flow source types.
- `forward`: keyword history timeline with search volume and rank movement.

Auth is read from the active browser session. Do not paste or store `X-Access-Token`, cookies, CSRF, XSRF, or JWT values.

## Output

Each normalized ASIN row includes:

- `boughtInPastMonthLowerBound` and `monthlyBoughtHistory`.
- `trafficTerms`: total, natural, SP, brand, video, AC, ER, TR.
- `trafficMix`: `organic_led`, `ad_led`, `ad_augmented`, or `unknown`.
- `rankHistory`: latest/best/worst organic rank plus ad-rank timeline when present.
- `flowResourceTypes`: natural, SP, SB, SBV, rec, and other backend source keys when returned.
- `demandTier`, `recommendedUse`, evidence notes, and cross-check plan.

The `keywordHistory` section summarizes search volume trend and rank trend from the proxied SIF history endpoint.

## Boundary

This is market and competitor evidence only. It can help answer whether a traffic direction is real, which ASINs are winning it, whether competitors rely on paid traffic, and whether the keyword is rising or fading.

It cannot directly create keywords, raise bids, raise budgets, change listing copy, change price, change inventory, or justify replenishment by itself. Cross-check with ABA demand, keyword conversion economics, keyword seasonality, SKU ad proof, listing/price/review fit, inventory, margin, and recent action history before any executable action.
