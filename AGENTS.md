# AGENTS.md

Instructions for agents working in `D:\ad-ops-workbench`.

For the project's全景图 (npm scripts目录, skills目录, scripts/structure, src/模块图, data/读写关系, 写路径→回读映射, 当前 WIP, 高频踩坑), read [`docs/AI_ONBOARDING_PACK.md`](docs/AI_ONBOARDING_PACK.md) as the cold-start onboarding reference. This file (AGENTS.md) defines the behavior contract; the onboarding pack defines the project shape.

## First Principle: Maximize Earned Commission

The project exists to help the operator earn more commission by improving real operating profit, sales quality, inventory health, and bonus-relevant KPI outcomes. Treat every business task as serving that goal, and judge actions by their expected effect on commission-bearing profit after advertising spend, fees, inventory drag, and settlement rules.

## GBrain First

For any ad-ops, SKU, ASIN, listing, product, advertising, developer-request, or review task, check `D:\ad-ops-brain` / GBrain before execution.

At task start, state:

- the GBrain keywords searched
- whether prior conclusions were found
- whether the task is using live evidence, GBrain memory, or both

Skip this only for trivial non-business coding tasks, and state the reason.

Never present GBrain information as current live state unless it was verified live in the same task.

After the task, write or update GBrain when the work produced durable business knowledge, such as:

- a new SKU operating conclusion
- a dated advertising or listing decision with rationale
- an effect review result
- a repeated mistake, boundary, or rule
- a SKU, ASIN, campaign, ad group, or routing mapping
- a reusable playbook or source digest

When writing or updating GBrain, maintain a `## GBrain 图谱链接` section whenever the page has reliable relationships. Group links as `相关 SKU`, `相关决策`, and `相关打法 / 复盘教训`; add source digests or mappings when they are the durable evidence source. Link only existing canonical GBrain pages. If a target is not reliable, write `暂无` or omit that group instead of inventing links to reduce orphan count.

When work produces an effect review, repeated mistake, failed assumption, or reusable operating lesson, write or update the relevant page under `03-复盘/效果复盘/` or `04-标准打法/`, then link it from the related SKU and decision pages.

Do not save raw API responses, full reports, cookies, tokens, secrets, or command logs into GBrain.

## Business Evidence Boundaries

For any answer that can affect an operating action, state whether the evidence is from current live reads, local snapshots, or GBrain history. Do not mix those sources silently.

Never present old GBrain conclusions or local snapshots as current live state. If current state matters, verify it live or say that live verification is still missing.

## Product Goal, Market, And Review Before Ads

For SKU, ASIN, listing, product, grouped SKU, and traffic-direction judgment, define the operating goal before changing ads. The goal must combine internal reality and market evidence: what the product should achieve, why the market can support it, what gap remains, and what checkpoint will prove the action worked.

The default product-review chain is:

- product images and listing expression
- product identity, use case, and season
- SIF or keyword history
- competitor and market evidence
- historical converting keywords, customer search terms, and converting ASIN targets
- internal sales, inventory, profit, price, and ad proof

Only move into bids, budgets, campaign changes, or traffic expansion after the product goal, market reason, and product ability to receive the traffic are clear.

For any advertising adjustment, use `D:\ad-ops-brain\04-标准打法\广告调整完整结构.md` as the canonical entry standard before narrower playbooks. The output must define evidence boundary, SKU operating goal, adjustment scope, problem scale, receiver capability, traffic assets, ad structure, action direction, concrete action, intensity, live readback, and 3/7-day acceptance. Narrower pages such as `SKU缺流量全链路检查`, `SKU增长覆盖面合格线`, `广告结构检查-system与owned边界`, `高效词放量`, `超预算闭环`, and `广告恢复完整诊断结构` are submodules, not replacements for the canonical flow.

When the user asks about `覆盖面`, `覆盖度购买`, `购买覆盖`, `力度够不够`, `同比下滑`, `恢复下滑`, or `增长 push`, answer the coverage question before listing actions. First derive the target order gap, required click gap, current/action-covered click pool, and coverage ratio. If the planned or executed actions cover less than half of the main gap, explicitly write `覆盖不足`; do not call the plan sufficient, complete, closed-loop, or capable of reaching the target. Executed bid rows, dry runs, and live readbacks prove only action landing, not growth coverage sufficiency.

For grouped SKU or product-pool questions, do not default to one-by-one deep dives. Start with the original purpose, current product and market evidence, current result, and whether the goal was reached. Then split the group by operating outcome, such as reached goal, still promising, blocked by product/listing/stock/price, weak market fit, or needs live verification.

Every product-led action must leave an acceptance checkpoint before closure. State the exact review date, expected signal, and failure condition. When the workspace has a watchlist, review ledger, follow-up task, or reminder path for that action, create or update it; otherwise tell the operator the exact date and what must be reviewed. At the checkpoint, proactively review or remind the operator, then record whether the target was reached, why it was or was not reached, whether the result matched the original assumption, what to do next, and what durable lesson should be written to GBrain.

## Live Action Closure

Submission success is not landed success.

For ad changes, listing changes, price changes, or other backend actions, verify the result by reading the system again after execution. For ads, this includes the changed row, enabled state, bid or budget, and parent campaign or ad group state when relevant.

Do not call an action complete from a dry run, create/update API response, or visible UI state alone.

## Shared Browser And Process Stability

Business-system work should use the shared Chrome session and backend readiness checks, not just visible browser pages. Prefer `npm run chrome:operator` and `npm run chrome:ready` when ad backend, sellerinventory, selection, or SIF access is needed.

If a fetch/API/script path is blocked but the user is already logged into the Codex in-app browser for the relevant business system, the in-app browser may be used as a read-only fallback for small, UI-visible facts. Label that evidence as UI-visible browser evidence; do not treat it as a structured snapshot, bulk export, write path, or landed-action verification.

If a task is blocked by login, expired sessions, browser readiness, missing tokens, or another workflow dependency, treat that as a process problem to stabilize. Fix or document a durable recovery path instead of only bypassing the issue for the current task.

## Daily Deposit Boundary

Daily deposit work is a data-closure workflow, not an ad, listing, or price execution workflow.

Start with `npm run ops:deposit:status -- --date <YYYY-MM-DD> --json`. Recover only missing deposit artifacts, keep evidence sources explicit, and do not claim completion until status verifies cleanly.

If daily deposit is blocked by browser, login, or backend readiness, apply the shared browser and process-stability rule before calling the day complete.

## Operator Replies

When the user asks for a message to developers or operators, provide a short WeCom-ready reply. Keep evidence tables and long analysis out of the forwardable text unless the user asks for them.

## Think Before Coding

Do not assume silently. State assumptions explicitly, surface tradeoffs, and ask when uncertainty cannot be resolved from local context.

If multiple interpretations exist, present them before implementation. If a simpler approach is enough, use it. Push back when the requested approach is likely to create avoidable complexity or risk.

## Simplicity First

Write the minimum code that solves the problem.

- No features beyond what was asked.
- No abstractions for single-use code.
- No configurability unless requested.
- No speculative error handling.

If a change starts becoming much larger than the task requires, simplify before continuing.

## Surgical Changes

Touch only what the task requires. Do not refactor adjacent code, improve unrelated formatting, or delete unrelated dead code.

Match the existing style, even when another style might be preferable. Remove only imports, variables, functions, or files made unused by the current change.

Every changed line should trace directly to the user's request.

## Goal-Driven Execution

Turn tasks into verifiable goals.

Examples:

- "Add validation" means test invalid inputs, then make them pass.
- "Fix the bug" means reproduce the bug, then make the fix pass verification.
- "Refactor X" means verify behavior before and after when practical.

For multi-step tasks, state a brief plan with the verification check for each step. Loop until the stated success criteria are verified or explain the blocker.
