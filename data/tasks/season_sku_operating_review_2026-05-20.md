# 最近节气 SKU 经营复查 - 2026-05-20

口径：
- 工作日：2026-05-20；广告/销售数据日：2026-05-19；站点时区：America/Los_Angeles。
- 本轮覆盖最新节气缺口审计中的 26 个硬风险 SKU，并补充 11 个二阶观察 SKU；硬风险和观察项都必须经过 Amazon 前台 title/bullets/specs 身份复核后才能下路线。
- 选择系统证据：ABA 月度数据到 2026-04-30；关键词转化数据到 2026-05-03，有滞后，只作为市场热度和成本风险证据。
- 本轮没有执行 live 标题提交、广告新建、调价或补货动作；结论用于经营路线和下一次复查。

## 自审修正

前一版报告作废，以本版为准。前一版漏项的根因是：按 `season_gap` 节气入口分组后直接压缩路线，没有先逐 SKU 刷新 listing 主身份，所以把系统映射的 Wedding/Graduation/Nurse 等入口当成了真实主场景。QUN5204 漏 HOCO 就是这个断点暴露出来的结果。

这次已补上硬门槛：
- 每个风险 SKU 必须先看前台 title/bullets/specs，再判断主场景和副场景。
- `season_gap` 只负责告诉我哪里有风险，不负责替我判断产品是什么。
- 审计输出必须同时给硬风险池和二阶观察池；只给硬风险池不算过完。
- 能迁移的是场景框架、词根、人群和复查逻辑；不能迁移 bid、预算、放量级别、暂停逻辑。

## 当前节点

- Wedding Season：peak，2026-05-01 到 2026-08-31。
- Graduation：peak，2026-05-15 到 2026-06-20。
- Memorial Day：peak，2026-05-18 到 2026-05-25。
- Summer：preheat，2026-04-27 到 2026-05-31；peak 从 2026-06-01 开始。
- Father's Day：preheat，2026-05-10 到 2026-06-13。
- Mother's Day、Nurse Week、Teacher Appreciation 已进入 tail，不再作为新放量主节点。

## 市场证据

- patriotic gifts：ABA searchVolume 3347、orders 1164、需求中等、竞争中等；关键词转化缺失。只适合低预算验证，不适合直接放量。
- bridal party gifts：ABA searchVolume 14291、orders 3411、竞争高；关键词转化 purchaseVolume 20、clickPurchaseRatio 1.78%、CPA 约 60，高成本，只能结合具体 SKU 场景验证。
- graduation gifts：ABA searchVolume 186690、orders 30342，需求高但竞争高；关键词转化 purchaseVolume 1934、clickPurchaseRatio 3.9%、CPC 约 1.49，能用但不能给弱匹配 SKU 泛投。
- christian gifts：ABA searchVolume 43617、orders 8574，竞争高；关键词转化 clickPurchaseRatio 1.36%，质量弱，高风险，不建议直接泛化到 Father/Pastor 线。
- summer party supplies：ABA searchVolume 2799、orders 890，需求低且竞争高；夏季 SKU 先做 pool float / birthday pool 这种精准池。
- cna nurse gifts：ABA 和关键词转化都缺 exact 数据；Nurse Week 已 tail，不能作为新放量主理由。

## 经营路线

### 1. 库存紧，不放量

SKU：WOO0174、WOO0173、QAA4200、OCE1413、RHO1540、OB4139。

判断：
- WOO0174/WOO0173：listing 是 employee appreciation / teachers / CNA nurses / volunteers / office staff / graduation mini notebooks，Graduation/Nurse 有支撑，但库存紧，不能扩大。
- QAA4200：listing 是 crown brooch pins for mother/women/employee appreciation，Wedding/Nurse 是错配，不按婚礼护士扩。
- OCE1413：listing 是 wedding officiant book / pastor minister ceremony journal，Wedding 成立，但它是 officiant/ceremony 用品，不是泛 Christian/Father gift。
- RHO1540：bridesmaid proposal sticker，Wedding 成立；库存紧。
- OB4139：Mexican duck piñata / Cinco de Mayo / fiesta / birthday party，Wedding/Nurse 错配；当前还利润为负、sellableDays 只有 6 天。

路线：先控量保库存和利润，不做节点扩量。WOO 只保护已验证 appreciation/CNA/graduation 转化方向；QAA/OB 从 Wedding/Nurse 放量池移出；OCE/RHO 保留 Wedding 但只窄到 officiant/bridesmaid proposal。

复查：2026-05-21 看 sellableDays、7d 订单、广告花费和在途；Ful+Res 低于 10-15 天仍未补上，继续限量。OB 若利润仍负，不因 fiesta/party 继续加流量。

### 2. Memorial Day 爱国款，小步验证

SKU：GUF3129、GUF3133、UY1624。

判断：三款 listing 都支持 Patriotic/Memorial/4th of July。GUF3129/GUF3133 是 patriotic bucket hat；UY1624 是 patriotic disposable tablecloth。Nurse Week 对这组不成立。

路线：只看 patriotic bucket hat / American flag hat / patriotic tablecloth / Memorial Day table cover 这类产品词。UY1624 利润为负，不新增 broad 流量；GUF 两款可低预算验证，但 Memorial Day 已在 peak 中段，不能当主推。

复查：2026-05-22 看 GUF 两款是否有曝光、点击和首单；2026-05-25 前仍无有效点击或订单，进入 tail 控制。

### 3. Father's Day / Pastor Christian 线，精准不泛化

SKU：STA2604、STA2607、STA2610。

判断：listing 均为 Pastor Father's Day Christian Church gifts，Father/Pastor 成立；Nurse 不成立。父亲节仍在 preheat，但三款利润为负，且 christian gifts 市场转化质量弱，不能用大词放量。

路线：仅做 pastor gift / father's day christian gift / church pastor notebook 这类 exact/phrase 小额验证；不做 broad christian gifts、dad gifts 泛扩。

复查：2026-05-22 看 listing 身份对应搜索词、点击和利润；若 3 天内只有点击无订单，先回到页面/价格/利润修复。

### 4. Graduation / Nurse 线，先剔除错配

SKU：HEL3107、TAN2986、EY5555；WOO0173/WOO0174 归入库存紧组。

判断：
- HEL3107：football Senior Night keychains，Senior Night 成立，泛 Graduation 降级；Nurse 不成立。
- TAN2986：Nurse Week / CRNA / anesthetist bracelet，Nurse 成立但已 tail；Graduation 错配。
- EY5555：Bible Mother's/Father's Day Christian keychains，Graduation/Nurse 错配，应归 Christian/Mother/Father/church gift。
- WOO0173/WOO0174：Graduation/Nurse listing 支撑成立，但库存紧，不放量。

路线：HEL3107 只走 football senior night / team gift；TAN2986 不拿 Graduation 做理由，Nurse Week tail 只保留低成本精准或清库存；EY5555 从 Graduation/Nurse 池移出，回到 Christian/Father/Mother gift 判断。

复查：2026-05-23 看 7d 点击、搜索词、订单和利润。没有精准订单的 SKU 不再用 graduation gifts 大词续测。

### 5. Wedding 线，保留真婚礼，剔除错配

SKU：JIN3992、HUA6645、LEM6585、QUN5204、LEM6577、QA3275、SAN1203、SAN1225、CEE0467；库存紧的 QAA4200、OCE1413、RHO1540、OB4139 已单列。

判断：
- Wedding 成立但必须窄投：JIN3992 是 table numbers for receptions/banquets/restaurants/wedding；LEM6577/LEM6585 是 wedding centerpieces / vases；QA3275 是 wedding fans；HUA6645 是 bridal panties / bachelorette favors。
- QUN5204：listing 主场景是 Senior Night / Prom / HOCO/Homecoming / Graduation bouquet sash，Wedding 只做副场景承接。
- Wedding 错配或弱映射：SAN1203/SAN1225 是 cowboy hat + bandana western/cowboy party；CEE0467 是 dessert cups / fruit cake mini snack bowls。不能按 Wedding 放量。

路线：Wedding 线拆成具体用途，不再统一进 bridal party gifts。JIN 走 table number/reception；LEM 走 centerpiece/vase；QA 走 wedding fan；HUA 因广告不可投/0 单高库存先观察或清库存；QUN5204 主线改为 Senior Night / Prom / HOCO / Graduation，Wedding 只作为副场景；SAN/CEE 从婚礼扩量池移出。

复查：2026-05-23 看 Wedding 精准点击质量和订单；2026-05-27 看是否连续出单。若只有点击无订单，路线切到图片/标题/价格；若无点击，再判断是否补精准结构。

### 6. Summer 预热线，pool float 精准池

SKU：YUT4458、MF6292。

判断：两款 listing 都是 48 inch inflatable number pool float / birthday pool party，Summer/pool 成立。MF6292 30d 5 单、7d 广告 1 单，有继续验证价值；YUT4458 花费 11.97 无广告订单，高库存，不能泛扩。

路线：保护 pool float / birthday pool / inflatable number float 这类贴合词；不泛投 summer party supplies。MF6292 小步验证；YUT4458 先控耗看精准词是否能转。

复查：2026-05-23 看点击质量；2026-05-27 看是否新增订单。Summer peak 前仍无精准订单，改为清库存/低成本曝光。

### 7. 二阶观察池，补充复查

SKU：LEM5778、GRA5177、YEO1463、KZ6722、MF3043、FE3232、SC3420、QUN1382、YAN0087、GT3308、SC3527。

判断：
- 可进入对应节气复查但不直接执行：GRA5177 是 bridal shower game，Wedding 成立；YEO1463 是 boonie/sun hat，Summer 成立；KZ6722 是 kpop/prom/graduation party decorations，Graduation/Prom 方向成立；MF3043 是 wedding guest book alternative，Wedding 成立；QUN1382 是 bouquet sash，Prom/HOCO/Graduation/Wedding 成立，但 sellableDays 28 天，不能再放量。
- 映射不可靠：LEM5778 是 pencils/stationery/teacher appreciation，不是 Wedding；FE3232 是 Father's Day Christian prayer journals，Graduation 不成立。
- 不是 Memorial Day 节日货：SC3420、YAN0087、GT3308、SC3527 都是 funeral / memorial / bereavement / remembrance 类产品，不能因为 listing 里有 `memorial` 就归入 Memorial Day 节日放量池。

路线：二阶观察池不直接执行广告或标题动作，只进入下一轮产品复查。GRA/YEO/KZ/MF/QUN 看真实场景的精准词和库存承接；LEM/FE 按 teacher/father/christian 回到真实人群；SC/YAN/GT 按库存承接、利润和补货判断，不按 Memorial Day 节日流量扩。

复查：2026-05-22 先看二阶观察池的 listing 身份、库存天数和 7d 搜索词；其中 QUN1382、YAN0087、GT3308、SC3420 先看是否要限量/补货，而不是加节点词。

## 总结动作边界

- 主推：无。
- 小步验证：GUF3129、GUF3133、MF6292、QUN5204；但 QUN5204 主线必须是 Senior Night / Prom / HOCO / Graduation，不是泛 Wedding。
- 控量保库存：WOO0174、WOO0173、QAA4200、OCE1413、RHO1540、OB4139。
- 修复/确认优先：SAN1203、SAN1225、CEE0467、TAN2986、HEL3107、EY5555、HUA6645、LEM6577、LEM6585、QA3275、YUT4458、STA2604、STA2607、STA2610。
- 二阶观察：LEM5778、GRA5177、YEO1463、KZ6722、MF3043、FE3232、SC3420、QUN1382、YAN0087、GT3308、SC3527；先复核身份和承接，不直接执行。
- 明确错配移出：SAN1203、SAN1225、OB4139、QAA4200、CEE0467、EY5555、TAN2986、HEL3107 从原泛节气池降级或移出。
- 经验沉淀：以后过节气 SKU 的顺序固定为硬风险池 + 二阶观察池 -> listing 身份 -> 节气窗口 -> 库存利润 -> 广告历史 -> 市场证据 -> 路线/复查。任何一步缺失，都只能叫粗筛，不能叫过完。
