---
name: daily-data-deposit
description: >
  Use when the user asks to run, inspect, design, fix, or extend the daily
  business data deposit workflow for ad-ops-workbench, including daily deposit,
  today data deposit, persistent business database, detailed HTML archive,
  Huang Chengzhe personal trend reports, raw sales/inventory/ad data archival,
  sales core data, inventory CSV, ad SKU summary CSV, daily HTML reports, or
  reminders/automations to make the workflow run every day. Also use for
  Chinese requests about mei-ri chen-dian, jin-ri shu-ju chen-dian,
  yuan-shu-ju gui-dang, or xi-jie-hua HTML.
---

# Daily Data Deposit

## Purpose

Operate the daily data deposit as a long-term business database, not as a one-off report. Preserve raw inputs, normalized machine-readable data, detailed HTML, and a run manifest so future days, weeks, and months can be compared.

Default project root: `D:\ad-ops-workbench`.

## Locate The Archive Folders

The archive folder names contain Chinese characters. Do not guess or retype them if encoding looks unsafe. Locate them from the workspace:

```powershell
$root = "D:\ad-ops-workbench"
$trendRoot = Get-ChildItem -LiteralPath $root -Directory |
  Where-Object { $_.Name -like "*personal*" -or $_.Name -like "*trend*" -or $_.Name -match "huang|cheng|zhe" } |
  Select-Object -First 1
if (-not $trendRoot) {
  $trendRoot = Get-ChildItem -LiteralPath $root -Directory |
    Where-Object { $_.Name -match "data|trend|personal|cheng" -or $_.FullName -match ".*" } |
    Where-Object {
      (Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Include "*.html","*.xlsx","*.csv" -ErrorAction SilentlyContinue |
        Select-Object -First 3).Count -gt 0
    } |
    Select-Object -First 1
}
```

If discovery is awkward, use `Get-ChildItem -Recurse -Filter *.html` from the project root and identify the folder containing daily `*.html` files and raw daily data subfolders.

## Daily Output Contract

For each business date, produce or verify these artifact classes:

- Raw input folder for the date, normally under the personal trend archive's raw daily data folder.
- Detailed daily HTML under the personal trend archive's daily trend HTML folder, named exactly `<YYYY-MM-DD>.html`.
- Normalized JSON/snapshot artifacts under `D:\ad-ops-workbench\data\snapshots\` or `data\snapshots\runs\`.
- Seller success rate JSON/CSV for HJ17 from `/pm/product/sellerSuccess`, with `total`, `success`, `failure`, `inspect`, `success_rate`, and `success_rate_percent`.
- Analysis and learning artifacts under `data\analysis\`, `data\learning\`, or a run-specific directory.
- A manifest or explicit status summary listing complete, partial, missing, and suspicious data.

Do not treat HTML as the only database. HTML is the human-readable view; JSON/CSV and manifest files are the durable data layer.

## Required Raw Inputs

Check for the daily raw input set before generating conclusions:

1. Sales core raw export: usually `table-export*.xlsx`, date-named `.xlsx`, or `seller_sales_core_*d_<YYYY-MM-DD>.csv` recovered from `/pm/sale/getBySeller`.
2. Inventory export: usually `inv_auto_filtered_*.csv`.
3. Ad full export: usually the Chinese-named ad full export CSV with `30d` or near-30-day wording in the filename.
4. Seller success rate response: `seller_success_rate_HJ17_<YYYY-MM-DD>.json` and `.csv`, fetched from the logged-in inventory browser session.

If one is missing, say exactly which file class is missing and whether the existing HTML can only be a partial archive.

Flag suspicious files:

- Inventory CSV that is tiny compared with normal full exports. Normal recent full exports are roughly multiple MB; an 8 KB inventory CSV is likely incomplete.
- Date folder mismatch, such as a folder named for one day but containing files timestamped for another day.
- HTML generated for a date with no matching raw input set.
- HTML named `黄成喆_今日数据沉淀_自动版_<date>.html`. The canonical report name is `<YYYY-MM-DD>.html`; migrate/delete legacy auto names after confirming a canonical copy exists.
- Backend responses saved as HTML/login pages instead of JSON/CSV/XLSX.

## Naming Contract

Use one canonical naming style for the daily human-readable report:

```text
黄成喆个人数据趋势\每日 近七天 数据趋势\<YYYY-MM-DD>.html
```

Do not create new daily report names like `黄成喆_今日数据沉淀_自动版_<date>.html`. If legacy auto-named files exist, run:

```powershell
node scripts\execute\normalize_daily_report_names.js
```

This migrates missing dates to canonical names and deletes the legacy auto-named duplicates.

## Workflow

### 0. Read Operating Memory

Before daily decisions or daily retrospective work, read the latest durable lessons:

- `memory.md`
- `docs\SKU_LESSON_SYSTEM.md`
- `data\learning\operations_retrospective_2026-05-06_to_2026-05-14.md` when present
- the latest `data\learning\daily_learning_<date>.md` and `.json`

For total-account, sales-core, or core trend questions, do not derive a metric from SKU/ad/inventory data when the sales-core row already exposes it. Read the aggregated `sellerSalesRows` total row first. For 0-5 month new-product health, use `acos_in_5_month`, `advCost_in_5_month`, `order_sales_in_5_month`, `net_profit_in_5_month`, and `gross_profit_in_5_month` directly before drilling down.

### Fast Core Data Answer

When the user asks "今天的数据是?", "今天销售/净利/ACOS是多少?", or otherwise only needs the core daily numbers, use the lightweight path first:

```powershell
npm run ops:deposit:quick-summary -- --date <YYYY-MM-DD> --json
```

This reads the deposited sales-core JSON/CSV and HJ17 success-rate file. It should finish in seconds and must be preferred over `export_snapshot.js`, `run_today_ops.js --mode full-snapshot`, or regenerating HTML. If the quick summary reports `sales_core_summary` missing, recover only the sales-core raw file after login readiness:

```powershell
npm run chrome:ready
npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>
npm run ops:deposit:quick-summary -- --date <YYYY-MM-DD> --json
```

Run the full snapshot path only when the user asks to complete or refresh the full deposit, HTML, manifest, SKU pools, inventory/ad details, proactive audit, or operating closure. Do not spend five-plus minutes on full snapshot capture just to answer the total sales, units, net profit, ACOS, refund, 0-5 month fields, or HJ17 success rate.

### WeCom Online-Sheet Copy Output

When the user needs the daily group WeCom/企微 online-sheet cells, generate tab-separated copy text instead of prose. Use:

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD>
```

This outputs one row in the sheet order: date, all-product gross profit rate, all-product reference net profit, all-product ad share, all-product AT, all-product ACOS, 0-5 month gross profit rate, 0-5 month reference net profit, 0-5 month ad share, 0-5 month ACOS, old-product decline from sales-core `qty_yoy_over_1_year`, and HJ17 success rate.

If the date column is already filled in the sheet and the operator will paste from the first metric cell, use:

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD> --values-only
```

For a weekly block, use `--from <YYYY-MM-DD> --to <YYYY-MM-DD>`. The old-product decline cell is a sales-core percentage, not a SKU review count; use the total sales-core row's `qty_yoy_over_1_year` and leave the cell blank if the sales-core summary is missing. Never borrow this value from SKU review output or another date.

### WeCom Weekly 30-Day Copy Output

When the user needs the Monday 近30天全量 online-sheet row for their own account, use the 30-day sales-core file and output tab-separated copy text:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD>
```

The default row is the user's own selected seller scope (`HJ17,HJ171,HJ172`) and maps to the online sheet's 黄成喆 row. It uses the `seller_sales_core_30d_<date>.json/csv` selected summary row for all-product, 0-3 month, 0-5 month, 3+ month, within-1-year, and over-1-year old-product fields, plus HJ17's deposited 30-60 day success rate when present. If the date/name cells are already fixed in the sheet, paste from the first metric cell with:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --values-only
```

Important historical boundary: `/pm/sale/getBySeller` uses a rolling `time=30` parameter and does not accept a business-date backfill parameter. A file named for an older Monday but exported later is a current rolling 30-day pull, not an exact historical Monday snapshot. Preserve the raw 30-day file every Monday before filling the sheet.

The 2026-05-14 rule is mandatory: do not run daily operations as "first round / second round / third round" and wait for the user to push. Run the full loop directly: data health, total-result diagnosis, risk-first action pool, old-product repair pool, opportunity pool, execution, landing verification, and follow-up learning.

Daily planning must include overbudget, high refund, high ACOS/no-order waste, low profit, old-product decline, and evidence-backed opportunity recovery. Overbudget rows must be classified as hard stop, budget shift, or watch-only. Refund pressure is a hard traffic gate. Repeat pushes on the same SKU/entity require recent-history review and new evidence.

Daily planning must also include full SKU operating review. This is not a metric checklist: classify every eligible SKU by product identity, lifecycle/node stage, operating route, stage target, target status, evidence, action boundary, and follow-up. Produce or verify `data\tasks\all_sku_operating_review_<YYYY-MM-DD>.json/html` or an equivalent full-SKU review before calling the day complete. When the review produces a reusable lesson, write it under `data\learning\sku_lessons\` with the scope and conflict rules from `docs\SKU_LESSON_SYSTEM.md`. A single SKU or variant result must not be generalized to a whole parent group, product type, keyword family, or node without fresh supporting evidence.

Daily planning must also run the proactive operating audit before claiming the loop is complete:

```powershell
node scripts\run_proactive_audit.js --snapshot data\snapshots\latest_snapshot.json
```

The generated `data\tasks\proactive_operating_audit_<YYYY-MM-DD>.json/html` is mandatory. It must check KPI gap to 2026-06-12, new-product launch, arrived-inventory ad recovery, price/profit action, expired-season keyword waste, and listing/offer repair. A daily run is incomplete if these modules are missing or if their items are not classified into execute, manual repair, or no-action with evidence.

For the user's stocking/listing-heavy model, do not wait for natural orders on new products. New or recently arrived SKUs with inventory need basic SP auto, SP keyword, and SP manual/targeting coverage. Existing structure without delivery is still a launch failure and must be repaired with bid, budget, keyword, product-ad state, or structure rebuild.

After season nodes pass or enter tail, enabled Teacher Appreciation, Nurse Week, Mother's Day, Cinco de Mayo, Easter, Lab Week, and similar keywords must justify themselves with recent efficient orders. Rising ACOS or falling net profit after a node is evidence that cleanup failed, not a harmless seasonal decline.

### Execution And Ledger Guardrails

Use explicit execution modes for every action schema:

```powershell
node scripts\execute\run_actions.js <schema.json> --snapshot data\snapshots\latest_snapshot.json --dry-run
node scripts\execute\run_actions.js <schema.json> --snapshot data\snapshots\latest_snapshot.json --execute
```

Do not rely on environment variables or an omitted flag to express intent. The CLI defaults to dry-run, and live writes require `--execute`.

Do not repeatedly run dry-runs just to refresh status when no input changed. Dry-run rows are planned evidence, not landed KPI actions. The adjustment ledger dedupes same-day dry-run repeats, while preserving separate live `sourceRunId` attempts for auditability.

When judging landed work, use live rows only: `dryRun !== true` and success-like outcomes such as `success` or `api_success`. Dry-run rows, skipped rows, and manual-review rows must not be counted as KPI recovery actions.

If adjustment logs look inflated by repeated dry-runs, inspect first and only write after confirming the summary:

```powershell
npm run ops:adjustments:dedupe -- data\adjustments\adjustments_<YYYY-MM-DD>.json
npm run ops:adjustments:dedupe -- data\adjustments\adjustments_<YYYY-MM-DD>.json --write
```

The write mode creates a timestamped `.bak` copy before rewriting the log. It must remove only duplicate dry-run rows or duplicate rows inside the same live `sourceRunId`; it must not collapse distinct live execution attempts.

### 1. Inspect Existing Deposit State

List relevant files for the target date:

```powershell
Get-ChildItem -Recurse "D:\ad-ops-workbench" |
  Where-Object {
    $_.FullName -match "trend|raw|data|snapshot|analysis|learning" -or
    $_.Name -match "<YYYY-MM-DD>|<M-D>|table-export|inv_auto_filtered|csv|xlsx|html|manifest"
  } |
  Select-Object FullName,Length,LastWriteTime |
  Sort-Object LastWriteTime -Descending
```

Inspect generated HTML headings to understand which analysis dimensions already exist:

```powershell
rg -n "<title>|<h1|<h2|SKU|ACOS|SP|SB|ROAS|inventory|refund|season|node|action" "D:\ad-ops-workbench" -g "*.html"
```

### 2. Check Runtime Preconditions

If live data must be fetched, require an active Chrome debug session and operator login state:

```powershell
npm run chrome:debug
```

The operator must be logged into:

- `https://selection.yswg.com.cn/`
- `https://adv.yswg.com.cn/`
- `https://sellerinventory.yswg.com.cn/`

Never ask the user to paste JWT, CSRF, Inventory-Token, XSRF, cookies, or request headers. Use the active browser session.

Do not mark the run blocked on the first bad backend response. First perform an active recovery pass:

1. Run `npm run chrome:debug` to start or reuse the fixed-profile debug Chrome and let `ensure_backend_login.js` click the WeCom browser-access continuation buttons.
2. Recheck Chrome remote debugging on `127.0.0.1:9222` and confirm the selection, adv, sellerinventory, and extension panel tabs exist.
3. If adv returns HTML, `419`, `Page Expired`, or a login page while the visible page looks logged in, reload or reopen `https://adv.yswg.com.cn/vue/KeywordManage?tabId=<timestamp>`, wait for `SP关键词` / `您的关键词`, and rerun the preflight.
4. If sellerinventory returns HTML while the visible page looks logged in, reopen the sellerinventory home page, reopen the `/pm/formal/list` frame through the existing script path, and rerun the preflight.
5. If selection is visibly logged in but preflight hangs or times out, reload `https://selection.yswg.com.cn/dashboard/analysis` and rerun `node scripts\execute\ensure_backend_login.js`; a stuck selection `Runtime.evaluate` should be recovered before treating the day as blocked.
6. Only after the recovery pass still fails should the run be reported as blocked, with the exact backend state that must be restored.

### 3. Capture Or Refresh Structured Data

Prefer existing repo commands and browser-session bridges:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
node scripts\execute\fetch_seller_success_rate.js HJ17
npm run ops:deposit:recover-raw -- --date <YYYY-MM-DD>
node scripts\run_today_tasks.js --snapshot data\snapshots\latest_snapshot.json
node scripts\execute\normalize_daily_report_names.js
npm run ops:kpi:gate -- --date <YYYY-MM-DD>
npm run ops:kpi:checkpoint -- --date <YYYY-MM-DD>
node scripts\execute\audit_landed_action_conflicts.js --date <YYYY-MM-DD>
```

For a fuller closed-loop run, use:

```powershell
node scripts\run_today_ops.js --mode full-snapshot
```

Use these only after confirming both backends are logged in. If a command fails due to login/session state, report it as a precondition failure, not as an empty-data day.

`export_snapshot.js` refuses to write an empty daily snapshot. If it reports `0 productCards`, reopen the extension panel, verify adv/inventory login state, and rerun. Do not continue report generation from an empty snapshot.

If the raw daily archive is missing the sales core export, ad full export, or inventory export, recover them from the logged-in browser session before asking the user to redownload. Prefer the orchestrated command:

```powershell
npm run ops:deposit:recover-raw -- --date <YYYY-MM-DD>
```

It inspects the current deposit state, recovers missing auto-recoverable classes, and reruns deposit status. Under the hood:

- `recover_sales_core_raw.js` fetches `/pm/sale/getBySeller` from the ready sellerinventory tab and writes `seller_sales_core_7d_<YYYY-MM-DD>.csv/json` into the daily raw folder.
- `recover_ad_sku_summary_raw.js` fetches `/product/adSkuSummary` from the ready adv tab and writes `ad_sku_summary_30d_<YYYY-MM-DD>.csv` into the daily raw folder.
- `recover_inventory_raw_from_list.js` captures the active sellerinventory `/pm/formal/list` query from the list frame, fetches all pages, and writes `inv_auto_filtered_<timestamp>.csv` into the daily raw folder.

These recovered files count as raw API exports, not snapshot-derived fallbacks. They must only be run after backend preflight passes. Do not log or ask the user for tokens; use the active debug Chrome session.

Suspicious raw originals are recovery blockers too, even when the file class is technically present. A `seller_sales_core_*_<date>.csv` whose selected-summary row is all zero, or an inventory export that is clearly tiny, must keep deposit status partial, open `raw_recovery_queue_<date>.json/md`, and trigger `npm run ops:deposit:recover-raw -- --date <YYYY-MM-DD>` when the relevant backend session is ready. Do not report `rawRecoveryQueue=clear` while deposit has a raw-file suspicious item.

Run the KPI gate checker after the handoff or closed-loop artifacts exist. It writes `data\tasks\kpi_recovery_gate_<YYYY-MM-DD>.json` and separates these states:

- `target_set_actual_pending`: the next business-day target exists, but the corresponding business-day actuals are not available yet.
- `pass` / `fail`: actuals for the target business date are available and can be judged.
- `missing_target`: the KPI trajectory or handoff target is missing and the gate cannot be evaluated.

Run the KPI recovery checkpoint after deposit status, KPI gate, closure verification, and review/action artifacts exist. It writes both `data\tasks\kpi_recovery_checkpoint_<YYYY-MM-DD>.json` and `data\tasks\kpi_recovery_operator_checkpoint_<YYYY-MM-DD>.md`. The JSON is the machine-readable next-check database; the Markdown is the human-readable operator handoff. Both must show raw-data gaps, KPI gate state, next recovery target, low-efficiency/effect-review/write-action pools, landed-action evidence, and KPI recovery dry-run candidates. Dry-run candidates must be labeled as not landed actions.

When the KPI gate is `target_set_actual_pending`, do not assume the target business date already has action-log evidence. Resolve KPI recovery dry-run rows from the first date among target business date, evaluated business date, current business date, and output date that actually contains high-efficiency dry-run rows. This prevents tomorrow's target line from hiding today's validated recovery candidates.

The KPI recovery visibility chain is part of the daily contract. `kpi_recovery_checkpoint_<date>.json`, `kpi_recovery_dryrun_decisions_<date>.json/md`, `kpi_recovery_next_actions_<date>.md`, `kpi_approval_review_<date>.json/md`, the agent handoff, and the dashboard must agree on high-efficiency dry-run counts, approval-review counts, and landed-action totals. If any of those artifacts disagree, fix the generator or rerun the closed loop before reporting the day ready.

After any live action run, rerun the closed loop and checkpoint with the same adjustment log that contains that run. The newest closed-loop summary and the current adjustment log take precedence over a stale `daily_closure_verify_<date>.json`; do not let yesterday or an earlier same-day verifier overwrite landed-action totals. If live low-efficiency execution lands `483/3`, the checkpoint, closure verifier, handoff, dashboard, and monthly digest must not still show a stale `758/20` total.

After live actions land, run the landed action conflict audit:

```powershell
node scripts\execute\audit_landed_action_conflicts.js --date <YYYY-MM-DD> --adjustments data\adjustments\adjustments_<YYYY-MM-DD>.json
```

The audit writes `data\tasks\landed_action_conflict_audit_<YYYY-MM-DD>.json/md`. Treat `sameEntityReverseCount > 0` as a blocking action-quality failure. Treat `sameNameReverseDifferentEntityCount > 0` as a required 1d/3d review queue because the same SKU/entity name had mixed bid directions across different backend entity IDs; do not assume it is wrong, but do not let it disappear from the KPI follow-up.

When live actions were written to an explicit `adjustments_<YYYY-MM-DD>.json`, the landed-action conflict audit date is that adjustment-log date, even if the report's sales-core `businessDate` is one day behind. Closed-loop files, closure verification, handoff, and dashboard should point to the same audit date as the live adjustment log.

If the current gate has already evaluated as `pass` / `fail` and the handoff contains a later `nextBusinessDayTarget`, the checkpoint must preserve that later line as `nextRecoveryTarget` instead of overwriting the evaluated gate. This keeps "today failed or passed" and "tomorrow's recovery line" separately queryable.

After the checkpoint is generated, run:

```powershell
npm run ops:closure:verify -- --date <YYYY-MM-DD>
```

The verifier checks the closed-loop JSON, handoff Markdown, dashboard HTML, KPI gate JSON, KPI checkpoint JSON, and operator checkpoint Markdown. If the operator checkpoint is stale, missing, or inconsistent with the current gate/deposit/dry-run state, do not report the day as closed.

### 4. Generate Detailed HTML As A Database View

The detailed daily HTML should include these stable sections when data exists:

- Data health card: raw inputs present, row counts, suspicious files, source paths.
- Core visualization: at least trend, seller contribution, SKU risk/action, ad spend vs sales, or inventory pressure charts. Do not ship a text/table-only daily HTML unless the user explicitly accepts it.
- Total business summary: sales, units, net profit, refund rate, ACOS, ROAS, ad share, CPC.
- Seller success rate: daily HJ17 `success / total`, preserving numerator/denominator and the queried open-date window.
- Historical trend: compare with prior deposited dates, not only with group averages.
- Seller/account split: HJ17, HJ171, HJ172 contribution and drag factors.
- Developer-line split: top sales, low profit, high refund, high ACOS, YoY decline.
- SKU action pools: stop-loss, refund risk, old-product decline, tight inventory, healthy scale-up, watchlist.
- Ad detail: ad SKU summary anomalies, SP high spend, SB support, spend up but orders flat, sales down but spend not reduced.
- Inventory detail: high inventory pressure, tight inventory, stale stock, inventory days changes.
- Season/node layer: current node, next node, preheat, harvest, missed window, products needing carryover.
- Action advice: today priority order, what to inspect manually, what to continue watching tomorrow.
- Learning notes: new judgment rules added today, SKU/date items requiring follow-up.

For each pool, preserve evidence fields. A row should explain why it entered the pool, not only list the SKU.

### 5. Report Completion

Final status must include:

- Raw files found and missing.
- Generated or reused HTML path.
- Generated or reused JSON/snapshot/manifest paths.
- Data quality warnings.
- Whether the day is `complete`, `partial`, or `blocked`.

Do not say the deposit is complete unless all required raw inputs and generated artifacts are present, or the user explicitly accepts a partial archive.

## Automation Guidance

This skill does not create time-based reminders by itself. When the user asks how to remember to run it daily, use the Codex app automation tool:

- Prefer a heartbeat attached to the current thread for daily reminders/check-ins.
- The automation prompt should tell the agent to inspect raw files and generated HTML/manifest first, then list missing items.
- Do not create duplicate automations. Inspect existing automations when the user asks to view or change them.

Suggested daily reminder prompt:

```text
Remind and help execute the daily data deposit workflow. First inspect the ad-ops-workbench personal trend raw daily data folder for today's raw three-file set, then inspect whether today's detailed HTML, JSON/snapshot, and manifest exist. If anything is missing, ask the user to confirm both backend login states and continue capture, archival, analysis, and detailed HTML generation. Do not silently skip missing items; explicitly list completed and missing files for the day.
```

## Guardrails

- Keep all historical files; never overwrite a dated HTML or raw input unless the user explicitly asks.
- Daily HTML naming is standardized to `<YYYY-MM-DD>.html`; legacy auto-named HTML may be deleted only after a canonical same-date copy exists or has been created.
- If updating `latest` files, also preserve a dated copy.
- Treat missing data as a first-class output, not a silent fallback.
- Keep AI decision logic outside the extension and scripts; Codex/Claude sessions perform analysis, while scripts capture, normalize, execute, and render.
- Prefer structured parsers and existing repo scripts over ad hoc text scraping.
- Preserve Chinese report wording in generated HTML, but keep paths and code identifiers exact.
