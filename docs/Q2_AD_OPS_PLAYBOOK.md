# Q2 Ad Ops Playbook

This document records verified operating context provided by the operator. Codex uses it as decision context when producing action schemas.

## Q2 Work Priorities

## KPI Operating Target

The KPI file `docs/2025年半精品销售季度KPI考核 - 组员.xlsx` has been read and is now part of Codex operating context.

For group-member KPI, the advertising workflow must optimize for:

- Old-product average net profit year-over-year growth.
- Net profit rate.
- Ad share control, with the normal old-product full-score line at ad share <= 8%.
- Stuck-stock ratio control, with the full-score line at stuck-stock ratio <= 3%.
- New-product period profit, success rate, and ad share, with the normal new-product full-score line at ad share <= 11%.

This changes the default operating stance:

- Do not equate low sales with bad product quality. Low sales may mean weak ad coverage.
- For in-stock and profitable SKUs, Codex should inspect whether traffic coverage can profitably be expanded.
- For Q2-relevant products with inventory and margin, prefer active coverage repair over passive review.
- For Q2 or holiday-relevant products, if current `adv /product/chart` shows impressions and clicks absolute values trending down inside the active selling window, prefer traffic recovery / push analysis before mechanical ACOS compression.
- Keep ACOS and ad share under control, but do not cut traffic mechanically when the SKU needs display volume to protect old-product profit recovery.
- Build missing ad structure when it is the practical way to create profitable reach. Creation must be traceable, low-budget first, and verified after launch.
- Build missing SP structure with a reuse-first rule: if the SKU already has a reusable same-lane SP ad group, add traffic there through bid/budget/placement/enable or target append instead of creating another campaign/ad group. Same lane means keyword `BROAD`/`PHRASE`/`EXACT`, `auto`, or product targeting such as `ASIN_SAME_AS` / `ASIN_EXPANDED_FROM`; keyword append cannot cross lanes, so `BROAD` terms do not go into a `PHRASE` ad group.
- New SP create actions must use identical campaign/ad-group names in the `ai_` format: `ai_auto_<term>_<sku>`, `ai_kw exact|phrase|broad_<term>_<sku>`, `ai_asin_<term>_<sku>`, or `ai_asin expanded_<term>_<sku>`. Preserve spaces inside buyer-facing terms and keep mode/date tokens out of the term body.
- The operator has released SP ad creation from review-only mode. When evidence supports it, Codex should build rather than only recommend.
- SP keyword creation is allowed only after product-theme isolation. Do not create phrase groups from raw product-profile fragments, naked category/audience words, or internal labels. If fewer than three specific buyer-facing search phrases survive filtering, send the SKU to review instead of creating a keyword group.
- SB is currently adjusted only. Do not create SB campaigns until the real SB creation interface is captured and verified.
- For upcoming seasonal products with low impressions/clicks and inventory moving toward stuck-stock risk, prefer building missing SP coverage aggressively.
- For keyword, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or product-push questions, use `docs/PRODUCT_MARKET_EVIDENCE_STACK.md`. Product judgement should combine market demand, keyword economics, SKU ad proof, listing/price fit, inventory/economics, and action history instead of relying only on ad or inventory rows.

## Daily Operating Guardrails

The 2026-05-14 operating retrospective is part of this playbook: `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md`.

Q2 growth work must still pass these daily guardrails:

- Do the full loop directly; do not stop after small staged rounds and wait for the operator to push.
- Judge the business surface before celebrating execution: sales, units, net profit rate, refund rate, ACOS, ad share, and CPC.
- Include overbudget in every daily plan. Classify it as hard stop, budget shift, or watch-only.
- Treat refund pressure as a hard traffic gate for low-profit SKUs.
- Require proof before opportunity recovery: recent acceptable orders, proven traffic underdelivery, inventory support, and season/node fit.
- Do not repeat-push the same SKU/entity without recent-history review and new evidence.
- Close every candidate as execute, manual diagnosis with reason, or no-action with reason.

Listing:

- Check title, bullets, and long description keyword coverage.
- Combine Q2 search demand and current product demand.
- Seasonal title edits can be auto-submitted only under `docs/SEASONAL_LISTING_COPY_RULES.md`: non-top-50 SKU, strong product-event evidence, clean dry-run, and current external verification when using year-specific event/theme wording. Non-seasonal listing edits, high-sales SKUs without operator approval, and low-evidence changes remain review-only.

Ads and budget:

- Include SB as a real operating surface.
- Control ACOS by compressing CPC where appropriate.
- Expand long-tail coverage.
- Watch over-budget campaigns.
- For old products in a cooling period, prefer lower bid and wider coverage instead of only cutting traffic.
- Use selection keyword conversion data as a pre-spend keyword quality check. Strong market keyword evidence can support exact/phrase candidates, but the action still requires SKU-level ad backend proof, product-theme fit, listing/price readiness, inventory support, and cross-validation with ABA or reverse-search tools.
- Use selection ABA search-term data as a market demand/concentration check before product-selection or keyword-expansion decisions. High ABA demand can justify deeper SKU-fit review, but it must not create ads or raise spend without keyword conversion cost proof and SKU-level performance proof.
- Use selection keyword seasonality data as a market-window check before seasonal product, replenishment, clearance, or keyword-window decisions. Strong seasonality can justify preheat or tail-risk review, but it must not create ads, raise spend, change price, or trigger replenishment without SKU-level fit, inventory, profit, ABA, and keyword-conversion proof.

Inventory:

- Consider price increases during profit-harvest windows.
- Consider sea-shipping replenishment for potential products.
- Price and replenishment actions remain review-only in the current automation boundary.

## Seasonal Timeline

April:

- Before 4/15: finish gift listing optimization.
- 4/15 to 4/20: finish ad keyword optimization.
- Old products: target weekly 30+ clicks.
- New products: target weekly 30+ clicks by 4/20.
- Focus: teacher appreciation, nurse week, christian, inspirational, graduation, summer head old products, and potential new products.

May:

- Before 5/12: profit harvest and seasonal stuck-stock review.
- Christian regular products: prepare Father's Day inventory.
- 5/12 to 5/16: graduation listing optimization.
- Review high graduation inventory.

June:

- Graduation season.
- Summer high-stock review.
- Christian Father's Day profit harvest.

## Old Product Decline Policy

For potential traffic expansion:

- Sales greater than 50.
- Sellable days greater than 30.
- Ad share below 5%.
- Review or push ad share toward above 7% when risk is acceptable.

Listing:

- For previous-year products with 200+ reviews, analyze review language.
- Adjust bullet priority and keyword embedding.
- This remains review-only.

Ads:

- Use early promotion and traffic push where needed.
- Try to keep cooling-period year-over-year decline within 20%.
- Early period preference: low bid and high coverage.
- Do not blindly reduce bids on old products whose display volume drives total old-product sales recovery.
- For seasonal products, `traffic trend` is now a first-class judgment input: if season is active, inventory is healthy, and `/product/chart` confirms impression/click decline, traffic recovery can outweigh old downbid history.

## Traffic Trend Evidence

`POST /product/chart` is now an official decision input, not an optional reference.

Use it to answer:

- Is the SKU losing traffic or losing conversion?
- Is a seasonal SKU in-window but under-exposed?
- Should this SKU get stronger push instead of another cut?

Priority rule:

1. Current seasonal window.
2. Inventory capacity.
3. `/product/chart` impression / click trend.
4. Listing readiness.
5. Cost efficiency metrics such as ACOS / ad share.

This means a seasonal SKU with sufficient inventory and falling impressions/clicks may deserve a stronger push even if historical notes contain earlier downbid actions.

## Window-Stage SKU Ad Scale Loop

When a named SKU is in an active season, event, or traffic window and inventory/profit can carry demand, Codex should complete the traffic-building loop instead of returning isolated bid suggestions.

1. Compare current vs prior evidence: business date, data date, sales/unit trend, impressions/clicks, ACOS, ad share, CPC, inventory days, profit room, refund pressure, and recent action history.
2. Read the live structure: SKU summary, `/product/chart`, SKU ad-product breakdown, relevant ad-group rows, SP group detail, and customer-search terms. Treat auto/customer-search rows as discovery and manual SP/SB rows as controlled capture.
3. Convert evidence into lanes:
   - Core product and attribute terms go into exact first, then phrase or broad only when evidence supports wider capture.
   - Event or seasonal terms should be isolated into their own SP exact, phrase, and broad lanes instead of being mixed into old core groups.
   - Broad and generic event terms are allowed, but only in separate low-bid, small-budget exploration lanes with next-cycle search-term review.
4. Add customer-search terms when the term is product-relevant: converting terms should be added or restored into manual exact, clicked relevant terms can be low-bid exact tests, and generic no-order terms should usually stay out unless the hypothesis explicitly needs exploration.
5. Balance bids from evidence: raise true high-efficiency rows with recent orders, low ACOS, product relevance, and no same-day opposite adjustment; lower or hold cost-heavy rows; avoid same-day reversals unless new evidence justifies them.
6. Add budget only to capped winners. If the campaign is not budget-capped, repair bid, match type, structure, or missing traffic capture before increasing budget.
7. Finish with action schema or controlled append payload, dry-run where supported, execution, live landed-row refetch, and landed-action conflict audit. The handoff should list changed entities, evidence, artifact files, and the next checkpoint.

Inventory:

- Potential products should be discussed early for sea-shipping replenishment.
- Sea-shipping lead time is around 30 days.
- If cooling-period trend holds, extra replenishment can be considered.
- Replenishment remains review-only.

## Automation Decision Boundary

Codex should execute supported advertising actions when it has a defensible profit/KPI hypothesis. The operating model is not to avoid risk; it is to create explicit hypotheses, act, verify landing, and use the next daily data cycle to learn or correct.

Codex may auto-execute:

- Small bid increases.
- Small bid decreases.
- Enable or pause on clearly valid supported entities.
- Seven-day untouched low-risk touch actions.
- Low-budget SP ad creation when the operator has explicitly released creation for testing or rollout and the SKU has inventory, margin, and Q2 or old-product recovery rationale.
- Budget, placement, bid, create, pause, or other supported advertising experiments with explicit Codex approval.
- Higher-risk supported ad actions when marked `forceExecute: true` and accompanied by hypothesis, expected effect, measurement window, and rollback condition.

SP `create` is not the first answer when urgent display/click recovery is needed. Prefer broad match, auto, and expanded ASIN discovery lanes for exposure recovery; exact-match pushes are for proven converting terms and should not consume the main recovery budget by default. If an existing same-lane ad group is available, reuse it before creating another structure, but do not mix keyword match types inside a differently named lane. Duplicate structures require an explicit override and reason.

Codex must send these to review:

- SB creation until the real SB creation interface is captured and verified.
- Structure repair.
- Non-seasonal listing changes, and seasonal title edits that fail `docs/SEASONAL_LISTING_COPY_RULES.md`.
- Price changes.
- Replenishment decisions.
- Unknown/out-of-scope entities, incomplete fields, missing verification mapping, or unsupported write surfaces.

If Codex cannot judge a supported advertising action perfectly, it should still choose the best profit/KPI action, approve it explicitly, and let the daily closed loop evaluate the result. Do not use old rule logic as fallback, and do not count API success as success unless landing verification passes.

Known 2026-05-12 exception: SP campaign `enable` is a technical not-landed issue. It should be fixed in automation or reported as `not_landed`, not treated as a manual-review business decision.

## Seven-Day Untouched Lessons

Verified lessons from the seven-day untouched work:

- SP seven-day untouched product rows may be candidates rather than directly writable execution entities.
- Candidate rows must be resolved to real writable keyword, target, ad group, or campaign entities before execution.
- SB seven-day untouched campaign rows can enter the execution pool, but entity-level write support still depends on the row fields available.
- 403 recent-system-adjust responses must be treated as blocked by recent system action, not as retryable normal failures.
- Paused, archived, disabled, incomplete, or otherwise invalid entities must be skipped or reviewed instead of forced.
- When a product is declining but still needs display volume, seven-day ACOS alone is not enough reason to cut bids.

## Verified Q2 Full Test

On 2026-04-23 a full Q2-oriented test used:

- Product cards: 434
- SP keyword rows: 7076
- SP auto rows: 1595
- SP manual target rows: 1843
- SB keyword rows: 3610
- SB target rows: 31
- Inventory rows: 722
- SP seven-day untouched rows: 3
- SB seven-day untouched rows: 8

Result:

- 7 low-risk actions executed.
- 7 API calls succeeded.
- 7 results verified as landed.
- 7 inventory notes succeeded.
- 3 review-only actions wrote review notes.
- 0 API 403 blocks.
- 0 verification misses.
