// click_and_capture.js — 注入拦截器 + 点击查询 + 等待捕获
const WebSocket = require('ws');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';

async function run() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
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

  // 注入拦截器
  await eval_(`
    window.__invCaptures2 = [];
    const origFetch = window.__origFetch2 || window.fetch;
    window.__origFetch2 = origFetch;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const resp = await origFetch.call(this, input, init);
      if (url.includes('/pm/formal/list')) {
        resp.clone().json().then(d => window.__invCaptures2.push({ json: d, body: init?.body })).catch(()=>{});
      }
      return resp;
    };
    const origXHROpen = XMLHttpRequest.prototype.__origOpen2 || XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.__origSend2 || XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.__origOpen2 = origXHROpen;
    XMLHttpRequest.prototype.__origSend2 = origXHRSend;
    XMLHttpRequest.prototype.open = function(m, url, ...r) {
      this.__iurl2 = String(url || '');
      return origXHROpen.call(this, m, url, ...r);
    };
    XMLHttpRequest.prototype.send = function(body) {
      if (this.__iurl2 && this.__iurl2.includes('/pm/formal/list')) {
        this.addEventListener('load', () => {
          try { window.__invCaptures2.push({ json: JSON.parse(this.responseText), body }); } catch(e) {}
        }, { once: true });
      }
      return origXHRSend.call(this, body);
    };
    "patched";
  `);
  console.log('拦截器已注入');

  // 找并点击查询按钮
  const btnInfo = await eval_(`
    const btns = [...document.querySelectorAll('button, .el-button, input[type=submit]')];
    const found = btns.find(b => /查询|搜索|确定|Search/.test(b.textContent || b.value || ''));
    if (found) { found.click(); found.textContent || found.value; }
    else btns.slice(0,5).map(b => b.textContent?.trim()).join(' | ');
  `);
  console.log('按钮点击结果:', btnInfo);

  // 等待捕获
  let raw = null;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    const len = await eval_('window.__invCaptures2.length');
    if (len > 0) {
      raw = JSON.parse(await eval_('JSON.stringify(window.__invCaptures2[0])') || 'null');
      break;
    }
  }

  if (!raw) { console.log('30秒内未捕获到请求'); ws.close(); return; }

  const getList = d => (
    Array.isArray(d?.data?.list)    ? d.data.list    :
    Array.isArray(d?.data?.records) ? d.data.records :
    Array.isArray(d?.data)          ? d.data         :
    Array.isArray(d?.list)          ? d.list         : []
  );

  const rows = getList(raw.json);
  console.log(`\n捕获 ${rows.length} 条，total=${raw.json?.count || raw.json?.total}`);

  if (rows[0]) {
    const r = rows[0];
    const fields = ['sku','qty_3','qty_7','qty_30','dynamic_saleday30','sales_day_30','fulFillable','inventory_amount','net_profit','busy_net_profit','profitRate','seaProfitRate','asin','salesChannel'];
    console.log('\n第一行关键字段:');
    for (const f of fields) console.log(`  ${f} = ${JSON.stringify(r[f])}`);
    console.log('\n含 qty/day/inv/profit/sales 的字段:', Object.keys(r).filter(k => /qty|day|inv|profit|sales|fill/i.test(k)));
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
