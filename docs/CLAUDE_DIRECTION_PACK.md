# Claude Direction Pack

This is the short operating compass for Claude in `D:\ad-ops-workbench`.
Read it after `CLAUDE.md` and before any business judgment.

## Does It Update?

Yes, in two layers:

- Dynamic checks update every run through `npm run ops:agent:orientation -- --actor claude --task "<task>"`. The script reads current `package.json` scripts, verifies required docs, checks GBrain doctor status, and derives task-specific GBrain search angles.
- Durable lessons update through GBrain and workflow docs. When a repeated mistake, rule, backend route, or acceptance boundary appears, write it to GBrain first and update this pack only if Claude's route changes.

Do not treat this file as a history log. It is a compass.

## Default Direction

Most business tasks flow like this:

```text
GBrain search
-> evidence boundary
-> product goal
-> market reason
-> receiver capability
-> traffic/action scope
-> dry-run or write if authorized
-> live readback
-> 3/7-day checkpoint
-> GBrain if durable
```

If the operator asks whether a SKU or product can be pushed, start from product, market, listing, price, inventory, and historical traffic fit. Do not start from bid changes.

If the operator asks whether an action passed or landed, start from execution evidence plus live or run-scoped readback. API success is not landed success.

If the operator says today, latest, current, or now, GBrain and local snapshots are context only. Current state needs a live read.

## Project Shape

| Path | Why Claude reads it |
|---|---|
| `CLAUDE.md` | Root entry, read order, actor boundary, GBrain call protocol |
| `AGENTS.md` | Mandatory project rules, evidence boundaries, GBrain First |
| `README.md` | Project overview and common workflow commands |
| `docs/CLAUDE_CROSS_VALIDATION_GUIDE.md` | Cross-AI review procedure and script map |
| `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` | Product and market evidence before ads |
| `docs/BASIC_AD_ARCHITECTURE_WORKFLOW.md` | Base ad structure and adjustment framing |
| `docs/AGENT_CONTROL_PLANE.md` | Agent ledger, review, evidence, handoff loop |
| `.codex/skills/` | Task-specific business SOPs that Claude should read when relevant |
| `D:\ad-ops-brain` | GBrain operating memory, playbooks, decisions, effect reviews |

## Directional Heuristics

- Business value first: commission-bearing profit, sales quality, inventory health, and bonus-relevant KPI outcomes.
- Evidence boundary first: live backend, local snapshot, GBrain history, and docs prove different things.
- Product before ads: market reason and receiver capability come before traffic expansion.
- Coverage before confidence: when the task is about growth or recovery, calculate whether action coverage can fill the gap.
- Readback before closure: dry-run success and API success are not enough for landed action closure.
- Review dates matter: every product-led action needs an acceptance checkpoint.
- Risk is often routing: the failure is commonly the wrong evidence route, not lack of effort.

## Common Wrong Turns

| Wrong turn | Correct route |
|---|---|
| Search only the business phrase in GBrain | Search object, workflow, failure-mode, and system-route terms |
| Treat GBrain as current state | Treat GBrain as historical/rule evidence unless verified live |
| Treat API success as landed success | Read back the changed row and parent campaign/ad group state |
| Judge a SKU only from inventory or ads | Check product goal, market evidence, listing, price, inventory, profit, and traffic proof |
| Call a growth plan enough because some rows executed | Calculate order gap, click gap, action-covered click pool, and coverage ratio |
| Clear sellerinventory default filters while debugging | Preserve the original request body and filters, then cross-check detail/readback |

## GBrain Search Angles

For business tasks, Claude should search at least four angles:

- Object terms: SKU, ASIN, campaign, ad group, keyword, product line, seller/account.
- Workflow terms: advertising adjustment, listing, daily deposit, developer request, selection, price, inventory, review.
- Failure-mode terms: 未落地, 读回, 旧快照, 默认筛选, 覆盖不足, 无点击, 无转化.
- System/route terms: `adv`, `sellerinventory`, `selection`, `/pm/list`, `/pm/formal/list`, `/keyword/findAllNew`.

If `run-gbrain.ps1 doctor --json` reports stale sync freshness, indexed GBrain search may still be useful but incomplete. Run raw file search too:

```powershell
rg -n "<keyword>" D:\ad-ops-brain
```

## Orientation Command

Run this at Claude task start:

```powershell
npm run ops:agent:orientation -- --actor claude --task "<operator request>"
```

JSON form:

```powershell
npm run ops:agent:orientation -- --actor claude --task "<operator request>" --json
```

This command does not replace judgment. It creates the current briefing that Claude must use before cross-validating Codex or taking over a workflow.

## Quality Gate

Run this after orientation when Claude is about to judge, execute, or cross-validate a business task:

```powershell
npm run ops:agent:quality-gate -- --actor claude --task "<operator request>"
```

The gate scores five dimensions, 20 points each:

- Task routing: whether the task was mapped to the right operating route.
- GBrain search quality: whether object, workflow, failure-mode, and system-route terms are present.
- Evidence boundary quality: whether live/local/GBrain/docs boundaries are separated.
- Runtime efficiency: whether the next path uses the shortest effective scripts and avoids broad rereads.
- Operating output quality: whether the answer will serve profit, sales quality, inventory health, readback, and 3/7-day acceptance.

Low scores mean Claude should not jump into an operating conclusion yet. It should first fill the missing route, evidence, or efficiency gap.
