# 纯节气/强节期高库存出清跟进 - 2026-05-23

## 数据口径

- 当前北京时间：2026-05-23 09:16 后开始跟进。
- 今日刷新任务：`npm.cmd run ops:today -- --dry-run`。
- 本次 runId：`today_ops_2026-05-23T01-17-11-910Z`。
- `businessDate`：2026-05-22；`dataDate`：2026-05-21；站点时区：America/Los_Angeles。
- 快照：`data/snapshots/runs/today_ops_2026-05-23T01-17-11-910Z/snapshot_2026-05-23.json`。
- 今日 season gap：`data/tasks/season_gap_audit_2026-05-23_pure_season_followup.md`。

## 今日结论

今天不执行整包 live 调整，也不做预算加量。原因不是继续等待，而是本轮高库存纯节气候选里没有出现可以直接加预算的证据：目标 SKU 没有真实 `CAMPAIGN_OUT_OF_BUDGET` 卡预算；多数问题是低展示、低点击、无单、关键词/场景错配、近期刚调过，或产品身份证据不足。

`ops:today` 已完成 dry-run：计划 47 个动作、34 个可执行 SKU、9 个 review SKU，但包含预算上调、过季清理、新建广泛词等混合动作，不适合按“纯节气高库存出清”整包执行。今日只保留诊断和明日定向复查清单。

## 纯节气/强节期名单

| SKU | 节期判断 | 证据 | 库存/销量压力 | 广告状态 | 今日动作 |
| --- | --- | --- | --- | --- | --- |
| GUF3129 | 纯 patriotic/Memorial/Flag Day/Independence Day，当前 Memorial Day peak | Listing title/图片为 `12 Pcs Patriotic Bucket Hat Set`、American flag bucket hats；不是 Nurse Week | `invDays=1080`，3/7/30 天销量 `1/1/1`，FBA 可售 8、reserved 28、在途 61 | 匹配 SKU 的广告约 85 展示、3 点击、0 单、花费 1.05；`oob=0` | 不加预算；5/20 已有 bid/结构动作，今天回读仍是低展示/低点击。明天优先看具体 ad group、搜索词和是否补更窄的 `patriotic bucket hat / american flag bucket hat set` 结构 |
| GUF3133 | 纯 patriotic/Memorial/Flag Day/Independence Day，当前 Memorial Day peak | 同款 patriotic bucket hat，图片和标题成立 | `invDays=999`，3/7/30 天销量 `0/0/0`，FBA 可售 16、reserved 21、在途 61 | 匹配广告约 559 展示、0 点击、0 花费；`oob=0` | 不加预算；问题是低 CTR/低点击，不是预算。明天继续查关键词、match、bid 与 listing CTR |
| RU2411 | Graduation 垂直款，但经济性弱 | 图片/title 为 dental graduation decorations | `invDays=128`，3/7/30 天销量 `0/2/12`，利润率 -4.45%，净利 -0.0378 | 有 156 点击、0 单、花费 37.65；部分行显示 OOB，但不是有单赢家 | 不加预算；不能因 OOB 直接加预算。明天复查是否执行低效 auto/productAd 暂停或降价/页面修复 |

## 非纯节气/正常期或常年可卖

| SKU | 分类 | 不按纯节期加量原因 |
| --- | --- | --- |
| QQ1764 | Pride/rainbow + birthday/rainbow party，多场景常卖 | 标题是 rainbow tablecloth for birthday party；Pride 方向已在 2026-05-21 新建 `ai_kw broad_pride tablecloth_qq1764`，当前 7/30 天销量 `51/145`，广告 63 单、`oob=0`。市场证据显示 pride/rainbow 可小步验证，但不是只在 Pride 才能卖的纯季节款 |
| QQ2806 | rainbow party 正常期/多场景 | 7/30 天销量 `65/264`，广告 222 单、`oob=0`，库存天数 28；不是高库存纯节气出清对象 |
| WAR1276 | rainbow party 正常期/多场景 | 7/30 天销量 `41/172`，广告 96 单、`oob=0`，库存天数 35；不缺预算，不进纯 Pride 出清 |
| QUN5204 | Prom/Senior Night/Graduation/Wedding 多场景 | Listing 是 custom prom/senior night bouquet sash，Wedding/Graduation 都只是场景之一；近期已有 create/review 动作，当前不是纯节气放量 |
| HEL3107 | Graduation/Nurse 映射待复核 | 无图片证据，利润率 -28.82%，且广告词中出现 football keychain 方向；不能按泛 Graduation 加量 |
| TAN2986 | Nurse/CRNA 尾期 + graduation mention | Nurse Week 已进入 tail，graduation 不是主场景；虽有单但净利 -0.7751，不适合加量 |
| GT4431 / SC3527 / YAN0087 / GT3308 / LAY2384 | memorial/funeral/remembrance 或 fiesta/party 正常需求 | 这些 listing 里的 memorial 多为悼念/纪念品，不等于 Memorial Day patriotic；多数还有销量或库存不算高压，不按 Memorial Day 节日款处理 |
| HUA6645 | Wedding 候选但证据不足/投放失效 | 画像指向 bridal/wedding，但本轮无图片/title；广告 112 点击 0 单、花费 36.32，先修复/降噪，不加预算 |

## 市场证据

- Pride/rainbow：2026-05-21 selection 数据显示 `rainbow party decorations`、`rainbow decorations`、`pride decorations` 有中低需求，竞争从中到高不等；keyword conversion 中 `rainbow party decorations`、`rainbow decorations` 可作为小步验证词，但数据明确为决策支持，不可单独触发加预算或新建大词。
- Memorial/patriotic：GUF3129/GUF3133 的图片和标题支持 patriotic bucket hat，但广告回读是无 OOB、低展示/低点击；应查投放层结构，不应先加 budget。
- Graduation：RU2411 垂直成立但点击无单，HEL3107/QUN5204/TAN2986 都存在身份错配、多场景或经济性问题；不能用 `graduation gifts` 泛词强行推。

## 已执行/回读

- 已刷新最新可用 snapshot、daily tasks、season title dry-run、season gap audit。
- 已完成 dry-run：`data/snapshots/execution_dry_run_2026-05-23.json`，未 live execute。
- 已回读重点 SKU 广告状态：上述候选没有可直接加 campaign budget 的真实预算卡量证据。

## 明日复查优先级

1. GUF3129/GUF3133：Memorial Day 到 2026-05-25（含）窗口很短，优先查 ad group 明细、搜索词、keyword/bid/match、主图 CTR；若仍无点击，补更窄且商品强相关的 hat 词，避免 `patriotic gifts`、`nurse gifts` 这类泛词。
2. QQ1764：复查 2026-05-21 Pride tablecloth 新组的展示/点击/单量；有点击无单则控 bid 或收窄词，不加预算。
3. RU2411：不要因 OOB 加预算；先看 0 单点击消耗行是否需要暂停/降 bid，并同步评估价格/页面。
4. HUA6645：先补图片/title 复核和搜索词质量；112 点击 0 单不应继续加量。
5. memorial/remembrance 组：继续从 Memorial Day patriotic 池移出，只按 funeral/remembrance 正常需求管理。
