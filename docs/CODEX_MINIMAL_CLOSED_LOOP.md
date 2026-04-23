# Codex Minimal Closed Loop

This document records the implemented and verified closed loop.

## Current Loop

0. Start Chrome with remote debugging.
1. Log in to the advertising backend and inventory backend.
2. Open the extension panel.
3. Export a structured panel snapshot.
4. Codex reads the snapshot and produces an action schema.
5. The runner validates the schema.
6. The runner executes supported ad APIs.
7. The runner verifies that changes landed.
8. The runner writes inventory notes.
9. The runner writes a summary.

## Commands

Start debug Chrome:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

After starting Chrome, open these pages and wait for manual operator confirmation that both are logged in:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
```

This manual confirmation is part of the real closed loop. Without it, export may return inventory-only data or empty ad rows.

Export snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Dry-run an action schema:

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Execute an action schema:

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Alternative direct runner:

```powershell
$env:ACTION_SCHEMA_FILE='D:\ad-ops-workbench\data\snapshots\action_schema.json'
$env:PANEL_SNAPSHOT_FILE='D:\ad-ops-workbench\data\snapshots\latest_snapshot.json'
node auto_adjust.js
```

## Module Responsibilities

- `extension/panel.js`: data capture, visualization, execution bridge, note bridge, incremental refresh bridge.
- `scripts/execute/open_debug_browser.ps1`: starts Chrome with remote debugging.
- `scripts/execute/export_snapshot.js`: connects to the panel, runs data capture, and writes a snapshot.
- `scripts/execute/run_actions.js`: reads an external action schema and starts the execution chain.
- `auto_adjust.js`: validates actions, executes, verifies, writes notes, and writes summary.
- `src/ai_decision.js`: context building and action schema validation/loading; no provider runtime.

## What The Repo Does Not Do

The repo does not:

- Host an OpenAI-compatible provider.
- Read an API key to call a model.
- Generate AI decisions inside the panel.
- Use execution-layer rule functions as the decision source.

If Codex cannot judge an action, Codex should write `review` in the action schema.

## Verified

Verified on 2026-04-23:

- `node --check auto_adjust.js`
- `node --check extension\panel.js`
- `node --check scripts\execute\export_snapshot.js`
- `node --check scripts\execute\run_actions.js`
- `npm test`
- Full snapshot export.
- Snapshot dry-run.
- Snapshot real execution.
- Incremental verification.
- Inventory note writing in snapshot mode.
- Summary generation.

## Known External Dependencies

- Active browser login state.
- Installed extension panel.
- Chrome remote debugging on port `9222`.
- Backend API availability.
