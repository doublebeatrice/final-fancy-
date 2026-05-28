# Codex Retrospective Experience Profile

Updated: 2026-05-27

Scope: this document distills reusable lessons from local Codex conversations, execution logs, rollout summaries, project memory, and the current `D:\ad-ops-workbench` rules. It is a behavior profile for future Codex sessions, not a changelog.

## Source Coverage

- Raw Codex session scan: 70 unique local sessions from 2026-04-09 through 2026-05-27; 38 were rooted in `D:\ad-ops-workbench`.
- Rollout summary scan: 114 memory summaries under `C:\Users\Administrator\.codex\memories\rollout_summaries`.
- Codex runtime log scan: `C:\Users\Administrator\.codex\logs_2.sqlite` contained 134,408 log rows at review time.
- Project rule scan: `AGENT.md`, `memory.md`, key `docs/`, repo-local `.codex/skills`, and user-level Codex memory.

The most reusable signals were repeated operator corrections, "Failures and how to do differently" sections, packaging or automation postmortems, SKU/product judgement doctrine, UI complaints, and landed-state verification incidents.

## Execution Lessons

### 1. Do Not Confuse Output With Closure

Problem: earlier runs sometimes treated script success, API success, submitted applications, generated files, or dry-run results as if the business action had landed.

Correct method: separate each status explicitly:

- `dry_run_passed`
- `api_success`
- `submitted_pending_review`
- `landed_verified`
- `not_landed`
- `blocked`

Lesson: a task is not closed until the required surface has been verified. Ads need backend row readback; sellerinventory edits may only be submitted to review; Amazon front-end propagation is a separate state. When the user asks whether something "过了", answer with landed verification, not intent or submission.

### 2. Execute When Preconditions Are Met

Problem: Codex sometimes stopped at analysis, review, or low-risk suggestions even when the user expected operational execution.

Correct method: if the action is supported, evidence is sufficient, and required dry-run gates pass, execute it and verify landing. Use `review` only for unsupported surfaces, missing required identifiers, or actions that cannot be verified.

Lesson: "risk" is routing, not refusal. Risk changes batch size, evidence threshold, approval boundary, rollback plan, and observation window; it must not become a generic excuse to skip the operational action.

### 3. Business Result Beats Execution Count

Problem: some days had many landed actions but sales, units, ACOS, refunds, or net profit moved the wrong way.

Correct method: judge the total business surface first, then evaluate whether actions helped. A daily loop should include total-result diagnosis, risk pool, old-product repair, opportunity recovery, execution, landed verification, and follow-up learning.

Lesson: never report a day as healthy only because many actions landed. Execution volume is a process metric; KPI, profit, refund, sales, and relative trend are result metrics.

### 4. Product Judgement Is Not ACOS Sorting

Problem: "过 SKU / 过产品" was sometimes reduced to an ad metrics scan or ACOS-first response.

Correct method: start with product identity, lifecycle or node stage, stage target, target gap, reason, action, and follow-up checkpoint. For seasonal SKUs, define stage-specific expectations before peak, not after ACOS deteriorates.

Lesson: the stable decision shape is `product identity -> node/stage -> target -> gap -> reason -> action -> follow-up`. Evidence is flexible; the framework is not a closed checklist.

### 5. Market Evidence Is Default, Not Optional

Problem: product, keyword, or traffic judgements sometimes stayed inside ad backend and inventory data, creating a partial picture.

Correct method: when demand, product fit, keyword creation, traffic recovery, developer requests, or "can this product be pushed?" are involved, use the market evidence stack by default: competitor pool, ABA, keyword conversion, keyword seasonality, Product Time Machine, SKU/ad proof, listing/price fit, inventory/economics, and action history.

Lesson: selection evidence is read-only; it forms hypotheses and boundaries. Executable ad changes still require normal schema, dry-run, execution, and landing verification.

### 6. Use The Smallest Live Interface That Answers The Question

Problem: broad full-snapshot exports were used for named-SKU questions, while stale or capped data could distort judgement.

Correct method: choose a narrow live interface first:

- SKU health: `/product/adSkuSummary`.
- SKU ad-row breakdown: `/product/adProductData`.
- Specific ad group rows: `/keyword/findAllNew` with local filtering.
- Campaign placement: `/placement/findAllPlacement`.
- Full snapshot: cross-SKU discovery, prioritization, or daily closure.

Lesson: live, narrow evidence is faster and cleaner. Full exports are for broad pool work, not every question.

### 7. Cached Data Is A Liability Unless Named

Problem: hidden local snapshot fallback or stale cache made workflows look structurally successful while product metadata or account mapping was still wrong.

Correct method: fetch current data from the logged-in browser session by default. If fallback is needed for development, make it explicit and label it as fallback evidence.

Lesson: never let local caches silently stand in for live state. Stale cache should block or warn, not quietly power a production path.

### 8. UI Must Hide Technical Internals By Default

Problem: user-facing flows exposed raw payload JSON or backend technical routes, which made the tool feel unsafe and unfinished.

Correct method: show business-facing fields, row states, validation results, and clear next actions. Keep raw payloads behind diagnostics only.

Lesson: the user's visible workflow is part of correctness. A backend fix is incomplete if the screen still exposes the wrong mental model.

### 9. Team Tools Must Be Simple, Stable, Fast, And Local

Problem: planning sometimes drifted toward central queues, shared execution, machine-specific shortcuts, or technical launch paths.

Correct method: for team-facing desktop tools, prefer local per-user state, local session bridging, fixed templates, paste-friendly batch input, row-level validation, append/reuse support, portable launchers, and version-gated packages.

Lesson: privacy and adoption matter. Each operator's ads must not be visible to coworkers unless explicitly designed that way. A package is not ready until the actual coworker artifact is tested.

### 10. Packaging Is A Real Verification Stage

Problem: source fixes were sometimes treated as done before rebuild, version checks, connector reload, and dist hygiene.

Correct method: run tests, build the package, check release metadata, verify connector/app versions, confirm packaged contents, and exclude local caches.

Lesson: "fixed locally" is not "ready for the team." Final proof must match the artifact the user or coworker will run.

### 11. Automation Must Update Existing Objects And Prove Runtime State

Problem: automation work can accidentally create duplicates or prove only the command, not the installed scheduler.

Correct method: inspect existing automation or scheduler state first. Prefer updating the object that already owns the slot. Verify schedule, command, working directory, heartbeat, last run result, and completion audit.

Lesson: a schedule definition is not operational proof. Runtime evidence matters.

### 12. Candidate Pools Must Be Closed, Not Left As Fog

Problem: small high-confidence batches were executed while hundreds of remaining SKUs stayed in an unresolved observation pool.

Correct method: classify the full candidate universe into `execute now`, `manual diagnosis with reason`, or `no action with reason`. Keep open blockers explicit.

Lesson: the operator should not have to ask "is that all?" or "what about the rest?" The agent owns the pool until every item has a state.

### 13. Bulk Actions Need Hypotheses And Measurement Windows

Problem: bulk adjustments were recorded as actions without enough expected-effect metadata to learn from later.

Correct method: every schema or deposit for meaningful adjustments should include hypothesis, expected effect, measurement window, baseline, and rollback or review condition.

Lesson: action without expected effect cannot teach the next run. Preserve the reason and the observation window with the action.

### 14. Operator Corrections Are First-Class Signals

Problem: corrections were sometimes treated as conversation feedback rather than reusable system risk.

Correct method: when the user says a decision was wrong, stale, mis-scoped, risky, not landed, or may affect similar SKUs, scan for same-rule risk, produce rollback or secondary review tasks, and write a scoped learning patch.

Lesson: user correction should change future behavior, not only the current answer.

### 15. Listing And Sellerinventory Work Need Live Source Baselines

Problem: listing copy plans sometimes relied on snapshot fields that were missing or stale, or submitted edits with mismatched original data.

Correct method: before copy submission, fetch live origin data from sellerinventory and compare the current parent/title/bullets/ST fields with the plan. Treat successful backend response as `submitted_pending_review`.

Lesson: listing submission is not Amazon-front-end landing. Source mismatch must stop submission.

### 16. Windows And Chinese Text Need Encoding Discipline

Problem: PowerShell inline Chinese form construction and some shell display paths produced mojibake or `???`.

Correct method: use UTF-8 mode for skill validation and Chinese metadata (`PYTHONUTF8=1` where relevant), build browser-side form bodies with `URLSearchParams` for sellerinventory submissions, and keep PowerShell edits narrow around stable anchors.

Lesson: encoding is an execution risk, not a cosmetic issue, when the backend stores remarks or product copy.

### 17. Skill And Rule Packaging Must De-Duplicate First

Problem: repeated workflow mining can create overlapping skills or broad essays that slow future agents down.

Correct method: present a compact candidate list first, check personal and repo-local skill coverage, then create or extend only high-confidence missing gaps.

Lesson: narrow, source-aware, validated skills beat broad new automation. If coverage already exists, extend or skip.

### 18. Codex Health Work Must Preserve Efficiency

Problem: performance cleanup can become "make Codex lighter" in a way that reduces the user's capability or workflow speed.

Correct method: diagnose symptom class, session visibility, plugin sync, state churn, and process pressure. Preserve sessions and intelligence first; cleanup should be verified and reversible.

Lesson: making Codex smoother must not lower the user's efficiency or reduce useful context.

## User Style Profile

### UI Design Preferences

- Build the usable work surface first; do not lead with a marketing page when the user asked for a tool.
- Keep operational tools quiet, dense, scannable, and business-facing.
- Hide raw payloads, backend routes, and technical JSON unless explicitly opening diagnostics.
- Prefer fixed templates, paste-friendly tables, row-level states, and clear error reasons for team workflows.
- Use Chinese operator wording where the user or coworkers will read it; keep it short and concrete.
- Make normal launch paths silent and simple; keep console windows for diagnostics.
- Use visible, shallow project roots for long-lived collaboration folders.
- Avoid exposing one user's private ad data to another user in team tools.
- Treat screenshots and "this page feels wrong" as product bugs, not just UI polish.

### Product Design Philosophy

- The product should make the operator faster than manual work, not merely reproduce manual steps.
- Local per-user state is preferred when privacy, account sessions, or ad data independence matters.
- First versions should have a narrow, complete scope instead of broad partial promises.
- Workflow outputs should be operator-visible: handoff, dashboard, next actions, verification, and open blockers.
- Diagnostic details should exist, but not dominate the primary workflow.
- Version gates, readiness checks, and packaged artifact verification are part of the product experience.
- If a workflow will repeat, turn it into a command, skill, document rule, or machine-readable learning artifact after it proves useful.

### Interaction Principles

- Be proactive: inspect real state, make a judgement, execute supported actions, verify landing, and report the final state.
- Do not stop at "I can do X" when the user asked for the result.
- Use exact dates and exact paths. Avoid vague "today/recently" when dates matter.
- Tell the truth about incomplete states: dry-run, submitted, blocked, not landed, or pending review.
- Keep developer/product replies short: what was wrong, what was corrected, and what will be watched next.
- When explaining architecture or automation, use a diagram or direct command-chain view instead of abstract prose.
- When uncertain, gather evidence first. Ask the user only when the answer cannot be discovered and a wrong assumption would be costly.
- Respect token and time pressure: once the useful proof path is green, stop rather than over-explaining.

### Operating Philosophy

- Market first, then ad levers. Product/keyword judgement should build the real demand and traffic picture before changing bids or budgets.
- Product stage beats static totals. Compare 3-day, 7-day, and 30-day direction and understand lifecycle/node stage.
- Profit fields must be used correctly. Do not treat raw `profitRate` as gross or net margin when net-profit guardrails exist.
- Risk is an execution design input, not a reason to refuse supported work.
- Every action should be measurable. Hypothesis, expected effect, measurement window, and rollback condition matter.
- Learning must become durable. A correction or useful pattern should land in memory, docs, skill instructions, or data/learning artifacts.

## Reusable Rules For Future Codex Sessions

### Before Acting

- Read this profile before major work in `D:\ad-ops-workbench`.
- Read the project rule stack named in `AGENT.md`; do not rely on memory alone.
- Identify whether the task needs live proof. If yes, probe the live system instead of trusting cached files.
- Choose the smallest interface that answers the user's question.
- Check recent action history, cooldown, and landed-state evidence before repeating actions.
- For product, keyword, traffic, or developer/product judgement, apply the market evidence stack by default.

### During Judgement

- Start from the business question, not the available script.
- For SKU/product work, produce product identity, stage, target, gap, cause, action boundary, and follow-up.
- For candidate pools, classify every item into execute, diagnosis, no-action, or blocked with reason.
- Treat selection evidence as read-only and hypothesis-forming.
- Do not use fallback data silently.
- Do not let risk become refusal when the action is supported and verifiable.

### During Execution

- Dry-run before writes when the workflow supports it.
- Execute supported actions when evidence and gates pass.
- Verify landing through the live backend or the required target surface.
- Record API success separately from true landed success.
- Write notes/logs/learning artifacts only after confirming the final state.
- For sellerinventory and listing submissions, state `submitted_pending_review` unless the Amazon front-end is verified.

### For UI Or Product Work

- Keep the default UI business-facing and hide technical payloads.
- Provide row-level prechecks, states, and clear action labels.
- Package and verify the artifact the user will actually run.
- Require version gates when stale connectors or clients can cause hidden failures.
- Prefer local per-user isolation unless the user explicitly asks for shared state.

### For Learning And Documentation

- When the user says "记住", "沉淀", "复盘", or corrects a rule, turn it into a durable artifact.
- Add rules to the narrowest durable surface that future sessions will actually read.
- Prefer updating existing docs/skills over creating duplicates.
- Keep `AGENT.md` as a rule index, not a narrative changelog.
- Store long explanations in `docs/` and machine-readable daily learning under `data/learning/` or `data/agent/`.

### For Final Replies

- Lead with what was done and what is verified.
- Name files, commands, counts, and final status when they matter.
- If something could not be verified, say so plainly.
- Keep replies concise unless the user explicitly asks for full reasoning.

## Load Contract

This file is referenced from `.agent/config.toml` and from `AGENT.md` so future Codex sessions have a stable entry point for the user's accumulated execution lessons and design preferences.
