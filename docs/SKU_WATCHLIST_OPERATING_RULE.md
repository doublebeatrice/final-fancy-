# SKU 待看池操作规则

## 目的

不要为每个 SKU 在对话里创建自动化。需要持续跟进的 SKU 统一进入 `data/tasks/sku_watchlist.json`，每天或每次点名查 SKU 时先读这个池，判断是否有未闭环事项、下次检查节点、目标和触发动作条件。

这个池解决的是“会不会继续看”的问题，不替代广告执行、listing 提交或效果复查工具。

## 什么时候进入待看池

- 季节、节日、事件窗口内的 SKU，尤其是预热期、爆发期、冷静期需要连续看展示、点击、广告位和转化。
- 已做过广告、listing、价格或结构修正，但还没有回读到目标结果。
- 前台、sellerinventory、广告命名、关键词、活动节点之间存在不一致。
- 用户指出判断错、漏看、误暂停、误加词、没有问最后经手人，且同类 SKU 可能受影响。
- 产品矩阵里可能有同节点兄弟 SKU，需要一起检查状态。

## 每条记录必须包含

- `sku` / `asin`
- `productIdentity`: 先写清楚是什么产品、给谁用、什么场景，不从广告名反推产品。
- `node`: 当前节点，例如 Juneteenth、Black History Month、Pride、Graduation。
- `phase`: cold_start、preheat、catch_up、burst、cooldown、off_window 等。
- `nextCheckDate`: 下一次必须检查的日期。
- `stageTargets`: 到某个日期前需要达到的展示、点击、广告位或 listing 落地目标。
- `openIssues`: 未闭环问题，按 listing、ads、market、owner、matrix 分类。
- `lastAction`: 最近一次做了什么、是否已经回读验证。
- `nextChecks`: 下次要跑哪些证据，不只写“继续观察”。
- `closeConditions`: 什么时候可以从待看池关闭。
- `escalation`: 如果需要问人，写最后经手人或应该追问的角色。

## 使用流程

1. 点名查 SKU 前，先在 `data/tasks/sku_watchlist.json` 查是否已有记录。
2. 如果有记录，先回答上次未闭环事项是否解决，再看新数据。
3. 如果本次执行了动作，必须写 `lastAction` 和证据文件，并更新 `nextCheckDate`。
4. 如果仍有风险，保留 `status=open` 或 `status=watching`，不能口头说完就关闭。
5. 只有 `closeConditions` 全部满足，才能改成 `status=closed`，并保留关闭原因。

## 边界

- 不在对话里主动创建每 SKU 自动化；只有用户明确要求“建自动化/提醒我”才创建。
- 不因为 SB/SBV 活动名含旧节日词就整组暂停；优先处理具体错词、错文案、错入口，保留可承接当前节点的结构。
- Black History Month、Juneteenth 等是黑人文化产品可使用的不同窗口，不是永久对错。当前窗口不主打的词可以暂停或降权，但要保留到对应节点复用。
- 已验证方向要继续承接展示和拓词；如果相关词有展示但没点击，优先小幅加 bid 做点击测试，不把加预算当成第一动作。
- 拓词时要检查客搜词；如果客搜词接口为空或只返回空壳数据，要明说数据不可用，并用已验证的买家表达、SBV/关键词转化词补充，但不能伪造成真实客搜词。
- 如果前台未落地，要看最后实际填文案/账户经手人；风险审核人不是默认最后责任人。
- 选品和市场证据只提供方向，不能单独触发加预算、加词或 listing 修改；仍要回到 SKU 产品身份、库存、利润、广告落地验证。
