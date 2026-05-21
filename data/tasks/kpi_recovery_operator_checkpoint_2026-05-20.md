# KPI recovery operator checkpoint - 2026-05-20

- Generated at: 2026-05-20T12:24:21.331Z
- Business date: 2026-05-20
- Data date: 2026-05-19
- Current status: needs_recovery; closedLoop=true; dailyComplete=false.
- Machine checkpoint: data/tasks/kpi_recovery_checkpoint_2026-05-20.json
- Dashboard: data/reports/daily_dashboard_2026-05-20.html
- Handoff: data/agent/agent_handoff_2026-05-20.md

## KPI gate result

- Gate status: fail.
- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.

| Metric | Target | Actual | Gap |
| --- | ---: | ---: | ---: |
| Total sales | 541,080.88 | 525,427.69 | -15,653.19 |
| Units | 3,754 | 3,663 | -91 |
| Net profit rate | >= 19.47% | 19.41% | -0.06pp |
| ACOS | <= 19.77% | 19.98% | +0.21pp |
| Refund rate | <= 5.28% | 5.46% | +0.18pp |
| Ad cost share | <= 10.80% | 10.12% | -0.68pp |

Next recovery target for 2026-05-21: sales >= 543,689.74, units >= 3,770, net profit rate >= 19.48%, ACOS <= 19.73%, refund rate <= 5.25%, ad cost share <= 10.80%.

## Data deposit state

- Deposit status: complete.
- Missing original raw files: none.
- Suspicious fallback inputs: none.
- Raw candidate scan: total 0, same-date 0, stale 0.
- sales_core_original_xlsx: no candidate found.
- inventory_original_csv: no candidate found.
- ad_full_original_csv: no candidate found.
- Next action: raw archive is complete; continue KPI recovery and effect review.

## Action pools

| Pool | Current result | Operator decision |
| --- | --- | --- |
| Low efficiency | rawActionable 568; currentExecutable 0; hold 21; skip 43 | raw low-efficiency pool still has candidates, but current agent write chain has no eligible low-risk action; do not treat raw pool count as pending live writes |
| Effect review | total 14; continue_watch 14; needsAction 0 | continue watch until the next 3-day or 7-day review window |
| Write execution | eligible 0; blocked 0; executed stages 0 | no low-risk write action is pending in the agent write chain |
| KPI recovery dry-run | highEfficiencyBidUps 37; SKUs 31; latest ops_2026-05-20T07-34-48-533Z | dry-run recovery candidates exist; review before any live execution; not counted as landed actions |

Current landed evidence:

- landedActionSuccess: 655
- landedActionManualReview: 0
- landedActionFailed: 16
- feedbackApplied: 15

## Recovery dry-run candidates

- Latest run: ops_2026-05-20T07-34-48-533Z.
- Latest run count: 37.
- By decision: high_efficiency_small_bid_up=36, high_efficiency_standard_bid_up=1.
- By entity type: keyword=11, manualTarget=1, sbKeyword=11, autoTarget=14.

| SKU | Entity | Bid | Evidence |
| --- | --- | --- | --- |
| NO3390 | keyword: kw2_butterfly baby shower_no3390 | 0.15 -> 0.18 | orders7=3; ACOS7=2.58%; invDays=84 |
| ZO0892 | autoTarget: auto_christian gifts for women_zo0892 | 0.17 -> 0.19 | orders7=2; ACOS7=0.33%; invDays=54 |
| EY2727 | sbKeyword: sbvkw1_straw sun hats for women_ey2727 | 0.27 -> 0.3 | orders7=2; ACOS7=2.49%; invDays=40 |
| XIX2353 | sbKeyword: sbv kw broad_letter stencils_xix2353 | 0.29 -> 0.32 | orders7=2; ACOS7=6.37%; invDays=22 |
| IF1738 | keyword: kw_q2 profit if1738 broad_if1738 | 0.2 -> 0.22 | orders7=1; ACOS7=0.24%; invDays=54 |
| DUI0086 | sbKeyword: large wooden cutting board-dui0086-sbv-s-new | 0.25 -> 0.28 | orders7=1; ACOS7=0.63%; invDays=60 |
| UY0879 | autoTarget: b2b auto_therapy office decor_uy0879 | 0.25 -> 0.28 | orders7=1; ACOS7=1.01%; invDays=53 |
| QA3169 | autoTarget: auto_softball senior night gifts_qa3169 | 0.19 -> 0.21 | orders7=1; ACOS7=1.06%; invDays=34 |

## Next checks

- refresh_deposit_status: `npm run ops:deposit:status -- --date 2026-05-20 --json` (status=complete and missing=[])
- refresh_kpi_gate: `npm run ops:kpi:gate -- --date 2026-05-20` (status is pass or fail after evaluatedBusinessDate=2026-05-20)
- track_next_recovery_target: `npm run ops:kpi:gate -- --date 2026-05-21` (evaluatedBusinessDate=2026-05-21 and status is pass or fail)
- verify_closure: `npm run ops:closure:verify -- --date 2026-05-20` (ok=true with explicit deposit missing/suspicious details if still partial)
- effect_review_next_window: `npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-20.json --collect-evidence --today 2026-05-20 --evidence-out data\agent\review_evidence_2026-05-20.json --out data\agent\effect_review_2026-05-20.json --profit-report data\snapshots\profit_review_2026-05-20.json` (needsAction=0 or concrete rollback/secondary action candidates are produced)

## Current operator stance

- Data deposit is complete; keep the operating day partial only because KPI recovery is still off track.
- Treat KPI gate failure as a recovery signal, not permission for broad spend expansion.
- Dry-run recovery rows are opportunity evidence only; live execution still needs a fresh gate and guardrail decision.
- Prioritize controlled efficient-volume recovery while protecting refund rate, ACOS, and inventory days.
