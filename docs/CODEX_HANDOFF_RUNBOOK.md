# Codex Handoff Runbook

This document is the handoff guide for running the project from a different Codex account or a new session.

## What Transfers

The repo transfers:

- Data capture scripts.
- Snapshot export.
- Action schema validation.
- Execution scripts.
- Verification and summary output.
- Inventory note append flow.
- Q2 operating priorities documented in `docs/Q2_AD_OPS_PLAYBOOK.md`.

The repo does not transfer:

- Browser login cookies.
- Chrome extension installation state.
- The active Chrome debug session.
- The current chat memory.

That means a new Codex account can run the workflow if the same machine has the browser profile logged in and the extension available.

## Required Read Order

1. `README.md`
2. `AGENT.md`
3. `docs/AI_DECISION_BOUNDARY.md`
4. `docs/AI_DECISION_ENTRY_POINTS.md`
5. `docs/Q2_AD_OPS_PLAYBOOK.md`
6. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`
7. `docs/PRODUCT_MARKET_EVIDENCE_STACK.md`
8. `docs/SELECTION_KEYWORD_RESEARCH.md`
9. `docs/SELECTION_KEYWORD_CONVERSION_RATE.md`
10. `docs/SELECTION_ABA_SEARCH_TERMS.md`
11. `docs/SELECTION_KEYWORD_SEASONALITY.md`

## Start Browser Session

Run:

```powershell
npm run chrome:debug
```

Then confirm these pages are logged in:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
https://selection.yswg.com.cn/dashboard/analysis
```

The startup path uses the fixed debug profile and attempts WeCom browser-access recovery automatically. Do not ask for JWT, CSRF, cookies, tokens, or headers. If a backend tab looks logged in but API probes return HTML, `419`, `Page Expired`, or a login page, actively recover page state first: reopen adv to `https://adv.yswg.com.cn/vue/KeywordManage?tabId=<timestamp>` and wait for `SP关键词` / `您的关键词`; reopen sellerinventory to the product-list `/pm/formal/list` frame. Only report the run as blocked after that recovery pass still fails.

Open the extension panel:

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

If the extension ID changes on another machine, use the installed extension panel URL from Chrome instead of the URL above.

## Export Snapshot

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Expected output is a JSON snapshot containing panel cards, SP rows, SB rows, seven-day untouched pools, and inventory note context.

For a daily account-wide pass, prefer the orchestrator so the manifest captures fetch options, data quality, dry-run, execution status, and learning artifacts:

```powershell
npm run ops:today -- --mode full-snapshot --actor codex
npm run ops:today -- --execute --mode full-snapshot --actor codex
```

`--execute` is an operation flag only. It must not change `--mode full-snapshot`; full snapshot listing fetch should not silently fall back to the old 120-listing cap unless `AD_OPS_LISTING_FETCH_LIMIT` is deliberately set.

## Read Path Selection

Do not use full snapshot export as the default for a named SKU. Choose the smallest read path that answers the question:

- Total-account or sales-core questions: read `/pm/sale/getBySeller` / `sellerSalesRows` first and use the aggregated total row. If the metric already exists there, such as `ACOS`, `acos_in_5_month`, `advCost_in_5_month`, `order_sales_in_5_month`, `net_profit_in_5_month`, or `gross_profit_in_5_month`, answer from that field before any SKU/ad/inventory derivation.
- Named SKU overall health: `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>`; this calls `/product/adSkuSummary` and returns SKU-level spend, sales, orders, ACOS, CPC, clicks/impressions, previous-period deltas, and inventory snippet.
- Named SKU traffic trend confirmation: call `POST /product/chart` inside the logged-in `adv` session when the business question is "should this SKU push harder now?" This is now a formal evidence source for `impressions` and `clicks` absolute-value trend, especially for seasonal or holiday SKUs where the right action depends on whether traffic is falling during the sell-through window.
- Named SKU ad breakdown: `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>` or `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <startYmd> <endYmd>`; this calls `/product/adProductData` and returns campaign/adGroup/product-ad rows for the SKU, including campaign budget fields such as `dailyBudget` when present.
- Specific ad group rows across SP/SB: `node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]`; this calls `/keyword/findAllNew` and locally filters by `campaignId + adGroupId`. Use `property=1` for SP keyword, `2 product_target` for SP auto, `3 product_manual_target` for SP manual target, `4` for SB keyword, and `6` for SB target.
- Specific campaign placement: `node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days|startYmd> [endYmd]`; this calls `/placement/findAllPlacement` and returns placement percent plus spend/orders/sales/CPC/CVR/ACOS/ROAS by placement.
- Specific SP ad group internals: `node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]`; this calls `/advTarget/findManualProductTarget` for ASIN/manual product targets and `/customerSearch/targetFindAll` for customer search terms.
- Customer search terms from `/customerSearch/targetFindAll` are useful for SP auto/manual groups. SB and some SP keyword groups may return only an empty aggregate placeholder.
- Named window-stage SKU traffic recovery: use the smallest live path that covers the whole decision: `fetch_ad_sku_summary`, `/product/chart`, `fetch_sku_ad_product_data`, `fetch_ad_group_rows`, `fetch_sp_group_detail` customer-search terms, action execution or controlled append, landed-row refetch, and landed-action conflict audit.
- Product/keyword market profile: for a keyword, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or "can this product be pushed" question, use `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` as the default read path. Combine market demand, keyword conversion economics, SKU ad proof, listing/price fit, inventory/economics, and action history instead of judging only from ad or inventory rows.
- Keyword research precheck: `npm run ops:selection:keyword-research -- --sku "<SKU>" --terms "<term1, term2>"`; this searches Amazon front-end result pages, builds direct competitor / scene competitor / traffic-bridge ASIN pools, excludes unrelated intent, and outputs candidate keywords plus ABA and keyword-conversion validation commands. Different category is not an exclusion by itself; buyer intent and product carry fit are the boundary. This is read-only evidence only.
- Potential-product replenishment review: when telling development what to do, distinguish actionability. `stockFul/stockRes` are Amazon sellable pressure, `stockInb` is Amazon inbound, `localGoodStock/localAvailableForPlan` are local good/available stock, `localPendingAndTestStock` is pending/test pipeline, and `localFbaPlanAir/localFbaPlanSea` plus `localFbaPlanTotalAir/localFbaPlanTotalSea` are existing FBAPlan air/sea quantities. Only local good/available stock with no existing FBAPlan supports "arrange FBA"; inbound, pending/unarrived stock, and existing plans should not be turned into "催" or duplicate developer requests. For seasonal replenishment, product node and MOQ are hard gates: Mexican / Cinco de Mayo / Fiesta / Pinata products are peak-before-May-5 items, so after May 5 do not recommend a fresh order from 30-day peak sales unless MOQ can be consumed in the remaining tail window.
- Market keyword conversion precheck: `npm run ops:selection:keyword-conversion -- --keywords "<term1, term2>"`; this calls the internal selection system through the logged-in browser tab and returns market search volume, purchase volume, click-purchase ratio, CPC/CPA/ACOS strategy ranges, missing-keyword coverage, freshness, and cross-validation requirements. It is decision support only; do not create keywords, raise bids, or raise budgets from this source without SKU-level ad, listing, inventory, and product-fit evidence.
- ABA market demand precheck: `npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"`; this calls the internal selection system through the logged-in browser tab and returns ABA rank, search volume, estimated orders, top-ASIN concentration, category fit, monopoly, supply-demand pressure, missing exact-term coverage, freshness, and cross-validation requirements. It is decision support only; do not create keywords, raise bids, or raise budgets from this source without SKU-level ad, keyword-conversion, listing, inventory, and product-fit evidence.
- Keyword seasonality precheck: `npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"`; this calls the internal selection system through the logged-in browser tab and returns Google trend, market rank/search volume, ASIN count, competitor price/review/rating threshold, brand concentration, buyer-search expansion, and market-window risk. It is decision support only; do not change ads, price, listing, replenishment, or clearance actions from this source without SKU-level and economics cross-checks.
- Selection AI ASIN keyword pipeline: use the WebSocket pipeline at `wss://selection.yswg.com.cn/soundasia_selection/ws/pipeline` from the logged-in selection session when a SKU needs competitor-driven keyword or ASIN discovery. Seed it with many relevant external ASINs, including same-product, same-theme, price-band, pack-size, and high-traffic adjacent comparables. Do not seed only the new SKU's own ASIN, and do not treat the seed ASIN list as the final execution list. First build a broad candidate pool, then filter it into the keyword group and ASIN targeting group.
- Full abnormal pool, daily down pool, eligible SKU discovery, or cross-SKU prioritization: export a full snapshot.

Pick the date range from the business question. Use recent 7/30 days for current health and explicit dates for historical comparison.

Use `/product/chart` before deciding strong push vs strong cut in these cases:

- Seasonal SKUs in an active sell season.
- SKUs where the operator says "this should be pushed harder now".
- Cases where ACOS alone suggests cut, but the real issue may be falling impressions/clicks.
- Cases where sales are down and you must distinguish `traffic loss` from `conversion loss`.

Minimum judgment rule:

- If season is active, inventory is sufficient, and `/product/chart` shows impressions/clicks absolute values falling, treat `traffic recovery / push` as a live candidate.
- When recovering seasonal traffic, start expansion from verified order directions first: same root terms, same buyer scenario, same audience, and comparable competitor ASINs. Generic terms are only small tests.
- Seasonal product review is a product decision first, not a note-writing step: check active window, inventory pressure, verified order direction, core traffic coverage, new-traffic path, and listing/price/image conversion support before deciding.
- Do not rely only on old note history such as previous `downbid` records to decide today's action.
- Historical note actions are context only; current-season traffic trend has higher priority.

Never save pasted `x-xsrf-token` values. These read scripts run inside the logged-in `adv.yswg.com.cn` debug tab and use the browser session.

New SP campaigns can take a short backend indexing delay before child rows are visible through `/keyword/findAllNew`. If `/campaign/createOneTime` returns `campaignId` and `adGroupId` but verification is empty, wait 30-60 seconds and retry the same-day window. For manual ASIN targets, prefer `fetch_sp_group_detail.js` because it verifies `/advTarget/findManualProductTarget` directly.

SP create and rename actions must keep `campaignName` and `groupName` identical and use the operator-facing AI naming format. Use `ai_auto_<core term>_<sku>`, `ai_kw exact|phrase|broad_<core term>_<sku>`, `ai_asin_<core term>_<sku>`, or `ai_asin expanded_<core term>_<sku>`. Keep spaces inside the core term, such as `ai_auto_dessert cups_mh1806`; do not slug the whole name to underscores, and do not leave mode words, target words, or date stamps inside the core term.

SP budget and SP placement writes are automatic-execution capable after schema validation. Budget uses action schema `entityType=campaign`, `actionType=budget`, `suggestedBudget` and writes through `PATCH /campaign/batchCampaign`. Placement uses `entityType=campaign`, `actionType=placement`, `placementKey`, `suggestedPlacementPercent` and writes through `PATCH /campaign/editCampaignColumn`.

SP structure recovery is reuse-first. Before emitting a new SP `create`, check whether the SKU already has an enabled or paused same-lane ad group that can carry the test. Same lane means keyword `BROAD`/`PHRASE`/`EXACT`, `auto`, or product targeting such as `ASIN_SAME_AS` / `ASIN_EXPANDED_FROM`. Existing same-lane structures should receive bid/budget/placement/enable changes or appended targets first; keyword append must also stay in the same match lane, so a `PHRASE` ad group must not receive `BROAD` keywords. Duplicate create actions require a deliberate override and reason. Backend append payloads are known for SP keywords (`/keyword/createKeywordNew`) and SP product targets (`/advTarget/storeManualTarget`), but automatic append execution should remain gated until post-write row verification is wired into the normal run.

Inventory listing performance is part of the AI context: `session_7/14/21` are last-week / two-weeks-ago / three-weeks-ago sessions, and `percentage_7/14/21` are the matching listing conversion rates.

## Codex Decision Step

Codex reads the snapshot and Q2 playbook, then writes an action schema JSON. The schema is the only decision artifact. The executor must not invent actions.

Operating doctrine from 2026-05-12: do not treat advertising business risk as a reason to wait for manual review. If Codex believes a supported advertising action can improve profit, sales quality, inventory turnover, or KPI trajectory, approve and execute it, then learn from the next 1/3/7-day data cycle.

Operating correction from 2026-05-14: do not run daily operations in small rounds and wait for the operator to push the next step. Read `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md`, then run one complete loop: data health, total-result diagnosis, risk-first pool, old-product repair pool, opportunity pool, execution, landing verification, and follow-up learning. Execution volume is not success if sales, units, net profit, refund, or ACOS deteriorate.

Every daily plan must include:

- Overbudget classification: hard stop, budget shift, or watch-only.
- Proactive audit closure: new-product launch and arrival-ad-recovery rows must be converted into the proactive recovery candidate schema and included in the primary daily schema unless an explicit operator schema was selected; audit-only is not closed.
- Refund gate: high-refund low-profit SKUs do not receive more traffic without evidence that refund risk is isolated or improving.
- Opportunity proof: bid-up/budget-up only when conversion, inventory, profit/refund, and season/node evidence support it.
- Same-SKU cooldown: no repeat push without recent-history review and new evidence.
- Candidate closure: every candidate ends as execute, manual diagnosis with reason, or no-action with reason.

Executable ad actions currently include:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- SP campaign `pause` for low-risk approved schemas with campaign metadata
- Seven-day untouched low-risk touch actions
- low-budget SP `create` when backed by inventory, margin, Q2/seasonal timing, low impressions/clicks, stuck-stock risk, or old-product recovery evidence
- budget and placement changes when schema validation can verify landing
- explicit `forceExecute: true` advertising experiments approved by Codex/Claude/manual

Executable sellerinventory price actions currently include:

- Ful+Res shortage price applications for normal-sale SKUs when 7d Ful+Res sellable days are below 30, the target is normalized to a `.99` ending, dry-run passes, sellerinventory verification is available, and enabled SKU ad delivery is paused first when `fulResUnits <= 7` or `sellableDays7d <= 7`. Treat success as a backend application marker, not Amazon-front-end propagation.

Review-only actions:

- SB `create` until the real SB creation interface is captured and verified
- `structure_fix`
- non-seasonal listing changes, and seasonal title edits that fail `docs/SEASONAL_LISTING_COPY_RULES.md`
- seasonal copy or ad actions whose event evidence is only generic calendar overlap. Awareness/cultural nodes such as Mental Health Awareness Month, Black History Month, Juneteenth, or Pride need concrete event words in live product evidence before title edits or ad creates.
- price changes outside the verified Ful+Res sellerinventory price-execution path
- replenishment decisions
- unknown/out-of-scope entities, incomplete fields, missing verification mapping, or any write surface that cannot be landed/verified

SP campaign state actions are campaign-level even when rows are sourced from child keyword/target/product-ad tables. Match by `campaignId`, write through `/campaign/batchCampaign`, and verify `campaignState` or campaign status before child row `state`. For pause, API success plus disappearance from enabled child-row pools can be a landed result; enable must visibly verify as enabled.

Known technical blocker: SP campaign `enable` returned API success but did not land in force-execution waves on 2026-05-12. Treat it as `not_landed` / automation work, not as a manual-review strategy decision.

## Dry Run

```powershell
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json --dry-run
```

Dry-run must show validation errors as structured failures. Do not execute if schema validation is not clean. Do not rely on omitted flags or environment variables to express execution intent; `run_actions.js` defaults to dry-run and live writes require `--execute`.

For listing copy execution, a clean dry-run is not enough if the plan was generated earlier. `run_listing_copy_edits.js` must re-fetch sellerinventory origin data and refuse live submission when the live parent title no longer matches the planned original title. Treat this as a stale-plan stop, not as a retryable backend failure.

## Execute

```powershell
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json --execute
```

Expected outputs are written under `data/snapshots/`, including verification and execution summary files.

Adjustment ledger rules:

- Dry-run records are planned evidence and must not be counted as landed KPI actions.
- Same-day duplicate dry-run records are deduped by action/entity/outcome to keep the long-term database clean.
- Separate live `sourceRunId` attempts are preserved for auditability, but duplicate writes inside the same live run are ignored.

Use the standard dedupe entrypoint before committing a cleaned adjustment ledger:

```powershell
npm run ops:adjustments:dedupe -- data\adjustments\adjustments_<YYYY-MM-DD>.json
npm run ops:adjustments:dedupe -- data\adjustments\adjustments_<YYYY-MM-DD>.json --write
```

The first command is report-only. The write command creates a timestamped `.bak` file before rewriting.

## KPI Gate

After the handoff or closed-loop artifacts exist, write the explicit KPI recovery gate file:

```powershell
npm run ops:kpi:gate -- --date <YYYY-MM-DD>
```

The output is `data\tasks\kpi_recovery_gate_<YYYY-MM-DD>.json`. Treat `target_set_actual_pending` as an intentional partial state: the next business-day target exists, but actual sales-core data for that business date has not arrived yet. Only `pass` or `fail` should be used to judge whether the gate was hit.

After the KPI gate, write the recovery checkpoint:

```powershell
npm run ops:kpi:checkpoint -- --date <YYYY-MM-DD>
```

This writes two artifacts:

- `data\tasks\kpi_recovery_checkpoint_<YYYY-MM-DD>.json`: machine-readable gate, deposit, action-pool, dry-run, and next-check state.
- `data\tasks\kpi_recovery_operator_checkpoint_<YYYY-MM-DD>.md`: human-readable operator checkpoint for the next handoff.

The operator checkpoint must not be maintained by hand as a separate truth source. Regenerate it from `ops:kpi:checkpoint` whenever the gate, deposit status, action pools, or closure verification changes.

Run the closure artifact verifier after the dashboard, handoff, KPI gate, and KPI checkpoint exist:

```powershell
npm run ops:closure:verify -- --date <YYYY-MM-DD>
```

The verifier checks the closed-loop JSON, handoff Markdown, dashboard HTML, KPI gate JSON, KPI checkpoint JSON, and operator checkpoint Markdown. A stale or missing operator checkpoint means the day is not artifact-closed even when the machine JSON exists.

## Completion Check

Do not report the day as closed from a report file alone. Confirm the final intended run has:

- A dry-run-clean schema.
- Execution API failures at 0 for executable actions.
- Landing verification success for every executable action.
- Inventory notes and adjustment logs written.
- `execution_summary_<date>.json`, `execution_verify_<date>.json`, the report, and daily learning pointing to the same final run/sourceRunId.
- `kpi_recovery_checkpoint_<date>.json`, `kpi_recovery_operator_checkpoint_<date>.md`, and `daily_closure_verify_<date>.json` agree on gate status, next recovery target, deposit missing/suspicious items, and dry-run recovery candidates.

When same-day retries or dry-runs exist, use daily learning `decisions.finalRunLanding` for the completion verdict. All-day adjustment aggregates preserve history and can include failed attempts from earlier retries.

Use the run manifest quality fields before calling a run complete:

- `dataQuality.baselineQuality` must not be `incomplete`; missing ad rows, missing seller sales rows, or low full-snapshot listing coverage keep the data loop open.
- `actionQuality.status` must not be `no_action_plan` or `dry_run_only` when the operator expected execution.
- `runQuality.status=needs_attention` means the script may have succeeded, but the operating loop still has a data, decision, or landing gap.
- `operatingClosure` records whether generated candidates from season title, low-efficiency, overbudget, or proactive audit were left outside the primary action plan.

## Troubleshooting

If export fails:

- Confirm debug Chrome is running on port `9222`.
- Confirm the extension panel is open.
- Confirm ad and inventory systems were manually opened and login was confirmed by the operator.
- If the snapshot has inventory rows but zero ad rows, reopen `adv.yswg.com.cn`, confirm login, refresh the extension panel, and export again.

If execution fails with missing auth:

- Reopen debug Chrome with the normal user data directory.
- Refresh the ad system page.
- Refresh the extension panel.

If note writing fails:

- Confirm inventory site is logged in.
- Re-run with the same schema and snapshot only after checking the failure is note-only.

If verification does not land:

- Check whether the backend returned success but the row refresh did not include the updated entity.
- Use the generated verification file before retrying.

If an API returns 403 with recent-system-adjust language:

- Treat it as a structured block, not a retryable execution failure.
- Do not loop on it.
