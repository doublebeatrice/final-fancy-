# 广告运营工作台

这是一个亚马逊广告 + 库存的日常运营工具集。流程分两层：**数据/执行**留给代码和浏览器扩展做（稳定、可重放），**策略决定**留给 AI 会话做（Codex CLI 或 Claude Code CLI，两者对等）。扩展面板和脚本里没有 AI，也不调任何模型 API。

## 为什么这样分

广告运营天天面对上千个 SKU，人工逐个判断不现实；但完全让规则自动化又会做出错得离谱的决定（降 bid 把新品掐死、误把铅笔识别成礼品篮投错词）。我们的做法：

- 抓数据、导快照、校验 schema、调接口、写备注 → 代码做
- 看快照、理解业务、决定怎么调 → 由一个 AI 会话（Codex 或 Claude）负责，产出一份 action schema JSON
- action schema 经过 dry-run 校验 → 代码执行 → 回查落地 → 写入 `adjustment_log` + `daily_learning` + 库存备注

简单说：AI 是坐在操作员电脑前的"大脑"，代码是它的"手脚"。

## 目录速查

```
extension/                 浏览器扩展（面板、抓数据的桥）
scripts/execute/           数据导出、执行接口、快速抓单 SKU 的脚本
scripts/generators/        候选 schema 生成器（输出都是 candidate，必须 AI 重写才可执行）
scripts/diagnostics/       诊断类只读脚本（watch、scope scan、cross-AI review）
scripts/analytics/         历史效果归因
src/ai_decision.js         action schema 校验器（代码核心 gate）
src/adjustment_log.js      每次调整落地记录
src/daily_learning.js      每日学习汇总
docs/                      架构边界、运营 playbook、规则文件
memory.md                  长期运营记忆（比 docs 更细的决策口径）
```

## 每日闭环（一次完整运行）

### 0. 准备
- Chrome 跑在 debug 模式（端口 9222），由 `scripts/execute/open_debug_browser_fixed_profile.ps1` 启动，并自动运行 `scripts/execute/ensure_backend_login.js`
- 两个后台都要登录：`https://adv.yswg.com.cn/`、`https://sellerinventory.yswg.com.cn/`；如果企业微信桌面端已登录，脚本会自动点击“继续在浏览器中登录访问”
- 打开扩展面板 `chrome-extension://.../panel.html`

> 隔夜后 session 会过期；adv 后台的 KeywordManage 页带了 filter 参数会让快照只抓到子集。两个坑都记在 `memory.md`。

### 1. 导出快照
```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```
产出 1200+ 产品卡，8000+ 关键词，2400+ 自动广告目标等。

### 2. 给 SKU 附加产品画像（profile）
```powershell
npm run profiles -- data\snapshots\latest_snapshot.json data\snapshots\latest_snapshot_profiled.json
```

### 3. 跑日常诊断
```powershell
node scripts\diagnostics\watch_daily_sku_group.js data\snapshots\latest_snapshot.json
node scripts\generate_season_gap_audit.js data\snapshots\latest_snapshot.json <YYYY-MM-DD>
node scripts\execute\generate_personal_trend_report.js data\snapshots\latest_snapshot.json
node scripts\execute\fetch_unsellable_seller.js HJ17,HJ171,HJ172
```

### 4. AI 全量扫描、写 schema
AI 会话读快照 + 看 memory + 跑 `claude_scope_scan.js` / `cross-AI review` 等诊断，把**每一个符合 eligible 条件的 SKU** 分到三类：
- **action** — 可执行的 bid 微调 / 暂停 / 启用
- **review** — 明确原因等待人工或下轮数据（紧库存、负利润、marginal、季节缺口、数据不全）
- **no-action** — 稳态，明确理由不动

产出 `data/snapshots/action_schema_<YYYY-MM-DD>_<codex|claude>.json`。每条 action 必须带 `approvedBy`（codex/claude/manual）、`decisionStage=ai_approved`、`hypothesis`、`expectedEffect`、`reviewPlan`。

### 5. dry-run + 执行
```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema_<date>_<actor>.json --snapshot data\snapshots\latest_snapshot.json

Remove-Item Env:\DRY_RUN
node scripts\execute\run_actions.js data\snapshots\action_schema_<date>_<actor>.json --snapshot data\snapshots\latest_snapshot.json
```
dry-run 通不过的就地拦截。执行后自动回查落地 + 写库存备注（开头带 `[由 Claude 决策]` / `[由 Codex 决策]` / `[人工决策]` 前缀）。

### 6. 每日学习
```powershell
# run_today_ops 会自动调用，也可手动
node -e "require('./src/daily_learning').persistDailyLearning({...})"
```
产出 `data/learning/daily_learning_<date>.{json,md}`，含按决策方（codex/claude/manual）分组的 `decisionAttribution`。**第二天 AI 决策前必须读前一天的 learning 文件**。

### 7. 跨 AI review（任何一方都能看对方做了什么）
```powershell
node scripts\diagnostics\review_recent_decisions.js --by claude --days 3
node scripts\diagnostics\review_recent_decisions.js --by codex --days 7
```

## 决策归因（谁做的这个决定）

每条 action 都带 `approvedBy`，从 schema 一路传到：
- `data/adjustments/adjustments_<date>.json`（每次调整一行）
- `data/learning/daily_learning_<date>.json`（当日汇总）
- 库存备注（运营在 sellerinventory 能直接看到是谁做的）

所以"Codex 昨天为什么 pause 了 DN1655"、"Claude 这周平均 ACOS 比 Codex 更好"这种问题，有数据可答。

## 三条红线

1. **扩展面板里不能有 AI runtime**（不调 Anthropic / OpenAI API）。AI 决策在操作员的 CLI 会话里跑，不在仓库代码里跑。
2. **规则生成器的输出都是 candidate**，`actionSource: ["generator_candidate"]`，被校验器强制进 review。想执行，必须 AI 重写为 `approvedBy: codex/claude/manual`。
3. **Codex 无法安全决策时必须 emit `review`**，不允许静默回退到老规则。

## 保留为 review 的高风险动作

这些 AI 能**建议**但不能**自动执行**，除非操作员显式放行：
- 创建新广告（SP/SB/B2B）
- 结构修复 / 重建 campaign
- 大幅度 bid 变动
- 高销量/高风险 SKU 的强力操作
- Listing 文案编辑（`copy_edit`，已经能通过 sellerinventory 后台提交编辑申请，但执行前强制 dry-run + 显式 approval）
- 价格变动
- 海运补货决策

## 运营范围（哪些 SKU 可以操作）

每日广告决策只从"可操作池"出发：
- 销售状态 = `正常销售` 或 `保留页面`
- 已开售 / 已 launched
- 站点 = US 或 UK
- 池外 SKU 不允许主动创建/加投/暂停/清理，除非操作员指名

## 必读文档

- `memory.md` — 长期运营记忆（KPI 口径、"同"字段、watchlist、历次事故教训）。决策前先读。
- `docs/AI_DECISION_BOUNDARY.md` — 架构边界（panel/orchestration/script 三层分工）
- `docs/AI_DECISION_ENTRY_POINTS.md` — Codex vs Claude 调用方式
- `docs/CODEX_HANDOFF_RUNBOOK.md` — 运营交接手册
- `docs/Q2_AD_OPS_PLAYBOOK.md` — Q2 决策上下文
- `docs/STAGNANT_INVENTORY_RULES.md` — 滞销库存决策规则（清 / 留 / 减仓 / 继续推广告）
- `data/learning/operations_retrospective_2026-05-06_to_2026-05-14.md` — 5/14 运营复盘和后续每日闭环硬规则

## 几个最容易翻车的点

- **广告差 ≠ 产品烂**：判产品质量必须看 listing CR、评分、退货、历史峰值、自然单，**不能**从广告 30d 订单少推断
- **新品保护**：上架 ≤ 6 个月 + 销量加速 + sessions 刚来 + CR 健康 → 不准降 bid，应保护流量
- **productProfile 可能误识别**：铅笔被识别为 gift basket、母亲节被识别为护士周，会污染 keyword seeds。先验证 profile 和 listing.title/breadcrumbs 一致再用
- **不看全量 = 放弃决策**：每日闭环必须把 1200+ SKU 全部归到 action / review / no-action，单日只做 3 条 = 甩锅
- **不能分轮等人推**：每日运营不能按"第一轮/第二轮/第三轮"汇报后停住。一次完整闭环必须直接跑完数据健康、总盘诊断、超预算/退货/高 ACOS 风险池、老品修复、机会恢复、执行、落地验证和学习记录。
- **动作多 ≠ 运营好**：如果销售额、销量、净利、退货率、ACOS 变差，就要如实判定经营结果差，并用下一轮闭环纠偏；不能因为落地动作多就报喜。
- **超预算每天必须处理**：超预算不是附加项，必须分成 hard stop / budget shift / watch-only。低效超预算先控费，利润/库存/转化都支持时才加预算。
- **退货是硬门槛**：高退货低利润 SKU 不能继续加流量，除非有证据说明退货问题已经隔离、历史化或正在改善。
- **机会恢复要有证据**：bid up / budget up 必须有近期可接受转化、历史承接能力、健康库存和季节节点支持。上次动作后花费涨但订单没跟上，就不能继续推。
- **同 SKU 要 cooldown**：重复推动同 SKU/实体前必须看近期调整历史；只有新证据、落地失败、异常低投放或明确库存/季节保护时才允许再动。

## 常用命令速查

```powershell
# 启动 debug Chrome 并自动检查/修复后台登录态
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser_fixed_profile.ps1

# 单 SKU 快诊（不用导全量快照）
node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>
node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>
node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]
node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days>
node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days>

# 测试套件
npm test

# 语法校验（单文件）
node --check auto_adjust.js
```
