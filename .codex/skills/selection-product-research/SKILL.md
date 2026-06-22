---
name: selection-product-research
description: >
  Use when working in ad-ops-workbench on product research, market research,
  product selection, category/keyword opportunity, competitor pool, Go/No-Go
  product judgement, Top100-style market review, or Chinese prompts like 选品调研,
  市场调研, 产品能不能做, 产品能不能推, 类目分析, 竞品池, 市场机会, 需求空间,
  进入壁垒, or 替代 Sorftime. This skill replaces Sorftime-based product-research
  workflows with internal selection, sellerinventory, ad backend, and Amazon
  front-page evidence. Do not use 1688/supply-source analysis.
---

# Selection Product Research

## Purpose

Run product and market research from our own data stack instead of Sorftime. Use the smallest live evidence set that can answer the question, then expand only when the decision needs it.

Default project root: `D:\ad-ops-workbench`.

If research becomes an ad action, use `D:\ad-ops-brain\playbooks\广告调整完整结构.md` before `ad-ops-action-closure` or `new-product-ad-build`. Selection evidence can prove market direction, but it cannot replace operating goal, adjustment scope, problem scale, receiver capability, existing layers, missing/new layers, expected coverage, intensity, readback, or 3/7-day acceptance.

## Data Replacement Map

Read `references/internal-data-map.md` when you need exact command mapping from Sorftime-style capabilities to our internal sources.

Primary replacements:

- Keyword search volume, purchases, CPC, CPA, ACOS: `npm run ops:selection:keyword-conversion`.
- ABA demand, rank, top-ASIN concentration, market pressure: `npm run ops:selection:aba-search-terms`.
- Seasonality, Google Trend, competitor price/review/rating threshold: `npm run ops:selection:keyword-seasonality`.
- Competitor traffic map, natural/ad traffic mix, rank history, bought history: `npm run ops:selection:product-time-machine`.
- Amazon front-search competitor pool: `npm run ops:selection:keyword-research`.
- ASIN/category/BSR/new-release/comment/traffic-structure pages: `npm run ops:selection:extended`.
- SKU economics and inventory base: `sellerinventory-product-analysis` and daily deposit.
- Amazon front-page listing facts: `aicx-amazon-info` or browser-backed page read.

Do not use `ali1688_similar_product` or any 1688 replacement. Supply-source matching is outside this skill.

## Workflow

### 1. Identify The Research Unit

Clarify whether the task is about a keyword, product idea, SKU, ASIN, category, seasonal window, developer request, or ad opportunity. Resolve product identity first: form, buyer, use case, occasion, season, price band, and listing fit.

If the user gives only a vague product idea, build seed terms from buyer-facing language. If the user gives SKU/ASIN, start from current listing/product card before market data.

### 2. Pull Market Evidence

Use `npm run chrome:ready` before live selection reads.

Minimum market set:

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<seed terms>"
npm run ops:selection:aba-search-terms -- --search-terms "<term1,term2>"
npm run ops:selection:keyword-conversion -- --keywords "<term1,term2>"
```

Add when relevant:

```powershell
npm run ops:selection:keyword-seasonality -- --search-terms "<term1,term2>"
npm run ops:selection:product-time-machine -- --search-keywords "<term1,term2>"
npm run ops:selection:extended -- --preset "category-analysis bsr-list new-releases" --category "<Amazon category>" --site 1
npm run ops:selection:extended -- --preset "asin-info flow-structure comment-analysis association-flow ad-placement" --asin <ASIN> --site 1 --date-info <YYYY-MM>
```

Use `ops:selection:api` only for a read-only selection endpoint that lacks a normalized adapter.

### 3. Build Competitor And Opportunity View

For each candidate direction, separate:

- direct competitors: same product body and buyer job.
- scene competitors: same occasion/use case but adjacent product form.
- traffic bridges: useful keyword/ASIN evidence, not necessarily safe final targets.
- exclusions: wrong product body, only node overlap, own ASIN, same-store ASIN, or irrelevant buyer intent.

Judge opportunity from demand, concentration, price/review threshold, new-ASIN room, natural/ad traffic mix, season window, and whether our SKU/listing can actually carry the traffic.

### 4. Cross-Check Internal Fit

For existing SKUs, combine market evidence with:

- sellerinventory product-analysis: profit history, FBA inventory, 30-day sales, inventory amount.
- daily deposit/sales-core: current sales, profit, ACOS, refund and group trend.
- ad backend: 3/7/30 day impressions, clicks, orders, ACOS, CPC, budgets, existing lanes, customer search terms.
- listing/front page: title, bullets, price, rating, reviews, image/video readiness, Buy Box/buyability when available.

High inventory alone is not an opportunity. Market demand without SKU fit is research-only.

### 5. Decide Output Level

Use one of these boundaries:

- `research_only`: evidence is useful but product fit, demand, or timing is not enough.
- `small_step_validation`: narrow low-risk test may be useful after listing/inventory/profit checks.
- `launch_ready_candidate`: market and SKU fit are strong enough to prepare a controlled ad/listing handoff.
- `repair_first`: listing, price, review, inventory, or product identity must be fixed before traffic.
- `blocked_missing_evidence`: say exactly which evidence is missing.

## Output Contract

For a research answer, return:

```text
研究对象:
<product/keyword/SKU/ASIN/category and intended buyer/use case>

市场结论:
<demand, competition, season/window, product fit, and Go/No-Go or boundary>

证据:
<selection reports used, data freshness, top terms/ASINs, conversion economics, PTM/ABA/seasonality facts>

内部承接:
<listing, price, reviews, inventory, profit, existing ads, current action history>

机会/风险:
<validated lanes, blocked lanes, exclusions, missing evidence>

下一步:
<research only / dry-run candidate / live-action handoff / repair first, with exact command or skill handoff>
```

If a real ad action is justified, first complete `D:\ad-ops-brain\playbooks\广告调整完整结构.md`, then hand off to `ad-ops-action-closure` or `new-product-ad-build` for schema, dry-run, execution, and landed verification. Write `覆盖不足` when the selected market lane cannot cover the main SKU/product gap.

## Red Lines

- Do not use Sorftime or 1688 as a dependency.
- Do not infer a product opportunity from one high-volume term.
- Do not treat selection evidence as permission to write ads, price, listing, or inventory actions.
- Do not mix category Top100, keyword search results, and Product Time Machine rows without naming the source.
- Do not hide stale data; report `period.freshness`, snapshot date, or live-read status.
- Do not produce a Go decision without listing/price/review/inventory/economics fit for existing SKUs.
