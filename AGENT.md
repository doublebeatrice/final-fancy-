# Agent Instructions

This project is operated by Codex as the only AI decision entry point.

## Required Read Order

Before running or changing the workflow, read:

1. `README.md`
2. `memory.md`
3. `docs/CODEX_HANDOFF_RUNBOOK.md`
4. `docs/CODEX_AI_BOUNDARY.md`
5. `docs/Q2_AD_OPS_PLAYBOOK.md`
6. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`

## Architecture Boundary

The extension panel is not an AI product. It only captures data, exports structured snapshots, visualizes rows, exposes execution bridges, shows results, and supports manual confirmation.

Codex performs the decision work outside the panel:

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
- If Codex cannot decide, emit `review`.
- Do not use fallback logic to pretend AI made a decision.
- All failures must be structured.
- High-risk actions remain review-only unless explicitly released.

## Current Auto-Executable Scope

Low-risk actions:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- seven-day untouched low-risk touch actions
- low-budget SP `create` when backed by inventory, margin, Q2/seasonal timing, low impressions/clicks, stuck-stock risk, or old-product recovery evidence

Review-only actions:

- SB `create` until the real SB creation interface is captured and verified
- `structure_fix`
- large bid changes
- listing edits
- price changes
- replenishment decisions

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

Start debug Chrome:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Before exporting a snapshot, open both backend systems and wait for the operator to manually confirm the browser login state:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
```

Do not treat a browser session as ready until the operator has confirmed both pages are logged in. If this is skipped, full snapshot export may capture inventory only and no ad rows.

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
