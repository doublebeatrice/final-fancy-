# Listing 文案提交弯弯绕复盘

日期：2026-06-22
涉及 SKU：QUN5512
问题：提交标题修改为什么绕了这么多弯？

---

## 弯弯绕清单

### 弯弯绕1：标题来源错误
**现象**：我一开始用了 GBrain 中的旧标题，而不是 sellerinventory 中的实际标题
**根因**：前台标题（Amazon front-end）≠ sellerinventory 中的 parent_title
**代价**：第一次提交失败（origin_parent_title_mismatch）
**正确做法**：必须用 sellerinventory 的 `/kernel/productEditApply/getOriginData` API 获取真实原始标题，不能用前台标题或 GBrain 中的任何标题

### 弯弯绕2：Schema 格式错误
**现象**：创建的 schema 用了 `applications` 字段，但 `flattenListingCopyActions` 期望的是 `items`
**根因**：我没有事先查看 `src/listing_copy_edit.js` 中的 `flattenListingCopyActions` 源码
**代价**：第一次执行时 total=0，找不到任何 actions
**正确做法**：先读源码确认 schema 格式，再创建 schema

### 弯弯绕3：原始标题不包含完整信息
**现象**：sellerinventory 中的 parent_title 不包含 "6 Pcs" 和尺寸 "4.25\" x 35 \""
**根因**：Amazon 前台标题会显示完整信息，但 sellerinventory 中的 parent_title 可能只是核心标题部分
**代价**：原始标题对比失败
**正确做法**：必须用 sellerinventory 返回的 liveOriginTitle，不要试图补充信息

---

## 改进方案：一次过的 SOP

下次提交 listing 文案时，按以下步骤执行：

### Step 1：获取真实原始标题
```bash
# 通过浏览器 CDP 调用 sellerinventory API 获取原始数据
curl -b cookies.txt "https://sellerinventory.yswg.com.cn/kernel/productEditApply/getOriginData?sku=QUN5512&type=en"
```
或者在 schema 中不设置 `original.parentTitle`，让脚本自动从 sellerinventory 获取。

### Step 2：确认 schema 格式
Schema 必须用 `items` 数组，不是 `applications`：
```json
{
  "items": [
    {
      "sku": "QUN5512",
      "actions": [...]
    }
  ]
}
```

### Step 3：确认标题改动范围
根据 `generate_season_title_listing_schema.js` 中的 `buildListingTitleAction` 函数，标题提交必须：
- `entityType: "listing"`
- `actionType: "copy_edit"`
- `id: "listing::{productId}::{sku}::title"`
- 必须包含 `original.parentTitle` 和 `now.parentTitle`

### Step 4：执行 dry-run 验证
```bash
npm run ops:listing-copy -- data/snapshots/schema.json
```
确认 total=1, valid=1，再执行。

### Step 5：真正执行
```bash
npm run ops:listing-copy -- data/snapshots/schema.json --execute
```

### Step 6：确认提交状态
检查 `listing_copy_edit_execution_*.json` 中的 `finalStatus`：
- ✓ `submitted_pending_review`：已提交待审核
- ✗ `failed`：检查 `message` 字段的具体错误

---

## 一次性验证清单

提交前必须确认：
- [ ] 原始标题从 sellerinventory API 获取，不是从前台或 GBrain
- [ ] Schema 用 `items` 数组，不是 `applications`
- [ ] `original.parentTitle` 精确匹配 `liveOriginTitle`
- [ ] `now.parentTitle` 包含正确的改动
- [ ] Dry-run 结果显示 valid=1
- [ ] Execute 结果显示 submitted=1

---

## 工具脚本位置

| 文件 | 用途 |
|------|------|
| `src/listing_copy_edit.js` | 核心函数：`flattenListingCopyActions`、`normalizeCopyEditPayload`、`validateCopyEditAction` |
| `scripts/execute/run_listing_copy_edits.js` | 执行脚本：支持 dry-run 和 execute |
| `scripts/generators/generate_season_title_listing_schema.js` | Schema 生成器：展示 schema 格式 |
| `package.json` | `ops:listing-copy`：npm script 入口 |

---

## 失败错误及解决方法

| 错误 | 原因 | 解决 |
|------|------|------|
| `origin_parent_title_mismatch` | 原始标题不匹配 | 用 sellerinventory API 返回的 `liveOriginTitle` |
| `total=0` | Schema 格式错误 | 用 `items` 不是 `applications` |
| `productId` 为空 | SKU 映射失败 | 从 sellerinventory 获取真实的 `product_id` |

---

## 下次提交文案的快速流程

```
1. 用户确认改动 ✓
2. 获取真实原始标题（sellerinventory API）
3. 创建 schema（用 items 数组）
4. Dry-run 验证
5. Execute 提交
6. 确认 submitted_pending_review
7. 等前台生效
```

用这个流程，可以一次通过，不用反复试错。
