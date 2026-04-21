// layui_trigger.js — 用 layui API 或 dispatchEvent 触发查询
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
    if (r.method === 'Network.loadingFinished') {
      send({ id: Math.floor(Math.random()*100000), method: 'Network.getResponseBody', params: { requestId: r.params.requestId } });
    }
  });

  send({ id: 1, method: 'Runtime.enable', params: {} });
  send({ id: 2, method: 'Network.enable', params: {} });
  await wait(1000);

  const iframeCtxId = contexts.find(c => c.origin?.includes('sellerinventory'))?.id || contexts[0]?.id;

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

  // 探测 layui 和可用的触发方式
  const probe = await eval_(`JSON.stringify({
    hasLayui: typeof layui !== 'undefined',
    hasTable: typeof layui !== 'undefined' && !!layui.table,
    tableIds: typeof layui !== 'undefined' && layui.table ? Object.keys(layui.table.cache || {}) : [],
    searchBtnOnclick: document.querySelector('input.search_btn')?.onclick?.toString()?.slice(0,100),
    formAction: document.querySelector('form')?.action,
    formId: document.querySelector('form')?.id,
  })`, iframeCtxId);
  console.log('探测结果:', probe);

  // 尝试多种触发方式
  const result = await eval_(`
    (() => {
      // 方式1: dispatchEvent
      const btn = document.querySelector('input.search_btn');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      // 方式2: layui table reload
      if (typeof layui !== 'undefined' && layui.table) {
        const ids = Object.keys(layui.table.cache || {});
        if (ids.length) { layui.table.reload(ids[0]); return 'layui.table.reload:' + ids[0]; }
      }

      // 方式3: 找 form submit
      const form = document.querySelector('form');
      if (form) { form.dispatchEvent(new Event('submit', { bubbles: true })); return 'form submit'; }

      return 'dispatched click';
    })()
  `, iframeCtxId);
  console.log('触发方式:', result);

  console.log('等待网络响应 (10s)...');
  await wait(10000);

  const inv = capturedBodies.find(d => d?.data || d?.list || d?.count);
  if (inv) {
    const rows = inv?.data?.list || inv?.data?.records || inv?.data || inv?.list || [];
    console.log(`捕获 rows=${rows.length} total=${inv?.count||inv?.total}`);
    if (rows[0]) {
      const r = rows[0];
      const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','net_profit','profitRate','seaProfitRate','fulFillable','salesChannel'];
      for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
      console.log('含 qty/day/profit 的字段:', Object.keys(r).filter(k => /qty|day|profit|sales|fill/i.test(k)));
    }
  } else {
    console.log('未捕获到响应，capturedBodies:', capturedBodies.length);
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
