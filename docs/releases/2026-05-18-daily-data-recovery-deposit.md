# 2026-05-18 Daily Data Recovery Deposit

## Summary

The daily data deposit now treats backend preflight failures as recoverable page/session faults before reporting a blocked run.

## Changes

- `extension/panel.js` retries ad API reads after recovering the adv keyword page when responses look like HTML/login/session-expired pages.
- Ad subtable reads now use settled results so one noncritical table failure is recorded without forcing the entire snapshot to `0 productCards`.
- `daily-data-deposit` skill, README, handoff runbook, and the active `automation` heartbeat now require a recovery pass before marking the day blocked.

## 2026-05-18 Output

- Fresh snapshot: `data/snapshots/runs/today_ops_2026-05-18T01-41-18-939Z/snapshot_2026-05-18.json`
- Latest snapshot updated: `data/snapshots/latest_snapshot.json`
- Canonical HTML: `黄成喆个人数据趋势/每日 近七天 数据趋势/2026-05-18.html`
- Raw daily folder: `黄成喆个人数据趋势/原数据/原日数据/5-18`
- Raw manifest: `黄成喆个人数据趋势/原数据/原日数据/5-18/daily_deposit_manifest_2026-05-18.json`
- Seller success rate: `data/snapshots/seller_success_rate_HJ17_2026-05-18.json`
- Daily tasks: `data/tasks/daily_tasks_2026-05-17.json`
- Proactive audit: `data/tasks/proactive_operating_audit_2026-05-17.json`

## Verification

- `node --check extension\panel.js`
- `node tests\backend_login_lib.test.js`
- `node tests\inventory_list_ready.test.js`
- `node tests\run_today_ops_snapshot.test.js`
- `node scripts\run_today_ops.js --mode full-snapshot`
