# 内部证据路由

当用户提供产品、SKU、ASIN、关键词、广告问题、Listing 问题、开发诉求或产品线判断任务时，默认先用 ad-ops-workbench 内部证据栈，不把卖家精灵当作默认来源。

## 默认原则

内部证据优先：`selection`、`SIF`、`sellerinventory`、广告后台、Amazon 前台和 `GBrain` 是默认证据；卖家精灵只是 fallback，只有用户已经提供外部导出表，或内部证据缺口无法补齐时才作为补充线索。

所有内部证据都是判断层，不自动触发写动作。进入 bid、budget、广告状态、建组、加词、加 ASIN、否词、Listing、价格或库存动作前，必须回到 `D:\ad-ops-brain\playbooks\广告调整完整结构.md` 及对应子模块。

## 数据源替换矩阵

| 原通用来源 | 内部默认替换 | 用途 | 边界 |
|---|---|---|---|
| 卖家精灵关键词导出 | `ops:selection:keyword-research`、`ops:selection:aba-search-terms`、`ops:selection:keyword-conversion`、`ops:selection:keyword-seasonality` | 搜索入口、需求、转化、CPC、季节窗口 | 只读证据，不直接建词或提 bid |
| 卖家精灵竞品导出 | `ops:selection:product-time-machine`、`ops:selection:extended`、Amazon 前台 | 竞品池、价格带、Review 壁垒、流量结构 | 必须按标品/非标品清洗相似竞品 |
| 卖家精灵 CPC/广告数据 | `ops:selection:keyword-conversion`、广告后台 CPC、SIF ad-xray | 成本边界、广告战场判断 | 当前 SKU 动作以广告后台 live CPC/CPA 为准 |
| ASIN 反查词 | `ops:sif:reverse-keywords`、`ops:sif:keyword-history`、Product Time Machine | 真实流量词、历史趋势、词根扩展 | SIF 是市场/流量证据，不是写入依据 |
| 评论/VOC 导出 | `ops:selection:extended` comment-analysis、Amazon 前台、用户截图 | VOC、差评痛点、页面/包装/说明书动作 | 样本和日期必须标注 |
| 手填成本库存 | sellerinventory productAnalysis、daily deposit、库存/利润快照 | 毛利、库存、现金、补货门控 | 当前月利润需用日沉淀/广告/销售证据校准 |
| Amazon Ads 导出 | live ad backend、Search Term、Targeting、ProductAd、Placement | 广告结构、搜索词、target、CPC、CPA、ACOS/TACOS | 写动作必须 dry-run、执行、读回 |
| 人工经验 | GBrain SKU 页、决策记录、效果复盘、标准打法 | 历史结论、边界、重复错误、打法入口 | GBrain 不是当前 live 状态 |

## 默认命令包

市场和关键词：

```powershell
npm run ops:selection:keyword-research -- --sku <SKU> --terms "<terms>"
npm run ops:selection:aba-search-terms -- --search-terms "<terms>"
npm run ops:selection:keyword-conversion -- --keywords "<terms>"
npm run ops:selection:keyword-seasonality -- --search-terms "<terms>"
npm run ops:selection:product-time-machine -- --search-keywords "<terms>"
npm run ops:selection:operating-intelligence -- --sample
```

SIF：

```powershell
npm run ops:sif:reverse-keywords -- --asin <ASIN>
npm run ops:sif:keyword-history -- --keywords "<terms>"
npm run ops:sif:ad-xray -- --asin <ASIN>
npm run ops:sif:keyword-slots -- --sku <SKU>
```

产品线 profile 收口：

```powershell
npm run ops:product-line:profile -- --sku <SKU> --terms "<terms>" --out data\snapshots\product_line_ops_profile_<date>.json
```

## 输出要求

每次输出必须写清：

1. 本次用了哪些内部证据源。
2. 哪些是 live 证据，哪些是本地快照，哪些是 GBrain 历史。
3. 哪些证据缺口仍需要人工确认。
4. 卖家精灵或外部表格如果出现，只能标注为 fallback/补充线索。
5. 是否进入广告、Listing、价格或库存动作；若进入，必须转到对应执行标准。
