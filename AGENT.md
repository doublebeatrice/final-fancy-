# Agent Instructions

This project is operated by Codex as the only AI decision entry point.

## Required Read Order

Before running or changing the workflow, read:

1. `README.md`
2. `docs/CODEX_HANDOFF_RUNBOOK.md`
3. `docs/CODEX_AI_BOUNDARY.md`
4. `docs/Q2_AD_OPS_PLAYBOOK.md`
5. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`

## Architecture Boundary

The extension panel is not an AI product. It only captures data, exports structured snapshots, visualizes rows, exposes execution bridges, shows results, and supports manual confirmation.

Codex performs the decision work outside the panel:

- Read snapshot and docs.
- Understand ad, inventory, Q2, product-stage, and history context.
- Produce a unified action schema.
- Run dry-run validation.
- Execute through scripts.
- Verify result landing.
- Write inventory notes.
- Generate summary.

Do not add an OpenAI-compatible provider or AI runtime inside the panel. Do not keep a second strategy layer in code.

## Execution Discipline

- Code may validate schema, execute APIs, verify, write notes, and summarize.
- Code must not secretly decide strategy through old rule trees.
- If Codex cannot decide, emit `review`.
- Do not use fallback logic to pretend AI made a decision.
- All failures must be structured.
- High-risk actions remain review-only unless explicitly released.

## Current Auto-Executable Scope

Low-risk actions:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- seven-day untouched low-risk touch actions

Review-only actions:

- `create`
- `structure_fix`
- large bid changes
- high-sales strong actions
- listing edits
- price changes
- replenishment decisions

## Normal Command Flow

Start debug Chrome:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Export snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Dry-run:

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Execute:

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Regression checks:

```powershell
node --check auto_adjust.js
node --check extension\panel.js
node --check scripts\execute\run_actions.js
node --check scripts\execute\export_snapshot.js
npm test
```
