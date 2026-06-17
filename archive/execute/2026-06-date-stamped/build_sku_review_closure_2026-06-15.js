const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUSINESS_DATE = '2026-06-15';
const NEXT_WEEK = '2026-06-22';
const NEAR_TERM = '2026-06-18';

const DIRECT_REVIEW_SKUS = [
  'CAS4030', 'RU2438', 'GUF3133', 'QQ1764', 'GT4431', 'MF6294', 'STA2607',
  'DN2684', 'DN2683', 'DN3049', 'DN1655', 'DN1656', 'UAN0188', 'YUT3183',
  'PR2214', 'WC2648', 'YUT2847', 'DN3482', 'UG4758', 'NAY4632', 'UAN3644',
  'BEU0541', 'STA2604', 'STA2610', 'UTE4258', 'MTY1808', 'XIH2562',
  'XIH2559', 'XIH2677', 'GT2491', 'XUE0890', 'TM2897', 'LUO0914',
  'LUO1006', 'LUO1012', 'LUO1051', 'FE3235', 'FE3232', 'WOO0174'
];

const PSEUDO_SOURCE_GOALS = {
  FATHERS_DAY_STA_FE_B2B_AUTO: {
    goal: '父亲节 STA/FE B2B auto 落地后复查：只保留有订单、有效点击或B2B/bulk学习价值的层；无单点击到阈值即收窄。',
    focus: '检查 B2B auto 子行是否仍启用、是否有订单/相关搜索词；无单点击达到 10-12 或花费约 5 美元就控。',
    next: NEAR_TERM
  },
  DN_VASE_LINE: {
    goal: 'DN 花桶/花瓶线 6/12 价格阶梯 + 核心广告抢救后复查：库存消化速度要超过原 30 天日均，DN3482 必须有处理路线。',
    focus: '核实价格是否前台/库存系统落地；看 7 天订单、same-SKU、搜索词质量，决定下一档价格/coupon/清货。',
    next: '2026-06-19'
  },
  FATHERS_DAY_2026_MATRIX: {
    goal: '父亲节矩阵后窗口复查：前进的 SKU 保护有效线，未前进的季节流量收缩；不因节日尾声继续泛推。',
    focus: '按 SKU 查订单、ACOS、搜索词；无 same-SKU 或有效学习的父亲节 broad/ASIN/auto 层进入收缩。',
    next: '2026-06-19'
  },
  INDEPENDENCE_DAY_2026_MATRIX: {
    goal: '独立日矩阵高频窗口前复查：GUF/GUF 等有订单的保护，弱 SKU 继续修复/观察，不在无证明时加预算。',
    focus: '保护已转化 patriotic/flag/product-body 入口；无单季节词按就近窗口控费。',
    next: NEAR_TERM
  },
  CNA_WEEK_2026_MATRIX: {
    goal: 'CNA Week 节点复查：已转化词保护，有展示无点击的先查承接/词质，低库存或利润弱的 SKU 不盲目扩架构。',
    focus: '查 CNA 词订单、ACOS、搜索词相关性；WOO0172 按 3/7 天止损阈值复查，UAN2600/UAN3646 查是否从低展示进入点击。',
    next: '2026-06-19'
  }
};

const REVIEW_OVERRIDES = {
  CAS4030: ['progressed', NEXT_WEEK, 'Juneteenth/黑人文化节点流量已经有 7 天 26 单，ACOS 16.2%，比前期修复目标前进。', '保护 cupcake/topper/party supply 等已转化入口；不再扩泛词，若 3 天花费显著高于订单再收弱层。'],
  RU2438: ['progressed', NEXT_WEEK, '7 天 8 单、ACOS 11.9%，Juneteenth table/party 方向已从补曝光进入有效转化。', '保留有效节点词和 SBV/SP 窄口；因利润率为负，继续控无单 broad，不加预算抢尾流量。'],
  GUF3133: ['progressed', NEXT_WEEK, '7 天 7 单、ACOS 6.5%，B2B/独立日帽子方向有效。', '保护 patriotic bucket hat 已转化层；只在核心词继续低 ACOS 时小幅给量，弱泛 patriotic 词不扩。'],
  QQ1764: ['progressed', NEXT_WEEK, '7 天 46 单、ACOS 20.5%，Pride/rainbow 桌布方向仍能承接，属于前进。', '继续守 rainbow tablecloth/party/event 用途词，控高 ACOS 尾词，利润优化靠守高 CVR 入口而非扩大泛流量。'],
  GT4431: ['progressed', NEXT_WEEK, '7 天 4 单、ACOS 8.0%，funeral favors 窄口覆盖修复后方向有效。', '保留 exact/phrase funeral favors、funeral pins、memorial ribbons；达到 12 点击或约 6 美元无单的新增行再降。'],
  MF6294: ['progressed', NEXT_WEEK, '7 天 2 单、ACOS 7.7%，自动恢复和 ASIN 扩展没有破坏效率。', '保护已恢复 auto broad/high-rel；关键词被拦截的方向不强行绕过，利润优先于覆盖完整。'],
  STA2607: ['progressed', NEXT_WEEK, '父亲节 pastor gifts 层 7 天 1 单、ProductAd broad 14 点击 1 单，至少有有效学习。', '只保留出单 pastor gifts 窄口，auto 继续低成本观察；不扩整组父亲节流量。'],
  DN2684: ['progressed', NEXT_WEEK, 'DN 线抢救后 7 天 6 单、ACOS 13.8%，核心花桶流量仍可卖。', '先确认 52.99 价格是否落地；保护核心词，若日均未超过原 30 天速度，进入下一档 coupon/价格。'],
  DN2683: ['progressed', NEXT_WEEK, '7 天 6 单、ACOS 16.8%，DN 线中仍有可承接订单。', '守核心 metal/flower bucket 词；价格落地后看 sell-through，弱 broad/auto 不加。'],
  DN3049: ['progressed', NEXT_WEEK, '7 天 3 单、ACOS 23.6%，降价/核心广告后仍有订单但未到强消化。', '核实 69.99 是否落地；若日均仍低于 2.5-3 件，下一步优先价格/coupon 而不是加广告。'],
  DN1655: ['progressed', NEXT_WEEK, '7 天 5 单、ACOS 20.5%，作为优先销售 SKU 仍能承接。', '保护已转化核心流量，负利润边界下只控弱尾，不因短期薄利切断主力订单。'],
  DN1656: ['progressed', NEXT_WEEK, '7 天 6 单、ACOS 12.3%，DN 线里效率较稳。', '维持核心层，继续看价格/库存消化；不追加泛词，利润优化靠高效入口和库存周转。'],
  UAN0188: ['progressed', NEXT_WEEK, '7 天 9 单、ACOS 8.5%，mini notebook/CNA 相关产品底盘继续有效。', '保护 bulk mini notebook 有效线；CNA listing/词只做接流优化，不再加预算抢泛流量。'],
  YUT3183: ['progressed', NEXT_WEEK, '7 天 7 单、ACOS 22.8%，足球 sibling 池里仍是强接收 SKU。', '保护已验证 soccer ball 流量；不要把 YUT3183 的强度外推给 YUT2847 弱接收体。'],
  PR2214: ['progressed', NEXT_WEEK, '7 天 6 单、ACOS 12.2%，仍有有效销售承接。', '守有效词和低 ACOS 层；因利润率为负，下一步以价格/利润修复配合广告控尾。'],
  WC2648: ['progressed', NEXT_WEEK, '7 天 3 单、ACOS 19.8%，低量但有效。', '保持窄口，别加 broad；利润优化看单价/优惠和低成本词。'],

  YUT2847: ['regressed', NEAR_TERM, '3-5 天复查失败：7 天 26 点击、15.69 花费、0 单，已把 auto high-rel bid 从 0.85 回滚到 0.80 并读回。', '回滚后只看 spend 是否降、是否恢复 same-SKU；未恢复前不再扩 soccer/World Cup 流量。'],
  DN3482: ['not_progressed', '2026-06-19', 'DN 线里最弱：7 天 22 点击、15.15 花费、0 单；exact 迁移层样本仍太小，尚未证明前进。', '不加预算；若 6/19 仍无 same-SKU 或有效词学习，进入强促销/服务商/批量清货测算。'],
  UG4758: ['regressed', NEAR_TERM, '7 天 114 点击、42.63 花费、1 单、ACOS 185.4%，broad 和 ASIN 扩展均无单，整体未达新品验证目标。', '保留 auto 唯一出单线，暂停扩张；优先修价格/主图/receiver，控制 broad 和无单 ASIN 层。'],
  NAY4632: ['not_progressed', NEAR_TERM, '7 天 68 点击、18.97 花费、0 单；auto highRel 已在 6/15 09:36 左右暂停，不重复动作。', '保持已暂停弱 highRel，不新增 wedding pens 泛流量；下一步看价格/页面和精准词承接。'],
  UAN3644: ['not_progressed', NEAR_TERM, '7 天 41 点击、14.82 花费、0 单；ASIN 层 27 点击 0 单，SBV 本窗也无单，较 30 天表现转弱。', '保护历史有效层，收窄 ASIN 浪费；CNA/mini notebook 不再加预算，先看 receiver 和搜索词。'],
  BEU0541: ['partial_progress', NEAR_TERM, 'SKU 7 天仍有 2 单，但 ACOS 63.9%；主关键词组 23 点击、8.14 花费、0 单，恢复不够健康。', '保留系统/窄口出单层，控制 retirement gifts for women 主组；利润优先，不能继续泛放量。'],
  STA2604: ['not_progressed', NEAR_TERM, '7 天 34 点击、11.56 花费、0 单，父亲节 pastor gifts 两个 ProductAd 层均无单。', '不扩父亲节；就近查搜索词，若仍无有效学习则降 broad/auto 或暂停。'],
  STA2610: ['not_progressed', NEAR_TERM, '7 天 8 点击、2.38 花费、0 单，30 天也 0 单；样本小但方向未证明。', '停止扩量，保留最低学习成本；若 6/18 仍无订单/有效词，收掉父亲节 B2B 层。'],
  UTE4258: ['partial_progress', NEXT_WEEK, '不是整 SKU 失败：7 天 2 单，auto 与 ASIN 扩展各 1 单；但 broad/phrase/SB 无单，整体 ACOS 40.4%。', '保护 auto/ASIN 出单层；不扩 broad/SBV，利润优化靠收弱词和保持窄口。'],
  MTY1808: ['not_progressed', NEAR_TERM, '独立日方向 7 天 17 点击、10.67 花费、0 单，30 天 ACOS 100.7%，未达恢复目标。', '只保留已降/已控后的必要观察，停止独立日泛推；考虑页面/价格或清尾。'],
  XIH2562: ['not_progressed', NEAR_TERM, '7 天 10 点击、3.05 花费、0 单，30 天仍 0 单；父亲节/礼品方向没有证明。', '不加预算；近端查 search term，若无买家意图直接收缩。'],
  XIH2559: ['not_progressed', NEAR_TERM, '7 天 10 点击、0 单，30 天仅 1 单且 ACOS 53.6%，未达到父亲节测试目标。', '保持低成本，避免预算上调；若无 same-SKU 订单，收 seasonal broad。'],
  XIH2677: ['not_progressed', NEAR_TERM, '7 天 10 点击、0 单，30 天仅 1 单且 ACOS 34.8%，仍未证明父亲节承接。', '不再新增父亲节词；看是否有 evergreen product-body 词可保留，否则收缩。'],
  GT2491: ['not_progressed', NEAR_TERM, '7 天 8 点击、0 单，30 天 35 点击也 0 单，老品恢复没有前进。', '停止加广告，先查页面/价格/库存路线；广告只保留极低成本学习。'],
  XUE0890: ['partial_progress', NEAR_TERM, '7 天有 2 单但 ACOS 34.8%，且利润率低，订单质量不够安全。', '保护能出单词，降低高 CPC/低转化尾部；必要时配合价格/优惠修利润。'],
  FE3235: ['partial_progress', NEXT_WEEK, '7 天仅 1 点击、0.47 花费、0 单；30 天 1 单 ACOS 7.9%，低成本仍可观察。', '不扩父亲节/B2B；保留低成本 Christian gift set 窄口，等更多样本再决策。'],
  FE3232: ['partial_progress', NEXT_WEEK, '7 天 5 点击、0 单，但 30 天 3 单、ACOS 5.7%，历史效率好。', '保护低成本 SBV/auto，避免高价扩量；下周看是否恢复订单。'],

  QAA2627: ['not_progressed', NEAR_TERM, 'B2B auto 创建后 7 天 7 点击、2.33 花费、0 单，尚未证明 Fathers Day/B2B Christian necklaces 承接。', '不加 generic fathers day；查搜索词，若无 Christian/bulk necklace 学习则收窄 auto。'],
  EY5555: ['not_progressed', NEAR_TERM, 'B2B auto 创建后 7 天 6 点击、2.50 花费、0 单，仍未前进。', '低成本继续到阈值，不扩关键词；优先看页面/价格与 Christian keychain 接收。'],
  QAA3142: ['progressed', NEXT_WEEK, 'CNA crown brooch 小预算验证 7 天 2 单、ACOS 11.4%，已证明可承接。', '保护 CNA crown brooch 窄词，暂不扩泛 nurse gift；利润优化靠低 ACOS 窄口。'],
  QAA3143: ['partial_progress', NEAR_TERM, '7 天 4 单但 ACOS 24.6%，3 天 ACOS 74.8%，近期转化偏弱。', '守有单词，控最近高花费行；不再堆 CNA 泛词。'],
  QA2082: ['partial_progress', NEXT_WEEK, '恢复旧层后 7 天只有 1 点击，广告样本不足；商品 7 天仍有 4 件销量。', '维持低成本 restored exact/auto，等下周样本；利润靠自然/低 CPC，不加预算。'],
  QA2085: ['not_progressed', NEAR_TERM, '恢复 auto 后 7 天 0 点击，未拿到验证量；商品 7 天 0 销。', '先查投放状态/可售/页面，不继续加钱；若仍无展示，处理结构或停止。'],
  SHQ0554: ['partial_progress', NEAR_TERM, '恢复后 7 天 48 点击、15.24 花费、1 单、ACOS 23.1%，有订单但效率需控。', '保护 camping party favors 出单线，若恢复层继续点击无单就降。'],
  IF0653: ['evidence_gap', NEAR_TERM, '恢复 Amazon Business auto 后 7 天只有 1 点击，样本不足，未证明前进。', '不恢复 pegboard 旧弱层；继续低成本看 B2B 是否有相关搜索词。'],
  KA1744: ['evidence_gap', NEAR_TERM, '恢复 auto 后 7 天 0 点击，未进入有效验证。', '先查 delivery/可售/广告状态；不加预算，若继续无展示则转 listing/库存路线。'],
  QUN5512: ['evidence_gap', NEAR_TERM, '6/15 小幅提 bid 后 7 天只有 1 点击，仍是低展示状态。', '检查三条紧相关词是否起量；不起量再查 bid/词质，不扩泛 bouquet。'],
  YUT4458: ['progressed', NEXT_WEEK, '新结构后 7 天 3 单、ACOS 16.1%，有前进。', '保护 30th birthday float 有效线；因利润率为负，不继续堆新结构。'],
  STY2760: ['progressed', NEXT_WEEK, 'B2B auto 创建后 7 天 1 单、ACOS 5.8%，低成本有效。', '保持 bear centerpieces B2B auto，不扩 broad；下周看是否能稳定出单。'],
  KEI1148: ['partial_progress', NEAR_TERM, '7 天 2 单但 ACOS 33.5%，dog toys 新增词/ASIN 有订单但利润边界弱。', '保留能转化的精准/ASIN，压高 ACOS broad；不继续增加预算。'],
  GUF3129: ['partial_progress', NEAR_TERM, '7 天 3 单、ACOS 23.4%，能承接但弱于 GUF3133。', '保护 patriotic hat 出单线，控制 ACOS 超 25% 的尾部。'],
  UY1624: ['not_progressed', NEAR_TERM, '7 天 6 点击、0 单，30 天 1 单 ACOS 51.8%，tablecloth 独立日接收弱。', '停止加 B2B/独立日泛词；先修页面/价格或转观察。'],
  QQ2235: ['progressed', NEXT_WEEK, '7 天 2 单、ACOS 7.4%，rainbow table cloths B2B/节点方向有效。', '保护低 ACOS rainbow 入口；库存/利润可承接时下周再看是否补窄层。'],
  DUI5191: ['not_progressed', NEAR_TERM, '圣诞 cutting board 淡季 7/30 天广告为 0，销售为 0；当前不是广告放量窗口。', '进入清货经济或保留到圣诞窗口的决策，不用广告烧淡季流量。'],
  GT3814: ['partial_progress', NEAR_TERM, '7 天 2 单但 ACOS 34.4%，30 天效率好；红 ribbon bid cut 后需看控费是否生效。', '继续收 generic red ribbon 和弱 auto/substitute，保护 memorial/funeral 窄口。'],

  DN2108: ['partial_progress', '2026-06-19', '7 天 2 单、ACOS 25.7%，比断流好但未达到 DN 线库存消化目标。', '确认 50.99 价格落地；核心词保留，若日均未提升则下一档 coupon/价格。'],
  DN2685: ['evidence_gap', NEAR_TERM, '低库存尾货 7 天仅 1 点击，无足够广告样本。', '不为尾货加预算；清库存优先靠价格/自然动销，广告只保低成本。'],
  DN2437: ['not_progressed', NEAR_TERM, 'FBA 为 0/商品端无当前销量，但广告 7 天仍有 43 点击、1 单，需防无货浪费。', '先确认库存/可售，若无货则关停或强控广告，避免利润被空跑消耗。'],
  TUR9541: ['progressed', NEXT_WEEK, 'Father/Christian gift 结构 7 天 4 单、ACOS 17.7%，补建方向有效。', '保护 Christian gift tin/prayer card 有单线；phrase/exact/ASIN 测试无单达到阈值即收。'],
  YAN3229: ['not_progressed', NEAR_TERM, '7 天 21 点击、6.00 花费、0 单，父亲节/库存保护目标未前进。', '库存偏紧时不加量；查是否应控速/补货，而不是继续买无单点击。'],
  XIH2672: ['not_progressed', NEAR_TERM, '7 天 15 点击、0 单，30 天 4 单但近期无前进。', '保持观察，不扩父亲节 broad；若搜索词无关就收。'],
  UY3670: ['partial_progress', NEAR_TERM, '7 天 1 单、ACOS 24.3%，有少量独立日承接但不强。', '保留低成本 proven patriotic 入口，控制泛词；不加预算。'],
  LAY2384: ['regressed', NEAR_TERM, '7 天 64 点击、23.55 花费、1 单、ACOS 138.6%，库存控制/效率目标倒退。', '先清弱层，不加独立日预算；利润优化靠止损和库存节奏保护。'],
  YEL1320: ['not_progressed', NEAR_TERM, '7 天 9 点击、4.32 花费、0 单，且缺 6/14 经营底盘，不能证明推进。', '暂不加量；补商品/库存证据后再判断是否保留独立日流量。'],
  WOO0172: ['progressed', '2026-06-19', 'CNA 加力度后 7 天 4 单、ACOS 10.5%，符合继续保护的目标。', '保护 cna week gifts，但低库存/前台承接需查；若 7 天 ACOS >18% 或库存紧，回滚预算。'],
  WOO0173: ['progressed', NEXT_WEEK, '7 天 2 单、ACOS 17.3%，CNA/笔本方向还有转化。', '保护已转化 CNA 词，但库存低，不扩 AUTO/ASIN/SBV。'],
  WOO0174: ['no_live_ad_row', NEAR_TERM, '几乎无当前广告行，30 天 0 点击；当前不能按有效跑量 SKU 判断。', '先确认是否应恢复、库存和页面是否支持；没有前台承接就不建新流量。'],
  GM2827: ['no_live_ad_row', NEAR_TERM, '今日 ALL 广告汇总未读到当前行，经营底盘显示库存天数极高且利润为负。', '停止 3.5 推进假设，先查广告行可见性、价格/库存/页面，再决定是否清货。'],
  UAN2600: ['not_progressed', NEAR_TERM, '7 天 4 单但 ACOS 47.8%，UAN 组里 SBV/CNA 专项效率转弱。', '保护 ASIN exact/B2B auto，SBV 不加预算；先做 listing 接流和弱层降费。'],
  HEL0606: ['not_progressed', NEAR_TERM, '7 天 60 点击、12.23 花费、0 单，CNA/护士礼物流量未转化。', '不再加 CNA 预算；查搜索词和页面承接，点击继续无单则降/停。'],
  HEL0319: ['not_progressed', NEAR_TERM, '7 天 16 点击、4.82 花费、0 单，30 天 ACOS 42.2%，效率偏弱。', '只保精确护理/感谢词，泛 nurse/CNA 继续控费。'],
  UAN3646: ['evidence_gap', NEAR_TERM, '7 天只有 1 点击，CNA 修复后仍未进入有效点击池。', '先查 delivery、词质、产品季节色是否阻碍；不加预算。'],
  HEL3844: ['listing_pending_review', '2026-06-16', 'sellerinventory listing 申请待复查，今日无广告汇总证据，不按广告进展判断。', '先确认 Red Ribbon Week 文案申请状态和 Amazon 前台落地；文案未落地前不加广告。'],
  HEL3847: ['listing_pending_review', '2026-06-16', 'sellerinventory title 申请待复查，今日无广告汇总证据，不按广告进展判断。', '先确认 title_en 申请是否过审/前台落地；再决定是否恢复季节词。'],
  HAY2767: ['listing_pending_review', '2026-06-16', 'listing copy 清理后 7 天几乎无广告，当前重点是审核/前台落地。', '先读回申请 4608865 和前台文案；没有页面修复前不恢复广告。'],
  TM2897: ['no_live_ad_row', NEAR_TERM, '今日 3/7/30 天广告汇总均未读到行，不能证明原广告目标有推进。', '先补 live 行/库存/页面证据；若确实无投放，利润方向是停止空谈广告，转自然/页面/库存路线。'],
  LUO0914: ['no_live_ad_row', NEAR_TERM, 'LUO 清货线今日无广告行，不能按广告效果复查。', '按清货线处理：先查库存、价格、可售和清货经济，不新建广告。'],
  LUO1006: ['no_live_ad_row', NEAR_TERM, 'LUO 清货线今日无广告行，不能按广告效果复查。', '按清货线处理：确认自然动销/价格，广告不是当前利润优化主手段。'],
  LUO1012: ['no_live_ad_row', NEAR_TERM, 'LUO 清货线今日无广告行，不能按广告效果复查。', '按清货线处理：保利润和清库存，避免新广告烧钱。'],
  LUO1051: ['no_live_ad_row', NEAR_TERM, 'LUO 清货线今日无广告行，且历史利润偏弱。', '先做价格/清货/库存处理，不把它当开发脚本广告目标。'],
  STA2613: ['no_live_ad_row', NEAR_TERM, '父亲节 STA/FE 组关联 SKU，但今日无 live 广告行和 6/14 经营底盘。', '先补 SKU/ASIN/库存映射；无证据前不执行广告。']
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function existsRel(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function loadSummary(days) {
  const rel = `data/snapshots/ad_sku_summary_ALL_${days}d_${BUSINESS_DATE}.json`;
  const rows = readJson(rel).rows || [];
  return new Map(rows.map(row => [String(row.sku), row]));
}

function metric(row, days) {
  if (!row) return null;
  const prefix = `${days}_`;
  const impressions = Number(row[`${prefix}impressions`] ?? row.impressions ?? 0);
  const clicks = Number(row[`${prefix}clicks`] ?? row.clicks ?? 0);
  const spend = Number(row[`${prefix}cost`] ?? row.cost ?? 0);
  const orders = Number(row[`${prefix}orders`] ?? row.orders ?? 0);
  const sales = Number(row[`${prefix}sales`] ?? row.sales ?? 0);
  const acosPct = sales > 0 ? Number(((spend / sales) * 100).toFixed(1)) : null;
  return { impressions, clicks, spend: Number(spend.toFixed(2)), orders, sales: Number(sales.toFixed(2)), acosPct };
}

function compactMetric(m) {
  if (!m) return '无行';
  return `${m.impressions}/${m.clicks}/$${m.spend.toFixed(2)}/${m.orders}/${m.acosPct == null ? '-' : `${m.acosPct}%`}`;
}

function hasAdMetric(metrics) {
  return Boolean(metrics.d3 || metrics.d7 || metrics.d30);
}

function defaultStatus(metrics) {
  const m7 = metrics.d7;
  const m30 = metrics.d30;
  if (!hasAdMetric(metrics)) return ['no_live_ad_row', NEAR_TERM];
  if (m7?.orders > 0) {
    if (m7.acosPct != null && m7.acosPct <= 25) return ['progressed', NEXT_WEEK];
    if (m7.acosPct != null && m7.acosPct <= 50) return ['partial_progress', NEAR_TERM];
    return ['not_progressed', NEAR_TERM];
  }
  if ((m7?.clicks || 0) >= 12 || (m7?.spend || 0) >= 5) return ['not_progressed', NEAR_TERM];
  if (m30?.orders > 0) return ['partial_progress', NEXT_WEEK];
  return ['evidence_gap', NEAR_TERM];
}

function profitActionFor(status, op) {
  if (status === 'progressed') return '保护已证明的低 ACOS/高 CVR 入口，禁止同日叠加泛流量；下周只在订单和利润同时稳住时加窄口。';
  if (status === 'partial_progress') return '保留有单或低成本学习层，同时压高 ACOS/无单尾部；利润优先于覆盖完整。';
  if (status === 'not_progressed' || status === 'regressed') return '就近复查无单点击、搜索词和页面/价格承接；未恢复前不加预算，必要时降 bid、暂停或转价格/清货。';
  if (status === 'listing_pending_review') return '先确认 listing/价格/前台落地，再决定广告；未落地前不买更多流量。';
  if (status === 'no_live_ad_row') return '先补 live 广告行、库存和可售证据；若无可承接结构，利润优化走页面/价格/清货，不盲建广告。';
  return op?.profitRate < 0 ? '利润率偏弱，先查价格/成本/库存承接，广告只保低成本学习。' : '维持低成本观察，补齐当前证据后再决定广告或价格动作。';
}

function statusCn(status) {
  return {
    progressed: '前进',
    partial_progress: '部分前进',
    not_progressed: '未前进',
    regressed: '倒退/已回滚',
    no_live_ad_row: '无今日广告行',
    listing_pending_review: 'Listing待落地',
    evidence_gap: '证据不足'
  }[status] || status;
}

function sourceLabel(sources) {
  return [...sources].sort().join(', ');
}

function findProductAdFiles(sku) {
  const dir = path.join(ROOT, 'data', 'snapshots');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.startsWith(`sku_ad_product_${sku}_`) && name.includes(BUSINESS_DATE) && name.endsWith('.json'))
    .map(name => `data/snapshots/${name}`)
    .sort();
}

function buildSkuPool(watchlist) {
  const pool = new Map();
  function add(sku, source, pseudoSource) {
    if (!sku || /^(SA|DB|DE)\d+$/i.test(sku) || /_MATRIX$|_LINE$|^FATHERS_DAY_|^INDEPENDENCE_DAY_|^CNA_WEEK_/.test(sku)) return;
    if (!pool.has(sku)) pool.set(sku, { sku, sources: new Set(), pseudoSources: new Set() });
    pool.get(sku).sources.add(source);
    if (pseudoSource) pool.get(sku).pseudoSources.add(pseudoSource);
  }
  DIRECT_REVIEW_SKUS.forEach(sku => add(sku, 'direct_review_pool'));
  for (const item of watchlist.items || []) {
    if (item.status === 'closed' || !item.nextCheckDate || item.nextCheckDate > BUSINESS_DATE) continue;
    if (PSEUDO_SOURCE_GOALS[item.sku]) {
      for (const sku of item.relatedSkus || []) add(sku, 'watchlist_pseudo_related', item.sku);
    } else {
      add(item.sku, 'watchlist_due');
    }
  }
  return [...pool.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

function summarizeProductAdFile(rel) {
  if (!existsRel(rel)) return '';
  const rows = readJson(rel).rows || [];
  if (!rows.length) return '';
  return rows.slice(0, 4).map(row => {
    const clicks = Number(row.Clicks ?? row.clicks ?? 0);
    const spend = Number(row.Spend ?? row.spend ?? 0);
    const orders = Number(row.Orders ?? row.orders ?? 0);
    return `${row.campaignName || row.groupName || 'ad'} ${clicks}c/$${spend.toFixed(2)}/${orders}o`;
  }).join('；');
}

function main() {
  const m3 = loadSummary(3);
  const m7 = loadSummary(7);
  const m30 = loadSummary(30);
  const opRows = readJson('data/tasks/all_sku_operating_review_2026-06-14.json').rows || [];
  const opMap = new Map(opRows.map(row => [String(row.sku), row]));
  const watchlist = readJson('data/tasks/sku_watchlist.json');
  const watchMap = new Map((watchlist.items || []).map(item => [String(item.sku), item]));
  const pool = buildSkuPool(watchlist);

  const rows = pool.map(entry => {
    const sku = entry.sku;
    const op = opMap.get(sku);
    const metrics = { d3: metric(m3.get(sku), 3), d7: metric(m7.get(sku), 7), d30: metric(m30.get(sku), 30) };
    const productAdFiles = findProductAdFiles(sku);
    const [autoStatus, autoNext] = defaultStatus(metrics);
    const override = REVIEW_OVERRIDES[sku];
    const status = override?.[0] || autoStatus;
    const nextCheckDate = override?.[1] || autoNext;
    const pseudoGoals = [...entry.pseudoSources].map(src => PSEUDO_SOURCE_GOALS[src]).filter(Boolean);
    const watch = watchMap.get(sku);
    const originalGoal = watch
      ? `${watch.node || watch.phase || 'watchlist'}：${(watch.stageTargets || [])[0]?.target || watch.phase || '按 watchlist 目标复查'}`
      : pseudoGoals[0]?.goal
        || `经营复查池：${op ? `${op.verdict || 'watch'} / ${op.action || '观察'}` : '补齐当前 live 证据后判断是否推进'}`;
    const judgement = override?.[2]
      || (hasAdMetric(metrics)
        ? `今日广告指标 7d=${compactMetric(metrics.d7)}，按订单、ACOS 和点击成本判断为${statusCn(status)}。`
        : '今日 ALL 3/7/30 天广告汇总均未读到 live 行，不能证明广告目标推进。');
    const profitOptimization = override?.[3] || profitActionFor(status, op);
    const nextFocus = pseudoGoals[0]?.focus
      || (status === 'progressed'
        ? '下周复查订单是否延续、ACOS 是否守住、是否有新的低成本同类词可保护。'
        : status === 'no_live_ad_row' || status === 'listing_pending_review'
          ? '就近补 live 行/前台/申请状态证据，确认是否需要广告、价格、listing 或清货动作。'
          : '就近复查无单点击、搜索词相关性、页面/价格承接和是否需要降 bid/暂停/转清货。');
    const actionTakenToday = sku === 'YUT2847'
      ? '已执行并读回：auto high-rel target 421668147383689 bid 0.85 -> 0.80。'
      : '本闭环表未新增广告写入；若此前同日已有动作，以 watchlist/GBrain 记录和落地读回为准。';
    const evidenceFiles = [
      'data/snapshots/ad_sku_summary_ALL_3d_2026-06-15.json',
      'data/snapshots/ad_sku_summary_ALL_7d_2026-06-15.json',
      'data/snapshots/ad_sku_summary_ALL_30d_2026-06-15.json',
      'data/tasks/all_sku_operating_review_2026-06-14.json',
      'data/tasks/sku_watchlist.json',
      ...productAdFiles
    ];
    if (sku === 'YUT2847') {
      evidenceFiles.push(
        'data/actions/yut2847_auto_highrel_rollback_2026-06-15.json',
        'data/snapshots/ad_group_rows_YUT2847_auto_rollback_readback_2026-06-15.json'
      );
    }
    return {
      sku,
      sources: sourceLabel(entry.sources),
      pseudoSources: [...entry.pseudoSources].sort(),
      originalGoal,
      evidenceBoundary: '2026-06-15 live ad backend summary/readback snapshots + 2026-06-14 local operating snapshot + GBrain/watchlist history. GBrain is historical context, not current live state.',
      todayMetrics: metrics,
      productBase: op ? {
        units7d: op.units7d,
        units30d: op.units30d,
        profitRate: op.profitRate,
        invDays: op.invDays,
        verdict: op.verdict,
        action: op.action
      } : null,
      productAdLayerSummary: productAdFiles.map(rel => ({ file: rel, summary: summarizeProductAdFile(rel) })),
      progressStatus: status,
      progressLabel: statusCn(status),
      progressJudgment: judgement,
      nextCheckDate,
      nextCheckFocus: nextFocus,
      profitOptimization,
      actionTakenToday,
      evidenceFiles
    };
  });

  const excludedPseudoCodes = (watchlist.items || [])
    .filter(item => item.status !== 'closed' && item.nextCheckDate && item.nextCheckDate <= BUSINESS_DATE && PSEUDO_SOURCE_GOALS[item.sku])
    .map(item => ({ code: item.sku, relatedSkus: item.relatedSkus || [], reason: 'group/matrix code, not a SKU row' }));
  const statusCounts = rows.reduce((acc, row) => {
    acc[row.progressStatus] = (acc[row.progressStatus] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    generatedAt: new Date().toISOString(),
    businessDate: BUSINESS_DATE,
    scopeRule: '真实 SKU 入表；watchlist 到期的矩阵/线编码只作为来源，展开到 relatedSkus；SA/DB/DE 数字开发码不当作 SKU。',
    gbrainKeywordsSearched: [
      '2026-06-15', '复查', 'YUT2847', 'DN3482', 'UG4758', 'NAY4632', 'BEU0541',
      'UAN3644', 'UTE4258', 'STA2604', 'STA2610', 'DN_VASE_LINE', 'FATHERS_DAY_2026_MATRIX',
      'INDEPENDENCE_DAY_2026_MATRIX', 'CNA_WEEK_2026_MATRIX'
    ],
    evidenceBoundary: '当前状态来自 2026-06-15 live 广告后台快照/动作读回，以及 2026-06-14 本地经营底盘；GBrain/watchlist 只用于原目标和历史结论。',
    rowCount: rows.length,
    statusCounts,
    excludedPseudoCodes,
    rows
  };

  const outJson = path.join(ROOT, 'data', 'tasks', `sku_review_closure_${BUSINESS_DATE}.json`);
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2) + '\n');

  const lines = [];
  lines.push(`# ${BUSINESS_DATE} SKU 复查闭环`);
  lines.push('');
  lines.push(`证据边界：${payload.evidenceBoundary}`);
  lines.push('');
  lines.push(`行数：${rows.length}`);
  lines.push(`状态汇总：${Object.entries(statusCounts).map(([k, v]) => `${statusCn(k)} ${v}`).join('；')}`);
  lines.push('');
  lines.push('排除的非 SKU 编码：' + excludedPseudoCodes.map(x => x.code).join('、'));
  lines.push('');
  lines.push('| SKU | 来源 | 目标是否前进 | 今日 7d 广告 | 原目标/任务 | 今日判断 | 下次复查 | 利润优化方向 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push([
      row.sku,
      row.sources,
      row.progressLabel,
      compactMetric(row.todayMetrics.d7).replace(/\|/g, '/'),
      row.originalGoal.replace(/\|/g, '/'),
      row.progressJudgment.replace(/\|/g, '/'),
      `${row.nextCheckDate}：${row.nextCheckFocus}`.replace(/\|/g, '/'),
      row.profitOptimization.replace(/\|/g, '/')
    ].map(cell => String(cell).replace(/\r?\n/g, ' ')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  const outMd = path.join(ROOT, 'data', 'tasks', `sku_review_closure_${BUSINESS_DATE}.md`);
  fs.writeFileSync(outMd, `\ufeff${lines.join('\n')}\n`);

  console.log(JSON.stringify({
    ok: true,
    json: path.relative(ROOT, outJson),
    md: path.relative(ROOT, outMd),
    rowCount: rows.length,
    statusCounts,
    excludedPseudoCodes: excludedPseudoCodes.map(x => x.code)
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSkuPool,
  defaultStatus,
  REVIEW_OVERRIDES
};
