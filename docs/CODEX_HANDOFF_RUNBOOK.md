# Codex Handoff Runbook

This document is the handoff guide for running the project from a different Codex account or a new session.

## What Transfers

The repo transfers:

- Data capture scripts.
- Snapshot export.
- Action schema validation.
- Execution scripts.
- Verification and summary output.
- Inventory note append flow.
- Q2 operating priorities documented in `docs/Q2_AD_OPS_PLAYBOOK.md`.

The repo does not transfer:

- Browser login cookies.
- Chrome extension installation state.
- The active Chrome debug session.
- The current chat memory.

That means a new Codex account can run the workflow if the same machine has the browser profile logged in and the extension available.

## Required Read Order

1. `README.md`
2. `AGENT.md`
3. `docs/CODEX_AI_BOUNDARY.md`
4. `docs/Q2_AD_OPS_PLAYBOOK.md`
5. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`

## Start Browser Session

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Then confirm these pages are logged in:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
```

Open the extension panel:

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

If the extension ID changes on another machine, use the installed extension panel URL from Chrome instead of the URL above.

## Export Snapshot

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Expected output is a JSON snapshot containing panel cards, SP rows, SB rows, seven-day untouched pools, and inventory note context.

## Codex Decision Step

Codex reads the snapshot and Q2 playbook, then writes an action schema JSON. The schema is the only decision artifact. The executor must not invent actions.

Low-risk auto-executable actions currently allowed:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- Seven-day untouched low-risk touch actions

Review-only actions:

- `create`
- `structure_fix`
- large bid changes
- high-sales strong actions
- listing changes
- price changes
- replenishment decisions

## Dry Run

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Dry-run must show validation errors as structured failures. Do not execute if schema validation is not clean.

## Execute

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Expected outputs are written under `data/snapshots/`, including verification and execution summary files.

## Troubleshooting

If export fails:

- Confirm debug Chrome is running on port `9222`.
- Confirm the extension panel is open.
- Confirm ad and inventory systems are logged in.

If execution fails with missing auth:

- Reopen debug Chrome with the normal user data directory.
- Refresh the ad system page.
- Refresh the extension panel.

If note writing fails:

- Confirm inventory site is logged in.
- Re-run with the same schema and snapshot only after checking the failure is note-only.

If verification does not land:

- Check whether the backend returned success but the row refresh did not include the updated entity.
- Use the generated verification file before retrying.

If an API returns 403 with recent-system-adjust language:

- Treat it as a structured block, not a retryable execution failure.
- Do not loop on it.
