'use strict';

/**
 * 老品下滑归因 SOP 逻辑模块
 *
 * 严格按照《亚马逊老品下滑整改闭环 SOP 文档》(V1.0) 规则执行：
 * - TABLE 1: 产品分级
 * - TABLE 2: 归因矩阵
 * - TABLE 4: 标准化动作包
 */

// ─── TABLE 1: 产品价值分级 ───────────────────────────────────────────────────

const GRADING_RULES = [
  {
    grade: '核心老品',
    priority: '最高',
    strategy: '全资源倾斜，强制完成闭环整改',
    match: (metrics) =>
      metrics.profitRankPct <= 30 && metrics.yoyDeclinePct <= 70,
  },
  {
    grade: '潜力老品',
    priority: '次高',
    strategy: '资源倾斜，加速放量，打造新爆款',
    match: (metrics) =>
      metrics.yoyDeclinePct < 0 && // 正增长(负的下滑 = 增长)
      metrics.profitHealthy &&
      metrics.conversionTrendUp,
  },
  {
    grade: '边缘老品',
    priority: '中等',
    strategy: '控制成本、止损，仅处理关键问题',
    match: (metrics) =>
      metrics.profitRankPct > 30 &&
      metrics.profitRankPct <= 70 &&
      metrics.yoyDeclinePct > 30 &&
      metrics.yoyDeclinePct <= 70,
  },
  {
    grade: '淘汰老品',
    priority: '最低',
    strategy: '清库存、逐步退市，不分配整改资源',
    match: (metrics) =>
      metrics.profitRankPct > 70 ||
      metrics.yoyDeclinePct > 70,
  },
];

function gradeProduct(metrics) {
  for (const rule of GRADING_RULES) {
    if (rule.match(metrics)) {
      return { grade: rule.grade, priority: rule.priority, strategy: rule.strategy };
    }
  }
  return { grade: '未分级', priority: '待定', strategy: '需要补充数据后判定' };
}

// ─── TABLE 2: 归因矩阵 ─────────────────────────────────────────────────────

const ATTRIBUTION_MATRIX = [
  {
    pattern: '销量下降+点击率走低',
    match: (indicators) =>
      indicators.salesDown && (indicators.ctrDown || (indicators.acosWorsening && !indicators.cvrDown)),
    investigation: '流量渠道变动、关键词排名下跌、广告曝光不足',
    possibleRootCauses: [
      '断货导致链接权重流失',
      '广告预算/出价管控不当',
      '竞品抢占自然流量',
    ],
  },
  {
    pattern: '销量下降+转化率走低',
    match: (indicators) =>
      indicators.salesDown && (indicators.cvrDown || (!indicators.ctrDown && !indicators.acosWorsening)),
    investigation: '差评增多、Listing 老旧、定价无优势、竞品促销',
    possibleRootCauses: [
      'Listing 长期未优化',
      '差评处理不及时',
      '定价策略滞后',
    ],
  },
  {
    pattern: '利润下滑（销量正常/微涨）',
    match: (indicators) =>
      (indicators.profitDown || indicators.acosHigh) && !indicators.salesDown,
    investigation: 'ACoS 偏高、广告占比过高、库存积压',
    possibleRootCauses: [
      '广告结构不合理',
      '备货预测失误',
      '未及时调整售价',
    ],
  },
];

function detectIndicators(data) {
  const salesDown = data.units30d_yoy != null && data.units30d_yoy < -0.1;
  const ctrDown = data.ctr30d != null && data.ctr7d != null && data.ctr7d < data.ctr30d * 0.85;
  const cvrDown = data.cvr30d != null && data.cvr7d != null && data.cvr7d < data.cvr30d * 0.85;
  const profitDown = data.profitRate != null && data.profitRate < 0.05;
  const acosHigh = data.acos30d != null && data.acos30d > 0.35;
  // 如果 CTR/CVR 数据不可用，用 ACoS 恶化作为补充信号
  const acosWorsening = data.acos7d != null && data.acos30d != null && data.acos7d > data.acos30d * 1.2;

  return { salesDown, ctrDown, cvrDown, profitDown, acosHigh, acosWorsening };
}

function attributeRootCauses(data) {
  const indicators = detectIndicators(data);
  const matched = [];

  for (const row of ATTRIBUTION_MATRIX) {
    if (row.match(indicators)) {
      matched.push(row);
    }
  }

  if (matched.length === 0) {
    return {
      indicators,
      attribution: null,
      rootCauses: [],
      note: '表层指标变化不明显或数据不完整，需人工补充判断',
    };
  }

  // SOP 要求：仅锁定 1-2 项核心根因
  const primary = matched[0];
  const rootCauses = selectRootCauses(primary, data);

  return {
    indicators,
    attribution: primary,
    rootCauses,
    note: null,
  };
}

function selectRootCauses(attribution, data) {
  const causes = [];

  for (const cause of attribution.possibleRootCauses) {
    const evidence = findEvidence(cause, data);
    if (evidence) {
      causes.push({ cause, evidence });
    }
    if (causes.length >= 2) break; // SOP: 最多 2 项
  }

  // 如果没找到有数据支撑的根因，取第一个作为疑似
  if (causes.length === 0 && attribution.possibleRootCauses.length > 0) {
    causes.push({
      cause: attribution.possibleRootCauses[0],
      evidence: '数据支撑不足，需人工确认',
    });
  }

  return causes;
}

function findEvidence(cause, data) {
  switch (cause) {
    case '断货导致链接权重流失':
      if (data.invDays != null && data.invDays < 7) {
        return `库存可售天数仅 ${data.invDays} 天，存在断货风险或近期曾断货`;
      }
      if (data.hadStockout) {
        return '近期存在断货记录';
      }
      return null;

    case '广告预算/出价管控不当':
      if (data.acos7d != null && data.acos30d != null && data.acos7d > data.acos30d * 1.3) {
        return `7天ACoS(${pct(data.acos7d)})显著高于30天ACoS(${pct(data.acos30d)})，广告效率恶化`;
      }
      if (data.adSpend30d != null && data.adSales30d != null && data.adSpend30d > data.adSales30d * 0.4) {
        return `广告花费占销售额 ${pct(data.adSpend30d / data.adSales30d)}，占比过高`;
      }
      return null;

    case '竞品抢占自然流量':
      if (data.organicRatioDown) {
        return '自然流量占比下降，可能被竞品挤压';
      }
      return null;

    case 'Listing 长期未优化':
      if (data.listingAge != null && data.listingAge > 180 && data.cvrDown) {
        return `Listing 已超过 ${data.listingAge} 天未更新，转化率持续下滑`;
      }
      return null;

    case '差评处理不及时':
      if (data.recentNegativeReviews != null && data.recentNegativeReviews > 0) {
        return `近期新增 ${data.recentNegativeReviews} 条差评`;
      }
      return null;

    case '定价策略滞后':
      // 需要竞品价格数据，通常不在基础数据中
      return null;

    case '广告结构不合理':
      if (data.acos30d != null && data.acos30d > 0.35) {
        return `30天ACoS高达 ${pct(data.acos30d)}，广告结构需优化`;
      }
      return null;

    case '备货预测失误':
      if (data.invDays != null && data.invDays > 90) {
        return `库存可售天数 ${data.invDays} 天，存在积压`;
      }
      return null;

    case '未及时调整售价':
      return null; // 需要价格历史数据

    default:
      return null;
  }
}

// ─── TABLE 4: 标准化动作包 ──────────────────────────────────────────────────

const ACTION_PACKS = {
  '断货导致链接权重流失': {
    actions: [
      '跟进 FBA 紧急补货及入仓进度，设置到货预警',
      '启用备用链接/自发货承接临时流量',
      '重启广告，优先投放老客+高转化精准词，严控泛流量',
    ],
    metrics: '入仓时效、广告点击率、订单恢复率',
  },
  '广告预算/出价管控不当': {
    actions: [
      '关停低转化关键词、低效广告位，保留高ROI流量',
      '设置分时竞价，仅在流量高峰时段投放',
      '设定ACoS红线，超标自动降预算/暂停计划',
    ],
    metrics: 'ACoS、广告订单占比、广告ROI',
  },
  '竞品抢占自然流量': {
    actions: [
      '对标头部竞品定价、促销、广告策略',
      '针对竞品高转化关键词精准卡位投放',
      'Listing 强化竞品不具备的优势卖点',
    ],
    metrics: '关键词排名、自然流量占比',
  },
  'Listing 长期未优化': {
    actions: [
      '24小时内处理负面评价、补充QA答疑',
      '优化主图、标题、五点，强化产品差异化卖点',
      '参考竞品定价，合理设置优惠券/限时折扣',
    ],
    metrics: '转化率、好评率、优惠券使用率',
  },
  '差评处理不及时': {
    actions: [
      '24小时内处理负面评价、补充QA答疑',
      '优化主图、标题、五点，强化产品差异化卖点',
      '参考竞品定价，合理设置优惠券/限时折扣',
    ],
    metrics: '转化率、好评率、优惠券使用率',
  },
  '定价策略滞后': {
    actions: [
      '参考竞品定价，合理设置优惠券/限时折扣',
      '优化主图、标题、五点，强化产品差异化卖点',
      '启用品牌/展示型广告扩流',
    ],
    metrics: '转化率、客单价、好评率',
  },
  '广告结构不合理': {
    actions: [
      '关停低转化关键词、低效广告位，保留高ROI流量',
      '设置分时竞价，仅在流量高峰时段投放',
      '设定ACoS红线，超标自动降预算/暂停计划',
    ],
    metrics: 'ACoS、广告订单占比、广告ROI',
  },
  '备货预测失误': {
    actions: [
      '复盘近12个月销量+季节数据，修正备货预测模型',
      '滞销品通过捆绑、站外活动清库存',
      '分批次小批量补货，规避压货/断货风险',
    ],
    metrics: '库存周转天数、断货率、滞销率',
  },
  '未及时调整售价': {
    actions: [
      '参考竞品定价，合理设置优惠券/限时折扣',
      '提升自然流量占比，降低广告依赖',
      '稳定售价，避免乱降价',
    ],
    metrics: 'ACoS、广告占比、利润率',
  },
};

function matchActionPack(rootCause) {
  return ACTION_PACKS[rootCause] || {
    actions: ['需要根据具体情况制定整改方案'],
    metrics: '待定',
  };
}

// ─── 风险等级判定 ─────────────────────────────────────────────────────────────

function assessRisk(metrics, rootCauses) {
  if (metrics.yoyDeclinePct > 50) return '高';
  if (metrics.yoyDeclinePct > 30) return '中';
  if (rootCauses.some(r => r.cause.includes('断货'))) return '高';
  return '低';
}

// ─── 输出格式化 ─────────────────────────────────────────────────────────────

function formatDiagnosisReport(sku, asin, data, grading, attribution, rootCauses, risk) {
  const today = new Date();
  const endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  let report = `📋 老品整改问题单\n\n`;
  report += `SKU/ASIN：${sku} / ${asin || '待确认'}\n`;
  report += `所属类目：${data.category || '待确认'}\n`;
  report += `产品分级：${grading.grade}\n`;
  report += `近30天利润贡献：${data.profit30d != null ? `¥${data.profit30d.toFixed(0)}` : '待确认'}`;
  if (data.profitRankPct != null) {
    report += `（排名前 ${data.profitRankPct.toFixed(0)}%）`;
  }
  report += `\n`;
  report += `同比下滑幅度：${data.units30d_yoy != null ? pct(data.units30d_yoy) : '待确认'}\n`;
  report += `与部门均值差距：${data.gapToDeptAvg != null ? `低于均值 ${pct(Math.abs(data.gapToDeptAvg))}` : '待确认'}\n`;
  report += `\n`;

  report += `【表层指标变化】\n`;
  if (data.units30d != null) {
    report += `- 30天销量：${data.units30d}单${data.units30d_yoy != null ? `（同比${pctSigned(data.units30d_yoy)}）` : ''}\n`;
  }
  if (data.acos7d != null || data.acos30d != null) {
    report += `- 7天ACoS：${data.acos7d != null ? pct(data.acos7d) : 'N/A'}（vs 30天 ${data.acos30d != null ? pct(data.acos30d) : 'N/A'}）\n`;
  }
  if (data.cvr30d != null) {
    report += `- 30天转化率：${pct(data.cvr30d)}\n`;
  }
  if (data.invDays != null) {
    report += `- 库存可售天数：${data.invDays}天\n`;
  }
  report += `\n`;

  report += `【核心根因（1-2 项）】\n`;
  if (rootCauses.length === 0) {
    report += `- 数据不足，需人工补充判断\n`;
  } else {
    rootCauses.forEach((rc, i) => {
      report += `${i + 1}. ${rc.cause}\n`;
      report += `   数据依据：${rc.evidence}\n`;
    });
  }
  report += `\n`;

  report += `【匹配整改动作】\n`;
  if (rootCauses.length === 0) {
    report += `- 待归因确认后匹配\n`;
  } else {
    const pack = matchActionPack(rootCauses[0].cause);
    pack.actions.forEach((action, i) => {
      report += `${i + 1}. ${action}\n`;
    });
    report += `   验证指标：${pack.metrics}\n`;
  }
  report += `\n`;

  report += `【整改周期】：2 周（${fmt(today)} 至 ${fmt(endDate)}）\n`;
  report += `【风险等级】：${risk}\n`;
  report += `【负责人】：__________ 【监督人】：组长\n`;

  return report;
}

// ─── 主入口 ─────────────────────────────────────────────────────────────────

function diagnose(sku, rawData) {
  const data = normalizeData(sku, rawData);
  const asin = data.asin || '';

  const metrics = {
    profitRankPct: data.profitRankPct != null ? data.profitRankPct : 50,
    yoyDeclinePct: data.units30d_yoy != null ? Math.abs(data.units30d_yoy) * 100 : 0,
    profitHealthy: data.profitRate != null && data.profitRate > 0.08,
    conversionTrendUp: data.cvr7d != null && data.cvr30d != null && data.cvr7d > data.cvr30d,
  };

  // 如果是正增长，yoyDeclinePct 为负数表示增长
  if (data.units30d_yoy != null && data.units30d_yoy > 0) {
    metrics.yoyDeclinePct = -data.units30d_yoy * 100;
  }

  const grading = gradeProduct(metrics);
  const { indicators, attribution, rootCauses, note } = attributeRootCauses(data);
  const risk = assessRisk(metrics, rootCauses);

  const report = formatDiagnosisReport(sku, asin, data, grading, attribution, rootCauses, risk);

  return {
    sku,
    asin,
    grading,
    indicators,
    attribution: attribution ? attribution.pattern : null,
    rootCauses,
    risk,
    report,
    note,
    data,
  };
}

// ─── 数据标准化 ──────────────────────────────────────────────────────────────

function normalizeData(sku, raw) {
  const data = { sku, ...raw };

  // 计算派生指标
  if (raw.adClicks30d && raw.adClicks30d > 0) {
    if (data.cvr30d == null && raw.adOrders30d != null) {
      data.cvr30d = raw.adOrders30d / raw.adClicks30d;
    }
    if (data.ctr30d == null && raw.adImpressions30d != null && raw.adImpressions30d > 0) {
      data.ctr30d = raw.adClicks30d / raw.adImpressions30d;
    }
  }
  if (raw.adClicks7d && raw.adClicks7d > 0) {
    if (data.cvr7d == null && raw.adOrders7d != null) {
      data.cvr7d = raw.adOrders7d / raw.adClicks7d;
    }
    if (data.ctr7d == null && raw.adImpressions7d != null && raw.adImpressions7d > 0) {
      data.ctr7d = raw.adClicks7d / raw.adImpressions7d;
    }
  }
  if (raw.adSpend30d != null && raw.adSales30d != null && raw.adSales30d > 0) {
    if (data.acos30d == null) {
      data.acos30d = raw.adSpend30d / raw.adSales30d;
    }
  }
  if (raw.adSpend7d != null && raw.adSales7d != null && raw.adSales7d > 0) {
    if (data.acos7d == null) {
      data.acos7d = raw.adSpend7d / raw.adSales7d;
    }
  }

  return data;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function pct(v) {
  if (v == null) return 'N/A';
  return (v * 100).toFixed(1) + '%';
}

function pctSigned(v) {
  if (v == null) return 'N/A';
  const val = (v * 100).toFixed(1);
  return v > 0 ? `+${val}%` : `${val}%`;
}

module.exports = {
  diagnose,
  gradeProduct,
  attributeRootCauses,
  matchActionPack,
  assessRisk,
  detectIndicators,
  normalizeData,
  GRADING_RULES,
  ATTRIBUTION_MATRIX,
  ACTION_PACKS,
};
