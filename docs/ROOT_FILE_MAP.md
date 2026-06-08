# Root File Map

Last reconciled: 2026-06-04.

This is the living map for what belongs in the repository root. The root should contain entry points, project rules, dependency manifests, and top-level folders only. Runtime outputs, source datasets, temporary probes, reports, and historical files belong under their typed folders.

## Root Files Kept

| Current path | Purpose |
|---|---|
| `README.md` | Human and AI project entry guide. Start here. |
| `AGENT.md` | AI operating rules, execution boundaries, and run discipline. |
| `AGENTS.md` | Current Codex/agent root instructions. Keep alongside `AGENT.md` until the older rule surface is intentionally retired. |
| `memory.md` | Durable operating memory and business-decision context. |
| `CHANGELOG.md` | Concise capability change log. |
| `auto_adjust.js` | Main Node execution orchestrator. Kept in root because tests and execution scripts import it directly. |
| `package.json` | npm scripts and dependency metadata. |
| `package-lock.json` | Locked dependency versions. |
| `.gitignore` | Generated-output and dependency ignore rules. |
| `.mcp.json` | Local Chrome DevTools MCP configuration. |

## Root Directories Kept

| Current path | Purpose |
|---|---|
| `.claude/` | Local assistant/tooling state. Do not use for business evidence. |
| `.codex/` | Project-local Codex skills and config. |
| `archive/` | Historical code/report snapshots that are not part of the active path. |
| `data/` | Runtime data, canonical snapshots, adjustment logs, learning records, task outputs, and source datasets. |
| `discovery/` | Read-only endpoint/source discovery sandbox. Production code may reuse `discovery/lib/cdp.js`. |
| `docs/` | Architecture, playbooks, runbooks, release notes, and root cleanup docs. |
| `extension/` | Current Chrome extension package. |
| `node_modules/` | Installed Node dependencies; generated, not reviewed manually. |
| `scripts/` | Executable support scripts grouped by purpose. |
| `src/` | Core runtime and decision-support modules. |
| `tests/` | Node regression tests. |
| `黄成喆个人数据趋势/` | Generated personal trend archive; ignored by git. |

## Generated and Diagnostic Outputs

| Path | Rule |
|---|---|
| `data/snapshots/` | Canonical run snapshots, logs, execution summaries, and verification files. Ignored by git because it is high-volume runtime output. |
| `data/tmp_tests/` | Scratch probes and failure evidence. Ignored by git; promote durable conclusions to `data/learning/` or `docs/`. |
| `data/exports/` | Generated export files, including seven-day untouched readbacks. Ignored by git unless a specific export is promoted as durable evidence. |
| `data/learning/` | Durable daily learning and operating conclusions. Commit selectively when the learning changes future decisions. |
| `data/learning/sku_lessons/` | Reusable SKU-level operating lessons with scope, evidence, transfer boundaries, conflict status, and next validation. These are not daily logs. |
| `data/tasks/` | Daily task boards, proactive audits, seasonal audits, and review queues. |
| `data/agent/` | 智能代理台账输出：外部任务收件箱、任务状态、授权判断、效果复查承诺、到期复查队列、复查证据、效果复查报告、能力注册目录、自主运营中枢队列、只读命令执行结果、低风险写入编排结果、命令结果回填、总编排闭环结果、中文交接摘要。运行时产物，按需要提交关键样例。 |
| `data/developer_requests/` | Forwarded developer/product request evidence, actions, reply drafts, and follow-up checkpoints. |
| `archive/reports/` | Historical closed-loop HTML reports. |

## Source Reference Files

| Path | Purpose |
|---|---|
| `data/reference/season_events_2026_source.xlsx` | Source workbook for season/event windows. Import with `npm run ops:season-events:import`. |
| `data/reference/HJ4月复盘 5月培训亚马逊运营・节点 .docx` | Training/review source document; kept out of root because it is source reference material, not an entry point. |
| `data/reference/销售二部-工作标准，业务方法和知识点.xlsx` | Sales-ops standard and business-method source workbook; kept out of root because it is reference material. |
| `data/reference/节气巡查_今日提醒动态版_大节气提前优化版.xlsx` | Current seasonal-reminder source workbook; kept with reference inputs. |
| `data/season_events_2026.json` | Runtime season-event JSON consumed by seasonal audits/title workflows. |
| `docs/2025年半精品销售季度KPI考核 - 组员.xlsx` | KPI context workbook used by operating playbooks. |

## Error Trace Read Path

When a run fails or a result looks wrong, read these in order:

1. `data/snapshots/auto_run_<YYYY-MM-DD>.log`
2. `data/snapshots/execution_summary_<YYYY-MM-DD>.json`
3. `data/snapshots/execution_verify_<YYYY-MM-DD>.json`
4. `data/adjustments/adjustments_<YYYY-MM-DD>.json`
5. `data/learning/daily_learning_<YYYY-MM-DD>.md`
6. Any matching `data/developer_requests/<date>_*.md` or `data/tmp_tests/*<date>*` evidence

## Historical Moves

| Old path | New path | Notes |
|---|---|---|
| `adjust_lib.js` | `src/adjust_lib.js` | Core bid analysis logic. |
| `adjustment_history.json` | `data/adjustment_history.json` | Runtime history used by cooldown checks. |
| `snapshots/` | `data/snapshots/` | Runtime logs, plans, prompts, batch files. |
| `FIELD_DICTIONARY.md` | `docs/FIELD_DICTIONARY.md` | Documentation. |
| `ChatGPT auto1.txt` | `docs/ChatGPT auto1.txt` | Historical/reference document. |
| `【时间切片版】全自动抓取引擎.txt` | `docs/时间切片版_全自动抓取引擎.txt` | Historical/reference document. |
| `solar_terms.json` | `data/solar_terms.json` | Data file. |
| `solar_term_map.json` | `data/solar_term_map.json` | Data file. |
| `solr_terms_raw.txt` | `data/solr_terms_raw.txt` | Data file. |
| `inv_auto_filtered_2026-04-17-02-52-35.csv` | `data/inv_auto_filtered_2026-04-17-02-52-35.csv` | Output/sample data. |
| `a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` | `data/a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` | Image/data artifact. |
| `限sku.txt` | `data/限sku.txt` | Data/reference list. |
| `节气巡查.xlsx` | `data/reference/season_events_2026_source.xlsx` | Source workbook for season-event import. |

## 2026-06-04 Root Reconciliation

| Old path | New path | Notes |
|---|---|---|
| `HJ4月复盘 5月培训亚马逊运营・节点 .docx` | `data/reference/HJ4月复盘 5月培训亚马逊运营・节点 .docx` | Source/reference document. |
| `销售二部-工作标准，业务方法和知识点.xlsx` | `data/reference/销售二部-工作标准，业务方法和知识点.xlsx` | Source/reference workbook. |
| `节气巡查_今日提醒动态版_大节气提前优化版.xlsx` | `data/reference/节气巡查_今日提醒动态版_大节气提前优化版.xlsx` | Source/reference workbook. |
| `remaining_sp_7day_untouched_cn_2026-05-22.*` | `data/exports/remaining_sp_7day_untouched_cn_2026-05-22.*` | Generated seven-day untouched export; future exports are written under `data/exports/`. |
| `Claude 对 Codex 说的话.md`, `GOAL-*.md` | `docs/handoffs/` | Claude/Codex handoff and goal notes; useful context but not root entry points. |
| `2026-06-01` | `archive/root_cleanup_2026-06-04/2026-06-01` | Empty/accidental root artifact quarantined instead of deleted. |

## Removed

| Removed path | Reason |
|---|---|
| `SKILL.md/` | Tracked copy of generic assistant skills. It was not referenced by the ad-ops runtime and confused the project root with a Markdown file name that was actually a directory. Active project skills live under `.codex/skills/`. |
| `archive/unknown/` | Empty placeholder directory from the earlier cleanup. Recreate only if an actual unknown file needs quarantine. |
