#!/usr/bin/env node
'use strict';

const { listTabs, evaluate } = require('../discovery/lib/cdp');
const WebSocket = require('ws');

(async () => {
  const tabs = await listTabs('http://127.0.0.1:9222');
  const shell = tabs.find(t => t.type === 'page' && t.url === 'https://sellerinventory.yswg.com.cn/');
  if (!shell) { console.error('No sellerinventory shell'); process.exit(1); }

  const ws = new WebSocket(shell.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let id = 1;
  const send = (method, params = {}) => new Promise(resolve => {
    const myId = id++;
    ws.send(JSON.stringify({ id: myId, method, params }));
    const handler = msg => {
      const d = JSON.parse(msg);
      if (d.id === myId) { ws.off('message', handler); resolve(d.result || d); }
    };
    ws.on('message', handler);
  });

  await send('Network.enable');
  const reqs = [];
  ws.on('message', msg => {
    const d = JSON.parse(msg);
    if (d.method === 'Network.requestWillBeSent' && d.params.request.url.includes('yswg'))
      reqs.push(d.params.request.url.substring(0, 100));
  });

  // Apply patches
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const af = frames.filter(f => f.src && f.src.includes('product_id=2447251')).sort((a, b) => parseInt((b.src.match(/tempid=(\\\\d+)/)||[0,0])[1]) - parseInt((a.src.match(/tempid=(\\\\d+)/)||[0,0])[1]))[0];
      const win = af.contentWindow;
      win.product_label_new = '无';
      if (!win.productLabelNewEdition) win.productLabelNewEdition = { renderData: null };
      if (win.jQuery && win.jQuery.ajax) {
        const orig = win.jQuery.ajax.__orig || win.jQuery.ajax;
        win.jQuery.ajax = function(o) {
          if (o && o.url && o.url.includes('checkBrandExists')) {
            o.url = o.url.replace(/brand=(&|$)/, 'brand=Lenwen$1');
          }
          return orig.apply(this, arguments);
        };
        win.jQuery.ajax.__orig = orig;
      }
      return 'ok';
    })()`,
    returnByValue: true,
    awaitPromise: true
  });

  // Click save
  await send('Runtime.evaluate', {
    expression: `(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const af = frames.filter(f => f.src && f.src.includes('product_id=2447251')).sort((a, b) => parseInt((b.src.match(/tempid=(\\\\d+)/)||[0,0])[1]) - parseInt((a.src.match(/tempid=(\\\\d+)/)||[0,0])[1]))[0];
      af.contentDocument.querySelector('.main_submit_btn').click();
      return 'clicked';
    })()`,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 3000));

  // Confirm CPC dialog
  await send('Runtime.evaluate', {
    expression: `(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const af = frames.filter(f => f.src && f.src.includes('product_id=2447251')).sort((a, b) => parseInt((b.src.match(/tempid=(\\\\d+)/)||[0,0])[1]) - parseInt((a.src.match(/tempid=(\\\\d+)/)||[0,0])[1]))[0];
      const doc = af.contentDocument;
      const btn = doc.querySelector('.layui-layer-btn0');
      if (btn) { btn.click(); return 'confirmed'; }
      return 'no dialog';
    })()`,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 10000));
  const saved = reqs.filter(u => u.includes('audit_new') || u.includes('checkBrand'));
  console.log(saved.length > 0 ? 'SAVED: ' + saved.join(', ') : 'NOT SAVED');
  ws.close();
})().catch(e => { console.error(e.message); process.exit(1); });
