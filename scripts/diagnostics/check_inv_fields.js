// check_inv_fields.js — 检查 STATE.invMap 里实际的字段值
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

  // 1. invMap 里有多少条，以及前3条的原始字段
  const invKeys = JSON.parse(await eval_('JSON.stringify(Object.keys(STATE.invMap).slice(0,3))') || '[]');
  console.log('invMap 前3个 SKU:', invKeys);

  for (const sku of invKeys) {
    const entry = JSON.parse(await eval_(`JSON.stringify(STATE.invMap[${JSON.stringify(sku)}])`) || '{}');
    console.log(`\nSKU=${sku}:`, JSON.stringify(entry, null, 2));
  }

  // 2. kwRows 前3条的 sku 字段
  const kwSample = JSON.parse(await eval_('JSON.stringify(STATE.kwRows.slice(0,3).map(r=>({sku:r.sku,asin:r.asin,keywordId:r.keywordId,campaignName:r.campaignName})))') || '[]');
  console.log('\nkwRows 前3条 SKU/ASIN:', JSON.stringify(kwSample, null, 2));

  // 3. productCards 里 invDays/unitsSold_30d/netProfit 非零的有多少
  const stats = JSON.parse(await eval_(`JSON.stringify({
    total: STATE.productCards.length,
    hasInvDays: STATE.productCards.filter(c=>c.invDays>0).length,
    hasUnitsSold: STATE.productCards.filter(c=>c.unitsSold_30d>0).length,
    hasNetProfit: STATE.productCards.filter(c=>c.netProfit>0).length,
    hasProfitRate: STATE.productCards.filter(c=>c.profitRate>0).length
  })`) || '{}');
  console.log('\nproductCards 字段覆盖率:', stats);

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
