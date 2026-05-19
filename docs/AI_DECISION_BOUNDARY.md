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

## Execution And Review Boundary

Advertising strategy risk is not a default review reason. The deciding AI session should execute supported advertising actions when it believes the action can improve profit, sales quality, inventory turnover, or KPI trajectory, then learn from the next data cycle.

The 2026-05-14 operating retrospective is part of this boundary: `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md`. The deciding AI must complete the whole daily operating loop directly rather than stopping after staged rounds. Every daily plan must include overbudget classification, refund gating, evidence-backed opportunity recovery, same-SKU cooldown, and explicit candidate closure. Execution volume alone is not a success metric if sales, units, net profit, refund, or ACOS deteriorate.

For supported ad actions, use explicit approval plus `forceExecute: true` when overriding conservative risk gates. The schema must carry:

- `decisionStage: "ai_approved"` or `"manual_approved"`
- `approvedBy: "codex"`, `"claude"`, or `"manual"`
- `actionSource` including the approving actor
- `requiresAiDecision: false`
- `hypothesis`
- `expectedEffect`
- `reviewPlan` or measurement windows and rollback condition

Price execution has one verified non-advertising path: sellerinventory price applications generated from the Ful+Res shortage rule. The SKU must be normal-sale, 7d Ful+Res sellable days must be below 30, the target must be normalized to a `.99` ending, dry-run must pass, and the run must include post-write verification. If `fulResUnits <= 7` or `sellableDays7d <= 7`, the schema must pause enabled SKU ad delivery first at the productAd/SB row level where available. Sellerinventory success is a backend application marker, not Amazon-front-end propagation.

These remain review-only or blocked because they are outside the current verified execution surfaces:

- SB `create` until the real SB creation interface is captured and verified.
- `structure_fix` without a concrete writable entity.
- listing edits unless the listing-copy application flow is explicitly used, the edit passes `docs/SEASONAL_LISTING_COPY_RULES.md` or explicit approval gates, and the result is reported as `submitted_pending_review`.
- price changes outside the verified Ful+Res sellerinventory price-execution path.
- replenishment decisions.
- unknown/out-of-scope SKUs or entities.
- actions missing required ids/fields or post-write verification mapping.
- writes that return API success but do not land; report these as `not_landed` or technical blockers, not as business review.

Known 2026-05-12 technical issue: SP campaign `enable` can return API success while the campaign remains paused. This is not a manual-review decision; it is an automation/endpoint issue and must not be counted as landed success until visible verification passes.

## Decision Attribution

Every executable action carries `approvedBy` (`codex` / `claude` / `manual`). This attribution flows into:

- `data/adjustments/adjustments_<date>.json` (`approvedBy`, `actionSource`)
- `data/learning/daily_learning_<date>.{json,md}` (`decisions.decisionAttribution`)
- Inventory notes via `extension/panel.js:buildInventoryOperationNote` (`[由 Claude 决策]` / `[由 Codex 决策]` / `[人工决策]` prefix)

Use `node scripts/diagnostics/review_recent_decisions.js --by codex|claude|manual|all --days N` to audit recent activity by decision-maker.
