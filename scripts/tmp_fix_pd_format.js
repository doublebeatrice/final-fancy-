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

  const pdLines = [
    '</br>Features:',
    '</br>6 pack half round floating shelves in 2 sizes (8 inch and 10 inch) for versatile wall display',
    '</br>Made from natural solid pine wood with carbonized torched finish for rustic appeal',
    '</br>Semicircle design saves space while adding decorative charm to any room',
    '</br>Smooth sanded edges and sturdy construction for safe, long-lasting use',
    '</br>Suitable for living room, bedroom, bathroom, kitchen, office, and hallway',
    '</br>',
    '</br>Specifications:',
    '</br>Material: Solid Pine Wood',
    '</br>Color: Carbonized Brown (Torched)',
    '</br>Shape: Half Round / Semicircle',
    '</br>Size: 8 Inch x 3 Pcs + 10 Inch x 3 Pcs',
    '</br>Total Quantity: 6 Pieces',
    '</br>Mounting: Wall Mounted with Screws',
    '</br>',
    '</br>Package includes:',
    '</br>3 x 8-Inch Half Round Floating Shelf',
    '</br>3 x 10-Inch Half Round Floating Shelf',
    '</br>6 x Sets of Mounting Hardware (Screws and Anchors)',
    '</br>',
    '</br>Notes:',
    '</br>Manual measurement, please allow slight errors on size.',
    '</br>The color may exist a slight difference due to different screen displays.',
    '</br>',
  ];
  const pd = pdLines.join('\n');
  const pdB64 = Buffer.from(pd, 'utf8').toString('base64');

  const expr = `(async () => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const af = frames.find(f => f.src && f.src.includes('product_id=2506352'));
    if (!af) return 'no frame';
    const doc = af.contentDocument;
    const win = af.contentWindow;
    const el = doc.querySelector('[name="product_description"]');
    if (!el) return 'no pd field';
    const pd = atob('${pdB64}');
    const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, pd);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    return 'pd len=' + el.value.length + ' lines=' + el.value.split('\\n').length;
  })()`;

  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(res.result ? res.result.value : JSON.stringify(res));
  ws.close();
})().catch(e => { console.error(e.message); process.exit(1); });
