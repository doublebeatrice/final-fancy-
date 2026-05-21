# QQ1764 组长自查记录 2026-05-20

## 来源

- 转述：组长说 QQ1764 自查问题。
- 对象：QQ1764 / B0C1NF986W / Tudomro rainbow tablecloth。
- 当前判断口径：按 Pride Month / rainbow tablecloth 季节窗口 SKU 复查，不按普通单 SKU 广告问题处理。

## 产品判断

- QQ1764 是彩虹桌布 / Pride-LGBTQ / party tablecover 方向，主窗口在 5-6 月，当前是活跃窗口内持续跟进，不是冷启动。
- 5/18 已做广告侧小步修补：提已转化 rainbow/tablecloth 词，新增 `colorful tablecloth` exact 小预算测试；未改 listing。
- 5/19 后续修补已落地：`colorful tablecloth(s)` exact bid 修到 0.42，campaign budget 修到 3；主 auto 高相关目标修到 0.52。后台 5/20 读取显示这些值已落地。

## 证据

- 广告 SKU 摘要 7d：5260 展示、40 点击、11 单、销售 139.86、ACOS 12.71%，较前 7d 的 8 单 / ACOS 26.00% 好转。
- 广告 SKU 摘要 30d：23169 展示、180 点击、34 单、销售 366.63、ACOS 21.02%；展示、点击、订单仍低于前 30d，所以仍属于窗口内恢复/监控对象。
- 主 auto `queryHighRelMatches` 7d：995 展示、9 点击、3 单、ACOS 11.12%，是当前最稳的承接层。
- SP 手动 `rainbow tablecloth bulk` 7d：158 展示、2 点击、1 单、ACOS 10.68%，可继续观察。
- SBV 高质量组 7d：`rainbow tablecloth rectangle`、`rainbow table cloths for parties`、`plastic rainbow table cover` 均有出单，说明视频层仍能承接相关 tablecloth 流量。
- 新建 `colorful tablecloth(s)` exact 仍 0 展示；但 bid/budget 刚在 5/19 修补，5/20 当日基础指标还未返回，不能当天继续加码。
- 选品词证据：`rainbow tablecloth` ABA 月度搜索量 9350、估单 2566；关键词转化侧搜索量 1540、点击购买率 16.26%，属于可用主词。`colorful tablecloth` 转化侧点击购买率仅 2.01%、CPC/ACOS 风险高，只能小预算验证；`pride table cloth` / `tablecloth bulk` ABA 缺失或弱，不适合扩大为泛 Pride 放量。
- 低效池 2026-05-20 命中 `rainbow birthday party decorations`、auto broad、部分 SB broad 词，但决策均为 `adjustment_cooldown_not_elapsed`，不做重复压价。

## 处理

- 本次未新增执行动作：已有 5/19 bid/budget 修补已确认落地，今天没有新的安全加码依据。
- 当前保留：主 auto 高相关、B2B auto、tablecloth 手动词、已出单 SBV 层。
- 当前不做：不加泛 Pride / party broad；不继续抬 `colorful tablecloth`，等完整 1 天数据；不因低效池冷却中的 2-4 点击弱项立即二次降价。

## 补充修正：骄傲月命名层点击异常

- 复核后确认，骄傲月 / Pride 命名层本身确实异常偏弱，上一版记录没有把这一层单独拎出来，是漏表达。
- `QQ-gay day-solarTerm-a` 7d：0 展示、0 点击、0 花费、0 单。
- B2B phrase 组内 `pride party tablecloth`、`pride tablecloth`、`bulk rainbow tablecloth` 7d：均 0 展示、0 点击。
- SBV 高质量组内 `pride party table cover` 7d 96 展示、1 点击、0 单；`pride month party decorations` 2 展示、0 点击；`pride parade party supplies` / `lgbtq celebration` 0 点击。
- 主 SP 词组内 `pride party decorations` 14 展示、0 点击；历史 `pride decorations`、`+pride +decorations` 已是暂停态或无量。
- 结论修正：不能把 QQ1764 的 7d 总体好转等同于“骄傲月广告有效”。有效的是 rainbow/tablecloth 商品形态流量；泛 Pride / gay day / party decorations 层目前没有点击质量，应降级为观察或清理对象，不再作为放量主线。

## 因果判断修正

- 运营假设：去年销量好，很大概率是吃到了 Pride / rainbow 节点流量；今年骄傲月相关流量没有持续维护和加投，导致展示点击没有随窗口起量，进而拖累整体下滑。
- 当前证据支持这个判断的大方向：2026-05-20 拉取的 30d 广告摘要显示展示 23169 vs 前 30d 39626，点击 180 vs 273，订单 34 vs 44，销售 366.63 vs 555.51，流量和订单都明显低于前段；但 7d 经过修补后 ACOS 和订单改善，说明产品承接不是完全失效。
- 需要更精确地表达：今年不是“所有骄傲月流量都没了”，而是 Pride/gay day/泛 party 这条节点命名层没跑起来；真正有效的承接集中在 `rainbow tablecloth`、`rainbow table cover`、`rainbow tablecloth bulk` 等商品形态词。
- 操作含义：后续不能只维持原有低价 Q2/Pride 结构，也不能粗暴加泛 Pride。应把 Pride 节点词当作低成本验证层，主恢复线放在可转化的 rainbow tablecloth/table cover/tablecover party 词根，并查 Pride 命名层 0 展示的投放资格和结构问题。

## 复查点

- 2026-05-21 上午复查 `colorful tablecloth(s)` exact 是否开始有展示/点击。
- 同时复查主 auto 高相关层是否维持订单和 ACOS，若有点击无单再回退到 0.46-0.51 区间。
- 若 2026-05-21 仍 0 展示：先查 campaign/adGroup 审核、投放状态、关键词资格和类目竞争，不直接继续加 bid。
- 同步复查 Pride 命名层：若 `QQ-gay day-solarTerm-a` 继续 0 展示/0 点击，不再追 bid，先查投放结构/资格；泛 Pride 词只保留极低成本观察，预算和注意力回到 rainbow tablecloth / table cover / party tablecover 商品词。

## 可转述给组长

我复查了 QQ1764，这款是 5-6 月 Pride/rainbow tablecloth 窗口款，不是没处理。18 号已经补了 tablecloth/rainbow 方向，19 号又把没起量的 colorful exact 小预算测试修了 bid 和预算；今天后台已确认值落地。现在 7 天广告已经从前期 8 单 / ACOS 26% 修到 11 单 / ACOS 12.7%，但 30 天流量仍比前段低，所以继续盯恢复。今天不再盲目加泛 Pride 或 party 流量，等明早完整数据看 colorful exact 有没有开始起量，再决定继续修还是回退。
## 市场横向复查补充：同志/Pride 题材不是普遍断崖

- 2026-05-20 追加选品市场复查。月度 ABA 用 2026-04-30 对比 2026-03-31；周度 ABA 接口返回 `public.us_aba_last_week_2026_17 does not exist`，因此不作为判断依据。
- Pride 明确题材没有全盘下滑：`pride decorations` ABA 月搜索量 3073 -> 6753，预估订单 1090 -> 1932；`pride flags` 3894 -> 4896，预估订单 1300 -> 1558。
- Rainbow/tablecloth 商品形态词仍稳定：`rainbow tablecloth` 9355 -> 9350，预估订单 2540 -> 2566；`rainbow table cloth` 2649 -> 2600，预估订单 882 -> 880。
- 下滑主要出现在部分泛 rainbow 装饰词：`rainbow decorations` 14611 -> 6338，预估订单 3460 -> 1833；但 `rainbow party decorations` 26194 -> 24712 只小幅下滑，`rainbow party supplies` 2995 -> 3397 反而上升。
- 关键词转化侧仍有购买信号：`rainbow tablecloth` 搜索 1540、点击购买率 16.26%、CPC 中位 0.57；`pride decorations` 搜索 1713、点击购买率 8.88%、CPC 0.55；`pride table cloth` 搜索 128、点击购买率 14.89%、CPC 0.88，属于小众验证词。
- 与我方广告交叉后，问题更像“有市场，但我方没有充分吃到有效点击”：`pride decorations` 市场有量但我方活跃行 0，历史行已停用；`pride party decorations` 活跃 broad bid 0.36，7d 14 展示 0 点击，低于市场 CPC 0.66；`rainbow tablecloth` 市场 CPC 0.57，我方活跃词位最高 bid 约 0.46，7d 相关活跃行合计 290 展示 4 点击 3 单；`rainbow party decorations` 市场 CPC 0.89，我方活跃 exact/broad bid 0.28/0.24，7d 10 展示 0 点击。
- 修正结论：不能说同志/Pride 题材产品普遍下滑，也不能说完全只有我们。市场端是分化：泛 rainbow decorations 有回落，Pride 明确词和 tablecloth 商品形态词仍有需求；QQ1764 的主要问题是相关广告位存在但承接不足，尤其 Pride 命名层/party broad 层低点击或停用，主恢复应放在可转化的 `rainbow tablecloth/table cloth/table cover` 商品形态词。

## 2026-05-20 执行修正：Pride 独立建组

- 纠正前一版处理口径：Pride 不能继续混在 rainbow 组里修，否则看不清 Pride 流量是否真的起来。
- 已新建 Pride-only SP 关键词组 2 个，均按 QQ1764 现有 Pride 历史最高竞价 `0.72` 起投，预算各 `5`：
  - `ai_kw exact_pride tablecloth_qq1764`，campaignId `94563087816298`，adGroupId `269730990124943`。
  - `ai_kw phrase_pride tablecloth_qq1764`，campaignId `63208730504804`，adGroupId `220545508465053`。
- 两个组均投放 8 个 Pride 词：`pride tablecloth`、`pride table cloth`、`pride table cover`、`pride party tablecloth`、`pride party table cover`、`pride decorations`、`pride party decorations`、`gay pride decorations`。
- 执行链结果：create `api_success=2`，落地回查 `success=2`，无 not_landed/failed。
- 二次广告行回查：两个新组均已读回 8 个关键词，bid `0.72`，state `1`，createdAt 分别为 2026-05-20 12:15 左右。
- 下一次复查：2026-05-21 上午看两个 Pride 新组是否开始有展示/点击；如果还是没量，继续查投放资格/审核/类目竞争；如果有点击无单，先看搜索词是否跑偏，再决定降泛词或保留 tablecloth 词。

## 漏判复盘

- 首次过产品时，我把 QQ1764 先归成 `rainbow tablecloth` 商品形态款，看到主 auto、SBV、`rainbow tablecloth bulk` 还能出单，就把注意力放在保住 tablecloth 基本盘，没有把 Pride 作为独立主流量线拆出来。
- 这是漏判。QQ1764 虽然商品形态是 tablecloth，但 5-6 月的需求来源有一条明确 Pride 节点；去年流量参考也说明这个时间点应该看 Pride 是否起量，而不是只看 tablecloth 是否还能转。
- 我当时用了 7d 总广告好转遮盖了结构问题：7d 订单和 ACOS 改善，但 Pride/gay day/party decorations 命名层实际是 0 展示、0 点击或低点击，这一层没有单独报警。
- 我还把 Pride 词混在 rainbow 组里看，导致结论偏成“rainbow/tablecloth 还能承接”。正确做法应该是先拆成两层：Pride 节点流量是否起来、tablecloth 基本盘是否还能转化。
- 市场证据也没有第一时间放到正确位置。后面补看才发现 `pride decorations` 月度 ABA 不是没量，而是 3 月到 4 月在上升；所以问题更像我方 Pride 承接不足，不是市场没了。
- 后续同类复查规则：季节/节日产品不能只看 SKU 总表和已转化词；必须先按“节日节点词”和“产品形态词”分层，分别看市场、广告结构、当前出价、是否独立建组、是否有展示点击。
