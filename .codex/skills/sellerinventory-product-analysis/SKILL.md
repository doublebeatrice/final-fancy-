---
name: sellerinventory-product-analysis
description: >
  Use when working in ad-ops-workbench on sellerinventory product data analysis,
  产品数据分析, 产品经营底盘, SKU monthly profit table, 近12个月利润, 近13个月利润,
  库存金额, 库存数量, 30天销量, productAnalysis/query2, or prompts asking to judge
  what the product-analysis page data means for SKU review, inventory pressure,
  profit trend, product route, advertising support, clearance, or operating priority.
  This skill reads sellerinventory /kernel/productAnalysis/query2 and explains the
  one-month-lagged monthly profit data before combining it with current sales,
  inventory, daily deposit, market evidence, or ad backend data.
---

# Sellerinventory Product Analysis

## Purpose

Use sellerinventory product-analysis data as the SKU operating base layer: product identity, monthly reference-profit trend, current inventory quantity, purchase-cost inventory amount, and 30-day sales. This is read-only evidence. It does not replace current sales-core, ad backend, listing, market, or execution verification.

Default project root: `D:\ad-ops-workbench`.

## When To Run

Run this before SKU route decisions when the question depends on:

- Whether a SKU has historical profit support or is a weak/stale product.
- Inventory pressure, inventory amount, and whether stock can support ads.
- Whether a current ad problem is likely traffic underdelivery versus product/economics weakness.
- Seasonal or old-product review where profit history and current stock both matter.
- Developer/product handoffs that need a quick SKU operating base.

## Live Read Command

Use the logged-in collaboration browser session. Never paste or store `jwt-token`, `Inventory-Token`, `x-csrf-token`, or cookies.

```powershell
npm run chrome:operator
node scripts\execute\fetch_product_analysis_query2.js --sku <SKU> --date <YYYY-MM-DD> --out data\snapshots\product_analysis_query2_<SKU>_<YYYY-MM-DD>.json
```

Optional filters supported by the script include `--asin`, `--parent-asin`, `--seller`, `--page`, and `--limit`.

Treat the result as live-read only when the command returns `status=200`, `code=200`, `count` is nonzero for the target, and `tokenState` shows the needed session tokens are present. If it fails, restore sellerinventory login/page state before falling back to old snapshots.

## Field Interpretation

- `sku`, `asin`, `parent_asin`, `small_pic_url`, `title_ch`, `title_en_file_audit`: product identity and listing/title clues.
- `developer_num`, `developer_title`, `seller_num`, `account`: ownership and routing.
- `refer_profit0` through `refer_profit12`: monthly reference-profit buckets shown by the frontend table.
- `refer_profit_sum`: frontend recent-12-month total.
- `refer_profit_sum13`: frontend recent-13-month total.
- `fba_inv`: current FBA inventory quantity shown as the inventory count in the table.
- `sales_30`: current 30-day sales from this product-analysis table.
- `cost_price`: purchase cost before tax.
- Inventory amount should be computed as `fba_inv * cost_price` unless the frontend confirms a different basis. Do not trust raw `inventory_amount` when it is zero but the frontend shows a calculated amount.

## Profit Lag Rule

The monthly profit columns are delayed accounting data. They are not real-time current-month profit.

Rule: the table can only show the previous closed month after the monthly data has been generated. On `2026-06-01`, for example, seeing the latest profit column as `2026-04` means May profit is not available from this table yet. Use daily deposit, sales-core, ad backend, and current sales data for May/June current-state judgment.

Use `refer_profit*` to answer:

- Has this SKU historically made money?
- Which months are strong or weak?
- Is this seasonal, fading, or consistently profitable?
- Does current inventory deserve rescue, controlled push, or stop-loss review?

Do not use `refer_profit*` to answer:

- Is the SKU profitable this month?
- Did yesterday's ad action improve net profit?
- Should a bid/budget change execute today without current ad/sales proof?

## Derived Metrics

Compute these every time the fields are present:

```text
inventoryAmount = fba_inv * cost_price
inventoryDays30 = fba_inv / sales_30 * 30
profitPositiveMonths = count of refer_profit buckets > 0
profitNegativeMonths = count of refer_profit buckets < 0
```

If `sales_30` is zero, do not compute a finite inventory-days value; classify as no-current-sell-through and cross-check listing/ad/market state.

## How To Use In The Operating Stack

1. Start with this skill for product base: identity, monthly profit trend, stock, inventory amount, 30-day sell-through, owner.
2. Use `daily-data-deposit` or deposited sales-core for current total/SKU profit, ACOS, sales, and business trend when current-month economics matter.
3. Use `selection-market-evidence` when demand, seasonality, competitor ASINs, keywords, or product fit matter.
4. Use ad backend reads for current 3/7/30 day spend, orders, ACOS, impressions, clicks, budget, and live entity state.
5. Use `sku-operating-review` to turn the evidence into route and intensity. Routes should be growth push, controlled push, repair then push, profit-control, controlled clearance, stop-loss clearance, or evidence hold; do not use `small-step verify` as a route.
6. If the route enters any ad action, first complete `D:\ad-ops-brain\playbooks\广告调整完整结构.md` with scope, problem scale, existing layers, missing/new layers, expected coverage, intensity, readback, and 3/7-day acceptance; then use `ad-ops-action-closure` only after the route has a validated ad action and readback plan. Write `覆盖不足` when the ad action does not cover the main SKU gap.

## Output Contract

Keep the handoff short and explicit:

```text
数据口径: live-read / snapshot; profit columns lag by one closed month; latest profit month observed: <month or unknown>.
产品底盘: SKU, ASIN, parent ASIN, product identity, owner/developer/seller.
利润趋势: 12/13 month totals, positive/negative month count, strongest/weakest months, lag caveat.
库存压力: FBA inventory, 30-day sales, inventory amount, inventory-days estimate.
能支持的判断: route implication from product base only.
还不能判断: current-month profit, ad action, market demand, listing repair, or landed execution gaps that require other evidence.
下一步: exact next read command or action boundary.
```

## Red Lines

- Do not call monthly `refer_profit` current profit.
- Do not hide the one-month lag; state it whenever profit trend is used.
- Do not save pasted tokens, cookies, JWTs, CSRF values, or full tokenized URLs.
- Do not execute ads, price, listing, replenishment, or clearance from this table alone.
- Do not treat high inventory alone as a reason to spend; pair it with current sell-through, current ad proof, market window, and profit/refund evidence.
