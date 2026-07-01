#!/usr/bin/env node
'use strict';

const { listTabs, evaluate } = require('../discovery/lib/cdp');

(async () => {
  const tabs = await listTabs('http://127.0.0.1:9222');
  const shell = tabs.find(t => t.type === 'page' && t.url === 'https://sellerinventory.yswg.com.cn/');
  if (!shell) { console.error('No sellerinventory shell'); process.exit(1); }

  const code = `(async () => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const af = frames.filter(f => f.src && f.src.includes('product_id=2447251')).sort((a, b) => parseInt((b.src.match(/tempid=(\\\\d+)/)||[0,0])[1]) - parseInt((a.src.match(/tempid=(\\\\d+)/)||[0,0])[1]))[0];
    if (!af || !af.contentDocument) return JSON.stringify({error: 'no frame'});
    const doc = af.contentDocument;
    const win = af.contentWindow;

    const setVal = (name, value) => {
      const el = doc.querySelector('[name="' + name + '"]');
      if (!el) return null;
      const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      return el.value.length;
    };

    const results = {};

    // Fix title: "for Kids" -> "for Boys Girls"
    const titleEl = doc.querySelector('[name="title_en_file_audit"]');
    let newTitle = titleEl.value.replace(/for Kids/g, 'for Boys Girls');
    results.title = setVal('title_en_file_audit', newTitle);

    // Fix bullets
    for (let i = 0; i < 5; i++) {
      const el = doc.querySelector('[name="bullet_points[' + i + ']"]');
      if (!el) continue;
      let v = el.value;
      const orig = v;
      v = v.replace(/children s/gi, "boys and girls'");
      v = v.replace(/children/gi, 'boys and girls');
      v = v.replace(/\\bkids\\b/gi, 'boys girls');
      v = v.replace(/\\btoddler\\b/gi, 'little ones');
      if (v !== orig) {
        results['bullet' + i] = setVal('bullet_points[' + i + ']', v);
      }
    }

    // Fix PD
    const pdEl = doc.querySelector('[name="product_description"]');
    let newPD = pdEl.value;
    newPD = newPD.replace(/for kids/gi, 'for boys and girls');
    newPD = newPD.replace(/safe for boys and girls/gi, 'safe for boys and girls');
    newPD = newPD.replace(/children under 3/gi, 'those under 3');
    newPD = newPD.replace(/young children/gi, 'little ones');
    newPD = newPD.replace(/\\bkids\\b/gi, 'boys and girls');
    results.pd = setVal('product_description', newPD);

    return JSON.stringify(results);
  })()`;

  const result = await evaluate(shell, code, true);
  console.log(result);
})().catch(e => { console.error(e.message); process.exit(1); });
