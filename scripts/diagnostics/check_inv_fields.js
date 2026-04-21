const { createPanelWs } = require('../../src/adjust_lib');

async function run() {
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  const eval_ = expr => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result && r.result.result && r.result.result.value); }
    };
    ws.on('message', h);
    send({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } });
  });

  const invKeys = JSON.parse(await eval_('JSON.stringify(Object.keys(STATE.invMap).slice(0,3))') || '[]');
  console.log('invMap 前3个 SKU:', invKeys);

  for (const sku of invKeys) {
    const entry = JSON.parse(await eval_(`JSON.stringify(STATE.invMap[${JSON.stringify(sku)}])`) || '{}');
    console.log(`\nSKU=${sku}:`, JSON.stringify(entry, null, 2));
  }

  const kwSample = JSON.parse(await eval_('JSON.stringify(STATE.kwRows.slice(0,3).map(r=>({sku:r.sku,asin:r.asin,keywordId:r.keywordId,campaignName:r.campaignName})))') || '[]');
  console.log('\nkwRows 前3条 SKU/ASIN:', JSON.stringify(kwSample, null, 2));

  const stats = JSON.parse(await eval_(`JSON.stringify({
    total: STATE.productCards.length,
    hasInvDays: STATE.productCards.filter(c=>c.invDays>0).length,
    hasUnitsSold: STATE.productCards.filter(c=>c.unitsSold_30d>0).length,
    hasNetProfit: STATE.productCards.filter(c=>c.netProfit>0).length,
    hasProfitRate: STATE.productCards.filter(c=>c.profitRate>0).length
  })`) || '{}');
  console.log('\nproductCards 字段覆盖:', stats);

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
