# Price Executor Design

Date: 2026-05-14

## Goal

Make price changes part of the normal daily operating loop. When the deciding AI session determines that a SKU should try a price increase or decrease, the action should enter the same schema, dry-run, execution, verification, adjustment log, and learning flow used for advertising actions.

This is not a standalone pasted-fetch helper. The executor must use the active `sellerinventory.yswg.com.cn` browser session, read session credentials dynamically, submit a formal price application, and record the result as an operational action.

## Current Context

The repository already has a daily closed loop:

- `src/ai_decision.js` validates external action schemas and gates execution.
- `scripts/execute/run_actions.js` invokes `auto_adjust.run`, persists dry-run and execution records, and writes `data/adjustments/adjustments_<date>.json`.
- `auto_adjust.js` executes supported ad actions, verifies landing, appends inventory notes, and writes execution summaries.
- `src/proactive_audit.js` already identifies price-action candidates, but they currently become review items.
- Project docs currently classify price changes as outside the verified execution surface. This design upgrades price applications to a verified inventory-side execution surface.

The system must continue to avoid storing cookies, CSRF values, JWT values, Inventory-Token values, or raw pasted request headers.

## Schema

Add SKU-level price actions:

```json
{
  "sku": "SHQ3950",
  "summary": "Low inventory and healthy conversion justify a controlled price increase.",
  "actions": [
    {
      "entityType": "sku",
      "id": "price::SHQ3950::Amazon.com",
      "actionType": "price",
      "site": "Amazon.com",
      "saleStatus": "正常销售",
      "currentPrice": 32.99,
      "suggestedPrice": 34.99,
      "profitBefore": 0.1738,
      "profitBeforeSea": 0.3354,
      "profitAfter": 0.2046,
      "profitAfterSea": 0.3569,
      "floatPrice": 0.0606,
      "isUrgent": false,
      "account": "SHQ",
      "developerNum": "DB847",
      "sellerNum": "HJ17",
      "remark": "库存低转化好 提价",
      "evidence": [
        "invDays <= 21",
        "unitsSold_7d > 0",
        "profitAfter improves without exceeding demand risk"
      ],
      "hypothesis": "A controlled price increase protects stock and margin while demand remains active.",
      "expectedEffect": {
        "grossMargin": "up",
        "units": "watch",
        "conversionRate": "watch",
        "inventoryDays": "up"
      },
      "reviewPlan": {
        "checkAfterDays": [1, 3, 7],
        "rollbackIf": "conversion or units drop sharply without margin improvement"
      },
      "decisionStage": "ai_approved",
      "approvedBy": "codex",
      "actionSource": ["codex"]
    }
  ]
}
```

Required fields:

- Identity: `entityType=sku`, `actionType=price`, `id`, `sku`, `site`.
- Price and margin: `currentPrice`, `suggestedPrice`, `profitBefore`, `profitAfter`, `floatPrice`.
- Backend form fields: `saleStatus`, `account`, `developerNum`, `sellerNum`, `remark`.
- Attribution: `decisionStage`, `approvedBy`, `actionSource`, `evidence`, `hypothesis`, `expectedEffect`, `reviewPlan`.

Optional fields mirror the backend form and should default to blank if absent: `variantSku`, `maliciousUserId`, `minPrice`, `maxPrice`.

## Validation And Gates

`src/ai_decision.js` should normalize and validate price actions as executable only when:

- The action has explicit approval from `codex`, `claude`, or `manual`.
- `currentPrice` and `suggestedPrice` are positive numbers.
- `suggestedPrice` differs from `currentPrice`.
- `floatPrice` is consistent with `(suggestedPrice - currentPrice) / currentPrice` within a small rounding tolerance.
- `profitAfter` is present. For price increases, `profitAfter` should be greater than or equal to `profitBefore` unless `forceExecute` is true with a clear reason.
- The absolute price change is at or below 15% by default.
- Changes above 15% require `forceExecute: true`, `forceReason`, and stronger evidence.
- The SKU exists in the current product context.

Price actions remain blocked when required backend form fields are missing, when the SKU is unknown, when the sales channel is not supported, or when post-write verification cannot be built.

## Execution

`auto_adjust.js` should add a price execution path after schema validation:

1. Collect `priceItems` from the normalized plan where `entityType === "sku"` and `actionType === "price"`.
2. In dry-run mode, include price actions in the normal plan and dry-run summary without calling the backend.
3. In execute mode, run a browser-context function against the active `sellerinventory.yswg.com.cn` session.
4. Dynamically read CSRF from page meta, Laravel globals, or compatible page state.
5. Locate the active `/pm/formal/list?...Inventory-Token=...` iframe/list URL and use it as the referrer.
6. Submit `POST https://sellerinventory.yswg.com.cn/pm/formal/applyPrice` with `application/x-www-form-urlencoded; charset=UTF-8`.
7. Send only the form fields needed by the endpoint. Do not persist raw headers or tokens.

The submitted form should map schema fields to backend fields:

- `sku`
- `site`
- `sale_status`
- `price_raw`
- `price_apply`
- `profit_raw`
- `profit_raw_sea`
- `profit_apply`
- `profit_apply_sea`
- `float_price`
- `is_urgent`
- `account`
- `developer_num`
- `seller_num`
- `remark`
- `variant_sku[]`
- `malicious_user_id`
- `min_price`
- `max_price`

An HTTP response with JSON `{ "code": 200 }` means the price application was submitted. It does not mean Amazon front-end price has changed.

## Verification

Price verification should treat successful submission as `application_submitted`, then try to confirm the inventory-side application marker.

Verification sources:

- Refresh or query the SKU in `/pm/formal/list`.
- Check fields already seen in inventory data such as `is_price_apply`, `price_apply_time`, and `today_price_apply`.
- Match `today_price_apply` or equivalent current application field to `suggestedPrice` when present.

Final statuses:

- `success`: application submitted and inventory-side marker confirms the same SKU/price application.
- `application_submitted`: API success, but list marker is unavailable or not yet refreshed.
- `not_landed`: API success but verification shows a conflicting value or failed marker.
- `failed`: endpoint failure, login failure, missing token, validation failure, or non-JSON/html response.

The daily closed-loop completion report must not describe a submitted application as Amazon price landed.

## Logging And Learning

`src/adjustment_log.js` should infer before/after values for `actionType: "price"`:

- `beforeValue = currentPrice`
- `afterValue = suggestedPrice`
- `direction = up | down`
- `entityType = sku`

Execution events should flow into:

- `data/adjustments/adjustments_<date>.json`
- `execution_verify_<date>.json`
- daily learning final landing summaries
- inventory operation notes, if the note writer supports SKU-level price events

The note text should be concise and attributable, for example:

```text
[由 Codex 决策] 价格申请 32.99 -> 34.99：库存低转化好，提价保护利润；1/3/7天回查销量、转化和利润。
```

## Operating Rules

Price increases are appropriate when evidence supports margin or stock protection, such as:

- Tight inventory with active demand.
- Low profit rate with continued sales.
- Advertising traffic is efficient, but margin is being compressed.
- Seasonal peak demand justifies a controlled price test.

Price decreases are appropriate when evidence supports conversion recovery or sell-through, such as:

- High inventory and weak conversion.
- Season window is closing.
- Listing has traffic but price appears to block orders.
- Margin remains acceptable after the lower price.

Price actions should be avoided or routed to review when:

- Refund pressure is high and the price change does not address refund economics.
- Listing, variant, review, or offer issues are more likely than price to explain conversion weakness.
- The action would create negative or near-zero profit without a specific clearance hypothesis.
- The current backend field values are missing or stale.

## Tests

Add focused regression coverage:

- `src/ai_decision.js` accepts valid approved price actions.
- Missing price fields force review or validation errors.
- Excessive price changes require `forceExecute`.
- `src/adjustment_log.js` records price before/after values.
- The execution form builder maps schema fields to the exact `/pm/formal/applyPrice` payload.
- Sensitive token redaction rules still prevent CSRF, cookies, JWT, and Inventory-Token values from being persisted.

## Rollout

1. Add schema normalization and validation for price actions.
2. Add pure payload builder tests before browser execution.
3. Add browser-side `applyPrice` executor using active session tokens.
4. Add verification mapping and result statuses.
5. Update docs that currently list price changes as review-only.
6. Run dry-run on a sample schema.
7. Execute only after the dry-run payload and verification plan are correct.
