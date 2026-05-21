# SKU Lesson System

This document defines how SKU-level operating lessons are recorded, reused, and reconciled when they conflict. It is not a daily task log. It is the decision-memory layer that helps the operator avoid repeating the same mistake on similar SKUs while still preventing unsafe over-generalization.

## Layer Model

Use four different layers for four different jobs:

| Layer | Location | Job | Not Enough For |
|---|---|---|---|
| Operating memory | `memory.md` | Long-lived default rules and red lines | Detailed daily evidence |
| Daily learning | `data/learning/daily_learning_<date>.json/md` | What happened today, what was expected, what needs follow-up | Universal rules |
| Retrospective | `data/learning/operations_retrospective_*.md` or focused review files | Patterns proven across days or repeated cases | Per-SKU evidence |
| SKU lesson | `data/learning/sku_lessons/` | Reusable decision unit with scope, evidence, transfer boundary, and conflict status | Blind automation |

A daily SKU review is incomplete if it produces a verdict but does not leave a reusable lesson or an explicit statement that no reusable lesson was found.

## Daily SKU Review Contract

After the fresh snapshot and KPI/account review, every eligible SKU must be classified by operating route, not by a flat metric checklist.

For each SKU, preserve:

- Product identity and buyer/use case.
- Lifecycle and node stage: new, young, old, preheat, peak, tail, off-season, clearance, stock-protect, or watch.
- Current operating route: main push, small-step verify, repair first, stop loss, stock protect, clearance economics, manual review, or no action.
- Stage target: clicks, orders, ACOS/ROAS, net profit, inventory movement, listing conversion, or search-term discovery.
- Whether the stage target is met, missed, or data-insufficient.
- Evidence: SKU sales, ad proof, listing/price fit, inventory/economics, market evidence when needed, and recent action history.
- Action boundary: execute, dry-run/watch, manual repair, blocked, or no action.
- Follow-up window and what data will prove or disprove the hypothesis.

The expected durable outputs are:

- `data/tasks/all_sku_operating_review_<date>.json/html` or an equivalent full-SKU operating review.
- `data/learning/daily_learning_<date>.json/md` with the day's verified and pending lessons.
- `data/learning/sku_lessons/` entries for lessons that are reusable beyond one run.

## Lesson Record Shape

Each reusable lesson should be written as a small record, not a vague sentence.

Required fields:

- `id`: stable lesson id.
- `status`: `active`, `watch`, `conflict_watch`, `narrowed`, `superseded`, or `invalid`.
- `scope`: the smallest proven scope, such as SKU, variant, parent group, keyword, match type, ad entity, product type, season node, or account-level.
- `sourceDate` and `evidenceFiles`: where the lesson came from.
- `lesson`: what was learned.
- `conditions`: when this lesson applies.
- `doNotApplyWhen`: where this lesson must not be reused.
- `transferableTo`: what kind of SKU/entity can use it as a hypothesis.
- `riskOfMisuse`: what goes wrong if it is generalized too far.
- `nextValidation`: what future data should confirm, narrow, or invalidate it.

Optional fields:

- `conflictsWith`: lesson ids or rule names that appear to disagree.
- `resolution`: why the current record wins, loses, or stays in watch.
- `confidence`: `low`, `medium`, or `high`.

## Transfer Rules

Experience reuse is mandatory, but mechanical reuse is prohibited.

Before reusing a lesson on another SKU, compare:

- Product identity and exact buyer intent.
- Variant attributes such as color, size, pattern, quantity, material, occasion, image, price, rating, and review count.
- Node stage and remaining selling window.
- Inventory pressure and profit/refund room.
- Listing and search-term fit.
- Ad structure and match type.
- Recent action history and landing state.

For multi-variant products, a keyword or target failing on one variant does not block the whole parent group. It creates a risk flag only. Another variant may still test the term if its image, title, price, audience, stock, and stage fit the intent. The default transfer action is smaller test scope, lower risk budget, and clearer follow-up, not parent-wide suppression.

Use lessons to reduce repeated mistakes, not to widen the blast radius.

## Conflict Handling

When operating memory, daily learning, retrospectives, and SKU lessons disagree, do not pick the newest text blindly.

Resolve in this order:

1. Reconstruct facts from the latest intended run: snapshot, action schema, `execution_summary`, `execution_verify`, adjustment log, dashboard/handoff, and `daily_learning`.
2. Separate fact conflict from interpretation conflict.
3. Shrink the lesson to the smallest proven scope before applying it elsewhere.
4. Prefer landed and verified results over dry-runs; prefer multi-day follow-up over same-day assumptions; prefer current node/listing/price/inventory state over stale context.
5. If high-risk actions are affected, do not migrate the lesson directly. Rebuild current evidence and use controlled testing or review.
6. Mark the lesson as `conflict_watch`, `narrowed`, `superseded`, or `invalid` instead of deleting old evidence.
7. Record the resolution and the date so future agents know why the rule changed.

Historical adjustment logs show what happened. They do not prove the final operating verdict without the matching final-run verification and learning record.

## Query Contract

When the operator asks "what stage is this SKU in, what is the target, and did it hit it?", answer from the latest SKU review and lesson records first, then refresh live evidence if the answer is stale or high-risk.

Answer shape:

- Current stage and route.
- Stage target.
- Current status against target.
- Evidence and date.
- Relevant reusable lessons and whether they transfer.
- Conflicts or uncertainty.
- Next action and next validation point.
