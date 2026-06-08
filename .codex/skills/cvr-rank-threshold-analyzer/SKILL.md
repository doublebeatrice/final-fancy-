---
name: cvr-rank-threshold-analyzer
description: >
  Use when working in ad-ops-workbench to compare SKU/ASIN daily CVR, ad CVR,
  sessions, orders, sales, or offsite/traffic-push windows against natural-rank
  movement, Product Time Machine rank history, SIF-like keyword history, or
  questions like CVR 低到多少会伤自然位, 站外放量风险线, 自然排名波动,
  观察线, 危险线, 广告 CVR 确认线, or 放量后承接风险. This skill replaces
  external SIF/Sorftime threshold analysis with Product Time Machine, sales-core,
  ad backend, and sellerinventory evidence.
---

# CVR Rank Threshold Analyzer

## Purpose

Backtest whether low conversion periods align with natural-rank movement for core terms or stable traffic terms. Use this to define observation, danger, and ad-CVR confirmation lines for traffic pushes, offsite tests, and launch scaling.

Default project root: `D:\ad-ops-workbench`.

## Evidence Inputs

### Daily Business Panel

Build or read daily ASIN/SKU rows with:

- date.
- SKU and ASIN.
- sessions or clicks.
- orders and units.
- overall CVR.
- ad clicks/orders/ad CVR when available.
- ad spend, sales, ACOS, CPC.
- listing sessions/conversion from product cards when available.

Sources: daily deposit, sales-core, latest snapshots, `fetch_ad_sku_summary`, `fetch_sku_ad_product_data`, sellerinventory product-analysis, and current ad backend.

### Rank And Keyword Panel

Use Product Time Machine for SIF-like rank evidence:

```powershell
npm run chrome:ready
npm run ops:selection:product-time-machine -- --search-keywords "<core terms>" --time-piece-value 7
```

Use keyword seasonality and ABA if market movement may explain rank changes:

```powershell
npm run ops:selection:keyword-seasonality -- --search-terms "<core terms>"
npm run ops:selection:aba-search-terms -- --search-terms "<core terms>"
```

Use `flow-structure` for ASIN traffic terms when core terms are not known:

```powershell
npm run ops:selection:extended -- --preset "flow-structure asin-info" --asin <ASIN> --site 1 --date-info <YYYY-MM>
```

## Method

1. Define the analysis window.
   - Minimum useful sample: 21 days. If shorter, report `DONE_WITH_CONCERNS`.
   - Mark traffic-push/offsite windows when known.

2. Select keyword baskets.
   - Core terms: user-provided or high-importance buyer terms.
   - Stable terms: terms with repeated rank/traffic evidence before the push.
   - Exclude unrelated terms, same-store noise, and terms where market seasonality is the main movement.

3. Define rank events.
   - Core term natural rank drops by 5+ positions.
   - Core term drops out of page-one band.
   - Stable-term basket has 30%+ synchronous rank worsening.
   - Product Time Machine keyword history shows search-volume/rank movement that is not explained by market trend alone.

4. Test CVR thresholds.
   - Overall CVR observation line: higher recall; early warning.
   - Overall CVR danger line: higher precision/lift; pause or shrink traffic before action.
   - Ad CVR confirmation line: only confirms whether paid traffic is also failing to convert.

5. Explain causality boundary.
   - Do not call the threshold an Amazon algorithm rule.
   - Separate listing/price/review/inventory conversion weakness from market-window decline.
   - Separate offsite traffic dilution from ad-row inefficiency.

## Output Contract

```text
分析对象:
<SKU/ASIN, date window, core terms, traffic-push window>

数据完整性:
<daily rows, rank rows, missing dates, freshness, sample warning>

三条线:
观察线: <metric, threshold, recall/precision/lift or not enough data>
危险线: <metric, threshold, recall/precision/lift or not enough data>
广告CVR确认线: <metric, threshold, support level or not enough data>

排名事件:
<term/basket, date, movement, market-window notes>

运营解释:
<traffic can continue / shrink traffic / repair listing / market decline / wait for sample>

下一步:
<exact evidence command, checkpoint, or handoff to ad-ops-action-closure>
```

## Red Lines

- Do not use Sorftime, external SIF cache, or 1688 as required inputs.
- Do not force a precise threshold when the sample is too small.
- Do not treat correlation as proof of Amazon rank algorithm.
- Do not pause or raise ads from this skill alone; hand off to ad closure with dry-run and readback.
- Do not ignore market seasonality or competitor trend when rank changes.
