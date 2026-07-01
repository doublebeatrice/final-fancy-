#!/usr/bin/env node
'use strict';
const { listTabs } = require('../discovery/lib/cdp');
const WebSocket = require('ws');

(async () => {
  const tabs = await listTabs('http://127.0.0.1:9222');
  const shell = tabs.find(t => t.type === 'page' && t.url === 'https://sellerinventory.yswg.com.cn/');
  if (!shell) { console.error('No shell'); process.exit(1); }

  const ws = new WebSocket(shell.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let id = 1;
  const send = (method, params = {}) => new Promise(resolve => {
    const myId = id++;
    ws.send(JSON.stringify({ id: myId, method, params }));
    const h = msg => { const d = JSON.parse(msg); if (d.id === myId) { ws.off('message', h); resolve(d.result || d); } };
    ws.on('message', h);
  });

  const newTitle = 'Pinkunn 6 Pack Half Round Floating Shelves, Small Wall Mounted Shelf Set (3 Pcs 8 Inch + 3 Pcs 10 Inch), Rustic Solid Wood Semicircle Shelves for Bedroom Living Room Bathroom Kitchen Office Decor';
  const titleB64 = Buffer.from(newTitle, 'utf8').toString('base64');

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const af = frames.find(f => f.src && f.src.includes('product_id=2506352'));
      if (!af) return 'no frame';
      const doc = af.contentDocument;
      const win = af.contentWindow;
      const el = doc.querySelector('[name="title_en_file_audit"]');
      if (!el) return 'no title field';
      const title = atob('${titleB64}');
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
      setter.call(el, title);
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      return 'title updated, len=' + el.value.length;
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  console.log(res.result ? res.result.value : JSON.stringify(res));
  ws.close();
})().catch(e => { console.error(e.message); process.exit(1); });
