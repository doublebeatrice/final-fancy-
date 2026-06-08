---
name: rising-product-traffic-followup
description: >
  Use when working in ad-ops-workbench on rising SKU/product follow-up,
  3-day or 7-day sales increases, market-cause analysis, breakthrough potential,
  YoY growth judgment, effective traffic expansion, or Chinese prompts like
  销量上升产品, 上升产品, 3天销量上升, 同比增长, 销量突破, 市场分析原因,
  跟上升产品, 拓有效流量, 展示点击缺了, 历史出单词, or 全部时间历史组.
  This skill enforces market-first diagnosis, all-time historical ad evidence,
  copyable SKU output, execution through action schemas, and live landed readback.
---

# Rising Product Traffic Follow-Up

## Purpose

Turn a rising-SKU signal into an operator-ready cause analysis, ad action plan, execution, and follow-up loop.

Default project root: `D:\ad-ops-workbench`.

## Compose With Existing Skills

Use these skills when their trigger conditions apply:

- `sellerinventory-product-analysis`: product-analysis page, profit, inventory, 30-day sales, sellable days.
- `sku-operating-review`: SKU route, inventory pressure, lifecycle, and grouped operating verdict.
- `selection-market-evidence`: market, competitor, keyword, ASIN, seasonality, and Product Time Machine evidence.
- `ad-ops-action-closure`: action schema, dry-run, live execution, landed readback, and conflict audit.
- `sp-create`: only when the user asks for batch import/template output instead of live backend execution.

## Non-Negotiables

- Do not jump straight to bid/budget changes. Explain why sales rose first.
- Give the SKU list in an easy-copy format when the user needs to review multiple SKUs.
- For every SKU selected for ad action, inspect all-time historical ad groups before deciding. Do not rely only on 30-day rows.
- Prioritize historical converting search terms and historical converting ASINs before new traffic directions.
- Say whether evidence is live-read, snapshot-derived, or unavailable.
- Close execution with real readback. API success alone is not enough.

## Workflow

### 1. Build The Rising-SKU List

Identify the candidate SKU list and give a compact copyable block:

```text
SKU001
SKU002
SKU003
```

For each SKU, capture:

- 3/7/30-day sales movement and whether the rise is order count, units, or revenue.
- YoY / same-period comparison if available.
- Natural versus ad contribution where available.
- Inventory days, sale status, price, profit, and stock risk.
- Product route: push, controlled expansion, hold, recovery, or stop-loss.

### 2. Explain The Market Cause

Before recommending spend, classify the cause:

- Market or season demand rising.
- Listing/search visibility improving.
- Historical ad receiver recovered.
- Competitor or keyword lane creating opportunity.
- Inventory/price/stockout effects.
- One-off noise or low-base rebound.

Use Product Time Machine, keyword/ASIN evidence, sellerinventory, and ad backend reads as needed. If the market cause is weak, do not present the SKU as a breakout candidate just because 3-day sales rose.

### 3. Mandatory All-Time Ad History Audit

For each SKU that may receive ad action:

1. Resolve ASIN, accountId, siteId, active product ads, and related historical groups.
2. Pull all-time/lifetime rows for SP keyword, auto target, manual target, and customer search terms.
3. List historical winners with orders, ACOS, CPC, bid, keyword/target state, campaign state, and ad group state.
4. Separate same-SKU account rows from same-ASIN or other-account rows. Other-account rows can guide direction but are not direct execution proof.
5. Check whether high-order historical terms or ASINs are currently open. If closed, check whether parent campaign/group/product ad are writable before planning reopen.

Use existing helper scripts where suitable, for example:

```powershell
npm run chrome:ready
node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> 4 <property> - 2020-01-01 <today> <out.json>
```

Property guide:

- `1`: SP keyword.
- `2`: SP auto target.
- `3`: SP manual/product target.
- `4`: SB keyword.
- `6`: SB target.

### 4. Action Priority

Use this order unless the user explicitly changes it:

1. Active historical winners with good order ACOS: raise bid to a traffic-capable level.
2. Closed target inside active campaign/group with strong all-time orders: enable, then set a controlled bid.
3. High-order customer search terms not separately covered: create or reuse phrase/exact groups.
4. Historical converting ASINs: create/reuse ASIN target lanes or reopen proven ASIN receivers.
5. Market-supported new directions: create controlled keyword/auto/ASIN lanes only after historical demand is covered.
6. Old strong but fully paused groups: second-tier only. Reopen when active lanes cannot absorb traffic or the old group is clearly clean, relevant, and writable.

Avoid expanding:

- High-ACOS generic terms, even if they have orders.
- Old groups that are strong historically but off-season, off-product, or parent-paused without a clear recovery reason.
- Broad new directions when inventory/profit or recent ACOS cannot absorb the risk.

### 5. Bid And Budget Rules

- Use product CPC, historical CPC, market CPC, and comparable lane bids as the bid floor.
- Strong historical winners can be set near or slightly below historical CPC when recent efficiency is uncertain; go higher only when recent trend and profit support it.
- Weak 30-day ACOS or low profit means controlled bid-up, not broad budget expansion.
- Raise budget only when the receiver layer is already converting efficiently and budget is the actual limiter.

### 6. Execute And Verify

For live changes:

1. Build an explicit action schema with evidence, expected effect, review plan, and goal.
2. Dry-run with the same snapshot intended for execution.
3. Execute through `scripts\execute\run_actions.js`.
4. Fetch changed groups and verify state/bid/create visibility.
5. Run conflict audit for the business date.
6. Report counts: actions attempted, API success/failure, readback success/failure, conflict status.

If generic readback misses a just-created or just-enabled row, use targeted lookup by keyword/target text or ID before calling it failed.

### 7. Follow The Rising Product

Set follow-up checkpoints:

- 1 day: exposure and serving recovered.
- 3 days: clicks, CTR, search-term relevance, first order signal.
- 7 days: orders, ACOS, sales, natural lift, and inventory days.

Decision loop:

- Good clicks plus orders and controlled ACOS: add exact/phrase, expand adjacent ASINs, or raise proven bids again.
- Clicks without orders: lower or pause the receiver, then inspect search terms.
- No impressions: repair bid/state/budget/placement or choose a stronger historical receiver.
- Natural sales rising but ads inefficient: protect proven terms and trim weak tails.

## Reporting Shape

Keep the operator answer short:

- Start with whether it was fully checked or what was missing.
- Give the current action recommendation or landed result.
- List SKU/action rows in copyable text when useful.
- Name the next 1-day, 3-day, and 7-day checks.
