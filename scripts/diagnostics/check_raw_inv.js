// check_raw_inv.js — 看库存 API 原始响应字段
const WebSocket = require('ws');
const { PANEL_ID } = require('./adjust_lib');

async function run() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + PANEL_ID);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  const eval_ = (expr) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result && r.result.result && r.result.result.value); }
    };
    ws.on('message', h);
    send({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } });
  });

  // 从 panel 的 invMap 里找一个 SKU，然后看原始 invCaptures 里的数据
  // 先看 __invCaptures 是否还在
  const captureLen = await eval_('window.__invCaptures ? window.__invCaptures.length : -1');
  console.log('__invCaptures 长度:', captureLen);

  if (captureLen > 0) {
    // 看第一条原始数据的所有字段
    const firstRow = JSON.parse(await eval_('JSON.stringify(window.__invCaptures[0].json.data && (window.__invCaptures[0].json.data.list || window.__invCaptures[0].json.data.records || window.__invCaptures[0].json.data)?.[0])') || 'null');
    if (firstRow) {
      console.log('\n原始 API 响应第一行字段:');
      // 只打印有值的字段
      const relevant = ['sku','qty_30','qty_7','qty_3','dynamic_saleday30','sales_day_30','fulFillable','inventory_amount','net_profit','busy_net_profit','profitRate','seaProfitRate','asin'];
      for (const k of relevant) {
        console.log(`  ${k} = ${JSON.stringify(firstRow[k])}`);
      }
      console.log('\n所有字段名:', Object.keys(firstRow).filter(k => /qty|day|inv|profit|sales|fill/i.test(k)));
    }
  } else {
    console.log('__invCaptures 已清空，需要重新拉取');
    // 直接看 invMap 里的原始数据
    const sample = JSON.parse(await eval_('JSON.stringify(Object.values(STATE.invMap).slice(0,1)[0])') || 'null');
    console.log('invMap 样本:', sample);
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
