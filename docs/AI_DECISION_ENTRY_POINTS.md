# AI Decision Entry Points

This repo supports two peer AI decision entry points: **Codex** and **Claude**. Both are operator-facing CLI sessions; neither runs inside the extension or scripts. A given operating run is driven by one of them at a time, but both leave attributable records that the other can review afterwards.

## Quick Reference

| Aspect | Codex CLI | Claude Code CLI |
|---|---|---|
| Config root | `.codex/config.toml` (wires MCP to debug Chrome) | `~/.claude/` (per-user) |
| Invocation | Operator types in Codex session | Operator types in Claude Code session, or via `/schedule` / `/loop` for unattended runs |
| Action schema filename | `data/snapshots/action_schema_<YYYY-MM-DD>_codex.json` | `data/snapshots/action_schema_<YYYY-MM-DD>_claude.json` |
| `approvedBy` in actions | `codex` | `claude` |
| `actionSource` in actions | `["codex"]` (or include `codex` in the list) | `["claude"]` (or include `claude` in the list) |
| Run command | `node scripts/run_today_ops.js --execute --actor codex` | `node scripts/run_today_ops.js --execute --actor claude` |

`--actor` defaults to `codex` when omitted. The resolver also looks for `RUN_ACTOR` env var.

## Architecture Symmetry

Both entry points use the same:

- Snapshot export (`scripts/execute/export_snapshot.js`)
- Validator (`src/ai_decision.js`)
- Executor (`auto_adjust.js`, `scripts/execute/run_actions.js`)
- Adjustment log (`src/adjustment_log.js`)
- Daily learning record (`src/daily_learning.js`)
- Inventory note writer (`extension/panel.js:buildInventoryOperationNote`)

The only divergence is the operator-facing AI session. There is no in-app API client for either Codex or Claude.

## Decision Attribution

Every executable action must carry:

- `approvedBy`: `codex`, `claude`, or `manual`
- `actionSource`: array including `codex`, `claude`, or `manual`
- `decisionStage`: `ai_approved` or `manual_approved`
- `requiresAiDecision`: `false`
- `canAutoExecute`: `true`

Missing any of these forces the action into review. See `src/ai_decision.js:executionApprovalFailures`.

The attribution is preserved across the execution chain:

- `data/adjustments/adjustments_<date>.json` records `approvedBy` and `actionSource` per row.
- `data/learning/daily_learning_<date>.{json,md}` aggregates by decision-maker in `decisions.decisionAttribution`.
- Inventory notes prefix with `[由 Claude 决策]`, `[由 Codex 决策]`, or `[人工决策]`.

## Cross-AI Review

Use the read-only review script to audit what the other AI has done:

```powershell
# Last 3 days, all decision-makers
node scripts/diagnostics/review_recent_decisions.js --days 3

# Only Claude's recent actions (when running as Codex)
node scripts/diagnostics/review_recent_decisions.js --by claude --days 7

# Only Codex's recent actions (when running as Claude)
node scripts/diagnostics/review_recent_decisions.js --by codex --days 7
```

Output is markdown to stdout, including SKU count, top action types, landed/failed stats, and recent reason snippets per decision-maker. It is a deliberate human-review surface — neither AI auto-merges or auto-overrides the other.

## What Each Session Should Read

Both Codex and Claude should consume the same operating context before deciding:

1. `README.md`
2. `memory.md`
3. `docs/CODEX_HANDOFF_RUNBOOK.md`
4. `docs/AI_DECISION_BOUNDARY.md`
5. `docs/Q2_AD_OPS_PLAYBOOK.md`
6. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`
7. `docs/STAGNANT_INVENTORY_RULES.md`
8. Latest `data/learning/daily_learning_<date>.{json,md}` from the previous run
9. Latest `data/adjustments/adjustments_<date>.json` to check recent cooldowns
10. `scripts/diagnostics/review_recent_decisions.js --days 3` if the prior run was driven by the other AI

## Non-Goals

- Neither Codex nor Claude generates copy/strategy inside the panel or scripts.
- No automatic second-opinion arbitration between the two AIs. If the operator wants a cross-check, they run the review script and manually re-author the schema.
- No in-app Anthropic SDK or API client.
