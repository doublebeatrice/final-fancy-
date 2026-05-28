# 智能代理底座

这层的目标是把项目从“能执行一轮运营”推进到“能负责一件事到闭环”。它不替代现有广告策略，也不绕过 `action schema` 校验；它只负责三件基础能力：任务台账、授权边界、效果复查。

## 解决什么问题

现有系统已经能拉数据、诊断、执行和回查，但任务来源开始变多：每日巡检、开发诉求、商品判断、新接口接入、执行后复查。缺少统一台账时，系统容易出现两个问题：

- 做过动作，但没有沉淀成下一次必须复查的承诺。
- 外部临时任务和每日运营任务分散在不同文件里，无法统一判断“还有什么没闭环”。

`src/agent_control_plane.js` 提供统一结构，把任务和动作汇总成一份智能代理台账。

## 核心对象

### 任务

任务表示“有一件事需要负责到底”。来源可以是每日运营、外部转发诉求、能力接入、效果复查。

关键字段：

- `taskId`：稳定任务编号。
- `lane`：任务通道，例如 `daily_ops`、`external_inbox`、`effect_review`。
- `status`：`new`、`in_progress`、`executed`、`waiting_review`、`blocked`、`closed`。
- `subject`：任务对象，可以是 SKU、ASIN、关键词、广告实体。
- `evidence`：已拉取或已确认的证据。
- `dueDate`：复查或处理截止日期。
- `history`：状态变化记录。

### 授权判断

授权判断决定一个动作属于哪类处理方式：

- `auto_read`：只读动作，可以直接拉证据。
- `auto_execute`：低风险已授权动作，可以走预演、执行、落地回查。
- `escalate`：高影响或未归类动作，需要明确授权边界后再做。
- `blocked`：缺少 AI/人工批准、来自候选生成器、或字段不满足执行条件。

这不是人工审批队列。它的作用是让智能代理知道：哪些可以自己做，哪些要小步试，哪些已经超出当前授权边界。

### 效果复查

执行动作如果带 `reviewPlan.checkAfterDays`，系统会自动生成复查任务。例如 `[1, 3, 7]` 会生成明天、三天后、七天后的效果复查。复查任务会保留原动作、SKU、实体、指标和回滚条件。

## 命令入口

### 外部任务入口

别人临时丢来的问题先进入外部任务收件箱，再接到 agent 台账。入口会识别 SKU、ASIN、关键词、任务类型、证据需求和下一复查点。

```powershell
npm run ops:agent:inbox -- --text "开发问 HAY0218 为什么没流量，能不能推"
```

多条消息可以写入文本文件，一行一条：

```powershell
npm run ops:agent:inbox -- --file data\agent\external_messages_2026-05-19.txt --out data\agent\external_inbox_2026-05-19.json
```

当前会按中文运营场景自动分类：

- 开发/产品诉求：新品、没流量、能不能推、曝光问题。
- 关键词问题：这个词能不能加、投词、转化、竞争。
- Listing 文案：标题、五点、卖点、search term。
- 价格问题：提价、降价、价格申请。
- 库存问题：滞销、清仓、断货、补货。
- 总盘问题：销售掉、KPI、老板追问、趋势异常。

### 每日台账

每日闭环运行会自动写出智能代理台账：

```powershell
npm run ops:today -- --mode full-snapshot --actor codex
```

台账默认输出到：

```text
data/agent/agent_ledger_<businessDate>.json
```

也可以手动从任务文件和动作文件生成：

```powershell
npm run ops:agent -- --tasks data\tasks\daily_tasks_2026-05-19.json --actions data\snapshots\action_schema_2026-05-19_codex.json --out data\agent\agent_ledger_2026-05-19.json
```

输入可以是任务数组、任务池对象、动作数组或 `action schema` 计划。输出是一份台账 JSON，默认写到 `data/agent/agent_ledger_<businessDate>.json`。

### 到期复查队列

复查队列从 agent 台账里筛出 `waiting_review` 且到期的任务，输出今天必须回看的清单和检查项。

```powershell
npm run ops:agent:reviews -- --ledger data\agent\agent_ledger_2026-05-19.json --today 2026-05-19 --out data\agent\review_queue_2026-05-19.json
```

复查队列只负责“筛出该回看的承诺和检查清单”；真正拉当前广告证据和判断关闭、继续观察、回滚或二次动作，由下面的复查证据采集器和效果复查执行器完成。

如果已经有复查证据文件，可以先用效果复查执行器判断：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-19.json --evidence data\agent\review_evidence_2026-05-19.json --today 2026-05-19 --out data\agent\effect_review_2026-05-19.json
```

如果没有证据文件，可以让复查器先按到期 SKU 调用广告最小接口 `/product/adSkuSummary` 采集当前证据，再判断：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-19.json --collect-evidence --today 2026-05-19 --out data\agent\effect_review_2026-05-19.json
```

如果复查时已经有库存、利润或选品报告，可以一并传入，复查器会把它们合并成同一份证据：

```powershell
npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-19.json --collect-evidence --inventory-report data\snapshots\inventory_review_2026-05-19.json --profit-report data\snapshots\profit_review_2026-05-19.json --keyword-conversion-report data\snapshots\selection_keyword_conversion_rate_2026-05-19.json --aba-report data\snapshots\selection_aba_search_terms_2026-05-19.json --seasonality-report data\snapshots\selection_keyword_seasonality_2026-05-19.json --today 2026-05-19 --out data\agent\effect_review_2026-05-19.json
```

也可以只采集证据，不做判断：

```powershell
npm run ops:agent:review-evidence -- --queue data\agent\review_queue_2026-05-19.json --today 2026-05-19 --out data\agent\review_evidence_2026-05-19.json
```

证据文件按 SKU、ASIN、关键词或实体编号索引：

```json
{
  "SE5608": {
    "baseline": { "spend": 10, "orders": 0, "acos": 0 },
    "current": { "spend": 18, "orders": 0, "acos": 0 },
    "inventory": { "fulfillable": 8, "reserved": 2, "fulRes": 10, "sellableDays": 16 },
    "profit": { "profitRate": 0.16, "netProfit": 4.2 },
    "market": {
      "terms": [{
        "term": "american flag bucket hat",
        "keywordConversion": { "marketQuality": "weak", "costRisk": "high" },
        "abaSearchTerm": { "demandTier": "low", "competitionTier": "high" }
      }]
    },
    "riskSignals": ["inventory_tight", "acos_above_profit_rate", "market_conversion_weak"]
  }
}
```

当前判断输出四类：

- `close_success`：订单改善且 ACOS 稳定，可建议关闭复查。
- `continue_watch`：变化不明确，继续等下一个复查窗口。
- `rollback_review`：触发回滚条件，需要进入回滚或二次控制复核。
- `needs_data`：缺少基线或当前指标，不允许假判。

注意：`--collect-evidence` 会自动采集当前广告表现。台账生成复查任务时，如果原动作已经带 `reviewPlan.baseline`，会原样保留；如果动作带 `currentMetrics`、`currentAdMetrics`、`adBaseline`、`metricsBaseline`、`reviewBaseline` 或 `baseline`，会自动抽取 `spend`、`orders`、`sales`、`acos`、`clicks`、`impressions` 作为执行前基线。缺少执行前基线时，即使当前广告数据拉取成功，也必须输出 `needs_data`。

复查不是只看广告。即使订单改善，如果库存已经偏紧、利润为负、当前 ACOS 高于利润率，或选品证据显示市场转化弱、成本高、需求低、竞争高，复查器会保留为 `continue_watch`，不直接建议关闭成功。

### 能力注册中心

新发现一个接口或工具时，不要直接把它散落成一次性脚本。先登记成能力，写清楚它是什么、能读还是能写、依赖哪个登录态、字段契约是什么、风险等级是什么、怎么预演、怎么回查。

```powershell
npm run ops:agent:capabilities -- --file data\agent\capabilities_2026-05-19.json --out data\agent\capability_registry_2026-05-19.json
```

命令默认会带上项目内置能力目录，再合并你传入的新接口。内置目录目前覆盖：

- 广告 SKU 摘要证据。
- 选品关键词转化。
- 选品 ABA 搜索词。
- 选品关键词季节性。
- sellerinventory listing 原始数据读取。
- sellerinventory listing 修改提交。
- 复查证据采集。
- 效果复查判断。

如果只想检查某个临时能力文件，不合并内置目录，可以加：

```powershell
npm run ops:agent:capabilities -- --file data\agent\capabilities_2026-05-19.json --no-defaults
```

能力登记建议字段：

```json
{
  "name": "ad sku summary",
  "sourceSystem": "adv",
  "surface": "ad_backend",
  "operationType": "read",
  "endpoint": { "method": "GET", "path": "/product/adSkuSummary" },
  "auth": { "source": "active_browser_session" },
  "contract": {
    "params": ["sku", "days"],
    "responseFields": ["spend", "orders", "acos"]
  },
  "verification": {
    "probeCommand": "node scripts/execute/fetch_ad_sku_summary.js 4 7 <SKU>"
  }
}
```

能力注册会输出：

- `executionMode=auto_read`：只读能力，可直接拉证据。
- `executionMode=auto_execute_with_schema`：低风险可写能力，仍必须走 schema、预演、执行、回查。
- `executionMode=boundary_required`：可写但高影响或边界未完全释放，需要定义授权边界。
- `executionMode=blocked`：缺字段契约、探针、预演或写后回查，不能进入执行链。

敏感头、token、cookie、CSRF、Inventory-Token 永远不允许登记或持久化。能力只能描述“使用活跃浏览器登录态”，不能保存认证材料。

### 自主运营中枢

自主运营中枢把四类来源合成今天的队列：

- 每日运营台账：低效、超预算、季节性、异常和机会任务。
- 外部任务收件箱：开发、产品、运营、库存、老板临时问题。
- 到期复查队列：昨天、三天前、七天前承诺要回看的动作。
- 能力注册目录：新接口还缺探针、契约、授权边界或写后回查的任务。
- 上一轮 learning memory：不能复用的规则、复用前必须补的证据和未闭环 follow-up。

```powershell
npm run ops:agent:hub -- --ledger data\agent\agent_ledger_2026-05-19.json --inbox data\agent\external_inbox_2026-05-19.json --reviews data\agent\review_queue_2026-05-19.json --capabilities data\agent\capability_registry_2026-05-19.json --today 2026-05-19 --out data\agent\operating_hub_2026-05-19.json
```

排序规则是：到期复查优先，其次每日运营主线，再处理能力补齐和学习约束，最后处理外部临时任务和未到期复查。中枢当前只负责合流、排序、给出下一步动作和命令计划，不直接执行后台写入。

中枢默认读取前一天的 `data\agent\learning_memory_<date>.json`。需要指定时使用 `--prior-learning-memory <file>`。读取成功后，hub 会把 `learning_constraint` 任务合并进 `todayQueue`，并写出 `learningContext.mustReadBeforeDecision`、`learningContext.doNotApplyWhen`、`learningContext.evidenceBeforeReuse`。closed-loop summary 会同步写出 `priorLearningMemoryApplied` 和 `priorLearningConstraintTasks`。

每条队列项会带：

- `requiredCapabilities`：本任务需要调用的能力，例如选品关键词转化、ABA、关键词季节性、复查证据采集。
- `executionPlan.commands`：下一步建议运行的命令。例如到期复查会生成 `npm run ops:agent:review-effect -- --collect-evidence ...`；外部选品问题会生成关键词转化、ABA 和关键词季节性证据命令。
- `executionPlan.requiredInputs`：还缺的输入，例如没有关键词时会写出“关键词或搜索词”。
- `executionPlan.safeToAutoRun`：当前命令是否都是只读证据采集。中枢不会因此绕过 schema、预演、授权边界或写后回查。

### 只读命令执行

中枢生成命令计划后，可以让受限执行器自动运行只读证据命令：

```powershell
npm run ops:agent:run-commands -- --hub data\agent\operating_hub_2026-05-19.json --out data\agent\command_results_2026-05-19.json
```

执行器只跑同时满足这些条件的命令：

- 队列项 `executionPlan.safeToAutoRun=true`。
- 命令 `riskLevel=read_only`。
- 命令必须是白名单里的 `npm run` 入口，例如效果复查、复查证据采集、选品关键词转化、选品 ABA、选品关键词季节性、能力注册。
- 命令里不能有 `<关键词或搜索词>` 这类占位符。
- 命令字符串不能带 shell 串联符号。

输出写到 `data\agent\command_results_<date>.json`，后续由执行结果回填入口写回任务状态和历史。

如果命令退出成功但没有生成声明的输出文件，执行器会把该条结果标为失败。这样后续回填会进入阻塞状态，而不是把“没拿到证据”的任务误记成已执行。

### 纠错风险审计

操作者纠错是系统风险信号，不是普通备注。只要纠错提到判断错、数据旧、证据缺、范围错、已误执行、未落地，或者同一规则可能影响其他 SKU，先运行纠错审计：

```powershell
npm run ops:agent:correction-risk -- --text "HAY0218 budget-down was wrong, stale snapshot was used, same rule may affect other SKUs" --today 2026-05-25
```

Risk is routing, not refusal: when an operating action is supported, risk changes the evidence, boundary, dry-run, approval, batch size, and follow-up plan; it must not be used as a reason to skip the action. Unsupported actions must create a concrete capability gap, escalation task, or next evidence command.

审计输出 `data\agent\correction_risk_<date>.json/.md`，并在 `data\learning\corrections\` 下写入带 `doNotApplyWhen`、复用证据要求和下一次校验点的学习补丁。中枢会把纠错类外部消息转成 `operator_correction`，只自动运行只读审计命令；任何回滚、二次动作或同规则修复仍要走原来的 schema、预演、授权边界和落地回查。

### 无人值守成熟度审计

闭环跑通不等于已经可无人值守。`ops:agent:autonomy-audit` 会把闭环产物验成一组可检查的自驱条件：closed-loop、artifact verification、handoff、只读命令、写入闸口、数据新鲜度、恢复 next-actions、daily learning、纠错系统和 market-evidence-first 规则。

```powershell
npm run ops:agent:autonomy-audit -- --closed-loop data\agent\agent_closed_loop_2026-05-25.json --today 2026-05-25
```

总编排会在最后自动生成 `data\agent\autonomy_audit_<date>.json/.md`，并把 `autonomyStatus`、`autonomyScore`、`autonomousReady` 和缺口任务数写回 closed-loop summary。`ready_with_recovery` 表示系统能自驱推进恢复；`not_ready` 表示还存在会阻断无人值守的证据、学习、写入或纠错缺口。

### 长期学习索引

每日学习、纠错补丁和 SKU lesson 不能只作为散落文档存在。`ops:agent:learning-memory` 会把它们合成下一轮可直接读取的约束索引：

```powershell
npm run ops:agent:learning-memory -- --learning data\learning\daily_learning_2026-05-25.json --autonomy-audit data\agent\autonomy_audit_2026-05-25.json --today 2026-05-25
```

输出 `data\agent\learning_memory_<date>.json/.md`，核心是 `nextRunBrief.mustReadBeforeDecision`、`doNotApplyWhen`、`evidenceBeforeReuse` 和 `openFollowUps`。总编排会在 autonomy audit 后自动生成 learning memory，再用该 memory 复核 autonomy audit；下一轮 hub 会读取上一轮 memory 并把约束任务排入队列。因此“越用越聪明”的证据不只是一份 daily learning，而是下一轮能直接执行的约束索引和任务。

### 无人值守执行闸口

真实写入不能因为闭环成功就自动放开。`ops:agent:unattended-gate` 负责判断 dry-run 是否可以升级为无人值守 execute：

```powershell
npm run ops:agent:unattended-gate -- --closed-loop data\agent\agent_closed_loop_2026-05-25.json --autonomy-audit data\agent\autonomy_audit_2026-05-25.json --learning-memory data\agent\learning_memory_2026-05-25.json --write-execution data\agent\write_execution_2026-05-25.json --today 2026-05-25
```

它只在 closed-loop、artifact verification、autonomy audit、learning memory、write dry-run、数据新鲜度、低风险授权、无待审批动作、无 dry-run blocker、schema/snapshot 文件齐全时输出 `decision=execute_allowed`。默认只审计；只有显式加 `--execute-if-ready`，且 gate 已允许，才会调用受限写入链进入真实 execute。总编排会自动生成 `unattended_gate_<date>.json/.md` 并写回 `unattendedGateDecision`、`unattendedExecuteAllowed` 和 blocker 数。

### 无人值守监督入口

生产定时任务应调用 `ops:agent:unattended-supervisor`，不要直接裸跑 closed-loop。监督入口负责三件事：

- 读取上一轮 `learning_memory`，没有学习连续性时阻断 live unattended execute。
- 调用 closed-loop 并保留 autonomy audit、learning memory、unattended gate 的状态。
- 写出 `unattended_supervisor_<date>.json/.md` heartbeat，给定时任务和人工复盘一个稳定检查点。

```powershell
npm run ops:agent:unattended-supervisor -- --prior-learning-memory data\agent\learning_memory_2026-05-24.json --today 2026-05-25 --out-dir data\agent
```

如果需要真实无人值守写入，必须同时传：

```powershell
npm run ops:agent:unattended-supervisor -- --execute --execute-if-ready --prior-learning-memory data\agent\learning_memory_2026-05-24.json --today 2026-05-25 --out-dir data\agent
```

只有 `--execute-if-ready` 不会触发写入；监督入口会把它记录为 requested 但不 armed。live execute 还要求上一轮 learning memory 存在，除非显式使用 `--allow-missing-prior-learning` 做首轮 bootstrap。

### 生产定时计划

生产定时任务不要手写一条命令后直接丢进 Windows Task Scheduler。先用计划生成器产出可审计版本：

```powershell
npm run ops:agent:unattended-schedule-plan -- --today 2026-05-25 --out-dir data\agent
```

如果要生成 live execute 版本，必须同时传双确认开关：

```powershell
npm run ops:agent:unattended-schedule-plan -- --execute --execute-if-ready --today 2026-05-25 --out-dir data\agent
```

输出 `unattended_schedule_plan_<date>.json/.md`，包含五类内容：生产 supervisor 命令、带 `--today` 和 prior learning 的 run-now 验证命令、scheduler audit 命令、completion audit 命令、Windows Task Scheduler 注册片段。这个脚本只生成计划，不安装系统计划任务。周期性生产命令默认不固定 `--today`，让 supervisor 自己按运行日期推导 business date 和上一轮 learning memory；只在一次性验证时使用 `--pin-today`。

安装或验证系统计划任务必须走安装入口，默认仍然只是报告模式：

```powershell
npm run ops:agent:unattended-schedule-install -- --plan data\agent\unattended_schedule_plan_2026-05-25.json --verify-installed --today 2026-05-25
```

只有显式加 `--install` 才会写入 Windows Task Scheduler：

```powershell
npm run ops:agent:unattended-schedule-install -- --plan data\agent\unattended_schedule_plan_2026-05-25.json --install --today 2026-05-25
```

输出 `unattended_schedule_install_<date>.json/.md`，并校验已安装任务的 executable、arguments、working directory 是否和计划一致。生成的主 Windows task 通过 `cmd.exe` 调用仓库当前 Node 可执行文件，并把 stdout/stderr 追加到 `data\agent\unattended_supervisor_task.log`；任务必须以 `RunLevel=Highest` 安装，保证无人值守运行时可以读取 Task Scheduler 自身状态。计划器还会生成 `AdOpsAgentCompletionAudit`，默认在主任务 20 分钟后运行 `ops:agent:completion-audit`，并在 task action 里传入 `--scheduled-task-invocation --scheduled-task-name AdOpsAgentCompletionAudit`；completion audit 会先等待 supervisor 任务退出，再刷新 `unattended_schedule_install_<date>` 的最终 Task Scheduler 状态，最后把严格完成审计写到 `agent_completion_audit_<date>.json/md`。严格完成不仅要求 supervisor 自然触发，还要求 `AdOpsAgentCompletionAudit` 自己有自然触发运行证明和计划任务调用来源证明，不能用人工补跑替代无人值守完成。这里的 `<date>` 是站点业务日期，不一定等于中国本机日期。

需要立即验证 Task Scheduler 运行链路时，用受控 run-now，不改计划配置：

```powershell
npm run ops:agent:unattended-schedule-install -- --plan data\agent\unattended_schedule_plan_2026-05-25.json --run-now --run-now-timeout-seconds 900 --today 2026-05-25
```

这会触发已安装的 `AdOpsAgentUnattendedSupervisor` 跑一次，并等待任务结束后写回 `lastRunTime` / `lastTaskResult`。随后 scheduler audit 必须看到 run 后有更新的 supervisor heartbeat；否则按调度健康缺口处理。

`run-now` 只证明已安装任务的运行链路、权限、工作目录和 heartbeat 输出，不证明自然定时触发已经发生。要证明完整无人值守，等下一次真实触发时间后加严格检查：

```powershell
npm run ops:agent:unattended-scheduler-audit -- --heartbeat-dir data\agent --schedule-command "npm run ops:agent:unattended-supervisor -- --out-dir data\agent --execute --execute-if-ready" --schedule-install data\agent\unattended_schedule_install_2026-05-25.json --require-schedule --require-live-execute --require-natural-scheduled-run --today 2026-05-25
```

### 定时健康审计

监督入口产出 heartbeat 后，还需要定时健康审计来证明无人值守不是“昨天跑过一次”。`ops:agent:unattended-scheduler-audit` 会检查：

- 最近 `unattended_supervisor_<date>.json` 是否存在且新鲜。
- 最新 heartbeat 是否 `ok=true`，是否缺 prior learning。
- 是否连续多次 blocked/failed。
- 生产计划命令是否调用 `ops:agent:unattended-supervisor`，是否绕过 supervisor 直接跑 closed-loop。
- 真实自驱计划是否同时写了 `--execute` 和 `--execute-if-ready`；只巡检的 dry-run 计划不能冒充 live self-driving。
- 是否错误地只写了 `--execute-if-ready` 而没有 `--execute`。

```powershell
npm run ops:agent:unattended-scheduler-audit -- --heartbeat-dir data\agent --schedule-command "npm run ops:agent:unattended-supervisor -- --out-dir data\agent --execute --execute-if-ready" --schedule-install data\agent\unattended_schedule_install_2026-05-25.json --require-schedule --require-live-execute --today 2026-05-25
```

输出 `unattended_scheduler_audit_<date>.json/.md`，并把调度健康缺口写成 `scheduler_health_gap` 任务。真实自驱生产计划必须让审计显示 `scheduleLiveExecuteArmed=true`；这只证明计划任务已带双保险，真正写入仍由 unattended gate 决定。传入 `--schedule-install` 后，审计还会检查已安装任务的 Ready 状态、触发器、`lastRunTime`、`lastTaskResult`，以及 last run 后是否写出更新的 supervisor heartbeat。这个审计是生产无人值守的守夜层：closed-loop 证明任务链，supervisor 证明本次受控运行，scheduler audit 证明调度入口、heartbeat 连续性、真实计划任务运行结果和 live 双保险有效。

### 总目标 readiness 审计

当问题是“agent 化够不够、自驱够不够、纠错有没有进学习”时，不要只看 autonomy audit 或 scheduler audit 的单点结果。总目标审计把 closed-loop artifact、live-armed schedule、supervisor 双保险、unattended gate、learning memory、correction-risk、risk-is-routing 纠错、prior learning、heartbeat 连续性和 scheduled task runtime proof 合成一份报告：

```powershell
npm run ops:agent:readiness-audit -- --today 2026-05-25 --require-correction-lesson --require-risk-routing-lesson
```

输出 `agent_readiness_audit_<date>.json/.md`。严格判断完整目标时，加 `--require-natural-scheduled-run`，要求已安装任务的 `lastRunTime` 对齐上一轮自然日触发时间，并且有更新的 supervisor heartbeat；readiness 也会独立检查 `AdOpsAgentCompletionAudit` 是否安装为可运行的 post-trigger 计划任务，以及该任务是否已有自然触发 runtime proof，不能靠人工次日补验替代。受控 `run-now` 不能替代自然触发证明。`status=ready_with_warnings` 可以表示生产入口、学习和纠错系统已成立，但仍有正常 watch 项，例如 `gate=no_actions` 或 active learning warnings；`status=not_ready` 才表示有会破坏完整目标的缺口。生产 `ops:agent:unattended-supervisor` 默认会在每次 heartbeat 后自动生成当天 `unattended_schedule_install_<date>` 验证、`unattended_scheduler_audit_<date>` 和这份 readiness audit，并把摘要回写到 `unattended_supervisor_<date>.json`；`--skip-scheduler-audit` / `--skip-readiness-audit` 只用于测试，不作为生产 readiness 证据。

### 低风险写入编排

低风险写入动作不放进只读命令执行器。它们走单独的受限编排器：

```powershell
npm run ops:agent:write-actions -- --ledger data\agent\agent_ledger_2026-05-19.json --actions data\snapshots\action_schema_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --out data\agent\write_execution_2026-05-19.json
```

默认只跑预演。编排器会先读取台账动作授权，只有写入动作全部属于 `auto_execute`，且没有高影响、缺批准、候选生成器等阻塞，才允许进入真实写入。真实执行必须显式加 `--execute`：

```powershell
npm run ops:agent:write-actions -- --ledger data\agent\agent_ledger_2026-05-19.json --actions data\snapshots\action_schema_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --execute --out data\agent\write_execution_2026-05-19.json
```

真实执行会复用现有 `scripts\execute\run_actions.js`，仍然经过 `action schema` 校验、预演、后台写入、落地回查和调整日志。编排器只负责把这些阶段串成代理可读的 `data\agent\write_execution_<date>.json`，并输出可被回填入口消费的 `results`。

### 执行结果回填

中枢给出命令计划后，命令执行结果要回填到任务状态和历史，避免“命令跑过了但台账不知道”：

```powershell
npm run ops:agent:feedback -- --hub data\agent\operating_hub_2026-05-19.json --results data\agent\command_results_2026-05-19.json --out data\agent\operating_hub_feedback_2026-05-19.json
```

结果文件格式：

```json
{
  "results": [{
    "taskId": "external_request::keyword_question::SE5608::abc",
    "command": "npm run ops:selection:keyword-conversion -- --keywords \"american flag bucket hat\"",
    "ok": true,
    "exitCode": 0,
    "summary": "选品关键词转化证据已生成。",
    "outputFiles": ["data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json"]
  }]
}
```

回填规则：

- 只读命令成功：任务状态写为 `executed`，历史追加 `command_success`。
- 命令失败：任务状态写为 `blocked`，历史追加 `command_failed`。
- 效果复查返回 `close_success`：任务关闭并写入结论。
- 效果复查返回 `continue_watch`：继续保留为待复查。
- 效果复查返回 `rollback_review` 或 `needs_data`：任务进入阻塞，等待二次处理。

### 中文交接摘要

每天最后可以把中枢、命令结果、写入编排和效果复查压成一份中文早间交接：

```powershell
npm run ops:agent:handoff -- --hub data\agent\operating_hub_2026-05-19.json --results data\agent\command_results_2026-05-19.json --write-execution data\agent\write_execution_2026-05-19.json --effect-review data\agent\effect_review_2026-05-19.json --out data\agent\agent_handoff_2026-05-19.md
```

摘要会保留四块最重要的信息：今日优先任务、自动证据结果、阻塞和需确认项、复查结论、写入链路状态。它面向早上检查，不替代底层 JSON 证据。

### 总编排闭环

如果要让智能代理一次串完整体流程，用总编排入口：

```powershell
npm run ops:agent:closed-loop -- --ledger data\agent\agent_ledger_2026-05-19.json --inbox data\agent\external_inbox_2026-05-19.json --reviews data\agent\review_queue_2026-05-19.json --capabilities data\agent\capability_registry_2026-05-19.json --actions data\snapshots\action_schema_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --out-dir data\agent
```

它会按顺序完成：

- 生成或读取自主运营中枢。
- 跑可自动执行的只读证据命令。
- 对低风险写入动作跑受限编排，默认只预演；显式 `--execute` 才真实写入。
- 把命令结果回填到任务状态和历史。
- 生成中文交接摘要。

可控闭环自测不会调用真实后台：

```powershell
npm run ops:agent:closed-loop -- --self-test
```

## 当前边界

- 这层不直接生成广告策略。
- 只读证据可以通过白名单命令自动采集；后台写入仍不能绕过 `action schema`、预演、执行、落地回查和调整日志。
- 高影响 listing、价格、新广告结构等动作仍必须有明确授权边界。
- 这层负责把“该负责的事、能不能自己做、什么时候复查、证据命令是否真的产出结果”统一登记出来。

## 下一步接入方向

- 把总编排入口接入每日自动化，让早上直接产出交接摘要。
- 让更多运行路径从能力目录自动选择证据来源，而不是在脚本里手写路径。
- 把外部任务的运营回复生成接入交接摘要，形成更短的可转发回复块。
