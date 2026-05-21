# KPI recovery next actions - 2026-05-21

Business date: 2026-05-20
Data date: 2026-05-19
Source run: none

## Account Gate

- KPI gate: fail.
- Sales: actual 516,741.99 vs target 541,080.88.
- Units: actual 3,582 vs target 3,754.
- Net profit rate: actual 19.33% vs min 19.47%.
- ACOS: actual 19.78% vs max 19.77%.
- Refund rate: actual 5.70% vs max 5.28%.
- Ad cost share: actual 10.16% vs max 10.80%.
- Next recovery line 2026-05-21: sales at least 536,451.66; units at least 3,702; net profit rate at least 19.41%; ACOS not above 19.57%; refund rate not above 5.45%; ad cost share not above 10.80%.
- Operator posture: recover volume only through rows with conversion evidence, inventory room, and profit room; do not count dry-runs as landed KPI actions.

## Already Landed

Do not repeat same-entity successful live writes until the next effect window proves a new action is needed.

- Low-efficiency live stop-loss landed: success 513, failed 3, latestRun low_efficiency_2026-05-21_1779347570121 (30 rows).
- Low-efficiency entity split: keyword=189, autoTarget=195, manualTarget=56, sbKeyword=73, sbTarget=3.
- Detailed rows are kept in the adjustment log and landed-action conflict audit; this summary prevents the next-actions file from hiding live stop-loss work.

- none

## High-Priority Watch Pool

Promote only after fresh 1d/3d evidence shows repeat conversion and guardrails still pass.

- none

## Blocked Pool

Do not execute these as KPI recovery bid-ups without fresh inventory/profit evidence.

- none

- Approval review split: recommendApprove 1; approvalNeeded 0; hold 0; blocked 0.

## Recommended Approval

These are still human-authorized writes, but the operator review found enough profit, conversion, and inventory room for a controlled lift.

| SKU | Surface | Change | Evidence | Decision |
| --- | --- | ---: | --- | --- |
| KZ5816 | campaign/budget: `asin_vip party_kz5816 [128136203487216]` | 5.44 -> 6.8 | orders=21; ACOS=22.60%; profit=26.00%; invDays=30; units7=60 | controlled_profitable_budget_lift |

## True Approval Needed

These require operator review because the current evidence conflicts or crosses the normal write boundary.

- none

## Hold

Do not approve these until the stated inventory, sell-through, or route condition changes.

- none

## Approval Review Blocked

Do not execute these as KPI recovery writes without rebuilding evidence or route context.

- none

## Next Run Checklist

1. Run `npm run ops:kpi:gate -- --date 2026-05-21` when the next actual line is available.
2. Re-run effect review at the next 1d/3d window before promoting watch-only rows.
3. Keep low-efficiency raw-pool counts separate from executable write-chain actions.
4. Keep the day in recovery until KPI gate passes or the next recovery target is explicitly carried forward.
