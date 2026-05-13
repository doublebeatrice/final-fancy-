#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  OUTPUT_DIR,
  ensureDiscoveryDirs,
  isSafeReadActionText,
  makeOutputName,
  readJson,
  safeFilePart,
  sanitizeObject,
  todayYmd,
  writeJson,
} = require('../lib/common');
const { cdpSession, listTabs, openTab } = require('../lib/cdp');
const { extractEndpointCandidates } = require('../lib/probe_analysis');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function latestRoutesFile() {
  if (!fs.existsSync(OUTPUT_DIR)) return '';
  return fs.readdirSync(OUTPUT_DIR)
    .filter(name => /^routes_.*\.json$/.test(name))
    .map(name => path.join(OUTPUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function resolveRoute() {
  const url = arg('--url');
  if (url) return { routeId: safeFilePart(url), url, routeName: url };
  const routeId = arg('--route-id');
  if (!routeId) throw new Error('Usage: node discovery/scripts/probe_report_page.js --url <url> OR --route-id <routeId>');
  const routesFile = arg('--routes') || latestRoutesFile();
  const routes = readJson(routesFile, {});
  const found = (routes.routes || []).find(route => route.routeId === routeId || safeFilePart(route.routeId) === safeFilePart(routeId));
  if (!found?.url) throw new Error(`route not found or has no URL: ${routeId}`);
  return { routeId: found.routeId, routeName: found.visibleText || found.routeId, url: found.url, source: found.source };
}

function pageInspectExpression(clickSafeQuery) {
  return `(() => {
    const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const columns = [];
    document.querySelectorAll('th,[role=columnheader],.el-table__header-wrapper th,.layui-table-header th').forEach(el => {
      const label = clean(el.innerText || el.textContent);
      const field = el.getAttribute('data-field') || el.getAttribute('prop') || el.getAttribute('property') || '';
      if (label || field) columns.push({ label, field });
    });
    const buttons = [...document.querySelectorAll('button,a,input,[role=button]')].map(el => ({
      tag: el.tagName,
      text: clean(el.innerText || el.value || el.textContent || el.getAttribute('aria-label')),
      type: el.getAttribute('type') || '',
    })).filter(item => item.text);
    const safeTexts = ${JSON.stringify(['查询', '搜索', '刷新', '筛选', '查看', '加载', '获取', 'Search', 'Query', 'Refresh', 'Filter', 'View', 'Load'])};
    const danger = /保存|提交|确认|删除|导入|导出写入|批量|新建|编辑|修改|执行|提报|审核通过|驳回|approve|submit|save|delete|remove|import|batch|create|edit|execute/i;
    let clicked = null;
    if (${JSON.stringify(!!clickSafeQuery)}) {
      const candidate = [...document.querySelectorAll('button,a,input,[role=button]')].find(el => {
        const text = clean(el.innerText || el.value || el.textContent || el.getAttribute('aria-label'));
        return text && !danger.test(text) && safeTexts.includes(text);
      });
      if (candidate) {
        clicked = clean(candidate.innerText || candidate.value || candidate.textContent || candidate.getAttribute('aria-label'));
        candidate.click();
      }
    }
    return { title: document.title, url: location.href, columns, buttons, clicked };
  })()`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  ensureDiscoveryDirs();
  process.env.READ_ONLY = process.env.READ_ONLY || '1';
  const route = resolveRoute();
  const clickSafeQuery = hasFlag('--click-safe-query');
  if (clickSafeQuery && !isSafeReadActionText('查询')) throw new Error('safe action configuration invalid');
  const opened = await openTab('about:blank');
  const tabs = await listTabs();
  const tab = tabs.find(item => item.id === opened.id) || opened;
  const session = cdpSession(tab);
  const requests = new Map();
    await session.ready();
  try {
    await session.send('Network.enable');
    session.events.length = 0;
    await session.send('Page.navigate', { url: route.url });
    await sleep(Number(arg('--settle-ms', '2500')));
    const page = await session.send('Runtime.evaluate', {
      expression: pageInspectExpression(clickSafeQuery),
      returnByValue: true,
      awaitPromise: false,
    });
    await sleep(Number(arg('--listen-ms', '4000')));
    for (const event of session.events) {
      if (event.method === 'Network.requestWillBeSent') {
        const req = event.params.request || {};
        requests.set(event.params.requestId, {
          requestId: event.params.requestId,
          url: req.url,
          method: req.method,
          resourceType: event.params.type,
          postData: req.postData || '',
        });
      }
      if (event.method === 'Network.responseReceived' && requests.has(event.params.requestId)) {
        const item = requests.get(event.params.requestId);
        item.status = event.params.response?.status;
        item.mimeType = event.params.response?.mimeType || '';
      }
    }
    const bodySamples = [];
    const endpointMap = new Map();
    const bodyEligible = [...requests.values()].filter(item => {
      if (/^data:/i.test(item.url || '')) return false;
      if (/font|image|stylesheet/i.test(item.resourceType || '')) return false;
      if (/\.(?:png|jpg|jpeg|gif|svg|woff2?|ttf|ico|css)(?:[?#].*)?$/i.test(item.url || '')) return false;
      return /XHR|Fetch|Document|Script/i.test(item.resourceType || '') || /json|javascript|html/i.test(item.mimeType || '');
    });
    for (const request of bodyEligible.slice(0, Number(arg('--body-limit', '80')))) {
      try {
        const body = await session.send('Network.getResponseBody', { requestId: request.requestId });
        const fullText = body.base64Encoded ? '' : String(body.body || '');
        const text = fullText.slice(0, 20000);
        for (const endpoint of extractEndpointCandidates(fullText.slice(0, 200000))) {
          const key = `${endpoint.method}::${endpoint.path}`;
          if (!endpointMap.has(key)) endpointMap.set(key, { ...endpoint, from: request.url });
        }
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        bodySamples.push({
          requestId: request.requestId,
          url: request.url,
          status: request.status,
          jsonKeys: json && typeof json === 'object' ? Object.keys(json).slice(0, 40) : [],
          endpointCandidateCount: extractEndpointCandidates(fullText.slice(0, 200000)).length,
          sample: json || text.slice(0, 2000),
        });
      } catch (error) {
        bodySamples.push({ requestId: request.requestId, url: request.url, error: error.message });
      }
    }
    const outputFile = path.join(OUTPUT_DIR, makeOutputName('report_probe', route.routeId, todayYmd()));
    writeJson(outputFile, sanitizeObject({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      route,
      page: page.result?.value || {},
      networkSummary: {
        requestCount: requests.size,
        sampleBodyCount: bodySamples.length,
        endpointCandidateCount: endpointMap.size,
      },
      requests: [...requests.values()],
      bodySamples,
      endpointCandidates: [...endpointMap.values()],
    }));
    console.log(outputFile);
  } finally {
    session.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
