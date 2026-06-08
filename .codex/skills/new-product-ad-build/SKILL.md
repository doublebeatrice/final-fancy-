---
name: new-product-ad-build
description: >
  Use when working in ad-ops-workbench on market-first new-product ad setup,
  SKU/ASIN launch traffic, base ad architecture, owned SP structure creation,
  video/SBV readiness for a new product, or Chinese prompts like 新品广告搭建,
  新品曝光, 铺广告架构, 基础广告结构, 现铺基础广告结构, 看有没有视频,
  有视频和kw一样打, 这个新品的kw准备打哪些词, or 系统创建的广告不算.
  This skill coordinates listing/market evidence, owned coverage audit,
  proposed SP/SBV structure, execution handoff, and live readback verification.
---

# New Product Ad Build

## Purpose

Build new-product advertising from market evidence first, then owned controllable coverage. This is an orchestration skill: reuse existing product/listing, market-evidence, and ad-execution skills instead of duplicating their implementation.

Default project root: `D:\ad-ops-workbench`.

## Compose With Existing Skills

Use these skills when their trigger conditions apply:

- `aicx-amazon-info`: for Amazon ASIN/listing reads.
- `selection-market-evidence`: for market, competitor, keyword, ASIN, ABA, Product Time Machine, keyword conversion, and seasonality evidence.
- `ad-ops-action-closure`: for action schema, dry-run, live execution, landed readback, and conflict audit.
- `sp-create`: only when the user wants a reviewed batch/template output instead of live backend execution.

Read or reference these project docs when needed:

- `docs\Q2_AD_OPS_PLAYBOOK.md`, section `New Product Ad Build Model`.
- `docs\BASIC_AD_ARCHITECTURE_WORKFLOW.md`.
- `docs\PRODUCT_MARKET_EVIDENCE_STACK.md`.
- `docs\MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md`.

## Workflow

### 1. Identify The Product And Live State

Resolve SKU, ASIN, accountId, siteId, brand, price, profit, inventory, sale status, launch/arrival timing, and listing readiness. If live backend reads are needed, run:

```powershell
npm run chrome:ready
```

Do not treat visible login pages, old snapshots, or API success from a previous run as current state. Say whether each important fact is live-read, snapshot-derived, or unavailable.

### 2. Prove Market Entrances Before Building

Build the traffic map before proposing spend:

- Product use case, buyer persona, product form, price band, and season/window.
- Competitor pool: direct competitors, scene competitors, traffic-bridge ASINs, and exclusions.
- Keyword evidence: competitor reverse traffic, Product Time Machine, ABA search volume/orders, keyword conversion/CPC, listing/customer language, and customer-search or variant proof.
- ASIN evidence: comparable ASINs by use case, form, price, audience, reviews, and traffic overlap.

Block terms that are high-volume but wrong for the product form, naked generic audience/season terms, and ASINs that only share a category or node.

### 3. Audit Owned Coverage

Owned controllable ads are the coverage standard. System-created campaigns can be read for keyword clues, bids, and state, but:

- Do not count system-created ads as owned coverage.
- Do not modify system-created campaigns unless the operator explicitly asks.
- When a system layer exists but no owned layer exists, treat the owned layer as missing.

Check reusable owned lanes before creating duplicates: SP auto, SP broad/phrase/exact keywords, SP product targeting, SP ASIN targeting, SB/SBV. Reuse a same-lane owned ad group when it is clean and writable; create a new lane only when no reusable lane exists or the operator explicitly wants a separate structure.

### 4. Build The Base Structure

Default base structure:

- SP auto: discovery lane for search terms and product-page traffic. Keep budget small and bid traffic-capable from create context, product-line CPC, variant proof, and market CPC.
- SP broad keyword: first controlled keyword lane. Use buyer-facing phrases with named evidence sources. Broad is the default launch match type unless the operator asks otherwise.
- SP expansion/product targeting: controlled exploration around validated traffic roots.
- SP ASIN targeting: comparable ASINs by use case, form, price band, audience, and traffic overlap.
- SBV/SB: build only when account, brand, creative, budget, and verification conditions allow.

For video: lookup exact ASIN-bound video assets and SBV pending rows. If a usable video exists, build SBV with the same validated keyword set as the SP broad keyword lane unless the operator specifies a narrower set. If video upload and SBV pending lookup are empty, record `do_not_create_sbv` or `video_asset_missing`; do not force a video campaign.

### 5. Prepare Operator-Checkable Output

Before execution or handoff, show:

- Lane: auto, broad keyword, expansion/product target, ASIN target, SBV/SB.
- Campaign/ad group names.
- Budget and bid.
- Keyword or ASIN list.
- Source for every keyword and ASIN group.
- Excluded terms/ASINs and why.
- Execution blockers, especially no video asset, missing brand, low inventory, listing mismatch, or backend readiness.

If the user already said `落地`, `执行`, `现铺`, or otherwise clearly approved execution, continue into the execution path after dry-run validation rather than stopping at a proposal.

### 6. Execute Through The Ad Closure Path

Use explicit action schema and `run_actions.js`. For live creates, include a falsifiable goal, hypothesis, expected effect, measurement window, rollback/kill switch, and approval fields accepted by the validator.

Typical execution flow:

```powershell
node scripts\execute\run_actions.js <schema.json> --snapshot data\snapshots\latest_snapshot.json --dry-run --fast-scope
node scripts\execute\run_actions.js <schema.json> --snapshot data\snapshots\latest_snapshot.json --execute --fast-scope
```

Use `forceExecute: true` only with a clear reason, such as operator-approved duplicate owned coverage because system-created ads do not count.

### 7. Verify Landing

API success is not enough. Verify at the lower layer:

- Campaign and ad group IDs/names are visible.
- Keyword rows or target rows exist, are enabled, and have expected bids/match types.
- Auto targets, product targets, ASIN expressions, or SBV rows are visible where applicable.
- Video/SBV moderation or serving status is recorded when a video campaign is created.
- Landed-action conflict audit is clear.

Useful readback commands:

```powershell
node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <startYmd> <endYmd> <output.json>
node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <startYmd> <endYmd>
node scripts\execute\audit_landed_action_conflicts.js --date <YYYY-MM-DD>
```

If list visibility lags, report `created_pending_visibility` and schedule or perform a recheck instead of claiming full closure.

### 8. Report And Set Review Cadence

Final operator output should lead with:

1. What landed and what did not.
2. Campaign/ad group IDs, budgets, bids, and enabled row counts.
3. Keyword and ASIN source recap.
4. Video/SBV status.
5. Total new owned daily budget.
6. 1d/3d/7d review checkpoints and stop-loss boundary.

Use 1 day for serving/impressions, 3 days for click/CPC/search-term relevance, and 7 days for orders/spend/ACOS/learning. Reduce, pause, or rebuild lanes that spend through the no-order threshold, pull irrelevant traffic, or cannot be supported by inventory.

## Red Lines

- Do not build ads only because inventory arrived.
- Do not count system-created ads as coverage.
- Do not modify system-created ads unless explicitly requested.
- Do not create keywords from raw product-profile fragments, internal labels, or generic imagination.
- Do not force SBV without a real usable video asset or candidate.
- Do not call API success landed without live row readback.
- Do not hide weak evidence; label it as hypothesis, review-only, or blocked.
