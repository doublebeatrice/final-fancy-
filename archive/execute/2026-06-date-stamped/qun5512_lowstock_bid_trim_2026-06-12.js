const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  normalizeLowEfficiencyRow,
  buildWriterRequest,
} = require('../../src/low_efficiency_decision');

const ROOT = path.join(__dirname, '..', '..');
const ACTION_DATE = '2026-06-12';
const EXECUTE = process.argv.includes('--execute');
const OUT = path.join(
  ROOT,
  'data',
  'actions',
  `qun5512_lowstock_bid_trim_${EXECUTE ? 'execute' : 'dryrun'}_${ACTION_DATE}.json`
);

const SOURCES = [
  {
    label: 'owned_auto',
    kind: 'spAuto',
    file: path.join(ROOT, 'data', 'snapshots', 'ad_group_rows_QUN5512_auto_before_lowstock_bidtrim_2026-06-12.json'),
    suggestedBid: 0.22,
  },
  {
    label: 'owned_broad_keyword',
    kind: 'spKeyword',
    file: path.join(ROOT, 'data', 'snapshots', 'ad_group_rows_QUN5512_keyword_before_lowstock_bidtrim_2026-06-12.json'),
    suggestedBid: 0.24,
  },
  {
    label: 'owned_asin_expanded',
    kind: 'spTarget',
    file: path.join(ROOT, 'data', 'snapshots', 'ad_group_rows_QUN5512_asin_expanded_before_lowstock_bidtrim_2026-06-12.json'),
    suggestedBid: 0.20,
  },
  {
    label: 'owned_asin_exact',
    kind: 'spTarget',
    file: path.join(ROOT, 'data', 'snapshots', 'ad_group_rows_QUN5512_asin_exact_before_lowstock_bidtrim_2026-06-12.json'),
    suggestedBid: 0.20,
  },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function evalInTab(ws, expression, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 10000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, timeoutMs);
    const handler = data => {
      let response;
      try { response = JSON.parse(data); } catch (_) { return; }
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) reject(new Error(JSON.stringify(response.error)));
      else resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

async function withAdvWs(callback) {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('adv.yswg.com.cn tab not found on port 9222');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  try {
    return await callback(ws);
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

async function advRequest(ws, method, pathname, payload) {
  const expr = `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const res = await fetch(${JSON.stringify(pathname)}, {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return JSON.stringify({ status: res.status, ok: res.ok, json: json || { msg: text.slice(0, 1000) } });
  })()`;
  return JSON.parse(await evalInTab(ws, expr) || '{}');
}

function entityLabel(row = {}) {
  return row.keywordText || row.type || row.targetText || row.targetType || row.text || '';
}

function loadPlan() {
  const actions = [];
  for (const source of SOURCES) {
    const snapshot = readJson(source.file);
    for (const row of snapshot.targetRows || []) {
      const entity = normalizeLowEfficiencyRow(source.kind, row);
      const currentBid = Number(entity.bid || 0);
      if (!currentBid || currentBid <= source.suggestedBid) continue;
      const request = buildWriterRequest(entity, {
        actionType: 'bid',
        suggestedBid: source.suggestedBid,
      });
      actions.push({
        sku: 'QUN5512',
        source: source.label,
        kind: source.kind,
        id: entity.id,
        label: entityLabel(row),
        campaignId: entity.campaignId,
        adGroupId: entity.adGroupId,
        currentBid,
        suggestedBid: source.suggestedBid,
        request,
      });
    }
  }
  return actions;
}

async function main() {
  const actions = loadPlan();
  const result = {
    ok: true,
    mode: EXECUTE ? 'execute' : 'dry-run',
    businessDate: ACTION_DATE,
    exportedAt: new Date().toISOString(),
    evidenceBoundary: 'live ad rows fetched before execution; operator/developer provided low-FBA-stock constraint; GBrain used for owned-vs-system boundary',
    scope: 'QUN5512 owned campaigns only; system-created campaigns excluded; budget and state unchanged',
    rationale: 'Low FBA stock but replenishment will follow orders, so keep learning traffic open while trimming bid intensity.',
    actions: actions.map(action => ({
      sku: action.sku,
      source: action.source,
      kind: action.kind,
      id: action.id,
      label: action.label,
      campaignId: action.campaignId,
      adGroupId: action.adGroupId,
      currentBid: action.currentBid,
      suggestedBid: action.suggestedBid,
      requestUrl: action.request.url,
      dryRun: !EXECUTE,
    })),
  };

  if (EXECUTE) {
    await withAdvWs(async ws => {
      for (const action of result.actions) {
        const sourceAction = actions.find(item => item.id === action.id);
        const response = await advRequest(ws, sourceAction.request.method, sourceAction.request.url, sourceAction.request.body);
        action.response = response;
        action.ok = response.ok && Number(response.json?.code) === 200;
      }
    });
    result.ok = result.actions.every(action => action.ok);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile: OUT,
    ok: result.ok,
    mode: result.mode,
    plannedActions: result.actions.length,
    bySource: result.actions.reduce((acc, action) => {
      acc[action.source] = (acc[action.source] || 0) + 1;
      return acc;
    }, {}),
    failed: result.actions.filter(action => action.ok === false).map(action => ({
      source: action.source,
      id: action.id,
      label: action.label,
      response: action.response,
    })),
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
