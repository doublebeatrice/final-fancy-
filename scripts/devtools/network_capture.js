// network_capture.js — 用 CDP Network 监听库存请求
const WebSocket = require('ws');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';
const IFRAME_CTX = 11;

async function run() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  // 收集网络响应
  const responses = {};
  const bodies = {};

  ws.on('message', async data => {
    const r = JSON.parse(data);
    if (r.method === 'Network.responseReceived') {
      const url = r.params.response?.url || '';
      if (url.includes('formal') || url.includes('/pm/')) {
        responses[r.params.requestId] = { url, status: r.params.response.status };
      }
    }
    if (r.method === 'Network.loadingFinished') {
      if (responses[r.params.requestId]) {
        // 获取响应体
        const id2 = Math.floor(Math.random() * 100000);
        ws.send(JSON.stringify({ id: id2, method: 'Network.getResponseBody', params: { requestId: r.params.requestId } }));
      }
    }
    if (r.id && responses[Object.keys(responses).find(k => k)]) {
      // 可能是 getResponseBody 的响应
    }
  });

  // 启用 Network
  send({ id: 1, method: 'Network.enable', params: {} });
  send({ id: 2, method: 'Runtime.enable', params: {} });
  await wait(500);

  const eval_ = (expr, awaitPromise, ctxId) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result?.result?.value); }
    };
    ws.on('message', h);
    const params = { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise };
    if (ctxId) params.contextId = ctxId;
    send({ id, method: 'Runtime.evaluate', params });
  });

  // 收集 getResponseBody 结果
  const capturedBodies = [];
  ws.on('message', data => {
    const r = JSON.parse(data);
    if (r.result?.body) {
      try {
        const json = JSON.parse(r.result.body);
        if (json && typeof json === 'object' && Object.keys(json).length > 1) {
          capturedBodies.push(json);
        }
      } catch(e) {}
    }
  });

  // 点击查询按钮
  const clicked = await eval_(`
    const q = document.querySelector('input.search_btn');
    if (q) { q.click(); 'clicked'; } else '未找到';
  `, false, IFRAME_CTX);
  console.log('查询按钮:', clicked);

  // 等待网络请求
  console.log('等待网络请求 (10s)...');
  await wait(10000);

  console.log('\n捕获到的 /pm/ 请求:', Object.values(responses));
  console.log('响应体数量:', capturedBodies.length);

  if (capturedBodies.length > 0) {
    const d = capturedBodies[0];
    const rows = d?.data?.list || d?.data?.records || d?.data || d?.list || [];
    console.log(`rows=${rows.length} total=${d?.count||d?.total}`);
    if (rows[0]) {
      const r = rows[0];
      const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','sales_day_30','fulFillable','net_profit','busy_net_profit','profitRate','seaProfitRate','asin'];
      console.log('\n第一行关键字段:');
      for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
      console.log('\n含 qty/day/profit/sales 的字段:', Object.keys(r).filter(k => /qty|day|profit|sales|fill/i.test(k)));
    }
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
