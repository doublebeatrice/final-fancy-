# KPI recovery next actions - 2026-05-22

Business date: 2026-05-21
Data date: 2026-05-20
Source run: none

## Account Gate

- KPI gate: fail.
- Sales: actual 516,741.99 vs target 536,451.66.
- Units: actual 3,582 vs target 3,702.
- Net profit rate: actual 19.33% vs min 19.41%.
- ACOS: actual 19.78% vs max 19.57%.
- Refund rate: actual 5.70% vs max 5.45%.
- Ad cost share: actual 10.16% vs max 10.80%.
- Next recovery line 2026-05-22: sales at least 540,393.59; units at least 3,726; net profit rate at least 19.42%; ACOS not above 19.52%; refund rate not above 5.40%; ad cost share not above 10.80%.
- Operator posture: recover volume only through rows with conversion evidence, inventory room, and profit room; do not count dry-runs as landed KPI actions.

## Already Landed

Do not repeat same-entity successful live writes until the next effect window proves a new action is needed.

- none

## High-Priority Watch Pool

Promote only after fresh 1d/3d evidence shows repeat conversion and guardrails still pass.

- none

## Blocked Pool

Do not execute these as KPI recovery bid-ups without fresh inventory/profit evidence.

- none

## True Approval Needed

These require operator review because the current evidence conflicts or crosses the normal write boundary.

- none

## Next Run Checklist

1. Run `npm run ops:kpi:gate -- --date 2026-05-22` when the next actual line is available.
2. Re-run effect review at the next 1d/3d window before promoting watch-only rows.
3. Keep low-efficiency raw-pool counts separate from executable write-chain actions.
4. Keep the day in recovery until KPI gate passes or the next recovery target is explicitly carried forward.
