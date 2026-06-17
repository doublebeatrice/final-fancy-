# Performance Hygiene

This workspace produces large browser snapshots and daily operating artifacts. Keep the repository light so Codex, git, search, and file watchers stay responsive.

## Quick Commands

```powershell
npm run perf:report
npm run perf:hygiene-check
npm run perf:stop-mcp
npm run perf:archive -- --keep-days 3
npm run perf:archive -- --keep-days 3 --execute
node scripts/maintenance/package_scripts_catalog.js --prefix ops:deposit
node scripts/maintenance/package_scripts_catalog.js --query keyword
node scripts/maintenance/run_test_group.js core
node scripts/maintenance/run_test_group.js list
node scripts/maintenance/run_test_group.js ads
node scripts/maintenance/run_test_group.js selection
node scripts/maintenance/run_test_group.js pricing
node scripts/maintenance/run_test_group.js deposit
node scripts/maintenance/run_test_group.js old-products
node scripts/maintenance/run_test_group.js workflow
node scripts/maintenance/run_test_group.js ops
node scripts/maintenance/run_test_group.js agent
node scripts/maintenance/run_test_group.js messaging
node scripts/maintenance/run_test_group.js maintenance
```

## What Each Command Does

- `perf:report` prints git status timing, Chrome DevTools MCP process count, key directory sizes, token-heavy output directories, and the largest files under `data/`.
- `perf:hygiene-check` runs a read-only growth check for suspicious root files, oversized runtime files, too many npm scripts, and date-stamped one-off execute scripts.
- `perf:stop-mcp` stops duplicate `chrome-devtools-mcp` Node/cmd process chains. It does not stop Chrome or delete project data.
- `perf:archive` dry-runs archival of old files under `data/snapshots/` and `data/attribution/`. It never archives `latest_snapshot.json` or `latest_snapshot_profiled.json`.
- `perf:archive -- --execute` moves the selected runtime files to `..\ad-ops-workbench-archive\<timestamp>\` and writes `archive_manifest.json`.
- `package_scripts_catalog.js` searches the current `package.json` scripts by prefix or keyword without adding another npm script alias.
- `run_test_group.js` runs local tests by group. `npm test` delegates to `run_test_group.js all`; use `run_test_group.js list` to inspect group sizes and narrower groups during daily development.

## Operating Rules

- Keep only one MCP definition for Chrome DevTools in this project. Codex uses `.codex/config.toml`; `.mcp.json` is intentionally empty to avoid duplicate launches.
- Treat `data/snapshots/` and `data/attribution/` as runtime stores, not source of truth. They are ignored by git and should be archived regularly.
- Treat `discovery/output/` and `outputs/` as regenerated local outputs. They are ignored by git and should be excluded from broad searches unless you are inspecting those artifacts directly.
- Treat `tools/chrome-for-testing/`, `data/snapshots/`, and `data/attribution/` as known large-file zones. `perf:hygiene-check` ignores individual large files there and relies on archive/directory thresholds instead.
- Do not bulk-ignore or bulk-move `data/tasks/` or `data/learning/`. Many files there are tracked operating memory and daily evidence.
- For broad code searches, exclude runtime artifacts to keep token use low: `rg "<pattern>" --glob "!data/**" --glob "!discovery/output/**" --glob "!outputs/**"`.
- Prefer narrow interface reads for named SKU questions. Use full snapshots only for full abnormal pools, daily closure, cross-SKU prioritization, or data deposit.
- Before long daily runs, use `npm run perf:stop-mcp` if Codex feels sluggish or if multiple MCP sessions were opened.
- After full-snapshot runs, use `npm run perf:report`; archive old runtime files when `data/snapshots/` grows beyond a few GB.
