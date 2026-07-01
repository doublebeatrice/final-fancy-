'use strict';

/**
 * 老品下滑归因 SOP 规则引擎 v2（多源数据版）
 *
 * 数据输入：
 * - adv: 订单环比、ACoS、CTR、展现量、点击量
 * - sif: 关键词排名数量变化（total/prev/in/out）、自然词/广告词进出
 * - inventory: 同比(yoy)、利润率、库存天数（可选）
 */

// ─── 产品分级 ────────────────────────────────────────────────────────────────

function gradeProduct(data) {
  var orderDeclinePct = Math.abs(data.orderChange || 0) * 100;
  var profitRankPct = data.profitRankPct || 50;

  if (data.yoyQty != null) {
    orderDeclinePct = Math.abs(data.yoyQty);
  }

  if (profitRankPct <= 30 && orderDeclinePct <= 30)
    return { grade: '核心老品', priority: '最高', strategy: '全资源倾斜，强制完成闭环整改' };
  if (orderDeclinePct > 70 || profitRankPct > 70)
    return { grade: '淘汰老品', priority: '最低', strategy: '清库存、逐步退市，不分配整改资源' };
  if (profitRankPct <= 70 && orderDeclinePct <= 70)
    return { grade: '边缘老品', priority: '中等', strategy: '控制成本、止损，仅处理关键问题' };
  return { grade: '潜力老品', priority: '次高', strategy: '资源倾斜，加速放量' };
}

// ─── 指标检测（多源融合） ────────────────────────────────────────────────────

function detectIndicators(data) {
  var orderChange = data.orderChange || 0;
  var salesDown = orderChange < -0.15;
  if (data.yoyQty != null) salesDown = data.yoyQty < -10;

  var impressionChange = data.impressions30dPrev > 100
    ? (data.impressions30d - data.impressions30dPrev) / data.impressions30dPrev : 0;

  var clickChange = data.clicks30dPrev > 10
    ? (data.clicks30d - data.clicks30dPrev) / data.clicks30dPrev : 0;

  var ctrDown = data.ctr30dPrev > 0 && data.ctr30d < data.ctr30dPrev * 0.8;
  var acosWorsening = data.acos30dPrev > 0 && data.acos30d > data.acos30dPrev * 1.3;
  var impressionsDown = impressionChange < -0.3;
  var clicksDown = clickChange < -0.3;
  var cvrDown = data.conversionRate > 0 && data.conversionRate < 0.03;

  // SIF 指标
  var kwTotalDrop = false;
  var kwAdDrop = false;
  var kwNfDrop = false;
  if (data.sifOverview) {
    var ov = data.sifOverview;
    kwTotalDrop = ov.totalPeriod && ov.totalPeriod.prev > 10 &&
      ov.totalPeriod.total < ov.totalPeriod.prev * 0.6;
    kwAdDrop = ov.adKeywordCnt && ov.adKeywordCnt.prev > 5 &&
      ov.adKeywordCnt.total < ov.adKeywordCnt.prev * 0.5;
    kwNfDrop = ov.nfKeywordCnt && ov.nfKeywordCnt.prev > 5 &&
      ov.nfKeywordCnt.total < ov.nfKeywordCnt.prev * 0.6;
  }

  return {
    salesDown,
    impressionsDown,
    clicksDown,
    ctrDown,
    cvrDown,
    acosWorsening,
    kwTotalDrop,
    kwAdDrop,
    kwNfDrop,
    orderChange,
    impressionChange,
    clickChange,
  };
}

// ─── 归因矩阵 v2 ────────────────────────────────────────────────────────────

function attributeRootCauses(data) {
  var ind = detectIndicators(data);
  var causes = [];

  if (!ind.salesDown) {
    if (ind.acosWorsening) {
      causes.push({
        cause: '广告效率恶化（销量未跌但成本飙升）',
        evidence: 'ACoS从' + pct(data.acos30dPrev) + '升至' + pct(data.acos30d),
        action: 'restructure_ads'
      });
    }
    if (causes.length === 0) {
      return { indicators: ind, pattern: '未检测到显著下滑', rootCauses: [], note: '当前环比变化在正常范围内' };
    }
    return { indicators: ind, pattern: '利润下滑（销量尚可）', rootCauses: causes };
  }

  // 销量下滑 — 多维度归因
  var pattern = '销量环比下滑' + Math.round(Math.abs(data.orderChange || 0) * 100) + '%';

  // 归因1：广告投放大幅缩减
  if (ind.kwAdDrop && data.sifOverview) {
    var adKw = data.sifOverview.adKeywordCnt;
    causes.push({
      cause: '广告投放大幅缩减',
      evidence: '广告关键词从' + adKw.prev + '个降至' + adKw.total + '个（退出' + adKw.out + '个），广告覆盖面严重萎缩',
      action: 'restore_ads'
    });
  }

  // 归因2：自然排名流失
  if (ind.kwNfDrop && data.sifOverview) {
    var nfKw = data.sifOverview.nfKeywordCnt;
    causes.push({
      cause: '自然搜索排名大面积流失',
      evidence: '自然排名词从' + nfKw.prev + '个降至' + nfKw.total + '个（退出' + nfKw.out + '个），可能因断货/差评/竞品挤压导致权重下降',
      action: 'recover_ranking'
    });
  }

  // 归因3：展现量崩塌（没有SIF数据时的替代判断）
  if (causes.length === 0 && ind.impressionsDown) {
    var impPct = data.impressions30dPrev > 0
      ? Math.round((1 - data.impressions30d / data.impressions30dPrev) * 100) : 0;
    causes.push({
      cause: '广告展现量环比大幅下降',
      evidence: '展现从' + data.impressions30dPrev + '降至' + data.impressions30d + '（-' + impPct + '%），流量入口收窄',
      action: 'expand_traffic'
    });
  }

  // 归因4：ACoS恶化
  if (ind.acosWorsening && causes.length < 2) {
    causes.push({
      cause: '广告效率恶化',
      evidence: 'ACoS从' + pct(data.acos30dPrev) + '升至' + pct(data.acos30d) + '，投入产出比下降',
      action: 'restructure_ads'
    });
  }

  // 归因5：转化率低
  if (ind.cvrDown && causes.length < 2) {
    causes.push({
      cause: '转化率低下',
      evidence: '当前转化率仅' + pct(data.conversionRate) + '，低于健康水平',
      action: 'optimize_listing'
    });
  }

  // 归因6：CTR 下滑
  if (ind.ctrDown && causes.length < 2) {
    causes.push({
      cause: '点击率环比下降',
      evidence: 'CTR从' + pct(data.ctr30dPrev) + '降至' + pct(data.ctr30d) + '，主图/标题吸引力下降或竞品分流',
      action: 'optimize_listing'
    });
  }

  // 归因7：库存风险
  if (data.sellableDays != null && data.sellableDays < 7 && causes.length < 2) {
    causes.push({
      cause: '库存即将断货',
      evidence: '库存仅剩' + data.sellableDays + '天，断货导致权重流失',
      action: 'restock'
    });
  }

  // 兜底
  if (causes.length === 0) {
    if (ind.kwTotalDrop && data.sifOverview) {
      var tot = data.sifOverview.totalPeriod;
      causes.push({
        cause: '关键词排名整体下滑',
        evidence: '总排名词从' + tot.prev + '个降至' + tot.total + '个（退出' + tot.out + '个）',
        action: 'recover_ranking'
      });
    } else {
      causes.push({
        cause: '综合竞争力下降',
        evidence: '订单环比下滑' + Math.round(Math.abs(data.orderChange || 0) * 100) + '%，需结合前台评分/价格/竞品变化进一步排查',
        action: 'full_audit'
      });
    }
  }

  return { indicators: ind, pattern: pattern, rootCauses: causes.slice(0, 2) };
}

// ─── 动作包 ──────────────────────────────────────────────────────────────────

var ACTION_PACKS = {
  restore_ads: {
    actions: ['恢复被暂停/下线的广告活动，优先恢复历史出单词', '逐步扩大广告关键词覆盖，参照历史高转化词库', '监控恢复后7天的展现/点击/订单回升趋势'],
    metrics: '广告关键词数量恢复率、展现量回升率、7天订单恢复率'
  },
  recover_ranking: {
    actions: ['检查近期是否有差评/退货率升高，24h内处理', '优化标题+五点描述中的核心关键词密度', '通过精准广告+促销组合拉升核心词自然排名'],
    metrics: '自然排名关键词数量、核心词排名位次、自然流量占比'
  },
  expand_traffic: {
    actions: ['检查广告预算是否被自动降低或暂停', '扩大关键词覆盖面（长尾词+竞品词+场景词）', '提高核心词出价至建议竞价的 1.2-1.5 倍'],
    metrics: '展现量恢复率、新增关键词出单数、CTR'
  },
  restructure_ads: {
    actions: ['关停 ACoS 超过品线均值 2 倍的关键词', '保留近 7 天有出单的词，暂停纯花费词', '设置分时竞价策略，仅高转化时段提高出价'],
    metrics: 'ACoS下降幅度、广告订单占比、ROAS'
  },
  optimize_listing: {
    actions: ['对标头部竞品优化主图（场景图+对比图+尺寸图）', '更新标题和五点，突出差异化卖点', '设置优惠券/限时折扣提升转化率'],
    metrics: '转化率变化、CTR变化、好评率'
  },
  restock: {
    actions: ['跟进FBA紧急补货及入仓进度', '启用自发货/备用链接承接临时流量', '断货期间降低广告预算但保留核心词'],
    metrics: '入仓时效、补货后订单恢复率'
  },
  full_audit: {
    actions: ['排查近期差评/退货/A-Z索赔', '对比竞品价格/促销/新品动态', '检查是否有 listing 被修改/品牌投诉'],
    metrics: '综合诊断后确定具体验证指标'
  },
};

function matchActionPack(actionKey) {
  return ACTION_PACKS[actionKey] || ACTION_PACKS.full_audit;
}

// ─── 风险评估 ────────────────────────────────────────────────────────────────

function assessRisk(data, rootCauses) {
  var decline = Math.abs(data.orderChange || 0) * 100;
  if (data.yoyQty != null) decline = Math.abs(data.yoyQty);
  if (decline > 70) return '高';
  if (rootCauses.some(function(r) { return r.cause.includes('断货'); })) return '高';
  if (decline > 40) return '中-高';
  if (decline > 20) return '中';
  return '低';
}

// ─── 报告格式化 ─────────────────────────────────────────────────────────────

function formatReport(data, grading, attribution, risk) {
  var today = new Date();
  var end = new Date(today.getTime() + 14 * 86400000);
  var fmt = function(d) { return d.toISOString().slice(0, 10); };

  var r = '📋 老品整改问题单\n\n';
  r += 'SKU/ASIN：' + data.sku + ' / ' + (data.asin || '待确认') + '\n';
  r += '产品分级：' + grading.grade + '（' + grading.priority + '优先级）\n';
  r += '整改策略：' + grading.strategy + '\n';
  if (data.price) r += '当前售价：$' + data.price + '\n';
  if (data.fulDate) r += '上架日期：' + data.fulDate + '\n';
  r += '\n';

  r += '【环比/同比变化】\n';
  r += '- 30天订单：' + data.orders30d + '单（上期' + data.orders30dPrev + '单，';
  r += (data.orderChange >= 0 ? '+' : '') + Math.round(data.orderChange * 100) + '%）\n';
  if (data.yoyQty != null) {
    var yoyLabel = data._yoySource === 'seller' ? '（seller组整体）' : '';
    r += '- 同比变化：' + (data.yoyQty > 0 ? '+' : '') + data.yoyQty + '%' + yoyLabel + '\n';
  } else if (data._invStatus === 'session_expired') {
    r += '- 同比变化：⚠️ 不可用（库存系统 session 过期，请刷新登录后重跑）\n';
  } else if (data._invStatus === 'no_tab') {
    r += '- 同比变化：⚠️ 不可用（未登录 sellerinventory）\n';
  }
  r += '- 30天展现：' + data.impressions30d + '（上期' + data.impressions30dPrev + '）\n';
  r += '- 30天ACoS：' + pct(data.acos30d) + '（上期' + pct(data.acos30dPrev) + '）\n';
  r += '- 30天CTR：' + pct(data.ctr30d) + '（上期' + pct(data.ctr30dPrev) + '）\n';
  r += '- 转化率：' + pct(data.conversionRate) + '\n';
  if (data.sellableDays != null) r += '- 库存可售天数：' + data.sellableDays + '天\n';
  if (data.profitRate != null) r += '- 参考净利率：' + data.profitRate + '%\n';
  r += '\n';

  // SIF 关键词数据
  if (data.sifOverview) {
    var ov = data.sifOverview;
    r += '【前台流量/排名变化（SIF）】\n';
    r += '- 排名关键词总数：' + ov.totalPeriod.total + '个（上周期' + ov.totalPeriod.prev + '，进' + ov.totalPeriod.in + '/出' + ov.totalPeriod.out + '）\n';
    r += '- 自然排名词：' + ov.nfKeywordCnt.total + '个（上周期' + ov.nfKeywordCnt.prev + '，进' + ov.nfKeywordCnt.in + '/出' + ov.nfKeywordCnt.out + '）\n';
    r += '- 广告排名词：' + ov.adKeywordCnt.total + '个（上周期' + ov.adKeywordCnt.prev + '，进' + ov.adKeywordCnt.in + '/出' + ov.adKeywordCnt.out + '）\n';
    if (data.sifTopKeywords && data.sifTopKeywords.length > 0) {
      r += '- 核心流量词：' + data.sifTopKeywords.slice(0, 3).map(function(k) { return k.keyword; }).join('、') + '\n';
    }
    r += '\n';
  }

  r += '【归因诊断】\n';
  if (attribution.pattern) r += '下滑类型：' + attribution.pattern + '\n\n';

  r += '【核心根因】\n';
  if (attribution.rootCauses.length === 0) {
    r += '- 数据不足以自动归因，建议人工核实\n';
  } else {
    attribution.rootCauses.forEach(function(rc, i) {
      r += (i + 1) + '. ' + rc.cause + '\n';
      r += '   数据依据：' + rc.evidence + '\n';
    });
  }
  r += '\n';

  r += '【整改动作】\n';
  if (attribution.rootCauses.length > 0) {
    var pack = matchActionPack(attribution.rootCauses[0].action);
    pack.actions.forEach(function(a, i) { r += (i + 1) + '. ' + a + '\n'; });
    r += '验证指标：' + pack.metrics + '\n';
  } else {
    r += '- 待归因确认后匹配\n';
  }
  r += '\n';

  r += '【整改周期】：2周（' + fmt(today) + ' 至 ' + fmt(end) + '）\n';
  r += '【风险等级】：' + risk + '\n';
  r += '【负责人】：__________ 【监督人】：组长\n';

  return r;
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

function diagnose(data) {
  var grading = gradeProduct(data);
  var attribution = attributeRootCauses(data);
  var risk = assessRisk(data, attribution.rootCauses);
  var report = formatReport(data, grading, attribution, risk);
  return { sku: data.sku, asin: data.asin, grading: grading, attribution: attribution, risk: risk, report: report };
}

function pct(v) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }

module.exports = { diagnose, gradeProduct, attributeRootCauses, assessRisk, detectIndicators };
