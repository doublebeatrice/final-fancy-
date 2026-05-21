# Seasonal Cold Start To Preheat Gate

Date: 2026-05-19

Scope: all seasonal, solar-term, event-window, and gift-window products.

## Rule

Seasonal product work is a continuous follow-up process, not a one-time product-pool label.

A product can enter the seasonal candidate pool because of product image, product form, target recipient, event fit, adjacent scenario, or event-window traffic. But before it moves from cold start to preheat, it must show that it can actually attract runnable traffic.

## Stage Definitions

- `discovery`: product looks relevant by image/product identity or market hypothesis, but traffic path is not verified.
- `cold_start`: product is under small controlled traffic tests.
- `validated_cold_start`: at least one traffic path has measurable response, such as impressions, clicks, search term response, early conversion, or clear market evidence.
- `preheat`: validated product can receive more structured seasonal listing/ad/keyword support before the event peak.
- `peak_window_push`: event window is close or active, and the SKU has enough evidence to push.
- `post_season_review`: review actual traffic, conversion, inventory, and whether to keep or archive the seasonal route.

## Execution Gate

Do not move a SKU into `preheat` only because:

- the product looks seasonally relevant,
- listing/title/ad names mention the event,
- an operator wants to push the event,
- a related product in the group has traffic,
- or a keyword has market volume.

Move it into `preheat` only after the SKU has verified runnable traffic or a clearly justified transfer path from a very close variant/product with matching image and buyer intent.

Every seasonal SKU review should state the current stage and the evidence for moving or not moving to the next stage.
