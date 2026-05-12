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

const HOT_PATCH = `
window.buildInvMap_originalForProbe = window.buildInvMap_originalForProbe || window.buildInvMap;
window.buildInvMap = function(rows) {
  const map = {};
  const baseMap = window.buildInvMap_originalForProbe(rows);
  for (const r of rows) {
    if (r.salesChannel && !['Amazon.com', 'Amazon.co.uk'].includes(r.salesChannel)) continue;
    const sku = r.sku || r.SKU || r.Sku || r.raw_sku || r.product_sku || r.rawSku || '';
    if (!sku || !baseMap[sku]) continue;
    baseMap[sku].productLabels = {
      is_variation:             r.is_variation ?? null,
      is_comb_variant:          r.is_comb_variant ?? null,
      is_variation_check:       r.is_variation_check ?? null,
      is_illegal_variant:       r.is_illegal_variant ?? null,
      parent_asin:              r.parent_asin ?? null,
      low_cost_origin_sku:      r.low_cost_origin_sku ?? null,
      low_cost_id:              r.low_cost_id ?? null,
      change_way:               r.change_way ?? null,
      is_follow_flag:           r.is_follow_flag ?? null,
      is_old_product_analysis:  r.is_old_product_analysis ?? null,
      is_year_product:          r.is_year_product ?? null,
      product_type:             r.product_type ?? null,
      product_label:            r.product_label ?? null,
      holiday_info:             r.holiday_info ?? null,
      origin_fuldate:           r.origin_fuldate ?? null,
      account_num:              r.account_num ?? null,
    };
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

  console.log('[1/3] 注入热补丁...');
  await evalInPage(HOT_PATCH, false);

  console.log('[2/3] 调 fetchAllInventory()，预期 30-90 秒...');
  const t0 = Date.now();
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
  console.log('  ' + fetchResult + '  耗时 ' + ((Date.now()-t0)/1000).toFixed(1) + 's');

  const fetchParsed = JSON.parse(fetchResult);
  if (!fetchParsed.ok) { ws.close(); return; }

  console.log('[3/3] 在全量 invMap 上做字段统计与样本筛选...');

  const probe = await evalInPage(`
    (() => {
      const inv = STATE.invMap || {};
      const skus = Object.keys(inv);
      const total = skus.length;

      // 统计各身份字段的分布
      function countField(field) {
        const counts = {};
        for (const sku of skus) {
          const v = inv[sku].productLabels?.[field];
          const key = v === null || v === undefined ? '(null)' : (v === '' ? '(empty)' : JSON.stringify(v));
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
      }

      const fields = ['is_variation', 'is_comb_variant', 'is_old_product_analysis', 'is_year_product',
        'is_follow_flag', 'low_cost_origin_sku', 'change_way', 'is_illegal_variant', 'is_variation_check',
        'product_type', 'product_label', 'holiday_info'];
      const distributions = {};
      for (const f of fields) distributions[f] = countField(f);

      // 抓几个 is_variation=1 的样本看 SKU
      const variants = skus.filter(s => inv[s].productLabels?.is_variation === 1).slice(0, 10);

      // 抓几个 is_variation=0 的样本看 SKU
      const nonVariants = skus.filter(s => inv[s].productLabels?.is_variation === 0).slice(0, 10);

      // 抓几个 low_cost_origin_sku 非空的（疑似承接款）
      const grafted = skus.filter(s => {
        const v = inv[s].productLabels?.low_cost_origin_sku;
        return v && v !== '';
      }).slice(0, 10).map(s => ({sku: s, origin_sku: inv[s].productLabels.low_cost_origin_sku, opendate: inv[s].opendate}));

      // 按 parent_asin 聚合，看变体组分布
      const byParent = {};
      for (const s of skus) {
        const p = inv[s].productLabels?.parent_asin;
        if (!p) continue;
        if (!byParent[p]) byParent[p] = [];
        byParent[p].push({sku: s, asin: inv[s].asin, opendate: inv[s].opendate, is_variation: inv[s].productLabels?.is_variation, is_comb_variant: inv[s].productLabels?.is_comb_variant});
      }
      const groups = Object.entries(byParent).filter(([p, arr]) => arr.length >= 2).slice(0, 5);

      return JSON.stringify({
        total,
        distributions,
        variantSamples: variants,
        nonVariantSamples: nonVariants,
        graftedSamples: grafted,
        sampleGroups: groups,
      });
    })()
  `, false);

  const parsed = JSON.parse(probe);

  console.log('');
  console.log('全部 invMap SKU 数:', parsed.total);
  console.log('');
  console.log('========== 各身份字段分布 ==========');
  for (const [f, dist] of Object.entries(parsed.distributions)) {
    console.log(f + ':');
    for (const [v, c] of Object.entries(dist)) {
      console.log('  ' + v + ' = ' + c);
    }
  }

  console.log('');
  console.log('========== is_variation=1 的样本 SKU (前 10) ==========');
  console.log(parsed.variantSamples.join(', '));

  console.log('');
  console.log('========== is_variation=0 的样本 SKU (前 10) ==========');
  console.log(parsed.nonVariantSamples.join(', '));

  console.log('');
  console.log('========== 承接款样本 (low_cost_origin_sku 非空) ==========');
  for (const g of parsed.graftedSamples) {
    console.log('  ' + g.sku + ' 承接自 ' + g.origin_sku + ' (开售 ' + g.opendate + ')');
  }

  console.log('');
  console.log('========== 变体组样本（按 parent_asin 聚合，至少 2 个 SKU）==========');
  for (const [parent, arr] of parsed.sampleGroups) {
    console.log('parent_asin = ' + parent + ' (' + arr.length + ' 个 SKU):');
    for (const m of arr) {
      console.log('  ' + m.sku + ' asin=' + m.asin + ' opendate=' + m.opendate + ' is_variation=' + m.is_variation + ' is_comb_variant=' + m.is_comb_variant);
    }
  }

  require('fs').writeFileSync('data/tmp_tests/probe_full_result.json', JSON.stringify(parsed, null, 2));

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
