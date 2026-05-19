# 节气相关 SKU 标签整理交接 2026-05-19

## 执行口径

- 这次只写库存标签，没改 listing，没改广告。
- 全量来源：`season_title_dry_run` 70 条、`season_gap_audit` 17 条、`activeSeasonTasks` 88 条。
- 合并去重：130 个相关 SKU。
- 执行前已逐个拉取 sellerinventory 实时英文标题，130/130 都有标题。

## 最终结果

- 相关 SKU：130
- 已写入：121（27 首批 + 94 补写）
- 跳过：9（无 formal aid）
- 未闭环：0

## 未写入 SKU

原因：当前库存快照没有 formal aid，不能安全调用库存标签更新接口。

| SKU | ASIN | 应写标签 |
| --- | --- | --- |
| AE2739 | B0BXDF9P7F | 婚礼未推免改 |
| MF2992 | B0D1VJWGXN | 夏季未推免改 |
| MF2995 | B0DX13SR8F | 夏季未推免改 |
| MF2998 | B0DX5Y7RZ9 | 夏季未推免改 |
| MH0525 | B09KLVT7NB | 婚礼存疑未推 |
| MH1806 | B09SW2NT6J | 婚礼存疑未推 |
| MM1820 | B0B3DGPSLG | 夏季未推免改 |
| OB1169 | B0B9Y2ZG9G | 过季待改未推 |
| TI2209 | B0CGV7S8V9 | 悼念未推免改 |

## 产品纠偏规则

- CAS4030 是 Juneteenth cupcake toppers，标签写「六月未推免改」，不归婚礼。
- 葬礼/悼念/红鸟纪念类写「悼念」，不硬写阵亡纪念日。
- baby shower / birthday / dessert cup / Kpop / camping 等弱匹配产品写「存疑未推」，不强行归节日。
- Easter / St. Patrick 保护页只写「保护未改」。

## 标签分组

| 标签 | 已写 SKU | 未写 SKU |
| --- | --- | --- |
| 婚礼未推免改 | GOO1089, GRA4861, GRA5177, HUA6645, HUQ0699, JIN1883, KA1589, LEM6577, LEM6585, MF3043, NAY0239, NAY0963, OYH0257, OYH0784, PIR4617, QA2074, QA3278, QA3896, QA4115, RHO0122, SHU2552, SII0421 | AE2739 |
| 夏季未推免改 | BOY1281, EY2727, MF6280, MF6292, MF6294, MF6328, RO2084, YEO1451, YUT2927, YUT2946, YUT4458, YUT4464, YUT4466 | MF2992, MF2995, MF2998, MM1820 |
| 婚礼存疑未推 | BOY3171, CEE0467, DH2686, HI3876, IFS0482, KZ6074, LNY3024, NO5155, SAN1203, SHQ0554, STY2760, WE3925, YMF0656, ZUN0779 | MH0525, MH1806 |
| 六月未推免改 | CAS4030 |  |
| 过季待改未推 | CL3650, EY0793 | OB1169 |
| 教会未推免改 | COT2347, LNE1321, SAW1720, XIH2672, XIH2677, YUN2187, ZO0891, ZO0892 |  |
| 复活保护未改 | COT3013, LEM8356, YUH4842, YUH4846, YUH4890 |  |
| 夏季存疑未推 | DH2685, HEL0606 |  |
| 父亲未推免改 | FE3232 |  |
| 教会未推待改 | GM2616, GM2620, GM2628, GM2634 |  |
| 实验免改未推 | GM3201, GM3207, GM3210, GM3213 |  |
| 悼念未推免改 | GT2491, GT3308, GT3801, GT3814, GT3815, GT4431, HAN0044, SC3527, WC2648, YAN0087, YAN3229, ZHW0104 | TI2209 |
| 爱国未推待改 | GUF3129 |  |
| 季节存疑未推 | HEL0319, QAA4200, UY0879 |  |
| 毕业未推免改 | HEL2829, LE5294, LE8150, LE8156, LE8168, LE8173, QA3169, RU2411 |  |
| 毕业未推待改 | HEL3107 |  |
| 毕业存疑未推 | HOS0946, LED3343 |  |
| 圣帕保护未改 | LEM7532 |  |
| 教会已推未改 | LO3817 |  |
| 母亲待改未推 | LO3821 |  |
| 未来已提未推 | OB3296, OB4139 |  |
| 婚礼不加免改 | OCE1413, RHO1540 |  |
| 教师尾期未推 | QA1157 |  |
| 同志已推已改 | QQ1764 |  |
| 悼念不加免改 | SC3420 |  |
| 父亲未推未改 | STA2604, STA2607, STA2610 |  |
| 护士尾期未推 | TAN2986 |  |
| 教会存疑未推 | UAN2600, UAN3644 |  |
| 夏季已推免改 | YUT4460, YUT4462 |  |

## 组长检查时可以这么说

- 之前报 27 个是错的，那只是首批已执行/风险 SKU，不是全量。
- 已重新全量合并：season title 70 条 + season gap 17 条 + active season 88 条，去重 130 个。
- 可写入的 121 个已全部写成功，剩下 9 个因缺 formal aid 没写。

## 证据文件

- `data/tasks/season_candidate_union_2026-05-19_fullcheck.json`
- `data/snapshots/season_tag_origin_check_2026-05-19_full130.json`
- `data/tasks/season_status_tag_plan_2026-05-19_full130.json`
- `data/snapshots/season_status_tag_execution_2026-05-19.json`
- `data/snapshots/season_status_tag_execution_2026-05-19_full130_supplement.json`
