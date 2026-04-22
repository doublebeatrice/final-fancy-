// ============================================================
// YSWG 广告全自动调整台 — panel.js
// 全部业务逻辑：拉取 → 导出 → 导入计划 → 执行
// ============================================================

// ---- 全局状态 ----
const STATE = {
  invMap: {},
  kwRows: [],
  autoRows: [],
  targetRows: [],
  sbRows: [],
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

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  fetchBtn.addEventListener('click', fetchAllData);
  exportBtn.addEventListener('click', exportSnapshot);
  importBtn.addEventListener('click', importPlan);
  if (createCampaignBtn) createCampaignBtn.addEventListener('click', createCampaignFromTextarea);
  executeBtn.addEventListener('click', executePlan);
});

// ============================================================
// 阶段 1+2+3：全量拉取
// ============================================================
async function fetchAllData() {
  fetchBtn.disabled = true;
  STATE.kwRows = [];
  STATE.autoRows = [];
  STATE.targetRows = [];
  STATE.sbRows = [];
  STATE.sp7DayUntouchedRows = [];
  STATE.sb7DayUntouchedRows = [];
  STATE.productCards = [];
  setProgress('fetchProgress', 5);
  log('开始拉取全量数据…');

  try {
    // 1. 库存 + 活跃节气
    log('拉取库存数据…');
    const invRows = await fetchAllInventory();
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
    STATE.invMap = buildInvMap(invRows);
    const asinCount = Object.values(STATE.invMap).filter(v => v.asin).length;
    $('statInv').textContent = Object.keys(STATE.invMap).length;
    setProgress('fetchProgress', 30);
    log(`库存 ${invRows.length} 条，${Object.keys(STATE.invMap).length} 个 SKU，${asinCount} 个有 ASIN`, 'ok');

    // 2. 关键词（已有缓存则跳过，节省测试时间）
    if (STATE.kwRows.length > 0) {
      log(`关键词已缓存 ${STATE.kwRows.length} 条，跳过拉取`, 'warn');
    } else {
      log('拉取广告关键词…');
      STATE.kwRows = await fetchAllKeywords();
      $('statKw').textContent = STATE.kwRows.length;
      log(`关键词 ${STATE.kwRows.length} 条`, 'ok');
    }
    setProgress('fetchProgress', 55);

    // 3. 自动投放
    log('拉取自动投放…');
    STATE.autoRows = await fetchAllAutoTargets(STATE.kwCapture);
    $('statAuto').textContent = STATE.autoRows.length;
    setProgress('fetchProgress', 65);
    log(`自动投放 ${STATE.autoRows.length} 条`, 'ok');

    // 4. 定位组（SP定位，property=3）
    log('拉取定位组…');
    STATE.targetRows = await fetchAllTargeting(STATE.kwCapture);
    setProgress('fetchProgress', 80);
    log(`定位组 ${STATE.targetRows.length} 条`, 'ok');

    // 4b. Sponsored Brands enter the same adjustment pool as SP entities.
    log('Pulling SB ads data...');
    STATE.sbRows = await fetchAllSponsoredBrands();
    setProgress('fetchProgress', 88);
    log(`SB ads ${STATE.sbRows.length} rows`, STATE.sbRows.length ? 'ok' : 'warn');

    // 4c. 3/7 day ad metrics are not separate fields in the default table response.
    // Re-query the same entities with timeRange windows and merge those metrics back.
    log('拉取广告 3天 / 7天 指标窗口…');
    await enrichAdMetricWindows(STATE.kwCapture);
    setProgress('fetchProgress', 94);

    try {
      const untouched = await fetchSevenDayUntouchedPools();
      STATE.sp7DayUntouchedRows = untouched.spRows || [];
      STATE.sb7DayUntouchedRows = untouched.sbRows || [];
      STATE.sevenDayUntouchedMeta = untouched.meta || {};
      if ($('statSp7d')) $('statSp7d').textContent = STATE.sp7DayUntouchedRows.length;
      if ($('statSb7d')) $('statSb7d').textContent = STATE.sb7DayUntouchedRows.length;
      log(`7d untouched pools: SP ${STATE.sp7DayUntouchedRows.length}, SB ${STATE.sb7DayUntouchedRows.length}`, 'ok');
    } catch (e) {
      log(`7d untouched pool fetch failed: ${e.message}`, 'warn');
    }

    // 5. 构建产品画像
    STATE.productCards = buildProductCards(STATE.kwRows, STATE.autoRows, STATE.invMap, {}, STATE.targetRows, STATE.sbRows);

    setProgress('fetchProgress', 100);
    log(`全量数据就绪：${STATE.productCards.length} 个产品画像`, 'ok');

    exportBtn.disabled = false;
  } catch (err) {
    log('拉取失败：' + err.message, 'error');
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
  if (capture.headers) log(`库存headers：${JSON.stringify(capture.headers)}`, 'warn');
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

async function waitTabComplete(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await new Promise(resolve => chrome.tabs.get(tabId, resolve));
    if (tab?.status === 'complete') return true;
    await sleep(300);
  }
  return false;
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
    payload.strategy = 'LEGACY_FOR_SALES';
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
    payload.strategy = 'LEGACY_FOR_SALES';
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
    payload.strategy = 'MANUAL';
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
    const campaignId = String(json?.data?.campaignId || '');
    const adGroupId = String(json?.data?.adGroupId || '');
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
  if (normalized === 'sbKeyword') return 'SB_KEYWORD';
  if (normalized === 'sbTarget') return 'SB_TARGET';

  const prop = String(row?.__adProperty || '');
  if (row?.keywordId || row?.keyword_id) return prop === '4' ? 'SB_KEYWORD' : 'SP_KEYWORD';
  if (row?.targetId || row?.target_id) return prop === '6' ? 'SB_TARGET' : 'SP_AUTO_TARGET';
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
  const logMeta = `action=${built.action} entityType=${built.entityType} keywordId=${built.keywordId || '-'} targetId=${built.targetId || '-'} campaignId=${built.campaignId || '-'} adGroupId=${built.adGroupId || '-'}`;

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

function getApiList(json) {
  return json?.data?.records || json?.data?.list || json?.data?.rows ||
         json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
}

function inferPoolEntityLevel(row, adType) {
  if (row?.keywordId || row?.keyword_id) return 'keyword';
  if (row?.targetId || row?.target_id) return 'target';
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
    state: '1',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    lowCost: 2,
    page: 1,
    limit: 500,
    publicAdv: '2',
    updateWeekday: '2',
  };
}

function makeSevenDaySbPayload() {
  return {
    siteId: 4,
    activeStatus: 'ENABLED',
    searchType: '1',
    userName: ['HJ17', 'HJ171', 'HJ172'],
    level: 'seller_num',
    selectCampaignDate: makeSbDateRange(30),
    page: 1,
    limit: 500,
    field: 'Spend',
    order: 'desc',
    filterForm: { OutOfBudget: false, updateWeekday: '2' },
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

function buildOperationalNoteFields(entry) {
  const plan = entry.plan || {};
  const action = entry.action || {};
  const { direction, actionText } = actionDirectionText(action, entry || {});
  const reason = String(action.reason || entry.reason || plan.summary || '').trim();
  const finalStatus = entry.finalStatus || (entry.success ? 'success' : entry.apiStatus || 'failed');
  const resultReason = entry.errorReason || entry.resultMessage || '';
  const sources = Array.isArray(action.actionSource || entry.actionSource)
    ? (action.actionSource || entry.actionSource)
    : [action.actionSource || entry.actionSource || action.source || entry.source || 'strategy'];
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
  const fields = buildOperationalNoteFields(entry || {});
  return [
    `【${formatInventoryNoteMinute()}】`,
    '',
    `来源：${fields.sourceText || 'strategy'}`,
    `阶段判断：${fields.stage}`,
    `当前问题：${fields.currentProblem}`,
    `核心判断：${fields.coreJudgement}`,
    `执行动作：${fields.actionText}`,
    `动作目的：${fields.purpose}`,
    `后续观察点：${fields.observe}`,
    `备注：${fields.remark}`,
  ].join('\n');
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

  for (const cfg of configs) {
    for (const days of [7, 3]) {
      const windowRows = await fetchAdMetricWindow(kwCapture, cfg, days);
      const matched = mergeAdMetricWindow(cfg.rows, windowRows, days);
      log(`${cfg.label} ${days}天指标：返回 ${windowRows.length} 条，匹配 ${matched} 条`, matched ? 'ok' : 'warn');
    }
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
async function fetchListingsConcurrent(asins, onProgress) {
  let done = 0;
  const CONCURRENCY = 3;
  const DELAY_MS = 900;

  async function fetchOne(asin) {
    await sleep(Math.random() * 400);
    try {
      const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
        credentials: 'omit',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.ok) {
        const html = await res.text();
        STATE.listingMap[asin] = parseListing(html, asin);
      }
    } catch (_) { /* 失败不阻断 */ }
    done++;
    onProgress(done);
  }

  for (let i = 0; i < asins.length; i += CONCURRENCY) {
    await Promise.all(asins.slice(i, i + CONCURRENCY).map(fetchOne));
    if (i + CONCURRENCY < asins.length) await sleep(DELAY_MS);
  }
}

// ---- Listing HTML 解析（panel 页面有 DOMParser）----
function parseListing(html, asin) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result = { asin, isAvailable: false, reviewCount: null, reviewRating: null, price: null, hasPrime: false, bsr: [], fetchedAt: new Date().toISOString() };

  result.isAvailable = !!(doc.getElementById('add-to-cart-button') || doc.getElementById('buy-now-button'));

  const rcEl = doc.getElementById('acrCustomerReviewText');
  if (rcEl) { const m = rcEl.textContent.match(/[\d,]+/); if (m) result.reviewCount = parseInt(m[0].replace(/,/g, ''), 10); }

  const ratingEl = doc.querySelector('#acrPopover, .reviewCountTextLinkedHistogram');
  if (ratingEl) { const t = ratingEl.getAttribute('title') || ratingEl.textContent; const m = t.match(/(\d+\.?\d*)/); if (m) result.reviewRating = parseFloat(m[1]); }

  const priceEl = doc.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
  if (priceEl) { const m = priceEl.textContent.match(/[\d.]+/); if (m) result.price = parseFloat(m[0]); }

  result.hasPrime = !!(doc.querySelector('#isPrimeBadge, .a-icon-prime, [aria-label*="Prime"]'));

  const bsrText = (doc.getElementById('detailBulletsWrapper_feature_div') || doc.getElementById('productDetails_db_sections') || doc.getElementById('SalesRank') || { textContent: '' }).textContent;
  const bsrRe = /#([\d,]+)\s+in\s+([\w &']+?)(?:\s*\(|See Top)/g;
  let m;
  while ((m = bsrRe.exec(bsrText)) !== null) {
    result.bsr.push({ rank: parseInt(m[1].replace(/,/g, ''), 10), category: m[2].trim() });
  }
  return result;
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
  }
  for (const r of rows) {
    // 只保留美国站数据（salesChannel=Amazon.com），避免多站点重复
    if (r.salesChannel && r.salesChannel !== 'Amazon.com') continue;
    const sku = r.sku || r.SKU || r.Sku || r.raw_sku || r.product_sku || r.rawSku || '';
    if (!sku) continue;
    map[sku] = {
      aid:            r.aid || r.id || r.AID || r.product_id || '',
      sku,
      asin:           r.asin || r.ASIN || null,
      price:          parseFloat(r.lowestprice || 0),
      profitRate:     parseFloat(r.profitRate || 0),          // 空运利润率
      seaProfitRate:  parseFloat(r.seaProfitRate || 0),       // 海运利润率
      netProfit:      parseFloat(r.net_profit || 0),          // Q1-Q3 参考净利润率
      busyNetProfit:  parseFloat(r.busy_net_profit || 0),     // Q4 参考净利润率（含旺季仓储费）
      invDays:        (v => v === '+' || v === '999+' ? 999 : parseFloat(v) || 0)(r.dynamic_saleday30 || r.sales_day_30 || '0'),
      unitsSold_30d:  parseFloat(r.qty_30 || 0),
      unitsSold_7d:   parseFloat(r.qty_7  || 0),
      unitsSold_3d:   parseFloat(r.qty_3  || 0),
      fulFillable:    parseFloat(r.fulFillable || 0),
      reserved:       parseFloat(r.reserved || 0),
      adDependency:   parseFloat(r.AT || r.at || 0),
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

function buildProductCards(kwRows, autoRows, invMap, listingMap, targetRows = [], sbRows = []) {
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
        price:         inv.price         || 0,
        profitRate:    inv.profitRate     || 0,
        seaProfitRate: inv.seaProfitRate  || 0,
        netProfit:     inv.netProfit      || 0,
        busyNetProfit: inv.busyNetProfit  || 0,
        invDays:       inv.invDays        || 0,
        unitsSold_30d: inv.unitsSold_30d  || 0,
        unitsSold_7d:  inv.unitsSold_7d   || 0,
        unitsSold_3d:  inv.unitsSold_3d   || 0,
        adDependency:  inv.adDependency   || 0,
        note:          inv.note           || '',
        solrTerm:      inv.solrTerm       || '',
        isSeasonal:    inv.isSeasonal     || false,
        fulFillable:   inv.fulFillable    || 0,
        reserved:      inv.reserved       || 0,
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
        keywords: [],
        autoTargets: [],
        sponsoredBrands: [],
      };
    }
    if (!skuObj.campaigns[campaignId].accountId && meta.accountId) skuObj.campaigns[campaignId].accountId = meta.accountId;
    if (!skuObj.campaigns[campaignId].siteId && meta.siteId) skuObj.campaigns[campaignId].siteId = meta.siteId;
    if (!skuObj.campaigns[campaignId].adGroupId && meta.adGroupId) skuObj.campaigns[campaignId].adGroupId = meta.adGroupId;
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

  // 处理关键词
  for (const r of kwRows) {
    const { sku, asin } = resolveIdentity(r);
    const key = sku || asin || String(r.campaignId || r.campaign_id || '');
    if (!key) continue;
    const skuObj = getOrCreate(key, asin);
    if (asin && !skuObj.asin) skuObj.asin = asin;
    const campaignId = String(r.campaignId || r.campaign_id || '');
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', {
      accountId: r.accountId,
      siteId: r.siteId,
      adGroupId: r.adGroupId || r.ad_group_id || '',
    });
    const updatedAt = r.updatedAt || r.updated_at || r['更新时间'] || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.keywords.push({
      id: String(r.id || r.keywordId || r.keyword_id || ''),
      text: r.keywordText || r.keyword || r.keywordStr || '',
      matchType: r.matchType || r.matchTypeName || r.keywordMatchType || '',
      bid: parseFloat(r.bid || r['竞价'] || 0),
      state: r.state || r.stateVal || '',
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
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', {
      accountId: r.accountId,
      siteId: r.siteId,
      adGroupId: r.adGroupId || r.ad_group_id || '',
    });
    const updatedAt = r.updatedAt || r.updated_at || r['更新时间'] || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.autoTargets.push({
      id: String(r.id || r.targetId || r.target_id || ''),
      targetType: r.targetType || r.positionType || 'auto',
      bid: parseFloat(r.bid || r['竞价'] || 0),
      state: r.state || r.stateVal || '',
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
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', {
      accountId: r.accountId,
      siteId: r.siteId,
      adGroupId: r.adGroupId || r.ad_group_id || '',
    });
    const updatedAt = r.updatedAt || r.updated_at || '';
    const onCooldown = updatedAt ? new Date(updatedAt) > cutoffDate : false;
    camp.autoTargets.push({
      id: String(r.id || r.targetId || ''),
      targetType: 'manual',
      bid: parseFloat(r.bid || 0),
      state: r.state || '',
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
    const camp = getOrCreateCampaign(skuObj, campaignId, r.campaignName || r.campaign_name || '', {
      accountId: r.accountId,
      siteId: r.siteId,
      adGroupId: r.adGroupId || r.ad_group_id || '',
    });
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
      updatedAt,
      onCooldown,
      stats3d: readStats(r, 3),
      stats7d: readStats(r, 7),
      stats30d: readStats(r, 30),
    });
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
      listing: card.asin ? (listingMap[card.asin] || null) : null,
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
  const text = $('planTextarea').value.trim();
  if (!text) { log('请先粘贴 Claude 返回的计划 JSON', 'warn'); return; }

  const bidFloor = parseFloat($('bidFloor').value) || 0.05;
  const results = parseClaudeResponse(text);
  if (!results.length) { log('未解析到有效计划，请检查粘贴的内容', 'error'); return; }

  // 应用 bidFloor
  for (const r of results) {
    r.actions = (r.actions || []).map(action => normalizeCreateAction(action, r));
    for (const a of r.actions || []) {
      if (a.suggestedBid && a.suggestedBid < bidFloor) a.suggestedBid = bidFloor;
    }
  }

  STATE.plan = results;
  $('cards-container').innerHTML = '';
  renderCards(results, STATE.productCards);
  $('cardsSection').style.display = 'block';
  $('cardsSectionTitle').textContent = `产品分析结果（${results.length} 个）`;
  executeBtn.disabled = false;
  updateExecCount();
  log(`计划导入成功：${results.length} 个产品，${results.reduce((s, r) => s + (r.actions?.length || 0), 0)} 个调整动作`, 'ok');
}

function buildClaudePrompt(cards) {
  const today = new Date().toISOString().slice(0, 10);
  const slim = cards.map(c => {
    const keywords = c.keywords || (c.campaigns || []).flatMap(camp => (camp.keywords || []).map(kw => ({
      id: kw.id, text: kw.text, matchType: kw.matchType,
      bid: kw.bid, onCooldown: kw.onCooldown,
      stats3d: kw.stats3d, stats7d: kw.stats7d, stats30d: kw.stats30d,
    })));
    const autoTargets = c.autoTargets || (c.campaigns || []).flatMap(camp => (camp.autoTargets || []).map(at => ({
      id: at.id, targetType: at.targetType,
      bid: at.bid, onCooldown: at.onCooldown,
      stats3d: at.stats3d, stats7d: at.stats7d, stats30d: at.stats30d,
    })));
    const sponsoredBrands = c.sponsoredBrands || (c.campaigns || []).flatMap(camp => (camp.sponsoredBrands || []).map(sb => ({
      id: sb.id, entityType: sb.entityType, rawProperty: sb.rawProperty, text: sb.text, matchType: sb.matchType,
      bid: sb.bid, onCooldown: sb.onCooldown,
      stats3d: sb.stats3d, stats7d: sb.stats7d, stats30d: sb.stats30d,
    })));
    const adjustableAds = c.adjustableAds || (c.campaigns || []).flatMap(camp => [
      ...(camp.keywords || []).map(kw => ({
        channel: 'SP', entityType: 'keyword',
        id: kw.id, text: kw.text, matchType: kw.matchType,
        bid: kw.bid, onCooldown: kw.onCooldown,
        stats3d: kw.stats3d, stats7d: kw.stats7d, stats30d: kw.stats30d,
      })),
      ...(camp.autoTargets || []).map(at => ({
        channel: 'SP', entityType: at.targetType === 'manual' ? 'manualTarget' : 'autoTarget',
        id: at.id, targetType: at.targetType,
        bid: at.bid, onCooldown: at.onCooldown,
        stats3d: at.stats3d, stats7d: at.stats7d, stats30d: at.stats30d,
      })),
      ...(camp.sponsoredBrands || []).map(sb => ({
        channel: 'SB', entityType: sb.entityType, rawProperty: sb.rawProperty,
        id: sb.id, text: sb.text, matchType: sb.matchType,
        bid: sb.bid, onCooldown: sb.onCooldown,
        stats3d: sb.stats3d, stats7d: sb.stats7d, stats30d: sb.stats30d,
      })),
    ]).filter(ad => ad.stats30d?.spend > 0 || ad.stats7d?.spend > 0 || ad.stats3d?.spend > 0);
    return {
      sku: c.sku,
      asin: c.asin,
      profitRate: c.profitRate,
      invDays: c.invDays,
      unitsSold_30d: c.unitsSold_30d,
      unitsSold_7d: c.unitsSold_7d,
      adDependency: c.adDependency,
      note: c.note || null,
      adStats: c.adStats,
      listing: c.listing ? {
        bsr: c.listing.bsr,
        reviewCount: c.listing.reviewCount,
        reviewRating: c.listing.reviewRating,
        price: c.listing.price,
        isAvailable: c.listing.isAvailable,
        hasPrime: c.listing.hasPrime,
      } : null,
      history: c.history?.slice(-4) || [],
      sbStats: c.sbStats,
      createContext: c.createContext || null,
      adjustableAds,
      keywords,
      autoTargets,
      sponsoredBrands,
    };
  });

  return `你是一位有10年经验的亚马逊运营专家，今天是 ${today}。
以下是若干产品的完整画像（库存 + 广告数据 + Listing 前台数据 + 历史趋势）。

请对每个产品进行深度分析：
1. 判断产品阶段（新品/成熟品/衰退品/节气品）—— 主要依据销量趋势、BSR走势、评论增速，note 标签仅辅助参考（可能已过时）
2. 判断当前健康度（盈利/持平/亏损/高风险/Listing异常）
3. 给出广告策略方向
4. 给出具体调整动作（SP关键词、SP自动投放、SP手动定位、SB关键词、SB定位都必须纳入判断池，建议竞价是多少，原因是什么）
5. 如果你判断当前产品需要新建 SP 广告结构，也可以输出 create 动作

分析时重点考虑：
- Listing 异常：isAvailable=false 的产品广告应立即暂停，评分 < 3.8 说明转化天花板低
- BSR 趋势：BSR 连续改善 → 自然流量增长，可适当降低广告依赖；BSR 持续恶化 → 产品可能在下滑
- 新品（评论数 < 50 或近期销量爬坡中）：允许适度亏损换排名，不要轻易止血
- 节气品：结合当前日期和历史 BSR/销量波动模式推断旺淡季
- 库存压力（invDays > 60）：广告加速去库存，但控制 ACOS 防止越卖越亏
- 漏斗诊断：高曝光低点击 → 主图/价格问题；高点击低转化 → Listing/评价问题
- onCooldown=true 的实体在冷却期内，仍给建议但在 reason 中注明
- note 权重低，与数据矛盾时优先相信数据
- SB 广告必须参与加投、降投、关闭、人工复核判断；差异可以在 reason 中说明，但不能直接排除。
- action.entityType 必须准确区分：keyword、autoTarget、manualTarget、sbKeyword、sbTarget、spCampaign。
- action.actionType 可为 bid、enable、pause、review、create。
- bid 动作必须提供 currentBid 和 suggestedBid。
- create 动作只用于 SP 建广告，必须提供 createInput，不要伪造缺字段的创建动作。
- createInput 结构：
  {"mode":"auto|productTarget|keywordTarget","coreTerm":"...","sku":"...","asin":"...","accountId":120,"siteId":4,"dailyBudget":3,"defaultBid":0.3,"targetType":"asinSameAs|asinExpandedFrom|categorySameAs","targetAsins":["B0..."],"matchType":"BROAD|PHRASE|EXACT","keywords":["..."]}
- mode=auto 时只需要基础字段。
- mode=productTarget 时必须补 targetType 和 targetAsins。
- mode=keywordTarget 时必须补 matchType 和 keywords。
- 如果 createContext 缺 accountId 或 siteId，不要输出 create 动作。

产品数据（JSON）：
${JSON.stringify(slim, null, 0)}

直接返回 JSON 数组，不要 markdown 包裹：
[{"sku":"...","asin":"...","stage":"新品|成熟品|衰退品|节气品","health":"盈利|持平|亏损|高风险|Listing异常","listingAlert":null,"strategy":"一句话策略","actions":[{"entityType":"keyword|autoTarget|manualTarget|sbKeyword|sbTarget|spCampaign","actionType":"bid|enable|pause|review|create","id":"...","currentBid":0.45,"suggestedBid":0.50,"reason":"...","createInput":{"mode":"auto","coreTerm":"...","sku":"...","asin":"...","accountId":120,"siteId":4,"dailyBudget":3,"defaultBid":0.3}}],"summary":"2-3句综合判断"}]`;
}

function parseClaudeResponse(text) {
  if (!text) return [];
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { log('未找到 JSON 数组', 'warn'); return []; }
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    log('JSON 解析失败：' + e.message, 'warn');
    return [];
  }
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
    const sourceText = Array.isArray(a.actionSource) ? a.actionSource.join('+') : (a.actionSource || a.source || 'strategy');
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
  if (/^keyword$/i.test(t)) return 'keyword';
  return t || 'autoTarget';
}

function entityTypeLabel(type, actionType = 'bid') {
  const labels = {
    keyword: 'SP关键词',
    autoTarget: 'SP自动',
    manualTarget: 'SP定位',
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
  const checkedEls = [...document.querySelectorAll('.action-check:checked')];
  if (!checkedEls.length) { log('没有勾选任何动作', 'warn'); return; }

  executeBtn.disabled = true;
  let ok = 0, err = 0;
  const inventoryNoteEvents = [];

  function recordInventoryNoteEvent(item, entityType, typeLabel, success, result) {
    const { plan, action } = findPlanActionContext(item, entityType);
    inventoryNoteEvents.push({
      sku: item.sku || plan.sku,
      id: item.id,
      bid: item.bid,
      entityType,
      typeLabel,
      success,
      plan,
      action,
      resultMessage: success ? '无' : JSON.stringify(result || {}),
      errorReason: success ? '无' : JSON.stringify(result || {}),
    });
  }

  // 按类型分组。SB 不再排除，单独分组便于日志和回滚定位。
  const kwItems = [], atItems = [], sbKwItems = [], sbTargetItems = [];
  const stateToggleItems = [];
  const createItems = [];
  for (const el of checkedEls) {
    const { id, type, bid, sku, actionType } = el.dataset;
    const normalizedType = normalizeActionEntityType(type);
    if ((actionType || 'bid') === 'create') {
      createItems.push({ id, sku, type: normalizedType, action: 'create' });
      continue;
    }
    if ((actionType || 'bid') === 'enable' || (actionType || 'bid') === 'pause') {
      stateToggleItems.push({ id, sku, action: actionType || 'pause', type: normalizedType });
      continue;
    }
    if ((actionType || 'bid') !== 'bid') continue;
    const item = { id, bid: parseFloat(bid), sku };
    if (normalizedType === 'keyword') kwItems.push(item);
    else if (normalizedType === 'sbKeyword') sbKwItems.push(item);
    else if (normalizedType === 'sbTarget') sbTargetItems.push(item);
    else atItems.push(item);
  }

  async function executeKeywordBidItems(items, rows, typeLabel, options = {}) {
    const endpoint = options.endpoint || '/keyword/batchKeyword';
    const property = Object.prototype.hasOwnProperty.call(options, 'property') ? options.property : 'keyword';
    const advType = options.advType || 'SP';
    const { groups, skipped } = groupExecutionItems(
      items,
      item => rows.find(r => String(r.keywordId || r.id || r.keyword_id || '') === String(item.id)),
      typeLabel,
      ['campaignId', 'adGroupId']
    );
    err += skipped.length;

    for (const [groupKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += EXEC_BATCH_SIZE) {
        const batch = group.items.slice(i, i + EXEC_BATCH_SIZE);
        const rows = batch.map(({ item, meta }) => ({
          keywordId: item.id,
          bid: item.bid,
          siteId: meta.siteId || 4,
          accountId: meta.accountId,
          campaignId: meta.campaignId,
          adGroupId: meta.adGroupId,
          matchType: meta.matchType,
          advType,
          bidThreshold: meta.bidThreshold,
          adFormat: meta.adFormat,
          costType: meta.costType,
        }));
        try {
          const result = await execAdWrite(endpoint, {
            column: 'bid', property, operation: 'bid', manualTargetType: '',
            accountId: group.accountId, siteId: group.siteId,
            idArray: batch.map(({ item }) => item.id),
            campaignIdArray: [...new Set(rows.map(t => t.campaignId).filter(Boolean))],
            targetArray: rows,
            targetNewArray: rows,
          });
          if (result && (result.code === 200 || result.msg === 'success')) {
            ok += batch.length;
            batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, true, result));
            log(`${typeLabel}竞价更新成功：${groupKey} ${batch.length} 条`, 'ok');
          } else {
            err += batch.length;
            batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, false, result));
            log(`${typeLabel}更新失败：${groupKey} ${JSON.stringify(result)}`, 'error');
          }
        } catch (e) {
          err += batch.length;
          batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, false, { error: e.message }));
          log(`${typeLabel}更新失败：${groupKey} ${e.message}`, 'error');
        }
      }
    }
  }

  async function executeTargetBidItems(items, rows, typeLabel, options = {}) {
    const endpoint = options.endpoint || '/advTarget/batchEditAutoTarget';
    const property = Object.prototype.hasOwnProperty.call(options, 'property') ? options.property : 'autoTarget';
    const advType = options.advType || 'SP';
    const { groups, skipped } = groupExecutionItems(
      items,
      item => rows.find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id)),
      typeLabel,
      ['campaignId', 'adGroupId']
    );
    err += skipped.length;

    for (const [groupKey, group] of groups.entries()) {
      for (let i = 0; i < group.items.length; i += EXEC_BATCH_SIZE) {
        const batch = group.items.slice(i, i + EXEC_BATCH_SIZE);
        const targetArray = batch.map(({ item, meta: raw }) => ({
          siteId: raw.siteId || 4,
          accountId: raw.accountId,
          campaignId: raw.campaignId,
          adGroupId: raw.adGroupId,
          targetId: item.id,
          bid: String(item.bid),
          advType,
          bidThreshold: raw.bidThreshold,
          adFormat: raw.adFormat,
          costType: raw.costType,
        }));
        try {
          const result = await execAdWrite(endpoint, {
            column: 'bid', property, operation: 'bid',
            accountId: group.accountId, siteId: group.siteId,
            idArray: batch.map(({ item }) => item.id),
            campaignIdArray: [...new Set(targetArray.map(t => t.campaignId).filter(Boolean))],
            targetArray,
            targetNewArray: targetArray,
          });
          if (result && (result.code === 200 || result.msg === 'success')) {
            ok += batch.length;
            batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, true, result));
            log(`${typeLabel}竞价更新成功：${groupKey} ${batch.length} 条`, 'ok');
          } else {
            err += batch.length;
            batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, false, result));
            log(`${typeLabel}更新失败：${groupKey} ${JSON.stringify(result)}`, 'error');
          }
        } catch (e) {
          err += batch.length;
          batch.forEach(({ item }) => recordInventoryNoteEvent(item, options.entityType, typeLabel, false, { error: e.message }));
          log(`${typeLabel}更新失败：${groupKey} ${e.message}`, 'error');
        }
      }
    }
  }

  async function executeStateToggleItems(items) {
    for (const item of items) {
      let row = null;
      if (item.type === 'keyword') row = STATE.kwRows.find(r => String(r.keywordId || r.id || r.keyword_id || '') === String(item.id));
      else if (item.type === 'autoTarget') row = STATE.autoRows.find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id));
      else if (item.type === 'manualTarget') row = STATE.targetRows.find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id));
      else if (item.type === 'sbKeyword') row = STATE.sbRows.filter(r => String(r.__adProperty || '') === '4').find(r => String(r.keywordId || r.id || '') === String(item.id));
      else if (item.type === 'sbTarget') row = STATE.sbRows.filter(r => String(r.__adProperty || '') === '6').find(r => String(r.targetId || r.target_id || r.id || '') === String(item.id));

      const result = await executeStateToggle(row, item.action, item.type);
      if (result.ok) ok += 1;
      else err += 1;
    }
  }

  async function executeCreateItems(items) {
    for (const item of items) {
      const { plan, action } = findPlanActionContext(item, 'spCampaign');
      const createInput = action?.createInput || {};
      const result = await createSpCampaign(createInput);
      const success = !!result.ok;
      if (success) ok += 1;
      else err += 1;
      inventoryNoteEvents.push({
        sku: item.sku || plan.sku,
        id: item.id,
        entityType: 'spCampaign',
        typeLabel: 'SP create',
        success,
        plan,
        action,
        finalStatus: success ? 'success' : 'failed',
        resultMessage: success ? `campaignId=${result.campaignId || ''}; adGroupId=${result.adGroupId || ''}` : JSON.stringify(result || {}),
        errorReason: success ? '无' : JSON.stringify(result || {}),
      });
      const detail = [result.responseMsg, result.errorType, result.reason, ...(result.errors || [])].filter(Boolean).join(' | ');
      log(`SP创建 ${success ? '成功' : '失败'}：${item.sku || '-'} ${detail || `campaignId=${result.campaignId || '-'} adGroupId=${result.adGroupId || '-'}`}`, success ? 'ok' : 'error');
    }
  }

  if (createItems.length) await executeCreateItems(createItems);
  if (kwItems.length) await executeKeywordBidItems(kwItems, STATE.kwRows, 'SP关键词', { entityType: 'keyword' });
  if (sbKwItems.length) await executeKeywordBidItems(
    sbKwItems,
    STATE.sbRows.filter(r => String(r.__adProperty || '') === '4'),
    'SB关键词',
    { endpoint: '/keywordSb/batchEditKeywordSbColumn', property: '', advType: 'SB', entityType: 'sbKeyword' }
  );
  const autoTargetIds = new Set((STATE.autoRows || []).map(r => String(r.targetId || r.target_id || r.id || '')));
  const manualTargetIds = new Set((STATE.targetRows || []).map(r => String(r.targetId || r.target_id || r.id || '')));
  const spAutoItems = atItems.filter(item => autoTargetIds.has(String(item.id)));
  const spManualItems = atItems.filter(item => manualTargetIds.has(String(item.id)) && !autoTargetIds.has(String(item.id)));
  const spUnknownItems = atItems.filter(item => !autoTargetIds.has(String(item.id)) && !manualTargetIds.has(String(item.id)));
  spUnknownItems.forEach(item => {
    err += 1;
    recordInventoryNoteEvent(item, item.type || 'autoTarget', 'SP target', false, { error: 'missing target row metadata' });
    log(`SP target missing metadata, skip ${item.id}`, 'error');
  });
  if (spAutoItems.length) await executeTargetBidItems(spAutoItems, STATE.autoRows, 'SP auto target', { entityType: 'autoTarget' });
  if (spManualItems.length) await executeTargetBidItems(
    spManualItems,
    STATE.targetRows,
    'SP manual target',
    { endpoint: '/advTarget/batchUpdateManualTarget', property: 'manualTarget', entityType: 'manualTarget' }
  );
  if (sbTargetItems.length) await executeTargetBidItems(
    sbTargetItems,
    STATE.sbRows.filter(r => String(r.__adProperty || '') === '6'),
    'SB定位',
    { endpoint: '/sbTarget/batchEditTargetSbColumn', property: '', advType: 'SB', entityType: 'sbTarget' }
  );
  if (stateToggleItems.length) await executeStateToggleItems(stateToggleItems);

  if (inventoryNoteEvents.length) {
    const noteResults = await appendInventoryOperationNotes(inventoryNoteEvents);
    const failedNotes = noteResults.filter(r => !r.ok);
    if (failedNotes.length) log(`库存便签写入失败 ${failedNotes.length} 个SKU：${failedNotes.map(r => r.sku).join(', ')}`, 'error');
    else log(`库存便签写入完成：${noteResults.length} 个SKU`, 'ok');
  }

  $('execOk').textContent = ok;
  $('execErr').textContent = err;
  executeBtn.disabled = false;

  // 保存执行计划存档
  saveExecutionLog(checkedEls, ok, err);
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
  if (!STATE.productCards.length) { log('无数据可导出', 'warn'); return; }

  // 只导出有广告花费的产品，精简字段
  const cards = STATE.productCards.filter(c => c.adStats?.['30d']?.spend > 0 || c.sbStats?.['30d']?.spend > 0);
  const slim = cards.map(c => ({
    sku: c.sku,
    asin: c.asin || null,
    profitRate: c.profitRate || null,
    invDays: c.invDays || null,
    unitsSold_30d: c.unitsSold_30d || null,
    unitsSold_7d: c.unitsSold_7d || null,
    note: c.note || null,
    adStats: c.adStats,
    sbStats: c.sbStats,
    createContext: c.createContext || null,
    adjustableAds: c.campaigns.flatMap(camp => [
      ...camp.keywords.map(kw => ({
        channel: 'SP', entityType: 'keyword',
        id: kw.id, text: kw.text, matchType: kw.matchType,
        bid: kw.bid, onCooldown: kw.onCooldown,
        stats3d: kw.stats3d, stats7d: kw.stats7d, stats30d: kw.stats30d,
      })),
      ...camp.autoTargets.map(at => ({
        channel: 'SP', entityType: at.targetType === 'manual' ? 'manualTarget' : 'autoTarget',
        id: at.id, targetType: at.targetType,
        bid: at.bid, onCooldown: at.onCooldown,
        stats3d: at.stats3d, stats7d: at.stats7d, stats30d: at.stats30d,
      })),
      ...camp.sponsoredBrands.map(sb => ({
        channel: 'SB', entityType: sb.entityType, rawProperty: sb.rawProperty,
        id: sb.id, text: sb.text, matchType: sb.matchType,
        bid: sb.bid, onCooldown: sb.onCooldown,
        stats3d: sb.stats3d, stats7d: sb.stats7d, stats30d: sb.stats30d,
      })),
    ]).filter(ad => ad.stats30d?.spend > 0 || ad.stats7d?.spend > 0 || ad.stats3d?.spend > 0),
    keywords: c.campaigns.flatMap(camp => camp.keywords.map(kw => ({
      id: kw.id, text: kw.text, matchType: kw.matchType,
      bid: kw.bid, onCooldown: kw.onCooldown,
      stats3d: kw.stats3d, stats7d: kw.stats7d, stats30d: kw.stats30d,
    }))).filter(kw => kw.stats30d?.spend > 0 || kw.stats7d?.spend > 0 || kw.stats3d?.spend > 0),
    autoTargets: c.campaigns.flatMap(camp => camp.autoTargets.map(at => ({
      id: at.id, targetType: at.targetType,
      bid: at.bid, onCooldown: at.onCooldown,
      stats3d: at.stats3d, stats7d: at.stats7d, stats30d: at.stats30d,
    }))).filter(at => at.stats30d?.spend > 0 || at.stats7d?.spend > 0 || at.stats3d?.spend > 0),
    sponsoredBrands: c.campaigns.flatMap(camp => camp.sponsoredBrands.map(sb => ({
      id: sb.id, channel: 'SB', entityType: sb.entityType, rawProperty: sb.rawProperty, text: sb.text, matchType: sb.matchType,
      bid: sb.bid, onCooldown: sb.onCooldown,
      stats3d: sb.stats3d, stats7d: sb.stats7d, stats30d: sb.stats30d,
    }))).filter(sb => sb.stats30d?.spend > 0 || sb.stats7d?.spend > 0 || sb.stats3d?.spend > 0),
  }));

  const snap = {
    exportedAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    products: slim,
    prompt: buildClaudePrompt(slim),
  };
  downloadJson(snap, `ad-ops/snapshots/${timestamp()}.json`);
  log(`快照已导出：${slim.length} 个产品，发给 Claude 分析`, 'ok');
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
