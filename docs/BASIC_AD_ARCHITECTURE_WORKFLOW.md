# Basic Ad Architecture Workflow

This SOP applies when the operator asks to "铺广告架构" without narrower qualifiers.

## 1. Definition

基础广告架构 means filling the base traffic entrances before doing fine-grained optimization:

- SP 自动广告
- SP 广泛匹配关键词
- SP 拓展匹配 ASIN 定位
- SP 精准 ASIN 定位
- SBV / SB when conditions allow

SBV keyword matching should use BROAD unless the operator explicitly asks otherwise.

## 2. Required Inputs

Before outputting or executing the structure, collect these inputs:

- SKU, ASIN, accountId, siteId, brand, price, profit, inventory, sale status.
- Existing ad state: SP auto, SP keyword, SP target, SB/SBV rows, campaign/ad group/productAd state.
- Variant relationship: sibling SKUs, same product-line traffic, reusable converting terms, risky failed terms.
- Keyword sources: keyword-conversion data, ABA / keyword ranking data, Product Time Machine, listing terms, variant search-term evidence.
- ASIN sources: ABA top ASINs, keyword-conversion top ASINs, front-search same-scene competitors.
- SBV / SB readiness: brand registry, store/brand info, exact video asset, or clearly reusable variant video asset.

Do not create terms or ASINs from generic imagination. Every keyword and ASIN must have a named source.

## 3. Diagnosis Order

1. Confirm the product can receive traffic.
   - Check sale status, price, profit, inventory, FBA/local availability, and listing theme.
   - If the product cannot receive traffic, stop and explain the blocker.

2. Read current ad coverage.
   - Identify whether the SKU already has reusable auto, keyword, ASIN, or SBV/SB lanes.
   - Do not duplicate a reusable lane unless the operator explicitly requests a new structure.

3. Check variant reuse.
   - Look at sibling SKU ad rows before proposing new traffic.
   - Separate proven traffic from caution traffic:
     - Proven: clicks plus orders or acceptable ACOS.
     - Caution: clicks without orders, high CPC, or weak relevance.
   - Use variant proof to choose core term and bid range, not to blindly copy every keyword.

4. Choose the core traffic theme.
   - Use the most relevant commercial scene, not only the literal product noun.
   - The core term should drive naming, broad keywords, and ASIN source selection.

## 4. Structure Build Rules

### SP Auto

- If a system auto campaign already exists, rename campaign and ad group first.
- Naming: `ai_auto_<core term>_<sku>`
- Raise bucket bids from dead-floor levels only when the product can receive traffic.
- Keep the four auto buckets separated:
  - `queryHighRelMatches`
  - `queryBroadRelMatches`
  - `asinSubstituteRelated`
  - `asinAccessoryRelated`

### SP Broad Keyword

- Naming: `ai_kw broad_<core term>_<sku>`
- Match type: BROAD.
- Use 3 to 8 keywords from keyword-conversion, ABA, listing, and proven variant terms.
- Avoid exact-only launch unless the operator explicitly asks for exact.
- Bid should be traffic-capable and evidence-based, using CPC and variant history as references.

### SP Expanded ASIN Targeting

- Naming: `ai_asin expanded_<core term>_<sku>`
- Target type: `ASIN_EXPANDED_FROM`.
- Source priority:
  - ABA top clicked / purchased ASINs for the core term.
  - Keyword-conversion top ASINs.
  - Strong variant traffic ASINs.
- Do not use unrelated category ASINs just to fill the structure.

### SP Exact ASIN Targeting

- Naming: `ai_asin exact_<core term>_<sku>`
- Target type: `ASIN_SAME_AS`.
- Source priority:
  - Amazon front-search same-scene competitors.
  - Directly comparable price, quantity, use case, and audience.
  - Strong known competitor ASINs from market evidence.
- Exact ASINs should be narrower than expanded ASINs.

### SBV / SB

- Create SBV only when brand and video readiness are available.
- Naming: `sbvkw_broad_<core term>_<sku>`
- Match type: BROAD.
- Minimum bid must respect the SBV/video floor; do not set below the backend floor.
- Video asset source rule:
  - First choice: exact ASIN-bound video asset.
  - Second choice: same-brand, same-product-line variant video, only if the operator accepts variant reuse or has explicitly asked to execute.
  - If neither exists, do not create SBV; record `video_asset_missing`.
- If SB instead of SBV is used, explain why SB is being used and what landing destination is selected.

## 5. Operator-Facing Output Before Execution

Before execution, output a checkable table with:

- Lane: auto / broad keyword / expanded ASIN / exact ASIN / SBV or SB.
- Campaign and ad group name.
- Budget and bid.
- Keyword or ASIN list.
- Source for every keyword and ASIN group.
- Variant reuse evidence.
- Execution blocker, if any.

The operator should be able to inspect the structure before landing it.

## 6. Execution Order

1. Rename existing system auto campaign/ad group.
2. Update existing auto bucket bids.
3. Create SP broad keyword campaign.
4. Create SP expanded ASIN campaign.
5. Create SP exact ASIN campaign.
6. Create SBV/SB only after brand and asset readiness are confirmed.

Do not execute SBV with exact keywords when the requested base structure is broad SBV.

## 7. Verification Standard

API success is not enough. Verification must include:

- API result: campaignId, adGroupId, keywordId/targetId/adId when returned.
- Live readback:
  - renamed campaign/ad group visible,
  - updated bids visible,
  - created keyword/target/SBV rows visible when the backend list has refreshed.
- If new SP rows are API-created but not yet visible in list readback, report this as `created_pending_visibility` and schedule/recommend a recheck.
- For SBV, record creative moderation status and serving status.

## 8. Follow-Up Rule

Use a 1d / 3d / 7d review cadence.

- 1d: check impressions and whether the structure is actually serving.
- 3d: check clicks, CPC, early search-term relevance, and ASIN placement relevance.
- 7d: check orders, spend, ACOS, and whether useful learning was produced.

If 7d spend rises with zero orders and no reusable search-term or ASIN learning, narrow, lower, pause, or rebuild the weak lane.

## 9. Standard Result Format

After execution, report in this order:

1. What landed.
2. What is pending visibility or moderation.
3. Keyword and ASIN source recap.
4. Variant reuse recap.
5. Next review date and rollback boundary.
