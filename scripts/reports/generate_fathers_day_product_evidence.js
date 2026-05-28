const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUSINESS_DATE = '2026-05-27';
const OUT_HTML = path.join(ROOT, 'data', 'tasks', `fathers_day_product_evidence_${BUSINESS_DATE}.html`);
const IMAGE_DIR = path.join(ROOT, 'data', 'tasks', 'inventory_season_image_review_2026-05-25', 'images');

const CURRENT_SOURCE = path.join(ROOT, 'data', 'tasks', 'manual_inventory_conditions_preview_2026-05-26.json');
const CLOUD_APPLY_SOURCE = path.join(ROOT, 'data', 'tasks', 'manual_inventory_conditions_cloud_apply_2026-05-26.json');
const CLOUD_VERIFY_SOURCE = path.join(ROOT, 'data', 'tasks', 'manual_inventory_conditions_refresh_verify_2026-05-26.json');
const IMAGE_FIRST_SOURCE = path.join(ROOT, 'data', 'tasks', 'inventory_season_saved_conditions_image_first_2026-05-25.json');
const OLD_AUTO_SOURCE = path.join(ROOT, 'data', 'tasks', 'inventory_season_saved_conditions_2026-05-25.json');
const OPS_SOURCE = path.join(ROOT, 'data', 'tasks', 'all_sku_operating_review_2026-05-26.json');
const LIVE_AD_SOURCE = path.join(ROOT, 'data', 'tasks', 'over_budget_live_rows_2026-05-27.json');

const FATHER_ADJACENT = '\u7236\u4eb2\u8282\u8e6d';
const FATHER_PURE = '\u7236\u4eb2\u8282-\u7eaf';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function money(value, digits = 2) {
  return `$${num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function pct(value, digits = 1) {
  return `${(num(value) * 100).toFixed(digits)}%`;
}

function int(value) {
  return Math.round(num(value)).toLocaleString('en-US');
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseCsvLine(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

function readCsv(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const rows = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === '"' && quoted && next === '"') {
      current += ch + next;
      i += 1;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === '\n' && !quoted) {
      rows.push(current.replace(/\r$/, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) rows.push(current.replace(/\r$/, ''));
  const headers = parseCsvLine(rows.shift() || '');
  return rows.filter(Boolean).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function findChineseTrendRawCsv() {
  const trendRoot = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .find(name => /[^\x00-\x7F]/.test(name) && name.includes('\u4e2a\u4eba\u6570\u636e\u8d8b\u52bf'));
  if (!trendRoot) throw new Error('Cannot find trend data folder.');
  const rawDir = path.join(ROOT, trendRoot, '\u539f\u6570\u636e', '\u539f\u65e5\u6570\u636e', '5-25');
  const file = path.join(rawDir, 'inv_auto_filtered_2026-05-25-14-53-36.csv');
  if (!fs.existsSync(file)) throw new Error(`Inventory CSV missing: ${file}`);
  return file;
}

function localImageSrc(sku) {
  const file = path.join(IMAGE_DIR, `${sku}.jpg`);
  if (!fs.existsSync(file)) return '';
  return path.relative(path.dirname(OUT_HTML), file).replace(/\\/g, '/');
}

function shortTitle(value) {
  const valueText = text(value).replace(/\s+/g, ' ');
  return valueText.length > 132 ? `${valueText.slice(0, 129)}...` : valueText;
}

function conditionSkuList(source, name) {
  const json = readJson(source, {});
  const condition = (json.conditions || []).find(item => item.name === name || item.sourceName === name);
  return condition?.skuList || [];
}

function buildLiveAdMap() {
  const json = readJson(LIVE_AD_SOURCE, { rows: [] });
  const fatherRe = /\u7236\u4eb2\u8282|father|fathers|father.s|dad/i;
  const bySku = new Map();
  for (const row of json.rows || []) {
    const sku = text(row.sku || row.skuInvData?.sku);
    if (!sku) continue;
    const variantText = JSON.stringify(row.productVariantInfo?.variantData || {});
    const evidenceText = [
      row.skuInvData?.solr_term,
      row.campaignName,
      row.groupName,
      variantText,
    ].filter(Boolean).join(' | ');
    if (!fatherRe.test(evidenceText)) continue;
    const item = bySku.get(sku) || {
      rows: 0,
      liveRows: 0,
      spend: 0,
      clicks: 0,
      orders: 0,
      sales: 0,
      terms: new Set(),
      campaigns: new Set(),
      styles: new Set(),
    };
    item.rows += 1;
    if (String(row.state) === '1' && String(row.campaignState) === '1' && String(row.groupState) === '1') {
      item.liveRows += 1;
    }
    item.spend += num(row.Spend);
    item.clicks += num(row.Clicks);
    item.orders += num(row.Orders);
    item.sales += num(row.Sales);
    if (row.skuInvData?.solr_term) item.terms.add(row.skuInvData.solr_term);
    if (/father|dad/i.test(row.campaignName || '')) item.campaigns.add(row.campaignName);
    if (/father|dad/i.test(row.groupName || '')) item.campaigns.add(row.groupName);
    if (/dad/i.test(variantText)) item.styles.add(variantText);
    bySku.set(sku, item);
  }
  return bySku;
}

function loadEvidence() {
  const currentSkus = conditionSkuList(CURRENT_SOURCE, FATHER_ADJACENT);
  const strictSkus = readJson(IMAGE_FIRST_SOURCE, {}).keyChecks?.fatherSkus || conditionSkuList(IMAGE_FIRST_SOURCE, FATHER_PURE);
  const oldAutoSkus = conditionSkuList(OLD_AUTO_SOURCE, FATHER_PURE);
  const allSkus = [...new Set([...currentSkus, ...strictSkus, ...oldAutoSkus])];

  const inventoryRows = readCsv(findChineseTrendRawCsv())
    .filter(row => allSkus.includes(row.sku) && row.salesChannel === 'Amazon.com');
  const inventoryBySku = new Map();
  for (const row of inventoryRows) {
    if (!inventoryBySku.has(row.sku)) inventoryBySku.set(row.sku, row);
  }

  const ops = readJson(OPS_SOURCE, { rows: [] });
  const opsBySku = new Map((ops.rows || []).map(row => [row.sku, row]));
  const liveAdBySku = buildLiveAdMap();

  const rows = allSkus.map(sku => {
    const inv = inventoryBySku.get(sku) || {};
    const op = opsBySku.get(sku) || {};
    const live = liveAdBySku.get(sku) || null;
    const bucket = currentSkus.includes(sku)
      ? 'current'
      : strictSkus.includes(sku)
        ? 'strict'
        : 'old_auto';
    const route = bucket === 'current'
      ? '\u5f53\u524d\u4e3b\u6c60'
      : bucket === 'strict'
        ? '\u56fe\u50cf/\u5e7f\u544a\u5f3a\u8bc1\u636e'
        : '\u65e7\u81ea\u52a8\u6c60\u672a\u8fdb\u4e3b\u6c60';
    const profit = inv.net_profit !== '' && inv.net_profit !== undefined ? num(inv.net_profit) : num(inv.profitRate);
    const units30 = inv.qty_30 !== '' && inv.qty_30 !== undefined ? num(inv.qty_30) : num(op.units30d);
    return {
      sku,
      asin: text(inv.asin || op.asin),
      title: text(inv.productName),
      route,
      bucket,
      status: text(inv.sale_status),
      price: num(inv.lowestprice),
      units3: num(op.units3d),
      units7: num(op.units7d),
      units30,
      profit,
      fba: num(inv.fulFillable),
      reserved: num(inv.reserved),
      inbound: num(inv.inbound),
      sellableDays: text(inv.can_sales_30_third || ''),
      ad7Orders: num(op.ad7?.orders),
      ad7Clicks: num(op.ad7?.clicks),
      ad7Spend: num(op.ad7?.spend),
      liveAdRows: live?.liveRows || 0,
      fatherAdRows: live?.rows || 0,
      fatherAdSpend: live?.spend || 0,
      fatherAdOrders: live?.orders || 0,
      fatherTerms: live ? [...live.terms] : [],
      fatherCampaigns: live ? [...live.campaigns].slice(0, 4) : [],
      fatherStyles: live ? [...live.styles] : [],
      image: localImageSrc(sku) || text(inv.small_pic_url),
    };
  });

  rows.sort((a, b) => {
    const order = { current: 0, strict: 1, old_auto: 2 };
    return order[a.bucket] - order[b.bucket] || b.units30 - a.units30 || a.sku.localeCompare(b.sku);
  });

  return { rows, currentSkus, strictSkus, oldAutoSkus };
}

function barRows(rows, key, label, formatter = int) {
  const max = Math.max(...rows.map(row => Math.max(0, num(row[key]))), 1);
  return `<section class="panel"><h2>${esc(label)}</h2><div class="bars">${rows.map(row => {
    const value = Math.max(0, num(row[key]));
    const width = Math.max(1, (value / max) * 100);
    return `<div class="bar-row">
      <div class="bar-key">${esc(row.sku)}</div>
      <div class="bar-track"><span style="width:${width.toFixed(1)}%" class="${row.bucket}"></span></div>
      <div class="bar-value">${esc(formatter(value))}</div>
    </div>`;
  }).join('')}</div></section>`;
}

function profitBars(rows) {
  const maxAbs = Math.max(...rows.map(row => Math.abs(row.profit)), 0.01);
  return `<section class="panel"><h2>\u51c0\u5229\u6da6\u7387/\u4f30\u7b97\u5229\u6da6\u4fe1\u53f7</h2><div class="profit-bars">${rows.map(row => {
    const width = Math.max(2, (Math.abs(row.profit) / maxAbs) * 50);
    const positive = row.profit >= 0;
    return `<div class="profit-row">
      <div class="bar-key">${esc(row.sku)}</div>
      <div class="profit-axis">
        <span class="zero"></span>
        <span class="profit-fill ${positive ? 'positive' : 'negative'}" style="${positive ? `left:50%;width:${width.toFixed(1)}%` : `right:50%;width:${width.toFixed(1)}%`}"></span>
      </div>
      <div class="bar-value ${positive ? 'good' : 'bad'}">${esc(pct(row.profit, 1))}</div>
    </div>`;
  }).join('')}</div></section>`;
}

function sourceEvidenceHtml(currentSkus, strictSkus, oldAutoSkus) {
  const apply = readJson(CLOUD_APPLY_SOURCE, {});
  const verify = readJson(CLOUD_VERIFY_SOURCE, {});
  return `<section class="evidence">
    <h2>\u8bc1\u636e\u94fe</h2>
    <div class="source-grid">
      <div><b>\u5f53\u524d\u4e3b\u6c60</b><p><code>${esc(path.relative(ROOT, CURRENT_SOURCE))}</code></p><p>\u6761\u4ef6\u540d: \u7236\u4eb2\u8282\u8e6d; SKU ${currentSkus.length}: ${esc(currentSkus.join(', '))}</p></div>
      <div><b>\u4e91\u7aef\u843d\u5e93\u9a8c\u8bc1</b><p><code>${esc(path.relative(ROOT, CLOUD_APPLY_SOURCE))}</code></p><p>missing: ${esc(JSON.stringify(apply.result?.missing || []))}; cloudTagCount: ${esc(apply.result?.cloudTagCount || '')}</p><p><code>${esc(path.relative(ROOT, CLOUD_VERIFY_SOURCE))}</code> tagCount: ${esc(verify.result?.tagCount || '')}</p></div>
      <div><b>\u56fe\u50cf\u4f18\u5148\u590d\u6838</b><p><code>${esc(path.relative(ROOT, IMAGE_FIRST_SOURCE))}</code></p><p>fatherSkus: ${esc(strictSkus.join(', ') || '-')}</p></div>
      <div><b>\u65e7\u81ea\u52a8\u7236\u4eb2\u8282\u6c60</b><p><code>${esc(path.relative(ROOT, OLD_AUTO_SOURCE))}</code></p><p>old auto pure: ${esc(oldAutoSkus.join(', '))}</p></div>
      <div><b>\u5e93\u5b58\u539f\u59cb\u8868</b><p><code>\u9ec4\u6210\u5586\u4e2a\u4eba\u6570\u636e\u8d8b\u52bf/\u539f\u6570\u636e/\u539f\u65e5\u6570\u636e/5-25/inv_auto_filtered_2026-05-25-14-53-36.csv</code></p><p>\u7528\u6765\u8865\u5546\u54c1\u540d\u3001\u4ef7\u683c\u3001\u9500\u91cf\u3001FBA\u3001\u5229\u6da6\u3002</p></div>
      <div><b>SKU \u590d\u76d8 + \u5e7f\u544a\u884c</b><p><code>${esc(path.relative(ROOT, OPS_SOURCE))}</code></p><p><code>${esc(path.relative(ROOT, LIVE_AD_SOURCE))}</code></p><p>\u7528\u6765\u6838\u5bf9 3/7/30 \u65e5\u9500\u91cf\u548c father/dad \u5e7f\u544a\u6d3b\u52a8\u75d5\u8ff9\u3002</p></div>
    </div>
  </section>`;
}

function card(row) {
  const image = row.image
    ? `<img src="${esc(row.image)}" alt="${esc(row.sku)} product image">`
    : '<div class="image-empty">No image</div>';
  const titleEvidence = [
    row.title,
    row.fatherTerms.length ? `广告/库存标签: ${row.fatherTerms.join('; ')}` : '',
    row.fatherCampaigns.length ? `Father/Dad广告: ${row.fatherCampaigns.join(' | ')}` : '',
    row.fatherStyles.length ? `变体: ${row.fatherStyles.join('; ')}` : '',
  ].filter(Boolean);
  return `<article class="card ${row.bucket}">
    <div class="card-image">${image}</div>
    <div class="card-body">
      <div class="card-top">
        <h3>${esc(row.sku)}</h3>
        <span>${esc(row.route)}</span>
      </div>
      <p class="asin">${esc(row.asin)} | ${esc(row.status || '-')} | ${esc(money(row.price))}</p>
      <p class="title">${esc(shortTitle(row.title))}</p>
      <div class="metric-grid">
        <b>${esc(int(row.units30))}<small>30\u65e5\u9500\u91cf</small></b>
        <b>${esc(int(row.units7))}<small>7\u65e5\u9500\u91cf</small></b>
        <b class="${row.profit >= 0 ? 'good' : 'bad'}">${esc(pct(row.profit, 1))}<small>\u5229\u6da6\u4fe1\u53f7</small></b>
        <b>${esc(int(row.fba + row.reserved))}<small>Ful+Res</small></b>
      </div>
      <div class="evidence-list">
        ${titleEvidence.map(item => `<p>${esc(item)}</p>`).join('')}
        <p>7\u65e5\u5e7f\u544a: ${esc(int(row.ad7Clicks))} clicks / ${esc(int(row.ad7Orders))} orders / ${esc(money(row.ad7Spend))}</p>
        <p>5/27 father/dad \u5e7f\u544a\u884c: ${esc(int(row.liveAdRows))}/${esc(int(row.fatherAdRows))} live/all</p>
      </div>
    </div>
  </article>`;
}

function tableHtml(rows) {
  return `<section class="panel full"><h2>\u660e\u7ec6\u8bc1\u636e\u8868</h2>
    <table>
      <thead><tr>
        <th>SKU</th><th>\u53e3\u5f84</th><th>ASIN</th><th>\u72b6\u6001</th><th>\u4ef7\u683c</th><th>3/7/30\u65e5\u9500\u91cf</th><th>7\u65e5\u5e7f\u544a</th><th>Ful+Res</th><th>\u8bc1\u636e\u6458\u8981</th>
      </tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td><b>${esc(row.sku)}</b></td>
        <td>${esc(row.route)}</td>
        <td>${esc(row.asin)}</td>
        <td>${esc(row.status)}</td>
        <td>${esc(money(row.price))}</td>
        <td>${esc(`${int(row.units3)} / ${int(row.units7)} / ${int(row.units30)}`)}</td>
        <td>${esc(`${int(row.ad7Clicks)} clicks, ${int(row.ad7Orders)} orders, ${money(row.ad7Spend)}`)}</td>
        <td>${esc(int(row.fba + row.reserved))}</td>
        <td>${esc(shortTitle(row.title))}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>`;
}

function html() {
  const { rows, currentSkus, strictSkus, oldAutoSkus } = loadEvidence();
  const currentRows = rows.filter(row => row.bucket === 'current');
  const strictRows = rows.filter(row => row.bucket === 'strict');
  const oldRows = rows.filter(row => row.bucket === 'old_auto');
  const totalUnits30 = currentRows.reduce((sum, row) => sum + row.units30, 0);
  const negativeProfit = currentRows.filter(row => row.profit < 0).length;
  const fatherLiveRows = rows.reduce((sum, row) => sum + row.liveAdRows, 0);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>父亲节产品证据板 ${BUSINESS_DATE}</title>
  <style>
    :root {
      --ink:#152026;
      --muted:#66747f;
      --line:#d9e1e6;
      --panel:#ffffff;
      --bg:#f4f7f8;
      --current:#1f8a70;
      --strict:#c26b22;
      --old:#667085;
      --bad:#b83d3d;
      --good:#197553;
      --blue:#2d6cdf;
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, "Microsoft YaHei", sans-serif; color:var(--ink); background:var(--bg); }
    header { padding:28px 34px 20px; background:#102027; color:#fff; }
    header h1 { margin:0 0 10px; font-size:28px; letter-spacing:0; }
    header p { margin:0; color:#d7e0e4; line-height:1.55; max-width:1100px; }
    main { padding:22px 34px 38px; }
    .stats { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:12px; margin-bottom:18px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
    .stat b { display:block; font-size:28px; line-height:1.1; }
    .stat span { display:block; color:var(--muted); margin-top:5px; font-size:13px; }
    .layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .panel, .evidence { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .full { grid-column:1 / -1; }
    h2 { margin:0 0 14px; font-size:18px; }
    .bars, .profit-bars { display:grid; gap:9px; }
    .bar-row, .profit-row { display:grid; grid-template-columns:82px 1fr 82px; align-items:center; gap:10px; font-size:13px; }
    .bar-key { font-weight:700; }
    .bar-track { height:16px; border-radius:4px; background:#edf1f3; overflow:hidden; }
    .bar-track span { display:block; height:100%; border-radius:4px; }
    .bar-track .current { background:var(--current); }
    .bar-track .strict { background:var(--strict); }
    .bar-track .old_auto { background:var(--old); }
    .bar-value { text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
    .profit-axis { position:relative; height:20px; background:#edf1f3; border-radius:4px; overflow:hidden; }
    .profit-axis .zero { position:absolute; left:50%; top:0; bottom:0; width:1px; background:#fff; box-shadow:0 0 0 1px #c6d0d6; }
    .profit-fill { position:absolute; top:3px; bottom:3px; border-radius:3px; }
    .positive { background:var(--good); }
    .negative { background:var(--bad); }
    .good { color:var(--good); }
    .bad { color:var(--bad); }
    .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; margin-top:18px; }
    .card { display:grid; grid-template-columns:108px 1fr; min-height:210px; background:var(--panel); border:1px solid var(--line); border-left:6px solid var(--current); border-radius:8px; overflow:hidden; }
    .card.strict { border-left-color:var(--strict); }
    .card.old_auto { border-left-color:var(--old); }
    .card-image { background:#e9eef1; display:flex; align-items:center; justify-content:center; padding:8px; }
    .card-image img { width:90px; height:90px; object-fit:contain; border-radius:6px; background:#fff; }
    .image-empty { color:var(--muted); font-size:12px; }
    .card-body { padding:12px; }
    .card-top { display:flex; align-items:start; justify-content:space-between; gap:10px; }
    .card h3 { margin:0; font-size:18px; }
    .card-top span { color:var(--muted); font-size:12px; white-space:nowrap; }
    .asin, .title { margin:6px 0; color:var(--muted); font-size:12px; line-height:1.35; }
    .title { color:var(--ink); }
    .metric-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:10px 0; }
    .metric-grid b { border:1px solid var(--line); border-radius:6px; padding:7px 6px; font-size:15px; }
    .metric-grid small { display:block; color:var(--muted); font-size:10px; font-weight:400; margin-top:3px; }
    .evidence-list { border-top:1px solid var(--line); padding-top:8px; }
    .evidence-list p { margin:4px 0; color:#3f4d56; font-size:12px; line-height:1.35; }
    .source-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
    .source-grid div { border:1px solid var(--line); border-radius:7px; padding:12px; background:#fbfcfd; }
    .source-grid p { margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.4; }
    code { color:#18384a; background:#edf3f5; padding:2px 4px; border-radius:4px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { background:#edf3f5; color:#42515b; }
    .legend { display:flex; gap:14px; flex-wrap:wrap; margin:14px 0 0; color:#d7e0e4; font-size:13px; }
    .legend span::before { content:""; display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; vertical-align:-1px; }
    .legend .current::before { background:var(--current); }
    .legend .strict::before { background:var(--strict); }
    .legend .old::before { background:var(--old); }
    @media (max-width: 860px) {
      header, main { padding-left:18px; padding-right:18px; }
      .stats, .layout { grid-template-columns:1fr; }
      .bar-row, .profit-row { grid-template-columns:68px 1fr 70px; }
      .card { grid-template-columns:94px 1fr; }
      .metric-grid { grid-template-columns:repeat(2,1fr); }
    }
  </style>
</head>
<body>
  <header>
    <h1>\u7236\u4eb2\u8282\u4ea7\u54c1\u8bc1\u636e\u677f</h1>
    <p>\u53e3\u5f84: \u4e3b\u6c60\u4ee5 2026-05-26 \u4eba\u5de5\u4fdd\u5b58\u6761\u4ef6\u201c\u7236\u4eb2\u8282\u8e6d\u201d\u4e3a\u51c6; \u540c\u65f6\u6807\u51fa 2025-05-25 \u56fe\u50cf/\u81ea\u52a8\u5b63\u8282\u6761\u4ef6\u548c 2026-05-27 father/dad \u5e7f\u544a\u75d5\u8ff9\u3002</p>
    <div class="legend"><span class="current">\u5f53\u524d\u4e3b\u6c60</span><span class="strict">\u56fe\u50cf/\u5e7f\u544a\u5f3a\u8bc1\u636e</span><span class="old">\u65e7\u81ea\u52a8\u6c60\u672a\u8fdb\u4e3b\u6c60</span></div>
  </header>
  <main>
    <section class="stats">
      <div class="stat"><b>${esc(int(currentRows.length))}</b><span>\u5f53\u524d\u4e3b\u6c60 SKU</span></div>
      <div class="stat"><b>${esc(int(totalUnits30))}</b><span>\u4e3b\u6c60 30 \u65e5\u9500\u91cf</span></div>
      <div class="stat"><b>${esc(int(negativeProfit))}</b><span>\u4e3b\u6c60\u5229\u6da6\u4e3a\u8d1f SKU</span></div>
      <div class="stat"><b>${esc(int(fatherLiveRows))}</b><span>5/27 father/dad live \u5e7f\u544a\u884c</span></div>
    </section>
    <section class="layout">
      ${barRows(rows, 'units30', '30\u65e5\u9500\u91cf\u5bf9\u6bd4', int)}
      ${barRows(rows, 'ad7Clicks', '7\u65e5\u5e7f\u544a\u70b9\u51fb\u5bf9\u6bd4', int)}
      ${profitBars(rows)}
      ${barRows(rows, 'fatherAdRows', 'father/dad \u5e7f\u544a\u8bc1\u636e\u884c\u6570', int)}
      ${tableHtml(rows)}
    </section>
    <section class="cards">
      ${currentRows.map(card).join('')}
      ${strictRows.map(card).join('')}
      ${oldRows.map(card).join('')}
    </section>
    ${sourceEvidenceHtml(currentSkus, strictSkus, oldAutoSkus)}
  </main>
</body>
</html>`;
}

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
fs.writeFileSync(OUT_HTML, html(), 'utf8');
console.log(OUT_HTML);
