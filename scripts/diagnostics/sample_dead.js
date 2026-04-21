// sample_dead.js — 抽样"死品"数据
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

  const cards = JSON.parse(await eval_('JSON.stringify(STATE.productCards)') || '[]');

  // 有广告花费但被"死品"过滤器干掉的
  const dead = cards.filter(c => c.adStats['30d'].spend > 0 && c.invDays === 0 && c.unitsSold_30d === 0);
  console.log(`\n死品总数 (有花费 & invDays=0 & unitsSold_30d=0): ${dead.length}`);
  console.log('\n前5个样本:');
  dead.slice(0, 5).forEach(c => {
    console.log(`  SKU=${c.sku}  invDays=${c.invDays}  unitsSold_30d=${c.unitsSold_30d}  unitsSold_7d=${c.unitsSold_7d}  spend30d=$${c.adStats['30d'].spend.toFixed(2)}  orders30d=${c.adStats['30d'].orders}  netProfit=${c.netProfit}  note="${c.note || ''}"`);
  });

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
