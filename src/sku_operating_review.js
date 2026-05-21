const { getSeasonWindows, getUpcomingSeasonWindows, matchProductSeason } = require('./season_calendar');
const { buildProductProfile, scoreTermRelevance } = require('./product_profile');
const { normalizeSelectionMarketReport } = require('./agent_review_evidence');

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value ?? '').trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function dateOnly(value) {
  const raw = text(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function daysBetweenDateStrings(from, to) {
  const a = dateOnly(from);
  const b = dateOnly(to);
  if (!a || !b) return null;
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function firstDefined(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return null;
}

function adWindow(card = {}, key) {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  const spend = num(sp.spend ?? sp.Spend) + num(sb.spend ?? sb.Spend);
  const sales = num(sp.sales ?? sp.Sales) + num(sb.sales ?? sb.Sales);
  const orders = num(sp.orders ?? sp.Orders) + num(sb.orders ?? sb.Orders);
  const clicks = num(sp.clicks ?? sp.Clicks) + num(sb.clicks ?? sb.Clicks);
  const impressions = num(sp.impressions ?? sp.Impressions) + num(sb.impressions ?? sb.Impressions);
  return {
    spend: round(spend, 2),
    sales: round(sales, 2),
    orders: round(orders, 0),
    clicks: round(clicks, 0),
    impressions: round(impressions, 0),
    acos: sales > 0 ? round(spend / sales, 4) : (spend > 0 ? 99 : 0),
  };
}

function skuDate(card = {}) {
  return dateOnly(card.opendate || card.openDate || card.fuldate || card.fulfillmentDate);
}

function lifecycleFor(card = {}, businessDate = '') {
  const openDate = skuDate(card);
  const ageDays = openDate ? daysBetweenDateStrings(openDate, businessDate) : null;
  const sold30 = num(card.unitsSold_30d);
  const hasYoy = firstDefined(card, ['yoyAsinPct', 'yoyUnitsPct', 'yoySalesPct']) !== null;

  if (ageDays !== null && ageDays >= 0) {
    if (ageDays <= 45) return { key: 'new_product', label: '新品', ageDays, openDate };
    if (ageDays <= 180) return { key: 'young_product', label: '成长期', ageDays, openDate };
    return { key: 'old_product', label: '老品', ageDays, openDate };
  }
  if (hasYoy || sold30 > 0) return { key: 'old_product_unknown_age', label: '老品-日期缺失', ageDays: null, openDate };
  return { key: 'unknown', label: '未知', ageDays: null, openDate };
}

function yoyFor(card = {}) {
  const raw = firstDefined(card, ['yoyAsinPct', 'yoyUnitsPct', 'yoySalesPct']);
  if (raw === null) {
    return { value: null, source: '' };
  }
  return {
    value: round(raw, 4),
    source: text(card.yoySourceField || (
      card.yoyAsinPct !== undefined ? 'yoyAsinPct' :
        card.yoyUnitsPct !== undefined ? 'yoyUnitsPct' :
          'yoySalesPct'
    )),
  };
}

function profitRateFor(card = {}) {
  const raw = firstDefined(card, ['profitRate', 'netProfit', 'net_profit']);
  return raw === null ? 0 : round(raw, 4);
}

function inventoryFor(card = {}) {
  const ful = num(card.fulFillable ?? card.fulfillable ?? card.stockFul);
  const res = num(card.reservedQty ?? card.reserved ?? card.stockRes);
  const inb = num(card.inboundQty ?? card.stockInb ?? card.stockInbAir);
  const invDays = num(card.sellableDays_30d || card.invDays);
  const sellable7 = num(card.sellableDays_7d);
  return {
    fulRes: round(ful + res, 0),
    inbound: round(inb, 0),
    invDays: round(invDays, 1),
    sellableDays7d: round(sellable7, 1),
    hasInventory: ful + res > 0 || invDays > 0 || inb > 0,
  };
}

function salesPace7v30(units7, units30) {
  if (num(units30) <= 0) return null;
  return round((num(units7) / (num(units30) / 30 * 7)) - 1, 4);
}

function daysUntil(from = '', to = '') {
  const diff = daysBetweenDateStrings(from, to);
  return diff === null ? null : diff;
}

function productProfileFor(card = {}) {
  return card.productProfile && typeof card.productProfile === 'object'
    ? card.productProfile
    : buildProductProfile(card);
}

function uniqueList(items = []) {
  return [...new Set(items.map(item => text(item)).filter(Boolean))];
}

function marketTermKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[\[\]"']/g, '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_AUDIENCE_TERMS = new Set([
  'women',
  'woman',
  'men',
  'man',
  'ladies',
  'female',
  'male',
  'girls',
  'boys',
  'her',
  'him',
]);

function usefulMarketTerm(value) {
  const normalized = marketTermKey(value);
  if (!normalized || normalized.length < 3) return '';
  if (normalized.split(' ').length > 5) return '';
  if (!/[a-z]/.test(normalized)) return '';
  if (/^\d+$/.test(normalized)) return '';
  if (/\bunknown\b/.test(normalized)) return '';
  if (GENERIC_AUDIENCE_TERMS.has(normalized)) return '';
  return normalized;
}

function addMarketTerm(terms, value) {
  const normalized = usefulMarketTerm(value);
  if (!normalized) return;
  if (!terms.includes(normalized)) terms.push(normalized);
}

function firstUsefulMarketTerm(items = []) {
  for (const item of items || []) {
    const normalized = usefulMarketTerm(item);
    if (normalized) return normalized;
  }
  return '';
}

function marketTermsForSku(card = {}, profile = {}, nodePlan = {}) {
  const terms = [];
  addMarketTerm(terms, profile.positioning);
  addMarketTerm(terms, profile.productType);
  for (const audience of profile.targetAudience || []) addMarketTerm(terms, audience);
  for (const occasion of profile.occasion || []) addMarketTerm(terms, occasion);
  for (const theme of profile.visualTheme || []) addMarketTerm(terms, theme);
  if (profile.productType && profile.targetAudience?.[0]) {
    addMarketTerm(terms, `${profile.targetAudience[0]} ${profile.productType}`);
  }
  if (profile.productType && profile.occasion?.[0]) {
    addMarketTerm(terms, `${profile.occasion[0]} ${profile.productType}`);
  }
  if (nodePlan.label && profile.productType) {
    addMarketTerm(terms, `${nodePlan.label} ${profile.productType}`);
  }
  const primaryOccasion = firstUsefulMarketTerm(profile.occasion);
  const primaryAudience = firstUsefulMarketTerm(profile.targetAudience);
  const primaryType = firstUsefulMarketTerm([profile.productType]);
  if (primaryOccasion && primaryType) addMarketTerm(terms, `${primaryOccasion} ${primaryType}`);
  if (primaryAudience && primaryType) addMarketTerm(terms, `${primaryAudience} ${primaryType}`);
  if (primaryOccasion) addMarketTerm(terms, `${primaryOccasion} gifts`);
  if (primaryOccasion && primaryAudience) addMarketTerm(terms, `${primaryOccasion} ${primaryAudience} gifts`);
  if (primaryAudience) addMarketTerm(terms, `${primaryAudience} gifts`);
  for (const seed of card.createContext?.keywordSeeds || []) addMarketTerm(terms, seed);
  addMarketTerm(terms, card.solrTerm);
  return terms.slice(0, 10);
}

function marketRiskSignals(market = {}) {
  const signals = [];
  if (!market.readyForDecisionSupport) signals.push('market_evidence_missing');
  if (!market.terms?.length) signals.push('market_terms_missing');
  for (const row of market.evidence || []) {
    const conversion = row.keywordConversion || {};
    const aba = row.abaSearchTerm || {};
    const seasonality = row.keywordSeasonality || {};
    if (['weak', 'no_conversion_proof'].includes(conversion.marketQuality)) signals.push('market_conversion_weak');
    if (conversion.costRisk === 'high') signals.push('market_cost_high');
    if (aba.demandTier === 'low') signals.push('market_demand_low');
    if (aba.competitionTier === 'high') signals.push('market_competition_high');
    if (seasonality.seasonalityType === 'strong_seasonal') signals.push('market_strong_seasonality');
  }
  return uniqueList(signals);
}

function buildSkuMarketAnalysis({ card = {}, profile = {}, nodePlan = {}, verdict = {}, selectionReports = {} } = {}) {
  const terms = marketTermsForSku(card, profile, nodePlan);
  const keywordConversion = selectionReports.keywordConversion || {};
  const abaSearchTerms = selectionReports.abaSearchTerms || {};
  const keywordSeasonality = selectionReports.keywordSeasonality || {};
  const evidence = terms.map(term => ({
    term,
    productFit: scoreTermRelevance(term, profile),
    keywordConversion: keywordConversion.rows?.[term] || null,
    abaSearchTerm: abaSearchTerms.rows?.[term] || abaSearchTerms.queryRows?.[term] || null,
    keywordSeasonality: keywordSeasonality.rows?.[term] || null,
  }));
  const coverage = {
    requested: terms.length,
    keywordConversionMatched: evidence.filter(row => row.keywordConversion).length,
    abaMatched: evidence.filter(row => row.abaSearchTerm).length,
    seasonalityMatched: evidence.filter(row => row.keywordSeasonality).length,
  };
  const readyForDecisionSupport = evidence.some(row => row.keywordConversion || row.abaSearchTerm || row.keywordSeasonality);
  const expectationMismatch = text(verdict.verdict) !== 'watch';
  const required = true;
  const status = readyForDecisionSupport
    ? 'market_evidence_ready'
    : (required && expectationMismatch ? 'market_required_missing' : 'market_missing');
  const market = {
    required,
    expectationMismatch,
    status,
    terms,
    coverage,
    readyForDecisionSupport,
    readyForAutoAction: false,
    evidence,
    sources: [
      ...(coverage.keywordConversionMatched ? ['selection_keyword_conversion_rate'] : []),
      ...(coverage.abaMatched ? ['selection_aba_search_terms'] : []),
      ...(coverage.seasonalityMatched ? ['selection_keyword_seasonality'] : []),
    ],
    actionBoundary: 'read_only_market_evidence',
  };
  return {
    ...market,
    riskSignals: marketRiskSignals(market),
  };
}

function summarizeMarketAnalysis(rows = []) {
  const statusCounts = {};
  for (const row of rows) {
    const status = row.marketAnalysis?.status || 'missing_market_analysis';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  return {
    totalSkus: rows.length,
    requiredSkus: rows.filter(row => row.marketAnalysis?.required).length,
    expectationMismatchSkus: rows.filter(row => row.marketAnalysis?.expectationMismatch).length,
    readyForDecisionSupport: rows.filter(row => row.marketAnalysis?.readyForDecisionSupport).length,
    requiredMissing: rows.filter(row => row.marketAnalysis?.required && !row.marketAnalysis?.readyForDecisionSupport).length,
    mismatchMissing: rows.filter(row => row.marketAnalysis?.expectationMismatch && !row.marketAnalysis?.readyForDecisionSupport).length,
    statusCounts,
  };
}

function uniqueWindows(windows = []) {
  const seen = new Set();
  const out = [];
  for (const window of windows) {
    const key = [window.key, window.peakStart, window.peakEnd, window.phase].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(window);
  }
  return out;
}

function nodeTargetsFor(window = {}, lifecycle = {}) {
  const phase = text(window.phase || 'upcoming');
  const oldish = ['old_product', 'old_product_unknown_age'].includes(lifecycle.key);
  const newish = lifecycle.key === 'new_product';
  const base = {
    weeklyClicks: 0,
    weeklyOrders: 0,
    prePeakClicks: 0,
    acosCeiling: 0.35,
    rankTarget: 'core keyword rank should start moving before peak',
    categoryRankTarget: 'category rank should improve before peak',
  };
  if (phase === 'upcoming') {
    return {
      ...base,
      weeklyClicks: newish ? 8 : 12,
      weeklyOrders: 0,
      prePeakClicks: newish ? 20 : 30,
      targetType: 'setup_before_preheat',
    };
  }
  if (phase === 'preheat') {
    return {
      ...base,
      weeklyClicks: newish ? 12 : (oldish ? 20 : 16),
      weeklyOrders: oldish ? 1 : 0,
      prePeakClicks: newish ? 35 : (oldish ? 50 : 40),
      targetType: 'pre_peak_click_validation',
    };
  }
  if (phase === 'peak') {
    return {
      ...base,
      weeklyClicks: newish ? 25 : (oldish ? 50 : 35),
      weeklyOrders: newish ? 1 : 2,
      prePeakClicks: 0,
      acosCeiling: 0.4,
      targetType: 'peak_capture',
    };
  }
  if (phase === 'tail') {
    return {
      ...base,
      weeklyClicks: 10,
      weeklyOrders: 1,
      acosCeiling: 0.28,
      targetType: 'tail_harvest',
    };
  }
  return {
    ...base,
    targetType: 'offseason_watch',
  };
}

function problemFocusFor(nodePlan = {}, ad7 = {}) {
  const target = nodePlan.target || {};
  if (!nodePlan.seasonKey) return '';
  if (num(ad7.clicks) < num(target.weeklyClicks)) return 'traffic_problem';
  if (num(ad7.clicks) >= num(target.weeklyClicks) && num(ad7.orders) < num(target.weeklyOrders)) return 'conversion_problem';
  if (num(ad7.orders) > 0 && num(ad7.acos) > num(target.acosCeiling)) return 'efficiency_problem';
  return 'on_track_or_watch';
}

function buildNodePlan(card = {}, lifecycle = {}, ad7 = {}, businessDate = '') {
  const profile = productProfileFor(card);
  const active = getSeasonWindows(businessDate);
  const upcoming = getUpcomingSeasonWindows(businessDate, 60);
  const matched = matchProductSeason(profile, uniqueWindows([...active, ...upcoming]));
  if (!matched.length) {
    return {
      doctrine: '看节奏->定趋势->看产品->定目标->找偏差->落动作->复盘',
      doctrineSource: 'root_node_training_doc',
      profile,
      seasonKey: '',
      label: '',
      phase: '',
      target: null,
      targetGap: null,
      problemFocus: '',
    };
  }
  const window = matched[0];
  const target = nodeTargetsFor(window, lifecycle);
  const daysToPeakStart = daysUntil(businessDate, window.peakStart);
  const daysToPeakEnd = daysUntil(businessDate, window.peakEnd);
  const targetGap = {
    weeklyClicksGap: Math.max(0, num(target.weeklyClicks) - num(ad7.clicks)),
    weeklyOrdersGap: Math.max(0, num(target.weeklyOrders) - num(ad7.orders)),
    acosOver: num(ad7.orders) > 0 ? Math.max(0, num(ad7.acos) - num(target.acosCeiling)) : 0,
  };
  return {
    doctrine: '看节奏->定趋势->看产品->定目标->找偏差->落动作->复盘',
    doctrineSource: 'root_node_training_doc',
    profile,
    seasonKey: window.key,
    label: window.label,
    phase: window.phase,
    preheatStart: window.preheatStart,
    peakStart: window.peakStart,
    peakEnd: window.peakEnd,
    tailEnd: window.tailEnd,
    daysToPeakStart,
    daysToPeakEnd,
    target,
    targetGap,
    problemFocus: problemFocusFor({ seasonKey: window.key, target }, ad7),
  };
}

function pushReason(reasons, value) {
  if (value && !reasons.includes(value)) reasons.push(value);
}

function verdictFor(input = {}) {
  const reasons = [];
  const lifecycle = input.lifecycle || {};
  const inv = input.inventory || {};
  const ad7 = input.ad7 || {};
  const ad30 = input.ad30 || {};
  const units7 = num(input.units7);
  const units30 = num(input.units30);
  const profitRate = num(input.profitRate);
  const yoy = input.yoy?.value;
  const pace = input.salesPace7v30;
  const nodePlan = input.nodePlan || {};

  const oldish = ['old_product', 'old_product_unknown_age'].includes(lifecycle.key);
  const newish = lifecycle.key === 'new_product';
  const yoyDownHard = yoy !== null && yoy <= -0.25;
  const noOrderWaste = (ad7.spend >= 5 && ad7.orders <= 0) || (ad30.spend >= 15 && ad30.orders <= 0);
  const thinTraffic = ad30.impressions < 500 || ad30.clicks < 10;
  const stockTight = inv.hasInventory && ((inv.sellableDays7d > 0 && inv.sellableDays7d <= 14) || (inv.invDays > 0 && inv.invDays <= 21));
  const healthyConversion = units7 > 0 && profitRate >= 0.15 && inv.invDays >= 30 && ad7.orders > 0 && ad7.acos > 0 && ad7.acos <= Math.max(0.22, profitRate + 0.03);

  if (stockTight && units7 > 0) {
    pushReason(reasons, '库存承接紧，不能盲目放量');
    return { verdict: 'protect_stock', action: '控量保库存', priority: 94, reasons };
  }

  if (nodePlan.seasonKey && ['upcoming', 'preheat', 'peak'].includes(nodePlan.phase)) {
    const gap = nodePlan.targetGap || {};
    const target = nodePlan.target || {};
    if (num(gap.weeklyClicksGap) > 0 && inv.hasInventory) {
      pushReason(reasons, `${nodePlan.label} ${nodePlan.phase} 阶段，峰值 ${nodePlan.peakStart || nodePlan.peakEnd} 前需要先拿到点击验证`);
      pushReason(reasons, `当前7日点击 ${ad7.clicks}，阶段目标 ${target.weeklyClicks}，缺口 ${gap.weeklyClicksGap}`);
      return { verdict: 'node_traffic_gap', action: '补节点曝光/点击', priority: 90, reasons };
    }
    if (num(gap.weeklyOrdersGap) > 0 && num(ad7.clicks) >= num(target.weeklyClicks)) {
      pushReason(reasons, `${nodePlan.label} ${nodePlan.phase} 阶段点击已到但订单没跟上`);
      pushReason(reasons, '先查主图、标题、价格、评价和词相关性，不是继续盲目加价');
      return { verdict: 'node_conversion_gap', action: '修节点承接', priority: 89, reasons };
    }
    if (num(gap.acosOver) > 0) {
      pushReason(reasons, `${nodePlan.label} ${nodePlan.phase} 阶段有订单但成本超出阶段阈值`);
      return { verdict: 'node_efficiency_control', action: '收弱泛词，保核心词', priority: 82, reasons };
    }
  }

  if (noOrderWaste && (profitRate < 0.12 || ad30.orders <= 0)) {
    pushReason(reasons, '广告有消耗但订单没有跟上');
    if (profitRate < 0.12) pushReason(reasons, '利润空间不足，先止血');
    return { verdict: 'stop_loss', action: '先控低效流量', priority: 92, reasons };
  }

  if (newish && inv.hasInventory && thinTraffic) {
    pushReason(reasons, '新品有库存但流量启动不足');
    return { verdict: 'launch_repair', action: '修新品启动结构', priority: 88, reasons };
  }

  if (oldish && yoyDownHard) {
    pushReason(reasons, '老品同比销量下滑');
    if (pace !== null && pace < -0.2) pushReason(reasons, '7日销量节奏低于30日均速');
    if (thinTraffic) pushReason(reasons, '当前广告流量偏薄');
    const action = profitRate >= 0.1 && inv.invDays >= 30 ? '查流量下滑还是转化下滑' : '先修利润/页面再谈放量';
    return { verdict: 'old_product_recovery_check', action, priority: 84, reasons };
  }

  if (healthyConversion) {
    pushReason(reasons, '有销量、有库存、有利润，广告成本可控');
    return { verdict: 'push_or_hold_proven', action: '保有效流量，小步扩', priority: 76, reasons };
  }

  if (units7 > 0 && profitRate > 0 && inv.hasInventory) {
    pushReason(reasons, '有近7日销量但证据还不足以激进放量');
    return { verdict: 'small_step_verify', action: '小步验证', priority: 64, reasons };
  }

  if (units30 <= 0 && ad30.spend <= 0 && inv.hasInventory) {
    pushReason(reasons, '有库存但近30日销量和广告证据弱');
    return { verdict: 'deep_check', action: '查产品/页面/基础广告', priority: 58, reasons };
  }

  pushReason(reasons, '未触发明显动作阈值');
  return { verdict: 'watch', action: '观察', priority: 30, reasons };
}

function buildAllSkuOperatingReview(input = {}) {
  const snapshot = input.snapshot || {};
  const timeContext = input.timeContext || {};
  const businessDate = dateOnly(timeContext.businessDate || input.businessDate || new Date().toISOString().slice(0, 10));
  const selectionReports = normalizeSelectionMarketReport(input.selectionReports || input.marketEvidence || snapshot.selectionReports || {});
  const cards = (snapshot.productCards || []).filter(card => text(card.sku));
  const rows = cards.map(card => {
    const lifecycle = lifecycleFor(card, businessDate);
    const yoy = yoyFor(card);
    const ad3 = adWindow(card, '3d');
    const ad7 = adWindow(card, '7d');
    const ad30 = adWindow(card, '30d');
    const inventory = inventoryFor(card);
    const units3 = num(card.unitsSold_3d);
    const units7 = num(card.unitsSold_7d);
    const units30 = num(card.unitsSold_30d);
    const profitRate = profitRateFor(card);
    const pace = salesPace7v30(units7, units30);
    const nodePlan = buildNodePlan(card, lifecycle, ad7, businessDate);
    const verdict = verdictFor({
      lifecycle,
      inventory,
      ad7,
      ad30,
      units7,
      units30,
      profitRate,
      yoy,
      salesPace7v30: pace,
      nodePlan,
    });
    const profile = nodePlan.profile || productProfileFor(card);
    const marketAnalysis = buildSkuMarketAnalysis({
      card,
      profile,
      nodePlan,
      verdict,
      selectionReports,
    });
    return {
      sku: text(card.sku),
      asin: text(card.asin),
      productType: text(profile.productType || profile.positioning || card.saleStatus),
      lifecycle: lifecycle.key,
      lifecycleLabel: lifecycle.label,
      ageDays: lifecycle.ageDays,
      openDate: lifecycle.openDate,
      fuldate: dateOnly(card.fuldate || card.fulfillmentDate),
      units3d: round(units3, 0),
      units7d: round(units7, 0),
      units30d: round(units30, 0),
      salesPace7v30: pace,
      yoyUnitsPct: yoy.value,
      yoySourceField: yoy.source,
      profitRate,
      invDays: inventory.invDays,
      sellableDays7d: inventory.sellableDays7d,
      fulRes: inventory.fulRes,
      ad3,
      ad7,
      ad30,
      nodePlan: {
        seasonKey: nodePlan.seasonKey,
        label: nodePlan.label,
        phase: nodePlan.phase,
        peakStart: nodePlan.peakStart,
        peakEnd: nodePlan.peakEnd,
        daysToPeakStart: nodePlan.daysToPeakStart,
        target: nodePlan.target,
        targetGap: nodePlan.targetGap,
        problemFocus: nodePlan.problemFocus,
        doctrine: nodePlan.doctrine,
        doctrineSource: nodePlan.doctrineSource,
      },
      verdict: verdict.verdict,
      action: verdict.action,
      priority: verdict.priority,
      reasons: verdict.reasons,
      marketAnalysis,
      followUp: verdict.verdict === 'old_product_recovery_check'
        ? '补看 chart 展示/点击、listing/价格、广告词是否同步变差'
        : verdict.verdict === 'node_traffic_gap'
          ? '按节点峰值前点击目标复查展示、CTR、相关词排名和预算是否够'
          : verdict.verdict === 'node_conversion_gap'
            ? '按节点产品承接复查主图、标题、价格、评价和词相关性'
        : verdict.verdict === 'launch_repair'
          ? '检查 SP auto/keyword/manual 是否齐，低预算买第一批搜索词数据'
          : verdict.verdict === 'stop_loss'
            ? '先处理无单消耗词/靶向，保留同 SKU 已验证流量'
            : '下一日复查销量、花费、ACOS、库存承接',
    };
  }).sort((a, b) =>
    num(b.priority) - num(a.priority) ||
    num(b.units30d) - num(a.units30d) ||
    text(a.sku).localeCompare(text(b.sku))
  );

  const byLifecycle = {};
  const byVerdict = {};
  for (const row of rows) {
    byLifecycle[row.lifecycleLabel] = (byLifecycle[row.lifecycleLabel] || 0) + 1;
    byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;
  }
  const marketAnalysis = summarizeMarketAnalysis(rows);

  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    dataDate: dateOnly(timeContext.dataDate || businessDate),
    summary: {
      totalSkus: rows.length,
      byLifecycle,
      byVerdict,
      mustReview: rows.filter(row => row.priority >= 80).length,
      oldProductYoyDown: rows.filter(row => row.verdict === 'old_product_recovery_check').length,
      newLaunchRepair: rows.filter(row => row.verdict === 'launch_repair').length,
      stopLoss: rows.filter(row => row.verdict === 'stop_loss').length,
      nodeTrafficGap: rows.filter(row => row.verdict === 'node_traffic_gap').length,
      nodeConversionGap: rows.filter(row => row.verdict === 'node_conversion_gap').length,
      marketAnalysis,
    },
    rows,
    topPriorityRows: rows.slice(0, 50),
  };
}

function pct(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function renderAllSkuOperatingReviewHtml(review = {}) {
  const rows = Array.isArray(review.rows) ? review.rows : [];
  const summary = review.summary || {};
  const lifecycle = Object.entries(summary.byLifecycle || {})
    .map(([key, value]) => `<span class="pill">${esc(key)} ${esc(value)}</span>`)
    .join('');
  const verdicts = Object.entries(summary.byVerdict || {})
    .map(([key, value]) => `<span class="pill">${esc(key)} ${esc(value)}</span>`)
    .join('');
  const tableRows = rows.map(row => `<tr>
    <td>${esc(row.sku)}</td>
    <td>${esc(row.lifecycleLabel)}${row.ageDays !== null && row.ageDays !== undefined ? ` / ${esc(row.ageDays)}d` : ''}</td>
    <td>${esc(row.nodePlan?.label || '-')} ${esc(row.nodePlan?.phase || '')}</td>
    <td>${esc(row.openDate || '-')}</td>
    <td>${esc(row.units3d)} / ${esc(row.units7d)} / ${esc(row.units30d)}</td>
    <td>${pct(row.yoyUnitsPct)}</td>
    <td>${pct(row.profitRate)}</td>
    <td>${esc(row.invDays)}</td>
    <td>${esc(row.ad7.spend)} / ${esc(row.ad7.orders)} / ${pct(row.ad7.acos)}</td>
    <td>${row.nodePlan?.target ? `${esc(row.nodePlan.target.weeklyClicks)} clicks / ${esc(row.nodePlan.target.weeklyOrders)} orders` : '-'}</td>
    <td>${esc(row.action)}</td>
    <td>${esc((row.reasons || []).join('；'))}</td>
    <td>${esc(row.followUp)}</td>
  </tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>全 SKU 经营复盘 ${esc(review.businessDate || '')}</title>
  <style>
    body { margin: 0; padding: 24px; background: #f7f8fa; color: #17202a; font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif; font-size: 14px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { color: #667085; margin-bottom: 16px; line-height: 1.7; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 18px; }
    .pill { background: #eef2f6; border: 1px solid #d9dee7; border-radius: 999px; padding: 5px 10px; }
    .table-wrap { overflow: auto; border: 1px solid #d9dee7; border-radius: 8px; background: #fff; max-height: 78vh; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid #e6e9ef; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { position: sticky; top: 0; background: #fafbfc; color: #667085; }
  </style>
</head>
<body>
  <h1>全 SKU 经营复盘</h1>
  <div class="meta">businessDate ${esc(review.businessDate || '')} / dataDate ${esc(review.dataDate || '')} / totalSkus ${esc(summary.totalSkus || 0)} / mustReview ${esc(summary.mustReview || 0)}</div>
  <div class="pills">${lifecycle}</div>
  <div class="pills">${verdicts}</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>SKU</th><th>生命周期</th><th>节点阶段</th><th>开售</th><th>销量 3/7/30</th><th>同比</th><th>利润率</th><th>库存天数</th><th>7日广告 花费/单/ACOS</th><th>阶段目标</th><th>结论</th><th>原因</th><th>复查点</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</body>
</html>`;
}

module.exports = {
  buildAllSkuOperatingReview,
  buildNodePlan,
  lifecycleFor,
  renderAllSkuOperatingReviewHtml,
  verdictFor,
  yoyFor,
};
