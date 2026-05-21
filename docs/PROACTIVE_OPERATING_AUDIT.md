# Proactive Operating Audit

This audit exists because the daily workflow must find business leaks before the operator names them.

Run it after a fresh snapshot:

```powershell
node scripts\run_proactive_audit.js --snapshot data\snapshots\latest_snapshot.json
```

`scripts\run_today_tasks.js` and `scripts\run_today_ops.js` also generate it automatically.

## Outputs

- `data\tasks\proactive_operating_audit_<YYYY-MM-DD>.json`
- `data\tasks\proactive_operating_audit_<YYYY-MM-DD>.html`
- `data\snapshots\action_schema_<YYYY-MM-DD>_proactive_recovery_candidate.json`
- `data\snapshots\action_schema_<YYYY-MM-DD>_daily_recovery_combined.json` when no explicit external schema is selected

## Required Modules

1. KPI gap to the 2026-06-12 target.
2. New-product launch: recent arrivals must not wait for natural orders.
3. Arrival ad recovery: inventory with no effective delivery is a recovery failure.
4. Price actions: tight inventory, low profit, and node-tail products require daily price review.
5. Removal economics: stale or high inventory must read sellerinventory add-view recovery values before choosing discount sell-through, offline service provider, batch clearance, or disposal.
6. Expired-season keyword waste: tail/expired node traffic must prove efficient recent orders.
7. Listing/offer repair: traffic without conversion or high ACOS needs listing, price, review, and search-term diagnosis.

## Closed-Loop Rule

A daily run is incomplete until every required module is present and each item is classified into one of:

- execute now
- manual repair with owner/reason
- no action with evidence

Do not report the day as complete if the audit is missing.

Do not treat the audit itself as closure. `run_today_ops.js` must convert new-product launch, arrival ad recovery, expired-season waste, and review-only repair rows into a proactive recovery candidate schema. If the run is using the default daily schema path, that proactive schema must be merged into the selected daily recovery schema. If an operator-specified schema is used instead, the run should keep the explicit schema but surface a warning when arrival gaps remain outside the primary execution file.

Arrival ad recovery is closed only when the SKU has one of:

- an executable ad action that passed dry-run and then landed;
- a manual repair record with owner/reason, such as cooldown, missing writable entity, or missing account/create context;
- a no-action record backed by fresh evidence.

## Current 2026-05-14 Baseline

Latest snapshot audit found:

- KPI status: off track.
- New-product launch gaps: 15.
- Arrival ad recovery gaps: 3.
- Price actions: 143.
- Expired-season keyword waste rows: 216.
- Listing/offer repair gaps: 294.

This is the recovery baseline, not a final action list. The next action schema must convert the highest-risk audit rows into executable ad actions, manual price/listing tasks, or explicit no-action records.
