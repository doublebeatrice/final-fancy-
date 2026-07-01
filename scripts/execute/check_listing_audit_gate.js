#!/usr/bin/env node
'use strict';

/**
 * Listing audit gate — read-only landing check for sellerinventory 新品 listing 审核页.
 *
 * 这是一道闸,不是填表器。它做且只做一件事:在你/我说"做完了"之前,
 * 开一个全新审核页(新 tempid),把每个"填了值≠做完"的坑字段从实时后台读回来,
 * 逐条判 PASS / FAIL / INFO,只要文案主体没真落地就报 BLOCKED,不让收工。
 *
 * 它绝不替你翻「关键词已填」=正式提交那一步(那一步你拍板)。
 *
 * 背景坑(全部来自现场踩坑,见 playbooks/new-product-listing-writing.md):
 *  - 类别选择:要走「上传类别」弹窗两级下拉再保存,光塞隐藏 input 前台是空的。
 *  - Search items:要点页面「格式化」按钮,系统会去重压缩;填了 242 字不点=没做完。
 *  - 已核对:要真点 layui 单选触发联动,只改 checked 无效。
 *  - 保存成功≠落地:必须开新 iframe(新 tempid)回读,读同一个 iframe 是自指的。
 *
 * 用法:
 *   node scripts/execute/check_listing_audit_gate.js --product-id 2112835 [--sku PUM2441]
 *   node scripts/execute/check_listing_audit_gate.js --product-id 2112835 --no-open   # 读当前已开的审核页(不独立)
 *   node scripts/execute/check_listing_audit_gate.js --product-id 2112835 --json
 *
 * 退出码:0 = 全绿(可提交 / 已提交并回读到);2 = BLOCKED(有坑没落地);1 = 运行错误。
 */

const { listTabs, evaluate, openTab, closeTab } = require('../../discovery/lib/cdp');

const AUDIT_HOST = 'sellerinventory.yswg.com.cn';
const AUDIT_PATH = '/pm/audit_view';

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : '';
  };
  return {
    productId: get('--product-id') || get('--pid') || '',
    sku: get('--sku') || '',
    browserUrl: get('--browser-url') || process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222',
    open: !args.includes('--no-open'),
    keep: args.includes('--keep'),
    json: args.includes('--json'),
    timeoutMs: Number(get('--timeout') || 20000),
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- shell discovery -------------------------------------------------------

async function findShellTab(browserUrl) {
  const tabs = (await listTabs(browserUrl)) || [];
  const pages = tabs.filter(t => t.type === 'page' && typeof t.url === 'string');
  // The home shell hosts the layadmin frame + openTabsPage. Prefer the host root / index.
  const shell = pages.find(t => t.url.includes(AUDIT_HOST) && /\/(index|home)?\b/.test(t.url) && !t.url.includes(AUDIT_PATH))
    || pages.find(t => t.url.includes(AUDIT_HOST));
  return shell || null;
}

// Read the Inventory-Token. It is shared across ALL sellerinventory inner pages
// (audit_view / pm/list / pm/formal/list ...), and mirrored in localStorage.surfaceKey.
// Never persisted to disk. We only read it at runtime to open a fresh audit page.
async function readToken(shell, browserUrl) {
  const expr = `(() => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    for (const f of frames) {
      const src = f.getAttribute('src') || '';
      const m = src.match(/Inventory-Token=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    try {
      const sk = localStorage.getItem('surfaceKey');
      if (sk) return sk;
    } catch (_) {}
    return '';
  })()`;
  try { return await evaluate(shell, expr, false, { browserUrl }); } catch (_) { return ''; }
}

// Open a fresh audit page (new tempid) via the shell's own openTabsPage, the only safe way.
async function openFreshAudit(shell, productId, token, browserUrl, timeoutMs) {
  const tempid = String(Date.now());
  const url = `https://${AUDIT_HOST}${AUDIT_PATH}?product_id=${productId}&is_hint_contact=0&tempid=${tempid}`
    + (token ? `&Inventory-Token=${encodeURIComponent(token)}` : '');
  const openExpr = `(() => {
    try {
      const L = window.layui && window.layui.index;
      if (L && typeof L.openTabsPage === 'function') {
        L.openTabsPage(${JSON.stringify(url)}, ${JSON.stringify('审核GATE ' + productId)});
        return 'opened-via-shell';
      }
      return 'no-openTabsPage';
    } catch (e) { return 'err:' + e.message; }
  })()`;
  const res = await evaluate(shell, openExpr, false, { browserUrl });
  if (res !== 'opened-via-shell') return { ok: false, reason: res, tempid };

  // Poll until the fresh iframe (matching tempid) has rendered the main form (title field present).
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(600);
    const ready = await evaluate(shell, `(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const f = frames.find(x => (x.getAttribute('src')||'').includes('tempid=${tempid}'));
      if (!f) return 'no-frame';
      try {
        const d = f.contentWindow.document;
        if (!d) return 'no-doc';
        if (d.readyState !== 'complete') return 'loading';
        return d.querySelector('[name="title_en_file_audit"]') ? 'ready' : 'loading';
      } catch (e) { return 'err:' + e.message; }
    })()`, false, { browserUrl });
    if (ready === 'ready') return { ok: true, tempid };
  }
  return { ok: false, reason: 'timeout', tempid };
}

// Close the layui tab this gate opened (match by tempid in its lay-id). Keeps the workspace clean.
async function closeFreshAudit(shell, tempid, browserUrl) {
  if (!tempid) return;
  const expr = `(() => {
    try {
      const lis = Array.from(document.querySelectorAll('.layui-tab-title li'));
      const li = lis.find(x => (x.getAttribute('lay-id')||'').includes('tempid=${tempid}'));
      if (!li) return 'no-tab';
      const close = li.querySelector('.layui-tab-close');
      if (close) { close.click(); return 'closed'; }
      return 'no-close-icon';
    } catch (e) { return 'err:' + e.message; }
  })()`;
  try { await evaluate(shell, expr, false, { browserUrl }); } catch (_) {}
}

// ---- field reader (runs inside the audit iframe via same-origin contentWindow) ----

function buildReadExpr(tempid) {
  const frameSelector = tempid
    ? `frames.find(x => (x.getAttribute('src')||'').includes('tempid=${tempid}'))`
    : `frames.find(x => (x.getAttribute('src')||'').includes('${AUDIT_PATH}'))`;
  return `(() => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const f = ${frameSelector};
    if (!f) return { error: 'audit iframe not found' };
    let d;
    try { d = f.contentWindow.document; } catch (e) { return { error: 'iframe cross-origin: ' + e.message }; }
    if (!d) return { error: 'iframe doc empty' };
    const val = name => {
      const els = Array.from(d.querySelectorAll('[name="' + name + '"]'));
      if (!els.length) return null;
      const radios = els.filter(e => e.type === 'radio');
      if (radios.length) { const c = radios.find(e => e.checked); return c ? c.value : ''; }
      return (els[0].value != null ? els[0].value : '').toString();
    };
    const selText = name => {
      const el = d.querySelector('select[name="' + name + '"]');
      if (!el) return null;
      const opt = el.options[el.selectedIndex];
      return opt ? (opt.text || '').trim() : '';
    };
    return {
      ok: true,
      src: f.getAttribute('src') || '',
      title_en_file_audit: val('title_en_file_audit'),
      parent_title: val('parent_title'),
      product_description: val('product_description'),
      search_core_keywords: val('search_core_keywords'),
      adv_core_keywords: val('adv_core_keywords'),
      adv_low_competition_keywords: val('adv_low_competition_keywords'),
      adv_up_down_keywords: val('adv_up_down_keywords'),
      register_type: val('register_type'),
      type_num: val('type_num'),
      is_check_pack_number: val('is_check_pack_number'),
      us_upload_type: val('us_upload_type'),
      us_item_type: val('us_item_type'),
      us_item_type_code: val('us_item_type_code'),
      competitor_brand_info: val('competitor_brand_info'),
      copy_ideas: val('copy_ideas'),
      keywords_audit_status: val('keywords_audit_status'),
      market_analysis: val('market_analysis'),
      age_recommend: val('age_recommend'),
      us_same_seller_0: val('us_same_seller[0]'),
      us_similar_seller_0: val('us_similar_seller[0]')
    };
  })()`;
}

// ---- gates -----------------------------------------------------------------

const GARBLED = s => typeof s === 'string' && (/\?{3,}/.test(s) || s.includes('�'));

function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }

// Heuristic: 点过「格式化」的 search items 不该有重复词。有重复=很可能没点格式化。
function looksFormatted(s) {
  if (!nonEmpty(s)) return false;
  const toks = s.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return false;
  const uniq = new Set(toks);
  return uniq.size === toks.length; // 无重复词
}

function buildGates(d) {
  const g = [];
  const push = (key, label, status, detail) => g.push({ key, label, status, detail });

  // 文案主体 —— 我该填的,必须全绿
  push('title', '标题 title_en_file_audit',
    nonEmpty(d.title_en_file_audit) ? (GARBLED(d.title_en_file_audit) ? 'FAIL' : 'PASS') : 'FAIL',
    nonEmpty(d.title_en_file_audit) ? `${d.title_en_file_audit.length} 字${GARBLED(d.title_en_file_audit) ? ' ⚠乱码' : ''}` : '空');

  push('parent_title', '母体标题 parent_title',
    nonEmpty(d.parent_title) ? 'PASS' : 'FAIL',
    nonEmpty(d.parent_title) ? `${d.parent_title.length} 字` : '空');

  const pdStruct = ['Features', 'Specification', 'Package', 'Note'].filter(k => (d.product_description || '').toLowerCase().includes(k.toLowerCase()));
  push('pd', 'Product Description',
    nonEmpty(d.product_description) ? (pdStruct.length >= 3 ? 'PASS' : 'WARN') : 'FAIL',
    nonEmpty(d.product_description) ? `${d.product_description.length} 字, 模板段:${pdStruct.join('/') || '缺'}` : '空');

  push('search', 'Search items（格式化坑）',
    !nonEmpty(d.search_core_keywords) ? 'FAIL' : (looksFormatted(d.search_core_keywords) ? 'PASS' : 'WARN'),
    !nonEmpty(d.search_core_keywords) ? '空'
      : `${d.search_core_keywords.length} 字${looksFormatted(d.search_core_keywords) ? '' : ' ⚠有重复词,疑似没点格式化'}`);

  const adv = [d.adv_core_keywords, d.adv_low_competition_keywords, d.adv_up_down_keywords];
  push('adv', '广告三类词（核心/低竞争/长尾）',
    adv.every(nonEmpty) ? 'PASS' : 'FAIL',
    `核心${nonEmpty(d.adv_core_keywords) ? '✓' : '✗'} 低竞争${nonEmpty(d.adv_low_competition_keywords) ? '✓' : '✗'} 长尾${nonEmpty(d.adv_up_down_keywords) ? '✓' : '✗'}`);

  push('register', '商标类别+小类编码',
    nonEmpty(d.register_type) && nonEmpty(d.type_num) ? 'PASS' : 'FAIL',
    `类别=${d.register_type || '空'} 小类=${d.type_num || '空(只填类别漏小类=没填全)'}`);

  push('pack', '已核对（layui 单选坑）',
    d.is_check_pack_number === '1' ? 'PASS' : 'FAIL',
    d.is_check_pack_number === '1' ? '是' : `当前=${d.is_check_pack_number || '空'}（要真点单选翻「是」）`);

  push('category', '上传类别（弹窗坑）',
    nonEmpty(d.us_upload_type) && d.us_upload_type !== '0' && nonEmpty(d.us_item_type) ? 'PASS' : 'FAIL',
    `US一级=${d.us_upload_type || '空'} item_type=${d.us_item_type || '空（要走上传类别弹窗两级下拉+保存）'}`);

  push('competitor', '竞卖品牌名',
    nonEmpty(d.competitor_brand_info) ? 'PASS' : 'FAIL',
    nonEmpty(d.competitor_brand_info) ? `${(d.competitor_brand_info.split(',').filter(Boolean)).length} 个` : '空');

  push('copy_ideas', '文案优化思路 copy_ideas',
    nonEmpty(d.copy_ideas) ? 'PASS' : 'WARN',
    nonEmpty(d.copy_ideas) ? `${d.copy_ideas.length} 字` : '空');

  // 中文乱码全扫
  const garbledFields = ['title_en_file_audit', 'parent_title', 'product_description', 'search_core_keywords', 'competitor_brand_info', 'copy_ideas']
    .filter(k => GARBLED(d[k]));
  push('garbled', '中文乱码扫描',
    garbledFields.length ? 'FAIL' : 'PASS',
    garbledFields.length ? `乱码字段:${garbledFields.join(',')}` : '无 ??? / \\uFFFD');

  // 开发/选品字段 —— INFO,不卡保存、不算我没做完
  push('dev_market', '市场分析 market_analysis（选品/开发）',
    'INFO', nonEmpty(d.market_analysis) ? '已填' : '空（要TOP5利润率,AI没数据,不编;归选品）');
  push('dev_seller', '竞品同款/相似款链接（选品/开发）',
    'INFO', nonEmpty(d.us_same_seller_0) || nonEmpty(d.us_similar_seller_0) ? '已填' : '空（选品判断选哪几个卖最好;不卡保存）');

  // 提交闸 —— 你拍板,本工具只读不翻
  push('submit', '关键词状态 keywords_audit_status（你拍板提交）',
    d.keywords_audit_status === '1' ? 'DONE' : 'PENDING',
    d.keywords_audit_status === '1' ? '已填=已提交' : '未填=未提交（文案全绿后由你/我真点 layui 单选翻「已填」再回读）');

  return g;
}

function verdict(gates) {
  const blocking = gates.filter(g => g.status === 'FAIL');
  const submit = gates.find(g => g.key === 'submit');
  if (blocking.length) return { code: 2, label: `BLOCKED — ${blocking.length} 项没真落地`, blocking };
  if (submit && submit.status === 'DONE') return { code: 0, label: 'SUBMITTED & VERIFIED — 文案全绿,关键词已提交并回读到', blocking: [] };
  return { code: 0, label: 'READY TO SUBMIT — 文案全绿,可以翻「关键词已填」提交了（这步你拍板）', blocking: [] };
}

// ---- main ------------------------------------------------------------------

const ICON = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ', INFO: 'ℹ️ ', DONE: '🟢', PENDING: '⏳' };

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.productId) {
    console.error('用法: node scripts/execute/check_listing_audit_gate.js --product-id <id> [--sku <SKU>] [--no-open] [--json]');
    process.exit(1);
  }

  const shell = await findShellTab(opts.browserUrl);
  if (!shell) {
    console.error(`❌ 找不到 ${AUDIT_HOST} 外壳页。先用 npm run chrome:ready 复用已登录实例,并打开 sellerinventory 首页。`);
    process.exit(1);
  }

  let tempid = '';
  let openedTab = null;
  if (opts.open) {
    const token = await readToken(shell, opts.browserUrl);
    if (!token) {
      console.error('⚠️  读不到 Inventory-Token(外壳页没有任何 sellerinventory 内页 iframe,也没有 surfaceKey)。先用 npm run chrome:ready 复用已登录实例并打开 sellerinventory 首页,或用 --no-open 读当前页。');
      process.exit(1);
    }
    const r = await openFreshAudit(shell, opts.productId, token, opts.browserUrl, opts.timeoutMs);
    if (!r.ok) {
      console.error(`❌ 开新审核页失败: ${r.reason}。可改用 --no-open 读当前页。`);
      process.exit(1);
    }
    tempid = r.tempid;
  }

  const data = await evaluate(shell, buildReadExpr(tempid), false, { browserUrl: opts.browserUrl });

  // Self-clean: close the tab we opened, so the gate never litters the workspace.
  if (tempid && !opts.keep) await closeFreshAudit(shell, tempid, opts.browserUrl);

  if (!data || data.error) {
    console.error(`❌ 读审核字段失败: ${data && data.error ? data.error : '无返回'}`);
    process.exit(1);
  }

  const gates = buildGates(data);
  const v = verdict(gates);

  if (opts.json) {
    console.log(JSON.stringify({
      productId: opts.productId, sku: opts.sku,
      independentReadback: !!tempid, tempid: tempid || null,
      verdict: v.label, code: v.code, gates,
    }, null, 2));
    process.exit(v.code);
  }

  console.log('');
  console.log(`审核落地闸  product_id=${opts.productId}${opts.sku ? '  SKU=' + opts.sku : ''}`);
  console.log(`独立回读: ${tempid ? '是(新 tempid=' + tempid + ')' : '否(读当前页,自指,仅供参考)'}`);
  console.log('─'.repeat(64));
  for (const g of gates) {
    console.log(`${ICON[g.status] || '  '} ${g.label.padEnd(30, ' ')} ${g.detail}`);
  }
  console.log('─'.repeat(64));
  console.log(`判定: ${v.label}`);
  if (v.blocking.length) {
    console.log('没落地的坑(必须补完再说做完):');
    for (const b of v.blocking) console.log(`   ❌ ${b.label} — ${b.detail}`);
  }
  console.log('');
  process.exit(v.code);
}

main().catch(err => {
  console.error('运行错误:', err && err.message ? err.message : err);
  process.exit(1);
});
