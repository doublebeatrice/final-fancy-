---
name: developer-product-inquiry
description: >
  Use when the operator forwards WeCom/WeChat/developer/product messages about
  product requests, new features, launch nodes, advertising adjustments,
  listing changes, traffic problems, or follow-up reminders. Use for Chinese
  prompts about 开发诉求, 产品诉求, 新品曝光, 能不能推, 帮开发回复, 跟进节点,
  运营口吻回复, or messages that need product-level diagnosis, execution,
  scheduled follow-up, and human-ready replies.
---

# Developer Product Inquiry

## Trigger

触发词：开发诉求、开发。

When the operator sends either trigger word with a forwarded message, screenshot, SKU, ASIN, product name, or request context, treat it as a developer/product inquiry and run this skill.

## Core Boundary

The operator forwards the message. Do not claim you read WeCom, WeChat, chat history, or private messages directly.

Start from the forwarded text and any SKU/ASIN/listing/context the operator provides. If a concrete SKU, ASIN, Amazon link, product name, or campaign entity appears, use project data and available product/listing fetch skills before deciding.

## Operating Principle

Treat every developer request as a product operating problem first, not an ad-panel task.

硬规则：必须先做产品判断。不要只停留在广告层面，不能只写广告指标；广告数据只能作为产品判断后的证据和执行层说明。

Use `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` as the default evidence stack when the request depends on demand, product fit, keyword expansion, traffic recovery, or whether a product can be pushed. Do not wait for the operator to explicitly ask for ABA or keyword conversion data. Build the profile from market demand, keyword economics, SKU ad proof, listing/price fit, inventory/economics, and recent action history.

Before recommending or executing any ad, listing, price, inventory, or follow-up action, state:

- What kind of product this is.
- Which season, occasion, recipient, node, or evergreen demand it belongs to.
- Whether current traffic is expected to be early, active, tailing, or absent.
- What evidence supports that judgement.
- What action is appropriate now and what would be premature.

Do not only write advertising metrics such as impressions, clicks, orders, ACOS, or bid changes. Those metrics explain delivery; they do not replace product judgement.

## Required Workflow

1. Preserve the source intent.
   - Identify who is asking, what they want, what product/SKU/ASIN it concerns, and whether they are asking for action, explanation, timing, or a reply.
   - If the forwarded message is ambiguous, infer conservatively and list the missing fields.

2. Build product-level diagnosis.
   - Classify product type, target user, occasion, seasonality, and sales window.
   - For market or demand questions, pull selection ABA search-term evidence and keyword conversion economics when the terms/product theme can be inferred.
   - Check whether the request is about demand not arriving yet, ad delivery undercoverage, listing conversion weakness, product-node mismatch, expired season waste, inventory/profit constraints, or an unsupported execution surface.
   - Use evidence from snapshot/product cards, listing text/images, search terms, historical sales, season event data, current ad rows, inventory days, rating/reviews, refund/profit, and prior actions where available.
   - If current market/search trend evidence is missing, say so. Do not fabricate "search heat", competitor movement, or season timing.

3. Decide the action.
   - For supported ad actions, execute or prepare the action schema through the repo's existing ad-ops flow, with hypothesis, expected effect, measurement window, rollback condition, dry-run, execution, and landing verification.
   - For listing, price, replenishment, new feature, or unsupported surfaces, produce a review/action brief and say what can or cannot be executed now.
   - If no action should be taken yet, explain the product reason, not just "data insufficient".
   - If the forwarded request asks for a concrete supported change such as "title supplement", "ad keyword supplement", "add node terms", or "push this SKU", do not stop at diagnosis and reply drafting. Either execute the supported workflow, prepare the executable schema/dry-run and state why execution is blocked, or explicitly say "not executed yet". Never let the operator infer that a title, listing, ad, or backend action changed when it was only analyzed.
   - For listing copy edits submitted through sellerinventory, report the lifecycle precisely: dry-run valid -> application submitted with application ID -> pending editor review -> Amazon front-end visible. A successful application response is `submitted_pending_review`, not front-end landed.
   - For partial execution, separate each requested surface. Example: "EMS title submitted; CNA held for weak product fit; ad keywords prepared but not yet executed." Do not collapse mixed statuses into a generic "handled".

4. Set follow-up checkpoints.
   - Pick checkpoints from the product and action, not a fixed Monday/Wednesday/Friday cadence.
   - Typical ad micro-adjustment: same day landing check, then 1d/3d/7d effect review.
   - New product or preheat season test: 2-3d traffic-quality check, 5-7d order/conversion check, then continue/rollback/shift listing.
   - Listing edit: submission/approval check first, then 7d/14d conversion and sessions review after the change is live.
   - Price/replenishment/node feature: use the execution lag and business window; do not force ad-style checkpoints.
   - When real future reminders are needed, create or update a Codex automation/heartbeat for the next checkpoint and record the next action in the response.

5. Draft a human operator reply after every node.
   - Provide a short internal summary for the operator.
   - Then provide a separate "可直接转发" reply that sounds like the operator, not like AI.
   - Every reply must include product judgement, action/status, and next follow-up point.

## Product Diagnosis Checklist

Use this checklist before drafting the reply:

- Product identity: What is it? Gift, party supply, religious item, school item, seasonal decor, storage, apparel, consumable, etc.
- Demand source: Who buys it and why now?
- Timing: Is this preheat, peak, tail, off-season, evergreen, or unknown?
- Evidence: Which fields or observations support the timing? Examples: title/bullets, season event window, historical sales curve, 7d/30d movement, search terms, product-card sessions, competitor/listing clues, node feature, inventory pressure.
- Constraint: Inventory, profit, refund, rating/review, price, listing readiness, compliance, or execution support.
- Best next move: push, hold, test small, repair listing, control waste, wait for node traffic, or escalate.

If a product could belong to multiple nodes, say which node is primary and which is secondary. Example: a Christian gift can be Mother's Day, Easter, baptism, or evergreen religious gift; the action changes depending on the active window.

## Output Contract

When handling a concrete forwarded request, answer the operator in this shape:

```text
判断：
<product-level diagnosis in 2-5 bullets or a short paragraph>

处理：
<what was executed, what is blocked, or what should be done next>

跟进节点：
<specific next check date/time or relative window, with what to inspect>

可直接转发：
<natural reply text for the developer/product person>
```

For long or multi-SKU requests, group by product/node, then write one concise reply per person or request thread.

When actually processing a request that needs future follow-up, create or update a durable record under `data/developer_requests/` with:

- original forwarded message
- product/SKU/ASIN
- diagnosis and evidence
- action taken or blocked
- follow-up checkpoints
- reply drafts already sent
- next checkpoint status

## Human Reply Style

Default to concise developer-facing replies.

- Keep "可直接转发" to 1 short paragraph or 2 short bullets unless the operator explicitly asks for detail.
- Include only three things: product judgement, action/status, next checkpoint.
- Do not paste diagnostic metrics into the developer reply unless the metric directly justifies the action.
- Keep detailed evidence in the operator summary or developer request record, not in the forwarded reply.

Good replies sound like a hands-on operator:

- "我看了下，这款更像是..."
- "现在曝光低不一定是广告没推，先看节点流量到没到。"
- "我今天先做小步测试，没有直接拉大预算。"
- "周三我回看曝光、点击质量和有没有出单，再决定继续放还是先修承接。"

Avoid machine or report language:

- Do not mention AI, model, Codex, schema, scripts, automation, or internal files.
- Do not say "根据系统分析", "我将持续监控", "建议您耐心等待", or "数据表现良好" without specifics.
- Do not overpromise results or imply a change is live if it is only submitted/review-only.
- Do not write a long defensive explanation when a short operator reply is enough.

## Missing Evidence Rules

Do not invent evidence. 不要编造搜索热度、竞品动作、历史节点、执行结果或对方原话。Use explicit missing-data language:

- "现在只看到广告侧数据，还缺 Listing/历史节点数据，所以我先按低成本测试处理。"
- "如果这款确实是复活节主推款，还需要看去年同节点或同类词的起量时间。"
- "当前没有证据证明节点流量已经起来，所以不建议直接大幅放量。"

When evidence is missing but an immediate action is still useful, make it a reversible low-risk test with a checkpoint.

## Mutable Request And Seasonal Title Boundary

When a developer/product thread changes direction, the newest forwarded message controls the next action. Restate the new final intent before continuing, and stop maintaining the older plan unless the operator explicitly asks to preserve it.

Separate ad preheat from listing-title changes:

- "Catch some seasonal traffic", "low spend", "low test", or similar wording means keep the action at a capped ad test unless the newest message still explicitly asks for a title/listing edit.
- Do not treat a seasonal traffic test as automatic permission to submit a title change.
- If a title edit has already been submitted and the request changes, check the live sellerinventory origin data before claiming the title changed or was withdrawn.

For seasonal title wording, distinguish node terms from prohibited phrase combinations:

- A node term such as `Fathers Day` may still be usable.
- If account management or Amazon feedback flags a phrase combination such as `Fathers Day Gifts` or `Gifts for Dad`, avoid that combination specifically instead of removing the whole node or inventing awkward wording.
- A compliant repair title must still read like buyer-facing Amazon copy. Do not over-optimize for avoidance in a way that sounds unnatural.

For sellerinventory listing applications:

- A successful store response means `submitted_pending_review`, not Amazon-front-end landed.
- If a second title repair is blocked because an A-class modification is already in workflow, say the SKU must be handled through the modification application table instead of pretending a replacement was submitted.

## Reply Examples

### Initial New-Product Exposure Request

Developer says: "这个新品最近曝光不太起来，你们看下能不能帮忙推一下？"

Better reply:

```text
我看了下，这款更像是复活节节点产品，不是全年稳定跑量的常青款。现在曝光低不能只按广告没跑起来判断，要先看复活节相关流量有没有到预热窗口。

目前从产品主题和节点节奏看，它还处在偏早的测试阶段，直接大幅加预算容易买到泛流量。我今天先没有硬拉预算，只保留和复活节主题最贴的词做小步曝光测试，泛的 gift/decor 先不扩。

我这边两三天后回看一次，如果曝光开始起来但点击质量正常，就继续沿节点词小幅放；如果有点击没转化，就先回到主图、标题和价格承接上处理。
```

### Follow-Up: Node Traffic Not Yet Active

```text
我今天回看了下，这款复活节方向还没有明显起量，曝光低更像是节点流量还没到，不是单纯广告没推。

所以今天没有继续硬加预算，只保留低成本测试位，避免提前烧费。等相关词开始有自然曝光或点击反应后，再加会更划算。现在重点是先把标题、主图和核心词埋好，等窗口起来再推。
```

### Follow-Up: Traffic Active But Conversion Weak

```text
这两天曝光和点击有起来，说明节点方向不是没流量，但订单没有跟上，问题就不只是广告层面了。

我今天先把泛流量收了一点，保留更贴复活节场景的词继续测。下一步建议同步看主图、标题和价格承接，不然继续加广告会变成有点击没转化。
```

### Follow-Up: Test Is Working

```text
这轮看下来方向是成立的，复活节相关流量起来后已经开始带订单，当前 ACOS 还在可接受范围内。

我今天没有扩太多新词，先把已经有效的那一层稳住。后面可以继续小步放量，但不建议一下子拉太大，先把稳定出单的流量沉下来。
```

## Common Mistakes

- Only answer "曝光低、点击少、出单少" without saying what product it is.
- Treat every developer "能不能推" as bid/budget up.
- Use fixed follow-up days without considering season, listing review lag, or product lifecycle.
- Tell the operator to reply with internal diagnostics instead of a natural message.
- Forget to produce a new reply after each follow-up checkpoint.
