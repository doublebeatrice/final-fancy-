# AI Decision Boundary

This document records the current architecture boundary. The deciding AI is an operator-facing CLI session — either Codex or Claude — that runs outside this repo. The panel and scripts host no AI runtime.

## Panel Layer

The extension panel is responsible for:

- Page data capture.
- Structured data export.
- Data visualization.
- Execution result display.
- Manual confirmation entry points when needed.
- Browser-side execution bridges called by Codex/Claude-run scripts.

Panel files:

- `extension/panel.js`
- `extension/panel.html`

Current panel bridge capabilities include:

- `fetchAllData()`
- `fetchSevenDayUntouchedPools()`
- `execAdWrite(...)`
- `toggleAdState(...)`
- `appendInventoryOperationNotes(...)`
- `refreshRowsForExecutionEvents(...)`

The panel is not responsible for:

- Generating ad actions.
- Calling an AI model.
- Hosting an AI provider.
- Running strategy decisions.

## Orchestration Layer (Codex or Claude)

The deciding AI session is responsible for:

- Starting or using debug Chrome.
- Reading panel-exported snapshots.
- Understanding inventory, ads, historical actions, product stage, Q2 priorities, and risk context.
- Producing the unified action schema (with `approvedBy` set to `codex`, `claude`, or `manual`).
- Running dry-run validation.
- Calling execution scripts.
- Reading verification, note, and summary outputs.
- Deciding whether to continue, review, or stop.

This orchestration is outside the panel and outside any in-app AI runtime. Codex and Claude are peers — only one drives a given run, but both leave attributable records that the other can review afterwards.

## Script Layer

Repository scripts only do deterministic work:

- Data export.
- Schema validation.
- Risk gates.
- API execution.
- Result verification.
- Inventory note writing.
- Summary output.

Script entry points:

- `scripts/execute/open_debug_browser.ps1`
- `scripts/execute/export_snapshot.js`
- `scripts/execute/run_actions.js`
- `auto_adjust.js`
- `scripts/run_today_ops.js` (accepts `--actor codex|claude|manual`)
- `scripts/diagnostics/review_recent_decisions.js` (read-only cross-AI review)

Utility modules:

- `src/adjust_lib.js`
- `src/ai_decision.js`

`src/ai_decision.js` only builds context and validates/loads action schemas. It must not contain an AI provider runtime. The executable gate accepts `approvedBy` of `codex`, `claude`, or `manual`.

## Removed From Main Decision Flow

The old rule-style decision functions are not the main action source:

- `analyzeCard(...)`
- `touchActionForEntity(...)`
- `touchActionForSbCampaign(...)`
- `buildSevenDayPlans(...)`
- `mergePlans(...)`

If similar helper names remain for compatibility, they must not be used to secretly decide production actions.

## Preconditions For Real Runs

Before a real run:

1. Chrome is running with `--remote-debugging-port=9222`.
2. `adv.yswg.com.cn` is logged in.
3. `sellerinventory.yswg.com.cn` is logged in when note writing is needed.
4. The extension panel is open.
5. The driving CLI scripts can connect to `http://127.0.0.1:9222/json/list`.

Without the debug browser or panel page, scripts cannot find the bridge.

## Default Review Actions

These actions remain review-only:

- `create`
- `structure_fix`
- large bid changes
- strong actions on high-sales products
- listing edits
- price changes
- replenishment decisions

The deciding AI can recommend them, but execution must not auto-run them until the operator releases that scope.

## Decision Attribution

Every executable action carries `approvedBy` (`codex` / `claude` / `manual`). This attribution flows into:

- `data/adjustments/adjustments_<date>.json` (`approvedBy`, `actionSource`)
- `data/learning/daily_learning_<date>.{json,md}` (`decisions.decisionAttribution`)
- Inventory notes via `extension/panel.js:buildInventoryOperationNote` (`[由 Claude 决策]` / `[由 Codex 决策]` / `[人工决策]` prefix)

Use `node scripts/diagnostics/review_recent_decisions.js --by codex|claude|manual|all --days N` to audit recent activity by decision-maker.
