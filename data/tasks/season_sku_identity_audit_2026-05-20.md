# 节气风险 SKU listing 身份自审 - 2026-05-20

口径：businessDate 2026-05-20；dataDate 2026-05-19；本次复查覆盖 `season_gap_audit_2026-05-20_latest.json` 里的 26 个风险 SKU。

方法：逐个 ASIN 重新抓取 Amazon 前台 title/bullets/specs；`season_gap` 只作为风险入口，最终主场景以 listing 明示产品身份为准。

## 自审结论

- 前一版主要问题不是单个 SKU 看漏，而是方法层漏了一步：先按节气分组写经营路线，没有先逐 SKU 刷新 listing 主身份。
- 26 个 SKU 里，明确节气错配或主场景被降级/误归类的有 9 个：SAN1203、SAN1225、OB4139、QAA4200、CEE0467、TAN2986、HEL3107、EY5555、QUN5204。
- 另有 5 个 SKU 节气方向成立，但必须窄到具体用途，不能泛化到大词：JIN3992、OCE1413、LEM6577、LEM6585、QA3275。
- 可信边界：这份表只能说明 listing 身份和经营路线修正；没有执行广告新建、调价、listing 提交或补货动作。

## 逐 SKU 身份对账

| SKU | ASIN | 系统节气入口 | listing 主身份 | 修正判断 |
|---|---|---|---|---|
| SAN1203 | B0FGD7Z84F | Wedding | cowboy hat + bandana western/cowboy party 配件 | Wedding 错配；不按婚礼季扩，最多看 cowboy/western party 精准验证。 |
| STA2607 | B0FND9XC4Y | Father's Day / Nurse Week | Pastor Father's Day Christian church gift | Father's/Pastor 成立；Nurse 不成立；只做 pastor/father/christian 精准词，不泛投。 |
| STA2604 | B0FN7P88D4 | Father's Day | Pastor Father's Day Christian church gift | Father's/Pastor 成立；利润为负，先低预算精准验证。 |
| JIN3992 | B0F2FH8TSZ | Wedding | table numbers for receptions/banquets/restaurants/wedding | Wedding 成立但它是桌号/宴会用品，不是 bridal party gift；关键词必须窄到 table number/reception。 |
| CEE0467 | B09SW2NT6J | Wedding / Nurse Week | dessert cups / plastic fruit cake mini snack bowls | Wedding/Nurse 弱或错配；按通用 food/party supply 看，不按婚礼或护士放量。 |
| HUA6645 | B0GDXPLX6B | Wedding / Nurse Week | bridal panties / bride underwear / bachelorette favor | Wedding 成立；Nurse 不成立；但广告不可投/0 单高库存，路线仍是观察或清库存。 |
| LEM6585 | B0FXVB2SYG | Wedding / Nurse Week | wedding centerpieces / galvanized flower bucket vase | Wedding 成立；Nurse 不成立；只能做 centerpiece/vase 精准线。 |
| HEL3107 | B0FVFJBZBW | Graduation / Nurse Week | football senior night keychain gifts for team players | Senior Night 成立，泛 Graduation 降级；Nurse 不成立；走 football senior night/team gifts。 |
| TAN2986 | B0FYDRZ1ZC | Graduation / Nurse Week | Nurse Week / CRNA / anesthetist appreciation bracelet | Nurse 成立但已 tail；Graduation 错配；不拿毕业季做放量理由。 |
| UY1624 | B0BKG9LWYR | Memorial Day / Nurse Week | patriotic disposable tablecloths for 4th/Memorial party | Memorial/Patriotic 成立；Nurse 不成立；利润负，不新增泛流量。 |
| GUF3129 | B0GWD724Y8 | Memorial Day / Nurse Week | patriotic bucket hat / American flag events | Memorial/Patriotic 成立；Nurse 不成立；低预算精准验证。 |
| GUF3133 | B0GWCK7H94 | Memorial Day / Nurse Week | patriotic bucket hat / American flag events | 同 GUF3129，同父体可迁移词根，不能迁移放量级别。 |
| YUT4458 | B0D1VMCWXL | Summer | inflatable number pool float / birthday pool party | Summer/pool 成立；按 pool float/birthday pool 走，不泛 summer party supplies。 |
| STA2610 | B0FND7GY4V | Father's Day | Pastor Father's Day Christian church gift | Father's/Pastor 成立；只做精准小额，利润为负先控风险。 |
| EY5555 | B0DX1Q6H4C | Graduation / Nurse Week | Bible Mother's/Father's Day Christian keychains | Graduation/Nurse 错配；应归 Christian/Mother/Father/church gift，当前不按毕业护士放量。 |
| MF6292 | B0GMNCFTF2 | Summer / Mother's Day tail | inflatable number pool float / birthday pool party | Summer/pool 成立；Mother's Day 不作为当前主节点。 |
| QUN5204 | B0GTTQX894 | Wedding / Graduation | bouquet sash / custom prom ribbon for Senior Night, Prom, HOCO, Graduation; Wedding 副场景 | 前一版漏 HOCO，且把 Wedding 权重放高；主线应是 Senior Night/Prom/HOCO/Graduation。 |
| SAN1225 | B0FGD832QJ | Wedding | cowboy hat + bandana western/cowboy party 配件 | Wedding 错配；同 SAN1203，不按婚礼季扩。 |
| LEM6577 | B0FXGN8CXZ | Wedding / Nurse Week | wedding centerpieces / galvanized flower bucket vase | Wedding 成立；Nurse 不成立；只做 centerpiece/vase 精准线。 |
| QA3275 | B0CT331WGQ | Wedding | wedding fans / bridal shower party favors | Wedding 成立；利润负且无广告订单，窄词观察，不放大。 |
| WOO0174 | B0CDLR134G | Graduation / Nurse Week | mini notebooks for employee appreciation, teachers, CNA/nurses, volunteers, office staff, graduation | Graduation/Nurse 都有 listing 支撑，但库存紧；保转化方向，不放量。 |
| WOO0173 | B0CDLQJTFN | Graduation / Nurse Week | mini notebooks for employee appreciation, teachers, CNA/nurses, volunteers, office staff, graduation | 同 WOO0174，库存紧优先，不因节点继续扩大。 |
| QAA4200 | B0FM3ZN2BK | Wedding / Nurse Week | crown brooch pins for mother/women/employee appreciation | Wedding/Nurse 错配；销量存在但靠母亲/女性/员工感谢方向，不按婚礼护士扩。 |
| OCE1413 | B0FHK5GS4F | Wedding | wedding officiant book / pastor minister ceremony journal | Wedding 成立；它是 officiant/ceremony book，不是普通 Christian/Father gift。 |
| RHO1540 | B0GLPCPFK9 | Wedding | bridesmaid proposal sticker / bridal shower wedding bachelorette | Wedding 成立；库存紧，控量保库存。 |
| OB4139 | B0GJRV1TCQ | Wedding / Nurse Week | Mexican duck piñata for Cinco de Mayo / fiesta / birthday party | Wedding/Nurse 错配；按 fiesta/piñata 和库存利润处理，不按婚礼季扩。 |

## 必须回写的路线变化

- `QUN5204`：主线改为 Senior Night / Prom / HOCO / Graduation，Wedding 只做副场景承接。
- `SAN1203/SAN1225/OB4139/QAA4200/CEE0467/EY5555/TAN2986/HEL3107`：从对应节气放量池移出或降级，先按 listing 真实身份窄验。
- `JIN3992/OCE1413/LEM6577/LEM6585/QA3275`：保留 Wedding，但关键词和复查必须窄到具体产品用途。
- `STA2604/STA2607/STA2610`：Father's Day 方向成立，但不是 nurse；高成本 christian/dad 大词不能直接放。
- `WOO0173/WOO0174`：Graduation/Nurse listing 支撑成立，但库存紧是硬约束，不能因节点扩大。
