# 通用流程：捞 SKU 历史出单词回现役广告组

> 2026-06-23 在 KV0324(B0B27MJTJT)首次跑通，可直接套到任意 SKU。

## 目标

给一个 SKU，把它历史上出过单、但现在没在投的词，捞回现役广告组，逐词高于 CPC 定价。

## 固定流程（7 步）

1. **拉广告结构(含暂停)**：`AD_STATE=4 node scripts/execute/fetch_sku_ad_product_data.js <SKU> 4 90` —— 默认 AD_STATE=1 只给在跑的，必须设 4 才看得到暂停老系列的 campId+groupId。
2. **全时间窗口拉每个老组的词**：`fetch_ad_group_rows.js <campId> <groupId> <accountId> 4 1 - 2022-01-01 2026-xx-xx`。一定要全时间(2022 起)——半年窗口会把累计出单看小一个数量级。property=1 是 SP 关键词。
3. **聚合**：按 keywordText 汇总 orders/clicks/sales/spend，排除自动桶词(substitutes/close-match/complements/loose-match)，算 CPC、ACOS。
4. **拉现役组在投词(state==1)对账**：哪些已在投(跳过)、哪些没覆盖。
5. **筛选规则**：出单>0 + ACOS≤30%(保本线) + 现役组未覆盖 → 候选。按出单量排序。超 30% ACOS 的剔掉。
6. **加词(不开新组、不复活老系列)**：`/keyword/createKeywordNew`，逐词 bid=历史CPC+几分，BROAD。
7. **回读确认**：API code=200 + 真实 keywordId 只是写入成功；必须用 `fetch_ad_group_rows.js` 读现役组确认 state==1 + bid 对。`findAllNew` 对零历史新词会漏读，别用它判落地。

## 为什么不复活老系列

暂停老结构是一年攒的"考古层"(反复测试的 -a/-a2/-cs/-ppc...)，整组开=激活里面所有垃圾词+14份预算同时烧，跟挣真实利润冲突。只搬好词进现役组，结构不增、预算可控。

## 提速版脚本

`scripts/revive_converting_terms.js <SKU> [--top N] [--execute] [--debug]`。一条 WS 连接里跑完发现(结构→拉词→对账→筛选→出bid清单)，~14-20s。默认 dry-run 打印清单，--execute 才写入+回读。

## 两个词源（缺一不可）

1. **暂停关键词组**(老品才有)——按 keywordText 全时间 orders 排。
2. **所有本-SKU组(在投+暂停)的出单客搜词**(`/customerSearch/targetFindAll`，GET，数组参数要 `key[]` 逐个 append，响应 data 是直接数组不是 data.records)。复活的金子大多在暂停的自动组的全时间客搜词里。只查在投组 = 系统性漏掉历史出单词。

## 客搜词污染护栏（两层）

- **第一层 SKU-owned 系列**：只从系列名含本 SKU token 的组取词(skuOwned 过滤)。共享大池直接排除。
- **第二层 只剔有近期外SKU实锤的词**：`UnitsSoldOtherSku7d>0 且 UnitsSoldSameSku7d<=0` → 剔。两个7天字段都为0(暂停/无近期数据)就保留，靠全时间 orders>0 + ACOS≤保本线 + 剔ASIN码/纯数字在下游兜底。
- 仍会漏网的跨类/品牌噪声——这些 ACOS 都过线了所以入选，执行后要人工扫一眼 top 清单，明显跨类/外SKU的当场 pause。机械过滤挡不住"语义跨类"，最后一道是人眼。

## YAN2278 翻车教训

之前脚本(a)客搜词只查在投组，把暂停SKU组全跳过；(b)用 `UnitsSoldSameSku7d>0` 当硬过滤。这俩叠起来让我误判"YAN2278 没词可捞"，实际漏了 20 个真实出单文本词。根因：`UnitsSoldSameSku7d` 是 7天近窗指标，对早就暂停的组永远是 0，拿它当全时间历史的护栏 = 把所有历史出单词误杀。
