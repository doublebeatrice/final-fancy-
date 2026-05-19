# Listing Copy Edit Action Design

Date: 2026-05-09

## Purpose

Add controlled listing copy edit capability to the ad ops workbench.

The system should support two inputs:

- Manual copy supplied by the operator, such as a new parent title and bullet points.
- Codex-generated candidate copy based on current SKU context, listing data, sales signals, seasonal goal, and operator intent.

Both paths must enter the same action schema and default to dry-run. Execution submits a seller inventory product edit application through the current logged-in browser session. It does not claim the Amazon listing has changed until the application is approved and visible later.

## Boundary

Codex remains the only AI decision entry point. Scripts validate, preview, submit, and record results; they do not generate copy or decide strategy.

Listing copy edits remain high-risk compared with bid and budget actions. Dry-run remains the default path.

Seasonal parent-title edits now have a limited operator-approved auto-execution path. Use `docs/SEASONAL_LISTING_COPY_RULES.md` as the controlling policy: non-top-50 SKU, title-only seasonal/core wording, strong product-event evidence, validation pass, and current external verification when the edit depends on annual or time-sensitive event wording. Other listing copy edits still require explicit operator, Codex, or manual approval fields before execution.

Required approval fields for executable listing copy edits:

- `decisionStage: "manual_approved"` or `decisionStage: "ai_approved"`
- `approvedBy: "manual"` or `approvedBy: "codex"`
- `actionSource` includes `manual` or `codex`
- `requiresAiDecision: false`
- `canAutoExecute: true`

## Action Schema

Use a new action shape:

```json
[
  {
    "sku": "STA2613",
    "asin": "",
    "summary": "Submit Father's Day focused copy update application.",
    "actions": [
      {
        "entityType": "listing",
        "actionType": "copy_edit",
        "id": "listing::2839421::STA2613",
        "productId": "2839421",
        "sku": "STA2613",
        "filedType": "A",
        "toEditorFlag": 1,
        "variantStatus": 1,
        "beforeStatus": 0,
        "languageType": "us,uk,ca",
        "synchronizeFields": [
          "bullet_points1",
          "bullet_points2",
          "bullet_points3",
          "bullet_points4"
        ],
        "synchronizeVariantSkus": [
          "STA2604",
          "STA2607",
          "STA2610"
        ],
        "remark": "Optimize Father's Day product copy",
        "reason": "Sales are weak; update copy for Father's Day positioning.",
        "original": {
          "parentTitle": "Existing title",
          "bulletPoints": [
            "Existing bullet 1",
            "Existing bullet 2"
          ]
        },
        "now": {
          "parentTitle": "New title",
          "bulletPoints": [
            "New bullet 1",
            "New bullet 2",
            "New bullet 3",
            "New bullet 4",
            "New bullet 5"
          ]
        },
        "phraseFrequencyText": "Current keyword/frequency reference text",
        "hypothesis": "Father's Day and Christian men's gift positioning should improve relevance and conversion.",
        "expectedEffect": {
          "sessions": "watch",
          "conversionRate": "up",
          "orders": "up",
          "acos": "watch"
        },
        "reviewPlan": {
          "windows": [3, 7, 14],
          "metrics": ["listingSessions", "listingConversionRates", "orders", "adAcos"]
        },
        "riskLevel": "listing_copy_edit_reviewed",
        "confidence": 0.75,
        "decisionStage": "manual_approved",
        "approvedBy": "manual",
        "actionSource": ["manual"],
        "requiresAiDecision": false
      }
    ]
  }
]
```

Field names should normalize to project style, but executor output must map to the backend form names:

- `product_id`
- `sku`
- `to_editor_flag`
- `filed_type`
- `synchronizeFields[]`
- `synchronizeSkus`
- `remark`
- `relation`
- `variant_status`
- `before_status`
- `is_simple_wa`
- `title_type`
- `language_type`
- `reason`
- `original[parent_title]`
- `original[bullet_points][]`
- `original[product_description]`
- `original[search_core_keywords]`
- `now[parent_title]`
- `now[bullet_points][]`
- `now[product_description]`
- `now[search_core_keywords]`
- `now[synchronize_variant_sku]`
- `exclude_simple`
- `phrase_frequency_text`
- `origin`

## Dry-Run Behavior

Dry-run should not call the seller inventory API.

It should write a preview artifact containing:

- SKU and product id.
- New title and bullet points.
- Original title and bullet points when present.
- Synchronized fields.
- Variant SKUs that will receive synchronized changes.
- Backend endpoint and form keys, with sensitive headers omitted.
- Validation warnings such as empty bullet, missing product id, too many bullets, unsupported language type, or missing approval.

The dry-run artifact is the human approval surface. Operators should review it before running with `--execute`.

## Execution

Execution should use the current debug Chrome session and find a `sellerinventory.yswg.com.cn` tab.

The executor should:

1. Fetch the original English edit data from `/kernel/productEditApply/getOriginData?sku=<SKU>&type=en` when original copy is missing or stale.
2. Read CSRF from the DOM, Laravel globals, input token, or cookie inside the live browser tab.
3. Build `URLSearchParams` from the normalized action.
4. POST to `https://sellerinventory.yswg.com.cn/kernel/productEditApply/store`.
5. Use `credentials: "include"` and browser cookies.
6. Parse JSON response.
7. Record `code`, `msg`, `id`, and `ids`.

Observed 2026-05-15 live submission:

- `STY6101` product description-only edit submitted successfully from the live `sellerinventory.yswg.com.cn` browser context.
- Request used `filed_type=A`, `variant_status=2`, no `synchronizeFields[]`, empty `now[synchronize_variant_sku]`, `original[product_description]`, and `now[product_description]`.
- Response was `{"code":200,"msg":"提交成功!","id":4449048,"ids":[4449048]}`.
- Chinese `remark` and `reason` rendered correctly when the form body was built inside the browser with `URLSearchParams`; do not build Chinese form bodies through PowerShell inline strings because previous validation showed that can turn Chinese into `?`.

Sensitive values must not be persisted:

- CSRF tokens.
- Cookies.
- JWT values.
- `Inventory-Token`.
- Full copied browser request headers.

## Verification

First implementation verifies only the product edit application submission.

Success means:

- HTTP request completed.
- JSON response has `code: 200`.
- Response includes an application `id` or non-empty `ids`.

The verification result should be labeled `submitted_pending_review` or equivalent, not `success_landed`. Later approval and Amazon listing visibility are separate lifecycle states.

## Validation

Validator should accept `entityType: "listing"` and `actionType: "copy_edit"`.

Required fields:

- `productId`
- `sku`
- `now.parentTitle` or at least one non-empty `now.bulletPoints`
- `reason`
- Approval fields listed in Boundary.

Recommended warnings:

- Empty first bullet in `now.bulletPoints`.
- More than five bullet points.
- Title over common Amazon length targets.
- Bullet text that appears unrelated to product profile or keyword seeds.
- Variant synchronization requested without explicit `synchronizeVariantSkus`. If no variant SKUs are selected, omit `synchronizeFields[]` entirely; sending sync fields with empty `now[synchronize_variant_sku]` causes the backend to reject the request with `请选择要同步的变体`.
- Missing original copy, because review diffs become weaker.
- Theme conflict between automatic season tags and concrete listing/search/operator evidence.

## AI-Generated Copy Path

Codex may generate copy candidates, but script code must not generate copy.

Flow:

1. Read current SKU context from snapshot, listing cache, product profile, sales history, and operator instruction.
2. Fetch original edit data through `getOriginData` when snapshot listing fields are missing or before live execution.
3. Decide the copy theme from concrete evidence first: title, bullets, `search_core_keywords`, `phrase_frequency_text`, product profile, inventory `productLabels.product_label`, current external event sources when needed, and operator notes. Automatic season tags are supporting evidence only.
4. If concrete evidence conflicts with automatic season tags, emit review instead of blindly generating copy from the tag. For example, `father`, `dad`, `men`, or `父亲节` in title/search/operator notes should override an unrelated Nurse Week or Graduation auto tag unless stronger product evidence says otherwise.
5. For seasonal titles, prefer stable buyer-facing terms over internal calendar labels. Do not write internal labels such as `Summer Product Season` into Amazon titles.
6. If the historical title or product context clearly supports `baby shower`, `gender reveal`, or `baby sprinkle`, keep that core phrase even when inventory marks the SKU as non-children product.
7. Sensitive awareness/cultural nodes require concrete event evidence. Do not map a product to Mental Health Awareness Month, Black History Month, Juneteenth, Pride, or similar nodes from generic overlap such as `month`, `day`, `gift`, or `party`.
8. Codex writes a candidate `copy_edit` action schema.
9. Run dry-run.
10. Operator review is required for non-seasonal copy, top-50 SKUs without explicit release, weak evidence, unresolved external annual-theme checks, origin-title mismatch, or validation warnings that cannot be safely repaired.
11. If approved or auto-executable under `docs/SEASONAL_LISTING_COPY_RULES.md`, Codex or manual reviewer sets approval fields and runs execute. The executor must compare live `getOriginData` parent title with the planned original parent title immediately before posting; mismatch means stale plan and no submission.

## Manual Copy Path

Manual copy should use the same schema.

The operator can provide title and bullets directly. Codex normalizes that into a `copy_edit` action, attaches original copy when available, and runs dry-run. Execution still requires explicit approval.

## Non-Goals

- Do not store pasted CSRF tokens or copied request headers.
- Do not add AI runtime to the extension or scripts.
- Do not auto-submit generated copy without a reviewed dry-run artifact.
- Do not claim listing copy has landed on Amazon after the application API returns success.
- Do not broaden this to price changes, image changes, or replenishment changes in the first implementation.

## Test Plan

Add focused tests for:

- `copy_edit` action normalization and approval gates.
- Missing required fields becoming review or validation errors.
- Dry-run preview generation without tokens.
- Backend form body mapping, including array fields and variant synchronization.
- Response classification for `code: 200` with `id` and for failed responses.
