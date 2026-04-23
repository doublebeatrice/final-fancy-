const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const snapshotFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'data', 'snapshots', 'aggressive_coverage_snapshot_2026-04-23.json');
const schemaFile = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(ROOT, 'data', 'snapshots', 'aggressive_coverage_action_schema_2026-04-23.json');
const verifyFile = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.join(ROOT, 'data', 'snapshots', 'execution_verify_2026-04-23.json');
const summaryFile = process.argv[5]
  ? path.resolve(process.argv[5])
  : path.join(ROOT, 'data', 'snapshots', 'execution_summary_2026-04-23.json');
const coverageFile = process.argv[6]
  ? path.resolve(process.argv[6])
  : path.join(ROOT, 'data', 'snapshots', 'execution_coverage_2026-04-23.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  if (!Number.isFinite(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function money(value) {
  return `$${num(value).toFixed(2)}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function actionName(action) {
  if (action.actionType === 'bid') {
    if (num(action.suggestedBid) > num(action.currentBid)) return '竞价上调';
    if (num(action.suggestedBid) < num(action.currentBid)) return '竞价下调';
    return '竞价检查';
  }
  if (action.actionType === 'enable') return '开启广告';
  if (action.actionType === 'pause') return '关闭广告';
  if (action.actionType === 'create') return '建广告评估';
  if (action.actionType === 'structure_fix') return '结构修复评估';
  return '复核';
}

function entityName(entityType) {
  return {
    keyword: 'SP关键词',
    autoTarget: 'SP自动投放',
    manualTarget: 'SP手动商品定位',
    sbKeyword: 'SB关键词',
    sbTarget: 'SB商品定位',
  }[entityType] || entityType || '-';
}

function isBrokenText(value) {
  const text = String(value || '');
  if (!text) return true;
  const qMarks = (text.match(/\?/g) || []).length;
  return qMarks >= 6 || qMarks / Math.max(1, text.length) > 0.25;
}

function readableReason(row) {
  if (!isBrokenText(row.reason)) return row.reason;
  const evidence = Array.isArray(row.evidence) ? row.evidence.filter(item => !isBrokenText(item)) : [];
  const base = evidence.length ? `依据：${evidence.join('；')}` : `库存 ${row.invDays || '-'} 天，30天销量 ${row.sold30 || '-'}，利润 ${pct(row.profit)}`;
  if (row.actionType === 'enable') {
    return `覆盖率优先：该对象可用于恢复更多有效触达，且当前 SKU 有库存承接。${base}`;
  }
  if (row.actionType === 'pause') {
    return `控制浪费：该对象近期有消耗但转化不足，先关闭避免继续占预算。${base}`;
  }
  if (row.actionType === 'bid') {
    if (num(row.suggestedBid) > num(row.currentBid)) return `覆盖扩面：小幅加价提高展示和点击机会。${base}`;
    if (num(row.suggestedBid) < num(row.currentBid)) return `效率收缩：小幅降价控制低效消耗。${base}`;
  }
  return base;
}

function skuMapFromSnapshot(snapshot) {
  const map = new Map();
  for (const card of snapshot.productCards || []) map.set(String(card.sku || ''), card);
  return map;
}

function recentSpend(card) {
  let sp = 0;
  let sb = 0;
  for (const campaign of card.campaigns || []) {
    for (const row of campaign.keywords || []) sp += num(row.stats30d?.spend);
    for (const row of campaign.autoTargets || []) sp += num(row.stats30d?.spend);
    for (const row of campaign.sponsoredBrands || []) sb += num(row.stats30d?.spend);
  }
  return { sp, sb };
}

function q2Text(card) {
  const parts = [card.sku, card.note, card.solrTerm];
  for (const campaign of card.campaigns || []) {
    parts.push(campaign.name);
    for (const row of campaign.keywords || []) parts.push(row.text);
    for (const row of campaign.sponsoredBrands || []) parts.push(row.text);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function q2Theme(text) {
  const rules = [
    ['教师节/谢师周', /teacher|appreciation|thank you/],
    ['护士周', /nurse|medical|lab week/],
    ['基督/励志礼物', /christian|inspir|faith|bible/],
    ['毕业季', /graduat|class of|senior/],
    ['夏季/泳池/海滩', /summer|beach|pool|swim|luau|tropical|duck/],
    ['婚礼/Bridal', /wedding|bridal|bridesmaid/],
    ['墨西哥节/派对', /mexican|fiesta|pinata|taco|cactus/],
    ['Baby Shower', /baby shower|gender reveal/],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function buildCreateRecommendations(snapshot) {
  const candidates = [];
  for (const card of snapshot.productCards || []) {
    const sold30 = num(card.unitsSold_30d);
    const invDays = num(card.invDays);
    const profit = num(card.profitRate);
    const spend = recentSpend(card);
    const text = q2Text(card);
    const themes = q2Theme(text);
    if (sold30 < 20 || invDays < 30 || profit < 0.12) continue;
    if (!themes.length) continue;

    const hasSb = spend.sb > 3;
    const reason = hasSb
      ? '已有SB基础，可评估补长尾或补结构'
      : '销量和库存可承接，但SB覆盖偏弱，建议评估新建SB/SBV';
    const score = sold30 * 2 + invDays * 0.08 + profit * 100 - spend.sb * 0.8;
    candidates.push({
      sku: card.sku,
      sold30,
      invDays,
      profit,
      spSpend: spend.sp,
      sbSpend: spend.sb,
      themes,
      reason,
      score,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 12);
}

function buildInventoryRecommendations(snapshot) {
  const rows = [];
  for (const card of snapshot.productCards || []) {
    const sold30 = num(card.unitsSold_30d);
    const invDays = num(card.invDays);
    const profit = num(card.profitRate);
    if (sold30 >= 50 && invDays >= 30 && invDays <= 90) {
      rows.push({
        sku: card.sku,
        kind: '备货复核',
        reason: '近30天销量较高且库存可卖天数处于需要提前沟通区间',
        sold30,
        invDays,
        profit,
      });
    } else if (sold30 >= 20 && invDays >= 180 && profit >= 0.2) {
      rows.push({
        sku: card.sku,
        kind: '利润收割/提价复核',
        reason: '库存偏高且利润可承接，适合评估价格和广告效率',
        sold30,
        invDays,
        profit,
      });
    }
  }
  return rows.sort((a, b) => b.sold30 - a.sold30).slice(0, 10);
}

const snapshot = readJson(snapshotFile, {});
const schema = readJson(schemaFile, []);
const verify = readJson(verifyFile, {});
const summary = readJson(summaryFile, {});
const coverage = readJson(coverageFile, { summary: {}, coverage: [] });
const cardsBySku = skuMapFromSnapshot(snapshot);
const actions = schema.flatMap(item => (item.actions || []).map(action => ({ ...action, sku: item.sku, summary: item.summary })));
const events = verify.verifiedEvents || [];
const createRecommendations = buildCreateRecommendations(snapshot);
const inventoryRecommendations = buildInventoryRecommendations(snapshot);
const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });

const statusRank = { not_landed: 0, failed: 1, manual_review: 2, success: 3 };
const actionRows = actions.map(action => {
  const event = events.find(item => String(item.id) === String(action.id) && String(item.entityType) === String(action.entityType));
  const card = cardsBySku.get(action.sku) || {};
  return {
    ...action,
    status: event?.finalStatus || 'not_run',
    apiStatus: event?.apiStatus || '-',
    actualBid: event?.actualBid,
    actualState: event?.actualState,
    errorReason: event?.errorReason || '',
    invDays: card.invDays,
    sold30: card.unitsSold_30d,
    profit: card.profitRate,
  };
}).sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));

const totalSkus = new Set([
  ...(snapshot.productCards || []).map(item => item.sku),
  ...Object.keys(snapshot.invMap || {}),
  ...(snapshot.kwRows || []).map(item => item.sku).filter(Boolean),
  ...(snapshot.autoRows || []).map(item => item.sku).filter(Boolean),
  ...(snapshot.targetRows || []).map(item => item.sku).filter(Boolean),
  ...(snapshot.sbRows || []).map(item => item.sku).filter(Boolean),
]).size;

const successCount = num(verify.finalCounts?.success);
const notLandedCount = num(verify.finalCounts?.not_landed);
const apiSuccess = Object.values(verify.apiStats || {}).reduce((acc, item) => acc + num(item.apiSuccess), 0);
const apiFailed = Object.values(verify.apiStats || {}).reduce((acc, item) => acc + num(item.apiFailed), 0);
const noteSuccess = num(summary.noteSuccess);
const noteFailure = num(summary.noteFailure);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>广告全量闭环测试报告 ${esc(timestamp)}</title>
  <style>
    :root { --bg:#f6f7f9; --ink:#18202a; --muted:#667085; --line:#d9dee7; --green:#16794c; --red:#b42318; --amber:#b54708; --blue:#175cd3; --panel:#fff; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.55 "Segoe UI", Arial, sans-serif; }
    .wrap { max-width:1180px; margin:0 auto; padding:28px 22px 48px; }
    header { border-bottom:1px solid var(--line); padding-bottom:18px; margin-bottom:22px; }
    h1 { margin:0 0 6px; font-size:28px; letter-spacing:0; }
    h2 { margin:28px 0 12px; font-size:20px; }
    h3 { margin:0 0 8px; font-size:16px; }
    .sub { color:var(--muted); }
    .grid { display:grid; gap:12px; }
    .kpis { grid-template-columns:repeat(4, minmax(0,1fr)); }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .kpi b { display:block; font-size:28px; margin-bottom:2px; }
    .kpi span { color:var(--muted); }
    .ok { color:var(--green); }
    .bad { color:var(--red); }
    .warn { color:var(--amber); }
    .blue { color:var(--blue); }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 8px; background:#fff; margin:2px 4px 2px 0; color:#344054; }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    th, td { padding:10px 9px; border-bottom:1px solid var(--line); vertical-align:top; text-align:left; }
    th { background:#eef2f6; color:#344054; font-weight:600; }
    tr:last-child td { border-bottom:0; }
    .small { font-size:12px; color:var(--muted); }
    .section-note { border-left:4px solid var(--blue); background:#eef4ff; padding:12px 14px; border-radius:6px; margin:10px 0 14px; }
    .two { grid-template-columns:1.2fr .8fr; }
    .bar { height:9px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin-top:8px; }
    .bar > i { display:block; height:100%; background:var(--blue); }
    @media (max-width:900px) { .kpis, .two { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>广告全量闭环测试报告</h1>
      <div class="sub">生成时间：${esc(timestamp)}　|　快照：${esc(path.basename(snapshotFile))}</div>
    </header>

    <section class="grid kpis">
      <div class="card kpi"><b>${totalSkus}</b><span>覆盖 SKU</span></div>
      <div class="card kpi"><b>${num(snapshot.productCards?.length)}</b><span>产品画像</span></div>
      <div class="card kpi"><b>${apiSuccess}</b><span>接口成功动作</span></div>
      <div class="card kpi"><b class="${notLandedCount ? 'warn' : 'ok'}">${notLandedCount}</b><span>接口成功但回查未确认</span></div>
    </section>

    <section class="grid two" style="margin-top:12px">
      <div class="card">
        <h3>这次闭环做了什么</h3>
        <p>本轮先抓取全量广告和库存快照，再由 Codex 评估所有 SKU。执行策略已切到“覆盖率优先”：只要有库存、有利润、符合 Q2 或具备触达价值，就允许更积极地开词、开 SB、轻微加投；负利润和明显浪费的对象则收缩或暂停。建广告仍只做评估，不自动创建。</p>
        <p>执行后已做接口结果统计、回查、便签写入和覆盖报告落地。</p>
      </div>
      <div class="card">
        <h3>数据完整性</h3>
        <p>SP关键词 ${num(snapshot.kwRows?.length)}，SP自动 ${num(snapshot.autoRows?.length)}，SP手动定位 ${num(snapshot.targetRows?.length)}，SB行 ${num(snapshot.sbRows?.length)}，库存 ${Object.keys(snapshot.invMap || {}).length}。</p>
        <div class="bar"><i style="width:${Math.min(100, Math.round(num(snapshot.productCards?.length) / Math.max(1,totalSkus) * 100))}%"></i></div>
        <div class="small">产品画像覆盖 ${num(snapshot.productCards?.length)} / ${totalSkus}</div>
      </div>
    </section>

    <h2>执行结果</h2>
    <div class="section-note">
      接口层：成功 ${apiSuccess}，失败 ${apiFailed}。回查层：确认落地 ${successCount}，未确认 ${notLandedCount}。便签：成功 ${noteSuccess}，失败 ${noteFailure}。<br>
      本轮计划 SKU ${num(summary.plannedSkus)}，计划动作 ${num(summary.plannedActions)}，另外有 ${num(summary.coverageSummary?.manual_review || 0)} 个 SKU 因高销量强动作或风险门控进入人工复核。
    </div>
    <table>
      <thead>
        <tr>
          <th>SKU</th><th>动作</th><th>对象</th><th>执行值</th><th>结果</th><th>原因</th>
        </tr>
      </thead>
      <tbody>
        ${actionRows.map(row => `<tr>
          <td><b>${esc(row.sku)}</b><div class="small">30天销量 ${esc(row.sold30)}｜库存 ${esc(row.invDays)}天｜利润 ${pct(row.profit)}</div></td>
          <td>${esc(actionName(row))}<div class="small">${esc(row.actionType)}</div></td>
          <td>${esc(entityName(row.entityType))}<div class="small">${esc(row.id)}</div></td>
          <td>${row.actionType === 'bid' ? `${esc(row.currentBid)} -> ${esc(row.suggestedBid)}${row.actualBid != null ? `<div class="small">回查 ${esc(row.actualBid)}</div>` : ''}` : `${esc(row.actionType)}${row.actualState ? `<div class="small">回查 ${esc(row.actualState)}</div>` : ''}`}</td>
          <td><b class="${row.status === 'success' ? 'ok' : row.status === 'not_landed' ? 'warn' : 'bad'}">${esc(row.status)}</b><div class="small">${esc(row.apiStatus)}</div></td>
          <td>${esc(readableReason(row) || row.summary)}${row.errorReason ? `<div class="small warn">${esc(row.errorReason)}</div>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <h2>需要你看的建广告评估</h2>
    <div class="section-note">这里只做建议，不自动建广告。优先看 Q2 礼物、教师节、护士周、基督励志、毕业季、夏季方向，并结合库存和利润。</div>
    <table>
      <thead><tr><th>SKU</th><th>建议方向</th><th>为什么值得看</th><th>数据</th></tr></thead>
      <tbody>
        ${createRecommendations.map(row => `<tr>
          <td><b>${esc(row.sku)}</b></td>
          <td>${row.themes.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</td>
          <td>${esc(row.reason)}</td>
          <td>30天销量 ${esc(row.sold30)}｜库存 ${esc(row.invDays)}天｜利润 ${pct(row.profit)}｜SB花费 ${money(row.sbSpend)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <h2>库存 / 利润 / 备货复核</h2>
    <table>
      <thead><tr><th>SKU</th><th>建议</th><th>原因</th><th>关键数据</th></tr></thead>
      <tbody>
        ${inventoryRecommendations.map(row => `<tr>
          <td><b>${esc(row.sku)}</b></td>
          <td>${esc(row.kind)}</td>
          <td>${esc(row.reason)}</td>
          <td>30天销量 ${esc(row.sold30)}｜库存 ${esc(row.invDays)}天｜利润 ${pct(row.profit)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <h2>本轮建议下一步</h2>
    <div class="grid two">
      <div class="card">
        <h3>先确认</h3>
        <p>这轮有 ${notLandedCount} 个动作属于“接口成功但回查未确认”。大概率不是接口失败，而是开启后行不在当前刷新结果里，或页面抓数口径没覆盖到新状态。建议按 keywordId / targetId 在后台点查确认，不要直接当成失败重做。</p>
      </div>
      <div class="card">
        <h3>再推进</h3>
        <p>优先复核上方建广告建议，特别是有销量、有库存、SB覆盖弱的 Q2 礼物/教师/护士/基督/夏季方向。之后可以继续做第三波：把人工复核中的高销量强动作拆成更小颗粒，再自动执行。</p>
      </div>
    </div>

    <h2>沉淀文件</h2>
    <div class="card small">
      <div>快照：${esc(path.relative(ROOT, snapshotFile))}</div>
      <div>动作 schema：${esc(path.relative(ROOT, schemaFile))}</div>
      <div>执行回查：${esc(path.relative(ROOT, verifyFile))}</div>
      <div>执行 summary：${esc(path.relative(ROOT, summaryFile))}</div>
      <div>覆盖明细：${esc(path.relative(ROOT, coverageFile))}</div>
    </div>
  </div>
</body>
</html>`;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportDir = path.join(ROOT, 'archive', 'reports', stamp.slice(0, 10));
fs.mkdirSync(reportDir, { recursive: true });
const outFile = path.join(reportDir, `closed_loop_report_${stamp}.html`);
const latestFile = path.join(reportDir, 'closed_loop_report_latest.html');
fs.writeFileSync(outFile, `\uFEFF${html}`, 'utf8');
fs.writeFileSync(latestFile, `\uFEFF${html}`, 'utf8');
console.log(outFile);
console.log(latestFile);
