# KPI recommend-approve pending execution - 2026-05-21

Business date: 2026-05-20
Data date: 2026-05-19

This file is a ready-to-run execution packet, not live authorization.

## Pending approval

| SKU | Action | Change | Evidence | Review |
| --- | --- | ---: | --- | --- |
| KZ5816 | campaign budget: asin_vip party_kz5816 [128136203487216] | 5.44 -> 6.8 | orders=21; ACOS=22.6%; profit=26.0%; invDays=30; units7=60 | 1d spend/orders, 3d ACOS; rollback if ACOS exceeds profit room without order growth |

## Dry-run command

```powershell
node scripts\execute\run_actions.js data\snapshots\action_schema_2026-05-21_kpi_recommend_approve_pending.json --snapshot data\snapshots\latest_snapshot.json --dry-run
```

## Live command after explicit user approval

```powershell
node scripts\execute\run_actions.js data\snapshots\action_schema_2026-05-21_kpi_recommend_approve_pending.json --snapshot data\snapshots\latest_snapshot.json --execute
```
