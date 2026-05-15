# KPI Recovery 2026-05-15

- Price applications submitted today: 20
- Inventory-side marker already confirmed: 20
- Application submitted but marker not yet confirmed: 0

## Tomorrow 1d Metrics For KPI Hard-30
- SKU units_3d/7d and listing sessions/conversion: detect whether traffic changes cut or recovered real demand.
- Entity 3d spend/orders/clicks/ACOS versus 7d baseline: judge keep, rollback, or escalate.
- Campaign budget-up rows: require fresh orders; no-order spend rolls back.
- Bid-up rows: require impressions/clicks and at least order or conversion-quality improvement, otherwise downshift.
- Bid-down/refund rows: require spend reduction without same-SKU unit/session collapse.
- Price rows: first check `today_price_apply` / price application marker, then 3d/7d units, conversion, margin, and ad-space coupling.

## Files
- coverage: D:\ad-ops-workbench\data\learning\closed_loop_coverage_2026-05-15.json
- follow-up: D:\ad-ops-workbench\data\learning\followup_review_2026-05-15.md
- listing triage: D:\ad-ops-workbench\data\learning\listing_repair_triage_2026-05-15.md
