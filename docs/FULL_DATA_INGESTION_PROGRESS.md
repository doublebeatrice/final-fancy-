# 全量数据接入推进记录

更新时间：2026-04-20

## 当前目标

修复并稳定当前扩展的全量数据抓取链路，覆盖：

- inventory 库存数据
- SP 广告 keyword 数据
- SP 广告 auto targeting 数据
- SP 广告 manual targeting 数据
- SB 广告 keyword 数据
- SB 广告 targeting 数据

当前阶段的核心目标是保证 inventory、SP、SB 数据能完整、稳定、可验证地抓取出来，并让 SB 和 SP 一样进入可调整流程。

## 关键约束

- 先复现问题，再修复问题，避免盲改。
- 不为了让测试通过而绕开真实页面或真实接口行为。
- 本阶段不修改业务竞价规则。
- SB 不再按只读处理；SB keyword / SB target 必须进入可调整池、策略输出和执行分组。
- inventory、SP、SB 的数据数量要区分后端原始行数和前端去重后的状态行数。
- 涉及页面跳转、接口分页、token/header 的修复都要尽量基于真实 Chrome 登录态验证。
- 后续多轮推进时，本文件需要持续更新，不能只依赖会话上下文。

## 已达成结论

### inventory 抓取

- inventory 不能只依赖当前 tab，也不能直接请求 `/pm/formal/list` 页面。
- 正确链路需要进入 sellerinventory 应用根页面，并通过 `layui.index.openTabsPage('/pm/formal/list', '产品数据分析-开发')` 打开业务 iframe。
- 有效接口请求依赖 iframe URL 中的 `Inventory-Token`。
- 直接访问接口或错误页面上下文时，可能出现 `list_table` / `table` / `formSelects` 不存在，或后端返回 500。
- 已增加页面准备检查：等待 iframe、搜索按钮、`list_table` 等对象就绪后再注入拦截逻辑。
- 已验证 inventory 可抓取全量：原始行数 1013，SKU 映射 717。

### SP 广告抓取

- SP 广告数据来自 `/keyword/findAllNew`。
- 广告 tab 如果停留在 `SkuSummary` 等页面，不会发起 keyword 数据请求，因此需要先切到 `https://adv.yswg.com.cn/vue/KeywordManage?...`。
- 已增加广告 keyword 页面准备检查，确保进入 keyword 管理页面后再注入拦截逻辑。
- `/keyword/findAllNew` 已验证 `limit=500` 可用。
- 旧的按 `timeRange` 做全量切片去重不适合作为主分页方案；但 `timeRange` 使用毫秒数组时，可用于补齐 3天 / 7天指标窗口。
- SP keyword 已改为基于 `limit=500` 的分页抓取，并发数当前为 6。
- 已验证 SP 全量抓取结果：
  - keyword 原始行数：8540
  - keyword 去重后：6681
  - auto targeting 原始行数：1560
  - auto targeting 去重后：1537
  - manual targeting 原始行数：1659
  - manual targeting 去重后：1629

### SB 广告接入

- SB 数据同样来自 `/keyword/findAllNew`。
- 已确认 property 映射：
  - `property: "4"` = SB keyword
  - `property: "6"` = SB targeting
- SB 不再只读。SB keyword 保存为 `sbKeyword`，SB targeting 保存为 `sbTarget`，进入 `adjustableAds`、Prompt、计划动作、UI 渲染和执行分组。
- 已验证 SB 全量抓取结果：
  - SB keyword：3531
  - SB targeting：31
  - SB 合计：3562

### header / token 问题

- `/keyword/findAllNew` 请求中，已有捕获 header 可能包含 `X-XSRF-TOKEN`。
- 如果程序再追加小写 `x-xsrf-token`，且值与已有 header 不一致，后端可能返回 500。
- 已修复为：仅当 header 中不存在任意大小写形式的 `x-xsrf-token` 时，才补充 token。

### 当前验证结果

- Chrome 登录态下已完成一次全量抓取验证。
- 已通过静态检查：
  - `node --check extension\panel.js`
  - `npm.cmd test`

### 2026-04-20 随机 5 个 SKU dry-run

- 目标：从当前扩展面板 `STATE.productCards` 中随机抽 5 个有广告数据的 SKU，只生成策略，不执行竞价写回。
- 数据来源：Chrome 扩展面板当前内存状态，未重新触发抓数，未点击执行按钮。
- 模式：`dry-run-no-bid-write`。
- 规则来源：`src/adjust_lib.js::analyzeCard`。
- 快照文件：`data/snapshots/dry_run_random_5_skus_2026-04-20.json`。
- 当前面板计数：
  - productCards：426
  - eligibleSkus：345
  - inventory SKU：717
  - SP keyword：6681
  - SP auto target：1537
  - SP manual target：1629
  - SB rows：3562
- 抽样 SKU：
  - BEU0541：触发 1 个 autoTarget 降价建议。
  - GGN2452：触发 1 个 autoTarget 降价建议。
  - OCE2575：未触发调价动作。
  - QA0828：触发 2 个 autoTarget 提价建议。
  - QA4115：未触发调价动作。
- 注意：本次只读 `data/adjustment_history.json` 用于冷却期判断，没有写入历史，没有调用广告写接口。

### 2026-04-20 人工复查后的规则反馈

- BEU0541：
  - 不能因为单个 target TACoS 高就整体偏降。
  - 该产品是 Retirement Gifts，5 月有小高潮，应判断节日窗口、展示点击是否充足。
  - 转化差的投放可以小幅降一点，但其他有潜力词/target 应加投并扩大测试，避免整体展示点击下滑。
- GGN2452：
  - 当前是新品，并且属于谢师周预热产品。
  - 已验证能出单的词/target 应加投。
  - 只有少量点击的有效方向不应降价，应尽快加投拿更多展示点击。
- QA0828：
  - 产品已经在下滑，应更积极拉展示点击。
  - ACOS < 20%：大力加投。
  - 20% <= ACOS < 30%：小幅加投。
  - ACOS >= 30%：小幅降投。
- QA4115：
  - 最近展示点击没了，应打开加投，维持展示点击，而不是因为当前规则未触发就不动。
- 规则缺口：
  - 当前 `analyzeCard` 过度依赖 30 天 TACoS / 点击阈值，缺少产品阶段、节日窗口、趋势、验证词状态和探索预算逻辑。
  - 当前面板中这些 SKU 的 3/7 天展示点击字段为 0，无法支撑“最近下滑/没展示”的自动判断，需要继续确认是接口字段映射缺失还是数据源本身没有返回。

### 2026-04-20 修复 3天 / 7天广告指标

- 复现：
  - 当前原始 `STATE.kwRows` / `STATE.autoRows` / `STATE.targetRows` / `STATE.sbRows` 默认只有 `Spend`、`Orders`、`Clicks`、`Impressions`、`ACOS` 等主指标。
  - 原代码 `readStats(r, 3)` / `readStats(r, 7)` 会读取 `spend3`、`clicks7` 等字段，但这些字段默认不存在，所以产品画像里的 3天 / 7天广告数据稳定为 0。
- 根因：
  - `/keyword/findAllNew` 支持按 `timeRange` 拉不同时间窗口，但 `timeRange` 必须是毫秒时间戳数组。
  - 用字符串日期、`dateRange`、`startDate/endDate`、`statDays`、`days` 等参数不会生效，或会返回 500。
- 修复：
  - 在 30天主数据抓取完成后，按 7天和 3天分别重新请求 `/keyword/findAllNew`。
  - 覆盖 SP keyword、SP auto target、SP manual target、SB keyword、SB target。
  - 按 `keywordId` / `targetId` / `id` 把窗口指标合并回原始行，写入 `spend3`、`orders3`、`clicks3`、`impressions3`、`acos3` 和对应 7天字段。
  - 产品级 `adStats` / `sbStats` 也补充 `3d` 聚合。
- 真实验证：
  - 全量抓取完成：427 个产品画像。
  - 匹配结果：
    - SP关键词：7天返回 8647 / 匹配 5175；3天返回 8647 / 匹配 4689。
    - SP自动投放：7天返回 1560 / 匹配 1499；3天返回 1560 / 匹配 1438。
    - SP定位组：7天返回 1659 / 匹配 1462；3天返回 1659 / 匹配 1452。
    - SB关键词：7天返回 3531 / 匹配 3013；3天返回 3531 / 匹配 2919。
    - SB定位：7天返回 31 / 匹配 31；3天返回 31 / 匹配 31。
  - 抽样验证：
    - BEU0541：3天 7 点击 0 单；7天 20 点击 5 单；30天 112 点击 11 单。
    - GGN2452：3天 13 点击 1 单；7天 22 点击 1 单；30天 70 点击 3 单。
    - QA0828：3天 4 点击 1 单；7天 24 点击 3 单；30天 119 点击 21 单。
    - QA4115：3天 2 点击 0 单；7天 11 点击 0 单；30天 163 点击 7 单。
- 已执行检查：
  - `node --check extension\panel.js`
  - `npm.cmd test`

### 2026-04-20 SB 解除只读并进入可调整池

- 目标：SB 广告不再只展示不处理，和 SP 一样进入筛选、判断、动作输出和执行分组。
- 已改动：
  - `sponsoredBrands` 中的 SB 实体增加 `channel: "SB"`、`rawProperty` 和明确 `entityType`。
  - 导出和 Prompt 增加 `adjustableAds`，统一包含 SP keyword、SP autoTarget、SP manualTarget、SB keyword、SB target。
  - Prompt action schema 扩展为 `keyword|autoTarget|manualTarget|sbKeyword|sbTarget`，并允许 `bid|pause|review`。
  - UI 渲染明确显示 `SB关键词` / `SB定位`，冷却期检查包含 SB。
  - 执行入口新增 SB 分组：SB keyword 走关键词批量接口，SB target 走 target 批量接口，并在日志中单独统计。
  - `src/adjust_lib.js` 和 `auto_adjust.js` 纳入 SB action 生成与执行分组。
- 仍需验证：
  - 当前只做最小流程验证和静态测试。真实 SB 写入需要小样本人工确认后台实际生效，不能只看接口返回。
- 最小验证：
  - 构造 `sbKeyword` bid 动作导入扩展面板后，UI 显示为 `SB关键词`，待执行计数为 1，执行按钮可用，checkbox 的 `data-type=sbKeyword`。
  - 构造含 SB 的产品画像生成 Prompt，确认包含 `adjustableAds` 和 `sbTarget`。
  - 已执行：`node --check extension\panel.js`、`node --check auto_adjust.js`、`node --check src\adjust_lib.js`、`npm.cmd test`。

## 已改代码和文档

- `extension/panel.js`
  - 增加 inventory 页面准备逻辑。
  - 增加广告 keyword 页面准备逻辑。
  - 修复重复注入拦截器时可能复用旧捕获状态的问题。
  - 修复 XSRF header 重复且值冲突的问题。
  - SP keyword 改为 `limit=500` 分页抓取，并增加并发抓取。
  - SB keyword / targeting 接入全量抓取，并纳入可调整池。

- `docs/FIELD_DICTIONARY.md`
  - 补充 SB `property: "4"` 与 `property: "6"` 字段含义。

- `README.md`
  - 更新当前项目口径：脚本抓数 + 规则文档 + Codex 分析 + 代码执行。
  - 说明 SB 当前进入可调整池、策略输出和执行分组。

## 待决问题

1. inventory 是否也要改成更大分页或并发抓取。

   当前 inventory 全量可抓取，但 1013 行大约需要几十秒。用户已明确指出全量导出不能长期按 50 条一页慢慢拉，SP/SB 已优化到 `limit=500`，inventory 仍需进一步确认接口是否支持更大 page size 或并发页请求。

2. SP 是否需要保留完整 raw rows。

   当前 SP 抓取日志里能拿到后端原始行数，但进入状态对象后会按 keywordId / targetId 去重。后续如果要做审计型导出，可能需要单独保存 raw rows 或 raw count 明细。

3. SB 写接口风险。

   SB keyword 当前按关键词批量接口分组，SB target 当前按 target 批量接口分组。仍需用小样本人工确认广告后台对 SB 写入返回和实际生效是否与 SP 完全一致。

4. 输出文件是否要增加抓取审计摘要。

   后续可以在输出 JSON 中增加本次抓取时间、各渠道 raw count、dedup count、分页参数、失败页记录，便于复查数量是否正确。

## 下一步计划

1. 继续用真实 Chrome 登录态验证 inventory 是否支持 `pageSize=500` 或等价大分页参数。
2. 如果 inventory 支持大分页，改为大分页；如果不支持，再做受控并发分页抓取。
3. 给全量导出结果补充抓取审计摘要，明确记录 inventory / SP / SB 的 raw count 与 dedup count。
4. 对 SP、SB、inventory 做一次完整回归抓取，确认数量、输出结构和页面链路都稳定。
5. 用小样本验证 SB keyword / SB target 写入接口返回和后台实际生效。

## 2026-04-20 SB 小样本真实写入闭环

- 目标：确认 SB 不只是进入执行池，而是真实写入广告后台后能查回生效。
- 样本：SB keyword `291673191471405`，关键词 `gifts for pastor from congregation`，原 bid `0.10`，0 花费/0 点击/0 订单。
- 发现：
  - 复用 SP keyword 接口 `/keyword/batchKeyword` 时，后端返回 `code:200 success`，但查回 bid 仍为 `0.10`，`updatedAt` 未变化，不能视为生效。
  - 广告后台前端 bundle 的真实分流为：SB keyword 使用 `/keywordSb/batchEditKeywordSbColumn`，SB target 使用 `/sbTarget/batchEditTargetSbColumn`。
- 验证结果：
  - 使用 `/keywordSb/batchEditKeywordSbColumn` 将样本 bid 从 `0.10` 写到 `0.11`，查回 `bid=0.11`，`updatedAt=2026-04-20 18:04:35`。
  - 随后写回 `0.10`，最终查回 `bid=0.10`，`updatedAt=2026-04-20 18:05:02`。
  - 刷新扩展面板加载新代码后，重新全量抓取：inventory 717 SKU、SP keyword 6759、SP auto 1531、SP target 1623、SB keyword 3531、SB target 31、产品画像 427。
  - 通过扩展计划导入和“执行已勾选项目”入口再次验证同一样本：导入后 UI 显示 `SB关键词`、`data-type=sbKeyword`；执行到 `0.11` 后查回 `bid=0.11`、`updatedAt=2026-04-20 18:20:50`；执行回 `0.10` 后查回 `bid=0.10`、`updatedAt=2026-04-20 18:21:19`。
  - SB target 也通过扩展执行入口验证：样本 `targetId=319296053156890`，原 bid `0.25`；执行到 `0.26` 后查回 `bid=0.26`、`updatedAt=2026-04-20 18:23:11`；执行回 `0.25` 后查回 `bid=0.25`、`updatedAt=2026-04-20 18:23:23`。
- 代码修正：
  - `extension/panel.js`：SB keyword 执行 endpoint 改为 `/keywordSb/batchEditKeywordSbColumn`；SB target 执行 endpoint 改为 `/sbTarget/batchEditTargetSbColumn`；SB 写入 payload 保留 `advType: "SB"` 和 SB 元字段。
  - `auto_adjust.js`：同步修正 SB keyword / SB target 的执行 endpoint 和 payload。
  - `docs/FIELD_DICTIONARY.md`、`README.md`：同步记录 SB 专用写接口。

## 2026-04-20 inventory 便签写入 / 追加写入

- 目标：广告实际执行成功或失败后，按 SKU 追加写入 inventory 便签，记录运营判断、策略、动作、目标、观察点、下次机会和执行结果。
- 接入路径：
  - `extension/panel.js` 的手动计划执行入口 `executePlan()`。
  - `auto_adjust.js` 的自动执行入口，复用扩展面板中的 inventory 便签写入函数。
- 实现：
  - `buildInvMap()` 保留库存行 `aid`，便签定位优先使用 `aid`，同时传 `sku`。
  - 单条新增/覆盖：`setInventoryNoteValue(sku, noteText)`，提交 `value=noteText`、`current_value=noteText`。
  - 单条追加：`appendInventoryNoteValue(sku, appendText)`，先读取 `oldNote`，构造 `finalNote=oldNote+appendText`，提交 `value=appendText`、`current_value=finalNote`。
  - 批量新增/覆盖：`setInventoryNotesBatch(items)`。
  - 批量追加：`appendInventoryNotesBatch(items)`。
  - 广告执行结果聚合：`appendInventoryOperationNotes(events)`，同 SKU 多个动作会合并为一次追加写入。
- 写接口硬约束：
  - URL：`https://sellerinventory.yswg.com.cn/pm/formal/update`
  - method：`POST`
  - content-type：`application/x-www-form-urlencoded; charset=UTF-8`
  - `type=note`
  - `credentials: include`
  - 每次执行从页面读取最新 `x-csrf-token`
  - `x-requested-with: XMLHttpRequest`
- Console 可运行脚本：
  - `docs/INVENTORY_NOTE_WRITE_SNIPPETS.md`
- 验证状态：
  - 已完成静态验证：`node --check extension\panel.js`、`node --check auto_adjust.js`、`node --check src\adjust_lib.js`、`npm.cmd test`。
  - 真实 inventory 写入闭环暂未完成：当前 Chrome 会话没有打开到 sellerinventory 的“产品数据分析-开发”业务 iframe，`fetchAllInventory()` 返回“库存产品列表未打开”。待用户在已登录页面打开该业务页后继续验证。

### 2026-04-20 inventory 直接 POST 抓数补充

- 用户确认 inventory 全量数据来自固定接口：
  - `POST https://sellerinventory.yswg.com.cn/pm/formal/list`
  - `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
  - 必带当前页面最新 `x-csrf-token`、`inventory-token`、`jwt-token`、`x-requested-with: XMLHttpRequest`、`credentials: include`
- 代码更新：
  - `fetchAllInventory()` 仍优先走原业务 iframe 捕获链路。
  - 如果 iframe 未打开或 30 秒内捕获不到 `/pm/formal/list` 请求，会 fallback 到 `fetchAllInventoryDirect(tabId)`。
  - direct fallback 使用 `/pm/formal/list` form-urlencoded POST，动态读取当前页面 token，不写死会话 token。
  - direct fallback 分页使用 `limit=500`，并发 4。
- 验证状态：
  - 静态检查通过。
  - 当前本地 Chrome DevTools 9222 端口断开，未完成真实 direct fetch 数量验证。

## 持续更新规则

后续每一轮推进后，需要同步更新本文件：

- 新发现的接口行为或页面行为。
- 已复现的 bug 和根因。
- 已修复的代码点。
- 真实验证的数量结果。
- 仍未解决或需要用户拍板的问题。
- 已执行的测试和未验证风险。

## 后续 SKU 策略输出默认维度

后续每个 SKU 的策略结论，除当前广告表现外，必须默认补充节气节奏判断：

- 当前主节气是什么，还剩多少天。
- 当前高峰是否已经过去，还是正在预热 / 峰值 / 收尾。
- 下一个可能有机会的节气是什么，距离还有多久。
- 脱离节气后的平时自然流量预期。
- 结合上述信息判断动作强弱：强加投、小幅加投、维持、小幅降投、强控。

该维度必须实际参与动作决策，不能只作为备注。典型影响：

- 节气预热期且已验证出单：同等 ACOS 下动作偏强，加投拿展示。
- 节气峰值剩余时间很短：优先保盈利词和高转化词，泛流量不大幅扩。
- 高峰已过且下个机会远：无单高点击词更快降，预算回收。
- 平时自然流量弱但下一机会近：保留基础展示，避免完全断流。
- 平时自然流量强：不因短期节气结束立刻归零，转为温和控投。
