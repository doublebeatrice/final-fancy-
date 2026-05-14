# Price Executor Implementation Plan

## Goal

Make price changes a first-class executable action in the existing ops pipeline:

- AI/action-schema output can emit SKU-level price actions.
- `run_actions` can submit price applications through the seller inventory backend.
- Price actions carry price intent and ad-coupling guidance, so later ad actions can reason from the same record.
- Execution and dry-run results are written through the same adjustment log path as ad actions.

## Action Shape

Minimum executable action:

```json
{
  "entityType": "sku",
  "id": "RHO1540",
  "actionType": "price",
  "currentPrice": 11.99,
  "suggestedPrice": 12.99,
  "site": "Amazon.com",
  "remark": "可卖低 涨价",
  "priceIntent": "inventory_protection",
  "adCoupling": {
    "direction": "down",
    "reason": "price increase is meant to slow sell-through",
    "allowedAdActions": ["lower_bid", "lower_budget", "hold"],
    "blockedAdActions": ["raise_bid", "raise_budget"],
    "checkAfterDays": [1, 3, 7]
  },
  "decisionStage": "ai_approved",
  "approvedBy": "codex",
  "actionSource": ["codex"],
  "evidence": ["inventory days low", "conversion stable"],
  "riskLevel": "low"
}
```

## Steps

1. Add pure helpers for price validation, intent/ad-coupling defaults, and `applyPrice` form payload construction.
2. Add unit tests for payload encoding, risk limits, and ad-coupling validation.
3. Extend `ai_decision` to accept `entityType=sku` and `actionType=price`, with verification metadata and learning baseline.
4. Add execution through the existing extension panel and seller inventory page session.
5. Merge price execution events into summaries, coverage, history, and adjustment logs.
6. Run targeted tests and a dry-run schema check before reporting usable scope.
