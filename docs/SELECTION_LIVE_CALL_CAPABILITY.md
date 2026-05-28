# Selection Live Call Capability

Date checked: 2026-05-25.

## Reality Check

The logged-in selection backend is reachable through the fixed Chrome debug session. `scripts/execute/ensure_backend_login.js` confirmed selection health with a valid access token and successful read checks.

The earlier wording should be read precisely:

- Stable normalized adapters exist for keyword conversion, ABA search terms, keyword seasonality/analysis-search-term, keyword research, and Product Time Machine.
- Many more selection pages are technically callable because their front-end modules expose read-only API paths.
- Those extra pages should enter daily operations through `ops:selection:api` first, then get page-specific normalizers when the data shape proves useful.

## Generic Read-Only Caller

Use:

```powershell
$payload = Join-Path $env:TEMP 'selection_payload.json'
Set-Content -LiteralPath $payload -Value '{"site":1,"pageNo":1,"pageSize":20}' -Encoding UTF8
npm run ops:selection:api -- --endpoint "/categoryAnalysis/listProfitCategory" --method POST --body-file $payload
```

Behavior:

- Runs in the logged-in selection browser tab and uses the page access token.
- Prefixes front-end API paths with `/soundasia_selection`.
- Writes a JSON snapshot under `data/snapshots/` unless `--out` is provided.
- Blocks likely write endpoints such as save, update, delete, upload, import, export, download, collect, batch, edit, create, add, remove, and hide unless explicitly overridden.

## Extended Preset Runner

Use this when a product/SKU/ASIN review needs the stable product-level selection pages without writing a raw payload each time:

```powershell
npm run ops:selection:extended -- --preset "home-overview asin-info association-flow ad-placement comment-analysis flow-structure" --asin B0GWD724Y8 --site 1 --date-info 2026-04
npm run ops:selection:extended -- --preset "bsr-list new-releases" --site 1 --rank-page-size 20
npm run ops:selection:extended -- --preset "category-analysis" --category "Beauty & Personal Care" --site 1 --category-page-size 20
npm run ops:selection:extended -- --preset "flow-theme-tags store-feedback" --site 1 --date-info 2026-04 --search-term "christmas" --feedback-page-size 20
npm run ops:selection:extended -- --preset "store-feedback" --site 1 --date-info 2026-04 --account-name "Pattern." --account-id A2EJCTH67GJMT3 --feedback-page-size 20
```

Stable presets currently implemented:

- `home-overview`: selection data readiness and total ASIN/search-term scale via `/analysis/index/getHeadData`.
- `asin-info`: ASIN identity/basic attributes via `/analysis/searchTermByAsin/getInfoByAsin`.
- `association-flow`: related product-page traffic via `/asin/related/listAsin`.
- `ad-placement`: target detail-page advertising-slot ASINs via `/asin/related/listAsin` with advertising search type.
- `category-analysis`: category capacity, product-type shape, return ratio, seller/new-ASIN pressure, review/rating, ad-spend, and top/new-product aggregate evidence via `/categoryAnalysis/listProfitCategory`. It must be called with `--category`.
- `bsr-list`: BSR daily rank table and overview via `/bsrcategory/brand/list` and `/bsrcategory/brand/queryBrandIndicator`.
- `new-releases`: new-release daily rank table and overview through the same rank endpoints with `categoryType=2`.
- `comment-analysis`: comment count, variant comment/rating summary, cached comment analysis, comment type, and comment sample via the ASIN comments analysis endpoints. `getCommentsNumByYM` is still excluded because the live probe returned a backend null-pointer error.
- `flow-structure`: ASIN traffic keyword detail via `/analysis/searchTermByAsin/getDetailByAsin`.
- `flow-theme-tags`: traffic theme table via `/themeTags/listABAStThemeNew`, theme dimensions via `/themeTags/listAllThemeChByTime`, and optional matched base words via `/themeTags/listABAMatchWord` when `--search-term` is supplied.
- `store-feedback` / `feedback`: store feedback account list with total, available sites, and optional account detail via `/sellAccount/feedback/*`. Month input is normalized to `YYYY-MM-01`; account-specific detail needs `--account-id`. `/queryAccountNum` is available only behind `--include-feedback-account-num 1` because the default list path already returns total and the backend often replies "no need to query total".

For BSR, new-release, and category-analysis presets, the runner resolves the latest available US date/week from `/brandAnalytics/usBrandAnalytics/getSiteDateNew` when an explicit date is not provided. This avoids false failures when today's or yesterday's data has not landed yet.

The runner emits `selection_extended_evidence` snapshots with `evidenceBoundary=selection_read_only_market_evidence` and `readyForAutoAction=false`. `src/agent_review_evidence.js` and `src/sku_operating_review.js` absorb those snapshots as `productSelection` when an ASIN is present. `scripts/execute/generate_kpi_recovery_checkpoint.js` and `scripts/execute/generate_month_kpi_operator_digest.js` can also consume the same snapshot through `--extended-selection-report`, where it becomes `selectionKpiEvidence`.

If a page is discovered but not normalized yet, keep it behind `ops:selection:api` until its payload shape is stable. Flow theme tags and store feedback have now moved out of that bucket and are stable read-only presets.

## Stable Adapters

| Function | Command | Main live source |
| --- | --- | --- |
| ABA search terms | `npm run ops:selection:aba-search-terms` | `/soundasia_selection/searchTerm/lastDay/list` |
| Analysis search term / seasonality | `npm run ops:selection:keyword-seasonality` | Google trend, overview, ASIN competition, buyer search-term endpoints |
| Keyword conversion economics | `npm run ops:selection:keyword-conversion` | Keyword conversion endpoint |
| Product Time Machine | `npm run ops:selection:product-time-machine` | `/soundasia_selection/sif/timemachine/pageQuery` and `/soundasia_selection/sif/forward` |
| Front-search keyword research | `npm run ops:selection:keyword-research` | Amazon front search through CDP, then internal classification |
| Extended product selection presets | `npm run ops:selection:extended` | Home overview, ASIN info, association flow, ad placement, category analysis, BSR/new-release daily ranks, comment analysis, ASIN traffic detail, flow theme tags, and store feedback endpoints |

## KPI Service Use

For daily KPI recovery, generate one read-only selection evidence pack and pass it into KPI artifacts:

```powershell
npm run ops:selection:extended -- --preset "bsr-list new-releases flow-theme-tags store-feedback" --site 1 --date-info 2026-04 --rank-page-size 20 --flow-theme-page-size 20 --feedback-page-size 20 --out data\snapshots\selection_kpi_evidence_2026-05-25.json
npm run ops:kpi:checkpoint -- --date 2026-05-25 --extended-selection-report data\snapshots\selection_kpi_evidence_2026-05-25.json
npm run ops:kpi:digest -- --date 2026-05-25 --extended-selection-report data\snapshots\selection_kpi_evidence_2026-05-25.json
```

`selectionKpiEvidence` is used for KPI diagnosis only: market pressure, category opportunity, traffic theme direction, and store-quality risk. It is never auto-write permission.

## Exposed Selection Pages

These were found from the live selection front-end chunks on 2026-05-25. Stable rows are already covered by `ops:selection:extended`; the rest are callable through the generic API caller but still need page-specific payload presets and normalizers before they should be treated as polished reports.

| Page | Useful API paths observed | Operating value |
| --- | --- | --- |
| BSR榜单 | `/bsrcategory/brand/list`, `/bsrcategory/brand/queryBrandIndicator`, `/analysis/usSearchTermRank/listOtherByAsin` | category ranking, new ASIN/rank pressure, category concentration |
| 新品榜单 | `/bsrcategory/brand/list`, `/bsrcategory/brand/queryBrandIndicator`, `/analysis/usSearchTermRank/listOtherByAsin` | new-product survival room and fast-rising ASIN discovery |
| 类目分析 | `/categoryAnalysis/listProfitCategory`, `/categoryAnalysis/getOneProfitCategory` | category capacity, price/review/rating shape, top ASIN/category diagnostics |
| 流量选品 | `/analysis/usSearchTermRank/listNew`, `/analysis/usSearchTermRank/pageStatAll`, `/analysis/usSearchTermRank/getMetricAverage`, `/analysis/usSearchTermRank/queryIndicatorRange` | broad product/market mining and listing-quality gap evidence |
| 分析产品 | `/asin/analysis/getTopVarAsins`, `/analysis/searchTermByAsin/getInfoByAsin`, `/asin/analysis/getABACountsByAsin`, `/asin/analysis/getABAStByAsin`, `/asin/analysis/getLoseStByAsin`, `/asin/analysis/getCompeteDataByAsin`, `/asin/analysis/getAllStByjzAsin`, `/asin/analysis/getOverLapStByAsin`, `/analysis/searchTermByAsin/getBuyerStByAsin` | product-level traffic, missing keywords, overlap keywords, competitor keyword map |
| 评论分析 | `/asinComments/analysis/getCountByAsinComments`, `/asinComments/analysis/getCommentsAnalysis`, `/asinComments/analysis/queryAsinCommentsList`, `/asinCommentsMysql/analysis/getGPTDataForComments`, `/asinComments/analysis/getCommentAnalyData` | review pain points, rating trend, feature complaints, conversion blockers |
| 关联流量 | `/asin/related/listAsin`, `/asin/related/listAsinDetail`, `/asin/related/statVo` | related product-page traffic, free/paid association mix, detail-page adjacency |
| 流量结构 | `/themeTags/listABAStThemeNew`, `/themeTags/listAllThemeChByTime`, `/themeTags/listABAMatchWord`, `/analysis/searchTermByAsin/getDetailByAsin`, `/keyword/pcpCategory` | ASIN/variant traffic word mix and paid/natural/label structure |
| 店铺 Feedback | `/sellAccount/feedback/listByES`, `/sellAccount/feedback/queryAccountNum`, `/sellAccount/feedback/getOneCategoryAndAccountNum`, `/sellAccount/feedback/getTopAsinByAccount`, `/sellAccount/feedback/getCategoryNumByAccount`, `/sellAccount/feedback/getNewAsinByAccount`, `/sellAccount/feedback/getFeedbackData`, `/sellAccount/feedback/queryIndicatorByAccount` | seller quality, store/category concentration, top ASIN and feedback trend |

## Operating Boundary

Selection live calls are market evidence. They can improve product judgement, SKU review, launch diagnosis, and daily operating quality. They still do not directly authorize ad creation, bid/budget changes, listing edits, price edits, or inventory/replenishment actions.
