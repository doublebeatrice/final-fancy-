# Operations Retrospective 2026-05-06 to 2026-05-14

## Verdict

Execution improved, but operating result failed.

The business surface deteriorated from 2026-05-09 to 2026-05-14:

- Sales: 658,869.13 -> 538,423.55.
- Units: 4,353 -> 3,705.
- Net profit rate: 19.31% -> 17.87%.
- Refund rate: 3.51% -> 5.02%.
- ACOS: 17.68% -> 20.66%.

This is not a healthy recovery. The operator cannot claim success only because many actions landed.

## Why It Got Worse

1. Ad cost rose faster than order quality.

ACOS moved from the 17%-18% range to 20.66%. The later actions did not reduce inefficient traffic quickly enough, and some bid-up/opportunity-recovery work happened before there was enough proof that additional traffic would convert.

2. Refund pressure was not treated as a hard traffic gate.

Refund rate rose to 5.02%. High-refund SKUs should have been demoted earlier even if they still had sales or ad opportunities. Profit cannot recover if refund drag is allowed to keep receiving traffic.

3. Old-product decline was not repaired.

Old products continued to drag the total board. The workflow handled many ad entities, but did not force a separate old-product diagnosis: ranking loss, price competitiveness, review/return issue, season tail, inventory mismatch, or ad disconnect.

4. Too many actions were reactive instead of causal.

Several days focused on "what can be adjusted now" rather than "what changed after the last adjustment". The missing loop was: action -> 1d/3d/7d evidence -> keep, rollback, or escalate.

5. Manual-review and candidate clutter reduced decision quality.

Large manual-review pools and non-executable candidate rows created noise. A candidate that cannot be executed must be classified as diagnosis/no-action, not allowed to stay in the same decision pool.

6. Same-SKU repeat push risk was not capped early enough.

On 2026-05-14, some SKUs generated repeated bid-up candidates. The final run limited execution, but the guardrail should have existed before generation: per SKU, per entity type, per day.

## What Worked

- Full-loop execution improved after the user's correction.
- 2026-05-08 landed 109 actions with 0 failed.
- 2026-05-14 landed about 362 source-run actions with 0 failed.
- Budget, bid, pause, and enable actions were all covered instead of only one action type.
- Overbudget stop-loss became visible in the execution set.

## What Failed

- Business outcome failed: sales, units, net profit, refund, and ACOS all moved in the wrong direction by 2026-05-14.
- Daily planning did not consistently put overbudget, high-refund, and old-product decline into the first priority layer.
- Bid-up actions were too easy to generate for opportunity recovery.
- Follow-up was not strict enough: no-order spend after prior actions should have triggered rollback or stricter caps.
- The operator waited for user pressure instead of completing the whole operating loop directly.

## New Operating Rules

1. Daily plan must include overbudget.

Overbudget is not an extra review item. It belongs in the daily plan every day, with three buckets:

- Hard stop: overbudget plus no recent orders or high ACOS.
- Budget shift: overbudget on weak traffic while another campaign/SKU has proven conversion.
- Watch only: overbudget but profitable, stocked, and conversion-stable.

2. Refund is a hard gate.

If a SKU is high-refund and profit is under pressure, do not increase traffic unless there is clear evidence that the refund issue is isolated, historical, or already improving.

3. Opportunity recovery needs proof.

Bid-up or budget-up requires at least one of:

- Proven recent orders with acceptable ACOS.
- Impressions/clicks below normal while conversion history is strong.
- Inventory is healthy and season/node timing supports more traffic.

If spend rises without orders after the last action, do not continue pushing.

4. Same-SKU cooldown is mandatory.

Before any new action, check recent actions on the SKU/entity. Repeat pushes are allowed only when today's evidence shows a new cause, failed landing, or underdelivery with proven conversion.

5. Separate diagnosis from execution.

Every candidate must end in one of three states:

- execute now
- manual diagnosis with explicit reason
- no action with explicit reason

Do not leave unresolved candidates as hidden backlog.

6. Tomorrow's review must judge actions, not only total trend.

For each landed action bucket, compare 1d, 3d, and 7d movement:

- spend
- orders
- ACOS
- sales
- profit/profit rate
- refund rate when SKU-level data exists

The follow-up decision must be keep, rollback, reduce further, or escalate to manual diagnosis.

## Next-Day Closed Loop

On 2026-05-15, run the daily plan in this order:

1. Data health check: raw sales, inventory, ad export, latest snapshot, and dated report.
2. Result check: sales, units, profit, refund, ACOS, ad share, CPC.
3. Risk-first action pool: overbudget, high refund, high ACOS/no orders, low profit.
4. Old-product repair pool: old-product YoY decline split by ad disconnect, conversion decline, inventory, season, and refund.
5. Opportunity pool: only proven converters with healthy inventory and acceptable refund/profit.
6. Execute all approved actions directly.
7. Write follow-up records for every landed action with required 1d/3d/7d review windows.

## Operator Lesson

Do not report progress in small rounds and wait for the user to push the work forward. A daily operating loop is complete only after data health, result diagnosis, risk control, opportunity recovery, execution, and follow-up records are all done.
