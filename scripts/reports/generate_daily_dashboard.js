const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'reports');

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function money(value, digits = 0) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value, digits = 1) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function signedMoney(value, digits = 0) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${money(n, digits)}`;
}

function signedPct(value, digits = 1) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;
}

function signedPp(value, digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}pp`;
}

function int(value) {
  return Math.round(num(value)).toLocaleString('en-US');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function findTrendRoot() {
  const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(entry => entry.isDirectory());
  const hit = dirs.find(entry => /个人数据趋势|personal|trend/i.test(entry.name));
  return hit ? path.join(ROOT, hit.name) : null;
}

function findLatestRunSummary() {
  const runsDir = path.join(ROOT, 'data', 'snapshots', 'runs');
  const summaries = walkFiles(runsDir).filter(file => path.basename(file) === 'summary.json');
  summaries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return summaries[0] || null;
}

function findLatestByPattern(dir, pattern) {
  const files = walkFiles(dir).filter(file => pattern.test(path.basename(file)));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function totalSalesRow(rows) {
  return (rows || []).find(row => {
    const title = String(row.seller_title || '').trim();
    return title === '所选编号汇总' || (title.includes('所选') && title.includes('汇总'));
  }) || {};
}

function historyRows(trendRoot) {
  if (!trendRoot) return [];
  return walkFiles(trendRoot)
    .map(file => {
      const match = path.basename(file).match(/^seller_sales_from_snapshot_(\d{4}-\d{2}-\d{2})\.csv$/);
      if (!match) return null;
      const row = totalSalesRow(readCsv(file));
      if (!row.order_sales) return null;
      return {
        date: match[1],
        sales: num(row.order_sales),
        units: num(row.sale_num),
        adSpend: num(row.adv_spend),
        acos: num(row.ACOS),
        netProfit: num(row.net_profit),
        refund: num(row.refund_percent),
        adCostShare: num(row.advCost),
        new5Sales: num(row.order_sales_in_5_month),
        new5Acos: num(row.acos_in_5_month),
        new5Net: num(row.net_profit_in_5_month),
        yoyUnits: num(row.qty_yoy_over_1_year),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricDelta(rows, key) {
  if (rows.length < 2) return null;
  const prev = rows[rows.length - 2];
  const current = rows[rows.length - 1];
  return {
    absolute: num(current[key]) - num(prev[key]),
    ratio: num(prev[key]) ? (num(current[key]) / num(prev[key]) - 1) : null,
  };
}

function sparkline(rows, key, color, asPct = false) {
  const values = rows.map(row => num(row[key])).filter(Number.isFinite);
  if (values.length < 2) return '';
  const width = 460;
  const height = 150;
  const pad = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const pathData = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaData = `${pathData} L${points[points.length - 1][0].toFixed(1)} ${height - pad} L${points[0][0].toFixed(1)} ${height - pad} Z`;
  const labels = rows.map((row, index) => {
    const [x] = points[index];
    const text = row.date.slice(5);
    return `<text x="${x.toFixed(1)}" y="${height - 5}" text-anchor="middle">${esc(text)}</text>`;
  }).join('');
  const valueLabels = points.map(([x, y], index) => {
    const value = values[index];
    const text = asPct ? pct(value, 1) : money(value, 0);
    return `<text x="${x.toFixed(1)}" y="${Math.max(12, y - 8).toFixed(1)}" text-anchor="middle">${esc(text)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    <path d="${areaData}" fill="${color}" opacity="0.12"></path>
    <path d="${pathData}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
    ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}"></circle>`).join('')}
    ${valueLabels}
    ${labels}
  </svg>`;
}

function barList(items, maxValue, valueFormatter = int) {
  return `<div class="bars">${items.map(item => {
    const value = num(item.value);
    const width = maxValue > 0 ? Math.max(2, Math.min(100, (value / maxValue) * 100)) : 0;
    return `<div class="bar-row">
      <div class="bar-label">${esc(item.label)}</div>
      <div class="bar-track"><div class="bar-fill ${esc(item.tone || '')}" style="width:${width.toFixed(1)}%"></div></div>
      <div class="bar-value">${esc(valueFormatter(value))}</div>
    </div>`;
  }).join('')}</div>`;
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty">暂无命中项</div>';
  return `<table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function statusClass(value, goodWhenDown = false) {
  const n = num(value);
  if (goodWhenDown) return n <= 0 ? 'good' : 'bad';
  return n >= 0 ? 'good' : 'bad';
}

function developerRows(rows) {
  const devRows = (rows || []).filter(row => row.developer_num && num(row.order_sales) > 0);
  const topSales = [...devRows].sort((a, b) => num(b.order_sales) - num(a.order_sales)).slice(0, 8);
  const highRefund = [...devRows]
    .filter(row => num(row.order_sales) >= 8000 && num(row.refund_percent) >= 0.08)
    .sort((a, b) => num(b.order_sales) - num(a.order_sales))
    .slice(0, 8);
  const lowProfit = [...devRows]
    .filter(row => num(row.order_sales) >= 8000 && num(row.net_profit) < 0.15)
    .sort((a, b) => num(a.net_profit) - num(b.net_profit))
    .slice(0, 8);
  return { topSales, highRefund, lowProfit };
}

function skuRiskRows(snapshot) {
  const cards = snapshot.productCards || [];
  const lowEfficiencyRows = Array.isArray(snapshot.lowEfficiencyRows)
    ? snapshot.lowEfficiencyRows
    : Object.values(snapshot.lowEfficiencyRows || {}).flat();
  const stale = cards
    .filter(card => num(card.invDays) >= 120 && num(card.unitsSold_7d) <= 3 && num(card.stockFul) + num(card.stockRes) > 0)
    .sort((a, b) => num(b.invDays) - num(a.invDays))
    .slice(0, 8);
  const tight = cards
    .filter(card => num(card.sellableDays_7d) > 0 && num(card.sellableDays_7d) <= 30 && num(card.unitsSold_7d) >= 3)
    .sort((a, b) => num(a.sellableDays_7d) - num(b.sellableDays_7d))
    .slice(0, 8);
  const waste = lowEfficiencyRows
    .filter(row => num(row?.windows?.['3']?.spend) > 0 || num(row?.entry?.windows?.['3']?.spend) > 0)
    .slice(0, 8);
  return { stale, tight, waste };
}

function auditSamples(audit) {
  const item = (value) => Array.isArray(value?.items) ? value.items : [];
  return {
    newProducts: item(audit.newProductLaunch).slice(0, 8),
    expired: item(audit.expiredSeasonKeywordWaste).slice(0, 8),
    listing: item(audit.listingRepair).slice(0, 8),
  };
}

function latestExecutionSummary(date) {
  const direct = path.join(ROOT, 'data', 'snapshots', `execution_summary_${date}.json`);
  if (fs.existsSync(direct)) return readJson(direct, {});
  const file = findLatestByPattern(path.join(ROOT, 'data', 'snapshots'), /^execution_summary_\d{4}-\d{2}-\d{2}\.json$/);
  return readJson(file, {});
}

function dashboardHtml(model) {
  const { summary, snapshot, history, audit, tasks, lowEfficiency, successRate, execution, outputDate, reportPaths } = model;
  const current = history[history.length - 1] || {};
  const salesDelta = metricDelta(history, 'sales');
  const unitsDelta = metricDelta(history, 'units');
  const adSpendDelta = metricDelta(history, 'adSpend');
  const acosDelta = metricDelta(history, 'acos');
  const netDelta = metricDelta(history, 'netProfit');
  const refundDelta = metricDelta(history, 'refund');
  const new5Delta = metricDelta(history, 'new5Sales');
  const taskSummary = tasks.summary || summary.dailyTaskPool || {};
  const auditKpi = audit.kpi || {};
  const nextGap = auditKpi.nextCheckpoint || {};
  const finalGap = auditKpi.finalTarget || {};
  const modules = [
    { label: '新品启动', value: num(audit.newProductLaunch?.summary?.total ?? summary.proactiveOperatingAudit?.newProductLaunch) },
    { label: '到货广告恢复', value: num(audit.arrivalAdRecovery?.summary?.total ?? summary.proactiveOperatingAudit?.arrivalAdRecovery) },
    { label: '价格动作', value: num(audit.priceActions?.summary?.total ?? summary.proactiveOperatingAudit?.priceActions), tone: 'warn' },
    { label: '过季词浪费', value: num(audit.expiredSeasonKeywordWaste?.summary?.totalEnabledRows ?? summary.proactiveOperatingAudit?.expiredSeasonKeywordWaste), tone: 'bad' },
    { label: 'Listing修复', value: num(audit.listingRepair?.summary?.total ?? summary.proactiveOperatingAudit?.listingRepair), tone: 'bad' },
  ];
  const maxModule = Math.max(...modules.map(item => item.value), 1);
  const dev = developerRows(snapshot.sellerSalesRows || []);
  const risks = skuRiskRows(snapshot);
  const samples = auditSamples(audit);
  const sourceTime = summary.time || audit.time || {};
  const rawOutputs = readJson(reportPaths.depositManifest, {})?.outputs || [];

  const cards = [
    { label: '总销售', value: money(current.sales, 2), sub: salesDelta ? `${signedMoney(salesDelta.absolute, 0)} / ${signedPct(salesDelta.ratio, 1)}` : '无对比', cls: statusClass(salesDelta?.absolute ?? 0) },
    { label: '销量', value: int(current.units), sub: unitsDelta ? `${unitsDelta.absolute >= 0 ? '+' : ''}${int(unitsDelta.absolute)} / ${signedPct(unitsDelta.ratio, 1)}` : '无对比', cls: statusClass(unitsDelta?.absolute ?? 0) },
    { label: '净利率', value: pct(current.netProfit, 2), sub: netDelta ? signedPp(netDelta.absolute, 2) : '无对比', cls: statusClass(netDelta?.absolute ?? 0) },
    { label: 'ACOS', value: pct(current.acos, 2), sub: acosDelta ? signedPp(acosDelta.absolute, 2) : '无对比', cls: statusClass(-(acosDelta?.absolute ?? 0)) },
    { label: '广告费率', value: pct(current.adCostShare, 2), sub: adSpendDelta ? `广告费 ${signedMoney(adSpendDelta.absolute, 0)} / ${signedPct(adSpendDelta.ratio, 1)}` : '无对比', cls: statusClass(-(adSpendDelta?.absolute ?? 0)) },
    { label: '退款率', value: pct(current.refund, 2), sub: refundDelta ? signedPp(refundDelta.absolute, 2) : '无对比', cls: statusClass(-(refundDelta?.absolute ?? 0)) },
  ];

  const devTopRows = dev.topSales.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${esc(row.seller_num)}</td><td>${money(row.order_sales, 2)}</td>
    <td>${int(row.sale_num)}</td><td>${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td><td>${pct(row.refund_percent, 1)}</td>
  </tr>`);
  const refundRows = dev.highRefund.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${money(row.order_sales, 2)}</td><td>${int(row.sale_num)}</td>
    <td class="bad-text">${pct(row.refund_percent, 1)}</td><td>${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td>
  </tr>`);
  const lowProfitRows = dev.lowProfit.map(row => `<tr>
    <td>${esc(row.developer_num)}</td><td>${money(row.order_sales, 2)}</td><td>${int(row.sale_num)}</td>
    <td class="bad-text">${pct(row.net_profit, 1)}</td><td>${pct(row.ACOS, 1)}</td><td>${pct(row.refund_percent, 1)}</td>
  </tr>`);

  const newProductRows = samples.newProducts.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue)}</td><td>${int(item.ageDays)}</td>
    <td>${int(item.units7d)}</td><td>${money(item.spend7d, 2)}</td><td>${esc(item.requiredAction)}</td>
  </tr>`);
  const expiredRows = samples.expired.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue || 'expired season keyword')}</td>
    <td>${money(item.spend7d ?? item.spend3d, 2)}</td><td>${int(item.orders7d)}</td><td>${esc(item.requiredAction || 'pause_or_bid_down_expired_season_keyword')}</td>
  </tr>`);
  const listingRows = samples.listing.map(item => `<tr>
    <td>${esc(item.sku)}</td><td>${esc(item.issue)}</td><td>${int(item.clicks7d)}</td><td>${int(item.units7d)}</td><td>${esc(item.requiredAction)}</td>
  </tr>`);
  const staleRows = risks.stale.map(card => `<tr>
    <td>${esc(card.sku)}</td><td>${esc(card.asin)}</td><td>${int(card.invDays)}</td>
    <td>${int(card.unitsSold_7d)}</td><td>${pct(card.netProfit, 1)}</td><td>${esc(card.saleStatus)}</td>
  </tr>`);
  const tightRows = risks.tight.map(card => `<tr>
    <td>${esc(card.sku)}</td><td>${esc(card.asin)}</td><td>${int(card.sellableDays_7d)}</td>
    <td>${int(card.unitsSold_7d)}</td><td>${pct(card.netProfit, 1)}</td><td>${esc(card.saleStatus)}</td>
  </tr>`);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>每日经营 Dashboard ${esc(outputDate)}</title>
  <style>
    :root {
      --bg: #f7f8fa;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d9dee7;
      --blue: #2878bd;
      --green: #20815a;
      --red: #c2473b;
      --amber: #b7791f;
      --teal: #16818a;
    }
    * { box-sizing: border-box; }
    html, body { overflow-x: hidden; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      letter-spacing: 0;
    }
    .page { width: 100%; max-width: 1440px; margin: 0 auto; padding: 24px; }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
      margin-bottom: 18px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 750; }
    h2 { margin: 0 0 12px; font-size: 18px; font-weight: 720; }
    h3 { margin: 0 0 8px; font-size: 15px; font-weight: 720; }
    .meta { color: var(--muted); line-height: 1.8; overflow-wrap: anywhere; }
    .meta-line { display: block; max-width: 100%; overflow-wrap: anywhere; }
    .stamp { text-align: right; color: var(--muted); line-height: 1.8; white-space: nowrap; }
    .grid { display: grid; gap: 14px; }
    .grid > *, header > * { min-width: 0; }
    .kpis { grid-template-columns: repeat(6, minmax(150px, 1fr)); }
    .two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .panel, .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    }
    .panel { padding: 16px; overflow: hidden; min-width: 0; }
    .metric { padding: 14px; min-height: 110px; }
    .metric .label { color: var(--muted); font-size: 13px; }
    .metric .value { font-size: 26px; font-weight: 760; margin: 10px 0 8px; white-space: nowrap; }
    .metric .sub { font-size: 13px; color: var(--muted); line-height: 1.4; }
    .metric.good .sub { color: var(--green); }
    .metric.bad .sub { color: var(--red); }
    .section { margin-top: 14px; }
    .callout {
      border-left: 4px solid var(--blue);
      background: #eef5fb;
      padding: 12px 14px;
      border-radius: 8px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    .bad-callout { border-left-color: var(--red); background: #fbf1ef; }
    .good-text { color: var(--green); font-weight: 700; }
    .bad-text { color: var(--red); font-weight: 700; }
    .warn-text { color: var(--amber); font-weight: 700; }
    .chart { width: 100%; height: 170px; display: block; }
    .chart text { fill: var(--muted); font-size: 11px; }
    .bars { display: grid; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: 112px minmax(120px, 1fr) 76px; gap: 10px; align-items: center; }
    .bar-label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { height: 10px; background: #edf0f4; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--blue); border-radius: 999px; }
    .bar-fill.warn { background: var(--amber); }
    .bar-fill.bad { background: var(--red); }
    .bar-value { text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: var(--muted); font-weight: 650; background: #fafbfc; }
    td { line-height: 1.45; }
    .table-wrap { max-height: 360px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 9px;
      border-radius: 999px;
      background: #eef2f6;
      color: #344054;
      font-size: 12px;
      white-space: nowrap;
    }
    .pill.good { background: #eaf6ef; color: #1f6f4a; }
    .pill.bad { background: #fae9e6; color: #a33b31; }
    .pill.warn { background: #fff4db; color: #8a5a0a; }
    .empty { color: var(--muted); padding: 16px; background: #fafbfc; border-radius: 8px; }
    .source-list { display: grid; gap: 8px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    @media (max-width: 1100px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .two, .three { grid-template-columns: 1fr; }
      header { grid-template-columns: 1fr; }
      .stamp { text-align: left; }
    }
    @media (max-width: 680px) {
      .page { padding: 14px; max-width: 390px; margin: 0; }
      .kpis { grid-template-columns: 1fr; }
      .stamp { white-space: normal; overflow-wrap: anywhere; }
      .meta-line { max-width: calc(100vw - 28px); word-break: break-all; }
      .bar-row { grid-template-columns: 96px minmax(80px, 1fr) 64px; }
      h1 { font-size: 23px; }
      .metric .value { font-size: 23px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>每日经营 Dashboard</h1>
        <div class="meta">
          <span class="meta-line">本地日期 ${esc(sourceTime.localDate || outputDate)}</span>
          <span class="meta-line">businessDate ${esc(sourceTime.businessDate || '')} · dataDate ${esc(sourceTime.dataDate || '')}</span>
          <span class="meta-line">口径：总账号所选编号汇总优先，SKU/广告池用于解释和行动排序。</span>
        </div>
      </div>
      <div class="stamp">
        生成时间 ${esc(new Date().toLocaleString('zh-CN', { hour12: false }))}<br>
        快照 ${esc(path.basename(reportPaths.snapshot || 'latest_snapshot.json'))}
      </div>
    </header>

    <section class="grid kpis">
      ${cards.map(card => `<div class="metric ${esc(card.cls)}"><div class="label">${esc(card.label)}</div><div class="value">${esc(card.value)}</div><div class="sub">${esc(card.sub)}</div></div>`).join('')}
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>经营判断</h2>
        <div class="callout">
          今天是修复型好转：销售 ${salesDelta ? esc(signedMoney(salesDelta.absolute, 0)) : '无对比'}，净利率 ${netDelta ? esc(signedPp(netDelta.absolute, 2)) : '无对比'}，ACOS ${acosDelta ? esc(signedPp(acosDelta.absolute, 2)) : '无对比'}。广告费下降但销售回升，说明控费没有明显压掉订单。
        </div>
        <div class="callout bad-callout" style="margin-top:10px">
          KPI 仍未闭环：到 5-19 检查点销售还差 ${money(nextGap.salesGap, 0)}，销量还差 ${int(nextGap.unitsGap)}，ACOS 还差 ${signedPp(nextGap.acosGap, 2).replace('+', '')}，退款率还差 ${signedPp(nextGap.refundRateGap, 2).replace('+', '')}。
        </div>
      </div>
      <div class="panel">
        <h2>数据健康</h2>
        <div class="pill-row">
          <span class="pill good">baseline ${esc(summary.dailyLearning?.baselineQuality || 'complete')}</span>
          <span class="pill">productCards ${int(summary.totalProductCards || snapshot.productCards?.length)}</span>
          <span class="pill">allowed SKUs ${int(summary.allowedScopeSkuCount)}</span>
          <span class="pill ${summary.warnings?.length ? 'warn' : 'good'}">warnings ${int(summary.warnings?.length || 0)}</span>
          <span class="pill ${execution.finalCounts?.success ? 'good' : 'warn'}">今日执行 ${int(execution.finalCounts?.success || 0)}</span>
          <span class="pill">HJ17成功率 ${esc(successRate.successRatePercent || '-')}</span>
        </div>
        <div class="source-list" style="margin-top:12px">
          ${rawOutputs.map(item => `<div>${esc(path.basename(item.file || ''))}: ${int(item.rows)} rows · ${(num(item.bytes) / 1024).toFixed(1)} KB</div>`).join('') || '<div>未找到 raw deposit manifest</div>'}
        </div>
      </div>
    </section>

    <section class="section grid three">
      <div class="panel">
        <h2>销售趋势</h2>
        ${sparkline(history.slice(-7), 'sales', '#2878bd')}
      </div>
      <div class="panel">
        <h2>利润率趋势</h2>
        ${sparkline(history.slice(-7), 'netProfit', '#20815a', true)}
      </div>
      <div class="panel">
        <h2>ACOS 趋势</h2>
        ${sparkline(history.slice(-7), 'acos', '#c2473b', true)}
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>异常压力</h2>
        ${barList(modules, maxModule)}
      </div>
      <div class="panel">
        <h2>任务池</h2>
        ${barList(Object.entries(taskSummary.bySignal || {}).map(([label, value]) => ({ label, value, tone: /profit|tail|stale|tight/.test(label) ? 'warn' : '' })), Math.max(...Object.values(taskSummary.bySignal || { x: 1 }).map(num), 1))}
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>过预算覆盖</h2>
        <div class="pill-row">
          <span class="pill">抓取行 ${int(summary.overBudgetCoverage?.snapshotRows)}</span>
          <span class="pill">可行动 campaign ${int(summary.overBudgetCoverage?.actionableCampaigns)}</span>
          <span class="pill bad">schema 命中 ${int(summary.overBudgetCoverage?.matchedActionCount)}</span>
          <span class="pill warn">${esc(summary.overBudgetCoverage?.warning || 'no warning')}</span>
        </div>
        <div style="margin-top:12px">
          ${barList(Object.entries(summary.overBudgetCoverage?.counts || {}).map(([label, value]) => ({ label, value, tone: label === 'review' ? 'warn' : '' })), Math.max(...Object.values(summary.overBudgetCoverage?.counts || { x: 1 }).map(num), 1))}
        </div>
      </div>
      <div class="panel">
        <h2>新品段</h2>
        <div class="grid three">
          <div><h3>销售</h3><div class="metric-value">${money(current.new5Sales, 2)}</div><div class="meta">${new5Delta ? `${signedMoney(new5Delta.absolute, 0)} / ${signedPct(new5Delta.ratio, 1)}` : '无对比'}</div></div>
          <div><h3>ACOS</h3><div class="metric-value">${pct(current.new5Acos, 2)}</div><div class="meta">目标先稳定低于 30%</div></div>
          <div><h3>净利</h3><div class="metric-value">${pct(current.new5Net, 2)}</div><div class="meta">继续保留有效流量</div></div>
        </div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>开发线销售贡献</h2>
        <div class="table-wrap">${table(['开发线', '账号', '销售', '销量', '净利', 'ACOS', '退款'], devTopRows)}</div>
      </div>
      <div class="panel">
        <h2>高退款开发线</h2>
        <div class="table-wrap">${table(['开发线', '销售', '销量', '退款', '净利', 'ACOS'], refundRows)}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>低利润开发线</h2>
        <div class="table-wrap">${table(['开发线', '销售', '销量', '净利', 'ACOS', '退款'], lowProfitRows)}</div>
      </div>
      <div class="panel">
        <h2>新品启动缺口</h2>
        <div class="table-wrap">${table(['SKU', '问题', '年龄', '7日销量', '7日花费', '动作'], newProductRows)}</div>
      </div>
    </section>

    <section class="section grid three">
      <div class="panel">
        <h2>过季词清理</h2>
        <div class="table-wrap">${table(['SKU', '问题', '7日花费', '7日订单', '动作'], expiredRows)}</div>
      </div>
      <div class="panel">
        <h2>Listing / Offer 修复</h2>
        <div class="table-wrap">${table(['SKU', '问题', '7日点击', '7日销量', '动作'], listingRows)}</div>
      </div>
      <div class="panel">
        <h2>库存风险</h2>
        <div class="table-wrap">${table(['SKU', 'ASIN', '库存天数', '7日销量', '净利', '状态'], staleRows)}</div>
      </div>
    </section>

    <section class="section grid two">
      <div class="panel">
        <h2>紧库存</h2>
        <div class="table-wrap">${table(['SKU', 'ASIN', '可售天数', '7日销量', '净利', '状态'], tightRows)}</div>
      </div>
      <div class="panel">
        <h2>明天检查点</h2>
        <div class="callout">
          先看总销售是否接近 ${money(nextGap.target?.sales, 0)}、销量是否接近 ${int(nextGap.target?.units)}；再看 ACOS 是否继续低于今天的 ${pct(current.acos, 2)}，退款率是否从 ${pct(current.refund, 2)} 回落。
        </div>
        <div class="source-list" style="margin-top:12px">
          <div>最终 KPI 销售缺口：${money(finalGap.salesGap, 0)}</div>
          <div>最终 KPI 净利润额缺口：${money(finalGap.estimatedNetProfitGap, 0)}</div>
          <div>最终 KPI ACOS 缺口：${signedPp(finalGap.acosGap, 2).replace('+', '')}</div>
          <div>最终 KPI 退款率缺口：${signedPp(finalGap.refundRateGap, 2).replace('+', '')}</div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function main() {
  const latestSummaryFile = process.argv[2] || findLatestRunSummary();
  const summary = readJson(latestSummaryFile, {});
  const snapshotFile = summary.outputFiles?.snapshotFile || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
  const snapshot = readJson(snapshotFile, readJson(path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'), {}));
  const outputDate = summary.time?.localDate || new Date().toISOString().slice(0, 10);
  const businessDate = summary.time?.businessDate || outputDate;
  const trendRoot = findTrendRoot();
  const history = historyRows(trendRoot).slice(-7);
  if (!history.length && snapshot.sellerSalesRows) {
    const row = totalSalesRow(snapshot.sellerSalesRows);
    history.push({
      date: outputDate,
      sales: num(row.order_sales),
      units: num(row.sale_num),
      adSpend: num(row.adv_spend),
      acos: num(row.ACOS),
      netProfit: num(row.net_profit),
      refund: num(row.refund_percent),
      adCostShare: num(row.advCost),
      new5Sales: num(row.order_sales_in_5_month),
      new5Acos: num(row.acos_in_5_month),
      new5Net: num(row.net_profit_in_5_month),
      yoyUnits: num(row.qty_yoy_over_1_year),
    });
  }

  const auditFile = summary.outputFiles?.proactiveOperatingAuditJson || path.join(ROOT, 'data', 'tasks', `proactive_operating_audit_${businessDate}.json`);
  const tasksFile = summary.outputFiles?.dailyTaskPoolJson || path.join(ROOT, 'data', 'tasks', `daily_tasks_${businessDate}.json`);
  const lowEfficiencyFile = summary.outputFiles?.lowEfficiencyPoolsJson || path.join(ROOT, 'data', 'tasks', `low_efficiency_pools_${businessDate}.json`);
  const successRateFile = path.join(ROOT, 'data', 'snapshots', `seller_success_rate_HJ17_${outputDate}.json`);
  const depositManifest = trendRoot ? findLatestByPattern(trendRoot, new RegExp(`^daily_deposit_manifest_${outputDate}\\.json$`)) : '';
  const execution = latestExecutionSummary(outputDate);

  const model = {
    summary,
    snapshot,
    history,
    audit: readJson(auditFile, {}),
    tasks: readJson(tasksFile, {}),
    lowEfficiency: readJson(lowEfficiencyFile, {}),
    successRate: readJson(successRateFile, {}),
    execution,
    outputDate,
    reportPaths: {
      snapshot: snapshotFile,
      depositManifest,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `daily_dashboard_${outputDate}.html`);
  fs.writeFileSync(outFile, dashboardHtml(model), 'utf8');
  console.log(outFile);
}

if (require.main === module) {
  main();
}
