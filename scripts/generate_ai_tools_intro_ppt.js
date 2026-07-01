'use strict';

const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = '黄承哲';
pres.title = 'AI 运营工具实战介绍';

// ─── 色板 ───────────────────────────────────────────────────────────────────
const C = {
  primary: '028090',
  secondary: '00A896',
  accent: '02C39A',
  dark: '1A1A2E',
  light: 'F7FDFD',
  white: 'FFFFFF',
  gray: '6B7280',
  lightGray: 'E5E7EB',
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: C.dark };
  return s;
}
function lightSlide() {
  const s = pres.addSlide();
  s.background = { color: C.white };
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 1 — 封面
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = darkSlide();
  s.addText('AI 帮你干活\n不只是帮你聊天', {
    x: 0.8, y: 1.2, w: 8.4, h: 2.2,
    fontSize: 42, fontFace: 'Arial', bold: true,
    color: C.white, lineSpacingMultiple: 1.3,
  });
  s.addText('Codex / Claude Code 运营实战工具介绍', {
    x: 0.8, y: 3.5, w: 8.4, h: 0.6,
    fontSize: 18, fontFace: 'Arial', color: C.accent,
  });
  s.addText('2026年6月', {
    x: 0.8, y: 4.8, w: 4, h: 0.4,
    fontSize: 14, fontFace: 'Arial', color: C.gray,
  });
  // 右侧装饰圆
  s.addShape(pres.ShapeType.ellipse, {
    x: 7.5, y: 0.5, w: 3.5, h: 3.5,
    fill: { color: C.primary, transparency: 70 },
    line: { type: 'none' },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 8.2, y: 2.8, w: 2.5, h: 2.5,
    fill: { color: C.secondary, transparency: 75 },
    line: { type: 'none' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 2 — 今天只看一件事
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('今天只看一件事', {
    x: 0.8, y: 0.6, w: 8, h: 0.8,
    fontSize: 36, fontFace: 'Arial', bold: true, color: C.dark,
  });
  s.addText('AI 能替你完成哪些重复判断？', {
    x: 0.8, y: 1.6, w: 8, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: C.primary,
  });

  // 流程三步
  const steps = [
    { icon: '📉', title: '老品下滑', desc: '发现哪些SKU在跌' },
    { icon: '🔍', title: '自动归因', desc: '交叉三系统数据判断根因' },
    { icon: '📋', title: '输出问题单', desc: '按SOP生成整改方案' },
  ];
  steps.forEach((st, i) => {
    const left = 0.8 + i * 3.2;
    s.addShape(pres.ShapeType.roundRect, {
      x: left, y: 2.8, w: 2.8, h: 2.2,
      fill: { color: C.light }, rectRadius: 0.1,
      line: { color: C.lightGray, width: 1 },
    });
    s.addText(st.icon, {
      x: left, y: 2.9, w: 2.8, h: 0.7,
      fontSize: 32, align: 'center', valign: 'middle',
    });
    s.addText(st.title, {
      x: left + 0.2, y: 3.6, w: 2.4, h: 0.5,
      fontSize: 16, fontFace: 'Arial', bold: true, color: C.dark, align: 'center',
    });
    s.addText(st.desc, {
      x: left + 0.2, y: 4.1, w: 2.4, h: 0.6,
      fontSize: 13, fontFace: 'Arial', color: C.gray, align: 'center',
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 3 — 传统 vs AI 对比
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('传统做法 vs AI', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.dark,
  });

  const rows = [
    ['步骤', '手动', 'AI'],
    ['打开广告后台筛30天数据', '5-10 分钟', '自动'],
    ['打开库存系统查同比', '5-10 分钟', '自动'],
    ['打开 SIF 看关键词排名变化', '10 分钟', '自动'],
    ['Excel 对比，判断根因', '10-20 分钟', '自动归因'],
    ['写整改问题单', '10 分钟', '自动输出'],
    ['合计', '30-60 分钟/SKU', '2 分钟/SKU'],
  ];

  const colW = [4.5, 2.2, 2.2];
  const startX = 0.6;
  const startY = 1.4;
  const rowH = 0.52;

  rows.forEach((row, ri) => {
    let x = startX;
    row.forEach((cell, ci) => {
      const isHeader = ri === 0;
      const isLast = ri === rows.length - 1;
      s.addText(cell, {
        x: x, y: startY + ri * rowH, w: colW[ci], h: rowH,
        fontSize: isHeader ? 14 : 13,
        fontFace: 'Arial',
        bold: isHeader || isLast,
        color: isHeader ? C.white : (ci === 2 ? C.primary : C.dark),
        fill: { color: isHeader ? C.primary : (ri % 2 === 0 ? C.light : C.white) },
        align: ci === 0 ? 'left' : 'center',
        valign: 'middle',
        margin: [0, 8, 0, 8],
      });
      x += colW[ci];
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 4 — 演示：一句话触发
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = darkSlide();
  s.addText('效果演示', {
    x: 0.8, y: 0.4, w: 4, h: 0.6,
    fontSize: 14, fontFace: 'Arial', color: C.accent,
  });
  s.addText('一句话，全自动', {
    x: 0.8, y: 0.9, w: 8, h: 0.8,
    fontSize: 36, fontFace: 'Arial', bold: true, color: C.white,
  });

  // 模拟终端
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.8, y: 2.0, w: 8.4, h: 3.0,
    fill: { color: '0D1117' }, rectRadius: 0.08,
    line: { type: 'none' },
  });
  const termLines = [
    '> 帮我分析老品下滑',
    '',
    '🔍 环境检查...',
    '  🚀 正在启动 Chrome debug 模式...',
    '  ✅ Chrome debug 已运行',
    '  🔑 已自动点击企微快捷登录',
    '  ✅ 广告后台',
    '  ✅ SIF（前台流量）',
    '  ✅ sellerinventory（同比数据）',
  ];
  s.addText(termLines.join('\n'), {
    x: 1.1, y: 2.2, w: 7.8, h: 2.6,
    fontSize: 12, fontFace: 'Courier New', color: C.accent,
    lineSpacingMultiple: 1.4, valign: 'top',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 5 — 演示：全量扫描
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = darkSlide();
  s.addText('效果演示', {
    x: 0.8, y: 0.4, w: 4, h: 0.6,
    fontSize: 14, fontFace: 'Arial', color: C.accent,
  });
  s.addText('全量扫描，自动发现问题', {
    x: 0.8, y: 0.9, w: 8, h: 0.8,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.white,
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: 0.8, y: 2.0, w: 8.4, h: 3.0,
    fill: { color: '0D1117' }, rectRadius: 0.08,
    line: { type: 'none' },
  });
  const termLines = [
    '👤 销售编号：HJ17, HJ171, HJ172',
    '📊 正在拉取广告数据...',
    '   获取到 156 个投放中的SKU',
    '',
    '🔎 正在识别环比下滑的SKU（30天订单 vs 上期）...',
    '   发现 12 个下滑SKU',
    '   1. YUT-AE3311  18→5单 (-72%)',
    '   2. YUT-GH2108  25→12单 (-52%)',
    '   3. YUT-KM0915  14→7单 (-50%)',
  ];
  s.addText(termLines.join('\n'), {
    x: 1.1, y: 2.2, w: 7.8, h: 2.6,
    fontSize: 12, fontFace: 'Courier New', color: C.accent,
    lineSpacingMultiple: 1.4, valign: 'top',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 6 — 演示：归因报告（上半）
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('输出：《老品整改问题单》', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.dark,
  });

  const report = [
    '📋 老品整改问题单',
    '',
    'SKU/ASIN：YUT-AE3311 / B0CXK6YM77',
    '产品分级：核心老品（最高优先级）',
    '整改策略：全资源倾斜，强制完成闭环整改',
    '',
    '【环比/同比变化】',
    '- 30天订单：5单（上期18单，-72%）',
    '- 同比变化：-26%（seller组整体）',
    '- 30天展现：8,432（上期21,506）',
    '- 30天ACoS：32.1%（上期18.7%）',
    '',
    '【前台流量/排名变化（SIF）】',
    '- 广告排名词：12个（上周期112，退出105个）',
    '- 自然排名词：28个（上周期45，退出22个）',
  ];
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.6, y: 1.2, w: 8.8, h: 4.2,
    fill: { color: 'F8FFFE' }, rectRadius: 0.06,
    line: { color: C.lightGray, width: 1 },
  });
  s.addText(report.join('\n'), {
    x: 0.9, y: 1.3, w: 8.2, h: 4.0,
    fontSize: 11, fontFace: 'Courier New', color: C.dark,
    lineSpacingMultiple: 1.3, valign: 'top',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 7 — 演示：归因报告（下半：根因+动作）
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('输出：根因 + 整改动作', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.dark,
  });

  const report = [
    '【核心根因】',
    '1. 广告投放大幅缩减',
    '   数据依据：广告关键词从112个降至12个（退出105个），',
    '   广告覆盖面严重萎缩',
    '',
    '2. 广告展现量环比大幅下降',
    '   数据依据：展现从21,506降至8,432（-61%），流量入口收窄',
    '',
    '【整改动作】',
    '1. 恢复被暂停/下线的广告活动，优先恢复历史出单词',
    '2. 逐步扩大广告关键词覆盖，参照历史高转化词库',
    '3. 监控恢复后7天的展现/点击/订单回升趋势',
    '',
    '验证指标：广告关键词数量恢复率、展现量回升率、7天订单恢复率',
    '',
    '【整改周期】：2周    【风险等级】：高',
  ];
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.6, y: 1.2, w: 8.8, h: 4.2,
    fill: { color: 'F8FFFE' }, rectRadius: 0.06,
    line: { color: C.lightGray, width: 1 },
  });
  s.addText(report.join('\n'), {
    x: 0.9, y: 1.3, w: 8.2, h: 4.0,
    fontSize: 11, fontFace: 'Courier New', color: C.dark,
    lineSpacingMultiple: 1.3, valign: 'top',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 8 — 架构：怎么做到的
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('它怎么做到的', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.dark,
  });
  s.addText('和你手动一样的路径，只是快 20 倍', {
    x: 0.8, y: 1.1, w: 8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', color: C.gray,
  });

  // 流程箭头图
  const flow = ['一句话', 'Chrome\nCDP', '广告系统', 'SIF', '库存系统', 'SOP\n规则引擎', '问题单'];
  const boxW = 1.15;
  const gap = 0.18;
  const totalW = flow.length * boxW + (flow.length - 1) * gap;
  const startX = (10 - totalW) / 2;
  const y = 2.6;

  flow.forEach((label, i) => {
    const x = startX + i * (boxW + gap);
    const isFirst = i === 0;
    const isLast = i === flow.length - 1;
    const isMid = i >= 2 && i <= 4;
    const fillColor = isFirst || isLast ? C.primary : (isMid ? C.secondary : C.accent);
    s.addShape(pres.ShapeType.roundRect, {
      x: x, y: y, w: boxW, h: 1.0,
      fill: { color: fillColor }, rectRadius: 0.08,
      line: { type: 'none' },
    });
    s.addText(label, {
      x: x, y: y, w: boxW, h: 1.0,
      fontSize: 10, fontFace: 'Arial', bold: true, color: C.white,
      align: 'center', valign: 'middle',
    });
    if (i < flow.length - 1) {
      s.addText('→', {
        x: x + boxW, y: y, w: gap, h: 1.0,
        fontSize: 16, color: C.gray, align: 'center', valign: 'middle',
      });
    }
  });

  // 说明
  s.addText([
    { text: '不编造数据', options: { bold: true, breakLine: true } },
    { text: '所有数据来自后台实际拉取', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '严格按 SOP', options: { bold: true, breakLine: true } },
    { text: '组长的归因矩阵 → 分级 → 动作包', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '每个结论有数据支撑', options: { bold: true, breakLine: true } },
    { text: '不会拍脑袋、不会说"可能"', options: {} },
  ], {
    x: 0.8, y: 4.0, w: 8, h: 1.5,
    fontSize: 13, fontFace: 'Arial', color: C.dark,
    lineSpacingMultiple: 1.3,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 9 — 不只是老品归因
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('不只是老品归因', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.dark,
  });
  s.addText('已上线的 AI 运营工具', {
    x: 0.8, y: 1.1, w: 8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', color: C.gray,
  });

  const tools = [
    { icon: '📊', name: '每日数据存档', desc: '自动拉各系统数据，生成日报' },
    { icon: '🚫', name: '低效词管理', desc: '自动识别+缓刑+冷却期' },
    { icon: '🚀', name: '新品建广告', desc: '一条命令完成SP/SB搭建' },
    { icon: '🔑', name: '关键词分析', desc: 'SIF数据自动整理排名变化' },
    { icon: '📝', name: 'Listing 文案', desc: '差异化标题+五点自动生成' },
    { icon: '💰', name: '价格吸收期守卫', desc: '监控价格调整后销量变化' },
  ];

  tools.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.8 + col * 4.6;
    const y = 1.8 + row * 1.15;
    s.addShape(pres.ShapeType.roundRect, {
      x: x, y: y, w: 4.2, h: 1.0,
      fill: { color: C.light }, rectRadius: 0.06,
      line: { color: C.lightGray, width: 1 },
    });
    s.addText(t.icon, {
      x: x + 0.15, y: y, w: 0.6, h: 1.0,
      fontSize: 22, align: 'center', valign: 'middle',
    });
    s.addText(t.name, {
      x: x + 0.8, y: y + 0.15, w: 3.2, h: 0.45,
      fontSize: 14, fontFace: 'Arial', bold: true, color: C.dark,
    });
    s.addText(t.desc, {
      x: x + 0.8, y: y + 0.55, w: 3.2, h: 0.35,
      fontSize: 11, fontFace: 'Arial', color: C.gray,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 10 — 你需要什么（上手指南）
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('怎么上手', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.dark,
  });

  // 需要的
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.6, y: 1.4, w: 4.2, h: 3.6,
    fill: { color: 'ECFDF5' }, rectRadius: 0.08,
    line: { type: 'none' },
  });
  s.addText('你已经有的', {
    x: 0.8, y: 1.5, w: 3.8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', bold: true, color: C.primary,
  });
  s.addText([
    { text: '✅  Chrome（公司电脑都有）', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '✅  Node.js（公司电脑都有）', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '✅  企业微信桌面端（本来就登着）', options: { breakLine: true } },
  ], {
    x: 0.8, y: 2.1, w: 3.8, h: 2.5,
    fontSize: 14, fontFace: 'Arial', color: C.dark,
    lineSpacingMultiple: 1.4,
  });

  // 不需要的
  s.addShape(pres.ShapeType.roundRect, {
    x: 5.2, y: 1.4, w: 4.2, h: 3.6,
    fill: { color: 'FEF2F2' }, rectRadius: 0.08,
    line: { type: 'none' },
  });
  s.addText('不需要的', {
    x: 5.4, y: 1.5, w: 3.8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', bold: true, color: 'DC2626',
  });
  s.addText([
    { text: '❌  学编程', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '❌  记命令', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '❌  看文档', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '❌  手动打开浏览器/登录', options: { breakLine: true } },
  ], {
    x: 5.4, y: 2.1, w: 3.8, h: 2.5,
    fontSize: 14, fontFace: 'Arial', color: C.dark,
    lineSpacingMultiple: 1.4,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 11 — 怎么用
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = lightSlide();
  s.addText('三种使用方式', {
    x: 0.8, y: 0.4, w: 8, h: 0.7,
    fontSize: 32, fontFace: 'Arial', bold: true, color: C.dark,
  });

  const ways = [
    { level: '入门', action: '对话框说一句话', example: '"帮我归因老品下滑"', color: C.accent },
    { level: '标准', action: '跑一条命令', example: 'node diagnose.js --top 5', color: C.secondary },
    { level: '进阶', action: '指定单个 SKU 深入分析', example: 'node diagnose.js --sku YUT-AE3311', color: C.primary },
  ];

  ways.forEach((w, i) => {
    const y = 1.5 + i * 1.3;
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y: y, w: 8.8, h: 1.1,
      fill: { color: C.white }, rectRadius: 0.06,
      line: { color: C.lightGray, width: 1 },
      shadow: { type: 'outer', blur: 4, opacity: 0.08, offset: 2, angle: 90, color: '000000' },
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.8, y: y + 0.25, w: 1.2, h: 0.6,
      fill: { color: w.color }, rectRadius: 0.04,
      line: { type: 'none' },
    });
    s.addText(w.level, {
      x: 0.8, y: y + 0.25, w: 1.2, h: 0.6,
      fontSize: 12, fontFace: 'Arial', bold: true, color: C.white,
      align: 'center', valign: 'middle',
    });
    s.addText(w.action, {
      x: 2.2, y: y + 0.15, w: 4, h: 0.5,
      fontSize: 15, fontFace: 'Arial', bold: true, color: C.dark,
    });
    s.addText(w.example, {
      x: 2.2, y: y + 0.6, w: 6, h: 0.4,
      fontSize: 12, fontFace: 'Courier New', color: C.gray,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 12 — 现场 Demo
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = darkSlide();
  s.addText('Live Demo', {
    x: 0.8, y: 1.8, w: 8.4, h: 1.2,
    fontSize: 52, fontFace: 'Arial', bold: true, color: C.white,
    align: 'center',
  });
  s.addText('现场跑一次，看完整效果', {
    x: 0.8, y: 3.2, w: 8.4, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: C.accent,
    align: 'center',
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 4.0, y: 3.9, w: 2.0, h: 0.8,
    fill: { color: C.primary, transparency: 50 },
    line: { type: 'none' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 13 — Q&A
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = darkSlide();
  s.addText('Q & A', {
    x: 0.8, y: 2.0, w: 8.4, h: 1.0,
    fontSize: 48, fontFace: 'Arial', bold: true, color: C.white,
    align: 'center',
  });
  s.addText('有什么想问的？', {
    x: 0.8, y: 3.2, w: 8.4, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: C.accent,
    align: 'center',
  });
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'outputs', 'ai_tools_intro_presentation.pptx');
pres.writeFile({ fileName: outPath }).then(() => {
  console.log('✅ PPT 已生成：' + outPath);
});
