# KPI recovery operator checkpoint - 2026-05-22

- Generated at: 2026-05-22T03:18:12.083Z
- Business date: 2026-05-21
- Data date: 2026-05-20
- Current status: blocked; closedLoop=true; dailyComplete=false.
- Machine checkpoint: data/tasks/kpi_recovery_checkpoint_2026-05-22.json
- Dashboard: data/reports/daily_dashboard_2026-05-22.html
- Handoff: data/agent/agent_handoff_2026-05-22.md

## KPI gate result

- Gate status: fail.
- Target business date: 2026-05-21; evaluated business date: 2026-05-21; data date: 2026-05-20.

| Metric | Target | Actual | Gap |
| --- | ---: | ---: | ---: |
| Total sales | 536,451.66 | 516,741.99 | -19,709.67 |
| Units | 3,702 | 3,582 | -120 |
| Net profit rate | >= 19.41% | 19.33% | -0.08pp |
| ACOS | <= 19.57% | 19.78% | +0.21pp |
| Refund rate | <= 5.45% | 5.70% | +0.25pp |
| Ad cost share | <= 10.80% | 10.16% | -0.64pp |

Next recovery target for 2026-05-22: sales >= 540,393.59, units >= 3,726, net profit rate >= 19.42%, ACOS <= 19.52%, refund rate <= 5.40%, ad cost share <= 10.80%.

## Data deposit state

- Deposit status: blocked.
- Missing original raw files: sales_core_original_xlsx, inventory_original_csv, ad_full_original_csv, seller_success_rate_json, seller_success_rate_csv, daily_html, daily_deposit_manifest.
- Suspicious fallback inputs: none.
- Raw candidate scan: total 2, same-date 0, stale 2.
- sales_core_original_xlsx: no candidate found.
- inventory_original_csv: inv_auto_filtered_2026-05-16-09-24-30.csv from 2026-05-16 (reference_only_stale).
- ad_full_original_csv: 广告全盘导出_近30天_2026-05-16_17-26-21.csv from 2026-05-16 (reference_only_stale).
- Next action: restore or redownload the same-date original raw files; no same-date candidates were found.

## Action pools

| Pool | Current result | Operator decision |
| --- | --- | --- |
| Low efficiency | rawActionable 0; currentExecutable 0; hold 0; skip 0 | no new low-efficiency live write justified |
| Effect review | total 101; continue_watch 91; needsAction 0 | continue watch until the next 3-day or 7-day review window |
| Write execution | eligible 0; blocked 0; executed stages 0 | no low-risk write action is pending in the agent write chain |
| KPI recovery dry-run | highEfficiencyBidUps 0; SKUs 0; latest none | no high-efficiency dry-run recovery candidates recorded; not counted as landed actions |
| KPI approval review | total 0; recommendApprove 0; approvalNeeded 0; hold 0; blocked 0 | no approval-needed write review is currently required |

Current landed evidence:

- landedActionSuccess: 1,204
- landedActionManualReview: 38
- landedActionFailed: 3
- feedbackApplied: 101

## Recovery dry-run candidates

- Latest run: none.
- Latest run count: 0.
- By decision: none.
- By entity type: none.

| SKU | Entity | Bid | Evidence |
| --- | --- | --- | --- |
| - | - | - | No dry-run recovery candidates recorded. |

## KPI approval review

- Review pack: kpi_approval_review_2026-05-22.md.
- Summary: total 0; recommendApprove 0; approvalNeeded 0; hold 0; blocked 0.
- Operator decision: no approval-needed write review is currently required.

## Next checks

- refresh_deposit_status: `npm run ops:deposit:status -- --date 2026-05-22 --json` (status=complete and missing=[])
- refresh_kpi_gate: `npm run ops:kpi:gate -- --date 2026-05-22` (status is pass or fail after evaluatedBusinessDate=2026-05-21)
- track_next_recovery_target: `npm run ops:kpi:gate -- --date 2026-05-22` (evaluatedBusinessDate=2026-05-22 and status is pass or fail)
- verify_closure: `npm run ops:closure:verify -- --date 2026-05-22` (ok=true with explicit deposit missing/suspicious details if still partial)
- effect_review_next_window: `npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-22.json --collect-evidence --today 2026-05-22 --evidence-out data\agent\review_evidence_2026-05-22.json --out data\agent\effect_review_2026-05-22.json --profit-report data\snapshots\profit_review_2026-05-22.json` (needsAction=0 or concrete rollback/secondary action candidates are produced)

## Current operator stance

- Keep the day data-deposit partial until raw gaps or suspicious fallback inputs are cleared.
- Treat KPI gate failure as a recovery signal, not permission for broad spend expansion.
- Dry-run recovery rows are opportunity evidence only; live execution still needs a fresh gate and guardrail decision.
- Prioritize controlled efficient-volume recovery while protecting refund rate, ACOS, and inventory days.
