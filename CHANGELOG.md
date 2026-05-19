# Changelog

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
