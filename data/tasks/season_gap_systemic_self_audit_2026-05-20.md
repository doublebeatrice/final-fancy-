# 节气风险筛选系统性自审 - 2026-05-20

口径：businessDate 2026-05-20；dataDate 2026-05-19；来源 snapshot 为 `data/snapshots/latest_snapshot.json`。

## 结论

- 不是全链路系统性坍塌：用同一 snapshot 重建后，仍是 658 个任务、102 个活跃节气任务、26 个硬风险 SKU，和原审计一致。
- 硬风险入池是可解释的：26 个 SKU 都能被 `src/season_gap_audit.js` 的库存/销量/结构缺口规则解释。
- 但不是“无漏”：在 76 个未入硬风险池的活跃节气 SKU 中，发现 11 个阈值边缘观察项，需要作为二阶风险池补看。
- 真正坍塌点是解释/路线层：前一版把系统节气入口当成 listing 主身份，没有逐 SKU 做 title/bullets/specs 身份复核。

## 复算一致性

- 原审计：activeSeasonTasks=102，riskItems=26。
- 重建审计：activeSeasonTasks=102，riskItems=26。
- SKU 集合差异：missingFromRebuild=0，newInRebuild=0。

## 硬风险规则

- `critical_stale_season`：活跃节气内，sellableDays >= 180 且 units30d <= 2。
- `season_structure_stale_risk`：sellableDays >= 90、units30d <= 8、有结构缺口、profitRate >= 12%。
- `season_stale_watch`：sellableDays >= 120 且 units30d <= 5。
- `inventory_tight_no_scale`：sellableDays < 21 且 units30d >= 20。

## 二阶观察池

| SKU | ASIN | 节气 | 30d | 7d | sellableDays | profit | 7d Ads | 观察原因 |
|---|---|---|---:|---:|---:|---:|---:|---|
| LEM5778 | B0GBXVH5Z8 | Wedding Season/peak | 6 | 1 | 460 | -14.2% | 6.64/1 | stale_threshold_edge: sellableDays>=120 and units30d 6-8 |
| GRA5177 | B0F2MZ74S2 | Wedding Season/peak | 8 | 2 | 353 | 18.6% | 5.06/0 | stale_threshold_edge: sellableDays>=120 and units30d 6-8 |
| YEO1463 | B0GHXLR9YP | Summer/preheat | 8 | 2 | 323 | 1.4% | 9.32/1 | stale_threshold_edge + structure_gap_watch |
| KZ6722 | B0GV48BQ52 | Graduation/peak | 8 | 2 | 285 | 12.2% | 6.43/2 | stale_threshold_edge: sellableDays>=120 and units30d 6-8 |
| MF3043 | B0DMW4GC1S | Wedding Season/peak | 7 | 1 | 133 | 10.0% | 0.00/0 | stale_threshold_edge + structure_gap_watch |
| FE3232 | B0F23LD73K | Graduation/peak; Father's Day/preheat | 5 | 0 | 90 | -26.2% | 1.15/0 | structure_gap_watch: sellableDays>=90, units30d<=10, structure gap |
| SC3420 | B0C2HKSG2X | Memorial Day/peak | 54 | 17 | 30 | 37.1% | 27.05/5 | inventory_tight_edge: sellableDays 21-30 and units30d>=20 |
| QUN1382 | B0GPVPXWBX | Wedding Season/peak; Graduation/peak | 165 | 6 | 28 | 32.7% | 29.19/7 | inventory_tight_edge: sellableDays 21-30 and units30d>=20 |
| YAN0087 | B0BC8FT8MJ | Memorial Day/peak | 100 | 37 | 27 | 22.2% | 53.18/10 | inventory_tight_edge: sellableDays 21-30 and units30d>=20 |
| GT3308 | B0C1GPJBXQ | Memorial Day/peak | 101 | 20 | 26 | 26.5% | 56.86/10 | inventory_tight_edge: sellableDays 21-30 and units30d>=20 |
| SC3527 | B0CGV7S8V9 | Memorial Day/peak | 25 | 4 | 21 | 33.8% | 12.10/1 | inventory_tight_edge: sellableDays 21-30 and units30d>=20 |

## 二阶观察 listing 复核

11 个边缘 SKU 已重新抓取 Amazon 前台 listing，抓取成功 11/11。复核后不能把它们简单并回节气硬风险池，必须分三类：

- 节气/场景基本成立，进入下一轮节气复查：GRA5177（bridal shower game）、YEO1463（sun/boonie hat，Summer）、KZ6722（kpop/prom/graduation party decorations）、MF3043（wedding guest book alternative）、QUN1382（bouquet sash，Prom/HOCO/Graduation/Wedding）。
- 有库存或经营风险，但系统节气映射不可靠：LEM5778 是 pencils/stationery/teacher appreciation，不是 Wedding；FE3232 是 Father's Day Christian prayer journals，Graduation 映射不成立。
- 有库存紧风险，但不是 Memorial Day 节日货：SC3420、YAN0087、GT3308、SC3527 都是 funeral/memorial/bereavement/remembrance 类产品，不能因为 listing 里有 `memorial` 就归到 Memorial Day 节日池；这类应进库存承接/补货利润复查，不进 Memorial Day 放量。

这一步说明：风险筛选的硬指标层没有随机坍塌，但“节气词映射到真实产品场景”的层是系统性弱点，不只是 QUN5204 单点漏词。

## 后续边界

- 26 个硬风险 SKU：继续按已修正的 listing 身份报告执行经营复查。
- 11 个二阶观察 SKU：不能直接当已确认风险执行动作，但下一轮节气复查必须逐个看 listing 身份、库存利润和广告搜索词。
- 后续报告中必须同时输出：硬风险池、二阶观察池、被排除原因，不能只输出一个风险列表。
