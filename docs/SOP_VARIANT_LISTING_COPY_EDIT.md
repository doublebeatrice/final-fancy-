# SOP: 变体 Listing 文案修改

适用场景：同一 parent ASIN 下多个子 SKU 共享标题/bullets 的变体组，需要修改文案时的决策流程和执行方法。

## 一、场景决策树

```
改动内容对所有变体都适用？
├── 是 → 改 parent_title + (可选) synchronize bullets
│       ├── 示例：季节词替换（graduation → back to school）
│       ├── 示例：品牌词调整、核心卖点统一优化
│       └── 用法见 §执行路径 A
│
└── 否 → 只改该子体
        ├── 改 title_en + omitParentTitle: true
        ├── 示例：某颜色变体独有的卖点角度（TUR9541 Black 独有 Father's Day）
        └── 用法见 §执行路径 B
```

## 二、参数速查

| 参数 | 值 | 含义 |
|------|-----|------|
| `variantStatus` | `2` | 默认，不同步变体 |
| `variantStatus` | `1` | 有变体同步（必须配合 synchronizeVariantSkus） |
| `omitParentTitle` | `true` | 只改 title_en，不发 parent_title 字段 |
| `synchronizeFields` | `["parent_title", "bullet_points5"]` 等 | 要同步到兄弟变体的字段列表 |
| `synchronizeVariantSkus` | `["PR2214"]` 等 | 要接收同步的兄弟 SKU 列表 |

**联动规则：**
- `synchronizeVariantSkus` 为空时，代码会自动清空 `synchronizeFields`（无论 schema 写了什么）
- 有 `synchronizeFields` 但没写 `synchronizeVariantSkus` → 后端报错"请选择要同步的变体"

## 三、执行路径 A：改 parent_title + 同步变体

适用：季节换词、核心关键词布局调整等所有子体共用的改动。

### 步骤

1. **Dry-run 生成 schema**
```bash
node scripts/execute/edit_listing_copy.js --sku <SKU> --title "<新标题>" --bullets "<B1|||B2|||B3|||B4|||B5>" --remark "<改动原因>"
```

2. **手动修改 schema JSON**（CLI 目前不支持 parent_title 和同步参数的直接传入）
```javascript
// 修改 data/snapshots/listing_copy_edit_schema_<sku>_<date>.json
const action = data.items[0].actions[0];

// 1. 改 parent_title（把新标题去掉颜色括号部分）
action.now.parentTitle = action.original.parentTitle.replace('旧词', '新词');

// 2. 加同步参数
action.synchronizeFields = ['parent_title', 'bullet_points5']; // 需要同步的字段
action.synchronizeVariantSkus = ['PR2214', 'PR2460'];          // 兄弟 SKU 列表
```

3. **用 schema 提交**
```bash
node scripts/execute/edit_listing_copy.js --sku <SKU> --schema <schema文件路径> --remark "<改动原因>" --execute
```

4. **验证**
   - 提交返回 `submitted: 1` 只代表进入审核队列
   - 审核通过后需要回读 sellerinventory 确认前台标题已变
   - 检查兄弟 SKU 的标题是否也同步更新

### 实操案例：PR4192 (2026-06-30)

- 场景：Graduation Gifts → Back to School Gifts，两个变体 PR4192 + PR2214 共享标题
- parent_title 改了、bullet 5 改了、同步到 PR2214
- 结果：submitted 1，等审核

## 四、执行路径 B：只改单个子体 title_en

适用：某个颜色/款式变体需要独立标题角度，其他变体不改。

### 步骤

1. **Dry-run**
```bash
node scripts/execute/edit_listing_copy.js --sku <SKU> --title "<新标题>" --remark "<改动原因>"
```

2. **手动修改 schema JSON**
```javascript
action.omitParentTitle = true;  // 关键：不发 parent_title
// 不需要 synchronizeFields 和 synchronizeVariantSkus
```

3. **提交**
```bash
node scripts/execute/edit_listing_copy.js --sku <SKU> --schema <schema文件路径> --remark "<改动原因>" --execute
```

### 实操案例：TUR9541 (2026-06-08)

- 场景：Black 变体独有 Father's Day 标题角度
- 只改 title_en，omitParentTitle: true，不同步
- 之前错误提交了 parent_title 导致撤回重来

## 五、前置检查清单

执行前必须确认：

- [ ] 查清 parent ASIN 下有哪些子 SKU（用 `fetch_product_analysis_query2.js --parent-asin` 或从 all_sku_operating_review 里按 SKU 前缀找）
- [ ] 确认该变体组是"共享标题"还是"区分标题"（看 sellerinventory 的 `separate_title_remark` 字段）
- [ ] 如果是共享标题组 → 默认走路径 A
- [ ] 如果是区分标题组 → 默认走路径 B
- [ ] 检查是否已有同组变体的 parent_title 申请在审核中（会触发 `covered_by_existing_variant_application`）

## 六、后端拒绝处理

| 返回状态 | 含义 | 处理 |
|----------|------|------|
| `covered_by_existing_variant_application` | 同组另一个变体已提交了 parent_title 申请 | 等那个审完再提，不算失败 |
| "请选择要同步的变体" | schema 有 synchronizeFields 但没 synchronizeVariantSkus | 清理 schema 或补上 SKU 列表 |
| `parent_title_child_term_added_unknown_product_label` | parent_title 加了系统不认识的产品标签词 | WARN 级别，不影响提交 |

## 七、CLI 当前限制

`edit_listing_copy.js` 目前的限制：
- `--title` 参数只写入 `title_en`（子体标题），parent_title 用 origin 原样回传
- `variantStatus` 写死为 2
- 没有 `--sync-to` 或 `--parent-title` 参数

**因此：凡涉及 parent_title 修改或变体同步，必须走 --schema JSON 路径。**

## 关联文件

- 核心逻辑：`src/listing_copy_edit.js` (line 188-503)
- CLI 入口：`scripts/execute/edit_listing_copy.js`
- 季节换词规则：`docs/SEASONAL_LISTING_COPY_RULES.md`
- 技术 spec：`docs/superpowers/specs/2026-05-09-listing-copy-edit-action-design.md`
- GBrain 案例：`D:\ad-ops-brain\decisions\2026-06-08-tur9541-fathers-day-title-ad.md`
