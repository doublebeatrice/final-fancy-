# 纯节气/强节期高库存出清跟进 - 2026-05-24

## 数据口径

- 当前北京时间：2026-05-24 09:24 后完成最终刷新。
- 最终 runId：`today_ops_2026-05-24T01-24-11-677Z`。
- `businessDate`：2026-05-23；`dataDate`：2026-05-22；站点时区：America/Los_Angeles。
- 快照：`data/snapshots/runs/today_ops_2026-05-24T01-24-11-677Z/snapshot_2026-05-24.json`。
- 今日 season gap：`data/tasks/season_gap_audit_2026-05-24_pure_season_followup.md`。
- 通用 dry-run：`data/snapshots/execution_dry_run_2026-05-24.json`，43 个计划动作、32 个 SKU，未 live execute。

## 今日结论

今天没有 live 执行动作，也没有加预算。核心原因：当前纯节期高库存候选没有真实预算卡量证据，问题集中在低展示、低点击、有点击无单、关键词/商品场景错配、或证据不足。预算只能解决 `CAMPAIGN_OUT_OF_BUDGET` 或明确耗尽，不能替代关键词、match、bid、placement、搜索词和产品匹配的诊断。

我额外做了一个聚焦 dry-run：`data/snapshots/action_schema_2026-05-23_pure_season_low_risk_pause.json`，只包含 RU2411、MF3043 两个有点击无单的 productAd pause。验证结果为 0 个可执行动作、1 个 review SKU，已另存到 `data/snapshots/execution_dry_run_2026-05-24_pure_season_low_risk_pause.json`，因此没有强行执行。

## 纯节气/强节期候选

| SKU | 分类 | 证据 | 压力 | 广告诊断 | 今日动作 |
| --- | --- | --- | --- | --- | --- |
| GUF3129 | 纯 patriotic/Memorial/Flag Day/Independence Day | 前台 title/图片为 American flag patriotic bucket hats；5/20 市场证据中 `patriotic gifts` ABA 量 3347、订单 1164，中需求中竞争，缺少转化数据 | 总压力 98 件；Memorial Day 到 2026-05-25 含仅 2 天，理论需 49 件/天；7/30 天销量 1/1 | 106 展示、3 点击、0 单、花费 1.05，`oob=0`；5/20 已调 bid | 不加预算；明天查具体 ad group、搜索词、CTR，优先处理 `patriotic bucket hat / american flag bucket hat set` 窄词，不再扩 `patriotic gifts` 泛词 |
| GUF3133 | 纯 patriotic/Memorial/Flag Day/Independence Day | 同款 patriotic bucket hat；图片/title 成立 | 总压力 99 件；2 天需 49.5 件/天；7/30 天销量 0/0 | 747 展示、4 点击、0 单、花费 1.92，`oob=0`；5/22 刚有 bid 动作 | 不加预算；低点击/低 CTR 问题，明天看词、match、bid 与主图承接 |
| UY1624 | patriotic tablecloth 候选，待复核 | 当前快照缺图片/title，只能从 campaign 名判断 Independence Day/patriotic tablecloth | 总压力 60 件；2 天需 30 件/天；7/30 天销量 0/0 | 602 展示、0 点击、0 花费，`oob=0`；5/21 已多次 bid | 不执行；先补前台图/标题复核，再判断是否是纯 patriotic |
| CAS4030 | Juneteenth/freedom day 候选，不按 Memorial Day | 当前无 title/图；广告词指向 freedom day cupcake toppers，不等于 Memorial Day | 总压力 151 件；7/30 天销量 1/2；净利 -0.5247 | 16188 展示、121 点击、6 单、花费 32.49，`oob=0` | 不加预算；有单但利润弱，按 Juneteenth/Black History/Freedom Day 另线控效 |
| RU2411 | Graduation 垂直但经济性弱 | 前台 title/图片为 Dental Graduation decorations | 总压力 51 件；Graduation 到 2026-06-20 含 28 天，需 1.8 件/天；7/30 天销量 2/12 | 14028 展示、160 点击、0 单、花费 38.31，部分 OOB 但不是有单赢家 | 不加预算；聚焦 pause dry-run 未进可执行，明天人工复查 0 单 auto/productAd 是否降 bid 或暂停 |

## 正常期/多季节/常年可卖，不按纯节气加量

| SKU | 分类 | 不加量原因 |
| --- | --- | --- |
| QQ1764 | Pride/rainbow + birthday/rainbow party，多场景常卖 | title/图是 rainbow tablecloth；总压力 933 件，Pride 到 2026-06-30 需 24.6 件/天，但 7/30 天已卖 53/146。Pride phrase/exact 在 5/20-5/22 有 4 单，整体广告 67 单、`oob=0`；继续观察 Pride 窄词，不加预算 |
| QQ2806 | rainbow party 正常期/多场景 | 7/30 天销量 56/259，广告 218 单，库存天数 27，`oob=0`；不是高库存纯 Pride 出清 |
| WAR1276 | rainbow party 正常期/多场景 | 7/30 天销量 40/171，广告 91 单，库存天数 37，`oob=0`；不是预算问题 |
| LAY2384 / YAN0087 / SC3527 / GT4431 / GT3308 | funeral/memorial/remembrance 或 patriotic adjacent，不等于 Memorial Day | 多数是悼念/纪念/葬礼语义或已有稳定出单，不应因 `memorial` 字样归入 Memorial Day 节日货；今日均不加预算 |
| QUN5204 | Prom/Senior Night/Graduation/Wedding 多场景 | 前台为 custom prom/senior night bouquet sash，非纯 Graduation/Wedding；43 个 dry-run 动作中有 `ai_auto_unknown_qun5204`，因今天 listing 缺失且命名 unknown，不执行 |
| HEL3107 | Graduation/thank-you 映射待复核 | 无图/title，广告主出单词是 football keychain 方向，利润率 -28.82%；不按泛 Graduation 加量 |
| TAN2986 | Nurse/CRNA 尾期，Graduation 仅弱相关 | 有 24 个广告订单但净利 -0.7493，Nurse Week 已 tail，不用 Graduation 继续加量 |
| HUA6645 / LEM6585 / JIN3992 | Wedding 高库存候选但证据不足或转化弱 | HUA6645 197 件、112 点击 0 单；LEM6585 44 件、55 点击 0 单且负利润；JIN3992 24 件、74 点击 3 单但 title/图缺失。先补图/title/搜索词质量，不加预算 |
| YUT4458 / MF6292 | Summer pool/birthday 预热 | MF6292 是 pool float 且有 15 单，但不是当前 Memorial/Graduation/Pride；YUT4458 花费高、负净利。继续控效，不做纯节气预算加量 |

## 市场证据

- Pride/rainbow：2026-05-21 selection 显示 `rainbow party decorations` 搜索量 12356、`rainbow decorations` 6338、`pride decorations` 6753；keyword conversion 中 Pride/rainbow 词可小步验证。QQ1764 已有 Pride phrase/exact 出单，方向成立，但仍不是纯 Pride 一次性清仓款。
- Patriotic/Memorial：`patriotic gifts` 只有中等需求和中等竞争，缺少关键词转化证明；GUF3129/GUF3133 的商品图/title 成立，但当前广告回读不是预算卡量，而是低展示/低点击。
- Graduation：市场有需求，但必须匹配商品形态。Graduation bear/party decorations 数据不能直接迁移到 dental decor、football keychain 或 bouquet sash；RU2411、HEL3107、QUN5204 都不能用泛 `graduation gifts` 强推。
- Memorial/remembrance：`memorial day party favors` 只有低需求高竞争；funeral/remembrance 产品不等于 Memorial Day patriotic 节日货。

## 今日已执行与回读

- 已执行数据刷新与 dry-run；未 live execute。
- 已重算 5/24 season gap：active season tasks 91，risk items 19，edge watch 9。
- 聚焦 RU2411/MF3043 pause 的 dry-run 未通过为可执行计划，未落地；没有 landed state 需要回读。

## 明日优先级

1. GUF3129/GUF3133：Memorial Day 只剩 2026-05-24 至 2026-05-25 两天，优先拉 ad group/search term；若仍低点击，处理窄词、match 和主图 CTR，不加预算。
2. UY1624/CAS4030：补前台图/title，确认是否 patriotic/Juneteenth，不确认前不按 Memorial Day 清仓。
3. QQ1764：只看 Pride phrase/exact/broad 的真实新增单量；phrase/exact 可保留，broad 无点击则继续观察或收窄，不加预算。
4. RU2411/MF3043：复查 0 单点击消耗行的验证阻塞原因，必要时人工暂停或降 bid。
5. HUA6645/LEM6585/JIN3992：先补图/title/搜索词承接，不要因为 Wedding peak 就直接加预算。
