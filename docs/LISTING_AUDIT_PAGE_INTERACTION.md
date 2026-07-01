# Listing 审核页交互规范

> 核心教训：审核页字段「填了值 ≠ 做完了」。很多字段有自己专属的选择器弹窗 / 单选开关 / 独立保存按钮。

## 固定动作

### 1. 开工先核对装箱数

- 核对逻辑：单产品=当前产品数量；组合无主次=整体数量；有主次=主产品数量；套装=套数
- 装箱数与产品信息（title_ch "共X个"）对不上，先问开发或用户
- 核对完把独立的「已核对」单选 `is_check_pack_number` 翻成「是」(value=1) 并保存

### 2. Search items 填完点"格式化+清除重复"

- 不点的话词条不规整、词条数算错
- 格式化后会去重压缩（我写 242 字，格式化后落 143 字才是真值）
- 广告核心/低竞争/长尾三类词要一行一个（换行分隔）

### 3. 商标/上传类别走弹窗选

- `register_type=28`/`type_num=2802` 直接写进去前端显示空、不算数
- 正确做法：点 `open_upload_type_btn` 弹窗 → 弹窗内层 iframe `openUploadTypeView` → `variant_select1`(父类)/`variant_select_child2`(子类) 是 layui 联动下拉，点 dd 选好 → 点弹窗里的「保存」
- 类别落地反映在主表单的 `us_upload_type` + `us_item_type` + `us_item_type_code`

## Listing 审核闸命令

```bash
npm run ops:listing:gate -- --product-id <id> --sku <SKU>
```

开一个全新审核页(新 tempid)、从实时后台读回每个坑字段，逐条判 PASS/FAIL/INFO。只读不翻，绝不替你做「关键词已填」提交。

实现：`scripts/execute/check_listing_audit_gate.js`。配套清单：`docs/NEW_PRODUCT_LISTING_CHECKLIST.md`。

### 关键实现细节

- 审核页是外壳里的同源 iframe，用 `iframe.contentWindow.document` 读
- Inventory-Token 所有 sellerinventory 内页共用同一个
- 开新页只能走 `window.layui.index.openTabsPage(url, title)`
- 就绪信号用 `title_en_file_audit`，不是 `variant_select1`
- 坑字段判定：已核对=`is_check_pack_number`(radio)；search 格式化用无重复词启发式；商标=`register_type`+`type_num`
- 闸每跑一次自清理 tab（按 tempid 匹配 lay-id 点 `.layui-tab-close`）

## 通则

遇到带「选择」「核对」「格式化」字样的按钮/单选，先假定它有独立交互+保存动作，别只塞字段值。写完任何字段都另开 fresh iframe(新tempid)独立回读确认落库。layui 单选/下拉要点渲染出的 `.layui-form-radio`/`dd` 不是改原生 input。
