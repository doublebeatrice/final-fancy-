# 组长检查 Handoff 2026-05-18

- 检查日期: 2026-05-19
- businessDate: 2026-05-18
- dataDate: 2026-05-17
- 快照: D:\ad-ops-workbench\data\snapshots\panel_snapshot_2026-05-18_late_check.json

## 总结

- KPI: off_track; 销售 526778.99; 件数 3654; 净利率 20.65%; ACOS 20.90%; 退款率 5.17%
- 已执行: 标题申请 submitted 1 / covered 1; 广告创建 verified 3
- 已排查: 过预算 8287 行; 季节库存风险 17; 低效广告 actionable 23

## 过季库存处理 / 复盘节奏 + 利润广告平衡

- 状态: checked_and_partly_executed
- 过预算晚间行数 8287; bucketCounts: {"aggressive_budget_expansion":57,"controlled_budget_up":222,"seasonal_sell_through":43,"lower_layer_cost_control":550,"review":4057}
- 低效广告池可处理 23; hold 77; skip 540
- 已执行低预算节日广告创建 3 个; 大规模预算调整只产出 review, 不在晚间批量强推
- 文件: data/tasks/over_budget_review_2026-05-18_late.md; data/tasks/low_efficiency_pools_2026-05-18_late.json

## 毕业季高库存

- 状态: checked
- HEL3107: critical_stale_season, 30d=0, sellableDays=999, review_low_budget_season_structure_gap
- TAN2986: critical_stale_season, 30d=2, sellableDays=2565, review_stale_inventory_sell_through_plan
- 文件: data/tasks/season_gap_audit_2026-05-18.md

## 父亲节 / 同志节 / 阵亡纪念日 / 毕业季 / 夏季

- 状态: checked_and_partly_executed
- 节日标题扫描 1276 个商品, 命中 70 个; auto title 6; missing title review 49; protected hold 6
- Pride Month Top50 需确认: QQ1764
- 广告创建已验证: LO3817:154939906382310, YUT4462:178927403834265, YUT4460:158511939984821
- 文件: data/tasks/season_title_dry_run_2026-05-18.md; data/snapshots/action_schema_2026-05-18_season_title_ads.json

## 未来节日排查优化（平时可卖替换）

- 状态: submitted_or_already_clean
- OB4139: submitted_pending_review app=4458812, 标题改为 Fiesta 常卖词
- OB3296: covered_by_existing_variant_application, 由同变体 OB4139 的母体标题申请覆盖
- GM3213 / GM3210 / GM3207 / GM3201: 后台实时原始标题已是 Lab Tech Gifts, 不再含 Lab Week; 脚本因 origin_parent_title_mismatch 阻止重复覆盖
- 文件: data/snapshots/season_title_listing_applications_2026-05-18.json; data/snapshots/listing_copy_edit_execution_2026-05-18.json

## 2026-05-19 复查点

- 先看 OB4139 标题申请 4458812 是否通过, OB3296 同变体无需重复提交。
- 复查 LO3817 / YUT4462 / YUT4460 新建 broad 广告是否开始出曝光; 无曝光先看审核/活动状态, 不直接加预算。
- 毕业季高库存重点看 HEL3107、TAN2986: 利润低或负, 不做盲目放量, 先确认页面/价格/清仓承受度。
- QQ1764 属 Top50 / Pride Month 标题机会, 需要组长或运营确认后再改标题。
