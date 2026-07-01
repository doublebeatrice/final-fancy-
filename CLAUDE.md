# CLAUDE.md

Claude Code working in `D:\ad-ops-workbench` should start here.

This file is a short routing map, not a changelog. If anything conflicts, follow the user's latest request first, then `AGENTS.md`, then this file.

## Read Order

1. `README.md` for the current project overview and common commands.
2. `AGENTS.md` for mandatory agent behavior, GBrain, evidence, execution, and coding rules.
3. `docs/CLAUDE_DIRECTION_PACK.md` for the short operating compass and update model.
4. `docs/CLAUDE_CROSS_VALIDATION_GUIDE.md` for Claude/Codex cross-validation workflow.
5. `docs/AI_DECISION_BOUNDARY.md` for the AI/script/panel boundary.
6. `docs/AI_DECISION_ENTRY_POINTS.md` for Codex and Claude attribution rules.
7. `docs/CODEX_HANDOFF_RUNBOOK.md` for run order, read paths, and troubleshooting.
8. `docs/AI_ONBOARDING_PACK.md` for the cold-start全景图: npm scripts全表, skills目录, scripts/全景图, src/模块图, data/读写关系, 写路径→回读映射, 当前 WIP 主题, 高频踩坑.
9. The relevant `.codex/skills/<skill>/SKILL.md` or GBrain playbook for the specific business task.

## Operating Rules

- The business goal is earned commission through real operating profit, sales quality, inventory health, and bonus-relevant KPI outcomes.
- For ad-ops, SKU, ASIN, listing, product, advertising, developer-request, or review tasks, search `D:\ad-ops-brain` before execution. State the searched keywords, whether prior conclusions were found, and whether the answer uses live evidence, local snapshots, GBrain history, or a mix.
- Never present GBrain or old local snapshots as current live state. If current state matters, verify live or say live verification is missing.
- Product goal, market evidence, listing/price/inventory receiver capability, and historical converting traffic come before bid, budget, keyword, campaign, or listing actions.
- Dry-run success and API success are not landed success. Any write path must be verified by reading the backend again.
- Daily deposit is a data-closure workflow, not an ad/listing/price execution workflow. Start with `npm run ops:deposit:status -- --date <YYYY-MM-DD> --json`.
- Do not store cookies, tokens, JWT, CSRF, XSRF, Inventory-Token, or raw API secrets in docs, GBrain, or committed files.

## GBrain Call Protocol

For business tasks, Claude must do more than one narrow search. Search four angles before deciding:

1. Object terms: SKU, ASIN, campaign, ad group, keyword, product line, or seller/account.
2. Workflow terms: listing, advertising adjustment, daily deposit, developer request, selection, price, inventory, review.
3. Failure-mode terms: not landed, readback, stale snapshot, default filter, blocked, no traffic, no clicks, conversion loss.
4. System/route terms when relevant: `adv`, `sellerinventory`, `selection`, `/pm/list`, `/pm/formal/list`, `/keyword/findAllNew`.

Use the wrapper when available:

```powershell
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 search "<keyword>"
D:\ad-ops-brain\90-脚本\run-gbrain.ps1 doctor --json
```

If GBrain search fails, run `doctor --json`; if PGLite or WASM initialization fails, read `D:\ad-ops-brain\playbooks\GBrain-PGLite-WASM初始化恢复.md` before falling back to raw file search.

If `doctor --json` reports `sync_freshness` as stale or failed, indexed search may still work but may not include the newest Markdown changes. In that case, also run raw file search such as `rg -n "<keyword>" D:\ad-ops-brain` and label the result as raw GBrain file evidence.

## Claude As Peer Actor

Claude and Codex are peer AI decision entry points. A run is driven by one actor at a time.

- Claude-run action schemas use `data/snapshots/action_schema_<YYYY-MM-DD>_claude.json`.
- Claude-approved actions must include `approvedBy: "claude"` and `actionSource` containing `"claude"`.
- Use `--actor claude` when Claude is driving a daily run.
- To review Codex work, use read-only evidence and the recent-decision reviewer. Do not silently overwrite Codex output; produce a new finding, critique, or Claude-attributed schema.

Useful commands:

```powershell
npm run chrome:operator
npm run chrome:ready
npm run ops:agent:orientation -- --actor claude --task "<operator request>"
npm run ops:agent:quality-gate -- --actor claude --task "<operator request>"
npm run ops:today -- --mode full-snapshot --actor claude
npm run ops:today -- --execute --mode full-snapshot --actor claude
node scripts/diagnostics/review_recent_decisions.js --by codex --days 7
node scripts/maintenance/package_scripts_catalog.js --prefix ops:agent
```

## Cross-Validation Habit

### 核心原则：有源必查，不允许有源不查

手里能触达的数据源（GBrain 历史、live API、本地快照、后台面板、广告报表、sellerinventory 面板等），每个与当前结论相关的源都必须主动去查。不是"查一个够了剩下标注未验证"，而是"能查的全查，查完再出结论"。

强制行为：
1. 下结论前，先列出当前问题涉及哪些可用数据源。
2. 逐个查证，不能跳过任何一个可触达的相关源。
3. 如果某个源确实不可达（API 挂了、权限不够、数据不存在），明确说明"XX 源不可达，原因是 YY"，这才是合理的缺口——而不是"我没想到要查"。
4. 多源结果一致 → 高置信度结论。多源结果矛盾 → 必须深挖矛盾原因，不能挑一个顺眼的用。

数据源是活的，要持续扩充：
- 在排查或执行过程中，发现某个端点、报表、面板、日志路径能提供可靠信号，主动记录下来（写入 memory 或 docs），下次同类问题直接纳入验证源清单。
- 验证源清单不是一成不变的固定表，而是随着工作经验积累不断生长的网络。每解决一个新问题，问自己："这次用到的源，下次同类场景是不是也该查？"如果是，就固化进来。

### 方法一：对抗式审查（Adversarial Review）

对自己得出的初步结论，主动找反面证据试图推翻：

- 结论说"该词低效应否定" → 主动查该词历史出单、季节性、关联 ASIN 转化
- 结论说"该 SKU 没流量" → 主动查是否暂停、是否有自然流量、是否被价格/库存卡住
- 结论说"涨价可行" → 主动查竞品价格带、历史涨价后转化变化、当前排名趋势

如果反面证据能动摇结论，降级为"待确认"并列出需要补充验证的具体步骤。

### 方法二：第一性原理（First Principles）

不要从中间环节推结论，回到根因链。用三层归因结构：表层指标 → 中层排查方向 → 核心根因。

标准归因对照（老品下滑场景）：

| 表层指标 | 中层排查方向 | 可能的核心根因 |
|---------|------------|--------------|
| 销量降+点击率走低 | 流量渠道变动、关键词排名下跌、广告曝光不足 | 断货导致权重流失 / 广告预算出价管控不当 / 竞品抢占自然流量 |
| 销量降+转化率走低 | 差评增多、Listing 老旧、定价无优势、竞品促销 | Listing 长期未优化 / 差评处理不及时 / 定价策略滞后 |
| 利润下滑（销量正常） | ACoS 偏高、广告占比过高、库存积压 | 广告结构不合理 / 备货预测失误 / 未及时调整售价 |

拆解规则：
- 销量下滑 → 不是直接加预算，而是先拆：曝光跌了？点击率跌了？转化率跌了？哪个环节断了？
- ACOS 飙高 → 不是直接降 bid，而是先拆：CPC 涨了？转化率跌了？客单价变了？竞争加剧了？
- 广告没花完 → 不是直接提 bid，而是先拆：曝光够吗？关键词匹配对吗？竞价排名在哪？

每一层拆解都要有对应的数据佐证，不能靠假设跳过中间环节。每个 SKU 仅锁定 1-2 个核心根因，附带数据支撑，不要归因散弹。

### 方法三：任务拆分 + Subagent 并行验证

面对涉及多个 SKU、多个维度、多个数据源的复合任务时：

- 将任务拆分为独立子问题
- 用 Subagent（Agent tool）并行查证不同维度
- 汇总时对比各子结果是否一致，不一致的点单独标记并深挖

示例：评估 10 个 SKU 的广告健康度 → 拆成"各 SKU 出单词覆盖率"、"各 SKU ACOS 趋势"、"各 SKU 曝光/点击变化"三路并行查，汇总时看哪些 SKU 三路结论一致、哪些有矛盾需要单独看。

### Agent 间分歧分类

Before disagreeing with another agent, classify the issue:

- `evidence_gap`: the other answer lacks live, local, or GBrain evidence needed for the claim.
- `logic_conflict`: the evidence is present but the operating conclusion does not follow.
- `landing_conflict`: execution was reported complete but readback or verification is missing or contradictory.
- `stale_state`: the answer relies on an old snapshot or GBrain history where current live state matters.
- `scope_conflict`: the action crosses a documented boundary, such as unsupported write surface, missing approval, or missing verification mapping.

Then give the operator a short conclusion, the evidence boundary, and the exact next verification command or read path.
