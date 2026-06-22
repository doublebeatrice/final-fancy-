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

Canonical entry: this skill is the new-product / base-architecture submodule of `D:\ad-ops-brain\playbooks\广告调整完整结构.md`. Before proposing or building ads, define the operating goal, adjustment scope, problem scale, SKU receiver capability, traffic assets, existing layers, missing/new layers, expected coverage, live readback, and 3/7-day acceptance. If the base build cannot cover the main gap, say `覆盖不足`.

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

### 4a. SBV Pre-Create Live Probe (REQUIRED)

Before deciding `can_build_sbv` vs `do_not_create_sbv`, run these live reads in this order. Do not rely on GBrain conclusions older than 24h for the build/no-build call — they cover advertising state which moves daily.

1. **Current ad performance** (decides whether SBV is worth building at all):
   ```powershell
   node scripts\execute\fetch_ad_sku_summary.js 4 7 <SKU>
   node scripts\execute\fetch_ad_sku_summary.js 4 30 <SKU>
   ```
   Read `7_clicks/7_orders`, `30_clicks/30_orders`, `7_acos/30_acos`, `CTR`, `CPC`. SBV is justified when SP has broken zero orders but CTR is still weak (visual / video lift wanted), not when SP is at 0 clicks/0 orders (build that traffic first).

2. **True brand ownership of the ASIN**:
   ```js
   POST /amazonAsset/getExternalAssetUrl  { type:"video", siteId, skuOrAsin:<ASIN>, accountId }
   ```
   Use `data.brandInfo.brandEntityId` and `data.brandRegistryName` as the authoritative brand for THIS ASIN. Do not trust `/sbProduct/getStore` — it returns the account's first registered brand and silently mismatches when the account holds multiple brands (HyDren vs Blueweenly on accountId 737 is the canonical example).

3. **Video readiness, two layers**:
   - Layer A — **Amazon Asset Library** (`amzn1.assetlibrary.asset1.xxxxxx`): this is what `/campaignSb/createCampaignBeta` accepts as `videoAssetIds`. Probe with the correct brand from step 2:
     ```powershell
     node scripts\execute\fetch_amazon_asset_list.js --accountId <ID> --siteId 4 --brandEntityId <ENTITY> --brandRegistryName <NAME> --limit 100
     ```
     Filter `normalizedAssets` where `associatedAsins` includes the target ASIN.
   - Layer B — **Internal OSS source** (`oa.yswg.com.cn/database/...mp4`): returned by `data.assets[].url` from `getExternalAssetUrl`. This is the upload-side source. If Layer A is empty but Layer B has rows, the video exists internally but has not been synced to Amazon yet. Do not report `video_asset_missing` — report `video_pending_amazon_sync` and route to step 4b.

   Decision matrix:

   | Layer A | Layer B | Action |
   |---|---|---|
   | hit | (any) | use Layer A `assetId`, go to step 5 |
   | empty | hit | `video_pending_amazon_sync` — go to step 4b |
   | empty | empty | `video_asset_missing` — require operator to upload before building |

### 4b. Internal OSS → Amazon Asset Library Sync

When step 4a returns `video_pending_amazon_sync`, the source video must be promoted to Amazon Asset Library before SBV create can succeed.

Current path (semi-automated):
1. Operator opens the SBV creation page `https://adv.yswg.com.cn/vue/createSbAd?tabId=...` in the debug Chrome, picks the target ASIN, and selects the video in the picker. The page calls `/amazonAsset/uploadAsset` automatically to sync OSS → Amazon. Operator can stop after the picker confirms selection — no need to submit the campaign manually.
2. Re-run `fetch_amazon_asset_list.js` with the correct brand. The newly synced asset appears as the newest row (status=ACTIVE, name often `<ASIN>.mp4`). Note: `associatedAsins` may be `[]` immediately after upload — that field lags, but the asset is usable.
3. Pass the full `amzn1.assetlibrary.asset1.xxxxxx` via `--videoAssetIds` to `create_sbv.js` to bypass the automatic ASIN-match check.

Fully automated path (not yet implemented): wrap `/amazonAsset/uploadAsset` in a script so step 1 doesn't need the UI. Track this as a separate skill enhancement.

For video: lookup exact ASIN-bound video assets and SBV pending rows. If a usable video exists, build SBV with the same validated keyword set as the SP broad keyword lane unless the operator specifies a narrower set. If video upload and SBV pending lookup are empty, record `do_not_create_sbv` or `video_asset_missing`; do not force a video campaign.

### 4c. SBV Keyword Set Sourcing (REQUIRED)

Do not pick SBV keywords by guessing or by only echoing the SP broad lane. Every SBV keyword set must be assembled from these four evidence sources, then filtered against the GBrain block list:

1. **SIF reverse keywords** for the target ASIN (`fetch_sif_reverse_keywords.js <ASIN> 4`). The `total.ratio` field shows what share of this ASIN's existing exposure each keyword contributes. The top 1-2 are always required.
2. **Selection ABA search terms** for the product family root (`fetch_selection_aba_search_terms.js "<root>"`). Rank by `searchVolume` and `topAsins[0].clickShare` — prefer terms with high volume AND low top1 clickShare (a single ASIN is not eating the lane). Cross-check `priceAvg` against the product price band; reject when the market price band sits far below our SKU.
3. **Selection keyword conversion** (`fetch_selection_keyword_conversion_rate.js "<root>"`). Read `cpcMedian`, `cpaMedian`, `acosMedian`, `costRisk` for each candidate. SBV bids typically run 20-40% under SP at the same placement, so subtract that headroom before deciding the launch bid.
4. **Selection PTM** for the ASIN (`fetch_selection_product_time_machine.js <ASIN>`) to cross-check that proposed terms appear in this ASIN's recent traffic structure.

GBrain block list to respect (current, see `skus/<sku>系列诊断` for the family-specific list):
- Amazon sensitive-word terms (e.g., `world cup`, `world cup soccer ball`) — the create API will reject.
- Family-blocked terms recorded in `skus` or `decisions` (e.g., the YUT soccer family blocks `soccer cup` / `soccer party favors` / `soccer souvenirs` / `soccer gifts` / `world party favors`).
- Brand terms without licensing (e.g., `nike soccer ball`, `adidas soccer ball`, `messi soccer ball`).

Output one row per keyword with its source(s) and reasoning before execution. A keyword without a named source is a red flag — replace it.

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

For SBV specifically, use `create_sbv.js` and pass the resolved brand + Amazon-format videoAssetId explicitly to skip the auto-resolve fallbacks (which can mismatch on multi-brand accounts):

```powershell
node scripts\execute\create_sbv.js \
  --sku <SKU> --asin <ASIN> --accountId <ID> --siteId 4 \
  --brandEntityId <ENTITY_FROM_getExternalAssetUrl> --brandName <NAME> \
  --videoAssetIds amzn1.assetlibrary.asset1.<hash> \
  --budget <N> --bid <N> --matchType BROAD \
  --keywords "<term1>,<term2>,<term3>,..."
# add --execute after dry-run is clean
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

For SBV in particular: campaign + ad group are visible within seconds via `/campaignSb/findAllNew` (filter by today's date sorted by `created_at desc`), but keyword rows commonly take 5-30 minutes to surface in `/keyword/findAllNew`. Report the campaign-level landing immediately with `keyword_rows_pending_visibility`, then recheck the keyword list before declaring full closure.

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
