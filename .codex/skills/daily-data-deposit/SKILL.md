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
- Analysis and learning artifacts under `data\analysis\`, `data\learning\`, or a run-specific directory.
- A manifest or explicit status summary listing complete, partial, missing, and suspicious data.

Do not treat HTML as the only database. HTML is the human-readable view; JSON/CSV and manifest files are the durable data layer.

## Required Raw Inputs

Check for the daily raw input set before generating conclusions:

1. Sales core spreadsheet: usually `table-export*.xlsx` or date-named `.xlsx`.
2. Inventory export: usually `inv_auto_filtered_*.csv`.
3. Ad full export: usually the Chinese-named ad full export CSV with `30d` or near-30-day wording in the filename.

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
- `data\learning\operations_retrospective_2026-05-06_to_2026-05-14.md` when present
- the latest `data\learning\daily_learning_<date>.md` and `.json`

The 2026-05-14 rule is mandatory: do not run daily operations as "first round / second round / third round" and wait for the user to push. Run the full loop directly: data health, total-result diagnosis, risk-first action pool, old-product repair pool, opportunity pool, execution, landing verification, and follow-up learning.

Daily planning must include overbudget, high refund, high ACOS/no-order waste, low profit, old-product decline, and evidence-backed opportunity recovery. Overbudget rows must be classified as hard stop, budget shift, or watch-only. Refund pressure is a hard traffic gate. Repeat pushes on the same SKU/entity require recent-history review and new evidence.

Daily planning must also run the proactive operating audit before claiming the loop is complete:

```powershell
node scripts\run_proactive_audit.js --snapshot data\snapshots\latest_snapshot.json
```

The generated `data\tasks\proactive_operating_audit_<YYYY-MM-DD>.json/html` is mandatory. It must check KPI gap to 2026-06-12, new-product launch, arrived-inventory ad recovery, price/profit action, expired-season keyword waste, and listing/offer repair. A daily run is incomplete if these modules are missing or if their items are not classified into execute, manual repair, or no-action with evidence.

For the user's stocking/listing-heavy model, do not wait for natural orders on new products. New or recently arrived SKUs with inventory need basic SP auto, SP keyword, and SP manual/targeting coverage. Existing structure without delivery is still a launch failure and must be repaired with bid, budget, keyword, product-ad state, or structure rebuild.

After season nodes pass or enter tail, enabled Teacher Appreciation, Nurse Week, Mother's Day, Cinco de Mayo, Easter, Lab Week, and similar keywords must justify themselves with recent efficient orders. Rising ACOS or falling net profit after a node is evidence that cleanup failed, not a harmless seasonal decline.

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

- `https://adv.yswg.com.cn/`
- `https://sellerinventory.yswg.com.cn/`

Never ask the user to paste JWT, CSRF, Inventory-Token, XSRF, cookies, or request headers. Use the active browser session.

### 3. Capture Or Refresh Structured Data

Prefer existing repo commands and browser-session bridges:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
node scripts\run_today_tasks.js --snapshot data\snapshots\latest_snapshot.json
node scripts\execute\normalize_daily_report_names.js
```

For a fuller closed-loop run, use:

```powershell
node scripts\run_today_ops.js --mode full-snapshot
```

Use these only after confirming both backends are logged in. If a command fails due to login/session state, report it as a precondition failure, not as an empty-data day.

`export_snapshot.js` refuses to write an empty daily snapshot. If it reports `0 productCards`, reopen the extension panel, verify adv/inventory login state, and rerun. Do not continue report generation from an empty snapshot.

### 4. Generate Detailed HTML As A Database View

The detailed daily HTML should include these stable sections when data exists:

- Data health card: raw inputs present, row counts, suspicious files, source paths.
- Core visualization: at least trend, seller contribution, SKU risk/action, ad spend vs sales, or inventory pressure charts. Do not ship a text/table-only daily HTML unless the user explicitly accepts it.
- Total business summary: sales, units, net profit, refund rate, ACOS, ROAS, ad share, CPC.
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
