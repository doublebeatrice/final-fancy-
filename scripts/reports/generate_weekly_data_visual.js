const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const START = '2026-05-18';
const END = '2026-05-22';
const RAW_ROOT = path.join(ROOT, '黄成喆个人数据趋势', '原数据', '原日数据');
const OUT_DIR = path.join(ROOT, 'data', 'reports');
const OUT_JSON = path.join(OUT_DIR, `weekly_data_visual_${START}_to_${END}.json`);
const OUT_HTML = path.join(OUT_DIR, `weekly_data_visual_${START}_to_${END}.html`);
const OUT_SVG = path.join(OUT_DIR, `weekly_data_visual_${START}_to_${END}.svg`);

const DATES = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'];

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtMoney(value) {
  return value === null ? '-' : `$${Math.round(value).toLocaleString('en-US')}`;
}

function fmtMoney1(value) {
  return value === null ? '-' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

function fmtPct(value) {
  return value === null ? '-' : `${(value * 100).toFixed(2)}%`;
}

function fmtPp(value) {
  if (value === null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}pp`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rawFolderFor(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return path.join(RAW_ROOT, `${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
}

function parseCsvLine(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

function readCsvRows(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function normalizeSalesRow(row, source, depositComplete) {
  if (!row) return null;
  return {
    source,
    depositComplete,
    orderSales: num(row.order_sales),
    advSpend: num(row.adv_spend),
    advCost: num(row.advCost),
    acos: num(row.ACOS),
    netProfit: num(row.net_profit),
    grossProfit: num(row.gross_profit),
    refundPercent: num(row.refund_percent),
    saleNum: num(row.sale_num),
    sp: num(row.SP),
    at: num(row.AT),
    orderSales5m: num(row.order_sales_in_5_month),
    advCost5m: num(row.advCost_in_5_month),
    acos5m: num(row.acos_in_5_month),
    netProfit5m: num(row.net_profit_in_5_month),
  };
}

function findSelectedSalesInCsv(date) {
  const candidates = [
    {
      file: path.join(rawFolderFor(date), `seller_sales_core_7d_${date}.csv`),
      source: 'sales_core_raw',
    },
    {
      file: path.join(rawFolderFor(date), `seller_sales_from_snapshot_${date}.csv`),
      source: 'snapshot_derived_csv',
    },
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.file)) continue;
    const rows = readCsvRows(candidate.file);
    const selected = rows.find(row => row.seller_title === '所选编号汇总');
    const normalized = normalizeSalesRow(selected, candidate.source, true);
    if (normalized) return normalized;
  }
  return null;
}

function findSelectedSalesInSnapshot(date) {
  const runsDir = path.join(ROOT, 'data', 'snapshots', 'runs');
  if (!fs.existsSync(runsDir)) return null;
  const candidates = fs.readdirSync(runsDir)
    .filter(name => name.startsWith(`today_ops_${date}`))
    .map(name => path.join(runsDir, name, `snapshot_${date}.json`))
    .filter(file => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const file of candidates) {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows : [];
    const selected = rows.find(row => row.seller_title === '所选编号汇总');
    if (selected) {
      return {
        ...normalizeSalesRow(selected, 'snapshot_fallback', false),
        snapshotFile: file,
      };
    }
  }
  return null;
}

function readDepositStatus(date) {
  const folder = rawFolderFor(date);
  const checks = {
    salesCsv: fs.existsSync(path.join(folder, `seller_sales_from_snapshot_${date}.csv`)),
    inventoryCsv: fs.existsSync(path.join(folder, `inv_auto_filtered_from_snapshot_${date}.csv`)),
    adCsv: fs.existsSync(path.join(folder, `ad_sku_summary_from_snapshot_${date}.csv`)),
    successJson: fs.existsSync(path.join(folder, `seller_success_rate_HJ17_${date}.json`)),
    manifest: fs.existsSync(path.join(folder, `daily_deposit_manifest_${date}.json`)),
    status: fs.existsSync(path.join(folder, `daily_deposit_status_${date}.json`)),
  };
  const completed = ['salesCsv', 'inventoryCsv', 'adCsv', 'successJson', 'manifest'].filter(key => checks[key]).length;
  return {
    ...checks,
    completed,
    expected: 5,
    complete: completed === 5,
  };
}

function actionCounts(date) {
  const adjustments = path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`);
  let adjustmentCount = 0;
  let liveCount = 0;
  let dryRunCount = 0;
  if (fs.existsSync(adjustments)) {
    const rows = JSON.parse(fs.readFileSync(adjustments, 'utf8'));
    if (Array.isArray(rows)) {
      adjustmentCount = rows.length;
      liveCount = rows.filter(row => row.dryRun !== true).length;
      dryRunCount = rows.filter(row => row.dryRun === true).length;
    }
  }
  const executionSummary = path.join(ROOT, 'data', 'snapshots', `execution_summary_${date}.json`);
  let execution = null;
  if (fs.existsSync(executionSummary)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(executionSummary, 'utf8'));
      execution = {
        plannedSkus: parsed.plannedSkus ?? null,
        plannedActions: parsed.plannedActions ?? null,
        finalSuccess: parsed.finalCounts?.success ?? null,
        actionSchemaFile: parsed.actionSchemaFile ?? null,
      };
    } catch (_) {
      execution = null;
    }
  }
  return { adjustmentCount, liveCount, dryRunCount, execution };
}

function successRate(date) {
  const file = path.join(rawFolderFor(date), `seller_success_rate_HJ17_${date}.json`);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const body = text.match(/"targetRow"\s*:\s*\{([\s\S]*?)\}\s*,\s*"successRate"/)?.[1] || '';
  const pick = key => num(body.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))?.[1]);
  return {
    total: pick('total'),
    success: pick('success'),
    failure: pick('failure'),
    inspect: pick('inspect'),
    successRate: num(text.match(/"successRate"\s*:\s*([0-9.]+)/)?.[1]),
  };
}

function linePath(points, key, x, y) {
  const valid = points
    .map((point, index) => ({ point, index, value: point[key] }))
    .filter(item => item.value !== null && item.value !== undefined);
  if (!valid.length) return '';
  return valid.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(item.index).toFixed(1)},${y(item.value).toFixed(1)}`).join(' ');
}

function chart({ title, series, labels, colors, valueFormat = v => v.toFixed(2), height = 248 }) {
  const width = 760;
  const pad = { left: 68, right: 18, top: 34, bottom: 34 };
  const values = series.flatMap(s => s.values).filter(value => value !== null && Number.isFinite(value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const yMin = min - span * 0.14;
  const yMax = max + span * 0.18;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = i => pad.left + (labels.length === 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
  const y = value => pad.top + ((yMax - value) / (yMax - yMin)) * plotH;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const yy = pad.top + plotH * t;
    const value = yMax - (yMax - yMin) * t;
    return `<line x1="${pad.left}" y1="${yy.toFixed(1)}" x2="${width - pad.right}" y2="${yy.toFixed(1)}" class="grid"/><text x="${pad.left - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="axis">${esc(valueFormat(value))}</text>`;
  }).join('');
  const paths = series.map((s, index) => {
    const color = colors[index % colors.length];
    const pts = s.values.map((value, i) => ({ value, i })).filter(item => item.value !== null);
    const d = pts.map((item, n) => `${n === 0 ? 'M' : 'L'} ${x(item.i).toFixed(1)},${y(item.value).toFixed(1)}`).join(' ');
    const circles = pts.map(item => `<circle cx="${x(item.i).toFixed(1)}" cy="${y(item.value).toFixed(1)}" r="3.7" fill="${color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circles}`;
  }).join('');
  const xLabels = labels.map((label, index) => `<text x="${x(index).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="axis">${esc(label)}</text>`).join('');
  const legend = series.map((s, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${esc(s.name)}</span>`).join('');
  return `<section class="panel chart"><div class="panel-head"><h2>${esc(title)}</h2><div class="legend">${legend}</div></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">${grid}${paths}${xLabels}</svg></section>`;
}

function barChart({ title, rows, key, color, valueFormat }) {
  const width = 760;
  const height = 248;
  const left = 58;
  const right = 20;
  const bottom = 44;
  const top = 28;
  const values = rows.map(row => row[key]).filter(value => value !== null);
  const max = Math.max(...values, 1);
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const gap = 16;
  const barW = (plotW - gap * (rows.length - 1)) / rows.length;
  const bars = rows.map((row, index) => {
    const value = row[key];
    const h = value === null ? 0 : (value / max) * plotH;
    const x = left + index * (barW + gap);
    const y = top + plotH - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${color}"/><text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="bar-label">${esc(valueFormat(value))}</text><text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" class="axis">${esc(row.shortDate)}</text>`;
  }).join('');
  return `<section class="panel chart"><div class="panel-head"><h2>${esc(title)}</h2></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="axis-line"/>${bars}</svg></section>`;
}

function simpleSvgLine(rows, key, x0, y0, width, height, color, label, valueFormat) {
  const values = rows.map(row => row[key]).filter(value => value !== null && Number.isFinite(value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const yMin = min - span * 0.14;
  const yMax = max + span * 0.16;
  const x = index => x0 + (rows.length === 1 ? width / 2 : (width * index) / (rows.length - 1));
  const y = value => y0 + ((yMax - value) / (yMax - yMin)) * height;
  const d = rows.map((row, index) => {
    const value = row[key];
    if (value === null) return '';
    return `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)},${y(value).toFixed(1)}`;
  }).filter(Boolean).join(' ');
  const points = rows.map((row, index) => {
    const value = row[key];
    if (value === null) return '';
    return `<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="5" fill="${color}"><title>${row.date} ${label}: ${valueFormat(value)}</title></circle>`;
  }).join('');
  const labels = rows.map((row, index) => `<text x="${x(index).toFixed(1)}" y="${y0 + height + 24}" text-anchor="middle" class="axis">${esc(row.shortDate)}</text>`).join('');
  const yLabels = [0, 0.5, 1].map(t => {
    const yy = y0 + height * t;
    const value = yMax - (yMax - yMin) * t;
    return `<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x0 + width}" y2="${yy.toFixed(1)}" class="grid"/><text x="${x0 - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="axis">${esc(valueFormat(value))}</text>`;
  }).join('');
  return `<text x="${x0}" y="${y0 - 14}" class="chart-title">${esc(label)}</text>${yLabels}<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${points}${labels}`;
}

function simpleSvgBars(rows, key, x0, y0, width, height, color, label, valueFormat) {
  const values = rows.map(row => row[key]).filter(value => value !== null && Number.isFinite(value));
  const max = Math.max(...values, 1);
  const gap = 14;
  const barW = (width - gap * (rows.length - 1)) / rows.length;
  const bars = rows.map((row, index) => {
    const value = row[key] ?? 0;
    const h = (value / max) * height;
    const x = x0 + index * (barW + gap);
    const y = y0 + height - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${color}"><title>${row.date} ${label}: ${valueFormat(value)}</title></rect><text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="bar-label">${esc(valueFormat(value))}</text><text x="${(x + barW / 2).toFixed(1)}" y="${y0 + height + 24}" text-anchor="middle" class="axis">${esc(row.shortDate)}</text>`;
  }).join('');
  return `<text x="${x0}" y="${y0 - 14}" class="chart-title">${esc(label)}</text><line x1="${x0}" y1="${y0 + height}" x2="${x0 + width}" y2="${y0 + height}" class="axis-line"/>${bars}`;
}

function buildSummarySvg(rows, insights) {
  const width = 1400;
  const height = 1060;
  const latest = [...rows].reverse().find(row => row.orderSales !== null);
  const completeDays = rows.filter(row => row.status.complete).length;
  const cards = [
    ['最新销售额', fmtMoney1(latest.orderSales), '#2563eb'],
    ['净利率', fmtPct(latest.netProfit), '#0f766e'],
    ['ACOS', fmtPct(latest.acos), '#dc2626'],
    ['退款率', fmtPct(latest.refundPercent), '#b45309'],
    ['完整沉淀', `${completeDays}/${rows.length}天`, '#475569'],
  ].map((card, index) => {
    const x = 50 + index * 262;
    return `<rect x="${x}" y="116" width="238" height="94" rx="10" class="card"/><text x="${x + 18}" y="148" class="card-label">${esc(card[0])}</text><text x="${x + 18}" y="184" class="card-value" fill="${card[2]}">${esc(card[1])}</text>`;
  }).join('');
  const status = rows.map((row, index) => {
    const x = 50 + index * 262;
    const color = row.status.complete ? '#15803d' : '#dc2626';
    const text = row.status.complete ? 'complete' : 'blocked';
    return `<rect x="${x}" y="944" width="238" height="50" rx="8" fill="${row.status.complete ? '#ecfdf5' : '#fef2f2'}" stroke="${row.status.complete ? '#bbf7d0' : '#fecaca'}"/><text x="${x + 18}" y="975" class="status" fill="${color}">${esc(row.shortDate)} ${text}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="本周数据变化可视化">
<style>
.bg{fill:#f5f7fa}.card,.panel{fill:#fff;stroke:#d9dfeb;stroke-width:1}.title{font:700 34px 'Microsoft YaHei','Segoe UI',Arial}.sub{font:15px 'Microsoft YaHei','Segoe UI',Arial;fill:#647084}.card-label{font:13px 'Microsoft YaHei','Segoe UI',Arial;fill:#647084}.card-value{font:700 28px 'Microsoft YaHei','Segoe UI',Arial}.chart-title{font:700 18px 'Microsoft YaHei','Segoe UI',Arial;fill:#172033}.axis{font:12px 'Microsoft YaHei','Segoe UI',Arial;fill:#647084}.grid{stroke:#e8ecf3;stroke-width:1}.axis-line{stroke:#d9dfeb;stroke-width:1}.bar-label{font:700 12px 'Microsoft YaHei','Segoe UI',Arial;fill:#172033}.note{font:14px 'Microsoft YaHei','Segoe UI',Arial;fill:#475569}.status{font:700 15px 'Microsoft YaHei','Segoe UI',Arial}
</style>
<rect width="${width}" height="${height}" class="bg"/>
<text x="50" y="56" class="title">本周数据变化可视化</text>
<text x="50" y="86" class="sub">${START} 至 ${END}；5/22 使用 snapshot 总账补点，原始日沉淀仍标记 blocked。</text>
${cards}
<rect x="50" y="246" width="620" height="300" rx="12" class="panel"/>
${simpleSvgLine(rows, 'orderSales', 124, 314, 500, 170, '#2563eb', '销售额趋势', fmtMoney)}
<rect x="730" y="246" width="620" height="300" rx="12" class="panel"/>
${simpleSvgLine(rows, 'saleNum', 804, 314, 500, 170, '#0f766e', '订单件数趋势', v => Math.round(v).toLocaleString('en-US'))}
<rect x="50" y="596" width="620" height="300" rx="12" class="panel"/>
${simpleSvgLine(rows, 'netProfit', 124, 664, 500, 170, '#2563eb', '净利率趋势', fmtPct)}
${simpleSvgLine(rows, 'refundPercent', 124, 664, 500, 170, '#dc2626', '退款率趋势', fmtPct).replace(/<text x="124" y="650" class="chart-title">.*?<\/text>/, '')}
<rect x="730" y="596" width="620" height="300" rx="12" class="panel"/>
${simpleSvgLine(rows, 'acos', 804, 664, 500, 170, '#dc2626', 'ACOS趋势', fmtPct)}
${simpleSvgLine(rows, 'advCost', 804, 664, 500, 170, '#0891b2', '广告占比趋势', fmtPct).replace(/<text x="804" y="650" class="chart-title">.*?<\/text>/, '')}
${status}
<text x="50" y="1028" class="note">${esc(insights[0])}</text>
</svg>`;
}

function delta(current, previous) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function pctChange(current, previous) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

const rows = DATES.map(date => {
  const status = readDepositStatus(date);
  const sales = findSelectedSalesInCsv(date) || findSelectedSalesInSnapshot(date);
  return {
    date,
    shortDate: date.slice(5),
    status,
    success: successRate(date),
    actions: actionCounts(date),
    ...sales,
  };
});

const first = rows.find(row => row.orderSales !== null);
const last = [...rows].reverse().find(row => row.orderSales !== null);
const prev = rows[rows.indexOf(last) - 1] || null;

const insights = [
  `周内销售额从 ${fmtMoney1(first.orderSales)} 到 ${fmtMoney1(last.orderSales)}，变化 ${fmtMoney1(delta(last.orderSales, first.orderSales))}（${pctChange(last.orderSales, first.orderSales) === null ? '-' : (pctChange(last.orderSales, first.orderSales) * 100).toFixed(2) + '%'}）。`,
  `ACOS 从 ${fmtPct(first.acos)} 降到 ${fmtPct(last.acos)}，改善 ${fmtPp(delta(last.acos, first.acos))}；广告花费占比基本维持在 ${fmtPct(last.advCost)}。`,
  `净利率从 ${fmtPct(first.netProfit)} 降到 ${fmtPct(last.netProfit)}，同时退款率升到 ${fmtPct(last.refundPercent)}，利润压力主要不是 ACOS 单点造成。`,
  `5/22 有快照总账数据，但每日原始沉淀缺 sales/inventory/ad/success/manifest，图中业务指标可看，沉淀状态仍按 blocked 标记。`,
];

const summaryCards = [
  ['最新销售额', fmtMoney1(last.orderSales), `较前一日 ${fmtMoney1(delta(last.orderSales, prev?.orderSales ?? null))}`],
  ['最新件数', last.saleNum?.toLocaleString('en-US') ?? '-', `较前一日 ${delta(last.saleNum, prev?.saleNum ?? null) ?? '-'}`],
  ['净利率', fmtPct(last.netProfit), `周内 ${fmtPp(delta(last.netProfit, first.netProfit))}`],
  ['ACOS', fmtPct(last.acos), `周内 ${fmtPp(delta(last.acos, first.acos))}`],
  ['退款率', fmtPct(last.refundPercent), `周内 ${fmtPp(delta(last.refundPercent, first.refundPercent))}`],
  ['沉淀完整天数', `${rows.filter(row => row.status.complete).length}/${rows.length}`, '5/22 待补原始沉淀'],
];

const labels = rows.map(row => row.shortDate);
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>本周数据变化可视化 ${START} 至 ${END}</title>
<style>
:root{--bg:#f5f7fa;--panel:#fff;--ink:#172033;--muted:#647084;--line:#d9dfeb;--grid:#e8ecf3;--blue:#2563eb;--green:#0f766e;--red:#dc2626;--amber:#b45309;--shadow:0 10px 26px rgba(25,33,52,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Microsoft YaHei","Segoe UI",Arial,sans-serif;line-height:1.45}.wrap{max-width:1280px;margin:0 auto;padding:28px 28px 44px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}h1{margin:0 0 8px;font-size:30px;line-height:1.15;letter-spacing:0}h2{margin:0;font-size:16px}.sub{color:var(--muted);font-size:14px}.badge{border:1px solid var(--line);background:#fff;border-radius:7px;padding:8px 10px;color:var(--muted);font-size:13px;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:16px 0}.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;box-shadow:var(--shadow);min-width:0}.card b{display:block;color:var(--muted);font-size:12px}.card strong{display:block;font-size:21px;margin:4px 0 2px;white-space:nowrap}.card span{color:var(--muted);font-size:12px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);padding:14px;min-width:0}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.legend{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px}.legend span{display:inline-flex;align-items:center;gap:5px}.legend i{display:inline-block;width:18px;height:3px;border-radius:999px}.grid{stroke:var(--grid);stroke-width:1}.axis{fill:var(--muted);font-size:12px}.axis-line{stroke:var(--line);stroke-width:1}.bar-label{fill:var(--ink);font-size:12px;font-weight:650}svg{width:100%;height:auto;display:block}
.tables{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--grid);padding:8px 6px;text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}th{color:var(--muted);font-weight:650}.status-ok{color:#15803d;font-weight:650}.status-bad{color:#dc2626;font-weight:650}.notes{margin-top:12px;color:var(--muted);font-size:13px}.notes b{color:var(--ink)}.notes ul{margin:8px 0 0 18px;padding:0}.notes li{margin:4px 0}
@media(max-width:1020px){.cards{grid-template-columns:repeat(3,1fr)}.grid2,.tables{grid-template-columns:1fr}header{display:block}.badge{display:inline-block;margin-top:10px}}@media(max-width:640px){.wrap{padding:18px 14px}.cards{grid-template-columns:1fr 1fr}.card strong{font-size:18px}h1{font-size:24px}th,td{font-size:12px;padding:7px 4px}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div>
    <h1>本周数据变化可视化</h1>
    <div class="sub">${START} 至 ${END}。口径：优先每日沉淀总账 CSV，5/22 使用最新 snapshot 总账补点；沉淀完整性单独标记。</div>
  </div>
  <div class="badge">生成时间 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}</div>
</header>
<section class="cards">${summaryCards.map(([label, value, note]) => `<div class="card"><b>${esc(label)}</b><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`).join('')}</section>
<div class="grid2">
${chart({ title: '销售额趋势', labels, colors: ['#2563eb'], valueFormat: fmtMoney, series: [{ name: '销售额', values: rows.map(row => row.orderSales) }] })}
${chart({ title: '订单件数趋势', labels, colors: ['#0f766e'], valueFormat: v => Math.round(v).toLocaleString('en-US'), series: [{ name: '件数', values: rows.map(row => row.saleNum) }] })}
${chart({ title: '利润与退款压力', labels, colors: ['#2563eb', '#dc2626'], valueFormat: fmtPct, series: [{ name: '净利率', values: rows.map(row => row.netProfit) }, { name: '退款率', values: rows.map(row => row.refundPercent) }] })}
${chart({ title: '广告效率', labels, colors: ['#dc2626', '#0891b2'], valueFormat: fmtPct, series: [{ name: 'ACOS', values: rows.map(row => row.acos) }, { name: '广告花费占比', values: rows.map(row => row.advCost) }] })}
${chart({ title: '0-5个月新品层', labels, colors: ['#2563eb', '#dc2626', '#0891b2'], valueFormat: fmtPct, series: [{ name: '0-5月净利率', values: rows.map(row => row.netProfit5m) }, { name: '0-5月ACOS', values: rows.map(row => row.acos5m) }, { name: '0-5月广告占比', values: rows.map(row => row.advCost5m) }] })}
${barChart({ title: '每日落地动作记录量', rows, key: 'liveCount', color: '#64748b', valueFormat: value => value === null ? '-' : Math.round(value).toLocaleString('en-US') })}
</div>
<div class="tables">
<section class="panel">
  <div class="panel-head"><h2>每日核心数据</h2></div>
  <table><thead><tr><th>日期</th><th>来源</th><th>销售额</th><th>件数</th><th>净利率</th><th>退款率</th><th>ACOS</th><th>广告占比</th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.source || 'missing')}</td><td>${fmtMoney1(row.orderSales)}</td><td>${row.saleNum?.toLocaleString('en-US') ?? '-'}</td><td>${fmtPct(row.netProfit)}</td><td>${fmtPct(row.refundPercent)}</td><td>${fmtPct(row.acos)}</td><td>${fmtPct(row.advCost)}</td></tr>`).join('')}
  </tbody></table>
</section>
<section class="panel">
  <div class="panel-head"><h2>沉淀完整性</h2></div>
  <table><thead><tr><th>日期</th><th>状态</th><th>sales</th><th>inv</th><th>ad</th><th>success</th><th>manifest</th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${esc(row.date)}</td><td class="${row.status.complete ? 'status-ok' : 'status-bad'}">${row.status.complete ? 'complete' : 'blocked'}</td><td>${row.status.salesCsv ? 'Y' : '-'}</td><td>${row.status.inventoryCsv ? 'Y' : '-'}</td><td>${row.status.adCsv ? 'Y' : '-'}</td><td>${row.status.successJson ? 'Y' : '-'}</td><td>${row.status.manifest ? 'Y' : '-'}</td></tr>`).join('')}
  </tbody></table>
</section>
</div>
<section class="panel notes">
  <b>解读</b>
  <ul>${insights.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
</section>
</div>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({ start: START, end: END, rows, insights }, null, 2));
fs.writeFileSync(OUT_HTML, html);
fs.writeFileSync(OUT_SVG, buildSummarySvg(rows, insights));
console.log(JSON.stringify({ html: OUT_HTML, json: OUT_JSON, svg: OUT_SVG, rows: rows.length }, null, 2));
