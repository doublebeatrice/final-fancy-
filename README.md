# 广告运营工作台

当前版本：v1.2.2（2026-05-22）

这是一个亚马逊广告 + 库存的日常运营工具集。流程分两层：**数据/执行**留给代码和浏览器扩展做（稳定、可重放），**策略决定**留给 AI 会话做（Codex CLI 或 Claude Code CLI，两者对等）。扩展面板和脚本里没有 AI，也不调任何模型 API。

## 为什么这样分

广告运营天天面对上千个 SKU，人工逐个判断不现实；但完全让规则自动化又会做出错得离谱的决定（降 bid 把新品掐死、误把铅笔识别成礼品篮投错词）。我们的做法：

- 抓数据、导快照、校验 schema、调接口、写备注 → 代码做
- 看快照、理解业务、决定怎么调 → 由一个 AI 会话（Codex 或 Claude）负责，产出一份 action schema JSON
- action schema 经过 dry-run 校验 → 代码执行 → 回查落地 → 写入 `adjustment_log` + `daily_learning` + 库存备注

简单说：AI 是坐在操作员电脑前的"大脑"，代码是它的"手脚"。

## 目录速查

```
AGENT.md                   给 AI 的项目规则和红线
README.md                  人和 AI 共用的入口说明
CHANGELOG.md               重要能力变更记录
auto_adjust.js             主执行编排入口；仍留根目录，避免破坏运行链路
extension/                 浏览器扩展（面板、抓数据的桥）
scripts/execute/           数据导出、执行接口、快速抓单 SKU 的脚本
scripts/run_agent_control_plane.js  智能代理台账入口，汇总任务、授权、复查承诺
scripts/run_external_task_inbox.js  外部任务入口，把临时消息转成任务卡
scripts/run_agent_review_queue.js   到期复查队列，筛出今天必须回看的承诺
scripts/run_agent_review_evidence.js  复查证据采集器，按到期 SKU 拉广告最小接口证据
scripts/run_agent_effect_review.js  效果复查执行器，基于证据判断关闭、继续观察或回滚复核
scripts/run_agent_capability_registry.js  能力注册中心，把新接口登记成可复用能力
scripts/run_agent_operating_hub.js   自主运营中枢，把每日、外部、复查、能力任务合成今日队列
scripts/run_agent_command_runner.js  只读命令执行器，只跑中枢计划里的白名单证据命令
scripts/run_agent_write_execution.js  低风险写入编排器，先预演，显式授权后执行并回查
scripts/run_agent_execution_feedback.js  命令执行回填入口，把命令结果写回任务状态和历史
scripts/run_agent_handoff_summary.js  中文交接摘要，压缩今日队列、证据、复查和写入状态
scripts/run_agent_closed_loop.js  智能代理总编排入口，把中枢、证据、写入、回填、交接串成闭环
scripts/generators/        候选 schema 生成器（输出都是 candidate，必须 AI 重写才可执行）
scripts/diagnostics/       诊断类只读脚本（watch、scope scan、cross-AI review）
scripts/analytics/         历史效果归因
data/reference/            原始参考源文件，例如节气事件 Excel
data/tmp_tests/            临时探针和故障现场文件；不是长期事实源
src/agent_control_plane.js 智能代理底座：任务状态、授权边界、效果复查
src/ai_decision.js         action schema 校验器（代码核心 gate）
src/adjustment_log.js      每次调整落地记录
src/daily_learning.js      每日学习汇总
docs/                      架构边界、运营 playbook、规则文件
memory.md                  长期运营记忆（比 docs 更细的决策口径）
```

完整根目录地图见 `docs/ROOT_FILE_MAP.md`。根目录只放入口、规则、依赖清单和长期状态文件；业务数据、临时探针、源表、报告都应进入 `data/`、`docs/`、`scripts/` 或 `archive/`。

## Seasonal Listing Copy

Seasonal title edits are no longer blanket review-only. Use `docs/SEASONAL_LISTING_COPY_RULES.md` for the current boundary: low-sales SKUs can be submitted after dry-run when product-event evidence is strong; top-50 SKUs, non-seasonal copy edits, low-evidence edits, and year-specific themes without current external verification remain review/manual. Sellerinventory success means `submitted_pending_review`, not Amazon-front-end landed.
Products with sales status `保留页面` are listing-copy protected. Preserve the current product page and do not submit title/bullet/description/search-term edits for them; manual SKU protection files are only an extra override.

## Price Execution

Price changes are no longer blanket review-only, but the executable path is narrow: Ful+Res shortage pricing for normal-sale SKUs with 7d Ful+Res sellable days below 30. The approved schema must normalize every target to a `.99` ending, pass dry-run, submit through sellerinventory, verify the backend application marker, and write adjustment logs. When `fulResUnits <= 7` or `sellableDays7d <= 7`, pause enabled SKU ad delivery first at the productAd/SB row level where available. Sellerinventory success is not Amazon-front-end propagation; keep the 1/3/7-day follow-up.

## Selection Keyword Research

Use keyword research before opening new traffic for a SKU, product direction, developer request, or keyword expansion. It searches Amazon front-end results, builds competitor/scene/traffic-bridge evidence, and returns candidate keywords plus ABA and conversion validation commands. Category is not a hard boundary; buyer intent and product carry fit are the boundary.

```powershell
npm run ops:selection:keyword-research -- --sku GUF3129 --terms "patriotic bucket hat, 4th of july bucket hat"
```

The report writes to `data/snapshots/selection_keyword_research_<YYYY-MM-DD>.json` by default. It is read-only evidence and cannot directly create keywords, raise bids, raise budgets, or change listing/price/inventory. See `docs/SELECTION_KEYWORD_RESEARCH.md`.

## Selection Keyword Conversion Rate

Use the selection-system keyword conversion source before creating or expanding keyword traffic. It is read-only market evidence and must be cross-checked before spend changes.

```powershell
npm run ops:selection:keyword-conversion -- --keywords "american flag bucket hat, 4th of july decorations, nurse gifts for women"
```

The report writes to `data/snapshots/selection_keyword_conversion_rate_<YYYY-MM-DD>.json` by default and includes missing keywords, data freshness, keyword quality, cost risk, multi-strategy CPC/CPA/ACOS, and cross-validation requirements. See `docs/SELECTION_KEYWORD_CONVERSION_RATE.md`.

## Selection ABA Search Terms

Use the selection-system ABA search-term source to check market demand rank, search volume, top-ASIN concentration, category fit, monopoly, supply-demand pressure, and price/review context. It is read-only evidence and never an executable ad decision by itself.

```powershell
npm run ops:selection:aba-search-terms -- --search-terms "cowboy hat, nurse gifts, 4th of july decorations"
```

The script splits comma-separated terms into separate ABA requests and merges them into one report. The report writes to `data/snapshots/selection_aba_search_terms_<YYYY-MM-DD>.json` by default and includes missing exact terms, data freshness, demand tier, competition tier, recommended use, top ASINs, and cross-validation requirements. See `docs/SELECTION_ABA_SEARCH_TERMS.md`.

Use the selection-system keyword seasonality source to check Google Trend, market overview, competitor ASIN pressure, buyer search-term expansion, and market-window risk before seasonal SKU, keyword, replenishment, or clearance judgement. It is read-only evidence and cannot directly trigger spend, price, listing, or inventory actions.

```powershell
npm run ops:selection:keyword-seasonality -- --search-terms "cowboy hat, hat organizer"
```

The report writes to `data/snapshots/selection_keyword_seasonality_<YYYY-MM-DD>.json` by default. See `docs/SELECTION_KEYWORD_SEASONALITY.md`.

## Selection Product Time Machine

Use the selection-system Product Time Machine to map a keyword to winning ASINs, bought-in-past-month, monthly bought history, organic rank history, natural/SP/SB/SBV/AC traffic word counts, organic flow share, AO value, and keyword history trend. In the network panel, `timemachine/pageQuery` is the useful main table; the nearby `sif/forward` request is the auxiliary SIF keyword history curve.

```powershell
npm run ops:selection:product-time-machine -- --search-keywords "cowboy hat, nurse gifts"
```

The report writes to `data/snapshots/selection_product_time_machine_<YYYY-MM-DD>.json` by default. It is read-only evidence and cannot directly create keywords, raise bids, raise budgets, or change listing/price/inventory. See `docs/SELECTION_PRODUCT_TIME_MACHINE.md`.

## Product Market Evidence Stack

For any keyword, SKU, ASIN, product direction, developer request, traffic recovery, keyword creation, or "can this product be pushed" question, build a product market profile instead of judging only from ad rows or inventory rows.

Use `docs/PRODUCT_MARKET_EVIDENCE_STACK.md` as the default read path: ABA demand/concentration, keyword conversion economics, SKU ad proof, listing/price fit, inventory/economics, and recent action history. Selection-system evidence is still read-only; executable ad actions require the normal schema, dry-run, execution, and landing verification flow.

## SKU Lesson System

Daily SKU review is an operating-route review, not a flat metric checklist. For every eligible SKU, preserve product identity, lifecycle/node stage, stage target, target result, route, evidence, action boundary, and follow-up. Reusable lessons belong in `data/learning/sku_lessons/` and follow `docs/SKU_LESSON_SYSTEM.md`.

Lessons must include scope and transfer limits. A single SKU or variant result is not a parent-group rule unless fresh variant-level evidence supports the transfer. Conflicting lessons should be marked and reconciled instead of silently overwritten.

## 智能代理底座

项目开始补齐“能负责一件事到闭环”的底座。`src/agent_control_plane.js` 统一处理三件事：任务台账、授权边界、效果复查。

- 任务台账：把每日巡检、外部诉求、新能力接入、执行后复查统一成任务卡，状态包含新建、处理中、已执行、待复查、已阻塞、已关闭。
- 授权边界：只读动作直接拉证据；低风险且已授权的广告动作走预演、执行、落地回查；高影响 listing、价格、新广告结构等动作必须有明确授权边界；候选生成器输出不能直接执行。
- 效果复查：动作里如果带复查计划，会自动生成 1 日、3 日、7 日等复查任务，保留原动作、指标、执行前基线和回滚条件；有 `currentMetrics`、`adBaseline` 等执行时指标时，会自动带入复查基线。

```powershell
npm run ops:agent -- --tasks data\tasks\daily_tasks_<date>.json --actions data\snapshots\action_schema_<date>_codex.json --out data\agent\agent_ledger_<date>.json
```

`npm run ops:today` 也会自动输出 `data/agent/agent_ledger_<businessDate>.json`，把当天任务、动作授权和后续复查承诺登记到同一份台账里。详细说明见 `docs/AGENT_CONTROL_PLANE.md`。

外部临时任务进入同一套台账前，先用外部任务入口标准化：

```powershell
npm run ops:agent:inbox -- --text "开发问 HAY0218 为什么没流量，能不能推"
```

每天要回看的承诺用复查队列筛出：

```powershell
npm run ops:agent:reviews -- --ledger data\agent\agent_ledger_<date>.json --today <date>
```

复查证据准备好后，用效果复查执行器给出关闭、继续观察或回滚复核判断：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_<date>.json --evidence data\agent\review_evidence_<date>.json --today <date>
```

如果要让复查器先自动拉广告 SKU 摘要证据，再判断：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_<date>.json --collect-evidence --today <date>
```

有库存、利润或选品报告时一并传入，复查器会把广告、库存、利润、选品放到同一份证据里。订单改善但库存偏紧、利润不支持、市场转化弱或竞争过高时，不会直接建议关闭：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_<date>.json --collect-evidence --inventory-report data\snapshots\inventory_review_<date>.json --profit-report data\snapshots\profit_review_<date>.json --keyword-conversion-report data\snapshots\selection_keyword_conversion_rate_<date>.json --aba-report data\snapshots\selection_aba_search_terms_<date>.json --seasonality-report data\snapshots\selection_keyword_seasonality_<date>.json --today <date>
```

也可以单独采集证据：

```powershell
npm run ops:agent:review-evidence -- --queue data\agent\review_queue_<date>.json --today <date>
```

新发现的接口先进入能力注册中心，登记只读/可写、风险、字段契约和回查方式：

```powershell
npm run ops:agent:capabilities -- --file data\agent\capabilities_<date>.json --out data\agent\capability_registry_<date>.json
```

这个命令默认会合并内置能力目录，包含广告复查证据、选品关键词转化、选品 ABA、选品关键词季节性、sellerinventory 读取/提交、复查证据采集和效果复查判断；只检查临时能力文件时加 `--no-defaults`。

最后用自主运营中枢合成今天的工作队列：

```powershell
npm run ops:agent:hub -- --ledger data\agent\agent_ledger_<date>.json --inbox data\agent\external_inbox_<date>.json --reviews data\agent\review_queue_<date>.json --capabilities data\agent\capability_registry_<date>.json --today <date>
```

中枢输出的每条任务会带 `requiredCapabilities` 和 `executionPlan.commands`。它会把“该跑哪条只读证据命令”列出来，比如到期复查、选品关键词转化、ABA 搜索词、关键词季节性证据；但不会绕过 schema、预演、授权边界或写后回查。

只读证据命令可以交给受限执行器跑，它只接受中枢标记为 `safeToAutoRun=true` 且命令风险为 `read_only` 的白名单命令：

```powershell
npm run ops:agent:run-commands -- --hub data\agent\operating_hub_<date>.json --out data\agent\command_results_<date>.json
```

如果命令退出成功但没有生成声明的输出文件，会按失败处理，避免任务被误标为已执行。

低风险写入动作走单独的受限编排器。默认只做预演；只有显式加 `--execute`，且台账里的写入动作都属于低风险已授权，才进入真实写入、落地回查和日志阶段：

```powershell
npm run ops:agent:write-actions -- --ledger data\agent\agent_ledger_<date>.json --actions data\snapshots\action_schema_<date>_codex.json --snapshot data\snapshots\latest_snapshot.json --out data\agent\write_execution_<date>.json
```

确认执行时：

```powershell
npm run ops:agent:write-actions -- --ledger data\agent\agent_ledger_<date>.json --actions data\snapshots\action_schema_<date>_codex.json --snapshot data\snapshots\latest_snapshot.json --execute --out data\agent\write_execution_<date>.json
```

命令跑完后，把命令结果回填到任务状态和历史：

```powershell
npm run ops:agent:feedback -- --hub data\agent\operating_hub_<date>.json --results data\agent\command_results_<date>.json --out data\agent\operating_hub_feedback_<date>.json
```

结果文件支持 `{ "results": [...] }`，每条至少带 `taskId`、`ok`、`exitCode`，可附带 `command`、`summary`、`outputFiles`、`report.verdict`。成功的只读证据任务会标为已执行，失败会标为已阻塞，复查报告里的关闭/继续观察/回滚结论会写入任务历史。

最后生成早上可读的中文交接摘要：

```powershell
npm run ops:agent:handoff -- --hub data\agent\operating_hub_<date>.json --results data\agent\command_results_<date>.json --write-execution data\agent\write_execution_<date>.json --effect-review data\agent\effect_review_<date>.json --out data\agent\agent_handoff_<date>.md
```

也可以用总编排入口一次串完中枢、只读证据、低风险写入预演、结果回填和交接摘要：

```powershell
npm run ops:agent:closed-loop -- --ledger data\agent\agent_ledger_<date>.json --inbox data\agent\external_inbox_<date>.json --reviews data\agent\review_queue_<date>.json --capabilities data\agent\capability_registry_<date>.json --actions data\snapshots\action_schema_<date>_codex.json --snapshot data\snapshots\latest_snapshot.json --out-dir data\agent
```

闭环自测不会调用真实后台，可用于验证这条链路是否能从任务到交接摘要跑通：

```powershell
npm run ops:agent:closed-loop -- --self-test
```

## 每日闭环（一次完整运行）

### 0. 准备
- Chrome 跑在 debug 模式（端口 9222），由 `scripts/execute/open_debug_browser_fixed_profile.ps1` 启动，并自动运行 `scripts/execute/ensure_backend_login.js`
- 三个内部系统都要登录：`https://adv.yswg.com.cn/`、`https://sellerinventory.yswg.com.cn/`、`https://selection.yswg.com.cn/dashboard/analysis`；如果企业微信桌面端已登录，脚本会自动点击“继续在浏览器中登录访问”
- Readiness is not based on visible pages alone. Treat the browser session as usable only when `health.adv.ok=true`, `health.inventory.ok=true`, and `health.selection.ok=true`; never paste or store `X-Access-Token`, cookies, CSRF, JWT, or Inventory-Token values.
- 打开扩展面板 `chrome-extension://.../panel.html`

> 隔夜后 session 会过期；adv 后台的 KeywordManage 页带了 filter 参数会让快照只抓到子集。两个坑都记在 `memory.md`。

### 1. 导出快照
Recovery rule before exporting: do not stop after the first abnormal preflight. Run `npm run chrome:debug`, recover adv to `https://adv.yswg.com.cn/vue/KeywordManage?tabId=<timestamp>`, wait for the keyword table, recover sellerinventory to the `/pm/formal/list` frame, confirm selection is open at `https://selection.yswg.com.cn/dashboard/analysis`, and rerun preflight. Treat the run as blocked only after this recovery pass still fails.

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Daily orchestrator:

```powershell
npm run ops:today -- --mode full-snapshot --actor codex
npm run ops:today -- --execute --mode full-snapshot --actor codex
```

`--execute` controls whether writes land; it must not change snapshot scope. Full-snapshot listing fetch has no default 120-item cap. If `AD_OPS_LISTING_FETCH_LIMIT` is set, that is an intentional cap and the run quality should show listing coverage warnings when coverage is low.
During the daily orchestrator run, proactive audit recovery is part of the execution plan. `run_today_ops.js` writes `data/snapshots/action_schema_<date>_proactive_recovery_candidate.json`; when no explicit schema is passed, it merges that with KPI/overbudget recovery into `data/snapshots/action_schema_<date>_daily_recovery_combined.json` and uses the combined schema as the primary action file. If an explicit schema is passed while arrival gaps exist, the run should warn that arrival recovery is not closed by the selected schema.
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
node scripts\execute\fetch_seller_success_rate.js HJ17
npm run ops:selection:keyword-conversion -- --keywords "<term1, term2>"
npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"
npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"
```

### 4. AI 全量扫描、写 schema
AI 会话读快照 + 看 memory + 跑 `claude_scope_scan.js` / `cross-AI review` 等诊断，把**每一个符合 eligible 条件的 SKU** 分到三类：
- **action** — 可执行的 bid 微调 / 暂停 / 启用
- **review** — 明确原因等待人工或下轮数据（紧库存、负利润、marginal、季节缺口、数据不全）
- **no-action** — 稳态，明确理由不动

This classification must be an operating-route review, not a metric checklist. Preserve each SKU's product identity, lifecycle/node stage, stage target, target result, route, evidence, action boundary, and follow-up. Reusable lessons go to `data/learning/sku_lessons/` and must include scope plus transfer limits; conflicting lessons are marked and reconciled instead of silently overwritten.

产出 `data/snapshots/action_schema_<YYYY-MM-DD>_<codex|claude>.json`。每条 action 必须带 `approvedBy`（codex/claude/manual）、`decisionStage=ai_approved`、`hypothesis`、`expectedEffect`、`reviewPlan`。
到货广告/新品启动不能只停留在 `proactive_operating_audit` 报告里。每日 schema 必须把这些行落到 action、manual repair with reason、或 no-action with evidence；如果冷却期挡住自动加价，也要留下明确复查/人工修复项。

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
The learning record also carries `dataQuality`, `actionQuality`, `runQuality`, and `operatingClosure`. Do not treat a run as operationally closed when the script succeeded but ad rows, seller sales rows, listing coverage, executable actions, or final landing are missing.

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

## 错误定位速查

出现失败时，先按下面顺序查，不要只看终端最后一行：

| 位置 | 用途 |
|---|---|
| `data/snapshots/auto_run_<YYYY-MM-DD>.log` | 自动执行过程日志，能看到 dry-run、API 调用、回查阶段卡在哪里。 |
| `data/snapshots/execution_summary_<YYYY-MM-DD>.json` | 当日执行总数、成功/失败计数、coverage 结论。 |
| `data/snapshots/execution_verify_<YYYY-MM-DD>.json` | 落地核验明细，判断 API 成功后是否真的变成 enabled/paused/created。 |
| `data/adjustments/adjustments_<YYYY-MM-DD>.json` | 每条真实调整记录，含 SKU、动作类型、before/after、原因、sourceRunId。 |
| `data/learning/daily_learning_<YYYY-MM-DD>.md` | 当日结论、carry-forward、规则修正和未闭环项。 |
| `data/developer_requests/<date>_*.md` | 开发诉求的证据、处理动作、可转发回复和后续复查点。 |
| `data/tmp_tests/` | 临时探针和故障现场。长期结论应迁到 `data/learning/` 或 `docs/`。 |

如果这些文件彼此矛盾，以最新一次目标 run 的 `execution_summary`、`execution_verify` 和对应 `daily_learning` 为准；历史 adjustment log 只能说明发生过什么，不能单独证明最终闭环。

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
- Listing 文案编辑（`copy_edit`）：已实测可在已登录 sellerinventory 浏览器上下文提交编辑申请；当前仍应把结果记为“申请已提交到后台审核流程”，不是 Amazon 前台已生效。季节标题按 `docs/SEASONAL_LISTING_COPY_RULES.md` 可自动提交；非季节文案、高销量未放行、低证据或年度主题未核验的标题仍保留 dry-run + 显式 approval。
- 价格变动（除 Ful+Res 短缺提价路径：`.99`、dry-run、sellerinventory 回查、广告联动都通过）
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
- `docs/SKU_LESSON_SYSTEM.md` — SKU 经验教训、迁移边界和冲突处理规则
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

# 重新生成节气/季节事件 JSON
npm run ops:season-events:import

# 语法校验（单文件）
node --check auto_adjust.js
```
