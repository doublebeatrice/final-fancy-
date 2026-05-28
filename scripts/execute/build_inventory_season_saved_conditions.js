const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const STORAGE_KEY = 'amazon_product_list';
const USER_ID = '30205';
const BUSINESS_DATE = '2026-05-25';
const NORMAL_SALE = '\u6b63\u5e38\u9500\u552e';
const RESERVED_PAGE = '\u4fdd\u7559\u9875\u9762';
const Q_FOLDER_NAMES = ['Q1\u8282\u6c14', 'Q2\u8282\u6c14', 'Q3\u8282\u6c14', 'Q4\u8282\u6c14'];
const Q_FOLDER_COLORS = ['#4A90D9', '#27AE60', '#E67E22', '#8E44AD'];

function text(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function uniq(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { apply: false, preview: false, date: BUSINESS_DATE };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--apply') options.apply = true;
    if (item === '--preview') options.preview = true;
    if (item === '--date') {
      options.date = text(argv[i + 1] || options.date);
      i += 1;
    }
  }
  if (!options.apply) options.preview = true;
  return options;
}

function parseCsvLine(line) {
  const values = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const next = line[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      values.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  values.push(field);
  return values;
}

function readCsv(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const rows = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    const next = content[i + 1];
    if (c === '"' && quoted && next === '"') {
      current += c + next;
      i += 1;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === '\n' && !quoted) {
      rows.push(current.replace(/\r$/, ''));
      current = '';
    } else {
      current += c;
    }
  }
  if (current) rows.push(current.replace(/\r$/, ''));
  const headers = parseCsvLine(rows.shift() || '');
  return rows.filter(Boolean).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
    return row;
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function dateQuarter(dateText) {
  const month = Number(String(dateText || '').slice(5, 7));
  return Math.floor((month - 1) / 3) + 1;
}

function combinedText(row) {
  return [
    row.sku,
    row.productName,
    row.title_ch,
    row.search_core_keywords,
    row.holiday_info,
    row.product_label,
    row.input_tag,
    row.solrName,
    row.minorSolrNames,
  ].map(text).join(' ');
}

function has(row, regex) {
  return regex.test(combinedText(row));
}

function titleHas(row, regex) {
  return regex.test([row.productName, row.title_ch].map(text).join(' '));
}

function addEvidence(row, label) {
  if (!row._evidence) row._evidence = [];
  row._evidence.push(label);
}

function scoreRow(row) {
  const qty30 = num(row.qty_30);
  const orders = num(row.ad_orders_30);
  const sales = num(row.ad_sales_30);
  const profitRate = num(row.net_profit || row.profitRate);
  const estimatedProfit = estimateNetProfit30(row);
  return (qty30 * 10) + (orders * 6) + (sales / 15) + (estimatedProfit / 40) + (profitRate > 0 ? profitRate * 20 : profitRate * 5);
}

function sortSkus(rows) {
  return rows
    .slice()
    .sort((a, b) => scoreRow(b) - scoreRow(a) || text(a.sku).localeCompare(text(b.sku)))
    .map(row => text(row.sku));
}

function estimateNetProfit30(row) {
  return num(row.inv_sales_30) * num(row.net_profit);
}

function summarizeRows(rows) {
  const invSales30 = rows.reduce((sum, row) => sum + num(row.inv_sales_30), 0);
  const estimatedNetProfit30 = rows.reduce((sum, row) => sum + estimateNetProfit30(row), 0);
  return {
    skuCount: rows.length,
    qty30: rows.reduce((sum, row) => sum + num(row.qty_30), 0),
    adOrders30: rows.reduce((sum, row) => sum + num(row.ad_orders_30), 0),
    adSales30: Number(rows.reduce((sum, row) => sum + num(row.ad_sales_30), 0).toFixed(2)),
    invSales30: Number(invSales30.toFixed(2)),
    estimatedNetProfit30: Number(estimatedNetProfit30.toFixed(2)),
    weightedNetProfitRate: invSales30 ? Number((estimatedNetProfit30 / invSales30).toFixed(4)) : 0,
    topSkus: sortSkus(rows).slice(0, 15),
  };
}

function shouldSaveCondition(condition) {
  const summary = condition.summary || {};
  if (['逾越节-纯', 'Football赛季-纯', '祖父母节-纯'].includes(condition.name)) return true;
  if (summary.skuCount < 2) {
    return (
      summary.estimatedNetProfit30 >= 2500 ||
      (summary.estimatedNetProfit30 >= 1000 && summary.qty30 >= 30) ||
      (summary.qty30 >= 100 && summary.estimatedNetProfit30 >= 500) ||
      (summary.invSales30 >= 5000 && summary.estimatedNetProfit30 >= 500) ||
      (summary.adSales30 >= 1500 && summary.estimatedNetProfit30 >= 0)
    );
  }
  if (summary.skuCount < 5) {
    return (
      summary.estimatedNetProfit30 >= 2500 ||
      (summary.estimatedNetProfit30 >= 500 && summary.qty30 >= 20) ||
      (summary.qty30 >= 50 && summary.estimatedNetProfit30 >= 0) ||
      (summary.adSales30 >= 1000 && summary.estimatedNetProfit30 >= 0)
    );
  }
  return summary.qty30 >= 20 || summary.adSales30 >= 500 || summary.estimatedNetProfit30 >= 500;
}

function filterReason(condition) {
  const summary = condition.summary || {};
  if (summary.skuCount < 5) return 'too_few_skus_for_saved_folder';
  return 'low_recent_kpi_impact';
}

function mergeAdMetrics(inventoryRows, adRows) {
  const bySku = new Map();
  for (const row of adRows) {
    const sku = text(row.sku);
    if (!sku) continue;
    const existing = bySku.get(sku) || { orders: 0, sales: 0, cost: 0, impressions: 0, clicks: 0 };
    existing.orders += num(row.orders || row['30_orders']);
    existing.sales += num(row.sales || row['30_sales']);
    existing.cost += num(row.cost || row['30_cost']);
    existing.impressions += num(row.impressions || row['30_impressions']);
    existing.clicks += num(row.clicks || row['30_clicks']);
    bySku.set(sku, existing);
  }
  for (const row of inventoryRows) {
    const ad = bySku.get(text(row.sku)) || {};
    row.ad_orders_30 = ad.orders || num(row.adv_qty_30);
    row.ad_sales_30 = ad.sales || num(row.adv_sales_30);
    row.ad_cost_30 = ad.cost || num(row.cost_30);
    row.ad_impressions_30 = ad.impressions || num(row.impressions_30);
    row.ad_clicks_30 = ad.clicks || num(row.clicks_30);
  }
}

function enrichSolr(rows, solrMap) {
  for (const row of rows) {
    row.solrName = solrMap[text(row.solr_term)]?.name || '';
    row.minorSolrNames = text(row.minor_solr_term_site)
      .split(',')
      .map(id => solrMap[text(id)]?.name || '')
      .filter(Boolean)
      .join(',');
  }
}

function buildInventoryPool() {
  const meta = readJson(path.join(ROOT, 'data', 'snapshots', `inventory_formal_list_${BUSINESS_DATE}.json`));
  const inventoryRows = readCsv(meta.csvFile);
  const adFile = path.join(ROOT, '\u9ec4\u6210\u5586\u4e2a\u4eba\u6570\u636e\u8d8b\u52bf', '\u539f\u6570\u636e', '\u539f\u65e5\u6570\u636e', '5-25', `ad_sku_summary_30d_${BUSINESS_DATE}.csv`);
  const adRows = fs.existsSync(adFile) ? readCsv(adFile) : [];
  const solrMap = readJson(path.join(ROOT, 'data', 'solar_term_map.json'));
  const scoped = inventoryRows.filter(row => (
    ['Amazon.com', 'Amazon.co.uk'].includes(text(row.salesChannel)) &&
    ['HJ17', 'HJ171', 'HJ172'].includes(text(row.seller_num)) &&
    [NORMAL_SALE, RESERVED_PAGE].includes(text(row.sale_status))
  ));
  enrichSolr(scoped, solrMap);
  mergeAdMetrics(scoped, adRows);
  return {
    sourceCsv: meta.csvFile,
    sourceAdCsv: adFile,
    rows: scoped,
    allRows: inventoryRows.length,
  };
}

const PATTERNS = {
  patriotic: /patriotic|4th of july|independence day|memorial day|veterans? day|veteran|military|american flag|\busa\b|red white blue|flag day|thank you for your service/i,
  graduation: /graduation|class of|graduate|senior night|\bgrad\b|prom bouquet|bouquet sash/i,
  wedding: /wedding|bridal|bride|groom|bridesmaid|bachelorette|engagement|rehearsal|bride to be|groom to be/i,
  babyShower: /baby shower|gender reveal|mommy to be|newborn|diaper game|guess how many|tie your shoe|baby'?s breath/i,
  vaseFloral: /flower bucket|metal flower vase|metal floral container|\bvases?\b|artificial (peonies|flowers?)|foam rose|rose flowers|vase fillers?|floral picks?|beaded stems|wedding centerpieces|baby shower .*centerpieces|centerpieces .*vases|galvanized flower/i,
  appreciation: /appreciation|thank you|thanks|thank-you|employee gifts|staff gifts|coworker|volunteer|admin|administrative|secretary|boss|customer service|school staff|caregiver|social worker|counselor|lunch lady|custodian|housekeeping|food service/i,
  teacher: /teacher|educator|school staff|classroom|student|bookmark|librarian|reading|100 days of school|back to school|end of year/i,
  nurse: /\bnurses?\b|\bnursing\b|cna|medical assistant|healthcare|hospital|doctor|physician|paramedic|emt|ems|first responder|badge reel|lab tech|medical laboratory|pharmacy|pharmacist|respiratory|radiologic|x-ray|surgical|perioperative|anesthesia|crna/i,
  christian: /christian|bible|scripture|prayer|pastor|church|faith|religious|vbs|holy|communion|easter|god bless/i,
  mother: /mother'?s day|mothers day|\bmother\b|\bmom\b|\bmama\b|\bmommy\b|grandma|godmother|madrina/i,
  father: /father'?s day|fathers day|\bfather\b|\bdad\b|daddy|grandpa|father of the bride|father of the groom/i,
  valentine: /valentine|galentine|sweetest day/i,
  easter: /easter|bunny|rabbit|egg hunt|he is risen/i,
  stPatrick: /st\.?\s*patrick|shamrock|irish|green lucky/i,
  cinco: /cinco|fiesta|taco|mexican|pinata|pi\u00f1ata|margarita/i,
  summer: /summer|beach|pool|swim|luau|hawaiian|tropical|cooling towel|camping|campfire|vacation|passport|luggage|cruise/i,
  pride: /pride|rainbow|lgbt|lgbtq|equality/i,
  awareness: /awareness|breast cancer|autism|mental health|suicide prevention|domestic violence|black history|juneteenth|hispanic heritage|ribbon/i,
  halloween: /halloween|pumpkin|ghost|witch|spider|trick or treat|day of the dead|dia de los muertos|skull/i,
  thanksgiving: /thanksgiving|friendsgiving|fall|autumn|turkey|gratitude|maple leaf|harvest/i,
  christmas: /christmas|xmas|ornament|stocking|santa|reindeer|nativity|snowman|advent|hanukkah|diwali|kwanzaa/i,
  sportsFootball: /football|super bowl|touchdown|tailgate|game day|gridiron/i,
  veterinary: /veterinary|\bvet\b|veterinarian|vet tech|vet receptionist|animal hospital|pet groomer|paw print|dog thank|cat thank|pet thank/i,
  foodService: /baker|baking|food service|kitchen|restaurant|lunch lady/i,
  mathStem: /math|pi day|stem|science/i,
  birthdayOnly: /birthday|cheers to \d+ years|milestone birthday/i,
};

function selected(rows, predicate) {
  const result = [];
  for (const row of rows) {
    row._evidence = [];
    if (predicate(row)) result.push(row);
  }
  return result;
}

function splitPureAdjacent(rows, pureRegex, adjacentRegex, textFn = combinedText) {
  const pure = [];
  const adjacent = [];
  for (const row of rows) {
    const body = textFn(row);
    if (pureRegex && pureRegex.test(body)) pure.push(row);
    else if (!adjacentRegex || adjacentRegex.test(body) || num(row.qty_30) >= 8 || num(row.ad_orders_30) >= 2) adjacent.push(row);
  }
  return { pure, adjacent };
}

function conditionSpec(name, quarter, rows, kind, source, options = {}) {
  const skuList = sortSkus(rows);
  return {
    name,
    quarter,
    kind,
    source,
    skuList,
    summary: summarizeRows(rows),
    confidence: options.confidence || 'high',
    notes: options.notes || [],
  };
}

function addCondition(conditions, spec) {
  if (!spec.skuList.length) return;
  conditions.push(spec);
}

function splitRule(label, regex) {
  return { label, regex };
}

function titleBody(row) {
  return [row.productName, row.title_ch].map(text).join(' ');
}

function kindSuffix(kind) {
  return kind === 'adjacent' ? '蹭' : '纯';
}

function splitConditionName(baseName, label, kind) {
  return `${baseName}-${label}-${kindSuffix(kind)}`;
}

function splitRowsByRules(rows, rules) {
  const buckets = rules.map(rule => ({ label: rule.label, rows: [] }));
  const remainder = [];
  for (const row of rows) {
    const body = titleBody(row);
    const index = rules.findIndex(rule => rule.regex.test(body));
    if (index >= 0) buckets[index].rows.push(row);
    else remainder.push(row);
  }
  return { buckets, remainder };
}

function addSplitConditions(conditions, baseName, quarter, rows, kind, source, rules, options = {}) {
  const { buckets, remainder } = splitRowsByRules(rows, rules);
  const groups = buckets.concat({ label: options.remainderLabel || '其他', rows: remainder });
  for (const group of groups) {
    if (!group.rows.length) continue;
    addCondition(conditions, conditionSpec(
      splitConditionName(baseName, group.label, kind),
      quarter,
      group.rows,
      kind,
      source,
      {
        notes: [
          ...(options.notes || []),
          `large pool split by product form: ${group.label}`,
        ],
      },
    ));
  }
}

const PRODUCT_SPLIT_RULES = {
  cards: splitRule('卡片', /card|greeting|thank you tag|gift tag|invitation/i),
  paper: splitRule('纸品文具', /notebook|journal|notepad|paper|pen|pencil|marker|crayon|colored pencil|stationery|bookmark/i),
  drinkware: splitRule('杯具', /mug|cup|tumbler|glass|bottle|water bottle|can shaped|wine glass|stemless|travel mug/i),
  bags: splitRule('礼袋包袋', /bag|pouch|tote|organza|gift bag|makeup bag|cosmetic bag|zipper bag|canvas bag|envelope|packet/i),
  accessories: splitRule('配件饰品', /necklace|bracelet|earring|ring|jewelry|pendant|charm|brooch|pin|keychain|key ring|badge|compass|lapel/i),
  giftSets: splitRule('礼盒套装', /gift box|gift set|care package|box set|proposal box|gift basket/i),
  apparel: splitRule('服饰', /shirt|tee|t-shirt|tshirt|hoodie|sweatshirt|apron|socks/i),
  decor: splitRule('装饰摆件', /wall decor|desk decor|table decor|table sign|wooden sign|wood sign|sign|decor|decoration|display|plaque|ornament|banner|backdrop|arch|garland|tablecloth|table cover|pinata|piñata|balloon|honeycomb|stand/i),
  floral: splitRule('花艺花瓶', /flower|vase|centerpiece|floral|bouquet|stem|rose|peonies|picks|greenery|plant/i),
  toys: splitRule('玩具挂件', /plush|stuffed|toy|bear|bunny|duck|stress ball|slingshot|soccer ball|rubber chicken|blocks/i),
  spa: splitRule('香薰护理', /candle|soap|spa|bath|lotion/i),
  softGoods: splitRule('软装', /pillow|blanket|throw|quilt/i),
  mirror: splitRule('镜子', /mirror/i),
};

const LARGE_POOL_SPLITS = {
  appreciation: [
    splitRule('感谢卡', /thank[- ]?you card|thankyou card|appreciation card|grateful card|gratitude card|thank you tag|thanks card/i),
    splitRule('激励卡', /inspirational|motivational|affirmation|quote card|positive affirmation|encouragement|inspire|you'?re a star|sometimes you forget/i),
    splitRule('岗位主题', /teacher|school staff|nurse|doctor|employee|coworker|volunteer|admin|administrative|secretary|boss|customer service|caregiver|social worker|counselor|custodian|housekeeping|food service|support professional|office appreciation|retirement|dispatcher|truck driver|dsp|church staff|pastor|mother|mom|father|dad|grandma|grandpa/i),
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.apparel,
    PRODUCT_SPLIT_RULES.spa,
    PRODUCT_SPLIT_RULES.softGoods,
  ],
  wedding: [
    PRODUCT_SPLIT_RULES.floral,
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.apparel,
    PRODUCT_SPLIT_RULES.toys,
    PRODUCT_SPLIT_RULES.spa,
    PRODUCT_SPLIT_RULES.softGoods,
  ],
  birthday: [
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.toys,
    PRODUCT_SPLIT_RULES.spa,
    PRODUCT_SPLIT_RULES.softGoods,
    PRODUCT_SPLIT_RULES.floral,
  ],
  teacher: [
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.apparel,
    PRODUCT_SPLIT_RULES.toys,
    PRODUCT_SPLIT_RULES.spa,
  ],
  backToSchool: [
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.apparel,
    PRODUCT_SPLIT_RULES.toys,
    PRODUCT_SPLIT_RULES.spa,
  ],
  christian: [
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.mirror,
    PRODUCT_SPLIT_RULES.apparel,
    PRODUCT_SPLIT_RULES.toys,
  ],
  babyShower: [
    PRODUCT_SPLIT_RULES.floral,
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.toys,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.accessories,
  ],
  nurse: [
    PRODUCT_SPLIT_RULES.decor,
    PRODUCT_SPLIT_RULES.cards,
    PRODUCT_SPLIT_RULES.giftSets,
    PRODUCT_SPLIT_RULES.paper,
    PRODUCT_SPLIT_RULES.bags,
    PRODUCT_SPLIT_RULES.drinkware,
    PRODUCT_SPLIT_RULES.accessories,
    PRODUCT_SPLIT_RULES.floral,
    PRODUCT_SPLIT_RULES.spa,
    PRODUCT_SPLIT_RULES.softGoods,
  ],
};

function buildConditions(rows, events) {
  const conditions = [];
  const lowConfidence = [];
  const coveredEvents = new Map();
  const mark = (conditionName, eventKeys = []) => {
    for (const key of eventKeys) coveredEvents.set(key, conditionName);
  };

  const q2Baby = selected(rows, row => titleHas(row, PATTERNS.babyShower));
  addSplitConditions(conditions, 'Baby Shower', 2, q2Baby, 'pure', 'important_pool', LARGE_POOL_SPLITS.babyShower, {
    notes: ['baby shower / gender reveal identity pool'],
  });

  const vaseFloral = selected(rows, row => titleHas(row, PATTERNS.vaseFloral));
  addCondition(conditions, conditionSpec('婚礼花瓶花材-纯', 1, vaseFloral, 'pure', 'important_pool', {
    notes: ['KPI-sensitive vase / floral / centerpiece pool'],
  }));

  const appreciationPure = selected(rows, row => titleHas(row, PATTERNS.appreciation) && !titleHas(row, PATTERNS.birthdayOnly));
  addSplitConditions(conditions, '感谢礼', 2, appreciationPure, 'pure', 'important_pool', LARGE_POOL_SPLITS.appreciation, {
    notes: ['cross-node appreciation / thank-you gift pool'],
  });

  const weddingPure = selected(rows, row => titleHas(row, PATTERNS.wedding));
  addSplitConditions(conditions, '婚礼季', 1, weddingPure, 'pure', 'event_pool', LARGE_POOL_SPLITS.wedding, {
    notes: ['nodeStart is Q1 for Wedding Season'],
  });
  mark('婚礼季-纯', ['wedding_season', 'prom_season']);
  mark('婚礼花瓶花材-纯', ['wedding_season']);

  const graduationPure = selected(rows, row => titleHas(row, PATTERNS.graduation));
  addCondition(conditions, conditionSpec('毕业季-纯', 2, graduationPure, 'pure', 'event_pool'));
  mark('毕业季-纯', ['graduation_season']);

  const summerPure = selected(rows, row => titleHas(row, PATTERNS.summer));
  addCondition(conditions, conditionSpec('夏季产品-纯', 1, summerPure, 'pure', 'event_pool', {
    notes: ['nodeStart is Q1 for Summer Product Season'],
  }));
  mark('夏季产品-纯', ['summer_product_season']);

  const backToSchool = selected(rows, row => titleHas(row, /back to school|school supplies|classroom|student|teacher|bookmark|reading|librarian/i));
  addSplitConditions(conditions, '开学阅读课堂', 1, backToSchool, 'pure', 'event_pool', LARGE_POOL_SPLITS.backToSchool);
  mark('开学阅读课堂-纯', [
    'college_back_to_school_season',
    'spring_back_to_school_season',
    'read_across_america_day_week',
    'national_librarian_day',
    'national_library_week',
    '100th_day_of_school',
    'back_to_school_season',
    'school_counselor_counselor_gift_season',
  ]);

  const teacherPure = selected(rows, row => titleHas(row, PATTERNS.teacher));
  addSplitConditions(conditions, '教师感谢', 2, teacherPure, 'pure', 'event_pool', LARGE_POOL_SPLITS.teacher);
  mark('教师感谢-纯', [
    'teacher_appreciation_week',
    'teacher_appreciation_day_national_teacher_day',
    'staff_appreciation_week',
    'paraprofessional_appreciation_day',
    'school_lunch_hero_day',
    'international_education_week',
  ]);

  const nursePure = selected(rows, row => titleHas(row, PATTERNS.nurse));
  addSplitConditions(conditions, '护士医疗', 2, nursePure, 'pure', 'event_pool', LARGE_POOL_SPLITS.nurse);
  mark('护士医疗-纯', [
    'national_school_nurse_day',
    'national_nurses_week',
    'national_nurses_day',
    'international_nurses_day',
    'cna_week_national_nursing_assistants_week',
    'national_doctors_day',
    'dental_assistants_recognition_week',
    'national_ems_week',
    'medical_laboratory_professionals_week_lab_week',
    'national_hospital_week',
    'medical_assistants_recognition_week',
    'medical_assistants_recognition_day',
    'national_pharmacy_week',
    'respiratory_care_week',
    'national_radiologic_technology_week_rad_tech_week',
    'nurse_practitioner_week',
    'perioperative_nurses_week',
    'sterile_processing_week',
    'case_management_week',
    'occupational_therapy_month',
    'occupational_therapy_week',
    'patient_access_week',
    'national_public_health_week',
  ]);

  const christianPure = selected(rows, row => titleHas(row, PATTERNS.christian));
  addSplitConditions(conditions, 'VBS基督教', 2, christianPure, 'pure', 'event_pool', LARGE_POOL_SPLITS.christian);
  mark('VBS基督教-纯', [
    'vbs_vacation_bible_school',
    'national_bible_week',
    'operation_christmas_child',
  ]);

  const passover = selected(rows, row => titleHas(row, /passover|pesach|seder/i));
  addCondition(conditions, conditionSpec('逾越节-纯', 2, passover, 'pure', 'manual_override', {
    notes: ['Passover / Seder pool kept to avoid omission'],
  }));
  mark('逾越节-纯', ['passover']);

  const pastor = selected(rows, row => titleHas(row, /pastor|clergy|minister|deacon|priest|church staff|church leader|wedding officiant|pastor appreciation|clergy appreciation/i));
  addCondition(conditions, conditionSpec('牧师神职基督教-纯', 4, pastor, 'pure', 'event_pool'));
  mark('牧师神职基督教-纯', ['pastor_appreciation_month', 'clergy_appreciation_day']);

  const motherSplit = splitPureAdjacent(
    selected(rows, row => {
      const explicit = titleHas(row, /mother'?s day|mothers day/i);
      const motherCue = titleHas(row, /\bmother\b|\bmom\b|\bmama\b|\bmommy\b|grandma|godmother|madrina/i);
      const fatherConflict = titleHas(row, /father'?s day|fathers day|\bfather\b|\bdad\b|daddy|grandpa/i);
      const sympathyConflict = titleHas(row, /funeral|memorial|sympathy|bereavement|loss of loved one|grave|cemetery|baby shower|gender reveal/i);
      return explicit || (motherCue && !fatherConflict && !sympathyConflict);
    }),
    /mother'?s day|mothers day/i,
    /\bmother\b|\bmom\b|\bmama\b|\bmommy\b|grandma|godmother|madrina/i,
    row => [row.productName, row.title_ch].map(text).join(' '),
  );
  addCondition(conditions, conditionSpec('母亲节-纯', 2, motherSplit.pure, 'pure', 'event_pool'));
  addCondition(conditions, conditionSpec('母亲节-蹭', 2, motherSplit.adjacent, 'adjacent', 'event_pool'));
  mark('母亲节-纯/蹭', ['mother_s_day']);

  const fatherCandidate = selected(rows, row => {
    const body = [row.productName, row.title_ch].map(text).join(' ');
    const explicit = /father'?s day|fathers day/i.test(body);
    const fatherCue = /\bfather\b|\bdad\b|daddy|grandpa|father of the bride|father of the groom|gifts for men/i.test(body);
    const sympathyConflict = /funeral|memorial|sympathy|bereavement|loss of loved one|grave|cemetery|baby shower|gender reveal/i.test(body);
    return explicit || (fatherCue && !sympathyConflict);
  });
  const fatherSplit = splitPureAdjacent(
    fatherCandidate,
    /father'?s day|fathers day/i,
    /\bfather\b|\bdad\b|daddy|grandpa|father of the bride|father of the groom|gifts for men/i,
    row => [row.productName, row.title_ch].map(text).join(' '),
  );
  addCondition(conditions, conditionSpec('父亲节-纯', 2, fatherSplit.pure, 'pure', 'event_pool'));
  addCondition(conditions, conditionSpec('父亲节-蹭', 2, fatherSplit.adjacent, 'adjacent', 'event_pool'));
  mark('父亲节-纯/蹭', ['father_s_day']);

  const patriotic = selected(rows, row => titleHas(row, PATTERNS.patriotic));
  addCondition(conditions, conditionSpec('Memorial独立日爱国-纯', 2, patriotic, 'pure', 'event_pool'));
  addCondition(conditions, conditionSpec('独立日爱国-纯', 3, patriotic, 'pure', 'event_pool'));
  addCondition(conditions, conditionSpec('退伍军人节爱国-纯', 4, patriotic, 'pure', 'event_pool'));
  mark('Memorial独立日爱国-纯', ['memorial_day', 'flag_day']);
  mark('独立日爱国-纯', ['independence_day']);
  mark('退伍军人节爱国-纯', ['veterans_day']);

  const cinco = selected(rows, row => titleHas(row, PATTERNS.cinco));
  addCondition(conditions, conditionSpec('CincoFiesta-纯', 2, cinco, 'pure', 'event_pool'));
  mark('CincoFiesta-纯', ['cinco_de_mayo']);

  const pride = selected(rows, row => titleHas(row, PATTERNS.pride));
  addCondition(conditions, conditionSpec('Pride彩虹-纯', 2, pride, 'pure', 'event_pool'));
  mark('Pride彩虹-纯', ['pride_month', 'women_s_equality_day']);

  const halloween = selected(rows, row => titleHas(row, PATTERNS.halloween));
  addCondition(conditions, conditionSpec('万圣节-纯', 4, halloween, 'pure', 'event_pool'));
  mark('万圣节-纯', ['halloween', 'day_of_the_dead']);

  const thanksgiving = selected(rows, row => titleHas(row, PATTERNS.thanksgiving));
  addCondition(conditions, conditionSpec('感恩节-纯', 4, thanksgiving, 'pure', 'event_pool'));
  mark('感恩节-纯', ['thanksgiving']);

  const christmas = selected(rows, row => titleHas(row, PATTERNS.christmas));
  addCondition(conditions, conditionSpec('圣诞节-纯', 4, christmas, 'pure', 'event_pool'));
  mark('圣诞节-纯', ['christmas', 'hanukkah_chanukah', 'diwali_deepavali', 'kwanzaa', 'nursing_home_holiday_gifts_season']);

  const valentine = selected(rows, row => titleHas(row, PATTERNS.valentine));
  addCondition(conditions, conditionSpec('情人节-纯', 1, valentine, 'pure', 'event_pool'));
  mark('情人节-纯', ['galentine_s_day', 'valentine_s_day', 'valentine_week', 'sweetest_day']);

  const easter = selected(rows, row => titleHas(row, PATTERNS.easter));
  addCondition(conditions, conditionSpec('复活节-纯', 2, easter, 'pure', 'event_pool'));
  mark('复活节-纯', ['easter']);

  const stPatrick = selected(rows, row => titleHas(row, PATTERNS.stPatrick));
  addCondition(conditions, conditionSpec('圣帕特里克节-纯', 1, stPatrick, 'pure', 'event_pool'));
  mark('圣帕特里克节-纯', ['st_patrick_s_day']);

  const awareness = selected(rows, row => titleHas(row, PATTERNS.awareness));
  addCondition(conditions, conditionSpec('意识支持类-纯', 2, awareness, 'pure', 'important_pool', {
    notes: ['awareness/ribbon/support products, commercially sensitive'],
  }));
  mark('意识支持类-纯', [
    'black_history_month',
    'autism_awareness_day',
    'mental_health_awareness_month',
    'world_mental_health_day',
    'suicide_prevention_month',
    'world_suicide_prevention_day',
    'childhood_cancer_awareness_month',
    'breast_cancer_awareness_month',
    'domestic_violence_awareness_month',
    'hispanic_heritage_month',
    'juneteenth',
  ]);

  const football = selected(rows, row => titleHas(row, PATTERNS.sportsFootball));
  addCondition(conditions, conditionSpec('超级碗Football-纯', 1, football, 'pure', 'important_pool'));
  addCondition(conditions, conditionSpec('Football赛季-纯', 3, football, 'pure', 'important_pool'));
  mark('超级碗Football-纯', ['super_bowl']);
  mark('Football赛季-纯', ['football_season']);

  const vet = selected(rows, row => titleHas(row, PATTERNS.veterinary));
  addCondition(conditions, conditionSpec('兽医Vet礼品-纯', 4, vet, 'pure', 'event_pool'));
  mark('兽医Vet礼品-纯', ['world_veterinary_day', 'veterinary_receptionist_week', 'veterinary_technician_week_vet_tech_week']);

  const food = selected(rows, row => titleHas(row, PATTERNS.foodService));
  addCondition(conditions, conditionSpec('烘焙餐饮礼品-纯', 2, food, 'pure', 'event_pool'));
  addCondition(conditions, conditionSpec('餐饮服务周-纯', 4, food, 'pure', 'event_pool'));
  mark('烘焙餐饮礼品-纯', ['world_baking_day']);
  mark('餐饮服务周-纯', ['food_service_week']);

  const math = selected(rows, row => titleHas(row, PATTERNS.mathStem) && /math|pi day|stem|science|lab/i.test(combinedText(row)));
  addCondition(conditions, conditionSpec('STEM科学数学-纯', 1, math, 'pure', 'event_pool'));
  mark('STEM科学数学-纯', ['international_day_of_mathematics_pi_day']);

  const chineseNewYear = selected(rows, row => titleHas(row, /chinese new year|lunar new year|red envelope|dragon|zodiac|spring festival/i));
  addCondition(conditions, conditionSpec('春节中国新年-纯', 1, chineseNewYear, 'pure', 'event_pool'));
  mark('春节中国新年-纯', ['chinese_new_year']);

  const mardi = selected(rows, row => titleHas(row, /mardi gras|carnival|masquerade|purple green gold|bead necklace/i));
  addCondition(conditions, conditionSpec('MardiGras狂欢节-纯', 1, mardi, 'pure', 'event_pool'));
  mark('MardiGras狂欢节-纯', ['mardi_gras_carnival']);

  const grandparents = selected(rows, row => titleHas(row, /grandparents day/i));
  addCondition(conditions, conditionSpec('祖父母节-纯', 3, grandparents, 'pure', 'event_pool'));
  mark('祖父母节-纯', ['grandparents_day']);

  const newYear = selected(rows, row => titleHas(row, /new year'?s eve|new year party|happy new year|nye|new year favors/i));
  addCondition(conditions, conditionSpec('跨年新年-纯', 4, newYear, 'pure', 'event_pool'));
  mark('跨年新年-纯', ['new_year_s_eve_new_year_season']);

  const birthday = selected(rows, row => titleHas(row, PATTERNS.birthdayOnly));
  addSplitConditions(conditions, '里程碑生日派对', 1, birthday, 'pure', 'important_pool', LARGE_POOL_SPLITS.birthday, {
    notes: ['large evergreen party-favor pool kept because it is SKU/KPI significant'],
  });

  for (const event of events) {
    if (coveredEvents.has(event.key)) continue;
    lowConfidence.push({
      eventKey: event.key,
      eventName: event.zhName || event.name,
      reason: /全品类|促销节点|预算|清货|商业化要克制/.test(event.productDirection || '')
        ? 'broad_or_sensitive_node_not_saved_without_product-specific identity'
        : 'no_high_confidence_dedicated_inventory_pool_yet',
      quarter: dateQuarter(event.nodeStart),
      productDirection: event.productDirection,
    });
  }

  const deduped = [];
  const filteredOutConditions = [];
  const seen = new Set();
  for (const condition of conditions) {
    condition.skuList = uniq(condition.skuList);
    condition.summary = summarizeRows(condition.skuList.map(sku => rows.find(row => row.sku === sku)).filter(Boolean));
    if (condition.skuList.length < 1) continue;
    const key = condition.name;
    if (seen.has(key)) continue;
    seen.add(key);
    if (shouldSaveCondition(condition)) {
      deduped.push(condition);
    } else {
      filteredOutConditions.push({
        ...condition,
        filterReason: filterReason(condition),
      });
    }
  }
  deduped.sort((a, b) => (
    a.quarter - b.quarter ||
    b.summary.estimatedNetProfit30 - a.summary.estimatedNetProfit30 ||
    b.summary.qty30 - a.summary.qty30 ||
    a.name.localeCompare(b.name)
  ));
  filteredOutConditions.sort((a, b) => a.quarter - b.quarter || a.name.localeCompare(b.name));

  return { conditions: deduped, lowConfidence, filteredOutConditions };
}

function makeSearchData(skus) {
  return {
    sku: `${skus.join('\n')}\n`,
    salesChannel: 'Amazon.com,Amazon.co.uk',
    seller: 'HJ17,HJ171,HJ172',
    sale_status: `${NORMAL_SALE},${RESERVED_PAGE}`,
    transport_check: '0',
    transport_check_manual: '0',
    product_tag_complete: '0',
    inbAndAll: '1',
    inventory_risk: '0',
  };
}

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function evalInTab(ws, expression, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const result = response.result?.result;
      if (result?.subtype === 'error') return reject(new Error(result.description || 'DevTools evaluation error'));
      resolve(result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

async function findInventoryTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('sellerinventory tab not found on port 9222');
  return tab;
}

function buildApplyPayload(conditions) {
  const stableId = name => `codex_season_${crypto.createHash('sha1').update(name).digest('hex').slice(0, 16)}`;
  return {
    storageKey: STORAGE_KEY,
    userId: USER_ID,
    folders: Q_FOLDER_NAMES.map((name, index) => ({
      id: `codex_season_q${index + 1}`,
      name,
      color: Q_FOLDER_COLORS[index],
    })),
    conditions: conditions.map(condition => ({
      id: stableId(condition.name),
      name: condition.name,
      folderId: `codex_season_q${condition.quarter}`,
      data: makeSearchData(condition.skuList),
      meta: {
        kind: condition.kind,
        source: condition.source,
        skuCount: condition.skuList.length,
        qty30: condition.summary.qty30,
        invSales30: condition.summary.invSales30,
        estimatedNetProfit30: condition.summary.estimatedNetProfit30,
      },
    })),
  };
}

async function applyToBrowser(payload, backupFile) {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const encoded = JSON.stringify(payload).replace(/</g, '\\u003c');
  const expression = `
    (() => {
      const payload = ${encoded};
      const frames = [...document.querySelectorAll('iframe')];
      const frame = frames.find(f => (f.src || '').includes('/pm/formal/list')) || frames[0];
      const win = frame?.contentWindow || window;
      const storage = win.localStorage;
      const rawText = storage.getItem(payload.storageKey);
      const raw = rawText ? JSON.parse(rawText) : { name: payload.storageKey, version: 2, users: {} };
      raw.name = payload.storageKey;
      raw.version = 2;
      raw.users = raw.users || {};
      const userId = payload.userId;
      const ud = raw.users[userId] || { version: 2, data: {}, sortArr: [], folders: {}, folderModeEnabled: false };
      ud.version = 2;
      ud.data = ud.data || {};
      ud.sortArr = (ud.sortArr || []).map(String);
      ud.folders = ud.folders || {};
      const before = {
        tags: Object.keys(ud.data).length,
        folders: Object.keys(ud.folders).length,
        names: Object.values(ud.data).map(item => item.search_params_title),
        rawText,
      };
      const desiredNames = new Set(payload.conditions.map(condition => condition.name));
      const managedFolderIds = new Set(payload.folders.map(folder => folder.id));
      for (const [id, item] of Object.entries(ud.data)) {
        const isManagedId = String(id).startsWith('codex_season_');
        const isManagedFolderItem = managedFolderIds.has(item?.folderId);
        if ((isManagedId || isManagedFolderItem) && !desiredNames.has(item?.search_params_title)) {
          delete ud.data[id];
          ud.sortArr = ud.sortArr.filter(existingId => existingId !== id);
        }
      }
      for (const folder of payload.folders) {
        ud.folders[folder.id] = ud.folders[folder.id] || { name: folder.name, color: folder.color, collapsed: false, childSortArr: [] };
        ud.folders[folder.id].name = folder.name;
        ud.folders[folder.id].color = folder.color;
        ud.folders[folder.id].collapsed = false;
        ud.folders[folder.id].childSortArr = [];
      }
      for (const condition of payload.conditions) {
        const existingId = Object.keys(ud.data).find(id => ud.data[id]?.search_params_title === condition.name) || condition.id;
        ud.data[existingId] = {
          data: condition.data,
          search_params_title: condition.name,
          folderId: condition.folderId,
        };
        if (!ud.sortArr.includes(existingId)) ud.sortArr.push(existingId);
        const folder = ud.folders[condition.folderId];
        if (folder && !folder.childSortArr.includes(existingId)) folder.childSortArr.push(existingId);
      }
      for (const folder of Object.values(ud.folders)) {
        if (!Array.isArray(folder.childSortArr)) folder.childSortArr = [];
        folder.childSortArr = [...new Set(folder.childSortArr.filter(id => ud.data[id] && ud.data[id].folderId))];
      }
      const folderIds = payload.folders.map(folder => folder.id);
      ud.sortArr = [
        ...ud.sortArr.filter(id => ud.data[id] && !payload.conditions.some(c => c.name === ud.data[id]?.search_params_title)),
        ...payload.conditions.map(c => Object.keys(ud.data).find(id => ud.data[id]?.search_params_title === c.name)).filter(Boolean),
        ...folderIds,
      ].filter((id, index, arr) => id && arr.indexOf(id) === index);
      ud.folderModeEnabled = true;
      raw.users[userId] = ud;
      storage.setItem(payload.storageKey, JSON.stringify(raw));
      const afterText = storage.getItem(payload.storageKey);
      return JSON.stringify({
        ok: true,
        before: { tags: before.tags, folders: before.folders, names: before.names },
        after: {
          tags: Object.keys(ud.data).length,
          folders: Object.keys(ud.folders).length,
          folderModeEnabled: ud.folderModeEnabled,
          conditionNames: payload.conditions.map(c => c.name),
          folderCounts: Object.fromEntries(Object.entries(ud.folders).map(([id, f]) => [f.name, (f.childSortArr || []).length])),
        },
        backupRawText: before.rawText,
        afterTextLength: afterText.length,
      });
    })()
  `;
  try {
    const raw = await evalInTab(ws, expression);
    const result = JSON.parse(raw || '{}');
    fs.writeFileSync(backupFile, result.backupRawText || '', 'utf8');
    delete result.backupRawText;
    return result;
  } finally {
    ws.close();
  }
}

async function verifyBrowser(conditionNames) {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const expression = `
    (() => {
      const frames = [...document.querySelectorAll('iframe')];
      const frame = frames.find(f => (f.src || '').includes('/pm/formal/list')) || frames[0];
      const win = frame?.contentWindow || window;
      const raw = JSON.parse(win.localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}');
      const ud = raw.users?.[${JSON.stringify(USER_ID)}] || {};
      const names = Object.values(ud.data || {}).map(item => item.search_params_title);
      const missing = ${JSON.stringify(conditionNames)}.filter(name => !names.includes(name));
      const desiredNames = new Set(${JSON.stringify(conditionNames)});
      const conditionSkuCounts = Object.values(ud.data || {})
        .filter(item => desiredNames.has(item.search_params_title))
        .map(item => ({
          name: item.search_params_title,
          skuCount: String(item.data?.sku || '').split(/\\n+/).map(sku => sku.trim()).filter(Boolean).length,
        }));
      const overLimitConditions = conditionSkuCounts.filter(item => item.skuCount > 50);
      return JSON.stringify({
        ok: missing.length === 0,
        missing,
        existingCore: ['\u63d0\u4ef7','\u5e7f\u544a\u5173','\u6574\u9875\u8fc7\u4ea7\u54c1'].filter(name => names.includes(name)),
        folderModeEnabled: !!ud.folderModeEnabled,
        folderNames: Object.values(ud.folders || {}).map(folder => folder.name),
        folderCounts: Object.fromEntries(Object.entries(ud.folders || {}).map(([id, f]) => [f.name, (f.childSortArr || []).length])),
        maxSkuCount: Math.max(0, ...conditionSkuCounts.map(item => item.skuCount)),
        overLimitConditions,
        tagCount: Object.keys(ud.data || {}).length,
      });
    })()
  `;
  try {
    return JSON.parse(await evalInTab(ws, expression) || '{}');
  } finally {
    ws.close();
  }
}

async function main() {
  const options = parseArgs();
  const events = readJson(path.join(ROOT, 'data', 'season_events_2026.json'));
  const inventory = buildInventoryPool();
  const { conditions, lowConfidence, filteredOutConditions } = buildConditions(inventory.rows, events);
  const overLimitConditions = conditions.filter(item => item.skuList.length > 50);
  const summary = {
    generatedAt: new Date().toISOString(),
    businessDate: options.date,
    sourceCsv: inventory.sourceCsv,
    sourceAdCsv: inventory.sourceAdCsv,
    scope: {
      allRows: inventory.allRows,
      filteredRows: inventory.rows.length,
      filters: {
        salesChannel: ['Amazon.com', 'Amazon.co.uk'],
        seller: ['HJ17', 'HJ171', 'HJ172'],
        saleStatus: [NORMAL_SALE, RESERVED_PAGE],
      },
    },
    folderRule: 'quarter_by_nodeStart',
    splitRule: {
      maxSkuPerSavedCondition: 50,
      largePools: 'split by product form / buyer use case before saving',
    },
    saveRule: {
      minSkuCount: 5,
      smallHighImpactExceptions: {
        singleSku: {
          estimatedNetProfit30Gte: 2500,
          orEstimatedNetProfit30GteWithQty30Gte: [1000, 30],
          orQty30GteWithEstimatedNetProfit30Gte: [100, 500],
          orInvSales30GteWithEstimatedNetProfit30Gte: [5000, 500],
          orAdSales30GteWithNonNegativeEstimatedNetProfit30: 1500,
        },
        twoToFourSkus: {
          estimatedNetProfit30Gte: 2500,
          orEstimatedNetProfit30GteWithQty30Gte: [500, 20],
          orQty30GteWithNonNegativeEstimatedNetProfit30: 50,
          orAdSales30GteWithNonNegativeEstimatedNetProfit30: 1000,
        },
      },
      saveWhenAny: {
        qty30Gte: 20,
        adSales30Gte: 500,
        estimatedNetProfit30Gte: 500,
      },
      estimatedNetProfit30: 'inv_sales_30 * net_profit, used only as an impact proxy',
    },
    overLimitConditions: overLimitConditions.map(item => ({
      name: item.name,
      quarter: item.quarter,
      skuCount: item.skuList.length,
    })),
    conditions,
    filteredOutConditions,
    lowConfidence,
  };
  const outFile = path.join(ROOT, 'data', 'tasks', `inventory_season_saved_conditions_${options.date}.json`);
  writeJson(outFile, summary);
  const lowFile = path.join(ROOT, 'data', 'tasks', `inventory_season_saved_conditions_low_confidence_${options.date}.json`);
  writeJson(lowFile, { generatedAt: summary.generatedAt, lowConfidence });
  console.log(JSON.stringify({
    previewFile: outFile,
    lowConfidenceFile: lowFile,
    conditionCount: conditions.length,
    filteredOutConditionCount: filteredOutConditions.length,
    totalConditionSkus: conditions.reduce((sum, item) => sum + item.skuList.length, 0),
    maxSkuCount: Math.max(0, ...conditions.map(item => item.skuList.length)),
    overLimitConditions: overLimitConditions.map(item => ({
      name: item.name,
      skuCount: item.skuList.length,
    })),
    folders: Q_FOLDER_NAMES,
    topConditions: conditions.slice(0, 12).map(item => ({
      name: item.name,
      quarter: item.quarter,
      skuCount: item.skuList.length,
      qty30: item.summary.qty30,
      estimatedNetProfit30: item.summary.estimatedNetProfit30,
    })),
    filteredOutConditions: filteredOutConditions.map(item => ({
      name: item.name,
      quarter: item.quarter,
      skuCount: item.skuList.length,
      qty30: item.summary.qty30,
      adSales30: item.summary.adSales30,
      estimatedNetProfit30: item.summary.estimatedNetProfit30,
      filterReason: item.filterReason,
    })),
  }, null, 2));

  if (!options.apply) return;

  const payload = buildApplyPayload(conditions);
  const backupFile = path.join(ROOT, 'data', 'tasks', `amazon_product_list_backup_before_season_conditions_${options.date}_${Date.now()}.json`);
  const applyResult = await applyToBrowser(payload, backupFile);
  const verify = await verifyBrowser(conditions.map(item => item.name));
  const applyFile = path.join(ROOT, 'data', 'tasks', `inventory_season_saved_conditions_apply_${options.date}.json`);
  writeJson(applyFile, { generatedAt: new Date().toISOString(), backupFile, applyResult, verify });
  console.log(JSON.stringify({ backupFile, applyFile, applyResult, verify }, null, 2));
  if (!verify.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
