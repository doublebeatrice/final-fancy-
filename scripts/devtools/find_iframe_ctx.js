// find_iframe_ctx.js — 找 iframe 上下文并注入拦截器
const WebSocket = require('ws');

const INV_TAB = 'ACB0046D7D5E5681147F749CCD828BC5';

async function run() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + INV_TAB);
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  const contexts = [];
  ws.on('message', data => {
    const r = JSON.parse(data);
    if (r.method === 'Runtime.executionContextCreated') contexts.push(r.params.context);
  });
  send({ id: 1, method: 'Runtime.enable', params: {} });
  await wait(1000);

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

  // 每个上下文里检查 location.href
  for (const ctx of contexts) {
    const href = await eval_('location.href', false, ctx.id);
    const hasVue = await eval_('typeof Vue !== "undefined" || typeof __vue_app__ !== "undefined"', false, ctx.id);
    console.log(`ctx ${ctx.id}: ${href} | hasVue=${hasVue}`);
  }

  // 在每个上下文里注入拦截器
  for (const ctx of contexts) {
    await eval_(`
      if (!window.__inv3) {
        window.__inv3 = [];
        const of2 = window.fetch;
        window.fetch = async function(input, init) {
          const url = typeof input === 'string' ? input : (input?.url || '');
          const resp = await of2.call(this, input, init);
          if (url.includes('formal') || url.includes('list') || url.includes('pm/')) {
            resp.clone().text().then(t => {
              if (t.trim().startsWith('{')) window.__inv3.push({ url, body: init?.body, text: t.slice(0,500) });
            }).catch(()=>{});
          }
          return resp;
        };
        const ox = XMLHttpRequest.prototype.open;
        const os = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(m, url, ...r) { this.__u3 = url; return ox.call(this, m, url, ...r); };
        XMLHttpRequest.prototype.send = function(body) {
          if (this.__u3) {
            this.addEventListener('load', () => {
              if (this.responseText?.trim().startsWith('{')) window.__inv3.push({ url: this.__u3, body, text: this.responseText.slice(0,500) });
            }, { once: true });
          }
          return os.call(this, body);
        };
      }
    `, false, ctx.id);
  }
  console.log('\n拦截器已注入所有上下文，等待请求 (15s)...');

  // 等待捕获
  await wait(15000);

  for (const ctx of contexts) {
    const captures = JSON.parse(await eval_('JSON.stringify(window.__inv3 || [])', false, ctx.id) || '[]');
    if (captures.length) {
      console.log(`\nctx ${ctx.id} 捕获到 ${captures.length} 条:`);
      captures.forEach(c => console.log('  URL:', c.url, '\n  Body:', c.body, '\n  Response:', c.text));
    }
  }

  ws.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
