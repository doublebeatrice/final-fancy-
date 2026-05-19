# Overbudget Error Audit 2026-05-15

Scope reviewed after operator challenge:

- Dedicated overbudget plan: `data/learning/overbudget_plan_items_2026-05-15.json`
- Dedicated overbudget execution: `data/snapshots/action_schema_2026-05-15_overbudget_hard_stop_approved.json`
- Same-day budget-down sources that affected overbudget perception:
  - `data/snapshots/action_schema_2026-05-15_followup_rollbacks.json`
  - `data/snapshots/action_schema_2026-05-15_refund_gate_approved.json`

## Dedicated Overbudget Result

The dedicated overbudget hard-stop run did not lower campaign budgets. It only attempted productAd-level pauses for zero-order spend. The two landed pauses were:

- `LE8150` / productAd `326108145538816` / `asin expanded_social worker_le8150`: 25 clicks, 0 orders, 14.17 spend.
- `BEU0541` / productAd `450647672433036` / `auto_retirement gifts for women_beu0541`: 32 clicks, 0 orders, 9.37 spend.

Both were lower-layer productAd pauses, not campaign budget floors. Current audit finds no campaign-budget false cut inside the dedicated overbudget hard-stop schema.

## Additional False Budget Cuts Found

The remaining error was in adjacent budget-down schemas, not the dedicated overbudget hard-stop:

- `followup_rollbacks` overused the 3-day no-order proxy.
- `refund_gate` treated raw `profitRate` as the hard profit field and ignored `netProfit`, `busyNetProfit`, conversion, and inventory evidence.

Additional budget restores executed after this audit:

- `CLO0341` / `auto_rotating jewelry display stand_clo0341`: 3 -> 4.25
- `XIH2672` / `kw broad_mothers day gifts for mom_xih2672`: 4.5 -> 6.13
- `LRU1537` / `auto1_bear paper plates napkins_lru1537`: 1 -> 16.4
- `LRU1537` / `kw board_bear paper plates napkins_lru1537`: 1 -> 3
- `UAN2600` / `kw_phrase_inspirational_journal_uan2600`: 1 -> 6.56
- `UAN2600` / `auto_journals in bulk_uan2600`: 1 -> 15
- `UAN2600` / `asin_expand_inspirational_journal_uan2600`: 1 -> 6.56
- `UAN3257` / `journals in bulk-uan3257-system-a`: 1 -> 14.4
- `UAN3257` / `b2b auto_mini journals bulk_uan3257`: 1 -> 3

Execution files:

- `data/snapshots/action_schema_2026-05-15_budget_restore_additional_false_cuts.json`: 8/8 landed.
- `data/snapshots/action_schema_2026-05-15_lru1537_keyword_budget_restore.json`: 1/1 landed.

## Remaining Budget Downs Not Restored

These were left down intentionally, not classified as false cuts in this pass:

- `LUO1012`: 5.81 -> 4.25. Has 7-day orders and inventory, but busy net profit is negative and ACOS/profit pressure is not clean enough for automatic restoration.
- `ZUN0779`: 2.69 -> 1.75. `netProfit` and `busyNetProfit` are negative.
- `YUN2187`: 5.81 -> 4.25. `netProfit` and `busyNetProfit` are strongly negative.
- `LRU1537` ASIN campaign: 3 -> 1. Campaign-level evidence shows 0 orders; main auto and keyword traffic were restored instead.
- `CL3650`: 15 -> 1 and 3 -> 1 left for inventory-control review because current inventory days are only 11, so restoring traffic could create stockout pressure. The issue is not a reference-net-profit false cut; it needs explicit inventory/replenishment review.

## Durable Rule

Future overbudget review must separate:

1. Dedicated overbudget lower-layer waste control.
2. Follow-up rollback caused by short-window proxies.
3. Refund/profit gates caused by wrong profit-field selection.

Do not report "overbudget is clean" until all three are checked.

## Operator Logic Addendum

The follow-up operator challenge identified two missed campaigns with different action granularity:

- `ZO0892` / `auto_christian mothers day gifts_zo0892`: overbudget seasonal converter. Campaign evidence was 56.40 spend, 476.88 sales, 12 orders, 154 clicks, 11.83% ACOS; SKU evidence was `netProfit=15.79%`, `busyNetProfit=8.22%`, `invDays=59`, `units7=16`. Correct action is campaign budget-up, executed 12 -> 18.
- `YH3707` / `asin expanded_teacher appreciation gifts 4 pack_yh3707`: campaign total is not clean because SKU net profit is negative and campaign ACOS is high. Correct action is not campaign budget-up. Preserve only the proven ASIN target `247706497082148`, which had 4.32 spend, 29.98 sales, 2 orders, 15 clicks, 14.41% ACOS; executed target bid 0.27 -> 0.30.

Schema: `data/snapshots/action_schema_2026-05-15_operator_logic_zo0892_yh3707.json`. Execute/verify landed 2/2 with 0 failed and 0 not_landed.
