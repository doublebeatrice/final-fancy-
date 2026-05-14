# Proactive Operating Audit Rebuild 2026-05-14

## Why This Exists

The previous daily loop depended too much on user-discovered issues. It did not force daily checks for price action, arrived-inventory ad recovery, new-product launch, expired-season keyword cleanup, listing repair, or KPI gap.

## New Rule

Every daily task or ops run must generate:

- `data/tasks/proactive_operating_audit_<date>.json`
- `data/tasks/proactive_operating_audit_<date>.html`

The implementation is `src/proactive_audit.js`; the CLI is `scripts/run_proactive_audit.js`.

## 2026-05-14 Audit Result

- KPI status: off track.
- New-product launch gaps: 15.
- Arrival ad recovery gaps: 3.
- Price actions: 143.
- Expired-season keyword waste rows: 216.
- Listing/offer repair gaps: 294.

## KPI Recovery Gap

Compared with the 2026-06-12 hard target:

- Sales gap: +141,576.45.
- Units gap: +895.
- Net profit rate gap: +2.63 percentage points.
- Estimated net profit gap: +42,783.71.
- Ad cost share gap: -1.16 percentage points.
- ACOS gap: -2.66 percentage points.
- Refund-rate gap: -1.22 percentage points.
- Unit YoY gap: +6.47 percentage points.

The KPI is not impossible, but it is no longer achievable through the previous reactive workflow. It requires emergency recovery: launch new arrivals, repair low-delivery new products, clean expired season traffic, protect margin through price actions, repair listing/offer blockers, and scale only proven profitable traffic.

## Non-Negotiable Daily Checks

1. New products with inventory must have basic SP auto, SP keyword, and SP manual/targeting structure, or a same-day build task.
2. Existing new-product structure without delivery is not launched; repair delivery.
3. Arrived inventory must have effective ads reopened or scaled.
4. Tight-inventory and low-profit active sellers must enter price review.
5. Expired-season keywords must be paused/downbid unless recent efficient orders justify keeping them.
6. Listing/offer repair must be created for traffic without conversion, high ACOS, high refund, or missing listing evidence.
