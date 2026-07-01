# 广告端点与命令速查

## 往现有 SP 广告组加词

端点：`POST /keyword/createKeywordNew`

```json
{ "siteId": 4, "accountId": 737,
  "keywords": [{ "campaignId": "...", "adGroupId": "...", "keywordText": "...", "matchType": "BROAD", "bid": 0.65, "state": "ENABLED" }],
  "keywordGroups": [] }
```

- 逐词带 bid——可每个词卡在自己 CPC 之上
- 响应成功在 `data.keyword.success`(不是 data.success)，每项 `{index, keywordId}`；失败在 `data.keyword.error`
- 构造器：`auto_adjust.js` 的 `buildSpAppendTargetPayload`；单测 `tests/ad_append_payload.test.js`
- 产品定位用 `/advTarget/storeManualTarget`(positionType=productTarget)

## 整链开关

`buildStateToggleRequest`(auto_adjust.js)：
- SP系列：`/campaign/batchCampaign`
- SP词：`/keyword/batchKeyword`
- SB系列：`/campaignSb/batchSbCampaign`
- SB词：`/keywordSb/batchEditKeywordSbColumn`
- 自动定位：`/advTarget/batchEditAutoTarget`
- column:'state', ENABLED↔暂停

## 修改 SP 预算

`PATCH /campaign/batchCampaign`（不是 /campaign/editCampaign，那个 404）

```json
{
  "siteId": 4, "accountId": 737,
  "campaignNewArray": [{"siteId":4,"accountId":737,"campaignId":"<id>","budget":"8.00"}],
  "batchType": "add-budget-value",
  "batch_campaigns": ["<campaignId>"],
  "columnVal": ["8.00"],
  "campaignIdArray": ["<campaignId>"],
  "column": "budget",
  "property": "campaign",
  "operation": "dailyBudget"
}
```

SB 预算：`PATCH /campaignSb/batchSbCampaign`，`batchType: "budget"`，`batchValue: [<amount>]`。

此端点属 write-category，不需要 session-level "销售编号" 选择状态。

## 回读坑

`findAllNew` 是按花费/时间过滤的报表查询，新建零历史词不会立刻出现，会误报"没落地"。判落地用 `fetch_ad_group_rows.js`（按 campId+groupId 直读）。`findAllNew` 的 `name` 为空时只返计数不返行；`name` 过滤的是关键词文本不是系列名。

## 建广告快命令

### SP

```bash
npm run ops:sp:create -- --sku BOY1281 --mode auto --bid 0.7 --b2b --core-term "kids swim goggles" [--execute]
```

- mode: auto | keyword(配 --keywords) | product(配 --target-asins)
- --b2b = siteRestriction AMAZON_BUSINESS
- --budget 默认 3；不给 --account-id/--asin 会自动从 /product/adProductData 查
- 默认 dry-run，--execute 才真建
- 同类组默认拦，要 --allow-duplicate 才建
- execute 成功口径=后台返回 200+campaignId/adGroupId，约10秒
- --verify 做 0/20/45 秒完整重试回读（慢约65秒，改竞价/定位时才用）

### SBV

```bash
npm run ops:sbv:create -- --sku X --core-term "..." --keywords "≥3个词" --bid .. --budget .. [--execute]
```

SBV 需 video asset 先在库，缺了停在 video_asset_missing。

### SB 商品集

```bash
npm run ops:sb:collection -- --skus HL4017,HL4004,HL2535 --budget 10 --top 10 [--execute]
```

端到端：并行 resolve 每个SKU → 挖历史出单词 → 按出单量排 top10 → bid=加权平均CPC → 复用现有同ASIN的SB的品牌+Logo → 建SB → 独立回读创意。headline 默认 AUTO。需 ≥3 个同账户SKU。

### 批量补广告

```bash
npm run ops:ad:fill -- --spec soccer_line --lanes b2b-auto,b2b-keyword [--execute]
```

- lanes: b2b-auto | b2b-keyword | sbv | all
- 已有同 lane 自动跳过（幂等）
- spec 文件：data/specs/ad_fill_<name>.json

## SB 创意契约（manualCollection）

- brandLogoAssetID 必填，否则 CAMPAIGN_INCOMPLETE
- headline ≤ 32 字符，brandName ≤ 30
- titleType=AUTO 时不传 title
- 读创意：`GET /ad/getCreative?campaignId=..&accountId=..&siteId=..&adGroupId=..`（GET 不是 POST）
- 残件清理：`PATCH /campaignSb/batchSbCampaign` archive（state=3）
- 落地判定：AD_POLICING_PENDING_REVIEW + 空 creativeStatus = 正常待审

## SBV 视频素材同步

公司 OSS 视频同步到 Amazon 资产库：

```bash
node scripts/execute/sync_sbv_asset.js --sku YUT2840 [--execute]
```

底层：
1. `POST /amazonAsset/getExternalAssetUrl {type:'video',siteId,skuOrAsin:asin,accountId}` 获取 OSS 地址 + 品牌
2. `POST /amazonAsset/uploadAsset {siteId, accountId, fileList:[{url,name}], assetType:'VIDEO', assetSubTypeList:'LIFESTYLE_IMAGE', brandEntityId, brandRegistryName, source:''}`
3. url 要 `encodeURIComponent(decodeURIComponent(seg))` 规范化中文文件名
4. uploadAsset 200 只代表受理，异步审核/转码后才出现在 getAssetList

坑：`/amazonAsset/syncAsset` 不是这个用途——只能拉"已在 Amazon"的素材。

## 共享底座

`src/adv_backend.js`：openAdvWs / advRequest / resolveSkuAccount(sku→accountId/asin/siteId/现有campaigns)。全新没投过广告的 SKU 查不到 accountId，要手填 --account-id --asin。
