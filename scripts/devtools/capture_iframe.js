// capture_iframe.js — 连到库存 iframe 执行上下文，直接读数据
const WebSocket = require('ws');
const http = require('http');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';

async function run() {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 获取所有可调试目标（包括 iframe）
  const targets = await new Promise(resolve => {
    http.get('http://127.0.0.1:9222/json', res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
  });
  console.log('所有目标:');
  targets.forEach(t => console.log(' ', t.id, t.type, (t.url||'').slice(0,80)));

  // 连主标签页，用 Runtime.executionContexts 找 iframe 上下文
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  // 启用 Runtime，收集所有执行上下文
  const contexts = [];
  ws.on('message', data => {
    const r = JSON.parse(data);
    if (r.method === 'Runtime.executionContextCreated') {
      contexts.push(r.params.context);
    }
  });
  send({ id: 1, method: 'Runtime.enable', params: {} });
  await wait(1000);

  console.log('\n执行上下文:');
  contexts.forEach(c => console.log(' ', c.id, c.origin, c.name));

  // 找 pm/formal/list 的上下文
  const iframeCtx = contexts.find(c => c.origin && c.origin.includes('sellerinventory'));
  if (!iframeCtx) {
    console.log('\n未找到 iframe 上下文，尝试直接在主上下文执行...');
  }

  const ctxId = iframeCtx?.id;
  console.log('\n使用上下文 ID:', ctxId || '默认');

  const eval_ = (expr, awaitPromise, contextId) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result?.result?.value); }
    };
    ws.on('message', h);
    const params = { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise };
    if (contextId) params.contextId = contextId;
    send({ id, method: 'Runtime.evaluate', params });
  });

  // 在 iframe 上下文里直接调用 API
  const result = await eval_(`
    (async () => {
      try {
        const res = await fetch('/pm/formal/list', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
          body: 'pageNum=1&limit=5'
        });
        const d = await res.json();
        const rows = d?.data?.list || d?.data?.records || d?.data || d?.list || [];
        if (!rows.length) return JSON.stringify({ error: 'no rows', keys: Object.keys(d) });
        const r = rows[0];
        return JSON.stringify({
          total: d.count || d.total,
          fields: Object.keys(r).filter(k => /qty|day|inv|profit|sales|fill|sku|asin/i.test(k)),
          sample: { sku: r.sku, qty_30: r.qty_30, qty_7: r.qty_7, dynamic_saleday30: r.dynamic_saleday30, net_profit: r.net_profit, profitRate: r.profitRate, seaProfitRate: r.seaProfitRate, fulFillable: r.fulFillable }
        });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `, true, ctxId);

  console.log('\n结果:', result);
  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
