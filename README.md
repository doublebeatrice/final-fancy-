# Ad Ops Workbench

This repo supports an Amazon advertising operations workflow where Codex is the only AI decision entry point.

The browser extension and scripts do not decide strategy. They collect data, export snapshots, validate action schemas, execute API calls, verify results, write inventory notes, and generate summaries. Codex reads the exported context, makes the decision, writes the action schema, and calls the execution scripts.

## Current Boundary

Codex owns:

- Reading advertising, inventory, historical actions, product stage, Q2 priorities, and risk context.
- Producing the unified action schema.
- Deciding whether an item should be executed or sent to review.
- Orchestrating export, dry-run, execution, verification, note writing, and summary.

Code owns:

- Page data capture through the extension panel.
- Structured snapshot export.
- Action schema validation.
- Deterministic execution of supported APIs.
- Result verification.
- Inventory note append.
- Execution summary output.

The panel must not contain an AI provider, AI runtime, or second strategy layer.

Generated schemas from helper scripts are candidates only. Actions with `actionSource: ["generator_candidate"]` are forced into review by the validator unless Codex rewrites them into a deliberate Codex action schema.

## Persistent Memory

Read `memory.md` before making operational decisions. It contains durable context that should survive dated handoff files, including KPI口径, the daily priority SKU group, the critical "�? field mapping, and recent execution memory.

## Daily Decision SKU Scope

Daily ad decisions must start from the user's eligible SKU pool, not from all exported SKUs:

- Sales status must be `正常销售` or `保留页面`.
- The SKU must already be on sale / launched (`已开售`).
- Site must be US or UK only.
- Do not create campaigns, increase bids, pause keywords, or run broad cleanup outside this pool unless the user explicitly names that SKU/group.

## Keyword Creation Safety

New SP keyword campaign creation must isolate product theme before any execution:

- Use `createContext.keywordSeeds`, listing title/bullets, and verified product profile as the source of keyword truth.
- Do not use existing campaign names, ad-group names, or existing keyword text as creation-theme evidence. Existing ads may already contain bad terms and can contaminate new campaigns.
- If keyword seeds/listing text conflict with a low-confidence or stale product profile, prefer seeds/listing or emit review. Do not let stale profile tags override concrete product terms.
- Block naked seasonal generics unless directly supported by exact seed or listing text. Examples: `dad gifts`, `fathers day gifts`, `fiesta party supplies`, `mexican party favors`, `cinco de mayo decorations`.
- After create workflows, run the audit before declaring completion:

```powershell
node scripts\execute\audit_created_campaign_keywords.js data\snapshots\latest_snapshot.json data\snapshots\created_keyword_cleanup_schema.json data\snapshots\created_keyword_audit_report.json <YYYY-MM-DD>
```

For the 2026-05-06 AE3311 incident, `createContext.keywordSeeds` correctly described a godmother/Mother's Day product, while a stale profile and previously created ad keywords exposed nurse/fiesta/father themes. The fix is covered by `tests\generator_listing_signals.test.js` and `scripts\generators\generate_profit_create_schema.js`.

For the 2026-05-06 AE1079 miss, the stale cached profile said nurse/fiesta while `createContext.keywordSeeds` said godmother/Mother's Day. Product profiling, season matching, created-keyword audit, and task prioritization now use seed evidence when listing evidence is missing. `godmother`, `god mother`, `godparent`, and `madrina` are treated as Mother's Day recipient signals.

## Season Gap Audit

The daily task board is capped, so active seasonal SKUs can be hidden behind higher-priority work. After a fresh snapshot, run the independent season gap audit to catch preheat/peak SKUs with stale-inventory or structure risk:

```powershell
node scripts\generate_season_gap_audit.js data\snapshots\latest_snapshot.json <YYYY-MM-DD>
```

Outputs:

- `data\tasks\season_gap_audit_<YYYY-MM-DD>.json`
- `data\tasks\season_gap_audit_<YYYY-MM-DD>.md`

Review `critical_stale_season` and `season_structure_stale_risk` before closing the day's operations. These rows are not automatically executable; they are a guardrail against missing seasonal sell-through opportunities and letting inventory become stale.

The stagnant-inventory economic rules are internalized in `docs\STAGNANT_INVENTORY_RULES.md`. Use that document before deciding whether to keep, partially keep, clear, discount, remove, or continue advertising a high-inventory seasonal SKU. The key comparison is short-term liquidation/removal profit versus long-term hold-to-next-season profit after storage cost.

Fetch seller stagnant-inventory summary and trend from the logged-in inventory browser session:

```powershell
node scripts\execute\fetch_unsellable_seller.js HJ17,HJ171,HJ172
```

This calls `/pm/formal/unsellable_new_seller/query` for the current seller summary and `/pm/formal/unsellable_new_seller/change_chart_query` for the trend chart. By default it automatically uses the latest 90-day window (`start_date = today - 90 days`, `end_date` blank). Pass an explicit start date only when the business question needs a specific period. It must read session credentials dynamically from the active browser page and must not persist JWT, CSRF, or Inventory-Token values.

## Quick Start For A New Codex Session

Prerequisites:

- Work from this repo: `D:\ad-ops-workbench`.
- Chrome is logged in to `adv.yswg.com.cn` and `sellerinventory.yswg.com.cn`.
- After opening both systems, the operator must manually confirm the login state in the browser. Do not assume the session is usable until the pages are visibly logged in.
- The extension panel can be opened.
- Debug Chrome is available on port `9222`.

Open the debug browser:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Open the ad system and inventory system in that browser, then open the extension panel:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

Important: wait for the operator to confirm both backend pages are logged in before exporting a snapshot. If this step is skipped, snapshot export can produce inventory-only or empty ad data.

Export a full snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Attach cached product profiles before generating action schemas:

```powershell
npm run profiles -- data\snapshots\latest_snapshot.json data\snapshots\latest_snapshot_profiled.json
```

This writes compact `productProfile` fields into the profiled snapshot and updates `data\product_profiles.json`. Reuse `latest_snapshot_profiled.json` for create/adjust decisions so unchanged listings do not need to be re-understood every day.

Optional: build a small image-understanding queue only for high-value changed/unanalyzed SKUs:

```powershell
npm run vision:queue -- data\snapshots\latest_snapshot_profiled.json data\snapshots\product_vision_queue.json 30
```

After an image model or manual reviewer writes `product_vision_results.json`, merge it back:

```powershell
npm run vision:merge -- data\snapshots\latest_snapshot_profiled.json data\snapshots\product_vision_results.json data\snapshots\latest_snapshot_profiled.json
```

Run the daily priority SKU watch report:

```powershell
node scripts\diagnostics\watch_daily_sku_group.js data\snapshots\latest_snapshot.json
```

Generate the daily personal trend HTML:

```powershell
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
```

Analyze post-execution impact against later SKU snapshots:

```powershell
npm run impact
```

This reads local execution history and snapshots, then writes `data\attribution\execution_impact_report.json` and `.md`. The report is a local learning artifact, not an auto-decision layer.

Fast path for a user-named SKU:

```powershell
node scripts\execute\fetch_ad_sku_summary.js 4 30 DN1656
node scripts\execute\fetch_sku_ad_product_data.js DN1656 4 30
node scripts\execute\fetch_sku_ad_product_data.js DN1656 4 2026-04-17 2026-04-23
node scripts\execute\fetch_ad_group_rows.js 81465235586434 426889420957316 388 4 2 product_target 2026-03-25 2026-04-23
node scripts\execute\fetch_campaign_placement.js 216215479261432 113 4 2026-04-17 2026-04-23
node scripts\execute\fetch_sp_group_detail.js 225787179894969 87467799588303 113 4 2026-03-25 2026-04-23
```

Use these before exporting a full snapshot when the user asks about one concrete SKU. They run inside the logged-in `adv.yswg.com.cn` debug tab, use the browser session for cookies/XSRF, and write JSON under `data\snapshots\`.

## Interface Selection Guide

- Concrete SKU overall health: call `/product/adSkuSummary` through `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>` first. This gives SKU-level spend, sales, orders, ACOS, CPC, impressions/clicks, previous-period deltas, and inventory snippet.
- Concrete SKU ad breakdown: call `/product/adProductData` through `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>` or explicit `<startYmd> <endYmd>`. This gives the SKU's campaign/adGroup/product-ad rows, row-level state/performance, and campaign budget fields such as `dailyBudget` when returned by the backend.
- Specific ad group rows across SP/SB: call `node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]`. Use `property=1` for SP keyword, `2 product_target` for SP auto, `3 product_manual_target` for SP manual targeting, `4` for SB keyword, and `6` for SB targeting. `/keyword/findAllNew` returns a property-level table, so the script filters by `campaignId + adGroupId` locally; do not treat unfiltered response rows as the target group.
- Specific campaign placement: call `node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days|startYmd> [endYmd]`. This calls `/placement/findAllPlacement` and returns Top of Search, Product Page, Rest of Search, off-Amazon, current placement percent, spend, orders, sales, CPC, CVR, ACOS, and ROAS.
- Specific SP ad group internals: call `node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]`. This calls `/advTarget/findManualProductTarget` for ASIN/manual product targets and `/customerSearch/targetFindAll` for customer search terms.
- Customer search terms: `fetch_ad_group_rows.js` also calls `/customerSearch/targetFindAll`. It is useful for SP auto/manual groups; SB and some SP keyword groups may return only an empty aggregate placeholder.
- Full-market abnormal pool, daily decline pool, or eligible SKU discovery: export a full snapshot. Do not use full export as the default response to a named SKU.
- Inventory/sales eligibility gate: apply `正常销售` or `保留页面` + `已开售` + US/UK before planning actions.
- Write actions: only after the read path above, generate an action schema, dry-run it, then execute.

Choose the date window based on the question: recent 7/30 days for current health, explicit `YYYY-MM-DD YYYY-MM-DD` for historical comparison.

For the current priority group, "�? must come from `year_over_year_asin_rate`; do not use `year_over_year_rank` as a substitute. Fresh snapshots also include personal seller sales from `/pm/sale/getBySeller` when the inventory session is logged in; credentials are read from the active browser session and must not be stored in the repo.

Daily abnormal-SKU reporting also consumes ad interfaces when available:

- `/product/adSkuSummary` for SKU-level 30-day spend, sales, orders, ACOS, CPC, and previous-period deltas.
- `/product/adProductData` for SKU campaign rows, including campaign/adGroup identifiers and backend-returned budget fields such as `dailyBudget`.
- `/placement/findAllPlacement` for campaign placement performance and current placement adjustment percent.
- `/advProduct/all` for SP product-ad state, active row count, spend, orders, and high-ACOS rows by SKU.
- `/campaignSb/findAllNew` for SB campaign spend/state, with SKU inferred from campaign/ad-group names.

Campaign-level automatic execution is supported:

- SP campaign daily budget update: action schema uses `entityType: "campaign"`, `actionType: "budget"`, `id: "<campaignId>"`, and `suggestedBudget`. Executor calls `PATCH /campaign/batchCampaign` with `operation=dailyBudget`.
- SP placement adjustment: action schema uses `entityType: "campaign"`, `actionType: "placement"`, `id: "<campaignId>"`, `placementKey` (`placementProductPage`, `placementTop`, or `placementRestOfSearch`), and `suggestedPlacementPercent`. Executor calls `PATCH /campaign/editCampaignColumn` with `operation=placement`.
- Listing sessions and CVR from inventory are AI decision fields: `listingSessions.lastWeek/twoWeeksAgo/threeWeeksAgo` come from `session_7/14/21`; `listingConversionRates.lastWeek/twoWeeksAgo/threeWeeksAgo` come from `percentage_7/14/21`.

The personal trend generator keeps the latest ad-interface rows but can fill blank product-card inventory/YoY fields from another same-day nonblank snapshot, so a zero-filled export does not wipe out the critical "�?口径.

Codex then reads the snapshot and writes an external action schema JSON. Validate without executing:

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Execute after review:

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

## Verified Capabilities

Verified on 2026-04-23:

- Full panel snapshot export works.
- Snapshot-based dry-run works.
- Snapshot-based real execution works.
- Incremental post-write verification works.
- Inventory note writing works in snapshot mode.
- Failed note writes are retried instead of rerunning all notes.
- SP bid execution works for keyword, auto target, and manual target rows already supported by the executor.
- SB keyword bid execution works.
- State toggle support exists for SP keyword, SP auto target, SP manual target, SB keyword, and SB target, using their separate request bodies and SP/SB state casing.

Validated commands:

```powershell
node --check auto_adjust.js
node --check extension\panel.js
node --check scripts\execute\run_actions.js
node --check scripts\execute\export_snapshot.js
npm test
```

## Q2 Full Test Result

Full test snapshot on 2026-04-23:

- Product cards: 434
- SP keyword rows: 7076
- SP auto rows: 1595
- SP manual target rows: 1843
- SB keyword rows: 3610
- SB target rows: 31
- Inventory snapshot rows: 722
- SP seven-day untouched rows: 3
- SB seven-day untouched rows: 8

Execution result:

- 7 low-risk actions executed.
- 7 API calls succeeded.
- 7 results verified as landed.
- 7 inventory notes succeeded.
- 3 review-only actions wrote review notes.
- 0 API 403 blocks.
- 0 verification misses.

Key output files:

- `data/snapshots/q2_full_test_snapshot.json`
- `data/snapshots/q2_full_test_action_schema.json`
- `data/snapshots/execution_verify_2026-04-23.json`
- `data/snapshots/execution_summary_2026-04-23.json`

## Review-Only Boundaries

These actions may be recommended by Codex, but remain review-only until explicitly released:

- New ad creation.
- Structure repair or campaign rebuild.
- Large bid changes.
- Strong actions on high-sales or high-risk products.
- Listing edits.
- Price changes.
- Sea-shipping replenishment decisions.

If Codex cannot decide safely, the action schema must use `review`. Code must not fall back to an old rule decision.

## Main Files

- `auto_adjust.js`: deterministic execution orchestration.
- `src/ai_decision.js`: context building and external action schema validation/loading. No provider runtime.
- `src/adjust_lib.js`: supported action execution helpers.
- `extension/panel.js`: browser-side data capture, execution bridge, verification, and note bridge.
- `scripts/execute/export_snapshot.js`: panel snapshot export.
- `scripts/execute/fetch_ad_sku_summary.js`: fast SKU-level ad summary fetch through `/product/adSkuSummary`.
- `scripts/execute/fetch_sku_ad_product_data.js`: fast single-SKU ad-product fetch through `/product/adProductData`.
- `scripts/execute/fetch_ad_group_rows.js`: fast ad-group row fetch through `/keyword/findAllNew` for SP keyword, SP auto, SP manual targeting, SB keyword, and SB targeting; also fetches customer search terms.
- `scripts/execute/fetch_campaign_placement.js`: fast campaign placement fetch through `/placement/findAllPlacement`.
- `scripts/execute/fetch_sp_group_detail.js`: fast SP ad-group internal fetch through `/advTarget/findManualProductTarget` and `/customerSearch/targetFindAll`.
- `scripts/execute/run_actions.js`: action schema runner.
- `scripts/generators/generate_profit_create_schema.js`: candidate schema generator; output is not auto-executable until Codex rewrites/approves it.
- `scripts/generators/generate_profit_adjust_schema.js`: candidate schema generator; output is not auto-executable until Codex rewrites/approves it.
- `scripts/execute/generate_closed_loop_report.js`: writes closed-loop HTML reports under `archive/reports/YYYY-MM-DD/`.
- `scripts/analytics/analyze_execution_impact.js`: local post-execution attribution report for learning from action outcomes.
- `scripts/execute/generate_personal_trend_report.js`: writes daily personal trend HTML under `黄成喆个人数据趋�?每日 近七�?数据趋势/`.
- `scripts/diagnostics/watch_daily_sku_group.js`: daily report for the priority SKU group.
- `memory.md`: long-term operating memory and durable decision口径.
- `docs/CODEX_HANDOFF_RUNBOOK.md`: handoff and operating runbook.
- `docs/Q2_AD_OPS_PLAYBOOK.md`: Q2 decision context for Codex.
- `docs/CODEX_AI_BOUNDARY.md`: Codex-only architecture boundary.
