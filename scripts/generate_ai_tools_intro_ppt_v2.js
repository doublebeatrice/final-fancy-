'use strict';

const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = '黄承哲';
pres.title = 'AI 工具介绍：Codex & Claude Code';

// ─── 色板：简洁白底 ─────────────────────────────────────────────────────────
const C = {
  bg: 'FFFFFF',
  text: '1F2937',      // 深灰近黑
  sub: '6B7280',       // 中灰
  accent: '2563EB',    // 蓝色点缀
  accentLight: 'EFF6FF', // 浅蓝背景
  border: 'E5E7EB',
  green: '059669',
  red: 'DC2626',
};

function newSlide() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 1 — 封面
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('AI 工具能帮运营做什么', {
    x: 0.8, y: 1.5, w: 8.4, h: 1.2,
    fontSize: 40, fontFace: 'Arial', bold: true, color: C.text,
  });
  s.addText('Codex / Claude Code 实战介绍', {
    x: 0.8, y: 2.8, w: 8.4, h: 0.6,
    fontSize: 18, fontFace: 'Arial', color: C.sub,
  });
  s.addText('2026.06', {
    x: 0.8, y: 4.6, w: 4, h: 0.4,
    fontSize: 13, fontFace: 'Arial', color: C.sub,
  });
  // 简单点缀
  s.addShape(pres.ShapeType.rect, {
    x: 0.8, y: 3.6, w: 2.0, h: 0.06,
    fill: { color: C.accent }, line: { type: 'none' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 2 — 先说清楚：这些工具是什么
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('先说清楚：这些工具是什么', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });

  const items = [
    { name: 'ChatGPT', desc: '聊天助手。你问它答，写文案、翻译、头脑风暴。' },
    { name: 'Codex', desc: '工作流助手。能读你的业务页面、操作后台、按流程执行任务。' },
    { name: 'Claude Code', desc: '同上，另一家的实现。能写脚本、调接口、跑完整链路。' },
  ];

  items.forEach((item, i) => {
    const y = 1.5 + i * 1.4;
    s.addText(item.name, {
      x: 0.8, y: y, w: 3.0, h: 0.5,
      fontSize: 18, fontFace: 'Arial', bold: true, color: C.accent,
    });
    s.addText(item.desc, {
      x: 0.8, y: y + 0.55, w: 8.4, h: 0.6,
      fontSize: 15, fontFace: 'Arial', color: C.text,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 3 — 和 ChatGPT 的核心区别
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('和 ChatGPT 的核心区别', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });

  // 两列对比
  // 左
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.6, y: 1.5, w: 4.2, h: 3.5,
    fill: { color: 'F9FAFB' }, rectRadius: 0.06,
    line: { color: C.border, width: 1 },
  });
  s.addText('ChatGPT', {
    x: 0.8, y: 1.7, w: 3.8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', bold: true, color: C.sub,
  });
  s.addText([
    { text: '你打字问，它打字答', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '不能登你的后台', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '不能帮你操作', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '离你的工作流很远', options: {} },
  ], {
    x: 0.8, y: 2.3, w: 3.8, h: 2.5,
    fontSize: 14, fontFace: 'Arial', color: C.text, lineSpacingMultiple: 1.4,
  });

  // 右
  s.addShape(pres.ShapeType.roundRect, {
    x: 5.2, y: 1.5, w: 4.2, h: 3.5,
    fill: { color: C.accentLight }, rectRadius: 0.06,
    line: { color: C.accent, width: 1 },
  });
  s.addText('Codex / Claude Code', {
    x: 5.4, y: 1.7, w: 3.8, h: 0.5,
    fontSize: 16, fontFace: 'Arial', bold: true, color: C.accent,
  });
  s.addText([
    { text: '你说一句话，它帮你做', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '能登后台、读页面、调接口', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '能替你执行重复流程', options: { breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '嵌在你的工作流里', options: {} },
  ], {
    x: 5.4, y: 2.3, w: 3.8, h: 2.5,
    fontSize: 14, fontFace: 'Arial', color: C.text, lineSpacingMultiple: 1.4,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 4 — 它能覆盖哪些场景
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('它能覆盖哪些运营场景', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });
  s.addText('每个场景都是"说一句话就能跑"的完整流程', {
    x: 0.8, y: 1.1, w: 8, h: 0.5,
    fontSize: 14, fontFace: 'Arial', color: C.sub,
  });

  const scenes = [
    '老品下滑归因 → 自动诊断+出整改问题单',
    '低效广告词管理 → 自动识别+缓刑+清理',
    '新品建广告 → 一条命令搭好SP/SB结构',
    '每日数据存档 → 自动拉取各系统数据存档',
    '关键词排名监控 → SIF数据自动整理变化',
    'Listing 文案生成 → 差异化标题+五点',
  ];

  scenes.forEach((sc, i) => {
    const y = 1.8 + i * 0.7;
    const isHighlight = i === 0;
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y: y, w: 8.8, h: 0.55,
      fill: { color: isHighlight ? C.accentLight : C.bg },
      rectRadius: 0.04,
      line: { type: 'none' },
    });
    s.addText((isHighlight ? '▸ ' : '  ') + sc, {
      x: 0.8, y: y, w: 8.4, h: 0.55,
      fontSize: 14, fontFace: 'Arial',
      bold: isHighlight,
      color: isHighlight ? C.accent : C.text,
      valign: 'middle',
    });
  });

  s.addText('今天我们挑第一个场景做深度演示 ↓', {
    x: 0.8, y: 4.8, w: 8, h: 0.5,
    fontSize: 13, fontFace: 'Arial', color: C.sub, italic: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 5 — 场景介绍：老品下滑归因
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('场景演示：老品下滑归因', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });
  s.addText('问题：一个 SKU 销量下滑了，根因是什么？该做什么？', {
    x: 0.8, y: 1.3, w: 8.4, h: 0.5,
    fontSize: 15, fontFace: 'Arial', color: C.text,
  });

  // 手动步骤
  s.addText('手动做法（30-60分钟/SKU）：', {
    x: 0.8, y: 2.0, w: 8, h: 0.4,
    fontSize: 13, fontFace: 'Arial', bold: true, color: C.sub,
  });
  const manual = [
    '打开广告后台，筛选 30 天数据',
    '打开库存系统，查同比变化',
    '打开 SIF，看关键词排名进出',
    'Excel 对比各项数据，人工判断',
    '按 SOP 格式写整改问题单',
  ];
  s.addText(manual.map((m, i) => (i + 1) + '. ' + m).join('\n'), {
    x: 0.8, y: 2.4, w: 8, h: 2.0,
    fontSize: 13, fontFace: 'Arial', color: C.text, lineSpacingMultiple: 1.6,
  });

  // AI做法
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.6, y: 4.7, w: 8.8, h: 0.7,
    fill: { color: C.accentLight }, rectRadius: 0.04,
    line: { type: 'none' },
  });
  s.addText('AI 做法：说一句话，2分钟出完整报告（含三个系统数据交叉验证）', {
    x: 0.8, y: 4.7, w: 8.4, h: 0.7,
    fontSize: 14, fontFace: 'Arial', bold: true, color: C.accent, valign: 'middle',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 6 — 演示效果：全自动环境准备（截图）
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('演示：一句话触发，全自动执行', {
    x: 0.8, y: 0.2, w: 8, h: 0.5,
    fontSize: 22, fontFace: 'Arial', bold: true, color: C.text,
  });
  s.addImage({
    path: path.join(__dirname, '..', 'outputs', 'screenshot_chat_1.png'),
    x: 0.5, y: 0.8, w: 9.0, h: 4.6,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 7 — 演示效果：输出报告（截图）
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('演示：输出的归因报告', {
    x: 0.8, y: 0.2, w: 8, h: 0.5,
    fontSize: 22, fontFace: 'Arial', bold: true, color: C.text,
  });
  s.addImage({
    path: path.join(__dirname, '..', 'outputs', 'screenshot_chat_2.png'),
    x: 0.5, y: 0.8, w: 9.0, h: 4.6,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 8 — 关键点：它靠什么判断
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('它靠什么判断', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });

  const points = [
    { title: '三个系统交叉验证', desc: '广告系统 + 库存系统（同比） + SIF（前台排名）' },
    { title: '严格按组长 SOP', desc: '归因矩阵 → 产品分级 → 动作包，不是 AI 随便说' },
    { title: '每个结论有数据', desc: '不编造、不说"可能"，数据不够就说不够' },
  ];

  points.forEach((p, i) => {
    const y = 1.5 + i * 1.2;
    s.addShape(pres.ShapeType.ellipse, {
      x: 0.8, y: y + 0.05, w: 0.4, h: 0.4,
      fill: { color: C.accent }, line: { type: 'none' },
    });
    s.addText(String(i + 1), {
      x: 0.8, y: y + 0.05, w: 0.4, h: 0.4,
      fontSize: 13, fontFace: 'Arial', bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle',
    });
    s.addText(p.title, {
      x: 1.5, y: y, w: 7.5, h: 0.45,
      fontSize: 16, fontFace: 'Arial', bold: true, color: C.text,
    });
    s.addText(p.desc, {
      x: 1.5, y: y + 0.45, w: 7.5, h: 0.45,
      fontSize: 13, fontFace: 'Arial', color: C.sub,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 9 — 怎么用
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('怎么用', {
    x: 0.8, y: 0.5, w: 8, h: 0.7,
    fontSize: 28, fontFace: 'Arial', bold: true, color: C.text,
  });

  s.addText([
    { text: '第一步：安装 skill', options: { bold: true, breakLine: true } },
    { text: '把分发包解压到 .codex/skills/ 目录下，一次搞定', options: { color: C.sub, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '第二步：在对话框说一句话', options: { bold: true, breakLine: true } },
    { text: '"帮我归因老品下滑"  "帮我看看 AE3311 为什么掉了"', options: { color: C.sub, breakLine: true } },
    { text: '', options: { breakLine: true } },
    { text: '环境全自动：', options: { bold: true } },
    { text: '浏览器自动开、登录自动完成、数据自动拉', options: { breakLine: true } },
    { text: '你只需要企业微信桌面端是登着的', options: { color: C.sub } },
  ], {
    x: 0.8, y: 1.5, w: 8.4, h: 3.5,
    fontSize: 15, fontFace: 'Arial', color: C.text,
    lineSpacingMultiple: 1.5,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 10 — 现场演示
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('现场演示', {
    x: 0.8, y: 2.0, w: 8.4, h: 1.0,
    fontSize: 40, fontFace: 'Arial', bold: true, color: C.text, align: 'center',
  });
  s.addText('当场跑一次，看完整过程', {
    x: 0.8, y: 3.2, w: 8.4, h: 0.6,
    fontSize: 16, fontFace: 'Arial', color: C.sub, align: 'center',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 11 — Q&A
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = newSlide();
  s.addText('Q & A', {
    x: 0.8, y: 2.0, w: 8.4, h: 1.0,
    fontSize: 40, fontFace: 'Arial', bold: true, color: C.text, align: 'center',
  });
  s.addText('有什么想问的？', {
    x: 0.8, y: 3.2, w: 8.4, h: 0.6,
    fontSize: 16, fontFace: 'Arial', color: C.sub, align: 'center',
  });
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'outputs', 'ai_tools_intro_final.pptx');
pres.writeFile({ fileName: outPath }).then(() => {
  console.log('✅ PPT 已生成：' + outPath);
});
