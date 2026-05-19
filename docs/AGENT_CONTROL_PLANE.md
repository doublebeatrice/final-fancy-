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
npm run ops:agent:review-effect -- --queue data\agent\review_queue_2026-05-19.json --collect-evidence --inventory-report data\snapshots\inventory_review_2026-05-19.json --profit-report data\snapshots\profit_review_2026-05-19.json --keyword-conversion-report data\snapshots\selection_keyword_conversion_rate_2026-05-19.json --aba-report data\snapshots\selection_aba_search_terms_2026-05-19.json --today 2026-05-19 --out data\agent\effect_review_2026-05-19.json
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

```powershell
npm run ops:agent:hub -- --ledger data\agent\agent_ledger_2026-05-19.json --inbox data\agent\external_inbox_2026-05-19.json --reviews data\agent\review_queue_2026-05-19.json --capabilities data\agent\capability_registry_2026-05-19.json --today 2026-05-19 --out data\agent\operating_hub_2026-05-19.json
```

排序规则是：到期复查优先，其次每日运营主线，再处理能力补齐，最后处理外部临时任务和未到期复查。中枢当前只负责合流、排序、给出下一步动作和命令计划，不直接执行后台写入。

每条队列项会带：

- `requiredCapabilities`：本任务需要调用的能力，例如选品关键词转化、ABA、复查证据采集。
- `executionPlan.commands`：下一步建议运行的命令。例如到期复查会生成 `npm run ops:agent:review-effect -- --collect-evidence ...`；外部选品问题会生成关键词转化和 ABA 证据命令。
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
- 命令必须是白名单里的 `npm run` 入口，例如效果复查、复查证据采集、选品关键词转化、选品 ABA、能力注册。
- 命令里不能有 `<关键词或搜索词>` 这类占位符。
- 命令字符串不能带 shell 串联符号。

输出写到 `data\agent\command_results_<date>.json`，后续由执行结果回填入口写回任务状态和历史。

如果命令退出成功但没有生成声明的输出文件，执行器会把该条结果标为失败。这样后续回填会进入阻塞状态，而不是把“没拿到证据”的任务误记成已执行。

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

## 当前边界

- 这层不直接生成广告策略。
- 只读证据可以通过白名单命令自动采集；后台写入仍不能绕过 `action schema`、预演、执行、落地回查和调整日志。
- 高影响 listing、价格、新广告结构等动作仍必须有明确授权边界。
- 这层负责把“该负责的事、能不能自己做、什么时候复查、证据命令是否真的产出结果”统一登记出来。

## 下一步接入方向

- 把低风险写入动作接成“预演、执行、落地回查、日志、复查承诺”的受限自动执行链。
- 让更多运行路径从能力目录自动选择证据来源，而不是在脚本里手写路径。
- 把每日运行结果、只读命令结果和效果复查结论合成一份更短的中文交接摘要。
