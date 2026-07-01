'use strict';

/**
 * 老品下滑归因诊断脚本
 *
 * 用法：npm run ops:old-product:diagnose -- --sku YUT-XXXX
 *
 * 自动流程：
 * 1. 环境检查（Node版本、依赖、Chrome debug、后台登录）
 * 2. 通过 CDP 拉取产品分析数据 + 广告汇总数据
 * 3. 按 SOP 归因矩阵诊断
 * 4. 输出《老品整改问题单》
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ─── CLI 参数解析 ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    sku: null,
    seller: process.env.SELLER || 'HJ17,HJ171,HJ172',
    days: 30,
    out: null,
    skipEnvCheck: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sku' && args[i + 1]) opts.sku = args[++i];
    else if (args[i] === '--seller' && args[i + 1]) opts.seller = args[++i];
    else if (args[i] === '--days' && args[i + 1]) opts.days = Number(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) opts.out = args[++i];
    else if (args[i] === '--skip-env-check') opts.skipEnvCheck = true;
    else if (!opts.sku && !args[i].startsWith('-')) opts.sku = args[i];
  }

  if (!opts.sku) {
    console.error('用法：npm run ops:old-product:diagnose -- --sku <SKU编号>');
    console.error('');
    console.error('示例：npm run ops:old-product:diagnose -- --sku YUT-001');
    process.exit(1);
  }

  return opts;
}

// ─── 环境检查 ────────────────────────────────────────────────────────────────

async function checkEnvironment(opts) {
  if (opts.skipEnvCheck) return;

  console.log('🔍 环境检查...');

  // 1. Node 版本
  const nodeVer = process.versions.node.split('.').map(Number);
  if (nodeVer[0] < 18) {
    console.error(`❌ Node.js 版本过低 (${process.version})，需要 >= 18`);
    process.exit(1);
  }
  console.log(`  ✅ Node.js ${process.version}`);

  // 2. 依赖检查
  const wsPath = path.join(PROJECT_ROOT, 'node_modules', 'ws');
  if (!fs.existsSync(wsPath)) {
    console.log('  📦 正在安装依赖...');
    execSync('npm install', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }
  console.log('  ✅ npm 依赖已就绪');

  // 3. Chrome debug 模式
  const chromeReady = await isChromeDebugRunning();
  if (!chromeReady) {
    console.log('  ⚠️  Chrome debug 模式未启动');
    console.log('  🚀 正在启动调试浏览器...');
    try {
      execSync('npm run chrome:debug', { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 5000 });
    } catch (_) {
      // chrome:debug 通常会保持运行，timeout 是预期的
    }
    // 等待启动
    await sleep(3000);
    const retryReady = await isChromeDebugRunning();
    if (!retryReady) {
      console.error('  ❌ Chrome debug 启动失败，请手动运行：npm run chrome:debug');
      console.error('     然后登录 sellerinventory.yswg.com.cn 和 adv.yswg.com.cn');
      process.exit(1);
    }
  }
  console.log('  ✅ Chrome debug 模式已运行');

  // 4. 后台登录检查
  const tabs = await listTabs();
  const hasInventory = tabs.some(t => t.url && t.url.includes('sellerinventory.yswg.com.cn'));
  const hasAdv = tabs.some(t => t.url && t.url.includes('adv.yswg.com.cn'));

  if (!hasInventory || !hasAdv) {
    console.log('  ⚠️  需要登录后台：');
    if (!hasInventory) console.log('     - sellerinventory.yswg.com.cn');
    if (!hasAdv) console.log('     - adv.yswg.com.cn');
    console.log('  请在调试浏览器中登录上述后台，然后重新运行本命令。');
    process.exit(1);
  }
  console.log('  ✅ 后台已登录');
  console.log('');
}

// ─── CDP 工具函数（仅环境检查用） ────────────────────────────────────────────

const CDP_URL = 'http://127.0.0.1:9222';

function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 5000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data || 'null')); }
        catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

async function isChromeDebugRunning() {
  try {
    await requestJson(`${CDP_URL}/json/version`);
    return true;
  } catch (_) {
    return false;
  }
}

async function listTabs() {
  try {
    return await requestJson(`${CDP_URL}/json/list`) || [];
  } catch (_) {
    return [];
  }
}

// ─── 数据拉取（调用现有脚本） ────────────────────────────────────────────────

async function fetchProductData(sku, seller) {
  console.log(`📊 正在拉取产品分析数据 (${sku})...`);
  const script = path.join(PROJECT_ROOT, 'scripts/execute/fetch_product_analysis_query2.js');
  const outFile = path.join(PROJECT_ROOT, 'data/snapshots', `_diagnose_product_${sku}.json`);
  const cmd = `node "${script}" --sku "${sku}" --seller "${seller}" --out "${outFile}"`;

  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000 });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    if (stderr.includes('Cannot find sellerinventory')) {
      throw new Error('未找到 sellerinventory 页面，请先登录');
    }
    throw new Error(`产品数据拉取失败: ${stderr.slice(0, 200)}`);
  }

  if (!fs.existsSync(outFile)) return [];
  const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  // 清理临时文件
  try { fs.unlinkSync(outFile); } catch (_) {}
  return payload.rows || payload.data || [];
}

async function fetchAdData(sku, days) {
  console.log(`📊 正在拉取广告数据 (${sku}, ${days}天)...`);
  const script = path.join(PROJECT_ROOT, 'scripts/execute/fetch_ad_sku_summary.js');
  const outFile = path.join(PROJECT_ROOT, 'data/snapshots', `_diagnose_ad${days}d_${sku}.json`);
  const cmd = `node "${script}" 4 ${days} "${sku}" "${outFile}"`;

  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000 });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`广告数据拉取失败: ${stderr.slice(0, 200)}`);
  }

  if (!fs.existsSync(outFile)) return [];
  const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  try { fs.unlinkSync(outFile); } catch (_) {}
  return payload.rows || payload.data || [];
}

async function fetchAdData7d(sku) {
  console.log(`📊 正在拉取 7天广告数据 (${sku})...`);
  const script = path.join(PROJECT_ROOT, 'scripts/execute/fetch_ad_sku_summary.js');
  const outFile = path.join(PROJECT_ROOT, 'data/snapshots', `_diagnose_ad7d_${sku}.json`);
  const cmd = `node "${script}" 4 7 "${sku}" "${outFile}"`;

  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000 });
  } catch (err) {
    // 7天数据拉取失败不阻断流程
    console.log('  ⚠️  7天广告数据拉取失败，跳过');
    return [];
  }

  if (!fs.existsSync(outFile)) return [];
  const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  try { fs.unlinkSync(outFile); } catch (_) {}
  return payload.rows || payload.data || [];
}

// ─── 数据合并 ────────────────────────────────────────────────────────────────

function mergeData(sku, productRows, adRows30d, adRows7d) {
  const product = productRows[0] || {};
  const ad30 = adRows30d.find(r => r.sku === sku || r.SKU === sku) || adRows30d[0] || {};
  const ad7 = adRows7d.find(r => r.sku === sku || r.SKU === sku) || adRows7d[0] || {};

  const num = (v) => v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null;

  return {
    asin: product.asin || product.ASIN || null,
    category: product.category || product.cate_name || null,
    units30d: num(product.sales_30) || num(product.sold_30),
    profit30d: num(product.refer_profit_sum),
    profitRate: num(product.reference_net_profit) ? num(product.reference_net_profit) / 100 : null,
    profitRankPct: null, // 需要全量数据才能算排名百分位
    invDays: num(product.sellable_days) || num(product.inventory_days),
    units30d_yoy: num(product.qty_yoy_over_1_year) ? num(product.qty_yoy_over_1_year) / 100 : null,
    gapToDeptAvg: null, // 需要部门均值数据

    // 30天广告
    adSpend30d: num(ad30.cost) || num(ad30.spend) || num(ad30.Spend),
    adSales30d: num(ad30.sales) || num(ad30.Sales),
    adOrders30d: num(ad30.orders) || num(ad30.Orders),
    adClicks30d: num(ad30.clicks) || num(ad30.Clicks),
    adImpressions30d: num(ad30.impressions) || num(ad30.Impressions),
    acos30d: num(ad30.acos) || num(ad30.ACoS) ? (num(ad30.acos) || num(ad30.ACoS)) / 100 : null,

    // 7天广告
    adSpend7d: num(ad7.cost) || num(ad7.spend) || num(ad7.Spend),
    adSales7d: num(ad7.sales) || num(ad7.Sales),
    adOrders7d: num(ad7.orders) || num(ad7.Orders),
    adClicks7d: num(ad7.clicks) || num(ad7.Clicks),
    adImpressions7d: num(ad7.impressions) || num(ad7.Impressions),
    acos7d: num(ad7.acos) || num(ad7.ACoS) ? (num(ad7.acos) || num(ad7.ACoS)) / 100 : null,
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  await checkEnvironment(opts);

  console.log(`🔬 开始诊断 SKU: ${opts.sku}`);
  console.log('─'.repeat(50));

  // 拉数据
  let productRows, adRows30d, adRows7d;
  try {
    productRows = await fetchProductData(opts.sku, opts.seller);
    adRows30d = await fetchAdData(opts.sku, opts.days);
    adRows7d = await fetchAdData7d(opts.sku);
  } catch (err) {
    console.error(`❌ 数据拉取失败: ${err.message}`);
    console.error('   请确认后台已登录且 SKU 编号正确');
    process.exit(1);
  }

  if (productRows.length === 0 && adRows30d.length === 0) {
    console.error(`❌ 未找到 SKU "${opts.sku}" 的任何数据`);
    console.error('   请检查 SKU 编号是否正确');
    process.exit(1);
  }

  console.log(`  ✅ 产品数据: ${productRows.length} 行`);
  console.log(`  ✅ 广告数据(30天): ${adRows30d.length} 行`);
  console.log(`  ✅ 广告数据(7天): ${adRows7d.length} 行`);
  console.log('');

  // 合并数据
  const rawData = mergeData(opts.sku, productRows, adRows30d, adRows7d);

  // 归因诊断
  const { diagnose } = require(path.join(PROJECT_ROOT, 'src', 'old_product_decline_sop.js'));
  const result = diagnose(opts.sku, rawData);

  // 输出报告
  console.log(result.report);

  // 保存文件
  const outDir = path.join(PROJECT_ROOT, 'data', 'diagnose');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const mdPath = opts.out || path.join(outDir, `diagnose_${opts.sku}_${today}.md`);
  const jsonPath = mdPath.replace(/\.md$/, '.json');

  fs.writeFileSync(mdPath, result.report, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');

  console.log('─'.repeat(50));
  console.log(`💾 报告已保存：`);
  console.log(`   ${mdPath}`);
  console.log(`   ${jsonPath}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error(`❌ 脚本异常: ${err.message}`);
  process.exit(1);
});
