# GOAL-02：把"第一条真闭环"扩成"全链真闭环 + 老板一张纸"

> 发给 Codex 的完整目标。可跑数小时。按阶段推进，每阶段独立可验，最后有总验收。
> 前置：GOAL-01 已通过（effect_review 已是真复查：带 baselineAsOf/currentAsOf、同窗/stale 降级、判决写回 ledger、生成 sku_lessons）。
> 北极星不变：**利润和销量往上走；老板说一句"今天"→看一张结果纸→点几个红灯→收工。**

---

## 总目标（唯一的"达成"标准）

端到端跑通一次完整业务日，产出一张**老板能在 5 分钟内看完的结果纸**，且纸上每个数字背后都是**真闭环**：
**每条动作带利润目标 → 到期真复查（真时间差）→ 判生死 → 真写回台账 → 沉淀成 lesson → 下一轮决策真读取 lesson。**
并且把当前空转的假闭环件停掉、把外部任务这条线接通。

**达成 = 下面 7 个阶段全部验收通过 + 总验收里那张结果纸能由一条命令生成、内容真实可追溯。**

---

## 贯穿全程的红线（违反任一即整个 goal 失败）

1. 不许新增模块/链路。只在现有件（ai_decision.js / effect_review / 台账 / learning_memory / inbox / run_today_ops）上接。
2. 不许把"我设计了/我打算/我准备"当交付。只认 **diff + dry-run 前后数字 + 真实文件**。
3. 不许为让数字好看用静态/同窗/陈旧数据冒充。看不到真实时间差或真实测量，老实报 needs_data / 标 stale。
4. 能力边界诚实：看不了图、拉不到数据，就降级进人工小队列或报缺数据，不许标"已检查"造假。
5. 成功定义：`closed_loop=true` 不算成功。动作带目标、到期真卖出去/真达标、判决真闭合，才算。数据跌了在交付里如实认输。
6. 每个阶段做不完，如实标"未完成 + 卡在哪"，不许假装做完跳过。

---

## 阶段 1：生成端强制带利润目标（让闭环覆盖每一条动作）

**问题**：现在只有复查端能判 goal，生成端不强制。大量动作没有 goal，复查无从验。

**做什么**
- schema 里每条**可执行** action 必须带 `goal{ metric, from, to, deadlineDays, hardFloor }` + `killSwitch`。metric 至少支持 orders/sales/netProfit。
- `src/ai_decision.js` 的 gate 加一道：非候选、缺 goal 或 goal 不可证伪（from==to、无 deadline）的动作 → 强制降级 review。
- 候选生成器（proactive / kpi_recovery / season_title）产出的动作要带默认 goal 模板，缺的不许进可执行。

**验收**
- dry-run：改前可执行动作多少条、其中缺 goal 多少；改后缺 goal 的被降级多少 → 可执行动作 100% 带 goal。
- 给 1 条示例动作的完整 goal 字段。

**killSwitch（判失败）**：改后仍有可执行动作没有 goal。

---

## 阶段 2：任务台账真流转（复查判决要有地方落）

**问题**：`buildAgentLedger` 每天从 actions 全量重建，6 份台账 0 个 closed/executed，history 全空，同一复查每天被关一遍（西西弗斯）。

**做什么**
- close/executed/blocked 状态必须**持久化、跨天保留**，不许每天重拍照覆盖。
- 已 closed 的任务次日不再进 review queue（GOAL-01 已对 effect_review 单点做过，这里要扩到整个台账）。
- 任务 history 记录每次状态流转（时间、from→to、原因）。

**验收**
- 连跑两个业务日（可用历史数据模拟）：第 1 天 close N 个，第 2 天这 N 个不再出现在待办；台账里 closed 数 > 0、history 非空。
- 给出两天的 byStatus 对比。

**killSwitch**：跑完台账仍 0 个 closed，或昨天 closed 的今天又冒出来。

---

## 阶段 3：记忆新陈代谢 + 教训真进代码门禁（治"迟早失忆"+"每次都要教"）

**问题**：corrections 70 个只增不减、全 active、堆出 277 个 blocker 把无人值守卡死；且一条都没进 ai_decision.js 的 gate（唯一进代码的是手抄 3 条）。

**做什么**
- correction 支持 `resolved/superseded` 状态：被代码门禁吸收、或过 nextValidation.dueDate 未复发的，降权/归档，不再无限展开成 blocker。
- learning_memory 合成时去重 + 合并同类 + 按近度衰减，不许全量拼接。
- **关键**：挑出能机器化的 correction（如"高退货禁加投""同 SKU cooldown"这类有明确触发条件的），真正落成 `ai_decision.js` 里的命名 gate 函数（返回 `{ok, reason, evidence}`），并在 reason 里标 `rule:correction:<lessonId>`，下游 daily_learning 能反查触发量。至少落地 3 条。

**验收**
- 改前 blocker 数、改后 blocker 数（应明显下降）。
- 至少 3 条 correction 变成 gate 函数：给函数名 + 对应 lessonId + 一条被它拦下的 dry-run 动作。
- learning_memory 去重前后 constraint 条数对比。

**killSwitch**：跑完没有任何 correction 真变成 gate 函数（还是只在 markdown 里）；或 blocker 数没降。

---

## 阶段 4：外部任务接通（补上老板工作的一半黑洞）

**问题**：`ops:agent:inbox` 骨架好但从没接进主流程，靠 24 个手写 md；外部任务进不了 effect_review 闭环。

**做什么**
- 让 `run_today_ops` 或一个固定入口真的调用 inbox，把开发诉求文本转成台账任务（自动分类、抓 SKU、定优先级）。
- 外部任务要能进 effect_review 闭环（修 lane 不匹配的问题）——开发问的"能不能推/咋没流量"本质是"卖没卖出去"，必须被追踪、到期复查。

**验收**
- 喂一条真实诉求文本（如"LUO1006 点击没了能加投吗"），证明它生成了台账任务、带 SKU/优先级/复查点，且能进 effect_review 队列。
- developer_requests 那 24 个手写 md 至少能被一条命令批量导入成结构化任务（不要求全自动，但要从"纯手写"变"可导入"）。

**killSwitch**：外部任务仍进不了 effect_review；或 inbox 仍只能孤立手敲、没接进任何主流程。

---

## 阶段 5：砍空转件（降噪，停掉假绿灯）

**问题**：无人值守 supervisor/scheduler/goal_audit/completion_audit、ai_decision_brief、operating_hub_feedback 落盘等在空转，产假绿灯。

**做什么**（不删代码，标 dormant + 停止主流程引用 + 停止当"完成证明"）
- 无人值守 supervisor/scheduler/goal_audit/completion_audit 这套：在它没有一条真能执行的动作前，停止把它当每日必跑和完成证明。保留代码，加显式 `dormant` 标记和原因。
- ai_decision_brief、operating_hub_feedback 落盘、ad_structure_opportunities 明细、review_evidence 落盘：停止生成或停止当依据，等有真消费者再恢复。

**验收**
- 列出停掉/标 dormant 的件清单 + 每个的原因。
- 证明主流程不再引用它们（grep 证据）、且日跑批不再因它们产出假绿灯。

**killSwitch**：空转件仍在主流程里产"看似通过"的状态。

---

## 阶段 6：闭环端到端贯通（把 1-4 串成一整圈）

**做什么**：用历史数据模拟一个动作走完完整生命周期：
```
带 goal 的动作生成 → 执行登记台账 → 1d/3d/7d 到期真复查（真时间差）
→ 判 goal_met/partial/missed → 真写回台账 close 或生成换向任务
→ 沉淀 sku_lesson(condition+apply) → 下一轮同类 SKU 决策时真读取这条 lesson 注入
```

**验收**：给出这一整圈的可追溯证据——同一个 taskId/SKU，从生成到 close 到 lesson 到被下一轮读取，每一步的文件和字段。**这是证明"环真闭上"的核心。**

**killSwitch**：找不到任何一个动作能展示完整一圈；或 lesson 生成了但下一轮决策不读它。

---

## 阶段 7：老板的结果纸（总成，唯一面向人的产物）

**做什么**：一条命令（最终接到"今天"入口）生成 `data/agent/每日结果纸_<date>.md`，固定三块：

1. **净利 / 销量**：今天 vs 昨天涨跌多少、谁拖累的（带趋势，不是只报当前值）。
2. **三条线发生了什么**：
   - 开发诉求 N 件（做了/判断/结果）
   - 系统 P0 N 条（处理了哪些、净利影响 ±X）
   - 节日巡查（身份对没对/落地没/跟进没/到期卖没卖出去）
3. **要老板点头的**：≤5 个红灯，绿灯只汇总不展开。

**验收**：用真实 5/30 或 5/31 数据生成一张真纸，内容可追溯到台账/复查/lesson，且≤5 分钟可读完。

**killSwitch**：纸上数字无法追溯到真实闭环数据；或要老板逐个 review SKU 才能看懂。

---

## 总验收（达成 = 全过）

| # | 验收点 | 通过标准 |
|---|---|---|
| 1 | 每条可执行动作带 goal | 缺 goal 的 0 条 |
| 2 | 台账真流转 | closed>0、跨天不重复、history 非空 |
| 3 | 记忆代谢 + 教训进代码 | ≥3 条 correction 变 gate 函数、blocker 数下降 |
| 4 | 外部任务接通 | 诉求能进台账+effect_review |
| 5 | 砍空转件 | dormant 清单 + 主流程不再产假绿灯 |
| 6 | 端到端一整圈 | 一个动作可追溯走完 生成→复查→close→lesson→下轮读取 |
| 7 | 结果纸 | 一条命令生成、真实可追溯、5 分钟读完 |

## 交付物（只认这个，不认汇报）

- 每阶段：改动文件 diff + dry-run 前后数字表 + 真实产物文件路径。
- 总：一张真实结果纸 + 阶段 6 那一整圈的可追溯证据链。
- 一句话结论：现在老板说"今天"能不能看一张纸收工，证据是什么。
- 做不完的阶段如实标"未完成 + 卡在哪 + 下一步"，不许假装跳过。

— Claude
