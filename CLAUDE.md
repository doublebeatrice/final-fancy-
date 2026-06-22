# CLAUDE.md

Claude Code working in `D:\ad-ops-workbench` should start here.

This file is a short routing map, not a changelog. If anything conflicts, follow the user's latest request first, then `AGENTS.md`, then this file.

## Read Order

1. `README.md` for the current project overview and common commands.
2. `AGENTS.md` for mandatory agent behavior, GBrain, evidence, execution, and coding rules.
3. `docs/CLAUDE_DIRECTION_PACK.md` for the short operating compass and update model.
4. `docs/CLAUDE_CROSS_VALIDATION_GUIDE.md` for Claude/Codex cross-validation workflow.
5. `docs/AI_DECISION_BOUNDARY.md` for the AI/script/panel boundary.
6. `docs/AI_DECISION_ENTRY_POINTS.md` for Codex and Claude attribution rules.
7. `docs/CODEX_HANDOFF_RUNBOOK.md` for run order, read paths, and troubleshooting.
8. `docs/AI_ONBOARDING_PACK.md` for the cold-start全景图: npm scripts全表, skills目录, scripts/全景图, src/模块图, data/读写关系, 写路径→回读映射, 当前 WIP 主题, 高频踩坑.
9. The relevant `.codex/skills/<skill>/SKILL.md` or GBrain playbook for the specific business task.

## Operating Rules

- The business goal is earned commission through real operating profit, sales quality, inventory health, and bonus-relevant KPI outcomes.
- For ad-ops, SKU, ASIN, listing, product, advertising, developer-request, or review tasks, search `D:\ad-ops-brain` before execution. State the searched keywords, whether prior conclusions were found, and whether the answer uses live evidence, local snapshots, GBrain history, or a mix.
- Never present GBrain or old local snapshots as current live state. If current state matters, verify live or say live verification is missing.
- Product goal, market evidence, listing/price/inventory receiver capability, and historical converting traffic come before bid, budget, keyword, campaign, or listing actions.
- Dry-run success and API success are not landed success. Any write path must be verified by reading the backend again.
- Daily deposit is a data-closure workflow, not an ad/listing/price execution workflow. Start with `npm run ops:deposit:status -- --date <YYYY-MM-DD> --json`.
- Do not store cookies, tokens, JWT, CSRF, XSRF, Inventory-Token, or raw API secrets in docs, GBrain, or committed files.

## GBrain Call Protocol

For business tasks, Claude must do more than one narrow search. Search four angles before deciding:

1. Object terms: SKU, ASIN, campaign, ad group, keyword, product line, or seller/account.
2. Workflow terms: listing, advertising adjustment, daily deposit, developer request, selection, price, inventory, review.
3. Failure-mode terms: not landed, readback, stale snapshot, default filter, blocked, no traffic, no clicks, conversion loss.
4. System/route terms when relevant: `adv`, `sellerinventory`, `selection`, `/pm/list`, `/pm/formal/list`, `/keyword/findAllNew`.

Use the wrapper when available:

```powershell
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<keyword>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 doctor --json
```

If GBrain search fails, run `doctor --json`; if PGLite or WASM initialization fails, read `D:\ad-ops-brain\04-标准打法\GBrain-PGLite-WASM初始化恢复.md` before falling back to raw file search.

If `doctor --json` reports `sync_freshness` as stale or failed, indexed search may still work but may not include the newest Markdown changes. In that case, also run raw file search such as `rg -n "<keyword>" D:\ad-ops-brain` and label the result as raw GBrain file evidence.

## Claude As Peer Actor

Claude and Codex are peer AI decision entry points. A run is driven by one actor at a time.

- Claude-run action schemas use `data/snapshots/action_schema_<YYYY-MM-DD>_claude.json`.
- Claude-approved actions must include `approvedBy: "claude"` and `actionSource` containing `"claude"`.
- Use `--actor claude` when Claude is driving a daily run.
- To review Codex work, use read-only evidence and the recent-decision reviewer. Do not silently overwrite Codex output; produce a new finding, critique, or Claude-attributed schema.

Useful commands:

```powershell
npm run chrome:operator
npm run chrome:ready
npm run ops:agent:orientation -- --actor claude --task "<operator request>"
npm run ops:agent:quality-gate -- --actor claude --task "<operator request>"
npm run ops:today -- --mode full-snapshot --actor claude
npm run ops:today -- --execute --mode full-snapshot --actor claude
node scripts/diagnostics/review_recent_decisions.js --by codex --days 7
node scripts/maintenance/package_scripts_catalog.js --prefix ops:agent
```

## Cross-Validation Habit

Before disagreeing with another agent, classify the issue:

- `evidence_gap`: the other answer lacks live, local, or GBrain evidence needed for the claim.
- `logic_conflict`: the evidence is present but the operating conclusion does not follow.
- `landing_conflict`: execution was reported complete but readback or verification is missing or contradictory.
- `stale_state`: the answer relies on an old snapshot or GBrain history where current live state matters.
- `scope_conflict`: the action crosses a documented boundary, such as unsupported write surface, missing approval, or missing verification mapping.

Then give the operator a short conclusion, the evidence boundary, and the exact next verification command or read path.
