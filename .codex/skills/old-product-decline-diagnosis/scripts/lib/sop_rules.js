'use strict';

/**
 * 老品下滑归因 SOP 规则引擎（自包含）
 * 严格按照《亚马逊老品下滑整改闭环 SOP 文档》(V1.0)
 */

// ─── 产品分级 ────────────────────────────────────────────────────────────────

const GRADING_RULES = [
  {
    grade: '核心老品', priority: '最高',
    strategy: '全资源倾斜，强制完成闭环整改',
    match: (m) => m.profitRankPct <= 30 && m.yoyDeclinePct <= 70,
  },
  {
    grade: '潜力老品', priority: '次高',
    strategy: '资源倾斜，加速放量，打造新爆款',
    match: (m) => m.yoyDeclinePct < 0 && m.profitHealthy && m.conversionTrendUp,
  },
  {
    grade: '边缘老品', priority: '中等',
    strategy: '控制成本、止损，仅处理关键问题',
    match: (m) => m.profitRankPct > 30 && m.profitRankPct <= 70 && m.yoyDeclinePct <= 70,
  },
  {
    grade: '淘汰老品', priority: '最低',
    strategy: '清库存、逐步退市，不分配整改资源',
    match: (m) => m.profitRankPct > 70 || m.yoyDeclinePct > 70,
  },
];

function gradeProduct(metrics) {
  for (const rule of GRADING_RULES) {
    if (rule.match(metrics)) return { grade: rule.grade, priority: rule.priority, strategy: rule.strategy };
  }
  return { grade: '待定', priority: '需补充数据', strategy: '需要利润贡献排名和同比数据后判定' };
}

// ─── 归因矩阵 ────────────────────────────────────────────────────────────────

const ATTRIBUTION_MATRIX = [
  {
    pattern: '销量下降+流量/点击问题',
    match: (ind) => ind.salesDown && (ind.ctrDown || ind.acosWorsening || ind.impressionsDown),
    investigation: '流量渠道变动、关键词排名下跌、广告曝光不足',
    possibleRootCauses: [
      { cause: '断货导致链接权重流失', check: (d) => d.invDays != null && d.invDays < 7 ? `库存仅${d.invDays}天，存在断货风险` : null },
      { cause: '广告预算/出价管控不当', check: (d) => (d.acos7d != null && d.acos30d != null && d.acos7d > d.acos30d * 1.2) ? `7天ACoS(${pct(d.acos7d)})显著高于30天(${pct(d.acos30d)})` : (d.adSpendRatio > 0.4 ? `广告花费占比${pct(d.adSpendRatio)}过高` : null) },
      { cause: '竞品抢占自然流量', check: (d) => (d.impressions7d != null && d.impressions30d != null && (d.impressions7d / 7) < (d.impressions30d / 30) * 0.7) ? `广告展现量7天日均${Math.round(d.impressions7d/7)}，30天日均${Math.round(d.impressions30d/30)}，下滑${Math.round((1 - (d.impressions7d/7)/(d.impressions30d/30))*100)}%` : null },
    ],
  },
  {
    pattern: '销量下降+转化率走低',
    match: (ind) => ind.salesDown && (ind.cvrDown || (!ind.ctrDown && !ind.acosWorsening && !ind.impressionsDown)),
    investigation: '差评增多、Listing 老旧、定价无优势、竞品促销',
    possibleRootCauses: [
      { cause: 'Listing 长期未优化', check: (d) => (d.cvr7d != null && d.cvr30d != null && d.cvr7d < d.cvr30d * 0.8) ? `转化率下降：7天${pct(d.cvr7d)} vs 30天${pct(d.cvr30d)}` : null },
      { cause: '差评处理不及时', check: (_) => null },
      { cause: '定价策略滞后', check: (_) => null },
    ],
  },
  {
    pattern: '利润下滑（销量正常/微涨）',
    match: (ind) => (ind.profitDown || ind.acosHigh) && !ind.salesDown,
    investigation: 'ACoS 偏高、广告占比过高、库存积压',
    possibleRootCauses: [
      { cause: '广告结构不合理', check: (d) => d.acos30d > 0.35 ? `ACoS高达${pct(d.acos30d)}` : null },
      { cause: '备货预测失误', check: (d) => d.invDays > 90 ? `库存${d.invDays}天积压` : null },
      { cause: '未及时调整售价', check: (_) => null },
    ],
  },
];

function detectIndicators(data) {
  // salesDown 判定优先级：
  // 1. 有 yoy 同比：下滑>10% 即判定
  // 2. 有7天vs30天广告订单：7天日均比30天日均低>20% 即判定
  // 3. 单量极低+利润为负：代理信号
  var salesDown = false;
  if (data.units30d_yoy != null) {
    salesDown = data.units30d_yoy < -0.1;
  } else if (data.adOrders7d != null && data.adOrders30d != null && data.adOrders30d > 5) {
    var dailyAvg30 = data.adOrders30d / 30;
    var dailyAvg7 = data.adOrders7d / 7;
    salesDown = dailyAvg30 > 0 && (dailyAvg7 - dailyAvg30) / dailyAvg30 < -0.2;
  } else if (data.units30d != null && data.units30d < 15 && data.profit30d != null && data.profit30d < 0) {
    salesDown = true;
  }
  return {
    salesDown,
    ctrDown: data.ctr7d != null && data.ctr30d != null && data.ctr7d < data.ctr30d * 0.8,
    cvrDown: data.cvr7d != null && data.cvr30d != null && data.cvr7d < data.cvr30d * 0.8,
    profitDown: data.profitRate != null && data.profitRate < 0.05,
    acosHigh: data.acos30d != null && data.acos30d > 0.35,
    acosWorsening: data.acos7d != null && data.acos30d != null && data.acos7d > data.acos30d * 1.2,
    impressionsDown: data.impressions7d != null && data.impressions30d != null &&
      (data.impressions7d / 7) < (data.impressions30d / 30) * 0.7,
  };
}

function attributeRootCauses(data) {
  const indicators = detectIndicators(data);
  for (const row of ATTRIBUTION_MATRIX) {
    if (row.match(indicators)) {
      const causes = [];
      for (const rc of row.possibleRootCauses) {
        const evidence = rc.check(data);
        if (evidence) causes.push({ cause: rc.cause, evidence });
        if (causes.length >= 2) break;
      }
      if (causes.length === 0) {
        causes.push({ cause: row.possibleRootCauses[0].cause, evidence: '数据支撑有限，建议人工核实' });
      }
      return { indicators, pattern: row.pattern, investigation: row.investigation, rootCauses: causes };
    }
  }
  return { indicators, pattern: null, investigation: null, rootCauses: [], note: '表层指标无明显异常或数据不完整' };
}

// ─── 动作包 ──────────────────────────────────────────────────────────────────

const ACTION_PACKS = {
  '断货导致链接权重流失': { actions: ['跟进FBA紧急补货及入仓进度，设置到货预警', '启用备用链接/自发货承接临时流量', '重启广告投老客+高转化精准词，严控泛流量'], metrics: '入仓时效、点击率、订单恢复率' },
  '广告预算/出价管控不当': { actions: ['关停低转化关键词/低效广告位，保留高ROI流量', '设置分时竞价，仅高峰时段投放', '设定ACoS红线，超标自动降预算/暂停'], metrics: 'ACoS、广告订单占比、ROI' },
  '竞品抢占自然流量': { actions: ['对标头部竞品定价/促销/广告策略', '针对竞品高转化词精准卡位投放', 'Listing强化差异卖点'], metrics: '关键词排名、自然流量占比' },
  'Listing 长期未优化': { actions: ['24h内处理差评、补充QA', '优化主图/标题/五点，强化差异化', '设置优惠券/限时折扣'], metrics: '转化率、好评率' },
  '差评处理不及时': { actions: ['24h内处理差评、补充QA', '优化主图/标题/五点，强化差异化', '设置优惠券/限时折扣'], metrics: '转化率、好评率' },
  '定价策略滞后': { actions: ['参考竞品定价，设置优惠券/限时折扣', '优化主图/五点强化卖点', '提升自然流量占比降低广告依赖'], metrics: '转化率、客单价' },
  '广告结构不合理': { actions: ['关停低转化词/低效位，保留高ROI', '分时竞价，高峰投放', '设ACoS红线，超标自动降预算'], metrics: 'ACoS、广告占比、ROI' },
  '备货预测失误': { actions: ['复盘12月销量修正预测模型', '滞销品捆绑/站外清库存', '分批小量补货避免压货'], metrics: '库存周转天数、断货率' },
  '未及时调整售价': { actions: ['参考竞品调价', '稳定售价避免乱降', '提升自然流量降低广告依赖'], metrics: '利润率、广告占比' },
};

function matchActionPack(rootCause) {
  return ACTION_PACKS[rootCause] || { actions: ['需根据具体情况制定方案'], metrics: '待定' };
}

// ─── 风险评估 ────────────────────────────────────────────────────────────────

function assessRisk(metrics, rootCauses) {
  if (metrics.yoyDeclinePct > 50) return '高';
  if (rootCauses.some(r => r.cause.includes('断货'))) return '高';
  if (metrics.yoyDeclinePct > 25) return '中';
  return '低';
}

// ─── 报告输出 ────────────────────────────────────────────────────────────────

function formatReport(sku, data, grading, attribution, risk) {
  const today = new Date();
  const end = new Date(today.getTime() + 14 * 86400000);
  const fmt = d => d.toISOString().slice(0, 10);

  let r = `📋 老品整改问题单\n\n`;
  r += `SKU/ASIN：${sku} / ${data.asin || '待确认'}\n`;
  r += `所属类目：${data.category || '待确认'}\n`;
  r += `产品分级：${grading.grade}（${grading.priority}优先级）\n`;
  r += `整改策略：${grading.strategy}\n`;
  if (data.profit30d != null) r += `近30天利润：¥${data.profit30d.toFixed(0)}${data.profitRankPct != null ? `（前${data.profitRankPct.toFixed(0)}%）` : ''}\n`;
  if (data.units30d_yoy != null) r += `同比变化：${pctSigned(data.units30d_yoy)}\n`;
  r += `\n`;

  r += `【表层指标】\n`;
  if (data.units30d != null) r += `- 30天销量：${data.units30d}单${data.units30d_yoy != null ? `（同比${pctSigned(data.units30d_yoy)}）` : ''}\n`;
  if (data.acos30d != null) r += `- 30天ACoS：${pct(data.acos30d)}${data.acos7d != null ? `（7天：${pct(data.acos7d)}）` : ''}\n`;
  if (data.cvr30d != null) r += `- 30天转化率：${pct(data.cvr30d)}${data.cvr7d != null ? `（7天：${pct(data.cvr7d)}）` : ''}\n`;
  if (data.ctr30d != null) r += `- 30天点击率：${pct(data.ctr30d)}${data.ctr7d != null ? `（7天：${pct(data.ctr7d)}）` : ''}\n`;
  if (data.impressions30d != null) r += `- 30天展现：${data.impressions30d}${data.impressions7d != null ? `（7天：${data.impressions7d}）` : ''}\n`;
  if (data.invDays != null) r += `- 库存可售天数：${data.invDays}天\n`;
  if (data.adSpend30d != null) r += `- 30天广告花费：$${data.adSpend30d.toFixed(2)}\n`;
  r += `\n`;

  r += `【归因诊断】\n`;
  if (attribution.pattern) {
    r += `匹配模式：${attribution.pattern}\n`;
    r += `排查方向：${attribution.investigation}\n\n`;
  }
  r += `【核心根因】\n`;
  if (attribution.rootCauses.length === 0) {
    r += `- 数据不足以自动归因，需人工补充以下数据后判断：\n`;
    r += `  · 同比销量变化（需要去年同期数据）\n`;
    r += `  · 库存可售天数\n`;
    r += `  · 近期是否有断货/差评\n`;
  } else {
    attribution.rootCauses.forEach((rc, i) => {
      r += `${i + 1}. ${rc.cause}\n   依据：${rc.evidence}\n`;
    });
  }
  r += `\n`;

  r += `【整改动作】\n`;
  if (attribution.rootCauses.length > 0) {
    const pack = matchActionPack(attribution.rootCauses[0].cause);
    pack.actions.forEach((a, i) => { r += `${i + 1}. ${a}\n`; });
    r += `验证指标：${pack.metrics}\n`;
  } else {
    r += `- 待归因确认后匹配\n`;
  }
  r += `\n`;

  r += `【整改周期】：2周（${fmt(today)} 至 ${fmt(end)}）\n`;
  r += `【风险等级】：${risk}\n`;
  r += `【负责人】：__________ 【监督人】：组长\n`;

  return r;
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

function diagnose(sku, rawData) {
  const data = normalize(sku, rawData);
  const metrics = {
    profitRankPct: data.profitRankPct != null ? data.profitRankPct : 50,
    yoyDeclinePct: data.units30d_yoy != null ? Math.abs(data.units30d_yoy) * 100 : 30,
    profitHealthy: data.profitRate != null && data.profitRate > 0.08,
    conversionTrendUp: data.cvr7d != null && data.cvr30d != null && data.cvr7d > data.cvr30d,
  };
  if (data.units30d_yoy != null && data.units30d_yoy > 0) metrics.yoyDeclinePct = -data.units30d_yoy * 100;

  const grading = gradeProduct(metrics);
  const attribution = attributeRootCauses(data);
  const risk = assessRisk(metrics, attribution.rootCauses);
  const report = formatReport(sku, data, grading, attribution, risk);

  return { sku, asin: data.asin, grading, attribution, risk, report, data };
}

function normalize(sku, raw) {
  const d = { sku, ...raw };
  if (d.adClicks30d > 0 && d.adImpressions30d > 0 && d.ctr30d == null) d.ctr30d = d.adClicks30d / d.adImpressions30d;
  if (d.adClicks7d > 0 && d.adImpressions7d > 0 && d.ctr7d == null) d.ctr7d = d.adClicks7d / d.adImpressions7d;
  if (d.adClicks30d > 0 && d.adOrders30d != null && d.cvr30d == null) d.cvr30d = d.adOrders30d / d.adClicks30d;
  if (d.adClicks7d > 0 && d.adOrders7d != null && d.cvr7d == null) d.cvr7d = d.adOrders7d / d.adClicks7d;
  if (d.adSpend30d > 0 && d.adSales30d > 0 && d.acos30d == null) d.acos30d = d.adSpend30d / d.adSales30d;
  if (d.adSpend7d > 0 && d.adSales7d > 0 && d.acos7d == null) d.acos7d = d.adSpend7d / d.adSales7d;
  if (d.adSpend30d > 0 && d.adSales30d > 0) d.adSpendRatio = d.adSpend30d / d.adSales30d;
  d.impressions30d = d.adImpressions30d;
  d.impressions7d = d.adImpressions7d;
  return d;
}

function pct(v) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }
function pctSigned(v) { if (v == null) return 'N/A'; const s = (v * 100).toFixed(1); return v > 0 ? `+${s}%` : `${s}%`; }

module.exports = { diagnose, gradeProduct, attributeRootCauses, matchActionPack, assessRisk };
