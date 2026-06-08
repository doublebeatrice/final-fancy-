# 广告运营工作台

当前流程版：2026-06-08

这是一个亚马逊广告、库存、选品证据、企微数据填报和日常经营闭环工作台。代码负责抓数、校验、执行、回查和记录；Codex/Claude 会话负责读证据、判断边界、产出可审计的动作方案。扩展面板和脚本里不放 AI runtime，也不直接调用模型 API。

## 当前工作原则

1. 目标是提高真实经营收益和可拿佣金的利润质量，不是单纯多做动作。
2. 业务判断先查 GBrain：涉及 SKU、ASIN、广告、listing、库存、开发诉求、选品或复查时，先检索 `D:\ad-ops-brain`，再区分 GBrain 历史、local snapshot 和 live evidence。
3. 当前状态必须 live 验证：旧快照和 GBrain 不能冒充当前后台状态。
4. 写动作必须闭环：dry-run 通过不等于完成，提交成功也不等于落地成功；要回读后台确认 changed row、状态、bid/budget 或审核状态。
5. 产品目标先于广告动作：先确认产品目标、市场证据、listing/价格/库存承接能力，再动 bid、budget、keyword 或 campaign。
6. daily deposit 是数据闭环，不是广告执行流程；先看 deposit status，再补缺口。

详细 agent 规则见 `AGENTS.md`。长期业务口径和历史教训见 `memory.md` 与 GBrain。

## 新机器拉取后

```powershell
git clone https://github.com/doublebeatrice/final-fancy-.git
cd ad-ops-workbench
npm install
npm test
```

如果是在已有目录同步：

```powershell
git pull
npm install
npm test
```

本仓库已提交 `.codex/config.toml`，用于保持 Codex 执行策略一致。以下内容故意不提交，属于本机状态或导出产物：

- `.claude/settings.local.json`
- `.claude/scheduled_tasks.json`
- `outputs/`
- `data/doc_exports/`
- `tmp/`
- `.tmp/`

如果另一台电脑需要 Claude 本机权限或提醒任务，请在那台机器上重新配置，不要把本机 allowlist、历史 scheduled task 或导出 Excel 当作运行依赖提交。

## 日常启动

业务系统统一使用协作浏览器，避免个人 Chrome 和自动化 Chrome 抢登录态：

```powershell
npm run chrome:operator
npm run chrome:ready
```

需要登录并保持可读的系统：

- 广告后台：`https://adv.yswg.com.cn/`
- sellerinventory：`https://sellerinventory.yswg.com.cn/`
- 选品系统：`https://selection.yswg.com.cn/dashboard/analysis`

可用状态不要只看网页是否打开；以后端 readiness 为准。不要复制、保存或提交 cookies、token、JWT、CSRF、Inventory-Token。

## Daily Deposit 数据闭环

每天数据入库/填报先从 status 开始：

```powershell
npm run ops:deposit:status -- --date <YYYY-MM-DD> --json
```

只恢复缺失项：

```powershell
npm run ops:deposit:recover-raw -- --date <YYYY-MM-DD>
npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>
npm run ops:deposit:quick-summary -- --date <YYYY-MM-DD>
```

企微填报：

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD>
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD>
```

deposit 不负责广告、listing 或价格执行。缺浏览器、登录或后端 readiness 时，先修共享浏览器和流程稳定性。

## 广告与经营闭环

### 1. 准备证据

完整日常快照和诊断：

```powershell
npm run ops:today -- --mode full-snapshot --actor codex
```

需要实际写入时才加 `--execute`：

```powershell
npm run ops:today -- --execute --mode full-snapshot --actor codex
```

单项证据常用入口：

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<term1, term2>"
npm run ops:selection:keyword-conversion -- --keywords "<term1, term2>"
npm run ops:selection:aba-search-terms -- --search-terms "<term1, term2>"
npm run ops:selection:keyword-seasonality -- --search-terms "<term1, term2>"
npm run ops:selection:product-time-machine -- --search-keywords "<term1, term2>"
npm run ops:sif:keyword-history -- --keyword "<term>"
npm run ops:sif:reverse-keywords -- --asin <ASIN>
```

### 2. AI 判断和 action schema

AI 会话读 live evidence、local snapshot、GBrain 和 `memory.md`，把目标 SKU/产品分成：

- `action`：可执行，且有证据、边界、预期效果和复查计划。
- `review`：不能安全自动动作，需要补证据、人工确认或等待下一轮。
- `no-action`：明确理由不动。

可执行 action 必须带 `approvedBy`、`decisionStage=ai_approved`、`hypothesis`、`expectedEffect`、`reviewPlan`。生成器输出默认只是 candidate，不能直接执行。

### 3. dry-run、执行、回查

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema_<date>_<actor>.json --snapshot data\snapshots\latest_snapshot.json

Remove-Item Env:\DRY_RUN
node scripts\execute\run_actions.js data\snapshots\action_schema_<date>_<actor>.json --snapshot data\snapshots\latest_snapshot.json
```

执行后必须看：

- `data/snapshots/execution_summary_<YYYY-MM-DD>.json`
- `data/snapshots/execution_verify_<YYYY-MM-DD>.json`
- `data/adjustments/adjustments_<YYYY-MM-DD>.json`
- `data/learning/daily_learning_<YYYY-MM-DD>.json`

如果这些文件冲突，以最新目标 run 的 summary、verify 和 daily learning 为准。

## Agent 中枢闭环

任务、复查、能力和交接统一走 agent control plane：

```powershell
npm run ops:agent:inbox -- --text "<外部诉求>"
npm run ops:agent:reviews -- --ledger data\agent\agent_ledger_<date>.json --today <date>
npm run ops:agent:capabilities -- --file data\agent\capabilities_<date>.json --out data\agent\capability_registry_<date>.json
npm run ops:agent:hub -- --ledger data\agent\agent_ledger_<date>.json --reviews data\agent\review_queue_<date>.json --capabilities data\agent\capability_registry_<date>.json --today <date>
```

只读证据命令：

```powershell
npm run ops:agent:run-commands -- --hub data\agent\operating_hub_<date>.json --out data\agent\command_results_<date>.json
```

低风险写入默认预演，显式 `--execute` 后才执行：

```powershell
npm run ops:agent:write-actions -- --ledger data\agent\agent_ledger_<date>.json --actions data\snapshots\action_schema_<date>_codex.json --snapshot data\snapshots\latest_snapshot.json --out data\agent\write_execution_<date>.json
```

总编排自测：

```powershell
npm run ops:agent:closed-loop -- --self-test
```

真实无人值守必须经过 unattended gate、scheduler audit、readiness audit 和 goal audit；不要只看单个绿灯。

## Codex Skills

本仓库把当前业务能力写成 Codex skills，路径在 `.codex/skills/`。常用：

- `daily-data-deposit`：每日数据入库、企微填报和 deposit 缺口恢复。
- `ad-search-term-analyzer`：搜索词、否词、低效词和 query mining。
- `amazon-listing-health-check`：Amazon listing 前台健康检查。
- `selection-product-research` / `selection-feature-demand-validator`：选品、功能需求和市场证据。
- `developer-product-inquiry`：开发/产品诉求回复。
- `new-product-ad-build`：新品广告架构。
- `sellerinventory-product-analysis`：产品经营底盘、利润和库存。
- `tencent-doc-export` / `wecom-sheet-export` / `wecom-data-fill`：腾讯文档、企微表格和填报。

业务任务触发对应 skill 时，先按 skill 的 `SKILL.md` 执行，不要重新发明流程。

## 高风险动作边界

以下动作默认保留 review 或需要显式授权：

- 创建新广告结构、重建 campaign、批量结构修复。
- 大幅 bid/budget 变动。
- 高销量、高库存风险、高退货或负利润 SKU 的强操作。
- listing 文案编辑和标题修改。
- 价格变动，除非符合 Ful+Res 短缺提价路径并完成 `.99`、dry-run、sellerinventory 回查和广告联动。
- 海运补货和库存策略。

风险不是拒绝理由。风险决定证据、边界、批量大小、dry-run、审批和复查方式。

## 目录速查

```text
AGENTS.md                  Codex/agent 当前规则
AGENT.md                   兼容旧入口的 agent 规则
README.md                  当前流程入口
CHANGELOG.md               重要能力变更
.codex/config.toml         Codex 本仓库执行策略，需提交
.codex/skills/             本仓库业务 skills
docs/                      架构、规则和 runbook
memory.md                  长期运营记忆
src/                       核心校验、台账、学习和闭环逻辑
scripts/                   抓数、执行、agent、deposit、wecom、诊断脚本
extension/                 浏览器扩展
data/reference/            可提交的源参考资料
data/snapshots/            快照和执行证据
data/learning/             daily learning、SKU lesson、纠错 lesson
data/agent/                agent ledger、hub、review、handoff、audit
data/tasks/                watchlist 和任务队列
outputs/                   本地输出产物，不提交
data/doc_exports/          文档/表格导出产物，不提交
```

## 必读文档

- `AGENTS.md`：当前 agent 行为规则。
- `docs/BROWSER_SESSION_PROFILE.md`：共享浏览器和 profile 边界。
- `docs/PRODUCT_MARKET_EVIDENCE_STACK.md`：产品市场证据栈。
- `docs/MARKET_EVIDENCE_FIRST_OPERATING_PATTERN.md`：先市场证据再动作。
- `docs/BASIC_AD_ARCHITECTURE_WORKFLOW.md`：基础广告架构。
- `docs/SKU_LESSON_SYSTEM.md`：SKU lesson 和迁移边界。
- `docs/SKU_WATCHLIST_OPERATING_RULE.md`：watchlist 和复查承诺。
- `docs/AGENT_CONTROL_PLANE.md`：agent 台账、授权和复查。
- `docs/WECOM_CODEX_REVIEW_FLOW.md`：企微/Codex 协作。
- `docs/ROOT_FILE_MAP.md`：根目录文件边界。

## 常用检查

```powershell
npm test
node --check auto_adjust.js
npm run ops:closure:verify -- --date <YYYY-MM-DD>
git status -sb
git ls-files --others --exclude-standard
```

提交前确认：

- 运行必需的代码、规则、skills、docs、源参考资料已提交。
- 本机配置、token、cookies、浏览器 profile、导出 Excel、截图和 outputs 不提交。
- 业务结论如果是 durable knowledge，写入 GBrain 或对应 `data/learning/`，不要只留在聊天里。
