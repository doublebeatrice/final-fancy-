# Sellerinventory Product Analysis

This document describes the read-only sellerinventory product-analysis source:

```text
POST https://sellerinventory.yswg.com.cn/kernel/productAnalysis/query2
```

Use it as the SKU operating base layer before ad, market, listing, price, replenishment, or clearance decisions.

## Live Read

Use the active collaboration browser session. Do not paste or store JWT, Inventory-Token, CSRF, cookies, or tokenized URLs.

```powershell
npm run chrome:operator
node scripts\execute\fetch_product_analysis_query2.js --sku <SKU> --date <YYYY-MM-DD> --out data\snapshots\product_analysis_query2_<SKU>_<YYYY-MM-DD>.json
```

The script dynamically reads session tokens in the browser and writes only token presence booleans such as `hasJwtToken`, not token values.

Optional filters:

```text
--sku <SKU>
--asin <ASIN>
--parent-asin <PARENT_ASIN>
--seller <seller-csv>
--page <n>
--limit <n>
```

## Returned Data

The page is a product-analysis table, not an ad table. Useful fields include:

| Field | Meaning |
|---|---|
| `sku` | SKU |
| `asin` | Child ASIN |
| `parent_asin` | Parent ASIN |
| `small_pic_url` | Product thumbnail |
| `title_ch`, `title_en_file_audit` | Product identity and listing/title clues |
| `developer_num`, `developer_title` | Developer owner |
| `seller_num`, `account` | Seller/account routing |
| `refer_profit0` ... `refer_profit12` | Monthly reference-profit buckets shown by the frontend table |
| `refer_profit_sum` | Frontend recent-12-month total |
| `refer_profit_sum13` | Frontend recent-13-month total |
| `fba_inv` | Inventory count shown by the table |
| `sales_30` | 30-day sales shown by the table |
| `cost_price` | Purchase cost before tax |

For `QQ1764`, the frontend confirmed this mapping:

```text
2025-04 ... 2026-04 = refer_profit0 ... refer_profit12
recent 12 month total = refer_profit_sum
recent 13 month total = refer_profit_sum13
inventory count = fba_inv
purchase cost = cost_price
inventory amount = fba_inv * cost_price
30 day sales = sales_30
```

Do not trust raw `inventory_amount` when it is zero but the frontend shows a calculated inventory amount. Compute:

```text
inventoryAmount = fba_inv * cost_price
inventoryDays30 = fba_inv / sales_30 * 30
```

If `sales_30` is zero, report no-current-sell-through instead of a finite inventory-days estimate.

## Profit Lag Rule

The monthly profit columns are delayed accounting data. They are not real-time current-month profit.

The table can only show the previous closed month after the monthly data has been generated. If the current business date is `2026-06-01` and the latest visible profit month is `2026-04`, then May profit is not available from this table yet.

Use `refer_profit*` for historical profit support and seasonality:

- whether the SKU has historically made money,
- which months are strong or weak,
- whether current inventory deserves rescue, controlled push, or stop-loss review,
- whether an ad issue should be investigated as traffic underdelivery instead of pure product weakness.

Do not use `refer_profit*` for:

- current-month profit,
- yesterday/today ad-effect attribution,
- immediate bid/budget execution without current ad and sales proof.

For current economics, use daily deposit, sales-core, ad backend, and current 3/7/30-day SKU evidence.

## Operating Use

Use this source before deciding an SKU route:

1. Product base: SKU, ASIN, parent ASIN, image/title clues, developer, seller/account.
2. Historical economics: 12/13-month monthly profit trend, positive/negative month count.
3. Current pressure: FBA inventory, purchase-cost inventory amount, 30-day sales, inventory-days estimate.
4. Route implication: main push, small-step verify, repair first, hold, or clearance/stop-loss.
5. Evidence boundary: what still needs current ad data, market evidence, listing evidence, daily deposit, or landed verification.

This source is read-only. It cannot directly trigger ads, listing edits, price changes, replenishment, or clearance actions.

## Related Skill

Project-local skill:

```text
.codex/skills/sellerinventory-product-analysis/SKILL.md
```

Use it for prompts about `产品数据分析`, `productAnalysis/query2`, monthly profit tables, inventory amount, 30-day sales, SKU product base, product route, or inventory/profit-supported ad judgement.
