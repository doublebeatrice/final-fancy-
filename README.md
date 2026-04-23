# Ad Ops Workbench

This repo supports an Amazon advertising operations workflow where Codex is the only AI decision entry point.

The browser extension and scripts do not decide strategy. They collect data, export snapshots, validate action schemas, execute API calls, verify results, write inventory notes, and generate summaries. Codex reads the exported context, makes the decision, writes the action schema, and calls the execution scripts.

## Current Boundary

Codex owns:

- Reading advertising, inventory, historical actions, product stage, Q2 priorities, and risk context.
- Producing the unified action schema.
- Deciding whether an item should be executed or sent to review.
- Orchestrating export, dry-run, execution, verification, note writing, and summary.

Code owns:

- Page data capture through the extension panel.
- Structured snapshot export.
- Action schema validation.
- Deterministic execution of supported APIs.
- Result verification.
- Inventory note append.
- Execution summary output.

The panel must not contain an AI provider, AI runtime, or second strategy layer.

## Quick Start For A New Codex Session

Prerequisites:

- Work from this repo: `D:\ad-ops-workbench`.
- Chrome is logged in to `adv.yswg.com.cn` and `sellerinventory.yswg.com.cn`.
- The extension panel can be opened.
- Debug Chrome is available on port `9222`.

Open the debug browser:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Open the ad system and inventory system in that browser, then open the extension panel:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

Export a full snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Codex then reads the snapshot and writes an external action schema JSON. Validate without executing:

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Execute after review:

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

## Verified Capabilities

Verified on 2026-04-23:

- Full panel snapshot export works.
- Snapshot-based dry-run works.
- Snapshot-based real execution works.
- Incremental post-write verification works.
- Inventory note writing works in snapshot mode.
- Failed note writes are retried instead of rerunning all notes.
- SP bid execution works for keyword, auto target, and manual target rows already supported by the executor.
- SB keyword bid execution works.
- State toggle support exists for SP keyword, SP auto target, SP manual target, SB keyword, and SB target, using their separate request bodies and SP/SB state casing.

Validated commands:

```powershell
node --check auto_adjust.js
node --check extension\panel.js
node --check scripts\execute\run_actions.js
node --check scripts\execute\export_snapshot.js
npm test
```

## Q2 Full Test Result

Full test snapshot on 2026-04-23:

- Product cards: 434
- SP keyword rows: 7076
- SP auto rows: 1595
- SP manual target rows: 1843
- SB keyword rows: 3610
- SB target rows: 31
- Inventory snapshot rows: 722
- SP seven-day untouched rows: 3
- SB seven-day untouched rows: 8

Execution result:

- 7 low-risk actions executed.
- 7 API calls succeeded.
- 7 results verified as landed.
- 7 inventory notes succeeded.
- 3 review-only actions wrote review notes.
- 0 API 403 blocks.
- 0 verification misses.

Key output files:

- `data/snapshots/q2_full_test_snapshot.json`
- `data/snapshots/q2_full_test_action_schema.json`
- `data/snapshots/execution_verify_2026-04-23.json`
- `data/snapshots/execution_summary_2026-04-23.json`

## Review-Only Boundaries

These actions may be recommended by Codex, but remain review-only until explicitly released:

- New ad creation.
- Structure repair or campaign rebuild.
- Large bid changes.
- Strong actions on high-sales or high-risk products.
- Listing edits.
- Price changes.
- Sea-shipping replenishment decisions.

If Codex cannot decide safely, the action schema must use `review`. Code must not fall back to an old rule decision.

## Main Files

- `auto_adjust.js`: deterministic execution orchestration.
- `src/ai_decision.js`: context building and external action schema validation/loading. No provider runtime.
- `src/adjust_lib.js`: supported action execution helpers.
- `extension/panel.js`: browser-side data capture, execution bridge, verification, and note bridge.
- `scripts/execute/export_snapshot.js`: panel snapshot export.
- `scripts/execute/run_actions.js`: action schema runner.
- `docs/CODEX_HANDOFF_RUNBOOK.md`: handoff and operating runbook.
- `docs/Q2_AD_OPS_PLAYBOOK.md`: Q2 decision context for Codex.
- `docs/CODEX_AI_BOUNDARY.md`: Codex-only architecture boundary.
