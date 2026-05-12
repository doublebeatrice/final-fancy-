# UI 7天未调整下层投放调整沉淀 - 2026-05-08

## 执行边界

- 只动投放层 bid：SP 关键词、SP 自动/手动定向、SB 关键词/定向。
- 不动活动预算，不做开启/暂停，不新建广告。
- 首页卡片：SP 352 -> 47，SB 134 -> 43，SD 0 -> 0。
- 合计 397 条动作，228 个 SKU，397 个下层对象，执行状态均为 api_success_verified。

## 动作分布

- 方向：bid_down 255，bid_up 142
- 对象：sbKeyword 90，autoTarget 114，keyword 114，manualTarget 78，sbTarget 1
- 预期：cool_inventory_demand 85，control_waste 170，repair_visibility 142

## 预期与观察

- 降 bid 控费：预期点击和花费先下降，订单不能比花费更快下滑。
- 库存控需：预期降低消耗速度，保留可观察曝光。
- 加 bid 修复流量：预期 1-3 天曝光/点击上升，7 天看订单是否跟上。
- 极小步触达：作为清理 7 天未调整的 hygiene 动作，7 天后看是否仍无单消耗。

## 后续复盘窗口

- 1 天：检查是否仍继续异常花费或完全无曝光。
- 3 天：看曝光/点击方向是否符合预期。
- 7 天：看订单、ACOS、花费占比是否支持继续保留。
- 14/30 天：沉淀为产品/投放对象长期策略。

## 剩余未清原因

- no_active_lower_entity_or_all_on_cooldown: 61
- no_safe_bid_move_at_lower_layer: 24
- sku_out_of_allowed_operation_scope: 2
