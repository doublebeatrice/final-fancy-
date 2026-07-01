'use strict';

/**
 * 老品下滑归因诊断 v2（多源数据版）
 *
 * 用法：
 *   node diagnose.js                  → 自动发现同期下滑SKU并诊断
 *   node diagnose.js --sku AE3311     → 诊断指定SKU
 *
 * 数据来源：广告系统(adv) + SIF(前台流量) + inventory(可选)
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { isChromeReady, findTab, listTabs, evaluate, openNewTab, listAllTargets } = require('./lib/cdp');
const { diagnose } = require('./lib/sop_rules_v2');
const ds = require('./lib/data_sources');

const SKILL_ROOT = __dirname;

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  var args = process.argv.slice(2);
  var opts = { sku: null, seller: null, top: 5 };
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--sku' && args[i + 1]) opts.sku = args[++i];
    else if (args[i] === '--seller' && args[i + 1]) opts.seller = args[++i];
    else if (args[i] === '--top' && args[i + 1]) opts.top = Number(args[++i]);
    else if (!opts.sku && !args[i].startsWith('-')) opts.sku = args[i];
  }
  return opts;
}

// ─── 环境检查（全自动，零门槛） ──────────────────────────────────────────────

var CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
var CHROME_PROFILE = 'C:\\chrome-debug-profile';
var REQUIRED_SITES = [
  { key: 'adv', url: 'https://adv.yswg.com.cn', label: '广告后台', required: true },
  { key: 'sif', url: 'https://www.sif.com', label: 'SIF（前台流量）', required: false },
  { key: 'inv', url: 'https://sellerinventory.yswg.com.cn', label: 'sellerinventory（同比数据）', required: false },
];

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function launchChrome() {
  var chromePath = CHROME_PATH;
  if (!fs.existsSync(chromePath)) {
    var altPaths = [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (var i = 0; i < altPaths.length; i++) {
      if (fs.existsSync(altPaths[i])) { chromePath = altPaths[i]; break; }
    }
  }
  if (!fs.existsSync(chromePath)) {
    console.error('  ❌ 找不到 Chrome，请安装 Google Chrome');
    process.exit(1);
  }

  console.log('  🚀 正在启动 Chrome debug 模式...');
  var args = [
    '--remote-debugging-port=9222',
    '--user-data-dir=' + CHROME_PROFILE,
  ];
  var child = require('child_process').spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  child.unref();

  // 等 Chrome 就绪
  for (var attempt = 0; attempt < 15; attempt++) {
    await sleep(1000);
    if (await isChromeReady()) return true;
  }
  console.error('  ❌ Chrome 启动超时');
  process.exit(1);
}

async function waitForLogin(siteCfg, maxWaitSec) {
  maxWaitSec = maxWaitSec || 240;
  var matchDomain = siteCfg.key === 'sif' ? 'sif.com' :
    siteCfg.key === 'adv' ? 'adv.yswg.com.cn' : 'sellerinventory.yswg.com.cn';
  console.log('  ⏳ 等待 ' + siteCfg.label + ' 登录完成（最多' + maxWaitSec + '秒）...');
  var checks = Math.ceil(maxWaitSec / 2);
  for (var i = 0; i < checks; i++) {
    await sleep(2000);
    var tabs = await listAllTargets();
    var found = tabs.some(function(t) {
      if (!t.url || !t.url.includes(matchDomain)) return false;
      if (t.type !== 'page') return false;
      // 确认不在登录页
      return !t.url.includes('/login') && !t.url.includes('/user/login');
    });
    if (found) return true;
  }
  return false;
}

async function openAndWaitLogin(siteCfg, maxWaitSec) {
  // 打开目标网站
  await openNewTab(siteCfg.url);
  console.log('  👉 已打开 ' + siteCfg.label);

  // 等页面加载，然后尝试自动点击企微快捷登录
  await sleep(3000);
  var loginClicked = await tryWeComAutoLogin(siteCfg);
  if (loginClicked) {
    console.log('  🔑 已自动点击企微快捷登录');
  }

  return await waitForLogin(siteCfg, maxWaitSec);
}

async function tryWeComAutoLogin(siteCfg) {
  var matchDomain = siteCfg.key === 'sif' ? 'sif.com' :
    siteCfg.key === 'adv' ? 'adv.yswg.com.cn' : 'sellerinventory.yswg.com.cn';

  // 找到刚打开的登录页标签
  var allTargets = await listAllTargets();
  var loginTab = allTargets.find(function(t) {
    return t.url && t.url.includes(matchDomain) && t.webSocketDebuggerUrl;
  });
  if (!loginTab) return false;

  // 等待企微 iframe 加载（最多 10 秒）
  for (var i = 0; i < 10; i++) {
    await sleep(1000);
    try {
      var hasFrame = await evaluate(loginTab,
        '!!Array.from(document.querySelectorAll("iframe")).find(function(f){return f.src&&f.src.includes("login.work.weixin.qq.com")})'
      );
      if (hasFrame) break;
    } catch (_) {}
  }

  // 找企微 iframe 标签页（Chrome 把 iframe 暴露为 type=iframe 的 target）
  allTargets = await listAllTargets();
  var wecomFrame = allTargets.find(function(t) {
    return t.type === 'iframe' &&
      t.url && t.url.includes('login.work.weixin.qq.com') &&
      decodeURIComponent(t.url).includes(siteCfg.url.replace('https://', '').replace('http://', '').split('/')[0]) &&
      t.webSocketDebuggerUrl;
  });

  if (!wecomFrame) {
    // 兜底：直接在父页面尝试点击
    wecomFrame = allTargets.find(function(t) {
      return t.type === 'iframe' &&
        t.url && t.url.includes('login.work.weixin.qq.com') &&
        t.webSocketDebuggerUrl;
    });
  }

  if (!wecomFrame) return false;

  try {
    var clickResult = await evaluate(wecomFrame, '(function(){' +
      'var keywords=["继续在浏览器中登录访问","Log in and access in the browser"];' +
      'var nodes=Array.from(document.querySelectorAll("a,button,span,div"));' +
      'var hit=nodes.find(function(n){var t=(n.innerText||n.textContent||"").trim();return keywords.some(function(k){return t.includes(k)})});' +
      'if(hit){hit.click();return"clicked"}return"not_found"' +
      '})()'
    );
    return clickResult === 'clicked';
  } catch (_) {
    return false;
  }
}

async function checkEnv() {
  console.log('🔍 环境检查...');

  // 1. ws 依赖
  try { require('ws'); }
  catch (_) {
    console.log('  📦 安装 ws 依赖...');
    execSync('npm init -y && npm install ws', { cwd: SKILL_ROOT, stdio: 'pipe' });
  }

  // 2. Chrome debug 模式
  if (!(await isChromeReady())) {
    await launchChrome();
  }
  console.log('  ✅ Chrome debug 已运行');

  // 3. 检查各后台登录状态，未登录的自动打开+企微快捷登录
  var tabs = await listAllTargets();
  for (var i = 0; i < REQUIRED_SITES.length; i++) {
    var site = REQUIRED_SITES[i];
    var matchDomain = site.key === 'sif' ? 'sif.com' :
      site.key === 'adv' ? 'adv.yswg.com.cn' : 'sellerinventory.yswg.com.cn';
    var hasLoggedIn = tabs.some(function(t) {
      return t.type === 'page' && t.url && t.url.includes(matchDomain) &&
        !t.url.includes('/login') && !t.url.includes('/user/login');
    });

    if (hasLoggedIn) {
      console.log('  ✅ ' + site.label);
    } else if (site.required) {
      var ok = await openAndWaitLogin(site);
      if (ok) {
        console.log('  ✅ ' + site.label + '（已登录）');
      } else {
        console.error('  ❌ ' + site.label + ' 登录超时（等待4分钟未完成）');
        process.exit(1);
      }
    } else {
      // 非必须的也尝试打开，给30秒登录时间，超时跳过不阻塞
      var hasAnyTab = tabs.length > 0;
      if (hasAnyTab) {
        var optOk = await openAndWaitLogin(site, 30);
        if (optOk) console.log('  ✅ ' + site.label + '（已登录）');
        else console.log('  ⚠️  ' + site.label + ' 未登录（跳过，不影响核心诊断）');
      } else {
        console.log('  ⚠️  ' + site.label + ' 未登录（跳过）');
      }
    }
  }
  console.log('');
}

// ─── 单SKU完整诊断 ──────────────────────────────────────────────────────────

async function diagnoseSingleSku(advMetrics, sellers, invStatus, sellerYoyData) {
  var data = Object.assign({}, advMetrics);

  // SIF 数据
  if (data.asin) {
    try {
      var overview = await ds.fetchSifKeywordOverview(data.asin);
      if (overview) {
        data.sifOverview = overview;
        var topKw = await ds.fetchSifTopKeywords(data.asin, 5);
        if (topKw) data.sifTopKeywords = topKw;
      }
    } catch (_) {}
  }

  // Inventory 数据 — 优先 query2（精确到 SKU），fallback 到 seller 级
  if (invStatus !== 'session_expired' && invStatus !== 'no_tab' && invStatus !== 'seller_yoy_fallback') {
    try {
      var inv = await ds.fetchInventoryData(data.sku, sellers.join(','));
      if (inv.status === 'ok' && inv.data) {
        if (inv.data.yoyQty != null) data.yoyQty = Math.round(inv.data.yoyQty * 100);
        if (inv.data.profitRate != null) data.profitRate = inv.data.profitRate;
        if (inv.data.sellableDays != null) data.sellableDays = inv.data.sellableDays;
        if (inv.data.profitSum != null) data.profitSum = inv.data.profitSum;
      } else if (inv.status === 'session_expired') {
        invStatus = 'session_expired';
      }
    } catch (_) {}
  }

  // Seller 级同比 fallback
  if (data.yoyQty == null && sellerYoyData) {
    data.yoyQty = Math.round(sellerYoyData.sellerYoy * 100);
    data._yoySource = 'seller';
  }

  data._invStatus = invStatus;
  return diagnose(data);
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  var opts = parseArgs();
  await checkEnv();

  // 获取 sellers
  var sellers = opts.seller
    ? opts.seller.split(',').map(function(s) { return s.trim(); })
    : await ds.discoverSellers();
  if (sellers.length === 0) {
    console.error('❌ 无法获取销售编号');
    process.exit(1);
  }
  console.log('👤 销售编号：' + sellers.join(', '));

  // 探测 inventory session 状态 + 获取 seller 级同比
  var invStatus = 'ok';
  var sellerYoyData = null;
  try {
    await ds.ensureProductAnalysisPage();
    var sessionCheck = await ds.checkInventorySession();
    if (!sessionCheck.ok) {
      invStatus = 'session_expired';
      // Fallback: 尝试 /pm/sale/getBySeller 获取 seller 级同比
      sellerYoyData = await ds.fetchSellerYoyData(sellers);
      if (sellerYoyData) {
        console.log('  ⚠️  产品分析模块不可用，使用 seller 级同比数据');
        console.log('     seller 整体同比：' + (sellerYoyData.sellerYoy != null ? (sellerYoyData.sellerYoy > 0 ? '+' : '') + Math.round(sellerYoyData.sellerYoy * 100) + '%' : 'N/A'));
        invStatus = 'seller_yoy_fallback';
      } else {
        console.log('  ⚠️  sellerinventory session 已过期（同比数据不可用）');
        console.log('     → 请在浏览器中刷新 sellerinventory.yswg.com.cn 并重新登录');
      }
    }
  } catch (_) {
    invStatus = 'no_tab';
  }

  // 拉广告全量数据
  console.log('📊 正在拉取广告数据...');
  var allRows = await ds.fetchAdvFullList(sellers);
  console.log('   获取到 ' + allRows.length + ' 个投放中的SKU');
  console.log('');

  if (opts.sku) {
    // ─── 指定SKU模式 ─────────────────────────────────────────────────────
    var target = allRows.find(function(r) { return r.sku === opts.sku; });
    if (!target) {
      console.error('❌ 广告系统中未找到 SKU: ' + opts.sku);
      process.exit(1);
    }
    var metrics = ds.extractAdvMetrics(target);
    metrics.orderChange = metrics.orders30dPrev > 0
      ? (metrics.orders30d - metrics.orders30dPrev) / metrics.orders30dPrev : 0;

    console.log('🔬 诊断 ' + opts.sku + ' (ASIN: ' + (metrics.asin || 'N/A') + ')');
    console.log('─'.repeat(50));
    var result = await diagnoseSingleSku(metrics, sellers, invStatus, sellerYoyData);
    console.log(result.report);
    saveReport(opts.sku, result);
  } else {
    // ─── 自动发现模式 ─────────────────────────────────────────────────────
    console.log('🔎 正在识别环比下滑的SKU（30天订单 vs 上期）...');
    var declining = ds.identifyDeclining(allRows, -0.15);

    if (declining.length === 0) {
      console.log('✅ 未发现环比下滑>15%的SKU，整体运行正常');
      return;
    }

    console.log('   发现 ' + declining.length + ' 个下滑SKU');
    declining.slice(0, opts.top).forEach(function(d, i) {
      console.log('   ' + (i + 1) + '. ' + d.sku + '  ' + d.orders30dPrev + '→' + d.orders30d + '单 (' + Math.round(d.orderChange * 100) + '%)');
    });
    console.log('');

    var topList = declining.slice(0, opts.top);
    console.log('═'.repeat(50));
    console.log('📋 逐个诊断（共' + topList.length + '个，含SIF前台数据）');
    console.log('═'.repeat(50));

    var results = [];
    for (var i = 0; i < topList.length; i++) {
      var item = topList[i];
      console.log('');
      console.log('─'.repeat(50));
      console.log('【' + (i + 1) + '/' + topList.length + '】' + item.sku + ' (ASIN: ' + (item.asin || 'N/A') + ')');
      console.log('─'.repeat(50));

      var result = await diagnoseSingleSku(item, sellers, invStatus, sellerYoyData);
      console.log(result.report);
      results.push(result);
      saveReport(item.sku, result);
    }

    // 汇总
    console.log('');
    console.log('═'.repeat(50));
    console.log('📊 诊断汇总');
    console.log('═'.repeat(50));
    results.forEach(function(r, i) {
      var cause = r.attribution.rootCauses[0] ? r.attribution.rootCauses[0].cause : '待确认';
      console.log((i + 1) + '. ' + r.sku + ' [' + r.risk + '风险] ' + r.grading.grade + ' → ' + cause);
    });
    console.log('');
    console.log('💾 报告已保存至 ' + path.join(SKILL_ROOT, 'output') + '/');
  }
}

function saveReport(sku, result) {
  var outDir = path.join(SKILL_ROOT, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  var today = new Date().toISOString().slice(0, 10);
  var mdPath = path.join(outDir, sku + '_' + today + '.md');
  fs.writeFileSync(mdPath, result.report, 'utf8');
  fs.writeFileSync(mdPath.replace(/\.md$/, '.json'), JSON.stringify(result, null, 2), 'utf8');
}

main().catch(function(err) { console.error('❌ ' + err.message); process.exit(1); });
