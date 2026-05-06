# Stagnant Inventory Rules

This document is the internalized operating rule set from the sales stagnant-inventory files reviewed on 2026-05-06. It replaces the root Word source files as the durable reference.

## Core Principle

Stagnant inventory decisions must compare short-term profit and long-term profit.

- Short-term profit: sell now, discount, liquidate, remove through a service provider, or dispose, choosing the path with the smallest near-term loss and best cash recovery.
- Long-term profit: hold inventory until the next valid traffic window only when expected sale recovery after storage cost is better than liquidation or removal.

Do not treat high inventory days alone as an automatic clearance signal. The decision must include fulfillment method, remaining seasonal windows, storage cost, recovery value, replenishment cost, margin, and exemption status.

## Stagnant Quantity Definition

Current stagnant inventory rule:

```text
Air shipment: inventory that cannot sell through within 80 days is stagnant.
Sea shipment: inventory that cannot sell through within 140 days is stagnant.

FBA stagnant inventory = inbound + fulfillable + reserved - shipment_days * 30_day_sales / 30
```

Sales stagnant inventory should use the effective stagnant quantity:

```text
effective_sales_stagnant_qty =
  system_stagnant_qty
  - system_auto_exempt_qty
  - approved_development_quarter_exempt_qty
  - approved_sales_internal_exempt_qty
```

Exemptions are temporary. When an exemption expires, the SKU must be re-evaluated against real-time sales and inventory.

## Exemption Guardrails

System or sales exemptions can reduce stagnant quantity, but they do not prove that the product is healthy.

Known exemption cases:

- Not yet launched or launched within 3 months: exempt all stagnant quantity.
- Boutique / high-potential products: launched within 6 months can remain exempt.
- Account abnormality longer than 2 weeks: exclude the abnormal period impact.
- Policy-encouraged products, special exemption lists, and always-exempt lists: follow approved lists.
- Seasonal products: evaluate with real-time season windows and next traffic period.
- Development manual exemption: approved quarterly exemption carries into sales stagnant logic, normally extended 3 months.
- Sales internal manual exemption: must be applied before the monthly cutoff, agreed with development, approved by sales control, and rechecked after the exemption period.

## Seasonal Product Decision Rules

For single-season products such as Valentine's Day, Easter, Halloween, or Christmas, compare hold-to-next-season economics with current clearance economics.

Inputs:

- `stockingCost`: product cost + first-leg shipping + FBA inbound/configuration cost.
- `removalCost`: stocking cost minus service-provider or liquidation recovery.
- `storageCostToNextSeason`: estimated storage cost until the next valid traffic period.
- `normalSaleRecovery`: expected recovery at normal sale price during a stable traffic period.
- `liquidationRecovery`: expected batch liquidation recovery.

Decision rules:

1. Clear this year if:

```text
storageCostToNextSeason > stockingCost + removalCost
```

Holding is worse than re-stocking later. Accelerate clearance and consider smaller replenishment next year.

2. Clear this year if:

```text
storageCostToNextSeason < stockingCost + removalCost
and normalSaleRecovery - storageCostToNextSeason < liquidationRecovery
```

Holding is technically cheaper than re-stocking, but liquidation still loses less.

3. Hold to next season if:

```text
storageCostToNextSeason < stockingCost + removalCost
and normalSaleRecovery - storageCostToNextSeason > liquidationRecovery
```

Do not aggressively discount. Maximum discount should generally be less than the storage cost that would be incurred by holding.

4. Partially hold and partially clear if inventory cannot sell through in the next traffic window. Estimate sell-through for the next season, keep only the portion likely to sell, and accelerate clearance for the excess. Recalculate for a second or third future season only when justified by cost and traffic evidence.

If normal sale recovery is lower than removal or liquidation recovery, and there is no special reason such as late launch, listing restriction, or failed launch execution, clear inventory as early as possible.

## Multi-Season Products

For products with multiple valid traffic periods, such as teacher gifts, nurse gifts, CNA, graduation, wedding, or Christmas-adjacent gift products, do not default to a 12-month storage horizon.

Use the next real traffic period:

- Nurse gifts can be evaluated for Nurse Week first, then CNA or Christmas if Nurse Week cannot clear inventory.
- Teacher gifts can be evaluated for Teacher Appreciation, back-to-school, graduation, and Christmas where product fit is valid.
- Wedding or bridal products can use the broader wedding-season window when supported by product fit.

Hold decisions are more acceptable for multi-season products, but only when storage cost and expected recovery prove that holding beats liquidation or removal.

## Advertising Operating Implications

Advertising decisions on stagnant or seasonal inventory must optimize total economic outcome, not only today's ACOS.

- In an active or upcoming season window, a high-inventory SKU may justify controlled ad spend even if short-term profit thins, when the ad cost is lower than future storage, liquidation, or disposal losses.
- If hold-to-next-season economics are favorable, do not blindly slash price or pause all ads. Maintain price discipline and use controlled traffic to sell through.
- If clear-now economics are better, avoid spending heavily to preserve a product that should be liquidated.
- If inventory is tight, do not scale ads just because the season signal is strong.
- If the product is late-launched, restricted, or previously underbuilt, route to review before classifying it as a failed product.

## Suggested Data Fields

Future stagnant-inventory scoring should persist or derive:

- `shippingMode`: air or sea.
- `shipmentDaysForStaleRule`: 80 or 140.
- `systemStagnantQty`.
- `exemptQty`.
- `effectiveSalesStagnantQty`.
- `nextSeasonWindow`.
- `storageCostToNextSeason`.
- `stockingCost`.
- `removalCost`.
- `liquidationRecovery`.
- `normalSaleRecovery`.
- `expectedNextSeasonSellThroughQty`.
- `holdVsClearDecision`: hold, partial_hold, clear, dispose, or review.
- `maxDiscountByStorageCost`.
- `allowedAdSpendToAvoidStaleLoss`.

## Daily Review Checklist

For any active-season or preheat SKU with high inventory, answer:

- Is it air-shipment stagnant, sea-shipment stagnant, or only a watch item?
- Is any exemption valid, and when does it expire?
- Is this a single-season or multi-season product?
- What is the next valid traffic window?
- Is holding to the next season better than current liquidation?
- If holding is better, what is the maximum safe discount?
- If clearing is better, should ads be reduced and liquidation started?
- If inventory cannot clear next season, what quantity should be held and what quantity should be cleared now?

## Integration Rule

The daily season gap audit must be read before closing operations:

```powershell
node scripts\generate_season_gap_audit.js data\snapshots\latest_snapshot.json <YYYY-MM-DD>
```

Prioritize `critical_stale_season` and `season_structure_stale_risk`, then apply this document's hold-versus-clear economics before deciding ad spend, discounting, or liquidation.
