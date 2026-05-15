# Overbudget Review 2026-05-15

Snapshot cutoff: 2026-05-15 09:22.

## Status

This was not fully covered in the first closed-loop pass. The earlier run did include budget-down actions, but those came mainly from refund-gate and KPI/follow-up logic, not from a dedicated overbudget classification.

After rechecking, the overbudget board contains 8,198 rows. SP enabled campaign classification:

- aggressive budget expansion: 53
- controlled budget up: 228
- seasonal sell-through: 45
- lower-layer cost control: 517
- review/watch only: 3,967
- classified campaigns total: 4,810

Because today's business result is down again and ACOS/refund are both worse, budget-up overbudget lanes are not executed today. They are watch-only until 1d/3d evidence confirms orders and ACOS stay inside profit room.

## Executed Hard Stop

Generated a conservative hard-stop schema from overbudget productAds with:

- 0 orders
- enough clicks/spend
- inventory not tight
- not clearance-protected
- productAd-level pause only, no campaign budget-up

Dry run result:

- executable: 2
- manual_review: 12
- skipped_invalid_state: 16
- validationErrors: 0

Execute result:

- success: 2
- manual_review: 12
- skipped_invalid_state: 16

Successful pauses:

- LE8150 / productAd 326108145538816 / `asin expanded_social worker_le8150`
- BEU0541 / productAd 450647672433036 / `auto_retirement gifts for women_beu0541`

## Next Rule

Tomorrow 1d review must include overbudget separately:

- hard stop: no-order spend keeps rising or ACOS far above profit room
- budget shift: weak campaign capped while another same-SKU campaign converts
- watch only: profitable, stocked, order-positive capped campaigns

Do not execute overbudget budget-up while the account is down unless the campaign has fresh orders and ACOS remains within profit room.
