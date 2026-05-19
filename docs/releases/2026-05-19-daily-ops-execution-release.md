# 2026-05-19 日常运营执行闭环发布

## 概要

本次发布把 2026-05-19 的日常运营闭环、证据链和执行产物集中归档。当前流程已经覆盖低效清理、超预算处理、可控预算恢复、季节性 listing/title 检查、高效组扩量复盘，以及可追溯的 daily learning。

## 核心更新

- 日常运营执行前必须完成三系统 readiness：广告后台、sellerinventory、selection 均可用后，才允许声明可执行。
- 低效清理不再只看短窗口，改为结合 3d/7d/15d/30d 压力判断，并把 cooldown、止损线、继续浪费等经验写入 daily learning。
- 超预算处理拆成两层：对无效 productAd 做精确暂停；对仍有转化且利润空间可控的 campaign 做预算恢复。
- 高效组复盘和执行产物保留来源行、dry-run 过滤结果、真实执行 summary，以及执行后的回查验证。
- 季节性工作补齐 season gap audit、season title dry-run、listing 队列拉取、listing schema 生成、保护 SKU 处理、季节状态标签执行汇总。
- 产品和关键词判断可以读取 selection keyword conversion 与 ABA search term 作为市场证据，但 selection 数据仍只做只读辅助，不直接触发花费动作。
- 开发/产品转发诉求新增独立 Codex skill 和持久归档路径，方便按产品判断、动作状态、跟进节点输出运营可直接发送的回复。
- daily learning 和 dashboard 增加最新执行 run、全天落地、最后一轮落地、动作归因、次日 carry-forward 等运营闭环字段。

## 2026-05-19 主要产物

- 日常学习：`data/learning/daily_learning_2026-05-19.md`
- 日常看板：`data/reports/daily_dashboard_2026-05-19.html`
- 超预算 productAd 暂停 schema：`data/snapshots/action_schema_overbudget_productad_pause_2026-05-19_codex.json`
- 超预算可控预算恢复 schema：`data/snapshots/action_schema_overbudget_controlled_budget_up_2026-05-19_codex.json`
- 高效组复盘：`data/tasks/high_efficiency_execution_summary_2026-05-19.md`
- 跑偏词审计：`data/tasks/offtarget_keyword_audit_2026-05-19_v2.md`
- 买家搜索词候选：`data/tasks/customer_search_term_action_candidates_2026-05-19.md`
- 季节标题全量检查：`data/tasks/season_title_dry_run_2026-05-19_fullcheck.md`

## 验证记录

- `npm run chrome:debug`
- `node scripts\execute\run_actions.js data\snapshots\action_schema_overbudget_productad_pause_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --dry-run --full-scope`
- `node scripts\execute\run_actions.js data\snapshots\action_schema_overbudget_controlled_budget_up_2026-05-19_codex.json --snapshot data\snapshots\latest_snapshot.json --dry-run --full-scope`
- `node scripts\reports\generate_daily_dashboard.js 2026-05-19`
- `node -e "JSON.parse(require('fs').readFileSync('data/learning/daily_learning_2026-05-19.json','utf8'))"`
