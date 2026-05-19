# 2026-05-19 Daily Ops Execution Release

## Summary

This release packages the current daily-ops operating loop, evidence stack, and execution artifacts through the 2026-05-19 handoff. The workflow now closes low-efficiency cleanup, over-budget cleanup and controlled recovery, seasonal listing/title checks, high-efficiency expansion review, and durable daily learning in one operator-facing release.

## Changes

- Daily operations now require three-system readiness for ad backend, sellerinventory, and selection before execution claims.
- Low-efficiency cleanup uses broader 3d/7d/15d/30d pressure checks and records cooldown/floor lessons in daily learning.
- Over-budget handling now separates precise productAd waste pauses from controlled campaign budget recovery for campaigns still converting inside profit room.
- High-efficiency review and execution artifacts preserve source rows, dry-run filters, live execution summaries, and post-fetch verification.
- Seasonal work now includes season gap audit, season title dry-run, listing queue fetch, listing schema generation, protected-SKU handling, and season status tag execution summaries.
- Product and keyword judgement can use selection keyword conversion and ABA search-term evidence as read-only market support.
- Developer/product requests now have a dedicated Codex skill and durable archive path for forwarded operator messages.
- Daily learning and dashboard outputs now capture latest execution run, all-day landing, final-run landing, attribution, and carry-forward checkpoints.

## 2026-05-19 Output

- Daily learning: `data/learning/daily_learning_2026-05-19.md`
- Daily dashboard: `data/reports/daily_dashboard_2026-05-19.html`
- Over-budget productAd schema: `data/snapshots/action_schema_overbudget_productad_pause_2026-05-19_codex.json`
- Over-budget controlled budget schema: `data/snapshots/action_schema_overbudget_controlled_budget_up_2026-05-19_codex.json`
- High-efficiency summary: `data/tasks/high_efficiency_execution_summary_2026-05-19.md`
- Off-target audit: `data/tasks/offtarget_keyword_audit_2026-05-19_v2.md`
- Customer search term candidates: `data/tasks/customer_search_term_action_candidates_2026-05-19.md`
- Season full-check output: `data/tasks/season_title_dry_run_2026-05-19_fullcheck.md`

## Verification

- `npm run chrome:debug`
- `node scripts\execute\run_actions.js data\snapshots\action_schema_overbudget_productad_pause_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --dry-run --full-scope`
- `node scripts\execute\run_actions.js data\snapshots\action_schema_overbudget_controlled_budget_up_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --dry-run --full-scope`
- `node scripts\reports\generate_daily_dashboard.js 2026-05-19`
- `node -e "JSON.parse(require('fs').readFileSync('data/learning/daily_learning_2026-05-19.json','utf8'))"`
