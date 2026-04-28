const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RUN_ID = process.argv[2] || 'today_ops_2026-04-28T07-31-42-696Z';
const RUN_DIR = path.join(ROOT, 'data', 'snapshots', 'runs', RUN_ID);
const SNAPSHOT_FILE = path.join(RUN_DIR, 'snapshot_2026-04-28.json');
const MANIFEST_FILE = path.join(RUN_DIR, 'manifest.json');
const SUMMARY_FILE = path.join(RUN_DIR, 'summary.json');
const SCHEMA_FILE = path.join(ROOT, 'data', 'snapshots', 'q2_full_test_action_schema.json');
const OUT_DIR = path.join(ROOT, 'data', 'reports');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, digits = 1) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function money(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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

function adStats(card, key) {
  return card?.adStats?.[key] || { spend: 0, orders: 0, clicks: 0, impressions: 0 };
}

function sbStats(card, key) {
  return card?.sbStats?.[key] || { spend: 0, orders: 0, clicks: 0, impressions: 0 };
}

function combinedStats(card, key) {
  const sp = adStats(card, key);
  const sb = sbStats(card, key);
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function impliedSales(card, key) {
  return combinedStats(card, key).orders * Math.max(num(card.price), 0);
}

function acos(card, key) {
  const spend = combinedStats(card, key).spend;
  const sales = impliedSales(card, key);
  if (sales > 0) return spend / sales;
  return spend > 0 ? 99 : 0;
}

function rowByTitle(rows, title) {
  return rows.find(row => String(row?.seller_title || '').trim() === title) || null;
}

function stageTime(manifest, name) {
  const step = (manifest.steps || []).find(item => item.name === name);
  return num(step?.durationMs);
}

function stepDetails(manifest, name) {
  const step = (manifest.steps || []).find(item => item.name === name);
  return step?.details || {};
}

function buildCardMap(cards) {
  return new Map((cards || []).map(card => [String(card.sku || '').trim().toUpperCase(), card]));
}

function classifyAction(action, card) {
  const reason = String(action.reason || '');
  const targetAcos7 = acos(card, '7d');
  const invDays = num(card?.invDays);
  const profitRate = num(card?.profitRate);

  if (action.actionType === 'review') return '观察';
  if (num(action.suggestedBid) < num(action.currentBid)) return '止血';
  if (invDays < 30) return '控风险';
  if (targetAcos7 <= 0.12 && profitRate >= 0.12) return '放量';
  if (reason.includes('inventory') || reason.includes('库存')) return '控风险';
  return '放量';
}

function riskText(action, card) {
  const invDays = num(card?.invDays);
  const profitRate = num(card?.profitRate);
  const acos7Value = acos(card, '7d');
  const parts = [];
  if (invDays && invDays < 30) parts.push(`库存仅 ${invDays} 天`);
  if (profitRate < 0) parts.push(`商品利润率 ${pct(profitRate)}`);
  if (acos7Value >= 0.3 && acos7Value < 90) parts.push(`近 7 天 ACOS ${pct(acos7Value)}`);
  if (!parts.length) parts.push('低风险小步调价，仍需观察 24-48 小时回查');
  return parts.join('；');
}

function expectedEffect(action, card) {
  if (num(action.suggestedBid) < num(action.currentBid)) return '压低无效 CPC，尽量保留展示覆盖';
  if (num(card?.invDays) < 30) return '小幅探量，但不建议放大预算';
  return '低幅提价争取更多有效流量，目标是放量不放飞';
}

function recommendation(action, card) {
  const sku = String(card?.sku || '');
  if (sku === 'CL3650') return '建议今天执行，但只做小范围验证，执行后盯库存与净利';
  if (sku === 'LNE1321') return '建议今天执行，属于控风险型降 bid';
  return '建议今天执行';
}

function seasonalHint(item) {
  const text = `${item.summary || ''} ${item.actions?.[0]?.reason || ''}`.toLowerCase();
  if (text.includes('cinco') || text.includes('mexican')) return '节日窗口接近尾声，适合小步验证，不适合放大承诺';
  if (text.includes('graduation') || text.includes('cruise')) return '毕业季/邮轮季仍可承接，适合低风险试投';
  if (text.includes('nurse') || text.includes('appreciation')) return '护士周/感谢礼方向仍可接流量，但要看节期尾部转化';
  if (text.includes('mother') || text.includes('father') || text.includes('gift')) return '父亲节前礼品词仍有价值，优先控 CPC、留覆盖';
  return 'Q2 季节词仍在，但只建议微调，不建议放大预算';
}

function topWinners(cards) {
  return [...cards]
    .map(card => ({
      sku: card.sku,
      site: card.salesChannel,
      sales7: num(card.unitsSold_7d) * num(card.price),
      invDays: num(card.invDays),
      profitRate: num(card.profitRate),
      acos7: acos(card, '7d'),
      yoy: num(card.yoyAsinPct ?? card.yoyUnitsPct),
    }))
    .filter(row => row.sku && row.sales7 > 500 && row.profitRate > 0.15)
    .sort((a, b) => b.sales7 - a.sales7)
    .slice(0, 6);
}

function topDrags(cards) {
  return [...cards]
    .map(card => ({
      sku: card.sku,
      site: card.salesChannel,
      sales7: num(card.unitsSold_7d) * num(card.price),
      invDays: num(card.invDays),
      profitRate: num(card.profitRate),
      netProfit: num(card.netProfit),
      spend7: combinedStats(card, '7d').spend,
      acos7: acos(card, '7d'),
      yoy: num(card.yoyAsinPct ?? card.yoyUnitsPct),
    }))
    .filter(row => row.sku && (row.spend7 > 20 || row.sales7 > 300))
    .sort((a, b) => {
      const sa = (a.acos7 >= 0.3 ? 2 : 0) + (a.profitRate < 0 ? 2 : 0) + (a.yoy < -0.2 ? 1 : 0) + a.spend7 / 100;
      const sb = (b.acos7 >= 0.3 ? 2 : 0) + (b.profitRate < 0 ? 2 : 0) + (b.yoy < -0.2 ? 1 : 0) + b.spend7 / 100;
      return sb - sa;
    })
    .slice(0, 8);
}

function lowInventoryRisks(cards) {
  return [...cards]
    .map(card => ({
      sku: card.sku,
      site: card.salesChannel,
      invDays: num(card.invDays),
      sales7: num(card.unitsSold_7d) * num(card.price),
      profitRate: num(card.profitRate),
      acos7: acos(card, '7d'),
    }))
    .filter(row => row.sku && row.invDays > 0 && row.invDays <= 23 && row.sales7 > 0)
    .sort((a, b) => a.invDays - b.invDays || b.sales7 - a.sales7)
    .slice(0, 8);
}

function renderStatus(text, cls) {
  return `<span class="tag ${cls}">${esc(text)}</span>`;
}

function actionRows(actions, cardMap) {
  return actions.map(item => {
    const action = item.actions[0] || {};
    const card = cardMap.get(String(item.sku || '').toUpperCase()) || {};
    const category = classifyAction(action, card);
    return {
      sku: item.sku,
      site: card.salesChannel || '-',
      entityType: action.entityType || '-',
      action: num(action.suggestedBid) < num(action.currentBid)
        ? `bid ${action.currentBid} → ${action.suggestedBid}`
        : `bid ${action.currentBid} → ${action.suggestedBid}`,
      category,
      reason: action.reason || item.summary || '',
      expected: expectedEffect(action, card),
      risk: riskText(action, card),
      recommendation: recommendation(action, card),
      invDays: num(card.invDays),
      profitRate: num(card.profitRate),
      acos7: acos(card, '7d'),
      seasonal: seasonalHint(item),
    };
  });
}

function tableRows(rows, renderer) {
  return rows.map(renderer).join('\n');
}

function makeHtml(data) {
  const {
    runId,
    reportDate,
    manifest,
    summary,
    actionPlans,
    reviewPlans,
    validationErrors,
    cardMap,
    sources,
    totalRow,
    hjGroup,
    hj1,
    winners,
    drags,
    lowInv,
  } = data;

  const executableRows = actionRows(actionPlans, cardMap);
  const reviewRows = actionRows(reviewPlans, cardMap);

  const overviewJudgement = num(totalRow?.qty_yoy_over_1_year) <= -0.2
    ? '经营总盘有利润，但同比承压，今天更适合做小范围精调，不适合大范围放量。'
    : '经营总盘稳定，可做小范围精调。';

  const todayCanAdjust = summary.executableSkus > 0 && (!validationErrors.length || summary.executableSkus > validationErrors.length);
  const boundaryRisk = summary.outOfScopeSkus === 0 ? '今日动作未发现越界 SKU。' : `发现 ${summary.outOfScopeSkus} 个越界 SKU，不能执行。`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>今日广告调整建议 - ${esc(reportDate)}</title>
  <style>
    :root{
      --bg:#f5f7fb;--card:#fff;--text:#1f2937;--muted:#6b7280;--line:#e5e7eb;
      --ok:#16a34a;--warn:#d97706;--risk:#dc2626;--todo:#2563eb;--review:#7c3aed;
    }
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
    .wrap{max-width:1480px;margin:0 auto;padding:24px}
    h1,h2,h3{margin:0 0 12px} h1{font-size:28px} h2{font-size:20px;margin-top:28px} h3{font-size:16px}
    .muted{color:var(--muted)} .grid{display:grid;gap:16px} .g4{grid-template-columns:repeat(4,minmax(0,1fr))} .g3{grid-template-columns:repeat(3,minmax(0,1fr))} .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 6px 18px rgba(15,23,42,.05)}
    .hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
    .hero .summary{max-width:820px}
    .big{font-size:28px;font-weight:700;margin-bottom:6px}
    .metric{font-size:26px;font-weight:700}.label{font-size:12px;color:var(--muted);margin-top:4px}
    .tag{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;margin:0 6px 6px 0}
    .ok{background:#dcfce7;color:#166534}.warn{background:#fef3c7;color:#92400e}.risk{background:#fee2e2;color:#991b1b}.todo{background:#dbeafe;color:#1d4ed8}.review{background:#ede9fe;color:#6d28d9}
    .flow{display:flex;gap:10px;flex-wrap:wrap}.node{background:#f8fafc;border:1px solid var(--line);border-radius:14px;padding:12px 14px;min-width:150px}.arrow{align-self:center;color:#94a3b8;font-weight:700}
    table{width:100%;border-collapse:collapse} th,td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left} th{font-size:12px;color:var(--muted);font-weight:700;background:#f8fafc}
    .callout{border-left:4px solid var(--todo);padding:10px 12px;background:#eff6ff;border-radius:10px}
    .riskbox{border-left-color:var(--risk);background:#fef2f2}.warnbox{border-left-color:var(--warn);background:#fffbeb}.okbox{border-left-color:var(--ok);background:#f0fdf4}
    ul{margin:8px 0 0 18px;padding:0} li{margin:4px 0}
    code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card hero">
      <div class="summary">
        <h1>今日广告调整建议</h1>
        <div class="muted">报告日期：${esc(reportDate)} ｜ runId：${esc(runId)} ｜ 基于最新 fast dry-run / snapshot / manifest / summary，只做判断，不执行</div>
        <p class="big">${esc(overviewJudgement)}</p>
        <div>
          ${todayCanAdjust ? renderStatus('今日可进入小范围调整', 'ok') : renderStatus('今日不建议进入调整', 'risk')}
          ${summary.outOfScopeSkus === 0 ? renderStatus('无越界 SKU', 'ok') : renderStatus('存在越界风险', 'risk')}
          ${validationErrors.length ? renderStatus(`有校验异常 ${validationErrors.length} 个`, 'warn') : renderStatus('无校验异常', 'ok')}
          ${renderStatus(`可执行 ${summary.executableSkus}`, 'todo')}
          ${renderStatus(`人工复核 ${summary.reviewSkus}`, 'review')}
        </div>
      </div>
      <div class="card" style="min-width:320px">
        <h3>一句话结论</h3>
        <div class="callout ${todayCanAdjust ? 'okbox' : 'riskbox'}">
          今天建议只考虑 <b>${summary.executableSkus} 个 in-scope 可执行动作</b> 做小范围验证；<b>${summary.reviewSkus} 个复核动作</b> 先人工判断；<b>${validationErrors.length} 个异常</b> 今天不动。
        </div>
      </div>
    </div>

    <div class="grid g4" style="margin-top:16px">
      <div class="card"><div class="metric">${money(totalRow?.order_sales)}</div><div class="label">所选编号汇总销售额</div></div>
      <div class="card"><div class="metric">${money(totalRow?.sale_num,0)}</div><div class="label">总订单量</div></div>
      <div class="card"><div class="metric">${pct(totalRow?.net_profit)}</div><div class="label">净利率</div></div>
      <div class="card"><div class="metric">${pct(totalRow?.ACOS)}</div><div class="label">ACOS</div></div>
      <div class="card"><div class="metric">${money(totalRow?.adv_spend)}</div><div class="label">广告花费</div></div>
      <div class="card"><div class="metric">${pct(totalRow?.advCost)}</div><div class="label">广告占比</div></div>
      <div class="card"><div class="metric">${pct(totalRow?.ROAS ? 1 / totalRow.ROAS : 0,2)}</div><div class="label">广告花费 / 销售额(按 ROAS 反推)</div></div>
      <div class="card"><div class="metric">${pct(totalRow?.refund_percent)}</div><div class="label">退货率</div></div>
    </div>

    <h2>经营总览</h2>
    <div class="grid g3">
      <div class="card">
        <h3>自动运营范围</h3>
        <ul>
          <li>原始 scope 行数：<b>${num(manifest.scopeSummary?.rawAllowedScopeRows ?? manifest.totalInventoryScopeRows ?? 584)}</b></li>
          <li>唯一 SKU 数：<b>${summary.allowedScopeSkuCount}</b></li>
          <li>schema SKU 数：<b>${summary.schemaSkuCount}</b></li>
          <li>planned / review / out_of_scope / executable：<b>${summary.plannedSkus}</b> / <b>${summary.reviewSkus}</b> / <b>${summary.outOfScopeSkus}</b> / <b>${summary.executableSkus}</b></li>
        </ul>
      </div>
      <div class="card">
        <h3>今日盘面判断</h3>
        <ul>
          <li>净利率 <b>${pct(totalRow?.net_profit)}</b>，说明盘面仍有利润空间，不是全面失控。</li>
          <li>ACOS <b>${pct(totalRow?.ACOS)}</b>、广告占比 <b>${pct(totalRow?.advCost)}</b>，广告效率总体可控。</li>
          <li>同比销量 <b>${pct(totalRow?.qty_yoy_over_1_year)}</b>，说明增长压力明显，今天优先做“稳利润的小步调优”。</li>
          <li>${esc(boundaryRisk)}</li>
        </ul>
      </div>
      <div class="card">
        <h3>组别对比</h3>
        <ul>
          <li>HJ大组：ACOS <b>${pct(hjGroup?.ACOS)}</b>，净利率 <b>${pct(hjGroup?.net_profit)}</b></li>
          <li>HJ1小组：ACOS <b>${pct(hj1?.ACOS)}</b>，净利率 <b>${pct(hj1?.net_profit)}</b></li>
          <li>HJ1 相比大组：ACOS 略高、净利略低，今天更需要控浪费而不是盲目加投。</li>
        </ul>
      </div>
    </div>

    <h2>经营变化判断</h2>
    <div class="grid g2">
      <div class="card">
        <h3>拉升盘面的 SKU</h3>
        <table>
          <thead><tr><th>SKU</th><th>站点</th><th>近7天销售额</th><th>利润率</th><th>ACOS</th><th>库存天数</th><th>判断</th></tr></thead>
          <tbody>${tableRows(winners, row => `<tr><td>${esc(row.sku)}</td><td>${esc(row.site)}</td><td>${money(row.sales7)}</td><td>${pct(row.profitRate)}</td><td>${pct(row.acos7)}</td><td>${row.invDays}</td><td>${row.invDays < 25 ? '卖得动但要防断货' : '有利润且可承接'}</td></tr>`)}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>拖累盘面的 SKU</h3>
        <table>
          <thead><tr><th>SKU</th><th>站点</th><th>近7天广告花费</th><th>ACOS</th><th>利润率</th><th>同比</th><th>判断</th></tr></thead>
          <tbody>${tableRows(drags, row => `<tr><td>${esc(row.sku)}</td><td>${esc(row.site)}</td><td>${money(row.spend7)}</td><td>${row.acos7 >= 90 ? '无单花费' : pct(row.acos7)}</td><td>${pct(row.profitRate)}</td><td>${pct(row.yoy)}</td><td>${row.acos7 >= 0.3 || row.acos7 >= 90 ? '广告浪费偏高' : '利润承压'}</td></tr>`)}</tbody>
        </table>
      </div>
    </div>

    <h2>库存与节日风险</h2>
    <div class="grid g2">
      <div class="card">
        <h3>库存承接不足 SKU</h3>
        <table>
          <thead><tr><th>SKU</th><th>站点</th><th>库存天数</th><th>近7天销售额</th><th>利润率</th><th>处理建议</th></tr></thead>
          <tbody>${tableRows(lowInv, row => `<tr><td>${esc(row.sku)}</td><td>${esc(row.site)}</td><td>${row.invDays}</td><td>${money(row.sales7)}</td><td>${pct(row.profitRate)}</td><td>${row.invDays <= 7 ? '优先保库存，不建议放量' : '可维持曝光，但不宜激进提价'}</td></tr>`)}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>节日机会与尾货判断</h3>
        <ul>
          <li>Cinco de Mayo / 墨西哥主题：仍有窗口，但已经接近尾部，更适合“小步试投 + 严控库存”，不适合加预算。</li>
          <li>毕业季 / 夏季邮轮：仍有承接期，适合对低 ACOS 且库存健康的词做微调放量。</li>
          <li>护士周 / appreciation gifts：可以继续承接礼品词流量，但建议保守抬价，不做结构扩张自动化。</li>
          <li>母亲节尾声 / 父亲节前置：礼品类更适合控 CPC、守覆盖，不适合粗放扩量。</li>
        </ul>
      </div>
    </div>

    <h2>广告动作池</h2>
    <div class="flow">
      <div class="node"><b>经营背景</b><br/>利润仍在、同比承压</div>
      <div class="arrow">→</div>
      <div class="node"><b>动作原则</b><br/>小步放量 + 控浪费</div>
      <div class="arrow">→</div>
      <div class="node"><b>今日候选</b><br/>7 可执行 / 2 复核 / 1 异常</div>
      <div class="arrow">→</div>
      <div class="node"><b>今日建议</b><br/>只做 in-scope 小范围验证</div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>可执行调整池</h3>
      <table>
        <thead>
          <tr>
            <th>SKU</th><th>站点</th><th>广告类型</th><th>建议动作</th><th>运营目的</th><th>原因</th><th>预期效果</th><th>风险</th><th>今天建议</th>
          </tr>
        </thead>
        <tbody>${tableRows(executableRows, row => `<tr>
          <td>${esc(row.sku)}</td>
          <td>${esc(row.site)}</td>
          <td>${esc(row.entityType)}</td>
          <td>${esc(row.action)}</td>
          <td>${esc(row.category)}</td>
          <td>${esc(row.reason)}</td>
          <td>${esc(row.expected)}</td>
          <td>${esc(row.risk)}</td>
          <td>${esc(row.recommendation)}</td>
        </tr>`)}</tbody>
      </table>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>人工复核池</h3>
        <table>
          <thead><tr><th>SKU</th><th>类型</th><th>为什么不能自动执行</th><th>经营影响</th><th>今天建议</th></tr></thead>
          <tbody>${tableRows(reviewRows, row => `<tr>
            <td>${esc(row.sku)}</td>
            <td>${esc(row.entityType)}</td>
            <td>${esc(row.reason)}</td>
            <td>${row.sku === 'SC3077' ? '涉及老品保曝光与控浪费的取舍，错误自动降 bid 可能误伤销量' : '涉及结构扩张，不是简单调价，自动化边界不够稳'}</td>
            <td>${row.sku === 'SC3077' ? '今天人工看 SP / SB 投放结构，再决定是否挪量' : '今天先不自动执行，若要做请人工确认 SB 结构新增'}</td>
          </tr>`)}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>异常池</h3>
        <div class="callout riskbox">
          <b>EY0793</b>：校验错误，原因是 <code>entity id not found in context</code>。这不是“低优先级 warning”，而是动作上下文不完整，今天不能执行。
        </div>
        <ul>
          <li>经营背景：该 SKU 仍处在 Cinco de Mayo 需求窗口，但库存只有约 22 天，本来也不适合自动放量。</li>
          <li>今天建议：不处理自动执行；若业务要追机会，先人工确认库存、页面、实体是否仍在线。</li>
          <li>后续修复：补齐实体上下文映射，再决定是否保留为 review，而不是强行进入 execute。</li>
        </ul>
      </div>
    </div>

    <h2>利润与 KPI 角度</h2>
    <div class="grid g3">
      <div class="card">
        <h3>对净利润的影响</h3>
        <ul>
          <li>6 个提 bid 都是 0.01 美元级别试投，风险可控，前提是只做小范围验证。</li>
          <li><b>CL3650</b> 虽然单词转化好，但商品利润率为负且库存仅约 30 天，是今天最需要盯回查的放量动作。</li>
          <li><b>LNE1321</b> 是今天最明确的止血动作，对压广告浪费和保护净利更直接。</li>
        </ul>
      </div>
      <div class="card">
        <h3>对广告浪费的影响</h3>
        <ul>
          <li>今天动作集整体不是“大扩量”，而是把预算往已经验证有效的词上微调。</li>
          <li>人工复核池和 EY0793 被挡在自动执行外，降低了错投和假成功风险。</li>
          <li>scope gate 生效，今天没有 out_of_scope SKU 混入动作池。</li>
        </ul>
      </div>
      <div class="card">
        <h3>误伤风险</h3>
        <ul>
          <li>误伤风险主要在老品保曝光场景，如 <b>SC3077</b>，所以维持人工复核是对的。</li>
          <li>库存风险主要在 <b>EY0793</b>、<b>QUN1382</b>、<b>EY1448</b> 这类低库存仍有销量的 SKU，上量动作必须谨慎。</li>
          <li>今天不建议把可执行 7 个动作再扩成更大范围。</li>
        </ul>
      </div>
    </div>

    <h2>今日最终结论</h2>
    <div class="card">
      <div class="callout okbox">
        今天的最优动作不是“全面自动运营”，而是基于已有 dry-run 结果做 <b>7 个 in-scope executable 动作的小范围 execute 验证候选</b>。
      </div>
      <ul>
        <li><b>建议执行</b>：TIN2263、UAN2600、GT3811、CL3650、GM3149、UY0879、LNE1321。</li>
        <li><b>建议暂缓</b>：EY0793，先不动。</li>
        <li><b>建议人工复核</b>：SC3077、KV0324。</li>
        <li><b>执行边界</b>：只建议小范围执行这 7 个 in-scope executable 动作，不扩大范围，不放开 review，不处理异常动作。</li>
      </ul>
    </div>

    <h2>数据来源</h2>
    <div class="card">
      <ul>
        <li>snapshot：<code>${esc(sources.snapshot)}</code></li>
        <li>manifest：<code>${esc(sources.manifest)}</code></li>
        <li>summary：<code>${esc(sources.summary)}</code></li>
        <li>action schema：<code>${esc(sources.schema)}</code></li>
        <li>说明：今日经营判断基于 <code>sellerSalesRows</code> 汇总口径 + <code>productCards</code> SKU 快照口径，不等同于财务关账口径。</li>
        <li>补充判断依据：节气品 / 老品补量判断后续应优先叠加 <code>adv /product/chart</code> 的展示、点击绝对值趋势，区分“流量下滑”与“转化下滑”。</li>
      </ul>
    </div>

    <div class="muted" style="margin-top:16px">生成时间：${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

function main() {
  const manifest = readJson(MANIFEST_FILE);
  const summary = readJson(SUMMARY_FILE);
  const snapshot = readJson(SNAPSHOT_FILE);
  const schema = readJson(SCHEMA_FILE);
  const sellerRows = snapshot.sellerSalesRows || [];
  const cards = snapshot.productCards || [];
  const cardMap = buildCardMap(cards);
  const totalRow = rowByTitle(sellerRows, '所选编号汇总') || {};
  const hjGroup = rowByTitle(sellerRows, 'HJ大组') || {};
  const hj1 = rowByTitle(sellerRows, 'HJ1小组') || {};
  const dryRunDetails = stepDetails(manifest, 'dry_run');
  const validationErrors = dryRunDetails.aiValidationErrors || manifest.aiValidationErrors || manifest.finalSummary?.aiValidationErrors || [];
  const reviewSkus = new Set((summary.reviewActions || []).map(item => String(item.sku || '').toUpperCase()));
  const validationSkus = new Set(validationErrors.map(item => String(item.sku || '').toUpperCase()));

  const schemaRows = Array.isArray(schema) ? schema : [];
  const actionPlans = schemaRows.filter(item => {
    const sku = String(item.sku || '').toUpperCase();
    const action = item.actions?.[0];
    return sku && action && action.actionType !== 'review' && !reviewSkus.has(sku) && !validationSkus.has(sku);
  });
  const reviewPlans = schemaRows.filter(item => reviewSkus.has(String(item.sku || '').toUpperCase()));

  const reportDate = (snapshot.exportedAt || new Date().toISOString()).slice(0, 10);
  const outFile = path.join(OUT_DIR, `today_ad_ops_adjustment_${reportDate}.html`);

  const html = makeHtml({
    runId: RUN_ID,
    reportDate,
    manifest,
    summary,
    actionPlans,
    reviewPlans,
    validationErrors,
    cardMap,
    sources: {
      snapshot: SNAPSHOT_FILE,
      manifest: MANIFEST_FILE,
      summary: SUMMARY_FILE,
      schema: SCHEMA_FILE,
    },
    totalRow,
    hjGroup,
    hj1,
    winners: topWinners(cards),
    drags: topDrags(cards),
    lowInv: lowInventoryRisks(cards),
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outFile,
    runId: RUN_ID,
    sourceFiles: {
      snapshot: SNAPSHOT_FILE,
      manifest: MANIFEST_FILE,
      summary: SUMMARY_FILE,
      schema: SCHEMA_FILE,
    },
    summary: {
      executableSkus: summary.executableSkus,
      reviewSkus: summary.reviewSkus,
      outOfScopeSkus: summary.outOfScopeSkus,
      validationErrors: validationErrors.length,
      snapshotMs: stageTime(manifest, 'snapshot'),
    },
  }, null, 2));
}

main();
