# Page Routing

Vault root: `D:\ad-ops-brain`

> 目录已于 2026-06-22 重构为英文 MECE 名称（对齐 upstream GBrain）。页面 body 仍用中文。

## Directories

- `skus/`: SKU 或 SKU 组的当前可信结论、阶段、边界、过期条件和下次复查。
- `decisions/`: 按日期记录为什么做某个动作、证据、预期结果和后续复盘。
- `retrospectives/effect/`: 动作结果和效果复盘。
- `retrospectives/daily/`: 每日学习摘要和运营经验。
- `retrospectives/weekly/`: 未闭环事项和周度复盘。
- `playbooks/`: 可复用规则、工作流和执行边界。`playbooks/advertising/` 放广告专项。
- `mappings/`: SKU、ASIN、广告活动、广告组、开发叫法和别名映射。
- `sources/`: 现有来源文件摘要。不要放原始大表。
- `qa/`: 验收问题和答案骨架。只在验收集变化时更新。
- `templates/`: 新页模板。

## Type Mapping

- `sku` -> `skus/<SKU-or-slug>.md`
- `decision` -> `decisions/<YYYY-MM-DD>-<slug>.md`
- `effect-review` -> `retrospectives/effect/<YYYY-MM-DD>-<slug>.md`
- `daily-review` -> `retrospectives/daily/<YYYY-MM-DD>-<slug>.md`
- `weekly-review` -> `retrospectives/weekly/<YYYY-MM-DD>-<slug>.md`
- `playbook` -> `playbooks/<slug>.md`
- `resolver` -> `mappings/<slug>.md`
- `source-digest` -> `sources/<YYYY-MM-DD>-<slug>.md`

## Update Preference

If a new review changes the current SKU judgement, update both:

1. The dated review or decision page.
2. The relevant `skus/<SKU>.md` current conclusion and stale boundary.

If a pattern repeats across SKUs, update or create a `playbooks/` page.
