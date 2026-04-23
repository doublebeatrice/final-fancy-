# Account Switch Handoff - 2026-04-23

This handoff is for switching Codex/account context without losing the current ad-ops operating state.

## First Read

Read these files in order:

1. `README.md`
2. `memory.md`
3. `AGENT.md`
4. `docs/CODEX_HANDOFF_RUNBOOK.md`
5. `docs/Q2_AD_OPS_PLAYBOOK.md`
6. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`

`memory.md` is the durable operating memory. It contains the critical KPI口径, daily watchlist, "同" mapping, and recent execution memory.

## Current Repo Shape

Root has been cleaned. Keep root limited to:

- repo/config: `.gitignore`, `.mcp.json`, `package.json`, `package-lock.json`
- operating docs: `README.md`, `AGENT.md`, `memory.md`, `task.md`
- code: `auto_adjust.js`, `extension/`, `scripts/`, `src/`, `tests/`
- data/archive: `data/`, `archive/`, `docs/`
- long-term personal reports: `黄成喆个人数据趋势/`

Old reports were moved under `archive/reports/2026-04-23/`. Old/test snapshots were moved under `archive/snapshots/legacy/`. SOP/KPI/handoff docs are under `docs/`.

## Login And Export Prerequisite

Do not export or execute until the browser is visibly logged in to both systems:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
```

Open debug Chrome if needed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Open the extension panel:

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

Never store JWT, CSRF, cookies, or Inventory-Token values. The code reads credentials from the active browser session only.

## Newly Connected Interfaces

The latest panel/export flow now includes:

- `/product/adSkuSummary`: SKU-level 30-day ad spend, sales, orders, ACOS, CPC, and previous-period deltas.
- `/advProduct/all`: SP product-ad state, active rows, spend, orders, and high-ACOS rows by SKU.
- `/campaignSb/findAllNew`: SB campaign state and spend. This endpoint has no direct SKU field, so daily reporting infers SKU from campaign/ad-group names.
- `/pm/sale/getBySeller`: personal seller sales for `HJ17`, `HJ171`, `HJ172`, 7-day window, ordered by `order_sales desc`.

Current verified snapshot from 2026-04-23 21:33 China time:

- `productCards`: 1224
- `adSkuSummaryRows`: 653
- `advProductManageRows`: 7557
- `sbCampaignManageRows`: 587
- `sellerSalesRows`: 183

## Critical KPI口径

"同" is a critical KPI field.

- Use `year_over_year_asin_rate` as the primary SKU same-period / YoY field.
- Do not use `year_over_year_rank` as "同".
- Confirmed DN1655 realtime example: `同 = -49.43%`.
- Confirmed DN3049 example: `同 = -22.22%`.

The daily personal trend generator now protects this口径: if the latest export has blank/zero product-card inventory or YoY fields, it fills those fields from another same-day nonblank snapshot while keeping the latest ad-interface rows.

## Daily Watchlist

These SKUs must be checked daily:

```text
DN3482
DN3049
DN2685
DN2684
DN2683
DN2437
DN1656
DN2108
DN1655
```

Always report for this group:

- 3/7/30 day sales
- inventory days
- "同" from `year_over_year_asin_rate`
- ad spend, sales, orders, ACOS, CPC
- cost/sales/orders delta from `/product/adSkuSummary`
- SP product-ad active rows from `/advProduct/all`
- SB campaign count from `/campaignSb/findAllNew`

Current verified daily report examples:

- DN1655: `同 -49.43%`, 30-day ad spend `183.11`, ad sales `615.87`, ad orders `12`, ACOS `29.73%`.
- DN3049: `同 -22.22%`, 30-day ad spend `151.93`, ad sales `1129.82`, ad orders `16`, ACOS `13.45%`.

## Daily Commands

Export a fresh snapshot:

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Run the daily SKU watchlist:

```powershell
node scripts\diagnostics\watch_daily_sku_group.js data\snapshots\latest_snapshot.json
```

Generate the personal trend HTML:

```powershell
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
```

Current generated report:

```text
黄成喆个人数据趋势\每日 近七天 数据趋势\黄成喆_今日数据沉淀_自动版_2026-04-23.html
```

## Execution State

Supported execution is currently verified for:

- SP keyword bid and state
- SP auto target bid and state
- SP manual target bid and state
- SB keyword bid/state
- SB target state
- SP product-ad state
- SB campaign state when the correct row exists
- low-budget SP create with validated context

Still cautious / review-only:

- SB creation until the real creation interface is captured and verified.
- SP campaign/adGroup bulk opening unless schema/executor coverage is confirmed for the exact row type.
- large bid changes unless explicitly intended and validated.
- listing, price, and replenishment actions.

## Today做过的事

- Root整理完成，并建立 `memory.md` as long-term memory.
- Updated `README.md` and `AGENT.md` with daily watchlist, personal sales, ad-interface, and "同"口径.
- Added personal trend HTML generator and generated the 2026-04-23 report.
- Added ad summary/product/SB campaign interfaces to panel state and snapshot export.
- Added same-day product-card fallback in the personal report generator to protect YoY/inventory fields.
- Verified tests:

```powershell
node --check extension\panel.js
node --check scripts\execute\export_snapshot.js
node --check scripts\execute\generate_personal_trend_report.js
npm test
```

## Next Account Should Do

1. Start by reading `memory.md`.
2. Confirm browser login to both ad and inventory systems.
3. Export a fresh snapshot.
4. Run the watchlist and personal trend report.
5. Check DN1655 and DN3049 "同" values first to confirm field mapping is still correct.
6. Only after data is fresh, decide whether to push/open ads.
