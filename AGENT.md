# Agent Instructions

This project is operated by a single operator-facing AI session — either Codex or Claude — as the AI decision entry point for any given run. Both are peers; neither is hosted inside the extension or scripts.

## Required Read Order

Before running or changing the workflow, read:

1. `README.md`
2. `memory.md`
3. `docs/CODEX_HANDOFF_RUNBOOK.md`
4. `docs/AI_DECISION_BOUNDARY.md`
5. `docs/AI_DECISION_ENTRY_POINTS.md`
6. `docs/Q2_AD_OPS_PLAYBOOK.md`
7. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`
8. `docs/STAGNANT_INVENTORY_RULES.md`
9. `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md` if present

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
- Execution count is not a success metric by itself. If sales, units, net profit, refund, or ACOS deteriorate, report that plainly and use the next loop to correct. Never call a day healthy only because many actions landed.
- Overbudget belongs in every daily plan. Classify each row as hard stop, budget shift, or watch-only before closing operations.
- Refund pressure is a hard traffic gate. High-refund, low-profit SKUs should not receive more traffic unless the evidence shows the refund problem is isolated, historical, or already improving.
- Opportunity recovery must be evidence-backed: proven recent orders with acceptable ACOS, underdelivery against historically converting traffic, healthy inventory, and current season/node support. If spend rose without orders after a previous action, do not keep increasing bids or budgets.
- Same-SKU cooldown is mandatory. Check recent action history before repeat pushes; allow another action only when today's evidence shows new cause, failed landing, abnormal underdelivery, or an explicit inventory/season guardrail.
- Codex is responsible for advertising strategy decisions. When Codex believes an advertising action can improve profit, sales quality, inventory turnover, or KPI trajectory, it should execute the supported action and learn from the next data cycle instead of parking the action in manual review for business-risk reasons.
- Use `review` only for unsupported or non-advertising surfaces: SB create, listing edits, price changes, replenishment, structure fixes without a writable entity, unknown/out-of-scope entities, missing required fields, or actions without post-write verification. Strategic uncertainty on a supported ad action should be explicit `forceExecute: true` with a hypothesis, expected effect, measurement window, and rollback condition.
- Do not use fallback logic to pretend AI made a decision.
- Daily operations may be reported as "closed loop complete" only when the data loop and advertising execution loop are both complete. Data loop completion means a fresh snapshot, task pool/watch diagnostics, season gap audit, personal trend archive, report, and daily learning artifacts exist. Advertising loop completion means the action schema passed dry-run, execution API calls succeeded, landing verification succeeded, inventory notes and adjustment logs were written, and daily learning records the final landing status. If execution fails, does not land, is dry-run only, or only writes notes, report it as `data loop complete; advertising loop incomplete` and keep the open blocker explicit.
- Use final-run landing when same-day retries exist. Aggregate adjustment logs are historical evidence, not the final completion verdict. Read the latest intended run's manifest/sourceRunId, `execution_summary_<date>.json`, `execution_verify_<date>.json`, and daily learning `decisions.finalRunLanding`; completion requires API failures at 0, executable actions landed, note writes recorded, and report/learning artifacts tied to that same run.
- SP campaign state execution must match metadata by `campaignId`. Verify campaign state from `campaignState` or campaign status fields, not child keyword/target/product-ad `state`. Pause can land by API success plus disappearance from enabled child-row pools; enable must visibly verify as enabled. SP campaign pause was verified live on 2026-05-12; SP campaign enable and SP/SB adGroup state are technical verification gaps, not business-review decisions.
- Helper generators may emit `actionSource: ["generator_candidate"]` only. The validator must keep those actions review-only unless Codex rewrites them as an explicit Codex action schema.
- All failures must be structured.
- High-risk advertising actions are allowed when explicitly released by Codex/Claude/manual approval and, when overriding strategy risk, marked `forceExecute: true`. Technical failures still block execution and must be reported as validation failure, API failure, or `not_landed`.
- New campaign keyword creation must pass product-theme isolation before dry-run. Do not use existing campaign/ad-group/keyword text as theme evidence for creating new keywords, because old or wrong ads can contaminate the next creation pass.
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

Review-only actions:

- SB `create` until the real SB creation interface is captured and verified
- `structure_fix`
- listing edits
- price changes
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

## Interface Selection Discipline

Do not default to full snapshot export for every question. Pick the smallest interface that answers the user's question:

- Named SKU, overall health: `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>` using `/product/adSkuSummary`.
- Named SKU, campaign/ad-row breakdown: `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>` or `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <startYmd> <endYmd>` using `/product/adProductData`; this can include campaign budget fields such as `dailyBudget`.
- Specific ad group rows across SP/SB: `node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]` using `/keyword/findAllNew` plus local `campaignId + adGroupId` filtering. Properties: `1` SP keyword, `2 product_target` SP auto, `3 product_manual_target` SP manual target, `4` SB keyword, `6` SB target.
- Specific campaign placement: `node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days|startYmd> [endYmd]` using `/placement/findAllPlacement`.
- Specific SP ad group internals: `node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]` using `/advTarget/findManualProductTarget` and `/customerSearch/targetFindAll`.
- Customer search terms from `/customerSearch/targetFindAll` are useful for SP auto/manual groups. SB and some SP keyword groups may return only an empty aggregate placeholder, so do not use a placeholder row as evidence of search-term traffic.
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

## Normal Command Flow

Start debug Chrome and run backend login readiness:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser_fixed_profile.ps1
```

The startup script opens both backend systems and the extension panel, then runs `node scripts\execute\ensure_backend_login.js`. This can click the WeCom "continue/login in browser" entry when the desktop WeCom session is available. Do not treat a browser session as ready until the readiness script reports both ad and inventory health checks as `ok=true`. If it reports `manual_login_required`, ask the operator to sign in to WeCom or approve the visible prompt, then rerun the startup command.

Export snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
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
