'use strict';

/**
 * 多源数据拉取层（adv + SIF + inventory）
 *
 * 数据源优先级：
 * 1. adv（广告系统）— 必须，提供 SKU 列表、订单环比、ACoS、CTR、ASIN、价格、上架日期
 * 2. SIF — 必须，提供关键词排名变化、自然流量词进出、竞品占位
 * 3. inventory（sellerinventory）— 可选，提供同比(yoy)、利润率、库存天数
 */

const { findTab, evaluate, listTabs } = require('./cdp');

// ─── Seller 发现 ────────────────────────────────────────────────────────────

async function discoverSellers() {
  var tab = await findTab('sellerinventory.yswg.com.cn');
  if (tab) {
    var expr = '(function(){var keys=Object.keys(localStorage).filter(function(k){return k.startsWith("seller_tree_")});if(!keys.length)return"[]";var tree=JSON.parse(localStorage.getItem(keys[0]));return JSON.stringify(tree.users.map(function(u){return u.value}))})()';
    var raw = await evaluate(tab, expr);
    var sellers = JSON.parse(raw);
    if (sellers.length > 0) return sellers;
  }
  return [];
}

// ─── 广告系统（核心数据源） ─────────────────────────────────────────────────

function buildAdvExpr(endpoint, payload) {
  var argsJson = JSON.stringify({ ep: endpoint, p: payload });
  return '(async()=>{var a=' + argsJson + ';var x=document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1]||"";var r=await fetch(a.ep,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","x-xsrf-token":decodeURIComponent(x)},body:JSON.stringify(a.p)});var t=await r.text();if(t.trimStart().startsWith("<"))return JSON.stringify({ok:false,err:"html"});var j=JSON.parse(t);var list=j?.data?.data||j?.data?.list||j?.data||[];return JSON.stringify({ok:true,total:j?.data?.total||list.length,rows:Array.isArray(list)?list:[]})})()';
}

async function fetchAdvFullList(sellers) {
  var tab = await findTab('adv.yswg.com.cn');
  if (!tab) throw new Error('未找到广告后台页面');
  var PAGE_SIZE = 200;
  var payload = {
    siteId: 4, mode: 1, day: 30,
    userName: sellers,
    level: 'seller_num', field: 'cost', order: 'desc',
    page: 1, limit: PAGE_SIZE
  };
  var raw = await evaluate(tab, buildAdvExpr('/product/adSkuSummary', payload));
  var result = JSON.parse(raw);
  if (!result.ok) throw new Error('广告数据失败: ' + result.err);
  var allRows = result.rows;
  var total = result.total || allRows.length;
  while (allRows.length < total) {
    payload.page++;
    raw = await evaluate(tab, buildAdvExpr('/product/adSkuSummary', payload));
    result = JSON.parse(raw);
    if (!result.ok || !result.rows.length) break;
    allRows = allRows.concat(result.rows);
  }
  return allRows;
}

function extractAdvMetrics(row) {
  var inv = row.skuInvData || {};
  return {
    sku: row.sku,
    asin: inv.asin || null,
    price: inv.price ? Number(inv.price) : null,
    fulDate: inv.ful_date || null,
    saleStatus: inv.sale_status || null,

    orders30d: row['30_orders'] || 0,
    orders30dPrev: row['30_orders_prev'] || 0,
    impressions30d: row['30_impressions'] || 0,
    impressions30dPrev: row['30_impressions_prev'] || 0,
    clicks30d: row['30_clicks'] || 0,
    clicks30dPrev: row['30_clicks_prev'] || 0,
    cost30d: row['30_cost'] || 0,
    cost30dPrev: row['30_cost_prev'] || 0,
    sales30d: row['30_sales'] || 0,
    sales30dPrev: row['30_sales_prev'] || 0,
    acos30d: row['30_acos'] || 0,
    acos30dPrev: row['30_acos_prev'] || 0,
    ctr30d: row['30_ctr'] || 0,
    ctr30dPrev: row['30_ctr_prev'] || 0,
    conversionRate: row.conversionRate || 0,
    proportion: row.proportion ? Number(row.proportion) : null,

    orders7d: row['7_impressions'] != null ? undefined : undefined,
    impressions7d: row['7_impressions'] || 0,
    clicks7d: row['7_clicks'] || 0,
    impressions3d: row['3_impressions'] || 0,
    clicks3d: row['3_clicks'] || 0,
  };
}

function identifyDeclining(rows, threshold) {
  threshold = threshold || -0.15;
  var results = [];
  rows.forEach(function(row) {
    var m = extractAdvMetrics(row);
    if (m.orders30dPrev < 5) return;
    var orderChange = (m.orders30d - m.orders30dPrev) / m.orders30dPrev;
    if (orderChange < threshold) {
      m.orderChange = orderChange;
      m.rawRow = row;
      results.push(m);
    }
  });
  results.sort(function(a, b) { return a.orderChange - b.orderChange; });
  return results;
}

// ─── SIF（前台流量数据） ────────────────────────────────────────────────────

function buildSifExpr(endpoint, body) {
  var argsJson = JSON.stringify({ ep: endpoint, b: body });
  return '(async()=>{var a=' + argsJson + ';var tok=localStorage.getItem("token")||"";var r=await fetch(a.ep+"?country=US&_t="+Date.now(),{method:"POST",credentials:"include",headers:{"accept":"application/json","content-type":"application/json;charset=UTF-8","authorization":tok},body:JSON.stringify(a.b)});var j=await r.json();if(j.code!==1)return JSON.stringify({ok:false,msg:j.msg});return JSON.stringify({ok:true,data:j.data})})()';
}

async function fetchSifKeywordOverview(asin) {
  var tab = await findTab('sif.com');
  if (!tab) return null;
  var body = { asin: asin, timePieceType: 'latelyDay', timePieceValue: '7' };
  var raw = await evaluate(tab, buildSifExpr('/api/search/asinKeywordOverview', body));
  var result = JSON.parse(raw);
  if (!result.ok) return null;
  return result.data;
}

async function fetchSifTopKeywords(asin, limit) {
  var tab = await findTab('sif.com');
  if (!tab) return null;
  limit = limit || 5;
  var body = {
    asin: asin,
    timePieceType: 'latelyDay', timePieceValue: '7',
    pageNum: 1, pageSize: limit,
    desc: true, sortBy: 'scoreInfo.scoreRatio',
    conditions: ['totalPeriod.total']
  };
  var raw = await evaluate(tab, buildSifExpr('/api/search/asinKeywordList', body));
  var result = JSON.parse(raw);
  if (!result.ok) return null;
  return (result.data && result.data.list) || [];
}

// ─── Inventory（可选同比数据） ───────────────────────────────────────────────

async function ensureProductAnalysisPage() {
  var tab = await findTab('sellerinventory.yswg.com.cn');
  if (!tab) return false;

  var checkExpr = '(function(){var f=Array.from(document.querySelectorAll("iframe")).find(function(x){return(x.getAttribute("src")||"").includes("/kernel/productAnalysis")});return f?"ready":"none"})()';
  var state = await evaluate(tab, checkExpr);
  if (state === 'ready') return true;

  var openExpr = '(async()=>{var tok=localStorage.getItem("surfaceKey")||"";if(!window.layui||!window.layui.index||typeof window.layui.index.openTabsPage!=="function")return"no-layui";window.layui.index.openTabsPage("https://sellerinventory.yswg.com.cn/kernel/productAnalysis/index2"+(tok?"?Inventory-Token="+encodeURIComponent(tok):""),"产品数据分析");var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};for(var i=0;i<20;i++){await sleep(500);var f=Array.from(document.querySelectorAll("iframe")).find(function(x){return(x.getAttribute("src")||"").includes("/kernel/productAnalysis")});if(f)return"ready"}return"timeout"})()';
  var result = await evaluate(tab, openExpr);
  return result === 'ready';
}

async function checkInventorySession() {
  var tab = await findTab('sellerinventory.yswg.com.cn');
  if (!tab) return { ok: false, reason: 'no_tab' };

  var testExpr = '(async()=>{' +
    'var csrf=document.querySelector("meta[name=csrf-token]")?.content||"";' +
    'var tok=localStorage.getItem("surfaceKey")||"";' +
    'var jwt=localStorage.getItem("jwt_token")||"";' +
    'var h={"accept":"application/json","x-requested-with":"XMLHttpRequest"};' +
    'if(csrf)h["x-csrf-token"]=decodeURIComponent(csrf);' +
    'if(tok)h["inventory-token"]=tok;' +
    'if(jwt)h["jwt-token"]=jwt;' +
    'try{var r=await fetch("/kernel/session/status",{method:"GET",credentials:"include",headers:h});' +
    'var t=await r.text();' +
    'if(t.includes("Server Error")||r.status>=500)return JSON.stringify({ok:false,reason:"server_error"});' +
    'if(t.startsWith("<")&&t.includes("login"))return JSON.stringify({ok:false,reason:"login_redirect"});' +
    'return JSON.stringify({ok:true})}' +
    'catch(e){return JSON.stringify({ok:false,reason:"network"})}' +
    '})()';

  var raw = await evaluate(tab, testExpr);
  var result;
  try { result = JSON.parse(raw); } catch (_) { return { ok: false, reason: 'parse_error' }; }
  if (result.ok) return result;

  // Session invalid — attempt auto-recovery via SSO re-login
  var reloginExpr = '(async()=>{' +
    'window.location.href="/login";' +
    'return "navigating"' +
    '})()';
  await evaluate(tab, reloginExpr);

  // Wait for SSO redirect chain to complete (up to 15s)
  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
  for (var i = 0; i < 15; i++) {
    await sleep(1000);
    try {
      var loc = await evaluate(tab, 'window.location.href');
      if (loc && loc.includes('sellerinventory.yswg.com.cn') && !loc.includes('/login') && !loc.includes('wwlogin')) {
        // Back on main page — verify session works now
        await sleep(1000);
        var raw2 = await evaluate(tab, testExpr);
        try { var r2 = JSON.parse(raw2); return r2; } catch (_) {}
        return { ok: false, reason: 'relogin_parse_error' };
      }
    } catch (_) {}
  }

  return { ok: false, reason: 'relogin_timeout' };
}

async function fetchInventoryData(sku, sellerStr) {
  var tab = await findTab('sellerinventory.yswg.com.cn');
  if (!tab) return { status: 'no_tab', data: null };

  var bodyStr = 'page=1&limit=5&sku=' + encodeURIComponent(sku) +
    '&asin=&parent_asin=&origin_fuldate_min=&origin_fuldate_max=&solr_term=' +
    '&departs=&super_group=&group=&developer_num=&seller_dept=&seller_super_group=&seller_group=' +
    '&seller=' + encodeURIComponent(sellerStr) +
    '&refer_profit0_min=&refer_profit0_max=&refer_profit1_min=&refer_profit1_max=' +
    '&refer_profit2_min=&refer_profit2_max=&refer_profit3_min=&refer_profit3_max=' +
    '&refer_profit4_min=&refer_profit4_max=&refer_profit5_min=&refer_profit5_max=' +
    '&refer_profit6_min=&refer_profit6_max=&refer_profit7_min=&refer_profit7_max=' +
    '&refer_profit8_min=&refer_profit8_max=&refer_profit9_min=&refer_profit9_max=' +
    '&refer_profit10_min=&refer_profit10_max=&refer_profit11_min=&refer_profit11_max=' +
    '&refer_profit12_min=&refer_profit12_max=&refer_profit_sum_min=&refer_profit_sum_max=' +
    '&refer_profit_sum13_min=&refer_profit_sum13_max=';

  var argsJson = JSON.stringify({ ep: '/kernel/productAnalysis/query2', b: bodyStr });
  var expr = '(async()=>{var a=' + argsJson + ';var frames=Array.from(document.querySelectorAll("iframe"));var pf=frames.find(function(x){return(x.getAttribute("src")||"").includes("/kernel/productAnalysis")});var ref=pf?new URL(pf.getAttribute("src"),location.origin).href:location.href;var tok=localStorage.getItem("surfaceKey")||"";var csrf=document.querySelector("meta[name=csrf-token]")?.content||"";var jwt=localStorage.getItem("jwt_token")||"";var h={"accept":"application/json","content-type":"application/x-www-form-urlencoded; charset=UTF-8","x-requested-with":"XMLHttpRequest"};if(csrf)h["x-csrf-token"]=decodeURIComponent(csrf);if(tok)h["inventory-token"]=tok;if(jwt)h["jwt-token"]=jwt;var r=await fetch(a.ep,{method:"POST",credentials:"include",headers:h,referrer:ref,body:a.b});var text=await r.text();if(text.includes("Server Error")||r.status>=500)return JSON.stringify({ok:false,reason:"session_expired"});if(text.startsWith("<"))return JSON.stringify({ok:false,reason:"html_redirect"});var j=JSON.parse(text);if(!j.data||j.data.length===0)return JSON.stringify({ok:true,empty:true});return JSON.stringify({ok:true,data:j.data})})()';

  var raw = await evaluate(tab, expr);
  var result;
  try { result = JSON.parse(raw); } catch (_) { return { status: 'parse_error', data: null }; }

  if (!result.ok) return { status: result.reason || 'failed', data: null };
  if (result.empty) return { status: 'no_data', data: null };

  var p = result.data[0];
  var num = function(v) { return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null; };
  return {
    status: 'ok',
    data: {
      yoyQty: num(p.qty_yoy_over_1_year),
      profitSum: num(p.refer_profit_sum),
      profitRate: num(p.reference_net_profit),
      sellableDays: num(p.sellable_days),
      sales30: num(p.sales_30),
    }
  };
}

// ─── Inventory fallback: seller 级同比 (/pm/sale/getBySeller) ────────────────

async function fetchSellerYoyData(sellers) {
  var tab = await findTab('sellerinventory.yswg.com.cn');
  if (!tab) return null;

  var sellerParams = sellers.map(function(s) { return 'seller[]=' + encodeURIComponent(s); }).join('&');
  var bodyStr = sellerParams + '&time=30&page=1&limit=200&field=order_sales&order=desc';

  var argsJson = JSON.stringify({ ep: '/pm/sale/getBySeller', b: bodyStr });
  var expr = '(async()=>{var a=' + argsJson + ';var csrf=document.querySelector("meta[name=csrf-token]")?.content||"";var tok=localStorage.getItem("surfaceKey")||"";var jwt=localStorage.getItem("jwt_token")||"";var h={"accept":"application/json","content-type":"application/x-www-form-urlencoded; charset=UTF-8","x-requested-with":"XMLHttpRequest","x-csrf-token":csrf};if(tok)h["inventory-token"]=tok;if(jwt)h["jwt-token"]=jwt;var r=await fetch(a.ep,{method:"POST",credentials:"include",headers:h,body:a.b});if(r.status>=500)return JSON.stringify({ok:false});var j=await r.json();if(j.code&&j.code!==200)return JSON.stringify({ok:false,msg:j.msg});return JSON.stringify({ok:true,data:j.data||[]})})()';

  var raw = await evaluate(tab, expr);
  var result;
  try { result = JSON.parse(raw); } catch (_) { return null; }
  if (!result.ok || !result.data || result.data.length === 0) return null;

  var num = function(v) { return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null; };

  // 提取汇总行的同比（"所选编号汇总"或第一个 seller 行）
  var summaryRow = result.data.find(function(r) {
    return r.seller_title && r.seller_title.includes('汇总');
  }) || result.data.find(function(r) {
    return r.seller_title && !r.seller_title.includes('组');
  });

  var sellerYoy = summaryRow ? num(summaryRow.qty_yoy_over_1_year) : null;

  // 按 sale_num 构建产品编号→同比映射
  var bySaleNum = {};
  result.data.forEach(function(r) {
    if (r.sale_num && r.qty_yoy_over_1_year != null && r.qty_yoy_over_1_year !== '') {
      bySaleNum[r.sale_num] = {
        yoyQty: num(r.qty_yoy_over_1_year),
        netProfit: num(r.net_profit),
        sales: num(r.order_sales),
      };
    }
  });

  return { sellerYoy: sellerYoy, bySaleNum: bySaleNum, rowCount: result.data.length };
}

module.exports = {
  discoverSellers,
  fetchAdvFullList,
  extractAdvMetrics,
  identifyDeclining,
  fetchSifKeywordOverview,
  fetchSifTopKeywords,
  ensureProductAnalysisPage,
  checkInventorySession,
  fetchInventoryData,
  fetchSellerYoyData,
};
