# QQ1764 广告放量交接 2026-05-18

## 范围

- 只处理广告。标题已由人工处理，本次未改标题、未改 listing。
- 基准日期：广告数据 2026-05-11 至 2026-05-17，执行时间 2026-05-18 20:32。
- SKU 状态：QQ1764 / B0C1NF986W，Amazon.com，正常销售，库存可承接。

## 执行结果

- `rainbow decorations`：keywordId `431419070503597`，bid `0.44 -> 0.49`，回查成功。
- `rainbow tablecloth bulk`：keywordId `435941565944397`，bid `0.36 -> 0.39`，回查成功。
- `rainbow tablecloth`：keywordId `450067628086915`，bid `0.25 -> 0.28`，回查成功。
- `rainbow tablecloth`：keywordId `369278764018218`，bid `0.17 -> 0.19`，回查成功。
- 新建 SP exact 测试广告：`qq1764_colorful_tablecloth_exact_20260518`，campaignId `5877292547169`，adGroupId `172760528154520`，日预算 `2`，默认 bid `0.32`，关键词 `colorful tablecloths`、`colorful tablecloth`，回查成功。

## 判断依据

- QQ1764 近 7 天总广告：5519 展示、44 点击、花费 19.75、6 单、销售 53.94、ACOS 36.61%。整体 ACOS 偏高，所以没有做整组预算上调。
- `rainbow decorations` 近 7 天 2 点击 1 单，ACOS 9.79%；近 30 天 11 点击 4 单，ACOS 16.10%，是当前最干净的老词赢家。
- `rainbow tablecloth bulk` 近 7 天 4 点击 1 单，ACOS 21.36%，可以小步修复。
- 自动搜索词 `rainbow tablecloth` 近 7 天 close-match 2 点击 1 单，ACOS 9.57%；选品转化工具也显示该词是强信号词。
- 自动搜索词 `colorful tablecloths` 近 7 天 1 点击 1 单，ACOS 4.78%；但 ABA 竞争偏高，所以只建 exact 小预算测试。
- `pride decorations`、`pride table cloth` 当前没有转化闭环，暂不放量。
- SB 新组 7 天无订单，暂不加预算。

## 明天检查

- 先看新 exact 广告是否拿到展示和点击，不要求当天必须出单，但搜索词必须贴合 tablecloth。
- 看 4 个提价关键词是否有展示/点击增量，若 3 天有花费无订单，优先回撤 `rainbow tablecloth` 两个低价修复词。
- 如果 `colorful tablecloth` exact 有点击无单，别继续加预算；等 3 天数据再判断。
- 如果 `rainbow decorations` 或 `rainbow tablecloth bulk` 继续出单且 ACOS 不恶化，再考虑下一轮小步提价或 placement。

## 证据文件

- `data/snapshots/action_schema_qq1764_scale_new_traffic_2026-05-18.json`
- `data/snapshots/execution_verify_2026-05-18.json`
- `data/snapshots/ad_group_rows_QQ1764_kw_7d_after_scale_2026-05-18.json`
- `data/snapshots/ad_sku_summary_QQ1764_7d_after_scale_2026-05-18.json`
- `data/snapshots/selection_keyword_conversion_rate_QQ1764_2026-05-18.json`
- `data/snapshots/selection_aba_search_terms_QQ1764_2026-05-18.json`
