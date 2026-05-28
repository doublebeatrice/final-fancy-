# Market Evidence First Operating Pattern

This pattern turns the listing workflow into a general operating rule:

1. Build a competitor or market set from relevance, sales strength, and keyword overlap.
2. Reverse-mine the real traffic structure: keywords, ASINs, search volume, CPC, conversion economics, season window, and related terms.
3. Normalize the evidence through rules: placement, duplicate handling, exclusion, fit, risk, budget boundary, inventory/economics, and follow-up.
4. Generate the final output only after the evidence and rules constrain the action.

The point is not "AI inspiration". The agent should first prove the traffic map, then apply rules, then produce a bounded action.

## Listing Use

For listing work, this means:

- Competitors are selected from product relevance, sales signal, keyword overlap, and buyer intent, not from a casual visual match.
- Reverse-mined keywords are split by role: title, bullet points, description, Search Terms, ad test, avoid, and watch.
- Duplicate control is rule-based. Keep similar terms only when they cover a different buyer wording, modifier, use case, or traffic source.
- Final copy is a constrained result of keyword structure, market evidence, embedding rules, product fit, and competitor strategy.

## Ad Operations Use

Use the same pattern before these operating decisions:

- New keyword creation: find competitor/traffic entrances first, then filter by product fit, market demand, CPC, listing readiness, and existing ad proof.
- Bid-up and budget-up: reverse-read the traffic that is already winning, then expand only where inventory, profit, refund, season window, and recent action history support a controlled test.
- Traffic recovery: identify which competitor or keyword cluster owns the missing demand before increasing spend.
- Product-identity correction: when an old occasion or recipient lane is wrong, close or rename that old structure, but also rebuild the correct receiving structure. For traffic acquisition, use the real product body to open SP auto, manual broad, manual phrase, manual exact, and selected ASIN targeting. Do not treat two precise terms as a complete traffic plan.
- High-efficiency expansion: start from proven terms or targets, then look for adjacent buyer wording, match-type promotion, placement lift, or supported campaign reuse.
- Low-efficiency cleanup: compare wasted spend against market economics and product fit so the system cuts wrong traffic without killing a still-valid product route.
- New-product launch: build the market map before the first ad structure, not after the SKU has already failed.
- Clearance and stagnant inventory: prove the remaining demand window, competitor pressure, and conversion cost before choosing ad spend, discounting, or hold-to-next-season.
- Developer/product replies: answer from market/product evidence and action boundary, not from a single ad metric.

## Required Output

Any agent decision that uses this pattern should preserve:

- Competitor or market pool, with inclusion and exclusion reasons.
- Reverse-mined keyword or ASIN evidence, with source files and freshness.
- Rule decisions: keep, exclude, title/listing role, ad-test role, watch, or blocked.
- Action boundary: evidence-only, dry-run candidate, live-action-ready, listing/product repair first, or manual boundary required.
- `doNotApplyWhen`, so the lesson does not become an unsafe global rule.
- Follow-up checks and the evidence needed to close the loop.

## Guardrails

Selection, ABA, Product Time Machine, keyword conversion, and competitor evidence are read-only evidence layers. They can justify a hypothesis, not a write.

Advertising writes still require action schema, dry-run, execution, landing verification, logs, and effect review.

For structure rebuilds, verification must reach the target layer: created campaigns/ad groups are not enough. Read back keyword rows, auto targets, manual product targets, and ASIN expressions where applicable. If a campaign exists but keyword or target rows are missing, append or repair the lower layer before reporting closure.

Listing, price, inventory, replenishment, and high-impact structure changes remain review-only unless a specific documented auto-executable path exists.

If the operator corrects a decision, freeze reuse of the same rule until `ops:agent:correction-risk` records the correction, scans for the same pattern, and writes a learning patch.
