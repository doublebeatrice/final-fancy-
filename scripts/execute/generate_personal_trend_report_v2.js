const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const inputFile = process.argv[2] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const taskFile = process.argv[3] || path.join(ROOT, 'data', 'tasks', 'daily_task_board_2026-05-13.json');
const outDir = process.argv[4] || path.join(ROOT, '黄成喆个人数据趋势', '每日 近七天 数据趋势');

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

function pct(value, digits = 2) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function pp(current, reference) {
  if (current == null || reference == null) return '-';
  const delta = (num(current) - num(reference)) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pp`;
}

function money(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function compactMoney(value) {
  const n = num(value);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return money(n, 0);
}

function int(value) {
  return Math.round(num(value)).toLocaleString('en-US');
}

function dateFromSnapshot(snapshot) {
  const d = snapshot.exportedAt ? new Date(snapshot.exportedAt) : new Date();
  const local = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function rowTitle(row) {
  return String(row?.seller_title || '').trim();
}

function findCoreRows(rows) {
  const find = matcher => rows.find(row => matcher(rowTitle(row), row)) || {};
  const seller = code => find((title, row) => String(row?.seller_num || '').trim() === code || title.startsWith(`${code}-`));
  return {
    total: find(title => title === '所选编号汇总' || title.toLowerCase() === 'total'),
    hjGroup: find(title => title === 'HJ大组'),
    hj1: find(title => title === 'HJ1小组'),
    hj17: seller('HJ17'),
    hj171: seller('HJ171'),
    hj172: seller('HJ172'),
  };
}

function isReferenceRow(row) {
  const title = rowTitle(row);
  return title === '所选编号汇总' || title.toLowerCase() === 'total' || title === 'HJ大组' || title === 'HJ1小组';
}

function codeOf(row) {
  const title = rowTitle(row);
  if (title.startsWith('HJ171')) return 'HJ171';
  if (title.startsWith('HJ172')) return 'HJ172';
  if (title.startsWith('HJ17')) return 'HJ17';
  return title || '-';
}

function productStats(card, key) {
  const sp = card?.adStats?.[key] || {};
  const sb = card?.sbStats?.[key] || {};
  return {
    spend: num(sp.spend) + num(sb.spend),
    orders: num(sp.orders) + num(sb.orders),
    clicks: num(sp.clicks) + num(sb.clicks),
    impressions: num(sp.impressions) + num(sb.impressions),
  };
}

function productSalesEstimate(card, key) {
  return productStats(card, key).orders * Math.max(num(card.price), 1);
}

function productAcos(card, key) {
  const stats = productStats(card, key);
  const sales = productSalesEstimate(card, key);
  if (sales > 0) return stats.spend / sales;
  return stats.spend > 0 ? 99 : 0;
}

function cleanSku(value) {
  return String(value || '').trim().toUpperCase();
}

function getProductRows(cards, visuals = new Map()) {
  return (cards || []).filter(card => cleanSku(card.sku)).map(card => {
    const spend7 = productStats(card, '7d').spend;
    const orders7 = productStats(card, '7d').orders;
    const spend30 = productStats(card, '30d').spend;
    const orders30 = productStats(card, '30d').orders;
    const sku = cleanSku(card.sku);
    const visual = visuals.get(sku) || {};
    return {
      sku,
      asin: card.asin || '',
      price: num(card.price),
      units3: num(card.unitsSold_3d),
      units7: num(card.unitsSold_7d),
      units30: num(card.unitsSold_30d),
      invDays: num(card.invDays),
      profitRate: num(card.profitRate),
      netProfit: num(card.netProfit),
      yoy: num(card.yoyAsinPct ?? card.yoyUnitsPct),
      spend7,
      orders7,
      spend30,
      orders30,
      acos30: productAcos(card, '30d'),
      season: seasonText(card),
      label: productLabel(card),
      imageUrl: card.listing?.mainImageUrl || card.productProfile?.mainImageUrl || visual.imageUrl || '',
      title: card.listing?.title || visual.title || '',
    };
  });
}

function productLabel(card) {
  const profile = card?.productProfile || {};
  const labels = [];
  if (profile.positioning) labels.push(profile.positioning);
  if (Array.isArray(profile.productTypes)) labels.push(...profile.productTypes.slice(0, 2));
  const text = [...new Set(labels.filter(Boolean))].join(' / ');
  return text || '-';
}

function seasonText(card) {
  const windows = card?.seasonWindows || card?.seasonality || card?.productProfile?.seasonality || [];
  if (Array.isArray(windows) && windows.length) {
    return windows.map(item => {
      if (typeof item === 'string') return item;
      return [item.name, item.stage].filter(Boolean).join(':');
    }).filter(Boolean).slice(0, 3).join(' / ');
  }
  const holiday = card?.productLabels?.holiday_info;
  return holiday || '-';
}

function deltaRatio(current, previous) {
  const prev = num(previous);
  if (!prev) return null;
  return (num(current) - prev) / Math.abs(prev);
}

function adRows(rows) {
  return (rows || []).filter(row => cleanSku(row.sku)).map(row => {
    const spend = num(row['30_cost'] ?? row.cost);
    const spendPrev = num(row['30_cost_prev']);
    const sales = num(row['30_sales'] ?? row.sales);
    const salesPrev = num(row['30_sales_prev']);
    const orders = num(row['30_orders'] ?? row.orders);
    const ordersPrev = num(row['30_orders_prev']);
    const acos = row['30_acos'] == null ? (sales > 0 ? spend / sales : spend > 0 ? 99 : 0) : num(row['30_acos']);
    return {
      sku: cleanSku(row.sku),
      asin: row.asin || '',
      spend,
      spendPrev,
      sales,
      salesPrev,
      orders,
      ordersPrev,
      acos,
      spendDelta: deltaRatio(spend, spendPrev),
      salesDelta: deltaRatio(sales, salesPrev),
      orderDelta: deltaRatio(orders, ordersPrev),
    };
  });
}

function loadJson(file, fallback) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function taskRows(board) {
  return Array.isArray(board?.tasks) ? board.tasks : [];
}

function table(headers, rows, empty = '暂无命中项。') {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function parseMetric(value) {
  const text = String(value || '').replace(/,/g, '').trim();
  if (!text) return null;
  const n = Number(text.replace('%', ''));
  if (!Number.isFinite(n)) return null;
  return text.includes('%') ? n / 100 : n;
}

function svgLineChart(title, labels, series) {
  const width = 760;
  const height = 330;
  const pad = { left: 54, right: 42, top: 44, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = series.flatMap(item => item.values).filter(value => value != null && Number.isFinite(value));
  if (!labels.length || !values.length) return `<div class="empty">暂无足够趋势数据。</div>`;
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const x = index => labels.length === 1 ? pad.left + plotW / 2 : pad.left + (plotW * index) / (labels.length - 1);
  const y = value => pad.top + plotH - ((value - min) / span) * plotH;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const gy = pad.top + plotH * ratio;
    const value = max - span * ratio;
    return `<line x1="${pad.left}" y1="${gy.toFixed(1)}" x2="${width - pad.right}" y2="${gy.toFixed(1)}" class="gridline"/><text x="8" y="${(gy + 4).toFixed(1)}" class="axis-label">${pct(value, 1)}</text>`;
  }).join('');
  const paths = series.map(item => {
    const points = item.values.map((value, index) => value == null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
    const d = points.reduce((parts, point) => {
      if (!point) return parts;
      parts.push(`${parts.length ? 'L' : 'M'}${point}`);
      return parts;
    }, []).join(' ');
    const circles = item.values.map((value, index) => value == null ? '' : `<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="4" fill="${item.color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round"/>${circles}`;
  }).join('');
  const legend = series.map((item, index) => {
    const lx = pad.left + index * 110;
    return `<rect x="${lx}" y="${height - 28}" width="11" height="11" fill="${item.color}" rx="3"/><text x="${lx + 16}" y="${height - 19}" class="legend">${esc(item.name)}</text>`;
  }).join('');
  const xLabels = labels.map((label, index) => `<text x="${x(index).toFixed(1)}" y="${height - 12}" class="axis-label" text-anchor="middle">${esc(label)}</text>`).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><text x="${pad.left}" y="25" class="svg-title">${esc(title)}</text>${grid}${xLabels}${paths}${legend}</svg>`;
}

function svgHorizontalBars(title, rows, options = {}) {
  const data = rows
    .map(row => ({ ...row, value: num(row.value) }))
    .filter(row => row.label && Number.isFinite(row.value))
    .slice(0, options.limit || 12);
  if (!data.length) return `<div class="empty">暂无可视化数据。</div>`;
  const width = options.width || 760;
  const left = options.left || 145;
  const right = 42;
  const top = 48;
  const rowH = options.rowH || 25;
  const height = top + data.length * rowH + 28;
  const max = Math.max(...data.map(row => Math.abs(row.value)), 1);
  const plotW = width - left - right;
  const color = options.color || '#2563eb';
  const bars = data.map((row, index) => {
    const y = top + index * rowH;
    const w = Math.max(2, plotW * Math.abs(row.value) / max);
    const label = options.format ? options.format(row.value, row) : row.value.toFixed(1);
    return `<text x="12" y="${(y + 13).toFixed(1)}" class="axis-label">${esc(row.label)}</text><rect x="${left}" y="${(y + 2).toFixed(1)}" width="${w.toFixed(1)}" height="15" rx="8" fill="${row.color || color}" opacity="0.84"/><text x="${(left + w + 8).toFixed(1)}" y="${(y + 14).toFixed(1)}" class="bar-label">${esc(label)}</text>`;
  }).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><text x="${left}" y="25" class="svg-title">${esc(title)}</text>${bars}</svg>`;
}

function svgGroupedBars(title, rows) {
  const data = rows.slice(0, 10);
  if (!data.length) return `<div class="empty">暂无广告对比数据。</div>`;
  const width = 760;
  const left = 96;
  const top = 46;
  const rowH = 28;
  const height = top + data.length * rowH + 46;
  const max = Math.max(...data.flatMap(row => [num(row.spend), num(row.sales)]), 1);
  const scale = value => Math.max(2, 520 * num(value) / max);
  const rowsSvg = data.map((row, index) => {
    const y = top + index * rowH;
    const spendW = scale(row.spend);
    const salesW = scale(row.sales);
    return `<text x="12" y="${y + 16}" class="axis-label">${esc(row.sku)}</text><rect x="${left}" y="${y + 3}" width="${spendW.toFixed(1)}" height="9" rx="5" fill="#b91c1c" opacity=".82"/><rect x="${left}" y="${y + 15}" width="${salesW.toFixed(1)}" height="9" rx="5" fill="#15803d" opacity=".82"/><text x="${left + Math.max(spendW, salesW) + 8}" y="${y + 16}" class="bar-label">${esc(`花费 ${compactMoney(row.spend)} / 销售 ${compactMoney(row.sales)}`)}</text>`;
  }).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><text x="${left}" y="25" class="svg-title">${esc(title)}</text><rect x="${left}" y="${height - 26}" width="11" height="11" fill="#b91c1c" rx="3"/><text x="${left + 16}" y="${height - 17}" class="legend">广告花费</text><rect x="${left + 86}" y="${height - 26}" width="11" height="11" fill="#15803d" rx="3"/><text x="${left + 102}" y="${height - 17}" class="legend">广告销售</text>${rowsSvg}</svg>`;
}

function tr(cells, cls = '') {
  return `<tr${cls ? ` class="${cls}"` : ''}>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
}

function tag(text, cls = '') {
  return `<span class="tag ${cls}">${esc(text)}</span>`;
}

function sentenceList(items) {
  return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function sellerRow(row, totalSales) {
  const sales = num(row.order_sales);
  const share = totalSales ? sales / totalSales : 0;
  const flags = [];
  if (num(row.refund_percent) >= 0.08) flags.push(tag('退货高', 'bad'));
  if (num(row.net_profit) < 0.12) flags.push(tag('净利低', 'bad'));
  else if (num(row.net_profit) < 0.18) flags.push(tag('净利偏低', 'warn'));
  if (num(row.ACOS) >= 0.25) flags.push(tag('ACOS 高', 'warn'));
  if (num(row.SP) >= 0.4) flags.push(tag('广告占比高', 'warn'));
  if (num(row.qty_yoy_over_1_year) <= -0.3) flags.push(tag('同比下滑', 'bad'));
  return tr([
    esc(codeOf(row)),
    money(sales, 2),
    pct(share, 1),
    int(row.sale_num),
    pct(row.net_profit),
    pct(row.refund_percent),
    pct(row.ACOS),
    pct(row.SP),
    pct(row.qty_yoy_over_1_year),
    flags.join(' ') || tag('观察', 'ok'),
  ]);
}

function skuVisualCell(row) {
  const image = row.imageUrl
    ? `<img class="thumb" src="${esc(row.imageUrl)}" loading="lazy" alt="${esc(row.sku)}"/>`
    : `<div class="thumb placeholder">${esc(row.sku.slice(0, 2))}</div>`;
  const title = row.title ? `<div class="smalltxt">${esc(row.title).slice(0, 96)}</div>` : '';
  return `<div class="skurow">${image}<div><b>${esc(row.sku)}</b><div class="muted smalltxt">${esc(row.asin)}</div>${title}</div></div>`;
}

function productRow(row, reason) {
  return tr([
    skuVisualCell(row),
    int(row.units7),
    int(row.units30),
    int(row.invDays),
    pct(row.profitRate),
    pct(row.yoy),
    money(row.spend7),
    int(row.orders7),
    money(row.spend30),
    int(row.orders30),
    row.acos30 >= 90 ? '无订单消耗' : pct(row.acos30),
    esc(reason || row.season || '-'),
  ]);
}

function taskRow(task) {
  const facts = Array.isArray(task.factsConsidered) ? task.factsConsidered.join('；') : '';
  const signals = Array.isArray(task.possibleSignals)
    ? task.possibleSignals.map(signal => signal.type).slice(0, 4).join(' / ')
    : '';
  return tr([
    esc(task.priority || '-'),
    esc(task.sku || '-'),
    esc(task.asin || '-'),
    esc(task.primaryTaskType || '-'),
    esc(task.decisionSummary || task.priorityReason || '-'),
    esc(facts || signals || '-'),
  ]);
}

function adRow(row) {
  const flags = [];
  if (row.acos >= 0.25) flags.push(tag('ACOS 高', 'warn'));
  if (row.spendDelta != null && row.spendDelta >= 0.5 && (row.orderDelta == null || row.orderDelta < 0.2)) flags.push(tag('花费先涨', 'bad'));
  if (row.salesDelta != null && row.salesDelta < -0.2 && row.spendDelta != null && row.spendDelta > -0.1) flags.push(tag('销售掉但花费没降', 'bad'));
  if (!row.orders && row.spend > 20) flags.push(tag('有消耗无订单', 'bad'));
  return tr([
    esc(row.sku),
    money(row.spend),
    money(row.sales),
    int(row.orders),
    pct(row.acos),
    row.spendDelta == null ? '-' : pct(row.spendDelta),
    row.salesDelta == null ? '-' : pct(row.salesDelta),
    row.orderDelta == null ? '-' : pct(row.orderDelta),
    flags.join(' ') || tag('正常跟踪', 'ok'),
  ]);
}

function readPriorAutoMetrics(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(name => /^2026-05-\d{2}\.html$/.test(name))
    .sort()
    .slice(-7);
  return files.map(name => {
    const file = path.join(dir, name);
    const html = fs.readFileSync(file, 'utf8');
    const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const kpi = label => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = html.match(new RegExp(`${escaped}</div>\\s*<div class="kpi-value[^"]*">([^<]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    const metric = label => {
      const fromKpi = kpi(label);
      if (fromKpi) return fromKpi;
      const idx = text.indexOf(label);
      if (idx < 0) return '';
      return text.slice(idx, idx + 80).replace(label, '').trim().split(' ')[0] || '';
    };
    return {
      date,
      sales: metric('销售额'),
      units: metric('销量'),
      profit: metric('净利'),
      refund: metric('退货率'),
      acos: metric('ACOS'),
      roas: metric('ROAS'),
    };
  });
}

function readHistoricalSkuVisuals(dir) {
  const visuals = new Map();
  if (!fs.existsSync(dir)) return visuals;
  const files = fs.readdirSync(dir)
    .filter(name => /^2026-05-\d{2}\.html$/.test(name) && name !== '2026-05-14.html')
    .sort()
    .reverse();
  for (const name of files) {
    const html = fs.readFileSync(path.join(dir, name), 'utf8');
    const regex = /<img class="thumb" src="([^"]+)"[^>]*>\s*<div><b>([^<]+)<\/b><div class="muted smalltxt">([^<]*)<\/div><div class="smalltxt">([^<]*)<\/div>/g;
    let match;
    while ((match = regex.exec(html))) {
      const sku = cleanSku(match[2]);
      if (!sku || visuals.has(sku)) continue;
      visuals.set(sku, {
        imageUrl: match[1].replace(/&amp;/g, '&'),
        asin: match[3],
        title: match[4].replace(/&amp;/g, '&').replace(/&#39;/g, "'"),
      });
    }
  }
  return visuals;
}

function generateReport(options = {}) {
  const selectedInputFile = options.inputFile || inputFile;
  const selectedTaskFile = options.taskFile || taskFile;
  const selectedOutDir = options.outDir || outDir;
  const snapshot = loadJson(selectedInputFile, null);
  if (!snapshot) throw new Error(`Snapshot not found: ${selectedInputFile}`);
  const board = loadJson(selectedTaskFile, {});
  const date = options.date || dateFromSnapshot(snapshot);
  const salesRows = snapshot.sellerSalesRows || [];
  const core = findCoreRows(salesRows);
  const total = core.total || {};
  const totalSales = num(total.order_sales);
  const historicalVisuals = readHistoricalSkuVisuals(selectedOutDir);
  const productRows = getProductRows(snapshot.productCards || [], historicalVisuals);
  const ads = adRows(snapshot.adSkuSummaryRows || []);
  const tasks = taskRows(board);

  const detailSellerRows = salesRows
    .filter(row => !isReferenceRow(row) && num(row.order_sales) > 0)
    .sort((a, b) => {
      const score = row => num(row.order_sales) / 1000
        + (num(row.refund_percent) >= 0.08 ? 40 : 0)
        + (num(row.net_profit) < 0.12 ? 35 : 0)
        + (num(row.ACOS) >= 0.25 ? 25 : 0)
        + (num(row.qty_yoy_over_1_year) <= -0.3 ? 25 : 0);
      return score(b) - score(a);
    })
    .slice(0, 18);

  const stopLoss = productRows
    .filter(row => (row.spend7 >= 5 && row.orders7 === 0) || row.profitRate < 0 || row.acos30 >= 0.3)
    .sort((a, b) => b.spend30 - a.spend30 || a.profitRate - b.profitRate)
    .slice(0, 18);

  const oldDecline = productRows
    .filter(row => row.units30 >= 20 && row.yoy <= -0.3)
    .sort((a, b) => a.yoy - b.yoy || b.units30 - a.units30)
    .slice(0, 16);

  const inventoryTight = productRows
    .filter(row => row.units30 >= 20 && row.invDays > 0 && row.invDays <= 21)
    .sort((a, b) => a.invDays - b.invDays || b.units30 - a.units30)
    .slice(0, 12);

  const inventoryPressure = productRows
    .filter(row => row.invDays >= 180 && row.units30 <= 10)
    .sort((a, b) => b.invDays - a.invDays)
    .slice(0, 12);

  const healthyScale = productRows
    .filter(row => row.profitRate >= 0.18 && row.units7 >= 15 && row.invDays >= 25 && row.orders30 > 0 && row.acos30 > 0 && row.acos30 <= 0.22)
    .sort((a, b) => b.units7 - a.units7 || a.acos30 - b.acos30)
    .slice(0, 12);

  const adAnomalies = ads
    .filter(row => row.spend >= 80 && (row.acos >= 0.25 || !row.orders || (row.spendDelta != null && row.spendDelta >= 0.5 && (row.orderDelta == null || row.orderDelta < 0.2))))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 18);

  const p0Tasks = tasks.filter(task => task.priority === 'P0').slice(0, 18);
  const p1Tasks = tasks.filter(task => task.priority === 'P1').slice(0, 12);
  const prior = readPriorAutoMetrics(selectedOutDir);
  const trendPoints = prior
    .map(row => ({
      date: row.date.slice(5),
      profit: parseMetric(row.profit),
      refund: parseMetric(row.refund),
      acos: parseMetric(row.acos),
    }))
    .filter(row => row.date && (row.profit != null || row.refund != null || row.acos != null));
  if (!trendPoints.some(row => row.date === date.slice(5))) {
    trendPoints.push({
      date: date.slice(5),
      profit: num(total.net_profit),
      refund: num(total.refund_percent),
      acos: num(total.ACOS),
    });
  }
  const coreChartRows = [core.hj171, core.hj17, core.hj172]
    .filter(row => row && Object.keys(row).length)
    .map(row => ({
      label: codeOf(row),
      value: num(row.order_sales),
      color: codeOf(row) === 'HJ171' ? '#2563eb' : codeOf(row) === 'HJ17' ? '#0f766e' : '#b45309',
    }));
  const riskBars = stopLoss.map(row => ({
    label: row.sku,
    value: row.spend30 + (row.profitRate < 0 ? 400 : 0) + (row.acos30 >= 0.3 ? 250 : 0),
  }));
  const actionDistribution = Object.entries(tasks.reduce((acc, task) => {
    const key = task.primaryTaskType || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}))
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const currentTrendRow = Object.keys(total).length ? {
    date,
    sales: money(totalSales),
    units: int(total.sale_num),
    profit: pct(total.net_profit),
    refund: pct(total.refund_percent),
    acos: pct(total.ACOS),
    roas: money(total.ROAS),
  } : null;
  const trendTableRows = currentTrendRow
    ? [...prior.filter(row => row.date !== date), currentTrendRow].slice(-8)
    : prior;

  const title = `黄成喆每日经营复盘 ${date}（V2 手写风格沉淀版）`;
  const headline = '每日经营复盘：今天不是缺数据，是利润、退货、广告和老品同时要拆开处理';
  const narrativeBullets = [
    `总盘销售额 <b>${money(totalSales)}</b>，销量 <b>${int(total.sale_num)}</b>，净利 <b>${pct(total.net_profit)}</b>，已经不是单看销售额能判断好坏的日子。`,
    `退货率 <b>${pct(total.refund_percent)}</b>，比 HJ大组口径高 <b>${pp(total.refund_percent, core.hjGroup?.refund_percent)}</b>；今天要把退货 SKU 和广告 SKU 分开处理，不能只看总盘均值。`,
    `ACOS <b>${pct(total.ACOS)}</b>、广告销售占比 <b>${pct(total.SP)}</b>，说明投放仍在贡献订单，但边际质量需要下钻到 SKU 和活动层。`,
    `任务池今天识别 <b>${tasks.length}</b> 个候选动作，其中 P0 <b>${p0Tasks.length}</b> 个先处理，P1 <b>${p1Tasks.length}</b> 个排队验证。`,
  ];

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  :root {
    --ink: #202124;
    --muted: #5f6368;
    --line: #d8dee4;
    --paper: #fffdf8;
    --soft: #f5f7fb;
    --accent: #1f6feb;
    --bad: #b42318;
    --warn: #9a6700;
    --ok: #1a7f37;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eef2f6;
    color: var(--ink);
    font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
    line-height: 1.65;
  }
  .page {
    max-width: 1240px;
    margin: 0 auto;
    background: var(--paper);
    min-height: 100vh;
    padding: 34px 42px 54px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 30px;
    line-height: 1.25;
    letter-spacing: 0;
  }
  h2 {
    margin: 34px 0 12px;
    padding-left: 12px;
    border-left: 5px solid var(--accent);
    font-size: 21px;
    line-height: 1.35;
    letter-spacing: 0;
  }
  h3 {
    margin: 22px 0 8px;
    font-size: 17px;
  }
  .subhead { color: var(--muted); margin-bottom: 20px; }
  .conclusion {
    border: 1px solid #d0d7de;
    background: #ffffff;
    padding: 18px 20px;
    margin: 18px 0 22px;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0 12px;
  }
  .metric {
    border: 1px solid var(--line);
    background: var(--soft);
    padding: 12px;
    min-height: 86px;
  }
  .metric b { display: block; font-size: 20px; line-height: 1.25; margin-top: 6px; }
  .metric span { color: var(--muted); font-size: 12px; }
  .note {
    color: var(--muted);
    font-size: 14px;
    margin: 8px 0 12px;
  }
  .chart-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin: 14px 0 18px;
  }
  .svg-chart {
    display: block;
    width: 100%;
    height: auto;
    background: #fff;
    border: 1px solid var(--line);
  }
  .gridline { stroke: #e5e7eb; stroke-width: 1; }
  .axis-label { font-size: 12px; fill: #5f6368; }
  .point-label, .bar-label { font-size: 12px; fill: #334155; font-weight: 700; }
  .legend { font-size: 12px; fill: #334155; }
  .svg-title { font-size: 16px; fill: #202124; font-weight: 800; }
  .skurow {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    min-width: 220px;
  }
  .thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border: 1px solid var(--line);
    background: #fff;
  }
  .thumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    background: #f1f4f8;
  }
  .muted { color: var(--muted); }
  .smalltxt { font-size: 12px; line-height: 1.35; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 18px;
    font-size: 13px;
    background: #fff;
  }
  th, td {
    border: 1px solid var(--line);
    padding: 7px 8px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f1f4f8;
    font-weight: 700;
    white-space: nowrap;
  }
  td { word-break: break-word; }
  .tag {
    display: inline-block;
    border: 1px solid var(--line);
    padding: 1px 6px;
    margin: 1px 2px 1px 0;
    border-radius: 2px;
    font-size: 12px;
    color: var(--muted);
    background: #fff;
  }
  .tag.bad { color: var(--bad); border-color: #f1aeb5; background: #fff5f5; }
  .tag.warn { color: var(--warn); border-color: #f0d98c; background: #fff8db; }
  .tag.ok { color: var(--ok); border-color: #a6d9ad; background: #f0fff4; }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .box {
    border: 1px solid var(--line);
    background: #fff;
    padding: 14px;
  }
  .empty {
    border: 1px dashed var(--line);
    color: var(--muted);
    padding: 12px;
    background: #fff;
  }
  .footer {
    margin-top: 36px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
  }
  @media (max-width: 900px) {
    .page { padding: 24px 16px 40px; }
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .chart-grid { grid-template-columns: 1fr; }
    .grid2 { grid-template-columns: 1fr; }
    table { font-size: 12px; }
  }
</style>
</head>
<body>
<main class="page">
  <h1>${esc(headline)}</h1>
  <div class="subhead">日期：${esc(date)}　｜　数据源：销售核心 + inventory snapshot + 广告 SKU 汇总 + 任务池　｜　版本：V2 手写风格沉淀版</div>

  <section class="conclusion">
    <h2>先给结论：今天要按“止血、拆编号、再迁移预算”的顺序做</h2>
    ${sentenceList(narrativeBullets)}
    <div class="metrics">
      <div class="metric"><span>销售额</span><b>${money(totalSales)}</b></div>
      <div class="metric"><span>销量</span><b>${int(total.sale_num)}</b></div>
      <div class="metric"><span>净利率</span><b>${pct(total.net_profit)}</b></div>
      <div class="metric"><span>退货率</span><b>${pct(total.refund_percent)}</b></div>
      <div class="metric"><span>ACOS</span><b>${pct(total.ACOS)}</b></div>
      <div class="metric"><span>广告销售占比</span><b>${pct(total.SP)}</b></div>
    </div>
  </section>

  <h2>一、核心图表｜沉淀不能只剩文字</h2>
  <div class="note">这部分把原报告里最重要的可视化补回来：总盘趋势、编号贡献、SKU 风险优先级、动作池分布和广告花费/销售对比。</div>
  <div class="chart-grid">
    ${svgLineChart('总盘趋势：净利、退货、ACOS 必须同屏看', trendPoints.map(row => row.date), [
      { name: '净利', color: '#2563eb', values: trendPoints.map(row => row.profit) },
      { name: '退货率', color: '#b45309', values: trendPoints.map(row => row.refund) },
      { name: 'ACOS', color: '#6d28d9', values: trendPoints.map(row => row.acos) },
    ])}
    ${svgHorizontalBars('编号销售贡献：先看主盘是谁', coreChartRows, { color: '#2563eb', format: value => compactMoney(value), left: 118 })}
  </div>
  <div class="chart-grid">
    ${svgHorizontalBars('SKU 止血优先级：花费 + 负利润 + 高 ACOS', riskBars, { color: '#b91c1c', format: value => value.toFixed(0), left: 118 })}
    ${svgHorizontalBars('动作池分布：先止血，再验证，再迁移预算', actionDistribution, { color: '#0f766e', format: value => int(value), left: 190 })}
  </div>
  <div class="chart-grid">
    ${svgGroupedBars('广告异常 SKU：花费和销售放在一起看', adAnomalies)}
    ${svgHorizontalBars('库存压力：高库存天数但动销弱', inventoryPressure.map(row => ({ label: row.sku, value: row.invDays })), { color: '#b45309', format: value => `${int(value)}天`, left: 118 })}
  </div>

  <h2>二、自身趋势沉淀｜先看这几天的自动沉淀口径，再判断今天是不是日波动</h2>
  <div class="note">这里保留近几天自动沉淀 HTML 里的核心指标，目的不是替代财务口径，而是让每天的经营复盘可以连续追踪。</div>
  ${table(['日期', '销售额', '销量', '净利', '退货率', 'ACOS', 'ROAS'], trendTableRows.map(row => tr([
    esc(row.date), esc(row.sales), esc(row.units), esc(row.profit), esc(row.refund), esc(row.acos), esc(row.roas),
  ])), '没有找到历史自动版 HTML。')}

  <h2>三、编号结构｜HJ171 是主盘，HJ17 要看广告质量，HJ172 先看退货异常</h2>
  <div class="note">今天不能只写“黄成喆整体”。HJ171 承担主要销售额，HJ17 的广告效率更影响利润，HJ172 虽然销售额小，但退货率异常必须单独标记。</div>
  ${table(['编号', '销售额', '占比', '销量', '净利率', '退货率', 'ACOS', '广告占比', '同比', '判断'], [core.hj171, core.hj17, core.hj172].filter(row => row && Object.keys(row).length).map(row => sellerRow(row, totalSales)))}

  <h2>四、编号/开发线异常池｜今天真正要拆的是这些行，不是总盘均值</h2>
  <div class="note">按销售额、退货率、净利、ACOS、广告占比、同比下滑综合排序。它负责告诉我们“问题在哪个编号/开发线”，SKU 表负责告诉我们“具体动谁”。</div>
  ${table(['编号', '销售额', '占比', '销量', '净利率', '退货率', 'ACOS', '广告占比', '同比', '标签'], detailSellerRows.map(row => sellerRow(row, totalSales)))}

  <h2>五、节点预算迁移｜母亲节后不能继续按节前打法平均花钱</h2>
  <div class="grid2">
    <div class="box">
      <h3>今天的迁移判断</h3>
      ${sentenceList([
        '母亲节节点已经进入尾声，仍有订单的节点 SKU 可以保留低预算承接，但不能再用节前加速逻辑。',
        '护士/医疗、毕业季、父亲节、夏季/户外这些词要分开看：有库存、有利润、有订单的 SKU 才能承接预算。',
        '凡是 7 天有消耗无订单、利润为负、库存不足的 SKU，今天先止血，不进入节点加投池。',
      ])}
    </div>
    <div class="box">
      <h3>今天的预算顺序</h3>
      ${sentenceList([
        '第一层：P0 止血，减少无订单消耗和负利润 SKU 的继续放大。',
        '第二层：保留健康 SKU 的有效词和有效活动，优先吃现有转化。',
        '第三层：再给毕业季/父亲节/夏季预热，预算从旧节点低效项里迁移出来。',
      ])}
    </div>
  </div>

  <h2>六、今日动作池总览｜先按优先级执行，不要平均用力</h2>
  <div class="note">任务池是机器筛出来的候选动作，执行前仍要确认广告实体层级、冷却期和库存承接；但它比只看一个总盘数字更适合每天沉淀。</div>
  ${table(['优先级', 'SKU', 'ASIN', '任务类型', '动作判断', '证据'], p0Tasks.map(taskRow))}
  <h3>P1 排队验证池</h3>
  ${table(['优先级', 'SKU', 'ASIN', '任务类型', '动作判断', '证据'], p1Tasks.map(taskRow))}

  <h2>七、具体 SKU 看板｜这部分负责“今天动谁、为什么动”</h2>
  <h3>止血池：有消耗无订单、负利润或 ACOS 偏高</h3>
  ${table(['SKU', '7天销量', '30天销量', '库存天数', '利润率', '同比', '7天花费', '7天订单', '30天花费', '30天订单', '30天ACOS', '原因'], stopLoss.map(row => {
    const reasons = [];
    if (row.spend7 >= 5 && row.orders7 === 0) reasons.push('7天有消耗无订单');
    if (row.profitRate < 0) reasons.push('利润为负');
    if (row.acos30 >= 0.3 && row.acos30 < 90) reasons.push('30天ACOS高');
    if (row.acos30 >= 90) reasons.push('有消耗无订单');
    return productRow(row, reasons.join(' / '));
  }))}

  <h3>老品下滑专题：自己和自己比，不能被总盘上涨掩盖</h3>
  ${table(['SKU', '7天销量', '30天销量', '库存天数', '利润率', '同比', '7天花费', '7天订单', '30天花费', '30天订单', '30天ACOS', '原因'], oldDecline.map(row => productRow(row, '同比下滑，需要看 listing、价格、退货和广告词是否一起变差')))}

  <h3>库存刹车池：卖得动但库存天数紧</h3>
  ${table(['SKU', '7天销量', '30天销量', '库存天数', '利润率', '同比', '7天花费', '7天订单', '30天花费', '30天订单', '30天ACOS', '原因'], inventoryTight.map(row => productRow(row, '库存承接紧，广告不能盲目加速')))}

  <h3>库存压力池：库存重但 30 天动销弱</h3>
  ${table(['SKU', '7天销量', '30天销量', '库存天数', '利润率', '同比', '7天花费', '7天订单', '30天花费', '30天订单', '30天ACOS', '原因'], inventoryPressure.map(row => productRow(row, '库存天数高，先找清仓/低预算承接，不进加投池')))}

  <h3>健康加投观察池：有订单、有利润、有库存承接</h3>
  ${table(['SKU', '7天销量', '30天销量', '库存天数', '利润率', '同比', '7天花费', '7天订单', '30天花费', '30天订单', '30天ACOS', '原因'], healthyScale.map(row => productRow(row, '可观察加预算或扩词，但先确认节点相关性')))}

  <h2>八、广告 SKU 汇总异常池｜花费、订单、销售要一起看</h2>
  <div class="note">这一段直接来自广告 SKU 30 天汇总，用来找“花费先涨但订单没跟”“销售掉了但花费没降”“ACOS 偏高”的 SKU。</div>
  ${table(['SKU', '30天花费', '30天销售', '30天订单', '30天ACOS', '花费环比', '销售环比', '订单环比', '标签'], adAnomalies.map(adRow))}

  <h2>九、今天执行顺序｜不要被报告带散</h2>
  ${sentenceList([
    '先处理 P0 止血池：7 天有消耗无订单、利润为负、库存紧的 SKU，先降预算/降 bid/暂停低效词，执行前确认广告实体。',
    '再看编号异常池：HJ171 主盘看利润和退货，HJ17 看 ACOS 与广告占比，HJ172 单独查退货原因。',
    '第三步才做健康 SKU 加投：只给有利润、有库存、有订单的 SKU，节点相关词优先，泛词谨慎。',
    '最后补人工复查：退货异常、老品同比下滑、库存压力 SKU 要形成明天继续追踪的 watchlist。',
  ])}

  <h2>十、以后日报固定结构｜沉淀要同时有细节和连续性</h2>
  ${sentenceList([
    '每天固定保留：总盘、编号、开发线/SKU、广告、库存、节点、执行顺序。',
    '每个异常池都要写入“为什么进池”，不只列 SKU。',
    '原始 CSV/Excel、snapshot JSON、manifest 和 HTML 都要保留；HTML 是可读视图，不是唯一数据库。',
    '今天这个 V2 是对齐 5/8、5/11 手写复盘结构的版本，后续默认生成器应以它为基准继续细化。',
  ])}

  <div class="footer">
    生成时间：${esc(snapshot.exportedAt || new Date().toISOString())}。
    数据完整性提示：今天手动下载的三件原始文件仍需要继续归档；本报告使用浏览器登录态抓到的结构化 snapshot 和派生 CSV 生成。
  </div>
</main>
</body>
</html>`;

  fs.mkdirSync(selectedOutDir, { recursive: true });
  const outFile = path.join(selectedOutDir, `${date}.html`);
  fs.writeFileSync(outFile, `\uFEFF${html}`, 'utf8');
  return outFile;
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (String(args[i]).startsWith('--')) {
      if (args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1;
    } else {
      positional.push(args[i]);
    }
  }
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  console.log(generateReport({
    inputFile: get('--snapshot') || positional[0] || inputFile,
    taskFile: get('--tasks') || positional[1] || taskFile,
    outDir: get('--out-dir') || positional[2] || outDir,
    date: get('--date') || '',
  }));
}

if (require.main === module) {
  main();
}

module.exports = {
  generateReport,
};
