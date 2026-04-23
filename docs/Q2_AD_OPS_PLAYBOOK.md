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
- Keep ACOS and ad share under control, but do not cut traffic mechanically when the SKU needs display volume to protect old-product profit recovery.
- Build missing ad structure when it is the practical way to create profitable reach. Creation must be traceable, low-budget first, and verified after launch.
- The operator has released SP ad creation from review-only mode. When evidence supports it, Codex should build rather than only recommend.
- SB is currently adjusted only. Do not create SB campaigns until the real SB creation interface is captured and verified.
- For upcoming seasonal products with low impressions/clicks and inventory moving toward stuck-stock risk, prefer building missing SP coverage aggressively.

Listing:

- Check title, bullets, and long description keyword coverage.
- Combine Q2 search demand and current product demand.
- Listing changes remain review-only in the current automation boundary.

Ads and budget:

- Include SB as a real operating surface.
- Control ACOS by compressing CPC where appropriate.
- Expand long-tail coverage.
- Watch over-budget campaigns.
- For old products in a cooling period, prefer lower bid and wider coverage instead of only cutting traffic.

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

Inventory:

- Potential products should be discussed early for sea-shipping replenishment.
- Sea-shipping lead time is around 30 days.
- If cooling-period trend holds, extra replenishment can be considered.
- Replenishment remains review-only.

## Automation Decision Boundary

Codex may auto-execute low-risk actions when the evidence is clear:

- Small bid increases.
- Small bid decreases.
- Enable or pause on clearly valid supported entities.
- Seven-day untouched low-risk touch actions.
- Low-budget SP ad creation when the operator has explicitly released creation for testing or rollout and the SKU has inventory, margin, and Q2 or old-product recovery rationale.

Codex must send these to review:

- SB creation until the real SB creation interface is captured and verified.
- Structure repair.
- Large bid changes.
- Listing changes.
- Price changes.
- Replenishment decisions.
- Any action where evidence is weak or fields are incomplete.

If Codex cannot judge, output `review`. Do not use old rule logic as fallback.

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
