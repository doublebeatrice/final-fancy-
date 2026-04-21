// trigger_iframe.js — 在 iframe 上下文里触发查询并捕获数据
const WebSocket = require('ws');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';
const IFRAME_CTX = 11;

async function run() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  send({ id: 1, method: 'Runtime.enable', params: {} });
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

  // 注入拦截器
  await eval_(`
    window.__inv4 = [];
    const of4 = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const resp = await of4.call(this, input, init);
      resp.clone().json().then(d => {
        if (d && typeof d === 'object' && Object.keys(d).length > 1)
          window.__inv4.push({ url, body: init?.body, json: d });
      }).catch(()=>{});
      return resp;
    };
    const ox4 = XMLHttpRequest.prototype.open;
    const os4 = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, url, ...r) { this.__u4 = url; return ox4.call(this, m, url, ...r); };
    XMLHttpRequest.prototype.send = function(body) {
      this.addEventListener('load', () => {
        try {
          const d = JSON.parse(this.responseText);
          if (d && Object.keys(d).length > 1) window.__inv4.push({ url: this.__u4, body, json: d });
        } catch(e) {}
      }, { once: true });
      return os4.call(this, body);
    };
    "ok"
  `, false, IFRAME_CTX);
  console.log('拦截器注入完成');

  // 找按钮
  const btns = await eval_(`
    JSON.stringify([...document.querySelectorAll('button,.el-button,input[type=button],input[type=submit]')]
      .map(b => ({ text: (b.textContent||b.value||'').trim().slice(0,30), tag: b.tagName, cls: b.className.slice(0,40) }))
      .slice(0,20))
  `, false, IFRAME_CTX);
  console.log('按钮列表:', btns);

  // 尝试点击查询
  const clicked = await eval_(`
    const q = document.querySelector('input.search_btn') ||
              [...document.querySelectorAll('button,.el-button,input[type=button],input[type=submit]')]
                .find(b => /^查询$/.test((b.textContent||b.value||'').trim()));
    if (q) { q.click(); (q.textContent||q.value||'').trim(); }
    else '未找到查询按钮';
  `, false, IFRAME_CTX);
  console.log('点击结果:', clicked);

  // 等待捕获
  console.log('等待请求...');
  for (let i = 0; i < 40; i++) {
    await wait(500);
    const len = await eval_('window.__inv4.length', false, IFRAME_CTX);
    if (len > 0) {
      const raw = JSON.parse(await eval_('JSON.stringify(window.__inv4[0])', false, IFRAME_CTX) || 'null');
      const rows = raw?.json?.data?.list || raw?.json?.data?.records || raw?.json?.data || raw?.json?.list || [];
      console.log(`\n捕获到！URL=${raw.url} rows=${rows.length} total=${raw.json?.count||raw.json?.total}`);
      if (rows[0]) {
        const r = rows[0];
        const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','sales_day_30','fulFillable','net_profit','busy_net_profit','profitRate','seaProfitRate','asin','salesChannel'];
        console.log('\n第一行关键字段:');
        for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
        console.log('\n含 qty/day/profit/sales 的字段:', Object.keys(r).filter(k => /qty|day|profit|sales|fill/i.test(k)));
      }
      break;
    }
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
