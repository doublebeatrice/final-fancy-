---
name: ad-search-term-analyzer
description: >
  Use when working in ad-ops-workbench on Amazon Ads search terms, customer
  search terms, SP auto/manual search-term readback, query mining, low-efficiency
  terms, negative candidates, bid control, scale candidates, ASIN target
  candidates, listing-feedback terms, or Chinese prompts like 搜索词报告,
  customer search terms, 搜索词回读, 否词候选, 放量词, 控成本词, 跑偏词,
  出单词提词, or listing 反馈词. Prefer live ad backend reads over uploaded reports.
---

# Ad Search Term Analyzer

## Purpose

Analyze real buyer search terms from our ad backend and classify them into actions or feedback. This skill replaces external Amazon Ads report analysis with workbench live reads and existing ad closure rules.

Default project root: `D:\ad-ops-workbench`.

## Inputs

Accept:

- SKU, campaignId/adGroupId/accountId/siteId/property.
- A local CSV/XLSX search-term report if the operator provides one.
- Existing snapshot files with customer-search rows.

Prefer live backend reads when entity IDs are known.

## Live Read Paths

Start with:

```powershell
npm run chrome:ready
```

Useful reads:

```powershell
node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]
node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]
node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days|startYmd> [endYmd]
node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>
```

`fetch_sp_group_detail.js` calls `/customerSearch/targetFindAll` and `/advTarget/findManualProductTarget`. Customer-search terms are most useful for SP auto/manual groups. SB and some SP keyword groups may return only an empty aggregate placeholder; do not treat a placeholder as traffic evidence.

## Market Cross-Check

Before turning a search term into spend or negation, cross-check:

```powershell
npm run ops:selection:keyword-conversion -- --keywords "<terms>"
npm run ops:selection:aba-search-terms -- --search-terms "<terms>"
npm run ops:selection:keyword-seasonality -- --search-terms "<terms>"
npm run ops:selection:product-time-machine -- --search-keywords "<terms>"
```

Use `amazon-listing-health-check` or listing data when relevance depends on title, bullets, images, price, reviews, or product form.

## Classification

Classify each search term:

- `scale_up`: enough clicks/orders, acceptable ACOS/CVR, relevant to SKU, market proof agrees.
- `promote_to_manual`: converting auto/customer term that belongs in exact/phrase/broad lane.
- `hold_test`: relevant but low sample or mixed 3/7/30 signal.
- `reduce_bid`: relevant but inefficient; keep controlled if market/SKU fit remains valid.
- `negative_candidate`: irrelevant buyer intent or repeated spend with no order and no market/listing fit.
- `asin_target_candidate`: ASIN-like term or competitor/product-page signal suitable for SP ASIN target review.
- `listing_feedback`: buyer language missing or weak in listing, or repeated relevant term with poor conversion.
- `manual_review`: data conflict, missing SKU fit, mixed parent/campaign, or unsupported surface.

Separate bad habits from market misjudgment:

- Bad habit: irrelevant or loose matching inside an otherwise valid product lane.
- Market misjudgment: term/category/product body itself does not fit the SKU.

## Action Boundary

This skill produces candidates. Supported ad writes must go through `ad-ops-action-closure` with schema, dry-run, execution, and landed readback.

Before turning candidates into bid/budget changes, negatives, manual promotion, ASIN targets, or new lanes, use `D:\ad-ops-brain\playbooks\广告调整完整结构.md` as the canonical entry standard. The resulting action must state scope, problem scale, existing layers, missing/new layers, expected coverage, intensity, readback, and 3/7-day acceptance; if candidates cover only a minor part of the SKU gap, write `覆盖不足`.

Do not write negatives, bids, budgets, or new targets directly from this skill.

## Output Contract

```text
分析对象:
<SKU/campaign/ad group/date window/source>

搜索词分层:
<scale_up / promote_to_manual / hold_test / reduce_bid / negative_candidate / asin_target_candidate / listing_feedback / manual_review>

证据:
<clicks, spend, orders, sales, CVR, ACOS, 3/7/30 trend, market checks, listing fit>

建议动作:
<candidate action, exact entity layer, match type, bid/budget boundary, or no-action reason>

下一步:
<dry-run command, missing evidence, or checkpoint>
```

## Red Lines

- Do not analyze multiple ASINs as one product unless the user asks for a grouped verdict.
- Do not promote auto terms that are placeholders or not buyer-facing text.
- Do not negate from one low-sample click without market/listing context.
- Do not put broad recovery terms into an existing phrase/exact group just because the backend accepts it.
- Do not claim any ad action landed without row readback.
