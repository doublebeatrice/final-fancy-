# 2026-05-16 XUL2303 EMS Week / CNA Week

## Source

- Forwarded intent: `XUL2303 宝子标题广告补充 EMS Week 5.17-5.23，还有 CNA Week`
- Request type: title keyword and ad keyword supplement request.
- Operator note: source is the forwarded screenshot/text from the operator, not direct chat history.

## Product

- SKU: XUL2303
- ASIN: B0F4XT3ZYK
- Current known title: `Sherr 8 Pcs Dumpster Fire Gift Set 911 Dispatcher Appreciation Gift Set Funny Desk Accessories with Wooden Pencil Holder, A6 Notebook Sticky Notes Pad 5 Ballpoint Pens`
- Product type: office gift / appreciation gift set with dumpster fire humor, pencil holder, notebook, sticky notes, pens.
- Primary current recipient fit: 911 dispatcher, office/coworker/employee appreciation, first responder-adjacent gifting.
- Weak recipient fit: CNA/nursing assistant. The current title and core keywords do not clearly show CNA or nursing assistant-specific product design.

## Evidence

- Inventory CSV snapshot: price 9.99, 62 fulfillable on 2026-04-17, 30d sales 22, 30d ad orders 11, 30d ACOS 36.12%, rating 4.7 with 10 reviews.
- Latest task board 2026-05-15: 45 fulfillable, sellable days about 82, 7d sales 1, 30d sales 17, 7d ad spend 3.30 with 1 order, 30d ad spend 123.30 with 22 orders.
- Season event table:
  - National EMS Week: 2026-05-17 to 2026-05-23; high-frequency window 2026-05-03 to 2026-05-23.
  - CNA Week / National Nursing Assistants Week: 2026-06-11 to 2026-06-17; high-frequency window 2026-05-28 to 2026-06-17.
- Season-title dry run for business date 2026-05-15 did not include XUL2303 as an automatic EMS/CNA title candidate.

## Diagnosis

- EMS Week is a plausible secondary node because the listing already says `911 Dispatcher Appreciation`, and EMS/first responder gifting overlaps with the current audience.
- EMS Week starts immediately, so this is active/last-mile traffic, not early preheat. Any ad supplement should be low-budget and tightly scoped to first responder/EMS terms.
- CNA Week is later and less aligned with the current listing. Putting CNA into the title now would over-broaden the product promise unless the images or copy explicitly support nursing assistant gifting.
- Because recent profit/net signal is tight and 7d traffic is low, this should be a reversible test rather than a broad budget increase.

## Handling

- Do not force both EMS and CNA into the title together.
- Recommended title/listing handling:
  - If submitting a title edit, add only a conservative EMS/first responder phrase, e.g. `First Responder EMS Week Gift`, while keeping `911 Dispatcher Appreciation`.
  - Hold CNA title wording unless listing images or bullets can be revised to support nursing assistant/CNA recipients.
- Recommended ad handling:
  - Add or test low-bid EMS-related exact/phrase terms: `ems week gifts`, `ems appreciation gifts`, `first responder gifts`, `paramedic gifts`, `911 dispatcher gifts`.
  - Do not start broad CNA traffic now for XUL2303; at most keep a small watch/test closer to 2026-05-28 after checking title/image fit.
- Execution status:
  - 2026-05-16 retry: title copy edit application submitted through sellerinventory.
  - Application ID: `4449788`.
  - Submitted title: `Sherr 8 Pcs Dumpster Fire 911 Dispatcher EMS Week First Responder Gift Set with Pencil Holder Notebook Sticky Notes Pens`.
  - Execution result file: `data/snapshots/xul2303_ems_title_execution_2026-05-16.json`.
  - Status note: submitted for editor review; Amazon front-end landing still needs approval/visibility check.

## Follow-up

- 2026-05-17 10:00 check:
  - Sellerinventory debug session had expired to the login page, so application `4449788` approval status could not be verified in the backend.
  - Public Amazon page title fetched on 2026-05-17: `Sherr 8 Pcs Funny Dumpster Fire Response Team Desk Gift for Nurse Week, Teacher Week, First Responders Month, with Wooden Pencil Holder, A6 Notebook, Sticky Notes Pad and 5 Ballpoint Pens`.
  - Front-end visibility judgement: current page has first-responder-adjacent wording, but the submitted `EMS Week First Responder` title has not landed exactly, and `EMS Week` is not visible in the public title.
  - Latest local ad/task data is still the 2026-05-15 run; no fresh post-submission EMS landing data is available yet. Existing rows show XUL2303 7d ads: spend 3.30, clicks 15, orders 1; nurse/teacher May keywords had very low or no recent orders.
- 2026-05-18: check whether EMS-related impressions/clicks are landing and whether existing dispatcher terms lift.
- 2026-05-18 corrected check:
  - Ran `npm run chrome:ready`; both adv and sellerinventory sessions returned ready, so the 2026-05-17 login-expired result should not be treated as a final blocker.
  - Sellerinventory application query found title application `4449788`: `status=0`, `backstage_status=0`, next handler `陈紫云`, `send_to_editor_time=2026-05-16 13:03:17`, no `backstage_time` yet. Judgement: still pending editor/backend processing, not landed.
  - Sellerinventory current origin title and public Amazon title both remain: `Sherr 8 Pcs Funny Dumpster Fire Response Team Desk Gift for Nurse Week, Teacher Week, First Responders Month, with Wooden Pencil Holder, A6 Notebook, Sticky Notes Pad and 5 Ballpoint Pens`. `EMS Week` is still not visible.
  - Refreshed ad data through 2026-05-17: SKU 7d = 1597 impressions, 19 clicks, spend 4.14, 0 orders; 30d = 16535 impressions, 254 clicks, spend 59.43, 11 orders.
  - `kw_may_xul2303` 7d = 1114 impressions, 13 clicks, spend 3.15, 0 orders. First-responder terms are present but not lifting yet: `first responder appreciation gift` 50 impressions / 0 clicks, `first responders month gift` 44 impressions / 0 clicks. No explicit `EMS Week` keyword row is present.
  - `auto_911 dispatcher_xul2303` 7d = 483 impressions, 6 clicks, spend 0.99, 0 orders; this is down from previous 7d 1535 impressions / 26 clicks and shows no dispatcher-term lift yet.
- 2026-05-20: review spend, clicks, orders, and search-term fit; continue only if traffic quality is clean.
- 2026-05-28: reassess CNA Week separately. Only test CNA if the listing copy/images have enough nursing assistant relevance.
- 2026-05-19 correction / withdrawal:
  - New operator-forwarded concern: `EMS Week` was flagged as trademark-risk wording; use `EMS` alone if this direction is retried. The screenshot also questioned why the product description field visibly contains `</br>` tags.
  - Sellerinventory application `4449788` was withdrawn successfully through `/pm/edit_apply/delete`; execution file: `data/snapshots/xul2303_ems_title_withdrawal_2026-05-19.json`.
  - Verification query after withdrawal returned 7 historical rows and no `4449788`; verification file: `data/snapshots/xul2303_listing_copy_apply_query_after_withdrawal_2026-05-19.json`.
  - Current sellerinventory origin title still remains the original Nurse Week / Teacher Week / First Responders Month title; the EMS Week title was not live.
  - Current origin `product_description` is 1380 characters and does start with `</br>Features:`. The real formatting issue in the submitted application was not the `</br>` marker itself; the execution path collapsed textarea newlines into spaces, so every description section was squeezed into one line. Future listing-copy submissions must preserve the per-line `</br>` format instead of normalizing description whitespace like title/search-term fields.
- 2026-05-19 resubmission after format repair:
  - Repaired submission kept `EMS` / `First Responder` wording and removed `EMS Week`.
  - Submitted title: `Sherr 8 Pcs Funny Dumpster Fire EMS First Responder 911 Dispatcher Gift Set, Desk Accessories with Wooden Pencil Holder, A6 Notebook, Sticky Notes Pad and 5 Ballpoint Pens`.
  - Sellerinventory application `4461056` submitted successfully and is pending editor review; execution file: `data/snapshots/xul2303_ems_first_responder_title_execution_2026-05-19.json`.
  - Verification query found `4461056` in the application list with `backstage_status=0`, next handler `陈紫云`, and `send_to_editor_time=2026-05-19 11:20:40`.
  - Verified submitted `edit_content.product_description` retains newline-separated `</br>` lines instead of being squeezed into one line; verification file: `data/snapshots/xul2303_listing_copy_apply_query_after_resubmit_2026-05-19.json`.

## Reply Draft

我看了下，XUL2303 这款本身更像 911 dispatcher / office appreciation 的趣味礼品套装，和 EMS Week 的 first responder 场景是能接上的，5.17-5.23 这个节点可以补，但建议先小步测，不要一下子把范围拉太泛。

标题这边我建议优先补 EMS / first responder 方向，CNA 先不直接塞标题，因为当前产品文案和图片承接更偏 911 dispatcher，不是很典型的 nursing assistant 礼品。广告可以先补 `ems week gifts`、`ems appreciation gifts`、`first responder gifts`、`paramedic gifts`、`911 dispatcher gifts` 这类更贴的词，低价跑一下看曝光和点击质量。

CNA Week 是 6.11-6.17，真正高频窗口更靠近 5月底后，我这边先把它单独记着，等 EMS 这轮看完，再判断要不要按 CNA 做小词测试，避免现在提前买到不贴的护理泛流量。
