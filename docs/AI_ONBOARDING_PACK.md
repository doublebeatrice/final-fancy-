# AI Onboarding Pack — ad-ops-workbench

> 单文档冷启动手册。一次读完即可干活，无需再全盘扫码。截至 2026-06-19。
> 本文档由 onboarding workflow 一次性产出，每月或重大改动后由 §14 流程刷新。

## 0. 这份文档怎么用

- Cold-start 唯一文档。读完按 §3-§8 当字典查，不用再 grep 才能定位。
- 与其他读序文档关系：
  - `CLAUDE.md` 是路由地图（读序）
  - `AGENTS.md` 是行为铁律（怎么干）
  - `docs/CLAUDE_DIRECTION_PACK.md` 是动态运行指南（每次 run 前更新）
  - 本文档是"现在的 ad-ops-workbench 长什么样"的全景图（结构和入口）
- 冲突顺序：用户当下指令 > AGENTS.md > CLAUDE.md > 本文档。
- 维护规则在 §14。

## 1. 业务目标与底线

- **核心目标**：用佣金提成衡量。所有动作判断标准 = 经营利润 + 销售质量 + 库存健康 + KPI bonus 的综合改善。
- **GBrain First**：SKU/ASIN/listing/广告/开发诉求/复盘/选品任务，先 `D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<keyword>"`。详细协议见 `CLAUDE.md`。
- **证据边界**：每个结论都要标 `live` / `local snapshot` / `GBrain` 三选一，不混用。
- **落地铁律**：dry-run 成功 ≠ 落地，API 成功 ≠ 落地。每条 write 后必须独立 readback。
- **产品先于广告**：goal + 市场证据 + 接收能力（listing/价格/库存）确认后，才到 bid/budget。
- **覆盖不足要写**：覆盖率 < 50% 必须写"覆盖不足"，不能称作 closed-loop。
- **Daily deposit**：是数据收口，不是广告执行通道。先跑 `npm run ops:deposit:status -- --date <YYYY-MM-DD> --json`。
- **绝对不存**：cookie / token / JWT / CSRF / XSRF / Inventory-Token / 原始 API 凭证（在 docs/GBrain/commit 里都不行）。

## 2. 双 AI 入口（Codex / Claude）实操规则

| 维度 | Codex | Claude |
|---|---|---|
| Schema 文件 | `data/snapshots/action_schema_<date>_codex.json` | `data/snapshots/action_schema_<date>_claude.json` |
| 命令 actor | `--actor codex`（默认） | `--actor claude` |
| approvedBy | `codex` | `claude` |
| actionSource[] | 含 `codex` | 含 `claude` |

- Schema 必含字段：`decisionStage=ai_approved\|manual_approved`、`approvedBy`、`actionSource[]`、`requiresAiDecision=false`、`canAutoExecute=true`、`hypothesis`、`expectedEffect`、`reviewPlan`、`verifySpec`。缺一被 `src/ai_decision.js` 的 `executionApprovalFailures` 拦回 review。
- 互查（read-only）：`node scripts/diagnostics/review_recent_decisions.js --by codex|claude|manual --days N`。**不能** 静默覆盖另一方。
- Quality / orientation gate：
  - `npm run ops:agent:orientation -- --actor <a> --task "<t>"`
  - `npm run ops:agent:quality-gate -- --actor <a> --task "<t>"`（5 维 × 20 分）
- 五种异议分类（必选其一）：`evidence_gap` / `logic_conflict` / `landing_conflict` / `stale_state` / `scope_conflict`。
- Attribution 链路自动传递到：`adjustments_<date>.json` → `daily_learning_<date>` → 库存便签前缀 `[由 Claude 决策]` / `[由 Codex 决策]` / `[人工决策]`。
- 已知坑：SP campaign enable 可能 API success 但仍 paused，记 `not_landed`，不进 manual review（自动化问题，不是人工问题）。

## 3. 入口速查：npm scripts 全表（120 条，按家族）

### 3.1 浏览器与会话（9）

| script | role |
|---|---|
| `chrome:operator` | 启动协作浏览器（操作员登录用，PowerShell） |
| `chrome:ready` | 启动 debug Chrome（默认 profile，PowerShell；business 任务必备） |
| `chrome:personal` | 个人 profile Chrome |
| `chrome:debug:dry/ops/custom/personal` | debug Chrome 不同 profile mode |
| `chrome:profile:clone-default[:dry]` | 克隆 default profile 到 debug profile |
| `ops:browser:probe` | CDP 诊断单页（`scripts/execute/probe_web_page_cdp.js`） |

### 3.2 文档导出（3）

`doc:export`（腾讯文档）、`sheet:export`（企微 sheet via CDP）、`sheet:build`（Python 拼 xlsx）。

### 3.3 性能与卫生（4）

`perf:report` / `perf:stop-mcp` / `perf:archive` / `perf:hygiene-check` —— 全在 `scripts/maintenance/perf_hygiene.js`。阈值：snapshot ≤ 5GB、npm scripts ≤ 115、dated execute ≤ 25、untracked ≤ 283、source-without-tests ≤ 8。

### 3.4 顶级 ops 流水线（5）

| script | role |
|---|---|
| `ops:today` | **核心日运营流水**（`scripts/run_today_ops.js`），调 auto_adjust 两次（dry+execute），跑 snapshot 导出+任务池+低效+季节标题+listing copy+超预算+学习+收口 |
| `ops:tasks` | 轻量任务池/看板（`run_today_tasks.js`） |
| `ops:audit` | 单独跑前瞻审计（`run_proactive_audit.js`） |
| `ops:old-products` / `:market-evidence` / `:semiauto` | 老品维护管线（新拉的） |

`ops:today` 完整参数：`[--execute] [--mode full-snapshot|fast] [--actor codex|claude|manual] [--schema FILE] [--snapshot FILE] [--business-date YYYY-MM-DD] [--data-date YYYY-MM-DD] [--external-task-text|--external-task-file|--external-task-dir <v>]`。

### 3.5 广告执行（13）

| script | role |
|---|---|
| `ops:low-efficiency` / `:dry` | 低效闭环：5 类×4 窗口=20 池，PATCH 落地，appends `adjustments_<date>.json` |
| `ops:high-efficiency` / `:bids` | 高效池快照 + 高效 bid 加码 schema |
| `ops:ad:keyword-placement` | 关键词位置数据 |
| `ops:sbkw:create` | SB 关键词手动合集（新加） |
| `ops:sbv:create` | SBV 视频广告（新加） |
| `ops:ad-structure` | 广告结构机会审计 |
| `ops:adjustments:dedupe` | adjustments 日志去重 |
| `ops:audit:schema` | 前瞻审计 → 候选 schema |
| `ops:season-title:dry/fetch-listings/schema/listing-schema` | 季节标题流水 |
| `ops:season-events:import` | Python 把 xlsx 节气表导成 JSON |
| `ops:listing-copy[:withdraw]` | listing copy 编辑 / 撤回 |

### 3.6 库存与成品率（3）

`ops:success-rate`（卖家成品率）、`ops:removal-inventory:fields`、`:add-view`。

### 3.7 Daily deposit 数据收口（6）

| script | 用途 |
|---|---|
| `ops:deposit:status` | **入口**（CLAUDE.md 强制起点），`inspect_daily_deposit.js`，写 `<rawDir>/daily_deposit_status_<date>.json` + `data/tasks/raw_recovery_queue_<date>.{json,md}` |
| `ops:deposit:quick-summary` | 快速核心数据汇总（不走全 snapshot） |
| `ops:deposit:wecom-fill` | WeCom 日表 7 天 fill |
| `ops:deposit:wecom-weekly-30d` | WeCom 30 天 fill（周一用，stdout TSV） |
| `ops:deposit:recover-raw` | 恢复缺失的 raw 输入 |
| `ops:deposit:recover-sales-core` | 单独恢复 sales-core raw |

### 3.8 KPI gate（4）+ closure（2）

`ops:kpi:gate` → `ops:kpi:checkpoint` → `ops:kpi:dryrun-decisions` → `ops:kpi:digest`（月度 KPI 摘要）。
收口：`ops:closure:verify -- --date <date>` 校验闭环；`ops:cna:effect-review:validate` 模板校验。

### 3.9 选品证据（8）

`ops:selection:keyword-research` / `keyword-conversion` / `aba-search-terms` / `keyword-seasonality` / `product-time-machine` / `operating-intelligence` / `api`（通用）/ `extended`。所有 fetcher 在 `scripts/execute/fetch_selection_*.js`。

### 3.10 SIF 与产品线（5）

`ops:sif:keyword-history` / `:reverse-keywords` / `:ad-xray` / `:keyword-slots`，外加 `ops:product-line:profile`（新加，2026-06）。

### 3.11 Agent 控制平面（29，最大家族）

按子环节分四组——理解流程要按**收→识→执→学**的顺序读：

**输入与盘点**：
`ops:agent:inbox`（`run_external_task_inbox.js`）、`ops:agent:reviews`（review_queue）、`ops:agent:review-evidence`（证据收集）、`ops:agent:capabilities`（能力注册）、`ops:agent:hub`（operating_hub）。

**执行通道**：
`ops:agent:run-commands`（command_runner，allowlist 白名单）、`ops:agent:write-actions`（默认 dry-run，`--execute` 才落地，调 `scripts/execute/run_actions.js`）、`ops:agent:feedback`（execution_feedback）、`ops:agent`（control_plane top-level 驱动）。

**学习与审计**：
`ops:agent:correction-risk`、`ops:agent:autonomy-audit`、`ops:agent:learning-memory`、`ops:agent:review-effect`（effect_review）。

**无人值守 + 闭环判定**：
`ops:agent:unattended-{gate,supervisor,scheduler-audit,schedule-plan,schedule-install}` + `ops:agent:{readiness-audit,completion-audit,goal-audit,goal-final-audit}` + `ops:agent:{handoff,closed-loop,boss-paper}` + `ops:agent:orientation` + `ops:agent:quality-gate`。

**Agent 闭环铁律**：单个绿灯不算闭环。要 unattended gate + scheduler audit + readiness audit + goal audit 全过 + KPI/deposit 通过，才算 self-test pass。

### 3.12 WeiXin 与 WeCom 双栈（19）

两套是分开的——**WeiXin clawbot = 个人微信** 提醒/Codex gateway；**WeCom = 企业微信** gateway/digest/OCR/file-inbox。

WeiXin（8）：`ops:weixin:probe/setup/reminders/replies/codex/doctor/schedule` + `ops:codex:health`（Codex 自动化健康检查，可加 `--probe --probe-model gpt-5.5`）。

WeCom（11）：`ops:wecom:gateway/digest/cleanup/vwork-probe/bridge-health/file-inbox/window-capture/window-ocr/ocr-triage/import-ocr-triage/window-scan`。

### 3.13 其他

`ops:runtime:report`（workflow 运行时报告）、`impact`（执行影响分析）、`test`（`scripts/maintenance/run_test_group.js all`，无 jest/mocha；test 框架是自研分组器）、`codex:conversations`（Codex 会话备份）。

> **完整 120 条：用 `npm run` 列；按文件查 `node scripts/maintenance/package_scripts_catalog.js [--prefix ...] [--query ...]`。漂移自查：`npm run docs:onboarding-drift`。**

## 4. .codex/skills 技能目录（15）

| skill | 触发 / 角色 |
|---|---|
| `daily-data-deposit` | 每日数据收口（必备底层） |
| `wecom-data-fill` | WeCom 表格行生成（7d/30d） |
| `tencent-doc-export` / `wecom-sheet-export` | 腾讯文档/企微表 CDP 导出 |
| `sellerinventory-product-analysis` | productAnalysis/query2 SKU 底层（refer_profit 滞后 1 月） |
| `selection-product-research` | Sorftime 替代品 / 市场调研 |
| `selection-feature-demand-validator` | 功能需求验证（强/弱/伪/负 五挡） |
| `cvr-rank-threshold-analyzer` | CVR 观察/危险/确认线 backtest |
| `amazon-listing-health-check` | listing 体检（read-only） |
| `ad-search-term-analyzer` | 搜索词分类（scale_up / promote / negative ...） |
| `new-product-ad-build` | 新品广告架构编排 |
| `rising-product-traffic-followup` | 3/7 天上升信号回看 + 全历史广告审计 |
| `developer-product-inquiry` | 开发诉求转发处理（产品先于广告） |
| `gbrain-knowledge-writer` | 写 GBrain 中文页面（强制中文 + 模板） |
| `amazon-product-line-ops` | 全链路产品线 SOP（D-60 → D90，七阶段） |

注意：skill 中互相引用的 `sku-operating-review`、`ad-ops-action-closure`、`sellerinventory-listing-submission`、`sp-create`、`selection-market-evidence` 不在 `.codex/skills/` 下——它们在 docs/ 或 Codex 内部 memory 里定义，跨技能调用时需查 docs/。

## 5. scripts/ 全景图

### 5.1 顶级 run_*.js（52 个）

**Agent 控制平面（25 个 run_agent_*.js）**——按职责四组：

- **盘点**：`capability_registry`、`control_plane`、`review_queue`、`operating_hub`、`review_evidence`
- **执行**：`command_runner`（allowlist）、`write_execution`（→ `scripts/execute/run_actions.js`）、`execution_feedback`、`effect_review`
- **学习与审计**：`correction_risk`、`autonomy_audit`、`learning_memory`、`handoff_summary`、`closed_loop`
- **无人值守 + 终审**：`readiness_audit`、`completion_audit`、`goal_audit`、`boss_daily_paper`、`unattended_{gate,supervisor,schedule_plan,schedule_install,scheduler_audit}` + `goal_final_audit`

**日运营顶级**（不带 agent_ 前缀）：
`run_today_ops.js`（**最重的总驱动**）、`run_today_tasks.js`（轻量看板）、`run_proactive_audit.js`、`run_external_task_inbox.js`、`run_all_sku_operating_review.js`、`run_old_product_{maintenance,market_evidence_queue,semiauto_pipeline}.js`。

**消息平面**（10 个 wecom_* + 8 个 weixin_clawbot_*）：见 §3.12。

### 5.2 scripts/execute/（live actors，60+ 个）

**写路径核心**：
- `run_actions.js` —— 唯一动作 schema 执行入口
- `run_low_efficiency.js` —— 低效闭环（PATCH 内嵌）
- `auto_adjust.js`（在 repo 根，不在 execute/ 下）—— 见 §12
- `recover_inventory_raw_from_list.js` —— /pm/formal/list CDP 抓取写 raw CSV
- `prefill_activity_apply.js` —— **特例**：纯 DOM 写入，不写文件，无 readback 脚本（要操作员手点）
- `direct_sp_*_bid_update.js`、`approve_overbudget_*.js`、`create_sbv.js`、`create_sb_keyword_manual_collection.js`（新加）

**verify 与回查**：
- `readback_adjustment_entities.js` —— **独立回读**，对比 `adjustments_<date>.json` vs 后端，不一致 exit 2
- `verify_daily_closure_artifacts.js` —— `ops:closure:verify` 后端
- `audit_landed_action_conflicts.js`、`audit_created_campaign_keywords.js`

**KPI / closure**：`evaluate_kpi_recovery_gate.js`、`generate_kpi_recovery_checkpoint.js`、`generate_kpi_recovery_dryrun_decisions.js`、`build_price_full_closure.js`、`generate_month_kpi_operator_digest.js`。

**Fetcher 家族**：`fetch_ad_group_rows`、`fetch_sp_group_detail`、`fetch_ad_sku_summary`、`fetch_sku_ad_product_data`、`fetch_amazon_asset_list`、`fetch_high_efficiency_rows`、`fetch_seller_success_rate`、`fetch_removal_inventory_*`、`fetch_selection_*`（8 路）、`fetch_sif_*`（4 路）、`fetch_season_title_listing_queue`、`fetch_campaign_placement`、`fetch_ad_keyword_placement`、`fetch_product_analysis_query2`。

**Daily deposit 专路**：`inspect_daily_deposit.js`（**入口**）、`quick_daily_core_summary.js`、`generate_wecom_daily_fill.js`、`generate_wecom_weekly_30d_fill.js`、`recover_daily_raw_inputs.js`、`recover_sales_core_raw.js`。

### 5.3 scripts/generators/（pure JSON→JSON）

`generate_proactive_audit_action_schema.js`、`generate_high_efficiency_bid_schema.js`、`generate_over_budget_schema.js`、`generate_overbudget_adgroup_lower_bid_schema.js`、`generate_over_budget_bad_conversion_schema.js`、`generate_system_7day_low_risk_schema.js`、`generate_season_title_action_schema.js`、`generate_season_title_listing_schema.js`。**全部只产 schema，落地走 `run_actions.js`**。

### 5.4 scripts/diagnostics/、maintenance/、reports/（24 个）

详见 [`docs/PERFORMANCE_HYGIENE.md`](PERFORMANCE_HYGIENE.md) 和 [`docs/WORKSPACE_HYGIENE_BASELINE_2026-06-17.md`](WORKSPACE_HYGIENE_BASELINE_2026-06-17.md)。最常用：
- `scripts/diagnostics/review_recent_decisions.js`（跨 AI 审计）
- `scripts/diagnostics/claude_orientation_check.js`（`ops:agent:orientation`）
- `scripts/diagnostics/agent_quality_gate.js`（`ops:agent:quality-gate`）
- `scripts/diagnostics/read_codex_thread.js`（读 Codex sessions，标"待核实"）
- `scripts/maintenance/codex_conversation_guard.js`（Codex 会话备份，excludes auth）
- `scripts/maintenance/run_test_group.js`（按 regex 分组跑 tests）
- `scripts/maintenance/package_scripts_catalog.js`（package.json scripts 目录工具）
- `scripts/maintenance/perf_hygiene.js`（仓库卫生 / 阈值校验）
- `scripts/reports/generate_daily_dashboard.js`（每日 dashboard HTML）
- `scripts/reports/generate_today_adjustment_report.js`（带 run_id 参数）

## 6. src/ 模块图

`src/` 顶层 ~80 个 .js 平铺文件（无 index、无 README，**直接 require by path**），按命名前缀分簇：

| 簇 | 模块 |
|---|---|
| 决策 | `ai_decision`（中央）、`ai_task_decision`、`low_efficiency_decision`、`ad_structure_reuse`、`ad_structure_opportunity`、`high_efficiency_filter`、`low_efficiency_execution_guard` |
| Agent 控制平面 | `agent_{control_plane,capability_registry,operating_hub,learning_memory,correction_risk,unattended_gate,effect_review,external_inbox,daily_workflow,autonomy_audit,execution_feedback,review_evidence}` |
| 价格/预算 | `price_executor`、`price_raise_followup`（新加）、`over_budget_{policy,history,to_actions}` |
| Listing/季节 | `listing_copy_{edit,application,protection}`、`season_{calendar,title_opportunity,gap_audit}`、`sbv_{asset_library,create_flow}`（新加）、`sb_manual_collection_create`（新加） |
| 选品 | `selection_{keyword_research,seasonality,conversion,aba_search_terms,extended_evidence,kpi_evidence,operating_intelligence,product_time_machine}` |
| 老品（新拉） | `old_product_{maintenance,semiauto_pipeline,market_evidence_queue,operator_approval_pack}` |
| 库存/SKU | `inventory_economics`、`local_inventory`、`sku_operating_review`、`sku_review_digest`、`removal_inventory_fields`、`product_profile`、`product_line_ops_profile`（新加） |
| 任务面 | `task_board`、`task_scheduler`、`task_followup_dashboard`、`ai_task_decision` |
| 审计/收口 | `proactive_audit`、`daily_learning`、`daily_mandatory_closure`、`trend_anomaly_detector`、`adjustment_log`、`adjust_lib` |
| 时间/范围 | `ops_time`（新增 `buildOpsTimeContext`）、`execution_scope`（`filterSnapshotForActionSchema`）、`operation_scope`（`analyzeAllowedOperationScope`/`applyAllowedOperationScope`） |
| WeCom/Weixin I/O | `wecom_gateway`、`wecom_file_inbox`、`wecom_ocr_triage`、`weixin_clawbot_http`（新加） |
| 杂 | `activity_apply_prefill`（COUPON empty-clear bug 已修）、`internal_keyword_market`、`ad_keyword_placement` |

### 6.1 src/ 三个子目录

- **`src/briefs/`**：`build_task_cards.js` → `build_ai_decision_brief.js`，把日任务池压成 P0/P1/P2 卡（限制 size，禁原始 payload）。
- **`src/capabilities/`**：动作总线
  - `registry/capabilities.json`（capabilityId、riskLevel、supportsDryRun、requiresApproval、autoExecutable、verifyMethod、cooldownDays，**source of truth**）
  - `orchestrator/{capability_router.js, permission_gate.js}`（路由 + 权限 gate；区分 price_action vs bid_action）
  - `adapters/index.js + 3 个 adapter`（`adv_keyword_update_bid`、`adv_campaign_update_budget`、`review_landing_verify`，外加 `legacy_action_adapter.js` 桥到 `auto_adjust.js`）。
  - **缺口**：registry 里声明了 8+ capability，但只有 3 个 adapter 真覆盖，其余通过 `routeAction` 返回 `routed=false`。
- **`src/pipeline/`**：日运行骨架
  - `stage_registry.js` 定义 16 个有序 stage：preflight → snapshot → daily_task_pool → external_inbox → proactive_operating_audit → old_product_maintenance → season_title_dry_run → low_efficiency_candidates → high_efficiency_rows → sku_ad_form_summary → schema_validate → dry_run → execute_verify_note → daily_learning → trend_anomaly_check → report
  - `DORMANT_COMPONENTS` 显式列出"标记为休眠不算闭环条件"的项（agent_unattended_*, agent_goal_audit, agent_completion_audit, ai_decision_brief_artifact, ad_structure_opportunities_detail, review_evidence_artifact）。
  - `run_context.js`（manifest 写入器）+ `run_stage.js`（单 stage 执行器，统一 status：success/partial/blocked/failed/skipped）。

## 7. data/ 目录形态与读写关系

> **核心心法**：`data/` 是 `run_today_ops.js`（写 raw + manifest + learning）、`run_actions.js` + `auto_adjust.js`（写 schema + adjustments + history）、`run_agent_*` 控制面（写 agent/）三方契约。文件按 **business date** 链：`snapshot → action_schema → adjustments → adjustment_history → daily_learning → agent_closed_loop → agent_handoff → reports/dashboard`。

### 7.1 raw 证据层

| 路径 | 写者 | 读者 |
|---|---|---|
| `data/snapshots/runs/today_ops_<ISO>/{snapshot_<date>.json, manifest.json}` | `run_today_ops.js` | `build_closed_loop_plan.js`, `claude_scope_scan.js`, daily_learning |
| `data/snapshots/snapshot_<date>.json` + `latest_snapshot.json` | `run_today_ops.js` | 几乎所有 skill |
| `data/snapshots/ad_group_rows_*`, `ad_sku_summary_*`, `sku_ad_product_*`, `selection_*` | execute/fetch_*.js | skills, schema 生成器 |
| `data/snapshots/action_schema_<date>_{codex|claude|...}.json` | Codex/Claude/各 generator | `run_actions.js`, audit |
| `data/core_sales/core_sales_<date>.json` | `run_today_ops.js`（`/pm/sale/getBySeller`） | KPI gate, daily_learning |
| `data/daily_manifests/daily_manifest_<date>.json` | `run_today_ops.js` | 跨日比对 |

### 7.2 计划/动作/回读

| 路径 | 写者 | 读者 |
|---|---|---|
| `data/actions/<sku>_<theme>_<date>.json` | 操作员/Codex 手挑 | `run_actions.js`, run_today_ops |
| `data/decision_schemas/` | Codex（操作员请求） | `run_actions.js` |
| `data/schema/action_schema_<theme>_<date>.json` | Codex/Claude（新约定家） | `run_actions.js` |
| `data/adjustments/adjustments_<date>.json` | `run_actions.js`, `run_low_efficiency.js`, `auto_adjust.js`, `direct_sp_*`, `approve_overbudget_*` | `agent_closed_loop`, `review_recent_decisions`, dedupe |
| `data/adjustment_history.json` | `src/adjust_lib.js`, `src/adjustment_log.js`（cooldown 用） | `run_today_ops.js`, `analyze_execution_impact.js`, generators |
| `data/over_budget_history.json` | `src/over_budget_history.js`（capSince 老化） | `run_today_ops.js`, generators |
| `data/tasks/...` | `run_today_ops.js`, `audit_*`, `generate_kpi_recovery_checkpoint.js`, `audit_landed_action_conflicts.js`, `run_all_sku_operating_review.js` | 操作员、agent 流水 |
| `data/tasks/sku_watchlist.json` | 手维护 | `weixin_clawbot_setup`, sku review |

> ⚠️ **三个重叠 schema 货架**——`data/actions/`、`data/decision_schemas/`、`data/schema/` + `data/snapshots/action_schema_*.json` 同 schema，区别只是归属/年代约定，没文档锁。新写 schema 优先放 `data/snapshots/action_schema_<date>_<actor>.json`（标准约定）。

### 7.3 agent 控制平面（`data/agent/`）

每天每种一份 json/md：`agent_closed_loop`、`agent_handoff`、`agent_completion_audit`、`agent_goal_audit`、`agent_readiness_audit`、`learning_memory`、`write_execution` + `write_dry_run`、`review_queue` + `effect_review` + `review_evidence`、`unattended_{supervisor,schedule_plan,schedule_install,gate,scheduler_audit}`、`autonomy_audit`、`capability_registry`、`boss_daily_paper` + `每日结果纸_<date>.md`、`correction_risk`、`codex_schema_review`、`command_results`、`external_inbox` + `external_review_queue` + `external_ledger`、`operating_hub`、`workflow_runtime_report`。还有 `weixin_clawbot_*`（reminders_state、replies_inbox、codex_requests/results、pending_confirmations）和 `unattended_*_task.{log,ps1,vbs}`（Windows Task Scheduler 包装）。

### 7.4 学习与人面

- **`data/learning/daily_learning_<date>.{json,md}`** —— 由 `run_today_ops.js` 写。字段：`run_id`, `businessDate`, `dataDate`, `sources={snapshot, taskPool, actionSchema, dryRun, verify, adjustmentLog, manifest}`, `dataQuality`, `observedPressure`, `kpi`。`decisions.finalRunLanding` 是收口判定真相源（同日多 run 时，**不能**只看 report 文件）。
- 兄弟：`daily_completion_<date>.{json,md}`、`closed_loop_coverage_<date>.json`、`learning/corrections/correction_<date>_<hash>.{json,md}`。
- `data/reports/`：`daily_dashboard_<date>.{html,_chrome.png,_mobile.png}`、`account_trend_visual_*`。
- `data/listing_briefs/<SKU>_listing_revision_<date>.md`：手写。
- `data/developer_requests/<date>_<sku>_*.md`：gitignored，被 `run_agent_boss_daily_paper.js` 读。
- `data/doc_exports/`：xlsx/csv（HJ表格、banjingpin 培训）+ sheets.json。
- `data/exports/`：gitignored 通用导出。
- `data/desktop_reminder/{reminders.json, daily_items.txt}`：gitignored，weixin_clawbot 写。

### 7.5 静态/参考

`data/reference/*.xlsx/.docx`（季节事件源、培训档），`data/season_events_2026.json`、`solar_terms.json`、`solar_term_map.json`、`listing_copy_protected_skus.json`，`data/evals/agent_orientation_cases.json`（orientation 评测种子）。

### 7.6 长期状态根

直挂 `data/` 根：`adjustment_history.json`（~50MB）、`over_budget_history.json`、`product_profiles.json`（per-ASIN）、`listing_cache.json`（PDP 缓存）。

> **`data/attribution/`** 当前**为空**，但 .gitignore 留着、memory 提到——历史 writer 状态待确认（可能已退役或本分支未跑）。

## 8. 写路径 → 回读验证映射

> **总规则**：dry-run 不算落地。`auto_adjust.run` 自己产的 verify 文件是**自指**的（[[feedback_snapshot_verify_self_referential]]）。**真正的回读** 必须独立另一进程读后端。

| 动作 | 写出 | 必须的独立 readback |
|---|---|---|
| `run_actions.js --dry-run <schema>` | `data/adjustments/adjustments_<date>.json` 追加 dryRun:true 行 + 自指 verify 文件 | 不需要 readback；后续 audit 从 adjustments 文件回看 |
| `run_actions.js --execute <schema>` | adjustments 追加 execution events + 自指 verify | **强制**：`node scripts/execute/readback_adjustment_entities.js --date <date> --source-run-id <id>`；landed != total 退 2 |
| `run_low_efficiency.js`（带写） | `data/tasks/low_efficiency_pools_<date>.json` + `low_efficiency_perf_<date>.json` + adjustments 追加（PATCH 内嵌） | `readback_adjustment_entities.js --source-run-id low_efficiency_<date>_*` 然后 `ops:closure:verify -- --date <date>` |
| `build_price_full_closure.js` | `data/snapshots/action_schema_<date>_price_full_closure.json` + `data/tasks/price_full_closure_<date>.{json,md}` | schema 自身不落地，要走 `run_actions.js --execute --source-run-id price_full_closure_<date>_<ts>` 然后 `readback_adjustment_entities.js --source-run-prefix price_full_closure_<date>_` |
| `inspect_daily_deposit.js` | `<rawDir>/daily_deposit_status_<date>.json` + `data/tasks/raw_recovery_queue_<date>.{json,md}` | 复跑 inspect 直到 `missing[]` 与 `suspicious[]` 清空，然后 `ops:closure:verify -- --date <date>` |
| `prefill_activity_apply.js` | **不写文件**，仅 CDP DOM 注入 | **没有** scripted readback。操作员肉眼看 → 点提交 → /pm/list re-fetch 才算落地。已知缺口。 |
| `recover_inventory_raw_from_list.js` | `黄成喆个人数据趋势/原数据/原日数据/<m>-<d>/inv_auto_filtered_<ts>.csv` + `data/snapshots/inventory_formal_list_<date>.json` | 复跑 `ops:deposit:status`；rowCount vs `meta.total` 对账 |
| `generate_proactive_audit_action_schema.js` | `data/snapshots/action_schema_<date>_proactive_recovery_candidate.json` | 同 price_full_closure 链路 |
| `generate_system_7day_low_risk_schema.js` | `data/snapshots/system_7day_low_risk_action_schema_<date>.json` + `data/tasks/system_7day_unadjusted_status_plan_<date>.json` | 同上 |
| `generate_kpi_recovery_checkpoint.js` | `data/tasks/kpi_recovery_checkpoint_<date>.{json,md}` | read-only 聚合；下一动作命令在 `nextChecks[].command` 已写明（一般是 `ops:closure:verify`） |
| `evaluate_kpi_recovery_gate.js` | `data/tasks/kpi_recovery_gate_<date>.json` | read-only gate；进入 checkpoint |
| `dedupe_adjustment_log.js` | 原地重写 `data/adjustments/adjustments_<date>.json`（建 .bak） | 行数前后 diff；`readback_adjustment_entities.js` 仍能匹配（entity id 保留） |
| `generate_wecom_weekly_30d_fill.js` | 不写文件，stdout TSV | 不需 readback；exit 2 = sales-core raw 缺失 |
| Listing copy 提交 | sellerinventory `submitted_pending_review` | 重新 fetch sellerinventory，确认 listing 落地（不能只看 submission） |
| 价格 Ful+Res shortage apply | `apply_price` 表单 | 调度 sellerinventory 列表回查 + .99 结尾确认 + 7d Ful+Res sellable days < 30 |
| 库存便签写 | `/pm/formal/update` URL-encoded | `[由 X 决策]` 前缀；从列表回读便签字段 |

### 8.1 隐含约束

- **2026-05-22 默认日期硬编码**：`build_price_full_closure.js`（DEFAULT_DATE）、`generate_system_7day_low_risk_schema.js`（argv[2..5] 默认）。harness 必须显式传 `--date`，否则会写错日期。
- **`run_actions.js` 时间上下文**（新加）：`--business-date / --data-date / --source-run-id` flags，环境变量 `AD_OPS_BUSINESS_DATE / AD_OPS_DATA_DATE / AD_OPS_SOURCE_RUN_ID`，传到 `auto_adjust.run({timeContext, sourceRunId})`。
- **`recover_inventory_raw_from_list.js`** 文件名 `inv_auto_filtered_<ts>.csv` 与 `inspect_daily_deposit.js` 期望模式必须一致，否则 deposit 分类不到。

## 9. discovery/ 与浏览器协同（CDP）

- **`discovery/`** 是**只读沙盒**（`READ_ONLY=1` 强制），用来反向工程 `adv.yswg.com.cn` / `sellerinventory.yswg.com.cn` 的数据源。**不进生产**：`run_today_ops.js`、`export_snapshot.js`、`auto_adjust.js`、`src/ai_decision.js`、extension panel **都不读它的产物**。
- **`discovery/lib/cdp.js`** 是底层 CDP 客户端：靠 `ws` 包打 `http://127.0.0.1:9222`（默认；env `DISCOVERY_BROWSER_URL` 可覆盖）。导出 `openTab/closeTab/cdpSession/withSession/navigate/evaluate/pageInfo/scroll/clickAt/screenshot`。**没有 puppeteer/playwright 依赖**——纯 node http + ws。
- 工作流（README.md）：`discover_routes` → `probe_report_page` → `infer_fields` → `rank_sources` → `build_questions` → `validate_endpoint`。**Promotion gate**：confirmed evidence + fixture + test + integration doc + rollback path 才能从 `discovery/output/` 升到生产。
- 当前 `discovery/output/` 最新一批是 2026-05-13；活跃度待确认。
- README 提到的 CDP 助手能力（openTab/closeTab/evaluate/pageInfo/scroll/clickAt/screenshot）作为 generic web-access fallback 加进了项目 README。

## 10. GBrain 速查（`D:\ad-ops-brain`）

### 10.1 Vault 顶层

```
D:\ad-ops-brain\
├── 00-先看这里.md / 00-使用边界.md / 00-命名规则.md / 00-页面字段规范.md
├── 01-SKU当前结论/   ← 单 SKU 当前运营结论（live state）
├── 02-决策记录/       ← 日期化决策日志
├── 03-复盘/           ← 复盘 / 效果复盘
├── 04-标准打法/       ← 58 份规则 playbook（核心）
├── 05-名称映射/       ← SKU/ASIN/campaign id 对应
├── 06-来源摘要/       ← 证据摘要 / 引用索引
├── 07-验收问题/       ← QA 题库
├── 08-模板/           ← 模板
├── 90-脚本/           ← run-gbrain.ps1 + start-gbrain-mcp/autopilot
├── advertising/       ← 广告专区（非编号）
└── .runtime/gbrain/   ← 自带 node_modules（express、cors、@jsquash/avif、heic-decode）的 GBrain Node 服务
```

### 10.2 04-标准打法 高频 playbook

- **`广告调整完整结构.md`** —— 任何 ad action 的强制入口模板（goal/scope/scale/coverage/intensity/readback/3-7 天验收）
- **`SKU缺流量全链路检查.md`、`SKU增长覆盖面合格线.md`、`SKU诊断路线与动作力度.md`、`SKU完整诊断结构.md`、`SKU问题覆盖面总框架.md`**
- **`广告结构检查-system与owned边界.md`、`广告组分型规则.md`、`高效词放量.md`、`超预算闭环.md`、`广告恢复完整诊断结构.md`、`日常低效词闭环标准.md`、`新品广告架构.md`、`提价后的广告联动.md`**
- **`产品列表查询保留原始筛选项.md`** —— sellerinventory `/pm/list` `/pm/formal/list` 默认 filter 保留规则（[[feedback_query_pm_list_keep_filters]]）
- **`每日数据沉淀完整性与库存恢复.md`、`每日数据沉淀HTML质量.md`** —— daily deposit 数据质量
- **`Claude-Codex交叉验证与GBrain调用.md`** —— 跨 AI 协议
- **`GBrain-PGLite-WASM初始化恢复.md`** —— GBrain 失效时**先读这个再回退裸文件搜**
- 季节/库存救火/老品/listing 提交各有专章

### 10.3 调用入口

```powershell
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<keyword>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 doctor --json
```
- 失败时顺序：`doctor --json` → 看 PGLite/WASM → 读 `GBrain-PGLite-WASM初始化恢复.md` → 退回 `rg -n "<keyword>" D:\ad-ops-brain` 并标"raw GBrain file 证据"。
- `doctor --json` 的 `sync_freshness=stale|failed` 时索引仍能用，但最新 markdown 改动可能没进，要加裸搜。
- **绝对不要写**：原始 API 响应、cookie/token/JWT/CSRF、命令日志、未脱敏字段。

## 11. 当前 WIP 主题（截至 2026-06-19）

工作树有大量 modified + 一批 untracked，但**没有未提交的破坏性改动**。主题归为以下条线：

1. **老品半自动维护流水线**（新拉，**最大动作**）
   - 新模块：`src/old_product_{maintenance,semiauto_pipeline,market_evidence_queue,operator_approval_pack}.js`
   - 集成到 `run_today_ops.js`：`buildOldProductMaintenanceArtifacts()` 产 10 个 task 文件（`old_product_maintenance_<date>.{json,md}`、`market_evidence_queue`、`candidate_confirmation`、`pending_confirmation_actions`、`manual_suggestion_queue`、`watchlist_delta`、`sku_watchlist` merge、`approved_execution_handoff`、approved action schema）
   - 命令：`ops:old-products` / `:market-evidence` / `:semiauto`

2. **价格上调后的吸收期 GBrain 守卫**
   - 常量：`LARGE_POST_RAISE_UNITS_1D=3 / _3D=6 / _7D=10`、`PRICE_RAISE_ABSORPTION_DAYS=7`
   - 新函数：`postRaiseSalesEvidence()`、`recentPriceRaiseForSku()`、`buildGbrainActionGuard()`（加载 `D:\ad-ops-brain\04-标准打法\*提价*广告联动*.md`）
   - 双写：`scripts/run_today_ops.js` + `scripts/execute/build_price_full_closure.js`（**两份硬编码可能漂移**）
   - 新模块：`src/price_raise_followup.js`，挂在 run_summary 的 `priceRaiseFollowup`

3. **SBV / SB 手动合集广告新建**
   - 新文件：`scripts/execute/{create_sbv.js, create_sb_keyword_manual_collection.js, direct_sp_*_bid_update.js}`
   - 新模块：`src/sbv_create_flow.js`、`src/sb_manual_collection_create.js`
   - 新 SOP：`docs/SBV_CREATE_WORKFLOW.md`
   - 命令：`ops:sbv:create` / `ops:sbkw:create`
   - 大量 dated SBV / owned-base-structure action JSON 在 `data/actions/`（~170 条）

4. **Codex/Claude 平级 cross-validation 落地**
   - 新文档：`docs/CLAUDE_CROSS_VALIDATION_GUIDE.md`、`CLAUDE_DIRECTION_PACK.md`
   - 新诊断：`scripts/diagnostics/{claude_orientation_check.js, agent_quality_gate.js, read_codex_thread.js, codex_conversation_guard.js, run_codex_automation_health.js}`
   - 命令：`ops:agent:orientation`、`ops:agent:quality-gate`、`ops:codex:health`

5. **WeiXin clawbot 接入**（个人微信）
   - 新文件：`src/weixin_clawbot_http.js`、`scripts/run_weixin_clawbot_*`、`run_weixin_codex_gateway.js`
   - 新文档：`docs/WEIXIN_CLAWBOT_REMINDERS.md`、`config/weixin_clawbot.example.json`
   - 8 条 npm 命令见 §3.12

6. **Agent 监督 + effect review 加固**
   - 新模块：`src/agent_effect_review.js`、`scripts/run_agent_unattended_supervisor.js`（带 tests）
   - 扩展：`run_agent_handoff_summary`、`run_agent_goal_audit`、`run_agent_readiness_audit`、`run_agent_completion_audit` + `run_goal_final_audit`

7. **`run_actions.js` 时间上下文管线**
   - 新 flags：`--business-date / --data-date / --source-run-id`
   - 新 envs：`AD_OPS_BUSINESS_DATE / AD_OPS_DATA_DATE / AD_OPS_SOURCE_RUN_ID`
   - 通过 `src/ops_time.buildOpsTimeContext` 串到 `auto_adjust.run({timeContext, sourceRunId})`

8. **`auto_adjust.js` SB 状态写回 + 行级输出扩展**
   - SB enable/pause 后 `STATE.sbCampaignRows[].state` 同步刷成 `'1'/'2'`（entityType==='sbCampaign'）
   - run() result 现在多导出 `kwRows / autoRows / targetRows / productAdRows / sbRows / sbCampaignRows / sp7DayUntouchedRows / sb7DayUntouchedRows`，方便下游回读

9. **`activity_apply_prefill.js` empty-coreKeywords 清空 fix**
   - 之前 optionalText() 把空字符串吃掉 → core_keywords 不能清空。改成 hasOwnAny + text() + slice(0,100)，空串也能 explicit 清。

10. **AGENTS.md / SKILL.md 操作铁律加固**
    - GBrain `## GBrain 图谱链接` 分组规则（相关 SKU/相关决策/相关打法）
    - 广告调整完整结构.md 作为 canonical entry standard
    - **覆盖不足** 强制规则
    - Codex 内嵌浏览器作为 UI-visible read-only fallback

11. **README CDP fallback note** + `ops:codex:health --probe --probe-model gpt-5.5` 示例

12. **product-line ops profile** 新拉（`src/product_line_ops_profile.js`、`build_product_line_ops_profile.js`、`ops:product-line:profile`、`.codex/skills/amazon-product-line-ops/`）

13. **节日/事件主题 backlog**（dated action JSON）：250th/YEL1320、fathers_day christian、juneteenth cas4030、world-cup yut3183/yut2847、retirement beu0541 等

14. **数据未提交批**：~170 条 `data/actions/*.json`（2026-06-08..18）、~70 条 `data/learning/corrections/correction_*`、`adjustments_2026-06-09..18.json`、`daily_learning_2026-06-09/11/15/16`——是否打包成一个 commit 还没决定。

15. **根目录 / data/ 暂留垃圾**（commit 前先决定删/移）：
    - 根：`__out`、`7`、`__tmp_check_payload_types.js`、未跟踪的 `CLAUDE.md`
    - `data/`：`temp_check_fields.js`、`temp_check_page.js`、`temp_find_campaign.js`、`temp_find_sb_group.js`、`temp_find_target.js`、`temp_find_target_campaign.js`、`temp_nav_sb.js`、`temp_query_sb_kw_group.js`、`temp_test_adv.js`、`temp_test_sku_summary.js`

> 最近 9 天（2026-06-09 起）只有 `chore:` 加固类 commit。功能开发停在 2026-06-08 那波（Codex skill 上架 + automation tools），之后是测试/卫生/无人值守闭环加固。如果你不知道该改哪条线，**默认认为现在是稳定期**，先确认你接到的请求属于上面 15 条之一。

## 12. auto_adjust.js 当前角色

**Live executor，不是死代码**。memory 里 `project_auto_adjust.md` 标的"v1 已废弃"指的是另一个东西——浏览器扩展面板（`manifest.json` + `background.js` 调 `https://api.anthropic.com` + `content/auto-adjust-engine.js` + `pages/auto-adjust-panel.js`），**不是**这个根目录下的 Node 脚本。命名碰撞。

- 文件：`D:\ad-ops-workbench\auto_adjust.js`，2399 行；exports `run, groupByAccountSite, buildSpCreatePayload, buildSbvCreatePayload, buildSpAppendTargetPayload, buildStateToggleRequest, hasRecentCandidateBlock, missingStateRowIsSuccess, stateValueForEntity, stateEntityRowId`
- `run(options)` 接收：`dryRun, timeContext, sourceRunId, site, actionSchemaFile, snapshotFile, fastScope`；也认 `DRY_RUN=1` env
- **决策外部化**：`loadExternalActionSchema()` 加载 `action_schema_<date>_<actor>.json`，`hasRequiredVerification` 拦截缺 verifySpec 的 → status=`execution_gate:missing_verify_spec`
- **执行通道**：CDP WebSocket eval（`ws://127.0.0.1:9222/devtools/page/<adPageId>`）→ `execAdApi()` 走 page 里的 `window.fetch`（带 XSRF cookie 注入）→ `verifyLanding()` 真后端再读
- **artifacts**：`SNAPSHOTS_DIR/{plan_<date>.json, seven_day_untouched_<date>.json, execution_dry_run_<date>.json, execution_verify_<date>.json}`
- 调用方：`scripts/run_today_ops.js`（dry+execute 两次）、`scripts/execute/run_actions.js`、`src/capabilities/adapters/legacy_action_adapter.js`、`src/sbv_create_flow.js`、4 个 tests
- 文档定位：`docs/ROOT_FILE_MAP.md` 标 "Main Node execution orchestrator. Kept in root because tests and execution scripts import it directly."；`docs/CODEX_MINIMAL_CLOSED_LOOP.md` 描述 "validates actions, executes, verifies, writes notes, and writes summary."

## 13. 高频踩坑清单

| 坑 | 实操 |
|---|---|
| 把 GBrain / 旧 snapshot 当 live state | 必须 verify live；做不到要明说"missing live verification" |
| API success 当成落地 | 必跑 `readback_adjustment_entities.js`；landed != total 退 2 |
| `auto_adjust` 自产的 verify 文件当回读 | 它是自指的（[[feedback_snapshot_verify_self_referential]]）。要独立读后端 |
| `prefill_activity_apply.js` 走完就当落地 | **没有** scripted readback，操作员必须点提交并 /pm/list re-fetch |
| sellerinventory `/pm/list` 默认 filter 被清掉 | [[feedback_query_pm_list_keep_filters]]——保留原 request body 和 filters，先查 GBrain 诊断词 |
| `build_price_full_closure.js` / `generate_system_7day_low_risk_schema.js` 默认日期 2026-05-22 | harness 必须显式传 `--date`，否则写错日期 |
| Daily learning 看最后一次 run 误判 closure | 看全天累计 + `decisions.finalRunLanding`，**两面镜子**（[[feedback_daily_learning_two_lenses.md]]） |
| 把 daily deposit 当广告执行入口 | `inspect_daily_deposit.js` 是数据收口，不写广告动作；先 `ops:deposit:status` |
| 用 SP campaign enable 视为已开 | 已知坑：可能 API success 但仍 paused，记 `not_landed` |
| 跨多 SKU/产品池被一份份深扒 | 先做经营产出分类，再分组（达成/有望/被卡/不匹配/需 live 验证） |
| 覆盖率 < 50% 的方案被叫"closed-loop" | 必须写 `覆盖不足`；不得叫 sufficient/complete/closed-loop |
| 跨 AI 互相覆盖产物 | 写新归属 schema，保留对方记录；用 `review_recent_decisions.js` 互查 |
| 调 `--actor` 漏带 | 默认 codex；Claude 必须 `--actor claude`；env `RUN_ACTOR` 也认 |
| 浏览器没起就跑 ad fetcher | `chrome:operator` + `chrome:ready`；adv/sellerinventory/selection 都登录后再 fetch |
| 用裸 grep 替代 GBrain（doctor 没坏时） | doctor 没 stale 就用 wrapper；stale 才加裸搜并标"raw GBrain file 证据" |
| 一次性脚本绕过标准管道 | [[feedback_dont_bypass_standard_pipeline]]——规则要写进代码 [[feedback_rules_must_land_in_code]] |
| 历史调整看动作名而非数字 | [[feedback_verify_adjustment_history_before_acting]]——看 actual `before/after value` |
| 跨天 session 失效就停下问用户 | 现在已能自动刷新 [[feedback_daily_ops_session_expiry]] |
| 提交前自查 | [[feedback_self_review_before_commit]]——先扫自己留下的拖累 |

## 14. 维护守则

**何时刷这份文档**：

1. **每月一次**：跑一遍 §3.1-3.13 的 npm scripts 抽样，看看是否有新加/删除（用 `node scripts/maintenance/package_scripts_catalog.js`）
2. **当新增了**：
   - `.codex/skills/<name>/SKILL.md` 新技能 → 改 §4
   - 新一条 npm `ops:*` 命令 → 改 §3 对应小节
   - 新 capability adapter（`src/capabilities/adapters/`） → 改 §6.1
   - 新 write 路径或 verify 链 → 改 §8
   - 新 GBrain 04-标准打法 高频 playbook → 改 §10.2
3. **当 WIP 主题闭环了**（§11 中的某条 commit landed 且 review 完毕） → 移除该条或合并
4. **当出现新踩坑**（同样的错连犯两次，或 user feedback memory 写了新条）→ 加进 §13
5. **当某 src/ 模块被删/改名/拆库** → 改 §6
6. **不要做的事**：
   - 不要把这份文档变成 changelog（用 `git log` 或 `docs/releases/`）
   - 不要把 CLAUDE.md/AGENTS.md 内容复制粘贴进来——应该 reference 之
   - 不要 inline 巨表（npm scripts、capability registry）的所有细节——给入口 + 关键字段 + 命令查询路径

**自动化 drift 检查**（已实现，2026-06-19）：

```bash
npm run docs:onboarding-drift            # 人类可读输出，漂移时 exit 1
npm run docs:onboarding-drift -- --json  # JSON 输出
```

`scripts/maintenance/onboarding_pack_drift_check.js` 比对本文档断言的硬数字（npm scripts 数、skill 数、`run_*.js` 数、`src/` top-level js 数、capability adapters 数、pipeline stages 数、WIP 时间戳天数、CLAUDE.md/AGENTS.md 是否还引用本文档、关键文件是否存在）和真实状态。可挂 CI 或 pre-commit hook。每改一处文档断言，同步更新脚本顶部的 `EXPECTED` 常量。

---

> **End of pack.** 这份文档由 onboarding workflow（2026-06-19）一次性产出，覆盖 15 个维度的并行精读结果。结合 [`CLAUDE.md`](../CLAUDE.md) 读序、[`AGENTS.md`](../AGENTS.md) 行为铁律、`docs/CLAUDE_DIRECTION_PACK.md` 动态指南，任何 Codex 或 Claude 会话冷启动 5 分钟内即可达到可执行状态。









