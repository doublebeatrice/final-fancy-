#!/usr/bin/env node
const path = require('path');
const {
  OUTPUT_DIR,
  ensureDiscoveryDirs,
  makeOutputName,
  normalizeRouteEntry,
  todayYmd,
  writeJson,
} = require('../lib/common');
const { listTabs, evaluate } = require('../lib/cdp');

function routeScanExpression(source) {
  return `(() => {
    const rows = [];
    const push = (el) => {
      const text = (el.innerText || el.textContent || el.value || '').replace(/\\s+/g, ' ').trim();
      const attrs = {};
      for (const attr of el.attributes || []) attrs[attr.name] = attr.value;
      if (!text && !attrs.href && !attrs['lay-href'] && !attrs['data-routeid']) return;
      rows.push({ source: ${JSON.stringify(source)}, tag: el.tagName, text, attrs });
    };
    document.querySelectorAll('a,button,li,[role=menuitem],[lay-href],[data-routeid]').forEach(push);
    return { title: document.title, url: location.href, rows };
  })()`;
}

async function main() {
  ensureDiscoveryDirs();
  const date = todayYmd();
  const tabs = await listTabs();
  const targetTabs = tabs.filter(tab => /adv\.yswg\.com\.cn|sellerinventory\.yswg\.com\.cn/.test(String(tab.url || '')));
  const pages = [];
  const routes = [];
  for (const tab of targetTabs) {
    const source = String(tab.url || '').includes('adv.yswg.com.cn') ? 'adv' : 'sellerinventory';
    try {
      const result = await evaluate(tab, routeScanExpression(source));
      pages.push({ source, title: result?.title || tab.title || '', url: result?.url || tab.url || '' });
      for (const row of result?.rows || []) {
        const normalized = normalizeRouteEntry(row);
        if (!normalized.visibleText && !normalized.url && !normalized.routeId) continue;
        routes.push(normalized);
      }
    } catch (error) {
      pages.push({ source, title: tab.title || '', url: tab.url || '', error: error.message });
    }
  }
  const unique = [];
  const seen = new Set();
  for (const route of routes) {
    const key = `${route.source}::${route.routeId}::${route.visibleText}::${route.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
  }
  const outputFile = path.join(OUTPUT_DIR, makeOutputName('routes', '', date));
  writeJson(outputFile, {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pages,
    routeCount: unique.length,
    routes: unique,
  });
  console.log(outputFile);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
