# Long-Term Memory

This file keeps durable operating memory for future Codex sessions. Prefer this over dated handoff notes when a detail affects future decisions.

## Operating Boundary

- Codex is the only AI decision entry point.
- The extension panel and Node scripts collect data, export snapshots, validate schemas, execute APIs, verify landing, write notes, and summarize results.
- Do not add an AI provider, model runtime, or second strategy layer inside the panel.
- If the decision is not safe from current context, emit `review` instead of using hidden rule fallbacks.

## KPI And Decision Context

- Daily advertising decisions must only consider the user's eligible SKU pool: sales status is `正常销售` or `保留页面`, the SKU is already on sale / launched (`已开售`), and the site is US or UK. Do not use all exported SKUs as the default decision universe.
- Outside that eligible pool, do not create campaigns, increase bids, pause keywords, or run broad cleanup unless the user explicitly names that SKU/group.
- "Full advertising adjustment" / `全量广告调整` is the default product-level advertising operations method for the whole eligible product pool, not only for manually named SKUs. Current named-SKU runs are experiments to calibrate and verify the same logic before wider rollout. For each SKU in scope, treat it as a complete advertising operations package, not a single bid edit or one ad-group test. The workflow must cover SKU-level sales/order/profit or margin context, inventory days, season window, `/product/chart` impressions/clicks trend, `/product/adSkuSummary`, `/product/adProductData`, SP auto, SP keyword, SP manual target, SB keyword, SB target, campaign/product-ad state, paused but potentially valuable entities, campaign budget, placement/top-of-search, weak traffic waste, and listing-session/conversion/listing readiness. Produce one complete action package with push, trim, state, budget/placement, and review items; dry-run executable actions, execute only validated actions, verify landing, and report API success separately from true landed success.
- When the user asks about a concrete SKU, do not default to a full snapshot export. First use `node scripts\execute\fetch_sku_ad_product_data.js <SKU> [siteId] [days]` or `node scripts\execute\fetch_sku_ad_product_data.js <SKU> [siteId] <startYmd> <endYmd>`. It calls `/product/adProductData` in the logged-in ad backend tab and returns all ad-product rows for that SKU.
- Pick the single-SKU date window from the business question: recent 7/30 days for current health, or an explicit historical window for comparison. Do not hard-code 30 days when the user is asking a narrower or older question.
- Never store hard-coded `x-xsrf-token` values. Single-SKU ad fetches must execute inside the logged-in `adv.yswg.com.cn` debug tab and use the browser session/cookie.
- Interface selection rule: named SKU overall health starts with `/product/adSkuSummary` via `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>`; named SKU ad-row breakdown uses `/product/adProductData` via `fetch_sku_ad_product_data.js` and can include `dailyBudget`; specific SP/SB ad-group rows use `fetch_ad_group_rows.js` for `/keyword/findAllNew` with local `campaignId + adGroupId` filtering; campaign placement uses `fetch_campaign_placement.js` for `/placement/findAllPlacement`; specific SP ad-group internals use `fetch_sp_group_detail.js` for `/advTarget/findManualProductTarget` and `/customerSearch/targetFindAll`; full snapshot is for cross-SKU pool discovery/prioritization only.
- `fetch_ad_group_rows.js` property mapping: `1` SP keyword, `2 product_target` SP auto, `3 product_manual_target` SP manual target, `4` SB keyword, `6` SB target. The endpoint returns property-level rows before local filtering, so never use the unfiltered response as the target group. `/customerSearch/targetFindAll` is useful for SP auto/manual groups; SB and some SP keyword groups may return only an empty aggregate placeholder.
- Budget and placement are available dimensions and automatic-execution capable. SKU ad-product rows may expose campaign `dailyBudget`; campaign placement reads use `/placement/findAllPlacement`. SP budget action schema: `entityType=campaign`, `actionType=budget`, `suggestedBudget`; executor writes `PATCH /campaign/batchCampaign`. SP placement action schema: `entityType=campaign`, `actionType=placement`, `placementKey` (`placementProductPage`, `placementTop`, `placementRestOfSearch`), `suggestedPlacementPercent`; executor writes `PATCH /campaign/editCampaignColumn`.
- Inventory listing performance is part of AI context: `session_7/14/21` are last week / two weeks ago / three weeks ago sessions, and `percentage_7/14/21` are the matching listing conversion rates. Product contexts expose these as `listingSessions` and `listingConversionRates`.

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
- Daily learning rule: every operating day must read today's freshest snapshot/interface data before deciding, then persist the day's snapshot, plan, execution verification, and impact/learning records under `data/snapshots/`, `data/attribution/`, and `data/learning/`. Do not reuse yesterday's data as the decision baseline unless today's fetch failed and the report clearly marks `baseline_quality=incomplete`.
- Daily learning must be explicit and reusable. For every operating day, produce `data/learning/daily_learning_<businessDate>.json` and `.md` with: data freshness/baseline quality, source snapshot/manifest/schema/verify files, task pressure by signal, action mix by entity/action/direction, landing status, 1/3/7/14/30 day measurement windows, and carry-forward questions. Tomorrow's decision pass must read the latest learning file before generating actions.
- Daily learning is for improving the operating system, not just reporting results. Use it to answer: which action types helped or hurt sales/profit/ACOS, which SKU groups need cooldown or repeat action, which signals created false positives, which data gaps blocked good decisions, whether seasonal preheat or budget lifts actually bought profitable orders, and whether spend cuts reduced waste without losing same-SKU sales.
- Keyword/season profile lesson from 2026-05-06: if listing fields are missing, `createContext.keywordSeeds` are evidence for product profile and season matching. Godmother/godparent/Madrina terms are Mother's Day recipient signals. Do not let a stale cached profile such as nurse/fiesta override concrete godmother seeds.
- Daily season gap guardrail: after the main task board, run `node scripts\generate_season_gap_audit.js data\snapshots\latest_snapshot.json <YYYY-MM-DD>`. Review `critical_stale_season` and `season_structure_stale_risk` even if they were suppressed by the capped daily board, so active preheat/peak inventory does not become stale.
- Stagnant inventory economic rule: use `docs/STAGNANT_INVENTORY_RULES.md` before clearance or ad decisions on high-inventory seasonal SKUs. Compare short-term liquidation/removal/disposal outcome with long-term hold-to-next-season outcome after storage cost. High inventory days alone are not enough; use shipment mode, effective stagnant quantity after exemptions, next season window, storage cost, normal sale recovery, liquidation recovery, and replenishment/removal cost.
- Seller-level stagnant inventory data is available from `/pm/formal/unsellable_new_seller/query` and `/pm/formal/unsellable_new_seller/change_chart_query`. Use `node scripts\execute\fetch_unsellable_seller.js HJ17,HJ171,HJ172` from the active sellerinventory browser session. The script defaults to the latest 90-day trend window (`start_date=today-90d`, blank `end_date`); pass explicit dates only for specific business periods. The script may persist returned summary/trend JSON, but never persist JWT, CSRF, Inventory-Token, or pasted fetch headers.

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

## Current Weekly Focus

- Mother's Day `SJ` + `HJ` is the top weekly opportunity. Overall trend is breaking out, but decisions must split innovative products from homogeneous/me-too products. Balance profit and advertising expansion; do not blindly push spend if margin or differentiation is weak.
- Mother's Day normally-sellable tags are now actionable: Christian, women's products, and floral products show good upward trends and should enter the closed loop first when inventory and margin allow.
- Nurse Week and Teacher Appreciation Week have risen over the last three days, but ad share is materially higher. Before pushing, check sellable inventory, inventory days, ad share, and whether the product can actually move.
- Nurse Week winners: notebook + pen sets and innovative new products are performing best; tote bags are secondary priority.
- Graduation / end-of-year is urgent after Mother's Day, but high-inventory graduation SKUs must be prioritized even if overall urgency is second tier.
- Small or past seasonal themes need separate screening. `volunteer` can still have orders; `lab week` is visibly declining and should not be treated as a broad push theme.
- Pure seasonal tags and normally-sellable holiday-adjacent tags must both pass eligibility checks before action. When urgency conflicts, prioritize urgent SKUs with confirmed inventory, margin, and trend evidence.

## Recent Execution Memory

- 2026-04-23 DN1655 realtime check: `同 = -49.43%` from `year_over_year_asin_rate`.
- 2026-04-23 May window aggressive push: 60 actions, 57 landed, 3 DN2685 verification misses.
- 2026-04-23 historical-order CPC+20 push for watchlist: 16 bid actions, 16 API successes, 16 landed, 5 inventory notes succeeded.
- That CPC+20 run only changed bids. It did not open campaigns or ad groups because the realtime historical-order objects found were already enabled, and SP campaign/adGroup open actions are not yet safely wired end to end.
- 2026-05-06 AE3311/AE1079 incident: wrong Q2-created keywords came from stale profile/existing-ad contamination. Creation now ignores existing ads for theme evidence, audit protects distinctive seed-supported terms, and three AE1079 godmother keywords were restored after a false-positive cleanup. Today's season gap audit found 56 active-season inventory risks, including 20 suppressed by the main task cap.
- 2026-05-06 stagnant seller fetch verified: HJ17/HJ171/HJ172 summary returned 3 rows and trend returned 90 daily points from 2026-02-06 to 2026-05-06. Latest exposed total was 159,296.50 RMB after exemptions, down 71,582.93 from the 2026-04-28 peak.

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
7. Run the season gap audit and review high-inventory active-season SKUs before closing the day.
8. Fetch seller-level stagnant inventory summary/trend and compare exposed stagnant amount against recent peaks.
9. Apply `docs/STAGNANT_INVENTORY_RULES.md` to high-inventory seasonal SKUs before deciding clear, hold, partial hold, discount, or ad spend.
10. Dry-run any action schema before execution.
11. After execution, verify landing and write inventory notes.
