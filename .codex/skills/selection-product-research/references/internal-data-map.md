# Internal Data Map

Use this map to replace Sorftime-style data requests with `ad-ops-workbench` sources.

## Capability Map

| Sorftime-style need | Internal replacement | Command or skill |
| --- | --- | --- |
| `keyword_detail` | keyword demand, clicks, purchases, CPC/CPA/ACOS | `npm run ops:selection:keyword-conversion -- --keywords "<terms>"` |
| `keyword_trend` | Google trend and market window | `npm run ops:selection:keyword-seasonality -- --search-terms "<terms>"` |
| `keyword_extends` | buyer search-term expansion and candidate terms | `ops:selection:keyword-seasonality`, `ops:selection:keyword-research`, ad customer-search terms |
| `keyword_search_results` | Amazon front-search competitor pool | `npm run ops:selection:keyword-research -- --sku <SKU> --terms "<terms>"` |
| `category_report` | category capacity, BSR, new-release pressure | `npm run ops:selection:extended -- --preset "category-analysis bsr-list new-releases" --category "<category>"` |
| `product_detail` | ASIN identity, title, image, category, traffic detail | `ops:selection:extended -- --preset "asin-info flow-structure" --asin <ASIN>` plus `aicx-amazon-info` |
| `product_reviews` | comment analysis and review samples | `ops:selection:extended -- --preset "comment-analysis" --asin <ASIN>` plus Amazon front-page/browser review fallback |
| `product_traffic_terms` | ASIN traffic keyword structure | `ops:selection:extended -- --preset "flow-structure" --asin <ASIN>` and `ops:selection:product-time-machine` |
| `competitor_product_keywords` | competitor traffic map and ownership | `ops:selection:product-time-machine -- --search-keywords "<terms>"` |
| `product_search` | front-search and BSR/new-release lists | `ops:selection:keyword-research`, `ops:selection:extended` |
| `ali1688_similar_product` | not supported | Do not replace; omit supply-source analysis |

## Freshness Rules

- Selection reports are read-only evidence. Always check `period`, `coverage`, and `opsReadiness`.
- Treat `coverage.missingKeywords` or `coverage.missingSearchTerms` as missing evidence, not zero demand.
- Product Time Machine explains competitor traffic and ranking movement but does not authorize spend.
- For existing SKUs, pair every market conclusion with sellerinventory, daily deposit, ad backend, and listing/front-page fit.

## Boundary

This map supports research, diagnosis, and action candidates only. Writes still require the normal dry-run, execution, readback, logs, and follow-up path.
