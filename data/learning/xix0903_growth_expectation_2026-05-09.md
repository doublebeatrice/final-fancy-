# XIX0903 Growth Expectation 2026-05-09

## Baseline

- SKU: XIX0903 / B0DN6PMH1D.
- Product: letter and number stencil set. The cached gift-basket/fiesta profile is stale.
- Inventory: FUL 623, sellable days about 63.
- Sales: 3d 34 units, 7d 72 units, 30d 319 units.
- YoY: positive, not declining. `year_over_year_asin_rate` is about +290%.
- MoM: down about 19.8%, so the issue is recent momentum/traffic, not YoY decline.
- 90d ads: 435,005 impressions, 3,959 clicks, 495 orders, sales 9,487.22, spend 1,276.99, ACOS 13.46%.

## Decision

Treat XIX0903 as a high-inventory growth-repair SKU, not as a simple decline SKU. The action should repair proven lower-layer traffic and protect conversion quality.

Executed 5 low-risk bid actions:

- `asinExpandedFrom=B097CW2WKC`: 0.07 -> 0.08.
- `asin=B0DN6PMH1D`: 0.08 -> 0.09.
- `reusable letter stencils`: 0.30 -> 0.32.
- `letter stencils` in business keyword campaign: 0.43 -> 0.45.
- `number stencil bulk`: 0.22 -> 0.20.

Held for review:

- `asin=B08KDM9R36`: 0.06 -> 0.07. It is directionally reasonable, but the validator blocked it as a high-volume bid change over the 15% safety gate.

Not executed:

- Mixed-SKU SB keyword campaign changes. `sbkw_letterstencils_xix1523 xix0903xix2011` converts, but it is not cleanly attributable to XIX0903 alone.

## Expectations

- 3-day expectation: impressions and clicks on the adjusted ASIN/keyword objects should begin to recover without a sharp ACOS spike.
- 7-day expectation: orders should follow the added traffic; if spend rises without orders, rollback the bid lifts.
- Product-level expectation: 7d ad traffic should improve while SKU-level ACOS remains inside the profit room.
- Downbid expectation: `number stencil bulk` should reduce marginal spend if it continues to attract clicks without enough orders.

## Correction Triggers

- If 7d spend rises faster than orders on the two ASIN target bid lifts, roll them back to the previous bid.
- If `reusable letter stencils` or business `letter stencils` gains clicks but no orders, roll back first; do not expand budget.
- If traffic does not recover on the executed objects after 7 days, investigate campaign state, budget caps, placement, and listing conversion before another bid lift.
- If mixed-SKU SB traffic remains strong, split or rebuild a clean XIX0903-owned SB/SBV structure before scaling it for this SKU.

## Reusable Lesson

For high-inventory SKUs, separate the inventory opportunity from the performance signal:

1. Confirm whether YoY is actually down; do not confuse MoM/ad-row traffic drop with SKU YoY decline.
2. Check 30/60/90-day sales and historical ad-entry performance.
3. Drill into ad groups and search terms before judging whether traffic is missing or conversion is weak.
4. Execute only lower-layer objects with clear SKU ownership and conversion evidence.
5. Every action must carry `hypothesis`, `expectedEffect`, and `reviewPlan` so inventory notes and local logs can be checked against a concrete expectation.
