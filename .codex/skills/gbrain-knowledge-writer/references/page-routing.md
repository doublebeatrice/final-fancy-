# Page Routing

Vault root: `D:\ad-ops-brain`

## Directories

- `01-SKU当前结论/`: SKU 或 SKU 组的当前可信结论、阶段、边界、过期条件和下次复查。
- `02-决策记录/`: 按日期记录为什么做某个动作、证据、预期结果和后续复盘。
- `03-复盘/效果复盘/`: 动作结果和效果复盘。
- `03-复盘/每日复盘/`: 每日学习摘要和运营经验。
- `03-复盘/周复盘/`: 未闭环事项和周度复盘。
- `04-标准打法/`: 可复用规则、工作流和执行边界。
- `05-名称映射/`: SKU、ASIN、广告活动、广告组、开发叫法和别名映射。
- `06-来源摘要/`: 现有来源文件摘要。不要放原始大表。
- `07-验收问题/`: 验收问题和答案骨架。只在验收集变化时更新。

## Type Mapping

- `sku` -> `01-SKU当前结论/<SKU-or-slug>.md`
- `decision` -> `02-决策记录/<YYYY-MM-DD>-<slug>.md`
- `effect-review` -> `03-复盘/效果复盘/<YYYY-MM-DD>-<slug>.md`
- `daily-review` -> `03-复盘/每日复盘/<YYYY-MM-DD>-<slug>.md`
- `weekly-review` -> `03-复盘/周复盘/<YYYY-MM-DD>-<slug>.md`
- `playbook` -> `04-标准打法/<slug>.md`
- `resolver` -> `05-名称映射/<slug>.md`
- `source-digest` -> `06-来源摘要/<YYYY-MM-DD>-<slug>.md`

## Update Preference

If a new review changes the current SKU judgement, update both:

1. The dated review or decision page.
2. The relevant `01-SKU当前结论/<SKU>.md` current conclusion and stale boundary.

If a pattern repeats across SKUs, update or create a `04-标准打法/` page.
