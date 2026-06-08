# SKU 动作-目标-回看-学习 模板（v1）

发布日期：2026-05-28
作者：Claude（接手 Codex 工作）
适用范围：所有运营动作（广告、库存、清仓、价格、listing、SBV）

## 为什么要换这个模板

旧的 effect_review 字段只有 `baseline`（spend/orders/acos/clicks/impressions）和一句话 `rollbackIf`。
没有目标数字，没有"达成 / 未达成"判定，所以 367 条复查里 0 条标记为 needsAction、0 条标记为 blocked、297 条停在 continue_watch。
继续观察不是结论，它是"我没看出名堂、再放一天"。

新模板把每个动作压成 5 段，缺一不可。

## 5 段式动作单

每个 SKU 动作是一条 JSON 对象，落在 `data/agent/operator_actions_<date>.json` 里：

```json
{
  "actionId": "act_2026-05-28_HEL2829_lower_bid_001",
  "businessDate": "2026-05-28",
  "sku": "HEL2829",
  "asin": "",
  "actionType": "lower_bid",
  "entityType": "keyword",
  "entityId": "",
  "campaignId": "",

  "hypothesis": {
    "operatingClaim": "HEL2829 30d ACOS 偏高、ad orders 16 单但 net profit 负 0.11，bid 降 30% 后单量损失不超过 3 单、ACOS 落到 33% 以下，清仓 181 days 也不需要全速跑量。",
    "marketEvidence": [
      "ABA: data/snapshots/selection_aba_search_terms_HEL2829_2026-05-27_live.json — 主词搜索量级、垄断度",
      "Conversion: data/snapshots/selection_keyword_conversion_HEL2829_2026-05-27_live.json — 现行 CPC/ACOS strategy range",
      "Seasonality: data/snapshots/selection_keyword_seasonality_HEL2829_2026-05-27_live.json — 季节窗口位置",
      "PTM: data/snapshots/selection_product_time_machine_HEL2829_2026-05-27_live.json — 竞品流量结构"
    ],
    "skuEvidence": [
      "Inventory: 157 units, 181 sellable days @30d pace = 库存过剩",
      "30d ads: $179.10 / 544 clicks / 16 orders / netProfit -0.11"
    ],
    "marketEvidenceVerdict": "市场支持降价不降量；窗口非旺季；不强行加投。"
  },

  "target": {
    "primaryMetric": "ad_acos_7d",
    "primaryDirection": "down",
    "primaryFrom": 0.43,
    "primaryTo": 0.33,
    "guardMetric": "ad_orders_7d",
    "guardDirection": "not_below",
    "guardThreshold": 12,
    "secondaryMetric": "net_profit_7d",
    "secondaryDirection": "up",
    "secondaryFrom": -0.11,
    "secondaryTo": 0.0,
    "windowDays": [1, 3, 7, 14],
    "primaryHitDefinition": "7d window: ad_acos <= 0.33 AND ad_orders >= 12 AND net_profit >= 0.0"
  },

  "rollbackTrigger": {
    "ifAny": [
      "3d ad_orders 落到 < 8（即比 baseline 周折日均的 50% 低）",
      "3d sku_units 同比下降 > 30%",
      "1d 出现 0 单且当日有 >= 50 clicks（说明价格 / 转化全跌）"
    ],
    "rollbackAction": "把 bid 恢复到执行前 70%（不直接复原 100%，避免反复横跳）",
    "rollbackEntity": "same keyword/entity"
  },

  "executionPlan": {
    "mode": "lower_bid_30pct",
    "commands": [
      {
        "label": "Dry-run 验证 schema",
        "command": "npm run ops:agent:write-actions -- --schema data\\schema\\action_schema_2026-05-28.json --dry-run --today 2026-05-28",
        "expectedOutput": "data\\agent\\write_dry_run_2026-05-28.json"
      },
      {
        "label": "执行写入",
        "command": "npm run ops:agent:write-actions -- --schema data\\schema\\action_schema_2026-05-28.json --execute --today 2026-05-28",
        "expectedOutput": "data\\agent\\execution_summary_2026-05-28.json"
      },
      {
        "label": "Verify landing",
        "command": "npm run ops:agent:feedback -- --today 2026-05-28",
        "expectedOutput": "data\\agent\\execution_verify_2026-05-28.json"
      }
    ],
    "requiredInputs": [
      "data\\snapshots\\latest_snapshot.json (must be 2026-05-27 or newer)"
    ],
    "preflight": [
      "verify_latest_snapshot_businessDate_dataDate_sourceRunId",
      "inspect_adjustment_log_for_same_sku_or_same_entity (no same-day write)"
    ]
  },

  "review": {
    "checkAfterDays": [1, 3, 7, 14],
    "evidenceCommandsPerWindow": [
      "npm run ops:agent:review-effect -- --collect-evidence --today <date>",
      "npm run ops:selection:keyword-conversion -- --keywords \"<top 3 keywords>\" --asin <asin>"
    ],
    "verdictRule": {
      "hit": "primaryMetric 达到 primaryTo 且 guardMetric 守住 guardThreshold",
      "partialHit": "primaryMetric 朝目标方向走了 >= 50% 但未达目标",
      "miss": "primaryMetric 没动、动错方向、或 guardMetric 跌穿",
      "rollback": "命中 rollbackTrigger.ifAny 任一条件",
      "noiseTooHigh": "1d/3d 数据样本太小、需要 7d 才能下结论；只在 1d/3d 允许"
    }
  },

  "lesson": {
    "lessonId": "",
    "writeLessonAfterWindow": 7,
    "scope": ["sku", "keyword_pool"],
    "transferTags": [
      "category:vase",
      "lifecycle:clearance",
      "season:offpeak",
      "action_type:lower_bid_30pct"
    ],
    "doNotApplyWhen": [
      "sku is in active season window with rising ABA rank",
      "inventory tight (sellable_days < 30)"
    ]
  }
}
```

## 字段约束

| 字段 | 必填 | 校验规则 |
| --- | --- | --- |
| hypothesis.marketEvidence | 是 | 至少 2 条 selection_* 文件；纯 SKU 销售/广告数据不算市场证据 |
| target.primaryMetric | 是 | 必须是机器可测指标：ad_acos_Nd / ad_orders_Nd / sku_units_Nd / net_profit_Nd / sellable_days |
| target.primaryFrom + primaryTo | 是 | 都是数字；目标改善幅度（绝对差或比例）必须落在最近 30 天波动范围内（不能不切实际） |
| target.guardMetric | 是 | 防止"达标了但生意垮了"——例如 ACOS 降下来了但单量也归零 |
| rollbackTrigger.ifAny | 是 | 至少 1 条；触发条件必须用 1d 或 3d 窗口能检测到（避免要等 7d 才回滚） |
| review.verdictRule | 是 | hit / partialHit / miss / rollback / noiseTooHigh 五选一；不允许 "continue_watch" |
| lesson.transferTags | 是 | 至少 2 条；用于把这条经验转移给同类 SKU |

## 与现有 schema 的兼容

旧 action_schema_*.json 用的字段：`actionType / entityType / entityId / payload / forceExecute / approvalState`。
新模板**保留**这些字段，**额外加** `hypothesis / target / rollbackTrigger / review / lesson`。
执行端（`run_actions.js`、`run_agent_write_execution.js`）只读旧字段，不影响落地；
复查端（`run_agent_effect_review.js`）需要后续改造读 `target / rollbackTrigger`，第一期先由 Claude 在 review 文件里手动比对。

## 目标命中率（hit rate）日报口径

每天早班统计昨日所有到期动作的 verdict 分布：
- hit_rate = hit / (hit + partialHit + miss + rollback)
- 目标：hit_rate >= 60%
- 若 hit_rate < 50%：当日**禁止**新增同类型动作，先复盘失败的目标到底定错了还是市场判断错了
- 写入 `data/agent/hit_rate_daily_<date>.md`

## 这件事到底解决了什么

- "推荐批准 暂无" → 每天有 5-15 条具体可执行动作
- "continue_watch 297 条" → 强制四选一判定，不允许装糊涂
- "经验都是骂出来的" → 每条动作 7 天后必须沉淀一条 lesson，不需要等用户开口
- 风险不是借口 → 风险体现在 boundary / batch_size / approval / dry-run，而不是不做
