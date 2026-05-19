# 2026-05-18 XIH Father's Day Christian Notebook Request

## Source

- Operator forwarded screenshot with SKUs: XIH2677, XIH2672, XIH2562, XIH2559.
- Original intent: "XIH2559标题父亲节前置 打父亲节广告".

## Time Context

- Local date: 2026-05-18 Asia/Shanghai.
- Business date from current execution context: 2026-05-17.
- Data date from current execution context: 2026-05-16.
- Father's Day internal window is active for Q2 testing; broad season policy covers 2026-05-15 to 2026-06-25, while the explicit season calendar peak is 2026-06-14 to 2026-06-21.

## Product Judgement

These SKUs are Christian bow notebook / Bible study journal gift sets. Father's Day is a secondary gift angle, not the primary listing identity. The safe action is low-budget keyword testing around Christian dad / faith based dad terms, not broad Father's Day gifts or budget expansion.

## SKU Decisions

| SKU | Decision | Evidence | Follow-up |
| --- | --- | --- | --- |
| XIH2677 | Prepared low-budget SP keyword create candidate. | 77 fulfillable, 304 inv days, units 3/7/30 = 2/3/8, SP 30d orders 22 at low ACOS, recent 7d traffic light. | If executed, check 1d launch, 3d clicks/spend quality, 7d orders/ACOS. |
| XIH2559 | Prepared low-budget SP keyword create candidate. | Main-push note, 127 fulfillable, 294 inv days, units 3/7/30 = 0/5/13, but SP 7d has 18 clicks / 0 orders. | If executed, keep $1 cap and stop if 3d clicks are unqualified or 7d no orders. |
| XIH2672 | Held. | 31 fulfillable, sellable days 3/7/30 = 9/19/31, units 3/7/30 = 12/13/33. Demand exists but inventory is tight for extra seasonal traffic. | Recheck stock/replenishment in 1-3d before opening a new Father's Day layer. |
| XIH2562 | Held. | 43 fulfillable plus 12 inbound, but SP 30d spend 12.46 / 64 clicks / 0 orders and last-week listing sessions = 0. | Check listing/search fit first; do not add another seasonal traffic layer until承接 improves. |

## XIH2559 Title Decision

Sellerinventory origin data was checked through `GET /kernel/productEditApply/getOriginData?sku=XIH2559&type=en` and returned `code:200`.

Current parent title:

`Resurhang Christ Bow Spiral Notebook & Pen Set, Bible Verse Lined Journal 5.5 x 8.3 in, Pink Bow Pattern, Scripture Christian Journal Gift for Women, Bible Study`

Operator overrode the title hold and requested execution according to the developer's ask. The title edit was submitted through sellerinventory and is pending editor review; it is not Amazon front-end visible yet.

## Prepared Files

- Action schema: `data/snapshots/action_schema_2026-05-18_fathers_day_xih_christian_test_pending_codex.json`
- Dry run command: `node scripts\execute\run_actions.js data\snapshots\action_schema_2026-05-18_fathers_day_xih_christian_test_pending_codex.json --dry-run --snapshot data\snapshots\runs\today_ops_2026-05-18T01-41-18-939Z\snapshot_2026-05-18.json`
- Dry run result: validation passed with 2 executable create actions, 2 review/hold items, 0 validation errors. No live ad creation was executed.

## Execution Update

- Ad execution command: `node scripts\execute\run_actions.js data\snapshots\action_schema_2026-05-18_fathers_day_xih_christian_test_pending_codex.json --execute --snapshot data\snapshots\runs\today_ops_2026-05-18T01-41-18-939Z\snapshot_2026-05-18.json`
- XIH2677 ad status: `api_success`, campaignId `117391893812215`, adGroupId `31329477598923`, campaign `kw_fathers_day_christian_gifts_xih2677`, daily budget 1, default bid 0.20.
- XIH2559 ad status: `api_success`, campaignId `102030129274368`, adGroupId `185057113133081`, campaign `kw_fathers_day_christian_gifts_xih2559`, daily budget 1, default bid 0.18.
- XIH2672 and XIH2562 remained review/hold items; no Father's Day ad was created for them.
- XIH2559 title schema: `data/snapshots/listing_copy_edit_xih2559_fathers_day_2026-05-18.json`
- XIH2559 title dry-run: `valid=1`, `invalid=0`, `warnings=0`.
- XIH2559 title execution: `submitted_pending_review`, applicationId `4451522`.
- Submitted XIH2559 title: `Father's Day Gifts for Dad, Resurhang Christ Bow Spiral Notebook & Pen Set, Bible Verse Lined Journal 5.5 x 8.3 in, Pink Bow Pattern, Scripture Christian Journal Gift, Bible Study`

## Operator Override Execution

- Operator said: "照他说的 做！"
- Override schema: `data/snapshots/action_schema_2026-05-18_fathers_day_xih_operator_override_2672_2562.json`
- XIH2672 ad status: `api_success`, campaignId `3337504258149`, adGroupId `267435839055075`, campaign `kw_fathers_day_christian_gifts_xih2672`, daily budget 1, default bid 0.18.
- XIH2562 ad status: `api_success`, campaignId `38024147542327`, adGroupId `20216684831397`, campaign `kw_fathers_day_christian_gifts_xih2562`, daily budget 1, default bid 0.18.
- After override, all four forwarded SKUs have Father's Day keyword tests created. XIH2559 title application remains `submitted_pending_review`.

## Policy Repair Attempt

- Account-management screenshot warned that `Fathers Day Gifts` and `Gifts for Dad` are prohibited Amazon title phrases.
- Safer repair title prepared: `Fathers Day Christian Journal Set for Men, Resurhang Christ Bow Spiral Notebook and Pen Set, Bible Verse Lined Notebook 5.5 x 8.3 in, Pink Bow Scripture Study Supplies`
- Repair schema: `data/snapshots/listing_copy_edit_xih2559_dad_christian_journal_policy_repair_2026-05-18.json`
- Repair dry-run: `valid=1`, `invalid=0`, `warnings=0`.
- Repair execution failed because the SKU already has an A-class edit application in process. Backend message: current SKU A-class modification data is already in workflow; check through the modification application table by SKU.
- Operational status: application `4451522` must be rejected/cancelled/edited in the modification application table before the safer title can be resubmitted.
- Correction note: keep `Fathers Day` as the node term; avoid only the prohibited phrase combinations `Fathers Day Gifts` and `Gifts for Dad`.

## Final Intent Change

- Developer changed the request: the goal is only to catch some Father's Day traffic with low spend; title can be left unchanged.
- Operator said the title application was already withdrawn.
- Sellerinventory origin data was rechecked after the withdrawal. XIH2559 current `parent_title` remains the original Christian journal wording:
  `Resurhang Christ Bow Spiral Notebook & Pen Set, Bible Verse Lined Journal 5.5 x 8.3 in, Pink Bow Pattern, Scripture Christian Journal Gift for Women, Bible Study`
- Final operating state: keep the four low-budget Father's Day SP tests already created; do not submit any further title edit unless a new explicit title request appears.

## Final Lessons For Future Requests

- Latest forwarded message wins. In this thread the request changed from title front-loading plus ads to low-spend traffic only; the final state must follow the latest message.
- Low-spend seasonal traffic tests are ad actions unless the latest request still explicitly asks for a listing/title edit.
- `Fathers Day` as a node term is not the same as prohibited phrase combinations. Avoid combinations flagged by account management, such as `Fathers Day Gifts` and `Gifts for Dad`, without inventing unnatural title wording.
- Sellerinventory title submissions are only `submitted_pending_review`; if the request changes after submission, verify origin data and the modification application workflow before claiming the front-end title changed.
- Human-ready replies should report the actual final status: title unchanged, low-budget ad tests created, next check is exposure/click/order quality.

## Final Operator Reply

明白，那这边就不动标题了，标题先保持原样。父亲节这块只当作蹭一点节点流量来测，我已经按低预算开了相关词测试，不会放大预算。后面看 1-3 天有没有曝光和有效点击，有反应再留，没有反应就及时收掉。

## Operator Reply Draft

我看了下，这几款本质上还是 Christian/Bible study 笔记本礼品，父亲节可以作为一个补充场景测，但不是特别强的父亲节主款，所以不能直接按泛父亲节礼品去放量。

今天先按小测试处理：XIH2677 和 XIH2559 可以开低预算父亲节相关词测试，只放 Christian gifts for dad / faith based gifts for dad 这类更贴的词，不加大原有预算；XIH2672 当前动销可以，但库存天数偏紧，先不额外加父亲节流量，避免推起来后断货；XIH2562 近 30 天广告有点击没订单，先看页面/词承接，不建议马上再加一层父亲节广告。

XIH2559 标题我先不建议直接把 Father’s Day 放到最前面。它现在标题和页面主要还是 Christian journal / gift for women，父亲节先用广告词测流量，如果这组词有点击和订单，再把标题补到 dad/faith gift 方向会更稳。

我这边会按小预算测试节奏看 1 天是否起曝光、3 天点击质量、7 天有没有订单；如果父亲节词有反应，再继续加，不行就及时收掉。
