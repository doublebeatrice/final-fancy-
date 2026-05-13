# KPI Target For 2026-06-12

Baseline: 2026-05-12 run, latest 7-day seller sales core data for HJ17/HJ171/HJ172. Data date: 2026-05-11.

## Current 7-Day Baseline

| Metric | 2026-05-12 |
| --- | ---: |
| Sales amount | 578,203.49 |
| Units | 3,944 |
| Net profit rate | 19.13% |
| Estimated net profit | 110,593 |
| Gross profit rate | 33.25% |
| Ad cost share | 11.12% |
| Ad spend | 64,290.90 |
| ACOS | 18.94% |
| ROAS | 5.28 |
| CPC | 2.245 |
| CPS | 15.81 |
| SP | 33.44% |
| AT | 45.92% |
| Refund rate | 4.74% |
| Unit YoY | -27.66% |

## 2026-06-12 KPI

| Metric | Hard Target | Stretch Target |
| --- | ---: | ---: |
| 7-day sales amount | >= 680,000 | >= 720,000 |
| 7-day units | >= 4,600 | >= 4,900 |
| Net profit rate | >= 20.5% | >= 21.5% |
| Estimated 7-day net profit | >= 139,000 | >= 155,000 |
| Gross profit rate | >= 33.5% | >= 34.0% |
| Ad cost share | <= 10.5% | <= 10.0% |
| ACOS | <= 18.0% | <= 17.5% |
| ROAS | >= 5.55 | >= 5.70 |
| CPC | <= 2.20 | <= 2.15 |
| CPS | <= 14.80 | <= 14.20 |
| SP | <= 32.0% | <= 30.5% |
| AT | >= 46.0% | >= 47.0% |
| Refund rate | <= 3.8% | <= 3.3% |
| Unit YoY | >= -15.0% | >= -10.0% |

## Seller Split Targets

| Seller | Sales Target | Units Target | Net Profit Rate | ACOS | Ad Cost Share |
| --- | ---: | ---: | ---: | ---: | ---: |
| HJ171 | >= 425,000 | >= 2,800 | >= 20.5% | <= 18.0% | <= 10.8% |
| HJ17 | >= 250,000 | >= 1,780 | >= 20.0% | <= 18.5% | <= 9.8% |
| HJ172 | >= 2,000 | >= 15 | >= 12.0% | <= 30.0% | <= 12.0% |

## Operating Guardrails

- Do not buy sales by letting efficiency deteriorate: if sales reaches target but net profit rate is below 20.0%, the KPI is not passed.
- Do not over-control ads into revenue loss: if ad cost share is below 10.0% but sales stays below 650,000, the KPI is not passed.
- HJ172 must be treated as cleanup/repair unless its ACOS is below 30% and refund rate is below 10%.
- Every daily run must classify all eligible SKUs into action, review, or no-action, then verify landing for executable actions.
- Unsupported campaign-level state actions must stay in review until a verified executor exists.

## Daily Check Protocol

Every operating day before advertising decisions:

1. Read the freshest snapshot `sellerSalesRows` for the `所选编号汇总` row and the three seller rows `HJ17`, `HJ171`, `HJ172`.
2. Compare the rolling 7-day result against the trajectory below.
3. Write the gap into `daily_learning_<date>`: sales gap, unit gap, net-profit gap, ad-cost gap, ACOS gap, refund gap, and the seller causing the gap.
4. Decide the day's action mix from the gap:
   - Sales below track and ad efficiency healthy: recover and scale proven traffic.
   - Sales below track and ad efficiency unhealthy: fix conversion/listing/traffic quality before adding spend.
   - Sales on track but net profit below track: prioritize waste cuts, refund causes, and price/profit checks.
   - Ad cost below target but sales weak: do not celebrate; find missed traffic and structure gaps.

## Trajectory

| Check Date | 7d Sales | 7d Units | Net Profit Rate | Ad Cost Share | ACOS | Refund Rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-05-19 | >= 610,000 | >= 4,150 | >= 19.5% | <= 11.0% | <= 18.8% | <= 4.5% |
| 2026-05-26 | >= 635,000 | >= 4,300 | >= 19.8% | <= 10.8% | <= 18.5% | <= 4.2% |
| 2026-06-02 | >= 660,000 | >= 4,450 | >= 20.1% | <= 10.7% | <= 18.3% | <= 4.0% |
| 2026-06-09 | >= 675,000 | >= 4,550 | >= 20.3% | <= 10.6% | <= 18.1% | <= 3.9% |
| 2026-06-12 | >= 680,000 | >= 4,600 | >= 20.5% | <= 10.5% | <= 18.0% | <= 3.8% |

## Gap To Close From 2026-05-12

- Sales: +101,797 rolling 7-day sales.
- Units: +656 rolling 7-day units.
- Net profit rate: +1.37 percentage points.
- Estimated net profit: +28,400 or more.
- Ad cost share: -0.62 percentage points while sales grows.
- ACOS: -0.94 percentage points.
- Refund rate: -0.94 percentage points.
- Unit YoY: improve by at least 12.66 percentage points.

## Execution Levers

1. Protect and scale efficient winners.
   - Use seller-sales abnormal pools, season gap audit, SKU ad summary, product chart, and lower-layer rows to find products with healthy conversion, enough inventory, and ACOS below target.
   - Increase only proven keyword/auto/manual/SB lower-layer traffic in small steps; do not raise broad traffic without converting evidence.
   - Prioritize Father's Day, Graduation, Summer, Wedding, Pride, and evergreen high-profit products where inventory can carry the next 30 days.

2. Recover missed traffic without waste.
   - Treat falling clicks/impressions on profitable SKUs as opportunity underdelivery, not automatically as spend control.
   - Restore historical converting traffic, repair paused product ads or lower-layer rows when the row is executable, and send unsupported campaign/ad-group state gaps to manual review.
   - Build manual handoff lists for SB/SBV/B2B structure gaps where automation cannot safely execute.

3. Cut waste at the lower layer.
   - Reduce or pause high-click/no-order keywords, auto targets, manual targets, product ads, SB keywords, and SB targets.
   - Avoid campaign-level budget cuts as the default for over-budget rows; inspect lower-layer traffic first.
   - Keep daily ad spend growth below sales growth. At the hard target, ad spend should be no more than about 71,400 for the rolling 7-day window.

4. Improve net profit and refund rate.
   - Check low-profit and high-refund developer/SKU rows before scaling.
   - Use listing copy edits, price/profit review, variant cleanup, and review handoff where traffic quality is acceptable but conversion or refund blocks profit.
   - Do not scale products whose recent sales are driven by low-margin or high-refund behavior.

5. Inventory and season discipline.
   - Run season gap audit daily and convert active-season high-inventory rows into explicit action, review, or no-action.
   - For stagnant inventory, apply `docs/STAGNANT_INVENTORY_RULES.md` before choosing ads, clearance, hold, or removal.
   - Avoid stockout on winners; inventory-tight products should not receive traffic scale unless replenishment and profit support it.
