# 瀛楁瀛楀吀 鈥?YSWG 骞垮憡璋冩暣鍙?
> 鏈€鍚庢洿鏂帮細2026-04-20
> 鍘熷垯锛欰=宸茬‘璁ゅ彲鐩存帴鐢紝B=楂樻鐜囨纭暀娉ㄩ噴锛孋=鏆備笉浣滄牳蹇冨垽鏂緷鎹?

---

## 涓€銆佸簱瀛樼郴缁熷瓧娈碉紙sellerinventory.yswg.com.cn锛?
### A 绫?鈥?宸茬‘璁?
| 瀛楁鍚?| 鍚箟 |
|--------|------|
| `sku` | SKU 缂栧彿 |
| `asin` | ASIN |
| `note` | 杩愯惀澶囨敞锛堝彲鑳借繃鏃讹紝鏉冮噸浣庯級 |
| `salesChannel` | 绔欑偣娓犻亾锛宍Amazon.com` = 缇庡浗绔欙紝鐢ㄤ簬杩囨护澶氱珯鐐归噸澶嶈 |
| `qty_30` | 杩?0澶╅攢閲?|
| `qty_7` | 杩?澶╅攢閲?|
| `qty_3` | 杩?澶╅攢閲?|

### B 绫?鈥?楂樻鐜囨纭紝浠ｇ爜鐣欐敞閲?
| 瀛楁鍚?| 鍚箟 | 娉ㄦ剰 |
|--------|------|------|
| `profitRate` | 绯荤粺鍒╂鼎鐜囧瓧娈?| **涓嶆槸鏈€缁堝噣鍒╂鼎鐜?*锛屾洿鎺ヨ繎绌鸿繍鍙ｅ緞鍒╂鼎鐜囥€備笉瑕佺洿鎺ョ瓑鍚屼簬鏈€缁堝噣鍒╃巼 |
| `dynamic_saleday30` | 鎸夎繎30澶╁钩鍧囬攢閲忚绠楃殑鍙崠澶╂暟 | 鏄?30澶╁彛寰勫簱瀛樺彲鍗栧ぉ鏁?锛屼笉鏄硾鎸囨墍鏈夊簱瀛樺ぉ鏁?|

### 寰呯‘璁ゅ瓧娈碉紙鏈夊瓧娈靛悕浣嗘湭鎻愬彇锛?
| 瀛楁鍚?| 鍚箟 | 鐘舵€?|
|--------|------|------|
| `lowestprice` | 褰撳墠鍞环锛堝 21.990锛墊 鉁?宸茬‘璁?|
| `net_profit` | Q1-Q3 鍙傝€冨噣鍒╂鼎鐜囷紙闈炴椇瀛ｏ級| 鉁?宸茬‘璁?|
| `busy_net_profit` | Q4 鍙傝€冨噣鍒╂鼎鐜囷紙鏃哄锛屽惈鏃哄浠撳偍璐癸紝鍙兘涓鸿礋锛墊 鉁?宸茬‘璁?|
| `seaProfitRate` | 娴疯繍鍒╂鼎鐜囷紙瀹為檯鍙戣揣鍙ｅ緞锛屾瘮绌鸿繍楂橈級| 鉁?宸茬‘璁?|
| `profitRate` | 绌鸿繍鍒╂鼎鐜囷紙闈炲疄闄呭彂璐у彛寰勶紝鍋忎繚瀹堬級| 鉁?宸茬‘璁?|
| `cost_price` | 鍥藉唴閲囪喘鎴愭湰锛堜笉鍚◣锛屼笉鏄畬鏁磋惤鍦版垚鏈級| 寰呴獙璇?|
| `inventory_amount` | 鏈湴鍙彂璐у簱瀛橈紙涓嶆槸 FBA 鍙敭搴撳瓨锛墊 寰呴獙璇?|

### 2026-05-19 local replenishment and FBA-plan fields

The product-list endpoint `/pm/formal/list` exposes several inventory layers that must not be collapsed into one "stock" number.

| Field | Normalized field | Meaning | Operating rule |
|---|---|---|---|
| `fulFillable` | `stockFul` | Amazon FBA fulfillable units | Use for immediate sellable pressure. |
| `reserved` | `stockRes` | Amazon reserved units | Count with Ful when judging Ful+Res sellable days. |
| `inbound` / `inbound_reserve` | `stockInb` | Amazon inbound | This is not local inventory and not a developer action by itself. |
| `shipping_amount` | `localPurchasedTotal` / `localInventory.purchasedTotal` | Local purchased/shipping total shown in the training doc's total/purchased line | It is pipeline evidence only; do not ask development to "催" it unless the operator confirms this is locally managed stock. |
| `inventory_amount` | `localGoodStock` / `localInventory.goodStock` | Local good stock / 本地正品仓 | This is the layer that can support arranging a new FBA shipment. |
| `available_inventory` | `localAvailableForPlan` / `localInventory.availableForPlan` | Local available for plan after same-day planned quantity | Prefer this for "can still arrange more FBA today". |
| `unstock_in_amount` | `localTestWarehouseStock` / `localInventory.testWarehouseStock` | Test/inspection warehouse stock | Not immediately available for FBA planning. |
| `shipping_amount - inventory_amount` | `localPendingAndTestStock` / `localInventory.pendingAndTestStock` | 未到/末仓-like pipeline stock | Do not tell development to convert it to good stock; wait until it appears in local good/available. |
| `fbaPlan` | `localFbaPlanAir` / `localInventory.fbaPlanAir` | FBAPlan air quantity | Existing plan; do not duplicate an arrangement request. |
| `fba_plan_sea` | `localFbaPlanSea` / `localInventory.fbaPlanSea` | FBAPlan sea quantity | Existing plan; do not duplicate an arrangement request. |
| `fba_plan_total` | `localFbaPlanTotalAir` / `localInventory.fbaPlanTotalAir` | Existing/已有人 air value | Treat as already planned/occupied. |
| `fba_plan_total_sea` | `localFbaPlanTotalSea` / `localInventory.fbaPlanTotalSea` | Existing/已有人 sea value | Treat as already planned/occupied. |
| `today_made_plan` | `localTodayMadePlan` / `localInventory.todayMadePlan` | Today's made plan value | Use to explain why available may be below good stock. |

Developer-facing replenishment rule: only local good/available stock with no existing FBA plan supports "please arrange FBA". Amazon inbound, pending/unarrived stock, test warehouse stock, and already planned FBA quantities should be reported as "pipeline/plan already exists" or omitted from developer messages when there is no action for them.

Season/MOQ replenishment rule: before any purchase or replenishment recommendation, classify the product node and read MOQ/minimum-order economics. Mexican / Cinco de Mayo / Fiesta / Pinata products peak before or on May 5 in the U.S.; after May 5, low FBA is not enough to ask for a new order unless current demand and MOQ consumption both support it. If MOQ is missing from the current export, block the replenishment message for MOQ confirmation rather than assuming a safe small order.

> **鍒╂鼎鐜囦娇鐢ㄥ師鍒?*锛?> - 鐩爣 ACOS 鍩哄噯浼樺厛鐢?`net_profit`锛圦1-Q3锛夋垨 `busy_net_profit`锛圦4锛?> - Q4锛?0-12鏈堬級鐢?`busy_net_profit`锛屽叾浣欐湀浠界敤 `net_profit`
> - `seaProfitRate` 鏄疄闄呭彂璐у埄娑︾巼鍙傝€?> - `profitRate`锛堢┖杩愶級鍋忎繚瀹堬紝涓嶄綔涓轰富瑕佸垽鏂緷鎹?> - 鍙戠┖杩愭潯浠讹細绌鸿繍鍒╂鼎鐜?> 娴疯繍鍒╂鼎鐜囷紝鎴栦骇鍝佸ソ鍗栨捣杩愭帴涓嶄笂璐?
---

## 浜屻€佸箍鍛婄郴缁熷瓧娈碉紙adv.yswg.com.cn锛?
### 鎺ュ彛璇存槑

| 鎺ュ彛 | property | tableName | 鍚箟 |
|------|----------|-----------|------|
| `/keyword/findAllNew` | `"1"` | 鈥?| SP 鍏抽敭璇?|
| `/keyword/findAllNew` | `"2"` | `product_target` | SP 鑷姩缁?|
| `/keyword/findAllNew` | `"3"` | `product_manual_target` | SP 瀹氫綅缁?|
| `/keyword/findAllNew` | `"4"` | 鈥?| SB 鍏抽敭璇嶏紝杩涘叆鍙皟鏁存睜锛屽姩浣滀负 `sbKeyword` |
| `/keyword/findAllNew` | `"6"` | 鈥?| SB 瀹氫綅锛岃繘鍏ュ彲璋冩暣姹狅紝鍔ㄤ綔涓?`sbTarget` |

### A 绫?鈥?宸茬‘璁?
| 瀛楁鍚?| 鍚箟 |
|--------|------|
| `keywordId` / `targetId` | 鍏抽敭璇?鎶曟斁鐩爣 ID锛堟墽琛岀珵浠蜂慨鏀规椂鐢級 |
| `keywordText` | 鍏抽敭璇嶆枃鏈?|
| `bid` | 褰撳墠绔炰环锛堟暟鍊硷級 |
| `campaignId` | 骞垮憡娲诲姩 ID |
| `campaignName` | 骞垮憡娲诲姩鍚嶇О锛堥€氬父鍚?SKU锛岀敤浜?SKU 妯＄硦鍖归厤锛?|
| `adGroupId` | 骞垮憡缁?ID |
| `groupName` | 骞垮憡缁勫悕绉?|
| `accountId` | 璐﹀彿 ID锛堟墽琛岀珵浠蜂慨鏀规椂蹇呴』浼狅級 |

For SP create actions, `campaignName` and `groupName` must be identical and follow the AI naming convention: `ai_auto_<term>_<sku>`, `ai_kw exact|phrase|broad_<term>_<sku>`, `ai_asin_<term>_<sku>`, or `ai_asin expanded_<term>_<sku>`. The term part keeps spaces, for example `ai_auto_dessert cups_mh1806`.
| `Spend` | 30澶╁箍鍛婅姳璐癸紙瀛楃涓诧紝闇€ parseFloat锛?|
| `Orders` | 30澶╁箍鍛婅鍗曢噺锛堝瓧绗︿覆锛岄渶 parseFloat锛?|
| `Sales` | 30澶╁箍鍛婇攢鍞锛堝瓧绗︿覆锛岄渶 parseFloat锛?|
| `Clicks` | 30澶╃偣鍑婚噺 |
| `Impressions` | 30澶╂洕鍏夐噺 |
| `CPC` | 骞冲潎鐐瑰嚮鎴愭湰 |
| `CTR` | 鐐瑰嚮鐜?|
| `ConversionRate` | 杞寲鐜?|
| `ROAS` | 骞垮憡鍥炴姤鐜?|
| `updatedAt` | 鏈€鍚庝慨鏀规椂闂达紝鐢ㄤ簬鍐峰嵈鏈熷垽鏂紙7澶╁唴涓嶉噸澶嶈皟鏁达級 |
| `SalesSameSku7d` | 杩?澶╁悓 SKU **閿€鍞**锛堜笉鏄鍗曟暟锛?|
| `SalesOtherSku7d` | 杩?澶╁叾浠?SKU **閿€鍞** |
| `UnitsSoldSameSku7d` | 杩?澶╁悓 SKU **閿€閲?浠舵暟** |
| `UnitsSoldOtherSku7d` | 杩?澶╁叾浠?SKU **閿€閲?浠舵暟** |
| `timeRange` | 骞垮憡鎸囨爣鏃堕棿绐楀彛锛屽繀椤讳娇鐢ㄦ绉掓椂闂存埑鏁扮粍锛屽 `[startMs, endMs]` |
| `spend3` / `orders3` / `clicks3` / `impressions3` / `acos3` | 绋嬪簭琛ラ綈鍚庣殑杩?澶╁箍鍛婃寚鏍囷紝鏉ヨ嚜鍗曠嫭鐨?`timeRange` 璇锋眰 |
| `spend7` / `orders7` / `clicks7` / `impressions7` / `acos7` | 绋嬪簭琛ラ綈鍚庣殑杩?澶╁箍鍛婃寚鏍囷紝鏉ヨ嚜鍗曠嫭鐨?`timeRange` 璇锋眰 |

### B 绫?鈥?楂樻鐜囨纭紝浠ｇ爜鐣欐敞閲?
| 瀛楁鍚?| 鍚箟 | 娉ㄦ剰 |
|--------|------|------|
| `ACOS` | 30澶?ACOS | **鍘熷鍊兼槸灏忔暟**锛屽 `0.088` = 8.8%銆俙null` 琛ㄧず鏃犳湁鏁堟暟鎹紝涓嶈褰?0 澶勭悊 |
| `matchType` | 鍖归厤绫诲瀷 | 澶ф鐜囷細`1`=broad锛宍2`=phrase锛宍3`=exact銆傚緟鎶芥牱楠岃瘉 |
| `state` | 鍏抽敭璇?鎶曟斁鐩爣鐘舵€?| 澶ф鐜?`1`=enabled锛屽叾浠栧€硷紙鏆傚仠/褰掓。锛夊緟鎶芥牱楠岃瘉 |
| `campaignState` | 骞垮憡娲诲姩鐘舵€?| 娲诲姩灞傜姸鎬侊紝涓嶆槸鍏抽敭璇嶆湰浣撶姸鎬?|
| `siteId` | 绔欑偣 ID | 绯荤粺鍐呴儴鏋氫妇鍊硷紝涓嶈纭紪鐮佸浗瀹舵槧灏?|
| `topOfSearchImpressionShare` | Top of Search 鏇濆厜鍗犳瘮 | 鎸夊瓧娈靛悕鐞嗚В鍩烘湰姝ｇ‘ |

### C 绫?鈥?鏆備笉浣滄牳蹇冨垽鏂緷鎹?
| 瀛楁鍚?| 鍒濇鐞嗚В |
|--------|---------|
| `placementTop` | **娉ㄦ剰**锛氬€兼槸瀛楃涓插 `"placementProductPage:0"`锛屽瓧娈靛悕鍜屽€煎涓嶄笂锛岄渶鎸夊€煎墠缂€瑙ｆ瀽锛屼笉瑕佹寜瀛楁鍚嶇‖璁?|
| `placementPage` | 鍚屼笂锛屽€兼槸 `"placementTop:0"` |
| `coreState` | 瀹炰綋鍐呴儴鐘舵€侊紝鍚箟寰呯‘璁?|
| `bidThreshold` | 绔炰环闃堝€?寤鸿涓婇檺锛屽惈涔夊緟纭 |
| `strategy` | 绔炰环绛栫暐锛堝姩鎬?鍥哄畾绛夛級锛屽惈涔夊緟纭 |
| `oldOrders` | 鍘嗗彶璁㈠崟閲忥紝闈炲綋鍓?0澶╁彛寰勶紝鍚箟寰呯‘璁?|
| `lowCost` | 浣庢垚鏈爣璁帮紝鍚箟寰呯‘璁?|
| `tableType` | 琛ㄦ牸/妯″潡绫诲瀷锛屽唴閮ㄥ瓧娈?|
| `testModule` | 娴嬭瘯妯″潡鏍囪锛屽唴閮ㄥ瓧娈?|

---

## 涓夈€佹墽琛岀珵浠蜂慨鏀规椂蹇呴』浼犵殑瀛楁

### SP 鍏抽敭璇?`/keyword/batchKeyword`
```json
{
  "column": "bid",
  "property": "keyword",
  "operation": "bid",
  "idArray": ["keywordId"],
  "targetArray": [{ "id": "keywordId", "bid": 0.45 }],
  "targetNewArray": [{ "id": "keywordId", "bid": 0.45 }]
}
```

### SP 鑷姩鎶曟斁/瀹氫綅缁?`/advTarget/batchEditAutoTarget`
```json
{
  "column": "bid",
  "property": "autoTarget",
  "operation": "bid",
  "accountId": 737,
  "siteId": 4,
  "idArray": ["targetId"],
  "campaignIdArray": ["campaignId"],
  "targetArray": [{ "siteId": 4, "accountId": 737, "campaignId": "...", "adGroupId": "...", "targetId": "...", "bid": "0.45" }],
  "targetNewArray": [鍚屼笂]
}
```

> **娉ㄦ剰**锛歜id 瀛楁鍦ㄨ嚜鍔ㄦ姇鏀炬帴鍙ｉ噷鏄?*瀛楃涓?*锛屼笉鏄暟鍊笺€?

### SB 关键词 `/keywordSb/batchEditKeywordSbColumn`
```json
{
  "column": "bid",
  "property": "",
  "operation": "bid",
  "accountId": 420,
  "siteId": 4,
  "idArray": ["keywordId"],
  "campaignIdArray": ["campaignId"],
  "targetArray": [{ "keywordId": "keywordId", "bid": 0.11, "siteId": 4, "accountId": 420, "campaignId": "...", "adGroupId": "...", "matchType": "broad", "advType": "SB" }],
  "targetNewArray": [同上]
}
```

### SB 定位 `/sbTarget/batchEditTargetSbColumn`
```json
{
  "column": "bid",
  "property": "",
  "operation": "bid",
  "accountId": 420,
  "siteId": 4,
  "idArray": ["targetId"],
  "campaignIdArray": ["campaignId"],
  "targetArray": [{ "targetId": "targetId", "bid": "0.45", "siteId": 4, "accountId": 420, "campaignId": "...", "adGroupId": "...", "advType": "SB" }],
  "targetNewArray": [同上]
}
```
---

## 鍥涖€佸緟琛ュ厖鏁版嵁婧?
| 鏁版嵁婧?| 鐘舵€?| 浠峰€?|
|--------|------|------|
| 15澶╁箍鍛婃暟鎹?| 寰呮帴鍏ワ紙鍙鐢?`timeRange` 姣绐楀彛鏂瑰紡锛墊 鍒ゆ柇涓湡瓒嬪娍 |
| Search Term Report | 寰呮帴鍏?| 鍙戠幇鏂拌瘝銆佸惁瀹氳瘝 |
| Placement 鏁版嵁 | 瀛楁瑙ｆ瀽鏈夐棶棰橈紝寰呬慨澶?| Top of Search vs Product Page ACOS 宸紓 |
| 浜у搧浠锋牸 | 寰呬粠搴撳瓨鎺ュ彛鎻愬彇 | 绮剧‘璁＄畻鐩爣 ACOS |
| 娴疯繍/Q1-Q3/Q4 鍒╂鼎鐜?| 寰呯‘璁ゅ瓧娈靛悕 | 鏇村噯纭殑鐩爣 ACOS 鍩哄噯 |

---

## 五、`/product/chart` 新增判断依据

`POST /product/chart` 现已作为正式判断依据之一，主要用途不是替代 `adSkuSummary`，而是补充 **SKU 级展示 / 点击绝对值趋势**。

### 适用场景

- 节气品、季节品判断是否该强加投
- 老品判断当前是“流量下滑”还是“转化下滑”
- 历史备注显示曾经降投，但当前业务判断认为应补量
- ACOS 偏高，但怀疑真正问题是展示点击已经明显衰减

### 判断优先级

1. 当前是否处于热卖窗口
2. 库存是否足够承接
3. `/product/chart` 的 impressions / clicks 绝对值是否在走弱
4. Listing 是否已具备承接能力
5. 再看 ACOS / 广告占比 / 历史备注

### 使用原则

- `/product/chart` 显示展示和点击绝对值持续下滑时，不应只因为历史 `downbid` 备注就继续机械降投
- 对节气品来说，当前流量趋势优先级高于历史某次调价记录
- 节日产品要先过产品逻辑：窗口、库存、已验证出单方向、核心流量、新流量、listing/价格/主图承接，再写便签
- 窗口内有库存要走时，补流量要优先沿已验证出单方向外扩：同词根、同场景、同人群、同竞品 ASIN；泛词只能小额测试
- 历史备注仍保留参考价值，但只能作为背景，不再单独决定今天的方向
