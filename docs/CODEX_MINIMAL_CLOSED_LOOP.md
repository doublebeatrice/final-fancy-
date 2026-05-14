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
10. The next daily loop compares actual sales/profit/ad movement against each action's hypothesis and issues corrective actions when reality diverges.

The strategic loop is `hypothesis -> action -> landed verification -> daily data check -> attribution -> correction`. Business risk on supported advertising actions should not become artificial manual review. If Codex believes the action can improve profit, sales quality, inventory turnover, or KPI trajectory, it should approve and execute the supported action, then learn from the data.

## Completion Criteria

Daily work is not closed just because a report exists. A day is closed only when the latest intended run has:

- Fresh data artifacts: snapshot, task/watch diagnostics, season audit, personal trend archive, report, and daily learning.
- A schema that passed dry-run before execution.
- Execution API failures at 0 for executable actions.
- Landing verification success for every executable action.
- Inventory notes and adjustment logs written.
- `execution_summary_<date>.json`, `execution_verify_<date>.json`, the report, and `daily_learning_<date>.json` all pointing to the same final run/sourceRunId.

When same-day retries or dry-runs exist, use daily learning `decisions.finalRunLanding` as the completion lens. All-day aggregate adjustment counts can preserve failed history, but they are not the final completion verdict.

## Daily Operating Doctrine

The 2026-05-14 retrospective is now part of the closed loop: `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md`.

Daily operations must not be split into small "first round / second round / third round" reports that depend on the user pushing the next step. Run the whole loop directly:

1. Data health check.
2. Total-result diagnosis: sales, units, net profit, refund, ACOS, ad share, CPC.
3. Risk-first pool: overbudget, high refund, high ACOS/no orders, low profit.
4. Old-product repair pool: split by traffic loss, conversion loss, inventory, season, refund, and ad disconnect.
5. Opportunity pool: only proven converters with healthy inventory, acceptable refund/profit, and current season/node support.
6. Dry-run, execute, verify landing, write notes/logs.
7. Write daily learning and 1d/3d/7d follow-up expectations.

Execution volume is not a success metric. If the business surface worsens, say so and correct the next plan. Overbudget must be present in every daily plan and classified as hard stop, budget shift, or watch-only. Refund pressure is a hard traffic gate. Same-SKU repeat pushes require recent-history review and new evidence.

## SP Campaign State Notes

SP campaign state actions are campaign-level actions even when the available rows come from child keyword, target, or product-ad tables.

- Match metadata by `campaignId`.
- Build SP campaign state writes through `/campaign/batchCampaign`.
- Verify state from `campaignState` or campaign status fields before child row `state`.
- For pause, API success plus disappearance from enabled child-row pools can be a landed result.
- For enable, the campaign must visibly verify as enabled.
- SP campaign pause was verified live on 2026-05-12. SP campaign enable and SP/SB adGroup state are technical verification gaps; if attempted and not landed, report `not_landed` and fix automation rather than routing them to business review.

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

If Codex cannot perfectly judge a supported advertising action, Codex should still make the best explicit decision and use `forceExecute: true` when overriding conservative strategy gates. Use `review` only for unsupported or non-advertising surfaces such as SB create, listing edits, price changes, replenishment, missing fields, unknown entities, missing verification mapping, or writes that cannot be landed.

Known 2026-05-12 technical blocker: SP campaign `enable` returned API success but verified as still paused. This is automation work / `not_landed`, not a manual-review strategy decision.

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

Verified on 2026-05-12:

- `npm test`
- `node --check auto_adjust.js`
- `node --check src\ai_decision.js`
- `node --check src\daily_learning.js`
- Final runner command:

```powershell
node scripts\run_today_ops.js --execute --schema data\snapshots\action_schema_2026-05-12_claude_postseason_lo3817.json --snapshot data\snapshots\runs\today_ops_2026-05-12T07-38-11-344Z\snapshot_2026-05-12.json
```

- Final run `today_ops_2026-05-12T09-41-50-232Z` landed 11/11 SP campaign pause actions with 0 API failures.
- Inventory note writes succeeded for the closed-loop run.
- `data\learning\daily_learning_2026-05-12.*` now records `decisions.finalRunLanding` so historical same-day retries do not obscure the final landed state.

## Known External Dependencies

- Active browser login state.
- Installed extension panel.
- Chrome remote debugging on port `9222`.
- Backend API availability.
