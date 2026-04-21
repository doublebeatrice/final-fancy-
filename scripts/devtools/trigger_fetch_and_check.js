// trigger_fetch_and_check.js — 触发 panel 重新拉取，然后读原始库存行
const WebSocket = require('ws');
const { PANEL_ID, log } = require('./adjust_lib');

async function run() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + PANEL_ID);
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await new Promise(resolve => ws.on('open', resolve));

  const eval_ = (expr, awaitPromise) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result && r.result.result && r.result.result.value); }
    };
    ws.on('message', h);
    send({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise } });
  });

  // 清除旧捕获，触发重新拉取库存
  await eval_('window.__invCaptures = []; window.__invPatched = false;');
  await eval_('document.getElementById("log").innerHTML = ""');
  await eval_('document.getElementById("fetchBtn").click()');

  console.log('已触发拉取，等待库存捕获...');

  // 等待 __invCaptures 有数据（最多60秒）
  let raw = null;
  for (let i = 0; i < 120; i++) {
    await wait(500);
    const len = await eval_('window.__invCaptures ? window.__invCaptures.length : 0');
    if (len > 0) {
      raw = JSON.parse(await eval_('JSON.stringify(window.__invCaptures[0])') || 'null');
      break;
    }
    if (i % 10 === 9) {
      const logText = await eval_('document.getElementById("log").innerText');
      const last = (logText || '').split('\n').filter(Boolean).slice(-1)[0] || '';
      if (last) console.log('  ' + last);
    }
  }

  if (!raw) { console.log('未捕获到库存请求'); ws.close(); return; }

  const getList = d => (
    Array.isArray(d?.data?.list)    ? d.data.list    :
    Array.isArray(d?.data?.records) ? d.data.records :
    Array.isArray(d?.data)          ? d.data         :
    Array.isArray(d?.list)          ? d.list         : []
  );

  const rows = getList(raw.json);
  console.log(`\n捕获到 ${rows.length} 条，total=${raw.json?.count || raw.json?.total}`);

  if (rows[0]) {
    const r = rows[0];
    const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','sales_day_30','fulFillable','inventory_amount','net_profit','busy_net_profit','profitRate','seaProfitRate','asin','salesChannel'];
    console.log('\n第一行关键字段:');
    for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
    console.log('\n所有字段名:', Object.keys(r).filter(k => /qty|day|inv|profit|sales|fill|channel/i.test(k)));
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
