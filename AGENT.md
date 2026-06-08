# Agent Instructions

This project is operated by a single operator-facing AI session — either Codex or Claude — as the AI decision entry point for any given run. Both are peers; neither is hosted inside the extension or scripts.

## Required Read Order

Before running or changing the workflow, read:

1. `README.md`
2. `memory.md`
3. `docs/CODEX_RETROSPECTIVE_EXPERIENCE_PROFILE.md`
4. `docs/CODEX_HANDOFF_RUNBOOK.md`
5. `docs/AI_DECISION_BOUNDARY.md`
6. `docs/AI_DECISION_ENTRY_POINTS.md`
7. `docs/Q2_AD_OPS_PLAYBOOK.md`
8. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`
9. `docs/STAGNANT_INVENTORY_RULES.md`
10. `docs/SEASONAL_LISTING_COPY_RULES.md`
11. `docs/PRODUCT_MARKET_EVIDENCE_STACK.md`
12. `docs/MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md`
13. `docs/SELECTION_KEYWORD_RESEARCH.md`
14. `docs/SKU_LESSON_SYSTEM.md`
15. `docs/SELECTION_KEYWORD_CONVERSION_RATE.md`
16. `docs/SELECTION_ABA_SEARCH_TERMS.md`
17. `docs/SELECTION_KEYWORD_SEASONALITY.md`
18. `docs/PERFORMANCE_HYGIENE.md`
19. `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md` if present

## Architecture Boundary

The extension panel is not an AI product. It only captures data, exports structured snapshots, visualizes rows, exposes execution bridges, shows results, and supports manual confirmation.

The deciding AI session (Codex or Claude) performs the decision work outside the panel:

- Read snapshot and docs.
- Understand ad, inventory, Q2, product-stage, and history context.
- Produce a unified action schema.
- Run dry-run validation.
- Execute through scripts.
- Verify result landing.
- Write inventory notes.
- Generate summary.

Do not add an OpenAI-compatible provider or AI runtime inside the panel. Do not keep a second strategy layer in code.

## Execution Discipline

- Code may validate schema, execute APIs, verify, write notes, and summarize.
- Code must not secretly decide strategy through old rule trees.
- Daily operations must be run as one complete operating loop, not as staged "rounds" that wait for the user to push the next step. The loop is: data health check, total-result diagnosis, overbudget/high-refund/high-ACOS risk pool, old-product repair pool, evidence-backed opportunity pool, dry-run, execute, landing verification, notes/logs, and daily learning/follow-up. The 2026-05-14 retrospective lives at `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md` and must be read before the next daily decision pass.
- Every daily loop must include SKU operating review, not a flat metric checklist. For every eligible SKU, classify product identity, lifecycle/node stage, operating route, stage target, target status, action boundary, and follow-up point. `all_sku_operating_review_<date>.json/html` or an equivalent full-SKU review is a daily closure artifact, and its lessons must feed daily learning.
- Named SKU and seasonal/event-window reviews must check `data/tasks/sku_watchlist.json` first. Keep unresolved SKU follow-ups in that single watchlist with next-check dates, stage targets, open issues, close conditions, and evidence files; do not create per-SKU conversation automations unless the operator explicitly asks for one. See `docs/SKU_WATCHLIST_OPERATING_RULE.md`.
- SKU lessons are reusable decision units, not slogans. Record scope, evidence, transfer boundary, `doNotApplyWhen`, conflict status, and next validation under `data/learning/sku_lessons/` when a lesson can affect future SKUs. Never generalize one variant's keyword failure to the whole parent group without fresh variant-level evidence. Resolve conflicts using `docs/SKU_LESSON_SYSTEM.md`.
- Long-term learning must be machine-readable before it is trusted. Closed-loop runs write `learning_memory_<date>.json/md`, which indexes daily learning, autonomy gaps, correction lessons, and SKU lessons into next-run `mustReadBeforeDecision`, `doNotApplyWhen`, `evidenceBeforeReuse`, open follow-ups, and learning constraint tasks. The next hub run must load the prior learning memory (`--prior-learning-memory` when overriding the default previous-day file), merge its learning constraint tasks into `todayQueue`, and expose `priorLearningMemoryApplied` in closed-loop summary before important decisions are trusted.
- Execution count is not a success metric by itself. If sales, units, net profit, refund, or ACOS deteriorate, report that plainly and use the next loop to correct. Never call a day healthy only because many actions landed.
- Overbudget belongs in every daily plan. Classify each row as hard stop, budget shift, or watch-only before closing operations.
- Proactive audit belongs in the primary daily plan, not only in a side report. `run_today_ops.js` must generate `action_schema_<date>_proactive_recovery_candidate.json` from the audit and, when no explicit external schema is requested, merge it into `action_schema_<date>_daily_recovery_combined.json`. Arrival-ad-recovery and new-product-launch gaps are closed only when they become executable actions, explicit manual repairs with reason, or explicit no-action records; an audit-only result is still open.
- Refund pressure is a hard traffic gate. High-refund, low-profit SKUs should not receive more traffic unless the evidence shows the refund problem is isolated, historical, or already improving.
- Opportunity recovery must be evidence-backed: proven recent orders with acceptable ACOS, underdelivery against historically converting traffic, healthy inventory, and current season/node support. If spend rose without orders after a previous action, do not keep increasing bids or budgets.
- Same-SKU cooldown is mandatory. Check recent action history before repeat pushes; allow another action only when today's evidence shows new cause, failed landing, abnormal underdelivery, or an explicit inventory/season guardrail.
- Low-efficiency recovery requires a clean 7-day window and severity-tiered control. Do not treat `improving_marginally` (`30d/15d/7d` in low-efficiency pools, `3d` clean) as recovered when the 7-day window still has clicks or spend with zero orders. If 7d has orders and ACOS <=25%, protect it from residual 15d/30d bid-downs; if 7d ACOS is under 20%, tag it as `review_bid_up` / `suggestedDirection=up` for the high-efficiency or recovery path, but do not raise bids directly from the low-efficiency cleanup runner. The 14-day cooldown is anti-thrash protection, not a hard shield for ongoing waste: same-day adjustments stay protected, but non-same-day rows may override cooldown when waste is still obvious. Use small cuts for moderate ACOS, half cuts for ACOS 60%-90%, about 90% bid cuts for ACOS >=90% or 7d zero-order burn, and pause 15d/30d zero-order rows with meaningful clicks/spend. Do not let the old `smallBidStep()` path make ACOS 30% and ACOS 90% look equivalent.
- Low-efficiency and high-efficiency must both use the ad-system filter structure, not a private metric re-derivation. Low-efficiency is the seller-side filtered pool; high-efficiency uses `/keyword/findAllNew` with `isHigh:"1"`, `lowCost:2`, `coreMark:"0"`, `publicAdv:"2"`, enabled campaign filter, and the property map `1=SP keyword`, `2=SP auto`, `3=SP manual target`, `4=SB keyword`, `6=SB target`. Use `npm run ops:high-efficiency -- all 4 7` to fetch the current high-efficiency expansion pool from the active ad-browser session.
- Daily operations should not stop at cost cleanup. After low-efficiency cleanup, inspect the high-efficiency pool for expansion candidates: efficient terms with low budget, weak impressions, room for bid/placement lift, match-type promotion, or copy into another supported structure. High-efficiency evidence is still not enough by itself to execute spend changes; cross-check inventory, season/window, listing fit, profit/refund, recent actions, and landing feasibility.
- Bid-down plans must respect the real writable floor by ad type. Do not assume every entity has a $0.25 minimum: SP keyword/auto/manual and non-video SB rows can be below $0.25, while SBV/video SB rows should be treated as $0.25-floor until live evidence proves otherwise. For SBV/video rows, API success is not enough because sub-floor writes can appear successful and then not land; always refresh the backend row and use the refreshed bid as the completion verdict.
- Codex is responsible for advertising strategy decisions. When Codex believes an advertising action can improve profit, sales quality, inventory turnover, or KPI trajectory, it should execute the supported action and learn from the next data cycle instead of parking the action in manual review for business-risk reasons.
- Operator shorthand: when the user asks whether something was `\u8fc7` (guo) / "guo le ma", treat that as asking whether it was executed and verified as landed, not merely reviewed, dry-run, classified, or discussed.
- Risk is routing, not refusal. For a supported operating action, risk changes the evidence threshold, authorization boundary, batch size, dry-run path, rollback/follow-up plan, and whether explicit approval is needed; it must not become a reason to skip the action. If the action is not supported yet, create a concrete capability gap, escalation task, or next evidence command instead of ending at "risk is high."
- Use `review` only for unsupported or non-advertising surfaces: non-video SB create, non-seasonal listing edits, price changes outside the verified Ful+Res price-execution path, replenishment, structure fixes without a writable entity, unknown/out-of-scope entities, missing required fields, or actions without post-write verification. SBV video create is supported only through `/campaignSb/createCampaignBeta` when brand, video asset, ASIN/SKU, keyword rows, budget, and readback verification are present. Seasonal listing title edits have a limited auto-executable path in `docs/SEASONAL_LISTING_COPY_RULES.md`; successful execution is still `submitted_pending_review`, not Amazon-front-end landed. Products with `saleStatus=保留页面` are listing-copy protected and must not receive title/bullet/description/search-term edits. Strategic uncertainty on a supported ad action should be explicit `forceExecute: true` with a hypothesis, expected effect, measurement window, and rollback condition.
- Verified price execution is limited to sellerinventory price applications generated from the approved Ful+Res shortage rule: normal-sale SKU, 7d Ful+Res sellable days below 30, target normalized to a `.99` ending, dry-run passed, and post-write verification present. If `fulResUnits <= 7` or `sellableDays7d <= 7`, pause enabled SKU ad delivery first at the productAd/SB row level when available; avoid campaign-level pause when SKU-level rows can stop the traffic. Sellerinventory success is a backend application marker, not Amazon-front-end propagation, so keep the 1/3/7-day follow-up.
- Do not use fallback logic to pretend AI made a decision.
- Daily operations may be reported as "closed loop complete" only when the data loop and advertising execution loop are both complete. Data loop completion means a fresh snapshot, task pool/watch diagnostics, season gap audit, personal trend archive, report, and daily learning artifacts exist. Advertising loop completion means the action schema passed dry-run, execution API calls succeeded, landing verification succeeded, inventory notes and adjustment logs were written, and daily learning records the final landing status. If execution fails, does not land, is dry-run only, or only writes notes, report it as `data loop complete; advertising loop incomplete` and keep the open blocker explicit.
- Unattended autonomy is not proven by one successful script exit. After closed-loop runs, check `autonomy_audit_<date>.json` and `learning_memory_<date>.json`, or run `npm run ops:agent:autonomy-audit -- --closed-loop <file> --learning-memory <file> --today <YYYY-MM-DD>`. Treat `not_ready` as an operating gap; treat `ready_with_recovery` as self-driving recovery mode only when recovery next-actions, learning memory, correction-risk capability, and artifact verification are present.
- Unattended live execution requires the unattended execute gate. `unattended_gate_<date>.json` must say `decision=execute_allowed` before any scheduled run may add `--execute-if-ready`. The gate blocks stale data, artifact failures, non-low-risk actions, approval-needed actions, dry-run blockers, active correction/learning blockers, unsafe spend increases, missing schema/snapshot files, and oversized action batches.
- Production scheduled runs must use `npm run ops:agent:unattended-supervisor`, which writes `unattended_supervisor_<date>.json/md` heartbeat, automatically verifies the installed schedule into `unattended_schedule_install_<date>.json/md`, writes `unattended_scheduler_audit_<date>.json/md`, writes `agent_readiness_audit_<date>.json/md`, and enforces the double-arm rule. Live unattended execution requires both `--execute` and `--execute-if-ready`; `--execute-if-ready` alone must never write. The supervisor also blocks live execute when the prior learning memory is missing, unless explicitly bootstrapping with `--allow-missing-prior-learning`. Use `--skip-scheduler-audit` or `--skip-readiness-audit` only for narrow tests, never as production proof.
- Generate production schedule definitions with `npm run ops:agent:unattended-schedule-plan` before installing or editing the OS-level scheduler. The plan is report-only: it emits the supervisor command, run-now command, scheduler audit command, and Windows Task Scheduler registration snippet without registering anything. Recurring production commands should not pin `--today`; live recurring commands must not include `--allow-missing-prior-learning`.
- Install or verify the OS-level scheduler only through `npm run ops:agent:unattended-schedule-install`. It defaults to dry-run/report mode; `--install` is required to write Windows Task Scheduler. Verification must compare executable, arguments, and working directory to the generated supervisor plan.
- The generated Windows task must run through `cmd.exe` with the repository Node executable and append stdout/stderr to `data\agent\unattended_supervisor_task.log`; it must be installed with `RunLevel=Highest` so the supervisor can verify Task Scheduler state during unattended runs.
- The generated plan must also include `AdOpsAgentCompletionAudit`, a second Windows task scheduled after the supervisor. It runs `ops:agent:completion-audit` with `--scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit`, waits for the supervisor task to exit, refreshes `unattended_schedule_install_<date>` so final `lastRunTime`/`lastTaskResult` are used, writes `agent_completion_audit_<date>.json/md`, and requires both supervisor natural scheduled run proof and completion-audit-task natural runtime proof. `<date>` is the site business date, not necessarily the local China calendar date. This makes the final completion audit unattended instead of a next-day manual check.
- To prove the installed Windows Task Scheduler path before the next natural trigger, use `npm run ops:agent:unattended-schedule-install -- --plan <plan> --run-now --run-now-timeout-seconds 900 --today <YYYY-MM-DD>`, then rerun scheduler/readiness audit. This run-now path must not change the task definition; it only starts the installed supervisor task and records `lastRunTime` / `lastTaskResult`.
- Run-now proves the installed task runtime path; it does not prove the natural daily trigger. For final unattended completion proof, rerun scheduler/readiness audit after the next configured trigger with `--require-natural-scheduled-run`.
- Scheduled autonomy also requires scheduler health audit. Run `npm run ops:agent:unattended-scheduler-audit -- --heartbeat-dir data\agent --schedule-command "<scheduled command>" --schedule-install data\agent\unattended_schedule_install_<date>.json --require-schedule --today <YYYY-MM-DD>` to verify heartbeat freshness, supervisor entrypoint usage, prior-learning continuity, installed task readiness, last scheduled run result, heartbeat-after-last-run, and consecutive failure count. For real self-driving production schedules, add `--require-live-execute`; the audit must show `scheduleLiveExecuteArmed=true`, meaning the scheduled supervisor command has both `--execute` and `--execute-if-ready` while the unattended gate still decides whether any write can land. A schedule that calls `ops:agent:closed-loop` directly, lacks live double-arm flags when live execution is required, uses `--execute-if-ready` without `--execute`, has a nonzero scheduled `lastTaskResult`, or runs without writing a newer supervisor heartbeat is not production-safe.
- When judging whether the whole objective is currently satisfied, run `npm run ops:agent:readiness-audit -- --today <YYYY-MM-DD> --require-correction-lesson --require-risk-routing-lesson --require-natural-scheduled-run`, then run `npm run ops:agent:goal-audit -- --today <YYYY-MM-DD>`. The goal audit is the final requirement-level evidence report for agentization, live unattended schedule, natural completion, long-term learning, correction-risk, and risk-is-routing. Do not use one green subsystem report as proof of full self-driving readiness.
- `run_today_ops.js` separates snapshot mode from operation mode. `--execute --mode full-snapshot` must preserve full-snapshot capture; do not encode execution state into `mode`. Full-snapshot listing fetch must not silently cap at 120 unless `AD_OPS_LISTING_FETCH_LIMIT` is intentionally set, and any cap or low coverage must surface in run quality warnings.
- Daily run status has layers. `manifest.status=success` only means the script completed; the operating verdict comes from `dataQuality`, `actionQuality`, `runQuality`, and `operatingClosure`. Treat missing ad rows, missing seller sales rows, low listing coverage, zero planned actions, dry-run-only runs, and generated candidates not merged into the primary plan as open operating gaps.
- Backend preflight failures require an active recovery pass before reporting `blocked`: run `npm run chrome:debug`, restore adv to `KeywordManage`, wait for the keyword table, restore sellerinventory to the `/pm/formal/list` frame, confirm selection is open at `https://selection.yswg.com.cn/dashboard/analysis`, and rerun preflight. A single HTML/419/Page Expired response from a visibly logged-in tab is a recoverable session/page-state fault, not a final blocker.
- Use final-run landing when same-day retries exist. Aggregate adjustment logs are historical evidence, not the final completion verdict. Read the latest intended run's manifest/sourceRunId, `execution_summary_<date>.json`, `execution_verify_<date>.json`, and daily learning `decisions.finalRunLanding`; completion requires API failures at 0, executable actions landed, note writes recorded, and report/learning artifacts tied to that same run.
- SP campaign state execution must match metadata by `campaignId`. Verify campaign state from `campaignState` or campaign status fields, not child keyword/target/product-ad `state`. Pause can land by API success plus disappearance from enabled child-row pools; enable must visibly verify as enabled. SP campaign pause was verified live on 2026-05-12; SP campaign enable and SP/SB adGroup state are technical verification gaps, not business-review decisions.
- Helper generators may emit `actionSource: ["generator_candidate"]` only. The validator must keep those actions review-only unless Codex rewrites them as an explicit Codex action schema.
- All failures must be structured.
- Operator correction is a first-class risk signal. When the operator says a decision was wrong, stale, missing evidence, mis-scoped, risky, not landed, or may affect similar SKUs, run `npm run ops:agent:correction-risk -- --text "<correction>" --today <YYYY-MM-DD>` before reusing the same rule. The audit must produce same-rule scan tasks, rollback or secondary-action review when needed, and a scoped learning patch under `data/learning/corrections/`.
- High-risk advertising actions are allowed when explicitly released by Codex/Claude/manual approval and, when overriding strategy risk, marked `forceExecute: true`. Technical failures still block execution and must be reported as validation failure, API failure, or `not_landed`.
- New campaign keyword creation must pass product-theme isolation before dry-run. Do not use existing campaign/ad-group/keyword text as theme evidence for creating new keywords, because old or wrong ads can contaminate the next creation pass.
- Never build SP keyword-create arrays by slicing raw `productProfile` fields or unfiltered `keywordSeeds`. Keyword creates require at least three specific buyer-facing search phrases after filtering. Naked fragments and internal labels must be blocked or sent to review, including `baby`, `women`, `decor`, `jewelry`, `gift basket`, `party supplies`, `apparel`, `summer`, `nurse`, `wedding`, `graduation`, `christian`, and `summer product season`.
- Selection keyword conversion data is market evidence, not an executable decision. Use `npm run ops:selection:keyword-conversion -- --keywords "<terms>"` to get search volume, purchase volume, click-purchase rate, CPC/CPA/ACOS strategy ranges, missing-keyword coverage, and cross-check requirements. It may support keyword candidates or bid hypotheses only after SKU-level ad backend, product fit, listing/price, inventory, ABA, and reverse-search evidence agree.
- Selection ABA search-term data is market demand/concentration evidence, not an executable decision. Use `npm run ops:selection:aba-search-terms -- --search-terms "<terms>"` to get ABA rank, search volume, estimated orders, top-ASIN click/conversion share, category fit, monopoly, supply-demand pressure, missing exact-term coverage, freshness, and cross-check requirements. A high ABA rank alone must not create keywords, raise bids, or raise budgets.
- Selection keyword research is the Amazon front-search competitor seed and traffic-entrance evidence layer, not the AI ASIN pipeline. Use `npm run ops:selection:keyword-research -- --sku "<SKU>" --terms "<terms>"` before ABA/conversion checks when finding new traffic. Different category is not an exclusion by itself; exclude unrelated buyer intent, node-only matches, own ASINs, and same-store ASINs. This source is read-only and cannot directly create ads, raise bids, raise budgets, or change listing/price/inventory.
- Selection keyword seasonality data is market-window evidence, not an executable decision. Use `npm run ops:selection:keyword-seasonality -- --search-terms "<terms>"` to get Google trend, market rank/search volume, ASIN count, competitor price/review/rating threshold, brand concentration, buyer-search expansion, and cross-check requirements. It may support season-window, replenishment, clearance, or keyword hypotheses only after SKU-level ad backend, product fit, listing/price, inventory, ABA, keyword conversion, and profit evidence agree.
- Selection Product Time Machine data is competitor traffic-map evidence, not an executable decision. Use `npm run ops:selection:product-time-machine -- --search-keywords "<terms>"` to get winning ASINs, bought-in-past-month, monthly bought history, organic rank history, natural/SP/SB/SBV/AC traffic word counts, organic flow share, AO value, and keyword history trend. In the network panel, `/soundasia_selection/sif/timemachine/pageQuery` is the useful main table; `/soundasia_selection/sif/forward` is only the auxiliary keyword history curve.
- Product and keyword judgement must use the product market evidence stack in `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` when the question depends on demand, product fit, keyword expansion, traffic recovery, or developer/product requests. Do not wait for the operator to explicitly name ABA, keyword conversion, or keyword seasonality. Build the profile from market demand, market window, keyword economics, SKU ad proof, listing/price fit, inventory/economics, and recent action history.
- Listing-style keyword work is the reusable market-evidence-first operating pattern, not only a copywriting method. Before creating keywords, raising spend, recovering traffic, judging new products, clearing inventory, or replying to product/developer requests, build a competitor or market pool from relevance, sales strength, and keyword overlap; reverse-mine the real traffic map; apply explicit keep/exclude/role/risk rules; then generate a bounded action. Use `docs/MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md`.
- Product-identity corrections must not stop at closing wrong theme traffic. If the SKU is reclassified from an occasion lane such as Teacher Appreciation into its real product body, rebuild the receiving traffic structure around that body: SP auto, broad/phrase/exact keyword lanes, and selected product-ASIN targets. Core terms must be broad enough to get traffic and still be true to the product; do not leave only one or two clean but low-volume terms.
- New products must be researched before or while their first ad structure is built, not only after ads fail. Use inventory open/arrival dates to identify new SKUs, then inspect Amazon front listing, images/video status, product use case, buyer persona, season/window, 3-15 core buyer-facing terms, 3-15 target ASINs, competitor listings, price/profit, reviews, and whether the listing actually contains the traffic terms.
- For new-product ad builds or operator requests to `铺广告架构`, use owned controllable coverage as the standard: SP auto, SP broad keyword, SP expansion/product targeting, SP ASIN targeting, and SBV/SB only when brand, creative, and budget conditions allow. System-created campaigns are read-only reference evidence and must not be counted as owned coverage or modified as the landing action. If a matching ASIN-bound video asset exists, build SBV with the same validated keyword set; if video lookup and SBV pending lists are empty, record `do_not_create_sbv` instead of forcing a video campaign.
- Keyword research must include product theme/person/use-case terms, functional/style terms, color/style audience splits, historical converting terms, SIF/selection reverse terms, customer-review language, competitor missing traffic, broader parent-market terms when exact terms are too narrow, and SBV/customer-search discoveries. Developer-supplied direction is only a hypothesis; market evidence and listing fit decide the final keyword set.
- Product maintenance frequencies in operator workbooks are minimum floors. New products, peak/preheat seasonal products, old products declining more than 15%, high-inventory risk, and developer-focus products require a higher check frequency when live evidence moves quickly.
- Selection AI ASIN keyword pipeline is a batch-seeding tool. For new or no-traffic ASINs, do not seed only the SKU's own ASIN or a tiny final-target ASIN set; feed a broad batch of relevant external ASINs first, then filter the returned keyword/product pools into executable targets. Control spend by reducing final target count and budgets, not by creating large ASIN pools at bids too low to receive traffic.
- When `createContext.keywordSeeds` or listing text conflicts with a low-confidence/stale `productProfile`, prefer seed/listing evidence and send the SKU to review if the conflict cannot be resolved. Never let a stale profile such as `nurse/fiesta` override seed terms for a `godmother` product.
- Do not create naked seasonal generic keywords unless the product itself explicitly supports that exact theme through listing text or exact keyword seed. Examples that must be blocked without direct support: `dad gifts`, `fathers day gifts`, `fiesta party supplies`, `mexican party favors`, `cinco de mayo decorations`, `teacher appreciation gifts`, and similar broad occasion terms.
- Godmother/godparent/Madrina terms are Mother's Day recipient signals. If listing data is missing but `createContext.keywordSeeds` contains those terms, use the seeds to repair the product profile and season match before task prioritization.
- Active season windows must not rely only on the capped daily main board. After a fresh snapshot, run the season gap audit to catch high-inventory or low-sales SKUs that are in preheat/peak but could be suppressed by the main-task limit:

```powershell
node scripts\generate_season_gap_audit.js data\snapshots\latest_snapshot.json <YYYY-MM-DD>
```

Review `critical_stale_season` and `season_structure_stale_risk` first; these are the SKUs most likely to become stale inventory if the seasonal window passes without a sell-through or low-budget structure plan.
- Stagnant-inventory decisions must use `docs/STAGNANT_INVENTORY_RULES.md`: compare short-term liquidation/removal economics with long-term hold-to-next-season economics before deciding ad spend, discounting, or clearance.
- Seller-level stagnant-inventory summary/trend can be fetched through the active inventory browser session with `node scripts\execute\fetch_unsellable_seller.js HJ17,HJ171,HJ172`. The script defaults to the latest 90-day trend window; only pass a date when the user asks for a specific period. Never store JWT, CSRF, Inventory-Token, or pasted fetch headers.
- Seller success rate is a daily deposited metric. Fetch it through the active inventory browser session with `node scripts\execute\fetch_seller_success_rate.js HJ17`. The default window is the previous-previous month last day 00:00:00 through the previous month last day 23:59:59, e.g. on 2026-05-15 query 2026-03-31 through 2026-04-30. Persist `total`, `success`, `failure`, `inspect`, and `success / total`; never store JWT, CSRF, Inventory-Token, cookies, or pasted fetch headers.
- Sales-core seller numbers (`HJ17`, `HJ171`, `HJ172`) are account-level totals only. When the user asks generally for data or data trends, default to the total-account / total-business view rather than seller-number or cooperation-number splits. Use seller numbers only for total-account comparison and gap attribution, but do not split or diagnose inside a seller number such as `HJ171` by age bucket or internal sub-row. For diagnostic splits, go to SKU/product, developer line, season/node, inventory, listing, and ad entity, because product/SKU is the real operating target.
- For total/core metrics, do not bypass an existing sales-core field. Answer first from the aggregated sales-core row, especially lifecycle metrics such as `acos_in_5_month`, `advCost_in_5_month`, `order_sales_in_5_month`, `net_profit_in_5_month`, and `gross_profit_in_5_month`; use SKU/ad/inventory drilldowns only after the total answer is established.
- Daily target priority: KPI is the hard goal; HJ1/HJ group core-sales rows are trend benchmarks and warning lines. If a holiday/node passes and group data pulls back, compare whether our total-business pullback is better or worse than the group, but do not replace KPI with group averages. Minimum stop-loss thresholds such as bringing 0-5 month new-product ACOS below 30% are not success conditions; keep improving until KPI, profit, refund, sales, and relative trend gaps are acceptable.
- Budget rollback must protect converting, stocked traffic. A 3-day no-order signal is diagnostic only; do not lower campaign budget when 7-day orders, acceptable ACOS/profit room, healthy inventory, and active/preheat season evidence still support the SKU. Prefer lower-layer cleanup or same-SKU budget shift before campaign budget-down.
- Profit gates must use the right profit field. Use `netProfit`, `busyNetProfit`, or operator reference net profit such as `Q1-3参考净利` when available; raw `profitRate` alone is a warning field, not a hard stop for budget-down or traffic blocking.
- Choose action granularity by the cleanest converting layer. If a campaign is clean overall, adjust campaign budget; if the SKU/campaign is weak but one target/keyword converts efficiently, adjust only that lower-layer entity and keep broad campaign budget controlled.
- DN galvanized flower bucket/vase SKUs (`DN1655`, `DN1656`, `DN2683`, `DN2684`) have a narrow May-June selling window and high stale-inventory/storage-cost risk. In May-June, protect core converting traffic even when short-term raw profit is thin or slightly negative, and cut waste at keyword/target/product-ad level before flooring campaign budgets.
- After any create workflow, run created-keyword audit before considering the work done:

```powershell
node scripts\execute\audit_created_campaign_keywords.js data\snapshots\latest_snapshot.json data\snapshots\created_keyword_cleanup_schema.json data\snapshots\created_keyword_audit_report.json <YYYY-MM-DD>
```

If the audit finds wrong enabled terms, rewrite the cleanup schema as explicit Codex bugfix cleanup, dry-run, execute, verify landing, and record the learning.

## Current Auto-Executable Scope

Low-risk actions:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- SP campaign `pause` for low-risk approved schemas with campaign metadata
- seven-day untouched low-risk touch actions
- low-budget SP `create` when backed by inventory, margin, Q2/seasonal timing, low impressions/clicks, stuck-stock risk, or old-product recovery evidence
- Explicit `forceExecute: true` advertising experiments approved by Codex/Claude/manual when the schema includes hypothesis, expected effect, measurement windows, and rollback condition
- Ful+Res shortage price applications when the schema targets normal-sale SKUs with 7d sellable days below 30, `.99` target prices, dry-run validation, sellerinventory verification, and low-stock ad pause actions when `fulResUnits <= 7` or `sellableDays7d <= 7`

Review-only actions:

- non-video SB `create`; SBV video create is allowed only with `/campaignSb/createCampaignBeta` payload fields and post-write readback
- `structure_fix`
- non-seasonal listing edits, and seasonal listing title edits that fail `docs/SEASONAL_LISTING_COPY_RULES.md`
- price changes outside the verified Ful+Res sellerinventory price-execution path
- replenishment decisions

Known technical blocker:

- SP campaign `enable` currently returns API success but verifies as still paused. Treat it as `not_landed` / automation work, not as a manual-review business decision.

## Daily Watchlist

The following variant group must be checked every day after exporting a fresh snapshot:

- `DN3482`
- `DN3049`
- `DN2685`
- `DN2684`
- `DN2683`
- `DN2437`
- `DN1656`
- `DN2108`
- `DN1655`

For this group, always report current 3/7/30 day sales, inventory days, personal seller sales, ad spend/orders/ACOS, and `year_over_year_asin_rate` as the primary "同" field. Do not substitute `year_over_year_rank` for "同".

Personal seller sales must be collected from the current browser session. Never store JWT, CSRF, or Inventory-Token values in code, docs, snapshots, or memory files.

Advertising anomaly context must include the fresh ad summary interfaces when available:

- `/product/adSkuSummary`: SKU-level 30-day ad spend, sales, orders, ACOS, CPC, and previous-period deltas.
- `/advProduct/all`: SP product-ad rows, active state, spend, orders, and high-ACOS rows by SKU.
- `/campaignSb/findAllNew`: SB campaign spend and state; infer SKU from campaign/ad-group names because the endpoint does not expose a direct SKU field.
- `/amazonAsset/getAssetList`: SBV video asset library lookup. Use `accountId`, `siteId`, `assetType=VIDEO`, `brandEntityId`, `brandRegistryName`, and preferably `name=<ASIN>` to find the product video quickly. Before SBV create, require an exact ASIN-bound video asset; if the ASIN search returns no matching video, do not create SBV because the product may not have been shot yet.
- `npm run ops:ad-structure -- data\snapshots\latest_snapshot.json` audits SB/SBV gaps after a fresh snapshot. If a product group has at least 3 variants and no non-video SB coverage, create a manual SB reminder. SBV is part of the basic structure check, but only becomes a create candidate after `/amazonAsset/getAssetList` finds an exact ASIN-bound video asset. Missing/unknown video assets should be queued for `name=<ASIN>` asset lookup; searched-but-missing assets should be recorded as `do_not_create_sbv`, not promoted to SBV creation.

## Interface Selection Discipline

Do not default to full snapshot export for every question. Pick the smallest interface that answers the user's question:

- Named SKU, overall health: `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>` using `/product/adSkuSummary`.
- Named SKU, campaign/ad-row breakdown: `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>` or `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <startYmd> <endYmd>` using `/product/adProductData`; this can include campaign budget fields such as `dailyBudget`.
- Specific ad group rows across SP/SB: `node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]` using `/keyword/findAllNew` plus local `campaignId + adGroupId` filtering. Properties: `1` SP keyword, `2 product_target` SP auto, `3 product_manual_target` SP manual target, `4` SB keyword, `6` SB target.
- Specific campaign placement: `node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days|startYmd> [endYmd]` using `/placement/findAllPlacement`.
- Specific SP ad group internals: `node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]` using `/advTarget/findManualProductTarget` and `/customerSearch/targetFindAll`.
- High-efficiency keyword/target pool: `npm run ops:high-efficiency -- <all|propertyCsv> <siteId> <days|startYmd> [endYmd] [output.json]`; this calls `/keyword/findAllNew` from the active ad browser with `isHigh:"1"` and the same property map as low-efficiency. Use it to find expansion candidates after low-efficiency cleanup.
- Customer search terms from `/customerSearch/targetFindAll` are useful for SP auto/manual groups. SB and some SP keyword groups may return only an empty aggregate placeholder, so do not use a placeholder row as evidence of search-term traffic.
- Product/keyword market profile: when the question is about a keyword, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or whether a product can be pushed, use `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` as the default read path. Combine ABA, keyword seasonality, keyword conversion, ad backend, listing/price, inventory/economics, and action history before deciding.
- Market keyword conversion precheck: `npm run ops:selection:keyword-conversion -- --keywords "<term1, term2>"` using the logged-in selection browser tab. Treat `coverage.missingKeywords` as missing evidence, check `period.freshness`, and never execute ad changes from this report alone.
- ABA market demand precheck: `npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"` using the logged-in selection browser tab. Treat `coverage.missingSearchTerms` as missing exact evidence, check `period.freshness`, and never execute ad changes from this report alone.
- Keyword seasonality precheck: `npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"` using the logged-in selection browser tab. Treat `coverage.missingSearchTerms` as missing evidence, check `period.freshness`, and never execute ad, price, listing, replenishment, or clearance changes from this report alone.
- Product Time Machine precheck: `npm run ops:selection:product-time-machine -- --search-keywords "<term1, term2>"` using the logged-in selection browser tab. Treat `coverage.missingKeywords` as missing evidence, use it to read competitor ASIN ownership and traffic mix, and never execute ad, price, listing, replenishment, or clearance changes from this report alone.
- Full abnormal pool, daily down pool, eligible SKU discovery, or cross-SKU prioritization: export a full snapshot.
- Daily learning discipline: before operational decisions, read today's freshest interface/snapshot data and persist the day's snapshot, action plan, execution verification, and learning/impact records. If today's data cannot be fetched, mark the baseline as incomplete instead of silently reusing old data.
- Execution: generate schema only after the read path above, dry-run first, then execute.

Choose the date window from the business question. Use recent 7/30 days for current health, explicit historical dates for comparison, and do not hard-code 30 days when a narrower or older window is needed.

Never store pasted `x-xsrf-token` values. All ad reads and writes must use the active browser session in the logged-in `adv.yswg.com.cn` debug tab.

Budget and placement are available dimensions and are wired into automatic execution. SKU ad-product rows can expose `dailyBudget`; campaign placement reads use `/placement/findAllPlacement`. SP budget writes use action schema `entityType=campaign`, `actionType=budget`, `suggestedBudget`, and execute through `PATCH /campaign/batchCampaign`. SP placement writes use `entityType=campaign`, `actionType=placement`, `placementKey`, `suggestedPlacementPercent`, and execute through `PATCH /campaign/editCampaignColumn`.
Budget and placement actions are allowed as controlled learning experiments. Each executable action should carry a hypothesis, expected effect, measurement windows, and baseline-quality fields so later attribution can learn what improved or worsened the data.

Inventory listing performance is also an AI dimension. `session_7/14/21` mean last week / two weeks ago / three weeks ago sessions, and `percentage_7/14/21` are listing conversion rates for those same weeks. Product contexts expose them as `listingSessions` and `listingConversionRates`.

If the latest export has zero-filled product-card sales/inventory/YoY fields, use same-day nonblank product-card data as a fallback while keeping the latest ad-interface rows. The "同" field remains `year_over_year_asin_rate`.

Daily watch command after a fresh snapshot:

```powershell
node scripts\diagnostics\watch_daily_sku_group.js data\snapshots\latest_snapshot.json
```

Daily personal trend HTML command:

```powershell
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
```

The generated HTML belongs under `黄成喆个人数据趋势/每日 近七天 数据趋势/` and is a decision archive. Use it to find abnormal seller/developer lines before deciding SKU-level ad actions.

Fast daily core-data answer:

```powershell
npm run ops:deposit:quick-summary -- --date <YYYY-MM-DD> --json
```

Use this before any full snapshot when the operator only asks for today's sales, units, net profit, ACOS, refund, 0-5 month metrics, or HJ17 success rate. If the sales-core file is missing, recover only that file with `npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>` after `npm run chrome:ready`; reserve full snapshot export for HTML/manifest/SKU pool/inventory/ad-detail refreshes.

## Normal Command Flow

If Codex or git feels sluggish, run the performance hygiene checks before opening more browser or MCP sessions:

```powershell
npm run perf:report
npm run perf:stop-mcp
```

Archive old runtime snapshots after full-snapshot or daily deposit runs when `data/snapshots/` grows too large:

```powershell
npm run perf:archive -- --keep-days 3
npm run perf:archive -- --keep-days 3 --execute
```

Do not bulk-archive `data/tasks/` or `data/learning/`; those directories contain tracked operating evidence.

Start debug Chrome and run backend login readiness:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser_fixed_profile.ps1
```

The default business browser entry is `npm run chrome:operator` or the desktop shortcut `广告运营协作浏览器`. It opens or reuses the shared collaboration Chrome profile at `C:\chrome-debug-profile`, brings that same `9222` browser window to the foreground for the operator, and runs backend readiness. Ad backend, sellerinventory, selection, and the project extension must use this one shared business session because opening the same account from normal personal Chrome can invalidate the collaboration session and vice versa. Personal Chrome is for ChatGPT, browsing, and personal tools only; do not open ad or sellerinventory there during operations. `npm run chrome:debug` is automation-only and uses the same non-default profile with `about:blank`; after startup, `node scripts\execute\ensure_backend_login.js` reuses or background-opens the ad backend, sellerinventory, selection, and the extension panel. If the operator needs a Chrome extension for ad/inventory work, install it directly in the collaboration browser once; do not promise that a cloned profile keeps personal extensions or logins. `npm run chrome:profile:clone-default` is recovery-only because Chrome can scrub copied Web Store extension state. Never point CDP directly at the default personal Chrome profile for routine work. Do not treat a browser session as ready until the readiness script reports ad, inventory, and selection health checks as `ok=true`. If it reports `manual_login_required`, ask the operator to sign in to WeCom or approve the visible prompt, then rerun the startup command. Selection health uses the live browser `pro__Access-Token` value only inside the page context; never paste, log, or persist it.

Export snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Export a Tencent Docs / 企业微信 (WeCom) document to local Markdown (skill `tencent-doc-export`). These docs render the body to `<canvas>` and may disable copy for view-only members, so WebFetch and select-all + copy both return nothing; this reads the editor's in-memory model over CDP instead. Needs the `9222` collaboration browser logged into the doc's workspace:

```powershell
npm run doc:export -- "<docUrl>"
npm run doc:export -- "<docUrl>" --json
```

Export a Tencent Docs / 企业微信 (WeCom) **spreadsheet** (`/sheet/` link) to a local `.xlsx` (skill `wecom-sheet-export`). These sheets render cells to `<canvas>` and lazy-load each sheet only when active, so WebFetch / copy return nothing; this reads `window.SpreadsheetApp`'s in-memory grid over CDP, then writes xlsx with openpyxl (dates/percentages/merges preserved). Hidden sub-sheets are read by temporarily unhiding them in browser memory with all outbound commits blocked, then re-hidden — read-only, never synced. Needs the `9222` browser logged into the sheet's workspace. Skips a `账号密码` sheet by default. Two stages:

```powershell
npm run sheet:export -- "<sheetUrl>" --out data\doc_exports\name.sheets.json --json
npm run sheet:build -- data\doc_exports\name.sheets.json data\doc_exports\name.xlsx
```

Dry-run:

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Execute:

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Regression checks:

```powershell
node --check auto_adjust.js
node --check extension\panel.js
node --check scripts\execute\run_actions.js
node --check scripts\execute\export_snapshot.js
node --check scripts\execute\generate_personal_trend_report.js
npm test
```
