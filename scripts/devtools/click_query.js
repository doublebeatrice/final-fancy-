// click_query.js — 重新枚举上下文，找到 iframe 并点击查询
const WebSocket = require('ws');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';

async function run() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  const contexts = [];
  const capturedBodies = [];

  ws.on('message', data => {
    const r = JSON.parse(data);
    if (r.method === 'Runtime.executionContextCreated') contexts.push(r.params.context);
    if (r.result?.body) {
      try {
        const json = JSON.parse(r.result.body);
        if (json && Object.keys(json).length > 1) capturedBodies.push(json);
      } catch(e) {}
    }
    if (r.method === 'Network.loadingFinished' && r.params?.requestId) {
      send({ id: Math.floor(Math.random()*100000), method: 'Network.getResponseBody', params: { requestId: r.params.requestId } });
    }
  });

  send({ id: 1, method: 'Runtime.enable', params: {} });
  send({ id: 2, method: 'Network.enable', params: {} });
  await wait(1000);

  console.log('上下文:', contexts.map(c => `${c.id}: ${c.origin}`));

  const eval_ = (expr, ctxId) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result?.result?.value); }
    };
    ws.on('message', h);
    const params = { expression: expr, returnByValue: true };
    if (ctxId) params.contextId = ctxId;
    send({ id, method: 'Runtime.evaluate', params });
  });

  // 在每个上下文里找 input.search_btn
  for (const ctx of contexts) {
    const found = await eval_(`
      const q = document.querySelector('input.search_btn');
      q ? JSON.stringify({ found: true, value: q.value, disabled: q.disabled }) : null
    `, ctx.id);
    console.log(`ctx ${ctx.id} (${ctx.origin}): search_btn=${found}`);
    if (found) {
      // 点击
      const r = await eval_(`
        const q = document.querySelector('input.search_btn');
        if (q && !q.disabled) { q.click(); 'clicked:' + q.value; }
        else if (q) 'disabled';
        else 'not found';
      `, ctx.id);
      console.log('点击结果:', r);
      break;
    }
  }

  console.log('\n等待网络响应 (10s)...');
  await wait(10000);

  if (capturedBodies.length > 0) {
    const d = capturedBodies.find(d => d?.data || d?.list);
    if (d) {
      const rows = d?.data?.list || d?.data?.records || d?.data || d?.list || [];
      console.log(`捕获 rows=${rows.length} total=${d?.count||d?.total}`);
      if (rows[0]) {
        const r = rows[0];
        const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','net_profit','profitRate','seaProfitRate','fulFillable'];
        for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
        console.log('含 qty/day/profit 的字段:', Object.keys(r).filter(k => /qty|day|profit|sales|fill/i.test(k)));
      }
    }
  } else {
    console.log('未捕获到响应');
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
