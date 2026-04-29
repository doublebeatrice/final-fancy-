// ============================================================
// YSWG 广告全自动调整台 — panel.js
// 面板层职责：抓数 / 可视化 / 执行桥接 / 结果展示
// AI 决策主流程已迁移到 Codex，不再在面板内生成策略计划
// ============================================================

// ---- 全局状态 ----
const STATE = {
  invMap: {},
  kwRows: [],
  autoRows: [],
  targetRows: [],
  productAdRows: [],
  placementRows: [],
  sbRows: [],
  sbCampaignRows: [],
  adSkuSummaryRows: [],
  advProductManageRows: [],
  sbCampaignManageRows: [],
  sellerSalesRows: [],
  sellerSalesMeta: {},
  salesHistoryMap: {},
  inventoryScopeRows: [],
  listingFetchMeta: {},
  productChartMap: {},
  fetchMetrics: {},
  sp7DayUntouchedRows: [],
  sb7DayUntouchedRows: [],
  sevenDayUntouchedMeta: {},
  listingMap: {},
  productCards: [],
  plan: [],
  snapshots: [],
  activeSeasonalTerms: {}, // 当前活跃节气 {名称: 剩余天数}
  activeSeasonalIds: new Set(), // 当前活跃节气 ID 集合
};

// ---- DOM 引用 ----
const $ = id => document.getElementById(id);
const logEl      = $('log');
const fetchBtn   = $('fetchBtn');
const exportBtn  = $('exportBtn');
const importBtn  = $('importBtn');
const createCampaignBtn = $('createCampaignBtn');
const executeBtn = $('executeBtn');

function enableCodexOnlyBoundary() {
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.title = 'AI 决策主流程已迁移到 Codex';
    exportBtn.textContent = '已迁移到 Codex';
  }
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.title = 'AI 决策主流程已迁移到 Codex';
    importBtn.textContent = '已迁移到 Codex';
  }
  if (executeBtn) {
    executeBtn.disabled = true;
    executeBtn.title = '自动执行主流程已迁移到 Codex';
    executeBtn.textContent = '由 Codex 执行';
  }
  const hint = document.querySelector('.import-hint');
  if (hint) {
    hint.innerHTML = 'AI 决策主流程已迁移到 <b>Codex</b>。<br>当前面板只负责抓数、展示、执行桥接和必要的人工确认入口。';
  }
}

// ---- 日志 ----
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- 进度条 ----
function setProgress(barId, pct) {
  const el = $(barId);
  if (el) el.style.width = Math.min(100, pct) + '%';
}

function nowIso() {
  return new Date().toISOString();
}

function createStageRecorder(mode = 'full-snapshot') {
  const metrics = {
    mode,
    startedAt: nowIso(),
    stages: [],
  };
  return {
    metrics,
    start(stage, extra = {}) {
      return {
        stage,
        startedAt: nowIso(),
        startMs: Date.now(),
        attempted: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        ...extra,
      };
    },
    end(token, extra = {}) {
      const durationMs = Date.now() - token.startMs;
      const attempted = Number(extra.attempted ?? token.attempted ?? 0) || 0;
      const entry = {
        ...token,
        ...extra,
        startedAt: token.startedAt,
        endedAt: nowIso(),
        durationMs,
      };
      delete entry.startMs;
      entry.avgMs = attempted > 0 ? Math.round(durationMs / attempted) : durationMs;
      entry.p95Ms = durationMs;
      metrics.stages.push(entry);
      return entry;
    },
    finish(extra = {}) {
      metrics.endedAt = nowIso();
      metrics.durationMs = Date.now() - new Date(metrics.startedAt).getTime();
      Object.assign(metrics, extra || {});
      return metrics;
    },
  };
}

function normalizeFetchOptions(rawOptions = {}) {
  const mode = String(rawOptions.mode || 'full-snapshot');
  const listingSkus = Array.isArray(rawOptions.listingSkus) ? [...new Set(rawOptions.listingSkus.map(item => String(item || '').trim()).filter(Boolean))] : [];
  const chartSkus = Array.isArray(rawOptions.chartSkus) ? [...new Set(rawOptions.chartSkus.map(item => String(item || '').trim()).filter(Boolean))] : listingSkus;
  const salesHistorySkus = Array.isArray(rawOptions.salesHistorySkus) ? [...new Set(rawOptions.salesHistorySkus.map(item => String(item || '').trim()).filter(Boolean))] : listingSkus;
  return {
    mode,
    listingStrategy: rawOptions.listingStrategy || (mode === 'fast' ? 'schema' : 'all'),
    listingSkus,
    chartStrategy: rawOptions.chartStrategy || (mode === 'fast' ? 'schema' : 'none'),
    chartSkus,
    salesHistoryStrategy: rawOptions.salesHistoryStrategy || (mode === 'fast' ? 'schema' : 'none'),
    salesHistorySkus,
    salesHistoryLimit: Number(rawOptions.salesHistoryLimit || localStorage.getItem('AD_OPS_SALES_HISTORY_LIMIT') || (mode === 'fast' ? Math.max(10, salesHistorySkus.length || 0) : 0)),
    salesHistoryConcurrency: Number(rawOptions.salesHistoryConcurrency || localStorage.getItem('AD_OPS_SALES_HISTORY_CONCURRENCY') || 3),
    chartLookbackDays: Number(rawOptions.chartLookbackDays || 30),
    chartUserNames: Array.isArray(rawOptions.chartUserNames) && rawOptions.chartUserNames.length ? rawOptions.chartUserNames : ['HJ17', 'HJ171', 'HJ172'],
    listingConcurrency: Number(rawOptions.listingConcurrency || localStorage.getItem('AD_OPS_LISTING_FETCH_CONCURRENCY') || localStorage.getItem('AD_OPS_LISTING_CONCURRENCY') || 5),
    listingLimit: Number(rawOptions.listingLimit || localStorage.getItem('AD_OPS_LISTING_FETCH_LIMIT') || 120),
    listingTimeoutMs: Number(rawOptions.listingTimeoutMs || localStorage.getItem('AD_OPS_LISTING_FETCH_TIMEOUT_MS') || localStorage.getItem('AD_OPS_LISTING_PER_ASIN_TIMEOUT_MS') || 10000),
    listingRetry: Number(rawOptions.listingRetry || localStorage.getItem('AD_OPS_LISTING_FETCH_RETRY') || 1),
    listingStageTimeoutMs: Number(rawOptions.listingStageTimeoutMs || localStorage.getItem('AD_OPS_LISTING_FETCH_STAGE_TIMEOUT_MS') || 120000),
    listingOptional: rawOptions.listingOptional !== false,
    listingCacheTtlMs: Number(rawOptions.listingCacheTtlMs || 7 * 24 * 60 * 60 * 1000),
  };
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  fetchBtn.addEventListener('click', fetchAllData);
  if (createCampaignBtn) createCampaignBtn.addEventListener('click', createCampaignFromTextarea);
  enableCodexOnlyBoundary();
  if (exportBtn) exportBtn.addEventListener('click', () => log('AI 决策导出入口已迁移到 Codex', 'warn'));
  if (importBtn) importBtn.addEventListener('click', () => log('AI 计划导入入口已迁移到 Codex', 'warn'));
  if (executeBtn) executeBtn.addEventListener('click', () => log('自动执行入口已迁移到 Codex', 'warn'));
});

// ============================================================
// 阶段 1+2+3：全量拉取
// ============================================================
async function fetchAllData(rawOptions = null) {
  const fetchOptions = normalizeFetchOptions(rawOptions || globalThis.__AD_OPS_FETCH_OPTIONS || {});
  const stages = createStageRecorder(fetchOptions.mode);
  fetchBtn.disabled = true;
  STATE.kwRows = [];
  STATE.autoRows = [];
  STATE.targetRows = [];
  STATE.productAdRows = [];
  STATE.placementRows = [];
  STATE.sbRows = [];
  STATE.sbCampaignRows = [];
  STATE.adSkuSummaryRows = [];
  STATE.advProductManageRows = [];
  STATE.sbCampaignManageRows = [];
  STATE.sellerSalesRows = [];
  STATE.sellerSalesMeta = {};
  STATE.salesHistoryMap = {};
  STATE.inventoryScopeRows = [];
  STATE.listingFetchMeta = { attempted: 0, success: 0, failed: 0, samples: [] };
  STATE.productChartMap = {};
  STATE.fetchMetrics = {};
  STATE.sp7DayUntouchedRows = [];
  STATE.sb7DayUntouchedRows = [];
  STATE.listingMap = {};
  STATE.productCards = [];
  if ($('statListing')) $('statListing').textContent = '0';
  setProgress('fetchProgress', 5);
  log('开始拉取全量数据…');

  try {
    // 1. 库存 + 活跃节气
    log('拉取库存数据…');
    const inventoryStage = stages.start('inventory_direct_api');
    const invTab = await findTab('*://sellerinventory.yswg.com.cn/*');
    const invRows = await fetchAllInventoryDirect(invTab.id);
    // 拉取当前活跃节气，建立活跃 solrTerm ID 集合
    try {
      const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
      const [nearTerms, termMapRaw] = await Promise.all([
        execInAnyFrame(tab.id, async () => {
          try { return await (await fetch('/organization/solar_term_sales_time/get_near_solar_term', { credentials: 'include' })).json(); } catch(e) { return null; }
        }),
        execInAnyFrame(tab.id, async () => {
          try { return await (await fetch('/commonUtil/getInfoFromRedisByKey?key=solar_term_festival_info', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })).json(); } catch(e) { return null; }
        }),
      ]);
      if (nearTerms?.data) STATE.activeSeasonalTerms = nearTerms.data;
      // 建立 name→id 反查表，找出活跃 ID
      if (termMapRaw?.data) {
        const allTerms = [];
        function flattenTerms(nodes) { for (const n of nodes) { if (typeof n.id === 'number') allTerms.push(n); if (n.children?.length) flattenTerms(n.children); } }
        flattenTerms(JSON.parse(termMapRaw.data));
        const activeNames = Object.keys(STATE.activeSeasonalTerms);
        STATE.activeSeasonalIds = new Set(
          allTerms.filter(t => activeNames.some(name => t.name.includes(name) || name.includes(t.name))).map(t => String(t.id))
        );
        log(`活跃节气: ${activeNames.join('、')} → IDs: ${[...STATE.activeSeasonalIds].join(',')}`, 'warn');
      }
    } catch(e) { log('节气拉取失败: ' + e.message, 'warn'); }
    STATE.inventoryScopeRows = (invRows || []).map(projectInventoryScopeRow);
    STATE.invMap = buildInvMap(invRows);
    stages.end(inventoryStage, {
      attempted: 1,
      success: invRows.length,
      failed: 0,
      uniqueSkus: Object.keys(STATE.invMap || {}).length,
    });
    const asinCount = Object.values(STATE.invMap).filter(v => v.asin).length;
    $('statInv').textContent = Object.keys(STATE.invMap).length;
    setProgress('fetchProgress', 30);
    log(`库存 ${invRows.length} 条，${Object.keys(STATE.invMap).length} 个 SKU，${asinCount} 个有 ASIN`, 'ok');

    try {
      log('拉取个人销售数据…');
      const sellerSalesStage = stages.start('seller_sales');
      const sellerSales = await fetchSellerSalesData({ days: 7, sellers: ['HJ17', 'HJ171', 'HJ172'] });
      STATE.sellerSalesRows = sellerSales.rows || [];
      STATE.sellerSalesMeta = sellerSales.meta || {};
      stages.end(sellerSalesStage, {
        attempted: 1,
        success: STATE.sellerSalesRows.length,
        failed: 0,
      });
      log(`个人销售数据 ${STATE.sellerSalesRows.length} 条`, STATE.sellerSalesRows.length ? 'ok' : 'warn');
    } catch (e) {
      STATE.sellerSalesRows = [];
      STATE.sellerSalesMeta = { error: e.message };
      log(`个人销售数据拉取失败：${e.message}`, 'warn');
    }

    const salesHistoryTasks = selectSalesHistoryTasks(STATE.invMap, fetchOptions);
    if (salesHistoryTasks.length) {
      log(`拉取 SKU 历史销量… ${salesHistoryTasks.length} 个`, 'warn');
      const historyStage = stages.start('sku_sales_history', { attempted: salesHistoryTasks.length });
      await fetchSalesHistoriesConcurrent(salesHistoryTasks, fetchOptions);
      stages.end(historyStage, {
        attempted: salesHistoryTasks.length,
        success: Object.keys(STATE.salesHistoryMap || {}).length,
        failed: Math.max(0, salesHistoryTasks.length - Object.keys(STATE.salesHistoryMap || {}).length),
      });
      log(`SKU 历史销量完成：${Object.keys(STATE.salesHistoryMap || {}).length} 个`, Object.keys(STATE.salesHistoryMap || {}).length ? 'ok' : 'warn');
    }

    // 2. 关键词（已有缓存则跳过，节省测试时间）
    if (STATE.kwRows.length > 0) {
      log(`关键词已缓存 ${STATE.kwRows.length} 条，跳过拉取`, 'warn');
    } else {
      log('拉取广告关键词…');
      const keywordStage = stages.start('ads_keyword_rows');
      STATE.kwRows = await fetchAllKeywords();
      stages.end(keywordStage, {
        attempted: 1,
        success: STATE.kwRows.length,
        failed: 0,
      });
      $('statKw').textContent = STATE.kwRows.length;
      log(`关键词 ${STATE.kwRows.length} 条`, 'ok');
    }
    setProgress('fetchProgress', 55);

    log('并发拉取广告实体、汇总与管理表…');
    const adsStage = stages.start('ads_data_read');
    const [
      autoRows,
      targetRows,
      productAdRows,
      sbRows,
      sbCampaignRows,
      adSkuSummaryRows,
      advProductManageRows,
      sbCampaignManageRows,
    ] = await Promise.all([
      fetchAllAutoTargets(STATE.kwCapture),
      fetchAllTargeting(STATE.kwCapture),
      fetchAllProductAds(),
      fetchAllSponsoredBrands(),
      fetchAllSbCampaigns(),
      fetchAdSkuSummaryRows(),
      fetchAdvProductManageRows(),
      fetchSbCampaignManageRows(),
    ]);
    STATE.autoRows = autoRows || [];
    STATE.targetRows = targetRows || [];
    STATE.productAdRows = productAdRows || [];
    STATE.sbRows = sbRows || [];
    STATE.sbCampaignRows = sbCampaignRows || [];
    STATE.adSkuSummaryRows = adSkuSummaryRows || [];
    STATE.advProductManageRows = advProductManageRows || [];
    STATE.sbCampaignManageRows = sbCampaignManageRows || [];
    stages.end(adsStage, {
      attempted: 8,
      success: [
        STATE.autoRows.length,
        STATE.targetRows.length,
        STATE.productAdRows.length,
        STATE.sbRows.length,
        STATE.sbCampaignRows.length,
        STATE.adSkuSummaryRows.length,
        STATE.advProductManageRows.length,
        STATE.sbCampaignManageRows.length,
      ].filter(n => Number.isFinite(n)).length,
      failed: 0,
      rowsRead: {
        auto: STATE.autoRows.length,
        target: STATE.targetRows.length,
        productAd: STATE.productAdRows.length,
        sb: STATE.sbRows.length,
        sbCampaign: STATE.sbCampaignRows.length,
      },
    });
    $('statAuto').textContent = STATE.autoRows.length;
    setProgress('fetchProgress', 88);
    log(`自动投放 ${STATE.autoRows.length} 条；定位组 ${STATE.targetRows.length} 条；SP product ad ${STATE.productAdRows.length} 条`, 'ok');
    log(`SB ads ${STATE.sbRows.length} rows；SB campaign ${STATE.sbCampaignRows.length} 条；广告 SKU 汇总 ${STATE.adSkuSummaryRows.length} 条`, 'ok');

    // 4c. 3/7 day ad metrics are not separate fields in the default table response.
    // Re-query the same entities with timeRange windows and merge those metrics back.
    log('拉取广告 3天 / 7天 指标窗口…');
    const adWindowStage = stages.start('ads_metric_windows');
    await enrichAdMetricWindows(STATE.kwCapture);
    stages.end(adWindowStage, { attempted: 1, success: 1, failed: 0 });
    setProgress('fetchProgress', 94);

    try {
      const untouchedStage = stages.start('seven_day_untouched');
      const untouched = await fetchSevenDayUntouchedPools();
      STATE.sp7DayUntouchedRows = untouched.spRows || [];
      STATE.sb7DayUntouchedRows = untouched.sbRows || [];
      STATE.sevenDayUntouchedMeta = untouched.meta || {};
      stages.end(untouchedStage, {
        attempted: 2,
        success: STATE.sp7DayUntouchedRows.length + STATE.sb7DayUntouchedRows.length,
        failed: 0,
      });
      if ($('statSp7d')) $('statSp7d').textContent = STATE.sp7DayUntouchedRows.length;
      if ($('statSb7d')) $('statSb7d').textContent = STATE.sb7DayUntouchedRows.length;
      log(`7d untouched pools: SP ${STATE.sp7DayUntouchedRows.length}, SB ${STATE.sb7DayUntouchedRows.length}`, 'ok');
    } catch (e) {
      log(`7d untouched pool fetch failed: ${e.message}`, 'warn');
    }

    const sellerSalesMap = buildSellerSalesMap(STATE.sellerSalesRows);
    const preCardsStage = stages.start('productcards_build_pre_listing');
    const cardsWithoutListing = buildProductCards(
      STATE.kwRows,
      STATE.autoRows,
      STATE.invMap,
      {},
      STATE.targetRows,
      STATE.sbRows,
      STATE.productAdRows,
      STATE.sbCampaignRows,
      sellerSalesMap
    );
    stages.end(preCardsStage, {
      attempted: 1,
      success: cardsWithoutListing.length,
      failed: 0,
    });

    const scopeStage = stages.start('operation_scope_filter');
    const listingTasks = selectListingFetchTasks(cardsWithoutListing, fetchOptions);
    stages.end(scopeStage, {
      attempted: cardsWithoutListing.length,
      success: listingTasks.length,
      failed: 0,
      skipped: Math.max(0, cardsWithoutListing.length - listingTasks.length),
    });

    const chartTasks = selectProductChartTasks(cardsWithoutListing, fetchOptions);
    if (chartTasks.length) {
      log(`抓取广告展示/点击趋势… ${chartTasks.length} 个 SKU`, 'warn');
      const chartStage = stages.start('product_chart', { attempted: chartTasks.length });
      STATE.productChartMap = await fetchProductCharts(chartTasks, fetchOptions);
      stages.end(chartStage, {
        attempted: chartTasks.length,
        success: Object.keys(STATE.productChartMap || {}).length,
        failed: Math.max(0, chartTasks.length - Object.keys(STATE.productChartMap || {}).length),
      });
    } else {
      STATE.productChartMap = {};
    }

    if (listingTasks.length) {
      log(`抓取 Listing 页面信息… ${listingTasks.length} 个 ASIN`, 'warn');
      const listingStage = stages.start('listing_fetch', { attempted: listingTasks.length });
      await fetchListingsConcurrent(listingTasks, done => {
        if ($('statListing')) $('statListing').textContent = String(done);
      }, fetchOptions);
      stages.end(listingStage, {
        attempted: STATE.listingFetchMeta.attempted || listingTasks.length,
        success: STATE.listingFetchMeta.success || 0,
        failed: STATE.listingFetchMeta.failed || 0,
        skipped: STATE.listingFetchMeta.skipped || 0,
        cacheHit: STATE.listingFetchMeta.cacheHit || 0,
        cacheMiss: STATE.listingFetchMeta.cacheMiss || 0,
        cacheExpired: STATE.listingFetchMeta.cacheExpired || 0,
        fetched: STATE.listingFetchMeta.fetched || 0,
        retry: STATE.listingFetchMeta.retry || 0,
      });
      log(`Listing 抓取完成：成功 ${Object.keys(STATE.listingMap || {}).length} / ${listingTasks.length}`, Object.keys(STATE.listingMap || {}).length ? 'ok' : 'warn');
      if (STATE.listingFetchMeta?.failed) {
        log(`Listing 抓取失败样本 ${Math.min((STATE.listingFetchMeta.samples || []).length, 3)} 条：${JSON.stringify((STATE.listingFetchMeta.samples || []).slice(0, 3))}`, 'warn');
      }
    } else {
      log('无可抓取 Listing 的 ASIN，跳过 Listing 抓取', 'warn');
    }

    // 5. 构建产品画像
    const finalCardsStage = stages.start('productcards_build_final');
    STATE.productCards = buildProductCards(
      STATE.kwRows,
      STATE.autoRows,
      STATE.invMap,
      STATE.listingMap,
      STATE.targetRows,
      STATE.sbRows,
      STATE.productAdRows,
      STATE.sbCampaignRows,
      sellerSalesMap
    );
    STATE.productCards = attachProductChartData(STATE.productCards, STATE.productChartMap);
    STATE.productCards = attachSalesHistoryData(STATE.productCards, STATE.salesHistoryMap);
    stages.end(finalCardsStage, {
      attempted: 1,
      success: STATE.productCards.length,
      failed: 0,
    });

    setProgress('fetchProgress', 100);
    log(`全量数据就绪：${STATE.productCards.length} 个产品画像`, 'ok');
    STATE.fetchMetrics = stages.finish({
      listingFetchMeta: STATE.listingFetchMeta,
      totalProductCards: STATE.productCards.length,
      totalInventoryScopeRows: STATE.inventoryScopeRows.length,
      totalUniqueInventorySkus: Object.keys(STATE.invMap || {}).length,
      fetchOptions: {
        mode: fetchOptions.mode,
        listingStrategy: fetchOptions.listingStrategy,
        chartStrategy: fetchOptions.chartStrategy,
        salesHistoryStrategy: fetchOptions.salesHistoryStrategy,
        salesHistoryLimit: fetchOptions.salesHistoryLimit,
        salesHistoryConcurrency: fetchOptions.salesHistoryConcurrency,
        listingLimit: fetchOptions.listingLimit,
        listingConcurrency: fetchOptions.listingConcurrency,
      },
    });

    exportBtn.disabled = false;
  } catch (err) {
    log('拉取失败：' + err.message, 'error');
    STATE.fetchMetrics = stages.finish({
      failed: true,
      error: err.message,
      listingFetchMeta: STATE.listingFetchMeta,
    });
  } finally {
    fetchBtn.disabled = false;
  }
}

// ============================================================
// 数据拉取层：executeScript 注入方式（解决 SameSite cookie 问题）
// ============================================================

// 查找匹配 URL 的已打开标签页
function findTab(urlPattern) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: urlPattern }, tabs => {
      if (tabs && tabs.length) resolve(tabs[0]);
      else reject(new Error(`请先在浏览器中打开并登录：${urlPattern.replace(/\*/g, '')}`));
    });
  });
}

// 在目标标签页内注入并执行函数（同域 fetch，session cookie 自动携带）
function execInTab(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId }, func, args, world: 'MAIN' },
      results => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        const r = results && results[0] && results[0].result;
        if (r && r.error) return reject(new Error(r.error));
        resolve(r);
      }
    );
  });
}

// 向标签页所有 frame 注入，返回第一个有效结果（解决 iframe 嵌套问题）
function execInAnyFrame(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, func, args, world: 'MAIN' },
      results => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        const hit = (results || []).find(r => r?.result != null);
        resolve(hit ? hit.result : null);
      }
    );
  });
}

// 库存拉取：拦截页面自身的 XHR/fetch（MAIN world，无需知道鉴权细节）
async function fetchAllInventory() {
  const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
  try {
    await ensureInventoryListPage(tab.id);
  } catch (e) {
    log(`库存 iframe 链路不可用，改用 /pm/formal/list 直接 POST：${e.message}`, 'warn');
    return fetchAllInventoryDirect(tab.id);
  }
  log('注入拦截器，等待库存请求…（如10秒无响应请手动点击查询按钮）');

  // ① 注入拦截器
  await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId: tab.id, allFrames: true }, world: 'MAIN', func: () => {
        if (window.__invPatched2) return;
        window.__invPatched2 = true;
        window.__invCaptures = [];

        // 拦截 XMLHttpRequest
        const origOpen    = XMLHttpRequest.prototype.open;
        const origSend    = XMLHttpRequest.prototype.send;
        const origSetHdr  = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function(m, url, ...r) {
          this.__iurl = String(url || '');
          this.__ihdrs = {};
          return origOpen.call(this, m, url, ...r);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
          if (this.__iurl.includes('/pm/formal/list')) this.__ihdrs[k] = v;
          return origSetHdr.call(this, k, v);
        };
        XMLHttpRequest.prototype.send = function(body) {
          if (this.__iurl.includes('/pm/formal/list')) {
            const h = Object.assign({}, this.__ihdrs);
            const capturedUrl = this.__iurl;
            this.addEventListener('load', () => {
              try {
                const d = JSON.parse(this.responseText);
                if (Object.keys(d).length > 1)
                  window.__invCaptures.push({ json: d, body, headers: h, url: capturedUrl });
              } catch(e) {}
            }, { once: true });
          }
          return origSend.call(this, body);
        };

        // 拦截 fetch
        const origFetch = window.fetch;
        window.fetch = async function(input, init) {
          const url = typeof input === 'string' ? input : (input?.url || '');
          if (url.includes('/pm/formal/list')) {
            const resp = await origFetch.call(this, input, init);
            resp.clone().json().then(d => {
              if (Object.keys(d).length > 1)
                window.__invCaptures.push({ json: d, body: init?.body, headers: init?.headers || {}, url });
            }).catch(() => {});
            return resp;
          }
          return origFetch.call(this, input, init);
        };

        // 设置筛选条件并保存
        try {
          const saleInput = document.querySelector('input[name="sale_status"]');
          if (saleInput && !saleInput.value.includes('正常销售')) {
            // 用原生 setter 触发 layui 响应
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(saleInput, '正常销售,保留页面');
            saleInput.dispatchEvent(new Event('input', { bubbles: true }));
            saleInput.dispatchEvent(new Event('change', { bubbles: true }));
            // 点击保存查询条件
            const saveBtn = document.querySelector('input.save_search_btn');
            if (saveBtn) saveBtn.click();
          }
        } catch(e) {}
        // 点击查询按钮
        const btn = document.querySelector('input.search_btn') ||
          [...document.querySelectorAll('button,.el-button')]
            .find(b => /^(查询|搜索|确定)$/.test((b.textContent || '').trim()));
        if (btn) btn.click();
      }},
      results => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      }
    );
  });

  // ② 轮询等待捕获（最多 30 秒）
  let capture = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const found = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, world: 'MAIN',
          func: () => window.__invCaptures?.length ? window.__invCaptures[0] : null },
        results => resolve((results || []).find(r => r?.result)?.result || null)
      );
    });
    if (found) { capture = found; break; }
  }
  if (!capture) {
    log('30秒内未捕获库存请求，改用 /pm/formal/list 直接 POST', 'warn');
    return fetchAllInventoryDirect(tab.id);
  }

  log('已捕获库存请求！');

  // ③ 提取列表 + 分页
  const getList = d => (
    Array.isArray(d?.data?.list)    ? d.data.list    :
    Array.isArray(d?.data?.records) ? d.data.records :
    Array.isArray(d?.data)          ? d.data         :
    Array.isArray(d?.list)          ? d.list         : []
  );

  const rows  = [...getList(capture.json)];
  const total = capture.json?.count || capture.json?.data?.total || capture.json?.total || rows.length;
  log(`库存首页 ${rows.length} 条，total=${total}，字段：${JSON.stringify(Object.keys(capture.json))}`);
  if (total < 200) log('⚠️ 库存数据偏少（total=' + total + '），请确认库存页面已选"正常销售+保留页面"筛选条件', 'warn');
  if (rows[0]) {
    const r0 = rows[0];
    log(`库存首行样本：sku=${r0.sku} qty_30=${r0.qty_30} qty_7=${r0.qty_7} dynamic_saleday30=${r0.dynamic_saleday30} net_profit=${r0.net_profit} profitRate=${r0.profitRate}`, 'warn');
  }

  // 后续分页（用捕获到的相同参数，只改 page/pageNum）
  log(`库存分页：total=${total} rows=${rows.length} hasBody=${!!capture.body} hasUrl=${!!capture.url}`, 'warn');
  if (capture.body) log(`库存body样本：${String(capture.body).slice(0,200)}`, 'warn');
  if (capture.url)  log(`库存URL样本：${capture.url.slice(0,200)}`, 'warn');
  if (capture.headers) log(`库存headers：${JSON.stringify(redactSensitiveHeaders(capture.headers))}`, 'warn');
  if (total > rows.length) {
    const pages = Math.min(Math.ceil(total / 50), 100);

    // 从 iframe URL 提取鉴权参数（tempid / Inventory-Token）
    const iframeAuthParams = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, world: 'MAIN', func: () => {
          const iframes = document.querySelectorAll('iframe');
          for (const f of iframes) {
            const src = f.src || '';
            if (src.includes('/pm/formal/list') && src.includes('Inventory-Token')) {
              const u = new URL(src);
              return u.search; // e.g. ?tempid=xxx&Inventory-Token=yyy
            }
          }
          return '';
        }},
        results => resolve((results || []).find(r => r?.result)?.result || '')
      );
    });
    log(`iframe鉴权参数：${iframeAuthParams}`, 'warn');

    const baseUrl = (() => {
      if (!capture.url) return null;
      try {
        const u = new URL(capture.url, location.origin);
        u.searchParams.delete('page');
        u.searchParams.delete('pageNum');
        u.searchParams.delete('limit');
        // 如果 URL 里没有鉴权参数，从 iframe 补充
        if (iframeAuthParams && !u.searchParams.has('Inventory-Token')) {
          const auth = new URLSearchParams(iframeAuthParams.replace(/^\?/, ''));
          for (const [k, v] of auth.entries()) u.searchParams.set(k, v);
        }
        return u.toString();
      } catch(e) {
        return capture.url || null;
      }
    })();
    const baseBody = capture.body
      ? (() => {
          const params = new URLSearchParams(String(capture.body));
          params.delete('page');
          params.delete('pageNum');
          params.delete('limit');
          return params.toString();
        })()
      : null;

    for (let p = 2; p <= pages; p++) {
      const r = await new Promise(resolve => {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id, allFrames: true }, world: 'MAIN',
            func: async (pageUrl, bodyStr, extraHdrs, pageNum) => {
              try {
                let res;
                if (pageUrl && bodyStr) {
                  // POST 请求，用完整 URL（含 tempid/Inventory-Token）
                  // body 和 URL 都更新 pageNum，服务器可能读任意一个
                  const url = new URL(pageUrl, location.origin);
                  url.searchParams.set('page', pageNum);
                  url.searchParams.set('limit', 50);
                  const bodyParams = new URLSearchParams(bodyStr);
                  bodyParams.set('page', pageNum);
                  bodyParams.set('pageNum', pageNum);
                  bodyParams.set('limit', 50);
                  res = await fetch(url.toString(), {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', ...extraHdrs },
                    body: bodyParams.toString(),
                  });
                } else if (pageUrl) {
                  // GET 请求
                  const url = new URL(pageUrl, location.origin);
                  url.searchParams.set('page', pageNum);
                  url.searchParams.set('limit', 50);
                  res = await fetch(url.toString(), {
                    method: 'GET', credentials: 'include',
                    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01', ...extraHdrs },
                  });
                } else if (bodyStr) {
                  // POST 请求，相对路径
                  const bodyParams = new URLSearchParams(bodyStr);
                  bodyParams.set('page', pageNum);
                  bodyParams.set('pageNum', pageNum);
                  bodyParams.set('limit', 50);
                  res = await fetch('/pm/formal/list', {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', ...extraHdrs },
                    body: bodyParams.toString(),
                  });
                } else return null;
                const text = await res.text();
                if (!text.trim().startsWith('{')) return { error: text.slice(0, 100) };
                return { data: JSON.parse(text) };
              } catch(e) { return { error: e.message }; }
            },
            args: [baseUrl, baseBody, capture.headers || {}, p] },
          results => {
            const hit = (results || []).find(r => r?.result?.data);
            resolve(hit ? hit.result : null);
          }
        );
      });
      if (r?.data) {
        const pageRows = getList(r.data);
        if (p === 2) log(`分页p2结构：keys=${JSON.stringify(Object.keys(r.data))} rows=${pageRows.length}`, 'warn');
        if (p === 2 && pageRows.length === 0) log(`分页p2完整响应：${JSON.stringify(r.data).slice(0,200)}`, 'warn');
        rows.push(...pageRows);
      } else if (p === 2) {
        log(`分页p2失败：${JSON.stringify(r)}`, 'warn');
      }
      await sleep(400);
    }
  }

  return rows;
}

async function fetchAllInventoryDirect(tabId) {
  log('直接请求库存接口 /pm/formal/list：pageSize=500，并发=4', 'warn');
  const result = await execInTab(tabId, async () => {
    const getList = d => (
      Array.isArray(d?.data?.list)    ? d.data.list    :
      Array.isArray(d?.data?.records) ? d.data.records :
      Array.isArray(d?.data?.data)    ? d.data.data    :
      Array.isArray(d?.data?.rows)    ? d.data.rows    :
      Array.isArray(d?.data)          ? d.data         :
      Array.isArray(d?.rows)          ? d.rows         :
      Array.isArray(d?.list)          ? d.list         : []
    );
    const findStorageValue = (patterns, validator = v => !!v) => {
      const stores = [localStorage, sessionStorage];
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          const value = store.getItem(key);
          if (patterns.some(p => p.test(key)) && validator(value)) return value;
        }
      }
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const value = store.getItem(store.key(i));
          if (validator(value)) return value;
        }
      }
      return '';
    };
    const csrf =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const iframeSrc = [...document.querySelectorAll('iframe')].map(f => f.src || '').find(src => src.includes('/pm/formal/list')) || '';
    const iframeToken = iframeSrc ? new URL(iframeSrc, location.origin).searchParams.get('Inventory-Token') : '';
    const inventoryToken = iframeToken || localStorage.getItem('surfaceKey') ||
      sessionStorage.getItem('surfaceKey') ||
      findStorageValue([/inventory/i, /surface/i, /token/i], v => !!v && !String(v).startsWith('eyJ'));
    const jwtToken = localStorage.getItem('jwt_token') ||
      sessionStorage.getItem('jwt_token') ||
      findStorageValue([/jwt/i, /token/i], v => /^eyJ/.test(String(v || '')));

    const baseParams = new URLSearchParams();
    const set = (k, v = '') => baseParams.set(k, v);
    set('_token', decodeURIComponent(csrf));
    set('sku'); set('change_sku'); set('parent_asin'); set('asin'); set('title_ch'); set('remark'); set('not_remark');
    set('salesChannel', '"Amazon.com","Amazon.co.uk"');
    set('seller', '"HJ17","HJ171","HJ172"');
    set('sale_status', '"\u6b63\u5e38\u9500\u552e","\u4fdd\u7559\u9875\u9762"');
    set('transport_check', '0');
    set('transport_check_manual', '0');
    set('product_tag_complete', '0');
    set('is_fuldate', '1');
    set('inbAndAll', '1');
    set('inventory_risk', '0');
    set('is_fuzzy', '2');
    set('shipment_urgent_related', 'and');
    const emptyKeys = [
      'is_illegal_variant','is_package_level_product','is_same_competing','is_temu','tiktok_tag','review_total_comment_min',
      'review_total_comment_max','rating_count_min','rating_count_max','not_title_ch','purchasing_cycle','account',
      'account_str','incentives_status','applyDeliverFlag','dev_cosmetic_res','safe_audit_cosmetic_res','departs',
      'developer_groups','developer_num','developer_name','special_type','sellerGroup','seller_name','clearanceSeller',
      'is_change','is_follow','refund_max','refund_min','sp_max','sp_min','acos_max','acos_min','quit_adv_compete',
      'solr_term','minor_solr_term_site','success_flag','sellDay2_min','sellDay2_max','FslFbaFbm','is_compliant',
      'can_sales_7_first_min','can_sales_7_first_max','can_sales_7_third_min','can_sales_7_third_max',
      'can_sales_3_second_min','can_sales_3_second_max','can_sales_30_second_min','can_sales_30_second_max',
      'can_sales_3_third_min','can_sales_3_third_max','opendate_min','opendate_max','fuldate_min','fuldate_max',
      'small_pic_url','drawing_process','fnsku','fbaPlan','orderBy','reverse','us_upload_type','select','uk_upload_type',
      'select_adv_state','transport_safe_level','available_inventory_min','available_inventory_max','unstock_in_amount_min',
      'unstock_in_amount_max','shipping_amount_min','shipping_amount_max','copyrightor_name','translator_name','is_battery',
      'is_charge_long_storage','has_note','note','gross_weight_min','gross_weight_max','us_uk_is_aplus','backstage_status',
      'status_primary','apply_review','has_authentication','auth_caughted','auth_status','tortious_flag',
      'apply_transparency_program_flag','na_fba_remote_flag','na_fba_remote_offer_status','warehouse_id','is_discount',
      'is_year_product_str','is_large_product','business_type','audit_safe_level','ce_certification','high_risk_shipping',
      'sales_3min','sales_3max','sales_7min','sales_7max','sales_30min','sales_30max','sales_90min','sales_90max',
      'sales_min','sales_max','rating_reduce_time_start','rating_reduce_time_end','weight_min','weight_max',
      'outside_promotion_flag','is_delivered','clearance_30_beyond','is_graphic_design','product_line_pre_note',
      'sale_status_reason','input_tag','is_visual_aPlus','sale_reduce','hot_season_min','hot_season_max','off_season_min',
      'off_season_max','salesPrice_min','salesPrice_max','brand_name','register_type','other_register_type',
      'is_oversea_flag','sales_last_last_min','sales_last_last_max','year_over_year_sales_min','year_over_year_sales_max',
      'year_over_year_rank_min','year_over_year_rank_max','inb_and_all_min','inb_and_all_max','inb_and_air_min',
      'inb_and_air_max','inb_air_min','inb_air_max','sea_flag','sea_min','sea_max','first_deliver_date_min',
      'first_deliver_date_max','purchasing_cycle_status','is_custom_product','is_grafting_product','origin_fuldate_min',
      'origin_fuldate_max','recom_clear_time_min','recom_clear_time_max','seller_count_min','seller_count_max','ful_min',
      'ful_max','res_min','res_max','close_min','close_max','defective_quantity_min','defective_quantity_max','at_max',
      'at_min','adProportion_min','adProportion_max','profitRate_min','profitRate_max','seaProfitRate_min',
      'seaProfitRate_max','diff_profit_min','diff_profit_max','net_profit_min','net_profit_max','order_32_min',
      'order_32_max','maintain_level','change_sales','is_remove_inventory','rights_workers','overseas_min','overseas_max',
      'has_joined_plan','multi_departs','is_multi_size_clothing','shipment_urgent_air','shipment_urgent_sea','logistics',
      'planer','auth_type','manager_ids'
    ];
    emptyKeys.forEach(k => { if (!baseParams.has(k)) set(k); });

    const headers = {
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-csrf-token': decodeURIComponent(csrf),
      'x-requested-with': 'XMLHttpRequest',
    };
    if (inventoryToken) headers['inventory-token'] = inventoryToken;
    if (jwtToken) headers['jwt-token'] = jwtToken;

    async function fetchPage(page, limit) {
      const body = new URLSearchParams(baseParams);
      body.set('page', page);
      body.set('limit', limit);
      const res = await fetch('/pm/formal/list', {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer: iframeSrc || location.href,
        body: body.toString(),
      });
      const text = await res.text();
      if (!text.trim().startsWith('{')) throw new Error(text.slice(0, 160));
      const json = JSON.parse(text);
      return { httpStatus: res.status, json, rows: getList(json), body: body.toString(), tokenState: { csrf: !!csrf, inventoryToken: !!inventoryToken, jwtToken: !!jwtToken } };
    }

    const first = await fetchPage(1, 500);
    const total = first.json?.count || first.json?.data?.total || first.json?.total || first.rows.length;
    const pages = Math.min(Math.ceil(total / 500), 100);
    const rows = [...first.rows];
    const concurrency = 4;
    let nextPage = 2;
    async function worker() {
      while (nextPage <= pages) {
        const page = nextPage++;
        const hit = await fetchPage(page, 500);
        rows.push(...hit.rows);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { rows, total, firstCount: first.rows.length, sampleKeys: Object.keys(first.rows[0] || {}), bodySample: first.body.slice(0, 300), tokenState: first.tokenState };
  });
  if (!result || !Array.isArray(result.rows)) throw new Error('直接库存请求失败：未返回 rows');
  log(`库存直接POST完成：rows=${result.rows.length} total=${result.total} first=${result.firstCount} tokens=${JSON.stringify(result.tokenState)}`, 'ok');
  log(`库存直接POST字段：${JSON.stringify(result.sampleKeys)} body=${result.bodySample}`, 'warn');
  return result.rows;
}

async function fetchSellerSalesData({ days = 7, sellers = ['HJ17', 'HJ171', 'HJ172'], limit = 50 } = {}) {
  const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
  const result = await execInTab(tab.id, async (args) => {
    const getList = d => (
      Array.isArray(d?.data?.list)    ? d.data.list    :
      Array.isArray(d?.data?.records) ? d.data.records :
      Array.isArray(d?.data?.data)    ? d.data.data    :
      Array.isArray(d?.data?.rows)    ? d.data.rows    :
      Array.isArray(d?.data)          ? d.data         :
      Array.isArray(d?.rows)          ? d.rows         :
      Array.isArray(d?.list)          ? d.list         : []
    );
    const findStorageValue = (patterns, validator = v => !!v) => {
      const stores = [localStorage, sessionStorage];
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          const value = store.getItem(key);
          if (patterns.some(p => p.test(key)) && validator(value)) return value;
        }
      }
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const value = store.getItem(store.key(i));
          if (validator(value)) return value;
        }
      }
      return '';
    };
    const csrf =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const jwtToken = localStorage.getItem('jwt_token') ||
      sessionStorage.getItem('jwt_token') ||
      findStorageValue([/jwt/i, /token/i], v => /^eyJ/.test(String(v || '')));
    const referrerFrame = [...document.querySelectorAll('iframe')]
      .map(f => f.src || '')
      .find(src => src.includes('/pm/sale/seller_index') || src.includes('Inventory-Token')) || location.href;

    async function fetchPage(page) {
      const body = new URLSearchParams();
      body.set('time', String(args.days || 7));
      for (const seller of args.sellers || []) body.append('seller[]', seller);
      body.set('page', String(page));
      body.set('limit', String(args.limit || 50));
      body.set('field', 'order_sales');
      body.set('order', 'desc');

      const headers = {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-csrf-token': decodeURIComponent(csrf),
        'x-requested-with': 'XMLHttpRequest',
      };
      if (jwtToken) headers['jwt-token'] = jwtToken;

      const res = await fetch('/pm/sale/getBySeller', {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer: referrerFrame,
        body: body.toString(),
      });
      const text = await res.text();
      if (!text.trim().startsWith('{')) throw new Error(text.slice(0, 160));
      const json = JSON.parse(text);
      return {
        httpStatus: res.status,
        json,
        rows: getList(json),
        tokenState: { csrf: !!csrf, jwtToken: !!jwtToken },
      };
    }

    const first = await fetchPage(1);
    const total = first.json?.count || first.json?.data?.total || first.json?.total || first.rows.length;
    const pages = Math.min(Math.ceil(total / (args.limit || 50)), 100);
    const rows = [...first.rows];
    for (let page = 2; page <= pages; page++) {
      const hit = await fetchPage(page);
      rows.push(...hit.rows);
      if (hit.rows.length < (args.limit || 50)) break;
    }
    return {
      rows,
      meta: {
        endpoint: '/pm/sale/getBySeller',
        days: args.days || 7,
        sellers: args.sellers || [],
        total,
        firstCount: first.rows.length,
        sampleKeys: Object.keys(first.rows[0] || {}),
        tokenState: first.tokenState,
      },
    };
  }, [{ days, sellers, limit }]);

  if (!result || !Array.isArray(result.rows)) throw new Error('个人销售数据接口未返回 rows');
  log(`个人销售接口完成：rows=${result.rows.length} total=${result.meta?.total || result.rows.length} tokens=${JSON.stringify(result.meta?.tokenState || {})}`, 'ok');
  if (result.meta?.sampleKeys?.length) log(`个人销售字段：${JSON.stringify(result.meta.sampleKeys)}`, 'warn');
  return result;
}

async function waitTabComplete(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await new Promise(resolve => chrome.tabs.get(tabId, resolve));
    if (tab?.status === 'complete') return true;
    await sleep(300);
  }
  return false;
}

function createTab(url, active = false) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active }, tab => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(tab);
    });
  });
}

function updateTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, tab => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise(resolve => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

async function acquireAmazonListingTab(workerIndex = 0) {
  const existing = await new Promise(resolve => {
    chrome.tabs.query({ url: 'https://www.amazon.com/*' }, tabs => resolve(tabs || []));
  });
  if (existing[workerIndex]) return { tabId: existing[workerIndex].id, created: false };
  const tab = await createTab('https://www.amazon.com/', false);
  await waitTabComplete(tab.id, 20000);
  return { tabId: tab.id, created: true };
}

async function navigateAmazonListingTab(tabId, asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  await updateTab(tabId, url);
  await waitTabComplete(tabId, 25000);
  await sleep(1200);
  return url;
}

function listingDomainForSalesChannel(salesChannel = '') {
  const text = String(salesChannel || '').trim();
  if (text === 'Amazon.com' || !text) return 'amazon.com';
  if (text === 'Amazon.co.uk') return 'amazon.co.uk';
  return '';
}

function listingMapKey(domain, asin) {
  const cleanDomain = String(domain || 'amazon.com').toLowerCase();
  const cleanAsin = String(asin || '').trim().toUpperCase();
  return `${cleanDomain}|${cleanAsin}`;
}

function getListingCacheStore() {
  if (!globalThis.__AD_OPS_LISTING_CACHE || typeof globalThis.__AD_OPS_LISTING_CACHE !== 'object') {
    globalThis.__AD_OPS_LISTING_CACHE = { entries: {} };
  }
  if (!globalThis.__AD_OPS_LISTING_CACHE.entries || typeof globalThis.__AD_OPS_LISTING_CACHE.entries !== 'object') {
    globalThis.__AD_OPS_LISTING_CACHE.entries = {};
  }
  return globalThis.__AD_OPS_LISTING_CACHE;
}

function selectListingFetchTasks(cards = [], options = {}) {
  const listingSkus = new Set((options.listingSkus || []).map(item => String(item || '').trim().toUpperCase()).filter(Boolean));
  const fastSchemaOnly = options.listingStrategy === 'schema' && listingSkus.size > 0;
  const maxListings = Number(options.listingLimit || localStorage.getItem('AD_OPS_LISTING_FETCH_LIMIT') || 120);
  const seen = new Set();
  const tasks = [];
  for (const card of cards || []) {
    const sku = String(card.sku || '').trim().toUpperCase();
    if (fastSchemaOnly && !listingSkus.has(sku)) continue;
    const asin = String(card.asin || '').trim().toUpperCase();
    if (!asin) continue;
    const domain = listingDomainForSalesChannel(card.salesChannel);
    if (domain !== 'amazon.com') continue;
    const key = listingMapKey(domain, asin);
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({ asin, domain, key });
    if (tasks.length >= maxListings) break;
  }
  STATE.listingFetchMeta = {
    ...(STATE.listingFetchMeta || {}),
    maxListings,
    listingStrategy: options.listingStrategy || 'all',
    skippedByLimitOrMarket: Math.max(0, (cards || []).filter(card => card.asin).length - tasks.length),
  };
  return tasks;
}

function inferSiteIdFromCard(card = {}) {
  const firstCampaign = Array.isArray(card.campaigns) ? card.campaigns.find(item => Number(item?.siteId)) : null;
  if (firstCampaign?.siteId) return Number(firstCampaign.siteId) || 4;
  const salesChannel = String(card.salesChannel || '').trim();
  if (salesChannel === 'Amazon.co.uk') return 3;
  return 4;
}

function buildChartDateRange(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - Math.max(1, Number(days || 30) - 1) * 86400000);
  const fmt = value => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  return [fmt(start), fmt(end)];
}

function selectProductChartTasks(cards = [], options = {}) {
  const strategy = String(options.chartStrategy || 'none');
  if (strategy === 'none') return [];
  const chartSkus = new Set((options.chartSkus || []).map(item => String(item || '').trim().toUpperCase()).filter(Boolean));
  const tasks = [];
  for (const card of cards || []) {
    const sku = String(card.sku || '').trim().toUpperCase();
    if (!sku) continue;
    if (strategy === 'schema' && chartSkus.size && !chartSkus.has(sku)) continue;
    tasks.push({
      sku,
      siteId: inferSiteIdFromCard(card),
      salesChannel: card.salesChannel || '',
    });
  }
  return tasks;
}

function summarizeProductChartSeries(points = []) {
  const clean = (points || []).map(item => ({
    date: String(item.startDate || ''),
    impressions: Number(item.Impressions || 0) || 0,
    clicks: Number(item.Clicks || 0) || 0,
    spend: Number(item.Spend || 0) || 0,
    orders: Number(item.Orders || 0) || 0,
    sales: Number(item.Sales || 0) || 0,
  }));
  const last7 = clean.slice(-7);
  const prev7 = clean.slice(-14, -7);
  const sum = list => list.reduce((acc, item) => {
    acc.impressions += item.impressions;
    acc.clicks += item.clicks;
    acc.spend += item.spend;
    acc.orders += item.orders;
    acc.sales += item.sales;
    return acc;
  }, { impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0 });
  const tail = sum(last7);
  const prev = sum(prev7);
  const deltaPct = (a, b) => b > 0 ? (a - b) / b : null;
  return {
    points: clean,
    totals: {
      impressions: sum(clean).impressions,
      clicks: sum(clean).clicks,
      spend: sum(clean).spend,
      orders: sum(clean).orders,
      sales: sum(clean).sales,
    },
    last7: tail,
    prev7: prev,
    deltaPct: {
      impressions: deltaPct(tail.impressions, prev.impressions),
      clicks: deltaPct(tail.clicks, prev.clicks),
      spend: deltaPct(tail.spend, prev.spend),
      orders: deltaPct(tail.orders, prev.orders),
      sales: deltaPct(tail.sales, prev.sales),
    },
    trafficDown: tail.impressions < prev.impressions && tail.clicks < prev.clicks,
  };
}

async function fetchProductChart(tabId, task, options = {}) {
  const selectDate = buildChartDateRange(options.chartLookbackDays || 30);
  const payload = {
    selectDate,
    mode: 1,
    state: 4,
    siteId: task.siteId || 4,
    sku: task.sku,
    userName: options.chartUserNames || ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
  };
  const result = await execAdApi(tabId, '/product/chart', payload, 'POST');
  if (result?.error) throw new Error(result.error);
  const data = result?.data;
  if (!data || data.code !== 200 || !Array.isArray(data.data)) {
    throw new Error(`product/chart invalid response for ${task.sku}`);
  }
  return {
    sku: task.sku,
    siteId: task.siteId || 4,
    salesChannel: task.salesChannel || '',
    selectDate,
    summary: summarizeProductChartSeries(data.data),
    raw: data.data,
  };
}

async function fetchProductCharts(tasks = [], options = {}) {
  const tab = await findTab('*://adv.yswg.com.cn/*');
  const map = {};
  for (const task of tasks || []) {
    try {
      const chart = await fetchProductChart(tab.id, task, options);
      map[task.sku] = chart;
    } catch (error) {
      log(`product/chart ${task.sku} 抓取失败：${error.message}`, 'warn');
    }
  }
  return map;
}

function attachProductChartData(cards = [], productChartMap = {}) {
  return (cards || []).map(card => {
    const sku = String(card.sku || '').trim().toUpperCase();
    return {
      ...card,
      productChart: productChartMap[sku] || null,
    };
  });
}

async function scrapeAmazonListingInTab(tabId, asin) {
  return execInTab(tabId, targetAsin => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const uniq = list => [...new Set((list || []).map(item => normalize(item)).filter(Boolean))];
    const text = node => normalize(node?.textContent || '');
    const query = selector => document.querySelector(selector);
    const queryAll = selector => [...document.querySelectorAll(selector)];
    const bodyText = normalize(document.body?.innerText || '');
    const titleText = normalize(document.title || '');
    const detectKind = () => {
      if (query('#productTitle') || query('#dp') || query('#feature-bullets')) return 'product_page';
      if (/api-services-support@amazon\.com|automated access|enter the characters you see below|captcha/i.test(bodyText)) return 'blocked_or_captcha';
      if (/sign in|ap_signin|authportal/i.test(bodyText) || /signin/i.test(location.href)) return 'signin_gate';
      if (/Sorry! We couldn't find that page|Page Not Found|dogs of amazon/i.test(bodyText + ' ' + titleText)) return 'not_found';
      return 'unknown_dom';
    };

    const result = {
      asin: targetAsin,
      url: location.href,
      pageTitle: titleText,
      kind: detectKind(),
      isAvailable: !!(query('#add-to-cart-button') || query('#buy-now-button')),
      reviewCount: null,
      reviewRating: null,
      price: null,
      hasPrime: !!query('#isPrimeBadge, .a-icon-prime, [aria-label*="Prime"]'),
      bsr: [],
      title: text(query('#productTitle')) || normalize(query('meta[property="og:title"]')?.getAttribute('content') || ''),
      brand: text(query('#bylineInfo')) || normalize(query('#brand')?.getAttribute('value') || ''),
      bullets: uniq(queryAll('#feature-bullets li span.a-list-item, #feature-bullets li').map(node => text(node)).filter(item => item && item !== 'Make sure this fits by entering your model number.')),
      description: text(query('#productDescription')) || normalize(query('meta[name="description"]')?.getAttribute('content') || ''),
      aPlusText: uniq(queryAll('#aplus_feature_div img[alt], #aplus_feature_div p, #aplus_feature_div li, #aplus_feature_div h1, #aplus_feature_div h2, #aplus_feature_div h3, #aplus_feature_div h4, #aplus_feature_div span').map(node => normalize(node.getAttribute?.('alt') || text(node)))).join(' | '),
      breadcrumbs: uniq(queryAll('#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs_container a').map(node => text(node))),
      mainImageUrl: '',
      imageUrls: [],
      variationText: uniq(queryAll('#variation_color_name .selection, #variation_size_name .selection, #variation_style_name .selection, #twister_feature_div .selection').map(node => text(node))).join(' | '),
      fetchedAt: new Date().toISOString(),
      bodyPreview: bodyText.slice(0, 220),
    };

    const reviewCountMatch = text(query('#acrCustomerReviewText')).match(/[\d,]+/);
    if (reviewCountMatch) result.reviewCount = parseInt(reviewCountMatch[0].replace(/,/g, ''), 10);
    const ratingText = query('#acrPopover')?.getAttribute('title') || text(query('.reviewCountTextLinkedHistogram')) || text(query('[data-hook="rating-out-of-text"]'));
    const ratingMatch = String(ratingText || '').match(/(\d+\.?\d*)/);
    if (ratingMatch) result.reviewRating = parseFloat(ratingMatch[1]);
    const priceText = text(query('.a-price .a-offscreen')) || text(query('#priceblock_ourprice')) || text(query('#priceblock_dealprice'));
    const priceMatch = String(priceText || '').match(/[\d,.]+/);
    if (priceMatch) result.price = parseFloat(priceMatch[0].replace(/,/g, ''));

    const imageCandidates = [];
    for (const img of queryAll('#landingImage, #imgTagWrapperId img, #main-image-container img')) {
      try {
        const dynamic = JSON.parse(img.getAttribute('data-a-dynamic-image') || '{}');
        if (dynamic && typeof dynamic === 'object') imageCandidates.push(...Object.keys(dynamic));
      } catch (_) {}
      imageCandidates.push(img.getAttribute('data-old-hires'), img.getAttribute('src'), img.getAttribute('data-src'));
    }
    const metaImage = query('meta[property="og:image"]')?.getAttribute('content');
    if (metaImage) imageCandidates.push(metaImage);
    result.imageUrls = uniq(imageCandidates);
    result.mainImageUrl = result.imageUrls[0] || '';

    const bsrText = text(query('#detailBulletsWrapper_feature_div')) || text(query('#productDetails_detailBullets_sections1')) || text(query('#SalesRank'));
    const bsrRe = /#([\d,]+)\s+in\s+([^#\n(]+?)(?:\(|$|See Top)/g;
    let match;
    while ((match = bsrRe.exec(bsrText)) !== null) {
      result.bsr.push({ rank: parseInt(match[1].replace(/,/g, ''), 10), category: normalize(match[2]) });
    }

    return result;
  }, [asin]);
}

async function handleAmazonInterstitial(tabId, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const state = await execInTab(tabId, () => {
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const bodyText = normalize(document.body?.innerText || '');
      const hasProduct = !!(document.querySelector('#productTitle') || document.querySelector('#dp') || document.querySelector('#feature-bullets'));
      if (hasProduct) return { kind: 'product_page', acted: false, href: location.href };

      const candidates = [...document.querySelectorAll('button, a, input[type="submit"]')];
      const continueEl = candidates.find(node => {
        const text = normalize(node.innerText || node.textContent || node.value || '');
        return /continue shopping/i.test(text);
      });

      if (continueEl) {
        continueEl.click();
        return {
          kind: 'continue_shopping',
          acted: true,
          href: location.href,
          buttonText: normalize(continueEl.innerText || continueEl.textContent || continueEl.value || ''),
          bodyPreview: bodyText.slice(0, 180),
        };
      }

      if (/api-services-support@amazon\.com|automated access|enter the characters you see below|captcha/i.test(bodyText)) {
        return { kind: 'blocked_or_captcha', acted: false, href: location.href, bodyPreview: bodyText.slice(0, 180) };
      }
      if (/sign in|ap_signin|authportal/i.test(bodyText) || /signin/i.test(location.href)) {
        return { kind: 'signin_gate', acted: false, href: location.href, bodyPreview: bodyText.slice(0, 180) };
      }
      return { kind: 'unknown_dom', acted: false, href: location.href, bodyPreview: bodyText.slice(0, 180) };
    });

    if (!state?.acted) return state;
    await waitTabComplete(tabId, 20000);
    await sleep(1800);
  }

  return execInTab(tabId, () => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = normalize(document.body?.innerText || '');
    const hasProduct = !!(document.querySelector('#productTitle') || document.querySelector('#dp') || document.querySelector('#feature-bullets'));
    return {
      kind: hasProduct ? 'product_page' : 'unknown_dom',
      acted: false,
      href: location.href,
      bodyPreview: bodyText.slice(0, 180),
    };
  });
}

async function ensureAdKeywordPage(tabId) {
  const isReady = async () => execInTab(tabId, () => {
    const href = location.href;
    const text = document.body?.innerText || '';
    const hasKeywordTabs = text.includes('SP关键词') || text.includes('SB关键词') || text.includes('您的关键词');
    const hasSearch = [...document.querySelectorAll('button,.el-button,[class*="btn"]')]
      .some(e => /查询|搜索|Search/.test((e.innerText || e.textContent || '').trim()));
    return { ready: href.includes('/vue/KeywordManage') && hasKeywordTabs && hasSearch, href };
  });

  let state = await isReady();
  if (state?.ready) return;

  await new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url: `https://adv.yswg.com.cn/vue/KeywordManage?tabId=${Date.now()}` }, tab => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(tab);
    });
  });
  await waitTabComplete(tabId);

  for (let i = 0; i < 40; i++) {
    state = await isReady();
    if (state?.ready) {
      log(`广告关键词页已就绪：${state.href}`, 'warn');
      return;
    }
    await sleep(500);
  }
  throw new Error('广告关键词页未就绪：请确认 adv.yswg.com.cn 已登录，并能打开“您的关键词”页面');
}

async function ensureInventoryListPage(tabId) {
  const openListInRoot = async () => execInTab(tabId, () => {
    const hasListFrame = [...document.querySelectorAll('iframe')]
      .some(f => (f.src || '').includes('/pm/formal/list') && (f.src || '').includes('Inventory-Token'));
    if (hasListFrame) return { ready: true };

    if (window.layui?.index?.openTabsPage) {
      window.layui.index.openTabsPage('/pm/formal/list', '产品数据分析-开发');
      return { opened: true };
    }
    return { needRoot: true, href: location.href };
  });

  let status = await openListInRoot();
  if (status?.needRoot) {
    await new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { url: 'https://sellerinventory.yswg.com.cn/' }, tab => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tab);
      });
    });
    await waitTabComplete(tabId);
    await sleep(1500);
    status = await openListInRoot();
  }

  for (let i = 0; i < 40; i++) {
    const ready = await execInTab(tabId, () => {
      const frame = [...document.querySelectorAll('iframe')]
        .find(f => (f.src || '').includes('/pm/formal/list') && (f.src || '').includes('Inventory-Token'));
      if (!frame) return { ready: false };
      try {
        const w = frame.contentWindow;
        const doc = w?.document;
        const ready = doc?.readyState === 'complete' &&
          !!doc.querySelector('input.search_btn') &&
          typeof w.list_table === 'object';
        return { ready, src: frame.src };
      } catch(e) {
        return { ready: false, src: frame.src, error: e.message };
      }
    });
    if (ready?.ready) {
      log(`库存产品列表已就绪：${ready.src.slice(0, 120)}`, 'warn');
      return;
    }
    await sleep(500);
  }
  throw new Error('库存产品列表未打开：请确认 sellerinventory 首页已登录，并可打开产品数据分析-开发');
}

// 广告系统 API 调用（注入到 adv.yswg.com.cn 标签页，同域执行，自动读取 XSRF）
async function execAdApi(tabId, path, payload, method) {
  return execInTab(tabId, async (path, payload, method) => {
    try {
      const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch(path, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-xsrf-token': decodeURIComponent(xsrf),
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) return { error: '广告系统未登录，请刷新 adv.yswg.com.cn 后重试' };
      return { data: JSON.parse(text) };
    } catch (e) { return { error: e.message }; }
  }, [path, payload, method]);
}

// 广告写操作（PATCH），供 executePlan 使用
async function execAdWrite(path, payload) {
  const tab = await findTab('*://adv.yswg.com.cn/*');
  const result = await execAdApi(tab.id, path, payload, 'PATCH');
  if (!result) throw new Error(`广告接口 ${path} 无响应`);
  return result.data;
}

function structuredCreateCampaignResult(base = {}, extra = {}) {
  return {
    ok: Object.prototype.hasOwnProperty.call(extra, 'ok') ? extra.ok : !!base.ok,
    stage: extra.stage || base.stage || '',
    mode: extra.mode || base.mode || '',
    requestUrl: extra.requestUrl || base.requestUrl || '/campaign/createOneTime',
    campaignName: extra.campaignName || base.campaignName || '',
    groupName: extra.groupName || base.groupName || '',
    requestBody: Object.prototype.hasOwnProperty.call(extra, 'requestBody') ? extra.requestBody : (base.requestBody || null),
    responseCode: Object.prototype.hasOwnProperty.call(extra, 'responseCode') ? extra.responseCode : (base.responseCode ?? null),
    responseMsg: Object.prototype.hasOwnProperty.call(extra, 'responseMsg') ? extra.responseMsg : (base.responseMsg || ''),
    campaignId: Object.prototype.hasOwnProperty.call(extra, 'campaignId') ? extra.campaignId : (base.campaignId || ''),
    adGroupId: Object.prototype.hasOwnProperty.call(extra, 'adGroupId') ? extra.adGroupId : (base.adGroupId || ''),
    errorType: Object.prototype.hasOwnProperty.call(extra, 'errorType') ? extra.errorType : (base.errorType || ''),
    reason: Object.prototype.hasOwnProperty.call(extra, 'reason') ? extra.reason : (base.reason || ''),
    errors: Object.prototype.hasOwnProperty.call(extra, 'errors') ? extra.errors : (base.errors || []),
    rawResponse: Object.prototype.hasOwnProperty.call(extra, 'rawResponse') ? extra.rawResponse : (base.rawResponse || null),
  };
}

function normalizeCreateMode(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(auto|自动组)$/i.test(text)) return 'auto';
  if (/^(productTarget|定位组)$/i.test(text)) return 'productTarget';
  if (/^(keywordTarget|关键词组)$/i.test(text)) return 'keywordTarget';
  return text;
}

function normalizeStringList(list, transform = value => String(value || '').trim()) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(transform).filter(Boolean))];
}

function buildSpCampaignNames(mode, coreTerm, sku) {
  const prefixByMode = {
    auto: 'auto',
    productTarget: 'asin',
    keywordTarget: 'kw',
  };
  const prefix = prefixByMode[mode] || 'sp';
  const campaignName = `${prefix}_${coreTerm}_${String(sku || '').toLowerCase()}`;
  return { campaignName, groupName: campaignName };
}

const BACKEND_CREATE_STRATEGY = {
  auto: 'LEGACY_FOR_SALES',
  productTarget: 'LEGACY_FOR_SALES',
  keywordTarget: 'MANUAL',
};

function buildCreateActionId(action = {}, fallbackSku = '') {
  const mode = normalizeCreateMode(action?.createInput?.mode || action?.mode || action?.positionType || '');
  const sku = String(action?.sku || fallbackSku || '').trim();
  const coreTerm = String(action?.createInput?.coreTerm || action?.coreTerm || '').trim();
  return `create::${sku || 'unknown'}::${mode || 'unknown'}::${coreTerm || 'unknown'}`;
}

function buildSpCreatePayload(input = {}) {
  const mode = normalizeCreateMode(input.mode || input.positionType);
  const sku = String(input.sku || '').trim();
  const asin = String(input.asin || '').trim().toUpperCase();
  const coreTerm = String(input.coreTerm || '').trim();
  const accountId = Number(input.accountId);
  const siteId = Number(input.siteId);
  const dailyBudget = Number(input.dailyBudget);
  const defaultBid = Number(input.defaultBid);
  const errors = [];

  if (!['auto', 'productTarget', 'keywordTarget'].includes(mode)) errors.push('mode must be auto, productTarget, or keywordTarget');
  if (!coreTerm) errors.push('coreTerm is required by SOP naming rule');
  if (!sku) errors.push('sku is required');
  if (!asin) errors.push('asin is required');
  if (!Number.isFinite(accountId) || accountId <= 0) errors.push('accountId must be a positive number');
  if (!Number.isFinite(siteId) || siteId <= 0) errors.push('siteId must be a positive number');
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) errors.push('dailyBudget must be a positive number');
  if (!Number.isFinite(defaultBid) || defaultBid <= 0) errors.push('defaultBid must be a positive number');

  const startDate = formatYmd(new Date());
  const { campaignName, groupName } = buildSpCampaignNames(mode, coreTerm, sku);
  const base = {
    ok: errors.length === 0,
    stage: 'build',
    mode,
    requestUrl: '/campaign/createOneTime',
    campaignName,
    groupName,
    errors,
  };
  if (errors.length) return structuredCreateCampaignResult(base, { ok: false });

  const payload = {
    createType: 'campaign',
    advType: 'SP',
    name: '创建 SP 广告活动',
    campaignName,
    startDate,
    accountId,
    siteId,
    dailyBudget,
    offAmazonBudgetControlStrategy: 'MINIMIZE_SPEND',
    placementTop: 0,
    placementProductPage: 0,
    placementRestOfSearch: 0,
    siteAmazonBusiness: 0,
    groupName,
    haulFlag: false,
    asinArray: [asin],
    skuArray: [sku],
    defaultBid,
  };

  if (mode === 'auto') {
    payload.targetingType = 'AUTO';
    payload.positionType = 'auto';
    payload.strategy = BACKEND_CREATE_STRATEGY.auto;
    payload.autoTargetUpdate = {
      QUERY_HIGH_REL_MATCHES: { bid: defaultBid, state: 'enabled' },
      QUERY_BROAD_REL_MATCHES: { bid: defaultBid, state: 'enabled' },
      ASIN_ACCESSORY_RELATED: { bid: defaultBid, state: 'enabled' },
      ASIN_SUBSTITUTE_RELATED: { bid: defaultBid, state: 'enabled' },
    };
    payload.negativeKeywordArray = [];
    payload.negativeProductTargetArray = [];
  } else if (mode === 'productTarget') {
    const targetType = String(input.targetType || '').trim();
    const targetAsins = normalizeStringList(input.targetAsins, value => String(value || '').trim().toUpperCase());
    if (!targetType) errors.push('targetType is required for productTarget');
    if (!targetAsins.length) errors.push('targetAsins must contain at least one ASIN');
    if (errors.length) return structuredCreateCampaignResult(base, { ok: false, errors });

    payload.targetingType = 'MANUAL';
    payload.positionType = 'productTarget';
    payload.strategy = BACKEND_CREATE_STRATEGY.productTarget;
    payload.productTargetArray = targetAsins.map(value => ({
      bid: defaultBid,
      targetMark: '',
      resolvedExpression: [{ type: targetType, value }],
      expression: [{ type: targetType, value }],
    }));
    payload.negativeProductTargetArray = [];
  } else if (mode === 'keywordTarget') {
    const matchType = String(input.matchType || '').trim().toUpperCase();
    const keywords = normalizeStringList(input.keywords);
    if (!matchType) errors.push('matchType is required for keywordTarget');
    if (!keywords.length) errors.push('keywords must contain at least one keyword');
    if (errors.length) return structuredCreateCampaignResult(base, { ok: false, errors });

    payload.targetingType = 'MANUAL';
    payload.positionType = 'keywordTarget';
    payload.strategy = BACKEND_CREATE_STRATEGY.keywordTarget;
    payload.keywordArray = keywords.map(keywordText => ({
      keywordText,
      matchType,
      bid: defaultBid,
      coreMark: '',
    }));
    payload.keywordGroups = [];
    payload.negativeKeywordArray = [];
  }

  return structuredCreateCampaignResult(base, { ok: true, requestBody: payload, errors: [] });
}

async function createSpCampaign(input = {}) {
  const built = buildSpCreatePayload(input);
  if (!built.ok) return built;

  try {
    const tab = await findTab('*://adv.yswg.com.cn/*');
    const result = await execAdApi(tab.id, built.requestUrl, built.requestBody, 'POST');
    if (!result) {
      return structuredCreateCampaignResult(built, {
        ok: false,
        stage: 'request',
        responseMsg: '广告接口无响应',
        errors: ['ad api returned empty result'],
      });
    }
    if (result.error) {
      return structuredCreateCampaignResult(built, {
        ok: false,
        stage: 'request',
        responseMsg: result.error,
        errors: [result.error],
      });
    }

    const json = result.data || {};
    const productAdsError = json?.data?.productAds?.error || {};
    const createdParam = json?.data?.param || {};
    const campaignId = String(json?.data?.campaignId || createdParam?.campaignId || '');
    const adGroupId = String(json?.data?.adGroupId || createdParam?.adGroupId || '');
    const ok = Number(json?.code) === 200 && !!campaignId && !!adGroupId;
    return structuredCreateCampaignResult(built, {
      ok,
      stage: 'done',
      responseCode: json?.code ?? null,
      responseMsg: json?.msg || '',
      campaignId,
      adGroupId,
      errorType: productAdsError?.errorType || '',
      reason: productAdsError?.reason || '',
      rawResponse: json,
      errors: ok ? [] : [
        json?.msg || 'createOneTime failed',
        productAdsError?.errorType || '',
        productAdsError?.reason || '',
      ].filter(Boolean),
    });
  } catch (e) {
    return structuredCreateCampaignResult(built, {
      ok: false,
      stage: 'exception',
      responseMsg: e.message,
      errors: [e.message],
    });
  }
}

async function createCampaignFromTextarea() {
  const text = $('spCreateTextarea')?.value.trim() || '';
  if (!text) {
    log('请先粘贴 SP 创建参数 JSON', 'warn');
    return;
  }

  let input;
  try {
    input = JSON.parse(text);
  } catch (e) {
    log(`SP 创建参数 JSON 解析失败：${e.message}`, 'error');
    return;
  }

  createCampaignBtn.disabled = true;
  const result = await createSpCampaign(input);
  if (result.ok) {
    log(`SP 创建成功：${result.mode} campaignId=${result.campaignId} adGroupId=${result.adGroupId}`, 'ok');
  } else {
    const detail = [result.responseMsg, result.errorType, result.reason, ...(result.errors || [])].filter(Boolean).join(' | ');
    log(`SP 创建失败：${result.mode || 'unknown'} ${detail}`, 'error');
  }
  console.log('[sp-create]', result);
  createCampaignBtn.disabled = false;
}

window.buildSpCreatePayload = buildSpCreatePayload;
window.createSpCampaign = createSpCampaign;

function normalizeCreateAction(raw = {}, plan = {}) {
  if (!raw || raw.actionType !== 'create') return raw;
  const normalized = { ...raw };
  normalized.entityType = 'spCampaign';
  normalized.sku = normalized.sku || plan.sku || '';
  normalized.createInput = {
    ...(normalized.createInput || {}),
    mode: normalizeCreateMode(normalized?.createInput?.mode || normalized.mode || normalized.positionType || ''),
    sku: normalized?.createInput?.sku || normalized.sku || plan.sku || '',
    asin: normalized?.createInput?.asin || plan.asin || normalized.asin || '',
    accountId: normalized?.createInput?.accountId ?? normalized.accountId ?? plan?.createContext?.accountId,
    siteId: normalized?.createInput?.siteId ?? normalized.siteId ?? plan?.createContext?.siteId ?? 4,
    dailyBudget: normalized?.createInput?.dailyBudget ?? normalized.dailyBudget ?? plan?.createContext?.recommendedDailyBudget,
    defaultBid: normalized?.createInput?.defaultBid ?? normalized.defaultBid ?? plan?.createContext?.recommendedDefaultBid,
    coreTerm: normalized?.createInput?.coreTerm || normalized.coreTerm || '',
    targetType: normalized?.createInput?.targetType || normalized.targetType || '',
    targetAsins: normalized?.createInput?.targetAsins || normalized.targetAsins || [],
    matchType: normalized?.createInput?.matchType || normalized.matchType || '',
    keywords: normalized?.createInput?.keywords || normalized.keywords || [],
  };
  if (!normalized.id) normalized.id = buildCreateActionId(normalized, plan.sku || '');
  return normalized;
}

function structuredToggleResult(base = {}, extra = {}) {
  return {
    ok: Object.prototype.hasOwnProperty.call(extra, 'ok') ? extra.ok : !!base.ok,
    action: extra.action || base.action || '',
    entityType: extra.entityType || base.entityType || 'UNKNOWN',
    sku: extra.sku || base.sku || '',
    keywordId: extra.keywordId || base.keywordId || '',
    targetId: extra.targetId || base.targetId || '',
    adId: extra.adId || base.adId || '',
    campaignId: extra.campaignId || base.campaignId || '',
    adGroupId: extra.adGroupId || base.adGroupId || '',
    requestUrl: extra.requestUrl || base.requestUrl || '',
    requestBody: Object.prototype.hasOwnProperty.call(extra, 'requestBody') ? extra.requestBody : (base.requestBody || null),
    responseCode: Object.prototype.hasOwnProperty.call(extra, 'responseCode') ? extra.responseCode : (base.responseCode ?? null),
    responseMsg: Object.prototype.hasOwnProperty.call(extra, 'responseMsg') ? extra.responseMsg : (base.responseMsg || ''),
    rawResponse: Object.prototype.hasOwnProperty.call(extra, 'rawResponse') ? extra.rawResponse : (base.rawResponse || null),
    reason: Object.prototype.hasOwnProperty.call(extra, 'reason') ? extra.reason : (base.reason || ''),
  };
}

function detectEntityType(row, hintedType = '') {
  const normalized = normalizeActionEntityType(hintedType);
  if (normalized === 'keyword') return 'SP_KEYWORD';
  if (normalized === 'autoTarget') return 'SP_AUTO_TARGET';
  if (normalized === 'manualTarget') return 'SP_MANUAL_TARGET';
  if (normalized === 'productAd') return 'SP_PRODUCT_AD';
  if (normalized === 'sbCampaign') return 'SB_CAMPAIGN';
  if (normalized === 'sbKeyword') return 'SB_KEYWORD';
  if (normalized === 'sbTarget') return 'SB_TARGET';

  const prop = String(row?.__adProperty || '');
  if (row?.keywordId || row?.keyword_id) return prop === '4' ? 'SB_KEYWORD' : 'SP_KEYWORD';
  if (row?.targetId || row?.target_id) return prop === '6' ? 'SB_TARGET' : 'SP_AUTO_TARGET';
  if (row?.adId || row?.ad_id) return 'SP_PRODUCT_AD';
  return 'UNKNOWN';
}

function getToggleStateValues(entityType, action) {
  const enable = action === 'enable';
  if (entityType.startsWith('SP_')) return { textState: enable ? 'ENABLED' : 'PAUSED', numericState: enable ? 1 : 2 };
  if (entityType.startsWith('SB_')) return { textState: enable ? 'enabled' : 'paused', numericState: enable ? 1 : 2 };
  return null;
}

function readToggleRowField(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function buildStateToggleRequest(row, action, hintedType = '') {
  const entityType = detectEntityType(row, hintedType);
  const base = structuredToggleResult({
    action,
    entityType,
    sku: readToggleRowField(row, ['sku', 'SKU']),
    keywordId: String(readToggleRowField(row, ['keywordId', 'keyword_id', 'id']) || ''),
    targetId: String(readToggleRowField(row, ['targetId', 'target_id', 'id']) || ''),
    adId: String(readToggleRowField(row, ['adId', 'ad_id']) || ''),
    campaignId: String(readToggleRowField(row, ['campaignId', 'campaign_id']) || ''),
    adGroupId: String(readToggleRowField(row, ['adGroupId', 'ad_group_id']) || ''),
  });

  if (!['enable', 'pause'].includes(action)) return structuredToggleResult(base, { reason: 'unsupported action' });

  const stateValues = getToggleStateValues(entityType, action);
  if (!stateValues) return structuredToggleResult(base, { reason: 'unsupported entity type' });

  const siteId = Number(readToggleRowField(row, ['siteId'])) || 4;
  const accountId = readToggleRowField(row, ['accountId']);
  const campaignId = String(readToggleRowField(row, ['campaignId', 'campaign_id']) || '');
  const adGroupId = String(readToggleRowField(row, ['adGroupId', 'ad_group_id']) || '');
  const keywordId = String(readToggleRowField(row, ['keywordId', 'keyword_id', 'id']) || '');
  const targetId = String(readToggleRowField(row, ['targetId', 'target_id', 'id']) || '');
  const adId = String(readToggleRowField(row, ['adId', 'ad_id']) || '');
  const matchType = readToggleRowField(row, ['matchType', 'match_type']);

  let requestUrl = '';
  let requestBody = null;
  let missingFields = [];

  if (entityType === 'SP_KEYWORD') {
    requestUrl = '/keyword/batchKeyword';
    missingFields = [keywordId ? '' : 'keywordId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      column: 'state',
      targetArray: [{ keywordId, state: stateValues.textState }],
      targetNewArray: [{ keywordId, state: stateValues.numericState, accountId, campaignId, adGroupId }],
      property: 'keyword',
      idArray: [keywordId],
      campaignIdArray: [campaignId],
      operation: 'state',
    };
  } else if (entityType === 'SP_AUTO_TARGET') {
    requestUrl = '/advTarget/batchEditAutoTarget';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      column: 'state',
      targetArray: [{ targetId, state: stateValues.textState }],
      targetNewArray: [{ targetId, state: stateValues.numericState, accountId, campaignId, adGroupId }],
      property: 'autoTarget',
      campaignIdArray: [campaignId],
      idArray: [targetId],
      operation: 'state',
    };
  } else if (entityType === 'SP_MANUAL_TARGET') {
    requestUrl = '/advTarget/batchUpdateManualTarget';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      column: 'state',
      targetArray: [{ targetId, state: stateValues.textState }],
      targetNewArray: [{ targetId, state: stateValues.numericState, accountId, campaignId, adGroupId }],
      property: 'manualTarget',
      campaignIdArray: [campaignId],
      idArray: [targetId],
      operation: 'state',
    };
  } else if (entityType === 'SB_KEYWORD') {
    requestUrl = '/keywordSb/batchEditKeywordSbColumn';
    missingFields = [keywordId ? '' : 'keywordId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId', matchType ? '' : 'matchType'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      column: 'state',
      targetArray: [{ campaignId, adGroupId, matchType, keywordId, state: stateValues.textState }],
      targetNewArray: [{ campaignId, adGroupId, matchType, keywordId, state: stateValues.numericState, accountId }],
    };
  } else if (entityType === 'SB_TARGET') {
    requestUrl = '/sbTarget/batchEditTargetSbColumn';
    missingFields = [targetId ? '' : 'targetId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = {
      column: 'state',
      targetArray: [{ campaignId, adGroupId, targetId, state: stateValues.textState }],
      idArray: [targetId],
      operation: 'state',
      siteId,
      accountId,
      campaignIdArray: [campaignId],
      targetNewArray: [{ targetId, state: stateValues.numericState, accountId, campaignId, adGroupId }],
    };
  } else if (entityType === 'SB_CAMPAIGN') {
    requestUrl = '/campaignSb/batchSbCampaign';
    missingFields = [campaignId ? '' : 'campaignId'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      campaignIdArray: [campaignId],
      batchType: 'state',
      batchValue: stateValues.textState.toUpperCase(),
      campaignNewArray: [{ siteId, accountId, campaignId, state: stateValues.numericState }],
    };
  } else if (entityType === 'SP_PRODUCT_AD') {
    requestUrl = '/advProduct/batchProduct';
    missingFields = [adId ? '' : 'adId', campaignId ? '' : 'campaignId', adGroupId ? '' : 'adGroupId'].filter(Boolean);
    requestBody = {
      siteId,
      accountId,
      column: 'state',
      value: stateValues.textState.toLowerCase(),
      products: [adId],
      property: 'product',
      idArray: [adId],
      operation: 'state',
      campaignIdArray: [campaignId],
      productNewArray: [{ siteId, accountId, campaignId, adGroupId, adId, state: stateValues.numericState }],
    };
  } else {
    return structuredToggleResult(base, { reason: 'unsupported entity type' });
  }

  if (!accountId || missingFields.length) {
    return structuredToggleResult(base, {
      requestUrl,
      requestBody,
      reason: 'missing fields',
      rawResponse: { missingFields: [...(!accountId ? ['accountId'] : []), ...missingFields] },
    });
  }

  return structuredToggleResult(base, { requestUrl, requestBody, reason: '' });
}

async function executeStateToggle(row, action, hintedType = '') {
  const built = buildStateToggleRequest(row, action, hintedType);
  const logMeta = `action=${built.action} entityType=${built.entityType} keywordId=${built.keywordId || '-'} targetId=${built.targetId || '-'} adId=${built.adId || '-'} campaignId=${built.campaignId || '-'} adGroupId=${built.adGroupId || '-'}`;

  if (!built.requestUrl || built.reason === 'missing fields' || built.reason === 'unsupported entity type') {
    log(`状态切换拦截 ${logMeta} url=${built.requestUrl || '-'} body=${JSON.stringify(built.requestBody)} reason=${built.reason}`, 'warn');
    return built;
  }

  log(`状态切换请求 ${logMeta} url=${built.requestUrl} body=${JSON.stringify(built.requestBody)}`, 'warn');
  try {
    const response = await execAdWrite(built.requestUrl, built.requestBody);
    const ok = !!(response && (response.code === 200 || response.msg === 'success'));
    log(`状态切换响应 ${logMeta} response=${JSON.stringify(response)}`, ok ? 'ok' : 'error');
    return structuredToggleResult(built, {
      ok,
      responseCode: response?.code ?? null,
      responseMsg: response?.msg || '',
      rawResponse: response,
      reason: ok ? '' : (response?.msg || 'api failed'),
    });
  } catch (e) {
    const rawResponse = { error: e.message };
    log(`状态切换异常 ${logMeta} response=${JSON.stringify(rawResponse)}`, 'error');
    return structuredToggleResult(built, {
      ok: false,
      responseCode: null,
      responseMsg: e.message,
      rawResponse,
      reason: e.message,
    });
  }
}

window.toggleAdState = executeStateToggle;
window.buildStateToggleRequest = buildStateToggleRequest;
window.detectAdEntityType = detectEntityType;
window.refreshRowsForExecutionEvents = refreshRowsForExecutionEvents;
window.hydrateInventorySnapshot = hydrateInventorySnapshot;
window.ensureInventoryRecordsForSkus = ensureInventoryRecordsForSkus;

function getApiList(json) {
  return json?.data?.records || json?.data?.list || json?.data?.rows ||
         json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
}

function inferPoolEntityLevel(row, adType) {
  if (row?.keywordId || row?.keyword_id) return 'keyword';
  if (row?.targetId || row?.target_id) return 'target';
  if (row?.adId || row?.ad_id) return 'productAd';
  if (row?.adGroupId || row?.ad_group_id) return 'adGroup';
  if (row?.campaignId || row?.campaign_id) return 'campaign';
  return adType === 'SP' ? 'skuCandidate' : 'campaign';
}

function classifySevenDayPoolRows(rows, adType) {
  const sample = rows?.[0] || {};
  const keys = Object.keys(sample);
  const entityLevel = inferPoolEntityLevel(sample, adType);
  return {
    count: rows?.length || 0,
    entityLevel,
    sampleKeys: keys,
    sample: keys.length ? Object.fromEntries(keys.slice(0, 30).map(k => [k, sample[k]])) : null,
  };
}

async function fetchPagedAdRows(path, basePayload, limit = 500) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= 500; page++) {
    const payload = { ...basePayload, page, limit };
    const tab = await findTab('*://adv.yswg.com.cn/*');
    const result = await execAdApi(tab.id, path, payload, 'POST');
    if (!result) throw new Error(`ad api ${path} returned empty result`);
    if (result.error) throw new Error(result.error);
    const json = result.data;
    const list = getApiList(json);
    if (!Array.isArray(list) || !list.length) break;
    rows.push(...list);
    total = json?.data?.total ?? json?.total ?? total;
    if (list.length < limit) break;
    if (total != null && rows.length >= Number(total)) break;
  }
  return rows;
}

function formatYmd(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeSbDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return [formatYmd(start), formatYmd(end)];
}

function makeSevenDaySpPayload() {
  return {
    siteId: 4,
    timeRange: makeAdTimeRange(30),
    state: '4',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    lowCost: 2,
    page: 1,
    limit: 500,
    publicAdv: '2',
    updateWeekday: '2',
  };
}

function makeAllSpProductPayload() {
  return {
    siteId: 4,
    timeRange: makeAdTimeRange(30),
    state: '4',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    page: 1,
    limit: 500,
    publicAdv: '2',
  };
}

function makeSevenDaySbPayload() {
  return {
    siteId: 4,
    activeStatus: 'notArchived',
    searchType: '1',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    selectCampaignDate: makeSbDateRange(30),
    page: 1,
    limit: 500,
    field: 'Spend',
    order: 'desc',
    filterForm: { OutOfBudget: false },
    source: 'new',
  };
}

function makeAllSbCampaignPayload() {
  return {
    siteId: 4,
    activeStatus: 'notArchived',
    searchType: '1',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    selectCampaignDate: makeSbDateRange(30),
    page: 1,
    limit: 500,
    field: 'Spend',
    order: 'desc',
  };
}

function makeAdSkuSummaryPayload() {
  return {
    siteId: 4,
    mode: 1,
    day: 30,
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    field: 'cost',
    order: 'desc',
    page: 1,
    limit: 500,
  };
}

function makeAdvProductManagePayload() {
  return {
    siteId: 4,
    timeRange: makeAdTimeRange(30),
    state: '4',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    lowCost: 2,
    page: 1,
    limit: 500,
  };
}

function makeSbCampaignManagePayload() {
  return {
    siteId: 4,
    activeStatus: 'notArchived',
    searchType: '1',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    selectCampaignDate: makeSbDateRange(30),
    page: 1,
    limit: 500,
    field: 'Spend',
    order: 'desc',
    filterForm: { OutOfBudget: false },
    source: 'new',
  };
}

async function fetchSevenDayUntouchedPools() {
  const [spRows, sbRows] = await Promise.all([
    fetchPagedAdRows('/advProduct/all', makeSevenDaySpPayload(), 500),
    fetchPagedAdRows('/campaignSb/findAllNew', makeSevenDaySbPayload(), 500),
  ]);
  const meta = {
    sp: classifySevenDayPoolRows(spRows, 'SP'),
    sb: classifySevenDayPoolRows(sbRows, 'SB'),
  };
  console.log('[seven-day-untouched:pools]', meta);
  if (spRows[0]) log(`SP 7d untouched fields: ${JSON.stringify(Object.keys(spRows[0]))}`, 'warn');
  if (sbRows[0]) log(`SB 7d untouched fields: ${JSON.stringify(Object.keys(sbRows[0]))}`, 'warn');
  return { spRows, sbRows, meta };
}

async function fetchAllProductAds() {
  const rows = await fetchPagedAdRows('/advProduct/all', makeAllSpProductPayload(), 500);
  if (rows[0]) log(`SP product ad fields: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

async function fetchAllSbCampaigns() {
  const rows = await fetchPagedAdRows('/campaignSb/findAllNew', makeAllSbCampaignPayload(), 500);
  if (rows[0]) log(`SB campaign fields: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

async function fetchAdSkuSummaryRows() {
  const rows = await fetchPagedAdRows('/product/adSkuSummary', makeAdSkuSummaryPayload(), 500);
  if (rows[0]) log(`广告 SKU 汇总字段: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

async function fetchAdvProductManageRows() {
  const rows = await fetchPagedAdRows('/advProduct/all', makeAdvProductManagePayload(), 500);
  if (rows[0]) log(`SP广告产品管理字段: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

async function fetchSbCampaignManageRows() {
  const rows = await fetchPagedAdRows('/campaignSb/findAllNew', makeSbCampaignManagePayload(), 500);
  if (rows[0]) log(`SB广告活动管理字段: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

function defaultPlacementDateRange(daysBack = 7) {
  const pad = value => String(value).padStart(2, '0');
  const fmt = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(1, Number(daysBack || 7)) + 1);
  return [fmt(start), fmt(end)];
}

function normalizePlacementRows(rows = [], meta = {}) {
  return (rows || []).map(row => ({
    ...row,
    campaignId: row.campaignId || row.campaign_id || meta.campaignId || '',
    accountId: row.accountId || row.account_id || meta.accountId || '',
    siteId: row.siteId || row.site_id || meta.siteId || '',
  }));
}

async function fetchCampaignPlacementRows({ campaignId, accountId, siteId = 4, days = 7 } = {}) {
  if (!campaignId || !accountId) return [];
  const tab = await findTab('*://adv.yswg.com.cn/*');
  const selectDate = defaultPlacementDateRange(days);
  const result = await execInTab(tab.id, async (payload) => {
    const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const url = new URL('/placement/findAllPlacement', location.origin);
    url.searchParams.set('campaignId', payload.campaignId);
    url.searchParams.set('accountId', payload.accountId);
    url.searchParams.set('siteId', payload.siteId);
    for (const item of payload.selectDate) url.searchParams.append('selectDate[]', item);
    const res = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { 'x-xsrf-token': decodeURIComponent(xsrf) },
    });
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return { ok: false, error: '广告系统未登录，请刷新 adv.yswg.com.cn 后重试', status: res.status };
    let json = null;
    try { json = JSON.parse(text); } catch (error) { return { ok: false, error: error.message, status: res.status, text: text.slice(0, 500) }; }
    const candidates = [
      json?.data?.records,
      json?.data?.data,
      json?.data?.list,
      json?.data?.rows,
      json?.records,
      json?.list,
      json?.rows,
      json?.data,
    ];
    const rows = candidates.find(Array.isArray) || [];
    return { ok: res.ok, status: res.status, rows };
  }, [{
    campaignId: String(campaignId),
    accountId: String(accountId),
    siteId: String(siteId || 4),
    selectDate,
  }]);
  if (!result?.ok) throw new Error(result?.error || `placement rows refresh failed for campaign ${campaignId}`);
  return normalizePlacementRows(result.rows || [], { campaignId, accountId, siteId });
}

async function refreshRowsForExecutionEvents(events = []) {
  const types = new Set((events || []).map(event => String(event.entityType || '')).filter(Boolean));
  const needsPlacementCapture = (events || []).some(event => event.entityType === 'campaign' && event.action?.actionType === 'placement');
  const refreshed = {};
  const errors = [];

  try {
    const needsKeywordCapture = types.has('keyword') || types.has('autoTarget') || types.has('manualTarget') || types.has('campaign');
    if (needsKeywordCapture && !STATE.kwCapture?.body) {
      STATE.kwRows = await fetchAllKeywords();
      refreshed.keyword = STATE.kwRows.length;
    } else if (types.has('keyword') || types.has('campaign')) {
      STATE.kwRows = await fetchAllKeywords();
      refreshed.keyword = STATE.kwRows.length;
    }
    if (types.has('autoTarget')) {
      STATE.autoRows = await fetchAllAutoTargets(STATE.kwCapture);
      refreshed.autoTarget = STATE.autoRows.length;
    }
    if (types.has('manualTarget')) {
      STATE.targetRows = await fetchAllTargeting(STATE.kwCapture);
      refreshed.manualTarget = STATE.targetRows.length;
    }
    if (types.has('productAd')) {
      STATE.productAdRows = await fetchAllProductAds();
      refreshed.productAd = STATE.productAdRows.length;
    }
    if (types.has('campaign')) {
      if (!STATE.autoRows.length) STATE.autoRows = await fetchAllAutoTargets(STATE.kwCapture);
      if (!STATE.targetRows.length) STATE.targetRows = await fetchAllTargeting(STATE.kwCapture);
      refreshed.campaign = (STATE.kwRows || []).length + (STATE.autoRows || []).length + (STATE.targetRows || []).length + (STATE.productAdRows || []).length;
      if (needsPlacementCapture) {
        const byCampaign = new Map();
        for (const event of events || []) {
          if (event.entityType !== 'campaign' || event.action?.actionType !== 'placement') continue;
          const campaignId = String(event.id || event.campaignId || event.action?.campaignId || '').trim();
          if (!campaignId || byCampaign.has(campaignId)) continue;
          const meta = [...(STATE.kwRows || []), ...(STATE.autoRows || []), ...(STATE.targetRows || []), ...(STATE.productAdRows || [])]
            .find(row => String(row.campaignId || row.campaign_id || '') === campaignId) || {};
          const accountId = event.accountId || event.action?.accountId || meta.accountId || '';
          const siteId = event.siteId || event.action?.siteId || meta.siteId || 4;
          byCampaign.set(campaignId, { campaignId, accountId, siteId });
        }
        const placementRows = [];
        for (const meta of byCampaign.values()) {
          placementRows.push(...await fetchCampaignPlacementRows(meta));
        }
        STATE.placementRows = placementRows;
        refreshed.placementRows = placementRows.length;
      }
    }
    if (types.has('sbCampaign')) {
      STATE.sbCampaignRows = await fetchAllSbCampaigns();
      refreshed.sbCampaign = STATE.sbCampaignRows.length;
    }
    if (types.has('sbKeyword') || types.has('sbTarget')) {
      STATE.sbRows = await fetchAllSponsoredBrands();
      refreshed.sbRows = STATE.sbRows.length;
    }
    if (types.has('sbCampaignCandidate')) {
      const pools = await fetchSevenDayUntouchedPools();
      STATE.sp7DayUntouchedRows = pools.spRows;
      STATE.sb7DayUntouchedRows = pools.sbRows;
      STATE.sevenDayUntouchedMeta = pools.meta;
      refreshed.sbCampaignCandidate = STATE.sb7DayUntouchedRows.length;
    }
  } catch (e) {
    errors.push(e.message);
  }

  if (types.has('keyword') && !STATE.kwRows.length) errors.push('keyword rows refresh returned empty');
  if (types.has('campaign') && !((STATE.kwRows || []).length || (STATE.autoRows || []).length || (STATE.targetRows || []).length || (STATE.productAdRows || []).length)) errors.push('campaign source rows refresh returned empty');
  if (needsPlacementCapture && !(STATE.placementRows || []).length) errors.push('campaign placement rows refresh returned empty');
  if (types.has('autoTarget') && !STATE.autoRows.length) errors.push('auto target rows refresh returned empty');
  if (types.has('manualTarget') && !STATE.targetRows.length) errors.push('manual target rows refresh returned empty');
  if (types.has('productAd') && !STATE.productAdRows.length) errors.push('product ad rows refresh returned empty');
  if (types.has('sbCampaign') && !STATE.sbCampaignRows.length) errors.push('SB campaign rows refresh returned empty');
  if ((types.has('sbKeyword') || types.has('sbTarget')) && !STATE.sbRows.length) errors.push('SB rows refresh returned empty');
  if (types.has('sbCampaignCandidate') && !(STATE.sb7DayUntouchedRows || []).length) errors.push('SB campaign seven day rows refresh returned empty');

  return {
    ok: errors.length === 0,
    refreshed,
    errors,
    counts: {
      kwRows: STATE.kwRows.length,
      autoRows: STATE.autoRows.length,
      targetRows: STATE.targetRows.length,
      productAdRows: STATE.productAdRows.length,
      placementRows: (STATE.placementRows || []).length,
      sbRows: STATE.sbRows.length,
      sbCampaignRows: STATE.sbCampaignRows.length,
      sp7: (STATE.sp7DayUntouchedRows || []).length,
      sb7: (STATE.sb7DayUntouchedRows || []).length,
    },
  };
}

async function execInventoryNoteUpdate(payload) {
  const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
  const result = await execInAnyFrame(tab.id, async (payload) => {
    try {
      const token =
        document.querySelector('meta[name="csrf-token"]')?.content ||
        document.querySelector('input[name="_token"]')?.value ||
        window.Laravel?.csrfToken ||
        document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
        '';
      const inventoryToken = localStorage.getItem('surfaceKey') || sessionStorage.getItem('surfaceKey') || '';
      const jwtToken = localStorage.getItem('jwt_token') || sessionStorage.getItem('jwt_token') || '';
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) body.set(key, value == null ? '' : String(value));
      if (token && !body.has('_token')) body.set('_token', decodeURIComponent(token));
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'x-csrf-token': decodeURIComponent(token),
        'x-requested-with': 'XMLHttpRequest',
      };
      if (inventoryToken) headers['inventory-token'] = inventoryToken;
      if (jwtToken) headers['jwt-token'] = jwtToken;
      const res = await fetch('/pm/formal/update', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: body.toString(),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return { httpStatus: res.status, json, text, body: body.toString(), tokenPresent: !!token };
    } catch (e) {
      return { error: e.message, stage: 'update接口失败' };
    }
  }, [payload]);
  if (!result) throw new Error('inventory update接口失败：未找到可执行的库存 iframe');
  if (result.error) throw new Error(`${result.stage || 'update接口失败'}：${result.error}`);
  return result;
}

function getInventoryRecordBySku(sku) {
  const direct = STATE.invMap?.[sku];
  if (direct) return direct;
  const upper = String(sku || '').toUpperCase();
  return Object.values(STATE.invMap || {}).find(inv => String(inv.sku || '').toUpperCase() === upper) || null;
}

function hydrateInventorySnapshot(invMap = {}) {
  const incoming = invMap && typeof invMap === 'object' ? invMap : {};
  STATE.invMap = STATE.invMap || {};
  let added = 0;
  for (const [sku, inv] of Object.entries(incoming)) {
    if (!sku || !inv) continue;
    if (!STATE.invMap[sku]) added += 1;
    STATE.invMap[sku] = inv;
  }
  return { ok: true, added, total: Object.keys(STATE.invMap || {}).length };
}

async function ensureInventoryRecordsForSkus(skus = []) {
  const requested = [...new Set((skus || []).map(sku => String(sku || '').trim()).filter(Boolean))];
  const missingBefore = requested.filter(sku => !getInventoryRecordBySku(sku));
  if (!missingBefore.length) {
    return { ok: true, requested: requested.length, fetched: 0, missingBefore: [], missingAfter: [] };
  }

  const invRows = await fetchAllInventory();
  hydrateInventorySnapshot(buildInvMap(invRows));
  const missingAfter = requested.filter(sku => !getInventoryRecordBySku(sku));
  return {
    ok: missingAfter.length === 0,
    requested: requested.length,
    fetched: invRows.length,
    missingBefore,
    missingAfter,
    reason: missingAfter.length ? `inventory records still missing: ${missingAfter.join(', ')}` : '',
  };
}

function formatLocalDateTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}


async function setInventoryNoteValue(sku, noteText) {
  const inv = getInventoryRecordBySku(sku);
  if (!inv) throw new Error(`aid / 库存记录缺失：${sku}`);
  if (!inv.aid) throw new Error(`aid 缺失：${sku}`);
  const payload = { type: 'note', aid: inv.aid, sku, value: noteText, current_value: noteText };
  const result = await execInventoryNoteUpdate(payload);
  console.log('[inventory-note:set]', { sku, aid: inv.aid, value: noteText, current_value: noteText, httpStatus: result.httpStatus, json: result.json, body: result.body });
  if (!(result.json && (result.json.code === 200 || result.json.msg === '更新成功'))) throw new Error(`update接口失败：${JSON.stringify(result.json || result.text)}`);
  inv.note = noteText;
  return result;
}

async function appendInventoryNoteValue(sku, appendText) {
  const inv = getInventoryRecordBySku(sku);
  if (!inv) throw new Error(`aid / 库存记录缺失：${sku}`);
  if (!inv.aid) throw new Error(`aid 缺失：${sku}`);
  const oldNote = String(inv.note || '');
  if (!appendText) throw new Error(`拼接 finalNote 失败：appendText 为空 ${sku}`);
  const normalizedAppend = oldNote ? `\n\n${appendText}` : appendText;
  const finalNote = oldNote + normalizedAppend;
  const payload = { type: 'note', aid: inv.aid, sku, value: normalizedAppend, current_value: finalNote };
  const result = await execInventoryNoteUpdate(payload);
  console.log('[inventory-note:append]', { sku, aid: inv.aid, oldNote, appendText: normalizedAppend, finalNote, httpStatus: result.httpStatus, json: result.json, body: result.body });
  if (!(result.json && (result.json.code === 200 || result.json.msg === '更新成功'))) throw new Error(`update接口失败：${JSON.stringify(result.json || result.text)}`);
  inv.note = finalNote;
  return result;
}

async function setInventoryNotesBatch(items) {
  const results = [];
  for (const item of items) {
    try { results.push({ sku: item.sku, ok: true, result: await setInventoryNoteValue(item.sku, item.noteText) }); }
    catch (e) { console.error('[inventory-note:set:failed]', item.sku, e); results.push({ sku: item.sku, ok: false, error: e.message }); }
  }
  return results;
}

async function appendInventoryNotesBatch(items) {
  const results = [];
  for (const item of items) {
    try { results.push({ sku: item.sku, ok: true, result: await appendInventoryNoteValue(item.sku, item.appendText) }); }
    catch (e) { console.error('[inventory-note:append:failed]', item.sku, e); results.push({ sku: item.sku, ok: false, error: e.message }); }
  }
  return results;
}

function findPlanActionContext(item, entityType) {
  const plans = STATE.plan || [];
  const plan = plans.find(p => String(p.sku || '') === String(item.sku || '')) ||
               plans.find(p => (p.actions || []).some(a => String(a.id) === String(item.id)));
  const action = (plan?.actions || []).find(a => String(a.id) === String(item.id) && normalizeActionEntityType(a.entityType) === normalizeActionEntityType(entityType)) ||
                 (plan?.actions || []).find(a => String(a.id) === String(item.id)) ||
                 {};
  return { plan: plan || { sku: item.sku }, action };
}

async function appendInventoryOperationNotes(events) {
  const validEvents = (events || []).filter(e => e && e.sku);
  if (!validEvents.length) return [];
  const bySku = new Map();
  for (const event of validEvents) {
    if (!bySku.has(event.sku)) bySku.set(event.sku, []);
    bySku.get(event.sku).push(buildInventoryOperationNote(event));
  }
  const items = [...bySku.entries()].map(([sku, notes]) => ({ sku, appendText: notes.join('\n\n') }));
  return appendInventoryNotesBatch(items);
}

function formatInventoryNoteMinute(date = new Date()) {
  return formatLocalDateTime(date).slice(0, 16);
}

function actionDirectionText(action, entry) {
  if ((action.actionType || entry.actionType) === 'create') {
    const mode = action?.createInput?.mode || action?.mode || 'unknown';
    return { direction: '建广告', actionText: `创建SP广告/${mode}` };
  }
  const fromBid = Number(action.currentBid ?? entry.currentBid);
  const toBid = Number(action.suggestedBid ?? entry.suggestedBid ?? entry.bid);
  if (Number.isFinite(fromBid) && Number.isFinite(toBid)) {
    if (toBid > fromBid) return { direction: '加投', actionText: `加投至 ${toBid.toFixed(2)}` };
    if (toBid < fromBid) return { direction: '降投', actionText: `降投至 ${toBid.toFixed(2)}` };
  }
  return { direction: '调整', actionText: '调整竞价' };
}

function normalizeNoteText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function noteEntityText(action = {}, entry = {}) {
  const entityType = normalizeActionEntityType(action.entityType || entry.entityType || '');
  const label = normalizeNoteText(action.text || action.label || action.keywordText || action.targetText || entry.text || entry.label || '');
  const campaignName = normalizeNoteText(action.campaignName || entry.campaignName || action.createInput?.campaignName || '');
  const groupName = normalizeNoteText(action.groupName || action.adGroupName || entry.groupName || entry.adGroupName || action.createInput?.groupName || '');
  const typeText = {
    keyword: 'SP关键词',
    autoTarget: 'SP自动投放',
    manualTarget: 'SP手动投放',
    productAd: 'SP商品广告',
    sbKeyword: 'SB关键词',
    sbTarget: 'SB投放',
    sbCampaign: 'SB活动',
    spCampaignBudget: 'SP活动预算',
    spCampaignPlacement: 'SP广告位',
    skuCandidate: 'SKU',
  }[entityType] || entityType || '广告对象';
  const scopeParts = [];
  if (campaignName) scopeParts.push(`活动：${campaignName}`);
  if (groupName && groupName !== campaignName) scopeParts.push(`广告组：${groupName}`);
  const scope = scopeParts.length ? `（${scopeParts.join(' / ')}）` : '';
  if (label && label !== campaignName && label !== groupName) return `${typeText}「${label}」${scope}`;
  if (campaignName || groupName) return `${typeText}${scope}`;
  return `未取到名称的${typeText}`;
}

function noteActionSentence(action = {}, entry = {}) {
  const actionType = action.actionType || entry.actionType || '';
  const entity = noteEntityText(action, entry);
  if (actionType === 'create') return `这次补的是${entity}，先把它作为小预算测试入口，不把预算一次性压上去。`;
  if (actionType === 'pause') return `这次先停掉${entity}，它当前已经不像是在帮 SKU 找有效买家。`;
  if (actionType === 'enable') return `这次重新打开${entity}，因为这个入口还有验证价值。`;
  const fromBid = Number(action.currentBid ?? entry.currentBid);
  const toBid = Number(action.suggestedBid ?? entry.suggestedBid ?? entry.bid);
  if (Number.isFinite(fromBid) && Number.isFinite(toBid)) {
    const verb = toBid > fromBid ? '往上提' : (toBid < fromBid ? '往下压' : '保持');
    return `这次只动${entity}，竞价从 ${fromBid.toFixed(2)} ${verb}到 ${toBid.toFixed(2)}。`;
  }
  const fromBudget = Number(action.currentBudget ?? entry.currentBudget);
  const toBudget = Number(action.suggestedBudget ?? entry.suggestedBudget);
  if (Number.isFinite(fromBudget) && Number.isFinite(toBudget)) {
    return `这次动的是${entity}预算，从 ${fromBudget.toFixed(2)} 调到 ${toBudget.toFixed(2)}。`;
  }
  return `这次处理的是${entity}。`;
}

function noteResultSentence(entry = {}) {
  const finalStatus = entry.finalStatus || (entry.success ? 'success' : entry.apiStatus || 'failed');
  const resultReason = normalizeNoteText(entry.errorReason || entry.resultMessage || '');
  if (finalStatus === 'success') return '接口返回成功，回查也确认已经落地。';
  if (finalStatus === 'created_pending_visibility') return '后台已经返回创建结果，但列表还需要等系统同步后再回查。';
  if (finalStatus === 'manual_review') return `这条我没有直接执行，先放人工复核；${resultReason || '原因是当前证据还不足以支持自动调整'}`;
  if (finalStatus === 'blocked_by_system_recent_adjust') return '这条被系统近期调整保护挡住了，我没有反复重试，避免和系统调价打架。';
  if (finalStatus === 'skipped_invalid_state') return `这条没有执行；${resultReason || '对象状态不适合直接动'}`;
  if (finalStatus === 'not_landed') return `接口有返回，但回查没有确认落地；${resultReason || '需要后续再看一次后台状态'}`;
  return `执行没有成功；${resultReason || '后台没有给出明确原因'}`;
}

function noteBaselineSentence(action = {}, entry = {}) {
  const baseline = action.learning?.baseline || {};
  const entity7 = baseline.entityStats7d || {};
  const entity30 = baseline.entityStats30d || {};
  const sku30 = baseline.adStats?.['30d'] || {};
  const sku7 = baseline.adStats?.['7d'] || {};
  const pieces = [];
  if (Number.isFinite(Number(baseline.sellableDays_30d ?? baseline.invDays)) || Number.isFinite(Number(baseline.unitsSold_30d))) {
    pieces.push(`SKU 3/7/30天可卖约 ${Number(baseline.sellableDays_3d || 0).toFixed(0)}/${Number(baseline.sellableDays_7d || 0).toFixed(0)}/${Number((baseline.sellableDays_30d ?? baseline.invDays) || 0).toFixed(0)} 天，近3/7/30天出了 ${Number(baseline.unitsSold_3d || 0).toFixed(0)}/${Number(baseline.unitsSold_7d || 0).toFixed(0)}/${Number(baseline.unitsSold_30d || 0).toFixed(0)} 件`);
  }
  if (Number.isFinite(Number(entity30.spend)) && (Number(entity30.spend) || Number(entity30.clicks) || Number(entity30.orders))) {
    pieces.push(`这个对象30天花费 ${Number(entity30.spend || 0).toFixed(2)}、点击 ${Number(entity30.clicks || 0).toFixed(0)}、订单 ${Number(entity30.orders || 0).toFixed(0)}`);
  } else if (Number.isFinite(Number(entity7.spend)) && (Number(entity7.spend) || Number(entity7.clicks) || Number(entity7.orders))) {
    pieces.push(`这个对象7天花费 ${Number(entity7.spend || 0).toFixed(2)}、点击 ${Number(entity7.clicks || 0).toFixed(0)}、订单 ${Number(entity7.orders || 0).toFixed(0)}`);
  }
  if (Number.isFinite(Number(sku30.spend)) && (Number(sku30.spend) || Number(sku30.orders))) {
    pieces.push(`SKU整体30天广告花费 ${Number(sku30.spend || 0).toFixed(2)}、广告订单 ${Number(sku30.orders || 0).toFixed(0)}`);
  } else if (Number.isFinite(Number(sku7.spend)) && (Number(sku7.spend) || Number(sku7.orders))) {
    pieces.push(`SKU整体7天广告花费 ${Number(sku7.spend || 0).toFixed(2)}、广告订单 ${Number(sku7.orders || 0).toFixed(0)}`);
  }
  return pieces.length ? pieces.join('；') + '。' : '';
}

function noteReasonParagraph(action = {}, entry = {}, direction = '') {
  const reason = normalizeNoteText(action.reason || entry.reason || entry.plan?.summary || '');
  const evidence = Array.isArray(action.evidence) ? action.evidence.map(normalizeNoteText).filter(Boolean).slice(0, 2) : [];
  const baseline = noteBaselineSentence(action, entry);
  const lead = direction === '加投'
    ? '我不是给整个 SKU 盲目放量，而是只把钱往已经证明能成交、但当前拿量偏少的入口挪一点。'
    : direction === '降投'
      ? '我不是否定这个 SKU，而是先把明显吃点击但不出单的入口压下来，避免它继续挤占预算。'
      : direction === '建广告'
        ? '我先补基础入口，是因为现在的问题更像广告覆盖不完整，直接等自然流量不够。'
        : '这条先按当前证据处理，重点是把判断和落地结果留清楚。';
  const details = [baseline, reason, evidence.length ? `我参考的明细是：${evidence.join('；')}。` : ''].filter(Boolean).join('');
  return `${lead}${details ? ` ${details}` : ''}`;
}

function noteObserveSentence(action = {}, entry = {}, direction = '') {
  const actionType = action.actionType || entry.actionType || '';
  if (entry.finalStatus === 'manual_review') return '后面要人工看一下这个广告形式和 SKU 的关系是否足够确定，再决定是压价、暂停，还是保留观察。';
  if (direction === '加投') return '后面重点看这个入口有没有多拿到有效曝光和点击，订单是否跟上；如果只是花费变快但订单不动，就要及时撤回来。';
  if (direction === '降投' || actionType === 'pause') return '后面重点看这块花费是否降下来，同时确认 SKU 订单没有被一起打掉；如果自然单或其他广告能承接，就说明这次收缩是对的。';
  if (direction === '建广告' || actionType === 'create') return '后面先看它能不能开始拿曝光和点击，再决定要不要扩词或提高预算。';
  return '后面继续看点击、花费和订单是否按这个判断走，不合适就回滚或换入口。';
}

function buildOperationalNoteFields(entry) {
  const plan = entry.plan || {};
  const action = entry.action || {};
  const { direction, actionText } = actionDirectionText(action, entry || {});
  const reason = String(action.reason || entry.reason || plan.summary || '').trim();
  const finalStatus = entry.finalStatus || (entry.success ? 'success' : entry.apiStatus || 'failed');
  const resultReason = entry.errorReason || entry.resultMessage || '';
  const sources = Array.isArray(action.actionSource || entry.actionSource)
    ? (action.actionSource || entry.actionSource)
    : [action.actionSource || entry.actionSource || action.source || entry.source || 'codex'];
  const sourceText = [...new Set(sources.filter(Boolean))].join('+');
  const isSevenDay = sourceText.includes('7day');
  const isConflict = finalStatus === 'conflict' || /系统已自动调整|禁止手动调整/.test(resultReason);

  let stage = plan.stage || plan.health || '平时期';
  if (!stage || stage === 'unknown') stage = '平时期';

  let currentProblem = '需要按当前广告表现调整';
  if (/无转化|0转化|no conversion/i.test(reason)) currentProblem = '无转化';
  else if (/ACOS|acos|TACOS|tacos|花费|亏损/.test(reason)) currentProblem = 'ACOS偏高';
  else if (direction === '加投') currentProblem = '流量不足';
  else if (direction === '降投') currentProblem = '低效消耗';
  else if (direction === '建广告') currentProblem = '当前广告覆盖不足';

  const coreJudgement = direction === '加投'
    ? '当前仍有测试或放量价值，需要加投验证是否能放大有效点击和订单'
    : direction === '降投'
      ? '当前继续消耗的效率偏弱，需要先收缩低效流量并观察承接情况'
      : direction === '建广告'
        ? '当前需要补齐SP广告结构，先把基础投放盘建起来再观察数据反馈'
        : '当前动作以验证广告状态为主，避免脱离真实落地结果记录';

  const purpose = direction === '加投' ? '测试放量' : direction === '降投' ? '控制低效消耗' : direction === '建广告' ? '补齐基础广告覆盖' : '确认执行结果';
  const observe = direction === '加投'
    ? '看3天内点击是否放大、7天订单是否同步增加'
    : direction === '建广告'
      ? '看新广告是否开始拿到曝光、点击和首批转化'
      : '看后续花费是否下降、ACOS是否回落、是否仍有自然单承接';

  let remark = '执行结果：成功，已回查确认竞价落地';
  if (finalStatus !== 'success') {
    if (finalStatus === 'blocked_by_system_recent_adjust') {
      return { stage, currentProblem, coreJudgement, actionText, purpose, observe, remark: '执行结果：系统近期已自动调整，本轮标记阻塞并移出待执行池，未反复重试', sourceText };
    }
    if (finalStatus === 'manual_review') {
      return { stage, currentProblem: '7天未调整对象需要人工复核', coreJudgement: reason || coreJudgement, actionText: '人工复核', purpose: '避免高风险自动大调', observe, remark: `执行结果：进入人工复核；${reason || resultReason || '7天未调整但风险较高'}`, sourceText };
    }
    if (finalStatus === 'skipped_invalid_state') {
      return { stage, currentProblem: '对象状态不可执行', coreJudgement: reason || coreJudgement, actionText: '跳过', purpose: '避免误执行暂停或无效对象', observe, remark: `执行结果：跳过；${reason || resultReason || '对象状态不可执行'}`, sourceText };
    }
    if (finalStatus === 'created_pending_visibility') {
      return { stage, currentProblem, coreJudgement, actionText, purpose, observe, remark: `执行结果：后台已返回新建广告ID，当前列表快照暂未回显；${resultReason || '等待广告系统同步后继续回查'}`, sourceText };
    }
    if (isConflict) remark = '执行结果：冲突/被系统拦截，后台提示近期系统已自动调整该广告，禁止手动调整';
    else if (finalStatus === 'not_landed') remark = `执行结果：接口成功但回查未生效；${resultReason || '未确认真实落地'}`;
    else remark = `执行结果：失败；${resultReason || '未返回明确原因'}`;
  }

  if (isSevenDay) {
    currentProblem = currentProblem || '7天未调整对象需要触达清理';
    coreJudgement = `7天未调整命中，${reason || coreJudgement}`;
  }
  return { stage, currentProblem, coreJudgement, actionText, purpose, observe, remark, sourceText };
}

function buildInventoryOperationNote(entry) {
  const action = entry?.action || {};
  const { direction } = actionDirectionText(action, entry || {});
  const result = noteResultSentence(entry || {});
  const actionText = noteActionSentence(action, entry || {});
  const reason = noteReasonParagraph(action, entry || {}, direction);
  const observe = noteObserveSentence(action, entry || {}, direction);
  if (entry?.finalStatus === 'manual_review') {
    return [
      `【${formatInventoryNoteMinute()}】`,
      `${actionText}`,
      `${reason}`,
      `${result}`,
      `${observe}`,
    ].filter(Boolean).join('\n');
  }
  return [
    `【${formatInventoryNoteMinute()}】`,
    `${actionText}${result ? ` ${result}` : ''}`,
    reason,
    observe,
  ].filter(Boolean).join('\n');
}

// 广告系统通用拦截器注入（捕获指定路径的第一个请求）
async function injectAdInterceptor(tabId, pathFragment, varName) {
  await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, world: 'MAIN', func: (frag, vname) => {
        if (window[vname + '_patched']) {
          window[vname] = [];
          return;
        }
        window[vname + '_patched'] = true;
        window[vname] = [];

        const origOpen   = XMLHttpRequest.prototype.open;
        const origSend   = XMLHttpRequest.prototype.send;
        const origSetHdr = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function(m, url, ...r) {
          this.__url = String(url || ''); this.__hdrs = {};
          return origOpen.call(this, m, url, ...r);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
          if (this.__url.includes(frag)) this.__hdrs[k] = v;
          return origSetHdr.call(this, k, v);
        };
        XMLHttpRequest.prototype.send = function(body) {
          if (this.__url.includes(frag)) {
            const h = Object.assign({}, this.__hdrs), u = this.__url;
            this.addEventListener('load', () => {
              try {
                const d = JSON.parse(this.responseText);
                window[vname].push({ json: d, body, headers: h, url: u });
              } catch(e) {}
            }, { once: true });
          }
          return origSend.call(this, body);
        };

        const origFetch = window.fetch;
        window.fetch = async function(input, init) {
          const url = typeof input === 'string' ? input : (input?.url || '');
          if (url.includes(frag)) {
            const resp = await origFetch.call(this, input, init);
            resp.clone().json().then(d => {
              window[vname].push({ json: d, body: init?.body, headers: init?.headers || {}, url });
            }).catch(() => {});
            return resp;
          }
          return origFetch.call(this, input, init);
        };
      }, args: [pathFragment, varName] },
      results => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      }
    );
  });
}

// 等待捕获（轮询所有 frame，最多 waitSec 秒）
async function waitCapture(tabId, varName, waitSec = 30) {
  for (let i = 0; i < waitSec * 2; i++) {
    await sleep(500);
    const found = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId, allFrames: true }, world: 'MAIN',
          func: (vname) => window[vname]?.length ? window[vname][0] : null,
          args: [varName] },
        results => resolve((results || []).find(r => r?.result)?.result || null)
      );
    });
    if (found) return found;
  }
  return null;
}

async function injectAdMultiInterceptor(tabId, fragments, varName) {
  await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, world: 'MAIN', func: (frags, vname) => {
        if (window[vname + '_patched']) return;
        window[vname + '_patched'] = true;
        window[vname] = [];

        const shouldCapture = url => {
          const u = String(url || '');
          return frags.some(f => u.includes(f));
        };
        const normalizeHeaders = headers => {
          try {
            if (!headers) return {};
            if (headers instanceof Headers) return Object.fromEntries(headers.entries());
            if (Array.isArray(headers)) return Object.fromEntries(headers);
            return { ...headers };
          } catch (_) { return {}; }
        };

        const origOpen   = XMLHttpRequest.prototype.open;
        const origSend   = XMLHttpRequest.prototype.send;
        const origSetHdr = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function(m, url, ...r) {
          this.__url = String(url || '');
          this.__method = String(m || 'GET').toUpperCase();
          this.__hdrs = {};
          return origOpen.call(this, m, url, ...r);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
          if (shouldCapture(this.__url)) this.__hdrs[k] = v;
          return origSetHdr.call(this, k, v);
        };
        XMLHttpRequest.prototype.send = function(body) {
          if (shouldCapture(this.__url)) {
            const h = Object.assign({}, this.__hdrs), u = this.__url, m = this.__method;
            this.addEventListener('load', () => {
              try {
                const d = JSON.parse(this.responseText);
                window[vname].push({ json: d, body, headers: h, url: u, method: m });
              } catch(e) {}
            }, { once: true });
          }
          return origSend.call(this, body);
        };

        const origFetch = window.fetch;
        window.fetch = async function(input, init = {}) {
          const url = typeof input === 'string' ? input : (input?.url || '');
          if (shouldCapture(url)) {
            const resp = await origFetch.call(this, input, init);
            resp.clone().json().then(d => {
              window[vname].push({
                json: d,
                body: init?.body,
                headers: normalizeHeaders(init?.headers),
                url,
                method: String(init?.method || 'GET').toUpperCase(),
              });
            }).catch(() => {});
            return resp;
          }
          return origFetch.call(this, input, init);
        };
      }, args: [fragments, varName] },
      results => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(results);
      }
    );
  });
}

async function readCaptures(tabId, varName) {
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, world: 'MAIN',
        func: (vname) => window[vname] || [],
        args: [varName] },
      results => resolve((results || []).flatMap(r => r?.result || []))
    );
  });
}

async function waitCaptureWhere(tabId, varName, waitSec, predicate) {
  for (let i = 0; i < waitSec * 2; i++) {
    await sleep(500);
    const captures = await readCaptures(tabId, varName);
    const found = captures.find(predicate);
    if (found) return found;
  }
  return null;
}

// 注入拦截器后，尝试点击页面查询按钮触发请求
async function triggerPageQuery(tabId) {
  await new Promise(resolve => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, world: 'MAIN', func: () => {
        const all = [...document.querySelectorAll('button, .el-button, [class*="btn"]')];
        const btn = all.find(b => /查询|搜索|Search/.test((b.textContent || '').trim()));
        if (btn) { btn.click(); return true; }
        return false;
      }},
      results => resolve(results)
    );
  });
}

// 关键词全量拉取（拦截页面请求，捕获销售编号等参数）
async function fetchAllKeywords() {
  const tab = await findTab('*://adv.yswg.com.cn/*');
  await ensureAdKeywordPage(tab.id);
  log('注入关键词拦截器，等待页面请求…');

  await injectAdInterceptor(tab.id, '/keyword/findAllNew', '__kwCaptures');
  await triggerPageQuery(tab.id);

  const capture = await waitCapture(tab.id, '__kwCaptures', 30);
  if (!capture) throw new Error('未捕获到关键词请求，请确认广告系统已打开并有关键词数据');

  STATE.kwCapture = capture;
  log(`已捕获关键词请求，URL：${capture.url}`);

  const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                       d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);

  const rows = [...getList(capture.json)];
  const total = capture.json?.count || capture.json?.data?.total || rows.length;
  log(`关键词首页 ${rows.length} 条，total=${total}`);

  const seen = new Set(rows.map(r => String(r.id || r.keywordId || '')).filter(Boolean));

  if (!capture.body) return rows;
  let bodyObj;
  try { bodyObj = JSON.parse(capture.body); } catch(e) { return rows; }
  rows.length = 0;
  seen.clear();
  bodyObj = { ...bodyObj, limit: 500 };
  let firstPage = 1;
  if (String(bodyObj.property || '1') !== '1') {
    bodyObj = { ...bodyObj, property: '1' };
    delete bodyObj.tableName;
    log('当前广告页不在 SP关键词 tab，已强制切回 property=1 拉取 SP 关键词', 'warn');
  }

  const pageField = 'page' in bodyObj ? 'page' : 'pageNum' in bodyObj ? 'pageNum' :
                    'pageNo' in bodyObj ? 'pageNo' : 'current' in bodyObj ? 'current' : 'page';

  // 一次 executeScript 拉完整个切片，结果存到 window[key] 再分批读回
  async function fetchSliceInPage(sliceBodyObj, sliceKey, startPage = 2) {
    const rawCount = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, world: 'MAIN',
           func: async (url, baseBody, hdrs, pageField, key, startPage) => {
            const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                                 d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const all = [];
            const limit = Number(baseBody.limit || 500);
            const makeHeaders = () => {
              const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
              const headers = { 'Content-Type': 'application/json', ...hdrs };
              if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
              return headers;
            };
            const fetchPage = async p => {
              try {
                const body = JSON.stringify({ ...baseBody, [pageField]: p, limit });
                const res = await fetch(url, { method: 'POST', credentials: 'include',
                  headers: makeHeaders(), body });
                const d = await res.json();
                return { page: p, list: getList(d), total: d?.count || d?.data?.total || 0 };
              } catch(e) { return { page: p, list: [], total: 0, error: e.message }; }
            };
            const first = await fetchPage(startPage);
            all.push(...first.list);
            const maxPage = first.total ? Math.ceil(first.total / limit) : 500;
            const CONCURRENCY = 6;
            for (let p = startPage + 1; p <= maxPage; p += CONCURRENCY) {
              const batchPages = Array.from({ length: Math.min(CONCURRENCY, maxPage - p + 1) }, (_, i) => p + i);
              const batch = await Promise.all(batchPages.map(fetchPage));
              batch.sort((a, b) => a.page - b.page);
              for (const item of batch) all.push(...item.list);
              if (!first.total && batch.some(item => item.list.length < limit)) break;
              await sleep(80);
            }
            window[key] = all;
            return all.length;
          }, args: [capture.url, sliceBodyObj, capture.headers || {}, pageField, sliceKey, startPage] },
        results => resolve(results?.[0]?.result || 0)
      );
    });
    // 分批读回（每批 200 条）
    let offset = 0;
    while (true) {
      const batch = await new Promise(resolve => {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, world: 'MAIN',
            func: (key, offset, size) => (window[key] || []).slice(offset, offset + size),
            args: [sliceKey, offset, 200] },
          results => resolve(results?.[0]?.result || [])
        );
      });
      if (!batch.length) break;
      for (const row of batch) {
        const id = String(row.id || row.keywordId || '');
        if (id && !seen.has(id)) { seen.add(id); rows.push(row); }
      }
      offset += batch.length;
      if (batch.length < 200) break;
    }
    return rawCount;
  }

  log(`关键词分页拉取：pageSize=${bodyObj.limit || 500}，startPage=${firstPage}，并发=6`);
  const kwRawCount = await fetchSliceInPage(bodyObj, '__kwSlice0', firstPage);
  log(`关键词分页完成：raw=${kwRawCount} 条，去重后=${rows.length} 条`);

  return rows;
}

// 自动投放全量拉取（同 /keyword/findAllNew，property=2 + tableName=product_target）
async function fetchAllAutoTargets(kwCapture) {
  if (!kwCapture?.body) { log('无关键词捕获，跳过自动投放', 'warn'); return []; }

  const tab = await findTab('*://adv.yswg.com.cn/*');
  let kwBody;
  try { kwBody = JSON.parse(kwCapture.body); } catch(e) { return []; }

  const baseBody = { ...kwBody, property: '2', tableName: 'product_target', page: 1, limit: 500,
                     filterArray: { campaignState: kwBody.filterArray?.campaignState || '4' } };
  const pageField = 'page' in kwBody ? 'page' : 'pageNum' in kwBody ? 'pageNum' : 'page';

  const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                       d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);

  async function fetchSliceInPage(sliceBodyObj, sliceKey) {
    // 把结果存到 window 变量，避免 executeScript 序列化大数组时截断
    await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, world: 'MAIN',
          func: async (url, baseBody, hdrs, pageField, key) => {
            const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                                 d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const all = [];
            const limit = Number(baseBody.limit || 50);
            for (let p = 1; p <= 500; p++) {
              try {
                const body = JSON.stringify({ ...baseBody, [pageField]: p, limit });
                const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
                const headers = { 'Content-Type': 'application/json', ...hdrs };
                if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
                const res = await fetch(url, { method: 'POST', credentials: 'include',
                  headers, body });
                const d = await res.json();
                const list = getList(d);
                if (!list.length) break;
                all.push(...list);
                if (list.length < limit) break;
                await sleep(80);
              } catch(e) { break; }
            }
            window[key] = all;
            return all.length;
          }, args: [kwCapture.url, sliceBodyObj, kwCapture.headers || {}, pageField, sliceKey] },
        results => resolve(results?.[0]?.result || 0)
      );
    });

    // 分批读取（每批 200 条，避免单次传输过大）
    const all = [];
    let offset = 0;
    while (true) {
      const batch = await new Promise(resolve => {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, world: 'MAIN',
            func: (key, offset, size) => (window[key] || []).slice(offset, offset + size),
            args: [sliceKey, offset, 200] },
          results => resolve(results?.[0]?.result || [])
        );
      });
      if (!batch.length) break;
      all.push(...batch);
      offset += batch.length;
      if (batch.length < 200) break;
    }
    return { rows: all, rowCount: all.length, debug: `fetched ${all.length}`, err: null };
  }

  const rows = [];
  const seen = new Set();

  const res = await fetchSliceInPage(baseBody, '__atSlice0');
  if (res.debug) log(`自动投放诊断：${res.debug}`, 'warn');
  if (res.err) log(`自动投放错误：${res.err}`, 'error');
  for (const row of res.rows) { const id = String(row.targetId || row.id || row.keywordId || ''); if (id && !seen.has(id)) { seen.add(id); rows.push(row); } }

  if (rows[0]) log(`自动投放字段：${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  else log('自动投放：无数据返回', 'warn');
  return rows;
}

// 定位组全量拉取（property=3, tableName=product_manual_target）
async function fetchAllTargeting(kwCapture) {
  if (!kwCapture?.body) { log('无关键词捕获，跳过定位组', 'warn'); return []; }
  const tab = await findTab('*://adv.yswg.com.cn/*');
  let kwBody;
  try { kwBody = JSON.parse(kwCapture.body); } catch(e) { return []; }

  const baseBody = { ...kwBody, property: '3', tableName: 'product_manual_target', page: 1, limit: 500,
                     filterArray: { campaignState: kwBody.filterArray?.campaignState || '4' } };
  const pageField = 'page' in kwBody ? 'page' : 'pageNum' in kwBody ? 'pageNum' : 'page';

  const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                       d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);

  async function fetchSliceInPage(sliceBodyObj, sliceKey) {
    await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, world: 'MAIN',
          func: async (url, baseBody, hdrs, pageField, key) => {
            const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                                 d?.records || d?.list || (Array.isArray(d?.data) ? d.data : []);
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const all = [];
            const limit = Number(baseBody.limit || 50);
            for (let p = 1; p <= 500; p++) {
              try {
                const body = JSON.stringify({ ...baseBody, [pageField]: p, limit });
                const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
                const headers = { 'Content-Type': 'application/json', ...hdrs };
                if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
                const res = await fetch(url, { method: 'POST', credentials: 'include',
                  headers, body });
                const d = await res.json();
                const list = getList(d);
                if (!list.length) break;
                all.push(...list);
                if (list.length < limit) break;
                await sleep(80);
              } catch(e) { break; }
            }
            window[key] = all;
            return all.length;
          }, args: [kwCapture.url, sliceBodyObj, kwCapture.headers || {}, pageField, sliceKey] },
        results => resolve(results?.[0]?.result || 0)
      );
    });
    const all = [];
    let offset = 0;
    while (true) {
      const batch = await new Promise(resolve => {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, world: 'MAIN',
            func: (key, offset, size) => (window[key] || []).slice(offset, offset + size),
            args: [sliceKey, offset, 200] },
          results => resolve(results?.[0]?.result || [])
        );
      });
      if (!batch.length) break;
      all.push(...batch);
      offset += batch.length;
      if (batch.length < 200) break;
    }
    return { rows: all, rowCount: all.length };
  }

  const rows = [];
  const seen = new Set();

  const res = await fetchSliceInPage(baseBody, '__tgSlice0');
  for (const row of res.rows) { const id = String(row.targetId || row.id || ''); if (id && !seen.has(id)) { seen.add(id); rows.push(row); } }
  return rows;
}

async function fetchAllSponsoredBrands() {
  if (STATE.kwCapture?.body) return fetchSponsoredBrandsFromKeywordCapture(STATE.kwCapture);

  const tab = await findTab('*://adv.yswg.com.cn/*');
  const captureKey = '__sbCaptures';
  const fragments = [
    '/keyword/findAllNew',
    '/sponsored',
    '/Sponsored',
    '/brand',
    '/Brand',
    '/video',
    '/Video',
    '/sb/',
    '/sb?',
    '/sb-',
    '/sb_',
  ];

  const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                       d?.records || d?.list || d?.rows || (Array.isArray(d?.data) ? d.data : []);
  const looksLikeSbAdRows = capture => {
    const list = getList(capture?.json);
    if (!list.length) return false;
    const sample = list[0] || {};
    const keys = Object.keys(sample).join('|');
    return /campaign|adGroup|keyword|target|bid|acos|spend|impression|click|order/i.test(keys);
  };

  await injectAdMultiInterceptor(tab.id, fragments, captureKey);
  await triggerPageQuery(tab.id);

  const capture = await waitCaptureWhere(tab.id, captureKey, 12, looksLikeSbAdRows);
  if (!capture) {
    log('SB capture not found. Open the SB list page in adv.yswg.com.cn and click query, then fetch again.', 'warn');
    return [];
  }

  log(`SB capture URL: ${capture.url}`, 'warn');

  const rows = [...getList(capture.json)];
  const seen = new Set(rows.map(r => String(r.id || r.keywordId || r.targetId || r.campaignId || '')).filter(Boolean));
  if (!capture.body) return rows;

  let bodyKind = 'json';
  let bodyObj;
  try {
    bodyObj = JSON.parse(capture.body);
  } catch (_) {
    bodyKind = 'form';
    bodyObj = Object.fromEntries(new URLSearchParams(String(capture.body || '')).entries());
  }

  const pageField = 'page' in bodyObj ? 'page' : 'pageNum' in bodyObj ? 'pageNum' :
                    'pageNo' in bodyObj ? 'pageNo' : 'current' in bodyObj ? 'current' : 'page';

  await new Promise(resolve => {
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, world: 'MAIN',
        func: async (url, baseBody, bodyKind, hdrs, pageField, method) => {
          const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                               d?.records || d?.list || d?.rows || (Array.isArray(d?.data) ? d.data : []);
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          const all = [];
          const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
          const headers = { ...hdrs };
          if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
          for (let p = 2; p <= 500; p++) {
            try {
              let body = null;
              if (String(method || 'POST').toUpperCase() !== 'GET') {
                if (bodyKind === 'json') {
                  body = JSON.stringify({ ...baseBody, [pageField]: p, limit: 100, pageSize: 100 });
                  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
                } else {
                  const params = new URLSearchParams(baseBody);
                  params.set(pageField, p);
                  params.set('limit', 100);
                  params.set('pageSize', 100);
                  body = params.toString();
                  headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
                }
              }
              const res = await fetch(url, {
                method: String(method || 'POST').toUpperCase(),
                credentials: 'include',
                headers,
                body,
              });
              const d = await res.json();
              const list = getList(d);
              if (!list.length) break;
              all.push(...list);
              if (list.length < 100) break;
              await sleep(80);
            } catch(e) { break; }
          }
          window.__sbPageRows = all;
          return all.length;
        },
        args: [capture.url, bodyObj, bodyKind, capture.headers || {}, pageField, capture.method || 'POST'] },
      results => resolve(results?.[0]?.result || 0)
    );
  });

  let offset = 0;
  while (true) {
    const batch = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, world: 'MAIN',
          func: (offset, size) => (window.__sbPageRows || []).slice(offset, offset + size),
          args: [offset, 200] },
        results => resolve(results?.[0]?.result || [])
      );
    });
    if (!batch.length) break;
    for (const row of batch) {
      const id = String(row.id || row.keywordId || row.targetId || row.campaignId || JSON.stringify(row).slice(0, 80));
      if (id && !seen.has(id)) { seen.add(id); rows.push(row); }
    }
    offset += batch.length;
    if (batch.length < 200) break;
  }

  if (rows[0]) log(`SB fields: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

async function fetchSponsoredBrandsFromKeywordCapture(kwCapture) {
  const tab = await findTab('*://adv.yswg.com.cn/*');
  let kwBody;
  try { kwBody = JSON.parse(kwCapture.body); } catch(e) { return []; }

  const pageField = 'page' in kwBody ? 'page' : 'pageNum' in kwBody ? 'pageNum' :
                    'pageNo' in kwBody ? 'pageNo' : 'current' in kwBody ? 'current' : 'page';
  const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                       d?.records || d?.list || d?.rows || (Array.isArray(d?.data) ? d.data : []);

  async function fetchProperty(property, slicePrefix) {
    const baseBody = { ...kwBody, property: String(property), page: 1, limit: 500, filterArray: { campaignState: kwBody.filterArray?.campaignState || '1' } };
    delete baseBody.tableName;

    async function fetchSliceInPage(sliceBodyObj, sliceKey) {
      await new Promise(resolve => {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, world: 'MAIN',
            func: async (url, baseBody, hdrs, pageField, key) => {
              const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                                   d?.records || d?.list || d?.rows || (Array.isArray(d?.data) ? d.data : []);
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const all = [];
              for (let p = 1; p <= 500; p++) {
                try {
                  const limit = Number(baseBody.limit || 500);
                  const body = JSON.stringify({ ...baseBody, [pageField]: p, limit });
                  const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
                  const headers = { 'Content-Type': 'application/json', ...hdrs };
                  if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
                  const res = await fetch(url, { method: 'POST', credentials: 'include',
                    headers, body });
                  const d = await res.json();
                  const list = getList(d);
                  if (!list.length) break;
                  all.push(...list);
                  if (list.length < limit) break;
                  await sleep(80);
                } catch(e) { break; }
              }
              window[key] = all;
              return all.length;
            }, args: [kwCapture.url, sliceBodyObj, kwCapture.headers || {}, pageField, sliceKey] },
          results => resolve(results?.[0]?.result || 0)
        );
      });

      const all = [];
      let offset = 0;
      while (true) {
        const batch = await new Promise(resolve => {
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, world: 'MAIN',
              func: (key, offset, size) => (window[key] || []).slice(offset, offset + size),
              args: [sliceKey, offset, 200] },
            results => resolve(results?.[0]?.result || [])
          );
        });
        if (!batch.length) break;
        all.push(...batch);
        offset += batch.length;
        if (batch.length < 200) break;
      }
      return all;
    }

    // SB property=4/6 returns a complete paginated table for the selected filters.
    // Time slicing duplicates the same SB rows, so keep SB to one paginated pass.
    const rows = await fetchSliceInPage(baseBody, `${slicePrefix}0`);
    rows.forEach(row => { row.__adProperty = String(property); });
    return rows;
  }

  const keywordRows = await fetchProperty(4, '__sbKwSlice');
  const targetRows = await fetchProperty(6, '__sbTgSlice');
  const rows = [...keywordRows, ...targetRows];
  log(`SB关键词 ${keywordRows.length} 条，SB定位 ${targetRows.length} 条`, rows.length ? 'ok' : 'warn');
  if (rows[0]) log(`SB fields: ${JSON.stringify(Object.keys(rows[0]))}`, 'warn');
  return rows;
}

function getAdMetricId(row) {
  return String(row?.keywordId || row?.targetId || row?.id || '').trim();
}

function mergeAdMetricWindow(baseRows, windowRows, days) {
  const byId = new Map();
  for (const row of windowRows || []) {
    const id = getAdMetricId(row);
    if (id) byId.set(id, row);
  }

  let matched = 0;
  for (const row of baseRows || []) {
    const hit = byId.get(getAdMetricId(row));
    if (!hit) continue;
    matched++;
    row[`spend${days}`] = hit.Spend ?? hit.spend ?? hit.cost ?? 0;
    row[`orders${days}`] = hit.Orders ?? hit.orders ?? hit.order ?? 0;
    row[`acos${days}`] = hit.ACOS ?? hit.acos ?? hit.Acos ?? 0;
    row[`clicks${days}`] = hit.Clicks ?? hit.clicks ?? hit.click ?? 0;
    row[`impressions${days}`] = hit.Impressions ?? hit.impressions ?? hit.impression ?? 0;
    row[`sales${days}`] = hit.Sales ?? hit.sales ?? 0;
  }
  return matched;
}

async function enrichAdMetricWindows(kwCapture) {
  if (!kwCapture?.body) {
    log('无关键词捕获，跳过 3/7 天广告指标补齐', 'warn');
    return;
  }

  const configs = [
    { label: 'SP关键词', rows: STATE.kwRows, property: '1' },
    { label: 'SP自动投放', rows: STATE.autoRows, property: '2', tableName: 'product_target' },
    { label: 'SP定位组', rows: STATE.targetRows, property: '3', tableName: 'product_manual_target' },
    { label: 'SB关键词', rows: STATE.sbRows.filter(r => String(r.__adProperty || '4') === '4'), property: '4' },
    { label: 'SB定位', rows: STATE.sbRows.filter(r => String(r.__adProperty || '') === '6'), property: '6' },
  ].filter(cfg => cfg.rows.length > 0);

  const tasks = [];
  for (const cfg of configs) {
    for (const days of [7, 3]) {
      tasks.push({ cfg, days });
    }
  }
  const concurrency = Number(localStorage.getItem('AD_OPS_METRIC_WINDOW_CONCURRENCY') || 2);
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(async ({ cfg, days }) => {
      const windowRows = await fetchAdMetricWindow(kwCapture, cfg, days);
      const matched = mergeAdMetricWindow(cfg.rows, windowRows, days);
      log(`${cfg.label} ${days}天指标：返回 ${windowRows.length} 条，匹配 ${matched} 条`, matched ? 'ok' : 'warn');
    }));
  }
}

async function fetchAdMetricWindow(kwCapture, cfg, days) {
  const tab = await findTab('*://adv.yswg.com.cn/*');
  let kwBody;
  try { kwBody = JSON.parse(kwCapture.body); } catch(e) { return []; }

  const pageField = 'page' in kwBody ? 'page' : 'pageNum' in kwBody ? 'pageNum' :
                    'pageNo' in kwBody ? 'pageNo' : 'current' in kwBody ? 'current' : 'page';
  const baseBody = {
    ...kwBody,
    property: String(cfg.property),
    page: 1,
    limit: 500,
    timeRange: makeAdTimeRange(days),
    filterArray: { campaignState: kwBody.filterArray?.campaignState || (String(cfg.property).startsWith('4') || String(cfg.property) === '6' ? '1' : '4') },
  };
  if (cfg.tableName) baseBody.tableName = cfg.tableName;
  else delete baseBody.tableName;

  const sliceKey = `__metricWindow_${cfg.property}_${days}_${Date.now()}`;
  await new Promise(resolve => {
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, world: 'MAIN',
        func: async (url, baseBody, hdrs, pageField, key) => {
          const getList = d => d?.data?.records || d?.data?.list || d?.data?.rows ||
                               d?.records || d?.list || d?.rows || (Array.isArray(d?.data) ? d.data : []);
          const all = [];
          const limit = Number(baseBody.limit || 500);
          const makeHeaders = () => {
            const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
            const headers = { 'Content-Type': 'application/json', ...hdrs };
            if (xsrf && !Object.keys(headers).some(k => k.toLowerCase() === 'x-xsrf-token')) headers['x-xsrf-token'] = decodeURIComponent(xsrf);
            return headers;
          };
          const fetchPage = async p => {
            try {
              const body = JSON.stringify({ ...baseBody, [pageField]: p, limit });
              const res = await fetch(url, { method: 'POST', credentials: 'include', headers: makeHeaders(), body });
              const d = await res.json();
              return { page: p, list: getList(d), total: d?.count || d?.data?.total || 0 };
            } catch(e) {
              return { page: p, list: [], total: 0, error: e.message };
            }
          };

          const first = await fetchPage(1);
          all.push(...first.list);
          const maxPage = first.total ? Math.ceil(first.total / limit) : 500;
          const CONCURRENCY = 6;
          for (let p = 2; p <= maxPage; p += CONCURRENCY) {
            const pages = Array.from({ length: Math.min(CONCURRENCY, maxPage - p + 1) }, (_, i) => p + i);
            const batch = await Promise.all(pages.map(fetchPage));
            batch.sort((a, b) => a.page - b.page);
            for (const item of batch) all.push(...item.list);
            if (!first.total && batch.some(item => item.list.length < limit)) break;
          }
          window[key] = all;
          return all.length;
        },
        args: [kwCapture.url, baseBody, kwCapture.headers || {}, pageField, sliceKey] },
      results => resolve(results?.[0]?.result || 0)
    );
  });

  const all = [];
  let offset = 0;
  while (true) {
    const batch = await new Promise(resolve => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, world: 'MAIN',
          func: (key, offset, size) => (window[key] || []).slice(offset, offset + size),
          args: [sliceKey, offset, 200] },
        results => resolve(results?.[0]?.result || [])
      );
    });
    if (!batch.length) break;
    all.push(...batch);
    offset += batch.length;
    if (batch.length < 200) break;
  }
  return all;
}

function makeAdTimeRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  return [startMs, endMs];
}

// ---- Listing 并发抓取（panel 页面直接 fetch 公开页面 + DOMParser）----
async function fetchListingsConcurrent(listingInputs, onProgress, options = {}) {
  let done = 0;
  const CONCURRENCY = Number(options.listingConcurrency || localStorage.getItem('AD_OPS_LISTING_FETCH_CONCURRENCY') || localStorage.getItem('AD_OPS_LISTING_CONCURRENCY') || 5);
  const DELAY_MS = Number(localStorage.getItem('AD_OPS_LISTING_BATCH_DELAY_MS') || 450);
  const PER_ASIN_TIMEOUT_MS = Number(options.listingTimeoutMs || localStorage.getItem('AD_OPS_LISTING_FETCH_TIMEOUT_MS') || localStorage.getItem('AD_OPS_LISTING_PER_ASIN_TIMEOUT_MS') || 10000);
  const RETRY = Number(options.listingRetry || localStorage.getItem('AD_OPS_LISTING_FETCH_RETRY') || 1);
  const STAGE_TIMEOUT_MS = Number(options.listingStageTimeoutMs || localStorage.getItem('AD_OPS_LISTING_FETCH_STAGE_TIMEOUT_MS') || 120000);
  const TTL_MS = Number(options.listingCacheTtlMs || 7 * 24 * 60 * 60 * 1000);
  const deadline = Date.now() + STAGE_TIMEOUT_MS;
  const cache = getListingCacheStore();
  const tasks = (listingInputs || []).map(item => {
    if (typeof item === 'string') {
      const asin = String(item || '').trim().toUpperCase();
      return { asin, domain: 'amazon.com', key: listingMapKey('amazon.com', asin) };
    }
    const asin = String(item?.asin || '').trim().toUpperCase();
    const domain = item?.domain || 'amazon.com';
    return { asin, domain, key: item?.key || listingMapKey(domain, asin) };
  }).filter(item => item.asin && item.domain === 'amazon.com');
  STATE.listingFetchMeta = {
    ...(STATE.listingFetchMeta || {}),
    attempted: tasks.length,
    success: 0,
    failed: 0,
    skipped: 0,
    samples: [],
    concurrency: CONCURRENCY,
    batchDelayMs: DELAY_MS,
    perAsinTimeoutMs: PER_ASIN_TIMEOUT_MS,
    stageTimeoutMs: STAGE_TIMEOUT_MS,
    retry: 0,
    cacheHit: 0,
    cacheMiss: 0,
    cacheExpired: 0,
    fetched: 0,
  };

  function pushListingSample(sample) {
    if (!sample) return;
    if (!Array.isArray(STATE.listingFetchMeta.samples)) STATE.listingFetchMeta.samples = [];
    if (STATE.listingFetchMeta.samples.length < 20) STATE.listingFetchMeta.samples.push(sample);
  }

  function readCache(task) {
    const entry = cache.entries?.[task.key];
    if (!entry) {
      STATE.listingFetchMeta.cacheMiss += 1;
      return null;
    }
    const fetchedAt = new Date(entry.fetchedAt || 0).getTime();
    if (!fetchedAt || (Date.now() - fetchedAt) > TTL_MS) {
      STATE.listingFetchMeta.cacheExpired += 1;
      return null;
    }
    STATE.listingFetchMeta.cacheHit += 1;
    return entry.payload || null;
  }

  function writeCache(task, payload) {
    cache.entries[task.key] = {
      asin: task.asin,
      site: task.domain,
      salesChannel: task.domain === 'amazon.co.uk' ? 'Amazon.co.uk' : 'Amazon.com',
      fetchedAt: nowIso(),
      source: 'panel_listing_fetch',
      ttlMs: TTL_MS,
      payload,
    };
  }

  async function fetchOne(task, worker) {
    const asin = task.asin;
    await sleep(Math.random() * 250);
    const cached = readCache(task);
    if (cached) {
      STATE.listingMap[task.key] = { ...cached, listingDomain: task.domain };
      if (task.domain === 'amazon.com') STATE.listingMap[asin] = { ...cached, listingDomain: task.domain };
      STATE.listingFetchMeta.success += 1;
      done++;
      onProgress(done);
      return;
    }
    let attemptsLeft = RETRY + 1;
    try {
      while (attemptsLeft > 0) {
        attemptsLeft -= 1;
        const listingFlow = async () => {
          const finalUrl = await navigateAmazonListingTab(worker.tabId, asin);
          const gate = await handleAmazonInterstitial(worker.tabId, 2);
          const parsed = await scrapeAmazonListingInTab(worker.tabId, asin);
          return { finalUrl, gate, parsed };
        };
        const timeoutFlow = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`listing fetch timeout after ${PER_ASIN_TIMEOUT_MS}ms`)), PER_ASIN_TIMEOUT_MS);
        });
        try {
          const { finalUrl, gate, parsed } = await Promise.race([listingFlow(), timeoutFlow]);
          const kind = parsed?.kind || gate?.kind || 'unknown_dom';
          const hasStructuredListing = !!(parsed && (parsed.title || parsed.mainImageUrl || (parsed.imageUrls || []).length || (parsed.bullets || []).length));
          if (kind === 'product_page' && hasStructuredListing) {
            STATE.listingMap[task.key] = { ...parsed, listingDomain: task.domain };
            if (task.domain === 'amazon.com') STATE.listingMap[asin] = { ...parsed, listingDomain: task.domain };
            writeCache(task, parsed);
            STATE.listingFetchMeta.success += 1;
            STATE.listingFetchMeta.fetched += 1;
            done++;
            onProgress(done);
            return;
          }
          if (attemptsLeft <= 0) {
            STATE.listingFetchMeta.failed += 1;
            pushListingSample({
              asin,
              status: 200,
              finalUrl,
              kind,
              gateKind: gate?.kind || '',
              pageTitle: parsed?.pageTitle || '',
              parsedTitle: parsed?.title || '',
              parsedImageCount: Array.isArray(parsed?.imageUrls) ? parsed.imageUrls.length : 0,
              bodyPreview: parsed?.bodyPreview || gate?.bodyPreview || '',
            });
          } else {
            STATE.listingFetchMeta.retry += 1;
          }
        } catch (error) {
          if (attemptsLeft <= 0) {
            throw error;
          }
          STATE.listingFetchMeta.retry += 1;
        }
      }
    } catch (error) {
      STATE.listingFetchMeta.failed += 1;
      pushListingSample({
        asin,
        status: 0,
        finalUrl: `https://www.amazon.com/dp/${asin}`,
        kind: 'fetch_error',
        error: error.message,
      });
    }
    done++;
    onProgress(done);
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, tasks.length); i++) {
    workers.push(await acquireAmazonListingTab(i));
  }

  try {
    for (let i = 0; i < tasks.length; i += workers.length) {
      if (Date.now() > deadline) {
        const remaining = tasks.length - i;
        STATE.listingFetchMeta.skipped += remaining;
        break;
      }
      const batch = tasks.slice(i, i + workers.length);
      await Promise.all(batch.map((task, index) => fetchOne(task, workers[index])));
      if (i + workers.length < tasks.length) await sleep(DELAY_MS);
    }
  } finally {
    for (const worker of workers) {
      if (worker?.created && worker.tabId) await removeTab(worker.tabId);
    }
  }
}

// ---- Listing HTML 解析（panel 页面有 DOMParser）----
function parseListing(html, asin) {
  if (globalThis.ListingParser?.parseListing) return globalThis.ListingParser.parseListing(html, asin);
  return { asin, fetchedAt: new Date().toISOString() };
}

// ============================================================
// 阶段 3：构建产品画像
// ============================================================
function buildInvMap(rows) {
  const map = {};
  if (rows[0]) {
    log(`库存SKU字段样本：sku=${rows[0].sku} raw_sku=${rows[0].raw_sku} product_sku=${rows[0].product_sku} asin=${rows[0].asin}`, 'warn');
    // 找出所有站点相关字段
    const siteFields = Object.keys(rows[0]).filter(k => /site|channel|market|amazon_account|salesChannel/i.test(k));
    log(`库存站点字段：${JSON.stringify(siteFields.map(k => k+'='+rows[0][k]))}`, 'warn');
    const sellableFields = Object.keys(rows[0]).filter(k => /saleday|sale_day|sales_day|sellable|available_day|可卖/i.test(k));
    log(`库存可卖天数字段：${JSON.stringify(sellableFields.map(k => k+'='+rows[0][k]))}`, 'warn');
  }
  for (const r of rows) {
    // 只保留美国/英国站数据，避免其他站点重复
    if (r.salesChannel && !['Amazon.com', 'Amazon.co.uk'].includes(r.salesChannel)) continue;
    const sku = r.sku || r.SKU || r.Sku || r.raw_sku || r.product_sku || r.rawSku || '';
    if (!sku) continue;
    const stockFul = parseFloat(r.fulFillable || 0) || 0;
    const stockRes = parseFloat(r.reserved || 0) || 0;
    const stockInbAir = readNumField(r, ['inbound_cal', 'inbound_cal_no_reserve', 'inb_air', 'inbound_air', 'air_inbound', 'unstock_in_amount'], 0);
    const stockInb = readNumField(r, ['inbound', 'inbound_reserve'], 0);
    const stockPlan = readNumField(r, ['fba_plan_total', 'fbaPlan', 'purchasePlan', 'fba_plan_urgent'], 0);
    const sellableAirFulRes = {
      '3d': readSellableDaysByScope(r, 3, 'first', stockInbAir + stockFul + stockRes),
      '7d': readSellableDaysByScope(r, 7, 'first', stockInbAir + stockFul + stockRes),
      '30d': readSellableDaysByScope(r, 30, 'first', stockInbAir + stockFul + stockRes),
    };
    const sellableInbFulRes = {
      '3d': readSellableDaysByScope(r, 3, 'second', stockInb + stockFul + stockRes),
      '7d': readSellableDaysByScope(r, 7, 'second', stockInb + stockFul + stockRes),
      '30d': readSellableDaysByScope(r, 30, 'second', stockInb + stockFul + stockRes),
    };
    const sellableInbFulResPlan = {
      '3d': readComputedSellableDays(stockInb + stockFul + stockRes + stockPlan, r.qty_3, 3),
      '7d': readComputedSellableDays(stockInb + stockFul + stockRes + stockPlan, r.qty_7, 7),
      '30d': readComputedSellableDays(stockInb + stockFul + stockRes + stockPlan, r.qty_30, 30),
    };
    const sellableFulRes = {
      '3d': readSellableDaysByScope(r, 3, 'third', stockFul + stockRes),
      '7d': readSellableDaysByScope(r, 7, 'third', stockFul + stockRes),
      '30d': readSellableDaysByScope(r, 30, 'third', stockFul + stockRes),
    };
    map[sku] = {
      aid:            r.aid || r.id || r.AID || r.product_id || '',
      sku,
      asin:           r.asin || r.ASIN || null,
      salesChannel:   r.salesChannel || r.sales_channel || '',
      saleStatus:     r.sale_status || r.saleStatus || '',
      fuldate:        r.fuldate || '',
      opendate:       r.opendate || '',
      listingDomain:  listingDomainForSalesChannel(r.salesChannel || r.sales_channel || ''),
      price:          parseFloat(r.lowestprice || 0),
      profitRate:     parseFloat(r.profitRate || 0),          // 空运利润率
      seaProfitRate:  parseFloat(r.seaProfitRate || 0),       // 海运利润率
      netProfit:      parseFloat(r.net_profit || 0),          // Q1-Q3 参考净利润率
      busyNetProfit:  parseFloat(r.busy_net_profit || 0),     // Q4 参考净利润率（含旺季仓储费）
      invDays:        sellableFulRes['30d'],
      sellableDays_3d: sellableFulRes['3d'],
      sellableDays_7d: sellableFulRes['7d'],
      sellableDays_30d: sellableFulRes['30d'],
      sellableDaysFulRes_3d: sellableFulRes['3d'],
      sellableDaysFulRes_7d: sellableFulRes['7d'],
      sellableDaysFulRes_30d: sellableFulRes['30d'],
      sellableDaysAirFulRes_3d: sellableAirFulRes['3d'],
      sellableDaysAirFulRes_7d: sellableAirFulRes['7d'],
      sellableDaysAirFulRes_30d: sellableAirFulRes['30d'],
      sellableDaysInbFulRes_3d: sellableInbFulRes['3d'],
      sellableDaysInbFulRes_7d: sellableInbFulRes['7d'],
      sellableDaysInbFulRes_30d: sellableInbFulRes['30d'],
      sellableDaysInbFulResPlan_3d: sellableInbFulResPlan['3d'],
      sellableDaysInbFulResPlan_7d: sellableInbFulResPlan['7d'],
      sellableDaysInbFulResPlan_30d: sellableInbFulResPlan['30d'],
      sellableDaysSource_3d: readSellableDaysSourceByScope(r, 3, 'third') || 'computed_ful_res',
      sellableDaysSource_7d: readSellableDaysSourceByScope(r, 7, 'third') || 'computed_ful_res',
      sellableDaysSource_30d: readSellableDaysSourceByScope(r, 30, 'third') || 'computed_ful_res',
      stockInbAir,
      stockInb,
      stockFul,
      stockRes,
      stockPlan,
      unitsSold_30d:  parseFloat(r.qty_30 || 0),
      unitsSold_7d:   parseFloat(r.qty_7  || 0),
      unitsSold_3d:   parseFloat(r.qty_3  || 0),
      fulFillable:    stockFul,
      reserved:       stockRes,
      fbaRemoteFlag:  r.fba_remote_flag || r.fbaRemoteFlag || r.fba_remote || '否',
      session_7:      readNumField(r, ['session_7', 'session7'], 0),
      session_14:     readNumField(r, ['session_14', 'session14'], 0),
      session_21:     readNumField(r, ['session_21', 'session21'], 0),
      percentage_7:   readNumField(r, ['percentage_7', 'percentage7'], 0),
      percentage_14:  readNumField(r, ['percentage_14', 'percentage14'], 0),
      percentage_21:  readNumField(r, ['percentage_21', 'percentage21'], 0),
      adDependency:   parseFloat(r.AT || r.at || 0),
      yoySales:       readNumField(r, ['year_over_year_sales', 'yearOverYearSales', 'sales_yoy', 'yoy_sales', '同比销量', '同比销售额'], 0),
      yoySalesPct:    readNumField(r, ['year_over_year_sales_rate', 'yearOverYearSalesRate', 'sales_yoy_rate', 'yoy_sales_rate', 'year_over_year_rate', 'same_period_sales_rate', '同比销量增长率', '同比销售增长率', '同比增长率', '同比'], 0),
      yoyUnitsPct:    readNumField(r, ['year_over_year_units_rate', 'yearOverYearUnitsRate', 'year_over_year_qty_rate', 'yearOverYearQtyRate', 'units_yoy_rate', 'qty_yoy_rate', 'yoy_units_rate', 'year_over_year_asin_rate', 'yearOverYearAsinRate', 'same_period_qty_rate', '同比单量增长率', '同比销量件数增长率'], 0),
      yoyAsinPct:     readNumField(r, ['year_over_year_asin_rate', 'yearOverYearAsinRate'], 0),
      yoySourceField: readNumFieldSource(r, ['year_over_year_units_rate', 'yearOverYearUnitsRate', 'year_over_year_qty_rate', 'yearOverYearQtyRate', 'units_yoy_rate', 'qty_yoy_rate', 'yoy_units_rate', 'year_over_year_asin_rate', 'yearOverYearAsinRate', 'year_over_year_sales_rate', 'yearOverYearSalesRate', 'sales_yoy_rate', 'yoy_sales_rate', 'year_over_year_rate', 'same_period_qty_rate', 'same_period_sales_rate', '同比单量增长率', '同比销量件数增长率', '同比销量增长率', '同比销售增长率', '同比增长率', '同比']),
      yoyRank:        readNumField(r, ['year_over_year_rank', 'yearOverYearRank', 'rank_yoy', 'yoy_rank', '同比排名'], 0),
      note:           String(r.note || r.input_tag || '').trim(),
      solrTerm:       String(r.solr_term || '').trim(),
      isSeasonal:     (() => {
        const st = String(r.solr_term || '').trim();
        if (!st || st === '0' || st === '1') return false;
        // 有活跃 ID 集合时精确判断，否则只要有节气 ID 就算节气品
        if (STATE.activeSeasonalIds.size > 0) return STATE.activeSeasonalIds.has(st);
        return true;
      })(),
    };
  }
  return map;
}

function projectInventoryScopeRow(row = {}) {
  return {
    sku: row.sku || row.SKU || row.Sku || row.raw_sku || row.product_sku || row.rawSku || '',
    asin: row.asin || row.ASIN || '',
    aid: row.aid || row.id || row.AID || row.product_id || '',
    salesChannel: row.salesChannel || row.sales_channel || '',
    saleStatus: row.sale_status || row.saleStatus || '',
    fuldate: row.fuldate || '',
    opendate: row.opendate || '',
  };
}

function selectSalesHistoryTasks(invMap = {}, options = {}) {
  const strategy = String(options.salesHistoryStrategy || 'none');
  if (strategy === 'none') return [];
  const skuSet = new Set((options.salesHistorySkus || []).map(item => String(item || '').trim().toUpperCase()).filter(Boolean));
  const limit = Number(options.salesHistoryLimit || 0);
  const tasks = [];
  for (const [sku, inv] of Object.entries(invMap || {})) {
    if (!sku || !inv?.asin || !inv?.salesChannel) continue;
    if (strategy === 'schema' && skuSet.size && !skuSet.has(String(sku).toUpperCase())) continue;
    tasks.push({
      sku,
      asin: inv.asin,
      site: inv.salesChannel,
      fbaRemoteFlag: inv.fbaRemoteFlag || '否',
    });
    if (limit > 0 && tasks.length >= limit) break;
  }
  return tasks;
}

async function fetchSkuSalesHistory({ asin, site, sku, fbaRemoteFlag = '否' } = {}) {
  if (!asin || !site || !sku) {
    return {
      sku: sku || '',
      asin: asin || '',
      site: site || '',
      rows: [],
      summary: {},
      parseWarning: 'missing asin/site/sku for sales history fetch',
      rawHtmlSnippet: '',
    };
  }
  const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
  const result = await execInAnyFrame(tab.id, async (payload) => {
    const url = new URL('/pm/formal/getSalesHistoryList', location.origin);
    url.searchParams.set('asin', payload.asin);
    url.searchParams.set('site', payload.site);
    url.searchParams.set('sku', payload.sku);
    url.searchParams.set('fba_remote_flag', payload.fbaRemoteFlag || '否');
    const res = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, html: text, url: url.toString() };
  }, [{ asin, site, sku, fbaRemoteFlag }]);
  if (!result) {
    return { sku, asin, site, rows: [], summary: {}, parseWarning: 'sales history fetch returned no frame result', rawHtmlSnippet: '' };
  }
  const parsed = globalThis.SalesHistoryParser?.parseSkuSalesHistoryHtml
    ? globalThis.SalesHistoryParser.parseSkuSalesHistoryHtml(result.html || '', { sku, asin, site })
    : { sku, asin, site, rows: [], summary: {}, parseWarning: 'SalesHistoryParser unavailable', rawHtmlSnippet: String(result.html || '').slice(0, 1200) };
  return {
    ...parsed,
    httpStatus: result.status,
    ok: !!result.ok,
    requestUrl: result.url,
  };
}

async function fetchSalesHistoriesConcurrent(tasks = [], options = {}) {
  const concurrency = Math.max(1, Number(options.salesHistoryConcurrency || 3));
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index++];
      try {
        const history = await fetchSkuSalesHistory(task);
        STATE.salesHistoryMap[String(task.sku || '').toUpperCase()] = history;
      } catch (error) {
        STATE.salesHistoryMap[String(task.sku || '').toUpperCase()] = {
          ...task,
          rows: [],
          summary: {},
          parseWarning: error.message,
          rawHtmlSnippet: '',
        };
      }
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

function attachSalesHistoryData(cards = [], salesHistoryMap = {}) {
  return (cards || []).map(card => ({
    ...card,
    salesHistory: salesHistoryMap[String(card.sku || '').toUpperCase()] || null,
  }));
}

function buildSellerSalesMap(rows = []) {
  const map = {};
  for (const row of rows || []) {
    const sku = String(row.sku || row.SKU || row.Sku || row.product_sku || row.raw_sku || row.productSku || '').trim();
    if (!sku) continue;
    if (!map[sku]) {
      map[sku] = {
        sku,
        sellers: new Set(),
        rows: 0,
        orderSales: 0,
        orderQuantity: 0,
        orderCount: 0,
        refundQuantity: 0,
        rawSamples: [],
      };
    }
    const item = map[sku];
    item.rows += 1;
    const seller = row.seller || row.seller_id || row.sellerId || row.seller_name || row.sellerName || '';
    if (seller) item.sellers.add(String(seller));
    item.orderSales += readNumField(row, ['order_sales', 'orderSales', 'sales', 'Sales', 'amount', 'sale_amount', '销售额'], 0);
    item.orderQuantity += readNumField(row, ['order_quantity', 'orderQuantity', 'order_qty', 'qty', 'quantity', 'order_num', '销量', '订单量'], 0);
    item.orderCount += readNumField(row, ['order_count', 'orderCount', 'orders', 'Orders', 'order', '订单数'], 0);
    item.refundQuantity += readNumField(row, ['refund_quantity', 'refundQuantity', 'refund_qty', 'refunds', '退货量'], 0);
    if (item.rawSamples.length < 3) item.rawSamples.push(row);
  }
  for (const item of Object.values(map)) {
    item.sellers = [...item.sellers];
  }
  return map;
}

function buildProductCards(kwRows, autoRows, invMap, listingMap, targetRows = [], sbRows = [], productAdRows = [], sbCampaignRows = [], sellerSalesMap = {}) {
  const cooldownDays = parseInt($('cooldownDays').value) || 7;
  const cutoffDate = new Date(Date.now() - cooldownDays * 86400000);

  // SKU → campaigns → keywords/autoTargets 聚合
  const skuMap = {};

  function getOrCreate(sku, asin) {
    if (!skuMap[sku]) {
      const inv = invMap[sku] || {};
      skuMap[sku] = {
        sku,
        asin: asin || inv.asin || null,
        salesChannel: inv.salesChannel || '',
        saleStatus: inv.saleStatus || '',
        fuldate: inv.fuldate || '',
        opendate: inv.opendate || '',
        listingDomain: inv.listingDomain || listingDomainForSalesChannel(inv.salesChannel || ''),
        price:         inv.price         || 0,
        profitRate:    inv.profitRate     || 0,
        seaProfitRate: inv.seaProfitRate  || 0,
        netProfit:     inv.netProfit      || 0,
        busyNetProfit: inv.busyNetProfit  || 0,
        invDays:       inv.invDays        || 0,
        sellableDays_3d: inv.sellableDays_3d || 0,
        sellableDays_7d: inv.sellableDays_7d || 0,
        sellableDays_30d: inv.sellableDays_30d || inv.invDays || 0,
        sellableDaysFulRes_3d: inv.sellableDaysFulRes_3d || inv.sellableDays_3d || 0,
        sellableDaysFulRes_7d: inv.sellableDaysFulRes_7d || inv.sellableDays_7d || 0,
        sellableDaysFulRes_30d: inv.sellableDaysFulRes_30d || inv.sellableDays_30d || inv.invDays || 0,
        sellableDaysAirFulRes_3d: inv.sellableDaysAirFulRes_3d || 0,
        sellableDaysAirFulRes_7d: inv.sellableDaysAirFulRes_7d || 0,
        sellableDaysAirFulRes_30d: inv.sellableDaysAirFulRes_30d || 0,
        sellableDaysInbFulRes_3d: inv.sellableDaysInbFulRes_3d || 0,
        sellableDaysInbFulRes_7d: inv.sellableDaysInbFulRes_7d || 0,
        sellableDaysInbFulRes_30d: inv.sellableDaysInbFulRes_30d || 0,
        sellableDaysInbFulResPlan_3d: inv.sellableDaysInbFulResPlan_3d || 0,
        sellableDaysInbFulResPlan_7d: inv.sellableDaysInbFulResPlan_7d || 0,
        sellableDaysInbFulResPlan_30d: inv.sellableDaysInbFulResPlan_30d || 0,
        sellableDaysSource_3d: inv.sellableDaysSource_3d || '',
        sellableDaysSource_7d: inv.sellableDaysSource_7d || '',
        sellableDaysSource_30d: inv.sellableDaysSource_30d || '',
        unitsSold_30d: inv.unitsSold_30d  || 0,
        unitsSold_7d:  inv.unitsSold_7d   || 0,
        unitsSold_3d:  inv.unitsSold_3d   || 0,
        adDependency:  inv.adDependency   || 0,
        yoySales:      inv.yoySales       || 0,
        yoySalesPct:   inv.yoySalesPct    || 0,
        yoyUnitsPct:   inv.yoyUnitsPct    || 0,
        yoyAsinPct:    inv.yoyAsinPct     || 0,
        yoySourceField: inv.yoySourceField || '',
        yoyRank:       inv.yoyRank        || 0,
        note:          inv.note           || '',
        solrTerm:      inv.solrTerm       || '',
        isSeasonal:    inv.isSeasonal     || false,
        fulFillable:   inv.fulFillable    || 0,
        reserved:      inv.reserved       || 0,
        stockInbAir:   inv.stockInbAir    || 0,
        stockInb:      inv.stockInb       || 0,
        stockFul:      inv.stockFul       || inv.fulFillable || 0,
        stockRes:      inv.stockRes       || inv.reserved || 0,
        stockPlan:     inv.stockPlan      || 0,
        fbaRemoteFlag: inv.fbaRemoteFlag  || '否',
        listingSessions: {
          lastWeek: inv.session_7 || 0,
          twoWeeksAgo: inv.session_14 || 0,
          threeWeeksAgo: inv.session_21 || 0,
        },
        listingConversionRates: {
          lastWeek: inv.percentage_7 || 0,
          twoWeeksAgo: inv.percentage_14 || 0,
          threeWeeksAgo: inv.percentage_21 || 0,
        },
        personalSales: sellerSalesMap[sku] || null,
        campaigns: {},
      };
    }
    return skuMap[sku];
  }

  function getOrCreateCampaign(skuObj, campaignId, campaignName, meta = {}) {
    if (!skuObj.campaigns[campaignId]) {
      skuObj.campaigns[campaignId] = {
        campaignId,
        name: campaignName || '',
        accountId: meta.accountId || '',
        siteId: meta.siteId || 4,
        adGroupId: meta.adGroupId || '',
        state: meta.state || '',
        campaignState: meta.campaignState || meta.state || '',
        groupState: meta.groupState || '',
        budget: parseFloat(meta.budget || meta.dailyBudget || 0) || 0,
        placementTop: meta.placementTop || '',
        placementPage: meta.placementPage || '',
        placementProductPage: meta.placementProductPage || '',
        placementRestOfSearch: meta.placementRestOfSearch || '',
        keywords: [],
        autoTargets: [],
        productAds: [],
        sbCampaign: null,
        sponsoredBrands: [],
      };
    }
    if (!skuObj.campaigns[campaignId].accountId && meta.accountId) skuObj.campaigns[campaignId].accountId = meta.accountId;
    if (!skuObj.campaigns[campaignId].siteId && meta.siteId) skuObj.campaigns[campaignId].siteId = meta.siteId;
    if (!skuObj.campaigns[campaignId].adGroupId && meta.adGroupId) skuObj.campaigns[campaignId].adGroupId = meta.adGroupId;
    if (!skuObj.campaigns[campaignId].state && meta.state) skuObj.campaigns[campaignId].state = meta.state;
    if (!skuObj.campaigns[campaignId].campaignState && meta.campaignState) skuObj.campaigns[campaignId].campaignState = meta.campaignState;
    if (!skuObj.campaigns[campaignId].groupState && meta.groupState) skuObj.campaigns[campaignId].groupState = meta.groupState;
    const budget = parseFloat(meta.budget || meta.dailyBudget || 0);
    if (!skuObj.campaigns[campaignId].budget && Number.isFinite(budget) && budget > 0) skuObj.campaigns[campaignId].budget = budget;
    for (const key of ['placementTop', 'placementPage', 'placementProductPage', 'placementRestOfSearch']) {
      if (!skuObj.campaigns[campaignId][key] && meta[key]) skuObj.campaigns[campaignId][key] = meta[key];
    }
    return skuObj.campaigns[campaignId];
  }

  function buildCreateContext(card, campaigns) {
    const firstCampaign = campaigns.find(c => c.accountId) || campaigns[0] || {};
    const keywordTexts = [...new Set(campaigns.flatMap(c => (c.keywords || []).map(k => String(k.text || '').trim()).filter(Boolean)))].slice(0, 5);
    const hasSpKeyword = campaigns.some(c => (c.keywords || []).length > 0);
    const hasSpAuto = campaigns.some(c => (c.autoTargets || []).some(t => String(t.targetType || '').toLowerCase() !== 'manual'));
    const hasSpManual = campaigns.some(c => (c.autoTargets || []).some(t => String(t.targetType || '').toLowerCase() === 'manual'));
    const hasSbKeyword = campaigns.some(c => (c.sponsoredBrands || []).some(t => t.entityType === 'sbKeyword'));
    const hasSbTarget = campaigns.some(c => (c.sponsoredBrands || []).some(t => t.entityType === 'sbTarget'));
    return {
      accountId: firstCampaign.accountId || '',
      siteId: firstCampaign.siteId || 4,
      existingCampaignCount: campaigns.length,
      coverage: {
        hasSpKeyword,
        hasSpAuto,
        hasSpManual,
        hasSbKeyword,
        hasSbTarget,
      },
      recommendedDailyBudget: 3,
      recommendedDefaultBid: 0.3,
      keywordSeeds: keywordTexts,
    };
  }

  const ASIN_RE = /\bB0[A-Z0-9]{8}\b/;
  const SKU_RE = /[A-Z]{2,5}\d{3,5}/i;
  // 预建 SKU 大写列表，用于 campaignName 模糊匹配
  const invSkus = Object.keys(invMap).map(s => ({ raw: s, up: s.toUpperCase() }));
  const invSkuByUpper = new Map(invSkus.map(s => [s.up, s.raw]));
  for (const sku of Object.keys(invMap || {})) {
    const inv = invMap[sku] || {};
    getOrCreate(sku, inv.asin || '');
  }
  const readStats = (r, days) => ({
    spend: parseFloat(r[`spend${days}`] || r[`cost${days}`] || r[`${days}天花费`] || (days === 30 ? r.spend || r.cost || r.Spend || r.Cost || r['花费'] : 0) || 0),
    orders: parseFloat(r[`orders${days}`] || r[`order${days}`] || r[`${days}天订单`] || (days === 30 ? r.orders || r.order || r.Orders || r['广告订单量'] : 0) || 0),
    acos: parseFloat(r[`acos${days}`] || r[`Acos${days}`] || r[`${days}天ACOS`] || (days === 30 ? r.acos || r.ACOS || r.Acos : 0) || 0),
    clicks: parseFloat(r[`clicks${days}`] || r[`click${days}`] || r[`${days}天点击`] || (days === 30 ? r.clicks || r.click || r.Clicks || r['点击量'] : 0) || 0),
    impressions: parseFloat(r[`impressions${days}`] || r[`impression${days}`] || r[`${days}天曝光`] || (days === 30 ? r.impressions || r.impression || r.Impressions || r['曝光量'] : 0) || 0),
  });

  function resolveIdentity(r) {
    let sku = r.sku || r.SKU || '';
    let asin = r.asin || r.ASIN ||
               ASIN_RE.exec(r.campaignName || '')?.[0] ||
               ASIN_RE.exec(r.groupName    || '')?.[0] ||
               ASIN_RE.exec(r.adGroupName  || '')?.[0] ||
               ASIN_RE.exec(JSON.stringify([r.asins, r.creativeAsins, r.productAsins, r.landingPageAsin, r.productAsin]))?.[0] || '';
    const nameText = `${r.campaignName || ''} ${r.groupName || ''} ${r.adGroupName || ''}`;
    if (sku) {
      sku = invSkuByUpper.get(String(sku).toUpperCase()) || sku;
      if (!asin) asin = invMap[sku]?.asin || '';
      return { sku, asin };
    }

    const campUp = nameText.toUpperCase();
    const hit = invSkus.find(s => campUp.includes(s.up));
    if (hit) return { sku: hit.raw, asin: asin || invMap[hit.raw]?.asin || '' };

    const skuFromName = SKU_RE.exec(nameText)?.[0]?.toUpperCase() || '';
    if (skuFromName) {
      const normalizedSku = invSkuByUpper.get(skuFromName) || skuFromName;
      return { sku: normalizedSku, asin: asin || invMap[normalizedSku]?.asin || '' };
    }

    return { sku: '', asin };
  }

  function inferSbEntityType(r) {
    const text = `${r.entityType || ''} ${r.targetType || ''} ${r.matchType || ''} ${r.keywordText || ''} ${r.keyword || ''}`;
    if (/keyword/i.test(text)) return 'sbKeyword';
    if (/target|asin|category|product/i.test(text)) return 'sbTarget';
    return 'sbEntity';
  }

  function campaignMetaFromRow(r = {}) {
    return {
      accountId: r.accountId,
      siteId: r.siteId,
      adGroupId: r.adGroupId || r.ad_group_id || '',
      state: r.campaignState || r.campaign_state || r.campaignStatus || r.campaign_status || '',
      campaignState: r.campaignState || r.campaign_state || r.campaignStatus || r.campaign_status || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || '',
      budget: r.budget || r.dailyBudget || r.daily_budget || '',
      dailyBudget: r.dailyBudget || r.daily_budget || r.budget || '',
      placementTop: r.placementTop || '',
      placementPage: r.placementPage || '',
      placementProductPage: r.placementProductPage || '',
      placementRestOfSearch: r.placementRestOfSearch || '',
    };
  }

  // 处理关键词
  for (const r of kwRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || r['更新时间'] || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.keywords.push({
      id: String(r.id || r.keywordId || r.keyword_id || ''),
      text: r.keywordText || r.keyword || r.keywordStr || '',
      matchType: r.matchType || r.matchTypeName || r.keywordMatchType || '',
      bid: parseFloat(r.bid || r['竞价'] || 0),
      state: r.state || r.stateVal || '',
      campaignState: r.campaignState || r.campaign_state || camp.campaignState || camp.state || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || camp.groupState || '',
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
  }

  // 处理自动投放
  for (const r of autoRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || r['更新时间'] || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.autoTargets.push({
      id: String(r.id || r.targetId || r.target_id || ''),
      targetType: r.targetType || r.positionType || 'auto',
      bid: parseFloat(r.bid || r['竞价'] || 0),
      state: r.state || r.stateVal || '',
      campaignState: r.campaignState || r.campaign_state || camp.campaignState || camp.state || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || camp.groupState || '',
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
  }

  // 处理定位组（SP定位，和自动投放结构相同，存入 autoTargets）
  for (const r of targetRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.autoTargets.push({
      id: String(r.id || r.targetId || ''),
      targetType: 'manual',
      bid: parseFloat(r.bid || 0),
      state: r.state || '',
      campaignState: r.campaignState || r.campaign_state || camp.campaignState || camp.state || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || camp.groupState || '',
      updatedAt, onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
  }

  // Sponsored Brands stay typed as SB and participate in actions.
  for (const r of sbRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || r.campaign_id_str || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || r.modifyTime || r.updateTime || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.sponsoredBrands.push({
      id: String(r.id || r.keywordId || r.targetId || r.campaignId || ''),
      entityType: inferSbEntityType(r),
      channel: 'SB',
      rawProperty: String(r.__adProperty || ''),
      text: r.keywordText || r.keyword || r.targetingExpression || r.targetText || r.name || '',
      matchType: r.matchType || r.matchTypeName || '',
      bid: parseFloat(r.bid || r.defaultBid || r.cpcBid || 0),
      state: r.state || r.stateVal || r.status || '',
      campaignState: r.campaignState || r.campaign_state || camp.campaignState || camp.state || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || camp.groupState || '',
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
  }

  for (const r of productAdRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || r.modifyTime || r.updateTime || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.productAds.push({
      id: String(r.adId || r.ad_id || r.id || ''),
      entityType: 'productAd',
      state: r.state || r.stateVal || r.status || '',
      campaignState: r.campaignState || r.campaign_state || camp.campaignState || camp.state || '',
      groupState: r.groupState || r.group_state || r.adGroupState || r.ad_group_state || camp.groupState || '',
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
  }

  for (const r of sbCampaignRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', campaignMetaFromRow(r));
    const updatedAt = r.updatedAt || r.updated_at || r.modifyTime || r.updateTime || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.sbCampaign = {
      id: campaignId,
      entityType: 'sbCampaign',
      state: r.state || r.stateVal || r.activeStatus || r.status || '',
      budget: parseFloat(r.budget || r.dailyBudget || 0),
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    };
  }

  // 转换成数组，附加 listing + history
  return Object.values(skuMap).map(card => {
    const campaigns = Object.values(card.campaigns);
    // 聚合广告统计
    const adStats = { '3d': { spend:0,orders:0,clicks:0,impressions:0 }, '7d': { spend:0,orders:0,clicks:0,impressions:0 }, '30d': { spend:0,orders:0,clicks:0,impressions:0 } };
    const sbStats = { '3d': { spend:0,orders:0,clicks:0,impressions:0 }, '7d': { spend:0,orders:0,clicks:0,impressions:0 }, '30d': { spend:0,orders:0,clicks:0,impressions:0 } };
    for (const camp of campaigns) {
      for (const kw of camp.keywords) {
        for (const [dim, s] of [['3d', kw.stats3d], ['7d', kw.stats7d], ['30d', kw.stats30d]]) {
          adStats[dim].spend += s.spend; adStats[dim].orders += s.orders;
          adStats[dim].clicks += s.clicks; adStats[dim].impressions += s.impressions;
        }
      }
      for (const at of camp.autoTargets) {
        for (const [dim, s] of [['3d', at.stats3d], ['7d', at.stats7d], ['30d', at.stats30d]]) {
          adStats[dim].spend += s.spend; adStats[dim].orders += s.orders;
          adStats[dim].clicks += s.clicks; adStats[dim].impressions += s.impressions;
        }
      }
      for (const ad of camp.productAds || []) {
        for (const [dim, s] of [['3d', ad.stats3d], ['7d', ad.stats7d], ['30d', ad.stats30d]]) {
          adStats[dim].spend += s.spend; adStats[dim].orders += s.orders;
          adStats[dim].clicks += s.clicks; adStats[dim].impressions += s.impressions;
        }
      }
      for (const sb of camp.sponsoredBrands) {
        for (const [dim, s] of [['3d', sb.stats3d], ['7d', sb.stats7d], ['30d', sb.stats30d]]) {
          sbStats[dim].spend += s.spend; sbStats[dim].orders += s.orders;
          sbStats[dim].clicks += s.clicks; sbStats[dim].impressions += s.impressions;
        }
      }
    }
    for (const dim of ['3d', '7d', '30d']) {
      const s = adStats[dim];
      s.acos = s.orders > 0 ? s.spend / (s.orders * (card.price || 1)) : (s.spend > 0 ? 99 : 0);
      const sb = sbStats[dim];
      sb.acos = sb.orders > 0 ? sb.spend / (sb.orders * (card.price || 1)) : (sb.spend > 0 ? 99 : 0);
    }
    // 附加历史
    const history = buildHistory(card.sku, card.asin);
    return {
      ...card,
      campaigns,
      createContext: buildCreateContext(card, campaigns),
      adStats,
      sbStats,
      listing: card.asin ? (listingMap[listingMapKey(card.listingDomain || listingDomainForSalesChannel(card.salesChannel), card.asin)] || ((card.listingDomain || listingDomainForSalesChannel(card.salesChannel)) === 'amazon.com' ? listingMap[String(card.asin).trim().toUpperCase()] : null) || null) : null,
      history,
      snapshot: new Date().toISOString().slice(0, 10),
    };
  });
}

// 从已加载的历史快照中提取该 SKU 的历史
function buildHistory(sku, asin) {
  return STATE.snapshots.map(snap => {
    const card = snap.products?.find(p => p.sku === sku || (asin && p.asin === asin));
    if (!card) return null;
    return {
      date: snap.date,
      invDays: card.invDays,
      sellableDays_3d: card.sellableDays_3d,
      sellableDays_7d: card.sellableDays_7d,
      sellableDays_30d: card.sellableDays_30d,
      unitsSold_7d: card.unitsSold_7d,
      adStats: { '7d': card.adStats?.['7d'] },
      listing: card.listing ? { bsr: card.listing.bsr, reviewCount: card.listing.reviewCount } : null,
    };
  }).filter(Boolean);
}

// ============================================================
// 导入 AI 计划（粘贴 Claude 返回的 JSON）
// ============================================================
function importPlan() {
  log('AI 计划导入入口已迁移到 Codex，面板不再承担策略判断', 'warn');
}

function buildClaudePrompt(cards) {
  return 'AI 决策主流程已迁移到 Codex，面板不再生成策略 prompt。';
}

function parseClaudeResponse(text) {
  log('AI 计划解析入口已迁移到 Codex，面板不再解析策略结果', 'warn');
  return [];
}

// ============================================================
// 渲染产品卡片
// ============================================================
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function safeClassSuffix(value) {
  return String(value ?? '').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
}

function renderCards(results, batch) {
  const container = $('cards-container');
  for (const r of results) {
    // 找对应的原始卡片（获取 campaigns 详情）
    const card = batch.find(c => c.sku === r.sku || c.asin === r.asin) || {};
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    const sku = String(r.sku || r.asin || '');
    const bodyId = `body-${container.children.length}`;
    const toggleId = `toggle-${container.children.length}`;
    cardEl.dataset.sku = sku;

    const stageTag = r.stage ? `<span class="tag tag-stage-${safeClassSuffix(r.stage)}">${escapeHtml(r.stage)}</span>` : '';
    const healthTag = r.health ? `<span class="tag tag-health-${safeClassSuffix(r.health)}">${escapeHtml(r.health)}</span>` : '';
    const alertHtml = r.listingAlert ? `<span class="listing-alert">⚠ ${escapeHtml(r.listingAlert)}</span>` : '';
    const asinLink = r.asin ? `<span class="card-asin">${escapeHtml(r.asin)}</span>` : '';
    const actCount = (r.actions || []).length;

    cardEl.innerHTML = `
      <div class="card-header">
        <span class="card-sku">${escapeHtml(sku)}</span>
        ${asinLink}
        ${stageTag}${healthTag}${alertHtml}
        <span class="card-strategy">${escapeHtml(r.strategy || '')}</span>
        <span class="card-toggle" id="${toggleId}">${actCount} 个动作 ▼</span>
      </div>
      <div class="card-body" id="${bodyId}" style="display:none">
        <div class="card-summary">${escapeHtml(r.summary || '')}</div>
        ${renderActionsTable(r.actions || [], r)}
      </div>
    `;
    cardEl.querySelector('.card-header').addEventListener('click', () => toggleCardById(bodyId, toggleId));
    container.appendChild(cardEl);
  }
}

function renderActionsTable(actions, result) {
  if (!actions.length) return '<div style="color:#8b949e;font-size:11px;padding:4px 0">无调整动作</div>';
  let rows = '';
  for (const a of actions) {
    const actionType = a.actionType || (Number.isFinite(a.suggestedBid) ? 'bid' : 'review');
    const isBidAction = actionType === 'bid' && Number.isFinite(a.currentBid) && Number.isFinite(a.suggestedBid);
    const isStateAction = actionType === 'enable' || actionType === 'pause';
    const isCreateAction = actionType === 'create' && a.createInput && typeof a.createInput === 'object';
    const isUp   = isBidAction && a.suggestedBid > a.currentBid;
    const isDown = isBidAction && a.suggestedBid < a.currentBid;
    const cls    = isUp ? 'bid-up' : isDown ? 'bid-down' : 'bid-same';
    const arrow  = isUp ? '↑' : isDown ? '↓' : '—';
    const onCooldown = checkCooldown(a.id, result);
    const sourceText = Array.isArray(a.actionSource) ? a.actionSource.join('+') : (a.actionSource || a.source || 'codex');
    const riskText = a.riskLevel || 'normal';
    const defaultChecked = (isBidAction || isStateAction || isCreateAction) && !onCooldown && result.health !== 'Listing异常';
    const cooldownBadge = onCooldown ? '<span class="cooldown-badge">冷却中</span>' : '';
    const safeId = escapeHtml(a.id || (isCreateAction ? buildCreateActionId(a, result.sku || '') : ''));
    const normalizedType = normalizeActionEntityType(a.entityType);
    const safeType = escapeHtml(normalizedType);
    const safeActionType = escapeHtml(actionType);
    const safeBid = isBidAction ? String(a.suggestedBid) : '';
    const safeSku = escapeHtml(result.sku || '');
    const disabled = (isBidAction || isStateAction || isCreateAction) ? '' : 'disabled';
    const actionCell = isBidAction
      ? '$' + a.suggestedBid.toFixed(2) + ' ' + arrow
      : isCreateAction
        ? `create/${escapeHtml(a.createInput?.mode || 'unknown')}`
        : actionType;
    rows += `
      <tr>
        <td><input type="checkbox" class="action-check" data-id="${safeId}" data-type="${safeType}" data-action-type="${safeActionType}" data-bid="${safeBid}" data-sku="${safeSku}" ${defaultChecked ? 'checked' : ''} ${disabled}></td>
        <td>${entityTypeLabel(normalizedType, actionType)}</td>
        <td style="font-size:10px;color:#8b949e">${safeId}</td>
        <td>${Number.isFinite(a.currentBid) ? '$' + a.currentBid.toFixed(2) : '-'}</td>
        <td class="bid-change ${cls}">${actionCell}</td>
        <td>${cooldownBadge}</td>
        <td>${escapeHtml(sourceText)}</td>
        <td>${escapeHtml(riskText)}</td>
        <td class="reason-text">${escapeHtml(a.reason || '')}</td>
      </tr>`;
  }
  return `
    <table class="actions-table">
      <thead><tr><th></th><th>类型</th><th>ID</th><th>当前竞价</th><th>建议竞价</th><th></th><th>来源</th><th>风险</th><th>原因</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function normalizeActionEntityType(type) {
  const t = String(type || '').trim();
  if (/^spcampaign$/i.test(t) || /^campaigncreate$/i.test(t) || /^createcampaign$/i.test(t)) return 'spCampaign';
  if (/^sbkeyword$/i.test(t) || /^sponsoredBrandKeyword$/i.test(t)) return 'sbKeyword';
  if (/^sbtarget$/i.test(t) || /^sponsoredBrandTarget$/i.test(t) || /^sbentity$/i.test(t)) return 'sbTarget';
  if (/^manualTarget$/i.test(t)) return 'manualTarget';
  if (/^autoTarget$/i.test(t)) return 'autoTarget';
  if (/^productAd$/i.test(t) || /^spProductAd$/i.test(t)) return 'productAd';
  if (/^sbCampaign$/i.test(t)) return 'sbCampaign';
  if (/^keyword$/i.test(t)) return 'keyword';
  return t || 'autoTarget';
}

function entityTypeLabel(type, actionType = 'bid') {
  const labels = {
    keyword: 'SP关键词',
    autoTarget: 'SP自动',
    manualTarget: 'SP定位',
    productAd: 'SP商品广告',
    sbCampaign: 'SB广告活动',
    spCampaign: 'SP建广告',
    sbKeyword: 'SB关键词',
    sbTarget: 'SB定位',
  };
  const suffix = actionType && actionType !== 'bid' ? `/${actionType}` : '';
  return (labels[type] || type) + suffix;
}

function checkCooldown(entityId, result) {
  // 在原始 productCards 里查找 entity 的 onCooldown
  const card = STATE.productCards.find(c => c.sku === result.sku || c.asin === result.asin);
  if (!card) return false;
  for (const camp of card.campaigns) {
    const kw = camp.keywords.find(k => k.id === entityId);
    if (kw) return kw.onCooldown;
    const at = camp.autoTargets.find(t => t.id === entityId);
    if (at) return at.onCooldown;
    const ad = (camp.productAds || []).find(t => t.id === entityId);
    if (ad) return ad.onCooldown;
    const sb = camp.sponsoredBrands.find(t => t.id === entityId);
    if (sb) return sb.onCooldown;
  }
  return false;
}

function toggleCardById(bodyId, toggleId) {
  const body = $(bodyId);
  const toggle = $(toggleId);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (toggle) toggle.textContent = toggle.textContent.replace(open ? '▲' : '▼', open ? '▼' : '▲');
}

window.toggleCard = function(sku) {
  const card = document.querySelector(`.card[data-sku="${CSS.escape(String(sku || ''))}"]`);
  const body = card?.querySelector('.card-body');
  const toggle = card?.querySelector('.card-toggle');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (toggle) toggle.textContent = toggle.textContent.replace(open ? '▲' : '▼', open ? '▼' : '▲');
};

function updateExecCount() {
  const checked = document.querySelectorAll('.action-check:checked');
  $('execPending').textContent = checked.length;
}
document.getElementById('copyLogBtn').addEventListener('click', () => {
  const text = [...logEl.querySelectorAll('div')].map(d => d.textContent).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyLogBtn');
    btn.textContent = '已复制 ✓';
    setTimeout(() => btn.textContent = '复制日志', 1500);
  });
});



// ============================================================
// 阶段 6：执行
// ============================================================
const EXEC_BATCH_SIZE = 50;

function isAdSystemRecentAdjust(result) {
  const text = JSON.stringify(result || {});
  return !!(result && (result.code === 403 || /系统已自动调整|禁止手动调整|近期.*自动调整/.test(text)));
}

function groupExecutionItems(items, getMeta, typeLabel, bucketKeys = []) {
  const groups = new Map();
  const skipped = [];

  for (const item of items) {
    const meta = getMeta(item) || {};
    if (!meta.accountId) {
      skipped.push(item);
      continue;
    }

    const siteId = meta.siteId || 4;
    const bucketValues = bucketKeys.map(key => String(meta[key] || ''));
    const key = [meta.accountId, siteId, ...bucketValues].join('::');
    if (!groups.has(key)) groups.set(key, { accountId: meta.accountId, siteId, bucketValues, items: [] });
    groups.get(key).items.push({ item, meta });
  }

  if (skipped.length) log(`${typeLabel}跳过 ${skipped.length} 条：缺少 accountId，未执行写入`, 'warn');
  return { groups, skipped };
}

async function executePlan() {
  log('自动执行主流程已迁移到 Codex，面板不再执行策略计划', 'warn');
}

function saveExecutionLog(checkedEls, ok, err) {
  const record = {
    executedAt: new Date().toISOString(),
    ok, err,
    actions: [...checkedEls].map(el => ({ id: el.dataset.id, type: el.dataset.type, actionType: el.dataset.actionType || 'bid', bid: el.dataset.bid, sku: el.dataset.sku })),
  };
  downloadJson(record, `ad-ops/plans/${timestamp()}_plan.json`);
}

// ============================================================
// 导出快照
// ============================================================
async function exportSnapshot() {
  log('快照导出给 AI 的入口已迁移到 Codex，面板不再承担策略导出', 'warn');
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => URL.revokeObjectURL(url));
}

function redactSensitiveHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (/token|authorization|cookie|csrf/i.test(key)) result[key] = value ? '[redacted]' : '';
    else result[key] = value;
  }
  return result;
}

function readNumField(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = row?.[key];
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function readNumFieldSource(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    const n = Number(value);
    if (Number.isFinite(n)) return key;
  }
  return '';
}

function sellableDayKeys(days, scope = '') {
  const d = String(days);
  if (scope === 'first') return [`can_sales_${d}_first`];
  if (scope === 'second') return [`can_sales_${d}_second`, `dynamic_saleday${d}`, `dynamic_saleday_${d}`];
  if (scope === 'third') return [`can_sales_${d}_third`];
  const cn = days === 3 ? ['3天可卖', '3天可卖天数', '三天可卖', '三天可卖天数']
    : days === 7 ? ['7天可卖', '7天可卖天数', '七天可卖', '七天可卖天数']
      : ['30天可卖', '30天可卖天数', '三十天可卖', '三十天可卖天数'];
  return [
    `dynamic_saleday${d}`,
    `dynamic_saleday_${d}`,
    `sales_day_${d}`,
    `sale_day_${d}`,
    `saleday_${d}`,
    `sale_days_${d}`,
    `sellable_days_${d}`,
    `sellableDay${d}`,
    `sellable_days${d}`,
    `can_sale_day_${d}`,
    `available_day_${d}`,
    `days_available_${d}`,
    ...cn,
  ];
}

function parseSellableDaysValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (text === '+' || text === '999+') return 999;
  const n = Number(text.replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function readSellableDays(row, days) {
  const key = readSellableDaysSource(row, days);
  return key ? parseSellableDaysValue(row[key]) : 0;
}

function readSellableDaysSource(row, days) {
  for (const key of sellableDayKeys(days)) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return key;
  }
  return '';
}

function readSellableDaysByScope(row, days, scope, fallbackStock = 0) {
  const key = readSellableDaysSourceByScope(row, days, scope);
  if (key) return parseSellableDaysValue(row[key]);
  const qtyKey = days === 3 ? 'qty_3' : days === 7 ? 'qty_7' : 'qty_30';
  return readComputedSellableDays(fallbackStock, row?.[qtyKey], days);
}

function readSellableDaysSourceByScope(row, days, scope) {
  for (const key of sellableDayKeys(days, scope)) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return key;
  }
  return '';
}

function readComputedSellableDays(stock, sold, days) {
  const stockNum = Number(stock) || 0;
  const soldNum = Number(sold) || 0;
  if (soldNum <= 0) return stockNum > 0 ? 999 : 0;
  return Math.round(stockNum / (soldNum / days));
}
