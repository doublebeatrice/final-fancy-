const http = require('http');
const WebSocket = require('ws');

function getPanelPageId() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const page = tabs.find(t => t.url && t.url.includes('panel.html') && t.url.includes('chrome-extension'));
          if (!page) return reject(new Error('panel page not found'));
          resolve(page.id);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const TARGET_SKUS = ['TUR5292', 'TUR8821', 'TUR9541', 'STY2760', 'STY2115', 'STY6101', 'KZ6722', 'QUN5204', 'SHQ3950'];

// 这是从 panel.js 里的 buildInvMap 复制出来的版本（含我新加的 productLabels 字段）
// 我们用 eval 把它注入到 panel 上下文里覆盖原函数
const HOT_PATCH_BUILD_INV_MAP = `
window.buildInvMap_original = window.buildInvMap;
window.buildInvMap = function(rows) {
  const map = {};
  // 直接复用旧实现，再补充 productLabels
  const baseMap = window.buildInvMap_original(rows);
  for (const r of rows) {
    if (r.salesChannel && !['Amazon.com', 'Amazon.co.uk'].includes(r.salesChannel)) continue;
    const sku = r.sku || r.SKU || r.Sku || r.raw_sku || r.product_sku || r.rawSku || '';
    if (!sku || !baseMap[sku]) continue;

    baseMap[sku].productLabels = {
      is_change:                r.is_change ?? null,
      is_grafting_product:      r.is_grafting_product ?? null,
      is_follow:                r.is_follow ?? null,
      is_year_product_str:      r.is_year_product_str ?? null,
      is_illegal_variant:       r.is_illegal_variant ?? null,
      is_custom_product:        r.is_custom_product ?? null,
      is_package_level_product: r.is_package_level_product ?? null,
      is_same_competing:        r.is_same_competing ?? null,
      is_temu:                  r.is_temu ?? null,
      tiktok_tag:               r.tiktok_tag ?? null,
      special_type:             r.special_type ?? null,
      is_year_product:          r.is_year_product ?? null,
      is_new_product:           r.is_new_product ?? null,
      product_label:            r.product_label ?? null,
      product_tag:              r.product_tag ?? null,
      product_type:             r.product_type ?? null,
      productType:              r.productType ?? null,
      parent_asin:              r.parent_asin ?? r.parentAsin ?? null,
      child_asin:               r.child_asin ?? r.childAsin ?? null,
      parent_sku:               r.parent_sku ?? r.parentSku ?? null,
      child_sku:                r.child_sku ?? r.childSku ?? null,
      variation_group:          r.variation_group ?? r.variationGroup ?? null,
      variant_group:            r.variant_group ?? r.variantGroup ?? null,
      main_sku:                 r.main_sku ?? r.mainSku ?? null,
      is_main_sku:              r.is_main_sku ?? r.isMainSku ?? null,
      variation_relation:       r.variation_relation ?? r.variationRelation ?? null,
    };
    baseMap[sku].productLabelsRawKeys = Object.keys(r).filter(k =>
      /^is_|^has_|label|tag|parent|child|main|variation|variant|grafting|follow|change|year_product|new_product/i.test(k)
    );
    // 也保留一份完整 raw row 给 TARGET SKU 方便诊断
    if (${JSON.stringify(TARGET_SKUS)}.includes(sku)) {
      baseMap[sku].__rawRow = r;
    }
  }
  return baseMap;
};
'patched';
`;

async function main() {
  const pageId = await getPanelPageId();
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + pageId);
  await new Promise(r => ws.on('open', r));

  function evalInPage(expr, awaitPromise = true) {
    return new Promise(resolve => {
      const id = Math.floor(Math.random() * 1e9);
      const handler = msg => {
        const r = JSON.parse(msg);
        if (r.id !== id) return;
        ws.off('message', handler);
        resolve(r.result?.result?.value);
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({
        id, method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise }
      }));
    });
  }

  console.log('[1/4] 注入 buildInvMap 热补丁...');
  const patchResult = await evalInPage(HOT_PATCH_BUILD_INV_MAP, false);
  console.log('  ', patchResult);

  console.log('[2/4] 调 fetchAllInventory()，可能会耗时 30-90 秒...');
  const fetchResult = await evalInPage(`
    (async () => {
      try {
        const rows = await fetchAllInventory();
        STATE.invMap = buildInvMap(rows);
        return JSON.stringify({ok: true, rowCount: rows.length, invCount: Object.keys(STATE.invMap).length});
      } catch(e) {
        return JSON.stringify({ok: false, error: e.message, stack: (e.stack||'').slice(0,500)});
      }
    })()
  `, true);
  console.log('  ', fetchResult);

  const fetchParsed = JSON.parse(fetchResult);
  if (!fetchParsed.ok) {
    console.log('抓数失败');
    ws.close();
    return;
  }

  console.log('[3/4] 读取目标 SKU 的 productLabels + 完整 raw row...');
  const probe = await evalInPage(`JSON.stringify({
    skus: ${JSON.stringify(TARGET_SKUS)}.map(sku => {
      const inv = STATE.invMap[sku];
      if (!inv) return {sku, found: false};
      return {
        sku,
        found: true,
        asin: inv.asin,
        opendate: inv.opendate,
        productLabels: inv.productLabels,
        productLabelsRawKeys: inv.productLabelsRawKeys,
        __rawRow: inv.__rawRow,
      };
    })
  })`, false);

  const report = JSON.parse(probe);

  console.log('');
  console.log('========== productLabels 已识别字段 ==========');
  for (const s of report.skus) {
    console.log('--- ' + s.sku + ' ---');
    if (!s.found) { console.log('  not in invMap'); continue; }
    console.log('  asin=' + s.asin + '  opendate=' + s.opendate);
    let hasAny = false;
    for (const [k, v] of Object.entries(s.productLabels || {})) {
      if (v !== null && v !== undefined && v !== '') {
        console.log('    ' + k + ' = ' + JSON.stringify(v));
        hasAny = true;
      }
    }
    if (!hasAny) console.log('    (productLabels 全部为空)');
  }

  console.log('');
  console.log('========== productLabelsRawKeys (从 raw row 自动提取的疑似标签字段) ==========');
  for (const s of report.skus) {
    if (!s.found) continue;
    console.log('  ' + s.sku + ': ' + JSON.stringify(s.productLabelsRawKeys));
  }

  console.log('[4/4] 完整 raw row 写入 data/tmp_tests/probe_result.json');
  require('fs').writeFileSync('data/tmp_tests/probe_result.json', JSON.stringify(report, null, 2));

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
