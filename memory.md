# Long-Term Memory

This file keeps durable operating memory for future Codex sessions. Prefer this over dated handoff notes when a detail affects future decisions.

## Operating Boundary

- Codex is the only AI decision entry point.
- The extension panel and Node scripts collect data, export snapshots, validate schemas, execute APIs, verify landing, write notes, and summarize results.
- Do not add an AI provider, model runtime, or second strategy layer inside the panel.
- If the decision is not safe from current context, emit `review` instead of using hidden rule fallbacks.

## KPI And Decision Context

- Q2 KPI context includes old-product net profit YoY growth, net profit rate, ad share control, stuck-stock control, and new-product ad share control.
- SKU-level "同" is a critical field. Treat `year_over_year_asin_rate` as the primary same-period / YoY field for SKU watch decisions.
- Do not substitute `year_over_year_rank` for "同".
- Confirmed realtime example: DN1655 `year_over_year_asin_rate = -0.4943`, reported as `同: -49.43%`.
- User-provided current example: DN3049 `同: -22.22%`; map this to the YoY/same-period field, not rank.
- Personal seller sales data is part of strategy context when available. Pull it from `/pm/sale/getBySeller` using the current browser session, never by hard-coding JWT, CSRF, or Inventory-Token values.
- Default personal seller scope: `HJ17`, `HJ171`, `HJ172`, 7-day window, ordered by `order_sales desc`.
- Advertising anomaly detection should also use these fresh ad interfaces when available: `/product/adSkuSummary` for SKU-level 30-day spend/sales/orders/ACOS and previous-period deltas, `/advProduct/all` for SP product-ad state and spend by SKU, and `/campaignSb/findAllNew` for SB campaign state/spend inferred by SKU from campaign/ad-group names.
- If a fresh export contains blank product-card inventory/YoY fields for a SKU, daily reporting may fill those fields from another same-day snapshot while keeping the latest advertising interface rows. This protects the critical "同"口径 from being overwritten by zero-filled rows.
- The personal trend HTML folder is a long-term decision archive: `黄成喆个人数据趋势/每日 近七天 数据趋势/`.
- Every daily run should update that folder with a fresh personal trend HTML after exporting the snapshot. Use it first to identify abnormal seller/developer lines, then use ad + inventory data to locate SKU-level action pools.

## Daily Watchlist

These variants are a priority group and must be checked every day from a fresh snapshot:

- DN3482
- DN3049
- DN2685
- DN2684
- DN2683
- DN2437
- DN1656
- DN2108
- DN1655

For the watchlist, always report:

- 3/7/30 day sales.
- Inventory days and stuck-stock pressure.
- Ad spend, orders, clicks, impressions, and ACOS.
- SKU ad summary deltas: cost delta, sales delta, and order delta from `/product/adSkuSummary`.
- SP product-ad active row count from `/advProduct/all` and SB campaign count from `/campaignSb/findAllNew`.
- Personal seller sales from the seller sales snapshot section when available.
- "同" from `year_over_year_asin_rate`.
- Any action taken since the last run and whether it landed.

Command after exporting a fresh snapshot:

```powershell
node scripts\diagnostics\watch_daily_sku_group.js data\snapshots\latest_snapshot.json
```

## Recent Execution Memory

- 2026-04-23 DN1655 realtime check: `同 = -49.43%` from `year_over_year_asin_rate`.
- 2026-04-23 May window aggressive push: 60 actions, 57 landed, 3 DN2685 verification misses.
- 2026-04-23 historical-order CPC+20 push for watchlist: 16 bid actions, 16 API successes, 16 landed, 5 inventory notes succeeded.
- That CPC+20 run only changed bids. It did not open campaigns or ad groups because the realtime historical-order objects found were already enabled, and SP campaign/adGroup open actions are not yet safely wired end to end.

## Current Capability Notes

- Bid execution is verified for SP keyword, SP auto target, SP manual target, and SB keyword rows.
- State toggle execution is supported for SP keyword, SP auto target, SP manual target, SB keyword, SB target, productAd, and sbCampaign entities when the correct row exists in the snapshot.
- SP campaign/adGroup and SB adGroup state actions still need safe schema/executor wiring before they can be used for automatic opening.
- SB creation remains review-only until the real creation interface is captured and verified.
- Large bid changes can be allowed only when explicitly marked by Codex as traffic push and accepted by validation.

## Standard Daily Flow

1. Open debug Chrome and log in to both ad and inventory systems.
2. Wait for manual confirmation that both pages are visibly logged in.
3. Export a fresh full snapshot to `data\snapshots\latest_snapshot.json`.
4. Run the daily watchlist diagnostic.
5. Generate the personal trend HTML:

```powershell
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
```

6. Review sales, inventory, YoY, spend, orders, ACOS, and the personal trend abnormal pools before deciding.
7. Dry-run any action schema before execution.
8. After execution, verify landing and write inventory notes.
