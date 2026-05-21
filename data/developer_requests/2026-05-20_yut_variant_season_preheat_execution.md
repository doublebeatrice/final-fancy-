# YUT 变体组节气预热执行记录 2026-05-20

## 来源

- 对象：YUT 数字泳池浮排/生日泳池派对变体组，母体 `B0D2W95PSJ`，含 `YUT4466/YUT4464/YUT4462/YUT4460/YUT4458/YUT2927/YUT2946/MF6280/MF6292/MF6328`。
- 用户要求：按组长文档口径重新定目标并实施。不能把负净利或当前弱动销直接等同于清货，节气流量来之前要先做方向选择和广告位准备。
- 执行时间：2026-05-20 18:28 Asia/Shanghai。

## 产品判断

- 产品类型：夏季泳池/生日派对/数字 milestone 场景产品。
- 当前阶段：2026-05-20 处于美国夏季和户外泳池派对前的预热期，不是高峰后清货期。
- 市场证据：选品 ABA 月度数据 `2026-04-30` 中 `birthday pool float` 有“夏季产品”标记；`pool party decorations`、`50th birthday decorations` 有市场层返回。精确年龄词如 `30th birthday pool float`、`60th birthday pool float`、`70 number pool float` 在选品层缺失，不能单靠市场工具判死，要结合我方广告订单证据。
- 历史呼应：销售历史接口对该组返回 `no_history` 或无可识别历史表；该组多 SKU 上架/FBA 在 2025-11 到 2026-04，当前不能做完整去年同期验证。因此本次用 30d/7d/3d 动销、广告转化词、库存和节气窗口做阶段性目标。

## 目标口径

- 全组目标：从近 7 天约 64 单，预热阶段先拉到 80-90 单/周，同时不新增总预算。
- 主推款：`YUT4466/YUT4464/MF6328` 等有利润或强转化的 SKU，提前抢核心词和广告位。
- 高库存弱款：`YUT4458/MF6292/YUT2927/YUT2946` 不提前按清货款处理；只要继续销售回款大概率高于清货回款，就保留低成本验证。
- 低库存/薄利款：`YUT4462/MF6280` 不盲目放量，只保护强转化词。
- 关键词目标：不硬冲高价排名。先保证 `birthday pool float`、`number/pool float`、具体年龄词、`inflatable number pool float` 等已验证方向的曝光和点击质量。
- 类目/排名目标：后续按单 ASIN/SKU 看，不能用主推款代表整个变体组。

## 执行动作

- 生成 schema：`data/snapshots/action_schema_YUT_variant_season_preheat_reallocation_2026-05-20.json`
- dry-run：10 个 SKU，41 个动作，校验错误 0。
- 实际执行：41 个动作全部 API success。
- 回读验证：18 个广告组明细重新拉取，41/41 个动作全部读回目标值，失败 0。

## SKU 处理

- `YUT4466`：标题修复和核心词恢复已在前序完成；本次追加 `float pool` 小幅提价，补同场景流量。
- `YUT4464`：主推，提升 `number pool float`、`birthday pool float` 和有效 auto；下调 `floating pool decorations` 这种 ACOS 偏高的泛装饰词。
- `YUT4462`：库存低且利润薄，只提升 `pool float numbers`，下调无单 auto。
- `YUT4460`：提升 `60th birthday pool float`、`float pool`；下调 `60 number pool float`、`gold number pool float` 和无单 ASIN 扩展。
- `YUT4458`：修复验证，不清货；大幅压低多个高点击无单词和 auto，保留极低成本 `birthday pool float` 验证入口。
- `YUT2927`：提升 `16 birthday pool float`、`16 pool float`，重新启用有订单证明的 `birthday pool float`；下调 `sweet 16 pool party decorations`。
- `YUT2946`：提升有效 auto 和 `inflatable number pool float`，先小幅加量。
- `MF6280`：库存不大，只轻推 SKU 自身有效 auto；共享 SB 层未执行，因为当前执行上下文不把它暴露为 SKU 独立可写实体。
- `MF6292`：负净利但不清货；提升 `number pool float`、`20th birthday decorations`，下调无单泛词和偏离方向的 mom/gift auto。
- `MF6328`：提升 `pool floats`、`birthday pool float`、`number pool float`，下调无单 auto 和泛 decor 词。

## 证据文件

- 选品 ABA：`data/snapshots/selection_aba_yut_pool_birthday_month_2026-05-20.json`
- 关键词转化：`data/snapshots/selection_keyword_yut_pool_birthday_2026-05-20.json`
- 执行结果：`data/snapshots/execution_verify_2026-05-20.json`
- 回读汇总：`data/snapshots/readback_YUT_preheat_landing_check_2026-05-20.json`
- 回读组清单：`data/snapshots/readback_YUT_preheat_groups_2026-05-20.json`

## 复查点

- 2026-05-21：先看是否有异常花费、无单点击继续扩大，尤其 `YUT4458/MF6292`。
- 2026-05-23：看 3 天曝光、点击、CPC 和搜索词是否按核心方向回来。
- 2026-05-27：看 7 天订单、ACOS、全组周销是否接近 80-90 单目标，再决定第二轮放大或继续压泛词。

## 可会议复述

这组我已经按节气预热来处理，不再按普通滞销或负净利清货逻辑。美国夏季/泳池/生日派对流量还在前置准备期，所以这次没有加总预算，而是把每个 SKU 拆开：有利润和有转化的提前抢 `birthday pool float`、`number pool float` 这些方向；高库存但弱的 SKU 保留低成本验证，不提前判清货；烧点击没单的泛词和偏离场景词已经下调。执行上 10 个 SKU 共 41 个广告动作都已落地并回读成功，明天先看异常花费，3 天看曝光点击方向，7 天看周销和 ACOS。
