# Seasonal Listing Variant Title Guard

Date: 2026-05-19

Scope: all seasonal, solar-term, event-window, and gift-window listing title edits. This is not limited to Father's Day or CNA/Nurse Week.

## Rule

Before changing a seasonal listing title for SKUs in the same variant group, check whether the variants need differentiated titles. Do not let a seasonal keyword update collapse real variant differences.

Variant differences that must be preserved include:

- target role or recipient, such as Father of the Bride vs Father of the Groom
- quantity or set size
- color, pattern, language, design, or personalized text
- product form or included components
- audience, occasion, or scene that changes the buyer intent

## Execution Standard

If the backend says one same-group variant is already modifying the parent title, treat that as a risk signal, not as automatic coverage.

Use this order:

1. Compare product images and source titles across the variant group.
2. Identify which words are true variant differences.
3. If the variants need different buyer-facing titles, do not submit a common parent title that removes those differences.
4. If the backend only supports a shared parent title, either keep the title generic while preserving all variant roles, or hold the title edit.
5. Only use `synchronizeVariantSkus` when the title is intentionally safe for all synchronized SKUs.

## PIR4617 / PIR4610 Correction

PIR4617 and PIR4610 are both Father's Day relevant wedding gift boxes, but the product text and images distinguish Father of the Groom from Father of the Bride.

The repair title submitted on 2026-05-19 removed that distinction by changing both to a generic Dad title. Application `4466727` was withdrawn after review because it could weaken or overwrite the variant distinction.

For this group, no further listing title application should be submitted unless the new title preserves the Bride/Groom distinction or the backend path is confirmed to support separate child titles.
