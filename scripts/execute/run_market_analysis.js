#!/usr/bin/env node
/**
 * Market Analysis Orchestrator (ops:market:analyze)
 *
 * One command that runs the fixed market-analysis flow defined in
 * docs/PRODUCT_MARKET_EVIDENCE_STACK.md and the selection-product-research skill:
 *
 *   1. Resolve product identity (SKU -> ASIN / title / price / stock / sales)
 *      from local snapshots, so even a brand-new SKU not in latest_snapshot.json
 *      still gets an identity.
 *   2. Derive seed terms (from --terms, else from the listing title).
 *   3. Run the read-only selection evidence fetchers sequentially against the
 *      logged-in selection browser (shared CDP session -> never parallel):
 *        - keyword-research      (front-search competitor pool)
 *        - aba-search-terms      (market demand / concentration)
 *        - keyword-conversion    (CPC/CPA/ACOS economics)
 *        - keyword-seasonality   (season window)
 *        - product-time-machine  (competitor traffic map)
 *      plus product-analysis (internal SKU economics) when a SKU is given.
 *   4. Feed every produced snapshot into ops:selection:operating-intelligence,
 *      which scores opportunity models, risk signals, and missing evidence.
 *   5. Print a dimension-coverage table + the fixed research output template.
 *
 * Boundary: this is READ-ONLY market evidence. It never writes ads, price,
 * listing, or inventory. Per-source failure is tolerated and reported as a
 * missing dimension instead of crashing the whole run.
 *
 * Usage:
 *   node scripts/execute/run_market_analysis.js --sku DIN1878
 *   node scripts/execute/run_market_analysis.js --sku DIN1878 --terms "worry stones, pocket hug"
 *   node scripts/execute/run_market_analysis.js --asin B0H11MRVRG --title "..." --terms "..."
 *   node scripts/execute/run_market_analysis.js --sku DIN1878 --skip-fetch   # aggregate existing snapshots only
 *   node scripts/execute/run_market_analysis.js --sku DIN1878 --json         # machine-readable
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const ANALYSIS_DIR = path.join(ROOT, 'data', 'analysis');

let deriveResearchSeedTerms = null;
try {
  ({ deriveResearchSeedTerms } = require('../../src/selection_keyword_research'));
} catch (_) { /* optional */ }

let buildSelectionOperatingIntelligenceCapability = null;
try {
  ({ buildSelectionOperatingIntelligenceCapability } = require('../../src/selection_operating_intelligence_capability'));
} catch (_) { /* optional */ }

// ---------- small utils ----------

function text(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, ''));
  } catch (_) {
    return fallback;
  }
}

function splitList(v) {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  if (v === undefined || v === null) return [];
  return String(v).split(/[,\n;]+/).map(text).filter(Boolean);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const eq = item.indexOf('=');
    if (eq >= 0) { options[item.slice(2, eq)] = item.slice(eq + 1); continue; }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { options[key] = next; i += 1; }
    else { options[key] = true; }
  }
  return options;
}

// ---------- identity resolution ----------

// Scan a prioritized set of local files for a record matching the SKU/ASIN, so
// a SKU that is not yet in latest_snapshot.json still gets price/stock/sales.
function resolveIdentity({ sku, asin, title }) {
  const skuU = text(sku).toUpperCase();
  const asinU = text(asin).toUpperCase();
  const identity = {
    sku: text(sku), asin: text(asin), title: text(title),
    price: null, stock: null, inbound: null, sales30: null,
    profitRate: null, referenceNetProfit: null, opendate: null, seller: null,
    sources: [],
  };

  const absorb = (rec, file) => {
    if (!rec || typeof rec !== 'object') return;
    let changed = false;
    // For "should be positive" economics, a stored 0 means unknown, so allow
    // upgrading a previously-absorbed 0 to a real nonzero value.
    const fillPos = (cur, val) => {
      const n = Number(val);
      if (val == null || val === '' || Number.isNaN(n)) return { v: cur, c: false };
      if (cur == null || cur === 0) return { v: n, c: n !== cur };
      return { v: cur, c: false };
    };
    // For counts (stock/sales) 0 is meaningful, so only fill when still null.
    const fillCount = (cur, val) => {
      const n = Number(val);
      if (val == null || val === '' || Number.isNaN(n)) return { v: cur, c: false };
      if (cur == null) return { v: n, c: true };
      return { v: cur, c: false };
    };
    if (!identity.asin && rec.asin) { identity.asin = text(rec.asin); changed = true; }
    if (!identity.title && (rec.title || rec.productName)) { identity.title = text(rec.title || rec.productName); changed = true; }
    let r;
    r = fillPos(identity.price, rec.price); if (r.c) { identity.price = r.v; changed = true; }
    r = fillCount(identity.stock, rec.fbaUnits ?? rec.fulFillable ?? rec.fba ?? rec.stockFul); if (r.c) { identity.stock = r.v; changed = true; }
    r = fillCount(identity.inbound, rec.inbound ?? rec.stockInb); if (r.c) { identity.inbound = r.v; changed = true; }
    r = fillCount(identity.sales30, rec.unitsSold_30d ?? rec.units30 ?? rec.sales_30); if (r.c) { identity.sales30 = r.v; changed = true; }
    r = fillPos(identity.profitRate, rec.profitRate); if (r.c) { identity.profitRate = r.v; changed = true; }
    r = fillPos(identity.referenceNetProfit, rec.referenceNetProfit); if (r.c) { identity.referenceNetProfit = r.v; changed = true; }
    if (!identity.opendate && rec.opendate) { identity.opendate = text(rec.opendate); changed = true; }
    if (!identity.seller && rec.seller) { identity.seller = text(rec.seller); changed = true; }
    if (changed && !identity.sources.includes(file)) identity.sources.push(file);
  };

  const matches = (rec) => {
    if (!rec || typeof rec !== 'object') return false;
    if (skuU && text(rec.sku).toUpperCase() === skuU) return true;
    if (asinU && text(rec.asin).toUpperCase() === asinU) return true;
    return false;
  };

  // deep-ish walk capped to keep it fast
  const walk = (node, file, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) { for (const it of node) walk(it, file, depth + 1); return; }
    if (matches(node)) absorb(node, file);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v, file, depth + 1);
    }
  };

  // 1) latest_snapshot productCards (fast path)
  const latest = readJson(path.join(SNAP_DIR, 'latest_snapshot.json'));
  if (latest && Array.isArray(latest.productCards)) {
    const card = latest.productCards.find(c => text(c.sku).toUpperCase() === skuU || text(c.asin).toUpperCase() === asinU);
    if (card) absorb(card, 'latest_snapshot.json');
  }

  // 2) recent inventory / analysis snapshots (newest first), stop once enriched enough
  const enriched = () => identity.asin && identity.title && identity.price != null && identity.sales30 != null;
  const candidates = [];
  for (const dir of [SNAP_DIR, ANALYSIS_DIR]) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (_) { /* ignore */ }
    files.sort().reverse(); // date-suffixed names => newest first
    for (const f of files) candidates.push(path.join(dir, f));
  }
  let scanned = 0;
  for (const file of candidates) {
    if (enriched()) break;
    if (scanned > 80) break; // safety cap
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    // cheap pre-filter: only parse files that mention the sku/asin
    if (skuU && !raw.toUpperCase().includes(skuU) && asinU && !raw.toUpperCase().includes(asinU)) continue;
    if (skuU && !raw.toUpperCase().includes(skuU) && !asinU) continue;
    scanned += 1;
    const json = (() => { try { return JSON.parse(raw.replace(/^﻿/, '')); } catch (_) { return null; } })();
    if (json) walk(json, path.basename(file));
  }
  return identity;
}

function deriveSeedTerms({ terms, title, sku, asin }) {
  const explicit = splitList(terms);
  if (explicit.length) return explicit.slice(0, 8);

  // Build short head terms from the title ourselves. The selection module's
  // deriveResearchSeedTerms emits long title n-grams ("craftydream sets pocket
  // hug") that return zero ABA/conversion demand; short head terms ("worry
  // stones", "pocket hug") are what those sources actually index.
  const headTerms = headTermsFromTitle(title);
  if (headTerms.length) return headTerms;

  // fallback to the module if we somehow could not parse a title
  if (deriveResearchSeedTerms) {
    try {
      const seeds = deriveResearchSeedTerms({ title, sku, asin, terms: explicit }, { limit: 6 });
      if (seeds && seeds.length) return seeds.map(s => text(s.term || s)).filter(Boolean).slice(0, 6);
    } catch (_) { /* ignore */ }
  }
  return [];
}

// Strip brand + pack-size + filler from a listing title and emit short head
// terms (2-grams + core nouns) that ABA/conversion/PTM actually index.
function headTermsFromTitle(title) {
  const STOP = new Set([
    'the', 'and', 'for', 'with', 'set', 'sets', 'pack', 'piece', 'pieces', 'pcs',
    'assorted', 'count', 'bulk', 'inch', 'inches', 'large', 'small', 'mini',
    'give', 'all', 'your', 'our', 'this', 'that', 'each', 'per', 'new', 'pro',
  ]);
  const rawTokens = text(title).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const tokens = rawTokens
    .filter((w, i) => !(i === 0 && w.length > 2)) // leading brand prefix
    .filter(w => !/^\d+$/.test(w))                 // pure numbers (pack size)
    .filter(w => !STOP.has(w))
    .filter(w => w.length > 2);
  const grams = [];
  const seen = new Set();
  const push = (g) => { const t = g.trim(); if (t && !seen.has(t)) { seen.add(t); grams.push(t); } };
  for (let i = 0; i + 2 <= tokens.length && grams.length < 8; i += 1) push(tokens.slice(i, i + 2).join(' '));
  for (const w of tokens) { if (grams.length >= 8) break; push(w); }
  return grams.slice(0, 6);
}

// ---------- fetcher runner ----------

const FETCHERS = [
  {
    key: 'keywordResearch', label: '前台竞品池 keyword-research',
    script: 'fetch_selection_keyword_research.js',
    outFile: () => `selection_keyword_research_${todayYmd()}.json`,
    aggFlag: '--keyword-research-report',
    args: ({ sku, asin, termArg }) => [
      ...(sku ? ['--sku', sku] : []),
      ...(asin ? ['--asin', asin] : []),
      '--terms', termArg,
    ],
  },
  {
    key: 'abaSearchTerms', label: 'ABA 市场需求 aba-search-terms',
    script: 'fetch_selection_aba_search_terms.js',
    outFile: () => `selection_aba_search_terms_${todayYmd()}.json`,
    aggFlag: '--aba-report',
    args: ({ termArg }) => ['--search-terms', termArg],
  },
  {
    key: 'keywordConversion', label: '转化经济性 keyword-conversion',
    script: 'fetch_selection_keyword_conversion_rate.js',
    outFile: () => `selection_keyword_conversion_rate_${todayYmd()}.json`,
    aggFlag: '--keyword-conversion-report',
    args: ({ termArg }) => ['--keywords', termArg],
  },
  {
    key: 'keywordSeasonality', label: '季节窗口 keyword-seasonality',
    script: 'fetch_selection_keyword_seasonality.js',
    outFile: () => `selection_keyword_seasonality_${todayYmd()}.json`,
    aggFlag: '--seasonality-report',
    args: ({ termArg }) => ['--search-terms', termArg],
  },
  {
    key: 'productTimeMachine', label: '竞品流量地图 product-time-machine',
    script: 'fetch_selection_product_time_machine.js',
    outFile: () => `selection_product_time_machine_${todayYmd()}.json`,
    aggFlag: '--product-time-machine-report',
    args: ({ termArg }) => ['--search-keywords', termArg],
  },
];

function runFetcher(fetcher, ctx) {
  const scriptPath = path.join(ROOT, 'scripts', 'execute', fetcher.script);
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, status: 'script_missing', file: null, rowCount: 0, error: `missing ${fetcher.script}` };
  }
  const args = fetcher.args(ctx);
  const res = spawnSync('node', [scriptPath, ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: ctx.timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  const outName = fetcher.outFile();
  const outPath = path.join(SNAP_DIR, outName);
  const produced = readJson(outPath);
  const rowCount = produced
    ? Number(produced.rowCount ?? (Array.isArray(produced.rows) ? produced.rows.length : 0)) || 0
    : 0;
  let stdoutTail = '';
  try { stdoutTail = text((res.stdout || '').split('\n').slice(-4).join(' ')).slice(0, 300); } catch (_) { /* ignore */ }
  const errTail = text((res.stderr || '').split('\n').filter(Boolean).slice(-3).join(' ')).slice(0, 300);
  // A produced snapshot with rows means the dimension is covered, even if the
  // fetcher exits nonzero or sets ok:false as a read-only-boundary convention.
  const ok = rowCount > 0;
  const status = rowCount > 0 ? 'present' : (res.status === 0 ? 'empty' : 'failed');
  return {
    ok,
    status,
    file: produced ? path.relative(ROOT, outPath) : null,
    rowCount,
    exitCode: res.status,
    error: status === 'failed' ? (errTail || stdoutTail || `exit ${res.status}`) : '',
  };
}

function runProductAnalysis(ctx) {
  const scriptPath = path.join(ROOT, 'scripts', 'execute', 'fetch_product_analysis_query2.js');
  if (!ctx.sku || !fs.existsSync(scriptPath)) {
    return { ok: false, status: ctx.sku ? 'script_missing' : 'skipped_no_sku', file: null };
  }
  const res = spawnSync('node', [scriptPath, '--sku', ctx.sku], {
    cwd: ROOT, encoding: 'utf8', timeout: ctx.timeoutMs, maxBuffer: 32 * 1024 * 1024,
  });
  // file name: product_analysis_query2_<safeSku>_<businessDate>.json (date may differ) -> find newest match
  const safe = ctx.sku.replace(/[^a-z0-9]/gi, '_');
  let match = null;
  try {
    match = fs.readdirSync(SNAP_DIR)
      .filter(f => f.startsWith(`product_analysis_query2_${safe}_`) && f.endsWith('.json'))
      .sort().reverse()[0] || null;
  } catch (_) { /* ignore */ }
  const errTail = text((res.stderr || '').split('\n').filter(Boolean).slice(-3).join(' ')).slice(0, 300);
  return {
    ok: res.status === 0 && !!match,
    status: res.status === 0 ? (match ? 'present' : 'empty') : 'failed',
    file: match ? path.relative(ROOT, path.join(SNAP_DIR, match)) : null,
    error: res.status === 0 ? '' : errTail || `exit ${res.status}`,
  };
}

// ---------- aggregation ----------

function aggregate(ctx, fetchResults) {
  if (!buildSelectionOperatingIntelligenceCapability) return null;
  const options = {
    terms: ctx.seedTerms.join(', '),
    sku: ctx.sku,
    asin: ctx.asin,
  };
  for (const f of FETCHERS) {
    const r = fetchResults[f.key];
    if (r && r.file && r.rowCount > 0) {
      const flagKey = {
        '--keyword-research-report': 'keywordResearchReportFile',
        '--aba-report': 'abaReportFile',
        '--keyword-conversion-report': 'keywordConversionReportFile',
        '--seasonality-report': 'keywordSeasonalityReportFile',
        '--product-time-machine-report': 'productTimeMachineReportFile',
      }[f.aggFlag];
      if (flagKey) options[flagKey] = path.join(ROOT, r.file);
    }
  }
  try {
    return buildSelectionOperatingIntelligenceCapability(options);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- coverage + render ----------

const DIMENSIONS = [
  { key: 'identity', label: '产品身份 (SKU/ASIN/标题/价格/库存/销量)', why: '不先锁身份，后面的词和竞品都是噪音' },
  { key: 'keywordResearch', label: '前台竞品池 (谁在卖/价格/卖点)', why: '判断真实竞争对手与流量入口' },
  { key: 'abaSearchTerms', label: 'ABA 市场需求 (搜索量/排名/集中度)', why: '回答市场有没有量、头部多集中' },
  { key: 'keywordConversion', label: '转化经济性 (CPC/CPA/ACOS/购买率)', why: '回答能不能赚、获客贵不贵' },
  { key: 'keywordSeasonality', label: '季节窗口 (Google趋势/旺季)', why: '判断现在是预热/旺季/尾季/清货' },
  { key: 'productTimeMachine', label: '竞品流量地图 (自然/广告占比/排名史)', why: '看需求被谁占、靠什么流量占' },
  { key: 'productAnalysis', label: '内部承接 (利润/库存/30天销量)', why: '有需求但我们承接不了=研究白做' },
];

function statusZh(s) {
  return {
    present: '✅ 有数据', empty: '⚠️ 跑通但空', failed: '❌ 拉取失败',
    skipped: '⏭️ 跳过', skipped_no_sku: '⏭️ 无SKU跳过', script_missing: '❌ 脚本缺失',
  }[s] || s;
}

function buildCoverage(identity, fetchResults, paResult) {
  const rows = [];
  // identity
  const idFields = ['asin', 'title', 'price', 'stock', 'sales30'];
  const idHave = idFields.filter(k => identity[k] !== null && identity[k] !== undefined && identity[k] !== '').length;
  rows.push({
    key: 'identity',
    status: idHave >= 3 ? 'present' : (idHave > 0 ? 'empty' : 'failed'),
    detail: `${idHave}/${idFields.length} 字段`,
  });
  for (const f of FETCHERS) {
    const r = fetchResults[f.key] || { status: 'skipped' };
    rows.push({ key: f.key, status: r.status, detail: r.rowCount != null ? `rows=${r.rowCount}` : (r.error || '') });
  }
  rows.push({ key: 'productAnalysis', status: paResult.status, detail: paResult.error || (paResult.file ? 'ok' : '') });
  return rows;
}

function renderHuman(report) {
  const { identity, seedTerms, coverage, intelligence, mode } = report;
  const lines = [];
  const dimMap = Object.fromEntries(DIMENSIONS.map(d => [d.key, d]));
  const covMap = Object.fromEntries(coverage.map(c => [c.key, c]));

  lines.push('# 市场分析 · ' + (identity.sku || identity.asin || '(未命名)') + (mode === 'skip-fetch' ? '  [仅汇总已有快照]' : ''));
  lines.push('');
  lines.push('## 研究对象');
  lines.push(`- SKU/ASIN: ${identity.sku || '-'} / ${identity.asin || '-'}`);
  lines.push(`- 标题: ${identity.title || '(未解析到)'}`);
  const econ = [];
  if (identity.price != null) econ.push(`价 $${identity.price}`);
  if (identity.stock != null) econ.push(`可售 ${identity.stock}`);
  if (identity.inbound != null) econ.push(`在途 ${identity.inbound}`);
  if (identity.sales30 != null) econ.push(`30天销量 ${identity.sales30}`);
  if (identity.profitRate != null) econ.push(`利润率 ${(identity.profitRate * 100).toFixed(1)}%`);
  lines.push(`- 经济性: ${econ.length ? econ.join(' / ') : '(未解析到)'}`);
  lines.push(`- 种子词: ${seedTerms.join(' | ') || '(无)'}`);
  lines.push(`- 身份来源: ${identity.sources.join(', ') || '(无本地命中)'}`);
  lines.push('');

  lines.push('## 维度覆盖表');
  lines.push('| 维度 | 状态 | 明细 | 为什么要这一步 |');
  lines.push('|---|---|---|---|');
  for (const d of DIMENSIONS) {
    const c = covMap[d.key] || { status: 'skipped', detail: '' };
    lines.push(`| ${d.label} | ${statusZh(c.status)} | ${c.detail || ''} | ${d.why} |`);
  }
  lines.push('');

  const missing = coverage.filter(c => ['failed', 'empty', 'skipped', 'skipped_no_sku', 'script_missing'].includes(c.status));
  if (missing.length) {
    lines.push('## 缺失/待补维度');
    for (const m of missing) {
      const d = dimMap[m.key];
      lines.push(`- ${d ? d.label : m.key}: ${statusZh(m.status)}${m.detail ? ' — ' + m.detail : ''}`);
    }
    lines.push('');
  }

  if (intelligence && intelligence.operatingIntelligence) {
    const oi = intelligence.operatingIntelligence;
    lines.push('## 市场判读 (operating-intelligence)');
    lines.push(`- 决策质量: ${oi.decisionQuality || '-'}`);
    lines.push(`- 建议用法: ${text(oi.recommendedOperatingUse) || '-'}`);
    if (Array.isArray(oi.opportunityModels) && oi.opportunityModels.length) {
      lines.push(`- 机会模型: ${oi.opportunityModels.map(m => m.label || m.key).join(', ')}`);
    }
    if (Array.isArray(oi.riskSignals) && oi.riskSignals.length) {
      lines.push(`- 风险信号: ${oi.riskSignals.map(r => r.label || r.key || r).join(', ')}`);
    }
    if (Array.isArray(oi.missingEvidence) && oi.missingEvidence.length) {
      lines.push(`- 缺证据: ${oi.missingEvidence.map(m => m.label || m.key || m).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## 下一步');
  if (missing.length) {
    lines.push('补齐上面缺失维度后再下经营结论。补数命令：');
    if (mode === 'skip-fetch') {
      lines.push('- 去掉 --skip-fetch 实跑：先 `npm run chrome:ready` 确保选品后台已登录，再跑本命令');
    } else {
      lines.push('- 失败维度多为后台未登录/会话过期：`npm run chrome:ready` 后重跑');
    }
  } else {
    lines.push('维度齐全，可进入经营判断：market 结论 / 内部承接 / 机会风险 / 边界。');
  }
  lines.push('');
  lines.push('> 边界：本命令只产出只读市场证据，不写广告/价格/listing/库存。');
  return lines.join('\n');
}

// ---------- main ----------

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) {
    console.log('Usage: node scripts/execute/run_market_analysis.js --sku <SKU> [--asin <ASIN>] [--terms "t1,t2"] [--title "..."] [--skip-fetch] [--json] [--timeout-ms 120000]');
    return;
  }
  const sku = text(opt.sku);
  const asin = text(opt.asin);
  if (!sku && !asin && !opt.terms) {
    console.error('需要 --sku 或 --asin 或 --terms 之一');
    process.exit(1);
  }

  const identity = resolveIdentity({ sku, asin, title: opt.title });
  // backfill identity onto ctx (asin/title may have been resolved locally)
  const seedTerms = deriveSeedTerms({
    terms: opt.terms, title: identity.title || opt.title, sku: identity.sku, asin: identity.asin,
  });

  const skipFetch = !!opt['skip-fetch'];
  const timeoutMs = Number(opt['timeout-ms'] || 180000);
  const ctx = {
    sku: identity.sku, asin: identity.asin,
    seedTerms, termArg: seedTerms.join(', '), timeoutMs,
  };

  const fetchResults = {};
  let paResult = { ok: false, status: 'skipped' };

  if (skipFetch) {
    // aggregate from today's existing snapshots only
    for (const f of FETCHERS) {
      const outPath = path.join(SNAP_DIR, f.outFile());
      const produced = readJson(outPath);
      const rowCount = produced ? Number(produced.rowCount ?? (Array.isArray(produced.rows) ? produced.rows.length : 0)) || 0 : 0;
      fetchResults[f.key] = {
        ok: rowCount > 0, status: produced ? (rowCount > 0 ? 'present' : 'empty') : 'skipped',
        file: produced ? path.relative(ROOT, outPath) : null, rowCount,
      };
    }
    paResult = { ok: false, status: 'skipped' };
  } else {
    if (!seedTerms.length) {
      console.error('无法得到种子词：请用 --terms "term1,term2" 显式给词，或确认能从标题解析。');
      process.exit(1);
    }
    for (const f of FETCHERS) {
      process.stderr.write(`[market] ${f.label} ...\n`);
      fetchResults[f.key] = runFetcher(f, ctx);
    }
    process.stderr.write('[market] 内部承接 product-analysis ...\n');
    paResult = runProductAnalysis(ctx);
  }

  const intelligence = aggregate(ctx, fetchResults);
  const coverage = buildCoverage(identity, fetchResults, paResult);

  const report = {
    ok: true,
    capability: 'market::analyze::orchestrator',
    generatedAt: new Date().toISOString(),
    mode: skipFetch ? 'skip-fetch' : 'live',
    boundary: 'read_only_market_evidence',
    identity,
    seedTerms,
    fetchResults,
    productAnalysis: paResult,
    coverage,
    intelligence: intelligence && intelligence.operatingIntelligence
      ? { ok: intelligence.ok !== false, outFileNote: 'see operating-intelligence', operatingIntelligence: intelligence.operatingIntelligence, sourceReports: intelligence.sourceReports }
      : (intelligence || null),
  };

  // persist
  const outName = `market_analysis_${(sku || asin || 'adhoc').replace(/[^a-z0-9]/gi, '_')}_${todayYmd()}.json`;
  const outPath = path.join(SNAP_DIR, outName);
  try {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    report.outFile = path.relative(ROOT, outPath);
  } catch (_) { /* ignore */ }

  if (opt.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHuman(report));
    if (report.outFile) console.log('\n(完整 JSON: ' + report.outFile + ')');
  }
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error(e.stack || e.message); process.exit(1); }
}

module.exports = { resolveIdentity, deriveSeedTerms, buildCoverage, FETCHERS, DIMENSIONS };
