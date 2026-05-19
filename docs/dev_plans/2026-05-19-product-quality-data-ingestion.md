# 2026-05-19 开发任务：接产品质量数据

## 背景

`memory/feedback_product_analysis_data_limits.md` 里列了当前快照里全量缺失或低覆盖的核心字段。这些数据缺失意味着每次"产品好坏"类判断都没有完整证据，会让 AI 倾向于过度保守或在错误证据上下狠手。

## 优先级

按 memory 里登记的顺序：

| 优先级 | 字段 | 当前覆盖率 | 用途 |
|---|---|---|---|
| 高 | reviewRating + reviewCount | 7% | 产品口碑判断 |
| 高 | BSR | 2% | 类目竞争位 |
| 高 | 退货率 | 0% | 运营核心 KPI |
| 中 | aPlusText | 1% | listing 准备度 |
| 中 | variationText | 0% | 变体覆盖 |

明天先打第一条：reviewRating + reviewCount。打通了下次复用同一条管线接 BSR。

## 验收标准

1. 覆盖率从 7% 提到 ≥ 80%（剩下那些可能是真的没被审核完的新品）
2. 字段进默认快照，不需要单独跑脚本
3. 决策 AI 在 `feedback_product_analysis_data_limits.md` 三段流程里能直接读到这两个字段
4. 不在结论里再写"reviewRating 数据缺失"这种告警（数据齐了，告警就该消失）

## Self-review 红线（参考 [[feedback_self_review_before_commit]]）

提交前问自己：
- 这条接入让 `npm run ops:today --mode full-snapshot` 多跑多少时间？≥ 2 分钟就要 lean 路径
- fast 模式默认要不要拉这两个字段？建议：默认关，full-snapshot 才拉
- 1200+ SKU 全量拉评分会不会触发后台限流？需要先做小批测试再放量

## 相关 memory

- `feedback_product_analysis_data_limits.md` — 为什么要接、缺失时怎么处理
- `feedback_dont_blame_product_from_ads.md` — 这两个字段是"判产品质量"的关键证据
- `feedback_self_review_before_commit.md` — 提交前性能 self-review
- `project_north_star_autopilot.md` — 数据齐了 AI 才能自动判产品质量

## 不做什么

- 不在第一版接所有 5 个字段——先打通一条评分管线，验证清楚再扩
- 不引入新的浏览器抓取目标——优先复用现有 sellerinventory / adv 已登录会话能拿到的接口
- 不为了凑覆盖率而硬接，无法接到的 SKU 在结论里照常报"该字段缺失"
