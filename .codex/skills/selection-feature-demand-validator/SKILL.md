---
name: selection-feature-demand-validator
description: >
  Use when working in ad-ops-workbench to validate whether a product feature,
  micro-innovation, design change, accessory, bundle idea, or developer request
  reflects real buyer demand. Use for Chinese prompts like 功能需求验证, 微创新,
  开发说加这个功能, 这个功能有没有需求, 差评痛点, 用户真需求, review 验证,
  要不要跟进竞品功能, or 产品改款判断. This skill uses internal selection,
  review/comment, keyword, community, listing, and SKU evidence instead of
  Sorftime. It does not make product-development decisions by itself.
---

# Selection Feature Demand Validator

## Purpose

Validate whether a proposed feature is real buyer demand or seller imagination. Use three evidence lanes: review/comment signal, keyword/market signal, and community/front-page signal, then cross-check our SKU economics and listing ability.

Default project root: `D:\ad-ops-workbench`.

## Evidence Lanes

### Review And Comment Signal

Prefer internal comment analysis:

```powershell
npm run chrome:ready
npm run ops:selection:extended -- --preset "comment-analysis asin-info" --asin <ASIN> --site 1 --date-info <YYYY-MM>
```

If comment-analysis is empty or stale, use `aicx-amazon-info` / browser-backed Amazon page reads for visible review/rating context. Do not pretend missing review rows mean no demand.

Classify evidence:

- positive feature praise.
- complaint about missing feature.
- complaint that the feature is poorly implemented.
- irrelevant mention.
- no usable review evidence.

### Keyword And Market Signal

Use feature-bearing and control terms:

```powershell
npm run ops:selection:keyword-conversion -- --keywords "<feature terms, base category terms>"
npm run ops:selection:aba-search-terms -- --search-terms "<feature terms, base category terms>"
npm run ops:selection:keyword-seasonality -- --search-terms "<feature terms, base category terms>"
npm run ops:selection:product-time-machine -- --search-keywords "<feature terms>"
```

Look for search volume, purchase proof, click-purchase rate, CPC pressure, ABA top-ASIN concentration, market window, and whether feature terms belong to the same product body.

### Community And Front-Page Signal

Use web/community search only as support, not as a replacement for internal data. Search buyer language around Reddit, Quora, YouTube comments, blog reviews, and Amazon visible Q&A/reviews when available. Keep URLs and distinguish buyer complaints from influencer or seller claims.

## Validation Logic

Return one of:

- `strong_real_demand`: at least two lanes show positive buyer demand and no major conversion blocker.
- `weak_real_demand`: one strong lane plus one partial lane; use only small validation.
- `uncertain`: evidence is thin, stale, or mixed; collect more data before development spend.
- `pseudo_demand`: no buyer signal or the feature is mostly seller-invented.
- `negative_demand`: buyers dislike or distrust the feature.

For existing SKUs, add SKU fit:

- Can our product body carry the feature naturally?
- Would the feature require listing/image/video changes?
- Does price/profit/inventory justify a test?
- Would advertising need new lanes or can existing buyer terms validate it?

## Output Contract

```text
功能/改款点:
<feature and product context>

结论:
<strong_real_demand / weak_real_demand / uncertain / pseudo_demand / negative_demand>

证据:
Review/comment: <what was found or missing>
Keyword/market: <conversion, ABA, seasonality, PTM facts>
Community/front-page: <buyer-language evidence and links if used>

对我们 SKU 的影响:
<listing, price, inventory, profit, ad validation, or repair requirement>

下一步:
<no action / low-cost validation / listing test / ad test / developer review, with exact evidence gap>
```

Developer-facing reply should be short and operational. Keep detailed evidence in the operator section.

## Red Lines

- Do not use Sorftime or 1688.
- Do not ask the user to provide product-page facts before trying internal/front-page reads.
- Do not treat a competitor title claim as buyer demand.
- Do not recommend development investment from keyword volume alone.
- Do not execute listing, ad, price, or replenishment changes from this skill alone.
