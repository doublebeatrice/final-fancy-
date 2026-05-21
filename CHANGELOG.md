# Changelog

## v1.2.1 - 2026-05-21 选品证据与闭环运营增强

- Added the read-only `ops:selection:keyword-research` capability for Amazon front-search keyword research. It builds direct competitor, scene competitor, traffic-bridge, excluded-ASIN, candidate-keyword, and next-validation evidence before ABA and keyword-conversion checks.
- Registered `selection::market_evidence::keyword-research::read` in the agent capability registry, command-runner allowlist, external inbox evidence requirements, operating hub task plan, README, handoff runbook, and product-market evidence stack.
- Clarified the boundary: keyword research is not the AI ASIN pipeline, different category is not an automatic exclusion, unrelated buyer intent is excluded, and the report cannot directly create ads, raise bids, raise budgets, or change listing/price/inventory.
- Added the read-only `ops:selection:keyword-seasonality` capability for Google Trend, market overview, competitor ASIN pressure, buyer search-term expansion, and market-window risk.
- Registered `selection::market_evidence::keyword-seasonality::read` in capability registry, operating hub, command runner, review evidence, SKU operating review, README, AGENT, handoff runbook, control-plane docs, and architecture docs.
- Clarified that keyword seasonality is market-window evidence only and cannot directly trigger ads, price, listing, replenishment, or clearance actions.

## v1.2.0 - 2026-05-19 智能代理化运营中枢

- 新增智能代理台账：把每日运营任务、外部临时诉求、动作授权、效果复查承诺统一登记到 `data/agent/agent_ledger_<date>.json`。
- 新增外部任务入口：可把开发、产品、运营、库存、关键词、listing、价格等临时消息标准化成可跟进任务卡。
- 新增能力注册中心：登记新接口的读写属性、风险等级、字段契约、探针命令、预演方式和写后回查要求。
- 新增自主运营中枢：合并每日台账、外部任务、到期复查队列和能力补齐任务，输出当天优先级、所需能力和下一步命令计划。
- 新增复查证据与效果复查链路：支持广告、库存、利润、选品关键词转化、ABA 搜索词证据合并，避免只看广告数据就过早关闭任务。
- 新增只读命令执行器：只运行中枢标记为可自动执行的白名单证据命令，并在输出文件缺失时按失败回填，避免假闭环。
- 新增低风险写入编排器：默认只预演，显式 `--execute` 且台账动作全部通过授权后，才串联真实写入、落地回查和调整日志。
- 新增命令结果回填：把证据命令、复查判断、失败原因、输出文件写回任务状态和历史。
- 新增中文交接摘要：把今日队列、自动证据、阻塞项、复查结论和写入链路压成早上可直接检查的 Markdown。
- 新增智能代理总编排入口：一次串联中枢、只读证据、低风险写入编排、结果回填和中文交接，并提供不触碰真实后台的闭环自测。
- 同步 README、智能代理控制面文档、根目录文件地图和测试入口，覆盖任务状态、授权边界、效果复查、能力补齐、只读自动执行和后续扩展边界。

## 2026-05-19

- 完成 2026-05-19 运营发布归档，覆盖低效清理、超预算 productAd 无效花费暂停、超预算可控预算恢复、季节状态标签、高效组出价复盘和 daily learning 更新。
- 新增 `developer-product-inquiry` 工作流和持久诉求归档，用于处理开发/产品转发消息，并输出简短、可直接发送的运营回复。
- 新增 selection ABA search term 和 keyword conversion 证据源，用于产品/关键词判断；selection 数据保持只读，不直接触发执行动作。
- 补齐季节性 listing-copy 保护规则、listing 申请执行/撤回辅助、保护 SKU 处理，以及 season-title action/listing schema 生成器。
- 增加高效组复盘/执行支持、广告结构机会审计、买家搜索词候选提取、跑偏词审计等任务产物。
- 强化日常运营质量字段：`dataQuality`、`actionQuality`、`runQuality`、最后一轮落地、全天动作归因，避免把脚本成功误判为运营闭环完成。
- 更新 Codex 运行手册和运营文档，明确全链路执行、三系统 readiness、产品市场证据、季节性 listing copy、超预算/低效处理边界。

## 2026-05-18

- Added selection-system login readiness and the read-only `ops:selection:keyword-conversion` data source for market keyword conversion evidence.
- Added keyword conversion report fields for coverage, data freshness, market quality, cost risk, multi-strategy CPC/CPA/ACOS, and cross-validation requirements.
- Made backend recovery part of the daily deposit run instead of stopping on the first abnormal preflight.
- Added ad API retry/recovery for HTML, `419`, `Page Expired`, and login-page responses during snapshot export.
- Changed multi-source ad table capture so one noncritical ad subtable failure is recorded without discarding the whole daily snapshot.
- Completed the 2026-05-18 daily deposit with a fresh snapshot, canonical visual HTML, raw CSV layer, seller success rate, task board, proactive audit, and manifest.
- Split `run_today_ops.js` snapshot mode from operation mode so `--execute --mode full-snapshot` preserves full-snapshot capture.
- Removed the silent default 120-listing cap from full-snapshot listing fetch; `AD_OPS_LISTING_FETCH_LIMIT` is now an intentional cap.
- Added `dataQuality`, `actionQuality`, `runQuality`, and `operatingClosure` to daily run/learning outputs so script success cannot be mistaken for a completed operating loop.

## 2026-05-16

- Added the `developer-product-inquiry` Codex skill for forwarded developer/product requests.
- Defined short triggers: `开发诉求` and `开发`.
- Standardized developer-request handling around product-level diagnosis, evidence, execution status, follow-up checkpoints, and human-ready operator replies.
- Added the durable request archive path `data/developer_requests/` for forwarded-message handling records.

## 2026-05-13

- Added the `daily-data-deposit` Codex skill to standardize the daily data deposit workflow.
- Defined the raw input contract for sales core spreadsheets, inventory CSV exports, and ad full export CSVs.
- Documented the detailed HTML archive structure needed for a long-term business database, including SKU pools, ad detail, inventory detail, seasonal context, and learning notes.
- Added release notes for the daily deposit skill and daily reminder workflow.

## 2026-05-06

- Enforced the Codex-only execution boundary: real executable actions now require approved decision metadata, Codex/manual approval, and a Codex/manual action source.
- Blocked generator, rule-generator, and provisional task-board outputs from entering the real execution path without explicit Codex action schema approval.
- Renamed provisional task-board execution semantics to `boardExecutableHint` / `taskBoardSuggestedExecutable` so task priority hints cannot be confused with real execution approval.
- Updated generator scripts to emit candidate/review-only action metadata instead of executable-looking strategy or Codex-like sources.
- Added regression coverage for generator candidates, missing approval metadata, provisional policy sources, and valid Codex-approved schemas.
- Added daily task board, season gap audit, daily learning, adjustment log, and stagnant-inventory rule artifacts to the committed workbench state.
