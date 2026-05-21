# KPI recovery operator checkpoint - 2026-05-21

- Generated at: 2026-05-21T07:16:40.766Z
- Business date: 2026-05-20
- Data date: 2026-05-19
- Current status: needs_recovery; closedLoop=true; dailyComplete=false.
- Machine checkpoint: data/tasks/kpi_recovery_checkpoint_2026-05-21.json
- Dashboard: data/reports/daily_dashboard_2026-05-21.html
- Handoff: data/agent/agent_handoff_2026-05-21.md

## KPI gate result

- Gate status: fail.
- Target business date: 2026-05-20; evaluated business date: 2026-05-20; data date: 2026-05-19.

| Metric | Target | Actual | Gap |
| --- | ---: | ---: | ---: |
| Total sales | 541,080.88 | 516,741.99 | -24,338.89 |
| Units | 3,754 | 3,582 | -172 |
| Net profit rate | >= 19.47% | 19.33% | -0.14pp |
| ACOS | <= 19.77% | 19.78% | +0.01pp |
| Refund rate | <= 5.28% | 5.70% | +0.42pp |
| Ad cost share | <= 10.80% | 10.16% | -0.64pp |

Next recovery target for 2026-05-21: sales >= 536,451.66, units >= 3,702, net profit rate >= 19.41%, ACOS <= 19.57%, refund rate <= 5.45%, ad cost share <= 10.80%.

## Data deposit state

- Deposit status: complete.
- Missing original raw files: none.
- Suspicious fallback inputs: none.
- Raw candidate scan: total 0, same-date 0, stale 0.
- Next action: raw archive is complete; continue KPI recovery and effect review.

## Action pools

| Pool | Current result | Operator decision |
| --- | --- | --- |
| Low efficiency | rawActionable 2; currentExecutable 0; hold 20; skip 650 | raw low-efficiency pool still has candidates, but current agent write chain has no eligible low-risk action; do not treat raw pool count as pending live writes |
| Effect review | total 47; continue_watch 47; needsAction 0 | continue watch until the next 3-day or 7-day review window |
| Write execution | eligible 0; blocked 0; executed stages 0 | no low-risk write action is pending in the agent write chain |
| KPI recovery dry-run | highEfficiencyBidUps 0; SKUs 0; latest none | no high-efficiency dry-run recovery candidates recorded; not counted as landed actions |
| KPI approval review | total 1; recommendApprove 1; approvalNeeded 0; hold 0; blocked 0 | review recommend_approve and approval_needed items before any human-authorized live write |

Current landed evidence:

- landedActionSuccess: 515
- landedActionManualReview: 0
- landedActionFailed: 3
- feedbackApplied: 47

## Recovery dry-run candidates

- Latest run: none.
- Latest run count: 0.
- By decision: none.
- By entity type: none.

| SKU | Entity | Bid | Evidence |
| --- | --- | --- | --- |
| - | - | - | No dry-run recovery candidates recorded. |

## KPI approval review

- Review pack: kpi_approval_review_2026-05-21.md.
- Summary: total 1; recommendApprove 1; approvalNeeded 0; hold 0; blocked 0.
- Operator decision: review recommend_approve and approval_needed items before any human-authorized live write.

## Next checks

- refresh_deposit_status: `npm run ops:deposit:status -- --date 2026-05-21 --json` (status=complete and missing=[])
- refresh_kpi_gate: `npm run ops:kpi:gate -- --date 2026-05-21` (status is pass or fail after evaluatedBusinessDate=2026-05-20)
- track_next_recovery_target: `npm run ops:kpi:gate -- --date 2026-05-21` (evaluatedBusinessDate=2026-05-21 and status is pass or fail)
- verify_closure: `npm run ops:closure:verify -- --date 2026-05-21` (ok=true with explicit deposit missing/suspicious details if still partial)
- effect_review_next_window: `npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-21.json --collect-evidence --today 2026-05-21 --evidence-out data\agent\review_evidence_2026-05-21.json --out data\agent\effect_review_2026-05-21.json --profit-report data\snapshots\profit_review_2026-05-21.json` (needsAction=0 or concrete rollback/secondary action candidates are produced)

## Current operator stance

- Data deposit is complete; keep the operating day partial only because KPI recovery is still off track.
- Treat KPI gate failure as a recovery signal, not permission for broad spend expansion.
- Dry-run recovery rows are opportunity evidence only; live execution still needs a fresh gate and guardrail decision.
- Prioritize controlled efficient-volume recovery while protecting refund rate, ACOS, and inventory days.
