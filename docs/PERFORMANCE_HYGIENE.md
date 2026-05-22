# Performance Hygiene

This workspace produces large browser snapshots and daily operating artifacts. Keep the repository light so Codex, git, search, and file watchers stay responsive.

## Quick Commands

```powershell
npm run perf:report
npm run perf:stop-mcp
npm run perf:archive -- --keep-days 3
npm run perf:archive -- --keep-days 3 --execute
```

## What Each Command Does

- `perf:report` prints git status timing, Chrome DevTools MCP process count, key directory sizes, and the largest files under `data/`.
- `perf:stop-mcp` stops duplicate `chrome-devtools-mcp` Node/cmd process chains. It does not stop Chrome or delete project data.
- `perf:archive` dry-runs archival of old files under `data/snapshots/` and `data/attribution/`. It never archives `latest_snapshot.json` or `latest_snapshot_profiled.json`.
- `perf:archive -- --execute` moves the selected runtime files to `..\ad-ops-workbench-archive\<timestamp>\` and writes `archive_manifest.json`.

## Operating Rules

- Keep only one MCP definition for Chrome DevTools in this project. Codex uses `.codex/config.toml`; `.mcp.json` is intentionally empty to avoid duplicate launches.
- Treat `data/snapshots/` and `data/attribution/` as runtime stores, not source of truth. They are ignored by git and should be archived regularly.
- Do not bulk-ignore or bulk-move `data/tasks/` or `data/learning/`. Many files there are tracked operating memory and daily evidence.
- Prefer narrow interface reads for named SKU questions. Use full snapshots only for full abnormal pools, daily closure, cross-SKU prioritization, or data deposit.
- Before long daily runs, use `npm run perf:stop-mcp` if Codex feels sluggish or if multiple MCP sessions were opened.
- After full-snapshot runs, use `npm run perf:report`; archive old runtime files when `data/snapshots/` grows beyond a few GB.
