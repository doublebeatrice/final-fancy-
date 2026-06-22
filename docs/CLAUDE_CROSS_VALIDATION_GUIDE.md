# Claude Cross-Validation Guide

This guide makes the ad-ops workflow readable to Claude so Claude and Codex can cross-check each other without guessing from scattered scripts.

## Purpose

Use this document when Claude needs to:

- understand the process, script, and framework map;
- review a Codex decision or landed action;
- run the same workflow with `--actor claude`;
- explain a disagreement as an evidence or boundary issue.

This guide is a router. The source of truth remains the live backend, GBrain, `AGENTS.md`, and the referenced workflow docs.

## Evidence Boundaries

Always name the evidence source:

| Source | Can prove | Cannot prove |
|---|---|---|
| Live backend read | Current state, current row values, landed status | Future performance |
| Local snapshot/output | What a specific run captured or produced | Current backend state after time has passed |
| GBrain | Durable historical conclusion, rule, mapping, lesson | Current inventory, ad state, price, listing, or Buy Box |
| Docs | Intended workflow and boundaries | That a specific action landed |

For operating actions, use live evidence when current state matters. GBrain and docs explain how to decide; they do not replace current reads.

## Required First Pass

1. Read `CLAUDE.md`, `README.md`, and `AGENTS.md`.
2. Read `docs/CLAUDE_DIRECTION_PACK.md` for the current direction model.
3. Run the orientation check when Claude is the actor or reviewer.
4. Run the quality gate before Claude gives an operating conclusion.
5. Search GBrain when the task is business-facing.
6. Pick the smallest workflow that answers the question.
7. Discover commands with `scripts/maintenance/package_scripts_catalog.js` instead of memorizing script names.
8. Verify paths and outputs before reporting completion.

Orientation check:

```powershell
npm run ops:agent:orientation -- --actor claude --task "<operator request>"
```

JSON output:

```powershell
npm run ops:agent:orientation -- --actor claude --task "<operator request>" --json
```

Quality gate:

```powershell
npm run ops:agent:quality-gate -- --actor claude --task "<operator request>"
```

Script discovery:

```powershell
node scripts/maintenance/package_scripts_catalog.js --prefix ops:deposit
node scripts/maintenance/package_scripts_catalog.js --prefix ops:agent
node scripts/maintenance/package_scripts_catalog.js --query selection
node scripts/maintenance/package_scripts_catalog.js --files --query review
```

## GBrain Familiarity Check

Claude cannot be considered familiar with this project until it can prove the following at task start:

1. It has read `CLAUDE.md`, `AGENTS.md`, and the relevant workflow doc or skill.
2. It searched GBrain with object terms, workflow terms, failure-mode terms, and system/route terms.
3. It states whether GBrain returned prior conclusions.
4. It separates GBrain history from local snapshots and live evidence.
5. It names the missing live read when current state matters.

The matching durable GBrain rule is `D:\ad-ops-brain\playbooks\Claude-Codex交叉验证与GBrain调用.md`.

Recommended search pattern:

```powershell
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<SKU or ASIN or keyword>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<workflow term>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<failure mode or symptom>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<backend route or system term>"
```

Example: for a sellerinventory product-list task, do not only search the business phrase. Also search `/pm/list`, `/pm/formal/list`, `产品列表查不到`, `默认筛选`, `seller=空`, `SKU 查不到`, and `队列复核`. GBrain contains a 2026-06-18 Claude failure case where a too-narrow search missed the default-filter rule.

If the wrapper fails:

```powershell
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 doctor --json
```

Then follow `D:\ad-ops-brain\playbooks\GBrain-PGLite-WASM初始化恢复.md`. If the indexed search is still unavailable, use raw file search as a fallback and label the evidence as raw GBrain file search, not indexed GBrain recall.

If `doctor --json` reports `sync_freshness` stale or failed, do not rely on indexed search alone. Run raw file search in parallel:

```powershell
rg -n "<keyword>" D:\ad-ops-brain
```

Then state both evidence channels, for example: `GBrain indexed search returned X; raw GBrain file search returned Y; indexed source may be stale`.

## Workflow Map

| Task | Read first | Primary commands | Completion check |
|---|---|---|---|
| Daily deposit | `README.md`, `AGENTS.md` daily deposit section | `npm run ops:deposit:status -- --date <YYYY-MM-DD> --json` | Status is clean after recovering only missing artifacts |
| Daily ops | `docs/CODEX_HANDOFF_RUNBOOK.md`, `docs/CODEX_MINIMAL_CLOSED_LOOP.md` | `npm run ops:today -- --mode full-snapshot --actor claude` | Final run has matching manifest, summary, verify, report, and learning |
| Ad action or SKU traffic decision | GBrain first, `docs/PRODUCT_MARKET_EVIDENCE_STACK.md`, `docs/MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md`, `docs/BASIC_AD_ARCHITECTURE_WORKFLOW.md` | Evidence commands depend on SKU/keyword/ASIN; use selection and SIF entries from `package.json` | Dry-run, execute if authorized, then live readback of changed row and parent state |
| Listing copy | `docs/SEASONAL_LISTING_COPY_RULES.md`, `AGENTS.md` product goal rules | `npm run ops:listing-copy`, `npm run ops:listing-copy:withdraw` | sellerinventory application is submitted and read back; Amazon front page is separate propagation |
| Developer/product request | Relevant GBrain page, `.codex/skills/developer-product-inquiry/SKILL.md` | `npm run ops:agent:inbox -- --text "<message>"` when routing into agent ledger | Short WeCom-ready reply plus evidence boundary and next checkpoint |
| Agent control plane | `docs/AGENT_CONTROL_PLANE.md` | `ops:agent:*` commands discovered by prefix | Ledger, hub, reviews, evidence, feedback, and handoff agree |
| Cross-AI review | `docs/AI_DECISION_ENTRY_POINTS.md`, `docs/AI_DECISION_BOUNDARY.md` | `node scripts/diagnostics/review_recent_decisions.js --by codex --days 7` | Finding states evidence gap, logic conflict, landing conflict, stale state, or scope conflict |
| Code/documentation change | `AGENTS.md`, relevant docs/tests | `npm test` or focused test; `node --check <file>` for JS | Test or syntax check run, or blocker stated |

## Script And Framework Map

| Path | Role |
|---|---|
| `CLAUDE.md` | Claude's root entry and cross-validation habit |
| `AGENTS.md` | Mandatory agent rules for this repository |
| `README.md` | Human and AI project overview |
| `docs/` | Architecture, workflow, runbook, playbook, and handoff docs |
| `.codex/skills/` | Codex business skills; Claude should read the relevant `SKILL.md` for task-specific procedure |
| `scripts/` | Executable entry points for browser, reads, writes, deposits, agents, reports, diagnostics |
| `src/` | Deterministic runtime, validation, decision-support, ledgers, and closed-loop logic |
| `tests/` | Regression tests for scripts and modules |
| `data/snapshots/` | Runtime snapshots, execution summaries, verification outputs |
| `data/adjustments/` | Adjustment ledger |
| `data/learning/` | Daily learning, corrections, and durable local lessons |
| `data/agent/` | Agent ledger, hub, review, evidence, handoff, readiness outputs |
| `D:\ad-ops-brain` | GBrain operating memory, standard playbooks, SKU conclusions, decisions, effect reviews |

## Cross-AI Review Procedure

1. Identify the actor, date, task, and claimed result.
2. Read recent decision attribution:

```powershell
node scripts/diagnostics/review_recent_decisions.js --days 3
node scripts/diagnostics/review_recent_decisions.js --by codex --days 7
```

3. Inspect the matching artifacts:

```text
data/snapshots/action_schema_<date>_<actor>.json
data/snapshots/execution_summary_<date>.json
data/snapshots/execution_verify_<date>.json
data/adjustments/adjustments_<date>.json
data/learning/daily_learning_<date>.md
data/agent/agent_handoff_<date>.md
```

4. If the question affects current operations, perform the smallest live read that covers the claim. Do not use old local files as current state.
5. Classify the issue as `evidence_gap`, `logic_conflict`, `landing_conflict`, `stale_state`, or `scope_conflict`.
6. If Claude takes over execution, write a new Claude-attributed schema or action record. Preserve Codex's prior record as audit history.

## Common Command Families

Browser and readiness:

```powershell
npm run chrome:operator
npm run chrome:ready
npm run ops:browser:probe
```

Deposit and reporting:

```powershell
npm run ops:deposit:status -- --date <YYYY-MM-DD> --json
npm run ops:deposit:recover-raw -- --date <YYYY-MM-DD>
npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>
npm run ops:deposit:quick-summary -- --date <YYYY-MM-DD>
npm run ops:closure:verify -- --date <YYYY-MM-DD>
```

Market and product evidence:

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<term1, term2>"
npm run ops:selection:keyword-conversion -- --keywords "<term1, term2>"
npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"
npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"
npm run ops:selection:product-time-machine -- --search-keywords "<term1, term2>"
npm run ops:sif:keyword-history -- --keyword "<term>"
npm run ops:sif:reverse-keywords -- --asin <ASIN>
```

Agent loop:

```powershell
npm run ops:agent:inbox -- --text "<external request>"
npm run ops:agent:hub -- --ledger data\agent\agent_ledger_<date>.json --today <date>
npm run ops:agent:review-effect -- --queue data\agent\review_queue_<date>.json --collect-evidence --today <date>
npm run ops:agent:closed-loop -- --self-test
```

## Maintenance Rule

Keep `CLAUDE.md` short. When a workflow changes, update the specific workflow doc first, then update this guide only if Claude's route to that workflow changes. Do not turn `CLAUDE.md` into a historical log.
