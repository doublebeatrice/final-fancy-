# Product Market Evidence Stack

This document defines the default evidence stack for product, keyword, listing, developer-request, and ad-opportunity judgement.

The goal is to stop judging products from only the ad backend or inventory backend. A product profile should combine market demand, keyword economics, SKU performance, listing readiness, inventory economics, and action history.

## Default Rule

Whenever a question is about a keyword, product, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or whether a product can be pushed, build a market-backed product profile before deciding.

Do not wait for the operator to explicitly ask for ABA or keyword conversion data when the question depends on market demand or product fit. Use the smallest live source that can answer the question.

When a SKU is in an active window and inventory needs movement, new traffic is required. Expand first from verified order directions: same root terms, same buyer scenario, same audience, and comparable competitor ASINs. Generic terms are only small tests and must not replace the main proven direction.

For holiday/seasonal products, review the product before writing the note: active window, inventory pressure, verified order direction, core traffic coverage, new-traffic path, and listing/price/image conversion support.

## Evidence Layers

1. Keyword research and front-search competitor evidence
   - Use `npm run ops:selection:keyword-research -- --sku "<SKU>" --terms "<terms>"`.
   - Search Amazon front-end results first when the task needs new traffic discovery.
   - Split evidence into direct competitors, scene competitors, traffic-bridge ASINs, excluded ASINs, and candidate keywords.
   - Do not exclude a result only because the category differs. Exclude unrelated buyer intent, products that only share a seasonal node, or products the SKU cannot reasonably carry.
   - Treat every direction as a hypothesis until front-search evidence, ABA, keyword conversion, and SKU/listing fit support it.

2. Market demand and competition
   - Use `npm run ops:selection:aba-search-terms -- --search-terms "<terms>"`.
   - Read ABA rank, search volume, estimated orders, top-ASIN click/conversion share, category path, monopoly, supply-demand pressure, season tags, and freshness.
   - Multiple comma-separated terms are split into separate ABA requests and merged.

3. Keyword seasonality and market window
   - Use `npm run ops:selection:keyword-seasonality -- --search-terms "<terms>"`.
   - Read Google trend timeline, market rank, search volume, ASIN count, competitor price/review/rating threshold, brand concentration, and buyer search-term expansion.
   - Treat this as market-window evidence only. It can support preheat, active-window, tail, and clearance judgement, but it cannot directly trigger ad spend, price, listing, or replenishment actions.

4. Product Time Machine and competitor traffic map
   - Use `npm run ops:selection:product-time-machine -- --search-keywords "<terms>"`.
   - Read keyword-level winning ASINs, bought-in-past-month, monthly bought history, organic rank history, natural/SP/SB/SBV/AC traffic word counts, organic flow share, AO value, and keyword history trend.
   - Treat `POST /soundasia_selection/sif/timemachine/pageQuery` as the useful main table. Treat the nearby `POST /soundasia_selection/sif/forward` keyword history request as an auxiliary trend curve.
   - This source explains competitor demand and traffic structure, but it is still read-only evidence and cannot directly trigger ad spend, listing, price, inventory, or replenishment actions.

5. Keyword conversion economics
   - Use `npm run ops:selection:keyword-conversion -- --keywords "<terms>"`.
   - Read search volume, click volume, purchase volume, click-purchase rate, CPC/CPA/ACOS strategy ranges, missing keywords, and freshness.

6. Extended selection live evidence
   - Use `npm run ops:selection:api -- --endpoint "<front-end api path>" --method GET|POST --query "site=1" --body-file <payload.json>` when a needed selection page has an exposed read-only API but no specialized parser yet.
   - Use `npm run ops:selection:extended -- --preset "home-overview asin-info association-flow ad-placement comment-analysis flow-structure" --asin "<ASIN>" --site 1 --date-info "<YYYY-MM>"` for the stable product-level preset layer.
   - Use `npm run ops:selection:extended -- --preset "bsr-list new-releases" --site 1 --rank-page-size 20` for stable BSR and new-release daily rank evidence; the runner resolves the latest available rank date automatically when `--rank-date` is omitted.
   - Use `npm run ops:selection:extended -- --preset "category-analysis" --category "<Amazon category name>" --site 1 --category-page-size 20` for stable category capacity and product-type evidence; the runner resolves the latest available category-analysis week automatically when `--category-date` is omitted.
   - Use `npm run ops:selection:extended -- --preset "flow-theme-tags store-feedback" --site 1 --date-info "<YYYY-MM>" --search-term "<term>" --feedback-page-size 20` for stable traffic-theme and store-quality evidence.
   - Use `--account-name` plus `--account-id` when store feedback needs account-specific top ASINs, category concentration, new-ASIN list, feedback trend, or ASIN-count trend.
   - The generic caller runs inside the logged-in selection browser session, automatically prefixes `/soundasia_selection` for front-end API paths, writes a JSON snapshot, and blocks likely write endpoints by default.
   - Agent effect review and SKU operating review absorb `selection_extended_evidence` as `productSelection` when ASIN evidence is available.
   - KPI checkpoint and month digest absorb the same extended report as `selectionKpiEvidence` when `--extended-selection-report` is supplied.

7. Product and listing fit
   - Use listing title, bullets, images, product profile, category, price, rating, reviews, return risk, and product theme.
   - Confirm that the keyword or market actually belongs to the product, not only to an adjacent market.

8. SKU-level ad backend proof
   - Use the smallest ad read path: SKU summary, SKU ad product rows, ad group rows, campaign placement, or customer-search terms.
   - Read CTR, CVR, CPC, ACOS, spend, sales, orders, impressions/click trend, campaign budget/state, and recent action history.

9. Inventory and economics
   - Check inventory days, stuck-stock risk, net profit or usable margin fields, refund pressure, active season window, and replenishment/clearance context.
   - For SKU product-analysis base data, use `node scripts\execute\fetch_product_analysis_query2.js --sku <SKU> --date <YYYY-MM-DD>` against sellerinventory `/kernel/productAnalysis/query2`. It returns product identity, monthly reference-profit buckets, 12/13-month totals, FBA inventory, purchase cost, and 30-day sales. The monthly `refer_profit*` fields lag by one closed month; use daily deposit, sales-core, and ad backend data for current-month profit.
   - Product-analysis inventory amount should be computed as `fba_inv * cost_price` when the raw `inventory_amount` is zero but the frontend shows the calculated value. Inventory pressure can be estimated as `fba_inv / sales_30 * 30` when `sales_30 > 0`.
   - Split stock into FBA fulfillable/reserved, Amazon inbound, local good/available stock, local pending/test stock, and FBAPlan air/sea quantities. Do not treat them as one pool.
   - For developer-facing replenishment, only local good/available stock with no existing FBAPlan supports "arrange FBA". Amazon inbound, pending/unarrived local stock, test warehouse stock, and existing FBAPlan air/sea quantities are pipeline evidence, not a request to development to chase or repeat.
   - Before recommending purchase or replenishment, read product season/node and MOQ/minimum-order economics. For Mexican / Cinco de Mayo / Fiesta / Pinata products, the main U.S. traffic window is preheat through May 5; after May 5 treat replenishment as tail/off-season unless current market evidence proves otherwise. Do not extrapolate the last 30 days across the node peak into a fresh MOQ purchase.
   - If MOQ is missing from the current export, mark replenishment as blocked for MOQ confirmation instead of assuming the SKU can absorb a small purchase. If MOQ exists, compare MOQ against recent daily unit velocity and the active-season window; hold replenishment when the MOQ cannot be consumed before the node tails off.

10. Decision and execution boundary
   - Keyword research, ABA, keyword seasonality, Product Time Machine, and keyword conversion are evidence only. They can support a hypothesis, but cannot directly create keywords, raise bids, raise budgets, or change listing/price/inventory.
   - Supported ad actions still require dry-run, execution, landing verification, notes/logs, and follow-up.

## When This Stack Is Mandatory

Use this stack for:

- A named keyword or keyword set.
- A named SKU, ASIN, product name, or Amazon listing.
- Developer/product requests such as "can this be pushed", "why no exposure", "add keywords", "new product traffic", "listing change", or "season node".
- Keyword creation, keyword expansion, bid-up, budget-up, and traffic recovery.
- Product-selection or product-line assessment.
- Ad performance that may be caused by market demand, listing conversion, price, reviews, seasonality, or product mismatch.

Use a narrower path only when the question is purely technical, such as whether a known API call landed.

## Operating Interpretation

Strong ABA demand plus weak SKU ad performance means "diagnose product/listing/ad fit", not "increase spend automatically".

Strong keyword conversion proof plus weak ABA demand means "cost looks usable, but the market may be niche or stale".

Strong ABA and keyword conversion proof plus strong SKU fit means "candidate for controlled ad test or expansion", still subject to inventory, profit, refund, and execution checks.

Weak ABA plus weak keyword conversion proof means "hold, research only, or find adjacent terms", even if inventory exists.

High inventory alone does not justify traffic expansion. A SKU with stock still needs market demand, product fit, and conversion proof.

Existing replenishment pipeline alone does not justify a developer request. If a SKU already has Amazon inbound, local pending/unarrived stock, or FBAPlan air/sea quantities, say there is no developer-side action unless local good/available stock can actually be newly arranged.

Seasonal tail risk overrides simple inventory-gap math. A low FBA count after the season peak is not by itself a replenishment signal; first ask whether the remaining demand window can consume MOQ without creating stale inventory.

## Internalized Operating Models

`src/selection_operating_intelligence.js` is the shared interpretation layer for selection evidence. SKU reviews and agent effect reviews now use it to turn raw selection sources into daily operating signals:

- front-search competitor validation: direct competitors, scene competitors, traffic-bridge ASINs, and excluded ASINs.
- low-monopoly market: visible rank/demand with low AO, low brand concentration, and low top-click concentration.
- low-supply market: low product count or favorable supply-demand shape.
- new-product survival room: new-ASIN share or new-ASIN sales share is meaningful.
- seasonal or trend market: market cycle, quarter ratio, Google trend direction, new/rising keyword flags.
- price-room market: average market price supports a margin/differentiation review.
- listing-quality gap: low A+ or video penetration means page quality can be a lever.
- review-upgrade opportunity: demand exists but market rating is weak.
- seller-type opening: FBM share, China-seller share, or Amazon self-share indicates a possible entry angle.
- long-tail precision: 3+ word terms are treated as controlled validation lanes, not broad spend.
- competitor traffic map: Product Time Machine contributes competitor bought history, organic/ad traffic mix, AO, organic flow share, and rank movement.
- conversion economics: keyword conversion adds CPC/CPA/ACOS and purchase-proof checks.
- product-level selection evidence: stable ASIN info, association-flow, ad-placement, category-analysis, BSR/new-release rank rows, comment-analysis, traffic-detail, flow-theme-tags, and store-feedback snapshots are attached as read-only `productSelection` or `selectionKpiEvidence` for ASIN/SKU/KPI diagnosis.
- stable capability wrapper: `npm run ops:selection:operating-intelligence -- --sample` or the same command with report-file arguments turns the five selection layers into one read-only capability report. It returns `capabilityId`, `decisionQuality`, `recommendedOperatingUse`, `sourceCoverage`, `opportunityModels`, `riskSignals`, `missingEvidence`, `analysis`, and `capabilitySummary`.

The module always marks selection intelligence as `readyForAutoAction: false`. These signals improve product judgement and daily review quality, but write actions still need the normal dry-run, execution, and landed verification path.

## Output Shape

For product or keyword judgement, include:

- Product/keyword identity and intended buyer/use case.
- Market evidence from ABA if demand or competition matters.
- Seasonality evidence when timing, replenishment, clearance, or window risk matters.
- Product Time Machine evidence when competitor ASIN ownership, traffic mix, organic rank movement, or bought-history matters.
- Keyword conversion economics if spend or keyword expansion matters.
- SKU/listing/inventory evidence.
- Replenishment actionability: whether local good/available stock exists, whether FBAPlan air/sea already exists, whether MOQ and node window support consumption, and whether the developer has a real next action.
- What is executable now, what is only a hypothesis, and what is blocked.
- Next checkpoint and what to verify.
- Stable capability detail: the wrapper keeps the boundary read-only, accepts normalized report files or derived terms, and separates `analysis` from `operatingIntelligence` so the caller can inspect the score model, source coverage, and follow-up commands without risking a write path.

For developer-facing replies, keep the detailed evidence in the operator summary and write a short natural reply that says product judgement, action/status, and follow-up.

## Current Gaps

- ABA trend/history is not yet wired beyond the current selected period.
- ASIN-mode ABA interpretation is not yet specialized.
- Account-specific store feedback detail needs an `accountId`; without it the stable preset still returns the store list total and available site evidence.
- Flow theme tags are stable for the theme table, theme dimensions, and optional search-term base-word matching; deeper keyword-bidding and custom tag write paths remain outside the read-only preset.
- Daily SKU operating review and agent effect review now consume the internalized selection stack, including extended `productSelection`, when the report files are present.
- Cross-source product-profile assembly still depends on available live report files; missing sources are surfaced as `missingEvidence` instead of being silently ignored.
