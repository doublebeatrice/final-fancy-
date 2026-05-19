# Product Market Evidence Stack

This document defines the default evidence stack for product, keyword, listing, developer-request, and ad-opportunity judgement.

The goal is to stop judging products from only the ad backend or inventory backend. A product profile should combine market demand, keyword economics, SKU performance, listing readiness, inventory economics, and action history.

## Default Rule

Whenever a question is about a keyword, product, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or whether a product can be pushed, build a market-backed product profile before deciding.

Do not wait for the operator to explicitly ask for ABA or keyword conversion data when the question depends on market demand or product fit. Use the smallest live source that can answer the question.

## Evidence Layers

1. Market demand and competition
   - Use `npm run ops:selection:aba-search-terms -- --search-terms "<terms>"`.
   - Read ABA rank, search volume, estimated orders, top-ASIN click/conversion share, category path, monopoly, supply-demand pressure, season tags, and freshness.
   - Multiple comma-separated terms are split into separate ABA requests and merged.

2. Keyword conversion economics
   - Use `npm run ops:selection:keyword-conversion -- --keywords "<terms>"`.
   - Read search volume, click volume, purchase volume, click-purchase rate, CPC/CPA/ACOS strategy ranges, missing keywords, and freshness.

3. Product and listing fit
   - Use listing title, bullets, images, product profile, category, price, rating, reviews, return risk, and product theme.
   - Confirm that the keyword or market actually belongs to the product, not only to an adjacent market.

4. SKU-level ad backend proof
   - Use the smallest ad read path: SKU summary, SKU ad product rows, ad group rows, campaign placement, or customer-search terms.
   - Read CTR, CVR, CPC, ACOS, spend, sales, orders, impressions/click trend, campaign budget/state, and recent action history.

5. Inventory and economics
   - Check inventory days, stuck-stock risk, net profit or usable margin fields, refund pressure, active season window, and replenishment/clearance context.

6. Decision and execution boundary
   - ABA and keyword conversion are evidence only. They can support a hypothesis, but cannot directly create keywords, raise bids, raise budgets, or change listing/price/inventory.
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

## Output Shape

For product or keyword judgement, include:

- Product/keyword identity and intended buyer/use case.
- Market evidence from ABA if demand or competition matters.
- Keyword conversion economics if spend or keyword expansion matters.
- SKU/listing/inventory evidence.
- What is executable now, what is only a hypothesis, and what is blocked.
- Next checkpoint and what to verify.

For developer-facing replies, keep the detailed evidence in the operator summary and write a short natural reply that says product judgement, action/status, and follow-up.

## Current Gaps

- ABA trend/history is not yet wired beyond the current selected period.
- ASIN-mode ABA interpretation is not yet specialized.
- The daily ops orchestrator does not automatically attach this full evidence stack to every candidate yet.
- Cross-source product-profile assembly is still operator/agent-driven rather than one unified report command.
